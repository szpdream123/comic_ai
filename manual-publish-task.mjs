#!/usr/bin/env node
import { Queue } from "bullmq";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;
const prefix = process.env.REDIS_KEY_PREFIX || "";

console.log("Connecting to Redis:", redisUrl);
console.log("Prefix:", prefix);

const connection = new Redis(redisUrl);

const queue = new Queue("generation-submit-video", {
  connection,
  prefix: prefix || undefined,
});

const taskId = "d170ca02-044d-4fb5-9ad9-b60f76635cc7";
const jobId = `generation.task.created__${taskId}__submit__manual-fix`;

try {
  const job = await queue.add(
    "generation.task.created",
    {
      outboxEventId: "manual-fix",
      taskId,
      workflowId: "4837c28e-6154-4b31-9dc7-ed25e4282978",
      mediaType: "video",
      modelCode: "MiniMax-H3-768p",
      providerExecutor: "seedance",
      queueName: "generation-submit-video",
      targetType: "storyboard",
      targetId: "c77c80b9-5ce2-453f-84f0-fab3eaf447f4",
    },
    {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    }
  );

  console.log("✅ Job added to queue:", job.id);
  console.log("Job name:", job.name);
} catch (error) {
  console.error("❌ Failed to add job:", error);
} finally {
  await queue.close();
  await connection.quit();
}
