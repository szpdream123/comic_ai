import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface GenerationArtifactHandoff {
  mediaType: "image" | "video" | "audio";
  attemptId: string;
  storageObjectId: string;
  storageObjectKey: string;
  contentType: string;
  fetchedAt: string;
}

export async function recordGenerationArtifactHandoff(
  db: SqlDatabase,
  input: {
    taskId: string;
    mediaType: GenerationArtifactHandoff["mediaType"];
    attemptId: string;
    storageObjectId: string;
    storageObjectKey: string;
    contentType: string;
    now: Date;
  },
) {
  const handoff: GenerationArtifactHandoff = {
    mediaType: input.mediaType,
    attemptId: input.attemptId,
    storageObjectId: input.storageObjectId,
    storageObjectKey: input.storageObjectKey,
    contentType: input.contentType,
    fetchedAt: input.now.toISOString(),
  };
  const updated = await db.query<{ task_id: string }>(
    `
      UPDATE ai_generation_task_snapshots
      SET status = CASE WHEN status IN ('queued', 'running') THEN 'running' ELSE status END,
          progress_stage = CASE WHEN status IN ('queued', 'running') THEN 'artifact_fetched' ELSE progress_stage END,
          progress_percent = CASE
            WHEN status IN ('queued', 'running') THEN GREATEST(COALESCE(progress_percent, 0), 80)
            ELSE progress_percent
          END,
          provider_status_json = COALESCE(provider_status_json, '{}'::jsonb)
            || jsonb_build_object('artifactHandoff', $2::jsonb),
          updated_at = $3
      WHERE task_id = $1
        AND status IN ('queued', 'running', 'failed', 'result_unknown', 'manual_review_required', 'succeeded')
      RETURNING task_id
    `,
    [input.taskId, JSON.stringify(handoff), input.now],
  );
  if (!updated.rows[0]) throw new Error("generation_artifact_handoff_snapshot_missing");
  return handoff;
}

export async function findGenerationArtifactHandoff(
  db: SqlDatabase,
  taskId: string,
): Promise<GenerationArtifactHandoff | null> {
  const row = await queryOne<{ handoff: Record<string, unknown> | string | null }>(
    db,
    `
      SELECT provider_status_json->'artifactHandoff' AS handoff
      FROM ai_generation_task_snapshots
      WHERE task_id = $1
      LIMIT 1
    `,
    [taskId],
  );
  const value = typeof row?.handoff === "string" ? parseRecord(row.handoff) : row?.handoff;
  if (!value || typeof value !== "object") return null;
  const mediaType = readString(value.mediaType);
  const attemptId = readString(value.attemptId);
  const storageObjectId = readString(value.storageObjectId);
  const storageObjectKey = readString(value.storageObjectKey);
  const contentType = readString(value.contentType);
  const fetchedAt = readString(value.fetchedAt);
  if (
    (mediaType !== "image" && mediaType !== "video" && mediaType !== "audio")
    || !storageObjectId
    || !attemptId
    || !storageObjectKey
    || !contentType
    || !fetchedAt
  ) return null;
  const available = await queryOne<{ available: boolean }>(
    db,
    `
      SELECT true AS available
      FROM storage_objects
      WHERE id = $1
        AND object_key = $2
        AND status = 'available'
      LIMIT 1
    `,
    [storageObjectId, storageObjectKey],
  );
  if (!available?.available) return null;
  return { mediaType, attemptId, storageObjectId, storageObjectKey, contentType, fetchedAt };
}

export async function findOrRecoverGenerationArtifactHandoff(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId: string;
    mediaType: GenerationArtifactHandoff["mediaType"];
    now: Date;
  },
) {
  const recorded = await findGenerationArtifactHandoff(db, input.taskId);
  if (recorded?.attemptId === input.attemptId && recorded.mediaType === input.mediaType) {
    return recorded;
  }
  const recovered = await queryOne<{
    id: string;
    object_key: string;
    content_type: string;
  }>(
    db,
    `
      SELECT id, object_key, content_type
      FROM storage_objects
      WHERE status = 'available'
        AND metadata_json->>'taskId' = $1
        AND metadata_json->>'attemptId' = $2
        AND metadata_json->>'mediaType' = $3
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.taskId, input.attemptId, input.mediaType],
  );
  if (!recovered) return null;
  return recordGenerationArtifactHandoff(db, {
    taskId: input.taskId,
    attemptId: input.attemptId,
    mediaType: input.mediaType,
    storageObjectId: recovered.id,
    storageObjectKey: recovered.object_key,
    contentType: recovered.content_type,
    now: input.now,
  });
}

function parseRecord(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
