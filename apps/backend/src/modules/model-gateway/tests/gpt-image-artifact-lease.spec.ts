import assert from "node:assert/strict";
import { it } from "node:test";
import { createEmptyTestDb } from "../../shared/db/test-db.ts";
import { runWithDatabaseContext } from "../../shared/db/dev-db.ts";
import { createImageArtifactLeaseGuard } from "../gpt-image-artifact-lease.ts";

it("fences an old artifact writer after takeover, including CTE writes and settlement transactions", async () => {
  const db = await createEmptyTestDb();
  try {
    await db.query(`CREATE TABLE tasks (id text PRIMARY KEY, current_attempt_id text, status text, locked_by text);
      CREATE TABLE task_attempts (id text PRIMARY KEY, task_id text, locked_by text);
      CREATE TABLE effects (kind text);
      INSERT INTO tasks VALUES ('task', 'attempt', 'running', 'old');
      INSERT INTO task_attempts VALUES ('attempt', 'task', 'old');`);
    const lease = { taskId: "task", attemptId: "attempt", owner: "old" };
    const old = createImageArtifactLeaseGuard(db, lease);
    await old.db.query("INSERT INTO effects VALUES ('handoff')");
    await db.query("UPDATE tasks SET locked_by = 'new'; UPDATE task_attempts SET locked_by = 'new'");
    await assert.rejects(old.db.query("WITH effect AS (INSERT INTO effects VALUES ('stale')) SELECT 1"),
      { failureCode: "generation_artifact_lease_busy" });
    await assert.rejects(old.db.query("BEGIN"), { failureCode: "generation_artifact_lease_busy" });
    assert.deepEqual((await db.query("SELECT kind FROM effects")).rows, [{ kind: "handoff" }]);

    const current = createImageArtifactLeaseGuard(db, { ...lease, owner: "new" });
    await current.db.query("BEGIN");
    await current.db.query("INSERT INTO effects VALUES ('credits')");
    await current.db.query("UPDATE tasks SET status = 'succeeded', locked_by = NULL");
    await current.db.query("COMMIT");
    assert.equal(current.finalized, true);
    await current.db.query("INSERT INTO effects VALUES ('workflow')");
    assert.deepEqual((await db.query("SELECT kind FROM effects")).rows.map((row) => row.kind), ["handoff", "credits", "workflow"]);

    // A completed owner's cleanup cannot mutate a later attempt.
    await db.query("UPDATE tasks SET current_attempt_id = 'next', status = 'running', locked_by = 'next'");
    await assert.rejects(current.db.query("INSERT INTO effects VALUES ('late')"),
      { failureCode: "generation_artifact_lease_busy" });
  } finally { await db.close(); }
});

it("rolls back settlement on lease invalidation and serializes takeover behind a short write transaction", async () => {
  const db = await createEmptyTestDb();
  try {
    await db.query(`CREATE TABLE tasks (id text PRIMARY KEY, current_attempt_id text, status text, locked_by text);
      CREATE TABLE task_attempts (id text PRIMARY KEY, task_id text, locked_by text);
      CREATE TABLE effects (kind text);
      INSERT INTO tasks VALUES ('task', 'attempt', 'running', 'old');
      INSERT INTO task_attempts VALUES ('attempt', 'task', 'old');`);
    const guard = createImageArtifactLeaseGuard(db, { taskId: "task", attemptId: "attempt", owner: "old" });
    await runWithDatabaseContext(async () => {
      await guard.db.query("BEGIN");
      await guard.db.query("INSERT INTO effects VALUES ('credits')");
      const takeover = runWithDatabaseContext(async () => {
        await db.query("BEGIN");
        try {
          await db.query("SET LOCAL lock_timeout = '100ms'");
          await assert.rejects(db.query("UPDATE tasks SET locked_by = 'new'"), /lock timeout/);
        } finally { await db.query("ROLLBACK"); }
      });
      await takeover;
      guard.invalidate();
      await assert.rejects(guard.db.query("COMMIT"), { failureCode: "generation_artifact_lease_busy" });
      await guard.db.query("ROLLBACK");
    });
    assert.equal((await db.query("SELECT * FROM effects")).rows.length, 0);
    assert.equal(guard.finalized, false);
  } finally { await db.close(); }
});
