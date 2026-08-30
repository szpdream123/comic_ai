export interface CanvasAgentShardConfig {
  enabled: boolean;
  baseQueueName: string;
  shardCapacity: number;
  maxActiveShards: number;
  workerConcurrency: number;
  workerTotalConcurrency: number;
  discoveryIntervalMs: number;
}

export function loadCanvasAgentShardConfig(env: NodeJS.ProcessEnv): CanvasAgentShardConfig {
  const maxShardCount = readInteger(env, "CANVAS_AGENT_SHARD_COUNT", 16, 1, 16);
  const configuredMaxActiveShards = readInteger(
    env,
    "CANVAS_AGENT_MAX_ACTIVE_SHARDS",
    maxShardCount,
    1,
    16,
  );
  return {
    enabled: readBoolean(env, "CANVAS_AGENT_SHARDING_ENABLED", false),
    baseQueueName: readQueueName(env.CANVAS_AGENT_QUEUE_NAME?.trim() || "canvas-agent"),
    shardCapacity: readInteger(env, "CANVAS_AGENT_SHARD_CAPACITY", 100, 1, 100_000),
    maxActiveShards: Math.min(maxShardCount, configuredMaxActiveShards),
    workerConcurrency: readInteger(env, "CANVAS_AGENT_WORKER_CONCURRENCY", 20, 1, 1_000),
    workerTotalConcurrency: readInteger(env, "CANVAS_AGENT_WORKER_TOTAL_CONCURRENCY", 320, 1, 10_000),
    discoveryIntervalMs: readInteger(env, "CANVAS_AGENT_SHARD_DISCOVERY_INTERVAL_MS", 10_000, 1_000, 600_000),
  };
}

export function canvasAgentShardQueueName(baseQueueName: string, shardId: number, enabled = true) {
  readQueueName(baseQueueName);
  if (!enabled) return baseQueueName;
  if (!Number.isSafeInteger(shardId) || shardId < 0 || shardId > 1_023) {
    throw new Error(`invalid_canvas_agent_shard_id:${shardId}`);
  }
  return `${baseQueueName}-shard-${String(shardId).padStart(3, "0")}`;
}

function readBoolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean) {
  const rawValue = env[key];
  if (rawValue === undefined) return fallback;
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${key} must be true or false`);
}

function readInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const rawValue = env[key];
  if (rawValue === undefined) return fallback;
  const normalized = rawValue.trim();
  const value = Number(normalized);
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function readQueueName(queueName: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,199}$/.test(queueName)) {
    throw new Error(`invalid_canvas_agent_queue_name:${queueName}`);
  }
  return queueName;
}
