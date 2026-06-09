import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import { settleReservationAllocation } from "../credit-billing/credit-ledger.service.ts";
import { createAssetVersionSnapshot } from "../project/asset-version-record.service.ts";
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
} from "../model-catalog/ai-model-config.store.ts";
import { createProviderAdapterFromModelConfig } from "./provider-adapter.factory.ts";
import type { ProviderRateLimiter, ProviderRateLimitGrant } from "./provider-rate-limiter.ts";
import {
  markProviderRequestFailed,
  markProviderRequestSucceeded,
  submitProviderRequest,
} from "./provider-request.service.ts";
import {
  markGenerationTaskSnapshotFailed,
  markGenerationTaskSnapshotResultUnknown,
  markGenerationTaskSnapshotRunning,
  markGenerationTaskSnapshotSucceeded,
  markGenerationTaskSnapshotManualReviewRequired,
} from "./generation-task-snapshot.service.ts";

interface SeedanceTaskRow {
  task_id: string;
  workflow_id: string;
  attempt_id: string | null;
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

interface SeedancePollAdapter {
  poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    videoUrl?: string;
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
  const dispatchPolicy = await findActiveAiModelDispatchPolicyByModelCode(db, modelCode);
  const permit = await acquireSeedanceSubmitPermit(input.rateLimiter, {
    providerName: modelConfig?.providerName || "volcengine",
    modelCode,
    organizationId: row.organization_id,
    providerRpmLimit: dispatchPolicy?.providerRpmLimit ?? 60,
    providerConcurrentLimit: dispatchPolicy?.providerConcurrentLimit ?? 5,
    submitConcurrencyLimit: dispatchPolicy?.submitConcurrencyLimit ?? 5,
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
    leaseMs: 15 * 60_000,
  });
  if (!claim) {
    if (permit?.granted) {
      await permit.release();
    }
    return { status: "skipped" };
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
  );
  const payloadRef = `creator://episodes/${readString(snapshot.episodeId) || row.task_id}/video/${row.task_id}`;
  const payloadHash = sha256(`${payloadRef}:${readString(snapshot.prompt) ?? ""}:${readString(snapshot.firstFrameUrl) ?? ""}`);

  try {
    const submitted = await submitProviderRequest(db, {
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      workflowId: row.workflow_id,
      taskId: row.task_id,
      attemptId: claim.attempt.id,
      providerName: modelConfig?.providerName || "volcengine",
      providerOperation: operationNames.episodeVideoGenerate,
      requestKey: `${row.workflow_id}:${row.task_id}`,
      requestHash: sha256(`${row.task_id}:${modelCode}:${readString(snapshot.prompt) ?? ""}`),
      payloadRef,
      payloadHash,
      redactedPayload: {
        prompt: readString(snapshot.prompt) ?? "",
        motionPrompt: readString(snapshot.prompt) ?? "",
        firstFrameUrl: readString(snapshot.firstFrameUrl),
        parameters: readObject(snapshot.parameters),
        episodeId: readString(snapshot.episodeId),
        targetType: readString(snapshot.targetType) ?? "episode",
        targetId: readString(snapshot.targetId) ?? readString(snapshot.episodeId),
      },
      createdByUserId: row.created_by_user_id,
      now: input.now,
      adapter,
    });

    return {
      status: submitted.kind === "already_started" ? "already_started" : "submitted",
      externalRequestId: submitted.request.externalRequestId,
    };
  } catch (error) {
    const providerRequest = await findLatestProviderRequestForTask(db, row.task_id);
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failSeedanceTask(db, {
      row: { ...row, attempt_id: claim.attempt.id },
      failureCode: "provider_submission_failed",
      providerRequestId: providerRequest?.provider_request_id ?? null,
      redactedResponse: { errorMessage },
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
    if (permit?.granted) {
      await permit.release();
    }
  }
}

async function findLatestProviderRequestForTask(db: SqlDatabase, taskId: string) {
  return queryOne<{
    provider_request_id: string;
    failure_code: string | null;
  }>(
    db,
    `
      SELECT id AS provider_request_id, failure_code
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
      await markProviderRequestFailed(db, {
        providerRequestId: row.provider_request_id,
        failureCode: "provider_failed",
        redactedResponse: poll.redactedResponse,
        now: input.now,
      });
      await failSeedanceTask(db, {
        row,
        failureCode: "provider_failed",
        providerRequestId: row.provider_request_id,
        redactedResponse: poll.redactedResponse,
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
          providerMessage: readString(poll.redactedResponse.providerMessage),
          displayMessage: readString(poll.redactedResponse.providerMessage) || "provider_failed",
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
    await markGenerationTaskSnapshotRunning(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      progressStage: "saving_asset",
      providerStatus: {
        ...poll.redactedResponse,
        videoUrl: poll.videoUrl,
      },
      now: input.now,
    });

    return { status: "succeeded" };
  } catch (error) {
    throw error;
  } finally {
    if (permit?.granted) {
      await permit.release();
    }
  }
}

export async function expireSeedanceVideoPollJob(
  db: SqlDatabase,
  input: {
    taskId: string;
    now: Date;
  },
): Promise<{ status: "failed"; failureCode: "provider_poll_timeout" }> {
  const row = await findSeedanceTaskForPoll(db, input.taskId);
  if (!row?.attempt_id) {
    return { status: "failed", failureCode: "provider_poll_timeout" };
  }

  const timeoutStatus = {
    provider: "seedance",
    externalRequestId: row.external_request_id,
    failureCode: "provider_poll_timeout",
  };
  if (row.provider_request_id) {
    await markProviderRequestFailed(db, {
      providerRequestId: row.provider_request_id,
      failureCode: "provider_poll_timeout",
      redactedResponse: timeoutStatus,
      now: input.now,
    });
  }
  await markSeedanceTaskResultUnknown(db, {
    row,
    failureCode: "provider_poll_timeout",
    providerRequestId: row.provider_request_id,
    redactedResponse: timeoutStatus,
    now: input.now,
  });
  await markGenerationTaskSnapshotResultUnknown(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    providerStatus: timeoutStatus,
    failure: {
      failureCode: "provider_poll_timeout",
      displayMessage: "provider_poll_timeout",
    },
    creditSummary: {
      reserved: Number(row.amount_reserved ?? 0),
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });

  return { status: "failed", failureCode: "provider_poll_timeout" };
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
  const row = await findSeedanceTaskForPoll(db, input.taskId);
  if (!row?.provider_request_id || !row.external_request_id || !row.attempt_id) {
    return { status: "skipped" };
  }
  const snapshot = parseSnapshot(row.input_snapshot_json);
  const providerResponse = parseProviderResponse(row.provider_response_redacted_json);
  const videoUrl = readString(providerResponse.videoUrl);
  if (!videoUrl) {
    return { status: "skipped" };
  }

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
    const storageObjectKey = readErrorStorageObjectKey(error);
    if (failureCode === "provider_output_persist_failed") {
      await markSeedanceTaskManualReview(db, {
        row,
        failureCode,
        providerRequestId: row.provider_request_id,
        redactedResponse: {
          provider: "seedance",
          externalRequestId: row.external_request_id,
          failureCode,
          storageObjectKey,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
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
    await failSeedanceTask(db, {
      row,
      failureCode,
      providerRequestId: row.provider_request_id,
      redactedResponse: {
        provider: "seedance",
        externalRequestId: row.external_request_id,
        failureCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      now: input.now,
    });
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
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
      allocationKey: "seedance-result",
      amount,
      outcome: "consumed",
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      metadata: {
        provider: "seedance",
        externalRequestId: row.external_request_id,
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
      provider: "seedance",
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
      provider: "seedance",
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
      metadata: {
        provider: "seedance",
        externalRequestId: row.external_request_id,
        storageObjectKey,
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
      provider: "seedance",
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
        ON pr.organization_id = t.organization_id
       AND pr.task_id = t.id
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
        ON pr.organization_id = t.organization_id
       AND pr.task_id = t.id
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
    provider: "seedance",
    externalRequestId: input.row.external_request_id,
  };
  let pendingStorageObjectId: string | null = null;
  let pendingStorageObjectKey: string | null = null;
  try {
    const objectName = `episodes/${readString(input.snapshot.episodeId) || input.row.task_id}/seedance/seedance-video-${input.row.task_id}.mp4`;
    const uploaded = await uploadProviderArtifactToStorage(db, {
      artifactUrl: input.videoUrl,
      objectName,
      organizationId: input.row.organization_id,
      workspaceId: input.row.workspace_id,
      projectId: input.row.project_id,
      runtime: input.runtime,
      metadata: artifactMetadata,
      env: input.env,
      fetchImpl: input.fetchImpl,
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
        provider: "seedance",
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
    objectName: string;
    organizationId: string;
    workspaceId: string | null;
    projectId: string | null;
    runtime: UploadSessionRuntime;
    metadata: Record<string, unknown>;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<{
  storageObject: StorageObjectRecord;
  contentType: string;
  sizeBytes: number | null;
  uploadResult?: { eTag?: string | null; versionId?: string | null };
}> {
  const { retryAttempts, retryDelayMs } = readGenerationArtifactUploadConfig(input.env);
  const fetchImpl = input.fetchImpl ?? fetch;
  let storageObject: StorageObjectRecord | null = null;
  let contentType = "application/octet-stream";
  let knownSizeBytes: number | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const response = await fetchImpl(input.artifactUrl);
    if (!response.ok || !response.body) {
      throw Object.assign(new Error(`provider_artifact_download_${response.status}`), {
        failureCode: "provider_output_download_failed",
        storageObjectId: storageObject?.id,
      });
    }
    contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || contentType;
    knownSizeBytes = parseContentLength(response.headers.get("content-length")) ?? knownSizeBytes;

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
        createdByUserId: null,
        now: input.now,
      });
    }

    const counted = createCountingUploadStream(response.body);
    try {
      if (typeof input.runtime.adapter.putObject !== "function") {
        throw new Error("storage_put_object_required");
      }
      const uploadResult = await input.runtime.adapter.putObject({
        bucket: storageObject.bucket,
        objectKey: storageObject.objectKey,
        body: counted.stream,
        contentType,
        contentLength: knownSizeBytes,
      });
      return {
        storageObject,
        contentType,
        sizeBytes: knownSizeBytes ?? counted.getSizeBytes(),
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

function createCountingUploadStream(body: ReadableStream<Uint8Array>) {
  let sizeBytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      sizeBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
      callback(null, chunk);
    },
  });
  return {
    stream: Readable.fromWeb(body as never).pipe(counter),
    getSizeBytes: () => sizeBytes,
  };
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

async function acquireSeedanceSubmitPermit(
  rateLimiter: ProviderRateLimiter | undefined,
  input: {
    providerName: string;
    modelCode: string;
    organizationId: string;
    providerRpmLimit: number;
    providerConcurrentLimit: number;
    submitConcurrencyLimit: number;
    now: Date;
  },
): Promise<ProviderRateLimitGrant | null> {
  if (!rateLimiter) {
    return null;
  }

  return rateLimiter.acquireSubmitPermit({
    providerName: input.providerName,
    modelCode: input.modelCode,
    organizationId: input.organizationId,
    rpmLimit: input.providerRpmLimit,
    providerConcurrentLimit: input.providerConcurrentLimit,
    modelConcurrentLimit: input.submitConcurrencyLimit,
    tenantConcurrentLimit: input.submitConcurrencyLimit,
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
  };
}

function parseContentLength(value: string | null) {
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
