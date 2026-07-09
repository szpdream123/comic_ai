import { createHash } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import { settleReservationAllocation } from "../credit-billing/credit-ledger.service.ts";
import { createAssetVersionSnapshot } from "../project/asset-version-record.service.ts";
import { ensureProjectUploadRecordForStorageObject } from "../project/project-upload-record.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  createScopedStorageObject,
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
  findActiveAiModelConfigByCode,
  findActiveAiModelDispatchPolicyByModelCode,
  type AiModelConfigRecord,
} from "../model-catalog/ai-model-config.store.ts";
import { createProviderAdapterFromModelConfig } from "./provider-adapter.factory.ts";
import { translateProviderErrorMessage } from "./provider-error-message.ts";
import type { ProviderRateLimiter, ProviderRateLimitGrant } from "./provider-rate-limiter.ts";
import {
  markProviderRequestCanceled,
  markProviderRequestFailed,
  markProviderRequestSucceeded,
  submitProviderRequest,
} from "./provider-request.service.ts";
import {
  completeUserModelRequestLog,
  createUserModelRequestLog,
} from "./user-model-request-log.service.ts";
import { buildGlobalAiOpcVideoPayload } from "./global-ai-opc-video.provider-adapter.ts";
import { buildLingdongVideoPayload } from "./lingdong-api.provider-adapter.ts";
import {
  markGenerationTaskSnapshotFailed,
  markGenerationTaskSnapshotResultUnknown,
  markGenerationTaskSnapshotRunning,
  markGenerationTaskSnapshotSucceeded,
  markGenerationTaskSnapshotManualReviewRequired,
} from "./generation-task-snapshot.service.ts";
import { appendGenerationTaskFinalizeRequestedOutboxEvent } from "./generation-outbox.service.ts";

interface SeedanceTaskRow {
  task_id: string;
  task_status?: string;
  workflow_id: string;
  attempt_id: string | null;
  current_attempt_id?: string | null;
  provider_attempt_id?: string | null;
  organization_id: string;
  workspace_id: string | null;
  project_id: string | null;
  input_snapshot_json: Record<string, unknown> | string;
  created_by_user_id: string | null;
  provider_request_id: string | null;
  external_request_id: string | null;
  provider_response_redacted_json: Record<string, unknown> | string | null;
  reservation_id: string | null;
  amount_reserved: number | string | null;
}

const SUBMIT_PROVIDER_LIMIT_BYPASS = 1_000_000_000;
const SEEDANCE_VIDEO_TASK_LEASE_MS = 5 * 60 * 60_000;

function seedanceVideoLeaseUntil(now: Date) {
  return new Date(now.getTime() + SEEDANCE_VIDEO_TASK_LEASE_MS);
}

function readSnapshotTeamMemberId(snapshot: Record<string, unknown>) {
  const candidate = snapshot.teamMemberId ?? snapshot.memberId;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

interface SeedancePollAdapter {
  poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    redactedResponse: Record<string, unknown>;
  }>;
  cancel?(input: { externalRequestId: string }): Promise<{
    status: "canceled" | "not_cancelable" | "failed";
    redactedResponse: Record<string, unknown>;
  }>;
}

export async function processSeedanceVideoSubmitJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    rateLimiter?: ProviderRateLimiter;
    userConcurrencyLimit?: number;
    now: Date;
  },
): Promise<
  | { status: "submitted"; externalRequestId: string | null }
  | { status: "already_started"; externalRequestId: string | null }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "skipped" }
> {
  const row = await findSeedanceTaskForSubmit(db, input.taskId);
  if (!row) {
    return { status: "skipped" };
  }

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const modelCode = readString(snapshot.model) || "seedance-i2v-pro";
  const modelConfig = await findActiveAiModelConfigByCode(db, modelCode);
  const providerName = modelConfig?.providerName || "volcengine";
  const providerModel = modelConfig?.providerModel || fallbackSeedanceModelConfig(input.env).providerModel;
  const permit = await acquireSeedanceSubmitPermit(input.rateLimiter, {
    providerName,
    modelCode,
    userId: row.created_by_user_id ?? row.organization_id,
    userConcurrencyLimit: input.userConcurrencyLimit ?? 10,
    now: input.now,
  });
  if (permit && !permit.granted) {
    return {
      status: "rate_limited",
      retryAfterMs: permit.retryAfterMs,
      reason: permit.reason,
    };
  }

  const claim = await claimQueuedTask(db, {
    taskId: row.task_id,
    workerId: "seedance-video-submit-worker",
    now: input.now,
    leaseMs: SEEDANCE_VIDEO_TASK_LEASE_MS,
  });
  if (!claim) {
    await releaseProviderPermit(permit);
    return { status: "skipped" };
  }

  try {
    const adapter = createProviderAdapterFromModelConfig(
      modelConfig
        ? {
            providerProtocol: modelConfig.providerProtocol,
            providerModel: modelConfig.providerModel,
            providerConfig: modelConfig.providerConfig,
          }
        : fallbackSeedanceModelConfig(input.env),
      input.env,
      input.fetchImpl,
    );
    const payloadRef = `creator://episodes/${readString(snapshot.episodeId) || row.task_id}/video/${row.task_id}`;
    const prompt = readString(snapshot.prompt) ?? "";
    const firstFrameUrl = readString(snapshot.firstFrameUrl);
    const payloadHash = sha256(`${payloadRef}:${prompt}:${firstFrameUrl ?? ""}`);
    const requestKey = `${row.workflow_id}:${row.task_id}`;
    const requestHash = sha256(`${row.task_id}:${modelCode}:${prompt}`);
    const requestBody = {
      prompt,
      motionPrompt: prompt,
      firstFrameUrl,
      parameters: readObject(snapshot.parameters),
      episodeId: readString(snapshot.episodeId),
      targetType: readString(snapshot.targetType) ?? "episode",
      targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId),
    };
    const requestLogBody = buildSeedanceUserModelRequestLogBody(requestBody, {
      providerName,
      providerProtocol: modelConfig?.providerProtocol,
      providerModel,
      providerConfig: modelConfig?.providerConfig,
    });
    const submitted = await submitProviderRequest(db, {
      workspaceId: row.workspace_id,
      projectId: row.project_id,
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
      createdByUserId: row.created_by_user_id,
      now: input.now,
      adapter,
    });
    const logRequestBody = readSubmittedRedactedRequest(submitted) ?? requestBody;
    await createUserModelRequestLog(db, {
      providerRequestId: submitted.request.id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
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

    return {
      status: submitted.kind === "already_started" ? "already_started" : "submitted",
      externalRequestId: submitted.request.externalRequestId,
    };
  } catch (error) {
    const payloadRef = `creator://episodes/${readString(snapshot.episodeId) || row.task_id}/video/${row.task_id}`;
    const prompt = readString(snapshot.prompt) ?? "";
    const firstFrameUrl = readString(snapshot.firstFrameUrl);
    const payloadHash = sha256(`${payloadRef}:${prompt}:${firstFrameUrl ?? ""}`);
    const requestKey = `${row.workflow_id}:${row.task_id}`;
    const requestHash = sha256(`${row.task_id}:${modelCode}:${prompt}`);
    const requestBody = {
      prompt,
      motionPrompt: prompt,
      firstFrameUrl,
      parameters: readObject(snapshot.parameters),
      episodeId: readString(snapshot.episodeId),
      targetType: readString(snapshot.targetType) ?? "episode",
      targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId),
    };
    const requestLogBody = buildSeedanceUserModelRequestLogBody(requestBody, {
      providerName,
      providerProtocol: modelConfig?.providerProtocol,
      providerModel,
      providerConfig: modelConfig?.providerConfig,
    });
    const providerRequest = await findLatestProviderRequestForTask(db, row.task_id);
    const errorMessage = translateProviderErrorMessage(error instanceof Error ? error.message : String(error));
    if (providerRequest?.provider_request_id) {
      const logRequestBody =
        readProviderRedactedRequest(error) ??
        readProviderResponseRedactedRequest(providerRequest.provider_response_redacted_json) ??
        requestBody;
      await createUserModelRequestLog(db, {
        providerRequestId: providerRequest.provider_request_id,
        workspaceId: row.workspace_id,
        projectId: row.project_id,
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
      await completeUserModelRequestLog(db, {
        providerRequestId: providerRequest.provider_request_id,
        status: "failed",
        responseText: buildSeedanceFailureResponseText({
          failureCode: "provider_submission_failed",
          errorMessage,
        }),
        responseUsage: null,
        finishReasons: [],
        failureCode: "provider_submission_failed",
        now: input.now,
      });
    }
    await failSeedanceTask(db, {
      row: { ...row, attempt_id: claim.attempt.id },
      failureCode: "provider_submission_failed",
      providerRequestId: providerRequest?.provider_request_id ?? null,
      redactedResponse: buildSeedanceBillingMetadata({ ...row, attempt_id: claim.attempt.id }, snapshot, {
        billingEvent: "released",
        outcome: "released",
        provider: "model-gateway",
        providerRequestId: providerRequest?.provider_request_id ?? null,
        failureCode: "provider_submission_failed",
        errorMessage,
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
        failureCode: providerRequest?.failure_code ?? "provider_submission_failed",
      },
      failure: {
        failureCode: "provider_submission_failed",
        providerRequestId: providerRequest?.provider_request_id ?? null,
        providerFailureCode: providerRequest?.failure_code ?? null,
        errorMessage,
        displayMessage: errorMessage,
      },
      creditSummary: {
        released: Number(row.amount_reserved ?? 0),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    return { status: "skipped" };
  } finally {
    await releaseProviderPermit(permit);
  }
}

async function findLatestProviderRequestForTask(db: SqlDatabase, taskId: string) {
  return queryOne<{
    provider_request_id: string;
    failure_code: string | null;
    provider_response_redacted_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT
        id AS provider_request_id,
        failure_code,
        response_redacted_json AS provider_response_redacted_json
      FROM provider_requests
      WHERE task_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [taskId],
  );
}

export async function processSeedanceVideoPollJob(
  db: SqlDatabase,
  input: {
    taskId: string;
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
  | { status: "skipped" }
> {
  const row = await findSeedanceTaskForPoll(db, input.taskId);
  if (!row?.provider_request_id || !row.external_request_id || !row.attempt_id) {
    return { status: "skipped" };
  }

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const modelCode = readString(snapshot.model) || "seedance-i2v-pro";
  const modelConfig = await findActiveAiModelConfigByCode(db, modelCode);
  const dispatchPolicy = await findActiveAiModelDispatchPolicyByModelCode(db, modelCode);
  const permit = await acquireSeedancePollPermit(input.rateLimiter, {
    providerName: modelConfig?.providerName || "volcengine",
    modelCode,
    organizationId: row.organization_id,
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
          providerConfig: modelConfig.providerConfig,
        }
      : fallbackSeedanceModelConfig(input.env),
    input.env,
    input.fetchImpl,
  ) as unknown as SeedancePollAdapter;
  try {
    const poll = await adapter.poll({ externalRequestId: row.external_request_id });

    if (poll.status === "accepted" || poll.status === "running") {
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
      const providerErrorMessage = translateProviderErrorMessage(
        readString(poll.redactedResponse.providerMessage) || readString(poll.redactedResponse.providerErrorCode),
      );
      await markProviderRequestFailed(db, {
        providerRequestId: row.provider_request_id,
        failureCode: "provider_failed",
        redactedResponse: poll.redactedResponse,
        now: input.now,
      });
      await completeUserModelRequestLog(db, {
        providerRequestId: row.provider_request_id,
        status: "failed",
        responseText: buildSeedanceFailureResponseText({
          failureCode: "provider_failed",
          errorMessage: providerErrorMessage,
          providerResponse: poll.redactedResponse,
        }),
        responseUsage: null,
        finishReasons: [],
        failureCode: "provider_failed",
        now: input.now,
      });
      await failSeedanceTask(db, {
        row,
        failureCode: "provider_failed",
        providerRequestId: row.provider_request_id,
        redactedResponse: buildSeedanceBillingMetadata(row, snapshot, {
          billingEvent: "released",
          outcome: "released",
          provider: "model-gateway",
          providerRequestId: row.provider_request_id,
          externalRequestId: row.external_request_id,
          failureCode: "provider_failed",
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
          failureCode: "provider_failed",
          providerStatus: readString(poll.redactedResponse.providerStatus),
          providerErrorCode: readString(poll.redactedResponse.providerErrorCode),
          providerMessage: providerErrorMessage,
          displayMessage: providerErrorMessage,
        },
        creditSummary: {
          released: Number(row.amount_reserved ?? 0),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      return { status: "failed", failureCode: "provider_failed" };
    }

    if (!poll.videoUrl) {
      return { status: "waiting" };
    }

    await markProviderRequestSucceeded(db, {
      providerRequestId: row.provider_request_id,
      externalRequestId: row.external_request_id,
      redactedResponse: {
        ...poll.redactedResponse,
        videoUrl: poll.videoUrl,
      },
      now: input.now,
    });
    await completeUserModelRequestLog(db, {
      providerRequestId: row.provider_request_id,
      status: "succeeded",
      responseText: buildSeedanceSuccessResponseText({
        externalRequestId: row.external_request_id,
        videoUrl: poll.videoUrl,
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
      providerStatus: {
        ...poll.redactedResponse,
        videoUrl: poll.videoUrl,
      },
      now: input.now,
    });

    return { status: "succeeded" };
  } catch (error) {
    if (isSeedancePollResultNotFoundError(error)) {
      const failureCode = "provider_result_not_found";
      const errorMessage = translateProviderErrorMessage(error instanceof Error ? error.message : String(error));
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
          displayMessage: "供应商结果已不存在，系统已停止继续轮询并返还积分。请重新发起生成。",
        },
        creditSummary: {
          released: Number(row.amount_reserved ?? 0),
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
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<{ status: "failed"; failureCode: "provider_poll_timeout" }> {
  const row = await findSeedanceTaskForPoll(db, input.taskId);
  if (!row?.attempt_id) {
    return { status: "failed", failureCode: "provider_poll_timeout" };
  }

  const timeoutStatus = await cancelSeedanceProviderTaskAfterPollTimeout(db, {
    row,
    env: input.env ?? process.env,
    fetchImpl: input.fetchImpl,
  });
  if (row.provider_request_id) {
    if (timeoutStatus.cancelStatus === "canceled") {
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
          errorMessage: "模型服务结果轮询超时，请稍后重试。",
          providerResponse: timeoutStatus,
        }),
        responseUsage: null,
        finishReasons: [],
        failureCode: "provider_poll_timeout",
        now: input.now,
      });
    } else {
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
          errorMessage: "模型服务结果轮询超时，请稍后重试。",
          providerResponse: timeoutStatus,
        }),
        responseUsage: null,
        finishReasons: [],
        failureCode: "provider_poll_timeout",
        now: input.now,
      });
    }
  }
  await markSeedanceTaskResultUnknown(db, {
    row,
    failureCode: "provider_poll_timeout",
    providerRequestId: row.provider_request_id,
    redactedResponse: buildSeedanceBillingMetadata(row, parseSnapshot(row.input_snapshot_json), {
      billingEvent: "manual_review_required",
      outcome: "manual_review_required",
      provider: "model-gateway",
      providerRequestId: row.provider_request_id,
      externalRequestId: row.external_request_id,
      failureCode: "provider_poll_timeout",
      providerResponse: timeoutStatus,
      settledAt: input.now,
    }),
    now: input.now,
  });
  await markGenerationTaskSnapshotResultUnknown(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    providerStatus: timeoutStatus,
    failure: {
      failureCode: "provider_poll_timeout",
      displayMessage: "模型服务结果轮询超时，请稍后刷新；如仍未完成，请重新发起生成。",
    },
    creditSummary: {
      reserved: Number(row.amount_reserved ?? 0),
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });

  return { status: "failed", failureCode: "provider_poll_timeout" };
}

async function cancelSeedanceProviderTaskAfterPollTimeout(
  db: SqlDatabase,
  input: {
    row: SeedanceTaskRow;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  },
): Promise<Record<string, unknown> & { cancelStatus?: string }> {
  const timeoutStatus = {
    provider: "model-gateway",
    externalRequestId: input.row.external_request_id,
    failureCode: "provider_poll_timeout",
  };

  if (!input.row.external_request_id) {
    return { ...timeoutStatus, cancelStatus: "skipped", cancelReason: "external_request_id_missing" };
  }

  try {
    const snapshot = parseSnapshot(input.row.input_snapshot_json);
    const modelCode = readString(snapshot.model) || "seedance-i2v-pro";
    const modelConfig = await findActiveAiModelConfigByCode(db, modelCode);
    const adapter = createProviderAdapterFromModelConfig(
      modelConfig
        ? {
            providerProtocol: modelConfig.providerProtocol,
            providerModel: modelConfig.providerModel,
            providerConfig: modelConfig.providerConfig,
          }
        : fallbackSeedanceModelConfig(input.env),
      input.env,
      input.fetchImpl,
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
      cancelError: translateProviderErrorMessage(error instanceof Error ? error.message : String(error)),
    };
  }
}

export async function finalizeSeedanceVideoArtifactJob(
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
  | { status: "failed"; failureCode: string }
  | { status: "skipped" }
> {
  let row = await findSeedanceTaskForFinalize(db, input.taskId);
  if (!row?.provider_request_id || !row.external_request_id) {
    return { status: "skipped" };
  }
  const snapshot = parseSnapshot(row.input_snapshot_json);
  const providerResponse = parseProviderResponse(row.provider_response_redacted_json);
  const videoUrl = readString(providerResponse.videoUrl);
  if (!videoUrl) {
    return { status: "skipped" };
  }
  row = await ensureSeedanceFinalizeAttempt(db, {
    row,
    now: input.now,
  });
  if (!row.attempt_id) {
    return { status: "skipped" };
  }
  await markSeedanceFinalizeLease(db, {
    taskId: row.task_id,
    now: input.now,
  });

  try {
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
    const errorMessage = translateProviderErrorMessage(error instanceof Error ? error.message : String(error));
    const storageObjectKey = readErrorStorageObjectKey(error);
    if (isSeedanceProviderResultTransferFailure(failureCode)) {
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
        released: Number(row.amount_reserved ?? 0),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    return { status: "failed", failureCode };
  }

  await ensureProjectUploadRecordForStorageObject(db, {
    organizationId: row.organization_id,
    storageObjectId: persisted.storageObjectId,
    pageKey: "project",
    sourceAction: "generate_video",
    publicUrl: persisted.previewUrl,
    status: "uploaded",
    now: input.now,
  });

  await finalizeTaskAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    status: "succeeded",
    now: input.now,
  });
  await aggregateWorkflowStatus(db, row.workflow_id);
  const amount = Number(row.amount_reserved ?? 0);
  if (row.reservation_id && amount > 0) {
    await settleReservationAllocation(db, {
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
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE tasks
      SET locked_by = 'seedance-video-finalize-worker',
          locked_until = $2,
          heartbeat_at = $3,
          updated_at = $3
      WHERE id = $1
        AND status IN ('running', 'manual_review_required')
    `,
    [input.taskId, seedanceVideoLeaseUntil(input.now), input.now],
  );
}

export async function persistSeedanceVideoArtifactJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    now: Date;
  },
): Promise<
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" }
> {
  const row = await findSeedanceTaskForPersist(db, input.taskId);
  if (!row?.attempt_id) {
    return { status: "skipped" };
  }
  const snapshot = parseSnapshot(row.input_snapshot_json);
  const failure = await findGenerationTaskSnapshotFailure(db, row.task_id);
  const storageObjectKey = readString(failure.storageObjectKey) ?? readString(failure.storage_object_key);
  if (!storageObjectKey || !row.project_id) {
    return { status: "failed", failureCode: "provider_output_persist_failed" };
  }
  const storageObject = await findStorageObjectByKey(db, {
    organizationId: row.organization_id,
    objectKey: storageObjectKey,
  });
  if (!storageObject || storageObject.status !== "available") {
    return { status: "failed", failureCode: "provider_output_persist_failed" };
  }

  const platformUrl = buildPlatformStorageUrl(input.runtime, storageObject);
  const created = await createAssetVersionSnapshot(db, {
    organizationId: row.organization_id,
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
  });
  const persisted = {
    assetId: created.asset.id,
    assetVersionId: created.version.id,
    storageObjectId: storageObject.id,
    storageObjectKey: storageObject.objectKey,
    mediaKind: "video",
    mimeType: storageObject.contentType,
    url: platformUrl,
    previewUrl: platformUrl,
    sourceUrl: platformUrl,
    downloadUrl: platformUrl,
  };

  await finalizeTaskAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    status: "succeeded",
    now: input.now,
  });
  await aggregateWorkflowStatus(db, row.workflow_id);
  const amount = Number(row.amount_reserved ?? 0);
  if (row.reservation_id && amount > 0) {
    await reopenManualReviewReservationForSettlement(db, {
      reservationId: row.reservation_id,
      now: input.now,
    });
    await settleReservationAllocation(db, {
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
      consumed: amount,
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });

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
  if (input.row.attempt_id) {
    await finalizeTaskAttempt(db, {
      taskId: input.row.task_id,
      attemptId: input.row.attempt_id,
      status: "result_unknown",
      failureCode: input.failureCode,
      now: input.now,
    });
    await aggregateWorkflowStatus(db, input.row.workflow_id);
  }
  const amount = Number(input.row.amount_reserved ?? 0);
  if (input.row.reservation_id && amount > 0) {
    await settleReservationAllocation(db, {
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
  if (!input.row.reservation_id && amount > 0) {
    const snapshot = parseSnapshot(input.row.input_snapshot_json);
    const memberId = readSnapshotTeamMemberId(snapshot);
    if (memberId) {
      await refundTeamMemberGenerationCredits(db, {
        organizationId: input.row.organization_id,
        teamMemberId: memberId,
        amount,
        sourceId: input.row.task_id,
        reason: "生成失败返还积分",
        metadata: {
          provider: "model-gateway",
          externalRequestId: input.row.external_request_id,
        },
        now: input.now,
      });
    }
  }
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
  if (input.row.attempt_id) {
    await finalizeTaskAttempt(db, {
      taskId: input.row.task_id,
      attemptId: input.row.attempt_id,
      status: "manual_review_required",
      failureCode: input.failureCode,
      now: input.now,
    });
    await aggregateWorkflowStatus(db, input.row.workflow_id);
  }
  const amount = Number(input.row.amount_reserved ?? 0);
  if (input.row.reservation_id && amount > 0) {
    await settleReservationAllocation(db, {
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
}

async function findSeedanceTaskForSubmit(db: SqlDatabase, taskId: string) {
  return queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        t.organization_id,
        t.workspace_id,
        t.project_id,
        t.input_snapshot_json,
        w.created_by_user_id,
        NULL::uuid AS provider_request_id,
        NULL::text AS external_request_id,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      JOIN workflows w
        ON w.organization_id = t.organization_id
       AND w.id = t.workflow_id
      LEFT JOIN credit_reservations r
        ON r.organization_id = t.organization_id
       AND r.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_video'
        AND t.status = 'queued'
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
      LIMIT 1
    `,
    [taskId],
  );
}

async function findSeedanceTaskForPoll(db: SqlDatabase, taskId: string) {
  return queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        t.organization_id,
        t.workspace_id,
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
        ON w.organization_id = t.organization_id
       AND w.id = t.workflow_id
      LEFT JOIN provider_requests pr
        ON pr.task_id = t.id
       AND pr.workspace_id IS NOT DISTINCT FROM t.workspace_id
      LEFT JOIN credit_reservations r
        ON r.organization_id = t.organization_id
       AND r.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_video'
        AND t.status = 'running'
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId],
  );
}

function isSeedanceProviderResultTransferFailure(failureCode: string) {
  return failureCode === "provider_output_download_failed"
    || failureCode === "provider_output_upload_failed";
}

async function findSeedanceTaskForFinalize(db: SqlDatabase, taskId: string) {
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
        t.organization_id,
        t.workspace_id,
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
        ON w.organization_id = t.organization_id
       AND w.id = t.workflow_id
      LEFT JOIN provider_requests pr
        ON pr.task_id = t.id
       AND pr.workspace_id IS NOT DISTINCT FROM t.workspace_id
       AND pr.status = 'succeeded'
      LEFT JOIN credit_reservations r
        ON r.organization_id = t.organization_id
       AND r.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_video'
        AND t.status IN ('queued', 'running', 'manual_review_required')
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId],
  );
}

async function ensureSeedanceFinalizeAttempt(
  db: SqlDatabase,
  input: {
    row: SeedanceTaskRow;
    now: Date;
  },
): Promise<SeedanceTaskRow> {
  if (input.row.attempt_id) {
    if (!input.row.current_attempt_id) {
      await db.query(
        `
          UPDATE tasks
          SET current_attempt_id = $2,
              status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
              locked_by = COALESCE(locked_by, 'seedance-video-finalize-worker'),
              locked_until = COALESCE(locked_until, $3),
              heartbeat_at = COALESCE(heartbeat_at, $4),
              updated_at = $4
          WHERE id = $1
            AND current_attempt_id IS NULL
            AND status IN ('queued', 'running')
        `,
        [
          input.row.task_id,
          input.row.attempt_id,
          seedanceVideoLeaseUntil(input.now),
          input.now,
        ],
      );
    }
    return {
      ...input.row,
      current_attempt_id: input.row.attempt_id,
      task_status: input.row.task_status === "queued" ? "running" : input.row.task_status,
    };
  }

  if (input.row.task_status !== "queued") {
    return input.row;
  }

  const claim = await claimQueuedTask(db, {
    taskId: input.row.task_id,
    workerId: "seedance-video-finalize-worker",
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

async function findSeedanceTaskForPersist(db: SqlDatabase, taskId: string) {
  return queryOne<SeedanceTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        t.organization_id,
        t.workspace_id,
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
        ON w.organization_id = t.organization_id
       AND w.id = t.workflow_id
      LEFT JOIN provider_requests pr
        ON pr.task_id = t.id
       AND pr.workspace_id IS NOT DISTINCT FROM t.workspace_id
      LEFT JOIN credit_reservations r
        ON r.organization_id = t.organization_id
       AND r.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_video'
        AND t.status = 'manual_review_required'
        AND t.failure_code = 'provider_output_persist_failed'
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId],
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
    now: Date;
  },
) {
  const artifactMetadata = {
    episodeId: readString(input.snapshot.episodeId) ?? null,
    taskId: input.row.task_id,
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
      organizationId: input.row.organization_id,
      workspaceId: input.row.workspace_id,
      projectId: input.row.project_id,
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
      eTag: uploaded.uploadResult?.eTag ?? null,
      versionId: uploaded.uploadResult?.versionId ?? null,
      metadata: artifactMetadata,
      now: input.now,
    });
    if (!available) {
      throw Object.assign(new Error("seedance_storage_object_missing_after_upload"), {
        failureCode: "provider_output_persist_failed",
        storageObjectKey: available.objectKey,
      });
    }

    const platformUrl = buildPlatformStorageUrl(input.runtime, available);
    const created = await createAssetVersionSnapshot(db, {
      organizationId: input.row.organization_id,
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
    });
    return {
      assetId: created.asset.id,
      assetVersionId: created.version.id,
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
    organizationId: string;
    workspaceId: string | null;
    projectId: string | null;
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
  uploadResult?: { eTag?: string | null; versionId?: string | null };
}> {
  const { retryAttempts, retryDelayMs, downloadTimeoutMs } = readGenerationArtifactUploadConfig(input.env);
  const fetchImpl = input.fetchImpl ?? fetch;
  let storageObject: StorageObjectRecord | null = null;
  let contentType = "application/octet-stream";
  let knownSizeBytes: number | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), downloadTimeoutMs);
    let response: Response;
    let artifactBytes: Uint8Array;
    try {
      response = await fetchImpl(input.artifactUrl, {
        ...input.downloadInit,
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        throw Object.assign(new Error(`provider_artifact_download_${response.status}`), {
          failureCode: "provider_output_download_failed",
          storageObjectId: storageObject?.id,
        });
      }
      contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || contentType;
      knownSizeBytes = parseContentLength(response.headers.get("content-length")) ?? knownSizeBytes;
      artifactBytes = new Uint8Array(await response.arrayBuffer());
      knownSizeBytes = artifactBytes.byteLength;
    } catch (error) {
      if (attempt >= retryAttempts) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          failureCode: "provider_output_download_failed",
          storageObjectId: storageObject?.id,
        });
      }
      await delay(retryDelayMs);
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!storageObject) {
      storageObject = await createScopedStorageObject(db, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        bucket: input.runtime.bucket,
        objectName: input.objectName,
        contentType,
        sizeBytes: knownSizeBytes,
        provider: input.runtime.provider,
        status: "pending_upload",
        metadata: input.metadata,
        createdByUserId: input.createdByUserId ?? null,
        now: input.now,
      });
    }

    try {
      if (typeof input.runtime.adapter.putObject !== "function") {
        throw new Error("storage_put_object_required");
      }
      const uploadResult = await input.runtime.adapter.putObject({
        bucket: storageObject.bucket,
        objectKey: storageObject.objectKey,
        body: artifactBytes,
        contentType,
        contentLength: knownSizeBytes,
      });
      return {
        storageObject,
        contentType,
        sizeBytes: knownSizeBytes,
        uploadResult,
      };
    } catch (error) {
      if (attempt >= retryAttempts) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          failureCode: "provider_output_upload_failed",
          storageObjectId: storageObject.id,
        });
      }
      await delay(retryDelayMs);
    }
  }

  throw Object.assign(new Error("provider_artifact_upload_retry_exhausted"), {
    failureCode: "provider_output_upload_failed",
    storageObjectId: storageObject?.id,
  });
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
  if (input.row.attempt_id) {
    await finalizeTaskAttempt(db, {
      taskId: input.row.task_id,
      attemptId: input.row.attempt_id,
      status: "failed",
      failureCode: input.failureCode,
      now: input.now,
    });
    await aggregateWorkflowStatus(db, input.row.workflow_id);
  }
  const amount = Number(input.row.amount_reserved ?? 0);
  if (input.row.reservation_id && amount > 0) {
    await settleReservationAllocation(db, {
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
}

async function buildProviderArtifactDownloadInit(
  db: SqlDatabase,
  input: {
    snapshot: Record<string, unknown>;
    artifactUrl: string;
    env: NodeJS.ProcessEnv;
  },
): Promise<RequestInit | undefined> {
  if (!isLingdongContentEndpoint(input.artifactUrl)) {
    return undefined;
  }
  const modelCode = readString(input.snapshot.model);
  const modelConfig = modelCode ? await findActiveAiModelConfigByCode(db, modelCode) : null;
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

type SeedanceRequestBodyForLog = {
  prompt: string;
  motionPrompt: string;
  firstFrameUrl?: string;
  parameters: Record<string, unknown>;
  episodeId?: string;
  targetType: string;
  targetId?: string;
};

function buildSeedanceUserModelRequestLogBody(
  requestBody: SeedanceRequestBodyForLog,
  input: {
    providerName: string;
    providerProtocol?: string | null;
    providerModel?: string | null;
    providerConfig?: Record<string, unknown>;
  },
) {
  if (input.providerName === "GlobalAiOpc") {
    const providerBody = buildGlobalAiOpcVideoPayload({
      providerRequestId: "request-log-preview",
      providerName: input.providerName,
      providerOperation: operationNames.episodeVideoGenerate,
      requestKey: "request-log-preview",
      payloadRef: "request-log-preview",
      payloadHash: "request-log-preview",
      redactedPayload: requestBody,
    }, {
      model: input.providerModel?.trim() || undefined,
      defaultRequestParams: readObject(input.providerConfig?.defaultRequestParams),
    });
    return {
      requestFormat: "globalaiopc_video",
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
}) {
  const providerSummary = summarizeProviderResponse(input.providerResponse) ?? {};
  return JSON.stringify(
    removeUndefinedValues({
      failureCode: input.failureCode,
      errorMessage: translateProviderErrorMessage(input.errorMessage),
      ...providerSummary,
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
    organizationId: input.userId,
    rpmLimit: SUBMIT_PROVIDER_LIMIT_BYPASS,
    providerConcurrentLimit: SUBMIT_PROVIDER_LIMIT_BYPASS,
    modelConcurrentLimit: SUBMIT_PROVIDER_LIMIT_BYPASS,
    tenantConcurrentLimit: input.userConcurrencyLimit,
    leaseMs: 120_000,
    now: input.now,
  });
}

async function acquireSeedancePollPermit(
  rateLimiter: ProviderRateLimiter | undefined,
  input: {
    providerName: string;
    modelCode: string;
    organizationId: string;
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
    organizationId: input.organizationId,
    rpmLimit: input.providerRpmLimit,
    providerConcurrentLimit: input.providerConcurrentLimit,
    modelConcurrentLimit: input.pollingConcurrencyLimit,
    tenantConcurrentLimit: input.pollingConcurrencyLimit,
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
      apiKeyEnv: env.SEEDANCE_API_KEY_ENV?.trim() || "VOLCENGINE_ARK_API_KEY",
    },
  };
}

function buildPlatformStorageUrl(runtime: UploadSessionRuntime, object: StorageObjectRecord) {
  const publicBaseUrl =
    runtime.publicBaseUrl?.trim().replace(/\/+$/g, "") ||
    process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/g, "") ||
    process.env.STORAGE_ENDPOINT?.trim().replace(/\/+$/g, "") ||
    "";
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${object.objectKey}`;
  }
  if (object.bucket && runtime.region) {
    return `https://${object.bucket}.cos.${runtime.region}.myqcloud.com/${object.objectKey}`;
  }
  return object.objectKey;
}

function readGenerationArtifactUploadConfig(env: NodeJS.ProcessEnv) {
  return {
    retryAttempts: parsePositiveInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS, 3, 10),
    retryDelayMs: parseNonNegativeInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS, 1000, 60_000),
    downloadTimeoutMs: parsePositiveInteger(env.GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS, 60_000, 10 * 60_000),
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
    workspaceId: row.workspace_id,
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

function parseSnapshot(value: Record<string, unknown> | string) {
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readErrorFailureCode(error: unknown): string | undefined {
  return error && typeof error === "object" && typeof (error as { failureCode?: unknown }).failureCode === "string"
    ? String((error as { failureCode: string }).failureCode)
    : undefined;
}

function isSeedancePollResultNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostics = readErrorProviderDiagnostics(error);
  return diagnostics?.httpStatus === 404 ||
    /video_provider_poll_404|seedance_video_poll_404|ResourceNotFound/i.test(message);
}

function readErrorProviderDiagnostics(error: unknown): Record<string, unknown> | undefined {
  return error && typeof error === "object" && typeof (error as { providerDiagnostics?: unknown }).providerDiagnostics === "object"
    ? (error as { providerDiagnostics: Record<string, unknown> }).providerDiagnostics
    : undefined;
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
