import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMigratedTestDb,
  listColumnNames,
  listIndexNames,
  listTableNames,
} from "../test-db.ts";

describe("director desk schema", { concurrency: false }, () => {
  it("stores desks under the main user with an optional child-account creator", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.ok((await listTableNames(db)).includes("director_desks"));
      assert.deepEqual(await listColumnNames(db, "director_desks"), [
        "id",
        "user_id",
        "created_by_member_id",
        "desk_key",
        "name",
        "scene_json",
        "status",
        "sort_order",
        "created_at",
        "updated_at",
        "last_opened_at",
      ]);
      assert.ok((await listIndexNames(db, "director_desks")).includes("director_desks_user_status_updated_idx"));

      await db.query(`
        INSERT INTO users (id, phone_e164, status)
        VALUES
          ('04000000-0000-4000-8000-000000000001', '13800134001', 'active'),
          ('04000000-0000-4000-8000-000000000002', '13800134002', 'active')
      `);
      await db.query(`
        INSERT INTO team_members (
          id, user_id, member_account, member_account_suffix, member_login_account,
          member_name, member_password_hash, status
        )
        VALUES (
          '04000000-0000-4000-8000-000000000003',
          '04000000-0000-4000-8000-000000000001',
          'director', 'member1', 'director@member1', 'Director', 'hash', 'active'
        )
      `);
      await db.query(`
        INSERT INTO director_desks (
          id, user_id, created_by_member_id, desk_key, name, scene_json, sort_order
        )
        VALUES (
          '04000000-0000-4000-8000-000000000004',
          '04000000-0000-4000-8000-000000000001',
          '04000000-0000-4000-8000-000000000003',
          'desk_1', 'Director Desk 1', '{"version":1}'::jsonb, 1
        )
      `);

      await assert.rejects(
        db.query(`
          INSERT INTO director_desks (id, user_id, desk_key, name)
          VALUES (
            '04000000-0000-4000-8000-000000000005',
            '04000000-0000-4000-8000-000000000001',
            'desk_1', 'Duplicate Desk'
          )
        `),
        /director_desks_user_desk_key_key/,
      );
      await assert.rejects(
        db.query(`
          INSERT INTO director_desks (id, user_id, created_by_member_id, desk_key, name)
          VALUES (
            '04000000-0000-4000-8000-000000000006',
            '04000000-0000-4000-8000-000000000002',
            '04000000-0000-4000-8000-000000000003',
            'desk_2', 'Cross-user Desk'
          )
        `),
        /director_desks_created_by_member_id_user_id_fkey/,
      );
    } finally {
      await db.close();
    }
  });
});
