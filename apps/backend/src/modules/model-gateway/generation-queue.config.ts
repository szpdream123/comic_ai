import {
  generationPollIntervalMs,
  generationPollMaxAttempts,
  generationPollMaxAttemptsForEnv,
} from "./generation-timeout.policy.ts";

export interface GenerationQueueConfig {
  redisUrl: string;
  queuePrefix: string;
  workersEnabled: boolean;
  outboxDispatcherEnabled: boolean;
  queues: {
    submitImage: string;
    submitVideo: string;
    pollImage: string;
    pollVideo: string;
    pollAudio: string;
    finalizeArtifact: string;
    deadLetter: string;
  };
  finalize: {
    artifact: GenerationFinalizeQueueConfig;
  };
  submit: {
    image: GenerationSubmitQueueConfig;
    video: GenerationSubmitQueueConfig;
  };
  artifactUpload: {
    retryAttempts: number;
    retryDelayMs: number;
  };
  outbox: {
    dispatchBatchSize: number;
    dispatchIntervalMs: number;
    retryDelayMs: number;
    membershipQuantum: number;
  };
  sharding: {
    enabled: boolean;
    capacity: number;
    rateLimitMax: number;
    rateLimitDurationMs: number;
    reopenThreshold: number;
    maxActiveShardsPerStage: number;
    workerQueuesPerProcess: number;
    publishConcurrency: number;
  };
  repair: {
    staleDispatchMs: number;
  };
  health: {
    waitingCountThreshold: number;
    failedCountThreshold: number;
    oldestJobAgeMs: number;
  };
  retry: {
    submit: GenerationQueueRetryConfig;
    poll: GenerationQueueRetryConfig;
    finalize: GenerationQueueRetryConfig;
  };
  poll: {
    image: GenerationWorkerQueueConfig & {
      intervalMs: number;
      maxAttempts: number;
    };
    video: GenerationWorkerQueueConfig & {
      intervalMs: number;
      maxAttempts: number;
    };
    audio: GenerationWorkerQueueConfig & {
      intervalMs: number;
      maxAttempts: number;
    };
  };
}

export interface GenerationWorkerQueueConfig {
  concurrency: number;
  limiter: {
    max: number;
    durationMs: number;
  };
}

export interface GenerationSubmitQueueConfig extends GenerationWorkerQueueConfig {
  userConcurrencyLimit: number;
}

export interface GenerationQueueRetryConfig {
  attempts: number;
  backoffMs: number;
}

export type GenerationFinalizeQueueConfig = GenerationWorkerQueueConfig;

export function loadGenerationQueueConfig(
  env: NodeJS.ProcessEnv = process.env,
): GenerationQueueConfig {
  const artifactFinalizeConcurrency = parsePositiveInteger(
    env.GENERATION_FINALIZE_ARTIFACT_CONCURRENCY,
    40,
    1_000,
  );
  const submitVideoUserConcurrencyLimit = parsePositiveInteger(
    env.GENERATION_SUBMIT_VIDEO_USER_CONCURRENCY_LIMIT,
    10,
    1_000,
  );
  const submitImageUserConcurrencyLimit = parsePositiveInteger(
    env.GENERATION_SUBMIT_IMAGE_USER_CONCURRENCY_LIMIT,
    20,
    1_000,
  );
  const submitImageConcurrency = parsePositiveInteger(
    env.GENERATION_SUBMIT_IMAGE_CONCURRENCY,
    20,
    1_000,
  );
  const submitVideoConcurrency = parsePositiveInteger(
    env.GENERATION_SUBMIT_VIDEO_CONCURRENCY,
    10,
    1_000,
  );
  const pollVideoConcurrency = parsePositiveInteger(
    env.GENERATION_POLL_VIDEO_CONCURRENCY,
    artifactFinalizeConcurrency,
    1_000,
  );
  const pollImageConcurrency = parsePositiveInteger(
    env.GENERATION_POLL_IMAGE_CONCURRENCY,
    artifactFinalizeConcurrency,
    1_000,
  );
  const pollAudioConcurrency = parsePositiveInteger(
    env.GENERATION_POLL_AUDIO_CONCURRENCY,
    artifactFinalizeConcurrency,
    1_000,
  );
  const shardCapacity = parsePositiveInteger(
    env.GENERATION_QUEUE_SHARD_CAPACITY,
    600,
    100_000,
  );
  const shardReopenThreshold = Math.min(
    parsePositiveInteger(
      env.GENERATION_QUEUE_SHARD_REOPEN_THRESHOLD,
      300,
      99_999,
    ),
    Math.max(0, shardCapacity - 1),
  );
  return {
    redisUrl: readString(env.REDIS_URL) || "redis://127.0.0.1:6379/0",
    queuePrefix: readString(env.BULLMQ_QUEUE_PREFIX) || "comic-ai-dev",
    workersEnabled: isEnabled(env.BULLMQ_WORKERS_ENABLED),
    outboxDispatcherEnabled: isEnabled(env.BULLMQ_OUTBOX_DISPATCHER_ENABLED),
    queues: {
      submitImage: readString(env.GENERATION_SUBMIT_IMAGE_QUEUE) || "generation-submit-image",
      submitVideo: readString(env.GENERATION_SUBMIT_VIDEO_QUEUE) || "generation-submit-video",
      pollImage: readString(env.GENERATION_POLL_IMAGE_QUEUE) || "generation-poll-image",
      pollVideo: readString(env.GENERATION_POLL_VIDEO_QUEUE) || "generation-poll-video",
      pollAudio: readString(env.GENERATION_POLL_AUDIO_QUEUE) || "generation-poll-audio",
      finalizeArtifact:
        readString(env.GENERATION_FINALIZE_ARTIFACT_QUEUE) || "generation-finalize-artifact",
      deadLetter: readString(env.GENERATION_DEAD_LETTER_QUEUE) || "generation-dead-letter",
    },
    finalize: {
      artifact: {
        // 视频产物体积通常最大，默认 40 并发，用于保护后端带宽、COS 写入吞吐和 Node RSS。
        concurrency: artifactFinalizeConcurrency,
        limiter: {
          max: parsePositiveInteger(
            env.GENERATION_FINALIZE_ARTIFACT_RATE_LIMIT_MAX,
            artifactFinalizeConcurrency,
            10_000,
          ),
          durationMs: parsePositiveInteger(
            env.GENERATION_FINALIZE_ARTIFACT_RATE_LIMIT_DURATION_MS,
            1000,
            3_600_000,
          ),
        },
      },
    },
    artifactUpload: {
      // 总尝试次数，默认 10 次；耗尽后任务失败并走积分返还。
      retryAttempts: parsePositiveInteger(
        env.GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS,
        10,
        10,
      ),
      // 每次上传失败后的等待时间，避免 COS 瞬时抖动时连续重打。
      retryDelayMs: parseNonNegativeInteger(
        env.GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS,
        3000,
        60_000,
      ),
    },
    submit: {
      image: {
        concurrency: submitImageConcurrency,
        limiter: {
          max: parsePositiveInteger(
            env.GENERATION_SUBMIT_IMAGE_RATE_LIMIT_MAX,
            submitImageConcurrency,
            10_000,
          ),
          durationMs: parsePositiveInteger(
            env.GENERATION_SUBMIT_IMAGE_RATE_LIMIT_DURATION_MS,
            1000,
            3_600_000,
          ),
        },
        userConcurrencyLimit: submitImageUserConcurrencyLimit,
      },
      video: {
        concurrency: submitVideoConcurrency,
        limiter: {
          max: parsePositiveInteger(
            env.GENERATION_SUBMIT_VIDEO_RATE_LIMIT_MAX,
            submitVideoConcurrency,
            10_000,
          ),
          durationMs: parsePositiveInteger(
            env.GENERATION_SUBMIT_VIDEO_RATE_LIMIT_DURATION_MS,
            1000,
            3_600_000,
          ),
        },
        userConcurrencyLimit: submitVideoUserConcurrencyLimit,
      },
    },
    outbox: {
      dispatchBatchSize: parsePositiveInteger(
        env.GENERATION_OUTBOX_DISPATCH_BATCH_SIZE,
        20_000,
        100_000,
      ),
      dispatchIntervalMs: parsePositiveInteger(
        env.GENERATION_OUTBOX_DISPATCH_INTERVAL_MS,
        1000,
        60_000,
      ),
      retryDelayMs: parsePositiveInteger(
        env.GENERATION_OUTBOX_RETRY_DELAY_MS,
        30_000,
        3_600_000,
      ),
      membershipQuantum: parsePositiveInteger(
        env.GENERATION_OUTBOX_MEMBERSHIP_QUANTUM,
        2,
        10,
      ),
    },
    sharding: {
      enabled: isEnabled(env.GENERATION_QUEUE_SHARDING_ENABLED),
      capacity: shardCapacity,
      rateLimitMax: parsePositiveInteger(
        env.GENERATION_QUEUE_SHARD_RATE_LIMIT_MAX,
        5,
        10_000,
      ),
      rateLimitDurationMs: parsePositiveInteger(
        env.GENERATION_QUEUE_SHARD_RATE_LIMIT_DURATION_MS,
        1_000,
        3_600_000,
      ),
      reopenThreshold: shardReopenThreshold,
      maxActiveShardsPerStage: parsePositiveInteger(
        env.GENERATION_MAX_ACTIVE_SHARDS_PER_STAGE,
        256,
        10_000,
      ),
      workerQueuesPerProcess: parsePositiveInteger(
        env.GENERATION_WORKER_QUEUES_PER_PROCESS,
        16,
        1_000,
      ),
      publishConcurrency: parsePositiveInteger(
        env.GENERATION_DISPATCH_PUBLISH_CONCURRENCY,
        32,
        1_000,
      ),
    },
    repair: {
      // Redis/BullMQ 可能短暂丢失 job；queued 任务超过该时间未重新投递时，maintenance worker 会补发 generation.task.created。
      staleDispatchMs: parsePositiveInteger(
        env.GENERATION_REDIS_REPAIR_STALE_DISPATCH_MS,
        120_000,
        3_600_000,
      ),
    },
    health: {
      waitingCountThreshold: parsePositiveInteger(
        env.GENERATION_QUEUE_HEALTH_WAITING_COUNT_THRESHOLD,
        1_000,
        1_000_000,
      ),
      failedCountThreshold: parsePositiveInteger(
        env.GENERATION_QUEUE_HEALTH_FAILED_COUNT_THRESHOLD,
        100,
        1_000_000,
      ),
      oldestJobAgeMs: parsePositiveInteger(
        env.GENERATION_QUEUE_HEALTH_OLDEST_JOB_AGE_MS,
        5 * 60 * 1000,
        7 * 24 * 60 * 60 * 1000,
      ),
    },
    retry: {
      submit: { attempts: 3, backoffMs: 5_000 },
      poll: {
        attempts: parsePositiveInteger(env.GENERATION_POLL_RETRY_ATTEMPTS, 20, 100),
        backoffMs: parsePositiveInteger(
          env.GENERATION_POLL_RETRY_BACKOFF_MS,
          30_000,
          3_600_000,
        ),
      },
      finalize: { attempts: 3, backoffMs: 5_000 },
    },
    poll: {
      image: {
        intervalMs: generationPollIntervalMs,
        maxAttempts: generationPollMaxAttemptsForEnv("image", env),
        concurrency: pollImageConcurrency,
        limiter: {
          max: parsePositiveInteger(
            env.GENERATION_POLL_IMAGE_RATE_LIMIT_MAX,
            pollImageConcurrency,
            10_000,
          ),
          durationMs: parsePositiveInteger(
            env.GENERATION_POLL_IMAGE_RATE_LIMIT_DURATION_MS,
            1000,
            3_600_000,
          ),
        },
      },
      video: {
        // 视频轮询队列只查询供应商任务状态；它和提交队列拆开，避免大量轮询占住新任务提交能力。
        intervalMs: generationPollIntervalMs,
        maxAttempts: generationPollMaxAttempts("video"),
        concurrency: pollVideoConcurrency,
        limiter: {
          max: parsePositiveInteger(
            env.GENERATION_POLL_VIDEO_RATE_LIMIT_MAX,
            pollVideoConcurrency,
            10_000,
          ),
          durationMs: parsePositiveInteger(
            env.GENERATION_POLL_VIDEO_RATE_LIMIT_DURATION_MS,
            1000,
            3_600_000,
          ),
        },
      },
      audio: {
        intervalMs: generationPollIntervalMs,
        maxAttempts: generationPollMaxAttempts("audio"),
        concurrency: pollAudioConcurrency,
        limiter: {
          max: parsePositiveInteger(
            env.GENERATION_POLL_AUDIO_RATE_LIMIT_MAX,
            pollAudioConcurrency,
            10_000,
          ),
          durationMs: parsePositiveInteger(
            env.GENERATION_POLL_AUDIO_RATE_LIMIT_DURATION_MS,
            1000,
            3_600_000,
          ),
        },
      },
    },
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isEnabled(value: unknown) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}
