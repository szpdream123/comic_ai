import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";
import { runtimeEnvFilePath } from "./runtime-env-file.mjs";

loadDotEnvFile(runtimeEnvFilePath());
if (process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  runRuntimeSchemaMigrations({ runtime: process.execPath, cwd: process.cwd(), env: process.env });
}

const [
  { createDevDb, runWithDatabaseContext },
  { createBullMQGenerationPublisher },
  { createBullMQGenerationQueueJobRemover },
  { createGenerationQueueAdminRecoveryJobOps, recoverGenerationQueueAdminCommands },
  { failStaleGenerationTasksBeforeProviderSubmission, repairExpiredGenerationSubmitLeases, repairQueuedGenerationTaskOutbox, repairRunningSeedancePollJobs },
  { loadGenerationQueueConfig },
  { enqueueDueGenerationPolls },
  { GenerationMaintenanceStepTimeoutError, runIsolatedGenerationMaintenanceStep },
  { processGenerationQueueJobCancellations },
  { reconcileActiveCanvasGenerationBatches },
  { restoreCanvasActorScope },
  { createCanvasGenerationBatchDispatch, repairDefinitiveProviderSubmissionFailures, repairTimedOutEpisodeGenerationTasks },
  { createStorageAdapterFromEnv },
  { reconcileCanvasMediaDerivations },
  { findGenerationArtifactHandoff },
  { repairFailedGptImageSubmissions },
  { failOrphanedTeamAssetGenerations },
  { failOrphanedCanvasAgentGenerationNodes },
  { reconcileGenerationSurfaceConsistency },
] = await Promise.all([
    import("../apps/backend/src/modules/shared/db/dev-db.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-bullmq.publisher.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue-job-remover.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue-admin-command.recovery.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-redis-repair.service.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue.config.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-due-poll.service.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-maintenance-step-runner.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue-cancellation.service.ts"),
    import("../apps/backend/src/modules/project/canvas-generation-batch.service.ts"),
    import("../apps/backend/src/modules/identity/canvas-actor-scope.service.ts"),
    import("../apps/backend/src/entrypoints/phone-auth-dev-server.ts"),
    import("../apps/backend/src/modules/storage/storage-adapter.factory.ts"),
    import("../apps/backend/src/modules/project/canvas-media-derivation.service.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-artifact-handoff.service.ts"),
    import("../apps/backend/src/modules/model-gateway/gpt-image.worker.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-orphaned-surface-repair.service.ts"),
    import("../apps/backend/src/modules/project/creator-canvas-record.service.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-consistency-reconciliation.service.ts"),
  ]);

const config = loadGenerationQueueConfig(process.env);
const failedImageSubmissionRepairBatchLimit = 100;
const db = await createGenerationMaintenanceDb();
const publisher = createBullMQGenerationPublisher(config);
const queueJobRemover = createBullMQGenerationQueueJobRemover(config);
const adminRecoveryJobOps = createGenerationQueueAdminRecoveryJobOps(db, config);
const maintenanceWorkerId = `generation-maintenance:${process.pid}`;
const canvasStorageRuntime = createCanvasStorageRuntime(process.env);
const maintenanceStepTimeoutMs = positiveInteger(
  process.env.GENERATION_MAINTENANCE_STEP_TIMEOUT_MS,
  120_000,
);
let stopping = false;
let forcedExitTimer = null;
const reportMaintenanceError = createDedupedErrorReporter("generation-maintenance");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => requestStop(signal));
}
process.on("message", (message) => {
  if (message?.type === "creator-dev-stop") requestStop(message.signal ?? "SIGTERM");
});

function requestStop(signal) {
  if (stopping) return;
  stopping = true;
  console.info(`[generation-maintenance] Received ${signal}, draining current cycle...`);
}

console.info(
  `[generation-maintenance] Scheduler started. batch=${config.outbox.dispatchBatchSize} intervalMs=${config.outbox.dispatchIntervalMs}`,
);

async function createGenerationMaintenanceDb() {
  try {
    return await createDevDb();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("Connection terminated due to connection timeout")
    ) {
      throw error;
    }
    console.warn("[generation-maintenance] PostgreSQL initialization timed out; retrying once in 500ms.");
    await sleep(500);
    return createDevDb();
  }
}

try {
  while (!stopping) {
    const startedAt = Date.now();
    const now = new Date();
    const preSubmissionFailure = await runMaintenanceStep(
      "pre_submission_failure",
      () => failStaleGenerationTasksBeforeProviderSubmission(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
        }),
    );
    const failedImageSubmissionRepair = await runMaintenanceStep(
      "failed_image_submission_repair",
      () => repairFailedGptImageSubmissions(db, {
        now,
        limit: Math.min(config.outbox.dispatchBatchSize, failedImageSubmissionRepairBatchLimit),
      }),
    );
    const leaseRepair = await runMaintenanceStep(
      "expired_submit_lease_repair",
      () => repairExpiredGenerationSubmitLeases(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
        }),
    );
    const repair = await runMaintenanceStep(
      "queued_task_outbox_repair",
      () => repairQueuedGenerationTaskOutbox(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
          staleDispatchMs: config.repair.staleDispatchMs,
        }),
    );
    const duePoll = await runMaintenanceStep(
      "due_poll_enqueue",
      () => enqueueDueGenerationPolls(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
          maxAttempts: {
            image: config.poll.image.maxAttempts,
            video: config.poll.video.maxAttempts,
            audio: config.poll.audio.maxAttempts,
          },
        }),
    );
    const pollRepair = await runMaintenanceStep(
      "running_poll_repair",
      () => repairRunningSeedancePollJobs(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
          staleDispatchMs: config.repair.staleDispatchMs,
          config,
          publisher,
        }),
    );
    const jobCancellations = await runMaintenanceStep(
      "queue_job_cancellation",
      () => processGenerationQueueJobCancellations(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
          remover: queueJobRemover,
      }),
    );
    const canvasBatchReconciliation = await runMaintenanceStep(
      "canvas_batch_reconciliation",
      () => reconcileActiveCanvasGenerationBatches(db, {
        now,
        limit: config.outbox.dispatchBatchSize,
        staleDispatchMs: config.repair.staleDispatchMs,
        createDispatch: createPersistentCanvasBatchDispatch,
      }),
    );
    const canvasDerivationReconciliation = await runMaintenanceStep(
      "canvas_derivation_reconciliation",
      () => reconcileCanvasMediaDerivations(db, {
        now,
        limit: config.outbox.dispatchBatchSize,
        resolveArtifact: (taskId) => findGenerationArtifactHandoff(db, taskId),
      }),
    );
    const timedOutEpisodeGenerationRepair = await runMaintenanceStep(
      "timed_out_episode_generation_repair",
      () => repairTimedOutEpisodeGenerationTasks(db, {
        now,
        limit: config.outbox.dispatchBatchSize,
      }),
    );
    const definitiveProviderSubmissionFailureRepair = await runMaintenanceStep(
      "definitive_provider_submission_failure_repair",
      () => repairDefinitiveProviderSubmissionFailures(db, {
        now,
        limit: config.outbox.dispatchBatchSize,
      }),
    );
    const surfaceConsistencyReconciliation = await runMaintenanceStep(
      "generation_surface_consistency",
      () => reconcileGenerationSurfaceConsistency(db, {
        now,
        limit: config.outbox.dispatchBatchSize,
      }),
    );
    const orphanedSurfaceStaleBefore = new Date(now.getTime() - Math.max(600_000, config.repair.staleDispatchMs));
    const orphanedTeamAssetRepair = await runMaintenanceStep(
      "orphaned_team_asset_repair",
      () => failOrphanedTeamAssetGenerations(db, {
        now,
        staleBefore: orphanedSurfaceStaleBefore,
        limit: config.outbox.dispatchBatchSize,
      }),
    );
    const orphanedCanvasAgentNodeRepair = await runMaintenanceStep(
      "orphaned_canvas_agent_node_repair",
      () => failOrphanedCanvasAgentGenerationNodes(db, {
        now,
        staleBefore: orphanedSurfaceStaleBefore,
        limit: config.outbox.dispatchBatchSize,
      }),
    );
    const adminCommandRecovery = await runMaintenanceStep(
      "admin_command_recovery",
      () => recoverGenerationQueueAdminCommands(db, {
        now,
        limit: Math.min(config.outbox.dispatchBatchSize, 100),
        workerId: maintenanceWorkerId,
        jobOps: adminRecoveryJobOps,
      }),
    );

    if (preSubmissionFailure?.failedTaskIds.length) {
      console.info(`[generation-maintenance] failedPreSubmissionTasks=${preSubmissionFailure.failedTaskIds.length}`);
    }
    if (failedImageSubmissionRepair && (
      failedImageSubmissionRepair.repairedTaskIds.length
      || failedImageSubmissionRepair.requeuedTaskIds.length
      || failedImageSubmissionRepair.failedTaskIds.length
    )) {
      console.info(
        `[generation-maintenance] repairedFailedImageSubmissions=${failedImageSubmissionRepair.repairedTaskIds.length} requeuedRateLimitedImageSubmissions=${failedImageSubmissionRepair.requeuedTaskIds.length} failedImageSubmissionRepairs=${failedImageSubmissionRepair.failedTaskIds.length}`,
      );
    }
    if (leaseRepair && (leaseRepair.repairedTaskIds.length || leaseRepair.resultUnknownTaskIds.length)) {
      console.info(
        `[generation-maintenance] repairedSubmitLeases=${leaseRepair.repairedTaskIds.length} resultUnknown=${leaseRepair.resultUnknownTaskIds.length}`,
      );
    }
    if (orphanedTeamAssetRepair?.failedAssetIds.length || orphanedCanvasAgentNodeRepair?.failedNodeKeys.length) {
      console.info(
        `[generation-maintenance] failedOrphanedTeamAssets=${orphanedTeamAssetRepair?.failedAssetIds.length ?? 0} failedOrphanedCanvasAgentNodes=${orphanedCanvasAgentNodeRepair?.failedNodeKeys.length ?? 0}`,
      );
    }
    if (repair?.repairedTaskIds.length) {
      console.info(`[generation-maintenance] repairedQueuedTasks=${repair.repairedTaskIds.length}`);
    }
    if (pollRepair?.repairedTaskIds.length) {
      console.info(`[generation-maintenance] repairedPollTasks=${pollRepair.repairedTaskIds.length}`);
    }
    if (duePoll?.enqueuedTaskIds.length) {
      console.info(`[generation-maintenance] enqueuedDuePollTasks=${duePoll.enqueuedTaskIds.length}`);
    }
    if (jobCancellations && (
      jobCancellations.completedAssignmentKeys.length
      || jobCancellations.failedAssignmentKeys.length
    )) {
      console.info(
        `[generation-maintenance] canceledQueueJobs=${jobCancellations.completedAssignmentKeys.length} cancellationFailures=${jobCancellations.failedAssignmentKeys.length}`,
      );
    }
    if (canvasBatchReconciliation && (
      canvasBatchReconciliation.reconciledBatchIds.length
      || canvasBatchReconciliation.failedBatches.length
    )) {
      console.info(
        `[generation-maintenance] reconciledCanvasBatches=${canvasBatchReconciliation.reconciledBatchIds.length} failedCanvasBatches=${canvasBatchReconciliation.failedBatches.length}`,
      );
    }
    if (canvasDerivationReconciliation && (
      canvasDerivationReconciliation.completedDerivationIds.length
      || canvasDerivationReconciliation.failedDerivationIds.length
      || canvasDerivationReconciliation.canceledDerivationIds.length
    )) {
      console.info(
        `[generation-maintenance] completedCanvasDerivations=${canvasDerivationReconciliation.completedDerivationIds.length} failedCanvasDerivations=${canvasDerivationReconciliation.failedDerivationIds.length} canceledCanvasDerivations=${canvasDerivationReconciliation.canceledDerivationIds.length}`,
      );
    }
    if (timedOutEpisodeGenerationRepair?.timedOutTaskIds.length) {
      console.info(`[generation-maintenance] repairedTimedOutEpisodeTasks=${timedOutEpisodeGenerationRepair.timedOutTaskIds.length}`);
    }
    if (definitiveProviderSubmissionFailureRepair?.repaired) {
      console.info(`[generation-maintenance] repairedDefinitiveProviderSubmissionFailures=${definitiveProviderSubmissionFailureRepair.repaired}`);
    }
    if (surfaceConsistencyReconciliation) {
      const repairedSurfaceCount = Object.values(surfaceConsistencyReconciliation)
        .reduce((total, ids) => total + ids.length, 0);
      if (repairedSurfaceCount) {
        console.info(`[generation-maintenance] reconciledGenerationSurfaces=${repairedSurfaceCount}`);
      }
    }
    if (adminCommandRecovery && (
      adminCommandRecovery.recoveredCommandIds.length
      || adminCommandRecovery.terminalCommandIds.length
      || adminCommandRecovery.retryableCommandIds.length
    )) {
      console.info(
        `[generation-maintenance] recoveredAdminCommands=${adminCommandRecovery.recoveredCommandIds.length} terminalAdminCommands=${adminCommandRecovery.terminalCommandIds.length} retryableAdminCommands=${adminCommandRecovery.retryableCommandIds.length}`,
      );
    }

    const elapsedMs = Date.now() - startedAt;
    await sleep(Math.max(0, config.outbox.dispatchIntervalMs - elapsedMs));
  }
} catch (error) {
  if (error instanceof GenerationMaintenanceStepTimeoutError) {
    forcedExitTimer = globalThis.setTimeout(() => {
      console.error("[generation-maintenance] cleanupDeadlineExceeded=true forcingExit=1");
      process.exit(1);
    }, 5_000);
  }
  throw error;
} finally {
  try {
    await Promise.allSettled([publisher.close(), db.close()]);
    console.info("[generation-maintenance] Scheduler stopped.");
  } finally {
    if (forcedExitTimer) clearTimeout(forcedExitTimer);
  }
}

function runMaintenanceStep(name, run) {
  return runIsolatedGenerationMaintenanceStep({
    name,
    run,
    runInContext: runWithDatabaseContext,
    timeoutMs: maintenanceStepTimeoutMs,
    onError(stepName, error) {
      reportMaintenanceError(error, `stepFailed=${stepName}`);
    },
  });
}

function createDedupedErrorReporter(scope) {
  const reported = new Set();
  return (error, context) => {
    const code = typeof error?.code === "string" ? error.code : "ERROR";
    const message = error instanceof Error ? error.message : String(error);
    const key = `${code}:${message}`;
    if (reported.has(key)) return;
    reported.add(key);
    console.error(`[${scope}] ${context} ${code}: ${message} (duplicate errors suppressed)`);
  };
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) return;
  const content = readFileSync(envFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function positiveInteger(value, fallback) {
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

async function createPersistentCanvasBatchDispatch(target) {
  const expectedPrincipal = target.actorTeamMemberId
    ? `member:${target.actorTeamMemberId}`
    : `owner:${target.ownerUserId}`;
  if (target.principalKey !== expectedPrincipal) throw new Error("canvas_batch_principal_mismatch");
  const canvasScope = await restoreCanvasActorScope(db, {
    canvasId: target.canvasProjectId,
    ownerUserId: target.ownerUserId,
    actorTeamMemberId: target.actorTeamMemberId,
  });
  const member = target.actorTeamMemberId
    ? (await db.query(`SELECT id, member_account, member_login_account, member_name FROM team_members
        WHERE id=$1 AND user_id=$2 AND status='active' AND deleted_at IS NULL LIMIT 1`,
      [target.actorTeamMemberId, target.ownerUserId])).rows[0]
    : null;
  if (target.actorTeamMemberId && !member) throw new Error("canvas_batch_actor_unavailable");
  return createCanvasGenerationBatchDispatch({
    db,
    canvasProjectId: target.canvasProjectId,
    canvasScope,
    actor: {
      userId: target.ownerUserId,
      capabilities: [],
      ...(member ? { teamMember: {
        id: member.id,
        memberAccount: member.member_account,
        memberLoginAccount: member.member_login_account,
        memberName: member.member_name,
      } } : {}),
    },
    authenticated: { sessionToken: `canvas-maintenance:${target.batchId}`, user: {
      id: target.ownerUserId,
      phone: null,
      creditBalance: 0,
      displayCreditBalance: 0,
      availableCredits: 0,
      reservedCredits: 0,
      frozenCredits: 0,
      creditFrozenAt: null,
      creditFrozenUntil: null,
    } },
    runtime: canvasStorageRuntime,
    env: process.env,
    signedUrlExpiresInSeconds: positiveInteger(process.env.STORAGE_SIGNED_URL_EXPIRES_SECONDS, 900),
  });
}

function createCanvasStorageRuntime(env) {
  const mode = (env.STORAGE_ADAPTER_MODE ?? "dev").trim();
  return {
    mode,
    provider: mode === "cos" ? "tencent_cos" : mode === "s3_compatible" ? "s3_compatible" : "creator-dev",
    bucket: env.STORAGE_BUCKET?.trim() || (mode === "dev" ? "creator-dev" : `creator-${mode}`),
    region: (env.STORAGE_REGION ?? "ap-shanghai").trim(),
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL?.trim() || env.STORAGE_ENDPOINT?.trim() || null,
    adapter: createStorageAdapterFromEnv(env),
    stsSecretId: env.STORAGE_COS_SECRET_ID?.trim() ?? null,
    stsSecretKey: env.STORAGE_COS_SECRET_KEY?.trim() ?? null,
    stsDurationSeconds: positiveInteger(env.STORAGE_COS_STS_DURATION_SECONDS, 1800),
    localUploadUrlPath: "/api/storage/upload-sessions",
  };
}
