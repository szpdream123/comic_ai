import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

loadDotEnvFile(join(process.cwd(), ".env"));

const [
  { createDevDb, runWithDatabaseContext },
  { createBullMQGenerationPublisher },
  { dispatchGenerationOutboxBatch },
  { assignGenerationQueueStage },
  { loadGenerationQueueConfig },
  { createGenerationOutboxWakeSignal, generationOutboxWakeChannel },
] = await Promise.all([
    import("../apps/backend/src/modules/shared/db/dev-db.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-bullmq.publisher.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-outbox.dispatcher.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue-shard.store.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue.config.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-outbox-wakeup.ts"),
  ]);

const config = loadGenerationQueueConfig(process.env);
const db = await createDevDb();
const publisher = createBullMQGenerationPublisher(config);
const wakeSignal = createGenerationOutboxWakeSignal();
const notificationClient = new Client({ connectionString: process.env.DATABASE_URL });
await notificationClient.connect();
await notificationClient.query(`LISTEN ${generationOutboxWakeChannel}`);
notificationClient.on("notification", (message) => {
  if (message.channel === generationOutboxWakeChannel) wakeSignal.notify();
});
let stopping = false;
notificationClient.on("error", (error) => {
  console.error(`[generation-outbox] PostgreSQL LISTEN failed for DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`);
  stopping = true;
  wakeSignal.close();
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopping = true;
    wakeSignal.close();
    console.info(`[generation-outbox] Received ${signal}, draining current batch...`);
  });
}

console.info(
  `[generation-outbox] Dispatcher started. batch=${config.outbox.dispatchBatchSize} intervalMs=${config.outbox.dispatchIntervalMs}`,
);

try {
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
          assign: (database, assignment) => assignGenerationQueueStage(database, assignment),
        },
      });
    });

    if (result.processedEventIds.length || result.failedEventIds.length) {
      console.info(
        `[generation-outbox] processed=${result.processedEventIds.length} failed=${result.failedEventIds.length}`,
      );
    }

    const elapsedMs = Date.now() - startedAt;
    await wakeSignal.wait(Math.max(0, config.outbox.dispatchIntervalMs - elapsedMs));
  }
} finally {
  wakeSignal.close();
  await Promise.allSettled([
    notificationClient.query(`UNLISTEN ${generationOutboxWakeChannel}`).catch(() => undefined),
    publisher.close(),
    db.close(),
  ]);
  await notificationClient.end().catch(() => undefined);
  console.info("[generation-outbox] Dispatcher stopped.");
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
