import { createHash } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import {
  settleReservationAllocation,
  settleReservationAllocationInTransaction,
} from "../credit-billing/credit-ledger.service.ts";
import { resolveGenerationBillingAmount } from "../credit-billing/team-member-generation-credit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { UploadSessionRuntime } from "../storage/upload-session.service.ts";
import { findStorageObjectByKey } from "../storage/storage.service.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  finalizeTaskAttempt,
} from "../workflow-task/workflow-task.service.ts";
import { persistGptImageArtifact } from "./gpt-image.artifact-finalizer.ts";
import { assertCanvasGenerationAssignmentActive } from "./canvas-generation-assignment.guard.ts";
import { attachProviderRawResponse, readProviderRawResponse } from "./provider-response-diagnostics.ts";
import { translateProviderErrorMessage } from "./provider-error-message.ts";
import {
  readGenerationProviderRouteReferences,
  resolveGenerationModelConfigForTask,
} from "./generation-model-config-snapshot.ts";
import { resolveGenerationProviderFetch } from "./generation-provider-fetch.ts";
import { buildGenerationProviderPayloadRef } from "./generation-provider-request-identity.ts";
import {
  GENERATION_ARTIFACT_FETCH_NOT_READY,
  resolveGenerationArtifactStageUnavailable,
  resolveGenerationSkippedNextAction,
} from "./generation-skipped-coordinator.ts";
import {
  markGenerationTaskSnapshotRunning,
  markGenerationTaskSnapshotManualReviewRequired,
  markGenerationTaskSnapshotResultUnknown,
  markGenerationTaskSnapshotSucceeded,
} from "./generation-task-snapshot.service.ts";
import { failGenerationTaskAfterQueueError } from "./generation-redis-repair.service.ts";
import {
  findGenerationArtifactHandoff,
  findOrRecoverGenerationArtifactHandoff,
  recordGenerationArtifactHandoff,
} from "./generation-artifact-handoff.service.ts";
import { createProviderAdapterFromModelConfig } from "./provider-adapter.factory.ts";
import type { MediaGenerationArtifact, ProviderAdapter } from "./provider-adapter.contract.ts";
import {
  advanceProviderRequestStage,
  markProviderRequestFailed,
  markProviderRequestResultUnknown,
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
  external_submission_started_at: Date | string | null;
  external_request_id: string | null;
  provider_request_status: string | null;
  provider_response_redacted_json: Record<string, unknown> | string | null;
  reservation_id: string | null;
  amount_reserved: number | string | null;
}

interface AudioPollAdapter extends ProviderAdapter {
  poll(input: { externalRequestId: string; redactedPayload?: Record<string, unknown> }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    externalRequestId?: string;
    artifacts?: MediaGenerationArtifact[];
    redactedResponse: Record<string, unknown>;
  }>;
}

export async function processAudioGenerationSubmitJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId?: string | null;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "submitted"; providerStatus: "waiting" | "succeeded"; attemptId: string }
  | { status: "failed"; failureCode: string }
  | { status: "skipped"; nextAction?: "submit" | "poll" | "finalize" | "stop"; attemptId?: string }
> {
  const row = await findAudioTask(db, input.taskId, ["queued"]);
  if (!row) {
    const attemptId = await findCurrentAudioAttemptId(db, input.taskId);
    return {
      status: "skipped",
      ...(attemptId ? { attemptId } : {}),
      nextAction: await resolveGenerationSkippedNextAction(db, { taskId: input.taskId }),
    };
  }

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
    await assertCanvasGenerationAssignmentActive(db, snapshot);
    const context = await buildAudioProviderContext(db, claimedRow, snapshot, {
      env: input.env,
      fetchImpl: input.fetchImpl,
      now: input.now,
    });
    const submitted = await submitProviderRequest(db, {
      ...context.providerRequest,
      ...readGenerationProviderRouteReferences(snapshot),
      attemptId: claim.attempt.id,
      adapter: context.adapter,
    });
    if (submitted.kind === "stale_attempt") {
      const failureCode = "provider_request_attempt_conflict";
      const marked = await failAudioTask(db, {
        taskId: row.task_id,
        expectedAttemptId: claim.attempt.id,
        failureCode,
        displayMessage: "检测到历史供应商请求仍在执行，当前任务已停止自动处理并等待后台复核。",
        creditOutcome: "manual_review_required",
        now: input.now,
      });
      if (marked) {
        await markGenerationTaskSnapshotManualReviewRequired(db, {
          taskId: row.task_id,
          attemptId: claim.attempt.id,
          progressStage: "provider_attempt_conflict",
          failure: {
            failureCode,
            historicalProviderRequestId: submitted.request.id,
            displayMessage: "历史供应商请求仍在执行，任务已转后台复核，积分保持预留。",
          },
          creditSummary: {
            reserved: Number(row.amount_reserved ?? 0),
            settledAt: input.now.toISOString(),
          },
          now: input.now,
        });
      }
      return { status: "failed", failureCode };
    }
    await createUserModelRequestLog(db, {
      providerRequestId: submitted.request.id,
      ...context.auditLogInput,
      attemptId: claim.attempt.id,
      now: input.now,
    });
    if (submitted.kind === "already_started") {
      if (!submitted.request.externalRequestId) {
        await keepAudioTaskWaitingForExternalId(db, {
          taskId: row.task_id,
          now: input.now,
        });
        await markGenerationTaskSnapshotRunning(db, {
          taskId: row.task_id,
          attemptId: claim.attempt.id,
          providerRequestId: submitted.request.id,
          progressStage: "provider_result_unknown",
          providerStatus: {
            externalRequestId: null,
            providerStatus: submitted.request.status,
          },
          now: input.now,
        });
        return { status: "skipped", nextAction: "stop" };
      }
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
      return { status: "submitted", providerStatus: "waiting", attemptId: claim.attempt.id };
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
      return { status: "submitted", providerStatus: "succeeded", attemptId: claim.attempt.id };
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
    return { status: "submitted", providerStatus: "waiting", attemptId: claim.attempt.id };
  } catch (error) {
    const failureCode = readFailureCode(error) ?? "audio_provider_submission_failed";
    const displayMessage = translateProviderErrorMessage(error, {
      failureCode,
      fallbackMessage: "音频模型请求失败，积分已返还。请稍后重试。",
      mediaType: "audio",
      phase: "submit",
    });
    const latestProviderRequest = await findLatestAudioProviderRequest(
      db,
      row.task_id,
      claim.attempt.id,
    );
    await recordAudioRequestFailureAudit(db, {
      row: claimedRow,
      snapshot,
      failureCode,
      completeAsFailed: latestProviderRequest?.status !== "result_unknown",
      now: input.now,
    });
    if (latestProviderRequest && shouldPreserveAudioSubmissionAsResultUnknown(latestProviderRequest.status)) {
      await keepAudioTaskWaitingForExternalId(db, {
        taskId: row.task_id,
        now: input.now,
      });
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId: latestProviderRequest.id,
        progressStage: "provider_result_unknown",
        providerStatus: {
          failureCode: latestProviderRequest.failure_code ?? "provider_submission_ambiguous",
        },
        now: input.now,
      });
      return { status: "skipped", nextAction: "stop" };
    }
    await failAudioTask(db, {
      taskId: row.task_id,
      expectedAttemptId: claim.attempt.id,
      failureCode,
      displayMessage,
      now: input.now,
    });
    return { status: "failed", failureCode };
  }
}

async function keepAudioTaskWaitingForExternalId(
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

async function findCurrentAudioAttemptId(db: SqlDatabase, taskId: string) {
  const row = await queryOne<{ current_attempt_id: string | null }>(
    db,
    "SELECT current_attempt_id FROM tasks WHERE id = $1",
    [taskId],
  );
  return row?.current_attempt_id ?? null;
}

async function findLatestAudioProviderRequest(
  db: SqlDatabase,
  taskId: string,
  attemptId: string,
) {
  return queryOne<{ id: string; status: string; failure_code: string | null }>(db, `
    SELECT request.id, request.status, request.failure_code
    FROM provider_requests request
    JOIN tasks task ON task.id = request.task_id
    WHERE request.task_id = $1
      AND task.current_attempt_id = $2
      AND (
        request.attempt_id = $2
        OR (request.attempt_id IS NULL AND task.attempt_count = 1)
      )
    ORDER BY request.updated_at DESC, request.created_at DESC
    LIMIT 1
  `, [taskId, attemptId]);
}

export async function processAudioGenerationPollJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId?: string | null;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "waiting" }
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped"; nextAction?: "submit" | "poll" | "finalize" | "stop" }
> {
  const row = await findAudioTask(
    db,
    input.taskId,
    ["running", "result_unknown"],
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"),
    input.expectedAttemptId ?? null,
  );
  if (!row?.attempt_id || !row.provider_request_id || !row.external_request_id) {
    return {
      status: "skipped",
      nextAction: await resolveGenerationSkippedNextAction(db, { taskId: input.taskId }),
    };
  }
  if (!await claimAudioPollLease(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    now: input.now,
  })) {
    return {
      status: "skipped",
      nextAction: await resolveGenerationSkippedNextAction(db, { taskId: input.taskId }),
    };
  }
  const snapshot = parseRecord(row.input_snapshot_json);
  const context = await buildAudioProviderContext(db, row, snapshot, {
    env: input.env,
    fetchImpl: input.fetchImpl,
    now: input.now,
  });
  const poll = await context.adapter.poll({
    externalRequestId: row.external_request_id,
    redactedPayload: {
      ...snapshot,
      providerState: parseRecord(row.provider_response_redacted_json),
    },
  });
  const externalRequestId = readString(poll.externalRequestId) ?? row.external_request_id;
  if (externalRequestId !== row.external_request_id) {
    await advanceProviderRequestStage(db, {
      providerRequestId: row.provider_request_id,
      externalRequestId,
      redactedResponse: poll.redactedResponse,
      now: input.now,
    });
  }
  if (poll.status === "accepted" || poll.status === "running") {
    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      progressStage: poll.status === "accepted" ? "provider_accepted" : "provider_rendering",
      progressPercent: poll.status === "accepted" ? 40 : 60,
      providerStatus: { ...poll.redactedResponse, externalRequestId },
      now: input.now,
    });
    return { status: "waiting" };
  }
  if (poll.status === "failed") {
    const failureCode = "audio_provider_failed";
    const displayMessage = translateProviderErrorMessage(poll.redactedResponse, {
      failureCode,
      fallbackMessage: "音频生成失败，积分已返还。请稍后重试。",
      mediaType: "audio",
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
      responseText: JSON.stringify({ failureCode, providerStatus: poll.redactedResponse }),
      responseUsage: null,
      finishReasons: [],
      failureCode,
      now: input.now,
    });
    await failAudioTask(db, {
      taskId: row.task_id,
      expectedAttemptId: row.attempt_id,
      failureCode,
      displayMessage,
      now: input.now,
    });
    return { status: "failed", failureCode };
  }

  const artifact = findAudioArtifact(poll.artifacts);
  if (!artifact) {
    const failureCode = "audio_provider_artifact_missing";
    await failAudioTask(db, {
      taskId: row.task_id,
      expectedAttemptId: row.attempt_id,
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
    externalRequestId,
    artifact,
    providerStatus: poll.redactedResponse,
    now: input.now,
  });
  return { status: "succeeded" };
}

export async function fetchAudioGenerationArtifactJob(
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
  const row = await findAttemptScopedAudioTask(db, input, ["running", "result_unknown", "manual_review_required"]);
  if (!row?.attempt_id || !row.provider_request_id) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }
  const existing = await findOrRecoverGenerationArtifactHandoff(db, {
    taskId: input.taskId,
    attemptId: row.attempt_id,
    mediaType: "audio",
    now: input.now,
  });
  if (existing) return { status: "succeeded" };
  const artifact = parseStoredAudioArtifact(parseRecord(row.provider_response_redacted_json).artifact);
  if (!artifact) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }
  const snapshot = parseRecord(row.input_snapshot_json);
  await assertCanvasGenerationAssignmentActive(db, snapshot);
  await markGenerationTaskSnapshotRunning(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    progressStage: "artifact_fetching",
    progressPercent: 75,
    now: input.now,
  });
  const stored = await persistGptImageArtifact(db, {
    task: {
      userId: row.user_id,
      projectId: row.project_id,
      canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
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
  await recordGenerationArtifactHandoff(db, {
    taskId: row.task_id,
    mediaType: "audio",
    attemptId: row.attempt_id,
    storageObjectId: stored.storageObjectId,
    storageObjectKey: stored.storageObjectKey,
    contentType: stored.mimeType,
    now: input.now,
  });
  return { status: "succeeded" };
}

export async function finalizeAudioGenerationArtifactJob(
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
  const row = await findAttemptScopedAudioTask(db, input, ["running", "result_unknown", "manual_review_required"]);
  if (!row?.attempt_id || !row.provider_request_id) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }
  const providerResponse = parseRecord(row.provider_response_redacted_json);
  const artifact = parseStoredAudioArtifact(providerResponse.artifact);
  if (!artifact) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }
  const snapshot = parseRecord(row.input_snapshot_json);

  try {
    await assertCanvasGenerationAssignmentActive(db, snapshot);
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
        canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
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
    const transcription = readString(artifact.transcript) ?? readString(providerResponse.transcript);
    const parameters = readRecord(snapshot.parameters);
    const lyrics = readString(artifact.lyrics)
      ?? readString(providerResponse.lyrics)
      ?? readString(parameters.lyrics);
    const musicTitle = readString(artifact.title)
      ?? readString(providerResponse.title)
      ?? readString(parameters.musicTitle);
    const resultAsset = {
      ...persisted,
      ...(transcription ? { transcript: transcription } : {}),
      ...(lyrics ? { lyrics } : {}),
      ...(musicTitle ? { musicTitle } : {}),
      ...(readString(parameters.lyricsMode) ? { lyricsMode: readString(parameters.lyricsMode) } : {}),
      ...(readString(parameters.mode)
        ? { audioGenerationMode: readString(parameters.mode) }
        : {}),
    };
    const amount = resolveGenerationBillingAmount(row.amount_reserved, snapshot);
    await finalizeTaskAttempt(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      status: "succeeded",
      now: input.now,
      finalize: async () => {
        if (row.reservation_id && amount > 0) {
          await reopenAudioManualReviewReservationForSettlement(db, {
            reservationId: row.reservation_id,
            now: input.now,
          });
          await settleReservationAllocationInTransaction(db, {
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
           resultAssets: [resultAsset],
          providerStatus: {
            provider: "model-gateway",
            externalRequestId: row.external_request_id,
          },
          creditSummary: { consumed: amount, settledAt: input.now.toISOString() },
          now: input.now,
        });
      },
    });
    await aggregateWorkflowStatus(db, row.workflow_id);
    return { status: "succeeded" };
  } catch (error) {
    const failureCode = readFailureCode(error) ?? "provider_output_persist_failed";
    if (failureCode === "task_finalization_state_conflict") {
      return { status: "skipped" };
    }
    if (failureCode === "provider_output_persist_failed") {
      await finalizeTaskAttempt(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        status: "manual_review_required",
        failureCode,
        now: input.now,
      });
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
      await aggregateWorkflowStatus(db, row.workflow_id);
      return { status: "failed", failureCode };
    }
    await failAudioTask(db, {
      taskId: row.task_id,
      expectedAttemptId: row.attempt_id,
      failureCode,
      displayMessage: "音频结果归档失败，任务已停止并按结果状态处理。",
      now: input.now,
    });
    return { status: "failed", failureCode };
  }
}

export async function persistAudioGenerationArtifactJob(
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
  const row = await findAttemptScopedAudioTask(db, input, ["running", "result_unknown", "manual_review_required"]);
  if (!row?.attempt_id || !row.provider_request_id) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: "provider_output_persist_failed",
    });
  }
  const handoff = await findGenerationArtifactHandoff(db, row.task_id);
  if (!handoff || handoff.mediaType !== "audio" || handoff.attemptId !== row.attempt_id) {
    return { status: "failed", failureCode: "provider_output_persist_failed" };
  }
  const storageObject = await findStorageObjectByKey(db, {
    userId: row.created_by_user_id ?? row.user_id,
    objectKey: handoff.storageObjectKey,
  });
  if (!storageObject || storageObject.status !== "available") {
    return { status: "failed", failureCode: "provider_output_persist_failed" };
  }
  const snapshot = parseRecord(row.input_snapshot_json);
  await assertCanvasGenerationAssignmentActive(db, snapshot);
  const providerResponse = parseRecord(row.provider_response_redacted_json);
  const artifact = parseStoredAudioArtifact(providerResponse.artifact);
  const url = buildAudioStorageUrl(input.runtime, storageObject.objectKey);
  const persisted = {
    assetId: null,
    assetVersionId: null,
    storageObjectId: storageObject.id,
    storageObjectKey: storageObject.objectKey,
    mediaKind: "audio",
    mimeType: storageObject.contentType,
    url,
    previewUrl: url,
    sourceUrl: url,
    downloadUrl: url,
    ...(readString(artifact?.transcript) || readString(providerResponse.transcript)
      ? { transcript: readString(artifact?.transcript) ?? readString(providerResponse.transcript) }
      : {}),
    ...(readString(artifact?.lyrics) || readString(providerResponse.lyrics) || readString(readRecord(snapshot.parameters).lyrics)
      ? { lyrics: readString(artifact?.lyrics) ?? readString(providerResponse.lyrics) ?? readString(readRecord(snapshot.parameters).lyrics) }
      : {}),
    ...(readString(artifact?.title) || readString(providerResponse.title) || readString(readRecord(snapshot.parameters).musicTitle)
      ? { musicTitle: readString(artifact?.title) ?? readString(providerResponse.title) ?? readString(readRecord(snapshot.parameters).musicTitle) }
      : {}),
    ...(readString(readRecord(snapshot.parameters).lyricsMode)
      ? { lyricsMode: readString(readRecord(snapshot.parameters).lyricsMode) }
      : {}),
    ...(readString(readRecord(snapshot.parameters).mode)
      ? { audioGenerationMode: readString(readRecord(snapshot.parameters).mode) }
      : {}),
  };
  const amount = resolveGenerationBillingAmount(row.amount_reserved, snapshot);
  await finalizeTaskAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    status: "succeeded",
    now: input.now,
    finalize: async () => {
      if (row.reservation_id && amount > 0) {
        await reopenAudioManualReviewReservationForSettlement(db, {
          reservationId: row.reservation_id,
          now: input.now,
        });
        await settleReservationAllocationInTransaction(db, {
          reservationId: row.reservation_id,
          allocationKey: "audio-generation-persist",
          amount,
          outcome: "consumed",
          taskId: row.task_id,
          attemptId: row.attempt_id,
          providerRequestId: row.provider_request_id,
          metadata: {
            mediaType: "audio",
            modelCode: readString(snapshot.model),
            storageObjectId: storageObject.id,
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
    },
  });
  await aggregateWorkflowStatus(db, row.workflow_id);
  return { status: "succeeded" };
}

export async function expireAudioGenerationPollJob(
  db: SqlDatabase,
  input: { taskId: string; expectedAttemptId?: string | null; now: Date },
) {
  const row = await findAudioTask(
    db,
    input.taskId,
    ["running", "result_unknown"],
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"),
    input.expectedAttemptId ?? null,
  );
  if (!row) {
    return { status: "failed" as const, failureCode: "audio_provider_poll_timeout" as const };
  }
  const failureCode = "audio_provider_poll_timeout";
  const timeoutResponse = {
    externalRequestId: row.external_request_id ?? null,
    failureCode,
  };
  const snapshot = parseRecord(row.input_snapshot_json);
  if (
    row.provider_request_id
    && (
      row.external_submission_started_at
      || row.external_request_id
      || ["submitted", "accepted", "running", "result_unknown", "succeeded"].includes(row.provider_request_status ?? "")
    )
    && !["failed", "canceled"].includes(row.provider_request_status ?? "")
  ) {
    const provider = await markProviderRequestResultUnknown(db, {
      providerRequestId: row.provider_request_id,
      failureCode,
      redactedResponse: timeoutResponse,
      now: input.now,
    });
    if (provider.status === "result_unknown") {
      await markAudioTaskResultUnknown(db, {
        row,
        failureCode,
        providerRequestId: row.provider_request_id,
        metadata: timeoutResponse,
        now: input.now,
      });
      await markGenerationTaskSnapshotResultUnknown(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        providerStatus: timeoutResponse,
        failure: {
          failureCode,
          displayMessage: "音频生成已超过自动轮询窗口，但供应商终态尚未确认。系统将继续后台复核，积分保持预留。",
        },
        creditSummary: {
          reserved: resolveGenerationBillingAmount(row.amount_reserved, snapshot),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      return { status: "failed" as const, failureCode: "audio_provider_poll_timeout" as const };
    }
    if (provider.status === "succeeded") {
      return { status: "failed" as const, failureCode: "audio_provider_poll_timeout" as const };
    }
  }
  if (row.provider_request_id) {
    if (!["failed", "canceled"].includes(row.provider_request_status ?? "")) {
      await markProviderRequestFailed(db, {
        providerRequestId: row.provider_request_id,
        failureCode,
        redactedResponse: timeoutResponse,
        now: input.now,
      });
      await completeUserModelRequestLog(db, {
        providerRequestId: row.provider_request_id,
        status: "failed",
        responseText: JSON.stringify(timeoutResponse),
        responseUsage: null,
        finishReasons: [],
        failureCode,
        now: input.now,
      });
    }
  }
  await failAudioTask(db, {
    taskId: row.task_id,
    expectedAttemptId: row.attempt_id,
    failureCode,
    displayMessage: "音频生成超过 1 小时仍未返回结果，已按失败处理并返还积分。请重新发起生成。",
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
  if (
    !modelConfig
    || modelConfig.mediaType !== "audio"
    || !["aliyun_bailian_audio", "apimart_audio"].includes(modelConfig.providerProtocol)
  ) {
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
    canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
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
    canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
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
      mediaType: modelConfig.mediaType,
      providerConfig: modelConfig.providerConfig,
      invocationMode: modelConfig.invocationMode,
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
    SELECT request.id
    FROM provider_requests request
    JOIN tasks task ON task.id = request.task_id
    WHERE request.task_id = $1
      AND task.current_attempt_id = $2
      AND (
        request.attempt_id = $2
        OR (request.attempt_id IS NULL AND task.attempt_count = 1)
      )
    ORDER BY request.updated_at DESC, request.created_at DESC
    LIMIT 1
  `, [input.row.task_id, input.row.attempt_id]);
  if (!providerRequest) return;
  const modelCode = readString(input.snapshot.model) ?? "cosyvoice-v2";
  const modelSnapshot = readRecord(readRecord(input.snapshot.modelConfigSnapshot).config);
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
    canvasProjectId: readString(input.snapshot.canvasProjectId) ?? null,
    workflowId: input.row.workflow_id,
    taskId: input.row.task_id,
    attemptId: input.row.attempt_id,
    userId: input.row.created_by_user_id,
    providerName: readString(modelSnapshot.providerName) ?? "audio-provider",
    providerOperation: operationNames.canvasAudioGenerate,
    modelId: modelCode,
    providerModel: readString(modelSnapshot.providerModel) ?? modelCode,
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
    redactedResponse: attachProviderRawResponse(
      { ...input.providerStatus, artifact: serializedArtifact },
      readProviderRawResponse(input.providerStatus),
    ),
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
    expectedAttemptId?: string | null;
    failureCode: string;
    displayMessage: string;
    creditOutcome?: "released" | "manual_review_required";
    now: Date;
  },
) {
  return failGenerationTaskAfterQueueError(db, input);
}

async function markAudioTaskResultUnknown(
  db: SqlDatabase,
  input: {
    row: AudioTaskRow;
    failureCode: string;
    providerRequestId: string | null;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  const snapshot = parseRecord(input.row.input_snapshot_json);
  const amount = resolveGenerationBillingAmount(input.row.amount_reserved, snapshot);
  if (!input.row.attempt_id) return false;
  await finalizeTaskAttempt(db, {
    taskId: input.row.task_id,
    attemptId: input.row.attempt_id,
    status: "result_unknown",
    failureCode: input.failureCode,
    now: input.now,
    finalize: async () => {
      if (input.row.reservation_id && amount > 0) {
        await settleReservationAllocationInTransaction(db, {
          reservationId: input.row.reservation_id,
          allocationKey: input.failureCode,
          amount,
          outcome: "manual_review_required",
          taskId: input.row.task_id,
          attemptId: input.row.attempt_id,
          providerRequestId: input.providerRequestId,
          metadata: input.metadata,
          now: input.now,
        });
      }
    },
  });
  await aggregateWorkflowStatus(db, input.row.workflow_id);
  return true;
}

async function reopenAudioManualReviewReservationForSettlement(
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

function findAttemptScopedAudioTask(
  db: SqlDatabase,
  input: { taskId: string; expectedAttemptId?: string | null },
  statuses: string[],
) {
  return findAudioTask(
    db,
    input.taskId,
    statuses,
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"),
    input.expectedAttemptId ?? null,
  );
}

async function findAudioTask(
  db: SqlDatabase,
  taskId: string,
  statuses: string[],
  enforceExpectedAttempt = false,
  expectedAttemptId: string | null = null,
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
      pr.external_submission_started_at,
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
        $3::boolean = false
        OR ($4::uuid IS NOT NULL AND t.current_attempt_id = $4)
        OR ($4::uuid IS NULL AND t.attempt_count <= 1)
      )
      AND t.task_type = 'episode_generate_audio'
      AND t.status = ANY($2::text[])
      AND (
        t.status <> 'manual_review_required'
        OR t.failure_code IN ('provider_output_persist_failed', 'generation_queue_error')
      )
    LIMIT 1
  `, [taskId, statuses, enforceExpectedAttempt, expectedAttemptId]);
}

async function claimAudioPollLease(
  db: SqlDatabase,
  input: { taskId: string; attemptId: string; now: Date },
) {
  const lockedUntil = new Date(input.now.getTime() + 15 * 60_000);
  const claimed = await queryOne<{ id: string }>(db, `
    WITH claimed_task AS (
      UPDATE tasks
      SET status = 'running',
          failure_code = NULL,
          locked_by = 'audio-generation-poll-worker',
          locked_until = $3,
          heartbeat_at = $4,
          updated_at = $4
      WHERE id = $1
        AND current_attempt_id = $2
        AND status IN ('running', 'result_unknown')
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
        locked_by = 'audio-generation-poll-worker',
        locked_until = $3,
        heartbeat_at = $4,
        finished_at = NULL,
        updated_at = $4
    WHERE id = $2
      AND task_id = $1
      AND status IN ('running', 'result_unknown')
      AND EXISTS (SELECT 1 FROM claimed_task)
    RETURNING id
  `, [input.taskId, input.attemptId, lockedUntil, input.now]);
  return Boolean(claimed);
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
    ...(readString(artifact.transcript) ? { transcript: readString(artifact.transcript) } : {}),
    ...(readString(artifact.lyrics) ? { lyrics: readString(artifact.lyrics) } : {}),
    ...(readString(artifact.title) ? { title: readString(artifact.title) } : {}),
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
    ...(readString(artifact.transcript) ? { transcript: readString(artifact.transcript) } : {}),
    ...(readString(artifact.lyrics) ? { lyrics: readString(artifact.lyrics) } : {}),
    ...(readString(artifact.title) ? { title: readString(artifact.title) } : {}),
  };
}

function buildAudioStorageUrl(runtime: UploadSessionRuntime, objectKey: string) {
  const publicBaseUrl = runtime.publicBaseUrl?.trim().replace(/\/+$/g, "")
    || process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/g, "")
    || process.env.STORAGE_ENDPOINT?.trim().replace(/\/+$/g, "")
    || "";
  return publicBaseUrl
    ? `${publicBaseUrl}/${objectKey}`
    : runtime.bucket && runtime.region
      ? `https://${runtime.bucket}.cos.${runtime.region}.myqcloud.com/${objectKey}`
      : objectKey;
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
