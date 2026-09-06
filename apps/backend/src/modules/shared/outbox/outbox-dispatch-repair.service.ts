import type { SqlDatabase } from "../db/sql.ts";
import { queryOne } from "../db/sql.ts";

export interface OutboxEventRecord {
  id: string;
  userId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "processed" | "failed";
  availableAt: Date;
  processedAt: Date | null;
  errorMessage: string | null;
  attemptCount?: number;
  lastAttemptAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OutboxEventRow {
  id: string;
  user_id: string | null;
  event_type: string;
  payload_json: Record<string, unknown>;
  status: OutboxEventRecord["status"];
  available_at: Date | string;
  processed_at: Date | string | null;
  error_message: string | null;
  attempt_count?: number;
  last_attempt_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const defaultStaleProcessingMs = 2 * 60 * 1000;

export async function claimOutboxEventsForDispatch(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    staleProcessingMs?: number;
    eventTypes?: string[];
    fairnessScope?: string;
    membershipQuantum?: number;
    taskEnvironment?: string;
  },
): Promise<OutboxEventRecord[]> {
  const staleCutoff = new Date(
    input.now.getTime() - (input.staleProcessingMs ?? defaultStaleProcessingMs),
  );
  const eventTypes = input.eventTypes?.filter((eventType) => eventType.trim());
  const fairnessScope = input.fairnessScope?.trim();
  if (fairnessScope) {
    return claimFairOutboxEventsForDispatch(db, {
      now: input.now,
      staleCutoff,
      limit: input.limit,
      eventTypes,
      fairnessScope,
      membershipQuantum: Math.max(1, Math.floor(input.membershipQuantum ?? 1)),
      taskEnvironment: input.taskEnvironment,
    });
  }
  const eventTypeWhere = eventTypes?.length ? "AND event_type = ANY($4::text[])" : "";
  const taskEnvironmentParam = eventTypes?.length ? 5 : 4;
  const taskEnvironmentWhere = input.taskEnvironment
    ? `AND EXISTS (
        SELECT 1
        FROM tasks task_filter
        WHERE task_filter.id = CASE
          WHEN payload_json->>'taskId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (payload_json->>'taskId')::uuid
          ELSE NULL
        END
          AND task_filter.input_snapshot_json->>'workerEnvironment' = $${taskEnvironmentParam}
          AND canvas_agent_scope_allowed(task_filter.input_snapshot_json)
      )`
    : "";
  const taskEnvironmentEventWhere = input.taskEnvironment
    ? `AND EXISTS (
        SELECT 1 FROM tasks task_filter
        WHERE task_filter.id = CASE
          WHEN event.payload_json->>'taskId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (event.payload_json->>'taskId')::uuid
          ELSE NULL
        END
          AND task_filter.input_snapshot_json->>'workerEnvironment' = $${taskEnvironmentParam}
          AND canvas_agent_scope_allowed(task_filter.input_snapshot_json)
      )`
    : "";
  const queryParams = eventTypes?.length
    ? (input.taskEnvironment
      ? [input.now, staleCutoff, input.limit, eventTypes, input.taskEnvironment]
      : [input.now, staleCutoff, input.limit, eventTypes])
    : (input.taskEnvironment
      ? [input.now, staleCutoff, input.limit, input.taskEnvironment]
      : [input.now, staleCutoff, input.limit]);
  const claimedRows = await db.query<OutboxEventRow>(
    `
      WITH fair_users AS (
        SELECT user_id
        FROM outbox_events
        WHERE (
            (
              status IN ('pending', 'failed')
              AND available_at <= $1
            )
            OR (
              status = 'processing'
              AND updated_at < $2
            )
          )
          ${eventTypeWhere}
          ${taskEnvironmentWhere}
        GROUP BY user_id
        ORDER BY min(available_at) ASC, min(created_at) ASC, user_id NULLS FIRST
        LIMIT $3
      ),
      round_robin_candidates AS (
        SELECT candidate.id
        FROM fair_users fair_user
        CROSS JOIN LATERAL (
          SELECT event.id
          FROM outbox_events event
          WHERE (
              (
                event.status IN ('pending', 'failed')
                AND event.available_at <= $1
              )
              OR (
                event.status = 'processing'
                AND event.updated_at < $2
              )
            )
            ${eventTypes?.length ? "AND event.event_type = ANY($4::text[])" : ""}
            ${taskEnvironmentEventWhere}
            AND event.user_id IS NOT DISTINCT FROM fair_user.user_id
          ORDER BY event.available_at ASC, event.created_at ASC, event.id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        ) candidate
      ),
      remaining_candidates AS (
        SELECT event.id
        FROM outbox_events event
        WHERE (
            (
              event.status IN ('pending', 'failed')
              AND event.available_at <= $1
            )
            OR (
              event.status = 'processing'
              AND event.updated_at < $2
            )
          )
          ${eventTypes?.length ? "AND event.event_type = ANY($4::text[])" : ""}
          ${taskEnvironmentWhere.replaceAll("payload_json", "event.payload_json")}
          AND NOT EXISTS (
            SELECT 1
            FROM round_robin_candidates round_robin
            WHERE round_robin.id = event.id
          )
        ORDER BY event.available_at ASC, event.created_at ASC, event.id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT GREATEST($3 - (SELECT count(*) FROM round_robin_candidates), 0)
      ),
      candidates AS (
        SELECT id FROM round_robin_candidates
        UNION ALL
        SELECT id FROM remaining_candidates
      )
      UPDATE outbox_events event
      SET status = 'processing',
          error_message = NULL,
          updated_at = $1
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.*
    `,
    queryParams,
  );

  return claimedRows.rows.map(outboxEventFromRow);
}

interface FairOutboxEventRow extends OutboxEventRow {
  fair_main_key: string;
  fair_child_key: string;
}

async function claimFairOutboxEventsForDispatch(
  db: SqlDatabase,
  input: {
    now: Date;
    staleCutoff: Date;
    limit: number;
    eventTypes?: string[];
    fairnessScope: string;
    membershipQuantum: number;
    taskEnvironment?: string;
  },
) {
  const limit = Math.max(0, Math.floor(input.limit));
  if (limit === 0) return [];
  const eventTypes = input.eventTypes?.length ? input.eventTypes : null;
  const claimed: OutboxEventRecord[] = [];
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query("SET LOCAL statement_timeout = '30s'");
    await db.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    await db.query(`
      INSERT INTO outbox_dispatch_fair_cursors (scope_key, main_key, cursor_key, updated_at)
      VALUES ($1, '*', '', $2)
      ON CONFLICT (scope_key, main_key) DO NOTHING
    `, [input.fairnessScope, input.now]);
    const cursor = await queryOne<{ cursor_key: string }>(
      db,
      `SELECT cursor_key FROM outbox_dispatch_fair_cursors WHERE scope_key = $1 AND main_key = '*' FOR UPDATE`,
      [input.fairnessScope],
    );
    let mainCursor = cursor?.cursor_key ?? "";

    while (claimed.length < limit) {
      const round = await db.query<FairOutboxEventRow>(
        `
          WITH main_users AS (
            SELECT
              COALESCE(event.user_id::text, 'anonymous') AS main_key,
              bool_or(event.payload_json->>'membershipPriority' = 'true')
                OR bool_or(membership.user_id IS NOT NULL) AS membership_priority
            FROM outbox_events event
            LEFT JOIN user_memberships membership
              ON membership.user_id = event.user_id
             AND membership.membership_tier = 'professional'
             AND membership.status = 'active'
             AND membership.expires_at > $1
            WHERE (
                (event.status IN ('pending', 'failed') AND event.available_at <= $1)
                OR (event.status = 'processing' AND event.updated_at < $2)
              )
              AND ($3::text[] IS NULL OR event.event_type = ANY($3::text[]))
              ${input.taskEnvironment ? "AND EXISTS (SELECT 1 FROM tasks task_filter WHERE task_filter.id = CASE WHEN event.payload_json->>'taskId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (event.payload_json->>'taskId')::uuid ELSE NULL END AND task_filter.input_snapshot_json->>'workerEnvironment' = $8 AND canvas_agent_scope_allowed(task_filter.input_snapshot_json))" : ""}
            GROUP BY COALESCE(event.user_id::text, 'anonymous')
          ),
          candidates AS (
            SELECT
              candidate.id,
              main.main_key,
              candidate.child_key,
              CASE WHEN main.main_key > $4 THEN 0 ELSE 1 END AS main_wrap,
              CASE WHEN candidate.child_key > COALESCE(child_cursor.cursor_key, '') THEN 0 ELSE 1 END AS child_wrap
            FROM main_users main
            LEFT JOIN outbox_dispatch_fair_cursors child_cursor
              ON child_cursor.scope_key = $5
             AND child_cursor.main_key = main.main_key
            CROSS JOIN LATERAL (
              WITH child_users AS (
                SELECT COALESCE(
                  NULLIF(event.payload_json->>'teamMemberId', ''),
                  NULLIF(event.payload_json->>'memberId', ''),
                  NULLIF(task.input_snapshot_json->>'teamMemberId', ''),
                  NULLIF(task.input_snapshot_json->>'memberId', ''),
                  'main'
                ) AS child_key
                FROM outbox_events event
                LEFT JOIN tasks task ON task.id = CASE
                  WHEN event.payload_json->>'taskId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN (event.payload_json->>'taskId')::uuid
                  ELSE NULL
                END
                WHERE (
                    (event.status IN ('pending', 'failed') AND event.available_at <= $1)
                    OR (event.status = 'processing' AND event.updated_at < $2)
                  )
                  AND ($3::text[] IS NULL OR event.event_type = ANY($3::text[]))
                  ${input.taskEnvironment ? "AND EXISTS (SELECT 1 FROM tasks task_filter WHERE task_filter.id = CASE WHEN event.payload_json->>'taskId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (event.payload_json->>'taskId')::uuid ELSE NULL END AND task_filter.input_snapshot_json->>'workerEnvironment' = $8 AND canvas_agent_scope_allowed(task_filter.input_snapshot_json))" : ""}
                  AND COALESCE(event.user_id::text, 'anonymous') = main.main_key
                GROUP BY child_key
                ORDER BY
                  CASE WHEN COALESCE(
                    NULLIF(event.payload_json->>'teamMemberId', ''),
                    NULLIF(event.payload_json->>'memberId', ''),
                    NULLIF(task.input_snapshot_json->>'teamMemberId', ''),
                    NULLIF(task.input_snapshot_json->>'memberId', ''),
                    'main'
                  ) > COALESCE(child_cursor.cursor_key, '') THEN 0 ELSE 1 END,
                  child_key
                LIMIT CASE WHEN main.membership_priority THEN $6 ELSE 1 END
              ),
              first_candidates AS (
                SELECT locked.id, child.child_key
                FROM child_users child
                CROSS JOIN LATERAL (
                  SELECT event.id
                  FROM outbox_events event
                  LEFT JOIN tasks task ON task.id = CASE
                    WHEN event.payload_json->>'taskId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                      THEN (event.payload_json->>'taskId')::uuid
                    ELSE NULL
                  END
                  WHERE (
                      (event.status IN ('pending', 'failed') AND event.available_at <= $1)
                      OR (event.status = 'processing' AND event.updated_at < $2)
                    )
                    AND ($3::text[] IS NULL OR event.event_type = ANY($3::text[]))
                    ${input.taskEnvironment ? "AND EXISTS (SELECT 1 FROM tasks task_filter WHERE task_filter.id = CASE WHEN event.payload_json->>'taskId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (event.payload_json->>'taskId')::uuid ELSE NULL END AND task_filter.input_snapshot_json->>'workerEnvironment' = $8 AND canvas_agent_scope_allowed(task_filter.input_snapshot_json))" : ""}
                    AND COALESCE(event.user_id::text, 'anonymous') = main.main_key
                    AND COALESCE(
                      NULLIF(event.payload_json->>'teamMemberId', ''),
                      NULLIF(event.payload_json->>'memberId', ''),
                      NULLIF(task.input_snapshot_json->>'teamMemberId', ''),
                      NULLIF(task.input_snapshot_json->>'memberId', ''),
                      'main'
                    ) = child.child_key
                  ORDER BY event.available_at ASC, event.created_at ASC, event.id ASC
                  FOR UPDATE OF event SKIP LOCKED
                  LIMIT 1
                ) locked
              ),
              fill_candidates AS (
                SELECT event.id, COALESCE(
                  NULLIF(event.payload_json->>'teamMemberId', ''),
                  NULLIF(event.payload_json->>'memberId', ''),
                  NULLIF(task.input_snapshot_json->>'teamMemberId', ''),
                  NULLIF(task.input_snapshot_json->>'memberId', ''),
                  'main'
                ) AS child_key
                FROM outbox_events event
                LEFT JOIN tasks task ON task.id = CASE
                  WHEN event.payload_json->>'taskId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN (event.payload_json->>'taskId')::uuid
                  ELSE NULL
                END
                WHERE (
                    (event.status IN ('pending', 'failed') AND event.available_at <= $1)
                    OR (event.status = 'processing' AND event.updated_at < $2)
                  )
                  AND ($3::text[] IS NULL OR event.event_type = ANY($3::text[]))
                  ${input.taskEnvironment ? "AND EXISTS (SELECT 1 FROM tasks task_filter WHERE task_filter.id = CASE WHEN event.payload_json->>'taskId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (event.payload_json->>'taskId')::uuid ELSE NULL END AND task_filter.input_snapshot_json->>'workerEnvironment' = $8 AND canvas_agent_scope_allowed(task_filter.input_snapshot_json))" : ""}
                  AND COALESCE(event.user_id::text, 'anonymous') = main.main_key
                  AND NOT EXISTS (SELECT 1 FROM first_candidates first WHERE first.id = event.id)
                ORDER BY event.available_at ASC, event.created_at ASC, event.id ASC
                FOR UPDATE OF event SKIP LOCKED
                LIMIT GREATEST(
                  (CASE WHEN main.membership_priority THEN $6 ELSE 1 END)
                    - (SELECT count(*) FROM first_candidates),
                  0
                )
              )
              SELECT selected.id, selected.child_key
              FROM (
                SELECT 0 AS phase, first.id, first.child_key FROM first_candidates first
                UNION ALL
                SELECT 1 AS phase, fill.id, fill.child_key FROM fill_candidates fill
              ) selected
              ORDER BY selected.phase,
                       CASE WHEN selected.child_key > COALESCE(child_cursor.cursor_key, '') THEN 0 ELSE 1 END,
                       selected.child_key,
                       selected.id
            ) candidate
            ORDER BY
              CASE WHEN main.main_key > $4 THEN 0 ELSE 1 END,
              main.main_key,
              CASE WHEN candidate.child_key > COALESCE(child_cursor.cursor_key, '') THEN 0 ELSE 1 END,
              candidate.child_key
            LIMIT $7
          ),
          updated AS (
            UPDATE outbox_events event
            SET status = 'processing',
                error_message = NULL,
                updated_at = $1
            FROM candidates
            WHERE event.id = candidates.id
            RETURNING event.*
          )
          SELECT
            updated.*,
            candidates.main_key AS fair_main_key,
            candidates.child_key AS fair_child_key
          FROM updated
          JOIN candidates ON candidates.id = updated.id
          ORDER BY candidates.main_wrap, candidates.main_key, candidates.child_wrap, candidates.child_key,
                   updated.available_at, updated.created_at, updated.id
        `,
        [
          input.now,
          input.staleCutoff,
          eventTypes,
          mainCursor,
          input.fairnessScope,
          input.membershipQuantum,
          limit - claimed.length,
          ...(input.taskEnvironment ? [input.taskEnvironment] : []),
        ],
      );
      if (round.rows.length === 0) break;
      claimed.push(...round.rows.map(outboxEventFromRow));
      mainCursor = round.rows.at(-1)!.fair_main_key;
      const childCursorByMain = new Map<string, string>();
      for (const row of round.rows) childCursorByMain.set(row.fair_main_key, row.fair_child_key);
      const cursorRows = [
        { mainKey: "*", cursorKey: mainCursor },
        ...[...childCursorByMain].map(([mainKey, cursorKey]) => ({ mainKey, cursorKey })),
      ];
      await db.query(
        `
          INSERT INTO outbox_dispatch_fair_cursors (scope_key, main_key, cursor_key, updated_at)
          SELECT $1, cursor.main_key, cursor.cursor_key, $3
          FROM jsonb_to_recordset($2::jsonb) AS cursor(main_key text, cursor_key text)
          ON CONFLICT (scope_key, main_key) DO UPDATE
          SET cursor_key = EXCLUDED.cursor_key,
              updated_at = EXCLUDED.updated_at
        `,
        [input.fairnessScope, JSON.stringify(cursorRows.map((row) => ({ main_key: row.mainKey, cursor_key: row.cursorKey }))), input.now],
      );
    }
    await db.query("COMMIT");
    return claimed;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function markOutboxEventProcessed(
  db: SqlDatabase,
  input: {
    outboxEventId: string;
    now: Date;
  },
): Promise<OutboxEventRecord> {
  const row = await queryOne<OutboxEventRow>(
    db,
    `
      UPDATE outbox_events
      SET status = 'processed',
          processed_at = $2,
          updated_at = $2
      WHERE id = $1
      RETURNING *
    `,
    [input.outboxEventId, input.now],
  );

  return outboxEventFromRow(row!);
}

export async function markOutboxEventFailed(
  db: SqlDatabase,
  input: {
    outboxEventId: string;
    errorMessage: string;
    retryAt: Date;
    now: Date;
  },
): Promise<OutboxEventRecord> {
  const row = await queryOne<OutboxEventRow>(
    db,
    `
      UPDATE outbox_events
      SET status = 'failed',
          error_message = $2,
          available_at = $3,
          attempt_count = attempt_count + 1,
          last_attempt_at = $4,
          updated_at = $4
      WHERE id = $1
      RETURNING *
    `,
    [input.outboxEventId, input.errorMessage, input.retryAt, input.now],
  );

  return outboxEventFromRow(row!);
}

function outboxEventFromRow(row: OutboxEventRow): OutboxEventRecord {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    payload: row.payload_json,
    status: row.status,
    availableAt: new Date(row.available_at),
    processedAt: row.processed_at ? new Date(row.processed_at) : null,
    errorMessage: row.error_message,
    attemptCount: row.attempt_count ?? 0,
    lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
