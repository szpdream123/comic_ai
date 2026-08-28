import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { grantCredits, reserveCredits } from "../../credit-billing/credit-ledger.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  failGenerationTaskAfterQueueError,
  failStaleGenerationTasksBeforeProviderSubmission,
  repairExpiredGenerationSubmitLeases,
  repairQueuedGenerationTaskOutbox,
  repairRunningSeedancePollJobs,
  repairStaleGenerationQueueStageAssignments,
} from "../generation-redis-repair.service.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import { handleGptImageArtifactQueueExhaustion } from "../gpt-image-artifact-recovery.service.ts";
import {
  markGenerationQueueStagePublished,
  reserveGenerationQueueStageForPublish,
} from "../generation-queue-shard.store.ts";
import {
  markGenerationTaskSnapshotRunning,
  upsertQueuedGenerationTaskSnapshot,
} from "../generation-task-snapshot.service.ts";

describe("generation Redis dispatch repair", () => {
  it("requires durable video and audio artifacts before finalize repair", async () => {
    const queries: string[] = [];
    await repairRunningSeedancePollJobs({
      async query(sql: string) {
        queries.push(sql);
        return { rows: [] };
      },
    } as never, {
      now: new Date("2026-06-03T06:00:00.000Z"),
      limit: 10,
      config: loadGenerationQueueConfig({}),
      publisher: { async add() {} },
    });

    const finalizeCandidateQuery = queries.find((sql) => sql.includes("artifact_recovery_json"));
    assert.ok(finalizeCandidateQuery);
    assert.match(finalizeCandidateQuery, /response_redacted_json->>'videoUrl'/);
    assert.match(finalizeCandidateQuery, /response_redacted_json#>>'\{artifact,mediaType\}' = 'audio'/);
    assert.match(finalizeCandidateQuery, /response_redacted_json#>>'\{artifact,url\}'/);
    assert.match(
      finalizeCandidateQuery,
      /t\.task_type = 'episode_generate_video'[\s\S]*t\.current_attempt_id IS NOT NULL/,
    );
    assert.match(
      finalizeCandidateQuery,
      /t\.task_type = 'episode_generate_audio'[\s\S]*t\.current_attempt_id IS NOT NULL/,
    );
    assert.match(
      finalizeCandidateQuery,
      /t\.status = 'manual_review_required'[\s\S]*t\.failure_code IN \('provider_output_persist_failed', 'generation_queue_error'\)/,
    );
    assert.match(
      finalizeCandidateQuery,
      /pr\.attempt_id IS NULL AND t\.attempt_count = 1/,
    );
    assert.match(
      finalizeCandidateQuery,
      /target_asset\.id::text = COALESCE\([\s\S]*projectAssetId[\s\S]*targetId[\s\S]*target_asset\.project_id = t\.project_id/,
    );
  });

  it("does not reopen terminal video or audio storage failures", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await seedFailedApiMartAudioTask(db);
      await db.query(`
        UPDATE tasks
        SET status = 'manual_review_required',
            failure_code = 'provider_output_storage_failed',
            locked_until = NULL,
            last_dispatched_at = '2026-06-03T05:50:00.000Z'
        WHERE id IN (
          '50000000-0000-4000-8000-000000000104',
          '50000000-0000-4000-8000-000000000106'
        );
        UPDATE task_attempts
        SET status = 'manual_review_required',
            failure_code = 'provider_output_storage_failed'
        WHERE id IN (
          '51000000-0000-4000-8000-000000000104',
          '51000000-0000-4000-8000-000000000106'
        );
        UPDATE provider_requests
        SET status = 'succeeded',
            response_redacted_json = '{"videoUrl":"https://cdn.example.test/result.mp4"}'::jsonb
        WHERE id = '52000000-0000-4000-8000-000000000104';
      `);

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({}),
        publisher: { async add() {} },
      });
      const outbox = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM outbox_events
        WHERE event_type = 'generation.task.finalize_requested'
          AND payload_json->>'taskId' IN (
            '50000000-0000-4000-8000-000000000104',
            '50000000-0000-4000-8000-000000000106'
          )
      `);

      assert.equal(repaired.repairedTaskIds.includes("50000000-0000-4000-8000-000000000104"), false);
      assert.equal(repaired.repairedTaskIds.includes("50000000-0000-4000-8000-000000000106"), false);
      assert.equal(outbox.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("releases only terminal-task assignments absent from Redis live states", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await db.query(`
        UPDATE tasks
        SET status = 'failed', locked_until = NULL
        WHERE id IN (
          '50000000-0000-4000-8000-000000000101',
          '50000000-0000-4000-8000-000000000102',
          '50000000-0000-4000-8000-000000000103'
        );
        INSERT INTO generation_queue_routes (route_key, route_code)
        VALUES ('repair-route-a', 'rra'), ('repair-route-b', 'rrb');
        INSERT INTO generation_queue_shards (
          id, media_type, stage, route_key, route_code, shard_no, queue_name, admitted_count
        ) VALUES
          ('71000000-0000-4000-8000-000000000101', 'video', 'submit', 'repair-route-a', 'rra', 0, 'generation-video-submit-rra-000', 2),
          ('71000000-0000-4000-8000-000000000102', 'video', 'submit', 'repair-route-b', 'rrb', 0, 'generation-video-submit-rrb-000', 1);
        INSERT INTO generation_queue_stage_assignments (
          assignment_key, task_id, media_type, stage, route_key, shard_id, admitted_at
        ) VALUES
          ('repair:missing', '50000000-0000-4000-8000-000000000101', 'video', 'submit', 'repair-route-a', '71000000-0000-4000-8000-000000000101', '2026-06-03T05:00:00.000Z'),
          ('repair:delayed', '50000000-0000-4000-8000-000000000102', 'video', 'submit', 'repair-route-a', '71000000-0000-4000-8000-000000000101', '2026-06-03T05:00:00.000Z'),
          ('repair:redis-down', '50000000-0000-4000-8000-000000000103', 'video', 'submit', 'repair-route-b', '71000000-0000-4000-8000-000000000102', '2026-06-03T05:00:00.000Z');
      `);

      const repaired = await repairStaleGenerationQueueStageAssignments(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        inspector: {
          async listLiveAssignmentKeys(queueName) {
            if (queueName.endsWith("rrb-000")) throw new Error("redis unavailable");
            return new Set(["repair:delayed"]);
          },
        },
      });
      const assignments = await db.query<{ assignment_key: string; status: string }>(`
        SELECT assignment_key, status
        FROM generation_queue_stage_assignments
        WHERE assignment_key LIKE 'repair:%'
        ORDER BY assignment_key
      `);

      assert.deepEqual(repaired, {
        releasedAssignmentKeys: ["repair:missing"],
        liveAssignmentKeys: ["repair:delayed"],
        inspectionFailedQueueNames: ["generation-video-submit-rrb-000"],
      });
      assert.deepEqual(assignments.rows, [
        { assignment_key: "repair:delayed", status: "admitted" },
        { assignment_key: "repair:missing", status: "released" },
        { assignment_key: "repair:redis-down", status: "admitted" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("reconciles exact completed and failed BullMQ jobs for non-terminal tasks", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await db.query(`
        UPDATE tasks
        SET status = 'running', locked_until = NULL
        WHERE id IN (
          '50000000-0000-4000-8000-000000000101',
          '50000000-0000-4000-8000-000000000102',
          '50000000-0000-4000-8000-000000000103'
        );
        INSERT INTO generation_queue_routes (route_key, route_code)
        VALUES ('repair-route-exact', 'rrexact');
        INSERT INTO generation_queue_shards (
          id, media_type, stage, route_key, route_code, shard_no, queue_name, admitted_count
        ) VALUES (
          '71000000-0000-4000-8000-000000000109', 'video', 'poll', 'repair-route-exact',
          'rrexact', 0, 'generation-video-poll-rrexact-000', 4
        );
        INSERT INTO generation_queue_stage_assignments (
          assignment_key, task_id, media_type, stage, route_key, shard_id,
          status, redis_job_id, admitted_at
        ) VALUES
          ('repair:exact-live', '50000000-0000-4000-8000-000000000101', 'video', 'poll',
           'repair-route-exact', '71000000-0000-4000-8000-000000000109', 'publishing',
           'job-live', '2026-06-03T05:00:00.000Z'),
          ('repair:exact-missing', '50000000-0000-4000-8000-000000000101', 'video', 'poll',
           'repair-route-exact', '71000000-0000-4000-8000-000000000109', 'publishing',
           'job-missing', '2026-06-03T05:00:00.000Z'),
          ('repair:exact-completed', '50000000-0000-4000-8000-000000000102', 'video', 'poll',
           'repair-route-exact', '71000000-0000-4000-8000-000000000109', 'admitted',
           'job-completed', '2026-06-03T05:00:00.000Z'),
          ('repair:exact-failed', '50000000-0000-4000-8000-000000000103', 'video', 'poll',
           'repair-route-exact', '71000000-0000-4000-8000-000000000109', 'admitted',
           'job-failed', '2026-06-03T05:00:00.000Z');
      `);

      const inspectedJobIds: string[] = [];
      const repaired = await repairStaleGenerationQueueStageAssignments(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        inspector: {
          async listLiveAssignmentKeys() {
            throw new Error("legacy scan must not run for exact jobs");
          },
          async inspectJobState(_queueName, jobId) {
            inspectedJobIds.push(jobId);
            if (jobId === "job-live") return "waiting";
            if (jobId === "job-completed") return "completed";
            if (jobId === "job-missing") return "missing";
            return "failed";
          },
        },
      });
      const assignments = await db.query<{
        assignment_key: string;
        status: string;
        published_at: Date | string | null;
        release_reason: string | null;
      }>(`
        SELECT assignment_key, status, published_at, release_reason
        FROM generation_queue_stage_assignments
        WHERE assignment_key LIKE 'repair:exact-%'
        ORDER BY assignment_key
      `);
      const shard = await db.query<{ state: string }>(`
        SELECT state
        FROM generation_queue_shards
        WHERE id = '71000000-0000-4000-8000-000000000109'
      `);

      assert.deepEqual(inspectedJobIds.sort(), ["job-completed", "job-failed", "job-live", "job-missing"]);
      assert.deepEqual(repaired, {
        releasedAssignmentKeys: ["repair:exact-completed", "repair:exact-failed", "repair:exact-missing"],
        liveAssignmentKeys: ["repair:exact-live"],
        inspectionFailedQueueNames: [],
      });
      assert.deepEqual(assignments.rows.map((row) => ({
        assignmentKey: row.assignment_key,
        status: row.status,
        published: row.published_at !== null,
        releaseReason: row.release_reason,
      })), [
        { assignmentKey: "repair:exact-completed", status: "released", published: false, releaseReason: "auto_repair_redis_completed" },
        { assignmentKey: "repair:exact-failed", status: "released", published: false, releaseReason: "auto_repair_redis_failed" },
        { assignmentKey: "repair:exact-live", status: "admitted", published: true, releaseReason: null },
        { assignmentKey: "repair:exact-missing", status: "released", published: false, releaseReason: "auto_repair_redis_missing" },
      ]);
      assert.equal(shard.rows[0]?.state, "draining");
    } finally {
      await db.close();
    }
  });

  it("advances past a full batch of live assignments on the next repair cycle", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await db.query(`
        UPDATE tasks
        SET status = 'failed', locked_until = NULL
        WHERE id IN (
          '50000000-0000-4000-8000-000000000101',
          '50000000-0000-4000-8000-000000000102',
          '50000000-0000-4000-8000-000000000103'
        );
        INSERT INTO generation_queue_routes (route_key, route_code)
        VALUES ('repair-route-c', 'rrc');
        INSERT INTO generation_queue_shards (
          id, media_type, stage, route_key, route_code, shard_no, queue_name, admitted_count
        ) VALUES (
          '71000000-0000-4000-8000-000000000103', 'video', 'submit', 'repair-route-c', 'rrc', 0,
          'generation-video-submit-rrc-000', 3
        );
        INSERT INTO generation_queue_stage_assignments (
          assignment_key, task_id, media_type, stage, route_key, shard_id, admitted_at
        ) VALUES
          ('repair:live-a', '50000000-0000-4000-8000-000000000101', 'video', 'submit', 'repair-route-c', '71000000-0000-4000-8000-000000000103', '2026-06-03T05:00:00.000Z'),
          ('repair:live-b', '50000000-0000-4000-8000-000000000102', 'video', 'submit', 'repair-route-c', '71000000-0000-4000-8000-000000000103', '2026-06-03T05:00:00.000Z'),
          ('repair:missing-c', '50000000-0000-4000-8000-000000000103', 'video', 'submit', 'repair-route-c', '71000000-0000-4000-8000-000000000103', '2026-06-03T05:00:00.000Z');
      `);

      const inspector = {
        async listLiveAssignmentKeys() {
          return new Set(["repair:live-a", "repair:live-b"]);
        },
      };
      const first = await repairStaleGenerationQueueStageAssignments(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 2,
        inspector,
      });
      const second = await repairStaleGenerationQueueStageAssignments(db, {
        now: new Date("2026-06-03T06:00:01.000Z"),
        limit: 2,
        inspector,
      });

      assert.deepEqual(first.releasedAssignmentKeys, []);
      assert.deepEqual(first.liveAssignmentKeys, ["repair:live-a", "repair:live-b"]);
      assert.deepEqual(second.releasedAssignmentKeys, ["repair:missing-c"]);
    } finally {
      await db.close();
    }
  });

  it("recreates generation outbox events for stale queued Seedance video tasks", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      const first = await repairQueuedGenerationTaskOutbox(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
      });
      const second = await repairQueuedGenerationTaskOutbox(db, {
        now: new Date("2026-06-03T06:00:30.000Z"),
        limit: 10,
      });
      const outbox = await db.query<{
        user_id: string;
        event_type: string;
        payload_json: Record<string, unknown>;
      }>(
        `
          SELECT user_id, event_type, payload_json
          FROM outbox_events
          WHERE event_type = 'generation.task.created'
          ORDER BY created_at ASC
        `,
      );
      const repairedTask = await db.query<{ last_dispatched_at: Date | string | null }>(
        "SELECT last_dispatched_at FROM tasks WHERE id = '50000000-0000-4000-8000-000000000101'",
      );

      assert.deepEqual(first.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000101",
      ]);
      assert.deepEqual(second.repairedTaskIds, []);
      assert.equal(outbox.rows.length, 1);
      assert.equal(outbox.rows[0]?.user_id, "00000000-0000-4000-8000-000000000101");
      assert.equal(outbox.rows[0]?.event_type, "generation.task.created");
      assert.match(String(outbox.rows[0]?.payload_json.dispatchToken ?? ""), /^redis-repair-[0-9a-f-]{36}$/i);
      const { dispatchToken: _dispatchToken, ...repairPayload } = outbox.rows[0]?.payload_json ?? {};
      assert.deepEqual(repairPayload, {
        workflowId: "40000000-0000-4000-8000-000000000101",
        taskId: "50000000-0000-4000-8000-000000000101",
        mediaType: "video",
        modelCode: "seedance-i2v-pro",
        queueName: "generation-submit-video",
        targetType: "episode",
        targetId: "60000000-0000-4000-8000-000000000101",
        providerExecutor: "seedance",
      });
      assert.equal(
        new Date(repairedTask.rows[0]?.last_dispatched_at ?? 0).toISOString(),
        "2026-06-03T06:00:00.000Z",
      );
    } finally {
      await db.close();
    }
  });

  it("does not duplicate an active task event when the original event has no user id", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await db.query(`
        INSERT INTO outbox_events (
          id, event_type, payload_json, generation_stage, status,
          available_at, dedupe_key, created_at, updated_at, user_id
        ) VALUES (
          '90000000-0000-4000-8000-000000000101',
          'generation.task.created',
          '{"taskId":"50000000-0000-4000-8000-000000000101"}'::jsonb,
          'submit', 'processing',
          '2026-06-03T05:59:00.000Z',
          'generation.task.created:50000000-0000-4000-8000-000000000101',
          '2026-06-03T05:59:00.000Z', '2026-06-03T05:59:00.000Z', NULL
        )
      `);

      const repaired = await repairQueuedGenerationTaskOutbox(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
      });
      const outbox = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM outbox_events
        WHERE event_type = 'generation.task.created'
          AND payload_json->>'taskId' = '50000000-0000-4000-8000-000000000101'
      `);

      assert.deepEqual(repaired.repairedTaskIds, []);
      assert.equal(outbox.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("does not recreate a processed task event while its submit assignment is active", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await db.query(`
        INSERT INTO outbox_events (
          id, event_type, payload_json, generation_stage, status,
          available_at, processed_at, dedupe_key, created_at, updated_at, user_id
        ) VALUES (
          '90000000-0000-4000-8000-000000000102',
          'generation.task.created',
          '{"taskId":"50000000-0000-4000-8000-000000000101"}'::jsonb,
          'submit', 'processed',
          '2026-06-03T05:55:00.000Z', '2026-06-03T05:56:00.000Z',
          'generation.task.created:50000000-0000-4000-8000-000000000101',
          '2026-06-03T05:55:00.000Z', '2026-06-03T05:56:00.000Z',
          '00000000-0000-4000-8000-000000000101'
        );
        INSERT INTO generation_queue_routes (route_key, route_code)
        VALUES ('repair-submit-active', 'rsa');
        INSERT INTO generation_queue_shards (
          id, media_type, stage, route_key, route_code, shard_no, queue_name, admitted_count
        ) VALUES (
          '71000000-0000-4000-8000-000000000111', 'video', 'submit',
          'repair-submit-active', 'rsa', 0, 'generation-video-submit-rsa-000', 1
        );
        INSERT INTO generation_queue_stage_assignments (
          assignment_key, task_id, media_type, stage, route_key, shard_id, status, admitted_at
        ) VALUES (
          'repair:processed-event-active-submit',
          '50000000-0000-4000-8000-000000000101',
          'video', 'submit', 'repair-submit-active',
          '71000000-0000-4000-8000-000000000111', 'admitted',
          '2026-06-03T05:56:00.000Z'
        )
      `);

      const repaired = await repairQueuedGenerationTaskOutbox(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
      });
      const outbox = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM outbox_events
        WHERE event_type = 'generation.task.created'
          AND payload_json->>'taskId' = '50000000-0000-4000-8000-000000000101'
      `);

      assert.deepEqual(repaired.repairedTaskIds, []);
      assert.equal(outbox.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("fails expired GPT Image submit leases without requeueing", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      const reserved = await seedGenerationTaskReservationAndSnapshot(db);
      const repaired = await repairExpiredGenerationSubmitLeases(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
      });
      const task = await db.query<{
        status: string;
        current_attempt_id: string | null;
        locked_until: Date | string | null;
      }>(
        `
          SELECT status, current_attempt_id, locked_until
          FROM tasks
          WHERE id = '50000000-0000-4000-8000-000000000105'
        `,
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        `
          SELECT status, failure_code
          FROM task_attempts
          WHERE id = '51000000-0000-4000-8000-000000000105'
        `,
      );
      const outbox = await db.query<{
        user_id: string;
        event_type: string;
        payload_json: Record<string, unknown>;
      }>(
        `
          SELECT user_id, event_type, payload_json
          FROM outbox_events
          WHERE event_type = 'generation.task.created'
          ORDER BY created_at ASC
        `,
      );
      const reservation = await db.query<{
        status: string;
        amount_reserved: number;
        amount_released: number;
      }>(
        "SELECT status, amount_reserved, amount_released FROM credit_reservations WHERE id = $1",
        [reserved.reservation.id],
      );
      const snapshot = await db.query<{
        status: string;
        credit_status: string;
        failure_json: Record<string, unknown>;
      }>(
        "SELECT status, credit_status, failure_json FROM ai_generation_task_snapshots WHERE task_id = '50000000-0000-4000-8000-000000000105'",
      );
      const user = await db.query<{
        credit_balance_cached: number;
        credit_reserved_cached: number;
      }>(
        "SELECT credit_balance_cached, credit_reserved_cached FROM users WHERE id = '00000000-0000-4000-8000-000000000101'",
      );

      assert.deepEqual(repaired.requeuedTaskIds, []);
      assert.deepEqual(repaired.resultUnknownTaskIds, []);
      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000105",
      ]);
      assert.equal(task.rows[0]?.status, "failed");
      assert.equal(task.rows[0]?.locked_until, null);
      assert.equal(attempt.rows[0]?.status, "failed");
      assert.equal(attempt.rows[0]?.failure_code, "generation_queue_lease_expired");
      assert.equal(outbox.rows.length, 0);
      assert.deepEqual(reservation.rows[0], {
        status: "released",
        amount_reserved: 0,
        amount_released: 200,
      });
      assert.equal(snapshot.rows[0]?.status, "failed");
      assert.equal(snapshot.rows[0]?.credit_status, "released");
      assert.equal(snapshot.rows[0]?.failure_json.failureCode, "generation_queue_lease_expired");
      assert.deepEqual(user.rows[0], {
        credit_balance_cached: 200,
        credit_reserved_cached: 0,
      });
    } finally {
      await db.close();
    }
  });

  it("refunds a team member queue failure exactly once", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      const teamMemberId = "71000000-0000-4000-8000-000000000105";
      await db.query(
        `
          INSERT INTO team_members (
            id, user_id, member_account, member_account_suffix, member_login_account,
            member_name, member_password_hash, member_credits, status
          )
          VALUES ($1, '00000000-0000-4000-8000-000000000101', 'queue_refund_member',
            'queue105', 'queue_refund_member@queue105', 'Queue Refund Member',
            'unused-test-password-hash', 0, 'active')
        `,
        [teamMemberId],
      );
      await db.query(
        `
          UPDATE tasks
          SET input_snapshot_json = input_snapshot_json || $2::jsonb
          WHERE id = $1
        `,
        [
          "50000000-0000-4000-8000-000000000105",
          JSON.stringify({ teamMemberId, cost: 200 }),
        ],
      );

      const first = await failGenerationTaskAfterQueueError(db, {
        taskId: "50000000-0000-4000-8000-000000000105",
        failureCode: "generation_queue_error",
        displayMessage: "生成队列异常，积分已返还。",
        now: new Date("2026-06-03T06:00:00.000Z"),
      });
      const second = await failGenerationTaskAfterQueueError(db, {
        taskId: "50000000-0000-4000-8000-000000000105",
        failureCode: "generation_queue_error",
        displayMessage: "生成队列异常，积分已返还。",
        now: new Date("2026-06-03T06:00:01.000Z"),
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
            AND source_id = '50000000-0000-4000-8000-000000000105'
        `,
        [teamMemberId],
      );

      assert.equal(first, true);
      assert.equal(second, false);
      assert.equal(Number(member.rows[0]?.member_credits ?? -1), 200);
      assert.equal(Number(refunds.rows[0]?.count ?? -1), 1);
      assert.equal(Number(refunds.rows[0]?.amount ?? -1), 200);
    } finally {
      await db.close();
    }
  });

  it("keeps a queue failure in manual review when its credits require manual settlement", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      await seedGenerationTaskReservationAndSnapshot(db);

      assert.equal(await failGenerationTaskAfterQueueError(db, {
        taskId: "50000000-0000-4000-8000-000000000105",
        failureCode: "generation_queue_error",
        displayMessage: "生成队列异常，结果可能已经存在。",
        creditOutcome: "manual_review_required",
        now: new Date("2026-08-01T08:00:49.000Z"),
      }), true);

      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = '50000000-0000-4000-8000-000000000105'",
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE id = '51000000-0000-4000-8000-000000000105'",
      );
      const snapshot = await db.query<{ status: string; credit_status: string }>(
        "SELECT status, credit_status FROM ai_generation_task_snapshots WHERE task_id = '50000000-0000-4000-8000-000000000105'",
      );
      assert.deepEqual(task.rows[0], {
        status: "manual_review_required",
        failure_code: "generation_queue_error",
      });
      assert.deepEqual(attempt.rows[0], {
        status: "manual_review_required",
        failure_code: "generation_queue_error",
      });
      assert.deepEqual(snapshot.rows[0], {
        status: "manual_review_required",
        credit_status: "manual_review_required",
      });
    } finally {
      await db.close();
    }
  });

  it("does not settle a queue failure after the provider has accepted the request", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      const reserved = await seedSeedanceTaskReservationAndSnapshot(db);

      const marked = await failGenerationTaskAfterQueueError(db, {
        taskId: "50000000-0000-4000-8000-000000000104",
        failureCode: "generation_queue_error",
        displayMessage: "生成队列自动重试已耗尽，任务结果仍可能存在。",
        creditOutcome: "manual_review_required",
        requireProviderSubmissionNotStarted: true,
        now: new Date("2026-08-01T08:00:49.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = '50000000-0000-4000-8000-000000000104'",
      );
      const reservation = await db.query<{ status: string }>(
        "SELECT status FROM credit_reservations WHERE id = $1",
        [reserved.reservation.id],
      );

      assert.equal(marked, false);
      assert.deepEqual(task.rows[0], { status: "running", failure_code: null });
      assert.equal(reservation.rows[0]?.status, "active");
    } finally {
      await db.close();
    }
  });

  it("does not fail an exhausted stage when a durable downstream assignment already exists", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      const source = await reserveGenerationQueueStageForPublish(db, {
        assignmentKey: "generation.worker:submit:queue-timeout-source",
        taskId: "50000000-0000-4000-8000-000000000105",
        mediaType: "image",
        stage: "submit",
        routeKey: "queue-timeout-route",
        redisJobId: "queue-timeout-source",
        now: new Date("2026-08-01T08:00:00.000Z"),
      });
      const successor = await reserveGenerationQueueStageForPublish(db, {
        assignmentKey: "generation.worker:fetch:queue-timeout-successor",
        taskId: "50000000-0000-4000-8000-000000000105",
        mediaType: "image",
        stage: "fetch",
        routeKey: "queue-timeout-route",
        redisJobId: "queue-timeout-successor",
        now: new Date("2026-08-01T08:00:01.000Z"),
      });
      await markGenerationQueueStagePublished(db, {
        assignmentKey: successor.assignmentKey,
        redisJobId: successor.redisJobId!,
        now: new Date("2026-08-01T08:00:01.500Z"),
      });

      assert.equal(await failGenerationTaskAfterQueueError(db, {
        taskId: "50000000-0000-4000-8000-000000000105",
        sourceAssignmentKey: source.assignmentKey,
        failureCode: "generation_queue_error",
        displayMessage: "生成队列异常，结果可能已经存在。",
        creditOutcome: "manual_review_required",
        now: new Date("2026-08-01T08:00:02.000Z"),
      }), false);

      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = '50000000-0000-4000-8000-000000000105'",
      );
      assert.deepEqual(task.rows[0], { status: "running", failure_code: null });
    } finally {
      await db.close();
    }
  });

  it("resumes polling instead of failing an accepted video after its submit lease expires", async () => {
    const db = await createMigratedTestDb();
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      const reserved = await seedSeedanceTaskReservationAndSnapshot(db);

      const leaseRepair = await repairExpiredGenerationSubmitLeases(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
      });
      const pollRepair = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });
      const task = await db.query<{
        status: string;
        failure_code: string | null;
        locked_until: Date | string | null;
      }>(
        "SELECT status, failure_code, locked_until FROM tasks WHERE id = '50000000-0000-4000-8000-000000000104'",
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE id = '51000000-0000-4000-8000-000000000104'",
      );
      const provider = await db.query<{ status: string; external_request_id: string | null }>(
        "SELECT status, external_request_id FROM provider_requests WHERE id = '52000000-0000-4000-8000-000000000104'",
      );
      const reservation = await db.query<{
        status: string;
        amount_reserved: number;
        amount_released: number;
      }>(
        "SELECT status, amount_reserved, amount_released FROM credit_reservations WHERE id = $1",
        [reserved.reservation.id],
      );

      assert.deepEqual(leaseRepair.requeuedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.deepEqual(leaseRepair.resultUnknownTaskIds, []);
      assert.deepEqual(leaseRepair.repairedTaskIds, []);
      assert.deepEqual(pollRepair.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.equal(added.length, 1);
      assert.equal(added[0]?.name, "generation.video.poll.repair");
      assert.equal(task.rows[0]?.status, "running");
      assert.equal(task.rows[0]?.failure_code, null);
      assert.equal(task.rows[0]?.locked_until, null);
      assert.equal(attempt.rows[0]?.status, "running");
      assert.equal(attempt.rows[0]?.failure_code, null);
      assert.deepEqual(provider.rows[0], {
        status: "accepted",
        external_request_id: "seedance-external-104",
      });
      assert.deepEqual(reservation.rows[0], {
        status: "active",
        amount_reserved: 120,
        amount_released: 0,
      });
    } finally {
      await db.close();
    }
  });

  it("resumes polling for a provider-accepted task after a queue failure enters manual review", async () => {
    const db = await createMigratedTestDb();
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await seedSeedanceTaskReservationAndSnapshot(db);
      const now = new Date("2026-06-03T06:00:00.000Z");

      const marked = await failGenerationTaskAfterQueueError(db, {
        taskId: "50000000-0000-4000-8000-000000000104",
        failureCode: "generation_queue_error",
        displayMessage: "生成队列自动重试已耗尽，任务结果仍可能存在，已保留积分并转人工核对。",
        creditOutcome: "manual_review_required",
        now,
      });
      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:03:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = '50000000-0000-4000-8000-000000000104'",
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE id = '51000000-0000-4000-8000-000000000104'",
      );

      assert.equal(marked, true);
      assert.deepEqual(repaired.repairedTaskIds, ["50000000-0000-4000-8000-000000000104"]);
      assert.equal(added.length, 1);
      assert.equal(added[0]?.name, "generation.video.poll.repair");
      assert.equal(task.rows[0]?.status, "running");
      assert.equal(task.rows[0]?.failure_code, null);
      assert.equal(attempt.rows[0]?.status, "running");
      assert.equal(attempt.rows[0]?.failure_code, null);
    } finally {
      await db.close();
    }
  });

  it("keeps credits reserved when an expired submit lease started externally without a poll id", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      const reserved = await seedSeedanceTaskReservationAndSnapshot(db);
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'submitted',
              external_request_id = NULL
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairExpiredGenerationSubmitLeases(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = '50000000-0000-4000-8000-000000000104'",
      );
      const provider = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE id = '52000000-0000-4000-8000-000000000104'",
      );
      const reservation = await db.query<{
        status: string;
        amount_reserved: number;
        amount_released: number;
      }>(
        "SELECT status, amount_reserved, amount_released FROM credit_reservations WHERE id = $1",
        [reserved.reservation.id],
      );
      const snapshot = await db.query<{ status: string; credit_status: string }>(
        "SELECT status, credit_status FROM ai_generation_task_snapshots WHERE task_id = '50000000-0000-4000-8000-000000000104'",
      );

      assert.deepEqual(repaired.requeuedTaskIds, []);
      assert.deepEqual(repaired.resultUnknownTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.deepEqual(repaired.repairedTaskIds, []);
      assert.deepEqual(task.rows[0], {
        status: "result_unknown",
        failure_code: "lease_expired_after_external_start",
      });
      assert.deepEqual(provider.rows[0], {
        status: "result_unknown",
        failure_code: "lease_expired_after_external_start",
      });
      assert.deepEqual(reservation.rows[0], {
        status: "active",
        amount_reserved: 120,
        amount_released: 0,
      });
      assert.deepEqual(snapshot.rows[0], {
        status: "result_unknown",
        credit_status: "manual_review_required",
      });
    } finally {
      await db.close();
    }
  });

  it("requeues poll jobs for stale running Seedance video tasks with external request ids", async () => {
    const db = await createMigratedTestDb();
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(`
        UPDATE tasks
        SET attempt_count = 1
        WHERE id = '50000000-0000-4000-8000-000000000104';
        UPDATE provider_requests
        SET attempt_id = NULL
        WHERE id = '52000000-0000-4000-8000-000000000104';
      `);
      const first = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
          GENERATION_POLL_RETRY_ATTEMPTS: "3",
          GENERATION_POLL_RETRY_BACKOFF_MS: "5000",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });
      const second = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:30.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });

      assert.deepEqual(first.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.deepEqual(second.repairedTaskIds, []);
      assert.equal(added.length, 1);
      assert.deepEqual(added[0], {
        queueName: "generation-poll-video",
        name: "generation.video.poll.repair",
        data: {
          taskId: "50000000-0000-4000-8000-000000000104",
          attemptId: "51000000-0000-4000-8000-000000000104",
          workflowId: "40000000-0000-4000-8000-000000000104",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          pollAttempt: 1,
        },
        options: {
          jobId: "generation.video.poll__50000000-0000-4000-8000-000000000104__51000000-0000-4000-8000-000000000104__1__repair__1780466400000",
          delay: 0,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: { age: 86400, count: 10000 },
          removeOnFail: { age: 604800, count: 50000 },
        },
      });
    } finally {
      await db.close();
    }
  });

  it("routes repaired Seedance poll jobs through a sanitized dynamic shard assignment", async () => {
    const db = await createMigratedTestDb();
    const assignments: Array<Record<string, unknown>> = [];
    const published: Array<Record<string, unknown>> = [];
    const added: Array<{ queueName: string; name: string; data: Record<string, unknown> }> = [];
    const secret = "repair-route-secret-must-not-leak";

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        "UPDATE provider_requests SET poll_sequence = 3 WHERE id = '52000000-0000-4000-8000-000000000104'",
      );
      await db.query(
        `
          UPDATE tasks
          SET input_snapshot_json = input_snapshot_json || $2::jsonb
          WHERE id = $1
        `,
        [
          "50000000-0000-4000-8000-000000000104",
          JSON.stringify({
            modelConfigSnapshot: {
              version: 1,
              config: {
                id: "seedance-config-repair",
                modelCode: "seedance-i2v-pro",
                providerName: "volcengine",
                providerModel: "seedance-i2v-pro",
                providerProtocol: "http",
                invocationMode: "async",
                providerConfig: {
                  endpoint: "https://provider.example.test/v1/video",
                  apiKey: secret,
                },
              },
            },
          }),
        ],
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_QUEUE_SHARDING_ENABLED: "true",
        }),
        shardStore: {
          async reserve(_database, assignment) {
            assignments.push(assignment);
            return {
              assignmentKey: "generation.repair.poll:50000000-0000-4000-8000-000000000104:51000000-0000-4000-8000-000000000104:1780466400000",
              queueName: "generation-video-poll-rrepair-001",
            };
          },
          async markPublished(_database, input) {
            published.push(input);
          },
        },
        publisher: {
          async add(queueName, name, data) {
            added.push({ queueName, name, data });
          },
        },
      });

      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.equal(assignments.length, 1);
      assert.equal(assignments[0]?.mediaType, "video");
      assert.equal(assignments[0]?.stage, "poll");
      assert.equal(
        assignments[0]?.redisJobId,
        "generation.video.poll__50000000-0000-4000-8000-000000000104__51000000-0000-4000-8000-000000000104__3__repair__1780466400000",
      );
      assert.equal(
        assignments[0]?.assignmentKey,
          "generation.repair.poll:50000000-0000-4000-8000-000000000104:51000000-0000-4000-8000-000000000104:1780466400000",
      );
      const routeKey = String(assignments[0]?.routeKey ?? "");
      assert.match(routeKey, /^seedance:seedance-i2v-pro:v1\./);
      assert.match(routeKey, /volcengine/);
      assert.equal(routeKey.includes(secret), false);
      assert.equal(JSON.stringify(added).includes(secret), false);
      assert.deepEqual(published, [{
        assignmentKey: "generation.repair.poll:50000000-0000-4000-8000-000000000104:51000000-0000-4000-8000-000000000104:1780466400000",
        redisJobId: "generation.video.poll__50000000-0000-4000-8000-000000000104__51000000-0000-4000-8000-000000000104__3__repair__1780466400000",
        now: new Date("2026-06-03T06:00:00.000Z"),
      }]);
      assert.deepEqual(added, [{
        queueName: "generation-video-poll-rrepair-001",
        name: "generation.video.poll.repair",
        data: {
          taskId: "50000000-0000-4000-8000-000000000104",
          attemptId: "51000000-0000-4000-8000-000000000104",
          workflowId: "40000000-0000-4000-8000-000000000104",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          pollAttempt: 3,
          queueAssignmentKey: "generation.repair.poll:50000000-0000-4000-8000-000000000104:51000000-0000-4000-8000-000000000104:1780466400000",
        },
      }]);
    } finally {
      await db.close();
    }
  });

  it("preserves an uncertain poll assignment without publishing a duplicate repair", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);

      await assert.rejects(
        repairRunningSeedancePollJobs(db, {
          now: new Date("2026-06-03T06:00:00.000Z"),
          limit: 10,
          staleDispatchMs: 1,
          config: loadGenerationQueueConfig({
            GENERATION_QUEUE_SHARDING_ENABLED: "true",
          }),
          shardStore: {
            reserve: (database, assignment) => reserveGenerationQueueStageForPublish(database, assignment),
            markPublished: (database, assignment) => markGenerationQueueStagePublished(database, assignment),
          },
          publisher: {
            async add() {
              throw new Error("redis unavailable");
            },
          },
        }),
        /redis unavailable/,
      );
      const duplicateRepair = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:01:00.000Z"),
        limit: 10,
        staleDispatchMs: 1,
        config: loadGenerationQueueConfig({
          GENERATION_QUEUE_SHARDING_ENABLED: "true",
        }),
        shardStore: {
          reserve: (database, assignment) => reserveGenerationQueueStageForPublish(database, assignment),
          markPublished: (database, assignment) => markGenerationQueueStagePublished(database, assignment),
        },
        publisher: {
          async add() {
            throw new Error("redis unavailable");
          },
        },
      });

      const assignment = await db.query<{
        status: string;
        redis_job_id: string | null;
        release_reason: string | null;
      }>(`
        SELECT status, redis_job_id, release_reason
        FROM generation_queue_stage_assignments
        WHERE assignment_key = 'generation.repair.poll:50000000-0000-4000-8000-000000000104:51000000-0000-4000-8000-000000000104:1780466400000'
      `);
      const shard = await db.query<{ admitted_count: number }>(`
        SELECT admitted_count
        FROM generation_queue_shards
        WHERE id = (
          SELECT shard_id
          FROM generation_queue_stage_assignments
          WHERE assignment_key = 'generation.repair.poll:50000000-0000-4000-8000-000000000104:51000000-0000-4000-8000-000000000104:1780466400000'
        )
      `);

      assert.deepEqual(assignment.rows, [{
        status: "publishing",
        redis_job_id: "generation.video.poll__50000000-0000-4000-8000-000000000104__51000000-0000-4000-8000-000000000104__1__repair__1780466400000",
        release_reason: null,
      }]);
      assert.equal(shard.rows[0]?.admitted_count, 1);
      const activeAssignments = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM generation_queue_stage_assignments
        WHERE task_id = '50000000-0000-4000-8000-000000000104'
          AND redis_job_id = 'generation.video.poll__50000000-0000-4000-8000-000000000104__51000000-0000-4000-8000-000000000104__1__repair__1780466400000'
          AND status IN ('publishing', 'admitted')
      `);
      assert.equal(activeAssignments.rows[0]?.count, 1);
      assert.deepEqual(duplicateRepair.repairedTaskIds, []);
    } finally {
      await db.close();
    }
  });

  it("recreates finalize outbox events after artifact-not-ready queue exhaustion", async () => {
    const db = await createMigratedTestDb();
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'manual_review_required',
              failure_code = 'generation_queue_error',
              attempt_count = 1,
              locked_until = NULL,
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              attempt_id = NULL,
              response_redacted_json = '{"videoUrl":"https://cdn.example.test/result.mp4"}'::jsonb
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });
      const outbox = await db.query<{
        event_type: string;
        payload_json: Record<string, unknown>;
      }>(
        `
          SELECT event_type, payload_json
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
          ORDER BY created_at ASC
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.equal(added.length, 0);
      assert.equal(outbox.rows.length, 1);
      assert.deepEqual(outbox.rows[0]?.payload_json, {
        workflowId: "40000000-0000-4000-8000-000000000104",
        taskId: "50000000-0000-4000-8000-000000000104",
        attemptId: "51000000-0000-4000-8000-000000000104",
        mediaType: "video",
        modelCode: "seedance-i2v-pro",
        providerExecutor: "seedance",
        artifactKind: "video",
        storageBucket: null,
        finalizeMode: "retry_finalize",
        artifactStage: "fetch",
      });
    } finally {
      await db.close();
    }
  });

  it("does not let a stale worker fail a newer durable attempt", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);

      const marked = await failGenerationTaskAfterQueueError(db, {
        taskId: "50000000-0000-4000-8000-000000000105",
        expectedAttemptId: "61000000-0000-4000-8000-000000000105",
        failureCode: "generation_queue_error",
        displayMessage: "stale worker failure",
        now: new Date("2026-06-03T06:00:00.000Z"),
      });
      const task = await db.query<{ status: string; current_attempt_id: string | null }>(
        `
          SELECT status, current_attempt_id
          FROM tasks
          WHERE id = '50000000-0000-4000-8000-000000000105'
        `,
      );

      assert.equal(marked, false);
      assert.deepEqual(task.rows[0], {
        status: "running",
        current_attempt_id: "51000000-0000-4000-8000-000000000105",
      });
    } finally {
      await db.close();
    }
  });

  it("does not fail a new video attempt after the stale pre-submit scan", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(`
        UPDATE provider_requests
        SET status = 'created', external_submission_started_at = NULL,
            external_request_id = NULL
        WHERE id = '52000000-0000-4000-8000-000000000104';
        UPDATE tasks
        SET updated_at = '2026-06-03T05:40:00.000Z'
        WHERE id = '50000000-0000-4000-8000-000000000104';
      `);
      let switchedAttempt = false;
      const racingDb = {
        async query(sql: string, params?: unknown[]) {
          const result = await db.query(sql, params);
          if (!switchedAttempt && sql.includes("SELECT t.id, t.current_attempt_id")) {
            switchedAttempt = true;
            await db.query(`
              UPDATE task_attempts
              SET status = 'failed', failure_code = 'test_rollover',
                  finished_at = '2026-06-03T05:55:00.000Z'
              WHERE id = '51000000-0000-4000-8000-000000000104';
              INSERT INTO task_attempts (
                id, project_id, workflow_id, task_id, attempt_number, status, started_at
              ) VALUES (
                '61000000-0000-4000-8000-000000000104',
                '30000000-0000-4000-8000-000000000101',
                '40000000-0000-4000-8000-000000000104',
                '50000000-0000-4000-8000-000000000104', 2, 'running',
                '2026-06-03T05:59:00.000Z'
              );
              UPDATE tasks
              SET current_attempt_id = '61000000-0000-4000-8000-000000000104',
                  attempt_count = 2,
                  updated_at = '2026-06-03T05:59:00.000Z'
              WHERE id = '50000000-0000-4000-8000-000000000104';
            `);
          }
          return result;
        },
      };

      const repaired = await failStaleGenerationTasksBeforeProviderSubmission(
        racingDb as never,
        {
          now: new Date("2026-06-03T06:00:00.000Z"),
          timeoutMs: 5 * 60_000,
          limit: 10,
        },
      );
      const state = await db.query<{
        status: string;
        failure_code: string | null;
        current_attempt_id: string | null;
      }>(
        `
          SELECT status, failure_code, current_attempt_id
          FROM tasks
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );

      assert.equal(switchedAttempt, true);
      assert.deepEqual(repaired.failedTaskIds, []);
      assert.deepEqual(state.rows[0], {
        status: "running",
        failure_code: null,
        current_attempt_id: "61000000-0000-4000-8000-000000000104",
      });
    } finally {
      await db.close();
    }
  });

  it("does not loop finalize recovery while a succeeded video artifact is still missing", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'manual_review_required',
              failure_code = 'generation_queue_error',
              locked_until = NULL,
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              response_redacted_json = '{}'::jsonb
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({}),
        publisher: { async add() {} },
      });
      const outbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, []);
      assert.equal(outbox.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("does not loop video finalize recovery without a durable current attempt", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'manual_review_required',
              failure_code = 'generation_queue_error',
              current_attempt_id = NULL,
              locked_until = NULL,
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              attempt_id = NULL,
              response_redacted_json = '{"videoUrl":"https://cdn.example.test/result.mp4"}'::jsonb
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({}),
        publisher: { async add() {} },
      });
      const outbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, []);
      assert.equal(outbox.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("does not duplicate a queued task with an active submit assignment", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await db.query(`
        INSERT INTO generation_queue_routes (route_key, route_code)
        VALUES ('repair-active-route', 'rar');
        INSERT INTO generation_queue_shards (
          id, media_type, stage, route_key, route_code, shard_no, queue_name, admitted_count
        ) VALUES (
          '71000000-0000-4000-8000-000000000104', 'video', 'submit', 'repair-active-route', 'rar', 0,
          'generation-video-submit-rar-000', 1
        );
        INSERT INTO generation_queue_stage_assignments (
          assignment_key, task_id, media_type, stage, route_key, shard_id, status, admitted_at
        ) VALUES (
          'repair:active-submit', '50000000-0000-4000-8000-000000000101', 'video', 'submit',
          'repair-active-route', '71000000-0000-4000-8000-000000000104', 'admitted', '2026-06-03T05:59:00.000Z'
        );
      `);

      const repaired = await repairQueuedGenerationTaskOutbox(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
      });

      assert.deepEqual(repaired.repairedTaskIds, []);
    } finally {
      await db.close();
    }
  });

  it("does not duplicate a running task with an active poll assignment", async () => {
    const db = await createMigratedTestDb();
    let publishedRepairs = 0;
    let activeAssignmentInsertedDuringClaim = false;

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(`
        INSERT INTO generation_queue_routes (route_key, route_code)
        VALUES ('repair-active-poll-route', 'rap');
        INSERT INTO generation_queue_shards (
          id, media_type, stage, route_key, route_code, shard_no, queue_name, admitted_count
        ) VALUES (
          '71000000-0000-4000-8000-000000000105', 'video', 'poll', 'repair-active-poll-route', 'rap', 0,
          'generation-video-poll-rap-000', 1
        );
      `);
      const racingDb = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          if (!activeAssignmentInsertedDuringClaim && sql.includes("WITH manual_recovery AS")) {
            activeAssignmentInsertedDuringClaim = true;
            await db.query(`
              INSERT INTO generation_queue_stage_assignments (
                assignment_key, task_id, media_type, stage, route_key, shard_id, status, admitted_at,
                redis_job_id, published_at
              ) VALUES (
                'repair:active-poll', '50000000-0000-4000-8000-000000000104', 'video', 'poll',
                'repair-active-poll-route', '71000000-0000-4000-8000-000000000105', 'admitted',
                '2026-06-03T05:59:00.000Z', 'generation.video.poll__active', '2026-06-03T05:59:00.000Z'
              )
            `);
          }
          return db.query<T>(sql, params);
        },
      };

      const repaired = await repairRunningSeedancePollJobs(racingDb, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        staleDispatchMs: 1,
        config: loadGenerationQueueConfig({}),
        publisher: {
          async add() {
            publishedRepairs += 1;
          },
        },
      });

      assert.deepEqual(repaired.repairedTaskIds, []);
      assert.equal(publishedRepairs, 0);
      assert.equal(activeAssignmentInsertedDuringClaim, true);

      await db.query(`
        UPDATE generation_queue_stage_assignments
        SET status = 'released',
            released_at = '2026-06-03T06:00:01.000Z',
            release_reason = 'auto_repair_redis_missing',
            updated_at = '2026-06-03T06:00:01.000Z'
        WHERE assignment_key = 'repair:active-poll'
      `);
      const repairedAfterRelease = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:02.000Z"),
        limit: 10,
        staleDispatchMs: 1,
        config: loadGenerationQueueConfig({}),
        publisher: {
          async add() {
            publishedRepairs += 1;
          },
        },
      });

      assert.deepEqual(repairedAfterRelease.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.equal(publishedRepairs, 1);
    } finally {
      await db.close();
    }
  });

  it("defers repair while the durable poll scheduler or outbox owns the next poll", async () => {
    const db = await createMigratedTestDb();
    let publishedRepairs = 0;

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(`
        UPDATE tasks
        SET locked_until = '2026-06-03T06:05:00.000Z'
        WHERE id = '50000000-0000-4000-8000-000000000104';
        UPDATE provider_requests
        SET next_poll_at = '2026-06-03T06:00:30.000Z'
        WHERE id = '52000000-0000-4000-8000-000000000104'
      `);
      const repair = () => repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        staleDispatchMs: 1,
        config: loadGenerationQueueConfig({}),
        publisher: {
          async add() {
            publishedRepairs += 1;
          },
        },
      });

      assert.deepEqual((await repair()).repairedTaskIds, []);

      await db.query(`
        UPDATE tasks
        SET locked_until = '2026-06-03T05:58:00.000Z'
        WHERE id = '50000000-0000-4000-8000-000000000104'
      `);
      assert.deepEqual((await repair()).repairedTaskIds, []);

      await db.query(`
        UPDATE provider_requests
        SET next_poll_at = NULL
        WHERE id = '52000000-0000-4000-8000-000000000104';
        INSERT INTO outbox_events (
          id, event_type, payload_json, generation_stage, status,
          available_at, dedupe_key, created_at, updated_at, user_id
        ) VALUES (
          '90000000-0000-4000-8000-000000000104',
          'generation.task.poll_requested',
          '{"taskId":"50000000-0000-4000-8000-000000000104","attemptId":"51000000-0000-4000-8000-000000000104"}'::jsonb,
          'poll', 'processing', '2026-06-03T05:59:00.000Z',
          'generation.task.poll_requested:50000000-0000-4000-8000-000000000104:1',
          '2026-06-03T05:59:00.000Z', '2026-06-03T05:59:00.000Z',
          '00000000-0000-4000-8000-000000000101'
        )
      `);

      assert.deepEqual((await repair()).repairedTaskIds, []);
      assert.equal(publishedRepairs, 0);

      await db.query(`
        UPDATE outbox_events
        SET status = 'processed',
            processed_at = '2026-06-03T06:00:01.000Z',
            updated_at = '2026-06-03T06:00:01.000Z'
        WHERE id = '90000000-0000-4000-8000-000000000104'
      `);
      const repairedAfterOwnershipReleased = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:02.000Z"),
        limit: 10,
        staleDispatchMs: 1,
        config: loadGenerationQueueConfig({}),
        publisher: {
          async add() {
            publishedRepairs += 1;
          },
        },
      });

      assert.deepEqual(repairedAfterOwnershipReleased.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.equal(publishedRepairs, 1);
    } finally {
      await db.close();
    }
  });

  it("does not loop image finalize recovery without a durable current attempt", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      await db.query(
        `
          UPDATE tasks
          SET current_attempt_id = NULL,
              locked_until = NULL,
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000105';
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id, attempt_id,
            provider_name, provider_operation, request_key, request_hash,
            payload_ref, payload_hash, payload_redacted_json, status,
            external_submission_started_at, external_request_id,
            response_redacted_json
          ) VALUES (
            '52000000-0000-4000-8000-000000000105',
            '30000000-0000-4000-8000-000000000101',
            '40000000-0000-4000-8000-000000000105',
            '50000000-0000-4000-8000-000000000105',
            '51000000-0000-4000-8000-000000000105',
            'openai', 'episode.image.generate', 'workflow-105:task-105',
            'request-hash-105', 'creator://payload-105', 'payload-hash-105',
            '{}'::jsonb, 'succeeded', '2026-06-03T05:56:00.000Z',
            'image-external-105',
            '{"artifact":{"url":"https://cdn.example.test/result.png","mediaType":"image"}}'::jsonb
          )
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({}),
        publisher: { async add() {} },
      });
      const outbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, []);
      assert.equal(outbox.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("recreates finalize outbox events for provider-succeeded result-unknown Seedance tasks", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'result_unknown',
              failure_code = 'lease_expired_after_external_start',
              locked_until = NULL,
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              response_redacted_json = '{"videoUrl":"https://cdn.example.test/result.mp4"}'::jsonb
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: { async add() {} },
      });
      const outbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.equal(outbox.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("recovers a provider-succeeded task that was failed by an ambiguous queue acknowledgement", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'failed',
              failure_code = 'generation_queue_error',
              locked_until = NULL,
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE task_attempts
          SET status = 'failed', failure_code = 'generation_queue_error'
          WHERE id = '51000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              response_redacted_json = '{"videoUrl":"https://cdn.example.test/result.mp4"}'::jsonb
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: { async add() {} },
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = '50000000-0000-4000-8000-000000000104'",
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE id = '51000000-0000-4000-8000-000000000104'",
      );
      const outbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.deepEqual(task.rows[0], {
        status: "manual_review_required",
        failure_code: "generation_queue_error",
      });
      assert.deepEqual(attempt.rows[0], {
        status: "manual_review_required",
        failure_code: "generation_queue_error",
      });
      assert.equal(outbox.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("recovers a provider-succeeded image task from the legacy failed state", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      await seedGenerationTaskReservationAndSnapshot(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'failed',
              failure_code = 'generation_queue_error',
              locked_until = NULL,
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000105';
          UPDATE task_attempts
          SET status = 'failed',
              failure_code = 'generation_queue_error',
              finished_at = '2026-06-03T05:57:00.000Z'
          WHERE id = '51000000-0000-4000-8000-000000000105';
          UPDATE ai_generation_task_snapshots
          SET status = 'failed',
              progress_stage = 'failed',
              credit_status = 'manual_review_required'
          WHERE task_id = '50000000-0000-4000-8000-000000000105';
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id, attempt_id,
            provider_name, provider_operation, request_key, request_hash,
            payload_ref, payload_hash, payload_redacted_json, status,
            external_submission_started_at, external_request_id, response_redacted_json
          ) VALUES (
            '52000000-0000-4000-8000-000000000105',
            '30000000-0000-4000-8000-000000000101',
            '40000000-0000-4000-8000-000000000105',
            '50000000-0000-4000-8000-000000000105',
            '51000000-0000-4000-8000-000000000105',
            'bananarouter', 'episode.image.generate', 'workflow-105:task-105',
            'request-hash-105', 'creator://payload-105', 'payload-hash-105',
            '{}'::jsonb, 'succeeded', '2026-06-03T05:56:00.000Z',
            NULL, '{"imageUrl":"https://cdn.example.test/result.png"}'::jsonb
          )
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: { async add() {} },
      });
      const state = await db.query<{
        task_status: string;
        attempt_status: string;
        snapshot_status: string;
        finished_at: Date | string | null;
      }>(
        `
          SELECT task.status AS task_status,
                 attempt.status AS attempt_status,
                 snapshot.status AS snapshot_status,
                 attempt.finished_at
          FROM tasks task
          JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
          JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
          WHERE task.id = '50000000-0000-4000-8000-000000000105'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000105",
      ]);
      assert.deepEqual(state.rows[0], {
        task_status: "running",
        attempt_status: "running",
        snapshot_status: "running",
        finished_at: null,
      });
    } finally {
      await db.close();
    }
  });

  it("dispatches image artifact recovery only after its durable next retry time", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      await seedGenerationTaskReservationAndSnapshot(db);
      await db.query(
        `
          INSERT INTO provider_requests (
            id, project_id, workflow_id, task_id, attempt_id,
            provider_name, provider_operation, request_key, request_hash,
            payload_ref, payload_hash, payload_redacted_json, status,
            external_submission_started_at, response_redacted_json
          ) VALUES (
            '52000000-0000-4000-8000-000000000105',
            '30000000-0000-4000-8000-000000000101',
            '40000000-0000-4000-8000-000000000105',
            '50000000-0000-4000-8000-000000000105',
            '51000000-0000-4000-8000-000000000105',
            'bananarouter', 'episode.image.generate', 'workflow-105:task-105',
            'request-hash-105', 'creator://payload-105', 'payload-hash-105',
            '{}'::jsonb, 'succeeded', '2026-06-03T05:56:00.000Z',
            '{"imageUrl":"https://cdn.example.test/result.png"}'::jsonb
          );
          UPDATE ai_generation_task_snapshots
          SET provider_status_json = '{
            "artifactRecovery": {
              "state": "retry_pending",
              "round": 2,
              "startedAt": "2026-06-03T05:55:00.000Z",
              "nextRetryAt": "2026-06-03T06:05:00.000Z",
              "deadlineAt": "2026-06-03T11:55:00.000Z",
              "lastFailureCode": "provider_output_upload_failed"
            }
          }'::jsonb
          WHERE task_id = '50000000-0000-4000-8000-000000000105'
        `,
      );

      const waiting = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: { async add() {} },
      });
      assert.deepEqual(waiting.repairedTaskIds, []);

      const due = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:05:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: { async add() {} },
      });
      const outbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
            AND payload_json->>'taskId' = '50000000-0000-4000-8000-000000000105'
        `,
      );

      assert.deepEqual(due.repairedTaskIds, ["50000000-0000-4000-8000-000000000105"]);
      assert.equal(outbox.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("keeps image credits reserved across retry and manual artifact recovery", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      const reserved = await seedGenerationTaskReservationAndSnapshot(db);
      await seedSucceededGptImageProviderRequest(db);
      await db.query(
        "UPDATE credit_reservations SET status = 'manual_review_required' WHERE id = $1",
        [reserved.reservation.id],
      );

      const retry = await handleGptImageArtifactQueueExhaustion(db, {
        taskId: "50000000-0000-4000-8000-000000000105",
        error: Object.assign(new Error("temporary storage timeout"), {
          failureCode: "provider_output_upload_failed",
        }),
        now: new Date("2026-06-03T06:00:00.000Z"),
      });
      const retryState = await db.query<{
        task_status: string;
        attempt_status: string;
        snapshot_status: string;
        credit_status: string;
        reservation_status: string;
        amount_reserved: number;
        amount_consumed: number;
        amount_released: number;
      }>(`
        SELECT task.status AS task_status,
               attempt.status AS attempt_status,
               snapshot.status AS snapshot_status,
               snapshot.credit_status,
               reservation.status AS reservation_status,
               reservation.amount_reserved,
               reservation.amount_consumed,
               reservation.amount_released
        FROM tasks task
        JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
        JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
        JOIN credit_reservations reservation ON reservation.id = $1
        WHERE task.id = '50000000-0000-4000-8000-000000000105'
      `, [reserved.reservation.id]);
      assert.equal(retry, "retry_pending");
      assert.deepEqual(retryState.rows[0], {
        task_status: "running",
        attempt_status: "running",
        snapshot_status: "running",
        credit_status: "reserved",
        reservation_status: "active",
        amount_reserved: 200,
        amount_consumed: 0,
        amount_released: 0,
      });

      const manual = await handleGptImageArtifactQueueExhaustion(db, {
        taskId: "50000000-0000-4000-8000-000000000105",
        error: Object.assign(new Error("provider output missing"), {
          failureCode: "provider_output_missing",
        }),
        now: new Date("2026-06-03T06:02:00.000Z"),
      });
      const manualState = await db.query<{
        task_status: string;
        attempt_status: string;
        snapshot_status: string;
        credit_status: string;
        failure_json: Record<string, unknown>;
        reservation_status: string;
        amount_reserved: number;
        amount_consumed: number;
        amount_released: number;
      }>(`
        SELECT task.status AS task_status,
               attempt.status AS attempt_status,
               snapshot.status AS snapshot_status,
               snapshot.credit_status,
               snapshot.failure_json,
               reservation.status AS reservation_status,
               reservation.amount_reserved,
               reservation.amount_consumed,
               reservation.amount_released
        FROM tasks task
        JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
        JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
        JOIN credit_reservations reservation ON reservation.id = $1
        WHERE task.id = '50000000-0000-4000-8000-000000000105'
      `, [reserved.reservation.id]);
      assert.equal(manual, "manual_review_required");
      assert.deepEqual({ ...manualState.rows[0], failure_json: undefined }, {
        task_status: "manual_review_required",
        attempt_status: "manual_review_required",
        snapshot_status: "manual_review_required",
        credit_status: "manual_review_required",
        failure_json: undefined,
        reservation_status: "manual_review_required",
        amount_reserved: 200,
        amount_consumed: 0,
        amount_released: 0,
      });
      assert.equal("errorMessage" in (manualState.rows[0]?.failure_json ?? {}), false);
    } finally {
      await db.close();
    }
  });

  it("moves image artifact recovery to manual review exactly at the six-hour deadline", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      const reserved = await seedGenerationTaskReservationAndSnapshot(db);
      await seedSucceededGptImageProviderRequest(db);
      await db.query(`
        UPDATE ai_generation_task_snapshots
        SET provider_status_json = '{
          "artifactRecovery": {
            "state": "retry_pending",
            "round": 7,
            "startedAt": "2026-06-03T06:00:00.000Z",
            "nextRetryAt": "2026-06-03T11:00:00.000Z",
            "deadlineAt": "2026-06-03T12:00:00.000Z",
            "lastFailureCode": "provider_output_upload_failed"
          }
        }'::jsonb
        WHERE task_id = '50000000-0000-4000-8000-000000000105'
      `);

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T12:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: { async add() {} },
      });
      const state = await db.query<{
        task_status: string;
        attempt_status: string;
        snapshot_status: string;
        credit_status: string;
        failure_json: Record<string, unknown>;
        reservation_status: string;
      }>(`
        SELECT task.status AS task_status,
               attempt.status AS attempt_status,
               snapshot.status AS snapshot_status,
               snapshot.credit_status,
               snapshot.failure_json,
               reservation.status AS reservation_status
        FROM tasks task
        JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
        JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
        JOIN credit_reservations reservation ON reservation.id = $1
        WHERE task.id = '50000000-0000-4000-8000-000000000105'
      `, [reserved.reservation.id]);
      const outbox = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM outbox_events
        WHERE event_type = 'generation.task.finalize_requested'
          AND payload_json->>'taskId' = '50000000-0000-4000-8000-000000000105'
      `);

      assert.deepEqual(repaired.repairedTaskIds, ["50000000-0000-4000-8000-000000000105"]);
      assert.deepEqual({ ...state.rows[0], failure_json: undefined }, {
        task_status: "manual_review_required",
        attempt_status: "manual_review_required",
        snapshot_status: "manual_review_required",
        credit_status: "manual_review_required",
        failure_json: undefined,
        reservation_status: "manual_review_required",
      });
      assert.equal(state.rows[0]?.failure_json?.recoveryReason, "recovery_deadline_reached");
      assert.equal(outbox.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("recovers a provider-succeeded ApiMart audio task from the legacy failed state", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedFailedApiMartAudioTask(db);

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: { async add() {} },
      });
      const state = await db.query<{ task_status: string; attempt_status: string }>(
        `
          SELECT task.status AS task_status, attempt.status AS attempt_status
          FROM tasks task
          JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
          WHERE task.id = '50000000-0000-4000-8000-000000000106'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000106",
      ]);
      assert.deepEqual(state.rows[0], {
        task_status: "manual_review_required",
        attempt_status: "manual_review_required",
      });
    } finally {
      await db.close();
    }
  });

  it("does not loop audio finalize recovery until its durable artifact is complete", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedGenerationRepairTasks(db);
      await seedFailedApiMartAudioTask(db);
      const invalidStates = [
        {
          currentAttemptId: null,
          response: { artifact: { mediaType: "audio", url: "https://cdn.example.test/result.mp3" } },
        },
        {
          currentAttemptId: "51000000-0000-4000-8000-000000000106",
          response: { artifact: { mediaType: "video", url: "https://cdn.example.test/result.mp3" } },
        },
        {
          currentAttemptId: "51000000-0000-4000-8000-000000000106",
          response: { artifact: { mediaType: "audio", url: "   " } },
        },
      ];

      for (const invalid of invalidStates) {
        await db.query(
          "UPDATE tasks SET current_attempt_id = $2 WHERE id = $1",
          ["50000000-0000-4000-8000-000000000106", invalid.currentAttemptId],
        );
        await db.query(
          "UPDATE provider_requests SET response_redacted_json = $2::jsonb WHERE id = $1",
          ["52000000-0000-4000-8000-000000000106", JSON.stringify(invalid.response)],
        );
        for (const minute of [0, 1]) {
          const repaired = await repairRunningSeedancePollJobs(db, {
            now: new Date(`2026-06-03T06:0${minute}:00.000Z`),
            limit: 10,
            config: loadGenerationQueueConfig({}),
            publisher: { async add() {} },
          });
          assert.equal(
            repaired.repairedTaskIds.includes("50000000-0000-4000-8000-000000000106"),
            false,
          );
        }
      }

      const beforeRecovery = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM outbox_events
        WHERE event_type = 'generation.task.finalize_requested'
          AND payload_json->>'taskId' = '50000000-0000-4000-8000-000000000106'
      `);
      assert.equal(beforeRecovery.rows[0]?.count, 0);

      await db.query(
        "UPDATE tasks SET current_attempt_id = $2 WHERE id = $1",
        [
          "50000000-0000-4000-8000-000000000106",
          "51000000-0000-4000-8000-000000000106",
        ],
      );
      await db.query(
        "UPDATE provider_requests SET response_redacted_json = $2::jsonb WHERE id = $1",
        [
          "52000000-0000-4000-8000-000000000106",
          JSON.stringify({
            artifact: { mediaType: "audio", url: "https://cdn.example.test/result.mp3" },
          }),
        ],
      );
      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:02:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({}),
        publisher: { async add() {} },
      });
      const afterRecovery = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM outbox_events
        WHERE event_type = 'generation.task.finalize_requested'
          AND payload_json->>'taskId' = '50000000-0000-4000-8000-000000000106'
      `);

      assert.equal(
        repaired.repairedTaskIds.includes("50000000-0000-4000-8000-000000000106"),
        true,
      );
      assert.equal(afterRecovery.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("does not recreate finalize outbox events while a Seedance finalize lease is still active", async () => {
    const db = await createMigratedTestDb();
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'manual_review_required',
              locked_until = '2026-06-03T06:10:00.000Z',
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              response_redacted_json = '{"videoUrl":"https://cdn.example.test/result.mp4"}'::jsonb
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });
      const outbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, []);
      assert.equal(added.length, 0);
      assert.equal(outbox.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });
});

async function seedGenerationRepairTasks(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(`
    INSERT INTO users (id, phone_e164, status)
    VALUES ('00000000-0000-4000-8000-000000000101', '13800138101', 'active')
  `);
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
      VALUES ('30000000-0000-4000-8000-000000000101', 'Generation Repair Project', '16:9', '1080p', 'script_input', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000101')
    `,
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id
      )
      VALUES
        (
          '40000000-0000-4000-8000-000000000101',
          '30000000-0000-4000-8000-000000000101',
          'episode_video_generation',
          'queued',
          '{}'::jsonb,
          '00000000-0000-4000-8000-000000000101'
        ),
        (
          '40000000-0000-4000-8000-000000000102',
          '30000000-0000-4000-8000-000000000101',
          'episode_video_generation',
          'queued',
          '{}'::jsonb,
          '00000000-0000-4000-8000-000000000101'
        ),
        (
          '40000000-0000-4000-8000-000000000103',
          '30000000-0000-4000-8000-000000000101',
          'episode_video_generation',
          'queued',
          '{}'::jsonb,
          '00000000-0000-4000-8000-000000000101'
        )
    `,
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
        project_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        scheduled_at,
        last_dispatched_at,
        input_snapshot_json,
        target_entity_type,
        target_entity_id
      )
      VALUES
        (
          '50000000-0000-4000-8000-000000000101',
          '30000000-0000-4000-8000-000000000101',
          '40000000-0000-4000-8000-000000000101',
          'episode_generate_video',
          'queued',
          'generation-submit-video',
          '2026-06-03T05:55:00.000Z',
          '2026-06-03T05:50:00.000Z',
          '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"seedance","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000101"}'::jsonb,
          'episode',
          '60000000-0000-4000-8000-000000000101'
        ),
        (
          '50000000-0000-4000-8000-000000000102',
          '30000000-0000-4000-8000-000000000101',
          '40000000-0000-4000-8000-000000000102',
          'episode_generate_video',
          'queued',
          'generation-submit-video',
          '2026-06-03T05:55:00.000Z',
          '2026-06-03T05:59:30.000Z',
          '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"seedance","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000102"}'::jsonb,
          'episode',
          '60000000-0000-4000-8000-000000000102'
        ),
        (
          '50000000-0000-4000-8000-000000000103',
          '30000000-0000-4000-8000-000000000101',
          '40000000-0000-4000-8000-000000000103',
          'episode_generate_video',
          'queued',
          'generation-submit-video',
          '2026-06-03T05:55:00.000Z',
          '2026-06-03T05:50:00.000Z',
          '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"mock","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000103"}'::jsonb,
          'episode',
          '60000000-0000-4000-8000-000000000103'
        )
    `,
  );
}

async function seedFailedApiMartAudioTask(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(`
    INSERT INTO workflows (
      id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id
    ) VALUES (
      '40000000-0000-4000-8000-000000000106',
      '30000000-0000-4000-8000-000000000101',
      'episode_audio_generation', 'running', '{}'::jsonb,
      '00000000-0000-4000-8000-000000000101'
    );
    INSERT INTO tasks (
      id, project_id, workflow_id, task_type, status, failure_code,
      queue_name, scheduled_at, last_dispatched_at, input_snapshot_json,
      target_entity_type, target_entity_id
    ) VALUES (
      '50000000-0000-4000-8000-000000000106',
      '30000000-0000-4000-8000-000000000101',
      '40000000-0000-4000-8000-000000000106',
      'episode_generate_audio', 'failed', 'generation_queue_error',
      'generation-submit-audio', '2026-06-03T05:55:00.000Z',
      '2026-06-03T05:50:00.000Z',
      '{"kind":"audio","model":"suno-v4","providerExecutor":"apimart-audio","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000106"}'::jsonb,
      'episode', '60000000-0000-4000-8000-000000000106'
    );
    INSERT INTO task_attempts (
      id, project_id, workflow_id, task_id, attempt_number, status,
      failure_code, started_at, finished_at
    ) VALUES (
      '51000000-0000-4000-8000-000000000106',
      '30000000-0000-4000-8000-000000000101',
      '40000000-0000-4000-8000-000000000106',
      '50000000-0000-4000-8000-000000000106', 1, 'failed',
      'generation_queue_error', '2026-06-03T05:56:00.000Z', '2026-06-03T05:57:00.000Z'
    );
    UPDATE tasks
    SET current_attempt_id = '51000000-0000-4000-8000-000000000106'
    WHERE id = '50000000-0000-4000-8000-000000000106';
    INSERT INTO provider_requests (
      id, project_id, workflow_id, task_id, attempt_id,
      provider_name, provider_operation, request_key, request_hash,
      payload_ref, payload_hash, payload_redacted_json, status,
      external_submission_started_at, external_request_id, response_redacted_json
    ) VALUES (
      '52000000-0000-4000-8000-000000000106',
      '30000000-0000-4000-8000-000000000101',
      '40000000-0000-4000-8000-000000000106',
      '50000000-0000-4000-8000-000000000106',
      '51000000-0000-4000-8000-000000000106',
      'apimart', 'episode.audio.generate', 'workflow-106:task-106',
      'request-hash-106', 'creator://payload-106', 'payload-hash-106',
      '{}'::jsonb, 'succeeded', '2026-06-03T05:56:00.000Z',
      'audio-external-106',
      '{"artifact":{"url":"https://cdn.example.test/result.mp3","mediaType":"audio"}}'::jsonb
    )
  `);
}

async function seedRunningGptImageSubmitTask(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO workflows (
        id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json
      )
      VALUES ('40000000-0000-4000-8000-000000000105', '30000000-0000-4000-8000-000000000101', 'episode_image_generation', 'running', '{}'::jsonb)
    `,
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
        project_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        scheduled_at,
        last_dispatched_at,
        locked_until,
        input_snapshot_json,
        target_entity_type,
        target_entity_id
      )
      VALUES ('50000000-0000-4000-8000-000000000105', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000105', 'episode_generate_image', 'running', 'generation-submit-image', '2026-06-03T05:55:00.000Z', '2026-06-03T05:50:00.000Z', '2026-06-03T05:58:00.000Z', '{"kind":"image","model":"gpt-image-2-cn","providerExecutor":"gpt-image-2","targetType":"asset","targetId":"60000000-0000-4000-8000-000000000105"}'::jsonb, 'asset', '60000000-0000-4000-8000-000000000105')
    `,
  );
  await db.query(
    `
      INSERT INTO task_attempts (
        id,
        project_id,
        workflow_id,
        task_id,
        attempt_number,
        status,
        started_at
      )
      VALUES ('51000000-0000-4000-8000-000000000105', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000105', '50000000-0000-4000-8000-000000000105', 1, 'running', '2026-06-03T05:56:00.000Z')
    `,
  );
  await db.query(
    `
      UPDATE tasks
      SET current_attempt_id = '51000000-0000-4000-8000-000000000105'
      WHERE id = '50000000-0000-4000-8000-000000000105'
    `,
  );
}

async function seedGenerationTaskReservationAndSnapshot(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
) {
  const now = new Date("2026-06-03T05:55:00.000Z");
  await grantCredits(db, {
    userId: "00000000-0000-4000-8000-000000000101",
    amount: 200,
    sourceType: "test_grant",
    sourceId: "70000000-0000-4000-8000-000000000105",
    reason: "generation repair test grant",
    now,
  });
  const reserved = await reserveCredits(db, {
    userId: "00000000-0000-4000-8000-000000000101",
    amount: 200,
    sourceType: "workflow_task",
    sourceId: "50000000-0000-4000-8000-000000000105",
    reason: "generation repair test reservation",
    projectId: "30000000-0000-4000-8000-000000000101",
    workflowId: "40000000-0000-4000-8000-000000000105",
    taskId: "50000000-0000-4000-8000-000000000105",
    now,
  });
  await upsertQueuedGenerationTaskSnapshot(db, {
    projectId: "30000000-0000-4000-8000-000000000101",
    episodeId: null,
    targetType: "asset",
    targetId: "60000000-0000-4000-8000-000000000105",
    workflowId: "40000000-0000-4000-8000-000000000105",
    taskId: "50000000-0000-4000-8000-000000000105",
    modelConfigId: null,
    creditReservationId: reserved.reservation.id,
    modelCode: "gpt-image-2-cn",
    mediaType: "image",
    taskMode: "episode_generate_image",
    estimatedCredits: 200,
    requestSummary: {},
    now,
  });
  await markGenerationTaskSnapshotRunning(db, {
    taskId: "50000000-0000-4000-8000-000000000105",
    attemptId: "51000000-0000-4000-8000-000000000105",
    now,
  });
  return reserved;
}

async function seedSucceededGptImageProviderRequest(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
) {
  await db.query(`
    INSERT INTO provider_requests (
      id, project_id, workflow_id, task_id, attempt_id,
      provider_name, provider_operation, request_key, request_hash,
      payload_ref, payload_hash, payload_redacted_json, status,
      external_submission_started_at, response_redacted_json
    ) VALUES (
      '52000000-0000-4000-8000-000000000105',
      '30000000-0000-4000-8000-000000000101',
      '40000000-0000-4000-8000-000000000105',
      '50000000-0000-4000-8000-000000000105',
      '51000000-0000-4000-8000-000000000105',
      'bananarouter', 'episode.image.generate', 'workflow-105:task-105',
      'request-hash-105', 'creator://payload-105', 'payload-hash-105',
      '{}'::jsonb, 'succeeded', '2026-06-03T05:56:00.000Z',
      '{"imageUrl":"https://cdn.example.test/result.png"}'::jsonb
    )
  `);
}

async function seedRunningSeedanceTask(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO workflows (
        id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json
      )
      VALUES ('40000000-0000-4000-8000-000000000104', '30000000-0000-4000-8000-000000000101', 'episode_video_generation', 'running', '{}'::jsonb)
    `,
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
        project_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        scheduled_at,
        last_dispatched_at,
        locked_until,
        input_snapshot_json,
        target_entity_type,
        target_entity_id
      )
      VALUES ('50000000-0000-4000-8000-000000000104', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000104', 'episode_generate_video', 'running', 'generation-submit-video', '2026-06-03T05:55:00.000Z', '2026-06-03T05:50:00.000Z', '2026-06-03T05:58:00.000Z', '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"seedance","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000104"}'::jsonb, 'episode', '60000000-0000-4000-8000-000000000104')
    `,
  );
  await db.query(
    `
      INSERT INTO task_attempts (
        id,
        project_id,
        workflow_id,
        task_id,
        attempt_number,
        status,
        started_at
      )
      VALUES ('51000000-0000-4000-8000-000000000104', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000104', 1, 'running', '2026-06-03T05:56:00.000Z')
    `,
  );
  await db.query(
    `
      UPDATE tasks
      SET current_attempt_id = '51000000-0000-4000-8000-000000000104'
      WHERE id = '50000000-0000-4000-8000-000000000104'
    `,
  );
  await db.query(
    `
      INSERT INTO provider_requests (
        id,
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
        external_request_id
      )
      VALUES ('52000000-0000-4000-8000-000000000104', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000104', '51000000-0000-4000-8000-000000000104', 'volcengine', 'episode.video.generate', 'workflow-104:task-104', 'request-hash-104', 'creator://payload-104', 'payload-hash-104', '{}'::jsonb, 'accepted', '2026-06-03T05:56:00.000Z', 'seedance-external-104')
    `,
  );
}

async function seedSeedanceTaskReservationAndSnapshot(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
) {
  const now = new Date("2026-06-03T05:55:00.000Z");
  await grantCredits(db, {
    userId: "00000000-0000-4000-8000-000000000101",
    amount: 120,
    sourceType: "test_grant",
    sourceId: "70000000-0000-4000-8000-000000000104",
    reason: "generation accepted video repair test grant",
    now,
  });
  const reserved = await reserveCredits(db, {
    userId: "00000000-0000-4000-8000-000000000101",
    amount: 120,
    sourceType: "workflow_task",
    sourceId: "50000000-0000-4000-8000-000000000104",
    reason: "generation accepted video repair test reservation",
    projectId: "30000000-0000-4000-8000-000000000101",
    workflowId: "40000000-0000-4000-8000-000000000104",
    taskId: "50000000-0000-4000-8000-000000000104",
    now,
  });
  await upsertQueuedGenerationTaskSnapshot(db, {
    projectId: "30000000-0000-4000-8000-000000000101",
    episodeId: null,
    targetType: "episode",
    targetId: "60000000-0000-4000-8000-000000000104",
    workflowId: "40000000-0000-4000-8000-000000000104",
    taskId: "50000000-0000-4000-8000-000000000104",
    modelConfigId: null,
    creditReservationId: reserved.reservation.id,
    modelCode: "seedance-i2v-pro",
    mediaType: "video",
    taskMode: "episode_generate_video",
    estimatedCredits: 120,
    requestSummary: {},
    now,
  });
  await markGenerationTaskSnapshotRunning(db, {
    taskId: "50000000-0000-4000-8000-000000000104",
    attemptId: "51000000-0000-4000-8000-000000000104",
    providerRequestId: "52000000-0000-4000-8000-000000000104",
    progressStage: "provider_accepted",
    now,
  });
  return reserved;
}
