import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  assignGenerationQueueStage,
  buildGenerationQueueName,
  createGenerationQueueRouteCode,
  generationQueueShardCapacity,
  generationQueueShardRateLimitDurationMs,
  generationQueueShardRateLimitMax,
  releaseGenerationQueueStage,
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

  it("does not reopen a full shard until the configured threshold", async () => {
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
      assert.equal(next.shardNo, 1);
      for (let index = 1; index <= 299; index += 1) {
        await releaseGenerationQueueStage(db, {
          assignmentKey: assignments[index].assignmentKey, reason: "completed", now,
          reopenThreshold: 300,
        });
      }
      const reopened = await db.query<{ state: string; admitted_count: number }>(
        `SELECT state, admitted_count FROM generation_queue_shards WHERE shard_no = 0`,
      );
      assert.deepEqual(reopened.rows[0], { state: "accepting", admitted_count: 300 });
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
  const migration = await readFile(
    join(process.cwd(), "packages", "db", "migrations", "20260722-generation-queue-elastic-shards.sql"),
    "utf8",
  );
  await db.query(migration);
  return db;
}

function taskId(index: number) {
  return `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}
