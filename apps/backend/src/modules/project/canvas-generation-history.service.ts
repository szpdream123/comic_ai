import type { CanvasActorScope } from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";

export interface CanvasGenerationHistoryCursor {
  createdAt: string;
  id: string;
}

export class CanvasGenerationHistoryError extends Error {
  constructor(readonly code: string, message = code) { super(message); }
}

export async function listCanvasGenerationHistory(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    actorScope: CanvasActorScope;
    nodeKey?: string | null;
    status?: string | null;
    mediaKind?: string | null;
    search?: string | null;
    limit?: number;
    cursor?: CanvasGenerationHistoryCursor | null;
  },
) {
  assertView(input.canvasProjectId, input.actorScope);
  const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50)));
  const params: unknown[] = [input.canvasProjectId];
  const where = ["run.canvas_project_id = $1", "run.deleted_at IS NULL"];
  if (input.nodeKey?.trim()) { params.push(input.nodeKey.trim()); where.push(`run.node_key = $${params.length}`); }
  if (input.status?.trim()) { params.push(input.status.trim()); where.push(`run.status = $${params.length}`); }
  if (input.mediaKind?.trim()) { params.push(input.mediaKind.trim()); where.push(`run.media_kind = $${params.length}`); }
  if (input.search?.trim()) {
    params.push(`%${input.search.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    where.push(`(
      run.node_key ILIKE $${params.length} ESCAPE '\\'
      OR run.model_code ILIKE $${params.length} ESCAPE '\\'
      OR run.input_snapshot_json::text ILIKE $${params.length} ESCAPE '\\'
      OR run.output_snapshot_json::text ILIKE $${params.length} ESCAPE '\\'
    )`);
  }
  if (input.cursor) {
    params.push(input.cursor.createdAt, input.cursor.id);
    where.push(`(run.created_at, run.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(limit + 1);
  const rows = await db.query<Record<string, unknown>>(`
    SELECT run.id, run.node_key, run.run_no, run.status, run.media_kind, run.model_code,
           run.target_type, run.target_id, run.input_snapshot_json, run.output_snapshot_json,
           run.failure_json, run.task_id, run.created_at, run.updated_at,
           COALESCE(jsonb_agg(to_jsonb(artifact) ORDER BY artifact.created_at DESC)
             FILTER (WHERE artifact.id IS NOT NULL), '[]'::jsonb) AS artifacts
    FROM creator_canvas_node_runs run
    LEFT JOIN creator_canvas_node_artifacts artifact
      ON artifact.run_id = run.id AND artifact.deleted_at IS NULL
    WHERE ${where.join(" AND ")}
    GROUP BY run.id
    ORDER BY run.created_at DESC, run.id DESC
    LIMIT $${params.length}
  `, params);
  const hasNext = rows.rows.length > limit;
  const page = rows.rows.slice(0, limit).map(serializeHistoryRow);
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: hasNext && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function softDeleteCanvasGenerationRun(
  db: SqlDatabase,
  input: { canvasProjectId: string; runId: string; actorScope: CanvasActorScope; now: Date },
) {
  if (input.actorScope.canvasId !== input.canvasProjectId || !input.actorScope.capabilities.includes(capabilities.canvasEdit)) {
    throw new CanvasGenerationHistoryError("canvas_history_delete_forbidden");
  }
  const row = await queryOne<{ id: string }>(db, `
    UPDATE creator_canvas_node_runs
    SET deleted_at=$3, updated_at=$3
    WHERE id=$1 AND canvas_project_id=$2 AND deleted_at IS NULL
    RETURNING id
  `, [input.runId, input.canvasProjectId, input.now]);
  if (!row) throw new CanvasGenerationHistoryError("canvas_history_run_not_found");
  await db.query(`
    UPDATE creator_canvas_node_artifacts
    SET deleted_at=$2, updated_at=$2
    WHERE run_id=$1 AND deleted_at IS NULL
  `, [input.runId, input.now]);
  return { id: row.id, deleted: true };
}

export async function softDeleteCanvasGenerationRuns(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    actorScope: CanvasActorScope;
    nodeKey?: string | null;
    now: Date;
  },
) {
  if (input.actorScope.canvasId !== input.canvasProjectId || !input.actorScope.capabilities.includes(capabilities.canvasEdit)) {
    throw new CanvasGenerationHistoryError("canvas_history_delete_forbidden");
  }
  const nodeKey = input.nodeKey?.trim() || null;
  const row = await queryOne<{ deleted_count: number | string }>(db, `
    WITH deleted_runs AS (
      UPDATE creator_canvas_node_runs
      SET deleted_at=$3, updated_at=$3
      WHERE canvas_project_id=$1
        AND deleted_at IS NULL
        AND ($2::text IS NULL OR node_key=$2)
      RETURNING id
    ), deleted_artifacts AS (
      UPDATE creator_canvas_node_artifacts
      SET deleted_at=$3, updated_at=$3
      WHERE run_id IN (SELECT id FROM deleted_runs)
        AND deleted_at IS NULL
      RETURNING id
    )
    SELECT COUNT(*)::int AS deleted_count FROM deleted_runs
  `, [input.canvasProjectId, nodeKey, input.now]);
  return {
    scope: nodeKey ? "node" as const : "all" as const,
    nodeKey,
    deletedCount: Number(row?.deleted_count ?? 0),
  };
}

export async function exportCanvasGenerationHistoryJson(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    actorScope: CanvasActorScope;
    nodeKey?: string | null;
    search?: string | null;
    now?: Date;
  },
) {
  let cursor: CanvasGenerationHistoryCursor | null = null;
  const items: unknown[] = [];
  do {
    const page = await listCanvasGenerationHistory(db, { ...input, cursor, limit: 200 });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return {
    version: 1,
    canvasProjectId: input.canvasProjectId,
    exportedAt: (input.now ?? new Date()).toISOString(),
    items,
  };
}

export async function hydrateCanvasGenerationHistoryArtifactUrls<T extends {
  items: Array<Record<string, unknown>>;
}>(
  history: T,
  signStorageObject: (storageObjectId: string) => Promise<{
    previewUrl?: string | null;
    sourceUrl?: string | null;
    downloadUrl?: string | null;
    expiresAt?: Date | string | null;
  }>,
): Promise<T> {
  type SignedUrls = Awaited<ReturnType<typeof signStorageObject>>;
  const signed = new Map<string, Promise<SignedUrls | null>>();
  const items = await Promise.all(history.items.map(async (item) => {
    const artifacts = Array.isArray(item.artifacts) ? item.artifacts : [];
    const hydratedArtifacts = await Promise.all(artifacts.map(async (value) => {
      const artifact = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
      const storageObjectId = String(artifact.storageObjectId ?? artifact.storage_object_id ?? "").trim();
      if (!storageObjectId) return artifact;
      let pending = signed.get(storageObjectId);
      if (!pending) {
        pending = signStorageObject(storageObjectId).catch(() => null);
        signed.set(storageObjectId, pending);
      }
      const urls = await pending;
      if (!urls) {
        const {
          url: _url,
          thumbnail_url: _thumbnailUrl,
          thumbnailUrl: _thumbnailUrlCamel,
          downloadUrl: _downloadUrl,
          ...safeArtifact
        } = artifact;
        return safeArtifact;
      }
      const previewUrl = String(urls.previewUrl ?? urls.sourceUrl ?? "").trim();
      const sourceUrl = String(urls.sourceUrl ?? urls.previewUrl ?? "").trim();
      return {
        ...artifact,
        ...(previewUrl ? { thumbnail_url: previewUrl, thumbnailUrl: previewUrl } : {}),
        ...(sourceUrl ? { url: sourceUrl } : {}),
        ...(urls.downloadUrl ? { downloadUrl: urls.downloadUrl } : {}),
        ...(urls.expiresAt ? { signedUrlExpiresAt: new Date(urls.expiresAt).toISOString() } : {}),
      };
    }));
    return { ...item, artifacts: hydratedArtifacts };
  }));
  return { ...history, items };
}

function assertView(canvasProjectId: string, scope: CanvasActorScope) {
  if (scope.canvasId !== canvasProjectId || !scope.capabilities.includes(capabilities.canvasView)) {
    throw new CanvasGenerationHistoryError("canvas_history_forbidden");
  }
}

function serializeHistoryRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    nodeKey: String(row.node_key ?? ""),
    runNo: Number(row.run_no ?? 0),
    status: String(row.status ?? ""),
    mediaKind: String(row.media_kind ?? ""),
    modelCode: row.model_code ?? null,
    targetType: row.target_type ?? null,
    targetId: row.target_id ?? null,
    inputSnapshot: parseJson(row.input_snapshot_json),
    outputSnapshot: parseJson(row.output_snapshot_json),
    failure: parseJson(row.failure_json),
    taskId: row.task_id ?? null,
    artifacts: parseJson(row.artifacts) ?? [],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return {}; }
}
