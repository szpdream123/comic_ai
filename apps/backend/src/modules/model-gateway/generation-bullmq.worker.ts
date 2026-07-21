import type { JobsOptions } from "bullmq";

import {
  buildGenerationBullMQJobId,
  type GenerationBullMQPublisher,
} from "./generation-bullmq.publisher.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";

type SubmitVideoResult =
  | { status: "submitted"; externalRequestId: string | null }
  | { status: "already_started"; externalRequestId: string | null }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "skipped" };

type SubmitImageResult =
  | { status: "submitted" }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" };

type SubmitAudioResult =
  | { status: "submitted"; providerStatus: "waiting" | "succeeded" }
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
    mediaType: "video" | "image" | "audio";
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
  submitGptImage?(input: { taskId: string; userConcurrencyLimit: number; now: Date }): Promise<SubmitImageResult>;
  submitSeedanceVideo(input: { taskId: string; userConcurrencyLimit: number; now: Date }): Promise<SubmitVideoResult>;
  submitAudio?(input: { taskId: string; now: Date }): Promise<SubmitAudioResult>;
  pollAudio?(input: { taskId: string; now: Date }): Promise<PollVideoResult>;
  pollSeedanceVideo(input: { taskId: string; now: Date }): Promise<PollVideoResult>;
  finalizeGptImageArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  persistGptImageArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  finalizeSeedanceVideoArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  finalizeAudioArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  persistSeedanceVideoArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  expireSeedanceVideo(input: { taskId: string; now: Date }): Promise<Extract<PollVideoResult, { status: "failed" }>>;
  expireAudio?(input: { taskId: string; now: Date }): Promise<Extract<PollVideoResult, { status: "failed" }>>;
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
    outboxEventId?: string;
  }>,
): Promise<{ status: SubmitVideoResult["status"]; queuedPoll: boolean }> {
  if (input.job.data.providerExecutor !== "seedance") {
    throw new Error(`unsupported_video_provider_executor:${input.job.data.providerExecutor}`);
  }

  const result = await input.processors.submitSeedanceVideo({
    taskId: input.job.data.taskId,
    userConcurrencyLimit: input.config.submit.video.userConcurrencyLimit,
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
    outboxEventId?: string;
  }>,
): Promise<{ status: SubmitImageResult["status"]; failureCode?: string }> {
  if (!isImageProviderExecutor(input.job.data.providerExecutor)) {
    throw new Error(`unsupported_image_provider_executor:${input.job.data.providerExecutor}`);
  }
  if (!input.processors.submitGptImage) {
    throw new Error("gpt_image_processor_missing");
  }

  const result = await input.processors.submitGptImage({
    taskId: input.job.data.taskId,
    userConcurrencyLimit: input.config.submit.image.userConcurrencyLimit,
    now: input.now,
  });
  if (result.status === "failed") {
    return { status: "failed", failureCode: result.failureCode };
  }
  if (result.status === "rate_limited") {
    await enqueueImageSubmitRetryJob(input, result.retryAfterMs);
    return { status: result.status };
  }
  if (result.status === "submitted") {
    await enqueueImageFinalizeJob(input);
    return { status: "submitted", queuedFinalize: true };
  }
  return { status: result.status };
}

export async function handleGenerationSubmitAudioJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "audio";
    modelCode: string | null;
    providerExecutor: string;
    outboxEventId?: string;
  }>,
): Promise<{ status: SubmitAudioResult["status"]; queuedPoll?: boolean; queuedFinalize?: boolean; failureCode?: string }> {
  if (input.job.data.providerExecutor !== "aliyun-bailian-audio") {
    throw new Error(`unsupported_audio_provider_executor:${input.job.data.providerExecutor}`);
  }
  if (!input.processors.submitAudio) throw new Error("audio_submit_processor_missing");
  const result = await input.processors.submitAudio({ taskId: input.job.data.taskId, now: input.now });
  if (result.status === "failed") return { status: "failed", failureCode: result.failureCode };
  if (result.status !== "submitted") return { status: result.status };
  if (result.providerStatus === "succeeded") {
    await enqueueAudioFinalizeJob(input);
    return { status: "submitted", queuedFinalize: true };
  }
  await enqueueAudioPollJob(input, 1);
  return { status: "submitted", queuedPoll: true };
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

  if (result.status === "skipped") {
    return { status: "skipped", queuedPoll: false };
  }

  await enqueueVideoFinalizeJob(input);
  return { status: result.status, queuedPoll: false, queuedFinalize: true };
}

export async function handleGenerationPollAudioJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "audio";
    modelCode: string | null;
    providerExecutor: string;
    pollAttempt: number;
  }>,
): Promise<{ status: PollVideoResult["status"]; queuedPoll: boolean; queuedFinalize?: boolean; failureCode?: string }> {
  if (input.job.data.providerExecutor !== "aliyun-bailian-audio") {
    throw new Error(`unsupported_audio_provider_executor:${input.job.data.providerExecutor}`);
  }
  if (!input.processors.pollAudio) throw new Error("audio_poll_processor_missing");
  const result = await input.processors.pollAudio({ taskId: input.job.data.taskId, now: input.now });
  if (result.status === "waiting") {
    const nextAttempt = Number(input.job.data.pollAttempt) + 1;
    if (nextAttempt > input.config.poll.video.maxAttempts) {
      if (!input.processors.expireAudio) throw new Error("audio_expire_processor_missing");
      const expired = await input.processors.expireAudio({ taskId: input.job.data.taskId, now: input.now });
      return { status: "failed", queuedPoll: false, failureCode: expired.failureCode };
    }
    await enqueueAudioPollJob(input, nextAttempt);
    return { status: "waiting", queuedPoll: true };
  }
  if (result.status === "failed") return { status: "failed", queuedPoll: false, failureCode: result.failureCode };
  if (result.status === "skipped") return { status: "skipped", queuedPoll: false };
  await enqueueAudioFinalizeJob(input);
  return { status: "succeeded", queuedPoll: false, queuedFinalize: true };
}

export async function handleGenerationFinalizeArtifactJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video" | "image" | "audio";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image" | "audio";
    finalizeMode?: "retry_finalize" | "retry_persist_asset" | null;
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
    if (isImageProviderExecutor(input.job.data.providerExecutor) && input.job.data.artifactKind === "image") {
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
    if (input.job.data.providerExecutor === "aliyun-bailian-audio" && input.job.data.artifactKind === "audio") {
      if (!input.processors.finalizeAudioArtifact) throw new Error("audio_finalize_processor_missing");
      const result = await input.processors.finalizeAudioArtifact({ taskId: input.job.data.taskId, now: input.now });
      return result.status === "failed"
        ? { status: "failed", failureCode: result.failureCode }
        : { status: result.status };
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
    mediaType: "video" | "image" | "audio";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image" | "audio";
    finalizeMode?: "retry_finalize" | "retry_persist_asset" | null;
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

  if (isImageProviderExecutor(input.job.data.providerExecutor) && input.job.data.artifactKind === "image") {
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

function isImageProviderExecutor(providerExecutor: string) {
  return providerExecutor === "gpt-image-2" || providerExecutor === "image-http";
}

async function acquireFinalizePermit(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video" | "image" | "audio";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image" | "audio";
    storageBucket?: string | null;
  }>,
) {
  if (!input.finalizeRateLimiter) {
    return null;
  }
  return input.finalizeRateLimiter.acquireFinalizePermit({
    bucket: String(input.job.data.storageBucket ?? "default"),
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
      jobId: buildGenerationBullMQJobId(
        "generation.video.poll.rate-limit-retry",
        input.job.data.taskId,
        input.job.data.pollAttempt,
        input.now.getTime(),
      ),
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
    mediaType: "video" | "image" | "audio";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image" | "audio";
    storageBucket?: string | null;
  }>,
  retryAfterMs: number,
) {
  const jobData: {
    taskId: string;
    workflowId: string;
    mediaType: "video" | "image" | "audio";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video" | "image" | "audio";
    storageBucket?: string;
  } = {
    taskId: input.job.data.taskId,
    workflowId: input.job.data.workflowId,
    mediaType: input.job.data.mediaType,
    modelCode: input.job.data.modelCode,
    providerExecutor: input.job.data.providerExecutor,
    artifactKind: input.job.data.artifactKind,
  };
  if (input.job.data.storageBucket) {
    jobData.storageBucket = input.job.data.storageBucket;
  }

  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.artifact.finalize.rate-limit-retry",
    jobData,
    {
      jobId: buildGenerationBullMQJobId(
        "generation.artifact.finalize.rate-limit-retry",
        input.job.data.taskId,
        input.now.getTime(),
      ),
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
    },
    {
      jobId: buildGenerationBullMQJobId(
        "generation.video.submit.retry",
        input.job.data.taskId,
        input.now.getTime(),
      ),
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

async function enqueueImageSubmitRetryJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "image";
    modelCode: string | null;
    providerExecutor: string;
    outboxEventId?: string;
  }>,
  retryAfterMs: number,
) {
  await input.publisher.add(
    input.config.queues.submitImage,
    "generation.image.submit.retry",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "image",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      outboxEventId: input.job.data.outboxEventId,
    },
    {
      jobId: buildGenerationBullMQJobId(
        "generation.image.submit.retry",
        input.job.data.taskId,
        input.now.getTime(),
      ),
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
  }>,
) {
  const jobData: {
    taskId: string;
    workflowId: string;
    mediaType: "video";
    modelCode: string | null;
    providerExecutor: string;
    artifactKind: "video";
  } = {
    taskId: input.job.data.taskId,
    workflowId: input.job.data.workflowId,
    mediaType: "video",
    modelCode: input.job.data.modelCode,
    providerExecutor: input.job.data.providerExecutor,
    artifactKind: "video",
  };

  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.video.finalize",
    jobData,
    {
      jobId: buildGenerationBullMQJobId("generation.video.finalize", input.job.data.taskId),
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
  } = {
    taskId: input.job.data.taskId,
    workflowId: input.job.data.workflowId,
    mediaType: "image",
    modelCode: input.job.data.modelCode,
    providerExecutor: input.job.data.providerExecutor,
    artifactKind: "image",
  };

  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.image.finalize",
    jobData,
    {
      jobId: buildGenerationBullMQJobId("generation.image.finalize", input.job.data.taskId),
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

async function enqueueAudioPollJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "audio";
    modelCode: string | null;
    providerExecutor: string;
  }>,
  pollAttempt: number,
) {
  await input.publisher.add(
    input.config.queues.pollVideo,
    "generation.audio.poll",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "audio",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      pollAttempt,
    },
    {
      ...buildVideoPollJobOptions(input.job.data.taskId, pollAttempt, input.config),
      jobId: buildGenerationBullMQJobId("generation.audio.poll", input.job.data.taskId, pollAttempt),
    },
  );
}

async function enqueueAudioFinalizeJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "audio";
    modelCode: string | null;
    providerExecutor: string;
  }>,
) {
  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.audio.finalize",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "audio",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      artifactKind: "audio",
    },
    {
      jobId: buildGenerationBullMQJobId("generation.audio.finalize", input.job.data.taskId),
      attempts: 1,
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    },
  );
}

function buildVideoPollJobOptions(
  taskId: string,
  pollAttempt: number,
  config: GenerationQueueConfig,
): JobsOptions {
  return {
    jobId: buildGenerationBullMQJobId("generation.video.poll", taskId, pollAttempt),
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
