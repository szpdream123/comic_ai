import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  claimGenerationQueueAdminCommand,
  completeGenerationQueueAdminCommand,
  createGenerationQueueAdminCommand,
  listDueGenerationQueueAdminCommandIds,
  saveGenerationQueueAdminCommandCheckpoint,
} from "../generation-queue-admin-command.store.ts";

describe("generation queue admin command store", { concurrency: false }, () => {
  it("deduplicates identical requests and rejects an idempotency-key payload mismatch", async () => {
    const db = await createAdminCommandTestDb();
    try {
      const now = new Date("2026-07-25T00:00:00.000Z");
      const first = await createGenerationQueueAdminCommand(db, {
        id: "76000000-0000-4000-8000-000000000001",
        adminAccountId: "76000000-0000-4000-8000-000000000101",
        idempotencyKey: "same-key",
        queueName: " generation-submit-video ",
        jobId: " job-1 ",
        action: "retry",
        reason: "retry provider timeout",
        now,
      });
      const duplicate = await createGenerationQueueAdminCommand(db, {
        id: "76000000-0000-4000-8000-000000000002",
        adminAccountId: "76000000-0000-4000-8000-000000000101",
        idempotencyKey: "same-key",
        queueName: "generation-submit-video",
        jobId: "job-1",
        action: "retry",
        reason: "retry provider timeout",
        now: new Date(now.getTime() + 1_000),
      });

      assert.equal(duplicate.id, first.id);
      assert.equal(first.queueName, "generation-submit-video");
      await assert.rejects(
        createGenerationQueueAdminCommand(db, {
          id: "76000000-0000-4000-8000-000000000003",
          adminAccountId: "76000000-0000-4000-8000-000000000101",
          idempotencyKey: "same-key",
          queueName: "generation-submit-video",
          jobId: "job-1",
          action: "remove",
          reason: "retry provider timeout",
          now,
        }),
        /generation_queue_admin_command_idempotency_conflict/,
      );
    } finally {
      await db.close();
    }
  });

  it("serializes commands per queue job and fences an expired worker", async () => {
    const db = await createAdminCommandTestDb();
    try {
      const now = new Date("2026-07-25T01:00:00.000Z");
      const first = await createCommand(db, "011", "key-a", now);
      const second = await createCommand(db, "012", "key-b", now);
      assert.ok(await claimGenerationQueueAdminCommand(db, {
        commandId: first.id, workerId: "worker-a", now, leaseMs: 5_000,
      }));
      assert.equal(await claimGenerationQueueAdminCommand(db, {
        commandId: second.id, workerId: "worker-b", now, leaseMs: 5_000,
      }), null);

      const afterExpiry = new Date(now.getTime() + 5_001);
      assert.ok(await claimGenerationQueueAdminCommand(db, {
        commandId: second.id, workerId: "worker-b", now: afterExpiry, leaseMs: 5_000,
      }));
      await assert.rejects(
        saveGenerationQueueAdminCommandCheckpoint(db, {
          commandId: first.id,
          workerId: "worker-a",
          checkpoint: { sourceRemoved: true },
          now: afterExpiry,
          leaseMs: 5_000,
        }),
        /generation_queue_admin_command_lease_lost/,
      );
    } finally {
      await db.close();
    }
  });

  it("does not reclaim a completed command", async () => {
    const db = await createAdminCommandTestDb();
    try {
      const now = new Date("2026-07-25T02:00:00.000Z");
      const command = await createCommand(db, "021", "key-complete", now);
      await claimGenerationQueueAdminCommand(db, {
        commandId: command.id, workerId: "worker-a", now, leaseMs: 5_000,
      });
      await completeGenerationQueueAdminCommand(db, {
        commandId: command.id,
        workerId: "worker-a",
        result: { action: "retry" },
        now: new Date(now.getTime() + 1_000),
      });
      assert.equal(await claimGenerationQueueAdminCommand(db, {
        commandId: command.id,
        workerId: "worker-b",
        now: new Date(now.getTime() + 2_000),
      }), null);
    } finally {
      await db.close();
    }
  });

  it("lists pending, expired processing, and due retryable commands only", async () => {
    const db = await createAdminCommandTestDb();
    try {
      const now = new Date("2026-07-25T03:00:00.000Z");
      const pending = await createCommand(db, "031", "key-pending", now);
      const expiredProcessing = await createCommand(db, "032", "key-expired", now);
      const freshProcessing = await createCommand(db, "033", "key-processing", now);
      const dueRetryable = await createCommand(db, "034", "key-due-retry", now);
      const freshRetryable = await createCommand(db, "035", "key-fresh-retry", now);

      await db.query(
        `
          UPDATE generation_queue_admin_commands
          SET status = 'processing', locked_by = 'expired-worker', locked_until = $2
          WHERE id = $1
        `,
        [expiredProcessing.id, new Date(now.getTime() - 1)],
      );
      await db.query(
        `
          UPDATE generation_queue_admin_commands
          SET status = 'processing', locked_by = 'active-worker', locked_until = $2
          WHERE id = $1
        `,
        [freshProcessing.id, new Date(now.getTime() + 60_000)],
      );
      await db.query(
        "UPDATE generation_queue_admin_commands SET status = 'failed_retryable', updated_at = $2 WHERE id = $1",
        [dueRetryable.id, new Date(now.getTime() - 30_001)],
      );
      await db.query(
        "UPDATE generation_queue_admin_commands SET status = 'failed_retryable', updated_at = $2 WHERE id = $1",
        [freshRetryable.id, new Date(now.getTime() - 29_999)],
      );

      const dueIds = await listDueGenerationQueueAdminCommandIds(db, {
        now,
        limit: 10,
        retryDelayMs: 30_000,
      });

      assert.deepEqual(dueIds, [pending.id, expiredProcessing.id, dueRetryable.id]);
    } finally {
      await db.close();
    }
  });
});

async function createAdminCommandTestDb() {
  const db = await createMigratedTestDb();
  const migration = await readFile(
    join(process.cwd(), "packages", "db", "migrations", "20260725-z-generation-queue-admin-commands.sql"),
    "utf8",
  );
  await db.query(migration);
  return db;
}

function createCommand(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  suffix: string,
  idempotencyKey: string,
  now: Date,
) {
  return createGenerationQueueAdminCommand(db, {
    id: `76000000-0000-4000-8000-000000000${suffix}`,
    adminAccountId: "76000000-0000-4000-8000-000000000101",
    idempotencyKey,
    queueName: "generation-submit-video",
    jobId: "job-shared",
    action: "retry",
    reason: "retry provider timeout",
    now,
  });
}
