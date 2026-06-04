import { Queue } from "bullmq";
import Redis from "ioredis";

import type { GenerationQueueConfig } from "./generation-queue.config.ts";

type QueueHealthStatus = "healthy" | "degraded" | "unavailable";

interface GenerationQueueCounts {
  waiting: number;
  delayed: number;
  active: number;
  completed: number;
  failed: number;
  paused: number;
}

interface GenerationQueueFailedJob {
  id: string | number | null;
  name: string;
  data: Record<string, unknown>;
  failureReason: string | null;
  attemptsMade: number;
  timestamp: string | null;
  processedAt: string | null;
  finishedAt: string | null;
}

interface GenerationQueueSnapshot {
  role: string;
  name: string;
  status: QueueHealthStatus;
  counts: GenerationQueueCounts;
  failedJobs: GenerationQueueFailedJob[];
  error: string | null;
}

export interface GenerationQueueHealthSnapshot {
  status: QueueHealthStatus;
  inspectedAt: string;
  redis: {
    status: "healthy" | "unavailable";
    ping: string | null;
    error: string | null;
  };
  queuePrefix: string;
  workersEnabled: boolean;
  outboxDispatcherEnabled: boolean;
  queues: GenerationQueueSnapshot[];
}

interface RedisHealthClient {
  ping(): Promise<string>;
}

interface QueueHealthClient {
  name: string;
  getJobCounts(...statuses: string[]): Promise<Record<string, number>>;
  getJobs(
    types: string[],
    start: number,
    end: number,
    asc: boolean,
  ): Promise<QueueHealthJob[]>;
  close(): Promise<void>;
}

interface QueueHealthJob {
  id?: string | number | null;
  name?: string;
  data?: Record<string, unknown>;
  failedReason?: string | null;
  attemptsMade?: number;
  timestamp?: number;
  processedOn?: number;
  finishedOn?: number;
}

interface GenerationQueueHealthServiceDeps {
  config: GenerationQueueConfig;
  redis: RedisHealthClient;
  queueFactory(queueName: string): QueueHealthClient;
}

export function createGenerationQueueHealthService(
  deps: GenerationQueueHealthServiceDeps,
) {
  return {
    async inspect(input: { failedSampleSize?: number } = {}): Promise<GenerationQueueHealthSnapshot> {
      const inspectedAt = new Date().toISOString();
      const failedSampleSize = Math.max(0, Math.floor(input.failedSampleSize ?? 5));
      const redis = await inspectRedis(deps.redis);
      if (redis.status === "unavailable") {
        return {
          status: "unavailable",
          inspectedAt,
          redis,
          queuePrefix: deps.config.queuePrefix,
          workersEnabled: deps.config.workersEnabled,
          outboxDispatcherEnabled: deps.config.outboxDispatcherEnabled,
          queues: [],
        };
      }

      const queues = await Promise.all(
        configuredQueueTargets(deps.config).map((target) =>
          inspectQueue({
            target,
            queue: deps.queueFactory(target.name),
            failedSampleSize,
          }),
        ),
      );
      const degraded = queues.some((queue) => queue.status !== "healthy");

      return {
        status: degraded ? "degraded" : "healthy",
        inspectedAt,
        redis,
        queuePrefix: deps.config.queuePrefix,
        workersEnabled: deps.config.workersEnabled,
        outboxDispatcherEnabled: deps.config.outboxDispatcherEnabled,
        queues,
      };
    },
  };
}

export function createBullMQGenerationQueueHealthService(config: GenerationQueueConfig) {
  const redis = new Redis(redisHealthConnectionFromUrl(config.redisUrl));
  redis.on("error", () => undefined);

  return {
    ...createGenerationQueueHealthService({
      config,
      redis,
      queueFactory: (queueName) =>
        new Queue(queueName, {
          connection: redisHealthConnectionFromUrl(config.redisUrl),
          prefix: config.queuePrefix,
        }) as QueueHealthClient,
    }),
    async close() {
      redis.disconnect();
    },
  };
}

async function inspectRedis(redis: RedisHealthClient): Promise<GenerationQueueHealthSnapshot["redis"]> {
  try {
    const ping = await redis.ping();
    return {
      status: "healthy",
      ping,
      error: null,
    };
  } catch (error) {
    return {
      status: "unavailable",
      ping: null,
      error: errorMessage(error),
    };
  }
}

async function inspectQueue(input: {
  target: { role: string; name: string };
  queue: QueueHealthClient;
  failedSampleSize: number;
}): Promise<GenerationQueueSnapshot> {
  try {
    const counts = normalizeCounts(
      await input.queue.getJobCounts(
        "waiting",
        "delayed",
        "active",
        "completed",
        "failed",
        "paused",
      ),
    );
    const failedJobs =
      counts.failed > 0 && input.failedSampleSize > 0
        ? (
            await input.queue.getJobs(
              ["failed"],
              0,
              input.failedSampleSize - 1,
              false,
            )
          ).map(failedJobView)
        : [];

    return {
      role: input.target.role,
      name: input.target.name,
      status: "healthy",
      counts,
      failedJobs,
      error: null,
    };
  } catch (error) {
    return {
      role: input.target.role,
      name: input.target.name,
      status: "unavailable",
      counts: emptyCounts(),
      failedJobs: [],
      error: errorMessage(error),
    };
  } finally {
    await input.queue.close();
  }
}

function configuredQueueTargets(config: GenerationQueueConfig) {
  return [
    { role: "submit_image", name: config.queues.submitImage },
    { role: "submit_video", name: config.queues.submitVideo },
    { role: "poll_video", name: config.queues.pollVideo },
    { role: "finalize_artifact", name: config.queues.finalizeArtifact },
    { role: "dead_letter", name: config.queues.deadLetter },
  ];
}

function normalizeCounts(counts: Record<string, number>): GenerationQueueCounts {
  return {
    waiting: numberOrZero(counts.waiting),
    delayed: numberOrZero(counts.delayed),
    active: numberOrZero(counts.active),
    completed: numberOrZero(counts.completed),
    failed: numberOrZero(counts.failed),
    paused: numberOrZero(counts.paused),
  };
}

function emptyCounts(): GenerationQueueCounts {
  return {
    waiting: 0,
    delayed: 0,
    active: 0,
    completed: 0,
    failed: 0,
    paused: 0,
  };
}

function failedJobView(job: QueueHealthJob): GenerationQueueFailedJob {
  return {
    id: job.id ?? null,
    name: job.name ?? "",
    data: job.data && typeof job.data === "object" ? job.data : {},
    failureReason: job.failedReason ?? null,
    attemptsMade: numberOrZero(job.attemptsMade),
    timestamp: timestampOrNull(job.timestamp),
    processedAt: timestampOrNull(job.processedOn),
    finishedAt: timestampOrNull(job.finishedOn),
  };
}

function timestampOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function redisConnectionFromUrl(redisUrl: string) {
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

function redisHealthConnectionFromUrl(redisUrl: string) {
  return {
    ...redisConnectionFromUrl(redisUrl),
    connectTimeout: 500,
    commandTimeout: 500,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    retryStrategy: null,
  };
}
