import type { JobsOptions } from "bullmq";

import type { GenerationBullMQPublisher } from "./generation-bullmq.publisher.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";

type SubmitVideoResult =
  | { status: "submitted"; externalRequestId: string | null }
  | { status: "already_started"; externalRequestId: string | null }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "skipped" };

type SubmitImageResult =
  | { status: "submitted" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" };

type FinalizeArtifactResult =
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" };

type FinalizeRateLimitGrant =
  | { granted: true; release(): Promise<void> }
  | { granted: false; retryAfterMs: number; reason: string };

export interface FinalizeRateLimiter {
  acquireFinalizePermit(input: {
    bucket: string;
    organizationId: string | null;
    mediaType: "video" | "image";
    leaseMs: number;
    now: Date;
  }): Promise<FinalizeRateLimitGrant>;
}

type PollVideoResult =
  | { status: "waiting" }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" };

export interface GenerationWorkerJob<TData extends Record<string, unknown>> {
  data: TData;
}

export interface GenerationWorkerProcessors {
  submitGptImage?(input: { taskId: string; now: Date }): Promise<SubmitImageResult>;
  submitSeedanceVideo(input: { taskId: string; now: Date }): Promise<SubmitVideoResult>;
  pollSeedanceVideo(input: { taskId: string; now: Date }): Promise<PollVideoResult>;
  finalizeGptImageArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  persistGptImageArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  finalizeSeedanceVideoArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  persistSeedanceVideoArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  expireSeedanceVideo(input: { taskId: string; now: Date }): Promise<Extract<PollVideoResult, { status: "failed" }>>;
}

export interface GenerationWorkerHandlerInput<TData extends Record<string, unknown>> {
  job: GenerationWorkerJob<TData>;
  config: GenerationQueueConfig;
  publisher: GenerationBullMQPublisher;
  processors: GenerationWorkerProcessors;
  finalizeRateLimiter?: FinalizeRateLimiter;
  now: Date;
}

export async function handleGenerationSubmitVideoJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video";
    modelCode: string | null;
    providerExecutor: string;
    organizationId?: string | null;
    outboxEventId?: string;
  }>,
): Promise<{ status: SubmitVideoResult["status"]; queuedPoll: boolean }> {
  if (input.job.data.providerExecutor !== "seedance") {
    throw new Error(`unsupported_video_provider_executor:${input.job.data.providerExecutor}`);
  }

  const result = await input.processors.submitSeedanceVideo({
    taskId: input.job.data.taskId,
    now: input.now,
  });

  if (result.status === "submitted" || result.status === "already_started") {
    await enqueueVideoPollJob(input, 1);
    return { status: result.status, queuedPoll: true };
  }

  if (result.status === "rate_limited") {
    await enqueueVideoSubmitRetryJob(input, result.retryAfterMs);
    return { status: result.status, queuedPoll: false };
  }

  return { status: result.status, queuedPoll: false };
}

export async function handleGenerationSubmitImageJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "image";
    modelCode: string | null;
    providerExecutor: string;
    organizationId?: string | null;
    outboxEventId?: string;
  }>,
): Promise<{ status: SubmitImageResult["status"]; failureCode?: string }> {
  if (input.job.data.providerExecutor !== "gpt-image-2") {
    throw new Error(`unsupported_image_provider_executor:${input.job.data.providerExecutor}`);
  }
  if (!input.processors.submitGptImage) {
    throw new Error("gpt_image_processor_missing");
  }

  const result = await input.processors.submitGptImage({
    taskId: input.job.data.taskId,
    now: input.now,
  });
  if (result.status === "failed") {
    return { status: "failed", failureCode: result.failureCode };
  }
  if (result.status === "submitted") {
    await enqueueImageFinalizeJob(input);
    return { status: "submitted", queuedFinalize: true };
  }
  return { status: result.status };
}

export async function handleGenerationPollVideoJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video";
    modelCode: string | null;
    providerExecutor: string;
    pollAttempt: number;
  }>,
): Promise<{ status: PollVideoResult["status"]; queuedPoll: boolean; queuedFinalize?: boolean; failureCode?: string }> {
  if (input.job.data.providerExecutor !== "seedance") {
    throw new Error(`unsupported_video_provider_executor:${input.job.data.providerExecutor}`);
  }

  const result = await input.processors.pollSeedanceVideo({
    taskId: input.job.data.taskId,
    now: input.now,
  });

  if (result.status === "rate_limited") {
    await enqueueVideoPollRateLimitRetryJob(input, result.retryAfterMs);
    return { status: result.status, queuedPoll: true };
  }

  if (result.status === "waiting") {
    const nextAttempt = Number(input.job.data.pollAttempt) + 1;
    if (nextAttempt > input.config.poll.video.maxAttempts) {
      const expired = await input.processors.expireSeedanceVideo({
        taskId: input.job.data.taskId,
        now: input.now,
      });
      return { status: "failed", queuedPoll: false, failureCode: expired.failureCode };
    }
    await enqueueVideoPollJob(input, nextAttempt);
    return { status: "waiting", queuedPoll: true };
  }

  if (result.status === "failed") {
    return { status: "failed", queuedPoll: false, failureCode: result.failureCode };
  }

  await enqueueVideoFinalizeJob(input);
  return { status: result.status, queuedPoll: false, queuedFinalize: true };
}

export async function handleGenerationFinalizeArtifactJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video" | "image";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image";
    finalizeMode?: "retry_finalize" | "retry_persist_asset" | null;
    organizationId?: string | null;
    storageBucket?: string | null;
  }>,
): Promise<{ status: FinalizeArtifactResult["status"] | "rate_limited"; failureCode?: string }> {
  const permit = await acquireFinalizePermit(input);
  if (permit && !permit.granted) {
    await enqueueFinalizeRateLimitRetryJob(input, permit.retryAfterMs);
    return { status: "rate_limited", failureCode: permit.reason };
  }

  try {
    if (input.job.data.finalizeMode === "retry_persist_asset") {
      return await handlePersistOnlyFinalizeArtifactJob(input);
    }

    if (input.job.data.providerExecutor === "seedance" && input.job.data.artifactKind === "video") {
      if (!input.processors.finalizeSeedanceVideoArtifact) {
        throw new Error("seedance_finalize_processor_missing");
      }
      const result = await input.processors.finalizeSeedanceVideoArtifact({
        taskId: input.job.data.taskId,
        now: input.now,
      });
      if (result.status === "failed") {
        return { status: "failed", failureCode: result.failureCode };
      }
      return { status: result.status };
    }
    if (input.job.data.providerExecutor === "gpt-image-2" && input.job.data.artifactKind === "image") {
      if (!input.processors.finalizeGptImageArtifact) {
        throw new Error("gpt_image_finalize_processor_missing");
      }
      const result = await input.processors.finalizeGptImageArtifact({
        taskId: input.job.data.taskId,
        now: input.now,
      });
      if (result.status === "failed") {
        return { status: "failed", failureCode: result.failureCode };
      }
      return { status: result.status };
    }

    throw new Error(`unsupported_finalize_provider_executor:${input.job.data.providerExecutor}:${input.job.data.artifactKind}`);
  } finally {
    if (permit?.granted) {
      await permit.release();
    }
  }
}

async function handlePersistOnlyFinalizeArtifactJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video" | "image";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image";
    finalizeMode?: "retry_finalize" | "retry_persist_asset" | null;
    organizationId?: string | null;
    storageBucket?: string | null;
  }>,
): Promise<{ status: FinalizeArtifactResult["status"]; failureCode?: string }> {
  if (input.job.data.providerExecutor === "seedance" && input.job.data.artifactKind === "video") {
    if (!input.processors.persistSeedanceVideoArtifact) {
      throw new Error("seedance_persist_processor_missing");
    }
    const result = await input.processors.persistSeedanceVideoArtifact({
      taskId: input.job.data.taskId,
      now: input.now,
    });
    return result.status === "failed"
      ? { status: "failed", failureCode: result.failureCode }
      : { status: result.status };
  }

  if (input.job.data.providerExecutor === "gpt-image-2" && input.job.data.artifactKind === "image") {
    if (!input.processors.persistGptImageArtifact) {
      throw new Error("gpt_image_persist_processor_missing");
    }
    const result = await input.processors.persistGptImageArtifact({
      taskId: input.job.data.taskId,
      now: input.now,
    });
    return result.status === "failed"
      ? { status: "failed", failureCode: result.failureCode }
      : { status: result.status };
  }

  throw new Error(`unsupported_persist_provider_executor:${input.job.data.providerExecutor}:${input.job.data.artifactKind}`);
}

async function acquireFinalizePermit(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video" | "image";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image";
    organizationId?: string | null;
    storageBucket?: string | null;
  }>,
) {
  if (!input.finalizeRateLimiter) {
    return null;
  }
  return input.finalizeRateLimiter.acquireFinalizePermit({
    bucket: String(input.job.data.storageBucket ?? "default"),
    organizationId: input.job.data.organizationId ?? null,
    mediaType: input.job.data.mediaType,
    leaseMs: 120_000,
    now: input.now,
  });
}

async function enqueueVideoPollRateLimitRetryJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video";
    modelCode: string | null;
    providerExecutor: string;
    pollAttempt: number;
  }>,
  retryAfterMs: number,
) {
  await input.publisher.add(
    input.config.queues.pollVideo,
    "generation.video.poll.rate-limit-retry",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "video",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      pollAttempt: input.job.data.pollAttempt,
    },
    {
      jobId: `generation.video.poll.rate-limit-retry:${input.job.data.taskId}:${input.job.data.pollAttempt}:${input.now.getTime()}`,
      delay: Math.max(0, Math.floor(retryAfterMs)),
      attempts: 1,
      removeOnComplete: {
        age: 86400,
        count: 10000,
      },
      removeOnFail: {
        age: 604800,
        count: 50000,
      },
    },
  );
}

async function enqueueFinalizeRateLimitRetryJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video" | "image";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image";
    organizationId?: string | null;
    storageBucket?: string | null;
  }>,
  retryAfterMs: number,
) {
  const jobData: {
    taskId: string;
    workflowId: string;
    mediaType: "video" | "image";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image";
    organizationId?: string;
    storageBucket?: string;
  } = {
    taskId: input.job.data.taskId,
    workflowId: input.job.data.workflowId,
    mediaType: input.job.data.mediaType,
    modelCode: input.job.data.modelCode,
    providerExecutor: input.job.data.providerExecutor,
    artifactKind: input.job.data.artifactKind,
  };
  if (input.job.data.organizationId) {
    jobData.organizationId = input.job.data.organizationId;
  }
  if (input.job.data.storageBucket) {
    jobData.storageBucket = input.job.data.storageBucket;
  }

  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.artifact.finalize.rate-limit-retry",
    jobData,
    {
      jobId: `generation.artifact.finalize.rate-limit-retry:${input.job.data.taskId}:${input.now.getTime()}`,
      delay: Math.max(0, Math.floor(retryAfterMs)),
      attempts: 1,
      removeOnComplete: {
        age: 86400,
        count: 10000,
      },
      removeOnFail: {
        age: 604800,
        count: 50000,
      },
    },
  );
}

async function enqueueVideoPollJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video";
    modelCode: string | null;
    providerExecutor: string;
  }>,
  pollAttempt: number,
) {
  await input.publisher.add(
    input.config.queues.pollVideo,
    "generation.video.poll",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "video",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      pollAttempt,
    },
    buildVideoPollJobOptions(input.job.data.taskId, pollAttempt, input.config),
  );
}

async function enqueueVideoSubmitRetryJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video";
    modelCode: string | null;
    providerExecutor: string;
    organizationId?: string | null;
    outboxEventId?: string;
  }>,
  retryAfterMs: number,
) {
  await input.publisher.add(
    input.config.queues.submitVideo,
    "generation.video.submit.retry",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "video",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      outboxEventId: input.job.data.outboxEventId,
      organizationId: input.job.data.organizationId ?? null,
    },
    {
      jobId: `generation.video.submit.retry:${input.job.data.taskId}:${input.now.getTime()}`,
      delay: Math.max(0, Math.floor(retryAfterMs)),
      attempts: 1,
      removeOnComplete: {
        age: 86400,
        count: 10000,
      },
      removeOnFail: {
        age: 604800,
        count: 50000,
      },
    },
  );
}

async function enqueueVideoFinalizeJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video";
    modelCode: string | null;
    providerExecutor: string;
    pollAttempt: number;
    organizationId?: string | null;
  }>,
) {
  const jobData: {
    taskId: string;
    workflowId: string;
    mediaType: "video";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video";
    organizationId?: string;
  } = {
    taskId: input.job.data.taskId,
    workflowId: input.job.data.workflowId,
    mediaType: "video",
    modelCode: input.job.data.modelCode,
    providerExecutor: input.job.data.providerExecutor,
    artifactKind: "video",
  };
  if (input.job.data.organizationId) {
    jobData.organizationId = input.job.data.organizationId;
  }

  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.video.finalize",
    jobData,
    {
      jobId: `generation.video.finalize:${input.job.data.taskId}`,
      attempts: 1,
      removeOnComplete: {
        age: 86400,
        count: 10000,
      },
      removeOnFail: {
        age: 604800,
        count: 50000,
      },
    },
  );
}

async function enqueueImageFinalizeJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "image";
    modelCode: string | null;
    providerExecutor: string;
    organizationId?: string | null;
    outboxEventId?: string;
  }>,
) {
  const jobData: {
    taskId: string;
    workflowId: string;
    mediaType: "image";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "image";
    organizationId?: string;
  } = {
    taskId: input.job.data.taskId,
    workflowId: input.job.data.workflowId,
    mediaType: "image",
    modelCode: input.job.data.modelCode,
    providerExecutor: input.job.data.providerExecutor,
    artifactKind: "image",
  };
  if (input.job.data.organizationId) {
    jobData.organizationId = input.job.data.organizationId;
  }

  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.image.finalize",
    jobData,
    {
      jobId: `generation.image.finalize:${input.job.data.taskId}`,
      attempts: 1,
      removeOnComplete: {
        age: 86400,
        count: 10000,
      },
      removeOnFail: {
        age: 604800,
        count: 50000,
      },
    },
  );
}

function buildVideoPollJobOptions(
  taskId: string,
  pollAttempt: number,
  config: GenerationQueueConfig,
): JobsOptions {
  return {
    jobId: `generation.video.poll:${taskId}:${pollAttempt}`,
    delay: config.poll.video.intervalMs,
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
}
