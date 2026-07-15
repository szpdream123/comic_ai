import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import type { AiModelConfigRecord } from "../../model-catalog/ai-model-config.store.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import {
  buildLingdongArtifactDownloadInit,
  expireSeedanceVideoPollJob,
  finalizeSeedanceVideoArtifactJob,
  processSeedanceVideoPollJob,
  processSeedanceVideoSubmitJob,
} from "../seedance-video.worker.ts";

describe("Seedance video worker user ownership", () => {
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
    assert.match(source, /t\.status IN \('queued', 'running', 'manual_review_required', 'result_unknown'\)/);
    assert.match(source, /status = 'running',[\s\S]*failure_code = NULL[\s\S]*status IN \('running', 'manual_review_required', 'result_unknown'\)/);
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

  it("keeps an ambiguous user submission running for the three-hour window without blind retry", async () => {
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

      assert.deepEqual(result, { status: "skipped" });
      assert.equal(task.rows[0]?.status, "running");
      assert.equal(task.rows[0]?.failure_code, null);
      assert.equal(
        new Date(task.rows[0]?.locked_until ?? 0).getTime(),
        new Date("2026-07-13T05:00:00.000Z").getTime(),
      );
      assert.equal(providerRequest.rows.length, 1);
      assert.equal(providerRequest.rows[0]?.status, "result_unknown");
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

      assert.deepEqual(result, { status: "skipped" });
      assert.deepEqual(task.rows[0], {
        status: "failed",
        failure_code: "provider_submission_failed",
      });
      assert.equal(providerRequest.rows[0]?.status, "failed");
    } finally {
      await db.close();
    }
  });

  it("fails a video task after the three-hour polling window", async () => {
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

      assert.deepEqual(result, { status: "failed", failureCode: "provider_poll_timeout" });
      assert.deepEqual(task.rows[0], {
        status: "failed",
        failure_code: "provider_poll_timeout",
      });
      assert.deepEqual(attempt.rows[0], {
        status: "failed",
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
            return { eTag: "seedance-user-artifact-etag" };
          },
        },
      };
      const fetchImpl = (async (url) => {
        assert.equal(String(url), artifactUrl);
        downloadAttempts += 1;
        if (downloadAttempts === 1) {
          return {
            ok: true,
            status: 200,
            body: {},
            headers: new Headers({ "content-type": "video/mp4", "content-length": "8" }),
            async arrayBuffer() {
              throw new Error("terminated");
            },
          } as Response;
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
      assert.equal(uploadedBodies.length, 1);
      assert.deepEqual(task.rows[0], { status: "succeeded", failure_code: null });
      assert.deepEqual(storageObjects.rows, [
        { status: "available", created_by_user_id: seeded.userId },
      ]);
      assert.equal(versions.rows[0]?.count, 1);
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
        status: "failed",
        failure_code: "provider_output_storage_failed",
      });
      assert.equal(snapshot.rows[0]?.status, "failed");
      assert.equal(snapshot.rows[0]?.progress_stage, "failed");
      assert.equal(snapshot.rows[0]?.provider_status_json.transferRetryAttempt, 10);
      assert.equal(snapshot.rows[0]?.failure_json.failureCode, "provider_output_storage_failed");
      assert.equal(snapshot.rows[0]?.failure_json.transferRetryAttempt, 10);
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
    status: "queued" | "running";
    providerSucceeded?: boolean;
    videoUrl?: string;
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
    teamMemberId: input.teamMemberId,
  });

  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active') ON CONFLICT (id) DO NOTHING",
    [input.userId, `13800138${input.suffix}`],
  );
  await db.query(
    `
      INSERT INTO projects (
        id, name, aspect_ratio, resolution, phase, created_by_user_id, owner_user_id
      )
      VALUES ($1, 'Seedance limiter test', '16:9', '1080p', 'script_input', $2, $2)
    `,
    [projectId, input.userId],
  );
  await db.query(
    `
      INSERT INTO workflows (
        id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id
      )
      VALUES ($1, $2, 'episode_video_generation', 'running', $3::jsonb, $4)
    `,
    [workflowId, projectId, snapshot, input.userId],
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
    [taskId, projectId, workflowId, input.status, snapshot],
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
        projectId,
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
        projectId,
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
    userId: input.userId,
    teamMemberId: input.teamMemberId,
  };
}
