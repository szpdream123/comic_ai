import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { dispatchGenerationOutboxBatch } from "../generation-outbox.dispatcher.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation outbox dispatcher", () => {
  it("publishes generation task events to BullMQ and leaves unrelated outbox events untouched", async () => {
    const db = await createMigratedTestDb();
    const published: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];

    try {
      await seedOutboxEvents(db);

      const result = await dispatchGenerationOutboxBatch(db, {
        now: new Date("2026-06-03T00:00:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({
          GENERATION_SUBMIT_VIDEO_QUEUE: "generation-submit-video",
        }),
        publisher: {
          async add(queueName, name, data, options) {
            published.push({ queueName, name, data, options });
          },
        },
      });
      const rows = await db.query<{ id: string; status: string }>(
        "SELECT id, status FROM outbox_events ORDER BY id ASC",
      );

      assert.deepEqual(result, {
        processedEventIds: ["90000000-0000-4000-8000-000000000001"],
        failedEventIds: [],
      });
      assert.equal(published.length, 1);
      assert.equal(published[0]?.queueName, "generation-submit-video");
      assert.deepEqual(rows.rows, [
        { id: "90000000-0000-4000-8000-000000000001", status: "processed" },
        { id: "90000000-0000-4000-8000-000000000002", status: "pending" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("marks generation outbox events failed when BullMQ publishing fails", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOutboxEvents(db);

      const result = await dispatchGenerationOutboxBatch(db, {
        now: new Date("2026-06-03T00:00:00.000Z"),
        limit: 10,
        retryDelayMs: 30_000,
        config: loadGenerationQueueConfig({}),
        publisher: {
          async add() {
            throw new Error("redis_unavailable");
          },
        },
      });
      const row = await db.query<{
        status: string;
        error_message: string | null;
        available_at: Date | string;
      }>(
        "SELECT status, error_message, available_at FROM outbox_events WHERE id = '90000000-0000-4000-8000-000000000001'",
      );

      assert.deepEqual(result, {
        processedEventIds: [],
        failedEventIds: ["90000000-0000-4000-8000-000000000001"],
      });
      assert.equal(row.rows[0]?.status, "failed");
      assert.match(row.rows[0]?.error_message ?? "", /redis_unavailable/);
      assert.equal(
        new Date(row.rows[0]!.available_at).toISOString(),
        "2026-06-03T00:00:30.000Z",
      );
    } finally {
      await db.close();
    }
  });
});

async function seedOutboxEvents(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        organization_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES
        (
          '90000000-0000-4000-8000-000000000001',
          NULL,
          'generation.task.created',
          '{"workflowId":"workflow-1","taskId":"task-1","mediaType":"video","modelCode":"seedance-i2v-pro","queueName":"generation-submit-video","providerExecutor":"seedance"}'::jsonb,
          'pending',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000002',
          NULL,
          'payment.succeeded',
          '{}'::jsonb,
          'pending',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z'
        )
    `,
  );
}
