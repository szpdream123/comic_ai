import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  failStaleGenerationTasksBeforeProviderSubmission,
  repairQueuedGenerationTaskOutbox,
  repairRunningSeedancePollJobs,
} from "../generation-redis-repair.service.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation Redis dispatch repair", () => {
  it("uses fixed queue repair paths without a stage-assignment query", async () => {
    const queries: string[] = [];
    await repairRunningSeedancePollJobs({
      async query(sql: string) {
        queries.push(sql);
        return { rows: [] };
      },
    } as never, {
      now: new Date("2026-06-03T06:00:00.000Z"),
      limit: 10,
      config: loadGenerationQueueConfig({}),
      publisher: { async add() {} },
    });
    assert.equal(queries.some((sql) => /generation_queue_stage_assignments/.test(sql)), false);
  });

  it("repairs stale queued tasks through the outbox without a dynamic queue directory", async () => {
    const queries: string[] = [];
    await repairQueuedGenerationTaskOutbox({
      async query(sql: string) {
        queries.push(sql);
        return { rows: [] };
      },
    } as never, {
      now: new Date("2026-06-03T06:00:00.000Z"),
      limit: 10,
    });
    assert.equal(queries.some((sql) => /generation_queue_shards|generation_queue_stage_assignments/.test(sql)), false);
  });

  it("keeps stale pre-submission failure handling independent of queue assignment records", async () => {
    const queries: string[] = [];
    await failStaleGenerationTasksBeforeProviderSubmission({
      async query(sql: string) {
        queries.push(sql);
        return { rows: [] };
      },
    } as never, {
      now: new Date("2026-06-03T06:00:00.000Z"),
      limit: 10,
    });
    assert.equal(queries.some((sql) => /generation_queue_shards|generation_queue_stage_assignments/.test(sql)), false);
  });
});
