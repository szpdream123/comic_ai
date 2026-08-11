import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATION_ARTIFACT_FETCH_NOT_READY,
  resolveGenerationArtifactStageUnavailable,
  resolveGenerationArtifactQueueExhaustionFailureCode,
  resolveGenerationSkippedNextAction,
} from "../generation-skipped-coordinator.ts";

function dbReturning(row: Record<string, unknown>) {
  return {
    async query() {
      return { rows: [row] };
    },
  };
}

test("skipped coordinator stops when submission started without an external request id", async () => {
  const action = await resolveGenerationSkippedNextAction(dbReturning({
    task_status: "running",
    provider_request_id: "provider-request-1",
    provider_status: "created",
    external_request_id: null,
    external_submission_started_at: new Date("2026-07-22T00:00:00.000Z"),
    has_artifact: false,
  }), { taskId: "task-1" });
  assert.equal(action, "stop");
});

test("skipped coordinator polls only after the external request id is durable", async () => {
  const action = await resolveGenerationSkippedNextAction(dbReturning({
    task_status: "running",
    provider_request_id: "provider-request-with-id",
    provider_status: "accepted",
    external_request_id: "supplier-task-1",
    external_submission_started_at: new Date("2026-07-22T00:00:00.000Z"),
    has_artifact: false,
  }), { taskId: "task-with-id" });
  assert.equal(action, "poll");
});

test("skipped coordinator sends queued tasks back to the idempotent submit stage", async () => {
  const action = await resolveGenerationSkippedNextAction(dbReturning({
    task_status: "queued",
    provider_request_id: null,
    provider_status: null,
    external_request_id: null,
    external_submission_started_at: null,
    has_artifact: false,
  }), { taskId: "task-2" });
  assert.equal(action, "submit");
});

test("skipped coordinator does not turn an explicit provider failure into another submit", async () => {
  const action = await resolveGenerationSkippedNextAction(dbReturning({
    task_status: "running",
    provider_request_id: "provider-request-failed",
    provider_status: "failed",
    external_request_id: null,
    external_submission_started_at: null,
    has_artifact: false,
  }), { taskId: "task-failed" });
  assert.equal(action, "stop");
});

test("skipped coordinator routes durable provider artifacts to finalization", async () => {
  const action = await resolveGenerationSkippedNextAction(dbReturning({
    task_status: "running",
    provider_request_id: "provider-request-3",
    provider_status: "succeeded",
    external_request_id: "external-3",
    external_submission_started_at: new Date("2026-07-22T00:00:00.000Z"),
    has_artifact: true,
  }), { taskId: "task-3" });
  assert.equal(action, "finalize");
});

test("skipped coordinator stops cancel-requested tasks before provider successors", async () => {
  for (const providerFacts of [
    {
      provider_request_id: "provider-request-cancel-succeeded",
      provider_status: "succeeded",
      external_request_id: "external-cancel-succeeded",
      external_submission_started_at: new Date("2026-08-11T06:00:00.000Z"),
      has_artifact: true,
    },
    {
      provider_request_id: "provider-request-cancel-running",
      provider_status: "running",
      external_request_id: "external-cancel-running",
      external_submission_started_at: new Date("2026-08-11T06:00:00.000Z"),
      has_artifact: false,
    },
    {
      provider_request_id: "provider-request-cancel-created",
      provider_status: "created",
      external_request_id: null,
      external_submission_started_at: null,
      has_artifact: false,
    },
  ]) {
    const action = await resolveGenerationSkippedNextAction(dbReturning({
      task_status: "cancel_requested",
      ...providerFacts,
    }), { taskId: "task-cancel-requested" });
    assert.equal(action, "stop");
  }
});

test("artifact stages retry while durable work is still recoverable", async () => {
  for (const task of [
    { task_status: "running", failure_code: null },
    { task_status: "result_unknown", failure_code: null },
    { task_status: "manual_review_required", failure_code: "provider_output_persist_failed" },
    { task_status: "manual_review_required", failure_code: "generation_queue_error" },
  ]) {
    assert.deepEqual(await resolveGenerationArtifactStageUnavailable(dbReturning(task), {
      taskId: "task-recoverable",
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    }), {
      status: "failed",
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }
});

test("artifact stages skip absent, terminal, or stale durable work", async () => {
  for (const task of [
    null,
    { task_status: "queued", failure_code: null },
    { task_status: "cancel_requested", failure_code: "cancel_requested" },
    { task_status: "succeeded", failure_code: null },
    { task_status: "failed", failure_code: "provider_rejected" },
    { task_status: "canceled", failure_code: "cancel_requested" },
    { task_status: "manual_review_required", failure_code: "provider_output_storage_failed" },
  ]) {
    const db = {
      async query() {
        return { rows: task ? [task] : [] };
      },
    };
    assert.deepEqual(await resolveGenerationArtifactStageUnavailable(db, {
      taskId: "task-terminal",
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    }), { status: "skipped" });
  }
});

test("artifact-not-ready exhaustion remains eligible for maintenance recovery", () => {
  assert.equal(
    resolveGenerationArtifactQueueExhaustionFailureCode(GENERATION_ARTIFACT_FETCH_NOT_READY),
    "generation_queue_error",
  );
  assert.equal(
    resolveGenerationArtifactQueueExhaustionFailureCode("provider_output_upload_failed"),
    "provider_output_storage_failed",
  );
});
