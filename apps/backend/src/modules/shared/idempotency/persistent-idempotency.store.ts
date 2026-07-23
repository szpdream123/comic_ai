import type { OperationName } from "../../../../../../packages/contracts/domain/operation-names.ts";
import type { SqlDatabase } from "../db/sql.ts";
import { queryOne } from "../db/sql.ts";
import type {
  IdempotencyRecord,
  IdempotencyRecordStatus,
  IdempotencyRecordStore,
} from "./idempotency.service.ts";

interface IdempotencyRecordRow {
  id: string;
  scope_key: string;
  user_id: string | null;
  admin_account_id: string | null;
  operation_name: OperationName;
  idempotency_key: string;
  request_hash: string;
  response_resource_type: string | null;
  response_resource_id: string | null;
  response_snapshot_json: Record<string, unknown> | string | null;
  status: IdempotencyRecordStatus;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export class SqlIdempotencyRecordStore implements IdempotencyRecordStore {
  constructor(private readonly db: SqlDatabase) {}

  async findForUpdate(input: {
    scopeKey: string;
    operationName: OperationName;
    idempotencyKey: string;
  }): Promise<IdempotencyRecord | undefined> {
    const row = await queryOne<IdempotencyRecordRow>(
      this.db,
      `
        SELECT *
        FROM idempotency_records
        WHERE scope_key = $1
          AND operation_name = $2
          AND idempotency_key = $3
        LIMIT 1
        FOR UPDATE
      `,
      [input.scopeKey, input.operationName, input.idempotencyKey],
    );

    return row ? recordFromRow(row) : undefined;
  }

  async insert(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    const row = await queryOne<IdempotencyRecordRow>(
      this.db,
      `
        INSERT INTO idempotency_records (
          id,
          scope_key,
          user_id,
          admin_account_id,
          operation_name,
          idempotency_key,
          request_hash,
          response_resource_type,
          response_resource_id,
          response_snapshot_json,
          status,
          expires_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
        RETURNING *
      `,
      [
        record.id,
        record.scopeKey,
        record.userId ?? null,
        record.adminAccountId ?? null,
        record.operationName,
        record.idempotencyKey,
        record.requestHash,
        record.responseResourceType ?? null,
        record.responseResourceId ?? null,
        record.responseSnapshot ? JSON.stringify(record.responseSnapshot) : null,
        record.status,
        record.expiresAt,
        record.createdAt,
        record.updatedAt,
      ],
    );

    return recordFromRow(row!);
  }

  async update(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    const row = await queryOne<IdempotencyRecordRow>(
      this.db,
      `
        UPDATE idempotency_records
        SET request_hash = $2,
            response_resource_type = $3,
            response_resource_id = $4,
            response_snapshot_json = $5::jsonb,
            status = $6,
            expires_at = $7,
            updated_at = $8
        WHERE id = $1
        RETURNING *
      `,
      [
        record.id,
        record.requestHash,
        record.responseResourceType ?? null,
        record.responseResourceId ?? null,
        record.responseSnapshot ? JSON.stringify(record.responseSnapshot) : null,
        record.status,
        record.expiresAt,
        record.updatedAt,
      ],
    );

    return recordFromRow(row!);
  }
}

function recordFromRow(row: IdempotencyRecordRow): IdempotencyRecord {
  return {
    id: row.id,
    scopeKey: row.scope_key,
    userId: row.user_id ?? undefined,
    adminAccountId: row.admin_account_id ?? undefined,
    operationName: row.operation_name,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    responseResourceType: row.response_resource_type ?? undefined,
    responseResourceId: row.response_resource_id ?? undefined,
    responseSnapshot: normalizeSnapshot(row.response_snapshot_json),
    status: row.status,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function normalizeSnapshot(
  snapshot: Record<string, unknown> | string | null,
): Record<string, unknown> | undefined {
  if (!snapshot) {
    return undefined;
  }

  if (typeof snapshot === "string") {
    return JSON.parse(snapshot) as Record<string, unknown>;
  }

  return snapshot;
}
