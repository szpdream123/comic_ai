import { Queue } from "bullmq";

import type { GenerationQueueConfig } from "./generation-queue.config.ts";
import type {
  GenerationQueueAssignmentJobState,
  GenerationQueueAssignmentLiveInspector,
} from "./generation-redis-repair.service.ts";
import type { GenerationQueueJobRemover } from "./generation-queue-cancellation.service.ts";

const liveJobStates = [
  "waiting",
  "active",
  "delayed",
  "prioritized",
  "waiting-children",
  "paused",
];

interface GenerationQueueAssignmentJob {
  data?: Record<string, unknown>;
  getState?(): Promise<string>;
  remove?(): Promise<void>;
}

interface GenerationQueueAssignmentClient {
  getJobs(
    types: string[],
    start: number,
    end: number,
    asc: boolean,
  ): Promise<GenerationQueueAssignmentJob[]>;
  getJob?(jobId: string): Promise<GenerationQueueAssignmentJob | undefined>;
  close(): Promise<void>;
}

export function createBullMQGenerationQueueAssignmentInspector(
  config: GenerationQueueConfig,
  deps: {
    queueFactory?: (queueName: string) => GenerationQueueAssignmentClient;
  } = {},
): GenerationQueueAssignmentLiveInspector & GenerationQueueJobRemover {
  let unavailableUntil = 0;
  const queueFactory = deps.queueFactory ?? ((queueName) => new Queue(queueName, {
    connection: redisConnectionFromUrl(config.redisUrl),
    prefix: config.queuePrefix,
  }) as GenerationQueueAssignmentClient);
  return {
    async listLiveAssignmentKeys(queueName: string) {
      if (Date.now() < unavailableUntil) {
        throw new Error("generation_queue_assignment_inspector_unavailable");
      }
      const queue = queueFactory(queueName);
      try {
        const jobs = await queue.getJobs(liveJobStates, 0, -1, true);
        unavailableUntil = 0;
        return new Set(
          jobs
            .map((job) => readString(job.data?.queueAssignmentKey))
            .filter(Boolean),
        );
      } catch (error) {
        unavailableUntil = Date.now() + 2_000;
        throw error;
      } finally {
        await queue.close();
      }
    },
    async inspectJobState(queueName, jobId) {
      if (Date.now() < unavailableUntil) {
        throw new Error("generation_queue_assignment_inspector_unavailable");
      }
      const queue = queueFactory(queueName);
      try {
        if (typeof queue.getJob !== "function") return "unknown";
        const job = await queue.getJob(jobId);
        if (!job) return "missing";
        const state = typeof job.getState === "function" ? await job.getState() : "unknown";
        unavailableUntil = 0;
        return isAssignmentJobState(state) ? state : "unknown";
      } catch (error) {
        unavailableUntil = Date.now() + 2_000;
        throw error;
      } finally {
        await queue.close();
      }
    },
    async removeJob(queueName, jobId) {
      const queue = queueFactory(queueName);
      try {
        if (typeof queue.getJob !== "function") {
          throw new Error("generation_queue_job_removal_unsupported");
        }
        const job = await queue.getJob(jobId);
        if (!job) return "missing";
        if (typeof job.remove !== "function") {
          throw new Error("generation_queue_job_removal_unsupported");
        }
        await job.remove();
        return "removed";
      } finally {
        await queue.close();
      }
    },
  };
}

function isAssignmentJobState(value: string): value is GenerationQueueAssignmentJobState {
  return [...liveJobStates, "completed", "failed", "unknown", "missing"].includes(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  };
}
