import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applySqlMigration } from "../migrations.ts";
import { createEmptyTestDb } from "../test-db.ts";

describe("project cover storage object backfill migration", () => {
  it("backfills only the available object in the same project and COS bucket", async () => {
    const db = await createEmptyTestDb();
    try {
      await db.query(`
        CREATE TABLE projects (
          id uuid PRIMARY KEY,
          cover_image_url text,
          cover_storage_object_id uuid
        );
        CREATE TABLE storage_objects (
          id uuid PRIMARY KEY,
          project_id uuid,
          bucket text NOT NULL,
          object_key text NOT NULL,
          status text NOT NULL,
          deleted_at timestamptz
        );
      `);
      await db.query(`
        INSERT INTO projects (id, cover_image_url)
        VALUES
          ('00000000-0000-0000-0000-000000000001', 'https://comic-1250000000.cos.ap-guangzhou.myqcloud.com/covers%2Flegacy%20cover.png'),
          ('00000000-0000-0000-0000-000000000002', 'https://comic-1250000000.cos.ap-guangzhou.myqcloud.com/covers%2Fmissing.png');
        INSERT INTO storage_objects (id, project_id, bucket, object_key, status, deleted_at)
        VALUES
          ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'comic-1250000000', 'covers/legacy cover.png', 'available', NULL),
          ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'other-1250000000', 'covers/legacy cover.png', 'available', NULL),
          ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 'comic-1250000000', 'covers/missing.png', 'deleted', NULL);
      `);

      await applySqlMigration(db, process.cwd(), "20260909-backfill-project-cover-storage-objects.sql");
      await applySqlMigration(db, process.cwd(), "20260909-backfill-project-cover-storage-objects.sql");

      const covers = await db.query<{ id: string; cover_storage_object_id: string | null }>(`
        SELECT id, cover_storage_object_id
        FROM projects
        ORDER BY id
      `);
      assert.deepEqual(covers.rows, [
        {
          id: "00000000-0000-0000-0000-000000000001",
          cover_storage_object_id: "00000000-0000-0000-0000-000000000011",
        },
        {
          id: "00000000-0000-0000-0000-000000000002",
          cover_storage_object_id: null,
        },
      ]);
    } finally {
      await db.close();
    }
  });
});
