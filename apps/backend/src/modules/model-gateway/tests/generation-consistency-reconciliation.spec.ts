import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { reconcileGenerationSurfaceConsistency } from "../generation-consistency-reconciliation.service.ts";

describe("generation consistency reconciliation", { concurrency: false }, () => {
  it("runs all reconciliation queries against the current schema when there is no backlog", async () => {
    const db = await createMigratedTestDb();
    try {
      const result = await reconcileGenerationSurfaceConsistency(db, {
        now: new Date("2026-08-10T00:00:00.000Z"),
        limit: 25,
      });
      assert.deepEqual(result, {
        providerRequestIds: [],
        ambiguousTaskIds: [],
        snapshotTaskIds: [],
        canvasRunIds: [],
        agentTaskIds: [],
        agentStepIds: [],
        workflowIds: [],
      });
    } finally {
      await db.close();
    }
  });

  it("converges locally terminal tasks only when the provider submission is ambiguous", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedAmbiguousProviderTasks(db);
      const now = new Date("2026-08-10T00:00:00.000Z");

      const result = await reconcileGenerationSurfaceConsistency(db, { now, limit: 25 });
      assert.deepEqual(result.ambiguousTaskIds.sort(), [
        "50000000-0000-4000-8000-000000000201",
        "50000000-0000-4000-8000-000000000202",
      ]);
      assert.deepEqual(result.snapshotTaskIds.sort(), [
        "50000000-0000-4000-8000-000000000201",
        "50000000-0000-4000-8000-000000000202",
      ]);

      const state = await db.query<{
        task_id: string;
        task_status: string;
        attempt_status: string;
        snapshot_status: string;
        workflow_status: string;
      }>(`
        SELECT task.id AS task_id, task.status AS task_status,
               attempt.status AS attempt_status, snapshot.status AS snapshot_status,
               workflow.status AS workflow_status
        FROM tasks task
        JOIN task_attempts attempt ON attempt.task_id = task.id
        JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
        JOIN workflows workflow ON workflow.id = task.workflow_id
        ORDER BY task.id
      `);
      assert.deepEqual(state.rows, [
        {
          task_id: "50000000-0000-4000-8000-000000000201",
          task_status: "result_unknown",
          attempt_status: "result_unknown",
          snapshot_status: "result_unknown",
          workflow_status: "result_unknown",
        },
        {
          task_id: "50000000-0000-4000-8000-000000000202",
          task_status: "manual_review_required",
          attempt_status: "manual_review_required",
          snapshot_status: "manual_review_required",
          workflow_status: "manual_review_required",
        },
        {
          task_id: "50000000-0000-4000-8000-000000000203",
          task_status: "failed",
          attempt_status: "failed",
          snapshot_status: "failed",
          workflow_status: "failed",
        },
      ]);
    } finally {
      await db.close();
    }
  });
});

async function seedAmbiguousProviderTasks(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await db.query(`
    INSERT INTO users (id, phone_e164, status)
    VALUES ('00000000-0000-4000-8000-000000000201', '13800138201', 'active');
    INSERT INTO projects (
      id, name, aspect_ratio, resolution, phase, owner_user_id, created_by_user_id
    ) VALUES (
      '30000000-0000-4000-8000-000000000201', 'Consistency Test Project', '16:9', '1080p',
      'script_input', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000201'
    );
    INSERT INTO workflows (
      id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id
    ) VALUES
      ('40000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000201', 'episode_video_generation', 'failed', '{}'::jsonb, '00000000-0000-4000-8000-000000000201'),
      ('40000000-0000-4000-8000-000000000202', '30000000-0000-4000-8000-000000000201', 'episode_video_generation', 'failed', '{}'::jsonb, '00000000-0000-4000-8000-000000000201'),
      ('40000000-0000-4000-8000-000000000203', '30000000-0000-4000-8000-000000000201', 'episode_video_generation', 'failed', '{}'::jsonb, '00000000-0000-4000-8000-000000000201');
    INSERT INTO tasks (
      id, project_id, workflow_id, task_type, status, queue_name,
      input_snapshot_json, target_entity_type, target_entity_id, failure_code
    ) VALUES
      ('50000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000201', 'episode_generate_video', 'failed', 'generation-submit-video', '{}'::jsonb, 'episode', '60000000-0000-4000-8000-000000000201', 'provider_failed'),
      ('50000000-0000-4000-8000-000000000202', '30000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000202', 'episode_generate_video', 'canceled', 'generation-submit-video', '{}'::jsonb, 'episode', '60000000-0000-4000-8000-000000000202', 'provider_failed'),
      ('50000000-0000-4000-8000-000000000203', '30000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000203', 'episode_generate_video', 'failed', 'generation-submit-video', '{}'::jsonb, 'episode', '60000000-0000-4000-8000-000000000203', 'provider_failed');
    INSERT INTO task_attempts (
      id, project_id, workflow_id, task_id, attempt_number, status, failure_code
    ) VALUES
      ('51000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000201', '50000000-0000-4000-8000-000000000201', 1, 'failed', 'provider_failed'),
      ('51000000-0000-4000-8000-000000000202', '30000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000202', '50000000-0000-4000-8000-000000000202', 1, 'canceled', 'provider_failed'),
      ('51000000-0000-4000-8000-000000000203', '30000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000203', '50000000-0000-4000-8000-000000000203', 1, 'failed', 'provider_failed');
    UPDATE tasks
    SET current_attempt_id = task_attempts.id, attempt_count = 1
    FROM task_attempts
    WHERE tasks.id = task_attempts.task_id;
    INSERT INTO provider_requests (
      id, project_id, workflow_id, task_id, attempt_id, provider_name,
      provider_operation, request_key, request_hash, payload_ref, payload_hash,
      payload_redacted_json, status, external_submission_started_at,
      external_request_id, response_redacted_json, created_by_user_id
    ) VALUES
      ('52000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000201', '50000000-0000-4000-8000-000000000201', '51000000-0000-4000-8000-000000000201', 'test-provider', 'video.generate', 'consistency-201', 'consistency-201', 'consistency-201', 'consistency-201', '{}'::jsonb, 'running', '2026-08-09T23:00:00.000Z', 'external-201', '{}'::jsonb, '00000000-0000-4000-8000-000000000201'),
      ('52000000-0000-4000-8000-000000000202', '30000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000202', '50000000-0000-4000-8000-000000000202', '51000000-0000-4000-8000-000000000202', 'test-provider', 'video.generate', 'consistency-202', 'consistency-202', 'consistency-202', 'consistency-202', '{}'::jsonb, 'manual_review_required', '2026-08-09T23:00:00.000Z', 'external-202', '{}'::jsonb, '00000000-0000-4000-8000-000000000201'),
      ('52000000-0000-4000-8000-000000000203', '30000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000203', '50000000-0000-4000-8000-000000000203', '51000000-0000-4000-8000-000000000203', 'test-provider', 'video.generate', 'consistency-203', 'consistency-203', 'consistency-203', 'consistency-203', '{}'::jsonb, 'running', '2026-08-09T23:00:00.000Z', 'external-203', '{"httpStatus":400}'::jsonb, '00000000-0000-4000-8000-000000000201');
    INSERT INTO ai_generation_task_snapshots (
      id, user_id, project_id, target_type, target_id, workflow_id, task_id,
      model_code, media_type, task_mode, status, progress_stage, credit_status, submitted_at
    ) VALUES
      ('90000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000201', 'episode', '60000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000201', '50000000-0000-4000-8000-000000000201', 'test-video', 'video', 'video.generate', 'failed', 'failed', 'not_required', '2026-08-09T23:00:00.000Z'),
      ('90000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000201', 'episode', '60000000-0000-4000-8000-000000000202', '40000000-0000-4000-8000-000000000202', '50000000-0000-4000-8000-000000000202', 'test-video', 'video', 'video.generate', 'canceled', 'canceled', 'not_required', '2026-08-09T23:00:00.000Z'),
      ('90000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000201', 'episode', '60000000-0000-4000-8000-000000000203', '40000000-0000-4000-8000-000000000203', '50000000-0000-4000-8000-000000000203', 'test-video', 'video', 'video.generate', 'failed', 'failed', 'not_required', '2026-08-09T23:00:00.000Z');
  `);
}
