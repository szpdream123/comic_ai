import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { validateGeoDraft } from "./geo-content-validator.ts";
import type { GeoContentType, GeoDocument, GeoEvidenceSnapshot, GeoQualityReport } from "./geo-types.ts";

export type GeoServiceResult<T> =
  | { status: 200 | 201; body: { data: T } }
  | { status: 400 | 404 | 409; body: { error: { code: string; message: string } } };

type GeoQuestionRow = {
  id: string; raw_question: string; normalized_question: string; topic: string; intent: string;
  target_platforms_json: string[]; priority: number; product_capabilities_json: string[];
  coverage_status: string; notes: string; last_monitored_at: Date | string | null;
  created_at: Date | string; updated_at: Date | string;
};
type GeoEvidenceRow = {
  id: string; evidence_type: string; name: string; fact_text: string; source_url: string | null;
  collected_at: Date | string; model_name: string | null; model_version: string | null;
  review_status: "pending" | "approved" | "rejected"; valid_until: Date | string | null;
  public_use_allowed: boolean; reviewed_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
};
type GeoItemRow = {
  id: string; content_type: GeoContentType; topic: string; slug: string; status: string;
  current_draft_version_id: string | null; current_published_version_id: string | null;
  redirect_path: string | null; lock_version: number; created_at: Date | string; updated_at: Date | string;
};
type GeoVersionRow = {
  id: string; content_item_id: string; version_number: number; title: string; summary: string;
  document_json: GeoDocument; quality_report_json: GeoQualityReport; config_revision_id: string;
  generation_run_id: string | null; created_at: Date | string; published_at: Date | string | null;
  question_ids?: string[]; evidence_ids?: string[];
};

export function createGeoContentService(deps: { db: SqlDatabase; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());

  async function listQuestions() {
    const result = await deps.db.query<GeoQuestionRow>(
      `SELECT * FROM geo_questions ORDER BY priority DESC, updated_at DESC, id DESC`,
    );
    return ok(result.rows.map(mapQuestion));
  }

  async function saveQuestion(input: {
    id?: string; rawQuestion: string; topic: string; intent: string; targetPlatforms: string[];
    priority: number; productCapabilities: string[]; notes: string; actorAdminAccountId: string;
  }) {
    const rawQuestion = collapseWhitespace(input.rawQuestion);
    const topic = collapseWhitespace(input.topic);
    const intent = collapseWhitespace(input.intent);
    const normalizedQuestion = rawQuestion.toLocaleLowerCase("zh-CN");
    if (!rawQuestion || !topic || !intent || !Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100) {
      return fail(400, "geo_question_invalid", "问题、主题、意图和优先级必须有效。");
    }
    const result = await deps.db.query<GeoQuestionRow>(
      `INSERT INTO geo_questions (
         id, raw_question, normalized_question, topic, intent, target_platforms_json,
         priority, product_capabilities_json, notes, created_by_admin_id, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$11)
       ON CONFLICT (normalized_question) DO UPDATE SET
         raw_question=EXCLUDED.raw_question, topic=EXCLUDED.topic, intent=EXCLUDED.intent,
         target_platforms_json=EXCLUDED.target_platforms_json, priority=EXCLUDED.priority,
         product_capabilities_json=EXCLUDED.product_capabilities_json, notes=EXCLUDED.notes, updated_at=EXCLUDED.updated_at
       RETURNING *`,
      [input.id ?? randomUUID(), rawQuestion, normalizedQuestion, topic, intent, JSON.stringify(uniqueStrings(input.targetPlatforms)), input.priority, JSON.stringify(uniqueStrings(input.productCapabilities)), input.notes.trim(), input.actorAdminAccountId, now()],
    );
    return created(mapQuestion(result.rows[0]!));
  }

  async function listEvidence() {
    const result = await deps.db.query<GeoEvidenceRow>(`SELECT * FROM geo_evidence_items ORDER BY updated_at DESC, id DESC`);
    return ok(result.rows.map(mapEvidence));
  }

  async function saveEvidence(input: {
    id?: string; type: string; name: string; factText: string; sourceUrl: string | null;
    reviewStatus: "pending" | "approved" | "rejected"; validUntil: string | null;
    publicUseAllowed: boolean; actorAdminAccountId: string; modelName?: string | null; modelVersion?: string | null;
  }) {
    if (!input.name.trim() || !input.factText.trim()) return fail(400, "geo_evidence_invalid", "证据名称和事实不能为空。");
    const reviewed = input.reviewStatus === "approved" || input.reviewStatus === "rejected";
    const result = await deps.db.query<GeoEvidenceRow>(
      `INSERT INTO geo_evidence_items (
         id, evidence_type, name, fact_text, source_url, collected_at, model_name, model_version,
         review_status, valid_until, public_use_allowed, reviewed_by_admin_id, reviewed_at,
         created_by_admin_id, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$12,$6,$6)
       RETURNING *`,
      [input.id ?? randomUUID(), input.type, input.name.trim(), input.factText.trim(), input.sourceUrl?.trim() || null, now(), input.modelName ?? null, input.modelVersion ?? null, input.reviewStatus, input.validUntil, input.publicUseAllowed, input.actorAdminAccountId, reviewed ? now() : null],
    );
    return created(mapEvidence(result.rows[0]!));
  }

  async function listContent() {
    const result = await deps.db.query<GeoItemRow>(`SELECT * FROM geo_content_items ORDER BY updated_at DESC, id DESC`);
    return ok(result.rows.map(mapItem));
  }

  async function getContent(contentItemId: string) {
    const itemResult = await deps.db.query<GeoItemRow>(`SELECT * FROM geo_content_items WHERE id=$1`, [contentItemId]);
    const item = itemResult.rows[0];
    if (!item) return fail(404, "geo_content_not_found", "GEO内容不存在。");
    const versions = await deps.db.query<GeoVersionRow>(
      `SELECT version.*,
         ARRAY(SELECT link.question_id::text FROM geo_content_question_links link WHERE link.content_version_id=version.id ORDER BY link.question_id) AS question_ids,
         ARRAY(SELECT link.evidence_id::text FROM geo_content_evidence_links link WHERE link.content_version_id=version.id ORDER BY link.evidence_id) AS evidence_ids
       FROM geo_content_versions version WHERE version.content_item_id=$1 ORDER BY version.version_number DESC`,
      [contentItemId],
    );
    return ok({ item: mapItem(item), versions: versions.rows.map(mapVersion) });
  }

  async function createDraftFromDocument(input: {
    contentItemId?: string; contentType: GeoContentType; topic: string; slug: string;
    expectedLockVersion?: number;
    questionIds: string[]; evidenceIds: string[]; document: GeoDocument; generationRunId: string | null;
    configRevisionId: string; actorAdminAccountId: string; qualityReport?: GeoQualityReport;
    generationCompletion?: { leaseToken: string; providerRequestIds: string[]; usage: Record<string, unknown> };
  }) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || !input.topic.trim()) {
      return fail(400, "geo_content_invalid", "主题和英文短链必须有效。");
    }
    if (input.expectedLockVersion !== undefined && (!Number.isInteger(input.expectedLockVersion) || input.expectedLockVersion < 1)) {
      return fail(400, "geo_content_lock_invalid", "内容版本号无效。");
    }
    const questionIds = uniqueStrings(input.questionIds);
    const evidenceIds = uniqueStrings(input.evidenceIds);
    const questionRows = questionIds.length
      ? await deps.db.query<{ id: string }>(`SELECT id FROM geo_questions WHERE id=ANY($1::uuid[])`, [questionIds])
      : { rows: [] };
    const evidenceRows = evidenceIds.length
      ? await deps.db.query<GeoEvidenceRow>(`SELECT * FROM geo_evidence_items WHERE id=ANY($1::uuid[])`, [evidenceIds])
      : { rows: [] };
    const existingRows = await deps.db.query<{ document_json: GeoDocument }>(
      `SELECT version.document_json FROM geo_content_items item JOIN geo_content_versions version ON version.id=item.current_published_version_id
       WHERE item.status<>'archived' AND ($1::uuid IS NULL OR item.id<>$1)`,
      [input.contentItemId ?? null],
    );
    if (questionRows.rows.length !== questionIds.length || evidenceRows.rows.length !== evidenceIds.length) {
      return fail(400, "geo_reference_invalid", "问题或证据不存在。");
    }
    const evidence = evidenceRows.rows.map(toEvidenceSnapshot);
    const qualityReport = input.qualityReport ?? validateGeoDraft({ document: input.document, evidence, existingDocuments: existingRows.rows.map((row) => row.document_json), now: now() });

    const newItemId = randomUUID();
    let itemId = newItemId;
    if (input.contentItemId) {
      const itemResult = await deps.db.query<GeoItemRow>(`SELECT * FROM geo_content_items WHERE id=$1 AND status<>'archived'`, [input.contentItemId]);
      const selected = itemResult.rows[0];
      if (!selected) return input.expectedLockVersion === undefined
        ? fail(404, "geo_content_not_found", "GEO内容不存在或已归档。")
        : fail(409, "geo_content_edit_conflict", "内容已被其他管理员更新，请刷新后重新生成。");
      if (selected.content_type !== input.contentType || selected.slug !== input.slug) {
        return fail(409, "geo_content_identity_conflict", "已有内容的类型和短链不可变更。");
      }
      itemId = selected.id;
    }
    const versionId = randomUUID();
    const result = await deps.db.query<{ item: GeoItemRow; version: GeoVersionRow }>(
      `WITH run_lock AS MATERIALIZED (
         SELECT id FROM geo_generation_runs
          WHERE id=$11 AND lease_token=$17 AND status='running' AND lease_expires_at>$13
          FOR UPDATE
       ), lease_guard AS MATERIALIZED (
         SELECT true AS allowed WHERE $11::uuid IS NULL
         UNION ALL SELECT true FROM run_lock
       ), upserted_item AS (
         INSERT INTO geo_content_items (id,content_type,topic,slug,status,current_draft_version_id,lock_version,created_by_admin_id,updated_by_admin_id,created_at,updated_at)
         SELECT $1,$21,$22,$23,'draft',$2,2,$12,$12,$13,$13 FROM lease_guard WHERE $20
          ON CONFLICT (content_type,slug) DO NOTHING
          RETURNING *
        ), existing_item AS MATERIALIZED (
          SELECT item.id FROM geo_content_items item CROSS JOIN lease_guard
           WHERE item.id=$1 AND NOT $20 AND item.status<>'archived'
             AND ($24::integer IS NULL OR item.lock_version=$24)
          FOR UPDATE OF item
       ), selected_item AS MATERIALIZED (
         SELECT id FROM upserted_item
         UNION ALL
         SELECT id FROM existing_item
       ), locked_item AS MATERIALIZED (
         SELECT selected.id, pg_advisory_xact_lock(hashtextextended(selected.id::text, 0)) FROM selected_item selected
       ), next_version AS (
         SELECT locked_item.id AS content_item_id,COALESCE((
           SELECT MAX(version.version_number) FROM geo_content_versions version WHERE version.content_item_id=locked_item.id
         ),0)+1 AS version_number FROM locked_item
       ), inserted_version AS (
         INSERT INTO geo_content_versions (
           id,content_item_id,version_number,title,summary,document_json,faq_json,seo_json,social_drafts_json,
           quality_report_json,config_revision_id,generation_run_id,created_by_admin_id,created_at
         ) SELECT $2,content_item_id,version_number,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13 FROM next_version
         RETURNING *
       ), question_links AS (
         INSERT INTO geo_content_question_links (content_version_id,question_id)
         SELECT inserted_version.id,selected.question_id FROM inserted_version CROSS JOIN unnest($14::uuid[]) AS selected(question_id) RETURNING content_version_id
       ), evidence_links AS (
         INSERT INTO geo_content_evidence_links (content_version_id,evidence_id)
         SELECT inserted_version.id,selected.evidence_id FROM inserted_version CROSS JOIN unnest($15::uuid[]) AS selected(evidence_id) RETURNING content_version_id
       ), updated_item AS (
          UPDATE geo_content_items SET current_draft_version_id=$2,
            status=CASE WHEN current_published_version_id IS NULL THEN 'draft' ELSE 'published' END,
            lock_version=lock_version+1,updated_by_admin_id=$12,updated_at=$13
           FROM inserted_version WHERE geo_content_items.id=inserted_version.content_item_id
             AND geo_content_items.status<>'archived' AND NOT $20 RETURNING geo_content_items.*
       ), final_item AS (
         SELECT * FROM upserted_item
         UNION ALL SELECT * FROM updated_item
       ), completed_run AS (
         UPDATE geo_generation_runs run SET status='succeeded',content_item_id=inserted_version.content_item_id,
           provider_request_ids_json=$18::jsonb,usage_json=$19::jsonb,completed_at=$13,updated_at=$13
          FROM inserted_version WHERE run.id=$11 AND run.lease_token=$17 AND run.status='running' RETURNING run.id
       ), audited AS (
         INSERT INTO geo_audit_events (id,actor_admin_account_id,event_type,target_type,target_id,metadata_json,created_at)
         SELECT $16,$12,'draft_created','geo_content_item',content_item_id,jsonb_build_object('versionId',$2),$13 FROM inserted_version RETURNING id
       )
       SELECT row_to_json(final_item.*) AS item,row_to_json(inserted_version.*) AS version
       FROM final_item CROSS JOIN inserted_version CROSS JOIN audited`,
      [itemId, versionId, input.document.title.trim(), input.document.summary.trim(), JSON.stringify(input.document), JSON.stringify(input.document.faq), JSON.stringify(input.document.seo), JSON.stringify(input.document.socialDrafts), JSON.stringify(qualityReport), input.configRevisionId, input.generationRunId, input.actorAdminAccountId, now(), questionIds, evidenceIds, randomUUID(), input.generationCompletion?.leaseToken ?? null, JSON.stringify(input.generationCompletion?.providerRequestIds ?? []), JSON.stringify(input.generationCompletion?.usage ?? {}), !input.contentItemId, input.contentType, input.topic.trim(), input.slug, input.expectedLockVersion ?? null],
    );
    const row = result.rows[0];
    if (!row) {
      if (input.generationRunId && input.generationCompletion) {
        const activeRun = await deps.db.query<{ id: string }>(
          `SELECT id FROM geo_generation_runs WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>$3`,
          [input.generationRunId, input.generationCompletion.leaseToken, now()],
        );
        if (!activeRun.rows[0]) return fail(409, "geo_generation_lease_lost", "生成任务租约已失效，请重新生成。");
      }
      if (input.expectedLockVersion !== undefined) return fail(409, "geo_content_edit_conflict", "内容已被其他管理员更新，请刷新后重新编辑。");
      if (!input.contentItemId) return fail(409, "geo_content_generation_conflict", "同短链内容已被其他任务生成，请刷新后重试。");
      return fail(404, "geo_content_not_found", "GEO内容不存在或已归档。");
    }
    return created({ item: mapItem(row.item), version: mapVersion(row.version) });
  }

  async function submitForReview(input: { contentItemId: string; expectedLockVersion: number; actorAdminAccountId: string }) {
    const result = await deps.db.query<{ item: GeoItemRow }>(
      `WITH updated AS (
         UPDATE geo_content_items item SET status='in_review',lock_version=lock_version+1,updated_by_admin_id=$3,updated_at=$4
         FROM geo_content_versions version
         WHERE item.id=$1 AND item.lock_version=$2 AND version.id=item.current_draft_version_id
           AND item.status IN ('draft','published')
           AND jsonb_array_length(COALESCE(version.quality_report_json->'blockers','[]'::jsonb))=0
         RETURNING item.*
       ), audited AS (
         INSERT INTO geo_audit_events (id,actor_admin_account_id,event_type,target_type,target_id,metadata_json,created_at)
         SELECT $5,$3,'submitted_for_review','geo_content_item',id,'{}'::jsonb,$4 FROM updated RETURNING id
       ) SELECT row_to_json(updated.*) AS item FROM updated CROSS JOIN audited`,
      [input.contentItemId, input.expectedLockVersion, input.actorAdminAccountId, now(), randomUUID()],
    );
    if (!result.rows[0]) return fail(409, "geo_review_conflict", "版本已变化、状态不允许或草稿仍有阻断项。");
    return ok(mapItem(result.rows[0].item));
  }

  async function publish(input: { contentItemId: string; actorAdminAccountId: string; reason: string }) {
    const result = await deps.db.query<{ item: GeoItemRow; version: GeoVersionRow }>(
      `WITH updated_item AS (
         UPDATE geo_content_items item SET status='published',current_published_version_id=current_draft_version_id,
           lock_version=lock_version+1,updated_by_admin_id=$2,updated_at=$3
         FROM geo_content_versions version
         WHERE item.id=$1 AND item.status='in_review' AND version.id=item.current_draft_version_id
           AND jsonb_array_length(COALESCE(version.quality_report_json->'blockers','[]'::jsonb))=0
           AND NOT EXISTS (
             SELECT 1 FROM geo_content_evidence_links link
             JOIN geo_evidence_items evidence ON evidence.id=link.evidence_id
             WHERE link.content_version_id=version.id
               AND (evidence.review_status<>'approved' OR NOT evidence.public_use_allowed
                 OR (evidence.valid_until IS NOT NULL AND evidence.valid_until<$3))
           )
         RETURNING item.*
       ), published_version AS (
         UPDATE geo_content_versions version SET published_at=COALESCE(published_at,$3)
         FROM updated_item item WHERE version.id=item.current_published_version_id RETURNING version.*
       ), covered AS (
         UPDATE geo_questions SET coverage_status='covered',updated_at=$3
         WHERE id IN (SELECT question_id FROM geo_content_question_links link JOIN published_version version ON version.id=link.content_version_id)
         RETURNING id
       ), audited AS (
         INSERT INTO geo_audit_events (id,actor_admin_account_id,event_type,target_type,target_id,reason,metadata_json,created_at)
         SELECT $4,$2,'published','geo_content_item',id,$5,jsonb_build_object('versionId',current_published_version_id),$3 FROM updated_item RETURNING id
       ) SELECT row_to_json(updated_item.*) AS item,row_to_json(published_version.*) AS version
         FROM updated_item CROSS JOIN published_version CROSS JOIN audited`,
      [input.contentItemId, input.actorAdminAccountId, now(), randomUUID(), input.reason.trim()],
    );
    if (!result.rows[0]) return fail(409, "geo_publish_conflict", "内容必须先送审且不能有阻断项。");
    return ok({ item: mapItem(result.rows[0].item), version: mapVersion(result.rows[0].version) });
  }

  async function rollback(input: { contentItemId: string; versionId: string; actorAdminAccountId: string; reason: string }) {
    const result = await deps.db.query<{ item: GeoItemRow; version: GeoVersionRow }>(
      `WITH target AS (
         SELECT * FROM geo_content_versions WHERE id=$2 AND content_item_id=$1 AND published_at IS NOT NULL
       ), updated AS (
         UPDATE geo_content_items SET status='published',current_published_version_id=$2,lock_version=lock_version+1,
           updated_by_admin_id=$3,updated_at=$4 WHERE id=$1 AND status<>'archived' AND EXISTS(SELECT 1 FROM target) RETURNING *
       ), audited AS (
         INSERT INTO geo_audit_events (id,actor_admin_account_id,event_type,target_type,target_id,reason,metadata_json,created_at)
         SELECT $5,$3,'rolled_back','geo_content_item',id,$6,jsonb_build_object('versionId',$2),$4 FROM updated RETURNING id
       ) SELECT row_to_json(updated.*) AS item,row_to_json(target.*) AS version FROM updated CROSS JOIN target CROSS JOIN audited`,
      [input.contentItemId, input.versionId, input.actorAdminAccountId, now(), randomUUID(), input.reason.trim()],
    );
    if (!result.rows[0]) return fail(409, "geo_rollback_invalid", "只能回滚到该内容曾发布的版本。");
    return ok({ item: mapItem(result.rows[0].item), version: mapVersion(result.rows[0].version) });
  }

  async function archive(input: { contentItemId: string; actorAdminAccountId: string; reason: string; redirectPath?: string | null }) {
    const redirectPath = input.redirectPath?.trim() || null;
    if (redirectPath && !/^\/(guides|cases|reports|answers)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(redirectPath)) {
      return fail(400, "geo_redirect_invalid", "替代地址必须是有效的GEO公开内容路径。");
    }
    const match = redirectPath?.match(/^\/(guides|cases|reports|answers)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/) ?? null;
    const typeByRoute: Record<string, GeoContentType> = { guides: "guide", cases: "case", reports: "report", answers: "answer" };
    const result = await deps.db.query<{ item: GeoItemRow }>(
      `WITH redirect_target AS MATERIALIZED (
         SELECT id FROM geo_content_items
          WHERE $6::text IS NOT NULL AND content_type=$7 AND slug=$8
            AND status='published' AND current_published_version_id IS NOT NULL
          FOR SHARE
       ), updated AS (
         UPDATE geo_content_items source SET status='archived',redirect_path=$6,lock_version=lock_version+1,updated_by_admin_id=$2,updated_at=$3
         WHERE source.id=$1 AND source.status<>'archived'
           AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM redirect_target target WHERE target.id<>source.id))
         RETURNING source.*
       ), audited AS (
         INSERT INTO geo_audit_events (id,actor_admin_account_id,event_type,target_type,target_id,reason,metadata_json,created_at)
         SELECT $4,$2,'archived','geo_content_item',id,$5,'{}'::jsonb,$3 FROM updated RETURNING id
       ) SELECT row_to_json(updated.*) AS item FROM updated CROSS JOIN audited`,
      [input.contentItemId, input.actorAdminAccountId, now(), randomUUID(), input.reason.trim(), redirectPath, match ? typeByRoute[match[1]!] : null, match?.[2] ?? null],
    );
    if (!result.rows[0]) return redirectPath
      ? fail(400, "geo_redirect_invalid", "替代地址必须指向另一条当前已发布内容。")
      : fail(409, "geo_archive_conflict", "内容不存在或已经归档。");
    return ok(mapItem(result.rows[0].item));
  }

  async function listPublished(contentType?: GeoContentType) {
    const result = await deps.db.query<{ item: GeoItemRow; version: GeoVersionRow }>(
      `SELECT row_to_json(item.*) AS item,row_to_json(version.*) AS version
       FROM geo_content_items item JOIN geo_content_versions version ON version.id=item.current_published_version_id
       WHERE item.status<>'archived' AND ($1::text IS NULL OR item.content_type=$1)
       ORDER BY version.published_at DESC NULLS LAST,item.updated_at DESC`,
      [contentType ?? null],
    );
    return ok(result.rows.map((row) => ({ item: mapItem(row.item), version: mapVersion(row.version) })));
  }

  async function findPublishedByPath(pathname: string) {
    const match = pathname.match(/^\/(guides|cases|reports|answers)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
    if (!match) return fail(404, "geo_content_not_found", "GEO公开内容不存在。");
    const typeByRoute: Record<string, GeoContentType> = { guides: "guide", cases: "case", reports: "report", answers: "answer" };
    const result = await deps.db.query<{ item: GeoItemRow; version: GeoVersionRow }>(
      `SELECT row_to_json(item.*) AS item,row_to_json(version.*) AS version
       FROM geo_content_items item JOIN geo_content_versions version ON version.id=item.current_published_version_id
       WHERE item.content_type=$1 AND item.slug=$2 AND item.status<>'archived'`,
      [typeByRoute[match[1]!], match[2]],
    );
    if (!result.rows[0]) return fail(404, "geo_content_not_found", "GEO公开内容不存在。");
    const evidence = await deps.db.query<GeoEvidenceRow>(
      `SELECT evidence.* FROM geo_content_evidence_links link
       JOIN geo_evidence_items evidence ON evidence.id=link.evidence_id
       WHERE link.content_version_id=$1 AND evidence.review_status='approved' AND evidence.public_use_allowed
         AND (evidence.valid_until IS NULL OR evidence.valid_until>=$2)
       ORDER BY evidence.id`,
      [result.rows[0].version.id, now()],
    );
    return ok({ item: mapItem(result.rows[0].item), version: mapVersion(result.rows[0].version), evidence: evidence.rows.map(mapPublicEvidence) });
  }

  return { listQuestions, saveQuestion, listEvidence, saveEvidence, listContent, getContent, createDraftFromDocument, submitForReview, publish, rollback, archive, listPublished, findPublishedByPath };
}

function mapQuestion(row: GeoQuestionRow) {
  return { id: row.id, rawQuestion: row.raw_question, normalizedQuestion: row.normalized_question, topic: row.topic, intent: row.intent, targetPlatforms: row.target_platforms_json, priority: row.priority, productCapabilities: row.product_capabilities_json, coverageStatus: row.coverage_status, notes: row.notes, lastMonitoredAt: isoOrNull(row.last_monitored_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function mapEvidence(row: GeoEvidenceRow) {
  return { id: row.id, type: row.evidence_type, name: row.name, factText: row.fact_text, sourceUrl: row.source_url, collectedAt: iso(row.collected_at), modelName: row.model_name, modelVersion: row.model_version, reviewStatus: row.review_status, validUntil: isoOrNull(row.valid_until), publicUseAllowed: row.public_use_allowed, reviewedAt: isoOrNull(row.reviewed_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function mapPublicEvidence(row: GeoEvidenceRow) {
  return { id: row.id, name: row.name, factText: row.fact_text, sourceUrl: row.source_url };
}
function mapItem(row: GeoItemRow) {
  return { id: row.id, contentType: row.content_type, topic: row.topic, slug: row.slug, status: row.status, currentDraftVersionId: row.current_draft_version_id, currentPublishedVersionId: row.current_published_version_id, redirectPath: row.redirect_path, lockVersion: row.lock_version, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function mapVersion(row: GeoVersionRow) {
  return { id: row.id, contentItemId: row.content_item_id, versionNumber: row.version_number, title: row.title, summary: row.summary, document: row.document_json, qualityReport: row.quality_report_json, configRevisionId: row.config_revision_id, generationRunId: row.generation_run_id, questionIds: row.question_ids ?? [], evidenceIds: row.evidence_ids ?? [], createdAt: iso(row.created_at), publishedAt: isoOrNull(row.published_at) };
}
function toEvidenceSnapshot(row: GeoEvidenceRow): GeoEvidenceSnapshot {
  return { id: row.id, name: row.name, factText: row.fact_text, sourceUrl: row.source_url, reviewStatus: row.review_status, publicUseAllowed: row.public_use_allowed, validUntil: isoOrNull(row.valid_until) };
}
function collapseWhitespace(value: string) { return value.normalize("NFKC").replace(/\s+/gu, " ").trim(); }
function uniqueStrings(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function iso(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function isoOrNull(value: Date | string | null) { return value == null ? null : iso(value); }
function ok<T>(data: T): GeoServiceResult<T> { return { status: 200, body: { data } }; }
function created<T>(data: T): GeoServiceResult<T> { return { status: 201, body: { data } }; }
function fail(status: 400 | 404 | 409, code: string, message: string): GeoServiceResult<never> { return { status, body: { error: { code, message } } }; }
