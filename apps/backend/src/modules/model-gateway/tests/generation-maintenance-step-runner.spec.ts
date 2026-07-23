import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GenerationMaintenanceStepTimeoutError,
  runIsolatedGenerationMaintenanceStep,
} from "../generation-maintenance-step-runner.ts";

describe("generation maintenance step runner", () => {
  it("isolates a failed step so later work can continue in a fresh context", async () => {
    const calls: string[] = [];
    const errors: string[] = [];
    const runInContext = async <T>(run: () => Promise<T>) => {
      calls.push("context");
      return run();
    };

    const failed = await runIsolatedGenerationMaintenanceStep({
      name: "failed-step",
      runInContext,
      async run() {
        calls.push("failed-step");
        throw new Error("redis unavailable");
      },
      onError(name, error) {
        errors.push(`${name}:${error instanceof Error ? error.message : String(error)}`);
      },
    });
    const succeeded = await runIsolatedGenerationMaintenanceStep({
      name: "next-step",
      runInContext,
      async run() {
        calls.push("next-step");
        return 7;
      },
      onError() {},
    });

    assert.equal(failed, null);
    assert.equal(succeeded, 7);
    assert.deepEqual(calls, ["context", "failed-step", "context", "next-step"]);
    assert.deepEqual(errors, ["failed-step:redis unavailable"]);
  });

  it("aborts and surfaces a never-resolving step so the supervisor can restart the process", async () => {
    let observedSignal: AbortSignal | null = null;
    const startedAt = Date.now();
    await assert.rejects(
      runIsolatedGenerationMaintenanceStep({
        name: "stuck-step",
        timeoutMs: 20,
        runInContext: async (run) => run(),
        run(signal) {
          observedSignal = signal;
          return new Promise(() => undefined);
        },
        onError() {},
      }),
      (error: unknown) => error instanceof GenerationMaintenanceStepTimeoutError
        && error.stepName === "stuck-step"
        && error.timeoutMs === 20,
    );
    assert.equal(observedSignal?.aborted, true);
    assert.ok(Date.now() - startedAt < 1_000);
  });
});
