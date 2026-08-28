import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import {
  resolveWorkerIsolationConfig,
  buildWorkerIdWithEnvironment,
  shouldProcessTask,
  type WorkerIsolationConfig,
} from "./worker-isolation.config.ts";
import {
  settleReservationAllocation,
  settleReservationAllocationInTransaction,
} from "../credit-billing/credit-ledger.service.ts";
import {
  refundTeamMemberGenerationCredits,
  refundTeamMemberGenerationCreditsInTransaction,
  resolveGenerationBillingAmount,
} from "../credit-billing/team-member-generation-credit.service.ts";
import { createAssetVersionSnapshot } from "../project/asset-version-record.service.ts";
import {
  markAssetConversationGenerationSucceeded,
  markAssetConversationGenerationTerminal,
} from "../project/asset-conversation-record.service.ts";
import { ensureProjectUploadRecordForStorageObject } from "../project/project-upload-record.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  createOrReuseGenerationStorageObject,
  findGenerationStorageObject,
  findStorageObjectByKey,
  markStorageObjectAvailable,
  markStorageObjectFailed,
  type StorageObjectRecord,
} from "../storage/storage.service.ts";
import type { UploadSessionRuntime } from "../storage/upload-session.service.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  finalizeTaskAttempt,
} from "../workflow-task/workflow-task.service.ts";
import {
  findActiveAiModelDispatchPolicyByModelCode,
  type AiModelConfigRecord,
} from "../model-catalog/ai-model-config.store.ts";
import { createProviderAdapterFromModelConfig } from "./provider-adapter.factory.ts";
import { assertCanvasGenerationAssignmentActive } from "./canvas-generation-assignment.guard.ts";
import { fetchProviderArtifactSafely } from "./provider-artifact-url-safety.ts";
import { resolveGenerationProviderFetch } from "./generation-provider-fetch.ts";
import { buildGenerationProviderPayloadRef } from "./generation-provider-request-identity.ts";
import {
  refreshGenerationInputUrls,
  type GenerationInputUrlRefreshDiagnostic,
} from "./generation-input-url-refresh.ts";
import {
  GENERATION_ARTIFACT_FETCH_NOT_READY,
  resolveGenerationArtifactStageUnavailable,
  resolveGenerationSkippedNextAction,
} from "./generation-skipped-coordinator.ts";
import {
  readGenerationProviderRouteReferences,
  resolveGenerationModelConfigForTask,
} from "./generation-model-config-snapshot.ts";
import { ModelError, translateProviderErrorMessage } from "./provider-error-message.ts";
import { attachProviderRawResponse, readProviderRawResponse } from "./provider-response-diagnostics.ts";
import type { ProviderRateLimiter, ProviderRateLimitGrant } from "./provider-rate-limiter.ts";
import {
  appendProviderRequestDiagnostics,
  advanceProviderRequestStage,
  createOrReuseProviderRequest,
  ProviderRequestConflictError,
  refreshPreparedProviderRequestPayload,
  markProviderRequestCanceled,
  markProviderRequestFailed,
  markProviderRequestResultUnknown,
  recordGlobalAiOpcLifecycleStep,
  markProviderRequestSucceeded,
  submitProviderRequest,
} from "./provider-request.service.ts";
import {
  completeUserModelRequestLog,
  createUserModelRequestLog,
} from "./user-model-request-log.service.ts";
import { buildLingdongVideoPayload } from "./lingdong-api.provider-adapter.ts";
import { buildSanBaoVideoPayload } from "./san-bao.provider-adapter.ts";
import {
  markGenerationTaskSnapshotFailed,
  markGenerationTaskSnapshotCanceled,
  markGenerationTaskSnapshotResultUnknown,
  markGenerationTaskSnapshotRunning,
  markGenerationTaskSnapshotSucceeded,
  markGenerationTaskSnapshotQueued,
  markGenerationTaskSnapshotManualReviewRequired,
  serializeGenerationProviderStatus,
  serializeGenerationTaskCenterProviderDiagnostics,
} from "./generation-task-snapshot.service.ts";
import {
  findGenerationArtifactHandoff,
  findOrRecoverGenerationArtifactHandoff,
  recordGenerationArtifactHandoff,
} from "./generation-artifact-handoff.service.ts";

interface SeedanceTaskRow {
  task_id: string;
  task_type?: string;
  task_status?: string;
  workflow_id: string;
  attempt_id: string | null;
  current_attempt_id?: string | null;
  provider_attempt_id?: string | null;
  user_id: string;
  project_id: string | null;
  input_snapshot_json: Record<string, unknown> | string;
  created_by_user_id: string | null;
  provider_request_id: string | null;
  provider_status?: string | null;
  external_submission_started_at?: Date | string | null;
  external_request_id: string | null;
  provider_response_redacted_json: Record<string, unknown> | string | null;
  reservation_id: string | null;
  amount_reserved: number | string | null;
}

interface SeedancePollTimeoutRecoveryRow extends SeedanceTaskRow {
  failure_code: string | null;
  attempt_status: string | null;
  attempt_failure_code: string | null;
  provider_status: string | null;
  reservation_status: string | null;
  amount_total: number | string | null;
  amount_consumed: number | string | null;
  amount_released: number | string | null;
  snapshot_status: string | null;
  result_assets_json: unknown;
  recovered_asset_count: number | string;
}

const SUBMIT_PROVIDER_LIMIT_BYPASS = 1_000_000_000;
const SEEDANCE_VIDEO_TASK_LEASE_MS = 5 * 60_000;
const SEEDANCE_ARTIFACT_TRANSFER_RETRY_LIMIT = 10;
const SEEDANCE_ARTIFACT_STORAGE_FAILURE_CODE = "provider_output_storage_failed";

function seedanceVideoLeaseUntil(now: Date) {
  return new Date(now.getTime() + SEEDANCE_VIDEO_TASK_LEASE_MS);
}

async function renewSeedancePollLease(
  db: SqlDatabase,
  input: { taskId: string; attemptId: string; now: Date },
) {
  const renewed = await queryOne<{ id: string }>(
    db,
    `
      WITH renewed_task AS (
        UPDATE tasks
        SET status = 'running',
            failure_code = NULL,
            locked_by = 'seedance-video-poll-worker',
            locked_until = $3,
            heartbeat_at = $4,
            updated_at = $4
        WHERE id = $1
          AND current_attempt_id = $2
          AND (
            status = 'running'
            OR (
              status = 'result_unknown'
              AND failure_code = 'lease_expired_after_external_start'
            )
          )
          AND EXISTS (
            SELECT 1 FROM task_attempts attempt
            WHERE attempt.id = $2
              AND attempt.task_id = $1
              AND attempt.status IN ('running', 'result_unknown')
          )
        RETURNING id
      )
      UPDATE task_attempts
      SET status = 'running',
          failure_code = NULL,
          locked_by = 'seedance-video-poll-worker',
          locked_until = $3,
          heartbeat_at = $4,
          finished_at = NULL,
          updated_at = $4
      WHERE id = $2
        AND task_id = $1
        AND status IN ('running', 'result_unknown')
        AND EXISTS (SELECT 1 FROM renewed_task)
      RETURNING id
    `,
    [input.taskId, input.attemptId, seedanceVideoLeaseUntil(input.now), input.now],
  );
  return Boolean(renewed);
}

// Drop only this worker's own poll lease, and only while the task is still the
// running attempt we just polled. The artifact stages take their own lease, so
// clearing it here narrows the window rather than leaving the task unguarded.
async function releaseSeedancePollLeaseForArtifactHandoff(
  db: SqlDatabase,
  input: { taskId: string; attemptId: string; now: Date },
) {
  await db.query(
    `
      UPDATE tasks
      SET locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = $3,
          updated_at = $3
      WHERE id = $1
        AND current_attempt_id = $2
        AND status = 'running'
        AND locked_by = 'seedance-video-poll-worker'
    `,
    [input.taskId, input.attemptId, input.now],
  );
}

function readSnapshotTeamMemberId(snapshot: Record<string, unknown>) {
  const candidate = snapshot.teamMemberId ?? snapshot.memberId;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function resolveRateLimitUserId(userId: string, snapshot: Record<string, unknown>) {
  const teamMemberId = readSnapshotTeamMemberId(snapshot);
  return teamMemberId ? `${userId}:member:${teamMemberId}` : userId;
}

interface SeedancePollAdapter {
  poll(input: { externalRequestId: string; redactedPayload?: Record<string, unknown> }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    redactedResponse: Record<string, unknown>;
  }>;
  cancel?(input: { externalRequestId: string }): Promise<{
    status: "canceled" | "not_cancelable" | "unknown";
    redactedResponse: Record<string, unknown>;
  }>;
}

export async function processSeedanceVideoSubmitJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    runtime?: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    rateLimiter?: ProviderRateLimiter;
    userConcurrencyLimit?: number;
    now: Date;
  },
): Promise<Awaited<ReturnType<typeof processSeedanceVideoSubmitJobInternal>>> {
  // Worker隔离检查
  const isolationConfig = resolveWorkerIsolationConfig(input.env);
  const row = await findSeedanceTaskForSubmit(db, input.taskId);

  if (row && isolationConfig.enableIsolation) {
    const snapshot = parseSnapshot(row.input_snapshot_json);
    if (!shouldProcessTask(snapshot, isolationConfig)) {
      return {
        status: "settled",
      };
    }
  }

  const result = await processSeedanceVideoSubmitJobInternal(db, input);
  if (result.status === "failed") {
    await ensureSeedanceFailedResultDiagnostics(db, {
      taskId: input.taskId,
      failureCode: result.failureCode,
      now: input.now,
    });
  }
  return result;
}

async function processSeedanceVideoSubmitJobInternal(
  db: SqlDatabase,
  input: {
    taskId: string;
    runtime?: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    rateLimiter?: ProviderRateLimiter;
    userConcurrencyLimit?: number;
    now: Date;
  },
): Promise<
  | { status: "submitted"; externalRequestId: string | null; attemptId?: string }
  | { status: "already_started"; externalRequestId: string | null; attemptId?: string }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "retryable"; retryAfterMs: number; reason: string }
  | { status: "failed"; failureCode: string }
  | { status: "settled" }
> {
  const row = await findSeedanceTaskForSubmit(db, input.taskId);
  if (!row) {
    return resolveSeedanceSubmitConflict(db, input.taskId);
  }

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const isolationConfig = resolveWorkerIsolationConfig(input.env);
  const modelCode = readString(snapshot.model) || "seedance-i2v-pro";
  let modelConfig: Awaited<ReturnType<typeof resolveGenerationModelConfigForTask>>;
  try {
    modelConfig = await resolveGenerationModelConfigForTask(db, snapshot, modelCode);
  } catch (error) {
    await appendSeedanceSubmitPreparationDiagnostics(db, row.task_id, "model_config_resolve", error, input.now);
    throw error;
  }
  const providerName = modelConfig?.providerName || "volcengine";
  const providerModel = modelConfig?.providerModel || fallbackSeedanceModelConfig(input.env).providerModel;
  let permit: ProviderRateLimitGrant | null;
  try {
    permit = await acquireSeedanceSubmitPermit(input.rateLimiter, {
      providerName,
      modelCode,
      userId: resolveRateLimitUserId(row.created_by_user_id ?? row.user_id, snapshot),
      userConcurrencyLimit: input.userConcurrencyLimit ?? 10,
      now: input.now,
    });
  } catch (error) {
    await appendSeedanceSubmitPreparationDiagnostics(db, row.task_id, "submit_permit_acquire", error, input.now);
    throw error;
  }
  if (permit && !permit.granted) {
    return {
      status: "rate_limited",
      retryAfterMs: permit.retryAfterMs,
      reason: permit.reason,
    };
  }

  let claim: Awaited<ReturnType<typeof claimQueuedTask>>;
  try {
    claim = await claimQueuedTask(db, {
      taskId: row.task_id,
      workerId: buildWorkerIdWithEnvironment("seedance-video-submit-worker", isolationConfig),
      now: input.now,
      leaseMs: SEEDANCE_VIDEO_TASK_LEASE_MS,
    });
  } catch (error) {
    await releaseProviderPermit(permit);
    await appendSeedanceSubmitPreparationDiagnostics(db, row.task_id, "task_claim", error, input.now);
    throw error;
  }
  if (!claim) {
    await releaseProviderPermit(permit);
    return resolveSeedanceSubmitConflict(db, input.taskId);
  }

  const materialRefresh = {
    status: input.runtime ? "pending" : "not_requested",
    diagnostics: [] as GenerationInputUrlRefreshDiagnostic[],
  };
  let submissionStage = "claim_completed";

  try {
    submissionStage = "canvas_assignment_check";
    await assertCanvasGenerationAssignmentActive(db, snapshot);
    submissionStage = "provider_adapter_init";
    const adapter = createProviderAdapterFromModelConfig(
      modelConfig
        ? {
            providerProtocol: modelConfig.providerProtocol,
            providerModel: modelConfig.providerModel,
            mediaType: modelConfig.mediaType,
            providerConfig: modelConfig.providerConfig,
            invocationMode: modelConfig.invocationMode,
          }
        : fallbackSeedanceModelConfig(input.env),
      input.env,
      resolveGenerationProviderFetch(input.fetchImpl, "video", input.env),
    );
    submissionStage = "provider_payload_build";
    const payloadRef = buildGenerationProviderPayloadRef({
      targetType: snapshot.targetType,
      targetId: snapshot.targetId,
      episodeId: snapshot.episodeId,
      taskId: row.task_id,
      mediaType: "video",
    });
    const prompt = readString(snapshot.prompt) ?? "";
    const firstFrameUrl = readString(snapshot.firstFrameUrl);
    const payloadHash = sha256(`${payloadRef}:${prompt}:${firstFrameUrl ?? ""}`);
    const resubmitNonce = readString(snapshot.resubmitNonce);
    const requestKey = `${row.workflow_id}:${row.task_id}${resubmitNonce ? `:resubmit:${resubmitNonce}` : ""}`;
    // Task creation pre-creates this provider_request with the seed
    // `taskId:model:prompt` (no trailing separator). Appending the nonce
    // unconditionally added a trailing ":" for ordinary submissions, so the
    // request_key matched the existing row while request_hash did not, and
    // every submission threw ProviderRequestConflictError before any HTTP send.
    const requestHash = sha256(
      resubmitNonce
        ? `${row.task_id}:${modelCode}:${prompt}:${resubmitNonce}`
        : `${row.task_id}:${modelCode}:${prompt}`,
    );
    const originalRequestBody = {
      prompt,
      motionPrompt: prompt,
      firstFrameUrl,
      parameters: readObject(snapshot.parameters),
      episodeId: readString(snapshot.episodeId),
      targetType: readString(snapshot.targetType) ?? "episode",
      targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId),
      ...(Object.keys(readObject(snapshot.providerPayloadOverride)).length
        ? { providerPayloadOverride: readObject(snapshot.providerPayloadOverride) }
        : {}),
    };
    let requestBody = originalRequestBody;
    if (input.runtime) {
      submissionStage = "material_url_refresh";
      try {
        const refreshed = await refreshGenerationInputUrls(db, originalRequestBody, {
          runtime: input.runtime,
          now: input.now,
          expiresInSeconds: modelSignedUrlExpiresInSeconds(input.env),
          onDiagnostic: (diagnostic) => {
            if (materialRefresh.diagnostics.length < 100) {
              materialRefresh.diagnostics.push(diagnostic);
            }
          },
        }) as typeof originalRequestBody;
        requestBody = refreshed;
        materialRefresh.status = materialRefresh.diagnostics.some(({ status }) => status === "failed")
          ? "degraded"
          : JSON.stringify(refreshed) === JSON.stringify(originalRequestBody)
            ? "unchanged"
            : "refreshed";
      } catch (error) {
        materialRefresh.status = "fallback";
        materialRefresh.diagnostics.push({
          stage: "refresh_inputs_fallback",
          status: "failed",
          error: readLocalErrorDiagnostics(error),
        });
        // The client may already provide a valid signed URL. A storage
        // refresh failure must not block provider submission.
        requestBody = originalRequestBody;
      }
    } else {
      materialRefresh.status = "not_requested";
    }
    // Submit the user's original material URLs directly. Provider-side asset
    // registration is asynchronous and must not replace user-supplied media.
    const requestLogBody = buildSeedanceUserModelRequestLogBody(requestBody, {
      providerName,
      providerProtocol: modelConfig?.providerProtocol,
      providerModel,
      providerConfig: modelConfig?.providerConfig,
    });
    submissionStage = "provider_request_create_or_reuse";
    const providerRequestInput = {
      projectId: row.project_id,
      canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
      workflowId: row.workflow_id,
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerName,
      providerOperation: operationNames.episodeVideoGenerate,
      requestKey,
      requestHash,
      payloadRef,
      payloadHash,
      redactedPayload: requestBody,
      ...readGenerationProviderRouteReferences(snapshot),
      userId: row.user_id,
      now: input.now,
    };
    let preparedProviderRequest: Awaited<ReturnType<typeof createOrReuseProviderRequest>>;
    try {
      preparedProviderRequest = await createOrReuseProviderRequest(db, providerRequestInput);
    } catch (error) {
      if (!(error instanceof ProviderRequestConflictError)) throw error;
      const repaired = await repairSeedanceUnstartedProviderRequestPayload(db, {
        ...providerRequestInput,
        redactedPayload: requestBody,
      });
      if (!repaired) throw error;
      preparedProviderRequest = await createOrReuseProviderRequest(db, providerRequestInput);
    }
    submissionStage = "provider_request_payload_update";
    await refreshPreparedProviderRequestPayload(db, {
      providerRequestId: preparedProviderRequest.request.id,
      redactedPayload: requestBody,
      payloadHash,
      now: input.now,
    });
    if (materialRefresh.status === "fallback" || materialRefresh.status === "degraded") {
      try {
        await appendProviderRequestDiagnostics(db, {
          providerRequestId: preparedProviderRequest.request.id,
          diagnostics: buildMaterialRefreshDiagnostics(materialRefresh),
          now: input.now,
        });
      } catch (diagnosticError) {
        materialRefresh.diagnostics.push({
          stage: "diagnostics_persist",
          status: "failed",
          error: readLocalErrorDiagnostics(diagnosticError),
        });
      }
    }
    submissionStage = "user_model_request_log_create";
    try {
      await createUserModelRequestLog(db, {
        providerRequestId: preparedProviderRequest.request.id,
        projectId: row.project_id,
        canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
        workflowId: row.workflow_id,
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        userId: row.created_by_user_id,
        providerName,
        providerOperation: operationNames.episodeVideoGenerate,
        modelId: modelCode,
        providerModel,
        requestKey,
        requestHash,
        payloadHash,
        payloadSummary: null,
        requestFormat: requestLogBody.requestFormat,
        requestBody: requestLogBody.requestBody,
        requestText: requestLogBody.requestText,
        now: input.now,
      });
    } catch (error) {
      // Request auditing is auxiliary; it must not prevent the provider HTTP call.
      try {
        await appendProviderRequestDiagnostics(db, {
          providerRequestId: preparedProviderRequest.request.id,
          diagnostics: {
            localStage: "user_model_request_log_create",
            localError: readLocalErrorDiagnostics(error),
            diagnosticNote: "提交前审计日志写入失败，已继续提交供应商请求。",
          },
          now: input.now,
        });
      } catch {
        // Preserve the original submission path even if diagnostics cannot be persisted.
      }
    }
    submissionStage = "provider_submit";
    const submitted = await submitProviderRequest(db, {
      projectId: row.project_id,
      canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
      workflowId: row.workflow_id,
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerName,
      providerOperation: operationNames.episodeVideoGenerate,
      requestKey,
      requestHash,
      payloadRef,
      payloadHash,
      redactedPayload: requestBody,
      ...readGenerationProviderRouteReferences(snapshot),
      userId: row.user_id,
      now: input.now,
      adapter,
    });
    const finalRequestBody = readSubmittedRedactedRequest(submitted) ?? requestLogBody.requestBody;
    submissionStage = "user_model_request_log_update";
    await createUserModelRequestLog(db, {
      providerRequestId: submitted.request.id,
      projectId: row.project_id,
      canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
      workflowId: row.workflow_id,
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      userId: row.created_by_user_id,
      providerName,
      providerOperation: operationNames.episodeVideoGenerate,
      modelId: modelCode,
      providerModel,
      requestKey,
      requestHash,
      payloadHash,
      payloadSummary: null,
      requestFormat: requestLogBody.requestFormat,
      requestBody: finalRequestBody,
      requestText: requestLogBody.requestText,
      now: input.now,
    });

    if (submitted.request.externalRequestId) {
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId: submitted.request.id,
        progressStage: submitted.request.status === "running"
          ? "provider_rendering"
          : "provider_accepted",
        providerStatus: summarizeProviderResponse(submitted.request.redactedResponse)
          ?? {
            providerStatus: submitted.request.status,
            externalRequestId: submitted.request.externalRequestId,
          },
        now: input.now,
      });
      await recordGlobalAiOpcLifecycleStep(db, {
        providerRequestId: submitted.request.id,
        stage: "queued_for_poll",
        details: { externalRequestId: submitted.request.externalRequestId },
        now: input.now,
      });
    }

    if (!submitted.request.externalRequestId) {
      if (submitted.kind === "already_started") {
        const requeued = await requeueSeedanceTaskBeforeProviderSubmission(db, {
          taskId: row.task_id,
          attemptId: claim.attempt.id,
          providerRequestId: submitted.request.id,
          failureCode: "provider_submission_not_started",
          now: input.now,
        });
        if (requeued) {
          return {
            status: "retryable",
            retryAfterMs: 1000,
            reason: "provider_submission_not_started",
          };
        }
      }
      const failureCode = "provider_submission_missing_task_id";
      const errorMessage = "模型服务未返回可查询的任务 ID。";
      await markProviderRequestFailed(db, {
        providerRequestId: submitted.request.id,
        failureCode,
        redactedResponse: {
          ...(submitted.request.redactedResponse ?? {}),
          failureCode,
          displayMessage: errorMessage,
        },
        now: input.now,
      });
      throw Object.assign(new Error(failureCode), { failureCode });
    }

    return {
      status: submitted.kind === "already_started" ? "already_started" : "submitted",
      externalRequestId: submitted.request.externalRequestId,
      attemptId: claim.attempt.id,
    };
  } catch (error) {
    const payloadRef = buildGenerationProviderPayloadRef({
      targetType: snapshot.targetType,
      targetId: snapshot.targetId,
      episodeId: snapshot.episodeId,
      taskId: row.task_id,
      mediaType: "video",
    });
    const prompt = readString(snapshot.prompt) ?? "";
    const firstFrameUrl = readString(snapshot.firstFrameUrl);
    const payloadHash = sha256(`${payloadRef}:${prompt}:${firstFrameUrl ?? ""}`);
    // Mirror the submit path's derivation exactly (including the resubmit
    // nonce); otherwise a resubmitted task records a request_key/request_hash
    // pair that matches no provider_requests row.
    const resubmitNonce = readString(snapshot.resubmitNonce);
    const requestKey = `${row.workflow_id}:${row.task_id}${resubmitNonce ? `:resubmit:${resubmitNonce}` : ""}`;
    const requestHash = sha256(
      resubmitNonce
        ? `${row.task_id}:${modelCode}:${prompt}:${resubmitNonce}`
        : `${row.task_id}:${modelCode}:${prompt}`,
    );
    const requestBody = {
      prompt,
      motionPrompt: prompt,
      firstFrameUrl,
      parameters: readObject(snapshot.parameters),
      episodeId: readString(snapshot.episodeId),
      targetType: readString(snapshot.targetType) ?? "episode",
      targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId),
    };
    let providerRequest;
    let submissionState = null;
    let diagnosticsLookupError: Record<string, unknown> | null = null;
    try {
      providerRequest = await findLatestProviderRequestForTask(
        db,
        row.task_id,
        claim.attempt.id,
      ) ?? await findAnyUnstartedProviderRequestForTask(db, row.task_id);
      submissionState = providerRequest
        ? await readSeedanceSubmissionState(db, row.task_id, claim.attempt.id, providerRequest.provider_request_id)
        : null;
    } catch (lookupError) {
      diagnosticsLookupError = readLocalErrorDiagnostics(lookupError);
      providerRequest = await findAnyUnstartedProviderRequestForTask(db, row.task_id).catch(() => undefined);
    }
    const submissionWasAccepted = Boolean(providerRequest?.external_request_id) &&
      ["accepted", "running", "succeeded"].includes(providerRequest?.status ?? "");
    if (submissionWasAccepted) {
      await keepSeedanceTaskWaitingForProviderResult(db, {
        taskId: row.task_id,
        now: input.now,
      });
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId: providerRequest?.provider_request_id ?? null,
        progressStage: providerRequest?.status === "succeeded"
          ? "saving_asset"
          : providerRequest?.status === "running"
            ? "provider_rendering"
            : "provider_accepted",
        providerStatus: summarizeProviderResponse(
          parseProviderResponse(providerRequest?.provider_response_redacted_json),
        ) ?? { providerStatus: providerRequest?.status },
        now: input.now,
      });
      return {
        status: "already_started",
        externalRequestId: providerRequest?.external_request_id ?? null,
        attemptId: claim.attempt.id,
      };
    }
    const submissionWasNotStarted = providerRequest
      && !providerRequest.external_submission_started_at
      && !providerRequest.external_request_id;

    const submissionFailureCode = readErrorFailureCode(error) ?? (
      submissionWasNotStarted
        ? "provider_submission_prepare_failed"
        : "provider_submission_failed"
    );
    const submissionModelError = ModelError.fromUnknown(error, {
      failureCode: submissionFailureCode,
      mediaType: "video",
      phase: "submit",
    });
    let preSubmissionRetryCount = 0;
    if (providerRequest) {
      try {
        preSubmissionRetryCount = await countPreSubmissionRetries(db, row.task_id);
      } catch (retryLookupError) {
        diagnosticsLookupError ??= readLocalErrorDiagnostics(retryLookupError);
      }
    }
    const shouldRetryBeforeExternalStart = Boolean(submissionWasNotStarted && providerRequest?.provider_request_id)
      && !hasExternalProviderSubmission(providerRequest)
      && preSubmissionRetryCount < PRE_SUBMISSION_RETRY_LIMIT
      && submissionModelError.retryable
      && (
        submissionModelError.httpStatus === null
        || submissionFailureCode === "provider_submission_failed"
        || submissionFailureCode === "provider_submission_prepare_failed"
      );
    if (shouldRetryBeforeExternalStart) {
      if (providerRequest?.provider_request_id) {
        try {
          await appendProviderRequestDiagnostics(db, {
            providerRequestId: providerRequest.provider_request_id,
            diagnostics: {
              ...buildMaterialRefreshDiagnostics(materialRefresh),
              localStage: submissionStage,
              localError: readLocalErrorDiagnostics(error),
              modelError: {
                code: submissionModelError.code,
                failureCode: submissionModelError.failureCode,
                httpStatus: submissionModelError.httpStatus,
                retryable: submissionModelError.retryable,
              },
              localState: submissionState ?? { lookup: "missing" },
              ...(diagnosticsLookupError ? { diagnosticsLookupError } : {}),
              preSubmissionRetryCount,
              diagnosticNote: "供应商提交尚未开始，任务将进行有限次数的提交前重试。",
            },
            now: input.now,
          });
        } catch (diagnosticError) {
          materialRefresh.diagnostics.push({
            stage: "diagnostics_persist",
            status: "failed",
            error: readLocalErrorDiagnostics(diagnosticError),
          });
        }
      }
      if (providerRequest?.provider_request_id) {
        const requeued = await requeueSeedanceTaskBeforeProviderSubmission(db, {
          taskId: row.task_id,
          attemptId: claim.attempt.id,
          providerRequestId: providerRequest.provider_request_id,
          failureCode: submissionFailureCode,
          now: input.now,
        });
        if (requeued) {
          return {
            status: "retryable",
            retryAfterMs: 1000,
            reason: "provider_submission_prepare_retry",
          };
        }
      }
    }
    const errorMessage = translateProviderErrorMessage(error, {
      failureCode: submissionFailureCode,
      mediaType: "video",
      phase: "submit",
    });
    const submissionIsAmbiguous = providerRequest?.status === "result_unknown";
    // Built outside the provider-request gate below. When no provider_requests
    // row can be located, every write inside that gate is skipped, and the only
    // record left was the generic snapshot failure code with no context — the
    // "找不到原因" case. The snapshot failure now carries these diagnostics too.
    const submissionDiagnostics = {
      ...(readErrorProviderDiagnostics(error) ?? {}),
      ...buildMaterialRefreshDiagnostics(materialRefresh),
      localStage: submissionStage,
      // Always persist the underlying error. Previously localError/modelError
      // were recorded only when submissionWasNotStarted was true, which
      // silently dropped the real cause on the generic provider_submission_failed
      // path (error carries no failureCode and the request could not be
      // classified as unstarted). That left model records with a generic code
      // and no diagnosable context ("找不到原因"). Capturing them
      // unconditionally surfaces the true pre-submission failure.
      localError: readLocalErrorDiagnostics(error),
      modelError: {
        code: submissionModelError.code,
        failureCode: submissionModelError.failureCode,
        httpStatus: submissionModelError.httpStatus,
        retryable: submissionModelError.retryable,
      },
      submissionWasNotStarted: Boolean(submissionWasNotStarted),
      localState: submissionState ?? { lookup: "missing" },
      ...(diagnosticsLookupError ? { diagnosticsLookupError } : {}),
      preSubmissionRetryCount,
      preSubmissionRetryLimit: PRE_SUBMISSION_RETRY_LIMIT,
      providerRequestLookup: providerRequest?.provider_request_id ? "found" : "missing",
    };
    if (providerRequest?.provider_request_id) {
      const preparedRequestLog = buildSeedanceUserModelRequestLogBody(requestBody, {
        providerName,
        providerProtocol: modelConfig?.providerProtocol,
        providerModel,
        providerConfig: modelConfig?.providerConfig,
      });
      const logRequestBody = readProviderRedactedRequest(error) ??
        readProviderResponseRedactedRequest(providerRequest.provider_response_redacted_json) ??
        preparedRequestLog.requestBody;
      if (!submissionIsAmbiguous) {
        await markProviderRequestFailed(db, {
          providerRequestId: providerRequest.provider_request_id,
          failureCode: submissionFailureCode,
          redactedResponse: {
            ...submissionDiagnostics,
            failureCode: submissionFailureCode,
            errorMessage,
            phase: "submit",
            redactedRequest: logRequestBody,
          },
          now: input.now,
        });
      }
      await createUserModelRequestLog(db, {
        providerRequestId: providerRequest.provider_request_id,
        projectId: row.project_id,
        canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
        workflowId: row.workflow_id,
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        userId: row.created_by_user_id,
        providerName,
        providerOperation: operationNames.episodeVideoGenerate,
        modelId: modelCode,
        providerModel,
        requestKey,
        requestHash,
        payloadHash,
        payloadSummary: null,
        requestFormat: preparedRequestLog.requestFormat ?? "generation_task",
        requestBody: logRequestBody,
        requestText: preparedRequestLog.requestText,
        now: input.now,
      });
      if (!submissionIsAmbiguous) {
        await completeUserModelRequestLog(db, {
          providerRequestId: providerRequest.provider_request_id,
          status: "failed",
          responseText: buildSeedanceFailureResponseText({
            failureCode: submissionFailureCode,
            errorMessage,
            diagnostics: submissionDiagnostics,
          }),
          responseUsage: null,
          finishReasons: [],
          failureCode: submissionFailureCode,
          now: input.now,
        });
      }
    }
    if (submissionIsAmbiguous) {
      const failureCode = providerRequest?.failure_code ?? "provider_submission_ambiguous";
      await keepSeedanceTaskWaitingForExternalId(db, {
        taskId: row.task_id,
        now: input.now,
      });
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId: providerRequest?.provider_request_id ?? null,
        progressStage: "provider_result_unknown",
        providerStatus: {
          errorMessage,
          failureCode,
        },
        now: input.now,
      });
      return {
        status: "already_started",
        externalRequestId: providerRequest?.external_request_id ?? null,
        attemptId: claim.attempt.id,
      };
    }
    await failSeedanceTask(db, {
      row: { ...row, attempt_id: claim.attempt.id },
      failureCode: submissionFailureCode,
      providerRequestId: providerRequest?.provider_request_id ?? null,
      redactedResponse: buildSeedanceBillingMetadata({ ...row, attempt_id: claim.attempt.id }, snapshot, {
        billingEvent: "released",
        outcome: "released",
        provider: "model-gateway",
        providerRequestId: providerRequest?.provider_request_id ?? null,
        failureCode: submissionFailureCode,
        errorMessage,
        localStage: submissionStage,
        ...buildMaterialRefreshDiagnostics(materialRefresh),
        settledAt: input.now,
      }),
      now: input.now,
    });
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerRequestId: providerRequest?.provider_request_id ?? null,
      providerStatus: {
        errorMessage,
        failureCode: providerRequest?.failure_code ?? submissionFailureCode,
      },
      failure: {
        failureCode: submissionFailureCode,
        providerRequestId: providerRequest?.provider_request_id ?? null,
        providerFailureCode: providerRequest?.failure_code ?? null,
        errorMessage,
        displayMessage: errorMessage,
        ...submissionDiagnostics,
      },
      creditSummary: {
        released: resolveGenerationBillingAmount(row.amount_reserved, snapshot),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    return { status: "failed", failureCode: submissionFailureCode };
  } finally {
    await releaseProviderPermit(permit);
  }
}

async function resolveSeedanceSubmitConflict(
  db: SqlDatabase,
  taskId: string,
): Promise<
  | { status: "already_started"; externalRequestId: string | null; attemptId?: string }
  | { status: "retryable"; retryAfterMs: number; reason: string }
  | { status: "settled" }
> {
  const row = await queryOne<{
    task_status: string;
    task_type: string;
    provider_executor: string | null;
    attempt_id: string | null;
    external_request_id: string | null;
    external_submission_started_at: Date | string | null;
  }>(
    db,
    `
      SELECT
        task.status AS task_status,
        task.task_type,
        task.input_snapshot_json->>'providerExecutor' AS provider_executor,
        task.current_attempt_id AS attempt_id,
        provider.external_request_id,
        provider.external_submission_started_at
      FROM tasks task
      LEFT JOIN LATERAL (
        SELECT request.external_request_id, request.external_submission_started_at
        FROM provider_requests request
        WHERE request.task_id = task.id
          AND task.current_attempt_id IS NOT NULL
          AND (
            request.attempt_id = task.current_attempt_id
            OR (request.attempt_id IS NULL AND task.attempt_count = 1)
          )
        ORDER BY request.updated_at DESC, request.id DESC
        LIMIT 1
      ) provider ON true
      WHERE task.id = $1
      LIMIT 1
    `,
    [taskId],
  );

  if (!row || row.task_type !== "episode_generate_video" || !isVideoProviderExecutor(row.provider_executor)) {
    return { status: "settled" };
  }
  if (row.task_status === "queued") {
    return { status: "retryable", retryAfterMs: 1000, reason: "task_not_claimable" };
  }
  if (row.task_status === "running" || row.task_status === "result_unknown") {
    if (row.external_request_id) {
      return {
        status: "already_started",
        externalRequestId: row.external_request_id,
        ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
      };
    }
    if (row.external_submission_started_at) {
      return {
        status: "already_started",
        externalRequestId: null,
        ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
      };
    }
    return { status: "retryable", retryAfterMs: 1000, reason: "provider_submission_not_started" };
  }
  return { status: "settled" };
}

async function findLatestProviderRequestForTask(
  db: SqlDatabase,
  taskId: string,
  attemptId: string,
) {
  return queryOne<{
    provider_request_id: string;
    status: string;
    external_submission_started_at: Date | string | null;
    external_request_id: string | null;
    failure_code: string | null;
    provider_response_redacted_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT
        request.id AS provider_request_id,
        request.status,
        request.external_submission_started_at,
        request.external_request_id,
        request.failure_code,
        request.response_redacted_json AS provider_response_redacted_json
      FROM provider_requests request
      JOIN tasks task ON task.id = request.task_id
      WHERE request.task_id = $1
        AND task.current_attempt_id = $2
        AND (
          request.attempt_id = $2
          OR (
            request.attempt_id IS NULL
            AND request.external_submission_started_at IS NULL
            AND request.external_request_id IS NULL
          )
        )
      ORDER BY request.updated_at DESC, request.id DESC
      LIMIT 1
    `,
    [taskId, attemptId],
  );
}

async function findAnyUnstartedProviderRequestForTask(
  db: SqlDatabase,
  taskId: string,
) {
  return queryOne<{
    provider_request_id: string;
    status: string;
    external_submission_started_at: Date | string | null;
    external_request_id: string | null;
    failure_code: string | null;
    provider_response_redacted_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT
        request.id AS provider_request_id,
        request.status,
        request.external_submission_started_at,
        request.external_request_id,
        request.failure_code,
        request.response_redacted_json AS provider_response_redacted_json
      FROM provider_requests request
      WHERE request.task_id = $1
        AND request.external_submission_started_at IS NULL
        AND request.external_request_id IS NULL
      ORDER BY request.updated_at DESC, request.id DESC
      LIMIT 1
    `,
    [taskId],
  );
}

async function repairSeedanceUnstartedProviderRequestPayload(
  db: SqlDatabase,
  input: {
    taskId: string;
    providerName: string;
    providerOperation: string;
    requestKey: string;
    requestHash: string;
    payloadRef: string;
    payloadHash: string;
    redactedPayload: Record<string, unknown>;
    attemptId: string;
    now: Date;
  },
) {
  const repaired = await queryOne<{ id: string }>(
    db,
    `
      UPDATE provider_requests
      SET attempt_id = COALESCE(attempt_id, $2),
          payload_hash = $3,
          payload_redacted_json = $4::jsonb,
          request_hash = $9,
          payload_ref = $10,
          updated_at = $5
      WHERE task_id = $1
        AND provider_name = $6
        AND provider_operation = $7
        AND request_key = $8
        AND status = 'created'
        AND external_submission_started_at IS NULL
        AND external_request_id IS NULL
      RETURNING id
    `,
    [
      input.taskId,
      input.attemptId,
      input.payloadHash,
      JSON.stringify(input.redactedPayload),
      input.now,
      input.providerName,
      input.providerOperation,
      input.requestKey,
      input.requestHash,
      input.payloadRef,
    ],
  );
  return Boolean(repaired?.id);
}

function hasExternalProviderSubmission(
  providerRequest: {
    external_submission_started_at: Date | string | null;
    external_request_id: string | null;
  } | null | undefined,
) {
  return Boolean(providerRequest?.external_submission_started_at || providerRequest?.external_request_id);
}

async function readSeedanceSubmissionState(
  db: SqlDatabase,
  taskId: string,
  attemptId: string,
  providerRequestId: string,
) {
  return queryOne<{
    task_status: string;
    task_current_attempt_id: string | null;
    attempt_status: string | null;
    provider_status: string | null;
    provider_attempt_id: string | null;
    provider_external_submission_started_at: Date | string | null;
    provider_external_request_id: string | null;
  }>(
    db,
    `
      SELECT
        task.status AS task_status,
        task.current_attempt_id AS task_current_attempt_id,
        attempt.status AS attempt_status,
        request.status AS provider_status,
        request.attempt_id AS provider_attempt_id,
        request.external_submission_started_at AS provider_external_submission_started_at,
        request.external_request_id AS provider_external_request_id
      FROM tasks task
      LEFT JOIN task_attempts attempt ON attempt.id = $2
      LEFT JOIN provider_requests request ON request.id = $3
      WHERE task.id = $1
    `,
    [taskId, attemptId, providerRequestId],
  );
}

async function keepSeedanceTaskWaitingForProviderResult(
  db: SqlDatabase,
  input: { taskId: string; now: Date },
) {
  await db.query(
    `
      UPDATE tasks
      SET locked_until = GREATEST(
            COALESCE((input_snapshot_json->>'timeoutAt')::timestamptz, $2::timestamptz + interval '3 hours'),
            $2::timestamptz
          ),
          heartbeat_at = $2::timestamptz,
          updated_at = $2::timestamptz
      WHERE id = $1
        AND status = 'running'
    `,
    [input.taskId, input.now],
  );
}

async function keepSeedanceTaskWaitingForExternalId(
  db: SqlDatabase,
  input: { taskId: string; now: Date },
) {
  await db.query(
    `
      UPDATE tasks
      SET locked_until = $2::timestamptz + interval '10 minutes',
          heartbeat_at = $2::timestamptz,
          updated_at = $2::timestamptz
      WHERE id = $1
        AND status = 'running'
    `,
    [input.taskId, input.now],
  );
}

// A current attempt can be observed before its provider request is bound. In
// that window there is no external side effect, so the attempt is safe to
// reopen instead of reporting a provider failure.
async function requeueSeedanceTaskBeforeProviderSubmission(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId: string;
    providerRequestId: string;
    failureCode?: string | null;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    // Requeueing has to clear failure_code so the row can be re-submitted, but
    // the cleared value is the only classified cause recorded for this cycle.
    // Previously it was simply NULLed, so after the retry budget was spent the
    // last (generic) code was all that remained and the first real cause was
    // unrecoverable. Fold it into response_redacted_json first.
    const providerRequest = await queryOne<{ id: string }>(
      db,
      `
        UPDATE provider_requests
        SET status = 'created',
            attempt_id = NULL,
            external_submission_started_at = NULL,
            external_request_id = NULL,
            response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb)
              || jsonb_build_object(
                'preSubmissionRetryHistory',
                COALESCE(response_redacted_json->'preSubmissionRetryHistory', '[]'::jsonb)
                  || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                    'failureCode', COALESCE($5::text, failure_code),
                    'previousStatus', status,
                    'requeuedAttemptId', $3::text,
                    'requeuedAt', $4::timestamptz
                  )))
              ),
            failure_code = NULL,
            next_poll_at = NULL,
            updated_at = $4
        WHERE id = $1
          AND task_id = $2
          AND EXISTS (
            SELECT 1 FROM task_attempts current_attempt
            WHERE current_attempt.id = $3
              AND current_attempt.task_id = $2
              AND current_attempt.status IN ('created', 'running', 'result_unknown')
          )
          AND external_submission_started_at IS NULL
          AND external_request_id IS NULL
        RETURNING id
      `,
      [
        input.providerRequestId,
        input.taskId,
        input.attemptId,
        input.now,
        input.failureCode ?? null,
      ],
    );
    const attempt = await queryOne<{ id: string }>(
      db,
      `
        UPDATE task_attempts
        SET status = 'canceled',
            failure_code = 'provider_submission_not_started',
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            finished_at = $3,
            updated_at = $3
        WHERE id = $2
          AND task_id = $1
          AND status IN ('created', 'running', 'result_unknown')
        RETURNING id
      `,
      [input.taskId, input.attemptId, input.now],
    );
    const task = await queryOne<{ id: string }>(
      db,
      `
        UPDATE tasks
        SET status = 'queued',
            failure_code = NULL,
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            current_attempt_id = NULL,
            max_attempts = GREATEST(max_attempts, attempt_count + 1),
            updated_at = $3
        WHERE id = $1
          AND current_attempt_id = $2
          AND status IN ('running', 'result_unknown')
          AND EXISTS (
            SELECT 1 FROM task_attempts current_attempt
            WHERE current_attempt.id = $2
              AND current_attempt.task_id = $1
              AND current_attempt.status = 'canceled'
              AND current_attempt.failure_code = 'provider_submission_not_started'
          )
        RETURNING id
      `,
      [input.taskId, input.attemptId, input.now],
    );
    if (!providerRequest || !attempt || !task) {
      await db.query("ROLLBACK");
      return false;
    }
    await markGenerationTaskSnapshotQueued(db, {
      taskId: input.taskId,
      progressStage: "provider_submission_retry",
      progressPercent: 10,
      now: input.now,
    });
    await db.query("COMMIT");
    return true;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

const PRE_SUBMISSION_RETRY_LIMIT = 3;

async function countPreSubmissionRetries(db: SqlDatabase, taskId: string) {
  const result = await db.query<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM task_attempts
      WHERE task_id = $1
        AND failure_code = 'provider_submission_not_started'
    `,
    [taskId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function failSeedanceVideoTaskBeforeProviderSubmission(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId: string;
    staleBefore: Date;
    failureCode: string;
    now: Date;
  },
): Promise<boolean> {
  const row = await queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        w.created_by_user_id AS user_id,
        t.project_id,
        t.input_snapshot_json,
        w.created_by_user_id,
        pr.id AS provider_request_id,
        pr.external_request_id,
        pr.response_redacted_json AS provider_response_redacted_json,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      JOIN workflows w ON w.id = t.workflow_id
      LEFT JOIN provider_requests pr
        ON pr.task_id = t.id
       AND (
         pr.attempt_id = t.current_attempt_id
         OR (
           pr.attempt_id IS NULL
           AND pr.external_submission_started_at IS NULL
           AND pr.external_request_id IS NULL
         )
       )
      LEFT JOIN generation_task_credit_reservations r ON r.task_id = t.id
      WHERE t.id = $1
        AND t.status = 'running'
        AND t.current_attempt_id IS NOT NULL
        AND t.current_attempt_id = $2
        AND t.updated_at < $3
        AND t.task_type = 'episode_generate_video'
        AND NOT EXISTS (
          SELECT 1 FROM provider_requests started
          WHERE started.task_id = t.id
            AND (
              started.attempt_id = t.current_attempt_id
              OR (
                started.attempt_id IS NULL
                AND started.external_submission_started_at IS NULL
                AND started.external_request_id IS NULL
              )
            )
            AND started.external_submission_started_at IS NOT NULL
        )
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [input.taskId, input.expectedAttemptId, input.staleBefore],
  );
  if (!row?.attempt_id) return false;

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const errorMessage = "模型请求未成功发送，任务已停止并返还积分。";
  const submissionDiagnostics = {
    localStage: "stale_before_provider_submission",
    localState: {
      taskStatus: "running",
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      externalSubmissionStartedAt: null,
      externalRequestId: row.external_request_id,
      staleBefore: input.staleBefore.toISOString(),
    },
    failureCode: input.failureCode,
    errorMessage,
    phase: "submit",
  };
  if (row.provider_request_id) {
    await markProviderRequestFailed(db, {
      providerRequestId: row.provider_request_id,
      failureCode: input.failureCode,
      redactedResponse: submissionDiagnostics,
      now: input.now,
    });
    await completeUserModelRequestLog(db, {
      providerRequestId: row.provider_request_id,
      status: "failed",
      responseText: JSON.stringify(submissionDiagnostics, null, 2),
      responseUsage: null,
      finishReasons: [],
      failureCode: input.failureCode,
      now: input.now,
    });
  }
  const failed = await failSeedanceTask(db, {
    row,
    failureCode: input.failureCode,
    providerRequestId: row.provider_request_id,
    redactedResponse: buildSeedanceBillingMetadata(row, snapshot, {
      billingEvent: "released",
      outcome: "released",
      provider: "model-gateway",
      providerRequestId: row.provider_request_id,
      failureCode: input.failureCode,
      errorMessage,
      settledAt: input.now,
    }),
    now: input.now,
  });
  if (!failed) {
    return false;
  }
  await markGenerationTaskSnapshotFailed(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    providerStatus: { failureCode: input.failureCode, errorMessage },
    failure: { failureCode: input.failureCode, errorMessage, displayMessage: errorMessage },
    creditSummary: {
      released: resolveGenerationBillingAmount(row.amount_reserved, snapshot),
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });
  return true;
}

export async function processSeedanceVideoPollJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId?: string | null;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    rateLimiter?: ProviderRateLimiter;
    now: Date;
  },
): Promise<
  | { status: "waiting" }
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "skipped"; nextAction?: "submit" | "poll" | "finalize" | "stop" }
> {
  const row = await findSeedanceTaskForPoll(
    db,
    input.taskId,
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"),
    input.expectedAttemptId ?? null,
  );
  if (!row?.provider_request_id || !row.external_request_id || !row.attempt_id) {
    return {
      status: "skipped",
      nextAction: await resolveGenerationSkippedNextAction(db, { taskId: input.taskId }),
    };
  }

  if (!await renewSeedancePollLease(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    now: input.now,
  })) {
    return {
      status: "skipped",
      nextAction: await resolveGenerationSkippedNextAction(db, { taskId: input.taskId }),
    };
  }

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const modelCode = readString(snapshot.model) || "seedance-i2v-pro";
  const modelConfig = await resolveGenerationModelConfigForTask(db, snapshot, modelCode);
  const dispatchPolicy = await findActiveAiModelDispatchPolicyByModelCode(db, modelCode);
  const permit = await acquireSeedancePollPermit(input.rateLimiter, {
    providerName: modelConfig?.providerName || "volcengine",
    modelCode,
    userId: resolveRateLimitUserId(row.created_by_user_id ?? row.user_id, snapshot),
    providerRpmLimit: dispatchPolicy?.providerRpmLimit ?? 60,
    providerConcurrentLimit: dispatchPolicy?.providerConcurrentLimit ?? 5,
    pollingConcurrencyLimit: dispatchPolicy?.pollingConcurrencyLimit ?? 40,
    now: input.now,
  });
  if (permit && !permit.granted) {
    return {
      status: "rate_limited",
      retryAfterMs: permit.retryAfterMs,
      reason: permit.reason,
    };
  }

  const adapter = createProviderAdapterFromModelConfig(
    modelConfig
      ? {
          providerProtocol: modelConfig.providerProtocol,
          providerModel: modelConfig.providerModel,
          mediaType: modelConfig.mediaType,
          providerConfig: modelConfig.providerConfig,
          invocationMode: modelConfig.invocationMode,
        }
      : fallbackSeedanceModelConfig(input.env),
    input.env,
    resolveGenerationProviderFetch(input.fetchImpl, "video", input.env),
  ) as unknown as SeedancePollAdapter;
  try {
    let poll: Awaited<ReturnType<SeedancePollAdapter["poll"]>>;
    try {
      poll = await adapter.poll({
        externalRequestId: row.external_request_id,
        redactedPayload: buildProviderPollPayload(snapshot, row.provider_response_redacted_json),
      });
    } catch (error) {
      if (modelConfig?.providerProtocol !== "san_bao" || !(error instanceof ModelError)) throw error;
      poll = {
        status: "failed",
        redactedResponse: error.toRedactedProviderRecord(),
      };
    }
    await recordGlobalAiOpcLifecycleStep(db, {
      providerRequestId: row.provider_request_id,
      stage: "poll_response_received",
      details: {
        externalRequestId: row.external_request_id,
        providerStatus: poll.status,
        providerResponse: poll.redactedResponse,
      },
      now: input.now,
    });

    if (poll.status === "accepted" || poll.status === "running") {
      if (poll.status === "running") {
        await advanceProviderRequestStage(db, {
          providerRequestId: row.provider_request_id,
          externalRequestId: row.external_request_id,
          redactedResponse: poll.redactedResponse,
          now: input.now,
        });
      }
      await appendProviderRequestDiagnostics(db, {
        providerRequestId: row.provider_request_id,
        diagnostics: {
          ...poll.redactedResponse,
          externalRequestId: row.external_request_id,
          pollStatus: poll.status,
        },
        now: input.now,
      });
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        progressStage: poll.status === "accepted" ? "provider_accepted" : "provider_rendering",
        providerStatus: poll.redactedResponse,
        now: input.now,
      });
      return { status: "waiting" };
    }

    if (poll.status === "failed") {
      const failureCode = readString(poll.redactedResponse.failureCode)
        || "provider_failed";
      const providerErrorMessage = translateProviderErrorMessage(poll.redactedResponse, {
        failureCode,
        mediaType: "video",
        phase: "poll",
      });
      await markProviderRequestFailed(db, {
        providerRequestId: row.provider_request_id,
        failureCode,
        redactedResponse: poll.redactedResponse,
        now: input.now,
      });
      await completeUserModelRequestLog(db, {
        providerRequestId: row.provider_request_id,
        status: "failed",
        responseText: buildSeedanceFailureResponseText({
          failureCode,
          errorMessage: providerErrorMessage,
          providerResponse: poll.redactedResponse,
        }),
        responseUsage: null,
        finishReasons: [],
        failureCode,
        now: input.now,
      });
      await failSeedanceTask(db, {
        row,
        failureCode,
        providerRequestId: row.provider_request_id,
        redactedResponse: buildSeedanceBillingMetadata(row, snapshot, {
          billingEvent: "released",
          outcome: "released",
          provider: "model-gateway",
          providerRequestId: row.provider_request_id,
          externalRequestId: row.external_request_id,
          failureCode,
          errorMessage: providerErrorMessage,
          providerResponse: poll.redactedResponse,
          settledAt: input.now,
        }),
        now: input.now,
      });
      await markGenerationTaskSnapshotFailed(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        providerStatus: poll.redactedResponse,
        failure: {
          failureCode,
          providerStatus: readString(poll.redactedResponse.providerStatus),
          providerErrorCode: readString(poll.redactedResponse.providerErrorCode),
          providerMessage: providerErrorMessage,
          displayMessage: providerErrorMessage,
        },
        creditSummary: {
          released: resolveGenerationBillingAmount(row.amount_reserved, snapshot),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      return { status: "failed", failureCode };
    }

    if (!poll.videoUrl) {
      await appendProviderRequestDiagnostics(db, {
        providerRequestId: row.provider_request_id,
        diagnostics: {
          ...poll.redactedResponse,
          externalRequestId: row.external_request_id,
          pollStatus: poll.status,
          artifactStatus: "missing",
        },
        now: input.now,
      });
      return { status: "waiting" };
    }

    const auditVideoUrl = redactProviderArtifactAuditUrl(poll.videoUrl);
    const artifactUrlRequiresRefresh = auditVideoUrl !== poll.videoUrl;
    const providerAuditResponse = {
      ...poll.redactedResponse,
      videoUrl: auditVideoUrl,
      ...(artifactUrlRequiresRefresh ? { artifactUrlRequiresRefresh: true } : {}),
    };
    await markProviderRequestSucceeded(db, {
      providerRequestId: row.provider_request_id,
      externalRequestId: row.external_request_id,
      redactedResponse: artifactUrlRequiresRefresh
        ? providerAuditResponse
        : attachProviderRawResponse(providerAuditResponse, readProviderRawResponse(poll.redactedResponse)),
      now: input.now,
    });
    await completeUserModelRequestLog(db, {
      providerRequestId: row.provider_request_id,
      status: "succeeded",
      responseText: buildSeedanceSuccessResponseText({
        externalRequestId: row.external_request_id,
        videoUrl: auditVideoUrl,
        providerResponse: poll.redactedResponse,
      }),
      responseUsage: null,
      finishReasons: [],
      now: input.now,
    });
    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      progressStage: "saving_asset",
      progressPercent: 75,
      providerStatus: providerAuditResponse,
      now: input.now,
    });
    // renewSeedancePollLease holds a 5-minute lease under
    // 'seedance-video-poll-worker'. The fetch stage runs about a second later and
    // markSeedanceFinalizeLease only claims an unheld, expired, or self-owned
    // lease, so leaving it in place made every successful poll hand the artifact
    // chain a lease it could not take: fetch returned skipped and the task waited
    // for the repair sweeper, which itself only picks up expired leases. Release
    // it here so the successor stage can claim the task immediately.
    await releaseSeedancePollLeaseForArtifactHandoff(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      now: input.now,
    });

    return { status: "succeeded" };
  } catch (error) {
    await recordGlobalAiOpcLifecycleStep(db, {
      providerRequestId: row.provider_request_id,
      stage: "poll_request_failed",
      details: {
        externalRequestId: row.external_request_id,
        failureCode: readErrorFailureCode(error) ?? "provider_poll_failed",
        providerDiagnostics: readErrorProviderDiagnostics(error),
        localError: readLocalErrorDiagnostics(error),
      },
      now: input.now,
    });
    if (isSeedancePollResultNotFoundError(error)) {
      const failureCode = "provider_result_not_found";
      const errorMessage = translateProviderErrorMessage(error, {
        failureCode: readErrorFailureCode(error) ?? "provider_failed",
        mediaType: "video",
        phase: "poll",
      });
      const providerStatus = removeUndefinedValues({
        providerStatus: "not_found",
        failureCode,
        errorMessage,
        externalRequestId: row.external_request_id,
        providerDiagnostics: readErrorProviderDiagnostics(error),
      });
      await markProviderRequestFailed(db, {
        providerRequestId: row.provider_request_id,
        failureCode,
        redactedResponse: providerStatus,
        now: input.now,
      });
      await completeUserModelRequestLog(db, {
        providerRequestId: row.provider_request_id,
        status: "failed",
        responseText: buildSeedanceFailureResponseText({
          failureCode,
          errorMessage,
          providerResponse: providerStatus,
        }),
        responseUsage: null,
        finishReasons: [],
        failureCode,
        now: input.now,
      });
      await failSeedanceTask(db, {
        row,
        failureCode,
        providerRequestId: row.provider_request_id,
        redactedResponse: buildSeedanceBillingMetadata(row, snapshot, {
          billingEvent: "released",
          outcome: "released",
          provider: "model-gateway",
          providerRequestId: row.provider_request_id,
          externalRequestId: row.external_request_id,
          failureCode,
          errorMessage,
          providerResponse: providerStatus,
          settledAt: input.now,
        }),
        now: input.now,
      });
      await markGenerationTaskSnapshotFailed(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        providerStatus,
        failure: {
          failureCode,
          providerStatus: "not_found",
          providerMessage: errorMessage,
        displayMessage: "生成结果已不存在，系统已停止继续处理并返还积分。请重新处理生成。",
        },
        creditSummary: {
          released: resolveGenerationBillingAmount(row.amount_reserved, snapshot),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      return { status: "failed", failureCode };
    }
    throw error;
  } finally {
    await releaseProviderPermit(permit);
  }
}

export async function expireSeedanceVideoPollJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId?: string | null;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "failed"; failureCode: "provider_poll_timeout" }
  | { status: "skipped"; nextAction: "finalize" }
> {
  const row = await findSeedanceTaskForPollExpiration(
    db,
    input.taskId,
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"),
    input.expectedAttemptId ?? null,
  );
  if (!row) {
    return { status: "failed", failureCode: "provider_poll_timeout" };
  }

  const timeoutStatus = await cancelSeedanceProviderTask(db, {
    row,
    env: input.env ?? process.env,
    fetchImpl: input.fetchImpl,
    failureCode: "provider_poll_timeout",
  });
  const cancellationConfirmed = timeoutStatus.cancelStatus === "canceled";
  const snapshot = parseSnapshot(row.input_snapshot_json);
  if (!cancellationConfirmed) {
    let providerStatus = row.provider_status ?? null;
    const externallyStarted = Boolean(
      row.external_submission_started_at
      || row.external_request_id
      || ["submitted", "accepted", "running", "result_unknown", "succeeded"].includes(row.provider_status ?? ""),
    );
    if (row.provider_request_id && externallyStarted) {
      const provider = await markProviderRequestResultUnknown(db, {
        providerRequestId: row.provider_request_id,
        failureCode: "provider_poll_timeout",
        redactedResponse: timeoutStatus,
        now: input.now,
      });
      providerStatus = provider.status;
      // markProviderRequestResultUnknown refuses to touch terminal rows, so a
      // 'succeeded' status here means the provider really did finish before the
      // poll budget ran out. Failing the task would throw away a completed
      // video; hand it to the finalize stage instead.
      if (provider.status === "succeeded") {
        return { status: "skipped", nextAction: "finalize" };
      }
    }
    if (row.provider_request_id && !["failed", "canceled"].includes(providerStatus ?? "")) {
      await markProviderRequestFailed(db, {
        providerRequestId: row.provider_request_id,
        failureCode: "provider_poll_timeout",
        redactedResponse: timeoutStatus,
        now: input.now,
      });
      await completeUserModelRequestLog(db, {
        providerRequestId: row.provider_request_id,
        status: "failed",
        responseText: buildSeedanceFailureResponseText({
          failureCode: "provider_poll_timeout",
          errorMessage: "模型服务结果轮询超时，请重新发起生成。",
          providerResponse: timeoutStatus,
        }),
        responseUsage: null,
        finishReasons: [],
        failureCode: "provider_poll_timeout",
        now: input.now,
      });
    }
    const failed = await failSeedanceTask(db, {
      row,
      failureCode: "provider_poll_timeout",
      providerRequestId: row.provider_request_id,
      redactedResponse: buildSeedanceBillingMetadata(row, snapshot, {
        billingEvent: "released",
        outcome: "released",
        provider: "model-gateway",
        providerRequestId: row.provider_request_id,
        externalRequestId: row.external_request_id,
        failureCode: "provider_poll_timeout",
        providerResponse: timeoutStatus,
        settledAt: input.now,
      }),
      now: input.now,
    });
    if (!failed) {
      return { status: "failed", failureCode: "provider_poll_timeout" };
    }
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      providerStatus: timeoutStatus,
      failure: {
        failureCode: "provider_poll_timeout",
        displayMessage: "生成超时，请重新处理生成。",
      },
      creditSummary: {
        released: resolveGenerationBillingAmount(row.amount_reserved, snapshot),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    return { status: "failed", failureCode: "provider_poll_timeout" };
  }
  if (row.provider_request_id) {
    await markProviderRequestCanceled(db, {
      providerRequestId: row.provider_request_id,
      failureCode: "provider_poll_timeout",
      redactedResponse: timeoutStatus,
      now: input.now,
    });
    await completeUserModelRequestLog(db, {
      providerRequestId: row.provider_request_id,
      status: "canceled",
      responseText: buildSeedanceFailureResponseText({
        failureCode: "provider_poll_timeout",
        errorMessage: "生成超时，请重新处理生成。",
        providerResponse: timeoutStatus,
      }),
      responseUsage: null,
      finishReasons: [],
      failureCode: "provider_poll_timeout",
      now: input.now,
    });
  }
  const failed = await failSeedanceTask(db, {
    row,
    failureCode: "provider_poll_timeout",
    providerRequestId: row.provider_request_id,
    redactedResponse: buildSeedanceBillingMetadata(row, snapshot, {
      billingEvent: "released",
      outcome: "released",
      provider: "model-gateway",
      providerRequestId: row.provider_request_id,
      externalRequestId: row.external_request_id,
      failureCode: "provider_poll_timeout",
      providerResponse: timeoutStatus,
      settledAt: input.now,
    }),
    now: input.now,
  });
  if (!failed) {
    return { status: "failed", failureCode: "provider_poll_timeout" };
  }
  await markGenerationTaskSnapshotFailed(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    providerStatus: timeoutStatus,
    failure: {
      failureCode: "provider_poll_timeout",
      displayMessage: "生成超时，请重新处理生成。",
    },
    creditSummary: {
      released: resolveGenerationBillingAmount(row.amount_reserved, snapshot),
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });

  return { status: "failed", failureCode: "provider_poll_timeout" };
}

async function cancelSeedanceProviderTask(
  db: SqlDatabase,
  input: {
    row: SeedanceTaskRow;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    failureCode: string;
  },
): Promise<Record<string, unknown> & { cancelStatus?: string }> {
  const timeoutStatus = {
    provider: "model-gateway",
    externalRequestId: input.row.external_request_id,
    failureCode: input.failureCode,
  };

  if (!input.row.external_request_id) {
    return { ...timeoutStatus, cancelStatus: "skipped", cancelReason: "external_request_id_missing" };
  }

  try {
    const snapshot = parseSnapshot(input.row.input_snapshot_json);
    const modelCode = readString(snapshot.model) || "seedance-i2v-pro";
    const modelConfig = await resolveGenerationModelConfigForTask(db, snapshot, modelCode);
    const adapter = createProviderAdapterFromModelConfig(
      modelConfig
        ? {
            providerProtocol: modelConfig.providerProtocol,
            providerModel: modelConfig.providerModel,
            mediaType: modelConfig.mediaType,
            providerConfig: modelConfig.providerConfig,
            invocationMode: modelConfig.invocationMode,
          }
        : fallbackSeedanceModelConfig(input.env),
      input.env,
      resolveGenerationProviderFetch(input.fetchImpl, "video", input.env),
    ) as unknown as SeedancePollAdapter;

    if (typeof adapter.cancel !== "function") {
      return { ...timeoutStatus, cancelStatus: "skipped", cancelReason: "provider_cancel_not_supported" };
    }

    const canceled = await adapter.cancel({ externalRequestId: input.row.external_request_id });
    return {
      ...timeoutStatus,
      cancelStatus: canceled.status,
      cancelResponse: canceled.redactedResponse,
    };
  } catch (error) {
    return {
      ...timeoutStatus,
      cancelStatus: "failed",
      cancelError: translateProviderErrorMessage(error, {
        failureCode: readErrorFailureCode(error) ?? "provider_cancel_failed",
        mediaType: "video",
        phase: "poll",
      }),
    };
  }
}

export async function cancelGenerationTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "canceled"; taskId: string; providerCancellation: "canceled" | "not_submitted"; creditStatus: "released" | "not_reserved" }
  | { status: "already_canceled"; taskId: string }
  | { status: "not_cancelable"; taskId: string; taskStatus: string; reason: string }
> {
  const row = await findSeedanceTaskForCancellation(db, input.taskId);
  if (!row) {
    return { status: "not_cancelable", taskId: input.taskId, taskStatus: "missing", reason: "generation_task_not_found" };
  }
  const taskStatus = readString(row.task_status) || "queued";
  if (taskStatus === "canceled") return { status: "already_canceled", taskId: row.task_id };
  if (!["queued", "running", "result_unknown"].includes(taskStatus)) {
    return { status: "not_cancelable", taskId: row.task_id, taskStatus, reason: "generation_task_terminal" };
  }
  const snapshot = parseSnapshot(row.input_snapshot_json);
  if (row.external_request_id) {
    const providerExecutor = readString(snapshot.providerExecutor);
    const cancelSupported = row.task_type === "episode_generate_video" && isVideoProviderExecutor(providerExecutor);
    if (!cancelSupported) {
      return { status: "not_cancelable", taskId: row.task_id, taskStatus, reason: "provider_cancel_not_supported" };
    }
    if (!row.provider_request_id) {
      return { status: "not_cancelable", taskId: row.task_id, taskStatus, reason: "provider_task_not_submitted" };
    }
    const providerCancellation = await cancelSeedanceProviderTask(db, {
      row,
      env: input.env,
      fetchImpl: input.fetchImpl,
      failureCode: "user_canceled",
    });
    if (providerCancellation.cancelStatus !== "canceled") {
      return {
        status: "not_cancelable",
        taskId: row.task_id,
        taskStatus,
        reason: providerCancellation.cancelStatus === "failed"
          ? "provider_cancel_failed"
          : providerCancellation.cancelStatus === "not_cancelable"
            ? "provider_task_not_cancelable"
            : providerCancellation.cancelStatus === "unknown"
              ? "provider_cancel_unknown"
            : readString(providerCancellation.cancelReason) || "provider_cancel_not_supported",
      };
    }
  } else if (row.task_status !== "queued") {
    return { status: "not_cancelable", taskId: row.task_id, taskStatus, reason: "provider_task_not_submitted" };
  }
  await db.query("BEGIN");
  try {
    const canceled = await markSeedanceTaskCanceled(db, {
      row,
      expectedStatus: taskStatus,
      now: input.now,
    });
    if (!canceled) {
      await db.query("ROLLBACK");
      const latest = await findSeedanceTaskForCancellation(db, input.taskId);
      if (latest?.task_status === "canceled") return { status: "already_canceled", taskId: row.task_id };
      return {
        status: "not_cancelable",
        taskId: row.task_id,
        taskStatus: readString(latest?.task_status) || "unknown",
        reason: "generation_task_state_changed",
      };
    }
  const providerStatus = {
    providerStatus: row.task_status === "queued" ? "not_submitted" : "canceled",
    externalRequestId: row.external_request_id,
    failureCode: "user_canceled",
  };
  if (row.provider_request_id) {
    await markProviderRequestCanceled(db, {
      providerRequestId: row.provider_request_id,
      failureCode: "user_canceled",
      redactedResponse: providerStatus,
      now: input.now,
    });
    await completeUserModelRequestLog(db, {
      providerRequestId: row.provider_request_id,
      status: "canceled",
      responseText: JSON.stringify({ status: "canceled", reason: "user_canceled" }),
      responseUsage: null,
      finishReasons: [],
      failureCode: "user_canceled",
      now: input.now,
    });
  }
  const amount = resolveGenerationBillingAmount(row.amount_reserved, snapshot);
  if (row.reservation_id && amount > 0) {
    await reopenManualReviewReservationForSettlement(db, {
      reservationId: row.reservation_id,
      now: input.now,
    });
    await settleReservationAllocationInTransaction(db, {
      reservationId: row.reservation_id,
      allocationKey: "user-canceled",
      amount,
      outcome: "released",
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      metadata: providerStatus,
      now: input.now,
    });
  }
  if (!row.reservation_id && amount > 0) {
    const memberId = readSnapshotTeamMemberId(snapshot);
    if (memberId) {
      await refundTeamMemberGenerationCreditsInTransaction(db, {
        teamMemberId: memberId,
        amount,
        sourceId: row.task_id,
        reason: "生成取消返还积分",
        metadata: providerStatus,
        now: input.now,
      });
    }
  }
  await markGenerationTaskSnapshotCanceled(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    providerStatus,
    creditSummary: {
      released: amount,
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });
    await aggregateWorkflowStatus(db, row.workflow_id);
    await db.query("COMMIT");
    return {
      status: "canceled",
      taskId: row.task_id,
      providerCancellation: row.task_status === "queued" ? "not_submitted" : "canceled",
      creditStatus: amount > 0 ? "released" : "not_reserved",
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function finalizeSeedanceVideoArtifactJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId?: string | null;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" }
> {
  let row = await findAttemptScopedSeedanceTaskForFinalize(db, input);
  if (!row?.provider_request_id || !row.external_request_id) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }
  const snapshot = parseSnapshot(row.input_snapshot_json);
  const videoUrl = await resolveSeedanceArtifactUrlForTransfer(db, row, snapshot, input);
  if (!videoUrl) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }
  const leaseOwner = `seedance-video-finalizer:${randomUUID()}`;
  row = await ensureSeedanceFinalizeAttempt(db, {
    row,
    now: input.now,
    workerId: leaseOwner,
  });
  if (!row.attempt_id) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }
  const leaseClaimed = await markSeedanceFinalizeLease(db, {
    taskId: row.task_id,
    owner: leaseOwner,
    now: input.now,
  });
  // A held lease means a live sibling finalizer owns this task. That is a real
  // duplicate, not the stalled handoff the poll stage now releases explicitly.
  if (!leaseClaimed) return { status: "skipped" };
  const stopLeaseHeartbeat = startSeedanceFinalizeLeaseHeartbeat(db, {
    taskId: row.task_id,
    owner: leaseOwner,
  });

  try {
    await assertCanvasGenerationAssignmentActive(db, snapshot);
    var persisted = await persistSeedanceVideoArtifact(db, {
      row,
      snapshot,
      videoUrl,
      runtime: input.runtime,
      env: input.env,
      fetchImpl: input.fetchImpl,
      now: input.now,
    });
  } catch (error) {
    const failureCode = readErrorFailureCode(error) ?? "provider_output_persist_failed";
    const errorMessage = translateProviderErrorMessage(error, {
      failureCode,
      mediaType: "video",
      phase: "persist",
    });
    const storageObjectKey = readErrorStorageObjectKey(error);
    if (isSeedanceProviderResultTransferFailure(failureCode)) {
      const transferRetryAttempt = await recordSeedanceArtifactTransferRetry(db, {
        taskId: row.task_id,
        now: input.now,
      });
      if (transferRetryAttempt >= SEEDANCE_ARTIFACT_TRANSFER_RETRY_LIMIT) {
        await failSeedanceArtifactStorageAfterRetryLimit(db, {
          row,
          transferFailureCode: failureCode,
          transferRetryAttempt,
          errorMessage,
          storageObjectKey,
          now: input.now,
        });
        return { status: "failed", failureCode: SEEDANCE_ARTIFACT_STORAGE_FAILURE_CODE };
      }
      await markSeedanceTaskTransferRetryPending(db, {
        taskId: row.task_id,
        now: input.now,
      });
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        progressStage: "asset_transfer_retry_pending",
        providerStatus: {
          provider: "seedance",
          externalRequestId: row.external_request_id,
          transferStatus: "retry_pending",
          transferFailureCode: failureCode,
          transferRetryAttempt,
          transferRetryLimit: SEEDANCE_ARTIFACT_TRANSFER_RETRY_LIMIT,
          ...(storageObjectKey ? { storageObjectKey } : {}),
        },
        now: input.now,
      });
      return { status: "failed", failureCode };
    }
    if (failureCode === "provider_output_persist_failed") {
      await markSeedanceTaskManualReview(db, {
        row,
        failureCode,
        providerRequestId: row.provider_request_id,
        redactedResponse: buildSeedanceBillingMetadata(row, snapshot, {
          billingEvent: "manual_review_required",
          outcome: "manual_review_required",
          provider: "model-gateway",
          providerRequestId: row.provider_request_id,
          externalRequestId: row.external_request_id,
          failureCode,
          storageObjectKey,
          errorMessage,
          settledAt: input.now,
        }),
        now: input.now,
      });
      await markGenerationTaskSnapshotManualReviewRequired(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        progressStage: "asset_persist_failed",
        failure: {
          failureCode,
          displayMessage: "已保存到平台存储，正在等待后台补写资产记录",
          errorMessage,
          storageObjectKey,
        },
        creditSummary: {
          reserved: Number(row.amount_reserved ?? 0),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      return { status: "failed", failureCode };
    }
    await failSeedanceTask(db, {
      row,
      failureCode,
      providerRequestId: row.provider_request_id,
      redactedResponse: buildSeedanceBillingMetadata(row, snapshot, {
        billingEvent: "released",
        outcome: "released",
        provider: "model-gateway",
        providerRequestId: row.provider_request_id,
        externalRequestId: row.external_request_id,
        failureCode,
        errorMessage,
        settledAt: input.now,
      }),
      now: input.now,
    });
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      failure: {
        failureCode,
        displayMessage: errorMessage,
        errorMessage,
      },
      creditSummary: {
        released: resolveGenerationBillingAmount(row.amount_reserved, snapshot),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    return { status: "failed", failureCode };
  } finally {
    stopLeaseHeartbeat();
  }

  await ensureProjectUploadRecordForStorageObject(db, {
    storageObjectId: persisted.storageObjectId,
    pageKey: "project",
    sourceAction: "generate_video",
    publicUrl: persisted.previewUrl,
    status: "uploaded",
    now: input.now,
  });
  await writeSeedanceVideoBackToStoryboard(db, {
    snapshot,
    projectId: row.project_id,
    assetVersionId: persisted.assetVersionId,
    now: input.now,
  });

  const amount = resolveGenerationBillingAmount(row.amount_reserved, snapshot);
  await finalizeTaskAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    status: "succeeded",
    now: input.now,
    finalize: async () => {
      if (row.reservation_id && amount > 0) {
        await reopenManualReviewReservationForSettlement(db, {
          reservationId: row.reservation_id,
          now: input.now,
        });
        await settleReservationAllocationInTransaction(db, {
          reservationId: row.reservation_id,
          allocationKey: "seedance-result",
          amount,
          outcome: "consumed",
          taskId: row.task_id,
          attemptId: row.attempt_id,
          providerRequestId: row.provider_request_id,
          metadata: buildSeedanceBillingMetadata(row, snapshot, {
            billingEvent: "consumed",
            outcome: "consumed",
            provider: "model-gateway",
            providerRequestId: row.provider_request_id,
            externalRequestId: row.external_request_id,
            settledAt: input.now,
          }),
          now: input.now,
        });
      }
      await markGenerationTaskSnapshotSucceeded(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        resultAssets: [persisted],
        providerStatus: {
          provider: "model-gateway",
          externalRequestId: row.external_request_id,
        },
        creditSummary: {
          consumed: amount,
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      await markAssetConversationGenerationSucceeded(db, {
        taskId: row.task_id,
        result: persisted,
        now: input.now,
      });
    },
  });
  await aggregateWorkflowStatus(db, row.workflow_id);

  return { status: "succeeded" };
}

export async function recoverSeedanceVideoAfterPollTimeout(
  db: SqlDatabase,
  input: {
    taskId: string;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "succeeded" }
  | { status: "already_recovered" }
  | { status: "skipped"; reason: string }
> {
  let row = await findSeedancePollTimeoutRecoveryTask(db, input.taskId);
  if (!row) return { status: "skipped", reason: "task_not_found" };
  if (isSeedancePollTimeoutRecoveryComplete(row)) return { status: "already_recovered" };
  if (!isSeedancePollTimeoutRecoveryCandidate(row)) {
    return { status: "skipped", reason: "task_not_recoverable" };
  }
  const recoveryReason = seedanceProviderResultRecoveryReason(row);

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const modelCode = readString(snapshot.model) || "seedance-i2v-pro";
  const modelConfig = await resolveGenerationModelConfigForTask(db, snapshot, modelCode);
  const adapter = createProviderAdapterFromModelConfig(
    modelConfig
      ? {
          providerProtocol: modelConfig.providerProtocol,
          providerModel: modelConfig.providerModel,
          mediaType: modelConfig.mediaType,
          providerConfig: modelConfig.providerConfig,
          invocationMode: modelConfig.invocationMode,
        }
      : fallbackSeedanceModelConfig(input.env),
    input.env,
    resolveGenerationProviderFetch(input.fetchImpl, "video", input.env),
  ) as unknown as SeedancePollAdapter;
  const poll = await adapter.poll({
    externalRequestId: row.external_request_id!,
    redactedPayload: buildProviderPollPayload(snapshot, row.provider_response_redacted_json),
  });
  const videoUrl = readString(poll.videoUrl);
  if (poll.status !== "succeeded" || !videoUrl) {
    return { status: "skipped", reason: "provider_result_not_ready" };
  }
  await assertCanvasGenerationAssignmentActive(db, snapshot);

  const claimed = await claimSeedancePollTimeoutRecovery(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id!,
    providerRequestId: row.provider_request_id!,
    initialFailureCode: row.failure_code!,
    providerResponse: {
      ...poll.redactedResponse,
      videoUrl: redactProviderArtifactAuditUrl(videoUrl),
      recoveryReason,
    },
    now: input.now,
  });
  if (!claimed) {
    row = await findSeedancePollTimeoutRecoveryTask(db, input.taskId);
    return row && isSeedancePollTimeoutRecoveryComplete(row)
      ? { status: "already_recovered" }
      : { status: "skipped", reason: "recovery_in_progress" };
  }
  row = { ...row, task_status: "running", attempt_status: "running" };

  let handoff = await findOrRecoverGenerationArtifactHandoff(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id!,
    mediaType: "video",
    now: input.now,
  });
  if (!handoff) {
    const stored = await persistSeedanceVideoArtifact(db, {
      row,
      snapshot,
      videoUrl,
      runtime: input.runtime,
      env: input.env,
      fetchImpl: input.fetchImpl,
      fetchOnly: true,
      now: input.now,
    });
    await recordGenerationArtifactHandoff(db, {
      taskId: row.task_id,
      mediaType: "video",
      attemptId: row.attempt_id!,
      storageObjectId: stored.storageObjectId,
      storageObjectKey: stored.storageObjectKey,
      contentType: stored.mimeType,
      now: input.now,
    });
    handoff = await findGenerationArtifactHandoff(db, row.task_id);
  }
  if (!handoff) throw new Error("seedance_timeout_recovery_handoff_missing");

  const storageObject = await findStorageObjectByKey(db, {
    userId: row.created_by_user_id ?? row.user_id,
    objectKey: handoff.storageObjectKey,
  });
  if (!storageObject || storageObject.status !== "available") {
    throw new Error("seedance_timeout_recovery_storage_object_missing");
  }
  const platformUrl = buildPlatformStorageUrl(input.runtime, storageObject);
  const created = row.project_id
    ? await createAssetVersionSnapshot(db, {
        userId: row.created_by_user_id ?? row.user_id,
        projectId: row.project_id,
        assetType: "shot_video",
        assetKey: `video:${readString(snapshot.episodeId) || row.project_id}:${row.task_id}`,
        createdByUserId: row.created_by_user_id ?? "",
        storageObjectId: storageObject.id,
        storageObjectKey: storageObject.objectKey,
        metadata: {
          mimeType: storageObject.contentType,
          label: "Seedance episode video",
          episodeId: readString(snapshot.episodeId) ?? null,
          taskId: row.task_id,
          targetType: readString(snapshot.targetType) ?? "episode",
          targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId) ?? null,
          previewUrl: platformUrl,
          sourceUrl: platformUrl,
          downloadUrl: platformUrl,
          provider: "model-gateway",
          externalRequestId: row.external_request_id,
        },
        sourceTaskId: row.task_id,
        sourceAttemptId: row.attempt_id,
        now: input.now,
      })
    : null;
  const persisted = {
    assetId: created?.asset.id ?? null,
    assetVersionId: created?.version.id ?? null,
    storageObjectId: storageObject.id,
    storageObjectKey: storageObject.objectKey,
    mediaKind: "video",
    mimeType: storageObject.contentType,
    url: platformUrl,
    previewUrl: platformUrl,
    sourceUrl: platformUrl,
    downloadUrl: platformUrl,
  };
  await ensureProjectUploadRecordForStorageObject(db, {
    storageObjectId: storageObject.id,
    pageKey: "project",
    sourceAction: "generate_video",
    publicUrl: platformUrl,
    status: "uploaded",
    now: input.now,
  });
  await writeSeedanceVideoBackToStoryboard(db, {
    snapshot,
    projectId: row.project_id,
    assetVersionId: persisted.assetVersionId,
    now: input.now,
  });

  await finalizeTaskAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id!,
    status: "succeeded",
    now: input.now,
    finalize: async () => {
      await markSeedancePollTimeoutRecoverySnapshotSucceeded(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id!,
        providerRequestId: row.provider_request_id!,
        resultAsset: persisted,
        releasedAmount: Number(row.amount_released ?? 0),
        externalRequestId: row.external_request_id!,
        recoveryReason,
        now: input.now,
      });
    },
  });
  await aggregateWorkflowStatus(db, row.workflow_id);
  return { status: "succeeded" };
}

async function markSeedanceTaskTransferRetryPending(
  db: SqlDatabase,
  input: {
    taskId: string;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE tasks
      SET status = 'running',
          failure_code = NULL,
          locked_by = 'seedance-video-finalize-worker',
          locked_until = $2,
          heartbeat_at = $3,
          updated_at = $3
      WHERE id = $1
        AND status IN ('running', 'manual_review_required')
    `,
    [input.taskId, seedanceVideoLeaseUntil(input.now), input.now],
  );
}

async function markSeedanceFinalizeLease(
  db: SqlDatabase,
  input: {
    taskId: string;
    owner: string;
    now: Date;
  },
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(db,
    `
      UPDATE tasks
      SET status = 'running',
          failure_code = NULL,
          locked_by = $2,
          locked_until = $3,
          heartbeat_at = $4,
          updated_at = $4
      WHERE id = $1
        AND status IN ('running', 'manual_review_required', 'result_unknown')
        AND (
          locked_until IS NULL
          OR locked_until <= $4
          OR locked_by = $2
        )
      RETURNING id
    `,
    [input.taskId, input.owner, seedanceVideoLeaseUntil(input.now), input.now],
  );
  return Boolean(row);
}

function startSeedanceFinalizeLeaseHeartbeat(
  db: SqlDatabase,
  input: { taskId: string; owner: string },
) {
  const heartbeat = setInterval(() => {
    void renewSeedanceFinalizeLease(db, input).catch(() => undefined);
  }, 30_000);
  heartbeat.unref?.();
  return () => clearInterval(heartbeat);
}

async function renewSeedanceFinalizeLease(
  db: SqlDatabase,
  input: { taskId: string; owner: string },
) {
  const now = new Date();
  await db.query(
    `
      UPDATE tasks
      SET locked_until = $3,
          heartbeat_at = $4,
          updated_at = $4
      WHERE id = $1
        AND locked_by = $2
        AND status = 'running'
    `,
    [input.taskId, input.owner, seedanceVideoLeaseUntil(now), now],
  );
}

export async function fetchSeedanceVideoArtifactJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId?: string | null;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" }
> {
  let row = await findAttemptScopedSeedanceTaskForFinalize(db, input);
  if (!row?.provider_request_id || !row.external_request_id) {
    return resolveSeedanceVideoFetchUnavailable(db, input.taskId);
  }
  const snapshot = parseSnapshot(row.input_snapshot_json);
  const videoUrl = await resolveSeedanceArtifactUrlForTransfer(db, row, snapshot, input);
  if (!videoUrl) return resolveSeedanceVideoFetchUnavailable(db, input.taskId);
  const leaseOwner = `seedance-video-finalizer:${randomUUID()}`;
  row = await ensureSeedanceFinalizeAttempt(db, {
    row,
    now: input.now,
    workerId: leaseOwner,
  });
  if (!row.attempt_id) return resolveSeedanceVideoFetchUnavailable(db, input.taskId);
  const existing = await findOrRecoverGenerationArtifactHandoff(db, {
    taskId: input.taskId,
    attemptId: row.attempt_id,
    mediaType: "video",
    now: input.now,
  });
  if (existing) return { status: "succeeded" };
  await assertCanvasGenerationAssignmentActive(db, snapshot);
  const leaseClaimed = await markSeedanceFinalizeLease(db, {
    taskId: row.task_id,
    owner: leaseOwner,
    now: input.now,
  });
  // A held lease means another stage of this same task — typically the poll job
  // that just observed the finished video — is still releasing. That is transient
  // contention, not a completed task. Returning a bare "skipped" here ended the
  // fetch job as "completed" without enqueuing persist, so the task stalled until
  // the repair sweeper recovered it minutes later. Route through the shared
  // coordinator instead: a still-live task yields a retryable stage-not-ready
  // failure, and only a genuinely terminal task skips.
  if (!leaseClaimed) return resolveSeedanceVideoFetchUnavailable(db, input.taskId);
  const stopLeaseHeartbeat = startSeedanceFinalizeLeaseHeartbeat(db, {
    taskId: row.task_id,
    owner: leaseOwner,
  });
  try {
  await markGenerationTaskSnapshotRunning(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    progressStage: "artifact_fetching",
    progressPercent: 75,
    now: input.now,
  });
  const stored = await persistSeedanceVideoArtifact(db, {
    row,
    snapshot,
    videoUrl,
    runtime: input.runtime,
    env: input.env,
    fetchImpl: input.fetchImpl,
    fetchOnly: true,
    now: input.now,
  });
  await recordGenerationArtifactHandoff(db, {
    taskId: row.task_id,
    mediaType: "video",
    attemptId: row.attempt_id,
    storageObjectId: stored.storageObjectId,
    storageObjectKey: stored.storageObjectKey,
    contentType: stored.mimeType,
    now: input.now,
  });
  return { status: "succeeded" };
  } finally {
    stopLeaseHeartbeat();
  }
}

async function resolveSeedanceVideoFetchUnavailable(
  db: SqlDatabase,
  taskId: string,
): Promise<{ status: "failed"; failureCode: string } | { status: "skipped" }> {
  return resolveGenerationArtifactStageUnavailable(db, {
    taskId,
    failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
  });
}

export async function persistSeedanceVideoArtifactJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId?: string | null;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    now: Date;
  },
): Promise<
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" }
> {
  const row = await findAttemptScopedSeedanceTaskForPersist(db, input);
  if (!row?.attempt_id) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: "provider_output_persist_failed",
    });
  }
  const snapshot = parseSnapshot(row.input_snapshot_json);
  await assertCanvasGenerationAssignmentActive(db, snapshot);
  const handoff = await findGenerationArtifactHandoff(db, row.task_id);
  const failure = await findGenerationTaskSnapshotFailure(db, row.task_id);
  const storageObjectKey = (handoff?.attemptId === row.attempt_id ? handoff.storageObjectKey : undefined)
    ?? readString(failure.storageObjectKey)
    ?? readString(failure.storage_object_key);
  if (!storageObjectKey) {
    return { status: "failed", failureCode: "provider_output_persist_failed" };
  }
  const storageObject = await findStorageObjectByKey(db, {
    userId: row.created_by_user_id ?? row.user_id,
    objectKey: storageObjectKey,
  });
  if (!storageObject || storageObject.status !== "available") {
    return { status: "failed", failureCode: "provider_output_persist_failed" };
  }

  const platformUrl = buildPlatformStorageUrl(input.runtime, storageObject);
  const created = row.project_id
    ? await createAssetVersionSnapshot(db, {
        userId: row.created_by_user_id ?? row.user_id,
        projectId: row.project_id,
        assetType: "shot_video",
        assetKey: `video:${readString(snapshot.episodeId) || row.project_id}:${row.task_id}`,
        createdByUserId: row.created_by_user_id ?? "",
        storageObjectId: storageObject.id,
        storageObjectKey: storageObject.objectKey,
        metadata: {
          mimeType: storageObject.contentType,
          label: "Seedance episode video",
          episodeId: readString(snapshot.episodeId) ?? null,
          taskId: row.task_id,
          targetType: readString(snapshot.targetType) ?? "episode",
          targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId) ?? null,
          previewUrl: platformUrl,
          sourceUrl: platformUrl,
          downloadUrl: platformUrl,
          provider: "model-gateway",
          externalRequestId: row.external_request_id,
        },
        sourceTaskId: row.task_id,
        sourceAttemptId: row.attempt_id,
        now: input.now,
      })
    : null;
  const persisted = {
    assetId: created?.asset.id ?? null,
    assetVersionId: created?.version.id ?? null,
    storageObjectId: storageObject.id,
    storageObjectKey: storageObject.objectKey,
    mediaKind: "video",
    mimeType: storageObject.contentType,
    url: platformUrl,
    previewUrl: platformUrl,
    sourceUrl: platformUrl,
    downloadUrl: platformUrl,
  };
  await writeSeedanceVideoBackToStoryboard(db, {
    snapshot,
    projectId: row.project_id,
    assetVersionId: persisted.assetVersionId,
    now: input.now,
  });

  const amount = resolveGenerationBillingAmount(row.amount_reserved, snapshot);
  const billingAlreadyReleased = row.reservation_id && amount > 0
    ? await isSeedanceBillingAlreadyReleasedAfterInvalidResponse(db, {
        reservationId: row.reservation_id,
        providerRequestId: row.provider_request_id,
        amount,
      })
    : false;
  await finalizeTaskAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    status: "succeeded",
    now: input.now,
    finalize: async () => {
      if (row.reservation_id && amount > 0 && !billingAlreadyReleased) {
        await reopenManualReviewReservationForSettlement(db, {
          reservationId: row.reservation_id,
          now: input.now,
        });
        await settleReservationAllocationInTransaction(db, {
          reservationId: row.reservation_id,
          allocationKey: "seedance-persist-retry",
          amount,
          outcome: "consumed",
          taskId: row.task_id,
          attemptId: row.attempt_id,
          providerRequestId: row.provider_request_id,
          metadata: buildSeedanceBillingMetadata(row, snapshot, {
            billingEvent: "consumed",
            outcome: "consumed",
            provider: "model-gateway",
            providerRequestId: row.provider_request_id,
            externalRequestId: row.external_request_id,
            storageObjectKey,
            settledAt: input.now,
          }),
          now: input.now,
        });
      }
      await markGenerationTaskSnapshotSucceeded(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        resultAssets: [persisted],
        providerStatus: {
          provider: "model-gateway",
          externalRequestId: row.external_request_id,
        },
        creditSummary: {
          consumed: billingAlreadyReleased ? 0 : amount,
          ...(billingAlreadyReleased ? { released: amount } : {}),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      await markAssetConversationGenerationSucceeded(db, {
        taskId: row.task_id,
        result: persisted,
        now: input.now,
      });
    },
  });
  await aggregateWorkflowStatus(db, row.workflow_id);

  return { status: "succeeded" };
}

async function markSeedanceTaskResultUnknown(
  db: SqlDatabase,
  input: {
    row: SeedanceTaskRow;
    failureCode: string;
    providerRequestId: string | null;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
) {
  const snapshot = parseSnapshot(input.row.input_snapshot_json);
  const amount = resolveGenerationBillingAmount(input.row.amount_reserved, snapshot);
  const settleCredits = async (inTransaction: boolean) => {
    if (input.row.reservation_id && amount > 0) {
      await reopenManualReviewReservationForSettlement(db, {
        reservationId: input.row.reservation_id,
        now: input.now,
      });
      const settle = inTransaction
        ? settleReservationAllocationInTransaction
        : settleReservationAllocation;
      await settle(db, {
        reservationId: input.row.reservation_id,
        allocationKey: input.failureCode,
        amount,
        outcome: "manual_review_required",
        taskId: input.row.task_id,
        attemptId: input.row.attempt_id,
        providerRequestId: input.providerRequestId,
        metadata: input.redactedResponse,
        now: input.now,
      });
    }
  };
  if (input.row.attempt_id) {
    await finalizeTaskAttempt(db, {
      taskId: input.row.task_id,
      attemptId: input.row.attempt_id,
      status: "result_unknown",
      failureCode: input.failureCode,
      now: input.now,
      finalize: async () => settleCredits(true),
    });
    await aggregateWorkflowStatus(db, input.row.workflow_id);
  } else {
    await settleCredits(false);
  }
  await markAssetConversationGenerationTerminal(db, {
    taskId: input.row.task_id,
    status: "result_unknown",
    failureCode: input.failureCode,
    noticeType: "admin_action_required",
    now: input.now,
  });
}

async function markSeedanceTaskManualReview(
  db: SqlDatabase,
  input: {
    row: SeedanceTaskRow;
    failureCode: string;
    providerRequestId: string | null;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
) {
  const amount = Number(input.row.amount_reserved ?? 0);
  const settleCredits = async (inTransaction: boolean) => {
    if (input.row.reservation_id && amount > 0) {
      await reopenManualReviewReservationForSettlement(db, {
        reservationId: input.row.reservation_id,
        now: input.now,
      });
      const settle = inTransaction
        ? settleReservationAllocationInTransaction
        : settleReservationAllocation;
      await settle(db, {
        reservationId: input.row.reservation_id,
        allocationKey: input.failureCode,
        amount,
        outcome: "manual_review_required",
        taskId: input.row.task_id,
        attemptId: input.row.attempt_id,
        providerRequestId: input.providerRequestId,
        metadata: input.redactedResponse,
        now: input.now,
      });
    }
  };
  if (input.row.attempt_id) {
    await finalizeTaskAttempt(db, {
      taskId: input.row.task_id,
      attemptId: input.row.attempt_id,
      status: "manual_review_required",
      failureCode: input.failureCode,
      now: input.now,
      finalize: async () => settleCredits(true),
    });
    await aggregateWorkflowStatus(db, input.row.workflow_id);
  } else {
    await settleCredits(false);
  }
  await markAssetConversationGenerationTerminal(db, {
    taskId: input.row.task_id,
    status: "manual_review_required",
    failureCode: input.failureCode,
    noticeType: "admin_action_required",
    now: input.now,
  });
}

async function findSeedanceTaskForSubmit(db: SqlDatabase, taskId: string) {
  return queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.task_type,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        w.created_by_user_id AS user_id,
        t.project_id,
        t.input_snapshot_json,
        w.created_by_user_id,
        NULL::uuid AS provider_request_id,
        NULL::text AS external_request_id,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      JOIN workflows w
        ON w.id = t.workflow_id
      LEFT JOIN generation_task_credit_reservations r
        ON r.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_video'
        AND t.status = 'queued'
        AND t.input_snapshot_json->>'providerExecutor' IN ('seedance', 'globalaiopc-video')
      LIMIT 1
    `,
    [taskId],
  );
}

async function findSeedanceTaskForPoll(
  db: SqlDatabase,
  taskId: string,
  enforceExpectedAttempt: boolean,
  expectedAttemptId: string | null,
) {
  return queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        w.created_by_user_id AS user_id,
        t.project_id,
        t.input_snapshot_json,
        w.created_by_user_id,
        pr.id AS provider_request_id,
        pr.status AS provider_status,
        pr.external_submission_started_at,
        pr.external_request_id,
        pr.response_redacted_json AS provider_response_redacted_json,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      JOIN workflows w
        ON w.id = t.workflow_id
      LEFT JOIN provider_requests pr
        ON pr.task_id = t.id
       AND (
         pr.attempt_id = t.current_attempt_id
         OR (pr.attempt_id IS NULL AND t.attempt_count = 1)
       )
      LEFT JOIN generation_task_credit_reservations r
        ON r.task_id = t.id
      WHERE t.id = $1
        AND (
          $2::boolean = false
          OR ($3::uuid IS NOT NULL AND t.current_attempt_id = $3)
          OR ($3::uuid IS NULL AND t.attempt_count = 1)
        )
        AND t.task_type = 'episode_generate_video'
        AND (
          t.status = 'running'
          OR (
            t.status = 'result_unknown'
            AND t.failure_code = 'lease_expired_after_external_start'
          )
        )
        AND t.input_snapshot_json->>'providerExecutor' IN ('seedance', 'globalaiopc-video')
        AND t.current_attempt_id IS NOT NULL
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId, enforceExpectedAttempt, expectedAttemptId],
  );
}

async function findSeedanceTaskForPollExpiration(
  db: SqlDatabase,
  taskId: string,
  enforceExpectedAttempt: boolean,
  expectedAttemptId: string | null,
) {
  return queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        w.created_by_user_id AS user_id,
        t.project_id,
        t.input_snapshot_json,
        w.created_by_user_id,
        pr.id AS provider_request_id,
        pr.status AS provider_status,
        pr.external_submission_started_at,
        pr.external_request_id,
        pr.response_redacted_json AS provider_response_redacted_json,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      JOIN workflows w ON w.id = t.workflow_id
      LEFT JOIN LATERAL (
        SELECT request.*
        FROM provider_requests request
        WHERE request.task_id = t.id
          AND t.current_attempt_id IS NOT NULL
          AND (
            request.attempt_id = t.current_attempt_id
            OR (request.attempt_id IS NULL AND t.attempt_count = 1)
          )
        ORDER BY request.updated_at DESC, request.created_at DESC
        LIMIT 1
      ) pr ON true
      LEFT JOIN generation_task_credit_reservations r ON r.task_id = t.id
      WHERE t.id = $1
        AND (
          $2::boolean = false
          OR ($3::uuid IS NOT NULL AND t.current_attempt_id = $3)
          OR ($3::uuid IS NULL AND t.attempt_count = 0)
        )
        AND t.task_type = 'episode_generate_video'
        AND t.status IN ('running', 'result_unknown')
        AND t.input_snapshot_json->>'providerExecutor' IN ('seedance', 'globalaiopc-video')
      LIMIT 1
    `,
    [taskId, enforceExpectedAttempt, expectedAttemptId],
  );
}

async function findSeedanceTaskForCancellation(db: SqlDatabase, taskId: string) {
  return queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.task_type,
        t.status AS task_status,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        w.created_by_user_id AS user_id,
        t.project_id,
        t.input_snapshot_json,
        w.created_by_user_id,
        pr.id AS provider_request_id,
        pr.external_request_id,
        pr.response_redacted_json AS provider_response_redacted_json,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      JOIN workflows w ON w.id = t.workflow_id
      LEFT JOIN LATERAL (
        SELECT request.id, request.external_request_id, request.response_redacted_json
        FROM provider_requests request
        WHERE request.task_id = t.id
          AND t.current_attempt_id IS NOT NULL
          AND (
            request.attempt_id = t.current_attempt_id
            OR (request.attempt_id IS NULL AND t.attempt_count = 1)
          )
        ORDER BY request.created_at DESC
        LIMIT 1
      ) pr ON TRUE
      LEFT JOIN generation_task_credit_reservations r ON r.task_id = t.id
      WHERE t.id = $1
      LIMIT 1
    `,
    [taskId],
  );
}

async function markSeedanceTaskCanceled(
  db: SqlDatabase,
  input: { row: SeedanceTaskRow; expectedStatus: string; now: Date },
) {
  const canceled = await queryOne<{ id: string }>(
    db,
    `
      UPDATE tasks
      SET status = 'canceled',
          failure_code = 'user_canceled',
          locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL,
          updated_at = $3
      WHERE id = $1
        AND status = $2
        AND (
          ($4::uuid IS NULL AND current_attempt_id IS NULL)
          OR current_attempt_id = $4
        )
      RETURNING id
    `,
    [input.row.task_id, input.expectedStatus, input.now, input.row.attempt_id],
  );
  if (!canceled) return false;
  if (input.row.attempt_id) {
    await db.query(
      `
        UPDATE task_attempts
        SET status = 'canceled',
            failure_code = 'user_canceled',
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            finished_at = $3,
            updated_at = $3
        WHERE id = $1
          AND task_id = $2
          AND status IN ('created', 'running', 'result_unknown')
      `,
      [input.row.attempt_id, input.row.task_id, input.now],
    );
  }
  return true;
}

function isSeedanceProviderResultTransferFailure(failureCode: string) {
  return failureCode === "provider_output_download_failed"
    || failureCode === "provider_output_upload_failed";
}

async function recordSeedanceArtifactTransferRetry(
  db: SqlDatabase,
  input: { taskId: string; now: Date },
) {
  const row = await queryOne<{ transfer_retry_attempt: number | string }>(
    db,
    `
      WITH retry_history AS (
        SELECT count(*)::int AS retry_count
        FROM outbox_events
        WHERE event_type = 'generation.task.finalize_requested'
          AND payload_json->>'taskId' = $1::text
          AND payload_json->>'finalizeMode' = 'retry_finalize'
      ), updated_snapshot AS (
        UPDATE ai_generation_task_snapshots snapshot
        SET provider_status_json = COALESCE(snapshot.provider_status_json, '{}'::jsonb) || jsonb_build_object(
              'transferRetryAttempt',
              GREATEST(
                CASE
                  WHEN COALESCE(snapshot.provider_status_json->>'transferRetryAttempt', '') ~ '^[0-9]+$'
                  THEN (snapshot.provider_status_json->>'transferRetryAttempt')::int + 1
                  ELSE 1
                END,
                (SELECT retry_count FROM retry_history)
              ),
              'transferRetryLimit', $2::int
            ),
            updated_at = $3::timestamptz
        WHERE snapshot.task_id = $1::uuid
        RETURNING (provider_status_json->>'transferRetryAttempt')::int AS transfer_retry_attempt
      )
      SELECT transfer_retry_attempt
      FROM updated_snapshot
      UNION ALL
      SELECT GREATEST(retry_count, 1) AS transfer_retry_attempt
      FROM retry_history
      WHERE NOT EXISTS (SELECT 1 FROM updated_snapshot)
      LIMIT 1
    `,
    [input.taskId, SEEDANCE_ARTIFACT_TRANSFER_RETRY_LIMIT, input.now],
  );
  return Number(row?.transfer_retry_attempt ?? 1);
}

async function failSeedanceArtifactStorageAfterRetryLimit(
  db: SqlDatabase,
  input: {
    row: SeedanceTaskRow;
    transferFailureCode: string;
    transferRetryAttempt: number;
    errorMessage: string;
    storageObjectKey: string | null;
    now: Date;
  },
) {
  if (input.row.attempt_id) {
    await finalizeTaskAttempt(db, {
      taskId: input.row.task_id,
      attemptId: input.row.attempt_id,
      status: "manual_review_required",
      failureCode: SEEDANCE_ARTIFACT_STORAGE_FAILURE_CODE,
      now: input.now,
    });
    await aggregateWorkflowStatus(db, input.row.workflow_id);
  }
  const amount = Number(input.row.amount_reserved ?? 0);
  if (input.row.reservation_id && amount > 0) {
    await settleReservationAllocation(db, {
      reservationId: input.row.reservation_id,
      allocationKey: SEEDANCE_ARTIFACT_STORAGE_FAILURE_CODE,
      amount,
      outcome: "manual_review_required",
      taskId: input.row.task_id,
      attemptId: input.row.attempt_id,
      providerRequestId: input.row.provider_request_id,
      metadata: {
        transferFailureCode: input.transferFailureCode,
        transferRetryAttempt: input.transferRetryAttempt,
        transferRetryLimit: SEEDANCE_ARTIFACT_TRANSFER_RETRY_LIMIT,
      },
      now: input.now,
    });
  }
  await markGenerationTaskSnapshotManualReviewRequired(db, {
    taskId: input.row.task_id,
    attemptId: input.row.attempt_id,
    providerRequestId: input.row.provider_request_id,
    progressStage: "asset_transfer_manual_review",
    providerStatus: {
      provider: "seedance",
      externalRequestId: input.row.external_request_id,
      transferStatus: "storage_failed",
      transferFailureCode: input.transferFailureCode,
      transferRetryAttempt: input.transferRetryAttempt,
      transferRetryLimit: SEEDANCE_ARTIFACT_TRANSFER_RETRY_LIMIT,
      ...(input.storageObjectKey ? { storageObjectKey: input.storageObjectKey } : {}),
    },
    failure: {
      failureCode: SEEDANCE_ARTIFACT_STORAGE_FAILURE_CODE,
      transferFailureCode: input.transferFailureCode,
      transferRetryAttempt: input.transferRetryAttempt,
      transferRetryLimit: SEEDANCE_ARTIFACT_TRANSFER_RETRY_LIMIT,
      displayMessage: "存储失败，等待人工处理。",
      errorMessage: input.errorMessage,
    },
    creditSummary: {
      reserved: amount,
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });
  await markAssetConversationGenerationTerminal(db, {
    taskId: input.row.task_id,
    status: "manual_review_required",
    failureCode: SEEDANCE_ARTIFACT_STORAGE_FAILURE_CODE,
    noticeType: "admin_action_required",
    now: input.now,
  });
}

async function findSeedancePollTimeoutRecoveryTask(
  db: SqlDatabase,
  taskId: string,
) {
  return queryOne<SeedancePollTimeoutRecoveryRow>(
    db,
    `
      SELECT
        task.id AS task_id,
        task.task_type,
        task.status AS task_status,
        task.failure_code,
        task.workflow_id,
        task.current_attempt_id AS attempt_id,
        workflow.created_by_user_id AS user_id,
        task.project_id,
        task.input_snapshot_json,
        workflow.created_by_user_id,
        attempt.status AS attempt_status,
        attempt.failure_code AS attempt_failure_code,
        request.id AS provider_request_id,
        request.status AS provider_status,
        request.external_request_id,
        request.response_redacted_json AS provider_response_redacted_json,
        reservation.id AS reservation_id,
        reservation.status AS reservation_status,
        reservation.amount_total,
        reservation.amount_reserved,
        reservation.amount_consumed,
        reservation.amount_released,
        snapshot.status AS snapshot_status,
        snapshot.result_assets_json,
        (
          SELECT count(*)::int
          FROM asset_versions version
          WHERE version.source_task_id = task.id
        ) AS recovered_asset_count
      FROM tasks task
      JOIN workflows workflow ON workflow.id = task.workflow_id
      LEFT JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
      LEFT JOIN LATERAL (
        SELECT provider.*
        FROM provider_requests provider
        WHERE provider.task_id = task.id
          AND (
            provider.attempt_id = task.current_attempt_id
            OR (provider.attempt_id IS NULL AND task.attempt_count = 1)
          )
        ORDER BY provider.created_at DESC, provider.id DESC
        LIMIT 1
      ) request ON true
      LEFT JOIN generation_task_credit_reservations reservation ON reservation.task_id = task.id
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
      WHERE task.id = $1
        AND task.task_type = 'episode_generate_video'
        AND task.input_snapshot_json->>'providerExecutor' IN ('seedance', 'globalaiopc-video')
      LIMIT 1
    `,
    [taskId],
  );
}

function isSeedancePollTimeoutRecoveryComplete(row: SeedancePollTimeoutRecoveryRow) {
  return row.task_status === "succeeded"
    && row.attempt_status === "succeeded"
    && row.provider_status === "succeeded"
    && row.snapshot_status === "succeeded"
    && (
      Number(row.recovered_asset_count ?? 0) > 0
      || parseResultAssets(row.result_assets_json).length > 0
    );
}

function isSeedancePollTimeoutRecoveryCandidate(row: SeedancePollTimeoutRecoveryRow) {
  const initialFailure = row.task_status === "failed"
    && row.failure_code === "provider_poll_timeout"
    && row.attempt_status === "failed"
    && row.attempt_failure_code === "provider_poll_timeout";
  const providerResponse = parseProviderResponse(row.provider_response_redacted_json);
  const missingResultUrlFailure = row.task_status === "failed"
    && row.failure_code === "provider_failed"
    && row.attempt_status === "failed"
    && row.attempt_failure_code === "provider_failed"
    && row.provider_status === "failed"
    && ["succeeded", "success", "completed", "done", "finished"].includes(
      readString(providerResponse.providerStatus)?.toLowerCase() ?? "",
    )
    && readString(providerResponse.providerMessage) === "provider_succeeded_without_video_url";
  const interruptedRecovery = row.task_status === "running"
    && row.failure_code === "provider_poll_timeout_recovery"
    && row.attempt_status === "running";
  const amountTotal = Number(row.amount_total ?? 0);
  return (initialFailure || missingResultUrlFailure || interruptedRecovery)
    && Boolean(row.attempt_id && row.provider_request_id && row.external_request_id && row.reservation_id)
    && row.reservation_status === "released"
    && Number(row.amount_reserved ?? 0) === 0
    && Number(row.amount_consumed ?? 0) === 0
    && amountTotal > 0
    && Number(row.amount_released ?? 0) >= amountTotal;
}

function seedanceProviderResultRecoveryReason(row: SeedancePollTimeoutRecoveryRow) {
  const recordedReason = readString(
    parseProviderResponse(row.provider_response_redacted_json).recoveryReason,
  );
  if (recordedReason === "provider_result_url_recovered") return recordedReason;
  return row.failure_code === "provider_failed"
    ? "provider_result_url_recovered"
    : "provider_completed_after_timeout";
}

async function claimSeedancePollTimeoutRecovery(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId: string;
    providerRequestId: string;
    initialFailureCode: string;
    providerResponse: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const claimed = await queryOne<{ workflow_id: string }>(
      db,
      `
        UPDATE tasks
        SET status = 'running',
            failure_code = 'provider_poll_timeout_recovery',
            locked_by = 'seedance-video-timeout-recovery',
            locked_until = $3,
            heartbeat_at = $4,
            updated_at = $4
        WHERE id = $1
          AND current_attempt_id = $2
          AND (
            (status = 'failed' AND failure_code = $5)
            OR (
              status = 'running'
              AND failure_code = 'provider_poll_timeout_recovery'
              AND (locked_until IS NULL OR locked_until <= $4)
            )
          )
          AND EXISTS (
            SELECT 1
            FROM credit_reservations reservation
            WHERE reservation.task_id = tasks.id
              AND reservation.status = 'released'
              AND reservation.amount_reserved = 0
              AND reservation.amount_consumed = 0
              AND reservation.amount_released >= reservation.amount_total
          )
        RETURNING workflow_id
      `,
      [input.taskId, input.attemptId, seedanceVideoLeaseUntil(input.now), input.now, input.initialFailureCode],
    );
    if (!claimed) {
      await db.query("ROLLBACK");
      return false;
    }
    const attempt = await queryOne<{ id: string }>(
      db,
      `
        UPDATE task_attempts
        SET status = 'running',
            failure_code = NULL,
            finished_at = NULL,
            locked_by = 'seedance-video-timeout-recovery',
            locked_until = $3,
            heartbeat_at = $4,
            updated_at = $4
        WHERE id = $1
          AND task_id = $2
          AND status IN ('failed', 'running')
        RETURNING id
      `,
      [input.attemptId, input.taskId, seedanceVideoLeaseUntil(input.now), input.now],
    );
    if (!attempt) throw new Error("seedance_timeout_recovery_attempt_conflict");
    const provider = await queryOne<{ id: string }>(
      db,
      `
        UPDATE provider_requests
        SET status = 'succeeded',
            response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb) || $2::jsonb,
            failure_code = NULL,
            next_poll_at = NULL,
            updated_at = $3
        WHERE id = $1
          AND task_id = $4
          AND external_request_id IS NOT NULL
          AND status IN ('failed', 'succeeded')
        RETURNING id
      `,
      [input.providerRequestId, JSON.stringify(input.providerResponse), input.now, input.taskId],
    );
    if (!provider) throw new Error("seedance_timeout_recovery_provider_conflict");
    await db.query(
      `
        UPDATE workflows
        SET status = 'running', finished_at = NULL, updated_at = $2
        WHERE id = $1
      `,
      [claimed.workflow_id, input.now],
    );
    await db.query(
      `
        UPDATE ai_generation_task_snapshots
        SET status = 'running',
            progress_stage = 'recovering_provider_result',
            provider_status_json = $2::jsonb,
            task_center_diagnostics_json = COALESCE($3::jsonb, '{}'::jsonb),
            failure_json = NULL,
            failed_at = NULL,
            updated_at = $4
        WHERE task_id = $1
          AND status IN ('failed', 'running')
      `,
      [
        input.taskId,
        serializeGenerationProviderStatus(input.providerResponse),
        serializeGenerationTaskCenterProviderDiagnostics(input.providerResponse),
        input.now,
      ],
    );
    await db.query("COMMIT");
    return true;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function markSeedancePollTimeoutRecoverySnapshotSucceeded(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId: string;
    providerRequestId: string;
    resultAsset: Record<string, unknown>;
    releasedAmount: number;
    externalRequestId: string;
    recoveryReason: string;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'succeeded',
          progress_stage = 'completed',
          progress_percent = 100,
          attempt_id = $2,
          provider_request_id = $3,
          provider_status_json = $4::jsonb,
          result_assets_json = $5::jsonb,
          failure_json = NULL,
          credit_status = 'released',
          credit_summary_json = $6::jsonb,
          completed_at = $7,
          failed_at = NULL,
          updated_at = $7
      WHERE task_id = $1
    `,
    [
      input.taskId,
      input.attemptId,
      input.providerRequestId,
      JSON.stringify({
        provider: "model-gateway",
        externalRequestId: input.externalRequestId,
        recoveryReason: input.recoveryReason,
      }),
      JSON.stringify([input.resultAsset]),
      JSON.stringify({
        released: input.releasedAmount,
        consumed: 0,
        recoveryCharge: 0,
        recoveryReason: input.recoveryReason,
        settledAt: input.now.toISOString(),
      }),
      input.now,
    ],
  );
}

function parseResultAssets(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findAttemptScopedSeedanceTaskForFinalize(
  db: SqlDatabase,
  input: { taskId: string; expectedAttemptId?: string | null },
) {
  return findSeedanceTaskForFinalize(
    db, input.taskId,
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"), input.expectedAttemptId ?? null,
  );
}

async function findSeedanceTaskForFinalize(
  db: SqlDatabase, taskId: string, enforceExpectedAttempt = false, expectedAttemptId: string | null = null,
) {
  return queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.status AS task_status,
        t.workflow_id,
        COALESCE(t.current_attempt_id, pr.attempt_id) AS attempt_id,
        t.current_attempt_id,
        pr.attempt_id AS provider_attempt_id,
        w.created_by_user_id AS user_id,
        t.project_id,
        t.input_snapshot_json,
        w.created_by_user_id,
        pr.id AS provider_request_id,
        pr.external_request_id,
        pr.response_redacted_json AS provider_response_redacted_json,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      JOIN workflows w
        ON w.id = t.workflow_id
      LEFT JOIN provider_requests pr
        ON pr.task_id = t.id
       AND (
         pr.attempt_id = t.current_attempt_id
         OR (pr.attempt_id IS NULL AND t.attempt_count = 1)
       )
       AND pr.status = 'succeeded'
      LEFT JOIN generation_task_credit_reservations r
        ON r.task_id = t.id
      WHERE t.id = $1
        AND (
          $2::boolean = false
          OR ($3::uuid IS NOT NULL AND t.current_attempt_id = $3)
          OR ($3::uuid IS NULL AND t.attempt_count = 1)
        )
        AND t.task_type = 'episode_generate_video'
        AND t.status IN ('running', 'manual_review_required', 'result_unknown')
        AND NOT (
          t.status = 'manual_review_required'
          AND t.failure_code = 'provider_output_storage_failed'
        )
        AND t.input_snapshot_json->>'providerExecutor' IN ('seedance', 'globalaiopc-video')
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId, enforceExpectedAttempt, expectedAttemptId],
  );
}

async function ensureSeedanceFinalizeAttempt(
  db: SqlDatabase,
  input: {
    row: SeedanceTaskRow;
    now: Date;
    workerId: string;
  },
): Promise<SeedanceTaskRow> {
  if (
    input.row.current_attempt_id
    && input.row.provider_attempt_id
    && input.row.current_attempt_id !== input.row.provider_attempt_id
  ) {
    return { ...input.row, attempt_id: null };
  }
  if (input.row.attempt_id) {
    if (!input.row.current_attempt_id) {
      const attached = await queryOne<{ current_attempt_id: string; task_status: string }>(
        db,
        `
          UPDATE tasks
          SET current_attempt_id = $2,
              status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
              locked_by = COALESCE(locked_by, $5),
              locked_until = COALESCE(locked_until, $3),
              heartbeat_at = COALESCE(heartbeat_at, $4),
              updated_at = $4
          WHERE id = $1
            AND current_attempt_id IS NULL
            AND status IN ('queued', 'running')
          RETURNING current_attempt_id, status AS task_status
        `,
        [
          input.row.task_id,
          input.row.attempt_id,
          seedanceVideoLeaseUntil(input.now),
          input.now,
          input.workerId,
        ],
      );
      if (!attached) return { ...input.row, attempt_id: null };
      return {
        ...input.row,
        current_attempt_id: attached.current_attempt_id,
        task_status: attached.task_status,
      };
    }
    return input.row;
  }

  if (input.row.task_status !== "queued") {
    return input.row;
  }

  const claim = await claimQueuedTask(db, {
    taskId: input.row.task_id,
    workerId: input.workerId,
    now: input.now,
    leaseMs: SEEDANCE_VIDEO_TASK_LEASE_MS,
  });
  if (!claim) {
    return input.row;
  }

  if (input.row.provider_request_id) {
    await db.query(
      `
        UPDATE provider_requests
        SET attempt_id = $2,
            updated_at = $3
        WHERE id = $1
          AND attempt_id IS NULL
      `,
      [input.row.provider_request_id, claim.attempt.id, input.now],
    );
  }

  return {
    ...input.row,
    attempt_id: claim.attempt.id,
    current_attempt_id: claim.attempt.id,
    provider_attempt_id: input.row.provider_attempt_id ?? claim.attempt.id,
    task_status: "running",
  };
}

function findAttemptScopedSeedanceTaskForPersist(
  db: SqlDatabase,
  input: { taskId: string; expectedAttemptId?: string | null },
) {
  return findSeedanceTaskForPersist(
    db, input.taskId,
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"), input.expectedAttemptId ?? null,
  );
}

async function findSeedanceTaskForPersist(
  db: SqlDatabase, taskId: string, enforceExpectedAttempt = false, expectedAttemptId: string | null = null,
) {
  return queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        w.created_by_user_id AS user_id,
        t.project_id,
        t.input_snapshot_json,
        w.created_by_user_id,
        pr.id AS provider_request_id,
        pr.external_request_id,
        pr.response_redacted_json AS provider_response_redacted_json,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      JOIN workflows w
        ON w.id = t.workflow_id
      LEFT JOIN provider_requests pr
        ON pr.task_id = t.id
       AND (
         pr.attempt_id = t.current_attempt_id
         OR (pr.attempt_id IS NULL AND t.attempt_count = 1)
       )
      LEFT JOIN generation_task_credit_reservations r
        ON r.task_id = t.id
      WHERE t.id = $1
        AND (
          $2::boolean = false
          OR ($3::uuid IS NOT NULL AND t.current_attempt_id = $3)
          OR ($3::uuid IS NULL AND t.attempt_count = 1)
        )
        AND t.task_type = 'episode_generate_video'
        AND (
          t.status IN ('running', 'result_unknown')
          OR (
            t.status = 'manual_review_required'
            AND t.failure_code IN ('provider_output_persist_failed', 'generation_queue_error')
          )
        )
        AND t.input_snapshot_json->>'providerExecutor' IN ('seedance', 'globalaiopc-video')
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId, enforceExpectedAttempt, expectedAttemptId],
  );
}

async function persistSeedanceVideoArtifact(
  db: SqlDatabase,
  input: {
    row: SeedanceTaskRow;
    snapshot: Record<string, unknown>;
    videoUrl: string;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    fetchOnly?: boolean;
    now: Date;
  },
) {
  const artifactMetadata = {
    episodeId: readString(input.snapshot.episodeId) ?? null,
    taskId: input.row.task_id,
    attemptId: input.row.attempt_id,
    mediaType: "video",
    provider: "model-gateway",
    externalRequestId: input.row.external_request_id,
  };
  let pendingStorageObjectId: string | null = null;
  let pendingStorageObjectKey: string | null = null;
  try {
    const objectName = `episodes/${readString(input.snapshot.episodeId) || input.row.task_id}/seedance/seedance-video-${input.row.task_id}.mp4`;
    const downloadInit = await buildProviderArtifactDownloadInit(db, {
      snapshot: input.snapshot,
      artifactUrl: input.videoUrl,
      env: input.env,
    });
    const uploaded = await uploadProviderArtifactToStorage(db, {
      artifactUrl: input.videoUrl,
      downloadInit,
      objectName,
      projectId: input.row.project_id,
      canvasProjectId: readString(input.snapshot.canvasProjectId) ?? null,
      runtime: input.runtime,
      metadata: artifactMetadata,
      env: input.env,
      fetchImpl: input.fetchImpl,
      createdByUserId: input.row.created_by_user_id,
      now: input.now,
    });
    pendingStorageObjectId = uploaded.storageObject.id;
    pendingStorageObjectKey = uploaded.storageObject.objectKey;
    const available = await markStorageObjectAvailable(db, {
      storageObjectId: uploaded.storageObject.id,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      checksum: uploaded.checksum,
      eTag: uploaded.uploadResult?.eTag ?? null,
      versionId: uploaded.uploadResult?.versionId ?? null,
      metadata: artifactMetadata,
      now: input.now,
    });
    if (!available) {
      throw Object.assign(new Error("seedance_storage_object_missing_after_upload"), {
        failureCode: "provider_output_persist_failed",
        storageObjectKey: uploaded.storageObject.objectKey,
      });
    }

    const platformUrl = buildPlatformStorageUrl(input.runtime, available);
    if (input.fetchOnly) {
      return {
        assetId: null,
        assetVersionId: null,
        storageObjectId: available.id,
        storageObjectKey: available.objectKey,
        mediaKind: "video",
        mimeType: uploaded.contentType,
        url: platformUrl,
        previewUrl: platformUrl,
        sourceUrl: platformUrl,
        downloadUrl: platformUrl,
      };
    }
    const created = input.row.project_id
      ? await createAssetVersionSnapshot(db, {
          userId: input.row.created_by_user_id ?? input.row.user_id,
          projectId: input.row.project_id,
          assetType: "shot_video",
          assetKey: `video:${readString(input.snapshot.episodeId) || input.row.project_id}:${input.row.task_id}`,
          createdByUserId: input.row.created_by_user_id,
          storageObjectId: available.id,
          storageObjectKey: available.objectKey,
          metadata: {
            mimeType: uploaded.contentType,
            label: "Seedance episode video",
            episodeId: readString(input.snapshot.episodeId) ?? null,
            taskId: input.row.task_id,
            targetType: readString(input.snapshot.targetType) ?? "episode",
            targetId: readString(input.snapshot.targetId) ?? readString(input.snapshot.episodeId) ?? null,
            previewUrl: platformUrl,
            sourceUrl: platformUrl,
            downloadUrl: platformUrl,
            provider: "model-gateway",
            externalRequestId: input.row.external_request_id,
          },
          sourceTaskId: input.row.task_id,
          sourceAttemptId: input.row.attempt_id,
          now: input.now,
        })
      : null;
    return {
      assetId: created?.asset.id ?? null,
      assetVersionId: created?.version.id ?? null,
      storageObjectId: available.id,
      storageObjectKey: available.objectKey,
      mediaKind: "video",
      mimeType: uploaded.contentType,
      url: platformUrl,
      previewUrl: platformUrl,
      sourceUrl: platformUrl,
      downloadUrl: platformUrl,
    };
  } catch (error) {
    const storageObjectId = pendingStorageObjectId ?? readErrorStorageObjectId(error);
    let failureCode = readErrorFailureCode(error);
    if (pendingStorageObjectKey && failureCode !== "provider_output_download_failed" && failureCode !== "provider_output_upload_failed") {
      Object.assign(error as object, {
        failureCode: "provider_output_persist_failed",
        storageObjectKey: pendingStorageObjectKey,
      });
      failureCode = "provider_output_persist_failed";
    }
    if (storageObjectId && failureCode !== "provider_output_persist_failed") {
      await markStorageObjectFailed(db, {
        storageObjectId,
        status: "failed",
        now: input.now,
      });
    }
    throw error;
  }
}

async function uploadProviderArtifactToStorage(
  db: SqlDatabase,
  input: {
    artifactUrl: string;
    downloadInit?: RequestInit;
    objectName: string;
    projectId: string | null;
    canvasProjectId?: string | null;
    runtime: UploadSessionRuntime;
    metadata: Record<string, unknown>;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<{
  storageObject: StorageObjectRecord;
  contentType: string;
  sizeBytes: number | null;
  checksum: string;
  uploadResult?: { eTag?: string | null; versionId?: string | null };
}> {
  const { retryAttempts, retryDelayMs, downloadTimeoutMs, uploadTimeoutMs } = readGenerationArtifactUploadConfig(input.env);
  let storageObject: StorageObjectRecord | null = await findGenerationStorageObject(db, {
    userId: input.createdByUserId!,
    bucket: input.runtime.bucket,
    taskId: String(input.metadata.taskId),
    attemptId: readString(input.metadata.attemptId) ?? null,
  }) ?? null;
  let contentType = "application/octet-stream";
  let knownSizeBytes: number | null = null;

  if (storageObject) {
    const reusable = await findReusableSeedanceStorageObject(input.runtime, storageObject);
    if (reusable) {
      return {
        storageObject,
        contentType: reusable.contentType,
        sizeBytes: reusable.sizeBytes,
        checksum: reusable.checksum,
      };
    }
  }

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), downloadTimeoutMs);
    let response: Response | null = null;
    let sourceStream: Readable | null = null;
    let uploadStream: Transform | null = null;
    let sourceDownloadError: unknown = null;
    let countedSizeBytes = 0;
    const checksum = createHash("sha256");
    try {
      response = await fetchProviderArtifactSafely(input.artifactUrl, {
        ...input.downloadInit,
        signal: abortController.signal,
      }, input.fetchImpl);
      if (!response.ok || !response.body) {
        throw Object.assign(new Error(`provider_artifact_download_${response.status}`), {
          failureCode: "provider_output_download_failed",
          storageObjectId: storageObject?.id,
        });
      }
      contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || contentType;
      knownSizeBytes = parseContentLength(response.headers.get("content-length"));
      if (!storageObject) {
        storageObject = await createOrReuseGenerationStorageObject(db, {
          userId: input.createdByUserId!,
          projectId: input.projectId,
          canvasProjectId: input.canvasProjectId ?? null,
          bucket: input.runtime.bucket,
          objectName: normalizeVideoArtifactObjectName(input.objectName, contentType),
          contentType,
          sizeBytes: knownSizeBytes,
          provider: input.runtime.provider,
          status: "pending_upload",
          metadata: input.metadata as Record<string, unknown> & { taskId: string; attemptId: string | null },
          createdByUserId: input.createdByUserId ?? null,
          now: input.now,
        });
      }
      sourceStream = Readable.fromWeb(response.body as never);
      uploadStream = new Transform({
        transform(chunk: Buffer | Uint8Array | string, _encoding, callback) {
          countedSizeBytes += Buffer.byteLength(chunk);
          checksum.update(chunk);
          callback(null, chunk);
        },
      });
      sourceStream.once("error", (error) => {
        sourceDownloadError = error;
      });
      if (typeof input.runtime.adapter.putObject !== "function") {
        throw new Error("storage_put_object_required");
      }
      // Keep the provider download pipeline and storage upload in one Promise
      // chain. This prevents a late source/transform error from escaping the
      // finalize job after the storage adapter has returned.
      const pipelinePromise = pipeline(sourceStream, uploadStream);
      const [uploadResult] = await Promise.all([
        input.runtime.adapter.putObject({
          bucket: storageObject.bucket,
          objectKey: storageObject.objectKey,
          body: uploadStream,
          contentType,
          contentLength: knownSizeBytes,
          timeoutMs: uploadTimeoutMs,
        }),
        pipelinePromise,
      ]);
      return {
        storageObject,
        contentType,
        sizeBytes: knownSizeBytes ?? countedSizeBytes,
        checksum: checksum.digest("hex"),
        uploadResult,
      };
    } catch (error) {
      const failureCode = sourceDownloadError
        || !response
        || readErrorFailureCode(error) === "provider_output_download_failed"
        ? "provider_output_download_failed"
        : "provider_output_upload_failed";
      if (attempt >= retryAttempts) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          failureCode,
          storageObjectId: storageObject?.id,
        });
      }
      await delay(retryDelayMs);
    } finally {
      clearTimeout(timeout);
      sourceStream?.destroy();
      uploadStream?.destroy();
      if (!sourceStream) {
        await response?.body?.cancel().catch(() => undefined);
      }
    }
  }

  throw Object.assign(new Error("provider_artifact_upload_retry_exhausted"), {
    failureCode: "provider_output_upload_failed",
    storageObjectId: storageObject?.id,
  });
}

async function findReusableSeedanceStorageObject(
  runtime: UploadSessionRuntime,
  storageObject: StorageObjectRecord,
) {
  if (typeof runtime.adapter.headObject !== "function") {
    const sizeBytes = Number(storageObject.sizeBytes ?? 0);
    const checksum = storageObject.checksum ?? "";
    return storageObject.status === "available" && Number.isFinite(sizeBytes) && sizeBytes > 0
      && /^[a-fA-F0-9]{64}$/.test(checksum)
      ? { contentType: storageObject.contentType, sizeBytes, checksum }
      : null;
  }
  const remote = await runtime.adapter.headObject({
    bucket: storageObject.bucket,
    objectKey: storageObject.objectKey,
  });
  if (!remote.exists) return null;
  const sizeBytes = Number(remote.contentLength ?? storageObject.sizeBytes ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || !/^[a-fA-F0-9]{64}$/.test(storageObject.checksum ?? "")) return null;
  return {
    contentType: readString(remote.contentType) ?? storageObject.contentType,
    sizeBytes,
    checksum: storageObject.checksum!,
  };
}

async function failSeedanceTask(
  db: SqlDatabase,
  input: {
    row: SeedanceTaskRow;
    failureCode: string;
    providerRequestId: string | null;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
) {
  const snapshot = parseSnapshot(input.row.input_snapshot_json);
  const amount = resolveGenerationBillingAmount(input.row.amount_reserved, snapshot);
  const settleCredits = async (inTransaction: boolean) => {
    if (input.row.reservation_id && amount > 0) {
      await reopenManualReviewReservationForSettlement(db, {
        reservationId: input.row.reservation_id,
        now: input.now,
      });
      const settle = inTransaction
        ? settleReservationAllocationInTransaction
        : settleReservationAllocation;
      await settle(db, {
        reservationId: input.row.reservation_id,
        allocationKey: input.failureCode,
        amount,
        outcome: "released",
        taskId: input.row.task_id,
        attemptId: input.row.attempt_id,
        providerRequestId: input.providerRequestId,
        metadata: input.redactedResponse,
        now: input.now,
      });
    }
    if (!input.row.reservation_id && amount > 0) {
      const memberId = readSnapshotTeamMemberId(snapshot);
      if (memberId) {
        const refund = inTransaction
          ? refundTeamMemberGenerationCreditsInTransaction
          : refundTeamMemberGenerationCredits;
        await refund(db, {
          teamMemberId: memberId,
          amount,
          sourceId: input.row.task_id,
          reason: "生成失败返还积分",
          metadata: input.redactedResponse,
          now: input.now,
        });
      }
    }
  };
  if (input.row.attempt_id) {
    await finalizeTaskAttempt(db, {
      taskId: input.row.task_id,
      attemptId: input.row.attempt_id,
      status: "failed",
      failureCode: input.failureCode,
      now: input.now,
      finalize: async () => settleCredits(true),
    });
    await aggregateWorkflowStatus(db, input.row.workflow_id);
  } else {
    await db.query("BEGIN");
    try {
      const failed = await queryOne<{ id: string }>(db, `
        UPDATE tasks
        SET status = 'failed',
            failure_code = $2,
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            updated_at = $3
        WHERE id = $1
          AND current_attempt_id IS NULL
          AND status IN ('queued', 'running', 'result_unknown')
        RETURNING id
      `, [input.row.task_id, input.failureCode, input.now]);
      if (!failed) {
        await db.query("COMMIT");
        return false;
      }
      await settleCredits(true);
      await aggregateWorkflowStatus(db, input.row.workflow_id);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
  await markAssetConversationGenerationTerminal(db, {
    taskId: input.row.task_id,
    status: "failed",
    failureCode: input.failureCode,
    noticeType: "error",
    now: input.now,
  });
  return true;
}

async function buildProviderArtifactDownloadInit(
  db: SqlDatabase,
  input: {
    snapshot: Record<string, unknown>;
    artifactUrl: string;
    env: NodeJS.ProcessEnv;
  },
): Promise<RequestInit | undefined> {
  const modelCode = readString(input.snapshot.model);
  const modelConfig = modelCode
    ? await resolveGenerationModelConfigForTask(db, input.snapshot, modelCode)
    : null;
  if (!isLingdongContentEndpoint(input.artifactUrl)) {
    return undefined;
  }
  return buildLingdongArtifactDownloadInit(modelConfig, input.artifactUrl, input.env);
}

export function buildLingdongArtifactDownloadInit(
  modelConfig: AiModelConfigRecord | null | undefined,
  artifactUrl: string,
  env: NodeJS.ProcessEnv,
): RequestInit | undefined {
  if (!isLingdongContentEndpoint(artifactUrl) || !isLingdongModelConfig(modelConfig)) {
    return undefined;
  }
  return {
    headers: {
      authorization: `Bearer ${resolveProviderApiKeyForDownload(modelConfig.providerConfig, env)}`,
    },
  };
}

function isLingdongModelConfig(modelConfig: AiModelConfigRecord | null | undefined) {
  if (!modelConfig) {
    return false;
  }
  return (
    modelConfig.providerProtocol === "lingdong_api" ||
    readString(modelConfig.providerConfig.requestFormat) === "lingdong_video" ||
    /lingdong|灵动/i.test(modelConfig.providerName)
  );
}

function isLingdongContentEndpoint(value: string) {
  try {
    const url = new URL(value);
    return /(^|\.)lingdongapi\.com$/i.test(url.hostname) && /^\/v1\/videos\/[^/]+\/content$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function redactProviderArtifactAuditUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[redacted-url]";
  }
}

function normalizeVideoArtifactObjectName(objectName: string, contentType: string) {
  const extension = contentType.toLowerCase() === "video/quicktime" ? "mov"
    : contentType.toLowerCase() === "video/mp4" ? "mp4"
      : null;
  return extension ? objectName.replace(/\.(?:mp4|mov)$/i, `.${extension}`) : objectName;
}

function resolveProviderApiKeyForDownload(providerConfig: Record<string, unknown>, env: NodeJS.ProcessEnv) {
  const directApiKey = readString(providerConfig.apiKey);
  if (directApiKey) {
    return directApiKey;
  }
  const apiKeyEnv = readString(providerConfig.apiKeyEnv);
  if (!apiKeyEnv) {
    throw Object.assign(new Error("provider_api_key_env_required"), {
      failureCode: "provider_api_key_env_required",
      apiKeyEnv: "",
    });
  }
  const apiKey = env[apiKeyEnv]?.trim();
  if (!apiKey) {
    throw Object.assign(new Error("provider_api_key_missing"), {
      failureCode: "provider_api_key_missing",
      apiKeyEnv,
    });
  }
  return apiKey;
}

function parseProviderResponse(value: Record<string, unknown> | string | null | undefined) {
  if (!value) {
    return {};
  }
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildProviderPollPayload(
  snapshot: Record<string, unknown>,
  providerResponse: Record<string, unknown> | string | null | undefined,
) {
  const providerResponseRedacted = parseProviderResponse(providerResponse);
  return Object.keys(providerResponseRedacted).length > 0
    ? { ...snapshot, providerResponseRedacted }
    : snapshot;
}

async function resolveSeedanceArtifactUrlForTransfer(
  db: SqlDatabase,
  row: SeedanceTaskRow,
  snapshot: Record<string, unknown>,
  input: { env: NodeJS.ProcessEnv; fetchImpl?: typeof fetch },
) {
  const providerResponse = parseProviderResponse(row.provider_response_redacted_json);
  const recordedVideoUrl = readString(providerResponse.videoUrl);
  if (providerResponse.artifactUrlRequiresRefresh !== true) {
    return recordedVideoUrl;
  }
  if (!row.external_request_id) return undefined;
  const modelCode = readString(snapshot.model) || "seedance-i2v-pro";
  const modelConfig = await resolveGenerationModelConfigForTask(db, snapshot, modelCode);
  const adapter = createProviderAdapterFromModelConfig(
    modelConfig
      ? {
          providerProtocol: modelConfig.providerProtocol,
          providerModel: modelConfig.providerModel,
          mediaType: modelConfig.mediaType,
          providerConfig: modelConfig.providerConfig,
          invocationMode: modelConfig.invocationMode,
        }
      : fallbackSeedanceModelConfig(input.env),
    input.env,
    resolveGenerationProviderFetch(input.fetchImpl, "video", input.env),
  ) as unknown as SeedancePollAdapter;
  const refreshed = await adapter.poll({
    externalRequestId: row.external_request_id,
    redactedPayload: buildProviderPollPayload(snapshot, row.provider_response_redacted_json),
  });
  return refreshed.status === "succeeded" ? readString(refreshed.videoUrl) : undefined;
}

function readProviderRedactedRequest(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  return readRecord((error as { providerRedactedRequest?: unknown }).providerRedactedRequest);
}

function readSubmittedRedactedRequest(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return readRecord((value as { redactedRequest?: unknown }).redactedRequest);
}

function readProviderResponseRedactedRequest(
  value: Record<string, unknown> | string | null | undefined,
) {
  const response = parseProviderResponse(value);
  return readRecord(response.redactedRequest ?? response.providerRedactedRequest);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

type SeedanceRequestBodyForLog = {
  prompt: string;
  motionPrompt: string;
  firstFrameUrl?: string;
  parameters: Record<string, unknown>;
  episodeId?: string;
  targetType: string;
  targetId?: string;
};

export function buildSeedanceUserModelRequestLogBody(
  requestBody: SeedanceRequestBodyForLog,
  input: {
    providerName: string;
    providerProtocol?: string | null;
    providerModel?: string | null;
    providerConfig?: Record<string, unknown>;
  },
) {
  if (input.providerProtocol === "san_bao") {
    const providerBody = buildSanBaoVideoPayload({
      providerRequestId: "request-log-preview",
      providerName: input.providerName,
      providerOperation: operationNames.episodeVideoGenerate,
      requestKey: "request-log-preview",
      payloadRef: "request-log-preview",
      payloadHash: "request-log-preview",
      redactedPayload: requestBody,
    }, input.providerModel?.trim() || undefined);
    return {
      requestFormat: "san_bao_video",
      requestBody: providerBody,
      requestText: JSON.stringify(providerBody, null, 2),
    };
  }
  if (
    input.providerProtocol === "lingdong_api" ||
    readString(input.providerConfig?.requestFormat) === "lingdong_video" ||
    /lingdong|灵动/i.test(input.providerName)
  ) {
    const providerBody = buildLingdongVideoPayload({
      providerRequestId: "request-log-preview",
      providerName: input.providerName,
      providerOperation: operationNames.episodeVideoGenerate,
      requestKey: "request-log-preview",
      payloadRef: "request-log-preview",
      payloadHash: "request-log-preview",
      redactedPayload: requestBody,
    }, input.providerModel?.trim() || undefined);
    return {
      requestFormat: "lingdong_video",
      requestBody: providerBody,
      requestText: JSON.stringify(providerBody, null, 2),
    };
  }
  return {
    requestFormat: undefined,
    requestBody,
    requestText: buildSeedanceRequestText(requestBody),
  };
}

function buildSeedanceRequestText(requestBody: SeedanceRequestBodyForLog) {
  const parts = [
    `prompt: ${requestBody.prompt || requestBody.motionPrompt || "(empty)"}`,
    `targetType: ${requestBody.targetType}`,
  ];
  if (requestBody.targetId) {
    parts.push(`targetId: ${requestBody.targetId}`);
  }
  if (requestBody.episodeId) {
    parts.push(`episodeId: ${requestBody.episodeId}`);
  }
  if (requestBody.firstFrameUrl) {
    parts.push(`firstFrameUrl: ${requestBody.firstFrameUrl}`);
  }
  if (Object.keys(requestBody.parameters).length > 0) {
    parts.push(`parameters: ${JSON.stringify(requestBody.parameters)}`);
  }
  return parts.join("\n");
}

function buildSeedanceSuccessResponseText(input: {
  externalRequestId: string | null;
  videoUrl: string;
  providerResponse: Record<string, unknown>;
}) {
  const providerSummary = summarizeProviderResponse(input.providerResponse) ?? {};
  return JSON.stringify(
    removeUndefinedValues({
      externalRequestId: input.externalRequestId,
      videoUrl: input.videoUrl,
      ...providerSummary,
    }),
    null,
    2,
  );
}

function buildSeedanceFailureResponseText(input: {
  failureCode: string;
  errorMessage: string;
  providerResponse?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
}) {
  const providerSummary = summarizeProviderResponse(input.providerResponse) ?? {};
  return JSON.stringify(
    removeUndefinedValues({
      failureCode: input.failureCode,
      errorMessage: translateProviderErrorMessage(input.errorMessage),
      ...providerSummary,
      ...input.diagnostics,
    }),
    null,
    2,
  );
}

async function acquireSeedanceSubmitPermit(
  rateLimiter: ProviderRateLimiter | undefined,
  input: {
    providerName: string;
    modelCode: string;
    userId: string;
    userConcurrencyLimit: number;
    now: Date;
  },
): Promise<ProviderRateLimitGrant | null> {
  if (!rateLimiter) {
    return null;
  }

  return rateLimiter.acquireSubmitPermit({
    providerName: input.providerName,
    modelCode: input.modelCode,
    userId: input.userId,
    rpmLimit: SUBMIT_PROVIDER_LIMIT_BYPASS,
    providerConcurrentLimit: SUBMIT_PROVIDER_LIMIT_BYPASS,
    modelConcurrentLimit: SUBMIT_PROVIDER_LIMIT_BYPASS,
    userConcurrentLimit: input.userConcurrencyLimit,
    leaseMs: 120_000,
    now: input.now,
  });
}

async function acquireSeedancePollPermit(
  rateLimiter: ProviderRateLimiter | undefined,
  input: {
    providerName: string;
    modelCode: string;
    userId: string;
    providerRpmLimit: number;
    providerConcurrentLimit: number;
    pollingConcurrencyLimit: number;
    now: Date;
  },
): Promise<ProviderRateLimitGrant | null> {
  if (!rateLimiter) {
    return null;
  }

  return rateLimiter.acquirePollPermit({
    providerName: input.providerName,
    modelCode: input.modelCode,
    userId: input.userId,
    rpmLimit: input.providerRpmLimit,
    providerConcurrentLimit: input.providerConcurrentLimit,
    modelConcurrentLimit: input.pollingConcurrencyLimit,
    userConcurrentLimit: input.pollingConcurrencyLimit,
    leaseMs: 60_000,
    now: input.now,
  });
}

async function releaseProviderPermit(permit: ProviderRateLimitGrant | null) {
  if (permit?.granted && typeof permit.release === "function") {
    await permit.release();
  }
}

function fallbackSeedanceModelConfig(env: NodeJS.ProcessEnv) {
  return {
    providerProtocol: "volcengine_ark_video",
    providerModel: env.SEEDANCE_PROVIDER_MODEL?.trim() || "seedance-2-0-i2v",
    providerConfig: {
      baseURL: env.SEEDANCE_BASE_URL?.trim() || "https://ark.cn-beijing.volces.com",
      createTaskEndpoint:
        env.SEEDANCE_CREATE_TASK_ENDPOINT?.trim() || "/api/v3/contents/generations/tasks",
      queryTaskEndpoint:
        env.SEEDANCE_QUERY_TASK_ENDPOINT?.trim() || "/api/v3/contents/generations/tasks/{taskId}",
      apiKeyEnv: "VOLCENGINE_ARK_API_KEY",
    },
  };
}

function buildPlatformStorageUrl(_runtime: UploadSessionRuntime, object: StorageObjectRecord) {
  return `/api/storage/objects/${encodeURIComponent(object.id)}/content`;
}

export function readGenerationArtifactUploadConfig(env: NodeJS.ProcessEnv) {
  return {
    retryAttempts: parsePositiveInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS, 10, 10),
    retryDelayMs: parseNonNegativeInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS, 3000, 60_000),
    downloadTimeoutMs: parsePositiveInteger(
      env.VIDEO_GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS,
      30 * 60_000,
      30 * 60_000,
    ),
    uploadTimeoutMs: parsePositiveInteger(
      env.GENERATION_ARTIFACT_UPLOAD_TIMEOUT_MS,
      30 * 60_000,
      30 * 60_000,
    ),
  };
}

function buildSeedanceBillingMetadata(
  row: SeedanceTaskRow,
  snapshot: Record<string, unknown>,
  extra: {
    billingEvent: "consumed" | "released" | "manual_review_required";
    outcome: string;
    provider?: string | null;
    providerRequestId?: string | null;
    externalRequestId?: string | null;
    failureCode?: string | null;
    errorMessage?: string | null;
    storageObjectKey?: string | null;
    providerResponse?: Record<string, unknown> | null;
    settledAt: Date;
  },
) {
  const requestedAt = toIsoString(readString(snapshot.requestedAt));
  const settledAt = extra.settledAt.toISOString();
  const durationMs = requestedAt
    ? Math.max(0, new Date(settledAt).getTime() - new Date(requestedAt).getTime())
    : null;
  const prompt = readString(snapshot.prompt) ?? "";
  return removeUndefinedValues({
    billingEvent: extra.billingEvent,
    outcome: extra.outcome,
    status: extra.outcome,
    taskId: row.task_id,
    workflowId: row.workflow_id,
    projectId: row.project_id,
    episodeId: readString(snapshot.episodeId),
    mediaType: "video",
    kind: "video",
    modelCode: readString(snapshot.model),
    providerExecutor: readString(snapshot.providerExecutor),
    provider: extra.provider,
    targetType: readString(snapshot.targetType),
    targetId: readString(snapshot.targetId),
    canvasNodeId: readString(snapshot.canvasNodeId),
    amount: Number(row.amount_reserved ?? 0),
    requestedAt,
    settledAt,
    durationMs,
    attemptId: row.attempt_id,
    providerRequestId: extra.providerRequestId,
    externalRequestId: extra.externalRequestId,
    promptPreview: truncateForLedger(prompt, 180),
    promptLength: prompt.length,
    parameterSummary: summarizeGenerationParameters(readObject(snapshot.parameters)),
    firstFrameUrl: readString(snapshot.firstFrameUrl),
    failureCode: extra.failureCode,
    errorMessage: truncateForLedger(extra.errorMessage ?? "", 240),
    storageObjectKey: extra.storageObjectKey,
    providerResponse: summarizeProviderResponse(extra.providerResponse),
  });
}

function summarizeGenerationParameters(parameters: Record<string, unknown>) {
  return removeUndefinedValues({
    aspectRatio: readString(parameters.aspectRatio) ?? readString(parameters.ratio),
    resolution: readString(parameters.resolution) ?? readString(parameters.quality),
    duration: readString(parameters.duration) ?? readString(parameters.durationSeconds),
    mode: readString(parameters.mode) ?? readString(parameters.taskMode),
    referenceImages: readArray(parameters.referenceImages).length,
    referenceAssetVersionIds: readArray(parameters.referenceAssetVersionIds).length,
  });
}

function summarizeProviderResponse(response: Record<string, unknown> | null | undefined) {
  if (!response) return undefined;
  return removeUndefinedValues({
    providerStatus: readString(response.providerStatus) ?? readString(response.status),
    providerErrorCode: readString(response.providerErrorCode) ?? readString(response.errorCode),
    providerMessage: truncateForLedger(
      translateProviderErrorMessage(readString(response.providerMessage) ?? readString(response.message)),
      180,
    ),
    cancelStatus: readString(response.cancelStatus),
    cancelReason: readString(response.cancelReason),
  });
}

function truncateForLedger(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function toIsoString(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== ""),
  ) as T;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseContentLength(value: string | null) {
  if (value == null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function delay(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function findGenerationTaskSnapshotFailure(
  db: SqlDatabase,
  taskId: string,
): Promise<Record<string, unknown>> {
  const row = await queryOne<{ failure_json: Record<string, unknown> | string | null }>(
    db,
    `
      SELECT failure_json
      FROM ai_generation_task_snapshots
      WHERE task_id = $1
      LIMIT 1
    `,
    [taskId],
  );
  return row?.failure_json
    ? typeof row.failure_json === "string"
      ? JSON.parse(row.failure_json)
      : row.failure_json
    : {};
}

async function reopenManualReviewReservationForSettlement(
  db: SqlDatabase,
  input: { reservationId: string; now: Date },
) {
  await db.query(
    `
      UPDATE credit_reservations
      SET status = 'active',
          updated_at = $2
      WHERE id = $1
        AND status = 'manual_review_required'
        AND amount_reserved > 0
    `,
    [input.reservationId, input.now],
  );
}

async function writeSeedanceVideoBackToStoryboard(
  db: SqlDatabase,
  input: {
    snapshot: Record<string, unknown>;
    projectId: string | null;
    assetVersionId: string | null;
    now: Date;
  },
) {
  if (!input.assetVersionId || readString(input.snapshot.targetType) !== "storyboard" || !input.projectId) {
    return;
  }
  const storyboardId = readString(input.snapshot.targetId) ?? readString(input.snapshot.shotId);
  const episodeId = readString(input.snapshot.episodeId);
  if (!storyboardId || !episodeId) return;
  await db.query(
    `
      UPDATE shots
      SET current_video_asset_version_id = $4,
          video_status = 'completed',
          updated_at = $5
      WHERE id = $1
        AND episode_id = $2
        AND project_id = $3
    `,
    [storyboardId, episodeId, input.projectId, input.assetVersionId, input.now],
  );
}

async function isSeedanceBillingAlreadyReleasedAfterInvalidResponse(
  db: SqlDatabase,
  input: { reservationId: string; providerRequestId: string | null; amount: number },
) {
  const row = await queryOne<{
    reservation_status: string;
    amount_total: number | string;
    amount_reserved: number | string;
    amount_released: number | string;
    allocation_status: string | null;
    allocation_amount: number | string | null;
    failure_code: string | null;
    provider_status: string | null;
  }>(
    db,
    `
      SELECT
        reservation.status AS reservation_status,
        reservation.amount_total,
        reservation.amount_reserved,
        reservation.amount_released,
        allocation.status AS allocation_status,
        allocation.amount AS allocation_amount,
        allocation.metadata_json->>'failureCode' AS failure_code,
        provider.status AS provider_status
      FROM credit_reservations reservation
      LEFT JOIN credit_reservation_allocations allocation
        ON allocation.reservation_id = reservation.id
       AND allocation.status = 'released'
      LEFT JOIN provider_requests provider
        ON provider.id = $2
      WHERE reservation.id = $1
      ORDER BY allocation.updated_at DESC NULLS LAST
      LIMIT 1
    `,
    [input.reservationId, input.providerRequestId],
  );
  if (!row) return false;
  return row.reservation_status === "released"
    && Number(row.amount_total) === input.amount
    && Number(row.amount_reserved) === 0
    && Number(row.amount_released) === input.amount
    && row.allocation_status === "released"
    && Number(row.allocation_amount) === input.amount
    && row.failure_code === "san_bao_invalid_response"
    && row.provider_status === "succeeded";
}

function parseSnapshot(value: Record<string, unknown> | string) {
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function modelSignedUrlExpiresInSeconds(env: NodeJS.ProcessEnv) {
  const configured = Number(env.MODEL_SIGNED_URL_EXPIRES_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 6 * 60 * 60;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isVideoProviderExecutor(value: string | null | undefined) {
  return value === "seedance" || value === "globalaiopc-video";
}

function readErrorFailureCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const failureCode = (error as { failureCode?: unknown }).failureCode;
  if (typeof failureCode === "string" && failureCode.trim()) {
    return failureCode;
  }
  // Fall back to a structured `.code` when no `failureCode` is present. Errors
  // such as ProviderRequestConflictError historically exposed only `.code`,
  // which caused the submit path to collapse to the generic
  // "provider_submission_failed" and surface the misleading
  // "修改素材或提示词" message instead of the real pre-submission cause.
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code : undefined;
}

function isSeedancePollResultNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostics = readErrorProviderDiagnostics(error);
  return diagnostics?.httpStatus === 404 ||
    /video_provider_poll_404|seedance_video_poll_404|ResourceNotFound/i.test(message);
}

function readErrorProviderDiagnostics(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== "object") return undefined;
  const diagnostics = (error as { providerDiagnostics?: unknown }).providerDiagnostics;
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) return undefined;
  const rawResponse = readProviderRawResponse(diagnostics);
  return rawResponse === undefined
    ? diagnostics as Record<string, unknown>
    : { ...(diagnostics as Record<string, unknown>), providerRawResponse: rawResponse };
}

function readLocalErrorDiagnostics(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown };
    return {
      name: record.name,
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      message: record.message,
    };
  }
  return { message: String(error) };
}

function buildMaterialRefreshDiagnostics(input: {
  status: string;
  diagnostics: GenerationInputUrlRefreshDiagnostic[];
}) {
  return input.status === "not_requested"
    ? {}
    : {
        materialInputRefresh: {
          status: input.status,
          diagnostics: input.diagnostics,
        },
      };
}

async function appendSeedanceSubmitPreparationDiagnostics(
  db: SqlDatabase,
  taskId: string,
  localStage: string,
  error: unknown,
  now: Date,
) {
  const providerRequest = await findAnyUnstartedProviderRequestForTask(db, taskId).catch(() => undefined);
  if (!providerRequest?.provider_request_id) return;
  await appendProviderRequestDiagnostics(db, {
    providerRequestId: providerRequest.provider_request_id,
    diagnostics: {
      phase: "submit",
      localStage,
      localError: readLocalErrorDiagnostics(error),
      failureCode: readErrorFailureCode(error) ?? "provider_submission_prepare_failed",
      diagnosticNote: "供应商提交尚未开始，异常发生在提交准备阶段。",
    },
    now,
  }).catch(() => undefined);
}

async function ensureSeedanceFailedResultDiagnostics(
  db: SqlDatabase,
  input: { taskId: string; failureCode: string; now: Date },
) {
  const providerRequest = await queryOne<{
    provider_request_id: string;
    response_redacted_json: Record<string, unknown> | null;
  }>(
    db,
    `
      SELECT id AS provider_request_id, response_redacted_json
      FROM provider_requests
      WHERE task_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [input.taskId],
  ).catch(() => undefined);
  if (!providerRequest?.provider_request_id) return;
  const existingStage = providerRequest.response_redacted_json?.localStage;
  if (typeof existingStage === "string" && existingStage.trim()) return;
  const diagnostics = {
    phase: "submit",
    localStage: "submit_result_failed_without_stage",
    localError: {
      code: input.failureCode,
      message: "提交处理器返回失败，但此前没有写入提交阶段诊断。",
    },
    failureCode: input.failureCode,
    diagnosticNote: "已由提交结果审计兜底补写，需继续检查处理器返回路径。",
  };
  await appendProviderRequestDiagnostics(db, {
    providerRequestId: providerRequest.provider_request_id,
    diagnostics,
    now: input.now,
  }).catch(() => undefined);
  await completeUserModelRequestLog(db, {
    providerRequestId: providerRequest.provider_request_id,
    status: "failed",
    responseText: JSON.stringify(diagnostics, null, 2),
    responseUsage: null,
    finishReasons: [],
    failureCode: input.failureCode,
    now: input.now,
  }).catch(() => undefined);
}

function readErrorStorageObjectId(error: unknown): string | undefined {
  return error && typeof error === "object" && typeof (error as { storageObjectId?: unknown }).storageObjectId === "string"
    ? String((error as { storageObjectId: string }).storageObjectId)
    : undefined;
}

function readErrorStorageObjectKey(error: unknown): string | undefined {
  return error && typeof error === "object" && typeof (error as { storageObjectKey?: unknown }).storageObjectKey === "string"
    ? String((error as { storageObjectKey: string }).storageObjectKey)
    : undefined;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parsePositiveInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function parseNonNegativeInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}
