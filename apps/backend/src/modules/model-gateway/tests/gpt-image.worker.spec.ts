import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { normalizeCnPhone } from "../../identity/phone-auth.utils.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../identity/team-account-credentials.service.ts";
import { createPhoneAuthDevServer as createPhoneAuthDevServerBase } from "../../../entrypoints/phone-auth-dev-server.ts";
import { createAssetVersionSnapshot } from "../../project/asset-version-record.service.ts";
import { createDevDb } from "../../shared/db/dev-db.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createScopedStorageObject } from "../../storage/storage.service.ts";
import { grantCredits } from "../../credit-billing/credit-ledger.service.ts";
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import {
  buildGptImageRequestLogBody,
  finalizeGptImageArtifactJob,
  processGptImagePollJob,
  processGptImageSubmitJob,
} from "../gpt-image.worker.ts";
import { upsertQueuedGenerationTaskSnapshot } from "../generation-task-snapshot.service.ts";

const loginDbByOrigin = new Map<string, Awaited<ReturnType<typeof createDevDb>>>();

function createPhoneAuthDevServer(
  options?: Parameters<typeof createPhoneAuthDevServerBase>[0],
) {
  const server = createPhoneAuthDevServerBase(options);
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

describe("GPT Image 2 BullMQ worker service", () => {
  it("records the SanBao image request in the same shape sent upstream", () => {
    const request = buildGptImageRequestLogBody({
      requestBody: {
        prompt: "【@图1】和【@图2】做到一起",
        model: "sanbao-gpt-image2",
        parameters: {
          aspectRatio: "16:9",
          resolution: "2K",
          filePaths: [
            "https://cdn.example.com/reference-1.png",
            "https://cdn.example.com/reference-2.png",
          ],
        },
        targetType: "episode",
      },
      modelConfig: {
        providerProtocol: "san_bao",
        providerConfig: {
          modelVariants: {
            "普通": "gpt-image2",
            "1K": "gpt-image2-1K",
            "2K": "gpt-image2-2K",
            "4K": "gpt-image2-4K",
          },
        },
      },
      providerName: "三宝影像",
      providerOperation: "shot.image.generate",
      providerModel: "gpt-image2",
      requestKey: "sanbao-log-key",
      payloadRef: "creator://sanbao-log",
      payloadHash: "sanbao-log-hash",
    });

    assert.equal(request.requestFormat, "san_bao_image");
    assert.deepEqual(request.requestBody, {
      model: "gpt-image2-2K",
      prompt: "@图片1和@图片2做到一起",
      aspect_ratio: "16:9",
      images: [
        "https://cdn.example.com/reference-1.png",
        "https://cdn.example.com/reference-2.png",
      ],
      quality: "high",
    });
    assert.doesNotMatch(request.requestText, /targetType|parameters/);
  });

  it("preserves the missing SanBao API key error before provider submission", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET status = 'active',
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'sanbao-gpt-image2'
      `,
    );
    const env = {
      NODE_ENV: "test",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
    };
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl: (async () => {
        throw new Error("provider fetch must not be called without SAN_BAO_API_KEY");
      }) as typeof fetch,
      storageRuntime: {} as UploadSessionRuntime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie, "sanbao-missing-api-key");
      const taskResponse = await fetchEpisodeImageTask(server.origin, created.episodeId, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "sanbao-missing-api-key",
          cookie,
        },
        body: JSON.stringify({
          targetType: "episode",
          targetId: created.episodeId,
          prompt: "draw without a configured SanBao key",
          model: "sanbao-gpt-image2",
          parameters: { aspectRatio: "1:1", resolution: "普通" },
        }),
      });
      const task = (await taskResponse.json()).data;

      const submitted = await processGptImageSubmitJob(db, {
        taskId: task.taskId,
        runtime: {} as UploadSessionRuntime,
        env,
        now: new Date("2026-08-07T06:00:00.000Z"),
      });
      const stored = await db.query<{
        request_format: string;
        log_failure_code: string | null;
        provider_status: string;
        provider_failure_code: string | null;
        external_submission_started_at: Date | string | null;
        task_failure_code: string | null;
      }>(
        `
          SELECT logs.request_format,
                 logs.failure_code AS log_failure_code,
                 requests.status AS provider_status,
                 requests.failure_code AS provider_failure_code,
                 requests.external_submission_started_at,
                 tasks.failure_code AS task_failure_code
          FROM user_model_request_logs logs
          JOIN provider_requests requests ON requests.id = logs.provider_request_id
          JOIN tasks ON tasks.id = logs.task_id
          WHERE logs.task_id = $1
        `,
        [task.taskId],
      );

      assert.deepEqual(submitted, { status: "failed", failureCode: "provider_api_key_missing" });
      assert.equal(stored.rows[0]?.request_format, "san_bao_image");
      assert.equal(stored.rows[0]?.log_failure_code, "provider_api_key_missing");
      assert.equal(stored.rows[0]?.provider_status, "created");
      assert.equal(stored.rows[0]?.provider_failure_code, null);
      assert.equal(stored.rows[0]?.external_submission_started_at, null);
      assert.equal(stored.rows[0]?.task_failure_code, "provider_api_key_missing");
    } finally {
      await server.close();
    }
  });

  it("persists SanBao poll ModelError failure codes from the error factory", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET status = 'active',
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'sanbao-gpt-image2'
      `,
    );
    const env = {
      NODE_ENV: "test",
      SAN_BAO_API_KEY: "san-bao-test-key",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
    };
    const fetchImpl = (async (_url, init) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ data: { id: "sanbao-image-poll-error", status: "queued" } }));
      }
      return new Response(JSON.stringify({ error: "insufficient balance" }), {
        status: 402,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: {} as UploadSessionRuntime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie, "sanbao-poll-model-error");
      const taskResponse = await fetchEpisodeImageTask(server.origin, created.episodeId, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "sanbao-poll-model-error",
          cookie,
        },
        body: JSON.stringify({
          targetType: "episode",
          targetId: created.episodeId,
          prompt: "draw a SanBao poll error test image",
          model: "sanbao-gpt-image2",
          parameters: { aspectRatio: "1:1", resolution: "普通" },
        }),
      });
      const task = (await taskResponse.json()).data;

      const submitted = await processGptImageSubmitJob(db, {
        taskId: task.taskId,
        runtime: {} as UploadSessionRuntime,
        env,
        fetchImpl,
        now: new Date("2026-08-07T05:00:00.000Z"),
      });
      const polled = await processGptImagePollJob(db, {
        taskId: task.taskId,
        env,
        fetchImpl,
        now: new Date("2026-08-07T05:00:05.000Z"),
      });
      const stored = await db.query<{
        task_failure_code: string | null;
        provider_failure_code: string | null;
        snapshot_failure_code: string | null;
      }>(
        `
          SELECT t.failure_code AS task_failure_code,
                 pr.failure_code AS provider_failure_code,
                 snapshot.failure_json->>'failureCode' AS snapshot_failure_code
          FROM tasks t
          JOIN provider_requests pr ON pr.task_id = t.id
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = t.id
          WHERE t.id = $1
        `,
        [task.taskId],
      );

      assert.equal(taskResponse.status, 200);
      assert.deepEqual(submitted, { status: "submitted", providerStatus: "waiting" });
      assert.deepEqual(polled, { status: "failed", failureCode: "san_bao_insufficient_balance" });
      assert.equal(stored.rows[0]?.task_failure_code, "san_bao_insufficient_balance");
      assert.equal(stored.rows[0]?.provider_failure_code, "san_bao_insufficient_balance");
      assert.equal(stored.rows[0]?.snapshot_failure_code, "san_bao_insufficient_balance");
    } finally {
      await server.close();
    }
  });

  it("passes the task owner user id to the image submit limiter", async () => {
    const db = await createMigratedTestDb();

    try {
      const created = await seedWorkerProjectEpisode(db, "rate-limit-owner");
      const taskSnapshot = {
        kind: "image",
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        prompt: "draw the rate limited image",
        model: "cumob-gpt-image-2",
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
      const limiterUserIds: Array<string | undefined> = [];

      const result = await processGptImageSubmitJob(db, {
        taskId: workflow.tasks[0]!.id,
        runtime: {} as UploadSessionRuntime,
        env: {},
        rateLimiter: {
          async acquireSubmitPermit(input) {
            limiterUserIds.push(input.userId);
            return { granted: false, retryAfterMs: 1000, reason: "test-submit-limit" };
          },
          async acquirePollPermit() {
            throw new Error("image submit jobs must not acquire poll permits");
          },
          async acquireFinalizePermit() {
            throw new Error("image submit jobs must not acquire finalize permits");
          },
        },
        now: new Date("2026-07-14T05:00:00.000Z"),
      });

      assert.deepEqual(limiterUserIds, [created.userId]);
      assert.deepEqual(result, {
        status: "rate_limited",
        retryAfterMs: 1000,
        reason: "test-submit-limit",
      });
    } finally {
      await db.close();
    }
  });

  it("isolates image submit limiter permits by subaccount", async () => {
    const db = await createMigratedTestDb();

    try {
      const created = await seedWorkerProjectEpisode(db, "rate-limit-subaccount");
      const teamMemberIds = [randomUUID(), randomUUID()];
      const taskIds: string[] = [];

      for (const teamMemberId of teamMemberIds) {
        const taskSnapshot = {
          kind: "image",
          episodeId: created.episodeId,
          targetType: "episode",
          targetId: created.episodeId,
          prompt: "draw the subaccount rate limited image",
          model: "cumob-gpt-image-2",
          parameters: {},
          providerExecutor: "gpt-image-2",
          teamMemberId,
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
        taskIds.push(workflow.tasks[0]!.id);
      }
      const limiterUserIds: Array<string | undefined> = [];
      const rateLimiter = {
        async acquireSubmitPermit(input) {
          limiterUserIds.push(input.userId);
          return { granted: false as const, retryAfterMs: 1000, reason: "test-submit-limit" };
        },
        async acquirePollPermit() {
          throw new Error("image submit jobs must not acquire poll permits");
        },
        async acquireFinalizePermit() {
          throw new Error("image submit jobs must not acquire finalize permits");
        },
      };

      await Promise.all(taskIds.map((taskId) => processGptImageSubmitJob(db, {
        taskId,
        runtime: {} as UploadSessionRuntime,
        env: {},
        rateLimiter,
        now: new Date("2026-07-14T05:10:00.000Z"),
      })));

      assert.deepEqual(
        limiterUserIds.sort(),
        teamMemberIds.map((teamMemberId) => `${created.userId}:member:${teamMemberId}`).sort(),
      );
      assert.equal(new Set(limiterUserIds).size, 2);
    } finally {
      await db.close();
    }
  });

  it("marks the task-center snapshot running while the image provider request is in flight", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
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

    try {
      const created = await seedWorkerProjectEpisode(db, "snapshot-running");
      const taskSnapshot = {
        kind: "image",
        episodeId: created.episodeId,
        targetType: "asset",
        targetId: created.episodeId,
        prompt: "draw the in-flight image",
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
            targetEntityType: "asset",
            targetEntityId: created.episodeId,
            inputSnapshot: taskSnapshot,
          },
        ],
      });
      const taskId = workflow.tasks[0]!.id;
      const modelConfig = await db.query<{ id: string }>(
        "SELECT id FROM ai_model_configs WHERE model_code = 'gpt-image-2-cn' LIMIT 1",
      );
      await upsertQueuedGenerationTaskSnapshot(db, {
        projectId: created.projectId,
        episodeId: created.episodeId,
        targetType: "asset",
        targetId: created.episodeId,
        workflowId: workflow.workflow.id,
        taskId,
        modelConfigId: modelConfig.rows[0]!.id,
        creditReservationId: null,
        modelCode: "gpt-image-2-cn",
        mediaType: "image",
        taskMode: "image.text_to_image",
        estimatedCredits: 77,
        requestSummary: {},
        now: new Date("2026-07-15T04:17:00.000Z"),
      });

      const submitPromise = processGptImageSubmitJob(db, {
        taskId,
        runtime: {} as UploadSessionRuntime,
        env: {
          NODE_ENV: "test",
          GPT_IMAGE2_PROVIDER_ENABLED: "true",
          GPT_IMAGE2_API_KEY: "gpt-image-test-key",
        },
        fetchImpl,
        now: new Date("2026-07-15T04:17:03.000Z"),
      });
      await providerRequestStarted;

      try {
        const inFlight = await db.query<{
          task_status: string;
          snapshot_status: string;
          progress_stage: string;
          progress_percent: number | string;
          started_at: Date | string | null;
        }>(
          `
            SELECT
              task.status AS task_status,
              snapshot.status AS snapshot_status,
              snapshot.progress_stage,
              snapshot.progress_percent,
              snapshot.started_at
            FROM tasks task
            JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
            WHERE task.id = $1
          `,
          [taskId],
        );

        assert.deepEqual(inFlight.rows[0], {
          task_status: "running",
          snapshot_status: "running",
          progress_stage: "running",
          progress_percent: 50,
          started_at: new Date("2026-07-15T04:17:03.000Z"),
        });
      } finally {
        releaseProviderResponse(new Response(
          JSON.stringify({
            data: [{
              b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
            }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ));
        await submitPromise;
      }
    } finally {
      await db.close();
    }
  });

  it("submits, defers finalization, then uploads the generated image to storage, persists the result, and consumes credits", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const providerCalls: Array<{ url: string; body: string }> = [];
    const uploadedBodies: unknown[] = [];
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject(input) {
          uploadedBodies.push(input.body);
          return { eTag: "gpt-image-worker-etag" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      GLOBAL_AI_OPC_API_KEY: "global-ai-opc-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url, init) => {
      const requestUrl = String(url);
      providerCalls.push({
        url: requestUrl,
        body: String(init?.body ?? ""),
      });
      if (requestUrl === "https://provider-artifacts.example.test/project-asset.png") {
        return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
          status: 200,
          headers: { "content-type": "image/png", "content-length": "8" },
        });
      }
      if (requestUrl === "https://changed-provider.example.test/v1/images/generations") {
        return new Response(
          JSON.stringify({
            id: "changed-provider-project-asset",
            status: "succeeded",
            results: [{ url: "https://provider-artifacts.example.test/project-asset.png" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (requestUrl.endsWith("/asset/seedance2/assetUpload")) {
        return new Response("unavailable", { status: 503 });
      }
      return new Response(
        JSON.stringify({
          created: 1_717_200_000,
          data: [
            {
              b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
              revised_prompt: "polished comic panel",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "gpt-image-request-1",
          },
        },
      );
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the second comic image",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "9:16",
              quality: "high",
              moderation: "auto",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;
      const queuedTask = await db.query<{
        input_snapshot_json: Record<string, unknown>;
      }>("SELECT input_snapshot_json FROM tasks WHERE id = $1", [imageTask.taskId]);
      const queuedModelConfigSnapshot = (
        queuedTask.rows[0]?.input_snapshot_json.modelConfigSnapshot as {
          config?: { providerConfig?: Record<string, unknown> };
        } | undefined
      );
      assert.ok(queuedModelConfigSnapshot?.config);
      assert.equal(queuedModelConfigSnapshot?.config?.providerConfig?.apiKey, undefined);
      await db.query(
        `
          UPDATE ai_model_configs
          SET provider_model = 'changed-provider-model',
              provider_protocol = 'cumob_image',
              provider_config_json = '{
                "baseURL":"https://changed-provider.example.test",
                "endpoint":"/v1/images/generations",
                "apiKeyEnv":"GPT_IMAGE2_API_KEY",
                "requestFormat":"cumob_image"
              }'::jsonb,
              updated_at = now()
          WHERE model_code = 'gpt-image-2-cn'
        `,
      );
      const queuedSnapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        estimated_credits: number | string;
        model_code: string;
        media_type: string;
      }>(
        `
          SELECT status, progress_stage, credit_status, estimated_credits, model_code, media_type
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [imageTask.taskId],
      );

      const submitResult = await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:00:00.000Z"),
      });
      const runningTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${imageTask.taskId}`,
        { headers: { cookie } },
      );
      const runningTask = (await runningTaskResponse.json()).data;
      assert.equal(uploadedBodies.length, 0);
      const finalizeResult = await finalizeGptImageArtifactJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:00:05.000Z"),
      });
      const completedTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${imageTask.taskId}`,
        { headers: { cookie } },
      );
      const completedTask = (await completedTaskResponse.json()).data;
      const completedSnapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        result_assets_json: Array<{
          assetId?: string | null;
          assetVersionId?: string | null;
          storageObjectId?: string | null;
          url?: string;
          mediaKind?: string;
        }>;
      }>(
        `
          SELECT status, progress_stage, credit_status, result_assets_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [imageTask.taskId],
      );
      const autoCreatedAssetVersions = await db.query<{ id: string }>(
        `
          SELECT id
          FROM asset_versions
          WHERE source_task_id = $1
        `,
        [imageTask.taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, status FROM credit_reservations WHERE task_id = $1",
        [imageTask.taskId],
      );
      const uploadRecords = await db.query<{
        actor_user_id: string | null;
        actor_display_name: string | null;
        actor_phone_e164: string | null;
        source_action: string;
        status: string;
        public_url: string | null;
        storage_object_id: string | null;
      }>(
        `
          SELECT actor_user_id, actor_display_name, actor_phone_e164, source_action, status, public_url, storage_object_id
          FROM project_upload_records
          WHERE project_id = $1
          ORDER BY created_at DESC
        `,
        [created.projectId],
      );
      const requestLog = await db.query<{
        model_id: string;
        status: string;
        request_text: string | null;
        response_text: string | null;
      }>(
        `
          SELECT model_id, status, request_text, response_text
          FROM user_model_request_logs
          WHERE task_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [imageTask.taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.equal(imageTask.status, "queued");
      assert.deepEqual(queuedSnapshot.rows[0], {
        status: "queued",
        progress_stage: "task_created",
        credit_status: "reserved",
        estimated_credits: 77,
        model_code: "gpt-image-2-cn",
        media_type: "image",
      });
      assert.deepEqual(submitResult, { status: "submitted", providerStatus: "succeeded" });
      assert.equal(providerCalls[0]?.url, "https://image-gateway.example.test/v1/images/generations");
      assert.match(providerCalls[0]?.body ?? "", /gpt-image-2/);
      assert.equal(runningTaskResponse.status, 200);
      assert.equal(runningTask.status, "running");
      assert.deepEqual(finalizeResult, { status: "succeeded" });
      assert.equal(
        providerCalls.some((call) => call.url.endsWith("/asset/seedance2/assetUpload")),
        true,
      );
      assert.equal(uploadedBodies.length, 1);
      assert.equal(uploadedBodies[0] instanceof Uint8Array, true);
      assert.equal(completedTaskResponse.status, 200);
      assert.equal(completedTask.status, "succeeded");
      assert.equal(completedTask.result.mediaKind, "image");
      assert.match(completedTask.result.imageUrl, /platform-storage\.example\.test/);
      assert.equal(completedSnapshot.rows[0]?.status, "succeeded");
      assert.equal(completedSnapshot.rows[0]?.progress_stage, "completed");
      assert.equal(completedSnapshot.rows[0]?.credit_status, "consumed");
      assert.equal(completedSnapshot.rows[0]?.result_assets_json[0]?.mediaKind, "image");
      assert.match(completedSnapshot.rows[0]?.result_assets_json[0]?.url ?? "", /platform-storage\.example\.test/);
      assert.ok(completedSnapshot.rows[0]?.result_assets_json[0]?.storageObjectId);
      assert.equal(completedSnapshot.rows[0]?.result_assets_json[0]?.assetId ?? null, null);
      assert.equal(completedSnapshot.rows[0]?.result_assets_json[0]?.assetVersionId ?? null, null);
      assert.equal(autoCreatedAssetVersions.rows.length, 0);
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 77);
      assert.equal(reservation.rows[0]?.status, "settled");
      assert.equal(uploadRecords.rows.length, 1);
      assert.equal(uploadRecords.rows[0]?.source_action, "generate_image");
      assert.equal(uploadRecords.rows[0]?.status, "uploaded");
      assert.match(uploadRecords.rows[0]?.public_url ?? "", /platform-storage\.example\.test/);
      assert.equal(
        uploadRecords.rows[0]?.storage_object_id,
        completedSnapshot.rows[0]?.result_assets_json[0]?.storageObjectId ?? null,
      );
      assert.ok(uploadRecords.rows[0]?.actor_user_id);
      assert.equal(uploadRecords.rows[0]?.actor_display_name, null);
      assert.equal(uploadRecords.rows[0]?.actor_phone_e164, "13800138000");
      assert.equal(requestLog.rows[0]?.model_id, "gpt-image-2-cn");
      assert.equal(requestLog.rows[0]?.status, "succeeded");
      assert.match(requestLog.rows[0]?.request_text ?? "", /draw the second comic image/);
      assert.match(requestLog.rows[0]?.response_text ?? "", /gpt-image-request-1/);

      const projectAssetResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "gpt-image-worker-project-asset-task",
          cookie,
        },
        body: JSON.stringify({
          target: {
            kind: "project_asset",
            projectId: created.projectId,
            assetType: "character",
            name: "异步生成角色",
          },
          prompt: "draw the project asset image",
          model: "gpt-image-2-cn",
          parameters: { aspectRatio: "1:1", quality: "high" },
        }),
      });
      const projectAssetTask = (await projectAssetResponse.json()).data;
      await processGptImageSubmitJob(db, {
        taskId: projectAssetTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:01:00.000Z"),
      });
      await finalizeGptImageArtifactJob(db, {
        taskId: projectAssetTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:01:05.000Z"),
      });
      const projectAssetVersion = await db.query<{
        asset_id: string;
        storage_object_id: string | null;
        metadata_json: Record<string, unknown>;
      }>(
        `
          SELECT asset_id, storage_object_id, metadata_json
          FROM asset_versions
          WHERE source_task_id = $1
          LIMIT 1
        `,
        [projectAssetTask.taskId],
      );
      assert.equal(projectAssetResponse.status, 200);
      assert.equal(projectAssetVersion.rows[0]?.asset_id, projectAssetTask.asset.id);
      assert.ok(projectAssetVersion.rows[0]?.storage_object_id);
      assert.equal(projectAssetVersion.rows[0]?.metadata_json.generationStatus, "completed");
    } finally {
      await server.close();
    }
  });

  it("records Cumob GPT Image requests using the provider payload format", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_protocol = 'cumob_image',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://api.cumob.com","endpoint":"/v1/images/generations","apiKeyEnv":"CUMOB_API_KEY","defaultRequestParams":{"stream":false,"async":false}}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'cumob-gpt-image-2-pro'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      CUMOB_API_KEY: "cumob-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
    };
    const fetchImpl = (async (_url, _init) => {
      return new Response(
        JSON.stringify({
          id: "cumob-task-1",
          status: "succeeded",
          data: [{ url: "https://cdn.cumob.example/generated.png" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const created = await seedWorkerProjectEpisode(db, "cumob-log-format");
    const taskSnapshot = {
      kind: "image",
      episodeId: created.episodeId,
      targetType: "asset",
      targetId: created.episodeId,
      prompt: "draw the Cumob log format image",
      model: "cumob-gpt-image-2-pro",
      parameters: {
        size: "4K",
        aspectRatio: "2:3",
        quality: "auto",
      },
      providerExecutor: "gpt-image-2",
      requestedAt: "2026-07-07T02:00:00.000Z",
      cost: 77,
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

    const submitResult = await processGptImageSubmitJob(db, {
      taskId,
      runtime,
      env,
      fetchImpl,
      now: new Date("2026-07-07T02:00:00.000Z"),
    });
    const requestLog = await db.query<{
      request_format: string;
      request_body_json: Record<string, unknown>;
      request_text: string | null;
    }>(
      `
        SELECT request_format, request_body_json, request_text
        FROM user_model_request_logs
        WHERE task_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [taskId],
    );

    assert.deepEqual(submitResult, { status: "submitted", providerStatus: "succeeded" });
    assert.deepEqual(requestLog.rows[0]?.request_body_json, {
      model: "gpt-image-2-pro",
      prompt: "draw the Cumob log format image",
      size: "4K",
      aspect_ratio: "2:3",
      quality: "auto",
      stream: false,
      async: true,
    });
    assert.equal(requestLog.rows[0]?.request_format, "cumob_image");
    assert.match(requestLog.rows[0]?.request_text ?? "", /"aspect_ratio": "2:3"/);
    assert.doesNotMatch(requestLog.rows[0]?.request_text ?? "", /targetType/);
  });

  it("requeues a definitive Cumob 429 and safely submits the same task after Retry-After", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_protocol = 'cumob_image',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://api.cumob.com","endpoint":"/v1/images/generations","apiKeyEnv":"CUMOB_API_KEY","defaultRequestParams":{"stream":false,"async":false}}'::jsonb
        WHERE model_code = 'cumob-gpt-image-2-pro'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      CUMOB_API_KEY: "cumob-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
    };
    let providerCalls = 0;
    const fetchImpl = (async () => {
      providerCalls += 1;
      if (providerCalls === 1) {
        return new Response(
          JSON.stringify({ error: { message: "too many requests" } }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": "30",
            },
          },
        );
      }
      return new Response(
        JSON.stringify({
          id: "cumob-after-rate-limit-1",
          status: "succeeded",
          data: [{ url: "https://cdn.cumob.example/generated-after-rate-limit.png" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const created = await seedWorkerProjectEpisode(db, "cumob-rate-limit");
    const taskSnapshot = {
      kind: "image",
      episodeId: created.episodeId,
      targetType: "asset",
      targetId: created.episodeId,
      prompt: "draw after provider rate limiting",
      model: "cumob-gpt-image-2-pro",
      parameters: { size: "2K" },
      providerExecutor: "gpt-image-2",
      requestedAt: "2026-07-21T12:00:00.000Z",
      timeoutAt: "2026-07-21T13:00:00.000Z",
      cost: 77,
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

    const rateLimited = await processGptImageSubmitJob(db, {
      taskId,
      runtime,
      env,
      fetchImpl,
      now: new Date("2026-07-21T12:00:00.000Z"),
    });
    const afterRateLimit = await db.query<{
      status: string;
      attempt_count: number;
      max_attempts: number;
      current_attempt_id: string | null;
    }>("SELECT status, attempt_count, max_attempts, current_attempt_id FROM tasks WHERE id = $1", [taskId]);
    const requestAfterRateLimit = await db.query<{
      status: string;
      external_submission_started_at: Date | null;
      response_redacted_json: { rateLimitRetryCount?: number };
    }>(
      "SELECT status, external_submission_started_at, response_redacted_json FROM provider_requests WHERE task_id = $1",
      [taskId],
    );

    assert.deepEqual(rateLimited, {
      status: "rate_limited",
      retryAfterMs: 30_000,
      reason: "cumob_image_429",
    });
    assert.equal(afterRateLimit.rows[0]?.status, "queued");
    assert.equal(afterRateLimit.rows[0]?.attempt_count, 1);
    assert.equal(afterRateLimit.rows[0]?.max_attempts, 2);
    assert.equal(afterRateLimit.rows[0]?.current_attempt_id, null);
    assert.equal(requestAfterRateLimit.rows[0]?.status, "created");
    assert.equal(requestAfterRateLimit.rows[0]?.external_submission_started_at, null);
    assert.equal(requestAfterRateLimit.rows[0]?.response_redacted_json.rateLimitRetryCount, 1);

    const submitted = await processGptImageSubmitJob(db, {
      taskId,
      runtime,
      env,
      fetchImpl,
      now: new Date("2026-07-21T12:00:30.000Z"),
    });
    const finalTask = await db.query<{ status: string; attempt_count: number; max_attempts: number }>(
      "SELECT status, attempt_count, max_attempts FROM tasks WHERE id = $1",
      [taskId],
    );
    const attempts = await db.query<{ status: string }>(
      "SELECT status FROM task_attempts WHERE task_id = $1 ORDER BY attempt_number",
      [taskId],
    );
    const finalRequest = await db.query<{ status: string; external_request_id: string | null; attempt_id: string | null }>(
      "SELECT status, external_request_id, attempt_id FROM provider_requests WHERE task_id = $1",
      [taskId],
    );
    const currentAttempt = await db.query<{ current_attempt_id: string | null }>(
      "SELECT current_attempt_id FROM tasks WHERE id = $1",
      [taskId],
    );

    assert.deepEqual(submitted, { status: "submitted", providerStatus: "succeeded" });
    assert.equal(providerCalls, 2);
    assert.equal(finalTask.rows[0]?.status, "running");
    assert.equal(finalTask.rows[0]?.attempt_count, 2);
    assert.equal(finalTask.rows[0]?.max_attempts, 2);
    assert.deepEqual(attempts.rows.map((attempt) => attempt.status), ["canceled", "running"]);
    assert.equal(finalRequest.rows[0]?.status, "succeeded");
    assert.equal(finalRequest.rows[0]?.external_request_id, "cumob-after-rate-limit-1");
    assert.equal(finalRequest.rows[0]?.attempt_id, currentAttempt.rows[0]?.current_attempt_id);
  });

  it("keeps Cumob tasks polling when submission returns a task id without an image artifact", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_protocol = 'cumob_image',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://api.cumob.com","endpoint":"/v1/images/generations","apiKeyEnv":"CUMOB_API_KEY","defaultRequestParams":{"stream":false,"async":false}}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'cumob-gpt-image-2-pro'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      CUMOB_API_KEY: "cumob-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
    };
    const fetchImpl = (async () => new Response(
      JSON.stringify({
        id: "cumob-succeeded-without-artifact-1",
        status: "succeeded",
        progress: 100,
        data: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138016");
      const created = await createProjectAndEpisode(server.origin, cookie, "cumob-running-result-project");
      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "cumob-running-result-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the Cumob pending image",
            model: "cumob-gpt-image-2-pro",
            parameters: {
              size: "2K",
              stream: true,
              async: true,
              webhook: "https://example.com/unsafe-callback",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;

      const submitResult = await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-07-21T12:00:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [imageTask.taskId],
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE task_id = $1 LIMIT 1",
        [imageTask.taskId],
      );
      const providerRequest = await db.query<{ status: string; failure_code: string | null; external_request_id: string | null }>(
        "SELECT status, failure_code, external_request_id FROM provider_requests WHERE task_id = $1",
        [imageTask.taskId],
      );
      const snapshot = await db.query<{ status: string; credit_status: string; failure_json: { failureCode?: string } | null }>(
        "SELECT status, credit_status, failure_json FROM ai_generation_task_snapshots WHERE task_id = $1",
        [imageTask.taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, amount_released, status FROM credit_reservations WHERE task_id = $1",
        [imageTask.taskId],
      );
      const requestLog = await db.query<{ request_body_json: Record<string, unknown> }>(
        "SELECT request_body_json FROM user_model_request_logs WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1",
        [imageTask.taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.deepEqual(submitResult, { status: "submitted", providerStatus: "succeeded" });
      assert.equal(task.rows[0]?.status, "running");
      assert.equal(task.rows[0]?.failure_code, null);
      assert.equal(attempt.rows[0]?.status, "running");
      assert.equal(providerRequest.rows[0]?.status, "succeeded");
      assert.equal(providerRequest.rows[0]?.failure_code, null);
      assert.equal(providerRequest.rows[0]?.external_request_id, "cumob-succeeded-without-artifact-1");
      assert.equal(snapshot.rows[0]?.status, "running");
      assert.equal(snapshot.rows[0]?.credit_status, "reserved");
      assert.equal(snapshot.rows[0]?.failure_json, null);
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 77);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 0);
      assert.equal(reservation.rows[0]?.status, "active");
      assert.equal(requestLog.rows[0]?.request_body_json.stream, false);
      assert.equal(requestLog.rows[0]?.request_body_json.async, true);
      assert.equal("webhook" in (requestLog.rows[0]?.request_body_json ?? {}), false);
    } finally {
      await server.close();
    }
  });

  it("records GPT Image requests before provider adapter preparation can fail", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
    };

    try {
      const created = await seedWorkerProjectEpisode(db, "pre-provider-log");
      const taskSnapshot = {
        kind: "image",
        episodeId: created.episodeId,
        targetType: "asset",
        targetId: created.episodeId,
        prompt: "draw the pre provider failure image",
        model: "gpt-image-2-cn",
        parameters: {
          aspectRatio: "16:9",
          quality: "high",
        },
        providerExecutor: "gpt-image-2",
        requestedAt: "2026-07-08T01:00:00.000Z",
        cost: 77,
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
            targetEntityType: "asset",
            targetEntityId: created.episodeId,
            inputSnapshot: taskSnapshot,
          },
        ],
      });
      const taskId = workflow.tasks[0]!.id;
      const modelConfig = await db.query<{ id: string }>(
        "SELECT id FROM ai_model_configs WHERE model_code = 'gpt-image-2-cn' LIMIT 1",
      );
      await upsertQueuedGenerationTaskSnapshot(db, {
        projectId: created.projectId,
        episodeId: created.episodeId,
        targetType: "asset",
        targetId: created.episodeId,
        workflowId: workflow.workflow.id,
        taskId,
        modelConfigId: modelConfig.rows[0]!.id,
        creditReservationId: null,
        modelCode: "gpt-image-2-cn",
        mediaType: "image",
        taskMode: "image.text_to_image",
        estimatedCredits: 77,
        requestSummary: {},
        creditSummary: { reserved: 77 },
        now: new Date("2026-07-08T01:00:00.000Z"),
      });

      const submitResult = await processGptImageSubmitJob(db, {
        taskId,
        runtime,
        env,
        now: new Date("2026-07-08T01:05:00.000Z"),
      });
      const providerRequest = await db.query<{
        status: string;
        external_submission_started_at: Date | string | null;
      }>(
        `
          SELECT status, external_submission_started_at
          FROM provider_requests
          WHERE task_id = $1
        `,
        [taskId],
      );
      const requestLog = await db.query<{
        status: string;
        failure_code: string | null;
        request_text: string | null;
        completed_at: Date | string | null;
      }>(
        `
          SELECT status, failure_code, request_text, completed_at
          FROM user_model_request_logs
          WHERE task_id = $1
        `,
        [taskId],
      );

      assert.deepEqual(submitResult, { status: "failed", failureCode: "provider_api_key_missing" });
      assert.equal(providerRequest.rows.length, 1);
      assert.equal(providerRequest.rows[0]?.status, "created");
      assert.equal(providerRequest.rows[0]?.external_submission_started_at, null);
      assert.equal(requestLog.rows.length, 1);
      assert.equal(requestLog.rows[0]?.status, "failed");
      assert.equal(requestLog.rows[0]?.failure_code, "provider_api_key_missing");
      assert.match(requestLog.rows[0]?.request_text ?? "", /draw the pre provider failure image/);
      assert.ok(requestLog.rows[0]?.completed_at);
    } finally {
      await db.close();
    }
  });

  it("retries image download and upload with a fresh bounded byte buffer", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY","resultFormat":"url"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const providerImageUrl = "https://image-gateway.example.test/content/generated-image";
    let artifactDownloadAttempts = 0;
    const artifactDownloadSignals: Array<AbortSignal | null | undefined> = [];
    const uploadInputs: Array<{
      body: unknown;
      contentLength: number | null | undefined;
      contentType: string | null | undefined;
    }> = [];
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
          async putObject(input) {
            uploadInputs.push({
              body: input.body,
              contentLength: input.contentLength,
              contentType: input.contentType,
            });
            if (uploadInputs.length === 1) {
              throw new Error("temporary storage upload failure");
            }
            return { eTag: "gpt-image-worker-url-etag" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url, init) => {
      if (String(url) === providerImageUrl) {
        artifactDownloadAttempts += 1;
        artifactDownloadSignals.push(init?.signal);
        if (artifactDownloadAttempts === 1) {
          throw new Error("temporary image CDN failure");
        }
        return new Response(new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70]), {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
          },
        });
      }
      return new Response(
        JSON.stringify({
          created: 1_717_200_000,
          data: [
            {
              url: providerImageUrl,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "gpt-image-request-url-1",
          },
        },
      );
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-url-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the chunked image result",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "16:9",
              quality: "1080p",
              responseFormat: "url",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;

      const submitResult = await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-30T09:08:40.000Z"),
      });
      const finalizeResult = await finalizeGptImageArtifactJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-30T09:08:45.000Z"),
      });
      const storedObject = await db.query<{
        status: string;
        content_type: string;
        size_bytes: number | string | null;
      }>(
        `
          SELECT status, content_type, size_bytes
          FROM storage_objects
          WHERE metadata_json->>'taskId' = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [imageTask.taskId],
      );
      const storedObjectCount = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM storage_objects
          WHERE metadata_json->>'taskId' = $1
        `,
        [imageTask.taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.deepEqual(submitResult, { status: "submitted", providerStatus: "succeeded" });
      assert.deepEqual(finalizeResult, { status: "succeeded" });
      assert.equal(artifactDownloadAttempts, 3);
      assert.ok(artifactDownloadSignals.every((signal) => signal instanceof AbortSignal));
      assert.equal(uploadInputs.length, 2);
      assert.equal(new Set(uploadInputs.map((entry) => entry.objectKey)).size, 1);
      assert.equal(storedObjectCount.rows[0]?.count, 1);
      assert.ok(uploadInputs.every((entry) => entry.contentLength === 8));
      assert.ok(uploadInputs.every((entry) => entry.contentType === "image/jpeg"));
      assert.ok(uploadInputs.every((entry) => entry.body instanceof Uint8Array));
      assert.equal(storedObject.rows[0]?.status, "available");
      assert.equal(storedObject.rows[0]?.content_type, "image/jpeg");
      assert.equal(Number(storedObject.rows[0]?.size_bytes ?? -1), 8);
    } finally {
      await server.close();
    }
  });

  it("keeps image finalization retryable when the uploaded storage object is still zero bytes", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY","resultFormat":"url"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const providerImageUrl = "https://image-gateway.example.test/content/generated-image";
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "gpt-image-worker-empty-etag" };
        },
        async headObject() {
          return {
            exists: true,
            contentType: "image/jpeg",
            contentLength: 0,
            eTag: "d41d8cd98f00b204e9800998ecf8427e",
          };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url) => {
      if (String(url) === providerImageUrl) {
        return new Response(new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70]), {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
          },
        });
      }
      return new Response(
        JSON.stringify({
          created: 1_717_200_000,
          data: [
            {
              url: providerImageUrl,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "gpt-image-request-empty-1",
          },
        },
      );
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-empty-upload-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the empty uploaded image result",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "16:9",
              quality: "1080p",
              responseFormat: "url",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;

      const submitResult = await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-30T09:18:40.000Z"),
      });
      await assert.rejects(
        finalizeGptImageArtifactJob(db, {
          taskId: imageTask.taskId,
          runtime,
          env,
          fetchImpl,
          now: new Date("2026-06-30T09:18:45.000Z"),
        }),
        (error: unknown) => (
          error instanceof Error
          && (error as Error & { failureCode?: string }).failureCode === "provider_output_upload_failed"
        ),
      );
      const taskRow = await db.query<{
        status: string;
        failure_code: string | null;
      }>(
        `
          SELECT status, failure_code
          FROM tasks
          WHERE id = $1
        `,
        [imageTask.taskId],
      );
      const snapshot = await db.query<{
        status: string;
        progress_stage: string | null;
        failure_json: { failureCode?: string; displayMessage?: string } | null;
      }>(
        `
          SELECT status, progress_stage, failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
          LIMIT 1
        `,
        [imageTask.taskId],
      );
      const reservation = await db.query<{
        status: string;
        amount_consumed: number | string;
        amount_released: number | string;
      }>(
        "SELECT status, amount_consumed, amount_released FROM credit_reservations WHERE task_id = $1",
        [imageTask.taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.deepEqual(submitResult, { status: "submitted", providerStatus: "succeeded" });
      assert.equal(taskRow.rows[0]?.status, "running");
      assert.equal(taskRow.rows[0]?.failure_code, null);
      assert.equal(snapshot.rows[0]?.status, "running");
      assert.equal(snapshot.rows[0]?.progress_stage, "asset_transfer_retry_pending");
      assert.equal(snapshot.rows[0]?.failure_json, null);
      assert.equal(reservation.rows[0]?.status, "active");
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 0);
    } finally {
      await server.close();
    }
  });

  it("resolves referenceAssetVersionIds into GPT Image 2 edits multipart references", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","editEndpoint":"/v1/images/edits","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const providerCalls: Array<{ url: string; body: BodyInit | null | undefined }> = [];
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "gpt-image-worker-edit-etag" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl.startsWith("https://platform-storage.example.test/")) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": "4",
          },
        });
      }
      providerCalls.push({
        url: requestUrl,
        body: init?.body,
      });
      return new Response(
        JSON.stringify({
          created: 1_717_200_001,
          data: [
            {
              b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "gpt-image-edit-request-1",
          },
        },
      );
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const projectScope = await db.query<{
        owner_user_id: string;
      }>(
        "SELECT owner_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const storageObject = await createScopedStorageObject(db, {
        userId: projectScope.rows[0]!.owner_user_id,
        projectId: created.projectId,
        bucket: runtime.bucket,
        objectName: "references/hero.png",
        contentType: "image/png",
        sizeBytes: 4,
        provider: runtime.provider,
        status: "available",
        metadata: { label: "hero reference" },
        createdByUserId: projectScope.rows[0]!.owner_user_id,
        now: new Date("2026-06-03T04:05:00.000Z"),
      });
      const referenceVersion = await createAssetVersionSnapshot(db, {
        projectId: created.projectId,
        assetType: "character_sheet",
        assetKey: "hero-reference",
        createdByUserId: projectScope.rows[0]!.owner_user_id,
        storageObjectId: storageObject.id,
        storageObjectKey: storageObject.objectKey,
        metadata: {
          mimeType: "image/png",
          label: "hero reference",
          previewUrl: `https://platform-storage.example.test/${storageObject.objectKey}`,
        },
        sourceTaskId: null,
        sourceAttemptId: null,
        now: new Date("2026-06-03T04:05:01.000Z"),
      });
      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the same hero in a new panel",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: [referenceVersion.version.id],
            parameters: {
              aspectRatio: "9:16",
              quality: "high",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;

      const submitResult = await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:06:00.000Z"),
      });

      assert.equal(imageTaskResponse.status, 200);
      assert.deepEqual(submitResult, { status: "submitted", providerStatus: "succeeded" });
      assert.equal(providerCalls[0]?.url, "https://image-gateway.example.test/v1/images/edits");
      assert.equal(providerCalls[0]?.body instanceof FormData, true);
      assert.equal((providerCalls[0]?.body as FormData).getAll("image[]").length, 1);
      assert.equal((providerCalls[0]?.body as FormData).get("n"), "1");
      assert.equal((providerCalls[0]?.body as FormData).get("size"), "1024x1536");
      assert.equal((providerCalls[0]?.body as FormData).get("quality"), "high");
      assert.equal((providerCalls[0]?.body as FormData).get("moderation"), null);
    } finally {
      await server.close();
    }
  });

  it("keeps GPT Image 2 finalization storage-only instead of auto-persisting an asset version", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "gpt-image-worker-etag" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async () => new Response(
      JSON.stringify({
        data: [
          {
            b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138011");
      const created = await createProjectAndEpisode(server.origin, cookie, "gpt-image-persist-failure-project");
      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-persist-failure-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the second comic image",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "9:16",
              quality: "high",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;
      await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:30:00.000Z"),
      });
      await db.query(
        `
          UPDATE tasks
          SET input_snapshot_json = input_snapshot_json || $2::jsonb
          WHERE id = $1
        `,
        [
          imageTask.taskId,
          JSON.stringify({ targetType: "asset", assetType: "role" }),
        ],
      );

      const finalizeResult = await finalizeGptImageArtifactJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:31:00.000Z"),
      });
      const snapshot = await db.query<{
        status: string;
        credit_status: string;
        failure_json: { failureCode?: string; noticeType?: string; storageObjectKey?: string } | null;
        result_assets_json: Array<{
          assetId?: string | null;
          assetVersionId?: string | null;
          storageObjectId?: string | null;
          url?: string;
        }>;
      }>(
        `
          SELECT status, credit_status, failure_json, result_assets_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [imageTask.taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, amount_released, status FROM credit_reservations WHERE task_id = $1",
        [imageTask.taskId],
      );
      const autoCreatedAssetVersions = await db.query<{ id: string }>(
        `
          SELECT id
          FROM asset_versions
          WHERE source_task_id = $1
        `,
        [imageTask.taskId],
      );

      assert.deepEqual(finalizeResult, { status: "succeeded" });
      assert.equal(snapshot.rows[0]?.status, "succeeded");
      assert.equal(snapshot.rows[0]?.credit_status, "consumed");
      assert.equal(snapshot.rows[0]?.failure_json, null);
      assert.ok(snapshot.rows[0]?.result_assets_json[0]?.storageObjectId);
      assert.match(snapshot.rows[0]?.result_assets_json[0]?.url ?? "", /platform-storage\.example\.test/);
      assert.equal(snapshot.rows[0]?.result_assets_json[0]?.assetId ?? null, null);
      assert.equal(snapshot.rows[0]?.result_assets_json[0]?.assetVersionId ?? null, null);
      assert.equal(autoCreatedAssetVersions.rows.length, 0);
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 77);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 0);
      assert.equal(reservation.rows[0]?.status, "settled");
    } finally {
      await server.close();
    }
  });

  it("waits ten minutes without polling when provider submission has no external id", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
    };
    const fetchImpl = (async () => {
      throw new Error("provider socket closed after submit");
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138012");
      const created = await createProjectAndEpisode(server.origin, cookie, "gpt-image-submit-ambiguous-project");
      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-submit-ambiguous-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the ambiguous provider result",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "9:16",
              quality: "high",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;

      const submitResult = await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:35:00.000Z"),
      });
      const snapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        failure_json: { failureCode?: string; errorMessage?: string } | null;
      }>(
        `
          SELECT status, progress_stage, credit_status, failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [imageTask.taskId],
      );
      const providerRequest = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE task_id = $1",
        [imageTask.taskId],
      );
      const task = await db.query<{
        status: string;
        locked_until: Date | string | null;
        requested_at: string | null;
        timeout_at: string | null;
      }>(
        `
          SELECT
            status,
            locked_until,
            input_snapshot_json->>'requestedAt' AS requested_at,
            input_snapshot_json->>'timeoutAt' AS timeout_at
          FROM tasks
          WHERE id = $1
        `,
        [imageTask.taskId],
      );
      const requestLog = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM user_model_request_logs WHERE task_id = $1",
        [imageTask.taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.deepEqual(submitResult, { status: "skipped", nextAction: "stop" });
      assert.equal(providerRequest.rows[0]?.status, "result_unknown");
      assert.equal(providerRequest.rows[0]?.failure_code, "provider_submission_ambiguous");
      assert.equal(task.rows[0]?.status, "running");
      assert.equal(snapshot.rows[0]?.status, "running");
      assert.equal(snapshot.rows[0]?.progress_stage, "provider_result_unknown");
      assert.equal(snapshot.rows[0]?.credit_status, "reserved");
      assert.equal(snapshot.rows[0]?.failure_json, null);
      assert.equal(requestLog.rows[0]?.status, "submitted");
      assert.equal(requestLog.rows[0]?.failure_code, null);
      assert.equal(
        new Date(task.rows[0]?.timeout_at ?? 0).getTime() - new Date(task.rows[0]?.requested_at ?? 0).getTime(),
        60 * 60 * 1000,
      );
      assert.equal(
        new Date(task.rows[0]?.locked_until ?? 0).getTime(),
        new Date("2026-06-03T04:45:00.000Z").getTime(),
      );
    } finally {
      await server.close();
    }
  });

  it("refunds team member credits when GPT Image 2 submit fails in the worker", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
    };
    const fetchImpl = (async () => new Response(
      JSON.stringify({ error: { message: "image_url must be a publicly reachable http or https URL" } }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    )) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      seedTeamEntitlements: true,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, ownerCookie);
      const projectScope = await db.query<{ created_by_user_id: string }>(
        "SELECT created_by_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const memberId = randomUUID();
      await db.query(
        `
          INSERT INTO team_members (
            id,
            user_id,
            member_account,
            member_account_suffix,
            member_login_account,
            member_name,
            member_password_hash,
            member_credits,
            status
          )
          VALUES ($1, $2, 'worker_refund_member', 'worker', 'worker_refund_member@worker', 'Worker Refund Member', $3, 0, 'active')
        `,
        [memberId, projectScope.rows[0]!.created_by_user_id, await createUserPasswordHash("worker-refund-secret")],
      );
      const taskSnapshot = {
        kind: "image",
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        prompt: "draw the team member refund image",
        model: "gpt-image-2-cn",
        parameters: {
          aspectRatio: "9:16",
          quality: "high",
        },
        providerExecutor: "gpt-image-2",
        requestedAt: "2026-06-30T13:00:00.000Z",
        cost: 77,
        teamMemberId: memberId,
      };
      const workflow = await createWorkflowWithTasks(db, {
        userId: projectScope.rows[0]!.created_by_user_id,
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
        creditReservationId: null,
        modelCode: "gpt-image-2-cn",
        mediaType: "image",
        taskMode: "image.text_to_image",
        estimatedCredits: 77,
        requestSummary: {},
        creditSummary: { reserved: 77 },
        now: new Date("2026-06-30T13:00:00.000Z"),
      });

      const submitResult = await processGptImageSubmitJob(db, {
        taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-30T13:05:00.000Z"),
      });
      const member = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [memberId],
      );
      const refundLedger = await db.query<{ amount: number | string; source_type: string; balance_after: number | string }>(
        `
          SELECT amount, source_type, balance_after
          FROM credit_ledger_entries
          WHERE source_type = 'team_member_generation_refund'
            AND source_id = $1
        `,
        [taskId],
      );
      const requestLog = await db.query<{
        status: string;
        failure_code: string | null;
        request_text: string | null;
        response_text: string | null;
      }>(
        `
          SELECT status, failure_code, request_text, response_text
          FROM user_model_request_logs
          WHERE task_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [taskId],
      );
      const snapshot = await db.query<{
        failure_json: { failureCode?: string; displayMessage?: string } | null;
      }>(
        `
          SELECT failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [taskId],
      );
      const taskResponse = await fetch(`${server.origin}/api/generation-tasks/${taskId}`, {
        headers: { cookie: ownerCookie },
      });
      const taskEnvelope = await taskResponse.json();

      assert.deepEqual(submitResult, { status: "failed", failureCode: "provider_failed" });
      assert.equal(Number(member.rows[0]?.member_credits ?? -1), 77);
      assert.equal(Number(refundLedger.rows[0]?.amount ?? -1), 77);
      assert.equal(Number(refundLedger.rows[0]?.balance_after ?? -1), 77);
      assert.equal(requestLog.rows[0]?.status, "failed");
      assert.equal(requestLog.rows[0]?.failure_code, "provider_failed");
      assert.match(requestLog.rows[0]?.request_text ?? "", /draw the team member refund image/);
      assert.match(requestLog.rows[0]?.response_text ?? "", /本地图片无法解析，请上传公网图片/);
      assert.equal(snapshot.rows[0]?.failure_json?.failureCode, "provider_failed");
      assert.equal(snapshot.rows[0]?.failure_json?.displayMessage, "本地图片无法解析，请上传公网图片。");
      assert.equal(taskResponse.status, 200);
      assert.equal(taskEnvelope.data.failure.code, "model_reference_url_not_public");
      assert.equal(taskEnvelope.data.failure.failureCode, "provider_failed");
      assert.equal(taskEnvelope.data.failure.displayMessage, "本地图片无法解析，请上传公网图片。");
      assert.doesNotMatch(
        JSON.stringify(taskEnvelope.data.failure),
        /providerRawResponse|responseBodyPreview|image_url must be/i,
      );
    } finally {
      await server.close();
    }
  });

  it("rejects GPT Image 2 reference asset versions over the configured maxReferences limit", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET limits_json = limits_json || '{"maxReferences":1}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const projectScope = await db.query<{
        owner_user_id: string;
      }>(
        "SELECT owner_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const referenceVersionIds = [];
      for (const index of [1, 2]) {
        const storageObject = await createScopedStorageObject(db, {
          userId: projectScope.rows[0]!.owner_user_id,
          projectId: created.projectId,
          bucket: runtime.bucket,
          objectName: `references/hero-${index}.png`,
          contentType: "image/png",
          sizeBytes: 4,
          provider: runtime.provider,
          status: "available",
          createdByUserId: projectScope.rows[0]!.owner_user_id,
          now: new Date(`2026-06-03T04:1${index}:00.000Z`),
        });
        const referenceVersion = await createAssetVersionSnapshot(db, {
          projectId: created.projectId,
          assetType: "character_sheet",
          assetKey: `hero-reference-${index}`,
          createdByUserId: projectScope.rows[0]!.owner_user_id,
          storageObjectId: storageObject.id,
          storageObjectKey: storageObject.objectKey,
          metadata: {
            mimeType: "image/png",
            label: `hero reference ${index}`,
          },
          sourceTaskId: null,
          sourceAttemptId: null,
          now: new Date(`2026-06-03T04:1${index}:01.000Z`),
        });
        referenceVersionIds.push(referenceVersion.version.id);
      }

      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-limit",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw with too many references",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: referenceVersionIds,
            parameters: {
              aspectRatio: "9:16",
            },
          }),
        },
      );
      const body = await imageTaskResponse.json();

      assert.equal(imageTaskResponse.status, 400);
      assert.equal(body.errorCode, "model_reference_limit_exceeded");
    } finally {
      await server.close();
    }
  });

  it("rejects GPT Image 2 reference asset versions that do not exist", async () => {
    const db = await createMigratedTestDb();
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-missing",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw with a missing reference",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: ["00000000-0000-4000-8000-000000000001"],
          }),
        },
      );
      const body = await imageTaskResponse.json();

      assert.equal(imageTaskResponse.status, 400);
      assert.equal(body.errorCode, "model_reference_not_found");
    } finally {
      await server.close();
    }
  });

  it("rejects GPT Image 2 reference asset versions whose storage object is unavailable", async () => {
    const db = await createMigratedTestDb();
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const projectScope = await db.query<{
        owner_user_id: string;
      }>(
        "SELECT owner_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const storageObject = await createScopedStorageObject(db, {
        userId: projectScope.rows[0]!.owner_user_id,
        projectId: created.projectId,
        bucket: runtime.bucket,
        objectName: "references/unavailable-hero.png",
        contentType: "image/png",
        sizeBytes: 4,
        provider: runtime.provider,
        status: "uploading",
        createdByUserId: projectScope.rows[0]!.owner_user_id,
        now: new Date("2026-06-03T04:20:00.000Z"),
      });
      const referenceVersion = await createAssetVersionSnapshot(db, {
        projectId: created.projectId,
        assetType: "character_sheet",
        assetKey: "unavailable-hero-reference",
        createdByUserId: projectScope.rows[0]!.owner_user_id,
        storageObjectId: storageObject.id,
        storageObjectKey: storageObject.objectKey,
        metadata: {
          mimeType: "image/png",
          label: "unavailable hero reference",
        },
        sourceTaskId: null,
        sourceAttemptId: null,
        now: new Date("2026-06-03T04:20:01.000Z"),
      });

      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-unavailable",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw with an unavailable reference",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: [referenceVersion.version.id],
          }),
        },
      );
      const body = await imageTaskResponse.json();

      assert.equal(imageTaskResponse.status, 400);
      assert.equal(body.errorCode, "model_reference_unavailable");
    } finally {
      await server.close();
    }
  });

  it("rejects GPT Image 2 reference MIME types outside the configured model allowlist", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET limits_json = limits_json || '{"allowedMimeTypes":["image/png"]}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const projectScope = await db.query<{
        owner_user_id: string;
      }>(
        "SELECT owner_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const storageObject = await createScopedStorageObject(db, {
        userId: projectScope.rows[0]!.owner_user_id,
        projectId: created.projectId,
        bucket: runtime.bucket,
        objectName: "references/webp-hero.webp",
        contentType: "image/webp",
        sizeBytes: 4,
        provider: runtime.provider,
        status: "available",
        createdByUserId: projectScope.rows[0]!.owner_user_id,
        now: new Date("2026-06-03T04:30:00.000Z"),
      });
      const referenceVersion = await createAssetVersionSnapshot(db, {
        projectId: created.projectId,
        assetType: "character_sheet",
        assetKey: "webp-hero-reference",
        createdByUserId: projectScope.rows[0]!.owner_user_id,
        storageObjectId: storageObject.id,
        storageObjectKey: storageObject.objectKey,
        metadata: {
          mimeType: "image/webp",
          label: "webp hero reference",
        },
        sourceTaskId: null,
        sourceAttemptId: null,
        now: new Date("2026-06-03T04:30:01.000Z"),
      });

      const imageTaskResponse = await fetchEpisodeImageTask(
        server.origin,
        created.episodeId,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-mime",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw with a webp reference",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: [referenceVersion.version.id],
          }),
        },
      );
      const body = await imageTaskResponse.json();

      assert.equal(imageTaskResponse.status, 400);
      assert.equal(body.errorCode, "model_reference_mime_not_allowed");
    } finally {
      await server.close();
    }
  });
});

async function login(origin: string, phone: string) {
  const fallbackDb = loginDbByOrigin.get(origin) ? null : await createDevDb();
  const db = loginDbByOrigin.get(origin) ?? fallbackDb!;
  try {
    const normalizedPhone = normalizeCnPhone(phone);
    await ensurePasswordLoginUser(db, normalizedPhone);
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

async function loginTeamMemberAccount(origin: string, account: string, password: string) {
  const response = await fetch(`${origin}/api/auth/team-member/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password, remember: true }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie") ?? "";
}

async function ensurePasswordLoginUser(
  db: Awaited<ReturnType<typeof createDevDb>>,
  phone: string,
) {
  const passwordHash = await createUserPasswordHash(defaultPasswordFromPhone(phone));
  await db.query(
    `
      INSERT INTO users (id, phone_e164, password_hash, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (phone_e164)
      DO UPDATE SET
        password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
        status = 'active'
    `,
    [randomUUID(), phone, passwordHash],
  );
}

async function seedWorkerProjectEpisode(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  suffix: string,
) {
  const userId = randomUUID();
  const projectId = randomUUID();
  const episodeId = randomUUID();
  const now = new Date("2026-07-07T02:00:00.000Z");
  const phoneSuffix = userId.replace(/\D/g, "").padEnd(6, "0").slice(0, 6);

  await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active')", [
    userId,
    `13800${phoneSuffix}`,
  ]);
      await db.query(
    `
      INSERT INTO projects (
        id,
        name,
        aspect_ratio,
        resolution,
        phase,
        owner_user_id,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, '9:16', '1080p', 'shot_generation', $3, $3, $4, $4)
    `,
    [projectId, `Worker ${suffix} Project`, userId, now],
  );
  await db.query(
    `
      INSERT INTO episodes (
        id,
        project_id,
        title,
        sequence,
        status,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 1, 'draft', $4, $5, $5)
    `,
    [episodeId,
      projectId,
      `Worker ${suffix} Episode`,
      userId,
      now],
  );

  return { userId, projectId, episodeId };
}

async function createProjectAndEpisode(
  origin: string,
  cookie: string,
  idempotencyKey = "gpt-image-worker-project",
) {
  const createResponse = await fetch(`${origin}/api/creator/project/create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      cookie,
    },
    body: JSON.stringify({
      name: "GPT Image Worker",
      scriptInput: "Episode 1: Worker handles GPT Image 2.",
      aspectRatio: "9:16",
      resolution: "1080p",
    }),
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 200, JSON.stringify(created));
  const db = loginDbByOrigin.get(origin)!;
  const project = await db.query<{ owner_user_id: string }>(
    "SELECT owner_user_id FROM projects WHERE id = $1",
    [created.project.id],
  );
  const ownerUserId = project.rows[0]!.owner_user_id;
  const now = new Date();
  await db.query(
    `
      INSERT INTO user_memberships (
        id, user_id, membership_tier, purchase_at, expires_at,
        gift_credits, status, created_at, updated_at
      ) VALUES ($1, $2, 'professional', $3, $4, 0, 'active', $3, $3)
      ON CONFLICT (user_id) DO UPDATE
      SET membership_tier = EXCLUDED.membership_tier,
          expires_at = EXCLUDED.expires_at,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
    `,
    [randomUUID(), ownerUserId, now, new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)],
  );
  await grantCredits(db, {
    userId: ownerUserId,
    amount: 10_000,
    sourceType: "gpt_image_worker_test",
    sourceId: randomUUID(),
    reason: "seed GPT image worker test credits",
    createdByUserId: ownerUserId,
    now,
  });
  const episodeResponse = await fetch(`${origin}/api/projects/${created.project.id}/episodes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify({ title: "GPT Image Worker Task" }),
  });
  const episode = await episodeResponse.json();
  return { projectId: created.project.id, episodeId: episode.data.episode.id };
}
