import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { normalizeCnPhone } from "../../modules/identity/phone-auth.utils.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { signPaymentCallback } from "../../modules/commerce-payment/commerce-payment.service.ts";
import { grantCredits } from "../../modules/credit-billing/credit-ledger.service.ts";
import { createDevDb } from "../../modules/shared/db/dev-db.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import {
  __phoneAuthDevServerTestUtils,
  createPhoneAuthDevServer as createPhoneAuthDevServerBase,
} from "../phone-auth-dev-server.ts";

const loginDbByOrigin = new Map<string, Awaited<ReturnType<typeof createDevDb>>>();

function createPhoneAuthDevServer(
  options?: Parameters<typeof createPhoneAuthDevServerBase>[0],
) {
  const mergedOptions = {
    ...(options ?? {}),
    env: {
      NODE_ENV: "test",
      PAYMENT_PROVIDER_MODE: "local",
      PAYMENT_MERCHANT_ID: "comic-ai-test-merchant",
      ...(options?.env ?? {}),
    },
  };
  const server = createPhoneAuthDevServerBase(mergedOptions);
  const originalListen = server.listen.bind(server);
  server.listen = async (...args) => {
    await originalListen(...args);
    if (options?.db) {
      loginDbByOrigin.set(server.origin, options.db);
    }
  };
  const originalClose = server.close.bind(server);
  server.close = async () => {
    loginDbByOrigin.delete(server.origin);
    await originalClose();
  };
  return server;
}

function fetchEpisodeImageTask(origin: string, episodeId: string, init: RequestInit = {}) {
  const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
  const targetType = String(body.targetType ?? (body.shotId ? "storyboard" : "asset"));
  return fetch(`${origin}/api/generation/image-tasks`, {
    ...init,
    body: JSON.stringify({
      ...body,
      target: {
        kind: targetType === "storyboard" ? "storyboard" : "episode_asset",
        episodeId,
        targetId: body.targetId ?? body.shotId ?? episodeId,
        ...(body.assetType ? { assetType: body.assetType } : {}),
      },
    }),
  });
}

describe("admin ops HTTP routes", { concurrency: false }, () => {
  it("allows replaying a queued generation.task.created job before provider submission", async () => {
    const taskId = "50000000-0000-4000-8000-000000000091";
    const db = {
      async query<T>(sql: string, params: unknown[] = []) {
        assert.match(sql, /FROM tasks task/);
        assert.deepEqual(params, [taskId]);
        return {
          rows: [{
            status: "queued",
            external_submission_started: false,
            pollable_provider_request: false,
          } as T],
        };
      },
    };

    const replayAllowed = await __phoneAuthDevServerTestUtils.validateGenerationQueueReplay(
      db,
      {
        sourceQueueName: "generation-video-submit-r8-test-000",
        sourceJobName: "generation.task.created",
        sourceJobId: `generation.task.created__${taskId}__submit`,
        sourceJobData: { taskId },
      },
    );

    assert.equal(replayAllowed, true);
  });

  it("does not require or impersonate a frontend user for backend admin operations", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const adminCookie = await loginBackendAdmin(server.origin, db, "ops_admin");
      const response = await fetch(
        `${server.origin}/api/admin/ops/tasks/50000000-0000-4000-8000-000000000099/retry`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "backend-admin-without-frontend-user",
            cookie: adminCookie,
          },
          body: JSON.stringify({ reason: "Verify independent backend identity." }),
        },
      );
      const recoveryResponse = await fetch(
        `${server.origin}/api/admin/ops/tasks/recover`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "backend-admin-recovery-without-frontend-user",
            cookie: adminCookie,
          },
          body: JSON.stringify({
            taskId: "50000000-0000-4000-8000-000000000099",
            action: "redispatch",
            reason: "Verify recovery route uses the backend admin identity.",
          }),
        },
      );

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "task_not_found" });
      assert.equal(recoveryResponse.status, 404);
      assert.deepEqual(await recoveryResponse.json(), { error: "task_not_found" });
      assert.equal(
        Number((await db.query("SELECT count(*)::int AS count FROM users")).rows[0]?.count),
        0,
      );
    } finally {
      await server.close();
      await db.close().catch(() => undefined);
    }
  });

  it("requires idempotency keys for billing write routes", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const adminCookie = await login(server.origin, "13800138001");

      const packagesResponse = await fetch(`${server.origin}/api/billing/packages`, {
        headers: { cookie: adminCookie },
      });
      const packages = await packagesResponse.json();
      const packageId = packages.packages[0].id;

      const orderResponse = await fetch(`${server.origin}/api/billing/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ creditPackageId: packageId }),
      });
      const order = await orderResponse.json();

      const seededOrderResponse = await fetch(`${server.origin}/api/billing/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-order-for-missing-intent-key",
          cookie: adminCookie,
        },
        body: JSON.stringify({ creditPackageId: packageId }),
      });
      const seededOrder = await seededOrderResponse.json();
      const intentResponse = await fetch(`${server.origin}/api/billing/payment-intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          orderId: seededOrder.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        }),
      });
      const intent = await intentResponse.json();

      assert.equal(packagesResponse.status, 200);
      assert.equal(orderResponse.status, 400);
      assert.deepEqual(order, { error: "idempotency_key_required" });
      assert.equal(seededOrderResponse.status, 200);
      assert.equal(intentResponse.status, 400);
      assert.deepEqual(intent, { error: "idempotency_key_required" });
    } finally {
      await server.close();
      await db.close().catch(() => undefined);
    }
  });

  it("rejects creator sessions and allows backend admins to inspect ops items", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const creatorCookie = await login(server.origin, "13800138000");
      const adminCookie = await loginBackendAdmin(server.origin, db, "ops_admin");

      const forbidden = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: creatorCookie },
      });
      const forbiddenPayload = await forbidden.json();
      const allowed = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: adminCookie },
      });
      const allowedPayload = await allowed.json();

      assert.equal(forbidden.status, 401);
      assert.deepEqual(forbiddenPayload, {
        error: { code: "admin_unauthenticated", message: "管理员登录已过期，请重新登录。" },
      });
      assert.equal(allowed.status, 200);
      assert.deepEqual(allowedPayload, {
        tasks: [],
        paymentRisks: [],
        paymentIssues: [],
      });
    } finally {
      await server.close();
      await db.close().catch(() => undefined);
    }
  });

  it("requires backend admin sessions for legacy admin ops routes", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const creatorOwnerCookie = await login(server.origin, "13800138001");
      const adminCookie = await loginBackendAdmin(server.origin, db, "ops_admin");

      const creatorOwnerResponse = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: creatorOwnerCookie },
      });
      const creatorOwnerPayload = await creatorOwnerResponse.json();
      const adminResponse = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: adminCookie },
      });
      const adminPayload = await adminResponse.json();

      assert.equal(creatorOwnerResponse.status, 401);
      assert.deepEqual(creatorOwnerPayload, {
        error: { code: "admin_unauthenticated", message: "管理员登录已过期，请重新登录。" },
      });
      assert.equal(adminResponse.status, 200);
      assert.deepEqual(adminPayload, {
        tasks: [],
        paymentRisks: [],
        paymentIssues: [],
      });
    } finally {
      await server.close();
      await db.close().catch(() => undefined);
    }
  });

  it("exposes generation queue health for ops admins", async () => {
    const db = await createMigratedTestDb();
    const queueHealthInputs: Array<{ failedSampleSize?: number } | undefined> = [];
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        REDIS_URL: "redis://127.0.0.1:1/0",
        BULLMQ_QUEUE_PREFIX: "admin-ops-http-test",
      },
      generationQueueHealthService: {
        async inspect(input?: { failedSampleSize?: number }) {
          queueHealthInputs.push(input);
          return {
            status: "unavailable",
            inspectedAt: new Date().toISOString(),
            redis: { status: "unavailable", ping: null, error: "redis_down" },
            queuePrefix: "admin-ops-http-test",
            workersEnabled: false,
            outboxDispatcherEnabled: false,
            queues: [],
          };
        },
        async close() {},
      },
    });

    try {
      await server.listen(0);
      const creatorCookie = await login(server.origin, "13800138000");
      const adminCookie = await loginBackendAdmin(server.origin, db, "ops_admin");

      const forbidden = await fetch(`${server.origin}/api/admin/ops/generation-queues`, {
        headers: { cookie: creatorCookie },
      });
      const forbiddenPayload = await forbidden.json();
      const allowed = await fetch(`${server.origin}/api/admin/ops/generation-queues`, {
        headers: { cookie: adminCookie },
      });
      const allowedPayload = await allowed.json();
      const dashboardAllowed = await fetch(`${server.origin}/api/admin/dashboard/queue-health`, {
        headers: { cookie: adminCookie },
      });
      const dashboardAllowedPayload = await dashboardAllowed.json();
      const forbiddenAgentMetrics = await fetch(`${server.origin}/api/admin/ops/canvas-agent-metrics`, {
        headers: { cookie: creatorCookie },
      });
      const allowedAgentMetrics = await fetch(`${server.origin}/api/admin/ops/canvas-agent-metrics?windowHours=9999`, {
        headers: { cookie: adminCookie },
      });
      const allowedAgentMetricsPayload = await allowedAgentMetrics.json();

      assert.equal(forbidden.status, 401);
      assert.deepEqual(forbiddenPayload, {
        error: { code: "admin_unauthenticated", message: "管理员登录已过期，请重新登录。" },
      });
      assert.equal(allowed.status, 200);
      assert.equal(allowedPayload.status, "unavailable");
      assert.equal(allowedPayload.redis.status, "unavailable");
      assert.equal(allowedPayload.queuePrefix, "admin-ops-http-test");
      assert.deepEqual(allowedPayload.queues, []);
      assert.equal(dashboardAllowed.status, 200);
      assert.equal(dashboardAllowedPayload.status, "unavailable");
      assert.equal(dashboardAllowedPayload.redis.status, "unavailable");
      assert.deepEqual(dashboardAllowedPayload.queues, []);
      assert.equal(queueHealthInputs.some((input) => input?.failedSampleSize === 100), true);
      assert.equal(forbiddenAgentMetrics.status, 401);
      assert.equal(allowedAgentMetrics.status, 200);
      assert.equal(allowedAgentMetricsPayload.windowHours, 720);
      assert.equal(allowedAgentMetricsPayload.summary.totalTasks, 0);
      assert.equal("messages" in allowedAgentMetricsPayload, false);
    } finally {
      await server.close();
      await db.close().catch(() => undefined);
    }
  });

  it("lets ops admins operate BullMQ generation jobs by queue and job id with audit", async () => {
    const db = await createMigratedTestDb();
    await applyGenerationQueueAdminCommandMigration(db);
    const calls: Array<Record<string, unknown>> = [];
    let crashAttempt = 0;
    let recoveredCheckpoint: Record<string, unknown> | null = null;
    const server = createPhoneAuthDevServer({
      db,
      generationQueueJobOpsService: {
        async operate(input: Record<string, unknown>) {
          calls.push(input);
          if (input.jobId === "generation.video.submit:crash-task") {
            const journal = input.journal as {
              load(): Promise<Record<string, unknown>>;
              save(checkpoint: Record<string, unknown>): Promise<void>;
            };
            crashAttempt += 1;
            if (crashAttempt === 1) {
              await journal.save({
                source: {
                  queueName: input.queueName,
                  jobId: input.jobId,
                  jobName: "generation.video.submit",
                  state: "failed",
                  attemptsMade: 3,
                  failedReason: "provider timeout",
                  data: {},
                  options: {},
                },
              });
              throw new Error("simulated_admin_command_crash");
            }
            recoveredCheckpoint = await journal.load();
          }
          return {
            status: 200,
            body: {
              queueName: input.queueName,
              jobId: input.jobId,
              jobName: "generation.video.submit",
              action: input.action,
              previousState: "failed",
              attemptsMade: 3,
              failedReason: "provider timeout",
            },
          };
        },
      },
    });

    try {
      await server.listen(0);
      const creatorCookie = await login(server.origin, "13800138000");
      const adminCookie = await loginBackendAdmin(server.origin, db, "ops_admin");
      const body = {
        queueName: "generation-submit-video",
        jobId: "generation.video.submit:task-1",
        action: "retry",
        reason: "Seedance worker recovered.",
      };

      const forbidden = await fetch(`${server.origin}/api/admin/ops/generation-queues/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-generation-job-forbidden",
          cookie: creatorCookie,
        },
        body: JSON.stringify(body),
      });
      const forbiddenPayload = await forbidden.json();
      const missingIdempotency = await fetch(`${server.origin}/api/admin/ops/generation-queues/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify(body),
      });
      const missingIdempotencyPayload = await missingIdempotency.json();
      const operated = await fetch(`${server.origin}/api/admin/ops/generation-queues/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-generation-job-retry",
          cookie: adminCookie,
        },
        body: JSON.stringify(body),
      });
      const operatedPayload = await operated.json();
      const replay = await fetch(`${server.origin}/api/admin/ops/generation-queues/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-generation-job-retry",
          cookie: adminCookie,
        },
        body: JSON.stringify(body),
      });
      const replayPayload = await replay.json();
      const invalidAction = await fetch(`${server.origin}/api/admin/ops/generation-queues/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-generation-job-invalid-action",
          cookie: adminCookie,
        },
        body: JSON.stringify({ ...body, action: "pause" }),
      });
      const invalidActionPayload = await invalidAction.json();
      const audit = await db.query<{ event_type: string; reason: string | null; metadata_json: Record<string, unknown> }>(
        "SELECT event_type, reason, metadata_json FROM audit_events WHERE event_type = 'admin.ops.generation_queue_job_operated'",
      );

      assert.equal(forbidden.status, 401);
      assert.deepEqual(forbiddenPayload, {
        error: { code: "admin_unauthenticated", message: "管理员登录已过期，请重新登录。" },
      });
      assert.equal(missingIdempotency.status, 400);
      assert.deepEqual(missingIdempotencyPayload, { error: "idempotency_key_required" });
      assert.equal(operated.status, 200);
      assert.equal(replay.status, 200);
      assert.equal(invalidAction.status, 400);
      assert.deepEqual(invalidActionPayload, { error: "generation_queue_job_action_invalid" });
      assert.deepEqual(replayPayload, operatedPayload);
      assert.deepEqual(operatedPayload, {
        queueName: "generation-submit-video",
        jobId: "generation.video.submit:task-1",
        jobName: "generation.video.submit",
        action: "retry",
        previousState: "failed",
        attemptsMade: 3,
        failedReason: "provider timeout",
      });
      assert.equal(calls.length, 1);
      const { journal, ...operationInput } = calls[0] ?? {};
      assert.deepEqual(operationInput, {
        queueName: "generation-submit-video",
        jobId: "generation.video.submit:task-1",
        action: "retry",
      });
      assert.equal(typeof (journal as { load?: unknown }).load, "function");
      assert.equal(typeof (journal as { save?: unknown }).save, "function");
      assert.deepEqual(audit.rows, [
        {
          event_type: "admin.ops.generation_queue_job_operated",
          reason: "Seedance worker recovered.",
          metadata_json: {
            queueName: "generation-submit-video",
            jobId: "generation.video.submit:task-1",
            jobName: "generation.video.submit",
            action: "retry",
            previousState: "failed",
            attemptsMade: 3,
            failedReason: "provider timeout",
            actorAdminAccountId: audit.rows[0]?.metadata_json.actorAdminAccountId,
          },
        },
      ]);

      const crashBody = {
        ...body,
        jobId: "generation.video.submit:crash-task",
      };
      const crashed = await fetch(`${server.origin}/api/admin/ops/generation-queues/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-generation-job-crash-recovery",
          cookie: adminCookie,
        },
        body: JSON.stringify(crashBody),
      });
      const recovered = await fetch(`${server.origin}/api/admin/ops/generation-queues/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-generation-job-crash-recovery",
          cookie: adminCookie,
        },
        body: JSON.stringify(crashBody),
      });
      assert.equal(crashed.status, 500);
      assert.equal(recovered.status, 200);
      assert.equal(
        (recoveredCheckpoint?.source as Record<string, unknown>)?.jobId,
        "generation.video.submit:crash-task",
      );
    } finally {
      await server.close();
    }
  });

  it("lets ops admins request finalize-only generation retries over HTTP", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const creatorCookie = await login(server.origin, "13800138000");
      const ownerCookie = await login(server.origin, "13800138001");
      const adminCookie = await loginBackendAdmin(server.origin, db, "ops_admin");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-finalize-retry-project",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "HTTP finalize retries",
          scriptInput: "Episode 1: Ops retry staged finalization.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const episodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: ownerCookie,
          },
          body: JSON.stringify({ title: "Finalize Retry Episode" }),
        },
      );
      const episodeId = (await episodeResponse.json()).data.episode.id;
      const uploadTask = await createImageGenerationTask(
        server.origin,
        ownerCookie,
        episodeId,
        "http-finalize-retry-upload-task",
      );
      const persistTask = await createImageGenerationTask(
        server.origin,
        ownerCookie,
        episodeId,
        "http-finalize-retry-persist-task",
      );
      const storageTask = await createImageGenerationTask(
        server.origin,
        ownerCookie,
        episodeId,
        "http-finalize-retry-storage-task",
      );

      await markTaskForFinalizeRetry(db, {
        taskId: uploadTask.taskId,
        status: "failed",
        failureCode: "provider_output_upload_failed",
        failure: {
          failureCode: "provider_output_upload_failed",
          providerExecutor: "gpt-image-2",
          storageBucket: "creator-test",
        },
      });
      await markTaskForFinalizeRetry(db, {
        taskId: persistTask.taskId,
        status: "manual_review_required",
        failureCode: "provider_output_persist_failed",
        failure: {
          failureCode: "provider_output_persist_failed",
          providerExecutor: "gpt-image-2",
          storageBucket: "creator-test",
          storageObjectKey: "generations/task/image.png",
        },
      });
      await markTaskForFinalizeRetry(db, {
        taskId: storageTask.taskId,
        status: "failed",
        failureCode: "provider_output_storage_failed",
        failure: {
          failureCode: "provider_output_storage_failed",
          providerExecutor: "gpt-image-2",
          storageBucket: "creator-test",
        },
      });

      const forbidden = await fetch(`${server.origin}/api/admin/ops/tasks/retry-finalize`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-finalize-retry-forbidden",
          cookie: creatorCookie,
        },
        body: JSON.stringify({
          taskId: uploadTask.taskId,
          reason: "Upload outage recovered.",
        }),
      });
      const missingIdempotency = await fetch(`${server.origin}/api/admin/ops/tasks/retry-finalize`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          taskId: uploadTask.taskId,
          reason: "Upload outage recovered.",
        }),
      });
      const retriedFinalize = await fetch(`${server.origin}/api/admin/ops/tasks/retry-finalize`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-finalize-retry-upload",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          taskId: uploadTask.taskId,
          reason: "Upload outage recovered.",
        }),
      });
      const retriedPersist = await fetch(`${server.origin}/api/admin/ops/tasks/retry-persist-asset`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-finalize-retry-persist",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          taskId: persistTask.taskId,
          reason: "Storage object exists; retry DB binding.",
        }),
      });
      const retriedStorage = await fetch(`${server.origin}/api/admin/ops/tasks/retry-finalize`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-finalize-retry-storage",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          taskId: storageTask.taskId,
          reason: "Storage service recovered; retry full result archival.",
        }),
      });
      const retriedFinalizePayload = await retriedFinalize.json();
      const retriedPersistPayload = await retriedPersist.json();
      const retriedStoragePayload = await retriedStorage.json();
      const attempts = await db.query<{ id: string; current_attempt_id: string }>(
        `
          SELECT id::text, current_attempt_id::text
          FROM tasks
          WHERE id = ANY($1::uuid[])
        `,
        [[uploadTask.taskId, persistTask.taskId, storageTask.taskId]],
      );
      const attemptIdByTaskId = new Map(
        attempts.rows.map((row) => [row.id, row.current_attempt_id]),
      );
      const outbox = await db.query<{
        payload_json: {
          attemptId: string;
          taskId: string;
          finalizeMode: string;
          providerExecutor: string;
        };
      }>(
        `
          SELECT payload_json
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
          ORDER BY created_at ASC
        `,
      );

      assert.equal(forbidden.status, 401);
      assert.equal(missingIdempotency.status, 400);
      assert.equal(retriedFinalize.status, 200);
      assert.equal(retriedFinalizePayload.task.id, uploadTask.taskId);
      assert.equal(retriedPersist.status, 200);
      assert.equal(retriedPersistPayload.task.id, persistTask.taskId);
      assert.equal(retriedStorage.status, 200);
      assert.equal(retriedStoragePayload.task.id, storageTask.taskId);
      assert.ok(outbox.rows.every((row) => /^[0-9a-f-]{36}$/i.test(row.payload_json.attemptId)));
      assert.deepEqual(
        outbox.rows.map(({ payload_json: { attemptId: _attemptId, ...payload } }) => payload),
        [
          {
            workflowId: uploadTask.workflowId,
            taskId: uploadTask.taskId,
            attemptId: attemptIdByTaskId.get(uploadTask.taskId),
            mediaType: "image",
            modelCode: "gpt-image-2-cn",
            providerExecutor: "gpt-image-2",
            artifactKind: "image",
            storageBucket: "creator-test",
            finalizeMode: "retry_finalize",
            artifactStage: "fetch",
          },
          {
            workflowId: persistTask.workflowId,
            taskId: persistTask.taskId,
            attemptId: attemptIdByTaskId.get(persistTask.taskId),
            mediaType: "image",
            modelCode: "gpt-image-2-cn",
            providerExecutor: "gpt-image-2",
            artifactKind: "image",
            storageBucket: "creator-test",
            finalizeMode: "retry_persist_asset",
            artifactStage: "persist",
          },
          {
            workflowId: storageTask.workflowId,
            taskId: storageTask.taskId,
            attemptId: attemptIdByTaskId.get(storageTask.taskId),
            mediaType: "image",
            modelCode: "gpt-image-2-cn",
            providerExecutor: "gpt-image-2",
            artifactKind: "image",
            storageBucket: "creator-test",
            finalizeMode: "retry_finalize",
            artifactStage: "fetch",
          },
        ],
      );
    } finally {
      await server.close();
      await db.close().catch(() => undefined);
    }
  });

  it("exposes billing payment risk routes for C10 admin ops review", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138001");
      const adminCookie = await loginBackendAdmin(server.origin, db, "ops_admin");

      const packagesResponse = await fetch(`${server.origin}/api/billing/packages`, {
        headers: { cookie: ownerCookie },
      });
      const packages = await packagesResponse.json();
      const packageId = packages.packages[0].id;

      const orderResponse = await fetch(`${server.origin}/api/billing/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-order-risk",
          cookie: ownerCookie,
        },
        body: JSON.stringify({ creditPackageId: packageId }),
      });
      const order = await orderResponse.json();

      const intentResponse = await fetch(`${server.origin}/api/billing/payment-intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-intent-risk",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          orderId: order.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        }),
      });
      const intent = await intentResponse.json();

      const callbackFacts = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "http-risk-callback",
        merchantOrderNo: intent.paymentIntent.merchantOrderNo,
        providerTradeId: "http-risk-trade",
        eventType: "payment_succeeded" as const,
        amountMinor: Number(intent.paymentIntent.amountMinor) + 1,
        currency: "CNY",
        merchantId: "comic-ai-test-merchant",
      };
      const callbackResponse = await fetch(
        `${server.origin}/api/billing/payment-callback/mock`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...callbackFacts,
            signature: signPaymentCallback(callbackFacts, "dev-payment-secret"),
          }),
        },
      );
      const callback = await callbackResponse.json();
      const opsResponse = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: adminCookie },
      });
      const ops = await opsResponse.json();
      assert.equal(callbackResponse.status, 200, JSON.stringify(callback));
      assert.equal(opsResponse.status, 200, JSON.stringify(ops));
      assert.equal(ops.paymentRisks.length, 1, JSON.stringify({ callback, ops }));
      const riskEventId = ops.paymentRisks[0].id;

      const missingIdempotencyResponse = await fetch(
        `${server.origin}/api/admin/ops/payment-risks/mark-reviewed`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: adminCookie,
          },
          body: JSON.stringify({
            riskEventId,
            reason: "Missing idempotency key should be rejected.",
          }),
        },
      );
      const missingIdempotency = await missingIdempotencyResponse.json();
      const reviewedResponse = await fetch(
        `${server.origin}/api/admin/ops/payment-risks/mark-reviewed`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-risk-reviewed",
            cookie: adminCookie,
          },
          body: JSON.stringify({
            riskEventId,
            reason: "Verified mismatch during callback route test.",
          }),
        },
      );
      const reviewed = await reviewedResponse.json();
      const missingRepairResponse = await fetch(
        `${server.origin}/api/admin/ops/payments/repair-paid-without-credit`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-repair-missing",
            cookie: adminCookie,
          },
          body: JSON.stringify({
            orderId: "91000000-0000-4000-8000-000000000099",
            reason: "Verify route exists for C10.",
          }),
        },
      );
      const missingRepair = await missingRepairResponse.json();

      assert.equal(packagesResponse.status, 200);
      assert.equal(orderResponse.status, 200);
      assert.equal(intentResponse.status, 200);
      assert.equal(callback.riskEvent.riskType, "amount_mismatch");
      assert.equal(missingIdempotencyResponse.status, 400);
      assert.deepEqual(missingIdempotency, { error: "idempotency_key_required" });
      assert.equal(reviewedResponse.status, 200);
      assert.equal(reviewed.risk.status, "reviewed");
      assert.equal(missingRepairResponse.status, 404);
      assert.deepEqual(missingRepair, { error: "payment_issue_not_found" });
    } finally {
      await server.close();
      await db.close().catch(() => undefined);
    }
  });

  it("exposes refund callbacks that require manual payment review", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138001");
      const adminCookie = await loginBackendAdmin(server.origin, db, "ops_admin");

      const packagesResponse = await fetch(`${server.origin}/api/billing/packages`, {
        headers: { cookie: ownerCookie },
      });
      const packages = await packagesResponse.json();
      const packageId = packages.packages[0].id;

      const orderResponse = await fetch(`${server.origin}/api/billing/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-order-refund-review",
          cookie: ownerCookie,
        },
        body: JSON.stringify({ creditPackageId: packageId }),
      });
      const order = await orderResponse.json();

      const intentResponse = await fetch(`${server.origin}/api/billing/payment-intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-intent-refund-review",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          orderId: order.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        }),
      });
      const intent = await intentResponse.json();

      const callbackFacts = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "http-refund-review-callback",
        merchantOrderNo: intent.paymentIntent.merchantOrderNo,
        providerTradeId: "http-refund-review-trade",
        eventType: "refund_succeeded" as const,
        amountMinor: intent.paymentIntent.amountMinor,
        currency: "CNY",
        merchantId: "comic-ai-test-merchant",
      };
      const callbackResponse = await fetch(
        `${server.origin}/api/billing/payment-callback/mock`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...callbackFacts,
            signature: signPaymentCallback(callbackFacts, "dev-payment-secret"),
          }),
        },
      );
      const callback = await callbackResponse.json();
      const opsResponse = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: adminCookie },
      });
      const ops = await opsResponse.json();

      assert.equal(packagesResponse.status, 200);
      assert.equal(orderResponse.status, 200);
      assert.equal(intentResponse.status, 200);
      assert.equal(callbackResponse.status, 200, JSON.stringify(callback));
      assert.equal(callback.riskEvent.riskType, "refund_requires_review");
      assert.equal(opsResponse.status, 200);
      assert.equal(ops.paymentRisks.length, 1);
      assert.equal(ops.paymentRisks[0].riskType, "refund_requires_review");
      assert.equal(
        ops.paymentRisks[0].providerEventId,
        callback.riskEvent.providerEventId,
      );
    } finally {
      await server.close();
      await db.close().catch(() => undefined);
    }
  });
});

async function applyGenerationQueueAdminCommandMigration(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
) {
  const migration = await readFile(
    join(process.cwd(), "packages", "db", "migrations", "20260725-z-generation-queue-admin-commands.sql"),
    "utf8",
  );
  await db.query(migration);
}

async function createImageGenerationTask(
  origin: string,
  cookie: string,
  episodeId: string,
  idempotencyKey: string,
) {
  const response = await fetchEpisodeImageTask(origin, episodeId, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      cookie,
    },
    body: JSON.stringify({
      targetType: "episode",
      targetId: episodeId,
      prompt: "ops staged retry source",
      model: "nano_banana_2",
    }),
  });
  const envelope = await response.json();

  assert.equal(response.status, 200, JSON.stringify(envelope));
  return envelope.data as { taskId: string; workflowId: string };
}

async function markTaskForFinalizeRetry(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    taskId: string;
    status: "failed" | "manual_review_required";
    failureCode: string;
    failure: Record<string, unknown>;
  },
) {
  await db.query(
    `
      UPDATE tasks
      SET status = $2,
          failure_code = $3,
          input_snapshot_json = input_snapshot_json
            || '{"model":"gpt-image-2-cn","providerExecutor":"gpt-image-2"}'::jsonb,
          updated_at = now()
      WHERE id = $1
    `,
    [input.taskId, input.status, input.failureCode],
  );
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET model_code = 'gpt-image-2-cn',
          media_type = 'image',
          task_mode = 'image.generate',
          status = $2,
          progress_stage = $2,
          failure_json = $3::jsonb,
          credit_status = CASE
            WHEN $2 = 'manual_review_required' THEN 'manual_review_required'
            ELSE 'released'
          END,
          failed_at = now(),
          updated_at = now()
      WHERE task_id = $1
    `,
    [input.taskId, input.status, JSON.stringify(input.failure)],
  );
}

async function login(origin: string, phone: string) {
  const fallbackDb = loginDbByOrigin.get(origin) ? null : await createDevDb();
  const db = loginDbByOrigin.get(origin) ?? fallbackDb!;
  try {
    const normalizedPhone = normalizeCnPhone(phone);
    const userId = await ensurePasswordLoginUser(db, normalizedPhone);
    await ensurePaidPersonalTestAccount(db, userId);
    const password = defaultPasswordFromPhone(normalizedPhone);
    const passwordResponse = await fetch(`${origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: normalizedPhone, password }),
    });
    assert.equal(passwordResponse.status, 200);
    return passwordResponse.headers.get("set-cookie") ?? "";
  } finally {
    await fallbackDb?.close();
  }
}

async function ensurePasswordLoginUser(
  db: Awaited<ReturnType<typeof createDevDb>>,
  phone: string,
): Promise<string> {
  const passwordHash = await createUserPasswordHash(defaultPasswordFromPhone(phone));
  const user = await db.query<{ id: string }>(
    `
      INSERT INTO users (id, phone_e164, password_hash, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (phone_e164)
      DO UPDATE SET
        password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
        status = 'active'
      RETURNING id
    `,
    [randomUUID(), phone, passwordHash],
  );
  return user.rows[0]!.id;
}

async function ensurePaidPersonalTestAccount(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.query(
    `
      INSERT INTO user_memberships (
        id, user_id, membership_tier, purchase_at, expires_at,
        gift_credits, status, created_at, updated_at
      ) VALUES ($1, $2, 'professional', $3, $4, 0, 'active', $3, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        membership_tier = EXCLUDED.membership_tier,
        purchase_at = EXCLUDED.purchase_at,
        expires_at = EXCLUDED.expires_at,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
    `,
    [randomUUID(), userId, now, expiresAt],
  );
  await grantCredits(db, {
    userId,
    amount: 10000,
    sourceType: "admin_ops_http_test",
    sourceId: userId,
    reason: "admin ops HTTP test personal account credits",
    now,
  });
}

async function loginBackendAdmin(
  origin: string,
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  role: string,
) {
  const loginName = `ops_admin_${randomUUID().slice(0, 8)}`;
  const password = `Ops-${randomUUID()}-Pwd`;
  await db.query(
    `
      INSERT INTO admin_accounts (
        id, login_name, password_hash, display_name, status, super_admin_slot
      ) VALUES (
        $1,
        $2,
        'plain:' || $3,
        'Ops Admin',
        'active',
        CASE WHEN $4 = 'super_admin' THEN 1 ELSE NULL END
      )
    `,
    [randomUUID(), loginName, password, role],
  );
  await db.query(
    `
      INSERT INTO admin_account_roles (
        id, admin_account_id, role_code
      )
      SELECT $1, id, $3
      FROM admin_accounts
      WHERE login_name = $2
    `,
    [randomUUID(), loginName, role],
  );

  const loginResponse = await fetch(`${origin}/api/admin/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginName, password }),
  });

  assert.equal(loginResponse.status, 200);
  return loginResponse.headers.get("set-cookie") ?? "";
}
