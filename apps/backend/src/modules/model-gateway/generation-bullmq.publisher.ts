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
    | "generation.video.poll.repair";
  jobId: string;
  data: {
    outboxEventId: string;
    taskId: string;
    workflowId: string;
    mediaType: "image" | "video" | "audio";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind?: "image" | "video" | "audio";
    storageBucket?: string | null;
    finalizeMode?: "retry_finalize" | "retry_persist_asset";
    pollAttempt?: number;
    membershipPriority?: boolean;
    queuePriority?: number;
    priorityReason?: string;
  };
  options: JobsOptions;
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
    attempts: 1,
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
  const jobId = buildGenerationBullMQJobId(
    "generation.video.poll.repair",
    taskId,
    event.id,
  );

  return {
    queueName: config.queues.pollVideo,
    jobName: "generation.video.poll.repair",
    jobId,
    data: {
      outboxEventId: event.id,
      taskId,
      workflowId,
      mediaType: "video",
      modelCode: readString(event.payload.modelCode) || null,
      providerExecutor: readString(event.payload.providerExecutor) || "seedance",
      pollAttempt: 1,
    },
    options: {
      jobId,
      attempts: 1,
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
  const jobId = buildFinalizeJobId({
    taskId,
    finalizeMode,
    outboxEventId: event.id,
  });

  return {
    queueName: config.queues.finalizeArtifact,
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
    },
    options: {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
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

export function buildGenerationBullMQJobId(...parts: Array<string | number>) {
  return parts.map((part) => String(part).replaceAll(":", "_")).join("__");
}

export function createBullMQGenerationPublisher(
  config: GenerationQueueConfig,
): CloseableGenerationBullMQPublisher {
  const queues = new Map<string, Queue>();
  const connection = redisConnectionFromUrl(config.redisUrl);

  function getQueue(queueName: string) {
    const existing = queues.get(queueName);
    if (existing) {
      return existing;
    }
    const queue = new Queue(queueName, {
      connection,
      prefix: config.queuePrefix,
    });
    queues.set(queueName, queue);
    return queue;
  }

  return {
    async add(queueName, name, data, options) {
      await getQueue(queueName).add(name, data, options);
    },
    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()));
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
