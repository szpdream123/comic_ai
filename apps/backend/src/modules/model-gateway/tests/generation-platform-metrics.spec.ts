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

      assert.deepEqual(metrics.outbox, { pendingCount: 0, oldestAgeMs: null });
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
});
