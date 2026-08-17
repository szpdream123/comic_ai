import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createGeoContentService } from "../geo-content.service.ts";
import type { GeoDocument } from "../geo-types.ts";

const actorAdminAccountId = "30000000-0000-4000-8000-000000000001";
const fixedNow = new Date("2026-08-13T08:00:00.000Z");
const document: GeoDocument = {
  title: "AI短剧怎样保持角色一致性",
  summary: "通过固定角色资料、参考素材和分镜约束，降低不同镜头中的角色漂移。",
  directAnswer: "先确认角色资料和参考素材，再让每个分镜引用同一份已审核的角色依据。",
  blocks: [{ type: "paragraph", text: "灵曦AI支持按角色保存和复用参考素材。", evidenceIds: [] }],
  faq: [{ question: "什么时候需要重新确认角色？", answer: "角色造型或镜头要求变化时，应重新审核参考素材。" }],
  socialDrafts: { zhihu: "", xiaohongshu: "", bilibili: "", wechat: "" },
  seo: { title: "AI短剧角色一致性方法 | 灵曦AI", description: "介绍AI短剧角色资料、参考素材和分镜约束的实用方法。" },
};

describe("GEO content workflow", () => {
  it("keeps versions immutable through review, publish, new draft, rollback, and archive", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status)
         VALUES ($1, 'geo_admin', 'plain:test-password', 'GEO Admin', 'active')`,
        [actorAdminAccountId],
      );
      const service = createGeoContentService({ db, now: () => fixedNow });
      const question = await service.saveQuestion({
        rawQuestion: "AI短剧怎样保持角色一致？",
        topic: "角色一致性",
        intent: "tutorial",
        targetPlatforms: ["deepseek", "doubao"],
        priority: 90,
        productCapabilities: ["角色素材库"],
        notes: "",
        actorAdminAccountId,
      });
      assert.equal(question.status, 201);
      if (!("data" in question.body)) throw new Error("question not created");

      const evidence = await service.saveEvidence({
        type: "product_feature",
        name: "角色素材管理",
        factText: "灵曦AI支持按角色保存参考素材。",
        sourceUrl: "https://www.lingxiyunai.com/assets",
        reviewStatus: "approved",
        validUntil: null,
        publicUseAllowed: true,
        actorAdminAccountId,
      });
      assert.equal(evidence.status, 201);
      if (!("data" in evidence.body)) throw new Error("evidence not created");

      const supportedDocument: GeoDocument = {
        ...document,
        blocks: [{ type: "paragraph", text: "灵曦AI支持按角色保存参考素材。", evidenceIds: [evidence.body.data.id] }],
      };
      const draft = await service.createDraftFromDocument({
        contentType: "guide",
        topic: "角色一致性",
        slug: "ai-short-drama-character-consistency",
        questionIds: [question.body.data.id],
        evidenceIds: [evidence.body.data.id],
        document: supportedDocument,
        generationRunId: null,
        configRevisionId: "geo-default-v1",
        actorAdminAccountId,
      });
      assert.equal(draft.status, 201);
      if (!("data" in draft.body)) throw new Error("draft not created");
      const editableDetail = await service.getContent(draft.body.data.item.id);
      assert.equal(editableDetail.status, 200);
      if (!("data" in editableDetail.body)) throw new Error("editable detail missing");
      assert.deepEqual(editableDetail.body.data.versions[0]?.questionIds, [question.body.data.id]);
      assert.deepEqual(editableDetail.body.data.versions[0]?.evidenceIds, [evidence.body.data.id]);
      assert.equal((await service.publish({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "直接发布" })).status, 409);

      const review = await service.submitForReview({
        contentItemId: draft.body.data.item.id,
        expectedLockVersion: draft.body.data.item.lockVersion,
        actorAdminAccountId,
      });
      assert.equal(review.status, 200);
      const published = await service.publish({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "审核通过" });
      assert.equal(published.status, 200);
      const publicV1 = await service.findPublishedByPath("/guides/ai-short-drama-character-consistency");
      assert.equal(publicV1.status, 200);
      if (!("data" in publicV1.body)) throw new Error("published content missing");
      assert.equal(publicV1.body.data.version.versionNumber, 1);

      const successor = await service.createDraftFromDocument({
        contentItemId: draft.body.data.item.id,
        contentType: "guide",
        topic: "角色一致性",
        slug: "ai-short-drama-character-consistency",
        questionIds: [question.body.data.id],
        evidenceIds: [evidence.body.data.id],
        document: {
          ...supportedDocument,
          title: "AI短剧怎样保持角色一致性：分镜复用方法",
          summary: "通过固定角色资料、复用参考素材和逐镜检查，降低连续镜头中的角色漂移。",
          seo: { ...supportedDocument.seo, title: "AI短剧角色一致性与分镜复用方法 | 灵曦AI" },
        },
        generationRunId: null,
        configRevisionId: "geo-default-v1",
        actorAdminAccountId,
      });
      assert.equal(successor.status, 201);
      if (!("data" in successor.body)) throw new Error("successor not created");
      assert.deepEqual(successor.body.data.version.qualityReport.blockers, []);
      assert.equal((await service.findPublishedByPath("/guides/ai-short-drama-character-consistency")).body.data.version.versionNumber, 1);

      assert.equal((await service.submitForReview({ contentItemId: draft.body.data.item.id, expectedLockVersion: successor.body.data.item.lockVersion, actorAdminAccountId })).status, 200);
      assert.equal((await service.publish({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "更新发布" })).status, 200);
      assert.equal((await service.findPublishedByPath("/guides/ai-short-drama-character-consistency")).body.data.version.versionNumber, 2);

      assert.equal((await service.rollback({ contentItemId: draft.body.data.item.id, versionId: draft.body.data.version.id, actorAdminAccountId, reason: "回滚验证" })).status, 200);
      assert.equal((await service.findPublishedByPath("/guides/ai-short-drama-character-consistency")).body.data.version.versionNumber, 1);
      assert.equal((await service.archive({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "归档验证" })).status, 200);
      assert.equal((await service.rollback({ contentItemId: draft.body.data.item.id, versionId: draft.body.data.version.id, actorAdminAccountId, reason: "归档后回滚" })).status, 409);

      const audit = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM geo_audit_events WHERE target_id = $1", [draft.body.data.item.id]);
      assert.ok(Number(audit.rows[0]?.count ?? 0) >= 5);
    } finally {
      await db.close();
    }
  });

  it("does not fan out draft preflight checks across multiple database connections", async () => {
    const questionId = "30000000-0000-4000-8000-000000000031";
    const evidenceId = "30000000-0000-4000-8000-000000000032";
    const itemId = "30000000-0000-4000-8000-000000000033";
    const versionId = "30000000-0000-4000-8000-000000000034";
    const supportedDocument: GeoDocument = {
      ...document,
      blocks: [{ type: "paragraph", text: "灵曦AI支持按角色保存参考素材。", evidenceIds: [evidenceId] }],
    };
    let activeQueries = 0;
    let peakActiveQueries = 0;
    const trackedDb = {
      async query<T>(sql: string) {
        activeQueries += 1;
        peakActiveQueries = Math.max(peakActiveQueries, activeQueries);
        await new Promise((resolve) => setTimeout(resolve, 5));
        try {
          if (sql.includes("FROM geo_questions")) return { rows: [{ id: questionId }] as T[] };
          if (sql.includes("SELECT * FROM geo_evidence_items")) return { rows: [{
            id: evidenceId,
            evidence_type: "product_feature",
            name: "角色素材管理",
            fact_text: "灵曦AI支持按角色保存参考素材。",
            source_url: "https://www.lingxiyunai.com/assets",
            collected_at: fixedNow,
            model_name: null,
            model_version: null,
            review_status: "approved",
            valid_until: null,
            public_use_allowed: true,
            reviewed_by_admin_id: actorAdminAccountId,
            reviewed_at: fixedNow,
            created_by_admin_id: actorAdminAccountId,
            created_at: fixedNow,
            updated_at: fixedNow,
          }] as T[] };
          if (sql.includes("JOIN geo_content_versions version")) return { rows: [] as T[] };
          return { rows: [{
            item: {
              id: itemId,
              content_type: "guide",
              topic: "角色一致性",
              slug: "bounded-draft-preflight",
              status: "draft",
              current_draft_version_id: versionId,
              current_published_version_id: null,
              redirect_path: null,
              lock_version: 2,
              created_by_admin_id: actorAdminAccountId,
              updated_by_admin_id: actorAdminAccountId,
              created_at: fixedNow,
              updated_at: fixedNow,
            },
            version: {
              id: versionId,
              content_item_id: itemId,
              version_number: 1,
              title: supportedDocument.title,
              summary: supportedDocument.summary,
              document_json: supportedDocument,
              faq_json: supportedDocument.faq,
              seo_json: supportedDocument.seo,
              social_drafts_json: supportedDocument.socialDrafts,
              quality_report_json: { blockers: [], warnings: [], checkedAt: fixedNow.toISOString() },
              config_revision_id: "geo-default-v1",
              generation_run_id: null,
              created_by_admin_id: actorAdminAccountId,
              created_at: fixedNow,
              published_at: null,
            },
          }] as T[] };
        } finally {
          activeQueries -= 1;
        }
      },
    };
    const service = createGeoContentService({ db: trackedDb, now: () => fixedNow });

    const result = await service.createDraftFromDocument({
      contentType: "guide",
      topic: "角色一致性",
      slug: "bounded-draft-preflight",
      questionIds: [questionId],
      evidenceIds: [evidenceId],
      document: supportedDocument,
      generationRunId: null,
      configRevisionId: "geo-default-v1",
      actorAdminAccountId,
    });

    assert.equal(result.status, 201);
    assert.equal(peakActiveQueries, 1);
  });

  it("does not allow a blocked draft into review", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status)
         VALUES ($1, 'geo_block_admin', 'plain:test-password', 'GEO Admin', 'active')`,
        [actorAdminAccountId],
      );
      const service = createGeoContentService({ db, now: () => fixedNow });
      const draft = await service.createDraftFromDocument({
        contentType: "answer", topic: "旧品牌", slug: "legacy-brand-answer", questionIds: [], evidenceIds: [],
        document: { ...document, title: "灵曦剧场是什么" }, generationRunId: null,
        configRevisionId: "geo-default-v1", actorAdminAccountId,
      });
      assert.equal(draft.status, 201);
      if (!("data" in draft.body)) throw new Error("draft not created");
      const review = await service.submitForReview({ contentItemId: draft.body.data.item.id, expectedLockVersion: draft.body.data.item.lockVersion, actorAdminAccountId });
      assert.equal(review.status, 409);
    } finally {
      await db.close();
    }
  });

  it("serializes concurrent successor versions for the same content item", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status)
         VALUES ($1, 'geo_concurrent_admin', 'plain:test-password', 'GEO Admin', 'active')`,
        [actorAdminAccountId],
      );
      const service = createGeoContentService({ db, now: () => fixedNow });
      const first = await service.createDraftFromDocument({ contentType: "guide", topic: "并发版本", slug: "concurrent-versions", questionIds: [], evidenceIds: [], document: { ...document, blocks: [{ type: "paragraph", text: "先固定角色资料再进入制作。", evidenceIds: [] }] }, generationRunId: null, configRevisionId: "geo-default-v1", actorAdminAccountId });
      if (!("data" in first.body)) throw new Error("first draft failed");
      const baseInput = { contentItemId: first.body.data.item.id, contentType: "guide" as const, topic: "并发版本", slug: "concurrent-versions", questionIds: [], evidenceIds: [], generationRunId: null, configRevisionId: "geo-default-v1", actorAdminAccountId };
      const [left, right] = await Promise.all([
        service.createDraftFromDocument({ ...baseInput, document: { ...document, title: "并发版本A", blocks: [{ type: "paragraph", text: "方案A记录角色资料的适用边界。", evidenceIds: [] }] } }),
        service.createDraftFromDocument({ ...baseInput, document: { ...document, title: "并发版本B", blocks: [{ type: "paragraph", text: "方案B先审核分镜使用的角色素材。", evidenceIds: [] }] } }),
      ]);
      assert.equal(left.status, 201);
      assert.equal(right.status, 201);
      const versions = await db.query<{ version_number: number }>("SELECT version_number FROM geo_content_versions WHERE content_item_id=$1 ORDER BY version_number", [first.body.data.item.id]);
      assert.deepEqual(versions.rows.map((row) => row.version_number), [1, 2, 3]);
    } finally {
      await db.close();
    }
  });

  it("rejects a stale admin edit instead of replacing the current draft pointer", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status)
         VALUES ($1, 'geo_edit_conflict_admin', 'plain:test-password', 'GEO Admin', 'active')`,
        [actorAdminAccountId],
      );
      const service = createGeoContentService({ db, now: () => fixedNow });
      const first = await service.createDraftFromDocument({ contentType: "guide", topic: "编辑冲突", slug: "edit-conflict", questionIds: [], evidenceIds: [], document, generationRunId: null, configRevisionId: "geo-default-v1", actorAdminAccountId });
      if (!("data" in first.body)) throw new Error("first draft failed");
      const baseInput = { contentItemId: first.body.data.item.id, expectedLockVersion: first.body.data.item.lockVersion, contentType: "guide" as const, topic: "编辑冲突", slug: "edit-conflict", questionIds: [], evidenceIds: [], generationRunId: null, configRevisionId: "geo-default-v1", actorAdminAccountId };
      const saved = await service.createDraftFromDocument({ ...baseInput, document: { ...document, title: "编辑后的版本" } });
      assert.equal(saved.status, 201);
      const stale = await service.createDraftFromDocument({ ...baseInput, document: { ...document, title: "过期编辑" } });
      assert.equal(stale.status, 409);
      if ("error" in stale.body) assert.equal(stale.body.error.code, "geo_content_edit_conflict");
      const versions = await db.query<{ title: string }>("SELECT title FROM geo_content_versions WHERE content_item_id=$1 ORDER BY version_number", [first.body.data.item.id]);
      assert.deepEqual(versions.rows.map((row) => row.title), [document.title, "编辑后的版本"]);
    } finally {
      await db.close();
    }
  });

  it("validates and commits an archive redirect atomically", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status)
         VALUES ($1, 'geo_archive_admin', 'plain:test-password', 'GEO Admin', 'active')`,
        [actorAdminAccountId],
      );
      await db.query(
        `INSERT INTO geo_content_items (id,content_type,topic,slug,status,lock_version,created_by_admin_id,updated_by_admin_id)
         VALUES
           ('30000000-0000-4000-8000-000000000011','guide','来源','archive-source','published',1,$1,$1),
           ('30000000-0000-4000-8000-000000000012','guide','目标','archive-target','published',1,$1,$1)`,
        [actorAdminAccountId],
      );
      await db.query(
        `INSERT INTO geo_content_versions (id,content_item_id,version_number,title,summary,document_json,config_revision_id,created_by_admin_id,published_at)
         VALUES
           ('30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000011',1,'来源','来源摘要','{}'::jsonb,'geo-default-v1',$1,$2),
           ('30000000-0000-4000-8000-000000000022','30000000-0000-4000-8000-000000000012',1,'目标','目标摘要','{}'::jsonb,'geo-default-v1',$1,$2)`,
        [actorAdminAccountId, fixedNow],
      );
      await db.query(`UPDATE geo_content_items SET current_published_version_id=CASE slug WHEN 'archive-source' THEN '30000000-0000-4000-8000-000000000021'::uuid ELSE '30000000-0000-4000-8000-000000000022'::uuid END`);
      const archiveSql: string[] = [];
      const trackedDb = {
        async query<T>(sql: string, params?: unknown[]) {
          archiveSql.push(sql);
          return db.query<T>(sql, params);
        },
      };
      const service = createGeoContentService({ db: trackedDb, now: () => fixedNow });
      const result = await service.archive({ contentItemId: "30000000-0000-4000-8000-000000000011", actorAdminAccountId, reason: "迁移地址", redirectPath: "/guides/archive-target" });
      assert.equal(result.status, 200);
      assert.equal((await service.rollback({ contentItemId: "30000000-0000-4000-8000-000000000011", versionId: "30000000-0000-4000-8000-000000000021", actorAdminAccountId, reason: "不应恢复归档" })).status, 409);
      const archived = await db.query<{ status: string; redirect_path: string | null }>("SELECT status,redirect_path FROM geo_content_items WHERE id='30000000-0000-4000-8000-000000000011'");
      assert.deepEqual(archived.rows[0], { status: "archived", redirect_path: "/guides/archive-target" });
      assert.equal(archiveSql.length, 2);
      assert.match(archiveSql[0]!, /FOR (?:NO KEY UPDATE|UPDATE|SHARE)/i);
      assert.match(archiveSql[0]!, /UPDATE geo_content_items/i);
    } finally {
      await db.close();
    }
  });
});
