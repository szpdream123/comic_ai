import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createScopedStorageObject } from "../../storage/storage.service.ts";
import { ensureProjectUploadRecordForStorageObject } from "../project-upload-record.service.ts";

const userId = "00000000-0000-4000-8000-000000000011";
const projectId = "30000000-0000-4000-8000-000000000011";

describe("project upload record service", { concurrency: false }, () => {
  it("enforces unique upload session ids at the database layer", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const storageObject = await createScopedStorageObject(db, {
        userId,
        projectId,
        bucket: "creator-test",
        objectName: "team-assets/character/upload-session-unique.png",
        contentType: "image/png",
        sizeBytes: 2048,
        provider: "tencent_cos",
        status: "available",
        metadata: {},
        createdByUserId: userId,
        now: new Date("2026-07-05T09:00:00.000Z"),
      });
      const uploadSessionId = "40000000-0000-4000-8000-000000000011";

      await db.query(
        `
          INSERT INTO storage_upload_sessions (
        id,
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
        created_by_user_id,
        created_at
      )
          VALUES ($1, $2, $3, 'team-assets/character', 'uploaded', 'image/png', 2048, 'upload-session-unique.png', NULL, 'unique-upload-session-test', $4, $5, $6, $7)
        `,
        [
          uploadSessionId,
          projectId,
          storageObject.id,
          new Date("2026-07-05T10:00:00.000Z"),
          new Date("2026-07-05T09:05:00.000Z"),
          userId,
          new Date("2026-07-05T09:01:00.000Z"),
        ],
      );

      await insertProjectUploadRecord(db, {
        id: "50000000-0000-4000-8000-000000000011",
        storageObjectId: storageObject.id,
        uploadSessionId,
        createdAt: new Date("2026-07-05T09:02:00.000Z"),
      });

      await assert.rejects(
        () =>
          insertProjectUploadRecord(db, {
            id: "50000000-0000-4000-8000-000000000012",
            storageObjectId: storageObject.id,
            uploadSessionId,
            createdAt: new Date("2026-07-05T09:03:00.000Z"),
          }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          return "code" in error && error.code === "23505";
        },
      );
    } finally {
      await db.close();
    }
  });

  it("backfills a generated storage object into project upload records with actor info", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const storageObject = await createScopedStorageObject(db, {
        userId,
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
        userId,
        storageObjectId: storageObject.id,
        pageKey: "project",
        sourceAction: "generate_image",
        publicUrl: `https://platform-storage.example.test/${storageObject.objectKey}`,
        status: "uploaded",
        now: new Date("2026-06-25T10:00:01.000Z"),
      });
      const again = await ensureProjectUploadRecordForStorageObject(db, {
        userId,
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
          WHERE storage_object_id = $1
        `,
        [storageObject.id],
      );

      assert.ok(created);
      assert.equal(again?.id, created?.id);
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0]?.actor_user_id, userId);
      assert.equal(rows.rows[0]?.actor_display_name, "测试用户");
      assert.equal(rows.rows[0]?.actor_phone_e164, "13800138000");
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
      VALUES ($1, '13800138000', '测试用户', 'active')
    `,
    [userId],
  );


  await db.query(
    `
      INSERT INTO projects (
        id,
        name,
        aspect_ratio,
        resolution,
        phase,
        owner_user_id,
        created_by_user_id
      )
      VALUES ($1, 'Upload Record Project', '9:16', '1080p', 'shot_generation', $2, $2)
    `,
    [projectId,
      userId],
  );
}

async function insertProjectUploadRecord(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    id: string;
    storageObjectId: string;
    uploadSessionId: string;
    createdAt: Date;
  },
) {
  await db.query(
    `
      INSERT INTO project_upload_records (
        id,
        project_id,
        storage_object_id,
        upload_session_id,
        actor_user_id,
        actor_display_name,
        actor_phone_e164,
        project_name,
        page_key,
        page_url,
        source_action,
        file_name,
        object_key,
        bucket,
        provider,
        content_type,
        size_bytes,
        public_url,
        status,
        error_message,
        created_at,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    `,
    [
      input.id,
      projectId,
      input.storageObjectId,
      input.uploadSessionId,
      userId,
      "测试用户",
      "13800138000",
      "Upload Record Project",
      "project",
      "/api/storage/upload-sessions",
      "team-assets/character",
      "upload-session-unique.png",
      "team-assets/character/upload-session-unique.png",
      "creator-test",
      "tencent_cos",
      "image/png",
      2048,
      "https://platform-storage.example.test/team-assets/character/upload-session-unique.png",
      "uploaded",
      null,
      input.createdAt,
      input.createdAt,
    ],
  );
}
