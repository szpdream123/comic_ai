import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface GenerationTaskCreatedOutboxInput {
  organizationId: string;
  workflowId: string;
  taskId: string;
  kind: "image" | "video";
  modelCode: string | null;
  queueName: string;
  targetType: string;
  targetId: string;
  providerExecutor: string;
  availableAt: Date;
}

export interface GenerationTaskFinalizeRequestedOutboxInput {
  organizationId: string;
  workflowId: string;
  taskId: string;
  kind: "image" | "video";
  modelCode: string | null;
  providerExecutor: string;
  storageBucket?: string | null;
  finalizeMode?: "retry_finalize" | "retry_persist_asset";
  availableAt: Date;
}

export async function appendGenerationTaskCreatedOutboxEvent(
  db: SqlDatabase,
  input: GenerationTaskCreatedOutboxInput,
) {
  const row = await queryOne<{
    id: string;
    event_type: string;
    payload_json: Record<string, unknown>;
    status: string;
  }>(
    db,
    `
      INSERT INTO outbox_events (
        id,
        organization_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'generation.task.created', $3::jsonb, 'pending', $4, $4, $4)
      RETURNING id, event_type, payload_json, status
    `,
    [
      randomUUID(),
      input.organizationId,
      JSON.stringify({
        workflowId: input.workflowId,
        taskId: input.taskId,
        mediaType: input.kind,
        modelCode: input.modelCode,
        queueName: input.queueName,
        targetType: input.targetType,
        targetId: input.targetId,
        providerExecutor: input.providerExecutor,
      }),
      input.availableAt,
    ],
  );

  return row!;
}

export async function appendGenerationTaskFinalizeRequestedOutboxEvent(
  db: SqlDatabase,
  input: GenerationTaskFinalizeRequestedOutboxInput,
) {
  const row = await queryOne<{
    id: string;
    event_type: string;
    payload_json: Record<string, unknown>;
    status: string;
  }>(
    db,
    `
      INSERT INTO outbox_events (
        id,
        organization_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'generation.task.finalize_requested', $3::jsonb, 'pending', $4, $4, $4)
      RETURNING id, event_type, payload_json, status
    `,
    [
      randomUUID(),
      input.organizationId,
      JSON.stringify({
        workflowId: input.workflowId,
        taskId: input.taskId,
        mediaType: input.kind,
        modelCode: input.modelCode,
        providerExecutor: input.providerExecutor,
        artifactKind: input.kind,
        storageBucket: input.storageBucket ?? null,
        finalizeMode: input.finalizeMode ?? "retry_finalize",
      }),
      input.availableAt,
    ],
  );

  return row!;
}
