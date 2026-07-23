import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { recordGenerationProviderWebhook } from "../generation-webhook-inbox.service.ts";

describe("generation provider webhook inbox", { concurrency: false }, () => {
  it("deduplicates signed events and wakes the existing poll path once", async () => {
    const db = await createMigratedTestDb();
    const now = new Date("2026-07-22T12:00:00.000Z");
    const taskId = "50000000-0000-4000-8000-000000000511";
    try {
      await seedWebhookTask(db, taskId);
      const first = await recordGenerationProviderWebhook(db, {
        providerName: "provider-webhook-test",
        eventId: "event-511",
        externalRequestId: "external-511",
        payload: { status: "succeeded", externalRequestId: "external-511" },
        signatureVerified: true,
        now,
      });
      const duplicate = await recordGenerationProviderWebhook(db, {
        providerName: "provider-webhook-test",
        eventId: "event-511",
        externalRequestId: "external-511",
        payload: { externalRequestId: "external-511", status: "succeeded" },
        signatureVerified: true,
        now: new Date(now.getTime() + 1),
      });
      const inbox = await db.query<{ status: string; count: number | string }>(`
        SELECT min(status) AS status, count(*) AS count
        FROM provider_webhook_inbox
        WHERE provider_name = 'provider-webhook-test'
          AND event_key = 'event-511'
      `);
      const outbox = await db.query<{ count: number | string; poll_attempt: number | string }>(`
        SELECT count(*) AS count, max((payload_json->>'pollAttempt')::int) AS poll_attempt
        FROM outbox_events
        WHERE event_type = 'generation.task.poll_requested'
          AND payload_json->>'taskId' = $1
      `, [taskId]);

      assert.deepEqual(first, { duplicate: false, status: "dispatched", taskId });
      assert.deepEqual(duplicate, { duplicate: true, status: "dispatched", taskId });
      assert.equal(Number(inbox.rows[0]?.count), 1);
      assert.equal(inbox.rows[0]?.status, "dispatched");
      assert.equal(Number(outbox.rows[0]?.count), 1);
      assert.equal(Number(outbox.rows[0]?.poll_attempt), 1);
    } finally {
      await db.close();
    }
  });

  it("rejects unverified webhook payloads before writing inbox state", async () => {
    const db = await createMigratedTestDb();
    try {
      await assert.rejects(
        recordGenerationProviderWebhook(db, {
          providerName: "provider-webhook-test",
          eventId: "event-invalid",
          externalRequestId: "external-invalid",
          payload: {},
          signatureVerified: false,
          now: new Date("2026-07-22T12:00:00.000Z"),
        }),
        /generation_webhook_signature_invalid/,
      );
      const count = await db.query<{ count: number | string }>(
        "SELECT count(*) AS count FROM provider_webhook_inbox",
      );
      assert.equal(Number(count.rows[0]?.count), 0);
    } finally {
      await db.close();
    }
  });
});

async function seedWebhookTask(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  taskId: string,
) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ('70000000-0000-4000-8000-000000000511', '13800138511', 'active')",
  );
  await db.query(`
    INSERT INTO projects (id, name, aspect_ratio, resolution, phase, created_by_user_id, owner_user_id)
    VALUES ('30000000-0000-4000-8000-000000000511', 'Webhook inbox', '16:9', '1080p', 'script_input',
      '70000000-0000-4000-8000-000000000511', '70000000-0000-4000-8000-000000000511')
  `);
  await db.query(`
    INSERT INTO workflows (id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id)
    VALUES ('40000000-0000-4000-8000-000000000511', '30000000-0000-4000-8000-000000000511',
      'episode_video_generation', 'running', '{}'::jsonb, '70000000-0000-4000-8000-000000000511')
  `);
  await db.query(
    `
      INSERT INTO tasks (
        id, project_id, workflow_id, task_type, status, queue_name, input_snapshot_json,
        target_entity_type, target_entity_id
      )
      VALUES ($1::uuid, '30000000-0000-4000-8000-000000000511', '40000000-0000-4000-8000-000000000511',
        'episode_generate_video', 'running', 'generation-poll-video',
        '{"model":"seedance-i2v-pro","providerExecutor":"seedance"}'::jsonb, 'episode', $1::uuid)
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
      VALUES ('52000000-0000-4000-8000-000000000511', '30000000-0000-4000-8000-000000000511',
        '40000000-0000-4000-8000-000000000511', $1::uuid, 'provider-webhook-test', 'video.generate',
        $1::text, 'request-hash', 'payload-ref', 'payload-hash', '{}'::jsonb,
        'running', '2026-07-22T11:59:00.000Z', 'external-511', '70000000-0000-4000-8000-000000000511')
    `,
    [taskId],
  );
}
