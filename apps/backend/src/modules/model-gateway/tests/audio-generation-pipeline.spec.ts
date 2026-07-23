import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  handleGenerationFinalizeArtifactJob,
  handleGenerationPollAudioJob,
  handleGenerationSubmitAudioJob,
} from "../generation-bullmq.worker.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import {
  __audioGenerationWorkerTestUtils,
  expireAudioGenerationPollJob,
} from "../audio-generation.worker.ts";

function baseProcessors(overrides: Record<string, unknown> = {}) {
  return {
    async submitSeedanceVideo() { return { status: "skipped" as const }; },
    async pollSeedanceVideo() { return { status: "skipped" as const }; },
    async expireSeedanceVideo() { return { status: "failed" as const, failureCode: "unused" }; },
    ...overrides,
  };
}

describe("audio generation pipeline", () => {
  it("preserves ambiguous provider submissions for manual review instead of releasing credits", () => {
    assert.equal(__audioGenerationWorkerTestUtils.shouldPreserveAudioSubmissionAsResultUnknown("result_unknown"), true);
    assert.equal(__audioGenerationWorkerTestUtils.shouldPreserveAudioSubmissionAsResultUnknown("failed"), false);
  });

  it("fails audio poll timeouts without leaving manual review state", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "70000000-0000-4000-8000-000000000301";
      const teamMemberId = "71000000-0000-4000-8000-000000000301";
      const projectId = "30000000-0000-4000-8000-000000000301";
      const workflowId = "40000000-0000-4000-8000-000000000301";
      const taskId = "50000000-0000-4000-8000-000000000301";
      const attemptId = "60000000-0000-4000-8000-000000000301";
      const providerRequestId = "62000000-0000-4000-8000-000000000301";
      const snapshot = JSON.stringify({
        kind: "audio",
        providerExecutor: "aliyun-bailian-audio",
        model: "cosyvoice-v2",
        teamMemberId,
        cost: 30,
      });
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138301', 'active')",
        [userId],
      );
      await db.query(
        `
          INSERT INTO team_members (
            id, user_id, member_account, member_account_suffix, member_login_account,
            member_name, member_password_hash, member_credits, status
          )
          VALUES ($1, $2, 'audio_timeout_member', 'audio301',
            'audio_timeout_member@audio301', 'Audio Timeout Member', 'unused-test-password-hash', 0, 'active')
        `,
        [teamMemberId, userId],
      );
      await db.query(
        `
          INSERT INTO projects (id, name, aspect_ratio, resolution, phase, created_by_user_id, owner_user_id)
          VALUES ($1, 'Audio timeout test', '16:9', '1080p', 'script_input', $2, $2)
        `,
        [projectId, userId],
      );
      await db.query(
        `
          INSERT INTO workflows (id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id)
          VALUES ($1, $2, 'episode_audio_generation', 'running', $3::jsonb, $4)
        `,
        [workflowId, projectId, snapshot, userId],
      );
      await db.query(
        `
          INSERT INTO tasks (
            id, project_id, workflow_id, task_type, status, queue_name,
            input_snapshot_json, target_entity_type, target_entity_id
          )
          VALUES ($1, $2, $3, 'episode_generate_audio', 'running', 'generation-submit-image',
            $4::jsonb, 'episode', $1)
        `,
        [taskId, projectId, workflowId, snapshot],
      );
      await db.query(
        `
          INSERT INTO task_attempts (
            id, project_id, workflow_id, task_id, attempt_number, status,
            locked_by, locked_until, heartbeat_at, started_at
          )
          VALUES ($1, $2, $3, $4, 1, 'running', 'audio-test', $5, $5, $5)
        `,
        [attemptId, projectId, workflowId, taskId, new Date("2026-07-20T00:00:00.000Z")],
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
            payload_redacted_json, status, external_submission_started_at,
            external_request_id, created_by_user_id
          )
          VALUES ($1::uuid, $2, $3, $4, $5, 'aliyun-bailian', 'audio.generate',
            $1::text, $1::text, 'audio-timeout-test', $1::text, '{}'::jsonb, 'running', $6, 'audio-external-301', $7)
        `,
        [providerRequestId, projectId, workflowId, taskId, attemptId, new Date("2026-07-20T00:00:00.000Z"), userId],
      );

      await expireAudioGenerationPollJob(db, {
        taskId,
        now: new Date("2026-07-20T01:00:00.000Z"),
      });
      await expireAudioGenerationPollJob(db, {
        taskId,
        now: new Date("2026-07-20T01:00:01.000Z"),
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
        [teamMemberId, taskId],
      );
      const state = await db.query<{
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
          JOIN provider_requests request ON request.id = $2
          WHERE task.id = $1
        `,
        [taskId, providerRequestId],
      );
      assert.equal(Number(member.rows[0]?.member_credits ?? -1), 30);
      assert.equal(Number(refunds.rows[0]?.count ?? -1), 1);
      assert.equal(Number(refunds.rows[0]?.amount ?? -1), 30);
      assert.deepEqual(state.rows[0], {
        task_status: "failed",
        attempt_status: "failed",
        provider_status: "failed",
      });
    } finally {
      await db.close();
    }
  });

  it("routes asynchronous audio submit to the dedicated audio poll queue", async () => {
    const jobs: Array<{ queue: string; name: string; data: Record<string, unknown> }> = [];
    const result = await handleGenerationSubmitAudioJob({
      job: { data: {
        taskId: "audio-task-1",
        workflowId: "audio-workflow-1",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
      } },
      config: loadGenerationQueueConfig({}),
      publisher: { async add(queue, name, data) { jobs.push({ queue, name, data }); } },
      processors: baseProcessors({
        async submitAudio() { return { status: "submitted" as const, providerStatus: "waiting" as const }; },
      }),
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    assert.deepEqual(result, { status: "submitted", queuedPoll: true });
    assert.equal(jobs[0]?.queue, "generation-poll-audio");
    assert.equal(jobs[0]?.name, "generation.audio.poll");
    assert.equal(jobs[0]?.data.mediaType, "audio");
    assert.equal(jobs[0]?.data.pollAttempt, 1);
  });

  it("continues skipped audio submit and poll results through unique delayed poll jobs", async () => {
    const jobs: Array<{
      name: string;
      data: Record<string, unknown>;
      options: Record<string, unknown>;
    }> = [];
    const publisher = {
      async add(
        _queue: string,
        name: string,
        data: Record<string, unknown>,
        options: Record<string, unknown>,
      ) {
        jobs.push({ name, data, options });
      },
    };
    const config = loadGenerationQueueConfig({});
    const submit = await handleGenerationSubmitAudioJob({
      job: { data: {
        taskId: "audio-skipped",
        workflowId: "workflow-skipped",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
      } },
      config,
      publisher,
      processors: baseProcessors({
        async submitAudio() { return { status: "skipped" as const }; },
      }),
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    const poll = await handleGenerationPollAudioJob({
      job: { data: {
        taskId: "audio-skipped",
        workflowId: "workflow-skipped",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
        pollAttempt: 1,
      } },
      config,
      publisher,
      processors: baseProcessors({
        async pollAudio() { return { status: "skipped" as const }; },
      }),
      now: new Date("2026-07-20T00:00:30.000Z"),
    });

    assert.deepEqual(submit, { status: "skipped", queuedPoll: true });
    assert.deepEqual(poll, { status: "skipped", queuedPoll: true });
    assert.deepEqual(jobs.map((job) => ({
      name: job.name,
      pollAttempt: job.data.pollAttempt,
      jobId: job.options.jobId,
      delay: job.options.delay,
    })), [
      {
        name: "generation.audio.poll",
        pollAttempt: 1,
        jobId: "generation.audio.poll__audio-skipped__1",
        delay: 30_000,
      },
      {
        name: "generation.audio.poll",
        pollAttempt: 2,
        jobId: "generation.audio.poll__audio-skipped__2",
        delay: 30_000,
      },
    ]);
  });

  it("routes synchronous and polled success to real artifact finalization", async () => {
    const jobs: Array<{ name: string; data: Record<string, unknown> }> = [];
    const publisher = { async add(_queue: string, name: string, data: Record<string, unknown>) { jobs.push({ name, data }); } };
    const config = loadGenerationQueueConfig({});
    const submit = await handleGenerationSubmitAudioJob({
      job: { data: {
        taskId: "audio-sync",
        workflowId: "workflow-sync",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
      } },
      config,
      publisher,
      processors: baseProcessors({
        async submitAudio() { return { status: "submitted" as const, providerStatus: "succeeded" as const }; },
      }),
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    assert.deepEqual(submit, { status: "submitted", queuedFinalize: true });
    assert.equal(jobs[0]?.name, "generation.audio.finalize");
    assert.equal(jobs[0]?.data.artifactKind, "audio");

    const poll = await handleGenerationPollAudioJob({
      job: { data: {
        taskId: "audio-async",
        workflowId: "workflow-async",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
        pollAttempt: 2,
      } },
      config,
      publisher,
      processors: baseProcessors({ async pollAudio() { return { status: "succeeded" as const }; } }),
      now: new Date("2026-07-20T00:00:05.000Z"),
    });
    assert.deepEqual(poll, { status: "succeeded", queuedPoll: false, queuedFinalize: true });
    assert.equal(jobs[1]?.name, "generation.audio.finalize");
  });

  it("invokes only the audio finalizer for audio artifacts", async () => {
    let calls = 0;
    const result = await handleGenerationFinalizeArtifactJob({
      job: { data: {
        taskId: "audio-finalize",
        workflowId: "workflow-finalize",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
        artifactKind: "audio",
      } },
      config: loadGenerationQueueConfig({}),
      publisher: { async add() {} },
      processors: baseProcessors({
        async finalizeAudioArtifact() { calls += 1; return { status: "succeeded" as const }; },
      }),
      now: new Date("2026-07-20T00:00:10.000Z"),
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { status: "succeeded" });
  });

  it("keeps baseline and migration model metadata aligned without unsupported controls or secrets", async () => {
    const [schema, seed, migration, correction] = await Promise.all([
      readFile("packages/db/baseline/user-centric-schema.sql", "utf8"),
      readFile("packages/db/baseline/model-reference-seed.sql", "utf8"),
      readFile("packages/db/migrations/20260720-add-aliyun-bailian-audio-model.sql", "utf8"),
      readFile("packages/db/migrations/20260720-correct-cosyvoice-v2-contract.sql", "utf8"),
    ]);
    assert.match(schema, /aliyun_bailian_audio/);
    for (const sql of [seed, migration]) {
      assert.match(sql, /'cosyvoice-v1'/);
      assert.match(sql, /'audio'/);
      assert.match(sql, /ALIYUNBAILIAN_API_KEY/);
      assert.match(sql, /generation-submit-image/);
      assert.doesNotMatch(sql, /"(?:pause|interjection|intensity|timbre|effect)"\s*:/);
      assert.doesNotMatch(sql, /Bearer\s+[A-Za-z0-9._-]+/);
    }
    assert.match(correction, /'cosyvoice-v2'/);
    assert.match(correction, /invocation_mode = 'sync'/);
    assert.match(correction, /SpeechSynthesizer/);
    assert.match(correction, /poll_queue_name = NULL/);
    assert.match(correction, /"voice":"longxiaochun_v2"/);
    assert.doesNotMatch(correction, /"(?:pause|interjection|intensity|timbre|effect)"\s*:/);
    assert.doesNotMatch(correction, /Bearer\s+[A-Za-z0-9._-]+/);
  });
});
