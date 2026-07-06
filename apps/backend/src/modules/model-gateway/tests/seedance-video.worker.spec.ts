import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { normalizeCnPhone } from "../../identity/phone-auth.utils.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../identity/team-account-credentials.service.ts";
import { grantCredits, reserveCredits } from "../../credit-billing/credit-ledger.service.ts";
import { createPhoneAuthDevServer as createPhoneAuthDevServerBase } from "../../../entrypoints/phone-auth-dev-server.ts";
import { createDevDb } from "../../shared/db/dev-db.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import {
  expireSeedanceVideoPollJob,
  finalizeSeedanceVideoArtifactJob,
  processSeedanceVideoPollJob,
  processSeedanceVideoSubmitJob,
} from "../seedance-video.worker.ts";
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
      const videoTaskEnvelope = await videoTaskResponse.json();
      assert.equal(videoTaskResponse.status, 200, JSON.stringify(videoTaskEnvelope));
      assert.ok(videoTaskEnvelope.data?.taskId, JSON.stringify(videoTaskEnvelope));
      const videoTask = videoTaskEnvelope.data;
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
      const postPollSnapshot = await db.query<{
        progress_stage: string;
        progress_percent: number | null;
      }>(
        `
          SELECT progress_stage, progress_percent
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [videoTask.taskId],
      );
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
      assert.equal(postPollTask.progressStage, "saving_asset");
      assert.equal(postPollTask.progressPercent, 75);
      assert.equal(postPollSnapshot.rows[0]?.progress_stage, "saving_asset");
      assert.equal(postPollSnapshot.rows[0]?.progress_percent, 75);
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

  it("marks Seedance video upload failed when the provider artifact stream aborts", async () => {
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
        async putObject(input) {
          for await (const _chunk of input.body as AsyncIterable<Uint8Array>) {
            // Consume the stream so provider-side aborts surface through putObject.
          }
          return { eTag: "should-not-complete" };
        },
      },
    };
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "1",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url) => {
      if (String(url).includes("/db/create")) {
        return new Response(
          JSON.stringify({ data: { task_id: "seedance-aborted-stream-task" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (String(url).includes("/db/query/seedance-aborted-stream-task")) {
        return new Response(
          JSON.stringify({
            data: {
              task_id: "seedance-aborted-stream-task",
              status: "succeeded",
              video_url: "https://cdn.example.test/aborted-video.mp4",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (String(url) === "https://cdn.example.test/aborted-video.mp4") {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]));
              controller.error(new Error("provider stream aborted"));
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "video/mp4",
              "content-length": "6",
            },
          },
        );
      }
      return new Response(JSON.stringify({ data: { task_id: "seedance-aborted-stream-task" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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
      const phone = "13800138014";
      const normalizedPhone = normalizeCnPhone(phone);
      const cookie = await login(server.origin, phone);
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-aborted-stream-project");
      const userId = await readUserIdForPhone(db, normalizedPhone);
      const projectScope = await readProjectScope(db, created.projectId);
      await db.query(
        `
          UPDATE memberships
          SET membership_tier = 'professional',
              expires_at = '2099-01-01T00:00:00.000Z',
              status = 'active'
          WHERE user_id = $1
        `,
        [userId],
      );
      await db.query("DELETE FROM membership_periods");
      await grantCredits(db, {
        compatibilityOrganizationId: projectScope.organizationId,
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date("2026-06-03T01:19:00.000Z"),
      });
      const taskSnapshot = {
        kind: "video",
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        prompt: "camera slowly pushes in",
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
        providerExecutor: "seedance",
        requestedAt: "2026-06-03T01:19:00.000Z",
        cost: 135,
      };
      const workflow = await createWorkflowWithTasks(db, {
        organizationId: projectScope.organizationId,
        workspaceId: projectScope.workspaceId,
        projectId: created.projectId,
        workflowType: "episode_video_generation",
        inputSnapshot: taskSnapshot,
        createdByUserId: userId,
        tasks: [
          {
            taskType: "episode_generate_video",
            queueName: "generation-submit-video",
            targetEntityType: "episode",
            targetEntityId: created.episodeId,
            inputSnapshot: taskSnapshot,
          },
        ],
      });
      const videoTask = workflow.tasks[0]!;
      await upsertQueuedGenerationTaskSnapshot(db, {
        organizationId: projectScope.organizationId,
        workspaceId: projectScope.workspaceId,
        projectId: created.projectId,
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        workflowId: workflow.workflow.id,
        taskId: videoTask.id,
        modelConfigId: null,
        creditReservationId: null,
        modelCode: "seedance-i2v-pro",
        mediaType: "video",
        taskMode: "video",
        estimatedCredits: 135,
        requestSummary: taskSnapshot,
        creditSummary: { reserved: 135 },
        now: new Date("2026-06-03T01:19:30.000Z"),
      });

      await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.id,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:20:00.000Z"),
      });
      await processSeedanceVideoPollJob(db, {
        taskId: videoTask.id,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:20:10.000Z"),
      });
      const postPollSnapshot = await db.query<{
        progress_stage: string;
        progress_percent: number | null;
      }>(
        `
          SELECT progress_stage, progress_percent
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [videoTask.id],
      );
      const finalizeResult = await finalizeSeedanceVideoArtifactJob(db, {
        taskId: videoTask.id,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:20:20.000Z"),
      });
      const taskRow = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [videoTask.id],
      );

      assert.equal(postPollSnapshot.rows[0]?.progress_stage, "saving_asset");
      assert.equal(postPollSnapshot.rows[0]?.progress_percent, 75);
      assert.deepEqual(finalizeResult, { status: "failed", failureCode: "provider_output_upload_failed" });
      assert.equal(taskRow.rows[0]?.status, "failed");
      assert.equal(taskRow.rows[0]?.failure_code, "provider_output_upload_failed");
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
      const videoTaskEnvelope = await videoTaskResponse.json();
      assert.equal(videoTaskResponse.status, 200, JSON.stringify(videoTaskEnvelope));
      assert.ok(videoTaskEnvelope.data?.taskId, JSON.stringify(videoTaskEnvelope));
      const videoTask = videoTaskEnvelope.data;

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
        request_body_json: Record<string, unknown>;
        request_text: string | null;
        response_text: string | null;
      }>(
        `
          SELECT status, failure_code, request_body_json, request_text, response_text
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
      assert.match(failedSnapshot.rows[0]?.provider_status_json.errorMessage ?? "", /video_provider_400/);
      assert.equal(failedSnapshot.rows[0]?.provider_status_json.failureCode, "provider_submission_ambiguous");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.failureCode, "provider_submission_failed");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.providerFailureCode, "provider_submission_ambiguous");
      assert.match(failedSnapshot.rows[0]?.failure_json?.errorMessage ?? "", /请求内容缺失/);
      assert.equal(requestLog.rows[0]?.status, "failed");
      assert.equal(requestLog.rows[0]?.failure_code, "provider_submission_failed");
      assert.equal(requestLog.rows[0]?.request_text, null);
      assert.deepEqual(requestLog.rows[0]?.request_body_json, {
        model: "seedance-2-0-i2v",
        content: [
          {
            type: "text",
            text: "camera slowly pushes in",
          },
          {
            type: "image_url",
            image_url: {
              url: "https://input.example.test/first-frame.png",
            },
            role: "first_frame",
          },
        ],
        ratio: "16:9",
        resolution: "1080p",
        duration: 5,
        watermark: false,
      });
      assert.match(requestLog.rows[0]?.response_text ?? "", /请求内容缺失/);
    } finally {
      await server.close();
    }
  });

  it("logs the final Extra Token request body when video submission fails", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_name = 'Extra Token',
            provider_protocol = 'custom_http',
            provider_model = 'doubao-seedance-2-0-mini-260615',
            provider_config_json = '{"baseURL":"https://ark.cn-beijing.volces.com","requestPath":"/api/v3/contents/generations/tasks","createTaskEndpoint":"/api/v3/contents/generations/tasks","requestFormat":"volcengine_ark_contents_generation","apiKeyEnv":"EXTRA_TOEKN_API_KEY"}'::jsonb,
            parameter_schema_json = parameter_schema_json
              || '{"durationSec":{"type":"integer","minimum":4,"maximum":15}}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
      `,
    );
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
      EXTRA_TOEKN_API_KEY: "extra-token-test-key",
    };
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "parameters.duration must be an integer of at least 3 seconds.",
            type: "invalid_request_error",
            code: "invalid_request",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      )) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const phone = "13800138008";
      const normalizedPhone = normalizeCnPhone(phone);
      const cookie = await login(server.origin, phone);
      const created = await createProjectAndEpisode(server.origin, cookie, "extra-token-log-final-request-project");
      const userId = await readUserIdForPhone(db, normalizedPhone);
      const projectOrganizationId = await readProjectOrganizationId(db, created.projectId);
      await db.query(
        `
          UPDATE memberships
          SET membership_tier = 'professional',
              expires_at = '2099-01-01T00:00:00.000Z',
              status = 'active'
          WHERE user_id = $1
        `,
        [userId],
      );
      await db.query("DELETE FROM membership_periods");
      await grantCredits(db, {
        compatibilityOrganizationId: projectOrganizationId,
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date("2026-06-03T01:07:00.000Z"),
      });
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "extra-token-log-final-request-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            motionPrompt: "camera slowly pushes in",
            model: "seedance-i2v-pro",
            parameters: {
              durationSec: 4,
              resolution: "480p",
              ratio: "9:16",
              filePaths: [
                "https://input.example.test/scene.png",
                "https://input.example.test/character.png",
              ],
              videoFilePaths: [
                "https://input.example.test/reference.mp4",
              ],
              audioFilePaths: [
                "https://input.example.test/reference.mp3",
              ],
              firstFrame: {
                name: "first-frame.png",
                url: "https://input.example.test/first-frame.png",
              },
            },
          }),
        },
      );
      const videoTaskEnvelope = await videoTaskResponse.json();
      assert.equal(videoTaskResponse.status, 200, JSON.stringify(videoTaskEnvelope));
      assert.ok(videoTaskEnvelope.data?.taskId, JSON.stringify(videoTaskEnvelope));
      const videoTask = videoTaskEnvelope.data;

      await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.taskId,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:08:00.000Z"),
      });
      const requestLog = await db.query<{
        request_body_json: Record<string, unknown>;
        request_text: string | null;
      }>(
        `
          SELECT request_body_json, request_text
          FROM user_model_request_logs
          WHERE task_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [videoTask.taskId],
      );
      const requestBody = requestLog.rows[0]?.request_body_json;

      assert.equal(requestLog.rows[0]?.request_text, null);
      assert.deepEqual(Object.keys(requestBody ?? {}).sort(), [
        "input",
        "model",
        "parameters",
      ].sort());
      assert.equal(requestBody?.model, "doubao-seedance-2-0-mini-260615");
      assert.deepEqual(requestBody?.parameters, {
        duration: 5,
        resolution: "720p",
        ratio: "9:16",
        generate_audio: true,
        watermark: false,
      });
      assert.equal("messages" in (requestBody ?? {}), false);
      assert.deepEqual(
        (requestBody?.input as Record<string, unknown>)?.media,
        [
          {
            role: "reference_image",
            type: "image_url",
            image_url: {
              url: "https://input.example.test/scene.png",
            },
          },
          {
            role: "reference_image",
            type: "image_url",
            image_url: {
              url: "https://input.example.test/character.png",
            },
          },
          {
            role: "reference_image",
            type: "image_url",
            image_url: {
              url: "https://input.example.test/first-frame.png",
            },
          },
          {
            role: "reference_video",
            type: "video_url",
            video_url: {
              url: "https://input.example.test/reference.mp4",
            },
          },
          {
            role: "reference_audio",
            type: "audio_url",
            audio_url: {
              url: "https://input.example.test/reference.mp3",
            },
          },
        ],
      );
    } finally {
      await server.close();
    }
  });

  it("logs the final Lingdong video request body and request format", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_name = '灵动中转',
            provider_protocol = 'lingdong_api',
            provider_model = 'sd-2-11',
            provider_config_json = '{"baseURL":"https://www.lingdongapi.com","createTaskEndpoint":"/v1/videos","queryTaskEndpoint":"/v1/video/generations/{taskId}","requestFormat":"lingdong_video","apiKeyEnv":"sd2_ld"}'::jsonb,
            parameter_schema_json = parameter_schema_json
              || '{"durationSec":{"type":"integer","minimum":4,"maximum":15}}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
      `,
    );
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
      sd2_ld: "lingdong-test-key",
    };
    let capturedBody = "";
    const fetchImpl = (async (_url, init) => {
      capturedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          task_id: "lingdong-task-logged",
          status: "queued",
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
      const phone = "13800138008";
      const normalizedPhone = normalizeCnPhone(phone);
      const cookie = await login(server.origin, phone);
      const created = await createProjectAndEpisode(server.origin, cookie, "lingdong-log-final-request-project");
      const userId = await readUserIdForPhone(db, normalizedPhone);
      const projectScope = await readProjectScope(db, created.projectId);
      await db.query(
        `
          UPDATE memberships
          SET membership_tier = 'professional',
              expires_at = '2099-01-01T00:00:00.000Z',
              status = 'active'
          WHERE user_id = $1
        `,
        [userId],
      );
      await db.query("DELETE FROM membership_periods");
      await grantCredits(db, {
        compatibilityOrganizationId: projectScope.organizationId,
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date("2026-06-03T01:17:00.000Z"),
      });
      const taskSnapshot = {
        kind: "video",
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        prompt: "camera slowly pushes in",
        model: "seedance-i2v-pro",
        parameters: {
          durationSec: 15,
          resolution: "720p",
          ratio: "9:16",
          filePaths: [
            "https://input.example.test/scene.png",
            "https://input.example.test/character.png",
          ],
          audioFilePaths: [
            "https://input.example.test/reference.wav",
            "https://input.example.test/reference.mp3",
          ],
        },
        providerExecutor: "seedance",
        requestedAt: "2026-06-03T01:17:00.000Z",
        cost: 135,
      };
      const workflow = await createWorkflowWithTasks(db, {
        organizationId: projectScope.organizationId,
        workspaceId: projectScope.workspaceId,
        projectId: created.projectId,
        workflowType: "episode_video_generation",
        inputSnapshot: taskSnapshot,
        createdByUserId: userId,
        tasks: [
          {
            taskType: "episode_generate_video",
            queueName: "generation-submit-video",
            targetEntityType: "episode",
            targetEntityId: created.episodeId,
            inputSnapshot: taskSnapshot,
          },
        ],
      });
      const videoTask = workflow.tasks[0]!;

      await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.id,
        env,
        fetchImpl,
        now: new Date("2026-06-03T01:18:00.000Z"),
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
        [videoTask.id],
      );

      assert.equal(requestLog.rows[0]?.request_format, "lingdong_video");
      assert.equal(requestLog.rows[0]?.request_text, null);
      assert.deepEqual(requestLog.rows[0]?.request_body_json, JSON.parse(capturedBody));
      assert.deepEqual(requestLog.rows[0]?.request_body_json, {
        model: "sd-2-11",
        ratio: "9:16",
        duration: 15,
        resolution: "720p",
        generate_audio: true,
        watermark: false,
        prompt: "camera slowly pushes in",
        images: [
          "https://input.example.test/scene.png",
          "https://input.example.test/character.png",
        ],
        audios: [
          "https://input.example.test/reference.wav",
          "https://input.example.test/reference.mp3",
        ],
      });
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
      assert.equal(failedTask.failure.providerMessage, "参考图或提示词不符合内容安全策略，请调整素材或提示词后重试。");
      assert.equal(failedSnapshot.rows[0]?.status, "failed");
      assert.equal(failedSnapshot.rows[0]?.progress_stage, "failed");
      assert.equal(failedSnapshot.rows[0]?.credit_status, "released");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.failureCode, "provider_failed");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.providerMessage, "参考图或提示词不符合内容安全策略，请调整素材或提示词后重试。");
    } finally {
      await server.close();
    }
  });

  it("fails Seedance video tasks and releases credits when provider poll returns not found", async () => {
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
          throw new Error("not-found poll tasks should not upload artifacts");
        },
      },
    };
    const env = {
      SEEDANCE_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      VOLCENGINE_ARK_API_KEY: "seedance-test-key",
    };
    const fetchImpl = (async (url) => {
      if (String(url).includes("/db/query/seedance-not-found-task-1")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "ResourceNotFound",
              message: "The specified resource seedance-not-found-task-1 is not found",
            },
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            task_id: "seedance-not-found-task-1",
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
      const phone = "13800138015";
      const normalizedPhone = normalizeCnPhone(phone);
      const cookie = await login(server.origin, phone);
      const created = await createProjectAndEpisode(server.origin, cookie, "seedance-poll-not-found-project");
      const userId = await readUserIdForPhone(db, normalizedPhone);
      const projectScope = await readProjectScope(db, created.projectId);
      await grantCredits(db, {
        compatibilityOrganizationId: projectScope.organizationId,
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date("2026-06-03T02:29:00.000Z"),
      });
      const taskSnapshot = {
        kind: "video",
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        prompt: "camera slowly pushes in",
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
        providerExecutor: "seedance",
        requestedAt: "2026-06-03T02:29:00.000Z",
        cost: 135,
      };
      const workflow = await createWorkflowWithTasks(db, {
        organizationId: projectScope.organizationId,
        workspaceId: projectScope.workspaceId,
        projectId: created.projectId,
        workflowType: "episode_video_generation",
        inputSnapshot: taskSnapshot,
        createdByUserId: userId,
        tasks: [
          {
            taskType: "episode_generate_video",
            queueName: "generation-submit-video",
            targetEntityType: "episode",
            targetEntityId: created.episodeId,
            inputSnapshot: taskSnapshot,
          },
        ],
      });
      const videoTask = workflow.tasks[0]!;
      const notFoundReservation = await reserveCredits(db, {
        compatibilityOrganizationId: projectScope.organizationId,
        userId,
        amount: 135,
        sourceType: "generation_task",
        sourceId: videoTask.id,
        reason: "reserve generation credits",
        workspaceId: projectScope.workspaceId,
        projectId: created.projectId,
        workflowId: workflow.workflow.id,
        taskId: videoTask.id,
        createdByUserId: userId,
        now: new Date("2026-06-03T02:29:10.000Z"),
      });
      await upsertQueuedGenerationTaskSnapshot(db, {
        organizationId: projectScope.organizationId,
        workspaceId: projectScope.workspaceId,
        projectId: created.projectId,
        episodeId: created.episodeId,
        targetType: "episode",
        targetId: created.episodeId,
        workflowId: workflow.workflow.id,
        taskId: videoTask.id,
        modelConfigId: null,
        creditReservationId: notFoundReservation.reservation.id,
        modelCode: "seedance-i2v-pro",
        mediaType: "video",
        taskMode: "video",
        estimatedCredits: 135,
        requestSummary: taskSnapshot,
        creditSummary: { reserved: 135 },
        now: new Date("2026-06-03T02:29:30.000Z"),
      });

      await processSeedanceVideoSubmitJob(db, {
        taskId: videoTask.id,
        env,
        fetchImpl,
        now: new Date("2026-06-03T02:30:00.000Z"),
      });
      const pollResult = await processSeedanceVideoPollJob(db, {
        taskId: videoTask.id,
        runtime,
        env,
        fetchImpl,
        rateLimiter: {
          async acquireSubmitPermit() {
            throw new Error("poll test should not acquire submit permits");
          },
          async acquirePollPermit() {
            return { granted: true, release: null } as never;
          },
          async acquireFinalizePermit() {
            throw new Error("poll test should not acquire finalize permits");
          },
        },
        now: new Date("2026-06-03T02:31:00.000Z"),
      });
      const taskRow = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [videoTask.id],
      );
      const providerRequest = await db.query<{
        status: string;
        failure_code: string | null;
        response_redacted_json: { providerStatus?: string; providerDiagnostics?: { httpStatus?: number } };
      }>(
        `
          SELECT status, failure_code, response_redacted_json
          FROM provider_requests
          WHERE task_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [videoTask.id],
      );
      const failedSnapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        failure_json: { failureCode?: string; displayMessage?: string } | null;
      }>(
        `
          SELECT status, progress_stage, credit_status, failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [videoTask.id],
      );
      const reservationRow = await db.query<{
        amount_reserved: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE id = $1",
        [notFoundReservation.reservation.id],
      );
      const requestLog = await db.query<{ status: string; failure_code: string | null }>(
        `
          SELECT status, failure_code
          FROM user_model_request_logs
          WHERE task_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [videoTask.id],
      );

      assert.deepEqual(pollResult, { status: "failed", failureCode: "provider_result_not_found" });
      assert.equal(taskRow.rows[0]?.status, "failed");
      assert.equal(taskRow.rows[0]?.failure_code, "provider_result_not_found");
      assert.equal(providerRequest.rows[0]?.status, "failed");
      assert.equal(providerRequest.rows[0]?.failure_code, "provider_result_not_found");
      assert.equal(providerRequest.rows[0]?.response_redacted_json.providerStatus, "not_found");
      assert.equal(providerRequest.rows[0]?.response_redacted_json.providerDiagnostics?.httpStatus, 404);
      assert.equal(failedSnapshot.rows[0]?.status, "failed");
      assert.equal(failedSnapshot.rows[0]?.progress_stage, "failed");
      assert.equal(failedSnapshot.rows[0]?.credit_status, "released");
      assert.equal(failedSnapshot.rows[0]?.failure_json?.failureCode, "provider_result_not_found");
      assert.match(failedSnapshot.rows[0]?.failure_json?.displayMessage ?? "", /供应商结果已不存在/);
      assert.equal(Number(reservationRow.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservationRow.rows[0]?.amount_released ?? -1), 135);
      assert.equal(reservationRow.rows[0]?.status, "released");
      assert.equal(requestLog.rows[0]?.status, "failed");
      assert.equal(requestLog.rows[0]?.failure_code, "provider_result_not_found");
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

async function readUserIdForPhone(
  db: Awaited<ReturnType<typeof createDevDb>>,
  phoneE164: string,
) {
  const user = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE phone_e164 = $1 LIMIT 1",
    [phoneE164],
  );
  const userId = user.rows[0]?.id;
  assert.ok(userId, `missing user for ${phoneE164}`);
  return userId;
}

async function readProjectOrganizationId(
  db: Awaited<ReturnType<typeof createDevDb>>,
  projectId: string,
) {
  const project = await db.query<{ organization_id: string }>(
    "SELECT organization_id FROM projects WHERE id = $1 LIMIT 1",
    [projectId],
  );
  const organizationId = project.rows[0]?.organization_id;
  assert.ok(organizationId, `missing project organization for ${projectId}`);
  return organizationId;
}

async function readProjectScope(
  db: Awaited<ReturnType<typeof createDevDb>>,
  projectId: string,
) {
  const project = await db.query<{ organization_id: string; workspace_id: string }>(
    "SELECT organization_id, workspace_id FROM projects WHERE id = $1 LIMIT 1",
    [projectId],
  );
  const row = project.rows[0];
  assert.ok(row, `missing project scope for ${projectId}`);
  return {
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
  };
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
