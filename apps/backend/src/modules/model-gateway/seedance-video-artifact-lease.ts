import type { SqlDatabase } from "../shared/db/sql.ts";
import { runWithDatabaseContext } from "../shared/db/dev-db.ts";
import { createImageArtifactLeaseGuard, isImageArtifactLeaseLost } from "./gpt-image-artifact-lease.ts";
import { GENERATION_ARTIFACT_LEASE_BUSY } from "./generation-skipped-coordinator.ts";

// The ownership fence is media-independent; reuse its short transactions.
export { assertImageArtifactLeaseActive as assertVideoArtifactLeaseActive,
  isImageArtifactLeaseLost as isVideoArtifactLeaseLost } from "./gpt-image-artifact-lease.ts";

interface VideoArtifactLease { taskId: string; attemptId: string; owner: string }
const leaseMs = 5 * 60_000;

export async function claimVideoArtifactLease(db: SqlDatabase, input: VideoArtifactLease & { now: Date }) {
  const result = await db.query<{ claimed: boolean }>(`
    WITH claimed_task AS (
      UPDATE tasks task
      SET status = 'running', failure_code = NULL, locked_by = $3, locked_until = $4,
          heartbeat_at = $5, updated_at = $5
      WHERE task.id = $1 AND task.current_attempt_id = $2
        AND task.status IN ('running', 'manual_review_required', 'result_unknown')
        AND (task.locked_until IS NULL OR task.locked_until <= $5 OR task.locked_by = $3)
        AND EXISTS (SELECT 1 FROM task_attempts WHERE id = $2 AND task_id = $1)
      RETURNING task.id
    ), claimed_attempt AS (
      UPDATE task_attempts
      SET locked_by = $3, locked_until = $4, heartbeat_at = $5
      WHERE id = $2 AND task_id = $1 AND EXISTS (SELECT 1 FROM claimed_task)
      RETURNING id
    ) SELECT EXISTS (SELECT 1 FROM claimed_attempt) AS claimed
  `, [input.taskId, input.attemptId, input.owner, new Date(input.now.getTime() + leaseMs), input.now]);
  return result.rows[0]?.claimed === true;
}

export async function runWithVideoArtifactLease<T>(db: SqlDatabase, lease: VideoArtifactLease,
  operation: (guardedDb: SqlDatabase) => Promise<T>) {
  const guard = createImageArtifactLeaseGuard(db, lease);
  let renewing: Promise<void> | null = null;
  let lost = false;
  const invalidate = () => { lost = true; guard.invalidate(); };
  const heartbeat = setInterval(() => {
    if (renewing || lost || guard.finalized) return;
    renewing = runWithDatabaseContext(async () => {
      const now = new Date();
      const result = await db.query(`
        WITH renewed_task AS (
          UPDATE tasks SET locked_until = $4, heartbeat_at = $5, updated_at = $5
          WHERE id = $1 AND current_attempt_id = $2 AND locked_by = $3 AND locked_until > $5
          RETURNING id
        ) UPDATE task_attempts SET locked_until = $4, heartbeat_at = $5
          WHERE id = $2 AND task_id = $1 AND locked_by = $3
            AND EXISTS (SELECT 1 FROM renewed_task)
          RETURNING id
      `, [lease.taskId, lease.attemptId, lease.owner, new Date(now.getTime() + leaseMs), now]);
      if (!result.rows.length) invalidate();
    }).catch(invalidate).finally(() => { renewing = null; });
  }, 30_000);
  heartbeat.unref?.();
  try {
    return await operation(guard.db);
  } catch (error) {
    if (isImageArtifactLeaseLost(error)) return videoArtifactLeaseBusy();
    throw error;
  } finally {
    clearInterval(heartbeat);
    await renewing;
    await db.query(`
      WITH released_task AS (
        UPDATE tasks SET locked_by = NULL, locked_until = NULL, heartbeat_at = NULL
        WHERE id = $1 AND current_attempt_id = $2 AND locked_by = $3 RETURNING id
      ) UPDATE task_attempts SET locked_by = NULL, locked_until = NULL, heartbeat_at = NULL
        WHERE id = $2 AND task_id = $1 AND locked_by = $3
    `, [lease.taskId, lease.attemptId, lease.owner]).catch(() => undefined);
  }
}

export function videoArtifactLeaseBusy() {
  return { status: "failed" as const, failureCode: GENERATION_ARTIFACT_LEASE_BUSY };
}
