import { Queue } from "bullmq";

import type { GenerationQueueConfig } from "./generation-queue.config.ts";

export type GenerationQueueJobAction = "retry" | "promote" | "remove";

type GenerationQueueJobOpsError =
  | "generation_queue_not_allowed"
  | "generation_queue_job_action_invalid"
  | "generation_queue_job_not_found"
  | "generation_queue_job_state_mismatch"
  | "generation_queue_job_action_unsupported";

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
}

export type GenerationQueueJobOpsService = ReturnType<typeof createGenerationQueueJobOpsService>;

export function createGenerationQueueJobOpsService(
  deps: GenerationQueueJobOpsServiceDeps,
) {
  const allowedQueues = new Set(configuredQueueNames(deps.config));

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
      if (!allowedQueues.has(queueName)) {
        return { status: 400, body: { error: "generation_queue_not_allowed" } };
      }
      if (!isGenerationQueueJobAction(input.action)) {
        return { status: 400, body: { error: "generation_queue_job_action_invalid" } };
      }

      const queue = deps.queueFactory(queueName);
      try {
        const job = await queue.getJob(jobId);
        if (!job) {
          return { status: 404, body: { error: "generation_queue_job_not_found" } };
        }

        const state = await job.getState();
        const stateError = validateActionState(input.action, state);
        if (stateError) {
          return {
            status: 409,
            body: {
              error: "generation_queue_job_state_mismatch",
              state,
            },
          };
        }

        if (input.action === "retry") {
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
  return action === "retry" || action === "promote" || action === "remove";
}

export function createBullMQGenerationQueueJobOpsService(config: GenerationQueueConfig) {
  return createGenerationQueueJobOpsService({
    config,
    queueFactory: (queueName) =>
      new Queue(queueName, {
        connection: redisConnectionFromUrl(config.redisUrl),
        prefix: config.queuePrefix,
      }) as unknown as GenerationQueueOpsClient,
  });
}

function validateActionState(action: GenerationQueueJobAction, state: string) {
  if (action === "retry") {
    return state === "failed" ? null : "generation_queue_job_state_mismatch";
  }
  if (action === "promote") {
    return state === "delayed" ? null : "generation_queue_job_state_mismatch";
  }
  return state === "active" ? "generation_queue_job_state_mismatch" : null;
}

function configuredQueueNames(config: GenerationQueueConfig) {
  return [
    config.queues.submitImage,
    config.queues.submitVideo,
    config.queues.pollVideo,
    config.queues.finalizeArtifact,
    config.queues.deadLetter,
  ];
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
