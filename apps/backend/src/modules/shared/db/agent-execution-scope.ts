import { createHash } from "node:crypto";
import { loadGenerationQueueConfig } from "../../model-gateway/generation-queue.config.ts";
import { resolveWorkerIsolationConfig } from "../../model-gateway/worker-isolation.config.ts";

// Version the dispatch contract, not the machine: API and workers may run on
// different hosts, but must share the same configured queue and environment.
export const AGENT_EXECUTION_PROTOCOL = "agent-dispatch-v1";

export function agentExecutionMetadata(env: NodeJS.ProcessEnv = process.env) {
  const workerEnvironment = resolveWorkerIsolationConfig(env).workerEnvironment;
  const queue = loadGenerationQueueConfig(env);
  const redis = new URL(queue.redisUrl);
  const identity = [
    AGENT_EXECUTION_PROTOCOL, workerEnvironment,
    redis.protocol, redis.hostname.toLowerCase(), redis.port || "6379",
    redis.pathname.replace(/^\//, "") || "0", queue.queuePrefix,
    env.CANVAS_AGENT_EXECUTION_SCOPE?.trim() || "default",
  ];
  return {
    workerEnvironment,
    agentExecutionScope: createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32),
    agentExecutionProtocol: AGENT_EXECUTION_PROTOCOL,
  };
}

export function agentExecutionDatabaseOptions(env: NodeJS.ProcessEnv = process.env) {
  return `-c comic_ai.agent_execution_scope=${agentExecutionMetadata(env).agentExecutionScope}`;
}

export function agentExecutionDatabaseUrl(connectionString: string, env: NodeJS.ProcessEnv = process.env) {
  const url = new URL(connectionString);
  // pg gives URL options precedence over Pool options. Preserve configured
  // startup settings and append our identity in the URL itself on every client.
  const configuredOptions = url.searchParams.get("options") ?? env.PGOPTIONS ?? "";
  url.searchParams.set("options", `${configuredOptions} ${agentExecutionDatabaseOptions(env)}`.trim());
  return url.toString();
}

// Strict discovery: unknown historical ownership must not be guessed. Database
// fences separately preserve the behavior of untagged tasks for old runtimes.
export function agentExecutionScopePredicate(taskAlias: string) {
  if (!/^[a-z_]+$/.test(taskAlias)) throw new Error("invalid_task_alias");
  return `${taskAlias}.input_snapshot_json->>'agentExecutionScope' = current_setting('comic_ai.agent_execution_scope', true)`;
}
