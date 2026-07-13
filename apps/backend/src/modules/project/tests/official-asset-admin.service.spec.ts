import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  ensureDefaultOfficialLibraryAssets,
  listLibraryAssetsForActor,
} from "../asset-library.service.ts";
import { createOfficialAssetAdminService } from "../official-asset-admin.service.ts";

const actor = {
  actorId: "00000000-0000-4000-8000-000000000101",
  role: "owner_admin" as const,
  capabilities: [],
};

describe("official asset admin service", { concurrency: false }, () => {
  it("exposes seeded official character detail views as admin editable detail items", async () => {
    const db = await createMigratedTestDb();
    const service = createOfficialAssetAdminService({ db });

    try {
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-06-01T07:30:00.000Z"),
      });

      const listed = await service.listAssets({
        category: "character",
      });

      assert.ok(listed.data.length > 0, "Expected seeded official character assets");
      for (const asset of listed.data) {
        const previewMatch = String(asset.previewUrl ?? "").match(
          /^\/assets\/library\/official\/characters\/(.+)\.png$/,
        );
        const slug = previewMatch?.[1] ?? "";
        const detailViewItems = asset.latestVersion.metadata.detailViewItems;

        assert.ok(slug, `Expected seeded character preview slug for ${asset.name}`);
        assert.ok(Array.isArray(detailViewItems), `Expected backend admin detail items for ${asset.name}`);
        assert.deepEqual(
          detailViewItems.map((item) => item.label),
          ["方位图", "正面", "侧面", "背面", "远景全身"],
          `${asset.name} should expose the same five detail labels as the frontend`,
        );
        assert.deepEqual(
          detailViewItems.map((item) => item.imageUrl),
          [
            `/assets/library/official/characters/detail/${slug}-sheet.png`,
            `/assets/library/official/characters/detail/${slug}-front.png`,
            `/assets/library/official/characters/detail/${slug}-side.png`,
            `/assets/library/official/characters/detail/${slug}-back.png`,
            `/assets/library/official/characters/detail/${slug}-full-body.png`,
          ],
          `${asset.name} should expose the same five detail images as the frontend`,
        );
      }

      const monk = listed.data.find((asset) => asset.name === "和尚");
      assert.ok(monk, "Expected seeded monk official asset");
      await db.query(
        `
          UPDATE library_asset_versions
          SET metadata_json = $2::jsonb
          WHERE library_asset_id = $1
        `,
        [
          monk.id,
          JSON.stringify({
            source: "legacy_official_seed",
            detailViews: {
              turnaround: "/assets/library/official/characters/detail/monk-sheet.png",
              front: "/assets/library/official/characters/detail/monk-front.png",
              side: "/assets/library/official/characters/detail/monk-side.png",
              back: "/assets/library/official/characters/detail/monk-back.png",
              fullBody: "/assets/library/official/characters/monk.png",
            },
          }),
        ],
      );

      const legacyListed = await service.listAssets({
        category: "character",
        query: "和尚",
      });
      const legacyMonk = legacyListed.data.find((asset) => asset.name === "和尚");
      const legacyDetailViewItems = legacyMonk?.latestVersion.metadata.detailViewItems;

      assert.ok(Array.isArray(legacyDetailViewItems), "Expected legacy seed rows to be backfilled");
      assert.deepEqual(legacyDetailViewItems.map((item) => item.imageUrl), [
        "/assets/library/official/characters/detail/monk-sheet.png",
        "/assets/library/official/characters/detail/monk-front.png",
        "/assets/library/official/characters/detail/monk-side.png",
        "/assets/library/official/characters/detail/monk-back.png",
        "/assets/library/official/characters/detail/monk-full-body.png",
      ]);
    } finally {
      await db.close();
    }
  });

  it("creates admin-managed official assets and writes each save as the latest library version", async () => {
    const db = await createMigratedTestDb();
    const service = createOfficialAssetAdminService({ db });

    try {
      const created = await service.saveAsset({
        now: new Date("2026-06-01T08:00:00.000Z"),
        body: {
          category: "scene",
          folder: "后台测试板块",
          name: "雨夜街巷",
          description: "旧版说明",
          tags: ["夜景", "街道"],
          previewUrl: "/uploads/official-assets/rainy-alley-card.png",
          storageObjectKey: "official-assets/rainy-alley-card.png",
          mimeType: "image/png",
          width: 1600,
          height: 900,
          sortOrder: 30,
          display: {
            kicker: "后台公共资产",
            title: "雨夜街巷",
            description: "后台配置的场景详情文案",
            metaRows: [{ label: "光线", value: "雨夜霓虹" }],
          },
          detailViewItems: [
            {
              key: "main",
              label: "主视觉",
              imageUrl: "/uploads/official-assets/rainy-alley-main.png",
              thumbnailUrl: "/uploads/official-assets/rainy-alley-main-thumb.png",
              sortOrder: 10,
              isDefault: true,
            },
          ],
        },
      });

      assert.equal(created.data.scope, "official");
      assert.equal(created.data.category, "scene");
      assert.equal(created.data.status, "active");
      assert.equal(created.data.latestVersion.versionNumber, 1);
      assert.equal(created.data.latestVersion.metadata.managedBy, "admin");
      assert.equal(created.data.latestVersion.metadata.sortOrder, 30);

      const updated = await service.saveAsset({
        assetId: created.data.id,
        now: new Date("2026-06-01T08:05:00.000Z"),
        body: {
          name: "雨夜街巷主视觉",
          description: "新版说明",
          previewUrl: "/uploads/official-assets/rainy-alley-card-v2.png",
          storageObjectKey: "official-assets/rainy-alley-card-v2.png",
          display: {
            title: "雨夜街巷主视觉",
            description: "管理员替换后的详情页文案",
          },
          detailViewItems: [
            {
              key: "main",
              label: "新版主视觉",
              imageUrl: "/uploads/official-assets/rainy-alley-main-v2.png",
              sortOrder: 10,
              isDefault: true,
            },
            {
              key: "wide",
              label: "广角图",
              imageUrl: "/uploads/official-assets/rainy-alley-wide-v2.png",
              sortOrder: 20,
            },
          ],
        },
      });

      assert.equal(updated.data.latestVersion.versionNumber, 2);
      assert.equal(updated.data.previewUrl, "/uploads/official-assets/rainy-alley-card-v2.png");
      assert.equal(updated.data.latestVersion.metadata.display.title, "雨夜街巷主视觉");
      assert.equal(updated.data.latestVersion.metadata.display.description, "管理员替换后的详情页文案");
      assert.deepEqual(updated.data.latestVersion.metadata.detailViews, {
        main: "/uploads/official-assets/rainy-alley-main-v2.png",
        wide: "/uploads/official-assets/rainy-alley-wide-v2.png",
      });

      const versionRows = await db.query<{ version_number: number }>(
        `
          SELECT version_number
          FROM library_asset_versions
          WHERE library_asset_id = $1
          ORDER BY version_number ASC
        `,
        [created.data.id],
      );
      assert.deepEqual(versionRows.rows.map((row) => Number(row.version_number)), [1, 2]);

      const creatorList = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "scene",
        now: new Date("2026-06-01T08:06:00.000Z"),
      });
      const creatorAsset = creatorList.assets.find((asset) => asset.id === created.data.id);

      assert.equal(creatorAsset?.name, "雨夜街巷主视觉");
      assert.equal(creatorAsset?.latestVersion.versionNumber, 2);
      assert.equal(creatorAsset?.latestVersion.metadata.display.title, "雨夜街巷主视觉");
      assert.equal(
        creatorAsset?.latestVersion.metadata.detailViews.wide,
        "/uploads/official-assets/rainy-alley-wide-v2.png",
      );

      const archived = await service.archiveAsset({
        assetId: created.data.id,
        now: new Date("2026-06-01T08:10:00.000Z"),
      });
      assert.equal(archived.data.status, "archived");

      const activeAfterArchive = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "scene",
        now: new Date("2026-06-01T08:11:00.000Z"),
      });
      assert.equal(activeAfterArchive.assets.some((asset) => asset.id === created.data.id), false);

      const archivedList = await service.listAssets({ status: "archived" });
      assert.deepEqual(archivedList.data.map((asset) => asset.id), [created.data.id]);
    } finally {
      await db.close();
    }
  });

  it("derives the storage object key from the preview URL when admins leave it empty", async () => {
    const db = await createMigratedTestDb();
    const service = createOfficialAssetAdminService({ db });

    try {
      const created = await service.saveAsset({
        now: new Date("2026-06-01T09:00:00.000Z"),
        body: {
          category: "prop",
          folder: "后台道具板块",
          name: "空键道具",
          previewUrl: "/uploads/official-assets/empty-key-prop.png",
          storageObjectKey: "",
          width: 1024,
          height: 1024,
        },
      });

      assert.equal(
        created.data.latestVersion.storageObjectKey,
        "official-assets/empty-key-prop.png",
      );
    } finally {
      await db.close();
    }
  });

  it("persists explicit cleared admin fields instead of restoring previous metadata", async () => {
    const db = await createMigratedTestDb();
    const service = createOfficialAssetAdminService({ db });

    try {
      const created = await service.saveAsset({
        now: new Date("2026-06-01T10:00:00.000Z"),
        body: {
          category: "character",
          folder: "后台角色板块",
          name: "可清空角色",
          description: "旧提示词",
          previewUrl: "/uploads/official-assets/clearable-card.png",
          storageObjectKey: "official-assets/clearable-card.png",
          width: 720,
          height: 960,
          display: {
            kicker: "旧详情页标识",
            title: "旧详情页标题",
            description: "旧详情页文案",
            metaRows: [{ label: "旧标签", value: "旧值" }],
          },
          detailViewItems: [
            {
              key: "main",
              label: "旧主图",
              imageUrl: "/uploads/official-assets/clearable-main.png",
              sortOrder: 10,
              isDefault: true,
            },
          ],
        },
      });

      const updated = await service.saveAsset({
        assetId: created.data.id,
        now: new Date("2026-06-01T10:05:00.000Z"),
        body: {
          name: "可清空角色",
          description: "",
          previewUrl: "/uploads/official-assets/clearable-card.png",
          storageObjectKey: "official-assets/clearable-card.png",
          display: {
            kicker: "",
            title: "",
            description: "",
            metaRows: [],
          },
          detailViewItems: [],
        },
      });

      assert.equal(updated.data.description, null);
      assert.equal(updated.data.latestVersion.metadata.display.kicker, "");
      assert.equal(updated.data.latestVersion.metadata.display.title, "");
      assert.equal(updated.data.latestVersion.metadata.display.description, "");
      assert.deepEqual(updated.data.latestVersion.metadata.display.metaRows, []);
      assert.deepEqual(updated.data.latestVersion.metadata.detailViewItems, []);
      assert.deepEqual(updated.data.latestVersion.metadata.detailViews, {});
    } finally {
      await db.close();
    }
  });

  it("keeps official asset lists ordered by admin sort weight after edits", async () => {
    const db = await createMigratedTestDb();
    const service = createOfficialAssetAdminService({ db });

    try {
      const lowerSort = await service.saveAsset({
        now: new Date("2026-06-01T11:00:00.000Z"),
        body: {
          category: "character",
          folder: "排序回归板块",
          name: "排序回归-低权重",
          previewUrl: "/uploads/official-assets/order-low.png",
          storageObjectKey: "official-assets/order-low.png",
          width: 720,
          height: 960,
          sortOrder: 10,
        },
      });
      const higherSort = await service.saveAsset({
        now: new Date("2026-06-01T11:01:00.000Z"),
        body: {
          category: "character",
          folder: "排序回归板块",
          name: "排序回归-高权重",
          previewUrl: "/uploads/official-assets/order-high.png",
          storageObjectKey: "official-assets/order-high.png",
          width: 720,
          height: 960,
          sortOrder: 90,
        },
      });

      await service.saveAsset({
        assetId: higherSort.data.id,
        now: new Date("2026-06-01T11:05:00.000Z"),
        body: {
          previewUrl: "/uploads/official-assets/order-high-updated.png",
          storageObjectKey: "official-assets/order-high-updated.png",
        },
      });

      const adminList = await service.listAssets({
        status: "active",
        query: "排序回归",
      });

      assert.deepEqual(adminList.data.map((asset) => asset.id), [
        lowerSort.data.id,
        higherSort.data.id,
      ]);

      const creatorList = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        query: "排序回归",
        now: new Date("2026-06-01T11:06:00.000Z"),
      });

      assert.deepEqual(creatorList.assets.map((asset) => asset.id), [
        lowerSort.data.id,
        higherSort.data.id,
      ]);
    } finally {
      await db.close();
    }
  });

});
