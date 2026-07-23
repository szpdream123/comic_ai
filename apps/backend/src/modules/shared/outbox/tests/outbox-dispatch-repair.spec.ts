import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";

import { createMigratedTestDb } from "../../db/test-db.ts";
import type { SqlDatabase } from "../../db/sql.ts";
import { claimOutboxEventsForDispatch } from "../outbox-dispatch-repair.service.ts";

describe("persistent outbox dispatch repair", () => {
  it("claims available pending, failed, and stale processing events in a bounded batch", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOutboxEvents(db);
      const first = await claimOutboxEventsForDispatch(db, {
        now: new Date("2026-05-09T10:00:00.000Z"),
        limit: 3,
      });
      const second = await claimOutboxEventsForDispatch(db, {
        now: new Date("2026-05-09T10:00:30.000Z"),
        limit: 3,
      });

      assert.deepEqual(
        first.map((event) => event.id),
        [
          "90000000-0000-4000-8000-000000000001",
          "90000000-0000-4000-8000-000000000002",
          "90000000-0000-4000-8000-000000000003",
        ],
      );
      assert.deepEqual(second, []);
      assert.deepEqual(
        first.map((event) => event.status),
        ["processing", "processing", "processing"],
      );
    } finally {
      await db.close();
    }
  });

  it("gives each user one event before filling the remaining batch slots", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUsers(db);
      await db.query(`
        INSERT INTO outbox_events (
          id, user_id, event_type, payload_json, status, available_at, created_at, updated_at
        )
        VALUES
          ('90000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000101', 'task.succeeded', '{}', 'pending', '2026-05-09T09:59:00.000Z', '2026-05-09T09:59:00.000Z', '2026-05-09T09:59:00.000Z'),
          ('90000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000101', 'task.succeeded', '{}', 'pending', '2026-05-09T09:59:01.000Z', '2026-05-09T09:59:01.000Z', '2026-05-09T09:59:01.000Z'),
          ('90000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000101', 'task.succeeded', '{}', 'pending', '2026-05-09T09:59:02.000Z', '2026-05-09T09:59:02.000Z', '2026-05-09T09:59:02.000Z'),
          ('90000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000102', 'task.succeeded', '{}', 'pending', '2026-05-09T09:59:03.000Z', '2026-05-09T09:59:03.000Z', '2026-05-09T09:59:03.000Z'),
          ('90000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000103', 'task.succeeded', '{}', 'pending', '2026-05-09T09:59:04.000Z', '2026-05-09T09:59:04.000Z', '2026-05-09T09:59:04.000Z')
      `);

      await claimOutboxEventsForDispatch(db, {
        now: new Date("2026-05-09T10:00:00.000Z"),
        limit: 4,
      });

      const rows = await db.query<{ user_id: string; count: number }>(`
        SELECT user_id, count(*)::int AS count
        FROM outbox_events
        WHERE status = 'processing'
        GROUP BY user_id
        ORDER BY user_id
      `);
      assert.deepEqual(rows.rows, [
        { user_id: "00000000-0000-4000-8000-000000000101", count: 2 },
        { user_id: "00000000-0000-4000-8000-000000000102", count: 1 },
        { user_id: "00000000-0000-4000-8000-000000000103", count: 1 },
      ]);
    } finally {
      await db.close();
    }
  });

  it("keeps concurrent fair claims disjoint under skip-locked contention", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUsers(db);
      await db.query(`
        INSERT INTO outbox_events (
          id, user_id, event_type, payload_json, status, available_at, created_at, updated_at
        )
        SELECT
          ('90000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
          ('00000000-0000-4000-8000-' || lpad((100 + ((sequence - 1) % 3) + 1)::text, 12, '0'))::uuid,
          'task.succeeded',
          '{}'::jsonb,
          'pending',
          '2026-05-09T09:59:00.000Z'::timestamptz + sequence * interval '1 millisecond',
          '2026-05-09T09:59:00.000Z'::timestamptz + sequence * interval '1 millisecond',
          '2026-05-09T09:59:00.000Z'::timestamptz
        FROM generate_series(21, 26) AS sequence
      `);

      const now = new Date("2026-05-09T10:00:00.000Z");
      const [first, second] = await Promise.all([
        claimOutboxEventsForDispatch(db, { now, limit: 3 }),
        claimOutboxEventsForDispatch(db, { now, limit: 3 }),
      ]);
      const claimedIds = [...first, ...second].map((event) => event.id);

      assert.equal(first.length, 3);
      assert.equal(second.length, 3);
      assert.equal(new Set(claimedIds).size, 6);
      assert.deepEqual(
        [...new Set(first.map((event) => event.userId))].sort(),
        [
          "00000000-0000-4000-8000-000000000101",
          "00000000-0000-4000-8000-000000000102",
          "00000000-0000-4000-8000-000000000103",
        ],
      );
      assert.deepEqual(
        [...new Set(second.map((event) => event.userId))].sort(),
        [
          "00000000-0000-4000-8000-000000000101",
          "00000000-0000-4000-8000-000000000102",
          "00000000-0000-4000-8000-000000000103",
        ],
      );
    } finally {
      await db.close();
    }
  });

  it("persists fair cursors across batches", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      await seedFairCursorEvents(db);
      const input = {
        now: new Date("2026-05-09T10:00:00.000Z"),
        limit: 5,
        eventTypes: ["generation.task.created"],
        fairnessScope: "generation-test",
        membershipQuantum: 2,
      };
      const first = await claimOutboxEventsForDispatch(db, input);
      const second = await claimOutboxEventsForDispatch(db, input);

      assert.deepEqual(first.map((event) => event.id), [
        "90000000-0000-4000-8000-000000000031",
        "90000000-0000-4000-8000-000000000033",
        "90000000-0000-4000-8000-000000000035",
        "90000000-0000-4000-8000-000000000037",
        "90000000-0000-4000-8000-000000000038",
      ]);
      assert.deepEqual(second.map((event) => event.id), [
        "90000000-0000-4000-8000-000000000032",
        "90000000-0000-4000-8000-000000000034",
        "90000000-0000-4000-8000-000000000036",
        "90000000-0000-4000-8000-000000000039",
        "90000000-0000-4000-8000-000000000040",
      ]);
    } finally {
      await db.close();
    }
  });

  it("keeps fair claims disjoint across independent PostgreSQL connections", async () => {
    const db = await createMigratedTestDb();
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const firstClient = await pool.connect();
    const secondClient = await pool.connect();
    try {
      await seedUsers(db);
      await seedFairCursorEvents(db);
      const schema = (await db.query<{ current_schema: string }>("SELECT current_schema()"))
        .rows[0]!.current_schema;
      await firstClient.query(`SET search_path TO "${schema}"`);
      await secondClient.query(`SET search_path TO "${schema}"`);
      const firstDb = sqlDatabaseForClient(firstClient);
      const secondDb = sqlDatabaseForClient(secondClient);
      const input = {
        now: new Date("2026-05-09T10:00:00.000Z"),
        limit: 5,
        eventTypes: ["generation.task.created"],
        fairnessScope: "generation-concurrent-test",
        membershipQuantum: 2,
      };

      const [first, second] = await Promise.all([
        claimOutboxEventsForDispatch(firstDb, input),
        claimOutboxEventsForDispatch(secondDb, input),
      ]);
      const ids = [...first, ...second].map((event) => event.id);
      assert.equal(ids.length, 10);
      assert.equal(new Set(ids).size, 10);
    } finally {
      firstClient.release();
      secondClient.release();
      await pool.end();
      await db.close();
    }
  });
});

function sqlDatabaseForClient(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): SqlDatabase {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await client.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
}

async function seedUsers(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(`
    INSERT INTO users (id, phone_e164, status)
    VALUES
      ('00000000-0000-4000-8000-000000000101', '13900000101', 'active'),
      ('00000000-0000-4000-8000-000000000102', '13900000102', 'active'),
      ('00000000-0000-4000-8000-000000000103', '13900000103', 'active')
  `);
}

async function seedFairCursorEvents(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(`
    INSERT INTO outbox_events (
      id, user_id, event_type, payload_json, status, available_at, created_at, updated_at
    )
    VALUES
      ('90000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000101', 'generation.task.created', '{"membershipPriority":true,"teamMemberId":"child-a"}', 'pending', '2026-05-09T09:59:00Z', '2026-05-09T09:59:00Z', '2026-05-09T09:59:00Z'),
      ('90000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000101', 'generation.task.created', '{"membershipPriority":true,"teamMemberId":"child-a"}', 'pending', '2026-05-09T09:59:01Z', '2026-05-09T09:59:01Z', '2026-05-09T09:59:01Z'),
      ('90000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000101', 'generation.task.created', '{"membershipPriority":true,"teamMemberId":"child-b"}', 'pending', '2026-05-09T09:59:02Z', '2026-05-09T09:59:02Z', '2026-05-09T09:59:02Z'),
      ('90000000-0000-4000-8000-000000000034', '00000000-0000-4000-8000-000000000101', 'generation.task.created', '{"membershipPriority":true,"teamMemberId":"child-b"}', 'pending', '2026-05-09T09:59:03Z', '2026-05-09T09:59:03Z', '2026-05-09T09:59:03Z'),
      ('90000000-0000-4000-8000-000000000035', '00000000-0000-4000-8000-000000000102', 'generation.task.created', '{}', 'pending', '2026-05-09T09:59:04Z', '2026-05-09T09:59:04Z', '2026-05-09T09:59:04Z'),
      ('90000000-0000-4000-8000-000000000036', '00000000-0000-4000-8000-000000000102', 'generation.task.created', '{}', 'pending', '2026-05-09T09:59:05Z', '2026-05-09T09:59:05Z', '2026-05-09T09:59:05Z')
      ,('90000000-0000-4000-8000-000000000037', '00000000-0000-4000-8000-000000000103', 'generation.task.created', '{"membershipPriority":true}', 'pending', '2026-05-09T09:59:06Z', '2026-05-09T09:59:06Z', '2026-05-09T09:59:06Z')
      ,('90000000-0000-4000-8000-000000000038', '00000000-0000-4000-8000-000000000103', 'generation.task.created', '{"membershipPriority":true}', 'pending', '2026-05-09T09:59:07Z', '2026-05-09T09:59:07Z', '2026-05-09T09:59:07Z')
      ,('90000000-0000-4000-8000-000000000039', '00000000-0000-4000-8000-000000000103', 'generation.task.created', '{"membershipPriority":true}', 'pending', '2026-05-09T09:59:08Z', '2026-05-09T09:59:08Z', '2026-05-09T09:59:08Z')
      ,('90000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000103', 'generation.task.created', '{"membershipPriority":true}', 'pending', '2026-05-09T09:59:09Z', '2026-05-09T09:59:09Z', '2026-05-09T09:59:09Z')
  `);
}

async function seedOutboxEvents(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        event_type,
        payload_json,
        status,
        available_at,
        updated_at
      )
      VALUES
        (
          '90000000-0000-4000-8000-000000000001',
          'task.succeeded',
          '{}'::jsonb,
          'pending',
          '2026-05-09T09:59:00.000Z',
          '2026-05-09T09:59:00.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000002',
          'task.failed',
          '{}'::jsonb,
          'failed',
          '2026-05-09T09:59:10.000Z',
          '2026-05-09T09:59:10.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000003',
          'task.succeeded',
          '{}'::jsonb,
          'processing',
          '2026-05-09T09:59:20.000Z',
          '2026-05-09T09:55:00.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000004',
          'task.succeeded',
          '{}'::jsonb,
          'processing',
          '2026-05-09T09:59:30.000Z',
          '2026-05-09T09:59:45.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000005',
          'task.succeeded',
          '{}'::jsonb,
          'pending',
          '2026-05-09T10:05:00.000Z',
          '2026-05-09T09:59:00.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000006',
          'task.succeeded',
          '{}'::jsonb,
          'processed',
          '2026-05-09T09:59:00.000Z',
          '2026-05-09T09:59:00.000Z'
        )
    `,
  );
}
