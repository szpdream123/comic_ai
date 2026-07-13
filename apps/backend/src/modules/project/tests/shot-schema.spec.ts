import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb, listColumnNames, listIndexNames } from "../../shared/db/test-db.ts";

describe("shot final schema", () => {
  it("roots shots by project and optional episode", async () => {
    const db = await createMigratedTestDb();
    try {
      const columns = await listColumnNames(db, "shots");
      assert.ok(columns.includes("project_id"));
      assert.ok(columns.includes("episode_id"));
      const indexes = await listIndexNames(db, "shots");
      assert.ok(indexes.includes("shots_project_created_idx"));
      assert.ok(indexes.includes("shots_episode_sort_user_idx"));
    } finally {
      await db.close();
    }
  });
});
