import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createScopedStorageObject } from "../../storage/storage.service.ts";
import { ensureProjectUploadRecordForStorageObject } from "../project-upload-record.service.ts";

const userId = "00000000-0000-4000-8000-000000000011";
const organizationId = "10000000-0000-4000-8000-000000000011";
const workspaceId = "20000000-0000-4000-8000-000000000011";
const projectId = "30000000-0000-4000-8000-000000000011";

describe("project upload record service", { concurrency: false }, () => {
  it("backfills a generated storage object into project upload records with actor info", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const storageObject = await createScopedStorageObject(db, {
        organizationId,
        workspaceId,
        projectId,
        bucket: "creator-test",
        objectName: "episodes/ep-1/gpt-image-2/generated-image.png",
        contentType: "image/png",
        sizeBytes: 2048,
        provider: "tencent_cos",
        status: "available",
        metadata: { provider: "gpt-image-2" },
        createdByUserId: userId,
        now: new Date("2026-06-25T10:00:00.000Z"),
      });

      const created = await ensureProjectUploadRecordForStorageObject(db, {
        organizationId,
        storageObjectId: storageObject.id,
        pageKey: "project",
        sourceAction: "generate_image",
        publicUrl: `https://platform-storage.example.test/${storageObject.objectKey}`,
        status: "uploaded",
        now: new Date("2026-06-25T10:00:01.000Z"),
      });
      const again = await ensureProjectUploadRecordForStorageObject(db, {
        organizationId,
        storageObjectId: storageObject.id,
        pageKey: "project",
        sourceAction: "generate_image",
        publicUrl: `https://platform-storage.example.test/${storageObject.objectKey}`,
        status: "uploaded",
        now: new Date("2026-06-25T10:00:02.000Z"),
      });
      const rows = await db.query<{
        actor_user_id: string | null;
        actor_display_name: string | null;
        actor_phone_e164: string | null;
        project_name: string | null;
        source_action: string;
        file_name: string;
        public_url: string | null;
      }>(
        `
          SELECT actor_user_id, actor_display_name, actor_phone_e164, project_name, source_action, file_name, public_url
          FROM project_upload_records
          WHERE organization_id = $1
            AND storage_object_id = $2
        `,
        [organizationId, storageObject.id],
      );

      assert.ok(created);
      assert.equal(again?.id, created?.id);
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0]?.actor_user_id, userId);
      assert.equal(rows.rows[0]?.actor_display_name, "测试用户");
      assert.equal(rows.rows[0]?.actor_phone_e164, "+8613800138000");
      assert.equal(rows.rows[0]?.project_name, "Upload Record Project");
      assert.equal(rows.rows[0]?.source_action, "generate_image");
      assert.equal(rows.rows[0]?.file_name, "generated-image.png");
      assert.match(rows.rows[0]?.public_url ?? "", /platform-storage\.example\.test/);
    } finally {
      await db.close();
    }
  });
});

async function seedProject(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, display_name, status)
      VALUES ($1, '+8613800138000', '测试用户', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Upload Record Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Upload Record Workspace', 'active')
    `,
    [workspaceId, organizationId],
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
        phase,
        created_by_user_id
      )
      VALUES ($1, $2, $3, 'Upload Record Project', '9:16', '1080p', 'shot_generation', $4)
    `,
    [projectId, organizationId, workspaceId, userId],
  );
}
