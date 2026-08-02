import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { grantCredits, reserveCredits } from "../../credit-billing/credit-ledger.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { runWithDatabaseContext } from "../../shared/db/dev-db.ts";
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import { upsertQueuedGenerationTaskSnapshot } from "../generation-task-snapshot.service.ts";
import { appendGenerationTaskCreatedOutboxEvent } from "../generation-outbox.service.ts";
import { buildGenerationBullMQJob } from "../generation-bullmq.publisher.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import {
  processGptImageSubmitJob,
  repairFailedGptImageSubmissions,
} from "../gpt-image.worker.ts";

describe("GPT Image submit deadlock recovery", () => {
  it("reconciles a provider failure when the first credit settlement deadlocks", async () => {
    const db = await createMigratedTestDb();

    try {
      await db.query(
        `
          UPDATE ai_model_configs
          SET provider_model = 'gpt-image-2',
              provider_config_json = provider_config_json
                || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb
          WHERE model_code = 'gpt-image-2-cn'
        `,
      );
      const created = await seedWorkerProjectEpisode(db);
      await grantCredits(db, {
        userId: created.userId,
        amount: 100,
        sourceType: "gpt_image_deadlock_recovery_test",
        sourceId: randomUUID(),
        reason: "seed image deadlock recovery credits",
        createdByUserId: created.userId,
        now: new Date("2026-07-31T06:50:00.000Z"),
      });
      const taskSnapshot = {
        kind: "image",
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        prompt: "draw an image that exercises deadlock recovery",
        model: "gpt-image-2-cn",
        parameters: {},
        providerExecutor: "gpt-image-2",
      };
      const workflow = await createWorkflowWithTasks(db, {
        userId: created.userId,
        projectId: created.projectId,
        workflowType: "episode_image_generation",
        inputSnapshot: taskSnapshot,
        tasks: [
          {
            taskType: "episode_generate_image",
            queueName: "generation-submit-image",
            targetEntityType: "episode",
            targetEntityId: created.episodeId,
            inputSnapshot: taskSnapshot,
          },
        ],
      });
      const taskId = workflow.tasks[0]!.id;
      const reservation = await reserveCredits(db, {
        userId: created.userId,
        amount: 77,
        sourceType: "generation_task",
        sourceId: taskId,
        reason: "图片生成预占积分",
        projectId: created.projectId,
        workflowId: workflow.workflow.id,
        taskId,
        createdByUserId: created.userId,
        now: new Date("2026-07-31T06:51:00.000Z"),
      });
      const modelConfig = await db.query<{ id: string }>(
        "SELECT id FROM ai_model_configs WHERE model_code = 'gpt-image-2-cn' LIMIT 1",
      );
      await upsertQueuedGenerationTaskSnapshot(db, {
        projectId: created.projectId,
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        workflowId: workflow.workflow.id,
        taskId,
        modelConfigId: modelConfig.rows[0]!.id,
        creditReservationId: reservation.reservation.id,
        modelCode: "gpt-image-2-cn",
        mediaType: "image",
        taskMode: "image.text_to_image",
        estimatedCredits: 77,
        requestSummary: {},
        creditSummary: { reserved: 77 },
        now: new Date("2026-07-31T06:51:00.000Z"),
      });
      let injectedDeadlock = false;
      const deadlockingDb = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          if (!injectedDeadlock && /FOR UPDATE OF allocation, lot/.test(sql)) {
            injectedDeadlock = true;
            throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
          }
          return db.query<T>(sql, params);
        },
      };
      let notifyProviderRequestStarted!: () => void;
      let releaseProviderResponse!: (response: Response) => void;
      const providerRequestStarted = new Promise<void>((resolve) => {
        notifyProviderRequestStarted = resolve;
      });
      const providerResponse = new Promise<Response>((resolve) => {
        releaseProviderResponse = resolve;
      });
      const fetchImpl = (async () => {
        notifyProviderRequestStarted();
        return providerResponse;
      }) as typeof fetch;
      const submitInput = {
        taskId,
        runtime: {} as UploadSessionRuntime,
        env: {
          NODE_ENV: "test",
          GPT_IMAGE2_PROVIDER_ENABLED: "true",
          GPT_IMAGE2_API_KEY: "gpt-image-test-key",
        },
        fetchImpl,
        now: new Date("2026-07-31T06:56:04.000Z"),
      };

      const interruptedSubmit = processGptImageSubmitJob(deadlockingDb, submitInput);
      await providerRequestStarted;
      const activeRequest = await db.query<{ id: string; attempt_id: string }>(
        `SELECT id, attempt_id FROM provider_requests WHERE task_id = $1`,
        [taskId],
      );
      const staleAttemptId = randomUUID();
      await db.query(
        `
          INSERT INTO task_attempts (
            id, project_id, workflow_id, task_id, attempt_number, status,
            started_at, finished_at, failure_code
          )
          SELECT $2, project_id, workflow_id, id, 2, 'failed', $3, $3, 'stale_attempt_failure'
          FROM tasks
          WHERE id = $1
        `,
        [taskId, staleAttemptId, new Date("2026-07-31T06:55:00.000Z")],
      );
      await db.query(
        `
          UPDATE provider_requests
          SET attempt_id = $2,
              status = 'failed',
              failure_code = 'stale_attempt_failure'
          WHERE id = $1
        `,
        [activeRequest.rows[0]!.id, staleAttemptId],
      );
      assert.deepEqual(
        await processGptImageSubmitJob(db, {
          ...submitInput,
          now: new Date("2026-07-31T06:56:04.500Z"),
        }),
        { status: "skipped" },
      );
      await db.query(
        `
          UPDATE provider_requests
          SET attempt_id = $2,
              status = 'created',
              failure_code = NULL
          WHERE id = $1
        `,
        [activeRequest.rows[0]!.id, activeRequest.rows[0]!.attempt_id],
      );
      releaseProviderResponse(new Response(
        JSON.stringify({ error: { code: "model_unavailable", message: "model unavailable" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ));
      await assert.rejects(
        interruptedSubmit,
        (error) => {
          assert.equal((error as { code?: string }).code, "40P01");
          return true;
        },
      );
      assert.equal(injectedDeadlock, true);
      const interrupted = await db.query<{
        task_status: string;
        snapshot_status: string;
        provider_status: string;
        failure_code: string | null;
        reservation_status: string;
      }>(
        `
          SELECT
            task.status AS task_status,
            snapshot.status AS snapshot_status,
            request.status AS provider_status,
            request.failure_code,
            reservation.status AS reservation_status
          FROM tasks task
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
          JOIN provider_requests request ON request.task_id = task.id
          JOIN credit_reservations reservation ON reservation.task_id = task.id
          WHERE task.id = $1
        `,
        [taskId],
      );
      assert.deepEqual(interrupted.rows[0], {
        task_status: "running",
        snapshot_status: "running",
        provider_status: "failed",
        failure_code: "provider_submission_failed",
        reservation_status: "active",
      });

      let injectedSnapshotFailure = false;
      const snapshotFailingDb = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          if (!injectedSnapshotFailure && /UPDATE ai_generation_task_snapshots\s+SET status = 'failed'/.test(sql)) {
            injectedSnapshotFailure = true;
            throw new Error("snapshot terminal update failed");
          }
          return db.query<T>(sql, params);
        },
      };
      await assert.rejects(
        processGptImageSubmitJob(snapshotFailingDb, {
          ...submitInput,
          now: new Date("2026-07-31T06:56:05.000Z"),
        }),
        /snapshot terminal update failed/,
      );
      const partiallyFinalized = await db.query<{
        task_status: string;
        snapshot_status: string;
        reservation_status: string;
      }>(
        `
          SELECT task.status AS task_status,
                 snapshot.status AS snapshot_status,
                 reservation.status AS reservation_status
          FROM tasks task
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
          JOIN credit_reservations reservation ON reservation.task_id = task.id
          WHERE task.id = $1
        `,
        [taskId],
      );
      assert.equal(injectedSnapshotFailure, true);
      assert.deepEqual(partiallyFinalized.rows[0], {
        task_status: "failed",
        snapshot_status: "running",
        reservation_status: "released",
      });
      const foreignUserId = randomUUID();
      const foreignAssetId = randomUUID();
      await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active')", [
        foreignUserId,
        `13900${foreignUserId.replace(/\D/g, "").padEnd(6, "0").slice(0, 6)}`,
      ]);
      await db.query(
        `
          INSERT INTO team_assets (
            id, admin_user_id, asset_name, asset_category, asset_status,
            resource_type, created_by_name, updated_by_name, created_user_id
          )
          VALUES ($1, $2, 'Foreign asset', 'character', 'active', 'image', 'foreign', 'foreign', $2)
        `,
        [foreignAssetId, foreignUserId],
      );
      await db.query(
        `
          UPDATE tasks
          SET input_snapshot_json = input_snapshot_json
            || jsonb_build_object('targetType', 'team_asset', 'targetId', $2::text)
          WHERE id = $1
        `,
        [taskId, foreignAssetId],
      );
      const repairResult = await repairFailedGptImageSubmissions(db, {
        now: new Date("2026-07-31T06:56:35.500Z"),
        limit: 10,
      });
      const duplicateRetryResult = await processGptImageSubmitJob(db, {
        ...submitInput,
        now: new Date("2026-07-31T06:56:06.000Z"),
      });
      const terminal = await db.query<{
        task_status: string;
        attempt_status: string;
        snapshot_status: string;
        credit_status: string;
        reservation_status: string;
        amount_reserved: number | string;
        amount_released: number | string;
        credit_balance_cached: number | string;
        credit_reserved_cached: number | string;
      }>(
        `
          SELECT
            task.status AS task_status,
            attempt.status AS attempt_status,
            snapshot.status AS snapshot_status,
            snapshot.credit_status,
            reservation.status AS reservation_status,
            reservation.amount_reserved,
            reservation.amount_released,
            account.credit_balance_cached,
            account.credit_reserved_cached
          FROM tasks task
          JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
          JOIN credit_reservations reservation ON reservation.task_id = task.id
          JOIN users account ON account.id = reservation.user_id
          WHERE task.id = $1
        `,
        [taskId],
      );
      const settlementCounts = await db.query<{
        allocation_count: number;
        release_ledger_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int
             FROM credit_reservation_allocations
             WHERE reservation_id = $1) AS allocation_count,
            (SELECT count(*)::int
             FROM credit_ledger_entries
             WHERE reservation_id = $1
               AND entry_type = 'release') AS release_ledger_count
        `,
        [reservation.reservation.id],
      );
      const foreignAsset = await db.query<{ asset_status: string }>(
        "SELECT asset_status FROM team_assets WHERE id = $1",
        [foreignAssetId],
      );

      assert.deepEqual(repairResult, {
        repairedTaskIds: [taskId],
        requeuedTaskIds: [],
        failedTaskIds: [],
      });
      assert.deepEqual(duplicateRetryResult, { status: "skipped" });
      assert.equal(terminal.rows[0]?.task_status, "failed");
      assert.equal(terminal.rows[0]?.attempt_status, "failed");
      assert.equal(terminal.rows[0]?.snapshot_status, "failed");
      assert.equal(terminal.rows[0]?.credit_status, "released");
      assert.equal(terminal.rows[0]?.reservation_status, "released");
      assert.equal(Number(terminal.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(terminal.rows[0]?.amount_released ?? -1), 77);
      assert.equal(Number(terminal.rows[0]?.credit_balance_cached ?? -1), 100);
      assert.equal(Number(terminal.rows[0]?.credit_reserved_cached ?? -1), 0);
      assert.deepEqual(settlementCounts.rows[0], {
        allocation_count: 1,
        release_ledger_count: 1,
      });
      assert.equal(foreignAsset.rows[0]?.asset_status, "active");
    } finally {
      await db.close();
    }
  });

  it("preserves Cumob 429 requeue semantics when the first requeue transaction deadlocks", async () => {
    const db = await createMigratedTestDb();

    try {
      await db.query(
        `
          UPDATE ai_model_configs
          SET provider_protocol = 'cumob_image',
              provider_config_json = provider_config_json
                || '{"baseURL":"https://api.cumob.com","endpoint":"/v1/images/generations","apiKeyEnv":"CUMOB_API_KEY","defaultRequestParams":{"stream":false,"async":false}}'::jsonb
          WHERE model_code = 'cumob-gpt-image-2-pro'
        `,
      );
      const created = await seedWorkerProjectEpisode(db);
      const taskSnapshot = {
        kind: "image",
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        prompt: "draw an image after rate limiting",
        model: "cumob-gpt-image-2-pro",
        parameters: {},
        providerExecutor: "gpt-image-2",
        requestedAt: "2026-07-31T06:50:00.000Z",
        timeoutAt: "2026-07-31T07:50:00.000Z",
      };
      const workflow = await createWorkflowWithTasks(db, {
        userId: created.userId,
        projectId: created.projectId,
        workflowType: "episode_image_generation",
        inputSnapshot: taskSnapshot,
        tasks: [{
          taskType: "episode_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "episode",
          targetEntityId: created.episodeId,
          inputSnapshot: taskSnapshot,
        }],
      });
      const taskId = workflow.tasks[0]!.id;
      const modelConfig = await db.query<{ id: string }>(
        "SELECT id FROM ai_model_configs WHERE model_code = 'cumob-gpt-image-2-pro' LIMIT 1",
      );
      await upsertQueuedGenerationTaskSnapshot(db, {
        projectId: created.projectId,
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        workflowId: workflow.workflow.id,
        taskId,
        modelConfigId: modelConfig.rows[0]!.id,
        creditReservationId: null,
        modelCode: "cumob-gpt-image-2-pro",
        mediaType: "image",
        taskMode: "image.text_to_image",
        estimatedCredits: 0,
        requestSummary: {},
        now: new Date("2026-07-31T06:51:00.000Z"),
      });
      let injectedDeadlock = false;
      const deadlockingDb = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          if (
            !injectedDeadlock
            && /UPDATE provider_requests\s+SET status = 'created'/.test(sql)
          ) {
            injectedDeadlock = true;
            throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
          }
          return db.query<T>(sql, params);
        },
      };
      const submitInput = {
        taskId,
        runtime: {} as UploadSessionRuntime,
        env: {
          NODE_ENV: "test",
          GPT_IMAGE2_PROVIDER_ENABLED: "true",
          CUMOB_API_KEY: "cumob-test-key",
        },
        fetchImpl: (async () => new Response(
          JSON.stringify({ error: { message: "too many requests" } }),
          {
            status: 429,
            headers: { "content-type": "application/json", "retry-after": "30" },
          },
        )) as typeof fetch,
        now: new Date("2026-07-31T06:56:04.000Z"),
      };

      await assert.rejects(
        processGptImageSubmitJob(deadlockingDb, submitInput),
        (error) => {
          assert.equal((error as { code?: string }).code, "40P01");
          return true;
        },
      );
      assert.equal(injectedDeadlock, true);

      let injectedOutboxFailure = false;
      const outboxFailingDb = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          if (!injectedOutboxFailure && /INSERT INTO outbox_events/.test(sql)) {
            injectedOutboxFailure = true;
            throw new Error("delayed outbox write failed");
          }
          return db.query<T>(sql, params);
        },
      };
      const failedRepair = await repairFailedGptImageSubmissions(outboxFailingDb, {
        now: new Date("2026-07-31T06:56:35.000Z"),
        limit: 10,
      });
      const rolledBackState = await db.query<{
        task_status: string;
        attempt_status: string;
        provider_status: string;
      }>(
        `
          SELECT task.status AS task_status,
                 attempt.status AS attempt_status,
                 request.status AS provider_status
          FROM tasks task
          JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
          JOIN provider_requests request ON request.task_id = task.id
          WHERE task.id = $1
        `,
        [taskId],
      );
      assert.equal(injectedOutboxFailure, true);
      assert.deepEqual(failedRepair, {
        repairedTaskIds: [],
        requeuedTaskIds: [],
        failedTaskIds: [taskId],
      });
      assert.deepEqual(rolledBackState.rows[0], {
        task_status: "running",
        attempt_status: "running",
        provider_status: "failed",
      });
      const followerWorkflow = await createWorkflowWithTasks(db, {
        userId: created.userId,
        projectId: created.projectId,
        workflowType: "episode_image_generation",
        inputSnapshot: taskSnapshot,
        tasks: [{
          taskType: "episode_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "episode",
          targetEntityId: created.episodeId,
          inputSnapshot: taskSnapshot,
        }],
      });
      const followerTaskId = followerWorkflow.tasks[0]!.id;
      await upsertQueuedGenerationTaskSnapshot(db, {
        projectId: created.projectId,
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        workflowId: followerWorkflow.workflow.id,
        taskId: followerTaskId,
        modelConfigId: modelConfig.rows[0]!.id,
        creditReservationId: null,
        modelCode: "cumob-gpt-image-2-pro",
        mediaType: "image",
        taskMode: "image.text_to_image",
        estimatedCredits: 0,
        requestSummary: {},
        now: new Date("2026-07-31T06:51:00.000Z"),
      });
      let injectedFollowerDeadlock = false;
      const followerDeadlockingDb = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          if (
            !injectedFollowerDeadlock
            && /UPDATE provider_requests\s+SET status = 'created'/.test(sql)
          ) {
            injectedFollowerDeadlock = true;
            throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
          }
          return db.query<T>(sql, params);
        },
      };
      await assert.rejects(
        processGptImageSubmitJob(followerDeadlockingDb, {
          ...submitInput,
          taskId: followerTaskId,
          now: new Date("2026-07-31T06:56:04.250Z"),
        }),
        (error) => (error as { code?: string }).code === "40P01",
      );
      assert.deepEqual(
        await repairFailedGptImageSubmissions(db, {
          now: new Date("2026-07-31T06:56:35.001Z"),
          limit: 1,
        }),
        { repairedTaskIds: [], requeuedTaskIds: [followerTaskId], failedTaskIds: [] },
      );

      await appendGenerationTaskCreatedOutboxEvent(db, {
        userId: created.userId,
        workflowId: workflow.workflow.id,
        taskId,
        kind: "image",
        modelCode: "cumob-gpt-image-2-pro",
        queueName: "generation-submit-image",
        targetType: "episode",
        targetId: created.episodeId,
        providerExecutor: "gpt-image-2",
        availableAt: new Date("2026-07-31T06:57:05.500Z"),
      });
      await db.query(
        `
          UPDATE outbox_events
          SET status = 'processing'
          WHERE payload_json->>'taskId' = $1
        `,
        [taskId],
      );
      await db.query(
        `
          UPDATE provider_requests
          SET response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb)
            || '{"rateLimitRetryCount":2}'::jsonb
          WHERE task_id = $1
        `,
        [taskId],
      );
      const processingOutboxRepair = await repairFailedGptImageSubmissions(db, {
        now: new Date("2026-07-31T06:57:05.500Z"),
        limit: 10,
      });
      assert.deepEqual(processingOutboxRepair, {
        repairedTaskIds: [],
        requeuedTaskIds: [],
        failedTaskIds: [taskId],
      });
      await db.query(
        `
          UPDATE outbox_events
          SET status = 'pending'
          WHERE payload_json->>'taskId' = $1
            AND status = 'processing'
        `,
        [taskId],
      );
      await db.query(
        "UPDATE tasks SET status = 'result_unknown' WHERE id = $1",
        [taskId],
      );
      await db.query(
        "UPDATE task_attempts SET status = 'result_unknown' WHERE task_id = $1",
        [taskId],
      );
      await db.query(
        "UPDATE ai_generation_task_snapshots SET status = 'result_unknown' WHERE task_id = $1",
        [taskId],
      );

      const concurrentRecoveryResults = await Promise.all([
        runWithDatabaseContext(() => repairFailedGptImageSubmissions(db, {
          now: new Date("2026-07-31T06:57:36.000Z"),
          limit: 10,
        })),
        runWithDatabaseContext(() => repairFailedGptImageSubmissions(db, {
          now: new Date("2026-07-31T06:57:36.000Z"),
          limit: 10,
        })),
      ]);
      const state = await db.query<{
        task_status: string;
        current_attempt_id: string | null;
        attempt_status: string;
        provider_status: string;
        provider_failure_code: string | null;
        retry_available_at: Date | null;
        outbox_id: string;
        dispatch_token: string | null;
        outbox_payload: Record<string, unknown>;
      }>(
        `
          SELECT task.status AS task_status,
                 task.current_attempt_id,
                 attempt.status AS attempt_status,
                 request.status AS provider_status,
                 request.failure_code AS provider_failure_code,
                 outbox.available_at AS retry_available_at,
                 outbox.id AS outbox_id,
                 outbox.payload_json->>'dispatchToken' AS dispatch_token,
                 outbox.payload_json AS outbox_payload
          FROM tasks task
          JOIN task_attempts attempt ON attempt.task_id = task.id
          JOIN provider_requests request ON request.task_id = task.id
          LEFT JOIN outbox_events outbox
            ON outbox.payload_json->>'taskId' = task.id::text
           AND outbox.status = 'pending'
          WHERE task.id = $1
        `,
        [taskId],
      );

      assert.equal(
        concurrentRecoveryResults.flatMap((result) => result.requeuedTaskIds).filter((id) => id === taskId).length,
        1,
      );
      const retryJob = buildGenerationBullMQJob({
        id: state.rows[0]!.outbox_id,
        userId: created.userId,
        eventType: "generation.task.created",
        payload: state.rows[0]!.outbox_payload,
        status: "pending",
        availableAt: state.rows[0]!.retry_available_at!,
        processedAt: null,
        errorMessage: null,
        createdAt: new Date("2026-07-31T06:57:36.000Z"),
        updatedAt: new Date("2026-07-31T06:57:36.000Z"),
      }, loadGenerationQueueConfig({}));
      const { outbox_id: _outboxId, outbox_payload: _outboxPayload, ...stateFields } = state.rows[0]!;
      assert.deepEqual({
        ...stateFields,
        retry_available_at: stateFields.retry_available_at?.toISOString(),
      }, {
        task_status: "queued",
        current_attempt_id: null,
        attempt_status: "canceled",
        provider_status: "created",
        provider_failure_code: null,
        retry_available_at: "2026-07-31T06:57:56.000Z",
        dispatch_token: "cumob-429-repair-3",
      });
      assert.equal(
        retryJob.jobId,
        `generation.task.created__${taskId}__submit__cumob-429-repair-3`,
      );
      assert.equal(retryJob.data.retrySequence, 3);
      assert.equal(retryJob.data.dispatchToken, "cumob-429-repair-3");
    } finally {
      await db.close();
    }
  });
});

async function seedWorkerProjectEpisode(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
) {
  const userId = randomUUID();
  const projectId = randomUUID();
  const episodeId = randomUUID();
  const now = new Date("2026-07-31T06:50:00.000Z");

  await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active')", [
    userId,
    `13800${userId.replace(/\D/g, "").padEnd(6, "0").slice(0, 6)}`,
  ]);
  await db.query(
    `
      INSERT INTO projects (
        id, name, aspect_ratio, resolution, phase,
        owner_user_id, created_by_user_id, created_at, updated_at
      )
      VALUES ($1, 'Deadlock Recovery Project', '9:16', '1080p', 'shot_generation', $2, $2, $3, $3)
    `,
    [projectId, userId, now],
  );
  await db.query(
    `
      INSERT INTO episodes (
        id, project_id, title, sequence, status,
        created_by_user_id, created_at, updated_at
      )
      VALUES ($1, $2, 'Deadlock Recovery Episode', 1, 'draft', $3, $4, $4)
    `,
    [episodeId, projectId, userId, now],
  );

  return { userId, projectId, episodeId };
}
