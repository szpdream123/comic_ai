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
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import {
  finalizeGptImageArtifactJob,
  processGptImageSubmitJob,
} from "../gpt-image.worker.ts";

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

describe("GPT Image 2 BullMQ worker service", () => {
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
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url, init) => {
      providerCalls.push({
        url: String(url),
        body: String(init?.body ?? ""),
      });
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
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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
        progress_stage: "queued",
        credit_status: "reserved",
        estimated_credits: 77,
        model_code: "gpt-image-2-cn",
        media_type: "image",
      });
      assert.deepEqual(submitResult, { status: "submitted" });
      assert.equal(providerCalls[0]?.url, "https://image-gateway.example.test/v1/images/generations");
      assert.match(providerCalls[0]?.body ?? "", /gpt-image-2/);
      assert.equal(runningTaskResponse.status, 200);
      assert.equal(runningTask.status, "running");
      assert.deepEqual(finalizeResult, { status: "succeeded" });
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
      assert.equal(uploadRecords.rows[0]?.actor_display_name, "用户13800138000");
      assert.equal(uploadRecords.rows[0]?.actor_phone_e164, "13800138000");
      assert.equal(requestLog.rows[0]?.model_id, "gpt-image-2-cn");
      assert.equal(requestLog.rows[0]?.status, "succeeded");
      assert.match(requestLog.rows[0]?.request_text ?? "", /draw the second comic image/);
      assert.match(requestLog.rows[0]?.response_text ?? "", /gpt-image-request-1/);
    } finally {
      await server.close();
    }
  });

  it("records Cumob GPT Image requests using the provider payload format", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_protocol = 'custom_http',
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
      organizationId: created.organizationId,
      workspaceId: created.workspaceId,
      projectId: created.projectId,
      workflowType: "episode_image_generation",
      inputSnapshot: taskSnapshot,
      createdByUserId: created.userId,
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

    assert.deepEqual(submitResult, { status: "submitted" });
    assert.deepEqual(requestLog.rows[0]?.request_body_json, {
      model: "gpt-image-2-pro",
      prompt: "draw the Cumob log format image",
      size: "4K",
      aspect_ratio: "2:3",
      quality: "auto",
      stream: false,
      async: false,
    });
    assert.equal(requestLog.rows[0]?.request_format, "cumob_image");
    assert.match(requestLog.rows[0]?.request_text ?? "", /"aspect_ratio": "2:3"/);
    assert.doesNotMatch(requestLog.rows[0]?.request_text ?? "", /targetType/);
  });

  it("uploads provider image urls without forcing contentLength to zero when the download is chunked", async () => {
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
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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

      assert.equal(imageTaskResponse.status, 200);
      assert.deepEqual(submitResult, { status: "submitted" });
      assert.deepEqual(finalizeResult, { status: "succeeded" });
      assert.equal(uploadInputs.length, 1);
      assert.equal(uploadInputs[0]?.contentLength ?? "missing", null);
      assert.equal(uploadInputs[0]?.contentType, "image/jpeg");
      assert.equal(uploadInputs[0]?.body instanceof Uint8Array, false);
      assert.equal(storedObject.rows[0]?.status, "available");
      assert.equal(storedObject.rows[0]?.content_type, "image/jpeg");
      assert.equal(Number(storedObject.rows[0]?.size_bytes ?? -1), 8);
    } finally {
      await server.close();
    }
  });

  it("fails image finalization when the uploaded storage object is still zero bytes", async () => {
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
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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
      const finalizeResult = await finalizeGptImageArtifactJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-30T09:18:45.000Z"),
      });
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

      assert.equal(imageTaskResponse.status, 200);
      assert.deepEqual(submitResult, { status: "submitted" });
      assert.deepEqual(finalizeResult, { status: "failed", failureCode: "provider_output_upload_failed" });
      assert.equal(taskRow.rows[0]?.status, "failed");
      assert.equal(taskRow.rows[0]?.failure_code, "provider_output_upload_failed");
      assert.equal(snapshot.rows[0]?.status, "failed");
      assert.equal(snapshot.rows[0]?.progress_stage, "failed");
      assert.equal(snapshot.rows[0]?.failure_json?.failureCode, "provider_output_upload_failed");
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
        organization_id: string;
        workspace_id: string;
        created_by_user_id: string | null;
      }>(
        "SELECT organization_id, workspace_id, created_by_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const storageObject = await createScopedStorageObject(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        workspaceId: projectScope.rows[0]!.workspace_id,
        projectId: created.projectId,
        bucket: runtime.bucket,
        objectName: "references/hero.png",
        contentType: "image/png",
        sizeBytes: 4,
        provider: runtime.provider,
        status: "available",
        metadata: { label: "hero reference" },
        createdByUserId: projectScope.rows[0]!.created_by_user_id,
        now: new Date("2026-06-03T04:05:00.000Z"),
      });
      const referenceVersion = await createAssetVersionSnapshot(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        projectId: created.projectId,
        assetType: "character_sheet",
        assetKey: "hero-reference",
        createdByUserId: projectScope.rows[0]!.created_by_user_id ?? "",
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
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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
      assert.deepEqual(submitResult, { status: "submitted" });
      assert.equal(providerCalls[0]?.url, "https://image-gateway.example.test/v1/images/edits");
      assert.equal(providerCalls[0]?.body instanceof FormData, true);
      assert.equal((providerCalls[0]?.body as FormData).getAll("image[]").length, 1);
      assert.equal((providerCalls[0]?.body as FormData).get("n"), "1");
      assert.equal((providerCalls[0]?.body as FormData).get("size"), "1024x1536");
      assert.equal((providerCalls[0]?.body as FormData).get("quality"), "high");
      assert.equal((providerCalls[0]?.body as FormData).get("moderation"), "auto");
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
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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
          SET project_id = NULL,
              input_snapshot_json = input_snapshot_json || $2::jsonb
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

  it("marks the generation snapshot failed when GPT Image 2 provider submission is ambiguous", async () => {
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
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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

      assert.equal(imageTaskResponse.status, 200);
      assert.deepEqual(submitResult, { status: "failed", failureCode: "provider_failed" });
      assert.equal(providerRequest.rows[0]?.status, "result_unknown");
      assert.equal(providerRequest.rows[0]?.failure_code, "provider_submission_ambiguous");
      assert.equal(snapshot.rows[0]?.status, "failed");
      assert.equal(snapshot.rows[0]?.progress_stage, "failed");
      assert.equal(snapshot.rows[0]?.credit_status, "released");
      assert.equal(snapshot.rows[0]?.failure_json?.failureCode, "provider_failed");
      assert.match(snapshot.rows[0]?.failure_json?.errorMessage ?? "", /无法连接模型服务或连接中途断开/);
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
    const fetchImpl = (async () => {
      throw new Error("provider submit failed for team member");
    }) as typeof fetch;
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
      const projectScope = await db.query<{ organization_id: string; workspace_id: string; created_by_user_id: string }>(
        "SELECT organization_id, workspace_id, created_by_user_id FROM projects WHERE id = $1",
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
        organizationId: projectScope.rows[0]!.organization_id,
        workspaceId: projectScope.rows[0]!.workspace_id,
        projectId: created.projectId,
        workflowType: "episode_image_generation",
        inputSnapshot: taskSnapshot,
        createdByUserId: projectScope.rows[0]!.created_by_user_id,
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
        now: new Date("2026-06-30T13:05:00.000Z"),
      });
      const member = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [memberId],
      );
      const refundLedger = await db.query<{ amount: number | string; source_type: string }>(
        `
          SELECT amount, source_type
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

      assert.deepEqual(submitResult, { status: "failed", failureCode: "provider_failed" });
      assert.equal(Number(member.rows[0]?.member_credits ?? -1), 77);
      assert.equal(Number(refundLedger.rows[0]?.amount ?? -1), 77);
      assert.equal(requestLog.rows[0]?.status, "failed");
      assert.equal(requestLog.rows[0]?.failure_code, "provider_failed");
      assert.match(requestLog.rows[0]?.request_text ?? "", /draw the team member refund image/);
      assert.match(requestLog.rows[0]?.response_text ?? "", /provider submit failed for team member/);
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
        organization_id: string;
        workspace_id: string;
        created_by_user_id: string | null;
      }>(
        "SELECT organization_id, workspace_id, created_by_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const referenceVersionIds = [];
      for (const index of [1, 2]) {
        const storageObject = await createScopedStorageObject(db, {
          organizationId: projectScope.rows[0]!.organization_id,
          workspaceId: projectScope.rows[0]!.workspace_id,
          projectId: created.projectId,
          bucket: runtime.bucket,
          objectName: `references/hero-${index}.png`,
          contentType: "image/png",
          sizeBytes: 4,
          provider: runtime.provider,
          status: "available",
          createdByUserId: projectScope.rows[0]!.created_by_user_id,
          now: new Date(`2026-06-03T04:1${index}:00.000Z`),
        });
        const referenceVersion = await createAssetVersionSnapshot(db, {
          organizationId: projectScope.rows[0]!.organization_id,
          projectId: created.projectId,
          assetType: "character_sheet",
          assetKey: `hero-reference-${index}`,
          createdByUserId: projectScope.rows[0]!.created_by_user_id ?? "",
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

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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
        organization_id: string;
        workspace_id: string;
        created_by_user_id: string | null;
      }>(
        "SELECT organization_id, workspace_id, created_by_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const storageObject = await createScopedStorageObject(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        workspaceId: projectScope.rows[0]!.workspace_id,
        projectId: created.projectId,
        bucket: runtime.bucket,
        objectName: "references/unavailable-hero.png",
        contentType: "image/png",
        sizeBytes: 4,
        provider: runtime.provider,
        status: "uploading",
        createdByUserId: projectScope.rows[0]!.created_by_user_id,
        now: new Date("2026-06-03T04:20:00.000Z"),
      });
      const referenceVersion = await createAssetVersionSnapshot(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        projectId: created.projectId,
        assetType: "character_sheet",
        assetKey: "unavailable-hero-reference",
        createdByUserId: projectScope.rows[0]!.created_by_user_id ?? "",
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

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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
        organization_id: string;
        workspace_id: string;
        created_by_user_id: string | null;
      }>(
        "SELECT organization_id, workspace_id, created_by_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const storageObject = await createScopedStorageObject(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        workspaceId: projectScope.rows[0]!.workspace_id,
        projectId: created.projectId,
        bucket: runtime.bucket,
        objectName: "references/webp-hero.webp",
        contentType: "image/webp",
        sizeBytes: 4,
        provider: runtime.provider,
        status: "available",
        createdByUserId: projectScope.rows[0]!.created_by_user_id,
        now: new Date("2026-06-03T04:30:00.000Z"),
      });
      const referenceVersion = await createAssetVersionSnapshot(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        projectId: created.projectId,
        assetType: "character_sheet",
        assetKey: "webp-hero-reference",
        createdByUserId: projectScope.rows[0]!.created_by_user_id ?? "",
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

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
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
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const projectId = randomUUID();
  const episodeId = randomUUID();
  const now = new Date("2026-07-07T02:00:00.000Z");
  const phoneSuffix = userId.replace(/\D/g, "").padEnd(6, "0").slice(0, 6);

  await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active')", [
    userId,
    `13800${phoneSuffix}`,
  ]);
  await db.query("INSERT INTO organizations (id, name, status) VALUES ($1, $2, 'active')", [
    organizationId,
    `Worker ${suffix} Org`,
  ]);
  await db.query(
    "INSERT INTO workspaces (id, organization_id, name, status) VALUES ($1, $2, $3, 'active')",
    [workspaceId, organizationId, `Worker ${suffix} Workspace`],
  );
  await db.query(
    `
      INSERT INTO projects (
        id, organization_id, workspace_id, name, aspect_ratio, resolution, phase,
        created_by_user_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, '9:16', '1080p', 'shot_generation', $5, $6, $6)
    `,
    [projectId, organizationId, workspaceId, `Worker ${suffix} Project`, userId, now],
  );
  await db.query(
    `
      INSERT INTO episodes (
        id, organization_id, project_id, title, sequence, status,
        created_by_user_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 1, 'draft', $5, $6, $6)
    `,
    [episodeId, organizationId, projectId, `Worker ${suffix} Episode`, userId, now],
  );

  return { userId, organizationId, workspaceId, projectId, episodeId };
}

async function createProjectAndEpisode(origin: string, cookie: string) {
  const createResponse = await fetch(`${origin}/api/creator/project/create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "gpt-image-worker-project",
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
