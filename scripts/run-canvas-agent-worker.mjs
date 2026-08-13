import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Worker } from "bullmq";

import { connectPostgresClientWithRetry } from "./postgres-startup-retry.mjs";
import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";

loadDotEnvFile(join(process.cwd(), ".env"));
if (process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  runRuntimeSchemaMigrations({ runtime: process.execPath, cwd: process.cwd(), env: process.env });
}

const [{ createDevDb, runWithDatabaseContext }, {
  CanvasAgentOutboxService,
  assertCanvasAgentQueueName,
  canvasAgentShardQueueName,
  canvasAgentRedisConnectionFromUrl,
  createBullMQCanvasAgentPublisher,
  createCanvasAgentWorkerRuntime,
  createCanvasAgentOutboxWakeSignal,
  canvasAgentOutboxWakeChannel,
  listCanvasAgentShardIds,
  loadCanvasAgentShardConfig,
  loadCanvasAgentRuntimeConfiguration,
}, { loadGenerationQueueConfig }] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/canvas-agent/index.ts"),
  import("../apps/backend/src/modules/model-gateway/generation-queue.config.ts"),
]);

const db = await createDevDb();
const abortController = new AbortController();
const workerId = process.env.CANVAS_AGENT_WORKER_ID?.trim()
  || `canvas-agent:${hostname()}:${process.pid}:${randomUUID()}`;
const queueConfig = loadGenerationQueueConfig(process.env);
const shardConfig = loadCanvasAgentShardConfig(process.env);
const queueName = assertCanvasAgentQueueName(shardConfig.baseQueueName);
const outboxFallbackIntervalMs = positiveInteger(
  process.env.CANVAS_AGENT_OUTBOX_DISPATCH_INTERVAL_MS
    ?? process.env.CANVAS_AGENT_WORKER_POLL_INTERVAL_MS,
  60_000,
);
const maintenanceIntervalMs = positiveInteger(process.env.CANVAS_AGENT_MAINTENANCE_INTERVAL_MS, 60_000);
const fallbackScanIntervalMs = positiveInteger(process.env.CANVAS_AGENT_FALLBACK_SCAN_INTERVAL_MS, 5_000);
const batchSize = positiveInteger(process.env.CANVAS_AGENT_WORKER_BATCH_SIZE, 2);
const outboxBatchSize = positiveInteger(process.env.CANVAS_AGENT_OUTBOX_BATCH_SIZE, 50);
const concurrency = shardConfig.workerConcurrency;
const runtimeConfiguration = await loadCanvasAgentRuntimeConfiguration(db);
const runtime = createCanvasAgentWorkerRuntime({
  db,
  env: process.env,
  workerId,
  policy: runtimeConfiguration.policy,
  webSearchModelCode: runtimeConfiguration.webSearchModelCode,
  maxRounds: runtimeConfiguration.maxRounds,
  maxToolCalls: runtimeConfiguration.maxToolCalls,
});
const publisher = createBullMQCanvasAgentPublisher({
  redisUrl: queueConfig.redisUrl,
  queuePrefix: queueConfig.queuePrefix,
  queueName,
  shardingEnabled: shardConfig.enabled,
});
const outbox = new CanvasAgentOutboxService({ db, publisher, workerId });
const outboxWakeSignal = createCanvasAgentOutboxWakeSignal();
const notificationClient = await connectPostgresClientWithRetry({
  connectionString: process.env.DATABASE_URL,
  env: process.env,
  envKey: "DATABASE_URL",
  serviceName: "canvas-agent",
});
const redisErrorReporter = createRedisErrorReporter();
const executionGate = createConcurrencyGate(shardConfig.workerTotalConcurrency);
const workers = new Map();
await discoverCanvasAgentShardWorkers();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => requestStop(signal));
}
process.on("message", (message) => {
  if (message?.type === "creator-dev-stop") requestStop(message.signal ?? "SIGTERM");
});

function requestStop(signal) {
  if (abortController.signal.aborted) return;
  console.info(`[canvas-agent] Received ${signal}, draining current cycle...`);
  outboxWakeSignal.close();
  abortController.abort();
}

notificationClient.on("error", (error) => {
  console.error(`[canvas-agent] PostgreSQL LISTEN failed for DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`);
  requestStop("PostgreSQL LISTEN error");
});

console.info(
  `[canvas-agent] Worker started. workerId=${workerId} queue=${queueName} shards=${workers.size} `
  + `concurrencyPerShard=${concurrency} capacityPerShard=${shardConfig.shardCapacity} `
  + `totalConcurrency=${shardConfig.workerTotalConcurrency} `
  + `outboxFallbackIntervalMs=${outboxFallbackIntervalMs} maintenanceIntervalMs=${maintenanceIntervalMs} `
  + `fallbackScanIntervalMs=${fallbackScanIntervalMs}`,
);
let scheduledLoops = [];
try {
  await notificationClient.query(`LISTEN ${canvasAgentOutboxWakeChannel}`);
  notificationClient.on("notification", (message) => {
    if (message.channel === canvasAgentOutboxWakeChannel) outboxWakeSignal.notify();
  });
  scheduledLoops = [
    runCanvasAgentOutboxDispatchLoop(),
    ...(shardConfig.enabled ? [runScheduledLoop({
      signal: abortController.signal,
      intervalMs: shardConfig.discoveryIntervalMs,
      run: discoverCanvasAgentShardWorkers,
    })] : []),
    runScheduledLoop({
      signal: abortController.signal,
      intervalMs: maintenanceIntervalMs,
      run: () => runWithDatabaseContext(async () => {
        const result = await runtime.worker.runMaintenanceOnce(batchSize);
        if (result.inspected || result.repaired) {
          console.info(`[canvas-agent] maintenance inspected=${result.inspected} repaired=${result.repaired}`);
        }
      }),
    }),
    runScheduledLoop({
      signal: abortController.signal,
      intervalMs: fallbackScanIntervalMs,
      run: () => runWithDatabaseContext(async () => {
        const processed = await runtime.worker.runQueuedOnce(batchSize);
        if (processed.length) {
          console.info(`[canvas-agent] fallback processed=${processed.length}`);
        }
      }),
    }),
  ];
  await Promise.all(scheduledLoops);
} catch (error) {
  abortController.abort(error);
  await Promise.allSettled(scheduledLoops);
  throw error;
} finally {
  outboxWakeSignal.close();
  await Promise.allSettled([
    ...[...workers.values()].map((worker) => worker.close()),
    notificationClient.query(`UNLISTEN ${canvasAgentOutboxWakeChannel}`).catch(() => undefined),
    publisher.close(),
  ]);
  await notificationClient.end().catch(() => undefined);
  await db.close();
  console.info("[canvas-agent] Worker stopped.");
}

async function runCanvasAgentOutboxDispatchLoop() {
  while (!abortController.signal.aborted) {
    const startedAt = Date.now();
    const result = await runWithDatabaseContext(async () => {
      await outbox.releaseStaleLocks();
      return outbox.dispatchBatch(outboxBatchSize);
    });
    if (result.claimed || result.dispatched) {
      console.info(`[canvas-agent] outbox claimed=${result.claimed} dispatched=${result.dispatched}`);
    }
    if (abortController.signal.aborted) break;
    const retryDelayMs = result.nextRetryAt
      ? Math.max(0, result.nextRetryAt.getTime() - Date.now())
      : outboxFallbackIntervalMs;
    await outboxWakeSignal.wait(Math.min(
      Math.max(0, outboxFallbackIntervalMs - (Date.now() - startedAt)),
      retryDelayMs,
    ));
  }
}

async function discoverCanvasAgentShardWorkers() {
  const shardIds = shardConfig.enabled
    ? await listCanvasAgentShardIds(db)
    : [0];
  const desiredShardIds = new Set(shardIds);
  for (const [shardId, worker] of workers) {
    if (shardId === 0 || desiredShardIds.has(shardId)) continue;
    await worker.close();
    workers.delete(shardId);
    console.info(`[canvas-agent] Stopped idle shard=${shardId}`);
  }
  for (const shardId of shardIds) {
    if (workers.has(shardId)) continue;
    const shardQueueName = assertCanvasAgentQueueName(
      canvasAgentShardQueueName(queueName, shardId, shardConfig.enabled),
    );
    const worker = new Worker(
      shardQueueName,
      async (job) => {
        const taskId = readTaskId(job.data?.taskId);
        const result = await executionGate.run(() => runWithDatabaseContext(() => runtime.worker.processTask(taskId)));
        if (result.status === "queued") throw new Error("canvas_agent_task_deferred");
        return result;
      },
      {
        connection: canvasAgentRedisConnectionFromUrl(queueConfig.redisUrl),
        prefix: queueConfig.queuePrefix,
        concurrency,
      },
    );
    worker.on("error", redisErrorReporter);
    worker.on("ready", redisErrorReporter.reset);
    workers.set(shardId, worker);
    console.info(`[canvas-agent] Listening shard=${shardId} queue=${shardQueueName} concurrency=${concurrency}`);
  }
}

function createConcurrencyGate(limit) {
  let active = 0;
  const waiting = [];
  return {
    async run(run) {
      if (active >= limit) {
        await new Promise((resolve) => waiting.push(resolve));
      }
      active += 1;
      try {
        return await run();
      } finally {
        active -= 1;
        waiting.shift()?.();
      }
    },
  };
}

async function runScheduledLoop(input) {
  while (!input.signal.aborted) {
    const startedAt = Date.now();
    await input.run();
    if (input.signal.aborted) break;
    try {
      await sleep(
        Math.max(0, input.intervalMs - (Date.now() - startedAt)),
        undefined,
        { signal: input.signal },
      );
    } catch (error) {
      if (error?.name !== "AbortError") throw error;
    }
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readTaskId(value) {
  const taskId = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    throw new Error("canvas_agent_wakeup_task_id_invalid");
  }
  return taskId;
}

function createRedisErrorReporter() {
  const reported = new Set();
  const reporter = (error) => {
    const code = typeof error?.code === "string" ? error.code : "REDIS_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    const key = `${code}:${message}`;
    if (reported.has(key)) return;
    reported.add(key);
    console.error(`[canvas-agent] Redis connection error for REDIS_URL ${code}: ${message}`);
  };
  reporter.reset = () => reported.clear();
  return reporter;
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) return;
  for (const rawLine of readFileSync(envFilePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
