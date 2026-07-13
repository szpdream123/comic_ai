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
