import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createAssetVersionSnapshot,
  upsertAssetVersionSnapshot,
} from "../asset-version-record.service.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "40000000-0000-4000-8000-000000000001";
const assetId = "50000000-0000-4000-8000-000000000001";
const versionId = "60000000-0000-4000-8000-000000000001";

describe("asset version records", { concurrency: false }, () => {
  it("rejects conflicting writes for an existing asset version number", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);

      await upsertAssetVersionSnapshot(db, {
        asset: {
          id: assetId,
          projectId,
          assetType: "shot_image",
          assetKey: "shot-1",
          createdByUserId: userId,
          createdAt: new Date("2026-05-18T10:00:00.000Z"),
          updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        },
        version: {
          id: versionId,
          assetId,
          versionNumber: 1,
          storageObjectKey: "generated/shot-1-v1.png",
          metadata: {
            mimeType: "image/png",
            width: 720,
            height: 1280,
          },
          sourceTaskId: "70000000-0000-4000-8000-000000000001",
          sourceAttemptId: "80000000-0000-4000-8000-000000000001",
          createdByUserId: userId,
          createdAt: new Date("2026-05-18T10:00:00.000Z"),
        },
        now: new Date("2026-05-18T10:00:00.000Z"),
      });

      await upsertAssetVersionSnapshot(db, {
        asset: {
          id: assetId,
          projectId,
          assetType: "shot_image",
          assetKey: "shot-1",
          createdByUserId: userId,
          createdAt: new Date("2026-05-18T10:00:00.000Z"),
          updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        },
        version: {
          id: versionId,
          assetId,
          versionNumber: 1,
          storageObjectKey: "generated/shot-1-v1.png",
          metadata: {
            mimeType: "image/png",
            width: 720,
            height: 1280,
          },
          sourceTaskId: "70000000-0000-4000-8000-000000000001",
          sourceAttemptId: "80000000-0000-4000-8000-000000000001",
          createdByUserId: userId,
          createdAt: new Date("2026-05-18T10:00:00.000Z"),
        },
        now: new Date("2026-05-18T10:01:00.000Z"),
      });

      await assert.rejects(
        () =>
          upsertAssetVersionSnapshot(db, {
            asset: {
              id: assetId,
              projectId,
              assetType: "shot_image",
              assetKey: "shot-1",
              createdByUserId: userId,
              createdAt: new Date("2026-05-18T10:00:00.000Z"),
              updatedAt: new Date("2026-05-18T10:00:00.000Z"),
            },
            version: {
              id: "60000000-0000-4000-8000-000000000002",
              assetId,
              versionNumber: 1,
              storageObjectKey: "generated/shot-1-conflict.png",
              metadata: {
                mimeType: "image/png",
                width: 720,
                height: 1280,
              },
              sourceTaskId: "70000000-0000-4000-8000-000000000002",
              sourceAttemptId: "80000000-0000-4000-8000-000000000002",
              createdByUserId: userId,
              createdAt: new Date("2026-05-18T10:02:00.000Z"),
            },
            now: new Date("2026-05-18T10:02:00.000Z"),
          }),
        /asset_version_conflict/,
      );

      const versions = await db.query<{
        version_number: number;
        storage_object_key: string;
      }>(
        "SELECT version_number, storage_object_key FROM asset_versions WHERE asset_id = $1",
        [assetId],
      );

      assert.deepEqual(versions.rows, [
        {
          version_number: 1,
          storage_object_key: "generated/shot-1-v1.png",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("allocates monotonically increasing version numbers for an asset", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);

      const first = await createAssetVersionSnapshot(db, {
        projectId,
        assetType: "shot_image",
        assetKey: "shot-2",
        createdByUserId: userId,
        storageObjectKey: "generated/shot-2-v1.png",
        metadata: {
          mimeType: "image/png",
          width: 720,
          height: 1280,
        },
        sourceTaskId: "70000000-0000-4000-8000-000000000003",
        sourceAttemptId: "80000000-0000-4000-8000-000000000003",
        now: new Date("2026-05-18T11:00:00.000Z"),
      });
      const second = await createAssetVersionSnapshot(db, {
        projectId,
        assetType: "shot_image",
        assetKey: "shot-2",
        createdByUserId: userId,
        storageObjectKey: "generated/shot-2-v2.png",
        metadata: {
          mimeType: "image/png",
          width: 720,
          height: 1280,
        },
        sourceTaskId: "70000000-0000-4000-8000-000000000004",
        sourceAttemptId: "80000000-0000-4000-8000-000000000004",
        now: new Date("2026-05-18T11:01:00.000Z"),
      });

      assert.equal(first.asset.id, second.asset.id);
      assert.equal(first.version.versionNumber, 1);
      assert.equal(second.version.versionNumber, 2);
      assert.notEqual(first.version.id, second.version.id);
    } finally {
      await db.close();
    }
  });

  it("reuses an asset version when the same task attempt persists the same storage object", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedProject(db);
      const input = {
        projectId,
        assetType: "shot_image" as const,
        assetKey: "shot-idempotent",
        createdByUserId: userId,
        storageObjectKey: "generated/shot-idempotent.png",
        metadata: { mimeType: "image/png", width: 720, height: 1280 },
        sourceTaskId: "70000000-0000-4000-8000-000000000005",
        sourceAttemptId: "80000000-0000-4000-8000-000000000005",
        now: new Date("2026-05-18T11:02:00.000Z"),
      };
      const first = await createAssetVersionSnapshot(db, input);
      const replay = await createAssetVersionSnapshot(db, {
        ...input,
        now: new Date("2026-05-18T11:03:00.000Z"),
      });
      const count = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM asset_versions WHERE asset_id = $1",
        [first.asset.id],
      );

      assert.equal(replay.version.id, first.version.id);
      assert.equal(replay.version.versionNumber, 1);
      assert.equal(count.rows[0]?.count, 1);
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
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '13800138000', 'active')
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
      VALUES ($1, 'Asset Version Project', '9:16', '1080p', 'shot_generation', $2, $2)
    `,
    [projectId, userId],
  );
}
