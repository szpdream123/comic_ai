import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type {
  GenerationQueueJobAction,
  GenerationQueueJobOperationCheckpoint,
} from "./generation-queue-job-ops.service.ts";

export type GenerationQueueAdminCommandStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal";

export interface GenerationQueueAdminCommand {
  id: string;
  adminAccountId: string;
  idempotencyKey: string;
  resourceKey: string;
  queueName: string;
  jobId: string;
  action: GenerationQueueJobAction;
  reason: string;
  checkpoint: GenerationQueueJobOperationCheckpoint;
  result: Record<string, unknown> | null;
  status: GenerationQueueAdminCommandStatus;
  lockedBy: string | null;
  lockedUntil: Date | string | null;
  lastError: string | null;
}

interface GenerationQueueAdminCommandRow {
  id: string;
  admin_account_id: string;
  idempotency_key: string;
  resource_key: string;
  queue_name: string;
  job_id: string;
  action: GenerationQueueJobAction;
  reason: string;
  checkpoint_json: GenerationQueueJobOperationCheckpoint | string;
  result_json: Record<string, unknown> | string | null;
  status: GenerationQueueAdminCommandStatus;
  locked_by: string | null;
  locked_until: Date | string | null;
  last_error: string | null;
}

export async function createGenerationQueueAdminCommand(
  db: SqlDatabase,
  input: {
    id: string;
    adminAccountId: string;
    idempotencyKey: string;
    queueName: string;
    jobId: string;
    action: GenerationQueueJobAction;
    reason: string;
    now: Date;
  },
) {
  const queueName = input.queueName.trim();
  const jobId = input.jobId.trim();
  const request = {
    queueName,
    jobId,
    action: input.action,
    reason: requiredText(input.reason),
  };
  const resourceKey = JSON.stringify([queueName, jobId]);
  const row = await queryOne<GenerationQueueAdminCommandRow>(
    db,
    `
      INSERT INTO generation_queue_admin_commands (
        id, admin_account_id, idempotency_key, resource_key, queue_name, job_id,
        action, reason, request_json, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'pending', $10, $10)
      ON CONFLICT (admin_account_id, idempotency_key) DO UPDATE
      SET updated_at = generation_queue_admin_commands.updated_at
      WHERE generation_queue_admin_commands.request_json = EXCLUDED.request_json
      RETURNING *
    `,
    [
      input.id,
      input.adminAccountId,
      requiredText(input.idempotencyKey),
      resourceKey,
      queueName,
      jobId,
      input.action,
      request.reason,
      JSON.stringify(request),
      input.now,
    ],
  );
  if (!row) throw new Error("generation_queue_admin_command_idempotency_conflict");
  return mapCommand(row);
}

export async function readGenerationQueueAdminCommand(db: SqlDatabase, commandId: string) {
  const row = await queryOne<GenerationQueueAdminCommandRow>(
    db,
    "SELECT * FROM generation_queue_admin_commands WHERE id = $1",
    [commandId],
  );
  return row ? mapCommand(row) : null;
}

export async function listDueGenerationQueueAdminCommandIds(
  db: SqlDatabase,
  input: { now: Date; limit: number; retryDelayMs?: number },
) {
  const retryBefore = new Date(
    input.now.getTime() - Math.max(1_000, Math.floor(input.retryDelayMs ?? 30_000)),
  );
  const result = await db.query<{ id: string }>(
    `
      SELECT id
      FROM generation_queue_admin_commands
      WHERE status = 'pending'
         OR (
           status = 'processing'
           AND (locked_until IS NULL OR locked_until <= $1)
         )
         OR (
           status = 'failed_retryable'
           AND updated_at <= $2
         )
      ORDER BY created_at ASC, id ASC
      LIMIT $3
    `,
    [input.now, retryBefore, Math.max(1, Math.floor(input.limit))],
  );
  return result.rows.map((row) => row.id);
}

export async function claimGenerationQueueAdminCommand(
  db: SqlDatabase,
  input: { commandId: string; workerId: string; now: Date; leaseMs?: number },
) {
  const leaseMs = Math.max(5_000, Math.floor(input.leaseMs ?? 60_000));
  await db.query("BEGIN");
  try {
    const command = await queryOne<GenerationQueueAdminCommandRow>(
      db,
      "SELECT * FROM generation_queue_admin_commands WHERE id = $1 FOR UPDATE",
      [input.commandId],
    );
    if (!command || command.status === "succeeded" || command.status === "failed_terminal") {
      await db.query("COMMIT");
      return null;
    }
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('generation-admin-command|' || $1, 0))",
      [command.resource_key],
    );
    const busy = await queryOne<{ id: string }>(
      db,
      `
        SELECT id
        FROM generation_queue_admin_commands
        WHERE resource_key = $1
          AND id <> $2
          AND status = 'processing'
          AND locked_until > $3
        LIMIT 1
      `,
      [command.resource_key, command.id, input.now],
    );
    if (busy || (command.status === "processing" && command.locked_until
      && new Date(command.locked_until).getTime() > input.now.getTime()
      && command.locked_by !== input.workerId)) {
      await db.query("COMMIT");
      return null;
    }
    const claimed = await queryOne<GenerationQueueAdminCommandRow>(
      db,
      `
        UPDATE generation_queue_admin_commands
        SET status = 'processing',
            locked_by = $2,
            locked_until = $3,
            last_error = NULL,
            updated_at = $4
        WHERE id = $1
        RETURNING *
      `,
      [command.id, input.workerId, new Date(input.now.getTime() + leaseMs), input.now],
    );
    await db.query("COMMIT");
    return claimed ? mapCommand(claimed) : null;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function saveGenerationQueueAdminCommandCheckpoint(
  db: SqlDatabase,
  input: {
    commandId: string;
    workerId: string;
    checkpoint: GenerationQueueJobOperationCheckpoint;
    now: Date;
    leaseMs?: number;
  },
) {
  const row = await queryOne<GenerationQueueAdminCommandRow>(
    db,
    `
      UPDATE generation_queue_admin_commands
      SET checkpoint_json = $3::jsonb,
          locked_until = $4,
          updated_at = $5
      WHERE id = $1
        AND status = 'processing'
        AND locked_by = $2
        AND locked_until > $5
      RETURNING *
    `,
    [
      input.commandId,
      input.workerId,
      JSON.stringify(input.checkpoint),
      new Date(input.now.getTime() + Math.max(5_000, Math.floor(input.leaseMs ?? 60_000))),
      input.now,
    ],
  );
  if (!row) throw new Error("generation_queue_admin_command_lease_lost");
  return mapCommand(row);
}

export async function completeGenerationQueueAdminCommand(
  db: SqlDatabase,
  input: { commandId: string; workerId: string; result: Record<string, unknown>; now: Date },
) {
  const row = await queryOne<GenerationQueueAdminCommandRow>(
    db,
    `
      UPDATE generation_queue_admin_commands
      SET status = 'succeeded', result_json = $3::jsonb,
          locked_by = NULL, locked_until = NULL, last_error = NULL, updated_at = $4
      WHERE id = $1 AND status = 'processing' AND locked_by = $2 AND locked_until > $4
      RETURNING *
    `,
    [input.commandId, input.workerId, JSON.stringify(input.result), input.now],
  );
  if (!row) throw new Error("generation_queue_admin_command_lease_lost");
  return mapCommand(row);
}

export async function failGenerationQueueAdminCommand(
  db: SqlDatabase,
  input: {
    commandId: string;
    workerId: string;
    error: string;
    terminal?: boolean;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE generation_queue_admin_commands
      SET status = $3,
          locked_by = NULL,
          locked_until = NULL,
          last_error = $4,
          updated_at = $5
      WHERE id = $1 AND status = 'processing' AND locked_by = $2
    `,
    [
      input.commandId,
      input.workerId,
      input.terminal ? "failed_terminal" : "failed_retryable",
      input.error.slice(0, 2000),
      input.now,
    ],
  );
}

function mapCommand(row: GenerationQueueAdminCommandRow): GenerationQueueAdminCommand {
  return {
    id: row.id,
    adminAccountId: row.admin_account_id,
    idempotencyKey: row.idempotency_key,
    resourceKey: row.resource_key,
    queueName: row.queue_name,
    jobId: row.job_id,
    action: row.action,
    reason: row.reason,
    checkpoint: parseRecord(row.checkpoint_json),
    result: row.result_json === null ? null : parseRecord(row.result_json),
    status: row.status,
    lockedBy: row.locked_by,
    lockedUntil: row.locked_until,
    lastError: row.last_error,
  };
}

function parseRecord<T extends Record<string, unknown>>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function requiredText(value: string) {
  const text = value.trim();
  if (!text) throw new Error("generation_queue_admin_command_value_required");
  return text;
}
