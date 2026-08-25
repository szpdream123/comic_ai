#!/usr/bin/env node
import { Queue } from "bullmq";
import pg from "pg";

const { Client } = pg;

function createDevDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  client.connect();
  return client;
}

async function checkQueue() {
  const db = createDevDb();

  // First, check the task in database
  const taskId = "d445a363-599c-453a-af48-ac9d66ebdbb7";

  const taskResult = await db.query(
    `SELECT id, status, current_attempt_id
     FROM tasks
     WHERE id = $1`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    console.log("Task not found in database");
    await db.end();
    return;
  }

  const task = taskResult.rows[0];
  console.log("\n=== Task in Database ===");
  console.log(`ID: ${task.id}`);
  console.log(`Status: ${task.status}`);
  console.log(`Current Attempt ID: ${task.current_attempt_id}`);

  // Check BullMQ queues
  const redisUrl = new URL(process.env.REDIS_URL);
  const queuePrefix = process.env.REDIS_KEY_PREFIX || "";

  const queueNames = [
    "generation-submit-video",
    "generation-submit-image"
  ];

  console.log("\n=== BullMQ Queue Status ===");
  console.log(`Redis: ${redisUrl.hostname}:${redisUrl.port}`);
  console.log(`Prefix: ${queuePrefix}`);

  for (const queueName of queueNames) {
    try {
      const queue = new Queue(queueName, {
        prefix: queuePrefix,
        connection: {
          host: redisUrl.hostname,
          port: parseInt(redisUrl.port) || 6379,
          password: redisUrl.password,
          db: parseInt(redisUrl.pathname.slice(1)) || 0
        }
      });

      const counts = await queue.getJobCounts("wait", "active", "completed", "failed", "delayed");
      console.log(`\nQueue: ${queueName}`);
      console.log(`  Waiting: ${counts.wait}`);
      console.log(`  Active: ${counts.active}`);
      console.log(`  Completed: ${counts.completed}`);
      console.log(`  Failed: ${counts.failed}`);
      console.log(`  Delayed: ${counts.delayed}`);

      // Try to find our specific task
      const waitingJobs = await queue.getJobs(["wait"], 0, 100);
      const ourJob = waitingJobs.find(job => job.data?.taskId === taskId);
      if (ourJob) {
        console.log(`  ✓ Found our task in waiting jobs: ${ourJob.id}`);
        console.log(`  Job data:`, JSON.stringify(ourJob.data, null, 2));
      }

      await queue.close();
    } catch (error) {
      console.log(`\nQueue: ${queueName}`);
      console.log(`  Error: ${error.message}`);
    }
  }

  await db.end();
}

checkQueue().catch(console.error);
