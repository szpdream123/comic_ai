import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";

const migrationUrl = new URL(
  "../../../../../../packages/db/migrations/20260722-canvas-generation-scope.sql",
  import.meta.url,
);

describe("canvas generation scope migration", () => {
  it("runs before canvas project columns are removed and only rebinds explicit canvas run links", async () => {
    assert.ok(
      "20260722-canvas-generation-scope.sql" < "20260722-decouple-canvases-from-projects.sql",
    );
    const sql = await readFile(migrationUrl, "utf8");
    assert.match(sql, /FROM creator_canvas_node_runs/);
    assert.match(sql, /FROM creator_canvas_node_artifacts/);
    assert.match(sql, /RAISE EXCEPTION 'ambiguous_canvas_generation_scope'/);
    assert.doesNotMatch(
      sql,
      /canvas\.project_id\s*=\s*(?:workflow|task|snapshot|request|object|asset)\.project_id/,
    );
  });

  it("adds an exclusive canvas owner scope to each generation persistence table", async () => {
    const db = await createMigratedTestDb();
    try {
      const expected = new Map([
        ["ai_generation_task_snapshots", "canvas_project_id"],
        ["assets", "canvas_project_id"],
        ["credit_reservations", "canvas_project_id"],
        ["project_upload_records", "canvas_project_id"],
        ["provider_requests", "canvas_project_id"],
        ["storage_objects", "canvas_project_id"],
        ["task_attempts", "canvas_project_id"],
        ["tasks", "canvas_project_id"],
        ["user_model_request_logs", "canvas_project_id"],
        ["workflows", "canvas_project_id"],
      ]);
      const columns = await db.query<{ table_name: string; column_name: string }>(
        `
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = ANY($1::text[])
            AND column_name = 'canvas_project_id'
          ORDER BY table_name
        `,
        [[...expected.keys()]],
      );
      assert.deepEqual(new Map(columns.rows.map((row) => [row.table_name, row.column_name])), expected);
    } finally {
      await db.close();
    }
  });
});
