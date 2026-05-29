import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMigratedTestDb,
  listColumnNames,
  listIndexNames,
  listTableNames,
} from "../test-db.ts";

describe("storage upload schema", () => {
  it("adds upload session metadata tables and columns", async () => {
    const db = await createMigratedTestDb();

    try {
      const tables = await listTableNames(db);
      assert.ok(tables.includes("storage_upload_sessions"));

      assert.deepEqual(await listColumnNames(db, "storage_upload_sessions"), [
        "id",
        "organization_id",
        "workspace_id",
        "project_id",
        "storage_object_id",
        "purpose",
        "status",
        "content_type",
        "expected_size_bytes",
        "original_file_name",
        "checksum",
        "idempotency_key",
        "expires_at",
        "completed_at",
        "created_by_user_id",
        "created_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "storage_objects"), [
        "id",
        "organization_id",
        "workspace_id",
        "project_id",
        "bucket",
        "object_key",
        "content_type",
        "size_bytes",
        "checksum",
        "metadata_json",
        "created_by_user_id",
        "created_at",
        "provider",
        "status",
        "etag",
        "version_id",
        "last_verified_at",
        "deleted_at",
      ]);

      assert.ok((await listColumnNames(db, "asset_versions")).includes("storage_object_id"));
    } finally {
      await db.close();
    }
  });

  it("enforces upload-session and storage-object integrity constraints", async () => {
    const db = await createMigratedTestDb();

    try {
      const storageUploadIndexes = await listIndexNames(db, "storage_upload_sessions");
      const storageObjectIndexes = await listIndexNames(db, "storage_objects");
      const assetVersionIndexes = await listIndexNames(db, "asset_versions");
      const projectIndexes = await listIndexNames(db, "projects");

      assert.ok(storageUploadIndexes.includes("storage_upload_sessions_scope_idx"));
      assert.ok(storageUploadIndexes.includes("storage_upload_sessions_status_idx"));
      assert.ok(storageObjectIndexes.includes("storage_objects_status_idx"));
      assert.ok(assetVersionIndexes.includes("asset_versions_storage_object_idx"));
      assert.ok(projectIndexes.includes("projects_cover_storage_object_idx"));

      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES ('00000000-0000-4000-8000-000000000001', '+8613800138000', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO organizations (id, name, status)
          VALUES ('10000000-0000-4000-8000-000000000001', 'Upload Org', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO workspaces (id, organization_id, name, status)
          VALUES (
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'Upload Workspace',
            'active'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO projects (
            id,
            organization_id,
            workspace_id,
            name,
            aspect_ratio,
            resolution,
            phase
          )
          VALUES (
            '30000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001',
            'Upload Project',
            '16:9',
            '1080p',
            'script_input'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO storage_objects (
            id,
            organization_id,
            workspace_id,
            project_id,
            bucket,
            object_key,
            content_type,
            size_bytes,
            checksum,
            metadata_json,
            created_by_user_id,
            provider,
            status
          )
          VALUES (
            '40000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000001',
            'creator-dev',
            'AIManhuaDrama/20260529/test.png',
            'image/png',
            4,
            NULL,
            '{}'::jsonb,
            '00000000-0000-4000-8000-000000000001',
            'creator-dev',
            'pending_upload'
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO storage_upload_sessions (
              id,
              organization_id,
              workspace_id,
              project_id,
              storage_object_id,
              purpose,
              status,
              content_type,
              expected_size_bytes,
              original_file_name,
              checksum,
              idempotency_key,
              expires_at,
              completed_at,
              created_by_user_id
            )
            VALUES (
              '50000000-0000-4000-8000-000000000001',
              '10000000-0000-4000-8000-000000000001',
              '20000000-0000-4000-8000-000000000001',
              '30000000-0000-4000-8000-000000000001',
              '40000000-0000-4000-8000-000000000001',
              'episode-role-reference',
              'created',
              'image/png',
              -1,
              'bad.png',
              NULL,
              'dup-key',
              now(),
              NULL,
              '00000000-0000-4000-8000-000000000001'
            )
          `,
        ),
      );

      await db.query(
        `
          INSERT INTO storage_upload_sessions (
            id,
            organization_id,
            workspace_id,
            project_id,
            storage_object_id,
            purpose,
            status,
            content_type,
            expected_size_bytes,
            original_file_name,
            checksum,
            idempotency_key,
            expires_at,
            completed_at,
            created_by_user_id
          )
          VALUES (
            '50000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000001',
            '40000000-0000-4000-8000-000000000001',
            'episode-role-reference',
            'created',
            'image/png',
            4,
            'good.png',
            NULL,
            'dup-key',
            now(),
            NULL,
            '00000000-0000-4000-8000-000000000001'
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO storage_upload_sessions (
              id,
              organization_id,
              workspace_id,
              project_id,
              storage_object_id,
              purpose,
              status,
              content_type,
              expected_size_bytes,
              original_file_name,
              checksum,
              idempotency_key,
              expires_at,
              completed_at,
              created_by_user_id
            )
            VALUES (
              '50000000-0000-4000-8000-000000000003',
              '10000000-0000-4000-8000-000000000001',
              '20000000-0000-4000-8000-000000000001',
              '30000000-0000-4000-8000-000000000001',
              '40000000-0000-4000-8000-000000000001',
              'episode-role-reference',
              'created',
              'image/png',
              4,
              'duplicate.png',
              NULL,
              'dup-key',
              now(),
              NULL,
              '00000000-0000-4000-8000-000000000001'
            )
          `,
        ),
      );
    } finally {
      await db.close();
    }
  });
});
