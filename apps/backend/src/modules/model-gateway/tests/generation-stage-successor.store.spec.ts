import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  confirmGenerationStageSuccessor,
  countMissingGenerationStageSuccessors,
  recordGenerationSkippedSuccessor,
} from "../generation-stage-successor.store.ts";

describe("generation stage successor store", { concurrency: false }, () => {
  it("keeps one successor per poll attempt and exposes stale missing successors", async () => {
    const db = await createMigratedTestDb();
    const taskId = "50000000-0000-4000-8000-000000000521";
    try {
      await seedTask(db, taskId);
      await recordGenerationSkippedSuccessor(db, {
        taskId,
        stage: "poll",
        pollAttempt: 3,
        skipReason: "provider_request_active",
        nextAction: "poll",
        now: new Date("2026-07-22T11:00:00.000Z"),
      });
      await recordGenerationSkippedSuccessor(db, {
        taskId,
        stage: "poll",
        pollAttempt: 3,
        skipReason: "provider_request_active_without_result",
        nextAction: "poll",
        now: new Date("2026-07-22T11:01:00.000Z"),
      });

      assert.equal(await countMissingGenerationStageSuccessors(db, {
        staleBefore: new Date("2026-07-22T11:02:00.000Z"),
      }), 1);

      await confirmGenerationStageSuccessor(db, {
        taskId,
        stage: "poll",
        pollAttempt: 3,
        successorAssignmentKey: "generation.poll:task:4",
        now: new Date("2026-07-22T11:03:00.000Z"),
      });
      const rows = await db.query<{
        count: number | string;
        status: string;
        skip_reason: string;
        successor_assignment_key: string | null;
      }>(`
        SELECT count(*) OVER () AS count, status, skip_reason, successor_assignment_key
        FROM generation_stage_successors
        WHERE task_id = $1
      `, [taskId]);

      assert.equal(Number(rows.rows[0]?.count), 1);
      assert.deepEqual(rows.rows[0], {
        count: "1",
        status: "confirmed",
        skip_reason: "provider_request_active_without_result",
        successor_assignment_key: "generation.poll:task:4",
      });
      assert.equal(await countMissingGenerationStageSuccessors(db, {
        staleBefore: new Date("2026-07-22T12:00:00.000Z"),
      }), 0);
    } finally {
      await db.close();
    }
  });
});

async function seedTask(db: Awaited<ReturnType<typeof createMigratedTestDb>>, taskId: string) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ('70000000-0000-4000-8000-000000000521', '13800138521', 'active')",
  );
  await db.query(`
    INSERT INTO projects (id, name, aspect_ratio, resolution, phase, created_by_user_id, owner_user_id)
    VALUES ('30000000-0000-4000-8000-000000000521', 'Successor', '16:9', '1080p', 'script_input',
      '70000000-0000-4000-8000-000000000521', '70000000-0000-4000-8000-000000000521')
  `);
  await db.query(`
    INSERT INTO workflows (id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id)
    VALUES ('40000000-0000-4000-8000-000000000521', '30000000-0000-4000-8000-000000000521',
      'episode_image_generation', 'running', '{}'::jsonb, '70000000-0000-4000-8000-000000000521')
  `);
  await db.query(`
    INSERT INTO tasks (
      id, project_id, workflow_id, task_type, status, queue_name, input_snapshot_json,
      target_entity_type, target_entity_id
    )
    VALUES ($1::uuid, '30000000-0000-4000-8000-000000000521', '40000000-0000-4000-8000-000000000521',
      'episode_generate_image', 'running', 'generation-poll-image', '{}'::jsonb, 'episode', $1::uuid)
  `, [taskId]);
}
