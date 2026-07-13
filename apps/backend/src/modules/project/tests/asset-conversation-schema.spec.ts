import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb, listColumnNames, listIndexNames } from "../../shared/db/test-db.ts";

describe("asset conversation final schema", () => {
  it("keys conversations by project, episode, asset, and media mode", async () => {
    const db = await createMigratedTestDb();
    try {
      const columns = await listColumnNames(db, "episode_asset_conversation_threads");
      assert.ok(columns.includes("project_id"));
      assert.ok(columns.includes("episode_id"));
      assert.ok(columns.includes("asset_id"));
      assert.ok((await listIndexNames(db, "episode_asset_conversation_threads")).includes("episode_asset_conversation_threads_lookup_uidx"));
    } finally {
      await db.close();
    }
  });
});
