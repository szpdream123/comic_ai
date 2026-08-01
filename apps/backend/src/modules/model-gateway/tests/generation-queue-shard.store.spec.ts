import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  assignGenerationQueueStage,
  buildGenerationQueueName,
  createGenerationQueueRouteCode,
  generationQueueShardCapacity,
  generationQueueShardRateLimitDurationMs,
  generationQueueShardRateLimitMax,
  hasRecoverableGenerationQueueSuccessor,
  hasReleasedGenerationQueueStageAssignment,
  listGenerationQueueShards,
  markGenerationQueueStagePublished,
  releaseGenerationQueueStage,
  reserveGenerationQueueStageForPublish,
  retireIdleGenerationQueueShards,
} from "../generation-queue-shard.store.ts";

describe("generation queue shard store", { concurrency: false }, () => {
  it("uses safe deterministic route codes and BullMQ-compatible queue names", () => {
    const routeKey = "provider/account:secret-ref@example.com";
    const routeCode = createGenerationQueueRouteCode(routeKey);
    const queueName = buildGenerationQueueName({
      mediaType: "video",
      stage: "submit",
      routeCode,
      shardNo: 12,
    });

    assert.match(routeCode, /^r[a-f0-9]{24}$/);
    assert.equal(createGenerationQueueRouteCode(routeKey), routeCode);
    assert.equal(queueName, `generation-video-submit-${routeCode}-012`);
    assert.match(queueName, /^[a-z0-9-]+$/);
    assert.equal(queueName.includes(":"), false);
    assert.equal(queueName.includes("secret-ref"), false);
  });

  it("atomically puts the 601st concurrent assignment in a second shard", async () => {
    const db = await createShardTestDb();
    const routeKey = "provider-a|executor-a|account-a";
    const now = new Date("2026-07-22T00:00:00.000Z");

    try {
      const assignments = await Promise.all(
        Array.from({ length: 601 }, (_, index) => assignGenerationQueueStage(db, {
          assignmentKey: `submit:${taskId(index)}`,
          taskId: taskId(index),
          mediaType: "image",
          stage: "submit",
          routeKey,
          now,
        })),
      );
      const rows = await db.query<{
        shard_no: number;
        admitted_count: number;
        capacity: number;
        rate_limit_max: number;
        rate_limit_duration_ms: number;
        state: string;
        queue_name: string;
      }>(
        `
          SELECT shard_no, admitted_count, capacity, rate_limit_max,
                 rate_limit_duration_ms, state, queue_name
          FROM generation_queue_shards
          ORDER BY shard_no ASC
        `,
      );

      assert.equal(assignments.length, 601);
      assert.deepEqual(rows.rows.map((row) => row.admitted_count), [600, 1]);
      assert.deepEqual(rows.rows.map((row) => row.state), ["full", "accepting"]);
      assert.equal(assignments.filter((assignment) => assignment.shardNo === 0).length, 600);
      assert.equal(assignments.filter((assignment) => assignment.shardNo === 1).length, 1);
      for (const row of rows.rows) {
        assert.equal(row.capacity, generationQueueShardCapacity);
        assert.equal(row.rate_limit_max, generationQueueShardRateLimitMax);
        assert.equal(row.rate_limit_duration_ms, generationQueueShardRateLimitDurationMs);
        assert.ok(row.admitted_count <= row.capacity);
        assert.match(row.queue_name, /^[a-z0-9-]+$/);
        assert.equal(row.queue_name.includes(":"), false);
      }
    } finally {
      await db.close();
    }
  });

  it("does not consume another slot when the same assignment is admitted concurrently", async () => {
    const db = await createShardTestDb();
    const input = {
      assignmentKey: "poll:50000000-0000-4000-8000-000000000001:1",
      taskId: "50000000-0000-4000-8000-000000000001",
      mediaType: "video" as const,
      stage: "poll" as const,
      routeKey: "provider-b|executor-b|account-b",
      now: new Date("2026-07-22T00:01:00.000Z"),
    };

    try {
      const assignments = await Promise.all(
        Array.from({ length: 40 }, () => assignGenerationQueueStage(db, input)),
      );
      const counts = await db.query<{ assignments: number; admitted_count: number }>(
        `
          SELECT
            (SELECT count(*)::int FROM generation_queue_stage_assignments) AS assignments,
            (SELECT sum(admitted_count)::int FROM generation_queue_shards) AS admitted_count
        `,
      );

      assert.equal(new Set(assignments.map((assignment) => assignment.shardId)).size, 1);
      assert.deepEqual(counts.rows[0], { assignments: 1, admitted_count: 1 });
    } finally {
      await db.close();
    }
  });

  it("releases a completed stage exactly once", async () => {
    const db = await createShardTestDb();
    const assignmentKey = "fetch:50000000-0000-4000-8000-000000000002";

    try {
      await assignGenerationQueueStage(db, {
        assignmentKey,
        taskId: "50000000-0000-4000-8000-000000000002",
        mediaType: "audio",
        stage: "fetch",
        routeKey: "provider-c|executor-c|account-c",
        now: new Date("2026-07-22T00:02:00.000Z"),
      });
      const first = await releaseGenerationQueueStage(db, {
        assignmentKey,
        reason: "completed",
        now: new Date("2026-07-22T00:03:00.000Z"),
      });
      const second = await releaseGenerationQueueStage(db, {
        assignmentKey,
        reason: "completed",
        now: new Date("2026-07-22T00:04:00.000Z"),
      });

      assert.equal(first?.released, true);
      assert.equal(first?.admittedCount, 0);
      assert.equal(second?.released, false);
      assert.equal(second?.admittedCount, 0);
    } finally {
      await db.close();
    }
  });

  it("persists publishing before admission and rejects reuse after release", async () => {
    const db = await createShardTestDb();
    const assignmentKey = "publish:50000000-0000-4000-8000-000000000003";
    const input = {
      assignmentKey,
      taskId: "50000000-0000-4000-8000-000000000003",
      mediaType: "video" as const,
      stage: "poll" as const,
      routeKey: "provider-publish|executor|account",
      redisJobId: "generation.video.poll__task-3__1",
      now: new Date("2026-07-24T00:00:00.000Z"),
    };
    try {
      const publishing = await reserveGenerationQueueStageForPublish(db, input);
      assert.equal(publishing.assignmentStatus, "publishing");
      assert.equal(publishing.redisJobId, input.redisJobId);

      const publishingRetry = await reserveGenerationQueueStageForPublish(db, {
        ...input,
        now: new Date("2026-07-24T00:00:00.500Z"),
      });
      assert.equal(publishingRetry.assignmentStatus, "publishing");
      assert.equal(publishingRetry.shardId, publishing.shardId);
      assert.equal(publishingRetry.admittedCount, 1);

      const published = await markGenerationQueueStagePublished(db, {
        assignmentKey,
        redisJobId: input.redisJobId,
        now: new Date("2026-07-24T00:00:01.000Z"),
      });
      assert.equal(published?.assignmentStatus, "admitted");
      assert.equal(published?.redisJobId, input.redisJobId);
      assert.ok(published?.publishedAt);

      await releaseGenerationQueueStage(db, {
        assignmentKey,
        reason: "completed",
        now: new Date("2026-07-24T00:00:02.000Z"),
      });
      assert.equal(await hasReleasedGenerationQueueStageAssignment(db, input), true);
      assert.equal(await hasReleasedGenerationQueueStageAssignment(db, {
        ...input,
        redisJobId: `${input.redisJobId}:mismatch`,
      }), false);
      const publishedAfterFastCompletion = await markGenerationQueueStagePublished(db, {
        assignmentKey,
        redisJobId: input.redisJobId,
        now: new Date("2026-07-24T00:00:03.000Z"),
      });
      assert.equal(publishedAfterFastCompletion.assignmentStatus, "released");
      assert.equal(publishedAfterFastCompletion.redisJobId, input.redisJobId);
      await assert.rejects(
        markGenerationQueueStagePublished(db, {
          assignmentKey,
          redisJobId: `${input.redisJobId}:mismatch`,
          now: new Date("2026-07-24T00:00:04.000Z"),
        }),
        /generation_queue_assignment_redis_job_id_mismatch/,
      );
      await assert.rejects(
        reserveGenerationQueueStageForPublish(db, input),
        /generation_queue_assignment_already_released/,
      );
      await assert.rejects(
        assignGenerationQueueStage(db, input),
        /generation_queue_assignment_already_released/,
      );
    } finally {
      await db.close();
    }
  });

  it("does not treat a database-only downstream reservation as proof that Redis accepted it", async () => {
    const db = await createShardTestDb();
    const task = "50000000-0000-4000-8000-000000000006";
    const sourceAssignmentKey = `generation.worker:submit:generation.task.created__${task}__submit`;
    try {
      await reserveGenerationQueueStageForPublish(db, {
        assignmentKey: sourceAssignmentKey,
        taskId: task,
        mediaType: "image",
        stage: "submit",
        routeKey: "provider-timeout|executor|account",
        redisJobId: `generation.task.created__${task}__submit`,
        now: new Date("2026-08-01T07:57:39.000Z"),
      });
      await reserveGenerationQueueStageForPublish(db, {
        assignmentKey: `generation.worker:fetch:generation.image.finalize__${task}`,
        taskId: task,
        mediaType: "image",
        stage: "fetch",
        routeKey: "provider-timeout|executor|account",
        redisJobId: `generation.image.finalize__${task}`,
        now: new Date("2026-08-01T08:00:44.000Z"),
      });

      assert.equal(await hasRecoverableGenerationQueueSuccessor(db, {
        taskId: task,
        sourceAssignmentKey,
      }), false);
      assert.equal(await hasRecoverableGenerationQueueSuccessor(db, {
        taskId: "50000000-0000-4000-8000-000000000007",
        sourceAssignmentKey: "generation.worker:submit:missing-successor",
      }), false);
    } finally {
      await db.close();
    }
  });

  it("recognizes every durable downstream stage after an ambiguous Redis acknowledgement", async () => {
    const db = await createShardTestDb();
    const submitTask = "50000000-0000-4000-8000-000000000007";
    const pollTask = "50000000-0000-4000-8000-000000000008";
    const fetchTask = "50000000-0000-4000-8000-000000000009";
    const invalidTask = "50000000-0000-4000-8000-000000000010";
    const failedTask = "50000000-0000-4000-8000-000000000011";
    try {
      const reserve = (
        taskId: string,
        stage: "submit" | "poll" | "fetch" | "persist",
        suffix: string,
        now: Date,
      ) => reserveGenerationQueueStageForPublish(db, {
        assignmentKey: `generation.worker:${stage}:${taskId}:${suffix}`,
        taskId,
        mediaType: "image",
        stage,
        routeKey: "provider-ambiguous|executor|account",
        redisJobId: `generation.image.${stage}__${taskId}__${suffix}`,
        now,
      });

      const submit = await reserve(submitTask, "submit", "source", new Date("2026-08-01T08:00:00.000Z"));
      const admittedSuccessor = await reserve(submitTask, "poll", "successor", new Date("2026-08-01T08:00:01.000Z"));
      await markGenerationQueueStagePublished(db, {
        assignmentKey: admittedSuccessor.assignmentKey,
        redisJobId: admittedSuccessor.redisJobId!,
        now: new Date("2026-08-01T08:00:02.000Z"),
      });
      const poll = await reserve(pollTask, "poll", "source", new Date("2026-08-01T08:01:00.000Z"));
      const completedSuccessor = await reserve(pollTask, "poll", "successor", new Date("2026-08-01T08:01:01.000Z"));
      await releaseGenerationQueueStage(db, {
        assignmentKey: completedSuccessor.assignmentKey,
        reason: "completed",
        now: new Date("2026-08-01T08:01:02.000Z"),
      });
      const fetch = await reserve(fetchTask, "fetch", "source", new Date("2026-08-01T08:02:00.000Z"));
      const publishingSuccessor = await reserve(fetchTask, "persist", "successor", new Date("2026-08-01T08:02:01.000Z"));
      await markGenerationQueueStagePublished(db, {
        assignmentKey: publishingSuccessor.assignmentKey,
        redisJobId: publishingSuccessor.redisJobId!,
        now: new Date("2026-08-01T08:02:02.000Z"),
      });
      const invalidFetch = await reserve(invalidTask, "fetch", "source", new Date("2026-08-01T08:03:00.000Z"));
      await reserve(invalidTask, "poll", "not-a-successor", new Date("2026-08-01T08:03:01.000Z"));
      const failedSource = await reserve(failedTask, "submit", "source", new Date("2026-08-01T08:04:00.000Z"));
      const failedSuccessor = await reserve(failedTask, "fetch", "successor", new Date("2026-08-01T08:04:01.000Z"));
      await releaseGenerationQueueStage(db, {
        assignmentKey: failedSuccessor.assignmentKey,
        reason: "failed",
        now: new Date("2026-08-01T08:04:02.000Z"),
      });

      assert.equal(await hasRecoverableGenerationQueueSuccessor(db, {
        taskId: submitTask,
        sourceAssignmentKey: submit.assignmentKey,
      }), true);
      assert.equal(await hasRecoverableGenerationQueueSuccessor(db, {
        taskId: pollTask,
        sourceAssignmentKey: poll.assignmentKey,
      }), true);
      assert.equal(await hasRecoverableGenerationQueueSuccessor(db, {
        taskId: fetchTask,
        sourceAssignmentKey: fetch.assignmentKey,
      }), true);
      assert.equal(await hasRecoverableGenerationQueueSuccessor(db, {
        taskId: invalidTask,
        sourceAssignmentKey: invalidFetch.assignmentKey,
      }), false);
      assert.equal(await hasRecoverableGenerationQueueSuccessor(db, {
        taskId: failedTask,
        sourceAssignmentKey: failedSource.assignmentKey,
      }), false);
    } finally {
      await db.close();
    }
  });

  it("records durable job cancellation before task deletion removes assignments", async () => {
    const db = await createShardTestDb();
    const task = "50000000-0000-4000-8000-000000000004";
    try {
      const assignment = await reserveGenerationQueueStageForPublish(db, {
        assignmentKey: `delete:${task}`,
        taskId: task,
        mediaType: "image",
        stage: "submit",
        routeKey: "provider-delete|executor|account",
        redisJobId: `generation.task.created__${task}__submit`,
        now: new Date("2026-07-24T00:01:00.000Z"),
      });
      await db.query("DELETE FROM tasks WHERE id = $1", [task]);
      const state = await db.query<{ admitted_count: number; assignments: number }>(`
        SELECT shard.admitted_count,
          (SELECT count(*)::int FROM generation_queue_stage_assignments WHERE shard_id = shard.id) AS assignments
        FROM generation_queue_shards shard
        WHERE shard.id = $1
      `, [assignment.shardId]);
      assert.deepEqual(state.rows[0], { admitted_count: 0, assignments: 0 });
      const cancellation = await db.query<{
        queue_name: string;
        redis_job_id: string;
        status: string;
        origin_assignment_status: string;
        publish_fence_until: Date | string;
        created_at: Date | string;
      }>(`
        SELECT queue_name, redis_job_id, status, origin_assignment_status,
               publish_fence_until, created_at
        FROM generation_queue_job_cancellations
        WHERE assignment_key = $1
      `, [assignment.assignmentKey]);
      assert.equal(cancellation.rows[0]?.queue_name, assignment.queueName);
      assert.equal(cancellation.rows[0]?.redis_job_id, `generation.task.created__${task}__submit`);
      assert.equal(cancellation.rows[0]?.status, "pending");
      assert.equal(cancellation.rows[0]?.origin_assignment_status, "publishing");
      const publishFenceUntil = cancellation.rows[0]!.publish_fence_until;
      const cancellationCreatedAt = cancellation.rows[0]!.created_at;
      assert.ok(
        (publishFenceUntil instanceof Date ? publishFenceUntil : new Date(publishFenceUntil)).getTime()
          > (cancellationCreatedAt instanceof Date ? cancellationCreatedAt : new Date(cancellationCreatedAt)).getTime(),
      );
      assert.equal(
        await retireIdleGenerationQueueShards(db, new Date("2099-01-01T00:00:00.000Z")),
        0,
      );
      await db.query(`
        UPDATE generation_queue_job_cancellations
        SET status = 'completed', completed_at = now(), updated_at = now()
        WHERE assignment_key = $1
      `, [assignment.assignmentKey]);
      const canceledPublish = await markGenerationQueueStagePublished(db, {
        assignmentKey: assignment.assignmentKey,
        redisJobId: `generation.task.created__${task}__submit`,
        now: new Date("2026-07-24T00:02:00.000Z"),
      });
      assert.equal(canceledPublish.assignmentStatus, "canceled");
      const reactivated = await db.query<{ status: string; completed_at: Date | string | null }>(`
        SELECT status, completed_at
        FROM generation_queue_job_cancellations
        WHERE assignment_key = $1
      `, [assignment.assignmentKey]);
      assert.deepEqual(reactivated.rows[0], { status: "pending", completed_at: null });
      await assert.rejects(
        markGenerationQueueStagePublished(db, {
          assignmentKey: assignment.assignmentKey,
          redisJobId: "mismatched-deleted-job",
          now: new Date("2026-07-24T00:02:01.000Z"),
        }),
        /generation_queue_assignment_redis_job_id_mismatch/,
      );
      await db.query(`
        UPDATE generation_queue_job_cancellations
        SET status = 'completed', completed_at = now(), updated_at = now()
        WHERE assignment_key = $1
      `, [assignment.assignmentKey]);
      assert.equal(
        await retireIdleGenerationQueueShards(db, new Date("2099-01-01T00:00:00.000Z")),
        1,
      );
    } finally {
      await db.close();
    }
  });

  it("releases project assignments before project task deletion", async () => {
    const db = await createShardTestDb();
    const projectId = "30000000-0000-4000-8000-000000009999";
    const task = "50000000-0000-4000-8000-000000000005";
    try {
      await db.query(`
        INSERT INTO users (id, phone_e164, status)
        VALUES ('00000000-0000-4000-8000-000000009999', '13800139999', 'active');
        INSERT INTO projects (
          id, name, aspect_ratio, resolution, phase, owner_user_id, created_by_user_id
        ) VALUES (
          '30000000-0000-4000-8000-000000009999',
          'Queue lifecycle project', '16:9', '1080p', 'script_input',
          '00000000-0000-4000-8000-000000009999',
          '00000000-0000-4000-8000-000000009999'
        );
      `);
      await db.query("UPDATE tasks SET project_id = $1 WHERE id = $2", [projectId, task]);
      const assignment = await reserveGenerationQueueStageForPublish(db, {
        assignmentKey: `project-delete:${task}`,
        taskId: task,
        mediaType: "video",
        stage: "fetch",
        routeKey: "provider-project-delete|executor|account",
        redisJobId: `generation.video.fetch__${task}`,
        now: new Date("2026-07-24T00:02:00.000Z"),
      });
      const released = await db.query<{ count: number }>(
        "SELECT release_generation_queue_assignments_for_project($1, 'project_deleted', $2)::int AS count",
        [projectId, new Date("2026-07-24T00:03:00.000Z")],
      );
      const state = await db.query<{ status: string; admitted_count: number }>(`
        SELECT assignment.status, shard.admitted_count
        FROM generation_queue_stage_assignments assignment
        JOIN generation_queue_shards shard ON shard.id = assignment.shard_id
        WHERE assignment.assignment_key = $1
      `, [assignment.assignmentKey]);
      assert.equal(released.rows[0]?.count, 1);
      assert.deepEqual(state.rows[0], { status: "released", admitted_count: 0 });
      await db.query("DELETE FROM tasks WHERE id = $1", [task]);
      const cancellation = await db.query<{
        origin_assignment_status: string;
        fenced: boolean;
      }>(`
        SELECT origin_assignment_status,
               publish_fence_until > created_at AS fenced
        FROM generation_queue_job_cancellations
        WHERE assignment_key = $1
      `, [assignment.assignmentKey]);
      assert.deepEqual(cancellation.rows[0], {
        origin_assignment_status: "publishing",
        fenced: true,
      });
    } finally {
      await db.close();
    }
  });

  it("reuses a non-full shard and retires the only shard after it becomes idle", async () => {
    const db = await createShardTestDb();
    const routeKey = "provider-idle|executor|account";
    const firstNow = new Date("2026-07-22T00:00:00.000Z");

    try {
      const first = await assignGenerationQueueStage(db, {
        assignmentKey: "idle:first",
        taskId: taskId(800),
        mediaType: "video",
        stage: "submit",
        routeKey,
        now: firstNow,
      });
      await releaseGenerationQueueStage(db, {
        assignmentKey: first.assignmentKey,
        reason: "completed",
        now: new Date("2026-07-22T00:01:00.000Z"),
      });

      const reused = await assignGenerationQueueStage(db, {
        assignmentKey: "idle:reused",
        taskId: taskId(801),
        mediaType: "video",
        stage: "submit",
        routeKey,
        now: new Date("2026-07-22T00:02:00.000Z"),
      });
      assert.equal(reused.shardNo, 0);
      assert.equal(reused.shardId, first.shardId);
      const discovered = await listGenerationQueueShards(db);
      assert.equal(discovered[0]?.admittedCount, 1);
      assert.equal(
        discovered[0]?.oldestAdmittedAtMs,
        new Date("2026-07-22T00:02:00.000Z").getTime(),
      );

      await releaseGenerationQueueStage(db, {
        assignmentKey: reused.assignmentKey,
        reason: "completed",
        now: new Date("2026-07-22T00:03:00.000Z"),
      });
      const retired = await retireIdleGenerationQueueShards(
        db,
        new Date("2026-07-22T00:04:00.000Z"),
      );
      assert.equal(retired, 1);

      const reactivated = await assignGenerationQueueStage(db, {
        assignmentKey: "idle:replacement",
        taskId: taskId(802),
        mediaType: "video",
        stage: "submit",
        routeKey,
        now: new Date("2026-07-22T00:05:00.000Z"),
      });
      assert.equal(reactivated.shardNo, 0);
      assert.equal(reactivated.shardId, first.shardId);
    } finally {
      await db.close();
    }
  });

  it("reopens a full shard as soon as capacity becomes available", async () => {
    const db = await createShardTestDb();
    const routeKey = "provider-threshold|executor|account";
    const now = new Date("2026-07-22T00:05:00.000Z");
    try {
      const assignments = await Promise.all(Array.from({ length: 600 }, (_, index) =>
        assignGenerationQueueStage(db, {
          assignmentKey: `threshold:${taskId(index)}`,
          taskId: taskId(index), mediaType: "image", stage: "submit", routeKey, now,
          maxActiveShardsPerStage: 2, reopenThreshold: 300,
        }),
      ));
      await releaseGenerationQueueStage(db, {
        assignmentKey: assignments[0].assignmentKey, reason: "completed", now,
        reopenThreshold: 300,
      });
      const next = await assignGenerationQueueStage(db, {
        assignmentKey: "threshold:next", taskId: taskId(700), mediaType: "image", stage: "submit", routeKey, now,
        maxActiveShardsPerStage: 2, reopenThreshold: 300,
      });
      assert.equal(next.shardNo, 0);
      const shards = await db.query<{ shard_no: number; state: string; admitted_count: number }>(
        `SELECT shard_no, state, admitted_count FROM generation_queue_shards ORDER BY shard_no`,
      );
      assert.deepEqual(shards.rows, [{ shard_no: 0, state: "full", admitted_count: 600 }]);
    } finally {
      await db.close();
    }
  });

  it("enforces the active shard limit and retires idle older shards", async () => {
    const db = await createShardTestDb();
    const routeKey = "provider-limit|executor|account";
    const now = new Date("2026-07-22T00:06:00.000Z");
    try {
      const firstBatch = await Promise.all(Array.from({ length: 1_200 }, (_, index) =>
        assignGenerationQueueStage(db, {
          assignmentKey: `limit:${taskId(index)}`,
          taskId: taskId(index), mediaType: "video", stage: "submit", routeKey, now,
          maxActiveShardsPerStage: 2, reopenThreshold: 0,
        }),
      ));
      assert.equal(firstBatch.length, 1_200);
      const shardOne = await db.query<{ id: string }>(`SELECT id::text FROM generation_queue_shards WHERE shard_no = 1`);
      const drained = await db.query<{ drain_generation_queue_shard: boolean }>(
        `SELECT drain_generation_queue_shard($1::uuid, $2)`,
        [shardOne.rows[0].id, now],
      );
      assert.equal(drained.rows[0].drain_generation_queue_shard, true);
      await assert.rejects(
        assignGenerationQueueStage(db, {
          assignmentKey: "limit:overflow", taskId: taskId(1300), mediaType: "video", stage: "submit", routeKey, now,
          maxActiveShardsPerStage: 2, reopenThreshold: 0,
        }),
        /generation_queue_active_shard_limit_reached/,
      );
      const oldestAssignments = await db.query<{ assignment_key: string }>(
        `
          SELECT assignment.assignment_key
          FROM generation_queue_stage_assignments assignment
          JOIN generation_queue_shards shard ON shard.id = assignment.shard_id
          WHERE shard.shard_no = 0
            AND assignment.status = 'admitted'
        `,
      );
      assert.equal(oldestAssignments.rows.length, 600);
      for (const assignment of oldestAssignments.rows) {
        await releaseGenerationQueueStage(db, {
          assignmentKey: assignment.assignment_key, reason: "completed", now,
          reopenThreshold: 0,
        });
      }
      await db.query(`UPDATE generation_queue_shards SET updated_at = $1 WHERE shard_no = 0`, [new Date("2026-07-21T00:00:00.000Z")]);
      const retired = await db.query<{ count: number }>(`SELECT retire_idle_generation_queue_shards($1)::int AS count`, [now]);
      assert.equal(retired.rows[0].count, 1);
      const state = await db.query<{ state: string }>(`SELECT state FROM generation_queue_shards WHERE shard_no = 0`);
      assert.equal(state.rows[0].state, "retired");
    } finally {
      await db.close();
    }
  });
});

async function createShardTestDb() {
  const db = await createMigratedTestDb();
  await db.query(`
    INSERT INTO workflows (id, workflow_type, status, input_snapshot_json)
    VALUES ('40000000-0000-4000-8000-000000009999', 'queue_shard_test', 'running', '{}'::jsonb);
    INSERT INTO tasks (
      id, workflow_id, task_type, status, queue_name, input_snapshot_json,
      target_entity_type, target_entity_id
    )
    SELECT
      ('50000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
      '40000000-0000-4000-8000-000000009999'::uuid,
      'episode_generate_image', 'queued', 'generation-test', '{}'::jsonb,
      'episode', ('60000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid
    FROM generate_series(1, 1401) AS sequence;
  `);
  return db;
}

function taskId(index: number) {
  return `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}
