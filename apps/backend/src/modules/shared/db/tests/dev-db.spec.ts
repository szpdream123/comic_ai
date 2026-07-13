import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEmptyTestDb, listTableNames } from "../test-db.ts";
import { ensureFoundationSchema } from "../dev-db.ts";

describe("development database schema", { concurrency: false }, () => {
  it("applies the complete migration chain without recreating removed scope tables", async () => {
    const db = await createEmptyTestDb();
    try {
      await ensureFoundationSchema(db);
      const tables = await listTableNames(db);
      assert.ok(tables.includes("users"));
      assert.ok(tables.includes("projects"));
      assert.ok(tables.includes("user_memberships"));
      assert.equal(tables.includes("organi" + "zations"), false);
      assert.equal(tables.includes("work" + "spaces"), false);
    } finally {
      await db.close();
    }
  });
});
