import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadSqlMigrations } from "../apps/backend/src/modules/shared/db/migrations.ts";
import { createEmptyTestDb } from "../apps/backend/src/modules/shared/db/test-db.ts";
import type { SqlDatabase } from "../apps/backend/src/modules/shared/db/sql.ts";
import { createScopedStorageObject } from "../apps/backend/src/modules/storage/storage.service.ts";
import { dedupeProjectUploadRecords } from "./dedupe-project-upload-records.mjs";

const userId = "00000000-0000-4000-8000-000000000031";
const organizationId = "10000000-0000-4000-8000-000000000031";
const workspaceId = "20000000-0000-4000-8000-000000000031";
const projectId = "30000000-0000-4000-8000-000000000031";
const uploadSessionId = "40000000-0000-4000-8000-000000000031";

describe("dedupe-project-upload-records script", () => {
  it("removes older duplicate project upload records for the same upload session", async () => {
    const db = await createHistoricalUploadRecordTestDb();

    try {
      await seedProject(db);
      const storageObject = await createScopedStorageObject(db, {
        organizationId,
        workspaceId,
        projectId,
        bucket: "creator-test",
        objectName: "team-assets/character/duplicate.png",
        contentType: "image/png",
        sizeBytes: 2048,
        provider: "tencent_cos",
        status: "available",
        metadata: {},
        createdByUserId: userId,
        now: new Date("2026-07-05T08:00:00.000Z"),
      });

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
            created_by_user_id,
            created_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            'team-assets/character',
            'uploaded',
            'image/png',
            2048,
            'duplicate.png',
            NULL,
            'duplicate-upload-records',
            $6,
            $7,
            $8,
            $9
          )
        `,
        [
          uploadSessionId,
          organizationId,
          workspaceId,
          projectId,
          storageObject.id,
          new Date("2026-07-05T09:00:00.000Z"),
          new Date("2026-07-05T08:05:00.000Z"),
          userId,
          new Date("2026-07-05T08:01:00.000Z"),
        ],
      );

      await insertUploadRecord(db, {
        id: "50000000-0000-4000-8000-000000000031",
        createdAt: new Date("2026-07-05T08:01:30.000Z"),
        completedAt: new Date("2026-07-05T08:05:00.000Z"),
        storageObjectId: storageObject.id,
      });
      await insertUploadRecord(db, {
        id: "50000000-0000-4000-8000-000000000032",
        createdAt: new Date("2026-07-05T08:02:30.000Z"),
        completedAt: new Date("2026-07-05T08:05:00.000Z"),
        storageObjectId: storageObject.id,
      });
      await insertUploadRecord(db, {
        id: "50000000-0000-4000-8000-000000000033",
        createdAt: new Date("2026-07-05T08:03:30.000Z"),
        completedAt: new Date("2026-07-05T08:05:00.000Z"),
        storageObjectId: storageObject.id,
      });

      const dryRun = await dedupeProjectUploadRecords({
        db,
        dryRun: true,
        batchSize: 10,
      });
      const applied = await dedupeProjectUploadRecords({
        db,
        dryRun: false,
        batchSize: 10,
      });
      const remainingRows = await db.query<{ id: string }>(
        `
          SELECT id
          FROM project_upload_records
          WHERE upload_session_id = $1
          ORDER BY created_at ASC
        `,
        [uploadSessionId],
      );

      assert.equal(dryRun.processedSessions, 1);
      assert.equal(dryRun.deletedRecords, 2);
      assert.equal(dryRun.remainingSessions, 1);
      assert.deepEqual(dryRun.sessions[0], {
        uploadSessionId,
        keepRecordId: "50000000-0000-4000-8000-000000000033",
        deletedRecordIds: [
          "50000000-0000-4000-8000-000000000031",
          "50000000-0000-4000-8000-000000000032",
        ],
      });

      assert.equal(applied.processedSessions, 1);
      assert.equal(applied.deletedRecords, 2);
      assert.equal(applied.remainingSessions, 0);
      assert.deepEqual(remainingRows.rows, [
        { id: "50000000-0000-4000-8000-000000000033" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("keeps the uploaded record when a later duplicate is still only created", async () => {
    const db = await createHistoricalUploadRecordTestDb();

    try {
      await seedProject(db);
      const storageObject = await createScopedStorageObject(db, {
        organizationId,
        workspaceId,
        projectId,
        bucket: "creator-test",
        objectName: "team-assets/character/uploaded-wins.png",
        contentType: "image/png",
        sizeBytes: 2048,
        provider: "tencent_cos",
        status: "available",
        metadata: {},
        createdByUserId: userId,
        now: new Date("2026-07-05T10:00:00.000Z"),
      });

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
            created_by_user_id,
            created_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            'team-assets/character',
            'uploaded',
            'image/png',
            2048,
            'uploaded-wins.png',
            NULL,
            'uploaded-wins-records',
            $6,
            $7,
            $8,
            $9
          )
        `,
        [
          "40000000-0000-4000-8000-000000000032",
          organizationId,
          workspaceId,
          projectId,
          storageObject.id,
          new Date("2026-07-05T11:00:00.000Z"),
          new Date("2026-07-05T10:05:00.000Z"),
          userId,
          new Date("2026-07-05T10:01:00.000Z"),
        ],
      );

      await insertUploadRecord(db, {
        id: "50000000-0000-4000-8000-000000000041",
        uploadSessionId: "40000000-0000-4000-8000-000000000032",
        createdAt: new Date("2026-07-05T10:02:00.000Z"),
        completedAt: new Date("2026-07-05T10:05:00.000Z"),
        storageObjectId: storageObject.id,
        publicUrl: "https://platform-storage.example.test/team-assets/character/uploaded-wins.png",
      });
      await insertUploadRecord(db, {
        id: "50000000-0000-4000-8000-000000000042",
        uploadSessionId: "40000000-0000-4000-8000-000000000032",
        createdAt: new Date("2026-07-05T10:06:00.000Z"),
        completedAt: null,
        storageObjectId: storageObject.id,
        publicUrl: null,
        status: "created",
      });

      const dryRun = await dedupeProjectUploadRecords({
        db,
        dryRun: true,
        batchSize: 10,
      });
      const remainingRows = await db.query<{
        id: string;
        status: string;
        public_url: string | null;
      }>(
        `
          SELECT id, status, public_url
          FROM project_upload_records
          WHERE upload_session_id = $1
          ORDER BY created_at ASC
        `,
        ["40000000-0000-4000-8000-000000000032"],
      );

      assert.deepEqual(dryRun.sessions[0], {
        uploadSessionId: "40000000-0000-4000-8000-000000000032",
        keepRecordId: "50000000-0000-4000-8000-000000000041",
        deletedRecordIds: ["50000000-0000-4000-8000-000000000042"],
      });
      assert.deepEqual(remainingRows.rows, [
        {
          id: "50000000-0000-4000-8000-000000000041",
          status: "uploaded",
          public_url: "https://platform-storage.example.test/team-assets/character/uploaded-wins.png",
        },
        {
          id: "50000000-0000-4000-8000-000000000042",
          status: "created",
          public_url: null,
        },
      ]);
    } finally {
      await db.close();
    }
  });
});

async function createHistoricalUploadRecordTestDb() {
  const db = await createEmptyTestDb();

  try {
    const migrations = await loadSqlMigrations(process.cwd());
    for (const migration of migrations) {
      if (migration.name === "0070_project_upload_records_upload_session_unique.sql") {
        continue;
      }
      await db.query(migration.sql);
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function seedProject(db: SqlDatabase) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, display_name, status)
      VALUES ($1, '13800138031', '去重用户', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Dedupe Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Dedupe Workspace', 'active')
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
      VALUES ($1, $2, $3, 'Dedupe Project', '9:16', '1080p', 'shot_generation', $4)
    `,
    [projectId, organizationId, workspaceId, userId],
  );
}

async function insertUploadRecord(
  db: SqlDatabase,
  input: {
    id: string;
    uploadSessionId?: string;
    createdAt: Date;
    completedAt: Date | null;
    storageObjectId: string;
    publicUrl?: string | null;
    status?: string;
  },
) {
  await db.query(
    `
      INSERT INTO project_upload_records (
        id,
        organization_id,
        workspace_id,
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
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24
      )
    `,
    [
      input.id,
      organizationId,
      workspaceId,
      projectId,
      input.storageObjectId,
      input.uploadSessionId ?? uploadSessionId,
      userId,
      "去重用户",
      "13800138031",
      "Dedupe Project",
      "project",
      "/api/storage/upload-sessions",
      "team-assets/character",
      "duplicate.png",
      "team-assets/character/duplicate.png",
      "creator-test",
      "tencent_cos",
      "image/png",
      2048,
      Object.prototype.hasOwnProperty.call(input, "publicUrl")
        ? input.publicUrl
        : "https://platform-storage.example.test/team-assets/character/duplicate.png",
      input.status ?? "uploaded",
      null,
      input.createdAt,
      input.completedAt,
    ],
  );
}
