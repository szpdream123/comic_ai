import { Queue, type JobsOptions } from "bullmq";

import type { OutboxEventRecord } from "../shared/outbox/outbox-dispatch-repair.service.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";

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
    queueAssignmentKey?: string;
    retrySequence?: number;
    dispatchToken?: string;
  };
  options: JobsOptions;
}

export interface GenerationDeadLetterInput {
  sourceQueueName: string;
  sourceJobId: string;
  sourceJobName: string;
  sourceJobData: Record<string, unknown>;
  sourceJobOptions: JobsOptions;
  failedReason: string;
  attemptsMade: number;
  failedAt: Date;
}

export function buildGenerationBullMQJob(
  event: OutboxEventRecord,
  config: GenerationQueueConfig,
): GenerationBullMQJob {
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
  const queueName =
    readString(event.payload.queueName) ||
    (mediaType === "video" ? config.queues.submitVideo : config.queues.submitImage);
  const dispatchToken = readString(event.payload.dispatchToken);
  const jobId = dispatchToken
    ? buildGenerationBullMQJobId("generation.task.created", taskId, "submit", dispatchToken)
    : buildGenerationBullMQJobId("generation.task.created", taskId, "submit");
  const queuePriority = readQueuePriority(event.payload.queuePriority);
  const data: GenerationBullMQJob["data"] = {
    outboxEventId: event.id,
    taskId,
    workflowId,
    mediaType,
    modelCode: readString(event.payload.modelCode) || null,
    providerExecutor: readString(event.payload.providerExecutor) || "model-gateway",
  };
  const queueAssignmentKey = readString(event.payload.queueAssignmentKey);
  if (queueAssignmentKey) data.queueAssignmentKey = queueAssignmentKey;
  if (dispatchToken) data.dispatchToken = dispatchToken;
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
  const jobId = buildGenerationBullMQJobId(
    `generation.${mediaType}.poll`,
    taskId,
    pollAttempt,
  );

  return {
    queueName: mediaType === "image"
      ? config.queues.pollImage
      : mediaType === "audio"
        ? config.queues.pollAudio
        : config.queues.pollVideo,
    jobName: mediaType === "image"
      ? "generation.image.poll.repair"
      : mediaType === "audio"
        ? "generation.audio.poll.repair"
        : "generation.video.poll.repair",
    jobId,
    data: {
      outboxEventId: event.id,
      taskId,
      workflowId,
      mediaType,
      modelCode: readString(event.payload.modelCode) || null,
      providerExecutor: readString(event.payload.providerExecutor)
        || (mediaType === "image" ? "gpt-image-2" : mediaType === "audio" ? "aliyun-bailian-audio" : "seedance"),
      pollAttempt,
      ...(readString(event.payload.queueAssignmentKey)
        ? { queueAssignmentKey: readString(event.payload.queueAssignmentKey) }
        : {}),
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
  const jobId = buildFinalizeJobId({
    taskId,
    finalizeMode,
    outboxEventId: event.id,
  });

  return {
    // The dispatcher may route finalize work to a dynamic fetch/persist shard.
    // Legacy finalize events carry the original submit queueName, so only
    // accept an explicit artifact queue or a generated artifact shard name.
    queueName: resolveFinalizeQueueName(event.payload, config.queues.finalizeArtifact),
    jobName: "generation.task.finalize_requested",
    jobId,
    data: {
      outboxEventId: event.id,
      taskId,
      workflowId,
      mediaType,
      modelCode: readString(event.payload.modelCode) || null,
      providerExecutor: readString(event.payload.providerExecutor) || "model-gateway",
      artifactKind,
      storageBucket: readString(event.payload.storageBucket) || null,
      finalizeMode,
      ...(artifactStage ? { artifactStage } : {}),
      ...(readString(event.payload.queueAssignmentKey)
        ? { queueAssignmentKey: readString(event.payload.queueAssignmentKey) }
        : {}),
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
  finalizeMode: "retry_finalize" | "retry_persist_asset";
  outboxEventId: string;
}) {
  if (input.finalizeMode === "retry_finalize") {
    return buildGenerationBullMQJobId(
      "generation.task.finalize_requested",
      input.taskId,
      input.finalizeMode,
      input.outboxEventId,
    );
  }
  return buildGenerationBullMQJobId(
    "generation.task.finalize_requested",
    input.taskId,
    input.finalizeMode,
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
  await input.publisher.add(job.queueName, job.jobName, job.data, job.options);
  return job;
}

export async function publishGenerationDeadLetter(
  input: GenerationDeadLetterInput,
  deps: {
    config: GenerationQueueConfig;
    publisher: GenerationBullMQPublisher;
  },
) {
  const jobId = buildGenerationBullMQJobId(
    "generation.dead_letter",
    input.sourceQueueName,
    input.sourceJobId,
  );
  await deps.publisher.add(
    deps.config.queues.deadLetter,
    "generation.dead_letter",
    {
      sourceQueueName: input.sourceQueueName,
      sourceJobId: input.sourceJobId,
      sourceJobName: input.sourceJobName,
      sourceJobData: input.sourceJobData,
      sourceJobOptions: replayableJobOptions(input.sourceJobOptions),
      failedReason: input.failedReason,
      attemptsMade: input.attemptsMade,
      failedAt: input.failedAt.toISOString(),
    },
    {
      jobId,
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  );
  return { queueName: deps.config.queues.deadLetter, jobId };
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
      await getQueue(queueName).add(name, data, options);
      await evictIdleQueues(queueName);
    },
    async close() {
      await Promise.all([...queues.values()].map((entry) => entry.queue.close()));
      queues.clear();
    },
  };
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
    connectTimeout: 2_000,
    commandTimeout: 5_000,
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

function resolveFinalizeQueueName(payload: Record<string, unknown>, fallback: string) {
  const explicit = readString(payload.artifactQueueName);
  if (explicit) return explicit;
  const queueName = readString(payload.queueName);
  return /(^|-)generation-(image|video|audio)-(fetch|persist)-[a-z0-9]+-\d{3}$/.test(queueName)
    ? queueName
    : fallback;
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

function replayableJobOptions(options: JobsOptions): Record<string, unknown> {
  return {
    attempts: options.attempts,
    backoff: options.backoff,
    removeOnComplete: options.removeOnComplete,
    removeOnFail: options.removeOnFail,
    priority: options.priority,
  };
}
