import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb, listColumnNames, listIndexNames } from "../test-db.ts";

describe("episode workbench final schema", () => {
  it("keeps draft modes, episode export binding, and project-rooted indexes", async () => {
    const db = await createMigratedTestDb();
    try {
      const shotColumns = await listColumnNames(db, "shots");
      assert.ok(shotColumns.includes("scene_analysis"));
      assert.ok(shotColumns.includes("plot_preview"));
      assert.ok(shotColumns.includes("prompt_draft"));
      assert.ok((await listColumnNames(db, "export_records")).includes("episode_id"));
      assert.ok((await listColumnNames(db, "episode_generation_drafts")).includes("mode"));
      assert.ok((await listIndexNames(db, "episode_generation_drafts")).includes("episode_generation_drafts_target_uidx"));
      assert.ok((await listIndexNames(db, "shots")).includes("shots_episode_sort_user_idx"));
    } finally {
      await db.close();
    }
  });
});
