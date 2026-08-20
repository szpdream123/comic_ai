import { createHash, randomUUID } from "node:crypto";

import type { SqlDatabase } from "../../shared/db/sql.ts";
import type { StorageAdapter } from "../../storage/storage.service.ts";
import { findMarketingContentSimilarity } from "../domain/content-similarity.ts";

export class MarketingError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[];

export type MarketingProjectInput = {
  ownerUserId?: string | null;
  sourceType: string;
  sourceNamespace: string;
  sourceRecordId?: string | null;
  sourceSnapshot: Json;
  name: string;
  brandProfile?: Json;
};

export type MarketingSourceInput = {
  sourceNamespace: string;
  sourceRecordId: string;
  sourceVersion: string;
  sourceSnapshot: Json;
  sourceUrl?: string | null;
  contentHash?: string | null;
  authorizationStatus: string;
};

export type MarketingCampaignInput = {
  projectId: string;
  name: string;
  objective: string;
  brandProfileId?: string | null;
  audience?: Json;
  platformConstraints?: Json;
  prohibitedExpressions?: string[];
  scheduleWindow?: Json;
};

export type MarketingContentInput = {
  campaignId: string;
  platform: string;
  contentType: "image" | "video";
  title?: string;
  body: Json;
  assetManifest?: Json;
  knowledgeSegmentIds?: string[];
  complianceReport?: Json;
  trackingKey: string;
};

export type MarketingPublishJobInput = {
  campaignId: string;
  contentVariantId: string;
  platform: string;
  executorAccountRef: string;
  idempotencyKey: string;
  scheduledAt: string;
  executeDeadline?: string;
  assets: Array<{
    type: "video" | "image" | "cover" | "subtitle" | "document";
    storageObjectId?: string;
    deliveryUrl?: string;
    sha256?: string;
    contentType?: string;
    sizeBytes?: number;
    expiresAt?: string;
  }>;
};

export type MarketingDirectPublishInput = {
  projectId: string;
  direction: string;
  sourceFacts?: string;
  modelCode?: string;
  marketingSkillId?: string;
  skillId?: string;
  contentType: "image" | "video";
  platform: string;
  executorAccountRef: string;
  idempotencyKey: string;
  scheduledAt: string;
};

export type MarketingCompetitorCollectionJobInput = {
  projectId: string;
  campaignId?: string | null;
  name: string;
  collectionMode: "keyword" | "creator";
  queryText: string;
  crawlerBaseUrl: string;
  maxItems?: number;
  includeComments?: boolean;
  intervalMinutes?: number;
};

export type MarketingCompetitorCollectionJobUpdateInput = MarketingCompetitorCollectionJobInput & {
  status: "active" | "paused" | "disabled";
};

type PublishJobIdempotencyRow = {
  id: string;
  campaign_id: string;
  content_variant_id: string;
  platform: string;
  executor_account_ref: string;
  scheduled_at: Date;
  not_before: Date;
  execute_deadline: Date;
  status: string;
};

const deliveryRecoveryStates = new WeakMap<SqlDatabase, {
  nextRunAtMs: number;
  pending: Promise<void> | null;
}>();
const executorHeartbeatWindowMs = 5 * 60 * 1000;

export function createMarketingService(deps: { db: SqlDatabase; storageAdapter?: StorageAdapter }) {
  async function createProject(input: MarketingProjectInput, actorAdminId: string, options: { allowComicInternal?: boolean } = {}) {
    requireText(input.name, "marketing_project_name_required");
    requireText(input.sourceType, "marketing_project_source_type_required");
    requireText(input.sourceNamespace, "marketing_project_source_namespace_required");
    if (input.sourceType === "comic_internal" && options.allowComicInternal !== true) {
      throw new MarketingError(409, "marketing_comic_adapter_required", "Comic projects must be imported through ComicMarketingSourceAdapter");
    }
    const ownerUserId = input.ownerUserId ?? await findExecutionOwner(actorAdminId);
    await requireActiveExecutionOwner(ownerUserId);
    const id = randomUUID();
    await deps.db.query(
      `INSERT INTO marketing_projects (
         id, owner_user_id, source_type, source_namespace, source_record_id,
         source_snapshot, name, brand_profile_json, created_by_admin_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9)`,
      [
        id,
        ownerUserId,
        input.sourceType,
        input.sourceNamespace,
        input.sourceRecordId ?? null,
        json(input.sourceSnapshot),
        input.name.trim(),
        json(input.brandProfile ?? {}),
        actorAdminId,
      ],
    );
    const brandProfileId = randomUUID();
    await deps.db.query(
      `INSERT INTO marketing_brand_profiles (
         id, project_id, version, profile_json, status, created_by_admin_id, activated_by_admin_id, activated_at
       ) VALUES ($1, $2, 'initial-v1', $3::jsonb, 'active', $4, $4, now())`,
      [brandProfileId, id, json(input.brandProfile ?? {}), actorAdminId],
    );
    await deps.db.query(
      "UPDATE marketing_projects SET active_brand_profile_id = $2 WHERE id = $1",
      [id, brandProfileId],
    );
    await audit({ projectId: id, actorAdminId, eventType: "project.created", detail: { sourceType: input.sourceType } });
    return { id };
  }

  async function configureExecutionOwner(ownerUserId: string, actorAdminId: string) {
    requireText(ownerUserId, "marketing_execution_owner_required");
    await requireActiveExecutionOwner(ownerUserId);
    await deps.db.query(
      `INSERT INTO marketing_execution_owner_bindings (
         id, admin_account_id, owner_user_id, configured_by_admin_id
       ) VALUES ($1, $2, $3, $2)
       ON CONFLICT (admin_account_id) DO UPDATE
       SET owner_user_id = EXCLUDED.owner_user_id,
           configured_by_admin_id = EXCLUDED.configured_by_admin_id,
           updated_at = now()`,
      [randomUUID(), actorAdminId, ownerUserId],
    );
    const repaired = await repairLegacyManualProjects(actorAdminId, ownerUserId);
    await audit({ actorAdminId, eventType: "execution_owner.configured", detail: { ownerUserId, ...repaired } });
    return { ownerUserId, ...repaired };
  }

  async function findExecutionOwner(actorAdminId: string) {
    const binding = await deps.db.query<{ owner_user_id: string }>(
      "SELECT owner_user_id FROM marketing_execution_owner_bindings WHERE admin_account_id = $1",
      [actorAdminId],
    );
    const ownerUserId = binding.rows[0]?.owner_user_id;
    if (!ownerUserId) {
      throw new MarketingError(409, "marketing_execution_owner_not_configured", "Configure a marketing execution owner before creating a manual project");
    }
    return ownerUserId;
  }

  async function requireActiveExecutionOwner(ownerUserId: string) {
    const owner = await deps.db.query<{ id: string }>(
      "SELECT id FROM users WHERE id = $1 AND status = 'active'",
      [ownerUserId],
    );
    if (!owner.rows[0]) {
      throw new MarketingError(409, "marketing_execution_owner_invalid", "Marketing execution owner must be an active product user");
    }
  }

  async function repairLegacyManualProjects(actorAdminId: string, ownerUserId: string) {
    await deps.db.query("BEGIN");
    try {
      const repairedProjects = await deps.db.query<{ id: string }>(
        `UPDATE marketing_projects
         SET owner_user_id = $2, updated_at = now()
         WHERE source_type = 'manual'
           AND created_by_admin_id = $1
           AND owner_user_id IS NULL
         RETURNING id`,
        [actorAdminId, ownerUserId],
      );
      const projectIds = repairedProjects.rows.map((row) => row.id);
      let retriedRuns = 0;
      if (projectIds.length) {
        const retried = await deps.db.query<{ id: string }>(
          `UPDATE marketing_generation_runs
           SET status = 'queued', failure_code = NULL, updated_at = now()
           WHERE project_id = ANY($1::uuid[])
             AND status = 'failed'
             AND failure_code = 'marketing_generation_owner_required'
           RETURNING id`,
          [projectIds],
        );
        retriedRuns = retried.rows.length;
      }
      await deps.db.query("COMMIT");
      return { repairedProjectCount: projectIds.length, retriedRunCount: retriedRuns };
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
  }

  async function createBrandProfileVersion(input: {
    projectId: string; version: string; profile: Json;
  }, actorAdminId: string) {
    requireText(input.version, "marketing_brand_profile_version_required");
    await requireProject(input.projectId);
    const id = randomUUID();
    try {
      await deps.db.query(
        `INSERT INTO marketing_brand_profiles (id, project_id, version, profile_json, created_by_admin_id)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [id, input.projectId, input.version.trim(), json(input.profile), actorAdminId],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new MarketingError(409, "marketing_brand_profile_version_exists", "Brand profile version already exists for this project");
      }
      throw error;
    }
    await audit({ projectId: input.projectId, actorAdminId, eventType: "brand_profile.version_created", detail: { brandProfileId: id, version: input.version.trim() } });
    return { id, status: "draft" };
  }

  async function activateBrandProfile(brandProfileId: string, actorAdminId: string) {
    await deps.db.query("BEGIN");
    try {
      const candidate = await deps.db.query<{ project_id: string; status: string }>(
        `SELECT project_id, status FROM marketing_brand_profiles
         WHERE id = $1 FOR UPDATE`,
        [brandProfileId],
      );
      const row = candidate.rows[0];
      if (!row || row.status !== "draft") {
        throw new MarketingError(409, "marketing_brand_profile_not_activatable", "Only draft brand profile versions can be activated");
      }
      await deps.db.query(
        `UPDATE marketing_brand_profiles
         SET status = 'superseded', superseded_at = now(), updated_at = now()
         WHERE project_id = $1 AND status = 'active'`,
        [row.project_id],
      );
      await deps.db.query(
        `UPDATE marketing_brand_profiles
         SET status = 'active', activated_by_admin_id = $2, activated_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'draft'`,
        [brandProfileId, actorAdminId],
      );
      await deps.db.query(
        "UPDATE marketing_projects SET active_brand_profile_id = $2, updated_at = now() WHERE id = $1",
        [row.project_id, brandProfileId],
      );
      await deps.db.query(
        `UPDATE marketing_campaigns SET brand_profile_id = $2, updated_at = now()
         WHERE project_id = $1 AND status IN ('draft', 'active')`,
        [row.project_id, brandProfileId],
      );
      await staleProjectContent(row.project_id);
      await staleProjectResearchBriefs(row.project_id);
      await staleProjectPublishJobs(row.project_id, "brand_profile_changed");
      await audit({ projectId: row.project_id, actorAdminId, eventType: "brand_profile.activated", detail: { brandProfileId } });
      await deps.db.query("COMMIT");
      return { id: brandProfileId, status: "active" };
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
  }

  async function revokeBrandProfile(brandProfileId: string, actorAdminId: string) {
    const revoked = await deps.db.query<{ project_id: string }>(
      `UPDATE marketing_brand_profiles
       SET status = 'revoked', revoked_by_admin_id = $2, revoked_at = now(), updated_at = now()
       WHERE id = $1 AND status IN ('draft', 'superseded')
       RETURNING project_id`,
      [brandProfileId, actorAdminId],
    );
    if (!revoked.rows[0]) {
      throw new MarketingError(409, "marketing_brand_profile_not_revocable", "Active or unavailable brand profiles cannot be revoked");
    }
    await audit({ projectId: revoked.rows[0].project_id, actorAdminId, eventType: "brand_profile.revoked", detail: { brandProfileId } });
    return { id: brandProfileId, status: "revoked" };
  }

  async function listBrandProfiles(projectId: string) {
    await requireProject(projectId);
    const profiles = await deps.db.query<{ id: string; version: string; profile_json: Json; status: string; created_at: Date; activated_at: Date | null }>(
      `SELECT id, version, profile_json, status, created_at, activated_at
       FROM marketing_brand_profiles WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
    return profiles.rows.map((profile) => ({
      id: profile.id, version: profile.version, profile: profile.profile_json, status: profile.status,
      createdAt: new Date(profile.created_at).toISOString(), activatedAt: profile.activated_at ? new Date(profile.activated_at).toISOString() : null,
    }));
  }

  async function addSource(projectId: string, input: MarketingSourceInput, actorAdminId: string) {
    requireText(input.sourceNamespace, "marketing_source_namespace_required");
    requireText(input.sourceRecordId, "marketing_source_record_id_required");
    requireText(input.sourceVersion, "marketing_source_version_required");
    requireText(input.authorizationStatus, "marketing_source_authorization_required");
    await requireProject(projectId);
    const sourceUrl = normalizeOptionalHttpsUrl(input.sourceUrl, "marketing_source_url_invalid");
    const contentHash = normalizeOptionalSha256(input.contentHash, "marketing_source_content_hash_invalid");
    if (sourceUrl && contentHash) {
      const duplicate = await deps.db.query<{ id: string }>(
        `SELECT id FROM marketing_sources
         WHERE project_id = $1 AND source_url = $2 AND content_hash = $3 AND status = 'active'
         LIMIT 1`,
        [projectId, sourceUrl, contentHash],
      );
      if (duplicate.rows[0]) {
        throw new MarketingError(409, "marketing_source_duplicate", "An active source already has this URL and content hash");
      }
    }
    const previous = await deps.db.query<{ id: string }>(
      `SELECT id FROM marketing_sources
       WHERE project_id = $1 AND source_namespace = $2 AND source_record_id = $3 AND status = 'active'
       LIMIT 1`,
      [projectId, input.sourceNamespace, input.sourceRecordId],
    );
    const id = randomUUID();
    await deps.db.query("BEGIN");
    try {
      await deps.db.query(
        `INSERT INTO marketing_sources (
           id, project_id, source_namespace, source_record_id, source_version,
           source_snapshot, source_url, content_hash, authorization_status, created_by_admin_id
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
        [
          id, projectId, input.sourceNamespace, input.sourceRecordId, input.sourceVersion,
          json(input.sourceSnapshot), sourceUrl, contentHash,
          input.authorizationStatus, actorAdminId,
        ],
      );
      if (previous.rows[0]) {
        await deps.db.query(
          `UPDATE marketing_sources
           SET status = 'revoked', authorization_status = 'revoked', revoked_at = now(), updated_at = now()
           WHERE id = $1 AND status = 'active'`,
          [previous.rows[0].id],
        );
        await deps.db.query(
          `UPDATE marketing_knowledge_documents
           SET status = 'revoked', revoked_at = now(), updated_at = now()
           WHERE source_id = $1 AND status IN ('draft', 'approved')`,
          [previous.rows[0].id],
        );
        await deps.db.query(
          `UPDATE marketing_trend_patterns SET status = 'revoked'
           WHERE source_id = $1 AND status IN ('draft', 'approved')`,
          [previous.rows[0].id],
        );
        await staleProjectContent(projectId);
        await staleProjectResearchBriefs(projectId);
        await staleProjectPublishJobs(projectId, "source_version_changed");
        await audit({ projectId, actorAdminId, eventType: "source.superseded", detail: { sourceId: previous.rows[0].id, replacementSourceId: id } });
      }
      await audit({ projectId, actorAdminId, eventType: "source.created", detail: { sourceId: id } });
      await deps.db.query("COMMIT");
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
    return { id };
  }

  async function revokeSource(projectId: string, sourceId: string, actorAdminId: string) {
    await deps.db.query("BEGIN");
    try {
      const changed = await deps.db.query<{ id: string }>(
        `UPDATE marketing_sources
         SET status = 'revoked', authorization_status = 'revoked', revoked_at = now(), updated_at = now()
         WHERE id = $1 AND project_id = $2 AND status = 'active'
         RETURNING id`,
        [sourceId, projectId],
      );
      if (!changed.rows[0]) throw new MarketingError(404, "marketing_source_not_found", "Marketing source was not found");
      await deps.db.query(
        `UPDATE marketing_knowledge_documents
         SET status = 'revoked', revoked_at = now(), updated_at = now()
         WHERE source_id = $1 AND status IN ('draft', 'approved')`,
        [sourceId],
      );
      await deps.db.query(
        `UPDATE marketing_trend_patterns
         SET status = 'revoked'
         WHERE source_id = $1 AND status IN ('draft', 'approved')`,
        [sourceId],
      );
    await staleProjectContent(projectId);
    await staleProjectResearchBriefs(projectId);
    await staleProjectPublishJobs(projectId, "source_revoked");
      await audit({ projectId, actorAdminId, eventType: "source.revoked", detail: { sourceId } });
      await deps.db.query("COMMIT");
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
    return { id: sourceId, revoked: true };
  }

  async function createKnowledgeDocument(input: {
    projectId?: string | null; sourceId?: string | null; title: string; documentType: string; version: string;
    authorizationStatus: string; content: string; applicablePlatforms?: string[]; confidenceScore?: number;
  }, actorAdminId: string) {
    requireText(input.title, "marketing_knowledge_title_required");
    requireText(input.documentType, "marketing_knowledge_type_required");
    requireText(input.version, "marketing_knowledge_version_required");
    requireText(input.content, "marketing_knowledge_content_required");
    if (input.authorizationStatus !== "owned" && input.authorizationStatus !== "authorized") {
      throw new MarketingError(409, "marketing_knowledge_authorization_required", "Knowledge documents require owned or authorized sources");
    }
    if (input.projectId) await requireProject(input.projectId);
    let effectiveProjectId = input.projectId ?? null;
    if (input.sourceId) {
      const source = await deps.db.query<{ id: string; project_id: string }>(
        `SELECT id, project_id FROM marketing_sources
         WHERE id = $1 AND status = 'active' AND authorization_status IN ('owned', 'authorized')`,
        [input.sourceId],
      );
      if (!source.rows[0]) throw new MarketingError(409, "marketing_knowledge_source_invalid", "Knowledge source is unavailable or unauthorized");
      if (effectiveProjectId && source.rows[0].project_id !== effectiveProjectId) {
        throw new MarketingError(409, "marketing_knowledge_source_project_mismatch", "Knowledge source does not belong to the selected project");
      }
      effectiveProjectId ??= source.rows[0].project_id;
    }
    const confidenceScore = Math.max(0, Math.min(100, Math.floor(Number(input.confidenceScore ?? 50))));
    const id = randomUUID();
    const segments = splitKnowledgeContent(input.content);
    await deps.db.query("BEGIN");
    try {
      await deps.db.query(
        `INSERT INTO marketing_knowledge_documents (
           id, project_id, title, document_type, source_id, authorization_status, version,
           applicable_platforms_json, confidence_score, created_by_admin_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
        [id, effectiveProjectId, input.title.trim(), input.documentType.trim(), input.sourceId ?? null,
          input.authorizationStatus, input.version.trim(), json(input.applicablePlatforms ?? []), confidenceScore, actorAdminId],
      );
      if (segments.length) {
        const values: unknown[] = [];
        const placeholders = segments.map((content, index) => {
          const offset = values.length;
          values.push(randomUUID(), id, index + 1, content, content.slice(0, 180));
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
        });
        await deps.db.query(
          `INSERT INTO marketing_knowledge_segments (id, document_id, sequence_number, content, summary)
           VALUES ${placeholders.join(", ")}`,
          values,
        );
      }
      await audit({ projectId: effectiveProjectId ?? undefined, actorAdminId, eventType: "knowledge.created", detail: { documentId: id, segmentCount: segments.length } });
      await deps.db.query("COMMIT");
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
    return { id, segmentCount: segments.length, status: "draft" };
  }

  async function approveKnowledgeDocument(documentId: string, actorAdminId: string) {
    const updated = await deps.db.query<{ id: string; project_id: string | null }>(
      `UPDATE marketing_knowledge_documents AS document
       SET status = 'approved', approved_by_admin_id = $2, updated_at = now()
       WHERE document.id = $1 AND document.status = 'draft'
         AND document.authorization_status IN ('owned', 'authorized')
         AND (document.source_id IS NULL OR EXISTS (
           SELECT 1 FROM marketing_sources AS source
           WHERE source.id = document.source_id AND source.status = 'active'
         ))
       RETURNING document.id, document.project_id`,
      [documentId, actorAdminId],
    );
    if (!updated.rows[0]) throw new MarketingError(409, "marketing_knowledge_not_approvable", "Knowledge document cannot be approved");
    await audit({ projectId: updated.rows[0].project_id ?? undefined, actorAdminId, eventType: "knowledge.approved", detail: { documentId } });
    return { id: documentId, status: "approved" };
  }

  async function searchKnowledge(input: { projectId?: string | null; platform?: string | null; query: string; limit?: number }) {
    requireText(input.query, "marketing_knowledge_query_required");
    const limit = Math.max(1, Math.min(8, Math.floor(Number(input.limit ?? 8))));
    const result = await deps.db.query<{
      id: string; document_id: string; content: string; summary: string; source_url: string | null; title: string; confidence_score: number;
    }>(
      `SELECT segment.id, segment.document_id, segment.content, segment.summary, source.source_url, document.title, document.confidence_score
       FROM marketing_knowledge_segments AS segment
       JOIN marketing_knowledge_documents AS document ON document.id = segment.document_id
       LEFT JOIN marketing_sources AS source ON source.id = document.source_id
       WHERE document.status = 'approved'
         AND (source.id IS NULL OR source.status = 'active')
         AND ($1::uuid IS NULL OR document.project_id = $1::uuid OR document.project_id IS NULL)
         AND ($2::text IS NULL OR document.applicable_platforms_json = '[]'::jsonb OR document.applicable_platforms_json @> jsonb_build_array($2::text))
         AND (segment.content ILIKE '%' || $3::text || '%' OR document.title ILIKE '%' || $3::text || '%')
       ORDER BY document.confidence_score DESC, segment.created_at DESC
       LIMIT $4`,
      [input.projectId ?? null, input.platform ?? null, input.query.trim(), limit],
    );
    return result.rows;
  }

  async function createCampaign(input: MarketingCampaignInput, actorAdminId: string) {
    requireText(input.name, "marketing_campaign_name_required");
    requireText(input.objective, "marketing_campaign_objective_required");
    await requireProject(input.projectId);
    const brandProfileId = await requireActiveBrandProfile(input.projectId, input.brandProfileId ?? null);
    const id = randomUUID();
    await deps.db.query(
      `INSERT INTO marketing_campaigns (
        id, project_id, name, objective, audience_json, platform_constraints_json,
        prohibited_expressions_json, schedule_window_json, brand_profile_id, created_by_admin_id
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)`,
      [
        id, input.projectId, input.name.trim(), input.objective.trim(), json(input.audience ?? {}),
        json(input.platformConstraints ?? {}), json(input.prohibitedExpressions ?? []),
        json(input.scheduleWindow ?? {}), brandProfileId, actorAdminId,
      ],
    );
    await audit({ projectId: input.projectId, campaignId: id, actorAdminId, eventType: "campaign.created", detail: {} });
    return { id };
  }

  async function createCompetitorCollectionJob(input: MarketingCompetitorCollectionJobInput, actorAdminId: string) {
    requireText(input.projectId, "marketing_competitor_project_required");
    requireText(input.name, "marketing_competitor_job_name_required");
    requireText(input.queryText, "marketing_competitor_query_required");
    if (input.collectionMode !== "keyword" && input.collectionMode !== "creator") {
      throw new MarketingError(400, "marketing_competitor_collection_mode_invalid", "Collection mode must be keyword or creator");
    }
    await requireProject(input.projectId);
    if (input.campaignId) {
      const campaign = await deps.db.query<{ id: string }>(
        "SELECT id FROM marketing_campaigns WHERE id = $1 AND project_id = $2 AND status IN ('draft', 'active')",
        [input.campaignId, input.projectId],
      );
      if (!campaign.rows[0]) throw new MarketingError(409, "marketing_competitor_campaign_scope_invalid", "Campaign is unavailable for this project");
    }
    const maxItems = boundedInteger(input.maxItems, 30, 1, 100, "marketing_competitor_max_items_invalid");
    const intervalMinutes = boundedInteger(input.intervalMinutes, 360, 15, 10_080, "marketing_competitor_interval_invalid");
    const id = randomUUID();
    await deps.db.query(
      `INSERT INTO marketing_competitor_collection_jobs (
         id, project_id, campaign_id, name, collection_mode, query_text, crawler_base_url,
         max_items, include_comments, interval_minutes, created_by_admin_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id, input.projectId, input.campaignId ?? null, input.name.trim(), input.collectionMode,
        input.queryText.trim(), normalizeCrawlerBaseUrl(input.crawlerBaseUrl), maxItems,
        input.includeComments !== false, intervalMinutes, actorAdminId,
      ],
    );
    await audit({ projectId: input.projectId, campaignId: input.campaignId ?? undefined, actorAdminId,
      eventType: "competitor_collection_job.created", detail: { jobId: id, collectionMode: input.collectionMode, maxItems, intervalMinutes } });
    return { id, status: "active" };
  }

  async function listCompetitorCollectionJobs(projectId: string) {
    await requireProject(projectId);
    const result = await deps.db.query<{
      id: string; campaign_id: string | null; name: string; collection_mode: string; query_text: string;
      crawler_base_url: string; max_items: number; include_comments: boolean; interval_minutes: number;
      status: string; next_run_at: Date; last_run_at: Date | null; latest_run_status: string | null;
      latest_prompt_package_json: Json | null; latest_failure_code: string | null;
    }>(
      `SELECT job.id, job.campaign_id, job.name, job.collection_mode, job.query_text, job.crawler_base_url,
              job.max_items, job.include_comments, job.interval_minutes, job.status, job.next_run_at, job.last_run_at,
              run.status AS latest_run_status, run.prompt_package_json AS latest_prompt_package_json,
              run.failure_code AS latest_failure_code
       FROM marketing_competitor_collection_jobs AS job
       LEFT JOIN LATERAL (
         SELECT status, prompt_package_json, failure_code
         FROM marketing_competitor_collection_runs
         WHERE job_id = job.id ORDER BY created_at DESC LIMIT 1
       ) AS run ON true
       WHERE job.project_id = $1
       ORDER BY job.created_at DESC`,
      [projectId],
    );
    return result.rows.map((row) => ({
      id: row.id, campaignId: row.campaign_id, name: row.name, collectionMode: row.collection_mode,
      queryText: row.query_text, crawlerBaseUrl: row.crawler_base_url, maxItems: row.max_items,
      includeComments: row.include_comments, intervalMinutes: row.interval_minutes, status: row.status,
      nextRunAt: new Date(row.next_run_at).toISOString(), lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null,
      latestRunStatus: row.latest_run_status, promptPackage: row.latest_prompt_package_json ?? {}, failureCode: row.latest_failure_code,
    }));
  }

  async function updateCompetitorCollectionJob(jobId: string, input: MarketingCompetitorCollectionJobUpdateInput, actorAdminId: string) {
    requireText(jobId, "marketing_competitor_job_required");
    requireText(input.projectId, "marketing_competitor_project_required");
    requireText(input.name, "marketing_competitor_job_name_required");
    requireText(input.queryText, "marketing_competitor_query_required");
    if (input.collectionMode !== "keyword" && input.collectionMode !== "creator") {
      throw new MarketingError(400, "marketing_competitor_collection_mode_invalid", "Collection mode must be keyword or creator");
    }
    if (!["active", "paused", "disabled"].includes(input.status)) {
      throw new MarketingError(400, "marketing_competitor_collection_status_invalid", "Collection status is invalid");
    }
    await requireProject(input.projectId);
    if (input.campaignId) {
      const campaign = await deps.db.query<{ id: string }>(
        "SELECT id FROM marketing_campaigns WHERE id = $1 AND project_id = $2 AND status IN ('draft', 'active')",
        [input.campaignId, input.projectId],
      );
      if (!campaign.rows[0]) throw new MarketingError(409, "marketing_competitor_campaign_scope_invalid", "Campaign is unavailable for this project");
    }
    const maxItems = boundedInteger(input.maxItems, 30, 1, 100, "marketing_competitor_max_items_invalid");
    const intervalMinutes = boundedInteger(input.intervalMinutes, 360, 15, 10_080, "marketing_competitor_interval_invalid");
    const updated = await deps.db.query<{ project_id: string; campaign_id: string | null }>(
      `UPDATE marketing_competitor_collection_jobs
       SET project_id = $2, campaign_id = $3, name = $4, collection_mode = $5, query_text = $6,
           crawler_base_url = $7, max_items = $8, include_comments = $9, interval_minutes = $10,
           status = $11, next_run_at = CASE WHEN $11 = 'active' AND status <> 'active' THEN now() ELSE next_run_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING project_id, campaign_id`,
      [jobId, input.projectId, input.campaignId ?? null, input.name.trim(), input.collectionMode,
        input.queryText.trim(), normalizeCrawlerBaseUrl(input.crawlerBaseUrl), maxItems,
        input.includeComments !== false, intervalMinutes, input.status],
    );
    if (!updated.rows[0]) throw new MarketingError(404, "marketing_competitor_job_not_found", "Collection job was not found");
    await audit({ projectId: updated.rows[0].project_id, campaignId: updated.rows[0].campaign_id ?? undefined, actorAdminId,
      eventType: "competitor_collection_job.updated", detail: { jobId, collectionMode: input.collectionMode, maxItems, intervalMinutes, status: input.status } });
    return { id: jobId, status: input.status };
  }

  async function createResearchBrief(input: {
    campaignId: string;
    brief: Json;
    sourceIds: string[];
  }, actorAdminId: string) {
    const sourceIds = [...new Set(input.sourceIds.map((id) => id.trim()).filter(Boolean))];
    if (!sourceIds.length || sourceIds.length > 20) {
      throw new MarketingError(400, "marketing_research_sources_invalid", "Research briefs require between 1 and 20 sources");
    }
    const campaign = await deps.db.query<{ project_id: string }>(
      "SELECT project_id FROM marketing_campaigns WHERE id = $1 AND status IN ('draft', 'active')",
      [input.campaignId],
    );
    if (!campaign.rows[0]) throw new MarketingError(404, "marketing_campaign_not_found", "Marketing campaign was not found");
    const sources = await deps.db.query<{ id: string }>(
      `SELECT id FROM marketing_sources
       WHERE project_id = $1 AND id = ANY($2::uuid[]) AND status = 'active'
         AND authorization_status <> 'revoked'`,
      [campaign.rows[0].project_id, sourceIds],
    );
    if (new Set(sources.rows.map((source) => source.id)).size !== sourceIds.length) {
      throw new MarketingError(409, "marketing_research_source_scope_invalid", "Research sources are unavailable for the selected campaign");
    }
    const id = randomUUID();
    await deps.db.query(
      `INSERT INTO marketing_research_briefs (
         id, campaign_id, brief_json, source_ids_json, created_by_admin_id
       ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
      [id, input.campaignId, json(input.brief), json(sourceIds), actorAdminId],
    );
    await audit({ campaignId: input.campaignId, actorAdminId, eventType: "research_brief.created", detail: { researchBriefId: id, sourceIds } });
    return { id, status: "draft" };
  }

  async function reviewResearchBrief(input: {
    researchBriefId: string;
    decision: "approve" | "reject";
    notes: string;
  }, actorAdminId: string) {
    if (input.decision !== "approve" && input.decision !== "reject") {
      throw new MarketingError(400, "marketing_research_review_decision_invalid", "Research review decision is invalid");
    }
    requireText(input.notes, "marketing_research_review_notes_required");
    const targetStatus = input.decision === "approve" ? "approved" : "rejected";
    const updated = await deps.db.query<{ campaign_id: string }>(
      `UPDATE marketing_research_briefs AS brief
       SET status = $2, reviewed_by_admin_id = $3, review_notes = $4,
           reviewed_at = now(), approved_by_admin_id = CASE WHEN $2 = 'approved' THEN $3::uuid ELSE NULL END,
           approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END, updated_at = now()
       WHERE brief.id = $1 AND brief.status = 'draft'
         AND NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(brief.source_ids_json) AS source_id(value)
           LEFT JOIN marketing_sources AS source ON source.id = source_id.value::uuid
           JOIN marketing_campaigns AS campaign ON campaign.id = brief.campaign_id
           WHERE source.id IS NULL OR source.project_id <> campaign.project_id
             OR source.status <> 'active' OR source.authorization_status = 'revoked'
         )
       RETURNING brief.campaign_id`,
      [input.researchBriefId, targetStatus, actorAdminId, input.notes.trim()],
    );
    if (!updated.rows[0]) {
      throw new MarketingError(409, "marketing_research_brief_not_reviewable", "Research brief is stale, unavailable, or already reviewed");
    }
    await audit({ campaignId: updated.rows[0].campaign_id, actorAdminId, eventType: `research_brief.${targetStatus}`, detail: { researchBriefId: input.researchBriefId, notes: input.notes.trim() } });
    return { id: input.researchBriefId, status: targetStatus };
  }

  async function createContentVariant(input: MarketingContentInput, actorAdminId: string) {
    requireText(input.platform, "marketing_content_platform_required");
    requireText(input.trackingKey, "marketing_content_tracking_key_required");
    await requireCampaign(input.campaignId);
    const campaignBrand = await deps.db.query<{ brand_profile_id: string | null }>(
      "SELECT brand_profile_id FROM marketing_campaigns WHERE id = $1",
      [input.campaignId],
    );
    if (!campaignBrand.rows[0]?.brand_profile_id) {
      throw new MarketingError(409, "marketing_campaign_brand_profile_required", "Marketing campaigns require an active brand profile");
    }
    const campaignLimits = await deps.db.query<{ platform_constraints_json: Json }>(
      "SELECT platform_constraints_json FROM marketing_campaigns WHERE id = $1 AND status IN ('draft', 'active')",
      [input.campaignId],
    );
    const limits = campaignLimits.rows[0] ? jsonValue(campaignLimits.rows[0].platform_constraints_json) : {};
    const maxGeneratedContent = campaignLimit(limits, "maxGeneratedContent", 10_000);
    if (maxGeneratedContent !== null) {
      const existing = await deps.db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM marketing_content_variants WHERE campaign_id = $1 AND status <> 'rejected'",
        [input.campaignId],
      );
      if ((existing.rows[0]?.count ?? 0) >= maxGeneratedContent) {
        throw new MarketingError(409, "marketing_campaign_content_limit_reached", "Campaign content generation limit has been reached");
      }
    }
    const maxVideoDurationSeconds = campaignLimit(limits, "maxVideoDurationSeconds", 86_400);
    if (input.contentType === "video" && maxVideoDurationSeconds !== null) {
      assertCampaignVideoDuration(input.assetManifest ?? [], maxVideoDurationSeconds);
    }
    if (!input.knowledgeSegmentIds?.length) {
      throw new MarketingError(409, "marketing_knowledge_citations_required", "Marketing content must cite approved knowledge segments");
    }
    await requireCampaignKnowledgeSegments(input.campaignId, input.knowledgeSegmentIds, true, input.platform);
    const id = randomUUID();
    await deps.db.query(
      `INSERT INTO marketing_content_variants (
        id, campaign_id, platform, content_type, title, body_json, asset_manifest_json,
        knowledge_segment_ids_json, compliance_report_json, tracking_key, brand_profile_id, created_by_admin_id
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12)`,
      [
        id, input.campaignId, input.platform, input.contentType, input.title?.trim() ?? "",
        json(input.body), json(input.assetManifest ?? []), json(input.knowledgeSegmentIds ?? []),
        json(input.complianceReport ?? {}), input.trackingKey, campaignBrand.rows[0].brand_profile_id, actorAdminId,
      ],
    );
    await audit({ campaignId: input.campaignId, contentVariantId: id, actorAdminId, eventType: "content.created", detail: {} });
    return { id };
  }

  async function savePlatformCapabilityProfile(input: {
    platform: string; version: string; capability: Json; rules: Json;
  }, actorAdminId: string) {
    requireText(input.platform, "marketing_platform_required");
    requireText(input.version, "marketing_platform_version_required");
    const id = randomUUID();
    await deps.db.query("BEGIN");
    try {
      await deps.db.query(
        `UPDATE marketing_platform_capability_profiles
         SET status = 'retired', retired_at = now()
         WHERE platform = $1 AND status = 'active'`,
        [input.platform],
      );
      await deps.db.query(
        `INSERT INTO marketing_platform_capability_profiles (
           id, platform, version, capability_json, rule_json, created_by_admin_id
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
        [id, input.platform, input.version, json(input.capability), json(input.rules), actorAdminId],
      );
      await deps.db.query(
        `UPDATE marketing_content_variants AS variant
         SET status = 'stale', updated_at = now()
         WHERE variant.platform = $1 AND variant.status IN ('draft', 'manual_review_required', 'approved')`,
        [input.platform],
      );
    await stalePlatformPublishJobs(input.platform, "platform_rules_changed");
      await audit({ actorAdminId, eventType: "platform_profile.updated", detail: { platform: input.platform, version: input.version } });
      await deps.db.query("COMMIT");
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
    return { id, status: "active" };
  }

  async function runComplianceCheck(contentVariantId: string, actorAdminId: string) {
    const variant = await deps.db.query<{
      id: string; campaign_id: string; platform: string; content_type: string; title: string; body_json: Json; asset_manifest_json: Json;
      prohibited_expressions_json: Json; brand_profile_json: Json | null;
    }>(
      `SELECT variant.id, variant.campaign_id, variant.platform, variant.content_type, variant.title, variant.body_json, variant.asset_manifest_json,
              campaign.prohibited_expressions_json, profile.profile_json AS brand_profile_json
       FROM marketing_content_variants AS variant
       JOIN marketing_campaigns AS campaign ON campaign.id = variant.campaign_id
       LEFT JOIN marketing_brand_profiles AS profile ON profile.id = variant.brand_profile_id
       WHERE variant.id = $1`,
      [contentVariantId],
    );
    const row = variant.rows[0];
    if (!row) throw new MarketingError(404, "marketing_content_not_found", "Marketing content was not found");
    const profile = await deps.db.query<{ id: string; version: string; capability_json: Json; rule_json: Json }>(
      `SELECT id, version, capability_json, rule_json
       FROM marketing_platform_capability_profiles
       WHERE platform = $1 AND status = 'active'
       ORDER BY effective_at DESC LIMIT 1`,
      [row.platform],
    );
    const profileRow = profile.rows[0] ?? null;
    const body = jsonValue(row.body_json) as Record<string, unknown>;
    const brandProfile = (row.brand_profile_json ? jsonValue(row.brand_profile_json) : {}) as Record<string, unknown>;
    const capability = (profileRow ? jsonValue(profileRow.capability_json) : {}) as Record<string, unknown>;
    const rules = (profileRow ? jsonValue(profileRow.rule_json) : {}) as Record<string, unknown>;
    const prohibited = [
      ...stringArray(row.prohibited_expressions_json),
      ...stringArray(brandProfile.prohibitedExpressions),
      ...stringArray(rules.prohibitedExpressions),
    ].map((item) => item.trim()).filter(Boolean);
    const text = `${row.title}\n${JSON.stringify(body)}`;
    const findings: Array<{ code: string; risk: "medium" | "high"; evidence: string; suggestion: string }> = [];
    if (!profileRow) {
      findings.push({
        code: "platform_profile_missing",
        risk: "high",
        evidence: row.platform,
        suggestion: "Configure and review the active platform capability and rule profile",
      });
    } else if (row.content_type === "video" && !booleanConfig(capability, "supportsVideo", "video")) {
      findings.push({
        code: "platform_video_unsupported",
        risk: "high",
        evidence: row.platform,
        suggestion: "Enable the verified video capability or use an allowed content type",
      });
    } else if (row.content_type === "image" && !booleanConfig(capability, "supportsImagePost", "imagePost", "image")) {
      findings.push({
        code: "platform_image_unsupported",
        risk: "high",
        evidence: row.platform,
        suggestion: "Enable the verified image-post capability or use an allowed content type",
      });
    }
    for (const expression of prohibited) {
      if (text.includes(expression)) {
        findings.push({ code: "prohibited_expression", risk: "high", evidence: expression, suggestion: "Remove the prohibited expression" });
      }
    }
    const checks: Array<[RegExp, string, "medium" | "high", string]> = [
      [/(保证|永久|第一|最强|绝对|100%|稳赚|暴富)/u, "exaggerated_claim", "high", "Use factual, qualified language"],
      [/(治疗|治愈|处方|药效|理财收益|保本|荐股)/u, "regulated_claim", "high", "Require specialist review and supported claims"],
      [/(私信|加微信|扫码|点击链接|http:\/\/|https:\/\/)/u, "external_diversion", "medium", "Use only platform-approved navigation"],
    ];
    for (const [pattern, code, risk, suggestion] of checks) {
      const matched = text.match(pattern)?.[0];
      if (matched) findings.push({ code, risk, evidence: matched, suggestion });
    }
    const disclosures = stringArray(body.disclosures);
    if ((rules.requiresDisclosure === true || brandProfile.requiresDisclosure === true
      || stringArray(brandProfile.disclosureRequirements).length > 0) && disclosures.length === 0) {
      findings.push({ code: "disclosure_missing", risk: "medium", evidence: "", suggestion: "Add the required disclosure" });
    }
    const tags = stringArray(body.tags);
    if (tags.length && profileRow && !booleanConfig(capability, "supportsTags", "tags")) {
      findings.push({
        code: "platform_tags_unsupported",
        risk: "high",
        evidence: String(tags.length),
        suggestion: "Remove tags or enable the verified platform tag capability",
      });
    }
    const maxTags = boundedRuleInteger(rules.maxTags, 30);
    if (maxTags !== null && tags.length > maxTags) {
      findings.push({ code: "platform_tag_limit_exceeded", risk: "high", evidence: String(tags.length), suggestion: `Use no more than ${maxTags} tags` });
    }
    const maxTitleLength = boundedRuleInteger(rules.maxTitleLength, 300);
    if (maxTitleLength !== null && row.title.length > maxTitleLength) {
      findings.push({ code: "platform_title_limit_exceeded", risk: "high", evidence: String(row.title.length), suggestion: `Limit the title to ${maxTitleLength} characters` });
    }
    const description = typeof body.description === "string" ? body.description : "";
    const maxDescriptionLength = boundedRuleInteger(rules.maxDescriptionLength, 10_000);
    if (maxDescriptionLength !== null && description.length > maxDescriptionLength) {
      findings.push({ code: "platform_description_limit_exceeded", risk: "high", evidence: String(description.length), suggestion: `Limit the description to ${maxDescriptionLength} characters` });
    }
    const assetManifest = Array.isArray(row.asset_manifest_json) ? row.asset_manifest_json : [];
    if (assetManifest.some((asset) => {
      const record = asset && typeof asset === "object" ? asset as Record<string, unknown> : {};
      return record.authorizationStatus !== "owned" && record.authorizationStatus !== "authorized";
    })) {
      findings.push({ code: "asset_authorization_unknown", risk: "high", evidence: "", suggestion: "Confirm asset authorization" });
    }
    const similarityCandidates = await deps.db.query<{
      id: string; platform: string; content_type: "image" | "video"; title: string; body_json: Json; asset_manifest_json: Json;
    }>(
      `SELECT candidate.id, candidate.platform, candidate.content_type, candidate.title, candidate.body_json, candidate.asset_manifest_json
       FROM marketing_content_variants AS candidate
       JOIN marketing_campaigns AS candidate_campaign ON candidate_campaign.id = candidate.campaign_id
       JOIN marketing_campaigns AS current_campaign ON current_campaign.id = $1
       WHERE candidate_campaign.project_id = current_campaign.project_id
         AND candidate.id <> $2
         AND candidate.status IN ('draft', 'manual_review_required', 'approved', 'published')
       ORDER BY candidate.created_at DESC, candidate.id DESC
       LIMIT 200`,
      [row.campaign_id, row.id],
    );
    const similarity = findMarketingContentSimilarity({
      contentId: row.id,
      platform: row.platform,
      contentType: row.content_type as "image" | "video",
      text: `${row.title}\n${JSON.stringify(body)}`,
      assetStorageObjectIds: marketingAssetStorageObjectIds(assetManifest),
      candidates: similarityCandidates.rows.map((candidate) => ({
        id: candidate.id,
        platform: candidate.platform,
        contentType: candidate.content_type,
        text: `${candidate.title}\n${JSON.stringify(jsonValue(candidate.body_json))}`,
        assetStorageObjectIds: marketingAssetStorageObjectIds(candidate.asset_manifest_json),
      })),
    });
    if (similarity) {
      const highRisk = similarity.kind === "text" && similarity.score >= 0.84;
      findings.push({
        code: similarity.kind === "asset" ? "content_asset_reuse" : highRisk ? "content_similarity_high" : "content_similarity_medium",
        risk: highRisk ? "high" : "medium",
        evidence: `content=${similarity.candidateId}; scope=${similarity.scope}; score=${similarity.score.toFixed(2)}`,
        suggestion: similarity.kind === "asset"
          ? "Confirm the cross-posting rights and intended reuse of the approved asset"
          : "Rewrite the title, script, subtitles, and visual instructions before publishing",
      });
    }
    const riskLevel = findings.some((finding) => finding.risk === "high") ? "high" : findings.length ? "medium" : "low";
    const requiresManualReview = findings.some((finding) => finding.risk === "high"
      || finding.code === "external_diversion" || finding.code === "disclosure_missing"
      || finding.code === "content_similarity_medium" || finding.code === "content_asset_reuse");
    const status = requiresManualReview ? "manual_review_required" : "passed";
    const report = { passed: status === "passed", status, riskLevel, findings, profileVersion: profileRow?.version ?? null };
    const id = randomUUID();
    await deps.db.query(
      `INSERT INTO marketing_compliance_checks (
         id, content_variant_id, platform_profile_id, status, risk_level, findings_json, rule_snapshot_json, reviewed_by_admin_id, reviewed_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, now())`,
      [id, contentVariantId, profileRow?.id ?? null, status, riskLevel, json(findings), json({ platform: row.platform, profileVersion: profileRow?.version ?? null, rules }), actorAdminId],
    );
    await deps.db.query(
      `UPDATE marketing_content_variants
       SET compliance_report_json = $2::jsonb, status = $3, updated_at = now()
       WHERE id = $1`,
      [contentVariantId, json(report), status === "passed" ? "draft" : "manual_review_required"],
    );
    await audit({ campaignId: row.campaign_id, contentVariantId, actorAdminId, eventType: "content.compliance_checked", detail: report });
    return { id, ...report };
  }

  async function approveContentVariant(contentVariantId: string, actorAdminId: string) {
    const updated = await deps.db.query<{ id: string; campaign_id: string }>(
      `UPDATE marketing_content_variants
       SET status = 'approved', approved_by_admin_id = $2, approved_at = now(), updated_at = now()
       WHERE id = $1
         AND status = 'draft'
         AND (
           SELECT compliance.status
           FROM marketing_compliance_checks AS compliance
           WHERE compliance.content_variant_id = marketing_content_variants.id
           ORDER BY compliance.reviewed_at DESC, compliance.created_at DESC
           LIMIT 1
         ) = 'passed'
       RETURNING id, campaign_id`,
      [contentVariantId, actorAdminId],
    );
    if (!updated.rows[0]) {
      throw new MarketingError(409, "marketing_content_not_approvable", "Content must have a passed compliance check before approval");
    }
    await audit({ campaignId: updated.rows[0].campaign_id, contentVariantId, actorAdminId, eventType: "content.approved", detail: {} });
    return { id: contentVariantId, status: "approved" };
  }

  async function reviewContentVariant(input: {
    contentVariantId: string;
    decision: "approve" | "reject";
    reviewDimensions: {
      facts: boolean;
      assetRights: boolean;
      disclosure: boolean;
      platformRules: boolean;
    };
    notes: string;
    idempotencyKey: string;
  }, actorAdminId: string) {
    requireText(input.idempotencyKey, "marketing_manual_review_idempotency_required");
    requireText(input.notes, "marketing_manual_review_notes_required");
    if (input.decision !== "approve" && input.decision !== "reject") {
      throw new MarketingError(400, "marketing_manual_review_decision_invalid", "Manual review decision is invalid");
    }
    const dimensions = normalizeManualReviewDimensions(input.reviewDimensions);
    if (input.decision === "approve" && Object.values(dimensions).some((confirmed) => !confirmed)) {
      throw new MarketingError(409, "marketing_manual_review_dimensions_incomplete", "All manual review dimensions must be confirmed before approval");
    }
    const notes = input.notes.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    const existing = await deps.db.query<{
      id: string; decision: "approve" | "reject"; review_dimensions_json: Json; notes: string;
    }>(
      `SELECT id, decision, review_dimensions_json, notes
       FROM marketing_content_manual_reviews
       WHERE content_variant_id = $1 AND idempotency_key = $2`,
      [input.contentVariantId, idempotencyKey],
    );
    if (existing.rows[0]) {
      assertManualReviewIdempotency(existing.rows[0], input.decision, dimensions, notes);
      return manualReviewResult(input.contentVariantId, existing.rows[0].id, existing.rows[0].decision, true);
    }

    const variant = await deps.db.query<{
      id: string; campaign_id: string; project_id: string; platform: string; status: string;
      knowledge_segment_ids_json: Json; asset_manifest_json: Json;
      compliance_check_id: string | null; compliance_status: string | null; risk_level: string | null;
      platform_profile_id: string | null; active_platform_profile_id: string | null;
    }>(
      `SELECT variant.id, variant.campaign_id, campaign.project_id, variant.platform, variant.status,
              variant.knowledge_segment_ids_json, variant.asset_manifest_json,
              compliance.id AS compliance_check_id, compliance.status AS compliance_status,
              compliance.risk_level, compliance.platform_profile_id,
              active_profile.id AS active_platform_profile_id
       FROM marketing_content_variants AS variant
       JOIN marketing_campaigns AS campaign ON campaign.id = variant.campaign_id
       LEFT JOIN LATERAL (
         SELECT id, status, risk_level, platform_profile_id
         FROM marketing_compliance_checks
         WHERE content_variant_id = variant.id
         ORDER BY reviewed_at DESC NULLS LAST, created_at DESC, id DESC
         LIMIT 1
       ) AS compliance ON true
       LEFT JOIN LATERAL (
         SELECT id
         FROM marketing_platform_capability_profiles
         WHERE platform = variant.platform AND status = 'active'
         ORDER BY effective_at DESC, created_at DESC, id DESC
         LIMIT 1
       ) AS active_profile ON true
       WHERE variant.id = $1`,
      [input.contentVariantId],
    );
    const row = variant.rows[0];
    if (!row) throw new MarketingError(404, "marketing_content_not_found", "Marketing content was not found");
    if (row.status !== "manual_review_required" || row.compliance_status !== "manual_review_required" || !row.compliance_check_id) {
      throw new MarketingError(409, "marketing_manual_review_state_invalid", "Content is not awaiting manual review for its latest compliance check");
    }
    if (!row.active_platform_profile_id || row.platform_profile_id !== row.active_platform_profile_id) {
      throw new MarketingError(409, "marketing_manual_review_platform_profile_stale", "Content must be checked against the current platform profile before manual review");
    }

    const knowledgeSegmentIds = stringArray(row.knowledge_segment_ids_json);
    if (!knowledgeSegmentIds.length) {
      throw new MarketingError(409, "marketing_knowledge_citations_required", "Marketing content must cite approved knowledge segments");
    }
    await requireCampaignKnowledgeSegments(row.campaign_id, knowledgeSegmentIds, true, row.platform);
    const assetManifest = await requireAuthorizedContentAssets(row.asset_manifest_json);
    const reviewId = randomUUID();
    const targetStatus = input.decision === "approve" ? "approved" : "rejected";
    const evidenceSnapshot = {
      projectId: row.project_id,
      campaignId: row.campaign_id,
      platform: row.platform,
      complianceCheckId: row.compliance_check_id,
      platformProfileId: row.platform_profile_id,
      complianceStatus: row.compliance_status,
      riskLevel: row.risk_level,
      knowledgeSegmentIds,
      assetManifest,
    };

    await deps.db.query("BEGIN");
    try {
      const inserted = await deps.db.query<{ id: string }>(
        `INSERT INTO marketing_content_manual_reviews (
           id, content_variant_id, compliance_check_id, decision, review_dimensions_json,
           notes, evidence_snapshot_json, idempotency_key, reviewed_by_admin_id
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9)
         ON CONFLICT (content_variant_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [reviewId, input.contentVariantId, row.compliance_check_id, input.decision, json(dimensions), notes,
          json(evidenceSnapshot), idempotencyKey, actorAdminId],
      );
      if (!inserted.rows[0]) {
        const concurrent = await deps.db.query<{
          id: string; decision: "approve" | "reject"; review_dimensions_json: Json; notes: string;
        }>(
          `SELECT id, decision, review_dimensions_json, notes
           FROM marketing_content_manual_reviews
           WHERE content_variant_id = $1 AND idempotency_key = $2`,
          [input.contentVariantId, idempotencyKey],
        );
        const concurrentReview = concurrent.rows[0];
        if (!concurrentReview) throw new MarketingError(409, "marketing_manual_review_idempotency_conflict", "Manual review idempotency conflict");
        assertManualReviewIdempotency(concurrentReview, input.decision, dimensions, notes);
        await deps.db.query("COMMIT");
        return manualReviewResult(input.contentVariantId, concurrentReview.id, concurrentReview.decision, true);
      }
      const updated = await deps.db.query<{ id: string }>(
        `UPDATE marketing_content_variants
         SET status = $2,
             approved_by_admin_id = CASE WHEN $2 = 'approved' THEN $3::uuid ELSE NULL END,
             approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END,
             updated_at = now()
         WHERE id = $1 AND status = 'manual_review_required'
         RETURNING id`,
        [input.contentVariantId, targetStatus, actorAdminId],
      );
      if (!updated.rows[0]) {
        throw new MarketingError(409, "marketing_manual_review_state_changed", "Content changed before the manual review could be applied");
      }
      await audit({
        projectId: row.project_id,
        campaignId: row.campaign_id,
        contentVariantId: input.contentVariantId,
        actorAdminId,
        eventType: `content.manual_review_${input.decision === "approve" ? "approved" : "rejected"}`,
        detail: { reviewId, complianceCheckId: row.compliance_check_id, reviewDimensions: dimensions },
      });
      await deps.db.query("COMMIT");
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
    return manualReviewResult(input.contentVariantId, reviewId, input.decision, false);
  }

  async function createPublishJob(input: MarketingPublishJobInput, actorAdminId: string) {
    requireText(input.platform, "marketing_publish_platform_required");
    requireText(input.executorAccountRef, "marketing_publish_account_required");
    requireText(input.idempotencyKey, "marketing_publish_idempotency_required");
    const scheduledAt = parseTime(input.scheduledAt, "marketing_publish_scheduled_at_invalid");
    const executeDeadline = input.executeDeadline
      ? parseTime(input.executeDeadline, "marketing_publish_deadline_invalid")
      : new Date(scheduledAt.getTime() + 4 * 60 * 60 * 1000);
    if (executeDeadline <= scheduledAt) {
      throw new MarketingError(400, "marketing_publish_deadline_invalid", "Execute deadline must follow schedule");
    }
    const existing = await deps.db.query<PublishJobIdempotencyRow>(
      `SELECT id, campaign_id, content_variant_id, platform, executor_account_ref,
              scheduled_at, not_before, execute_deadline, status
       FROM marketing_publish_jobs WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      assertPublishJobIdempotency(row, input, scheduledAt, executeDeadline);
      return row.status === "preparing_assets"
        ? await finishPreparingPublishJob(row, input, actorAdminId, true)
        : publishJobResult(row, true);
    }
    const variant = await deps.db.query<{
      campaign_id: string; status: string; platform: string; owner_user_id: string | null; asset_manifest_json: Json;
      platform_constraints_json: Json;
    }>(
      `SELECT variant.campaign_id, variant.status, variant.platform, variant.asset_manifest_json, project.owner_user_id,
              campaign.platform_constraints_json
       FROM marketing_content_variants AS variant
       JOIN marketing_campaigns AS campaign ON campaign.id = variant.campaign_id
       JOIN marketing_projects AS project ON project.id = campaign.project_id
       WHERE variant.id = $1`,
      [input.contentVariantId],
    );
    if (!variant.rows[0] || variant.rows[0].campaign_id !== input.campaignId) {
      throw new MarketingError(404, "marketing_content_not_found", "Marketing content was not found for campaign");
    }
    if (variant.rows[0].status !== "approved" && variant.rows[0].status !== "published") {
      throw new MarketingError(409, "marketing_content_not_approved", "Only approved or published content can be scheduled");
    }
    if (variant.rows[0].platform !== input.platform) {
      throw new MarketingError(409, "marketing_content_platform_mismatch", "Content platform does not match publish job");
    }
    const maxDailyPublishJobs = campaignLimit(jsonValue(variant.rows[0].platform_constraints_json), "maxDailyPublishJobs", 10_000);
    if (maxDailyPublishJobs !== null) {
      const { start, end } = chinaDayBounds(scheduledAt);
      const existing = await deps.db.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM marketing_publish_jobs
         WHERE campaign_id = $1 AND scheduled_at >= $2 AND scheduled_at < $3
           AND status NOT IN ('canceled', 'stale')`,
        [input.campaignId, start, end],
      );
      if ((existing.rows[0]?.count ?? 0) >= maxDailyPublishJobs) {
        throw new MarketingError(409, "marketing_campaign_daily_publish_limit_reached", "Campaign daily publish limit has been reached");
      }
    }
    assertPublishAssetsMatchManifest(input.assets, variant.rows[0].asset_manifest_json);
    const assets = await resolveDeliveryAssets(input.assets, executeDeadline);
    const id = randomUUID();
    const notBefore = new Date(scheduledAt.getTime() - 15 * 60 * 1000);
    const preparedAssets = assets.map((asset) => {
      const assetId = randomUUID();
      return {
        ...asset,
        assetId,
        deliveryObjectKey: asset.storageObjectId
          ? buildMarketingDeliveryObjectKey(id, assetId, asset.sourceObjectKey ?? "asset")
          : null,
      };
    });
    await deps.db.query("BEGIN");
    try {
      const inserted = await deps.db.query<{ id: string }>(
        `INSERT INTO marketing_publish_jobs (
          id, campaign_id, content_variant_id, platform, executor_account_ref, idempotency_key,
          scheduled_at, not_before, execute_deadline, status, created_by_admin_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'preparing_assets', $10)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id`,
        [id, input.campaignId, input.contentVariantId, input.platform, input.executorAccountRef,
          input.idempotencyKey, scheduledAt, notBefore, executeDeadline, actorAdminId],
      );
      if (!inserted.rows[0]) {
        const concurrent = await deps.db.query<PublishJobIdempotencyRow>(
          `SELECT id, campaign_id, content_variant_id, platform, executor_account_ref,
                  scheduled_at, not_before, execute_deadline, status
           FROM marketing_publish_jobs WHERE idempotency_key = $1`,
          [input.idempotencyKey],
        );
        const row = concurrent.rows[0];
        if (!row) throw new MarketingError(409, "marketing_publish_idempotency_conflict", "Concurrent publish request could not be resolved");
        assertPublishJobIdempotency(row, input, scheduledAt, executeDeadline);
        await deps.db.query("COMMIT");
        return row.status === "preparing_assets"
          ? finishPreparingPublishJob(row, input, actorAdminId, true, assets)
          : publishJobResult(row, true);
      }
      for (const asset of preparedAssets) {
        await deps.db.query(
          `INSERT INTO marketing_delivery_assets (
            id, publish_job_id, content_variant_id, owner_user_id, asset_type, storage_object_id,
            delivery_bucket, delivery_object_key, delivery_url, sha256, content_type,
            size_bytes, expires_at, retention_until, delivery_state, created_by_admin_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [asset.assetId, id, input.contentVariantId, variant.rows[0].owner_user_id, asset.type, asset.storageObjectId ?? null,
            asset.sourceBucket ?? null, asset.deliveryObjectKey, asset.deliveryUrl ?? null,
            asset.sha256.toLowerCase(), asset.contentType, asset.sizeBytes ?? null, asset.expiresAt,
            new Date(executeDeadline.getTime() + 72 * 60 * 60 * 1000), asset.storageObjectId ? "copying" : "available", actorAdminId],
        );
      }
      await deps.db.query("COMMIT");
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
    return await finishPreparingPublishJob({
      id, campaign_id: input.campaignId, content_variant_id: input.contentVariantId,
      platform: input.platform, executor_account_ref: input.executorAccountRef,
      scheduled_at: scheduledAt, not_before: notBefore, execute_deadline: executeDeadline,
      status: "preparing_assets",
    }, input, actorAdminId, false, assets, preparedAssets);
  }

  async function resolveGenerationSkillSnapshot(
    skillId: string | undefined,
    skillKind: "marketing" | "video",
    platform: string,
    contentType: "image" | "video",
  ) {
    const selectedSkillId = skillId?.trim() ?? "";
    if (!selectedSkillId) return {};
    const result = await deps.db.query<{
      id: string; code: string; name: string; description: string; version: string;
      source_name: string; source_url: string; source_version: string;
      planning_instruction: string; media_instruction: string;
      applicable_platforms_json: Json; applicable_content_types_json: Json; skill_kind: "marketing" | "video";
    }>(
      `SELECT id, code, name, description, version, source_name, source_url, source_version,
              planning_instruction, media_instruction, applicable_platforms_json, applicable_content_types_json, skill_kind
       FROM marketing_generation_skills
       WHERE id::text = $1 AND skill_kind = $2 AND status = 'approved'`,
      [selectedSkillId, skillKind],
    );
    const row = result.rows[0];
    if (!row) throw new MarketingError(409, "marketing_generation_skill_unavailable", `所选${skillKind === "marketing" ? "营销" : "视频"} Skill 不可用，请重新选择`);
    const platforms = stringArray(row.applicable_platforms_json);
    const contentTypes = stringArray(row.applicable_content_types_json);
    if ((platforms.length && !platforms.includes(platform)) || (contentTypes.length && !contentTypes.includes(contentType))) {
      throw new MarketingError(409, "marketing_generation_skill_not_applicable", "所选 Skill 不适用于当前平台或内容形式");
    }
    const contentSha256 = createHash("sha256")
      .update(`${row.planning_instruction}\n${row.media_instruction}`, "utf8")
      .digest("hex");
    return {
      skillId: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      version: row.version,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      sourceVersion: row.source_version,
      skillKind: row.skill_kind,
      planningInstruction: row.planning_instruction,
      mediaInstruction: row.media_instruction,
      contentSha256,
    };
  }

  async function createDirectPublish(input: MarketingDirectPublishInput, actorAdminId: string) {
    requireText(input.projectId, "marketing_project_required");
    requireText(input.direction, "marketing_direct_publish_direction_required");
    const contentTheme = sanitizeDirectContentTheme(input.direction);
    const sourceFacts = sanitizeDirectContentTheme(input.sourceFacts ?? "").slice(0, 12_000);
    requireText(contentTheme, "marketing_direct_publish_direction_required");
    const modelCode = input.modelCode?.trim() ?? "";
    requireText(input.platform, "marketing_publish_platform_required");
    requireText(input.executorAccountRef, "marketing_publish_account_required");
    requireText(input.idempotencyKey, "marketing_publish_idempotency_required");
    if (input.contentType !== "image" && input.contentType !== "video") {
      throw new MarketingError(400, "marketing_direct_publish_content_type_invalid", "Direct publish content type is invalid");
    }
    const marketingSkillSnapshot = await resolveGenerationSkillSnapshot(input.marketingSkillId, "marketing", input.platform, input.contentType);
    const videoSkillSnapshot = await resolveGenerationSkillSnapshot(input.skillId, "video", input.platform, input.contentType);
    const project = await deps.db.query<{ id: string; name: string; source_snapshot: Json }>(
      "SELECT id, name, source_snapshot FROM marketing_projects WHERE id = $1 AND status = 'active'",
      [input.projectId],
    );
    const projectRow = project.rows[0];
    if (!projectRow) throw new MarketingError(404, "marketing_project_not_found", "Marketing project was not found");
    if (modelCode) {
      const model = await deps.db.query<{ model_code: string }>(
        `SELECT model_code FROM ai_model_configs
         WHERE model_code = $1 AND media_type = $2 AND status = 'active'`,
        [modelCode, input.contentType],
      );
      if (!model.rows[0]) throw new MarketingError(409, "marketing_generation_model_unavailable", "所选生成模型不可用，请重新选择");
    }
    const scheduledAt = parseTime(input.scheduledAt, "marketing_publish_scheduled_at_invalid");
    const existing = await deps.db.query<{
      id: string; campaign_id: string; status: string; scheduled_at: Date;
      marketing_skill_snapshot_json: Json; skill_snapshot_json: Json;
    }>(
      `SELECT id, campaign_id, status, scheduled_at, marketing_skill_snapshot_json, skill_snapshot_json
       FROM marketing_generation_runs WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (new Date(row.scheduled_at).getTime() !== scheduledAt.getTime()) {
        throw new MarketingError(409, "marketing_generation_idempotency_conflict", "Idempotency key is already used by a different publish request");
      }
      if (generationSkillId(row.marketing_skill_snapshot_json) !== generationSkillId(marketingSkillSnapshot)) {
        throw new MarketingError(409, "marketing_generation_idempotency_conflict", "Idempotency key is already used with a different marketing Skill");
      }
      if (generationSkillId(row.skill_snapshot_json) !== generationSkillId(videoSkillSnapshot)) {
        throw new MarketingError(409, "marketing_generation_idempotency_conflict", "Idempotency key is already used with a different video Skill");
      }
      return { generationRunId: row.id, campaignId: row.campaign_id, status: row.status, idempotent: true };
    }
    const campaign = await createCampaign({
      projectId: projectRow.id,
      name: `${projectRow.name} · ${contentTheme.slice(0, 48)}`,
      objective: contentTheme,
      platformConstraints: { directPublish: true },
    }, actorAdminId);
    const projectSnapshot = jsonValue(projectRow.source_snapshot);
    const sourceSnapshot: Json = Array.isArray(projectSnapshot)
      ? { projectSnapshot, ...(sourceFacts ? { operatorFacts: sourceFacts } : {}), ...(modelCode ? { marketingModelCode: modelCode } : {}) }
      : { ...projectSnapshot, ...(sourceFacts ? { operatorFacts: sourceFacts } : {}), ...(modelCode ? { marketingModelCode: modelCode } : {}) };
    await deps.db.query(
      `INSERT INTO marketing_generation_runs (
         id, project_id, campaign_id, content_type, platform, executor_account_ref,
         direction, scheduled_at, idempotency_key, source_snapshot, marketing_skill_snapshot_json,
         skill_snapshot_json, created_by_admin_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13)`,
      [
        randomUUID(), projectRow.id, campaign.id, input.contentType, input.platform, input.executorAccountRef,
        contentTheme, scheduledAt, input.idempotencyKey, json(sourceSnapshot), json(marketingSkillSnapshot),
        json(videoSkillSnapshot), actorAdminId,
      ],
    );
    const generationRun = await deps.db.query<{ id: string }>(
      "SELECT id FROM marketing_generation_runs WHERE idempotency_key = $1",
      [input.idempotencyKey],
    );
    const generationRunId = generationRun.rows[0]!.id;
    await audit({ projectId: projectRow.id, campaignId: campaign.id, actorAdminId,
      eventType: "generation_run.queued", detail: {
        generationRunId, contentType: input.contentType,
        marketingSkillCode: generationSkillValue(marketingSkillSnapshot, "code"),
        marketingSkillVersion: generationSkillValue(marketingSkillSnapshot, "version"),
        videoSkillCode: generationSkillValue(videoSkillSnapshot, "code"),
        videoSkillVersion: generationSkillValue(videoSkillSnapshot, "version"),
      } });
    return { generationRunId, campaignId: campaign.id, status: "queued", idempotent: false };
  }

  async function ensureDirectPublishPlatformProfile(platform: string, executorAccountRef: string, actorAdminId: string) {
    const active = await deps.db.query<{ id: string }>(
      "SELECT id FROM marketing_platform_capability_profiles WHERE platform = $1 AND status = 'active' ORDER BY effective_at DESC LIMIT 1",
      [platform],
    );
    if (active.rows[0]) return;
    const executors = await deps.db.query<{ capabilities_json: Json }>(
      "SELECT capabilities_json FROM marketing_executors WHERE status IN ('active', 'degraded') ORDER BY last_heartbeat_at DESC",
    );
    const capability = executors.rows
      .map((row) => directPublishCapability(jsonValue(row.capabilities_json), platform, executorAccountRef))
      .find((item): item is Record<string, unknown> => item !== null);
    if (!capability) {
      throw new MarketingError(409, "marketing_executor_account_unavailable", "The selected publishing account is not currently available from an authorized executor");
    }
    const id = randomUUID();
    await deps.db.query(
      `INSERT INTO marketing_platform_capability_profiles (
         id, platform, version, capability_json, rule_json, created_by_admin_id
       ) VALUES ($1, $2, 'executor-capability-bootstrap-v1', $3::jsonb, '{}'::jsonb, $4)`,
      [id, platform, json(capability), actorAdminId],
    );
    await audit({ actorAdminId, eventType: "platform_profile.bootstrapped", detail: { platform, executorAccountRef } });
  }

  function assertPublishJobIdempotency(
    row: PublishJobIdempotencyRow,
    input: MarketingPublishJobInput,
    scheduledAt: Date,
    executeDeadline: Date,
  ) {
    if (row.campaign_id !== input.campaignId || row.content_variant_id !== input.contentVariantId
      || row.platform !== input.platform || row.executor_account_ref !== input.executorAccountRef
      || new Date(row.scheduled_at).getTime() !== scheduledAt.getTime()
      || new Date(row.execute_deadline).getTime() !== executeDeadline.getTime()) {
      throw new MarketingError(409, "marketing_publish_idempotency_conflict", "Idempotency key is already used by a different publish request");
    }
  }

  function publishJobResult(row: PublishJobIdempotencyRow, idempotent: boolean) {
    return {
      id: row.id, status: row.status, idempotent,
      scheduledAt: new Date(row.scheduled_at).toISOString(), notBefore: new Date(row.not_before).toISOString(),
      executeDeadline: new Date(row.execute_deadline).toISOString(),
    };
  }

  async function finishPreparingPublishJob(
    row: PublishJobIdempotencyRow,
    input: MarketingPublishJobInput,
    actorAdminId: string,
    idempotent: boolean,
    resolvedAssets?: Awaited<ReturnType<typeof resolveDeliveryAssets>>,
    newlyPreparedAssets?: Array<Awaited<ReturnType<typeof resolveDeliveryAssets>>[number] & {
      assetId: string;
      deliveryObjectKey: string | null;
    }>,
  ) {
    const assets = resolvedAssets ?? await resolveDeliveryAssets(input.assets, new Date(row.execute_deadline));
    type StoredPreparingAsset = {
      id: string; asset_type: string; storage_object_id: string | null; delivery_bucket: string | null;
      delivery_object_key: string | null; sha256: string; content_type: string; size_bytes: number | string | null;
      delivery_state: string; source_bucket: string | null; source_object_key: string | null;
    };
    const storedRows: StoredPreparingAsset[] = newlyPreparedAssets
      ? newlyPreparedAssets.map((asset) => ({
          id: asset.assetId,
          asset_type: asset.type,
          storage_object_id: asset.storageObjectId ?? null,
          delivery_bucket: asset.sourceBucket ?? null,
          delivery_object_key: asset.deliveryObjectKey,
          sha256: asset.sha256,
          content_type: asset.contentType,
          size_bytes: asset.sizeBytes ?? null,
          delivery_state: asset.storageObjectId ? "copying" : "available",
          source_bucket: asset.sourceBucket ?? null,
          source_object_key: asset.sourceObjectKey ?? null,
        }))
      : (await deps.db.query<StoredPreparingAsset>(
          `SELECT asset.id, asset.asset_type, asset.storage_object_id, asset.delivery_bucket,
                  asset.delivery_object_key, asset.sha256, asset.content_type, asset.size_bytes,
                  asset.delivery_state, source.bucket AS source_bucket, source.object_key AS source_object_key
           FROM marketing_delivery_assets AS asset
           LEFT JOIN storage_objects AS source ON source.id = asset.storage_object_id
           WHERE asset.publish_job_id = $1
           ORDER BY asset.created_at, asset.id`,
          [row.id],
        )).rows;
    if (storedRows.length !== assets.length) {
      throw new MarketingError(409, "marketing_publish_idempotency_conflict", "Idempotent publish request assets do not match");
    }
    const remaining = [...storedRows];
    const matched = assets.map((asset) => {
      const index = remaining.findIndex((candidate) => (
        candidate.asset_type === asset.type
        && candidate.storage_object_id === asset.storageObjectId
        && candidate.sha256.toLowerCase() === asset.sha256.toLowerCase()
        && candidate.content_type === asset.contentType
        && Number(candidate.size_bytes ?? 0) === Number(asset.sizeBytes ?? 0)
      ));
      if (index < 0) {
        throw new MarketingError(409, "marketing_publish_idempotency_conflict", "Idempotent publish request assets do not match");
      }
      return { expected: asset, stored: remaining.splice(index, 1)[0]! };
    });

    for (const asset of matched) {
      if (asset.stored.delivery_state === "available") continue;
      if (asset.stored.delivery_state !== "copying" || !asset.stored.source_bucket
        || !asset.stored.source_object_key || !asset.stored.delivery_bucket || !asset.stored.delivery_object_key) {
        throw new MarketingError(409, "marketing_delivery_copy_failed", "Marketing delivery asset copy cannot be resumed");
      }
      try {
        await deps.storageAdapter!.copyObject!({
          sourceBucket: asset.stored.source_bucket,
          sourceObjectKey: asset.stored.source_object_key,
          destinationBucket: asset.stored.delivery_bucket,
          destinationObjectKey: asset.stored.delivery_object_key,
        });
        await deps.db.query(
          `UPDATE marketing_delivery_assets
           SET delivery_state = 'available', updated_at = now()
           WHERE id = $1 AND delivery_state = 'copying'`,
          [asset.stored.id],
        );
      } catch {
        await deps.db.query("BEGIN");
        try {
          await deps.db.query(
            `UPDATE marketing_delivery_assets
             SET delivery_state = 'copy_failed', retention_until = now() + interval '4 hours', updated_at = now()
             WHERE id = $1`,
            [asset.stored.id],
          );
          await deps.db.query(
            `UPDATE marketing_delivery_assets
             SET retention_until = LEAST(retention_until, now() + interval '4 hours'), updated_at = now()
             WHERE publish_job_id = $1 AND delivery_state = 'available'`,
            [row.id],
          );
          await deps.db.query(
            "UPDATE marketing_publish_jobs SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'preparing_assets'",
            [row.id],
          );
          await audit({ campaignId: input.campaignId, contentVariantId: input.contentVariantId, publishJobId: row.id, actorAdminId, eventType: "publish_job.asset_copy_failed", detail: { assetId: asset.stored.id } });
          await deps.db.query("COMMIT");
        } catch (error) {
          await deps.db.query("ROLLBACK");
          throw error;
        }
        throw new MarketingError(409, "marketing_delivery_copy_failed", "Marketing delivery asset copy failed");
      }
    }

    await deps.db.query("BEGIN");
    try {
      const locked = await deps.db.query<{ status: string }>(
        "SELECT status FROM marketing_publish_jobs WHERE id = $1 FOR UPDATE",
        [row.id],
      );
      const lockedStatus = locked.rows[0]?.status;
      if (!lockedStatus) {
        throw new MarketingError(404, "marketing_publish_job_not_found", "Marketing publish job was not found");
      }
      if (lockedStatus === "preparing_assets") {
        const unavailable = await deps.db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM marketing_delivery_assets WHERE publish_job_id = $1 AND delivery_state <> 'available'",
          [row.id],
        );
        if (Number(unavailable.rows[0]?.count ?? 0) !== 0) {
          throw new MarketingError(409, "marketing_delivery_copy_incomplete", "Marketing delivery assets are not ready");
        }
        await deps.db.query(
          "UPDATE marketing_publish_jobs SET status = 'scheduled', updated_at = now() WHERE id = $1 AND status = 'preparing_assets'",
          [row.id],
        );
        await audit({ campaignId: input.campaignId, contentVariantId: input.contentVariantId, publishJobId: row.id, actorAdminId, eventType: "publish_job.created", detail: { scheduledAt: new Date(row.scheduled_at).toISOString() } });
      }
      await deps.db.query("COMMIT");
      return publishJobResult({ ...row, status: lockedStatus === "preparing_assets" ? "scheduled" : lockedStatus }, idempotent);
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
  }

  async function cancelPublishJob(jobId: string, actorAdminId: string, reason: string) {
    requireText(reason, "marketing_publish_cancel_reason_required");
    await deps.db.query("BEGIN");
    try {
      const locked = await deps.db.query<{ id: string; campaign_id: string; status: string }>(
        `SELECT id, campaign_id, status FROM marketing_publish_jobs WHERE id = $1 FOR UPDATE`,
        [jobId],
      );
      const row = locked.rows[0];
      const deliveries = await deps.db.query<{ status: string }>(
        `SELECT status FROM marketing_publish_deliveries
         WHERE publish_job_id = $1 AND status IN ('leased', 'downloading', 'downloaded', 'queued', 'running')
         FOR UPDATE`,
        [jobId],
      );
      if (!row || !["scheduled", "leased", "downloading", "downloaded", "queued"].includes(row.status)
        || deliveries.rows.some((delivery) => delivery.status === "running")) {
        throw new MarketingError(409, "marketing_publish_not_cancelable", "Publish job cannot be canceled after platform submission starts");
      }
      await deps.db.query(
        `UPDATE marketing_publish_jobs
         SET status = 'canceled', canceled_at = now(), cancel_reason = $2, updated_at = now()
         WHERE id = $1`,
        [jobId, reason.trim()],
      );
      await deps.db.query(
        `UPDATE marketing_publish_deliveries
         SET status = 'canceled', failure_code = 'job_canceled', failure_message = $2,
             finished_at = now(), lease_until = now(), updated_at = now()
         WHERE publish_job_id = $1 AND status IN ('leased', 'downloading', 'downloaded', 'queued')`,
        [jobId, reason.trim()],
      );
      await deps.db.query(
        `UPDATE marketing_delivery_assets
         SET retention_until = LEAST(retention_until, now() + interval '4 hours'), updated_at = now()
         WHERE publish_job_id = $1 AND delivery_state IN ('available', 'delete_failed')`,
        [jobId],
      );
      await audit({ campaignId: row.campaign_id, publishJobId: jobId, actorAdminId, eventType: "publish_job.canceled", detail: { reason: reason.trim() } });
      await deps.db.query("COMMIT");
      return { id: jobId, status: "canceled" };
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
  }

  async function cancelGenerationRun(runId: string, actorAdminId: string, reason: string) {
    requireText(reason, "marketing_generation_cancel_reason_required");
    await deps.db.query("BEGIN");
    try {
      const locked = await deps.db.query<{
        id: string; project_id: string; campaign_id: string; generation_task_id: string | null; publish_job_id: string | null; status: string;
      }>(
        `SELECT id, project_id, campaign_id, generation_task_id, publish_job_id, status
         FROM marketing_generation_runs WHERE id = $1 FOR UPDATE`, [runId],
      );
      const row = locked.rows[0];
      if (!row || ["succeeded", "failed", "canceled"].includes(row.status) || row.publish_job_id) {
        throw new MarketingError(409, "marketing_generation_not_cancelable", "Generation run cannot be canceled at its current state");
      }
      await deps.db.query(
        `UPDATE marketing_generation_runs
         SET status = 'canceled', failure_code = 'user_canceled', updated_at = now()
         WHERE id = $1`, [runId],
      );
      if (row.generation_task_id) {
        await deps.db.query(
          `UPDATE tasks SET status = 'canceled', updated_at = now()
           WHERE id = $1 AND status = 'queued'`, [row.generation_task_id],
        );
        await deps.db.query(
          `UPDATE ai_generation_task_snapshots SET status = 'canceled', progress_stage = 'canceled',
                  failure_json = '{"failureCode":"user_canceled"}'::jsonb, updated_at = now()
           WHERE task_id = $1 AND status = 'queued'`, [row.generation_task_id],
        );
      }
      await audit({ projectId: row.project_id, campaignId: row.campaign_id, actorAdminId,
        eventType: "generation_run.canceled", detail: { generationRunId: runId, reason: reason.trim() } });
      await deps.db.query("COMMIT");
      return { id: runId, status: "canceled" };
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
  }

  async function retryGenerationRun(runId: string, actorAdminId: string) {
    const retried = await deps.db.query<{ id: string; project_id: string; campaign_id: string }>(
      `UPDATE marketing_generation_runs
       SET status = 'queued', failure_code = NULL, updated_at = now()
       WHERE id = $1
         AND status = 'failed'
         AND generation_task_id IS NULL
         AND publish_job_id IS NULL
       RETURNING id, project_id, campaign_id`,
      [runId],
    );
    const row = retried.rows[0];
    if (!row) {
      throw new MarketingError(409, "marketing_generation_not_retryable", "Only failed runs before media submission can be retried");
    }
    await audit({ projectId: row.project_id, campaignId: row.campaign_id, actorAdminId,
      eventType: "generation_run.retried", detail: { generationRunId: runId } });
    return { id: runId, status: "queued" };
  }

  async function confirmGenerationPlan(runId: string, actorAdminId: string) {
    const updated = await deps.db.query<{ id: string; project_id: string; campaign_id: string }>(
      `UPDATE marketing_generation_runs
       SET status = 'planning', failure_code = NULL, updated_at = now()
       WHERE id = $1 AND status = 'plan_ready'
       RETURNING id, project_id, campaign_id`,
      [runId],
    );
    const row = updated.rows[0];
    if (!row) throw new MarketingError(409, "marketing_plan_not_confirmable", "Only a ready content plan can generate media");
    await audit({ projectId: row.project_id, campaignId: row.campaign_id, actorAdminId,
      eventType: "generation_plan.confirmed", detail: { generationRunId: runId } });
    return { id: runId, status: "planning" };
  }

  async function regenerateGenerationRun(runId: string, stage: "plan" | "media", actorAdminId: string) {
    const targetStatus = stage === "plan" ? "queued" : "planning";
    const expectedStatuses = stage === "plan" ? ["plan_ready", "media_ready"] : ["media_ready"];
    const updated = await deps.db.query<{ id: string; project_id: string; campaign_id: string }>(
      `UPDATE marketing_generation_runs
       SET status = $2, failure_code = NULL, generation_task_id = NULL,
           plan_json = CASE WHEN $3 = 'plan' THEN '{}'::jsonb ELSE plan_json END,
           media_asset_manifest_json = '[]'::jsonb, updated_at = now()
       WHERE id = $1 AND status = ANY($4::text[])
       RETURNING id, project_id, campaign_id`,
      [runId, targetStatus, stage, expectedStatuses],
    );
    const row = updated.rows[0];
    if (!row) throw new MarketingError(409, "marketing_generation_not_regenerable", "This generation stage is no longer available for regeneration");
    await audit({ projectId: row.project_id, campaignId: row.campaign_id, actorAdminId,
      eventType: `generation_${stage}.regenerated`, detail: { generationRunId: runId } });
    return { id: runId, status: targetStatus };
  }

  async function confirmGeneratedMedia(runId: string, actorAdminId: string) {
    const claimed = await deps.db.query<{
      id: string; project_id: string; campaign_id: string; content_type: "image" | "video"; platform: string;
      executor_account_ref: string; scheduled_at: Date; direction: string; plan_json: Json; knowledge_segment_ids_json: Json;
      media_asset_manifest_json: Json;
    }>(
      `UPDATE marketing_generation_runs
       SET status = 'publishing', failure_code = NULL, updated_at = now()
       WHERE id = $1 AND status = 'media_ready'
       RETURNING id, project_id, campaign_id, content_type, platform, executor_account_ref, scheduled_at,
                 direction, plan_json, knowledge_segment_ids_json, media_asset_manifest_json`,
      [runId],
    );
    const run = claimed.rows[0];
    if (!run) throw new MarketingError(409, "marketing_media_not_confirmable", "Generated media is not awaiting confirmation");
    try {
      const assets = Array.isArray(run.media_asset_manifest_json) ? run.media_asset_manifest_json : [];
      const mediaAsset = assets.find((asset) => asset && typeof asset === "object" && !Array.isArray(asset)
        && (asset as Record<string, unknown>).type === run.content_type
        && typeof (asset as Record<string, unknown>).storageObjectId === "string");
      if (!mediaAsset) throw new MarketingError(409, "marketing_generation_output_missing", "Generated media is no longer available");
      const asset = mediaAsset as Record<string, unknown>;
      const storageObjectId = String(asset.storageObjectId);
      await ensureDirectPublishPlatformProfile(run.platform, run.executor_account_ref, actorAdminId);
      const plan = jsonValue(run.plan_json);
      await rememberConfirmedGenerationKnowledge(run, actorAdminId);
      const trackingKey = `marketing-generation-${run.id}`;
      const existingContent = await deps.db.query<{
        id: string; campaign_id: string; platform: string; content_type: string; status: string;
      }>(
        `SELECT id, campaign_id, platform, content_type, status
         FROM marketing_content_variants
         WHERE tracking_key = $1`,
        [trackingKey],
      );
      let contentId: string;
      let contentStatus: string;
      if (existingContent.rows[0]) {
        const existing = existingContent.rows[0];
        if (existing.campaign_id !== run.campaign_id || existing.platform !== run.platform || existing.content_type !== run.content_type) {
          throw new MarketingError(409, "marketing_generation_content_mismatch", "Existing generated content does not match this publishing request");
        }
        contentId = existing.id;
        contentStatus = existing.status;
      } else {
        const content = await createContentVariant({
          campaignId: run.campaign_id, platform: run.platform, contentType: run.content_type,
          title: typeof (plan as Record<string, unknown>).title === "string"
            ? (plan as Record<string, unknown>).title as string : "未命名营销内容",
          body: plan, assetManifest: [{ type: run.content_type, storageObjectId, authorizationStatus: "owned" }],
          knowledgeSegmentIds: stringArray(run.knowledge_segment_ids_json), complianceReport: {},
          trackingKey,
        }, actorAdminId);
        contentId = content.id;
        contentStatus = "draft";
      }
      if (contentStatus === "draft") {
        const compliance = await runComplianceCheck(contentId, actorAdminId);
        if (compliance.status !== "passed") {
          throw new MarketingError(409, "marketing_content_blocked", "Generated content did not pass the automatic publishing rules. Regenerate it before publishing.");
        }
        await approveContentVariant(contentId, actorAdminId);
      } else if (contentStatus !== "approved" && contentStatus !== "published") {
        throw new MarketingError(409, "marketing_generation_content_not_reusable", "Existing generated content is no longer publishable. Regenerate it before publishing.");
      }
      const publishJob = await createPublishJob({
        campaignId: run.campaign_id, contentVariantId: contentId, platform: run.platform,
        executorAccountRef: run.executor_account_ref, idempotencyKey: `marketing-generation-publish:${run.id}`,
        scheduledAt: new Date(run.scheduled_at).toISOString(),
        assets: [{ type: run.content_type, storageObjectId }],
      }, actorAdminId);
      await deps.db.query(
        `UPDATE marketing_generation_runs
         SET content_variant_id = $2, publish_job_id = $3, status = 'scheduled', updated_at = now()
         WHERE id = $1 AND status = 'publishing'`,
        [run.id, contentId, publishJob.id],
      );
      await audit({ projectId: run.project_id, campaignId: run.campaign_id, contentVariantId: contentId,
        publishJobId: publishJob.id, actorAdminId, eventType: "generated_media.confirmed_for_publish", detail: { generationRunId: run.id } });
      return { id: run.id, contentVariantId: contentId, publishJobId: publishJob.id, status: "scheduled" };
    } catch (error) {
      await deps.db.query(
        `UPDATE marketing_generation_runs
         SET status = 'media_ready', failure_code = $2, updated_at = now()
         WHERE id = $1 AND status = 'publishing'`,
        [run.id, error instanceof MarketingError ? error.code : "marketing_publish_preparation_failed"],
      );
      throw error;
    }
  }

  async function rememberConfirmedGenerationKnowledge(
    run: { id: string; project_id: string; platform: string; content_type: "image" | "video"; direction: string; plan_json: Json },
    actorAdminId: string,
  ) {
    const existing = await deps.db.query<{ id: string }>(
      `SELECT id FROM marketing_knowledge_documents
       WHERE project_id = $1 AND document_type = 'confirmed_generation' AND version = $2
       LIMIT 1`,
      [run.project_id, `run-${run.id}`],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const documentId = randomUUID();
    const content = confirmedGenerationKnowledgeContent(run);
    await deps.db.query(
      `INSERT INTO marketing_knowledge_documents (
         id, project_id, title, document_type, authorization_status, version,
         applicable_platforms_json, confidence_score, status, created_by_admin_id, approved_by_admin_id
       ) VALUES ($1, $2, $3, 'confirmed_generation', 'owned', $4, $5::jsonb, 95, 'approved', $6, $6)`,
      [documentId, run.project_id, `已确认${run.content_type === "video" ? "视频" : "图文"}内容 ${run.id.slice(0, 8)}`,
        `run-${run.id}`, json([run.platform]), actorAdminId],
    );
    await deps.db.query(
      `INSERT INTO marketing_knowledge_segments (id, document_id, sequence_number, content, summary, tags_json, source_locator)
       VALUES ($1, $2, 1, $3, $4, $5::jsonb, $6)`,
      [randomUUID(), documentId, content, `已确认${run.content_type === "video" ? "视频" : "图文"}：${readPlanField(run.plan_json, "title") || run.direction}`.slice(0, 240),
        json([run.platform, run.content_type, "confirmed"]), `generation-run:${run.id}`],
    );
    await audit({ projectId: run.project_id, actorAdminId, eventType: "generation_knowledge.confirmed", detail: { generationRunId: run.id, documentId } });
    return documentId;
  }

  async function listDirectConsole() {
    const [projects, executors, generationRuns, publishJobs, mediaModels, generationSkills, competitorCollectionJobs] = await Promise.all([
      deps.db.query(`SELECT id, name FROM marketing_projects WHERE status = 'active' ORDER BY created_at DESC LIMIT 100`),
      deps.db.query(`SELECT worker_id AS "workerId", CASE WHEN status IN ('active', 'degraded')
                      AND last_heartbeat_at < now() - interval '5 minutes' THEN 'offline' ELSE status END AS status,
                      capabilities_json AS capabilities
                     FROM marketing_executors ORDER BY last_heartbeat_at DESC LIMIT 20`),
      deps.db.query(`SELECT run.id, run.project_id AS "projectId", project.name AS "projectName", run.content_type AS "contentType",
                            run.platform, run.executor_account_ref AS "executorAccountRef", run.direction, run.status,
                            run.failure_code AS "failureCode", run.scheduled_at AS "scheduledAt", run.plan_json AS plan,
                            run.media_asset_manifest_json AS "mediaAssets",
                            run.marketing_skill_snapshot_json AS "marketingSkill", run.skill_snapshot_json AS "videoSkill",
                            run.updated_at AS "updatedAt"
                     FROM marketing_generation_runs AS run
                     JOIN marketing_projects AS project ON project.id = run.project_id
                     ORDER BY run.created_at DESC LIMIT 30`),
      deps.db.query(`SELECT job.id, job.platform, job.executor_account_ref AS "executorAccountRef", job.status,
                            job.scheduled_at AS "scheduledAt", delivery.publish_url AS "publishUrl", delivery.failure_code AS "failureCode"
                     FROM marketing_publish_jobs AS job
                     LEFT JOIN LATERAL (
                       SELECT publish_url, failure_code FROM marketing_publish_deliveries
                       WHERE publish_job_id = job.id ORDER BY created_at DESC LIMIT 1
                     ) AS delivery ON true
                     ORDER BY job.created_at DESC LIMIT 30`),
      deps.db.query(`SELECT model_code AS "modelCode", display_name AS "displayName", media_type AS "mediaType"
                     FROM ai_model_configs
                     WHERE status = 'active' AND media_type IN ('image', 'video')
                     ORDER BY sort_order ASC, display_name ASC`),
      deps.db.query(`SELECT id, code, name, description, version, skill_kind AS "skillKind", source_name AS "sourceName",
                            source_url AS "sourceUrl", source_version AS "sourceVersion",
                            applicable_platforms_json AS "applicablePlatforms",
                            applicable_content_types_json AS "applicableContentTypes"
                     FROM marketing_generation_skills
                     WHERE status = 'approved'
                     ORDER BY display_order ASC, name ASC`),
      deps.db.query(`SELECT job.id, job.project_id AS "projectId", project.name AS "projectName",
                            job.campaign_id AS "campaignId", job.name, job.collection_mode AS "collectionMode",
                            job.query_text AS "queryText", job.crawler_base_url AS "crawlerBaseUrl",
                            job.max_items AS "maxItems", job.include_comments AS "includeComments",
                            job.interval_minutes AS "intervalMinutes", job.status, job.next_run_at AS "nextRunAt",
                            job.last_run_at AS "lastRunAt", run.status AS "latestRunStatus",
                            run.prompt_package_json AS "promptPackage", run.failure_code AS "failureCode"
                     FROM marketing_competitor_collection_jobs AS job
                     JOIN marketing_projects AS project ON project.id = job.project_id
                     LEFT JOIN LATERAL (
                       SELECT status, prompt_package_json, failure_code
                       FROM marketing_competitor_collection_runs
                       WHERE job_id = job.id
                       ORDER BY created_at DESC
                       LIMIT 1
                     ) AS run ON true
                     ORDER BY job.created_at DESC
                     LIMIT 30`),
    ]);
    const runsWithPreview = await Promise.all(generationRuns.rows.map(async (run) => {
      const mediaAssets = Array.isArray(run.mediaAssets) ? run.mediaAssets : [];
      if (!deps.storageAdapter || !mediaAssets.length) return { ...run, mediaAssets };
      const assets = await Promise.all(mediaAssets.map(async (value) => {
        const asset = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
        const storageObjectId = typeof asset.storageObjectId === "string" ? asset.storageObjectId : "";
        if (!storageObjectId) return asset;
        const object = await deps.db.query<{ bucket: string; object_key: string; content_type: string }>(
          "SELECT bucket, object_key, content_type FROM storage_objects WHERE id = $1 AND status = 'available' AND deleted_at IS NULL",
          [storageObjectId],
        );
        const row = object.rows[0];
        if (!row) return asset;
        try {
          const signed = await deps.storageAdapter!.createSignedReadUrl({
            bucket: row.bucket, objectKey: row.object_key, expiresAt: new Date(Date.now() + 15 * 60 * 1000), responseContentDisposition: null,
          });
          return { ...asset, previewUrl: signed.url, contentType: row.content_type };
        } catch {
          return { ...asset, contentType: row.content_type };
        }
      }));
      return { ...run, mediaAssets: assets };
    }));
    return {
      projects: projects.rows, executors: executors.rows, mediaModels: mediaModels.rows,
      generationSkills: generationSkills.rows, generationRuns: runsWithPreview, publishJobs: publishJobs.rows,
      competitorCollectionJobs: competitorCollectionJobs.rows,
    };
  }

  async function listConsole() {
    const [projects, campaigns, contentVariants, publishJobs, executors, researchSourcePolicies, attentionCases, metrics, auditEvents,
      sources, knowledgeDocuments, trendPatterns, agentRuns, platformProfiles, researchBriefs, brandProfiles, executorAlerts, metricComparisonRows,
      agentUsage, agentProviderApprovals, componentAdmissions, executorKeys, knowledgeSegments, generationRuns] = await Promise.all([
      deps.db.query(`SELECT project.id, project.name, project.source_type AS "sourceType", project.source_namespace AS "sourceNamespace",
                            project.status, project.created_at AS "createdAt", profile.id AS "activeBrandProfileId",
                            profile.version AS "activeBrandProfileVersion"
                     FROM marketing_projects AS project
                     LEFT JOIN marketing_brand_profiles AS profile ON profile.id = project.active_brand_profile_id
                     ORDER BY project.created_at DESC LIMIT 100`),
      deps.db.query(`SELECT id, project_id AS "projectId", name, objective, status, created_at AS "createdAt"
                     FROM marketing_campaigns ORDER BY created_at DESC LIMIT 100`),
      deps.db.query(`SELECT variant.id, variant.campaign_id AS "campaignId", campaign.name AS "campaignName", variant.platform,
                            variant.content_type AS "contentType", variant.title, variant.status, variant.tracking_key AS "trackingKey",
                            variant.body_json AS "body", variant.asset_manifest_json AS "assetManifest",
                            variant.knowledge_segment_ids_json AS "knowledgeSegmentIds",
                            variant.compliance_report_json AS "complianceReport", variant.created_at AS "createdAt"
                     FROM marketing_content_variants AS variant
                     JOIN marketing_campaigns AS campaign ON campaign.id = variant.campaign_id
                     ORDER BY variant.created_at DESC LIMIT 200`),
      deps.db.query(`SELECT job.id, job.campaign_id AS "campaignId", job.content_variant_id AS "contentVariantId", job.platform,
                            job.executor_account_ref AS "executorAccountRef", job.status, job.scheduled_at AS "scheduledAt",
                            job.updated_at AS "updatedAt",
                            delivery.status AS "latestDeliveryStatus", delivery.publish_url AS "publishUrl", delivery.failure_code AS "failureCode"
                     FROM marketing_publish_jobs AS job
                     LEFT JOIN LATERAL (
                       SELECT status, publish_url, failure_code FROM marketing_publish_deliveries
                       WHERE publish_job_id = job.id ORDER BY created_at DESC LIMIT 1
                     ) AS delivery ON true
                     ORDER BY job.created_at DESC LIMIT 200`),
      deps.db.query(`SELECT worker_id AS "workerId", version,
                            CASE WHEN status IN ('active', 'degraded')
                                      AND last_heartbeat_at < now() - interval '5 minutes'
                                 THEN 'offline' ELSE status END AS status,
                            last_heartbeat_at AS "lastHeartbeatAt", capabilities_json AS capabilities
                     FROM marketing_executors ORDER BY last_heartbeat_at DESC LIMIT 50`),
      deps.db.query(`SELECT id, domain, purpose, max_requests_per_hour AS "maxRequestsPerHour",
                            allow_full_text AS "allowFullText", status, owner_admin_id AS "ownerAdminId",
                            updated_at AS "updatedAt"
                     FROM marketing_research_source_policies ORDER BY domain LIMIT 100`),
      deps.db.query(`SELECT attention.id, attention.publish_job_id AS "publishJobId", attention.status,
                            attention.owner_admin_id AS "ownerAdminId", attention.due_at AS "dueAt",
                            attention.resolution, attention.created_at AS "createdAt", attention.resolved_at AS "resolvedAt",
                            job.platform, job.executor_account_ref AS "executorAccountRef"
                     FROM marketing_attention_cases AS attention
                     JOIN marketing_publish_jobs AS job ON job.id = attention.publish_job_id
                     ORDER BY (attention.status = 'open') DESC, attention.due_at ASC NULLS LAST, attention.created_at DESC
                     LIMIT 100`),
      deps.db.query(`SELECT observation.publish_job_id AS "publishJobId", observation.metric_name AS "metricName",
                            observation.metric_value AS "metricValue", observation.metric_source AS "metricSource",
                            observation.observed_at AS "observedAt", observation.observation_window_json AS "observationWindow"
                     FROM marketing_metric_observations AS observation
                     ORDER BY observation.observed_at DESC LIMIT 100`),
      deps.db.query(`SELECT event_type AS "eventType", actor_type AS "actorType", actor_id AS "actorId", created_at AS "createdAt", detail_json AS detail
                     FROM marketing_audit_events ORDER BY created_at DESC LIMIT 100`),
      deps.db.query(`SELECT source.id, source.project_id AS "projectId", project.name AS "projectName",
                            source.source_namespace AS "sourceNamespace", source.source_record_id AS "sourceRecordId",
                            source.source_version AS "sourceVersion", source.authorization_status AS "authorizationStatus",
                            source.status, source.created_at AS "createdAt"
                     FROM marketing_sources AS source
                     JOIN marketing_projects AS project ON project.id = source.project_id
                     ORDER BY source.created_at DESC LIMIT 200`),
      deps.db.query(`SELECT document.id, document.project_id AS "projectId", document.title,
                            document.document_type AS "documentType", document.version, document.status,
                            document.confidence_score AS "confidenceScore", document.created_at AS "createdAt",
                            (SELECT COUNT(*)::integer FROM marketing_knowledge_segments AS segment WHERE segment.document_id = document.id) AS "segmentCount"
                     FROM marketing_knowledge_documents AS document
                     ORDER BY document.created_at DESC LIMIT 200`),
      deps.db.query(`SELECT id, project_id AS "projectId", source_id AS "sourceId", title, platform, status,
                            authorization_status AS "authorizationStatus", created_at AS "createdAt"
                     FROM marketing_trend_patterns ORDER BY created_at DESC LIMIT 200`),
      deps.db.query(`SELECT run.id, run.campaign_id AS "campaignId", campaign.name AS "campaignName",
                            run.data_classification AS "dataClassification", run.current_stage AS "currentStage",
                            run.status, run.failure_code AS "failureCode", run.updated_at AS "updatedAt"
                     FROM marketing_agent_runs AS run
                     JOIN marketing_campaigns AS campaign ON campaign.id = run.campaign_id
                     ORDER BY run.created_at DESC LIMIT 200`),
      deps.db.query(`SELECT id, platform, version, status, capability_json AS capability, rule_json AS rules,
                             effective_at AS "effectiveAt"
                      FROM marketing_platform_capability_profiles ORDER BY effective_at DESC LIMIT 100`),
      deps.db.query(`SELECT brief.id, brief.campaign_id AS "campaignId", campaign.name AS "campaignName",
                            brief.status, brief.brief_json AS brief, brief.source_ids_json AS "sourceIds",
                            brief.review_notes AS "reviewNotes", brief.created_at AS "createdAt",
                            brief.reviewed_at AS "reviewedAt"
                     FROM marketing_research_briefs AS brief
                     JOIN marketing_campaigns AS campaign ON campaign.id = brief.campaign_id
                     ORDER BY brief.created_at DESC LIMIT 200`),
      deps.db.query(`SELECT profile.id, profile.project_id AS "projectId", project.name AS "projectName", profile.version,
                            profile.profile_json AS profile, profile.status, profile.created_at AS "createdAt",
                            profile.activated_at AS "activatedAt"
                     FROM marketing_brand_profiles AS profile
                     JOIN marketing_projects AS project ON project.id = profile.project_id
                     ORDER BY profile.created_at DESC LIMIT 200`),
      deps.db.query(`SELECT alert.id, executor.worker_id AS "workerId", alert.reason, alert.status,
                            alert.detail_json AS detail, alert.detected_at AS "detectedAt",
                            alert.last_seen_at AS "lastSeenAt", alert.resolved_at AS "resolvedAt"
                     FROM marketing_executor_alerts AS alert
                     JOIN marketing_executors AS executor ON executor.id = alert.executor_id
                     ORDER BY (alert.status = 'open') DESC, alert.last_seen_at DESC LIMIT 100`),
      deps.db.query<MetricComparisonRow>(`SELECT campaign.id AS "campaignId", campaign.name AS "campaignName", campaign.objective,
                                                job.platform, job.executor_account_ref AS "executorAccountRef",
                                                variant.id AS "contentVariantId", variant.title,
                                                observation.metric_name AS "metricName",
                                                observation.observation_window_json AS "observationWindow",
                                                count(*)::int AS "sampleCount",
                                                avg(observation.metric_value)::float AS "averageValue"
                                         FROM marketing_metric_observations AS observation
                                         JOIN marketing_publish_jobs AS job ON job.id = observation.publish_job_id
                                         JOIN marketing_content_variants AS variant ON variant.id = job.content_variant_id
                                         JOIN marketing_campaigns AS campaign ON campaign.id = job.campaign_id
                                         WHERE observation.metric_value IS NOT NULL
                                           AND observation.metric_source IN ('platform_api', 'manual', 'executor_observed')
                                         GROUP BY campaign.id, campaign.name, campaign.objective, job.platform,
                                                  job.executor_account_ref, variant.id, variant.title,
                                                  observation.metric_name, observation.observation_window_json
                                         ORDER BY campaign.id, job.platform, job.executor_account_ref, observation.metric_name
                                         LIMIT 500`),
      deps.db.query(`SELECT usage.id, usage.run_id AS "runId", campaign.name AS "campaignName", usage.stage,
                            usage.provider_name AS "providerName", usage.data_classification AS "dataClassification",
                            usage.input_tokens AS "inputTokens", usage.output_tokens AS "outputTokens",
                            usage.media_seconds AS "mediaSeconds", usage.estimated_cost AS "estimatedCost",
                            usage.recorded_at AS "recordedAt"
                     FROM marketing_agent_usage_records AS usage
                     JOIN marketing_campaigns AS campaign ON campaign.id = usage.campaign_id
                     ORDER BY usage.recorded_at DESC LIMIT 200`),
      deps.db.query(`SELECT id, provider_name AS "providerName", model_code AS "modelCode", stage,
                            approval_reference AS "approvalReference",
                            data_classifications_json AS "dataClassifications",
                            allowed_input_paths_json AS "allowedInputPaths", status,
                            approved_by_admin_id AS "approvedByAdminId", approved_at AS "approvedAt",
                            updated_at AS "updatedAt"
                     FROM marketing_agent_provider_approvals
                     ORDER BY stage, updated_at DESC LIMIT 100`),
      deps.db.query(`SELECT id, component_type AS "componentType", component_name AS "componentName",
                            component_version AS "componentVersion", approval_reference AS "approvalReference",
                            license_summary AS "licenseSummary", commercial_use_terms AS "commercialUseTerms",
                            data_processing_location AS "dataProcessingLocation", security_summary AS "securitySummary",
                            upgrade_plan AS "upgradePlan", removal_plan AS "removalPlan", owner_admin_id AS "ownerAdminId",
                            status, approved_by_admin_id AS "approvedByAdminId", approved_at AS "approvedAt", updated_at AS "updatedAt"
                     FROM marketing_component_admissions
                     ORDER BY updated_at DESC LIMIT 100`),
      deps.db.query(`SELECT executor.worker_id AS "workerId", key.key_id AS "keyId", key.status,
                            key.valid_until AS "validUntil", key.created_at AS "createdAt"
                     FROM marketing_executor_keys AS key
                     JOIN marketing_executors AS executor ON executor.id = key.executor_id
                     ORDER BY executor.worker_id, key.created_at DESC LIMIT 100`),
      deps.db.query(`SELECT segment.id, document.project_id AS "projectId", document.title AS "documentTitle",
                            document.applicable_platforms_json AS "applicablePlatforms",
                            segment.sequence_number AS "sequenceNumber", segment.summary
                     FROM marketing_knowledge_segments AS segment
                     JOIN marketing_knowledge_documents AS document ON document.id = segment.document_id
                     LEFT JOIN marketing_sources AS source ON source.id = document.source_id
                     WHERE document.status = 'approved'
                       AND (source.id IS NULL OR (source.status = 'active' AND source.authorization_status IN ('owned', 'authorized')))
                     ORDER BY document.created_at DESC, segment.sequence_number ASC LIMIT 500`),
      deps.db.query(`SELECT run.id, run.project_id AS "projectId", project.name AS "projectName", run.campaign_id AS "campaignId",
                            run.content_type AS "contentType", run.platform, run.executor_account_ref AS "executorAccountRef",
                            run.status, run.failure_code AS "failureCode", run.scheduled_at AS "scheduledAt", run.updated_at AS "updatedAt"
                     FROM marketing_generation_runs AS run
                     JOIN marketing_projects AS project ON project.id = run.project_id
                     ORDER BY run.created_at DESC LIMIT 200`),
    ]);
    return {
      projects: projects.rows,
      campaigns: campaigns.rows,
      contentVariants: contentVariants.rows,
      publishJobs: publishJobs.rows.map((job) => ({
        ...job,
        latestDelivery: job.latestDeliveryStatus ? {
          status: job.latestDeliveryStatus,
          publishUrl: job.publishUrl,
          failureCode: job.failureCode,
        } : null,
      })),
      executors: executors.rows,
      researchSourcePolicies: researchSourcePolicies.rows,
      attentionCases: attentionCases.rows,
      metrics: metrics.rows,
      auditEvents: auditEvents.rows,
      sources: sources.rows,
      knowledgeDocuments: knowledgeDocuments.rows,
      knowledgeSegments: knowledgeSegments.rows,
      trendPatterns: trendPatterns.rows,
      agentRuns: agentRuns.rows,
      platformProfiles: platformProfiles.rows,
      researchBriefs: researchBriefs.rows,
      brandProfiles: brandProfiles.rows,
      executorAlerts: executorAlerts.rows,
      metricComparisons: buildMarketingMetricComparisons(metricComparisonRows.rows),
      agentUsage: agentUsage.rows,
      agentProviderApprovals: agentProviderApprovals.rows,
      componentAdmissions: componentAdmissions.rows,
      executorKeys: executorKeys.rows,
      generationRuns: generationRuns.rows,
    };
  }

  async function saveComponentAdmission(input: {
    componentType: "model" | "provider" | "data_service" | "open_source";
    componentName: string;
    componentVersion: string;
    approvalReference: string;
    licenseSummary: string;
    commercialUseTerms: string;
    dataProcessingLocation: string;
    securitySummary: string;
    upgradePlan: string;
    removalPlan: string;
    status?: "draft" | "approved" | "rejected" | "disabled";
  }, actorAdminId: string) {
    if (!["model", "provider", "data_service", "open_source"].includes(input.componentType)) {
      throw new MarketingError(400, "marketing_component_type_invalid", "Component type is invalid");
    }
    const fields = {
      componentName: input.componentName.trim(), componentVersion: input.componentVersion.trim(),
      approvalReference: input.approvalReference.trim(), licenseSummary: input.licenseSummary.trim(),
      commercialUseTerms: input.commercialUseTerms.trim(), dataProcessingLocation: input.dataProcessingLocation.trim(),
      securitySummary: input.securitySummary.trim(), upgradePlan: input.upgradePlan.trim(), removalPlan: input.removalPlan.trim(),
    };
    for (const [name, value] of Object.entries(fields)) requireText(value, `marketing_component_${camelToSnake(name)}_required`);
    const status = input.status ?? "draft";
    if (!["draft", "approved", "rejected", "disabled"].includes(status)) {
      throw new MarketingError(400, "marketing_component_status_invalid", "Component status is invalid");
    }
    const id = randomUUID();
    const saved = await deps.db.query<{ id: string }>(
      `INSERT INTO marketing_component_admissions (
         id, component_type, component_name, component_version, approval_reference,
         license_summary, commercial_use_terms, data_processing_location, security_summary,
         upgrade_plan, removal_plan, owner_admin_id, status, approved_by_admin_id, approved_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 CASE WHEN $13 = 'approved' THEN $12::uuid ELSE NULL END,
                 CASE WHEN $13 = 'approved' THEN now() ELSE NULL END)
       ON CONFLICT (component_type, component_name, component_version)
       DO UPDATE SET approval_reference = EXCLUDED.approval_reference,
                     license_summary = EXCLUDED.license_summary,
                     commercial_use_terms = EXCLUDED.commercial_use_terms,
                     data_processing_location = EXCLUDED.data_processing_location,
                     security_summary = EXCLUDED.security_summary,
                     upgrade_plan = EXCLUDED.upgrade_plan,
                     removal_plan = EXCLUDED.removal_plan,
                     owner_admin_id = EXCLUDED.owner_admin_id,
                     status = EXCLUDED.status,
                     approved_by_admin_id = CASE WHEN EXCLUDED.status = 'approved' THEN EXCLUDED.owner_admin_id ELSE NULL END,
                     approved_at = CASE WHEN EXCLUDED.status = 'approved' THEN now() ELSE NULL END,
                     updated_at = now()
       RETURNING id`,
      [id, input.componentType, fields.componentName, fields.componentVersion, fields.approvalReference,
        fields.licenseSummary, fields.commercialUseTerms, fields.dataProcessingLocation, fields.securitySummary,
        fields.upgradePlan, fields.removalPlan, actorAdminId, status],
    );
    await audit({ actorAdminId, eventType: "component_admission.saved", detail: {
      componentType: input.componentType, componentName: fields.componentName, componentVersion: fields.componentVersion, status,
    } });
    return { id: saved.rows[0]!.id, componentType: input.componentType, componentName: fields.componentName, componentVersion: fields.componentVersion, status };
  }

  async function saveAgentProviderApproval(input: {
    providerName: string;
    modelCode: string;
    stage: "strategy" | "copy" | "compliance";
    approvalReference: string;
    dataClassifications: string[];
    allowedInputPaths: string[];
    status?: "draft" | "approved" | "disabled";
  }, actorAdminId: string) {
    requireText(input.providerName, "marketing_agent_provider_name_required");
    requireText(input.modelCode, "marketing_agent_provider_model_required");
    requireText(input.approvalReference, "marketing_agent_provider_approval_reference_required");
    const providerName = input.providerName.trim();
    const modelCode = input.modelCode.trim();
    const approvalReference = input.approvalReference.trim();
    if (input.stage !== "strategy" && input.stage !== "copy" && input.stage !== "compliance") {
      throw new MarketingError(400, "marketing_agent_provider_stage_invalid", "Provider stage is invalid");
    }
    const dataClassifications = [...new Set(input.dataClassifications.map((value) => value.trim()))];
    if (!dataClassifications.length || dataClassifications.some((value) => value !== "public" && value !== "internal")) {
      throw new MarketingError(400, "marketing_agent_provider_classification_invalid", "Only public and internal classifications can be externalized");
    }
    const allowedInputPaths = [...new Set(input.allowedInputPaths.map((value) => value.trim()))];
    if (!allowedInputPaths.length || allowedInputPaths.some((value) => !isSafeMarketingAgentInputPath(value))) {
      throw new MarketingError(400, "marketing_agent_provider_paths_invalid", "Provider input paths are invalid");
    }
    const status = input.status ?? "draft";
    if (status !== "draft" && status !== "approved" && status !== "disabled") {
      throw new MarketingError(400, "marketing_agent_provider_status_invalid", "Provider status is invalid");
    }
    const id = randomUUID();
    const result = await deps.db.query<{ id: string }>(
      `INSERT INTO marketing_agent_provider_approvals (
         id, provider_name, model_code, stage, approval_reference,
         data_classifications_json, allowed_input_paths_json, status,
         approved_by_admin_id, approved_at, created_by_admin_id, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8,
                 CASE WHEN $8 = 'approved' THEN $9::uuid ELSE NULL END,
                 CASE WHEN $8 = 'approved' THEN now() ELSE NULL END, $9, now())
       ON CONFLICT (provider_name, model_code, stage)
       DO UPDATE SET approval_reference = EXCLUDED.approval_reference,
                     data_classifications_json = EXCLUDED.data_classifications_json,
                     allowed_input_paths_json = EXCLUDED.allowed_input_paths_json,
                     status = EXCLUDED.status,
                     approved_by_admin_id = CASE WHEN EXCLUDED.status = 'approved' THEN EXCLUDED.created_by_admin_id ELSE NULL END,
                     approved_at = CASE WHEN EXCLUDED.status = 'approved' THEN now() ELSE NULL END,
                     updated_at = now()
       RETURNING id`,
      [id, providerName, modelCode, input.stage, approvalReference, json(dataClassifications), json(allowedInputPaths), status, actorAdminId],
    );
    const approvalId = result.rows[0]?.id;
    await audit({ actorAdminId, eventType: "agent_provider_approval.saved", detail: {
      providerName, modelCode, stage: input.stage, approvalId, status, dataClassifications, allowedInputPaths,
    } });
    return { id: approvalId, providerName, modelCode, stage: input.stage, status };
  }

  async function saveResearchSourcePolicy(input: {
    domain: string; purpose: string; maxRequestsPerHour?: number; allowFullText?: boolean; status?: "active" | "disabled";
  }, actorAdminId: string) {
    const domain = normalizeResearchDomain(input.domain);
    requireText(input.purpose, "marketing_research_policy_purpose_required");
    const maxRequestsPerHour = Math.floor(Number(input.maxRequestsPerHour ?? 60));
    if (!Number.isInteger(maxRequestsPerHour) || maxRequestsPerHour < 1 || maxRequestsPerHour > 3600) {
      throw new MarketingError(400, "marketing_research_policy_rate_invalid", "Research source rate limit must be between 1 and 3600");
    }
    const status = input.status ?? "active";
    if (status !== "active" && status !== "disabled") throw new MarketingError(400, "marketing_research_policy_status_invalid", "Research source policy status is invalid");
    const id = randomUUID();
    const saved = await deps.db.query<{ id: string }>(
      `INSERT INTO marketing_research_source_policies (
         id, domain, purpose, max_requests_per_hour, allow_full_text, status, owner_admin_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (domain) DO UPDATE
       SET purpose = EXCLUDED.purpose, max_requests_per_hour = EXCLUDED.max_requests_per_hour,
           allow_full_text = EXCLUDED.allow_full_text, status = EXCLUDED.status,
           owner_admin_id = EXCLUDED.owner_admin_id, updated_at = now()
       RETURNING id`,
      [id, domain, input.purpose.trim(), maxRequestsPerHour, Boolean(input.allowFullText), status, actorAdminId],
    );
    await audit({ actorAdminId, eventType: "research_source_policy.saved", detail: { domain, purpose: input.purpose.trim(), status } });
    return { id: saved.rows[0]!.id, domain, status };
  }

  async function assignAttentionCase(caseId: string, ownerAdminId: string, dueAt: string, actorAdminId: string) {
    const due = parseTime(dueAt, "marketing_attention_due_at_invalid");
    if (due <= new Date()) throw new MarketingError(400, "marketing_attention_due_at_invalid", "Attention due time must be in the future");
    const owner = await deps.db.query<{ id: string }>(
      "SELECT id FROM admin_accounts WHERE id = $1 AND status = 'active'",
      [ownerAdminId],
    );
    if (!owner.rows[0]) throw new MarketingError(404, "marketing_attention_owner_not_found", "Attention owner was not found");
    const updated = await deps.db.query<{ publish_job_id: string }>(
      `UPDATE marketing_attention_cases
       SET owner_admin_id = $2, due_at = $3
       WHERE id = $1 AND status = 'open'
       RETURNING publish_job_id`,
      [caseId, ownerAdminId, due],
    );
    if (!updated.rows[0]) throw new MarketingError(409, "marketing_attention_not_assignable", "Attention case cannot be assigned");
    await audit({ publishJobId: updated.rows[0].publish_job_id, actorAdminId, eventType: "attention.assigned", detail: { attentionCaseId: caseId, ownerAdminId, dueAt: due.toISOString() } });
    return { id: caseId, ownerAdminId, dueAt: due.toISOString(), status: "open" };
  }

  async function resolveAttentionCase(caseId: string, resolution: string, actorAdminId: string) {
    requireText(resolution, "marketing_attention_resolution_required");
    const updated = await deps.db.query<{ publish_job_id: string }>(
      `UPDATE marketing_attention_cases
       SET status = 'resolved', resolution = $2, resolved_at = now()
       WHERE id = $1 AND status = 'open'
       RETURNING publish_job_id`,
      [caseId, resolution.trim()],
    );
    if (!updated.rows[0]) throw new MarketingError(409, "marketing_attention_not_resolvable", "Attention case cannot be resolved");
    await audit({ publishJobId: updated.rows[0].publish_job_id, actorAdminId, eventType: "attention.resolved", detail: { attentionCaseId: caseId, resolution: resolution.trim() } });
    return { id: caseId, status: "resolved" };
  }

  async function createTrendPattern(input: {
    projectId?: string | null; sourceId: string; title: string; platform: string; pattern: Json;
  }, actorAdminId: string) {
    requireText(input.sourceId, "marketing_trend_source_required");
    requireText(input.title, "marketing_trend_title_required");
    requireText(input.platform, "marketing_trend_platform_required");
    if (input.projectId) await requireProject(input.projectId);
    const source = await deps.db.query<{ authorization_status: string; project_id: string }>(
      `SELECT authorization_status, project_id FROM marketing_sources
       WHERE id = $1 AND status = 'active'`,
      [input.sourceId],
    );
    const authorizationStatus = source.rows[0]?.authorization_status;
    if (authorizationStatus !== "owned" && authorizationStatus !== "authorized") {
      throw new MarketingError(409, "marketing_trend_authorization_required", "Trend patterns require an owned or authorized source");
    }
    if (input.projectId && source.rows[0].project_id !== input.projectId) {
      throw new MarketingError(409, "marketing_trend_source_project_mismatch", "Trend source does not belong to the selected project");
    }
    const effectiveProjectId = input.projectId ?? source.rows[0].project_id;
    const pattern = selectTrendPatternFields(input.pattern);
    const id = randomUUID();
    await deps.db.query(
      `INSERT INTO marketing_trend_patterns (
         id, project_id, source_id, title, platform, pattern_json, authorization_status, created_by_admin_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [id, effectiveProjectId, input.sourceId, input.title.trim(), input.platform.trim(), json(pattern), authorizationStatus, actorAdminId],
    );
    await audit({ projectId: effectiveProjectId, actorAdminId, eventType: "trend_pattern.created", detail: { trendPatternId: id, sourceId: input.sourceId } });
    return { id, status: "draft" };
  }

  async function approveTrendPattern(patternId: string, actorAdminId: string) {
    const updated = await deps.db.query<{ id: string; project_id: string | null }>(
      `UPDATE marketing_trend_patterns AS pattern
       SET status = 'approved', approved_by_admin_id = $2, approved_at = now()
       WHERE pattern.id = $1 AND pattern.status = 'draft'
         AND pattern.authorization_status IN ('owned', 'authorized')
         AND EXISTS (SELECT 1 FROM marketing_sources AS source WHERE source.id = pattern.source_id AND source.status = 'active')
       RETURNING pattern.id, pattern.project_id`,
      [patternId, actorAdminId],
    );
    if (!updated.rows[0]) throw new MarketingError(409, "marketing_trend_not_approvable", "Trend pattern cannot be approved");
    await audit({ projectId: updated.rows[0].project_id ?? undefined, actorAdminId, eventType: "trend_pattern.approved", detail: { trendPatternId: patternId } });
    return { id: patternId, status: "approved" };
  }

  async function startAgentRun(input: {
    campaignId: string; idempotencyKey: string; dataClassification: "public" | "internal" | "restricted"; input: Json;
  }, actorAdminId: string) {
    requireText(input.idempotencyKey, "marketing_agent_idempotency_required");
    await requireCampaign(input.campaignId);
    const existing = await deps.db.query<{ id: string; status: string }>(
      "SELECT id, status FROM marketing_agent_runs WHERE idempotency_key = $1", [input.idempotencyKey],
    );
    if (existing.rows[0]) return { id: existing.rows[0].id, status: existing.rows[0].status, idempotent: true };
    const knowledgeSegmentIds = input.input && !Array.isArray(input.input)
      ? stringArray(input.input.knowledgeSegmentIds)
      : [];
    await requireCampaignKnowledgeSegments(input.campaignId, knowledgeSegmentIds, true);
    const id = randomUUID();
    await deps.db.query("BEGIN");
    try {
      const campaign = await deps.db.query<{ platform_constraints_json: Json }>(
        `SELECT platform_constraints_json FROM marketing_campaigns
         WHERE id = $1 AND status IN ('draft', 'active') FOR UPDATE`,
        [input.campaignId],
      );
      if (!campaign.rows[0]) {
        throw new MarketingError(404, "marketing_campaign_not_found", "Marketing campaign was not found");
      }
      const concurrentExisting = await deps.db.query<{ id: string; status: string }>(
        "SELECT id, status FROM marketing_agent_runs WHERE idempotency_key = $1",
        [input.idempotencyKey],
      );
      if (concurrentExisting.rows[0]) {
        await deps.db.query("COMMIT");
        return { id: concurrentExisting.rows[0].id, status: concurrentExisting.rows[0].status, idempotent: true };
      }
      const maxDailyAgentRuns = campaignLimit(campaign.rows[0].platform_constraints_json, "maxDailyAgentRuns", 10_000);
      if (maxDailyAgentRuns !== null) {
        const { start, end } = chinaDayBounds(new Date());
        const todayRuns = await deps.db.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM marketing_agent_runs
           WHERE campaign_id = $1 AND created_at >= $2 AND created_at < $3`,
          [input.campaignId, start, end],
        );
        if ((todayRuns.rows[0]?.count ?? 0) >= maxDailyAgentRuns) {
          throw new MarketingError(409, "marketing_campaign_daily_agent_run_limit_reached", "Campaign daily agent run limit has been reached");
        }
      }
      const inserted = await deps.db.query<{ id: string }>(
        `INSERT INTO marketing_agent_runs (
           id, campaign_id, idempotency_key, data_classification, input_json,
           knowledge_segment_ids_json, created_by_admin_id
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [id, input.campaignId, input.idempotencyKey, input.dataClassification, json(input.input),
          json(knowledgeSegmentIds), actorAdminId],
      );
      if (!inserted.rows[0]) {
        const concurrent = await deps.db.query<{ id: string; status: string }>(
          "SELECT id, status FROM marketing_agent_runs WHERE idempotency_key = $1",
          [input.idempotencyKey],
        );
        await deps.db.query("COMMIT");
        return { id: concurrent.rows[0].id, status: concurrent.rows[0].status, idempotent: true };
      }
      await deps.db.query(
        `INSERT INTO marketing_agent_steps (id, run_id, stage, input_summary)
         SELECT gen_random_uuid(), $1, stage.name, 'Pending agent execution'
         FROM (VALUES ('research'), ('strategy'), ('copy'), ('media'), ('compliance')) AS stage(name)`,
        [id],
      );
      await audit({ campaignId: input.campaignId, actorAdminId, eventType: "agent_run.created", detail: { runId: id, dataClassification: input.dataClassification } });
      await deps.db.query("COMMIT");
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
    return { id, status: "queued", idempotent: false };
  }

  async function retryAgentRun(runId: string, actorAdminId: string) {
    const retried = await deps.db.query<{ id: string; campaign_id: string; current_stage: string }>(
      `WITH retry_step AS (
         UPDATE marketing_agent_steps AS step
         SET status = 'queued', output_json = '{}'::jsonb, error_code = NULL,
             started_at = NULL, finished_at = NULL
         FROM marketing_agent_runs AS run
         WHERE step.run_id = run.id
           AND run.id = $1
           AND run.status IN ('failed', 'manual_review_required')
           AND step.stage = run.current_stage
           AND step.status IN ('failed', 'manual_review_required')
         RETURNING step.run_id
       )
       UPDATE marketing_agent_runs AS run
       SET status = 'queued', failure_code = NULL, updated_at = now()
       FROM retry_step
       WHERE run.id = retry_step.run_id
       RETURNING run.id, run.campaign_id, run.current_stage`,
      [runId],
    );
    const row = retried.rows[0];
    if (!row) throw new MarketingError(409, "marketing_agent_run_not_retryable", "Marketing agent run cannot be retried");
    await audit({ campaignId: row.campaign_id, actorAdminId, eventType: "agent_run.retried", detail: { runId, stage: row.current_stage } });
    return { id: runId, status: "queued", stage: row.current_stage };
  }

  async function recordMetric(input: {
    publishJobId: string; eventId?: string | null; metricName: string; metricValue?: number | null;
    metricSource: "platform_api" | "manual" | "executor_observed" | "unavailable"; observedAt: string; observationWindow?: Json;
  }, actorAdminId?: string) {
    requireText(input.metricName, "marketing_metric_name_required");
    const observedAt = parseTime(input.observedAt, "marketing_metric_observed_at_invalid");
    const job = await deps.db.query<{ id: string }>("SELECT id FROM marketing_publish_jobs WHERE id = $1", [input.publishJobId]);
    if (!job.rows[0]) throw new MarketingError(404, "marketing_publish_job_not_found", "Publish job was not found");
    if (input.metricSource !== "unavailable" && (typeof input.metricValue !== "number" || !Number.isFinite(input.metricValue))) {
      throw new MarketingError(400, "marketing_metric_value_invalid", "Available metrics require a numeric value");
    }
    const id = randomUUID();
    const inserted = await deps.db.query<{ id: string }>(
      `INSERT INTO marketing_metric_observations (
         id, publish_job_id, metric_name, metric_value, metric_source, observed_at, observation_window_json, event_id, created_by_admin_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       ON CONFLICT (publish_job_id, event_id) DO NOTHING
       RETURNING id`,
      [id, input.publishJobId, input.metricName.trim(), input.metricSource === "unavailable" ? null : input.metricValue ?? null,
        input.metricSource, observedAt, json(input.observationWindow ?? {}), input.eventId ?? null, actorAdminId ?? null],
    );
    if (!inserted.rows[0]) return { id: null, idempotent: true };
    await audit({ publishJobId: input.publishJobId, actorAdminId, actorType: actorAdminId ? undefined : "executor", actorId: actorAdminId ? undefined : "executor", eventType: "metric.recorded", detail: { metricName: input.metricName, metricSource: input.metricSource } });
    return { id, idempotent: false };
  }

  async function resolveDeliveryAssets(input: MarketingPublishJobInput["assets"], executeDeadline: Date) {
    if (!Array.isArray(input) || input.length === 0) {
      throw new MarketingError(400, "marketing_publish_assets_required", "At least one delivery asset is required");
    }
    return await Promise.all(input.map(async (asset) => {
      if (asset.storageObjectId) {
        if (!deps.storageAdapter || typeof deps.storageAdapter.copyObject !== "function") {
          throw new MarketingError(400, "marketing_storage_delivery_unavailable", "Marketing storage delivery is not configured");
        }
        const object = await deps.db.query<{
          id: string; bucket: string; object_key: string; content_type: string; size_bytes: number | string | null;
          checksum: string | null; status: string; deleted_at: Date | null;
        }>(
          "SELECT id, bucket, object_key, content_type, size_bytes, checksum, status, deleted_at FROM storage_objects WHERE id = $1",
          [asset.storageObjectId],
        );
        const row = object.rows[0];
        if (!row || row.status !== "available" || row.deleted_at || !/^[a-fA-F0-9]{64}$/.test(row.checksum ?? "")) {
          throw new MarketingError(409, "marketing_storage_asset_unavailable", "Marketing asset is unavailable or lacks a SHA-256 checksum");
        }
        return {
          type: asset.type,
          storageObjectId: row.id,
          sourceBucket: row.bucket,
          sourceObjectKey: row.object_key,
          deliveryUrl: undefined,
          sha256: row.checksum,
          contentType: row.content_type,
          sizeBytes: row.size_bytes === null ? undefined : Number(row.size_bytes),
          expiresAt: executeDeadline,
        };
      }
      throw new MarketingError(400, "marketing_storage_asset_required", "Marketing delivery assets must reference an existing COS storage object");
    }));
  }

  async function registerExecutor(input: {
    workerId: string; version: string; capabilities: Json; status?: "active" | "degraded"; keyId?: string; keyFingerprint?: string;
  }) {
    requireText(input.workerId, "marketing_executor_worker_id_required");
    requireText(input.version, "marketing_executor_version_required");
    const status = input.status === "degraded" ? "degraded" : "active";
    await deps.db.query("BEGIN");
    try {
      const registered = await deps.db.query<{ id: string; status: string }>(
        `INSERT INTO marketing_executors (id, worker_id, version, capabilities_json, status, last_heartbeat_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, now())
         ON CONFLICT (worker_id) DO UPDATE
         SET version = EXCLUDED.version, capabilities_json = EXCLUDED.capabilities_json,
             status = CASE WHEN marketing_executors.status = 'disabled' THEN 'disabled' ELSE EXCLUDED.status END,
             last_heartbeat_at = now(), updated_at = now()
         RETURNING id, status`,
        [randomUUID(), input.workerId, input.version, json(input.capabilities), status],
      );
      const executor = registered.rows[0];
      const id = executor.id;
      if (input.keyId && input.keyFingerprint) {
        await deps.db.query(
          `INSERT INTO marketing_executor_keys (id, executor_id, key_id, secret_hash)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (executor_id, key_id) DO UPDATE
           SET secret_hash = EXCLUDED.secret_hash, status = 'active', valid_until = NULL`,
          [randomUUID(), id, input.keyId, input.keyFingerprint],
        );
      }
      if (executor.status !== "disabled") {
        await syncExecutorHealthAlerts({ executorId: id, workerId: input.workerId, status: executor.status, capabilities: input.capabilities });
      }
      await audit({ actorType: "executor", actorId: input.workerId, eventType: "executor.heartbeat", detail: { version: input.version, status: executor.status } });
      await deps.db.query("COMMIT");
      return { id };
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
  }

  async function scheduleExecutorKeyRetirement(input: {
    workerId: string;
    keyId: string;
    validUntil: string;
  }, actorAdminId: string) {
    requireText(input.workerId, "marketing_executor_worker_id_required");
    requireText(input.keyId, "marketing_executor_key_id_required");
    const validUntil = parseTime(input.validUntil, "marketing_executor_key_retirement_time_invalid");
    if (validUntil <= new Date()) {
      throw new MarketingError(400, "marketing_executor_key_retirement_time_invalid", "Key retirement time must be in the future");
    }
    const updated = await deps.db.query<{ id: string }>(
      `UPDATE marketing_executor_keys AS key
       SET valid_until = $3
       FROM marketing_executors AS executor
       WHERE key.executor_id = executor.id
         AND executor.worker_id = $1 AND key.key_id = $2 AND key.status = 'active'
       RETURNING key.id`,
      [input.workerId.trim(), input.keyId.trim(), validUntil],
    );
    if (!updated.rows[0]) {
      throw new MarketingError(404, "marketing_executor_key_not_found", "Active executor key was not found");
    }
    await audit({ actorAdminId, eventType: "executor_key.retirement_scheduled", detail: {
      workerId: input.workerId.trim(), keyId: input.keyId.trim(), validUntil: validUntil.toISOString(),
    } });
    return { workerId: input.workerId.trim(), keyId: input.keyId.trim(), validUntil: validUntil.toISOString(), status: "active" };
  }

  async function claimNext(workerId: string, now = new Date()) {
    const executor = await getExecutor(workerId, { requireReady: true });
    await recoverExpiredDeliveriesIfDue(now);
    const deliveryId = randomUUID();
    const attemptId = randomUUID();
    const leaseUntil = new Date(now.getTime() + 5 * 60 * 1000);
    const claimed = await deps.db.query<ClaimRow>(
      `WITH candidate AS (
         SELECT job.id
         FROM marketing_publish_jobs AS job
         JOIN marketing_content_variants AS candidate_variant ON candidate_variant.id = job.content_variant_id
          WHERE job.status = 'scheduled'
            AND job.not_before <= $1
            AND job.execute_deadline > $1
            AND job.canceled_at IS NULL
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof($6::jsonb -> 'platforms') = 'array'
                  THEN $6::jsonb -> 'platforms' ELSE '[]'::jsonb END
              ) AS capability
              WHERE capability ->> 'platform' = job.platform
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(capability -> 'accountRefs') = 'array'
                      THEN capability -> 'accountRefs' ELSE '[]'::jsonb END
                  ) AS account_ref(value)
                  WHERE account_ref.value = job.executor_account_ref
                )
            )
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof($6::jsonb -> 'platformCapabilities') = 'array'
                  THEN $6::jsonb -> 'platformCapabilities' ELSE '[]'::jsonb END
              ) AS platform_capability
              WHERE platform_capability ->> 'platform' = job.platform
                AND CASE candidate_variant.content_type
                  WHEN 'video' THEN platform_capability -> 'supportsVideo' = 'true'::jsonb
                  WHEN 'image' THEN platform_capability -> 'supportsImagePost' = 'true'::jsonb
                  ELSE false
                END
            )
            AND pg_try_advisory_xact_lock(hashtext(job.platform || ':' || job.executor_account_ref))
           AND NOT EXISTS (
             SELECT 1 FROM marketing_publish_jobs AS active
             WHERE active.platform = job.platform
               AND active.executor_account_ref = job.executor_account_ref
               AND active.status IN ('leased', 'downloading', 'downloaded', 'queued', 'running')
           )
         ORDER BY job.scheduled_at, job.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       ), updated AS (
         UPDATE marketing_publish_jobs AS job
         SET status = 'leased', updated_at = $1
         FROM candidate
         WHERE job.id = candidate.id AND job.status = 'scheduled'
         RETURNING job.id, job.campaign_id, job.content_variant_id, job.platform,
                   job.executor_account_ref, job.idempotency_key, job.scheduled_at,
                   job.not_before, job.execute_deadline
       ), delivery AS (
         INSERT INTO marketing_publish_deliveries (
           id, publish_job_id, executor_id, attempt_id, lease_until, status
         )
         SELECT $2, id, $3, $4, $5, 'leased' FROM updated
         RETURNING id, publish_job_id, attempt_id, lease_until
       )
       SELECT updated.*, delivery.id AS delivery_id, delivery.attempt_id, delivery.lease_until,
               variant.title, variant.body_json, variant.content_type
       FROM updated
       JOIN delivery ON delivery.publish_job_id = updated.id
       JOIN marketing_content_variants AS variant ON variant.id = updated.content_variant_id`,
      [now, deliveryId, executor.id, attemptId, leaseUntil, json(executor.capabilities)],
    );
    const job = claimed.rows[0];
    if (!job) return null;
    if (!executorSupports(executor.capabilities, job.platform, job.executor_account_ref, job.content_type)) {
      await deps.db.query(
        `UPDATE marketing_publish_jobs SET status = 'scheduled', updated_at = now()
         WHERE id = $1 AND status = 'leased'`,
        [job.id],
      );
      await deps.db.query("DELETE FROM marketing_publish_deliveries WHERE id = $1", [job.delivery_id]);
      return null;
    }
    const assets = await deps.db.query<AssetRow>(
      `SELECT asset.id, asset.asset_type, asset.storage_object_id, asset.delivery_url, asset.sha256, asset.content_type,
              asset.size_bytes, asset.expires_at, asset.delivery_bucket AS bucket, asset.delivery_object_key AS object_key,
              asset.delivery_state AS storage_status, asset.deleted_at
       FROM marketing_delivery_assets AS asset
       WHERE asset.publish_job_id = $1
       ORDER BY asset.created_at`,
      [job.id],
    );
    const deliveredAssets = await Promise.all(assets.rows.map(async (asset) => {
      if (!asset.storage_object_id) {
        if (!asset.delivery_url || new Date(asset.expires_at) <= now) {
          throw new MarketingError(409, "marketing_delivery_asset_missing", "A scheduled marketing asset has no valid delivery URL");
        }
        return asset;
      }
      if (!deps.storageAdapter || asset.storage_status !== "available" || asset.deleted_at || !asset.bucket || !asset.object_key) {
        throw new MarketingError(409, "marketing_storage_asset_unavailable", "A scheduled marketing asset is no longer available");
      }
      const expiresAt = new Date(Math.min(now.getTime() + 4 * 60 * 60 * 1000, job.execute_deadline.getTime()));
      const signed = await deps.storageAdapter.createSignedReadUrl({
        bucket: asset.bucket,
        objectKey: asset.object_key,
        expiresAt,
        responseContentDisposition: null,
      });
      await deps.db.query(
        "UPDATE marketing_delivery_assets SET delivery_url = $2, expires_at = $3 WHERE id = $1",
        [asset.id, signed.url, expiresAt],
      );
      return { ...asset, delivery_url: signed.url, expires_at: expiresAt };
    }));
    await audit({ campaignId: job.campaign_id, contentVariantId: job.content_variant_id, publishJobId: job.id, actorType: "executor", actorId: workerId, eventType: "publish_job.leased", detail: { deliveryId: job.delivery_id, attemptId: job.attempt_id } });
    return {
      jobId: job.id,
      deliveryId: job.delivery_id,
      attemptId: job.attempt_id,
      idempotencyKey: job.idempotency_key,
      platform: job.platform,
      executorAccountRef: job.executor_account_ref,
      scheduledAt: new Date(job.scheduled_at).toISOString(),
      notBefore: new Date(job.not_before).toISOString(),
      executeDeadline: new Date(job.execute_deadline).toISOString(),
      leaseUntil: new Date(job.lease_until).toISOString(),
      content: { title: job.title, body: jsonValue(job.body_json) },
      assets: deliveredAssets.map((asset) => ({
        assetId: asset.id, kind: asset.asset_type, downloadUrl: asset.delivery_url, sha256: asset.sha256,
        contentType: asset.content_type, sizeBytes: asset.size_bytes, expiresAt: new Date(asset.expires_at).toISOString(),
      })),
    };
  }

  async function acknowledge(workerId: string, jobId: string, attemptId: string) {
    const updated = await transitionDelivery(workerId, jobId, attemptId, ["leased", "downloading"], "downloaded", "acknowledged_at = now()");
    if (!updated) throw new MarketingError(409, "marketing_delivery_ack_conflict", "Delivery cannot be acknowledged at its current state");
    return { jobId, attemptId, status: "downloaded" };
  }

  async function heartbeat(workerId: string, jobId: string, attemptId: string) {
    const executor = await getExecutor(workerId);
    const leaseUntil = new Date(Date.now() + 5 * 60 * 1000);
    const updated = await deps.db.query<{ id: string }>(
      `UPDATE marketing_publish_deliveries
       SET lease_until = $4, updated_at = now()
       WHERE publish_job_id = $1 AND attempt_id = $2 AND executor_id = $3
         AND status IN ('leased', 'downloading', 'downloaded', 'queued', 'running')
       RETURNING id`,
      [jobId, attemptId, executor.id, leaseUntil],
    );
    if (!updated.rows[0]) throw new MarketingError(409, "marketing_delivery_heartbeat_conflict", "Delivery lease is no longer active");
    await deps.db.query("UPDATE marketing_executors SET last_heartbeat_at = now(), updated_at = now() WHERE id = $1", [executor.id]);
    return { jobId, attemptId, leaseUntil: leaseUntil.toISOString() };
  }

  async function reportEvent(workerId: string, jobId: string, input: {
    attemptId: string;
    eventId: string;
    status: string;
    occurredAt: string;
    platformContentId?: string | null;
    publishUrl?: string | null;
    publishedAt?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    rawResultRef?: string | null;
  }) {
    const target = input.status;
    if (!eventStatuses.has(target)) throw new MarketingError(400, "marketing_event_status_invalid", "Unsupported delivery status");
    if (target === "succeeded" && !input.platformContentId && !input.publishUrl && input.failureCode !== "result_unavailable") {
      throw new MarketingError(409, "marketing_publish_result_incomplete", "Successful publication requires a content ID, a publish URL, or result_unavailable");
    }
    const executor = await getExecutor(workerId);
    const occurredAt = parseTime(input.occurredAt, "marketing_event_occurred_at_invalid");
    await deps.db.query("BEGIN");
    try {
      const delivery = await deps.db.query<DeliveryRow>(
        `SELECT delivery.id, delivery.status, job.status AS job_status, job.canceled_at
         FROM marketing_publish_deliveries AS delivery
         JOIN marketing_publish_jobs AS job ON job.id = delivery.publish_job_id
         WHERE delivery.publish_job_id = $1 AND delivery.attempt_id = $2 AND delivery.executor_id = $3
         FOR UPDATE OF delivery, job`,
        [jobId, input.attemptId, executor.id],
      );
      if (!delivery.rows[0]) throw new MarketingError(404, "marketing_delivery_not_found", "Publish delivery was not found");
      const existing = await deps.db.query<{ id: string }>(
        "SELECT id FROM marketing_publish_events WHERE delivery_id = $1 AND event_id = $2",
        [delivery.rows[0].id, input.eventId],
      );
      if (existing.rows[0] || (terminalStatuses.has(target) && delivery.rows[0].status === target)) {
        await deps.db.query("COMMIT");
        return { jobId, attemptId: input.attemptId, status: delivery.rows[0].status, idempotent: true };
      }
      if ((delivery.rows[0].canceled_at || delivery.rows[0].job_status === "canceled" || delivery.rows[0].job_status === "stale")
        && target !== "canceled") {
        throw new MarketingError(409, "marketing_delivery_job_frozen", "Canceled or stale publish jobs cannot accept later executor events");
      }
      if (!canTransition(delivery.rows[0].status, target)) {
        throw new MarketingError(409, "marketing_delivery_event_out_of_order", "Delivery status transition is not allowed");
      }
      const terminal = terminalStatuses.has(target);
      const completedColumns = terminal ? ", finished_at = now(), lease_until = now()" : "";
      const update = await deps.db.query<{ id: string }>(
        `UPDATE marketing_publish_deliveries
         SET status = $4, platform_content_id = COALESCE($5, platform_content_id),
             publish_url = COALESCE($6, publish_url), published_at = COALESCE($7, published_at),
             failure_code = COALESCE($8, failure_code), failure_message = COALESCE($9, failure_message),
             raw_result_ref = COALESCE($10, raw_result_ref),
             started_at = CASE WHEN $4 = 'running' THEN COALESCE(started_at, now()) ELSE started_at END,
             updated_at = now()${completedColumns}
         WHERE id = $1 AND publish_job_id = $2 AND attempt_id = $3 AND status = $11
         RETURNING id`,
        [delivery.rows[0].id, jobId, input.attemptId, target, input.platformContentId ?? null,
          normalizeHttpsUrl(input.publishUrl), input.publishedAt ? parseTime(input.publishedAt, "marketing_event_published_at_invalid") : null,
          input.failureCode ?? null, input.failureMessage ?? null, input.rawResultRef ?? null, delivery.rows[0].status],
      );
      if (!update.rows[0]) throw new MarketingError(409, "marketing_delivery_event_conflict", "Delivery changed before event could be applied");
      await deps.db.query(
        "UPDATE marketing_publish_jobs SET status = $2, updated_at = now() WHERE id = $1 AND status NOT IN ('canceled', 'stale')",
        [jobId, target],
      );
      if (target === "succeeded") {
        await deps.db.query(
          `UPDATE marketing_content_variants AS variant
           SET status = 'published', updated_at = now()
           FROM marketing_publish_jobs AS job
           WHERE job.id = $1 AND variant.id = job.content_variant_id AND variant.status = 'approved'`,
          [jobId],
        );
      }
      await deps.db.query(
        `INSERT INTO marketing_publish_events (id, publish_job_id, delivery_id, event_id, status, occurred_at, payload_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [randomUUID(), jobId, delivery.rows[0].id, input.eventId, target, occurredAt, json(input)],
      );
      if (target === "needs_attention") {
        await deps.db.query(
          `INSERT INTO marketing_attention_cases (id, publish_job_id, delivery_id, owner_admin_id, due_at)
           SELECT $1, job.id, $2, job.created_by_admin_id, now() + interval '4 hours'
           FROM marketing_publish_jobs AS job
           WHERE job.id = $3
           ON CONFLICT (publish_job_id) DO NOTHING`,
          [randomUUID(), delivery.rows[0].id, jobId],
        );
      }
      if (terminal) {
        await deps.db.query(
          `UPDATE marketing_delivery_assets
           SET retention_until = CASE
                 WHEN $2 = 'succeeded' THEN now() + interval '72 hours'
                 ELSE LEAST(retention_until, now() + interval '4 hours')
               END,
               updated_at = now()
           WHERE publish_job_id = $1 AND delivery_state IN ('available', 'delete_failed')`,
          [jobId, target],
        );
      }
      await audit({ publishJobId: jobId, actorType: "executor", actorId: workerId, eventType: `publish_job.${target}`, detail: { attemptId: input.attemptId, eventId: input.eventId } });
      await deps.db.query("COMMIT");
      return { jobId, attemptId: input.attemptId, status: target, idempotent: false };
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
  }

  async function cancelState(workerId: string, jobId: string, attemptId: string) {
    await getExecutor(workerId);
    const job = await deps.db.query<{ status: string; canceled_at: Date | null }>(
      `SELECT job.status, job.canceled_at
       FROM marketing_publish_jobs AS job
       JOIN marketing_publish_deliveries AS delivery ON delivery.publish_job_id = job.id
       WHERE job.id = $1 AND delivery.attempt_id = $2`,
      [jobId, attemptId],
    );
    if (!job.rows[0]) throw new MarketingError(404, "marketing_publish_job_not_found", "Publish job was not found");
    return {
      jobId,
      canceled: job.rows[0].status === "canceled" || job.rows[0].status === "stale" || Boolean(job.rows[0].canceled_at),
      status: job.rows[0].status,
    };
  }

  async function transitionDelivery(workerId: string, jobId: string, attemptId: string, from: string[], to: string, extraSet = "") {
    const executor = await getExecutor(workerId);
    const stateParams = from.map((_, index) => `$${5 + index}`).join(", ");
    const result = await deps.db.query<{ id: string }>(
      `WITH delivery AS (
         UPDATE marketing_publish_deliveries
         SET status = $4, updated_at = now()${extraSet ? `, ${extraSet}` : ""}
         WHERE publish_job_id = $1 AND attempt_id = $2 AND executor_id = $3
           AND status IN (${stateParams})
         RETURNING id
       )
       UPDATE marketing_publish_jobs
       SET status = $4, updated_at = now()
       WHERE id = $1 AND EXISTS (SELECT 1 FROM delivery)
       RETURNING id`,
      [jobId, attemptId, executor.id, to, ...from],
    );
    return Boolean(result.rows[0]);
  }

  async function recoverExpiredDeliveries(now: Date) {
    const recovered = await deps.db.query<{ job_id: string; campaign_id: string; delivery_id: string; status: string }>(
      `WITH expired AS (
         SELECT delivery.id, delivery.publish_job_id, delivery.status
         FROM marketing_publish_deliveries AS delivery
         JOIN marketing_publish_jobs AS job ON job.id = delivery.publish_job_id
          WHERE job.status IN ('leased', 'downloading', 'downloaded', 'queued', 'running')
            AND delivery.status IN ('leased', 'downloading', 'downloaded', 'queued', 'running')
            AND delivery.lease_until <= $1
          ORDER BY delivery.lease_until, delivery.id
          FOR UPDATE SKIP LOCKED
          LIMIT 100
       ), finalized AS (
         UPDATE marketing_publish_deliveries AS delivery
         SET status = CASE WHEN expired.status = 'running' THEN 'result_unknown' ELSE 'failed' END,
             failure_code = 'lease_expired', failure_message = 'Executor lease expired',
             finished_at = now(), updated_at = now()
         FROM expired
         WHERE delivery.id = expired.id
         RETURNING delivery.publish_job_id, delivery.id, delivery.status
       )
       UPDATE marketing_publish_jobs AS job
       SET status = CASE WHEN finalized.status = 'result_unknown' THEN 'result_unknown' ELSE 'scheduled' END,
           updated_at = now()
       FROM finalized
       WHERE job.id = finalized.publish_job_id
       RETURNING job.id AS job_id, job.campaign_id, finalized.id AS delivery_id, finalized.status`,
      [now],
    );
    for (const delivery of recovered.rows) {
      if (delivery.status === "result_unknown") {
        await deps.db.query(
          `UPDATE marketing_delivery_assets
           SET retention_until = LEAST(retention_until, $2::timestamptz + interval '4 hours'), updated_at = $2::timestamptz
           WHERE publish_job_id = $1 AND delivery_state IN ('available', 'delete_failed')`,
          [delivery.job_id, now],
        );
      }
      await audit({
        campaignId: delivery.campaign_id,
        publishJobId: delivery.job_id,
        actorType: "system",
        eventType: "publish_job.lease_expired",
        detail: { deliveryId: delivery.delivery_id, recovered: delivery.status === "failed" },
      });
    }
  }

  async function recoverExpiredDeliveriesIfDue(now: Date) {
    let state = deliveryRecoveryStates.get(deps.db);
    if (!state) {
      state = { nextRunAtMs: 0, pending: null };
      deliveryRecoveryStates.set(deps.db, state);
    }
    if (state.pending) {
      await state.pending;
      return;
    }
    if (now.getTime() < state.nextRunAtMs) return;
    state.nextRunAtMs = now.getTime() + 15_000;
    const pending = recoverExpiredDeliveries(now).finally(() => {
      if (state?.pending === pending) state.pending = null;
    });
    state.pending = pending;
    await pending;
  }

  async function refreshExecutorHealth(now = new Date()) {
    const cutoff = new Date(now.getTime() - executorHeartbeatWindowMs);
    const offline = await deps.db.query<{ id: string; worker_id: string }>(
      `UPDATE marketing_executors
       SET status = 'offline', updated_at = $1
       WHERE status IN ('active', 'degraded') AND last_heartbeat_at < $2
       RETURNING id, worker_id`,
      [now, cutoff],
    );
    for (const executor of offline.rows) {
      await syncExecutorHealthAlerts({
        executorId: executor.id, workerId: executor.worker_id, status: "offline", capabilities: { healthReasons: ["heartbeat_stale"] },
      });
      await audit({ actorType: "system", actorId: executor.worker_id, eventType: "executor.offline", detail: { cutoff: cutoff.toISOString() } });
    }
    return { offline: offline.rows.length };
  }

  async function cleanupExpiredDeliveryAssets(now = new Date(), limit = 100) {
    if (!deps.storageAdapter || typeof deps.storageAdapter.deleteObject !== "function") {
      throw new MarketingError(409, "marketing_storage_cleanup_unavailable", "Marketing storage cleanup is not configured");
    }
    const normalizedLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
    const claimed = await deps.db.query<CleanupAssetRow>(
      `WITH expired_attention AS (
         UPDATE marketing_attention_cases AS attention
         SET status = 'resolved', resolution = 'delivery_asset_retention_expired', resolved_at = $1
         WHERE attention.status = 'open'
           AND EXISTS (
             SELECT 1
             FROM marketing_delivery_assets AS retained_asset
             WHERE retained_asset.publish_job_id = attention.publish_job_id
               AND retained_asset.delivery_object_key IS NOT NULL
               AND retained_asset.deleted_at IS NULL
               AND retained_asset.retention_until <= $1
           )
         RETURNING attention.id
       ), candidates AS (
         SELECT asset.id, job.campaign_id, job.content_variant_id
         FROM marketing_delivery_assets AS asset
         JOIN marketing_publish_jobs AS job ON job.id = asset.publish_job_id
         WHERE asset.delivery_object_key IS NOT NULL
           AND asset.deleted_at IS NULL
           AND asset.retention_until <= $1
           AND job.status IN ('succeeded', 'failed', 'needs_attention', 'canceled', 'result_unknown', 'stale')
           AND (
             asset.delivery_state IN ('available', 'copy_failed', 'delete_failed')
             OR (asset.delivery_state = 'deleting' AND asset.last_delete_attempt_at <= $1 - interval '15 minutes')
           )
         ORDER BY asset.retention_until, asset.created_at
         FOR UPDATE OF asset SKIP LOCKED
         LIMIT $2
       )
       UPDATE marketing_delivery_assets AS asset
       SET delivery_state = 'deleting', delete_attempts = delete_attempts + 1,
           last_delete_attempt_at = $1, last_delete_error = NULL, updated_at = $1
       FROM candidates
       WHERE asset.id = candidates.id
       RETURNING asset.id, asset.publish_job_id, asset.delivery_bucket, asset.delivery_object_key,
                 asset.delete_attempts, candidates.campaign_id, candidates.content_variant_id`,
      [now, normalizedLimit],
    );
    let deleted = 0;
    let failed = 0;
    for (const asset of claimed.rows) {
      try {
        await deps.storageAdapter.deleteObject({
          bucket: asset.delivery_bucket,
          objectKey: asset.delivery_object_key,
        });
        await deps.db.query(
          `UPDATE marketing_delivery_assets
           SET delivery_state = 'deleted', delivery_url = NULL, deleted_at = $2,
               last_delete_error = NULL, updated_at = $2
           WHERE id = $1 AND delivery_state = 'deleting'`,
          [asset.id, now],
        );
        deleted += 1;
        await audit({
          campaignId: asset.campaign_id,
          contentVariantId: asset.content_variant_id,
          publishJobId: asset.publish_job_id,
          actorType: "system",
          eventType: "delivery_asset.deleted",
          detail: { assetId: asset.id, deleteAttempt: asset.delete_attempts },
        });
      } catch {
        await deps.db.query(
          `UPDATE marketing_delivery_assets
           SET delivery_state = 'delete_failed', last_delete_error = 'storage_delete_failed', updated_at = $2
           WHERE id = $1 AND delivery_state = 'deleting'`,
          [asset.id, now],
        );
        failed += 1;
        await audit({
          campaignId: asset.campaign_id,
          contentVariantId: asset.content_variant_id,
          publishJobId: asset.publish_job_id,
          actorType: "system",
          eventType: "delivery_asset.delete_failed",
          detail: { assetId: asset.id, deleteAttempt: asset.delete_attempts, errorCode: "storage_delete_failed" },
        });
      }
    }
    return { claimed: claimed.rows.length, deleted, failed };
  }

  async function requireProject(id: string) {
    const result = await deps.db.query<{ id: string }>("SELECT id FROM marketing_projects WHERE id = $1 AND status = 'active'", [id]);
    if (!result.rows[0]) throw new MarketingError(404, "marketing_project_not_found", "Marketing project was not found");
  }

  async function requireActiveBrandProfile(projectId: string, requestedProfileId: string | null) {
    const profile = await deps.db.query<{ id: string }>(
      `SELECT profile.id
       FROM marketing_brand_profiles AS profile
       JOIN marketing_projects AS project ON project.id = profile.project_id
       WHERE profile.project_id = $1
         AND profile.status = 'active'
         AND ($2::uuid IS NULL OR profile.id = $2::uuid)
         AND project.active_brand_profile_id = profile.id`,
      [projectId, requestedProfileId],
    );
    if (!profile.rows[0]) {
      throw new MarketingError(409, "marketing_brand_profile_not_active", "The selected brand profile is not active for this project");
    }
    return profile.rows[0].id;
  }

  async function requireCampaign(id: string) {
    const result = await deps.db.query<{ id: string }>("SELECT id FROM marketing_campaigns WHERE id = $1 AND status IN ('draft', 'active')", [id]);
    if (!result.rows[0]) throw new MarketingError(404, "marketing_campaign_not_found", "Marketing campaign was not found");
  }

  async function staleProjectContent(projectId: string) {
    await deps.db.query(
      `UPDATE marketing_content_variants AS variant
       SET status = 'stale', updated_at = now()
       FROM marketing_campaigns AS campaign
       WHERE variant.campaign_id = campaign.id
         AND campaign.project_id = $1
         AND variant.status IN ('draft', 'manual_review_required', 'approved')`,
      [projectId],
    );
  }

  async function staleProjectPublishJobs(projectId: string, failureCode: string) {
    await deps.db.query(
      `WITH stale_jobs AS (
         UPDATE marketing_publish_jobs AS job
         SET status = 'stale', updated_at = now()
         FROM marketing_campaigns AS campaign
         WHERE job.campaign_id = campaign.id
           AND campaign.project_id = $1
           AND job.status IN ('scheduled', 'leased', 'downloading', 'downloaded', 'queued')
         RETURNING job.id
       )
       UPDATE marketing_publish_deliveries AS delivery
       SET status = 'canceled', failure_code = $2, finished_at = now(), lease_until = now(), updated_at = now()
       FROM stale_jobs
       WHERE delivery.publish_job_id = stale_jobs.id
         AND delivery.status IN ('leased', 'downloading', 'downloaded', 'queued')`,
      [projectId, failureCode],
    );
  }

  async function staleProjectResearchBriefs(projectId: string) {
    await deps.db.query(
      `UPDATE marketing_research_briefs AS brief
       SET status = 'stale', updated_at = now()
       FROM marketing_campaigns AS campaign
       WHERE brief.campaign_id = campaign.id AND campaign.project_id = $1
         AND brief.status IN ('draft', 'approved')`,
      [projectId],
    );
  }

  async function stalePlatformPublishJobs(platform: string, failureCode: string) {
    await deps.db.query(
      `WITH stale_jobs AS (
         UPDATE marketing_publish_jobs
         SET status = 'stale', updated_at = now()
         WHERE platform = $1
           AND status IN ('scheduled', 'leased', 'downloading', 'downloaded', 'queued')
         RETURNING id
       )
       UPDATE marketing_publish_deliveries AS delivery
       SET status = 'canceled', failure_code = $2, finished_at = now(), lease_until = now(), updated_at = now()
       FROM stale_jobs
       WHERE delivery.publish_job_id = stale_jobs.id
         AND delivery.status IN ('leased', 'downloading', 'downloaded', 'queued')`,
      [platform, failureCode],
    );
  }

  async function requireCampaignKnowledgeSegments(campaignId: string, ids: string[], approvedOnly: boolean, platform?: string) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) return;
    const result = await deps.db.query<{ id: string }>(
      `SELECT segment.id
       FROM marketing_campaigns AS campaign
       JOIN marketing_knowledge_segments AS segment ON segment.id = ANY($2::uuid[])
       JOIN marketing_knowledge_documents AS document ON document.id = segment.document_id
       LEFT JOIN marketing_sources AS source ON source.id = document.source_id
       WHERE campaign.id = $1
         AND (document.project_id = campaign.project_id OR document.project_id IS NULL)
         AND ($3::boolean = false OR document.status = 'approved')
         AND ($4::text IS NULL OR document.applicable_platforms_json = '[]'::jsonb
              OR document.applicable_platforms_json @> jsonb_build_array($4::text))
         AND (source.id IS NULL OR (source.status = 'active' AND source.authorization_status IN ('owned', 'authorized')))`,
      [campaignId, uniqueIds, approvedOnly, platform ?? null],
    );
    if (new Set(result.rows.map((row) => row.id)).size !== uniqueIds.length) {
      throw new MarketingError(409, "marketing_knowledge_segment_scope_invalid", "Knowledge segments are unavailable for the selected campaign");
    }
  }

  async function requireAuthorizedContentAssets(manifestValue: Json) {
    const manifest = Array.isArray(manifestValue) ? manifestValue : [];
    const assets = manifest.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new MarketingError(409, "marketing_content_assets_invalid", "Content assets must use an authorized storage object manifest");
      }
      const record = item as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type.trim() : "";
      const storageObjectId = typeof record.storageObjectId === "string" ? record.storageObjectId.trim() : "";
      const authorizationStatus = typeof record.authorizationStatus === "string" ? record.authorizationStatus : "";
      if (!type || !storageObjectId || (authorizationStatus !== "owned" && authorizationStatus !== "authorized")) {
        throw new MarketingError(409, "marketing_content_assets_unauthorized", "Content assets must be owned or authorized storage objects");
      }
      return { type, storageObjectId, authorizationStatus };
    });
    if (!assets.length) {
      throw new MarketingError(409, "marketing_content_assets_required", "Manual approval requires at least one authorized content asset");
    }
    const storageObjectIds = [...new Set(assets.map((asset) => asset.storageObjectId))];
    const available = await deps.db.query<{ id: string }>(
      `SELECT id FROM storage_objects
       WHERE id = ANY($1::uuid[]) AND status = 'available' AND deleted_at IS NULL`,
      [storageObjectIds],
    );
    if (new Set(available.rows.map((object) => object.id)).size !== storageObjectIds.length) {
      throw new MarketingError(409, "marketing_content_assets_unavailable", "One or more reviewed content assets are no longer available");
    }
    return assets;
  }

  function assertPublishAssetsMatchManifest(assets: MarketingPublishJobInput["assets"], manifestValue: Json) {
    const manifest = Array.isArray(manifestValue) ? manifestValue : [];
    const approved = manifest.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const storageObjectId = typeof record.storageObjectId === "string" ? record.storageObjectId : "";
      const type = typeof record.type === "string" ? record.type : "";
      const authorizationStatus = typeof record.authorizationStatus === "string" ? record.authorizationStatus : "";
      return storageObjectId && (authorizationStatus === "owned" || authorizationStatus === "authorized")
        ? [{ storageObjectId, type }]
        : [];
    });
    if (approved.length !== assets.length || assets.some((asset) => (
      !asset.storageObjectId
      || !approved.some((entry) => entry.storageObjectId === asset.storageObjectId && entry.type === asset.type)
    ))) {
      throw new MarketingError(409, "marketing_publish_assets_not_approved", "Publish assets must exactly match the authorized content asset manifest");
    }
  }

  async function getExecutor(workerId: string, options: { requireReady?: boolean } = {}) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - executorHeartbeatWindowMs);
    const result = await deps.db.query<{ id: string; capabilities_json: Json }>(
      `SELECT id, capabilities_json FROM marketing_executors
       WHERE worker_id = $1
         AND status = ANY($2::text[])
         AND ($3::boolean = false OR last_heartbeat_at >= $4)`,
      [workerId, options.requireReady ? ["active"] : ["active", "degraded"], options.requireReady === true, cutoff],
    );
    if (!result.rows[0]) {
      const code = options.requireReady ? "marketing_executor_not_ready" : "marketing_executor_not_registered";
      throw new MarketingError(403, code, "Marketing executor is not available");
    }
    return { id: result.rows[0].id, capabilities: jsonValue(result.rows[0].capabilities_json) };
  }

  async function syncExecutorHealthAlerts(input: { executorId: string; workerId: string; status: string; capabilities: Json }) {
    const capability = jsonValue(input.capabilities);
    const reportedReasons = stringArray(capability.healthReasons);
    const reasons = input.status === "active"
      ? []
      : [...new Set(reportedReasons.length ? reportedReasons : [input.status === "offline" ? "heartbeat_stale" : "executor_degraded"])];
    const resolved = await deps.db.query<{ reason: string }>(
      `UPDATE marketing_executor_alerts
       SET status = 'resolved', resolved_at = now(), updated_at = now()
       WHERE executor_id = $1 AND status = 'open'
         AND (cardinality($2::text[]) = 0 OR NOT reason = ANY($2::text[]))
       RETURNING reason`,
      [input.executorId, reasons],
    );
    for (const reason of reasons) {
      await deps.db.query(
        `INSERT INTO marketing_executor_alerts (
           id, executor_id, reason, detail_json, detected_at, last_seen_at
         ) VALUES ($1, $2, $3, $4::jsonb, now(), now())
         ON CONFLICT (executor_id, reason) WHERE status = 'open' DO UPDATE
         SET detail_json = EXCLUDED.detail_json, last_seen_at = now(), updated_at = now()`,
        [randomUUID(), input.executorId, reason, json({ workerId: input.workerId, status: input.status, freeDiskBytes: capability.freeDiskBytes ?? null })],
      );
    }
    if (resolved.rows.length || reasons.length) {
      await audit({ actorType: "system", actorId: input.workerId, eventType: "executor.health_alerts_updated", detail: { status: input.status, reasons, resolved: resolved.rows.map((row) => row.reason) } });
    }
  }

  async function audit(input: {
    projectId?: string; campaignId?: string; contentVariantId?: string; publishJobId?: string;
    actorAdminId?: string; actorType?: "executor" | "system"; actorId?: string; eventType: string; detail: Json;
  }) {
    await deps.db.query(
      `INSERT INTO marketing_audit_events (
        id, project_id, campaign_id, content_variant_id, publish_job_id, actor_type, actor_id, event_type, detail_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [randomUUID(), input.projectId ?? null, input.campaignId ?? null, input.contentVariantId ?? null, input.publishJobId ?? null,
        input.actorType ?? "admin", input.actorId ?? input.actorAdminId ?? "system", input.eventType, json(input.detail)],
    );
  }

  return {
    createProject, createBrandProfileVersion, activateBrandProfile, revokeBrandProfile, listBrandProfiles,
    addSource, revokeSource, createKnowledgeDocument, approveKnowledgeDocument, searchKnowledge,
    createCampaign, createCompetitorCollectionJob, updateCompetitorCollectionJob, listCompetitorCollectionJobs, createResearchBrief, reviewResearchBrief, createContentVariant, approveContentVariant, reviewContentVariant,
    savePlatformCapabilityProfile, runComplianceCheck, createPublishJob, createDirectPublish, cancelPublishJob, cancelGenerationRun,
    configureExecutionOwner, ensureDirectPublishPlatformProfile, retryGenerationRun, confirmGenerationPlan, regenerateGenerationRun, confirmGeneratedMedia,
    listConsole, listDirectConsole, saveComponentAdmission, saveResearchSourcePolicy, assignAttentionCase, resolveAttentionCase, createTrendPattern, approveTrendPattern,
    startAgentRun, retryAgentRun, recordMetric, saveAgentProviderApproval,
    registerExecutor, scheduleExecutorKeyRetirement, claimNext, acknowledge, heartbeat, reportEvent, cancelState, cleanupExpiredDeliveryAssets, refreshExecutorHealth,
  };
}

function confirmedGenerationKnowledgeContent(run: {
  content_type: "image" | "video";
  direction: string;
  plan_json: Json;
}) {
  return [
    `已确认${run.content_type === "video" ? "视频" : "图文"}内容`,
    `内容主题：${run.direction}`,
    `标题：${readPlanField(run.plan_json, "title")}`,
    `文案：${readPlanField(run.plan_json, "copy")}`,
    `脚本：${readPlanField(run.plan_json, "script")}`,
    `${run.content_type === "video" ? "视频" : "图片"}提示词：${readPlanField(run.plan_json, "mediaPrompt")}`,
    `素材摘要：已确认的${run.content_type === "video" ? "视频" : "图文"}素材。`,
  ].filter((line) => !line.endsWith("：")).join("\n");
}

function readPlanField(value: Json, key: string) {
  const plan = jsonValue(value);
  if (!plan || Array.isArray(plan)) return "";
  const field = plan[key];
  return typeof field === "string" ? field.trim().slice(0, 12_000) : "";
}

function sanitizeDirectContentTheme(value: string) {
  return value
    .replace(/(?:品牌|广告|营销|推广|引流|种草|转化|带货|促销|投放|商业化)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type ClaimRow = {
  id: string; campaign_id: string; content_variant_id: string; platform: string; executor_account_ref: string;
  idempotency_key: string; scheduled_at: Date; not_before: Date; execute_deadline: Date; delivery_id: string;
  attempt_id: string; lease_until: Date; title: string; body_json: Json; content_type: "image" | "video";
};
type AssetRow = {
  id: string; asset_type: string; storage_object_id: string | null; delivery_url: string | null; sha256: string;
  content_type: string; size_bytes: number | null; expires_at: Date; bucket: string | null; object_key: string | null;
  storage_status: string | null; deleted_at: Date | null;
};
type DeliveryRow = { id: string; status: string; job_status: string; canceled_at: Date | null };
type CleanupAssetRow = {
  id: string; publish_job_id: string; delivery_bucket: string; delivery_object_key: string;
  delete_attempts: number; campaign_id: string; content_variant_id: string;
};
export type MetricComparisonRow = {
  campaignId: string;
  campaignName: string;
  objective: string;
  platform: string;
  executorAccountRef: string;
  contentVariantId: string;
  title: string;
  metricName: string;
  observationWindow: Json;
  sampleCount: number | string;
  averageValue: number | string;
};

export function buildMarketingMetricComparisons(rows: MetricComparisonRow[]) {
  const groups = new Map<string, {
    campaignId: string; campaignName: string; objective: string; platform: string; executorAccountRef: string;
    metricName: string; observationWindow: Json; variants: Array<{ contentVariantId: string; title: string; sampleCount: number; averageValue: number }>;
  }>();
  for (const row of rows) {
    const observationWindow = jsonValue(row.observationWindow);
    const key = [row.campaignId, row.platform, row.executorAccountRef, row.objective, row.metricName, JSON.stringify(observationWindow)].join("\u0000");
    const group = groups.get(key) ?? {
      campaignId: row.campaignId, campaignName: row.campaignName, objective: row.objective, platform: row.platform,
      executorAccountRef: row.executorAccountRef, metricName: row.metricName, observationWindow, variants: [],
    };
    group.variants.push({
      contentVariantId: row.contentVariantId,
      title: row.title,
      sampleCount: Number(row.sampleCount),
      averageValue: Number(row.averageValue),
    });
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const variants = group.variants.sort((left, right) => right.averageValue - left.averageValue || left.contentVariantId.localeCompare(right.contentVariantId));
    const sampleSize = variants.reduce((total, variant) => total + variant.sampleCount, 0);
    return {
      ...group,
      variants,
      sampleSize,
      conclusion: variants.length >= 2 ? "descriptive_comparison" : "insufficient_sample",
    };
  }).sort((left, right) => right.sampleSize - left.sampleSize || left.campaignName.localeCompare(right.campaignName));
}

const eventStatuses = new Set(["downloading", "downloaded", "queued", "running", "succeeded", "failed", "needs_attention", "canceled", "result_unknown"]);
const terminalStatuses = new Set(["succeeded", "failed", "needs_attention", "canceled", "result_unknown"]);

function canTransition(from: string, to: string) {
  if (to === "needs_attention" || to === "canceled") return !terminalStatuses.has(from);
  const allowed: Record<string, string[]> = {
    leased: ["downloading", "downloaded", "queued"],
    downloading: ["downloaded"],
    downloaded: ["queued", "running"],
    queued: ["running"],
    running: ["succeeded", "failed", "result_unknown"],
  };
  return allowed[from]?.includes(to) ?? false;
}

function executorSupports(capabilities: Json, platform: string, accountRef: string, contentType: "image" | "video") {
  if (!capabilities || Array.isArray(capabilities)) return false;
  const platforms = Array.isArray(capabilities.platforms) ? capabilities.platforms : [];
  const accountSupported = platforms.some((item) => (
    item && typeof item === "object"
      && (item as Record<string, unknown>).platform === platform
      && Array.isArray((item as Record<string, unknown>).accountRefs)
      && ((item as Record<string, unknown>).accountRefs as unknown[]).includes(accountRef)
  ));
  const platformCapabilities = Array.isArray(capabilities.platformCapabilities) ? capabilities.platformCapabilities : [];
  const contentSupported = platformCapabilities.some((item) => {
    if (!item || typeof item !== "object" || (item as Record<string, unknown>).platform !== platform) return false;
    return contentType === "video"
      ? (item as Record<string, unknown>).supportsVideo === true
      : (item as Record<string, unknown>).supportsImagePost === true;
  });
  return accountSupported && contentSupported;
}

function normalizeHttpsUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    throw new MarketingError(400, "marketing_publish_url_invalid", "Publish URL must be HTTPS");
  }
}

function normalizeOptionalHttpsUrl(value: string | null | undefined, code: string) {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || !parsed.hostname) throw new Error("invalid URL");
    return parsed.toString();
  } catch {
    throw new MarketingError(400, code, "Source URL must be HTTPS");
  }
}

function normalizeOptionalSha256(value: string | null | undefined, code: string) {
  if (!value?.trim()) return null;
  const hash = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new MarketingError(400, code, "Content hash must be a SHA-256 hexadecimal digest");
  }
  return hash;
}

function booleanConfig(config: Record<string, unknown>, ...keys: string[]) {
  return keys.some((key) => config[key] === true);
}

function boundedRuleInteger(value: unknown, upperBound: number) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= upperBound ? parsed : null;
}

function campaignLimit(value: Json, key: string, upperBound: number) {
  const config = value && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return boundedRuleInteger(config[key], upperBound);
}

function assertCampaignVideoDuration(value: Json, maxDurationSeconds: number) {
  const assets = Array.isArray(value) ? value : [];
  const durations = assets
    .filter((asset) => asset && typeof asset === "object" && !Array.isArray(asset)
      && (asset as Record<string, unknown>).type === "video")
    .map((asset) => Number((asset as Record<string, unknown>).durationSeconds ?? (asset as Record<string, unknown>).durationSec));
  if (!durations.length || durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    throw new MarketingError(409, "marketing_campaign_video_duration_required", "Video duration is required when the campaign has a duration limit");
  }
  if (Math.max(...durations) > maxDurationSeconds) {
    throw new MarketingError(409, "marketing_campaign_video_duration_limit_reached", "Campaign video duration limit has been exceeded");
  }
}

function marketingAssetStorageObjectIds(value: Json) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const storageObjectId = (item as Record<string, unknown>).storageObjectId;
    return typeof storageObjectId === "string" && storageObjectId.trim() ? [storageObjectId.trim()] : [];
  }))];
}

function marketingSnapshotStorageObjectIds(value: Json) {
  const ids = new Set<string>();
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    const record = candidate as Record<string, unknown>;
    const storageObjectId = record.storageObjectId;
    if (typeof storageObjectId === "string" && storageObjectId.trim()) ids.add(storageObjectId.trim());
    Object.values(record).forEach(visit);
  };
  visit(value);
  return [...ids];
}

function chinaDayBounds(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const start = new Date(Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day), -8));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function buildMarketingDeliveryObjectKey(jobId: string, assetId: string, sourceObjectKey: string) {
  const sourceName = sourceObjectKey.split("/").filter(Boolean).at(-1) ?? "asset";
  const safeName = sourceName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
  return `marketing-delivery/${jobId}/${assetId}-${safeName}`;
}

function normalizeResearchDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) || domain.includes("..") || domain.includes(":")) {
    throw new MarketingError(400, "marketing_research_policy_domain_invalid", "Research source domain is invalid");
  }
  return domain;
}

function normalizeManualReviewDimensions(value: {
  facts: boolean;
  assetRights: boolean;
  disclosure: boolean;
  platformRules: boolean;
}) {
  if (typeof value?.facts !== "boolean" || typeof value.assetRights !== "boolean"
    || typeof value.disclosure !== "boolean" || typeof value.platformRules !== "boolean") {
    throw new MarketingError(400, "marketing_manual_review_dimensions_invalid", "Manual review dimensions must be explicit booleans");
  }
  return {
    facts: value.facts,
    assetRights: value.assetRights,
    disclosure: value.disclosure,
    platformRules: value.platformRules,
  };
}

function assertManualReviewIdempotency(
  existing: { decision: "approve" | "reject"; review_dimensions_json: Json; notes: string },
  decision: "approve" | "reject",
  dimensions: { facts: boolean; assetRights: boolean; disclosure: boolean; platformRules: boolean },
  notes: string,
) {
  const stored = jsonValue(existing.review_dimensions_json);
  const storedDimensions = stored && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  if (existing.decision !== decision || existing.notes !== notes
    || storedDimensions.facts !== dimensions.facts
    || storedDimensions.assetRights !== dimensions.assetRights
    || storedDimensions.disclosure !== dimensions.disclosure
    || storedDimensions.platformRules !== dimensions.platformRules) {
    throw new MarketingError(409, "marketing_manual_review_idempotency_conflict", "Manual review idempotency key is already used by a different decision");
  }
}

function manualReviewResult(contentVariantId: string, reviewId: string, decision: "approve" | "reject", idempotent: boolean) {
  return {
    id: contentVariantId,
    reviewId,
    status: decision === "approve" ? "approved" : "rejected",
    decision,
    idempotent,
  };
}

function requireText(value: string | null | undefined, code: string) {
  if (!value?.trim()) throw new MarketingError(400, code, "Required field is missing");
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number, code: string) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new MarketingError(400, code, `Value must be an integer between ${min} and ${max}`);
  }
  return value;
}

function normalizeCrawlerBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new MarketingError(400, "marketing_competitor_crawler_url_invalid", "Crawler URL must be an absolute HTTP URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MarketingError(400, "marketing_competitor_crawler_url_invalid", "Crawler URL must be HTTP or HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new MarketingError(400, "marketing_competitor_crawler_url_invalid", "Crawler URL must not contain credentials, query, or fragment");
  }
  return url.toString().replace(/\/$/, "");
}

function camelToSnake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function isSafeMarketingAgentInputPath(value: string) {
  if (value.length > 200) return false;
  return value.split(".").every((part) => /^[A-Za-z][A-Za-z0-9_]*$/.test(part)
    && part !== "__proto__" && part !== "prototype" && part !== "constructor");
}

function parseTime(value: string, code: string) {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new MarketingError(400, code, "Timestamp must be RFC3339");
  return result;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

function json(value: Json) {
  return JSON.stringify(value);
}

function directPublishCapability(capabilities: Json, platform: string, executorAccountRef: string) {
  const record = Array.isArray(capabilities) ? {} : capabilities;
  const accounts = Array.isArray(record.accounts) ? record.accounts : [];
  const account = accounts.find((item) => item && typeof item === "object"
    && (item as Record<string, unknown>).platform === platform
    && (item as Record<string, unknown>).executorAccountRef === executorAccountRef
    && (item as Record<string, unknown>).status === "available");
  if (!account) return null;
  const profiles = Array.isArray(record.platformCapabilities) ? record.platformCapabilities : [];
  const profile = profiles.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).platform === platform);
  if (!profile) return null;
  const value = profile as Record<string, unknown>;
  return {
    supportsVideo: value.supportsVideo === true,
    supportsImagePost: value.supportsImagePost === true,
    supportsTags: value.supportsTags === true,
    supportsNativeScheduling: value.supportsNativeScheduling === true,
  };
}

function generationSkillValue(value: Json | string, key: string) {
  const record = jsonValue(value);
  if (!record || Array.isArray(record)) return "";
  const item = record[key];
  return typeof item === "string" ? item.trim() : "";
}

function generationSkillId(value: Json | string) {
  return generationSkillValue(value, "skillId");
}

function jsonValue(value: Json | string): Json {
  return typeof value === "string" ? JSON.parse(value) as Json : value;
}

function stringArray(value: unknown) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function splitKnowledgeContent(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > 1500) {
    const boundary = Math.max(
      remaining.lastIndexOf("\n", 1500),
      remaining.lastIndexOf("。", 1500),
      remaining.lastIndexOf("！", 1500),
      remaining.lastIndexOf("？", 1500),
    );
    const length = boundary >= 500 ? boundary + 1 : 1500;
    chunks.push(remaining.slice(0, length).trim());
    remaining = remaining.slice(length).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function selectTrendPatternFields(value: Json) {
  if (!value || Array.isArray(value)) {
    throw new MarketingError(400, "marketing_trend_pattern_invalid", "Trend patterns must be structured insight fields");
  }
  const allowed = new Set(["hookType", "pacing", "shotTypes", "subtitleDensity", "interactionStyle", "audience", "riskTags"]);
  const pattern: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (allowed.has(key)) pattern[key] = item;
  }
  if (!Object.keys(pattern).length) {
    throw new MarketingError(400, "marketing_trend_pattern_invalid", "Trend patterns require at least one approved structural field");
  }
  return pattern;
}
