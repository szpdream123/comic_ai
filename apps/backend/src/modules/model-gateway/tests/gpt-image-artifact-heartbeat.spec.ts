import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { it } from "node:test";
import { fetchGptImageArtifactJob } from "../gpt-image.worker.ts";
import { createEmptyTestDb } from "../../shared/db/test-db.ts";
import { runWithDatabaseContext } from "../../shared/db/dev-db.ts";

it("renews both PostgreSQL lease rows past the original expiry and prevents takeover", async (t) => {
  const db = await createEmptyTestDb();
  let release!: () => void;
  let paused!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const reached = new Promise<void>((resolve) => { paused = resolve; });
  let job: Promise<unknown> | undefined;
  try {
    await db.query(`CREATE TABLE tasks (id text PRIMARY KEY, current_attempt_id text, status text, failure_code text,
        locked_by text, locked_until timestamptz, heartbeat_at timestamptz);
      CREATE TABLE task_attempts (id text PRIMARY KEY, task_id text, locked_by text, locked_until timestamptz, heartbeat_at timestamptz);
      INSERT INTO tasks (id, current_attempt_id, status) VALUES ('task', 'attempt', 'running');
      INSERT INTO task_attempts (id, task_id) VALUES ('attempt', 'task');`);
    const now = new Date("2026-09-27T07:00:00.000Z");
    t.mock.timers.enable({ apis: ["Date", "setInterval"], now });
    let pauseOnce = true;
    let renewed!: () => void;
    const wrapped = { async query(sql: string, params?: unknown[]) {
      if (sql.includes("FROM tasks t") && sql.includes("LEFT JOIN provider_requests pr")) return { rows: [{
        task_id: "task", attempt_id: "attempt", provider_request_id: "provider", input_snapshot_json: {},
        provider_response_redacted_json: { artifact: { mediaType: "image", url: "https://example.test/image.png" } },
      }] };
      if (sql.includes("provider_status_json->'artifactHandoff'")) return { rows: [{ handoff: {
        mediaType: "image", attemptId: "attempt", storageObjectId: "storage", storageObjectKey: "image.png",
        contentType: "image/png", fetchedAt: now.toISOString(),
      } }] };
      if (sql.includes("SELECT true AS available")) return { rows: [{ available: true }] };
      const result = await db.query(sql, params);
      // Pause after a committed read, so no row lock can mask a broken renewal.
      if (sql === "COMMIT" && pauseOnce) { pauseOnce = false; paused(); await gate; }
      if (sql.includes("WITH renewed_task AS")) renewed();
      return result;
    } };
    job = runWithDatabaseContext(() => fetchGptImageArtifactJob(wrapped as never, { taskId: "task", now, env: {}, runtime: {} as never }));
    await reached;
    for (let tick = 0; tick < 12; tick += 1) {
      const heartbeat = new Promise<void>((resolve) => { renewed = resolve; });
      t.mock.timers.tick(30_000);
      await heartbeat;
      await setImmediate();
    }
    const leases = await db.query<{ locked_until: Date; heartbeat_at: Date; locked_by: string }>(`
      SELECT locked_until, heartbeat_at, locked_by FROM tasks
      UNION ALL SELECT locked_until, heartbeat_at, locked_by FROM task_attempts
    `);
    assert.equal(leases.rows.length, 2);
    for (const lease of leases.rows) {
      assert.equal(lease.locked_until.toISOString(), "2026-09-27T07:11:00.000Z");
      assert.equal(lease.heartbeat_at.toISOString(), "2026-09-27T07:06:00.000Z");
    }
    assert.deepEqual(await runWithDatabaseContext(() => fetchGptImageArtifactJob(wrapped as never, {
      taskId: "task", now: new Date(), env: {}, runtime: {} as never,
    })), { status: "failed", failureCode: "generation_artifact_lease_busy" });
    release();
    assert.deepEqual(await job, { status: "succeeded" });
  } finally {
    release();
    await job?.catch(() => undefined);
    t.mock.timers.reset();
    await db.close();
  }
});

for (const outcome of ["healthy", "lost", "database_error"] as const) {
  it(`uses a five-minute image lease with 30-second heartbeats: ${outcome}`, async (t) => {
    const now = new Date("2026-09-27T06:00:00.000Z");
    t.mock.timers.enable({ apis: ["Date", "setInterval"], now });
    let owner: string;
    let releaseRead!: () => void;
    let reachedRead!: () => void;
    const readReached = new Promise<void>((resolve) => { reachedRead = resolve; });
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    const renewals: unknown[][] = [];
    let claims = 0;
    const db = { async query(sql: string, params: unknown[] = []) {
      if (sql.includes("FROM tasks t") && sql.includes("LEFT JOIN provider_requests pr")) return { rows: [{
        task_id: "task", attempt_id: "attempt", provider_request_id: "provider", input_snapshot_json: {},
        // A durable handoff remains recoverable after the original artifact is pruned.
        provider_response_redacted_json: outcome === "healthy" ? {} : { artifact: { mediaType: "image", mimeType: "image/png", url: "https://example.test/image.png" } },
      }] };
      if (sql.includes("WITH claimed_task AS")) {
        claims += 1;
        owner = params[2] as string;
        assert.equal((params[3] as Date).getTime() - (params[4] as Date).getTime(), 300_000);
        return { rows: [{ claimed: true }] };
      }
      if (sql.includes("WITH renewed_task AS")) {
        renewals.push(params);
        assert.equal(params[2], owner);
        assert.equal((params[3] as Date).getTime() - (params[4] as Date).getTime(), 300_000);
        if (outcome === "database_error") throw new Error("simulated PostgreSQL timeout");
        return { rows: outcome === "lost" ? [] : [{ id: "attempt" }] };
      }
      if (sql.includes("attempt.locked_by AS attempt_owner")) return { rows: [{
        status: "running", locked_by: owner, attempt_owner: owner,
      }] };
      if (sql.includes("provider_status_json->'artifactHandoff'")) {
        reachedRead();
        await readGate;
        return { rows: [{ handoff: { mediaType: "image", attemptId: "attempt", storageObjectId: "storage",
          storageObjectKey: "image.png", contentType: "image/png", fetchedAt: now.toISOString() } }] };
      }
      if (sql.includes("SELECT true AS available")) return { rows: [{ available: true }] };
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("WITH released_task AS")) return { rows: [] };
      throw new Error(`unexpected artifact side effect: ${sql}`);
    } };
    const job = fetchGptImageArtifactJob(db as never, { taskId: "task", now, env: {}, runtime: {} as never });
    await readReached;
    try {
      const ticks = outcome === "healthy" ? 12 : 1;
      for (let tick = 0; tick < ticks; tick += 1) {
        t.mock.timers.tick(30_000);
        await setImmediate();
      }
      assert.equal(renewals.length, ticks);
      assert.equal(claims, 1);
      releaseRead();
      assert.deepEqual(await job, outcome === "healthy"
        ? { status: "succeeded" }
        : { status: "failed", failureCode: "generation_artifact_lease_busy" });
      t.mock.timers.tick(30_000);
      await setImmediate();
      assert.equal(renewals.length, ticks, "completion must stop the heartbeat");
    } finally {
      releaseRead();
      await job.catch(() => undefined);
      t.mock.timers.reset();
    }
  });
}
