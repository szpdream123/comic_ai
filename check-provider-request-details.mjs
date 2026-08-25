import { createDevDb } from "./apps/backend/src/modules/shared/db/dev-db.ts";

const db = await createDevDb();

try {
  // 查询最新失败任务的provider_request详情
  const result = await db.query(`
    SELECT
      pr.id,
      pr.task_id,
      pr.attempt_id,
      pr.status,
      pr.external_request_id,
      pr.external_submission_started_at,
      pr.created_at,
      pr.updated_at,
      t.current_attempt_id,
      t.status as task_status
    FROM provider_requests pr
    JOIN tasks t ON t.id = pr.task_id
    WHERE pr.task_id = '768252b5-d7a1-4a95-a93c-d72b0e2db85f'
    ORDER BY pr.created_at DESC
  `);

  console.log('\n=== Provider Request Details for Latest Failed Task ===\n');
  for (const row of result.rows) {
    console.log(`Provider Request ID: ${row.id}`);
    console.log(`  Task ID: ${row.task_id}`);
    console.log(`  Provider Status: ${row.status}`);
    console.log(`  Provider Attempt ID: ${row.attempt_id || 'NULL'}`);
    console.log(`  Task Current Attempt ID: ${row.current_attempt_id || 'NULL'}`);
    console.log(`  External Request ID: ${row.external_request_id || 'NULL'}`);
    console.log(`  External Submission Started: ${row.external_submission_started_at || 'NULL'}`);
    console.log(`  Created At: ${row.created_at}`);
    console.log(`  Updated At: ${row.updated_at}`);
    console.log('');
    console.log(`  Can Rebind: ${!row.attempt_id && !row.external_submission_started_at && !row.external_request_id ? 'YES' : 'NO'}`);
    if (row.external_submission_started_at) {
      console.log(`  Block Reason: external_submission_started_at is set`);
    }
    if (row.external_request_id) {
      console.log(`  Block Reason: external_request_id is set`);
    }
    console.log('');
  }

  await db.close();
} catch (err) {
  console.error('Error:', err.message);
  await db.close();
  process.exit(1);
}
