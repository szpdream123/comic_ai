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
  /** Optional shard-directory reader. When present, its queue names are inspected in addition to the DLQ. */
  queueDiscovery?: () => Promise<Array<{ role: string; name: string }>>;
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
        (await resolveQueueTargets(deps)).map((target) =>
          inspectQueue({
            target,
            queue: deps.queueFactory(target.name),
            failedSampleSize,
            now: new Date(inspectedAt),
            health: deps.config.health,
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

export function createBullMQGenerationQueueHealthService(
  config: GenerationQueueConfig,
  queueDiscovery?: () => Promise<Array<{ role: string; name: string }>>,
) {
  const redis = new Redis(redisHealthConnectionFromUrl(config.redisUrl));
  redis.on("error", () => undefined);

  return {
    ...createGenerationQueueHealthService({
      config,
      redis,
      queueDiscovery,
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
  now: Date;
  health: GenerationQueueConfig["health"];
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
    const sampleTypes = input.target.role === "dead_letter"
      ? ["waiting", "delayed", "failed"]
      : ["failed"];
    const sampleCount = input.target.role === "dead_letter"
      ? counts.waiting + counts.delayed + counts.failed
      : counts.failed;
    const failedJobs =
      sampleCount > 0 && input.failedSampleSize > 0
        ? (
            await input.queue.getJobs(
              sampleTypes,
              0,
              input.failedSampleSize - 1,
              false,
            )
          ).map(failedJobView)
        : [];
    const pendingCount = counts.waiting + counts.delayed;
    const oldestPending = pendingCount > 0
      ? (await input.queue.getJobs(["waiting", "delayed"], 0, 0, true))[0]
      : undefined;
    const oldestPendingAgeMs = typeof oldestPending?.timestamp === "number"
      ? Math.max(0, input.now.getTime() - oldestPending.timestamp)
      : 0;
    const degradationReasons = [
      pendingCount >= input.health.waitingCountThreshold
        ? `waiting_count:${pendingCount}`
        : null,
      counts.failed >= input.health.failedCountThreshold
        ? `failed_count:${counts.failed}`
        : null,
      oldestPendingAgeMs >= input.health.oldestJobAgeMs
        ? `oldest_pending_age_ms:${oldestPendingAgeMs}`
        : null,
      input.target.role === "dead_letter" && sampleCount > 0
        ? `dead_letter_count:${sampleCount}`
        : null,
    ].filter((reason): reason is string => Boolean(reason));

    return {
      role: input.target.role,
      name: input.target.name,
      status: degradationReasons.length ? "degraded" : "healthy",
      counts,
      failedJobs,
      error: degradationReasons.length ? degradationReasons.join(",") : null,
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

async function resolveQueueTargets(deps: GenerationQueueHealthServiceDeps) {
  if (deps.queueDiscovery) {
    try {
      const discovered = await deps.queueDiscovery();
      const targets = discovered
        .filter((target) => target && typeof target.name === "string" && target.name.trim())
        .map((target) => ({ role: target.role?.trim() || "generation_shard", name: target.name.trim() }));
      const deadLetter = { role: "dead_letter", name: deps.config.queues.deadLetter };
      const unique = new Map<string, { role: string; name: string }>();
      for (const target of [...targets, deadLetter]) unique.set(target.name, target);
      return [...unique.values()];
    } catch {
      // A transient directory read must not make the health endpoint fail; retain
      // visibility of the configured queues until the next refresh succeeds.
    }
  }
  return configuredQueueTargets(deps.config);
}

function configuredQueueTargets(config: GenerationQueueConfig) {
  return [
    { role: "submit_image", name: config.queues.submitImage },
    { role: "submit_video", name: config.queues.submitVideo },
    { role: "poll_image", name: config.queues.pollImage },
    { role: "poll_video", name: config.queues.pollVideo },
    { role: "poll_audio", name: config.queues.pollAudio },
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
    failureReason: job.failedReason ?? readString(job.data?.failedReason) ?? null,
    attemptsMade: numberOrZero(job.attemptsMade),
    timestamp: timestampOrNull(job.timestamp),
    processedAt: timestampOrNull(job.processedOn),
    finishedAt: timestampOrNull(job.finishedOn),
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
