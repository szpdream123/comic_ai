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
  | { status: "retryable"; retryAfterMs: number; reason: string }
  | { status: "failed"; failureCode: string }
  | { status: "settled" };

type SubmitImageResult =
  | { status: "submitted"; providerStatus?: "waiting" | "succeeded" }
  | { status: "rate_limited"; retryAfterMs: number; reason: string }
  | { status: "failed"; failureCode: string }
  | { status: "skipped"; nextAction?: "submit" | "poll" | "finalize" | "stop" };

type SubmitAudioResult =
  | { status: "submitted"; providerStatus: "waiting" | "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped"; nextAction?: "submit" | "poll" | "finalize" | "stop" };

type FinalizeArtifactResult =
  | { status: "succeeded" }
  | { status: "failed"; failureCode: string }
  | { status: "skipped" };

type GenerationArtifactJobData = {
  taskId: string;
  workflowId: string;
  mediaType: "video" | "image" | "audio";
  modelCode: string | null;
  providerExecutor: string;
  artifactKind: "video" | "image" | "audio";
  artifactStage?: "fetch" | "persist";
  finalizeMode?: "retry_finalize" | "retry_persist_asset" | null;
  storageBucket?: string | null;
};

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
  | { status: "skipped"; nextAction?: "submit" | "poll" | "finalize" | "stop" };

export interface GenerationWorkerJob<TData extends Record<string, unknown>> {
  data: TData;
}

export interface GenerationWorkerProcessors {
  submitGptImage?(input: { taskId: string; userConcurrencyLimit: number; now: Date }): Promise<SubmitImageResult>;
  submitSeedanceVideo(input: { taskId: string; userConcurrencyLimit: number; now: Date }): Promise<SubmitVideoResult>;
  submitAudio?(input: { taskId: string; now: Date }): Promise<SubmitAudioResult>;
  pollGptImage?(input: { taskId: string; now: Date }): Promise<PollVideoResult>;
  pollAudio?(input: { taskId: string; now: Date }): Promise<PollVideoResult>;
  pollSeedanceVideo(input: { taskId: string; now: Date }): Promise<PollVideoResult>;
  finalizeGptImageArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  fetchGptImageArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  persistGptImageArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  finalizeSeedanceVideoArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  fetchSeedanceVideoArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  finalizeAudioArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  fetchAudioArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  persistAudioArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  persistSeedanceVideoArtifact?(input: { taskId: string; now: Date }): Promise<FinalizeArtifactResult>;
  expireSeedanceVideo(input: { taskId: string; now: Date }): Promise<Extract<PollVideoResult, { status: "failed" }>>;
  expireGptImage?(input: { taskId: string; now: Date }): Promise<Extract<PollVideoResult, { status: "failed" }>>;
  expireAudio?(input: { taskId: string; now: Date }): Promise<Extract<PollVideoResult, { status: "failed" }>>;
  schedulePoll?(input: {
    taskId: string;
    mediaType: "image" | "video" | "audio";
    nextPollAttempt: number;
    delayMs: number;
    now: Date;
  }): Promise<boolean>;
  recordSkippedSuccessor?(input: {
    taskId: string;
    stage: "submit" | "poll";
    pollAttempt: number;
    skipReason: string;
    nextAction: "submit" | "poll" | "finalize" | "stop";
    successorAssignmentKey?: string | null;
    now: Date;
  }): Promise<void>;
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
    if (!result.externalRequestId) {
      return { status: result.status, queuedPoll: false };
    }
    await scheduleVideoPollJob(input, 1);
    return { status: result.status, queuedPoll: true };
  }

  if (result.status === "rate_limited" || result.status === "retryable") {
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
): Promise<{ status: SubmitImageResult["status"]; queuedPoll?: boolean; queuedFinalize?: boolean; failureCode?: string }> {
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
    if (result.providerStatus === "succeeded") {
      await enqueueImageFinalizeJob(input);
      return { status: "submitted", queuedFinalize: true };
    }
    await scheduleImagePollJob(input, 1);
    return { status: "submitted", queuedPoll: true };
  }
  if (result.status === "skipped") {
    if (result.nextAction === "stop") {
      return { status: "skipped", queuedPoll: false };
    }
    await enqueueImagePollJob(input, 1);
    return { status: "skipped", queuedPoll: true };
  }
  return { status: result.status };
}

export async function handleGenerationPollImageJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "image";
    modelCode: string | null;
    providerExecutor: string;
    pollAttempt: number;
  }>,
): Promise<{ status: PollVideoResult["status"]; queuedPoll: boolean; queuedFinalize?: boolean; queuedSubmit?: boolean; failureCode?: string }> {
  if (!isImageProviderExecutor(input.job.data.providerExecutor)) {
    throw new Error(`unsupported_image_provider_executor:${input.job.data.providerExecutor}`);
  }
  if (!input.processors.pollGptImage) throw new Error("gpt_image_poll_processor_missing");
  const result = await input.processors.pollGptImage({ taskId: input.job.data.taskId, now: input.now });
  if (result.status === "rate_limited") {
    await enqueueImagePollRateLimitRetryJob(input, result.retryAfterMs);
    return { status: result.status, queuedPoll: true };
  }
  if (result.status === "skipped" && result.nextAction === "submit") {
    await enqueueImageSubmitRetryJob(input, input.config.poll.image.intervalMs);
    await recordSkippedSuccessor(input, "image", result, "submit");
    return { status: "skipped", queuedPoll: false, queuedSubmit: true };
  }
  if (result.status === "skipped" && (result.nextAction === "finalize" || result.nextAction === "stop")) {
    if (result.nextAction === "finalize") await enqueueImageFinalizeJob(input);
    await recordSkippedSuccessor(input, "image", result, result.nextAction);
    return { status: "skipped", queuedPoll: false, ...(result.nextAction === "finalize" ? { queuedFinalize: true } : {}) };
  }
  if (result.status === "waiting" || result.status === "skipped") {
    const nextAttempt = Number(input.job.data.pollAttempt) + 1;
    if (nextAttempt > input.config.poll.image.maxAttempts) {
      if (!input.processors.expireGptImage) throw new Error("gpt_image_expire_processor_missing");
      const expired = await input.processors.expireGptImage({ taskId: input.job.data.taskId, now: input.now });
      return { status: "failed", queuedPoll: false, failureCode: expired.failureCode };
    }
    const successorAssignmentKey = await scheduleImagePollJob(input, nextAttempt);
    if (result.status === "skipped") {
      await recordSkippedSuccessor(input, "image", result, "poll", successorAssignmentKey);
    }
    return { status: result.status, queuedPoll: true };
  }
  if (result.status === "failed") return { status: "failed", queuedPoll: false, failureCode: result.failureCode };
  await enqueueImageFinalizeJob(input);
  return { status: "succeeded", queuedPoll: false, queuedFinalize: true };
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
  if (result.status === "skipped") {
    if (result.nextAction === "stop") {
      return { status: "skipped", queuedPoll: false };
    }
    await enqueueAudioPollJob(input, 1);
    return { status: "skipped", queuedPoll: true };
  }
  if (result.status !== "submitted") return { status: result.status };
  if (result.providerStatus === "succeeded") {
    await enqueueAudioFinalizeJob(input);
    return { status: "submitted", queuedFinalize: true };
  }
  await scheduleAudioPollJob(input, 1);
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
): Promise<{ status: PollVideoResult["status"]; queuedPoll: boolean; queuedFinalize?: boolean; queuedSubmit?: boolean; failureCode?: string }> {
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

  if (result.status === "skipped" && result.nextAction === "submit") {
    await enqueueVideoSubmitRetryJob(input, input.config.poll.video.intervalMs);
    await recordSkippedSuccessor(input, "video", result, "submit");
    return { status: "skipped", queuedPoll: false, queuedSubmit: true };
  }
  if (result.status === "skipped" && (result.nextAction === "finalize" || result.nextAction === "stop")) {
    if (result.nextAction === "finalize") await enqueueVideoFinalizeJob(input);
    await recordSkippedSuccessor(input, "video", result, result.nextAction);
    return { status: "skipped", queuedPoll: false, ...(result.nextAction === "finalize" ? { queuedFinalize: true } : {}) };
  }
  if (result.status === "waiting" || result.status === "skipped") {
    const nextAttempt = Number(input.job.data.pollAttempt) + 1;
    if (nextAttempt > input.config.poll.video.maxAttempts) {
      const expired = await input.processors.expireSeedanceVideo({
        taskId: input.job.data.taskId,
        now: input.now,
      });
      return { status: "failed", queuedPoll: false, failureCode: expired.failureCode };
    }
    const successorAssignmentKey = await scheduleVideoPollJob(input, nextAttempt);
    if (result.status === "skipped") {
      await recordSkippedSuccessor(input, "video", result, "poll", successorAssignmentKey);
    }
    return { status: result.status, queuedPoll: true };
  }

  if (result.status === "failed") {
    return { status: "failed", queuedPoll: false, failureCode: result.failureCode };
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
): Promise<{ status: PollVideoResult["status"]; queuedPoll: boolean; queuedFinalize?: boolean; queuedSubmit?: boolean; failureCode?: string }> {
  if (input.job.data.providerExecutor !== "aliyun-bailian-audio") {
    throw new Error(`unsupported_audio_provider_executor:${input.job.data.providerExecutor}`);
  }
  if (!input.processors.pollAudio) throw new Error("audio_poll_processor_missing");
  const result = await input.processors.pollAudio({ taskId: input.job.data.taskId, now: input.now });
  if (result.status === "skipped" && result.nextAction === "submit") {
    await enqueueAudioSubmitRetryJob(input, input.config.poll.audio.intervalMs);
    await recordSkippedSuccessor(input, "audio", result, "submit");
    return { status: "skipped", queuedPoll: false, queuedSubmit: true };
  }
  if (result.status === "skipped" && (result.nextAction === "finalize" || result.nextAction === "stop")) {
    if (result.nextAction === "finalize") await enqueueAudioFinalizeJob(input);
    await recordSkippedSuccessor(input, "audio", result, result.nextAction);
    return { status: "skipped", queuedPoll: false, ...(result.nextAction === "finalize" ? { queuedFinalize: true } : {}) };
  }
  if (result.status === "waiting" || result.status === "skipped") {
    const nextAttempt = Number(input.job.data.pollAttempt) + 1;
    const maxAttempts = input.config.poll.audio.maxAttempts;
    if (nextAttempt > maxAttempts) {
      if (!input.processors.expireAudio) throw new Error("audio_expire_processor_missing");
      const expired = await input.processors.expireAudio({ taskId: input.job.data.taskId, now: input.now });
      return { status: "failed", queuedPoll: false, failureCode: expired.failureCode };
    }
    const successorAssignmentKey = await scheduleAudioPollJob(input, nextAttempt);
    if (result.status === "skipped") {
      await recordSkippedSuccessor(input, "audio", result, "poll", successorAssignmentKey);
    }
    return { status: result.status, queuedPoll: true };
  }
  if (result.status === "failed") return { status: "failed", queuedPoll: false, failureCode: result.failureCode };
  await enqueueAudioFinalizeJob(input);
  return { status: "succeeded", queuedPoll: false, queuedFinalize: true };
}

export async function handleGenerationFinalizeArtifactJob(
  input: GenerationWorkerHandlerInput<GenerationArtifactJobData>,
): Promise<{ status: FinalizeArtifactResult["status"] | "rate_limited"; failureCode?: string; queuedPersist?: boolean }> {
  if (input.job.data.artifactStage === "fetch") {
    return handleGenerationFetchArtifactJob(input);
  }
  if (input.job.data.artifactStage === "persist" || input.job.data.finalizeMode === "retry_persist_asset") {
    return handleGenerationPersistArtifactJob(input);
  }
  const permit = await acquireFinalizePermit(input);
  if (permit && !permit.granted) {
    await enqueueFinalizeRateLimitRetryJob(input, permit.retryAfterMs);
    return { status: "rate_limited", failureCode: permit.reason };
  }

  try {
    if (input.job.data.providerExecutor === "seedance" && input.job.data.artifactKind === "video") {
      if (!input.processors.finalizeSeedanceVideoArtifact) {
        throw new Error("seedance_finalize_processor_missing");
      }
      const result = await input.processors.finalizeSeedanceVideoArtifact({
        taskId: input.job.data.taskId,
        now: input.now,
      });
      if (result.status === "failed") {
        throwIfRetryableArtifactTransferFailure(result.failureCode);
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

export async function handleGenerationFetchArtifactJob(
  input: GenerationWorkerHandlerInput<GenerationArtifactJobData>,
): Promise<{ status: FinalizeArtifactResult["status"] | "rate_limited"; failureCode?: string; queuedPersist: boolean }> {
  const permit = await acquireFinalizePermit(input);
  if (permit && !permit.granted) {
    await enqueueFinalizeRateLimitRetryJob(input, permit.retryAfterMs);
    return { status: "rate_limited", failureCode: permit.reason, queuedPersist: false };
  }
  try {
    const result = await runFetchArtifactProcessor(input);
    if (result.status === "failed") {
      throw Object.assign(new Error(result.failureCode), { failureCode: result.failureCode });
    }
    if (result.status !== "succeeded") {
      return {
        status: result.status,
        queuedPersist: false,
      };
    }
    await enqueuePersistArtifactJob(input);
    return { status: "succeeded", queuedPersist: true };
  } finally {
    if (permit?.granted) await permit.release();
  }
}

export async function handleGenerationPersistArtifactJob(
  input: GenerationWorkerHandlerInput<GenerationArtifactJobData>,
): Promise<{ status: FinalizeArtifactResult["status"] | "rate_limited"; failureCode?: string }> {
  const permit = await acquireFinalizePermit(input);
  if (permit && !permit.granted) {
    await enqueueFinalizeRateLimitRetryJob(input, permit.retryAfterMs);
    return { status: "rate_limited", failureCode: permit.reason };
  }
  try {
    const result = await handlePersistOnlyFinalizeArtifactJob(input);
    if (result.status === "failed") {
      throw Object.assign(new Error(result.failureCode), { failureCode: result.failureCode });
    }
    return result;
  } finally {
    if (permit?.granted) await permit.release();
  }
}

async function runFetchArtifactProcessor(
  input: GenerationWorkerHandlerInput<GenerationArtifactJobData>,
): Promise<FinalizeArtifactResult> {
  const task = { taskId: input.job.data.taskId, now: input.now };
  if (input.job.data.providerExecutor === "seedance" && input.job.data.artifactKind === "video") {
    if (!input.processors.fetchSeedanceVideoArtifact) throw new Error("seedance_fetch_processor_missing");
    return input.processors.fetchSeedanceVideoArtifact(task);
  }
  if (isImageProviderExecutor(input.job.data.providerExecutor) && input.job.data.artifactKind === "image") {
    if (!input.processors.fetchGptImageArtifact) throw new Error("gpt_image_fetch_processor_missing");
    return input.processors.fetchGptImageArtifact(task);
  }
  if (input.job.data.providerExecutor === "aliyun-bailian-audio" && input.job.data.artifactKind === "audio") {
    if (!input.processors.fetchAudioArtifact) throw new Error("audio_fetch_processor_missing");
    return input.processors.fetchAudioArtifact(task);
  }
  throw new Error(`unsupported_fetch_provider_executor:${input.job.data.providerExecutor}:${input.job.data.artifactKind}`);
}

async function handlePersistOnlyFinalizeArtifactJob(
  input: GenerationWorkerHandlerInput<GenerationArtifactJobData>,
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

  if (input.job.data.providerExecutor === "aliyun-bailian-audio" && input.job.data.artifactKind === "audio") {
    if (!input.processors.persistAudioArtifact) throw new Error("audio_persist_processor_missing");
    const result = await input.processors.persistAudioArtifact({ taskId: input.job.data.taskId, now: input.now });
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
  input: GenerationWorkerHandlerInput<GenerationArtifactJobData>,
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
  const retrySequence = nextRetrySequence(input.job.data);
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
      retrySequence,
      ...generationPriorityJobData(input.job.data),
    },
    {
      jobId: buildGenerationBullMQJobId(
        "generation.video.poll.rate-limit-retry",
        input.job.data.taskId,
        input.job.data.pollAttempt,
        retrySequence,
      ),
      delay: Math.max(0, Math.floor(retryAfterMs)),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.poll.attempts,
      backoff: {
        type: "exponential",
        delay: input.config.retry.poll.backoffMs,
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
  );
}

async function enqueueImagePollRateLimitRetryJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "image";
    modelCode: string | null;
    providerExecutor: string;
    pollAttempt: number;
  }>,
  retryAfterMs: number,
) {
  const retrySequence = nextRetrySequence(input.job.data);
  await input.publisher.add(
    input.config.queues.pollImage,
    "generation.image.poll.rate-limit-retry",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "image",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      pollAttempt: input.job.data.pollAttempt,
      retrySequence,
      ...generationPriorityJobData(input.job.data),
    },
    {
      jobId: buildGenerationBullMQJobId(
        "generation.image.poll.rate-limit-retry",
        input.job.data.taskId,
        input.job.data.pollAttempt,
        retrySequence,
      ),
      delay: Math.max(0, Math.floor(retryAfterMs)),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.poll.attempts,
      backoff: {
        type: "exponential",
        delay: input.config.retry.poll.backoffMs,
      },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    },
  );
}

async function enqueueFinalizeRateLimitRetryJob(
  input: GenerationWorkerHandlerInput<GenerationArtifactJobData>,
  retryAfterMs: number,
) {
  const retrySequence = nextRetrySequence(input.job.data);
  const artifactStage = input.job.data.artifactStage
    ?? (input.job.data.finalizeMode === "retry_persist_asset" ? "persist" : undefined);
  const jobData = {
    taskId: input.job.data.taskId,
    workflowId: input.job.data.workflowId,
    mediaType: input.job.data.mediaType,
    modelCode: input.job.data.modelCode,
    providerExecutor: input.job.data.providerExecutor,
    artifactKind: input.job.data.artifactKind,
    ...(input.job.data.artifactStage ? { artifactStage: input.job.data.artifactStage } : {}),
    ...(input.job.data.finalizeMode ? { finalizeMode: input.job.data.finalizeMode } : {}),
    retrySequence,
    ...(input.job.data.storageBucket ? { storageBucket: input.job.data.storageBucket } : {}),
    ...generationPriorityJobData(input.job.data),
  };

  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.artifact.finalize.rate-limit-retry",
    jobData,
    {
      jobId: buildGenerationBullMQJobId(
        "generation.artifact.finalize.rate-limit-retry",
        input.job.data.taskId,
        ...(artifactStage ? [artifactStage] : []),
        retrySequence,
      ),
      delay: Math.max(0, Math.floor(retryAfterMs)),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.finalize.attempts,
      backoff: {
        type: "exponential",
        delay: input.config.retry.finalize.backoffMs,
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
  );
}

async function enqueuePersistArtifactJob(
  input: GenerationWorkerHandlerInput<GenerationArtifactJobData>,
) {
  const mediaType = input.job.data.mediaType;
  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    `generation.${mediaType}.persist`,
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType,
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      artifactKind: input.job.data.artifactKind,
      artifactStage: "persist",
      finalizeMode: "retry_persist_asset",
      ...(input.job.data.storageBucket ? { storageBucket: input.job.data.storageBucket } : {}),
      ...generationPriorityJobData(input.job.data),
    },
    {
      jobId: buildGenerationBullMQJobId(`generation.${mediaType}.persist`, input.job.data.taskId),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.finalize.attempts,
      backoff: { type: "exponential", delay: input.config.retry.finalize.backoffMs },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    },
  );
}

async function scheduleVideoPollJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "video";
    modelCode: string | null;
    providerExecutor: string;
  }>,
  pollAttempt: number,
) {
  if (await scheduleDatabasePoll(input, "video", pollAttempt, input.config.poll.video.intervalMs)) {
    return `generation.due-poll:${input.job.data.taskId}:${pollAttempt}`;
  }
  await enqueueVideoPollJob(input, pollAttempt);
  return buildGenerationBullMQJobId("generation.video.poll", input.job.data.taskId, pollAttempt);
}

async function scheduleImagePollJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "image";
    modelCode: string | null;
    providerExecutor: string;
  }>,
  pollAttempt: number,
) {
  if (await scheduleDatabasePoll(input, "image", pollAttempt, input.config.poll.image.intervalMs)) {
    return `generation.due-poll:${input.job.data.taskId}:${pollAttempt}`;
  }
  await enqueueImagePollJob(input, pollAttempt);
  return buildGenerationBullMQJobId("generation.image.poll", input.job.data.taskId, pollAttempt);
}

async function scheduleAudioPollJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "audio";
    modelCode: string | null;
    providerExecutor: string;
  }>,
  pollAttempt: number,
) {
  if (await scheduleDatabasePoll(input, "audio", pollAttempt, input.config.poll.audio.intervalMs)) {
    return `generation.due-poll:${input.job.data.taskId}:${pollAttempt}`;
  }
  await enqueueAudioPollJob(input, pollAttempt);
  return buildGenerationBullMQJobId("generation.audio.poll", input.job.data.taskId, pollAttempt);
}

async function scheduleDatabasePoll(
  input: GenerationWorkerHandlerInput<Record<string, unknown> & { taskId: string }>,
  mediaType: "image" | "video" | "audio",
  nextPollAttempt: number,
  delayMs: number,
) {
  if (!input.processors.schedulePoll) return false;
  return input.processors.schedulePoll({
    taskId: input.job.data.taskId,
    mediaType,
    nextPollAttempt,
    delayMs,
    now: input.now,
  });
}

async function recordSkippedSuccessor(
  input: GenerationWorkerHandlerInput<Record<string, unknown> & { taskId: string }>,
  mediaType: "image" | "video" | "audio",
  result: Extract<PollVideoResult, { status: "skipped" }>,
  nextAction: "submit" | "poll" | "finalize" | "stop",
  successorAssignmentKey?: string,
) {
  if (!input.processors.recordSkippedSuccessor) return;
  const pollAttempt = Math.max(0, Math.floor(Number(input.job.data.pollAttempt ?? 0)));
  const inferredKey = successorAssignmentKey
    ?? (nextAction === "submit"
      ? `generation.${mediaType}.submit:${input.job.data.taskId}`
      : nextAction === "finalize"
        ? `generation.${mediaType}.fetch:${input.job.data.taskId}`
        : null);
  await input.processors.recordSkippedSuccessor({
    taskId: input.job.data.taskId,
    stage: "poll",
    pollAttempt,
    skipReason: `durable_state_${result.nextAction ?? nextAction}`,
    nextAction,
    successorAssignmentKey: inferredKey,
    now: input.now,
  });
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
      ...generationPriorityJobData(input.job.data),
    },
    {
      ...buildVideoPollJobOptions(input.job.data.taskId, pollAttempt, input.config),
      ...generationPriorityJobOptions(input.job.data),
    },
  );
}

async function enqueueImagePollJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "image";
    modelCode: string | null;
    providerExecutor: string;
  }>,
  pollAttempt: number,
) {
  await input.publisher.add(
    input.config.queues.pollImage,
    "generation.image.poll",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "image",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      pollAttempt,
      ...generationPriorityJobData(input.job.data),
    },
    {
      ...buildImagePollJobOptions(input.job.data.taskId, pollAttempt, input.config),
      ...generationPriorityJobOptions(input.job.data),
    },
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
  const retrySequence = nextRetrySequence(input.job.data);
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
      retrySequence,
      ...generationPriorityJobData(input.job.data),
    },
    {
      jobId: buildGenerationBullMQJobId(
        "generation.video.submit.retry",
        input.job.data.taskId,
        retrySequence,
      ),
      delay: Math.max(0, Math.floor(retryAfterMs)),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.submit.attempts,
      backoff: {
        type: "exponential",
        delay: input.config.retry.submit.backoffMs,
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
  const retrySequence = nextRetrySequence(input.job.data);
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
      retrySequence,
      ...generationPriorityJobData(input.job.data),
    },
    {
      jobId: buildGenerationBullMQJobId(
        "generation.image.submit.retry",
        input.job.data.taskId,
        retrySequence,
      ),
      delay: Math.max(0, Math.floor(retryAfterMs)),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.submit.attempts,
      backoff: {
        type: "exponential",
        delay: input.config.retry.submit.backoffMs,
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
  );
}

async function enqueueAudioSubmitRetryJob(
  input: GenerationWorkerHandlerInput<{
    taskId: string;
    workflowId: string;
    mediaType: "audio";
    modelCode: string | null;
    providerExecutor: string;
    outboxEventId?: string;
  }>,
  retryAfterMs: number,
) {
  const retrySequence = nextRetrySequence(input.job.data);
  await input.publisher.add(
    input.config.queues.submitImage,
    "generation.audio.submit.retry",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "audio",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      outboxEventId: input.job.data.outboxEventId,
      retrySequence,
      ...generationPriorityJobData(input.job.data),
    },
    {
      jobId: buildGenerationBullMQJobId(
        "generation.audio.submit.retry",
        input.job.data.taskId,
        retrySequence,
      ),
      delay: Math.max(0, Math.floor(retryAfterMs)),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.submit.attempts,
      backoff: {
        type: "exponential",
        delay: input.config.retry.submit.backoffMs,
      },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
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
  const jobData = {
    taskId: input.job.data.taskId,
    workflowId: input.job.data.workflowId,
    mediaType: "video",
    modelCode: input.job.data.modelCode,
    providerExecutor: input.job.data.providerExecutor,
    artifactKind: "video",
    artifactStage: "fetch" as const,
    ...generationPriorityJobData(input.job.data),
  };

  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.video.finalize",
    jobData,
    {
      jobId: buildGenerationBullMQJobId("generation.video.finalize", input.job.data.taskId),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.finalize.attempts,
      backoff: {
        type: "exponential",
        delay: input.config.retry.finalize.backoffMs,
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
  const jobData = {
    taskId: input.job.data.taskId,
    workflowId: input.job.data.workflowId,
    mediaType: "image",
    modelCode: input.job.data.modelCode,
    providerExecutor: input.job.data.providerExecutor,
    artifactKind: "image",
    artifactStage: "fetch" as const,
    ...generationPriorityJobData(input.job.data),
  };

  await input.publisher.add(
    input.config.queues.finalizeArtifact,
    "generation.image.finalize",
    jobData,
    {
      jobId: buildGenerationBullMQJobId("generation.image.finalize", input.job.data.taskId),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.finalize.attempts,
      backoff: {
        type: "exponential",
        delay: input.config.retry.finalize.backoffMs,
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
    input.config.queues.pollAudio,
    "generation.audio.poll",
    {
      taskId: input.job.data.taskId,
      workflowId: input.job.data.workflowId,
      mediaType: "audio",
      modelCode: input.job.data.modelCode,
      providerExecutor: input.job.data.providerExecutor,
      pollAttempt,
      ...generationPriorityJobData(input.job.data),
    },
    {
      ...buildAudioPollJobOptions(input.job.data.taskId, pollAttempt, input.config),
      jobId: buildGenerationBullMQJobId("generation.audio.poll", input.job.data.taskId, pollAttempt),
      ...generationPriorityJobOptions(input.job.data),
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
      artifactStage: "fetch" as const,
      ...generationPriorityJobData(input.job.data),
    },
    {
      jobId: buildGenerationBullMQJobId("generation.audio.finalize", input.job.data.taskId),
      ...generationPriorityJobOptions(input.job.data),
      attempts: input.config.retry.finalize.attempts,
      backoff: {
        type: "exponential",
        delay: input.config.retry.finalize.backoffMs,
      },
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
    attempts: config.retry.poll.attempts,
    backoff: {
      type: "exponential",
      delay: config.retry.poll.backoffMs,
    },
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

function buildImagePollJobOptions(
  taskId: string,
  pollAttempt: number,
  config: GenerationQueueConfig,
): JobsOptions {
  return {
    jobId: buildGenerationBullMQJobId("generation.image.poll", taskId, pollAttempt),
    delay: config.poll.image.intervalMs,
    attempts: config.retry.poll.attempts,
    backoff: {
      type: "exponential",
      delay: config.retry.poll.backoffMs,
    },
    removeOnComplete: { age: 86400, count: 10000 },
    removeOnFail: { age: 604800, count: 50000 },
  };
}

function buildAudioPollJobOptions(
  taskId: string,
  pollAttempt: number,
  config: GenerationQueueConfig,
): JobsOptions {
  return {
    jobId: buildGenerationBullMQJobId("generation.audio.poll", taskId, pollAttempt),
    delay: config.poll.audio.intervalMs,
    attempts: config.retry.poll.attempts,
    backoff: {
      type: "exponential",
      delay: config.retry.poll.backoffMs,
    },
    removeOnComplete: { age: 86400, count: 10000 },
    removeOnFail: { age: 604800, count: 50000 },
  };
}

function throwIfRetryableArtifactTransferFailure(failureCode: string) {
  if (
    failureCode === "provider_output_download_failed"
    || failureCode === "provider_output_upload_failed"
  ) {
    throw new Error(failureCode);
  }
}

function generationPriorityJobData(value: unknown) {
  const data = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const providerRouteIdentity = readOptionalJobText(data.providerRouteIdentity);
  const providerConfigRevisionId = readOptionalJobText(data.providerConfigRevisionId);
  const credentialVersionRef = readOptionalJobText(data.credentialVersionRef);
  const routeSnapshot = {
    ...(providerRouteIdentity ? { providerRouteIdentity } : {}),
    ...(providerConfigRevisionId ? { providerConfigRevisionId } : {}),
    ...(credentialVersionRef ? { credentialVersionRef } : {}),
  };
  if (data.membershipPriority !== true) {
    return routeSnapshot;
  }
  const queuePriority = readGenerationQueuePriority(data.queuePriority);
  const priorityReason = typeof data.priorityReason === "string" ? data.priorityReason.trim() : "";
  return {
    ...routeSnapshot,
    membershipPriority: true,
    ...(queuePriority === undefined ? {} : { queuePriority }),
    ...(priorityReason ? { priorityReason } : {}),
  };
}

function readOptionalJobText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function generationPriorityJobOptions(value: unknown): Pick<JobsOptions, "priority"> {
  const data = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  if (data.membershipPriority !== true) {
    return {};
  }
  const queuePriority = readGenerationQueuePriority(data.queuePriority);
  return queuePriority === undefined ? {} : { priority: queuePriority };
}

function readGenerationQueuePriority(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

function nextRetrySequence(value: unknown) {
  const data = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const current = Number(data.retrySequence);
  return Number.isInteger(current) && current >= 1 ? current + 1 : 1;
}
