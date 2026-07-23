import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb, listIndexNames } from "../../shared/db/test-db.ts";

describe("creator canvas final schema", () => {
  it("roots canvases by creating user and children by canvas", async () => {
    const db = await createMigratedTestDb();
    try {
      const projectIndexes = await listIndexNames(db, "creator_canvas_projects");
      assert.equal(projectIndexes.includes("creator_canvas_projects_project_active_idx"), false);
      assert.ok(projectIndexes.includes("creator_canvas_projects_user_created_idx"));
      const columns = await db.query<{ table_name: string; column_name: string }>(
        `
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = ANY($1::text[])
            AND column_name = ANY($2::text[])
        `,
        [
          ["creator_canvas_projects", "creator_canvas_documents", "team_member_canvases", "creator_canvas_node_runs"],
          ["project_id", "is_standalone", "episode_id"],
        ],
      );
      assert.deepEqual(columns.rows, []);
      const artifactIndexes = await listIndexNames(db, "creator_canvas_node_artifacts");
      assert.ok(artifactIndexes.includes("creator_canvas_node_artifacts_selected_role_uidx"));
    } finally {
      await db.close();
    }
  });
});
