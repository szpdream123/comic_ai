import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UnrecoverableError } from "bullmq";

import {
  isUnrecoverableGenerationQueueError,
  isGenerationQueueTerminalStateNoopError,
  runGenerationQueueJobWithRetryPolicy,
  shouldSettleGenerationTaskAfterQueueError,
} from "../generation-queue-retry.policy.ts";

describe("generation queue retry policy", () => {
  it("isolates programming errors without using the remaining BullMQ attempts", async () => {
    await assert.rejects(
      () => runGenerationQueueJobWithRetryPolicy(async () => {
        throw new ReferenceError("findProviderErrorCode is not defined");
      }),
      (error: unknown) => error instanceof UnrecoverableError
        && error.message === "findProviderErrorCode is not defined",
    );

    await assert.rejects(
      () => runGenerationQueueJobWithRetryPolicy(async () => {
        throw new TypeError("Cannot read properties of undefined");
      }),
      UnrecoverableError,
    );
  });

  it("isolates task state conflicts and invalid worker wiring", () => {
    assert.equal(isUnrecoverableGenerationQueueError(new Error("task_finalization_state_conflict")), true);
    assert.equal(isUnrecoverableGenerationQueueError(new Error("provider_request_terminal_state_conflict")), true);
    assert.equal(isUnrecoverableGenerationQueueError(new Error("generation_queue_assignment_already_released")), true);
    assert.equal(isUnrecoverableGenerationQueueError(new Error("gpt_image_poll_processor_missing")), true);
    assert.equal(isUnrecoverableGenerationQueueError(new Error("unsupported_image_provider_executor:unknown")), true);
  });

  it("does not settle the user task when a shard assignment was already released", () => {
    const released = new Error("generation_queue_assignment_already_released");

    assert.equal(shouldSettleGenerationTaskAfterQueueError(released, 1, 1), false);
    assert.equal(shouldSettleGenerationTaskAfterQueueError(new Error("task_finalization_state_conflict"), 1, 3), true);
    assert.equal(shouldSettleGenerationTaskAfterQueueError(new Error("provider temporarily unavailable"), 1, 3), false);
    assert.equal(shouldSettleGenerationTaskAfterQueueError(new Error("provider temporarily unavailable"), 3, 3), true);
  });

  it("treats late terminal-state jobs as successful no-ops", async () => {
    assert.equal(isGenerationQueueTerminalStateNoopError(new Error("task_finalization_state_conflict")), true);
    assert.equal(isGenerationQueueTerminalStateNoopError(new Error("provider_request_terminal_state_conflict")), true);
    assert.equal(await runGenerationQueueJobWithRetryPolicy(async () => {
      throw new Error("task_finalization_state_conflict");
    }), undefined);
  });

  it("keeps provider temporary failures and network errors retryable", async () => {
    const providerError = new Error("provider temporarily unavailable");
    await assert.rejects(
      () => runGenerationQueueJobWithRetryPolicy(async () => { throw providerError; }),
      (error: unknown) => error === providerError,
    );

    const networkError = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("socket closed"), { code: "ECONNRESET" }),
    });
    assert.equal(isUnrecoverableGenerationQueueError(networkError), false);
  });
});
