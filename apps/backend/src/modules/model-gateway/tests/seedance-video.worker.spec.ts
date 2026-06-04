import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPhoneAuthDevServer } from "../../../entrypoints/phone-auth-dev-server.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import {
  expireSeedanceVideoPollJob,
  finalizeSeedanceVideoArtifactJob,
  processSeedanceVideoPollJob,
  processSeedanceVideoSubmitJob,
} from "../seedance-video.worker.ts";

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
      const videoTask = (await videoTaskResponse.json()).data;
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

      assert.deepEqual(submitResult, { status: "skipped" });
      assert.equal(failedSnapshot.rows[0]?.status, "failed");
      assert.equal(failedSnapshot.rows[0]?.progress_stage, "failed");
      assert.equal(failedSnapshot.rows[0]?.credit_status, "released");
      assert.match(failedSnapshot.rows[0]?.provider_status_json.errorMessage ?? "", /seedance_video_400/);
      assert.equal(failedSnapshot.rows[0]?.provider_status_json.failureCode, "provider_submission_ambiguous");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.failureCode, "provider_submission_failed");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.providerFailureCode, "provider_submission_ambiguous");
      assert.match(failedSnapshot.rows[0]?.failure_json?.errorMessage ?? "", /content field is required/);
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
    const fetchImpl = (async () => new Response(
      JSON.stringify({
        data: {
          task_id: "seedance-timeout-task-1",
          status: "queued",
        },
      }),
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

      assert.deepEqual(expired, { status: "failed", failureCode: "provider_poll_timeout" });
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
      const cookie = await login(server.origin, "13800138002");
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-rate-limit-project");
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
      const videoTask = (await videoTaskResponse.json()).data;
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
        rpmLimit: 60,
        providerConcurrentLimit: 5,
        modelConcurrentLimit: 5,
        tenantConcurrentLimit: 5,
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
  const requestResponse = await fetch(`${origin}/api/auth/code/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const requested = await requestResponse.json();
  const debugResponse = await fetch(`${origin}/api/auth/dev/challenges/${requested.challengeId}`);
  const debug = await debugResponse.json();
  const verifyResponse = await fetch(`${origin}/api/auth/code/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: requested.challengeId,
      phone,
      code: debug.code,
    }),
  });
  assert.equal(verifyResponse.status, 200);
  return verifyResponse.headers.get("set-cookie") ?? "";
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
