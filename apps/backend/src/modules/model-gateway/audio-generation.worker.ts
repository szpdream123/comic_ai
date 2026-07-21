import { createHash } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import { settleReservationAllocation } from "../credit-billing/credit-ledger.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { UploadSessionRuntime } from "../storage/upload-session.service.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  finalizeTaskAttempt,
} from "../workflow-task/workflow-task.service.ts";
import { persistGptImageArtifact } from "./gpt-image.artifact-finalizer.ts";
import { resolveGenerationModelConfigForTask } from "./generation-model-config-snapshot.ts";
import { resolveGenerationProviderFetch } from "./generation-provider-fetch.ts";
import { buildGenerationProviderPayloadRef } from "./generation-provider-request-identity.ts";
import {
  markGenerationTaskSnapshotRunning,
  markGenerationTaskSnapshotManualReviewRequired,
  markGenerationTaskSnapshotResultUnknown,
  markGenerationTaskSnapshotSucceeded,
} from "./generation-task-snapshot.service.ts";
import { failGenerationTaskAfterQueueError } from "./generation-redis-repair.service.ts";
import { createProviderAdapterFromModelConfig } from "./provider-adapter.factory.ts";
import type { MediaGenerationArtifact, ProviderAdapter } from "./provider-adapter.contract.ts";
import {
  markProviderRequestFailed,
  markProviderRequestSucceeded,
  submitProviderRequest,
} from "./provider-request.service.ts";
import {
  completeUserModelRequestLog,
  createUserModelRequestLog,
} from "./user-model-request-log.service.ts";

interface AudioTaskRow {
  task_id: string;
  workflow_id: string;
  attempt_id: string | null;
  user_id: string;
  project_id: string | null;
  created_by_user_id: string | null;
  input_snapshot_json: Record<string, unknown> | string;
  provider_request_id: string | null;
  external_request_id: string | null;
  provider_request_status: string | null;
  provider_response_redacted_json: Record<string, unknown> | string | null;
  reservation_id: string | null;
  amount_reserved: number | string | null;
}

interface AudioPollAdapter extends ProviderAdapter {
  poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    artifacts?: MediaGenerationArtifact[];
    redactedResponse: Record<string, unknown>;
  }>;
}

export async function processAudioGenerationSubmitJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "submitted"; providerStatus: "waiting" | "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" }
> {
  const row = await findAudioTask(db, input.taskId, ["queued"]);
  if (!row) return { status: "skipped" };

  const claim = await claimQueuedTask(db, {
    taskId: row.task_id,
    workerId: "audio-generation-submit-worker",
    now: input.now,
    leaseMs: 15 * 60_000,
  });
  if (!claim) return { status: "skipped" };

  const claimedRow = { ...row, attempt_id: claim.attempt.id };
  const snapshot = parseRecord(row.input_snapshot_json);
  await markGenerationTaskSnapshotRunning(db, {
    taskId: row.task_id,
    attemptId: claim.attempt.id,
    progressStage: "provider_submitting",
    progressPercent: 25,
    now: input.now,
  });

  try {
    const context = await buildAudioProviderContext(db, claimedRow, snapshot, {
      env: input.env,
      fetchImpl: input.fetchImpl,
      now: input.now,
    });
    const submitted = await submitProviderRequest(db, {
      ...context.providerRequest,
      attemptId: claim.attempt.id,
      adapter: context.adapter,
    });
    await createUserModelRequestLog(db, {
      providerRequestId: submitted.request.id,
      ...context.auditLogInput,
      attemptId: claim.attempt.id,
      now: input.now,
    });
    if (submitted.kind === "already_started") {
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId: submitted.request.id,
        progressStage: "provider_accepted",
        providerStatus: {
          externalRequestId: submitted.request.externalRequestId,
          providerStatus: submitted.request.status,
        },
        now: input.now,
      });
      return { status: "submitted", providerStatus: "waiting" };
    }

    const artifact = findAudioArtifact(submitted.artifacts);
    if (artifact) {
      await storeSucceededAudioProviderResult(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId: submitted.request.id,
        externalRequestId: submitted.request.externalRequestId,
        artifact,
        providerStatus: submitted.request.redactedResponse ?? {},
        now: input.now,
      });
      return { status: "submitted", providerStatus: "succeeded" };
    }

    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerRequestId: submitted.request.id,
      progressStage: "provider_accepted",
      progressPercent: 40,
      providerStatus: {
        ...(submitted.request.redactedResponse ?? {}),
        externalRequestId: submitted.request.externalRequestId,
      },
      now: input.now,
    });
    return { status: "submitted", providerStatus: "waiting" };
  } catch (error) {
    const failureCode = readFailureCode(error) ?? "audio_provider_submission_failed";
    const latestProviderRequest = await findLatestAudioProviderRequest(db, row.task_id);
    await recordAudioRequestFailureAudit(db, {
      row: claimedRow,
      snapshot,
      failureCode,
      completeAsFailed: latestProviderRequest?.status !== "result_unknown",
      now: input.now,
    });
    if (latestProviderRequest && shouldPreserveAudioSubmissionAsResultUnknown(latestProviderRequest.status)) {
      await markGenerationTaskSnapshotResultUnknown(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId: latestProviderRequest.id,
        providerStatus: {
          failureCode: latestProviderRequest.failure_code ?? "provider_submission_ambiguous",
        },
        failure: {
          failureCode: latestProviderRequest.failure_code ?? "provider_submission_ambiguous",
          displayMessage: "供应商提交结果不确定，已停止自动重试并保留积分等待核对。",
        },
        creditSummary: {
          reserved: Number(row.amount_reserved ?? 0),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      await finalizeTaskAttempt(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        status: "result_unknown",
        failureCode: latestProviderRequest.failure_code ?? "provider_submission_ambiguous",
        now: input.now,
      });
      await aggregateWorkflowStatus(db, row.workflow_id);
      return { status: "skipped" };
    }
    await failAudioTask(db, {
      taskId: row.task_id,
      failureCode,
      displayMessage: "音频模型请求失败，积分已返还。请稍后重试。",
      now: input.now,
    });
    return { status: "failed", failureCode };
  }
}

async function findLatestAudioProviderRequest(db: SqlDatabase, taskId: string) {
  return queryOne<{ id: string; status: string; failure_code: string | null }>(db, `
    SELECT id, status, failure_code
    FROM provider_requests
    WHERE task_id = $1
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `, [taskId]);
}

export async function processAudioGenerationPollJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "waiting" }
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" }
> {
  const row = await findAudioTask(db, input.taskId, ["running", "result_unknown"]);
  if (!row?.attempt_id || !row.provider_request_id || !row.external_request_id) {
    return { status: "skipped" };
  }
  const snapshot = parseRecord(row.input_snapshot_json);
  const context = await buildAudioProviderContext(db, row, snapshot, {
    env: input.env,
    fetchImpl: input.fetchImpl,
    now: input.now,
  });
  const poll = await context.adapter.poll({ externalRequestId: row.external_request_id });
  if (poll.status === "accepted" || poll.status === "running") {
    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      progressStage: poll.status === "accepted" ? "provider_accepted" : "provider_rendering",
      progressPercent: poll.status === "accepted" ? 40 : 60,
      providerStatus: poll.redactedResponse,
      now: input.now,
    });
    return { status: "waiting" };
  }
  if (poll.status === "failed") {
    const failureCode = "audio_provider_failed";
    await markProviderRequestFailed(db, {
      providerRequestId: row.provider_request_id,
      failureCode,
      redactedResponse: poll.redactedResponse,
      now: input.now,
    });
    await completeUserModelRequestLog(db, {
      providerRequestId: row.provider_request_id,
      status: "failed",
      responseText: JSON.stringify({ failureCode, providerStatus: poll.redactedResponse }),
      responseUsage: null,
      finishReasons: [],
      failureCode,
      now: input.now,
    });
    await failAudioTask(db, {
      taskId: row.task_id,
      failureCode,
      displayMessage: "音频生成失败，积分已返还。请稍后重试。",
      now: input.now,
    });
    return { status: "failed", failureCode };
  }

  const artifact = findAudioArtifact(poll.artifacts);
  if (!artifact) {
    const failureCode = "audio_provider_artifact_missing";
    await failAudioTask(db, {
      taskId: row.task_id,
      failureCode,
      displayMessage: "音频模型未返回可下载结果，积分已返还。",
      now: input.now,
    });
    return { status: "failed", failureCode };
  }
  await storeSucceededAudioProviderResult(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    externalRequestId: row.external_request_id,
    artifact,
    providerStatus: poll.redactedResponse,
    now: input.now,
  });
  return { status: "succeeded" };
}

export async function finalizeAudioGenerationArtifactJob(
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
  const row = await findAudioTask(db, input.taskId, ["running", "result_unknown"]);
  if (!row?.attempt_id || !row.provider_request_id) return { status: "skipped" };
  const providerResponse = parseRecord(row.provider_response_redacted_json);
  const artifact = parseStoredAudioArtifact(providerResponse.artifact);
  if (!artifact) return { status: "skipped" };
  const snapshot = parseRecord(row.input_snapshot_json);

  try {
    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      progressStage: "artifact_persisting",
      progressPercent: 75,
      now: input.now,
    });
    const persisted = await persistGptImageArtifact(db, {
      task: {
        userId: row.user_id,
        projectId: row.project_id,
        taskId: row.task_id,
        attemptId: row.attempt_id,
        createdByUserId: row.created_by_user_id,
      },
      snapshot,
      artifact,
      externalRequestId: row.external_request_id,
      runtime: input.runtime,
      env: input.env,
      fetchImpl: input.fetchImpl,
      now: input.now,
    });
    const amount = Number(row.amount_reserved ?? 0);
    if (row.reservation_id && amount > 0) {
      await settleReservationAllocation(db, {
        reservationId: row.reservation_id,
        allocationKey: "audio-generation-result",
        amount,
        outcome: "consumed",
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        metadata: {
          mediaType: "audio",
          modelCode: readString(snapshot.model),
          storageObjectId: persisted.storageObjectId,
        },
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
      creditSummary: { consumed: amount, settledAt: input.now.toISOString() },
      now: input.now,
    });
    await finalizeTaskAttempt(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      status: "succeeded",
      now: input.now,
    });
    await aggregateWorkflowStatus(db, row.workflow_id);
    return { status: "succeeded" };
  } catch (error) {
    const failureCode = readFailureCode(error) ?? "provider_output_persist_failed";
    if (failureCode === "provider_output_persist_failed") {
      await markGenerationTaskSnapshotManualReviewRequired(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        progressStage: "asset_persist_failed",
        failure: {
          failureCode,
          displayMessage: "音频结果已返回，但平台归档状态不确定，积分保持预留并等待后台处理。",
        },
        creditSummary: {
          reserved: Number(row.amount_reserved ?? 0),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      await finalizeTaskAttempt(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        status: "manual_review_required",
        failureCode,
        now: input.now,
      });
      await aggregateWorkflowStatus(db, row.workflow_id);
      return { status: "failed", failureCode };
    }
    await failAudioTask(db, {
      taskId: row.task_id,
      failureCode,
      displayMessage: "音频结果归档失败，任务已停止并按结果状态处理。",
      now: input.now,
    });
    return { status: "failed", failureCode };
  }
}

export async function expireAudioGenerationPollJob(
  db: SqlDatabase,
  input: { taskId: string; now: Date },
) {
  await failAudioTask(db, {
    taskId: input.taskId,
    failureCode: "audio_provider_poll_timeout",
    displayMessage: "音频生成超时，积分已返还。请重新发起生成。",
    now: input.now,
  });
  return { status: "failed" as const, failureCode: "audio_provider_poll_timeout" as const };
}

async function buildAudioProviderContext(
  db: SqlDatabase,
  row: AudioTaskRow,
  snapshot: Record<string, unknown>,
  input: { env: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now: Date },
) {
  const modelCode = readString(snapshot.model);
  if (!modelCode) throw new Error("audio_model_required");
  const modelConfig = await resolveGenerationModelConfigForTask(db, snapshot, modelCode);
  if (!modelConfig || modelConfig.mediaType !== "audio" || modelConfig.providerProtocol !== "aliyun_bailian_audio") {
    throw new Error("audio_model_not_configured");
  }
  const text = readString(snapshot.text) ?? readString(snapshot.prompt);
  if (!text) throw new Error("audio_text_required");
  const payloadRef = buildGenerationProviderPayloadRef({
    targetType: snapshot.targetType,
    targetId: snapshot.targetId,
    episodeId: snapshot.episodeId,
    taskId: row.task_id,
    mediaType: "audio",
  });
  const requestKey = `${row.workflow_id}:${row.task_id}`;
  const requestHash = sha256(`${row.task_id}:${modelCode}:${text}`);
  const payloadHash = sha256(`${payloadRef}:${text}`);
  const requestBody = {
    text,
    prompt: text,
    model: modelCode,
    parameters: readRecord(snapshot.parameters),
    episodeId: readString(snapshot.episodeId),
    targetType: readString(snapshot.targetType) ?? "episode",
    targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId),
  };
  const providerRequest = {
    projectId: row.project_id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    providerName: modelConfig.providerName,
    providerOperation: operationNames.canvasAudioGenerate,
    requestKey,
    requestHash,
    payloadRef,
    payloadHash,
    redactedPayload: requestBody,
    userId: row.user_id,
    now: input.now,
  };
  const auditLogInput = {
    projectId: row.project_id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    userId: row.created_by_user_id,
    providerName: modelConfig.providerName,
    providerOperation: operationNames.canvasAudioGenerate,
    modelId: modelCode,
    providerModel: modelConfig.providerModel,
    requestKey,
    requestHash,
    payloadHash,
    payloadSummary: null,
    requestFormat: "generation_task",
    requestBody,
    requestText: text,
  };
  return {
    providerRequest,
    auditLogInput,
    adapter: createProviderAdapterFromModelConfig({
      providerProtocol: modelConfig.providerProtocol,
      providerModel: modelConfig.providerModel,
      providerConfig: modelConfig.providerConfig,
    }, input.env, resolveGenerationProviderFetch(input.fetchImpl, "audio")) as AudioPollAdapter,
  };
}

async function recordAudioRequestFailureAudit(
  db: SqlDatabase,
  input: {
    row: AudioTaskRow;
    snapshot: Record<string, unknown>;
    failureCode: string;
    completeAsFailed: boolean;
    now: Date;
  },
) {
  const providerRequest = await queryOne<{ id: string }>(db, `
    SELECT id
    FROM provider_requests
    WHERE task_id = $1
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `, [input.row.task_id]);
  if (!providerRequest) return;
  const modelCode = readString(input.snapshot.model) ?? "cosyvoice-v2";
  const text = readString(input.snapshot.text) ?? readString(input.snapshot.prompt) ?? "";
  const payloadRef = buildGenerationProviderPayloadRef({
    targetType: input.snapshot.targetType,
    targetId: input.snapshot.targetId,
    episodeId: input.snapshot.episodeId,
    taskId: input.row.task_id,
    mediaType: "audio",
  });
  const requestKey = `${input.row.workflow_id}:${input.row.task_id}`;
  const requestHash = sha256(`${input.row.task_id}:${modelCode}:${text}`);
  const payloadHash = sha256(`${payloadRef}:${text}`);
  await createUserModelRequestLog(db, {
    providerRequestId: providerRequest.id,
    projectId: input.row.project_id,
    workflowId: input.row.workflow_id,
    taskId: input.row.task_id,
    attemptId: input.row.attempt_id,
    userId: input.row.created_by_user_id,
    providerName: "aliyun-bailian",
    providerOperation: operationNames.canvasAudioGenerate,
    modelId: modelCode,
    providerModel: modelCode,
    requestKey,
    requestHash,
    payloadHash,
    payloadSummary: null,
    requestFormat: "generation_task",
    requestBody: {
      text,
      model: modelCode,
      parameters: readRecord(input.snapshot.parameters),
    },
    requestText: text,
    now: input.now,
  });
  if (input.completeAsFailed) {
    await completeUserModelRequestLog(db, {
      providerRequestId: providerRequest.id,
      status: "failed",
      responseText: JSON.stringify({ failureCode: input.failureCode }),
      responseUsage: null,
      finishReasons: [],
      failureCode: input.failureCode,
      now: input.now,
    });
  }
}

async function storeSucceededAudioProviderResult(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId: string;
    providerRequestId: string;
    externalRequestId: string | null;
    artifact: MediaGenerationArtifact;
    providerStatus: Record<string, unknown>;
    now: Date;
  },
) {
  const serializedArtifact = serializeAudioArtifact(input.artifact);
  await markProviderRequestSucceeded(db, {
    providerRequestId: input.providerRequestId,
    externalRequestId: input.externalRequestId,
    redactedResponse: { ...input.providerStatus, artifact: serializedArtifact },
    now: input.now,
  });
  await completeUserModelRequestLog(db, {
    providerRequestId: input.providerRequestId,
    status: "succeeded",
    responseText: JSON.stringify({ externalRequestId: input.externalRequestId, ...serializedArtifact }),
    responseUsage: null,
    finishReasons: [],
    now: input.now,
  });
  await markGenerationTaskSnapshotRunning(db, {
    taskId: input.taskId,
    attemptId: input.attemptId,
    providerRequestId: input.providerRequestId,
    progressStage: "provider_succeeded",
    progressPercent: 70,
    providerStatus: { ...input.providerStatus, externalRequestId: input.externalRequestId },
    now: input.now,
  });
}

async function failAudioTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    failureCode: string;
    displayMessage: string;
    creditOutcome?: "released" | "manual_review_required";
    now: Date;
  },
) {
  await failGenerationTaskAfterQueueError(db, input);
}

async function findAudioTask(
  db: SqlDatabase,
  taskId: string,
  statuses: string[],
) {
  return queryOne<AudioTaskRow>(db, `
    SELECT
      t.id AS task_id,
      t.workflow_id,
      t.current_attempt_id AS attempt_id,
      w.created_by_user_id AS user_id,
      t.project_id,
      w.created_by_user_id,
      t.input_snapshot_json,
      pr.id AS provider_request_id,
      pr.external_request_id,
      pr.status AS provider_request_status,
      pr.response_redacted_json AS provider_response_redacted_json,
      r.id AS reservation_id,
      r.amount_reserved
    FROM tasks t
    JOIN workflows w ON w.id = t.workflow_id
    LEFT JOIN LATERAL (
      SELECT request.*
      FROM provider_requests request
      WHERE request.task_id = t.id
      ORDER BY request.updated_at DESC, request.created_at DESC
      LIMIT 1
    ) pr ON true
    LEFT JOIN credit_reservations r ON r.task_id = t.id
    WHERE t.id = $1
      AND t.task_type = 'episode_generate_audio'
      AND t.status = ANY($2::text[])
    LIMIT 1
  `, [taskId, statuses]);
}

function findAudioArtifact(artifacts: MediaGenerationArtifact[] | undefined) {
  return artifacts?.find((artifact) => artifact.mediaType === "audio") ?? null;
}

function serializeAudioArtifact(artifact: MediaGenerationArtifact) {
  return {
    mediaType: "audio",
    mimeType: readString(artifact.mimeType) ?? null,
    fileExtension: readString(artifact.fileExtension) ?? null,
    url: readString(artifact.url) ?? null,
  };
}

function parseStoredAudioArtifact(value: unknown): MediaGenerationArtifact | null {
  const artifact = readRecord(value);
  if (readString(artifact.mediaType) !== "audio" || !readString(artifact.url)) return null;
  return {
    mediaType: "audio",
    mimeType: readString(artifact.mimeType) ?? null,
    fileExtension: readString(artifact.fileExtension) ?? null,
    url: readString(artifact.url),
  };
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return readRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return readRecord(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFailureCode(error: unknown) {
  if (error && typeof error === "object" && typeof (error as { failureCode?: unknown }).failureCode === "string") {
    return String((error as { failureCode: string }).failureCode);
  }
  return error instanceof Error ? error.message : undefined;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function shouldPreserveAudioSubmissionAsResultUnknown(status: string | null | undefined) {
  return status === "result_unknown";
}

export const __audioGenerationWorkerTestUtils = {
  shouldPreserveAudioSubmissionAsResultUnknown,
};
