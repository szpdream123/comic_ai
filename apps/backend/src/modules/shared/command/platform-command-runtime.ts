import type {
  Capability,
} from "../../../../../../packages/contracts/domain/capabilities.ts";
import type {
  OperationName,
} from "../../../../../../packages/contracts/domain/operation-names.ts";
import {
  appendAuditEvent,
  type AuditEventRecord,
} from "../../audit/audit.service.ts";
import {
  assertUserCapability,
  UserAuthorizationError,
  type UserActorContext,
} from "../../identity/user-actor-context.service.ts";
import type { SqlDatabase } from "../db/sql.ts";
import type { IdempotencyRecord } from "../idempotency/idempotency.service.ts";
import {
  beginOrReplayCommand,
  IdempotencyProcessingError,
} from "../idempotency/idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../idempotency/persistent-idempotency.store.ts";

export interface AdminCommandActor {
  userId: null;
  adminAccountId: string;
  capabilities: Capability[];
}

export type PlatformCommandActor = UserActorContext | AdminCommandActor;

export interface PlatformCommandContext<TActor extends PlatformCommandActor = UserActorContext> {
  db: SqlDatabase;
  actor: TActor;
  idempotencyRecord: IdempotencyRecord;
  now: Date;
}

export interface PlatformCommandAuditInput {
  eventType: string;
  targetType: string;
  targetId: string;
  projectId?: string | null;
  reason?: string | null;
  sensitive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PlatformCommandExecutionResult<TResult> {
  result: TResult;
  responseResourceType: string;
  responseResourceId: string;
  responseSnapshot?: Record<string, unknown>;
  audit?: PlatformCommandAuditInput;
}

export interface RunIdempotentCommandInput<
  TResult,
  TActor extends PlatformCommandActor = UserActorContext,
> {
  db: SqlDatabase;
  operationName: OperationName;
  capability: Capability;
  idempotencyKey: string;
  requestHash: string;
  now: Date;
  resolveActor: (db: SqlDatabase) => Promise<TActor>;
  replay: (ctx: PlatformCommandContext<TActor>) => Promise<TResult>;
  execute: (
    ctx: PlatformCommandContext<TActor>,
  ) => Promise<PlatformCommandExecutionResult<TResult>>;
}

export interface RunIdempotentCommandResult<
  TResult,
  TActor extends PlatformCommandActor = UserActorContext,
> {
  result: TResult;
  actor: TActor;
  idempotencyRecord: IdempotencyRecord;
  idempotencyResult: "created" | "replayed";
  auditEvent?: AuditEventRecord;
}

export async function runIdempotentCommand<
  TResult,
  TActor extends PlatformCommandActor = UserActorContext,
>(
  input: RunIdempotentCommandInput<TResult, TActor>,
): Promise<RunIdempotentCommandResult<TResult, TActor>> {
  await input.db.query("BEGIN");

  try {
    const actor = await input.resolveActor(input.db);
    assertPlatformCommandCapability(actor, input.capability);

    const store = new SqlIdempotencyRecordStore(input.db);
    const started = await beginOrReplayCommand(store, {
      scopeKey: commandActorScopeKey(actor),
      userId: actor.userId ?? undefined,
      adminAccountId: "adminAccountId" in actor ? actor.adminAccountId : undefined,
      operationName: input.operationName,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
    });
    const ctx: PlatformCommandContext<TActor> = {
      db: input.db,
      actor,
      idempotencyRecord: started.record,
      now: input.now,
    };

    if (started.kind === "replayed") {
      const result = await input.replay(ctx);
      await input.db.query("COMMIT");
      return {
        result,
        actor,
        idempotencyRecord: started.record,
        idempotencyResult: "replayed",
      };
    }

    if (started.kind === "processing") {
      throw new IdempotencyProcessingError(started.record);
    }

    const executed = await input.execute(ctx);
    const completed = await store.update({
      ...started.record,
      responseResourceType: executed.responseResourceType,
      responseResourceId: executed.responseResourceId,
      responseSnapshot: executed.responseSnapshot,
      status: "succeeded",
      updatedAt: input.now,
    });
    const auditEvent = executed.audit
      ? await appendAuditEvent(input.db, {
          userId: actor.userId,
          projectId: executed.audit.projectId ?? null,
          actorUserId: actor.userId,
          actorAdminAccountId: "adminAccountId" in actor ? actor.adminAccountId : null,
          eventType: executed.audit.eventType,
          targetType: executed.audit.targetType,
          targetId: executed.audit.targetId,
          reason: executed.audit.reason,
          sensitive: executed.audit.sensitive,
          metadata: executed.audit.metadata,
          occurredAt: input.now,
        })
      : undefined;

    await input.db.query("COMMIT");
    return {
      result: executed.result,
      actor,
      idempotencyRecord: completed,
      idempotencyResult: "created",
      auditEvent,
    };
  } catch (error) {
    await input.db.query("ROLLBACK");
    throw error;
  }
}

function assertPlatformCommandCapability(
  actor: PlatformCommandActor,
  capability: Capability,
) {
  if (actor.userId) {
    assertUserCapability(actor, capability);
    return;
  }
  if (!actor.capabilities.includes(capability)) {
    throw new UserAuthorizationError("capability_missing");
  }
}

function commandActorScopeKey(actor: PlatformCommandActor) {
  return actor.userId
    ? `user:${actor.userId}`
    : `admin:${actor.adminAccountId}`;
}
