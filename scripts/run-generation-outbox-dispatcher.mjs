import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Redis from "ioredis";

import { connectPostgresClientWithRetry } from "./postgres-startup-retry.mjs";
import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";

loadDotEnvFile(join(process.cwd(), ".env"));
if (process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  runRuntimeSchemaMigrations({ runtime: process.execPath, cwd: process.cwd(), env: process.env });
}

const [
  { createDevDb, runWithDatabaseContext },
  { createBullMQGenerationPublisher },
  { dispatchGenerationOutboxBatch },
  { markGenerationQueueStagePublished, reserveGenerationQueueStageForPublish },
  { loadGenerationQueueConfig },
  { createGenerationOutboxWakeSignal, generationOutboxWakeChannel },
  { generationOutboxDispatcherHeartbeatKey, generationOutboxDispatcherHeartbeatTtlMs },
] = await Promise.all([
    import("../apps/backend/src/modules/shared/db/dev-db.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-bullmq.publisher.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-outbox.dispatcher.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue-shard.store.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue.config.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-outbox-wakeup.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-outbox-heartbeat.ts"),
  ]);

const config = loadGenerationQueueConfig(process.env);
const db = await createDevDb();
const publisher = createBullMQGenerationPublisher(config);
const wakeSignal = createGenerationOutboxWakeSignal();
const heartbeatRedis = new Redis(redisConnectionFromUrl(config.redisUrl));
const heartbeatKey = generationOutboxDispatcherHeartbeatKey(config.queuePrefix);
const heartbeatTtlMs = generationOutboxDispatcherHeartbeatTtlMs(
  config.outbox.dispatchIntervalMs,
);
const notificationClient = await connectPostgresClientWithRetry({
  connectionString: process.env.DATABASE_URL,
  env: process.env,
  envKey: "DATABASE_URL",
  serviceName: "generation-outbox",
});
let stopping = false;
let lastCompletedLoopAt = Date.now();
const stallTimeoutMs = Math.max(120_000, heartbeatTtlMs * 2);
const watchdog = setInterval(() => {
  if (!stopping && Date.now() - lastCompletedLoopAt > stallTimeoutMs) {
    console.error(
      `[generation-outbox] Dispatcher stalled for more than ${stallTimeoutMs}ms; exiting for supervisor restart.`,
    );
    process.exit(1);
  }
}, Math.min(5_000, Math.max(1_000, Math.floor(stallTimeoutMs / 4))));
watchdog.unref();
heartbeatRedis.on("error", (error) => {
  console.error(`[generation-outbox] Redis heartbeat failed for REDIS_URL: ${error instanceof Error ? error.message : String(error)}`);
});
notificationClient.on("error", (error) => {
  console.error(`[generation-outbox] PostgreSQL LISTEN failed for DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`);
  stopping = true;
  wakeSignal.close();
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => requestStop(signal));
}
process.on("message", (message) => {
  if (message?.type === "creator-dev-stop") requestStop(message.signal ?? "SIGTERM");
});

function requestStop(signal) {
  if (stopping) return;
  stopping = true;
  wakeSignal.close();
  console.info(`[generation-outbox] Received ${signal}, draining current batch...`);
}

try {
  await notificationClient.query(`LISTEN ${generationOutboxWakeChannel}`);
  await writeDispatcherHeartbeat();
  notificationClient.on("notification", (message) => {
    if (message.channel === generationOutboxWakeChannel) wakeSignal.notify();
  });
  console.info(
    `[generation-outbox] Dispatcher started. batch=${config.outbox.dispatchBatchSize} intervalMs=${config.outbox.dispatchIntervalMs}`,
  );
  while (!stopping) {
    const startedAt = Date.now();
    const result = await runWithDatabaseContext(async () => {
      const now = new Date();
      return dispatchGenerationOutboxBatch(db, {
        now,
        limit: config.outbox.dispatchBatchSize,
        retryDelayMs: config.outbox.retryDelayMs,
        config,
        publisher,
        shardStore: {
          reserve: (database, assignment) => reserveGenerationQueueStageForPublish(database, assignment),
          markPublished: (database, assignment) => markGenerationQueueStagePublished(database, assignment),
        },
      });
    });
    await writeDispatcherHeartbeat();
    lastCompletedLoopAt = Date.now();

    if (result.processedEventIds.length || result.failedEventIds.length) {
      console.info(
        `[generation-outbox] processed=${result.processedEventIds.length} failed=${result.failedEventIds.length}`,
      );
    }

    const elapsedMs = Date.now() - startedAt;
    await wakeSignal.wait(Math.max(0, config.outbox.dispatchIntervalMs - elapsedMs));
  }
} finally {
  clearInterval(watchdog);
  wakeSignal.close();
  heartbeatRedis.disconnect();
  await Promise.allSettled([
    notificationClient.query(`UNLISTEN ${generationOutboxWakeChannel}`).catch(() => undefined),
    publisher.close(),
    db.close(),
  ]);
  await notificationClient.end().catch(() => undefined);
  console.info("[generation-outbox] Dispatcher stopped.");
}

async function writeDispatcherHeartbeat() {
  await heartbeatRedis.set(
    heartbeatKey,
    new Date().toISOString(),
    "PX",
    heartbeatTtlMs,
  );
}

function redisConnectionFromUrl(redisUrl) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: decodeURIComponent(url.username || ""),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    connectTimeout: 2_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => attempt <= 3 ? Math.min(attempt * 500, 1_500) : null,
  };
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) {
    return;
  }

  const content = readFileSync(envFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
