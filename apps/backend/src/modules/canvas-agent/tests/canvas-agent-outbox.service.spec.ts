import assert from "node:assert/strict";
import test from "node:test";

import type { SqlDatabase } from "../../shared/db/sql.ts";
import { CanvasAgentOutboxService } from "../canvas-agent-outbox.service.ts";

test("Canvas Agent outbox publishes a claimed wakeup and marks it dispatched", async () => {
  const published: Array<Record<string, unknown>> = [];
  const updates: string[] = [];
  const db: SqlDatabase = {
    async query<T>(sql: string) {
      if (sql.includes("WITH candidates AS")) {
        return {
          rows: [{
            id: "10000000-0000-4000-8000-000000000001",
            task_id: "20000000-0000-4000-8000-000000000001",
            event_key: "canvas-agent:task-created",
            shard_id: 3,
            payload_json: { reason: "task_created" },
          }] as T[],
        };
      }
      updates.push(sql);
      return { rows: [] as T[] };
    },
  };
  const service = new CanvasAgentOutboxService({
    db,
    workerId: "canvas-agent-test",
    publisher: {
      async publish(input) {
        published.push(input);
      },
    },
    now: () => new Date("2026-07-31T08:00:00.000Z"),
  });

  const result = await service.dispatchBatch(10);

  assert.deepEqual(result, { claimed: 1, dispatched: 1 });
  assert.deepEqual(published, [{
    taskId: "20000000-0000-4000-8000-000000000001",
    eventKey: "canvas-agent:task-created",
    shardId: 3,
    payload: { reason: "task_created" },
  }]);
  assert.equal(updates.some((sql) => sql.includes("status='dispatched'")), true);
});
