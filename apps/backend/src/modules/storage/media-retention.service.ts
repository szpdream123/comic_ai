import {
  deleteStorageObjectRecord,
  type StorageAdapter,
} from "./storage.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";

const DEFAULT_RETENTION_DAYS = 45;
const DEFAULT_BATCH_LIMIT = 1_000;
const MAX_BATCH_LIMIT = 10_000;

export interface MediaRetentionRuntime {
  adapter: StorageAdapter;
  localObjectStore?: {
    deleteObject(input: { bucket: string; objectKey: string }): Promise<void>;
  } | null;
}

export interface MediaRetentionSummary {
  retentionDays: number;
  cutoffAt: string;
  eligibleCount: number;
  eligibleImageCount: number;
  eligibleVideoCount: number;
  eligibleBytes: number;
  protectedCount: number;
  protectedBytes: number;
}

export interface MediaRetentionRunResult extends MediaRetentionSummary {
  scannedCount: number;
  deletedCount: number;
  deletedImageCount: number;
  deletedVideoCount: number;
  deletedBytes: number;
  failedCount: number;
  failedBytes: number;
  remainingCount: number;
}

interface RetentionCandidate {
  id: string;
  bucket: string;
  object_key: string;
  size_bytes: number | string | null;
  content_type: string;
}

const RETENTION_SOURCE_CTE = `
  WITH media AS (
    SELECT
      so.id,
      so.bucket,
      so.object_key,
      so.size_bytes,
      so.content_type,
      so.status,
      so.deleted_at,
      so.created_at,
      COALESCE(pur.source_action, '') AS source_action,
      COALESCE(pur.completed_at, pur.created_at, so.created_at) AS upload_at,
      generation.completed_at AS generation_at,
      generation.target_type AS generation_target_type,
      generated_version.source_task_id AS generated_source_task_id,
      (so.metadata_json ? 'taskId' OR generated_version.source_task_id IS NOT NULL
        OR LOWER(COALESCE(pur.source_action, '')) IN ('generate_image', 'generate_video')) AS is_generated,
      (
        EXISTS (SELECT 1 FROM team_assets team_asset WHERE team_asset.storage_object_id = so.id)
        OR LOWER(COALESCE(pur.source_action, '')) LIKE 'team_asset%'
        OR LOWER(COALESCE(pur.source_action, '')) LIKE 'team-assets/%'
        OR COALESCE(generation.target_type = 'team_asset', FALSE)
        OR LOWER(COALESCE(pur.source_action, '')) LIKE '%cover%'
        OR EXISTS (SELECT 1 FROM projects project WHERE project.cover_storage_object_id = so.id)
        OR EXISTS (SELECT 1 FROM scripts script WHERE script.cover_storage_object_id = so.id)
        OR EXISTS (SELECT 1 FROM prompts prompt WHERE prompt.cover_storage_object_id = so.id)
        OR EXISTS (SELECT 1 FROM skills skill WHERE skill.cover_storage_object_id = so.id OR skill.preview_storage_object_id = so.id)
        OR EXISTS (SELECT 1 FROM skill_files skill_file WHERE skill_file.storage_object_id = so.id)
        OR EXISTS (SELECT 1 FROM creator_brand_kits kit WHERE kit.cover_storage_object_id = so.id)
        OR EXISTS (SELECT 1 FROM creator_brand_kit_assets kit_asset WHERE kit_asset.storage_object_id = so.id)
        OR LOWER(COALESCE(pur.source_action, '')) LIKE 'admin_%'
        OR LOWER(COALESCE(pur.source_action, '')) LIKE 'official%'
      ) AS is_protected
    FROM storage_objects so
    LEFT JOIN LATERAL (
      SELECT pur.source_action, pur.created_at, pur.completed_at
      FROM project_upload_records pur
      WHERE pur.storage_object_id = so.id
      ORDER BY pur.created_at DESC, pur.id DESC
      LIMIT 1
    ) pur ON TRUE
    LEFT JOIN LATERAL (
      SELECT asset_version.source_task_id::text AS source_task_id
      FROM asset_versions asset_version
      WHERE asset_version.storage_object_id = so.id
        AND asset_version.source_task_id IS NOT NULL
      ORDER BY asset_version.created_at DESC, asset_version.id DESC
      LIMIT 1
    ) generated_version ON TRUE
    LEFT JOIN LATERAL (
      SELECT snapshot.completed_at, snapshot.target_type
      FROM ai_generation_task_snapshots snapshot
      WHERE snapshot.task_id::text = COALESCE(
        NULLIF(so.metadata_json ->> 'taskId', ''),
        generated_version.source_task_id
      )
      ORDER BY snapshot.updated_at DESC, snapshot.id DESC
      LIMIT 1
    ) generation ON TRUE
    WHERE so.status IN ('available', 'delete_failed')
      AND so.deleted_at IS NULL
      AND (so.content_type LIKE 'image/%' OR so.content_type LIKE 'video/%')
  ), eligible AS (
    SELECT *,
      CASE WHEN is_generated THEN COALESCE(generation_at, created_at)
        ELSE upload_at
      END AS retention_at
    FROM media
  )
`;

function resolveRetentionDays(value?: number) {
  const days = Number(value ?? DEFAULT_RETENTION_DAYS);
  return Number.isFinite(days) && days >= 1 && days <= 3650
    ? Math.floor(days)
    : DEFAULT_RETENTION_DAYS;
}

function resolveBatchLimit(value?: number) {
  const limit = Number(value ?? DEFAULT_BATCH_LIMIT);
  return Number.isFinite(limit) && limit >= 1
    ? Math.min(Math.floor(limit), MAX_BATCH_LIMIT)
    : DEFAULT_BATCH_LIMIT;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function dateValue(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export async function inspectMediaRetention(
  db: SqlDatabase,
  input: { now?: Date; retentionDays?: number } = {},
): Promise<MediaRetentionSummary> {
  const now = input.now ?? new Date();
  const retentionDays = resolveRetentionDays(input.retentionDays);
  const cutoffAt = new Date(now.getTime() - retentionDays * 24 * 60 * 60_000);
  const result = await db.query<{
    eligible_count: number | string;
    eligible_image_count: number | string;
    eligible_video_count: number | string;
    eligible_bytes: number | string | null;
    protected_count: number | string;
    protected_bytes: number | string | null;
  }>(
    `${RETENTION_SOURCE_CTE}
      SELECT
        COUNT(*) FILTER (WHERE retention_at <= $1 AND NOT is_protected)::bigint AS eligible_count,
        COUNT(*) FILTER (WHERE retention_at <= $1 AND NOT is_protected AND content_type LIKE 'image/%')::bigint AS eligible_image_count,
        COUNT(*) FILTER (WHERE retention_at <= $1 AND NOT is_protected AND content_type LIKE 'video/%')::bigint AS eligible_video_count,
        COALESCE(SUM(size_bytes) FILTER (WHERE retention_at <= $1 AND NOT is_protected), 0)::bigint AS eligible_bytes,
        COUNT(*) FILTER (WHERE retention_at <= $1 AND is_protected)::bigint AS protected_count,
        COALESCE(SUM(size_bytes) FILTER (WHERE retention_at <= $1 AND is_protected), 0)::bigint AS protected_bytes
      FROM eligible`,
    [cutoffAt],
  );
  const row = result.rows[0];
  return {
    retentionDays,
    cutoffAt: cutoffAt.toISOString(),
    eligibleCount: Number(row?.eligible_count ?? 0),
    eligibleImageCount: Number(row?.eligible_image_count ?? 0),
    eligibleVideoCount: Number(row?.eligible_video_count ?? 0),
    eligibleBytes: numberValue(row?.eligible_bytes),
    protectedCount: Number(row?.protected_count ?? 0),
    protectedBytes: numberValue(row?.protected_bytes),
  };
}

async function listRetentionCandidates(
  db: SqlDatabase,
  input: { cutoffAt: Date; limit: number },
) {
  const result = await db.query<RetentionCandidate>(
    `${RETENTION_SOURCE_CTE}
      SELECT id, bucket, object_key, size_bytes, content_type
      FROM eligible
      WHERE retention_at <= $1
        AND NOT is_protected
      ORDER BY retention_at ASC, created_at ASC, id ASC
      LIMIT $2`,
    [input.cutoffAt, input.limit],
  );
  return result.rows;
}

export async function runMediaRetention(
  db: SqlDatabase,
  input: {
    runtime: MediaRetentionRuntime;
    now?: Date;
    retentionDays?: number;
    limit?: number;
  },
): Promise<MediaRetentionRunResult> {
  const now = input.now ?? new Date();
  const summary = await inspectMediaRetention(db, {
    now,
    retentionDays: input.retentionDays,
  });
  const cutoffAt = dateValue(summary.cutoffAt);
  const candidates = await listRetentionCandidates(db, {
    cutoffAt,
    limit: resolveBatchLimit(input.limit),
  });
  let deletedCount = 0;
  let deletedImageCount = 0;
  let deletedVideoCount = 0;
  let deletedBytes = 0;
  let failedCount = 0;
  let failedBytes = 0;

  for (const candidate of candidates) {
    const deleted = await deleteStorageObjectRecord(db, {
      storageObjectId: candidate.id,
      adapter: input.runtime.adapter,
      localObjectStore: input.runtime.localObjectStore,
      now,
    });
    const sizeBytes = numberValue(candidate.size_bytes);
    if (deleted?.status === "deleted") {
      deletedCount += 1;
      deletedBytes += sizeBytes;
      if (candidate.content_type.startsWith("video/")) deletedVideoCount += 1;
      else deletedImageCount += 1;
    } else {
      failedCount += 1;
      failedBytes += sizeBytes;
    }
  }

  const after = await inspectMediaRetention(db, { now, retentionDays: summary.retentionDays });
  return {
    ...after,
    scannedCount: candidates.length,
    deletedCount,
    deletedImageCount,
    deletedVideoCount,
    deletedBytes,
    failedCount,
    failedBytes,
    remainingCount: after.eligibleCount,
  };
}

export const __mediaRetentionTestUtils = {
  resolveRetentionDays,
  resolveBatchLimit,
};
