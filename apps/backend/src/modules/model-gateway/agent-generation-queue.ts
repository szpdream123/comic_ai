import { createHash } from "node:crypto";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";

// Only tagged Agent media uses these queues. Ordinary generation keeps its
// existing queue names, while old consumers cannot take the new Agent jobs.
export function agentGenerationQueueConfig(config: GenerationQueueConfig, scope: unknown): GenerationQueueConfig {
  if (scope === undefined || scope === null) return config;
  if (typeof scope !== "string" || !/^[a-f0-9]{32}$/.test(scope)) throw new Error("invalid_agent_execution_scope");
  const queueName = (name: string) => {
    const scoped = `agent-${scope}-${name}`;
    return scoped.length <= 200 ? scoped : `agent-${scope}-${createHash("sha256").update(name).digest("hex")}`;
  };
  return {
    ...config,
    queues: { submit: queueName(config.queues.submit), poll: queueName(config.queues.poll), result: queueName(config.queues.result) },
    queueNames: {
      submit: config.queueNames.submit.map(queueName),
      poll: config.queueNames.poll.map(queueName),
      result: config.queueNames.result.map(queueName),
    },
  };
}
