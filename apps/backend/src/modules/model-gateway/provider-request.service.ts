import { randomUUID } from "node:crypto";

import type { ProviderRequestStatus } from "../../../../../packages/contracts/domain/states.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { MediaGenerationArtifact, ProviderAdapter } from "./provider-adapter.contract.ts";
import { ModelError } from "./model-error.ts";
import { translateProviderErrorMessageField } from "./provider-error-message.ts";
import {
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
  // Expose failureCode as well as code. Downstream classifiers (the seedance
  // worker's readErrorFailureCode, ModelError.fromUnknown) key off failureCode
  // only; without it this conflict collapsed to the generic
  // "provider_submission_failed" and the misleading "修改素材或提示词" message,
  // hiding the true pre-submission cause.
  readonly failureCode = "provider_request_conflict";

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
> {
  const prepared = await createOrReuseProviderRequest(db, input);
  await recordGlobalAiOpcLifecycleStepSafely(db, {
    providerRequestId: prepared.request.id,
    stage: "payload_assembled",
    details: {
      providerOperation: prepared.request.providerOperation,
      requestKey: prepared.request.requestKey,
      payload: prepared.request.redactedPayload,
    },
    now: input.now,
  });

  if (prepared.request.externalSubmissionStartedAt) {
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
    attemptId: null,
    now: input.now,
  });

  if (!started) {
    const current = (await findProviderRequestById(db, prepared.request.id))!;
    const diagnosed = await appendProviderRequestDiagnosticsSafely(db, {
      providerRequestId: current.id,
      diagnostics: {
        localStage: "external_submission_start_race",
        failureCode: "provider_submission_already_started",
        diagnosticNote: "另一个 worker 已先占用该幂等请求，当前调用不会重复提交供应商。",
      },
      now: input.now,
    });
    return {
      kind: "already_started",
      request: diagnosed ?? (await findProviderRequestById(db, current.id))!,
    };
  }

  await recordGlobalAiOpcLifecycleStepSafely(db, {
    providerRequestId: started.id,
    stage: "provider_http_request_started",
    details: { providerOperation: started.providerOperation },
    now: input.now,
  });

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
        await recordGlobalAiOpcLifecycleStepSafely(db, {
          providerRequestId: started.id,
          stage: "provider_http_request_ready",
          details: { requestBody: request },
          now: input.now,
        });
      },
    });

    // Keep the provider response durable before later task/queue transitions.
    await appendProviderRequestDiagnosticsSafely(db, {
      providerRequestId: started.id,
      diagnostics: {
        localStage: "provider_http_response",
        providerStatus: submitted.status,
        externalRequestId: submitted.externalRequestId ?? null,
        providerResponse: submitted.redactedResponse ?? null,
      },
      now: input.now,
    });
    await recordGlobalAiOpcLifecycleStepSafely(db, {
      providerRequestId: started.id,
      stage: "provider_http_response_received",
      details: {
        providerStatus: submitted.status,
        externalRequestId: submitted.externalRequestId ?? null,
        providerResponse: submitted.redactedResponse ?? null,
      },
      now: input.now,
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
      localStage: "provider_submit",
      internalError: {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      },
    };
    await recordGlobalAiOpcLifecycleStepSafely(db, {
      providerRequestId: started.id,
      stage: "provider_http_request_failed",
      details: redactedResponse,
      now: input.now,
    });
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
  const recorded = await appendProviderRequestDiagnosticsSafely(db, {
    providerRequestId: accepted.request.id,
    diagnostics: {
      localStage: "provider_task_id_received",
      externalRequestId: accepted.request.externalRequestId,
      providerStatus: accepted.request.status,
      queueHandoff: "pending",
    },
    now: input.now,
  });
  await recordGlobalAiOpcLifecycleStepSafely(db, {
    providerRequestId: accepted.request.id,
    stage: "provider_task_id_received",
    details: {
      externalRequestId: accepted.request.externalRequestId,
      providerStatus: accepted.request.status,
    },
    now: input.now,
  });
  return {
    kind: "submitted",
    request: recorded ?? accepted.request,
    artifacts: submitted.artifacts,
    redactedRequest: submitted.redactedRequest,
  };
}

export async function refreshPreparedProviderRequestPayload(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    redactedPayload: Record<string, unknown>;
    payloadHash?: string;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(db, `
    UPDATE provider_requests
    SET payload_redacted_json=$2::jsonb,
        status = 'created',
        failure_code = NULL,
        payload_hash=COALESCE($3, payload_hash),
        updated_at=$4
    WHERE id=$1
      AND status IN ('created', 'failed')
      AND external_submission_started_at IS NULL
      AND external_request_id IS NULL
    RETURNING *
  `, [
    input.providerRequestId,
    JSON.stringify(input.redactedPayload),
    input.payloadHash ?? null,
    input.now,
  ]);
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

  // The adapter callback runs immediately before the upstream HTTP request.
  // Keep the user-facing log aligned with that exact provider payload instead
  // of leaving the original generation-task snapshot (which may contain
  // internal fields such as parameters.firstFrame).
  await db.query(
    `
      UPDATE user_model_request_logs
      SET request_body_json = $2::jsonb,
          request_text = $3,
          updated_at = $4
      WHERE provider_request_id = $1
        AND status = 'submitted'
    `,
    [
      input.providerRequestId,
      JSON.stringify(preserveProviderRequestValue(input.request)),
      JSON.stringify(preserveProviderRequestValue(input.request), null, 2),
      input.now,
    ],
  );

  return row
    ? providerRequestFromRow(row)
    : (await findProviderRequestById(db, input.providerRequestId))!;
}

export async function appendProviderRequestDiagnostics(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    diagnostics: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb)
            || $2::jsonb,
          task_center_diagnostics_json = COALESCE(task_center_diagnostics_json, '{}'::jsonb)
            || COALESCE($3::jsonb, '{}'::jsonb),
          updated_at = $4
      WHERE id = $1
      RETURNING *
    `,
    [
      input.providerRequestId,
      JSON.stringify(sanitizeProviderIdentityFields(withStoredProviderRawResponse(input.diagnostics))),
      JSON.stringify(buildTaskCenterProviderDiagnostics(input.diagnostics) ?? {}),
      input.now,
    ],
  );
  return row
    ? providerRequestFromRow(row)
    : (await findProviderRequestById(db, input.providerRequestId))!;
}

export async function recordGlobalAiOpcLifecycleStep(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    stage: string;
    details?: Record<string, unknown>;
    now: Date;
  },
): Promise<void> {
  const step = sanitizeProviderIdentityFields({
    stage: input.stage,
    recordedAt: input.now.toISOString(),
    ...(input.details ?? {}),
  });
  await db.query(
    `
      UPDATE provider_requests
      SET task_center_diagnostics_json = COALESCE(task_center_diagnostics_json, '{}'::jsonb)
            || jsonb_build_object(
              'localStage', $2::text,
              'lifecycleSteps',
              COALESCE(task_center_diagnostics_json->'lifecycleSteps', '[]'::jsonb)
                || jsonb_build_array($3::jsonb)
            ),
          updated_at = $4
      WHERE id = $1
        AND lower(regexp_replace(provider_name, '[^a-zA-Z0-9]', '', 'g')) LIKE 'globalaiopc%'
    `,
    [input.providerRequestId, input.stage, JSON.stringify(step), input.now],
  );
}

async function recordGlobalAiOpcLifecycleStepSafely(
  db: SqlDatabase,
  input: Parameters<typeof recordGlobalAiOpcLifecycleStep>[1],
): Promise<void> {
  try {
    await recordGlobalAiOpcLifecycleStep(db, input);
  } catch {
    // Audit persistence must not delay or block the provider request.
  }
}

async function appendProviderRequestDiagnosticsSafely(
  db: SqlDatabase,
  input: Parameters<typeof appendProviderRequestDiagnostics>[1],
): Promise<ProviderRequestRecord | undefined> {
  try {
    return await appendProviderRequestDiagnostics(db, input);
  } catch {
    // Diagnostics must never change the submission outcome.
    return undefined;
  }
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
    attemptId?: string | null;
    now: Date;
  },
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests pr
      SET status = 'submitted',
          external_submission_started_at = $2,
          external_request_id = $3,
          updated_at = $2
      WHERE id = $1
        AND external_submission_started_at IS NULL
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.now,
      input.externalRequestId,
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
  const request = await updateProviderRequestTerminalStatus(db, {
    providerRequestId: input.providerRequestId,
    status: "succeeded",
    externalRequestId: input.externalRequestId,
    redactedResponse: input.redactedResponse,
    failureCode: null,
    now: input.now,
  });
  await recordGlobalAiOpcLifecycleStepSafely(db, {
    providerRequestId: input.providerRequestId,
    stage: "generation_succeeded",
    details: { externalRequestId: input.externalRequestId, providerResponse: input.redactedResponse },
    now: input.now,
  });
  return request;
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
  const request = await updateProviderRequestTerminalStatus(db, {
    providerRequestId: input.providerRequestId,
    status: "failed",
    externalRequestId: null,
    redactedResponse: input.redactedResponse,
    failureCode: input.failureCode,
    now: input.now,
  });
  await recordGlobalAiOpcLifecycleStepSafely(db, {
    providerRequestId: input.providerRequestId,
    stage: "generation_failed",
    details: { failureCode: input.failureCode, providerResponse: input.redactedResponse },
    now: input.now,
  });
  return request;
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
  const request = await updateProviderRequestTerminalStatus(db, {
    providerRequestId: input.providerRequestId,
    status: "canceled",
    externalRequestId: null,
    redactedResponse: input.redactedResponse,
    failureCode: input.failureCode,
    now: input.now,
  });
  await recordGlobalAiOpcLifecycleStepSafely(db, {
    providerRequestId: input.providerRequestId,
    stage: "generation_canceled",
    details: { failureCode: input.failureCode, providerResponse: input.redactedResponse },
    now: input.now,
  });
  return request;
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
  // Only failures need a synthesized stage. Succeeded and canceled records must
  // not be decorated with failure diagnostics — doing so made completed provider
  // responses look like unexplained failures in the task center.
  const needsStageFallback = input.status === "failed"
    && !(typeof input.redactedResponse.localStage === "string" && input.redactedResponse.localStage.trim());
  const terminalDiagnostics = {
    ...input.redactedResponse,
    ...(needsStageFallback
      ? {
          localStage: "provider_request_terminal_status",
          diagnosticNote: "终态失败记录未提供提交阶段，已由 provider request 终态监控补齐。",
          localError: {
            code: input.failureCode,
            message: "失败请求未携带更早阶段的本地异常详情。",
          },
        }
      : {}),
  };
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = $2,
          external_request_id = COALESCE($3, external_request_id),
          next_poll_at = NULL,
          response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb) || $4::jsonb
            || COALESCE((
              SELECT jsonb_object_agg(entry.key, entry.value)
              FROM jsonb_each(COALESCE(provider_requests.response_redacted_json, '{}'::jsonb)) entry
              WHERE entry.key = ANY(ARRAY[
                'localStage', 'localError', 'modelError', 'providerDiagnostics',
                'localState', 'internalError', 'diagnosticNote'
              ])
            ), '{}'::jsonb),
          task_center_diagnostics_json = COALESCE($5::jsonb, '{}'::jsonb)
            || COALESCE(task_center_diagnostics_json, '{}'::jsonb),
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
      JSON.stringify(sanitizeProviderIdentityFields(withStoredProviderRawResponse(terminalDiagnostics))),
      serializeTaskCenterProviderDiagnostics(terminalDiagnostics),
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
    : { ...value, providerRawResponse: rawResponse };
}

function sanitizeProviderIdentityValue(value: unknown, parentKey?: string): unknown {
  if (parentKey === "redactedRequest") {
    return value;
  }
  if (parentKey === "diagnostics") {
    return value;
  }
  if (parentKey === "localError" || parentKey === "internalError" || parentKey === "modelError") {
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
    .replace(/\b(OpenAI|Volcengine|Lingdong|Aliyun|DashScope|DeepSeek|Qwen)\b/gi, "[provider]")
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
