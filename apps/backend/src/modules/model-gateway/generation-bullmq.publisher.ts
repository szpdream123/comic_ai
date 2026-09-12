import { Queue, type JobsOptions } from "bullmq";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import type { OutboxEventRecord } from "../shared/outbox/outbox-dispatch-repair.service.ts";
import { selectGenerationQueue, type GenerationQueueConfig } from "./generation-queue.config.ts";
import { agentGenerationQueueConfig } from "./agent-generation-queue.ts";

export interface GenerationBullMQPublisher {
  add(
    queueName: string,
    name: string,
    data: Record<string, unknown>,
    options: JobsOptions,
  ): Promise<void>;
}

export interface CloseableGenerationBullMQPublisher extends GenerationBullMQPublisher {
  close(): Promise<void>;
}

export interface GenerationBullMQJob {
  queueName: string;
  jobName:
    | "generation.task.created"
    | "generation.task.finalize_requested"
    | "generation.image.poll.repair"
    | "generation.video.poll.repair"
    | "generation.audio.poll.repair";
  jobId: string;
  data: {
    outboxEventId: string;
    taskId: string;
    attemptId?: string;
    workflowId: string;
    mediaType: "image" | "video" | "audio";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind?: "image" | "video" | "audio";
    /** Explicit artifact pipeline boundary. Legacy jobs omit this field. */
    artifactStage?: "fetch" | "persist";
    storageBucket?: string | null;
    finalizeMode?: "retry_finalize" | "retry_persist_asset";
    pollAttempt?: number;
    membershipPriority?: boolean;
    queuePriority?: number;
    priorityReason?: string;
    retrySequence?: number;
    dispatchToken?: string;
  };
  options: JobsOptions;
}

export function buildGenerationBullMQJob(
  event: OutboxEventRecord,
  config: GenerationQueueConfig,
): GenerationBullMQJob {
  config = agentGenerationQueueConfig(config, event.payload.agentExecutionScope);
  if (event.eventType === "generation.task.finalize_requested") {
    return buildGenerationFinalizeBullMQJob(event, config);
  }
  if (event.eventType === "generation.task.poll_requested") {
    return buildGenerationPollBullMQJob(event, config);
  }
  if (event.eventType !== "generation.task.created") {
    throw new Error(`unsupported_generation_event:${event.eventType}`);
  }

  const taskId = readRequiredString(event.payload.taskId, "taskId");
  const workflowId = readRequiredString(event.payload.workflowId, "workflowId");
  const mediaType = readMediaType(event.payload.mediaType);
  const queueName = selectGenerationQueue(config, "submit", taskId);
  const dispatchToken = readString(event.payload.dispatchToken) || event.id;
  const jobId = buildGenerationBullMQJobId("generation.task.created", taskId, "submit", dispatchToken);
  const queuePriority = readQueuePriority(event.payload.queuePriority);
  const attemptId = readString(event.payload.attemptId);
  const data: GenerationBullMQJob["data"] = {
    outboxEventId: event.id,
    taskId,
    workflowId,
    mediaType,
    modelCode: readString(event.payload.modelCode) || null,
    providerExecutor: readString(event.payload.providerExecutor) || "model-gateway",
    ...(attemptId ? { attemptId } : {}),
  };
  data.dispatchToken = dispatchToken;
  const retrySequence = readPositiveInteger(event.payload.retrySequence);
  if (retrySequence !== undefined) data.retrySequence = retrySequence;
  if (readBoolean(event.payload.membershipPriority) === true) {
    data.membershipPriority = true;
    if (queuePriority !== undefined) {
      data.queuePriority = queuePriority;
    }
    const priorityReason = readString(event.payload.priorityReason);
    if (priorityReason) {
      data.priorityReason = priorityReason;
    }
  }
  const options: JobsOptions = {
    jobId,
    ...retryOptions(config.retry.submit),
    removeOnComplete: {
      age: 86400,
      count: 10000,
    },
    removeOnFail: {
      age: 604800,
      count: 50000,
    },
  };
  if (queuePriority !== undefined) {
    options.priority = queuePriority;
  }

  return {
    queueName,
    jobName: "generation.task.created",
    jobId,
    data,
    options,
  };
}

function buildGenerationPollBullMQJob(
  event: OutboxEventRecord,
  config: GenerationQueueConfig,
): GenerationBullMQJob {
  const taskId = readRequiredString(event.payload.taskId, "taskId");
  const workflowId = readRequiredString(event.payload.workflowId, "workflowId");
  const mediaType = readMediaType(event.payload.mediaType);
  const pollAttempt = readPositiveInteger(event.payload.pollAttempt) ?? 1;
  const attemptId = readString(event.payload.attemptId);
  const dispatchToken = readString(event.payload.dispatchToken) || event.id;
  const jobId = buildGenerationBullMQJobId(
    `generation.${mediaType}.poll`,
    taskId,
    ...(attemptId ? [attemptId] : []),
    pollAttempt,
    dispatchToken,
  );

  return {
    queueName: selectGenerationQueue(config, "poll", taskId),
    jobName: mediaType === "image"
      ? "generation.image.poll.repair"
      : mediaType === "audio"
        ? "generation.audio.poll.repair"
        : "generation.video.poll.repair",
    jobId,
    data: {
      outboxEventId: event.id,
      taskId,
      ...(attemptId ? { attemptId } : {}),
      workflowId,
      mediaType,
      modelCode: readString(event.payload.modelCode) || null,
      providerExecutor: readString(event.payload.providerExecutor)
        || (mediaType === "image" ? "gpt-image-2" : mediaType === "audio" ? "aliyun-bailian-audio" : "seedance"),
      pollAttempt,
    },
    options: {
      jobId,
      ...retryOptions(config.retry.poll),
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    },
  };
}

function buildGenerationFinalizeBullMQJob(
  event: OutboxEventRecord,
  config: GenerationQueueConfig,
): GenerationBullMQJob {
  const taskId = readRequiredString(event.payload.taskId, "taskId");
  const workflowId = readRequiredString(event.payload.workflowId, "workflowId");
  const mediaType = readMediaType(event.payload.mediaType);
  const artifactKind = readMediaType(event.payload.artifactKind ?? event.payload.mediaType);
  const finalizeMode = readFinalizeMode(event.payload.finalizeMode);
  const artifactStage = readArtifactStage(event.payload.artifactStage);
  const attemptId = readString(event.payload.attemptId);
  const jobId = buildFinalizeJobId({
    taskId,
    attemptId: attemptId || undefined,
    finalizeMode,
    outboxEventId: event.id,
  });

  return {
    queueName: selectGenerationQueue(config, "result", taskId),
    jobName: "generation.task.finalize_requested",
    jobId,
    data: {
      outboxEventId: event.id,
      taskId,
      ...(attemptId ? { attemptId } : {}),
      workflowId,
      mediaType,
      modelCode: readString(event.payload.modelCode) || null,
      providerExecutor: readString(event.payload.providerExecutor) || "model-gateway",
      artifactKind,
      storageBucket: readString(event.payload.storageBucket) || null,
      finalizeMode,
      ...(artifactStage ? { artifactStage } : {}),
    },
    options: {
      jobId,
      ...retryOptions(config.retry.finalize),
      removeOnComplete: {
        age: 86400,
        count: 10000,
      },
      removeOnFail: {
        age: 604800,
        count: 50000,
      },
    },
  };
}

function buildFinalizeJobId(input: {
  taskId: string;
  attemptId?: string;
  finalizeMode: "retry_finalize" | "retry_persist_asset";
  outboxEventId: string;
}) {
  return buildGenerationBullMQJobId(
    "generation.task.finalize_requested",
    input.taskId,
    ...(input.attemptId ? [input.attemptId] : []),
    input.finalizeMode,
    input.outboxEventId,
  );
}

export async function publishGenerationTaskCreatedToBullMQ(
  event: OutboxEventRecord,
  input: {
    config: GenerationQueueConfig;
    publisher: GenerationBullMQPublisher;
  },
) {
  const job = buildGenerationBullMQJob(event, input.config);
  console.log(`[generation-outbox] Publishing task ${job.data.taskId} to queue ${job.queueName}, jobId: ${job.jobId}`);
  await input.publisher.add(job.queueName, job.jobName, job.data, job.options);
  console.log(`[generation-outbox] Successfully published task ${job.data.taskId} to queue ${job.queueName}`);
  return job;
}

export function buildGenerationBullMQJobId(...parts: Array<string | number>) {
  return parts.map((part) => String(part).replaceAll(":", "_")).join("__");
}

export function assertGenerationQueueName(queueName: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,199}$/.test(queueName)) {
    throw new Error(`invalid_generation_queue_name:${queueName}`);
  }
  return queueName;
}

export async function confirmGenerationBullMQJob(
  queueName: string,
  jobId: string,
  getJob: (jobId: string) => Promise<unknown>,
) {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`generation_queue_publish_unconfirmed:${queueName}:${jobId}`);
  }
  return job;
}

export async function publishGenerationBullMQJobWithConfirmation(input: {
  queueName: string;
  add: () => Promise<{ id: string }>;
  getJob: (jobId: string) => Promise<unknown>;
  retryAttempts?: number;
  retryDelayMs?: number;
}) {
  const retryAttempts = Math.max(1, Math.floor(input.retryAttempts ?? 3));
  const retryDelayMs = Math.max(0, Math.floor(input.retryDelayMs ?? 250));
  let lastError: unknown;
  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    try {
      const job = await input.add();
      await confirmGenerationBullMQJob(input.queueName, job.id, input.getJob);
      return job;
    } catch (error) {
      lastError = error;
      if (attempt < retryAttempts && retryDelayMs > 0) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }
  throw lastError;
}

export function assertGenerationQueueCapacity(
  queueName: string,
  counts: Record<string, number>,
  maxPendingJobs: number,
) {
  const pendingJobs = generationQueuePendingJobs(counts);
  if (pendingJobs >= maxPendingJobs) {
    throw new Error(`generation_queue_capacity_reached:${queueName}`);
  }
}

function generationQueuePendingJobs(counts: Record<string, number>) {
  return ["waiting", "paused", "delayed", "prioritized", "active", "waiting-children"]
    .reduce((total, status) => total + Math.max(0, Number(counts[status] ?? 0)), 0);
}

export function createBullMQGenerationPublisher(
  config: GenerationQueueConfig,
): CloseableGenerationBullMQPublisher {
  const queues = new Map<string, { queue: Queue; lastUsedAt: number }>();
  const connection = redisConnectionFromUrl(config.redisUrl);
  const queueIdleMs = 15 * 60_000;
  const reportRedisError = createRedisErrorReporter();

  function getQueue(queueName: string) {
    assertGenerationQueueName(queueName);
    const existing = queues.get(queueName);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.queue;
    }
    const queue = new Queue(queueName, {
      connection,
      prefix: config.queuePrefix,
    });
    queue.on("error", reportRedisError);
    queues.set(queueName, { queue, lastUsedAt: Date.now() });
    return queue;
  }

  async function evictIdleQueues(activeQueueName: string) {
    const cutoff = Date.now() - queueIdleMs;
    const stale = [...queues.entries()].filter(
      ([queueName, entry]) => queueName !== activeQueueName && entry.lastUsedAt < cutoff,
    );
    for (const [queueName] of stale) queues.delete(queueName);
    await Promise.allSettled(stale.map(([, entry]) => entry.queue.close()));
  }

  return {
    async add(queueName, name, data, options) {
      const candidateQueueNames = generationQueueCandidates(config, queueName);
      await publishToLeastLoadedGenerationQueue({
        candidateQueueNames,
        preferredQueueName: queueName,
        name,
        data,
        options,
        maxPendingJobs: config.queueLimits.maxPendingJobs,
        getQueue,
      });
      await evictIdleQueues(queueName);
    },
    async close() {
      await Promise.all([...queues.values()].map((entry) => entry.queue.close()));
      queues.clear();
    },
  };
}

function generationQueueCandidates(config: GenerationQueueConfig, queueName: string) {
  return Object.values(config.queueNames).find((queueNames) => queueNames.includes(queueName))
    ?? [queueName];
}

async function publishToLeastLoadedGenerationQueue(input: {
  candidateQueueNames: string[];
  preferredQueueName: string;
  name: string;
  data: Record<string, unknown>;
  options: JobsOptions;
  maxPendingJobs: number;
  getQueue(queueName: string): Queue;
}) {
  const jobId = typeof input.options.jobId === "string" ? input.options.jobId : undefined;
  const lockQueue = input.getQueue(input.candidateQueueNames[0]);
  const client = await lockQueue.client;
  const lockKey = jobId
    ? lockQueue.toKey(`generation-publish-${createHash("sha256").update(jobId).digest("hex")}`)
    : lockQueue.toKey(`generation-publish-${randomUUID()}`);
  const lockToken = randomUUID();
  if (!await acquireGenerationQueueCapacityLock(client, lockKey, lockToken)) {
    throw new Error(`generation_queue_publish_lock_unavailable:${input.preferredQueueName}`);
  }
  try {
    const candidates = input.candidateQueueNames.map((queueName, index) => ({
      queueName,
      queue: input.getQueue(queueName),
      preferred: queueName === input.preferredQueueName ? 0 : index + 1,
    }));
    if (jobId && (await Promise.all(candidates.map(({ queue }) => queue.getJob(jobId)))).some(Boolean)) {
      return;
    }
    const ranked = await Promise.all(candidates.map(async (candidate) => ({
      ...candidate,
      pendingJobs: generationQueuePendingJobs(await candidate.queue.getJobCounts(
        "waiting", "paused", "delayed", "prioritized", "active", "waiting-children",
      )),
    })));
    ranked.sort((left, right) => left.pendingJobs - right.pendingJobs || left.preferred - right.preferred);
    let capacityError: unknown;
    for (const candidate of ranked) {
      try {
        await publishWithinGenerationQueueCapacity(
          candidate.queue,
          candidate.queueName,
          input.options,
          input.maxPendingJobs,
          async () => {
            await publishGenerationBullMQJobWithConfirmation({
              queueName: candidate.queueName,
              add: () => candidate.queue.add(input.name, input.data, input.options),
              getJob: (id) => candidate.queue.getJob(id),
            });
          },
        );
        return;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("generation_queue_capacity_reached:")) {
          throw error;
        }
        capacityError = error;
      }
    }
    throw capacityError ?? new Error(`generation_queue_capacity_reached:${input.preferredQueueName}`);
  } finally {
    await releaseGenerationQueueCapacityLock(client, lockKey, lockToken);
  }
}

async function publishWithinGenerationQueueCapacity(
  queue: Queue,
  queueName: string,
  options: JobsOptions,
  maxPendingJobs: number,
  publish: () => Promise<void>,
) {
  const jobId = typeof options.jobId === "string" ? options.jobId : undefined;
  const client = await queue.client;
  const lockKey = queue.toKey("generation-capacity-lock");
  const lockToken = randomUUID();
  const acquired = await acquireGenerationQueueCapacityLock(client, lockKey, lockToken);
  if (!acquired) {
    throw new Error(`generation_queue_capacity_lock_unavailable:${queueName}`);
  }
  try {
    if (jobId && await queue.getJob(jobId)) {
      return;
    }
    assertGenerationQueueCapacity(
      queueName,
      await queue.getJobCounts("waiting", "paused", "delayed", "prioritized", "active", "waiting-children"),
      maxPendingJobs,
    );
    await publish();
  } finally {
    await releaseGenerationQueueCapacityLock(client, lockKey, lockToken);
  }
}

async function acquireGenerationQueueCapacityLock(
  client: Awaited<Queue["client"]>,
  lockKey: string,
  lockToken: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const acquired = await client.set(lockKey, lockToken, "PX", 60_000, "NX");
    if (acquired === "OK") return true;
    await sleep(25 * (attempt + 1));
  }
  return false;
}

async function releaseGenerationQueueCapacityLock(
  client: Awaited<Queue["client"]>,
  lockKey: string,
  lockToken: string,
) {
  await client.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
    1,
    lockKey,
    lockToken,
  );
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
    keepAlive: 30_000,
    connectTimeout: 3_000,
    commandTimeout: 10_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt: number) => Math.min(attempt * 100, 1_000),
  };
}

function createRedisErrorReporter() {
  const reported = new Set<string>();
  return (error: unknown) => {
    const code = typeof (error as { code?: unknown })?.code === "string"
      ? (error as { code: string }).code
      : "REDIS_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    const connectivityError = [
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "NR_CLOSED",
    ].includes(code);
    const key = `${code}:${message}`;
    if (connectivityError && reported.has(key)) return;
    if (connectivityError) reported.add(key);
    console.error(
      `[generation-publisher] Redis connection error ${code}: ${message}${connectivityError ? " (duplicate errors suppressed)" : ""}`,
    );
  };
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = readString(value);
  if (!text) {
    throw new Error(`generation_outbox_missing_${fieldName}`);
  }
  return text;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readBoolean(value: unknown) {
  return value === true;
}

function readQueuePriority(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return undefined;
  }
  return numberValue;
}

function readMediaType(value: unknown): "image" | "video" | "audio" {
  const text = readString(value);
  if (text === "image" || text === "video" || text === "audio") {
    return text;
  }
  throw new Error("generation_outbox_invalid_mediaType");
}

function readFinalizeMode(value: unknown): "retry_finalize" | "retry_persist_asset" {
  const text = readString(value);
  if (text === "retry_persist_asset") {
    return "retry_persist_asset";
  }
  return "retry_finalize";
}

function readArtifactStage(value: unknown): "fetch" | "persist" | undefined {
  const text = readString(value);
  return text === "fetch" || text === "persist" ? text : undefined;
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function retryOptions(config: { attempts: number; backoffMs: number }): JobsOptions {
  return {
    attempts: config.attempts,
    backoff: {
      type: "exponential",
      delay: config.backoffMs,
    },
  };
}
