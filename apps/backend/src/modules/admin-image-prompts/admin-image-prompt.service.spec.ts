import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { createAdminImagePromptService } from "./admin-image-prompt.service.ts";

describe("admin image prompt service", { concurrency: false }, () => {
  it("updates a seeded style when the admin UI sends its fallback id and stable code", async () => {
    const db = await createMigratedTestDb();
    try {
      const service = createAdminImagePromptService({ db });
                  await db.query(
        `
          INSERT INTO admin_accounts (
            id, login_name, password_hash, display_name, status
          ) VALUES (
            '81000000-0000-4000-8000-000000000001',
            'image_prompt_admin',
            'plain:test-password',
            'Image Prompt Admin',
            'active'
          )
        `,
      );

      await service.listStyles();
      const result = await service.saveStyle({
        id: "image-style-animation",
        name: "动画",
        code: "animation",
        category: "official",
        model_family: "doubao",
        cover_image_url: "/admin/assets/prompt-covers/animation.webp",
        prompt_content: "二次元，动漫风，日系，手绘，插画风，角色造型生动，色彩明快，线条干净，自然",
        negative_prompt: "避免文字、水印、logo、低清晰度、主体不完整。",
        tags: ["动画"],
        status: "enabled",
        sort_order: 290,
        actorAdminAccountId: "81000000-0000-4000-8000-000000000001",
        now: new Date("2026-06-06T08:30:00.000Z"),
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.data.code, "animation");

      const rows = await db.query<{ prompt_content: string }>(
        "SELECT prompt_content FROM image_prompt_styles WHERE code = 'animation'",
      );
      assert.equal(rows.rows.length, 1);
      assert.match(rows.rows[0]?.prompt_content ?? "", /二次元，动漫风/);
    } finally {
      await (db as unknown as { close?: () => Promise<void> }).close?.();
    }
  });
  it("rejects clearing default from the current default style", async () => {
    const db = await createMigratedTestDb();
    try {
      const service = createAdminImagePromptService({ db });
      const actorAdminAccountId = "81000000-0000-4000-8000-000000000001";
                  await db.query(
        `
          INSERT INTO admin_accounts (
            id, login_name, password_hash, display_name, status
          ) VALUES (
            $1,
            'image_prompt_admin',
            'plain:test-password',
            'Image Prompt Admin',
            'active'
          )
        `,
        [actorAdminAccountId],
      );

      await service.listStyles();
      const seeded = await db.query<{ id: string; code: string; is_default: boolean }>(
        "SELECT id, code, is_default FROM image_prompt_styles WHERE is_default = true ORDER BY sort_order DESC, updated_at DESC, id ASC LIMIT 1",
      );
      assert.equal(seeded.rows[0]?.is_default, true);

      const result = await service.saveStyle({
        id: seeded.rows[0]?.id,
        name: "鍔ㄧ敾",
        code: seeded.rows[0]?.code ?? "portrait_photography",
        category: "official",
        model_family: "doubao",
        prompt_content: "浜屾鍏冿紝鍔ㄦ极椋庯紝鏃ョ郴锛屾墜缁橈紝鎻掔敾椋庯紝瑙掕壊閫犲瀷鐢熷姩锛岃壊褰╂槑蹇紝绾挎潯骞插噣锛岃嚜鐒朵富鍏夈€?",
        negative_prompt: "閬垮厤鏂囧瓧銆佹按鍗般€乴ogo銆佷綆娓呮櫚搴︺€佷富浣撲笉瀹屾暣銆?",
        tags: ["鍔ㄧ敾"],
        status: "enabled",
        sort_order: 290,
        is_default: false,
        actorAdminAccountId,
        now: new Date("2026-06-06T09:00:00.000Z"),
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.error?.code, "default_image_prompt_style_required");

      const persisted = await db.query<{ is_default: boolean }>(
        "SELECT is_default FROM image_prompt_styles WHERE id = $1",
        [seeded.rows[0]?.id],
      );
      assert.equal(persisted.rows[0]?.is_default, true);
    } finally {
      await (db as unknown as { close?: () => Promise<void> }).close?.();
    }
  });

  it("accepts the batch image prompt category and persists matching styles into that group", async () => {
    const db = await createMigratedTestDb();
    try {
      const service = createAdminImagePromptService({ db });
      const actorAdminAccountId = "81000000-0000-4000-8000-000000000001";
                  await db.query(
        `
          INSERT INTO admin_accounts (
            id, login_name, password_hash, display_name, status
          ) VALUES (
            $1,
            'image_prompt_admin',
            'plain:test-password',
            'Image Prompt Admin',
            'active'
          )
        `,
        [actorAdminAccountId],
      );

      const result = await service.saveStyle({
        name: "国风仙侠",
        code: "national_xia",
        category: "batch",
        batch_preset_target: "character",
        model_family: "doubao",
        prompt_content: "国风仙侠风格，保留东方服饰细节、仙侠氛围、清晰主体和统一光影质感。",
        negative_prompt: "避免水印、文字、人物肢体错乱、构图凌乱和主体残缺。",
        tags: ["国风", "仙侠"],
        status: "enabled",
        sort_order: 100,
        actorAdminAccountId,
        now: new Date("2026-06-19T08:00:00.000Z"),
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.data.category, "batch");

      const rows = await db.query<{ category: string }>(
        "SELECT category FROM image_prompt_styles WHERE code = 'national_xia'",
      );
      assert.equal(rows.rows[0]?.category, "batch");
    } finally {
      await (db as unknown as { close?: () => Promise<void> }).close?.();
    }
  });

  it("reports filtered image prompt totals for admin list views", async () => {
    const db = await createMigratedTestDb();
    try {
      const service = createAdminImagePromptService({ db });
      const result = await service.listStyles({
        category: "batch",
        pageSize: 5,
      });

      assert.equal(result.meta.total, 9);
      assert.equal(result.meta.pageSize, 5);
      assert.equal(result.data.length, 5);
      assert.ok(result.data.every((item) => item.category === "batch"));
    } finally {
      await (db as unknown as { close?: () => Promise<void> }).close?.();
    }
  });

  it("seeds batch image prompt styles for admin batch lists", async () => {
    const db = await createMigratedTestDb();
    try {
      const service = createAdminImagePromptService({ db });
      const result = await service.listStyles({
        category: "batch",
        pageSize: 500,
      });

      assert.equal(result.meta.total, 9);
      assert.equal(result.data.length, 9);
      assert.ok(result.data.every((item) => item.category === "batch"));
      assert.ok(result.data.some((item) => item.code === "national_xianxia"));
      assert.ok(result.data.some((item) => item.code === "cyberpunk"));
    } finally {
      await (db as unknown as { close?: () => Promise<void> }).close?.();
    }
  });
});
