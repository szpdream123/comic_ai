import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { inspectGenerationPlatformMetrics } from "../generation-platform-metrics.service.ts";

describe("generation platform metrics", { concurrency: false }, () => {
  it("returns database queue, poll, webhook, successor, shard, and latency metrics", async () => {
    const db = await createMigratedTestDb();
    try {
      const metrics = await inspectGenerationPlatformMetrics(db, {
        now: new Date("2026-07-22T12:00:00.000Z"),
      });

      assert.equal(metrics.status, "healthy");
      assert.deepEqual(metrics.issues, []);
      assert.deepEqual(metrics.outbox, {
        pendingCount: 0,
        oldestAgeMs: null,
        readyCount: 0,
        processingCount: 0,
        staleProcessingCount: 0,
        oldestReadyAgeMs: null,
        staleAfterMs: 120_000,
        status: "healthy",
        issues: [],
      });
      assert.deepEqual(metrics.polls, { dueCount: 0, overdueDeadlineCount: 0 });
      assert.deepEqual(metrics.webhooks, { pendingCount: 0, unmatchedCount: 0, oldestLagMs: null });
      assert.deepEqual(metrics.tasks, {
        activeCount: 0,
        resultUnknownCount: 0,
        missingSuccessorCount: 0,
      });
      assert.deepEqual(metrics.shards, []);
      assert.deepEqual(metrics.commitToProviderStart, {
        p95Ms: null,
        p99Ms: null,
        sampleCount: 0,
      });
      assert.deepEqual(metrics.providerResultToFetch, {
        p95Ms: null,
        p99Ms: null,
        sampleCount: 0,
      });
      assert.deepEqual(metrics.fetchToPersist, {
        p95Ms: null,
        p99Ms: null,
        sampleCount: 0,
      });
    } finally {
      await db.close();
    }
  });

  it("reports overdue ready and stale processing outbox events as degraded", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        INSERT INTO outbox_events (
          id, event_type, payload_json, status, available_at, created_at, updated_at
        ) VALUES
          ('10000000-0000-4000-8000-000000000001', 'generation.task.created', '{}', 'pending', '2026-07-22T11:59:30.000Z', '2026-07-22T11:59:30.000Z', '2026-07-22T11:59:30.000Z'),
          ('10000000-0000-4000-8000-000000000002', 'generation.task.created', '{}', 'pending', '2026-07-22T11:55:00.000Z', '2026-07-22T11:55:00.000Z', '2026-07-22T11:55:00.000Z'),
          ('10000000-0000-4000-8000-000000000003', 'generation.task.created', '{}', 'failed', '2026-07-22T12:05:00.000Z', '2026-07-22T11:59:00.000Z', '2026-07-22T11:59:00.000Z'),
          ('10000000-0000-4000-8000-000000000004', 'generation.task.created', '{}', 'processing', '2026-07-22T11:59:30.000Z', '2026-07-22T11:59:30.000Z', '2026-07-22T11:59:30.000Z'),
          ('10000000-0000-4000-8000-000000000005', 'generation.task.created', '{}', 'processing', '2026-07-22T11:55:00.000Z', '2026-07-22T11:55:00.000Z', '2026-07-22T11:55:00.000Z')
      `);

      const metrics = await inspectGenerationPlatformMetrics(db, {
        now: new Date("2026-07-22T12:00:00.000Z"),
        outboxStaleMs: 120_000,
      });

      assert.equal(metrics.status, "degraded");
      assert.deepEqual(metrics.issues, ["outbox_ready_stale:2", "outbox_processing_stale:1"]);
      assert.deepEqual(metrics.outbox, {
        pendingCount: 3,
        oldestAgeMs: 300_000,
        readyCount: 2,
        processingCount: 2,
        staleProcessingCount: 1,
        oldestReadyAgeMs: 300_000,
        staleAfterMs: 120_000,
        status: "degraded",
        issues: ["outbox_ready_stale:2", "outbox_processing_stale:1"],
      });
    } finally {
      await db.close();
    }
  });
});
