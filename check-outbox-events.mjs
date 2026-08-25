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

async function checkOutbox() {
  const db = createDevDb();

  const taskId = "d445a363-599c-453a-af48-ac9d66ebdbb7";

  // Check if there's an outbox event for this task
  const outboxResult = await db.query(
    `SELECT id, event_type, payload_json, status,
            created_at, processed_at, available_at, error_message
     FROM outbox_events
     WHERE payload_json->>'taskId' = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [taskId]
  );

  console.log("\n=== Outbox Events for Task ===");
  if (outboxResult.rows.length === 0) {
    console.log("No outbox events found for this task!");
  } else {
    for (const event of outboxResult.rows) {
      console.log(`\nEvent ID: ${event.id}`);
      console.log(`  Event Type: ${event.event_type}`);
      console.log(`  Status: ${event.status}`);
      console.log(`  Created: ${event.created_at}`);
      console.log(`  Processed: ${event.processed_at}`);
      console.log(`  Available At: ${event.available_at}`);
      console.log(`  Error: ${event.error_message}`);
      console.log(`  Payload:`, JSON.stringify(event.payload_json, null, 2));
    }
  }

  // Check recent outbox events
  const recentResult = await db.query(
    `SELECT id, event_type, payload_json->>'taskId' as task_id, status, created_at, available_at
     FROM outbox_events
     WHERE event_type = 'generation.task.created'
     ORDER BY created_at DESC
     LIMIT 10`
  );

  console.log("\n=== Recent Generation Task Created Events ===");
  for (const event of recentResult.rows) {
    console.log(`\nEvent: ${event.id.substring(0, 8)}... | Task: ${event.task_id?.substring(0, 8) || 'N/A'}...`);
    console.log(`  Status: ${event.status} | Created: ${event.created_at} | Available: ${event.available_at}`);
  }

  await db.end();
}

checkOutbox().catch(console.error);
