import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  recoverGenerationQueueAdminCommands,
} from "../generation-queue-admin-command.recovery.ts";
import {
  claimGenerationQueueAdminCommand,
  createGenerationQueueAdminCommand,
  readGenerationQueueAdminCommand,
  saveGenerationQueueAdminCommandCheckpoint,
} from "../generation-queue-admin-command.store.ts";
import type {
  GenerationQueueJobOperationCheckpoint,
  GenerationQueueJobOpsService,
} from "../generation-queue-job-ops.service.ts";

describe("generation queue admin command recovery", { concurrency: false }, () => {
  it("automatically completes a pending command and extends its lease while saving a checkpoint", async () => {
    const db = await createAdminCommandTestDb();
    try {
      const now = new Date();
      const command = await createCommand(db, "001", "pending-success", now);
      let leaseBeforeSave = 0;
      let leaseAfterSave = 0;
      const checkpoint: GenerationQueueJobOperationCheckpoint = { actionApplied: true };
      const jobOps = fakeJobOps(async (input) => {
        const claimed = await readGenerationQueueAdminCommand(db, command.id);
        leaseBeforeSave = new Date(claimed?.lockedUntil ?? 0).getTime();
        await new Promise((resolve) => setTimeout(resolve, 20));
        await input.journal?.save(checkpoint);
        const saved = await readGenerationQueueAdminCommand(db, command.id);
        leaseAfterSave = new Date(saved?.lockedUntil ?? 0).getTime();
        return successResult();
      });

      const result = await recoverGenerationQueueAdminCommands(db, {
        now,
        limit: 10,
        workerId: "recovery-a",
        jobOps,
        leaseMs: 5_000,
      });

      assert.deepEqual(result, {
        recoveredCommandIds: [command.id],
        terminalCommandIds: [],
        retryableCommandIds: [],
      });
      assert.ok(leaseAfterSave > leaseBeforeSave);
      const recovered = await readGenerationQueueAdminCommand(db, command.id);
      assert.equal(recovered?.status, "succeeded");
      assert.deepEqual(recovered?.checkpoint, checkpoint);
      assert.deepEqual(recovered?.result, successResult().body);
      const audit = await db.query<{ event_type: string; actor_admin_account_id: string }>(
        `SELECT event_type, actor_admin_account_id
         FROM audit_events
         WHERE event_type = 'admin.ops.generation_queue_job_operated'`,
      );
      assert.deepEqual(audit.rows, [{
        event_type: "admin.ops.generation_queue_job_operated",
        actor_admin_account_id: ADMIN_ACCOUNT_ID,
      }]);
    } finally {
      await db.close();
    }
  });

  it("reclaims expired processing and resumes from its persisted checkpoint", async () => {
    const db = await createAdminCommandTestDb();
    try {
      const now = new Date();
      const staleAt = new Date(now.getTime() - 10_000);
      const command = await createCommand(db, "002", "expired-processing", staleAt);
      await claimGenerationQueueAdminCommand(db, {
        commandId: command.id,
        workerId: "dead-worker",
        now: staleAt,
        leaseMs: 5_000,
      });
      const checkpoint: GenerationQueueJobOperationCheckpoint = {
        sourceRemoved: true,
        sourceAssignmentReleased: true,
      };
      await saveGenerationQueueAdminCommandCheckpoint(db, {
        commandId: command.id,
        workerId: "dead-worker",
        checkpoint,
        now: new Date(staleAt.getTime() + 1_000),
        leaseMs: 5_000,
      });
      let loadedCheckpoint: GenerationQueueJobOperationCheckpoint | undefined;

      const result = await recoverGenerationQueueAdminCommands(db, {
        now,
        limit: 10,
        workerId: "recovery-b",
        jobOps: fakeJobOps(async (input) => {
          loadedCheckpoint = await input.journal?.load();
          return successResult();
        }),
      });

      assert.deepEqual(result.recoveredCommandIds, [command.id]);
      assert.deepEqual(loadedCheckpoint, checkpoint);
      assert.equal((await readGenerationQueueAdminCommand(db, command.id))?.status, "succeeded");
    } finally {
      await db.close();
    }
  });

  it("reclaims a due retryable command but leaves a fresh retryable command untouched", async () => {
    const db = await createAdminCommandTestDb();
    try {
      const now = new Date();
      const due = await createCommand(db, "003", "due-retryable", now);
      const fresh = await createCommand(db, "004", "fresh-retryable", now, "job-fresh");
      await db.query(
        `UPDATE generation_queue_admin_commands
         SET status = 'failed_retryable', updated_at = $2
         WHERE id = $1`,
        [due.id, new Date(now.getTime() - 31_000)],
      );
      await db.query(
        `UPDATE generation_queue_admin_commands
         SET status = 'failed_retryable', updated_at = $2
         WHERE id = $1`,
        [fresh.id, new Date(now.getTime() - 5_000)],
      );
      const operatedJobIds: string[] = [];

      const result = await recoverGenerationQueueAdminCommands(db, {
        now,
        limit: 10,
        workerId: "recovery-c",
        jobOps: fakeJobOps(async (input) => {
          operatedJobIds.push(input.jobId);
          return successResult(input.jobId);
        }),
        retryDelayMs: 30_000,
      });

      assert.deepEqual(result.recoveredCommandIds, [due.id]);
      assert.deepEqual(operatedJobIds, ["job-shared"]);
      assert.equal((await readGenerationQueueAdminCommand(db, due.id))?.status, "succeeded");
      assert.equal((await readGenerationQueueAdminCommand(db, fresh.id))?.status, "failed_retryable");
    } finally {
      await db.close();
    }
  });

  it("marks a non-successful job operation as terminal", async () => {
    const db = await createAdminCommandTestDb();
    try {
      const now = new Date();
      const command = await createCommand(db, "005", "terminal-error", now);

      const result = await recoverGenerationQueueAdminCommands(db, {
        now,
        limit: 10,
        workerId: "recovery-d",
        jobOps: fakeJobOps(async () => ({
          status: 409,
          body: { error: "generation_queue_job_not_retryable" },
        })),
      });

      assert.deepEqual(result.terminalCommandIds, [command.id]);
      const failed = await readGenerationQueueAdminCommand(db, command.id);
      assert.equal(failed?.status, "failed_terminal");
      assert.equal(failed?.lastError, "generation_queue_job_not_retryable");
    } finally {
      await db.close();
    }
  });

  it("keeps a thrown job operation retryable", async () => {
    const db = await createAdminCommandTestDb();
    try {
      const now = new Date();
      const command = await createCommand(db, "006", "retryable-error", now);

      const result = await recoverGenerationQueueAdminCommands(db, {
        now,
        limit: 10,
        workerId: "recovery-e",
        jobOps: fakeJobOps(async () => {
          throw new Error("redis unavailable");
        }),
      });

      assert.deepEqual(result.retryableCommandIds, [command.id]);
      const failed = await readGenerationQueueAdminCommand(db, command.id);
      assert.equal(failed?.status, "failed_retryable");
      assert.equal(failed?.lastError, "redis unavailable");
      assert.equal(failed?.lockedBy, null);
      assert.equal(failed?.lockedUntil, null);
    } finally {
      await db.close();
    }
  });
});

const ADMIN_ACCOUNT_ID = "76000000-0000-4000-8000-000000000101";

async function createAdminCommandTestDb() {
  const db = await createMigratedTestDb();
  const migration = await readFile(
    join(process.cwd(), "packages", "db", "migrations", "20260725-z-generation-queue-admin-commands.sql"),
    "utf8",
  );
  await db.query(migration);
  await db.query(
    `INSERT INTO admin_accounts (
       id, login_name, password_hash, display_name, status
     ) VALUES ($1, 'generation_recovery_test', 'plain:not-used', 'Recovery Test Admin', 'active')`,
    [ADMIN_ACCOUNT_ID],
  );
  return db;
}

function createCommand(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  suffix: string,
  idempotencyKey: string,
  now: Date,
  jobId = "job-shared",
) {
  return createGenerationQueueAdminCommand(db, {
    id: `76000000-0000-4000-8000-000000000${suffix}`,
    adminAccountId: ADMIN_ACCOUNT_ID,
    idempotencyKey,
    queueName: "generation-submit-video",
    jobId,
    action: "retry",
    reason: "retry provider timeout",
    now,
  });
}

function fakeJobOps(
  operate: GenerationQueueJobOpsService["operate"],
): GenerationQueueJobOpsService {
  return { operate };
}

function successResult(jobId = "job-shared") {
  return {
    status: 200 as const,
    body: {
      queueName: "generation-submit-video",
      jobId,
      jobName: "generation.video.submit",
      action: "retry" as const,
      previousState: "failed",
      attemptsMade: 1,
      failedReason: "provider timeout",
    },
  };
}
