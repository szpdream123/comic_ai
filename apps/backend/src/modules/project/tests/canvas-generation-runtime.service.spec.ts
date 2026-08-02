import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { grantCredits, reserveCredits } from "../../credit-billing/credit-ledger.service.ts";
import type { CanvasActorScope } from "../../identity/canvas-actor-scope.service.ts";
import {
  markGenerationTaskSnapshotFailed,
  upsertQueuedGenerationTaskSnapshot,
} from "../../model-gateway/generation-task-snapshot.service.ts";
import { createOrReuseProviderRequest } from "../../model-gateway/provider-request.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createScopedStorageObject, markStorageObjectAvailable } from "../../storage/storage.service.ts";
import { registerOrReuseCanvasUploadFingerprint } from "../../storage/canvas-upload-fingerprint.service.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import { appendCanvasNodeArtifact, createCanvasNodeRun } from "../creator-canvas-record.service.ts";
import {
  cancelCanvasGenerationBatch,
  assertCanvasGenerationPerItemBilling,
  CanvasGenerationBatchError,
  canvasScriptWorkflowReferencesBelongToTarget,
  compileCanvasScriptWorkflowPrompt,
  createCanvasGenerationBatch,
  getCanvasGenerationBatch,
  planCanvasGenerationDag,
  reconcileActiveCanvasGenerationBatches,
  reconcileCanvasGenerationBatch,
  recordCanvasGenerationBatchItemOutcome,
} from "../canvas-generation-batch.service.ts";
import {
  exportCanvasGenerationHistoryJson,
  listCanvasGenerationHistory,
  softDeleteCanvasGenerationRun,
  softDeleteCanvasGenerationRuns,
} from "../canvas-generation-history.service.ts";
import {
  assertCanvasAssetDeletionAllowed,
  CanvasAssetReferenceError,
  inspectCanvasAssetReferenceUsage,
} from "../canvas-asset-reference.service.ts";

describe("Canvas generation runtime", { concurrency: false }, () => {
  it("recompiles script workflow mentions by backend first-appearance order", () => {
    const compiled = compileCanvasScriptWorkflowPrompt("@主角走入@街道，@主角停下。", [
      { mention: "@街道", nodeId: "scene", referenceAssetVersionId: "scene-version" },
      { mention: "@主角", nodeId: "role", referenceAssetVersionId: "role-version" },
    ]);

    assert.equal(compiled.prompt, "图1中的主角走入图2中的街道，图1中的主角停下。");
    assert.deepEqual(compiled.references.map((reference) => reference.nodeId), ["role", "scene"]);
  });
  it("accepts script references only when the shot and assets share one workflow parent", () => {
    const document = {
      nodes: [
        { id: "shot", data: { workflowParentId: "script-a", workflowKind: "storyboard" } },
        { id: "role-a", data: { workflowParentId: "script-a", workflowKind: "character" } },
        { id: "scene-a", data: { workflowParentId: "script-a", workflowKind: "scene" } },
        { id: "role-b", data: { workflowParentId: "script-b", workflowKind: "character" } },
      ],
    };

    assert.equal(canvasScriptWorkflowReferencesBelongToTarget(document, "shot", [
      { nodeId: "role-a" },
      { nodeId: "scene-a" },
    ]), true);
    assert.equal(canvasScriptWorkflowReferencesBelongToTarget(document, "shot", [
      { nodeId: "role-b" },
    ]), false);
    assert.equal(canvasScriptWorkflowReferencesBelongToTarget(document, "missing-shot", [
      { nodeId: "role-a" },
    ]), false);
  });
  it("plans stable DAG levels and rejects cycles", () => {
    assert.deepEqual(planCanvasGenerationDag([
      { nodeKey: "image-a", mediaKind: "image" },
      { nodeKey: "image-b", mediaKind: "image" },
      { nodeKey: "video", mediaKind: "video", dependsOn: ["image-a", "image-b"] },
    ]).levels, [["image-a", "image-b"], ["video"]]);
    assert.throws(
      () => planCanvasGenerationDag([
        { nodeKey: "a", mediaKind: "image", dependsOn: ["b"] },
        { nodeKey: "b", mediaKind: "video", dependsOn: ["a"] },
      ]),
      (error: unknown) => (error as { code?: string }).code === "canvas_batch_cycle_detected",
    );
    assert.throws(
      () => planCanvasGenerationDag(Array.from({ length: 101 }, (_, index) => ({
        nodeKey: `image-${index}`,
        mediaKind: "image" as const,
      }))),
      (error: unknown) => (error as { code?: string }).code === "canvas_batch_node_count_invalid",
    );
  });

  it("rejects batch reservation dispatch before a per-item task can reserve again", () => {
    assert.doesNotThrow(() => assertCanvasGenerationPerItemBilling({ mode: "per_item" }));
    assert.throws(
      () => assertCanvasGenerationPerItemBilling({
        mode: "batch_reservation",
        reservationId: randomUUID(),
        allocationKey: `canvas-batch-item:${randomUUID()}`,
        estimatedCredits: 5,
      }),
      (error: unknown) => error instanceof CanvasGenerationBatchError
        && error.code === "canvas_batch_billing_mode_unsupported",
    );
  });

  it("does not invoke a per-item dispatcher for a batch reservation envelope", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const now = new Date("2026-07-25T06:30:00.000Z");
    try {
      await grantCredits(db, {
        userId: fixture.userId,
        amount: 10,
        sourceType: "canvas_batch_test_grant",
        sourceId: randomUUID(),
        reason: "Canvas batch envelope test",
        createdByUserId: fixture.userId,
        now,
      });
      const reserved = await reserveCredits(db, {
        userId: fixture.userId,
        canvasProjectId: fixture.canvasId,
        amount: 5,
        sourceType: "canvas_generation_batch",
        sourceId: randomUUID(),
        reason: "Canvas batch envelope",
        createdByUserId: fixture.userId,
        now,
      });
      const batchId = randomUUID();
      await db.query(`
        INSERT INTO creator_canvas_generation_batches (
          id, canvas_project_id, owner_user_id, principal_key, idempotency_key,
          request_hash, status, total_items, billing_mode, credit_reservation_id,
          estimated_credits, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,'batch-envelope-test',$5,'created',1,
          'batch_reservation',$6,5,$7,$7)
      `, [batchId, fixture.canvasId, fixture.userId, `owner:${fixture.userId}`, "a".repeat(64), reserved.reservation.id, now]);
      await db.query(`
        INSERT INTO creator_canvas_generation_batch_items (
          id, batch_id, node_key, media_kind, status, depends_on_json, payload_json,
          created_at, updated_at
        ) VALUES ($1,$2,'root','image','pending','[]'::jsonb,'{}'::jsonb,$3,$3)
      `, [randomUUID(), batchId, now]);
      let invoked = false;
      const perItemDispatch = Object.assign(async () => {
        invoked = true;
        return { taskId: randomUUID() };
      }, { supportedBillingModes: ["per_item"] as const });

      await assert.rejects(
        reconcileCanvasGenerationBatch(db, {
          batchId,
          canvasProjectId: fixture.canvasId,
          dispatchNode: perItemDispatch,
          now: new Date("2026-07-25T06:31:00.000Z"),
        }),
        (error: unknown) => error instanceof CanvasGenerationBatchError
          && error.code === "canvas_batch_billing_mode_unsupported",
      );
      assert.equal(invoked, false);
      const wallet = await db.query<{ credit_balance_cached: number; credit_reserved_cached: number }>(
        "SELECT credit_balance_cached, credit_reserved_cached FROM users WHERE id=$1",
        [fixture.userId],
      );
      assert.equal(Number(wallet.rows[0]?.credit_balance_cached), 5);
      assert.equal(Number(wallet.rows[0]?.credit_reserved_cached), 5);
      const reservationCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_reservations WHERE user_id=$1",
        [fixture.userId],
      );
      assert.equal(Number(reservationCount.rows[0]?.count), 1);
    } finally {
      await db.close();
    }
  });

  it("dispatches independent roots, unlocks dependencies, and preserves partial success", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const dispatched: string[] = [];
    try {
      const dispatchNode = async (input: { nodeKey: string }) => {
        dispatched.push(input.nodeKey);
        const workflow = await createWorkflowWithTasks(db, {
          userId: fixture.userId,
          projectId: null,
          canvasProjectId: fixture.canvasId,
          workflowType: "canvas_batch_node",
          inputSnapshot: {},
          tasks: [{
            taskType: input.nodeKey === "video" ? "episode_generate_video" : "episode_generate_image",
            queueName: "generation-submit-image",
            targetEntityType: "canvas",
            targetEntityId: fixture.canvasId,
            inputSnapshot: { providerExecutor: input.nodeKey === "video" ? "seedance" : "gpt-image-2" },
          }],
        });
        return { taskId: workflow.tasks[0]!.id };
      };
      const created = await createCanvasGenerationBatch(db, {
        canvasProjectId: fixture.canvasId,
        actorScope: fixture.scope,
        idempotencyKey: "dag-partial-test",
        nodes: [
          { nodeKey: "image-a", mediaKind: "image" },
          { nodeKey: "image-b", mediaKind: "image" },
          { nodeKey: "video", mediaKind: "video", dependsOn: ["image-a"] },
        ],
        dispatchNode,
        now: new Date("2026-07-25T07:00:00.000Z"),
      });
      assert.deepEqual(dispatched.sort(), ["image-a", "image-b"]);
      assert.equal(created.status, "running");
      assert.deepEqual(created.billing, {
        mode: "per_item",
        reservationId: null,
        estimatedCredits: 0,
        settledCredits: 0,
      });
      await assert.rejects(
        db.query(`
          UPDATE creator_canvas_generation_batches
          SET billing_mode='batch_reservation'
          WHERE id=$1
        `, [created.id]),
        (error: unknown) => String((error as { message?: unknown }).message ?? error)
          .includes("creator_canvas_generation_batches_billing_binding_check"),
      );
      await assert.rejects(
        createCanvasGenerationBatch(db, {
          canvasProjectId: fixture.canvasId,
          actorScope: fixture.scope,
          idempotencyKey: "dag-partial-test",
          nodes: [{ nodeKey: "different", mediaKind: "image" }],
          dispatchNode,
          now: new Date("2026-07-25T07:00:30.000Z"),
        }),
        (error: unknown) => (error as { code?: string }).code === "canvas_batch_idempotency_conflict",
      );

      await recordCanvasGenerationBatchItemOutcome(db, {
        batchId: created.id, nodeKey: "image-a", status: "succeeded", now: new Date("2026-07-25T07:01:00.000Z"),
      });
      await recordCanvasGenerationBatchItemOutcome(db, {
        batchId: created.id, nodeKey: "image-b", status: "failed",
        failure: { failureCode: "provider_failed" }, now: new Date("2026-07-25T07:01:00.000Z"),
      });
      await reconcileCanvasGenerationBatch(db, {
        batchId: created.id,
        canvasProjectId: fixture.canvasId,
        dispatchNode,
        now: new Date("2026-07-25T07:02:00.000Z"),
      });
      assert.deepEqual(dispatched.sort(), ["image-a", "image-b", "video"]);
      await recordCanvasGenerationBatchItemOutcome(db, {
        batchId: created.id, nodeKey: "video", status: "succeeded", now: new Date("2026-07-25T07:03:00.000Z"),
      });
      const completed = await getCanvasGenerationBatch(db, created.id, fixture.canvasId);
      assert.equal(completed.status, "partial");
      assert.deepEqual(
        completed.items.map((item) => [item.nodeKey, item.status]),
        [["image-a", "succeeded"], ["image-b", "failed"], ["video", "succeeded"]],
      );
    } finally {
      await db.close();
    }
  });

  it("runs text nodes inside the DAG and injects their artifacts into successors", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const dispatched: Array<{ nodeKey: string; payload: Record<string, unknown> }> = [];
    try {
      await db.query(`
        INSERT INTO creator_canvas_nodes (
          id,canvas_project_id,node_key,node_type,title,status,media_kind,created_by_user_id,updated_by_user_id
        ) VALUES
          ($1,$3,'text','ai-text','Text','idle','text',$4,$4),
          ($2,$3,'image','ai-image','Image','idle','image',$4,$4)
      `, [randomUUID(), randomUUID(), fixture.canvasId, fixture.userId]);
      const dispatchNode = async (input: {
        nodeKey: string;
        mediaKind: "text" | "image" | "video" | "audio";
        payload: Record<string, unknown>;
      }) => {
        dispatched.push({ nodeKey: input.nodeKey, payload: input.payload });
        if (input.mediaKind === "text") {
          const run = await createCanvasNodeRun(db, {
            canvasProjectId: fixture.canvasId,
            nodeKey: input.nodeKey,
            idempotencyKey: `text-batch:${input.nodeKey}`,
            mediaKind: "text",
            modelCode: "text-model",
            inputSnapshot: input.payload,
            actorScope: fixture.scope,
            now: new Date("2026-07-25T07:10:00.000Z"),
          });
          await db.query(
            "UPDATE creator_canvas_node_runs SET status='succeeded',completed_at=$2,updated_at=$2 WHERE id=$1",
            [run.id, new Date("2026-07-25T07:10:01.000Z")],
          );
          await appendCanvasNodeArtifact(db, {
            canvasProjectId: fixture.canvasId,
            nodeKey: input.nodeKey,
            runId: run.id,
            artifactKind: "text",
            selected: true,
            metadata: { text: "生成后的角色设定" },
            userId: fixture.userId,
            now: new Date("2026-07-25T07:10:01.000Z"),
          });
          return { status: "succeeded" as const, runId: run.id };
        }
        const workflow = await createWorkflowWithTasks(db, {
          userId: fixture.userId,
          projectId: null,
          canvasProjectId: fixture.canvasId,
          workflowType: "canvas_batch_node",
          inputSnapshot: input.payload,
          tasks: [{
            taskType: "episode_generate_image",
            queueName: "generation-submit-image",
            targetEntityType: "canvas",
            targetEntityId: fixture.canvasId,
            inputSnapshot: input.payload,
          }],
        });
        return { status: "queued" as const, taskId: workflow.tasks[0]!.id };
      };
      const created = await createCanvasGenerationBatch(db, {
        canvasProjectId: fixture.canvasId,
        actorScope: fixture.scope,
        idempotencyKey: "dag-text-successor",
        nodes: [
          { nodeKey: "text", mediaKind: "text", payload: { prompt: "编写角色设定" } },
          { nodeKey: "image", mediaKind: "image", dependsOn: ["text"], payload: { prompt: "绘制角色" } },
        ],
        dispatchNode,
        now: new Date("2026-07-25T07:10:00.000Z"),
      });

      assert.deepEqual(dispatched.map((item) => item.nodeKey), ["text", "image"], JSON.stringify(created));
      assert.deepEqual(created.items.map((item) => [item.nodeKey, item.status]), [
        ["text", "succeeded"], ["image", "queued"],
      ]);
      assert.match(String(dispatched[1]?.payload.prompt), /生成后的角色设定/);
      assert.deepEqual(
        (dispatched[1]?.payload.canvasContext as Record<string, unknown>).upstreamTextFragments,
        ["生成后的角色设定"],
      );
    } finally {
      await db.close();
    }
  });

  it("waits for a stable upstream artifact and injects only its asset version into the successor", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const dispatched: Array<{ nodeKey: string; payload: Record<string, unknown>; taskId: string }> = [];
    try {
      await db.query(`
        INSERT INTO creator_canvas_nodes (
          id,canvas_project_id,node_key,node_type,title,status,media_kind,created_by_user_id,updated_by_user_id
        ) VALUES
          ($1,$3,'root','image','Root','idle','image',$4,$4),
          ($2,$3,'dependent','image','Dependent','idle','image',$4,$4)
      `, [randomUUID(), randomUUID(), fixture.canvasId, fixture.userId]);
      const dispatchNode = async (input: { nodeKey: string; payload: Record<string, unknown> }) => {
        const workflow = await createWorkflowWithTasks(db, {
          userId: fixture.userId,
          projectId: null,
          canvasProjectId: fixture.canvasId,
          workflowType: "canvas_batch_node",
          inputSnapshot: input.payload,
          tasks: [{
            taskType: "episode_generate_image",
            queueName: "generation-submit-image",
            targetEntityType: "canvas",
            targetEntityId: fixture.canvasId,
            inputSnapshot: input.payload,
          }],
        });
        const taskId = workflow.tasks[0]!.id;
        dispatched.push({ nodeKey: input.nodeKey, payload: input.payload, taskId });
        return { taskId };
      };
      const existingReferenceVersionId = randomUUID();
      const created = await createCanvasGenerationBatch(db, {
        canvasProjectId: fixture.canvasId,
        actorScope: fixture.scope,
        idempotencyKey: "dag-stable-artifact",
        nodes: [
          { nodeKey: "root", mediaKind: "image" },
          {
            nodeKey: "dependent",
            mediaKind: "image",
            dependsOn: ["root"],
            payload: {
              prompt: "前端传入的错误图号",
              motionPrompt: "前端传入的错误图号",
              canvasContext: {
                sourcePrompt: "@新场景 在 @已有角色。",
                promptReadDependencies: [{ kind: "canvas_node_read", nodeKey: "root" }],
                scriptWorkflowReferences: [
                  { mention: "@已有角色", nodeId: "existing", referenceIndex: 1, referenceAssetVersionId: existingReferenceVersionId },
                  { mention: "@新场景", nodeId: "root", referenceIndex: 2, referenceAssetVersionId: "" },
                ],
              },
            },
          },
        ],
        dispatchNode,
        now: new Date("2026-07-25T07:30:00.000Z"),
      });
      const rootTaskId = String(created.items.find((item) => item.nodeKey === "root")?.taskId ?? "");
      const run = await createCanvasNodeRun(db, {
        canvasProjectId: fixture.canvasId,
        nodeKey: "root",
        idempotencyKey: "dag-stable-artifact-run",
        mediaKind: "image",
        modelCode: "model-a",
        inputSnapshot: {},
        actorScope: fixture.scope,
        now: new Date("2026-07-25T07:30:10.000Z"),
      });
      await db.query(
        "UPDATE creator_canvas_node_runs SET task_id=$2,status='succeeded',updated_at=$3 WHERE id=$1",
        [run.id, rootTaskId, new Date("2026-07-25T07:30:20.000Z")],
      );
      await recordCanvasGenerationBatchItemOutcome(db, {
        batchId: created.id,
        nodeKey: "root",
        status: "succeeded",
        now: new Date("2026-07-25T07:30:20.000Z"),
      });

      const waiting = await reconcileCanvasGenerationBatch(db, {
        batchId: created.id,
        canvasProjectId: fixture.canvasId,
        dispatchNode,
        now: new Date("2026-07-25T07:31:00.000Z"),
      });
      const waitingDependent = waiting.items.find((item) => item.nodeKey === "dependent")!;
      assert.equal(waitingDependent.status, "pending");
      assert.equal(waitingDependent.failure.failureCode, "upstream_artifact_not_ready");
      assert.deepEqual(dispatched.map((item) => item.nodeKey), ["root"]);

      const stable = await seedStableCanvasArtifactVersion(db, fixture, {
        nodeKey: "root",
        runId: run.id,
        objectName: "dag/root.png",
      });
      const reconciled = await reconcileCanvasGenerationBatch(db, {
        batchId: created.id,
        canvasProjectId: fixture.canvasId,
        dispatchNode,
        now: new Date("2026-07-25T07:32:00.000Z"),
      });
      assert.equal(reconciled.items.find((item) => item.nodeKey === "dependent")?.status, "queued");
      const dependentDispatch = dispatched.find((item) => item.nodeKey === "dependent")!;
      assert.deepEqual(dependentDispatch.payload.referenceAssetVersionIds, [stable.assetVersionId, existingReferenceVersionId]);
      assert.equal(dependentDispatch.payload.prompt, "图1中的新场景 在 图2中的已有角色。");
      assert.equal(dependentDispatch.payload.motionPrompt, "图1中的新场景 在 图2中的已有角色。");
      assert.deepEqual(
        (dependentDispatch.payload.canvasContext as Record<string, unknown>).scriptWorkflowReferences,
        [
          { mention: "@新场景", nodeId: "root", referenceIndex: 1, referenceAssetVersionId: stable.assetVersionId },
          { mention: "@已有角色", nodeId: "existing", referenceIndex: 2, referenceAssetVersionId: existingReferenceVersionId },
        ],
      );
      assert.equal(JSON.stringify(dependentDispatch.payload).includes("http"), false);
      assert.equal(JSON.stringify(dependentDispatch.payload).includes("base64"), false);
    } finally {
      await db.close();
    }
  });

  it("cancels pending DAG items and delegates queued task cancellation", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const canceledTaskIds: string[] = [];
    try {
      const dispatchNode = async () => {
        const workflow = await createWorkflowWithTasks(db, {
          userId: fixture.userId, projectId: null, canvasProjectId: fixture.canvasId,
          workflowType: "canvas_batch_node", inputSnapshot: {},
          tasks: [{ taskType: "episode_generate_image", queueName: "generation-submit-image", targetEntityType: "canvas", targetEntityId: fixture.canvasId, inputSnapshot: { providerExecutor: "gpt-image-2" } }],
        });
        return { taskId: workflow.tasks[0]!.id };
      };
      const created = await createCanvasGenerationBatch(db, {
        canvasProjectId: fixture.canvasId, actorScope: fixture.scope, idempotencyKey: "cancel-batch",
        nodes: [
          { nodeKey: "root", mediaKind: "image" },
          { nodeKey: "dependent", mediaKind: "video", dependsOn: ["root"] },
        ],
        dispatchNode,
        now: new Date("2026-07-25T08:00:00.000Z"),
      });
      const canceled = await cancelCanvasGenerationBatch(db, {
        batchId: created.id,
        canvasProjectId: fixture.canvasId,
        actorScope: fixture.scope,
        cancelTask: async (taskId) => { canceledTaskIds.push(taskId); },
        now: new Date("2026-07-25T08:01:00.000Z"),
      });
      assert.equal(canceled.status, "cancel_requested");
      assert.equal(canceledTaskIds.length, 1);
      assert.deepEqual(canceled.items.map((item) => item.status).sort(), ["cancel_requested", "canceled"]);
    } finally {
      await db.close();
    }
  });

  it("automatically reconciles active batches and recovers stale dispatch claims", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const dispatched: string[] = [];
    try {
      const dispatchNode = async (input: { nodeKey: string }) => {
        dispatched.push(input.nodeKey);
        const workflow = await createWorkflowWithTasks(db, {
          userId: fixture.userId,
          projectId: null,
          canvasProjectId: fixture.canvasId,
          workflowType: "canvas_batch_node",
          inputSnapshot: {},
          tasks: [{
            taskType: "episode_generate_image",
            queueName: "generation-submit-image",
            targetEntityType: "canvas",
            targetEntityId: fixture.canvasId,
            inputSnapshot: { providerExecutor: "gpt-image-2" },
          }],
        });
        return { taskId: workflow.tasks[0]!.id };
      };
      const created = await createCanvasGenerationBatch(db, {
        canvasProjectId: fixture.canvasId,
        actorScope: fixture.scope,
        idempotencyKey: "maintenance-advance",
        nodes: [
          { nodeKey: "root", mediaKind: "image" },
          { nodeKey: "dependent", mediaKind: "image", dependsOn: ["root"] },
        ],
        dispatchNode,
        now: new Date("2026-07-25T08:00:00.000Z"),
      });
      const root = created.items.find((item) => item.nodeKey === "root")!;
      await db.query("UPDATE tasks SET status='succeeded' WHERE id=$1", [root.taskId]);
      await db.query(`
        UPDATE creator_canvas_generation_batch_items
        SET status='dispatching', updated_at=$2
        WHERE batch_id=$1 AND node_key='dependent'
      `, [created.id, new Date("2026-07-25T08:00:01.000Z")]);

      const result = await reconcileActiveCanvasGenerationBatches(db, {
        now: new Date("2026-07-25T08:05:00.000Z"),
        staleDispatchMs: 60_000,
        createDispatch: async (target) => {
          assert.equal(target.ownerUserId, fixture.userId);
          assert.equal(target.canvasProjectId, fixture.canvasId);
          return dispatchNode;
        },
      });

      assert.deepEqual(result.failedBatches, []);
      assert.deepEqual(result.reconciledBatchIds, [created.id]);
      assert.deepEqual(dispatched, ["root", "dependent"]);
      const reconciled = await getCanvasGenerationBatch(db, created.id, fixture.canvasId);
      assert.equal(reconciled.items.find((item) => item.nodeKey === "root")?.status, "succeeded");
      assert.equal(reconciled.items.find((item) => item.nodeKey === "dependent")?.status, "queued");
    } finally {
      await db.close();
    }
  });

  it("paginates/searches/soft-deletes history and exports stable JSON", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    try {
      const first = await createCanvasNodeRun(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "alpha", idempotencyKey: "history-1",
        mediaKind: "image", modelCode: "model-a", inputSnapshot: { prompt: "red city" },
        actorScope: fixture.scope, now: new Date("2026-07-25T09:00:00.000Z"),
      });
      await createCanvasNodeRun(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "beta", idempotencyKey: "history-2",
        mediaKind: "video", modelCode: "model-b", inputSnapshot: { prompt: "blue sea" },
        actorScope: fixture.scope, now: new Date("2026-07-25T09:01:00.000Z"),
      });
      const page1 = await listCanvasGenerationHistory(db, {
        canvasProjectId: fixture.canvasId, actorScope: fixture.scope, limit: 1,
      });
      const page2 = await listCanvasGenerationHistory(db, {
        canvasProjectId: fixture.canvasId, actorScope: fixture.scope, limit: 1, cursor: page1.nextCursor,
      });
      assert.equal(page1.items[0]?.nodeKey, "beta");
      assert.equal(page2.items[0]?.nodeKey, "alpha");
      const searched = await listCanvasGenerationHistory(db, {
        canvasProjectId: fixture.canvasId, actorScope: fixture.scope, search: "red city",
      });
      assert.deepEqual(searched.items.map((item) => item.id), [first.id]);
      await softDeleteCanvasGenerationRun(db, {
        canvasProjectId: fixture.canvasId, runId: first.id, actorScope: fixture.scope,
        now: new Date("2026-07-25T09:02:00.000Z"),
      });
      const exported = await exportCanvasGenerationHistoryJson(db, {
        canvasProjectId: fixture.canvasId, actorScope: fixture.scope,
        now: new Date("2026-07-25T09:03:00.000Z"),
      });
      assert.equal(exported.items.length, 1);
      assert.equal((exported.items[0] as { nodeKey: string }).nodeKey, "beta");

      await createCanvasNodeRun(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "beta", idempotencyKey: "history-3",
        mediaKind: "image", modelCode: "model-c", inputSnapshot: { prompt: "blue sky" },
        actorScope: fixture.scope, now: new Date("2026-07-25T09:04:00.000Z"),
      });
      const deletedNode = await softDeleteCanvasGenerationRuns(db, {
        canvasProjectId: fixture.canvasId, actorScope: fixture.scope, nodeKey: "beta",
        now: new Date("2026-07-25T09:05:00.000Z"),
      });
      assert.equal(deletedNode.scope, "node");
      assert.equal(deletedNode.deletedCount, 2);

      await createCanvasNodeRun(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "alpha", idempotencyKey: "history-4",
        mediaKind: "audio", modelCode: "model-d", inputSnapshot: { prompt: "voice" },
        actorScope: fixture.scope, now: new Date("2026-07-25T09:06:00.000Z"),
      });
      const deletedAll = await softDeleteCanvasGenerationRuns(db, {
        canvasProjectId: fixture.canvasId, actorScope: fixture.scope,
        now: new Date("2026-07-25T09:07:00.000Z"),
      });
      assert.equal(deletedAll.scope, "all");
      assert.equal(deletedAll.deletedCount, 1);
      const empty = await listCanvasGenerationHistory(db, {
        canvasProjectId: fixture.canvasId, actorScope: fixture.scope,
      });
      assert.equal(empty.items.length, 0);
    } finally {
      await db.close();
    }
  });

  it("projects terminal snapshot and task state into queued Canvas history runs", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const now = new Date("2026-07-25T09:10:00.000Z");
    try {
      const snapshotWorkflow = await createWorkflowWithTasks(db, {
        userId: fixture.userId,
        projectId: null,
        canvasProjectId: fixture.canvasId,
        workflowType: "canvas_history_snapshot",
        inputSnapshot: {},
        tasks: [{
          taskType: "episode_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "canvas",
          targetEntityId: fixture.canvasId,
          inputSnapshot: {},
        }],
      });
      const snapshotTask = snapshotWorkflow.tasks[0]!;
      const snapshotRun = await createCanvasNodeRun(db, {
        canvasProjectId: fixture.canvasId,
        nodeKey: "alpha",
        idempotencyKey: "history-terminal-snapshot",
        status: "queued",
        mediaKind: "image",
        taskId: snapshotTask.id,
        actorScope: fixture.scope,
        now,
      });
      await upsertQueuedGenerationTaskSnapshot(db, {
        projectId: null,
        canvasProjectId: fixture.canvasId,
        episodeId: null,
        targetType: "canvas",
        targetId: fixture.canvasId,
        workflowId: snapshotWorkflow.workflow.id,
        taskId: snapshotTask.id,
        modelConfigId: null,
        creditReservationId: null,
        modelCode: "canvas-test-model",
        mediaType: "image",
        taskMode: "sync",
        estimatedCredits: 0,
        requestSummary: {},
        now,
      });
      const provider = await createOrReuseProviderRequest(db, {
        userId: fixture.userId,
        projectId: null,
        canvasProjectId: fixture.canvasId,
        workflowId: snapshotWorkflow.workflow.id,
        taskId: snapshotTask.id,
        providerName: "canvas-history-test",
        providerOperation: "image_generation",
        requestKey: randomUUID(),
        requestHash: "snapshot-request-hash",
        payloadRef: `creator://generation/canvas/${fixture.canvasId}`,
        payloadHash: "snapshot-payload-hash",
        redactedPayload: {},
        now,
      });
      await markGenerationTaskSnapshotFailed(db, {
        taskId: snapshotTask.id,
        providerRequestId: provider.request.id,
        failure: {
          failureCode: "content_policy_rejected",
          displayMessage: "Reference image or prompt was rejected.",
        },
        now: new Date("2026-07-25T09:10:01.000Z"),
      });
      await db.query(
        "UPDATE tasks SET status='failed', failure_code='content_policy_rejected', updated_at=$2 WHERE id=$1",
        [snapshotTask.id, new Date("2026-07-25T09:10:01.000Z")],
      );

      const taskWorkflow = await createWorkflowWithTasks(db, {
        userId: fixture.userId,
        projectId: null,
        canvasProjectId: fixture.canvasId,
        workflowType: "canvas_history_task",
        inputSnapshot: {},
        tasks: [{
          taskType: "episode_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "canvas",
          targetEntityId: fixture.canvasId,
          inputSnapshot: {},
        }],
      });
      const taskOnly = taskWorkflow.tasks[0]!;
      const taskRun = await createCanvasNodeRun(db, {
        canvasProjectId: fixture.canvasId,
        nodeKey: "beta",
        idempotencyKey: "history-terminal-task",
        status: "queued",
        mediaKind: "image",
        taskId: taskOnly.id,
        actorScope: fixture.scope,
        now: new Date("2026-07-25T09:11:00.000Z"),
      });
      await db.query(
        "UPDATE tasks SET status='failed', failure_code='provider_failed', updated_at=$2 WHERE id=$1",
        [taskOnly.id, new Date("2026-07-25T09:11:01.000Z")],
      );

      const failed = await listCanvasGenerationHistory(db, {
        canvasProjectId: fixture.canvasId,
        actorScope: fixture.scope,
        status: "failed",
      });
      const byId = new Map(failed.items.map((item) => [item.id, item]));
      const snapshotItem = byId.get(snapshotRun.id)!;
      assert.equal(snapshotItem.status, "failed");
      assert.equal(snapshotItem.taskId, snapshotTask.id);
      assert.equal(snapshotItem.providerRequestId, provider.request.id);
      assert.ok(snapshotItem.generationSnapshotId);
      assert.equal((snapshotItem.failure as { failureCode?: string }).failureCode, "content_policy_rejected");
      assert.ok((snapshotItem.failure as { displayMessage?: string }).displayMessage);
      const taskItem = byId.get(taskRun.id)!;
      assert.equal(taskItem.status, "failed");
      assert.deepEqual(taskItem.failure, { failureCode: "provider_failed" });

      const queued = await listCanvasGenerationHistory(db, {
        canvasProjectId: fixture.canvasId,
        actorScope: fixture.scope,
        status: "queued",
      });
      assert.equal(queued.items.length, 0);
    } finally {
      await db.close();
    }
  });

  it("protects referenced assets and reuses uploads only within one Canvas fingerprint scope", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    try {
      const storage = await createScopedStorageObject(db, {
        userId: fixture.userId, canvasProjectId: fixture.canvasId, bucket: "test", objectName: "uploads/reference.png",
        contentType: "image/png", sizeBytes: 123, checksum: "a".repeat(64), provider: "creator-dev",
        status: "pending_upload", metadata: {}, createdByUserId: fixture.userId, now: new Date("2026-07-25T10:00:00.000Z"),
      });
      await markStorageObjectAvailable(db, {
        storageObjectId: storage.id, sizeBytes: 123, checksum: "a".repeat(64), contentType: "image/png",
        now: new Date("2026-07-25T10:00:01.000Z"),
      });
      const first = await registerOrReuseCanvasUploadFingerprint(db, {
        canvasProjectId: fixture.canvasId, ownerUserId: fixture.userId, storageObjectId: storage.id,
        fingerprint: `sha256:${"a".repeat(64)}`, contentType: "image/png", sizeBytes: 123,
        now: new Date("2026-07-25T10:01:00.000Z"),
      });
      const second = await registerOrReuseCanvasUploadFingerprint(db, {
        canvasProjectId: fixture.canvasId, ownerUserId: fixture.userId, storageObjectId: randomUUID(),
        fingerprint: "a".repeat(64), contentType: "image/png", sizeBytes: 123,
        now: new Date("2026-07-25T10:02:00.000Z"),
      });
      assert.equal(first.reused, false);
      assert.equal(second.reused, true);
      assert.equal(second.storageObject?.id, storage.id);

      await appendCanvasNodeArtifact(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "asset-node", artifactKind: "image",
        storageObjectId: storage.id, selected: true, userId: fixture.userId,
        now: new Date("2026-07-25T10:03:00.000Z"),
      });
      const usage = await inspectCanvasAssetReferenceUsage(db, {
        canvasProjectId: fixture.canvasId, storageObjectId: storage.id,
      });
      assert.equal(usage.artifactReferenceCount, 1);
      await assert.rejects(
        assertCanvasAssetDeletionAllowed(db, { canvasProjectId: fixture.canvasId, storageObjectId: storage.id }),
        (error: unknown) => error instanceof CanvasAssetReferenceError,
      );
    } finally {
      await db.close();
    }
  });
});

async function seedCanvas(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const userId = randomUUID();
  const canvasId = randomUUID();
  await db.query("INSERT INTO users (id, status) VALUES ($1, 'active')", [userId]);
  await db.query(`
    INSERT INTO creator_canvas_projects
      (id, title, status, server_revision, created_by_user_id, updated_by_user_id)
    VALUES ($1, 'Generation runtime', 'active', 1, $2, $2)
  `, [canvasId, userId]);
  await db.query(`
    INSERT INTO creator_canvas_nodes (
      id, canvas_project_id, node_key, node_type, title, status, media_kind,
      created_by_user_id, updated_by_user_id
    ) VALUES
      ($1,$4,'alpha','image','Alpha','idle','image',$5,$5),
      ($2,$4,'beta','video','Beta','idle','video',$5,$5),
      ($3,$4,'asset-node','image','Asset','idle','image',$5,$5)
  `, [randomUUID(), randomUUID(), randomUUID(), canvasId, userId]);
  const scope: CanvasActorScope = {
    canvasId, ownerUserId: userId, principal: "owner", actorTeamMemberId: null,
    principalKey: `owner:${userId}`,
    capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
  };
  return { userId, canvasId, scope };
}

async function seedStableCanvasArtifactVersion(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  fixture: Awaited<ReturnType<typeof seedCanvas>>,
  input: { nodeKey: string; runId?: string | null; objectName: string },
) {
  const now = new Date("2026-07-25T07:31:30.000Z");
  const storage = await createScopedStorageObject(db, {
    userId: fixture.userId,
    canvasProjectId: fixture.canvasId,
    bucket: "test",
    objectName: input.objectName,
    contentType: "image/png",
    sizeBytes: 4,
    provider: "creator-dev",
    status: "available",
    metadata: {},
    createdByUserId: fixture.userId,
    now,
  });
  const assetId = randomUUID();
  const assetVersionId = randomUUID();
  await db.query(`
    INSERT INTO assets (id,canvas_project_id,asset_type,asset_key,created_by_user_id,created_at,updated_at)
    VALUES ($1,$2,'character_sheet',$3,$4,$5,$5)
  `, [assetId, fixture.canvasId, `canvas-ref-${assetId}`, fixture.userId, now]);
  await db.query(`
    INSERT INTO asset_versions (
      id,asset_id,version_number,storage_object_key,storage_object_id,metadata_json,created_by_user_id,created_at
    ) VALUES ($1,$2,1,$3,$4,'{"mimeType":"image/png"}'::jsonb,$5,$6)
  `, [assetVersionId, assetId, storage.objectKey, storage.id, fixture.userId, now]);
  await appendCanvasNodeArtifact(db, {
    canvasProjectId: fixture.canvasId,
    nodeKey: input.nodeKey,
    runId: input.runId ?? null,
    artifactKind: "image",
    assetId,
    assetVersionId,
    storageObjectId: storage.id,
    url: "https://must-not-enter-payload.example/reference.png",
    selected: true,
    userId: fixture.userId,
    now,
  });
  return { assetId, assetVersionId, storageObjectId: storage.id };
}
