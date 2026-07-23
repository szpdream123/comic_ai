import type { SqlDatabase } from "../shared/db/sql.ts";

export interface GenerationQueueJobRemover {
  removeJob(queueName: string, jobId: string): Promise<"removed" | "missing">;
}

interface CancellationRow {
  assignment_key: string;
  queue_name: string;
  redis_job_id: string;
}

export async function processGenerationQueueJobCancellations(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    remover: GenerationQueueJobRemover;
  },
) {
  const leaseUntil = new Date(input.now.getTime() + 30_000);
  const claimed = await db.query<CancellationRow>(
    `
      WITH due AS (
        SELECT cancellation.assignment_key
        FROM generation_queue_job_cancellations cancellation
        WHERE (
            cancellation.status = 'pending'
            OR (
              cancellation.status = 'processing'
              AND cancellation.locked_until <= $1
            )
          )
          AND cancellation.publish_fence_until <= $1
        ORDER BY cancellation.created_at, cancellation.assignment_key
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE generation_queue_job_cancellations cancellation
      SET status = 'processing',
          attempts = cancellation.attempts + 1,
          locked_until = $3,
          last_error = NULL,
          updated_at = $1
      FROM due
      WHERE cancellation.assignment_key = due.assignment_key
      RETURNING cancellation.assignment_key, cancellation.queue_name, cancellation.redis_job_id
    `,
    [input.now, Math.max(1, Math.floor(input.limit)), leaseUntil],
  );

  const completedAssignmentKeys: string[] = [];
  const failedAssignmentKeys: string[] = [];
  for (const cancellation of claimed.rows) {
    try {
      await input.remover.removeJob(cancellation.queue_name, cancellation.redis_job_id);
      await db.query(
        `
          UPDATE generation_queue_job_cancellations
          SET status = 'completed',
              locked_until = NULL,
              last_error = NULL,
              completed_at = $2,
              updated_at = $2
          WHERE assignment_key = $1
            AND status = 'processing'
        `,
        [cancellation.assignment_key, input.now],
      );
      completedAssignmentKeys.push(cancellation.assignment_key);
    } catch (error) {
      await db.query(
        `
          UPDATE generation_queue_job_cancellations
          SET status = 'pending',
              locked_until = NULL,
              last_error = $2,
              updated_at = $3
          WHERE assignment_key = $1
            AND status = 'processing'
        `,
        [
          cancellation.assignment_key,
          error instanceof Error ? error.message : String(error),
          input.now,
        ],
      );
      failedAssignmentKeys.push(cancellation.assignment_key);
    }
  }

  return { completedAssignmentKeys, failedAssignmentKeys };
}
