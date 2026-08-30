import { createHash } from "node:crypto";

import { Queue } from "bullmq";

import type { CanvasAgentWakeupPublisher } from "./canvas-agent-outbox.service.ts";
import { canvasAgentShardQueueName } from "./canvas-agent-shard.config.ts";

export interface CanvasAgentBullMQConfig {
  redisUrl: string;
  queuePrefix: string;
  queueName: string;
  shardingEnabled?: boolean;
}

export const CANVAS_AGENT_WAKEUP_RETRY_OPTIONS = Object.freeze({
  attempts: 300,
  backoff: { type: "fixed" as const, delay: 1_000 },
});

export function createBullMQCanvasAgentPublisher(
  config: CanvasAgentBullMQConfig,
): CanvasAgentWakeupPublisher & { close(): Promise<void> } {
  assertCanvasAgentQueueName(config.queueName);
  const queues = new Map<number, Queue>();
  const reportedErrors = new Set<string>();
  const reportError = (error: Error) => {
    const code = typeof (error as { code?: unknown })?.code === "string"
      ? String((error as { code: string }).code)
      : "REDIS_ERROR";
    const key = `${code}:${error.message}`;
    if (reportedErrors.has(key)) return;
    reportedErrors.add(key);
    console.error(`[canvas-agent] Redis publisher error for REDIS_URL ${code}: ${error.message}`);
  };

  const queueForShard = (shardId: number) => {
    const key = config.shardingEnabled === false ? 0 : shardId;
    const existing = queues.get(key);
    if (existing) return existing;
    const queueName = canvasAgentShardQueueName(config.queueName, shardId, config.shardingEnabled !== false);
    assertCanvasAgentQueueName(queueName);
    const queue = new Queue(queueName, {
      connection: canvasAgentRedisConnectionFromUrl(config.redisUrl),
      prefix: config.queuePrefix,
    });
    queue.on("error", reportError);
    queues.set(key, queue);
    return queue;
  };

  return {
    async publish(input) {
      await queueForShard(input.shardId).add(
        "canvas.agent.task.wakeup",
        input,
        {
          jobId: canvasAgentWakeupJobId(input.eventKey),
          ...CANVAS_AGENT_WAKEUP_RETRY_OPTIONS,
          removeOnComplete: { age: 86_400, count: 10_000 },
          removeOnFail: { age: 604_800, count: 50_000 },
        },
      );
    },
    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()));
    },
  };
}

export function canvasAgentWakeupJobId(eventKey: string) {
  return `canvas-agent-wakeup-${createHash("sha256").update(eventKey).digest("hex")}`;
}

export function assertCanvasAgentQueueName(queueName: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,199}$/.test(queueName)) {
    throw new Error(`invalid_canvas_agent_queue_name:${queueName}`);
  }
  return queueName;
}

export function canvasAgentRedisConnectionFromUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: decodeURIComponent(url.username || ""),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    keepAlive: 30_000,
  };
}
