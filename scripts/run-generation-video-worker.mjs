import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Worker } from "bullmq";
import Redis from "ioredis";

loadDotEnvFile(join(process.cwd(), ".env"));

const [
  { createDevDb },
  { createStorageAdapterFromEnv },
  { createBullMQGenerationPublisher },
  { handleGenerationFinalizeArtifactJob, handleGenerationSubmitImageJob, handleGenerationSubmitVideoJob, handleGenerationPollVideoJob },
  { loadGenerationQueueConfig },
  { createRedisProviderRateLimiter },
  { finalizeGptImageArtifactJob, persistGptImageArtifactJob, processGptImageSubmitJob },
  { processSeedanceVideoSubmitJob, processSeedanceVideoPollJob, finalizeSeedanceVideoArtifactJob, persistSeedanceVideoArtifactJob, expireSeedanceVideoPollJob },
] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/storage/storage-adapter.factory.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-bullmq.publisher.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-bullmq.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-queue.config.ts"),
  import("../apps/backend/src/modules/model-gateway/provider-rate-limiter.ts"),
  import("../apps/backend/src/modules/model-gateway/gpt-image.worker.ts"),
  import("../apps/backend/src/modules/model-gateway/seedance-video.worker.ts"),
]);

const config = loadGenerationQueueConfig(process.env);
const db = await createDevDb();
const publisher = createBullMQGenerationPublisher(config);
const storageRuntime = createStorageRuntime(process.env, createStorageAdapterFromEnv(process.env));
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
  async submitGptImage({ taskId, now }) {
    return processGptImageSubmitJob(db, {
      taskId,
      runtime: storageRuntime,
      env: process.env,
      now,
    });
  },
  async finalizeGptImageArtifact({ taskId, now }) {
    return finalizeGptImageArtifactJob(db, {
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
  async submitSeedanceVideo({ taskId, now }) {
    return processSeedanceVideoSubmitJob(db, {
      taskId,
      env: process.env,
      rateLimiter,
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
  `[generation-video] Worker started. GENERATION_SUBMIT_IMAGE_QUEUE=${config.queues.submitImage} GENERATION_SUBMIT_VIDEO_QUEUE=${config.queues.submitVideo} GENERATION_POLL_VIDEO_QUEUE=${config.queues.pollVideo} GENERATION_FINALIZE_ARTIFACT_QUEUE=${config.queues.finalizeArtifact}`,
);

const submitImageWorker = new Worker(
  config.queues.submitImage,
  async (job) => handleGenerationSubmitImageJob({
    job,
    config,
    publisher,
    processors,
    now: new Date(),
  }),
  {
    ...workerOptions,
    concurrency: config.finalize.image.concurrency,
    limiter: {
      max: config.finalize.image.limiter.max,
      duration: config.finalize.image.limiter.durationMs,
    },
  },
);

const submitVideoWorker = new Worker(
  config.queues.submitVideo,
  async (job) => handleGenerationSubmitVideoJob({
    job,
    config,
    publisher,
    processors,
    now: new Date(),
  }),
  {
    ...workerOptions,
    concurrency: config.submit.video.concurrency,
    limiter: {
      max: config.submit.video.limiter.max,
      duration: config.submit.video.limiter.durationMs,
    },
  },
);

const pollWorker = new Worker(
  config.queues.pollVideo,
  async (job) => handleGenerationPollVideoJob({
    job,
    config,
    publisher,
    processors,
    now: new Date(),
  }),
  {
    ...workerOptions,
    concurrency: config.poll.video.concurrency,
    limiter: {
      max: config.poll.video.limiter.max,
      duration: config.poll.video.limiter.durationMs,
    },
  },
);

const finalizeArtifactWorker = new Worker(
  config.queues.finalizeArtifact,
  async (job) => handleGenerationFinalizeArtifactJob({
    job: withDefaultStorageBucket(job, storageRuntime.bucket),
    config,
    publisher,
    processors,
    finalizeRateLimiter: rateLimiter,
    now: new Date(),
  }),
  {
    ...workerOptions,
    concurrency: config.finalize.video.concurrency,
    limiter: {
      max: config.finalize.video.limiter.max,
      duration: config.finalize.video.limiter.durationMs,
    },
  },
);

for (const worker of [submitImageWorker, submitVideoWorker, pollWorker, finalizeArtifactWorker]) {
  worker.on("failed", (job, error) => {
    console.error(`[generation-video] job failed queue=${worker.name} id=${job?.id ?? "unknown"} ${error.message}`);
  });
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
    pollWorker.close(),
    finalizeArtifactWorker.close(),
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
