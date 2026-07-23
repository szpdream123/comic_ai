import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Worker } from "bullmq";
import Redis from "ioredis";

loadDotEnvFile(join(process.cwd(), ".env"));

const [
  { createDevDb, runWithDatabaseContext },
  { createStorageAdapterFromEnv },
  { createBullMQGenerationPublisher, publishGenerationDeadLetter },
  { handleGenerationFinalizeArtifactJob, handleGenerationPollAudioJob, handleGenerationPollImageJob, handleGenerationPollVideoJob, handleGenerationSubmitAudioJob, handleGenerationSubmitImageJob, handleGenerationSubmitVideoJob },
  { failGenerationTaskAfterQueueError },
  { loadGenerationQueueConfig },
  { assignGenerationQueueStage, listGenerationQueueShards, releaseGenerationQueueStage },
  { createGenerationShardWorkerRunner },
  { createGenerationProviderRouteIdentity },
  { createRedisProviderRateLimiter },
  { expireGptImagePollJob, fetchGptImageArtifactJob, finalizeGptImageArtifactJob, persistGptImageArtifactJob, processGptImagePollJob, processGptImageSubmitJob },
  { processSeedanceVideoSubmitJob, processSeedanceVideoPollJob, fetchSeedanceVideoArtifactJob, finalizeSeedanceVideoArtifactJob, persistSeedanceVideoArtifactJob, expireSeedanceVideoPollJob },
  { processAudioGenerationSubmitJob, processAudioGenerationPollJob, fetchAudioGenerationArtifactJob, finalizeAudioGenerationArtifactJob, persistAudioGenerationArtifactJob, expireAudioGenerationPollJob },
  { scheduleGenerationProviderPoll },
  { generationTimeoutMsFor },
  { recordGenerationSkippedSuccessor },
] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/storage/storage-adapter.factory.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-bullmq.publisher.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-bullmq.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-redis-repair.service.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue.config.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue-shard.store.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-shard-worker-runner.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-model-config-snapshot.ts"),
  import("../apps/backend/src/modules/model-gateway/provider-rate-limiter.ts"),
  import("../apps/backend/src/modules/model-gateway/gpt-image.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/seedance-video.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/audio-generation.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-due-poll.service.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-timeout.policy.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-stage-successor.store.ts"),
]);

const config = loadGenerationQueueConfig(process.env);
const db = await createDevDb();
const publisher = createBullMQGenerationPublisher(config);
const storageRuntime = createStorageRuntime(process.env, createStorageAdapterFromEnv(process.env));
const workerPublisher = createShardAwareWorkerPublisher({
  config,
  db,
  publisher,
  storageBucket: storageRuntime.bucket,
  assign: assignGenerationQueueStage,
});
const connection = redisConnectionFromUrl(config.redisUrl);
const rateLimitRedis = new Redis(connection);
const rateLimiter = createRedisProviderRateLimiter(rateLimitRedis, {
  keyPrefix: process.env.REDIS_KEY_PREFIX?.trim() || config.queuePrefix,
});
const workerOptions = {
  connection,
  prefix: config.queuePrefix,
};
const processors = {
  async schedulePoll({ taskId, mediaType, nextPollAttempt, delayMs, now }) {
    const scheduled = await scheduleGenerationProviderPoll(db, {
      taskId,
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
  async pollAudio({ taskId, now }) {
    return processAudioGenerationPollJob(db, {
      taskId,
      env: process.env,
      now,
    });
  },
  async expireAudio({ taskId, now }) {
    return expireAudioGenerationPollJob(db, { taskId, now });
  },
  async finalizeAudioArtifact({ taskId, now }) {
    return finalizeAudioGenerationArtifactJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async fetchAudioArtifact({ taskId, now }) {
    return fetchAudioGenerationArtifactJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async persistAudioArtifact({ taskId, now }) {
    return persistAudioGenerationArtifactJob(db, {
      taskId,
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
  async pollGptImage({ taskId, now }) {
    return processGptImagePollJob(db, {
      taskId,
      env: process.env,
      fetchImpl: undefined,
      rateLimiter,
      now,
    });
  },
  async expireGptImage({ taskId, now }) {
    return expireGptImagePollJob(db, { taskId, now });
  },
  async finalizeGptImageArtifact({ taskId, now }) {
    return finalizeGptImageArtifactJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async fetchGptImageArtifact({ taskId, now }) {
    return fetchGptImageArtifactJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async persistGptImageArtifact({ taskId, now }) {
    return persistGptImageArtifactJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async submitSeedanceVideo({ taskId, userConcurrencyLimit, now }) {
    return processSeedanceVideoSubmitJob(db, {
      taskId,
      env: process.env,
      rateLimiter,
      userConcurrencyLimit,
      now,
    });
  },
  async pollSeedanceVideo({ taskId, now }) {
    return processSeedanceVideoPollJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      rateLimiter,
      now,
    });
  },
  async expireSeedanceVideo({ taskId, now }) {
    return expireSeedanceVideoPollJob(db, {
      taskId,
      env: process.env,
      now,
    });
  },
  async finalizeSeedanceVideoArtifact({ taskId, now }) {
    return finalizeSeedanceVideoArtifactJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async fetchSeedanceVideoArtifact({ taskId, now }) {
    return fetchSeedanceVideoArtifactJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async persistSeedanceVideoArtifact({ taskId, now }) {
    return persistSeedanceVideoArtifactJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
};

console.info(
  `[generation-video] Worker started. GENERATION_SUBMIT_IMAGE_QUEUE=${config.queues.submitImage} GENERATION_SUBMIT_VIDEO_QUEUE=${config.queues.submitVideo} GENERATION_POLL_IMAGE_QUEUE=${config.queues.pollImage} GENERATION_POLL_VIDEO_QUEUE=${config.queues.pollVideo} GENERATION_POLL_AUDIO_QUEUE=${config.queues.pollAudio} GENERATION_FINALIZE_ARTIFACT_QUEUE=${config.queues.finalizeArtifact}`,
);

const submitImageWorker = new Worker(
  config.queues.submitImage,
  async (job) => runWithDatabaseContext(async () => (job.data?.mediaType === "audio"
    ? handleGenerationSubmitAudioJob({
      job,
      config,
      publisher: workerPublisher,
      processors,
      now: new Date(),
    })
    : handleGenerationSubmitImageJob({
      job,
      config,
      publisher: workerPublisher,
      processors,
      now: new Date(),
    }))),
  {
    ...workerOptions,
    concurrency: config.submit.image.concurrency,
    limiter: {
      max: config.submit.image.limiter.max,
      duration: config.submit.image.limiter.durationMs,
    },
  },
);

const submitVideoWorker = new Worker(
  config.queues.submitVideo,
  async (job) => runWithDatabaseContext(async () => handleGenerationSubmitVideoJob({
      job,
      config,
      publisher: workerPublisher,
      processors,
      now: new Date(),
    })),
  {
    ...workerOptions,
    concurrency: config.submit.video.concurrency,
    limiter: {
      max: config.submit.video.limiter.max,
      duration: config.submit.video.limiter.durationMs,
    },
  },
);

const pollImageWorker = new Worker(
  config.queues.pollImage,
  async (job) => runWithDatabaseContext(async () => handleGenerationPollImageJob({
    job,
    config,
    publisher: workerPublisher,
    processors,
    now: new Date(),
  })),
  {
    ...workerOptions,
    concurrency: config.poll.image.concurrency,
    limiter: {
      max: config.poll.image.limiter.max,
      duration: config.poll.image.limiter.durationMs,
    },
  },
);

const pollWorker = new Worker(
  config.queues.pollVideo,
  async (job) => runWithDatabaseContext(async () => handleGenerationPollVideoJob({
    job,
    config,
    publisher: workerPublisher,
    processors,
    now: new Date(),
  })),
  {
    ...workerOptions,
    concurrency: config.poll.video.concurrency,
    limiter: {
      max: config.poll.video.limiter.max,
      duration: config.poll.video.limiter.durationMs,
    },
  },
);

const pollAudioWorker = new Worker(
  config.queues.pollAudio,
  async (job) => runWithDatabaseContext(async () => handleGenerationPollAudioJob({
    job,
    config,
    publisher: workerPublisher,
    processors,
    now: new Date(),
  })),
  {
    ...workerOptions,
    concurrency: config.poll.audio.concurrency,
    limiter: {
      max: config.poll.audio.limiter.max,
      duration: config.poll.audio.limiter.durationMs,
    },
  },
);

const finalizeArtifactWorker = new Worker(
  config.queues.finalizeArtifact,
  async (job) => runWithDatabaseContext(async () => handleGenerationFinalizeArtifactJob({
      job: withDefaultStorageBucket(job, storageRuntime.bucket),
      config,
      publisher: workerPublisher,
      processors,
      finalizeRateLimiter: rateLimiter,
      now: new Date(),
    })),
  {
    ...workerOptions,
    concurrency: config.finalize.artifact.concurrency,
    limiter: {
      max: config.finalize.artifact.limiter.max,
      duration: config.finalize.artifact.limiter.durationMs,
    },
  },
);

const dynamicShardRunner = config.sharding.enabled
  ? createGenerationShardWorkerRunner({
      maxQueuesPerProcess: config.sharding.workerQueuesPerProcess,
      processIndex: Number(process.env.GENERATION_WORKER_PROCESS_INDEX ?? 0),
      processCount: Number(process.env.GENERATION_WORKER_PROCESS_COUNT ?? 1),
      defaultRateLimitMax: config.sharding.rateLimitMax,
      defaultRateLimitDurationMs: config.sharding.rateLimitDurationMs,
      discover: async () => (await listGenerationQueueShards(db)).map((shard) => ({
        queueName: shard.queueName,
        mediaType: shard.mediaType,
        stage: shard.stage,
        routeCode: shard.routeCode,
        shardNo: shard.shardNo,
        rateLimitMax: config.sharding.rateLimitMax,
        rateLimitDurationMs: config.sharding.rateLimitDurationMs,
      })),
      createWorker: (spec) => {
        const worker = new Worker(
          spec.queueName,
          async (job) => runWithDatabaseContext(async () => {
            const data = job.data?.mediaType;
            if (spec.stage === "submit") {
              return data === "video"
                ? handleGenerationSubmitVideoJob({ job, config, publisher: workerPublisher, processors, now: new Date() })
                : data === "audio"
                  ? handleGenerationSubmitAudioJob({ job, config, publisher: workerPublisher, processors, now: new Date() })
                  : handleGenerationSubmitImageJob({ job, config, publisher: workerPublisher, processors, now: new Date() });
            }
            if (spec.stage === "poll") {
              return data === "video"
                ? handleGenerationPollVideoJob({ job, config, publisher: workerPublisher, processors, now: new Date() })
                : data === "audio"
                  ? handleGenerationPollAudioJob({ job, config, publisher: workerPublisher, processors, now: new Date() })
                  : handleGenerationPollImageJob({ job, config, publisher: workerPublisher, processors, now: new Date() });
            }
            return handleGenerationFinalizeArtifactJob({
              job: withDefaultStorageBucket(job, storageRuntime.bucket),
              config,
              publisher: workerPublisher,
              processors,
              finalizeRateLimiter: rateLimiter,
              now: new Date(),
            });
          }),
          {
            ...workerOptions,
            concurrency: spec.stage === "submit"
              ? spec.mediaType === "video" ? config.submit.video.concurrency : config.submit.image.concurrency
              : spec.stage === "poll"
                ? spec.mediaType === "video" ? config.poll.video.concurrency : spec.mediaType === "audio" ? config.poll.audio.concurrency : config.poll.image.concurrency
                : config.finalize.artifact.concurrency,
            limiter: { max: spec.rateLimitMax, duration: spec.rateLimitDurationMs },
          },
        );
        worker.on("completed", (job) => { void releaseGenerationAssignment(job, "completed"); });
        worker.on("failed", (job, error) => {
          const attempts = Math.max(1, Number(job?.opts?.attempts ?? 1));
          if (Number(job?.attemptsMade ?? 0) >= attempts) {
            void releaseGenerationAssignment(job, "failed");
            const taskId = job?.data?.taskId;
            if (taskId) {
              const handling = handleExhaustedGenerationJob(spec.queueName, job, error, taskId);
              exhaustedGenerationJobs.add(handling);
              void handling.then(
                () => exhaustedGenerationJobs.delete(handling),
                () => exhaustedGenerationJobs.delete(handling),
              );
            }
          }
          if (job) console.error(`[generation-video] dynamic job failed queue=${spec.queueName} id=${job.id ?? "unknown"} ${error.message}`);
        });
        return worker;
      },
    })
  : null;

if (dynamicShardRunner) {
  await dynamicShardRunner.start();
}

const exhaustedGenerationJobs = new Set();
for (const worker of [submitImageWorker, submitVideoWorker, pollImageWorker, pollWorker, pollAudioWorker, finalizeArtifactWorker]) {
  worker.on("completed", (job) => {
    void releaseGenerationAssignment(job, "completed");
  });
  worker.on("failed", (job, error) => {
    console.error(`[generation-video] job failed queue=${worker.name} id=${job?.id ?? "unknown"} ${error.message}`);
    const taskId = job?.data?.taskId;
    const configuredAttempts = Math.max(1, Number(job?.opts?.attempts ?? 1));
    if (!taskId || Number(job.attemptsMade ?? 0) < configuredAttempts) {
      return;
    }
    void releaseGenerationAssignment(job, "failed");
    const handling = handleExhaustedGenerationJob(worker.name, job, error, taskId);
    exhaustedGenerationJobs.add(handling);
    void handling.then(
      () => exhaustedGenerationJobs.delete(handling),
      () => exhaustedGenerationJobs.delete(handling),
    );
  });
}

async function releaseGenerationAssignment(job, reason) {
  const assignmentKey = typeof job?.data?.queueAssignmentKey === "string"
    ? job.data.queueAssignmentKey.trim()
    : "";
  if (!assignmentKey) return;
  try {
    await runWithDatabaseContext(() => releaseGenerationQueueStage(db, {
      assignmentKey,
      reason,
      now: new Date(),
      reopenThreshold: config.sharding.reopenThreshold,
    }));
  } catch (error) {
    console.error(`[generation-video] failed to release shard assignment=${assignmentKey} ${error.message}`);
  }
}

function createShardAwareWorkerPublisher({ config, db, publisher, storageBucket, assign }) {
  return {
    async add(queueName, name, data, options) {
      if (!config.sharding.enabled || !isGenerationFollowupJob(name, data)) {
        return publisher.add(queueName, name, data, options);
      }
      const mediaType = data.mediaType;
      const stage = data.artifactStage === "fetch" || data.artifactStage === "persist"
        ? data.artifactStage
        : name.includes(".submit")
          ? "submit"
          : name.includes(".poll") ? "poll" : "persist";
      const taskId = String(data.taskId);
      const providerRouteIdentity = typeof data.providerRouteIdentity === "string"
        ? data.providerRouteIdentity
        : await readTaskProviderRouteIdentityForWorker(db, taskId, createGenerationProviderRouteIdentity);
      const routeKey = [
        String(data.providerExecutor || "model-gateway"),
        typeof data.modelCode === "string" ? data.modelCode : "",
        providerRouteIdentity,
        stage === "persist" ? String(data.storageBucket || storageBucket || "") : "",
      ].filter(Boolean).join(":");
      const assignmentKey = `generation.worker:${stage}:${String(options?.jobId || `${name}:${taskId}`)}`;
      const assignment = await assign(db, {
        assignmentKey,
        taskId,
        mediaType,
        stage,
        routeKey,
        now: new Date(),
        maxActiveShardsPerStage: config.sharding.maxActiveShardsPerStage,
        reopenThreshold: config.sharding.reopenThreshold,
      });
      return publisher.add(
        assignment.queueName,
        name,
        { ...data, queueAssignmentKey: assignment.assignmentKey },
        options,
      );
    },
  };
}

function isGenerationFollowupJob(name, data) {
  return typeof data?.taskId === "string"
    && ["image", "video", "audio"].includes(data.mediaType)
    && (
      name.includes(".submit")
      || name.includes(".poll")
      || name.includes(".finalize")
      || name.includes(".fetch")
      || name.includes(".persist")
    );
}

async function readTaskProviderRouteIdentityForWorker(db, taskId, createIdentity) {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return "";
  const result = await db.query("SELECT input_snapshot_json FROM tasks WHERE id = $1 LIMIT 1", [taskId]);
  const value = result.rows[0]?.input_snapshot_json;
  const snapshot = typeof value === "string" ? parseJsonRecord(value) : value;
  return snapshot ? createIdentity(snapshot) || "" : "";
}

function parseJsonRecord(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function handleExhaustedGenerationJob(queueName, job, error, taskId) {
  const failedAt = new Date();
  try {
    await publishGenerationDeadLetter({
      sourceQueueName: queueName,
      sourceJobId: String(job?.id ?? taskId),
      sourceJobName: job?.name ?? "generation.unknown",
      sourceJobData: job?.data && typeof job.data === "object" ? job.data : {},
      sourceJobOptions: job?.opts ?? {},
      failedReason: error.message,
      attemptsMade: Number(job?.attemptsMade ?? 0),
      failedAt,
    }, { config, publisher });
  } catch (deadLetterError) {
    console.error(`[generation-video] failed to write dead letter queue=${queueName} task=${taskId} ${deadLetterError.message}`);
  }

  try {
    const artifactStage = job?.data?.artifactStage;
    const artifactQueueFailure = queueName === config.queues.finalizeArtifact
      || artifactStage === "fetch"
      || artifactStage === "persist"
      || /^generation-(image|video|audio)-(fetch|persist)-/.test(queueName);
    await runWithDatabaseContext(() => failGenerationTaskAfterQueueError(db, {
      taskId,
      failureCode: artifactQueueFailure
        ? "provider_output_storage_failed"
        : "generation_queue_error",
      displayMessage: "生成队列自动重试已耗尽，任务结果仍可能存在，已保留积分并转人工核对。",
      creditOutcome: "manual_review_required",
      now: failedAt,
    }));
  } catch (settleError) {
    console.error(`[generation-video] failed to settle queue error task=${taskId} ${settleError.message}`);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdown(signal).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });
}

async function shutdown(signal) {
  console.info(`[generation-video] Received ${signal}, closing workers...`);
  await Promise.allSettled([
    submitImageWorker.close(),
    submitVideoWorker.close(),
    pollImageWorker.close(),
    pollWorker.close(),
    pollAudioWorker.close(),
    finalizeArtifactWorker.close(),
    dynamicShardRunner?.close() ?? Promise.resolve(),
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
  };
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
