import assert from "node:assert/strict";
import { it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  inspectCanvasCanaryMetrics,
  recordCanvasCanaryRuntimeMetric,
  resetCanvasCanaryRuntimeMetricsForTest,
} from "../canvas-canary-metrics.service.ts";

it("aggregates Canvas canary runtime and durable release signals", async () => {
  const db = await createMigratedTestDb();
  resetCanvasCanaryRuntimeMetricsForTest();
  try {
    recordCanvasCanaryRuntimeMetric("save_attempt");
    recordCanvasCanaryRuntimeMetric("save_attempt");
    recordCanvasCanaryRuntimeMetric("save_conflict");
    recordCanvasCanaryRuntimeMetric("sse_connect");
    recordCanvasCanaryRuntimeMetric("sse_resume");
    recordCanvasCanaryRuntimeMetric("frontend_error");
    const metrics = await inspectCanvasCanaryMetrics(db, {
      now: new Date("2026-07-26T12:00:00.000Z"),
      windowHours: 24,
    });

    assert.equal(metrics.runtime.saveConflictRate, 0.5);
    assert.equal(metrics.runtime.sseResumeRate, 1);
    assert.equal(metrics.runtime.frontendErrors, 1);
    assert.deepEqual(metrics.batches, { total: 0, succeeded: 0, partial: 0, failed: 0, active: 0, successRate: 0 });
    assert.deepEqual(metrics.recovery, { retriedTasks: 0, recoveredTasks: 0, recoveryRate: 0 });
    assert.deepEqual(metrics.integrity, { duplicateProviderRequestKeys: 0, unsettledReservations: 0 });
    assert.equal(metrics.agent.policyDenyCount, 0);
  } finally {
    resetCanvasCanaryRuntimeMetricsForTest();
    await db.close();
  }
});
