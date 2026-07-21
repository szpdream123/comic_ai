import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb, listIndexNames } from "../../shared/db/test-db.ts";
import {
  BrandKitError,
  createBrandKit,
  createBrandKitAsset,
  deleteBrandKit,
  duplicateBrandKit,
  getBrandKitDetail,
  getProjectBrandKitSelection,
  listBrandKits,
  setProjectBrandKitSelection,
  updateBrandKit,
  updateBrandKitAsset,
} from "../brand-kit.service.ts";

const mainUserId = "00000000-0000-4000-8000-000000000981";
const otherUserId = "00000000-0000-4000-8000-000000000982";
const memberId = "10000000-0000-4000-8000-000000000981";
const projectId = "30000000-0000-4000-8000-000000000981";
const logoObjectId = "60000000-0000-4000-8000-000000000981";
const foreignObjectId = "60000000-0000-4000-8000-000000000982";

describe("brand kit service", { concurrency: false }, () => {
  it("manages multiple shared kits, typed assets, defaults, duplication and project selection", async () => {
    const db = await createMigratedTestDb();
    try {
      await seed(db);
      const first = await createBrandKit(db, {
        adminUserId: mainUserId,
        createdByMemberId: memberId,
        name: "都市悬疑",
      });
      const second = await createBrandKit(db, { adminUserId: mainUserId, name: "古风品牌" });
      assert.equal((await listBrandKits(db, { adminUserId: mainUserId })).length, 2);

      await updateBrandKit(db, {
        adminUserId: mainUserId,
        kitId: first.id,
        guidanceText: "画面克制，避免高饱和。",
        isDefault: true,
      });
      await updateBrandKit(db, { adminUserId: mainUserId, kitId: second.id, isDefault: true });
      assert.deepEqual(
        (await listBrandKits(db, { adminUserId: mainUserId })).map((kit) => kit.is_default),
        [false, true],
      );

      const color = await createBrandKitAsset(db, {
        adminUserId: mainUserId,
        kitId: first.id,
        assetType: "color",
        displayName: "主色",
        textContent: "#12abef",
      });
      const logo = await createBrandKitAsset(db, {
        adminUserId: mainUserId,
        kitId: first.id,
        assetType: "logo",
        displayName: "横版标志",
        storageObjectId: logoObjectId,
        metadata: { variant: "horizontal" },
      });
      assert.equal(color.text_content, "#12ABEF");
      assert.equal(logo.storage_object_id, logoObjectId);
      assert.equal((await listBrandKits(db, { adminUserId: mainUserId }))[0]?.asset_counts.logo, 1);

      const renamed = await updateBrandKitAsset(db, {
        adminUserId: mainUserId,
        kitId: first.id,
        assetId: logo.id,
        displayName: "主标志",
        sortOrder: 4,
      });
      assert.equal(renamed.display_name, "主标志");
      assert.equal(renamed.sort_order, 4);

      const duplicate = await duplicateBrandKit(db, {
        adminUserId: mainUserId,
        createdByMemberId: memberId,
        kitId: first.id,
      });
      assert.equal(duplicate.name, "都市悬疑 (副本)");
      assert.equal(duplicate.is_default, false);
      assert.equal(duplicate.assets.length, 2);
      assert.equal(duplicate.assets.find((asset) => asset.asset_type === "logo")?.storage_object_id, logoObjectId);

      assert.equal(await getProjectBrandKitSelection(db, { adminUserId: mainUserId, projectId }), null);
      assert.equal(await setProjectBrandKitSelection(db, { adminUserId: mainUserId, projectId, brandKitId: first.id }), first.id);
      assert.equal(await getProjectBrandKitSelection(db, { adminUserId: mainUserId, projectId }), first.id);
      await deleteBrandKit(db, { adminUserId: mainUserId, kitId: first.id });
      assert.equal(await getProjectBrandKitSelection(db, { adminUserId: mainUserId, projectId }), null);
    } finally {
      await db.close();
    }
  });

  it("isolates main accounts and rejects invalid colors and foreign or wrong-type storage objects", async () => {
    const db = await createMigratedTestDb();
    try {
      await seed(db);
      const kit = await createBrandKit(db, { adminUserId: mainUserId, name: "品牌" });
      assert.deepEqual(await listBrandKits(db, { adminUserId: otherUserId }), []);
      await assert.rejects(
        getBrandKitDetail(db, { adminUserId: otherUserId, kitId: kit.id }),
        (error: unknown) => error instanceof BrandKitError && error.code === "brand_kit_not_found",
      );
      await assert.rejects(
        createBrandKitAsset(db, {
          adminUserId: mainUserId,
          kitId: kit.id,
          assetType: "color",
          displayName: "错误颜色",
          textContent: "red",
        }),
        (error: unknown) => error instanceof BrandKitError && error.code === "invalid_brand_kit_color",
      );
      await assert.rejects(
        createBrandKitAsset(db, {
          adminUserId: mainUserId,
          kitId: kit.id,
          assetType: "logo",
          displayName: "越权标志",
          storageObjectId: foreignObjectId,
        }),
        (error: unknown) => error instanceof BrandKitError && error.code === "brand_kit_storage_object_not_found",
      );
      await assert.rejects(
        createBrandKitAsset(db, {
          adminUserId: mainUserId,
          kitId: kit.id,
          assetType: "font",
          displayName: "错误字体",
          storageObjectId: logoObjectId,
        }),
        (error: unknown) => error instanceof BrandKitError && error.code === "brand_kit_storage_object_type_invalid",
      );
      await assert.rejects(
        setProjectBrandKitSelection(db, { adminUserId: otherUserId, projectId, brandKitId: kit.id }),
        (error: unknown) => error instanceof BrandKitError && error.code === "brand_kit_project_not_found",
      );

      assert.ok((await listIndexNames(db, "creator_brand_kits")).includes("creator_brand_kits_admin_default_uidx"));
      assert.ok((await listIndexNames(db, "creator_brand_kit_assets")).includes("creator_brand_kit_assets_kit_type_sort_idx"));
    } finally {
      await db.close();
    }
  });
});

async function seed(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138981', 'active'), ($2, '13800138982', 'active')",
    [mainUserId, otherUserId],
  );
  await db.query(
    `
      INSERT INTO team_members
        (id, user_id, member_account, member_account_suffix, member_login_account, member_name, member_password_hash, status)
      VALUES ($1, $2, 'brandmember', 'u138981', 'brandmember@u138981', '品牌成员', 'unused', 'active')
    `,
    [memberId, mainUserId],
  );
  await db.query(
    `
      INSERT INTO projects (id, name, aspect_ratio, resolution, phase, owner_user_id, created_by_user_id)
      VALUES ($1, 'Brand project', '9:16', '1080p', 'script_input', $2, $2)
    `,
    [projectId, mainUserId],
  );
  await db.query(
    `
      INSERT INTO storage_objects
        (id, bucket, object_key, content_type, size_bytes, created_by_user_id, provider, status)
      VALUES
        ($1, 'creator-test', 'brand/logo.png', 'image/png', 2048, $2, 'creator-dev', 'available'),
        ($3, 'creator-test', 'brand/foreign.png', 'image/png', 2048, $4, 'creator-dev', 'available')
    `,
    [logoObjectId, mainUserId, foreignObjectId, otherUserId],
  );
}
