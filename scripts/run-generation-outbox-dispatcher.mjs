import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

loadDotEnvFile(join(process.cwd(), ".env"));

const [
  { createDevDb },
  { createBullMQGenerationPublisher },
  { dispatchGenerationOutboxBatch },
  { repairQueuedGenerationTaskOutbox, repairRunningSeedancePollJobs },
  { loadGenerationQueueConfig },
] = await Promise.all([
    import("../apps/backend/src/modules/shared/db/dev-db.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-bullmq.publisher.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-outbox.dispatcher.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-redis-repair.service.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue.config.ts"),
  ]);

const config = loadGenerationQueueConfig(process.env);
const db = await createDevDb();
const publisher = createBullMQGenerationPublisher(config);
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopping = true;
    console.info(`[generation-outbox] Received ${signal}, draining current batch...`);
  });
}

console.info(
  `[generation-outbox] Dispatcher started. batch=${config.outbox.dispatchBatchSize} intervalMs=${config.outbox.dispatchIntervalMs}`,
);

try {
  while (!stopping) {
    const startedAt = Date.now();
    const repair = await repairQueuedGenerationTaskOutbox(db, {
      now: new Date(),
      limit: config.outbox.dispatchBatchSize,
      staleDispatchMs: config.repair.staleDispatchMs,
    });
    const pollRepair = await repairRunningSeedancePollJobs(db, {
      now: new Date(),
      limit: config.outbox.dispatchBatchSize,
      staleDispatchMs: config.repair.staleDispatchMs,
      config,
      publisher,
    });
    const result = await dispatchGenerationOutboxBatch(db, {
      now: new Date(),
      limit: config.outbox.dispatchBatchSize,
      retryDelayMs: config.outbox.retryDelayMs,
      config,
      publisher,
    });

    if (repair.repairedTaskIds.length) {
      console.info(`[generation-outbox] repairedQueuedTasks=${repair.repairedTaskIds.length}`);
    }

    if (pollRepair.repairedTaskIds.length) {
      console.info(`[generation-outbox] repairedPollTasks=${pollRepair.repairedTaskIds.length}`);
    }

    if (result.processedEventIds.length || result.failedEventIds.length) {
      console.info(
        `[generation-outbox] processed=${result.processedEventIds.length} failed=${result.failedEventIds.length}`,
      );
    }

    const elapsedMs = Date.now() - startedAt;
    await sleep(Math.max(0, config.outbox.dispatchIntervalMs - elapsedMs));
  }
} finally {
  await Promise.allSettled([publisher.close(), db.close()]);
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
