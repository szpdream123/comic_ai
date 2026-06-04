import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  repairQueuedGenerationTaskOutbox,
  repairRunningSeedancePollJobs,
} from "../generation-redis-repair.service.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation Redis dispatch repair", () => {
  it("recreates generation outbox events for stale queued Seedance video tasks", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      const first = await repairQueuedGenerationTaskOutbox(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
      });
      const second = await repairQueuedGenerationTaskOutbox(db, {
        now: new Date("2026-06-03T06:00:30.000Z"),
        limit: 10,
      });
      const outbox = await db.query<{
        organization_id: string;
        event_type: string;
        payload_json: Record<string, unknown>;
      }>(
        `
          SELECT organization_id, event_type, payload_json
          FROM outbox_events
          WHERE event_type = 'generation.task.created'
          ORDER BY created_at ASC
        `,
      );
      const repairedTask = await db.query<{ last_dispatched_at: Date | string | null }>(
        "SELECT last_dispatched_at FROM tasks WHERE id = '50000000-0000-4000-8000-000000000101'",
      );

      assert.deepEqual(first.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000101",
      ]);
      assert.deepEqual(second.repairedTaskIds, []);
      assert.equal(outbox.rows.length, 1);
      assert.equal(outbox.rows[0]?.organization_id, "10000000-0000-4000-8000-000000000101");
      assert.equal(outbox.rows[0]?.event_type, "generation.task.created");
      assert.deepEqual(outbox.rows[0]?.payload_json, {
        workflowId: "40000000-0000-4000-8000-000000000101",
        taskId: "50000000-0000-4000-8000-000000000101",
        mediaType: "video",
        modelCode: "seedance-i2v-pro",
        queueName: "generation-submit-video",
        targetType: "episode",
        targetId: "60000000-0000-4000-8000-000000000101",
        providerExecutor: "seedance",
      });
      assert.equal(
        new Date(repairedTask.rows[0]?.last_dispatched_at ?? 0).toISOString(),
        "2026-06-03T06:00:00.000Z",
      );
    } finally {
      await db.close();
    }
  });

  it("requeues poll jobs for stale running Seedance video tasks with external request ids", async () => {
    const db = await createMigratedTestDb();
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      const first = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
          GENERATION_POLL_VIDEO_INTERVAL_MS: "5000",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });
      const second = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:30.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });

      assert.deepEqual(first.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.deepEqual(second.repairedTaskIds, []);
      assert.equal(added.length, 1);
      assert.deepEqual(added[0], {
        queueName: "generation-poll-video",
        name: "generation.video.poll.repair",
        data: {
          taskId: "50000000-0000-4000-8000-000000000104",
          workflowId: "40000000-0000-4000-8000-000000000104",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          pollAttempt: 1,
        },
        options: {
          jobId: "generation.video.poll.repair__50000000-0000-4000-8000-000000000104__1780466400000",
          delay: 0,
          attempts: 1,
          removeOnComplete: { age: 86400, count: 10000 },
          removeOnFail: { age: 604800, count: 50000 },
        },
      });
    } finally {
      await db.close();
    }
  });
});

async function seedGenerationRepairTasks(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ('10000000-0000-4000-8000-000000000101', 'Generation Repair Org', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        '20000000-0000-4000-8000-000000000101',
        '10000000-0000-4000-8000-000000000101',
        'Generation Repair Workspace',
        'active'
      )
    `,
  );
  await db.query(
    `
      INSERT INTO projects (
        id,
        organization_id,
        workspace_id,
        name,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id
      )
      VALUES (
        '30000000-0000-4000-8000-000000000101',
        '10000000-0000-4000-8000-000000000101',
        '20000000-0000-4000-8000-000000000101',
        'Generation Repair Project',
        '16:9',
        '1080p',
        'script_input',
        NULL
      )
    `,
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json
      )
      VALUES
        (
          '40000000-0000-4000-8000-000000000101',
          '10000000-0000-4000-8000-000000000101',
          '20000000-0000-4000-8000-000000000101',
          '30000000-0000-4000-8000-000000000101',
          'episode_video_generation',
          'queued',
          '{}'::jsonb
        ),
        (
          '40000000-0000-4000-8000-000000000102',
          '10000000-0000-4000-8000-000000000101',
          '20000000-0000-4000-8000-000000000101',
          '30000000-0000-4000-8000-000000000101',
          'episode_video_generation',
          'queued',
          '{}'::jsonb
        ),
        (
          '40000000-0000-4000-8000-000000000103',
          '10000000-0000-4000-8000-000000000101',
          '20000000-0000-4000-8000-000000000101',
          '30000000-0000-4000-8000-000000000101',
          'episode_video_generation',
          'queued',
          '{}'::jsonb
        )
    `,
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        scheduled_at,
        last_dispatched_at,
        input_snapshot_json,
        target_entity_type,
        target_entity_id
      )
      VALUES
        (
          '50000000-0000-4000-8000-000000000101',
          '10000000-0000-4000-8000-000000000101',
          '20000000-0000-4000-8000-000000000101',
          '30000000-0000-4000-8000-000000000101',
          '40000000-0000-4000-8000-000000000101',
          'episode_generate_video',
          'queued',
          'generation-submit-video',
          '2026-06-03T05:55:00.000Z',
          '2026-06-03T05:50:00.000Z',
          '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"seedance","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000101"}'::jsonb,
          'episode',
          '60000000-0000-4000-8000-000000000101'
        ),
        (
          '50000000-0000-4000-8000-000000000102',
          '10000000-0000-4000-8000-000000000101',
          '20000000-0000-4000-8000-000000000101',
          '30000000-0000-4000-8000-000000000101',
          '40000000-0000-4000-8000-000000000102',
          'episode_generate_video',
          'queued',
          'generation-submit-video',
          '2026-06-03T05:55:00.000Z',
          '2026-06-03T05:59:30.000Z',
          '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"seedance","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000102"}'::jsonb,
          'episode',
          '60000000-0000-4000-8000-000000000102'
        ),
        (
          '50000000-0000-4000-8000-000000000103',
          '10000000-0000-4000-8000-000000000101',
          '20000000-0000-4000-8000-000000000101',
          '30000000-0000-4000-8000-000000000101',
          '40000000-0000-4000-8000-000000000103',
          'episode_generate_video',
          'queued',
          'generation-submit-video',
          '2026-06-03T05:55:00.000Z',
          '2026-06-03T05:50:00.000Z',
          '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"mock","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000103"}'::jsonb,
          'episode',
          '60000000-0000-4000-8000-000000000103'
        )
    `,
  );
}

async function seedRunningSeedanceTask(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json
      )
      VALUES (
        '40000000-0000-4000-8000-000000000104',
        '10000000-0000-4000-8000-000000000101',
        '20000000-0000-4000-8000-000000000101',
        '30000000-0000-4000-8000-000000000101',
        'episode_video_generation',
        'running',
        '{}'::jsonb
      )
    `,
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        scheduled_at,
        last_dispatched_at,
        locked_until,
        input_snapshot_json,
        target_entity_type,
        target_entity_id
      )
      VALUES (
        '50000000-0000-4000-8000-000000000104',
        '10000000-0000-4000-8000-000000000101',
        '20000000-0000-4000-8000-000000000101',
        '30000000-0000-4000-8000-000000000101',
        '40000000-0000-4000-8000-000000000104',
        'episode_generate_video',
        'running',
        'generation-submit-video',
        '2026-06-03T05:55:00.000Z',
        '2026-06-03T05:50:00.000Z',
        '2026-06-03T05:58:00.000Z',
        '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"seedance","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000104"}'::jsonb,
        'episode',
        '60000000-0000-4000-8000-000000000104'
      )
    `,
  );
  await db.query(
    `
      INSERT INTO task_attempts (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_id,
        attempt_number,
        status,
        started_at
      )
      VALUES (
        '51000000-0000-4000-8000-000000000104',
        '10000000-0000-4000-8000-000000000101',
        '20000000-0000-4000-8000-000000000101',
        '30000000-0000-4000-8000-000000000101',
        '40000000-0000-4000-8000-000000000104',
        '50000000-0000-4000-8000-000000000104',
        1,
        'running',
        '2026-06-03T05:56:00.000Z'
      )
    `,
  );
  await db.query(
    `
      UPDATE tasks
      SET current_attempt_id = '51000000-0000-4000-8000-000000000104'
      WHERE id = '50000000-0000-4000-8000-000000000104'
    `,
  );
  await db.query(
    `
      INSERT INTO provider_requests (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_id,
        attempt_id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        status,
        external_submission_started_at,
        external_request_id
      )
      VALUES (
        '52000000-0000-4000-8000-000000000104',
        '10000000-0000-4000-8000-000000000101',
        '20000000-0000-4000-8000-000000000101',
        '30000000-0000-4000-8000-000000000101',
        '40000000-0000-4000-8000-000000000104',
        '50000000-0000-4000-8000-000000000104',
        '51000000-0000-4000-8000-000000000104',
        'volcengine',
        'episode.video.generate',
        'workflow-104:task-104',
        'request-hash-104',
        'creator://payload-104',
        'payload-hash-104',
        '{}'::jsonb,
        'accepted',
        '2026-06-03T05:56:00.000Z',
        'seedance-external-104'
      )
    `,
  );
}
