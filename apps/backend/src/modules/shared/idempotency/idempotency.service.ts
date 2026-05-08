import { randomUUID } from "node:crypto";

import type { OperationName } from "../../../../../../packages/contracts/domain/operation-names.ts";

export type IdempotencyRecordStatus =
  | "processing"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "expired";

export interface IdempotencyRecord {
  id: string;
  organizationId: string;
  operationName: OperationName;
  idempotencyKey: string;
  requestHash: string;
  responseResourceType?: string;
  responseResourceId?: string;
  status: IdempotencyRecordStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BeginOrReplayCommandInput {
  organizationId: string;
  operationName: OperationName;
  idempotencyKey: string;
  requestHash: string;
  responseResourceType?: string;
  responseResourceId?: string;
  ttlMs?: number;
}

export type BeginOrReplayCommandResult =
  | { kind: "created"; record: IdempotencyRecord }
  | { kind: "replayed"; record: IdempotencyRecord }
  | { kind: "processing"; record: IdempotencyRecord };

export class IdempotencyConflictError extends Error {
  readonly code = "idempotency_conflict";

  constructor() {
    super("Idempotency key was reused with a different request hash.");
  }
}

export interface IdempotencyRecordStore {
  findForUpdate(input: {
    organizationId: string;
    operationName: OperationName;
    idempotencyKey: string;
  }): Promise<IdempotencyRecord | undefined>;
  insert(record: IdempotencyRecord): Promise<IdempotencyRecord>;
  update(record: IdempotencyRecord): Promise<IdempotencyRecord>;
}

const defaultTtlMs = 24 * 60 * 60 * 1000;

export async function beginOrReplayCommand(
  store: IdempotencyRecordStore,
  input: BeginOrReplayCommandInput,
): Promise<BeginOrReplayCommandResult> {
  const existing = await store.findForUpdate({
    organizationId: input.organizationId,
    operationName: input.operationName,
    idempotencyKey: input.idempotencyKey,
  });

  if (existing) {
    if (existing.requestHash !== input.requestHash) {
      throw new IdempotencyConflictError();
    }

    if (input.responseResourceId && !existing.responseResourceId) {
      const updated = await store.update({
        ...existing,
        responseResourceType: input.responseResourceType,
        responseResourceId: input.responseResourceId,
        status: "succeeded",
        updatedAt: new Date(),
      });
      return { kind: "replayed", record: updated };
    }

    if (existing.status === "processing" && !existing.responseResourceId) {
      return { kind: "processing", record: existing };
    }

    return { kind: "replayed", record: existing };
  }

  const now = new Date();
  const record: IdempotencyRecord = {
    id: randomUUID(),
    organizationId: input.organizationId,
    operationName: input.operationName,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    responseResourceType: input.responseResourceType,
    responseResourceId: input.responseResourceId,
    status: input.responseResourceId ? "succeeded" : "processing",
    expiresAt: new Date(now.getTime() + (input.ttlMs ?? defaultTtlMs)),
    createdAt: now,
    updatedAt: now,
  };

  return { kind: "created", record: await store.insert(record) };
}

export class InMemoryIdempotencyRecordStore implements IdempotencyRecordStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async findForUpdate(input: {
    organizationId: string;
    operationName: OperationName;
    idempotencyKey: string;
  }): Promise<IdempotencyRecord | undefined> {
    return this.records.get(recordKey(input));
  }

  async insert(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    this.records.set(recordKey(record), record);
    return record;
  }

  async update(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    this.records.set(recordKey(record), record);
    return record;
  }
}

function recordKey(input: {
  organizationId: string;
  operationName: OperationName;
  idempotencyKey: string;
}): string {
  return `${input.organizationId}:${input.operationName}:${input.idempotencyKey}`;
}
