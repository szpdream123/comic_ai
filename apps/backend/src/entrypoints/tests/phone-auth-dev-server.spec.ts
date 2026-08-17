import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { describe, it } from "node:test";

import JSZip from "jszip";

// This suite spins up many dev servers and local DB instances; keep subtests serial to
// avoid cross-test interference from runtime-level resources in the Node test runner.
describe.configure?.({ concurrency: 1 });

import { normalizeCnPhone } from "../../modules/identity/phone-auth.utils.ts";
import type { AuthSessionCache } from "../../modules/identity/auth-session-cache.service.ts";
import { createAuthSession } from "../../modules/identity/session.service.ts";
import { signPaymentCallback } from "../../modules/commerce-payment/commerce-payment.service.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import {
  createPhoneAuthDevServer as createPhoneAuthDevServerBase,
  __phoneAuthDevServerTestUtils,
  generationFailureDisplayMessage,
  shouldSyncSeedanceVideoTaskOnRead,
} from "../phone-auth-dev-server.ts";
import { grantCredits, reserveCredits, settleReservationAllocation } from "../../modules/credit-billing/credit-ledger.service.ts";
import { CumobTextAdapter } from "../../modules/model-gateway/cumob-text.adapter.ts";
import { OpenAICompatibleTextAdapter } from "../../modules/model-gateway/openai-compatible-text.adapter.ts";
import {
  createDevDb,
  markTransientDatabasePersistenceError,
  runWithDatabaseContext,
} from "../../modules/shared/db/dev-db.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createGeoContentService } from "../../modules/geo/geo-content.service.ts";

const loginDbByOrigin = new Map<string, Awaited<ReturnType<typeof createDevDb>>>();
const directUploadPngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const directUploadMp4Bytes = Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

function directUploadPngBytes(seed: number) {
  return Buffer.concat([directUploadPngSignature, Buffer.from([seed, 0, 0, 0])]);
}

function createPhoneAuthDevServer(
  options?: Parameters<typeof createPhoneAuthDevServerBase>[0],
) {
  const mergedOptions = {
    ...(options ?? {}),
    env: {
      NODE_ENV: "test",
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

async function createPhoneAuthDevServerWithTestDb() {
  const db = await createMigratedTestDb();
  return createPhoneAuthDevServer({ db });
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

function fetchProjectShotImageBatch(origin: string, init: RequestInit = {}) {
  const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
  const shotId = typeof body.shotId === "string" ? body.shotId : null;
  return fetch(`${origin}/api/generation/image-tasks`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify({
      ...body,
      target: {
        kind: "project_shot_batch",
        ...(shotId ? { shotId } : {}),
      },
    }),
  });
}

describe("phone auth dev server", { concurrency: false }, () => {
  it("polls SanBao video tasks on read without the unrelated Seedance feature flag", () => {
    assert.equal(shouldSyncSeedanceVideoTaskOnRead("san_bao", {}), true);
    assert.equal(shouldSyncSeedanceVideoTaskOnRead("volcengine_ark_video", {}), false);
    assert.equal(
      shouldSyncSeedanceVideoTaskOnRead("volcengine_ark_video", { SEEDANCE_PROVIDER_ENABLED: "true" }),
      true,
    );
  });

  it("keeps read-time provider recovery and timeout reconciliation on the current attempt", async () => {
    const source = await readFile(new URL("../phone-auth-dev-server.ts", import.meta.url), "utf8");

    assert.match(
      source,
      /async function syncSeedanceVideoTaskOnRead[\s\S]*request\.attempt_id = t\.current_attempt_id[\s\S]*t\.current_attempt_id IS NOT NULL/,
    );
    assert.match(
      source,
      /async function settleTimedOutEpisodeGenerationTask[\s\S]*attempt_id = \$3[\s\S]*UPDATE provider_requests[\s\S]*attempt_id = \$6/,
    );
    assert.match(
      source,
      /async function reconcileDefinitiveProviderSubmissionFailures[\s\S]*provider_request\.attempt_id = task\.current_attempt_id/,
    );
    assert.match(
      source,
      /async function mapGenerationTaskResponse[\s\S]*pr_latest\.attempt_id = t\.current_attempt_id/,
    );
    assert.match(
      source,
      /async function enqueueVideoFinalizeIfProviderResultReady[\s\S]*t\.status IN \('running', 'result_unknown'\)[\s\S]*last_dispatched_at < \$4/,
    );
    assert.match(
      source,
      /async function enqueueVideoFinalizeIfProviderResultReady[\s\S]*generation_queue_stage_assignments[\s\S]*assignment\.stage IN \('fetch', 'persist'\)[\s\S]*assignment\.status IN \('publishing', 'admitted'\)/,
    );
  });

  it("uses the error factory message for SanBao read-time poll failures", () => {
    assert.equal(
      generationFailureDisplayMessage({
        failureCode: "san_bao_insufficient_balance",
        providerMessage: "余额不足",
        providerResponse: { providerMessage: "余额不足" },
      }),
      "三宝影像账户积分不足，请联系管理员充值后重试。",
    );
  });

  it("serves active home media through a stable gateway path and a one-hour COS signature", async () => {
    const db = await createMigratedTestDb();
    const categoryId = randomUUID();
    const videoId = randomUUID();
    const bucket = "home-media-test-1310122982";
    const region = "ap-guangzhou";
    const backgroundSourceUrl = `https://${bucket}.cos.${region}.myqcloud.com/officialAssets/homeBackgroundVideos/test.mp4`;
    const signedRequests: Array<{ bucket: string; objectKey: string; expiresAt: Date }> = [];
    const server = createPhoneAuthDevServer({
      db,
      env: {
        STORAGE_ADAPTER_MODE: "cos",
        STORAGE_BUCKET: bucket,
        STORAGE_REGION: region,
        STORAGE_SIGNED_URL_EXPIRES_SECONDS: "3600",
      },
      storageRuntime: {
        adapter: {
          async createSignedReadUrl(input) {
            signedRequests.push(input);
            return { url: "https://signed.example.test/home-background.mp4", expiresAt: input.expiresAt };
          },
        } as never,
      },
      fetchImpl: async (url) => {
        assert.equal(String(url), "https://signed.example.test/home-background.mp4");
        return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      },
    });
    await db.query(`
      INSERT INTO home_background_settings (id, video_url, poster_url, status, created_at, updated_at)
      VALUES ('homepage', $1, '', 'active', now(), now())
      ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url, poster_url = EXCLUDED.poster_url, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
    `, [backgroundSourceUrl]);
    await db.query(`
      INSERT INTO home_recommendation_categories (id, code, name, status, sort_order, created_at, updated_at)
      VALUES ($1, 'gateway-test', 'Gateway test', 'active', 1, now(), now())
    `, [categoryId]);
    await db.query(`
      INSERT INTO home_recommendation_videos (id, category_id, title, subtitle, cover_url, video_url, duration_label, cover_alt, status, sort_order, created_at, updated_at)
      VALUES ($1, $2, 'Gateway video', '', '', $3, '', '', 'active', 1, now(), now())
    `, [videoId, categoryId, backgroundSourceUrl]);

    try {
      await server.listen(0);
      const payload = await (await fetch(`${server.origin}/api/home-recommendations`)).json() as { data: { background: { videoUrl: string }; categories: Array<{ videos: Array<{ videoUrl: string }> }> } };
      const backgroundMediaUrl = new URL(payload.data.background.videoUrl, server.origin);
      assert.equal(backgroundMediaUrl.pathname, "/api/home-recommendations/background/media");
      assert.ok(backgroundMediaUrl.searchParams.get("v"));
      assert.equal(payload.data.categories[0]?.videos[0]?.videoUrl, `/api/home-recommendations/videos/${videoId}/media`);

      const response = await fetch(backgroundMediaUrl);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]));
      const videoResponse = await fetch(`${server.origin}${payload.data.categories[0]?.videos[0]?.videoUrl}`);
      assert.equal(videoResponse.status, 200);
      assert.deepEqual(signedRequests.map((request) => ({ bucket: request.bucket, objectKey: request.objectKey })), [
        { bucket, objectKey: "officialAssets/homeBackgroundVideos/test.mp4" },
        { bucket, objectKey: "officialAssets/homeBackgroundVideos/test.mp4" },
      ]);
      assert.ok(signedRequests[0]?.expiresAt.getTime() >= Date.now() + 59 * 60 * 1000);
      assert.ok(signedRequests[0]?.expiresAt.getTime() <= Date.now() + 61 * 60 * 1000);

      await db.query(
        "UPDATE home_background_settings SET video_url = $1, updated_at = updated_at + interval '1 second' WHERE id = 'homepage'",
        [`https://${bucket}.cos.${region}.myqcloud.com/private/not-home-media.mp4`],
      );
      const updatedPayload = await (await fetch(`${server.origin}/api/home-recommendations`)).json() as { data: { background: { videoUrl: string } } };
      assert.notEqual(updatedPayload.data.background.videoUrl, payload.data.background.videoUrl);
      const blockedResponse = await fetch(`${server.origin}${updatedPayload.data.background.videoUrl}`, { redirect: "manual" });
      assert.equal(blockedResponse.status, 404);
      assert.equal(signedRequests.length, 2);

      const malformedResponse = await fetch(`${server.origin}/api/home-recommendations/videos/%E0%A4%A/media`, { redirect: "manual" });
      assert.equal(malformedResponse.status, 400);
      assert.equal(signedRequests.length, 2);
    } finally {
      await server.close();
    }
  });

  it("limits repeated anonymous home media signing requests", async () => {
    const db = await createMigratedTestDb();
    const bucket = "home-media-rate-limit-1310122982";
    const region = "ap-guangzhou";
    const signedRequests: Array<{ bucket: string; objectKey: string; expiresAt: Date }> = [];
    const server = createPhoneAuthDevServer({
      db,
      env: {
        STORAGE_ADAPTER_MODE: "cos",
        STORAGE_BUCKET: bucket,
        STORAGE_REGION: region,
        STORAGE_SIGNED_URL_EXPIRES_SECONDS: "3600",
        HOME_MEDIA_SIGNING_PER_IP_PER_MINUTE: "1",
      },
      storageRuntime: {
        adapter: {
          async createSignedReadUrl(input) {
            signedRequests.push(input);
            return { url: "https://signed.example.test/home-background.mp4", expiresAt: input.expiresAt };
          },
        } as never,
      },
      fetchImpl: async () => new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }),
    });
    await db.query(
      `
        INSERT INTO home_background_settings (id, video_url, poster_url, status, created_at, updated_at)
        VALUES ('homepage', $1, '', 'active', now(), now())
        ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
      `,
      [`https://${bucket}.cos.${region}.myqcloud.com/officialAssets/homeBackgroundVideos/test.mp4`],
    );

    try {
      await server.listen(0);
      const first = await fetch(`${server.origin}/api/home-recommendations/background/media`, { redirect: "manual" });
      assert.equal(first.status, 200);
      const limited = await fetch(`${server.origin}/api/home-recommendations/background/media`, { redirect: "manual" });
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) > 0);
      assert.equal(signedRequests.length, 1);
    } finally {
      await server.close();
    }
  });

  it("does not settle a newly-created attempt from a stale legacy failure candidate", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "70000000-0000-4000-8000-000000000319";
      const workflowId = "40000000-0000-4000-8000-000000000319";
      const taskId = "50000000-0000-4000-8000-000000000319";
      const attemptId = "60000000-0000-4000-8000-000000000319";
      const providerRequestId = "62000000-0000-4000-8000-000000000319";
      const now = new Date("2026-08-11T15:00:00.000Z");
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138319', 'active')",
        [userId],
      );
      await db.query(
        `
          INSERT INTO workflows (id, workflow_type, status, input_snapshot_json, created_by_user_id)
          VALUES ($1, 'episode_image_generation', 'running', '{}'::jsonb, $2)
        `,
        [workflowId, userId],
      );
      await db.query(
        `
          INSERT INTO tasks (
            id, workflow_id, task_type, status, queue_name, input_snapshot_json,
            target_entity_type, target_entity_id
          ) VALUES (
            $1, $2, 'episode_generate_image', 'running', 'generation-submit-image',
            '{"kind":"image"}'::jsonb, 'episode', $1
          )
        `,
        [taskId, workflowId],
      );
      await db.query(
        `
          INSERT INTO provider_requests (
            id, workflow_id, task_id, provider_name, provider_operation,
            request_key, request_hash, payload_ref, payload_hash, payload_redacted_json,
            status, failure_code, response_redacted_json, created_by_user_id, created_at, updated_at
          ) VALUES (
            $1::uuid, $2, $3, 'san-bao', 'episode.image.generate', $6, $6,
            $6, $6, '{}'::jsonb, 'result_unknown',
            'provider_submission_ambiguous', '{"providerErrorCode":"san_bao_invalid_response"}'::jsonb,
            $4, $5, $5
          )
        `,
        [
          providerRequestId,
          workflowId,
          taskId,
          userId,
          new Date("2026-08-11T14:59:00.000Z"),
          `stale-legacy:${providerRequestId}`,
        ],
      );
      await db.query(
        `
          INSERT INTO task_attempts (
            id, workflow_id, task_id, attempt_number, status, locked_by,
            locked_until, heartbeat_at, started_at, created_at, updated_at
          ) VALUES ($1, $2, $3, 1, 'running', 'new-attempt', $4, $5, $5, $5, $5)
        `,
        [attemptId, workflowId, taskId, new Date("2026-08-11T15:10:00.000Z"), now],
      );
      await db.query(
        "UPDATE tasks SET current_attempt_id = $2, attempt_count = 1 WHERE id = $1",
        [taskId, attemptId],
      );

      const settled = await __phoneAuthDevServerTestUtils.settleTimedOutEpisodeGenerationTask(db as never, {
        taskId,
        now: new Date("2026-08-11T15:00:01.000Z"),
        failureCode: "san_bao_invalid_response",
        expectedProviderRequestId: providerRequestId,
        expectedAttemptId: null,
        expectedAttemptCount: 0,
      });
      const state = await db.query<{ task_status: string; attempt_status: string; provider_status: string }>(
        `
          SELECT task.status AS task_status,
                 attempt.status AS attempt_status,
                 request.status AS provider_status
          FROM tasks task
          JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
          JOIN provider_requests request ON request.id = $2
          WHERE task.id = $1
        `,
        [taskId, providerRequestId],
      );
      assert.equal(settled, false);
      assert.deepEqual(state.rows[0], {
        task_status: "running",
        attempt_status: "running",
        provider_status: "result_unknown",
      });
    } finally {
      await db.close();
    }
  });

  it("does not settle a task after its stale deterministic provider candidate succeeds", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "70000000-0000-4000-8000-000000000320";
      const workflowId = "40000000-0000-4000-8000-000000000320";
      const taskId = "50000000-0000-4000-8000-000000000320";
      const providerRequestId = "62000000-0000-4000-8000-000000000320";
      const now = new Date("2026-08-11T15:20:00.000Z");
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138320', 'active')",
        [userId],
      );
      await db.query(
        `
          INSERT INTO workflows (id, workflow_type, status, input_snapshot_json, created_by_user_id)
          VALUES ($1, 'episode_image_generation', 'running', '{}'::jsonb, $2)
        `,
        [workflowId, userId],
      );
      await db.query(
        `
          INSERT INTO tasks (
            id, workflow_id, task_type, status, queue_name, input_snapshot_json,
            target_entity_type, target_entity_id
          ) VALUES (
            $1, $2, 'episode_generate_image', 'running', 'generation-submit-image',
            '{"kind":"image"}'::jsonb, 'episode', $1
          )
        `,
        [taskId, workflowId],
      );
      await db.query(
        `
          INSERT INTO provider_requests (
            id, workflow_id, task_id, provider_name, provider_operation,
            request_key, request_hash, payload_ref, payload_hash, payload_redacted_json,
            status, response_redacted_json, created_by_user_id, created_at, updated_at
          ) VALUES (
            $1::uuid, $2, $3, 'san-bao', 'episode.image.generate', $6, $6,
            $6, $6, '{}'::jsonb, 'succeeded',
            '{"providerErrorCode":"san_bao_invalid_response","artifact":{"mediaType":"image"}}'::jsonb,
            $4, $5, $5
          )
        `,
        [
          providerRequestId,
          workflowId,
          taskId,
          userId,
          now,
          `provider-succeeded-race:${providerRequestId}`,
        ],
      );

      const settled = await __phoneAuthDevServerTestUtils.settleTimedOutEpisodeGenerationTask(db as never, {
        taskId,
        now: new Date("2026-08-11T15:20:01.000Z"),
        failureCode: "san_bao_invalid_response",
        expectedProviderRequestId: providerRequestId,
        expectedAttemptId: null,
        expectedAttemptCount: 0,
      });
      const state = await db.query<{ task_status: string; provider_status: string }>(
        `
          SELECT task.status AS task_status, request.status AS provider_status
          FROM tasks task
          JOIN provider_requests request ON request.id = $2
          WHERE task.id = $1
        `,
        [taskId, providerRequestId],
      );
      assert.equal(settled, false);
      assert.deepEqual(state.rows[0], {
        task_status: "running",
        provider_status: "succeeded",
      });
    } finally {
      await db.close();
    }
  });

  it("settles a historical no-task-id submission as failed when Task Center is read", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const user = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE phone_e164 = $1 LIMIT 1",
        [normalizeCnPhone("13800138000")],
      );
      const userId = user.rows[0]!.id;
      const workflowId = randomUUID();
      const taskId = randomUUID();
      const now = new Date("2026-08-08T03:00:00.000Z");
      await db.query(
        `
          INSERT INTO workflows (
            id, workflow_type, status, input_snapshot_json, created_by_user_id,
            created_at, updated_at
          )
          VALUES ($1, 'episode_video_generation', 'running', $2::jsonb, $3, $4, $4)
        `,
        [workflowId, JSON.stringify({ kind: "video", requestedAt: now.toISOString() }), userId, now],
      );
      await db.query(
        `
          INSERT INTO tasks (
            id, workflow_id, task_type, status, queue_name, input_snapshot_json,
            target_entity_type, target_entity_id, created_at, updated_at
          )
          VALUES ($1, $2, 'episode_generate_video', 'running', 'generation-submit-video', $3::jsonb,
            'episode', $1, $4, $4)
        `,
        [taskId, workflowId, JSON.stringify({ kind: "video", requestedAt: now.toISOString() }), now],
      );
      await grantCredits(db, {
        userId,
        amount: 20,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now,
      });
      const reservation = await reserveCredits(db, {
        userId,
        projectId: null,
        workflowId,
        taskId,
        amount: 20,
        sourceType: "episode_generation_task",
        sourceId: taskId,
        reason: "video generation",
        createdByUserId: userId,
        now,
      });
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
            id, user_id, project_id, target_type, target_id, workflow_id, task_id,
            model_code, media_type, task_mode, status, progress_stage, progress_percent,
            request_summary_json, provider_status_json, submitted_at, started_at,
            created_at, updated_at
          )
          VALUES ($1, $2, NULL, 'episode', $3, $4, $3, 'sanbao-sd2-fast-4img', 'video',
            'video.image_to_video', 'running', 'provider_result_unknown', 20,
            '{}'::jsonb, '{"failureCode":"provider_submission_ambiguous"}'::jsonb,
            $5, $5, $5, $5)
        `,
        [randomUUID(), userId, taskId, workflowId, now],
      );
      await db.query(
        `
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id, provider_name, provider_operation,
            request_key, request_hash, payload_ref, payload_hash, payload_redacted_json,
            status, external_submission_started_at, external_request_id,
            response_redacted_json, failure_code, created_by_user_id, created_at, updated_at
          )
          VALUES ($1, NULL, $2, $3, 'san-bao', 'episode.video.generate', $4, $4, $4, $4,
            '{}'::jsonb, 'result_unknown', $5, NULL,
            '{"providerErrorCode":"san_bao_invalid_response"}'::jsonb,
            'provider_submission_ambiguous', $6, $5, $5)
        `,
        [randomUUID(), workflowId, taskId, `historical-no-task-id:${taskId}`, now, userId],
      );

      const response = await fetch(
        `${server.origin}/api/task-center/tasks?status=failed&taskIds=${taskId}`,
        { headers: { cookie } },
      );
      const envelope = await response.json();
      const state = await db.query<{
        task_status: string;
        task_failure_code: string | null;
        provider_status: string;
        provider_failure_code: string | null;
        snapshot_status: string;
        reservation_status: string;
      }>(
        `
          SELECT task.status AS task_status,
                 task.failure_code AS task_failure_code,
                 provider.status AS provider_status,
                 provider.failure_code AS provider_failure_code,
                 snapshot.status AS snapshot_status,
                 reservation.status AS reservation_status
          FROM tasks task
          JOIN provider_requests provider ON provider.task_id = task.id
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
          JOIN credit_reservations reservation ON reservation.id = $2
          WHERE task.id = $1
        `,
        [taskId, reservation.reservation.id],
      );

      assert.equal(response.status, 200, JSON.stringify(envelope));
      assert.equal(envelope.data.items[0]?.status, "failed");
      assert.equal(state.rows[0]?.task_status, "failed");
      assert.equal(state.rows[0]?.task_failure_code, "san_bao_invalid_response");
      assert.equal(state.rows[0]?.provider_status, "failed");
      assert.equal(state.rows[0]?.provider_failure_code, "san_bao_invalid_response");
      assert.equal(state.rows[0]?.snapshot_status, "failed");
      assert.equal(state.rows[0]?.reservation_status, "released");
    } finally {
      await server.close();
    }
  });

  it("serves the app shell when database initialization is unavailable", async () => {
    const dbFailure = Promise.reject(new Error("db_unavailable"));
    const server = createPhoneAuthDevServer({ db: dbFailure as never });

    try {
      await server.listen(0);
      const response = await fetch(`${server.origin}/`);

      assert.equal(response.status, 200);
      assert.match(await response.text(), /id="creator-app"/);
    } finally {
      await server.close();
    }
  });

  it("requires authentication and returns the unified task-center list", async () => {
    const db = await createMigratedTestDb();
    let taskCenterQueryPayloadBytes: number | null = null;
    let taskCenterQuerySql: string | null = null;
    const observedDb = {
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
        const result = await db.query<T>(sql, params);
        if (sql.includes("WITH generation_items AS")) {
          taskCenterQuerySql = sql;
          taskCenterQueryPayloadBytes = Buffer.byteLength(JSON.stringify(result.rows), "utf8");
        }
        return result;
      },
      async close() {
        await db.close();
      },
    };
    const server = createPhoneAuthDevServer({ db: observedDb });

    try {
      await server.listen(0);

      const anonymousResponse = await fetch(`${server.origin}/api/task-center/tasks`);
      assert.equal(anonymousResponse.status, 401);

      const cookie = await login(server.origin, "13800138000");
      const user = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE phone_e164 = $1 LIMIT 1",
        [normalizeCnPhone("13800138000")],
      );
      const userId = user.rows[0]!.id;
      const workflowId = randomUUID();
      const taskId = randomUUID();
      const targetId = randomUUID();
      const olderTaskId = randomUUID();
      const olderTargetId = randomUUID();
      await db.query(
        `
          INSERT INTO workflows (
            id, workflow_type, status, input_snapshot_json, created_by_user_id,
            started_at, finished_at, created_at, updated_at
          )
          VALUES ($1, 'image_generation', 'succeeded', '{}'::jsonb, $2,
            '2026-07-14T08:00:03.000Z', '2026-07-14T08:00:18.000Z',
            '2026-07-14T08:00:00.000Z', '2026-07-14T08:00:18.000Z')
        `,
        [workflowId, userId],
      );
      await db.query(
        `
          INSERT INTO tasks (
            id, workflow_id, task_type, status, queue_name, input_snapshot_json,
            target_entity_type, target_entity_id, created_at, updated_at
          )
          VALUES ($1, $2, 'image_generation', 'succeeded', 'generation', '{}'::jsonb,
            'storyboard', $3, '2026-07-14T08:00:00.000Z', '2026-07-14T08:00:18.000Z')
        `,
        [taskId, workflowId, targetId],
      );
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
            id, target_type, target_id, workflow_id, task_id, model_config_id, model_code, media_type,
            task_mode, status, progress_stage, progress_percent, request_summary_json,
            result_assets_json, submitted_at, started_at, completed_at, created_at,
            updated_at, user_id
          )
          VALUES ($1, 'storyboard', $2, $3, $4,
            (SELECT id FROM ai_model_configs WHERE model_code = 'global-ai-opc-gpt-image-2'),
            'global-ai-opc-gpt-image-2', 'image',
            'generate', 'succeeded', 'completed', 100,
            '{"prompt":"雨夜街道"}'::jsonb,
            '[{"sourceUrl":"/generated/task-center-result.png","previewUrl":"/generated/task-center-result.png"}]'::jsonb,
            '2026-07-14T08:00:00.000Z', '2026-07-14T08:00:03.000Z',
            '2026-07-14T08:00:18.000Z', '2026-07-14T08:00:00.000Z',
            '2026-07-14T08:00:18.000Z', $5)
        `,
        [randomUUID(), targetId, workflowId, taskId, userId],
      );
      await db.query(
        `
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id,
            provider_name, provider_operation, request_key, request_hash,
            payload_ref, payload_hash, payload_redacted_json, status,
            response_redacted_json, created_by_user_id, created_at, updated_at
          )
          VALUES (
            $1, NULL, $2, $3,
            'image-provider', 'episode.image.generate', $4, $4,
            $4, $4, '{}'::jsonb, 'succeeded',
            jsonb_build_object('data', jsonb_build_array(jsonb_build_object('b64_json', repeat('A', 6000000)))),
            $5, '2026-07-14T08:00:17.000Z', '2026-07-14T08:00:18.000Z'
          )
        `,
        [
          randomUUID(),
          workflowId,
          taskId,
          `task-center-large-success:${taskId}`,
          userId,
        ],
      );
      await db.query(
        `
          INSERT INTO tasks (
            id, workflow_id, task_type, status, queue_name, input_snapshot_json,
            target_entity_type, target_entity_id, created_at, updated_at
          )
          VALUES ($1, $2, 'image_generation', 'succeeded', 'generation', '{}'::jsonb,
            'storyboard', $3, '2026-07-14T08:00:00.000Z', '2026-07-14T08:00:17.000Z')
        `,
        [olderTaskId, workflowId, olderTargetId],
      );
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
            id, target_type, target_id, workflow_id, task_id, model_config_id, model_code, media_type,
            task_mode, status, progress_stage, progress_percent, request_summary_json,
            result_assets_json, submitted_at, started_at, completed_at, created_at,
            updated_at, user_id
          )
          VALUES ($1, 'storyboard', $2, $3, $4,
            (SELECT id FROM ai_model_configs WHERE model_code = 'global-ai-opc-gpt-image-2'),
            'global-ai-opc-gpt-image-2', 'image',
            'generate', 'succeeded', 'completed', 100,
            '{"prompt":"较早的任务"}'::jsonb, '[]'::jsonb,
            '2026-07-14T08:00:00.000Z', '2026-07-14T08:00:03.000Z',
            '2026-07-14T08:00:17.000Z', '2026-07-14T08:00:00.000Z',
            '2026-07-14T08:00:17.000Z', $5)
        `,
        [randomUUID(), olderTargetId, workflowId, olderTaskId, userId],
      );
      const response = await fetch(
        `${server.origin}/api/task-center/tasks?page=1&pageSize=20&status=poll&taskIds=${taskId}`,
        { headers: { cookie }, signal: AbortSignal.timeout(3000) },
      );
      const envelope = await response.json();
      const batchResponse = await fetch(`${server.origin}/api/generation-tasks/batch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ taskIds: [taskId, "invalid-task-id", taskId] }),
      });
      const batchEnvelope = await batchResponse.json();

      assert.equal(response.status, 200);
      assert.equal(envelope.data.items.length, 1);
      assert.equal(envelope.data.items[0].taskId, taskId);
      assert.equal(envelope.data.items[0].status, "completed");
      assert.equal(envelope.data.items[0].kind, "image");
      assert.equal(envelope.data.items[0].model, "GPT Image 2（GlobalAiOpc）");
      assert.equal(envelope.data.items[0].modelName, "GPT Image 2（GlobalAiOpc）");
      assert.equal(JSON.stringify(envelope.data.items[0]).includes("global-ai-opc-gpt-image-2"), false);
      assert.equal(Object.hasOwn(envelope.data.items[0], "prompt"), false);
      assert.equal(Object.hasOwn(envelope.data.items[0].requestSummary, "prompt"), false);
      assert.equal(Object.hasOwn(envelope.data.items[0].requestSummary, "promptPreview"), false);
      assert.equal(envelope.data.items[0].result.imageUrl, "/generated/task-center-result.png");
      assert.equal(envelope.data.items[0].submittedAt, "2026-07-14T08:00:00.000Z");
      assert.equal(envelope.data.items[0].startedAt, "2026-07-14T08:00:03.000Z");
      assert.equal(envelope.data.items[0].returnedAt, "2026-07-14T08:00:18.000Z");
      assert.equal(envelope.data.page, 1);
      assert.equal(envelope.data.pageSize, 20);
      assert.equal(envelope.data.total, 1);
      assert.equal(envelope.data.totalPages, 1);
      assert.equal(batchResponse.status, 200);
      assert.deepEqual(batchEnvelope.data.items.map((item: { taskId: string }) => item.taskId), [taskId]);
      assert.equal(JSON.stringify(batchEnvelope.data).includes("global-ai-opc-gpt-image-2"), false);

      const promptSearchResponse = await fetch(
        `${server.origin}/api/task-center/tasks?search=${encodeURIComponent("雨夜街道")}`,
        { headers: { cookie } },
      );
      const promptSearchEnvelope = await promptSearchResponse.json();
      assert.equal(promptSearchResponse.status, 200);
      assert.deepEqual(promptSearchEnvelope.data.items, []);

      const incrementalFirstResponse = await fetch(
        `${server.origin}/api/task-center/tasks?pageSize=1&updatedAfter=2026-07-14T08%3A00%3A00.000Z`,
        { headers: { cookie } },
      );
      const incrementalFirst = await incrementalFirstResponse.json();
      assert.equal(incrementalFirstResponse.status, 200);
      assert.deepEqual(incrementalFirst.data.items.map((item: { taskId: string }) => item.taskId), [taskId]);
      assert.equal(incrementalFirst.data.hasNext, true);
      assert.equal(typeof incrementalFirst.data.nextCursor, "string");

      const incrementalNextResponse = await fetch(
        `${server.origin}/api/task-center/tasks?pageSize=1&updatedAfter=2026-07-14T08%3A00%3A00.000Z&cursor=${encodeURIComponent(incrementalFirst.data.nextCursor)}`,
        { headers: { cookie } },
      );
      const incrementalNext = await incrementalNextResponse.json();
      assert.equal(incrementalNextResponse.status, 200);
      assert.deepEqual(incrementalNext.data.items.map((item: { taskId: string }) => item.taskId), [olderTaskId]);
      assert.equal(incrementalNext.data.hasNext, false);
      assert.equal(incrementalNext.data.nextCursor, null);

      const recentOnlyResponse = await fetch(
        `${server.origin}/api/task-center/tasks?updatedAfter=2026-07-14T08%3A00%3A17.000Z`,
        { headers: { cookie } },
      );
      const recentOnly = await recentOnlyResponse.json();
      assert.equal(recentOnlyResponse.status, 200);
      assert.deepEqual(recentOnly.data.items.map((item: { taskId: string }) => item.taskId), [taskId]);

      const trackedTerminalResponse = await fetch(
        `${server.origin}/api/task-center/tasks?taskIds=${olderTaskId}&updatedAfter=2026-07-14T08%3A00%3A17.000Z`,
        { headers: { cookie } },
      );
      const trackedTerminal = await trackedTerminalResponse.json();
      assert.equal(trackedTerminalResponse.status, 200);
      assert.deepEqual(
        trackedTerminal.data.items.map((item: { taskId: string; status: string }) => [item.taskId, item.status]),
        [[olderTaskId, "completed"]],
      );

      const invalidIncrementalResponse = await fetch(
        `${server.origin}/api/task-center/tasks?cursor=invalid&updatedAfter=not-a-date`,
        { headers: { cookie } },
      );
      assert.equal(invalidIncrementalResponse.status, 400);

      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'queued', progress_stage = 'queued', progress_percent = 10,
              failure_json = '{"failureCode":"stale_provider_failure","displayMessage":"旧失败信息"}'::jsonb,
              completed_at = NULL, updated_at = '2026-07-14T08:00:09.000Z'
          WHERE task_id = $1
        `,
        [taskId],
      );
      const readOnlyResponse = await fetch(
        `${server.origin}/api/task-center/tasks?page=1&pageSize=20&status=poll&taskIds=${taskId}`,
        { headers: { cookie } },
      );
      const readOnlyEnvelope = await readOnlyResponse.json();
      const unchangedSnapshot = await db.query<{ status: string; progress_stage: string }>(
        "SELECT status, progress_stage FROM ai_generation_task_snapshots WHERE task_id = $1",
        [taskId],
      );

      assert.equal(readOnlyResponse.status, 200);
      assert.equal(readOnlyEnvelope.data.items[0].status, "completed");
      assert.equal(readOnlyEnvelope.data.items[0].failure, null);
      assert.deepEqual(unchangedSnapshot.rows, [{ status: "queued", progress_stage: "queued" }]);

      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'running',
              progress_stage = 'asset_transfer_retry_pending',
              progress_percent = 85,
              failure_json = NULL,
              provider_status_json = '{
                "providerSucceeded": true,
                "artifactRecovery": {
                  "state": "retry_pending",
                  "round": 3,
                  "startedAt": "2026-07-14T08:00:18.000Z",
                  "nextRetryAt": "2026-07-14T08:22:00.000Z",
                  "deadlineAt": "2026-07-14T14:00:18.000Z",
                  "lastFailureCode": "provider_output_upload_failed"
                }
              }'::jsonb,
              failed_at = NULL,
              updated_at = '2026-07-14T08:00:19.000Z'
          WHERE task_id = $1
        `,
        [taskId],
      );
      await db.query(
        `
          UPDATE tasks
          SET status = 'running', failure_code = NULL, updated_at = '2026-07-14T08:00:19.000Z'
          WHERE id = $1
        `,
        [taskId],
      );
      const recoveryResponse = await fetch(
        `${server.origin}/api/task-center/tasks?page=1&pageSize=20&status=poll&taskIds=${taskId}`,
        { headers: { cookie } },
      );
      const recoveryEnvelope = await recoveryResponse.json();
      assert.equal(recoveryResponse.status, 200);
      assert.equal(recoveryEnvelope.data.items[0].providerSucceeded, true);
      assert.equal(recoveryEnvelope.data.items[0].recoveryState, "retry_pending");
      assert.equal(recoveryEnvelope.data.items[0].recoveryRound, 3);
      assert.equal(recoveryEnvelope.data.items[0].recoveryStartedAt, "2026-07-14T08:00:18.000Z");
      assert.equal(recoveryEnvelope.data.items[0].nextRetryAt, "2026-07-14T08:22:00.000Z");
      assert.equal(recoveryEnvelope.data.items[0].recoveryDeadlineAt, "2026-07-14T14:00:18.000Z");
      assert.equal(recoveryEnvelope.data.items[0].lastFailureCode, "provider_output_upload_failed");
      assert.equal(recoveryEnvelope.data.items[0].returnedAt, null);

      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'failed',
              failure_json = '{"failureCode":"provider_failed","displayMessage":"图片生成服务失败，请稍后重试"}'::jsonb,
              provider_status_json = '{}'::jsonb,
              failed_at = '2026-07-14T08:00:20.000Z',
              updated_at = '2026-07-14T08:00:20.000Z'
          WHERE task_id = $1
        `,
        [taskId],
      );
      await db.query(
        "UPDATE tasks SET status = 'failed', updated_at = '2026-07-14T08:00:20.000Z' WHERE id = $1",
        [taskId],
      );
      await db.query(
        `
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id,
            provider_name, provider_operation, request_key, request_hash,
            payload_ref, payload_hash, payload_redacted_json, status,
            failure_code, response_redacted_json, task_center_diagnostics_json,
            created_by_user_id, created_at, updated_at
          )
          VALUES (
            $1, NULL, $2, $3,
            'image-provider', 'episode.image.generate', $4, $4,
            $4, $4, '{}'::jsonb, 'failed',
            'provider_failed', $5::jsonb, $5::jsonb, $6,
            '2026-07-14T08:00:19.000Z', '2026-07-14T08:00:20.000Z'
          )
        `,
        [
          randomUUID(),
          workflowId,
          taskId,
          `task-center-model-error:${taskId}`,
          JSON.stringify({
            diagnostics: {
              httpStatus: 400,
              responseBodyPreview: '{"error":{"message":"image_url must be a publicly reachable http or https URL"}}',
            },
          }),
          userId,
        ],
      );
      const failedResponse = await fetch(
        `${server.origin}/api/task-center/tasks?status=failed&taskIds=${taskId}`,
        { headers: { cookie } },
      );
      const failedEnvelope = await failedResponse.json();
      assert.equal(failedResponse.status, 200);
      assert.equal(
        failedEnvelope.data.items[0].failure.displayMessage,
        "本地图片无法解析，请上传公网图片。",
      );
      assert.doesNotMatch(taskCenterQuerySql ?? "", /response_redacted_json/);

      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              failure_code = NULL,
              response_redacted_json = jsonb_build_object(
                'diagnostics', jsonb_build_object(
                  'httpStatus', 400,
                  'responseBodyPreview', '{"error":{"message":"image_url must be a publicly reachable http or https URL"}}'
                ),
                'artifact', jsonb_build_object(
                  'mediaType', 'image',
                  'b64Json', repeat('A', 262144)
                ),
                'futureProviderPayload', jsonb_build_object(
                  'opaqueBinary', repeat('B', 262144)
                )
              ),
              updated_at = '2026-07-14T08:00:21.000Z'
          WHERE request_key = $1
        `,
        [`task-center-large-success:${taskId}`],
      );
      taskCenterQueryPayloadBytes = null;
      const oversizedFailedResponse = await fetch(
        `${server.origin}/api/task-center/tasks?status=failed&taskIds=${taskId}`,
        { headers: { cookie }, signal: AbortSignal.timeout(3000) },
      );
      const oversizedFailedEnvelope = await oversizedFailedResponse.json();

      assert.equal(oversizedFailedResponse.status, 200);
      assert.equal(
        oversizedFailedEnvelope.data.items[0].failure.displayMessage,
        "本地图片无法解析，请上传公网图片。",
      );
      assert.notEqual(taskCenterQueryPayloadBytes, null, "task-center query must be observed");
      assert.ok(
        taskCenterQueryPayloadBytes! < 64 * 1024,
        `task-center query payload must stay bounded, received ${taskCenterQueryPayloadBytes} bytes`,
      );

      const failedTeamAssetId = randomUUID();
      const failedTeamAssetTaskId = randomUUID();
      await db.query(
        `
          INSERT INTO team_assets (
            id, admin_user_id, asset_name, asset_prompt, asset_category, asset_status,
            asset_url, resource_type, resource_size, created_at, updated_at,
            created_by_name, updated_by_name, is_admin_created, created_user_id
          )
          VALUES (
            $1, $2, 'failed task-center asset', 'prompt', 'character', 'generating',
            NULL, 'image', 0, $3, $3, 'test actor', 'test actor', true, $2
          )
        `,
        [failedTeamAssetId, userId, new Date("2026-07-14T08:01:00.000Z")],
      );
      await db.query(
        `
          INSERT INTO provider_requests (
            id, provider_name, provider_operation, request_key, request_hash,
            payload_ref, payload_hash, payload_redacted_json, status, failure_code,
            response_redacted_json, task_center_diagnostics_json,
            created_by_user_id, created_at, updated_at
          )
          VALUES (
            $1, 'test-provider', 'episode.image.generate', $2, $2,
            $2, $2, $3::jsonb, 'failed', 'provider_failed',
            jsonb_build_object(
              'diagnostics', jsonb_build_object(
                'httpStatus', 400,
                'responseBodyPreview', '{"error":{"message":"image_url must be a publicly reachable http or https URL"}}'
              ),
              'futureProviderPayload', jsonb_build_object('opaqueBinary', repeat('C', 262144))
            ),
            jsonb_build_object(
              'providerMessage', 'image_url must be a publicly reachable http or https URL'
            ),
            $4, $5, $5
          )
        `,
        [
          failedTeamAssetTaskId,
          `task-center-failed-team-asset:${failedTeamAssetTaskId}`,
          JSON.stringify({ assetId: failedTeamAssetId, category: "character" }),
          userId,
          new Date("2026-07-14T08:01:00.000Z"),
        ],
      );
      const failedTeamAssetResponse = await fetch(
        `${server.origin}/api/task-center/tasks?status=failed&taskIds=${failedTeamAssetTaskId}`,
        { headers: { cookie }, signal: AbortSignal.timeout(3000) },
      );
      const failedTeamAssetEnvelope = await failedTeamAssetResponse.json();

      assert.equal(failedTeamAssetResponse.status, 200);
      assert.equal(
        failedTeamAssetEnvelope.data.items[0].failure.displayMessage,
        "本地图片无法解析，请上传公网图片。",
      );

      await db.query(
        "UPDATE provider_requests SET status = 'result_unknown', failure_code = 'provider_result_unknown' WHERE id = $1",
        [failedTeamAssetTaskId],
      );
      const unknownTeamAssetResponse = await fetch(
        `${server.origin}/api/task-center/tasks?status=failed&taskIds=${failedTeamAssetTaskId}`,
        { headers: { cookie } },
      );
      const unknownTeamAssetEnvelope = await unknownTeamAssetResponse.json();
      assert.equal(unknownTeamAssetEnvelope.data.items[0].status, "result_unknown");
      assert.equal(unknownTeamAssetEnvelope.data.items[0].failureCode, "provider_result_unknown");

      await db.query(
        "UPDATE provider_requests SET status = 'canceled', failure_code = 'user_canceled' WHERE id = $1",
        [failedTeamAssetTaskId],
      );
      const canceledTeamAssetResponse = await fetch(
        `${server.origin}/api/task-center/tasks?status=canceled&taskIds=${failedTeamAssetTaskId}`,
        { headers: { cookie } },
      );
      const canceledTeamAssetEnvelope = await canceledTeamAssetResponse.json();
      assert.equal(canceledTeamAssetEnvelope.data.items[0].status, "canceled");
      assert.equal(canceledTeamAssetEnvelope.data.items[0].failureCode, "user_canceled");

      await db.query(
        "UPDATE provider_requests SET status = 'manual_review_required', failure_code = 'provider_manual_review_required' WHERE id = $1",
        [failedTeamAssetTaskId],
      );
      const reviewTeamAssetResponse = await fetch(
        `${server.origin}/api/task-center/tasks?status=failed&taskIds=${failedTeamAssetTaskId}`,
        { headers: { cookie } },
      );
      const reviewTeamAssetEnvelope = await reviewTeamAssetResponse.json();
      assert.equal(reviewTeamAssetEnvelope.data.items[0].status, "manual_review_required");
      assert.equal(reviewTeamAssetEnvelope.data.items[0].failureCode, "provider_manual_review_required");
    } finally {
      await server.close();
      await db.close();
    }
  });

  it("keeps the task center readable while provider diagnostics columns are pending migration", async () => {
    const db = await createMigratedTestDb();
    let schemaProbeCount = 0;
    const taskCenterQueries: string[] = [];
    const observedDb = {
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
        if (sql.includes("FROM information_schema.columns")) schemaProbeCount += 1;
        if (sql.includes("WITH generation_items AS")) taskCenterQueries.push(sql);
        return db.query<T>(sql, params);
      },
      async close() {
        await db.close();
      },
    };
    const server = createPhoneAuthDevServer({ db: observedDb });

    try {
      await db.query(`
        ALTER TABLE provider_requests
          DROP COLUMN task_center_diagnostics_json CASCADE,
          DROP COLUMN task_center_diagnostics_backfilled_at CASCADE;
        ALTER TABLE ai_generation_task_snapshots
          DROP COLUMN task_center_diagnostics_json CASCADE,
          DROP COLUMN task_center_diagnostics_backfilled_at CASCADE;
      `);
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const response = await fetch(`${server.origin}/api/task-center/tasks?page=1&pageSize=20`, {
        headers: { cookie },
        signal: AbortSignal.timeout(3_000),
      });
      const envelope = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(envelope.data.items, []);
      assert.equal(schemaProbeCount, 1);
      assert.doesNotMatch(taskCenterQueries.at(-1) ?? "", /provider_request\.task_center_diagnostics_json/);

      await db.query(`
        ALTER TABLE provider_requests
          ADD COLUMN task_center_diagnostics_json jsonb,
          ADD COLUMN task_center_diagnostics_backfilled_at timestamptz;
        ALTER TABLE ai_generation_task_snapshots
          ADD COLUMN task_center_diagnostics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN task_center_diagnostics_backfilled_at timestamptz;
      `);
      const migratedResponse = await fetch(
        `${server.origin}/api/task-center/tasks?page=1&pageSize=20`,
        { headers: { cookie }, signal: AbortSignal.timeout(3_000) },
      );

      assert.equal(migratedResponse.status, 200);
      assert.equal(schemaProbeCount, 1);
      assert.doesNotMatch(taskCenterQueries.at(-1) ?? "", /provider_request\.task_center_diagnostics_json/);

      await new Promise((resolve) => setTimeout(resolve, 5_100));
      const refreshedResponse = await fetch(
        `${server.origin}/api/task-center/tasks?page=1&pageSize=20`,
        { headers: { cookie }, signal: AbortSignal.timeout(3_000) },
      );

      assert.equal(refreshedResponse.status, 200);
      assert.equal(schemaProbeCount, 2);
      assert.match(taskCenterQueries.at(-1) ?? "", /provider_request\.task_center_diagnostics_json/);
    } finally {
      await server.close();
    }
  });

  it("limits a team member task center to tasks created by that member", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      const fixture = await seedTeamMemberCreditLedgerFixture(db);
      const member = await db.query<{ id: string; user_id: string }>(
        "SELECT id, user_id FROM team_members WHERE member_account = 'member001' LIMIT 1",
      );
      const memberId = member.rows[0]!.id;
      const userId = member.rows[0]!.user_id;
      const seedTask = async (teamMemberId: string | null) => {
        const workflowId = randomUUID();
        const taskId = randomUUID();
        const targetId = randomUUID();
        await db.query(
          `
            INSERT INTO workflows (id, workflow_type, status, input_snapshot_json, created_by_user_id)
            VALUES ($1, 'image_generation', 'succeeded', '{}'::jsonb, $2)
          `,
          [workflowId, userId],
        );
        await db.query(
          `
            INSERT INTO tasks (
              id, workflow_id, task_type, status, queue_name, input_snapshot_json,
              target_entity_type, target_entity_id
            )
            VALUES ($1, $2, 'image_generation', 'succeeded', 'generation', '{}'::jsonb, 'storyboard', $3)
          `,
          [taskId, workflowId, targetId],
        );
        await db.query(
          `
            INSERT INTO ai_generation_task_snapshots (
              id, target_type, target_id, workflow_id, task_id, model_code, media_type,
              task_mode, status, progress_stage, progress_percent, request_summary_json,
              submitted_at, completed_at, created_at, updated_at, user_id
            )
            VALUES (
              $1, 'storyboard', $2, $3, $4, 'global-ai-opc-gpt-image-2', 'image',
              'generate', 'succeeded', 'completed', 100, $5::jsonb,
              '2026-07-16T08:00:00.000Z', '2026-07-16T08:00:18.000Z',
              '2026-07-16T08:00:00.000Z', '2026-07-16T08:00:18.000Z', $6
            )
          `,
          [
            randomUUID(),
            targetId,
            workflowId,
            taskId,
            JSON.stringify({ prompt: taskId, teamMemberId }),
            userId,
          ],
        );
        return taskId;
      };
      const ownTaskId = await seedTask(memberId);
      await seedTask(randomUUID());
      await seedTask(null);
      const seedTeamAssetTask = async (teamMemberId: string | null) => {
        const assetId = randomUUID();
        const taskId = randomUUID();
        await db.query(
          `
            INSERT INTO team_assets (
              id, admin_user_id, asset_name, asset_prompt, asset_category, asset_status,
              asset_url, resource_type, resource_size, created_at, updated_at,
              created_by_name, updated_by_name, is_admin_created, created_user_id
            )
            VALUES (
              $1, $2, $3, 'team asset prompt', 'character', 'generating', NULL, 'image', 0,
              '2026-07-16T09:00:00.000Z', '2026-07-16T09:00:00.000Z',
              'test actor', 'test actor', false, $4
            )
          `,
          [assetId, userId, `asset-${assetId}`, teamMemberId ?? userId],
        );
        await db.query(
          `
            INSERT INTO provider_requests (
              id, provider_name, provider_operation, request_key, request_hash,
              payload_ref, payload_hash, payload_redacted_json, status,
              response_redacted_json, created_by_user_id, created_at, updated_at
            )
            VALUES (
              $1, 'test-provider', 'episode.image.generate', $2, $3,
              $4, $5, $6::jsonb, 'succeeded',
              jsonb_build_object('data', jsonb_build_array(jsonb_build_object('b64_json', repeat('A', 6000000)))), $7,
              '2026-07-16T09:00:00.000Z', '2026-07-16T09:00:18.000Z'
            )
          `,
          [
            taskId,
            `team-asset:${assetId}`,
            randomUUID(),
            `creator://team-assets/${assetId}`,
            randomUUID(),
            JSON.stringify({
              prompt: taskId,
              model: "global-ai-opc-gpt-image-2",
              parameters: {},
              assetId,
              category: "character",
              teamMemberId,
            }),
            userId,
          ],
        );
        return taskId;
      };
      const ownTeamAssetTaskId = await seedTeamAssetTask(memberId);
      await seedTeamAssetTask(randomUUID());
      await seedTeamAssetTask(null);
      await server.listen(0);

      const response = await fetch(`${server.origin}/api/task-center/tasks?page=1&pageSize=20`, {
        headers: { cookie: fixture.memberCookie },
        signal: AbortSignal.timeout(3000),
      });
      const envelope = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(
        envelope.data.items.map((item: { taskId: string }) => item.taskId).sort(),
        [ownTaskId, ownTeamAssetTaskId].sort(),
      );
      assert.equal(envelope.data.total, 2);
    } finally {
      await server.close();
      await db.close();
    }
  });

  it("rejects missing and unregistered unified image generation targets", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const request = (body: Record<string, unknown>, idempotencyKey: string) => fetch(
        `${server.origin}/api/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
            cookie,
          },
          body: JSON.stringify(body),
        },
      );

      const missingResponse = await request({ prompt: "missing target" }, "missing-image-target");
      const missing = await missingResponse.json();
      const unknownResponse = await request(
        { target: { kind: "future_unregistered_surface" }, prompt: "unknown target" },
        "unknown-image-target",
      );
      const unknown = await unknownResponse.json();

      assert.equal(missingResponse.status, 400);
      assert.equal(missing.errorCode, "image_generation_target_required");
      assert.equal(unknownResponse.status, 400);
      assert.equal(unknown.errorCode, "image_generation_target_unsupported");
    } finally {
      await server.close();
      await db.close();
    }
  });

  it("redirects the removed login page to the homepage", async () => {
    const server = createPhoneAuthDevServer({ db: {} as Awaited<ReturnType<typeof createDevDb>> });

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/login.html?inviteCode=ABCD12`, {
        redirect: "manual",
      });

      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), `${server.origin}/?inviteCode=ABCD12`);
    } finally {
      await server.close();
    }
  });

  it("serves official library PNG previews as binary static assets", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const response = await fetch(
        `${server.origin}/assets/library/official/characters/nanny.png`,
      );
      const bytes = new Uint8Array(await response.arrayBuffer());

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.deepEqual(Array.from(bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
    } finally {
      await server.close();
    }
  });

  it("revalidates static assets while keeping the app shell uncached", async () => {
    const server = createPhoneAuthDevServer({ db: {} as Awaited<ReturnType<typeof createDevDb>> });

    try {
      await server.listen(0);

      const firstAssetResponse = await fetch(`${server.origin}/app.js`, {
        headers: { "accept-encoding": "br" },
      });
      const etag = firstAssetResponse.headers.get("etag");
      const firstAssetBody = await firstAssetResponse.arrayBuffer();
      const sourceAppJs = await readFile(new URL("../../../../web/app.js", import.meta.url));
      const revalidatedResponse = await fetch(`${server.origin}/app.js`, {
        headers: { "accept-encoding": "br", "if-none-match": etag ?? "" },
      });
      const brDisabledResponse = await fetch(`${server.origin}/app.js`, {
        headers: { "accept-encoding": "br;q=0, *;q=1" },
      });
      const allCompressionDisabledResponse = await fetch(`${server.origin}/app.js`, {
        headers: { "accept-encoding": "br;q=0, gzip;q=0, *;q=1" },
      });
      const appShellResponse = await fetch(`${server.origin}/`);

      assert.equal(firstAssetResponse.status, 200);
      assert.ok(firstAssetBody.byteLength < sourceAppJs.byteLength);
      assert.equal(firstAssetResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate");
      assert.equal(firstAssetResponse.headers.get("content-encoding"), "br");
      assert.match(firstAssetResponse.headers.get("vary") ?? "", /Accept-Encoding/i);
      assert.ok(etag);
      assert.equal(revalidatedResponse.status, 304);
      assert.equal((await revalidatedResponse.arrayBuffer()).byteLength, 0);
      assert.equal(brDisabledResponse.status, 200);
      assert.equal(brDisabledResponse.headers.get("content-encoding"), "gzip");
      assert.equal(allCompressionDisabledResponse.status, 200);
      assert.equal(allCompressionDisabledResponse.headers.get("content-encoding"), null);
      assert.equal(appShellResponse.headers.get("cache-control"), "no-store");
      assert.equal(appShellResponse.headers.get("etag"), null);
    } finally {
      await server.close();
    }
  });

  it("does not block the session response on a Redis cache write", async () => {
    const db = await createMigratedTestDb();
    const authSessionCache: AuthSessionCache = {
      async get() { return undefined; },
      set() { return new Promise<void>(() => undefined); },
      async denySession() {},
      async invalidateSession() {},
      async blockUser() {},
      async blockMember() {},
      async invalidateUser() {},
      async invalidateMember() {},
      async close() {},
    };
    const server = createPhoneAuthDevServer({ db, authSessionCache });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const response = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
        signal: AbortSignal.timeout(3000),
      });

      assert.equal(response.status, 200);
    } finally {
      await server.close();
      await db.close();
    }
  });

  it("serves the local Three and X6 browser runtimes", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const moduleResponse = await fetch(`${server.origin}/vendor/three.module.js`);
      const moduleText = await moduleResponse.text();
      const coreResponse = await fetch(`${server.origin}/vendor/three.core.js`);
      const coreText = await coreResponse.text();
      const x6Response = await fetch(`${server.origin}/vendor/@antv/x6/dist/x6.min.js`);
      const x6Text = await x6Response.text();

      assert.equal(moduleResponse.status, 200);
      assert.match(moduleResponse.headers.get("content-type") ?? "", /text\/javascript/);
      assert.match(moduleText, /three\.core\.js/);
      assert.equal(coreResponse.status, 200);
      assert.match(coreResponse.headers.get("content-type") ?? "", /text\/javascript/);
      assert.match(coreText, /class Vector2/);
      assert.equal(x6Response.status, 200);
      assert.match(x6Response.headers.get("content-type") ?? "", /text\/javascript/);
      assert.match(x6Text, /Graph/);
    } finally {
      await server.close();
    }
  });

  it("serves the browser WebGPU depth model from the app origin", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const configResponse = await fetch(
        `${server.origin}/models/onnx-community/depth-anything-v2-small/config.json`,
      );
      const modelResponse = await fetch(
        `${server.origin}/models/onnx-community/depth-anything-v2-small/onnx/model_quantized.onnx`,
      );

      assert.equal(configResponse.status, 200);
      assert.match(configResponse.headers.get("content-type") ?? "", /application\/json/);
      assert.equal((await configResponse.json()).model_type, "depth_anything");
      assert.equal(modelResponse.status, 200);
      assert.equal(modelResponse.headers.get("content-type"), "application/octet-stream");
      await modelResponse.body?.cancel();
    } finally {
      await server.close();
    }
  });

  it("serves app shell for episode deep links", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/projects/project-1/episodes/episode-1`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /id="creator-app"/);
      assert.match(html, /src="\/app\.js(?:\?[^\"]*)?"/);
    } finally {
      await server.close();
    }
  });

  it("serves crawler-ready SEO metadata, content, and canonical sitemap URLs", async () => {
    const server = createPhoneAuthDevServer({ db: {} as Awaited<ReturnType<typeof createDevDb>> });
    const proxyHeaders = {
      connection: "close",
      "x-forwarded-host": "www.lingxiyunai.com:443",
      "x-forwarded-proto": "https",
    };

    try {
      await server.listen(0);

      const robotsResponse = await fetch(`${server.origin}/robots.txt`, { headers: proxyHeaders });
      const robots = await robotsResponse.text();
      const sitemapResponse = await fetch(`${server.origin}/sitemap.xml`, { headers: proxyHeaders });
      const sitemap = await sitemapResponse.text();

      assert.equal(robotsResponse.status, 200);
      assert.match(robots, /Sitemap: https:\/\/www\.lingxiyunai\.com\/sitemap\.xml/);
      assert.equal(sitemapResponse.status, 200);
      assert.match(sitemap, /<loc>https:\/\/www\.lingxiyunai\.com\/script<\/loc>/);
      assert.doesNotMatch(sitemap, /http:\/\/www\.lingxiyunai\.com:443/);

      const publicRoutes = [
        ["/", "AI视频生成工具，串联剧本、分镜、素材与成片 | 灵曦AI", "AI视频生成工具，串联剧本、分镜、素材与成片", "从一个剧本或故事想法开始"],
        ["/canvas", "AI视频生成画布，让素材、提示词和结果保持上下文 | 灵曦AI", "AI视频生成画布，让素材、提示词和结果保持上下文", "打开画布，组织第一条视频生成流程"],
        ["/script", "剧本转分镜工具，把故事拆成可拍、可生成的镜头 | 灵曦AI", "剧本转分镜工具，把故事拆成可拍、可生成的镜头", "把现有小说或剧本转成分镜初稿"],
        ["/projects", "视频短剧制作工具，管理从剧本到成片的完整项目 | 灵曦AI", "视频短剧制作工具，管理从剧本到成片的完整项目", "创建你的第一个AI短剧项目"],
        ["/assets", "短剧素材库，让角色与场景在连续镜头中反复使用 | 灵曦AI", "短剧素材库，让角色与场景在连续镜头中反复使用", "建立可复用的角色与场景素材"],
        ["/team", "AI短剧团队协作，把项目资源和制作分工放在一起 | 灵曦AI", "AI短剧团队协作，把项目资源和制作分工放在一起", "为短剧制作建立清晰的团队分工"],
      ] as const;
      for (const [path, title, heading, ctaTitle] of publicRoutes) {
        const routeResponse = await fetch(`${server.origin}${path}`, { headers: proxyHeaders });
        const routeHtml = await routeResponse.text();
        const pendingRouteResponse = await fetch(`${server.origin}${path}`, {
          headers: { ...proxyHeaders, cookie: "auth_session=refresh-session" },
        });
        const pendingRouteHtml = await pendingRouteResponse.text();

        assert.equal(routeResponse.status, 200);
        assert.equal(pendingRouteResponse.status, 200);
        assert.match(routeHtml, new RegExp(`<title>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/title>`));
        assert.match(routeHtml, new RegExp(`<link rel="canonical" href="https://www\\.lingxiyunai\\.com${path === "/" ? "/" : path}" />`));
        assert.match(routeHtml, /<body class="workbench-body public-seo-page">/);
        assert.doesNotMatch(routeHtml, /public-seo-session-pending/);
        assert.match(pendingRouteHtml, /<body class="workbench-body public-seo-page public-seo-session-pending">/);
        assert.match(routeHtml, /<section class="public-seo-content"/);
        assert.match(routeHtml, new RegExp(`<h1[^>]*>${heading}<\\/h1>`));
        assert.match(routeHtml, new RegExp(`<h2>${ctaTitle}<\\/h2>`));
        assert.match(routeHtml, /<a href="\/canvas"(?: aria-current="page")?>AI视频生成<\/a>/);
        assert.match(routeHtml, /<script type="application\/ld\+json">/);
        assert.match(routeHtml, /"@type":"FAQPage"/);
        assert.match(routeHtml, /data-public-seo-login/);
        assert.doesNotMatch(routeHtml, /<noscript>/);
      }
    } finally {
      await server.close();
    }
  });

  it("serves GEO public SSR pages and dynamic sitemap entries without creator shell state", async () => {
    const db = await createMigratedTestDb();
    const actorAdminAccountId = "32000000-0000-4000-8000-000000000001";
    await db.query(
      `INSERT INTO admin_accounts (id,login_name,password_hash,display_name,status)
       VALUES ($1,'geo_public_admin','plain:test-password','GEO Public Admin','active')`,
      [actorAdminAccountId],
    );
    const service = createGeoContentService({ db, now: () => new Date("2026-08-13T10:00:00.000Z") });
    const evidence = await service.saveEvidence({ type: "product_feature", name: "角色素材公开说明", factText: "公开产品页说明角色素材可以复用。", sourceUrl: "https://www.lingxiyunai.com/assets", reviewStatus: "approved", validUntil: null, publicUseAllowed: true, actorAdminAccountId });
    if (!("data" in evidence.body)) throw new Error("fixture evidence failed");
    const draft = await service.createDraftFromDocument({
      contentType: "guide", topic: "角色一致性", slug: "ai-short-drama-character-consistency",
      questionIds: [], evidenceIds: [evidence.body.data.id], generationRunId: null, configRevisionId: "geo-default-v1", actorAdminAccountId,
      document: {
        title: "AI短剧如何保持角色一致性",
        summary: "从角色资料、参考素材和分镜约束三个环节减少不同镜头中的角色漂移。",
        directAnswer: "先固定角色资料，再让每个分镜引用同一组已确认素材。",
        blocks: [{ type: "paragraph", text: "先建立可复用的角色参考素材，再进入分镜制作。", evidenceIds: [evidence.body.data.id] }],
        faq: [{ question: "什么时候更新参考素材？", answer: "角色造型或制作要求变化时重新审核。" }],
        socialDrafts: { zhihu: "", xiaohongshu: "", bilibili: "", wechat: "" },
        seo: { title: "AI短剧角色一致性方法 | 灵曦AI", description: "介绍AI短剧角色资料、参考素材和分镜约束的实用方法。" },
      },
    });
    assert.equal(draft.status, 201);
    if (!("data" in draft.body)) throw new Error("fixture draft failed");
    assert.equal((await service.submitForReview({ contentItemId: draft.body.data.item.id, expectedLockVersion: draft.body.data.item.lockVersion, actorAdminAccountId })).status, 200);
    assert.equal((await service.publish({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "公开页验证" })).status, 200);
    const draftOnly = await service.createDraftFromDocument({
      contentType: "answer", topic: "未发布", slug: "draft-only-answer", questionIds: [], evidenceIds: [],
      generationRunId: null, configRevisionId: "geo-default-v1", actorAdminAccountId,
      document: {
        title: "未发布问答", summary: "这是一条仅用于验证站点地图不会暴露草稿的内容。", directAnswer: "尚未发布。",
        blocks: [{ type: "paragraph", text: "草稿内容。", evidenceIds: [] }], faq: [],
        socialDrafts: { zhihu: "", xiaohongshu: "", bilibili: "", wechat: "" },
        seo: { title: "未发布问答 | 灵曦AI", description: "未发布内容不会进入公开站点地图。" },
      },
    });
    const server = createPhoneAuthDevServer({ db });
    const proxyHeaders = { connection: "close", "x-forwarded-host": "www.lingxiyunai.com:443", "x-forwarded-proto": "https" };
    try {
      await server.listen(0);
      for (const cookie of [undefined, "auth_session=existing-session"]) {
        const response = await fetch(`${server.origin}/guides/ai-short-drama-character-consistency`, {
          headers: cookie ? { ...proxyHeaders, cookie } : proxyHeaders,
        });
        const html = await response.text();
        assert.equal(response.status, 200);
        assert.match(html, /<h1>AI短剧如何保持角色一致性<\/h1>/);
        assert.match(html, /application\/ld\+json/);
        assert.match(html, /证据来源/);
        assert.match(html, /href="https:\/\/www\.lingxiyunai\.com\/assets"/);
        assert.match(html, /<link rel="canonical" href="https:\/\/www\.lingxiyunai\.com\/guides\/ai-short-drama-character-consistency"/);
        assert.doesNotMatch(html, /src="\/app\.js/);
        assert.doesNotMatch(html, /public-seo-session-pending/);
      }
      const listing = await fetch(`${server.origin}/guides`, { headers: proxyHeaders });
      assert.equal(listing.status, 200);
      assert.match(await listing.text(), /AI短剧如何保持角色一致性/);
      const sitemap = await fetch(`${server.origin}/sitemap.xml`, { headers: proxyHeaders });
      const sitemapXml = await sitemap.text();
      assert.match(sitemapXml, /<loc>https:\/\/www\.lingxiyunai\.com\/guides\/ai-short-drama-character-consistency<\/loc>/);
      assert.match(sitemapXml, /<lastmod>2026-08-13T10:00:00\.000Z<\/lastmod>/);
      assert.doesNotMatch(sitemapXml, /draft-only-answer/);
      if (!("data" in draftOnly.body)) throw new Error("draft-only fixture failed");
      assert.equal((await service.submitForReview({ contentItemId: draftOnly.body.data.item.id, expectedLockVersion: draftOnly.body.data.item.lockVersion, actorAdminAccountId })).status, 200);
      assert.equal((await service.publish({ contentItemId: draftOnly.body.data.item.id, actorAdminAccountId, reason: "重定向归档验证" })).status, 200);
      assert.equal((await service.archive({ contentItemId: draftOnly.body.data.item.id, actorAdminAccountId, reason: "配置替代内容", redirectPath: "/guides/ai-short-drama-character-consistency" })).status, 200);
      const moved = await fetch(`${server.origin}/answers/draft-only-answer`, { headers: proxyHeaders, redirect: "manual" });
      assert.equal(moved.status, 301);
      assert.equal(moved.headers.get("location"), "/guides/ai-short-drama-character-consistency");
      assert.equal((await service.archive({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "无替代内容归档" })).status, 200);
      const gone = await fetch(`${server.origin}/guides/ai-short-drama-character-consistency`, { headers: proxyHeaders, redirect: "manual" });
      assert.equal(gone.status, 410);
    } finally {
      await server.close();
    }
  });

  it("returns 404 for unknown app paths while preserving supported deep links", async () => {
    const server = createPhoneAuthDevServer({ db: {} as Awaited<ReturnType<typeof createDevDb>> });

    try {
      await server.listen(0);

      const missingResponse = await fetch(`${server.origin}/not-a-real-page`, {
        headers: { connection: "close" },
      });
      await missingResponse.text();
      const deepLinkResponse = await fetch(`${server.origin}/projects/project-1/episodes/episode-1`, {
        headers: { connection: "close" },
      });
      const deepLinkHtml = await deepLinkResponse.text();
      const newCanvasResponse = await fetch(`${server.origin}/new-canvas`, {
        headers: { connection: "close" },
      });
      const newCanvasHtml = await newCanvasResponse.text();
      const toolboxResponse = await fetch(`${server.origin}/toolbox`, {
        headers: { connection: "close" },
      });
      const toolboxHtml = await toolboxResponse.text();

      assert.equal(missingResponse.status, 404);
      assert.equal(deepLinkResponse.status, 200);
      assert.match(deepLinkHtml, /id="creator-app"/);
      assert.equal(newCanvasResponse.status, 200);
      assert.match(newCanvasHtml, /id="creator-app"/);
      assert.equal(toolboxResponse.status, 200);
      assert.match(toolboxHtml, /id="creator-app"/);
    } finally {
      await server.close();
    }
  });

  it("supports the full request -> debug -> verify -> session flow", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);

      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const requested = await requestResponse.json();

      const debugResponse = await fetch(
        `${server.origin}/api/auth/dev/challenges/${requested.challengeId}`,
      );
      const debug = await debugResponse.json();

      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "13800138000",
          code: debug.code,
          remember: true,
        }),
      });
      const verifyPayload = await verifyResponse.json();
      const cookie = verifyResponse.headers.get("set-cookie") ?? "";
      const userRecord = await db.query<{ invite_code: string | null }>(
        "SELECT invite_code FROM users WHERE phone_e164 = '13800138000'",
      );

      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });
      const sessionPayload = await sessionResponse.json();
      await db.query(
        "UPDATE sms_send_records SET created_at = created_at - INTERVAL '2 minutes' WHERE phone_e164 = '13800138000'",
      );
      const repeatRequestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const repeatRequested = await repeatRequestResponse.json();
      const repeatDebugResponse = await fetch(
        `${server.origin}/api/auth/dev/challenges/${repeatRequested.challengeId}`,
      );
      const repeatDebug = await repeatDebugResponse.json();
      const repeatVerifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: repeatRequested.challengeId,
          phone: "13800138000",
          code: repeatDebug.code,
          remember: true,
        }),
      });
      const repeatVerifyPayload = await repeatVerifyResponse.json();

      assert.equal(requestResponse.status, 200);
      assert.equal(debugResponse.status, 200);
      assert.match(debug.code, /^\d{6}$/);
      assert.equal(verifyResponse.status, 200);
      assert.equal(verifyPayload.isNewUser, true);
      assert.equal(sessionResponse.status, 200);
      assert.equal(verifyPayload.user.phone, "13800138000");
      assert.match(userRecord.rows[0]?.invite_code ?? "", /^[0-9A-Z]{10}$/);
      assert.equal(sessionPayload.authenticated, true);
      assert.equal(repeatVerifyResponse.status, 200);
      assert.equal(repeatVerifyPayload.isNewUser, false);
      assert.match(cookie, /Max-Age=2592000/);
    } finally {
      await server.close();
    }
  });

  it("returns the current user's available credits in session and generation config", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await db.query(
        `
          UPDATE users
          SET credit_balance_cached = 2036,
              credit_reserved_cached = 0
          WHERE phone_e164 = '13800138000'
        `,
      );

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "session-current-user-credit-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Credit Project",
          scriptInput: "Episode 1: Credits should follow current user.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const project = await createProjectResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${project.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "session-current-user-credit-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode 1" }),
        },
      );
      const episode = await createEpisodeResponse.json();

      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });
      const session = await sessionResponse.json();
      const creditResponse = await fetch(`${server.origin}/api/auth/credit-balance`, {
        headers: { cookie },
      });
      const credit = await creditResponse.json();
      const generationConfigResponse = await fetch(
        `${server.origin}/api/episodes/${episode.data.episode.id}/generation-config`,
        { headers: { cookie } },
      );
      const generationConfig = await generationConfigResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(sessionResponse.status, 200);
      assert.equal(session.user.availableCredits, 2036);
      assert.equal(session.user.creditBalance, 2036);
      assert.equal(creditResponse.status, 200);
      assert.equal(creditResponse.headers.get("cache-control"), "no-store, private");
      assert.equal(credit.availableCredits, 2036);
      assert.equal(credit.creditBalance, 2036);
      assert.equal(generationConfigResponse.status, 200);
      assert.equal(generationConfig.data.creditBalance, 2036);
    } finally {
      await server.close();
    }
  });

  it("keeps credit ledger total queries from transferring full metadata rows", async () => {
    const adminUserServiceSource = await readFile(
      new URL("../../modules/admin-users/admin-user.service.ts", import.meta.url),
      "utf8",
    );
    const serverSource = await readFile(new URL("../phone-auth-dev-server.ts", import.meta.url), "utf8");
    const adminLedgerBlock = adminUserServiceSource.slice(
      adminUserServiceSource.indexOf("async function listUserCreditLedger"),
      adminUserServiceSource.indexOf("async function listUserModelRequestLogs"),
    );
    const creatorLedgerBlock = serverSource.slice(
      serverSource.indexOf("async function listCreatorAdminCreditLedger"),
      serverSource.indexOf("function adminCreatorLedgerFromRow"),
    );
    const creatorLedgerRouteBlock = serverSource.slice(
      serverSource.indexOf('if (request.method === "GET" && pathname === "/api/creator/credits/ledger")'),
      serverSource.indexOf('if (request.method === "POST" && pathname === "/api/creator/team/members")'),
    );
    const teamMemberLedgerBlock = serverSource.slice(
      serverSource.indexOf("async function listSimpleTeamMemberCreditLedger"),
      serverSource.indexOf("function teamMemberLedgerFromRow"),
    );
    assert.match(adminLedgerBlock, /COUNT\(\*\) OVER\(\) AS total_count/);
    assert.match(adminLedgerBlock, /reservation_keys AS/);
    assert.match(adminLedgerBlock, /LIMIT \$\$\{ledgerScope\.limitParamIndex\}/);
    assert.match(adminLedgerBlock, /OFFSET \$\$\{ledgerScope\.limitParamIndex \+ 1\}/);
    assert.doesNotMatch(adminLedgerBlock, /fetchLimit/);
    assert.doesNotMatch(adminLedgerBlock, /\.slice\(start/);
    assert.match(creatorLedgerBlock, /ledger\.id = ANY\(\$2::uuid\[\]\)/);
    assert.doesNotMatch(creatorLedgerBlock, /fetchLimit/);
    assert.doesNotMatch(creatorLedgerBlock, /\.slice\(start/);
    assert.match(creatorLedgerRouteBlock, /adminUsers\.listCreatorUserCreditLedger/);
    assert.doesNotMatch(
      teamMemberLedgerBlock,
      /balanceScope|displayCreditBalance|displayReservedCredits|frozenCredits|totalConsumedCredits/,
    );
  });

  it("keeps episode asset lists read-only and limited to asset metadata tables", async () => {
    const serverSource = await readFile(new URL("../phone-auth-dev-server.ts", import.meta.url), "utf8");
    const listEpisodeAssetsBlock = serverSource.slice(
      serverSource.indexOf("async function listEpisodeAssetTypesFromDb"),
      serverSource.indexOf("async function listEpisodeStoryboardsFromDb"),
    );
    const listEpisodeAssetsRouteBlock = serverSource.slice(
      serverSource.indexOf('request.method === "GET" &&\n          pathname.startsWith("/api/episodes/") &&\n          pathname.endsWith("/assets")'),
      serverSource.indexOf('request.method === "POST" &&\n          pathname.startsWith("/api/episodes/") &&\n          pathname.endsWith("/assets")'),
    );

    assert.match(listEpisodeAssetsBlock, /await getEpisodeReadContext\(db,/);
    assert.match(listEpisodeAssetsBlock, /metadata_json->>'episodeId' = \$2/);
    assert.match(listEpisodeAssetsBlock, /a\.asset_type = ANY\(\$3::text\[\]\)/);
    assert.match(
      listEpisodeAssetsBlock,
      /ORDER BY array_position\(\$3::text\[\], a\.asset_type\), a\.created_at ASC, a\.id ASC/,
    );
    assert.match(listEpisodeAssetsBlock, /FROM assets a/);
    assert.match(listEpisodeAssetsBlock, /FROM asset_versions/);
    assert.doesNotMatch(listEpisodeAssetsBlock, /signedUrlsForStorageObject/);
    assert.doesNotMatch(listEpisodeAssetsBlock, /storage_objects/);
    assert.doesNotMatch(listEpisodeAssetsBlock, /UPDATE (?:assets|asset_versions)/);
    assert.doesNotMatch(listEpisodeAssetsBlock, /persistSameNameProjectAssetImageForEpisodeAsset/);
    assert.doesNotMatch(listEpisodeAssetsRouteBlock, /Promise\.all/);
    assert.match(listEpisodeAssetsRouteBlock, /response\.setHeader\("server-timing"/);
    assert.doesNotMatch(listEpisodeAssetsBlock, /ORDER BY a\.updated_at DESC, a\.id DESC/);
  });

  it("keeps storyboard list reads lightweight and free of billing side effects", async () => {
    const serverSource = await readFile(new URL("../phone-auth-dev-server.ts", import.meta.url), "utf8");
    const readContextBlock = serverSource.slice(
      serverSource.indexOf("async function getEpisodeReadContext"),
      serverSource.indexOf("async function resolveCanvasRunEpisodeId"),
    );
    const listStoryboardsBlock = serverSource.slice(
      serverSource.indexOf("async function listEpisodeStoryboardsFromDb"),
      serverSource.indexOf("async function createEpisodeAssetRecord"),
    );

    assert.match(readContextBlock, /resolveActorContext\(db, \{[\s\S]*?projectId: episode\.project_id/);
    const removedScopePattern = new RegExp([
      "actor\\.", "organi", "zationId|project\\.", "organi", "zation_id",
    ].join(""));
    assert.doesNotMatch(readContextBlock, removedScopePattern);
    assert.match(listStoryboardsBlock, /getEpisodeReadContext/);
    assert.doesNotMatch(listStoryboardsBlock, /getEpisodeContext/);
    assert.doesNotMatch(listStoryboardsBlock, /getUserCreditBalance/);
    assert.match(listStoryboardsBlock, /COUNT\(\*\) OVER\(\) AS total_count/);
    assert.match(listStoryboardsBlock, /includeDraftPayload === false \? "NULL::jsonb" : "payload_json"/);
    assert.match(listStoryboardsBlock, /includeDraftPayload === false \? \{\} : \{ payload:/);
  });

  it("loads asset conversation history through the lightweight episode read context", async () => {
    const serverSource = await readFile(new URL("../phone-auth-dev-server.ts", import.meta.url), "utf8");
    const conversationRouteBlock = serverSource.slice(
      serverSource.indexOf("async function getEpisodeAssetConversationRoute"),
      serverSource.indexOf("async function deleteEpisodeAssetConversationTurnRoute"),
    );

    assert.match(conversationRouteBlock, /getEpisodeReadContext\(db,/);
    assert.doesNotMatch(conversationRouteBlock, /getEpisodeContext\(db,/);
    assert.doesNotMatch(conversationRouteBlock, /getUserCreditBalance/);
    assert.match(conversationRouteBlock, /projectId: context\.episode\.project_id/);
  });

  it("keeps session credits aligned with the creator's user ledger", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });

      await db.query(
        "UPDATE users SET credit_balance_cached = 155196, credit_reserved_cached = 0 WHERE phone_e164 = $1",
        [normalizeCnPhone("13800138000")],
      );

      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });
      const session = await sessionResponse.json();

      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const state = await stateResponse.json();

      const ledgerResponse = await fetch(`${server.origin}/api/creator/credits/ledger?pageSize=20`, {
        headers: { cookie },
      });
      const ledger = await ledgerResponse.json();

      assert.equal(sessionResponse.status, 200);
      assert.equal(stateResponse.status, 200);
      assert.equal(ledgerResponse.status, 200);
      assert.equal(session.user.availableCredits, 155196);
      assert.equal(state.availableCredits, 155196);
      assert.equal(ledger.summary.displayAvailableCredits, 155196);
    } finally {
      await server.close();
    }
  });

  it("returns only the current user's creator credit ledger", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "18207210650");
      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      assert.equal(stateResponse.status, 200);

      const userResult = await db.query<{ user_id: string }>(
        "SELECT id AS user_id FROM users WHERE phone_e164 = $1 LIMIT 1",
        [normalizeCnPhone("18207210650")],
      );
      const user = userResult.rows[0];
      assert.ok(user?.user_id);
      await ensurePasswordLoginUser(db, normalizeCnPhone("13800138000"));
      const otherUserResult = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE phone_e164 = $1 LIMIT 1",
        [normalizeCnPhone("13800138000")],
      );
      const otherUserId = otherUserResult.rows[0]?.id;
      assert.ok(otherUserId);

      const expectedLedgerEntryId = randomUUID();
      const metadataOnlyLedgerEntryId = randomUUID();
      await db.query("BEGIN");
      try {
        await db.query(
          `
            UPDATE users
            SET credit_balance_cached = 43210,
                credit_reserved_cached = 0,
                credit_frozen_cached = 0
            WHERE id = $1
          `,
          [user.user_id],
        );
        await db.query(
          `
            INSERT INTO credit_ledger_entries (
              id,
              user_id,
              entry_type,
              amount,
              available_delta,
              reserved_delta,
              consumed_delta,
              source_type,
              source_id,
              reason,
              metadata_json,
              created_at
            )
            VALUES
              ($1, $2, 'grant', 321, 321, 0, 0, 'payment_order', $3, 'user target', '{}'::jsonb, '2026-07-10T08:00:00.000Z'),
              ($4, $5, 'grant', 999, 999, 0, 0, 'payment_order', $6, 'unrelated account sentinel', '{}'::jsonb, '2026-07-10T08:01:00.000Z'),
              ($7, $2, 'grant', 222, 222, 0, 0, 'membership_gift', $8, 'metadata-only target', $9::jsonb, '2026-07-10T08:02:00.000Z')
          `,
          [
            expectedLedgerEntryId,
            user.user_id,
            randomUUID(),
            randomUUID(),
            otherUserId,
            randomUUID(),
            metadataOnlyLedgerEntryId,
            randomUUID(),
            JSON.stringify({ targetUserId: user.user_id }),
          ],
        );
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }

      const ledgerResponse = await fetch(`${server.origin}/api/creator/credits/ledger?page=1&pageSize=10`, {
        headers: { cookie },
      });
      const ledger = await ledgerResponse.json();

      assert.equal(ledgerResponse.status, 200, JSON.stringify(ledger));
      assert.ok(Array.isArray(ledger.data));
      assert.equal(ledger.summary.displayAvailableCredits, 43210);
      const targetEntry = ledger.data.find((entry: { id: string }) => entry.id === expectedLedgerEntryId);
      assert.equal(targetEntry?.amount, 321);
      assert.equal(targetEntry?.reason, "user target");
      const metadataOnlyEntry = ledger.data.find(
        (entry: { id: string }) => entry.id === metadataOnlyLedgerEntryId,
      );
      assert.equal(metadataOnlyEntry?.amount, 222);
      assert.equal(metadataOnlyEntry?.reason, "metadata-only target");
      assert.equal(
        ledger.data.some((entry: { reason: string }) => entry.reason === "unrelated account sentinel"),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("rejects disabled users while preserving the account state", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "18207210650");
      const userResult = await db.query<{ user_id: string }>(
        "SELECT id AS user_id FROM users WHERE phone_e164 = $1 LIMIT 1",
        [normalizeCnPhone("18207210650")],
      );
      const user = userResult.rows[0];
      assert.ok(user);
      await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [user.user_id]);

      const membershipResponse = await fetch(`${server.origin}/api/membership/status`, {
        headers: { cookie },
      });
      const membershipBody = await membershipResponse.json();
      const persistedState = await db.query<{ status: string }>(
        "SELECT status FROM users WHERE id = $1",
        [user.user_id],
      );

      assert.equal(membershipResponse.status, 401);
      assert.ok(membershipBody.error);
      assert.equal(persistedState.rows[0]?.status, "disabled");
    } finally {
      await server.close();
    }
  });

  it("loads user-owned projects without changing their owner", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138991");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138991"));
      const projectId = randomUUID();
      const scriptId = randomUUID();
      await db.query(
        `
          INSERT INTO projects (
        id,
        name,
        aspect_ratio,
        resolution,
        phase,
        owner_user_id,
        created_by_user_id
      )
          VALUES ($1, 'Legacy owned project', '9:16', '1080p', 'script_input', $2, $2)
        `,
    [projectId,
      userId],
      );
      await db.query(
        `
          INSERT INTO scripts (
        id,
        project_id,
        status,
        input_text,
        created_by_user_id
      )
          VALUES ($1, $2, 'draft', 'legacy script', $3)
        `,
    [scriptId,
      projectId,
      userId],
      );

      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const stateBody = await stateResponse.json();
      const persisted = await db.query<{ owner_user_id: string; script_project_id: string }>(
        `
          SELECT
            project.owner_user_id,
            script.project_id AS script_project_id
          FROM projects project
          JOIN scripts script ON script.project_id = project.id
          WHERE project.id = $1
        `,
        [projectId],
      );

      assert.equal(stateResponse.status, 200, JSON.stringify(stateBody));
      assert.equal(persisted.rows[0]?.owner_user_id, userId);
      assert.equal(persisted.rows[0]?.script_project_id, projectId);
    } finally {
      await server.close();
    }
  });

  it("shows released generation reservations as refunded credit ledger entries", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "ledger-release-visible-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Ledger Release Visible",
          scriptInput: "Episode 1: Released credits should be visible.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createdProject = created.project ?? created.data?.project;
      const ownership = await db.query<{ owner_user_id: string }>(
        "SELECT owner_user_id FROM projects WHERE id = $1",
        [createdProject?.id],
      );
      const projectOwner = ownership.rows[0]!;
      await grantCredits(db, {
        userId: projectOwner.owner_user_id,
        amount: 100,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: projectOwner.owner_user_id,
        now: new Date("2026-06-30T11:59:59.000Z"),
      });
      const reservation = await reserveCredits(db, {
        userId: projectOwner.owner_user_id,
        projectId: createdProject.id,
        workflowId: null,
        taskId: null,
        amount: 15,
        sourceType: "episode_generation_task",
        sourceId: "70000000-0000-4000-8000-00000000a001",
        reason: "image generation",
        metadata: {
          taskId: "70000000-0000-4000-8000-00000000a001",
          mediaType: "image",
          billingEvent: "reserved",
        },
        createdByUserId: projectOwner.owner_user_id,
        now: new Date("2026-06-30T12:00:00.000Z"),
      });
      await settleReservationAllocation(db, {
        reservationId: reservation.reservation.id,
        allocationKey: "provider_failed",
        amount: 15,
        outcome: "released",
        taskId: null,
        attemptId: null,
        providerRequestId: null,
        metadata: {
          taskId: "70000000-0000-4000-8000-00000000a001",
          mediaType: "image",
          billingEvent: "released",
          outcome: "released",
        },
        now: new Date("2026-06-30T12:00:01.000Z"),
      });

      const ledgerResponse = await fetch(`${server.origin}/api/creator/credits/ledger?pageSize=20`, {
        headers: { cookie },
      });
      const ledger = await ledgerResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(ledgerResponse.status, 200);
      assert.ok(
        ledger.data.some((entry: { entryType?: string; content?: string; availableDelta?: number }) =>
          entry.entryType === "release" &&
          entry.content === "任务积分返还" &&
          entry.availableDelta === 15,
        ),
        `missing released reservation ledger entry: ${JSON.stringify(ledger.data)}`,
      );
    } finally {
      await server.close();
    }
  });

  it("returns team member credit ledger entries without uuid type mismatches", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      const fixture = await seedTeamMemberCreditLedgerFixture(db);
      await server.listen(0);

      const ledgerResponse = await fetch(`${server.origin}/api/creator/credits/ledger?pageSize=20`, {
        headers: { cookie: fixture.memberCookie },
      });
      const ledger = await ledgerResponse.json();

      assert.equal(ledgerResponse.status, 200);
      assert.equal(ledger.accountType, "子账户");
      assert.equal(ledger.meta.total, 1);
      assert.equal(ledger.data[0]?.sourceType, "team_member_credit_allocation");
      assert.equal(ledger.data[0]?.amount, 10);
      assert.equal(ledger.data[0]?.balanceAfter, 10);
    } finally {
      await server.close();
    }
  });

  it("forbids team members from reading an invite summary", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      const fixture = await seedTeamMemberCreditLedgerFixture(db);
      await server.listen(0);

      const response = await fetch(`${server.origin}/api/auth/invite-summary`, {
        headers: { cookie: fixture.memberCookie },
      });
      const body = await response.json();

      assert.equal(response.status, 403);
      assert.equal(body.error, "team_member_invite_forbidden");
    } finally {
      await server.close();
    }
  });

  it("reflects owner credit allocations in the subaccount balance and ledger", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      const fixture = await seedTeamMemberCreditLedgerFixture(db);
      await server.listen(0);

      const ownerCookie = await login(server.origin, "13800138000");
      const ownerMembersResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        headers: { cookie: ownerCookie },
      });
      const ownerMembers = await ownerMembersResponse.json();
      const memberId = ownerMembers.body?.members?.[0]?.membershipId ?? ownerMembers.members?.[0]?.membershipId;

      assert.equal(ownerMembersResponse.status, 200);
      assert.ok(memberId);

      const updateResponse = await fetch(`${server.origin}/api/creator/team/members/${encodeURIComponent(memberId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          creditAdjustmentType: "increase",
          creditAmount: 15,
        }),
      });
      const updated = await updateResponse.json();

      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie: fixture.memberCookie },
      });
      const session = await sessionResponse.json();
      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie: fixture.memberCookie },
      });
      const state = await stateResponse.json();
      const ledgerResponse = await fetch(`${server.origin}/api/creator/credits/ledger?pageSize=20`, {
        headers: { cookie: fixture.memberCookie },
      });
      const ledger = await ledgerResponse.json();
      const olderLedgerResponse = await fetch(`${server.origin}/api/creator/credits/ledger?page=2&pageSize=1`, {
        headers: { cookie: fixture.memberCookie },
      });
      const olderLedger = await olderLedgerResponse.json();
      const ownerLedgerResponse = await fetch(`${server.origin}/api/creator/credits/ledger?pageSize=20`, {
        headers: { cookie: ownerCookie },
      });
      const ownerLedger = await ownerLedgerResponse.json();

      assert.equal(updateResponse.status, 200);
      assert.equal(updated.body?.member?.creditBalance ?? updated.member?.creditBalance, 25);
      assert.equal(sessionResponse.status, 200);
      assert.equal(stateResponse.status, 200);
      assert.equal(ledgerResponse.status, 200);
      assert.equal(olderLedgerResponse.status, 200);
      assert.equal(ownerLedgerResponse.status, 200);
      assert.equal(session.user.availableCredits, 25);
      assert.equal(state.availableCredits, 25);
      assert.equal(ledger.summary.displayAvailableCredits, 25);
      assert.equal(ledger.meta.total, 2);
      assert.equal(ledger.data[0]?.sourceType, "team_member_credit_allocation");
      assert.equal(ledger.data[0]?.amount, 15);
      assert.equal(ledger.data[0]?.balanceAfter, 25);
      assert.equal(ledger.data[1]?.sourceType, "team_member_credit_allocation");
      assert.equal(ledger.data[1]?.amount, 10);
      assert.equal(ledger.data[1]?.balanceAfter, 10);
      assert.equal(olderLedger.data[0]?.balanceAfter, 10);
      const ownerAllocation = ownerLedger.data.find((entry: { accountType?: string; amount?: number }) =>
        entry.accountType === "owner" && entry.amount === 15,
      );
      const memberAllocation = ownerLedger.data.find((entry: { accountType?: string; amount?: number }) =>
        entry.accountType === "subaccount" && entry.amount === 15,
      );
      assert.equal(ownerAllocation?.balanceAfter, 85);
      assert.equal(memberAllocation?.balanceAfter, 25);
    } finally {
      await server.close();
    }
  });

  it("persists creator display name updates and returns them from session", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const updateResponse = await fetch(`${server.origin}/api/auth/profile`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          displayName: "灵曦导演",
        }),
      });
      const updated = await updateResponse.json();

      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });
      const session = await sessionResponse.json();

      const userRecord = await db.query<{ display_name: string }>(
        "SELECT display_name FROM users WHERE phone_e164 = '13800138000'",
      );

      assert.equal(updateResponse.status, 200);
      assert.equal(updated.user.displayName, "灵曦导演");
      assert.equal(sessionResponse.status, 200);
      assert.equal(session.user.displayName, "灵曦导演");
      assert.equal(userRecord.rows[0]?.display_name, "灵曦导演");
    } finally {
      await server.close();
    }
  });

  it("rejects creator display names longer than 8 characters", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const updateResponse = await fetch(`${server.origin}/api/auth/profile`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          displayName: "这是一个超过八字的昵称",
        }),
      });
      const updated = await updateResponse.json();

      const userRecord = await db.query<{ display_name: string }>(
        "SELECT display_name FROM users WHERE phone_e164 = '13800138000'",
      );

      assert.equal(updateResponse.status, 400);
      assert.equal(updated.error, "display_name_too_long");
      assert.equal(updated.message, "显示昵称最多 8 个字。");
      assert.notEqual(userRecord.rows[0]?.display_name, "这是一个超过八字的昵称");
    } finally {
      await server.close();
    }
  });

  it("creates new users with the database default zero credit balance", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      await login(server.origin, "13800138123");

      const users = await db.query<{
        credit_balance_cached: number;
      }>(
        `
          SELECT credit_balance_cached
          FROM users
          WHERE phone_e164 = '13800138123'
        `,
      );
      const seedCreditLots = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM credit_lots
          WHERE source_type = 'dev_seed_initial_credits'
        `,
      );

      assert.equal(users.rows[0]?.credit_balance_cached, 0);
      assert.equal(seedCreditLots.rows[0]?.count, 0);
    } finally {
      await server.close();
    }
  });

  it("preserves the user's cached balance when creating a project", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await db.query(
        "UPDATE users SET credit_balance_cached = 1200, credit_reserved_cached = 0 WHERE phone_e164 = $1",
        [normalizeCnPhone("13800138000")],
      );

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "legacy-dev-credit-lot-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Legacy Credit Lot Repair",
          scriptInput: "Episode 1: Legacy cached credits need spendable lots.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const project = await createProjectResponse.json();
      const user = await db.query<{ credit_balance_cached: number | string }>(
        "SELECT credit_balance_cached FROM users WHERE phone_e164 = $1",
        [normalizeCnPhone("13800138000")],
      );

      assert.equal(createProjectResponse.status, 200);
      assert.ok(project.project.id);
      assert.equal(Number(user.rows[0]?.credit_balance_cached ?? 0), 1200);
    } finally {
      await server.close();
    }
  });

  it("uses a one-day auth cookie when SMS login is not remembered", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);

      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const requested = await requestResponse.json();
      const debugResponse = await fetch(`${server.origin}/api/auth/dev/challenges/${requested.challengeId}`);
      const debug = await debugResponse.json();

      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "13800138000",
          code: debug.code,
          remember: false,
        }),
      });
      const cookie = verifyResponse.headers.get("set-cookie") ?? "";

      assert.equal(verifyResponse.status, 200);
      assert.match(cookie, /Max-Age=86400/);
    } finally {
      await server.close();
    }
  });

  it("sets phone users' initial password to the last six phone digits and supports password login", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);

      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "18571521874" }),
      });
      const requested = await requestResponse.json();
      const debugResponse = await fetch(`${server.origin}/api/auth/dev/challenges/${requested.challengeId}`);
      const debug = await debugResponse.json();

      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "18571521874",
          code: debug.code,
        }),
      });
      const createdUser = await db.query<{ password_hash: string | null }>(
        "SELECT password_hash FROM users WHERE phone_e164 = '18571521874'",
      );

      const passwordResponse = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: "18571521874",
          password: "521874",
          remember: true,
        }),
      });
      const passwordPayload = await passwordResponse.json();
      const cookie = passwordResponse.headers.get("set-cookie") ?? "";
      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });
      const sessionPayload = await sessionResponse.json();

      assert.equal(requestResponse.status, 200);
      assert.equal(verifyResponse.status, 200);
      assert.match(createdUser.rows[0]?.password_hash ?? "", /^scrypt:v1:/);
      assert.notEqual(createdUser.rows[0]?.password_hash, "521874");
      assert.equal(passwordResponse.status, 200);
      assert.equal(passwordPayload.user.phone, "18571521874");
      assert.equal(sessionResponse.status, 200);
      assert.equal(sessionPayload.authenticated, true);
      assert.match(cookie, /Max-Age=2592000/);
    } finally {
      await server.close();
    }
  });

  it("uses a one-day auth cookie when password login is not remembered", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);

      await ensurePasswordLoginUser(db, normalizeCnPhone("18571521874"));

      const passwordResponse = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: "18571521874",
          password: "521874",
          remember: false,
        }),
      });
      const cookie = passwordResponse.headers.get("set-cookie") ?? "";

      assert.equal(passwordResponse.status, 200);
      assert.match(cookie, /Max-Age=86400/);
    } finally {
      await server.close();
    }
  });

  it("redirects production HTTP requests to HTTPS before serving pages or APIs", async () => {
    const server = createPhoneAuthDevServer({
      db: {} as Awaited<ReturnType<typeof createDevDb>>,
      allowProduction: true,
      env: {
        NODE_ENV: "production",
        PUBLIC_HOST: "www.lingxiyunai.com",
      },
    });
    const proxyHeaders = {
      host: "www.lingxiyunai.com:80",
      "x-forwarded-host": "www.lingxiyunai.com:80",
      "x-forwarded-proto": "http",
    };

    try {
      await server.listen(0);

      const pageResponse = await fetch(`${server.origin}/projects?tab=active`, {
        headers: proxyHeaders,
        redirect: "manual",
      });
      assert.equal(pageResponse.status, 308);
      assert.equal(
        pageResponse.headers.get("location"),
        "https://www.lingxiyunai.com/projects?tab=active",
      );

      const untrustedTargetResponse = await fetch(
        `${server.origin}//attacker.example/collect?source=http`,
        {
          headers: {
            ...proxyHeaders,
            host: "attacker-host.example",
            "x-forwarded-host": "attacker.example",
          },
          redirect: "manual",
        },
      );
      assert.equal(untrustedTargetResponse.status, 308);
      assert.equal(
        untrustedTargetResponse.headers.get("location"),
        "https://www.lingxiyunai.com/collect?source=http",
      );

      const appendedProxyProtocolResponse = await fetch(`${server.origin}/projects`, {
        headers: {
          host: "www.lingxiyunai.com:443",
          "x-forwarded-proto": "https, http",
        },
        redirect: "manual",
      });
      assert.equal(appendedProxyProtocolResponse.status, 308);
      assert.equal(
        appendedProxyProtocolResponse.headers.get("location"),
        "https://www.lingxiyunai.com/projects",
      );

      const misleadingPortResponse = await fetch(`${server.origin}/projects`, {
        headers: { host: "www.lingxiyunai.com:443" },
        redirect: "manual",
      });
      assert.equal(misleadingPortResponse.status, 308);
      assert.equal(
        misleadingPortResponse.headers.get("location"),
        "https://www.lingxiyunai.com/projects",
      );

      const apiResponse = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: proxyHeaders,
        redirect: "manual",
      });
      assert.equal(apiResponse.status, 308);
      assert.equal(
        apiResponse.headers.get("location"),
        "https://www.lingxiyunai.com/api/auth/password/login",
      );

      const poisonedHeaders = {
        host: "attacker.example:443",
        "x-forwarded-host": "attacker.example:443",
        "x-forwarded-proto": "https",
      };
      const robotsResponse = await fetch(`${server.origin}/robots.txt`, { headers: poisonedHeaders });
      const robots = await robotsResponse.text();
      assert.match(robots, /Sitemap: https:\/\/www\.lingxiyunai\.com\/sitemap\.xml/);
      assert.doesNotMatch(robots, /attacker\.example/);
      const sitemapResponse = await fetch(`${server.origin}/sitemap.xml`, { headers: poisonedHeaders });
      const sitemap = await sitemapResponse.text();
      assert.match(sitemap, /<loc>https:\/\/www\.lingxiyunai\.com\/script<\/loc>/);
      assert.doesNotMatch(sitemap, /attacker\.example/);
    } finally {
      await server.close();
    }
  });

  it("marks user session cookies secure in production", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      allowProduction: true,
      env: { NODE_ENV: "production" },
    });

    try {
      await ensurePasswordLoginUser(db, normalizeCnPhone("18571521874"));
      await server.listen(0);

      const response = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "www.lingxiyunai.com:443",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ account: "18571521874", password: "521874" }),
      });

      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie") ?? "", /; Secure$/);
    } finally {
      await server.close();
    }
  });

  it("rejects oversized ordinary JSON request bodies", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const response = await fetch(`${server.origin}/api/community/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "oversized", content: "x".repeat(6 * 1024 * 1024) }),
      });

      assert.equal(response.status, 413);
    } finally {
      await server.close();
    }
  });

  it("returns SMS send metadata and records cooldown through the auth request route", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();
    try {
      await server.listen(0);

      const firstResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "UnitTest/1.0",
          "x-forwarded-for": "203.0.113.20",
        },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const first = await firstResponse.json();
      const secondResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "UnitTest/1.0",
          "x-forwarded-for": "203.0.113.20",
        },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const second = await secondResponse.json();

      assert.equal(firstResponse.status, 200);
      assert.equal(first.remainingToday, 4);
      assert.equal(secondResponse.status, 429);
      assert.equal(second.error, "sms_cooldown_active");
      assert.equal(second.cooldownSeconds, 60);
      assert.equal(typeof second.retryAfterSeconds, "number");
    } finally {
      await server.close();
    }
  });

  it("allows local file pages to call the development API with credentials", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const preflightResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "OPTIONS",
        headers: {
          origin: "null",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { origin: "null" },
      });

      assert.equal(preflightResponse.status, 204);
      assert.equal(preflightResponse.headers.get("access-control-allow-origin"), "null");
      assert.equal(preflightResponse.headers.get("access-control-allow-credentials"), "true");
      assert.match(
        preflightResponse.headers.get("access-control-allow-headers") ?? "",
        /content-type/,
      );
      assert.equal(sessionResponse.status, 401);
      assert.equal(sessionResponse.headers.get("access-control-allow-origin"), "null");
      assert.equal(sessionResponse.headers.get("access-control-allow-credentials"), "true");
    } finally {
      await server.close();
    }
  });

  it("exposes the provider callback boundary and rejects unknown payment providers", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const response = await fetch(
        `${server.origin}/api/payment-provider-callbacks/stripe`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(payload, { error: "invalid_payment_provider" });
    } finally {
      await server.close();
    }
  });

  it("rejects oversized payment provider callback bodies", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const response = await fetch(
        `${server.origin}/api/payment-provider-callbacks/paylab`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "x".repeat(6 * 1024 * 1024 + 1),
        },
      );
      const payload = await response.json();

      assert.equal(response.status, 413);
      assert.equal(payload.errorCode, "request_body_too_large");
    } finally {
      await server.close();
    }
  });

  it("rejects declared oversized multipart uploads before parsing the body", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const response = await new Promise<{ status: number; body: string }>((resolveResponse, reject) => {
        const request = httpRequest(`${server.origin}/api/creator/uploads`, {
          method: "POST",
          headers: {
            cookie,
            "content-type": "multipart/form-data; boundary=oversized-test-boundary",
            "content-length": String(501 * 1024 * 1024 + 1),
          },
        }, (incoming) => {
          let body = "";
          incoming.setEncoding("utf8");
          incoming.on("data", (chunk) => { body += chunk; });
          incoming.on("end", () => {
            request.destroy();
            resolveResponse({ status: incoming.statusCode ?? 0, body });
          });
        });
        request.on("error", reject);
        request.flushHeaders();
      });

      assert.equal(response.status, 413);
      assert.equal(JSON.parse(response.body).errorCode, "request_body_too_large");
    } finally {
      await server.close();
    }
  });

  it("exposes a creator workflow API that can create, parse, and export a mock project", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "workflow-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator flow smoke test",
          scriptInput: "Episode 1: Dawn over the mechanical city.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const parseResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "workflow-parse-key",
          cookie,
        },
      });
      const parsed = await parseResponse.json();

      const confirmResponse = await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });
      const confirmed = await confirmResponse.json();

      const calibrationResponse = await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: {
          "idempotency-key": "workflow-calibration-key",
          cookie,
        },
      });
      const calibration = await calibrationResponse.json();

      const imageResponse = await fetchProjectShotImageBatch(server.origin, {
        method: "POST",
        headers: {
          "idempotency-key": "workflow-image-key",
          cookie,
        },
      });
      const imageBatch = (await imageResponse.json()).data;

      const exportResponse = await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: {
          "idempotency-key": "workflow-export-key",
          cookie,
        },
      });
      const exportPreview = await exportResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(parseResponse.status, 202);
      assert.equal(confirmResponse.status, 200);
      assert.equal(calibrationResponse.status, 200);
      assert.equal(imageResponse.status, 200);
      assert.equal(exportResponse.status, 200);
      assert.equal(created.project.phase, "script_input");
      assert.ok(parsed.workflow);
      assert.ok(parsed.assetReview);
      assert.equal(confirmed.assetReview.readyForGeneration, true);
      assert.equal(calibration.calibration.status, "passed");
      assert.equal(calibration.auditEvent.eventType, "calibration.passed");
      assert.ok(imageBatch.successes.length > 0);
      assert.equal(exportPreview.export.status, "ready");
      assert.equal(exportPreview.exportRecord.manifestStatus, "ready");
    } finally {
      await server.close();
    }
  });

  it("requires and replays Idempotency-Key for creator project creation", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const body = {
        name: "Creator idempotency contract",
        scriptInput: "Episode 1: A creator double-clicks the create action.",
        aspectRatio: "9:16",
        resolution: "1080p",
      };

      const missingKeyResponse = await fetch(
        `${server.origin}/api/creator/project/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify(body),
        },
      );
      const missingKey = await missingKeyResponse.json();

      const firstResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-create-replay-key",
          cookie,
        },
        body: JSON.stringify(body),
      });
      const first = await firstResponse.json();
      const replayResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-create-replay-key",
          cookie,
        },
        body: JSON.stringify(body),
      });
      const replay = await replayResponse.json();
      const conflictResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-create-replay-key",
          cookie,
        },
        body: JSON.stringify({
          ...body,
          name: "Creator idempotency conflict",
        }),
      });
      const conflict = await conflictResponse.json();
      const projectsResponse = await fetch(`${server.origin}/api/creator/projects`, {
        headers: { cookie },
      });
      const projects = await projectsResponse.json();

      assert.equal(missingKeyResponse.status, 400);
      assert.deepEqual(missingKey, { error: "idempotency_key_required" });
      assert.equal(firstResponse.status, 200);
      assert.equal(replayResponse.status, 200);
      assert.equal(conflictResponse.status, 409);
      assert.equal(first.project.id, replay.project.id);
      assert.equal(first.script.id, replay.script.id);
      assert.deepEqual(conflict, { error: "idempotency_conflict" });
      assert.equal(projects.projects.length, 1);
    } finally {
      await server.close();
    }
  });

  it("stores creator projects under the current user", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "personal-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Personal project",
          scriptInput: "Episode 1: Project ownership stays personal.",
          aspectRatio: "9:16",
          resolution: "1080p",
          projectType: "oil_painting",
        }),
      });
      const created = await createResponse.json();

      const counts = await db.query<{
        owner_project_count: number;
        project_owner_user_id: string;
        project_style_code: string;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects WHERE owner_user_id = (SELECT id FROM users WHERE phone_e164 = '13800138000')) AS owner_project_count,
            (SELECT owner_user_id FROM projects WHERE id = $1) AS project_owner_user_id,
            (SELECT project_style_code FROM projects WHERE id = $1) AS project_style_code
        `,
        [created.project.id],
      );

      const projectsResponse = await fetch(`${server.origin}/api/creator/projects`, {
        headers: { cookie },
      });
      const projects = await projectsResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(counts.rows[0]?.owner_project_count, 1);
      assert.equal(counts.rows[0]?.project_owner_user_id, await readUserIdForPhone(db, normalizeCnPhone("13800138000")));
      assert.equal(counts.rows[0]?.project_style_code, "oil_painting");
      assert.equal(created.project.projectType, "oil_painting");
      assert.equal(projects.projects.length, 1);
      assert.equal(projects.projects[0].id, created.project.id);
      assert.equal(projects.projects[0].projectType, "oil_painting");
    } finally {
      await server.close();
    }
  });

  it("deletes creator projects with export records through the HTTP route", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138199");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-delete-export-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "HTTP delete export project",
          scriptInput: "Episode 1: A project is exported before deletion.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const parseResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-delete-export-project-parse",
          cookie,
        },
      });

      const confirmResponse = await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });

      const calibrationResponse = await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-delete-export-project-calibration",
          cookie,
        },
      });

      const imageResponse = await fetchProjectShotImageBatch(server.origin, {
        method: "POST",
        headers: {
          "idempotency-key": "http-delete-export-project-image",
          cookie,
        },
      });

      const exportResponse = await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-delete-export-project-export",
          cookie,
        },
      });
      const exported = await exportResponse.json();

      const deleteResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId: created.project.id }),
      });
      const deleted = await deleteResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(parseResponse.status, 202);
      assert.equal(confirmResponse.status, 200);
      assert.equal(calibrationResponse.status, 200);
      assert.equal(imageResponse.status, 200);
      assert.equal(exportResponse.status, 200);
      assert.equal(exported.exportRecord.manifestStatus, "ready");
      assert.equal(deleteResponse.status, 200);
      assert.equal(deleted.deleted, true);
      assert.equal(deleted.projectId, created.project.id);
    } finally {
      await server.close();
    }
  });

  it("creates, renames, and deletes independent canvases through HTTP routes", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138277");

      const createResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-canvas-project-create",
          cookie,
        },
        body: JSON.stringify({
          title: "迷雾世界-第一卷",
        }),
      });
      const created = await createResponse.json();
      const projectId = created.data.project.id;
      const laterCanvasProjectId = "50000000-0000-4000-8000-000000000278";
      const userRow = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE phone_e164 = $1",
        [normalizeCnPhone("13800138277")],
      );
      const userId = userRow.rows[0]?.id;
      assert.ok(userId);
      await db.query(
        `
          INSERT INTO creator_canvas_projects (
            id,
            title,
            status,
            created_by_user_id,
            updated_by_user_id,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            '最新独立画布',
            'draft',
            $2,
            $2,
            NOW() + INTERVAL '1 second',
            NOW() + INTERVAL '1 second'
          )
        `,
        [laterCanvasProjectId, userId],
      );
      const createdRow = await db.query<{ title: string; deleted_at: string | null }>(
        "SELECT title, deleted_at FROM creator_canvas_projects WHERE id = $1",
        [projectId],
      );
      const ordinaryProjectsAfterCanvasCreate = await fetch(`${server.origin}/api/creator/projects`, {
        headers: { cookie },
      });
      const ordinaryProjects = await ordinaryProjectsAfterCanvasCreate.json();

      const renameResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          title: "迷雾世界-第二卷",
          expectedTitle: "迷雾世界-第一卷",
        }),
      });
      const renamed = await renameResponse.json();
      const staleRenameResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          title: "过期设备标题",
          expectedTitle: "迷雾世界-第一卷",
        }),
      });
      const staleRename = await staleRenameResponse.json();
      const renamedRow = await db.query<{ title: string; deleted_at: string | null }>(
        "SELECT title, deleted_at FROM creator_canvas_projects WHERE id = $1",
        [projectId],
      );

      const saveCanvasResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${projectId}/canvas`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          clientRevision: 1,
          document: {
            version: 1,
            canvasProjectId: projectId,
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [{ id: "historical-node", type: "text", data: { title: "历史画布节点" } }],
            edges: [],
          },
          events: [],
        }),
      });
      const savedCanvas = await saveCanvasResponse.json();
      const loadCanvasResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${projectId}/canvas`, {
        headers: { cookie },
      });
      const loadedCanvas = await loadCanvasResponse.json();

      const listResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        headers: { cookie },
      });
      const listed = await listResponse.json();
      const deleteResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${projectId}`, {
        method: "DELETE",
        headers: { cookie },
      });
      const deleted = await deleteResponse.json();
      const deletedRow = await db.query<{ title: string; deleted_at: string | null }>(
        "SELECT title, deleted_at FROM creator_canvas_projects WHERE id = $1",
        [projectId],
      );

      const afterDeleteResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        headers: { cookie },
      });
      const afterDelete = await afterDeleteResponse.json();

      assert.equal(createResponse.status, 201);
      assert.equal(created.data.project.title, "迷雾世界-第一卷");
      assert.equal(createdRow.rows[0]?.title, "迷雾世界-第一卷");
      assert.equal(createdRow.rows[0]?.deleted_at, null);
      assert.equal(ordinaryProjectsAfterCanvasCreate.status, 200);
      assert.equal(
        ordinaryProjects.projects.some((project) => project.id === projectId || project.name === "迷雾世界-第一卷"),
        false,
      );
      assert.equal(renameResponse.status, 200, JSON.stringify(renamed));
      assert.equal(staleRenameResponse.status, 409);
      assert.equal(staleRename.errorCode, "canvas_project_title_conflict");
      assert.equal(staleRename.details.currentTitle, "迷雾世界-第二卷");
      assert.equal(renamed.data.project.title, "迷雾世界-第二卷");
      assert.equal(renamedRow.rows[0]?.title, "迷雾世界-第二卷");
      assert.equal(saveCanvasResponse.status, 200, JSON.stringify(savedCanvas));
      assert.equal(savedCanvas.data.canvas.document.nodes[0]?.id, "historical-node");
      assert.equal(loadCanvasResponse.status, 200, JSON.stringify(loadedCanvas));
      assert.equal(loadedCanvas.data.canvas.document.nodes[0]?.id, "historical-node");
      assert.equal(listResponse.status, 200, JSON.stringify(listed));
      assert.equal(listed.data.projects.some((project) => project.id === laterCanvasProjectId), true);
      assert.equal(listed.data.projects.some((project) => project.id === projectId && project.title === "迷雾世界-第二卷"), true);
      assert.equal(deleteResponse.status, 200);
      assert.equal(deleted.data.deletedProjectId, projectId);
      assert.notEqual(deletedRow.rows[0]?.deleted_at, null);
      assert.equal(afterDelete.data.projects.some((project) => project.id === projectId), false);
    } finally {
      await server.close();
    }
  });

  it("reads bounded independent canvas revisions for owners and assigned team members", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138001");
      const createResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-canvas-revision-create",
          cookie: ownerCookie,
        },
        body: JSON.stringify({ title: "云端版本历史" }),
      });
      const created = await createResponse.json();
      const canvasProjectId = created.data.project.id;
      const saveResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${canvasProjectId}/canvas`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          clientRevision: 1,
          document: {
            version: 2,
            canvasProjectId,
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [{ id: "revision-node", type: "text", data: { title: "云端历史节点" } }],
            edges: [],
          },
        }),
      });
      const saved = await saveResponse.json();
      const revisionRows = await db.query<{ id: string }>(
        `SELECT id FROM creator_canvas_revisions WHERE canvas_project_id = $1 ORDER BY server_revision LIMIT 1`,
        [canvasProjectId],
      );
      const revisionId = revisionRows.rows[0]?.id;
      assert.ok(revisionId);
      const ownerUserId = await readUserIdForPhone(db, normalizeCnPhone("13800138001"));
      const syntheticRevisions = Array.from({ length: 106 }, (_, index) => ({
        id: randomUUID(),
        server_revision: index + 3,
      }));
      await db.query(
        `
          INSERT INTO creator_canvas_revisions (
            id, canvas_project_id, server_revision, operation,
            document_json, summary_json, created_by_user_id, created_at
          )
          SELECT revision.id, $2, revision.server_revision, 'autosave',
                 $3::jsonb, '{}'::jsonb, $4, NOW()
          FROM jsonb_to_recordset($1::jsonb) AS revision(id uuid, server_revision integer)
        `,
        [JSON.stringify(syntheticRevisions), canvasProjectId, JSON.stringify(saved.data.canvas.document), ownerUserId],
      );

      const listResponse = await fetch(
        `${server.origin}/api/creator/canvas-projects/${canvasProjectId}/revisions?limit=500`,
        { headers: { cookie: ownerCookie } },
      );
      const listed = await listResponse.json();
      const olderListResponse = await fetch(
        `${server.origin}/api/creator/canvas-projects/${canvasProjectId}/revisions?limit=100&beforeRevision=${listed.data.nextCursor}`,
        { headers: { cookie: ownerCookie } },
      );
      const olderListed = await olderListResponse.json();
      const detailResponse = await fetch(
        `${server.origin}/api/creator/canvas-projects/${canvasProjectId}/revisions/${revisionId}`,
        { headers: { cookie: ownerCookie } },
      );
      const detail = await detailResponse.json();
      const missingDetailResponse = await fetch(
        `${server.origin}/api/creator/canvas-projects/${canvasProjectId}/revisions/${randomUUID()}`,
        { headers: { cookie: ownerCookie } },
      );

      const createMemberResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          teamAccount: "canvas_revision_viewer",
          displayName: "Canvas Revision Viewer",
          projectIds: [],
          scriptIds: [],
          canvasIds: [canvasProjectId],
          initialCredits: 0,
        }),
      });
      const createdMember = await createMemberResponse.json();
      const memberCookie = await loginTeamMemberAccount(
        server.origin,
        createdMember.member.memberLoginAccount,
        createdMember.temporaryPassword,
      );
      const memberDetailResponse = await fetch(
        `${server.origin}/api/creator/canvas-projects/${canvasProjectId}/revisions/${revisionId}`,
        { headers: { cookie: memberCookie } },
      );
      const otherCookie = await login(server.origin, "13800138276");
      const otherListResponse = await fetch(
        `${server.origin}/api/creator/canvas-projects/${canvasProjectId}/revisions`,
        { headers: { cookie: otherCookie } },
      );

      assert.equal(createResponse.status, 201);
      assert.equal(saveResponse.status, 200, JSON.stringify(saved));
      assert.equal(listResponse.status, 200, JSON.stringify(listed));
      assert.equal(listed.data.revisions.length, 100);
      assert.equal(listed.data.hasMore, true);
      assert.equal(typeof listed.data.nextCursor, "number");
      assert.equal(olderListResponse.status, 200, JSON.stringify(olderListed));
      assert.equal(olderListed.data.revisions.length, 7);
      assert.equal(olderListed.data.hasMore, false);
      assert.equal(olderListed.data.nextCursor, null);
      assert.equal(Object.prototype.hasOwnProperty.call(listed.data.revisions[0], "document"), false);
      assert.equal(detailResponse.status, 200, JSON.stringify(detail));
      assert.equal(detail.data.revision.id, revisionId);
      assert.equal(detail.data.revision.document.nodes[0]?.id, "revision-node");
      assert.equal(missingDetailResponse.status, 404);
      assert.equal(createMemberResponse.status, 200, JSON.stringify(createdMember));
      assert.equal(memberDetailResponse.status, 200);
      assert.equal(otherListResponse.status, 404);
    } finally {
      await server.close();
    }
  });

  it("does not list another user's independent canvases", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138278");
      const otherCookie = await login(server.origin, "13800138279");

      const createResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-canvas-project-owner-only",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          title: "只属于原账号的画布",
        }),
      });
      const created = await createResponse.json();

      const ownerListResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        headers: { cookie: ownerCookie },
      });
      const ownerList = await ownerListResponse.json();

      const otherListResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        headers: { cookie: otherCookie },
      });
      const otherList = await otherListResponse.json();

      assert.equal(createResponse.status, 201);
      assert.equal(created.data.project.title, "只属于原账号的画布");
      assert.equal(ownerListResponse.status, 200);
      assert.equal(
        ownerList.data.projects.some((project) => project.id === created.data.project.id),
        true,
      );
      assert.equal(otherListResponse.status, 200);
      assert.equal(
        otherList.data.projects.some(
          (project) => project.id === created.data.project.id || project.title === "只属于原账号的画布",
        ),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("lists only independent canvases assigned to a team member", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138001");

      const createCanvasResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-team-member-standalone-canvas",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          title: "可分配独立画布",
        }),
      });
      const createdCanvas = await createCanvasResponse.json();
      const canvasProjectId = createdCanvas.data.project.id;
      const createHiddenCanvasResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-team-member-hidden-standalone-canvas",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          title: "未分配独立画布",
        }),
      });
      const createdHiddenCanvas = await createHiddenCanvasResponse.json();
      const hiddenCanvasProjectId = createdHiddenCanvas.data.project.id;

      const createMemberResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          teamAccount: "canvas_viewer_001",
          displayName: "Canvas Viewer",
          projectIds: [],
          scriptIds: [],
          canvasIds: [canvasProjectId],
          initialCredits: 0,
        }),
      });
      const createdMember = await createMemberResponse.json();

      const memberLoginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: createdMember.member.memberLoginAccount,
          password: createdMember.temporaryPassword,
          actorType: "team_member",
        }),
      });
      const memberCookie = memberLoginResponse.headers.get("set-cookie") ?? "";

      const memberCanvasListResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        headers: { cookie: memberCookie },
      });
      const memberCanvasList = await memberCanvasListResponse.json();

      assert.equal(createCanvasResponse.status, 201);
      assert.equal(createHiddenCanvasResponse.status, 201);
      assert.equal(createMemberResponse.status, 200, JSON.stringify(createdMember));
      assert.equal(memberLoginResponse.status, 200);
      assert.equal(memberCanvasListResponse.status, 200, JSON.stringify(memberCanvasList));
      assert.equal(
        memberCanvasList.data.projects.some((project: { id?: string }) => project.id === canvasProjectId),
        true,
      );
      assert.equal(
        memberCanvasList.data.projects.some((project: { id?: string }) => project.id === hiddenCanvasProjectId),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("runs independent canvas image nodes through the unified image endpoint", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138280");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138280"));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 1000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const createResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-canvas-run-project-create",
          cookie,
        },
        body: JSON.stringify({ title: "可运行的独立画布" }),
      });
      const created = await createResponse.json();
      const canvasProjectId = created.data.project.id;
      const saveResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${canvasProjectId}/canvas`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          clientRevision: 1,
          document: {
            version: 1,
            canvasProjectId,
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [
              {
                id: "image-node",
                type: "image",
                position: { x: 100, y: 100 },
                data: {
                  mediaKind: "image",
                  modelCode: "global-ai-opc-gpt-image-2",
                  prompt: "生成一张画布测试图",
                  ports: { inputs: [], outputs: [{ id: "out_image", kind: "image" }] },
                },
              },
            ],
            edges: [],
          },
          events: [],
        }),
      });
      const saved = await saveResponse.json();
      const invalidAudioRunResponse = await fetch(
        `${server.origin}/api/canvas/${canvasProjectId}/nodes/image-node/run`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-canvas-invalid-audio-node",
            cookie,
          },
          body: JSON.stringify({ kind: "audio", text: "不能从图片节点生成音频", model: "cosyvoice-v1" }),
        },
      );
      const invalidAudioRun = await invalidAudioRunResponse.json();
      const scopeCountsBefore = await db.query<{ project_count: number; episode_count: number }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects WHERE owner_user_id = $1) AS project_count,
            (
              SELECT count(*)::int
              FROM episodes episode
              JOIN projects project ON project.id = episode.project_id
              WHERE project.owner_user_id = $1
            ) AS episode_count
        `,
        [userId],
      );
      assert.equal(invalidAudioRunResponse.status, 400, JSON.stringify(invalidAudioRun));
      assert.equal(invalidAudioRun.errorCode, "canvas_audio_node_invalid");
      const legacyEpisodeCanvasResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-canvas-episode-fallback-forbidden",
          cookie,
        },
        body: JSON.stringify({
          target: {
            kind: "canvas",
            episodeId: randomUUID(),
            nodeId: "image-node",
          },
          prompt: "不得通过剧集运行画布任务",
          model: "global-ai-opc-gpt-image-2",
        }),
      });
      const legacyEpisodeCanvas = await legacyEpisodeCanvasResponse.json();
      assert.equal(legacyEpisodeCanvasResponse.status, 400, JSON.stringify(legacyEpisodeCanvas));
      assert.equal(legacyEpisodeCanvas.errorCode, "canvas_project_id_required");
      const otherCookie = await login(server.origin, "13800138281");
      const forbiddenRunsResponse = await fetch(
        `${server.origin}/api/canvas/${canvasProjectId}/nodes/image-node/runs`,
        { headers: { cookie: otherCookie } },
      );
      const forbiddenRunResponse = await fetch(
        `${server.origin}/api/canvas/${canvasProjectId}/nodes/image-node/run`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-canvas-node-run-cross-user",
            cookie: otherCookie,
          },
          body: JSON.stringify({ kind: "image", prompt: "cross-user attempt" }),
        },
      );
      const runResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-canvas-node-run-personal-project",
          cookie,
        },
        body: JSON.stringify({
          target: {
            kind: "canvas",
            canvasProjectId,
            nodeId: "image-node",
          },
          prompt: "生成一张画布测试图",
          model: "global-ai-opc-gpt-image-2",
        }),
      });
      const run = await runResponse.json();
      const providerRequest = await db.query<{ payload_ref: string; project_id: string | null; canvas_project_id: string | null }>(
        "SELECT payload_ref, project_id, canvas_project_id FROM provider_requests WHERE task_id = $1 LIMIT 1",
        [run.data.taskId],
      );
      const taskScope = await db.query<{ project_id: string | null; canvas_project_id: string | null }>(
        "SELECT project_id, canvas_project_id FROM tasks WHERE id = $1",
        [run.data.taskId],
      );
      const scopeCountsAfter = await db.query<{ project_count: number; episode_count: number }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects WHERE owner_user_id = $1) AS project_count,
            (
              SELECT count(*)::int
              FROM episodes episode
              JOIN projects project ON project.id = episode.project_id
              WHERE project.owner_user_id = $1
            ) AS episode_count
        `,
        [userId],
      );
      const afterRunListResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        headers: { cookie },
      });
      const afterRunList = await afterRunListResponse.json();
      const afterRunCanvasResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${canvasProjectId}/canvas`, {
        headers: { cookie },
      });
      const afterRunCanvas = await afterRunCanvasResponse.json();
      const staleStandaloneDocument = {
        ...afterRunCanvas.data.canvas.document,
        projectId: canvasProjectId,
      };
      const saveAfterRunResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${canvasProjectId}/canvas`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          clientRevision: afterRunCanvas.data.canvas.serverRevision,
          document: staleStandaloneDocument,
          events: [],
        }),
      });
      const savedAfterRun = await saveAfterRunResponse.json();

      assert.equal(createResponse.status, 201);
      assert.equal(saveResponse.status, 200);
      assert.equal(saved.data.canvas.canvasProjectId, canvasProjectId);
      assert.equal(forbiddenRunsResponse.status, 404);
      assert.equal(forbiddenRunResponse.status, 404);
      assert.equal(runResponse.status, 200);
      assert.equal(run.data.canvasProjectId, canvasProjectId);
      assert.equal(run.data.nodeKey, "image-node");
      assert.equal(run.data.targetType, "canvas");
      assert.equal(run.data.targetId, "image-node");
      assert.ok(run.data.runId);
      assert.ok(run.data.taskId);
      assert.equal(
        providerRequest.rows[0]?.payload_ref,
        `creator://generation/canvas/image-node/image/${run.data.taskId}`,
      );
      assert.equal(providerRequest.rows[0]?.project_id, null);
      assert.equal(providerRequest.rows[0]?.canvas_project_id, canvasProjectId);
      assert.deepEqual(taskScope.rows[0], { project_id: null, canvas_project_id: canvasProjectId });
      assert.deepEqual(scopeCountsAfter.rows[0], scopeCountsBefore.rows[0]);
      assert.equal(afterRunListResponse.status, 200);
      assert.equal(afterRunList.data.projects.some((project) => project.id === canvasProjectId), true);
      assert.equal(afterRunCanvasResponse.status, 200);
      assert.equal(afterRunCanvas.data.canvas.canvasProjectId, canvasProjectId);
      assert.equal(afterRunCanvas.data.canvas.document.nodes.length, 1);
      assert.equal(saveAfterRunResponse.status, 200);
      assert.equal(savedAfterRun.data.canvas.canvasProjectId, canvasProjectId);
      assert.equal(Object.hasOwn(savedAfterRun.data.canvas.document, "projectId"), false);
    } finally {
      await server.close();
    }
  });

  it("requires and replays Idempotency-Key for creator script parsing", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-parse-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator parse idempotency contract",
          scriptInput: "Episode 1: A creator retries script parsing.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });

      const missingKeyResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: { cookie },
      });
      const missingKey = await missingKeyResponse.json();

      const firstResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-parse-replay-key",
          cookie,
        },
      });
      const first = await firstResponse.json();
      const replayResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-parse-replay-key",
          cookie,
        },
      });
      const replay = await replayResponse.json();

      assert.equal(missingKeyResponse.status, 400);
      assert.deepEqual(missingKey, { error: "idempotency_key_required" });
      assert.equal(firstResponse.status, 202);
      assert.equal(replayResponse.status, 202);
      assert.equal(first.workflow.workflowId, replay.workflow.workflowId);
    } finally {
      await server.close();
    }
  });

  it("supports single-asset editing plus calibration skip/override and export history routes", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const cookie = await login(server.origin, "13800138000");

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-controls-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator controls smoke test",
          scriptInput: "Episode 2: The hero enters the neon forest with a lantern.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });

      const parseResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "asset-controls-parse-key",
          cookie,
        },
      });
      const parsed = await parseResponse.json();
      const firstCharacter = parsed.parse.candidateAssets.find(
        (candidate: { kind: string }) => candidate.kind === "character",
      );

      const confirmResponse = await fetch(`${server.origin}/api/creator/assets/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-controls-skip-key",
          cookie,
        },
        body: JSON.stringify({
          group: "character",
          assetKey: firstCharacter.id,
        }),
      });
      const confirmed = await confirmResponse.json();

      const renameResponse = await fetch(`${server.origin}/api/creator/assets/update-label`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          group: "character",
          assetKey: firstCharacter.id,
          label: "Hero Prime",
        }),
      });
      const renamed = await renameResponse.json();

      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });

      const skipWithoutReasonResponse = await fetch(
        `${server.origin}/api/creator/calibration/skip`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-controls-skip-invalid-key",
            cookie,
          },
          body: JSON.stringify({
            reason: " ",
          }),
        },
      );
      const skipWithoutReason = await skipWithoutReasonResponse.json();

      const skipResponse = await fetch(`${server.origin}/api/creator/calibration/skip`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-controls-skip-key",
          cookie,
        },
        body: JSON.stringify({
          reason: "Approved style frames already cover this sequence.",
        }),
      });
      const skipped = await skipResponse.json();

      const overrideResponse = await fetch(
        `${server.origin}/api/creator/calibration/override`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-controls-override-key",
            cookie,
          },
          body: JSON.stringify({
            reason: "Director approved a deliberate departure from the calibration frame.",
          }),
        },
      );
      const overridden = await overrideResponse.json();

      await fetchProjectShotImageBatch(server.origin, {
        method: "POST",
        headers: {
          "idempotency-key": "asset-controls-image-key",
          cookie,
        },
      });
      await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: {
          "idempotency-key": "asset-controls-export-key",
          cookie,
        },
      });

      const historyResponse = await fetch(`${server.origin}/api/creator/export/history`, {
        method: "GET",
        headers: { cookie },
      });
      const history = await historyResponse.json();

      assert.equal(confirmResponse.status, 200);
      assert.equal(
        confirmed.assetCandidates.characters.some(
          (candidate: { assetKey: string; confirmed: boolean }) =>
            candidate.assetKey === firstCharacter.id && candidate.confirmed,
        ),
        true,
      );
      assert.equal(renameResponse.status, 200);
      assert.equal(
        renamed.assetCandidates.characters.find(
          (candidate: { assetKey: string; label: string }) =>
            candidate.assetKey === firstCharacter.id,
        )?.label,
        "Hero Prime",
      );
      assert.equal(skipWithoutReasonResponse.status, 400);
      assert.equal(skipWithoutReason.error, "reason_required");
      assert.equal(skipResponse.status, 200);
      assert.equal(skipped.auditEvent.eventType, "calibration.skipped");
      assert.equal(overrideResponse.status, 200);
      assert.equal(overridden.auditEvent.eventType, "calibration.override");
      assert.equal(historyResponse.status, 200);
      assert.equal(history.records.length, 1);
      assert.equal(history.records[0]?.manifestStatus, "ready");
    } finally {
      await server.close();
    }
  });

  it("requires and replays Idempotency-Key for creator generation, calibration, and export routes", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-expensive-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator expensive route idempotency",
          scriptInput: "Episode 4: Expensive routes must not replay side effects.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-expensive-parse-key",
          cookie,
        },
      });
      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });

      for (const [path, body] of [
        ["/api/creator/calibration/run", undefined],
        ["/api/creator/calibration/skip", { reason: "Already approved." }],
        ["/api/creator/calibration/override", { reason: "Director approved." }],
        ["/api/generation/image-tasks", { target: { kind: "project_shot_batch" } }],
        ["/api/creator/videos/generate", undefined],
        ["/api/creator/export/preview", undefined],
      ] as const) {
        const response = await fetch(`${server.origin}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const payload = await response.json();

        assert.equal(response.status, 400, path);
        assert.deepEqual(payload, { error: "idempotency_key_required" }, path);
      }

      const calibrationResponse = await fetch(
        `${server.origin}/api/creator/calibration/run`,
        {
          method: "POST",
          headers: {
            "idempotency-key": "http-calibration-run-replay-key",
            cookie,
          },
        },
      );
      const calibration = await calibrationResponse.json();
      const calibrationReplayResponse = await fetch(
        `${server.origin}/api/creator/calibration/run`,
        {
          method: "POST",
          headers: {
            "idempotency-key": "http-calibration-run-replay-key",
            cookie,
          },
        },
      );
      const calibrationReplay = await calibrationReplayResponse.json();

      const imageResponse = await fetchProjectShotImageBatch(server.origin, {
        method: "POST",
        headers: {
          "idempotency-key": "http-image-generate-replay-key",
          cookie,
        },
      });
      const image = (await imageResponse.json()).data;
      const imageReplayResponse = await fetchProjectShotImageBatch(server.origin, {
        method: "POST",
        headers: {
          "idempotency-key": "http-image-generate-replay-key",
          cookie,
        },
      });
      const imageReplay = (await imageReplayResponse.json()).data;

      const videoResponse = await fetch(`${server.origin}/api/creator/videos/generate`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-video-generate-replay-key",
          cookie,
        },
      });
      const video = await videoResponse.json();
      const videoReplayResponse = await fetch(`${server.origin}/api/creator/videos/generate`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-video-generate-replay-key",
          cookie,
        },
      });
      const videoReplay = await videoReplayResponse.json();

      const exportResponse = await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-export-preview-replay-key",
          cookie,
        },
      });
      const exportPreview = await exportResponse.json();
      const exportReplayResponse = await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-export-preview-replay-key",
          cookie,
        },
      });
      const exportReplay = await exportReplayResponse.json();
      const historyResponse = await fetch(`${server.origin}/api/creator/export/history`, {
        headers: { cookie },
      });
      const history = await historyResponse.json();

      assert.equal(calibrationResponse.status, 200);
      assert.equal(calibrationReplayResponse.status, 200);
      assert.equal(calibration.auditEvent.id, calibrationReplay.auditEvent.id);
      assert.equal(imageResponse.status, 200);
      assert.equal(imageReplayResponse.status, 200);
      assert.equal(image.platform.workflowId, imageReplay.platform.workflowId);
      assert.equal(videoResponse.status, 200);
      assert.equal(videoReplayResponse.status, 200);
      assert.equal(video.platform.workflowId, videoReplay.platform.workflowId);
      assert.equal(exportResponse.status, 200);
      assert.equal(exportReplayResponse.status, 200);
      assert.equal(exportPreview.exportRecord.id, exportReplay.exportRecord.id);
      assert.equal(history.records.length, 1);
    } finally {
      await server.close();
    }
  });

  it("maps creator route validation and state errors to stable responses", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const unauthenticatedResponse = await fetch(
        `${server.origin}/api/creator/project/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "unauthenticated-create-key",
          },
          body: JSON.stringify({
            name: "Unauthorized",
            scriptInput: "Episode 1: No session.",
            aspectRatio: "9:16",
            resolution: "1080p",
          }),
        },
      );
      const unauthenticated = await unauthenticatedResponse.json();

      const cookie = await login(server.origin, "13800138000");
      const invalidJsonResponse = await fetch(
        `${server.origin}/api/creator/project/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "invalid-json-create-key",
            cookie,
          },
          body: "{",
        },
      );
      const invalidJson = await invalidJsonResponse.json();

      const invalidCreateResponse = await fetch(
        `${server.origin}/api/creator/project/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "invalid-create-key",
            cookie,
          },
          body: JSON.stringify({
            name: " ",
            scriptInput: " ",
            aspectRatio: "1:1",
            resolution: "4k",
          }),
        },
      );
      const invalidCreate = await invalidCreateResponse.json();

      const parseWithoutProjectResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "parse-without-project-key",
          cookie,
        },
      });
      const parseWithoutProject = await parseWithoutProjectResponse.json();
      const exportWithoutProjectResponse = await fetch(
        `${server.origin}/api/creator/export/preview`,
        {
          method: "POST",
          headers: {
            "idempotency-key": "export-without-project-key",
            cookie,
          },
        },
      );
      const exportWithoutProject = await exportWithoutProjectResponse.json();

      assert.equal(unauthenticatedResponse.status, 401);
      assert.deepEqual(unauthenticated, { error: "unauthenticated" });
      assert.equal(invalidJsonResponse.status, 400);
      assert.deepEqual(invalidJson, { error: "invalid_json" });
      assert.equal(invalidCreateResponse.status, 400);
      assert.equal(invalidCreate.error, "invalid_project_input");
      assert.equal(typeof invalidCreate.fieldErrors.name, "string");
      assert.equal(parseWithoutProjectResponse.status, 409);
      assert.deepEqual(parseWithoutProject, { error: "creator_project_missing" });
      assert.equal(exportWithoutProjectResponse.status, 409);
      assert.deepEqual(exportWithoutProject, { error: "creator_project_missing" });
    } finally {
      await server.close();
    }
  });

  it("exposes project management, asset library, shot editing, and parameterized generation routes", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);

      const cookie = await login(server.origin, "13800138000");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138000"));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 1000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "management-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator backend gap coverage",
          scriptInput: "Episode 6: Backend gap coverage needs editable shots.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const projectsResponse = await fetch(`${server.origin}/api/creator/projects`, {
        headers: { cookie },
      });
      const projects = await projectsResponse.json();

      const patchResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          name: "Creator backend gap coverage renamed",
        }),
      });
      const patched = await patchResponse.json();

      const coverResponse = await fetch(`${server.origin}/api/creator/project/cover`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          coverImageUrl: "data:image/png;base64,cover",
        }),
      });
      const covered = await coverResponse.json();

      const generatedAssetResponse = await fetch(
        `${server.origin}/api/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "management-generate-project-asset",
            cookie,
          },
          body: JSON.stringify({
            target: {
              kind: "project_asset",
              projectId: created.project.id,
              assetType: "character",
              name: "Hero Library Asset",
            },
            prompt: "hero with blue coat",
            model: "nano_banana_2",
          }),
        },
      );
      const generatedAsset = (await generatedAssetResponse.json()).data;
      assert.equal(generatedAssetResponse.status, 200, JSON.stringify(generatedAsset));

      const importedAlleyUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "asset-import/scene",
        fileName: "imported-alley.png",
        contentType: "image/png",
        body: directUploadPngBytes(1),
      });
      const importedAssetResponse = await fetch(`${server.origin}/api/creator/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          kind: "scene",
          name: "Imported Alley",
          description: "imported-scene-description",
          uploadSessionId: importedAlleyUpload.uploadSessionId,
          storageObjectId: importedAlleyUpload.storageObjectId,
          mimeType: "image/png",
          width: 1280,
          height: 720,
        }),
      });
      const importedAsset = await importedAssetResponse.json();
      assert.equal(importedAssetResponse.status, 200, JSON.stringify(importedAsset));
      assert.equal(importedAsset.version.metadata.description, "imported-scene-description");
      const duplicateImportedAssetResponse = await fetch(`${server.origin}/api/creator/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          kind: "scene",
          name: " imported alley ",
          uploadSessionId: importedAlleyUpload.uploadSessionId,
          storageObjectId: importedAlleyUpload.storageObjectId,
          mimeType: "image/png",
        }),
      });
      const duplicateImportedAsset = await duplicateImportedAssetResponse.json();
      assert.equal(duplicateImportedAssetResponse.status, 409, JSON.stringify(duplicateImportedAsset));
      assert.equal(duplicateImportedAsset.error, "ASSET_ALREADY_EXISTS");

      const deletablePropUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "asset-import/prop",
        fileName: "disposable-prop.png",
        contentType: "image/png",
        body: directUploadPngBytes(2),
      });
      const deletableAssetResponse = await fetch(`${server.origin}/api/creator/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          kind: "prop",
          name: "Disposable Prop",
          uploadSessionId: deletablePropUpload.uploadSessionId,
          storageObjectId: deletablePropUpload.storageObjectId,
          mimeType: "image/png",
          width: 512,
          height: 512,
        }),
      });
      const deletableAsset = await deletableAssetResponse.json();

      const libraryResponse = await fetch(
        `${server.origin}/api/creator/assets/library?projectId=${encodeURIComponent(created.project.id)}`,
        {
          headers: { cookie },
        },
      );
      const library = await libraryResponse.json();

      const versionsResponse = await fetch(
        `${server.origin}/api/creator/assets/versions/${generatedAsset.asset.id}`,
        {
          headers: { cookie },
        },
      );
      const versions = await versionsResponse.json();

      const parseResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "management-parse-key",
          cookie,
        },
      });
      const parsedProject = await parseResponse.json();

      const detailResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detail = await detailResponse.json();

      const membersResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/members`,
        {
          headers: { cookie },
        },
      );
      const members = await membersResponse.json();

      const statsResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/stats`,
        {
          headers: { cookie },
        },
      );
      const stats = await statsResponse.json();

      const dashboardExportResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/team-dashboard/export?tab=member-consumption&dateShortcut=%E4%BB%8A%E5%A4%A9&role=all&status=all`,
        {
          headers: { cookie },
        },
      );
      const dashboardExportCsv = await dashboardExportResponse.text();

      const enterpriseContactResponse = await fetch(
        `${server.origin}/api/billing/enterprise-contact-requests`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "enterprise-contact-request-key",
            cookie,
          },
          body: JSON.stringify({
            source: "pricing_modal",
            note: "enterprise_plan_interest",
          }),
        },
      );
      const enterpriseContact = await enterpriseContactResponse.json();

      const updateAssetResponse = await fetch(
        `${server.origin}/api/creator/assets/${importedAsset.asset.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            name: "Imported Alley Revised",
            description: "Updated imported alley description",
            isMain: true,
          }),
        },
      );
      const updatedAsset = await updateAssetResponse.json();

      const detailAfterAssetUpdateResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detailAfterAssetUpdate = await detailAfterAssetUpdateResponse.json();
      const updatedSceneAsset = detailAfterAssetUpdate.assetsByType.scene.find(
        (asset: { id: string }) => asset.id === importedAsset.asset.id,
      );

      const deleteAssetResponse = await fetch(
        `${server.origin}/api/creator/assets/${deletableAsset.asset.id}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
        },
      );
      const deletedAsset = await deleteAssetResponse.json();

      const statsAfterDeleteResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/stats`,
        {
          headers: { cookie },
        },
      );
      const statsAfterDelete = await statsAfterDeleteResponse.json();

      const episodesResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/episodes`,
        {
          headers: { cookie },
        },
      );
      const episodes = await episodesResponse.json();

      const selectResponse = await fetch(`${server.origin}/api/creator/project/select`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId: created.project.id }),
      });
      const selected = await selectResponse.json();

      const createEpisodeResponse = await fetch(`${server.origin}/api/creator/episodes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          title: "Manual Episode",
        }),
      });
      const createdEpisode = await createEpisodeResponse.json();

      const updateEpisodeResponse = await fetch(`${server.origin}/api/creator/episodes`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          episodeId: createdEpisode.episode.id,
          title: "Manual Episode Updated",
          status: "ready",
        }),
      });
      const updatedEpisode = await updateEpisodeResponse.json();

      const deleteEpisodeResponse = await fetch(`${server.origin}/api/creator/episodes`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          episodeId: createdEpisode.episode.id,
        }),
      });
      const deletedEpisode = await deleteEpisodeResponse.json();

      const createShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ title: "Inserted manual shot" }),
      });
      const createdShot = await createShotResponse.json();

      const updateShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          shotId: createdShot.shot.id,
          title: "Updated manual shot",
          description: "Updated manual shot description",
        }),
      });
      const updatedShot = await updateShotResponse.json();

      const importedShotImageUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "storyboard-image",
        fileName: "manual-storyboard-image.png",
        contentType: "image/png",
        body: directUploadPngBytes(3),
      });
      const importedShotImageResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/import`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            kind: "image",
            name: "Manual storyboard image",
            uploadSessionId: importedShotImageUpload.uploadSessionId,
            storageObjectId: importedShotImageUpload.storageObjectId,
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const importedShotImage = await importedShotImageResponse.json();

      const importedSecondShotImageUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "storyboard-image",
        fileName: "manual-storyboard-image-dup.png",
        contentType: "image/png",
        body: directUploadPngBytes(4),
      });
      const importedSecondShotImageResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/import`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            kind: "image",
            name: "Manual storyboard image duplicate source",
            uploadSessionId: importedSecondShotImageUpload.uploadSessionId,
            storageObjectId: importedSecondShotImageUpload.storageObjectId,
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const importedSecondShotImage = await importedSecondShotImageResponse.json();

      const importedShotVideoUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "storyboard-video",
        fileName: "manual-storyboard-video.mp4",
        contentType: "video/mp4",
        body: directUploadMp4Bytes,
      });
      const importedShotVideoResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/import`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            kind: "video",
            name: "Manual storyboard video",
            uploadSessionId: importedShotVideoUpload.uploadSessionId,
            storageObjectId: importedShotVideoUpload.storageObjectId,
            mimeType: "video/mp4",
            width: 1024,
            height: 1024,
            durationMs: 10_000,
          }),
        },
      );
      const importedShotVideo = await importedShotVideoResponse.json();

      const referencesResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/references`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            items: [
              {
                role: "character",
                assetId: generatedAsset.asset.id,
                assetVersionId: generatedAsset.version.id,
              },
              {
                role: "scene",
                assetId: importedAsset.asset.id,
                assetVersionId: importedAsset.version.id,
              },
            ],
          }),
        },
      );
      const references = await referencesResponse.json();

      const detailAfterShotMediaResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detailAfterShotMedia = await detailAfterShotMediaResponse.json();
      const hydratedManualShot = detailAfterShotMedia.shots.find(
        (shot: { id: string }) => shot.id === createdShot.shot.id,
      );

      const deleteSingleShotImageResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/${importedShotImage.version.id}?kind=image`,
        {
          method: "DELETE",
          headers: {
            cookie,
          },
        },
      );
      const deletedSingleShotImage = await deleteSingleShotImageResponse.json();

      const detailAfterSingleShotImageDeleteResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detailAfterSingleShotImageDelete = await detailAfterSingleShotImageDeleteResponse.json();
      const hydratedManualShotAfterSingleImageDelete = detailAfterSingleShotImageDelete.shots.find(
        (shot: { id: string }) => shot.id === createdShot.shot.id,
      );

      const deleteShotVideoMediaResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/${importedShotVideo.version.id}?kind=video`,
        {
          method: "DELETE",
          headers: {
            cookie,
          },
        },
      );
      const deletedShotVideoMedia = await deleteShotVideoMediaResponse.json();

      const staleShotImageMediaId = "11111111-1111-4111-8111-111111111111";
      const deleteShotImageMediaByStaleIdResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/${staleShotImageMediaId}?kind=image`,
        {
          method: "DELETE",
          headers: {
            cookie,
          },
        },
      );
      const deletedShotImageMediaByStaleId = await deleteShotImageMediaByStaleIdResponse.json();

      const detailAfterShotVideoDeleteResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detailAfterShotVideoDelete = await detailAfterShotVideoDeleteResponse.json();
      const hydratedManualShotAfterVideoDelete = detailAfterShotVideoDelete.shots.find(
        (shot: { id: string }) => shot.id === createdShot.shot.id,
      );

      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const state = await stateResponse.json();
      const reorderedIds = [...state.shots].reverse().map((shot: { id: string }) => shot.id);
      const reorderResponse = await fetch(`${server.origin}/api/creator/shots/reorder`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ shotIds: reorderedIds }),
      });
      const reordered = await reorderResponse.json();

      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });
      await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: {
          "idempotency-key": "management-calibration-key",
          cookie,
        },
      });
      const latestStateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const latestState = await latestStateResponse.json();
      const firstShotId = latestState.shots[0]?.id;
      const imageResponse = await fetchProjectShotImageBatch(server.origin, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "management-image-key",
          cookie,
        },
        body: JSON.stringify({
          shotId: firstShotId,
          promptOverride: "single shot prompt",
          model: "image-model-test",
          parameters: { seed: 42 },
        }),
      });
      const imageResult = (await imageResponse.json()).data;

      const deleteShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ shotId: createdShot.shot.id }),
      });
      const deletedShot = await deleteShotResponse.json();

      const deleteProjectResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId: created.project.id }),
      });
      const deletedProject = await deleteProjectResponse.json();

      assert.equal(projectsResponse.status, 200);
      assert.equal(projects.projects.length, 1);
      assert.equal(patchResponse.status, 200);
      assert.equal(patched.project.name, "Creator backend gap coverage renamed");
      assert.equal(coverResponse.status, 200);
      assert.equal(covered.project.coverImageUrl, "data:image/png;base64,cover");
      assert.equal(generatedAssetResponse.status, 200);
      assert.equal(generatedAsset.asset.assetType, "character_sheet");
      assert.equal(importedAssetResponse.status, 200);
      assert.equal(importedAsset.asset.assetType, "scene_reference");
      assert.equal(deletableAssetResponse.status, 200);
      assert.equal(deletableAsset.asset.assetType, "prop_reference");
      assert.equal(libraryResponse.status, 200);
      assert.match(libraryResponse.headers.get("server-timing") ?? "", /^total;dur=\d+(?:\.\d+)?$/);
      assert.equal(library.assets.length, 3);
      assert.match(
        library.assets.find((asset: { assetType: string }) => asset.assetType === "scene_reference")
          ?.previewUrl ?? "",
        /^(?:https?:\/\/|\/uploads\/storage\/)/,
      );
      assert.equal(versionsResponse.status, 200);
      assert.equal(versions.versions.length, 1);
      assert.equal(parseResponse.status, 202, JSON.stringify(parsedProject));
      assert.equal(parsedProject.shots.length, 3);
      assert.equal(detailResponse.status, 200);
      assert.equal(detail.project.id, created.project.id);
      assert.equal(detail.assetSummary.character.count, 1);
      assert.equal(detail.assetSummary.scene.count, 1);
      assert.equal(detail.assetSummary.prop.count, 1);
      assert.equal(detail.assetSummary.scene.previews.length, 1);
      assert.match(detail.assetSummary.scene.previews[0], /^(?:https?:\/\/|\/uploads\/storage\/)/);
      assert.equal(membersResponse.status, 200);
      assert.equal(members.members.length, 0);
      assert.equal(statsResponse.status, 200);
      assert.equal(stats.stats.memberCount, 0);
      assert.ok(stats.stats.assetCount >= library.assets.length);
      assert.equal(dashboardExportResponse.status, 200);
      assert.match(dashboardExportResponse.headers.get("content-type") ?? "", /text\/csv/);
      assert.match(dashboardExportResponse.headers.get("content-disposition") ?? "", /team-dashboard-/);
      assert.match(dashboardExportCsv, /"phone","role","status"/);
      assert.match(dashboardExportCsv, /"memberCount","episodeCount"/);
      assert.equal(enterpriseContactResponse.status, 200);
      assert.equal(enterpriseContact.request.status, "submitted");
      assert.equal(updateAssetResponse.status, 200);
      assert.equal(typeof updatedAsset.asset, "string");
      assert.equal(detailAfterAssetUpdateResponse.status, 200);
      assert.equal(updatedSceneAsset.label, "Imported Alley Revised");
      assert.equal(updatedSceneAsset.latestVersion.metadata.description, "Updated imported alley description");
      assert.equal(updatedSceneAsset.latestVersion.metadata.isMain, true);
      assert.equal(deleteAssetResponse.status, 200);
      assert.equal(deletedAsset.deleted, true);
      assert.equal(statsAfterDeleteResponse.status, 200);
      assert.equal(statsAfterDelete.stats.assetCount, stats.stats.assetCount - 1);
      assert.equal(detail.episodes.length, 1);
      assert.equal(detail.episodes[0].storyboardCount, 3);
      assert.equal(
        detail.shots.every(
          (shot: { episodeId: string | null }) => shot.episodeId === detail.episodes[0].id,
        ),
        true,
      );
      assert.equal(episodesResponse.status, 200);
      assert.equal(episodes.episodes.length, 1);
      assert.equal(selectResponse.status, 200);
      assert.equal(selected.project.id, created.project.id);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createdEpisode.episode.sequence, 2);
      assert.equal(updateEpisodeResponse.status, 200);
      assert.equal(updatedEpisode.episode.title, "Manual Episode Updated");
      assert.equal(updatedEpisode.episode.status, "ready");
      assert.equal(deleteEpisodeResponse.status, 200);
      assert.equal(deletedEpisode.deleted, true);
      assert.equal(createShotResponse.status, 200);
      assert.equal(createdShot.shot.title, "Inserted manual shot");
      assert.equal(updateShotResponse.status, 200);
      assert.equal(updatedShot.shot.title, "Updated manual shot");
      assert.equal(updatedShot.shot.description, "Updated manual shot description");
      assert.equal(importedShotImageResponse.status, 200);
      assert.equal(importedShotImage.asset.assetType, "shot_image");
      assert.equal(importedShotImage.shot.currentImageAssetVersionId, importedShotImage.version.id);
      assert.equal(importedSecondShotImageResponse.status, 200);
      assert.equal(importedSecondShotImage.asset.id, importedShotImage.asset.id);
      assert.equal(importedSecondShotImage.asset.assetType, "shot_image");
      assert.equal(importedSecondShotImage.shot.currentImageAssetVersionId, importedSecondShotImage.version.id);
      assert.equal(importedShotVideoResponse.status, 200);
      assert.equal(importedShotVideo.asset.assetType, "shot_video");
      assert.equal(importedShotVideo.shot.currentVideoAssetVersionId, importedShotVideo.version.id);
      assert.equal(referencesResponse.status, 200);
      assert.deepEqual(
        references.references.map((reference: { role: string }) => reference.role),
        ["character", "scene"],
      );
      assert.equal(detailAfterShotMediaResponse.status, 200);
      assert.equal(hydratedManualShot.description, "Updated manual shot description");
      assert.match(hydratedManualShot.previewImageUrl, /^(?:https?:\/\/|\/uploads\/storage\/)/);
      assert.match(hydratedManualShot.previewVideoUrl, /^(?:https?:\/\/|\/uploads\/storage\/)/);
      assert.deepEqual(
        hydratedManualShot.imageVersions.map((version: { id: string }) => version.id),
        [importedSecondShotImage.version.id],
      );
      assert.equal(hydratedManualShot.videoVersions.length, 1);
      assert.equal(hydratedManualShot.references.length, 2);
      assert.equal(deleteSingleShotImageResponse.status, 200);
      assert.equal(deletedSingleShotImage.deletedAssetVersionId, importedShotImage.version.id);
      assert.equal(detailAfterSingleShotImageDeleteResponse.status, 200);
      assert.equal(hydratedManualShotAfterSingleImageDelete.imageVersions.length, 1);
      assert.deepEqual(
        hydratedManualShotAfterSingleImageDelete.imageVersions.map((version: { id: string }) => version.id),
        [importedSecondShotImage.version.id],
      );
      assert.equal(
        hydratedManualShotAfterSingleImageDelete.currentImageAssetVersionId,
        importedSecondShotImage.version.id,
      );
      assert.equal(deleteShotVideoMediaResponse.status, 200);
      assert.equal(deletedShotVideoMedia.deletedAssetVersionId, importedShotVideo.version.id);
      assert.equal(deleteShotImageMediaByStaleIdResponse.status, 200);
      assert.equal(deletedShotImageMediaByStaleId.deletedAssetVersionId, staleShotImageMediaId);
      assert.equal(detailAfterShotVideoDeleteResponse.status, 200);
      assert.equal(hydratedManualShotAfterVideoDelete.currentImageAssetVersionId, null);
      assert.equal(hydratedManualShotAfterVideoDelete.previewImageUrl, null);
      assert.equal(hydratedManualShotAfterVideoDelete.imageVersions.length, 0);
      assert.equal(hydratedManualShotAfterVideoDelete.currentVideoAssetVersionId, null);
      assert.equal(hydratedManualShotAfterVideoDelete.previewVideoUrl, null);
      assert.equal(hydratedManualShotAfterVideoDelete.videoVersions.length, 0);
      assert.equal(reorderResponse.status, 200, JSON.stringify(reordered));
      assert.deepEqual(
        reordered.shots.map((shot: { id: string }) => shot.id),
        reorderedIds,
      );
      assert.equal(deleteShotResponse.status, 200);
      assert.equal(
        deletedShot.shots.some((shot: { id: string }) => shot.id === createdShot.shot.id),
        false,
      );
      assert.equal(imageResponse.status, 200);
      assert.equal(imageResult.platform.tasks.length, 1);
      assert.equal(imageResult.request.promptOverride, "single shot prompt");
      assert.equal(deleteProjectResponse.status, 200);
      assert.equal(deletedProject.deleted, true);
    } finally {
      await server.close();
    }
  });

  it("exposes reusable official asset library routes without project import", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const officialResponse = await fetch(
        `${server.origin}/api/creator/library/assets?scope=official&category=character&q=${encodeURIComponent("医生")}`,
      );
      const official = await officialResponse.json();
      const libraryAsset = official.assets[0];
      const teamResponse = await fetch(
        `${server.origin}/api/creator/library/assets?scope=team&category=character`,
      );
      const cookie = await login(server.origin, "13800138000");

      const removedImportResponse = await fetch(
        `${server.origin}/api/creator/library/assets/import-to-project`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            projectId: "40000000-0000-4000-8000-000000000001",
            libraryAssetId: libraryAsset.id,
          }),
        },
      );

      assert.equal(officialResponse.status, 200);
      assert.equal(libraryAsset.name, "医生");
      assert.match(
        libraryAsset.previewUrl,
        /^\/assets\/library\/official\/characters\/doctor\.png$/,
      );
      assert.equal(teamResponse.status, 401);
      assert.equal(removedImportResponse.status, 404);
    } finally {
      await server.close();
    }
  });

  it("rejects creator-side single shot retry routes before a shot has failed", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const cookie = await login(server.origin, "13800138000");

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "retry-route-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator retry route smoke test",
          scriptInput: "Episode 3: A creator retries one failed frame.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "retry-route-parse-key",
          cookie,
        },
      });
      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });
      await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: {
          "idempotency-key": "retry-route-calibration-key",
          cookie,
        },
      });

      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const state = await stateResponse.json();
      const shotId = state.shots[0].id;

      const imageRetryResponse = await fetch(
        `${server.origin}/api/creator/shots/${shotId}/image/retry`,
        {
          method: "POST",
          headers: { cookie },
        },
      );
      const imageRetry = await imageRetryResponse.json();
      const videoRetryResponse = await fetch(
        `${server.origin}/api/creator/shots/${shotId}/video/retry`,
        {
          method: "POST",
          headers: { cookie },
        },
      );
      const videoRetry = await videoRetryResponse.json();

      assert.equal(imageRetryResponse.status, 409);
      assert.equal(videoRetryResponse.status, 409);
      assert.deepEqual(imageRetry, { error: "shot_image_retry_unavailable" });
      assert.deepEqual(videoRetry, { error: "current_image_required" });
    } finally {
      await server.close();
    }
  });

  it("exposes enveloped project-to-episode workbench routes for the new page contract", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-workbench-contract-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode workbench contract",
          scriptInput: "Episode 1: The project opens an episode workbench.",
          aspectRatio: "9:16",
          resolution: "1080p",
          projectType: "oil_painting",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-workbench-contract-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode 1" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const detailResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/detail`,
        { headers: { cookie } },
      );
      const detailEnvelope = await detailResponse.json();

      const workbenchResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/workbench`,
        { headers: { cookie } },
      );
      const workbenchEnvelope = await workbenchResponse.json();

      const assetsResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        { headers: { cookie } },
      );
      const assetsEnvelope = await assetsResponse.json();

      const storyboardsResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/storyboards?page=1&pageSize=5`,
        { headers: { cookie } },
      );
      const storyboardsEnvelope = await storyboardsResponse.json();

      const tasksResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation-tasks?page=1&pageSize=5`,
        { headers: { cookie } },
      );
      const tasksEnvelope = await tasksResponse.json();
        const generationConfigResponse = await fetch(
          `${server.origin}/api/episodes/${episodeId}/generation-config`,
          { headers: { cookie } },
        );
        const generationConfigEnvelope = await generationConfigResponse.json();
        const createStoryboardResponse = await fetch(`${server.origin}/api/creator/shots`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            title: "Storyboard 1",
            description: "generation draft storyboard",
            episodeId,
          }),
        });
        const createStoryboardEnvelope = await createStoryboardResponse.json();
        const storyboardId = createStoryboardEnvelope.shot.id;
        const saveDraftResponse = await fetch(
          `${server.origin}/api/episodes/${episodeId}/generation-drafts/storyboard/${storyboardId}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie,
            },
            body: JSON.stringify({
              prompt: "storyboard draft prompt",
              mode: "image",
              payload: {
                modelCode: "nano_banana_2",
                aspectRatio: "16:9",
              },
            }),
          },
        );
        const saveDraftEnvelope = await saveDraftResponse.json();
        const lightweightStoryboardsResponse = await fetch(
          `${server.origin}/api/episodes/${episodeId}/storyboards?page=1&pageSize=5&includeDraftPayload=0`,
          { headers: { cookie } },
        );
        const lightweightStoryboardsEnvelope = await lightweightStoryboardsResponse.json();

      assert.equal(createEpisodeResponse.status, 200);
      assert.match(createdEpisodeEnvelope.requestId, /.+/);
      assert.equal(detailResponse.status, 200);
      assert.equal(detailEnvelope.data.project.projectId, created.project.id);
      assert.equal(detailEnvelope.data.project.projectType, "oil_painting");
      assert.ok(
        detailEnvelope.data.episodes.some(
          (episode: { episodeId: string; title: string }) =>
            episode.episodeId === episodeId && episode.title === "Episode 1",
        ),
      );
      assert.equal(workbenchResponse.status, 200);
      assert.equal(workbenchEnvelope.data.episode.episodeId, episodeId);
      assert.equal(workbenchEnvelope.data.episode.projectId, created.project.id);
      assert.equal(workbenchEnvelope.data.project.projectId, created.project.id);
      assert.equal(workbenchEnvelope.data.project.projectType, "oil_painting");
      assert.equal(workbenchEnvelope.data.navigation.backTarget, "project_episodes");
      assert.equal(Object.prototype.hasOwnProperty.call(workbenchEnvelope.data, "storyboards"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(workbenchEnvelope.data, "permissions"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(workbenchEnvelope.data, "creditBalance"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(workbenchEnvelope.data, "assetsByType"), false);
      assert.equal(assetsResponse.status, 200);
      assert.deepEqual(Object.keys(assetsEnvelope.data).sort(), ["items", "total"]);
      assert.equal(storyboardsResponse.status, 200);
      assert.equal(storyboardsEnvelope.data.items.every(
        (storyboard: { episodeId?: string }) => !storyboard.episodeId || storyboard.episodeId === episodeId,
      ), true);
        assert.equal(tasksResponse.status, 200);
        assert.deepEqual(tasksEnvelope.data.items, []);
        assert.equal(generationConfigResponse.status, 200);
        assert.equal(generationConfigEnvelope.data.defaultImageModelCode, "global-ai-opc-gpt-image-2");
        assert.equal(generationConfigEnvelope.data.defaultVideoModelCode, "doubao-seedance-2-0-260128");
        assert.equal(generationConfigEnvelope.data.creditBalance, 0);
        assert.equal(generationConfigEnvelope.data.uploadLimits.image.maxBytes, 20 * 1024 * 1024);
        assert.equal(generationConfigEnvelope.data.uploadLimits.video.maxBytes, 500 * 1024 * 1024);
        assert.equal(generationConfigEnvelope.data.uploadLimits.image.maxReferencesPerTask, 30);
        assert.ok(generationConfigEnvelope.data.uploadLimits.blockedExtensions.includes(".exe"));
        assert.equal(createStoryboardResponse.status, 200);
        assert.equal(saveDraftResponse.status, 200);
        assert.equal(saveDraftEnvelope.data.draft.episodeId, episodeId);
        assert.equal(saveDraftEnvelope.data.draft.targetType, "storyboard");
        assert.equal(saveDraftEnvelope.data.draft.targetId, storyboardId);
        assert.equal(saveDraftEnvelope.data.draft.prompt, "storyboard draft prompt");
        assert.equal(saveDraftEnvelope.data.draft.payload.modelCode, "nano_banana_2");
        assert.equal(lightweightStoryboardsResponse.status, 200);
        assert.equal(lightweightStoryboardsEnvelope.data.items[0].generationDrafts[0].prompt, "storyboard draft prompt");
        assert.equal(
          Object.prototype.hasOwnProperty.call(
            lightweightStoryboardsEnvelope.data.items[0].generationDrafts[0],
            "payload",
          ),
          false,
        );
      } finally {
        await server.close();
      }
  });

  it("exposes narrow batch image model options without unrelated generation config fields", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "batch-image-model-options-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Batch image options contract",
          scriptInput: "Episode 1: The batch image modal needs only image model options.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "batch-image-model-options-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode 1" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const optionsResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/batch-image-model-options`,
        { headers: { cookie } },
      );
      const optionsEnvelope = await optionsResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(optionsResponse.status, 200);
      assert.deepEqual(Object.keys(optionsEnvelope.data).sort(), ["models"]);
      assert.ok(optionsEnvelope.data.models.length > 0);
      for (const model of optionsEnvelope.data.models) {
        assert.deepEqual(Object.keys(model).sort(), [
          "modelId",
          "modelName",
          "qualities",
          "ratios",
        ]);
        assert.equal(typeof model.modelId, "string");
        assert.equal(typeof model.modelName, "string");
        assert.ok(Array.isArray(model.ratios));
        assert.ok(Array.isArray(model.qualities));
      }
    } finally {
      await server.close();
    }
  });

  it("uses active admin video model configs for episode generation config", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET display_name = '快乐马1.0',
            remark = '4图3音频/4800积分每条',
            provider_name = 'aliyun-bailian',
            provider_model = 'happyhorse-1.0-r2v',
            provider_protocol = 'aliyun_bailian_video',
            provider_config_json = '{"baseURL":"https://dashscope.aliyuncs.com","createTaskEndpoint":"/api/v1/services/aigc/video-generation/video-synthesis","queryTaskEndpoint":"/api/v1/tasks/{taskId}","apiKeyEnv":"ALIYUNBAILIAN_API_KEY"}'::jsonb,
            pricing_json = '{"unit":"video","baseCredits":120}'::jsonb,
            sort_order = 1,
            status = 'active'
        WHERE model_code = 'happyhorse-1.0-r2v'
      `,
    );
    await db.query(
      "UPDATE ai_model_configs SET status = 'disabled' WHERE media_type = 'video' AND model_code <> 'happyhorse-1.0-r2v'",
    );
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-video-config-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Admin video config project",
          scriptInput: "Episode 1: Use the configured video model.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Configured Video" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const generationConfigResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation-config`,
        { headers: { cookie } },
      );
      const generationConfigEnvelope = await generationConfigResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(generationConfigResponse.status, 200);
      assert.equal(generationConfigEnvelope.data.defaultVideoModelCode, "happyhorse-1.0-r2v");
      assert.ok(
        generationConfigEnvelope.data.models.some(
          (model: { modelCode?: string; modelLabel?: string; remark?: string | null }) =>
            model.modelCode === "happyhorse-1.0-r2v" && model.modelLabel === "快乐马1.0" && model.remark === "4图3音频/4800积分每条",
        ),
      );
      assert.equal(
        generationConfigEnvelope.data.models.some((model: { providerGroup?: string }) => "providerGroup" in model),
        false,
      );
      assert.equal(
        generationConfigEnvelope.data.models.some((model: { modelCode?: string }) => model.modelCode === "video_mock_1"),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("filters active video models that do not have a generation executor", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        INSERT INTO ai_model_configs (
          id,
          model_code,
          display_name,
          provider_name,
          provider_model,
          provider_protocol,
          invocation_mode,
          media_type,
          task_modes_json,
          capabilities_json,
          parameter_schema_json,
          default_params_json,
          provider_config_json,
          pricing_json,
          limits_json,
          ui_config_json,
          status,
          sort_order,
          remark
        ) VALUES (
          '70000000-0000-4000-8000-000000009901',
          'unsupported_video_no_executor',
          'Grok Video 3',
          'UnsupportedVideoProvider',
          'grok-video-3',
          'openai_compatible_chat',
          'async_polling',
          'video',
          '["video.image_to_video"]'::jsonb,
          '{"prompt":true}'::jsonb,
          '{"prompt":{"type":"string"},"durationSec":{"enum":[10]},"resolution":{"enum":["720p"]},"aspectRatio":{"enum":["16:9"]}}'::jsonb,
          '{"durationSec":10,"resolution":"720p","aspectRatio":"16:9"}'::jsonb,
          '{"baseURL":"https://example.invalid","createTaskEndpoint":"/v1/videos","apiKeyEnv":"UNSUPPORTED_VIDEO_API_KEY"}'::jsonb,
          '{"unit":"video","baseCredits":220}'::jsonb,
          '{}'::jsonb,
          '{"label":"Grok Video 3","group":"UnsupportedVideoProvider","visible":true}'::jsonb,
          'active',
          1,
          'Unsupported video provider without a generation executor.'
        )
        ON CONFLICT (model_code) DO UPDATE SET status = 'active'
      `,
    );
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "unsupported-video-config-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Unsupported video config project",
          scriptInput: "Episode 1: Hide unsupported video models.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Configured Video" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const generationConfigResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation-config?mediaType=video`,
        { headers: { cookie } },
      );
      const generationConfigEnvelope = await generationConfigResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(generationConfigResponse.status, 200);
      assert.equal(generationConfigEnvelope.data.defaultVideoModelCode, "doubao-seedance-2-0-260128");
      assert.equal(
        generationConfigEnvelope.data.models.some((model: { modelCode?: string }) => model.modelCode === "unsupported_video_no_executor"),
        false,
      );
      assert.ok(
        generationConfigEnvelope.data.models.some((model: { modelCode?: string }) => model.modelCode === "doubao-seedance-2-0-260128"),
      );
    } finally {
      await server.close();
    }
  });

  it("exposes enabled storyboard prompt packages to authenticated creators", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const packagesResponse = await fetch(
        `${server.origin}/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500`,
        { headers: { cookie } },
      );
      const envelope = await packagesResponse.json();

      assert.equal(packagesResponse.status, 200);
      assert.ok(Array.isArray(envelope.packages));
      assert.ok(envelope.packages.some((item: { package_type?: string }) => item.package_type === "genre"));
      assert.ok(envelope.packages.some((item: { package_type?: string }) => item.package_type === "emotion"));
      assert.equal(envelope.packages.every((item: { status?: string }) => item.status === "enabled"), true);
    } finally {
      await server.close();
    }
  });

  it("serves compact storyboard prompt packages without prompt bodies", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const response = await fetch(
        `${server.origin}/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500&compact=1`,
        { headers: { cookie } },
      );
      const envelope = await response.json();

      assert.equal(response.status, 200);
      assert.ok(envelope.packages.length > 0);
      assert.equal(envelope.packages.every((item: Record<string, unknown>) => !("prompt_content" in item)), true);
    } finally {
      await server.close();
    }
  });

  it("rejects legacy storyboard package selection for user script analysis", async () => {
    const db = await createMigratedTestDb();
    const textChatGateway = new FakeAiStoryboardTextGateway([
      JSON.stringify({ scriptText: "任小野把小草托付给闵婶子。" }),
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138210");
      const response = await fetch(`${server.origin}/api/creator/scripts/ai-script-analysis`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          scriptText: "任小野把小草托付给闵婶子。",
          packages: { genrePackageId: "auto", emotionPackageId: "auto" },
        }),
      });

      const responseBody = await response.json();
      assert.equal(response.status, 400);
      assert.equal(responseBody.errorCode, "script_conversion_skill_required");
      assert.equal(textChatGateway.calls.length, 0);
    } finally {
      await server.close();
    }
  });

  it("uses the selected official novel-to-script skill for user script analysis", async () => {
    const db = await createMigratedTestDb();
    await seedScriptAnalysisModelConfig(db);
    const skillId = "67676767-6767-4767-8767-676767676767";
    await db.query(
      `INSERT INTO prompts (
         id, prompt_category, name, summary, prompt_content, status,
         is_official, is_published, price_credits, published_at
       ) VALUES ($1, 'script', '官方小说转剧本技能', '', $2, 'enabled', true, true, 18, NOW())`,
      [skillId, "把小说改编为节奏紧凑、可拍摄的分场剧本。"],
    );
    const textChatGateway = new FakeAiStoryboardTextGateway(["改编后的剧本"]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138210");
      await seedGenerationAccessForPhone(db, "13800138210", 5000);
      const balanceBefore = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE phone_e164 = $1",
        [normalizeCnPhone("13800138210")],
      );
      const modelPrice = await db.query<{ price: number | string }>(
        "SELECT pricing_json->>'baseCredits' AS price FROM ai_model_configs WHERE model_code = 'deepseek-noval'",
      );
      const response = await fetch(`${server.origin}/api/creator/scripts/ai-script-analysis`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          scriptText: "任小野把小草托付给闵婶子。",
          skillId,
          modelCode: "deepseek-noval",
          creditCost: 1,
          modelCreditCost: 1,
          skillCreditCost: 0,
        }),
      });

      const responseText = await response.clone().text();
      const balanceAfter = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE phone_e164 = $1",
        [normalizeCnPhone("13800138210")],
      );
      const expectedCost = Number(modelPrice.rows[0]?.price ?? 0) + 18;
      assert.equal(response.status, 200, responseText);
      assert.equal(
        Number(balanceBefore.rows[0]?.balance ?? 0) - Number(balanceAfter.rows[0]?.balance ?? 0),
        expectedCost,
      );
      assert.match(responseText, new RegExp(`"creditCost":${expectedCost}`));
      assert.equal(
        textChatGateway.calls[0]?.prompt,
        "把小说改编为节奏紧凑、可拍摄的分场剧本。\n\n任小野把小草托付给闵婶子。",
      );
      const authorEarnings = await db.query(
        "SELECT id FROM credit_ledger_entries WHERE source_type = 'prompt_skill_usage_earning'",
      );
      assert.equal(authorEarnings.rows.length, 0);
    } finally {
      await server.close();
    }
  });

  it("credits private script skill fees to the author once and skips free skill payouts", async () => {
    const db = await createMigratedTestDb();
    await seedScriptAnalysisModelConfig(db);
    const paidSkillId = "77777777-7777-4777-8777-777777777771";
    const freeSkillId = "77777777-7777-4777-8777-777777777772";
    const otherPaidSkillId = "77777777-7777-4777-8777-777777777773";
    const textChatGateway = new FakeAiStoryboardTextGateway([
      "付费技能改编结果",
      "付费技能重复请求结果",
      "免费技能改编结果",
      "子账户使用付费技能改编结果",
      "作者使用自己的付费技能改编结果",
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const authorCookie = await login(server.origin, "13800138231");
      const buyerCookie = await login(server.origin, "13800138232");
      const authorId = await readUserIdForPhone(db, normalizeCnPhone("13800138231"));
      const buyerId = await readUserIdForPhone(db, normalizeCnPhone("13800138232"));
      await seedGenerationAccessForPhone(db, "13800138231", 5000);
      await seedGenerationAccessForPhone(db, "13800138232", 5000);
      await db.query(
        `INSERT INTO prompts (
           id, prompt_category, name, summary, prompt_content, status,
           is_official, is_published, price_credits, published_at
         ) VALUES
           ($1, 'script', '私人付费小说转剧本', '', '私人付费技能正文', 'enabled', false, true, 21, NOW()),
           ($2, 'script', '私人免费小说转剧本', '', '私人免费技能正文', 'enabled', false, true, 0, NOW()),
           ($3, 'script', '其他私人付费小说转剧本', '', '其他私人付费技能正文', 'enabled', false, true, 21, NOW())`,
        [paidSkillId, freeSkillId, otherPaidSkillId],
      );
      await db.query(
        `INSERT INTO prompt_user_links (
           id, prompt_id, user_id, relation_type, status, price_credits_paid, added_at, created_at, updated_at
         ) VALUES
           ($1, $2, $3, 'owner', 'active', 0, NOW(), NOW(), NOW()),
           ($4, $5, $3, 'owner', 'active', 0, NOW(), NOW(), NOW()),
           ($6, $2, $7, 'added', 'active', 0, NOW(), NOW(), NOW()),
           ($8, $5, $7, 'added', 'active', 0, NOW(), NOW(), NOW()),
           ($9, $10, $3, 'owner', 'active', 0, NOW(), NOW(), NOW()),
           ($11, $10, $7, 'added', 'active', 0, NOW(), NOW(), NOW())`,
        [
          randomUUID(), paidSkillId, authorId, randomUUID(), freeSkillId, randomUUID(), buyerId, randomUUID(),
          randomUUID(), otherPaidSkillId, randomUUID(),
        ],
      );
      const readBalance = async (userId: string) => Number((await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE id = $1",
        [userId],
      )).rows[0]?.balance ?? 0);
      const authorBefore = await readBalance(authorId);
      const buyerBefore = await readBalance(buyerId);
      const postAnalysis = (skillId: string, idempotencyKey: string, cookie = buyerCookie) => fetch(
        `${server.origin}/api/creator/scripts/ai-script-analysis`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
            cookie,
          },
          body: JSON.stringify({ scriptText: "待改编小说正文。", skillId, modelCode: "deepseek-noval" }),
        },
      );

      const firstPaidResponse = await postAnalysis(paidSkillId, "private-paid-script-skill-usage");
      assert.equal(firstPaidResponse.status, 200, await firstPaidResponse.clone().text());
      await firstPaidResponse.text();
      assert.equal(await readBalance(authorId), authorBefore + 21);
      assert.equal(await readBalance(buyerId), buyerBefore - 181);

      const replayResponse = await postAnalysis(paidSkillId, "private-paid-script-skill-usage");
      assert.equal(replayResponse.status, 200, await replayResponse.clone().text());
      await replayResponse.text();
      assert.equal(await readBalance(authorId), authorBefore + 21);
      assert.equal(await readBalance(buyerId), buyerBefore - 181);

      const conflictResponse = await postAnalysis(otherPaidSkillId, "private-paid-script-skill-usage");
      assert.equal(conflictResponse.status, 409);
      assert.equal((await conflictResponse.json()).errorCode, "idempotency_conflict");
      assert.equal(await readBalance(authorId), authorBefore + 21);
      assert.equal(await readBalance(buyerId), buyerBefore - 181);

      const freeResponse = await postAnalysis(freeSkillId, "private-free-script-skill-usage");
      assert.equal(freeResponse.status, 200, await freeResponse.clone().text());
      await freeResponse.text();
      assert.equal(await readBalance(authorId), authorBefore + 21);
      assert.equal(await readBalance(buyerId), buyerBefore - 341);
      const earnings = await db.query<{ user_id: string; amount: number | string }>(
        `SELECT user_id, amount
         FROM credit_ledger_entries
         WHERE source_type = 'prompt_skill_usage_earning'`,
      );
      assert.equal(earnings.rows.length, 1);
      assert.equal(earnings.rows[0]?.user_id, authorId);
      assert.equal(Number(earnings.rows[0]?.amount ?? 0), 21);

      await db.query("UPDATE users SET team_seat_limit = 50 WHERE id = $1", [buyerId]);
      await db.query(
        `INSERT INTO user_entitlements (
           id, user_id, entitlement_key, status, source, expires_at, created_at, updated_at
         ) VALUES ($1, $2, 'team_member_management', 'active', 'dev_seed', $3, NOW(), NOW())
         ON CONFLICT (user_id, entitlement_key) DO UPDATE
         SET status = 'active', expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
        [randomUUID(), buyerId, new Date("2099-01-01T00:00:00.000Z")],
      );
      const createMemberResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: buyerCookie },
        body: JSON.stringify({
          teamAccount: "script_skill_member",
          displayName: "剧本技能子账户",
          projectIds: [],
          initialCredits: 0,
        }),
      });
      const createdMember = await createMemberResponse.json();
      assert.equal(createMemberResponse.status, 200, JSON.stringify(createdMember));
      await db.query("UPDATE team_members SET member_credits = 500 WHERE id = $1", [
        createdMember.member.membershipId,
      ]);
      const memberCookie = await loginTeamMemberAccount(
        server.origin,
        createdMember.member.memberLoginAccount,
        createdMember.temporaryPassword,
      );
      const memberResponse = await postAnalysis(
        paidSkillId,
        "team-member-private-paid-script-skill-usage",
        memberCookie,
      );
      assert.equal(memberResponse.status, 200, await memberResponse.clone().text());
      await memberResponse.text();
      const memberBalance = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [createdMember.member.membershipId],
      );
      assert.equal(Number(memberBalance.rows[0]?.member_credits ?? 0), 319);
      assert.equal(await readBalance(authorId), authorBefore + 42);
      assert.equal(await readBalance(buyerId), buyerBefore - 341);
      const earningsAfterMemberUsage = await db.query<{ user_id: string; amount: number | string }>(
        `SELECT user_id, amount
         FROM credit_ledger_entries
         WHERE source_type = 'prompt_skill_usage_earning'`,
      );
      assert.equal(earningsAfterMemberUsage.rows.length, 2);
      assert.equal(earningsAfterMemberUsage.rows.every((row) => row.user_id === authorId), true);
      assert.equal(earningsAfterMemberUsage.rows.reduce((sum, row) => sum + Number(row.amount), 0), 42);

      const authorBalanceBeforeSelfUsage = await readBalance(authorId);
      const selfUsageResponse = await postAnalysis(
        paidSkillId,
        "author-uses-own-paid-script-skill",
        authorCookie,
      );
      const selfUsageText = await selfUsageResponse.text();
      assert.equal(selfUsageResponse.status, 200, selfUsageText);
      assert.match(selfUsageText, /"skillCreditCost":0/);
      assert.equal(authorBalanceBeforeSelfUsage - await readBalance(authorId), 160);
      const earningsAfterSelfUsage = await db.query(
        "SELECT id FROM credit_ledger_entries WHERE source_type = 'prompt_skill_usage_earning'",
      );
      assert.equal(earningsAfterSelfUsage.rows.length, 2);
    } finally {
      await server.close();
    }
  });

  it("rejects user script analysis when membership is not active", async () => {
    const db = await createMigratedTestDb();
    const skillId = "68686868-6868-4868-8868-686868686868";
    await db.query(
      `INSERT INTO prompts (
         id, prompt_category, name, summary, prompt_content, status,
         is_official, is_published, price_credits, published_at
       ) VALUES ($1, 'script', '会员校验技能', '', $2, 'enabled', true, true, 18, NOW())`,
      [skillId, "把小说改编为可以拍摄的分场剧本，保留原文核心情节。"],
    );
    const textChatGateway = new FakeAiStoryboardTextGateway(["不应调用模型"]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138212");
      const response = await fetch(`${server.origin}/api/creator/scripts/ai-script-analysis`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          scriptText: "待改编小说正文。",
          skillId,
          modelCode: "deepseek-noval",
        }),
      });
      const responseBody = await response.json();

      assert.equal(response.status, 403);
      assert.equal(responseBody.errorCode, "generation_membership_required");
      assert.equal(textChatGateway.calls.length, 0);
    } finally {
      await server.close();
    }
  });

  it("rejects user script analysis without deducting when credits are insufficient", async () => {
    const db = await createMigratedTestDb();
    await seedScriptAnalysisModelConfig(db);
    const skillId = "69696969-6969-4969-8969-696969696969";
    await db.query(
      `INSERT INTO prompts (
         id, prompt_category, name, summary, prompt_content, status,
         is_official, is_published, price_credits, published_at
       ) VALUES ($1, 'script', '高价小说转剧本技能', '', $2, 'enabled', true, true, 999, NOW())`,
      [skillId, "把小说改编为可以拍摄的分场剧本，保留原文核心情节。"],
    );
    const textChatGateway = new FakeAiStoryboardTextGateway(["不应调用模型"]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138213");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138213"));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 100,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      const response = await fetch(`${server.origin}/api/creator/scripts/ai-script-analysis`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          scriptText: "待改编小说正文。",
          skillId,
          modelCode: "deepseek-noval",
        }),
      });
      const responseBody = await response.json();
      const balance = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE id = $1",
        [userId],
      );

      assert.equal(response.status, 402);
      assert.equal(responseBody.errorCode, "insufficient_credits");
      assert.equal(Number(balance.rows[0]?.balance ?? 0), 100);
      assert.equal(textChatGateway.calls.length, 0);
    } finally {
      await server.close();
    }
  });

  it("routes script document imports past the script card matcher", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138211");
      const response = await fetch(`${server.origin}/api/creator/scripts/import-document`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-script-import-document-route",
          cookie,
        },
        body: JSON.stringify({
          title: "AI 分析剧本",
          scriptInput: "第一场\n任小野走进城门。",
        }),
      });

      const responseText = await response.clone().text();
      assert.equal(response.status, 200, responseText);
    } finally {
      await server.close();
    }
  });

  it("generates an AI storyboard preview from selected workflow skills", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 5);
    const skillId = "78787878-7878-4787-8787-787878787878";
    const sceneSkillId = "79797979-7979-4797-8797-797979797979";
    const sceneSkillAuthorId = "79797979-7979-4797-8797-797979797970";
    await db.query(
      `INSERT INTO users (id, phone_e164, display_name, password_hash, status, credit_balance_cached)
       VALUES ($1, '13800138239', '场景技能作者', 'plain:test-password', 'active', 0)`,
      [sceneSkillAuthorId],
    );
    await db.query(
      `INSERT INTO prompts (
         id, prompt_category, name, summary, prompt_content, status,
         is_official, is_published, price_credits, published_at
       ) VALUES
         ($1, 'script', '官方新建剧集改编技能', '', $2, 'enabled', true, true, 7, NOW()),
         ($3, 'scene_extract', '私人场景抽取技能', '', $4, 'enabled', false, true, 3, NOW())`,
      [skillId, "请把小说改编为节奏紧凑、可以直接拍摄的分场剧本。", sceneSkillId, "场景抽取专用\n{{script}}"],
    );
    await db.query(
      `INSERT INTO prompt_user_links (id, prompt_id, user_id, relation_type, status, price_credits_paid, added_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'owner', 'active', 0, NOW(), NOW(), NOW())`,
      [randomUUID(), sceneSkillId, sceneSkillAuthorId],
    );
    const textChatGateway = new FakeAiStoryboardTextGateway([
      JSON.stringify({
        title: "第一章",
        logline: "少年托付妹妹。",
        scriptBeats: [
          {
            beatNo: 1,
            plot: "任小野把小草托付给闵婶子。",
            characters: ["任小野", "闵婶子"],
            locationHint: "闵婶家门前",
            props: ["饭食"],
            dialogue: "今天又得麻烦您照看小草了。",
          },
        ],
      }),
      JSON.stringify({
        scenes: [{ sceneName: "闵婶家门前", sceneDescription: "旧木屋门前。", sceneImagePrompt: "旧木屋门前，傍晚。" }],
      }),
      JSON.stringify({
        characters: [{ characterName: "任小野", characterDescription: "清瘦少年。", characterImagePrompt: "清瘦少年，旧布短衣。" }],
      }),
      JSON.stringify({
        props: [{ propName: "饭食", propDescription: "递出的饭食。", propImagePrompt: "旧布包裹的饭食。" }],
      }),
      JSON.stringify({
        storyboards: [{ plot: "任小野递出饭食。", dialogue: "麻烦您了。", imagePrompt: "任小野递出饭食。", videoPrompt: "中景固定镜头，递出饭食。" }],
      }),
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138210");
      await seedGenerationAccessForPhone(db, "13800138210", 5000);
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138210"));
      await db.query(
        `INSERT INTO prompt_user_links (id, prompt_id, user_id, relation_type, status, price_credits_paid, added_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'added', 'active', 0, NOW(), NOW(), NOW())`,
        [randomUUID(), sceneSkillId, userId],
      );
      const balanceBefore = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE id = $1",
        [userId],
      );

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-ai-storyboard-preview-project",
          cookie,
        },
        body: JSON.stringify({
          name: "AI storyboard preview project",
          scriptInput: "任小野把小草托付给闵婶子。",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const previewResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-request",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            stages: ["script", "scene"],
            skills: { script: skillId, scene_extract: sceneSkillId },
            modelCode: "preview-script-model",
          }),
        },
      );
      const previewEnvelope = await previewResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(previewResponse.status, 200);
      assert.equal(textChatGateway.calls.length, 2);
      assert.deepEqual(textChatGateway.calls.map((call) => call.model), ["preview-script-model", "preview-script-model"]);
      assert.equal(
        textChatGateway.calls[0]?.prompt,
        "请把小说改编为节奏紧凑、可以直接拍摄的分场剧本。\n\n任小野把小草托付给闵婶子。",
      );
      assert.deepEqual(
        previewEnvelope.data.selectedSkills.map((item: { id: string; category: string }) => [item.category, item.id]),
        [["script", skillId], ["scene_extract", sceneSkillId]],
      );
      assert.equal(previewEnvelope.data.selectedPackages, null);
      assert.equal(previewEnvelope.data.modelCreditCost, 10);
      assert.equal(previewEnvelope.data.modelRunCount, 2);
      assert.equal(previewEnvelope.data.skillCreditCost, 10);
      assert.equal(previewEnvelope.data.creditCost, 20);
      assert.match(textChatGateway.calls[1]?.prompt ?? "", /场景抽取专用/);
      const balanceAfter = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE id = $1",
        [userId],
      );
      assert.equal(
        Number(balanceBefore.rows[0]?.balance ?? 0) - Number(balanceAfter.rows[0]?.balance ?? 0),
        20,
      );
      const authorBalance = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE id = $1",
        [sceneSkillAuthorId],
      );
      assert.equal(Number(authorBalance.rows[0]?.balance ?? 0), 3);
      const authorEarnings = await db.query<{ amount: number | string }>(
        `SELECT amount FROM credit_ledger_entries
         WHERE user_id = $1 AND source_type = 'prompt_skill_usage_earning'`,
        [sceneSkillAuthorId],
      );
      assert.equal(authorEarnings.rows.length, 1);
      assert.equal(Number(authorEarnings.rows[0]?.amount ?? 0), 3);
      assert.match(textChatGateway.calls[1]?.prompt ?? "", /任小野把小草托付给闵婶子/);
      assert.ok(Array.isArray(previewEnvelope.data.displayTables.script.rows));
      assert.ok(Array.isArray(previewEnvelope.data.displayTables.scenes.rows));
      assert.ok(Array.isArray(previewEnvelope.data.displayTables.characters.rows));
      assert.ok(Array.isArray(previewEnvelope.data.displayTables.props.rows));
      assert.ok(Array.isArray(previewEnvelope.data.displayTables.storyboards.rows));
    } finally {
      await server.close();
    }
  });

  it("runs only the requested legacy AI storyboard stage", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 5);
    const textChatGateway = new FakeAiStoryboardTextGateway([
      JSON.stringify({ scriptText: "重新生成后的剧本。" }),
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138241");
      await seedGenerationAccessForPhone(db, "13800138241", 5000);
      const created = await createAiStoryboardPreviewProject(server.origin, cookie, "single-legacy-stage");
      const response = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-single-legacy-stage",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            stages: ["script"],
            packages: { genrePackageId: "auto", emotionPackageId: "auto" },
            modelCode: "preview-script-model",
          }),
        },
      );
      const envelope = await response.json();

      assert.equal(response.status, 200);
      assert.equal(textChatGateway.calls.length, 1);
      assert.equal(envelope.data.modelRunCount, 1);
      assert.match(envelope.data.scriptText, /重新生成后的剧本/);
      assert.deepEqual(envelope.data.commitPayload.scenes, []);
      assert.deepEqual(envelope.data.commitPayload.characters, []);
      assert.deepEqual(envelope.data.commitPayload.props, []);
      assert.deepEqual(envelope.data.commitPayload.storyboards, []);
    } finally {
      await server.close();
    }
  });

  it("resolves a home workflow instruction before running only the selected stage", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 5);
    const skillIds = {
      script: "71717171-7171-4171-8171-717171717171",
      scene_extract: "72727272-7272-4272-8272-727272727272",
      character_extract: "73737373-7373-4373-8373-737373737373",
      prop_extract: "74747474-7474-4474-8474-747474747474",
      shot: "75757575-7575-4575-8575-757575757575",
    };
    await db.query(
      `INSERT INTO prompts (
         id, prompt_category, name, summary, prompt_content, status,
         is_official, is_published, price_credits, published_at
       ) VALUES
         ($1, 'script', '主页剧本技能', '', '小说转剧本', 'enabled', true, true, 0, NOW()),
         ($2, 'scene_extract', '主页场景技能', '', '提取场景', 'enabled', true, true, 0, NOW()),
         ($3, 'character_extract', '主页人物技能', '', '提取人物提示词 {{script}}', 'enabled', true, true, 0, NOW()),
         ($4, 'prop_extract', '主页道具技能', '', '提取道具', 'enabled', true, true, 0, NOW()),
         ($5, 'shot', '主页分镜技能', '', '生成分镜', 'enabled', true, true, 0, NOW())`,
      [skillIds.script, skillIds.scene_extract, skillIds.character_extract, skillIds.prop_extract, skillIds.shot],
    );
    const textChatGateway = new FakeAiStoryboardTextGateway([
      JSON.stringify({ stages: ["character"] }),
      JSON.stringify({
        characters: [{ characterName: "萧炎", characterDescription: "黑发少年。", characterImagePrompt: "黑发少年，黑色劲装。" }],
      }),
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138242");
      await seedGenerationAccessForPhone(db, "13800138242", 5000);
      const created = await createAiStoryboardPreviewProject(server.origin, cookie, "home-character-intent");
      const response = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-home-character-intent",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "萧炎在乌坦城修炼。",
            instruction: "帮我解析出其中的人物提示词",
            resolveInstructionIntent: true,
            skills: skillIds,
            modelCode: "preview-script-model",
          }),
        },
      );
      const envelope = await response.json();
      const replayResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-home-character-intent",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "萧炎在乌坦城修炼。",
            instruction: "帮我解析出其中的人物提示词",
            resolveInstructionIntent: true,
            skills: skillIds,
            modelCode: "preview-script-model",
          }),
        },
      );
      const replayEnvelope = await replayResponse.json();

      assert.equal(response.status, 200);
      assert.equal(replayResponse.status, 409, JSON.stringify(replayEnvelope));
      assert.equal(replayEnvelope.errorCode, "idempotency_processing");
      assert.equal(textChatGateway.calls.length, 2);
      assert.match(String(textChatGateway.calls[0]?.messages?.[1]?.content ?? ""), /人物提示词/);
      assert.match(textChatGateway.calls[1]?.prompt ?? "", /提取人物提示词/);
      assert.deepEqual(envelope.data.resolvedIntent, { stages: ["character"], skipScriptStage: true });
      assert.deepEqual(
        envelope.data.selectedSkills.map((item: { id: string; category: string }) => [item.category, item.id]),
        [["character_extract", skillIds.character_extract]],
      );
      assert.equal(envelope.data.modelRunCount, 2);
      assert.equal(envelope.data.displayTables.characters.rows[0]?.characterName, "萧炎");
      assert.deepEqual(envelope.data.commitPayload.storyboards, []);
    } finally {
      await server.close();
    }
  });

  it("resolves a DB-configured cumob_chat text.script model for AI storyboard preview", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 0);
    const originalCreateChatCompletionStream = CumobTextAdapter.prototype.createChatCompletionStream;
    const adapterCalls: Array<{ request: { model: string } }> = [];
    const modelCode = "cumob-preview-script-model";
    const scriptSkillId = "80808080-8080-4080-8080-808080808080";
    await db.query(
      `UPDATE ai_model_configs
       SET model_code = $1,
           display_name = 'Cumob preview script model',
           provider_name = 'cumob',
           provider_model = 'gpt-5.6-sol',
           provider_protocol = 'cumob_chat',
           provider_config_json = '{"baseURL":"https://api.cumob.com","requestPath":"/v1/chat/completions","apiKey":"test-cumob-key","requestFormat":"cumob_chat"}'::jsonb,
           updated_at = NOW()
       WHERE model_code = 'preview-script-model'`,
      [modelCode],
    );
    await db.query(
      `INSERT INTO prompts (
         id, prompt_category, name, summary, prompt_content, status,
         is_official, is_published, price_credits, published_at
       ) VALUES ($1, 'script', 'Cumob script skill', '', $2, 'enabled', true, true, 0, NOW())`,
      [scriptSkillId, "Convert the novel excerpt into a storyboard-ready script."],
    );
    CumobTextAdapter.prototype.createChatCompletionStream = async function createChatCompletionStream(input) {
      adapterCalls.push(input);
      return (async function* () {
        yield {
          id: "fake-cumob-storyboard-stream",
          choices: [{
            delta: { content: JSON.stringify({ scriptText: "Ren Xiaoye entrusted Xiaocao to Aunt Min." }) },
            finish_reason: "stop",
          }],
        };
      })();
    };
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138240");
      const created = await createAiStoryboardPreviewProject(server.origin, cookie, "cumob-model-resolution");
      const previewResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-cumob-model-resolution",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "Ren Xiaoye entrusted Xiaocao to Aunt Min.",
            skills: { script: scriptSkillId },
            modelCode,
          }),
        },
      );
      const previewText = await previewResponse.text();

      assert.equal(previewResponse.status, 200, previewText);
      assert.equal(adapterCalls.length, 1);
      assert.equal(adapterCalls[0]?.request.model, "gpt-5.6-sol");
      assert.equal(adapterCalls[0]?.request.max_tokens, undefined);
    } finally {
      CumobTextAdapter.prototype.createChatCompletionStream = originalCreateChatCompletionStream;
      await server.close();
    }
  });

  it("attributes AI storyboard preview provider requests to the current user", async () => {
    const db = await createMigratedTestDb();
    const originalCreateChatCompletionStream = OpenAICompatibleTextAdapter.prototype.createChatCompletionStream;
    const responses = [
      JSON.stringify({
        title: "第一章",
        logline: "少年托付妹妹。",
        scriptBeats: [
          {
            beatNo: 1,
            plot: "任小野把小草托付给闵婶子。",
            characters: ["任小野", "闵婶子"],
            locationHint: "闵婶家门前",
            props: ["饭食"],
            dialogue: "今天又得麻烦您照看小草了。",
          },
        ],
      }),
      JSON.stringify({
        scenes: [{ sceneName: "闵婶家门前", sceneDescription: "旧木屋门前。", sceneImagePrompt: "旧木屋门前，傍晚。" }],
      }),
      JSON.stringify({
        characters: [{ characterName: "任小野", characterDescription: "清瘦少年。", characterImagePrompt: "清瘦少年，旧布短衣。" }],
      }),
      JSON.stringify({
        props: [{ propName: "饭食", propDescription: "递出的饭食。", propImagePrompt: "旧布包裹的饭食。" }],
      }),
      JSON.stringify({
        storyboards: [{ plot: "任小野递出饭食。", dialogue: "麻烦您了。", imagePrompt: "任小野递出饭食。", videoPrompt: "中景固定镜头，递出饭食。" }],
      }),
    ];
    let callIndex = 0;
    OpenAICompatibleTextAdapter.prototype.createChatCompletionStream = async function createChatCompletionStream() {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex += 1;
      return (async function* () {
        yield {
          id: `fake-text-stream-${callIndex}`,
          choices: [
            {
              delta: {
                content: response,
              },
              finish_reason: "stop",
            },
          ],
        };
      })();
    };
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138215");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-ai-storyboard-preview-user-project",
          cookie,
        },
        body: JSON.stringify({
          name: "AI storyboard preview user project",
          scriptInput: "任小野把小草托付给闵婶子。",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const packagesResponse = await fetch(
        `${server.origin}/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500`,
        { headers: { cookie } },
      );
      const packagesEnvelope = await packagesResponse.json();
      const packages = packagesEnvelope.packages as Array<{ id: string; code: string }>;
      const packageId = (code: string) => {
        const found = packages.find((item) => item.code === code);
        assert.ok(found, `missing package ${code}`);
        return found.id;
      };

      const previewResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-user-request",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            packages: {
              genrePackageId: packageId("xuanhuan_xiuxian"),
              emotionPackageId: packageId("male_hotblood"),
            },
          }),
        },
      );
      const previewEnvelope = await previewResponse.json();
      const providerRequest = await db.query<{ created_by_user_id: string | null }>(
        `
          SELECT created_by_user_id
          FROM provider_requests
          WHERE provider_name = 'deepseek'
            AND provider_operation = 'llm.chat.completions'
          ORDER BY created_at DESC
          LIMIT 1
        `,
      );

      assert.equal(createResponse.status, 200);
      assert.equal(previewResponse.status, 200);
      assert.ok(previewEnvelope.data);
      assert.equal(
        providerRequest.rows[0]?.created_by_user_id,
        await readUserIdForPhone(db, normalizeCnPhone("13800138215")),
      );
    } finally {
      OpenAICompatibleTextAdapter.prototype.createChatCompletionStream = originalCreateChatCompletionStream;
      await server.close();
    }
  });

  it("uses the selected script prompt for creator preview generation", async () => {
    const db = await createMigratedTestDb();
    const selectedScriptPromptId = "55555555-5555-4555-8555-555555555555";
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, prompt_content, status,
          is_official, is_published, published_at, created_at, updated_at
        )
        VALUES ($1, 'script', $2, '', $3, 'enabled', true, true, NOW(), NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `,
      [
        selectedScriptPromptId,
        "通用小说转剧本",
        "请把小说原文改写为可继续生成分镜的纯文本剧本。请只返回一个 JSON 对象。",
      ],
    );
    const textChatGateway = new FakeAiStoryboardTextGateway([
      JSON.stringify({
        scriptText: "任小野把小草托付给闵婶子。",
      }),
      JSON.stringify({
        scenes: [{ sceneName: "闵婶家门前", sceneDescription: "旧木屋门前。", sceneImagePrompt: "旧木屋门前，傍晚。" }],
      }),
      JSON.stringify({
        characters: [{ characterName: "任小野", characterDescription: "清瘦少年。", characterImagePrompt: "清瘦少年，旧布短衣。" }],
      }),
      JSON.stringify({
        props: [{ propName: "饭食", propDescription: "递出的饭食。", propImagePrompt: "旧布包裹的饭食。" }],
      }),
      JSON.stringify({
        storyboards: [{ plot: "任小野递出饭食。", dialogue: "麻烦您了。", imagePrompt: "任小野递出饭食。", videoPrompt: "中景固定镜头，递出饭食。" }],
      }),
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138216");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-ai-storyboard-preview-no-default-taboo-leak",
          cookie,
        },
        body: JSON.stringify({
          name: "AI storyboard preview no default taboo leak",
          scriptInput: "任小野把小草托付给闵婶子。",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const previewResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-no-default-taboo-request",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            packages: {
              genrePackageId: selectedScriptPromptId,
              emotionPackageId: selectedScriptPromptId,
            },
          }),
        },
      );

      assert.equal(createResponse.status, 200);
      assert.equal(previewResponse.status, 200);
      assert.doesNotMatch(textChatGateway.calls[0]?.prompt ?? "", /\[基础改编任务\]/);
      assert.doesNotMatch(textChatGateway.calls[0]?.prompt ?? "", /\[题材包：玄幻修仙\]/);
      assert.doesNotMatch(textChatGateway.calls[0]?.prompt ?? "", /\[情绪包：男频热血\]/);
      assert.match(textChatGateway.calls[0]?.prompt ?? "", /请把小说原文改写为可继续生成分镜的纯文本剧本/);
      assert.match(textChatGateway.calls[0]?.prompt ?? "", /请只返回一个 JSON 对象/);
      assert.doesNotMatch(textChatGateway.calls[0]?.prompt ?? "", /\[通用禁忌包：通用质量禁忌\]/);
      assert.doesNotMatch(textChatGateway.calls[0]?.prompt ?? "", /\[通用禁忌包：角色一致性禁忌\]/);
    } finally {
      await server.close();
    }
  });

  it("uses the current automatic script prompt for creator script analysis", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, prompt_content, status,
          is_official, is_published, published_at, created_at, updated_at
        )
        VALUES (
          '66666666-6666-4666-8666-666666666666', 'script', '剧本分析默认提示词', '',
          '避免魔改原著核心设定；避免角色姓名、身份、年龄、外貌、服装、性格前后不一致。',
          'enabled', true, true, NOW(), NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `,
    );
    const textChatGateway = new FakeAiStoryboardTextGateway([
      JSON.stringify({
        scriptText: "任小野把小草托付给闵婶子。",
      }),
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138216");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-ai-script-analysis-with-global-taboo",
          cookie,
        },
        body: JSON.stringify({
          name: "AI script analysis with global taboo",
          scriptInput: "任小野把小草托付给闵婶子。",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const analysisResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-script-analysis`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            packages: {
              genrePackageId: "auto",
              emotionPackageId: "auto",
            },
          }),
        },
      );

      assert.equal(createResponse.status, 200);
      assert.equal(analysisResponse.status, 200);
      assert.match(textChatGateway.calls[0]?.prompt ?? "", /避免魔改原著核心设定/);
      assert.match(textChatGateway.calls[0]?.prompt ?? "", /避免角色姓名、身份、年龄、外貌、服装、性格前后不一致/);
    } finally {
      await server.close();
    }
  });

  it("uses the current prompt from each extraction category for preview generation", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, prompt_content, status,
          is_official, is_published, published_at, created_at, updated_at
        )
        VALUES
          ('11111111-1111-4111-8111-111111111111', 'scene_extract', '自定义场景提示词', '', '后台列表默认场景模板', 'enabled', true, true, NOW(), NOW(), NOW()),
          ('33333333-3333-4333-8333-333333333333', 'character_extract', '自定义角色提示词', '', '后台列表默认角色模板', 'enabled', true, true, NOW(), NOW(), NOW()),
          ('22222222-2222-4222-8222-222222222222', 'prop_extract', '自定义道具提示词', '', '后台列表默认道具模板', 'enabled', true, true, NOW(), NOW(), NOW()),
          ('44444444-4444-4444-8444-444444444444', 'shot', '自定义分镜提示词', '', '后台列表默认分镜模板', 'enabled', true, true, NOW(), NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `,
    );
    const textChatGateway = new FakeAiStoryboardTextGateway([
      JSON.stringify({
        scriptText: "任小野把小草托付给闵婶子。",
      }),
      JSON.stringify({
        scenes: [{ sceneName: "闵婶家门前", sceneDescription: "旧木屋门前。", sceneImagePrompt: "旧木屋门前，傍晚。" }],
      }),
      JSON.stringify({
        characters: [{ characterName: "任小野", characterDescription: "清瘦少年。", characterImagePrompt: "清瘦少年，旧布短衣。" }],
      }),
      JSON.stringify({
        props: [{ propName: "饭食", propDescription: "递出的饭食。", propImagePrompt: "旧布包裹的饭食。" }],
      }),
      JSON.stringify({
        storyboards: [{ plot: "任小野递出饭食。", dialogue: "麻烦您了。", imagePrompt: "任小野递出饭食。", videoPrompt: "中景固定镜头，递出饭食。" }],
      }),
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138213");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-ai-storyboard-preview-template-code-project",
          cookie,
        },
        body: JSON.stringify({
          name: "AI storyboard preview template code project",
          scriptInput: "任小野把小草托付给闵婶子。",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const previewResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-template-code-request",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            packages: {
              genrePackageId: "auto",
              emotionPackageId: "auto",
            },
          }),
        },
      );

      assert.equal(previewResponse.status, 200);
      assert.match(textChatGateway.calls[1]?.prompt ?? "", /后台列表默认场景模板/);
      assert.match(textChatGateway.calls[2]?.prompt ?? "", /后台列表默认角色模板/);
      assert.match(textChatGateway.calls[3]?.prompt ?? "", /后台列表默认道具模板/);
      assert.match(textChatGateway.calls[4]?.prompt ?? "", /后台列表默认分镜模板/);
    } finally {
      await server.close();
    }
  });

  it("deducts script generation credits and writes a ledger record after AI storyboard preview", async () => {
    const db = await createMigratedTestDb();
    const textChatGateway = new FakeAiStoryboardTextGateway([
      JSON.stringify({
        scriptText: "任小野把小草托付给闵婶子。",
      }),
      JSON.stringify({
        scenes: [{ sceneName: "闵婶家门前", sceneDescription: "旧木屋门前。", sceneImagePrompt: "旧木屋门前，傍晚。" }],
      }),
      JSON.stringify({
        characters: [{ characterName: "任小野", characterDescription: "清瘦少年。", characterImagePrompt: "清瘦少年，旧布短衣。" }],
      }),
      JSON.stringify({
        props: [{ propName: "饭食", propDescription: "递出的饭食。", propImagePrompt: "旧布包裹的饭食。" }],
      }),
      JSON.stringify({
        storyboards: [{ plot: "任小野递出饭食。", dialogue: "麻烦您了。", imagePrompt: "任小野递出饭食。", videoPrompt: "中景固定镜头，递出饭食。" }],
      }),
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await db.query(
        `
          INSERT INTO ai_model_configs (
            id,
            model_code,
            display_name,
            provider_name,
            provider_model,
            provider_protocol,
            invocation_mode,
            media_type,
            task_modes_json,
            capabilities_json,
            parameter_schema_json,
            default_params_json,
            provider_config_json,
            pricing_json,
            limits_json,
            ui_config_json,
            status,
            sort_order,
            remark,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            'preview-script-model',
            '预览剧本模型',
            'deepseek',
            'deepseek-chat',
            'openai_compatible_chat',
            'stream',
            'text',
            '["text.script"]'::jsonb,
            '{"input":["prompt"],"output":["text"]}'::jsonb,
            '{"scriptPrompt":{"type":"string","required":true}}'::jsonb,
            '{}'::jsonb,
            '{"baseURL":"https://api.deepseek.com","requestPath":"/chat/completions","apiKeyEnv":"DEEPSEEK_API_KEY"}'::jsonb,
            '{"unit":"text","baseCredits":20}'::jsonb,
            '{}'::jsonb,
            '{"modelKind":"text.script","supportedModes":["script"]}'::jsonb,
            'active',
            1,
            '',
            NOW(),
            NOW()
          )
          ON CONFLICT (model_code) DO UPDATE
          SET pricing_json = EXCLUDED.pricing_json,
              task_modes_json = EXCLUDED.task_modes_json,
              ui_config_json = EXCLUDED.ui_config_json,
              status = 'active',
              updated_at = NOW()
        `,
        [randomUUID()],
      );
      await server.listen(0);
      const cookie = await login(server.origin, "13800138218");
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-ai-storyboard-preview-credit-project",
          cookie,
        },
        body: JSON.stringify({
          name: "AI storyboard preview credit project",
          scriptInput: "任小野把小草托付给闵婶子。",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138218"));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 500,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      const packagesResponse = await fetch(
        `${server.origin}/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500`,
        { headers: { cookie } },
      );
      const packagesEnvelope = await packagesResponse.json();
      const packages = packagesEnvelope.packages as Array<{ id: string; code: string }>;
      const packageId = (code: string) => {
        const found = packages.find((item) => item.code === code);
        assert.ok(found, `missing package ${code}`);
        return found.id;
      };

      const previewResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-credit-request",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            packages: {
              genrePackageId: packageId("xuanhuan_xiuxian"),
              emotionPackageId: packageId("male_hotblood"),
            },
          }),
        },
      );
      const previewEnvelope = await previewResponse.json();
      const creatorLedgerResponse = await fetch(`${server.origin}/api/creator/credits/ledger?pageSize=20`, {
        headers: { cookie },
      });
      const creatorLedgerEnvelope = await creatorLedgerResponse.json();
      const ledgerEntries = await db.query<{
        source_type: string;
        reason: string | null;
        amount: number | string;
        metadata_json: Record<string, unknown>;
      }>(
        `
          SELECT source_type, reason, amount, metadata_json
          FROM credit_ledger_entries
          WHERE user_id = $1
          ORDER BY created_at DESC
        `,
        [userId],
      );

      assert.equal(createResponse.status, 200);
      assert.equal(previewResponse.status, 200);
      assert.equal(creatorLedgerResponse.status, 200);
      assert.ok(previewEnvelope.data);
      assert.equal(previewEnvelope.data.creditBalance, 400);
      assert.equal(previewEnvelope.data.displayCreditBalance, 400);
      assert.equal(previewEnvelope.data.modelRunCount, 5);
      assert.equal(previewEnvelope.data.modelCreditCost, 100);
      assert.ok(
        creatorLedgerEnvelope.data.some((entry: { sourceType?: string; reason?: string; amount?: number | string }) =>
          entry.sourceType === "episode_generation_task"
          && entry.reason === "script generation"
          && Number(entry.amount) === 100,
        ),
      );
      assert.ok(
        ledgerEntries.rows.some((entry) =>
            entry.source_type === "episode_generation_task" &&
            entry.reason === "script generation" &&
            Number(entry.amount) === 100 &&
            String(entry.metadata_json?.modelCode ?? "").includes("script"),
          ),
      );
    } finally {
      await server.close();
    }
  });

  it("refunds owner credits and reports a service interruption when AI storyboard preview loses PostgreSQL", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 20);
    let gatewayCalls = 0;
    let signalModelStarted!: () => void;
    const modelStarted = new Promise<void>((resolve) => {
      signalModelStarted = resolve;
    });
    let releaseModel!: () => void;
    const modelRelease = new Promise<void>((resolve) => {
      releaseModel = resolve;
    });
    const textChatGateway = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson() {
        gatewayCalls += 1;
        signalModelStarted();
        await modelRelease;
        throw markTransientDatabasePersistenceError(
          Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" }),
        );
      },
    };
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const phone = "13800138242";
      const cookie = await login(server.origin, phone);
      await seedGenerationAccessForPhone(db, phone, 500);
      const userId = await readUserIdForPhone(db, normalizeCnPhone(phone));
      const created = await createAiStoryboardPreviewProject(server.origin, cookie, "postgres-refund");
      const balanceBefore = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE id = $1",
        [userId],
      );

      const previewResponsePromise = fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview?stream=1`,
        {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-postgres-refund",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            stages: ["script"],
            packages: { genrePackageId: "auto", emotionPackageId: "auto" },
            modelCode: "preview-script-model",
          }),
        },
      );
      await modelStarted;
      const concurrentResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview?stream=1`,
        {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-postgres-refund",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            stages: ["script"],
            packages: { genrePackageId: "auto", emotionPackageId: "auto" },
            modelCode: "preview-script-model",
          }),
        },
      );
      releaseModel();
      const previewResponse = await previewResponsePromise;
      const responseText = await previewResponse.text();
      const concurrentText = await concurrentResponse.text();
      const replayResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview?stream=1`,
        {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-postgres-refund",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            stages: ["script"],
            packages: { genrePackageId: "auto", emotionPackageId: "auto" },
            modelCode: "preview-script-model",
          }),
        },
      );
      const replayEnvelope = await replayResponse.json();
      const balanceAfter = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE id = $1",
        [userId],
      );
      const refundEntries = await db.query<{ amount: number | string }>(
        `SELECT amount FROM credit_ledger_entries
         WHERE user_id = $1 AND source_type = 'ai_storyboard_preview_refund'`,
        [userId],
      );

      assert.equal(previewResponse.status, 200);
      assert.match(responseText, /服务连接暂时中断，请稍后重试。/);
      assert.equal(concurrentResponse.status, 409, concurrentText);
      assert.equal(JSON.parse(concurrentText).errorCode, "idempotency_processing");
      assert.equal(replayResponse.status, 409, JSON.stringify(replayEnvelope));
      assert.equal(replayEnvelope.errorCode, "ai_storyboard_preview_already_refunded");
      assert.equal(gatewayCalls, 1);
      assert.equal(Number(balanceAfter.rows[0]?.balance), Number(balanceBefore.rows[0]?.balance));
      assert.equal(Number(refundEntries.rows[0]?.amount), 20);
    } finally {
      await server.close();
    }
  });

  it("claims a zero-credit AI storyboard preview before a concurrent provider call", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 0);
    let gatewayCalls = 0;
    let signalModelStarted!: () => void;
    const modelStarted = new Promise<void>((resolve) => {
      signalModelStarted = resolve;
    });
    let releaseModel!: () => void;
    const modelRelease = new Promise<void>((resolve) => {
      releaseModel = resolve;
    });
    const textChatGateway = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson() {
        gatewayCalls += 1;
        signalModelStarted();
        await modelRelease;
        throw new Error("injected zero-credit provider failure");
      },
    };
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const phone = "13800138245";
      const cookie = await login(server.origin, phone);
      await seedActiveGenerationMembership(db, {
        userId: await readUserIdForPhone(db, normalizeCnPhone(phone)),
      });
      const created = await createAiStoryboardPreviewProject(server.origin, cookie, "zero-credit-claim");
      const requestPreview = () => fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview?stream=1`,
        {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-zero-credit-claim",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            stages: ["script"],
            packages: { genrePackageId: "auto", emotionPackageId: "auto" },
            modelCode: "preview-script-model",
          }),
        },
      );

      const firstResponsePromise = requestPreview();
      await modelStarted;
      const concurrentResponse = await requestPreview();
      const concurrentText = await concurrentResponse.text();
      releaseModel();
      const firstResponse = await firstResponsePromise;
      await firstResponse.text();

      assert.equal(concurrentResponse.status, 409, concurrentText);
      assert.equal(JSON.parse(concurrentText).errorCode, "idempotency_processing");
      assert.equal(gatewayCalls, 1);
    } finally {
      releaseModel?.();
      await server.close();
    }
  });

  it("returns the service interruption envelope and refunds a non-stream AI storyboard preview", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 20);
    let gatewayCalls = 0;
    const textChatGateway = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson() {
        gatewayCalls += 1;
        throw markTransientDatabasePersistenceError(
          Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" }),
        );
      },
    };
    let refundConnectionFailures = 0;
    const serverDb: PhoneAuthTestDb = {
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
        if (
          refundConnectionFailures === 0
          && gatewayCalls > 0
          && params.some((value) => value === "ai_storyboard_preview_refund")
        ) {
          refundConnectionFailures += 1;
          throw Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
        }
        return db.query<T>(sql, params);
      },
      close: () => db.close(),
    };
    const server = createPhoneAuthDevServer({ db: serverDb, textChatGateway });

    try {
      await server.listen(0);
      const phone = "13800138243";
      const cookie = await login(server.origin, phone);
      await seedGenerationAccessForPhone(db, phone, 500);
      const userId = await readUserIdForPhone(db, normalizeCnPhone(phone));
      const created = await createAiStoryboardPreviewProject(server.origin, cookie, "postgres-non-stream-refund");
      const balanceBefore = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE id = $1",
        [userId],
      );

      const previewResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-postgres-non-stream-refund",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            stages: ["script"],
            packages: { genrePackageId: "auto", emotionPackageId: "auto" },
            modelCode: "preview-script-model",
          }),
        },
      );
      const previewEnvelope = await previewResponse.json();
      const balanceAfter = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE id = $1",
        [userId],
      );

      assert.equal(previewResponse.status, 503, JSON.stringify(previewEnvelope));
      assert.equal(previewEnvelope.errorCode, "ai_storyboard_preview_service_interrupted");
      assert.equal(previewEnvelope.message, "服务连接暂时中断，请稍后重试。");
      assert.equal(refundConnectionFailures, 1);
      assert.equal(Number(balanceAfter.rows[0]?.balance), Number(balanceBefore.rows[0]?.balance));
    } finally {
      await server.close();
    }
  });

  it("refunds a team member preview and blocks a same-key generation replay", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 20);
    let gatewayCalls = 0;
    let signalModelStarted!: () => void;
    const modelStarted = new Promise<void>((resolve) => {
      signalModelStarted = resolve;
    });
    let releaseModel!: () => void;
    const modelRelease = new Promise<void>((resolve) => {
      releaseModel = resolve;
    });
    const textChatGateway = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson() {
        gatewayCalls += 1;
        signalModelStarted();
        await modelRelease;
        throw markTransientDatabasePersistenceError(
          Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" }),
        );
      },
    };
    const server = createPhoneAuthDevServer({ db, textChatGateway, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const phone = "13800138244";
      const ownerCookie = await login(server.origin, phone);
      await seedGenerationAccessForPhone(db, phone, 500);
      const created = await createAiStoryboardPreviewProject(server.origin, ownerCookie, "member-postgres-refund");
      const createMemberResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          teamAccount: `preview_member_${randomUUID().slice(0, 8)}`,
          displayName: "分镜预览子账户",
          projectIds: [created.project.id],
          initialCredits: 0,
        }),
      });
      const createdMember = await createMemberResponse.json();
      assert.equal(createMemberResponse.status, 200, JSON.stringify(createdMember));
      const teamMemberId = createdMember.member.membershipId;
      await db.query("UPDATE team_members SET member_credits = 500 WHERE id = $1", [teamMemberId]);
      const memberCookie = await loginTeamMemberAccount(
        server.origin,
        createdMember.member.memberLoginAccount,
        createdMember.temporaryPassword,
      );
      const requestPreview = (requestCookie = memberCookie) => fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview?stream=1`,
        {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
            "idempotency-key": "http-ai-storyboard-preview-member-postgres-refund",
            cookie: requestCookie,
          },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            stages: ["script"],
            packages: { genrePackageId: "auto", emotionPackageId: "auto" },
            modelCode: "preview-script-model",
          }),
        },
      );
      const balanceBefore = await db.query<{ balance: number | string }>(
        "SELECT member_credits AS balance FROM team_members WHERE id = $1",
        [teamMemberId],
      );

      const previewResponsePromise = requestPreview();
      await modelStarted;
      const concurrentResponse = await requestPreview();
      releaseModel();
      const previewResponse = await previewResponsePromise;
      const responseText = await previewResponse.text();
      const concurrentText = await concurrentResponse.text();
      const replayResponse = await requestPreview();
      const replayEnvelope = await replayResponse.json();
      const balanceAfter = await db.query<{ balance: number | string }>(
        "SELECT member_credits AS balance FROM team_members WHERE id = $1",
        [teamMemberId],
      );
      const refundEntries = await db.query<{ amount: number | string }>(
        `SELECT amount FROM credit_ledger_entries
         WHERE team_member_id = $1 AND source_type = 'team_member_generation_refund'`,
        [teamMemberId],
      );

      assert.equal(previewResponse.status, 200, responseText);
      assert.match(responseText, /服务连接暂时中断，请稍后重试。/);
      assert.equal(concurrentResponse.status, 409, concurrentText);
      assert.equal(JSON.parse(concurrentText).errorCode, "idempotency_processing");
      assert.equal(replayResponse.status, 409, JSON.stringify(replayEnvelope));
      assert.equal(replayEnvelope.errorCode, "ai_storyboard_preview_already_refunded");
      assert.equal(gatewayCalls, 1);
      assert.equal(Number(balanceAfter.rows[0]?.balance), Number(balanceBefore.rows[0]?.balance));
      assert.equal(Number(refundEntries.rows[0]?.amount), 20);

      const createSecondMemberResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          teamAccount: `preview_member_${randomUUID().slice(0, 8)}`,
          displayName: "第二个分镜预览子账户",
          projectIds: [created.project.id],
          initialCredits: 0,
        }),
      });
      const secondMember = await createSecondMemberResponse.json();
      assert.equal(createSecondMemberResponse.status, 200, JSON.stringify(secondMember));
      const secondMemberId = secondMember.member.membershipId;
      await db.query("UPDATE team_members SET member_credits = 500 WHERE id = $1", [secondMemberId]);
      const secondMemberCookie = await loginTeamMemberAccount(
        server.origin,
        secondMember.member.memberLoginAccount,
        secondMember.temporaryPassword,
      );
      const secondBalanceBefore = await db.query<{ balance: number | string }>(
        "SELECT member_credits AS balance FROM team_members WHERE id = $1",
        [secondMemberId],
      );
      const secondResponse = await requestPreview(secondMemberCookie);
      const secondText = await secondResponse.text();
      const secondBalanceAfter = await db.query<{ balance: number | string }>(
        "SELECT member_credits AS balance FROM team_members WHERE id = $1",
        [secondMemberId],
      );

      assert.equal(secondResponse.status, 200, secondText);
      assert.match(secondText, /服务连接暂时中断，请稍后重试。/);
      assert.equal(gatewayCalls, 2);
      assert.equal(Number(secondBalanceAfter.rows[0]?.balance), Number(secondBalanceBefore.rows[0]?.balance));
    } finally {
      await server.close();
    }
  });

  it("blocks AI storyboard preview when membership or credits are invalid", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await seedPreviewScriptModelConfig(db, 20);
      await server.listen(0);
      const cookieNoMembership = await login(server.origin, "13800138219");
      const noMembershipProject = await createAiStoryboardPreviewProject(server.origin, cookieNoMembership, "no-membership");
      const packages = { genrePackageId: "auto", emotionPackageId: "auto" };

      const noMembershipResponse = await postAiStoryboardPreview(server.origin, {
        cookie: cookieNoMembership,
        projectId: noMembershipProject.project.id,
        idempotencyKey: "http-ai-storyboard-preview-no-membership",
        packages,
      });
      const noMembershipEnvelope = await noMembershipResponse.json();

      const cookieExpired = await login(server.origin, "13800138220");
      const expiredProject = await createAiStoryboardPreviewProject(server.origin, cookieExpired, "expired");
      const expiredUserId = await readUserIdForPhone(db, normalizeCnPhone("13800138220"));
      await seedActiveGenerationMembership(db, {
        userId: expiredUserId,
        now: new Date("2026-05-01T00:00:00.000Z"),
        periodEndAt: new Date("2026-05-02T00:00:00.000Z"),
      });
      await grantCredits(db, {
        userId: expiredUserId,
        amount: 500,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: expiredUserId,
        now: new Date(),
      });
      const expiredResponse = await postAiStoryboardPreview(server.origin, {
        cookie: cookieExpired,
        projectId: expiredProject.project.id,
        idempotencyKey: "http-ai-storyboard-preview-expired-membership",
        packages,
      });
      const expiredEnvelope = await expiredResponse.json();

      const cookieNoCredits = await login(server.origin, "13800138221");
      const noCreditsProject = await createAiStoryboardPreviewProject(server.origin, cookieNoCredits, "no-credits");
      const noCreditsUserId = await readProjectOwnerUserId(db, noCreditsProject.project.id);
      await seedActiveGenerationMembership(db, { userId: noCreditsUserId });
      await db.query(
        "UPDATE users SET credit_balance_cached = 0, credit_reserved_cached = 0 WHERE id = $1",
        [noCreditsUserId],
      );
      const noCreditsResponse = await postAiStoryboardPreview(server.origin, {
        cookie: cookieNoCredits,
        projectId: noCreditsProject.project.id,
        idempotencyKey: "http-ai-storyboard-preview-no-credits",
        packages,
      });
      const noCreditsEnvelope = await noCreditsResponse.json();

      assert.equal(noMembershipResponse.status, 403);
      assert.equal(noMembershipEnvelope.errorCode, "membership_required");
      assert.equal(noMembershipEnvelope.message, "请充值会员。");
      assert.equal(expiredResponse.status, 403);
      assert.equal(expiredEnvelope.errorCode, "membership_expired");
      assert.equal(expiredEnvelope.message, "您的会员已过期，请前往续充。");
      assert.equal(noCreditsResponse.status, 402, JSON.stringify(noCreditsEnvelope));
      assert.equal(noCreditsEnvelope.errorCode, "insufficient_credits");
      assert.equal(noCreditsEnvelope.message, "积分不足，请前往充值积分。");
    } finally {
      await server.close();
    }
  });

  it("rejects viewer and membership-ineligible team-member storyboard generation", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 0);
    let gatewayCalls = 0;
    const textChatGateway = {
      async completeJson() { gatewayCalls += 1; return "{}"; },
      async *streamJson() { gatewayCalls += 1; yield "{}"; },
    };
    const server = createPhoneAuthDevServer({ db, textChatGateway, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138246");
      const created = await createAiStoryboardPreviewProject(server.origin, ownerCookie, "member-preview-auth");
      const createMemberResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          teamAccount: `preview_auth_${randomUUID().slice(0, 8)}`,
          displayName: "分镜权限子账户",
          projectIds: [created.project.id],
          initialCredits: 0,
        }),
      });
      const createdMember = await createMemberResponse.json();
      assert.equal(createMemberResponse.status, 200, JSON.stringify(createdMember));
      const teamMemberId = createdMember.member.membershipId;
      await db.query(
        "UPDATE team_member_projects SET role = 'viewer' WHERE member_id = $1 AND project_id = $2",
        [teamMemberId, created.project.id],
      );
      const memberCookie = await loginTeamMemberAccount(
        server.origin,
        createdMember.member.memberLoginAccount,
        createdMember.temporaryPassword,
      );
      const requestPreview = (idempotencyKey: string) => fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, cookie: memberCookie },
          body: JSON.stringify({
            scriptText: "任小野把小草托付给闵婶子。",
            stages: ["script"],
            packages: { genrePackageId: "auto", emotionPackageId: "auto" },
            modelCode: "preview-script-model",
          }),
        },
      );

      const viewerResponse = await requestPreview("http-ai-storyboard-preview-viewer");
      const viewerEnvelope = await viewerResponse.json();
      await db.query(
        "UPDATE team_member_projects SET role = 'creator' WHERE member_id = $1 AND project_id = $2",
        [teamMemberId, created.project.id],
      );
      const membershipResponse = await requestPreview("http-ai-storyboard-preview-member-no-membership");
      const membershipEnvelope = await membershipResponse.json();

      assert.equal(viewerResponse.status, 403, JSON.stringify(viewerEnvelope));
      assert.equal(viewerEnvelope.errorCode, "permission_denied");
      assert.equal(membershipResponse.status, 403, JSON.stringify(membershipEnvelope));
      assert.equal(membershipEnvelope.errorCode, "membership_required");
      assert.equal(gatewayCalls, 0);
    } finally {
      await server.close();
    }
  });

  it("commits AI storyboard preview payload into a real episode", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138212");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-ai-storyboard-preview-commit-project",
          cookie,
        },
        body: JSON.stringify({
          name: "AI storyboard commit project",
          scriptInput: "任小野把机械腿残骸掷向食人花树。",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const commitResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview/commit`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            episodeTitle: "第 1 集",
            commitPayload: {
              characters: [
                {
                  characterName: "任小野",
                  characterDescription: "灰晶收割者少年。",
                  characterImagePrompt: "任小野角色设定图",
                },
              ],
              scenes: [
                {
                  sceneName: "黑山密林",
                  sceneDescription: "腐叶和断根包围的密林。",
                  sceneImagePrompt: "黑山密林场景图",
                },
              ],
              props: [
                {
                  propName: "机械腿残骸",
                  propDescription: "沉重的金属残骸。",
                  propImagePrompt: "机械腿残骸道具图",
                },
              ],
              storyboards: [
                {
                  plot: "任小野把机械腿残骸掷向食人花树。",
                  dialogue: "任小野：别过来。",
                  imagePrompt: "静态分镜图提示词",
                  videoPrompt: "动态视频提示词",
                },
              ],
            },
          }),
        },
      );
      const commitEnvelope = await commitResponse.json();
      const episodeId = commitEnvelope.episode?.id;

      const [assetsResponse, storyboardsResponse] = await Promise.all([
        fetch(`${server.origin}/api/episodes/${episodeId}/assets?assetType=role&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/episodes/${episodeId}/storyboards?page=1&pageSize=20`, {
          headers: { cookie },
        }),
      ]);
      const assetsEnvelope = await assetsResponse.json();
      const storyboardsEnvelope = await storyboardsResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(commitResponse.status, 200);
      assert.equal(commitEnvelope.episode.title, "第 1 集");
      assert.equal(commitEnvelope.storyboards.length, 1);
      assert.equal(assetsEnvelope.data.items[0].name, "任小野");
      assert.equal(storyboardsEnvelope.data.items[0].sceneAnalysis, "任小野把机械腿残骸掷向食人花树。\n\n任小野：别过来。");
      assert.deepEqual(
        storyboardsEnvelope.data.items[0].generationDrafts.map((draft: { mode: string; prompt: string }) => ({
          mode: draft.mode,
          prompt: draft.prompt,
        })).sort((left: { mode: string }, right: { mode: string }) => left.mode.localeCompare(right.mode)),
        [
          { mode: "image", prompt: "静态分镜图提示词" },
          { mode: "video", prompt: "动态视频提示词" },
        ],
      );
    } finally {
      await server.close();
    }
  });

  it("commits an asset-only AI workflow without requiring storyboards", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138213");
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-ai-asset-only-commit-project",
          cookie,
        },
        body: JSON.stringify({
          name: "AI asset only commit project",
          scriptInput: "任小野角色设定。",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const commitResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview/commit`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            episodeTitle: "角色资产",
            commitPayload: {
              scriptText: "任小野角色设定。",
              characters: [{
                characterName: "任小野",
                characterDescription: "灰晶收割者少年。",
                characterImagePrompt: "任小野角色设定图",
              }],
              scenes: [],
              props: [],
              storyboards: [],
            },
          }),
        },
      );
      const commitEnvelope = await commitResponse.json();
      const episodeId = commitEnvelope.episode?.id;
      const [assetsResponse, storyboardsResponse] = await Promise.all([
        fetch(`${server.origin}/api/episodes/${episodeId}/assets?assetType=role&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/episodes/${episodeId}/storyboards?page=1&pageSize=20`, {
          headers: { cookie },
        }),
      ]);
      const assetsEnvelope = await assetsResponse.json();
      const storyboardsEnvelope = await storyboardsResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(commitResponse.status, 200, JSON.stringify(commitEnvelope));
      assert.equal(commitEnvelope.episode.title, "角色资产");
      assert.equal(commitEnvelope.storyboards.length, 0);
      assert.equal(assetsEnvelope.data.items[0].name, "任小野");
      assert.equal(storyboardsEnvelope.data.items.length, 0);
    } finally {
      await server.close();
    }
  });

  it("streams AI storyboard preview text before the final parsed payload", async () => {
    const db = await createMigratedTestDb();
    const textChatGateway = new FakeAiStoryboardTextGateway([
      [
        '{"title":"第一章","scriptBeats":[',
        '{"beatNo":1,"plot":"任小野托付妹妹。","characters":["任小野"],"locationHint":"门前","props":[],"dialogue":""}',
        "]}",
      ],
      [
        '{"scenes":[{"sceneName":"门前","sceneDescription":"旧木屋","sceneImagePrompt":"旧木屋。"}]}',
      ],
      [
        '{"characters":[{"characterName":"任小野","characterDescription":"少年","characterImagePrompt":"少年。"}]}',
      ],
      ['{"props":[]}'],
      [
        '{"storyboards":[{"plot":"递出饭食","dialogue":"","imagePrompt":"递出饭食。","videoPrompt":"中景。"}]}',
      ],
    ]);
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138211");
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-ai-storyboard-stream-project",
          cookie,
        },
        body: JSON.stringify({
          name: "AI storyboard stream project",
          scriptInput: "任小野托付妹妹。",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const packagesResponse = await fetch(
        `${server.origin}/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500`,
        { headers: { cookie } },
      );
      const packagesEnvelope = await packagesResponse.json();
      const packages = packagesEnvelope.packages as Array<{ id: string; code: string }>;
      const packageId = (code: string) => {
        const found = packages.find((item) => item.code === code);
        assert.ok(found, `missing package ${code}`);
        return found.id;
      };

      const response = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview?stream=1`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
            "idempotency-key": "http-ai-storyboard-stream-request",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "任小野托付妹妹。",
            packages: {
              genrePackageId: packageId("xuanhuan_xiuxian"),
              emotionPackageId: packageId("male_hotblood"),
            },
          }),
        },
      );
      const text = await response.text();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
      assert.match(text, /data:\s*\{"type":"ping","ts":/);
      assert.ok(text.indexOf('"type":"script_delta"') < text.indexOf('"type":"complete"'), text);
      assert.ok(text.indexOf('"type":"asset_delta"') < text.indexOf('"type":"complete"'));
      assert.match(text, /"type":"script_prompt"/);
      assert.match(text, /"type":"asset_prompt"/);
      assert.doesNotMatch(text, /\[基础改编任务\]/);
      assert.doesNotMatch(text, /\[题材包：玄幻修仙\]/);
      assert.doesNotMatch(text, /\[情绪包：男频热血\]/);
      assert.doesNotMatch(text, /\[通用禁忌包：通用质量禁忌\]/);
      assert.doesNotMatch(text, /\[通用禁忌包：角色一致性禁忌\]/);
      assert.match(text, /场景提示词生成/);
      assert.match(text, /角色提示词生成/);
      assert.match(text, /分镜提示词生成/);
      assert.match(text, /请用 JSON 数组输出/);
      assert.match(text, /避免魔改原著核心设定/);
      assert.match(text, /任小野托付妹妹/);
      assert.match(text, /递出饭食/);
      assert.doesNotMatch(text, /^event:/m);
    } finally {
      await server.close();
    }
  });

  it("flushes the first AI storyboard SSE delta before completion", async () => {
    const db = await createMigratedTestDb();
    await seedPreviewScriptModelConfig(db, 0);
    const scriptSkillId = "81818181-8181-4181-8181-818181818181";
    await db.query(
      `INSERT INTO prompts (
         id, prompt_category, name, summary, prompt_content, status,
         is_official, is_published, price_credits, published_at
       ) VALUES ($1, 'script', 'SSE timing script skill', '', $2, 'enabled', true, true, 0, NOW())`,
      [scriptSkillId, "Convert the novel excerpt into a storyboard-ready script."],
    );
    let releaseFirstScriptGate!: () => void;
    const firstScriptGate = new Promise<void>((resolve) => {
      releaseFirstScriptGate = resolve;
    });
    const textChatGateway = new FakeAiStoryboardTextGateway([
      ['{"scriptText":"Ren Xiaoye entrusted ', 'Xiaocao to Aunt Min."}'],
    ]);
    const streamJson = textChatGateway.streamJson.bind(textChatGateway);
    textChatGateway.streamJson = async function* gatedStreamJson(input) {
      let chunkIndex = 0;
      for await (const chunk of streamJson(input)) {
        yield chunk;
        if (chunkIndex === 0) {
          await firstScriptGate;
        }
        chunkIndex += 1;
      }
    };
    const server = createPhoneAuthDevServer({ db, textChatGateway });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138241");
      const created = await createAiStoryboardPreviewProject(server.origin, cookie, "sse-first-delta");
      const response = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/ai-storyboard-preview?stream=1`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
            "idempotency-key": "http-ai-storyboard-sse-first-delta",
            cookie,
          },
          body: JSON.stringify({
            scriptText: "Ren Xiaoye entrusted Xiaocao to Aunt Min.",
            skills: { script: scriptSkillId },
            modelCode: "preview-script-model",
          }),
        },
      );

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
      assert.equal(response.headers.get("x-accel-buffering"), "no");
      assert.ok(response.body);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const readChunk = async () => {
        let timeoutId!: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("timed out waiting for the first SSE delta")), 2_000);
        });
        try {
          return await Promise.race([reader.read(), timeout]);
        } finally {
          clearTimeout(timeoutId);
        }
      };
      let text = "";
      while (!text.includes('"type":"script_delta"')) {
        const chunk = await readChunk();
        assert.equal(chunk.done, false, text);
        text += decoder.decode(chunk.value, { stream: true });
      }
      assert.doesNotMatch(text, /"type":"complete"/);

      releaseFirstScriptGate();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      assert.match(text, /"type":"complete"/);
    } finally {
      releaseFirstScriptGate();
      await server.close();
    }
  });

  it("lets creators publish and freely add protected prompt marketplace items", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const sellerCookie = await login(server.origin, "13800138201");
      const buyerCookie = await login(server.origin, "13800138202");
      const createResponse = await fetch(`${server.origin}/api/creator/prompt-marketplace/items`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sellerCookie },
        body: JSON.stringify({
          title: "创作者场景抽取提示词",
          category: "scene_extract",
          summary: "用于长篇小说的场景抽取。",
          content: "请根据小说章节抽取全部场景，并保持地点、时间、人物关系和视觉线索一致。",
          tags: ["场景", "长篇"],
          priceCredits: 25,
        }),
      });
      assert.equal(createResponse.status, 201);
      const created = await createResponse.json();

      const updateResponse = await fetch(`${server.origin}/api/creator/prompt-marketplace/items/${created.item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: sellerCookie },
        body: JSON.stringify({
          title: "创作者场景抽取提示词（已编辑）",
          category: "scene_extract",
          summary: "编辑后的场景抽取简介。",
          content: "请根据小说章节抽取全部场景，并保持地点、时间、人物关系、视觉线索和上下文连续性一致。",
          coverImageUrl: "https://example.com/scene-prompt-cover.png",
          priceCredits: 25,
          publish: true,
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updated = await updateResponse.json();
      assert.equal(updated.item.title, "创作者场景抽取提示词（已编辑）");
      assert.equal(updated.item.coverImageUrl, "https://example.com/scene-prompt-cover.png");

      const anonymousCatalogResponse = await fetch(`${server.origin}/api/creator/prompt-marketplace`);
      assert.equal(anonymousCatalogResponse.status, 200);
      const anonymousCatalog = await anonymousCatalogResponse.json();
      const anonymouslyListed = anonymousCatalog.items.find((item: { id: string }) => item.id === created.item.id);
      assert.equal(anonymouslyListed.title, "创作者场景抽取提示词（已编辑）");
      assert.equal(anonymouslyListed.owned, false);
      assert.equal(anonymouslyListed.purchased, false);
      assert.equal(anonymouslyListed.contentVisible, false);
      assert.equal(Object.prototype.hasOwnProperty.call(anonymouslyListed, "content"), false);
      const anonymousLibraryResponse = await fetch(`${server.origin}/api/creator/prompt-marketplace/library`);
      assert.equal(anonymousLibraryResponse.status, 401);

      const unauthorizedUpdateResponse = await fetch(`${server.origin}/api/creator/prompt-marketplace/items/${created.item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: buyerCookie },
        body: JSON.stringify({
          title: "无权编辑",
          category: "scene_extract",
          content: "购买者不能修改其他作者发布的提示词，这段正文用于验证接口的所有者权限限制。",
          priceCredits: 0,
          publish: false,
        }),
      });
      assert.equal(unauthorizedUpdateResponse.status, 404);

      const catalogResponse = await fetch(`${server.origin}/api/creator/prompt-marketplace`, {
        headers: { cookie: buyerCookie },
      });
      assert.equal(catalogResponse.status, 200);
      const catalog = await catalogResponse.json();
      assert.equal(catalog.pagination.pageSize, 12);
      const listed = catalog.items.find((item: { id: string }) => item.id === created.item.id);
      assert.equal(listed.official, false);
      assert.equal(listed.title, "创作者场景抽取提示词（已编辑）");
      assert.equal(listed.priceCredits, 25);
      assert.equal(listed.contentVisible, false);
      assert.equal(Object.prototype.hasOwnProperty.call(listed, "content"), false);

      const pagedCatalogResponse = await fetch(`${server.origin}/api/creator/prompt-marketplace?page=999&page_size=1`, {
        headers: { cookie: buyerCookie },
      });
      const pagedCatalog = await pagedCatalogResponse.json();
      assert.equal(pagedCatalogResponse.status, 200);
      assert.equal(pagedCatalog.pagination.page, pagedCatalog.pagination.totalPages || 1);
      assert.equal(pagedCatalog.pagination.pageSize, 1);
      assert.equal(pagedCatalog.items.length <= 1, true);
      assert.ok(Array.isArray(pagedCatalog.ranking));
      assert.equal(pagedCatalog.ranking.length <= 20, true);

      const purchaseResponse = await fetch(`${server.origin}/api/creator/prompt-marketplace/items/${created.item.id}/purchase`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: buyerCookie },
        body: "{}",
      });
      assert.equal(purchaseResponse.status, 200);
      const added = await purchaseResponse.json();
      const buyerBalance = await db.query<{ balance: number | string }>(
        "SELECT credit_balance_cached AS balance FROM users WHERE phone_e164 = $1",
        [normalizeCnPhone("13800138202")],
      );
      assert.equal(added.priceCredits, 0);
      assert.equal(Number(buyerBalance.rows[0]?.balance ?? 0), 0);
      const libraryResponse = await fetch(`${server.origin}/api/creator/prompt-marketplace/library`, {
        headers: { cookie: buyerCookie },
      });
      const library = await libraryResponse.json();
      const purchased = library.items.find((item: { id: string }) => item.id === created.item.id);
      assert.equal(purchased.purchased, true);
      assert.equal(Object.prototype.hasOwnProperty.call(purchased, "content"), false);

      const skillCatalogResponse = await fetch(`${server.origin}/api/creator/prompt-skills/catalog?category=scene_extract&page=1&pageSize=1`, {
        headers: { cookie: buyerCookie },
      });
      const skillCatalog = await skillCatalogResponse.json();
      assert.equal(skillCatalogResponse.status, 200);
      assert.equal(skillCatalog.pagination.pageSize, 1);
      assert.equal(Object.prototype.hasOwnProperty.call(skillCatalog, "ranking"), false);
      assert.equal(skillCatalog.items.every((item: Record<string, unknown>) => !Object.prototype.hasOwnProperty.call(item, "content")), true);
      assert.equal(typeof skillCatalog.categoryCounts.scene_extract, "number");

      const skillLibraryResponse = await fetch(`${server.origin}/api/creator/prompt-skills/library?category=scene_extract&query=${encodeURIComponent("创作者")}&page=99&page_size=1`, {
        headers: { cookie: buyerCookie },
      });
      const skillLibrary = await skillLibraryResponse.json();
      assert.equal(skillLibraryResponse.status, 200);
      assert.equal(skillLibrary.pagination.page, skillLibrary.pagination.totalPages || 1);
      assert.equal(skillLibrary.pagination.pageSize, 1);
      assert.equal(skillLibrary.items.some((item: { id: string }) => item.id === created.item.id), true);
      assert.equal(Object.prototype.hasOwnProperty.call(skillLibrary.items[0], "content"), false);
    } finally {
      await server.close();
    }
  });

  it("exposes enabled image prompt styles as project styles to authenticated creators", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const stylesResponse = await fetch(
        `${server.origin}/api/creator/project-styles?status=enabled&pageSize=500`,
        { headers: { cookie } },
      );
      const envelope = await stylesResponse.json();

      assert.equal(stylesResponse.status, 200, JSON.stringify(envelope));
      assert.ok(Array.isArray(envelope.styles));
      assert.ok(envelope.styles.some((item: { code?: string }) => item.code === "animation"));
      assert.ok(envelope.styles.some((item: { name?: string }) => item.name));
      assert.ok(envelope.styles.some((item: { coverImageUrl?: string }) => item.coverImageUrl?.startsWith("/api/public/style-covers/")));
      assert.ok(envelope.styles.some((item: { prompt_content?: string }) => item.prompt_content?.includes("二次元")));
      assert.equal(envelope.styles.every((item: { status?: string }) => item.status === "enabled"), true);
    } finally {
      await server.close();
    }
  });

  it("creates and updates project members through the project-scoped team API", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138001");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "team-member-project-create",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "Team member create",
          scriptInput: "Episode 1: create project member.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "team-member-create-1",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            phone: "13800138002",
            role: "creator",
            note: "storyboard-collab",
          }),
        },
      );
      const createdMember = await createMemberResponse.json();

      const updateMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "team-member-create-2",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            phone: "13800138002",
            role: "viewer",
            note: "readonly-review",
          }),
        },
      );
      const updatedMember = await updateMemberResponse.json();

      const listMembersResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members`,
        {
          headers: {
            cookie: ownerCookie,
          },
        },
      );
      const listedMembers = await listMembersResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createMemberResponse.status, 200, JSON.stringify(createdMember));
      assert.equal(createdMember.member.phone, "+8613800138002");
      assert.equal(createdMember.member.role, "creator");
      assert.equal(createdMember.member.note, "storyboard-collab");

      assert.equal(updateMemberResponse.status, 200);
      assert.equal(updatedMember.member.phone, "+8613800138002");
      assert.equal(updatedMember.member.role, "viewer");
      assert.equal(updatedMember.member.note, "readonly-review");

      assert.equal(listMembersResponse.status, 200);
      assert.equal(
        listedMembers.members.some(
          (member: { phone?: string; role?: string; note?: string }) =>
            member.phone === "+8613800138002" &&
            member.role === "viewer" &&
            member.note === "readonly-review",
        ),
        true,
      );
    } finally {
      await server.close();
    }
  });

  it("patches member role, note, and status through the member-scoped team API", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138001");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "team-member-patch-project-create",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "Team member patch",
          scriptInput: "Episode 1: patch team member.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "team-member-patch-create",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            phone: "13800138004",
            role: "creator",
            note: "new-member",
          }),
        },
      );
      const createdMember = await createMemberResponse.json();
      assert.equal(createMemberResponse.status, 200, JSON.stringify(createdMember));
      const memberId = createdMember.member.id;

      const patchMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            role: "producer",
            note: "producer-updated",
            status: "disabled",
          }),
        },
      );
      const patchedMember = await patchMemberResponse.json();

      const restoreMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            status: "active",
          }),
        },
      );
      const restoredMember = await restoreMemberResponse.json();

      assert.equal(patchMemberResponse.status, 200);
      assert.equal(patchedMember.member.role, "producer");
      assert.equal(patchedMember.member.note, "producer-updated");
      assert.equal(patchedMember.member.status, "disabled");

      assert.equal(restoreMemberResponse.status, 200);
      assert.equal(restoredMember.member.status, "enabled");
    } finally {
      await server.close();
    }
  });

  it("persists and reloads asset conversation history by selected asset id", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138006");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-conversation-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Asset conversation persistence",
          scriptInput: "Episode 1: persist selected asset history.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-conversation-episode-create",
            cookie,
          },
          body: JSON.stringify({ title: "Episode 1" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "role",
            name: "废土主角",
            description: "疲惫，警惕，穿破旧夹克。",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const deleteProjectedFailureResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages/asset-image-projected-failure?mediaMode=image`,
        {
          method: "DELETE",
          headers: { cookie },
        },
      );
      const deleteProjectedFailureEnvelope = await deleteProjectedFailureResponse.json();
      const replayProjectedFailureResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [{
              turnId: "asset-image-projected-failure",
              messageKey: "asset-image-projected-failure:result",
              messageType: "result",
              taskId: "asset-image-projected-failure",
              status: "failed",
              payload: {
                taskId: "asset-image-projected-failure",
                assetId,
                mediaKind: "image",
                promptPreview: "迟到的任务投影不得恢复已经删除的失败记录。",
                failureCode: "provider_submission_failed",
              },
            }],
          }),
        },
      );
      const replayProjectedFailureEnvelope = await replayProjectedFailureResponse.json();
      const repeatDeleteProjectedFailureResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages/asset-image-projected-failure?mediaMode=image`,
        {
          method: "DELETE",
          headers: { cookie },
        },
      );
      const repeatDeleteProjectedFailureEnvelope = await repeatDeleteProjectedFailureResponse.json();

      assert.equal(deleteProjectedFailureResponse.status, 200);
      assert.equal(deleteProjectedFailureEnvelope.data.deleted, true);
      assert.equal(deleteProjectedFailureEnvelope.data.deletedCount, 0);
      assert.deepEqual(deleteProjectedFailureEnvelope.data.entries, []);
      assert.equal(replayProjectedFailureResponse.status, 200);
      assert.deepEqual(replayProjectedFailureEnvelope.data.entries, []);
      assert.equal(repeatDeleteProjectedFailureResponse.status, 200);
      assert.equal(repeatDeleteProjectedFailureEnvelope.data.deleted, true);
      assert.equal(repeatDeleteProjectedFailureEnvelope.data.deletedCount, 0);

      const appendConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            responseMode: "delta",
            messages: [
              {
                turnId: "asset-image-turn-1",
                messageKey: "asset-image-turn-1:user_request",
                messageType: "user_request",
                 payload: {
                   assetId,
                   mediaKind: "image",
                   selectedModelId: "global-ai-opc-gpt-image-2",
                   modelLabel: "global-ai-opc-gpt-image-2",
                   promptPreview: "瘦削，警惕，穿破旧夹克，肩背磨损背包。",
                  quickReferenceItems: [],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-image-turn-1",
                messageKey: "asset-image-turn-1:result",
                messageType: "result",
                taskId: "asset-image-task-1",
                status: "completed",
                 payload: {
                   assetId,
                   mediaKind: "image",
                   model: "global-ai-opc-gpt-image-2",
                   promptPreview: "瘦削，警惕，穿破旧夹克，肩背磨损背包。",
                  status: "completed",
                  taskId: "asset-image-task-1",
                  fixedImages: [
                    {
                      id: "asset-image-result-1",
                      label: "角色图片",
                      url: "https://example.com/asset-image-result-1.png",
                    },
                  ],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
            ],
          }),
        },
      );
      const appendConversationEnvelope = await appendConversationResponse.json();

      const appendVideoConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "video",
            responseMode: "delta",
            messages: [
              {
                turnId: "asset-video-turn-1",
                messageKey: "asset-video-turn-1:user_request",
                messageType: "user_request",
                payload: {
                  assetId,
                  mediaKind: "video",
                  promptPreview: "瘦削角色在废土街口回头，镜头缓慢推进。",
                  quickReferenceItems: [
                    {
                      id: "reference-image-1",
                      kind: "image",
                      url: "https://example.com/reference-image-1.png",
                      composerOrder: 1,
                      debugBlob: "not-needed-in-light-history",
                    },
                  ],
                  attachmentItems: [
                    {
                      id: "attachment-image-1",
                      kind: "image",
                      url: "https://example.com/attachment-image-1.png",
                      rawProviderPayload: "not-needed-in-light-history",
                    },
                    {
                      id: "attachment-audio-1",
                      kind: "audio",
                      audioUrl: "https://example.com/attachment-audio-1.mp3",
                      composerOrder: 2,
                    },
                  ],
                  mentionReferences: [
                    {
                      id: "mention-ref:audio:attachment-audio-1",
                      referenceId: "mention-ref:audio:attachment-audio-1",
                      assetId: "attachment-audio-1",
                      kind: "audio",
                      name: "音频1",
                      token: "【@音频1】",
                    },
                  ],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-video-turn-1",
                messageKey: "asset-video-turn-1:result",
                messageType: "result",
                taskId: "asset-video-task-1",
                status: "completed",
                payload: {
                  assetId,
                  mediaKind: "video",
                  promptPreview: "瘦削角色在废土街口回头，镜头缓慢推进。",
                  status: "completed",
                  taskId: "asset-video-task-1",
                  fixedVideos: [
                    {
                      id: "asset-video-result-1",
                      label: "角色视频",
                      url: "https://example.com/asset-video-result-1.mp4",
                      rawProviderPayload: "not-needed-in-light-history",
                    },
                  ],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
            ],
          }),
        },
      );
      const appendVideoConversationEnvelope = await appendVideoConversationResponse.json();

      const appendSecondImageConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            responseMode: "delta",
            messages: [
              {
                turnId: "asset-image-turn-2",
                messageKey: "asset-image-turn-2:user_request",
                messageType: "user_request",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "瘦削角色站在废土街口，晨光从身后照来。",
                },
              },
              {
                turnId: "asset-image-turn-2",
                messageKey: "asset-image-turn-2:result",
                messageType: "result",
                taskId: "asset-image-task-2",
                status: "completed",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "瘦削角色站在废土街口，晨光从身后照来。",
                  status: "completed",
                  taskId: "asset-image-task-2",
                  fixedImages: [
                    {
                      id: "asset-image-result-2",
                      label: "角色图片 2",
                      url: "https://example.com/asset-image-result-2.png",
                    },
                  ],
                },
              },
            ],
          }),
        },
      );
      const appendSecondImageConversationEnvelope = await appendSecondImageConversationResponse.json();

      const getConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation?mediaMode=image`,
        {
          headers: { cookie },
        },
      );
      const getConversationEnvelope = await getConversationResponse.json();

      const getLightImageConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation?mediaMode=image&includeMessages=0`,
        {
          headers: { cookie },
        },
      );
      const getLightImageConversationEnvelope = await getLightImageConversationResponse.json();

      const getLightVideoConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation?mediaMode=video&includeMessages=0`,
        {
          headers: { cookie },
        },
      );
      const getLightVideoConversationEnvelope = await getLightVideoConversationResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(appendConversationResponse.status, 200);
      assert.equal(appendVideoConversationResponse.status, 200);
      assert.equal(appendSecondImageConversationResponse.status, 200);
      assert.equal(getConversationResponse.status, 200);
      assert.equal(getLightImageConversationResponse.status, 200);
      assert.equal(getLightVideoConversationResponse.status, 200);
      assert.equal(appendConversationEnvelope.data.entries.length, 1);
      assert.equal(appendConversationEnvelope.data.entries[0].modelLabel, "GPT Image 2（GlobalAiOpc）");
      assert.equal(JSON.stringify(appendConversationEnvelope.data).includes("global-ai-opc-gpt-image-2"), false);
      assert.equal(appendVideoConversationEnvelope.data.entries.length, 1);
      assert.equal(appendSecondImageConversationEnvelope.data.entries.length, 1);
      assert.equal(appendSecondImageConversationEnvelope.data.entries[0].taskId, "asset-image-task-2");
      assert.equal(getConversationEnvelope.data.entries.length, 2);
      assert.equal(JSON.stringify(getConversationEnvelope.data).includes("global-ai-opc-gpt-image-2"), false);
      assert.equal(JSON.stringify(getLightImageConversationEnvelope.data).includes("global-ai-opc-gpt-image-2"), false);
      const firstImageEntry = getConversationEnvelope.data.entries.find(
        (entry: { taskId: string }) => entry.taskId === "asset-image-task-1",
      );
      assert.equal(firstImageEntry.status, "completed");
      assert.equal(
        firstImageEntry.promptPreview,
        "瘦削，警惕，穿破旧夹克，肩背磨损背包。",
      );
      assert.equal(
        firstImageEntry.fixedImages[0].url,
        "https://example.com/asset-image-result-1.png",
      );
      assert.deepEqual(getLightImageConversationEnvelope.data.messages, []);
      assert.equal(getLightImageConversationEnvelope.data.entries.length, 2);
      const firstLightImageEntry = getLightImageConversationEnvelope.data.entries.find(
        (entry: { taskId: string }) => entry.taskId === "asset-image-task-1",
      );
      assert.equal(firstLightImageEntry.mediaKind, "image");
      assert.equal(
        firstLightImageEntry.fixedImages[0].url,
        "https://example.com/asset-image-result-1.png",
      );
      assert.deepEqual(getLightVideoConversationEnvelope.data.messages, []);
      assert.equal(getLightVideoConversationEnvelope.data.entries[0].mediaKind, "video");
      assert.equal(getLightVideoConversationEnvelope.data.entries[0].taskId, "asset-video-task-1");
      assert.equal(
        getLightVideoConversationEnvelope.data.entries[0].fixedVideos[0].url,
        "https://example.com/asset-video-result-1.mp4",
      );
      assert.equal(getLightVideoConversationEnvelope.data.entries[0].quickReferenceItems[0].debugBlob, undefined);
      assert.equal(getLightVideoConversationEnvelope.data.entries[0].quickReferenceItems[0].composerOrder, 1);
      assert.equal(getLightVideoConversationEnvelope.data.entries[0].attachmentItems[0].rawProviderPayload, undefined);
      assert.equal(
        getLightVideoConversationEnvelope.data.entries[0].attachmentItems[1].audioUrl,
        "https://example.com/attachment-audio-1.mp3",
      );
      assert.equal(getLightVideoConversationEnvelope.data.entries[0].attachmentItems[1].composerOrder, 2);
      assert.equal(getLightVideoConversationEnvelope.data.entries[0].mentionReferences[0].name, "音频1");
      assert.equal(getLightVideoConversationEnvelope.data.entries[0].fixedVideos[0].rawProviderPayload, undefined);
    } finally {
      await server.close();
    }
  });

  it("deletes only the requested asset conversation turn and keeps the remaining history", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138007");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-conversation-delete-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Asset conversation delete",
          scriptInput: "Episode 1: delete only one persisted asset result.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-conversation-delete-episode-create",
            cookie,
          },
          body: JSON.stringify({ title: "Episode 1" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "role",
            name: "废土主角",
            description: "疲惫，警惕，穿破旧夹克。",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const appendConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [
              {
                turnId: "asset-image-task-1",
                messageKey: "asset-image-task-1:user_request",
                messageType: "user_request",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "第一条：补强破旧夹克和肩背磨损。",
                  quickReferenceItems: [],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-image-task-1",
                messageKey: "asset-image-task-1:result",
                messageType: "result",
                taskId: "asset-image-task-1",
                status: "completed",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "第一条：补强破旧夹克和肩背磨损。",
                  fixedImages: [
                    {
                      id: "asset-image-result-1",
                      label: "角色图片",
                      url: "https://example.com/asset-image-result-1.png",
                    },
                  ],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-image-task-2",
                messageKey: "asset-image-task-2:user_request",
                messageType: "user_request",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "第二条：补强眼神和面部风尘细节。",
                  quickReferenceItems: [],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-image-task-2",
                messageKey: "asset-image-task-2:result",
                messageType: "result",
                taskId: "asset-image-task-2",
                status: "completed",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "第二条：补强眼神和面部风尘细节。",
                  fixedImages: [
                    {
                      id: "asset-image-result-2",
                      label: "角色图片",
                      url: "https://example.com/asset-image-result-2.png",
                    },
                  ],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-image-turn-with-payload-task-id",
                messageKey: "asset-image-turn-with-payload-task-id:user_request",
                messageType: "user_request",
                status: "failed",
                payload: {
                  taskId: "asset-image-payload-task-id",
                  assetId,
                  mediaKind: "image",
                  promptPreview: "第三条：任务编号仅存在于消息载荷。",
                  quickReferenceItems: [],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
            ],
          }),
        },
      );
      const appendConversationEnvelope = await appendConversationResponse.json();

      const deletePayloadTaskConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages/asset-image-payload-task-id?mediaMode=image`,
        {
          method: "DELETE",
          headers: { cookie },
        },
      );
      const deletePayloadTaskConversationEnvelope = await deletePayloadTaskConversationResponse.json();
      const replayPayloadTaskConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [{
              turnId: "asset-image-turn-with-payload-task-id",
              messageKey: "asset-image-turn-with-payload-task-id:user_request",
              messageType: "user_request",
              status: "failed",
              payload: {
                taskId: "asset-image-payload-task-id",
                assetId,
                mediaKind: "image",
                promptPreview: "轮询不得恢复载荷任务编号已删除的记录。",
              },
            }],
          }),
        },
      );
      const replayPayloadTaskConversationEnvelope = await replayPayloadTaskConversationResponse.json();

      const deleteConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages/asset-image-task-1?mediaMode=image`,
        {
          method: "DELETE",
          headers: {
            cookie,
          },
        },
      );
      const deleteConversationEnvelope = await deleteConversationResponse.json();

      const replayDeletedConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [
              {
                turnId: "asset-image-task-1",
                messageKey: "asset-image-task-1:result",
                messageType: "result",
                taskId: "asset-image-task-1",
                status: "completed",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "轮询不得恢复已经删除的第一条记录。",
                  fixedImages: [{
                    id: "asset-image-result-1",
                    label: "角色图片",
                    url: "https://example.com/generated-result-must-stay-deleted.png",
                  }],
                },
              },
            ],
          }),
        },
      );
      const replayDeletedConversationEnvelope = await replayDeletedConversationResponse.json();

      const getConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation?mediaMode=image`,
        {
          headers: { cookie },
        },
      );
      const getConversationEnvelope = await getConversationResponse.json();

      const getConversationSummaryResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation?mediaMode=image&includeMessages=0`,
        {
          headers: { cookie },
        },
      );
      const getConversationSummaryEnvelope = await getConversationSummaryResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(appendConversationResponse.status, 200, JSON.stringify(appendConversationEnvelope));
      assert.equal(deletePayloadTaskConversationResponse.status, 200);
      assert.equal(deletePayloadTaskConversationEnvelope.data.deleted, true);
      assert.equal(deletePayloadTaskConversationEnvelope.data.deletedCount, 1);
      assert.equal(deletePayloadTaskConversationEnvelope.data.entries.length, 2);
      assert.equal(replayPayloadTaskConversationResponse.status, 200);
      assert.equal(replayPayloadTaskConversationEnvelope.data.entries.length, 2);
      assert.equal(deleteConversationResponse.status, 200);
      assert.equal(replayDeletedConversationResponse.status, 200);
      assert.equal(getConversationResponse.status, 200);
      assert.equal(getConversationSummaryResponse.status, 200);
      assert.equal(deleteConversationEnvelope.data.deleted, true);
      assert.equal(deleteConversationEnvelope.data.deletedCount, 2);
      assert.equal(deleteConversationEnvelope.data.entries.length, 1);
      assert.equal(deleteConversationEnvelope.data.entries[0].taskId, "asset-image-task-2");
      assert.equal(replayDeletedConversationEnvelope.data.entries.length, 1);
      assert.equal(replayDeletedConversationEnvelope.data.entries[0].taskId, "asset-image-task-2");
      assert.equal(getConversationEnvelope.data.entries.length, 1);
      assert.equal(getConversationEnvelope.data.entries[0].taskId, "asset-image-task-2");
      assert.equal(getConversationSummaryEnvelope.data.entries.length, 1);
      assert.equal(getConversationSummaryEnvelope.data.entries[0].taskId, "asset-image-task-2");
      assert.equal(
        getConversationEnvelope.data.entries[0].promptPreview,
        "第二条：补强眼神和面部风尘细节。",
      );

      const deleteLastConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages/asset-image-task-2?mediaMode=image`,
        {
          method: "DELETE",
          headers: { cookie },
        },
      );
      const deleteLastConversationEnvelope = await deleteLastConversationResponse.json();
      const replayLastDeletedConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [{
              turnId: "asset-image-task-2",
              messageKey: "asset-image-task-2:result",
              messageType: "result",
              taskId: "asset-image-task-2",
              status: "completed",
              payload: {
                assetId,
                mediaKind: "image",
                promptPreview: "最后一条删除后也不能被轮询恢复。",
                fixedImages: [{
                  id: "asset-image-result-2",
                  label: "角色图片 2",
                  url: "https://example.com/last-deleted-result-must-not-return.png",
                }],
              },
            }],
          }),
        },
      );
      const replayLastDeletedConversationEnvelope = await replayLastDeletedConversationResponse.json();
      const getEmptyConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation?mediaMode=image`,
        { headers: { cookie } },
      );
      const getEmptyConversationEnvelope = await getEmptyConversationResponse.json();
      const getEmptyConversationSummaryResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation?mediaMode=image&includeMessages=0`,
        { headers: { cookie } },
      );
      const getEmptyConversationSummaryEnvelope = await getEmptyConversationSummaryResponse.json();

      assert.equal(deleteLastConversationResponse.status, 200);
      assert.equal(deleteLastConversationEnvelope.data.deleted, true);
      assert.equal(deleteLastConversationEnvelope.data.deletedCount, 2);
      assert.equal(replayLastDeletedConversationResponse.status, 200);
      assert.equal(replayLastDeletedConversationEnvelope.data.entries.length, 0);
      assert.equal(getEmptyConversationResponse.status, 200);
      assert.equal(getEmptyConversationEnvelope.data.entries.length, 0);
      assert.equal(getEmptyConversationSummaryResponse.status, 200);
      assert.equal(getEmptyConversationSummaryEnvelope.data.entries.length, 0);
    } finally {
      await server.close();
    }
  });

  it("maps asset generation task responses back to the asset and preserves snapshot selection context", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138009");
      await seedGenerationAccessForPhone(db, "13800138009");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-task-map-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Asset task mapping",
          scriptInput: "Episode 1: keep task result attached to the original asset.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(`${server.origin}/api/projects/${projectId}/episodes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-task-map-episode-create",
          cookie,
        },
        body: JSON.stringify({ title: "Episode 1" }),
      });
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(`${server.origin}/api/episodes/${episodeId}/assets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          assetType: "scene",
          name: "城外战场尸骸地",
          description: "尸骸遍地，阴云压顶。",
        }),
      });
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const taskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-task-map-image-task",
          cookie,
        },
        body: JSON.stringify({
          model: "nano_banana_2",
          prompt: "尸骸遍地，阴云压顶。",
          targetType: "asset",
          targetId: assetId,
          parameters: {
            selectionContext: {
              assetTab: "scene",
              selectedAssetId: assetId,
              selectedAssetName: "城外战场尸骸地",
            },
          },
        }),
      });
      const taskEnvelope = await taskResponse.json();
      const taskId = taskEnvelope.data.taskId;

      const getTaskResponse = await fetch(`${server.origin}/api/generation-tasks/${taskId}`, {
        headers: { cookie },
      });
      const getTaskEnvelope = await getTaskResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(taskResponse.status, 200);
      assert.equal(getTaskResponse.status, 200);
      assert.equal(getTaskEnvelope.data.assetId, assetId);
      assert.equal(getTaskEnvelope.data.targetType, "asset");
      assert.equal(getTaskEnvelope.data.targetId, assetId);
      assert.equal(getTaskEnvelope.data.selectionContext.selectedAssetId, assetId);
      assert.equal(getTaskEnvelope.data.selectionContext.assetTab, "scene");
    } finally {
      await server.close();
    }
  });

  it("normalizes asset conversation failure statuses without dropping failure payloads", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138010");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-conversation-failure-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Asset conversation failure persistence",
          scriptInput: "Episode 1: persist batch image failure details.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(`${server.origin}/api/projects/${projectId}/episodes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-conversation-failure-episode-create",
          cookie,
        },
        body: JSON.stringify({ title: "Episode 1" }),
      });
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(`${server.origin}/api/episodes/${episodeId}/assets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          assetType: "role",
          name: "任小草",
          description: "疲惫但强硬。",
        }),
      });
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const appendConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [
              {
                turnId: "asset-image-failure-turn-1",
                messageKey: "asset-image-failure-turn-1:result",
                messageType: "result",
                taskId: "asset-image-task-failure-1",
                status: "manual_review_required",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "角色固定图。",
                  status: "manual_review_required",
                  taskId: "asset-image-task-failure-1",
                  failureCode: "provider_result_unknown",
                  failure: {
                    displayMessage: "需要人工复核",
                    providerRequestId: "req-failure-1",
                    details: {
                      raw: "timeout",
                    },
                  },
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "任小草",
                  },
                },
              },
            ],
          }),
        },
      );
      const appendConversationEnvelope = await appendConversationResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(appendConversationResponse.status, 200);
      assert.equal(appendConversationEnvelope.data.entries.length, 1);
      assert.equal(appendConversationEnvelope.data.entries[0].status, "failed");
      assert.equal(appendConversationEnvelope.data.entries[0].failureCode, "provider_result_unknown");
      assert.equal(appendConversationEnvelope.data.entries[0].failure.providerRequestId, "req-failure-1");
      assert.deepEqual(appendConversationEnvelope.data.entries[0].failure.details, {
        raw: "timeout",
      });
    } finally {
      await server.close();
    }
  });

  it("deletes a project that has persisted asset conversation history", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138016");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-conversation-delete-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Delete project with persisted asset conversation",
          scriptInput: "Episode 1: Delete a project after asset conversation persistence.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-conversation-delete-project-episode-create",
            cookie,
          },
          body: JSON.stringify({ title: "Episode delete project" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "role",
            name: "删除测试角色",
            description: "用于项目删除回归测试。",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const appendConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [
              {
                turnId: "delete-project-turn-1",
                messageKey: "delete-project-turn-1:user_request",
                messageType: "user_request",
                payload: {
                  promptPreview: "删除项目回归测试提示词",
                },
              },
            ],
          }),
        },
      );

      const deleteProjectResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId }),
      });
      const deletedProject = await deleteProjectResponse.json();
      const conversationRowsAfterDelete = await db.query<{ count: number | string }>(
        `
          SELECT count(*)::int AS count
          FROM episode_asset_conversation_threads
          WHERE project_id = $1
        `,
        [projectId],
      );

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(appendConversationResponse.status, 200);
      assert.equal(deleteProjectResponse.status, 200);
      assert.equal(deletedProject.deleted, true);
      assert.equal(deletedProject.projectId, projectId);
      assert.equal(Number(conversationRowsAfterDelete.rows[0]?.count ?? -1), 0);
    } finally {
      await server.close();
    }
  });

  it("deletes a project that has episode generation credit reservations", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138017");
      await seedGenerationAccessForPhone(db, "13800138017");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "delete-project-with-credit-reservations-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Delete project with credit reservations",
          scriptInput: "Episode 1: create generation task then delete project.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode with reservation" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const generationResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "delete-project-with-credit-reservations-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "generate before deleting project",
            model: "nano_banana_2",
          }),
        },
      );
      const generationEnvelope = await generationResponse.json();
      const taskId = generationEnvelope.data.taskId;

      const reservationRows = await db.query<{ count: number | string }>(
        `
          SELECT count(*)::int AS count
          FROM credit_reservations
          WHERE project_id = $1
            AND task_id = $2
        `,
        [projectId, taskId],
      );

      const deleteProjectResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId }),
      });
      const deletedProject = await deleteProjectResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(generationResponse.status, 200);
      assert.equal(Number(reservationRows.rows[0]?.count ?? 0) > 0, true);
      assert.equal(deleteProjectResponse.status, 200);
      assert.equal(deletedProject.deleted, true);
      assert.equal(deletedProject.projectId, projectId);
    } finally {
      await server.close();
    }
  });

  it("deletes a project even when a shot references one of its episodes through another project id", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138018");

      const createProjectOneResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "delete-project-mismatched-shot-project-1",
          cookie,
        },
        body: JSON.stringify({
          name: "Delete project with mismatched shot project",
          scriptInput: "Episode 1: create a storyboard before deleting the project.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProjectOne = await createProjectOneResponse.json();
      const projectOneId = createdProjectOne.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectOneId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode with mismatched shot project" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          title: "Mismatched project shot",
          episodeId,
        }),
      });
      const createdShot = await createShotResponse.json();
      const shotId = createdShot.shot.id;

      const createProjectTwoResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "delete-project-mismatched-shot-project-2",
          cookie,
        },
        body: JSON.stringify({
          name: "Sibling project for mismatched shot",
          scriptInput: "Episode 1: this project only exists to hold a mismatched shot row.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProjectTwo = await createProjectTwoResponse.json();
      const projectTwoId = createdProjectTwo.project.id;

      await db.query(
        `
          UPDATE shots
          SET project_id = $3
          WHERE id = $1
            AND project_id = $2
        `,
        [shotId, projectOneId, projectTwoId],
      );

      const deleteProjectResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId: projectOneId }),
      });
      const deletedProject = await deleteProjectResponse.json();

      const remainingShotRows = await db.query<{ count: number | string }>(
        `
          SELECT count(*)::int AS count
          FROM shots
          WHERE id = $1
        `,
        [shotId],
      );

      assert.equal(createProjectOneResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createShotResponse.status, 200);
      assert.equal(createProjectTwoResponse.status, 200);
      assert.equal(deleteProjectResponse.status, 200);
      assert.equal(deletedProject.deleted, true);
      assert.equal(deletedProject.projectId, projectOneId);
      assert.equal(Number(remainingShotRows.rows[0]?.count ?? 0), 0);
    } finally {
      await server.close();
    }
  });

  it("rejects creating a shot when the episode belongs to another selected project", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138019");

      const createProjectOneResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "create-shot-foreign-episode-project-1",
          cookie,
        },
        body: JSON.stringify({
          name: "Source episode project",
          scriptInput: "Episode 1: keep this episode in another project.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProjectOne = await createProjectOneResponse.json();
      const projectOneId = createdProjectOne.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectOneId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Foreign episode" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createProjectTwoResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "create-shot-foreign-episode-project-2",
          cookie,
        },
        body: JSON.stringify({
          name: "Selected project",
          scriptInput: "Episode 1: this becomes the active selected project.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      await createProjectTwoResponse.json();

      const createShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          title: "Should not be created",
          episodeId,
        }),
      });
      const createShotBody = await createShotResponse.json();

      assert.equal(createProjectOneResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createProjectTwoResponse.status, 200);
      assert.equal(createShotResponse.status, 404);
      assert.equal(createShotBody.error, "episode_not_found");
    } finally {
      await server.close();
    }
  });

  it("deletes a project that has a completed upload session record", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138020");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "delete-project-with-upload-record-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Delete project with upload record",
          scriptInput: "Episode 1: upload something then delete the project.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const upload = await prepareDirectUpload(server.origin, cookie, projectId, {
        purpose: "asset-import/scene",
        fileName: "project-delete-upload.png",
        contentType: "image/png",
        body: directUploadPngBytes(5),
      });

      const uploadRowsBeforeDelete = await db.query<{ count: number | string }>(
        `
          SELECT count(*)::int AS count
          FROM project_upload_records
          WHERE project_id = $1
            AND upload_session_id = $2
        `,
        [projectId, upload.uploadSessionId],
      );

      const deleteProjectResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId }),
      });
      const deletedProject = await deleteProjectResponse.json();

      const remainingUploadRows = await db.query<{ count: number | string }>(
        `
          SELECT count(*)::int AS count
          FROM project_upload_records
          WHERE project_id = $1
        `,
        [projectId],
      );

      assert.equal(createProjectResponse.status, 200);
      assert.equal(Number(uploadRowsBeforeDelete.rows[0]?.count ?? 0), 1);
      assert.equal(deleteProjectResponse.status, 200);
      assert.equal(deletedProject.deleted, true);
      assert.equal(deletedProject.projectId, projectId);
      assert.equal(Number(remainingUploadRows.rows[0]?.count ?? 0), 0);
    } finally {
      await server.close();
    }
  });

  it("persists episode asset create, update, list, and delete through the episode workbench APIs", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138000"));
      await seedActiveGenerationMembership(db, { userId });

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-asset-crud-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode asset CRUD",
          scriptInput: "Episode 1: Persist episode assets and voices.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-asset-crud-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Asset CRUD" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "role",
            name: "废土主角",
            description: "初始角色设定",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const createBlankAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "role",
            name: "空白角色",
          }),
        },
      );
      const createBlankAssetEnvelope = await createBlankAssetResponse.json();
      const blankAssetId = createBlankAssetEnvelope.data.asset.assetId;

      const listAfterCreateResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets?assetType=role&page=1&pageSize=20`,
        { headers: { cookie } },
      );
      const listAfterCreateEnvelope = await listAfterCreateResponse.json();
      const workbenchAfterCreateResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/workbench`,
        { headers: { cookie } },
      );
      const workbenchAfterCreateEnvelope = await workbenchAfterCreateResponse.json();

      const updateAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            description: "更新后的角色设定",
            voiceId: "voice-wasteland-01",
            voiceName: "冷峻低音",
            voiceSource: "custom",
            dubbingConfig: {
              style: "calm",
              audioUrl: "/uploads/voice-wasteland-01.mp3",
            },
          }),
        },
      );
      const updateAssetEnvelope = await updateAssetResponse.json();

      const deleteAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const deleteAssetEnvelope = await deleteAssetResponse.json();

      const listAfterDeleteResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets?assetType=role&page=1&pageSize=20`,
        { headers: { cookie } },
      );
      const listAfterDeleteEnvelope = await listAfterDeleteResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(createAssetEnvelope.data.asset.assetType, "role");
      assert.equal(createAssetEnvelope.data.asset.name, "废土主角");
      assert.equal(createAssetEnvelope.data.asset.description, "初始角色设定");
      assert.equal(createBlankAssetResponse.status, 200);
      assert.equal(createBlankAssetEnvelope.data.asset.description, "");
      assert.equal(listAfterCreateResponse.status, 200);
      assert.equal(listAfterCreateEnvelope.data.items.length, 2);
      assert.deepEqual(
        listAfterCreateEnvelope.data.items.map((item: { assetId: string }) => item.assetId),
        [assetId, blankAssetId],
      );
      assert.ok(listAfterCreateEnvelope.data.items.some((item: { assetId: string }) => item.assetId === assetId));
      assert.equal(
        listAfterCreateEnvelope.data.items.find((item: { assetId: string }) => item.assetId === blankAssetId)?.description,
        "",
      );
      assert.equal(workbenchAfterCreateResponse.status, 200);
      assert.equal(workbenchAfterCreateEnvelope.data.episode.episodeId, episodeId);
      assert.equal(updateAssetResponse.status, 200);
      assert.equal(updateAssetEnvelope.data.asset.assetId, assetId);
      assert.equal(updateAssetEnvelope.data.asset.description, "更新后的角色设定");
      assert.equal(updateAssetEnvelope.data.asset.voiceId, "voice-wasteland-01");
      assert.equal(updateAssetEnvelope.data.asset.voiceName, "冷峻低音");
      assert.equal(updateAssetEnvelope.data.asset.voiceSource, "custom");
      assert.deepEqual(updateAssetEnvelope.data.asset.dubbingConfig, {
        style: "calm",
        audioUrl: "/uploads/voice-wasteland-01.mp3",
      });
      assert.equal(deleteAssetResponse.status, 200);
      assert.equal(deleteAssetEnvelope.data.deleted, true);
      assert.equal(listAfterDeleteResponse.status, 200);
      assert.equal(listAfterDeleteEnvelope.data.items.length, 1);
      assert.equal(listAfterDeleteEnvelope.data.items[0].assetId, blankAssetId);
    } finally {
      await server.close();
    }
  });

  it("imports assets into the current episode workbench instead of the project asset library", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-asset-import-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode asset import",
          scriptInput: "Episode 1: Import an asset into the current episode workbench.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-asset-import-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Asset Import" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-asset-import-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "asset",
            targetId: "scene-import-seed",
            assetId: "scene-import-seed",
            assetType: "scene",
            prompt: "A wasteland camp entrance at dusk",
            model: "nano_banana_2",
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();

      const importResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/import`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "scene",
            name: "钀ュ湴鍏ュ彛",
            description: "钖勯浘涓殑钀ュ湴鍏ュ彛鍦烘櫙",
            storageObjectId: imageTaskEnvelope.data.result.storageObjectId,
            mimeType: "image/avif",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const importEnvelope = await importResponse.json();

      const duplicateImportResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/import`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "scene",
            name: " 钀ュ湴鍏ュ彛 ",
            storageObjectId: imageTaskEnvelope.data.result.storageObjectId,
            mimeType: "image/avif",
          }),
        },
      );
      const duplicateImportEnvelope = await duplicateImportResponse.json();

      const listResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets?assetType=scene&page=1&pageSize=20`,
        { headers: { cookie } },
      );
      const listEnvelope = await listResponse.json();

      const detailResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/detail`,
        { headers: { cookie } },
      );
      const detailEnvelope = await detailResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200);
      assert.match(imageTaskEnvelope.data.result.imageUrl, /^https?:\/\//);
      assert.equal(importResponse.status, 200);
      assert.ok(importEnvelope.data.asset.assetId);
      assert.equal(importEnvelope.data.asset.name, "钀ュ湴鍏ュ彛");
      assert.equal(importEnvelope.data.asset.assetType, "scene");
      assert.ok(importEnvelope.data.asset.fixedImageFileId);
      assert.ok(importEnvelope.data.asset.fixedImageUrl);
      assert.equal(duplicateImportResponse.status, 409, JSON.stringify(duplicateImportEnvelope));
      assert.equal(duplicateImportEnvelope.errorCode, "ASSET_ALREADY_EXISTS");
      assert.equal(listResponse.status, 200);
      assert.ok(
        listEnvelope.data.items.some(
          (item: { assetId?: string; name?: string }) =>
            item.assetId === importEnvelope.data.asset.assetId && item.name === "钀ュ湴鍏ュ彛",
        ),
      );
      assert.equal(detailResponse.status, 200);
      assert.equal(
        detailEnvelope.data.assetsByType.scene.some(
          (asset: { label?: string }) => asset.label === "钀ュ湴鍏ュ彛",
        ),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("saves an episode asset into the project asset library with real persisted media", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const db = loginDbByOrigin.get(server.origin);
      assert.ok(db);

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-asset-library-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode asset library bridge",
          scriptInput: "Episode 1: Save an episode asset into the project asset library.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-asset-library-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Library Save" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "scene",
            name: "No-preview scene fixture",
            description: "闆ㄥ闇撹櫣搴熷琛楄",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const saveWithoutImageResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/save-to-library`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const saveWithoutImageEnvelope = await saveWithoutImageResponse.json();

      const directUpload = await prepareDirectUpload(server.origin, cookie, createdProject.project.id, {
        purpose: "episode-asset-library/scene",
        fileName: "episode-library-scene.png",
        contentType: "image/png",
        body: directUploadPngBytes(6),
      });

      const importResponse = await fetch(`${server.origin}/api/episodes/${episodeId}/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          assetType: "scene",
          name: "搴熷湡琛楄",
          description: "闆ㄥ闇撹櫣搴熷琛楄",
          uploadSessionId: directUpload.uploadSessionId,
          storageObjectId: directUpload.storageObjectId,
          mimeType: "image/png",
          width: 1024,
          height: 1024,
        }),
      });
      const importEnvelope = await importResponse.json();
      const importedAssetId = String(importEnvelope.data.asset.assetId ?? importEnvelope.data.asset.id ?? "").trim();
      assert.ok(importedAssetId);

      const importedVersion = await db.query<{
        version_id: string;
        metadata_json: Record<string, unknown> | string | null;
      }>(
        `
          SELECT v.id AS version_id, v.metadata_json
          FROM assets a
          JOIN asset_versions v
            ON v.asset_id = a.id
          WHERE a.project_id = $1
            AND a.id = $2
          ORDER BY v.version_number DESC
          LIMIT 1
        `,
        [createdProject.project.id, importedAssetId],
      );
      const importedVersionRow = importedVersion.rows[0];
      assert.ok(importedVersionRow);
      const importedMetadata =
        typeof importedVersionRow.metadata_json === "string"
          ? JSON.parse(importedVersionRow.metadata_json) as Record<string, unknown>
          : { ...(importedVersionRow.metadata_json ?? {}) };
      await db.query(
        `
          UPDATE asset_versions
          SET metadata_json = $2::jsonb
          WHERE id = $1
        `,
        [
          importedVersionRow.version_id,
          JSON.stringify({
            ...importedMetadata,
            source: "episode",
            generationTaskId: "episode-asset-task-1",
            generationStatus: "failed",
            generationResult: {
              taskId: "episode-asset-task-1",
              status: "failed",
              promptPreview: "A neon-lit wasteland street corner in the rain",
              selectionContext: {
                assetTab: "scene",
                selectedAssetId: importedAssetId,
                selectedAssetName: "搴熷湡琛楄",
              },
            },
          }),
        ],
      );

      const saveResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${importedAssetId}/save-to-library`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const saveEnvelope = await saveResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(saveWithoutImageResponse.status, 400);
      assert.equal(saveWithoutImageEnvelope.errorCode, "asset_preview_required");
      assert.equal(importResponse.status, 200);
      assert.equal(saveResponse.status, 200);
      assert.equal(saveEnvelope.data.asset.label, "搴熷湡琛楄");
      assert.equal(saveEnvelope.data.asset.assetType, "scene_reference");
      assert.ok(saveEnvelope.data.asset.previewUrl);
      const savedAssetVersion = await db.query<{
        metadata_json: Record<string, unknown> | string | null;
      }>(
        `
          SELECT v.metadata_json
          FROM assets a
          JOIN asset_versions v
            ON v.asset_id = a.id
          WHERE a.project_id = $1
            AND a.id = $2
          ORDER BY v.version_number DESC
          LIMIT 1
        `,
        [createdProject.project.id, saveEnvelope.data.asset.id],
      );
      const savedMetadataRow = savedAssetVersion.rows[0];
      assert.ok(savedMetadataRow);
      const savedMetadata =
        typeof savedMetadataRow.metadata_json === "string"
          ? JSON.parse(savedMetadataRow.metadata_json) as Record<string, unknown>
          : { ...(savedMetadataRow.metadata_json ?? {}) };
      assert.equal(savedMetadata.source, "episode");
      assert.equal(savedMetadata.generationStatus, undefined);
      assert.equal(savedMetadata.generationTaskId, undefined);
      assert.equal(savedMetadata.generationResult, undefined);
    } finally {
      await server.close();
    }
  });

  it("keeps a newly created blank episode workbench empty when the project library already has assets", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "blank-episode-assets-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Blank episode assets",
          scriptInput: "Episode 1: keep a new blank episode asset set empty.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();

      const createFirstEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "blank-episode-assets-first-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode One" }),
        },
      );
      const firstEpisodeId = (await createFirstEpisodeResponse.json()).data.episode.id;

      const createSceneResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "scene",
            name: "Library Seed Scene",
            description: "Source scene for the project library",
          }),
        },
      );
      const sceneAssetId = (await createSceneResponse.json()).data.asset.assetId;

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, firstEpisodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "blank-episode-assets-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "asset",
            targetId: sceneAssetId,
            assetId: sceneAssetId,
            assetType: "scene",
            prompt: "A project library seed scene",
            model: "nano_banana_2",
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();

      const setFixedImageResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/assets/${sceneAssetId}/set-fixed-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: imageTaskEnvelope.data.result.assetVersionId,
            storageObjectId: imageTaskEnvelope.data.result.storageObjectId,
          }),
        },
      );
      await setFixedImageResponse.json();

      const saveToLibraryResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/assets/${sceneAssetId}/save-to-library`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const saveToLibraryEnvelope = await saveToLibraryResponse.json();

      const createSecondEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "blank-episode-assets-second-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Two" }),
        },
      );
      const secondEpisodeId = (await createSecondEpisodeResponse.json()).data.episode.id;

      const [firstEpisodeSceneAssetsResponse, secondEpisodeRoleAssetsResponse, secondEpisodeSceneAssetsResponse, secondEpisodePropAssetsResponse, detailResponse] = await Promise.all([
        fetch(`${server.origin}/api/episodes/${firstEpisodeId}/assets?assetType=scene&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/episodes/${secondEpisodeId}/assets?assetType=role&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/episodes/${secondEpisodeId}/assets?assetType=scene&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/episodes/${secondEpisodeId}/assets?assetType=prop&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/projects/${createdProject.project.id}/detail`, {
          headers: { cookie },
        }),
      ]);

      const firstEpisodeSceneAssetsEnvelope = await firstEpisodeSceneAssetsResponse.json();
      const secondEpisodeRoleAssetsEnvelope = await secondEpisodeRoleAssetsResponse.json();
      const secondEpisodeSceneAssetsEnvelope = await secondEpisodeSceneAssetsResponse.json();
      const secondEpisodePropAssetsEnvelope = await secondEpisodePropAssetsResponse.json();
      const detailEnvelope = await detailResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createFirstEpisodeResponse.status, 200);
      assert.equal(createSceneResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200);
      assert.equal(setFixedImageResponse.status, 200);
      assert.equal(saveToLibraryResponse.status, 200);
      assert.equal(createSecondEpisodeResponse.status, 200);
      assert.equal(firstEpisodeSceneAssetsResponse.status, 200);
      assert.equal(secondEpisodeRoleAssetsResponse.status, 200);
      assert.equal(secondEpisodeSceneAssetsResponse.status, 200);
      assert.equal(secondEpisodePropAssetsResponse.status, 200);
      assert.equal(detailResponse.status, 200);
      assert.equal(firstEpisodeSceneAssetsEnvelope.data.items.length, 1);
      assert.equal(firstEpisodeSceneAssetsEnvelope.data.items[0].assetId, sceneAssetId);
      assert.deepEqual(secondEpisodeRoleAssetsEnvelope.data.items, []);
      assert.deepEqual(secondEpisodeSceneAssetsEnvelope.data.items, []);
      assert.deepEqual(secondEpisodePropAssetsEnvelope.data.items, []);
      assert.ok(
        detailEnvelope.data.assetsByType.scene.some(
          (asset: { id: string }) => asset.id === saveToLibraryEnvelope.data.asset.id,
        ),
      );
    } finally {
      await server.close();
    }
  });

  it("inherits an existing same-name project image when the episode asset is created", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "same-name-episode-asset-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Same-name episode asset image",
          scriptInput: "Episode 1: reuse same-name project asset images in episode tabs.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();

      const createFirstEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "same-name-episode-asset-first",
            cookie,
          },
          body: JSON.stringify({ title: "Episode One" }),
        },
      );
      const firstEpisodeId = (await createFirstEpisodeResponse.json()).data.episode.id;

      const createSourceAssetResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "scene",
            name: "任小野",
            description: "source project library image",
          }),
        },
      );
      const sourceAssetId = (await createSourceAssetResponse.json()).data.asset.assetId;

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, firstEpisodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "same-name-episode-asset-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "asset",
            targetId: sourceAssetId,
            assetId: sourceAssetId,
            assetType: "scene",
            prompt: "A reusable concept sheet for 任小野",
            model: "nano_banana_2",
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const visibleImageUrl = "https://example.com/project-library-renxiaoye.png";

      const setFixedImageResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/assets/${sourceAssetId}/set-fixed-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: imageTaskEnvelope.data.result.assetVersionId,
            storageObjectId: imageTaskEnvelope.data.result.storageObjectId,
            sourceUrl: visibleImageUrl,
            previewUrl: visibleImageUrl,
          }),
        },
      );

      const saveToLibraryResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/assets/${sourceAssetId}/save-to-library`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );

      const createSecondEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "same-name-episode-asset-second",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Two" }),
        },
      );
      const secondEpisodeId = (await createSecondEpisodeResponse.json()).data.episode.id;

      const createBlankEpisodeAssetResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "scene",
            name: "任小野",
            description: "episode-local asset should inherit the project image",
          }),
        },
      );
      const createBlankEpisodeAssetEnvelope = await createBlankEpisodeAssetResponse.json();
      const blankEpisodeAssetId = createBlankEpisodeAssetEnvelope.data.asset.assetId;

      const firstListResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/assets`,
        { headers: { cookie } },
      );
      const firstListEnvelope = await firstListResponse.json();

      const secondListResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/assets`,
        { headers: { cookie } },
      );
      const secondListEnvelope = await secondListResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createFirstEpisodeResponse.status, 200);
      assert.equal(createSourceAssetResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200);
      assert.equal(setFixedImageResponse.status, 200);
      assert.equal(saveToLibraryResponse.status, 200);
      assert.equal(createSecondEpisodeResponse.status, 200);
      assert.equal(createBlankEpisodeAssetResponse.status, 200);
      assert.equal(firstListResponse.status, 200);
      assert.equal(secondListResponse.status, 200);
      assert.equal(
        String(createBlankEpisodeAssetEnvelope.data.asset.fixedImageUrl).split("?")[0],
        visibleImageUrl,
      );
      assert.ok(createBlankEpisodeAssetEnvelope.data.asset.fixedImageFileId);
      assert.match(
        firstListResponse.headers.get("server-timing") ?? "",
        /context;dur=.*query;dur=.*hydration;dur=.*signing;dur=.*total;dur=/,
      );
      const hydratedAsset = firstListEnvelope.data.items.find(
        (asset: { assetId: string }) => asset.assetId === blankEpisodeAssetId,
      );
      const persistedHydratedAsset = secondListEnvelope.data.items.find(
        (asset: { assetId: string }) => asset.assetId === blankEpisodeAssetId,
      );
      assert.equal(String(hydratedAsset?.fixedImageUrl).split("?")[0], visibleImageUrl);
      assert.equal(String(persistedHydratedAsset?.fixedImageUrl).split("?")[0], visibleImageUrl);
      assert.ok(hydratedAsset?.fixedImageFileId);
      assert.equal(hydratedAsset?.fixedImageFileId, createBlankEpisodeAssetEnvelope.data.asset.fixedImageFileId);
      assert.equal(persistedHydratedAsset?.fixedImageFileId, hydratedAsset?.fixedImageFileId);
    } finally {
      await server.close();
    }
  });

  it("persists episode generation tasks with fixed mock media results", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-generation-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode generation persistence",
          scriptInput: "Episode 1: A fixed mock result is returned through task APIs.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Task" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          episodeId,
          title: "Episode Task Shot",
          description: "Shot used by episode generation task APIs.",
        }),
      });
      const createdShot = await createShotResponse.json();
      const storyboardId = createdShot.shot.id;
      const createUnselectedShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          episodeId,
          title: "Unselected Incomplete Shot",
          description: "This storyboard must not block selected exports.",
        }),
      });
      const createdUnselectedShot = await createUnselectedShotResponse.json();
      const unselectedStoryboardId = createdUnselectedShot.shot.id;

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-image-task-key",
            cookie,
          },
          body: JSON.stringify({
            targetType: "storyboard",
            targetId: storyboardId,
            prompt: "fixed wasteland image",
            model: "nano_banana_2",
            parameters: { aspectRatio: "16:9" },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const imageTask = imageTaskEnvelope.data;

      const imageTaskLookupResponse = await fetch(
        `${server.origin}/api/generation-tasks/${imageTask.taskId}`,
        { headers: { cookie } },
      );
      const imageTaskLookupEnvelope = await imageTaskLookupResponse.json();

      const listTasksResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation-tasks?page=1&pageSize=10`,
        { headers: { cookie } },
      );
      const listTasksEnvelope = await listTasksResponse.json();

      const imageReplayResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-image-task-key",
            cookie,
          },
          body: JSON.stringify({
            targetType: "storyboard",
            targetId: storyboardId,
            prompt: "fixed wasteland image",
            model: "nano_banana_2",
            parameters: { aspectRatio: "16:9" },
          }),
        },
      );
      const imageReplayEnvelope = await imageReplayResponse.json();

      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-video-task-key",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            motionPrompt: "fixed episode video",
            model: "video_mock_1",
            parameters: { durationSec: 5 },
          }),
        },
      );
      const videoTaskEnvelope = await videoTaskResponse.json();
      const videoTask = videoTaskEnvelope.data;

      const lipSyncTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-lip-sync-task-key",
            cookie,
          },
          body: JSON.stringify({
            targetType: "storyboard",
            targetId: storyboardId,
            motionPrompt: "lip sync mock video",
            model: "video_mock_1",
            parameters: {
              mode: "lip-sync",
              durationSec: 5,
              lipSyncConfig: {
                text: "对口型文本示例",
                textLength: 7,
                voiceId: "system-1",
                voiceName: "女/稚嫩",
                voiceSource: "system",
                estimatedCreditCost: 2,
              },
            },
            audioEnabled: true,
            lipSyncEnabled: true,
          }),
        },
      );
      const lipSyncTaskEnvelope = await lipSyncTaskResponse.json();
      const lipSyncTask = lipSyncTaskEnvelope.data;
      const lipSyncTaskLookupResponse = await fetch(
        `${server.origin}/api/generation-tasks/${lipSyncTask.taskId}`,
        { headers: { cookie } },
      );
      const lipSyncTaskLookupEnvelope = await lipSyncTaskLookupResponse.json();

      const persistedLipSyncTask = await db.query<{
        input_snapshot_json: Record<string, unknown> | string;
      }>(
        `
          SELECT input_snapshot_json
          FROM tasks
          WHERE id = $1
        `,
        [lipSyncTask.taskId],
      );
      const lipSyncSnapshot =
        typeof persistedLipSyncTask.rows[0]?.input_snapshot_json === "string"
          ? JSON.parse(persistedLipSyncTask.rows[0]?.input_snapshot_json as string)
          : persistedLipSyncTask.rows[0]?.input_snapshot_json ?? {};

      const setImageResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/storyboards/${storyboardId}/set-current-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-set-image-key",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: imageTask.result.assetVersionId,
            storageObjectId: imageTask.result.storageObjectId,
          }),
        },
      );
      const setImageEnvelope = await setImageResponse.json();

      const displayedVideoUrl = "https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/AIManhuaDrama/20260527/660b682f-d13a-49d0-b15b-1e6c57ffdd0e-storyboard-ui-video.mp4";
      const displayedVideoThumbnailUrl = "https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/AIManhuaDrama/20260527/660b682f-d13a-49d0-b15b-1e6c57ffdd0e-storyboard-ui-video.jpg";
      const setVideoResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/storyboards/${storyboardId}/set-current-video`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-set-video-key",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: videoTask.result.assetVersionId,
            storageObjectId: videoTask.result.storageObjectId,
            sourceUrl: displayedVideoUrl,
            thumbnailUrl: displayedVideoThumbnailUrl,
          }),
        },
      );
      const setVideoEnvelope = await setVideoResponse.json();

      const storyboardsAfterSetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/storyboards?page=1&pageSize=10`,
        { headers: { cookie } },
      );
      const storyboardsAfterSetEnvelope = await storyboardsAfterSetResponse.json();

      const exportWithoutSelectionResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/export-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-export-without-selection-key",
            cookie,
          },
          body: JSON.stringify({ exportType: "mp4" }),
        },
      );
      const exportWithoutSelectionEnvelope = await exportWithoutSelectionResponse.json();

      const exportIncompleteSelectionResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/export-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-export-incomplete-selection-key",
            cookie,
          },
          body: JSON.stringify({
            storyboardIds: [unselectedStoryboardId],
            exportType: "mp4",
          }),
        },
      );
      const exportIncompleteSelectionEnvelope = await exportIncompleteSelectionResponse.json();

      const exportOriginalResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/export-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-export-original-key",
            cookie,
          },
          body: JSON.stringify({
            storyboardIds: [storyboardId],
            exportType: "mp4",
          }),
        },
      );
      const exportOriginalEnvelope = await exportOriginalResponse.json();
      const originalDownloadResponse = exportOriginalResponse.status === 200
        ? await fetch(new URL(exportOriginalEnvelope.data.exportTask.downloadUrl, server.origin))
        : null;
      const originalZip = originalDownloadResponse?.ok
        ? await JSZip.loadAsync(await originalDownloadResponse.arrayBuffer())
        : null;

      const exportJianyingResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/export-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-export-jianying-key",
            cookie,
          },
          body: JSON.stringify({
            storyboardIds: [storyboardId],
            exportType: "jianying",
          }),
        },
      );
      const exportJianyingEnvelope = await exportJianyingResponse.json();
      const jianyingDownloadResponse = exportJianyingResponse.status === 200
        ? await fetch(new URL(exportJianyingEnvelope.data.exportTask.downloadUrl, server.origin))
        : null;
      const jianyingZip = jianyingDownloadResponse?.ok
        ? await JSZip.loadAsync(await jianyingDownloadResponse.arrayBuffer())
        : null;

      assert.equal(createShotResponse.status, 200);
      assert.equal(createUnselectedShotResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200);
      assert.equal(imageTask.kind, "image");
      assert.equal(imageTask.status, "succeeded");
      assert.equal(imageTask.episodeId, episodeId);
      assert.equal(imageTask.result.mediaKind, "image");
      assert.match(imageTask.result.imageUrl, /^(?:https?:\/\/|\/uploads\/storage\/)/);
      assert.doesNotMatch(imageTask.result.imageUrl, /C:\\Users\\/);
      assert.match(imageTask.result.storageObjectId, /.+/);
      assert.equal(imageTaskLookupResponse.status, 200);
      assert.equal(imageTaskLookupEnvelope.data.taskId, imageTask.taskId);
      assert.equal(listTasksResponse.status, 200);
      assert.equal(
        listTasksEnvelope.data.items.some((task: { taskId: string }) => task.taskId === imageTask.taskId),
        true,
      );
      assert.equal(imageReplayResponse.status, 200);
      assert.equal(imageReplayEnvelope.data.taskId, imageTask.taskId);
      assert.equal(videoTaskResponse.status, 200);
      assert.equal(videoTask.kind, "video");
      assert.equal(videoTask.status, "succeeded");
      assert.equal(videoTask.result.mediaKind, "video");
      assert.match(videoTask.result.videoUrl, /^(?:https?:\/\/|\/uploads\/storage\/)/);
      assert.doesNotMatch(videoTask.result.videoUrl, /C:\\Users\\/);
      assert.ok(videoTask.creditBalance < 10000);
      assert.equal(lipSyncTaskResponse.status, 200);
      assert.equal(lipSyncTask.kind, "video");
      assert.equal(lipSyncTask.status, "succeeded");
      assert.equal(lipSyncTaskLookupResponse.status, 200);
      assert.equal(lipSyncTaskLookupEnvelope.data.generatedAudioItems.length, 1);
      assert.equal(lipSyncTaskLookupEnvelope.data.generatedAudioItems[0].voiceName, "女/稚嫩");
      assert.match(lipSyncTaskLookupEnvelope.data.generatedAudioItems[0].audioUrl, /^data:audio\/wav;base64,/);
      assert.equal(lipSyncSnapshot.parameters?.mode, "lip-sync");
      assert.equal(lipSyncSnapshot.parameters?.lipSyncConfig?.voiceName, "女/稚嫩");
      assert.equal(lipSyncSnapshot.parameters?.lipSyncConfig?.estimatedCreditCost, 2);
      assert.equal(lipSyncSnapshot.audioEnabled, true);
      assert.equal(lipSyncSnapshot.lipSyncEnabled, true);
      assert.equal(setImageResponse.status, 200);
      assert.equal(setImageEnvelope.data.storyboard.currentImageFileId, imageTask.result.assetVersionId);
      assert.equal(setImageEnvelope.data.file.storageObjectId, imageTask.result.storageObjectId);
      assert.equal(setVideoResponse.status, 200);
      assert.equal(setVideoEnvelope.data.storyboard.currentVideoFileId, videoTask.result.assetVersionId);
      assert.match(setVideoEnvelope.data.storyboard.currentVideoUrl, /^https?:\/\//);
      assert.equal(setVideoEnvelope.data.storyboard.currentVideoThumbnailUrl, displayedVideoThumbnailUrl);
      assert.equal(setVideoEnvelope.data.storyboard.currentVideoUrl, setVideoEnvelope.data.file.sourceUrl);
      assert.equal(setVideoEnvelope.data.file.storageObjectId, videoTask.result.storageObjectId);
      assert.equal(storyboardsAfterSetResponse.status, 200);
      const updatedStoryboard = storyboardsAfterSetEnvelope.data.items.find(
        (storyboard: { storyboardId: string }) => storyboard.storyboardId === storyboardId,
      );
      assert.equal(updatedStoryboard.currentImageFileId, imageTask.result.assetVersionId);
      assert.equal(updatedStoryboard.currentVideoFileId, videoTask.result.assetVersionId);
      assert.equal(updatedStoryboard.currentVideoUrl, displayedVideoUrl);
      assert.equal(updatedStoryboard.currentVideoThumbnailUrl, displayedVideoThumbnailUrl);
      assert.equal(exportWithoutSelectionResponse.status, 400);
      assert.equal(exportWithoutSelectionEnvelope.errorCode, "storyboard_selection_required");
      assert.equal(exportIncompleteSelectionResponse.status, 409);
      assert.equal(exportIncompleteSelectionEnvelope.errorCode, "storyboard_media_incomplete");
      assert.equal(exportOriginalResponse.status, 200);
      assert.equal(exportOriginalEnvelope.data.exportTask.status, "succeeded");
      assert.equal(exportOriginalEnvelope.data.exportTask.mode, "storyboard_video_package");
      assert.notEqual(exportOriginalEnvelope.data.exportTask.storageObjectId, videoTask.result.storageObjectId);
      assert.match(exportOriginalEnvelope.data.exportTask.fileName, /-MP4\.zip$/);
      assert.match(exportOriginalEnvelope.data.exportTask.downloadUrl, /^(?:https?:\/\/|\/uploads\/storage\/)/);
      assert.equal(originalDownloadResponse?.status, 200);
      assert.ok(originalZip?.file("Episode Task-MP4/001-Episode Task-Episode Task Shot.mp4"));
      assert.equal(exportJianyingResponse.status, 200);
      assert.equal(exportJianyingEnvelope.data.exportTask.status, "succeeded");
      assert.equal(exportJianyingEnvelope.data.exportTask.mode, "jianying_draft");
      assert.notEqual(exportJianyingEnvelope.data.exportTask.storageObjectId, videoTask.result.storageObjectId);
      assert.match(exportJianyingEnvelope.data.exportTask.fileName, /\.zip$/);
      assert.equal(jianyingDownloadResponse?.status, 200);
      const draftContentEntry = Object.values(jianyingZip?.files ?? {}).find(
        (entry) => entry.name.endsWith("/draft_content.json"),
      );
      const draftContent = draftContentEntry
        ? JSON.parse(await draftContentEntry.async("string"))
        : null;
      assert.equal(draftContent?.tracks?.[0]?.segments?.length, 1);
      assert.equal(
        draftContent?.materials?.videos?.[0]?.path,
        "assets/video/001-Episode Task-Episode Task Shot.mp4",
      );
      assert.ok(
        Object.keys(jianyingZip?.files ?? {}).some(
          (name) => name.endsWith("/assets/video/001-Episode Task-Episode Task Shot.mp4"),
        ),
      );
    } finally {
      await server.close();
    }
  });

  it("normalizes local storyboard generation target ids before persisting snapshots", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET status = 'disabled'
        WHERE model_code IN ('nano_banana_2', 'video_mock_1')
      `,
    );
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "local-storyboard-target-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Local storyboard target normalization",
          scriptInput: "Episode 1: Local storyboard ids can request image and video generation.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Local Storyboard Target" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;
      const localStoryboardId = "storyboard-local-1";

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "local-storyboard-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "storyboard",
            targetId: localStoryboardId,
            prompt: "local storyboard image",
            model: "nano_banana_2",
            parameters: { aspectRatio: "16:9" },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();

      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "local-storyboard-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "storyboard",
            targetId: localStoryboardId,
            motionPrompt: "local storyboard video",
            model: "video_mock_1",
            parameters: { durationSec: 5 },
          }),
        },
      );
      const videoTaskEnvelope = await videoTaskResponse.json();

      assert.equal(imageTaskResponse.status, 200, JSON.stringify(imageTaskEnvelope));
      assert.equal(videoTaskResponse.status, 200, JSON.stringify(videoTaskEnvelope));

      const snapshots = await db.query<{
        task_id: string;
        target_type: string;
        target_id: string;
      }>(
        `
          SELECT task_id, target_type, target_id::text AS target_id
          FROM ai_generation_task_snapshots
          WHERE task_id = ANY($1::uuid[])
          ORDER BY task_id
        `,
        [[imageTaskEnvelope.data?.taskId, videoTaskEnvelope.data?.taskId]],
      );

      assert.equal(snapshots.rows.length, 2);
      assert.deepEqual(
        snapshots.rows.map((row) => row.target_type),
        ["storyboard", "storyboard"],
      );
      assert.deepEqual(
        snapshots.rows.map((row) => row.target_id),
        [episodeId, episodeId],
      );
    } finally {
      await server.close();
    }
  });

  it("rehydrates generation task polling responses from persisted task snapshots", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "snapshot-polling-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Snapshot polling",
          scriptInput: "Episode 1: Snapshot task polling.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Snapshot Polling Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "snapshot-polling-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "snapshot source should win",
            model: "nano_banana_2",
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const taskId = imageTaskEnvelope.data.taskId;
      const snapshotUrl = "https://platform-storage.example.test/snapshots/final-image.png";

      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'succeeded',
              progress_stage = 'completed',
              progress_percent = 100,
              result_assets_json = $2::jsonb,
              credit_status = 'consumed',
              completed_at = '2026-06-03T07:00:00.000Z'::timestamptz,
              updated_at = now()
          WHERE task_id = $1
        `,
        [
          taskId,
          JSON.stringify([
            {
              assetId: "snapshot-asset",
              assetVersionId: "snapshot-version",
              storageObjectId: "snapshot-storage",
              storageObjectKey: "snapshots/final-image.png",
              mediaKind: "image",
              mimeType: "image/png",
              url: snapshotUrl,
              previewUrl: snapshotUrl,
              sourceUrl: snapshotUrl,
              downloadUrl: snapshotUrl,
            },
          ]),
        ],
      );

      const taskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${taskId}`,
        { headers: { cookie } },
      );
      const taskEnvelope = await taskResponse.json();
      const listResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation-tasks?page=1&pageSize=10`,
        { headers: { cookie } },
      );
      const listEnvelope = await listResponse.json();
      const listedTask = listEnvelope.data.items.find(
        (task: { taskId?: string }) => task.taskId === taskId,
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.equal(taskResponse.status, 200);
      assert.equal(taskEnvelope.data.status, "succeeded");
      assert.equal(taskEnvelope.data.progressStage, "completed");
      assert.equal(taskEnvelope.data.progressPercent, 100);
      assert.equal(taskEnvelope.data.returnedAt, "2026-06-03T07:00:00.000Z");
      assert.equal(taskEnvelope.data.snapshot.progressStage, "completed");
      assert.equal(taskEnvelope.data.snapshot.progressPercent, 100);
      assert.equal(taskEnvelope.data.result.imageUrl, snapshotUrl);
      assert.equal(taskEnvelope.data.result.assetVersionId, "snapshot-version");
      assert.equal(listResponse.status, 200);
      assert.equal(listedTask.result.imageUrl, snapshotUrl);
      assert.equal(listedTask.result.assetVersionId, "snapshot-version");
    } finally {
      await server.close();
    }
  });

  it("returns snapshot notice type and display message for manual review generation tasks", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138011");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138011"));
      await seedActiveGenerationMembership(db, { userId });
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "snapshot-manual-review-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Snapshot manual review",
          scriptInput: "Episode 1: Manual review task polling.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Manual Review Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "snapshot-manual-review-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "manual review snapshot",
            model: "global-ai-opc-gpt-image-2",
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;
      await db.query(
        `
          UPDATE tasks
          SET status = 'manual_review_required',
              failure_code = 'provider_output_persist_failed',
              updated_at = $2
          WHERE id = $1
        `,
        [imageTask.taskId, new Date("2026-06-03T07:00:00.000Z")],
      );
      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'manual_review_required',
              progress_stage = 'asset_persist_failed',
              credit_status = 'manual_review_required',
              failure_json = $2::jsonb,
              failed_at = $3,
              updated_at = $3
          WHERE task_id = $1
        `,
        [
          imageTask.taskId,
          JSON.stringify({
            failureCode: "provider_output_persist_failed",
            noticeType: "manual_review",
            displayMessage: "已保存到平台存储，正在等待后台补写资产记录",
            storageObjectKey: "AIManhuaDrama/manual-review/image.png",
          }),
          new Date("2026-06-03T07:01:00.000Z"),
        ],
      );

      const taskResponse = await fetch(`${server.origin}/api/generation-tasks/${imageTask.taskId}`, {
        headers: { cookie },
      });
      const taskEnvelope = await taskResponse.json();

      assert.equal(taskResponse.status, 200);
      assert.equal(taskEnvelope.data.status, "manual_review_required");
      assert.deepEqual(taskEnvelope.data.failure, {
        code: "provider_output_persist_failed",
        failureCode: "provider_output_persist_failed",
        noticeType: "manual_review",
        displayMessage: "供应商产物已上传，但平台资产记录保存失败，需要后台修复。",
        storageObjectKey: "AIManhuaDrama/manual-review/image.png",
        providerRequestId: null,
        providerStatus: null,
        providerErrorCode: null,
        providerMessage: null,
        details: {},
      });
    } finally {
      await server.close();
    }
  });

  it("returns friendly display messages for image provider gateway failures", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      "UPDATE ai_model_configs SET display_name = 'GPT Image 2' WHERE model_code = 'global-ai-opc-gpt-image-2'",
    );
    const previousApiKey = process.env.GPT_IMAGE2_API_KEY;
    process.env.GPT_IMAGE2_API_KEY = previousApiKey || "test-gpt-image-key";
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138012");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138012"));
      await seedActiveGenerationMembership(db, { userId });
      const readCreatedTask = async (response: Response) => {
        const envelope = await response.json();
        const taskId = envelope.data?.taskId ?? envelope.details?.taskId ?? envelope.data?.details?.taskId;
        assert.ok(taskId, `generation task response should include a task id: ${JSON.stringify(envelope)}`);
        return { ...(envelope.data ?? {}), taskId };
      };
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "provider-gateway-message-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Provider gateway messages",
          scriptInput: "Episode 1: Provider gateway failed.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Provider Gateway Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const ambiguousTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "provider-gateway-ambiguous-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "submission ambiguous",
            model: "global-ai-opc-gpt-image-2",
          }),
        },
      );
      const ambiguousTask = await readCreatedTask(ambiguousTaskResponse);
      await db.query(
        `
          UPDATE tasks
          SET status = 'failed',
              failure_code = 'provider_failed',
              updated_at = $2
          WHERE id = $1
        `,
        [ambiguousTask.taskId, new Date("2026-06-03T07:02:00.000Z")],
      );
      await db.query(
        `
          WITH task_row AS (
            SELECT id, project_id, workflow_id
            FROM tasks
            WHERE id = $1
          )
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id, attempt_id,
            provider_name, provider_operation, request_key, request_hash,
            payload_ref, payload_hash, payload_redacted_json, status,
            external_submission_started_at, failure_code, created_at, updated_at
          )
          SELECT
            '80000000-0000-4000-8000-000000009912',
            project_id,
            workflow_id,
            id,
            NULL,
            'openai-images',
            'episode.image.generate',
            'provider-gateway-ambiguous',
            'provider-gateway-ambiguous',
            'payloads/provider-gateway-ambiguous.json',
            'provider-gateway-ambiguous',
            '{}'::jsonb,
            'result_unknown',
            $2,
            'provider_submission_ambiguous',
            $2,
            $2
          FROM task_row
        `,
        [ambiguousTask.taskId, new Date("2026-06-03T07:02:01.000Z")],
      );
      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'failed',
              progress_stage = 'provider_failed',
              credit_status = 'released',
              failure_json = $2::jsonb,
              failed_at = $3,
              updated_at = $3
          WHERE task_id = $1
        `,
        [
          ambiguousTask.taskId,
          JSON.stringify({
            failureCode: "provider_submission_ambiguous",
            providerStatus: "result_unknown",
          }),
          new Date("2026-06-03T07:02:01.000Z"),
        ],
      );

      const timeoutTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "provider-gateway-timeout-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "gateway timeout",
            model: "global-ai-opc-gpt-image-2",
          }),
        },
      );
      const timeoutTask = await readCreatedTask(timeoutTaskResponse);
      await db.query(
        `
          UPDATE tasks
          SET status = 'failed',
              failure_code = 'provider_failed',
              updated_at = $2
          WHERE id = $1
        `,
        [timeoutTask.taskId, new Date("2026-06-03T07:03:00.000Z")],
      );
      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'failed',
              progress_stage = 'provider_failed',
              credit_status = 'released',
              failure_json = $2::jsonb,
              failed_at = $3,
              updated_at = $3
          WHERE task_id = $1
        `,
        [
          timeoutTask.taskId,
          JSON.stringify({
            failureCode: "provider_failed",
            providerMessage: "openai_images_504",
          }),
          new Date("2026-06-03T07:03:01.000Z"),
        ],
      );

      const emptyResponseTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "provider-gateway-empty-response-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "empty provider response",
            model: "global-ai-opc-gpt-image-2",
          }),
        },
      );
      const emptyResponseTask = await readCreatedTask(emptyResponseTaskResponse);
      await db.query(
        `
          UPDATE tasks
          SET status = 'failed',
              failure_code = 'provider_failed',
              updated_at = $2
          WHERE id = $1
        `,
        [emptyResponseTask.taskId, new Date("2026-06-03T07:04:00.000Z")],
      );
      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'failed',
              progress_stage = 'provider_failed',
              credit_status = 'released',
              failure_json = $2::jsonb,
              failed_at = $3,
              updated_at = $3
          WHERE task_id = $1
        `,
        [
          emptyResponseTask.taskId,
          JSON.stringify({
            failureCode: "provider_failed",
            errorMessage: "Unexpected end of JSON input",
            displayMessage: "provider_failed",
          }),
          new Date("2026-06-03T07:04:01.000Z"),
        ],
      );

      const fetchFailedTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "provider-gateway-fetch-failed-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "fetch failed",
            model: "global-ai-opc-gpt-image-2",
          }),
        },
      );
      const fetchFailedTask = await readCreatedTask(fetchFailedTaskResponse);
      await db.query(
        `
          UPDATE tasks
          SET status = 'failed',
              failure_code = 'provider_failed',
              updated_at = $2
          WHERE id = $1
        `,
        [fetchFailedTask.taskId, new Date("2026-06-03T07:05:00.000Z")],
      );
      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'failed',
              progress_stage = 'provider_failed',
              credit_status = 'released',
              failure_json = $2::jsonb,
              failed_at = $3,
              updated_at = $3
          WHERE task_id = $1
        `,
        [
          fetchFailedTask.taskId,
          JSON.stringify({
            failureCode: "provider_failed",
            providerMessage: "fetch failed",
          }),
          new Date("2026-06-03T07:05:01.000Z"),
        ],
      );

      const volcengineModelNotFoundTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "provider-gateway-volcengine-model-not-found",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "volcengine model not found",
            model: "global-ai-opc-gpt-image-2",
          }),
        },
      );
      const volcengineModelNotFoundTask = await readCreatedTask(volcengineModelNotFoundTaskResponse);
      await db.query(
        `
          UPDATE tasks
          SET status = 'failed',
              failure_code = 'provider_failed',
              updated_at = $2
          WHERE id = $1
        `,
        [volcengineModelNotFoundTask.taskId, new Date("2026-06-03T07:06:00.000Z")],
      );
      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'failed',
              progress_stage = 'provider_failed',
              credit_status = 'released',
              failure_json = $2::jsonb,
              failed_at = $3,
              updated_at = $3
          WHERE task_id = $1
        `,
        [
          volcengineModelNotFoundTask.taskId,
          JSON.stringify({
            failureCode: "provider_failed",
            providerMessage: "volcengine_ark_image_404:InvalidEndpointOrModel.NotFound:The model or endpoint doubao-seedream-4-0 does not exist or you do not have access to it.",
          }),
          new Date("2026-06-03T07:06:01.000Z"),
        ],
      );

      const ambiguousLookupResponse = await fetch(`${server.origin}/api/generation-tasks/${ambiguousTask.taskId}`, {
        headers: { cookie },
      });
      const ambiguousEnvelope = await ambiguousLookupResponse.json();
      const timeoutLookupResponse = await fetch(`${server.origin}/api/generation-tasks/${timeoutTask.taskId}`, {
        headers: { cookie },
      });
      const timeoutEnvelope = await timeoutLookupResponse.json();
      const emptyResponseLookupResponse = await fetch(`${server.origin}/api/generation-tasks/${emptyResponseTask.taskId}`, {
        headers: { cookie },
      });
      const emptyResponseEnvelope = await emptyResponseLookupResponse.json();
      const fetchFailedLookupResponse = await fetch(`${server.origin}/api/generation-tasks/${fetchFailedTask.taskId}`, {
        headers: { cookie },
      });
      const fetchFailedEnvelope = await fetchFailedLookupResponse.json();
      const volcengineModelNotFoundLookupResponse = await fetch(`${server.origin}/api/generation-tasks/${volcengineModelNotFoundTask.taskId}`, {
        headers: { cookie },
      });
      const volcengineModelNotFoundEnvelope = await volcengineModelNotFoundLookupResponse.json();

      assert.equal(ambiguousLookupResponse.status, 200);
      assert.equal(ambiguousEnvelope.data.failure.noticeType, "manual_review");
      assert.equal(ambiguousEnvelope.data.failure.displayMessage, "模型请求已发出，但供应商没有返回明确提交结果。任务与积分状态已转后台复核，请勿重复提交；最终结果以任务状态和积分账本为准。");
      assert.doesNotMatch(ambiguousEnvelope.data.failure.displayMessage, /积分已返还|返还积分/);
      assert.equal(timeoutLookupResponse.status, 200);
      assert.equal(timeoutEnvelope.data.failure.displayMessage, "图片模型服务或中转站响应超时（HTTP 504），任务没有拿到生成结果，积分已返还。请稍后重试或检查中转站稳定性。");
      assert.equal(emptyResponseLookupResponse.status, 200);
      assert.equal(emptyResponseEnvelope.data.failure.displayMessage, "图片模型服务响应为空或被截断，后端没有拿到图片数据。积分已返还，请检查中转站是否完整返回 JSON。");
      assert.equal(emptyResponseEnvelope.data.failure.providerMessage, "图片模型服务响应为空或被截断，后端没有拿到图片数据。积分已返还，请检查中转站是否完整返回 JSON。");
      assert.doesNotMatch(JSON.stringify(emptyResponseEnvelope.data.failure), /Unexpected end of JSON input/);
      assert.equal(fetchFailedLookupResponse.status, 200);
      assert.equal(fetchFailedEnvelope.data.failure.displayMessage, "无法连接图片模型供应商或中转站，后端没有收到响应。请检查网络、中转站地址和服务状态后重试。");
      assert.equal(fetchFailedEnvelope.data.failure.providerMessage, "无法连接图片模型供应商或中转站，后端没有收到响应。请检查网络、中转站地址和服务状态后重试。");
      assert.doesNotMatch(JSON.stringify(fetchFailedEnvelope.data.failure), /fetch failed/);
      assert.equal(volcengineModelNotFoundLookupResponse.status, 200);
      assert.equal(volcengineModelNotFoundEnvelope.data.failure.displayMessage, "火山方舟图片模型不可用或当前账号无权限：doubao-seedream-4-0。任务没有生成图片，积分已返还，请检查模型配置或供应商权限。");
      assert.doesNotMatch(volcengineModelNotFoundEnvelope.data.failure.displayMessage, /InvalidEndpointOrModel/);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.GPT_IMAGE2_API_KEY;
      } else {
        process.env.GPT_IMAGE2_API_KEY = previousApiKey;
      }
      await server.close();
    }
  });

  it("rejects configured generation models when the user has no active membership", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            status = 'active',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://relay.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY","resultFormat":"b64_json"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":45}'::jsonb
        WHERE model_code = 'jimeng-5-image'
      `,
    );
    const server = createPhoneAuthDevServer({
      db,
      env: {
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      fetchImpl: (async () => {
        throw new Error("provider_should_not_be_called_without_membership");
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const idempotencySuffix = randomUUID();
      const prompt = `membership gate ${idempotencySuffix}`;
      const cookie = await login(server.origin, "13800138013");
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `generation-membership-required-project-${idempotencySuffix}`,
          cookie,
        },
        body: JSON.stringify({
          name: "Membership required generation",
          scriptInput: "Episode 1: Membership should be checked before generation.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Membership Required Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      await db.query("DELETE FROM membership_periods");

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `generation-membership-required-task-${idempotencySuffix}`,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt,
            model: "jimeng-5-image",
            parameters: {
              aspectRatio: "16:9",
              quality: "standard",
            },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const taskRows = await db.query<{ count: number | string }>(
        "SELECT count(*) AS count FROM tasks WHERE idempotency_key = $1",
        [`generation-membership-required-task-${idempotencySuffix}`],
      );
      const reservationRows = await db.query<{ count: number | string }>(
        "SELECT count(*) AS count FROM credit_reservations WHERE metadata_json->>'prompt' = $1",
        [prompt],
      );

      assert.equal(imageTaskResponse.status, 403);
      assert.equal(imageTaskEnvelope.errorCode, "generation_membership_required");
      assert.equal(imageTaskEnvelope.message, "有效会员已过期或未开通，请先开通会员。");
      assert.equal(Number(taskRows.rows[0]?.count ?? -1), 0);
      assert.equal(Number(reservationRows.rows[0]?.count ?? -1), 0);
    } finally {
      await server.close();
    }
  });

  it("allows image and video generation when active membership summary exists without period rows", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const idempotencySuffix = randomUUID();
      const phone = "13800138024";
      const cookie = await login(server.origin, phone);
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `generation-summary-membership-project-${idempotencySuffix}`,
          cookie,
        },
        body: JSON.stringify({
          name: "Summary membership generation",
          scriptInput: "Episode 1: Summary membership should unlock image and video generation.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Summary Membership Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const userId = await readUserIdForPhone(db, normalizeCnPhone(phone));
      await seedActiveGenerationMembership(db, { userId, periodEndAt: new Date("2099-01-01T00:00:00.000Z") });
      await grantCredits(db, {
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      await db.query("DELETE FROM membership_periods");

      const statusResponse = await fetch(`${server.origin}/api/membership/status`, {
        headers: { cookie },
      });
      const status = await statusResponse.json();
      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `generation-summary-membership-image-${idempotencySuffix}`,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "summary membership image",
            model: "nano_banana_2",
            parameters: {
              aspectRatio: "16:9",
              quality: "standard",
            },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `generation-summary-membership-video-${idempotencySuffix}`,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            motionPrompt: "summary membership video",
            model: "video_mock_1",
            parameters: { durationSec: 5 },
          }),
        },
      );
      const videoTaskEnvelope = await videoTaskResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(statusResponse.status, 200);
      assert.equal(status.membership.status, "professional_active");
      assert.equal(imageTaskResponse.status, 200, `image task failed: ${JSON.stringify(imageTaskEnvelope)}`);
      assert.equal(imageTaskEnvelope.data.kind, "image");
      assert.equal(videoTaskResponse.status, 200, `video task failed: ${JSON.stringify(videoTaskEnvelope)}`);
      assert.equal(videoTaskEnvelope.data.kind, "video");
    } finally {
      await server.close();
    }
  });

  it("allows image generation when the configured model baseCredits is a positive decimal", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET status = 'active',
            provider_config_json = jsonb_set(
              COALESCE(provider_config_json, '{}'::jsonb),
              '{apiKeyEnv}',
              to_jsonb('LINGDONG_API_KEY'::text),
              true
            ),
            pricing_json = pricing_json || '{"baseCredits":0.06}'::jsonb
        WHERE model_code = 'gpt-image-2'
      `,
    );
    const server = createPhoneAuthDevServer({
      db,
      env: {
        LINGDONG_API_KEY: "lingdong-test-key",
      },
      fetchImpl: (async () => {
        return new Response(
          JSON.stringify({
            created: Math.floor(Date.now() / 1000),
            data: [{ url: "https://example.test/generated-image.png" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const idempotencySuffix = randomUUID();
      const phone = "13800138025";
      const cookie = await login(server.origin, phone);
      const userId = await readUserIdForPhone(db, normalizeCnPhone(phone));
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `decimal-base-credits-project-${idempotencySuffix}`,
          cookie,
        },
        body: JSON.stringify({
          name: "Decimal base credits generation",
          scriptInput: "Episode 1: Decimal model credits should still allow generation.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Decimal Base Credits Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      await seedActiveGenerationMembership(db, { userId, periodEndAt: new Date("2099-01-01T00:00:00.000Z") });
      await grantCredits(db, {
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      await db.query("DELETE FROM membership_periods");

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `decimal-base-credits-image-${idempotencySuffix}`,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "decimal base credits image",
            model: "gpt-image-2",
            parameters: {
              aspectRatio: "16:9",
              size: "1024x1024",
              count: 1,
              responseFormat: "url",
            },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200, `image task failed: ${JSON.stringify(imageTaskEnvelope)}`);
      assert.equal(imageTaskEnvelope.data.kind, "image");
    } finally {
      await server.close();
    }
  });

  it("returns configured model validation errors instead of internal errors", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET status = 'active',
            parameter_schema_json = parameter_schema_json
              || '{"prompt":{"type":"string","maxLength":4}}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":20}'::jsonb
        WHERE model_code = 'global-ai-opc-gpt-image-2'
      `,
    );
    const server = createPhoneAuthDevServer({
      db,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const idempotencySuffix = randomUUID();
      const phone = "13800138026";
      const cookie = await login(server.origin, phone);
      const userId = await readUserIdForPhone(db, normalizeCnPhone(phone));
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `model-validation-project-${idempotencySuffix}`,
          cookie,
        },
        body: JSON.stringify({
          name: "Model validation generation",
          scriptInput: "Episode 1: Model validation should return a structured error.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Model Validation Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      await seedActiveGenerationMembership(db, { userId, periodEndAt: new Date("2099-01-01T00:00:00.000Z") });
      await grantCredits(db, {
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `model-validation-image-${idempotencySuffix}`,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "model validation image",
            model: "global-ai-opc-gpt-image-2",
            parameters: {},
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(imageTaskResponse.status, 400);
      assert.equal(imageTaskEnvelope.errorCode, "model_prompt_too_long");
      assert.notEqual(imageTaskEnvelope.errorCode, "internal_error");
    } finally {
      await server.close();
    }
  });

  it("allows team member image and video generation from the administrator membership", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      seedTeamEntitlements: true,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const idempotencySuffix = randomUUID();
      const phone = "13800138001";
      const ownerCookie = await login(server.origin, phone);
      const ownerUserId = await readUserIdForPhone(db, normalizeCnPhone(phone));
      await seedActiveGenerationMembership(db, {
        userId: ownerUserId,
        periodEndAt: new Date("2099-01-01T00:00:00.000Z"),
      });
      await db.query("DELETE FROM membership_periods");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `team-member-generation-project-${idempotencySuffix}`,
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "Team member membership generation",
          scriptInput: "Episode 1: Team member generation should use administrator membership.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: ownerCookie,
          },
          body: JSON.stringify({ title: "Team Member Membership Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const createMemberResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          teamAccount: `gen_member_${idempotencySuffix.slice(0, 8)}`,
          displayName: "Generation Member",
          projectIds: [createdProject.project.id],
          initialCredits: 0,
        }),
      });
      const createdMember = await createMemberResponse.json();
      await db.query("UPDATE team_members SET member_credits = 10000 WHERE id = $1", [
        createdMember.member.membershipId,
      ]);
      const memberCookie = await loginTeamMemberAccount(
        server.origin,
        createdMember.member.memberLoginAccount,
        createdMember.temporaryPassword,
      );

      const memberStatusResponse = await fetch(`${server.origin}/api/membership/status`, {
        headers: { cookie: memberCookie },
      });
      const memberStatus = await memberStatusResponse.json();
      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `team-member-generation-image-${idempotencySuffix}`,
            cookie: memberCookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "team member membership image",
            model: "nano_banana_2",
            parameters: {
              aspectRatio: "16:9",
              quality: "standard",
            },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `team-member-generation-video-${idempotencySuffix}`,
            cookie: memberCookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            motionPrompt: "team member membership video",
            model: "video_mock_1",
            parameters: { durationSec: 5 },
          }),
        },
      );
      const videoTaskEnvelope = await videoTaskResponse.json();
      const videoTaskId = String(videoTaskEnvelope.data?.taskId ?? "");
      await db.query("UPDATE tasks SET status = 'running' WHERE id = $1", [videoTaskId]);
      const createSecondMemberResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          teamAccount: `gen_member_2_${idempotencySuffix.slice(0, 8)}`,
          displayName: "Generation Member Two",
          projectIds: [createdProject.project.id],
          initialCredits: 0,
        }),
      });
      const createdSecondMember = await createSecondMemberResponse.json();
      await db.query("UPDATE team_members SET member_credits = 10000 WHERE id = $1", [
        createdSecondMember.member.membershipId,
      ]);
      const secondMemberCookie = await loginTeamMemberAccount(
        server.origin,
        createdSecondMember.member.memberLoginAccount,
        createdSecondMember.temporaryPassword,
      );
      const conflictingVideoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `team-member-generation-video-conflict-${idempotencySuffix}`,
            cookie: secondMemberCookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            motionPrompt: "second member must not duplicate the active target",
            model: "video_mock_1",
            parameters: { durationSec: 5 },
          }),
        },
      );
      const conflictingVideoTaskEnvelope = await conflictingVideoTaskResponse.json();
      const conflictingTaskSideEffects = await db.query<{
        task_count: number | string;
        second_member_debit_count: number | string;
      }>(
        `
          SELECT
            (
              SELECT count(*)::int
              FROM tasks candidate
              WHERE candidate.target_entity_id = $1
                AND candidate.task_type = (SELECT task_type FROM tasks WHERE id = $2)
            ) AS task_count,
            (
              SELECT count(*)::int
              FROM credit_ledger_entries entry
              WHERE entry.team_member_id = $3
                AND entry.source_type = 'team_member_generation_task'
            ) AS second_member_debit_count
        `,
        [episodeId, videoTaskId, createdSecondMember.member.membershipId],
      );
      const videoDebit = await db.query<{ amount: number | string }>(
        `
          SELECT amount
          FROM credit_ledger_entries
          WHERE team_member_id = $1
            AND source_type = 'team_member_generation_task'
            AND metadata_json->>'taskId' = $2
          LIMIT 1
        `,
        [createdMember.member.membershipId, videoTaskId],
      );
      const balanceBeforeTimeout = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [createdMember.member.membershipId],
      );
      const past = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      await db.query(
        `
          UPDATE tasks
          SET status = 'result_unknown',
              failure_code = NULL,
              input_snapshot_json = jsonb_set(input_snapshot_json, '{timeoutAt}', to_jsonb($2::text), true)
          WHERE id = $1
        `,
        [videoTaskId, past],
      );
      const timeoutResponse = await fetch(`${server.origin}/api/generation-tasks/${videoTaskId}`, {
        headers: { cookie: memberCookie },
      });
      const timeoutEnvelope = await timeoutResponse.json();
      await fetch(`${server.origin}/api/generation-tasks/${videoTaskId}`, {
        headers: { cookie: memberCookie },
      });
      const balanceAfterTimeout = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [createdMember.member.membershipId],
      );
      const timeoutRefund = await db.query<{ count: number | string; amount: number | string }>(
        `
          SELECT count(*) AS count, COALESCE(sum(amount), 0) AS amount
          FROM credit_ledger_entries
          WHERE team_member_id = $1
            AND source_type = 'team_member_generation_refund'
            AND source_id = $2
        `,
        [createdMember.member.membershipId, videoTaskId],
      );

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createMemberResponse.status, 200);
      assert.equal(memberStatusResponse.status, 200);
      assert.equal(memberStatus.membership.status, "professional_active");
      assert.equal(imageTaskResponse.status, 200, `image task failed: ${JSON.stringify(imageTaskEnvelope)}`);
      assert.equal(imageTaskEnvelope.data.kind, "image");
      assert.equal(videoTaskResponse.status, 200, `video task failed: ${JSON.stringify(videoTaskEnvelope)}`);
      assert.equal(videoTaskEnvelope.data.kind, "video");
      assert.equal(createSecondMemberResponse.status, 200);
      assert.equal(conflictingVideoTaskResponse.status, 409);
      assert.equal(conflictingVideoTaskEnvelope.errorCode, "generation_target_busy");
      assert.equal(conflictingVideoTaskEnvelope.details.taskId, undefined);
      assert.equal(Number(conflictingTaskSideEffects.rows[0]?.task_count ?? -1), 1);
      assert.equal(Number(conflictingTaskSideEffects.rows[0]?.second_member_debit_count ?? -1), 0);
      assert.equal(timeoutResponse.status, 200);
      assert.equal(timeoutEnvelope.data.status, "failed");
      assert.equal(timeoutEnvelope.data.failureCode, "task_timeout");
      assert.equal(Number(timeoutRefund.rows[0]?.count ?? -1), 1);
      assert.equal(Number(timeoutRefund.rows[0]?.amount ?? -1), Number(videoDebit.rows[0]?.amount ?? -2));
      assert.equal(
        Number(balanceAfterTimeout.rows[0]?.member_credits ?? -1),
        Number(balanceBeforeTimeout.rows[0]?.member_credits ?? -1) + Number(videoDebit.rows[0]?.amount ?? 0),
      );
    } finally {
      await server.close();
    }
  });

  it("rejects fallback-priced generation when the user has no active membership", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      fetchImpl: (async () => {
        throw new Error("provider_should_not_be_called_without_membership");
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const idempotencySuffix = randomUUID();
      const cookie = await login(server.origin, "13800138023");
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `fallback-generation-membership-required-project-${idempotencySuffix}`,
          cookie,
        },
        body: JSON.stringify({
          name: "Fallback membership required generation",
          scriptInput: "Episode 1: Fallback priced generation should still require membership.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Fallback Membership Required Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      await db.query("DELETE FROM membership_periods");

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `fallback-generation-membership-required-task-${idempotencySuffix}`,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "fallback membership gate",
            model: "nano_banana_2",
            parameters: {
              aspectRatio: "16:9",
              quality: "standard",
            },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const taskRows = await db.query<{ count: number | string }>(
        "SELECT count(*) AS count FROM tasks WHERE idempotency_key = $1",
        [`fallback-generation-membership-required-task-${idempotencySuffix}`],
      );
      const reservationRows = await db.query<{ count: number | string }>(
        "SELECT count(*) AS count FROM credit_reservations WHERE metadata_json->>'prompt' = 'fallback membership gate'",
      );

      assert.equal(imageTaskResponse.status, 403);
      assert.equal(imageTaskEnvelope.errorCode, "generation_membership_required");
      assert.equal(Number(taskRows.rows[0]?.count ?? -1), 0);
      assert.equal(Number(reservationRows.rows[0]?.count ?? -1), 0);
    } finally {
      await server.close();
    }
  });

  it("uses image base credits for fixed billing and resolution credits for duration billing", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://relay.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY","resultFormat":"b64_json"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":45,"billingMode":"duration","resolutionCredits":{"1080p":120}}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const server = createPhoneAuthDevServer({
      db,
      env: {
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      fetchImpl: (async () => {
        throw new Error("provider_should_not_be_called_when_resolution_price_exceeds_balance");
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const idempotencySuffix = randomUUID();
      const phone = `139${randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`;
      const normalizedPhone = normalizeCnPhone(phone);
      await seedCreatorMembershipForPhone(db, normalizedPhone);
      const cookie = await login(server.origin, phone);
      const userId = await readUserIdForPhone(db, normalizedPhone);
      await seedActiveGenerationMembership(db, { userId });
      await db.query(
        "UPDATE users SET credit_balance_cached = 0, credit_reserved_cached = 0 WHERE id = $1",
        [userId],
      );
      await db.query("DELETE FROM credit_lots WHERE user_id = $1", [userId]);
      await grantCredits(db, {
        userId,
        amount: 200,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `generation-insufficient-credit-project-${idempotencySuffix}`,
          cookie,
        },
        body: JSON.stringify({
          name: "Insufficient credits generation",
          scriptInput: "Episode 1: Credits should be checked before provider submission.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Insufficient Credits Episode" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `generation-insufficient-credit-task-${idempotencySuffix}`,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "credit gate",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "16:9",
              resolution: "1080p",
              quality: "standard",
              durationSec: 10,
            },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const durationReservation = await db.query<{ amount_reserved: number | string; status: string }>(
        "SELECT amount_reserved, status FROM credit_reservations WHERE task_id = $1",
        [imageTaskEnvelope.data.taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.equal(imageTaskEnvelope.data.status, "queued");
      assert.equal(Number(durationReservation.rows[0]?.amount_reserved ?? -1), 120);
      assert.equal(durationReservation.rows[0]?.status, "active");

      await db.query(
        `
          UPDATE ai_model_configs
          SET pricing_json = pricing_json || '{"baseCredits":45,"billingMode":"fixed","resolutionCredits":{"1080p":120}}'::jsonb
          WHERE model_code = 'gpt-image-2-cn'
        `,
      );
      const fixedResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `generation-fixed-base-credit-task-${idempotencySuffix}`,
          cookie,
        },
        body: JSON.stringify({
          targetType: "episode",
          targetId: episodeId,
          prompt: "fixed credit gate",
          model: "gpt-image-2-cn",
          parameters: { aspectRatio: "16:9", quality: "standard" },
        }),
      });
      const fixedEnvelope = await fixedResponse.json();
      const fixedReservation = await db.query<{ amount_reserved: number | string; status: string }>(
        "SELECT amount_reserved, status FROM credit_reservations WHERE task_id = $1",
        [fixedEnvelope.data.taskId],
      );

      assert.equal(fixedResponse.status, 200);
      assert.equal(fixedEnvelope.data.status, "queued");
      assert.equal(Number(fixedReservation.rows[0]?.amount_reserved ?? -1), 45);
      assert.equal(fixedReservation.rows[0]?.status, "active");
    } finally {
      await server.close();
    }
  });

  it("submits Seedance video tasks through the configured provider instead of mock finalization", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_name = 'ConfiguredSeedance',
            provider_model = 'seedance-db-model',
            status = 'active',
            sort_order = -100,
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":8,"billingMode":"duration","resolutionCredits":{"1080p":12}}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
      `,
    );
    const providerCalls: Array<{
      url: string;
      headers: HeadersInit | undefined;
      body: string;
    }> = [];
    const server = createPhoneAuthDevServer({
      db,
      env: {
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
        BULLMQ_WORKERS_ENABLED: "false",
        SEEDANCE_PROVIDER_ENABLED: "true",
        VOLCENGINE_ARK_API_KEY: "seedance-test-key",
      },
      fetchImpl: (async (url, init) => {
        providerCalls.push({
          url: String(url),
          headers: init?.headers,
          body: String(init?.body ?? ""),
        });
        if (String(url).includes("/db/query/seedance-external-task-1")) {
          return new Response(
            JSON.stringify({
              data: {
                task_id: "seedance-external-task-1",
                status: "succeeded",
                result: {
                  video_url: "https://cdn.example.test/seedance-result.mp4",
                },
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (String(url) === "https://cdn.example.test/seedance-result.mp4") {
          return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
            status: 200,
            headers: { "content-type": "video/mp4" },
          });
        }
        return new Response(
          JSON.stringify({
            data: {
              task_id: "seedance-external-task-1",
              status: "queued",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      const idempotencySuffix = randomUUID();
      const phone = "13800138000";
      await seedCreatorMembershipForPhone(db, normalizeCnPhone(phone));
      await server.listen(0);
      const cookie = await login(server.origin, phone);
      const userId = await readUserIdForPhone(db, normalizeCnPhone(phone));
      await seedActiveGenerationMembership(db, {
        userId,
      });

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `seedance-project-create-${idempotencySuffix}`,
          cookie,
        },
        body: JSON.stringify({
          name: "Seedance episode provider",
          scriptInput: "Episode 1: Seedance provider handles video.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      await grantCredits(db, {
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Seedance Task" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const generationConfigResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation-config`,
        { headers: { cookie } },
      );
      const generationConfigEnvelope = await generationConfigResponse.json();

      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `seedance-video-task-key-${idempotencySuffix}`,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
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
      const taskId = videoTaskEnvelope.data.taskId;
      const duplicateVideoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `seedance-video-task-duplicate-${idempotencySuffix}`,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            motionPrompt: "a different prompt must not be rebound to the active task",
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
      const duplicateVideoTaskEnvelope = await duplicateVideoTaskResponse.json();
      const duplicateSideEffects = await db.query<{
        task_count: number | string;
        reservation_count: number | string;
      }>(
        `
          SELECT
            count(DISTINCT task.id)::int AS task_count,
            count(DISTINCT reservation.id)::int AS reservation_count
          FROM tasks task
          LEFT JOIN credit_reservations reservation ON reservation.task_id = task.id
          WHERE task.target_entity_id = $1
        `,
        [episodeId],
      );
      const providerRequest = await db.query<{
        provider_request_id: string;
        provider_name: string;
        status: string;
        external_request_id: string | null;
        provider_request_count: number;
      }>(
        `
          SELECT
            id AS provider_request_id,
            provider_name,
            status,
            external_request_id,
            count(*) OVER ()::int AS provider_request_count
          FROM provider_requests
          WHERE task_id = $1
        `,
        [taskId],
      );
      const userModelRequestLog = await db.query<{
        provider_request_id: string;
        status: string;
        provider_operation: string;
      }>(
        `
          SELECT provider_request_id, status, provider_operation
          FROM user_model_request_logs
          WHERE task_id = $1
        `,
        [taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, status FROM credit_reservations WHERE task_id = $1",
        [taskId],
      );
      const snapshot = await db.query<{
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
        [taskId],
      );
      const completedTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${taskId}`,
        { headers: { cookie } },
      );
      const completedTaskEnvelope = await completedTaskResponse.json();
      const completedListResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation-tasks?page=1&pageSize=10`,
        { headers: { cookie } },
      );
      const completedListEnvelope = await completedListResponse.json();
      const completedReservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, status FROM credit_reservations WHERE task_id = $1",
        [taskId],
      );

      assert.equal(generationConfigResponse.status, 200);
      assert.ok(
        generationConfigEnvelope.data.models.some(
          (model: { modelCode?: string }) => model.modelCode === "seedance-i2v-pro",
        ),
      );
      assert.equal(videoTaskResponse.status, 200);
      assert.equal(duplicateVideoTaskResponse.status, 409);
      assert.equal(duplicateVideoTaskEnvelope.errorCode, "generation_target_busy");
      assert.equal(duplicateVideoTaskEnvelope.details.taskId, taskId);
      assert.equal(Number(duplicateSideEffects.rows[0]?.task_count ?? -1), 1);
      assert.equal(Number(duplicateSideEffects.rows[0]?.reservation_count ?? -1), 1);
      assert.equal(videoTaskEnvelope.data.kind, "video");
      assert.ok(["queued", "running"].includes(videoTaskEnvelope.data.status));
      assert.equal(videoTaskEnvelope.data.result, null);
      assert.equal(providerCalls.length, 3);
      assert.equal(
        providerCalls[0]?.url,
        "https://ark-db.example.test/db/create",
      );
      assert.deepEqual(providerCalls[0]?.headers, {
        authorization: "Bearer seedance-test-key",
        "content-type": "application/json",
      });
      assert.match(providerCalls[0]?.body ?? "", /"model":"seedance-db-model"/);
      assert.match(providerCalls[0]?.body ?? "", /camera slowly pushes in/);
      assert.match(providerCalls[0]?.body ?? "", /first-frame\.png/);
      assert.match(providerCalls[0]?.body ?? "", /"duration":5/);
      assert.equal(
        providerCalls[1]?.url,
        "https://ark-db.example.test/db/query/seedance-external-task-1",
      );
      assert.equal(providerCalls[2]?.url, "https://cdn.example.test/seedance-result.mp4");
      assert.equal(providerRequest.rows[0]?.status, "accepted");
      assert.equal(providerRequest.rows[0]?.external_request_id, "seedance-external-task-1");
      assert.equal(providerRequest.rows[0]?.provider_name, "ConfiguredSeedance");
      assert.equal(providerRequest.rows[0]?.provider_request_count, 1);
      assert.equal(userModelRequestLog.rows[0]?.provider_request_id, providerRequest.rows[0]?.provider_request_id);
      assert.equal(userModelRequestLog.rows[0]?.status, "submitted");
      assert.equal(userModelRequestLog.rows[0]?.provider_operation, "episode.video.generate");
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? 0), 60);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 0);
      assert.equal(reservation.rows[0]?.status, "active");
      assert.equal(completedTaskResponse.status, 200);
      assert.equal(completedTaskEnvelope.data.status, "succeeded");
      assert.equal(completedTaskEnvelope.data.result.mediaKind, "video");
      assert.doesNotMatch(completedTaskEnvelope.data.result.videoUrl, /cdn\.example\.test/);
      assert.equal(completedListResponse.status, 200);
      const restoredTask = completedListEnvelope.data.items.find(
        (task: { taskId?: string }) => task.taskId === taskId,
      );
      assert.equal(restoredTask.status, "succeeded");
      assert.doesNotMatch(restoredTask.result.videoUrl, /cdn\.example\.test/);
      assert.equal(Number(completedReservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(completedReservation.rows[0]?.amount_consumed ?? -1), 60);
      assert.equal(completedReservation.rows[0]?.status, "settled");
    } finally {
      await server.close();
    }
  });

  it("streams Seedance provider output to storage and retries transient upload failures", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'seedance-db-model',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":135}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
      `,
    );
    let uploadAttempts = 0;
    const uploadedBodies: unknown[] = [];
    const server = createPhoneAuthDevServer({
      db,
      env: {
        SEEDANCE_PROVIDER_ENABLED: "true",
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
        BULLMQ_WORKERS_ENABLED: "false",
        VOLCENGINE_ARK_API_KEY: "seedance-test-key",
        GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
        GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
      },
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
        adapter: {
          async createSignedReadUrl(input) {
            return {
              url: `https://platform-storage.example.test/${input.objectKey}`,
              expiresAt: input.expiresAt,
            };
          },
          async putObject(input) {
            uploadAttempts += 1;
            uploadedBodies.push(input.body);
            if (uploadAttempts < 3) {
              throw new Error("transient_cos_upload_failed");
            }
            return { eTag: "seedance-stream-etag" };
          },
        },
      },
      fetchImpl: (async (url, init) => {
        if (String(url).includes("/db/query/seedance-external-task-1")) {
          return new Response(
            JSON.stringify({
              data: {
                task_id: "seedance-external-task-1",
                status: "succeeded",
                result: {
                  video_url: "https://cdn.example.test/seedance-result.mp4",
                },
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (String(url) === "https://cdn.example.test/seedance-result.mp4") {
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
              task_id: "seedance-external-task-1",
              status: "queued",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138000"));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 1000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      await grantCredits(db, {
        userId,
        amount: 100,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "seedance-stream-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Seedance stream upload",
          scriptInput: "Episode 1: Stream provider output into COS.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Seedance Stream Task" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-stream-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
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
      const taskId = videoTaskEnvelope.data.taskId;

      const completedTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${taskId}`,
        { headers: { cookie } },
      );
      const completedTaskEnvelope = await completedTaskResponse.json();
      const completedReservation = await db.query<{
        amount_consumed: number | string;
        status: string;
      }>(
        "SELECT amount_consumed, status FROM credit_reservations WHERE task_id = $1",
        [taskId],
      );

      assert.equal(completedTaskResponse.status, 200);
      assert.equal(completedTaskEnvelope.data.status, "succeeded");
      assert.equal(uploadAttempts, 3);
      assert.equal(uploadedBodies.every((body) => !(body instanceof Uint8Array)), true);
      assert.match(completedTaskEnvelope.data.result.videoUrl, /platform-storage\.example\.test/);
      assert.equal(Number(completedReservation.rows[0]?.amount_consumed ?? -1), 135);
      assert.equal(completedReservation.rows[0]?.status, "settled");
    } finally {
      await server.close();
    }
  });

  it("queues Seedance generation through outbox when BullMQ dispatch is enabled", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'seedance-db-model',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":135}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
      `,
    );
    const providerCalls: string[] = [];
    const server = createPhoneAuthDevServer({
      db,
      env: {
        SEEDANCE_PROVIDER_ENABLED: "true",
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
        VOLCENGINE_ARK_API_KEY: "seedance-test-key",
      },
      fetchImpl: (async (url) => {
        providerCalls.push(String(url));
        return new Response(JSON.stringify({ data: { task_id: "should-not-submit" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138000"));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 1000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "seedance-bullmq-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Seedance BullMQ",
          scriptInput: "Episode 1: Queue Seedance provider calls.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Seedance BullMQ Task" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-bullmq-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
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
      const taskId = videoTaskEnvelope.data.taskId;
      const outbox = await db.query<{
        event_type: string;
        status: string;
        payload_json: {
          taskId?: string;
          modelCode?: string;
          mediaType?: string;
          queueName?: string;
        };
      }>(
        "SELECT event_type, status, payload_json FROM outbox_events WHERE event_type = 'generation.task.created'",
      );
      const providerRequests = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM provider_requests WHERE task_id = $1",
        [taskId],
      );
      const reservation = await db.query<{
        id: string;
        amount_reserved: number | string;
        status: string;
      }>(
        "SELECT id, amount_reserved, status FROM credit_reservations WHERE task_id = $1",
        [taskId],
      );
      const intake = await db.query<{
        idempotency_status: string;
        response_resource_id: string | null;
        snapshot_status: string;
        snapshot_reservation_id: string | null;
      }>(
        `
          SELECT
            idempotency.status AS idempotency_status,
            idempotency.response_resource_id,
            snapshot.status AS snapshot_status,
            snapshot.credit_reservation_id AS snapshot_reservation_id
          FROM idempotency_records idempotency
          JOIN tasks task ON task.id = idempotency.response_resource_id
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
          WHERE idempotency.idempotency_key = 'seedance-bullmq-video-task'
        `,
      );

      assert.equal(videoTaskResponse.status, 200);
      assert.equal(videoTaskEnvelope.data.status, "queued");
      assert.equal(providerCalls.length, 0);
      assert.equal(providerRequests.rows[0]?.count, 1);
      assert.equal(outbox.rows.length, 1);
      assert.equal(outbox.rows[0]?.status, "pending");
      assert.equal(outbox.rows[0]?.payload_json.taskId, taskId);
      assert.equal(outbox.rows[0]?.payload_json.modelCode, "seedance-i2v-pro");
      assert.equal(outbox.rows[0]?.payload_json.mediaType, "video");
      assert.equal(outbox.rows[0]?.payload_json.queueName, "generation-submit-video");
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 135);
      assert.equal(reservation.rows[0]?.status, "active");
      assert.equal(intake.rows[0]?.idempotency_status, "succeeded");
      assert.equal(intake.rows[0]?.response_resource_id, taskId);
      assert.equal(intake.rows[0]?.snapshot_status, "queued");
      assert.equal(intake.rows[0]?.snapshot_reservation_id, reservation.rows[0]?.id);
    } finally {
      await server.close();
    }
  });

  it("rolls back the complete generation intake when the initial outbox write fails", async () => {
    const db = await createMigratedTestDb();
    let failInitialOutbox = false;
    let queuedSnapshotWrites = 0;
    const faultDb = {
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
        if (/INSERT\s+INTO\s+ai_generation_task_snapshots/i.test(sql)) {
          queuedSnapshotWrites += 1;
        }
        if (
          failInitialOutbox &&
          /INSERT\s+INTO\s+outbox_events/i.test(sql) &&
          /generation\.task\.created/.test(sql)
        ) {
          throw new Error("fault_injected_generation_outbox_insert");
        }
        return db.query<T>(sql, params);
      },
      close: () => db.close(),
    };
    const server = createPhoneAuthDevServer({
      db: faultDb,
      env: {
        SEEDANCE_PROVIDER_ENABLED: "true",
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
        REDIS_URL: "redis://127.0.0.1:1",
        VOLCENGINE_ARK_API_KEY: "seedance-test-key",
      },
      fetchImpl: (async () => {
        throw new Error("provider must not be called before intake commit");
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const phone = "13800138000";
      const cookie = await login(server.origin, phone);
      const userId = await readUserIdForPhone(db, normalizeCnPhone(phone));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 1000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "atomic-intake-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Atomic generation intake",
          scriptInput: "Episode 1: Roll back a broken intake.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const episodeResponse = await fetch(`${server.origin}/api/projects/${created.project.id}/episodes`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ title: "Atomic Intake" }),
      });
      const episodeId = (await episodeResponse.json()).data.episode.id;
      const before = await db.query<{
        workflows: number;
        tasks: number;
        snapshots: number;
        reservations: number;
        provider_requests: number;
        outbox_events: number;
        balance: number | string;
        reserved: number | string;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM workflows) AS workflows,
            (SELECT count(*)::int FROM tasks) AS tasks,
            (SELECT count(*)::int FROM ai_generation_task_snapshots) AS snapshots,
            (SELECT count(*)::int FROM credit_reservations) AS reservations,
            (SELECT count(*)::int FROM provider_requests) AS provider_requests,
            (SELECT count(*)::int FROM outbox_events) AS outbox_events,
            credit_balance_cached AS balance,
            credit_reserved_cached AS reserved
          FROM users
          WHERE id = $1
        `,
        [userId],
      );

      const idempotencyKey = `atomic-intake-video-${randomUUID()}`;
      const generationBody = {
        targetType: "episode",
        targetId: episodeId,
        motionPrompt: "camera slowly pushes in",
        model: "seedance-i2v-pro",
        parameters: {
          durationSec: 5,
          resolution: "1080p",
          aspectRatio: "16:9",
          firstFrame: { url: "https://input.example.test/first-frame.png" },
        },
      };
      failInitialOutbox = true;
      const response = await fetch(`${server.origin}/api/episodes/${episodeId}/generation/video-tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          cookie,
        },
        body: JSON.stringify(generationBody),
      });
      failInitialOutbox = false;
      const after = await db.query<typeof before.rows[number]>(
        `
          SELECT
            (SELECT count(*)::int FROM workflows) AS workflows,
            (SELECT count(*)::int FROM tasks) AS tasks,
            (SELECT count(*)::int FROM ai_generation_task_snapshots) AS snapshots,
            (SELECT count(*)::int FROM credit_reservations) AS reservations,
            (SELECT count(*)::int FROM provider_requests) AS provider_requests,
            (SELECT count(*)::int FROM outbox_events) AS outbox_events,
            credit_balance_cached AS balance,
            credit_reserved_cached AS reserved
          FROM users
          WHERE id = $1
        `,
        [userId],
      );
      const idempotency = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM idempotency_records WHERE idempotency_key = $1",
        [idempotencyKey],
      );

      assert.equal(response.status, 500);
      assert.deepEqual(after.rows[0], before.rows[0]);
      assert.equal(idempotency.rows[0]?.count, 0);

      queuedSnapshotWrites = 0;
      const retryResponse = await fetch(`${server.origin}/api/episodes/${episodeId}/generation/video-tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          cookie,
        },
        body: JSON.stringify(generationBody),
      });
      const retryEnvelope = await retryResponse.json();
      const retriedIdempotency = await db.query<{ status: string; response_resource_id: string | null }>(
        "SELECT status, response_resource_id FROM idempotency_records WHERE idempotency_key = $1",
        [idempotencyKey],
      );

      assert.equal(retryResponse.status, 200);
      assert.equal(retryEnvelope.data.status, "queued");
      assert.equal(retriedIdempotency.rows.length, 1);
      assert.equal(retriedIdempotency.rows[0]?.status, "succeeded");
      assert.equal(retriedIdempotency.rows[0]?.response_resource_id, retryEnvelope.data.taskId);
      assert.equal(queuedSnapshotWrites, 1);
    } finally {
      failInitialOutbox = false;
      await server.close();
    }
  });

  it("records every concurrent image generation request when later requests run out of credits", async () => {
    const db = await createMigratedTestDb();
    const modelCode = "batch-credit-gpt-image-test";
    const runId = randomUUID();
    await db.query(
      `
        INSERT INTO ai_model_configs (
          id,
          model_code,
          display_name,
          provider_name,
          provider_model,
          provider_protocol,
          invocation_mode,
          media_type,
          task_modes_json,
          capabilities_json,
          parameter_schema_json,
          default_params_json,
          provider_config_json,
          pricing_json,
          limits_json,
          ui_config_json,
          status,
          sort_order,
          remark,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          'Batch Credit GPT Image Test',
          'OpenAI',
          'gpt-image-2',
          'openai_images',
          'sync',
          'image',
          '["image.generate"]'::jsonb,
          '{"prompt":true}'::jsonb,
          '{"aspectRatio":{"enum":["16:9"]}}'::jsonb,
          '{"aspectRatio":"16:9"}'::jsonb,
          '{"baseURL":"https://relay.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY","resultFormat":"b64_json"}'::jsonb,
          '{"baseCredits":45}'::jsonb,
          '{}'::jsonb,
          '{"label":"Batch Credit GPT Image Test","group":"Test","visible":true}'::jsonb,
          'active',
          -1000,
          '',
          NOW(),
          NOW()
        )
        ON CONFLICT (model_code) DO UPDATE
        SET provider_model = EXCLUDED.provider_model,
            provider_protocol = EXCLUDED.provider_protocol,
            invocation_mode = EXCLUDED.invocation_mode,
            media_type = EXCLUDED.media_type,
            task_modes_json = EXCLUDED.task_modes_json,
            capabilities_json = EXCLUDED.capabilities_json,
            parameter_schema_json = EXCLUDED.parameter_schema_json,
            default_params_json = EXCLUDED.default_params_json,
            provider_config_json = EXCLUDED.provider_config_json,
            pricing_json = EXCLUDED.pricing_json,
            limits_json = EXCLUDED.limits_json,
            ui_config_json = EXCLUDED.ui_config_json,
            status = 'active',
            updated_at = NOW()
      `,
      [randomUUID(), modelCode],
    );
    const server = createPhoneAuthDevServer({
      db,
      env: {
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      fetchImpl: (async () => {
        throw new Error("provider should not be called while queueing");
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const phone = `166${runId.replace(/[^0-9a-f]/gi, "").slice(0, 8).split("").map((char) => char.charCodeAt(0) % 10).join("")}`;
      const normalizedPhone = normalizeCnPhone(phone);
      const cookie = await login(server.origin, phone);

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `concurrent-image-credit-project-${runId}`,
          cookie,
        },
        body: JSON.stringify({
          name: "Concurrent image credit recording",
          scriptInput: "Episode 1: Batch image records all requests.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Concurrent Image Credit" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const userId = await readUserIdForPhone(db, normalizedPhone);
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 45,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const idempotencyKeys = Array.from(
        { length: 4 },
        (_, index) => `concurrent-image-credit-task-${runId}-${index + 1}`,
      );
      const responses = await Promise.all(idempotencyKeys.map((idempotencyKey, index) =>
        fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: `concurrent image ${index + 1}`,
            model: modelCode,
            parameters: { aspectRatio: "16:9" },
          }),
        })
      ));
      const envelopes = await Promise.all(responses.map(async (response) => ({
        status: response.status,
        body: await response.json(),
      })));
      const taskIds = envelopes.map((envelope) => envelope.body.data?.taskId).filter(Boolean);
      const statuses = envelopes.map((envelope) => envelope.body.data?.status).sort();
      const idempotencyRows = await db.query<{
        status: string;
        response_resource_id: string | null;
      }>(
        `
          SELECT status, response_resource_id
          FROM idempotency_records
          WHERE idempotency_key = ANY($1::text[])
          ORDER BY idempotency_key
        `,
        [idempotencyKeys],
      );
      const taskRows = await db.query<{ status: string; failure_code: string | null }>(
        `
          SELECT status, failure_code
          FROM tasks
          WHERE id = ANY($1::uuid[])
          ORDER BY status, failure_code NULLS FIRST
        `,
        [taskIds],
      );
      const outboxRows = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE payload_json->>'taskId' = ANY($1::text[])
        `,
        [taskIds],
      );

      assert.deepEqual(
        envelopes.map((envelope) => envelope.status),
        [200, 200, 200, 200],
        JSON.stringify(envelopes),
      );
      assert.equal(taskIds.length, 4);
      assert.deepEqual(statuses, ["failed", "failed", "failed", "queued"]);
      assert.equal(idempotencyRows.rows.length, 4);
      assert.equal(idempotencyRows.rows.every((row) => row.status === "succeeded"), true);
      assert.equal(idempotencyRows.rows.every((row) => row.response_resource_id), true);
      assert.equal(taskRows.rows.filter((row) => row.status === "failed" && row.failure_code === "insufficient_credits").length, 3);
      assert.equal(outboxRows.rows[0]?.count, 1);
    } finally {
      await server.close();
    }
  });

  it("generates GPT Image 2 images and persists provider artifacts to platform storage", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://relay.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY","resultFormat":"b64_json"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":45}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const providerCalls: Array<{ url: string; body: string }> = [];
    const uploadedBodies: unknown[] = [];
    const server = createPhoneAuthDevServer({
      db,
      env: {
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
        STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      },
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
        adapter: {
          async createSignedReadUrl(input) {
            return {
              url: `https://platform-storage.example.test/${input.objectKey}`,
              expiresAt: input.expiresAt,
            };
          },
          async putObject(input) {
            uploadedBodies.push(input.body);
            return { eTag: "gpt-image-etag" };
          },
        },
      },
      fetchImpl: (async (url, init) => {
        providerCalls.push({ url: String(url), body: String(init?.body ?? "") });
        return new Response(
          JSON.stringify({
            created: 1716026400,
            data: [{ b64_json: Buffer.from("fake-png-bytes").toString("base64") }],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_gpt_image_123",
            },
          },
        );
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138000"));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 100,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "gpt-image-project",
          cookie,
        },
        body: JSON.stringify({
          name: "GPT Image 2",
          scriptInput: "Episode 1: Generate a real provider image.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "GPT Image Task" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "Vertical comic frame of a rainlit city gate.",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "16:9",
              quality: "standard",
            },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const taskId = imageTaskEnvelope.data.taskId;
      const providerRequest = await db.query<{
        status: string;
        external_request_id: string | null;
        response_redacted_json: Record<string, unknown> | null;
      }>(
        "SELECT status, external_request_id, response_redacted_json FROM provider_requests WHERE task_id = $1",
        [taskId],
      );
      const storageObjects = await db.query<{ status: string; content_type: string }>(
        "SELECT status, content_type FROM storage_objects WHERE metadata_json->>'taskId' = $1",
        [taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, status FROM credit_reservations WHERE task_id = $1",
        [taskId],
      );
      const snapshot = await db.query<{
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
        [taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.equal(imageTaskEnvelope.data.status, "succeeded");
      assert.equal(imageTaskEnvelope.data.kind, "image");
      assert.equal(imageTaskEnvelope.data.result.mediaKind, "image");
      assert.match(imageTaskEnvelope.data.result.imageUrl, /^https:\/\//);
      assert.doesNotMatch(imageTaskEnvelope.data.result.imageUrl, /relay\.example\.test/);
      assert.doesNotMatch(JSON.stringify(imageTaskEnvelope.data), /ZmFrZQ|fake-png|relay\.example\.test/);
      assert.equal(providerCalls.length, 1);
      assert.equal(providerCalls[0]?.url, "https://relay.example.test/v1/images/generations");
      assert.match(providerCalls[0]?.body ?? "", /rainlit city gate/);
      assert.equal(uploadedBodies.length, 1);
      assert.equal(uploadedBodies[0] instanceof Uint8Array, true);
      assert.equal(providerRequest.rows[0]?.status, "succeeded");
      assert.equal(providerRequest.rows[0]?.external_request_id, "req_gpt_image_123");
      assert.equal(providerRequest.rows[0]?.response_redacted_json?.artifact?.mediaType, "image");
      assert.equal(providerRequest.rows[0]?.response_redacted_json?.artifact?.mimeType, "image/png");
      assert.match(String(providerRequest.rows[0]?.response_redacted_json?.artifact?.b64Json ?? ""), /^ZmFrZS1w/);
      assert.deepEqual(storageObjects.rows.map((row) => row.status), ["available"]);
      assert.equal(storageObjects.rows[0]?.content_type, "image/png");
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 45);
      assert.equal(reservation.rows[0]?.status, "settled");
      assert.equal(snapshot.rows[0]?.status, "succeeded");
      assert.equal(snapshot.rows[0]?.progress_stage, "completed");
      assert.equal(snapshot.rows[0]?.credit_status, "consumed");
      assert.equal(snapshot.rows[0]?.result_assets_json[0]?.mediaKind, "image");
      assert.match(snapshot.rows[0]?.result_assets_json[0]?.url ?? "", /^https:\/\//);
      assert.doesNotMatch(snapshot.rows[0]?.result_assets_json[0]?.url ?? "", /relay\.example\.test/);
    } finally {
      await server.close();
    }
  });

  it("keeps queued Cumob image submissions running and schedules their first poll", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_name = 'Cumob',
            provider_model = 'gpt-image-2-pro',
            provider_protocol = 'cumob_image',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://cumob.example.test","endpoint":"/v1/images/generations","queryTaskEndpoint":"/v1/status/{taskId}","apiKeyEnv":"CUMOB_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":58}'::jsonb
        WHERE model_code = 'cumob-gpt-image-2-pro'
      `,
    );
    const server = createPhoneAuthDevServer({
      db,
      env: {
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
        BULLMQ_WORKERS_ENABLED: "false",
        CUMOB_API_KEY: "cumob-test-key",
      },
      fetchImpl: (async () => new Response(
        JSON.stringify({
          id: "cumob-queued-image-1",
          object: "task",
          status: "queued",
          progress: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138017");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138017"));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 100,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "queued Cumob image test",
        createdByUserId: userId,
        now: new Date(),
      });
      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "cumob-queued-image-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Queued Cumob Image",
          scriptInput: "Episode 1: Keep an accepted image task running.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: "Queued Cumob Image" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "cumob-queued-image-task",
          cookie,
        },
        body: JSON.stringify({
          targetType: "episode",
          targetId: episodeId,
          prompt: "Queued Cumob image",
          model: "cumob-gpt-image-2-pro",
          parameters: { aspectRatio: "16:9" },
        }),
      });
      const imageTaskEnvelope = await imageTaskResponse.json();
      const taskId = imageTaskEnvelope.data.taskId;
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [taskId],
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE task_id = $1",
        [taskId],
      );
      const providerRequest = await db.query<{
        status: string;
        failure_code: string | null;
        external_request_id: string | null;
        next_poll_at: Date | null;
      }>(
        "SELECT status, failure_code, external_request_id, next_poll_at FROM provider_requests WHERE task_id = $1",
        [taskId],
      );
      const snapshot = await db.query<{
        status: string;
        progress_stage: string;
        failure_json: Record<string, unknown> | null;
      }>(
        "SELECT status, progress_stage, failure_json FROM ai_generation_task_snapshots WHERE task_id = $1",
        [taskId],
      );
      const reservation = await db.query<{
        amount_consumed: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_consumed, amount_released, status FROM credit_reservations WHERE task_id = $1",
        [taskId],
      );

      assert.equal(imageTaskResponse.status, 200, JSON.stringify(imageTaskEnvelope));
      assert.equal(imageTaskEnvelope.data.status, "running");
      assert.equal(task.rows[0]?.status, "running");
      assert.equal(task.rows[0]?.failure_code, null);
      assert.equal(attempt.rows[0]?.status, "running");
      assert.equal(attempt.rows[0]?.failure_code, null);
      assert.equal(providerRequest.rows[0]?.status, "accepted");
      assert.equal(providerRequest.rows[0]?.failure_code, null);
      assert.equal(providerRequest.rows[0]?.external_request_id, "cumob-queued-image-1");
      assert.ok(providerRequest.rows[0]?.next_poll_at);
      assert.equal(snapshot.rows[0]?.status, "running");
      assert.equal(snapshot.rows[0]?.progress_stage, "provider_accepted");
      assert.equal(snapshot.rows[0]?.failure_json, null);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 0);
      assert.equal(reservation.rows[0]?.status, "active");
    } finally {
      await server.close();
    }
  });

  it("fails Seedance tasks when provider output cannot be uploaded to platform storage", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'seedance-db-model',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://ark-db.example.test","createTaskEndpoint":"/db/create","queryTaskEndpoint":"/db/query/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":135}'::jsonb
        WHERE model_code = 'seedance-i2v-pro'
      `,
    );
    let uploadAttempts = 0;
    const server = createPhoneAuthDevServer({
      db,
      env: {
        SEEDANCE_PROVIDER_ENABLED: "true",
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
        BULLMQ_WORKERS_ENABLED: "false",
        VOLCENGINE_ARK_API_KEY: "seedance-test-key",
        STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
        GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
        GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
      },
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
        adapter: {
          async createSignedReadUrl(input) {
            return {
              url: `https://platform-storage.example.test/${input.objectKey}`,
              expiresAt: input.expiresAt,
            };
          },
          async putObject() {
            uploadAttempts += 1;
            throw new Error("cos_upload_failed");
          },
        },
      },
      fetchImpl: (async (url, init) => {
        if (String(url).includes("/db/query/seedance-external-task-1")) {
          return new Response(
            JSON.stringify({
              data: {
                task_id: "seedance-external-task-1",
                status: "succeeded",
                result: {
                  video_url: "https://cdn.example.test/seedance-result.mp4",
                },
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (String(url) === "https://cdn.example.test/seedance-result.mp4") {
          return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
            status: 200,
            headers: { "content-type": "video/mp4" },
          });
        }
        return new Response(
          JSON.stringify({
            data: {
              task_id: "seedance-external-task-1",
              status: "queued",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138000"));
      await seedActiveGenerationMembership(db, { userId });
      await grantCredits(db, {
        userId,
        amount: 1000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "seedance-storage-failure-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Seedance storage failure",
          scriptInput: "Episode 1: Seedance provider succeeds but storage fails.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Seedance Storage Failure Task" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "seedance-storage-failure-video-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
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
      const taskId = videoTaskEnvelope.data.taskId;

      const completedTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${taskId}`,
        { headers: { cookie } },
      );
      const completedTaskEnvelope = await completedTaskResponse.json();
      const completedReservation = await db.query<{
        amount_reserved: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE task_id = $1",
        [taskId],
      );
      const storageObjects = await db.query<{ status: string }>(
        "SELECT status FROM storage_objects WHERE metadata_json->>'taskId' = $1",
        [taskId],
      );

      assert.equal(videoTaskResponse.status, 200);
      assert.equal(completedTaskResponse.status, 200);
      assert.equal(completedTaskEnvelope.data.status, "failed");
      assert.equal(completedTaskEnvelope.data.failureCode, "provider_output_upload_failed");
      assert.equal(completedTaskEnvelope.data.result, null);
      assert.equal(uploadAttempts, 3);
      assert.doesNotMatch(JSON.stringify(completedTaskEnvelope.data), /cdn\.example\.test/);
      assert.equal(Number(completedReservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(completedReservation.rows[0]?.amount_released ?? -1), 135);
      assert.equal(completedReservation.rows[0]?.status, "released");
      assert.deepEqual(storageObjects.rows.map((row) => row.status), ["failed"]);
    } finally {
      await server.close();
    }
  });

  it("rejects media from another episode when setting storyboard media, deleting files, or exporting original video", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-cross-media-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode media isolation",
          scriptInput: "Episode 1: Media cannot cross episode boundaries.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      async function createEpisode(title: string) {
        const response = await fetch(`${server.origin}/api/projects/${created.project.id}/episodes`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title }),
        });
        const envelope = await response.json();
        assert.equal(response.status, 200);
        return envelope.data.episode.id as string;
      }

      async function createShot(episodeId: string, title: string) {
        const response = await fetch(`${server.origin}/api/creator/shots`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            projectId: created.project.id,
            episodeId,
            title,
            description: `${title} description.`,
          }),
        });
        const payload = await response.json();
        assert.equal(response.status, 200);
        return payload.shot.id as string;
      }

      const firstEpisodeId = await createEpisode("Episode One");
      const secondEpisodeId = await createEpisode("Episode Two");
      const secondStoryboardId = await createShot(secondEpisodeId, "Episode Two Shot");

      const firstVideoResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-cross-media-video",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: firstEpisodeId,
            motionPrompt: "video belongs to episode one",
            model: "video_mock_1",
          }),
        },
      );
      const firstVideo = (await firstVideoResponse.json()).data;
      const firstImageResponse = await fetchEpisodeImageTask(server.origin, firstEpisodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-cross-media-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: firstEpisodeId,
            prompt: "image belongs to episode one",
            model: "nano_banana_2",
          }),
        },
      );
      const firstImage = (await firstImageResponse.json()).data;

      const crossSetImageResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/storyboards/${secondStoryboardId}/set-current-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: firstImage.result.assetVersionId,
            storageObjectId: firstImage.result.storageObjectId,
          }),
        },
      );
      const crossSetImage = await crossSetImageResponse.json();

      const crossSetResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/storyboards/${secondStoryboardId}/set-current-video`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: firstVideo.result.assetVersionId,
            storageObjectId: firstVideo.result.storageObjectId,
          }),
        },
      );
      const crossSet = await crossSetResponse.json();

      const crossDeleteResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/file-resources/${firstImage.result.storageObjectId}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: firstImage.result.assetVersionId,
            storageObjectId: firstImage.result.storageObjectId,
          }),
        },
      );
      const crossDelete = await crossDeleteResponse.json();

      const crossExportResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/export-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: firstVideo.result.assetVersionId,
            storageObjectId: firstVideo.result.storageObjectId,
          }),
        },
      );
      const crossExport = await crossExportResponse.json();
      assert.equal(firstVideoResponse.status, 200);
      assert.equal(firstImageResponse.status, 200);
      assert.equal(firstVideo.episodeId, firstEpisodeId);
      assert.equal(firstImage.episodeId, firstEpisodeId);
      assert.equal(crossSetImageResponse.status, 404);
      assert.equal(crossSetImage.errorCode, "resource_not_found");
      assert.equal(crossSetResponse.status, 404);
      assert.equal(crossSet.errorCode, "resource_not_found");
      assert.equal(crossDeleteResponse.status, 404);
      assert.equal(crossDelete.errorCode, "resource_not_found");
      assert.equal(crossExportResponse.status, 404);
      assert.equal(crossExport.errorCode, "resource_not_found");
    } finally {
      await server.close();
    }
  });

  it("marks expired result-unknown image tasks as task_timeout and releases reserved credits", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-timeout-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode generation timeout",
          scriptInput: "Episode 1: timeout stale generation.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Timeout" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-timeout-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "stale image task",
            model: "nano_banana_2",
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const taskId = imageTaskEnvelope.data.taskId;
      const runtimeRows = await db.query<{ current_attempt_id: string | null }>(
        "SELECT current_attempt_id FROM tasks WHERE id = $1",
        [taskId],
      );
      const attemptId = runtimeRows.rows[0]?.current_attempt_id;
      const providerRequestId = randomUUID();
      assert.ok(attemptId);

      const past = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      await db.query(
        `
          UPDATE task_attempts
          SET status = 'running',
              failure_code = NULL,
              finished_at = NULL,
              locked_by = 'timeout-test-worker',
              locked_until = $2::timestamptz,
              heartbeat_at = $2::timestamptz,
              updated_at = $2::timestamptz
          WHERE id = $1
        `,
        [attemptId, past],
      );
      await db.query(
        `
          WITH task_row AS (
            SELECT project_id, workflow_id
            FROM tasks
            WHERE id = $1
          )
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id, attempt_id,
            provider_name, provider_operation, request_key, request_hash,
            payload_ref, payload_hash, payload_redacted_json, status, created_at, updated_at
          )
          SELECT
            $2, project_id, workflow_id, $1, $3,
            'timeout-test-provider', 'episode.image.generate', $4, $4,
            $4, $4, '{}'::jsonb, 'created', $5::timestamptz, $5::timestamptz
          FROM task_row
        `,
        [taskId, providerRequestId, attemptId, `timeout-test:${taskId}`, past],
      );
      await db.query(
        `
          UPDATE credit_reservations
          SET amount_reserved = amount_total,
              amount_consumed = 0,
              amount_released = 0,
              status = 'active',
              updated_at = $2
          WHERE task_id = $1
        `,
        [taskId, past],
      );
      await db.query(
        `
          UPDATE tasks
          SET status = 'result_unknown',
              failure_code = NULL,
              input_snapshot_json = jsonb_set(
                jsonb_set(input_snapshot_json, '{requestedAt}', to_jsonb($2::text), true),
                '{timeoutAt}',
                to_jsonb($2::text),
                true
              ),
              updated_at = $2::timestamptz
          WHERE id = $1
        `,
        [taskId, past],
      );

      const [timeoutLookupResponse, concurrentTimeoutLookupResponse] = await Promise.all([
        fetch(`${server.origin}/api/generation-tasks/${taskId}`, { headers: { cookie } }),
        fetch(`${server.origin}/api/generation-tasks/${taskId}`, { headers: { cookie } }),
      ]);
      const timeoutLookupEnvelope = await timeoutLookupResponse.json();
      await concurrentTimeoutLookupResponse.json();

      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        amount_released: number | string;
        status: string;
      }>(
        `
          SELECT amount_reserved, amount_consumed, amount_released, status
          FROM credit_reservations
          WHERE task_id = $1
        `,
        [taskId],
      );
      const attempt = await db.query<{ status: string; failure_code: string | null; finished_at: Date | null }>(
        "SELECT status, failure_code, finished_at FROM task_attempts WHERE id = $1",
        [attemptId],
      );
      const providerRequest = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE id = $1",
        [providerRequestId],
      );
      const timeoutAllocations = await db.query<{ count: number | string }>(
        `
          SELECT COUNT(*) AS count
          FROM credit_reservation_allocations
          WHERE task_id = $1 AND allocation_key = 'task-timeout'
        `,
        [taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.equal(timeoutLookupResponse.status, 200);
      assert.equal(concurrentTimeoutLookupResponse.status, 200);
      assert.equal(timeoutLookupEnvelope.data.status, "failed");
      assert.equal(timeoutLookupEnvelope.data.failureCode, "task_timeout");
      assert.equal(timeoutLookupEnvelope.data.failure.noticeType, "error");
      assert.equal(timeoutLookupEnvelope.data.failure.displayMessage, "生成任务超过平台等待时间（图片和音频 1 小时，视频 3 小时），已按超时策略处理。积分结果请以任务账务状态和积分账本为准。");
      assert.equal(timeoutLookupEnvelope.data.credit.released, 90);
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 90);
      assert.equal(reservation.rows[0]?.status, "released");
      assert.deepEqual(attempt.rows[0]?.status, "failed");
      assert.deepEqual(attempt.rows[0]?.failure_code, "task_timeout");
      assert.ok(attempt.rows[0]?.finished_at);
      assert.deepEqual(providerRequest.rows[0], { status: "failed", failure_code: "task_timeout" });
      assert.equal(Number(timeoutAllocations.rows[0]?.count ?? 0), 1);
    } finally {
      await server.close();
    }
  });

  it("preserves credits and marks the task graph result_unknown when an expired provider request already started", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-timeout-provider-started-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode provider-started timeout",
          scriptInput: "Episode 1: provider request already started.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: "Provider Started Timeout" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-timeout-provider-started-image",
          cookie,
        },
        body: JSON.stringify({
          targetType: "episode",
          targetId: episodeId,
          prompt: "provider-started timeout image",
          model: "nano_banana_2",
        }),
      });
      const taskId = (await imageTaskResponse.json()).data.taskId;
      const runtimeRows = await db.query<{ current_attempt_id: string | null }>(
        "SELECT current_attempt_id FROM tasks WHERE id = $1",
        [taskId],
      );
      const attemptId = runtimeRows.rows[0]?.current_attempt_id;
      const providerRequestId = randomUUID();
      assert.ok(attemptId);
      const past = new Date(Date.now() - 16 * 60 * 1000).toISOString();

      await db.query(
        `
          UPDATE credit_reservations
          SET amount_reserved = amount_total,
              amount_consumed = 0,
              amount_released = 0,
              status = 'active',
              updated_at = $2
          WHERE task_id = $1
        `,
        [taskId, past],
      );
      await db.query(
        `
          UPDATE task_attempts
          SET status = 'running',
              failure_code = NULL,
              finished_at = NULL,
              locked_by = 'provider-started-worker',
              locked_until = $2::timestamptz,
              heartbeat_at = $2::timestamptz,
              updated_at = $2::timestamptz
          WHERE id = $1
        `,
        [attemptId, past],
      );
      await db.query(
        `
          UPDATE tasks
          SET status = 'running',
              current_attempt_id = $2,
              attempt_count = 1,
              failure_code = NULL,
              input_snapshot_json = jsonb_set(
                jsonb_set(input_snapshot_json, '{requestedAt}', to_jsonb($3::text), true),
                '{timeoutAt}',
                to_jsonb($3::text),
                true
              ),
              updated_at = $3::timestamptz
          WHERE id = $1
        `,
        [taskId, attemptId, past],
      );
      await db.query(
        `
          WITH task_row AS (
            SELECT project_id, workflow_id
            FROM tasks
            WHERE id = $1
          )
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id, attempt_id,
            provider_name, provider_operation, request_key, request_hash,
            payload_ref, payload_hash, payload_redacted_json, status,
            external_submission_started_at, external_request_id, created_at, updated_at
          )
          SELECT
            $2, project_id, workflow_id, $1, $3,
            'timeout-test-provider', 'episode.image.generate', $4, $4,
            $4, $4, '{}'::jsonb, 'running',
            $5::timestamptz, 'provider-external-timeout-1', $5::timestamptz, $5::timestamptz
          FROM task_row
        `,
        [taskId, providerRequestId, attemptId, `provider-started-timeout:${taskId}`, past],
      );

      const timeoutLookupResponse = await fetch(
        `${server.origin}/api/generation-tasks/${taskId}`,
        { headers: { cookie } },
      );
      const timeoutLookupEnvelope = await timeoutLookupResponse.json();
      const taskGraph = await db.query<{
        task_status: string;
        task_failure_code: string | null;
        attempt_status: string;
        attempt_failure_code: string | null;
        attempt_finished_at: Date | null;
        provider_status: string;
        provider_failure_code: string | null;
        snapshot_status: string;
        credit_status: string;
        reservation_status: string;
        amount_reserved: number | string;
        amount_released: number | string;
      }>(
        `
          SELECT
            t.status AS task_status,
            t.failure_code AS task_failure_code,
            a.status AS attempt_status,
            a.failure_code AS attempt_failure_code,
            a.finished_at AS attempt_finished_at,
            p.status AS provider_status,
            p.failure_code AS provider_failure_code,
            s.status AS snapshot_status,
            s.credit_status,
            r.status AS reservation_status,
            r.amount_reserved,
            r.amount_released
          FROM tasks t
          JOIN task_attempts a ON a.id = t.current_attempt_id
          JOIN provider_requests p ON p.id = $2
          JOIN ai_generation_task_snapshots s ON s.task_id = t.id
          JOIN credit_reservations r ON r.task_id = t.id
          WHERE t.id = $1
        `,
        [taskId, providerRequestId],
      );
      const current = taskGraph.rows[0];

      assert.equal(timeoutLookupResponse.status, 200);
      assert.equal(timeoutLookupEnvelope.data.status, "result_unknown");
      assert.equal(timeoutLookupEnvelope.data.failureCode, "provider_poll_timeout");
      assert.equal(current?.task_status, "result_unknown");
      assert.equal(current?.task_failure_code, "provider_poll_timeout");
      assert.equal(current?.attempt_status, "result_unknown");
      assert.equal(current?.attempt_failure_code, "provider_poll_timeout");
      assert.ok(current?.attempt_finished_at);
      assert.equal(current?.provider_status, "result_unknown");
      assert.equal(current?.provider_failure_code, "provider_poll_timeout");
      assert.equal(current?.snapshot_status, "result_unknown");
      assert.equal(current?.credit_status, "manual_review_required");
      assert.equal(current?.reservation_status, "manual_review_required");
      assert.equal(Number(current?.amount_reserved ?? -1), 90);
      assert.equal(Number(current?.amount_released ?? -1), 0);
    } finally {
      await server.close();
    }
  });

  it("skips locked stale episode generation tasks until their transaction finishes", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-timeout-repair-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode generation timeout repair",
          scriptInput: "Episode 1: repair stale generation.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Timeout Repair" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-timeout-repair-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "repair stale image task",
            model: "nano_banana_2",
          }),
        },
      );
      const taskId = (await imageTaskResponse.json()).data.taskId;

      const past = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      await db.query(
        `
          UPDATE credit_reservations
          SET amount_reserved = amount_total,
              amount_consumed = 0,
              amount_released = 0,
              status = 'active',
              updated_at = $2::timestamptz
          WHERE task_id = $1
        `,
        [taskId, past],
      );
      await db.query(
        `
          UPDATE tasks
          SET status = 'queued',
              failure_code = NULL,
              input_snapshot_json = jsonb_set(
                jsonb_set(input_snapshot_json, '{requestedAt}', to_jsonb($2::text), true),
                '{timeoutAt}',
                to_jsonb($2::text),
                true
              ),
              updated_at = $2::timestamptz
          WHERE id = $1
        `,
        [taskId, past],
      );

      let releaseTaskLock!: () => void;
      const taskLockReleased = new Promise<void>((resolve) => {
        releaseTaskLock = resolve;
      });
      let taskLockHeld!: () => void;
      const taskLocked = new Promise<void>((resolve) => {
        taskLockHeld = resolve;
      });
      const lockTransaction = runWithDatabaseContext(async () => {
        await db.query("BEGIN");
        try {
          await db.query("SELECT id FROM tasks WHERE id = $1 FOR UPDATE", [taskId]);
          taskLockHeld();
          await taskLockReleased;
          await db.query("COMMIT");
        } catch (error) {
          await db.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      });
      await taskLocked;

      try {
        const lockedRepairResponse = await fetch(`${server.origin}/api/storage/repair`, {
          method: "POST",
          headers: { cookie },
        });
        const lockedRepair = await lockedRepairResponse.json();
        const lockedTask = await db.query<{ status: string }>(
          "SELECT status FROM tasks WHERE id = $1",
          [taskId],
        );

        assert.equal(lockedRepairResponse.status, 200);
        assert.deepEqual(lockedRepair.episodeGeneration.timedOutTaskIds, []);
        assert.equal(lockedTask.rows[0]?.status, "queued");
      } finally {
        releaseTaskLock();
        await lockTransaction;
      }

      const repairResponse = await fetch(`${server.origin}/api/storage/repair`, {
        method: "POST",
        headers: { cookie },
      });
      const repair = await repairResponse.json();
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE task_id = $1",
        [taskId],
      );

      assert.equal(repairResponse.status, 200);
      assert.deepEqual(repair.episodeGeneration.timedOutTaskIds, [taskId]);
      assert.equal(task.rows[0]?.status, "failed");
      assert.equal(task.rows[0]?.failure_code, "task_timeout");
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 90);
      assert.equal(reservation.rows[0]?.status, "released");
    } finally {
      await server.close();
    }
  });

  it("repairs stale episode generation tasks from the background scheduler", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      repairScheduler: {
        enabled: true,
        intervalMs: 250,
        limit: 10,
      },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      await seedGenerationAccessForPhone(db, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-scheduler-repair-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode scheduler timeout repair",
          scriptInput: "Episode 1: scheduler repairs stale generation.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Scheduler Repair" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const imageTaskResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-scheduler-repair-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "scheduler stale image task",
            model: "nano_banana_2",
          }),
        },
      );
      const taskId = (await imageTaskResponse.json()).data.taskId;

      const past = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      await db.query(
        `
          UPDATE credit_reservations
          SET amount_reserved = amount_total,
              amount_consumed = 0,
              amount_released = 0,
              status = 'active',
              updated_at = $2::timestamptz
          WHERE task_id = $1
        `,
        [taskId, past],
      );
      await db.query(
        `
          UPDATE tasks
          SET status = 'queued',
              failure_code = NULL,
              input_snapshot_json = jsonb_set(
                jsonb_set(input_snapshot_json, '{requestedAt}', to_jsonb($2::text), true),
                '{timeoutAt}',
                to_jsonb($2::text),
                true
              ),
              updated_at = $2::timestamptz
          WHERE id = $1
        `,
        [taskId, past],
      );

      const repaired = await waitFor(async () => {
        const row = await db.query<{
          task_status: string;
          failure_code: string | null;
          amount_reserved: number | string;
          amount_released: number | string;
          reservation_status: string;
        }>(
          `
            SELECT
              t.status AS task_status,
              t.failure_code,
              r.amount_reserved,
              r.amount_released,
              r.status AS reservation_status
            FROM tasks t
            JOIN credit_reservations r ON r.task_id = t.id
            WHERE t.id = $1
          `,
          [taskId],
        );
        const current = row.rows[0];
        if (
          current?.task_status === "failed" &&
          current.failure_code === "task_timeout" &&
          Number(current.amount_reserved) === 0 &&
          Number(current.amount_released) === 90 &&
          current.reservation_status === "released"
        ) {
          return current;
        }
        return null;
      }, 5_000);

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200);
      assert.equal(repaired.task_status, "failed");
      assert.equal(repaired.failure_code, "task_timeout");
      assert.equal(Number(repaired.amount_reserved), 0);
      assert.equal(Number(repaired.amount_released), 90);
      assert.equal(repaired.reservation_status, "released");
    } finally {
      await server.close();
    }
  });

  it("rejects non-whitelisted CORS origins with an enveloped 403", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/api/auth/session`, {
        headers: {
          origin: "https://evil.example",
        },
      });
      const payload = await response.json();

      assert.equal(response.status, 403);
      assert.equal(payload.errorCode, "origin_forbidden");
      assert.match(payload.requestId, /.+/);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    } finally {
      await server.close();
    }
  });

  it("rejects viewer episode write operations with an enveloped 403", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "viewer-episode-permission-project",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "Viewer episode permission",
          scriptInput: "Episode 1: A viewer may inspect but cannot mutate episode workbench data.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "viewer-episode-permission-episode",
            cookie: ownerCookie,
          },
          body: JSON.stringify({ title: "Viewer Locked Episode" }),
        },
      );
      const createdEpisode = await createEpisodeResponse.json();
      const episodeId = createdEpisode.data.episode.id;

      const createViewerResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          teamAccount: `viewer_${randomUUID().slice(0, 8)}`,
          displayName: "Viewer",
          projectIds: [created.project.id],
          initialCredits: 0,
        }),
      });
      const createdViewer = await createViewerResponse.json();
      await db.query(
        "UPDATE team_member_projects SET role = 'viewer' WHERE member_id = $1 AND project_id = $2",
        [createdViewer.member.membershipId, created.project.id],
      );
      const viewerCookie = await loginTeamMemberAccount(
        server.origin,
        createdViewer.member.memberLoginAccount,
        createdViewer.temporaryPassword,
      );
      const viewerSession = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie: viewerCookie },
      });
      await viewerSession.json();

      const readResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/workbench`,
        { headers: { cookie: viewerCookie } },
      );
      const writeResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "viewer-episode-permission-image",
            cookie: viewerCookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "viewer should be rejected",
            model: "nano_banana_2",
          }),
        },
      );
      const write = await writeResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createViewerResponse.status, 200);
      assert.equal(viewerSession.status, 200);
      assert.equal(readResponse.status, 200);
      assert.equal(writeResponse.status, 403);
      assert.equal(write.errorCode, "permission_denied");
      assert.equal(write.details.reason, "capability_missing");
      assert.match(write.requestId, /.+/);
    } finally {
      await server.close();
    }
  });

  it("hides episode routes from users other than the project owner", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "cross-user-episode-project",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "Cross user episode isolation",
          scriptInput: "Episode 1: Another user must not see this episode.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "cross-user-episode-create",
            cookie: ownerCookie,
          },
          body: JSON.stringify({ title: "Owner Episode" }),
        },
      );
      const createdEpisode = await createEpisodeResponse.json();
      const episodeId = createdEpisode.data.episode.id;

      const outsiderCookie = await login(server.origin, "13800138003");
      const outsiderSession = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie: outsiderCookie },
      });
      const outsider = await outsiderSession.json();
      const readResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/workbench`,
        { headers: { cookie: outsiderCookie } },
      );
      const read = await readResponse.json();
      const writeResponse = await fetchEpisodeImageTask(server.origin, episodeId, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "cross-org-episode-write",
            cookie: outsiderCookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "outsider should not see this",
            model: "nano_banana_2",
          }),
        },
      );
      const write = await writeResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(outsiderSession.status, 200);
      assert.equal(readResponse.status, 404);
      assert.equal(read.errorCode, "resource_not_found");
      assert.equal(read.details.reason, "project_not_found");
      assert.equal(writeResponse.status, 404);
      assert.equal(write.errorCode, "resource_not_found");
      assert.equal(write.details.reason, "project_not_found");
    } finally {
      await server.close();
    }
  });

  it("exposes a package script for starting the dev server", async () => {
    const packageJson = await readFile(
      new URL("../../../../../package.json", import.meta.url),
      "utf8",
    );
    const launcherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-dev-server.mjs", import.meta.url),
      "utf8",
    );
    const httpOnlyLauncherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-http-only.mjs", import.meta.url),
      "utf8",
    );

    assert.match(packageJson, /"dev:phone-auth"/);
    assert.match(packageJson, /"dev:http-only"/);
    assert.match(packageJson, /"dev:phone-auth:http-only"/);
    assert.match(packageJson, /--import tsx/);
    assert.match(packageJson, /run-phone-auth-dev-server\.mjs/);
    assert.match(launcherScript, /phone-auth-dev-server\.ts/);
    assert.match(httpOnlyLauncherScript, /GENERATION_QUEUE_REQUIRED = "false"/);
    assert.match(httpOnlyLauncherScript, /BULLMQ_OUTBOX_DISPATCHER_ENABLED = "false"/);
    assert.match(httpOnlyLauncherScript, /BULLMQ_WORKERS_ENABLED = "false"/);
    assert.match(httpOnlyLauncherScript, /run-phone-auth-dev-server\.mjs/);
  });

  it("routes phone-auth startup through the full dev stack when generation queues are required", async () => {
    const launcherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-dev-server.mjs", import.meta.url),
      "utf8",
    );
    const devStackScript = await readFile(
      new URL("../../../../../scripts/run-creator-dev-stack.mjs", import.meta.url),
      "utf8",
    );

    assert.match(launcherScript, /GENERATION_QUEUE_REQUIRED/);
    assert.match(launcherScript, /BULLMQ_OUTBOX_DISPATCHER_ENABLED/);
    assert.match(launcherScript, /BULLMQ_WORKERS_ENABLED/);
    assert.match(launcherScript, /run-creator-dev-stack\.mjs/);
    assert.match(launcherScript, /CREATOR_DEV_STACK_MANAGED/);
    assert.match(launcherScript, /generation-outbox and generation-worker/);
    assert.match(launcherScript, /npm run dev:http-only/);
    assert.match(devStackScript, /GENERATION_QUEUE_REQUIRED\s*\?\?=\s*"true"/);
    assert.match(devStackScript, /CREATOR_DEV_STACK_MANAGED:\s*"true"/);
    assert.match(devStackScript, /npm run dev:http-only/);
  });

  it("uses an import-based launcher that starts the dev server explicitly", async () => {
    const launcherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-dev-server.mjs", import.meta.url),
      "utf8",
    );
    const devServerScript = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const productionLauncherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-production.mjs", import.meta.url),
      "utf8",
    );
    const productionRuntimeBuildScript = await readFile(
      new URL("../../../../../scripts/build-production-runtime.mjs", import.meta.url),
      "utf8",
    );
    const packageJson = await readFile(
      new URL("../../../../../package.json", import.meta.url),
      "utf8",
    );

    assert.match(launcherScript, /createPhoneAuthDevServer/);
    assert.match(launcherScript, /seedTeamEntitlements/);
    assert.match(launcherScript, /SEED_TEAM_ENTITLEMENTS/);
    assert.match(launcherScript, /SEED_TEAM_ENTITLEMENTS\s*===\s*"true"/);
    assert.doesNotMatch(launcherScript, /SEED_TEAM_ENTITLEMENTS\s*!==\s*"false"/);
    assert.doesNotMatch(launcherScript, /\.local\/dev-db/);
    assert.match(launcherScript, /listenWithRetry\(server, port\)/);
    assert.match(launcherScript, /EADDRINUSE/);
    assert.match(launcherScript, /process\.env\.PORT/);
    assert.match(launcherScript, /await server\.close\(\)/);
    assert.match(launcherScript, /Phone auth dev server stopped/);
    assert.match(launcherScript, /process\.exit\(0\)/);
    assert.match(devServerScript, /httpServer\.closeIdleConnections\(\)/);
    assert.match(devServerScript, /httpServer\.closeAllConnections\(\)/);
    assert.match(packageJson, /--import tsx/);
    assert.match(launcherScript, /--import|--loader/);
    assert.match(launcherScript, /resolveTsxRuntimeArgs\(runtime\)/);
    assert.doesNotMatch(launcherScript, /shell:\s*process\.platform/);
    assert.doesNotMatch(launcherScript, /shell:\s*true/);
    assert.match(launcherScript, /process\.platform === "win32"\s*\?\s*"where\.exe"\s*:\s*"which"/);
    assert.match(launcherScript, /loadDotEnvFile/);
    assert.match(launcherScript, /\.env/);
    assert.match(productionLauncherScript, /allowProduction:\s*true/);
    assert.match(productionLauncherScript, /allowLocalDatabaseUrl:\s*true/);
    assert.match(productionLauncherScript, /listenHost:/);
    assert.match(productionLauncherScript, /NODE_ENV\s*=\s*"production"/);
    assert.match(productionLauncherScript, /createCreatorDevServiceSupervisor/);
    assert.match(productionLauncherScript, /generation-outbox/);
    assert.match(productionRuntimeBuildScript, /run-generation-outbox-dispatcher\.mjs/);
    assert.match(productionLauncherScript, /generation-repair/);
    assert.match(productionRuntimeBuildScript, /run-generation-queue-maintenance\.mjs/);
    assert.match(productionLauncherScript, /generation-worker/);
    assert.match(productionRuntimeBuildScript, /run-generation-video-worker\.mjs/);
    assert.match(productionRuntimeBuildScript, /run-canvas-agent-worker\.mjs/);
    assert.match(productionRuntimeBuildScript, /bundle:\s*true/);
    assert.match(productionLauncherScript, /restartOnFailure:\s*true/);
    assert.match(productionLauncherScript, /server\.close\(\)/);
    assert.doesNotMatch(productionLauncherScript, /npm\s+(start|run)/);
    assert.match(packageJson, /"start"\s*:\s*"node scripts\/run-phone-auth-production\.mjs"/);
  });

  it("gates team member creation behind the paid team entitlement", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138001");

      const overviewResponse = await fetch(`${server.origin}/api/creator/team/overview`, {
        headers: { cookie },
      });
      const overview = await overviewResponse.json();

      const createResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          teamAccount: "api_director_001",
          displayName: "API Director",
          projectIds: [],
          initialCredits: 0,
        }),
      });
      const created = await createResponse.json();

      assert.equal(overviewResponse.status, 200);
      assert.equal(overview.entitlements.teamMemberManagement, false);
      assert.equal(createResponse.status, 402);
      assert.deepEqual(created, { error: "team_member_management_required" });
    } finally {
      await server.close();
    }
  });

  it("creates a team subaccount through the API when paid team entitlement is active", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138001");

      const createResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          teamAccount: "api_director_001",
          displayName: "API Director",
          projectIds: [],
          initialCredits: 0,
        }),
      });
      const created = await createResponse.json();

      const overviewResponse = await fetch(`${server.origin}/api/creator/team/overview`, {
        headers: { cookie },
      });
      const overview = await overviewResponse.json();
      const membersResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        headers: { cookie },
      });
      const members = await membersResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(created.member.teamAccount, "api_director_001");
      assert.match(created.temporaryPassword, /^[A-Za-z0-9_-]{18,}$/);
      assert.equal("passwordHash" in created, false);
      assert.equal("password_hash" in created, false);
      assert.equal(overviewResponse.status, 200);
      assert.equal(overview.entitlements.teamMemberManagement, true);
      assert.equal(overview.seats.limit, 50);
      assert.equal(overview.seats.used, 1);
      assert.equal(membersResponse.status, 200);
      assert.equal(members.members.length, 1);
      assert.equal(members.members[0].teamAccount, "api_director_001");
      assert.equal("passwordHash" in members.members[0], false);
      assert.equal("temporaryPassword" in members.members[0], false);
    } finally {
      await server.close();
    }
  });

  it("updates and deletes team subaccount status through the API", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138001");

      const createResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          teamAccount: `api_status_${Date.now().toString(36).slice(-6)}`,
          displayName: "API Status Member",
          projectIds: [],
          initialCredits: 0,
        }),
      });
      const created = await createResponse.json();
      const memberId = created.member?.membershipId;

      const disableResponse = await fetch(`${server.origin}/api/creator/team/members/${encodeURIComponent(memberId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ status: "disabled" }),
      });
      const disabled = await disableResponse.json();
      const disabledRows = await db.query<{ team_member_status: string }>(
        `
          SELECT status AS team_member_status
          FROM team_members
          WHERE id = $1
        `,
        [memberId],
      );

      const restoreResponse = await fetch(`${server.origin}/api/creator/team/members/${encodeURIComponent(memberId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ status: "active" }),
      });
      const restored = await restoreResponse.json();
      const restoredRows = await db.query<{ team_member_status: string }>(
        `
          SELECT status AS team_member_status
          FROM team_members
          WHERE id = $1
        `,
        [memberId],
      );
      const deleteResponse = await fetch(`${server.origin}/api/creator/team/members/${encodeURIComponent(memberId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ status: "deleted" }),
      });
      const deleted = await deleteResponse.json();
      const deletedRows = await db.query<{ team_member_status: string }>(
        `
          SELECT status AS team_member_status
          FROM team_members
          WHERE id = $1
        `,
        [memberId],
      );
      const membersResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        headers: { cookie },
      });
      const members = await membersResponse.json();

      assert.equal(createResponse.status, 200);
      assert.ok(memberId);
      assert.equal(disableResponse.status, 200);
      assert.equal(disabled.member.status, "disabled");
      assert.equal(disabledRows.rows[0]?.team_member_status, "disabled");
      assert.equal(restoreResponse.status, 200);
      assert.equal(restored.member.status, "active");
      assert.equal(restoredRows.rows[0]?.team_member_status, "active");
      assert.equal(deleteResponse.status, 200);
      assert.equal(deleted.member.status, "deleted");
      assert.equal(deletedRows.rows[0]?.team_member_status, "deleted");
      assert.equal(membersResponse.status, 200);
      assert.equal(
        members.members.some((member: { membershipId?: string }) => member.membershipId === memberId),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("creates membership checkout order and payment intent in one HTTP request", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        TENCENT_SMS_ENABLED: "false",
        WECHAT_PAY_ENABLED: "false",
        ALIPAY_ENABLED: "false",
        PAYMENT_PROVIDER_CALLBACK_BASE_URL: "https://payments.example.test",
        STORAGE_ADAPTER_MODE: "dev",
        STORAGE_PROVIDER: "dev",
      },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138003");

      const plansResponse = await fetch(`${server.origin}/api/membership/plans`, {
        headers: { cookie },
      });
      const plans = await plansResponse.json();
      const plan = plans.data.plans.find((item: { tier?: string }) => item.tier === "experience")
        ?? plans.data.plans[0];
      assert.ok(plan);

      const checkoutResponse = await fetch(`${server.origin}/api/membership/checkout`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "membership-checkout-one-shot",
          cookie,
        },
        body: JSON.stringify({
          membershipPlanId: plan.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        }),
      });
      const checkout = await checkoutResponse.json();
      const replayResponse = await fetch(`${server.origin}/api/membership/checkout`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "membership-checkout-one-shot",
          cookie,
        },
        body: JSON.stringify({
          membershipPlanId: plan.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        }),
      });
      const replay = await replayResponse.json();

      assert.equal(checkoutResponse.status, 200);
      assert.equal(checkout.order.productType, "membership_plan");
      assert.equal(checkout.order.membershipPlanId, plan.id);
      assert.equal(checkout.paymentIntent.orderId, checkout.order.id);
      assert.equal(checkout.paymentIntent.provider, "wechat_pay");
      assert.equal(checkout.payAction.provider, "wechat_pay");
      assert.equal(replayResponse.status, 200);
      assert.equal(replay.order.id, checkout.order.id);
      assert.equal(replay.paymentIntent.id, checkout.paymentIntent.id);

      const paymentLog = await db.query<{
        request_params_json: Record<string, unknown>;
      }>(
        "SELECT request_params_json FROM payment_logs WHERE merchant_order_no = $1",
        [checkout.paymentIntent.merchantOrderNo],
      );
      const notifyUrl = String(paymentLog.rows[0]?.request_params_json?.notifyUrl ?? "");
      const intents = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_intents WHERE order_id = $1",
        [checkout.order.id],
      );
      assert.notEqual(notifyUrl, "");
      assert.doesNotMatch(notifyUrl, /^http:\/\/(?:127\.0\.0\.1|localhost)/i);
      assert.equal(intents.rows[0]?.count, 1);
    } finally {
      await server.close();
    }
  });

  it("does not expose another user's credits as the authenticated user's balance", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138004");
      const user = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE phone_e164 = $1 LIMIT 1",
        ["13800138004"],
      );
      const userId = user.rows[0]?.id;
      assert.ok(userId);



      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });
      const session = await sessionResponse.json();

      assert.equal(sessionResponse.status, 200);
      assert.equal(session.user.availableCredits, 0);
      assert.equal(session.user.creditBalance, 0);
      assert.equal(session.user.displayCreditBalance, 0);
    } finally {
      await server.close();
    }
  });

  it("creates billing recharge orders under the current user", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const packagesResponse = await fetch(`${server.origin}/api/billing/packages`, {
        headers: { cookie },
      });
      const packages = await packagesResponse.json();
      const creditPackage = packages.packages.find(
        (item: { metadata?: { kind?: string } }) => item?.metadata?.kind === "direct_recharge",
      ) ?? packages.packages[0];
      assert.ok(creditPackage);

      const orderResponse = await fetch(`${server.origin}/api/billing/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "billing-order-personal-scope",
          cookie,
        },
        body: JSON.stringify({ creditPackageId: creditPackage.id }),
      });
      const orderPayload = await orderResponse.json();

      const orderRecord = await db.query<{
        created_by_user_id: string;
      }>(
        `
          SELECT created_by_user_id
          FROM billing_orders
          WHERE id = $1
        `,
        [orderPayload.order.id],
      );

      assert.equal(orderResponse.status, 200);
      assert.equal(
        orderRecord.rows[0]?.created_by_user_id,
        await readUserIdForPhone(db, normalizeCnPhone("13800138000")),
      );
    } finally {
      await server.close();
    }
  });

  it("repairs paid membership order effects when the paid order is polled", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138003");

      const plansResponse = await fetch(`${server.origin}/api/membership/plans`, {
        headers: { cookie },
      });
      const plans = await plansResponse.json();
      const professionalPlan = plans.data.plans.find(
        (plan: { tier?: string }) => plan.tier === "professional",
      );
      assert.ok(professionalPlan);

      const orderResponse = await fetch(`${server.origin}/api/membership/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "membership-repair-order",
          cookie,
        },
        body: JSON.stringify({ membershipPlanId: professionalPlan.id }),
      });
      const order = await orderResponse.json();

      const intentResponse = await fetch(`${server.origin}/api/billing/payment-intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "membership-repair-intent",
          cookie,
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
        providerEventDedupKey: "membership-repair-paid-callback",
        merchantOrderNo: intent.paymentIntent.merchantOrderNo,
        providerTradeId: "membership-repair-provider-trade",
        eventType: "payment_succeeded" as const,
        amountMinor: intent.paymentIntent.amountMinor,
        currency: intent.paymentIntent.currency,
        merchantId: "comic-ai-test-merchant",
      };
      const callbackResponse = await fetch(`${server.origin}/api/billing/payment-callback/mock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...callbackFacts,
          signature: signPaymentCallback(callbackFacts, "dev-payment-secret"),
        }),
      });
      await db.query("DELETE FROM user_entitlements WHERE entitlement_key IN ('canvas_access', 'priority_generation', 'team_asset_library', 'team_dashboard', 'team_member_management', 'full_flow_agent')");
      await db.query("UPDATE billing_orders SET credit_grant_ledger_entry_id = NULL WHERE id = $1", [
        order.order.id,
      ]);
      await db.query("DELETE FROM credit_lots WHERE source_type = 'membership_gift'");
      await db.query("DELETE FROM credit_ledger_entries WHERE source_type = 'membership_gift'");
      await db.query("DELETE FROM membership_periods");
      await db.query("DELETE FROM user_memberships");

      const pollResponse = await fetch(`${server.origin}/api/billing/orders/${order.order.id}`, {
        headers: { cookie },
      });
      const polled = await pollResponse.json();
      const statusResponse = await fetch(`${server.origin}/api/membership/status`, {
        headers: { cookie },
      });
      const status = await statusResponse.json();
      const teamResponse = await fetch(`${server.origin}/api/creator/team/overview`, {
        headers: { cookie },
      });
      const team = await teamResponse.json();
      const ledgerResponse = await fetch(`${server.origin}/api/creator/credits/ledger?pageSize=20`, {
        headers: { cookie },
      });
      const ledger = await ledgerResponse.json();
      const giftEntry = ledger.data.find(
        (entry: { sourceType?: string }) => entry.sourceType === "membership_gift",
      );

      assert.equal(plansResponse.status, 200);
      assert.equal(orderResponse.status, 200);
      assert.equal(intentResponse.status, 200);
      assert.equal(callbackResponse.status, 200);
      assert.equal(pollResponse.status, 200);
      assert.equal(polled.order.status, "paid");
      assert.equal(statusResponse.status, 200);
      assert.equal(status.membership.status, "professional_active");
      assert.equal(
        status.membership.entitlements.canvasAccess,
        professionalPlan.entitlements.includes("canvas_access"),
      );
      assert.equal(
        status.membership.entitlements.teamAssetLibrary,
        professionalPlan.entitlements.includes("team_asset_library"),
      );
      assert.equal(
        status.membership.entitlements.teamMemberManagement,
        professionalPlan.entitlements.includes("team_member_management"),
      );
      assert.equal(
        status.membership.entitlements.fullFlowAgent,
        professionalPlan.entitlements.includes("full_flow_agent"),
      );
      assert.equal(teamResponse.status, 200);
      assert.equal(team.entitlements.teamAssetLibrary, true);
      assert.equal(team.entitlements.teamMemberManagement, true);
      assert.equal(team.seats.limit, professionalPlan.seatLimit);
      assert.equal(ledgerResponse.status, 200);
      assert.equal(giftEntry.entryType, "grant");
      assert.equal(giftEntry.amount, professionalPlan.giftCredits);
    } finally {
      await server.close();
    }
  });

  it("rejects direct team asset uploads before the paid team asset entitlement is active", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
      },
    });
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = originalDatabaseUrl || "postgres://upload-gate.test/local";

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138001");

      const response = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "blocked-team-asset-upload",
          cookie,
        },
        body: JSON.stringify({
          projectId: null,
          purpose: "team-assets/character",
          fileName: "blocked-hero.png",
          contentType: "image/png",
          sizeBytes: 1024,
        }),
      });
      const body = await response.json();
      const sessions = await db.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM storage_upload_sessions
          WHERE purpose = 'team-assets/character'
        `,
      );

      assert.equal(response.status, 403);
      assert.equal(body.errorCode, "team_asset_library_entitlement_required");
      assert.equal(sessions.rows[0]?.count, "0");
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
      await server.close();
    }
  });

  it("stores the legacy creator upload route in cloud storage with an upload record", async () => {
    const db = await createMigratedTestDb();
    const uploadedObjects: Array<{ objectKey: string; contentType?: string | null }> = [];
    const server = createPhoneAuthDevServer({
      db,
      env: { STORAGE_PUBLIC_BASE_URL: "https://creator-uploads.example.test" },
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
        publicBaseUrl: "https://creator-uploads.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://creator-uploads.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async putObject(input) {
            uploadedObjects.push({ objectKey: input.objectKey, contentType: input.contentType });
            return { eTag: "creator-upload-etag" };
          },
        },
      },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const formData = new FormData();
      formData.set("category", "compatibility-image");
      formData.set("file", new File([new Uint8Array([1, 2, 3])], "legacy.png", { type: "image/png" }));
      const response = await fetch(`${server.origin}/api/creator/uploads`, {
        method: "POST",
        headers: { cookie },
        body: formData,
      });
      const body = await response.json();
      const tracked = await db.query<{ object_status: string; upload_status: string; source_action: string }>(
        `
          SELECT so.status AS object_status, pur.status AS upload_status, pur.source_action
          FROM storage_objects so
          JOIN project_upload_records pur ON pur.storage_object_id = so.id
          WHERE so.id = $1
        `,
        [body.upload?.storageObjectId],
      );

      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(uploadedObjects.length, 1);
      assert.match(uploadedObjects[0]?.objectKey ?? "", /^AIManhuaDrama\/[0-9a-f-]+\/compatibility-image\/\d{8}\/[0-9a-f-]+-legacy\.png$/);
      assert.equal(uploadedObjects[0]?.contentType, "image/png");
      assert.deepEqual(tracked.rows[0], {
        object_status: "available",
        upload_status: "uploaded",
        source_action: "legacy_creator_upload/compatibility-image",
      });
    } finally {
      await server.close();
    }
  });

  it("stores team uploads in cloud storage with storage objects and upload records", async () => {
    const db = await createMigratedTestDb();
    let uploadedAssetId = "";
    const uploadedObjects: Array<{ objectKey: string; contentType?: string | null; contentLength?: number | null }> = [];
    const server = createPhoneAuthDevServer({
      db,
      seedTeamEntitlements: true,
      env: {
        STORAGE_PUBLIC_BASE_URL: "https://team-assets.example.test",
      },
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
        publicBaseUrl: "https://team-assets.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://team-assets.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async putObject(input) {
            uploadedObjects.push({
              objectKey: input.objectKey,
              contentType: input.contentType,
              contentLength: input.contentLength,
            });
            return { eTag: "team-asset-etag" };
          },
        },
      },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const before = await db.query<{
        upload_sessions: number;
        upload_records: number;
        storage_objects: number;
        library_versions: number;
      }>(
        `
          SELECT
            (SELECT COUNT(*)::int FROM storage_upload_sessions) AS upload_sessions,
            (SELECT COUNT(*)::int FROM project_upload_records) AS upload_records,
            (SELECT COUNT(*)::int FROM storage_objects) AS storage_objects,
            (SELECT COUNT(*)::int FROM library_asset_versions) AS library_versions
        `,
      );
      const formData = new FormData();
      formData.set("category", "character");
      formData.set("assetName", "团队主角");
      formData.set("assetPrompt", "红色披风的青年英雄");
      formData.set("file", new File([new Uint8Array([137, 80, 78, 71])], "hero.png", { type: "image/png" }));
      const response = await fetch(`${server.origin}/api/creator/team-assets/upload`, {
        method: "POST",
        headers: { cookie },
        body: formData,
      });
      const body = await response.json();
      const duplicateFormData = new FormData();
      duplicateFormData.set("category", "character");
      duplicateFormData.set("assetName", " 团队主角 ");
      duplicateFormData.set("file", new File([new Uint8Array([137, 80, 78, 71])], "hero-copy.png", { type: "image/png" }));
      const duplicateResponse = await fetch(`${server.origin}/api/creator/team-assets/upload`, {
        method: "POST",
        headers: { cookie },
        body: duplicateFormData,
      });
      const duplicateBody = await duplicateResponse.json();
      uploadedAssetId = String(body.asset?.id ?? "");
      const listResponse = await fetch(
        `${server.origin}/api/creator/library/assets?scope=team&category=character`,
        { headers: { cookie } },
      );
      const listBody = await listResponse.json();
      const listedAsset = listBody.assets.find((asset: { id: string }) => asset.id === uploadedAssetId);
      const after = await db.query<{
        upload_sessions: number;
        upload_records: number;
        storage_objects: number;
        library_versions: number;
      }>(
        `
          SELECT
            (SELECT COUNT(*)::int FROM storage_upload_sessions) AS upload_sessions,
            (SELECT COUNT(*)::int FROM project_upload_records) AS upload_records,
            (SELECT COUNT(*)::int FROM storage_objects) AS storage_objects,
            (SELECT COUNT(*)::int FROM library_asset_versions) AS library_versions
        `,
      );
      const stored = await db.query<{
        admin_user_id: string;
        asset_name: string;
        asset_prompt: string | null;
        asset_category: string;
        asset_url: string;
        resource_type: string;
        resource_size: number | string;
        created_by_name: string;
        updated_by_name: string;
        is_admin_created: boolean;
        created_user_id: string;
        tags_json: string[] | string;
      }>("SELECT * FROM team_assets WHERE id = $1", [body.asset?.id]);
      const renameResponse = await fetch(`${server.origin}/api/creator/team-assets/${body.asset?.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "重命名团队主角", prompt: "更新后的团队角色描述", tags: ["主角", "红披风"] }),
      });
      const renamed = await renameResponse.json();
      const replacementFormData = new FormData();
      replacementFormData.set("assetName", "编辑后的团队主角");
      replacementFormData.set("assetPrompt", "编辑后的团队角色描述");
      replacementFormData.set("file", new File([new Uint8Array([137, 80, 78, 71, 13])], "hero-edited.png", { type: "image/png" }));
      const replacementResponse = await fetch(`${server.origin}/api/creator/team-assets/${body.asset?.id}/upload`, {
        method: "POST",
        headers: { cookie },
        body: replacementFormData,
      });
      const edited = await db.query<{
        asset_name: string;
        asset_prompt: string | null;
        asset_url: string;
        resource_size: number | string;
        tags_json: string[] | string;
      }>("SELECT asset_name, asset_prompt, asset_url, resource_size, tags_json FROM team_assets WHERE id = $1", [body.asset?.id]);
      const afterEdits = await db.query<{
        upload_sessions: number;
        upload_records: number;
        storage_objects: number;
        library_versions: number;
      }>(`
        SELECT
          (SELECT COUNT(*)::int FROM storage_upload_sessions) AS upload_sessions,
          (SELECT COUNT(*)::int FROM project_upload_records) AS upload_records,
          (SELECT COUNT(*)::int FROM storage_objects) AS storage_objects,
        (SELECT COUNT(*)::int FROM library_asset_versions) AS library_versions
      `);
      const trackedUploads = await db.query<{ source_action: string; status: string }>(
        `
          SELECT source_action, status
          FROM project_upload_records
          WHERE source_action LIKE 'team_asset_%/character'
          ORDER BY created_at ASC
        `,
      );

      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(duplicateResponse.status, 409, JSON.stringify(duplicateBody));
      assert.equal(duplicateBody.errorCode, "ASSET_ALREADY_EXISTS");
      assert.equal(body.asset?.generationTaskId, null);
      assert.equal(body.asset?.generationStatus, null);
      assert.equal(body.asset?.generationResult, null);
      assert.equal(listResponse.status, 200, JSON.stringify(listBody));
      assert.equal(listedAsset?.generationTaskId, null);
      assert.equal(listedAsset?.generationStatus, null);
      assert.equal(listedAsset?.generationResult, null);
      assert.equal(after.rows[0]?.upload_sessions, before.rows[0]?.upload_sessions);
      assert.equal(after.rows[0]?.upload_records, (before.rows[0]?.upload_records ?? 0) + 1);
      assert.equal(after.rows[0]?.storage_objects, (before.rows[0]?.storage_objects ?? 0) + 1);
      assert.equal(after.rows[0]?.library_versions, before.rows[0]?.library_versions);
      assert.equal(
        uploadedObjects[0]?.objectKey.startsWith(`AIManhuaDrama/${stored.rows[0]?.admin_user_id}/character/`),
        true,
      );
      assert.equal(stored.rows[0]?.asset_name, "团队主角");
      assert.equal(stored.rows[0]?.asset_prompt, "红色披风的青年英雄");
      assert.equal(stored.rows[0]?.asset_category, "character");
      assert.deepEqual(stored.rows[0]?.tags_json, []);
      assert.match(stored.rows[0]?.asset_url ?? "", /^https:\/\/team-assets\.example\.test\//);
      assert.equal(stored.rows[0]?.resource_type, "image");
      assert.equal(Number(stored.rows[0]?.resource_size), 4);
      assert.equal(stored.rows[0]?.created_by_name.length > 0, true);
      assert.equal(stored.rows[0]?.updated_by_name, stored.rows[0]?.created_by_name);
      assert.equal(stored.rows[0]?.is_admin_created, true);
      assert.equal(stored.rows[0]?.created_user_id, stored.rows[0]?.admin_user_id);
      assert.equal(renameResponse.status, 200);
      assert.deepEqual(renamed.asset?.tags, ["主角", "红披风"]);
      assert.equal(replacementResponse.status, 200);
      assert.equal(uploadedObjects.length, 2);
      assert.equal(afterEdits.rows[0]?.upload_sessions, before.rows[0]?.upload_sessions);
      assert.equal(afterEdits.rows[0]?.upload_records, (before.rows[0]?.upload_records ?? 0) + 2);
      assert.equal(afterEdits.rows[0]?.storage_objects, (before.rows[0]?.storage_objects ?? 0) + 2);
      assert.equal(afterEdits.rows[0]?.library_versions, before.rows[0]?.library_versions);
      assert.deepEqual(trackedUploads.rows, [
        { source_action: "team_asset_upload/character", status: "uploaded" },
        { source_action: "team_asset_replace/character", status: "uploaded" },
      ]);
      assert.equal(edited.rows[0]?.asset_name, "编辑后的团队主角");
      assert.equal(edited.rows[0]?.asset_prompt, "编辑后的团队角色描述");
      assert.match(edited.rows[0]?.asset_url ?? "", /^https:\/\/team-assets\.example\.test\//);
      assert.equal(Number(edited.rows[0]?.resource_size), 5);
      assert.deepEqual(edited.rows[0]?.tags_json, ["主角", "红披风"]);
    } finally {
      if (uploadedAssetId) {
        await db.query("DELETE FROM team_assets WHERE id = $1", [uploadedAssetId]);
      }
      await server.close();
    }
  });

  it("projects a failed generation task onto a stale generating team asset", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const user = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE phone_e164 = '13800138000' LIMIT 1",
      );
      const userId = user.rows[0]?.id;
      assert.ok(userId);
      const assetId = randomUUID();
      const workflowId = randomUUID();
      const taskId = randomUUID();
      await db.query(
        `
          INSERT INTO team_assets (
            id, admin_user_id, asset_name, asset_prompt, asset_category, asset_status,
            resource_type, created_by_name, updated_by_name, created_user_id
          )
          VALUES ($1, $2, 'Stale generating asset', 'Failed prompt', 'scene', 'generating',
            'image/png', 'Admin', 'Admin', $2)
        `,
        [assetId, userId],
      );
      await db.query(
        `
          INSERT INTO workflows (
            id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id
          )
          VALUES ($1, NULL, 'episode_image_generation', 'failed', '{}'::jsonb, $2)
        `,
        [workflowId, userId],
      );
      await db.query(
        `
          INSERT INTO tasks (
            id, project_id, workflow_id, task_type, status, failure_code, queue_name,
            input_snapshot_json, target_entity_type, target_entity_id
          )
          VALUES ($1, NULL, $2, 'episode_generate_image', 'failed', 'provider_poll_timeout',
            'generation-poll-image', jsonb_build_object('targetType', 'team_asset', 'targetId', $3::text),
            'team_asset', $3::uuid)
        `,
        [taskId, workflowId, assetId],
      );

      const response = await fetch(
        `${server.origin}/api/creator/library/assets?scope=team&category=scene`,
        { headers: { cookie } },
      );
      const body = await response.json();
      const asset = body.assets.find((item: { id: string }) => item.id === assetId);

      assert.equal(response.status, 200);
      assert.equal(asset.status, "failed");
      assert.equal(asset.generationStatus, "failed");
      assert.equal(asset.generationTaskId, taskId);
      assert.equal(asset.generationResult.failureCode, "provider_poll_timeout");
    } finally {
      await server.close();
    }
  });

  it("generates team assets only in the team_assets single table", async () => {
    const db = await createMigratedTestDb();
    const testModelCode = `team-asset-image-${randomUUID()}`;
    let generatedAssetId = "";
    await db.query(`
      INSERT INTO ai_model_configs (
        id, model_code, display_name, provider_name, provider_model, provider_protocol,
        invocation_mode, media_type, task_modes_json, capabilities_json, parameter_schema_json,
        default_params_json, provider_config_json, pricing_json, limits_json, ui_config_json,
        status, sort_order, remark
      )
      SELECT
        $1, $2, 'Team Asset Test Image', provider_name, provider_model, provider_protocol,
        invocation_mode, 'image', task_modes_json, capabilities_json, parameter_schema_json,
        default_params_json,
        provider_config_json || '{"baseURL":"https://global-ai-opc.example.test","requestPath":"/v1/banana/images","endpoint":"/v1/banana/images","createTaskEndpoint":"/v1/banana/images","queryTaskEndpoint":"/v1/result/{taskId}","apiKeyEnv":"GLOBAL_AI_OPC_API_KEY","requestFormat":"global_ai_opc_banana_image"}'::jsonb,
        pricing_json, limits_json, ui_config_json, 'active', sort_order, 'team asset generation test model'
      FROM ai_model_configs
      WHERE model_code = 'global-ai-opc-nano-banana-2'
    `, [randomUUID(), testModelCode]);
    const uploadedObjects: Array<{ objectKey: string; contentLength?: number | null }> = [];
    const providerRequestBodies: Record<string, unknown>[] = [];
    const server = createPhoneAuthDevServer({
      db,
      seedTeamEntitlements: true,
      env: {
        GLOBAL_AI_OPC_API_KEY: "team-asset-generation-test-key",
        STORAGE_PUBLIC_BASE_URL: "https://team-assets.example.test",
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
        BULLMQ_WORKERS_ENABLED: "false",
      },
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
        publicBaseUrl: "https://team-assets.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://team-assets.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async putObject(input) {
            uploadedObjects.push({ objectKey: input.objectKey, contentLength: input.contentLength });
            return { eTag: "generated-team-asset-etag" };
          },
        },
      },
      fetchImpl: (async (_url, init) => {
        if (String(init?.method ?? "GET").toUpperCase() === "POST") {
          providerRequestBodies.push(JSON.parse(String(init?.body ?? "{}")));
          return new Response(JSON.stringify({
            id: `team_asset_request_${providerRequestBodies.length}`,
            status: "queued",
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({
          id: `team_asset_request_${providerRequestBodies.length}`,
          status: "completed",
          b64_json: Buffer.from("generated-team-png").toString("base64"),
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138000"));
      await seedActiveGenerationMembership(db, {
        userId,
        periodEndAt: new Date("2099-01-01T00:00:00.000Z"),
      });
      await grantCredits(db, {
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      const balanceBefore = await db.query<{ credit_balance_cached: number | string }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [userId],
      );
      const before = await db.query<{
        upload_sessions: number;
        upload_records: number;
        storage_objects: number;
        library_versions: number;
      }>(`
        SELECT
          (SELECT COUNT(*)::int FROM storage_upload_sessions) AS upload_sessions,
          (SELECT COUNT(*)::int FROM project_upload_records) AS upload_records,
          (SELECT COUNT(*)::int FROM storage_objects) AS storage_objects,
          (SELECT COUNT(*)::int FROM library_asset_versions) AS library_versions
      `);
      const requestBody = {
        target: {
          kind: "team_asset",
          category: "character",
          name: "生成团队主角",
        },
        prompt: "银发剑士",
        model: testModelCode,
        parameters: { aspectRatio: "16:9", quality: "2K" },
      };
      assert.equal(Object.hasOwn(requestBody, "projectId"), false);
      const response = await fetch(`${server.origin}/api/generation/image-tasks`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `team-asset-generate-${randomUUID()}`, cookie },
        body: JSON.stringify(requestBody),
      });
      const envelope = await response.json();
      const body = envelope.data;
      generatedAssetId = String(body.asset?.id ?? "");
      let completed = (await db.query<{
        admin_user_id: string;
        asset_status: string;
        asset_url: string | null;
        resource_size: number | string;
        created_user_id: string;
        is_admin_created: boolean;
      }>("SELECT * FROM team_assets WHERE id = $1", [body.asset?.id])).rows[0];
      for (let attempt = 0; attempt < 30 && completed?.asset_status !== "active"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        completed = (await db.query<typeof completed>("SELECT * FROM team_assets WHERE id = $1", [body.asset?.id])).rows[0];
      }
      const balanceAfter = await db.query<{ credit_balance_cached: number | string }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [userId],
      );
      const after = await db.query<{
        upload_sessions: number;
        upload_records: number;
        storage_objects: number;
        library_versions: number;
      }>(`
        SELECT
          (SELECT COUNT(*)::int FROM storage_upload_sessions) AS upload_sessions,
          (SELECT COUNT(*)::int FROM project_upload_records) AS upload_records,
          (SELECT COUNT(*)::int FROM storage_objects) AS storage_objects,
          (SELECT COUNT(*)::int FROM library_asset_versions) AS library_versions
      `);
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.ok(["submitted", "succeeded"].includes(body.generationStatus));
      assert.equal(typeof body.generationTaskId, "string");
      assert.equal(Number(balanceBefore.rows[0]?.credit_balance_cached) - Number(balanceAfter.rows[0]?.credit_balance_cached), Number(body.cost));
      assert.equal(Number(body.creditBalance), Number(balanceAfter.rows[0]?.credit_balance_cached));
      assert.equal(after.rows[0]?.upload_sessions, before.rows[0]?.upload_sessions);
      assert.equal(after.rows[0]?.upload_records, before.rows[0]?.upload_records);
      assert.equal(after.rows[0]?.library_versions, before.rows[0]?.library_versions);
      assert.equal(after.rows[0]?.storage_objects, before.rows[0]?.storage_objects + 1);
      assert.equal(uploadedObjects.length, 1);
      assert.equal(completed?.asset_status, "active");
      assert.match(completed?.asset_url ?? "", /^https:\/\/team-assets\.example\.test\//);
      assert.equal(Number(completed?.resource_size), Buffer.byteLength("generated-team-png"));
      assert.equal(completed?.created_user_id, completed?.admin_user_id);
      assert.equal(completed?.is_admin_created, true);
      const libraryResponse = await fetch(
        `${server.origin}/api/creator/library/assets?scope=team&category=character`,
        { headers: { cookie } },
      );
      const libraryBody = await libraryResponse.json();
      const generatedLibraryAsset = libraryBody.assets.find((asset: { id: string }) => asset.id === generatedAssetId);
      assert.equal(libraryResponse.status, 200);
      assert.equal(generatedLibraryAsset.generationResult.fixedImages[0].previewUrl, completed?.asset_url);
      assert.equal(generatedLibraryAsset.generationResult.resultAssets[0].sourceUrl, completed?.asset_url);
      assert.equal(generatedLibraryAsset.generationResult.result.imageUrl, completed?.asset_url);
      const modelRequestLog = await db.query<{
        user_id: string;
        project_id: string | null;
        task_id: string | null;
        model_id: string;
        status: string;
        request_format: string;
        request_body_json: Record<string, unknown>;
        request_text: string | null;
      }>(`
        SELECT user_id, project_id, task_id, model_id, status, request_format, request_body_json, request_text
        FROM user_model_request_logs
        WHERE task_id = $1
      `, [body.generationTaskId]);
      assert.equal(modelRequestLog.rows[0]?.user_id, completed?.admin_user_id);
      assert.equal(modelRequestLog.rows[0]?.project_id, null);
      assert.equal(modelRequestLog.rows[0]?.task_id, body.generationTaskId);
      assert.equal(modelRequestLog.rows[0]?.model_id, testModelCode);
      assert.equal(modelRequestLog.rows[0]?.status, "succeeded");
      assert.equal(modelRequestLog.rows[0]?.request_format, "global_ai_opc_image");
      assert.deepEqual(modelRequestLog.rows[0]?.request_body_json, providerRequestBodies[0]);
      assert.equal(modelRequestLog.rows[0]?.request_text, JSON.stringify(providerRequestBodies[0], null, 2));
      assert.deepEqual(modelRequestLog.rows[0]?.request_body_json, {
        model: "nano-banana-2",
        prompt: "银发剑士",
        resolution: "2k",
        size: "16:9",
        image_urls: [],
      });
      const assetCountBeforeRetry = await db.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM team_assets WHERE id = $1",
        [generatedAssetId],
      );
      const retryRequestBody = {
        target: {
          kind: "team_asset",
          assetId: generatedAssetId,
          category: "character",
          name: "生成团队主角",
        },
        prompt: "银发剑士重试",
        model: testModelCode,
        parameters: { aspectRatio: "1:1", quality: "2K" },
      };
      assert.equal(Object.hasOwn(retryRequestBody, "projectId"), false);
      const retryResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `team-asset-regenerate-${randomUUID()}`, cookie },
        body: JSON.stringify(retryRequestBody),
      });
      const retryEnvelope = await retryResponse.json();
      const retryBody = retryEnvelope.data;
      let retriedAsset = (await db.query<{ asset_status: string }>(
        "SELECT asset_status FROM team_assets WHERE id = $1",
        [generatedAssetId],
      )).rows[0];
      for (let attempt = 0; attempt < 30 && retriedAsset?.asset_status === "generating"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        retriedAsset = (await db.query<{ asset_status: string }>(
          "SELECT asset_status FROM team_assets WHERE id = $1",
          [generatedAssetId],
        )).rows[0];
      }
      const assetCountAfterRetry = await db.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM team_assets WHERE id = $1",
        [generatedAssetId],
      );
      const latestRequest = await db.query<{ payload_redacted_json: Record<string, unknown> }>(`
        SELECT payload_redacted_json
        FROM provider_requests
        WHERE task_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [retryBody.generationTaskId]);

      assert.equal(retryResponse.status, 200, JSON.stringify(retryBody));
      assert.equal(retryBody.asset?.id, generatedAssetId);
      assert.equal(assetCountBeforeRetry.rows[0]?.count, 1);
      assert.equal(assetCountAfterRetry.rows[0]?.count, 1);
      assert.equal(retriedAsset?.asset_status, "active");
      assert.equal(latestRequest.rows[0]?.payload_redacted_json?.prompt, "银发剑士重试");
      assert.equal(latestRequest.rows[0]?.payload_redacted_json?.model, testModelCode);
    } finally {
      if (generatedAssetId) {
        await db.query("DELETE FROM team_assets WHERE id = $1", [generatedAssetId]);
      }
      await server.close();
    }
  });

  it("binds a completed project asset generation result as the asset preview", async () => {
    const db = await createMigratedTestDb();
    const testModelCode = `project-asset-image-${randomUUID()}`;
    await db.query(`
      INSERT INTO ai_model_configs (
        id, model_code, display_name, provider_name, provider_model, provider_protocol,
        invocation_mode, media_type, task_modes_json, capabilities_json, parameter_schema_json,
        default_params_json, provider_config_json, pricing_json, limits_json, ui_config_json,
        status, sort_order, remark
      )
      SELECT
        $1, $2, 'Project Asset Test Image', provider_name, provider_model, provider_protocol,
        invocation_mode, 'image', task_modes_json, capabilities_json, parameter_schema_json,
        default_params_json,
        provider_config_json || '{"baseURL":"https://global-ai-opc.example.test","requestPath":"/v1/banana/images","endpoint":"/v1/banana/images","createTaskEndpoint":"/v1/banana/images","queryTaskEndpoint":"/v1/result/{taskId}","apiKeyEnv":"GLOBAL_AI_OPC_API_KEY","requestFormat":"global_ai_opc_banana_image"}'::jsonb,
        pricing_json, limits_json, ui_config_json, 'active', sort_order, 'project asset generation test model'
      FROM ai_model_configs
      WHERE model_code = 'global-ai-opc-nano-banana-2'
    `, [randomUUID(), testModelCode]);
    const server = createPhoneAuthDevServer({
      db,
      env: {
        GLOBAL_AI_OPC_API_KEY: "project-asset-generation-test-key",
        STORAGE_PUBLIC_BASE_URL: "https://project-assets.example.test",
        BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
        BULLMQ_WORKERS_ENABLED: "false",
      },
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
        publicBaseUrl: "https://project-assets.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://project-assets.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async putObject() {
            return { eTag: "generated-project-asset-etag" };
          },
        },
      },
      fetchImpl: (async (_url, init) => {
        if (String(init?.method ?? "GET").toUpperCase() === "POST") {
          return new Response(JSON.stringify({ id: "project_asset_request_1", status: "queued" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({
          id: "project_asset_request_1",
          status: "completed",
          b64_json: Buffer.from("generated-project-asset-png").toString("base64"),
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const userId = await readUserIdForPhone(db, normalizeCnPhone("13800138000"));
      await seedActiveGenerationMembership(db, {
        userId,
        periodEndAt: new Date("2099-01-01T00:00:00.000Z"),
      });
      await grantCredits(db, {
        userId,
        amount: 10000,
        sourceType: "test_credit_seed",
        sourceId: randomUUID(),
        reason: "test credit seed",
        createdByUserId: userId,
        now: new Date(),
      });
      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `project-asset-preview-project-${randomUUID()}`,
          cookie,
        },
        body: JSON.stringify({
          name: "Project asset preview binding",
          scriptInput: "Episode 1: generated character preview.",
          aspectRatio: "16:9",
          resolution: "1080p",
        }),
      });
      const created = await createProjectResponse.json();
      const generationResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `project-asset-preview-generation-${randomUUID()}`,
          cookie,
        },
        body: JSON.stringify({
          target: {
            kind: "project_asset",
            projectId: created.project.id,
            assetType: "character",
            name: "Generated Preview Character",
          },
          prompt: "A generated character used as the persisted preview",
          model: testModelCode,
          parameters: { aspectRatio: "1:1", quality: "2K" },
        }),
      });
      const generationEnvelope = await generationResponse.json();
      const generated = generationEnvelope.data;
      const assetId = String(generated.asset?.id ?? "");
      const persisted = await waitFor(async () => {
        const result = await db.query<{
          storage_object_id: string | null;
          storage_object_key: string | null;
          metadata_json: Record<string, unknown>;
          object_key: string | null;
          content_type: string | null;
          status: string | null;
        }>(`
          SELECT
            version.storage_object_id,
            version.storage_object_key,
            version.metadata_json,
            object.object_key,
            object.content_type,
            object.status
          FROM asset_versions version
          LEFT JOIN storage_objects object ON object.id = version.storage_object_id
          WHERE version.asset_id = $1
          ORDER BY version.version_number DESC
          LIMIT 1
        `, [assetId]);
        return result.rows[0]?.storage_object_id ? result.rows[0] : null;
      }, 5000);
      await db.query(`
        UPDATE asset_versions
        SET storage_object_id = NULL,
            storage_object_key = 'project-assets/pending/unbound-preview.png',
            metadata_json = metadata_json - ARRAY[
              'previewUrl',
              'fixedImageUrl',
              'sourceUrl',
              'downloadUrl',
              'fixedImageStorageObjectId',
              'storageObjectKey',
              'mimeType',
              'generationTaskId',
              'generationStatus',
              'generationResult'
            ]
        WHERE asset_id = $1
      `, [assetId]);
      const detailResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        { headers: { cookie } },
      );
      const detail = await detailResponse.json();
      const listedAsset = detail.assetsByType.character.find((asset: { id: string }) => asset.id === assetId);
      const expectedPreviewUrl = `https://project-assets.example.test/${persisted.object_key}`;
      const reconciled = await db.query<{
        storage_object_id: string | null;
        storage_object_key: string | null;
        metadata_json: Record<string, unknown>;
      }>(`
        SELECT storage_object_id, storage_object_key, metadata_json
        FROM asset_versions
        WHERE asset_id = $1
        ORDER BY version_number DESC
        LIMIT 1
      `, [assetId]);

      assert.equal(createProjectResponse.status, 200);
      assert.equal(generationResponse.status, 200, JSON.stringify(generated));
      assert.ok(assetId);
      assert.equal(persisted.storage_object_key, persisted.object_key);
      assert.equal(persisted.status, "available");
      assert.equal(persisted.content_type, "image/png");
      assert.equal(persisted.metadata_json.previewUrl, expectedPreviewUrl);
      assert.equal(persisted.metadata_json.fixedImageUrl, expectedPreviewUrl);
      assert.equal(persisted.metadata_json.sourceUrl, expectedPreviewUrl);
      assert.equal(persisted.metadata_json.downloadUrl, expectedPreviewUrl);
      assert.equal(persisted.metadata_json.fixedImageStorageObjectId, persisted.storage_object_id);
      assert.equal(persisted.metadata_json.storageObjectKey, persisted.storage_object_key);
      assert.equal(persisted.metadata_json.mimeType, "image/png");
      assert.equal(detailResponse.status, 200);
      assert.equal(reconciled.rows[0]?.storage_object_id, persisted.storage_object_id);
      assert.equal(reconciled.rows[0]?.storage_object_key, persisted.storage_object_key);
      assert.equal(reconciled.rows[0]?.metadata_json.previewUrl, expectedPreviewUrl);
      assert.equal(String(listedAsset.previewUrl).split("?")[0], expectedPreviewUrl);
      assert.equal(String(listedAsset.latestVersion.previewUrl).split("?")[0], expectedPreviewUrl);
      assert.equal(String(detail.assetSummary.character.previews[0]).split("?")[0], expectedPreviewUrl);

      const retryResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `project-asset-preview-retry-${randomUUID()}`,
          cookie,
        },
        body: JSON.stringify({
          target: {
            kind: "project_asset",
            projectId: created.project.id,
            assetId,
            assetType: "character",
            name: "Generated Preview Character",
          },
          prompt: "Regenerate the existing project character",
          model: testModelCode,
          parameters: { aspectRatio: "1:1", quality: "2K" },
        }),
      });
      const retryEnvelope = await retryResponse.json();
      const assetCountAfterRetry = await db.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM assets WHERE id = $1",
        [assetId],
      );

      assert.equal(retryResponse.status, 200, JSON.stringify(retryEnvelope));
      assert.equal(retryEnvelope.data?.asset?.id, assetId);
      assert.equal(assetCountAfterRetry.rows[0]?.count, 1);
    } finally {
      await server.close();
      await db.close();
    }
  });

  it("stores subaccount team assets under the administrator user id", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      seedTeamEntitlements: true,
      env: { STORAGE_PUBLIC_BASE_URL: "https://team-assets.example.test" },
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
        publicBaseUrl: "https://team-assets.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://team-assets.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async putObject() {
            return { eTag: "subaccount-team-asset-etag" };
          },
        },
      },
    });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138000");
      const ownerUserId = await readUserIdForPhone(db, normalizeCnPhone("13800138000"));
      const createMemberResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          teamAccount: `asset_member_${randomUUID().slice(0, 8)}`,
          displayName: "资产子账户",
          projectIds: [],
          initialCredits: 0,
        }),
      });
      const createdMember = await createMemberResponse.json();
      const memberCookie = await loginTeamMemberAccount(
        server.origin,
        createdMember.member.memberLoginAccount,
        createdMember.temporaryPassword,
      );
      await db.query(
        "DELETE FROM user_entitlements WHERE user_id = $1 AND entitlement_key = 'team_asset_library'",
        [ownerUserId],
      );
      await db.query(
        `
          INSERT INTO user_memberships (
            id, user_id, membership_tier, purchase_at, expires_at,
            gift_credits, status, created_at, updated_at
          )
          VALUES ($1, $2, 'professional', $3, $4, 0, 'active', $3, $3)
        `,
        [randomUUID(), ownerUserId, new Date(), new Date(Date.now() + 86_400_000)],
      );
      const formData = new FormData();
      formData.set("category", "scene");
      formData.set("assetName", "子账户场景");
      formData.set("file", new File([new Uint8Array([137, 80, 78, 71])], "scene.png", { type: "image/png" }));
      const uploadResponse = await fetch(`${server.origin}/api/creator/team-assets/upload`, {
        method: "POST",
        headers: { cookie: memberCookie },
        body: formData,
      });
      const uploaded = await uploadResponse.json();
      const stored = await db.query<{
        admin_user_id: string;
        created_user_id: string;
        is_admin_created: boolean;
        created_by_name: string;
      }>("SELECT admin_user_id, created_user_id, is_admin_created, created_by_name FROM team_assets WHERE id = $1", [uploaded.asset?.id]);
      const ownerListResponse = await fetch(`${server.origin}/api/creator/library/assets?scope=team&category=scene`, {
        headers: { cookie: ownerCookie },
      });
      const ownerList = await ownerListResponse.json();
      const memberListResponse = await fetch(`${server.origin}/api/creator/library/assets?scope=team&category=scene`, {
        headers: { cookie: memberCookie },
      });
      const memberList = await memberListResponse.json();
      const memberDeleteResponse = await fetch(`${server.origin}/api/creator/team-assets/${uploaded.asset?.id}`, {
        method: "DELETE",
        headers: { cookie: memberCookie },
      });
      const storedAfterDeleteAttempt = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM team_assets WHERE id = $1 AND asset_status = 'active'",
        [uploaded.asset?.id],
      );

      assert.equal(createMemberResponse.status, 200, JSON.stringify(createdMember));
      assert.equal(uploadResponse.status, 200, JSON.stringify(uploaded));
      assert.equal(stored.rows[0]?.admin_user_id, ownerUserId);
      assert.equal(stored.rows[0]?.created_user_id, createdMember.member.membershipId);
      assert.equal(stored.rows[0]?.is_admin_created, false);
      assert.equal(stored.rows[0]?.created_by_name, "资产子账户");
      assert.equal(ownerListResponse.status, 200);
      assert.equal(ownerList.assets.some((asset: { id: string }) => asset.id === uploaded.asset.id), true);
      assert.equal(memberListResponse.status, 200);
      assert.equal(memberList.assets.some((asset: { id: string }) => asset.id === uploaded.asset.id), true);
      assert.equal(memberDeleteResponse.status, 403);
      assert.equal(storedAfterDeleteAttempt.rows[0]?.count, 1);
    } finally {
      await server.close();
    }
  });


  it("does not let development seed entitlements leak into production-like upload checks", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      seedTeamEntitlements: false,
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "creator-test",
      },
    });
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = originalDatabaseUrl || "postgres://prod-like-upload-gate.test/local";

    try {
      await server.listen(0);
      await login(server.origin, "13800138001");
            const cookie = await login(server.origin, "13800138000");

      const response = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "blocked-seeded-team-asset-upload",
          cookie,
        },
        body: JSON.stringify({
          projectId: null,
          purpose: "team-assets/character",
          fileName: "blocked-seeded-hero.png",
          contentType: "image/png",
          sizeBytes: 1024,
        }),
      });
      const body = await response.json();
      const entitlement = await db.query<{ status: string }>(
        `
          SELECT status
          FROM user_entitlements
          WHERE entitlement_key = 'team_asset_library'
            AND source = 'dev_seed'
          LIMIT 1
        `,
      );

      assert.equal(response.status, 403);
      assert.equal(body.errorCode, "team_asset_library_entitlement_required");
      assert.equal(entitlement.rows.length, 0);
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
      await server.close();
    }
  });

});

async function login(origin: string, phone: string) {
  return loginAsAccount(origin, phone, defaultPasswordFromPhone(normalizeCnPhone(phone)));
}

async function loginAsAccount(origin: string, account: string, password: string) {
  const fallbackDb = loginDbByOrigin.get(origin) ? null : await createDevDb();
  const db = loginDbByOrigin.get(origin) ?? fallbackDb!;
  try {
    const normalizedPhone = normalizeLoginPhoneIfPossible(account);
    if (normalizedPhone) {
      await ensurePasswordLoginUser(db, normalizedPhone);
    }
    const passwordResponse = await fetch(`${origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account,
        password,
      }),
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

function normalizeLoginPhoneIfPossible(account: string) {
  const digits = String(account ?? "").replace(/\D/g, "");
  if (/^1\d{10}$/.test(digits)) {
    return normalizeCnPhone(digits);
  }
  if (/^86\d{11}$/.test(digits)) {
    return normalizeCnPhone(digits.slice(2));
  }
  return null;
}

async function seedTeamMemberCreditLedgerFixture(
  db: PhoneAuthTestDb,
) {
  const memberUserId = randomUUID();
  const memberId = randomUUID();
  await db.query(
    `
      INSERT INTO users (id, phone_e164, password_hash, status, credit_balance_cached, team_seat_limit)
      VALUES ($1, $2, $3, 'active', 100, 50)
      ON CONFLICT (phone_e164)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        status = 'active',
        credit_balance_cached = 100,
        team_seat_limit = 50
    `,
    [memberUserId,
      "13800138000",
      await createUserPasswordHash(defaultPasswordFromPhone("13800138000"))],
  );


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
      VALUES (
        $1,
        $2,
        'member001',
        'u138001',
        'member001@u138001',
        '子账户一号',
        $3,
        10,
        'active'
      )
      ON CONFLICT (id) DO UPDATE
      SET member_password_hash = EXCLUDED.member_password_hash,
          member_credits = EXCLUDED.member_credits,
          status = EXCLUDED.status
    `,
    [memberId, memberUserId, await createUserPasswordHash("member-secret-001")],
  );
  const memberSession = await createAuthSession({
    userId: memberUserId,
    token: `member-credit-ledger-${randomUUID()}`,
    now: new Date("2026-06-20T08:00:00.000Z"),
    ttlMs: 100 * 365 * 24 * 60 * 60 * 1000,
  });
  const authSessionId = memberSession.session.id;
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9
      )
    `,
    [
      authSessionId,
      memberUserId,
      memberSession.session.status,
      memberSession.session.sessionTokenHash,
      memberSession.session.sessionTokenHashVersion,
      memberSession.session.expiresAt,
      memberSession.session.lastSeenAt,
      memberSession.session.revokedAt,
      new Date("2026-06-20T08:00:00.000Z"),
    ],
  );
  await db.query(
    `
      INSERT INTO team_member_auth_sessions (
        id,
        auth_session_id,
        user_id,
        member_id,
        status,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'active',
        '2099-01-01T00:00:00.000Z',
        '2026-06-20T08:00:00.000Z',
        NULL,
        '2026-06-20T08:00:00.000Z'
      )
    `,
    [randomUUID(), authSessionId, memberUserId, memberId],
  );
  await db.query(
    `
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        team_member_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_at
      )
      VALUES ('70000000-0000-4000-8000-000000000010', $1, $2, 'grant', 10, 10, 0, 0, 'team_member_credit_allocation', '80000000-0000-4000-8000-000000000010', '主账号分配积分', $3::jsonb, '2026-06-20T08:00:00.000Z')
    `,
    [memberUserId,
      memberId,
      JSON.stringify({ memberId })],
  );
  return { memberCookie: `auth_session=${memberSession.token}` };
}

async function ensurePasswordLoginUser(
  db: PhoneAuthTestDb,
  phone: string,
) {
  const passwordHash = await createUserPasswordHash(defaultPasswordFromPhone(phone));
  await db.query(
    `
      INSERT INTO users (id, phone_e164, password_hash, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (phone_e164)
      DO UPDATE SET
        password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash)
    `,
    [randomUUID(), phone, passwordHash],
  );
}

type PhoneAuthTestDb = Awaited<ReturnType<typeof createDevDb>>;

async function seedCreatorMembershipForPhone(
  db: PhoneAuthTestDb,
  phoneE164: string,
) {
  await ensurePasswordLoginUser(db, phoneE164);
  const userId = await readUserIdForPhone(db, phoneE164);
  await seedActiveGenerationMembership(db, { userId });
}

async function readUserIdForPhone(
  db: PhoneAuthTestDb,
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

async function readProjectOwnerUserId(db: PhoneAuthTestDb, projectId: string) {
  const project = await db.query<{ owner_user_id: string }>(
    "SELECT owner_user_id FROM projects WHERE id = $1 LIMIT 1",
    [projectId],
  );
  const ownerUserId = project.rows[0]?.owner_user_id;
  assert.ok(ownerUserId, `missing project owner for ${projectId}`);
  return ownerUserId;
}

async function seedPreviewScriptModelConfig(db: PhoneAuthTestDb, baseCredits: number) {
  await db.query("UPDATE ai_model_configs SET status = 'disabled' WHERE media_type = 'text'");
  await db.query(
    `
      INSERT INTO ai_model_configs (
        id,
        model_code,
        display_name,
        provider_name,
        provider_model,
        provider_protocol,
        invocation_mode,
        media_type,
        task_modes_json,
        capabilities_json,
        parameter_schema_json,
        default_params_json,
        provider_config_json,
        pricing_json,
        limits_json,
        ui_config_json,
        status,
        sort_order,
        remark,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        'preview-script-model',
        '预览剧本模型',
        'deepseek',
        'deepseek-chat',
        'openai_compatible_chat',
        'stream',
        'text',
        '["text.script"]'::jsonb,
        '{"input":["prompt"],"output":["text"]}'::jsonb,
        '{"scriptPrompt":{"type":"string","required":true}}'::jsonb,
        '{}'::jsonb,
        '{"baseURL":"https://api.deepseek.com","requestPath":"/chat/completions","apiKeyEnv":"DEEPSEEK_API_KEY"}'::jsonb,
        $2::jsonb,
        '{}'::jsonb,
        '{"modelKind":"text.script","supportedModes":["script"]}'::jsonb,
        'active',
        -1000,
        '',
        NOW(),
        NOW()
      )
      ON CONFLICT (model_code) DO UPDATE
      SET pricing_json = EXCLUDED.pricing_json,
          task_modes_json = EXCLUDED.task_modes_json,
          ui_config_json = EXCLUDED.ui_config_json,
          status = 'active',
          updated_at = NOW()
    `,
    [randomUUID(), JSON.stringify({ unit: "text", baseCredits })],
  );
}

async function createAiStoryboardPreviewProject(
  origin: string,
  cookie: string,
  keySuffix: string,
) {
  const response = await fetch(`${origin}/api/creator/project/create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `http-ai-storyboard-preview-${keySuffix}-project`,
      cookie,
    },
    body: JSON.stringify({
      name: `AI storyboard preview ${keySuffix}`,
      scriptInput: "任小野把小草托付给闵婶子。",
      aspectRatio: "9:16",
      resolution: "1080p",
    }),
  });
  assert.equal(response.status, 200);
  return await response.json();
}

async function readStoryboardPromptPackages(origin: string, cookie: string) {
  const response = await fetch(
    `${origin}/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500`,
    { headers: { cookie } },
  );
  const envelope = await response.json();
  const packages = envelope.packages as Array<{ id: string; code: string }>;
  const packageId = (code: string) => {
    const found = packages.find((item) => item.code === code);
    assert.ok(found, `missing package ${code}`);
    return found.id;
  };
  return {
    genrePackageId: packageId("xuanhuan_xiuxian"),
    emotionPackageId: packageId("male_hotblood"),
  };
}

async function postAiStoryboardPreview(
  origin: string,
  input: {
    cookie: string;
    projectId: string;
    idempotencyKey: string;
    packages: {
      genrePackageId: string;
      emotionPackageId: string;
    };
  },
) {
  return fetch(`${origin}/api/creator/projects/${input.projectId}/ai-storyboard-preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
      cookie: input.cookie,
    },
    body: JSON.stringify({
      scriptText: "任小野把小草托付给闵婶子。",
      packages: input.packages,
    }),
  });
}

async function seedActiveGenerationMembership(
  db: PhoneAuthTestDb,
  input: {
    userId?: string;
    now?: Date;
    periodEndAt?: Date;
    tier?: "experience" | "professional";
  },
) {
  const now = input.now ?? new Date("2026-06-08T08:00:00.000Z");
  const periodEndAt = input.periodEndAt ?? new Date("2099-01-01T00:00:00.000Z");
  const tier = input.tier ?? "professional";
  const userId = input.userId;
  assert.ok(userId, "missing user for membership seed");
  await db.query(
    `
      INSERT INTO user_memberships (
        id, user_id, membership_tier, purchase_at, expires_at, gift_credits, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 0, $6, $4, $4)
      ON CONFLICT (user_id) DO UPDATE
      SET membership_tier = EXCLUDED.membership_tier,
          purchase_at = EXCLUDED.purchase_at,
          expires_at = EXCLUDED.expires_at,
          gift_credits = 0,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
    `,
    [randomUUID(), userId, tier, now, periodEndAt, periodEndAt > now ? "active" : "expired"],
  );
  await db.query(
    `
      INSERT INTO user_entitlements (
        id, user_id, entitlement_key, status, source, expires_at, created_at, updated_at
      )
      VALUES ($1, $2, 'priority_generation', $3, 'dev_seed', $4, $5, $5)
      ON CONFLICT (user_id, entitlement_key) DO UPDATE
      SET status = EXCLUDED.status,
          expires_at = EXCLUDED.expires_at,
          updated_at = EXCLUDED.updated_at
    `,
    [randomUUID(), userId, periodEndAt > now ? "active" : "expired", periodEndAt, now],
  );
}

async function seedGenerationAccessForPhone(
  db: PhoneAuthTestDb,
  phone: string,
  amount = 10000,
) {
  const userId = await readUserIdForPhone(db, normalizeCnPhone(phone));
  await seedActiveGenerationMembership(db, { userId });
  await grantCredits(db, {
    userId,
    amount,
    sourceType: "test_credit_seed",
    sourceId: randomUUID(),
    reason: "test credit seed",
    createdByUserId: userId,
    now: new Date(),
  });
}

async function seedScriptAnalysisModelConfig(db: PhoneAuthTestDb) {
  await db.query(
    `
      INSERT INTO ai_model_configs (
        id, model_code, display_name, provider_name, provider_model,
        provider_protocol, invocation_mode, media_type, task_modes_json,
        capabilities_json, pricing_json, ui_config_json, status
      ) VALUES (
        $1, 'deepseek-noval', 'DeepSeek 剧本模型', 'deepseek', 'deepseek-v4-pro',
        'openai_compatible_chat', 'stream', 'text', '["text.script"]'::jsonb,
        '{"stream":true}'::jsonb, '{"unit":"text","baseCredits":160}'::jsonb,
        '{"modelKind":"text.script","supportedModes":["script"]}'::jsonb, 'active'
      )
      ON CONFLICT (model_code) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          provider_name = EXCLUDED.provider_name,
          provider_model = EXCLUDED.provider_model,
          provider_protocol = EXCLUDED.provider_protocol,
          invocation_mode = EXCLUDED.invocation_mode,
          media_type = EXCLUDED.media_type,
          task_modes_json = EXCLUDED.task_modes_json,
          capabilities_json = EXCLUDED.capabilities_json,
          pricing_json = EXCLUDED.pricing_json,
          ui_config_json = EXCLUDED.ui_config_json,
          status = EXCLUDED.status,
          updated_at = NOW()
    `,
    [randomUUID()],
  );
}

class FakeAiStoryboardTextGateway {
  readonly calls: Array<{ model: string; prompt: string }> = [];

  constructor(private readonly responses: Array<string | string[]>) {}

  async completeJson(input: { model: string; prompt: string }) {
    this.calls.push(input);
    const response = this.responses.shift();
    assert.ok(response, "missing fake AI storyboard response");
    return Array.isArray(response) ? response.join("") : response;
  }

  async *streamJson(input: { model: string; prompt: string }) {
    this.calls.push(input);
    const response = this.responses.shift();
    assert.ok(response, "missing fake AI storyboard response");
    const chunks = Array.isArray(response) ? response : [response];
    for (const chunk of chunks) {
      yield chunk;
    }
  }
}

async function prepareDirectUpload(
  origin: string,
  cookie: string,
  projectId: string,
  input: {
    purpose: string;
    fileName: string;
    contentType: string;
    body: Buffer;
  },
) {
  const prepareResponse = await fetch(`${origin}/api/storage/upload-sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `phone-auth-dev-server-${input.purpose}-${input.fileName}`,
      cookie,
    },
    body: JSON.stringify({
      projectId,
      purpose: input.purpose,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
    }),
  });
  const prepared = await prepareResponse.json();

  const blobResponse = await fetch(
    `${origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/blob`,
    {
      method: "PUT",
      headers: {
        "content-type": input.contentType,
        cookie,
      },
      body: input.body,
    },
  );
  const completeResponse = await fetch(
    `${origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/complete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({}),
    },
  );

  assert.equal(prepareResponse.status, 200);
  assert.equal(blobResponse.status, 200);
  assert.equal(completeResponse.status, 200);

  return prepared as {
    uploadSessionId: string;
    storageObjectId: string;
  };
}

async function waitFor<T>(
  probe: () => Promise<T | null | undefined>,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | null | undefined;
  while (Date.now() < deadline) {
    lastValue = await probe();
    if (lastValue) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`wait_for_timeout:${JSON.stringify(lastValue ?? null)}`);
}
