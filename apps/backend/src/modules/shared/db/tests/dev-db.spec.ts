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

  it("repairs generated asset storage links when upgrading an existing schema", async () => {
    const db = await createEmptyTestDb();
    try {
      await ensureFoundationSchema(db);
      await db.query(`
        INSERT INTO users (id, phone_e164, status)
        VALUES ('51000000-0000-4000-8000-000000000001', '13800138101', 'active');
        INSERT INTO projects (id, name, aspect_ratio, resolution, phase, owner_user_id)
        VALUES ('51000000-0000-4000-8000-000000000002', 'Upgrade Project', '16:9', '1080p', 'script_input', '51000000-0000-4000-8000-000000000001');
        INSERT INTO assets (id, project_id, asset_type, asset_key, created_by_user_id)
        VALUES ('51000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000002', 'character_sheet', 'upgrade-character', '51000000-0000-4000-8000-000000000001');
        INSERT INTO storage_objects (id, project_id, bucket, object_key, content_type, created_by_user_id)
        VALUES ('51000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000002', 'generated', 'generated/upgrade-character.png', 'image/png', '51000000-0000-4000-8000-000000000001');
        INSERT INTO asset_versions (id, asset_id, version_number, storage_object_key, metadata_json, created_by_user_id)
        VALUES (
          '51000000-0000-4000-8000-000000000005',
          '51000000-0000-4000-8000-000000000003',
          1,
          'legacy-placeholder',
          '{"generationStatus":"completed","generationResult":{"result":{"storageObjectId":"51000000-0000-4000-8000-000000000004","imageUrl":"https://example.com/upgrade-character.png"}}}'::jsonb,
          '51000000-0000-4000-8000-000000000001'
        );
      `);

      await ensureFoundationSchema(db);

      const version = await db.query<{
        storage_object_id: string | null;
        storage_object_key: string;
        metadata_json: Record<string, unknown>;
      }>(
        "SELECT storage_object_id::text, storage_object_key, metadata_json FROM asset_versions WHERE id = $1",
        ["51000000-0000-4000-8000-000000000005"],
      );
      assert.equal(version.rows[0]?.storage_object_id, "51000000-0000-4000-8000-000000000004");
      assert.equal(version.rows[0]?.storage_object_key, "generated/upgrade-character.png");
      assert.equal(version.rows[0]?.metadata_json.previewUrl, "https://example.com/upgrade-character.png");
    } finally {
      await db.close();
    }
  });
});
