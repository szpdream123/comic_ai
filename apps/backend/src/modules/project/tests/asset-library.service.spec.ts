import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import * as assetLibraryService from "../asset-library.service.ts";
import {
  ensureDefaultOfficialLibraryAssets,
  listLibraryAssetsForActor,
  upsertLibraryAssetWithVersion,
} from "../asset-library.service.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const projectId = "40000000-0000-4000-8000-000000000001";

const actor = {
  actorId: userId,
  organizationId,
  workspaceId,
  role: "owner_admin" as const,
  capabilities: [],
};

describe("asset library service", { concurrency: false }, () => {
  it("lists seeded official role assets by category, folder, and search query", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:00:00.000Z"),
      });

      const listed = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "character",
        folder: "国内仿真人-现代都市",
        query: "医生",
        now: new Date("2026-05-23T09:01:00.000Z"),
      });

      assert.equal(listed.scope, "official");
      assert.equal(listed.entitlement.hasTeamAssetLibrary, false);
      assert.deepEqual(listed.categories.map((category) => category.id), [
        "character",
        "scene",
        "prop",
      ]);
      assert.ok(listed.folders.includes("国内仿真人-现代都市"));
      assert.deepEqual(listed.assets.map((asset) => asset.name), ["医生"]);
      assert.equal(listed.assets[0]?.category, "character");
      assert.equal(listed.assets[0]?.folder, "国内仿真人-现代都市");
      assert.match(
        listed.assets[0]?.previewUrl ?? "",
        /^\/assets\/library\/official\/characters\/doctor\.png$/,
      );
      assert.equal(listed.assets[0]?.latestVersion.versionNumber, 1);
    } finally {
      await db.close();
    }
  });

  it("seeds selected official assets with project-hosted raster previews", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:01:30.000Z"),
      });

      for (const query of [
        "保姆",
        "医生",
        "厨师",
        "老师",
        "司机",
        "记者",
        "保镖",
        "管家",
        "仙舟甲板",
        "秘密信息",
        "丹炉",
      ]) {
        const listed = await listLibraryAssetsForActor(db, {
          actor,
          scope: "official",
          category: "character",
          query,
          now: new Date("2026-05-23T09:01:45.000Z"),
        });
        const asset = listed.assets.find((item) => item.name === query);

        assert.ok(asset, `Expected official asset ${query} to be seeded`);
        assert.match(asset.previewUrl ?? "", /^\/assets\/library\/official\/.+\.png$/);
        assert.ok(!asset.previewUrl?.startsWith("data:image/svg+xml"));
        assert.equal(asset.latestVersion.mimeType, "image/png");
        assert.match(asset.latestVersion.storageObjectKey, /^official\/.+\.png$/);
        if (asset.category === "character") {
          const detailViews = asset.latestVersion.metadata.detailViews as
            | Record<string, unknown>
            | undefined;
          assert.match(
            String(detailViews?.turnaround ?? ""),
            /^\/assets\/library\/official\/characters\/detail\/.+-sheet\.png$/,
          );
          assert.match(
            String(detailViews?.front ?? ""),
            /^\/assets\/library\/official\/characters\/detail\/.+-front\.png$/,
          );
          assert.match(
            String(detailViews?.side ?? ""),
            /^\/assets\/library\/official\/characters\/detail\/.+-side\.png$/,
          );
          assert.match(
            String(detailViews?.back ?? ""),
            /^\/assets\/library\/official\/characters\/detail\/.+-back\.png$/,
          );
          assert.equal(detailViews?.fullBody, asset.previewUrl);
          assert.equal(detailViews?.closeup, undefined);
        }
      }
    } finally {
      await db.close();
    }
  });

  it("seeds every official role scene and prop with generated raster previews", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:01:50.000Z"),
      });

      for (const category of ["character", "scene", "prop"] as const) {
        const listed = await listLibraryAssetsForActor(db, {
          actor,
          scope: "official",
          category,
          now: new Date("2026-05-23T09:01:55.000Z"),
        });

        assert.ok(listed.assets.length > 0, `Expected seeded ${category} assets`);
        for (const asset of listed.assets) {
          assert.match(
            asset.previewUrl ?? "",
            /^\/assets\/library\/official\/.+\.png$/,
            `Expected ${asset.name} to use a generated PNG preview`,
          );
          assert.equal(asset.latestVersion.mimeType, "image/png");
          assert.ok(!asset.previewUrl?.startsWith("data:image/svg+xml"));
          if (asset.category === "character") {
            const detailViews = asset.latestVersion.metadata.detailViews as
              | Record<string, unknown>
              | undefined;
            assert.match(
              String(detailViews?.turnaround ?? ""),
              /^\/assets\/library\/official\/characters\/detail\/.+-sheet\.png$/,
            );
            assert.match(
              String(detailViews?.front ?? ""),
              /^\/assets\/library\/official\/characters\/detail\/.+-front\.png$/,
            );
            assert.match(
              String(detailViews?.side ?? ""),
              /^\/assets\/library\/official\/characters\/detail\/.+-side\.png$/,
            );
            assert.match(
              String(detailViews?.back ?? ""),
              /^\/assets\/library\/official\/characters\/detail\/.+-back\.png$/,
            );
          }
        }
      }
    } finally {
      await db.close();
    }
  });

  it("uses standard white card previews for official 2D xianxia characters", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:01:58.000Z"),
      });

      const listed = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "character",
        now: new Date("2026-05-23T09:01:59.000Z"),
      });
      const fairy = listed.assets.find((asset) =>
        asset.previewUrl?.endsWith("/2d-xianxia-fairy.png"),
      );

      assert.ok(fairy, "Expected 2D xianxia fairy to use the standard preview asset");
      assert.equal(
        fairy.latestVersion.storageObjectKey,
        "official/characters/2d-xianxia-fairy.png",
      );
      const detailViews = fairy.latestVersion.metadata.detailViews as
        | Record<string, unknown>
        | undefined;
      assert.equal(
        detailViews?.fullBody,
        "/assets/library/official/characters/detail/2d-xianxia-fairy-full-body.png",
      );
    } finally {
      await db.close();
    }
  });

  it("searches official role assets across folders inside the selected category", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:02:00.000Z"),
      });

      const listed = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "character",
        folder: "国内仿真人-现代都市",
        query: "皇后",
        now: new Date("2026-05-23T09:03:00.000Z"),
      });

      assert.deepEqual(listed.assets.map((asset) => asset.name), ["皇后"]);
      assert.equal(listed.assets[0]?.folder, "国内仿真人-东方古代");
      assert.deepEqual(listed.folders, [
        "国内仿真人-现代都市",
        "国内仿真人-东方古代",
        "3D漫-现代都市",
        "3D漫-东方修仙",
        "2D漫-现代都市",
        "2D漫-东方修仙",
      ]);
    } finally {
      await db.close();
    }
  });

  it("searches official assets across role scene and prop categories", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:03:30.000Z"),
      });

      const listed = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "character",
        folder: "国内仿真人-现代都市",
        query: "车库",
        now: new Date("2026-05-23T09:03:45.000Z"),
      });

      assert.deepEqual(listed.assets.map((asset) => asset.name).sort(), ["智能车库", "车库"]);
      assert.ok(listed.assets.every((asset) => asset.category === "scene"));
    } finally {
      await db.close();
    }
  });

  it("does not treat official asset folders as searchable asset content", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:04:00.000Z"),
      });

      const listed = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "prop",
        query: "修仙",
        now: new Date("2026-05-23T09:04:30.000Z"),
      });

      assert.deepEqual(listed.assets, []);
    } finally {
      await db.close();
    }
  });

  it("lists seeded official scene assets with landscape previews", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:05:00.000Z"),
      });

      const listed = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "scene",
        folder: "国内仿真人-现代都市",
        now: new Date("2026-05-23T09:06:00.000Z"),
      });

      const names = listed.assets.map((asset) => asset.name);
      for (const expectedName of ["车库", "别墅", "小巷", "医院", "办公室", "酒店", "会所", "机场"]) {
        assert.ok(names.includes(expectedName), `Expected scene asset ${expectedName}`);
      }
      assert.equal(listed.assets.length, 8);
      assert.ok(
        listed.assets.every((asset) => asset.latestVersion.width > asset.latestVersion.height),
      );
      assert.ok(
        listed.assets.every((asset) =>
          /^\/assets\/library\/official\/scenes\/.+\.png$/.test(
            asset.latestVersion.previewUrl ?? "",
          ),
        ),
      );
    } finally {
      await db.close();
    }
  });

  it("seeds every customer demo scene folder with usable scene assets", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:07:00.000Z"),
      });

      const expectedFolders = [
        "国内仿真人-现代都市",
        "国内仿真人-东方古代",
        "3D漫-现代都市",
        "3D漫-东方修仙",
        "2D漫-现代都市",
        "2D漫-东方修仙",
      ];
      const expectedAssetsByFolder = new Map([
        ["国内仿真人-东方古代", ["牢房", "王府", "市集", "御书房", "客栈", "酒楼", "御花园", "军营"]],
        ["3D漫-现代都市", ["未来公寓", "霓虹街区", "直播间", "学院广场", "智能车库", "云端办公室", "赛博商场", "高铁站"]],
        ["3D漫-东方修仙", ["云海仙台", "灵石洞府", "宗门大殿", "秘境森林", "试炼山门", "仙舟甲板", "丹房", "星河悬崖"]],
        ["2D漫-现代都市", ["漫画公寓", "街角咖啡店", "黄昏教室", "天台夜景", "地铁站", "校园操场", "便利店", "城市天桥"]],
        ["2D漫-东方修仙", ["莲池仙境", "剑阵山门", "竹林秘境", "星河崖畔", "山谷药庐", "灵兽庭院", "月下古桥", "仙门书阁"]],
      ]);

      const allScenes = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "scene",
        now: new Date("2026-05-23T09:07:30.000Z"),
      });

      assert.deepEqual(allScenes.folders, expectedFolders);

      for (const [folder, expectedNames] of expectedAssetsByFolder) {
        const listed = await listLibraryAssetsForActor(db, {
          actor,
          scope: "official",
          category: "scene",
          folder,
          now: new Date("2026-05-23T09:08:00.000Z"),
        });

        const names = listed.assets.map((asset) => asset.name);
        for (const expectedName of expectedNames) {
          assert.ok(names.includes(expectedName), `Expected ${folder} to include ${expectedName}`);
        }
        assert.deepEqual(listed.folders, expectedFolders);
        assert.ok(
          listed.assets.every(
            (asset) =>
              asset.folder === folder &&
              asset.latestVersion.width > asset.latestVersion.height &&
              isUsableOfficialPreview(asset.previewUrl),
          ),
          `Expected ${folder} scene assets to include usable landscape previews`,
        );
      }
    } finally {
      await db.close();
    }
  });

  it("seeds every customer demo prop folder with usable prop assets", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:07:45.000Z"),
      });

      const expectedFolders = [
        "国内仿真人-现代都市",
        "国内仿真人-东方古代",
        "3D漫-现代都市",
        "3D漫-东方修仙",
        "2D漫-现代都市",
        "2D漫-东方修仙",
      ];
      const expectedAssetsByFolder = new Map([
        ["国内仿真人-现代都市", ["工作证", "手机", "公文包", "录音笔", "医疗箱", "车钥匙", "相机", "文件袋"]],
        ["国内仿真人-东方古代", ["刀剑", "酒壶", "令牌", "圣旨", "秘密信息", "毒药", "玉佩", "印玺"]],
        ["3D漫-现代都市", ["全息终端", "智能手环", "数据芯片", "电子耳麦", "悬浮滑板", "机械钥匙", "能量饮料", "追踪器"]],
        ["3D漫-东方修仙", ["飞剑", "灵石", "丹炉", "玉简", "法阵罗盘", "乾坤袋", "灵兽铃", "仙草匣"]],
        ["2D漫-现代都市", ["书包", "耳机", "漫画书", "奶茶", "地铁卡", "拍立得", "社团徽章", "便利贴"]],
        ["2D漫-东方修仙", ["符箓", "灵剑", "药瓶", "纸伞", "玉笛", "莲花灯", "灵兽蛋", "阵法卷轴"]],
      ]);

      const allProps = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "prop",
        now: new Date("2026-05-23T09:07:50.000Z"),
      });

      assert.deepEqual(allProps.folders, expectedFolders);

      for (const [folder, expectedNames] of expectedAssetsByFolder) {
        const listed = await listLibraryAssetsForActor(db, {
          actor,
          scope: "official",
          category: "prop",
          folder,
          now: new Date("2026-05-23T09:07:55.000Z"),
        });

        const names = listed.assets.map((asset) => asset.name);
        for (const expectedName of expectedNames) {
          assert.ok(names.includes(expectedName), `Expected ${folder} to include ${expectedName}`);
        }
        assert.deepEqual(listed.folders, expectedFolders);
        assert.ok(
          listed.assets.every(
            (asset) =>
              asset.folder === folder &&
              asset.category === "prop" &&
              isUsableOfficialPreview(asset.previewUrl),
          ),
          `Expected ${folder} prop assets to include usable previews`,
        );
      }
    } finally {
      await db.close();
    }
  });

  it("seeds every customer demo role folder with usable character assets", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await ensureDefaultOfficialLibraryAssets(db, {
        now: new Date("2026-05-23T09:08:00.000Z"),
      });

      const expectedFolders = [
        "国内仿真人-现代都市",
        "国内仿真人-东方古代",
        "3D漫-现代都市",
        "3D漫-东方修仙",
        "2D漫-现代都市",
        "2D漫-东方修仙",
      ];

      const allCharacters = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "character",
        now: new Date("2026-05-23T09:09:00.000Z"),
      });

      assert.deepEqual(allCharacters.folders, expectedFolders);

      for (const folder of expectedFolders) {
        const listed = await listLibraryAssetsForActor(db, {
          actor,
          scope: "official",
          category: "character",
          folder,
          now: new Date("2026-05-23T09:09:30.000Z"),
        });

        assert.ok(listed.assets.length >= 6, `Expected ${folder} to have customer-demo assets`);
        assert.deepEqual(listed.folders, expectedFolders);
        assert.ok(
          listed.assets.every((asset) => asset.folder === folder && asset.previewUrl),
          `Expected ${folder} assets to include previews`,
        );
      }

      const ancient = await listLibraryAssetsForActor(db, {
        actor,
        scope: "official",
        category: "character",
        folder: "国内仿真人-东方古代",
        query: "皇",
        now: new Date("2026-05-23T09:10:00.000Z"),
      });

      assert.deepEqual(ancient.assets.map((asset) => asset.name), ["皇后", "皇帝"]);
      assert.deepEqual(ancient.folders, expectedFolders);
    } finally {
      await db.close();
    }
  });

  it("gates team assets on a server-side organization entitlement", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantAndProject(db);
      await upsertLibraryAssetWithVersion(db, {
        asset: {
          id: "51000000-0000-4000-8000-000000000001",
          scope: "team",
          organizationId,
          workspaceId,
          createdByUserId: userId,
          assetType: "character",
          category: "character",
          folder: "团队角色",
          name: "团队主角",
          description: "团队共用角色",
          tags: ["team"],
          status: "active",
          requiresProEntitlement: true,
          createdAt: new Date("2026-05-23T09:10:00.000Z"),
          updatedAt: new Date("2026-05-23T09:10:00.000Z"),
        },
        version: {
          id: "52000000-0000-4000-8000-000000000001",
          versionNumber: 1,
          storageObjectKey: "team/hero.png",
          previewUrl: "data:image/png;base64,team-hero",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          metadata: { source: "test" },
          createdAt: new Date("2026-05-23T09:10:00.000Z"),
        },
      });

      const blocked = await listLibraryAssetsForActor(db, {
        actor,
        scope: "team",
        now: new Date("2026-05-23T09:11:00.000Z"),
      });

      assert.equal(blocked.entitlement.hasTeamAssetLibrary, false);
      assert.equal(
        blocked.entitlement.blockReason,
        "team_asset_library_entitlement_required",
      );
      assert.deepEqual(blocked.assets, []);

      await grantTeamAssetEntitlement(db);

      const allowed = await listLibraryAssetsForActor(db, {
        actor,
        scope: "team",
        now: new Date("2026-05-23T09:12:00.000Z"),
      });

      assert.equal(allowed.entitlement.hasTeamAssetLibrary, true);
      assert.deepEqual(allowed.assets.map((asset) => asset.name), ["团队主角"]);
    } finally {
      await db.close();
    }
  });

  it("does not expose project-import behavior from the reusable asset library service", () => {
    assert.equal("importLibraryAssetToProject" in assetLibraryService, false);
  });
});

async function seedTenantAndProject(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800138000', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Asset Library Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Asset Library Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES ('30000000-0000-4000-8000-000000000001', $1, $2, $3, 'owner_admin', 'active')
    `,
    [organizationId, workspaceId, userId],
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
      VALUES ($1, $2, $3, 'Asset Library Project', '9:16', '1080p', 'script_input', $4)
    `,
    [projectId, organizationId, workspaceId, userId],
  );
}

async function grantTeamAssetEntitlement(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO organization_entitlements (
        id,
        organization_id,
        entitlement_key,
        status,
        source,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (
        '53000000-0000-4000-8000-000000000001',
        $1,
        'team_asset_library',
        'active',
        'manual',
        NULL,
        '2026-05-23T09:12:00.000Z',
        '2026-05-23T09:12:00.000Z'
      )
    `,
    [organizationId],
  );
}

function isUsableOfficialPreview(previewUrl: string | null | undefined) {
  return (
    previewUrl?.startsWith("data:image/svg+xml") === true ||
    /^\/assets\/library\/official\/.+\.png$/.test(previewUrl ?? "")
  );
}
