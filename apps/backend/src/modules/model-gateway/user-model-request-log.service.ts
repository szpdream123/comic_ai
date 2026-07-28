import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface UserModelRequestLogCreateInput {
  providerRequestId: string;
  projectId?: string | null;
  canvasProjectId?: string | null;
  workflowId?: string | null;
  taskId?: string | null;
  attemptId?: string | null;
  agentTaskId?: string | null;
  agentStepId?: string | null;
  userId?: string | null;
  providerName: string;
  providerOperation: string;
  modelId: string;
  providerModel: string;
  requestKey: string;
  requestHash: string;
  payloadHash: string;
  payloadSummary?: string | null;
  requestFormat?: string | null;
  requestBody: Record<string, unknown>;
  requestText?: string | null;
  now: Date;
}

export interface UserModelRequestLogCompleteInput {
  providerRequestId: string;
  status: "succeeded" | "failed" | "canceled";
  responseText?: string | null;
  responseUsage?: Record<string, unknown> | null;
  finishReasons?: string[];
  failureCode?: string | null;
  now: Date;
}

interface UserModelRequestLogRow {
  id: string;
  provider_request_id: string;
  project_id: string | null;
  canvas_project_id: string | null;
  workflow_id: string | null;
  task_id: string | null;
  attempt_id: string | null;
  agent_task_id: string | null;
  agent_step_id: string | null;
  user_id: string | null;
  provider_name: string;
  provider_operation: string;
  model_id: string;
  provider_model: string;
  request_key: string;
  request_hash: string;
  payload_hash: string;
  payload_summary: string | null;
  request_format: string;
  request_body_json: Record<string, unknown>;
  request_text: string | null;
  response_text: string | null;
  response_usage_json: Record<string, unknown> | null;
  response_finish_reasons_json: unknown;
  status: string;
  failure_code: string | null;
  started_at: Date | string;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface UserModelRequestLogRecord {
  id: string;
  providerRequestId: string;
  projectId: string | null;
  canvasProjectId?: string;
  workflowId: string | null;
  taskId: string | null;
  attemptId: string | null;
  agentTaskId?: string | null;
  agentStepId?: string | null;
  userId: string | null;
  providerName: string;
  providerOperation: string;
  modelId: string;
  providerModel: string;
  requestKey: string;
  requestHash: string;
  payloadHash: string;
  payloadSummary: string | null;
  requestFormat: string;
  requestBody: Record<string, unknown>;
  requestText: string | null;
  responseText: string | null;
  responseUsage: Record<string, unknown> | null;
  responseFinishReasons: string[];
  status: string;
  failureCode: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function createUserModelRequestLog(
  db: SqlDatabase,
  input: UserModelRequestLogCreateInput,
): Promise<UserModelRequestLogRecord> {
  const row = await queryOne<UserModelRequestLogRow>(
    db,
    `
      INSERT INTO user_model_request_logs (
        id,
        provider_request_id,
        project_id,
        canvas_project_id,
        workflow_id,
        task_id,
        attempt_id,
        agent_task_id,
        agent_step_id,
        user_id,
        provider_name,
        provider_operation,
        model_id,
        provider_model,
        request_key,
        request_hash,
        payload_hash,
        payload_summary,
        request_format,
        request_body_json,
        request_text,
        status,
        started_at,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        COALESCE($19, 'openai_chat_completions'), $20::jsonb, $21, 'submitted', $22, $22, $22
      )
      ON CONFLICT (provider_request_id)
      DO UPDATE SET
        request_format = EXCLUDED.request_format,
        request_body_json = EXCLUDED.request_body_json,
        request_text = EXCLUDED.request_text,
        payload_summary = EXCLUDED.payload_summary,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    [
      randomUUID(),
      input.providerRequestId,
      input.projectId ?? null,
      input.canvasProjectId ?? null,
      input.workflowId ?? null,
      input.taskId ?? null,
      input.attemptId ?? null,
      input.agentTaskId ?? null,
      input.agentStepId ?? null,
      input.userId ?? null,
      input.providerName,
      input.providerOperation,
      input.modelId,
      input.providerModel,
      input.requestKey,
      input.requestHash,
      input.payloadHash,
      input.payloadSummary ?? null,
      input.requestFormat ?? null,
      JSON.stringify(input.requestBody),
      input.requestText ?? null,
      input.now,
    ],
  );

  return userModelRequestLogFromRow(row!);
}

export async function completeUserModelRequestLog(
  db: SqlDatabase,
  input: UserModelRequestLogCompleteInput,
): Promise<UserModelRequestLogRecord | null> {
  const row = await queryOne<UserModelRequestLogRow>(
    db,
    `
      UPDATE user_model_request_logs
      SET status = $2,
          response_text = COALESCE($3, response_text),
          response_usage_json = $4::jsonb,
          response_finish_reasons_json = $5::jsonb,
          failure_code = $6,
          completed_at = $7,
          updated_at = $7
      WHERE provider_request_id = $1
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.status,
      input.responseText ?? null,
      JSON.stringify(input.responseUsage ?? null),
      JSON.stringify(input.finishReasons ?? []),
      input.failureCode ?? null,
      input.now,
    ],
  );

  return row ? userModelRequestLogFromRow(row) : null;
}

function userModelRequestLogFromRow(
  row: UserModelRequestLogRow,
): UserModelRequestLogRecord {
  return {
    id: row.id,
    providerRequestId: row.provider_request_id,
    projectId: row.project_id,
    ...(row.canvas_project_id ? { canvasProjectId: row.canvas_project_id } : {}),
    workflowId: row.workflow_id,
    taskId: row.task_id,
    attemptId: row.attempt_id,
    ...(row.agent_task_id ? { agentTaskId: row.agent_task_id } : {}),
    ...(row.agent_step_id ? { agentStepId: row.agent_step_id } : {}),
    userId: row.user_id,
    providerName: row.provider_name,
    providerOperation: row.provider_operation,
    modelId: row.model_id,
    providerModel: row.provider_model,
    requestKey: row.request_key,
    requestHash: row.request_hash,
    payloadHash: row.payload_hash,
    payloadSummary: row.payload_summary,
    requestFormat: row.request_format,
    requestBody: row.request_body_json ?? {},
    requestText: row.request_text,
    responseText: row.response_text,
    responseUsage: row.response_usage_json ?? null,
    responseFinishReasons: Array.isArray(row.response_finish_reasons_json)
      ? row.response_finish_reasons_json
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [],
    status: row.status,
    failureCode: row.failure_code,
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
