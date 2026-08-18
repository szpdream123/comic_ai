import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import type { AiModelConfigRecord } from "../../model-catalog/ai-model-config.store.ts";
import { grantCredits, reserveCredits } from "../../credit-billing/credit-ledger.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createOrReuseGenerationStorageObject } from "../../storage/storage.service.ts";
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import { handleGenerationFetchArtifactJob } from "../generation-bullmq.worker.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import { GENERATION_ARTIFACT_FETCH_NOT_READY } from "../generation-skipped-coordinator.ts";
import {
  buildLingdongArtifactDownloadInit,
  buildSeedanceUserModelRequestLogBody,
  cancelGenerationTask,
  expireSeedanceVideoPollJob,
  fetchSeedanceVideoArtifactJob,
  finalizeSeedanceVideoArtifactJob,
  persistSeedanceVideoArtifactJob,
  processSeedanceVideoPollJob,
  processSeedanceVideoSubmitJob,
  readGenerationArtifactUploadConfig,
  recoverSeedanceVideoAfterPollTimeout,
} from "../seedance-video.worker.ts";

describe("Seedance video worker user ownership", () => {
  it("records the SanBao video request in the same shape sent upstream", () => {
    const request = buildSeedanceUserModelRequestLogBody({
      prompt: "use all references",
      motionPrompt: "use all references",
      parameters: {
        aspectRatio: "16:9",
        resolution: "720p",
        durationSec: 5,
        count: 2,
        reference: "all",
        filePaths: ["https://cdn.example.com/reference.png"],
        videoFilePaths: ["https://cdn.example.com/reference.mp4"],
        audioFilePaths: ["https://cdn.example.com/reference.mp3"],
      },
      targetType: "episode",
    }, {
      providerName: "三宝影像",
      providerProtocol: "san_bao",
      providerModel: "sd2_9img_full",
    });

    assert.equal(request.requestFormat, "san_bao_video");
    assert.deepEqual(request.requestBody, {
      model: "sd2_9img_full",
      prompt: "use all references",
      ratio: "16:9",
      resolution: "720p",
      duration: 5,
      concurrency: 2,
      reference: "all",
      images: ["https://cdn.example.com/reference.png"],
      videos: ["https://cdn.example.com/reference.mp4"],
      audios: ["https://cdn.example.com/reference.mp3"],
    });
    assert.doesNotMatch(request.requestText, /targetType|parameters/);
  });

  it("uses a thirty-minute video download timeout and independent upload timeout", () => {
    assert.equal(
      readGenerationArtifactUploadConfig({}).downloadTimeoutMs,
      30 * 60_000,
    );
    assert.equal(
      readGenerationArtifactUploadConfig({ GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS: "300000" }).downloadTimeoutMs,
      30 * 60_000,
    );
    assert.equal(
      readGenerationArtifactUploadConfig({
        VIDEO_GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS: "900000",
        GENERATION_ARTIFACT_UPLOAD_TIMEOUT_MS: "1200000",
      }).downloadTimeoutMs,
      900_000,
    );
    assert.equal(
      readGenerationArtifactUploadConfig({
        VIDEO_GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS: "900000",
        GENERATION_ARTIFACT_UPLOAD_TIMEOUT_MS: "1200000",
      }).uploadTimeoutMs,
      1_200_000,
    );
  });

  it("uses user and project identifiers in worker persistence queries", async () => {
    const source = await readFile(new URL("../seedance-video.worker.ts", import.meta.url), "utf8");
    assert.match(source, /user_id/);
    assert.match(source, /project_id/);
    assert.doesNotMatch(source, new RegExp("organi" + "zation_id", "i"));
    assert.doesNotMatch(source, new RegExp("work" + "space_id", "i"));
  });

  it("renews the task and attempt leases while the provider is still rendering", async () => {
    const source = await readFile(new URL("../seedance-video.worker.ts", import.meta.url), "utf8");
    assert.match(source, /await renewSeedancePollLease\(db, \{/);
    assert.match(source, /WITH renewed_task AS \([\s\S]*UPDATE tasks[\s\S]*UPDATE task_attempts/);
  });

  it("allows provider-succeeded result-unknown tasks to resume finalization", async () => {
    const source = await readFile(new URL("../seedance-video.worker.ts", import.meta.url), "utf8");
    assert.match(source, /t\.status IN \('running', 'manual_review_required', 'result_unknown'\)/);
    assert.match(source, /status = 'running',[\s\S]*failure_code = NULL[\s\S]*status IN \('running', 'manual_review_required', 'result_unknown'\)/);
    assert.match(source, /t\.failure_code IN \('provider_output_persist_failed', 'generation_queue_error'\)/);
  });

  it("reports the uploaded storage key when availability persistence loses the row", async () => {
    const source = await readFile(new URL("../seedance-video.worker.ts", import.meta.url), "utf8");
    assert.match(
      source,
      /if \(!available\) \{[\s\S]*?storageObjectKey: uploaded\.storageObject\.objectKey,[\s\S]*?\}/,
    );
  });

  it("authenticates Lingdong artifact downloads from configured environment keys", () => {
    const config = {
      providerName: "lingdong-api",
      providerProtocol: "lingdong_api",
      providerConfig: { apiKeyEnv: "LINGDONG_TEST_KEY" },
    } as AiModelConfigRecord;
    const init = buildLingdongArtifactDownloadInit(
      config,
      "https://api.lingdongapi.com/v1/videos/video-1/content",
      { LINGDONG_TEST_KEY: "secret-key" },
    );
    assert.deepEqual(init, { headers: { authorization: "Bearer secret-key" } });
  });

  it("does not attach provider credentials to unrelated artifact hosts", () => {
    const config = {
      providerName: "lingdong-api",
      providerProtocol: "lingdong_api",
      providerConfig: { apiKeyEnv: "LINGDONG_TEST_KEY" },
    } as AiModelConfigRecord;
    assert.equal(
      buildLingdongArtifactDownloadInit(
        config,
        "https://cdn.example.test/video.mp4",
        { LINGDONG_TEST_KEY: "secret-key" },
      ),
      undefined,
    );
  });

  it("cancels a queued generation before provider submission", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "091",
        userId: "70000000-0000-4000-8000-000000000091",
        status: "queued",
      });
      const result = await cancelGenerationTask(db, {
        taskId: seeded.taskId,
        env: {},
        now: new Date("2026-07-20T10:00:00.000Z"),
      });
      assert.deepEqual(result, {
        status: "canceled",
        taskId: seeded.taskId,
        providerCancellation: "not_submitted",
        creditStatus: "not_reserved",
      });
      const task = await db.query("SELECT status, failure_code FROM tasks WHERE id = $1", [seeded.taskId]);
      assert.deepEqual(task.rows[0], { status: "canceled", failure_code: "user_canceled" });
      assert.deepEqual(await cancelGenerationTask(db, {
        taskId: seeded.taskId,
        env: {},
        now: new Date("2026-07-20T10:00:01.000Z"),
      }), { status: "already_canceled", taskId: seeded.taskId });
    } finally {
      await db.close();
    }
  });

  it("only marks a running video canceled after the provider confirms DELETE", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "092",
        userId: "70000000-0000-4000-8000-000000000092",
        status: "running",
      });
      const requests: Array<{ url: string; method: string }> = [];
      const result = await cancelGenerationTask(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: async (url, init) => {
          requests.push({ url: String(url), method: String(init?.method) });
          return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
        },
        now: new Date("2026-07-20T10:01:00.000Z"),
      });
      assert.equal(result.status, "canceled", JSON.stringify(result));
      assert.equal(result.providerCancellation, "canceled");
      assert.deepEqual(requests, [{
        url: `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${encodeURIComponent("external-092")}`,
        method: "DELETE",
      }]);
      const task = await db.query("SELECT status FROM tasks WHERE id = $1", [seeded.taskId]);
      const attempt = await db.query("SELECT status FROM task_attempts WHERE task_id = $1", [seeded.taskId]);
      const provider = await db.query("SELECT status FROM provider_requests WHERE task_id = $1", [seeded.taskId]);
      assert.equal(task.rows[0]?.status, "canceled");
      assert.equal(attempt.rows[0]?.status, "canceled");
      assert.equal(provider.rows[0]?.status, "canceled");
    } finally {
      await db.close();
    }
  });

  it("refunds a team member video timeout exactly once", async () => {
    const db = await createMigratedTestDb();
    try {
      const teamMemberId = "71000000-0000-4000-8000-000000000093";
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "093",
        userId: "70000000-0000-4000-8000-000000000093",
        teamMemberId,
        estimatedCredits: 120,
        status: "running",
      });
      await db.query(
        `
          INSERT INTO team_members (
            id, user_id, member_account, member_account_suffix, member_login_account,
            member_name, member_password_hash, member_credits, status
          )
          VALUES ($1, $2, 'video_timeout_member', 'video093', 'video_timeout_member@video093',
            'Video Timeout Member', 'unused-test-password-hash', 0, 'active')
        `,
        [teamMemberId, seeded.userId],
      );

      const first = await expireSeedanceVideoPollJob(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: async () => new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        now: new Date("2026-07-20T13:00:00.000Z"),
      });
      const second = await expireSeedanceVideoPollJob(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: async () => new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        now: new Date("2026-07-20T13:00:01.000Z"),
      });
      const member = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [teamMemberId],
      );
      const refunds = await db.query<{ count: number | string; amount: number | string }>(
        `
          SELECT count(*) AS count, COALESCE(sum(amount), 0) AS amount
          FROM credit_ledger_entries
          WHERE team_member_id = $1
            AND source_type = 'team_member_generation_refund'
            AND source_id = $2
        `,
        [teamMemberId, seeded.taskId],
      );

      assert.deepEqual(first, { status: "failed", failureCode: "provider_poll_timeout" });
      assert.deepEqual(second, { status: "failed", failureCode: "provider_poll_timeout" });
      assert.equal(Number(member.rows[0]?.member_credits ?? -1), 120);
      assert.equal(Number(refunds.rows[0]?.count ?? -1), 1);
      assert.equal(Number(refunds.rows[0]?.amount ?? -1), 120);
    } finally {
      await db.close();
    }
  });

  it("refunds a queued team member video cancellation exactly once", async () => {
    const db = await createMigratedTestDb();
    try {
      const teamMemberId = "71000000-0000-4000-8000-000000000094";
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "094",
        userId: "70000000-0000-4000-8000-000000000094",
        teamMemberId,
        estimatedCredits: 120,
        status: "queued",
      });
      await db.query(
        `
          INSERT INTO team_members (
            id, user_id, member_account, member_account_suffix, member_login_account,
            member_name, member_password_hash, member_credits, status
          )
          VALUES ($1, $2, 'video_cancel_member', 'video094', 'video_cancel_member@video094',
            'Video Cancel Member', 'unused-test-password-hash', 0, 'active')
        `,
        [teamMemberId, seeded.userId],
      );

      const first = await cancelGenerationTask(db, {
        taskId: seeded.taskId,
        env: {},
        now: new Date("2026-07-20T13:10:00.000Z"),
      });
      const second = await cancelGenerationTask(db, {
        taskId: seeded.taskId,
        env: {},
        now: new Date("2026-07-20T13:10:01.000Z"),
      });
      const member = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [teamMemberId],
      );
      const refunds = await db.query<{ count: number | string }>(
        `
          SELECT count(*) AS count
          FROM credit_ledger_entries
          WHERE team_member_id = $1
            AND source_type = 'team_member_generation_refund'
            AND source_id = $2
        `,
        [teamMemberId, seeded.taskId],
      );

      assert.deepEqual(first, {
        status: "canceled",
        taskId: seeded.taskId,
        providerCancellation: "not_submitted",
        creditStatus: "released",
      });
      assert.deepEqual(second, { status: "already_canceled", taskId: seeded.taskId });
      assert.equal(Number(member.rows[0]?.member_credits ?? -1), 120);
      assert.equal(Number(refunds.rows[0]?.count ?? -1), 1);
    } finally {
      await db.close();
    }
  });

  it("isolates submit limiter permits by subaccount", async () => {
    const db = await createMigratedTestDb();

    try {
      const userId = "70000000-0000-4000-8000-000000000101";
      const first = await seedRateLimitedSeedanceTask(db, {
        suffix: "101",
        userId,
        teamMemberId: "71000000-0000-4000-8000-000000000101",
        status: "queued",
      });
      const second = await seedRateLimitedSeedanceTask(db, {
        suffix: "102",
        userId,
        teamMemberId: "71000000-0000-4000-8000-000000000102",
        status: "queued",
      });
      const limiterUserIds: string[] = [];
      const rateLimiter = {
        async acquireSubmitPermit(input: { userId: string }) {
          limiterUserIds.push(input.userId);
          return { granted: false as const, retryAfterMs: 1000, reason: "test-submit-limit" };
        },
        async acquirePollPermit() {
          throw new Error("submit jobs must not acquire poll permits");
        },
      };

      const results = await Promise.all([
        processSeedanceVideoSubmitJob(db, {
          taskId: first.taskId,
          env: {},
          rateLimiter,
          now: new Date("2026-07-13T01:00:00.000Z"),
        }),
        processSeedanceVideoSubmitJob(db, {
          taskId: second.taskId,
          env: {},
          rateLimiter,
          now: new Date("2026-07-13T01:00:01.000Z"),
        }),
      ]);

      assert.deepEqual(limiterUserIds.sort(), [
        `${userId}:member:${first.teamMemberId}`,
        `${userId}:member:${second.teamMemberId}`,
      ].sort());
      assert.equal(new Set(limiterUserIds).size, 2);
      assert.deepEqual(results, [
        { status: "rate_limited", retryAfterMs: 1000, reason: "test-submit-limit" },
        { status: "rate_limited", retryAfterMs: 1000, reason: "test-submit-limit" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("isolates poll limiter permits by subaccount", async () => {
    const db = await createMigratedTestDb();

    try {
      const userId = "70000000-0000-4000-8000-000000000201";
      const first = await seedRateLimitedSeedanceTask(db, {
        suffix: "201",
        userId,
        teamMemberId: "71000000-0000-4000-8000-000000000201",
        status: "running",
      });
      const second = await seedRateLimitedSeedanceTask(db, {
        suffix: "202",
        userId,
        teamMemberId: "71000000-0000-4000-8000-000000000202",
        status: "running",
      });
      const limiterUserIds: string[] = [];
      const rateLimiter = {
        async acquireSubmitPermit() {
          throw new Error("poll jobs must not acquire submit permits");
        },
        async acquirePollPermit(input: { userId: string }) {
          limiterUserIds.push(input.userId);
          return { granted: false as const, retryAfterMs: 1200, reason: "test-poll-limit" };
        },
      };

      const results = await Promise.all([
        processSeedanceVideoPollJob(db, {
          taskId: first.taskId,
          runtime: seedanceStorageRuntime,
          env: {},
          rateLimiter,
          now: new Date("2026-07-13T01:10:00.000Z"),
        }),
        processSeedanceVideoPollJob(db, {
          taskId: second.taskId,
          runtime: seedanceStorageRuntime,
          env: {},
          rateLimiter,
          now: new Date("2026-07-13T01:10:01.000Z"),
        }),
      ]);

      assert.deepEqual(limiterUserIds.sort(), [
        `${userId}:member:${first.teamMemberId}`,
        `${userId}:member:${second.teamMemberId}`,
      ].sort());
      assert.equal(new Set(limiterUserIds).size, 2);
      assert.deepEqual(results, [
        { status: "rate_limited", retryAfterMs: 1200, reason: "test-poll-limit" },
        { status: "rate_limited", retryAfterMs: 1200, reason: "test-poll-limit" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("persists SanBao video poll ModelError failure codes from the error factory", async () => {
    const db = await createMigratedTestDb();

    try {
      await db.query("UPDATE ai_model_configs SET status = 'active' WHERE model_code = 'sanbao-sd2-fast-4img'");
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "203",
        userId: "70000000-0000-4000-8000-000000000203",
        status: "running",
      });
      await db.query(
        `
          UPDATE tasks
          SET input_snapshot_json = jsonb_set(input_snapshot_json, '{model}', '"sanbao-sd2-fast-4img"'::jsonb)
          WHERE id = $1
        `,
        [seeded.taskId],
      );

      const result = await processSeedanceVideoPollJob(db, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: { SAN_BAO_API_KEY: "san-bao-test-key" },
        fetchImpl: (async () => new Response(JSON.stringify({ error: "bad gateway" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
        now: new Date("2026-08-07T05:10:00.000Z"),
      });
      const stored = await db.query<{
        task_failure_code: string | null;
        provider_failure_code: string | null;
      }>(
        `
          SELECT t.failure_code AS task_failure_code,
                 pr.failure_code AS provider_failure_code
          FROM tasks t
          JOIN provider_requests pr ON pr.task_id = t.id
          WHERE t.id = $1
        `,
        [seeded.taskId],
      );

      assert.deepEqual(result, { status: "failed", failureCode: "san_bao_service_unavailable" });
      assert.equal(stored.rows[0]?.task_failure_code, "san_bao_service_unavailable");
      assert.equal(stored.rows[0]?.provider_failure_code, "san_bao_service_unavailable");
    } finally {
      await db.close();
    }
  });

  it("fails immediately when video submission has no external id", async () => {
    const db = await createMigratedTestDb();

    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "301",
        userId: "70000000-0000-4000-8000-000000000301",
        status: "queued",
      });
      const result = await processSeedanceVideoSubmitJob(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: (async () => {
          throw new Error("provider unavailable");
        }) as typeof fetch,
        now: new Date("2026-07-13T02:00:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null; locked_until: Date | string | null }>(
        "SELECT status, failure_code, locked_until FROM tasks WHERE id = $1",
        [seeded.taskId],
      );
      const providerRequest = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE task_id = $1",
        [seeded.taskId],
      );

      assert.deepEqual(result, { status: "failed", failureCode: "provider_submission_missing_task_id" });
      assert.equal(task.rows[0]?.status, "failed");
      assert.equal(task.rows[0]?.failure_code, "provider_submission_missing_task_id");
      assert.equal(task.rows[0]?.locked_until, null);
      assert.equal(providerRequest.rows.length, 1);
      assert.equal(providerRequest.rows[0]?.status, "failed");
      assert.equal(providerRequest.rows[0]?.failure_code, "provider_submission_missing_task_id");
    } finally {
      await db.close();
    }
  });

  it("fails a user task cleanly after a definitive provider rejection", async () => {
    const db = await createMigratedTestDb();

    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "304",
        userId: "70000000-0000-4000-8000-000000000304",
        status: "queued",
      });
      const result = await processSeedanceVideoSubmitJob(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: (async () => new Response(
          JSON.stringify({ error: { message: "invalid request" } }),
          { status: 400, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
        now: new Date("2026-07-13T02:05:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [seeded.taskId],
      );
      const providerRequest = await db.query<{ status: string }>(
        "SELECT status FROM provider_requests WHERE task_id = $1",
        [seeded.taskId],
      );

      assert.deepEqual(result, { status: "failed", failureCode: "provider_submission_failed" });
      assert.deepEqual(task.rows[0], {
        status: "failed",
        failure_code: "provider_submission_failed",
      });
      assert.equal(providerRequest.rows[0]?.status, "failed");
    } finally {
      await db.close();
    }
  });

  it("keeps an accepted provider submission running and records the submitted request", async () => {
    const db = await createMigratedTestDb();

    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "305",
        userId: "70000000-0000-4000-8000-000000000305",
        status: "queued",
      });
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
            id, user_id, project_id, target_type, target_id, workflow_id, task_id,
            model_code, media_type, task_mode, status, progress_stage,
            request_summary_json, submitted_at, created_at, updated_at
          )
          VALUES (
            '90000000-0000-4000-8000-000000000305', $1, $2, 'episode', $3, $4, $3,
            'seedance-i2v-pro', 'video', 'video.image_to_video', 'queued', 'queued',
            '{}'::jsonb, $5, $5, $5
          )
        `,
        [seeded.userId, seeded.projectId, seeded.taskId, seeded.workflowId, new Date("2026-07-13T02:06:00.000Z")],
      );
      const result = await processSeedanceVideoSubmitJob(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: (async () => new Response(
          JSON.stringify({ data: { task_id: "seedance-task-accepted", status: "queued" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
        now: new Date("2026-07-13T02:06:00.000Z"),
      });
      const state = await db.query<{
        task_status: string;
        task_failure_code: string | null;
        snapshot_status: string;
        snapshot_progress_stage: string;
        provider_status: string;
        external_request_id: string | null;
        log_status: string;
        log_failure_code: string | null;
        request_body_json: Record<string, unknown>;
      }>(
        `
          SELECT
            task.status AS task_status,
            task.failure_code AS task_failure_code,
            snapshot.status AS snapshot_status,
            snapshot.progress_stage AS snapshot_progress_stage,
            provider.status AS provider_status,
            provider.external_request_id,
            log.status AS log_status,
            log.failure_code AS log_failure_code,
            log.request_body_json
          FROM tasks task
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
          JOIN provider_requests provider ON provider.task_id = task.id
          JOIN user_model_request_logs log ON log.provider_request_id = provider.id
          WHERE task.id = $1
        `,
        [seeded.taskId],
      );

      assert.equal(result.status, "submitted");
      assert.equal(result.externalRequestId, "seedance-task-accepted");
      assert.match(result.attemptId ?? "", /^[0-9a-f-]{36}$/i);
      assert.deepEqual(state.rows[0], {
        task_status: "running",
        task_failure_code: null,
        snapshot_status: "running",
        snapshot_progress_stage: "provider_accepted",
        provider_status: "accepted",
        external_request_id: "seedance-task-accepted",
        log_status: "submitted",
        log_failure_code: null,
        request_body_json: {
          model: "seedance-2-0-i2v",
          content: [{ type: "text", text: "user-scoped limiter test" }],
          watermark: false,
        },
      });
    } finally {
      await db.close();
    }
  });

  it("fails a provider submission that does not return a queryable task id", async () => {
    const db = await createMigratedTestDb();

    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "306",
        userId: "70000000-0000-4000-8000-000000000306",
        status: "queued",
      });
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
            id, user_id, project_id, target_type, target_id, workflow_id, task_id,
            model_code, media_type, task_mode, status, progress_stage,
            request_summary_json, submitted_at, created_at, updated_at
          )
          VALUES (
            '90000000-0000-4000-8000-000000000306', $1, $2, 'episode', $3, $4, $3,
            'seedance-i2v-pro', 'video', 'video.image_to_video', 'queued', 'queued',
            '{}'::jsonb, $5, $5, $5
          )
        `,
        [seeded.userId, seeded.projectId, seeded.taskId, seeded.workflowId, new Date("2026-07-13T02:07:00.000Z")],
      );
      const result = await processSeedanceVideoSubmitJob(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: (async () => new Response(
          JSON.stringify({ data: { status: "queued" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
        now: new Date("2026-07-13T02:07:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [seeded.taskId],
      );
      const snapshot = await db.query<{ status: string; failure_json: { failureCode?: string } | null }>(
        "SELECT status, failure_json FROM ai_generation_task_snapshots WHERE task_id = $1",
        [seeded.taskId],
      );

      assert.deepEqual(result, { status: "failed", failureCode: "provider_submission_missing_task_id" });
      assert.deepEqual(task.rows[0], {
        status: "failed",
        failure_code: "provider_submission_missing_task_id",
      });
      assert.equal(snapshot.rows[0]?.status, "failed");
      assert.equal(snapshot.rows[0]?.failure_json?.failureCode, "provider_submission_missing_task_id");
    } finally {
      await db.close();
    }
  });

  it("does not mark an accepted provider task failed when local request logging fails afterward", async () => {
    const db = await createMigratedTestDb();
    let requestLogWrites = 0;
    const failingLogDb = {
      query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
        if (/INSERT INTO user_model_request_logs/i.test(sql)) {
          requestLogWrites += 1;
          if (requestLogWrites === 2) {
            throw new Error("simulated_request_log_write_failed");
          }
        }
        return db.query<T>(sql, params);
      },
    };

    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "306",
        userId: "70000000-0000-4000-8000-000000000306",
        status: "queued",
      });
      const result = await processSeedanceVideoSubmitJob(failingLogDb, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: (async () => new Response(
          JSON.stringify({ data: { task_id: "seedance-task-recovered", status: "queued" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
        now: new Date("2026-07-13T02:07:00.000Z"),
      });
      const state = await db.query<{
        task_status: string;
        task_failure_code: string | null;
        provider_status: string;
        external_request_id: string | null;
        log_status: string;
        log_failure_code: string | null;
      }>(
        `
          SELECT
            task.status AS task_status,
            task.failure_code AS task_failure_code,
            provider.status AS provider_status,
            provider.external_request_id,
            log.status AS log_status,
            log.failure_code AS log_failure_code
          FROM tasks task
          JOIN provider_requests provider ON provider.task_id = task.id
          JOIN user_model_request_logs log ON log.provider_request_id = provider.id
          WHERE task.id = $1
        `,
        [seeded.taskId],
      );

      assert.equal(result.status, "already_started");
      assert.equal(result.externalRequestId, "seedance-task-recovered");
      assert.match(result.attemptId ?? "", /^[0-9a-f-]{36}$/i);
      assert.deepEqual(state.rows[0], {
        task_status: "running",
        task_failure_code: null,
        provider_status: "accepted",
        external_request_id: "seedance-task-recovered",
        log_status: "submitted",
        log_failure_code: null,
      });
    } finally {
      await db.close();
    }
  });

  it("keeps the result unknown when provider cancellation is unconfirmed after the polling window", async () => {
    const db = await createMigratedTestDb();

    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "302",
        userId: "70000000-0000-4000-8000-000000000302",
        status: "running",
      });
      const result = await expireSeedanceVideoPollJob(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: (async () => {
          throw new Error("cancel endpoint unavailable");
        }) as typeof fetch,
        now: new Date("2026-07-13T02:10:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [seeded.taskId],
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE task_id = $1",
        [seeded.taskId],
      );
      const provider = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE task_id = $1",
        [seeded.taskId],
      );

      assert.deepEqual(result, { status: "failed", failureCode: "provider_poll_timeout" });
      assert.deepEqual(task.rows[0], {
        status: "result_unknown",
        failure_code: "provider_poll_timeout",
      });
      assert.deepEqual(attempt.rows[0], {
        status: "result_unknown",
        failure_code: "provider_poll_timeout",
      });
      assert.deepEqual(provider.rows[0], {
        status: "result_unknown",
        failure_code: "provider_poll_timeout",
      });
    } finally {
      await db.close();
    }
  });

  it("retries an interrupted download and finalizes the user-owned artifact once", async () => {
    const db = await createMigratedTestDb();

    try {
      const artifactUrl = "https://cdn.example.test/user-owned-seedance.mp4";
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "303",
        userId: "70000000-0000-4000-8000-000000000303",
        status: "running",
        providerSucceeded: true,
        videoUrl: artifactUrl,
      });
      let downloadAttempts = 0;
      const uploadedBodies: unknown[] = [];
      const uploadedPayloads: Buffer[] = [];
      const runtime: UploadSessionRuntime = {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "seedance-user-artifact-test",
        region: "ap-guangzhou",
        publicBaseUrl: "https://storage.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async putObject(input) {
            uploadedBodies.push(input.body);
            const chunks: Buffer[] = [];
            for await (const chunk of input.body as AsyncIterable<Buffer | Uint8Array | string>) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            uploadedPayloads.push(Buffer.concat(chunks));
            return { eTag: "seedance-user-artifact-etag" };
          },
        },
      };
      const fetchImpl = (async (url) => {
        assert.equal(String(url), artifactUrl);
        downloadAttempts += 1;
        if (downloadAttempts === 1) {
          return new Response(new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([0, 0, 0, 24]));
              controller.error(new Error("terminated"));
            },
          }), {
            status: 200,
            headers: { "content-type": "video/mp4", "content-length": "8" },
          });
        }
        return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "8" },
        });
      }) as typeof fetch;

      const result = await finalizeSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: {
          GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "2",
          GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
        },
        fetchImpl,
        now: new Date("2026-07-13T02:20:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [seeded.taskId],
      );
      const storageObjects = await db.query<{
        status: string;
        created_by_user_id: string | null;
      }>(
        "SELECT status, created_by_user_id FROM storage_objects WHERE project_id = $1",
        [seeded.projectId],
      );
      const versions = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM asset_versions WHERE source_task_id = $1",
        [seeded.taskId],
      );

      assert.deepEqual(result, { status: "succeeded" });
      assert.equal(downloadAttempts, 2);
      assert.equal(uploadedBodies.length, 2);
      assert.ok(uploadedBodies.every((body) => !(body instanceof Uint8Array)));
      assert.deepEqual(uploadedPayloads, [Buffer.from([0, 0, 0, 24, 102, 116, 121, 112])]);
      assert.deepEqual(task.rows[0], { status: "succeeded", failure_code: null });
      assert.deepEqual(storageObjects.rows, [
        { status: "available", created_by_user_id: seeded.userId },
      ]);
      assert.equal(versions.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("reuses a remotely uploaded video after a crash without another download or PUT", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "309",
        userId: "70000000-0000-4000-8000-000000000309",
        status: "running",
        providerSucceeded: true,
        videoUrl: "https://cdn.example.test/reusable-seedance.mp4",
      });
      const now = new Date("2026-07-13T02:20:00.000Z");
      const storageObject = await createOrReuseGenerationStorageObject(db, {
        userId: seeded.userId,
        projectId: seeded.projectId,
        bucket: "seedance-reuse-test",
        objectName: `seedance-video-${seeded.taskId}.mp4`,
        contentType: "video/mp4",
        sizeBytes: 8,
        provider: "tencent_cos",
        status: "pending_upload",
        metadata: {
          taskId: seeded.taskId,
          attemptId: seeded.attemptId,
        },
        createdByUserId: seeded.userId,
        now,
      });
      let putCalls = 0;
      const runtime: UploadSessionRuntime = {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "seedance-reuse-test",
        region: "ap-guangzhou",
        publicBaseUrl: "https://storage.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async headObject(input) {
            assert.equal(input.objectKey, storageObject.objectKey);
            return { exists: true, contentType: "video/mp4", contentLength: 8 };
          },
          async putObject() {
            putCalls += 1;
            return {};
          },
        },
      };

      const result = await finalizeSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: {},
        fetchImpl: (async () => {
          throw new Error("existing remote video must not be downloaded again");
        }) as typeof fetch,
        now,
      });
      const stored = await db.query<{ status: string }>(
        "SELECT status FROM storage_objects WHERE id = $1",
        [storageObject.id],
      );

      assert.deepEqual(result, { status: "succeeded" });
      assert.equal(putCalls, 0);
      assert.equal(stored.rows[0]?.status, "available");
    } finally {
      await db.close();
    }
  });

  it("skips a concurrent video finalizer while the first upload lease is active", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "310",
        userId: "70000000-0000-4000-8000-000000000310",
        status: "running",
        providerSucceeded: true,
        videoUrl: "https://cdn.example.test/concurrent-seedance.mp4",
      });
      let releaseDownload!: () => void;
      const downloadRelease = new Promise<void>((resolve) => { releaseDownload = resolve; });
      let markDownloadStarted!: () => void;
      const downloadStarted = new Promise<void>((resolve) => { markDownloadStarted = resolve; });
      let putCalls = 0;
      const runtime: UploadSessionRuntime = {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "seedance-concurrent-test",
        region: "ap-guangzhou",
        publicBaseUrl: "https://storage.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async putObject(input) {
            putCalls += 1;
            for await (const _chunk of input.body as AsyncIterable<Buffer | Uint8Array | string>) {
              // Drain the first finalizer's upload.
            }
            return {};
          },
        },
      };
      const first = finalizeSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: {},
        fetchImpl: (async () => {
          markDownloadStarted();
          await downloadRelease;
          return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
            status: 200,
            headers: { "content-type": "video/mp4", "content-length": "8" },
          });
        }) as typeof fetch,
        now: new Date("2026-07-13T02:20:00.000Z"),
      });
      await downloadStarted;

      const concurrent = await finalizeSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: {},
        fetchImpl: (async () => {
          throw new Error("concurrent finalizer must not download");
        }) as typeof fetch,
        now: new Date("2026-07-13T02:20:01.000Z"),
      });
      releaseDownload();
      const completed = await first;

      assert.deepEqual(concurrent, { status: "skipped" });
      assert.deepEqual(completed, { status: "succeeded" });
      assert.equal(putCalls, 1);
    } finally {
      await db.close();
    }
  });

  it("contains a provider stream error when storage returns before draining the body", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "308",
        userId: "70000000-0000-4000-8000-000000000308",
        status: "running",
        providerSucceeded: true,
        videoUrl: "https://cdn.example.test/late-error-seedance.mp4",
      });
      const runtime: UploadSessionRuntime = {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "seedance-late-error-test",
        region: "ap-guangzhou",
        publicBaseUrl: "https://storage.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          // This models an adapter that resolves before consuming the source.
          async putObject() {
            return { eTag: "early-return-etag" };
          },
        },
      };
      const uncaughtErrors: unknown[] = [];
      const onUncaughtException = (error: unknown) => uncaughtErrors.push(error);
      process.on("uncaughtException", onUncaughtException);
      let result: Awaited<ReturnType<typeof finalizeSeedanceVideoArtifactJob>>;
      try {
        result = await finalizeSeedanceVideoArtifactJob(db, {
          taskId: seeded.taskId,
          runtime,
          env: {
            GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "1",
            GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
          },
          fetchImpl: (async () => new Response(new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([0, 0, 0, 24]));
              setTimeout(() => controller.error(new Error("late provider stream failure")), 0);
            },
          }), {
            status: 200,
            headers: { "content-type": "video/mp4" },
          })) as typeof fetch,
          now: new Date("2026-07-13T02:25:00.000Z"),
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      } finally {
        process.removeListener("uncaughtException", onUncaughtException);
      }

      assert.deepEqual(result, { status: "failed", failureCode: "provider_output_download_failed" });
      assert.deepEqual(uncaughtErrors, []);
    } finally {
      await db.close();
    }
  });

  it("cancels a result-unknown video after reopening its manual-review credit reservation", async () => {
    const db = await createMigratedTestDb();
    const now = new Date("2026-07-20T10:02:00.000Z");
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "096",
        userId: "70000000-0000-4000-8000-000000000096",
        estimatedCredits: 120,
        status: "running",
      });
      await grantCredits(db, {
        userId: seeded.userId,
        amount: 120,
        sourceType: "test_grant",
        sourceId: seeded.taskId,
        reason: "result unknown cancellation test grant",
        now,
      });
      const reservation = await reserveCredits(db, {
        userId: seeded.userId,
        amount: 120,
        sourceType: "workflow_task",
        sourceId: seeded.taskId,
        reason: "result unknown cancellation test reservation",
        projectId: seeded.projectId,
        workflowId: seeded.workflowId,
        taskId: seeded.taskId,
        now,
      });
      await db.query("UPDATE tasks SET status = 'result_unknown', failure_code = 'provider_poll_timeout' WHERE id = $1", [seeded.taskId]);
      await db.query("UPDATE task_attempts SET status = 'result_unknown', failure_code = 'provider_poll_timeout' WHERE id = $1", [seeded.attemptId]);
      await db.query("UPDATE credit_reservations SET status = 'manual_review_required' WHERE id = $1", [reservation.reservation.id]);

      const result = await cancelGenerationTask(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
        now,
      });
      const state = await db.query<{
        task_status: string;
        attempt_status: string;
        reservation_status: string;
        amount_reserved: number | string;
        amount_released: number | string;
      }>(`
        SELECT t.status AS task_status,
               a.status AS attempt_status,
               r.status AS reservation_status,
               r.amount_reserved,
               r.amount_released
        FROM tasks t
        JOIN task_attempts a ON a.id = t.current_attempt_id
        JOIN credit_reservations r ON r.task_id = t.id
        WHERE t.id = $1
      `, [seeded.taskId]);

      assert.equal(result.status, "canceled", JSON.stringify(result));
      assert.deepEqual(state.rows[0], {
        task_status: "canceled",
        attempt_status: "canceled",
        reservation_status: "released",
        amount_reserved: 0,
        amount_released: 120,
      });
    } finally {
      await db.close();
    }
  });

  it("does not cancel a newer attempt created while provider cancellation is in flight", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "316",
        userId: "70000000-0000-4000-8000-000000000316",
        status: "running",
      });
      const currentAttemptId = "61000000-0000-4000-8000-000000000316";
      let providerCancelCalls = 0;

      const result = await cancelGenerationTask(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: (async () => {
          providerCancelCalls += 1;
          await db.query(
            `
              INSERT INTO task_attempts (
                id, project_id, workflow_id, task_id, attempt_number, status,
                locked_by, locked_until, heartbeat_at, started_at
              )
              VALUES ($1, $2, $3, $4, 2, 'running', 'seedance-retry', $5, $6, $6)
            `,
            [
              currentAttemptId,
              seeded.projectId,
              seeded.workflowId,
              seeded.taskId,
              new Date("2026-07-20T10:20:00.000Z"),
              new Date("2026-07-20T10:05:00.000Z"),
            ],
          );
          await db.query(
            `
              UPDATE tasks
              SET current_attempt_id = $2, attempt_count = 2
              WHERE id = $1
            `,
            [seeded.taskId, currentAttemptId],
          );
          return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
        }) as typeof fetch,
        now: new Date("2026-07-20T10:10:00.000Z"),
      });
      const state = await db.query<{
        task_status: string;
        current_attempt_id: string;
        current_attempt_status: string;
      }>(
        `
          SELECT task.status AS task_status,
                 task.current_attempt_id,
                 attempt.status AS current_attempt_status
          FROM tasks task
          JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
          WHERE task.id = $1
        `,
        [seeded.taskId],
      );

      assert.equal(providerCancelCalls, 1);
      assert.deepEqual(result, {
        status: "not_cancelable",
        taskId: seeded.taskId,
        taskStatus: "running",
        reason: "generation_task_state_changed",
      });
      assert.deepEqual(state.rows[0], {
        task_status: "running",
        current_attempt_id: currentAttemptId,
        current_attempt_status: "running",
      });
    } finally {
      await db.close();
    }
  });

  it("does not let a newer video attempt fail an externally-started historical request", async () => {
    const db = await createMigratedTestDb();

    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "315",
        userId: "70000000-0000-4000-8000-000000000315",
        status: "queued",
      });
      const first = await processSeedanceVideoSubmitJob(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: (async () => {
          throw new Error("ambiguous provider submission");
        }) as typeof fetch,
        now: new Date("2026-07-13T02:00:00.000Z"),
      });
      const firstAttempt = await db.query<{ current_attempt_id: string }>(
        "SELECT current_attempt_id FROM tasks WHERE id = $1",
        [seeded.taskId],
      );
      await db.query(
        `
          UPDATE task_attempts
          SET status = 'failed', failure_code = 'test_retry', finished_at = $2
          WHERE id = $1
        `,
        [firstAttempt.rows[0]!.current_attempt_id, new Date("2026-07-13T02:01:00.000Z")],
      );
      await db.query(
        `
          UPDATE tasks
          SET status = 'queued', current_attempt_id = NULL,
              max_attempts = 3,
              locked_by = NULL, locked_until = NULL, heartbeat_at = NULL
          WHERE id = $1
        `,
        [seeded.taskId],
      );
      let secondProviderCalls = 0;

      const second = await processSeedanceVideoSubmitJob(db, {
        taskId: seeded.taskId,
        env: { VOLCENGINE_ARK_API_KEY: "test-key" },
        fetchImpl: (async () => {
          secondProviderCalls += 1;
          throw new Error("historical request must not be resubmitted");
        }) as typeof fetch,
        now: new Date("2026-07-13T02:02:00.000Z"),
      });
      const state = await db.query<{
        task_status: string;
        attempt_count: number;
        attempt_status: string;
        provider_status: string;
        provider_failure_code: string | null;
        provider_attempt_id: string | null;
        snapshot_status: string | null;
      }>(
        `
          SELECT task.status AS task_status,
                 task.attempt_count,
                 attempt.status AS attempt_status,
                 request.status AS provider_status,
                 request.failure_code AS provider_failure_code,
                 request.attempt_id AS provider_attempt_id,
                 snapshot.status AS snapshot_status
          FROM tasks task
          JOIN provider_requests request ON request.task_id = task.id
          JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
          LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
          WHERE task.id = $1
        `,
        [seeded.taskId],
      );

      assert.equal(first.status, "already_started");
      assert.equal(first.externalRequestId, null);
      assert.equal(first.attemptId, firstAttempt.rows[0]!.current_attempt_id);
      assert.deepEqual(second, {
        status: "failed",
        failureCode: "provider_request_attempt_conflict",
      });
      assert.equal(secondProviderCalls, 0);
      assert.equal(state.rows[0]?.task_status, "manual_review_required");
      assert.equal(state.rows[0]?.attempt_count, 2);
      assert.equal(state.rows[0]?.attempt_status, "manual_review_required");
      assert.equal(state.rows[0]?.provider_status, "result_unknown");
      assert.equal(state.rows[0]?.provider_failure_code, "provider_submission_ambiguous");
      assert.equal(
        state.rows[0]?.provider_attempt_id,
        firstAttempt.rows[0]?.current_attempt_id,
      );
      assert.equal(state.rows[0]?.snapshot_status, null);
    } finally {
      await db.close();
    }
  });

  it("retries when a durable provider result still needs video finalization", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "309",
        userId: "70000000-0000-4000-8000-000000000309",
        status: "running",
        providerSucceeded: true,
        videoUrl: "https://cdn.example.test/recoverable-seedance.mp4",
      });
      const durable = await db.query<{
        task_status: string;
        attempt_id: string | null;
        provider_status: string;
        external_request_id: string | null;
        video_url: string | null;
      }>(
        `
          SELECT t.status AS task_status,
                 t.current_attempt_id AS attempt_id,
                 pr.status AS provider_status,
                 pr.external_request_id,
                 pr.response_redacted_json->>'videoUrl' AS video_url
          FROM tasks t
          JOIN provider_requests pr ON pr.id = $2
          WHERE t.id = $1
        `,
        [seeded.taskId, seeded.providerRequestId],
      );
      assert.deepEqual(durable.rows[0], {
        task_status: "running",
        attempt_id: seeded.attemptId,
        provider_status: "succeeded",
        external_request_id: "external-309",
        video_url: "https://cdn.example.test/recoverable-seedance.mp4",
      });

      const fetchJob = {
        data: {
          taskId: seeded.taskId,
          workflowId: seeded.workflowId,
          mediaType: "video" as const,
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          artifactKind: "video" as const,
          artifactStage: "fetch" as const,
        },
      };
      const assertFetchRetries = async (database: typeof db) => {
        await assert.rejects(() => handleGenerationFetchArtifactJob({
          job: {
            data: fetchJob.data,
          },
          config: loadGenerationQueueConfig({}),
          publisher: { async add() { throw new Error("not-ready fetch must not enqueue persist"); } },
          processors: {
            async submitSeedanceVideo() { return { status: "settled" }; },
            async pollSeedanceVideo() { return { status: "waiting" }; },
            async expireSeedanceVideo() {
              return { status: "failed", failureCode: "generation_timeout" };
            },
            async fetchSeedanceVideoArtifact({ taskId, now }) {
              return fetchSeedanceVideoArtifactJob(database, {
                taskId,
                runtime: seedanceStorageRuntime,
                env: {},
                fetchImpl: (async () => {
                  throw new Error("a not-ready fetch must retry before downloading");
                }) as typeof fetch,
                now,
              });
            },
          },
          now: new Date("2026-07-13T02:29:00.000Z"),
        }), (error: unknown) => {
          assert.equal(
            (error as { failureCode?: string }).failureCode,
            GENERATION_ARTIFACT_FETCH_NOT_READY,
          );
          return true;
        });
      };
      for (const mutateFirstFinalizeRead of [
        () => [],
        (rows: Array<Record<string, unknown>>) => rows.map((row) => ({
          ...row,
          provider_response_redacted_json: {},
        })),
        (rows: Array<Record<string, unknown>>) => rows.map((row) => ({
          ...row,
          attempt_id: null,
          current_attempt_id: null,
          provider_attempt_id: null,
        })),
      ]) {
        let interceptedFirstFinalizeRead = false;
        const racingDb = {
          ...db,
          async query(sql: string, params: unknown[] = []) {
            const result = await db.query<Record<string, unknown>>(sql, params);
            if (
              !interceptedFirstFinalizeRead
              && sql.includes("t.task_type = 'episode_generate_video'")
              && sql.includes("pr.status = 'succeeded'")
            ) {
              interceptedFirstFinalizeRead = true;
              return { rows: mutateFirstFinalizeRead(result.rows) };
            }
            return result;
          },
        } as typeof db;

        await assertFetchRetries(racingDb);
        assert.equal(interceptedFirstFinalizeRead, true);
      }

      await db.query(
        "UPDATE provider_requests SET status = 'running', response_redacted_json = '{}'::jsonb WHERE id = $1",
        [seeded.providerRequestId],
      );
      await assertFetchRetries(db);
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'created',
              external_request_id = NULL,
              external_submission_started_at = NULL
          WHERE id = $1
        `,
        [seeded.providerRequestId],
      );
      await assertFetchRetries(db);

      await db.query("UPDATE tasks SET status = 'succeeded' WHERE id = $1", [seeded.taskId]);
      assert.deepEqual(await fetchSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: {},
        now: new Date("2026-07-13T02:30:00.000Z"),
      }), { status: "skipped" });
    } finally {
      await db.close();
    }
  });

  it("does not silently complete a video fetch while durable work is still nonterminal", async () => {
    const result = await fetchSeedanceVideoArtifactJob({
      async query(sql: string) {
        return {
          rows: sql.includes("t.status AS task_status") && sql.includes("t.failure_code")
            ? [{ task_status: "running", failure_code: null }]
            : [],
        };
      },
    } as never, {
      taskId: "50000000-0000-4000-8000-000000000310",
      runtime: seedanceStorageRuntime,
      env: {},
      now: new Date("2026-07-13T02:29:00.000Z"),
    });

    assert.deepEqual(result, {
      status: "failed",
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  });

  it("does not revive a queued video task from a historical succeeded provider attempt", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "311",
        userId: "70000000-0000-4000-8000-000000000311",
        status: "queued",
      });
      await db.query(
        `
          INSERT INTO task_attempts (
            id, project_id, workflow_id, task_id, attempt_number, status,
            failure_code, started_at, finished_at
          ) VALUES ($1, $2, $3, $4, 1, 'failed', 'provider_poll_timeout', $5, $6)
        `,
        [
          seeded.attemptId,
          seeded.projectId,
          seeded.workflowId,
          seeded.taskId,
          new Date("2026-07-13T01:00:00.000Z"),
          new Date("2026-07-13T01:10:00.000Z"),
        ],
      );
      await db.query(
        `
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id, attempt_id, provider_name,
            provider_operation, request_key, request_hash, payload_ref, payload_hash,
            status, external_submission_started_at, external_request_id,
            response_redacted_json, created_by_user_id
          ) VALUES (
            $1, $2, $3, $4, $5, 'volcengine', 'episode.video.generate',
            $6, $6, $6, $6, 'succeeded', $7, $8, $9::jsonb, $10
          )
        `,
        [
          seeded.providerRequestId,
          seeded.projectId,
          seeded.workflowId,
          seeded.taskId,
          seeded.attemptId,
          "seedance-stale-provider-311",
          new Date("2026-07-13T01:00:00.000Z"),
          "external-stale-311",
          JSON.stringify({
            status: "succeeded",
            videoUrl: "https://cdn.example.test/stale-result.mp4",
          }),
          seeded.userId,
        ],
      );

      const result = await fetchSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: {},
        fetchImpl: (async () => {
          throw new Error("queued stale artifact must not be downloaded");
        }) as typeof fetch,
        now: new Date("2026-07-13T02:29:00.000Z"),
      });
      const state = await db.query<{
        status: string;
        current_attempt_id: string | null;
        has_artifact_handoff: boolean;
      }>(
        `
          SELECT t.status,
                 t.current_attempt_id,
                 COALESCE(snapshot.provider_status_json ? 'artifactHandoff', false)
                   AS has_artifact_handoff
          FROM tasks t
          LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = t.id
          WHERE t.id = $1
        `,
        [seeded.taskId],
      );

      assert.deepEqual(result, { status: "skipped" });
      assert.deepEqual(state.rows[0], {
        status: "queued",
        current_attempt_id: null,
        has_artifact_handoff: false,
      });
    } finally {
      await db.close();
    }
  });

  it("does not attach a historical provider result to a newer running attempt", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "312",
        userId: "70000000-0000-4000-8000-000000000312",
        status: "running",
        providerSucceeded: true,
        videoUrl: "https://cdn.example.test/historical-result.mp4",
      });
      const currentAttemptId = "61000000-0000-4000-8000-000000000312";
      await db.query(
        `
          UPDATE task_attempts
          SET status = 'failed', failure_code = 'provider_poll_timeout', finished_at = $2
          WHERE id = $1
        `,
        [seeded.attemptId, new Date("2026-07-13T02:00:00.000Z")],
      );
      await db.query(
        `
          INSERT INTO task_attempts (
            id, project_id, workflow_id, task_id, attempt_number, status,
            locked_by, locked_until, heartbeat_at, started_at
          ) VALUES ($1, $2, $3, $4, 2, 'running', 'seedance-test', $5, $6, $6)
        `,
        [
          currentAttemptId,
          seeded.projectId,
          seeded.workflowId,
          seeded.taskId,
          new Date("2026-07-13T03:00:00.000Z"),
          new Date("2026-07-13T02:00:00.000Z"),
        ],
      );
      await db.query(
        `
          UPDATE tasks
          SET current_attempt_id = $2, attempt_count = 2
          WHERE id = $1
        `,
        [seeded.taskId, currentAttemptId],
      );
      let downloadCount = 0;

      const result = await fetchSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: {},
        fetchImpl: (async () => {
          downloadCount += 1;
          throw new Error("historical artifact must not be downloaded");
        }) as typeof fetch,
        now: new Date("2026-07-13T02:30:00.000Z"),
      });
      await db.query(
        "UPDATE provider_requests SET attempt_id = NULL WHERE id = $1",
        [seeded.providerRequestId],
      );
      const unboundHistoricalResult = await fetchSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: {},
        fetchImpl: (async () => {
          downloadCount += 1;
          throw new Error("multi-attempt unbound artifact must not be downloaded");
        }) as typeof fetch,
        now: new Date("2026-07-13T02:31:00.000Z"),
      });
      const state = await db.query<{
        status: string;
        current_attempt_id: string | null;
        has_artifact_handoff: boolean;
      }>(
        `
          SELECT t.status,
                 t.current_attempt_id,
                 COALESCE(snapshot.provider_status_json ? 'artifactHandoff', false)
                   AS has_artifact_handoff
          FROM tasks t
          LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = t.id
          WHERE t.id = $1
        `,
        [seeded.taskId],
      );

      assert.deepEqual(result, {
        status: "failed",
        failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
      });
      assert.deepEqual(unboundHistoricalResult, {
        status: "failed",
        failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
      });
      assert.equal(downloadCount, 0);
      assert.deepEqual(state.rows[0], {
        status: "running",
        current_attempt_id: currentAttemptId,
        has_artifact_handoff: false,
      });
    } finally {
      await db.close();
    }
  });

  it("does not poll a historical provider request for a newer running attempt", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "313",
        userId: "70000000-0000-4000-8000-000000000313",
        status: "running",
      });
      const currentAttemptId = "61000000-0000-4000-8000-000000000313";
      await db.query(
        `
          UPDATE task_attempts
          SET status = 'failed', failure_code = 'provider_poll_timeout', finished_at = $2
          WHERE id = $1
        `,
        [seeded.attemptId, new Date("2026-07-13T02:00:00.000Z")],
      );
      await db.query(
        `
          INSERT INTO task_attempts (
            id, project_id, workflow_id, task_id, attempt_number, status,
            locked_by, locked_until, heartbeat_at, started_at
          ) VALUES ($1, $2, $3, $4, 2, 'running', 'seedance-test', $5, $6, $6)
        `,
        [
          currentAttemptId,
          seeded.projectId,
          seeded.workflowId,
          seeded.taskId,
          new Date("2026-07-13T03:00:00.000Z"),
          new Date("2026-07-13T02:00:00.000Z"),
        ],
      );
      await db.query(
        `
          UPDATE tasks
          SET current_attempt_id = $2, attempt_count = 2
          WHERE id = $1
        `,
        [seeded.taskId, currentAttemptId],
      );
      let pollPermitCalls = 0;

      const result = await processSeedanceVideoPollJob(db, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: {},
        rateLimiter: {
          async acquireSubmitPermit() {
            throw new Error("poll jobs must not acquire submit permits");
          },
          async acquirePollPermit() {
            pollPermitCalls += 1;
            return { granted: false as const, retryAfterMs: 1200, reason: "unexpected-historical-poll" };
          },
        },
        now: new Date("2026-07-13T02:10:00.000Z"),
      });

      assert.equal(result.status, "skipped");
      assert.equal(pollPermitCalls, 0);
    } finally {
      await db.close();
    }
  });

  it("stops polling when the current attempt changes after the provider row was read", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "317",
        userId: "70000000-0000-4000-8000-000000000317",
        status: "running",
      });
      const currentAttemptId = "61000000-0000-4000-8000-000000000317";
      let switched = false;
      const racingDb = {
        async query(sql: string, params?: unknown[]) {
          const result = await db.query(sql, params);
          if (
            !switched
            && sql.includes("LEFT JOIN provider_requests pr")
            && sql.includes("t.current_attempt_id AS attempt_id")
            && sql.includes("t.input_snapshot_json->>'providerExecutor' = 'seedance'")
          ) {
            switched = true;
            await db.query(
              `
                INSERT INTO task_attempts (
                  id, project_id, workflow_id, task_id, attempt_number, status,
                  locked_by, locked_until, heartbeat_at, started_at
                )
                VALUES ($1, $2, $3, $4, 2, 'running', 'seedance-retry', $5, $6, $6)
              `,
              [
                currentAttemptId,
                seeded.projectId,
                seeded.workflowId,
                seeded.taskId,
                new Date("2026-07-13T03:00:00.000Z"),
                new Date("2026-07-13T02:00:00.000Z"),
              ],
            );
            await db.query(
              `
                UPDATE tasks
                SET current_attempt_id = $2, attempt_count = 2
                WHERE id = $1
              `,
              [seeded.taskId, currentAttemptId],
            );
          }
          return result;
        },
      };
      let pollPermitCalls = 0;

      const result = await processSeedanceVideoPollJob(racingDb as never, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: {},
        rateLimiter: {
          async acquireSubmitPermit() {
            throw new Error("poll jobs must not acquire submit permits");
          },
          async acquirePollPermit() {
            pollPermitCalls += 1;
            return { granted: false as const, retryAfterMs: 1200, reason: "stale-poll-race" };
          },
        },
        now: new Date("2026-07-13T02:10:00.000Z"),
      });
      const task = await db.query<{ status: string; current_attempt_id: string }>(
        "SELECT status, current_attempt_id FROM tasks WHERE id = $1",
        [seeded.taskId],
      );

      assert.equal(switched, true);
      assert.equal(result.status, "skipped");
      assert.equal(pollPermitCalls, 0);
      assert.deepEqual(task.rows[0], { status: "running", current_attempt_id: currentAttemptId });
    } finally {
      await db.close();
    }
  });

  it("continues polling a legacy unbound provider request on the first attempt", async () => {
    const db = await createMigratedTestDb();
    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "314",
        userId: "70000000-0000-4000-8000-000000000314",
        status: "running",
      });
      await db.query(
        "UPDATE provider_requests SET attempt_id = NULL WHERE id = $1",
        [seeded.providerRequestId],
      );
      let pollPermitCalls = 0;

      const result = await processSeedanceVideoPollJob(db, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: {},
        rateLimiter: {
          async acquireSubmitPermit() {
            throw new Error("poll jobs must not acquire submit permits");
          },
          async acquirePollPermit() {
            pollPermitCalls += 1;
            return { granted: false as const, retryAfterMs: 1200, reason: "legacy-poll-test" };
          },
        },
        now: new Date("2026-07-13T02:10:00.000Z"),
      });

      assert.deepEqual(result, {
        status: "rate_limited",
        retryAfterMs: 1200,
        reason: "legacy-poll-test",
      });
      assert.equal(pollPermitCalls, 1);
    } finally {
      await db.close();
    }
  });

  it("persists a fetched handoff without downloading the provider artifact twice", async () => {
    const db = await createMigratedTestDb();
    try {
      const artifactUrl = "https://cdn.example.test/split-seedance.mp4";
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "305",
        userId: "70000000-0000-4000-8000-000000000305",
        status: "running",
        providerSucceeded: true,
        videoUrl: artifactUrl,
      });
      const now = new Date("2026-07-13T02:20:00.000Z");
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
            id, user_id, project_id, target_type, target_id, workflow_id, task_id,
            attempt_id, provider_request_id, model_code, media_type, task_mode,
            status, progress_stage, submitted_at, started_at, created_at, updated_at
          )
          VALUES (
            '90000000-0000-4000-8000-000000000305', $1, $2, 'episode', $3, $4, $3,
            $5, $6, 'seedance-i2v-pro', 'video', 'video.image_to_video',
            'running', 'provider_succeeded', $7, $7, $7, $7
          )
        `,
        [seeded.userId, seeded.projectId, seeded.taskId, seeded.workflowId, seeded.attemptId, seeded.providerRequestId, now],
      );
      await db.query(
        "UPDATE tasks SET status = 'result_unknown', failure_code = 'provider_poll_timeout' WHERE id = $1",
        [seeded.taskId],
      );
      await db.query(
        "UPDATE task_attempts SET status = 'result_unknown', failure_code = 'provider_poll_timeout' WHERE id = $1",
        [seeded.attemptId],
      );
      let downloadCount = 0;
      const runtime: UploadSessionRuntime = {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "seedance-split-test",
        region: "ap-guangzhou",
        publicBaseUrl: "https://storage.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async putObject(input) {
            for await (const _chunk of input.body as AsyncIterable<Buffer | Uint8Array | string>) {
              // Drain the provider stream into the storage adapter.
            }
            return { eTag: "split-etag" };
          },
        },
      };
      const fetchResult = await fetchSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: { GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "1" },
        fetchImpl: (async (url) => {
          assert.equal(String(url), artifactUrl);
          downloadCount += 1;
          return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
            status: 200,
            headers: { "content-type": "video/mp4", "content-length": "8" },
          });
        }) as typeof fetch,
        now,
      });
      // Simulate a worker crash after the object became available but before
      // the task snapshot handoff was written. Recovery must reuse the object
      // metadata and must not contact the provider again.
      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET provider_status_json = provider_status_json - 'artifactHandoff'
          WHERE task_id = $1
        `,
        [seeded.taskId],
      );
      const recoveredFetch = await fetchSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: { GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "1" },
        fetchImpl: (async () => {
          throw new Error("recovered handoff must not download again");
        }) as typeof fetch,
        now: new Date("2026-07-13T02:20:00.500Z"),
      });
      const afterFetch = await db.query<{
        task_status: string;
        progress_stage: string;
        handoff_key: string | null;
        checksum: string | null;
        version_count: number;
      }>(
        `
          SELECT t.status AS task_status,
                 snapshot.progress_stage,
                 snapshot.provider_status_json->'artifactHandoff'->>'storageObjectKey' AS handoff_key,
                 storage.checksum,
                 (SELECT count(*)::int FROM asset_versions WHERE source_task_id = t.id) AS version_count
          FROM tasks t
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = t.id
          JOIN storage_objects storage ON storage.metadata_json->>'taskId' = t.id::text
          WHERE t.id = $1
        `,
        [seeded.taskId],
      );

      assert.deepEqual(fetchResult, { status: "succeeded" });
      assert.deepEqual(recoveredFetch, { status: "succeeded" });
      assert.equal(downloadCount, 1);
      assert.equal(afterFetch.rows[0]?.task_status, "running");
      assert.equal(afterFetch.rows[0]?.progress_stage, "artifact_fetched");
      assert.ok(afterFetch.rows[0]?.handoff_key);
      assert.equal(afterFetch.rows[0]?.checksum, createHash("sha256").update(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])).digest("hex"));
      assert.equal(afterFetch.rows[0]?.version_count, 0);
      await db.query(
        "UPDATE tasks SET status = 'result_unknown', failure_code = 'provider_poll_timeout' WHERE id = $1",
        [seeded.taskId],
      );
      await db.query(
        "UPDATE task_attempts SET status = 'result_unknown', failure_code = 'provider_poll_timeout' WHERE id = $1",
        [seeded.attemptId],
      );

      const persistResult = await persistSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: {},
        now: new Date("2026-07-13T02:20:01.000Z"),
      });
      const replayResult = await persistSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: {},
        now: new Date("2026-07-13T02:20:02.000Z"),
      });
      const afterPersist = await db.query<{ task_status: string; version_count: number }>(
        `
          SELECT t.status AS task_status,
                 (SELECT count(*)::int FROM asset_versions WHERE source_task_id = t.id) AS version_count
          FROM tasks t
          WHERE t.id = $1
        `,
        [seeded.taskId],
      );
      assert.deepEqual(persistResult, { status: "succeeded" });
      assert.deepEqual(replayResult, { status: "skipped" });
      assert.equal(downloadCount, 1);
      assert.deepEqual(afterPersist.rows[0], { task_status: "succeeded", version_count: 1 });
    } finally {
      await db.close();
    }
  });

  it("persists a projectless video handoff without creating a project asset", async () => {
    const db = await createMigratedTestDb();
    try {
      const artifactUrl = "https://cdn.example.test/projectless-seedance.mp4";
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "306",
        userId: "70000000-0000-4000-8000-000000000306",
        status: "running",
        providerSucceeded: true,
        videoUrl: artifactUrl,
        projectless: true,
      });
      const now = new Date("2026-07-13T02:30:00.000Z");
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
            id, user_id, project_id, target_type, target_id, workflow_id, task_id,
            attempt_id, provider_request_id, model_code, media_type, task_mode,
            status, progress_stage, submitted_at, started_at, created_at, updated_at
          )
          VALUES (
            '90000000-0000-4000-8000-000000000306', $1, NULL, 'standalone_video', $2, $3, $2,
            $4, $5, 'seedance-i2v-pro', 'video', 'video.image_to_video',
            'running', 'provider_succeeded', $6, $6, $6, $6
          )
        `,
        [seeded.userId, seeded.taskId, seeded.workflowId, seeded.attemptId, seeded.providerRequestId, now],
      );
      const runtime: UploadSessionRuntime = {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "seedance-projectless-test",
        region: "ap-guangzhou",
        publicBaseUrl: "https://storage.example.test",
        adapter: {
          async createSignedReadUrl(input) {
            return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
          },
          async putObject(input) {
            for await (const _chunk of input.body as AsyncIterable<Buffer | Uint8Array | string>) {
              // Drain the provider stream into the storage adapter.
            }
            return { eTag: "projectless-etag" };
          },
        },
      };

      const fetchResult = await fetchSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: { GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "1" },
        fetchImpl: (async (url) => {
          assert.equal(String(url), artifactUrl);
          return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
            status: 200,
            headers: { "content-type": "video/mp4", "content-length": "8" },
          });
        }) as typeof fetch,
        now,
      });
      const persistResult = await persistSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime,
        env: {},
        now: new Date("2026-07-13T02:30:01.000Z"),
      });
      const persisted = await db.query<{
        task_status: string;
        storage_project_id: string | null;
        storage_user_id: string | null;
        version_count: number;
      }>(
        `
          SELECT t.status AS task_status,
                 storage.project_id AS storage_project_id,
                 storage.created_by_user_id AS storage_user_id,
                 (SELECT count(*)::int FROM asset_versions WHERE source_task_id = t.id) AS version_count
          FROM tasks t
          JOIN storage_objects storage
            ON storage.metadata_json->>'taskId' = t.id::text
          WHERE t.id = $1
        `,
        [seeded.taskId],
      );

      assert.deepEqual(fetchResult, { status: "succeeded" });
      assert.deepEqual(persistResult, { status: "succeeded" });
      assert.deepEqual(persisted.rows[0], {
        task_status: "succeeded",
        storage_project_id: null,
        storage_user_id: seeded.userId,
        version_count: 0,
      });
    } finally {
      await db.close();
    }
  });

  it("stops artifact storage retries at ten and marks the task for admin handling", async () => {
    const db = await createMigratedTestDb();

    try {
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "304",
        userId: "70000000-0000-4000-8000-000000000304",
        status: "running",
        providerSucceeded: true,
        videoUrl: "https://cdn.example.test/expired-seedance.mp4",
      });
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
            id, user_id, project_id, target_type, target_id, workflow_id, task_id,
            provider_request_id, model_code, media_type, task_mode, status,
            progress_stage, provider_status_json, submitted_at, started_at, created_at, updated_at
          )
          VALUES (
            '90000000-0000-4000-8000-000000000304', $1, $2, 'episode', $3, $4, $3,
            $5, 'seedance-i2v-pro', 'video', 'video.image_to_video', 'running',
            'asset_transfer_retry_pending', '{"transferRetryAttempt":9}'::jsonb,
            $6, $6, $6, $6
          )
        `,
        [
          seeded.userId,
          seeded.projectId,
          seeded.taskId,
          seeded.workflowId,
          seeded.providerRequestId,
          new Date("2026-07-13T02:00:00.000Z"),
        ],
      );
      const fetchImpl = (async () => new Response("expired", { status: 410 })) as typeof fetch;
      const first = await finalizeSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: {
          GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "1",
          GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
        },
        fetchImpl,
        now: new Date("2026-07-13T02:20:00.000Z"),
      });
      const second = await finalizeSeedanceVideoArtifactJob(db, {
        taskId: seeded.taskId,
        runtime: seedanceStorageRuntime,
        env: {
          GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "1",
          GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
        },
        fetchImpl,
        now: new Date("2026-07-13T02:25:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [seeded.taskId],
      );
      const snapshot = await db.query<{
        status: string;
        progress_stage: string;
        provider_status_json: { transferRetryAttempt?: number };
        failure_json: { failureCode?: string; transferRetryAttempt?: number };
      }>(
        `
          SELECT status, progress_stage, provider_status_json, failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [seeded.taskId],
      );

      assert.deepEqual(first, { status: "failed", failureCode: "provider_output_storage_failed" });
      assert.deepEqual(second, { status: "skipped" });
      assert.deepEqual(task.rows[0], {
        status: "manual_review_required",
        failure_code: "provider_output_storage_failed",
      });
      assert.equal(snapshot.rows[0]?.status, "manual_review_required");
      assert.equal(snapshot.rows[0]?.progress_stage, "asset_transfer_manual_review");
      assert.equal(snapshot.rows[0]?.provider_status_json.transferRetryAttempt, 10);
      assert.equal(snapshot.rows[0]?.failure_json.failureCode, "provider_output_storage_failed");
      assert.equal(snapshot.rows[0]?.failure_json.transferRetryAttempt, 10);
    } finally {
      await db.close();
    }
  });

  it("recovers a completed timeout once without consuming released credits", async () => {
    const db = await createMigratedTestDb();
    try {
      const artifactUrl = "https://cdn.example.test/recovered-seedance.mp4";
      const seeded = await seedRateLimitedSeedanceTask(db, {
        suffix: "307",
        userId: "70000000-0000-4000-8000-000000000307",
        estimatedCredits: 120,
        status: "running",
      });
      const failedAt = new Date("2026-07-13T04:00:00.000Z");
      await db.query("UPDATE tasks SET status='failed', failure_code='provider_poll_timeout' WHERE id=$1", [seeded.taskId]);
      await db.query("UPDATE task_attempts SET status='failed', failure_code='provider_poll_timeout', finished_at=$2 WHERE id=$1", [seeded.attemptId, failedAt]);
      await db.query("UPDATE workflows SET status='failed', finished_at=$2 WHERE id=$1", [seeded.workflowId, failedAt]);
      await db.query("UPDATE provider_requests SET status='failed', failure_code='provider_poll_timeout' WHERE id=$1", [seeded.providerRequestId]);
      await db.query(
        `INSERT INTO credit_reservations
          (id,user_id,project_id,workflow_id,task_id,amount_total,amount_reserved,amount_consumed,amount_released,status,source_type,source_id,reason,created_by_user_id)
         VALUES ('91000000-0000-4000-8000-000000000307',$1,$2,$3,$4,120,0,0,120,'released','generation_task',$4,'video generation',$1)`,
        [seeded.userId, seeded.projectId, seeded.workflowId, seeded.taskId],
      );
      await db.query(
        `INSERT INTO ai_generation_task_snapshots
          (id,user_id,project_id,target_type,target_id,workflow_id,task_id,attempt_id,provider_request_id,credit_reservation_id,model_code,media_type,task_mode,status,progress_stage,estimated_credits,credit_status,credit_summary_json,submitted_at,failed_at,created_at,updated_at)
         VALUES ('92000000-0000-4000-8000-000000000307',$1,$2,'episode',$3,$4,$3,$5,$6,'91000000-0000-4000-8000-000000000307','seedance-i2v-pro','video','video.image_to_video','failed','failed',120,'released','{"released":120}'::jsonb,$7,$7,$7,$7)`,
        [seeded.userId, seeded.projectId, seeded.taskId, seeded.workflowId, seeded.attemptId, seeded.providerRequestId, failedAt],
      );
      let polls = 0;
      let downloads = 0;
      let uploads = 0;
      const runtime: UploadSessionRuntime = {
        mode: "cos", provider: "tencent_cos", bucket: "seedance-timeout-recovery-test",
        region: "ap-guangzhou", publicBaseUrl: "https://storage.example.test",
        adapter: {
          async createSignedReadUrl(input) { return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt }; },
          async putObject(input) {
            uploads += 1;
            for await (const _chunk of input.body as AsyncIterable<Buffer | Uint8Array | string>) { /* drain */ }
            return { eTag: "recovery-etag" };
          },
        },
      };
      const fetchImpl = (async (url) => {
        if (String(url).includes("/tasks/external-307")) {
          polls += 1;
          return Response.json({ id: "external-307", status: "succeeded", content: { video_url: artifactUrl } });
        }
        assert.equal(String(url), artifactUrl);
        downloads += 1;
        return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { status: 200, headers: { "content-type": "video/mp4" } });
      }) as typeof fetch;
      const run = (now: Date) => recoverSeedanceVideoAfterPollTimeout(db, {
        taskId: seeded.taskId, runtime, env: { VOLCENGINE_ARK_API_KEY: "test-key" }, fetchImpl, now,
      });
      assert.deepEqual(await run(new Date("2026-07-13T05:00:00.000Z")), { status: "succeeded" });
      assert.deepEqual(await run(new Date("2026-07-13T05:00:01.000Z")), { status: "already_recovered" });
      const state = await db.query<{
        task_status: string; attempt_status: string; workflow_status: string; provider_status: string;
        snapshot_status: string; credit_status: string; credit_summary_json: Record<string, unknown>;
        amount_reserved: number; amount_consumed: number; amount_released: number; assets: number; charges: number;
      }>(`SELECT t.status task_status,a.status attempt_status,w.status workflow_status,p.status provider_status,
          s.status snapshot_status,s.credit_status,s.credit_summary_json,r.amount_reserved,r.amount_consumed,r.amount_released,
          (SELECT count(*)::int FROM asset_versions WHERE source_task_id=t.id) assets,
          (SELECT count(*)::int FROM credit_ledger_entries WHERE reservation_id=r.id AND entry_type IN ('reservation','consume')) charges
        FROM tasks t JOIN workflows w ON w.id=t.workflow_id JOIN task_attempts a ON a.id=t.current_attempt_id
        JOIN provider_requests p ON p.task_id=t.id JOIN ai_generation_task_snapshots s ON s.task_id=t.id
        JOIN credit_reservations r ON r.task_id=t.id WHERE t.id=$1`, [seeded.taskId]);
      assert.equal(polls, 1);
      assert.equal(downloads, 1);
      assert.equal(uploads, 1);
      assert.deepEqual(state.rows[0], {
        task_status: "succeeded", attempt_status: "succeeded", workflow_status: "succeeded", provider_status: "succeeded",
        snapshot_status: "succeeded", credit_status: "released",
        credit_summary_json: { released: 120, consumed: 0, recoveryCharge: 0, recoveryReason: "provider_completed_after_timeout", settledAt: "2026-07-13T05:00:00.000Z" },
        amount_reserved: 0, amount_consumed: 0, amount_released: 120, assets: 1, charges: 0,
      });
    } finally {
      await db.close();
    }
  });
});

const seedanceStorageRuntime: UploadSessionRuntime = {
  mode: "cos",
  provider: "tencent_cos",
  bucket: "seedance-user-scope-test",
  region: "ap-guangzhou",
  adapter: {
    async createSignedReadUrl(input) {
      return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
    },
  },
};

async function seedRateLimitedSeedanceTask(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    suffix: string;
    userId: string;
    teamMemberId?: string;
    estimatedCredits?: number;
    status: "queued" | "running";
    providerSucceeded?: boolean;
    videoUrl?: string;
    projectless?: boolean;
  },
) {
  const projectId = `30000000-0000-4000-8000-000000000${input.suffix}`;
  const workflowId = `40000000-0000-4000-8000-000000000${input.suffix}`;
  const taskId = `50000000-0000-4000-8000-000000000${input.suffix}`;
  const attemptId = `60000000-0000-4000-8000-000000000${input.suffix}`;
  const providerRequestId = `80000000-0000-4000-8000-000000000${input.suffix}`;
  const snapshot = JSON.stringify({
    providerExecutor: "seedance",
    model: "seedance-i2v-pro",
    prompt: "user-scoped limiter test",
    targetType: input.projectless ? "standalone_video" : undefined,
    targetId: input.projectless ? taskId : undefined,
    teamMemberId: input.teamMemberId,
    cost: input.estimatedCredits,
  });

  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active') ON CONFLICT (id) DO NOTHING",
    [input.userId, `13800138${input.suffix}`],
  );
  if (!input.projectless) {
    await db.query(
      `
        INSERT INTO projects (
          id, name, aspect_ratio, resolution, phase, created_by_user_id, owner_user_id
        )
        VALUES ($1, 'Seedance limiter test', '16:9', '1080p', 'script_input', $2, $2)
      `,
      [projectId, input.userId],
    );
  }
  await db.query(
    `
      INSERT INTO workflows (
        id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id
      )
      VALUES ($1, $2, 'episode_video_generation', 'running', $3::jsonb, $4)
    `,
    [workflowId, input.projectless ? null : projectId, snapshot, input.userId],
  );
  await db.query(
    `
      INSERT INTO tasks (
        id, project_id, workflow_id, task_type, status, queue_name,
        input_snapshot_json, target_entity_type, target_entity_id
      )
      VALUES (
        $1, $2, $3, 'episode_generate_video', $4, 'generation-submit-video',
        $5::jsonb, 'episode', $1
      )
    `,
    [taskId, input.projectless ? null : projectId, workflowId, input.status, snapshot],
  );

  if (input.status === "running") {
    await db.query(
      `
        INSERT INTO task_attempts (
          id, project_id, workflow_id, task_id, attempt_number, status,
          locked_by, locked_until, heartbeat_at, started_at
        )
        VALUES ($1, $2, $3, $4, 1, 'running', 'seedance-test', $5, $6, $6)
      `,
      [
        attemptId,
        input.projectless ? null : projectId,
        workflowId,
        taskId,
        new Date("2026-07-13T01:20:00.000Z"),
        new Date("2026-07-13T01:00:00.000Z"),
      ],
    );
    await db.query(
      "UPDATE tasks SET current_attempt_id = $2, attempt_count = 1 WHERE id = $1",
      [taskId, attemptId],
    );
    await db.query(
      `
        INSERT INTO provider_requests (
          id, project_id, workflow_id, task_id, attempt_id, provider_name,
          provider_operation, request_key, request_hash, payload_ref, payload_hash,
          status, external_submission_started_at, external_request_id,
          response_redacted_json, created_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, 'volcengine', 'episode.video.generate',
          $6, $6, $6, $6, $10, $9, $7, $11::jsonb, $8
        )
      `,
      [
        providerRequestId,
        input.projectless ? null : projectId,
        workflowId,
        taskId,
        attemptId,
        `seedance-limiter-${input.suffix}`,
        `external-${input.suffix}`,
        input.userId,
        new Date("2026-07-13T01:00:00.000Z"),
        input.providerSucceeded ? "succeeded" : "submitted",
        input.providerSucceeded
          ? JSON.stringify({ status: "succeeded", videoUrl: input.videoUrl })
          : null,
      ],
    );
  }

  return {
    projectId,
    workflowId,
    taskId,
    providerRequestId,
    attemptId,
    userId: input.userId,
    teamMemberId: input.teamMemberId,
  };
}
