import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGenerationWorkerOperationTracker } from "../generation-worker-operation-tracker.ts";

describe("generation worker operation tracker", () => {
  it("drains operations added while shutdown is already waiting", async () => {
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const first = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<void>((resolve) => { resolveSecond = resolve; });
    const tracker = createGenerationWorkerOperationTracker();
    tracker.track(first);

    let drained = false;
    const draining = tracker.drain().then(() => { drained = true; });
    tracker.track(second);
    resolveFirst();
    await first;
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(drained, false);
    assert.equal(tracker.pendingCount(), 1);
    resolveSecond();
    await draining;
    assert.equal(tracker.pendingCount(), 0);
  });

  it("removes rejected operations without making drain reject", async () => {
    const tracker = createGenerationWorkerOperationTracker();
    tracker.track(Promise.reject(new Error("release failed")));

    await tracker.drain();

    assert.equal(tracker.pendingCount(), 0);
  });
});
