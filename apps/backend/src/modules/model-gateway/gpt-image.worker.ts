import { createHash, randomUUID } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import {
  grantPromptSkillsUsageCredits,
  settleReservationAllocation,
  settleReservationAllocationInTransaction,
} from "../credit-billing/credit-ledger.service.ts";
import {
  refundTeamMemberGenerationCredits,
  refundTeamMemberGenerationCreditsInTransaction,
  resolveGenerationBillingAmount,
} from "../credit-billing/team-member-generation-credit.service.ts";
import { createAssetVersionSnapshot } from "../project/asset-version-record.service.ts";
import { ensureProjectUploadRecordForStorageObject } from "../project/project-upload-record.service.ts";
import { assertCanvasGenerationAssignmentActive } from "./canvas-generation-assignment.guard.ts";
import type { AssetType } from "../project/asset.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { UploadSessionRuntime } from "../storage/upload-session.service.ts";
import { findStorageObjectByKey } from "../storage/storage.service.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  finalizeTaskAttempt,
} from "../workflow-task/workflow-task.service.ts";
import { resolveImageProviderAdapterKey } from "../model-catalog/provider-adapter-routing.ts";
import { findActiveAiModelDispatchPolicyByModelCode } from "../model-catalog/ai-model-config.store.ts";
import {
  appendGenerationTaskCreatedOutboxEvent,
  rescheduleGenerationTaskCreatedOutboxEvent,
} from "./generation-outbox.service.ts";
import { createProviderAdapterFromModelConfig } from "./provider-adapter.factory.ts";
import type { MediaGenerationArtifact, ProviderPollResult } from "./provider-adapter.contract.ts";
import type { ProviderRateLimiter, ProviderRateLimitGrant } from "./provider-rate-limiter.ts";
import { ModelError, translateProviderErrorMessage } from "./provider-error-message.ts";
import { attachProviderRawResponse, readProviderRawResponse } from "./provider-response-diagnostics.ts";
import { buildCumobImagePayload } from "./cumob-image.provider-adapter.ts";
import { buildGlobalAiOpcImagePayload } from "./global-ai-opc-image.provider-adapter.ts";
import { registerGeneratedImageWithGlobalAiOpc } from "./global-ai-opc-material.service.ts";
import { buildSanBaoImagePayload } from "./san-bao.provider-adapter.ts";
import { resolveGenerationProviderFetch } from "./generation-provider-fetch.ts";
import { buildGenerationProviderPayloadRef } from "./generation-provider-request-identity.ts";
import {
  GENERATION_ARTIFACT_FETCH_NOT_READY,
  resolveGenerationArtifactStageUnavailable,
  resolveGenerationSkippedNextAction,
} from "./generation-skipped-coordinator.ts";
import {
  readGenerationProviderRouteReferences,
  resolveGenerationModelConfigForTask,
} from "./generation-model-config-snapshot.ts";
import { generationTimeoutMsFor } from "./generation-timeout.policy.ts";
import {
  createOrReuseProviderRequest,
  markProviderRequestFailed,
  markProviderRequestSucceeded,
  markProviderRequestResultUnknown,
  submitProviderRequest,
} from "./provider-request.service.ts";
import {
  completeUserModelRequestLog,
  createUserModelRequestLog,
} from "./user-model-request-log.service.ts";
import {
  parseGptImageArtifactFromProviderResponse,
  persistGptImageArtifact,
  serializeGptImageArtifactForProviderResponse,
} from "./gpt-image.artifact-finalizer.ts";
import {
  findGenerationArtifactHandoff,
  findOrRecoverGenerationArtifactHandoff,
  recordGenerationArtifactHandoff,
} from "./generation-artifact-handoff.service.ts";
import {
  markGenerationTaskSnapshotFailed,
  markGenerationTaskSnapshotManualReviewRequired,
  markGenerationTaskSnapshotResultUnknown,
  markGenerationTaskSnapshotRunning,
  markGenerationTaskSnapshotSucceeded,
} from "./generation-task-snapshot.service.ts";

interface GptImageTaskRow {
  task_id: string;
  workflow_id: string;
  attempt_id: string | null;
  task_status?: string | null;
  queue_name?: string | null;
  target_entity_type?: string | null;
  target_entity_id?: string | null;
  user_id: string;
  project_id: string | null;
  input_snapshot_json: Record<string, unknown> | string;
  created_by_user_id: string | null;
  provider_request_id?: string | null;
  provider_status?: string | null;
  provider_failure_code?: string | null;
  external_submission_started_at?: Date | string | null;
  external_request_id?: string | null;
  provider_response_redacted_json?: Record<string, unknown> | string | null;
  reservation_id: string | null;
  amount_reserved: number | string | null;
  snapshot_provider_status_json?: Record<string, unknown> | string | null;
}

type PersistedGptImageArtifact = Omit<
  Awaited<ReturnType<typeof persistGptImageArtifact>>,
  "assetId" | "assetVersionId"
> & {
  assetId: string | null;
  assetVersionId: string | null;
};

const SUBMIT_PROVIDER_LIMIT_BYPASS = 1_000_000_000;

function readSnapshotTeamMemberId(snapshot: Record<string, unknown>) {
  const candidate = snapshot.teamMemberId ?? snapshot.memberId;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function resolveRateLimitUserId(userId: string, snapshot: Record<string, unknown>) {
  const teamMemberId = readSnapshotTeamMemberId(snapshot);
  return teamMemberId ? `${userId}:member:${teamMemberId}` : userId;
}

function readTeamAssetTargetId(snapshot: Record<string, unknown>) {
  return readString(snapshot.targetType) === "team_asset"
    ? readString(snapshot.targetId) ?? null
    : null;
}

async function updateTeamAssetGenerationResult(
  db: SqlDatabase,
  input: {
    snapshot: Record<string, unknown>;
    userId: string;
    status: "active" | "failed";
    previewUrl?: string | null;
    storageObjectId?: string | null;
    now: Date;
  },
) {
  const assetId = readTeamAssetTargetId(input.snapshot);
  if (!assetId) {
    return;
  }
  await db.query(
    `
      UPDATE team_assets
      SET asset_status = $2,
          asset_url = CASE WHEN $2 = 'active' THEN $3 ELSE asset_url END,
          storage_object_id = CASE WHEN $2 = 'active' THEN $4 ELSE storage_object_id END,
          resource_size = CASE
            WHEN $2 = 'active' THEN COALESCE(
              (SELECT size_bytes FROM storage_objects WHERE id = $4),
              resource_size
            )
            ELSE resource_size
          END,
          updated_at = $5
      WHERE id = $1
        AND admin_user_id = $6
    `,
    [assetId, input.status, input.previewUrl ?? null, input.storageObjectId ?? null, input.now, input.userId],
  );
}

function readProjectAssetTargetId(snapshot: Record<string, unknown>) {
  return readString(snapshot.targetType) === "asset"
    ? readString(snapshot.projectAssetId) ?? readString(snapshot.targetId) ?? null
    : null;
}

async function updateProjectAssetGenerationTerminalResult(
  db: SqlDatabase,
  input: {
    row: GptImageTaskRow;
    snapshot: Record<string, unknown>;
    status: "failed" | "manual_review_required" | "result_unknown";
    failureCode: string;
    now: Date;
  },
) {
  const assetId = readProjectAssetTargetId(input.snapshot);
  if (!assetId) {
    return;
  }
  await db.query(
    `
      WITH target_version AS (
        SELECT version.id
        FROM asset_versions version
        JOIN assets asset ON asset.id = version.asset_id
        WHERE asset.id = $1
          AND ($2::uuid IS NULL OR asset.project_id = $2)
          AND COALESCE(
            version.metadata_json ->> 'generationTaskId',
            version.metadata_json -> 'generationResult' ->> 'taskId'
          ) = $3::text
        ORDER BY version.version_number DESC
        LIMIT 1
      ), updated_version AS (
        UPDATE asset_versions version
        SET metadata_json = COALESCE(version.metadata_json, '{}'::jsonb) || jsonb_build_object(
              'generationTaskId', $3::text,
              'generationStatus', $4::text,
              'generationResult', COALESCE(version.metadata_json -> 'generationResult', '{}'::jsonb) ||
                jsonb_build_object(
                  'taskId', $3::text,
                  'status', $4::text,
                  'workflowStatus', $4::text,
                  'failureCode', $5::text,
                  'failure', jsonb_build_object('failureCode', $5::text)
                )
            )
        WHERE version.id = (SELECT id FROM target_version)
        RETURNING version.asset_id
      )
      UPDATE assets
      SET updated_at = GREATEST(updated_at, $6)
      WHERE id = $1
        AND EXISTS (SELECT 1 FROM updated_version)
    `,
    [assetId, input.row.project_id, input.row.task_id, input.status, input.failureCode, input.now],
  );
}

async function createProjectAssetGenerationVersion(
  db: SqlDatabase,
  input: {
    row: GptImageTaskRow;
    snapshot: Record<string, unknown>;
    artifact: PersistedGptImageArtifact;
    now: Date;
  },
) {
  const assetId = readString(input.snapshot.projectAssetId);
  if (!assetId || !input.row.project_id) {
    return null;
  }
  const asset = await queryOne<{
    project_id: string;
    asset_type: AssetType;
    asset_key: string;
  }>(
    db,
    `
      SELECT project_id, asset_type, asset_key
      FROM assets
      WHERE id = $1
        AND project_id = $2
      LIMIT 1
    `,
    [assetId, input.row.project_id],
  );
  if (!asset) {
    throw Object.assign(new Error("project_asset_generation_target_missing"), {
      failureCode: "provider_output_persist_failed",
      storageObjectKey: input.artifact.storageObjectKey,
    });
  }
  const image = {
    id: input.row.task_id,
    mediaKind: "image",
    url: input.artifact.previewUrl,
    src: input.artifact.previewUrl,
    previewUrl: input.artifact.previewUrl,
    sourceUrl: input.artifact.sourceUrl,
    downloadUrl: input.artifact.downloadUrl,
    storageObjectId: input.artifact.storageObjectId,
    storageObjectKey: input.artifact.storageObjectKey,
    mimeType: input.artifact.mimeType,
  };
  return createAssetVersionSnapshot(db, {
    userId: input.row.user_id,
    projectId: asset.project_id,
    assetType: asset.asset_type,
    assetKey: asset.asset_key,
    createdByUserId: input.row.created_by_user_id ?? "",
    storageObjectId: input.artifact.storageObjectId,
    storageObjectKey: input.artifact.storageObjectKey,
    metadata: {
      source: "generated",
      label: readString(input.snapshot.projectAssetName) ?? "Generated project asset",
      description: readString(input.snapshot.prompt) ?? "",
      mimeType: input.artifact.mimeType,
      taskId: input.row.task_id,
      generationTaskId: input.row.task_id,
      generationStatus: "completed",
      generationResult: {
        taskId: input.row.task_id,
        status: "completed",
        workflowStatus: "completed",
        resultAssets: [image],
        fixedImages: [image],
        result: {
          mediaKind: "image",
          imageUrl: input.artifact.previewUrl,
          previewUrl: input.artifact.previewUrl,
          sourceUrl: input.artifact.sourceUrl,
          downloadUrl: input.artifact.downloadUrl,
          storageObjectId: input.artifact.storageObjectId,
        },
      },
      generationPrompt: readString(input.snapshot.prompt) ?? null,
      generationModel: readString(input.snapshot.model) ?? null,
      generationParameters: input.snapshot.parameters ?? {},
      fixedImageUrl: input.artifact.previewUrl,
      previewUrl: input.artifact.previewUrl,
      sourceUrl: input.artifact.sourceUrl,
      downloadUrl: input.artifact.downloadUrl,
      fixedImageStorageObjectId: input.artifact.storageObjectId,
      storageObjectKey: input.artifact.storageObjectKey,
      targetType: "asset",
      targetId: assetId,
    },
    sourceTaskId: input.row.task_id,
    sourceAttemptId: input.row.attempt_id,
    now: input.now,
  });
}

function resolveGptImageBillingAmount(row: GptImageTaskRow, snapshot: Record<string, unknown>) {
  return resolveGenerationBillingAmount(row.amount_reserved, snapshot);
}

interface GptImagePollAdapter {
  poll(input: { externalRequestId: string; redactedPayload?: Record<string, unknown> }): Promise<ProviderPollResult>;
}

export async function processGptImageSubmitJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    rateLimiter?: ProviderRateLimiter;
    userConcurrencyLimit?: number;
    now: Date;
  },
): Promise<
  | { status: "submitted"; providerStatus?: "waiting" | "succeeded"; attemptId: string }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "failed"; failureCode: string }
  | { status: "skipped"; nextAction?: "submit" | "poll" | "finalize" | "stop"; attemptId?: string }
> {
  const row = await findGptImageTaskForSubmit(db, input.taskId);
  if (!row) {
    return recoverFailedGptImageSubmitJob(db, {
      taskId: input.taskId,
      now: input.now,
    });
  }

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const modelCode = readString(snapshot.model) || "gpt-image-2-cn";
  const modelConfig = await resolveGenerationModelConfigForTask(db, snapshot, modelCode);
  const providerLabel = "model-gateway";
  const providerName = modelConfig?.providerName || "openai";
  const providerModel = modelConfig?.providerModel || fallbackGptImageModelConfig().providerModel;
  const permit = await acquireGptImageSubmitPermit(input.rateLimiter, {
    providerName,
    modelCode,
    userId: resolveRateLimitUserId(row.created_by_user_id ?? row.user_id, snapshot),
    userConcurrencyLimit: input.userConcurrencyLimit ?? 20,
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
    workerId: "gpt-image-submit-worker",
    now: input.now,
    leaseMs: 15 * 60_000,
  });
  if (!claim) {
    if (permit?.granted) {
      await permit.release();
    }
    return { status: "skipped" };
  }
  await markGenerationTaskSnapshotRunning(db, {
    taskId: row.task_id,
    attemptId: claim.attempt.id,
    progressStage: "running",
    progressPercent: 50,
    now: input.now,
  });
  let providerRequestId: string | null = null;
  try {
    await assertCanvasGenerationAssignmentActive(db, snapshot);
    const payloadRef = buildGenerationProviderPayloadRef({
      targetType: snapshot.targetType,
      targetId: snapshot.targetId,
      episodeId: snapshot.episodeId,
      taskId: row.task_id,
      mediaType: "image",
    });
    const prompt = readString(snapshot.prompt) || "";
    const requestKey = `${row.workflow_id}:${row.task_id}`;
    const requestHash = sha256(`${row.task_id}:${modelCode}:${prompt}`);
    const payloadHash = sha256(`${payloadRef}:${prompt}`);
    const requestBody = {
      prompt,
      model: modelCode,
      parameters: readObject(snapshot.parameters),
      episodeId: readString(snapshot.episodeId),
      targetType: readString(snapshot.targetType) ?? "episode",
      targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId),
    };
    const requestLogBody = buildGptImageRequestLogBody({
      requestBody,
      modelConfig,
      providerName,
      providerOperation: operationNames.episodeImageGenerate,
      providerModel,
      requestKey,
      payloadRef,
      payloadHash,
    });
    const preparedProviderRequest = await createOrReuseProviderRequest(db, {
      projectId: row.project_id,
      canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
      workflowId: row.workflow_id,
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerName,
      providerOperation: operationNames.episodeImageGenerate,
      requestKey,
      requestHash,
      payloadRef,
      payloadHash,
      redactedPayload: requestBody,
      ...readGenerationProviderRouteReferences(snapshot),
      userId: row.user_id,
      now: input.now,
    });
    providerRequestId = preparedProviderRequest.request.id;
    if (
      requestLogBody.requestFormat === "cumob_image" &&
      preparedProviderRequest.request.status === "created" &&
      !preparedProviderRequest.request.externalSubmissionStartedAt &&
      preparedProviderRequest.request.attemptId !== claim.attempt.id
    ) {
      await bindPreparedProviderRequestToAttempt(db, {
        providerRequestId,
        attemptId: claim.attempt.id,
        now: input.now,
      });
    }
    await createUserModelRequestLog(db, {
      providerRequestId,
      projectId: row.project_id,
      canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
      workflowId: row.workflow_id,
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      userId: row.created_by_user_id,
      providerName,
      providerOperation: operationNames.episodeImageGenerate,
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
    const adapter = createProviderAdapterFromModelConfig(
      modelConfig
        ? {
            providerProtocol: modelConfig.providerProtocol,
            providerModel,
            mediaType: modelConfig.mediaType,
            providerConfig: modelConfig.providerConfig,
            invocationMode: modelConfig.invocationMode,
          }
        : fallbackGptImageModelConfig(),
      input.env,
      resolveGenerationProviderFetch(input.fetchImpl, "image", input.env),
    );
    const submitted = await submitProviderRequest(db, {
      projectId: row.project_id,
      workflowId: row.workflow_id,
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerName,
      providerOperation: operationNames.episodeImageGenerate,
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
    if (submitted.kind === "stale_attempt") {
      const failureCode = "provider_request_attempt_conflict";
      const claimedRow = { ...row, attempt_id: claim.attempt.id };
      await markGptImageTaskManualReview(db, {
        row: claimedRow,
        failureCode,
        providerRequestId: null,
        metadata: {
          billingEvent: "manual_review_required",
          outcome: "manual_review_required",
          provider: providerLabel,
          historicalProviderRequestId: submitted.request.id,
          failureCode,
          settledAt: input.now,
        },
        now: input.now,
      });
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
          reserved: resolveGptImageBillingAmount(row, snapshot),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      return { status: "failed", failureCode };
    }
    providerRequestId = submitted.request.id;
    const submittedArtifacts = submitted.kind === "submitted" ? submitted.artifacts : undefined;
    if (
      requestLogBody.requestFormat === "cumob_image" &&
      !submittedArtifacts?.length &&
      !submitted.request.externalRequestId
    ) {
      const failureCode = "provider_result_unknown";
      await markProviderRequestResultUnknown(db, {
        providerRequestId: submitted.request.id,
        failureCode,
        redactedResponse: {
          providerStatus: submitted.request.status,
          externalRequestId: submitted.request.externalRequestId,
        },
        now: input.now,
      });
      await markGptImageTaskResultUnknown(db, {
        row: { ...row, attempt_id: claim.attempt.id },
        failureCode,
        providerRequestId: submitted.request.id,
        metadata: buildWorkerBillingMetadata(row, snapshot, {
          billingEvent: "manual_review_required",
          outcome: "manual_review_required",
          provider: providerLabel,
          providerRequestId: submitted.request.id,
          externalRequestId: submitted.request.externalRequestId,
          failureCode,
          errorMessage: "Cumob returned a non-terminal task without an image artifact",
          settledAt: input.now,
        }),
        now: input.now,
      });
      await markGenerationTaskSnapshotResultUnknown(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId: submitted.request.id,
        failure: {
          failureCode,
          displayMessage: "供应商已接收图片任务，但尚未返回最终结果，任务与积分状态等待后台复核。",
        },
        providerStatus: {
          provider: providerLabel,
          providerStatus: submitted.request.status,
          externalRequestId: submitted.request.externalRequestId,
        },
        creditSummary: {
          reserved: resolveGptImageBillingAmount(row, snapshot),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      return { status: "skipped" };
    }
    if (!submittedArtifacts?.length && submitted.request.externalRequestId) {
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId: submitted.request.id,
        progressPercent: 50,
        progressStage: submitted.request.status === "running"
          ? "provider_rendering"
          : "provider_accepted",
        providerStatus: {
          provider: providerLabel,
          providerStatus: submitted.request.status,
          externalRequestId: submitted.request.externalRequestId,
        },
        now: input.now,
      });
      return {
        status: "submitted",
        providerStatus: submitted.request.status === "succeeded" ? "succeeded" : "waiting",
        attemptId: claim.attempt.id,
      };
    }
    if (submitted.kind !== "submitted" || !submittedArtifacts?.length) {
      throw Object.assign(new Error("gpt_image_artifact_missing"), {
        failureCode: "provider_output_download_failed",
      });
    }

    const artifact = submittedArtifacts.find((item) => item.mediaType === "image");
    if (!artifact) {
      throw Object.assign(new Error("gpt_image_image_artifact_missing"), {
        failureCode: "provider_output_download_failed",
      });
    }

    await markProviderRequestSucceeded(db, {
      providerRequestId,
      externalRequestId: submitted.request.externalRequestId,
      now: input.now,
      redactedResponse: attachProviderRawResponse({
        ...(submitted.request.redactedResponse ?? {}),
        artifact: serializeGptImageArtifactForProviderResponse(artifact),
      }, readProviderRawResponse(submitted.request.redactedResponse)),
    });
    await completeUserModelRequestLog(db, {
      providerRequestId,
      status: "succeeded",
      responseText: buildGptImageResponseText(artifact, submitted.request.externalRequestId),
      responseUsage: null,
      finishReasons: [],
      now: input.now,
    });
    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerRequestId,
      progressPercent: 50,
      progressStage: "provider_succeeded",
      providerStatus: {
        provider: providerLabel,
        externalRequestId: submitted.request.externalRequestId,
      },
      now: input.now,
    });

    return {
      status: "submitted",
      providerStatus: "succeeded",
      attemptId: claim.attempt.id,
    };
  } catch (error) {
    const rawFailureCode = readErrorFailureCode(error);
    const apiKeyEnv = readErrorApiKeyEnv(error);
    const prompt = readString(snapshot.prompt) || "";
    const payloadRef = buildGenerationProviderPayloadRef({
      targetType: snapshot.targetType,
      targetId: snapshot.targetId,
      episodeId: snapshot.episodeId,
      taskId: row.task_id,
      mediaType: "image",
    });
    const requestKey = `${row.workflow_id}:${row.task_id}`;
    const requestHash = sha256(`${row.task_id}:${modelCode}:${prompt}`);
    const payloadHash = sha256(`${payloadRef}:${prompt}`);
    const requestBody = {
      prompt,
      parameters: readObject(snapshot.parameters),
      episodeId: readString(snapshot.episodeId),
      targetType: readString(snapshot.targetType) ?? "episode",
      targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId),
    };
    const requestLogBody = buildGptImageRequestLogBody({
      requestBody,
      modelConfig,
      providerName,
      providerOperation: operationNames.episodeImageGenerate,
      providerModel,
      requestKey,
      payloadRef,
      payloadHash,
    });
    const providerRequest = await findLatestGptImageProviderRequestForTask(
      db,
      row.task_id,
      claim.attempt.id,
    );
    providerRequestId = providerRequest?.provider_request_id ?? providerRequestId;
    const rateLimitDeadline = resolveGptImageTimeoutAt(snapshot, input.now);
    if (
      requestLogBody.requestFormat === "cumob_image" &&
      rawFailureCode === "cumob_image_429" &&
      providerRequestId &&
      rateLimitDeadline.getTime() > input.now.getTime()
    ) {
      const retryCount = await requeueGptImageAfterCumobRateLimit(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId,
        now: input.now,
      });
      return {
        status: "rate_limited",
        retryAfterMs: resolveCumobRateLimitDelayMs(error, retryCount, input.now, rateLimitDeadline),
        reason: "cumob_image_429",
      };
    }
    const submissionIsAmbiguous = providerRequest?.status === "result_unknown";
    const failureCode = submissionIsAmbiguous
      ? providerRequest.failure_code ?? "provider_submission_ambiguous"
      : rawFailureCode ?? (providerRequestId ? "provider_failed" : "provider_submission_prepare_failed");
    const modelError = ModelError.fromUnknown(error, {
      failureCode,
      fallbackMessage: gptImageFailureDisplayMessage(failureCode),
      mediaType: "image",
      phase: "submit",
    });
    const errorMessage = modelError.displayMessage;
    if (providerRequestId) {
      await createUserModelRequestLog(db, {
        providerRequestId,
        projectId: row.project_id,
        canvasProjectId: readString(snapshot.canvasProjectId) ?? null,
        workflowId: row.workflow_id,
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        userId: row.created_by_user_id,
        providerName,
        providerOperation: operationNames.episodeImageGenerate,
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
      if (!submissionIsAmbiguous) {
        await completeUserModelRequestLog(db, {
          providerRequestId,
          status: "failed",
          responseText: buildGptImageFailureResponseText({
            failureCode,
            errorMessage,
            apiKeyEnv,
            providerDiagnostics: readErrorProviderDiagnostics(error),
          }),
          responseUsage: null,
          finishReasons: [],
          failureCode,
          now: input.now,
        });
      }
    }
    if (submissionIsAmbiguous) {
      await keepGptImageTaskWaitingForProviderResult(db, {
        taskId: row.task_id,
        now: input.now,
      });
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: claim.attempt.id,
        providerRequestId,
        progressStage: "provider_result_unknown",
        providerStatus: {
          failureCode,
          errorMessage,
          externalRequestId: null,
          ...readOptionalProviderDiagnostics(error),
        },
        now: input.now,
      });
      return { status: "skipped", nextAction: "stop" };
    }
    await failGptImageTask(db, {
      row: { ...row, attempt_id: claim.attempt.id },
      failureCode,
      providerRequestId,
      metadata: buildWorkerBillingMetadata(row, snapshot, {
        billingEvent: "released",
        outcome: "released",
        provider: providerLabel,
        providerRequestId,
        failureCode,
        errorMessage,
        settledAt: input.now,
      }),
      now: input.now,
    });
    await updateTeamAssetGenerationResult(db, {
      snapshot,
      userId: row.user_id,
      status: "failed",
      now: input.now,
    });
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerRequestId,
      failure: {
        code: modelError.code,
        failureCode,
        displayMessage: errorMessage,
        errorMessage,
        providerMessage: errorMessage,
        ...(apiKeyEnv ? { apiKeyEnv } : {}),
        ...readOptionalProviderDiagnostics(error),
      },
      creditSummary: {
        released: resolveGptImageBillingAmount(row, snapshot),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    return { status: "failed", failureCode };
  } finally {
    if (permit?.granted) {
      await permit.release();
    }
  }
}

async function acquireGptImageSubmitPermit(
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

async function findLatestGptImageProviderRequestForTask(
  db: SqlDatabase,
  taskId: string,
  attemptId: string,
) {
  return queryOne<{
    provider_request_id: string;
    status: string;
    failure_code: string | null;
  }>(
    db,
    `
      SELECT request.id AS provider_request_id, request.status, request.failure_code
      FROM provider_requests request
      JOIN tasks task ON task.id = request.task_id
      WHERE request.task_id = $1
        AND task.current_attempt_id = $2
        AND (
          request.attempt_id = $2
          OR (request.attempt_id IS NULL AND task.attempt_count = 1)
        )
      ORDER BY request.updated_at DESC, request.id DESC
      LIMIT 1
    `,
    [taskId, attemptId],
  );
}

const failedGptImageSubmissionRepairMinAgeMs = 30_000;
const failedGptImageSubmissionRepairableSnapshotStatuses = ["queued", "running", "result_unknown"];

async function recoverFailedGptImageSubmitJob(
  db: SqlDatabase,
  input: { taskId: string; now: Date; enqueueRateLimitRetry?: boolean },
): Promise<
  | { status: "failed"; failureCode: string }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "skipped"; attemptId?: string }
> {
  const row = await findGptImageTaskForSubmitRecovery(db, input.taskId);
  if (!row?.attempt_id || !row.provider_request_id || row.provider_status !== "failed") {
    return {
      status: "skipped",
      ...(row?.attempt_id ? { attemptId: row.attempt_id } : {}),
    };
  }
  const failureCode = row.provider_failure_code ?? "provider_failed";
  const snapshot = parseSnapshot(row.input_snapshot_json);
  const providerStatus = {
    ...parseProviderResponse(row.provider_response_redacted_json),
    providerStatus: "failed",
    failureCode,
  };
  const rateLimitDeadline = resolveGptImageTimeoutAt(snapshot, input.now);
  if (
    row.task_status !== "failed"
    && failureCode === "cumob_image_429"
    && rateLimitDeadline.getTime() > input.now.getTime()
  ) {
    let retryAfterMs: number | null = null;
    const retryCount = await requeueGptImageAfterCumobRateLimit(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      now: input.now,
      onRequeued: input.enqueueRateLimitRetry
        ? async (committedRetryCount) => {
            retryAfterMs = resolveCumobRateLimitDelayMs(
              providerStatus,
              committedRetryCount,
              input.now,
              rateLimitDeadline,
            );
            const queuePriority = Number(snapshot.queuePriority);
            const retryAvailableAt = new Date(input.now.getTime() + retryAfterMs);
            const dispatchToken = `cumob-429-repair-${committedRetryCount}`;
            const retryEvent = await appendGenerationTaskCreatedOutboxEvent(db, {
              userId: row.user_id,
              workflowId: row.workflow_id,
              taskId: row.task_id,
              kind: "image",
              modelCode: readString(snapshot.model) ?? null,
              queueName: row.queue_name ?? "generation-submit-image",
              targetType: readString(snapshot.targetType) ?? row.target_entity_type ?? "episode",
              targetId: readString(snapshot.targetId) ?? row.target_entity_id ?? row.task_id,
              providerExecutor: readString(snapshot.providerExecutor) ?? "gpt-image-2",
              dispatchToken,
              retrySequence: committedRetryCount,
              ...(snapshot.membershipPriority === true
                && Number.isInteger(queuePriority)
                && queuePriority > 0
                ? {
                    membershipPriority: true,
                    queuePriority,
                    priorityReason: readString(snapshot.priorityReason) ?? "membership_priority",
                  }
                : {}),
              availableAt: retryAvailableAt,
            });
            if (!retryEvent) {
              throw new Error("cumob_rate_limit_retry_outbox_missing");
            }
            const scheduledEvent = await rescheduleGenerationTaskCreatedOutboxEvent(db, {
              eventId: retryEvent.id,
              availableAt: retryAvailableAt,
              dispatchToken,
              retrySequence: committedRetryCount,
              now: input.now,
            });
            if (!scheduledEvent) {
              throw new Error("cumob_rate_limit_retry_outbox_state_conflict");
            }
          }
        : undefined,
    });
    retryAfterMs ??= resolveCumobRateLimitDelayMs(
      providerStatus,
      retryCount,
      input.now,
      rateLimitDeadline,
    );
    return {
      status: "rate_limited",
      retryAfterMs,
      reason: "cumob_image_429",
    };
  }

  return failGptImagePollJob(db, {
    row,
    snapshot,
    failureCode,
    providerStatus,
    phase: "submit",
    now: input.now,
  });
}

export async function repairFailedGptImageSubmissions(
  db: SqlDatabase,
  input: { now: Date; limit: number },
) {
  const candidates = await findFailedGptImageSubmissionRepairCandidates(
    db,
    new Date(input.now.getTime() - failedGptImageSubmissionRepairMinAgeMs),
    input.limit,
  );
  const repairedTaskIds: string[] = [];
  const requeuedTaskIds: string[] = [];
  const failedTaskIds: string[] = [];

  for (const candidate of candidates) {
    try {
      const result = await recoverFailedGptImageSubmitJob(db, {
        taskId: candidate.task_id,
        now: input.now,
        enqueueRateLimitRetry: true,
      });
      if (result.status === "failed") repairedTaskIds.push(candidate.task_id);
      if (result.status === "rate_limited") requeuedTaskIds.push(candidate.task_id);
    } catch (error) {
      failedTaskIds.push(candidate.task_id);
      await deferFailedGptImageSubmissionRepair(db, {
        taskId: candidate.task_id,
        now: input.now,
      }).catch(() => undefined);
      console.error(
        `[gpt-image-repair] taskId=${candidate.task_id} ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { repairedTaskIds, requeuedTaskIds, failedTaskIds };
}

async function requeueGptImageAfterCumobRateLimit(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId: string;
    providerRequestId: string;
    now: Date;
    onRequeued?: (retryCount: number) => Promise<void>;
  },
) {
  await db.query("BEGIN");
  try {
    const providerRequest = await queryOne<{ retry_count: number | string }>(
      db,
      `
        UPDATE provider_requests
        SET status = 'created',
            external_submission_started_at = NULL,
            external_request_id = NULL,
            failure_code = NULL,
            response_redacted_json = COALESCE(response_redacted_json, '{}'::jsonb)
              || jsonb_build_object(
                'rateLimitRetryCount',
                CASE
                  WHEN COALESCE(response_redacted_json->>'rateLimitRetryCount', '') ~ '^[0-9]+$'
                    THEN (response_redacted_json->>'rateLimitRetryCount')::integer + 1
                  ELSE 1
                END
              ),
            updated_at = $3
        WHERE id = $1
          AND task_id = $2
          AND status = 'failed'
          AND failure_code = 'cumob_image_429'
          AND external_submission_started_at IS NOT NULL
          AND external_request_id IS NULL
        RETURNING (response_redacted_json->>'rateLimitRetryCount')::integer AS retry_count
      `,
      [input.providerRequestId, input.taskId, input.now],
    );
    const attempt = await queryOne<{ id: string }>(
      db,
      `
        UPDATE task_attempts
        SET status = 'canceled',
            failure_code = 'cumob_image_429',
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            finished_at = $3,
            updated_at = $3
        WHERE id = $2
          AND task_id = $1
          AND status IN ('running', 'result_unknown')
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
            SELECT 1 FROM task_attempts attempt
            WHERE attempt.id = $2
              AND attempt.task_id = $1
              AND attempt.status = 'canceled'
              AND attempt.failure_code = 'cumob_image_429'
          )
        RETURNING id
      `,
      [input.taskId, input.attemptId, input.now],
    );
    const generationSnapshot = await queryOne<{ id: string | null }>(
      db,
      `
        WITH updated_snapshot AS (
          UPDATE ai_generation_task_snapshots
          SET status = 'queued',
              progress_stage = 'provider_rate_limited',
              provider_status_json = COALESCE(provider_status_json, '{}'::jsonb)
                || jsonb_build_object('failureCode', 'cumob_image_429'),
              updated_at = $2
          WHERE task_id = $1
            AND status IN ('running', 'result_unknown')
          RETURNING id
        )
        SELECT id FROM updated_snapshot
        UNION ALL
        SELECT NULL::uuid AS id
        WHERE NOT EXISTS (
          SELECT 1
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        )
        LIMIT 1
      `,
      [input.taskId, input.now],
    );
    if (!providerRequest || !attempt || !task || !generationSnapshot) {
      throw new Error(
        `cumob_rate_limit_requeue_state_conflict:providerRequest=${Boolean(providerRequest)},attempt=${Boolean(attempt)},task=${Boolean(task)},generationSnapshot=${Boolean(generationSnapshot)}`,
      );
    }
    await input.onRequeued?.(Number(providerRequest.retry_count));
    await db.query("COMMIT");
    return Number(providerRequest.retry_count);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function bindPreparedProviderRequestToAttempt(
  db: SqlDatabase,
  input: { providerRequestId: string; attemptId: string; now: Date },
) {
  const updated = await queryOne<{ id: string }>(
    db,
    `
      UPDATE provider_requests
      SET attempt_id = $2,
          updated_at = $3
      WHERE id = $1
        AND status = 'created'
        AND external_submission_started_at IS NULL
      RETURNING id
    `,
    [input.providerRequestId, input.attemptId, input.now],
  );
  if (!updated) throw new Error("provider_request_attempt_bind_conflict");
}

function resolveGptImageTimeoutAt(snapshot: Record<string, unknown>, now: Date) {
  const configured = Date.parse(readString(snapshot.timeoutAt) ?? "");
  if (Number.isFinite(configured)) return new Date(configured);
  const requestedAt = Date.parse(readString(snapshot.requestedAt) ?? "");
  const startedAt = Number.isFinite(requestedAt) ? requestedAt : now.getTime();
  return new Date(startedAt + generationTimeoutMsFor("image"));
}

function resolveCumobRateLimitDelayMs(
  error: unknown,
  retryCount: number,
  now: Date,
  deadline: Date,
) {
  const providerDelay = readErrorRetryAfterMs(error);
  const exponentialDelay = Math.min(5_000 * (2 ** Math.max(0, retryCount - 1)), 5 * 60_000);
  return Math.max(
    0,
    Math.min(providerDelay ?? exponentialDelay, deadline.getTime() - now.getTime()),
  );
}

async function keepGptImageTaskWaitingForProviderResult(
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

export async function processGptImagePollJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId?: string | null;
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
  const row = await findGptImageTaskForPoll(
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
  const existingArtifact = parseArtifactFromProviderResponse(
    parseProviderResponse(row.provider_response_redacted_json),
  );
  if (row.provider_status === "succeeded" && existingArtifact) {
    return { status: "succeeded" };
  }

  if (!await renewGptImagePollLease(db, {
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
  const modelCode = readString(snapshot.model) || "gpt-image-2-cn";
  const modelConfig = await resolveGenerationModelConfigForTask(db, snapshot, modelCode);
  const dispatchPolicy = await findActiveAiModelDispatchPolicyByModelCode(db, modelCode);
  const providerName = modelConfig?.providerName || "openai";
  const permit = input.rateLimiter
    ? await input.rateLimiter.acquirePollPermit({
        providerName,
        modelCode,
        userId: resolveRateLimitUserId(row.created_by_user_id ?? row.user_id, snapshot),
        rpmLimit: dispatchPolicy?.providerRpmLimit ?? 60,
        providerConcurrentLimit: dispatchPolicy?.providerConcurrentLimit ?? 5,
        modelConcurrentLimit: dispatchPolicy?.pollingConcurrencyLimit ?? 40,
        userConcurrentLimit: dispatchPolicy?.pollingConcurrencyLimit ?? 40,
        leaseMs: 120_000,
        now: input.now,
      })
    : null;
  if (permit && !permit.granted) {
    return { status: "rate_limited", retryAfterMs: permit.retryAfterMs, reason: permit.reason };
  }

  try {
    const adapter = createProviderAdapterFromModelConfig(
      modelConfig
        ? {
            providerProtocol: modelConfig.providerProtocol,
            providerModel: modelConfig.providerModel,
            mediaType: modelConfig.mediaType,
            providerConfig: modelConfig.providerConfig,
            invocationMode: modelConfig.invocationMode,
          }
        : fallbackGptImageModelConfig(),
      input.env,
      resolveGenerationProviderFetch(input.fetchImpl, "image", input.env),
    ) as GptImagePollAdapter;
    if (typeof adapter.poll !== "function") {
      throw Object.assign(new Error("image_provider_poll_unsupported"), {
        failureCode: "provider_poll_unsupported",
      });
    }
    const poll = await adapter.poll({ externalRequestId: row.external_request_id, redactedPayload: snapshot });
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
      const failureCode = readString(poll.redactedResponse.failureCode)
        || "provider_failed";
      return failGptImagePollJob(db, {
        row,
        snapshot,
        failureCode,
        providerStatus: poll.redactedResponse,
        now: input.now,
      });
    }
    const artifact = poll.artifacts?.find((item) => item.mediaType === "image");
    if (!artifact) {
      return failGptImagePollJob(db, {
        row,
        snapshot,
        failureCode: "provider_output_download_failed",
        providerStatus: poll.redactedResponse,
        now: input.now,
      });
    }
    await markProviderRequestSucceeded(db, {
      providerRequestId: row.provider_request_id,
      externalRequestId: row.external_request_id,
      redactedResponse: attachProviderRawResponse({
        ...poll.redactedResponse,
        artifact: serializeGptImageArtifactForProviderResponse(artifact),
      }, readProviderRawResponse(poll.redactedResponse)),
      now: input.now,
    });
    await completeUserModelRequestLog(db, {
      providerRequestId: row.provider_request_id,
      status: "succeeded",
      responseText: buildGptImageResponseText(artifact, row.external_request_id),
      responseUsage: null,
      finishReasons: [],
      now: input.now,
    });
    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      progressPercent: 50,
      progressStage: "provider_succeeded",
      providerStatus: {
        ...poll.redactedResponse,
        externalRequestId: row.external_request_id,
      },
      now: input.now,
    });
    return { status: "succeeded" };
  } catch (error) {
    if (modelConfig?.providerProtocol === "san_bao" && error instanceof ModelError) {
      return failGptImagePollJob(db, {
        row,
        snapshot,
        failureCode: error.failureCode || "provider_failed",
        providerStatus: error.toRedactedProviderRecord(),
        now: input.now,
      });
    }
    throw error;
  } finally {
    if (permit?.granted) await permit.release();
  }
}

export async function expireGptImagePollJob(
  db: SqlDatabase,
  input: { taskId: string; expectedAttemptId?: string | null; now: Date },
): Promise<{ status: "failed"; failureCode: "provider_poll_timeout" }> {
  const row = await findGptImageTaskForPollExpiration(
    db,
    input.taskId,
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"),
    input.expectedAttemptId ?? null,
  );
  if (row?.provider_request_id) {
    const externallyStarted = Boolean(
      row.external_submission_started_at
      || row.external_request_id
      || ["submitted", "accepted", "running", "result_unknown", "succeeded"].includes(row.provider_status ?? ""),
    );
    if (externallyStarted && !["failed", "canceled"].includes(row.provider_status ?? "")) {
      const provider = await markProviderRequestResultUnknown(db, {
        providerRequestId: row.provider_request_id,
        failureCode: "provider_poll_timeout",
        redactedResponse: {
          providerStatus: "timeout",
          externalRequestId: row.external_request_id ?? null,
        },
        now: input.now,
      });
      if (provider.status === "result_unknown") {
        const snapshot = parseSnapshot(row.input_snapshot_json);
        await markGptImageTaskResultUnknown(db, {
          row,
          failureCode: "provider_poll_timeout",
          providerRequestId: row.provider_request_id,
          metadata: {
            billingEvent: "manual_review_required",
            outcome: "manual_review_required",
            providerRequestId: row.provider_request_id,
            externalRequestId: row.external_request_id ?? null,
            failureCode: "provider_poll_timeout",
            settledAt: input.now,
          },
          now: input.now,
        });
        await markGenerationTaskSnapshotResultUnknown(db, {
          taskId: row.task_id,
          attemptId: row.attempt_id,
          providerRequestId: row.provider_request_id,
          providerStatus: { providerStatus: "timeout", externalRequestId: row.external_request_id ?? null },
          failure: {
            failureCode: "provider_poll_timeout",
            displayMessage: "图片生成已超过自动轮询窗口，但供应商终态尚未确认。系统将继续后台复核，积分保持预留。",
          },
          creditSummary: {
            reserved: resolveGptImageBillingAmount(row, snapshot),
            settledAt: input.now.toISOString(),
          },
          now: input.now,
        });
        return { status: "failed", failureCode: "provider_poll_timeout" };
      }
      if (provider.status === "succeeded") {
        return { status: "failed", failureCode: "provider_poll_timeout" };
      }
    }
    if (row.provider_status === "canceled") {
      const snapshot = parseSnapshot(row.input_snapshot_json);
      await failGptImageTask(db, {
        row,
        failureCode: "provider_poll_timeout",
        providerRequestId: row.provider_request_id,
        metadata: { providerStatus: "canceled", failureCode: "provider_poll_timeout" },
        now: input.now,
      });
      await markGenerationTaskSnapshotFailed(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        providerStatus: { providerStatus: "canceled" },
        failure: { failureCode: "provider_poll_timeout", displayMessage: "图片供应商任务已取消，积分已返还。" },
        creditSummary: {
          released: resolveGptImageBillingAmount(row, snapshot),
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      return { status: "failed", failureCode: "provider_poll_timeout" };
    }
    await failGptImagePollJob(db, {
      row,
      snapshot: parseSnapshot(row.input_snapshot_json),
      failureCode: "provider_poll_timeout",
      providerStatus: {
        providerStatus: "timeout",
        externalRequestId: row.external_request_id ?? null,
      },
      now: input.now,
    });
  } else if (row) {
    const failed = await failGptImageTask(db, {
      row,
      failureCode: "provider_poll_timeout",
      providerRequestId: null,
      metadata: {
        billingEvent: "released",
        outcome: "released",
        provider: "model-gateway",
        failureCode: "provider_poll_timeout",
        settledAt: input.now,
      },
      now: input.now,
    });
    if (!failed) {
      return { status: "failed", failureCode: "provider_poll_timeout" };
    }
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      failure: {
        failureCode: "provider_poll_timeout",
        displayMessage: "图片生成超过截止时间仍未返回结果，已按失败处理并返还积分。",
      },
      creditSummary: {
        released: resolveGptImageBillingAmount(row, parseSnapshot(row.input_snapshot_json)),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    await updateTeamAssetGenerationResult(db, {
      snapshot: parseSnapshot(row.input_snapshot_json),
      userId: row.user_id,
      status: "failed",
      now: input.now,
    });
  }
  return { status: "failed", failureCode: "provider_poll_timeout" };
}

export async function finalizeGptImageArtifactJob(
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
  const row = await findGptImageTaskForFinalize(db, input.taskId,
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"), input.expectedAttemptId ?? null);
  if (!row?.provider_request_id || !row.attempt_id) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const snapshotProviderStatus = parseSnapshot(row.snapshot_provider_status_json ?? {});
  const providerLabel = "model-gateway";
  const providerResponse = parseProviderResponse(row.provider_response_redacted_json);
  const artifact = parseArtifactFromProviderResponse(providerResponse);
  if (!artifact) {
    return { status: "failed", failureCode: "provider_output_missing" };
  }

  const artifactLease = await claimGptImageArtifactFinalizeLease(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    now: input.now,
  });
  if (!artifactLease) return { status: "skipped" };

  return runWithGptImageArtifactFinalizeLease(db, artifactLease, async () => {
  let persisted: PersistedGptImageArtifact;
  try {
    await assertCanvasGenerationAssignmentActive(db, snapshot);
    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id ?? null,
      progressStage: "artifact_persisting",
      progressPercent: 75,
      providerStatus: {
        ...snapshotProviderStatus,
        provider: providerLabel,
        externalRequestId: row.external_request_id ?? null,
      },
      now: input.now,
    });
    const storedArtifact = await persistGptImageArtifact(db, {
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
      externalRequestId: row.external_request_id ?? null,
      runtime: input.runtime,
      env: input.env,
      fetchImpl: input.fetchImpl,
      now: input.now,
      recoveryDeadlineAt: readGptImageArtifactRecoveryDeadline(row.snapshot_provider_status_json),
      assetType: resolveEpisodeGenerationAssetType({
        targetType: readString(snapshot.targetType),
        assetType: snapshot.assetType,
      }),
      assetKey: `image:${readString(snapshot.episodeId) || row.project_id}:${row.task_id}`,
    });
    const projectAssetVersion = await createProjectAssetGenerationVersion(db, {
      row,
      snapshot,
      artifact: storedArtifact,
      now: input.now,
    });
    persisted = projectAssetVersion
      ? {
          ...storedArtifact,
          assetId: projectAssetVersion.asset.id,
          assetVersionId: projectAssetVersion.version.id,
        }
      : storedArtifact;
  } catch (error) {
    const failureCode = readErrorFailureCode(error) ?? "provider_output_persist_failed";
    const errorMessage = translateProviderErrorMessage(error, {
      failureCode,
      mediaType: "image",
      phase: "persist",
    });
    const storageObjectKey = readErrorStorageObjectKey(error);
    if (isGptImageArtifactTransferFailure(failureCode)) {
      await markGenerationTaskSnapshotRunning(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id ?? null,
        progressStage: "asset_transfer_retry_pending",
        progressPercent: 75,
        providerStatus: {
          ...snapshotProviderStatus,
          provider: providerLabel,
          externalRequestId: row.external_request_id ?? null,
          transferStatus: "retry_pending",
          transferFailureCode: failureCode,
          errorMessage,
        },
        now: input.now,
      });
      throw error;
    }
    if (failureCode === "provider_output_persist_failed") {
      await markGptImageTaskManualReview(db, {
        row,
        failureCode,
        providerRequestId: row.provider_request_id ?? null,
        metadata: buildWorkerBillingMetadata(row, snapshot, {
          billingEvent: "manual_review_required",
          outcome: "manual_review_required",
          provider: providerLabel,
          providerRequestId: row.provider_request_id ?? null,
          externalRequestId: row.external_request_id ?? null,
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
        providerRequestId: row.provider_request_id ?? null,
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
      await updateTeamAssetGenerationResult(db, {
        snapshot,
        userId: row.user_id,
        status: "failed",
        now: input.now,
      });
      return { status: "failed", failureCode };
    }
    await failGptImageTask(db, {
      row,
      failureCode,
      providerRequestId: row.provider_request_id ?? null,
      metadata: buildWorkerBillingMetadata(row, snapshot, {
        billingEvent: "released",
        outcome: "released",
        provider: providerLabel,
        providerRequestId: row.provider_request_id ?? null,
        externalRequestId: row.external_request_id ?? null,
        failureCode,
        errorMessage,
        settledAt: input.now,
      }),
      now: input.now,
    });
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id ?? null,
      failure: {
        failureCode,
        displayMessage: gptImageFailureDisplayMessage(failureCode),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      creditSummary: {
        released: resolveGptImageBillingAmount(row, snapshot),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    await updateTeamAssetGenerationResult(db, {
      snapshot,
      userId: row.user_id,
      status: "failed",
      now: input.now,
    });
    return { status: "failed", failureCode };
  }

  const amount = resolveGenerationBillingAmount(row.amount_reserved, snapshot);
  await finalizeTaskAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    status: "succeeded",
    now: input.now,
    finalize: async () => {
      if (readTeamAssetTargetId(snapshot)) {
        await updateTeamAssetGenerationResult(db, {
          snapshot,
          userId: row.user_id,
          status: "active",
          previewUrl: persisted.previewUrl,
          storageObjectId: persisted.storageObjectId,
          now: input.now,
        });
      } else {
        await ensureProjectUploadRecordForStorageObject(db, {
          userId: row.created_by_user_id ?? row.user_id,
          storageObjectId: persisted.storageObjectId,
          pageKey: "project",
          sourceAction: "generate_image",
          publicUrl: persisted.previewUrl,
          status: "uploaded",
          now: input.now,
        });
      }
      if (row.reservation_id && amount > 0) {
        await reopenManualReviewReservationForSettlement(db, {
          reservationId: row.reservation_id,
          now: input.now,
        });
        await settleReservationAllocationInTransaction(db, {
          reservationId: row.reservation_id,
          allocationKey: "gpt-image-2-result",
          amount,
          outcome: "consumed",
          taskId: row.task_id,
          attemptId: row.attempt_id,
          providerRequestId: row.provider_request_id ?? null,
          metadata: buildWorkerBillingMetadata(row, snapshot, {
            billingEvent: "consumed",
            outcome: "consumed",
            provider: providerLabel,
            providerRequestId: row.provider_request_id ?? null,
            externalRequestId: row.external_request_id ?? null,
            settledAt: input.now,
          }),
          now: input.now,
        });
      }
      await markGenerationTaskSnapshotSucceeded(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id ?? null,
        resultAssets: [persisted],
        providerStatus: {
          provider: providerLabel,
          externalRequestId: row.external_request_id ?? null,
        },
        creditSummary: {
          consumed: amount,
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
    },
  });
  await grantPromptSkillsUsageCredits(db, {
    skills: readSnapshotPromptSkills(snapshot),
    sourceId: row.task_id,
    payerUserId: row.user_id,
    teamMemberId: readSnapshotTeamMemberId(snapshot),
    projectId: row.project_id,
    modelCode: readString(snapshot.model),
    now: input.now,
  });
  await aggregateWorkflowStatus(db, row.workflow_id);
  await registerGeneratedImageWithGlobalAiOpc(db, {
    storageObjectId: persisted.storageObjectId,
    sourceUrl: persisted.sourceUrl || persisted.previewUrl,
    env: input.env,
    fetchImpl: input.fetchImpl,
    now: input.now,
  }).catch(() => undefined);

  return { status: "succeeded" };
  });
}

export async function fetchGptImageArtifactJob(
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
  const row = await findGptImageTaskForFinalize(db, input.taskId,
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"), input.expectedAttemptId ?? null);
  if (!row?.provider_request_id || !row.attempt_id) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
    });
  }
  const existing = await findOrRecoverGenerationArtifactHandoff(db, {
    taskId: input.taskId,
    attemptId: row.attempt_id,
    mediaType: "image",
    now: input.now,
  });
  if (existing) return { status: "succeeded" };
  const snapshot = parseSnapshot(row.input_snapshot_json);
  const artifact = parseArtifactFromProviderResponse(parseProviderResponse(row.provider_response_redacted_json));
  if (!artifact) return { status: "failed", failureCode: "provider_output_missing" };
  const artifactLease = await claimGptImageArtifactFinalizeLease(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    now: input.now,
  });
  if (!artifactLease) return { status: "skipped" };

  return runWithGptImageArtifactFinalizeLease(db, artifactLease, async () => {
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
    externalRequestId: row.external_request_id ?? null,
    runtime: input.runtime,
    env: input.env,
    fetchImpl: input.fetchImpl,
    now: input.now,
    recoveryDeadlineAt: readGptImageArtifactRecoveryDeadline(row.snapshot_provider_status_json),
  });
  await recordGenerationArtifactHandoff(db, {
    taskId: row.task_id,
    mediaType: "image",
    attemptId: row.attempt_id,
    storageObjectId: stored.storageObjectId,
    storageObjectKey: stored.storageObjectKey,
    contentType: stored.mimeType,
    now: input.now,
  });
  return { status: "succeeded" };
  });
}

export async function persistGptImageArtifactJob(
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
  const row = await findGptImageTaskForPersist(db, input.taskId,
    Object.prototype.hasOwnProperty.call(input, "expectedAttemptId"), input.expectedAttemptId ?? null);
  if (!row?.attempt_id) {
    return resolveGenerationArtifactStageUnavailable(db, {
      taskId: input.taskId,
      failureCode: "provider_output_persist_failed",
    });
  }
  const artifactLease = await claimGptImageArtifactFinalizeLease(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    now: input.now,
  });
  if (!artifactLease) return { status: "skipped" };

  return runWithGptImageArtifactFinalizeLease(db, artifactLease, async () => {
  const snapshot = parseSnapshot(row.input_snapshot_json);
  await assertCanvasGenerationAssignmentActive(db, snapshot);
  const providerLabel = "model-gateway";
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
  await reopenGptImageQueueFailureAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    now: input.now,
  });

  const urls = buildDefaultPersistUrls(input.runtime, storageObject.objectKey);
  const storedArtifact: PersistedGptImageArtifact = {
    assetId: null,
    assetVersionId: null,
    storageObjectId: storageObject.id,
    storageObjectKey: storageObject.objectKey,
    mediaKind: "image",
    mimeType: storageObject.contentType,
    url: urls.previewUrl,
    previewUrl: urls.previewUrl,
    sourceUrl: urls.sourceUrl,
    downloadUrl: urls.downloadUrl,
  };
  const projectAssetVersion = await createProjectAssetGenerationVersion(db, {
    row,
    snapshot,
    artifact: storedArtifact,
    now: input.now,
  });
  const persisted = projectAssetVersion
    ? {
        ...storedArtifact,
        assetId: projectAssetVersion.asset.id,
        assetVersionId: projectAssetVersion.version.id,
      }
    : storedArtifact;
  const amount = resolveGenerationBillingAmount(row.amount_reserved, snapshot);
  await finalizeTaskAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    status: "succeeded",
    now: input.now,
    finalize: async () => {
      if (readTeamAssetTargetId(snapshot)) {
        await updateTeamAssetGenerationResult(db, {
          snapshot,
          userId: row.user_id,
          status: "active",
          previewUrl: urls.previewUrl,
          storageObjectId: storageObject.id,
          now: input.now,
        });
      } else {
        await ensureProjectUploadRecordForStorageObject(db, {
          userId: row.created_by_user_id ?? row.user_id,
          storageObjectId: storageObject.id,
          pageKey: "project",
          sourceAction: "generate_image",
          publicUrl: urls.previewUrl,
          status: "uploaded",
          now: input.now,
        });
      }
      if (row.reservation_id && amount > 0) {
        await reopenManualReviewReservationForSettlement(db, {
          reservationId: row.reservation_id,
          now: input.now,
        });
        await settleReservationAllocationInTransaction(db, {
          reservationId: row.reservation_id,
          allocationKey: "gpt-image-2-persist-retry",
          amount,
          outcome: "consumed",
          taskId: row.task_id,
          attemptId: row.attempt_id,
          providerRequestId: row.provider_request_id ?? null,
          metadata: buildWorkerBillingMetadata(row, snapshot, {
            billingEvent: "consumed",
            outcome: "consumed",
            provider: providerLabel,
            providerRequestId: row.provider_request_id ?? null,
            externalRequestId: row.external_request_id ?? null,
            storageObjectKey,
            settledAt: input.now,
          }),
          now: input.now,
        });
      }
      await markGenerationTaskSnapshotSucceeded(db, {
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id ?? null,
        resultAssets: [persisted],
        providerStatus: {
          provider: providerLabel,
          externalRequestId: row.external_request_id ?? null,
        },
        creditSummary: {
          consumed: amount,
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
    },
  });
  await grantPromptSkillsUsageCredits(db, {
    skills: readSnapshotPromptSkills(snapshot),
    sourceId: row.task_id,
    payerUserId: row.user_id,
    teamMemberId: readSnapshotTeamMemberId(snapshot),
    projectId: row.project_id,
    modelCode: readString(snapshot.model),
    now: input.now,
  });
  await aggregateWorkflowStatus(db, row.workflow_id);
  await registerGeneratedImageWithGlobalAiOpc(db, {
    storageObjectId: persisted.storageObjectId,
    sourceUrl: persisted.sourceUrl || persisted.previewUrl,
    env: input.env,
    now: input.now,
  }).catch(() => undefined);

  return { status: "succeeded" };
  });
}

async function markGptImageTaskManualReview(
  db: SqlDatabase,
  input: {
    row: GptImageTaskRow;
    failureCode: string;
    providerRequestId: string | null;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  const snapshot = parseSnapshot(input.row.input_snapshot_json);
  const amount = resolveGptImageBillingAmount(input.row, snapshot);
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
        metadata: input.metadata,
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
  await updateProjectAssetGenerationTerminalResult(db, {
    row: input.row,
    snapshot,
    status: "manual_review_required",
    failureCode: input.failureCode,
    now: input.now,
  });
}

async function markGptImageTaskResultUnknown(
  db: SqlDatabase,
  input: {
    row: GptImageTaskRow;
    failureCode: string;
    providerRequestId: string | null;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  const snapshot = parseSnapshot(input.row.input_snapshot_json);
  const amount = resolveGptImageBillingAmount(input.row, snapshot);
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
        metadata: input.metadata,
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
  await updateProjectAssetGenerationTerminalResult(db, {
    row: input.row,
    snapshot,
    status: "result_unknown",
    failureCode: input.failureCode,
    now: input.now,
  });
}

async function findGptImageTaskForSubmit(db: SqlDatabase, taskId: string) {
  return queryOne<GptImageTaskRow>(
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
        NULL::uuid AS provider_request_id,
        NULL::text AS external_request_id,
        NULL::jsonb AS provider_response_redacted_json,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      JOIN workflows w
        ON w.id = t.workflow_id
      LEFT JOIN generation_task_credit_reservations r
        ON r.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_image'
        AND t.status = 'queued'
        AND t.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http')
      LIMIT 1
    `,
    [taskId],
  );
}

async function findGptImageTaskForPoll(
  db: SqlDatabase,
  taskId: string,
  enforceExpectedAttempt: boolean,
  expectedAttemptId: string | null,
) {
  return queryOne<GptImageTaskRow>(
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
      LEFT JOIN provider_requests pr
        ON pr.task_id = t.id
       AND (
         pr.attempt_id = t.current_attempt_id
         OR (pr.attempt_id IS NULL AND t.attempt_count = 1)
       )
      LEFT JOIN generation_task_credit_reservations r ON r.task_id = t.id
      WHERE t.id = $1
        AND (
          $2::boolean = false
          OR ($3::uuid IS NOT NULL AND t.current_attempt_id = $3)
          OR ($3::uuid IS NULL AND t.attempt_count = 1)
        )
        AND t.task_type = 'episode_generate_image'
        AND t.status IN ('running', 'result_unknown')
        AND t.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http')
        AND t.current_attempt_id IS NOT NULL
        AND pr.external_request_id IS NOT NULL
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId, enforceExpectedAttempt, expectedAttemptId],
  );
}

async function findGptImageTaskForPollExpiration(
  db: SqlDatabase,
  taskId: string,
  enforceExpectedAttempt: boolean,
  expectedAttemptId: string | null,
) {
  return queryOne<GptImageTaskRow>(
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
        AND t.task_type = 'episode_generate_image'
        AND t.status IN ('running', 'result_unknown')
        AND t.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http')
      LIMIT 1
    `,
    [taskId, enforceExpectedAttempt, expectedAttemptId],
  );
}

async function findGptImageTaskForSubmitRecovery(db: SqlDatabase, taskId: string) {
  return queryOne<GptImageTaskRow>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        t.status AS task_status,
        t.queue_name,
        t.target_entity_type,
        t.target_entity_id,
        w.created_by_user_id AS user_id,
        t.project_id,
        t.input_snapshot_json,
        w.created_by_user_id,
        pr.id AS provider_request_id,
        pr.status AS provider_status,
        pr.failure_code AS provider_failure_code,
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
          AND (
            request.attempt_id = t.current_attempt_id
            OR (request.attempt_id IS NULL AND t.attempt_count = 1)
          )
        ORDER BY request.updated_at DESC, request.created_at DESC
        LIMIT 1
      ) pr ON true
      LEFT JOIN generation_task_credit_reservations r ON r.task_id = t.id
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_image'
        AND t.status IN ('running', 'result_unknown', 'failed')
        AND t.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http')
        AND t.current_attempt_id IS NOT NULL
        AND (
          t.status <> 'failed'
          OR (
            t.failure_code = COALESCE(pr.failure_code, 'provider_failed')
            AND snapshot.status = ANY($2::text[])
          )
        )
      LIMIT 1
    `,
    [taskId, failedGptImageSubmissionRepairableSnapshotStatuses],
  );
}

async function findFailedGptImageSubmissionRepairCandidates(
  db: SqlDatabase,
  staleBefore: Date,
  limit: number,
) {
  const result = await db.query<{ task_id: string }>(
    `
      SELECT candidate.task_id
      FROM (
        (
          SELECT task.id AS task_id, task.updated_at
          FROM tasks task
          JOIN LATERAL (
            SELECT provider.*
            FROM provider_requests provider
            WHERE provider.task_id = task.id
              AND (
                provider.attempt_id = task.current_attempt_id
                OR (provider.attempt_id IS NULL AND task.attempt_count = 1)
              )
            ORDER BY provider.updated_at DESC, provider.created_at DESC
            LIMIT 1
          ) request ON request.status = 'failed'
          WHERE task.task_type = 'episode_generate_image'
            AND task.current_attempt_id IS NOT NULL
            AND task.status IN ('running', 'result_unknown')
            AND task.updated_at <= $1
            AND request.updated_at <= $1
            AND task.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http')
          ORDER BY task.updated_at ASC, task.id ASC
          LIMIT $2
        )
        UNION ALL
        (
          SELECT task.id AS task_id, task.updated_at
          FROM ai_generation_task_snapshots snapshot
          JOIN tasks task ON task.id = snapshot.task_id
          JOIN LATERAL (
            SELECT provider.*
            FROM provider_requests provider
            WHERE provider.task_id = task.id
              AND (
                provider.attempt_id = task.current_attempt_id
                OR (provider.attempt_id IS NULL AND task.attempt_count = 1)
              )
            ORDER BY provider.updated_at DESC, provider.created_at DESC
            LIMIT 1
          ) request ON request.status = 'failed'
          WHERE snapshot.status IN ('queued', 'running', 'result_unknown')
            AND task.task_type = 'episode_generate_image'
            AND task.current_attempt_id IS NOT NULL
            AND task.status = 'failed'
            AND task.failure_code = COALESCE(request.failure_code, 'provider_failed')
            AND task.updated_at <= $1
            AND request.updated_at <= $1
            AND task.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http')
          ORDER BY task.updated_at ASC, task.id ASC
          LIMIT $2
        )
      ) candidate
      ORDER BY candidate.updated_at ASC, candidate.task_id ASC
      LIMIT $2
    `,
    [staleBefore, Math.max(1, Math.floor(limit))],
  );
  return result.rows;
}

async function deferFailedGptImageSubmissionRepair(
  db: SqlDatabase,
  input: { taskId: string; now: Date },
) {
  await db.query(
    `
      UPDATE tasks
      SET updated_at = $2
      WHERE id = $1
        AND task_type = 'episode_generate_image'
        AND status IN ('running', 'result_unknown', 'failed')
    `,
    [input.taskId, input.now],
  );
}

async function renewGptImagePollLease(
  db: SqlDatabase,
  input: { taskId: string; attemptId: string; now: Date },
) {
  const lockedUntil = new Date(input.now.getTime() + 15 * 60_000);
  const renewed = await queryOne<{ id: string }>(
    db,
    `
      WITH renewed_task AS (
        UPDATE tasks
        SET status = 'running',
            failure_code = NULL,
            locked_by = 'gpt-image-poll-worker',
            locked_until = $3,
            heartbeat_at = $4,
            updated_at = $4
        WHERE id = $1
          AND current_attempt_id = $2
          AND status IN ('running', 'result_unknown')
        RETURNING id
      )
      UPDATE task_attempts
      SET status = 'running',
          failure_code = NULL,
          locked_by = 'gpt-image-poll-worker',
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
    [input.taskId, input.attemptId, lockedUntil, input.now],
  );
  return Boolean(renewed);
}

async function failGptImagePollJob(
  db: SqlDatabase,
  input: {
    row: GptImageTaskRow;
    snapshot: Record<string, unknown>;
    failureCode: string;
    providerStatus: Record<string, unknown>;
    phase?: "submit" | "poll";
    now: Date;
  },
): Promise<{ status: "failed"; failureCode: string }> {
  const errorMessage = translateProviderErrorMessage(input.providerStatus, {
    failureCode: input.failureCode,
    mediaType: "image",
    phase: input.phase ?? "poll",
  });
  await markProviderRequestFailed(db, {
    providerRequestId: input.row.provider_request_id!,
    failureCode: input.failureCode,
    redactedResponse: input.providerStatus,
    now: input.now,
  });
  await completeUserModelRequestLog(db, {
    providerRequestId: input.row.provider_request_id!,
    status: "failed",
    responseText: buildGptImageFailureResponseText({
      failureCode: input.failureCode,
      errorMessage,
      providerResponse: input.providerStatus,
    }),
    responseUsage: null,
    finishReasons: [],
    failureCode: input.failureCode,
    now: input.now,
  });
  if (input.row.task_status === "failed") {
    await updateProjectAssetGenerationTerminalResult(db, {
      row: input.row,
      snapshot: input.snapshot,
      status: "failed",
      failureCode: input.failureCode,
      now: input.now,
    });
  } else {
    await failGptImageTask(db, {
      row: input.row,
      failureCode: input.failureCode,
      providerRequestId: input.row.provider_request_id,
      metadata: {
        billingEvent: "released",
        outcome: "released",
        provider: "model-gateway",
        providerRequestId: input.row.provider_request_id,
        externalRequestId: input.row.external_request_id,
        failureCode: input.failureCode,
        errorMessage,
        providerResponse: input.providerStatus,
        settledAt: input.now,
      },
      now: input.now,
    });
  }
  await updateTeamAssetGenerationResult(db, {
    snapshot: input.snapshot,
    userId: input.row.user_id,
    status: "failed",
    now: input.now,
  });
  await markGenerationTaskSnapshotFailed(db, {
    taskId: input.row.task_id,
    attemptId: input.row.attempt_id,
    providerRequestId: input.row.provider_request_id,
    providerStatus: input.providerStatus,
    failure: {
      failureCode: input.failureCode,
      providerStatus: readString(input.providerStatus.providerStatus),
      providerMessage: errorMessage,
      displayMessage: errorMessage || "图片供应商任务失败。",
    },
    creditSummary: {
      released: resolveGptImageBillingAmount(input.row, input.snapshot),
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });
  return { status: "failed", failureCode: input.failureCode };
}

interface GptImageArtifactFinalizeLease {
  taskId: string;
  attemptId: string;
  owner: string;
}

async function claimGptImageArtifactFinalizeLease(
  db: SqlDatabase,
  input: { taskId: string; attemptId: string; now: Date },
): Promise<GptImageArtifactFinalizeLease | null> {
  const owner = `gpt-image-artifact-finalizer:${randomUUID()}`;
  const lockedUntil = new Date(input.now.getTime() + 20 * 60_000);
  const claim = await queryOne<{ claimed: boolean }>(
    db,
    `
      WITH claimed_task AS (
        UPDATE tasks task
        SET locked_by = $3,
            locked_until = $4,
            heartbeat_at = $5
        WHERE task.id = $1
          AND task.current_attempt_id = $2
          AND task.status IN ('running', 'result_unknown', 'manual_review_required')
          AND (
            task.locked_until IS NULL
            OR task.locked_until <= $5
            OR task.locked_by NOT LIKE 'gpt-image-artifact-finalizer:%'
          )
        RETURNING task.id
      ), claimed_attempt AS (
        UPDATE task_attempts attempt
        SET locked_by = $3,
            locked_until = $4,
            heartbeat_at = $5
        WHERE attempt.id = $2
          AND attempt.task_id = $1
          AND EXISTS (SELECT 1 FROM claimed_task)
        RETURNING attempt.id
      )
      SELECT EXISTS (SELECT 1 FROM claimed_task) AS claimed
    `,
    [input.taskId, input.attemptId, owner, lockedUntil, input.now],
  );
  return claim?.claimed ? { taskId: input.taskId, attemptId: input.attemptId, owner } : null;
}

async function runWithGptImageArtifactFinalizeLease<T>(
  db: SqlDatabase,
  lease: GptImageArtifactFinalizeLease,
  operation: () => Promise<T>,
) {
  const heartbeat = setInterval(() => {
    void renewGptImageArtifactFinalizeLease(db, lease).catch(() => undefined);
  }, 30_000);
  heartbeat.unref?.();
  try {
    return await operation();
  } finally {
    clearInterval(heartbeat);
    await releaseGptImageArtifactFinalizeLease(db, lease).catch(() => undefined);
  }
}

async function renewGptImageArtifactFinalizeLease(
  db: SqlDatabase,
  lease: GptImageArtifactFinalizeLease,
) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + 20 * 60_000);
  await db.query(
    `
      WITH renewed_task AS (
        UPDATE tasks
        SET locked_until = $4,
            heartbeat_at = $5
        WHERE id = $1
          AND current_attempt_id = $2
          AND locked_by = $3
        RETURNING id
      )
      UPDATE task_attempts
      SET locked_until = $4,
          heartbeat_at = $5
      WHERE id = $2
        AND task_id = $1
        AND locked_by = $3
        AND EXISTS (SELECT 1 FROM renewed_task)
    `,
    [lease.taskId, lease.attemptId, lease.owner, lockedUntil, now],
  );
}

async function releaseGptImageArtifactFinalizeLease(
  db: SqlDatabase,
  lease: GptImageArtifactFinalizeLease,
) {
  await db.query(
    `
      WITH released_task AS (
        UPDATE tasks
        SET locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL
        WHERE id = $1
          AND current_attempt_id = $2
          AND locked_by = $3
        RETURNING id
      )
      UPDATE task_attempts
      SET locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL
      WHERE id = $2
        AND task_id = $1
        AND locked_by = $3
    `,
    [lease.taskId, lease.attemptId, lease.owner],
  );
}

async function findGptImageTaskForFinalize(
  db: SqlDatabase, taskId: string, enforceExpectedAttempt = false, expectedAttemptId: string | null = null,
) {
  return queryOne<GptImageTaskRow>(
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
        generation_snapshot.provider_status_json AS snapshot_provider_status_json,
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
      LEFT JOIN ai_generation_task_snapshots generation_snapshot
        ON generation_snapshot.task_id = t.id
      WHERE t.id = $1
        AND (
          $2::boolean = false
          OR ($3::uuid IS NOT NULL AND t.current_attempt_id = $3)
          OR ($3::uuid IS NULL AND t.attempt_count = 1)
        )
        AND t.task_type = 'episode_generate_image'
        AND t.status IN ('running', 'result_unknown', 'manual_review_required')
        AND t.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http')
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId, enforceExpectedAttempt, expectedAttemptId],
  );
}

function readGptImageArtifactRecoveryDeadline(value: Record<string, unknown> | string | null | undefined) {
  const providerStatus = parseSnapshot(value ?? {});
  const recovery = providerStatus.artifactRecovery && typeof providerStatus.artifactRecovery === "object"
    && !Array.isArray(providerStatus.artifactRecovery)
    ? providerStatus.artifactRecovery as Record<string, unknown>
    : null;
  const deadlineAt = readString(recovery?.deadlineAt);
  if (!deadlineAt) return null;
  const parsed = new Date(deadlineAt);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function findGptImageTaskForPersist(
  db: SqlDatabase, taskId: string, enforceExpectedAttempt = false, expectedAttemptId: string | null = null,
) {
  return queryOne<GptImageTaskRow>(
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
        AND t.task_type = 'episode_generate_image'
        AND (
          t.status IN ('running', 'result_unknown')
          OR (
            t.status = 'manual_review_required'
            AND t.failure_code IN ('provider_output_persist_failed', 'generation_queue_error')
          )
        )
        AND t.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http')
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId, enforceExpectedAttempt, expectedAttemptId],
  );
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

async function reopenGptImageQueueFailureAttempt(
  db: SqlDatabase,
  input: { taskId: string; attemptId: string; now: Date },
) {
  await db.query(
    `
      UPDATE task_attempts attempt
      SET status = 'manual_review_required',
          finished_at = NULL,
          updated_at = $3
      FROM tasks task
      WHERE attempt.id = $2
        AND attempt.task_id = $1
        AND attempt.status = 'failed'
        AND attempt.failure_code = 'generation_queue_error'
        AND task.id = $1
        AND task.current_attempt_id = attempt.id
        AND task.status = 'manual_review_required'
        AND task.failure_code = 'generation_queue_error'
    `,
    [input.taskId, input.attemptId, input.now],
  );
}


async function failGptImageTask(
  db: SqlDatabase,
  input: {
    row: GptImageTaskRow;
    failureCode: string;
    providerRequestId: string | null;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  const snapshot = parseSnapshot(input.row.input_snapshot_json);
  const amount = resolveGptImageBillingAmount(input.row, snapshot);
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
        metadata: input.metadata,
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
          metadata: input.metadata,
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
  await updateProjectAssetGenerationTerminalResult(db, {
    row: input.row,
    snapshot,
    status: "failed",
    failureCode: input.failureCode,
    now: input.now,
  });
  return true;
}

function resolveEpisodeGenerationAssetType(input: {
  targetType?: unknown;
  assetType?: unknown;
}): AssetType {
  if (String(input.targetType ?? "") === "asset") {
    const normalized = String(input.assetType ?? "role").trim().toLowerCase();
    if (normalized === "scene") {
      return "scene_reference";
    }
    if (normalized === "prop") {
      return "prop_reference";
    }
    return "character_sheet";
  }
  return "shot_image";
}

function fallbackGptImageModelConfig() {
  return {
    providerProtocol: "openai_images",
    providerModel: "gpt-image-2",
    providerConfig: {
      baseURL: "https://api.openai.com",
      endpoint: "/v1/images/generations",
      editEndpoint: "https://api.openai.com/v1/images/edits",
      apiKeyEnv: "GPT_IMAGE2_API_KEY",
      resultFormat: "b64_json",
    },
  };
}

function parseSnapshot(value: Record<string, unknown> | string) {
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

function parseProviderResponse(value: Record<string, unknown> | string | null | undefined) {
  if (!value) {
    return {};
  }
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

function buildGptImageRequestText(requestBody: {
  prompt: string;
  parameters: Record<string, unknown>;
  episodeId?: string;
  targetType: string;
  targetId?: string;
}) {
  const parts = [
    `prompt: ${requestBody.prompt || "(empty)"}`,
    `targetType: ${requestBody.targetType}`,
  ];
  if (requestBody.targetId) {
    parts.push(`targetId: ${requestBody.targetId}`);
  }
  if (requestBody.episodeId) {
    parts.push(`episodeId: ${requestBody.episodeId}`);
  }
  if (Object.keys(requestBody.parameters).length > 0) {
    parts.push(`parameters: ${JSON.stringify(requestBody.parameters)}`);
  }
  return parts.join("\n");
}

export function buildGptImageRequestLogBody(input: {
  requestBody: {
    prompt: string;
    model?: string;
    parameters: Record<string, unknown>;
    episodeId?: string;
    targetType: string;
    targetId?: string;
  };
  modelConfig?: {
    providerProtocol: string;
    providerConfig: Record<string, unknown>;
  } | null;
  providerName: string;
  providerOperation: string;
  providerModel: string;
  requestKey: string;
  payloadRef: string;
  payloadHash: string;
}) {
  const providerConfig = readObject(input.modelConfig?.providerConfig);
  const adapterKey = resolveImageProviderAdapterKey(input.modelConfig?.providerProtocol ?? "", providerConfig);
  if (adapterKey !== "cumob_image" && adapterKey !== "global_ai_opc_image" && adapterKey !== "san_bao") {
    return {
      requestFormat: undefined,
      requestBody: input.requestBody,
      requestText: buildGptImageRequestText(input.requestBody),
    };
  }

  const requestInput = {
    providerRequestId: "",
    providerName: input.providerName,
    providerOperation: input.providerOperation,
    requestKey: input.requestKey,
    payloadRef: input.payloadRef,
    payloadHash: input.payloadHash,
    redactedPayload: input.requestBody,
  };
  const requestBody = adapterKey === "cumob_image"
    ? buildCumobImagePayload(requestInput, {
        model: input.providerModel,
        defaultRequestParams: readObject(providerConfig.defaultRequestParams),
      })
    : adapterKey === "global_ai_opc_image"
      ? buildGlobalAiOpcImagePayload(requestInput, {
        model: input.providerModel,
        requestFormat: readString(providerConfig.requestFormat) ?? undefined,
        defaultRequestParams: readObject(providerConfig.defaultRequestParams),
      })
      : buildSanBaoImagePayload(requestInput, input.providerModel, readObject(providerConfig.modelVariants));

  return {
    requestFormat: adapterKey === "san_bao" ? "san_bao_image" : adapterKey,
    requestBody,
    requestText: JSON.stringify(requestBody, null, 2),
  };
}

function buildGptImageResponseText(
  artifact: MediaGenerationArtifact,
  externalRequestId: string | null,
) {
  const serialized = serializeGptImageArtifactForProviderResponse(artifact);
  return JSON.stringify(
    removeUndefinedValues({
      externalRequestId,
      ...serialized,
    }),
    null,
    2,
  );
}

function buildGptImageFailureResponseText(input: {
  failureCode: string;
  errorMessage: string;
  apiKeyEnv?: string;
  providerDiagnostics?: Record<string, unknown>;
}) {
  return JSON.stringify(
    removeUndefinedValues({
      failureCode: input.failureCode,
      errorMessage: translateProviderErrorMessage(input.errorMessage),
      apiKeyEnv: input.apiKeyEnv,
      providerDiagnostics: input.providerDiagnostics,
    }),
    null,
    2,
  );
}

function buildDefaultPersistUrls(runtime: UploadSessionRuntime, objectKey: string) {
  const baseUrl = runtime.publicBaseUrl?.trim().replace(/\/+$/g, "");
  const publicUrl = baseUrl
    ? `${baseUrl}/${objectKey}`
    : `/uploads/storage/${objectKey}`;
  return {
    previewUrl: publicUrl,
    sourceUrl: publicUrl,
    downloadUrl: publicUrl,
  };
}

function buildWorkerBillingMetadata(
  row: GptImageTaskRow,
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
    mediaType: "image",
    kind: "image",
    modelCode: readString(snapshot.model),
    promptSkill: readObject(snapshot.promptSkill),
    promptSkills: readArray(snapshot.promptSkills),
    providerExecutor: readString(snapshot.providerExecutor),
    provider: extra.provider,
    targetType: readString(snapshot.targetType),
    targetId: readString(snapshot.targetId),
    canvasNodeId: readString(snapshot.canvasNodeId),
    amount: resolveGptImageBillingAmount(row, snapshot),
    requestedAt,
    settledAt,
    durationMs,
    attemptId: row.attempt_id,
    providerRequestId: extra.providerRequestId,
    externalRequestId: extra.externalRequestId,
    promptPreview: truncateForLedger(prompt, 180),
    promptLength: prompt.length,
    parameterSummary: summarizeGenerationParameters(readObject(snapshot.parameters)),
    referenceCount: readArray(snapshot.referenceAssetVersionIds).length,
    failureCode: extra.failureCode,
    errorMessage: truncateForLedger(extra.errorMessage ?? "", 240),
    storageObjectKey: extra.storageObjectKey,
  });
}

function summarizeGenerationParameters(parameters: Record<string, unknown>) {
  return removeUndefinedValues({
    aspectRatio: readString(parameters.aspectRatio) ?? readString(parameters.ratio),
    resolution: readString(parameters.resolution) ?? readString(parameters.quality),
    mode: readString(parameters.mode) ?? readString(parameters.taskMode),
    referenceImages: readArray(parameters.referenceImages).length,
    referenceAssetVersionIds: readArray(parameters.referenceAssetVersionIds).length,
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

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readSnapshotPromptSkills(snapshot: Record<string, unknown>) {
  const promptSkills = readArray(snapshot.promptSkills)
    .map(readObject)
    .filter((skill) => Object.keys(skill).length);
  const legacyPromptSkill = readObject(snapshot.promptSkill);
  return promptSkills.length || !Object.keys(legacyPromptSkill).length
    ? promptSkills
    : [legacyPromptSkill];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseArtifactFromProviderResponse(
  providerResponse: Record<string, unknown>,
): MediaGenerationArtifact | null {
  return parseGptImageArtifactFromProviderResponse(providerResponse);
}

function readErrorFailureCode(error: unknown): string | undefined {
  return error && typeof error === "object" && typeof (error as { failureCode?: unknown }).failureCode === "string"
    ? String((error as { failureCode: string }).failureCode)
    : undefined;
}

function isGptImageArtifactTransferFailure(failureCode: string) {
  return failureCode === "provider_output_download_failed"
    || failureCode === "provider_output_upload_failed";
}

function readErrorRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = Number((error as { retryAfterMs?: unknown }).retryAfterMs);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readErrorApiKeyEnv(error: unknown): string | undefined {
  return error && typeof error === "object" && typeof (error as { apiKeyEnv?: unknown }).apiKeyEnv === "string"
    ? String((error as { apiKeyEnv: string }).apiKeyEnv)
    : undefined;
}

function readErrorProviderDiagnostics(error: unknown): Record<string, unknown> | undefined {
  const diagnostics = error && typeof error === "object"
    ? (error as { providerDiagnostics?: unknown }).providerDiagnostics
    : undefined;
  const object = readObject(diagnostics);
  return Object.keys(object).length > 0 ? object : undefined;
}

function readOptionalProviderDiagnostics(error: unknown) {
  const providerDiagnostics = readErrorProviderDiagnostics(error);
  return providerDiagnostics ? { providerDiagnostics } : {};
}

function gptImageFailureDisplayMessage(failureCode: string) {
  const providerHttpStatus = /^(?:cumob_image|image_provider|volcengine_ark_image|openai_images)_(\d{3})$/i.exec(failureCode)?.[1];
  if (providerHttpStatus) {
    return `图片模型服务返回 HTTP ${providerHttpStatus}，任务没有拿到生成结果，积分已返还。请稍后重试。`;
  }
  switch (failureCode) {
    case "global_ai_opc_image_failed":
      return "图片生成失败，请稍后重试";
    case "global_ai_opc_image_invalid_response":
    case "global_ai_opc_image_empty_response":
    case "global_ai_opc_image_invalid_json":
      return "图片模型返回异常，请稍后重试";
    case "global_ai_opc_image_timeout":
      return "图片生成超时，请稍后重试";
    case "global_ai_opc_image_network_error":
      return "图片模型连接失败，请稍后重试";
    case "provider_failed":
      return "图片生成服务失败，请稍后重试";
    case "provider_submission_prepare_failed":
      return "图片生成请求准备失败，请稍后重试";
    case "provider_submission_ambiguous":
      return "图片生成提交状态不明确，请稍后查看结果";
    case "provider_output_download_failed":
      return "图片生成成功但结果下载失败，请稍后重试";
    case "provider_output_persist_failed":
      return "图片生成成功但结果保存失败，请联系管理员处理";
    default:
      return `生成任务失败：${failureCode}`;
  }
}

function buildProviderErrorMessage(error: unknown) {
  return translateProviderErrorMessage(error, {
    failureCode: readErrorFailureCode(error),
    mediaType: "image",
    phase: "submit",
  });
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

function parseNonNegativeInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}
