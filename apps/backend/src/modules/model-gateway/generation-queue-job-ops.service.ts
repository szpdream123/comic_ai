import { Queue, type JobsOptions } from "bullmq";

import type { GenerationQueueConfig } from "./generation-queue.config.ts";

export type GenerationQueueJobAction = "retry" | "promote" | "remove" | "replay";

type GenerationQueueJobOpsError =
  | "generation_queue_not_allowed"
  | "generation_queue_job_action_invalid"
  | "generation_queue_job_not_found"
  | "generation_queue_job_state_mismatch"
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

export interface GenerationQueueJobOperationCheckpoint {
  source?: {
    queueName: string;
    jobId: string;
    jobName: string;
    state: string;
    attemptsMade: number;
    failedReason: string | null;
    data: Record<string, unknown>;
    options: Record<string, unknown>;
  };
  sourceRemoved?: boolean;
  actionApplied?: boolean;
}

export interface GenerationQueueJobOperationJournal {
  load(): Promise<GenerationQueueJobOperationCheckpoint>;
  save(checkpoint: GenerationQueueJobOperationCheckpoint): Promise<void>;
}

interface GenerationQueueJobOpsResult {
  queueName: string;
  jobId: string;
  jobName: string;
  action: GenerationQueueJobAction;
  previousState: string;
  attemptsMade: number;
  failedReason: string | null;
}

interface GenerationQueueJobOpsClient {
  id?: string | number | null;
  name?: string;
  failedReason?: string | null;
  attemptsMade?: number;
  data?: Record<string, unknown>;
  opts?: JobsOptions;
  getState(): Promise<string>;
  retry?(state?: "failed" | "completed"): Promise<void>;
  promote?(): Promise<void>;
  remove?(): Promise<void>;
}

interface GenerationQueueOpsClient {
  name: string;
  getJob(jobId: string): Promise<GenerationQueueJobOpsClient | null>;
  close(): Promise<void>;
}

interface GenerationQueueJobOpsServiceDeps {
  config: GenerationQueueConfig;
  queueFactory(queueName: string): GenerationQueueOpsClient;
  validateReplay?: GenerationQueueReplayValidator;
}

export type GenerationQueueJobOpsService = ReturnType<typeof createGenerationQueueJobOpsService>;

export function createGenerationQueueJobOpsService(deps: GenerationQueueJobOpsServiceDeps) {
  const allowedQueues = new Set(configuredQueueNames(deps.config));

  return {
    async operate(input: {
      queueName: string;
      jobId: string;
      action: GenerationQueueJobAction;
      journal?: GenerationQueueJobOperationJournal;
    }): Promise<
      | { status: 200; body: GenerationQueueJobOpsResult }
      | { status: 400 | 404 | 409; body: { error: GenerationQueueJobOpsError; state?: string } }
    > {
      const queueName = input.queueName.trim();
      const jobId = input.jobId.trim();
      if (!isGenerationQueueJobAction(input.action)) {
        return { status: 400, body: { error: "generation_queue_job_action_invalid" } };
      }
      if (!allowedQueues.has(queueName)) {
        return { status: 400, body: { error: "generation_queue_not_allowed" } };
      }
      if (input.action === "replay") {
        return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
      }

      let checkpoint = input.journal ? await input.journal.load() : {};
      const saveCheckpoint = async (next: GenerationQueueJobOperationCheckpoint) => {
        checkpoint = next;
        await input.journal?.save(next);
      };
      const queue = deps.queueFactory(queueName);
      try {
        let job = await queue.getJob(jobId);
        if (!job && !checkpoint.source) {
          return { status: 404, body: { error: "generation_queue_job_not_found" } };
        }
        let state = checkpoint.source?.state ?? "unknown";
        let currentState: string | null = null;
        if (job) {
          currentState = await job.getState();
          state = checkpoint.source?.state ?? currentState;
          if (!checkpoint.source) {
            const stateError = validateActionState(input.action, currentState);
            if (stateError) {
              return { status: 409, body: { error: stateError, state: currentState } };
            }
            await saveCheckpoint({ ...checkpoint, source: snapshotSourceJob(queueName, jobId, currentState, job) });
          }
        } else {
          job = sourceJobFromCheckpoint(checkpoint.source!);
        }

        if (input.action === "retry") {
          if (!checkpoint.actionApplied && checkpoint.source && currentState !== "failed") {
            await saveCheckpoint({ ...checkpoint, actionApplied: true });
          }
          if (!checkpoint.actionApplied) {
            if (typeof job.retry !== "function") {
              return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
            }
            await job.retry("failed");
            await saveCheckpoint({ ...checkpoint, actionApplied: true });
          }
        } else if (input.action === "promote") {
          if (!checkpoint.actionApplied && checkpoint.source && currentState !== "delayed") {
            await saveCheckpoint({ ...checkpoint, actionApplied: true });
          }
          if (!checkpoint.actionApplied) {
            if (typeof job.promote !== "function") {
              return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
            }
            await job.promote();
            await saveCheckpoint({ ...checkpoint, actionApplied: true });
          }
        } else {
          if (typeof job.remove !== "function") {
            return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
          }
          if (!checkpoint.sourceRemoved) {
            await job.remove();
            await saveCheckpoint({ ...checkpoint, sourceRemoved: true });
          }
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

export function createBullMQGenerationQueueJobOpsService(
  config: GenerationQueueConfig,
  validateReplay?: GenerationQueueReplayValidator,
) {
  return createGenerationQueueJobOpsService({
    config,
    validateReplay,
    queueFactory: (queueName) => new Queue(queueName, {
      connection: redisConnectionFromUrl(config.redisUrl),
      prefix: config.queuePrefix,
    }) as unknown as GenerationQueueOpsClient,
  });
}

function isGenerationQueueJobAction(action: unknown): action is GenerationQueueJobAction {
  return action === "retry" || action === "promote" || action === "remove" || action === "replay";
}

function validateActionState(action: Exclude<GenerationQueueJobAction, "replay">, state: string) {
  if (action === "retry") return state === "failed" ? null : "generation_queue_job_state_mismatch";
  if (action === "promote") return state === "delayed" ? null : "generation_queue_job_state_mismatch";
  return state === "active" ? "generation_queue_job_state_mismatch" : null;
}

function snapshotSourceJob(queueName: string, jobId: string, state: string, job: GenerationQueueJobOpsClient) {
  return {
    queueName,
    jobId,
    jobName: job.name ?? "",
    state,
    attemptsMade: numberOrZero(job.attemptsMade),
    failedReason: job.failedReason ?? null,
    data: job.data ?? {},
    options: readRecord(job.opts) ?? {},
  };
}

function sourceJobFromCheckpoint(source: NonNullable<GenerationQueueJobOperationCheckpoint["source"]>): GenerationQueueJobOpsClient {
  return {
    id: source.jobId,
    name: source.jobName,
    attemptsMade: source.attemptsMade,
    failedReason: source.failedReason,
    data: source.data,
    opts: source.options as JobsOptions,
    async getState() { return source.state; },
    async remove() {},
  };
}

function configuredQueueNames(config: GenerationQueueConfig) {
  return [...config.queueNames.submit, ...config.queueNames.poll, ...config.queueNames.result];
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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
    connectTimeout: 2_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt: number) => Math.min(attempt * 100, 1_000),
  };
}
