import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  repairExpiredGenerationSubmitLeases,
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
        user_id: string;
        event_type: string;
        payload_json: Record<string, unknown>;
      }>(
        `
          SELECT user_id, event_type, payload_json
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
      assert.equal(outbox.rows[0]?.user_id, "00000000-0000-4000-8000-000000000101");
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

  it("recreates generation outbox events for expired GPT Image submit leases before provider start", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningGptImageSubmitTask(db);
      const repaired = await repairExpiredGenerationSubmitLeases(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
      });
      const task = await db.query<{
        status: string;
        current_attempt_id: string | null;
        locked_until: Date | string | null;
      }>(
        `
          SELECT status, current_attempt_id, locked_until
          FROM tasks
          WHERE id = '50000000-0000-4000-8000-000000000105'
        `,
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        `
          SELECT status, failure_code
          FROM task_attempts
          WHERE id = '51000000-0000-4000-8000-000000000105'
        `,
      );
      const outbox = await db.query<{
        user_id: string;
        event_type: string;
        payload_json: Record<string, unknown>;
      }>(
        `
          SELECT user_id, event_type, payload_json
          FROM outbox_events
          WHERE event_type = 'generation.task.created'
          ORDER BY created_at ASC
        `,
      );

      assert.deepEqual(repaired.requeuedTaskIds, [
        "50000000-0000-4000-8000-000000000105",
      ]);
      assert.deepEqual(repaired.resultUnknownTaskIds, []);
      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000105",
      ]);
      assert.equal(task.rows[0]?.status, "queued");
      assert.equal(task.rows[0]?.current_attempt_id, null);
      assert.equal(task.rows[0]?.locked_until, null);
      assert.equal(attempt.rows[0]?.status, "failed");
      assert.equal(attempt.rows[0]?.failure_code, "lease_expired_before_external_start");
      assert.equal(outbox.rows.length, 1);
      assert.equal(outbox.rows[0]?.user_id, "00000000-0000-4000-8000-000000000101");
      assert.equal(outbox.rows[0]?.event_type, "generation.task.created");
      assert.deepEqual(outbox.rows[0]?.payload_json, {
        workflowId: "40000000-0000-4000-8000-000000000105",
        taskId: "50000000-0000-4000-8000-000000000105",
        mediaType: "image",
        modelCode: "gpt-image-2-cn",
        queueName: "generation-submit-image",
        targetType: "asset",
        targetId: "60000000-0000-4000-8000-000000000105",
        providerExecutor: "gpt-image-2",
      });
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

  it("recreates finalize outbox events for provider-succeeded Seedance tasks waiting on local persistence", async () => {
    const db = await createMigratedTestDb();
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'manual_review_required',
              locked_until = NULL,
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              response_redacted_json = '{"videoUrl":"https://cdn.example.test/result.mp4"}'::jsonb
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });
      const outbox = await db.query<{
        event_type: string;
        payload_json: Record<string, unknown>;
      }>(
        `
          SELECT event_type, payload_json
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
          ORDER BY created_at ASC
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.equal(added.length, 0);
      assert.equal(outbox.rows.length, 1);
      assert.deepEqual(outbox.rows[0]?.payload_json, {
        workflowId: "40000000-0000-4000-8000-000000000104",
        taskId: "50000000-0000-4000-8000-000000000104",
        mediaType: "video",
        modelCode: "seedance-i2v-pro",
        providerExecutor: "seedance",
        artifactKind: "video",
        storageBucket: null,
        finalizeMode: "retry_finalize",
      });
    } finally {
      await db.close();
    }
  });

  it("recreates finalize outbox events for provider-succeeded result-unknown Seedance tasks", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'result_unknown',
              failure_code = 'lease_expired_after_external_start',
              locked_until = NULL,
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              response_redacted_json = '{"videoUrl":"https://cdn.example.test/result.mp4"}'::jsonb
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: { async add() {} },
      });
      const outbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, [
        "50000000-0000-4000-8000-000000000104",
      ]);
      assert.equal(outbox.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("does not recreate finalize outbox events while a Seedance finalize lease is still active", async () => {
    const db = await createMigratedTestDb();
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];

    try {
      await seedGenerationRepairTasks(db);
      await seedRunningSeedanceTask(db);
      await db.query(
        `
          UPDATE tasks
          SET status = 'manual_review_required',
              locked_until = '2026-06-03T06:10:00.000Z',
              last_dispatched_at = '2026-06-03T05:50:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000104'
        `,
      );
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              response_redacted_json = '{"videoUrl":"https://cdn.example.test/result.mp4"}'::jsonb
          WHERE id = '52000000-0000-4000-8000-000000000104'
        `,
      );

      const repaired = await repairRunningSeedancePollJobs(db, {
        now: new Date("2026-06-03T06:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
          GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            added.push({ queueName, name, data, options });
          },
        },
      });
      const outbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM outbox_events
          WHERE event_type = 'generation.task.finalize_requested'
        `,
      );

      assert.deepEqual(repaired.repairedTaskIds, []);
      assert.equal(added.length, 0);
      assert.equal(outbox.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });
});

async function seedGenerationRepairTasks(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(`
    INSERT INTO users (id, phone_e164, status)
    VALUES ('00000000-0000-4000-8000-000000000101', '13800138101', 'active')
  `);
  await db.query(
    `
      INSERT INTO projects (
        id,
        name,
        aspect_ratio,
        resolution,
        phase,
        owner_user_id,
        created_by_user_id
      )
      VALUES ('30000000-0000-4000-8000-000000000101', 'Generation Repair Project', '16:9', '1080p', 'script_input', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000101')
    `,
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id
      )
      VALUES
        (
          '40000000-0000-4000-8000-000000000101',
          '30000000-0000-4000-8000-000000000101',
          'episode_video_generation',
          'queued',
          '{}'::jsonb,
          '00000000-0000-4000-8000-000000000101'
        ),
        (
          '40000000-0000-4000-8000-000000000102',
          '30000000-0000-4000-8000-000000000101',
          'episode_video_generation',
          'queued',
          '{}'::jsonb,
          '00000000-0000-4000-8000-000000000101'
        ),
        (
          '40000000-0000-4000-8000-000000000103',
          '30000000-0000-4000-8000-000000000101',
          'episode_video_generation',
          'queued',
          '{}'::jsonb,
          '00000000-0000-4000-8000-000000000101'
        )
    `,
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
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

async function seedRunningGptImageSubmitTask(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO workflows (
        id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json
      )
      VALUES ('40000000-0000-4000-8000-000000000105', '30000000-0000-4000-8000-000000000101', 'episode_image_generation', 'running', '{}'::jsonb)
    `,
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
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
      VALUES ('50000000-0000-4000-8000-000000000105', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000105', 'episode_generate_image', 'running', 'generation-submit-image', '2026-06-03T05:55:00.000Z', '2026-06-03T05:50:00.000Z', '2026-06-03T05:58:00.000Z', '{"kind":"image","model":"gpt-image-2-cn","providerExecutor":"gpt-image-2","targetType":"asset","targetId":"60000000-0000-4000-8000-000000000105"}'::jsonb, 'asset', '60000000-0000-4000-8000-000000000105')
    `,
  );
  await db.query(
    `
      INSERT INTO task_attempts (
        id,
        project_id,
        workflow_id,
        task_id,
        attempt_number,
        status,
        started_at
      )
      VALUES ('51000000-0000-4000-8000-000000000105', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000105', '50000000-0000-4000-8000-000000000105', 1, 'running', '2026-06-03T05:56:00.000Z')
    `,
  );
  await db.query(
    `
      UPDATE tasks
      SET current_attempt_id = '51000000-0000-4000-8000-000000000105'
      WHERE id = '50000000-0000-4000-8000-000000000105'
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
        project_id,
        workflow_type,
        status,
        input_snapshot_json
      )
      VALUES ('40000000-0000-4000-8000-000000000104', '30000000-0000-4000-8000-000000000101', 'episode_video_generation', 'running', '{}'::jsonb)
    `,
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
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
      VALUES ('50000000-0000-4000-8000-000000000104', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000104', 'episode_generate_video', 'running', 'generation-submit-video', '2026-06-03T05:55:00.000Z', '2026-06-03T05:50:00.000Z', '2026-06-03T05:58:00.000Z', '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"seedance","targetType":"episode","targetId":"60000000-0000-4000-8000-000000000104"}'::jsonb, 'episode', '60000000-0000-4000-8000-000000000104')
    `,
  );
  await db.query(
    `
      INSERT INTO task_attempts (
        id,
        project_id,
        workflow_id,
        task_id,
        attempt_number,
        status,
        started_at
      )
      VALUES ('51000000-0000-4000-8000-000000000104', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000104', 1, 'running', '2026-06-03T05:56:00.000Z')
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
      VALUES ('52000000-0000-4000-8000-000000000104', '30000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000104', '51000000-0000-4000-8000-000000000104', 'volcengine', 'episode.video.generate', 'workflow-104:task-104', 'request-hash-104', 'creator://payload-104', 'payload-hash-104', '{}'::jsonb, 'accepted', '2026-06-03T05:56:00.000Z', 'seedance-external-104')
    `,
  );
}
