export interface GenerationQueueConfig {
  redisUrl: string;
  queuePrefix: string;
  workersEnabled: boolean;
  outboxDispatcherEnabled: boolean;
  queues: {
    submitImage: string;
    submitVideo: string;
    pollVideo: string;
    finalizeArtifact: string;
    deadLetter: string;
  };
  finalize: {
    video: GenerationFinalizeQueueConfig;
    image: GenerationFinalizeQueueConfig;
  };
  submit: {
    video: GenerationWorkerQueueConfig;
  };
  artifactUpload: {
    retryAttempts: number;
    retryDelayMs: number;
  };
  outbox: {
    dispatchBatchSize: number;
    dispatchIntervalMs: number;
    retryDelayMs: number;
  };
  repair: {
    staleDispatchMs: number;
  };
  poll: {
    video: GenerationWorkerQueueConfig & {
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

export type GenerationFinalizeQueueConfig = GenerationWorkerQueueConfig;

export function loadGenerationQueueConfig(
  env: NodeJS.ProcessEnv = process.env,
): GenerationQueueConfig {
  const videoConcurrency = parsePositiveInteger(
    env.GENERATION_FINALIZE_VIDEO_CONCURRENCY,
    40,
    1_000,
  );
  const imageConcurrency = parsePositiveInteger(
    env.GENERATION_FINALIZE_IMAGE_CONCURRENCY,
    100,
    2_000,
  );
  const submitVideoConcurrency = parsePositiveInteger(
    env.GENERATION_SUBMIT_VIDEO_CONCURRENCY,
    10,
    1_000,
  );
  const pollVideoConcurrency = parsePositiveInteger(
    env.GENERATION_POLL_VIDEO_CONCURRENCY,
    videoConcurrency,
    1_000,
  );

  return {
    redisUrl: readString(env.REDIS_URL) || "redis://127.0.0.1:6379/0",
    queuePrefix: readString(env.BULLMQ_QUEUE_PREFIX) || "comic-ai-dev",
    workersEnabled: isEnabled(env.BULLMQ_WORKERS_ENABLED),
    outboxDispatcherEnabled: isEnabled(env.BULLMQ_OUTBOX_DISPATCHER_ENABLED),
    queues: {
      submitImage: readString(env.GENERATION_SUBMIT_IMAGE_QUEUE) || "generation-submit-image",
      submitVideo: readString(env.GENERATION_SUBMIT_VIDEO_QUEUE) || "generation-submit-video",
      pollVideo: readString(env.GENERATION_POLL_VIDEO_QUEUE) || "generation-poll-video",
      finalizeArtifact:
        readString(env.GENERATION_FINALIZE_ARTIFACT_QUEUE) || "generation-finalize-artifact",
      deadLetter: readString(env.GENERATION_DEAD_LETTER_QUEUE) || "generation-dead-letter",
    },
    finalize: {
      video: {
        // 视频产物体积通常最大，默认 40 并发，用于保护后端带宽、COS 写入吞吐和 Node RSS。
        concurrency: videoConcurrency,
        limiter: {
          max: parsePositiveInteger(
            env.GENERATION_FINALIZE_VIDEO_RATE_LIMIT_MAX,
            videoConcurrency,
            10_000,
          ),
          durationMs: parsePositiveInteger(
            env.GENERATION_FINALIZE_VIDEO_RATE_LIMIT_DURATION_MS,
            1000,
            3_600_000,
          ),
        },
      },
      image: {
        // 图片产物较小，默认 100 并发；生产环境应根据 COS 成功率和队列延迟逐步压测上调。
        concurrency: imageConcurrency,
        limiter: {
          max: parsePositiveInteger(
            env.GENERATION_FINALIZE_IMAGE_RATE_LIMIT_MAX,
            imageConcurrency,
            20_000,
          ),
          durationMs: parsePositiveInteger(
            env.GENERATION_FINALIZE_IMAGE_RATE_LIMIT_DURATION_MS,
            1000,
            3_600_000,
          ),
        },
      },
    },
    artifactUpload: {
      // 总尝试次数，默认 3 次；耗尽后任务失败并走积分返还。
      retryAttempts: parsePositiveInteger(
        env.GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS,
        3,
        10,
      ),
      // 每次上传失败后的等待时间，避免 COS 瞬时抖动时连续重打。
      retryDelayMs: parseNonNegativeInteger(
        env.GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS,
        1000,
        60_000,
      ),
    },
    submit: {
      video: {
        // 视频提交队列只负责向供应商创建任务，默认 10 并发，防止高峰期直接打满模型侧 QPS/RPM。
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
      },
    },
    outbox: {
      dispatchBatchSize: parsePositiveInteger(
        env.GENERATION_OUTBOX_DISPATCH_BATCH_SIZE,
        50,
        5_000,
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
    },
    repair: {
      // Redis/BullMQ 可能短暂丢失 job；queued 任务超过该时间未重新投递时，outbox worker 会补发 generation.task.created。
      staleDispatchMs: parsePositiveInteger(
        env.GENERATION_REDIS_REPAIR_STALE_DISPATCH_MS,
        120_000,
        3_600_000,
      ),
    },
    poll: {
      video: {
        // 视频轮询队列只查询供应商任务状态；它和提交队列拆开，避免大量轮询占住新任务提交能力。
        intervalMs: parsePositiveInteger(
          env.GENERATION_POLL_VIDEO_INTERVAL_MS,
          5000,
          300_000,
        ),
        maxAttempts: parsePositiveInteger(
          env.GENERATION_POLL_VIDEO_MAX_ATTEMPTS,
          120,
          10_000,
        ),
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
