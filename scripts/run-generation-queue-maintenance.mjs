import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

loadDotEnvFile(join(process.cwd(), ".env"));

const [
  { createDevDb, runWithDatabaseContext },
  { createBullMQGenerationPublisher },
  { assignGenerationQueueStage, retireIdleGenerationQueueShards },
  { failStaleGenerationTasksBeforeProviderSubmission, repairExpiredGenerationSubmitLeases, repairQueuedGenerationTaskOutbox, repairRunningSeedancePollJobs },
  { loadGenerationQueueConfig },
  { enqueueDueGenerationPolls },
] = await Promise.all([
    import("../apps/backend/src/modules/shared/db/dev-db.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-bullmq.publisher.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue-shard.store.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-redis-repair.service.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-queue.config.ts"),
    import("../apps/backend/src/modules/model-gateway/generation-due-poll.service.ts"),
  ]);

const config = loadGenerationQueueConfig(process.env);
const db = await createDevDb();
const publisher = createBullMQGenerationPublisher(config);
let stopping = false;
let lastShardLifecycleAt = 0;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopping = true;
    console.info(`[generation-maintenance] Received ${signal}, draining current cycle...`);
  });
}

console.info(
  `[generation-maintenance] Scheduler started. batch=${config.outbox.dispatchBatchSize} intervalMs=${config.outbox.dispatchIntervalMs}`,
);

try {
  while (!stopping) {
    const startedAt = Date.now();
    const { preSubmissionFailure, leaseRepair, repair, duePoll, pollRepair, retiredShardCount } = await runWithDatabaseContext(async () => {
      const now = new Date();
      return {
        preSubmissionFailure: await failStaleGenerationTasksBeforeProviderSubmission(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
        }),
        leaseRepair: await repairExpiredGenerationSubmitLeases(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
        }),
        repair: await repairQueuedGenerationTaskOutbox(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
          staleDispatchMs: config.repair.staleDispatchMs,
        }),
        duePoll: await enqueueDueGenerationPolls(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
          maxAttempts: {
            image: config.poll.image.maxAttempts,
            video: config.poll.video.maxAttempts,
            audio: config.poll.audio.maxAttempts,
          },
        }),
        pollRepair: await repairRunningSeedancePollJobs(db, {
          now,
          limit: config.outbox.dispatchBatchSize,
          staleDispatchMs: config.repair.staleDispatchMs,
          config,
          publisher,
          shardStore: {
            assign: (database, assignment) => assignGenerationQueueStage(database, assignment),
          },
        }),
        retiredShardCount: await retireIdleShardsIfDue(now),
      };
    });

    if (preSubmissionFailure.failedTaskIds.length) {
      console.info(`[generation-maintenance] failedPreSubmissionTasks=${preSubmissionFailure.failedTaskIds.length}`);
    }
    if (leaseRepair.repairedTaskIds.length || leaseRepair.resultUnknownTaskIds.length) {
      console.info(
        `[generation-maintenance] repairedSubmitLeases=${leaseRepair.repairedTaskIds.length} resultUnknown=${leaseRepair.resultUnknownTaskIds.length}`,
      );
    }
    if (repair.repairedTaskIds.length) {
      console.info(`[generation-maintenance] repairedQueuedTasks=${repair.repairedTaskIds.length}`);
    }
    if (pollRepair.repairedTaskIds.length) {
      console.info(`[generation-maintenance] repairedPollTasks=${pollRepair.repairedTaskIds.length}`);
    }
    if (duePoll.enqueuedTaskIds.length) {
      console.info(`[generation-maintenance] enqueuedDuePollTasks=${duePoll.enqueuedTaskIds.length}`);
    }
    if (retiredShardCount > 0) {
      console.info(`[generation-maintenance] retiredIdleShards=${retiredShardCount}`);
    }

    const elapsedMs = Date.now() - startedAt;
    await sleep(Math.max(0, config.outbox.dispatchIntervalMs - elapsedMs));
  }
} finally {
  await Promise.allSettled([publisher.close(), db.close()]);
  console.info("[generation-maintenance] Scheduler stopped.");
}

async function retireIdleShardsIfDue(now) {
  if (!config.sharding.enabled || now.getTime() - lastShardLifecycleAt < 10_000) return 0;
  lastShardLifecycleAt = now.getTime();
  return retireIdleGenerationQueueShards(db, new Date(now.getTime() - 15 * 60_000));
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) return;
  const content = readFileSync(envFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
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
