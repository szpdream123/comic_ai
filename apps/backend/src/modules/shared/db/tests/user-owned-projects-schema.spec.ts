import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMigratedTestDb,
  listColumnNames,
  listIndexNames,
} from "../test-db.ts";

describe("user-owned projects schema", () => {
  it("stores the canonical project owner as a user", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.ok((await listColumnNames(db, "projects")).includes("owner_user_id"));
      assert.ok((await listIndexNames(db, "projects")).includes("projects_owner_user_created_idx"));

      await db.query(`
        INSERT INTO users (id, phone_e164, status)
        VALUES ('00000000-0000-4000-8000-000000000001', '13800138001', 'active')
      `);


      await db.query(`
        INSERT INTO projects (
        id,
        owner_user_id,
        created_by_user_id,
        name,
        aspect_ratio,
        resolution,
        phase
      )
        VALUES ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'User Owned Project', '9:16', '1080p', 'script_input')
      `);

      const project = await db.query<{ owner_user_id: string }>(
        "SELECT owner_user_id FROM projects WHERE id = $1",
        ["30000000-0000-4000-8000-000000000001"],
      );
      assert.equal(
        project.rows[0]?.owner_user_id,
        "00000000-0000-4000-8000-000000000001",
      );
    } finally {
      await db.close();
    }
  });
});
