import { Queue, type JobsOptions } from "bullmq";

import type { GenerationQueueConfig } from "./generation-queue.config.ts";

export type GenerationQueueJobAction = "retry" | "promote" | "remove" | "replay";

type GenerationQueueJobOpsError =
  | "generation_queue_not_allowed"
  | "generation_queue_job_action_invalid"
  | "generation_queue_job_not_found"
  | "generation_queue_job_state_mismatch"
  | "generation_queue_job_replay_not_ready"
  | "generation_queue_job_action_unsupported";

export interface GenerationQueueReplayValidationInput {
  sourceQueueName: string;
  sourceJobName: string;
  sourceJobId: string;
  sourceJobData: Record<string, unknown>;
}

export type GenerationQueueReplayValidator = (
  input: GenerationQueueReplayValidationInput,
) => Promise<boolean>;

interface GenerationQueueJobOpsResult {
  queueName: string;
  jobId: string;
  jobName: string;
  action: GenerationQueueJobAction;
  previousState: string;
  attemptsMade: number;
  failedReason: string | null;
  replayedQueueName?: string;
  replayedJobId?: string;
}

interface GenerationQueueJobOpsClient {
  id?: string | number | null;
  name?: string;
  failedReason?: string | null;
  attemptsMade?: number;
  data?: Record<string, unknown>;
  getState(): Promise<string>;
  retry?(state?: "failed" | "completed"): Promise<void>;
  promote?(): Promise<void>;
  remove?(): Promise<void>;
}

interface GenerationQueueOpsClient {
  name: string;
  getJob(jobId: string): Promise<GenerationQueueJobOpsClient | null>;
  add?(name: string, data: Record<string, unknown>, options: JobsOptions): Promise<{ id?: string | number | null }>;
  close(): Promise<void>;
}

interface GenerationQueueJobOpsServiceDeps {
  config: GenerationQueueConfig;
  queueFactory(queueName: string): GenerationQueueOpsClient;
  validateReplay?: GenerationQueueReplayValidator;
  /** Optional shard-directory reader used to authorize dynamically-created queues. */
  queueDiscovery?: () => Promise<string[]>;
}

export type GenerationQueueJobOpsService = ReturnType<typeof createGenerationQueueJobOpsService>;

export function createGenerationQueueJobOpsService(
  deps: GenerationQueueJobOpsServiceDeps,
) {
  const configuredAllowedQueues = new Set(configuredQueueNames(deps.config));

  return {
    async operate(input: {
      queueName: string;
      jobId: string;
      action: GenerationQueueJobAction;
    }): Promise<
      | { status: 200; body: GenerationQueueJobOpsResult }
      | {
          status: 400 | 404 | 409;
          body:
            | { error: Exclude<GenerationQueueJobOpsError, "generation_queue_job_state_mismatch"> }
            | { error: "generation_queue_job_state_mismatch"; state: string };
        }
    > {
      const queueName = input.queueName.trim();
      const jobId = input.jobId.trim();
      if (!isGenerationQueueJobAction(input.action)) {
        return { status: 400, body: { error: "generation_queue_job_action_invalid" } };
      }
      const allowedQueues = await resolveAllowedQueues(deps, configuredAllowedQueues);
      if (!allowedQueues.has(queueName)) {
        return { status: 400, body: { error: "generation_queue_not_allowed" } };
      }

      const queue = deps.queueFactory(queueName);
      try {
        const job = await queue.getJob(jobId);
        if (!job) {
          return { status: 404, body: { error: "generation_queue_job_not_found" } };
        }

        const state = await job.getState();
        const stateError = validateActionState(
          input.action,
          state,
          queueName === deps.config.queues.deadLetter,
        );
        if (stateError) {
          return {
            status: 409,
            body: {
              error: "generation_queue_job_state_mismatch",
              state,
            },
          };
        }

        if (input.action === "replay") {
          const replay = await replayDeadLetterJob({
            deadLetterJob: job,
            deadLetterJobId: jobId,
            deadLetterQueueName: deps.config.queues.deadLetter,
            allowedQueues,
            replayValidationQueues: new Set([
              deps.config.queues.submitImage,
              deps.config.queues.submitVideo,
              deps.config.queues.pollImage,
              deps.config.queues.pollVideo,
              deps.config.queues.pollAudio,
            ]),
            isReplayValidationQueue: (name) => isDynamicGenerationWorkQueue(name),
            queueFactory: deps.queueFactory,
            validateReplay: deps.validateReplay,
          });
          if (!replay.ok) {
            return { status: 409, body: { error: replay.error } };
          }
          return {
            status: 200,
            body: {
              queueName,
              jobId,
              jobName: job.name ?? "",
              action: input.action,
              previousState: state,
              attemptsMade: numberOrZero(job.attemptsMade),
              failedReason: job.failedReason ?? null,
              replayedQueueName: replay.queueName,
              replayedJobId: replay.jobId,
            },
          };
        } else if (input.action === "retry") {
          if (typeof job.retry !== "function") {
            return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
          }
          await job.retry("failed");
        } else if (input.action === "promote") {
          if (typeof job.promote !== "function") {
            return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
          }
          await job.promote();
        } else {
          if (typeof job.remove !== "function") {
            return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
          }
          await job.remove();
        }

        return {
          status: 200,
          body: {
            queueName,
            jobId,
            jobName: job.name ?? "",
            action: input.action,
            previousState: state,
            attemptsMade: numberOrZero(job.attemptsMade),
            failedReason: job.failedReason ?? null,
          },
        };
      } finally {
        await queue.close();
      }
    },
  };
}

function isGenerationQueueJobAction(action: unknown): action is GenerationQueueJobAction {
  return action === "retry" || action === "promote" || action === "remove" || action === "replay";
}

export function createBullMQGenerationQueueJobOpsService(
  config: GenerationQueueConfig,
  validateReplay?: GenerationQueueReplayValidator,
  queueDiscovery?: () => Promise<string[]>,
) {
  return createGenerationQueueJobOpsService({
    config,
    validateReplay,
    queueDiscovery,
    queueFactory: (queueName) =>
      new Queue(queueName, {
        connection: redisConnectionFromUrl(config.redisUrl),
        prefix: config.queuePrefix,
      }) as unknown as GenerationQueueOpsClient,
  });
}

async function resolveAllowedQueues(
  deps: GenerationQueueJobOpsServiceDeps,
  configured: Set<string>,
) {
  if (!deps.queueDiscovery) return configured;
  try {
    const discovered = await deps.queueDiscovery();
    const allowed = new Set(configured);
    for (const queueName of discovered) {
      if (typeof queueName === "string" && queueName.trim()) allowed.add(queueName.trim());
    }
    return allowed;
  } catch {
    return configured;
  }
}

function validateActionState(action: GenerationQueueJobAction, state: string, isDeadLetter: boolean) {
  if (action === "replay") {
    return isDeadLetter && ["waiting", "delayed", "failed"].includes(state)
      ? null
      : "generation_queue_job_state_mismatch";
  }
  if (action === "retry") {
    return state === "failed" ? null : "generation_queue_job_state_mismatch";
  }
  if (action === "promote") {
    return state === "delayed" ? null : "generation_queue_job_state_mismatch";
  }
  return state === "active" ? "generation_queue_job_state_mismatch" : null;
}

async function replayDeadLetterJob(input: {
  deadLetterJob: GenerationQueueJobOpsClient;
  deadLetterJobId: string;
  deadLetterQueueName: string;
  allowedQueues: Set<string>;
  replayValidationQueues: Set<string>;
  isReplayValidationQueue?: (queueName: string) => boolean;
  queueFactory(queueName: string): GenerationQueueOpsClient;
  validateReplay?: GenerationQueueReplayValidator;
}): Promise<
  | { ok: true; queueName: string; jobId: string }
  | {
      ok: false;
      error:
        | "generation_queue_job_action_unsupported"
        | "generation_queue_job_replay_not_ready";
    }
> {
  const data = input.deadLetterJob.data ?? {};
  const sourceQueueName = readString(data.sourceQueueName);
  const sourceJobName = readString(data.sourceJobName);
  const sourceJobId = readString(data.sourceJobId);
  const sourceJobData = readRecord(data.sourceJobData);
  if (
    !sourceQueueName
    || !sourceJobName
    || !sourceJobId
    || !sourceJobData
    || !input.allowedQueues.has(sourceQueueName)
    || sourceQueueName === input.deadLetterQueueName
  ) {
    return { ok: false, error: "generation_queue_job_action_unsupported" };
  }

  if (input.replayValidationQueues.has(sourceQueueName) || input.isReplayValidationQueue?.(sourceQueueName)) {
    const replayAllowed = input.validateReplay
      ? await input.validateReplay({
          sourceQueueName,
          sourceJobName,
          sourceJobId,
          sourceJobData,
        })
      : false;
    if (!replayAllowed) {
      return { ok: false, error: "generation_queue_job_replay_not_ready" };
    }
  }

  const targetQueue = input.queueFactory(sourceQueueName);
  try {
    if (typeof targetQueue.add !== "function" || typeof input.deadLetterJob.remove !== "function") {
      return { ok: false, error: "generation_queue_job_action_unsupported" };
    }
    const replayJobId = `${sourceJobId}__dlq_replay__${replayToken(data.failedAt, input.deadLetterJobId)}`;
    const added = await targetQueue.add(
      sourceJobName,
      sourceJobData,
      {
        ...readReplayOptions(data.sourceJobOptions),
        jobId: replayJobId,
      },
    );
    await input.deadLetterJob.remove();
    return {
      ok: true,
      queueName: sourceQueueName,
      jobId: String(added.id ?? replayJobId),
    };
  } finally {
    await targetQueue.close();
  }
}

function readReplayOptions(value: unknown): JobsOptions {
  const source = readRecord(value) ?? {};
  return {
    attempts: positiveInteger(source.attempts) ?? 1,
    backoff: source.backoff as JobsOptions["backoff"],
    removeOnComplete: source.removeOnComplete as JobsOptions["removeOnComplete"],
    removeOnFail: source.removeOnFail as JobsOptions["removeOnFail"],
    priority: positiveInteger(source.priority),
  };
}

function replayToken(failedAt: unknown, deadLetterJobId: string) {
  return (readString(failedAt) || deadLetterJobId).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function configuredQueueNames(config: GenerationQueueConfig) {
  return [
    config.queues.submitImage,
    config.queues.submitVideo,
    config.queues.pollImage,
    config.queues.pollVideo,
    config.queues.pollAudio,
    config.queues.finalizeArtifact,
    config.queues.deadLetter,
  ];
}

function isDynamicGenerationWorkQueue(queueName: string) {
  // Dynamic names are generated as generation-{media}-{stage}-{route}-{shard}.
  // Keep this intentionally strict so an arbitrary admin queue cannot opt into
  // replay validation merely by sharing a prefix.
  return /^generation-(image|video|audio)-(submit|poll|fetch|persist)-[a-z0-9]+-\d{3}$/.test(queueName);
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
