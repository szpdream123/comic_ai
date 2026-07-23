import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  inspectTaskCenterRuntimeMetrics,
  recordTaskCenterQuery,
  resetTaskCenterRuntimeMetricsForTests,
} from "../task-center-observability.ts";

describe("task center observability", () => {
  afterEach(() => resetTaskCenterRuntimeMetricsForTests());

  it("reports bounded one-minute query and incremental polling metrics", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    recordTaskCenterQuery({ completedAt: now, durationMs: 10, mode: "full", rowsReturned: 20 });
    recordTaskCenterQuery({ completedAt: now, durationMs: 40, mode: "incremental", rowsReturned: 2 });

    assert.deepEqual(inspectTaskCenterRuntimeMetrics(now), {
      windowSeconds: 60,
      requestCount: 2,
      requestsPerSecond: 2 / 60,
      p95Ms: 40,
      p99Ms: 40,
      rowsReturned: 22,
      incrementalRequestCount: 1,
      totalRequestCount: 2,
      totalIncrementalRequestCount: 1,
      coordinationWriteCount: 0,
    });
  });

  it("expires old samples without losing cumulative request counts", () => {
    recordTaskCenterQuery({
      completedAt: new Date("2026-07-22T11:58:00.000Z"),
      durationMs: 20,
      mode: "incremental",
      rowsReturned: 1,
    });

    const metrics = inspectTaskCenterRuntimeMetrics(new Date("2026-07-22T12:00:00.000Z"));
    assert.equal(metrics.requestCount, 0);
    assert.equal(metrics.totalRequestCount, 1);
    assert.equal(metrics.totalIncrementalRequestCount, 1);
  });
});
