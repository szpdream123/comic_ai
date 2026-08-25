#!/usr/bin/env node
import pg from "pg";

const { Client } = pg;

function createDevDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  client.connect();
  return client;
}

async function checkTaskSnapshot() {
  const db = createDevDb();

  const taskId = "d445a363-599c-453a-af48-ac9d66ebdbb7";

  const result = await db.query(
    `SELECT id, status,
            input_snapshot_json->>'workerEnvironment' as worker_environment,
            input_snapshot_json->>'requestHost' as request_host,
            jsonb_pretty(input_snapshot_json) as snapshot
     FROM tasks
     WHERE id = $1`,
    [taskId]
  );

  if (result.rows.length === 0) {
    console.log("Task not found");
    await db.end();
    return;
  }

  const task = result.rows[0];
  console.log("\n=== Task Snapshot ===");
  console.log(`Task ID: ${task.id}`);
  console.log(`Status: ${task.status}`);
  console.log(`Worker Environment: ${task.worker_environment}`);
  console.log(`Request Host: ${task.request_host}`);
  console.log(`\nFull Snapshot:`);
  console.log(task.snapshot);

  await db.end();
}

checkTaskSnapshot().catch(console.error);
