import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  enqueueDueGenerationPolls,
  scheduleGenerationProviderPoll,
} from "../generation-due-poll.service.ts";

describe("generation due poll scheduler", { concurrency: false }, () => {
  it("claims each due sequence once and writes a unique poll outbox event", async () => {
    const db = await createMigratedTestDb();
    const now = new Date("2026-07-22T12:00:00.000Z");
    const taskId = "50000000-0000-4000-8000-000000000501";
    try {
      await seedDuePollTask(db, taskId);
      await scheduleGenerationProviderPoll(db, {
        taskId,
        nextPollAttempt: 1,
        nextPollAt: new Date(now.getTime() - 1),
        pollDeadlineAt: new Date(now.getTime() + 60_000),
        now,
      });

      const first = await enqueueDueGenerationPolls(db, {
        now,
        limit: 10,
        maxAttempts: { image: 5, video: 5, audio: 5 },
      });
      const duplicate = await enqueueDueGenerationPolls(db, {
        now,
        limit: 10,
        maxAttempts: { image: 5, video: 5, audio: 5 },
      });
      const events = await db.query<{
        dedupe_key: string;
        payload_json: { pollAttempt?: number; mediaType?: string };
      }>(
        `
          SELECT dedupe_key, payload_json
          FROM outbox_events
          WHERE event_type = 'generation.task.poll_requested'
          ORDER BY created_at, id
        `,
      );
      const request = await db.query<{ poll_sequence: number; next_poll_at: Date | null }>(
        "SELECT poll_sequence, next_poll_at FROM provider_requests WHERE task_id = $1",
        [taskId],
      );

      assert.deepEqual(first.enqueuedTaskIds, [taskId]);
      assert.deepEqual(duplicate.enqueuedTaskIds, []);
      assert.deepEqual(events.rows, [{
        dedupe_key: `generation.task.poll_requested:${taskId}:1`,
        payload_json: { mediaType: "image", modelCode: "gpt-image-2-cn", pollAttempt: 1, providerExecutor: "gpt-image-2", taskId, workflowId: "40000000-0000-4000-8000-000000000501" },
      }]);
      assert.equal(Number(request.rows[0]?.poll_sequence), 1);
      assert.equal(request.rows[0]?.next_poll_at, null);
    } finally {
      await db.close();
    }
  });

  it("enqueues a projectless team asset poll under the workflow creator", async () => {
    const db = await createMigratedTestDb();
    const now = new Date("2026-07-22T12:00:00.000Z");
    const taskId = "50000000-0000-4000-8000-000000000503";
    const userId = "70000000-0000-4000-8000-000000000503";
    const workflowId = "40000000-0000-4000-8000-000000000503";
    const assetId = "60000000-0000-4000-8000-000000000503";
    try {
      await seedProjectlessTeamAssetPollTask(db, { taskId, userId, workflowId, assetId });
      await scheduleGenerationProviderPoll(db, {
        taskId,
        nextPollAttempt: 1,
        nextPollAt: new Date(now.getTime() - 1),
        pollDeadlineAt: new Date(now.getTime() + 60_000),
        now,
      });

      const result = await enqueueDueGenerationPolls(db, {
        now,
        limit: 10,
        maxAttempts: { image: 5, video: 5, audio: 5 },
      });
      const event = await db.query<{
        user_id: string | null;
        payload_json: { taskId?: string; workflowId?: string };
      }>(
        `
          SELECT user_id, payload_json
          FROM outbox_events
          WHERE event_type = 'generation.task.poll_requested'
            AND payload_json->>'taskId' = $1
        `,
        [taskId],
      );

      assert.deepEqual(result.enqueuedTaskIds, [taskId]);
      assert.equal(event.rows[0]?.user_id, userId);
      assert.equal(event.rows[0]?.payload_json.taskId, taskId);
      assert.equal(event.rows[0]?.payload_json.workflowId, workflowId);
    } finally {
      await db.close();
    }
  });

  it("rolls back the claim when successor creation fails", async () => {
    const db = await createMigratedTestDb();
    const now = new Date("2026-07-22T12:00:00.000Z");
    const taskId = "50000000-0000-4000-8000-000000000502";
    try {
      await seedDuePollTask(db, taskId);
      await db.query("UPDATE tasks SET task_type = 'unsupported_generation_type' WHERE id = $1", [taskId]);
      await scheduleGenerationProviderPoll(db, {
        taskId,
        nextPollAttempt: 1,
        nextPollAt: new Date(now.getTime() - 1),
        pollDeadlineAt: new Date(now.getTime() + 60_000),
        now,
      });

      await assert.rejects(
        enqueueDueGenerationPolls(db, {
          now,
          limit: 1,
          maxAttempts: { image: 5, video: 5, audio: 5 },
        }),
        /generation_due_poll_unsupported_task_type/,
      );

      const request = await db.query<{ poll_sequence: number; next_poll_at: Date | string | null }>(
        "SELECT poll_sequence, next_poll_at FROM provider_requests WHERE task_id = $1",
        [taskId],
      );
      const events = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'generation.task.poll_requested'",
      );
      assert.equal(Number(request.rows[0]?.poll_sequence), 0);
      assert.ok(request.rows[0]?.next_poll_at);
      assert.equal(events.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });
});

async function seedDuePollTask(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  taskId: string,
) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ('70000000-0000-4000-8000-000000000501', '13800138501', 'active')",
  );
  await db.query(`
    INSERT INTO projects (id, name, aspect_ratio, resolution, phase, created_by_user_id, owner_user_id)
    VALUES ('30000000-0000-4000-8000-000000000501', 'Due poll', '16:9', '1080p', 'script_input',
      '70000000-0000-4000-8000-000000000501', '70000000-0000-4000-8000-000000000501')
  `);
  await db.query(`
    INSERT INTO workflows (id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id)
    VALUES ('40000000-0000-4000-8000-000000000501', '30000000-0000-4000-8000-000000000501',
      'episode_image_generation', 'running', '{}'::jsonb, '70000000-0000-4000-8000-000000000501')
  `);
  await db.query(
    `
      INSERT INTO tasks (
        id, project_id, workflow_id, task_type, status, queue_name, input_snapshot_json,
        target_entity_type, target_entity_id
      )
      VALUES ($1::uuid, '30000000-0000-4000-8000-000000000501', '40000000-0000-4000-8000-000000000501',
        'episode_generate_image', 'running', 'generation-poll-image',
        '{"model":"gpt-image-2-cn","providerExecutor":"gpt-image-2"}'::jsonb, 'episode', $1::uuid)
    `,
    [taskId],
  );
  await db.query(
    `
      INSERT INTO provider_requests (
        id, project_id, workflow_id, task_id, provider_name, provider_operation,
        request_key, request_hash, payload_ref, payload_hash, payload_redacted_json,
        status, external_submission_started_at, external_request_id, created_by_user_id
      )
      VALUES ('52000000-0000-4000-8000-000000000501', '30000000-0000-4000-8000-000000000501',
        '40000000-0000-4000-8000-000000000501', $1::uuid, 'test-provider', 'image.generate',
        $1::text, 'request-hash', 'payload-ref', 'payload-hash', '{}'::jsonb,
        'running', '2026-07-22T11:59:00.000Z', 'external-501', '70000000-0000-4000-8000-000000000501')
    `,
    [taskId],
  );
}

async function seedProjectlessTeamAssetPollTask(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: { taskId: string; userId: string; workflowId: string; assetId: string },
) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138503', 'active')",
    [input.userId],
  );
  await db.query(
    `
      INSERT INTO team_assets (
        id, admin_user_id, asset_name, asset_prompt, asset_category, asset_status,
        resource_type, created_by_name, updated_by_name, created_user_id
      )
      VALUES ($1, $2, 'Projectless asset', 'Projectless team asset poll', 'character',
        'generating', 'image/png', 'Admin', 'Admin', $2)
    `,
    [input.assetId, input.userId],
  );
  await db.query(
    `
      INSERT INTO workflows (id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id)
      VALUES ($1, NULL, 'episode_image_generation', 'running', '{}'::jsonb, $2)
    `,
    [input.workflowId, input.userId],
  );
  await db.query(
    `
      INSERT INTO tasks (
        id, project_id, workflow_id, task_type, status, queue_name, input_snapshot_json,
        target_entity_type, target_entity_id
      )
      VALUES ($1, NULL, $2, 'episode_generate_image', 'running', 'generation-poll-image',
        '{"model":"gpt-image-2-cn","providerExecutor":"gpt-image-2"}'::jsonb, 'team_asset', $3)
    `,
    [input.taskId, input.workflowId, input.assetId],
  );
  await db.query(
    `
      INSERT INTO provider_requests (
        id, project_id, workflow_id, task_id, provider_name, provider_operation,
        request_key, request_hash, payload_ref, payload_hash, payload_redacted_json,
        status, external_submission_started_at, external_request_id, created_by_user_id
      )
      VALUES ('52000000-0000-4000-8000-000000000503', NULL, $1, $2, 'test-provider', 'image.generate',
        $4, 'request-hash', 'payload-ref', 'payload-hash', '{}'::jsonb,
        'running', '2026-07-22T11:59:00.000Z', 'external-503', $3)
    `,
    [input.workflowId, input.taskId, input.userId, input.taskId],
  );
}
