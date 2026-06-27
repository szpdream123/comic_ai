import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../apps/backend/src/modules/shared/db/test-db.ts";
import type { SqlDatabase } from "../apps/backend/src/modules/shared/db/sql.ts";
import { createScopedStorageObject } from "../apps/backend/src/modules/storage/storage.service.ts";
import { backfillProjectUploadRecords, inferSourceAction } from "./backfill-project-upload-records.mjs";

const userId = "00000000-0000-4000-8000-000000000021";
const organizationId = "10000000-0000-4000-8000-000000000021";
const workspaceId = "20000000-0000-4000-8000-000000000021";
const projectId = "30000000-0000-4000-8000-000000000021";

describe("backfill-project-upload-records script", () => {
  it("backfills missing project upload records for generated image and video storage objects", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const imageObject = await createScopedStorageObject(db, {
        organizationId,
        workspaceId,
        projectId,
        bucket: "creator-test",
        objectName: "episodes/ep-1/gpt-image-2/gpt-image-task-1.png",
        contentType: "image/png",
        sizeBytes: 1024,
        provider: "tencent_cos",
        status: "available",
        metadata: { provider: "gpt-image-2" },
        createdByUserId: userId,
        now: new Date("2026-06-25T12:00:00.000Z"),
      });
      const videoObject = await createScopedStorageObject(db, {
        organizationId,
        workspaceId,
        projectId,
        bucket: "creator-test",
        objectName: "episodes/ep-1/seedance/seedance-video-task-2.mp4",
        contentType: "video/mp4",
        sizeBytes: 4096,
        provider: "tencent_cos",
        status: "available",
        metadata: { provider: "seedance" },
        createdByUserId: userId,
        now: new Date("2026-06-25T12:01:00.000Z"),
      });

      const result = await backfillProjectUploadRecords({
        db,
        runtime: {
          mode: "cos",
          provider: "tencent_cos",
          bucket: "creator-test",
          region: "ap-guangzhou",
          publicBaseUrl: "https://platform-storage.example.test",
          adapter: {},
        },
        dryRun: false,
        batchSize: 10,
        now: new Date("2026-06-25T12:02:00.000Z"),
      });
      const records = await db.query<{
        storage_object_id: string;
        source_action: string;
        actor_display_name: string | null;
        actor_phone_e164: string | null;
        public_url: string | null;
      }>(
        `
          SELECT storage_object_id, source_action, actor_display_name, actor_phone_e164, public_url
          FROM project_upload_records
          WHERE organization_id = $1
          ORDER BY created_at ASC
        `,
        [organizationId],
      );

      assert.equal(result.processed, 2);
      assert.equal(result.remaining, 0);
      assert.deepEqual(records.rows.map((row) => row.storage_object_id), [imageObject.id, videoObject.id]);
      assert.deepEqual(records.rows.map((row) => row.source_action), ["generate_image", "generate_video"]);
      assert.deepEqual(records.rows.map((row) => row.actor_display_name), ["回填用户", "回填用户"]);
      assert.deepEqual(records.rows.map((row) => row.actor_phone_e164), ["+8613800138021", "+8613800138021"]);
      assert.match(records.rows[0]?.public_url ?? "", /platform-storage\.example\.test/);
      assert.match(records.rows[1]?.public_url ?? "", /platform-storage\.example\.test/);
    } finally {
      await db.close();
    }
  });

  it("classifies legacy and generated storage objects by key and provider metadata", () => {
    assert.equal(
      inferSourceAction({ objectKey: "episodes/ep-1/gpt-image-2/gpt-image-abc.png", contentType: "image/png", metadata: {} }),
      "generate_image",
    );
    assert.equal(
      inferSourceAction({ objectKey: "episodes/ep-1/seedance/seedance-video-abc.mp4", contentType: "video/mp4", metadata: {} }),
      "generate_video",
    );
    assert.equal(
      inferSourceAction({ objectKey: "manual/uploads/clip.mp4", contentType: "video/mp4", metadata: {} }),
      "legacy_upload_video",
    );
    assert.equal(
      inferSourceAction({ objectKey: "manual/uploads/image.png", contentType: "image/png", metadata: {} }),
      "legacy_upload_image",
    );
  });
});

async function seedProject(db: SqlDatabase) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, display_name, status)
      VALUES ($1, '+8613800138021', '回填用户', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Backfill Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Backfill Workspace', 'active')
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
      VALUES ($1, $2, $3, 'Backfill Project', '9:16', '1080p', 'shot_generation', $4)
    `,
    [projectId, organizationId, workspaceId, userId],
  );
}
