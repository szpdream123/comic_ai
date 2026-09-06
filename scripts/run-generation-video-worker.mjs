import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Worker } from "bullmq";
import Redis from "ioredis";

import { runWithRedisStartupRetry } from "../apps/backend/src/modules/model-gateway/redis-readiness.ts";
import { acquireRuntimeScopedProcessInstanceLock } from "./process-instance-lock.mjs";
import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";
import { runtimeEnvFilePath } from "./runtime-env-file.mjs";
import { agentGenerationQueueConfig } from "../apps/backend/src/modules/model-gateway/agent-generation-queue.ts";
import { agentExecutionMetadata } from "../apps/backend/src/modules/shared/db/agent-execution-scope.ts";

loadDotEnvFile(runtimeEnvFilePath());
if (process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  runRuntimeSchemaMigrations({ runtime: process.execPath, cwd: process.cwd(), env: process.env });
}

const [
  { createDevDb, runWithDatabaseContext },
  { createStorageAdapterFromEnv },
  { buildGenerationBullMQJobId, createBullMQGenerationPublisher },
  { handleGenerationFinalizeArtifactJob, handleGenerationPollAudioJob, handleGenerationPollImageJob, handleGenerationPollVideoJob, handleGenerationSubmitAudioJob, handleGenerationSubmitImageJob, handleGenerationSubmitVideoJob },
  { handleGptImageArtifactQueueExhaustion },
  { failGenerationTaskAfterQueueError },
  { loadGenerationQueueConfig },
  { createRedisProviderRateLimiter },
  { expireGptImagePollJob, fetchGptImageArtifactJob, finalizeGptImageArtifactJob, persistGptImageArtifactJob, processGptImagePollJob, processGptImageSubmitJob },
  { processSeedanceVideoSubmitJob, processSeedanceVideoPollJob, fetchSeedanceVideoArtifactJob, finalizeSeedanceVideoArtifactJob, persistSeedanceVideoArtifactJob, expireSeedanceVideoPollJob },
  { processAudioGenerationSubmitJob, processAudioGenerationPollJob, fetchAudioGenerationArtifactJob, finalizeAudioGenerationArtifactJob, persistAudioGenerationArtifactJob, expireAudioGenerationPollJob },
  { scheduleGenerationProviderPoll },
  { generationTimeoutMsFor },
  { runGenerationQueueJobWithRetryPolicy, shouldSettleGenerationTaskAfterQueueError },
  { resolveGenerationArtifactQueueExhaustionFailureCode },
  { recordGenerationSkippedSuccessor },
] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/storage/storage-adapter.factory.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-bullmq.publisher.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-bullmq.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/gpt-image-artifact-recovery.service.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-redis-repair.service.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue.config.ts"),
  import("../apps/backend/src/modules/model-gateway/provider-rate-limiter.ts"),
  import("../apps/backend/src/modules/model-gateway/gpt-image.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/seedance-video.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/audio-generation.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-due-poll.service.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-timeout.policy.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-queue-retry.policy.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-skipped-coordinator.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-stage-successor.store.ts"),
]);

// Worker isolation configuration
const { resolveWorkerIsolationConfig } = await import("../apps/backend/src/modules/model-gateway/worker-isolation.config.ts");
const isolationConfig = resolveWorkerIsolationConfig(process.env);

const config = loadGenerationQueueConfig(process.env);
const agentQueueConfig = agentGenerationQueueConfig(config, agentExecutionMetadata(process.env).agentExecutionScope);
const workerQueueConfigs = [config, agentQueueConfig];
console.info(`[generation-video] Agent dispatch scope=${agentExecutionMetadata(process.env).agentExecutionScope} submit=${agentQueueConfig.queueNames.submit.join(",")} poll=${agentQueueConfig.queueNames.poll.join(",")} result=${agentQueueConfig.queueNames.result.join(",")}`);
const releaseLocalWorkerInstanceLock = isolationConfig.workerEnvironment === "local"
  ? acquireRuntimeScopedProcessInstanceLock([
      isolationConfig.workerEnvironment,
      process.env.DATABASE_URL ?? "",
      config.redisUrl,
      config.queuePrefix,
    ].join("\n"), { label: "generation_video_worker" })
  : () => {};
const db = await createDevDb();
const publisher = createBullMQGenerationPublisher(config);
const storageRuntime = createStorageRuntime(process.env, createStorageAdapterFromEnv(process.env));
const workerPublisher = publisher;
const connection = redisConnectionFromUrl(config.redisUrl);
const redisErrorReporter = createRedisErrorReporter("generation-video");
const rateLimitRedisErrorReporter = createRedisErrorReporter("generation-video-rate-limit");
const rateLimitRedis = new Redis(redisClientConnectionFromUrl(config.redisUrl));
rateLimitRedis.on("error", rateLimitRedisErrorReporter);
rateLimitRedis.on("ready", rateLimitRedisErrorReporter.reset);
const rateLimiter = createRedisProviderRateLimiter(rateLimitRedis, {
  keyPrefix: process.env.REDIS_KEY_PREFIX?.trim() || config.queuePrefix,
});
const workerOptions = {
  connection,
  prefix: config.queuePrefix,
  limiter: {
    max: config.queueLimits.dequeueRateLimitMax,
    duration: config.queueLimits.dequeueRateLimitDurationMs,
  },
};
const processors = {
  async schedulePoll({ taskId, attemptId, mediaType, nextPollAttempt, delayMs, now }) {
    const scheduled = await scheduleGenerationProviderPoll(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      nextPollAttempt,
      nextPollAt: new Date(now.getTime() + Math.max(0, Math.floor(delayMs))),
      pollDeadlineAt: new Date(now.getTime() + generationTimeoutMsFor(mediaType)),
      now,
    });
    return Boolean(scheduled);
  },
  async recordSkippedSuccessor(input) {
    await recordGenerationSkippedSuccessor(db, input);
  },
  async submitAudio({ taskId, now }) {
    return processAudioGenerationSubmitJob(db, {
      taskId,
      env: process.env,
      now,
    });
  },
  async pollAudio({ taskId, attemptId, now }) {
    return processAudioGenerationPollJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      env: process.env,
      now,
    });
  },
  async expireAudio({ taskId, attemptId, now }) {
    return expireAudioGenerationPollJob(db, { taskId, expectedAttemptId: attemptId ?? null, now });
  },
  async finalizeAudioArtifact({ taskId, attemptId, now }) {
    return finalizeAudioGenerationArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async fetchAudioArtifact({ taskId, attemptId, now }) {
    return fetchAudioGenerationArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async persistAudioArtifact({ taskId, attemptId, now }) {
    return persistAudioGenerationArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async submitGptImage({ taskId, userConcurrencyLimit, now }) {
    return processGptImageSubmitJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      rateLimiter,
      userConcurrencyLimit,
      now,
    });
  },
  async pollGptImage({ taskId, attemptId, now }) {
    return processGptImagePollJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      env: process.env,
      fetchImpl: undefined,
      rateLimiter,
      now,
    });
  },
  async expireGptImage({ taskId, attemptId, now }) {
    return expireGptImagePollJob(db, { taskId, expectedAttemptId: attemptId ?? null, now });
  },
  async finalizeGptImageArtifact({ taskId, attemptId, now }) {
    return finalizeGptImageArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async fetchGptImageArtifact({ taskId, attemptId, now }) {
    return fetchGptImageArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async persistGptImageArtifact({ taskId, attemptId, now }) {
    return persistGptImageArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async submitSeedanceVideo({ taskId, userConcurrencyLimit, now }) {
    return processSeedanceVideoSubmitJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      rateLimiter,
      userConcurrencyLimit,
      now,
    });
  },
  async submitGlobalAiOpcVideo({ taskId, userConcurrencyLimit, now }) {
    return processSeedanceVideoSubmitJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      rateLimiter,
      userConcurrencyLimit,
      now,
    });
  },
  async pollSeedanceVideo({ taskId, attemptId, now }) {
    return processSeedanceVideoPollJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      rateLimiter,
      now,
    });
  },
  async pollGlobalAiOpcVideo({ taskId, attemptId, now }) {
    return processSeedanceVideoPollJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      rateLimiter,
      now,
    });
  },
  async expireSeedanceVideo({ taskId, attemptId, now }) {
    return expireSeedanceVideoPollJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      env: process.env,
      now,
    });
  },
  async expireGlobalAiOpcVideo({ taskId, attemptId, now }) {
    return expireSeedanceVideoPollJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      env: process.env,
      now,
    });
  },
  async finalizeSeedanceVideoArtifact({ taskId, attemptId, now }) {
    return finalizeSeedanceVideoArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async finalizeGlobalAiOpcVideoArtifact({ taskId, attemptId, now }) {
    return finalizeSeedanceVideoArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async fetchSeedanceVideoArtifact({ taskId, attemptId, now }) {
    return fetchSeedanceVideoArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async fetchGlobalAiOpcVideoArtifact({ taskId, attemptId, now }) {
    return fetchSeedanceVideoArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async persistSeedanceVideoArtifact({ taskId, attemptId, now }) {
    return persistSeedanceVideoArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async persistGlobalAiOpcVideoArtifact({ taskId, attemptId, now }) {
    return persistSeedanceVideoArtifactJob(db, {
      taskId,
      expectedAttemptId: attemptId ?? null,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
};

const submitQueueProcessor = async (job, queueConfig) => runGenerationQueueJobWithRetryPolicy(() => runWithDatabaseContext(async () => {
  const input = { job, config: queueConfig, publisher: workerPublisher, processors, now: new Date() };
  if (job.data?.mediaType === "video") return handleGenerationSubmitVideoJob(input);
  if (job.data?.mediaType === "audio") return handleGenerationSubmitAudioJob(input);
  return handleGenerationSubmitImageJob(input);
}));

const pollQueueProcessor = async (job, queueConfig) => runGenerationQueueJobWithRetryPolicy(() => runWithDatabaseContext(async () => {
  const input = { job, config: queueConfig, publisher: workerPublisher, processors, now: new Date() };
  if (job.data?.mediaType === "video") return handleGenerationPollVideoJob(input);
  if (job.data?.mediaType === "audio") return handleGenerationPollAudioJob(input);
  return handleGenerationPollImageJob(input);
}));

const resultQueueProcessor = async (job, queueConfig) => runGenerationQueueJobWithRetryPolicy(() => runWithDatabaseContext(async () => handleGenerationFinalizeArtifactJob({
  job: withDefaultStorageBucket(job, storageRuntime.bucket),
  config: queueConfig,
  publisher: workerPublisher,
  processors,
  finalizeRateLimiter: rateLimiter,
  now: new Date(),
})));

const submitWorkers = workerQueueConfigs.flatMap((queueConfig) => queueConfig.queueNames.submit.map((queueName) => new Worker(
  queueName,
  (job) => submitQueueProcessor(job, queueConfig),
  { ...workerOptions, concurrency: Math.max(config.submit.image.concurrency, config.submit.video.concurrency) },
)));
const pollWorkers = workerQueueConfigs.flatMap((queueConfig) => queueConfig.queueNames.poll.map((queueName) => new Worker(
  queueName,
  (job) => pollQueueProcessor(job, queueConfig),
  { ...workerOptions, concurrency: Math.max(config.poll.image.concurrency, config.poll.video.concurrency, config.poll.audio.concurrency) },
)));
const resultWorkers = workerQueueConfigs.flatMap((queueConfig) => queueConfig.queueNames.result.map((queueName) => new Worker(
  queueName,
  (job) => resultQueueProcessor(job, queueConfig),
  { ...workerOptions, concurrency: config.finalize.artifact.concurrency },
)));
const generationWorkers = [...submitWorkers, ...pollWorkers, ...resultWorkers];


const exhaustedGenerationJobs = new Set();
for (const worker of generationWorkers) {
  worker.on("error", redisErrorReporter);
  worker.on("ready", redisErrorReporter.reset);
  worker.on("completed", () => undefined);
  worker.on("failed", (job, error) => {
    console.error(`[generation-video] job failed queue=${worker.name} id=${job?.id ?? "unknown"} ${error.message}`);
    const taskId = job?.data?.taskId;
    const configuredAttempts = Math.max(1, Number(job?.opts?.attempts ?? 1));
    if (!taskId || !shouldSettleGenerationTaskAfterQueueError(error, job.attemptsMade, configuredAttempts)) {
      return;
    }
    const handling = handleExhaustedGenerationJob(worker.name, job, error, taskId);
    exhaustedGenerationJobs.add(handling);
    void handling.then(
      () => exhaustedGenerationJobs.delete(handling),
      () => exhaustedGenerationJobs.delete(handling),
    );
  });
}

console.info(
  `[generation-video] Worker started. submit=${config.queueNames.submit.join(",")} poll=${config.queueNames.poll.join(",")} result=${config.queueNames.result.join(",")}`,
);

if (isolationConfig.enableIsolation) {
  console.info(
    `[generation-video] Worker Isolation: ENABLED | Environment: ${isolationConfig.workerEnvironment} | Detected Host: ${isolationConfig.detectedHost} | Worker ID Prefix: ${isolationConfig.workerIdPrefix}`,
  );
} else {
  console.info(`[generation-video] Worker Isolation: DISABLED`);
}

async function handleExhaustedGenerationJob(queueName, job, error, taskId) {
  const attemptId = typeof job?.data?.attemptId === "string" && job.data.attemptId.trim()
    ? job.data.attemptId.trim()
    : null;
  const failedAt = new Date();
  const artifactStage = job?.data?.artifactStage;
  const artifactQueueFailure = workerQueueConfigs.some((queueConfig) => queueConfig.queueNames.result.includes(queueName))
    || artifactStage === "fetch"
    || artifactStage === "persist";
  try {
    let handled = false;
    if (artifactQueueFailure && job?.data?.mediaType === "image") {
      const imageRecoveryOutcome = await runWithDatabaseContext(() =>
        handleGptImageArtifactQueueExhaustion(db, {
          taskId,
          expectedAttemptId: attemptId ?? null,
          error,
          now: failedAt,
        }));
      handled = imageRecoveryOutcome !== "skipped";
    }
    if (!handled) {
      await runWithDatabaseContext(() => failGenerationTaskAfterQueueError(db, {
        taskId,
        expectedAttemptId: attemptId ?? null,
        failureCode: artifactQueueFailure
          ? resolveGenerationArtifactQueueExhaustionFailureCode(
              typeof error?.failureCode === "string" ? error.failureCode : error.message,
            )
          : "generation_queue_error",
        displayMessage: "生成队列自动重试已耗尽，任务结果仍可能存在，已保留积分并转人工核对。",
        creditOutcome: "manual_review_required",
        ...(!artifactQueueFailure ? { requireProviderSubmissionNotStarted: true } : {}),
        now: failedAt,
      }));
    }

  } catch (settleError) {
    console.error(`[generation-video] failed to settle queue error task=${taskId} ${settleError.message}`);
  }

}

function requestShutdown(signal) {
  shutdownPromise ??= shutdown(signal).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
  return shutdownPromise;
}

async function shutdown(signal) {
  console.info(`[generation-video] Received ${signal}, closing workers...`);
  await Promise.allSettled([
    ...generationWorkers.map((worker) => worker.close()),
  ]);
  if (exhaustedGenerationJobs.size > 0) {
    console.info(`[generation-video] Waiting for exhausted job handlers count=${exhaustedGenerationJobs.size}...`);
    await Promise.allSettled([...exhaustedGenerationJobs]);
  }
  await Promise.allSettled([
    publisher.close(),
    rateLimitRedis.quit(),
    db.close(),
  ]);
  releaseLocalWorkerInstanceLock();
  console.info("[generation-video] Worker stopped.");
}

function createStorageRuntime(env, adapter) {
  const mode = (env.STORAGE_ADAPTER_MODE ?? "dev").trim();
  return {
    mode,
    provider: mode === "cos" ? "tencent_cos" : mode === "s3_compatible" ? "s3_compatible" : "creator-dev",
    bucket: env.STORAGE_BUCKET?.trim() || (mode === "dev" ? "creator-dev" : `creator-${mode}`),
    region: env.STORAGE_REGION?.trim() || "ap-shanghai",
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL?.trim() || env.STORAGE_ENDPOINT?.trim() || null,
    adapter,
    stsSecretId: env.STORAGE_COS_SECRET_ID?.trim() || null,
    stsSecretKey: env.STORAGE_COS_SECRET_KEY?.trim() || null,
    stsDurationSeconds: Number(env.STORAGE_COS_STS_DURATION_SECONDS ?? 1800),
    localUploadUrlPath: "/api/storage/upload-sessions",
  };
}

function withDefaultStorageBucket(job, bucket) {
  if (job?.data?.storageBucket) {
    return job;
  }
  return {
    ...job,
    data: {
      ...job.data,
      storageBucket: bucket,
    },
  };
}

function redisConnectionFromUrl(redisUrl) {
  const url = new URL(redisUrl);
  const tlsEnabled = url.protocol === "rediss:";
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: decodeURIComponent(url.username || ""),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: tlsEnabled ? {} : undefined,
    keepAlive: 30_000,
  };
}

function redisClientConnectionFromUrl(redisUrl) {
  return {
    ...redisConnectionFromUrl(redisUrl),
    connectTimeout: 2_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 1_000, 5_000),
  };
}

function createRedisErrorReporter(scope) {
  const reported = new Set();
  let recoveryTimer = null;
  const reporter = (error) => {
    const code = typeof error?.code === "string" ? error.code : "REDIS_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    const isConnectivityError = [
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "NR_CLOSED",
    ].includes(code);
    const key = `${code}:${message}`;
    if (isConnectivityError && reported.has(key)) return;
    if (isConnectivityError) reported.add(key);
    console.error(`[${scope}] Redis connection error ${code}: ${message}${isConnectivityError ? " (duplicate errors suppressed)" : ""}`);
    if (isConnectivityError && !recoveryTimer) {
      recoveryTimer = setTimeout(() => {
        console.error(`[${scope}] Redis remained unavailable for 10s; shutting down this worker.`);
        process.exitCode = 1;
        void requestShutdown(`${scope}:redis_unavailable`);
      }, 10_000);
      recoveryTimer.unref?.();
    }
  };
  reporter.reset = () => {
    reported.clear();
    if (recoveryTimer) {
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
  };
  return reporter;
}

async function readGenerationQueueRunnableCounts(redis, queueNames, prefix) {
  const uniqueQueueNames = [...new Set(queueNames)];
  if (uniqueQueueNames.length === 0) return new Map();
  const pipeline = redis.pipeline();
  for (const queueName of uniqueQueueNames) {
    pipeline.llen(`${prefix}:${queueName}:wait`);
    pipeline.zcard(`${prefix}:${queueName}:prioritized`);
  }
  const results = await pipeline.exec();
  if (!results || results.length !== uniqueQueueNames.length * 2) {
    throw new Error("generation_queue_runnable_count_failed");
  }
  const counts = new Map();
  for (let index = 0; index < uniqueQueueNames.length; index += 1) {
    const waiting = readRedisCount(results[index * 2]);
    const prioritized = readRedisCount(results[index * 2 + 1]);
    counts.set(uniqueQueueNames[index], waiting + prioritized);
  }
  return counts;
}

function readRedisCount(result) {
  const [error, value] = result;
  if (error) throw error;
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("generation_queue_runnable_count_invalid");
  }
  return count;
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) {
    return;
  }

  const content = readFileSync(envFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

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
