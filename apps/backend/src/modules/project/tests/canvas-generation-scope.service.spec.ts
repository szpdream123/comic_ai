import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { grantCredits, reserveCredits } from "../../credit-billing/credit-ledger.service.ts";
import { upsertQueuedGenerationTaskSnapshot } from "../../model-gateway/generation-task-snapshot.service.ts";
import { createOrReuseProviderRequest } from "../../model-gateway/provider-request.service.ts";
import { createUserModelRequestLog } from "../../model-gateway/user-model-request-log.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createScopedStorageObject } from "../../storage/storage.service.ts";
import { claimQueuedTask, createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";

describe("canvas generation persistence scope", () => {
  it("persists a complete task scope without creating a project or episode", async () => {
    const db = await createMigratedTestDb();
    const userId = randomUUID();
    const canvasProjectId = randomUUID();
    const now = new Date("2026-07-22T11:00:00.000Z");

    try {
      await db.query("INSERT INTO users (id, status) VALUES ($1, 'active')", [userId]);
      await db.query(
        `
          INSERT INTO creator_canvas_projects (
            id, title, status, server_revision, created_by_user_id, updated_by_user_id,
            created_at, updated_at
          )
          VALUES ($1, '生成测试画布', 'active', 1, $2, $2, $3, $3)
        `,
        [canvasProjectId, userId, now],
      );
      const created = await createWorkflowWithTasks(db, {
        userId,
        projectId: null,
        canvasProjectId,
        workflowType: "image_generation",
        inputSnapshot: { canvasProjectId, nodeKey: "image-node" },
        tasks: [{
          taskType: "generate_image",
          queueName: "image-generation",
          targetEntityType: "canvas",
          targetEntityId: canvasProjectId,
          inputSnapshot: { canvasProjectId, nodeKey: "image-node" },
        }],
      });
      const task = created.tasks[0]!;
      await grantCredits(db, {
        userId,
        amount: 10,
        sourceType: "canvas_test_grant",
        sourceId: randomUUID(),
        reason: "canvas generation test",
        now,
      });
      const credit = await reserveCredits(db, {
        userId,
        amount: 1,
        sourceType: "canvas_generation",
        sourceId: task.id,
        projectId: null,
        canvasProjectId,
        workflowId: created.workflow.id,
        taskId: task.id,
        reason: "canvas generation",
        now,
      });
      const claimed = await claimQueuedTask(db, {
        taskId: task.id,
        workerId: "canvas-test-worker",
        now,
        leaseMs: 30_000,
      });
      assert.ok(claimed);

      await upsertQueuedGenerationTaskSnapshot(db, {
        projectId: null,
        canvasProjectId,
        episodeId: null,
        targetType: "canvas",
        targetId: canvasProjectId,
        workflowId: created.workflow.id,
        taskId: task.id,
        modelConfigId: null,
        modelCode: "canvas-test-model",
        mediaType: "image",
        taskMode: "sync",
        estimatedCredits: 1,
        requestSummary: { canvasProjectId, nodeKey: "image-node" },
        creditReservationId: credit.reservation.id,
        now,
      });
      const provider = await createOrReuseProviderRequest(db, {
        userId,
        projectId: null,
        canvasProjectId,
        workflowId: created.workflow.id,
        taskId: task.id,
        attemptId: claimed.attempt.id,
        providerName: "canvas-test-provider",
        providerOperation: "image_generation",
        requestKey: randomUUID(),
        requestHash: "request-hash",
        payloadRef: `creator://generation/canvas/${canvasProjectId}`,
        payloadHash: "payload-hash",
        redactedPayload: { canvasProjectId },
        now,
      });
      const object = await createScopedStorageObject(db, {
        userId,
        projectId: null,
        canvasProjectId,
        bucket: "canvas-test",
        objectName: "result.png",
        contentType: "image/png",
        now,
      });
      const requestLog = await createUserModelRequestLog(db, {
        providerRequestId: provider.request.id,
        projectId: null,
        canvasProjectId,
        workflowId: created.workflow.id,
        taskId: task.id,
        attemptId: claimed.attempt.id,
        userId,
        providerName: "canvas-test-provider",
        providerOperation: "image_generation",
        modelId: "canvas-test-model",
        providerModel: "canvas-test-model",
        requestKey: randomUUID(),
        requestHash: "request-hash",
        payloadHash: "payload-hash",
        requestBody: { canvasProjectId },
        now,
      });

      const scopes = await db.query<{
        workflow_canvas_id: string | null;
        task_canvas_id: string | null;
        attempt_canvas_id: string | null;
        snapshot_canvas_id: string | null;
        request_canvas_id: string | null;
        object_canvas_id: string | null;
        credit_canvas_id: string | null;
        log_canvas_id: string | null;
      }>(
        `
          SELECT
            workflow.canvas_project_id AS workflow_canvas_id,
            task.canvas_project_id AS task_canvas_id,
            attempt.canvas_project_id AS attempt_canvas_id,
            snapshot.canvas_project_id AS snapshot_canvas_id,
            request.canvas_project_id AS request_canvas_id,
            object.canvas_project_id AS object_canvas_id,
            credit.canvas_project_id AS credit_canvas_id,
            request_log.canvas_project_id AS log_canvas_id
          FROM workflows workflow
          JOIN tasks task ON task.workflow_id = workflow.id
          JOIN task_attempts attempt ON attempt.task_id = task.id
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
          JOIN provider_requests request ON request.task_id = task.id
          JOIN storage_objects object ON object.id = $3
          JOIN credit_reservations credit ON credit.id = $4
          JOIN user_model_request_logs request_log ON request_log.id = $5
          WHERE workflow.id = $1
            AND task.id = $2
            AND workflow.project_id IS NULL
            AND task.project_id IS NULL
            AND attempt.project_id IS NULL
            AND snapshot.project_id IS NULL
            AND snapshot.episode_id IS NULL
            AND request.project_id IS NULL
            AND object.project_id IS NULL
        `,
        [created.workflow.id, task.id, object.id, credit.reservation.id, requestLog.id],
      );
      assert.deepEqual(scopes.rows[0], {
        workflow_canvas_id: canvasProjectId,
        task_canvas_id: canvasProjectId,
        attempt_canvas_id: canvasProjectId,
        snapshot_canvas_id: canvasProjectId,
        request_canvas_id: canvasProjectId,
        object_canvas_id: canvasProjectId,
        credit_canvas_id: canvasProjectId,
        log_canvas_id: canvasProjectId,
      });
      assert.equal(created.workflow.canvasProjectId, canvasProjectId);
      assert.equal(task.canvasProjectId, canvasProjectId);
      assert.equal(provider.request.canvasProjectId, canvasProjectId);
      assert.equal(object.canvasProjectId, canvasProjectId);
      assert.deepEqual((await db.query("SELECT id FROM projects")).rows, []);
      assert.deepEqual((await db.query("SELECT id FROM episodes")).rows, []);
    } finally {
      await db.close();
    }
  });
});
