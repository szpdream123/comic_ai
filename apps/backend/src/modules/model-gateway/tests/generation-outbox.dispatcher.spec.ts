import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  dispatchClaimedGenerationOutboxEvents,
  dispatchGenerationOutboxBatch,
} from "../generation-outbox.dispatcher.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation outbox dispatcher", { concurrency: false }, () => {
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

  it("terminally handles generation outbox events when BullMQ publishing fails", async () => {
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
      assert.equal(row.rows[0]?.status, "processed");
      assert.match(row.rows[0]?.error_message ?? "", /redis_unavailable/);
      assert.equal(
        new Date(row.rows[0]!.available_at).toISOString(),
        "2026-06-02T23:59:00.000Z",
      );
    } finally {
      await db.close();
    }
  });

  it("fails submit publishing with a refund and post-submit publishing with admin review", async () => {
    const failures: Array<Record<string, unknown>> = [];
    const terminalEventIds: string[] = [];
    const db = {} as never;
    const now = new Date("2026-06-03T00:00:00.000Z");
    const submitEvent = generationOutboxEvent(
      "90000000-0000-4000-8000-000000000021",
      "50000000-0000-4000-8000-000000000021",
    );
    const finalizeEvent = {
      ...generationOutboxEvent(
        "90000000-0000-4000-8000-000000000022",
        "50000000-0000-4000-8000-000000000022",
      ),
      eventType: "generation.task.finalize_requested",
    };

    const result = await dispatchClaimedGenerationOutboxEvents(db, {
      now,
      events: [submitEvent, finalizeEvent],
      config: loadGenerationQueueConfig({}),
      publisher: { async add() {} },
    }, {
      async publish() {
        throw new Error("redis_unavailable");
      },
      async failTaskAfterQueueError(_db, input) {
        failures.push(input);
        return true;
      },
      async markTerminalFailure(_db, input) {
        terminalEventIds.push(input.outboxEventId);
      },
    });

    assert.deepEqual(result, {
      processedEventIds: [],
      failedEventIds: [submitEvent.id, finalizeEvent.id],
    });
    assert.equal(failures[0]?.failureCode, "generation_queue_publish_failed");
    assert.equal(failures[0]?.creditOutcome, "released");
    assert.equal(failures[1]?.failureCode, "generation_queue_publish_failed");
    assert.equal(failures[1]?.creditOutcome, "manual_review_required");
    assert.deepEqual(terminalEventIds, [submitEvent.id, finalizeEvent.id]);
  });

  it("does not fail a task when BullMQ accepted the job but outbox completion persistence fails", async () => {
    let taskFailureCalled = false;
    const event = generationOutboxEvent(
      "90000000-0000-4000-8000-000000000023",
      "50000000-0000-4000-8000-000000000023",
    );

    await assert.rejects(
      dispatchClaimedGenerationOutboxEvents({} as never, {
        now: new Date("2026-06-03T00:00:00.000Z"),
        events: [event],
        config: loadGenerationQueueConfig({}),
        publisher: { async add() {} },
      }, {
        async publish() {},
        async markProcessed() {
          throw new Error("outbox_completion_write_failed");
        },
        async failTaskAfterQueueError() {
          taskFailureCalled = true;
          return true;
        },
      }),
      /outbox_completion_write_failed/,
    );

    assert.equal(taskFailureCalled, false);
  });

  it("starts publishing all claimed generation events before waiting for previous publishes", async () => {
    const startedTaskIds: string[] = [];
    const publishResolvers: Array<() => void> = [];
    const processedEventIds: string[] = [];
    const db = {} as never;

    const dispatchPromise = dispatchClaimedGenerationOutboxEvents(db, {
      now: new Date("2026-06-03T00:00:00.000Z"),
      events: [
        generationOutboxEvent("90000000-0000-4000-8000-000000000011", "task-image-1"),
        generationOutboxEvent("90000000-0000-4000-8000-000000000012", "task-image-2"),
      ],
      config: loadGenerationQueueConfig({
        GENERATION_SUBMIT_IMAGE_QUEUE: "generation-submit-image",
      }),
      publisher: {
        async add() {},
      },
    }, {
      async publish(event) {
        startedTaskIds.push(String(event.payload.taskId ?? ""));
        await new Promise<void>((resolve) => {
          publishResolvers.push(resolve);
        });
      },
      async markProcessed(_db, input) {
        processedEventIds.push(input.outboxEventId);
        return generationOutboxEvent(input.outboxEventId, input.outboxEventId);
      },
    });
    await Promise.resolve();

    assert.deepEqual(startedTaskIds.sort(), ["task-image-1", "task-image-2"]);
    assert.deepEqual(processedEventIds, []);

    publishResolvers.forEach((resolve) => resolve());
    const result = await dispatchPromise;

    assert.deepEqual(result.processedEventIds, [
      "90000000-0000-4000-8000-000000000011",
      "90000000-0000-4000-8000-000000000012",
    ]);
    assert.deepEqual(result.failedEventIds, []);
    assert.deepEqual(processedEventIds, result.processedEventIds);
  });
});

async function seedOutboxEvents(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
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
          'generation.task.created',
          '{"workflowId":"workflow-1","taskId":"task-1","mediaType":"video","modelCode":"seedance-i2v-pro","queueName":"generation-submit-video","providerExecutor":"seedance"}'::jsonb,
          'pending',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000002',
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

async function seedParallelGenerationOutboxEvents(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES
        (
          '90000000-0000-4000-8000-000000000011',
          'generation.task.created',
          '{"workflowId":"workflow-1","taskId":"task-image-1","mediaType":"image","modelCode":"gpt-image-2-cn","queueName":"generation-submit-image","providerExecutor":"gpt-image-2"}'::jsonb,
          'pending',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000012',
          'generation.task.created',
          '{"workflowId":"workflow-2","taskId":"task-image-2","mediaType":"image","modelCode":"gpt-image-2-cn","queueName":"generation-submit-image","providerExecutor":"gpt-image-2"}'::jsonb,
          'pending',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z',
          '2026-06-02T23:59:00.000Z'
        )
    `,
  );
}

function generationOutboxEvent(id: string, taskId: string) {
  const now = new Date("2026-06-02T23:59:00.000Z");
  return {
    id,
    eventType: "generation.task.created",
    payload: {
      workflowId: `workflow-${taskId}`,
      taskId,
      mediaType: "image",
      modelCode: "gpt-image-2-cn",
      queueName: "generation-submit-image",
      providerExecutor: "gpt-image-2",
    },
    status: "processing" as const,
    availableAt: now,
    processedAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}
