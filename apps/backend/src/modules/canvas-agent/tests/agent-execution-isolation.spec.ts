import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Exercise the actual database fence with old SQL, not a mock of the new worker.
test("old and foreign runtimes cannot claim, redispatch, repair or strip scoped Agent tasks", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE workflows (id uuid PRIMARY KEY, input_snapshot_json jsonb, status text);
      CREATE TABLE tasks (id uuid PRIMARY KEY, workflow_id uuid, input_snapshot_json jsonb, status text, locked_by text, attempt_count int DEFAULT 0);
      CREATE TABLE canvas_agent_tasks (id uuid PRIMARY KEY, workflow_task_id uuid, conversation_id uuid, status text, lease_owner text);
      CREATE TABLE canvas_agent_conversation_locks (conversation_id uuid PRIMARY KEY, locked_by text);
      CREATE TABLE outbox_events (id uuid PRIMARY KEY, payload_json jsonb, status text);
      CREATE TABLE generation_queue_stage_assignments (task_id uuid, queue_name text);
      CREATE TABLE task_attempts (id uuid PRIMARY KEY, task_id uuid, status text);
      CREATE TABLE provider_requests (id uuid PRIMARY KEY, task_id uuid, status text);
      CREATE TABLE credit_reservations (id uuid PRIMARY KEY, task_id uuid, status text);
      CREATE TABLE credit_reservation_allocations (id uuid PRIMARY KEY, task_id uuid);
      CREATE TABLE ai_generation_task_snapshots (task_id uuid, status text);
      CREATE TABLE generation_stage_successors (task_id uuid, status text);
      CREATE TABLE canvas_agent_outbox (id uuid PRIMARY KEY, task_id uuid, status text, locked_by text);
      CREATE TABLE canvas_agent_steps (id uuid PRIMARY KEY, task_id uuid, status text);
      CREATE TABLE canvas_agent_events (id uuid PRIMARY KEY, task_id uuid);
      CREATE TABLE canvas_agent_messages (id uuid PRIMARY KEY, task_id uuid);
      CREATE TABLE canvas_agent_approvals (id uuid PRIMARY KEY, task_id uuid, status text);
    `);
    const task = "10000000-0000-4000-8000-000000000001";
    const agent = "20000000-0000-4000-8000-000000000001";
    const conversation = "30000000-0000-4000-8000-000000000001";
    const legacy = "10000000-0000-4000-8000-000000000002";
    const scope = "a".repeat(32);
    await db.query("INSERT INTO tasks(id, input_snapshot_json,status) VALUES ($1,$2,'queued'),($3,'{}','queued')", [task, { agentExecutionScope: scope, workerEnvironment: "production" }, legacy]);
    await db.query("INSERT INTO canvas_agent_tasks VALUES ($1,$2,$3,'queued',NULL)", [agent, task, conversation]);
    await db.query("INSERT INTO canvas_agent_outbox VALUES ($1,$2,'pending',NULL)", [agent, agent]);
    await db.query("INSERT INTO outbox_events VALUES ($1,$2,'pending')", [task, { taskId: task }]);
    await db.query("INSERT INTO provider_requests VALUES ($1,$1,'succeeded')", [task]);
    await db.query("INSERT INTO credit_reservations VALUES ($1,$1,'manual_review_required')", [task]);
    await db.exec(await readFile("packages/db/migrations/20261102-agent-execution-isolation.sql", "utf8").catch((error) => {
      if (error.code === "ENOENT") return "SELECT 1";
      throw error;
    }));

    for (const session of ["", "b".repeat(32)]) {
      await db.query("SELECT set_config('comic_ai.agent_execution_scope',$1,false)", [session]);
      assert.equal((await db.query("UPDATE tasks SET status='running',locked_by='old-worker',attempt_count=attempt_count+1 WHERE id=$1 RETURNING id", [task])).rows.length, 0);
      assert.equal((await db.query("UPDATE tasks SET input_snapshot_json='{}' WHERE id=$1 RETURNING id", [task])).rows.length, 0);
      assert.equal((await db.query("UPDATE canvas_agent_tasks SET status='failed' WHERE id=$1 RETURNING id", [agent])).rows.length, 0);
      assert.equal((await db.query("UPDATE canvas_agent_outbox SET status='dispatching',locked_by='old-worker' RETURNING id")).rows.length, 0);
      assert.equal((await db.query("UPDATE outbox_events SET status='processing' RETURNING id")).rows.length, 0);
      assert.equal((await db.query("UPDATE provider_requests SET status='result_unknown' RETURNING id")).rows.length, 0);
      assert.equal((await db.query("UPDATE credit_reservations SET status='active' RETURNING id")).rows.length, 0);
      assert.equal((await db.query("INSERT INTO canvas_agent_conversation_locks VALUES ($1,'old-worker') RETURNING *", [conversation])).rows.length, 0);
      assert.equal((await db.query("INSERT INTO canvas_agent_messages VALUES ($1,$2) RETURNING id", [task, agent])).rows.length, 0);
      assert.equal((await db.query("INSERT INTO generation_queue_stage_assignments VALUES ($1,'wrong-redis') RETURNING *", [task])).rows.length, 0);
    }
    assert.equal((await db.query("UPDATE tasks SET status='running' WHERE id=$1 RETURNING id", [legacy])).rows.length, 1);
    await db.query("SELECT set_config('comic_ai.agent_execution_scope',$1,false)", [scope]);
    assert.equal((await db.query("UPDATE tasks SET status='running',attempt_count=attempt_count+1 WHERE id=$1 RETURNING id", [task])).rows.length, 1);
    assert.equal((await db.query("UPDATE canvas_agent_tasks SET status='waiting_external' WHERE id=$1 RETURNING id", [agent])).rows.length, 1);
    assert.equal((await db.query("UPDATE canvas_agent_tasks SET status='queued' WHERE id=$1 RETURNING id", [agent])).rows.length, 1);
    assert.equal((await db.query("UPDATE canvas_agent_outbox SET status='dispatching' RETURNING id")).rows.length, 1);
    assert.equal((await db.query("UPDATE outbox_events SET status='processing' RETURNING id")).rows.length, 1);
    assert.equal((await db.query("SELECT attempt_count FROM tasks WHERE id=$1", [task])).rows[0].attempt_count, 1);
    // Matching runtime cannot silently erase the ownership of a task either.
    await assert.rejects(db.query("UPDATE tasks SET input_snapshot_json='{}' WHERE id=$1", [task]), /agent_execution_scope_immutable/);
  } finally {
    await db.close();
  }
});
