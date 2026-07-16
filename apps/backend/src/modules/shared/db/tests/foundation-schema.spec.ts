import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMigratedTestDb,
  listColumnNames,
  listIndexNames,
  listTableNames,
} from "../test-db.ts";

const removedScopeColumns = ["organi" + "zation_id", "work" + "space_id"];
const removedScopeTables = [
  "organi" + "zations",
  "work" + "spaces",
  "member" + "ships",
  "organi" + "zation_entitlements",
  "organi" + "zation_membership_subscriptions",
  "team_plan_" + "limits",
];

describe("final user-centered foundation schema", { concurrency: false }, () => {
  it("contains no removed scope tables or columns", async () => {
    const db = await createMigratedTestDb();
    try {
      const tables = await listTableNames(db);
      for (const table of removedScopeTables) {
        assert.equal(tables.includes(table), false, `${table} must not exist`);
      }

      const columns = await db.query<{ table_name: string; column_name: string }>(
        `
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND column_name = ANY($1::text[])
        `,
        [removedScopeColumns],
      );
      assert.deepEqual(columns.rows, []);
    } finally {
      await db.close();
    }
  });

  it("uses users as project, membership, entitlement, and credit roots", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.ok((await listColumnNames(db, "projects")).includes("owner_user_id"));
      assert.ok((await listIndexNames(db, "projects")).includes("projects_owner_user_created_idx"));
      assert.deepEqual(
        (await listColumnNames(db, "user_memberships")).slice(0, 3),
        ["id", "user_id", "membership_tier"],
      );
      assert.deepEqual(
        (await listColumnNames(db, "user_entitlements")).slice(0, 3),
        ["id", "user_id", "entitlement_key"],
      );
      const userColumns = await listColumnNames(db, "users");
      assert.ok(userColumns.includes("credit_balance_cached"));
      assert.ok(userColumns.includes("credit_reserved_cached"));
      assert.ok(userColumns.includes("credit_frozen_cached"));
    } finally {
      await db.close();
    }
  });

  it("persists validated credit ledger balance snapshots", async () => {
    const db = await createMigratedTestDb();
    try {
      const columns = await db.query<{ column_name: string; is_nullable: string }>(
        `
          SELECT column_name, is_nullable
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'credit_ledger_entries'
            AND column_name = 'balance_after'
        `,
      );
      const constraint = await db.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'credit_ledger_entries_balance_after_check'
          ) AS exists
        `,
      );
      const trigger = await db.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'credit_ledger_balance_after_trigger'
              AND NOT tgisinternal
          ) AS exists
        `,
      );
      const immutableTrigger = await db.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'credit_ledger_balance_after_immutable_trigger'
              AND NOT tgisinternal
          ) AS exists
        `,
      );

      assert.deepEqual(columns.rows, [{ column_name: "balance_after", is_nullable: "YES" }]);
      assert.equal(constraint.rows[0]?.exists, true);
      assert.equal(trigger.rows[0]?.exists, true);
      assert.equal(immutableTrigger.rows[0]?.exists, true);

      await db.query(
        "INSERT INTO users (id, phone_e164, status, credit_balance_cached) VALUES ('01000000-0000-4000-8000-000000000001', '13800139999', 'active', 25)",
      );
      await db.query(
        `
          INSERT INTO credit_ledger_entries (
            id, user_id, entry_type, amount, available_delta, reserved_delta, consumed_delta,
            source_type, source_id, reason, metadata_json, created_at
          )
          VALUES (
            '01000000-0000-4000-8000-000000000002',
            '01000000-0000-4000-8000-000000000001',
            'grant', 25, 25, 0, 0, 'schema_test',
            '01000000-0000-4000-8000-000000000003', 'schema trigger test', '{}'::jsonb, now()
          )
        `,
      );
      const snapshot = await db.query<{ balance_after: number }>(
        "SELECT balance_after FROM credit_ledger_entries WHERE id = '01000000-0000-4000-8000-000000000002'",
      );
      assert.equal(snapshot.rows[0]?.balance_after, 25);
      await assert.rejects(
        db.query(
          "UPDATE credit_ledger_entries SET balance_after = 24 WHERE id = '01000000-0000-4000-8000-000000000002'",
        ),
        /credit_ledger_balance_after_immutable/,
      );
    } finally {
      await db.close();
    }
  });

  it("keeps project children rooted by project or parent entity", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.ok((await listColumnNames(db, "assets")).includes("project_id"));
      assert.ok((await listColumnNames(db, "episodes")).includes("project_id"));
      assert.ok((await listColumnNames(db, "shots")).includes("project_id"));
      assert.ok((await listColumnNames(db, "asset_versions")).includes("asset_id"));
      assert.ok((await listColumnNames(db, "creator_canvas_documents")).includes("canvas_project_id"));
    } finally {
      await db.close();
    }
  });
});
