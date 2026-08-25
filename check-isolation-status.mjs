import { createDevDb } from "./apps/backend/src/modules/shared/db/dev-db.ts";

const db = await createDevDb();

try {
  // 先检查最近的任务
  const result = await db.query(`
    SELECT
      id,
      status,
      input_snapshot_json->>'requestHost' as request_host,
      input_snapshot_json->>'workerEnvironment' as worker_env,
      current_attempt_id,
      created_at
    FROM tasks
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('\n=== Recent Tasks ===\n');
  for (const row of result.rows) {
    console.log(`ID: ${row.id}`);
    console.log(`  Status: ${row.status}`);
    console.log(`  Request Host: ${row.request_host || 'NOT SET'}`);
    console.log(`  Worker Environment: ${row.worker_env || 'NOT SET'}`);
    console.log(`  Current Attempt ID: ${row.current_attempt_id || 'NULL'}`);
    console.log(`  Created: ${row.created_at}`);
    console.log('');
  }

  // 检查失败的任务和它们的provider_requests
  const failedResult = await db.query(`
    SELECT
      t.id,
      t.status,
      t.failure_code,
      t.input_snapshot_json->>'requestHost' as request_host,
      t.current_attempt_id,
      pr.attempt_id as provider_attempt_id,
      pr.id as provider_request_id
    FROM tasks t
    LEFT JOIN provider_requests pr ON pr.task_id = t.id
    WHERE t.status = 'failed'
      AND t.failure_code = 'provider_submission_failed'
    ORDER BY t.created_at DESC
    LIMIT 5
  `);

  if (failedResult.rows.length > 0) {
    console.log('\n=== Failed Tasks (provider_submission_failed) ===\n');
    for (const row of failedResult.rows) {
      console.log(`Task ID: ${row.id}`);
      console.log(`  Request Host: ${row.request_host || 'NOT SET'}`);
      console.log(`  Task Attempt ID: ${row.current_attempt_id || 'NULL'}`);
      console.log(`  Provider Request ID: ${row.provider_request_id || 'NULL'}`);
      console.log(`  Provider Attempt ID: ${row.provider_attempt_id || 'NULL'}`);
      console.log(`  Match: ${row.current_attempt_id === row.provider_attempt_id ? 'YES' : 'NO - MISMATCH!'}`);
      console.log('');
    }
  } else {
    console.log('\n=== No failed tasks found ===\n');
  }

  await db.close();
} catch (err) {
  console.error('Error:', err.message);
  await db.close();
  process.exit(1);
}
