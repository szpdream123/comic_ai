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
  scopeKey: string;
  userId?: string;
  adminAccountId?: string;
  operationName: OperationName;
  idempotencyKey: string;
  requestHash: string;
  responseResourceType?: string;
  responseResourceId?: string;
  responseSnapshot?: Record<string, unknown>;
  status: IdempotencyRecordStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BeginOrReplayCommandInput {
  scopeKey: string;
  userId?: string;
  adminAccountId?: string;
  operationName: OperationName;
  idempotencyKey: string;
  requestHash: string;
  responseResourceType?: string;
  responseResourceId?: string;
  responseSnapshot?: Record<string, unknown>;
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

export class IdempotencyProcessingError extends Error {
  readonly code = "idempotency_processing";

  constructor(readonly record: IdempotencyRecord) {
    super("Idempotency key is already processing.");
  }
}

export class IdempotencyScopeError extends Error {
  readonly code = "idempotency_scope_invalid";

  constructor() {
    super("Idempotency scope does not match its actor.");
  }
}

export interface IdempotencyRecordStore {
  findForUpdate(input: {
    scopeKey: string;
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
  assertIdempotencyActorScope(input);
  const now = new Date();
  const existing = await store.findForUpdate({
    scopeKey: input.scopeKey,
    operationName: input.operationName,
    idempotencyKey: input.idempotencyKey,
  });

  if (existing) {
    return handleExistingRecord(store, input, existing, now);
  }

  const record: IdempotencyRecord = {
    id: randomUUID(),
    scopeKey: input.scopeKey,
    userId: input.userId,
    adminAccountId: input.adminAccountId,
    operationName: input.operationName,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    responseResourceType: input.responseResourceType,
    responseResourceId: input.responseResourceId,
    responseSnapshot: input.responseSnapshot,
    status: input.responseResourceId ? "succeeded" : "processing",
    expiresAt: new Date(now.getTime() + (input.ttlMs ?? defaultTtlMs)),
    createdAt: now,
    updatedAt: now,
  };

  try {
    return { kind: "created", record: await store.insert(record) };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const raced = await store.findForUpdate({
      scopeKey: input.scopeKey,
      operationName: input.operationName,
      idempotencyKey: input.idempotencyKey,
    });

    if (!raced) {
      throw error;
    }

    return handleExistingRecord(store, input, raced, now);
  }
}

function assertIdempotencyActorScope(input: BeginOrReplayCommandInput) {
  const hasUser = Boolean(input.userId);
  const hasAdmin = Boolean(input.adminAccountId);
  if (hasUser === hasAdmin) {
    throw new IdempotencyScopeError();
  }
  const expectedScope = hasUser
    ? `user:${input.userId}`
    : `admin:${input.adminAccountId}`;
  if (input.scopeKey !== expectedScope) {
    throw new IdempotencyScopeError();
  }
}

export class InMemoryIdempotencyRecordStore implements IdempotencyRecordStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async findForUpdate(input: {
    scopeKey: string;
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
  scopeKey: string;
  operationName: OperationName;
  idempotencyKey: string;
}): string {
  return `${input.scopeKey}:${input.operationName}:${input.idempotencyKey}`;
}

async function handleExistingRecord(
  store: IdempotencyRecordStore,
  input: BeginOrReplayCommandInput,
  existing: IdempotencyRecord,
  now: Date,
): Promise<BeginOrReplayCommandResult> {
  if (existing.expiresAt.getTime() <= now.getTime()) {
    const renewed = await store.update({
      ...existing,
      requestHash: input.requestHash,
      responseResourceType: input.responseResourceType,
      responseResourceId: input.responseResourceId,
      responseSnapshot: input.responseSnapshot,
      status: input.responseResourceId ? "succeeded" : "processing",
      expiresAt: new Date(now.getTime() + (input.ttlMs ?? defaultTtlMs)),
      updatedAt: now,
    });
    return { kind: "created", record: renewed };
  }

  if (existing.requestHash !== input.requestHash) {
    throw new IdempotencyConflictError();
  }

  if (input.responseResourceId && !existing.responseResourceId) {
    const updated = await store.update({
      ...existing,
      responseResourceType: input.responseResourceType,
      responseResourceId: input.responseResourceId,
      responseSnapshot: input.responseSnapshot,
      status: "succeeded",
      updatedAt: now,
    });
    return { kind: "replayed", record: updated };
  }

  if (existing.status === "processing" && !existing.responseResourceId) {
    return { kind: "processing", record: existing };
  }

  return { kind: "replayed", record: existing };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
