import { randomUUID } from "node:crypto";

import type { ProviderRequestStatus } from "../../../../../packages/contracts/domain/states.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { MediaGenerationArtifact, ProviderAdapter } from "./provider-adapter.contract.ts";
import { ModelError } from "./model-error.ts";
import { translateProviderErrorMessageField } from "./provider-error-message.ts";
import {
  compactProviderAuditValue,
  preserveProviderRequestValue,
  readProviderRawResponse,
} from "./provider-response-diagnostics.ts";
import { buildTaskCenterProviderDiagnostics } from "./task-center-provider-diagnostics.ts";

const PROVIDER_SUBMISSION_RECOVERY_IN_PROGRESS = "provider_submission_recovery_in_progress";
const PROVIDER_SUBMISSION_RECOVERY_LEASE_MS = 10 * 60 * 1000;

export interface ProviderRequestRecord {
  id: string;
  userId: string | null;
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
  createdByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderRequestInput {
  userId?: string | null;
  createdByAdminId?: string | null;
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
  created_by_admin_id: string | null;
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
        created_by_admin_id,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15::jsonb, $16, $17, 'created', $18, $19, $20, $20
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
      input.userId ?? null,
      input.createdByAdminId ?? null,
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
  | { kind: "stale_attempt"; request: ProviderRequestRecord }
> {
  let prepared = await createOrReuseProviderRequest(db, input);

  if (
    prepared.request.externalSubmissionStartedAt
    && input.taskId
    && input.attemptId
    && ["failed", "canceled"].includes(prepared.request.status)
    && !(await providerRequestBelongsToExpectedAttempt(db, {
      providerRequestId: prepared.request.id,
      taskId: input.taskId,
      attemptId: input.attemptId,
    }))
  ) {
    prepared = await createOrReuseProviderRequest(db, {
      ...input,
      requestKey: `${input.requestKey}:retry:${input.attemptId}`,
    });
  }

  if (prepared.request.externalSubmissionStartedAt) {
    if (
      input.taskId &&
      input.attemptId &&
      !(await providerRequestBelongsToExpectedAttempt(db, {
        providerRequestId: prepared.request.id,
        taskId: input.taskId,
        attemptId: input.attemptId,
      }))
    ) {
      return { kind: "stale_attempt", request: prepared.request };
    }
    if (
      !prepared.request.externalRequestId
      && (
        prepared.request.status === "result_unknown"
        || (
          prepared.request.status === "submitted"
          && prepared.request.failureCode === PROVIDER_SUBMISSION_RECOVERY_IN_PROGRESS
        )
      )
    ) {
      const claimed = await tryClaimProviderSubmissionRecovery(db, {
        providerRequestId: prepared.request.id,
        now: input.now,
      });
      if (!claimed) {
        return {
          kind: "already_started",
          request: (await findProviderRequestById(db, prepared.request.id))!,
        };
      }
      let recovered: Awaited<ReturnType<NonNullable<ProviderAdapter["recoverSubmission"]>>> | undefined;
      try {
        recovered = await input.adapter.recoverSubmission?.({
          providerRequestId: claimed.id,
          providerName: claimed.providerName,
          providerOperation: claimed.providerOperation,
          requestKey: claimed.requestKey,
          payloadRef: claimed.payloadRef,
          payloadHash: claimed.payloadHash,
          redactedPayload: claimed.redactedPayload,
          externalSubmissionStartedAt: claimed.externalSubmissionStartedAt,
        });
        if (!recovered?.externalRequestId?.trim()) {
          throw new Error("provider_submission_missing_task_id");
        }
      } catch (error) {
        const failureCode = "provider_submission_missing_task_id";
        const modelError = ModelError.fromUnknown(error, {
          failureCode,
          phase: "submit",
        });
        const failed = await markProviderSubmissionRecoveryFailed(db, {
          providerRequestId: claimed.id,
          recoveryClaimedAt: claimed.updatedAt,
          failureCode,
          redactedResponse: {
            ...(readProviderDiagnostics(error) ?? {}),
            ...modelError.toRedactedProviderRecord(),
          },
          now: input.now,
        });
        if (!failed) {
          return {
            kind: "already_started",
            request: (await findProviderRequestById(db, claimed.id))!,
          };
        }
        throw modelError;
      }
      const accepted = await persistAcceptedProviderSubmission(db, {
        providerRequestId: claimed.id,
        recoveryClaimedAt: claimed.updatedAt,
        externalRequestId: recovered.externalRequestId,
        status: recovered.status,
        redactedResponse: sanitizeProviderIdentityFields(withStoredProviderRawResponse(recovered.redactedResponse ?? {})),
        now: input.now,
      });
      if (!accepted.persisted) {
        return {
          kind: "already_started",
          request: accepted.request,
        };
      }
      return {
        kind: "submitted",
        request: accepted.request,
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
    expectedTaskId: input.taskId ?? null,
    expectedAttemptId: input.attemptId ?? null,
    now: input.now,
  });

  if (!started) {
    const current = (await findProviderRequestById(db, prepared.request.id))!;
    if (
      input.taskId &&
      input.attemptId &&
      !(await providerRequestBelongsToExpectedAttempt(db, {
        providerRequestId: current.id,
        taskId: input.taskId,
        attemptId: input.attemptId,
      }))
    ) {
      return { kind: "stale_attempt", request: current };
    }
    return {
      kind: "already_started",
      request: current,
    };
  }

  let submitted: Awaited<ReturnType<ProviderAdapter["submit"]>>;
  try {
    submitted = await input.adapter.submit({
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

    if (!submitted.externalRequestId?.trim()) {
      throw Object.assign(new Error("provider_submission_missing_task_id"), {
        failureCode: "provider_submission_missing_task_id",
        providerDiagnostics: {
          httpStatus: 200,
          response: submitted.redactedResponse ?? {},
        },
      });
    }

  } catch (error) {
    const definitiveFailure = hasDefinitiveProviderResponse(error);
    const failureCode = definitiveFailure
      ? readProviderFailureCode(error)
      : "provider_submission_missing_task_id";
    const modelError = ModelError.fromUnknown(error, {
      failureCode,
      phase: "submit",
    });
    const redactedResponse = {
      ...(readProviderDiagnostics(error) ?? {}),
      ...modelError.toRedactedProviderRecord(),
    };
    await markProviderRequestFailed(db, {
      providerRequestId: started.id,
      failureCode,
      redactedResponse,
      now: input.now,
    });
    throw modelError;
  }

  const accepted = await persistAcceptedProviderSubmission(db, {
    providerRequestId: started.id,
    externalRequestId: submitted.externalRequestId,
    status: submitted.status,
    redactedResponse: sanitizeProviderIdentityFields(withStoredProviderRawResponse(submitted.redactedResponse ?? {})),
    now: input.now,
  });
  if (!accepted.persisted) {
    return {
      kind: "already_started",
      request: accepted.request,
    };
  }
  return {
    kind: "submitted",
    request: accepted.request,
    artifacts: submitted.artifacts,
    redactedRequest: submitted.redactedRequest,
  };
}

export async function refreshPreparedProviderRequestPayload(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    redactedPayload: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(db, `
    UPDATE provider_requests
    SET payload_redacted_json=$2::jsonb, updated_at=$3
    WHERE id=$1
      AND status='created'
      AND external_submission_started_at IS NULL
      AND external_request_id IS NULL
    RETURNING *
  `, [input.providerRequestId, JSON.stringify(input.redactedPayload), input.now]);
  return row
    ? providerRequestFromRow(row)
    : (await findProviderRequestById(db, input.providerRequestId))!;
}

async function markProviderSubmissionRecoveryFailed(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    recoveryClaimedAt: Date;
    failureCode: string;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = 'failed',
          next_poll_at = NULL,
          response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb) || $4::jsonb,
          task_center_diagnostics_json = COALESCE($5::jsonb, task_center_diagnostics_json),
          failure_code = $3,
          updated_at = $6
      WHERE id = $1
        AND status = 'submitted'
        AND external_request_id IS NULL
        AND failure_code = $7
        AND updated_at = $2
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.recoveryClaimedAt,
      input.failureCode,
      JSON.stringify(sanitizeProviderIdentityFields(withStoredProviderRawResponse(input.redactedResponse))),
      serializeTaskCenterProviderDiagnostics(input.redactedResponse),
      input.now,
      PROVIDER_SUBMISSION_RECOVERY_IN_PROGRESS,
    ],
  );
  return row ? providerRequestFromRow(row) : undefined;
}

async function tryClaimProviderSubmissionRecovery(
  db: SqlDatabase,
  input: { providerRequestId: string; now: Date },
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = 'submitted',
          failure_code = $4,
          updated_at = $2
      WHERE id = $1
        AND external_request_id IS NULL
        AND (
          status = 'result_unknown'
          OR (
            status = 'submitted'
            AND failure_code = $4
            AND updated_at <= $3
          )
        )
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.now,
      new Date(input.now.getTime() - PROVIDER_SUBMISSION_RECOVERY_LEASE_MS),
      PROVIDER_SUBMISSION_RECOVERY_IN_PROGRESS,
    ],
  );
  return row ? providerRequestFromRow(row) : undefined;
}

async function markAcceptedProviderSubmissionResultUnknown(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string;
    failureCode: string;
    redactedResponse: Record<string, unknown>;
    recoveryClaimedAt?: Date;
    now: Date;
  },
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = 'result_unknown',
          external_request_id = $2,
          failure_code = $3,
          response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb) || $4::jsonb,
          task_center_diagnostics_json = COALESCE($5::jsonb, task_center_diagnostics_json),
          updated_at = $6
      WHERE id = $1
        AND status = 'submitted'
        AND external_request_id IS NULL
        AND ($7::timestamptz IS NULL OR updated_at = $7)
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.externalRequestId,
      input.failureCode,
      JSON.stringify(sanitizeProviderIdentityFields(withStoredProviderRawResponse(input.redactedResponse))),
      serializeTaskCenterProviderDiagnostics(input.redactedResponse),
      input.now,
      input.recoveryClaimedAt ?? null,
    ],
  );
  return row ? providerRequestFromRow(row) : undefined;
}

async function persistAcceptedProviderSubmission(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string;
    status: Extract<ProviderRequestStatus, "accepted" | "running" | "succeeded">;
    redactedResponse: Record<string, unknown>;
    recoveryClaimedAt?: Date;
    now: Date;
  },
): Promise<{ request: ProviderRequestRecord; persisted: boolean }> {
  try {
    return {
      request: await recordProviderSubmissionAccepted(db, input),
      persisted: true,
    };
  } catch (error) {
    const failureCode = "provider_submission_persist_failed";
    const modelError = ModelError.fromUnknown(error, {
      failureCode,
      phase: "submit",
    });
    const preserved = await markAcceptedProviderSubmissionResultUnknown(db, {
      providerRequestId: input.providerRequestId,
      externalRequestId: input.externalRequestId,
      failureCode,
      redactedResponse: {
        ...input.redactedResponse,
        ...modelError.toRedactedProviderRecord(),
      },
      recoveryClaimedAt: input.recoveryClaimedAt,
      now: input.now,
    });
    if (!preserved) {
      return {
        request: (await findProviderRequestById(db, input.providerRequestId))!,
        persisted: false,
      };
    }
    throw modelError;
  }
}

async function providerRequestBelongsToExpectedAttempt(
  db: SqlDatabase,
  input: { providerRequestId: string; taskId: string; attemptId: string },
): Promise<boolean> {
  const row = await queryOne<{ matches: boolean }>(
    db,
    `
      SELECT EXISTS (
        SELECT 1
        FROM provider_requests request
        JOIN tasks task ON task.id = request.task_id
        JOIN task_attempts attempt
          ON attempt.id = $3
         AND attempt.task_id = task.id
        WHERE request.id = $1
          AND task.id = $2
          AND task.current_attempt_id = $3
          AND task.status = 'running'
          AND attempt.status = 'running'
          AND (
            request.attempt_id = $3
            OR (request.attempt_id IS NULL AND task.attempt_count = 1)
          )
      ) AS matches
    `,
    [input.providerRequestId, input.taskId, input.attemptId],
  );

  return row?.matches === true;
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
        AND external_request_id IS NULL
        AND status = 'submitted'
      RETURNING *
    `,
    [
      input.providerRequestId,
      JSON.stringify(preserveProviderRequestValue(input.request)),
      input.now,
    ],
  );

  return row
    ? providerRequestFromRow(row)
    : (await findProviderRequestById(db, input.providerRequestId))!;
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
    expectedTaskId?: string | null;
    expectedAttemptId?: string | null;
    now: Date;
  },
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      WITH locked_attempt AS MATERIALIZED (
        SELECT task.id
        FROM tasks task
        JOIN task_attempts attempt
          ON attempt.id = $5::uuid
         AND attempt.task_id = task.id
        WHERE $4::uuid IS NOT NULL
          AND $5::uuid IS NOT NULL
          AND task.id = $4::uuid
          AND task.current_attempt_id = $5::uuid
          AND task.status = 'running'
          AND attempt.status = 'running'
        FOR UPDATE OF task, attempt
      )
      UPDATE provider_requests
      SET attempt_id = CASE
            WHEN $4::uuid IS NOT NULL AND $5::uuid IS NOT NULL THEN $5::uuid
            ELSE attempt_id
          END,
          status = 'submitted',
          external_submission_started_at = $2,
          external_request_id = $3,
          updated_at = $2
      WHERE id = $1
        AND external_submission_started_at IS NULL
        AND (
          $4::uuid IS NULL
          OR $5::uuid IS NULL
          OR (task_id = $4::uuid AND EXISTS (SELECT 1 FROM locked_attempt))
        )
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.now,
      input.externalRequestId,
      input.expectedTaskId ?? null,
      input.expectedAttemptId ?? null,
    ],
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
        AND (
          external_submission_started_at IS NOT NULL
          OR external_request_id IS NOT NULL
          OR status IN ('submitted', 'accepted', 'running', 'result_unknown')
        )
        AND status NOT IN ('succeeded', 'failed', 'canceled')
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

  return row
    ? providerRequestFromRow(row)
    : (await findProviderRequestById(db, input.providerRequestId))!;
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
  const failureCode = readProviderFailureCode(error);
  if (failureCode.startsWith("san_bao_") && failureCode !== "san_bao_network_error") {
    return true;
  }
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
    recoveryClaimedAt?: Date;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = $2,
          external_request_id = $3,
          failure_code = NULL,
          response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb) || $4::jsonb,
          task_center_diagnostics_json = COALESCE($5::jsonb, task_center_diagnostics_json),
          updated_at = $6
      WHERE id = $1
        AND external_submission_started_at IS NOT NULL
        AND status = 'submitted'
        AND external_request_id IS NULL
        AND ($7::timestamptz IS NULL OR updated_at = $7)
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.status,
      input.externalRequestId,
      JSON.stringify(sanitizeProviderIdentityFields(withStoredProviderRawResponse(input.redactedResponse))),
      serializeTaskCenterProviderDiagnostics(input.redactedResponse),
      input.now,
      input.recoveryClaimedAt ?? null,
    ],
  );

  if (!row) throw new Error("provider_request_submission_acceptance_conflict");
  return providerRequestFromRow(row);
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
        AND (
          external_submission_started_at IS NOT NULL
          OR external_request_id IS NOT NULL
          OR status IN ('submitted', 'accepted', 'running', 'result_unknown')
          OR (
            status = 'created'
            AND external_submission_started_at IS NULL
            AND external_request_id IS NULL
          )
          OR status = $2
        )
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
    createdByAdminId: row.created_by_admin_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
