import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

await client.connect();

// Get a recent failed task
const taskResult = await client.query(`
  SELECT
    t.id as task_id,
    t.status as task_status,
    t.current_attempt_id,
    t.attempt_count,
    ta.status as attempt_status,
    pr.id as pr_id,
    pr.attempt_id as pr_attempt_id,
    pr.external_submission_started_at
  FROM tasks t
  LEFT JOIN task_attempts ta ON ta.id = t.current_attempt_id
  LEFT JOIN provider_requests pr ON pr.task_id = t.id
  WHERE t.input_snapshot_json->>'model' = 'MiniMax-H3-768p'
    AND t.created_at > NOW() - INTERVAL '1 hour'
  ORDER BY t.created_at DESC
  LIMIT 1
`);

if (taskResult.rows.length === 0) {
  console.log('No recent MiniMax H3 tasks found');
  await client.end();
  process.exit(0);
}

const task = taskResult.rows[0];
console.log('\n=== Task State ===');
console.log('Task ID:', task.task_id);
console.log('Task Status:', task.task_status);
console.log('Task Attempt Count:', task.attempt_count);
console.log('Current Attempt ID:', task.current_attempt_id);
console.log('Attempt Status:', task.attempt_status);
console.log('\nProvider Request ID:', task.pr_id);
console.log('PR Attempt ID:', task.pr_attempt_id);
console.log('PR Submission Started:', task.external_submission_started_at);

// Test if the UPDATE would work with current state
console.log('\n=== Testing UPDATE Conditions ===');

const testQuery = `
  SELECT
    pr.id,
    pr.attempt_id,
    pr.external_submission_started_at,
    pr.task_id,
    task.id as task_exists,
    task.status as task_status,
    task.current_attempt_id,
    task.attempt_count,
    attempt.id as attempt_exists,
    attempt.status as attempt_status,
    CASE
      WHEN pr.attempt_id = $2::uuid THEN 'matches'
      WHEN pr.attempt_id IS NULL THEN 'null'
      ELSE 'mismatch'
    END as attempt_id_check
  FROM provider_requests pr
  LEFT JOIN tasks task ON task.id = $1::uuid
  LEFT JOIN task_attempts attempt ON attempt.id = $2::uuid AND attempt.task_id = task.id
  WHERE pr.id = $3::uuid
`;

const testResult = await client.query(testQuery, [
  task.task_id,
  task.current_attempt_id,
  task.pr_id
]);

console.log('\nCurrent State Check:');
console.log(JSON.stringify(testResult.rows[0], null, 2));

// Check why UPDATE might fail
console.log('\n=== Failure Analysis ===');
const row = testResult.rows[0];

if (!row) {
  console.log('❌ Provider request not found');
} else {
  if (row.external_submission_started_at) {
    console.log('❌ external_submission_started_at is NOT NULL:', row.external_submission_started_at);
  } else {
    console.log('✓ external_submission_started_at IS NULL');
  }

  if (row.task_status !== 'queued' && row.task_status !== 'running' && row.task_status !== 'result_unknown') {
    console.log(`❌ task.status is '${row.task_status}', not in ('queued', 'running', 'result_unknown')`);
  } else {
    console.log(`✓ task.status is '${row.task_status}'`);
  }

  if (row.attempt_status !== 'created' && row.attempt_status !== 'running' && row.attempt_status !== 'result_unknown') {
    console.log(`❌ attempt.status is '${row.attempt_status}', not in ('created', 'running', 'result_unknown')`);
  } else {
    console.log(`✓ attempt.status is '${row.attempt_status}'`);
  }

  if (row.current_attempt_id !== task.current_attempt_id) {
    console.log(`❌ task.current_attempt_id mismatch: ${row.current_attempt_id} vs ${task.current_attempt_id}`);
  } else {
    console.log('✓ task.current_attempt_id matches');
  }

  if (row.attempt_id_check === 'null') {
    console.log('✓ pr.attempt_id IS NULL (will be updated)');
  } else if (row.attempt_id_check === 'matches') {
    console.log('✓ pr.attempt_id matches expected');
  } else {
    console.log(`❌ pr.attempt_id mismatch: ${row.attempt_id} vs ${task.current_attempt_id}`);
  }
}

await client.end();
