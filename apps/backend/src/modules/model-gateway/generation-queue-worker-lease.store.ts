import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export async function reconcileGenerationQueueWorkerLeases(
  db: SqlDatabase,
  input: {
    ownerId: string;
    candidateQueueNames: string[];
    limit: number;
    now: Date;
    leaseMs: number;
  },
) {
  const result = await db.query<{ queue_name: string }>(
    `
      SELECT queue_name
      FROM reconcile_generation_queue_worker_leases($1, $2::text[], $3, $4, $5)
    `,
    [input.ownerId, input.candidateQueueNames, input.limit, input.now, input.leaseMs],
  );
  return result.rows.map((row) => row.queue_name);
}

export async function releaseGenerationQueueWorkerLeases(
  db: SqlDatabase,
  ownerId: string,
) {
  const row = await queryOne<{ released_count: number }>(
    db,
    `SELECT release_generation_queue_worker_leases($1)::int AS released_count`,
    [ownerId],
  );
  return row?.released_count ?? 0;
}
