import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  dispatchClaimedGenerationOutboxEvents,
  dispatchGenerationOutboxBatch,
} from "../generation-outbox.dispatcher.ts";
import { appendGenerationTaskCreatedOutboxEvent } from "../generation-outbox.service.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation outbox dispatcher", { concurrency: false }, () => {
  it("reuses the active created event for the same generation task", async () => {
    const db = await createMigratedTestDb();
    const input = {
      workflowId: "40000000-0000-4000-8000-000000000001",
      taskId: "50000000-0000-4000-8000-000000000001",
      kind: "image" as const,
      modelCode: "gpt-image-2-cn",
      queueName: "generation-submit-image",
      targetType: "storyboard",
      targetId: "60000000-0000-4000-8000-000000000001",
      providerExecutor: "gpt-image-2",
      availableAt: new Date("2026-06-03T00:00:00.000Z"),
    };

    try {
      const first = await appendGenerationTaskCreatedOutboxEvent(db, input);
      const second = await appendGenerationTaskCreatedOutboxEvent(db, input);
      const rows = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM outbox_events
        WHERE event_type = 'generation.task.created'
          AND payload_json->>'taskId' = $1
      `, [input.taskId]);

      assert.equal(second.id, first.id);
      assert.equal(rows.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

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

  it("reclaims a stale processing event after a dispatcher crash", async () => {
    const db = await createMigratedTestDb();
    let publishCount = 0;
    try {
      await seedOutboxEvents(db);
      await db.query(
        `UPDATE outbox_events SET status = 'processing', updated_at = $2 WHERE id = $1`,
        ["90000000-0000-4000-8000-000000000001", new Date("2026-06-03T00:00:00.000Z")],
      );

      const result = await dispatchGenerationOutboxBatch(db, {
        now: new Date("2026-06-03T00:03:00.000Z"),
        limit: 10,
        config: loadGenerationQueueConfig({}),
        publisher: {
          async add() {
            publishCount += 1;
          },
        },
      });
      const row = await db.query<{ status: string }>(
        "SELECT status FROM outbox_events WHERE id = $1",
        ["90000000-0000-4000-8000-000000000001"],
      );

      assert.deepEqual(result.processedEventIds, ["90000000-0000-4000-8000-000000000001"]);
      assert.equal(publishCount, 1);
      assert.equal(row.rows[0]?.status, "processed");
    } finally {
      await db.close();
    }
  });

  it("retries generation outbox events when BullMQ publishing fails", async () => {
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
        attempt_count: number;
      }>(
        "SELECT status, error_message, available_at, attempt_count FROM outbox_events WHERE id = '90000000-0000-4000-8000-000000000001'",
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
      assert.equal(row.rows[0]?.attempt_count, 1);
    } finally {
      await db.close();
    }
  });

  it("does not settle task or credits when submit and finalize publishing fails", async () => {
    const retries: Array<Record<string, unknown>> = [];
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
      async markFailed(_db, input) {
        retries.push(input);
        return submitEvent;
      },
    });

    assert.deepEqual(result, {
      processedEventIds: [],
      failedEventIds: [submitEvent.id, finalizeEvent.id],
    });
    assert.deepEqual(retries.map((retry) => retry.outboxEventId), [submitEvent.id, finalizeEvent.id]);
    assert.deepEqual(
      retries.map((retry) => (retry.retryAt as Date).toISOString()),
      ["2026-06-03T00:00:30.000Z", "2026-06-03T00:00:30.000Z"],
    );
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
      }),
      /outbox_completion_write_failed/,
    );

    assert.equal(taskFailureCalled, false);
  });

  it("bounds concurrent BullMQ publishes while preserving claimed event order", async () => {
    const startedTaskIds: string[] = [];
    const publishResolvers: Array<() => void> = [];
    const processedEventIds: string[] = [];
    const db = {} as never;

    const dispatchPromise = dispatchClaimedGenerationOutboxEvents(db, {
      now: new Date("2026-06-03T00:00:00.000Z"),
      events: [
        generationOutboxEvent("90000000-0000-4000-8000-000000000011", "task-image-1"),
        generationOutboxEvent("90000000-0000-4000-8000-000000000012", "task-image-2"),
        generationOutboxEvent("90000000-0000-4000-8000-000000000013", "task-image-3"),
      ],
      config: loadGenerationQueueConfig({
        GENERATION_SUBMIT_IMAGE_QUEUE: "generation-submit-image",
        GENERATION_DISPATCH_PUBLISH_CONCURRENCY: "2",
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

    publishResolvers.shift()?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(startedTaskIds.sort(), ["task-image-1", "task-image-2", "task-image-3"]);
    publishResolvers.forEach((resolve) => resolve());
    const result = await dispatchPromise;

    assert.deepEqual(result.processedEventIds, [
      "90000000-0000-4000-8000-000000000011",
      "90000000-0000-4000-8000-000000000012",
      "90000000-0000-4000-8000-000000000013",
    ]);
    assert.deepEqual(result.failedEventIds, []);
    assert.deepEqual(processedEventIds, result.processedEventIds);
  });

  it("assigns enabled generation events to a route-specific shard before publishing", async () => {
    const event = generationOutboxEvent(
      "90000000-0000-0000-0000-000000000031",
      "50000000-0000-4000-8000-000000000031",
    );
    let assignedInput: Record<string, unknown> | undefined;
    let publishedAssignment: Record<string, unknown> | undefined;
    let publishedQueue = "";
    const db = {
      async query() {
        return {
          rows: [{
            input_snapshot_json: {
              modelConfigSnapshot: {
                version: 1,
                config: {
                  id: "provider-config-revision-1",
                  modelCode: "gpt-image-2-cn",
                  providerName: "image-provider",
                  providerModel: "image-v2",
                  providerProtocol: "custom_http",
                  providerConfig: {
                    endpoint: "https://provider.example.test/v1/images",
                    accountRef: "account-east",
                    region: "cn-east-1",
                    apiKey: "must-not-enter-route",
                    apiKeyEnv: "IMAGE_PROVIDER_API_KEY",
                  },
                },
              },
            },
          }],
        };
      },
    };
    const result = await dispatchClaimedGenerationOutboxEvents(db as never, {
      now: new Date("2026-06-03T00:00:00.000Z"),
      events: [event],
      config: loadGenerationQueueConfig({
        GENERATION_QUEUE_SHARDING_ENABLED: "true",
      }),
      publisher: { async add() {} },
      shardStore: {
        async reserve(_db, input) {
          assignedInput = input as unknown as Record<string, unknown>;
          return {
            assignmentKey: String(input.assignmentKey),
            taskId: input.taskId,
            mediaType: input.mediaType,
            stage: input.stage,
            routeKey: input.routeKey,
            routeCode: "rroute",
            shardId: "70000000-0000-4000-8000-000000000001",
            shardNo: 2,
            queueName: "generation-image-submit-rroute-002",
            capacity: 600,
            rateLimitMax: 5,
            rateLimitDurationMs: 1000,
            admittedCount: 1,
            shardState: "accepting" as const,
            assignmentStatus: "publishing" as const,
            redisJobId: input.redisJobId,
          };
        },
        async markPublished(_db, input) {
          publishedAssignment = input as unknown as Record<string, unknown>;
          return null;
        },
      },
    }, {
      async publish(routedEvent) {
        publishedQueue = String(routedEvent.payload.queueName);
      },
      async markProcessed(_db, input) {
        return generationOutboxEvent(input.outboxEventId, event.payload.taskId as string);
      },
    });

    assert.equal(result.failedEventIds.length, 0);
    assert.equal(publishedQueue, "generation-image-submit-rroute-002");
    assert.equal(assignedInput?.stage, "submit");
    assert.equal(
      assignedInput?.redisJobId,
      "generation.task.created__50000000-0000-4000-8000-000000000031__submit",
    );
    assert.equal(publishedAssignment?.assignmentKey, assignedInput?.assignmentKey);
    assert.equal(publishedAssignment?.redisJobId, assignedInput?.redisJobId);
    assert.match(String(assignedInput?.routeKey), /gpt-image-2/);
    assert.match(String(assignedInput?.routeKey), /provider-config-revision-1/);
    assert.doesNotMatch(
      String(assignedInput?.routeKey),
      /provider\.example|account-east|must-not-enter-route|IMAGE_PROVIDER_API_KEY/,
    );
  });

  it("uses a numeric poll attempt to keep shard assignments unique", async () => {
    const taskId = "50000000-0000-4000-8000-000000000032";
    const event = {
      ...generationOutboxEvent("90000000-0000-0000-0000-000000000032", taskId),
      eventType: "generation.task.poll_requested",
      payload: {
        ...generationOutboxEvent("90000000-0000-0000-0000-000000000032", taskId).payload,
        pollAttempt: 3,
      },
    };
    let reservedInput: Record<string, unknown> | undefined;

    const result = await dispatchClaimedGenerationOutboxEvents({
      async query() {
        return { rows: [{ input_snapshot_json: {} }] };
      },
    } as never, {
      now: new Date("2026-06-03T00:00:00.000Z"),
      events: [event],
      config: loadGenerationQueueConfig({
        GENERATION_QUEUE_SHARDING_ENABLED: "true",
      }),
      publisher: { async add() {} },
      shardStore: {
        async reserve(_db, input) {
          reservedInput = input as unknown as Record<string, unknown>;
          return {
            assignmentKey: input.assignmentKey,
            taskId: input.taskId,
            mediaType: input.mediaType,
            stage: input.stage,
            routeKey: input.routeKey,
            routeCode: "rpoll",
            shardId: "70000000-0000-4000-8000-000000000002",
            shardNo: 0,
            queueName: "generation-image-poll-rpoll-000",
            capacity: 600,
            rateLimitMax: 5,
            rateLimitDurationMs: 1000,
            admittedCount: 1,
            shardState: "accepting" as const,
            assignmentStatus: "publishing" as const,
            redisJobId: input.redisJobId,
          };
        },
        async markPublished() {
          return null;
        },
      },
    }, {
      async publish() {},
      async markProcessed(_db, input) {
        return generationOutboxEvent(input.outboxEventId, taskId);
      },
    });

    assert.deepEqual(result.failedEventIds, []);
    assert.equal(
      reservedInput?.assignmentKey,
      `generation.task.poll_requested:${taskId}:poll:3`,
    );
    assert.equal(
      reservedInput?.redisJobId,
      `generation.image.poll__${taskId}__3`,
    );
  });

  it("uses the recovery dispatch token for a fresh sharded submit assignment", async () => {
    const taskId = "50000000-0000-4000-8000-000000000039";
    const event = {
      ...generationOutboxEvent("90000000-0000-0000-0000-000000000039", taskId),
      payload: {
        ...generationOutboxEvent("90000000-0000-0000-0000-000000000039", taskId).payload,
        dispatchToken: "cumob-429-repair-3",
        retrySequence: 3,
      },
    };
    let reservedInput: Record<string, unknown> | undefined;

    const result = await dispatchClaimedGenerationOutboxEvents({
      async query() {
        return { rows: [{ input_snapshot_json: {} }] };
      },
    } as never, {
      now: new Date("2026-06-03T00:00:00.000Z"),
      events: [event],
      config: loadGenerationQueueConfig({
        GENERATION_QUEUE_SHARDING_ENABLED: "true",
      }),
      publisher: { async add() {} },
      shardStore: {
        async reserve(_db, input) {
          reservedInput = input as unknown as Record<string, unknown>;
          return {
            assignmentKey: input.assignmentKey,
            taskId: input.taskId,
            mediaType: input.mediaType,
            stage: input.stage,
            routeKey: input.routeKey,
            routeCode: "rrepair",
            shardId: "70000000-0000-4000-8000-000000000009",
            shardNo: 0,
            queueName: "generation-image-submit-rrepair-000",
            capacity: 600,
            rateLimitMax: 5,
            rateLimitDurationMs: 1000,
            admittedCount: 1,
            shardState: "accepting" as const,
            assignmentStatus: "publishing" as const,
            redisJobId: input.redisJobId,
          };
        },
        async markPublished() {
          return null;
        },
      },
    }, {
      async publish() {},
      async markProcessed(_db, input) {
        return generationOutboxEvent(input.outboxEventId, taskId);
      },
    });

    assert.deepEqual(result.failedEventIds, []);
    assert.equal(
      reservedInput?.assignmentKey,
      `generation.task.created:${taskId}:submit:cumob-429-repair-3`,
    );
    assert.equal(
      reservedInput?.redisJobId,
      `generation.task.created__${taskId}__submit__cumob-429-repair-3`,
    );
  });

  it("finishes the outbox event when the worker releases its assignment before publish acknowledgement", async () => {
    const taskId = "50000000-0000-4000-8000-000000000033";
    const event = {
      ...generationOutboxEvent("90000000-0000-0000-0000-000000000033", taskId),
      eventType: "generation.task.poll_requested",
      payload: {
        ...generationOutboxEvent("90000000-0000-0000-0000-000000000033", taskId).payload,
        pollAttempt: 2,
      },
    };
    let processed = false;

    const result = await dispatchClaimedGenerationOutboxEvents({
      async query() {
        return { rows: [{ input_snapshot_json: {} }] };
      },
    } as never, {
      now: new Date("2026-06-03T00:00:00.000Z"),
      events: [event],
      config: loadGenerationQueueConfig({
        GENERATION_QUEUE_SHARDING_ENABLED: "true",
      }),
      publisher: { async add() {} },
      shardStore: {
        async reserve(_db, input) {
          return {
            assignmentKey: input.assignmentKey,
            taskId: input.taskId,
            mediaType: input.mediaType,
            stage: input.stage,
            routeKey: input.routeKey,
            routeCode: "rrace",
            shardId: "70000000-0000-4000-8000-000000000003",
            shardNo: 0,
            queueName: "generation-image-poll-rrace-000",
            capacity: 600,
            rateLimitMax: 5,
            rateLimitDurationMs: 1000,
            admittedCount: 0,
            shardState: "accepting" as const,
            assignmentStatus: "publishing" as const,
            redisJobId: input.redisJobId,
          };
        },
        async markPublished() {
          throw new Error("generation_queue_assignment_already_released");
        },
      },
    }, {
      async publish() {},
      async markProcessed() {
        processed = true;
        return generationOutboxEvent(event.id, taskId);
      },
    });

    assert.equal(processed, true);
    assert.deepEqual(result, {
      processedEventIds: [event.id],
      failedEventIds: [],
    });
  });

  it("reconciles an outbox retry only when its released assignment has the same Redis job id", async () => {
    const taskId = "50000000-0000-4000-8000-000000000034";
    const event = {
      ...generationOutboxEvent("90000000-0000-0000-0000-000000000034", taskId),
      eventType: "generation.task.poll_requested",
      payload: {
        ...generationOutboxEvent("90000000-0000-0000-0000-000000000034", taskId).payload,
        pollAttempt: 3,
      },
    };
    let publishedQueue = "";

    const result = await dispatchClaimedGenerationOutboxEvents({
      async query(sql: string, params?: unknown[]) {
        if (sql.includes("generation_queue_stage_assignments")) {
          assert.deepEqual(params, [
            `generation.task.poll_requested:${taskId}:poll:3`,
            taskId,
            `generation.image.poll__${taskId}__3`,
          ]);
          return { rows: [{
            assignment_key: `generation.task.poll_requested:${taskId}:poll:3`,
            queue_name: "generation-image-poll-rretry-000",
            shard_id: "70000000-0000-4000-8000-000000000004",
            shard_no: 0,
            route_code: "rretry",
          }] };
        }
        return { rows: [{ input_snapshot_json: {} }] };
      },
    } as never, {
      now: new Date("2026-06-03T00:00:00.000Z"),
      events: [event],
      config: loadGenerationQueueConfig({
        GENERATION_QUEUE_SHARDING_ENABLED: "true",
      }),
      publisher: { async add() {} },
      shardStore: {
        async reserve() {
          throw new Error("generation_queue_assignment_already_released");
        },
        async markPublished() {
          throw new Error("generation_queue_assignment_already_released");
        },
      },
    }, {
      async publish(routedEvent) {
        publishedQueue = String(routedEvent.payload.queueName);
      },
      async markProcessed(_db, input) {
        return generationOutboxEvent(input.outboxEventId, taskId);
      },
    });

    assert.equal(publishedQueue, "generation-image-poll-rretry-000");
    assert.deepEqual(result, {
      processedEventIds: [event.id],
      failedEventIds: [],
    });
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
