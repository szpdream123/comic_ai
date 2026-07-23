import assert from "node:assert/strict";
import test from "node:test";

import {
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
