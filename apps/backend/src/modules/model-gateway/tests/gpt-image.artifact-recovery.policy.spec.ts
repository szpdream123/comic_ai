import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyGptImageArtifactRecoveryFailure,
  isGptImageArtifactRecoveryDue,
  isGptImageArtifactRecoveryExpired,
  parseGptImageArtifactRecoveryState,
  planGptImageArtifactRecovery,
  resolveGptImageArtifactRecoveryDispatch,
} from "../gpt-image-artifact-recovery.policy.ts";

describe("GPT image artifact recovery policy", () => {
  const startedAt = new Date("2026-08-03T10:00:00.000Z");

  it("starts a six-hour recovery window and schedules the second wave after two minutes", () => {
    const decision = planGptImageArtifactRecovery({
      now: startedAt,
      previous: null,
      failure: { failureCode: "provider_output_download_failed", httpStatus: 503 },
    });

    assert.deepEqual(decision, {
      action: "retry",
      state: "retry_pending",
      round: 1,
      startedAt,
      nextRetryAt: new Date("2026-08-03T10:02:00.000Z"),
      deadlineAt: new Date("2026-08-03T16:00:00.000Z"),
      lastFailureCode: "provider_output_download_failed",
      lastErrorMessage: null,
      warning: false,
    });
  });

  it("uses the approved cross-wave delay sequence", () => {
    const delays = [2, 5, 15, 30, 60, 120, 120];
    let previous: unknown = null;
    let now = startedAt;

    for (let index = 0; index < delays.length; index += 1) {
      const decision = planGptImageArtifactRecovery({
        now,
        previous,
        failure: { failureCode: "provider_output_upload_failed" },
      });
      assert.equal(decision.action, "retry");
      if (decision.action !== "retry") continue;
      assert.equal(decision.round, index + 1);
      assert.equal(decision.nextRetryAt.getTime() - now.getTime(), delays[index]! * 60_000);
      assert.equal(decision.warning, decision.round >= 6);
      previous = decision;
      now = decision.nextRetryAt;
    }

    const exhausted = planGptImageArtifactRecovery({
      now,
      previous,
      failure: { failureCode: "provider_output_upload_failed" },
    });
    assert.equal(exhausted.action, "manual_review");
    if (exhausted.action === "manual_review") {
      assert.equal(exhausted.reason, "recovery_exhausted");
      assert.equal(exhausted.round, 8);
    }
  });

  it("does not schedule a retry at or beyond the six-hour deadline", () => {
    const previous = {
      state: "retry_pending",
      round: 6,
      startedAt: startedAt.toISOString(),
      nextRetryAt: "2026-08-03T15:59:00.000Z",
      deadlineAt: "2026-08-03T16:00:00.000Z",
      lastFailureCode: "provider_output_download_failed",
    };
    const decision = planGptImageArtifactRecovery({
      now: new Date("2026-08-03T15:59:00.000Z"),
      previous,
      failure: { failureCode: "provider_output_download_failed", httpStatus: 503 },
    });

    assert.equal(decision.action, "manual_review");
    if (decision.action === "manual_review") {
      assert.equal(decision.reason, "recovery_deadline_reached");
    }
  });

  it("classifies stable client, missing-output, and invalid-media errors as permanent", () => {
    for (const failure of [
      { failureCode: "provider_output_missing" },
      { failureCode: "project_asset_generation_target_missing" },
      { failureCode: "provider_output_persist_failed", message: "project_asset_generation_target_missing" },
      { failureCode: "provider_output_download_failed", httpStatus: 404 },
      { failureCode: "provider_output_download_failed", httpStatus: 410 },
      { failureCode: "provider_output_download_failed", message: "provider_artifact_too_large" },
      { failureCode: "provider_output_download_failed", message: "provider_artifact_mime_invalid" },
      { failureCode: "provider_output_upload_failed", message: "storage_put_object_required" },
    ]) {
      assert.equal(classifyGptImageArtifactRecoveryFailure(failure).kind, "permanent");
    }
  });

  it("keeps timeouts, throttling, and server failures recoverable", () => {
    for (const failure of [
      { failureCode: "provider_output_download_failed", httpStatus: 408 },
      { failureCode: "provider_output_download_failed", httpStatus: 429 },
      { failureCode: "provider_output_download_failed", httpStatus: 503 },
      { failureCode: "provider_output_upload_failed", message: "ConnectTimeoutError" },
      { failureCode: "provider_output_persist_failed", message: "database connection reset" },
    ]) {
      assert.equal(classifyGptImageArtifactRecoveryFailure(failure).kind, "transient");
    }
  });

  it("parses bounded persisted state and evaluates due and expired timestamps", () => {
    const state = parseGptImageArtifactRecoveryState({
      state: "retry_pending",
      round: 3,
      startedAt: "2026-08-03T10:00:00.000Z",
      nextRetryAt: "2026-08-03T10:22:00.000Z",
      deadlineAt: "2026-08-03T16:00:00.000Z",
      lastFailureCode: "provider_output_download_failed",
      lastErrorMessage: "provider_artifact_download_503",
      warning: false,
      ignored: "not projected",
    });

    assert.deepEqual(state, {
      state: "retry_pending",
      round: 3,
      startedAt: new Date("2026-08-03T10:00:00.000Z"),
      nextRetryAt: new Date("2026-08-03T10:22:00.000Z"),
      deadlineAt: new Date("2026-08-03T16:00:00.000Z"),
      lastFailureCode: "provider_output_download_failed",
      lastErrorMessage: "provider_artifact_download_503",
      warning: false,
    });
    assert.equal(isGptImageArtifactRecoveryDue(state, new Date("2026-08-03T10:21:59.999Z")), false);
    assert.equal(isGptImageArtifactRecoveryDue(state, new Date("2026-08-03T10:22:00.000Z")), true);
    assert.equal(isGptImageArtifactRecoveryExpired(state, new Date("2026-08-03T15:59:59.999Z")), false);
    assert.equal(isGptImageArtifactRecoveryExpired(state, new Date("2026-08-03T16:00:00.000Z")), true);
    assert.equal(parseGptImageArtifactRecoveryState({ state: "manual_review", round: 0 }), null);
  });

  it("dispatches legacy and due recoveries without waking waiting or terminal recoveries", () => {
    const now = new Date("2026-08-03T10:10:00.000Z");
    assert.equal(resolveGptImageArtifactRecoveryDispatch(null, now), "dispatch");
    assert.equal(resolveGptImageArtifactRecoveryDispatch({
      state: "retry_pending",
      round: 1,
      startedAt: "2026-08-03T10:00:00.000Z",
      nextRetryAt: "2026-08-03T10:11:00.000Z",
      deadlineAt: "2026-08-03T16:00:00.000Z",
      lastFailureCode: "provider_output_upload_failed",
    }, now), "wait");
    assert.equal(resolveGptImageArtifactRecoveryDispatch({
      state: "retry_pending",
      round: 2,
      startedAt: "2026-08-03T10:00:00.000Z",
      nextRetryAt: "2026-08-03T10:10:00.000Z",
      deadlineAt: "2026-08-03T16:00:00.000Z",
      lastFailureCode: "provider_output_upload_failed",
    }, now), "dispatch");
    assert.equal(resolveGptImageArtifactRecoveryDispatch({
      state: "retry_pending",
      round: 7,
      startedAt: "2026-08-03T04:00:00.000Z",
      nextRetryAt: "2026-08-03T09:59:00.000Z",
      deadlineAt: "2026-08-03T10:00:00.000Z",
      lastFailureCode: "provider_output_upload_failed",
    }, now), "manual_review");
    assert.equal(resolveGptImageArtifactRecoveryDispatch({
      state: "manual_review",
      round: 8,
      startedAt: "2026-08-03T04:00:00.000Z",
      nextRetryAt: null,
      deadlineAt: "2026-08-03T10:00:00.000Z",
      lastFailureCode: "provider_output_upload_failed",
    }, now), "skip");
  });
});
