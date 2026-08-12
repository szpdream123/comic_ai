import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface GenerationTaskCreatedOutboxInput {
  userId?: string | null;
  workflowId: string;
  taskId: string;
  kind: "image" | "video" | "audio";
  modelCode: string | null;
  queueName: string;
  targetType: string;
  targetId: string;
  providerExecutor: string;
  providerRouteIdentity?: string | null;
  providerConfigRevisionId?: string | null;
  credentialVersionRef?: string | null;
  membershipPriority?: boolean;
  queuePriority?: number | null;
  priorityReason?: string | null;
  dispatchToken?: string | null;
  retrySequence?: number | null;
  availableAt: Date;
}

export interface GenerationTaskFinalizeRequestedOutboxInput {
  userId?: string | null;
  workflowId: string;
  taskId: string;
  attemptId?: string | null;
  kind: "image" | "video" | "audio";
  modelCode: string | null;
  providerExecutor: string;
  providerRouteIdentity?: string | null;
  providerConfigRevisionId?: string | null;
  credentialVersionRef?: string | null;
  storageBucket?: string | null;
  finalizeMode?: "retry_finalize" | "retry_persist_asset";
  /** Optional explicit fetch/persist routing boundary for elastic shards. */
  artifactStage?: "fetch" | "persist";
  availableAt: Date;
}

export interface GenerationTaskPollRequestedOutboxInput {
  userId?: string | null;
  workflowId: string;
  taskId: string;
  attemptId?: string | null;
  kind?: "image" | "video" | "audio";
  modelCode: string | null;
  providerExecutor: string;
  providerRouteIdentity?: string | null;
  providerConfigRevisionId?: string | null;
  credentialVersionRef?: string | null;
  pollAttempt?: number;
  dispatchToken?: string | null;
  availableAt: Date;
}

export async function appendGenerationTaskCreatedOutboxEvent(
  db: SqlDatabase,
  input: GenerationTaskCreatedOutboxInput,
) {
  const dedupeKey = `${generationTaskCreatedEventType}:${input.taskId}`;
  const payload: Record<string, unknown> = {
    workflowId: input.workflowId,
    taskId: input.taskId,
    mediaType: input.kind,
    modelCode: input.modelCode,
    queueName: input.queueName,
    targetType: input.targetType,
    targetId: input.targetId,
    providerExecutor: input.providerExecutor,
    ...(input.providerRouteIdentity ? { providerRouteIdentity: input.providerRouteIdentity } : {}),
    ...(input.providerConfigRevisionId ? { providerConfigRevisionId: input.providerConfigRevisionId } : {}),
    ...(input.credentialVersionRef ? { credentialVersionRef: input.credentialVersionRef } : {}),
  };
  if (input.membershipPriority === true) {
    payload.membershipPriority = true;
    payload.queuePriority = input.queuePriority ?? 1;
    payload.priorityReason = input.priorityReason ?? "membership_priority";
  }
  if (input.dispatchToken) {
    payload.dispatchToken = input.dispatchToken;
  }
  if (Number.isInteger(input.retrySequence) && Number(input.retrySequence) >= 1) {
    payload.retrySequence = Number(input.retrySequence);
  }

  const row = await queryOne<{
    id: string;
    event_type: string;
    payload_json: Record<string, unknown>;
    status: string;
  }>(
    db,
    `
      WITH inserted AS (
      INSERT INTO outbox_events (
        id,
        user_id,
        event_type,
        payload_json,
        generation_stage,
        provider_route_key,
        provider_config_revision_id,
        credential_version_ref,
        status,
        available_at,
        dedupe_key,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, '${generationTaskCreatedEventType}', $3::jsonb, 'submit',
        $3::jsonb->>'providerRouteIdentity', $3::jsonb->>'providerConfigRevisionId',
        $3::jsonb->>'credentialVersionRef', 'pending', $4, $5, $4, $4
      )
      ON CONFLICT DO NOTHING
      RETURNING id, event_type, payload_json, status
      )
      SELECT id, event_type, payload_json, status FROM inserted
      UNION ALL
      SELECT id, event_type, payload_json, status
      FROM outbox_events
      WHERE dedupe_key = $5
        AND status IN ('pending', 'processing', 'failed')
      LIMIT 1
    `,
    [
      randomUUID(),
      input.userId ?? null,
      JSON.stringify(payload),
      input.availableAt,
      dedupeKey,
    ],
  );

  return row ?? await readActiveGenerationOutboxEvent(db, dedupeKey);
}

export async function rescheduleGenerationTaskCreatedOutboxEvent(
  db: SqlDatabase,
  input: {
    eventId: string;
    availableAt: Date;
    dispatchToken: string;
    retrySequence: number;
    now: Date;
  },
) {
  return queryOne<{ id: string }>(
    db,
    `
      UPDATE outbox_events
      SET available_at = $2,
          payload_json = payload_json || jsonb_build_object(
            'dispatchToken', $4::text,
            'retrySequence', $5::integer
          ),
          updated_at = $3
      WHERE id = $1
        AND status IN ('pending', 'failed')
      RETURNING id
    `,
    [input.eventId, input.availableAt, input.now, input.dispatchToken, input.retrySequence],
  );
}

export async function appendGenerationTaskPollRequestedOutboxEvent(
  db: SqlDatabase,
  input: GenerationTaskPollRequestedOutboxInput,
) {
  const pollAttempt = Math.max(1, Math.floor(input.pollAttempt ?? 1));
  const attemptKey = input.attemptId?.trim();
  const dispatchToken = input.dispatchToken?.trim();
  const baseDedupeKey = input.pollAttempt == null
    ? `${generationTaskPollRequestedEventType}:${input.taskId}${attemptKey ? `:${attemptKey}` : ""}`
    : `${generationTaskPollRequestedEventType}:${input.taskId}${attemptKey ? `:${attemptKey}` : ""}:${pollAttempt}`;
  const dedupeKey = `${baseDedupeKey}${dispatchToken ? `:${dispatchToken}` : ""}`;
  const row = await queryOne<{
    id: string;
    event_type: string;
    payload_json: Record<string, unknown>;
    status: string;
  }>(
    db,
    `
      WITH inserted AS (
      INSERT INTO outbox_events (
        id,
        user_id,
        event_type,
        payload_json,
        generation_stage,
        provider_route_key,
        provider_config_revision_id,
        credential_version_ref,
        status,
        available_at,
        dedupe_key,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, '${generationTaskPollRequestedEventType}', $3::jsonb, 'poll',
        $3::jsonb->>'providerRouteIdentity', $3::jsonb->>'providerConfigRevisionId',
        $3::jsonb->>'credentialVersionRef', 'pending', $4, $5, $4, $4
      )
      ON CONFLICT DO NOTHING
      RETURNING id, event_type, payload_json, status
      )
      SELECT id, event_type, payload_json, status FROM inserted
      UNION ALL
      SELECT id, event_type, payload_json, status
      FROM outbox_events
      WHERE dedupe_key = $5
        AND status IN ('pending', 'processing', 'failed')
      LIMIT 1
    `,
    [
      randomUUID(),
      input.userId ?? null,
      JSON.stringify({
        workflowId: input.workflowId,
        taskId: input.taskId,
        ...(attemptKey ? { attemptId: attemptKey } : {}),
        mediaType: input.kind ?? "video",
        modelCode: input.modelCode,
        providerExecutor: input.providerExecutor,
        pollAttempt,
        ...(dispatchToken ? { dispatchToken } : {}),
        ...(input.providerRouteIdentity ? { providerRouteIdentity: input.providerRouteIdentity } : {}),
        ...(input.providerConfigRevisionId ? { providerConfigRevisionId: input.providerConfigRevisionId } : {}),
        ...(input.credentialVersionRef ? { credentialVersionRef: input.credentialVersionRef } : {}),
      }),
      input.availableAt,
      dedupeKey,
    ],
  );

  return row ?? await readActiveGenerationOutboxEvent(db, dedupeKey);
}

export async function appendGenerationTaskFinalizeRequestedOutboxEvent(
  db: SqlDatabase,
  input: GenerationTaskFinalizeRequestedOutboxInput,
) {
  const finalizeMode = input.finalizeMode ?? "retry_finalize";
  const artifactStage = input.artifactStage
    ?? (finalizeMode === "retry_persist_asset" ? "persist" : "fetch");
  const attemptKey = input.attemptId?.trim();
  const dedupeKey = `${generationTaskFinalizeRequestedEventType}:${input.taskId}${attemptKey ? `:${attemptKey}` : ""}:${finalizeMode}`;
  const row = await queryOne<{
    id: string;
    event_type: string;
    payload_json: Record<string, unknown>;
    status: string;
  }>(
    db,
    `
      WITH inserted AS (
      INSERT INTO outbox_events (
        id,
        user_id,
        event_type,
        payload_json,
        generation_stage,
        provider_route_key,
        provider_config_revision_id,
        credential_version_ref,
        status,
        available_at,
        dedupe_key,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, '${generationTaskFinalizeRequestedEventType}', $3::jsonb,
        $3::jsonb->>'artifactStage', $3::jsonb->>'providerRouteIdentity',
        $3::jsonb->>'providerConfigRevisionId', $3::jsonb->>'credentialVersionRef',
        'pending', $4, $5, $4, $4
      )
      ON CONFLICT DO NOTHING
      RETURNING id, event_type, payload_json, status
      )
      SELECT id, event_type, payload_json, status FROM inserted
      UNION ALL
      SELECT id, event_type, payload_json, status
      FROM outbox_events
      WHERE dedupe_key = $5
        AND status IN ('pending', 'processing', 'failed')
      LIMIT 1
    `,
    [
      randomUUID(),
      input.userId ?? null,
      JSON.stringify({
        workflowId: input.workflowId,
        taskId: input.taskId,
        ...(attemptKey ? { attemptId: attemptKey } : {}),
        mediaType: input.kind,
        modelCode: input.modelCode,
        providerExecutor: input.providerExecutor,
        artifactKind: input.kind,
        storageBucket: input.storageBucket ?? null,
        finalizeMode,
        artifactStage,
        ...(input.providerRouteIdentity ? { providerRouteIdentity: input.providerRouteIdentity } : {}),
        ...(input.providerConfigRevisionId ? { providerConfigRevisionId: input.providerConfigRevisionId } : {}),
        ...(input.credentialVersionRef ? { credentialVersionRef: input.credentialVersionRef } : {}),
      }),
      input.availableAt,
      dedupeKey,
    ],
  );

  return row ?? await readActiveGenerationOutboxEvent(db, dedupeKey);
}

async function readActiveGenerationOutboxEvent(db: SqlDatabase, dedupeKey: string) {
  return (await queryOne<{
    id: string;
    event_type: string;
    payload_json: Record<string, unknown>;
    status: string;
  }>(
    db,
    `
      SELECT id, event_type, payload_json, status
      FROM outbox_events
      WHERE dedupe_key = $1
        AND status IN ('pending', 'processing', 'failed')
      LIMIT 1
    `,
    [dedupeKey],
  ))!;
}

const generationTaskCreatedEventType = "generation.task.created";
const generationTaskPollRequestedEventType = "generation.task.poll_requested";
const generationTaskFinalizeRequestedEventType = "generation.task.finalize_requested";
