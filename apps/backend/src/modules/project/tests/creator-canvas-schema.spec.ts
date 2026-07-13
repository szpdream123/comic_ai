import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb, listIndexNames } from "../../shared/db/test-db.ts";

describe("creator canvas final schema", () => {
  it("roots canvases by project or creating user and children by canvas", async () => {
    const db = await createMigratedTestDb();
    try {
      const projectIndexes = await listIndexNames(db, "creator_canvas_projects");
      assert.ok(projectIndexes.includes("creator_canvas_projects_project_uidx"));
      assert.ok(projectIndexes.includes("creator_canvas_projects_user_created_idx"));
      const artifactIndexes = await listIndexNames(db, "creator_canvas_node_artifacts");
      assert.ok(artifactIndexes.includes("creator_canvas_node_artifacts_selected_role_uidx"));
    } finally {
      await db.close();
    }
  });
});
