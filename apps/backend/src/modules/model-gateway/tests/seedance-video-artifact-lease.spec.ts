import assert from "node:assert/strict";
import { it } from "node:test";
import { setImmediate } from "node:timers/promises";
import { fetchSeedanceVideoArtifactJob, finalizeSeedanceVideoArtifactJob, persistSeedanceVideoArtifactJob } from "../seedance-video.worker.ts";
import { resolveGenerationArtifactQueueExhaustionFailureCode } from "../generation-skipped-coordinator.ts";
import { failGenerationTaskAfterQueueError } from "../generation-redis-repair.service.ts";

const now = new Date("2026-09-27T07:00:00.000Z");
const task = { task_id: "task", attempt_id: "attempt", current_attempt_id: "attempt", provider_attempt_id: "attempt",
  task_status: "running", provider_request_id: "provider", external_request_id: "external", input_snapshot_json: {},
  provider_response_redacted_json: { videoUrl: "https://example.test/video.mp4" } };
const handoff = { mediaType: "video", attemptId: "attempt", storageObjectId: "storage", storageObjectKey: "video.mp4",
  contentType: "video/mp4", fetchedAt: now.toISOString() };
const input = { taskId: "task", expectedAttemptId: "attempt", now, env: {}, runtime: {} as never };

for (const [stage, processor] of Object.entries({ fetch: fetchSeedanceVideoArtifactJob,
  finalize: finalizeSeedanceVideoArtifactJob, persist: persistSeedanceVideoArtifactJob })) {
  it(`video ${stage} preserves a busy lease as retryable contention`, async () => {
    const db = { async query(sql: string) {
      if (sql.includes("FROM tasks t") && sql.includes("LEFT JOIN provider_requests pr")) return { rows: [task] };
      if (sql.includes("t.status AS task_status")) return { rows: [{ task_status: "running" }] };
      return { rows: [] };
    } };
    assert.deepEqual(await processor(db as never, input), { status: "failed", failureCode: "generation_artifact_lease_busy" });
  });
}

for (const outcome of ["healthy", "lost", "database_error"] as const) {
  it(`video handoff is guarded through heartbeat and released: ${outcome}`, async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setInterval"], now });
    let owner: string;
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const paused = new Promise<void>(resolve => { reached = resolve; });
    let claims = 0, renewals = 0, releases = 0;
    const db = { async query(sql: string, params: unknown[] = []) {
      if (sql.includes("FROM tasks t") && sql.includes("LEFT JOIN provider_requests pr")) return { rows: [{ ...task,
        provider_response_redacted_json: outcome === "healthy" ? { artifactUrlRequiresRefresh: true } : task.provider_response_redacted_json }] };
      if (sql.includes("WITH claimed_task AS")) {
        claims++; owner = params[2] as string;
        assert.equal((params[3] as Date).getTime() - (params[4] as Date).getTime(), 300_000);
        return { rows: [{ claimed: true }] };
      }
      if (sql.includes("WITH renewed_task AS")) {
        renewals++; assert.equal(params[2], owner);
        if (outcome === "database_error") throw new Error("simulated renewal failure");
        return { rows: outcome === "lost" ? [] : [{ id: "attempt" }] };
      }
      if (sql.includes("WITH released_task AS")) { releases++; assert.equal(params[2], owner); return { rows: [] }; }
      if (sql.includes("attempt.locked_by AS attempt_owner")) return { rows: [{ status: "running", locked_by: owner, attempt_owner: owner }] };
      if (sql.includes("provider_status_json->'artifactHandoff'")) { reached(); await gate; return { rows: [{ handoff }] }; }
      if (sql.includes("SELECT true AS available")) return { rows: [{ available: true }] };
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
      throw new Error(`unexpected video side effect: ${sql}`);
    } };
    const job = fetchSeedanceVideoArtifactJob(db as never, input);
    await paused;
    try {
      assert.equal(claims, 1, "handoff recovery must run after claiming the lease");
      for (let tick = 0; tick < (outcome === "healthy" ? 12 : 1); tick++) {
        t.mock.timers.tick(30_000); await setImmediate();
      }
      assert.equal(renewals, outcome === "healthy" ? 12 : 1);
      if (outcome !== "healthy") {
        t.mock.timers.tick(60_000); await setImmediate();
        assert.equal(renewals, 1, "a lost owner must never renew again while its IO is still pending");
      }
      release();
      assert.deepEqual(await job, outcome === "healthy" ? { status: "succeeded" }
        : { status: "failed", failureCode: "generation_artifact_lease_busy" });
      assert.equal(releases, 1);
      const previous = renewals;
      t.mock.timers.tick(30_000); await setImmediate();
      assert.equal(renewals, previous);
    } finally { release(); await job.catch(() => undefined); t.mock.timers.reset(); }
  });
}

for (const failureCode of ["generation_artifact_lease_busy", "provider_output_storage_failed"]) {
  it(`video queue exhaustion leaves the live owner untouched: ${failureCode}`, async () => {
    const effects: string[] = [];
    const db = { async query(sql: string) {
      if (sql.includes("FOR UPDATE OF task")) return { rows: [{ task_id: "task", current_attempt_id: "attempt",
        task_type: "episode_generate_video", locked_by: "seedance-video-finalizer:current",
        locked_until: new Date(now.getTime() + 300_000), input_snapshot_json: {} }] };
      if (!['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) effects.push(sql);
      return { rows: [] };
    } };
    assert.equal(await failGenerationTaskAfterQueueError(db as never, { taskId: "task", expectedAttemptId: "attempt",
      failureCode: resolveGenerationArtifactQueueExhaustionFailureCode(failureCode), creditOutcome: "manual_review_required", displayMessage: "queue exhausted", now }), false);
    assert.deepEqual(effects, []);
  });
}
