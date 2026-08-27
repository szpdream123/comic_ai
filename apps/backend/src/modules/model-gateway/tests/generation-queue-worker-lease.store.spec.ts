import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  markGenerationQueueWorkerNotReady,
  markGenerationQueueWorkerReady,
  reconcileGenerationQueueWorkerLeases,
  releaseGenerationQueueWorkerLeases,
} from "../generation-queue-worker-lease.store.ts";

describe("generation queue worker leases", { concurrency: false }, () => {
  it("assigns distinct queues and lets a live worker take over expired leases", async () => {
    const db = await createMigratedTestDb();
    try {
      const migration = await readFile(
        join(process.cwd(), "packages", "db", "migrations", "20260725-generation-queue-worker-leases.sql"),
        "utf8",
      );
      await db.query(migration);
      const dbClockMigration = await readFile(
        join(process.cwd(), "packages", "db", "migrations", "20260727-generation-queue-worker-lease-db-clock.sql"),
        "utf8",
      );
      await db.query(dbClockMigration);
      const readinessMigration = await readFile(
        join(process.cwd(), "packages", "db", "migrations", "20260827-generation-queue-worker-readiness.sql"),
        "utf8",
      );
      await db.query(readinessMigration);
      await db.query(`
        INSERT INTO generation_queue_routes (route_key, route_code)
        VALUES ('lease-route', 'rlease');
        INSERT INTO generation_queue_shards (
          id, media_type, stage, route_key, route_code, shard_no, queue_name, admitted_count
        ) VALUES
          ('75000000-0000-4000-8000-000000000001', 'video', 'submit', 'lease-route', 'rlease', 0, 'generation-video-submit-rlease-000', 1),
          ('75000000-0000-4000-8000-000000000002', 'video', 'submit', 'lease-route', 'rlease', 1, 'generation-video-submit-rlease-001', 1),
          ('75000000-0000-4000-8000-000000000003', 'video', 'submit', 'lease-route', 'rlease', 2, 'generation-video-submit-rlease-002', 1);
      `);
      const candidates = [
        "generation-video-submit-rlease-000",
        "generation-video-submit-rlease-001",
        "generation-video-submit-rlease-002",
      ];
      const now = new Date("2026-07-25T00:00:00.000Z");

      assert.deepEqual(await reconcileGenerationQueueWorkerLeases(db, {
        ownerId: "worker-a", candidateQueueNames: candidates, limit: 2, now, leaseMs: 20_000,
      }), candidates.slice(0, 2));
      assert.equal(await markGenerationQueueWorkerReady(db, {
        ownerId: "worker-a", queueName: candidates[0],
      }), true);
      assert.equal((await db.query<{ worker_ready_at: Date | null }>(
        `SELECT worker_ready_at FROM generation_queue_worker_leases WHERE queue_name = $1`,
        [candidates[0]],
      )).rows[0]?.worker_ready_at instanceof Date, true);
      assert.equal(await markGenerationQueueWorkerNotReady(db, {
        ownerId: "worker-a", queueName: candidates[0],
      }), true);
      assert.equal((await db.query<{ worker_ready_at: Date | null }>(
        `SELECT worker_ready_at FROM generation_queue_worker_leases WHERE queue_name = $1`,
        [candidates[0]],
      )).rows[0]?.worker_ready_at, null);
      assert.equal(await markGenerationQueueWorkerReady(db, {
        ownerId: "worker-a", queueName: candidates[0],
      }), true);
      assert.deepEqual(await reconcileGenerationQueueWorkerLeases(db, {
        ownerId: "worker-b", candidateQueueNames: candidates, limit: 2, now, leaseMs: 20_000,
      }), candidates.slice(2));

      assert.deepEqual(await reconcileGenerationQueueWorkerLeases(db, {
        ownerId: "worker-b",
        candidateQueueNames: candidates,
        limit: 2,
        now: new Date("2099-01-01T00:00:00.000Z"),
        leaseMs: 20_000,
      }), candidates.slice(2));
      await db.query(`
        UPDATE generation_queue_worker_leases
        SET lease_until = clock_timestamp() - interval '1 millisecond'
      `);
      assert.deepEqual(await reconcileGenerationQueueWorkerLeases(db, {
        ownerId: "worker-b", candidateQueueNames: candidates, limit: 2, now, leaseMs: 20_000,
      }), candidates.slice(0, 2));
      const takenOverLease = await db.query<{ owner_id: string; worker_ready_at: Date | null }>(
        `SELECT owner_id, worker_ready_at FROM generation_queue_worker_leases WHERE queue_name = $1`,
        [candidates[0]],
      );
      assert.deepEqual(takenOverLease.rows[0], { owner_id: "worker-b", worker_ready_at: null });
      assert.equal(await releaseGenerationQueueWorkerLeases(db, "worker-b"), 2);
      const leases = await db.query(`SELECT queue_name FROM generation_queue_worker_leases`);
      assert.deepEqual(leases.rows, []);
    } finally {
      await db.close();
    }
  });
});
