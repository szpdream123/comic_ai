import { randomUUID } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { appendCanvasNodeArtifact, selectCanvasNodeArtifact } from "./creator-canvas-record.service.ts";

const derivationTypes = new Set([
  "crop", "outpaint", "slice", "composite", "remove_background", "free_view", "camera_studio", "screenshot",
]);

export interface CanvasSourceBinding {
  assetId: string | null;
  assetVersionId: string | null;
  storageObjectId: string | null;
}

export class CanvasMediaDerivationError extends Error {
  constructor(readonly code: string, message = code) { super(message); }
}

export async function startCanvasMediaDerivation(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    nodeKey: string;
    derivationType: string;
    baseCanvasRevision: number;
    source: CanvasSourceBinding;
    requestSnapshot?: Record<string, unknown>;
    taskId?: string | null;
    actorScope: CanvasActorScope;
    now: Date;
  },
) {
  assertRunScope(input.canvasProjectId, input.actorScope);
  if (!derivationTypes.has(input.derivationType)) throw new CanvasMediaDerivationError("canvas_derivation_type_invalid");
  if (!Number.isInteger(input.baseCanvasRevision) || input.baseCanvasRevision < 1) {
    throw new CanvasMediaDerivationError("canvas_derivation_revision_invalid");
  }
  const canvas = await currentCanvas(db, input.canvasProjectId);
  if (!canvas || canvas.server_revision !== input.baseCanvasRevision) {
    throw new CanvasMediaDerivationError("canvas_derivation_revision_stale");
  }
  const node = findCanvasNode(canvas.document_json, input.nodeKey);
  if (!node) throw new CanvasMediaDerivationError("canvas_derivation_node_not_found");
  const currentSource = sourceBindingFromNode(node);
  if (!sameBinding(currentSource, input.source)) {
    throw new CanvasMediaDerivationError("canvas_derivation_source_mismatch");
  }
  const row = await queryOne<{ id: string }>(db, `
    INSERT INTO creator_canvas_media_derivations (
      id, canvas_project_id, node_key, derivation_type, status, base_canvas_revision,
      source_asset_id, source_asset_version_id, source_storage_object_id,
      source_binding_json, request_snapshot_json, task_id, created_by_user_id,
      actor_team_member_id, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,'queued',$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$14)
    RETURNING id
  `, [
    randomUUID(), input.canvasProjectId, input.nodeKey, input.derivationType, input.baseCanvasRevision,
    input.source.assetId, input.source.assetVersionId, input.source.storageObjectId,
    JSON.stringify(input.source), JSON.stringify(input.requestSnapshot ?? {}), input.taskId ?? null,
    input.actorScope.ownerUserId, input.actorScope.actorTeamMemberId, input.now,
  ]);
  return { id: row!.id, status: "queued", baseCanvasRevision: input.baseCanvasRevision, source: input.source };
}

export async function attachCanvasMediaDerivationTask(
  db: SqlDatabase,
  input: { derivationId: string; canvasProjectId: string; taskId: string; now: Date },
) {
  const row = await queryOne<{ id: string }>(db, `
    UPDATE creator_canvas_media_derivations
    SET task_id=$2, status='running', updated_at=$3
    WHERE id=$1 AND canvas_project_id=$4 AND status='queued' RETURNING id
  `, [input.derivationId, input.taskId, input.now, input.canvasProjectId]);
  if (!row) throw new CanvasMediaDerivationError("canvas_derivation_not_found");
  return { id: row.id, taskId: input.taskId, status: "running" };
}

export async function completeCanvasMediaDerivation(
  db: SqlDatabase,
  input: {
    derivationId: string;
    artifact: {
      artifactKind: string;
      assetId?: string | null;
      assetVersionId?: string | null;
      storageObjectId?: string | null;
      url?: string | null;
      thumbnailUrl?: string | null;
      metadata?: Record<string, unknown>;
    };
    now: Date;
  },
) {
  const derivation = await queryOne<{
    id: string; canvas_project_id: string; node_key: string; status: string;
    base_canvas_revision: number; source_binding_json: Record<string, unknown> | string;
    task_id: string | null; created_by_user_id: string;
  }>(db, `SELECT * FROM creator_canvas_media_derivations WHERE id=$1 LIMIT 1`, [input.derivationId]);
  if (!derivation) throw new CanvasMediaDerivationError("canvas_derivation_not_found");
  if (["succeeded", "detached", "failed", "canceled"].includes(derivation.status)) {
    return { id: derivation.id, status: derivation.status, artifactId: null };
  }
  const canvas = await currentCanvas(db, derivation.canvas_project_id);
  const source = readJson(derivation.source_binding_json) as CanvasSourceBinding;
  const currentSource = sourceBindingFromNode(findCanvasNode(canvas?.document_json, derivation.node_key));
  const attached = Boolean(canvas && canvas.server_revision === Number(derivation.base_canvas_revision) && sameBinding(source, currentSource));
  const artifact = await appendCanvasNodeArtifact(db, {
    canvasProjectId: derivation.canvas_project_id,
    nodeKey: derivation.node_key,
    artifactKind: input.artifact.artifactKind,
    assetId: input.artifact.assetId ?? null,
    assetVersionId: input.artifact.assetVersionId ?? null,
    storageObjectId: input.artifact.storageObjectId ?? null,
    url: input.artifact.url ?? null,
    thumbnailUrl: input.artifact.thumbnailUrl ?? null,
    selected: attached,
    selectionRole: "current",
    metadata: {
      ...(input.artifact.metadata ?? {}),
      derivationId: derivation.id,
      attached,
      detached: !attached,
      detachedReason: attached ? null : "canvas_revision_or_source_changed",
    },
    userId: derivation.created_by_user_id,
    now: input.now,
  });
  const status = attached ? "succeeded" : "detached";
  await db.query(`
    UPDATE creator_canvas_media_derivations
    SET status=$2, output_artifact_id=$3, detached_reason=$4, completed_at=$5, updated_at=$5
    WHERE id=$1
  `, [derivation.id, status, artifact.id, attached ? null : "canvas_revision_or_source_changed", input.now]);
  return { id: derivation.id, status, artifactId: artifact.id, attached };
}

export async function failCanvasMediaDerivation(
  db: SqlDatabase,
  input: { derivationId: string; failure: Record<string, unknown>; now: Date },
) {
  const row = await queryOne<{ id: string }>(db, `
    UPDATE creator_canvas_media_derivations
    SET status='failed', detached_reason=$2, completed_at=$3, updated_at=$3
    WHERE id=$1 AND status NOT IN ('succeeded','detached','failed','canceled') RETURNING id
  `, [input.derivationId, JSON.stringify(input.failure), input.now]);
  if (!row) throw new CanvasMediaDerivationError("canvas_derivation_not_found");
  return { id: row.id, status: "failed" };
}

export async function reconcileCanvasMediaDerivations(
  db: SqlDatabase,
  input: {
    now: Date;
    limit?: number;
    resolveArtifact(taskId: string): Promise<{
      mediaType: "image" | "video" | "audio";
      storageObjectId: string;
      sourceUrl?: string | null;
    } | null>;
  },
) {
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)));
  const rows = await db.query<{
    id: string;
    task_id: string;
    task_status: string;
    failure_code: string | null;
  }>(`
    SELECT derivation.id, derivation.task_id, task.status AS task_status, task.failure_code
    FROM creator_canvas_media_derivations derivation
    JOIN tasks task ON task.id=derivation.task_id
    WHERE derivation.status IN ('queued','running')
      AND task.status IN ('succeeded','failed','canceled','result_unknown','manual_review_required')
    ORDER BY derivation.updated_at ASC, derivation.id ASC
    LIMIT $1
  `, [limit]);
  const completedDerivationIds: string[] = [];
  const failedDerivationIds: string[] = [];
  const canceledDerivationIds: string[] = [];
  const waitingDerivationIds: string[] = [];
  for (const row of rows.rows) {
    if (row.task_status === "succeeded") {
      const artifact = await input.resolveArtifact(row.task_id);
      if (!artifact) {
        waitingDerivationIds.push(row.id);
        continue;
      }
      await completeCanvasMediaDerivation(db, {
        derivationId: row.id,
        artifact: {
          artifactKind: artifact.mediaType,
          storageObjectId: artifact.storageObjectId,
          url: artifact.sourceUrl ?? null,
        },
        now: input.now,
      });
      completedDerivationIds.push(row.id);
      continue;
    }
    if (row.task_status === "failed") {
      await failCanvasMediaDerivation(db, {
        derivationId: row.id,
        failure: { failureCode: row.failure_code ?? "generation_task_failed" },
        now: input.now,
      });
      failedDerivationIds.push(row.id);
      continue;
    }
    if (row.task_status === "canceled") {
      await db.query(`
        UPDATE creator_canvas_media_derivations
        SET status='canceled', completed_at=$2, updated_at=$2
        WHERE id=$1 AND status IN ('queued','running')
      `, [row.id, input.now]);
      canceledDerivationIds.push(row.id);
      continue;
    }
    waitingDerivationIds.push(row.id);
  }
  return {
    completedDerivationIds,
    failedDerivationIds,
    canceledDerivationIds,
    waitingDerivationIds,
  };
}

export async function createCanvasImageBatchGroup(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    nodeKey: string;
    sourceRunId?: string | null;
    artifacts: Array<{ artifactId: string; parameters?: Record<string, unknown> }>;
    actorScope: CanvasActorScope;
    now: Date;
  },
) {
  assertEditScope(input.canvasProjectId, input.actorScope);
  if (!input.artifacts.length || input.artifacts.length > 100) throw new CanvasMediaDerivationError("canvas_image_batch_empty");
  const groupId = randomUUID();
  await db.query("BEGIN");
  try {
    for (const artifact of input.artifacts) {
      const valid = await queryOne<{ id: string }>(db, `
        SELECT id FROM creator_canvas_node_artifacts
        WHERE id=$1 AND canvas_project_id=$2 AND node_key=$3 AND artifact_kind='image' AND deleted_at IS NULL
      `, [artifact.artifactId, input.canvasProjectId, input.nodeKey]);
      if (!valid) throw new CanvasMediaDerivationError("canvas_image_batch_artifact_invalid");
    }
    await db.query(`
      INSERT INTO creator_canvas_image_batch_groups
        (id,canvas_project_id,node_key,source_run_id,status,created_by_user_id,actor_team_member_id,created_at,updated_at)
      VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$7)
    `, [groupId, input.canvasProjectId, input.nodeKey, input.sourceRunId ?? null, input.actorScope.ownerUserId, input.actorScope.actorTeamMemberId, input.now]);
    for (const [index, artifact] of input.artifacts.entries()) {
      await db.query(`
        INSERT INTO creator_canvas_image_batch_items
          (id,group_id,artifact_id,batch_index,parameters_json,created_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6)
      `, [randomUUID(), groupId, artifact.artifactId, index, JSON.stringify(artifact.parameters ?? {}), input.now]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return getCanvasImageBatchGroup(db, groupId, input.canvasProjectId);
}

export async function selectCanvasImageBatchArtifact(
  db: SqlDatabase,
  input: { groupId: string; artifactId: string; actorScope: CanvasActorScope; now: Date },
) {
  const group = await queryOne<{ canvas_project_id: string; node_key: string }>(db, `
    SELECT canvas_project_id,node_key FROM creator_canvas_image_batch_groups WHERE id=$1 AND status <> 'canceled'
  `, [input.groupId]);
  if (!group) throw new CanvasMediaDerivationError("canvas_image_batch_not_found");
  assertEditScope(group.canvas_project_id, input.actorScope);
  const member = await queryOne<{ artifact_id: string }>(db, `
    SELECT artifact_id FROM creator_canvas_image_batch_items WHERE group_id=$1 AND artifact_id=$2
  `, [input.groupId, input.artifactId]);
  if (!member) throw new CanvasMediaDerivationError("canvas_image_batch_artifact_invalid");
  await selectCanvasNodeArtifact(db, {
    canvasProjectId: group.canvas_project_id,
    artifactId: input.artifactId,
    selectionRole: "current",
    actorScope: input.actorScope,
    now: input.now,
  });
  await db.query(`UPDATE creator_canvas_image_batch_groups SET selected_artifact_id=$2, updated_at=$3 WHERE id=$1`, [input.groupId, input.artifactId, input.now]);
  return { groupId: input.groupId, selectedArtifactId: input.artifactId };
}

export async function getCanvasImageBatchGroup(db: SqlDatabase, groupId: string, canvasProjectId: string) {
  const group = await queryOne<Record<string, unknown>>(db, `SELECT * FROM creator_canvas_image_batch_groups WHERE id=$1 AND canvas_project_id=$2`, [groupId, canvasProjectId]);
  if (!group) throw new CanvasMediaDerivationError("canvas_image_batch_not_found");
  const items = await db.query<Record<string, unknown>>(`SELECT * FROM creator_canvas_image_batch_items WHERE group_id=$1 ORDER BY batch_index ASC`, [groupId]);
  return {
    id: String(group.id), canvasProjectId: String(group.canvas_project_id), nodeKey: String(group.node_key),
    sourceRunId: group.source_run_id ?? null, status: String(group.status), selectedArtifactId: group.selected_artifact_id ?? null,
    items: items.rows.map((item) => ({ id: String(item.id), artifactId: String(item.artifact_id), batchIndex: Number(item.batch_index), parameters: readJson(item.parameters_json) })),
  };
}

export async function createCanvasAnnotationLayer(
  db: SqlDatabase,
  input: {
    canvasProjectId: string; nodeKey: string; layerKind: "mask" | "raster_annotation" | "vector_annotation";
    sourceAssetId?: string | null; sourceAssetVersionId?: string | null;
    layerAssetId?: string | null; layerAssetVersionId?: string | null; layerStorageObjectId?: string | null;
    projectionPolicy?: "retain" | "reproject" | "discard"; metadata?: Record<string, unknown>;
    actorScope: CanvasActorScope; now: Date;
  },
) {
  assertEditScope(input.canvasProjectId, input.actorScope);
  if (!input.layerAssetVersionId && !input.layerStorageObjectId) throw new CanvasMediaDerivationError("canvas_annotation_reference_required");
  if (containsInlineData(input.metadata)) throw new CanvasMediaDerivationError("canvas_annotation_inline_data_forbidden");
  const row = await queryOne<{ id: string }>(db, `
    INSERT INTO creator_canvas_annotation_layers (
      id,canvas_project_id,node_key,layer_kind,status,source_asset_id,source_asset_version_id,
      layer_asset_id,layer_asset_version_id,layer_storage_object_id,projection_policy,metadata_json,
      created_by_user_id,actor_team_member_id,created_at,updated_at
    ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$14)
    RETURNING id
  `, [
    randomUUID(), input.canvasProjectId, input.nodeKey, input.layerKind, input.sourceAssetId ?? null, input.sourceAssetVersionId ?? null,
    input.layerAssetId ?? null, input.layerAssetVersionId ?? null, input.layerStorageObjectId ?? null,
    input.projectionPolicy ?? "retain", JSON.stringify(input.metadata ?? {}), input.actorScope.ownerUserId, input.actorScope.actorTeamMemberId, input.now,
  ]);
  return { id: row!.id, status: "active" };
}

export async function listCanvasAnnotationLayers(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    nodeKey: string;
    actorScope: CanvasActorScope;
    includeInactive?: boolean;
    limit?: number;
  },
) {
  assertViewScope(input.canvasProjectId, input.actorScope);
  const nodeKey = input.nodeKey.trim();
  if (!nodeKey) throw new CanvasMediaDerivationError("canvas_annotation_node_required");
  const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 100)));
  const result = await db.query<{
    id: string;
    node_key: string;
    layer_kind: "mask" | "raster_annotation" | "vector_annotation";
    status: string;
    source_asset_id: string | null;
    source_asset_version_id: string | null;
    layer_asset_id: string | null;
    layer_asset_version_id: string | null;
    layer_storage_object_id: string | null;
    projection_policy: string;
    metadata_json: Record<string, unknown> | string;
    created_at: Date | string;
    updated_at: Date | string;
  }>(`
    SELECT id,node_key,layer_kind,status,source_asset_id,source_asset_version_id,
           layer_asset_id,layer_asset_version_id,layer_storage_object_id,
           projection_policy,metadata_json,created_at,updated_at
    FROM creator_canvas_annotation_layers
    WHERE canvas_project_id=$1 AND node_key=$2
      AND ($3::boolean OR status IN ('active','reprojected'))
    ORDER BY created_at DESC,id DESC
    LIMIT $4
  `, [input.canvasProjectId, nodeKey, input.includeInactive === true, limit]);
  return result.rows.map((row) => ({
    id: row.id,
    nodeKey: row.node_key,
    layerKind: row.layer_kind,
    status: row.status,
    sourceAssetId: row.source_asset_id,
    sourceAssetVersionId: row.source_asset_version_id,
    layerAssetId: row.layer_asset_id,
    layerAssetVersionId: row.layer_asset_version_id,
    layerStorageObjectId: row.layer_storage_object_id,
    projectionPolicy: row.projection_policy,
    metadata: readJson(row.metadata_json),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export async function applyCanvasAnnotationSourceReplacement(
  db: SqlDatabase,
  input: { canvasProjectId: string; nodeKey: string; sourceAssetId?: string | null; sourceAssetVersionId?: string | null; now: Date },
) {
  const rows = await db.query<{ id: string; projection_policy: string }>(`
    SELECT id,projection_policy FROM creator_canvas_annotation_layers
    WHERE canvas_project_id=$1 AND node_key=$2 AND status='active'
  `, [input.canvasProjectId, input.nodeKey]);
  for (const row of rows.rows) {
    if (row.projection_policy === "reproject") {
      await db.query(`UPDATE creator_canvas_annotation_layers SET source_asset_id=$2, source_asset_version_id=$3, status='reprojected', updated_at=$4 WHERE id=$1`, [row.id, input.sourceAssetId ?? null, input.sourceAssetVersionId ?? null, input.now]);
    } else if (row.projection_policy === "discard") {
      await db.query(`UPDATE creator_canvas_annotation_layers SET status='discarded', updated_at=$2 WHERE id=$1`, [row.id, input.now]);
    }
  }
  return { affected: rows.rows.length };
}

export async function startCanvasCardSnapshot(
  db: SqlDatabase,
  input: { canvasProjectId: string; canvasRevision: number; userId: string; now: Date },
) {
  if (!Number.isInteger(input.canvasRevision) || input.canvasRevision < 1) throw new CanvasMediaDerivationError("canvas_card_revision_invalid");
  const row = await queryOne<{ id: string }>(db, `
    INSERT INTO creator_canvas_card_snapshots (id,canvas_project_id,canvas_revision,status,created_by_user_id,created_at)
    VALUES ($1,$2,$3,'pending',$4,$5)
    ON CONFLICT (canvas_project_id,canvas_revision) DO UPDATE SET status='pending', error_json='{}'::jsonb
    RETURNING id
  `, [randomUUID(), input.canvasProjectId, input.canvasRevision, input.userId, input.now]);
  return { id: row!.id, status: "pending", canvasRevision: input.canvasRevision };
}

export async function completeCanvasCardSnapshot(
  db: SqlDatabase,
  input: { snapshotId: string; storageObjectId: string; width?: number | null; height?: number | null; now: Date },
) {
  const row = await queryOne<{ id: string }>(db, `
    UPDATE creator_canvas_card_snapshots
    SET status='ready', storage_object_id=$2, width=$3, height=$4, error_json='{}'::jsonb, completed_at=$5
    WHERE id=$1 RETURNING id
  `, [input.snapshotId, input.storageObjectId, input.width ?? null, input.height ?? null, input.now]);
  if (!row) throw new CanvasMediaDerivationError("canvas_card_snapshot_not_found");
  return { id: row.id, status: "ready" };
}

export async function failCanvasCardSnapshot(db: SqlDatabase, input: { snapshotId: string; error: Record<string, unknown>; now: Date }) {
  const row = await queryOne<{ id: string }>(db, `
    UPDATE creator_canvas_card_snapshots SET status='failed', error_json=$2::jsonb, completed_at=$3 WHERE id=$1 RETURNING id
  `, [input.snapshotId, JSON.stringify(input.error), input.now]);
  if (!row) throw new CanvasMediaDerivationError("canvas_card_snapshot_not_found");
  return { id: row.id, status: "failed" };
}

export async function getLatestCanvasCardSnapshot(db: SqlDatabase, input: { canvasProjectId: string; canvasRevision?: number }) {
  const row = await queryOne<Record<string, unknown>>(db, `
    SELECT * FROM creator_canvas_card_snapshots
    WHERE canvas_project_id=$1 AND ($2::int IS NULL OR canvas_revision <= $2)
    ORDER BY canvas_revision DESC, created_at DESC LIMIT 1
  `, [input.canvasProjectId, input.canvasRevision ?? null]);
  return row ? {
    id: String(row.id), canvasProjectId: String(row.canvas_project_id), canvasRevision: Number(row.canvas_revision),
    status: String(row.status), storageObjectId: row.storage_object_id ?? null, width: row.width ?? null,
    height: row.height ?? null, error: readJson(row.error_json),
  } : null;
}

function assertRunScope(canvasProjectId: string, scope: CanvasActorScope) {
  if (scope.canvasId !== canvasProjectId || !scope.capabilities.includes(capabilities.canvasRun)) throw new CanvasMediaDerivationError("canvas_derivation_forbidden");
}
function assertEditScope(canvasProjectId: string, scope: CanvasActorScope) {
  if (scope.canvasId !== canvasProjectId || !scope.capabilities.includes(capabilities.canvasEdit)) throw new CanvasMediaDerivationError("canvas_media_edit_forbidden");
}
function assertViewScope(canvasProjectId: string, scope: CanvasActorScope) {
  if (scope.canvasId !== canvasProjectId || !scope.capabilities.includes(capabilities.canvasView)) throw new CanvasMediaDerivationError("canvas_media_view_forbidden");
}
async function currentCanvas(db: SqlDatabase, canvasProjectId: string) {
  return queryOne<{ server_revision: number; document_json: Record<string, unknown> }>(db, `
    SELECT canvas.server_revision, document.document_json
    FROM creator_canvas_projects canvas
    LEFT JOIN creator_canvas_documents document ON document.id=canvas.latest_document_id
    WHERE canvas.id=$1 AND canvas.deleted_at IS NULL LIMIT 1
  `, [canvasProjectId]);
}
function findCanvasNode(document: Record<string, unknown> | undefined, nodeKey: string) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  return nodes.find((node) => node && typeof node === "object" && (node as Record<string, unknown>).id === nodeKey) as Record<string, unknown> | undefined;
}
function sourceBindingFromNode(node: Record<string, unknown> | undefined): CanvasSourceBinding {
  const data = node?.data && typeof node.data === "object" ? node.data as Record<string, unknown> : {};
  return {
    assetId: stringOrNull(data.assetId ?? data.sourceAssetId),
    assetVersionId: stringOrNull(data.assetVersionId ?? data.sourceAssetVersionId),
    storageObjectId: stringOrNull(data.storageObjectId ?? data.sourceStorageObjectId ?? data.resultStorageObjectId),
  };
}
function sameBinding(left: CanvasSourceBinding, right: CanvasSourceBinding) {
  return left.assetId === right.assetId && left.assetVersionId === right.assetVersionId && left.storageObjectId === right.storageObjectId;
}
function stringOrNull(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function readJson(value: unknown): unknown {
  if (typeof value !== "string") return value ?? {};
  try { return JSON.parse(value); } catch { return {}; }
}
function containsInlineData(value: unknown): boolean {
  if (typeof value === "string") return /^data:/i.test(value.trim()) || value.length > 1_000_000;
  if (Array.isArray(value)) return value.some(containsInlineData);
  if (value && typeof value === "object") return Object.values(value).some(containsInlineData);
  return false;
}
