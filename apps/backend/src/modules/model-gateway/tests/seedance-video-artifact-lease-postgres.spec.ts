import assert from "node:assert/strict";
import { it } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createEmptyTestDb } from "../../shared/db/test-db.ts";
import { runWithDatabaseContext } from "../../shared/db/dev-db.ts";
import { claimVideoArtifactLease, runWithVideoArtifactLease } from "../seedance-video-artifact-lease.ts";

async function leaseDatabase() {
  const db = await createEmptyTestDb();
  await db.query(`CREATE TABLE tasks (id text PRIMARY KEY, current_attempt_id text, status text,
      failure_code text, locked_by text, locked_until timestamptz, heartbeat_at timestamptz, updated_at timestamptz);
    CREATE TABLE task_attempts (id text PRIMARY KEY, task_id text, locked_by text, locked_until timestamptz, heartbeat_at timestamptz);
    CREATE TABLE effects (kind text);
    INSERT INTO tasks (id, current_attempt_id, status) VALUES ('task', 'attempt', 'running');
    INSERT INTO task_attempts (id, task_id) VALUES ('attempt', 'task');`);
  return db;
}

it("video takeover fences late publication and preserves the successor lease", async () => {
  const db = await leaseDatabase();
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const paused = new Promise<void>(resolve => { reached = resolve; });
  let oldJob: Promise<unknown> | undefined;
  try {
    const now = new Date();
    const old = { taskId: "task", attemptId: "attempt", owner: "seedance-video-finalizer:old" };
    const next = { ...old, owner: "seedance-video-finalizer:next" };
    assert.equal(await claimVideoArtifactLease(db, { ...old, now }), true);
    assert.equal(await claimVideoArtifactLease(db, { ...next, now }), false);
    oldJob = runWithDatabaseContext(() => runWithVideoArtifactLease(db, old, async guarded => {
      await guarded.query("INSERT INTO effects VALUES ('before')");
      reached(); await gate;
      await guarded.query("WITH late AS (INSERT INTO effects VALUES ('late')) SELECT 1");
      return { status: "succeeded" };
    }));
    await paused;
    assert.equal(await claimVideoArtifactLease(db, { ...next, attemptId: "obsolete", now: new Date(now.getTime() + 360_000) }), false);
    assert.equal(await claimVideoArtifactLease(db, { ...next, now: new Date(now.getTime() + 360_000) }), true);
    release();
    assert.deepEqual(await oldJob, { status: "failed", failureCode: "generation_artifact_lease_busy" });
    assert.deepEqual((await db.query("SELECT kind FROM effects")).rows, [{ kind: "before" }]);
    assert.deepEqual((await db.query("SELECT locked_by FROM tasks UNION ALL SELECT locked_by FROM task_attempts")).rows,
      [{ locked_by: next.owner }, { locked_by: next.owner }]);
    await runWithDatabaseContext(() => runWithVideoArtifactLease(db, next, async guarded => {
      await guarded.query("BEGIN");
      await guarded.query("INSERT INTO effects VALUES ('settled')");
      await guarded.query("UPDATE tasks SET status = 'succeeded', locked_by = NULL");
      await guarded.query("UPDATE task_attempts SET locked_by = NULL");
      await guarded.query("COMMIT");
      await guarded.query("INSERT INTO effects VALUES ('workflow')");
    }));
    assert.deepEqual((await db.query("SELECT kind FROM effects ORDER BY kind")).rows,
      [{ kind: "before" }, { kind: "settled" }, { kind: "workflow" }]);
  } finally { release(); await oldJob?.catch(() => undefined); await db.close(); }
});

it("video heartbeat renews both PostgreSQL rows beyond five minutes without overlapping IO transactions", async (t) => {
  const db = await leaseDatabase();
  let release!: () => void;
  let job: Promise<unknown> | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const now = new Date("2026-09-27T07:00:00.000Z");
    t.mock.timers.enable({ apis: ["Date", "setInterval"], now });
    const lease = { taskId: "task", attemptId: "attempt", owner: "seedance-video-finalizer:live" };
    assert.equal(await claimVideoArtifactLease(db, { ...lease, now }), true);
    let renewed!: () => void;
    const wrapped = { async query(sql: string, params?: unknown[]) {
      const result = await db.query(sql, params);
      if (sql.includes("WITH renewed_task AS")) renewed();
      return result;
    } };
    job = runWithDatabaseContext(() => runWithVideoArtifactLease(wrapped, lease, async guarded => {
      await gate; await guarded.query("INSERT INTO effects VALUES ('handoff')"); return { status: "succeeded" };
    }));
    for (let tick = 0; tick < 12; tick++) {
      const done = new Promise<void>(resolve => { renewed = resolve; });
      t.mock.timers.tick(30_000); await done; await setImmediate();
    }
    const rows = (await db.query<{ locked_until: Date }>("SELECT locked_until FROM tasks UNION ALL SELECT locked_until FROM task_attempts")).rows;
    assert.deepEqual(rows.map(row => row.locked_until.toISOString()), ["2026-09-27T07:11:00.000Z", "2026-09-27T07:11:00.000Z"]);
    assert.equal(await claimVideoArtifactLease(db, { ...lease, owner: "competitor", now: new Date() }), false);
    release(); assert.deepEqual(await job, { status: "succeeded" });
    assert.deepEqual((await db.query("SELECT locked_by FROM tasks UNION ALL SELECT locked_by FROM task_attempts")).rows,
      [{ locked_by: null }, { locked_by: null }]);
  } finally { release(); await job?.catch(() => undefined); t.mock.timers.reset(); await db.close(); }
});
