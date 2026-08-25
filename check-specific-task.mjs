import { createDevDb } from "./apps/backend/src/modules/shared/db/dev-db.ts";

const db = await createDevDb();

try {
  const result = await db.query(`
    SELECT
      id,
      status,
      input_snapshot_json->>'requestHost' as request_host,
      input_snapshot_json->>'workerEnvironment' as worker_env,
      input_snapshot_json,
      current_attempt_id,
      created_at
    FROM tasks
    WHERE id = 'd445a363-599c-453a-af48-ac9d66ebdbb7'
  `);

  if (result.rows.length === 0) {
    console.log('Task not found');
  } else {
    const row = result.rows[0];
    console.log('\n=== Task Details ===\n');
    console.log(`ID: ${row.id}`);
    console.log(`Status: ${row.status}`);
    console.log(`Request Host: ${row.request_host || 'NOT SET'}`);
    console.log(`Worker Environment: ${row.worker_env || 'NOT SET'}`);
    console.log(`Current Attempt ID: ${row.current_attempt_id || 'NULL'}`);
    console.log(`Created: ${row.created_at}`);
    console.log('\nFull Snapshot:');
    console.log(JSON.stringify(row.input_snapshot_json, null, 2));
  }

  await db.close();
} catch (err) {
  console.error('Error:', err.message);
  await db.close();
  process.exit(1);
}
