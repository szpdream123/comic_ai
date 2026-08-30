import { Queue } from "bullmq";

import type { GenerationQueueConfig } from "./generation-queue.config.ts";
import type { GenerationQueueJobRemover } from "./generation-queue-cancellation.service.ts";

interface GenerationQueueJob {
  remove?(): Promise<void>;
}

interface GenerationQueueClient {
  getJob(jobId: string): Promise<GenerationQueueJob | undefined>;
  close(): Promise<void>;
}

export function createBullMQGenerationQueueJobRemover(
  config: GenerationQueueConfig,
  deps: { queueFactory?: (queueName: string) => GenerationQueueClient } = {},
): GenerationQueueJobRemover {
  const queueFactory = deps.queueFactory ?? ((queueName) => new Queue(queueName, {
    connection: redisConnectionFromUrl(config.redisUrl),
    prefix: config.queuePrefix,
  }) as GenerationQueueClient);
  return {
    async removeJob(queueName, jobId) {
      const queue = queueFactory(queueName);
      try {
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
