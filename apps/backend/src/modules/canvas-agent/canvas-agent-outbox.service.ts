import type { SqlDatabase } from "../shared/db/sql.ts";

export interface CanvasAgentWakeupPublisher {
  publish(input: {
    taskId: string;
    eventKey: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

interface OutboxRow {
  id: string;
  task_id: string;
  event_key: string;
  payload_json: Record<string, unknown>;
}

export class CanvasAgentOutboxService {
  constructor(
    private readonly deps: {
      db: SqlDatabase;
      publisher: CanvasAgentWakeupPublisher;
      workerId: string;
      now?: () => Date;
    },
  ) {}

  async dispatchBatch(limit = 50) {
    const now = (this.deps.now ?? (() => new Date()))();
    const rows = await this.claim(Math.min(Math.max(limit, 1), 200), now);
    let dispatched = 0;
    for (const row of rows) {
      try {
        await this.deps.publisher.publish({
          taskId: row.task_id,
          eventKey: row.event_key,
          payload: row.payload_json ?? {},
        });
        await this.deps.db.query(
          `
            UPDATE canvas_agent_outbox
            SET status='dispatched', dispatched_at=$3, locked_by=NULL,
                locked_at=NULL, last_error=NULL, updated_at=$3
            WHERE id=$1 AND status='dispatching' AND locked_by=$2
          `,
          [row.id, this.deps.workerId, now],
        );
        dispatched += 1;
      } catch (error) {
        await this.deps.db.query(
          `
            UPDATE canvas_agent_outbox
            SET status='pending', available_at=$3, locked_by=NULL, locked_at=NULL,
                last_error=$4, updated_at=$2
            WHERE id=$1 AND status='dispatching' AND locked_by=$5
          `,
          [
            row.id,
            now,
            new Date(now.getTime() + retryDelayMs(row)),
            redactError(error),
            this.deps.workerId,
          ],
        );
      }
    }
    return { claimed: rows.length, dispatched };
  }

  async releaseStaleLocks(lockTimeoutMs = 60_000) {
    const now = (this.deps.now ?? (() => new Date()))();
    const result = await this.deps.db.query<{ id: string }>(
      `
        UPDATE canvas_agent_outbox
        SET status='pending', locked_by=NULL, locked_at=NULL, available_at=$2, updated_at=$2
        WHERE status='dispatching' AND locked_at < $1
        RETURNING id
      `,
      [new Date(now.getTime() - lockTimeoutMs), now],
    );
    return result.rows.length;
  }

  private async claim(limit: number, now: Date) {
    const result = await this.deps.db.query<OutboxRow>(
      `
        WITH candidates AS (
          SELECT id FROM canvas_agent_outbox
          WHERE status='pending' AND available_at <= $1
          ORDER BY created_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        UPDATE canvas_agent_outbox outbox
        SET status='dispatching', locked_by=$3, locked_at=$1,
            attempt_count=attempt_count+1, updated_at=$1
        FROM candidates
        WHERE outbox.id=candidates.id
        RETURNING outbox.id, outbox.task_id, outbox.event_key, outbox.payload_json
      `,
      [now, limit, this.deps.workerId],
    );
    return result.rows;
  }
}

function retryDelayMs(row: OutboxRow) {
  const seed = row.id.charCodeAt(0) || 1;
  return 1_000 + (seed % 10) * 100;
}

function redactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(api[-_]?key|authorization|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]").slice(0, 500);
}
