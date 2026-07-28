import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { createAdminImagePromptService } from "./admin-image-prompt.service.ts";

describe("admin image prompt service", { concurrency: false }, () => {
  it("creates and updates an image style in the unified prompts table", async () => {
    const db = await createMigratedTestDb();
    try {
      const actorAdminAccountId = "81000000-0000-4000-8000-000000000001";
      const promptId = "82000000-0000-4000-8000-000000000001";
      await seedAdmin(db, actorAdminAccountId);
      const service = createAdminImagePromptService({ db });

      const created = await service.saveStyle({
        id: promptId,
        name: "国风仙侠",
        cover_image_url: "/admin/assets/prompt-covers/chinese-style.webp",
        prompt_content: "国风仙侠风格，保留东方服饰细节、仙侠氛围、清晰主体和统一光影质感。",
        status: "enabled",
        price_credits: 12,
        usage_count: 7,
        is_published: true,
        remark: "用于东方奇幻题材的生图风格。",
        actorAdminAccountId,
        now: new Date("2026-06-19T08:00:00.000Z"),
      });

      assert.equal(created.status, 200);
      assert.equal(created.body.data.id, promptId);
      assert.equal(created.body.data.name, "国风仙侠");
      assert.equal(created.body.data.summary, "用于东方奇幻题材的生图风格。");
      assert.equal(created.body.data.cover_image_url, "/admin/assets/prompt-covers/chinese-style.webp");
      assert.match(created.body.data.prompt_content, /东方服饰细节/);
      assert.equal(created.body.data.status, "enabled");
      assert.equal(created.body.data.price_credits, 12);
      assert.equal(created.body.data.priceCredits, 12);
      assert.equal(created.body.data.usage_count, 7);
      assert.equal(created.body.data.usageCount, 7);
      assert.equal(created.body.data.is_published, true);
      assert.equal(created.body.data.isPublished, true);

      const updated = await service.saveStyle({
        id: promptId,
        name: "国风水墨仙侠",
        cover_image_url: "/admin/assets/prompt-covers/ink-xianxia.webp",
        prompt_content: "国风水墨仙侠风格，强调宣纸肌理、留白构图、水墨晕染和统一的画面层次。",
        status: "disabled",
        price_credits: 42,
        usage_count: 123,
        is_published: true,
        remark: "调整为水墨仙侠视觉效果。",
        actorAdminAccountId,
        now: new Date("2026-06-19T09:00:00.000Z"),
      });

      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.name, "国风水墨仙侠");
      assert.equal(updated.body.data.summary, "调整为水墨仙侠视觉效果。");
      assert.equal(updated.body.data.cover_image_url, "/admin/assets/prompt-covers/ink-xianxia.webp");
      assert.match(updated.body.data.prompt_content, /宣纸肌理/);
      assert.equal(updated.body.data.status, "disabled");
      assert.equal(updated.body.data.priceCredits, 42);
      assert.equal(updated.body.data.usage_count, 123);
      assert.equal(updated.body.data.usageCount, 123);
      assert.equal(updated.body.data.isPublished, false);

      const reenabled = await service.changeStyleStatus({
        id: promptId,
        status: "enabled",
        actorAdminAccountId,
        now: new Date("2026-06-19T10:00:00.000Z"),
      });
      assert.equal(reenabled.status, 200);
      assert.equal(reenabled.body.data.isPublished, false);

      const invalidPrice = await service.saveStyle({
        name: "价格越界提示词",
        prompt_content: "用于验证后台提示词积分价格上限必须与创作者端保持一致的测试提示词正文。",
        price_credits: 100_000,
        actorAdminAccountId,
        now: new Date("2026-06-19T10:01:00.000Z"),
      });
      assert.equal(invalidPrice.status, 400);
      assert.equal(invalidPrice.body.error.code, "invalid_image_prompt_price");

      const invalidUsageCount = await service.saveStyle({
        name: "使用次数越界提示词",
        prompt_content: "用于验证后台提示词使用次数必须是非负整数的测试提示词正文。",
        usage_count: -1,
        actorAdminAccountId,
        now: new Date("2026-06-19T10:02:00.000Z"),
      });
      assert.equal(invalidUsageCount.status, 400);
      assert.equal(invalidUsageCount.body.error.code, "invalid_image_prompt_usage_count");

      const persisted = await db.query<{
        prompt_category: string;
        name: string;
        summary: string;
        cover_image_url: string;
        prompt_content: string;
        status: string;
        is_official: boolean;
        price_credits: number;
        usage_count: number;
        is_published: boolean;
      }>(
        `SELECT prompt_category, name, summary, cover_image_url, prompt_content,
                status, is_official, price_credits, usage_count, is_published
         FROM prompts
         WHERE id = $1`,
        [promptId],
      );
      assert.deepEqual(persisted.rows, [{
        prompt_category: "image_style",
        name: "国风水墨仙侠",
        summary: "调整为水墨仙侠视觉效果。",
        cover_image_url: "/admin/assets/prompt-covers/ink-xianxia.webp",
        prompt_content: "国风水墨仙侠风格，强调宣纸肌理、留白构图、水墨晕染和统一的画面层次。",
        status: "enabled",
        is_official: true,
        price_credits: 42,
        usage_count: 123,
        is_published: false,
      }]);
    } finally {
      await db.close();
    }
  });

  it("lists only image styles and filters them by status and searchable content", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `INSERT INTO prompts (
           id, prompt_category, name, summary, cover_image_url, prompt_content,
           status, is_official, is_published, published_at
         ) VALUES
           ('82000000-0000-4000-8000-000000000011', 'image_style', '赛博夜景', '霓虹城市氛围',
            '/admin/assets/prompt-covers/cyberpunk.webp', '赛博朋克夜景风格，保留霓虹灯光、未来城市、机械细节和高对比画面。',
            'enabled', true, true, now()),
           ('82000000-0000-4000-8000-000000000012', 'image_style', '水墨山水', '东方写意画面',
            '/admin/assets/prompt-covers/ink.webp', '水墨山水风格，强调宣纸质感、墨色晕染、远山层次与东方留白。',
            'disabled', true, false, NULL),
           ('82000000-0000-4000-8000-000000000013', 'script', '赛博剧本', '霓虹城市氛围',
            '/admin/assets/prompt-covers/script.webp', '这是剧本分类的正文，即使含有赛博关键词也不应出现在生图风格列表中。',
            'enabled', true, true, now())`,
      );
      const service = createAdminImagePromptService({ db });

      const enabledCyberpunk = await service.listStyles({
        status: "enabled",
        keyword: "赛博",
        pageSize: 5,
      });
      assert.equal(enabledCyberpunk.meta.total, 1);
      assert.equal(enabledCyberpunk.meta.pageSize, 5);
      assert.equal(enabledCyberpunk.data.length, 1);
      assert.equal(enabledCyberpunk.data[0]?.name, "赛博夜景");
      assert.equal(enabledCyberpunk.data[0]?.cover_image_url, "/admin/assets/prompt-covers/cyberpunk.webp");

      const disabledByContent = await service.listStyles({
        status: "disabled",
        keyword: "宣纸质感",
      });
      assert.equal(disabledByContent.meta.total, 1);
      assert.equal(disabledByContent.data[0]?.name, "水墨山水");
      assert.equal(disabledByContent.data[0]?.summary, "东方写意画面");
      assert.match(disabledByContent.data[0]?.prompt_content ?? "", /墨色晕染/);
    } finally {
      await db.close();
    }
  });
});

async function seedAdmin(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  actorAdminAccountId: string,
) {
  await db.query(
    `INSERT INTO admin_accounts (
       id, login_name, password_hash, display_name, status
     ) VALUES (
       $1, 'image_prompt_admin', 'plain:test-password', 'Image Prompt Admin', 'active'
     )`,
    [actorAdminAccountId],
  );
}
