import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { handleGptImageArtifactQueueExhaustion } from "../gpt-image-artifact-recovery.service.ts";
import {
  failStaleGenerationTasksBeforeProviderSubmission,
  repairQueuedGenerationTaskOutbox,
  repairRunningSeedancePollJobs,
} from "../generation-redis-repair.service.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation Redis dispatch repair", () => {
  it("waits on a live image artifact lease and recovers promptly after expiry without a transfer recovery window", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = randomUUID();
      const projectId = randomUUID();
      const workflowId = randomUUID();
      const taskId = randomUUID();
      const attemptId = randomUUID();
      const providerRequestId = randomUUID();
      const snapshotId = randomUUID();
      const outboxEventId = randomUUID();
      const leaseOwner = "gpt-image-artifact-finalizer:still-running";
      const lockedUntil = new Date("2026-08-03T16:00:00.000Z");
      const heartbeatAt = new Date("2026-08-03T15:55:00.000Z");
      const taskSnapshot = JSON.stringify({ providerExecutor: "gpt-image-2", model: "gpt-image-2-cn", targetType: "episode" });
      const recovery = JSON.stringify({});
      await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138391', 'active')", [userId]);
      await db.query(`
        INSERT INTO projects (id, name, aspect_ratio, resolution, phase, owner_user_id, created_by_user_id)
        VALUES ($1, 'Image lease repair', '16:9', '1080p', 'script_input', $2, $2)
      `, [projectId, userId]);
      await db.query(`
        INSERT INTO workflows (id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id)
        VALUES ($1, $2, 'episode_image_generation', 'running', $3::jsonb, $4)
      `, [workflowId, projectId, taskSnapshot, userId]);
      await db.query(`
        INSERT INTO tasks (
          id, project_id, workflow_id, task_type, status, queue_name,
          input_snapshot_json, target_entity_type, target_entity_id,
          locked_by, locked_until, heartbeat_at, last_dispatched_at
        ) VALUES (
          $1, $2, $3, 'episode_generate_image', 'running', 'generation-result-image',
          $4::jsonb, 'episode', $1, $5, $6, $7, $8
        )
      `, [taskId, projectId, workflowId, taskSnapshot, leaseOwner, lockedUntil, heartbeatAt, new Date("2026-08-03T10:00:00.000Z")]);
      await db.query(`
        INSERT INTO task_attempts (
          id, project_id, workflow_id, task_id, attempt_number, status,
          locked_by, locked_until, heartbeat_at, started_at
        ) VALUES ($1, $2, $3, $4, 1, 'running', $5, $6, $7, $8)
      `, [attemptId, projectId, workflowId, taskId, leaseOwner, lockedUntil, heartbeatAt, new Date("2026-08-03T10:00:00.000Z")]);
      await db.query("UPDATE tasks SET current_attempt_id = $2, attempt_count = 1 WHERE id = $1", [taskId, attemptId]);
      await db.query(`
        INSERT INTO provider_requests (
          id, project_id, workflow_id, task_id, attempt_id, provider_name,
          provider_operation, request_key, request_hash, payload_ref, payload_hash,
          payload_redacted_json, response_redacted_json, status, created_by_user_id
        ) VALUES (
          $1, $2, $3, $4, $5, 'san_bao', 'episode.image.generate',
          $1::uuid::text, $1::uuid::text, 'image-lease-repair', $1::uuid::text,
          '{}'::jsonb, '{"artifact":{"mediaType":"image","url":"https://provider.example.test/image.png"}}'::jsonb,
          'succeeded', $6
        )
      `, [providerRequestId, projectId, workflowId, taskId, attemptId, userId]);
      await db.query(`
        INSERT INTO ai_generation_task_snapshots (
          id, user_id, project_id, target_type, target_id, workflow_id, task_id,
          attempt_id, provider_request_id, model_code, media_type, task_mode,
          status, progress_stage, provider_status_json, submitted_at, started_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'episode', $4, $5, $4,
          $6, $7, 'gpt-image-2-cn', 'image', 'image.generate',
          'running', 'artifact_fetching', $8::jsonb,
          $9, $9, $9, $9
        )
      `, [snapshotId, userId, projectId, taskId, workflowId, attemptId, providerRequestId, recovery, new Date("2026-08-03T10:00:00.000Z")]);
      await db.query(`
        INSERT INTO outbox_events (
          id, user_id, event_type, payload_json, status, available_at, created_at, updated_at
        ) VALUES (
          $1, $2, 'generation.task.finalize_requested', $3::jsonb, 'processing', $4, $4, $4
        )
      `, [outboxEventId, userId, JSON.stringify({ taskId, attemptId, mediaType: "image" }), new Date("2026-08-03T10:00:00.000Z")]);
      await db.query("UPDATE outbox_events SET dedupe_key = $2 WHERE id = $1", [outboxEventId,
        `generation.task.finalize_requested:${taskId}:${attemptId}:retry_finalize`]);

      assert.equal(await handleGptImageArtifactQueueExhaustion(db, {
        taskId,
        expectedAttemptId: attemptId,
        error: Object.assign(new Error("generation_artifact_lease_busy"), { failureCode: "generation_artifact_lease_busy" }),
        now: new Date("2026-08-03T15:57:00.000Z"),
      }), "retry_pending", "bounded contention hands ownership recovery to maintenance");
      const waitingRecovery = await db.query<{ recovery: Record<string, unknown> }>(
        "SELECT provider_status_json->'artifactRecovery' AS recovery FROM ai_generation_task_snapshots WHERE task_id = $1",
        [taskId],
      );
      assert.equal(waitingRecovery.rows[0]?.recovery, null);

      const published: unknown[] = [];
      const repair = (now: Date) => repairRunningSeedancePollJobs(db, {
        now, limit: 10, config: loadGenerationQueueConfig({}),
        publisher: { async add(...args) { published.push(args); } },
      });
      assert.deepEqual(await repair(new Date("2026-08-03T15:59:00.000Z")), { repairedTaskIds: [] });
      assert.equal(published.length, 0);
      await db.query("UPDATE tasks SET last_dispatched_at = $2 WHERE id = $1", [taskId, new Date("2026-08-03T15:59:30.000Z")]);
      await assert.rejects(repairRunningSeedancePollJobs({ async query(sql, params) {
        if (sql.includes("INSERT INTO outbox_events")) throw new Error("simulated successor write failure");
        return db.query(sql, params);
      } }, { now: new Date("2026-08-03T16:00:01.000Z"), limit: 10,
        config: loadGenerationQueueConfig({}), publisher: { async add() {} },
      }), /simulated successor write failure/);
      const rolledBack = await db.query<{ status: string; last_dispatched_at: Date }>(`
        SELECT event.status, task.last_dispatched_at FROM outbox_events event
        JOIN tasks task ON task.id = $2 WHERE event.id = $1
      `, [outboxEventId, taskId]);
      assert.equal(rolledBack.rows[0]?.status, "processing");
      assert.equal(rolledBack.rows[0]?.last_dispatched_at.toISOString(), "2026-08-03T15:59:30.000Z");
      assert.deepEqual(await repair(new Date("2026-08-03T16:00:01.000Z")), { repairedTaskIds: [taskId] });
      assert.deepEqual(await repair(new Date("2026-08-03T16:00:02.000Z")), { repairedTaskIds: [] });
      assert.deepEqual(await repair(new Date("2026-08-03T16:01:00.000Z")), { repairedTaskIds: [] });
      assert.equal(published.length, 0);

      const task = await db.query<{
        status: string; failure_code: string | null;
        locked_by: string | null; locked_until: Date | null; heartbeat_at: Date | null;
      }>("SELECT status, failure_code, locked_by, locked_until, heartbeat_at FROM tasks WHERE id = $1", [taskId]);
      const attempt = await db.query<{
        status: string; failure_code: string | null;
        locked_by: string | null; locked_until: Date | null; heartbeat_at: Date | null;
      }>("SELECT status, failure_code, locked_by, locked_until, heartbeat_at FROM task_attempts WHERE id = $1", [attemptId]);
      for (const row of [task.rows[0], attempt.rows[0]]) {
        assert.equal(row?.status, "running");
        assert.equal(row?.failure_code, null);
        assert.equal(row?.locked_by, leaseOwner);
        assert.equal(row?.locked_until?.toISOString(), lockedUntil.toISOString());
        assert.equal(row?.heartbeat_at?.toISOString(), heartbeatAt.toISOString());
      }
      const snapshot = await db.query<{ recovery: Record<string, unknown> }>(
        "SELECT provider_status_json->'artifactRecovery' AS recovery FROM ai_generation_task_snapshots WHERE task_id = $1",
        [taskId],
      );
      assert.equal(snapshot.rows[0]?.recovery, null);
      const outbox = await db.query<{ count: string }>(
        "SELECT count(*) AS count FROM outbox_events WHERE payload_json->>'taskId' = $1",
        [taskId],
      );
      assert.equal(Number(outbox.rows[0]?.count), 2, "maintenance must create exactly one recovery event");
      const active = await db.query<{ id: string }>(
        "SELECT id FROM outbox_events WHERE payload_json->>'taskId' = $1 AND status = 'pending'", [taskId]);
      assert.equal(active.rows.length, 1);
      assert.notEqual(active.rows[0]?.id, outboxEventId, "new event identity must bypass BullMQ's old job deduplication");
    } finally {
      await db.close();
    }
  });

  it("waits on a live video artifact lease and recovers promptly after expiry without a transfer recovery window", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = randomUUID();
      const projectId = randomUUID();
      const workflowId = randomUUID();
      const taskId = randomUUID();
      const attemptId = randomUUID();
      const providerRequestId = randomUUID();
      const snapshotId = randomUUID();
      const outboxEventId = randomUUID();
      const leaseOwner = "seedance-video-finalizer:still-running";
      const lockedUntil = new Date("2026-08-03T16:00:00.000Z");
      const heartbeatAt = new Date("2026-08-03T15:55:00.000Z");
      const taskSnapshot = JSON.stringify({ providerExecutor: "seedance", model: "seedance-i2v-pro", targetType: "episode" });
      const recovery = JSON.stringify({});
      await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138391', 'active')", [userId]);
      await db.query(`
        INSERT INTO projects (id, name, aspect_ratio, resolution, phase, owner_user_id, created_by_user_id)
        VALUES ($1, 'Video lease repair', '16:9', '1080p', 'script_input', $2, $2)
      `, [projectId, userId]);
      await db.query(`
        INSERT INTO workflows (id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id)
        VALUES ($1, $2, 'episode_video_generation', 'running', $3::jsonb, $4)
      `, [workflowId, projectId, taskSnapshot, userId]);
      await db.query(`
        INSERT INTO tasks (
          id, project_id, workflow_id, task_type, status, queue_name,
          input_snapshot_json, target_entity_type, target_entity_id,
          locked_by, locked_until, heartbeat_at, last_dispatched_at
        ) VALUES (
          $1, $2, $3, 'episode_generate_video', 'running', 'generation-result-video',
          $4::jsonb, 'episode', $1, $5, $6, $7, $8
        )
      `, [taskId, projectId, workflowId, taskSnapshot, leaseOwner, lockedUntil, heartbeatAt, new Date("2026-08-03T10:00:00.000Z")]);
      await db.query(`
        INSERT INTO task_attempts (
          id, project_id, workflow_id, task_id, attempt_number, status,
          locked_by, locked_until, heartbeat_at, started_at
        ) VALUES ($1, $2, $3, $4, 1, 'running', $5, $6, $7, $8)
      `, [attemptId, projectId, workflowId, taskId, leaseOwner, lockedUntil, heartbeatAt, new Date("2026-08-03T10:00:00.000Z")]);
      await db.query("UPDATE tasks SET current_attempt_id = $2, attempt_count = 1 WHERE id = $1", [taskId, attemptId]);
      await db.query(`
        INSERT INTO provider_requests (
          id, project_id, workflow_id, task_id, attempt_id, provider_name,
          provider_operation, request_key, request_hash, payload_ref, payload_hash,
          payload_redacted_json, response_redacted_json, status, created_by_user_id
        ) VALUES (
          $1, $2, $3, $4, $5, 'san_bao', 'episode.video.generate',
          $1::uuid::text, $1::uuid::text, 'video-lease-repair', $1::uuid::text,
          '{}'::jsonb, '{"videoUrl":"https://provider.example.test/video.mp4"}'::jsonb,
          'succeeded', $6
        )
      `, [providerRequestId, projectId, workflowId, taskId, attemptId, userId]);
      await db.query(`
        INSERT INTO ai_generation_task_snapshots (
          id, user_id, project_id, target_type, target_id, workflow_id, task_id,
          attempt_id, provider_request_id, model_code, media_type, task_mode,
          status, progress_stage, provider_status_json, submitted_at, started_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'episode', $4, $5, $4,
          $6, $7, 'seedance-i2v-pro', 'video', 'video.generate',
          'running', 'artifact_fetching', $8::jsonb,
          $9, $9, $9, $9
        )
      `, [snapshotId, userId, projectId, taskId, workflowId, attemptId, providerRequestId, recovery, new Date("2026-08-03T10:00:00.000Z")]);
      await db.query(`
        INSERT INTO outbox_events (
          id, user_id, event_type, payload_json, status, available_at, created_at, updated_at
        ) VALUES (
          $1, $2, 'generation.task.finalize_requested', $3::jsonb, 'processing', $4, $4, $4
        )
      `, [outboxEventId, userId, JSON.stringify({ taskId, attemptId, mediaType: "video" }), new Date("2026-08-03T10:00:00.000Z")]);
      await db.query("UPDATE outbox_events SET dedupe_key = $2 WHERE id = $1", [outboxEventId,
        `generation.task.finalize_requested:${taskId}:${attemptId}:retry_finalize`]);

      await db.query("UPDATE provider_requests SET external_request_id = 'video-external', external_submission_started_at = now() WHERE id = $1", [providerRequestId]);
      const waitingRecovery = await db.query<{ recovery: Record<string, unknown> }>(
        "SELECT provider_status_json->'artifactRecovery' AS recovery FROM ai_generation_task_snapshots WHERE task_id = $1",
        [taskId],
      );
      assert.equal(waitingRecovery.rows[0]?.recovery, null);

      const published: unknown[] = [];
      const repair = (now: Date) => repairRunningSeedancePollJobs(db, {
        now, limit: 10, config: loadGenerationQueueConfig({}),
        publisher: { async add(...args) { published.push(args); } },
      });
      assert.deepEqual(await repair(new Date("2026-08-03T15:59:00.000Z")), { repairedTaskIds: [] });
      assert.equal(published.length, 0);
      await db.query("UPDATE tasks SET last_dispatched_at = $2 WHERE id = $1", [taskId, new Date("2026-08-03T15:59:30.000Z")]);
      await assert.rejects(repairRunningSeedancePollJobs({ async query(sql, params) {
        if (sql.includes("INSERT INTO outbox_events")) throw new Error("simulated successor write failure");
        return db.query(sql, params);
      } }, { now: new Date("2026-08-03T16:00:01.000Z"), limit: 10,
        config: loadGenerationQueueConfig({}), publisher: { async add() {} },
      }), /simulated successor write failure/);
      const rolledBack = await db.query<{ status: string; last_dispatched_at: Date }>(`
        SELECT event.status, task.last_dispatched_at FROM outbox_events event
        JOIN tasks task ON task.id = $2 WHERE event.id = $1
      `, [outboxEventId, taskId]);
      assert.equal(rolledBack.rows[0]?.status, "processing");
      assert.equal(rolledBack.rows[0]?.last_dispatched_at.toISOString(), "2026-08-03T15:59:30.000Z");
      assert.deepEqual(await repair(new Date("2026-08-03T16:00:01.000Z")), { repairedTaskIds: [taskId] });
      assert.deepEqual(await repair(new Date("2026-08-03T16:00:02.000Z")), { repairedTaskIds: [] });
      assert.deepEqual(await repair(new Date("2026-08-03T16:01:00.000Z")), { repairedTaskIds: [] });
      assert.equal(published.length, 0);

      const task = await db.query<{
        status: string; failure_code: string | null;
        locked_by: string | null; locked_until: Date | null; heartbeat_at: Date | null;
      }>("SELECT status, failure_code, locked_by, locked_until, heartbeat_at FROM tasks WHERE id = $1", [taskId]);
      const attempt = await db.query<{
        status: string; failure_code: string | null;
        locked_by: string | null; locked_until: Date | null; heartbeat_at: Date | null;
      }>("SELECT status, failure_code, locked_by, locked_until, heartbeat_at FROM task_attempts WHERE id = $1", [attemptId]);
      for (const row of [task.rows[0], attempt.rows[0]]) {
        assert.equal(row?.status, "running");
        assert.equal(row?.failure_code, null);
        assert.equal(row?.locked_by, leaseOwner);
        assert.equal(row?.locked_until?.toISOString(), lockedUntil.toISOString());
        assert.equal(row?.heartbeat_at?.toISOString(), heartbeatAt.toISOString());
      }
      const snapshot = await db.query<{ recovery: Record<string, unknown> }>(
        "SELECT provider_status_json->'artifactRecovery' AS recovery FROM ai_generation_task_snapshots WHERE task_id = $1",
        [taskId],
      );
      assert.equal(snapshot.rows[0]?.recovery, null);
      const outbox = await db.query<{ count: string }>(
        "SELECT count(*) AS count FROM outbox_events WHERE payload_json->>'taskId' = $1",
        [taskId],
      );
      assert.equal(Number(outbox.rows[0]?.count), 2, "maintenance must create exactly one recovery event");
      const active = await db.query<{ id: string }>(
        "SELECT id FROM outbox_events WHERE payload_json->>'taskId' = $1 AND status = 'pending'", [taskId]);
      assert.equal(active.rows.length, 1);
      assert.notEqual(active.rows[0]?.id, outboxEventId, "new event identity must bypass BullMQ's old job deduplication");
      // A pre-upgrade transfer retry used this fixed owner. It needs the same
      // recovery even with a stranded active outbox and a recent dispatch.
      await db.query("UPDATE tasks SET locked_by = 'seedance-video-finalize-worker', locked_until = $2, last_dispatched_at = $3 WHERE id = $1",
        [taskId, new Date("2026-08-03T16:03:00.000Z"), new Date("2026-08-03T16:02:30.000Z")]);
      assert.deepEqual(await repair(new Date("2026-08-03T16:03:01.000Z")), { repairedTaskIds: [taskId] });
      assert.deepEqual(await repair(new Date("2026-08-03T16:03:02.000Z")), { repairedTaskIds: [] });
      const legacySuccessor = await db.query<{ id: string }>("SELECT id FROM outbox_events WHERE payload_json->>'taskId' = $1 AND status = 'pending'", [taskId]);
      assert.equal(legacySuccessor.rows.length, 1);
      assert.notEqual(legacySuccessor.rows[0]?.id, active.rows[0]?.id);

    } finally {
      await db.close();
    }
  });

  it("keeps a directly republished Agent poll on its scoped queue", async () => {
    const scope = "a".repeat(32);
    const published: string[] = [];
    await repairRunningSeedancePollJobs({
      async query(sql: string) {
        if (sql.includes("AS poll_sequence")) return { rows: [{
          task_id: "scoped-task", current_attempt_id: "attempt", workflow_id: "workflow",
          task_type: "episode_generate_image", poll_sequence: 1,
          input_snapshot_json: { agentExecutionScope: scope, providerExecutor: "gpt-image-2" },
        }] };
        if (sql.includes("FROM claimed_task")) return { rows: [{ id: "scoped-task" }] };
        return { rows: [] };
      },
    } as never, {
      now: new Date(), limit: 10, config: loadGenerationQueueConfig({}),
      publisher: { async add(queueName) { published.push(queueName); } },
    });
    assert.deepEqual(published, [`agent-${scope}-generation-poll`]);
  });

  it("uses fixed queue repair paths without a stage-assignment query", async () => {
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
    assert.equal(queries.some((sql) => /generation_queue_stage_assignments/.test(sql)), false);
  });

  it("repairs stale queued tasks through the outbox without a dynamic queue directory", async () => {
    const queries: string[] = [];
    await repairQueuedGenerationTaskOutbox({
      async query(sql: string) {
        queries.push(sql);
        return { rows: [] };
      },
    } as never, {
      now: new Date("2026-06-03T06:00:00.000Z"),
      limit: 10,
    });
    assert.equal(queries.some((sql) => /generation_queue_shards|generation_queue_stage_assignments/.test(sql)), false);
  });

  it("keeps stale pre-submission failure handling independent of queue assignment records", async () => {
    const queries: string[] = [];
    await failStaleGenerationTasksBeforeProviderSubmission({
      async query(sql: string) {
        queries.push(sql);
        return { rows: [] };
      },
    } as never, {
      now: new Date("2026-06-03T06:00:00.000Z"),
      limit: 10,
    });
    assert.equal(queries.some((sql) => /generation_queue_shards|generation_queue_stage_assignments/.test(sql)), false);
  });
});
