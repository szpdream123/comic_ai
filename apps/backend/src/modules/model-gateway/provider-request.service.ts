import { randomUUID } from "node:crypto";

import type { ProviderRequestStatus } from "../../../../../packages/contracts/domain/states.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { MediaGenerationArtifact, ProviderAdapter } from "./provider-adapter.contract.ts";
import { ModelError } from "./model-error.ts";
import { translateProviderErrorMessageField } from "./provider-error-message.ts";
import { compactProviderAuditValue, readProviderRawResponse } from "./provider-response-diagnostics.ts";
import { buildTaskCenterProviderDiagnostics } from "./task-center-provider-diagnostics.ts";

export interface ProviderRequestRecord {
  id: string;
  userId: string;
  projectId: string | null;
  canvasProjectId?: string;
  workflowId: string | null;
  taskId: string | null;
  attemptId: string | null;
  agentTaskId?: string | null;
  agentStepId?: string | null;
  providerName: string;
  providerOperation: string;
  requestKey: string;
  requestHash: string;
  payloadRef: string;
  payloadHash: string;
  redactedPayload: Record<string, unknown>;
  status: ProviderRequestStatus;
  externalSubmissionStartedAt: Date | null;
  externalRequestId: string | null;
  redactedResponse: Record<string, unknown> | null;
  failureCode: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderRequestInput {
  userId: string;
  projectId?: string | null;
  canvasProjectId?: string | null;
  workflowId?: string | null;
  taskId?: string | null;
  attemptId?: string | null;
  agentTaskId?: string | null;
  agentStepId?: string | null;
  providerName: string;
  providerOperation: string;
  requestKey: string;
  requestHash: string;
  payloadRef: string;
  payloadHash: string;
  redactedPayload: Record<string, unknown>;
  providerConfigRevisionId?: string | null;
  credentialVersionRef?: string | null;
  now: Date;
}

interface ProviderRequestRow {
  id: string;
  project_id: string | null;
  canvas_project_id: string | null;
  workflow_id: string | null;
  task_id: string | null;
  attempt_id: string | null;
  agent_task_id: string | null;
  agent_step_id: string | null;
  provider_name: string;
  provider_operation: string;
  request_key: string;
  request_hash: string;
  payload_ref: string;
  payload_hash: string;
  payload_redacted_json: Record<string, unknown>;
  status: ProviderRequestStatus;
  external_submission_started_at: Date | string | null;
  external_request_id: string | null;
  response_redacted_json: Record<string, unknown> | null;
  failure_code: string | null;
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export class ProviderRequestConflictError extends Error {
  readonly code = "provider_request_conflict";

  constructor() {
    super("Provider request key was reused with a different request or payload hash.");
  }
}

export async function createOrReuseProviderRequest(
  db: SqlDatabase,
  input: ProviderRequestInput,
): Promise<{ kind: "created" | "reused"; request: ProviderRequestRecord }> {
  const requestId = randomUUID();
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      INSERT INTO provider_requests (
        id,
        project_id,
        canvas_project_id,
        workflow_id,
        task_id,
        attempt_id,
        agent_task_id,
        agent_step_id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        provider_config_revision_id,
        credential_version_ref,
        status,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15::jsonb, $16, $17, 'created', $18, $19, $19
      )
      ON CONFLICT (provider_name, provider_operation, request_key)
      DO NOTHING
      RETURNING *
    `,
    [
      requestId,
      input.projectId ?? null,
      input.canvasProjectId ?? null,
      input.workflowId ?? null,
      input.taskId ?? null,
      input.attemptId ?? null,
      input.agentTaskId ?? null,
      input.agentStepId ?? null,
      input.providerName,
      input.providerOperation,
      input.requestKey,
      input.requestHash,
      input.payloadRef,
      input.payloadHash,
      JSON.stringify(input.redactedPayload),
      input.providerConfigRevisionId ?? null,
      input.credentialVersionRef ?? null,
      input.userId,
      input.now,
    ],
  );

  if (!row) {
    const existing = await findProviderRequestByKey(db, input);

    if (
      !existing ||
      existing.requestHash !== input.requestHash ||
      existing.payloadHash !== input.payloadHash ||
      existing.payloadRef !== input.payloadRef
    ) {
      throw new ProviderRequestConflictError();
    }

    return { kind: "reused", request: existing };
  }

  return {
    kind: "created",
    request: providerRequestFromRow(row),
  };
}

export async function submitProviderRequest(
  db: SqlDatabase,
  input: ProviderRequestInput & {
    adapter: ProviderAdapter;
  },
): Promise<
  | {
      kind: "submitted";
      request: ProviderRequestRecord;
      artifacts?: MediaGenerationArtifact[];
      redactedRequest?: Record<string, unknown>;
    }
  | { kind: "already_started"; request: ProviderRequestRecord }
> {
  const prepared = await createOrReuseProviderRequest(db, input);

  if (prepared.request.externalSubmissionStartedAt) {
    const recovered = !prepared.request.externalRequestId
      && !["failed", "canceled", "succeeded"].includes(prepared.request.status)
      ? await input.adapter.recoverSubmission?.({
          providerRequestId: prepared.request.id,
          providerName: prepared.request.providerName,
          providerOperation: prepared.request.providerOperation,
          requestKey: prepared.request.requestKey,
          payloadRef: prepared.request.payloadRef,
          payloadHash: prepared.request.payloadHash,
          redactedPayload: prepared.request.redactedPayload,
          externalSubmissionStartedAt: prepared.request.externalSubmissionStartedAt,
        })
      : null;
    if (recovered) {
      const accepted = await recordProviderSubmissionAccepted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: recovered.externalRequestId,
        status: recovered.status,
        redactedResponse: sanitizeProviderIdentityFields(withStoredProviderRawResponse(recovered.redactedResponse ?? {})),
        now: input.now,
      });
      return {
        kind: "submitted",
        request: accepted,
        artifacts: recovered.artifacts,
        redactedRequest: recovered.redactedRequest,
      };
    }
    return {
      kind: "already_started",
      request: prepared.request,
    };
  }

  const started = await tryMarkExternalSubmissionStarted(db, {
    providerRequestId: prepared.request.id,
    externalRequestId: null,
    now: input.now,
  });

  if (!started) {
    return {
      kind: "already_started",
      request: (await findProviderRequestById(db, prepared.request.id))!,
    };
  }

  try {
    const submitted = await input.adapter.submit({
      providerRequestId: started.id,
      providerName: started.providerName,
      providerOperation: started.providerOperation,
      requestKey: started.requestKey,
      payloadRef: started.payloadRef,
      payloadHash: started.payloadHash,
      redactedPayload: started.redactedPayload,
      recordRedactedRequest: async (request) => {
        await recordProviderRequestRedactedBody(db, {
          providerRequestId: started.id,
          request,
          now: input.now,
        });
      },
    });

    const accepted = await recordProviderSubmissionAccepted(db, {
      providerRequestId: started.id,
      externalRequestId: submitted.externalRequestId,
      status: submitted.status,
      redactedResponse: sanitizeProviderIdentityFields(withStoredProviderRawResponse(submitted.redactedResponse ?? {})),
      now: input.now,
    });

    return {
      kind: "submitted",
      request: accepted,
      artifacts: submitted.artifacts,
      redactedRequest: submitted.redactedRequest,
    };
  } catch (error) {
    const definitiveFailure = hasDefinitiveProviderResponse(error);
    const failureCode = definitiveFailure
      ? readProviderFailureCode(error)
      : "provider_submission_ambiguous";
    const modelError = ModelError.fromUnknown(error, {
      failureCode,
      phase: "submit",
    });
    const redactedResponse = {
      ...(readProviderDiagnostics(error) ?? {}),
      ...modelError.toRedactedProviderRecord(),
    };
    if (definitiveFailure) {
      await markProviderRequestFailed(db, {
        providerRequestId: started.id,
        failureCode,
        redactedResponse,
        now: input.now,
      });
    } else {
      await markProviderRequestResultUnknown(db, {
        providerRequestId: started.id,
        failureCode,
        redactedResponse,
        now: input.now,
      });
    }
    throw error;
  }
}

export async function markExternalSubmissionStarted(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string | null;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const started = await tryMarkExternalSubmissionStarted(db, input);
  if (started) {
    return started;
  }

  return (await findProviderRequestById(db, input.providerRequestId))!;
}

export async function recordProviderRequestRedactedBody(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    request: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb)
            || jsonb_build_object('redactedRequest', $2::jsonb),
          updated_at = $3
      WHERE id = $1
        AND external_submission_started_at IS NOT NULL
      RETURNING *
    `,
    [
      input.providerRequestId,
      JSON.stringify(compactProviderAuditValue(input.request)),
      input.now,
    ],
  );

  return providerRequestFromRow(row!);
}

export async function hasExternalProviderSubmissionStartedForTask(
  db: SqlDatabase,
  input: { taskId: string },
): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM provider_requests
        WHERE task_id = $1
          AND external_submission_started_at IS NOT NULL
      ) AS exists
    `,
    [input.taskId],
  );

  return result.rows[0]?.exists ?? false;
}

async function tryMarkExternalSubmissionStarted(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string | null;
    now: Date;
  },
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = 'submitted',
          external_submission_started_at = $2,
          external_request_id = $3,
          updated_at = $2
      WHERE id = $1
        AND external_submission_started_at IS NULL
      RETURNING *
    `,
    [input.providerRequestId, input.now, input.externalRequestId],
  );

  return row ? providerRequestFromRow(row) : undefined;
}

export async function markProviderRequestResultUnknown(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    failureCode: string;
    redactedResponse?: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = 'result_unknown',
          failure_code = $2,
          response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb)
            || COALESCE($3::jsonb, '{}'::jsonb),
          task_center_diagnostics_json = COALESCE($4::jsonb, task_center_diagnostics_json),
          updated_at = $5
      WHERE id = $1
        AND external_submission_started_at IS NOT NULL
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.failureCode,
      input.redactedResponse ? JSON.stringify(sanitizeProviderIdentityFields(withStoredProviderRawResponse(input.redactedResponse))) : null,
      serializeTaskCenterProviderDiagnostics(input.redactedResponse),
      input.now,
    ],
  );

  return providerRequestFromRow(row!);
}

function readProviderDiagnostics(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== "object") return undefined;
  const diagnostics = (error as { providerDiagnostics?: unknown }).providerDiagnostics;
  const redactedRequest = (error as { providerRedactedRequest?: unknown }).providerRedactedRequest;
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) {
    return readRedactedRequestRecord(redactedRequest);
  }
  const response = {
    diagnostics: diagnostics as Record<string, unknown>,
    ...readRedactedRequestRecord(redactedRequest),
  };
  const rawResponse = readProviderRawResponse(diagnostics);
  return rawResponse === undefined ? response : { ...response, providerRawResponse: rawResponse };
}

function serializeTaskCenterProviderDiagnostics(value: Record<string, unknown> | undefined) {
  const diagnostics = buildTaskCenterProviderDiagnostics(value);
  return diagnostics ? JSON.stringify(diagnostics) : null;
}

function hasDefinitiveProviderResponse(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const diagnostics = (error as { providerDiagnostics?: unknown }).providerDiagnostics;
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) return false;
  const httpStatus = Number((diagnostics as { httpStatus?: unknown }).httpStatus);
  return Number.isInteger(httpStatus) && httpStatus >= 100;
}

function readProviderFailureCode(error: unknown): string {
  if (!error || typeof error !== "object") return "provider_submission_failed";
  const failureCode = String((error as { failureCode?: unknown }).failureCode ?? "").trim();
  return failureCode || "provider_submission_failed";
}

function readRedactedRequestRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { redactedRequest: value as Record<string, unknown> }
    : undefined;
}

export async function markProviderRequestSucceeded(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string | null;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  return updateProviderRequestTerminalStatus(db, {
    providerRequestId: input.providerRequestId,
    status: "succeeded",
    externalRequestId: input.externalRequestId,
    redactedResponse: input.redactedResponse,
    failureCode: null,
    now: input.now,
  });
}

export async function markProviderRequestFailed(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    failureCode: string;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  return updateProviderRequestTerminalStatus(db, {
    providerRequestId: input.providerRequestId,
    status: "failed",
    externalRequestId: null,
    redactedResponse: input.redactedResponse,
    failureCode: input.failureCode,
    now: input.now,
  });
}

export async function markProviderRequestCanceled(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    failureCode: string;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  return updateProviderRequestTerminalStatus(db, {
    providerRequestId: input.providerRequestId,
    status: "canceled",
    externalRequestId: null,
    redactedResponse: input.redactedResponse,
    failureCode: input.failureCode,
    now: input.now,
  });
}

async function recordProviderSubmissionAccepted(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string;
    status: Extract<ProviderRequestStatus, "accepted" | "running" | "succeeded">;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = $2,
          external_request_id = $3,
          response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb) || $4::jsonb,
          task_center_diagnostics_json = COALESCE($5::jsonb, task_center_diagnostics_json),
          updated_at = $6
      WHERE id = $1
        AND external_submission_started_at IS NOT NULL
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.status,
      input.externalRequestId,
      JSON.stringify(sanitizeProviderIdentityFields(withStoredProviderRawResponse(input.redactedResponse))),
      serializeTaskCenterProviderDiagnostics(input.redactedResponse),
      input.now,
    ],
  );

  return providerRequestFromRow(row!);
}

export async function advanceProviderRequestStage(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(db, `
    UPDATE provider_requests
    SET status='running',
        external_request_id=$2,
        response_redacted_json=COALESCE(response_redacted_json, '{}'::jsonb) || $3::jsonb,
        task_center_diagnostics_json=COALESCE($4::jsonb, task_center_diagnostics_json),
        next_poll_at=$5,
        updated_at=$5
    WHERE id=$1
      AND status IN ('accepted','running')
    RETURNING *
  `, [
    input.providerRequestId,
    input.externalRequestId,
    JSON.stringify(sanitizeProviderIdentityFields(withStoredProviderRawResponse(input.redactedResponse))),
    serializeTaskCenterProviderDiagnostics(input.redactedResponse),
    input.now,
  ]);
  if (!row) throw new Error("provider_request_stage_transition_conflict");
  return providerRequestFromRow(row);
}

async function updateProviderRequestTerminalStatus(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    status: Extract<
      ProviderRequestStatus,
      "succeeded" | "failed" | "canceled"
    >;
    externalRequestId: string | null;
    redactedResponse: Record<string, unknown>;
    failureCode: string | null;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = $2,
          external_request_id = COALESCE($3, external_request_id),
          next_poll_at = NULL,
          response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb) || $4::jsonb,
          task_center_diagnostics_json = COALESCE($5::jsonb, task_center_diagnostics_json),
          failure_code = $6,
          updated_at = $7
      WHERE id = $1
        AND external_submission_started_at IS NOT NULL
        AND (
          status NOT IN ('succeeded', 'failed', 'canceled')
          OR status = $2
        )
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.status,
      input.externalRequestId,
      JSON.stringify(sanitizeProviderIdentityFields(withStoredProviderRawResponse(input.redactedResponse))),
      serializeTaskCenterProviderDiagnostics(input.redactedResponse),
      input.failureCode,
      input.now,
    ],
  );

  if (!row) {
    throw new Error("provider_request_terminal_state_conflict");
  }
  return providerRequestFromRow(row);
}

function sanitizeProviderIdentityFields(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeProviderIdentityValue(value) as Record<string, unknown>;
}

function withStoredProviderRawResponse(value: Record<string, unknown>): Record<string, unknown> {
  const rawResponse = readProviderRawResponse(value);
  return rawResponse === undefined
    ? value
    : { ...value, providerRawResponse: compactProviderAuditValue(rawResponse) };
}

function sanitizeProviderIdentityValue(value: unknown, parentKey?: string): unknown {
  if (parentKey === "redactedRequest") {
    return value;
  }
  if (parentKey === "diagnostics") {
    return value;
  }
  if (parentKey === "providerRawResponse") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProviderIdentityValue(item, parentKey));
  }
  if (typeof value === "string") {
    return parentKey === "model"
      ? value
      : parentKey === "responseBodyPreview"
        ? sanitizeProviderIdentityString(value)
      : translateProviderErrorMessageField(parentKey, sanitizeProviderIdentityString(value));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "providerName" && key !== "provider" && key !== "providerLabel")
      .map(([key, entryValue]) => [key, sanitizeProviderIdentityValue(entryValue, key)]),
  );
}

function sanitizeProviderIdentityString(value: string): string {
  const sanitized = value
    .replace(/\b(OpenAI|GlobalAiOpc|Volcengine|Lingdong|Aliyun|DashScope|DeepSeek|Qwen)\b/gi, "[provider]")
    .replace(/\bExtra\s+Token\b/gi, "[provider]");
  return sanitized;
}

async function findProviderRequestByKey(
  db: SqlDatabase,
  input: Pick<ProviderRequestInput, "providerName" | "providerOperation" | "requestKey">,
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      SELECT *
      FROM provider_requests
      WHERE provider_name = $1
        AND provider_operation = $2
        AND request_key = $3
      LIMIT 1
    `,
    [
      input.providerName,
      input.providerOperation,
      input.requestKey,
    ],
  );

  return row ? providerRequestFromRow(row) : undefined;
}

async function findProviderRequestById(
  db: SqlDatabase,
  providerRequestId: string,
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    "SELECT * FROM provider_requests WHERE id = $1",
    [providerRequestId],
  );

  return row ? providerRequestFromRow(row) : undefined;
}

function providerRequestFromRow(row: ProviderRequestRow): ProviderRequestRecord {
  return {
    id: row.id,
    userId: row.created_by_user_id,
    projectId: row.project_id,
    ...(row.canvas_project_id ? { canvasProjectId: row.canvas_project_id } : {}),
    workflowId: row.workflow_id,
    taskId: row.task_id,
    attemptId: row.attempt_id,
    ...(row.agent_task_id ? { agentTaskId: row.agent_task_id } : {}),
    ...(row.agent_step_id ? { agentStepId: row.agent_step_id } : {}),
    providerName: row.provider_name,
    providerOperation: row.provider_operation,
    requestKey: row.request_key,
    requestHash: row.request_hash,
    payloadRef: row.payload_ref,
    payloadHash: row.payload_hash,
    redactedPayload: row.payload_redacted_json,
    status: row.status,
    externalSubmissionStartedAt: row.external_submission_started_at
      ? new Date(row.external_submission_started_at)
      : null,
    externalRequestId: row.external_request_id,
    redactedResponse: row.response_redacted_json,
    failureCode: row.failure_code,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
