import type { SqlDatabase } from "../shared/db/sql.ts";
import { GENERATION_ARTIFACT_LEASE_BUSY } from "./generation-skipped-coordinator.ts";

const guardedDatabases = new WeakSet<SqlDatabase>();

export function isImageArtifactLeaseLost(error: unknown) {
  return (error as { failureCode?: string } | null)?.failureCode === GENERATION_ARTIFACT_LEASE_BUSY;
}

export async function assertImageArtifactLeaseActive(db: SqlDatabase) {
  if (guardedDatabases.has(db)) await db.query("SELECT 1");
}

export function createImageArtifactLeaseGuard(db: SqlDatabase, lease: { taskId: string; attemptId: string; owner: string }) {
  let invalid = false;
  let transaction = false;
  let finalizedStatus: string | null = null;
  let pending = Promise.resolve();
  const lost = () => Object.assign(new Error(GENERATION_ARTIFACT_LEASE_BUSY), {
    failureCode: GENERATION_ARTIFACT_LEASE_BUSY,
  });
  const assertValid = () => { if (invalid) throw lost(); };
  const readLockedOwner = async () => {
    const result = await db.query<{ status: string; locked_by: string | null; attempt_owner: string | null }>(`
      SELECT task.status, task.locked_by, attempt.locked_by AS attempt_owner
      FROM tasks task JOIN task_attempts attempt ON attempt.id = task.current_attempt_id AND attempt.task_id = task.id
      WHERE task.id = $1 AND task.current_attempt_id = $2
      FOR UPDATE OF task, attempt
    `, [lease.taskId, lease.attemptId]);
    return result.rows[0];
  };
  const assertOwner = async () => {
    assertValid();
    const row = await readLockedOwner();
    // Claim and every publication serialize on these rows. Once a successor
    // claims an expired lease, the previous owner cannot publish any effects.
    const owns = row && (finalizedStatus
      ? row.status === finalizedStatus && row.locked_by === null
        && (row.attempt_owner === null || row.attempt_owner === lease.owner)
      : row.locked_by === lease.owner && row.attempt_owner === lease.owner);
    if (!owns) { invalid = true; throw lost(); }
    assertValid();
  };
  const rollback = async () => {
    transaction = false;
    await db.query("ROLLBACK");
  };
  const guardedDb: SqlDatabase = {
    query<T>(sql: string, params?: unknown[]) {
      // Helpers occasionally issue concurrent reads. Keep their short database
      // transactions separate without extending a transaction over network IO.
      const run = pending.then(async () => {
        const command = sql.trim().replace(/;$/, "").toUpperCase();
        if (command === "ROLLBACK") return rollback().then(() => ({ rows: [] as T[] }));
        try {
          assertValid();
          if (command === "BEGIN") {
            if (transaction) throw new Error("image_artifact_nested_transaction");
            await db.query("BEGIN");
            transaction = true;
            await assertOwner();
            return { rows: [] as T[] };
          }
          if (command === "COMMIT") {
            const row = await readLockedOwner();
            const completed = row && row.locked_by === null
              && (row.attempt_owner === null || row.attempt_owner === lease.owner)
              && ["succeeded", "failed", "manual_review_required", "canceled"].includes(row.status);
            assertValid();
            const result = await db.query<T>(sql, params);
            transaction = false;
            if (completed) finalizedStatus = row.status;
            return result;
          }
          if (transaction) return await db.query<T>(sql, params);
          await db.query("BEGIN");
          transaction = true;
          await assertOwner();
          const result = await db.query<T>(sql, params);
          assertValid();
          await db.query("COMMIT");
          transaction = false;
          return result;
        } catch (error) {
          if (transaction) await rollback().catch(() => undefined);
          throw error;
        }
      });
      pending = run.then(() => undefined, () => undefined);
      return run;
    },
  };
  guardedDatabases.add(guardedDb);
  return {
    db: guardedDb,
    invalidate() { if (!finalizedStatus) invalid = true; },
    get finalized() { return finalizedStatus !== null; },
  };
}
