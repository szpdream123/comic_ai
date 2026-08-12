import assert from "node:assert/strict";
import test from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
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

test("skipped coordinator ignores provider work from a historical attempt", async () => {
  const db = await createMigratedTestDb();

  try {
    await db.query(`
      INSERT INTO workflows (id, workflow_type, status, input_snapshot_json)
      VALUES ('40000000-0000-4000-8000-000000000701', 'episode_image_generation', 'running', '{}'::jsonb);
      INSERT INTO tasks (
        id, workflow_id, task_type, status, queue_name, input_snapshot_json,
        target_entity_type, target_entity_id
      ) VALUES (
        '50000000-0000-4000-8000-000000000701',
        '40000000-0000-4000-8000-000000000701',
        'episode_generate_image', 'running', 'generation-submit-image',
        '{}'::jsonb, 'asset', '50000000-0000-4000-8000-000000000701'
      );
      INSERT INTO task_attempts (
        id, workflow_id, task_id, attempt_number, status, started_at
      ) VALUES (
        '61000000-0000-4000-8000-000000000701',
        '40000000-0000-4000-8000-000000000701',
        '50000000-0000-4000-8000-000000000701', 1, 'failed',
        '2026-08-11T05:00:00.000Z'
      ), (
        '62000000-0000-4000-8000-000000000701',
        '40000000-0000-4000-8000-000000000701',
        '50000000-0000-4000-8000-000000000701', 2, 'running',
        '2026-08-11T06:00:00.000Z'
      );
      UPDATE tasks
      SET current_attempt_id = '62000000-0000-4000-8000-000000000701',
          attempt_count = 2
      WHERE id = '50000000-0000-4000-8000-000000000701';
      INSERT INTO provider_requests (
        id, workflow_id, task_id, attempt_id, provider_name, provider_operation,
        request_key, request_hash, payload_ref, payload_hash, status,
        external_submission_started_at, external_request_id, response_redacted_json
      ) VALUES (
        '80000000-0000-4000-8000-000000000701',
        '40000000-0000-4000-8000-000000000701',
        '50000000-0000-4000-8000-000000000701',
        '61000000-0000-4000-8000-000000000701',
        'test', 'episode.image.generate', 'historical-701', 'historical-701',
        'historical-701', 'historical-701', 'succeeded',
        '2026-08-11T05:01:00.000Z', 'external-historical-701',
        '{"artifact":{"mediaType":"image","url":"https://cdn.example.test/historical.png"}}'::jsonb
      );
    `);

    assert.equal(await resolveGenerationSkippedNextAction(db, {
      taskId: "50000000-0000-4000-8000-000000000701",
    }), "stop");

    await db.query(`
      UPDATE tasks
      SET current_attempt_id = '61000000-0000-4000-8000-000000000701',
          attempt_count = 1
      WHERE id = '50000000-0000-4000-8000-000000000701';
      UPDATE provider_requests
      SET attempt_id = NULL
      WHERE id = '80000000-0000-4000-8000-000000000701';
    `);
    assert.equal(await resolveGenerationSkippedNextAction(db, {
      taskId: "50000000-0000-4000-8000-000000000701",
    }), "finalize");
  } finally {
    await db.close();
  }
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
