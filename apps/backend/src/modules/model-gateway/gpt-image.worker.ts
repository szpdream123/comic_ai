import { createHash } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import { settleReservationAllocation } from "../credit-billing/credit-ledger.service.ts";
import { createAssetVersionSnapshot } from "../project/asset-version-record.service.ts";
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
import { findActiveAiModelConfigByCode } from "../model-catalog/ai-model-config.store.ts";
import { createProviderAdapterFromModelConfig } from "./provider-adapter.factory.ts";
import type { MediaGenerationArtifact } from "./provider-adapter.contract.ts";
import {
  markProviderRequestSucceeded,
  submitProviderRequest,
} from "./provider-request.service.ts";
import {
  parseGptImageArtifactFromProviderResponse,
  persistGptImageArtifact,
  serializeGptImageArtifactForProviderResponse,
} from "./gpt-image.artifact-finalizer.ts";
import {
  markGenerationTaskSnapshotFailed,
  markGenerationTaskSnapshotManualReviewRequired,
  markGenerationTaskSnapshotRunning,
  markGenerationTaskSnapshotSucceeded,
} from "./generation-task-snapshot.service.ts";

interface GptImageTaskRow {
  task_id: string;
  workflow_id: string;
  attempt_id: string | null;
  organization_id: string;
  workspace_id: string | null;
  project_id: string;
  input_snapshot_json: Record<string, unknown> | string;
  created_by_user_id: string | null;
  provider_request_id?: string | null;
  external_request_id?: string | null;
  provider_response_redacted_json?: Record<string, unknown> | string | null;
  reservation_id: string | null;
  amount_reserved: number | string | null;
}

export async function processGptImageSubmitJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<
  | { status: "submitted" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" }
> {
  const row = await findGptImageTaskForSubmit(db, input.taskId);
  if (!row) {
    return { status: "skipped" };
  }

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const modelCode = readString(snapshot.model) || "gpt-image-2-cn";
  const modelConfig = await findActiveAiModelConfigByCode(db, modelCode);
  const claim = await claimQueuedTask(db, {
    taskId: row.task_id,
    workerId: "gpt-image-submit-worker",
    now: input.now,
    leaseMs: 15 * 60_000,
  });
  if (!claim) {
    return { status: "skipped" };
  }

  let providerRequestId: string | null = null;
  try {
    const adapter = createProviderAdapterFromModelConfig(
      modelConfig
        ? {
            providerProtocol: modelConfig.providerProtocol,
            providerModel: modelConfig.providerModel,
            providerConfig: modelConfig.providerConfig,
          }
        : fallbackGptImageModelConfig(input.env),
      input.env,
      input.fetchImpl,
    );
    const payloadRef = `creator://episodes/${readString(snapshot.episodeId) || row.task_id}/image/${row.task_id}`;
    const prompt = readString(snapshot.prompt) || "";
    const submitted = await submitProviderRequest(db, {
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      workflowId: row.workflow_id,
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerName: modelConfig?.providerName || "openai",
      providerOperation: operationNames.episodeImageGenerate,
      requestKey: `${row.workflow_id}:${row.task_id}`,
      requestHash: sha256(`${row.task_id}:${modelCode}:${prompt}`),
      payloadRef,
      payloadHash: sha256(`${payloadRef}:${prompt}`),
      redactedPayload: {
        prompt,
        parameters: readObject(snapshot.parameters),
        episodeId: readString(snapshot.episodeId),
        targetType: readString(snapshot.targetType) ?? "episode",
        targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId),
      },
      createdByUserId: row.created_by_user_id,
      now: input.now,
      adapter,
    });
    providerRequestId = submitted.request.id;
    if (submitted.kind !== "submitted" || !submitted.artifacts?.length) {
      throw Object.assign(new Error("gpt_image_artifact_missing"), {
        failureCode: "provider_output_download_failed",
      });
    }

    const artifact = submitted.artifacts.find((item) => item.mediaType === "image");
    if (!artifact) {
      throw Object.assign(new Error("gpt_image_image_artifact_missing"), {
        failureCode: "provider_output_download_failed",
      });
    }

    await markProviderRequestSucceeded(db, {
      providerRequestId,
      externalRequestId: submitted.request.externalRequestId,
      now: input.now,
      redactedResponse: {
        ...(submitted.request.redactedResponse ?? {}),
        artifact: serializeGptImageArtifactForProviderResponse(artifact),
      },
    });
    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerRequestId,
      progressStage: "provider_succeeded",
      providerStatus: {
        provider: "gpt-image-2",
        externalRequestId: submitted.request.externalRequestId,
      },
      now: input.now,
    });

    return { status: "submitted" };
  } catch (error) {
    const failureCode = readErrorFailureCode(error) ?? "provider_failed";
    await failGptImageTask(db, {
      row: { ...row, attempt_id: claim.attempt.id },
      failureCode,
      providerRequestId,
      metadata: {
        provider: "gpt-image-2",
        failureCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      now: input.now,
    });
    return { status: "failed", failureCode };
  }
}

export async function finalizeGptImageArtifactJob(
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
  const row = await findGptImageTaskForFinalize(db, input.taskId);
  if (!row?.provider_request_id || !row.attempt_id) {
    return { status: "skipped" };
  }

  const snapshot = parseSnapshot(row.input_snapshot_json);
  const providerResponse = parseProviderResponse(row.provider_response_redacted_json);
  const artifact = parseArtifactFromProviderResponse(providerResponse);
  if (!artifact) {
    return { status: "skipped" };
  }

  let persisted: Awaited<ReturnType<typeof persistGptImageArtifact>>;
  try {
    persisted = await persistGptImageArtifact(db, {
      task: {
        organizationId: row.organization_id,
        workspaceId: row.workspace_id,
        projectId: row.project_id,
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
      assetType: resolveEpisodeGenerationAssetType({
        targetType: readString(snapshot.targetType),
        assetType: snapshot.assetType,
      }),
      assetKey: `image:${readString(snapshot.episodeId) || row.project_id}:${row.task_id}`,
    });
  } catch (error) {
    const failureCode = readErrorFailureCode(error) ?? "provider_output_persist_failed";
    const storageObjectKey = readErrorStorageObjectKey(error);
    if (failureCode === "provider_output_persist_failed") {
      await markGptImageTaskManualReview(db, {
        row,
        failureCode,
        providerRequestId: row.provider_request_id ?? null,
        metadata: {
          provider: "gpt-image-2",
          failureCode,
          storageObjectKey,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
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
          errorMessage: error instanceof Error ? error.message : String(error),
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
    await failGptImageTask(db, {
      row,
      failureCode,
      providerRequestId: row.provider_request_id ?? null,
      metadata: {
        provider: "gpt-image-2",
        failureCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      now: input.now,
    });
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id ?? null,
      failure: {
        failureCode,
        displayMessage: failureCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      creditSummary: {
        released: Number(row.amount_reserved ?? 0),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    return { status: "failed", failureCode };
  }

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
      allocationKey: "gpt-image-2-result",
      amount,
      outcome: "consumed",
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id ?? null,
      metadata: {
        provider: "gpt-image-2",
        externalRequestId: row.external_request_id ?? null,
      },
      now: input.now,
    });
  }
  await markGenerationTaskSnapshotSucceeded(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id ?? null,
    resultAssets: [persisted],
    providerStatus: {
      provider: "gpt-image-2",
      externalRequestId: row.external_request_id ?? null,
    },
    creditSummary: {
      consumed: amount,
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });

  return { status: "succeeded" };
}

export async function persistGptImageArtifactJob(
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
  const row = await findGptImageTaskForPersist(db, input.taskId);
  if (!row?.attempt_id) {
    return { status: "skipped" };
  }
  const snapshot = parseSnapshot(row.input_snapshot_json);
  const failure = await findGenerationTaskSnapshotFailure(db, row.task_id);
  const storageObjectKey = readString(failure.storageObjectKey) ?? readString(failure.storage_object_key);
  if (!storageObjectKey) {
    return { status: "failed", failureCode: "provider_output_persist_failed" };
  }
  const storageObject = await findStorageObjectByKey(db, {
    organizationId: row.organization_id,
    objectKey: storageObjectKey,
  });
  if (!storageObject || storageObject.status !== "available") {
    return { status: "failed", failureCode: "provider_output_persist_failed" };
  }

  const urls = buildDefaultPersistUrls(input.runtime, storageObject.objectKey);
  const created = await createAssetVersionSnapshot(db, {
    organizationId: row.organization_id,
    projectId: row.project_id,
    assetType: resolveEpisodeGenerationAssetType({
      targetType: readString(snapshot.targetType),
      assetType: snapshot.assetType,
    }),
    assetKey: `image:${readString(snapshot.episodeId) || row.project_id}:${row.task_id}`,
    createdByUserId: row.created_by_user_id ?? "",
    storageObjectId: storageObject.id,
    storageObjectKey: storageObject.objectKey,
    metadata: {
      mimeType: storageObject.contentType,
      label: "GPT Image 2 episode image",
      episodeId: readString(snapshot.episodeId) ?? null,
      taskId: row.task_id,
      targetType: readString(snapshot.targetType) ?? "episode",
      targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId) ?? null,
      previewUrl: urls.previewUrl,
      sourceUrl: urls.sourceUrl,
      downloadUrl: urls.downloadUrl,
      provider: "gpt-image-2",
      externalRequestId: row.external_request_id ?? null,
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
    mediaKind: "image",
    mimeType: storageObject.contentType,
    url: urls.previewUrl,
    previewUrl: urls.previewUrl,
    sourceUrl: urls.sourceUrl,
    downloadUrl: urls.downloadUrl,
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
      allocationKey: "gpt-image-2-persist-retry",
      amount,
      outcome: "consumed",
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id ?? null,
      metadata: {
        provider: "gpt-image-2",
        externalRequestId: row.external_request_id ?? null,
        storageObjectKey,
      },
      now: input.now,
    });
  }
  await markGenerationTaskSnapshotSucceeded(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id ?? null,
    resultAssets: [persisted],
    providerStatus: {
      provider: "gpt-image-2",
      externalRequestId: row.external_request_id ?? null,
    },
    creditSummary: {
      consumed: amount,
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });

  return { status: "succeeded" };
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
      metadata: input.metadata,
      now: input.now,
    });
  }
}

async function findGptImageTaskForSubmit(db: SqlDatabase, taskId: string) {
  return queryOne<GptImageTaskRow>(
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
        NULL::jsonb AS provider_response_redacted_json,
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
        AND t.task_type = 'episode_generate_image'
        AND t.status = 'queued'
        AND t.input_snapshot_json->>'providerExecutor' = 'gpt-image-2'
      LIMIT 1
    `,
    [taskId],
  );
}

async function findGptImageTaskForFinalize(db: SqlDatabase, taskId: string) {
  return queryOne<GptImageTaskRow>(
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
        ON pr.organization_id = t.organization_id
       AND pr.task_id = t.id
      LEFT JOIN credit_reservations r
        ON r.organization_id = t.organization_id
       AND r.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_image'
        AND t.status = 'running'
        AND t.input_snapshot_json->>'providerExecutor' = 'gpt-image-2'
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId],
  );
}

async function findGptImageTaskForPersist(db: SqlDatabase, taskId: string) {
  return queryOne<GptImageTaskRow>(
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
        ON pr.organization_id = t.organization_id
       AND pr.task_id = t.id
      LEFT JOIN credit_reservations r
        ON r.organization_id = t.organization_id
       AND r.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_image'
        AND t.status = 'manual_review_required'
        AND t.failure_code = 'provider_output_persist_failed'
        AND t.input_snapshot_json->>'providerExecutor' = 'gpt-image-2'
      ORDER BY pr.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [taskId],
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
      metadata: input.metadata,
      now: input.now,
    });
  }
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

function fallbackGptImageModelConfig(env: NodeJS.ProcessEnv) {
  return {
    providerProtocol: "openai_images",
    providerModel: env.GPT_IMAGE2_PROVIDER_MODEL?.trim() || "gpt-image-2",
    providerConfig: {
      baseURL: env.GPT_IMAGE2_BASE_URL?.trim() || "https://api.openai.com",
      endpoint: env.GPT_IMAGE2_ENDPOINT?.trim() || "/v1/images/generations",
      apiKeyEnv: env.GPT_IMAGE2_API_KEY_ENV?.trim() || "GPT_IMAGE2_API_KEY",
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

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
