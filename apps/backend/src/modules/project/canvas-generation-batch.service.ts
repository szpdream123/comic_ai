import { createHash, randomUUID } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../identity/canvas-actor-scope.service.ts";
import { runWithDatabaseContext } from "../shared/db/dev-db.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  reserveCreditsInTransaction,
  settleReservationAllocation,
} from "../credit-billing/credit-ledger.service.ts";
import { CANVAS_PRODUCT_LIMITS } from "./canvas-product-limits.ts";

export type CanvasGenerationBatchStatus =
  | "created" | "running" | "cancel_requested"
  | "succeeded" | "partial" | "failed" | "canceled";
export type CanvasGenerationBatchItemStatus =
  | "pending" | "dispatching" | "queued" | "running" | "cancel_requested"
  | "succeeded" | "failed" | "canceled" | "skipped";

export interface CanvasGenerationDagNode {
  nodeKey: string;
  mediaKind: "text" | "image" | "video" | "audio";
  dependsOn?: string[];
  payload?: Record<string, unknown>;
}

export interface CanvasGenerationDagPlan {
  nodes: Array<Required<Pick<CanvasGenerationDagNode, "nodeKey" | "mediaKind">> & {
    dependsOn: string[];
    payload: Record<string, unknown>;
  }>;
  levels: string[][];
}

export interface CanvasGenerationDispatchResult {
  status?: "queued" | "succeeded";
  taskId?: string | null;
  runId?: string | null;
  creditReservationId?: string | null;
  creditAllocationId?: string | null;
}

export type CanvasGenerationBatchBilling =
  | { mode: "per_item" }
  | { mode: "batch_reservation"; reservationId: string; allocationKey: string; estimatedCredits: number };

interface BatchRow {
  id: string;
  canvas_project_id: string;
  owner_user_id: string;
  actor_team_member_id: string | null;
  principal_key: string;
  idempotency_key: string;
  request_hash: string;
  billing_mode: "per_item" | "batch_reservation";
  credit_reservation_id: string | null;
  estimated_credits: number | string;
  settled_credits: number | string;
  status: CanvasGenerationBatchStatus;
  total_items: number | string;
  succeeded_items: number | string;
  failed_items: number | string;
  canceled_items: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

export interface CanvasGenerationBatchMaintenanceTarget {
  batchId: string;
  canvasProjectId: string;
  ownerUserId: string;
  actorTeamMemberId: string | null;
  principalKey: string;
}

interface ItemRow {
  id: string;
  batch_id: string;
  node_key: string;
  media_kind: "text" | "image" | "video" | "audio";
  sort_order: number | string;
  status: CanvasGenerationBatchItemStatus;
  depends_on_json: string[] | string;
  payload_json: Record<string, unknown> | string;
  task_id: string | null;
  run_id: string | null;
  credit_reservation_id: string | null;
  credit_allocation_id: string | null;
  billing_allocation_key: string | null;
  estimated_credits: number | string;
  failure_json: Record<string, unknown> | string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface StableDependencyArtifactRow {
  node_key: string;
  asset_version_id: string;
}

export class CanvasGenerationBatchError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
  }
}

export function planCanvasGenerationDag(nodes: CanvasGenerationDagNode[]): CanvasGenerationDagPlan {
  if (!Array.isArray(nodes) || nodes.length === 0 || nodes.length > CANVAS_PRODUCT_LIMITS.generation.maximumBatchNodes) {
    throw new CanvasGenerationBatchError("canvas_batch_node_count_invalid");
  }
  const normalized = nodes.map((node) => ({
    nodeKey: String(node.nodeKey ?? "").trim(),
    mediaKind: node.mediaKind,
    dependsOn: [...new Set((node.dependsOn ?? []).map((value) => String(value).trim()).filter(Boolean))],
    payload: readRecord(node.payload),
  }));
  const ids = new Set<string>();
  for (const node of normalized) {
    if (!node.nodeKey || node.nodeKey.length > 160 || ids.has(node.nodeKey)) {
      throw new CanvasGenerationBatchError("canvas_batch_node_key_invalid");
    }
    if (!(["text", "image", "video", "audio"] as string[]).includes(node.mediaKind)) {
      throw new CanvasGenerationBatchError("canvas_batch_media_kind_invalid");
    }
    ids.add(node.nodeKey);
  }
  for (const node of normalized) {
    if (node.dependsOn.includes(node.nodeKey) || node.dependsOn.some((dependency) => !ids.has(dependency))) {
      throw new CanvasGenerationBatchError("canvas_batch_dependency_invalid");
    }
  }

  const remaining = new Map(normalized.map((node) => [node.nodeKey, new Set(node.dependsOn)]));
  const levels: string[][] = [];
  const completed = new Set<string>();
  while (remaining.size) {
    const level = normalized
      .filter((node) => remaining.has(node.nodeKey))
      .filter((node) => [...remaining.get(node.nodeKey)!].every((dependency) => completed.has(dependency)))
      .map((node) => node.nodeKey);
    if (!level.length) throw new CanvasGenerationBatchError("canvas_batch_cycle_detected");
    levels.push(level);
    level.forEach((nodeKey) => {
      remaining.delete(nodeKey);
      completed.add(nodeKey);
    });
  }
  return { nodes: normalized, levels };
}

export async function createCanvasGenerationBatch(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    actorScope: CanvasActorScope;
    idempotencyKey: string;
    nodes: CanvasGenerationDagNode[];
    now: Date;
    dispatchNode: CanvasGenerationDispatch;
    billing?: {
      mode: "batch_reservation";
      itemCredits: Record<string, number>;
    };
  },
) {
  assertCanvasRunScope(input.canvasProjectId, input.actorScope);
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new CanvasGenerationBatchError("canvas_batch_idempotency_key_invalid");
  }
  const plan = planCanvasGenerationDag(input.nodes);
  const requestHash = createHash("sha256").update(JSON.stringify(plan.nodes)).digest("hex");
  const existing = await queryOne<{ id: string; request_hash: string }>(db, `
    SELECT id, request_hash FROM creator_canvas_generation_batches
    WHERE canvas_project_id=$1 AND principal_key=$2 AND idempotency_key=$3
    LIMIT 1
  `, [input.canvasProjectId, input.actorScope.principalKey, idempotencyKey]);
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new CanvasGenerationBatchError("canvas_batch_idempotency_conflict");
    }
    return getCanvasGenerationBatch(db, existing.id, input.canvasProjectId);
  }

  const batchId = randomUUID();
  const batchBilling = normalizeBatchBilling(input.billing, plan.nodes.map((node) => node.nodeKey), input.actorScope);
  await db.query("BEGIN");
  try {
    const reservation = batchBilling
      ? await reserveCreditsInTransaction(db, {
          userId: input.actorScope.ownerUserId,
          canvasProjectId: input.canvasProjectId,
          amount: batchBilling.totalCredits,
          sourceType: "canvas_generation_batch",
          sourceId: batchId,
          reason: "Canvas generation batch",
          metadata: {
            batchId,
            principalKey: input.actorScope.principalKey,
            itemCredits: batchBilling.itemCredits,
          },
          createdByUserId: input.actorScope.ownerUserId,
          now: input.now,
        })
      : null;
    await db.query(`
      INSERT INTO creator_canvas_generation_batches (
        id, canvas_project_id, owner_user_id, actor_team_member_id, principal_key,
        idempotency_key, request_hash, status, total_items, billing_mode,
        credit_reservation_id, estimated_credits, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'created',$8,$9,$10,$11,$12,$12)
    `, [
      batchId, input.canvasProjectId, input.actorScope.ownerUserId,
      input.actorScope.actorTeamMemberId, input.actorScope.principalKey,
      idempotencyKey, requestHash, plan.nodes.length,
      batchBilling ? "batch_reservation" : "per_item",
      reservation?.reservation.id ?? null,
      batchBilling?.totalCredits ?? 0,
      input.now,
    ]);
    for (const [sortOrder, node] of plan.nodes.entries()) {
      await db.query(`
        INSERT INTO creator_canvas_generation_batch_items (
          id, batch_id, node_key, media_kind, sort_order, status, depends_on_json,
          payload_json, credit_reservation_id, billing_allocation_key,
          estimated_credits, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,'pending',$6::jsonb,$7::jsonb,$8,$9,$10,$11,$11)
      `, [
        randomUUID(), batchId, node.nodeKey, node.mediaKind, sortOrder,
        JSON.stringify(node.dependsOn), JSON.stringify(node.payload),
        reservation?.reservation.id ?? null,
        batchBilling ? `canvas-batch-item:${batchId}:${node.nodeKey}` : null,
        batchBilling?.itemCredits[node.nodeKey] ?? 0,
        input.now,
      ]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return dispatchReadyCanvasGenerationBatchItems(db, {
    batchId,
    canvasProjectId: input.canvasProjectId,
    dispatchNode: input.dispatchNode,
    now: input.now,
  });
}

export type CanvasGenerationDispatch = ((input: {
  batchId: string;
  itemId: string;
  nodeKey: string;
  mediaKind: "text" | "image" | "video" | "audio";
  payload: Record<string, unknown>;
  idempotencyKey: string;
  billing: CanvasGenerationBatchBilling;
}) => Promise<CanvasGenerationDispatchResult>) & {
  supportedBillingModes?: ReadonlyArray<CanvasGenerationBatchBilling["mode"]>;
};

export function assertCanvasGenerationPerItemBilling(billing: CanvasGenerationBatchBilling) {
  if (billing.mode !== "per_item") {
    throw new CanvasGenerationBatchError("canvas_batch_billing_mode_unsupported");
  }
}

export async function reconcileCanvasGenerationBatch(
  db: SqlDatabase,
  input: {
    batchId: string;
    canvasProjectId: string;
    dispatchNode: CanvasGenerationDispatch;
    now: Date;
  },
) {
  await requireBatch(db, input.batchId, input.canvasProjectId);
  await db.query(`
    UPDATE creator_canvas_generation_batch_items item
    SET status = CASE
          WHEN task.status = 'succeeded' THEN 'succeeded'
          WHEN task.status = 'failed' THEN 'failed'
          WHEN task.status = 'canceled' THEN 'canceled'
          WHEN task.status = 'cancel_requested' THEN 'cancel_requested'
          WHEN task.status IN ('running','result_unknown','manual_review_required') THEN 'running'
          ELSE item.status
        END,
        failure_json = CASE WHEN task.status = 'failed'
          THEN jsonb_build_object('failureCode', task.failure_code) ELSE item.failure_json END,
        completed_at = CASE WHEN task.status IN ('succeeded','failed','canceled') THEN $2 ELSE item.completed_at END,
        updated_at = $2
    FROM tasks task
    WHERE item.batch_id = $1 AND item.task_id = task.id
      AND item.status IN ('queued','running','cancel_requested')
  `, [input.batchId, input.now]);
  return dispatchReadyCanvasGenerationBatchItems(db, input);
}

export async function reconcileActiveCanvasGenerationBatches(
  db: SqlDatabase,
  input: {
    now: Date;
    limit?: number;
    staleDispatchMs?: number;
    createDispatch(target: CanvasGenerationBatchMaintenanceTarget): Promise<CanvasGenerationDispatch>;
  },
) {
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
  const staleBefore = new Date(input.now.getTime() - Math.max(30_000, input.staleDispatchMs ?? 120_000));
  await db.query(`
    UPDATE creator_canvas_generation_batch_items item
    SET status='pending', updated_at=$1
    FROM creator_canvas_generation_batches batch
    WHERE item.batch_id=batch.id
      AND batch.status IN ('created','running')
      AND item.status='dispatching'
      AND item.updated_at < $2
  `, [input.now, staleBefore]);
  const rows = await db.query<BatchRow>(`
    SELECT * FROM creator_canvas_generation_batches
    WHERE status IN ('created','running','cancel_requested')
    ORDER BY updated_at ASC, id ASC
    LIMIT $1
  `, [limit]);
  const reconciledBatchIds: string[] = [];
  const failedBatches: Array<{ batchId: string; failureCode: string }> = [];
  for (const batch of rows.rows) {
    try {
      const dispatchNode = await input.createDispatch({
        batchId: batch.id,
        canvasProjectId: batch.canvas_project_id,
        ownerUserId: batch.owner_user_id,
        actorTeamMemberId: batch.actor_team_member_id,
        principalKey: batch.principal_key,
      });
      await reconcileCanvasGenerationBatch(db, {
        batchId: batch.id,
        canvasProjectId: batch.canvas_project_id,
        dispatchNode,
        now: input.now,
      });
      reconciledBatchIds.push(batch.id);
    } catch (error) {
      failedBatches.push({ batchId: batch.id, failureCode: failureCode(error) });
    }
  }
  return { reconciledBatchIds, failedBatches };
}

export async function recordCanvasGenerationBatchItemOutcome(
  db: SqlDatabase,
  input: {
    batchId: string;
    nodeKey: string;
    status: "succeeded" | "failed" | "canceled";
    failure?: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query(`
    UPDATE creator_canvas_generation_batch_items
    SET status=$3, failure_json=$4::jsonb, completed_at=$5, updated_at=$5
    WHERE batch_id=$1 AND node_key=$2
  `, [input.batchId, input.nodeKey, input.status, JSON.stringify(input.failure ?? {}), input.now]);
  return refreshCanvasGenerationBatchStatus(db, input.batchId, input.now);
}

export async function cancelCanvasGenerationBatch(
  db: SqlDatabase,
  input: {
    batchId: string;
    canvasProjectId: string;
    actorScope: CanvasActorScope;
    cancelTask: (taskId: string) => Promise<unknown>;
    now: Date;
  },
) {
  assertCanvasRunScope(input.canvasProjectId, input.actorScope);
  const batch = await requireBatch(db, input.batchId, input.canvasProjectId);
  if (["succeeded", "partial", "failed", "canceled"].includes(batch.status)) {
    return getCanvasGenerationBatch(db, input.batchId, input.canvasProjectId);
  }
  await db.query(`
    UPDATE creator_canvas_generation_batches
    SET status='cancel_requested', canceled_at=$3, updated_at=$3
    WHERE id=$1 AND canvas_project_id=$2
  `, [input.batchId, input.canvasProjectId, input.now]);
  const pendingBillingItems = await db.query<ItemRow>(`
    SELECT * FROM creator_canvas_generation_batch_items
    WHERE batch_id=$1 AND status='pending'
  `, [input.batchId]);
  await db.query(`
    UPDATE creator_canvas_generation_batch_items
    SET status='canceled', completed_at=$2, updated_at=$2
    WHERE batch_id=$1 AND status IN ('pending','dispatching')
  `, [input.batchId, input.now]);
  for (const item of pendingBillingItems.rows) {
    await releaseUndispatchedBatchItemCredits(db, item, "batch_canceled", input.now);
  }
  const queued = await db.query<{ task_id: string }>(`
    UPDATE creator_canvas_generation_batch_items
    SET status='cancel_requested', updated_at=$2
    WHERE batch_id=$1 AND status IN ('queued','running') AND task_id IS NOT NULL
    RETURNING task_id
  `, [input.batchId, input.now]);
  await Promise.allSettled(queued.rows.map((row) => input.cancelTask(row.task_id)));
  await refreshCanvasGenerationBatchStatus(db, input.batchId, input.now);
  return getCanvasGenerationBatch(db, input.batchId, input.canvasProjectId);
}

export async function getCanvasGenerationBatch(db: SqlDatabase, batchId: string, canvasProjectId: string) {
  const batch = await requireBatch(db, batchId, canvasProjectId);
  const items = await db.query<ItemRow>(`
    SELECT * FROM creator_canvas_generation_batch_items
    WHERE batch_id=$1 ORDER BY sort_order ASC, id ASC
  `, [batchId]);
  return serializeBatch(batch, items.rows);
}

async function dispatchReadyCanvasGenerationBatchItems(
  db: SqlDatabase,
  input: {
    batchId: string;
    canvasProjectId: string;
    dispatchNode: CanvasGenerationDispatch;
    now: Date;
  },
) {
  const batch = await requireBatch(db, input.batchId, input.canvasProjectId);
  if (batch.status === "cancel_requested") {
    await refreshCanvasGenerationBatchStatus(db, input.batchId, input.now);
    return getCanvasGenerationBatch(db, input.batchId, input.canvasProjectId);
  }
  const billingMode = batch.billing_mode ?? "per_item";
  const supportedBillingModes = input.dispatchNode.supportedBillingModes ?? ["per_item"];
  if (!supportedBillingModes.includes(billingMode)) {
    throw new CanvasGenerationBatchError("canvas_batch_billing_mode_unsupported");
  }
  const all = await db.query<ItemRow>("SELECT * FROM creator_canvas_generation_batch_items WHERE batch_id=$1", [input.batchId]);
  const byNode = new Map(all.rows.map((item) => [item.node_key, item]));
  const blocked = all.rows.filter((item) => item.status === "pending" && dependencies(item).some((key) => {
    const status = byNode.get(key)?.status;
    return status === "failed" || status === "canceled" || status === "skipped";
  }));
  for (const item of blocked) {
    await db.query(`
      UPDATE creator_canvas_generation_batch_items
      SET status='skipped', failure_json='{"failureCode":"upstream_not_succeeded"}'::jsonb,
          completed_at=$2, updated_at=$2
      WHERE id=$1 AND status='pending'
    `, [item.id, input.now]);
    await releaseUndispatchedBatchItemCredits(db, item, "upstream_not_succeeded", input.now);
    item.status = "skipped";
  }
  const ready = all.rows.filter((item) => item.status === "pending" && dependencies(item).every((key) => byNode.get(key)?.status === "succeeded"));
  const claimed: ItemRow[] = [];
  for (const item of ready) {
    const hydrated = await hydrateSucceededPromptDependencies(db, {
      batchId: input.batchId,
      canvasProjectId: input.canvasProjectId,
      item,
      byNode,
    });
    if (!hydrated.ready) {
      await db.query(`
        UPDATE creator_canvas_generation_batch_items
        SET failure_json='{"failureCode":"upstream_artifact_not_ready"}'::jsonb, updated_at=$2
        WHERE id=$1 AND status='pending'
      `, [item.id, input.now]);
      continue;
    }
    const row = await queryOne<ItemRow>(db, `
      UPDATE creator_canvas_generation_batch_items
      SET status='dispatching', payload_json=$3::jsonb, failure_json='{}'::jsonb, updated_at=$2
      WHERE id=$1 AND status='pending' RETURNING *
    `, [item.id, input.now, JSON.stringify(hydrated.payload)]);
    if (row) claimed.push(row);
  }
  let completedSynchronously = false;
  await Promise.allSettled(claimed.map(async (item) => {
    try {
      const result = await runWithDatabaseContext(() => input.dispatchNode({
        batchId: input.batchId,
        itemId: item.id,
        nodeKey: item.node_key,
        mediaKind: item.media_kind,
        payload: readRecord(item.payload_json),
        idempotencyKey: `canvas-batch:${input.batchId}:${item.id}`,
        billing: billingMode === "batch_reservation" && batch.credit_reservation_id
          ? {
              mode: "batch_reservation",
              reservationId: batch.credit_reservation_id,
              allocationKey: item.billing_allocation_key ?? `canvas-batch-item:${item.id}`,
              estimatedCredits: Number(item.estimated_credits),
            }
          : { mode: "per_item" },
      }));
      const completed = result.status === "succeeded";
      if (!completed && !result.taskId) {
        throw new CanvasGenerationBatchError("canvas_batch_dispatch_task_missing");
      }
      await db.query(`
        UPDATE creator_canvas_generation_batch_items
        SET status=$2, task_id=$3, run_id=$4, credit_reservation_id=$5,
            credit_allocation_id=$6,
            completed_at=CASE WHEN $2='succeeded' THEN $7::timestamptz ELSE NULL END,
            updated_at=$7
        WHERE id=$1 AND status='dispatching'
      `, [
        item.id,
        completed ? "succeeded" : "queued",
        result.taskId ?? null,
        result.runId ?? null,
        result.creditReservationId ?? null,
        result.creditAllocationId ?? null,
        input.now,
      ]);
      if (completed) completedSynchronously = true;
    } catch (error) {
      const persisted = await queryOne<ItemRow>(db, "SELECT * FROM creator_canvas_generation_batch_items WHERE id=$1", [item.id]);
      if (!persisted?.task_id) {
        await releaseUndispatchedBatchItemCredits(db, persisted ?? item, failureCode(error), input.now);
      }
      await db.query(`
        UPDATE creator_canvas_generation_batch_items
        SET status='failed', failure_json=$2::jsonb, completed_at=$3, updated_at=$3
        WHERE id=$1 AND status='dispatching'
      `, [item.id, JSON.stringify({ failureCode: failureCode(error) }), input.now]);
    }
  }));
  await refreshCanvasGenerationBatchStatus(db, input.batchId, input.now);
  if (!completedSynchronously) {
    return getCanvasGenerationBatch(db, input.batchId, input.canvasProjectId);
  }
  const newlyReady = await queryOne<{ ready: boolean }>(db, `
    SELECT EXISTS (
      SELECT 1
      FROM creator_canvas_generation_batch_items item
      WHERE item.batch_id=$1
        AND item.status='pending'
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(item.depends_on_json) dependency(node_key)
          JOIN creator_canvas_generation_batch_items upstream
            ON upstream.batch_id=item.batch_id AND upstream.node_key=dependency.node_key
          WHERE upstream.status <> 'succeeded'
        )
    ) AS ready
  `, [input.batchId]);
  if (newlyReady?.ready) {
    return dispatchReadyCanvasGenerationBatchItems(db, input);
  }
  return getCanvasGenerationBatch(db, input.batchId, input.canvasProjectId);
}

async function hydrateSucceededPromptDependencies(
  db: SqlDatabase,
  input: {
    batchId: string;
    canvasProjectId: string;
    item: ItemRow;
    byNode: Map<string, ItemRow>;
  },
): Promise<{ ready: boolean; payload: Record<string, unknown> }> {
  const payload = readRecord(input.item.payload_json);
  const textDependencyKeys = dependencies(input.item)
    .filter((nodeKey) => input.byNode.get(nodeKey)?.media_kind === "text");
  if (textDependencyKeys.length) {
    const textArtifacts = await db.query<{ node_key: string; metadata_json: Record<string, unknown> | string }>(`
      SELECT DISTINCT ON (upstream.node_key) upstream.node_key, artifact.metadata_json
      FROM creator_canvas_generation_batch_items upstream
      JOIN creator_canvas_node_artifacts artifact
        ON artifact.canvas_project_id=$3
       AND artifact.node_key=upstream.node_key
       AND artifact.run_id=upstream.run_id
       AND artifact.artifact_kind='text'
       AND artifact.deleted_at IS NULL
      WHERE upstream.batch_id=$1
        AND upstream.node_key=ANY($2::text[])
        AND upstream.status='succeeded'
      ORDER BY upstream.node_key, artifact.selected DESC, artifact.updated_at DESC, artifact.id DESC
    `, [input.batchId, textDependencyKeys, input.canvasProjectId]);
    const textByNode = new Map(textArtifacts.rows.map((row) => [
      row.node_key,
      String(readRecord(row.metadata_json).text ?? "").trim(),
    ]));
    if (textDependencyKeys.some((nodeKey) => !textByNode.get(nodeKey))) {
      return { ready: false, payload };
    }
    const generatedFragments = textDependencyKeys.map((nodeKey) => textByNode.get(nodeKey)!).filter(Boolean);
    const canvasContext = readRecord(payload.canvasContext);
    const resolvedPrompt = [...new Set([
      String(canvasContext.sourcePrompt ?? payload.prompt ?? "").trim(),
      ...generatedFragments,
    ].filter(Boolean))].join("\n\n");
    payload.canvasContext = {
      ...canvasContext,
      sourcePrompt: resolvedPrompt,
      upstreamTextFragments: [...new Set([
        ...readStringArray(canvasContext.upstreamTextFragments),
        ...generatedFragments,
      ])],
    };
    payload.prompt = resolvedPrompt;
  }
  if (input.item.media_kind !== "image" && input.item.media_kind !== "video") {
    return { ready: true, payload };
  }
  const canvasContext = readRecord(payload.canvasContext);
  const promptDependencies = Array.isArray(canvasContext.promptReadDependencies)
    ? canvasContext.promptReadDependencies
      .map((dependency) => readRecord(dependency))
      .map((dependency) => String(dependency.nodeKey ?? "").trim())
      .filter((nodeKey) => nodeKey && dependencies(input.item).includes(nodeKey))
      .filter((nodeKey) => input.byNode.get(nodeKey)?.media_kind === "image")
    : [];
  const nodeKeys = [...new Set(promptDependencies)];
  if (!nodeKeys.length) return { ready: true, payload };

  const stable = await db.query<StableDependencyArtifactRow>(`
    SELECT DISTINCT ON (artifact.node_key)
      artifact.node_key,
      artifact.asset_version_id
    FROM creator_canvas_generation_batch_items upstream
    JOIN creator_canvas_node_runs run
      ON run.canvas_project_id=$3
     AND run.node_key=upstream.node_key
     AND run.task_id=upstream.task_id
     AND run.status='succeeded'
    JOIN creator_canvas_node_artifacts artifact
      ON artifact.canvas_project_id=$3
     AND artifact.node_key=upstream.node_key
     AND artifact.run_id=run.id
     AND artifact.deleted_at IS NULL
     AND artifact.asset_version_id IS NOT NULL
     AND artifact.artifact_kind='image'
    JOIN asset_versions version ON version.id=artifact.asset_version_id
    JOIN assets asset
      ON asset.id=version.asset_id
     AND asset.canvas_project_id=$3
    JOIN storage_objects storage
      ON storage.id=COALESCE(artifact.storage_object_id,version.storage_object_id)
     AND storage.canvas_project_id=$3
     AND storage.status='available'
     AND storage.deleted_at IS NULL
    WHERE upstream.batch_id=$1
      AND upstream.status='succeeded'
      AND upstream.node_key=ANY($2::text[])
      AND (artifact.asset_id IS NULL OR artifact.asset_id=asset.id)
      AND (artifact.storage_object_id IS NULL OR version.storage_object_id IS NULL OR artifact.storage_object_id=version.storage_object_id)
    ORDER BY artifact.node_key, artifact.selected DESC, artifact.updated_at DESC, artifact.id DESC
  `, [input.batchId, nodeKeys, input.canvasProjectId]);
  const versionByNode = new Map(stable.rows.map((row) => [row.node_key, row.asset_version_id]));
  if (nodeKeys.some((nodeKey) => !versionByNode.has(nodeKey))) {
    return { ready: false, payload };
  }
  const existing = readStringArray(payload.referenceAssetVersionIds);
  return {
    ready: true,
    payload: {
      ...payload,
      referenceAssetVersionIds: [...new Set([...existing, ...nodeKeys.map((nodeKey) => versionByNode.get(nodeKey)!)])],
    },
  };
}

async function refreshCanvasGenerationBatchStatus(db: SqlDatabase, batchId: string, now: Date) {
  const current = await queryOne<{
    status: CanvasGenerationBatchStatus;
    credit_reservation_id: string | null;
  }>(
    db, "SELECT status, credit_reservation_id FROM creator_canvas_generation_batches WHERE id=$1", [batchId],
  );
  const counts = await queryOne<{
    total: number | string; succeeded: number | string; failed: number | string;
    canceled: number | string; terminal: number | string;
  }>(db, `
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status='succeeded')::int AS succeeded,
      count(*) FILTER (WHERE status IN ('failed','skipped'))::int AS failed,
      count(*) FILTER (WHERE status='canceled')::int AS canceled,
      count(*) FILTER (WHERE status IN ('succeeded','failed','skipped','canceled'))::int AS terminal
    FROM creator_canvas_generation_batch_items WHERE batch_id=$1
  `, [batchId]);
  const total = Number(counts?.total ?? 0);
  const succeeded = Number(counts?.succeeded ?? 0);
  const failed = Number(counts?.failed ?? 0);
  const canceled = Number(counts?.canceled ?? 0);
  const terminal = Number(counts?.terminal ?? 0);
  const reservation = current?.credit_reservation_id
    ? await queryOne<{ settled: number | string }>(db, `
        SELECT amount_consumed + amount_released AS settled
        FROM credit_reservations WHERE id=$1
      `, [current.credit_reservation_id])
    : null;
  let status: CanvasGenerationBatchStatus = current?.status === "cancel_requested" ? "cancel_requested" : "running";
  if (terminal === total) {
    status = succeeded === total ? "succeeded"
      : succeeded > 0 ? "partial"
        : failed > 0 ? "failed" : "canceled";
  }
  await db.query(`
    UPDATE creator_canvas_generation_batches
    SET status=$2, succeeded_items=$3, failed_items=$4, canceled_items=$5,
        settled_credits=$6,
        completed_at=CASE WHEN $7::boolean THEN $8::timestamptz ELSE NULL::timestamptz END,
        updated_at=$8::timestamptz
    WHERE id=$1
  `, [batchId, status, succeeded, failed, canceled, Number(reservation?.settled ?? 0), terminal === total, now]);
  return status;
}

async function requireBatch(db: SqlDatabase, batchId: string, canvasProjectId: string) {
  const row = await queryOne<BatchRow>(db, `
    SELECT * FROM creator_canvas_generation_batches WHERE id=$1 AND canvas_project_id=$2 LIMIT 1
  `, [batchId, canvasProjectId]);
  if (!row) throw new CanvasGenerationBatchError("canvas_batch_not_found");
  return row;
}

function assertCanvasRunScope(canvasProjectId: string, scope: CanvasActorScope) {
  if (scope.canvasId !== canvasProjectId || !scope.capabilities.includes(capabilities.canvasRun)) {
    throw new CanvasGenerationBatchError("canvas_batch_forbidden");
  }
}

function dependencies(item: ItemRow) {
  if (Array.isArray(item.depends_on_json)) return item.depends_on_json;
  try {
    const value = JSON.parse(item.depends_on_json);
    return Array.isArray(value) ? value.map(String) : [];
  } catch { return []; }
}

function serializeBatch(batch: BatchRow, items: ItemRow[]) {
  return {
    id: batch.id,
    canvasProjectId: batch.canvas_project_id,
    ownerUserId: batch.owner_user_id,
    actorTeamMemberId: batch.actor_team_member_id,
    status: batch.status,
    totalItems: Number(batch.total_items),
    succeededItems: Number(batch.succeeded_items),
    failedItems: Number(batch.failed_items),
    canceledItems: Number(batch.canceled_items),
    billing: {
      mode: batch.billing_mode ?? "per_item",
      reservationId: batch.credit_reservation_id,
      estimatedCredits: Number(batch.estimated_credits ?? 0),
      settledCredits: Number(batch.settled_credits ?? 0),
    },
    items: items.map((item) => ({
      id: item.id, nodeKey: item.node_key, mediaKind: item.media_kind, status: item.status,
      dependsOn: dependencies(item), payload: readRecord(item.payload_json), taskId: item.task_id,
      creditReservationId: item.credit_reservation_id, creditAllocationId: item.credit_allocation_id,
      failure: readRecord(item.failure_json),
    })),
    createdAt: new Date(batch.created_at).toISOString(),
    updatedAt: new Date(batch.updated_at).toISOString(),
    completedAt: batch.completed_at ? new Date(batch.completed_at).toISOString() : null,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return readRecord(parsed); } catch { return {}; }
  }
  return {};
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function failureCode(error: unknown) {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown; failureCode?: unknown }).failureCode
      ?? (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  return error instanceof Error && error.message ? error.message : "canvas_batch_dispatch_failed";
}

async function releaseUndispatchedBatchItemCredits(
  db: SqlDatabase,
  item: ItemRow,
  reason: string,
  now: Date,
) {
  const amount = Number(item.estimated_credits ?? 0);
  if (!item.credit_reservation_id || !item.billing_allocation_key || amount <= 0) return;
  const settled = await settleReservationAllocation(db, {
    reservationId: item.credit_reservation_id,
    allocationKey: item.billing_allocation_key,
    amount,
    outcome: "released",
    metadata: { batchItemId: item.id, reason },
    now,
  });
  await db.query(`
    UPDATE creator_canvas_generation_batch_items
    SET credit_allocation_id=$2, updated_at=$3
    WHERE id=$1
  `, [item.id, settled.allocation.id, now]);
}

function normalizeBatchBilling(
  billing: { mode: "batch_reservation"; itemCredits: Record<string, number> } | undefined,
  nodeKeys: string[],
  actorScope: CanvasActorScope,
) {
  if (!billing) return null;
  if (actorScope.actorTeamMemberId) {
    throw new CanvasGenerationBatchError("canvas_batch_billing_team_member_fallback_required");
  }
  const itemCredits: Record<string, number> = {};
  let totalCredits = 0;
  for (const nodeKey of nodeKeys) {
    const amount = Number(billing.itemCredits[nodeKey]);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new CanvasGenerationBatchError("canvas_batch_billing_estimate_invalid");
    }
    itemCredits[nodeKey] = amount;
    totalCredits += amount;
  }
  if (!Number.isSafeInteger(totalCredits) || totalCredits <= 0) {
    throw new CanvasGenerationBatchError("canvas_batch_billing_estimate_invalid");
  }
  return { itemCredits, totalCredits };
}
