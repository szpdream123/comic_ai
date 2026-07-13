import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";

export interface AuditEventRecord {
  id: string;
  userId: string | null;
  projectId: string | null;
  actorUserId: string | null;
  actorAdminAccountId: string | null;
  eventType: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class AuditValidationError extends Error {
  constructor(readonly code: "reason_required" | "actor_conflict") {
    super(code);
  }
}

const sensitiveKeyPattern = /(token|secret|code|phone|password|credential)/i;

export async function appendAuditEvent(
  db: SqlDatabase,
  input: {
    userId?: string | null;
    projectId?: string | null;
    actorUserId?: string | null;
    actorAdminAccountId?: string | null;
    eventType: string;
    targetType: string;
    targetId: string;
    reason?: string | null;
    sensitive?: boolean;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  },
): Promise<AuditEventRecord> {
  const reason = input.reason?.trim() || null;
  if (input.sensitive && !reason) {
    throw new AuditValidationError("reason_required");
  }

  const actorUserId = input.actorUserId ?? null;
  const actorAdminAccountId = input.actorAdminAccountId ?? null;
  if (actorUserId && actorAdminAccountId) {
    throw new AuditValidationError("actor_conflict");
  }
  const record: AuditEventRecord = {
    id: randomUUID(),
    userId: input.userId ?? null,
    projectId: input.projectId ?? null,
    actorUserId,
    actorAdminAccountId,
    eventType: input.eventType,
    targetType: input.targetType,
    targetId: input.targetId,
    reason,
    metadata: redactMetadata(input.metadata ?? {}),
    createdAt: input.occurredAt ?? new Date(),
  };

  await db.query(
    `
      INSERT INTO audit_events (
        id,
        user_id,
        project_id,
        actor_user_id,
        actor_admin_account_id,
        event_type,
        target_type,
        target_id,
        reason,
        metadata_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
    `,
    [
      record.id,
      record.userId,
      record.projectId,
      record.actorUserId,
      record.actorAdminAccountId,
      record.eventType,
      record.targetType,
      record.targetId,
      record.reason,
      JSON.stringify(record.metadata),
      record.createdAt,
    ],
  );

  return record;
}

export function redactMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[redacted]" : value,
    ]),
  );
}
