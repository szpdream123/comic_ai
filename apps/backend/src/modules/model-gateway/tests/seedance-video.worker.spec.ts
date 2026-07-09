import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { normalizeCnPhone } from "../../identity/phone-auth.utils.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../identity/team-account-credentials.service.ts";
import { createPhoneAuthDevServer as createPhoneAuthDevServerBase } from "../../../entrypoints/phone-auth-dev-server.ts";
import { grantCredits } from "../../credit-billing/credit-ledger.service.ts";
import { createDevDb } from "../../shared/db/dev-db.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import {
  expireSeedanceVideoPollJob,
  finalizeSeedanceVideoArtifactJob,
  processSeedanceVideoPollJob,
  processSeedanceVideoSubmitJob,
} from "../seedance-video.worker.ts";

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

describe("Seedance video BullMQ worker services", () => {
  it("submits, polls, defers finalization, then streams provider video to storage and persists the task result", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'seedance-2-0-i2v',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":135}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
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
          return { eTag: "seedance-worker-etag" };
        },
      },
    };
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url, init) => {
      providerCalls.push({
        url: String(url),
        body: String(init?.body ?? ""),
      });
      if (String(url).includes("/db/query/seedance-worker-task-1")) {
        return new Response(
          JSON.stringify({
            data: {
              task_id: "seedance-worker-task-1",
              status: "succeeded",
              result: { video_url: "https://cdn.example.test/seedance-worker-result.mp4" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (String(url) === "https://cdn.example.test/seedance-worker-result.mp4") {
        return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": "8",
          },
        });
      }
      return new Response(
        JSON.stringify({
          data: {
            task_id: "seedance-worker-task-1",
            status: "queued",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
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
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-worker-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            motionPrompt: "camera slowly pushes in",
            model: "seedance-i2v-pro",
            parameters: {
              durationSec: 5,
              resolution: "1080p",
              aspectRatio: "16:9",
              firstFrame: {
                name: "first-frame.png",
                url: "https://input.example.test/first-frame.png",
              },
            },
          }),
        },
      );
      const videoTaskPayload = await videoTaskResponse.json();
      assert.equal(videoTaskResponse.status, 200, JSON.stringify(videoTaskPayload));
      const videoTask = videoTaskPayload.data;
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
        [videoTask.taskId],
      );

      const submitResult = await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.taskId,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:00:00.000Z"),
      });
      const runningTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${videoTask.taskId}`,
        { headers: { cookie } },
      );
      const runningTask = (await runningTaskResponse.json()).data;
      const providerCallCountAfterFrontendRead = providerCalls.length;
      const pollResult = await processSeedanceVideoPollJob(db, {
        taskId: videoTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:00:10.000Z"),
      });
      const postPollTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${videoTask.taskId}`,
        { headers: { cookie } },
      );
      const postPollTask = (await postPollTaskResponse.json()).data;
      const finalizeResult = await finalizeSeedanceVideoArtifactJob(db, {
        taskId: videoTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:00:20.000Z"),
      });
      const completedTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${videoTask.taskId}`,
        { headers: { cookie } },
      );
      const completedTask = (await completedTaskResponse.json()).data;
      const completedSnapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        result_assets_json: Array<{ url?: string; mediaKind?: string }>;
      }>(
        `
          SELECT status, progress_stage, credit_status, result_assets_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [videoTask.taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, status FROM credit_reservations WHERE task_id = $1",
        [videoTask.taskId],
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
      const storageObjects = await db.query<{
        id: string;
        created_by_user_id: string | null;
      }>(
        `
          SELECT id, created_by_user_id
          FROM storage_objects
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
        [videoTask.taskId],
      );

      assert.equal(videoTaskResponse.status, 200);
      assert.equal(videoTask.status, "queued");
      assert.deepEqual(queuedSnapshot.rows[0], {
        status: "queued",
        progress_stage: "queued",
        credit_status: "reserved",
        estimated_credits: 135,
        model_code: "seedance-i2v-pro",
        media_type: "video",
      });
      assert.deepEqual(submitResult, {
        status: "submitted",
        externalRequestId: "seedance-worker-task-1",
      });
      assert.equal(runningTaskResponse.status, 200);
      assert.equal(runningTask.status, "running");
      assert.equal(providerCallCountAfterFrontendRead, 1);
      assert.deepEqual(pollResult, { status: "succeeded" });
      assert.equal(postPollTaskResponse.status, 200);
      assert.equal(postPollTask.status, "running");
      assert.deepEqual(finalizeResult, { status: "succeeded" });
      assert.equal(providerCalls[0]?.url, "https://ark-db.example.test/db/create");
      assert.match(providerCalls[0]?.body ?? "", /seedance-2-0-i2v/);
      assert.equal(providerCalls[1]?.url, "https://ark-db.example.test/db/query/seedance-worker-task-1");
      assert.equal(providerCalls[2]?.url, "https://cdn.example.test/seedance-worker-result.mp4");
      assert.equal(uploadedBodies.length, 1);
      assert.equal(uploadedBodies[0] instanceof Uint8Array, false);
      assert.equal(completedTaskResponse.status, 200);
      assert.equal(completedTask.status, "succeeded");
      assert.equal(completedTask.result.mediaKind, "video");
      assert.match(completedTask.result.videoUrl, /platform-storage\.example\.test/);
      assert.equal(completedSnapshot.rows[0]?.status, "succeeded");
      assert.equal(completedSnapshot.rows[0]?.progress_stage, "completed");
      assert.equal(completedSnapshot.rows[0]?.credit_status, "consumed");
      assert.equal(completedSnapshot.rows[0]?.result_assets_json[0]?.mediaKind, "video");
      assert.match(completedSnapshot.rows[0]?.result_assets_json[0]?.url ?? "", /platform-storage\.example\.test/);
      assert.doesNotMatch(completedTask.result.videoUrl, /cdn\.example\.test/);
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 135);
      assert.equal(reservation.rows[0]?.status, "settled");
      assert.equal(uploadRecords.rows.length, 1);
      assert.equal(uploadRecords.rows[0]?.source_action, "generate_video");
      assert.equal(uploadRecords.rows[0]?.status, "uploaded");
      assert.match(uploadRecords.rows[0]?.public_url ?? "", /platform-storage\.example\.test/);
      assert.ok(uploadRecords.rows[0]?.actor_user_id);
      assert.equal(uploadRecords.rows[0]?.actor_display_name, "用户13800138000");
      assert.equal(uploadRecords.rows[0]?.actor_phone_e164, "13800138000");
      assert.equal(
        uploadRecords.rows[0]?.storage_object_id,
        storageObjects.rows[0]?.id ?? null,
      );
      assert.equal(storageObjects.rows[0]?.created_by_user_id, uploadRecords.rows[0]?.actor_user_id);
      assert.equal(requestLog.rows[0]?.model_id, "seedance-i2v-pro");
      assert.equal(requestLog.rows[0]?.status, "succeeded");
      assert.match(requestLog.rows[0]?.request_text ?? "", /camera slowly pushes in/);
      assert.match(requestLog.rows[0]?.response_text ?? "", /seedance-worker-result\.mp4/);
    } finally {
      await server.close();
    }
  });

  it("retries Seedance artifact downloads when the response body terminates mid-read", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'seedance-2-0-i2v',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":135}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
      `,
    );
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
          return { eTag: "seedance-retry-download-etag" };
        },
      },
    };
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "2",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    let videoDownloadAttempts = 0;
    const fetchImpl = (async (url, init) => {
      if (String(url).includes("/db/query/seedance-retry-download-task-1")) {
        return new Response(
          JSON.stringify({
            data: {
              task_id: "seedance-retry-download-task-1",
              status: "succeeded",
              result: { video_url: "https://cdn.example.test/seedance-retry-download-result.mp4" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (String(url) === "https://cdn.example.test/seedance-retry-download-result.mp4") {
        videoDownloadAttempts += 1;
        if (videoDownloadAttempts === 1) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.error(new Error("download stream terminated"));
              },
            }),
            {
              status: 200,
              headers: {
                "content-type": "video/mp4",
                "content-length": "8",
              },
            },
          );
        }
        return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": "8",
          },
        });
      }
      return new Response(
        JSON.stringify({
          data: {
            task_id: "seedance-retry-download-task-1",
            status: "queued",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const seeded = await seedProviderSucceededSeedanceTask(db, {
      taskId: "50000000-0000-4000-8000-000000000201",
      workflowId: "40000000-0000-4000-8000-000000000201",
      attemptId: "51000000-0000-4000-8000-000000000201",
      providerRequestId: "52000000-0000-4000-8000-000000000201",
      episodeId: "60000000-0000-4000-8000-000000000201",
      videoUrl: "https://cdn.example.test/seedance-retry-download-result.mp4",
      now: new Date("2026-06-03T01:10:00.000Z"),
    });

    const finalizeResult = await finalizeSeedanceVideoArtifactJob(db, {
      taskId: seeded.taskId,
      runtime,
      env,
      fetchImpl,
      now: new Date("2026-06-03T01:10:20.000Z"),
    });
    const task = await db.query<{ status: string; failure_code: string | null }>(
      "SELECT status, failure_code FROM tasks WHERE id = $1",
      [seeded.taskId],
    );
    const snapshot = await db.query<{
      status: string;
      progress_stage: string;
      failure_json: Record<string, unknown> | null;
    }>(
      `
        SELECT status, progress_stage, failure_json
        FROM ai_generation_task_snapshots
        WHERE task_id = $1
      `,
      [seeded.taskId],
    );

    assert.deepEqual(finalizeResult, { status: "succeeded" });
    assert.equal(videoDownloadAttempts, 2);
    assert.equal(uploadedBodies.length, 1);
    assert.equal(task.rows[0]?.status, "succeeded");
    assert.equal(task.rows[0]?.failure_code, null);
    assert.equal(snapshot.rows[0]?.status, "succeeded");
    assert.equal(snapshot.rows[0]?.progress_stage, "completed");
    assert.equal(snapshot.rows[0]?.failure_json, null);
  });

  it("keeps provider-succeeded Seedance tasks running silently when artifact download times out", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'seedance-2-0-i2v',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":135}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
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
          throw new Error("download timeout should not reach upload");
        },
      },
    };
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "1",
      GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS: "1",
    };
    const fetchImpl = (async (url, init) => {
      if (String(url).includes("/db/query/seedance-silent-timeout-task-1")) {
        return new Response(
          JSON.stringify({
            data: {
              task_id: "seedance-silent-timeout-task-1",
              status: "succeeded",
              result: { video_url: "https://cdn.example.test/seedance-silent-timeout-result.mp4" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (String(url) === "https://cdn.example.test/seedance-silent-timeout-result.mp4") {
        const signal = init?.signal as AbortSignal | undefined;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              signal?.addEventListener("abort", () => {
                controller.error(new DOMException("This operation was aborted", "AbortError"));
              }, { once: true });
            },
          }),
          { status: 200, headers: { "content-type": "video/mp4" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            task_id: "seedance-silent-timeout-task-1",
            status: "queued",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const seeded = await seedProviderSucceededSeedanceTask(db, {
      taskId: "50000000-0000-4000-8000-000000000202",
      workflowId: "40000000-0000-4000-8000-000000000202",
      attemptId: "51000000-0000-4000-8000-000000000202",
      providerRequestId: "52000000-0000-4000-8000-000000000202",
      episodeId: "60000000-0000-4000-8000-000000000202",
      videoUrl: "https://cdn.example.test/seedance-silent-timeout-result.mp4",
      now: new Date("2026-06-03T01:20:00.000Z"),
    });

    const finalizeResult = await finalizeSeedanceVideoArtifactJob(db, {
      taskId: seeded.taskId,
      runtime,
      env,
      fetchImpl,
      now: new Date("2026-06-03T01:20:20.000Z"),
    });
    const task = await db.query<{
      status: string;
      failure_code: string | null;
      locked_until: Date | string | null;
    }>(
      "SELECT status, failure_code, locked_until FROM tasks WHERE id = $1",
      [seeded.taskId],
    );
    const snapshot = await db.query<{
      status: string;
      progress_stage: string;
      failure_json: Record<string, unknown> | null;
      provider_status_json: Record<string, unknown> | null;
    }>(
      `
        SELECT status, progress_stage, failure_json, provider_status_json
        FROM ai_generation_task_snapshots
        WHERE task_id = $1
      `,
      [seeded.taskId],
    );

    assert.deepEqual(finalizeResult, {
      status: "failed",
      failureCode: "provider_output_download_failed",
    });
    assert.equal(task.rows[0]?.status, "running");
    assert.equal(task.rows[0]?.failure_code, null);
    assert.ok(task.rows[0]?.locked_until);
    assert.equal(snapshot.rows[0]?.status, "running");
    assert.equal(snapshot.rows[0]?.progress_stage, "asset_transfer_retry_pending");
    assert.equal(snapshot.rows[0]?.failure_json, null);
    assert.equal(snapshot.rows[0]?.provider_status_json?.transferStatus, "retry_pending");
  });

  it("finalizes a provider-succeeded video task that was left queued without an attempt", async () => {
    const db = await createMigratedTestDb();
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
          return { eTag: "seedance-queued-finalize-etag" };
        },
      },
    };
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url) => {
      if (String(url) === "https://cdn.example.test/queued-finalize-result.mp4") {
        return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": "8",
          },
        });
      }
      return new Response("not found", { status: 404 });
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
      const phone = "13800138012";
      const normalizedPhone = normalizeCnPhone(phone);
      await seedCreatorMembershipForPhone(db, normalizedPhone);
      await seedActiveGenerationMembership(db, {
        organizationId: await readOrganizationIdForPhone(db, normalizedPhone),
      });
      const cookie = await login(server.origin, phone);
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-queued-finalize-project");
      const projectOrganizationId = await readProjectOrganizationId(db, created.projectId);
      await seedActiveGenerationMembership(db, {
        organizationId: projectOrganizationId,
      });
      const userId = await readUserIdForPhone(db, normalizedPhone);
      await grantCredits(db, {
        compatibilityOrganizationId: projectOrganizationId,
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-queued-finalize-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            motionPrompt: "camera slowly pushes in",
            model: "seedance-i2v-pro",
            parameters: {
              durationSec: 5,
              resolution: "1080p",
              aspectRatio: "16:9",
              firstFrame: {
                name: "first-frame.png",
                url: "https://input.example.test/first-frame.png",
              },
            },
          }),
        },
      );
      const videoTaskEnvelope = await videoTaskResponse.json();
      assert.equal(
        videoTaskResponse.status,
        200,
        `video task failed: ${JSON.stringify(videoTaskEnvelope)}`,
      );
      const videoTask = videoTaskEnvelope.data;
      const task = await db.query<{
        workflow_id: string;
        workspace_id: string | null;
        project_id: string | null;
      }>(
        `
          SELECT workflow_id, workspace_id, project_id
          FROM tasks
          WHERE id = $1
        `,
        [videoTask.taskId],
      );
      const providerRequestId = randomUUID();
      await db.query(
        `
          INSERT INTO provider_requests (
            id,
            workspace_id,
            project_id,
            workflow_id,
            task_id,
            attempt_id,
            provider_name,
            provider_operation,
            request_key,
            request_hash,
            payload_ref,
            payload_hash,
            payload_redacted_json,
            status,
            external_submission_started_at,
            external_request_id,
            response_redacted_json,
            created_by_user_id,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, NULL, 'lingdong-api', 'video.generate',
            $6, 'request-hash', 'payload-ref', 'payload-hash', '{}'::jsonb,
            'succeeded', $7, 'queued-finalize-provider-task',
            $8::jsonb, NULL, $7, $7
          )
        `,
        [
          providerRequestId,
          task.rows[0]?.workspace_id ?? null,
          task.rows[0]?.project_id ?? null,
          task.rows[0]?.workflow_id,
          videoTask.taskId,
          `seedance-queued-finalize-${videoTask.taskId}`,
          new Date("2026-06-03T01:20:00.000Z"),
          JSON.stringify({
            status: "succeeded",
            videoUrl: "https://cdn.example.test/queued-finalize-result.mp4",
          }),
        ],
      );

      const finalizeResult = await finalizeSeedanceVideoArtifactJob(db, {
        taskId: videoTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:20:10.000Z"),
      });
      const completedTask = await db.query<{
        status: string;
        current_attempt_id: string | null;
      }>("SELECT status, current_attempt_id FROM tasks WHERE id = $1", [videoTask.taskId]);
      const providerRequest = await db.query<{ attempt_id: string | null }>(
        "SELECT attempt_id FROM provider_requests WHERE id = $1",
        [providerRequestId],
      );
      const attempt = await db.query<{ status: string }>(
        "SELECT status FROM task_attempts WHERE id = $1",
        [completedTask.rows[0]?.current_attempt_id],
      );

      assert.equal(videoTaskResponse.status, 200);
      assert.deepEqual(finalizeResult, { status: "succeeded" });
      assert.equal(completedTask.rows[0]?.status, "succeeded");
      assert.ok(completedTask.rows[0]?.current_attempt_id);
      assert.equal(providerRequest.rows[0]?.attempt_id, completedTask.rows[0]?.current_attempt_id);
      assert.equal(attempt.rows[0]?.status, "succeeded");
      assert.equal(uploadedBodies.length, 1);
    } finally {
      await server.close();
    }
  });

  it("marks the task snapshot failed when Seedance rejects submission", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'seedance-2-0-i2v',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
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
      },
    };
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
    };
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "InvalidParameter",
            message: "content field is required",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
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
      const cookie = await login(server.origin, "13800138007");
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-submit-rejected-project");
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-submit-rejected-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            motionPrompt: "camera slowly pushes in",
            model: "seedance-i2v-pro",
            parameters: {
              durationSec: 5,
              resolution: "1080p",
              aspectRatio: "16:9",
              firstFrame: {
                name: "first-frame.png",
                url: "https://input.example.test/first-frame.png",
              },
            },
          }),
        },
      );
      const videoTask = (await videoTaskResponse.json()).data;

      const submitResult = await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.taskId,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:05:00.000Z"),
      });
      const failedSnapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        provider_request_id: string | null;
        provider_status_json: { errorMessage?: string; failureCode?: string };
        failure_json: {
          failureCode?: string;
          providerFailureCode?: string;
          errorMessage?: string;
        } | null;
      }>(
        `
          SELECT status, progress_stage, credit_status, provider_request_id,
                 provider_status_json, failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [videoTask.taskId],
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
        [videoTask.taskId],
      );

      assert.deepEqual(submitResult, { status: "skipped" });
      assert.equal(failedSnapshot.rows[0]?.status, "failed");
      assert.equal(failedSnapshot.rows[0]?.progress_stage, "failed");
      assert.equal(failedSnapshot.rows[0]?.credit_status, "released");
      assert.match(failedSnapshot.rows[0]?.provider_status_json.errorMessage ?? "", /seedance_video_400/);
      assert.equal(failedSnapshot.rows[0]?.provider_status_json.failureCode, "provider_submission_ambiguous");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.failureCode, "provider_submission_failed");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.providerFailureCode, "provider_submission_ambiguous");
      assert.match(failedSnapshot.rows[0]?.failure_json?.errorMessage ?? "", /content field is required/);
      assert.equal(requestLog.rows[0]?.status, "failed");
      assert.equal(requestLog.rows[0]?.failure_code, "provider_submission_failed");
      assert.match(requestLog.rows[0]?.request_text ?? "", /camera slowly pushes in/);
      assert.match(requestLog.rows[0]?.response_text ?? "", /content field is required/);
    } finally {
      await server.close();
    }
  });

  it("marks Seedance video tasks result unknown and keeps credits in manual review when polling expires", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'seedance-2-0-i2v',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":135}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
      `,
    );
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
    };
    const providerCalls: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (url, init) => {
      providerCalls.push({ url: String(url), method: String(init?.method ?? "GET") });
      if (init?.method === "DELETE") {
        return new Response(JSON.stringify({ data: { deleted: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          data: {
            task_id: "seedance-timeout-task-1",
            status: "queued",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138001");
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-timeout-project");
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-timeout-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            motionPrompt: "camera slowly pushes in",
            model: "seedance-i2v-pro",
            parameters: {
              durationSec: 5,
              resolution: "1080p",
              aspectRatio: "16:9",
              firstFrame: {
                name: "first-frame.png",
                url: "https://input.example.test/first-frame.png",
              },
            },
          }),
        },
      );
      const videoTask = (await videoTaskResponse.json()).data;

      await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.taskId,
        env,
        fetchImpl,
        now: new Date("2026-06-03T02:00:00.000Z"),
      });
      const expired = await expireSeedanceVideoPollJob(db, {
        taskId: videoTask.taskId,
        env,
        fetchImpl,
        now: new Date("2026-06-03T02:10:00.000Z"),
      });
      const failedTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${videoTask.taskId}`,
        { headers: { cookie } },
      );
      const failedTask = (await failedTaskResponse.json()).data;
      const failedSnapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        failure_json: {
          failureCode?: string;
          providerMessage?: string;
        } | null;
      }>(
        `
          SELECT status, progress_stage, credit_status, failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [videoTask.taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE task_id = $1",
        [videoTask.taskId],
      );
      const providerRequest = await db.query<{
        status: string;
        failure_code: string | null;
        response_redacted_json: { cancelStatus?: string; cancelResponse?: { taskId?: string } } | null;
      }>(
        `
          SELECT status, failure_code, response_redacted_json
          FROM provider_requests
          WHERE task_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [videoTask.taskId],
      );

      assert.deepEqual(expired, { status: "failed", failureCode: "provider_poll_timeout" });
      assert.deepEqual(
        providerCalls.filter((call) => call.method === "DELETE").map((call) => call.url),
        ["https://ark-db.example.test/db/query/seedance-timeout-task-1"],
      );
      assert.equal(providerRequest.rows[0]?.status, "canceled");
      assert.equal(providerRequest.rows[0]?.failure_code, "provider_poll_timeout");
      assert.equal(providerRequest.rows[0]?.response_redacted_json?.cancelStatus, "canceled");
      assert.equal(providerRequest.rows[0]?.response_redacted_json?.cancelResponse?.taskId, "seedance-timeout-task-1");
      assert.equal(failedTask.status, "result_unknown");
      assert.equal(failedTask.failureCode, "provider_poll_timeout");
      assert.equal(failedSnapshot.rows[0]?.status, "result_unknown");
      assert.equal(failedSnapshot.rows[0]?.credit_status, "manual_review_required");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.failureCode, "provider_poll_timeout");
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 135);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 0);
      assert.equal(reservation.rows[0]?.status, "manual_review_required");
    } finally {
      await server.close();
    }
  });

  it("marks Seedance poll timeout as result unknown with manual-review credit status", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET pricing_json = pricing_json || '{"baseCredits":135}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
      `,
    );
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
    };
    const fetchImpl = (async () => new Response(
      JSON.stringify({ data: { task_id: "seedance-manual-review-timeout", status: "queued" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138009");
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-manual-review-timeout-project");
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-manual-review-timeout-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            motionPrompt: "camera slowly pushes in",
            model: "seedance-i2v-pro",
            parameters: {
              durationSec: 5,
              resolution: "1080p",
              aspectRatio: "16:9",
              firstFrame: {
                name: "first-frame.png",
                url: "https://input.example.test/first-frame.png",
              },
            },
          }),
        },
      );
      const videoTask = (await videoTaskResponse.json()).data;

      await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.taskId,
        env,
        fetchImpl,
        now: new Date("2026-06-03T02:30:00.000Z"),
      });
      const expired = await expireSeedanceVideoPollJob(db, {
        taskId: videoTask.taskId,
        now: new Date("2026-06-03T02:40:00.000Z"),
      });
      const snapshot = await db.query<{
        status: string;
        credit_status: string;
        failure_json: { failureCode?: string; noticeType?: string } | null;
      }>(
        `
          SELECT status, credit_status, failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [videoTask.taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE task_id = $1",
        [videoTask.taskId],
      );

      assert.deepEqual(expired, { status: "failed", failureCode: "provider_poll_timeout" });
      assert.equal(snapshot.rows[0]?.status, "result_unknown");
      assert.equal(snapshot.rows[0]?.credit_status, "manual_review_required");
      assert.equal(snapshot.rows[0]?.failure_json?.failureCode, "provider_poll_timeout");
      assert.equal(snapshot.rows[0]?.failure_json?.noticeType, "manual_review");
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 135);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 0);
      assert.equal(reservation.rows[0]?.status, "manual_review_required");
    } finally {
      await server.close();
    }
  });

  it("persists Seedance provider failure details so task queries can replay them", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'seedance-2-0-i2v',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":135}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
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
          throw new Error("failed provider tasks should not upload artifacts");
        },
      },
    };
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
    };
    const fetchImpl = (async (url) => {
      if (String(url).includes("/db/query/seedance-provider-failed-task-1")) {
        return new Response(
          JSON.stringify({
            data: {
              task_id: "seedance-provider-failed-task-1",
              status: "failed",
              error: {
                code: "content_policy",
                message: "First frame violates provider policy.",
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            task_id: "seedance-provider-failed-task-1",
            status: "queued",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
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
      const cookie = await login(server.origin, "13800138006");
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-provider-failed-project");
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-provider-failed-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            motionPrompt: "camera slowly pushes in",
            model: "seedance-i2v-pro",
            parameters: {
              durationSec: 5,
              resolution: "1080p",
              aspectRatio: "16:9",
              firstFrame: {
                name: "first-frame.png",
                url: "https://input.example.test/first-frame.png",
              },
            },
          }),
        },
      );
      const videoTask = (await videoTaskResponse.json()).data;

      await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.taskId,
        env,
        fetchImpl,
        now: new Date("2026-06-03T02:20:00.000Z"),
      });
      const pollResult = await processSeedanceVideoPollJob(db, {
        taskId: videoTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T02:21:00.000Z"),
      });
      const failedTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${videoTask.taskId}`,
        { headers: { cookie } },
      );
      const failedTask = (await failedTaskResponse.json()).data;
      const failedSnapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        failure_json: {
          failureCode?: string;
          providerMessage?: string;
        } | null;
      }>(
        `
          SELECT status, progress_stage, credit_status, failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [videoTask.taskId],
      );

      assert.deepEqual(pollResult, { status: "failed", failureCode: "provider_failed" });
      assert.equal(failedTask.status, "failed");
      assert.equal(failedTask.failureCode, "provider_failed");
      assert.equal(failedTask.failure.providerStatus, "failed");
      assert.equal(failedTask.failure.providerErrorCode, "content_policy");
      assert.equal(failedTask.failure.providerMessage, "First frame violates provider policy.");
      assert.equal(failedSnapshot.rows[0]?.status, "failed");
      assert.equal(failedSnapshot.rows[0]?.progress_stage, "failed");
      assert.equal(failedSnapshot.rows[0]?.credit_status, "released");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.failureCode, "provider_failed");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.providerMessage, "First frame violates provider policy.");
    } finally {
      await server.close();
    }
  });

  it("keeps Seedance video tasks queued when the provider submit limiter is exhausted", async () => {
    const db = await createMigratedTestDb();
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
    };
    const providerCalls: string[] = [];
    const fetchImpl = (async (url) => {
      providerCalls.push(String(url));
      return new Response(
        JSON.stringify({
          data: {
            task_id: "seedance-rate-limited-task-1",
            status: "queued",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const phone = "13800138002";
      const normalizedPhone = normalizeCnPhone(phone);
      await seedCreatorMembershipForPhone(db, normalizedPhone);
      await seedActiveGenerationMembership(db, {
        organizationId: await readOrganizationIdForPhone(db, normalizedPhone),
      });
      const cookie = await login(server.origin, phone);
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-rate-limit-project");
      const projectOrganizationId = await readProjectOrganizationId(db, created.projectId);
      const userId = await readUserIdForPhone(db, normalizedPhone);
      await grantCredits(db, {
        compatibilityOrganizationId: projectOrganizationId,
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-rate-limit-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            motionPrompt: "camera slowly pushes in",
            model: "seedance-i2v-pro",
            parameters: {
              durationSec: 5,
              resolution: "1080p",
              aspectRatio: "16:9",
              firstFrame: {
                name: "first-frame.png",
                url: "https://input.example.test/first-frame.png",
              },
            },
          }),
        },
      );
      const videoTaskEnvelope = await videoTaskResponse.json();
      assert.equal(videoTaskResponse.status, 200, `video task failed: ${JSON.stringify(videoTaskEnvelope)}`);
      const videoTask = videoTaskEnvelope.data;
      let limiterInput: Record<string, unknown> | null = null;

      const submitResult = await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.taskId,
        env,
        fetchImpl,
        rateLimiter: {
          async acquireSubmitPermit(input) {
            limiterInput = input as unknown as Record<string, unknown>;
            return { granted: false, retryAfterMs: 3000, reason: "rate:provider:volcengine" };
          },
          async acquirePollPermit() {
            throw new Error("submit rate-limited tasks should not acquire poll permits");
          },
        },
        userConcurrencyLimit: 10,
        now: new Date("2026-06-03T03:00:00.000Z"),
      });
      const queuedTask = await db.query<{ status: string }>(
        "SELECT status FROM tasks WHERE id = $1",
        [videoTask.taskId],
      );

      assert.deepEqual(submitResult, {
        status: "rate_limited",
        retryAfterMs: 3000,
        reason: "rate:provider:volcengine",
      });
      assert.deepEqual(limiterInput, {
        providerName: "volcengine",
        modelCode: "seedance-i2v-pro",
        organizationId: String(limiterInput?.organizationId ?? ""),
        rpmLimit: 1_000_000_000,
        providerConcurrentLimit: 1_000_000_000,
        modelConcurrentLimit: 1_000_000_000,
        tenantConcurrentLimit: 10,
        leaseMs: 120000,
        now: new Date("2026-06-03T03:00:00.000Z"),
      });
      assert.equal(providerCalls.length, 0);
      assert.equal(queuedTask.rows[0]?.status, "queued");
    } finally {
      await server.close();
    }
  });

  it("keeps Seedance video tasks running when the provider poll limiter is exhausted", async () => {
    const db = await createMigratedTestDb();
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
    };
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
          throw new Error("poll rate-limited tasks should not upload artifacts");
        },
      },
    };
    const providerCalls: string[] = [];
    const fetchImpl = (async (url) => {
      providerCalls.push(String(url));
      return new Response(
        JSON.stringify({
          data: {
            task_id: "seedance-poll-limited-task-1",
            status: "running",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138002");
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-poll-rate-limit-project");
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-poll-rate-limit-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            motionPrompt: "camera slowly pushes in",
            model: "seedance-i2v-pro",
            parameters: {
              durationSec: 5,
              resolution: "1080p",
              aspectRatio: "16:9",
              firstFrame: {
                name: "first-frame.png",
                url: "https://input.example.test/first-frame.png",
              },
            },
          }),
        },
      );
      const videoTask = (await videoTaskResponse.json()).data;
      const submitResult = await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.taskId,
        env,
        fetchImpl,
        now: new Date("2026-06-03T03:10:00.000Z"),
      });
      let limiterInput: Record<string, unknown> | null = null;

      const pollResult = await processSeedanceVideoPollJob(db, {
        taskId: videoTask.taskId,
        runtime,
        env,
        fetchImpl,
        rateLimiter: {
          async acquireSubmitPermit() {
            throw new Error("poll rate-limited tasks should not acquire submit permits");
          },
          async acquirePollPermit(input) {
            limiterInput = input as unknown as Record<string, unknown>;
            return { granted: false, retryAfterMs: 2800, reason: "rate:provider:volcengine:poll" };
          },
        },
        now: new Date("2026-06-03T03:10:10.000Z"),
      });
      const runningTask = await db.query<{ status: string }>(
        "SELECT status FROM tasks WHERE id = $1",
        [videoTask.taskId],
      );

      assert.deepEqual(submitResult, {
        status: "submitted",
        externalRequestId: "seedance-poll-limited-task-1",
      });
      assert.deepEqual(pollResult, {
        status: "rate_limited",
        retryAfterMs: 2800,
        reason: "rate:provider:volcengine:poll",
      });
      assert.deepEqual(limiterInput, {
        providerName: "volcengine",
        modelCode: "seedance-i2v-pro",
        organizationId: String(limiterInput?.organizationId ?? ""),
        rpmLimit: 60,
        providerConcurrentLimit: 5,
        modelConcurrentLimit: 40,
        tenantConcurrentLimit: 40,
        leaseMs: 60000,
        now: new Date("2026-06-03T03:10:10.000Z"),
      });
      assert.equal(providerCalls.length, 1);
      assert.equal(runningTask.rows[0]?.status, "running");
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

async function createProjectAndEpisode(origin: string, cookie: string, idempotencyKey = "seedance-worker-project") {
  const createResponse = await fetch(`${origin}/api/creator/project/create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      cookie,
    },
    body: JSON.stringify({
      name: "Seedance Worker",
      scriptInput: "Episode 1: Worker handles Seedance.",
      aspectRatio: "16:9",
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
    body: JSON.stringify({ title: "Seedance Worker Task" }),
  });
  const episode = await episodeResponse.json();
  return { projectId: created.project.id, episodeId: episode.data.episode.id };
}

type SeedanceWorkerTestDb = Awaited<ReturnType<typeof createDevDb>>;

async function seedCreatorMembershipForPhone(
  db: SeedanceWorkerTestDb,
  phoneE164: string,
) {
  await ensurePasswordLoginUser(db, phoneE164);
  const userId = await readUserIdForPhone(db, phoneE164);
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  await db.query(
    `
      INSERT INTO organizations (id, name, status, credit_balance_cached)
      VALUES ($1, 'Seedance Worker Test Org', 'active', 0)
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Seedance Worker Test Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES ($1, $2, $3, $4, 'creator', 'active')
      ON CONFLICT (organization_id, workspace_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          status = EXCLUDED.status
    `,
    [randomUUID(), organizationId, workspaceId, userId],
  );
}

async function readUserIdForPhone(db: SeedanceWorkerTestDb, phoneE164: string) {
  const user = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE phone_e164 = $1 LIMIT 1",
    [phoneE164],
  );
  const userId = user.rows[0]?.id;
  assert.ok(userId, `missing user for ${phoneE164}`);
  return userId;
}

async function readOrganizationIdForPhone(db: SeedanceWorkerTestDb, phoneE164: string) {
  const membership = await db.query<{ organization_id: string }>(
    `
      SELECT m.organization_id
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE u.phone_e164 = $1
      ORDER BY m.created_at ASC
      LIMIT 1
    `,
    [phoneE164],
  );
  const organizationId = membership.rows[0]?.organization_id;
  assert.ok(organizationId, `missing organization for ${phoneE164}`);
  return organizationId;
}

async function readProjectOrganizationId(db: SeedanceWorkerTestDb, projectId: string) {
  const project = await db.query<{ organization_id: string }>(
    "SELECT organization_id FROM projects WHERE id = $1 LIMIT 1",
    [projectId],
  );
  const organizationId = project.rows[0]?.organization_id;
  assert.ok(organizationId, `missing project organization for ${projectId}`);
  return organizationId;
}

async function seedActiveGenerationMembership(
  db: SeedanceWorkerTestDb,
  input: { organizationId: string },
) {
  const now = new Date("2026-06-08T08:00:00.000Z");
  const periodEndAt = new Date("2026-08-08T08:00:00.000Z");
  await db.query(
    `
      UPDATE memberships
      SET membership_tier = 'professional',
          purchase_at = $2,
          expires_at = $3,
          gift_credits = 0,
          status = 'active'
      WHERE organization_id = $1
    `,
    [input.organizationId, now, periodEndAt],
  );
}

async function seedProviderSucceededSeedanceTask(
  db: SeedanceWorkerTestDb,
  input: {
    taskId: string;
    workflowId: string;
    attemptId: string;
    providerRequestId: string;
    episodeId: string;
    videoUrl: string;
    now: Date;
  },
) {
  const organizationId = "10000000-0000-4000-8000-000000000201";
  const workspaceId = "20000000-0000-4000-8000-000000000201";
  const projectId = "30000000-0000-4000-8000-000000000201";
  const userId = "70000000-0000-4000-8000-000000000201";
  const snapshot = {
    kind: "video",
    episodeId: input.episodeId,
    targetType: "episode",
    targetId: input.episodeId,
    prompt: "camera slowly pushes in",
    model: "seedance-i2v-pro",
    providerExecutor: "seedance",
    parameters: {
      durationSec: 5,
      resolution: "1080p",
      aspectRatio: "16:9",
    },
    requestedAt: input.now.toISOString(),
    timeoutAt: new Date(input.now.getTime() + 30 * 60_000).toISOString(),
  };

  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, $2, 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [userId, "13800138201"],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status, credit_balance_cached)
      VALUES ($1, 'Seedance Finalize Test Org', 'active', 0)
      ON CONFLICT (id) DO NOTHING
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Seedance Finalize Test Workspace', 'active')
      ON CONFLICT (organization_id, id) DO NOTHING
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO projects (
        id,
        organization_id,
        workspace_id,
        name,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id
      )
      VALUES ($1, $2, $3, 'Seedance Finalize Test Project', '16:9', '1080p', 'script_input', $4)
      ON CONFLICT (organization_id, id) DO NOTHING
    `,
    [projectId, organizationId, workspaceId, userId],
  );
  await db.query(
    `
      INSERT INTO episodes (
        id,
        organization_id,
        project_id,
        title,
        sequence,
        status,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'Seedance Finalize Test Episode', 1, 'draft', $4, $5, $5)
      ON CONFLICT (organization_id, id) DO NOTHING
    `,
    [input.episodeId, organizationId, projectId, userId, input.now],
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id,
        started_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'episode_video_generation', 'running', $5::jsonb, $6, $7, $7, $7)
    `,
    [
      input.workflowId,
      organizationId,
      workspaceId,
      projectId,
      JSON.stringify(snapshot),
      userId,
      input.now,
    ],
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        locked_by,
        locked_until,
        heartbeat_at,
        current_attempt_id,
        input_snapshot_json,
        target_entity_type,
        target_entity_id,
        attempt_count,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, 'episode_generate_video', 'running',
        'generation-submit-video', 'seedance-video-worker', $6, $7,
        $8, $9::jsonb, 'episode', $10, 1, $7, $7
      )
    `,
    [
      input.taskId,
      organizationId,
      workspaceId,
      projectId,
      input.workflowId,
      new Date(input.now.getTime() + 15 * 60_000),
      input.now,
      input.attemptId,
      JSON.stringify(snapshot),
      input.episodeId,
    ],
  );
  await db.query(
    `
      INSERT INTO task_attempts (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_id,
        attempt_number,
        status,
        locked_by,
        locked_until,
        heartbeat_at,
        started_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 1, 'running', 'seedance-video-worker', $7, $8, $8, $8, $8)
    `,
    [
      input.attemptId,
      organizationId,
      workspaceId,
      projectId,
      input.workflowId,
      input.taskId,
      new Date(input.now.getTime() + 15 * 60_000),
      input.now,
    ],
  );
  await db.query(
    `
      INSERT INTO provider_requests (
        id,
        workspace_id,
        project_id,
        workflow_id,
        task_id,
        attempt_id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        status,
        external_submission_started_at,
        external_request_id,
        response_redacted_json,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, 'volcengine', 'episode.video.generate',
        $7, 'request-hash', 'payload-ref', 'payload-hash', '{}'::jsonb,
        'succeeded', $8, $9, $10::jsonb, $11, $8, $8
      )
    `,
    [
      input.providerRequestId,
      workspaceId,
      projectId,
      input.workflowId,
      input.taskId,
      input.attemptId,
      `seedance-finalize-${input.taskId}`,
      input.now,
      `external-${input.taskId}`,
      JSON.stringify({
        status: "succeeded",
        videoUrl: input.videoUrl,
      }),
      userId,
    ],
  );
  await db.query(
    `
      INSERT INTO ai_generation_task_snapshots (
        id,
        organization_id,
        workspace_id,
        project_id,
        episode_id,
        target_type,
        target_id,
        workflow_id,
        task_id,
        attempt_id,
        provider_request_id,
        model_code,
        media_type,
        task_mode,
        status,
        progress_stage,
        progress_percent,
        request_summary_json,
        provider_status_json,
        result_assets_json,
        estimated_credits,
        credit_status,
        credit_summary_json,
        submitted_at,
        started_at,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, 'episode', $5, $6, $7, $8, $9,
        'seedance-i2v-pro', 'video', 'video.image_to_video',
        'running', 'saving_asset', 90, $10::jsonb, $11::jsonb, '[]'::jsonb,
        0, 'not_required', '{}'::jsonb, $12, $12, $12, $12
      )
    `,
    [
      randomUUID(),
      organizationId,
      workspaceId,
      projectId,
      input.episodeId,
      input.workflowId,
      input.taskId,
      input.attemptId,
      input.providerRequestId,
      JSON.stringify({
        prompt: snapshot.prompt,
        parameters: snapshot.parameters,
        targetType: "episode",
        targetId: input.episodeId,
      }),
      JSON.stringify({
        provider: "seedance",
        externalRequestId: `external-${input.taskId}`,
        providerStatus: "succeeded",
      }),
      input.now,
    ],
  );

  return {
    organizationId,
    workspaceId,
    projectId,
    taskId: input.taskId,
    attemptId: input.attemptId,
    providerRequestId: input.providerRequestId,
  };
}
