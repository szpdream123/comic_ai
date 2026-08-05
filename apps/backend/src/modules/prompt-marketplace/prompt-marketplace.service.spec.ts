import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { grantCredits } from "../credit-billing/credit-ledger.service.ts";
import {
  createMigratedTestDb,
  listColumnNames,
  listTableNames,
} from "../shared/db/test-db.ts";
import { createPromptMarketplaceService } from "./prompt-marketplace.service.ts";
import {
  assertPromptCanBeDeactivated,
  clearUserPromptDefault,
  setOfficialPromptDefault,
  setUserPromptDefault,
} from "./prompt-skill-default.service.ts";

describe("prompt marketplace service", { concurrency: false }, () => {
  it("does not select non-owner prompt bodies for catalog cards, rankings, or private libraries", async () => {
    const marketplaceQueries: string[] = [];
    const service = createPromptMarketplaceService({
      db: {
        async query<T>(sql: string) {
          if (/SELECT COUNT\(\*\) AS count/.test(sql)) {
            return { rows: [{ count: 0 }] as T[] };
          }
          marketplaceQueries.push(sql);
          return { rows: [] as T[] };
        },
      },
    });

    await service.listCatalog({ userId: null });
    await service.listLibrary({ userId: "82000000-0000-4000-8000-000000000001" });

    assert.equal(marketplaceQueries.length, 3);
    for (const sql of marketplaceQueries) {
      assert.doesNotMatch(sql, /item\.\*/);
    }
    assert.match(marketplaceQueries[0], /owner_link\.user_id = \$1 THEN item\.prompt_content/);
    assert.match(marketplaceQueries[1], /owner_link\.user_id = \$1 THEN item\.prompt_content/);
    assert.match(marketplaceQueries[2], /user_link\.relation_type = 'owner' THEN item\.prompt_content/);
  });

  it("keeps one optional private default per category and one required official default", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "81000000-0000-4000-8000-000000000001";
      const otherUserId = "81000000-0000-4000-8000-000000000002";
      const officialId = "81000000-0000-4000-8000-000000000010";
      const now = new Date("2026-07-26T08:00:00.000Z");
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800138101', '默认技能用户', 'plain:test-password', 'active'),
                ($2, '13800138102', '其他默认技能用户', 'plain:test-password', 'active')`,
        [userId, otherUserId],
      );
      await db.query(
        `INSERT INTO prompts (
           id, prompt_category, name, summary, prompt_content, status,
           is_official, is_published, price_credits, published_at
         ) VALUES ($1, 'script', '新的官方默认剧本技能', '', '官方技能正文', 'enabled', true, true, 0, $2)`,
        [officialId, now],
      );
      const service = createPromptMarketplaceService({ db });
      const first = await service.createItem({
        userId,
        title: "私人默认剧本技能一",
        category: "script",
        content: "私人正文一",
        publish: false,
        now,
      });
      const second = await service.createItem({
        userId,
        title: "私人默认剧本技能二",
        category: "script",
        content: "私人正文二",
        publish: false,
        now,
      });

      await setUserPromptDefault(db, { userId, category: "script", promptId: first.item.id, now });
      await setUserPromptDefault(db, { userId, category: "script", promptId: second.item.id, now });
      let library = await service.listLibrary({ userId });
      assert.deepEqual(library.items.filter((item) => item.isDefault).map((item) => item.id), [second.item.id]);
      await assert.rejects(
        () => setUserPromptDefault(db, { userId: otherUserId, category: "script", promptId: second.item.id, now }),
        (error) => error?.code === "private_prompt_default_invalid",
      );
      await clearUserPromptDefault(db, { userId, category: "script" });
      library = await service.listLibrary({ userId });
      assert.equal(library.items.some((item) => item.isDefault), false);

      await service.purchaseItem({ userId, itemId: officialId, now });
      await setUserPromptDefault(db, { userId, category: "script", promptId: officialId, now });
      for (const category of ["shot", "scene_extract", "character_extract", "prop_extract", "image_style", "storyboard", "other"]) {
        const item = await service.createItem({
          userId,
          title: `${category} 私人默认技能`,
          category,
          content: `${category} 默认技能正文`,
          publish: false,
          now,
        });
        await setUserPromptDefault(db, { userId, category, promptId: item.item.id, now });
      }
      const userDefaults = await db.query<{ prompt_category: string }>(
        "SELECT prompt_category FROM prompt_user_defaults WHERE user_id = $1 ORDER BY prompt_category",
        [userId],
      );
      assert.equal(userDefaults.rows.length, 8);
      library = await service.listLibrary({ userId });
      assert.equal(library.items.find((item) => item.id === officialId)?.isDefault, true);

      await setOfficialPromptDefault(db, { category: "script", promptId: officialId, now });
      const catalog = await service.listCatalog({ userId, category: "script", pageSize: 100 });
      assert.equal(catalog.items.find((item) => item.id === officialId)?.isDefault, true);
      await assert.rejects(
        () => assertPromptCanBeDeactivated(db, officialId),
        (error) => error?.code === "official_prompt_default_required",
      );
    } finally {
      await db.close();
    }
  });

  it("resolves official and personally added script conversion skills without exposing them to other users", async () => {
    const db = await createMigratedTestDb();
    try {
      const ownerId = "82000000-0000-4000-8000-000000000001";
      const otherId = "82000000-0000-4000-8000-000000000002";
      const officialId = "82000000-0000-4000-8000-000000000010";
      const now = new Date("2026-07-26T04:00:00.000Z");
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800138201', '技能作者', 'plain:test-password', 'active'),
                ($2, '13800138202', '其他用户', 'plain:test-password', 'active')`,
        [ownerId, otherId],
      );
      await db.query(
        `INSERT INTO prompts (
           id, prompt_category, name, summary, prompt_content, status,
           is_official, is_published, price_credits, published_at
         ) VALUES ($1, 'script', '官方小说转剧本', '', '官方技能正文', 'enabled', true, true, 8, $2)`,
        [officialId, now],
      );
      const service = createPromptMarketplaceService({ db });
      const personal = await service.createItem({
        userId: ownerId,
        title: "个人小说转剧本",
        category: "script",
        content: "短",
        priceCredits: 21,
        publish: false,
        now,
      });
      const sceneSkill = await service.createItem({
        userId: ownerId,
        title: "个人场景抽取技能",
        category: "scene_extract",
        content: "抽取全部场景并保持空间连续性。",
        priceCredits: 9,
        publish: false,
        now,
      });
      const imageStyleSkill = await service.createItem({
        userId: ownerId,
        title: "个人生图风格技能",
        category: "image_style",
        content: "统一使用东方幻想美术风格。",
        priceCredits: 13,
        publish: false,
        now,
      });
      await service.updateOwnItem({
        userId: ownerId,
        itemId: personal.item.id,
        title: "个人小说转剧本",
        category: "script",
        content: "改",
        priceCredits: 21,
        publish: false,
        now,
      });
      const longContent = "长".repeat(50_001);
      await assert.rejects(
        () => service.createItem({
          userId: ownerId,
          title: "超长小说转剧本",
          category: "script",
          content: longContent,
          publish: false,
          now,
        }),
        (error) => error?.code === "prompt_marketplace_content_invalid" && error?.message === "提示词正文不能超过 50000 个字符",
      );

      const official = await service.resolveScriptConversionSkill({ userId: otherId, itemId: officialId, now });
      const owned = await service.resolveScriptConversionSkill({ userId: ownerId, itemId: personal.item.id, now });
      const ownedSceneSkill = await service.resolveWorkflowPromptSkill({
        userId: ownerId,
        itemId: sceneSkill.item.id,
        category: "scene_extract",
        now,
      });
      const ownedImageStyleSkill = await service.resolveWorkflowPromptSkill({
        userId: ownerId,
        itemId: imageStyleSkill.item.id,
        category: "image_style",
        now,
      });

      assert.equal(official.content, "官方技能正文");
      assert.equal(official.priceCredits, 8);
      assert.equal(official.ownerUserId, null);
      assert.equal(owned.content, "改");
      assert.equal(owned.priceCredits, 0);
      assert.equal(owned.ownerUserId, ownerId);
      assert.equal(ownedSceneSkill.category, "scene_extract");
      assert.equal(ownedSceneSkill.priceCredits, 0);
      assert.equal(ownedSceneSkill.ownerUserId, ownerId);
      assert.equal(ownedImageStyleSkill.category, "image_style");
      assert.equal(ownedImageStyleSkill.content, "统一使用东方幻想美术风格。");
      assert.equal(ownedImageStyleSkill.priceCredits, 0);
      assert.equal(ownedImageStyleSkill.ownerUserId, ownerId);
      await assert.rejects(
        () => service.resolveWorkflowPromptSkill({
          userId: ownerId,
          itemId: sceneSkill.item.id,
          category: "character_extract",
          now,
        }),
        (error) => error?.code === "workflow_prompt_skill_forbidden" && error?.status === 403,
      );
      await assert.rejects(
        () => service.createItem({
          userId: ownerId,
          title: "空正文提示词",
          category: "script",
          content: "   ",
          publish: false,
          now,
        }),
        (error) => error?.code === "prompt_marketplace_content_invalid" && error?.message === "提示词正文不能为空",
      );
      await assert.rejects(
        () => service.resolveScriptConversionSkill({ userId: otherId, itemId: personal.item.id, now }),
        (error) => error?.code === "script_conversion_skill_forbidden" && error?.status === 403,
      );
    } finally {
      await db.close();
    }
  });

  it("publishes private prompts, adds them to private libraries for free, and allows free re-adding", async () => {
    const db = await createMigratedTestDb();
    try {
      const sellerId = "83000000-0000-4000-8000-000000000001";
      const buyerId = "83000000-0000-4000-8000-000000000002";
      const secondBuyerId = "83000000-0000-4000-8000-000000000003";
      const now = new Date("2026-07-25T04:00:00.000Z");
      await db.query(
        `
          INSERT INTO users (id, phone_e164, display_name, password_hash, status, credit_balance_cached)
          VALUES
            ($1, '13800138101', '提示词作者', 'plain:test-password', 'active', 0),
            ($2, '13800138102', '购买用户', 'plain:test-password', 'active', 0),
            ($3, '13800138103', '第二购买用户', 'plain:test-password', 'active', 0)
        `,
        [sellerId, buyerId, secondBuyerId],
      );
      await db.query(
        `
          INSERT INTO prompts (
            id, prompt_category, name, summary, prompt_content, cover_image_url,
            status, is_official, is_published, price_credits, published_at
          ) VALUES (
            '83000000-0000-4000-8000-000000000010',
            'script',
            '官方剧本提示词',
            '官方发布的剧本提示词。',
            '这是由管理端发布到提示词广场的官方剧本提示词正文。',
            '/admin/assets/prompt-covers/official-script.webp',
            'enabled',
            true,
            true,
            0,
            $1
          )
        `,
        [now],
      );
      await grantCredits(db, {
        userId: buyerId,
        amount: 100,
        sourceType: "prompt_marketplace_test_grant",
        sourceId: "83000000-0000-4000-8000-000000000020",
        reason: "提示词市场测试积分",
        createdByUserId: buyerId,
        now,
      });
      await grantCredits(db, {
        userId: secondBuyerId,
        amount: 100,
        sourceType: "prompt_marketplace_test_grant",
        sourceId: "83000000-0000-4000-8000-000000000021",
        reason: "第二用户提示词市场测试积分",
        createdByUserId: secondBuyerId,
        now,
      });

      const service = createPromptMarketplaceService({ db });
      const created = await service.createItem({
        userId: sellerId,
        title: "高转化故事板提示词",
        category: "storyboard",
        summary: "强化镜头节奏与角色一致性。",
        content: "请严格按照镜头节奏、人物关系、场景连续性与画面构图生成完整故事板。",
        priceCredits: 25,
        publish: true,
        now,
      });

      const updatedOwnItem = await service.updateOwnItem({
        userId: sellerId,
        itemId: created.item.id,
        title: "高转化故事板提示词（修订）",
        category: "storyboard",
        summary: "强化镜头节奏、角色一致性与封面展示。",
        content: "请严格按照镜头节奏、人物关系、场景连续性与画面构图生成完整故事板，并保持镜头语义清晰。",
        coverImageUrl: "https://example.com/owned-prompt-cover.png",
        priceCredits: 25,
        publish: true,
        now,
      });
      assert.equal(updatedOwnItem.item.title, "高转化故事板提示词（修订）");
      assert.equal(updatedOwnItem.item.coverImageUrl, "https://example.com/owned-prompt-cover.png");
      await assert.rejects(
        () => service.updateOwnItem({
          userId: buyerId,
          itemId: created.item.id,
          title: "无权编辑",
          category: "storyboard",
          content: "购买者不能修改不属于自己的提示词正文内容，这段文本用于验证所有者权限限制。",
          priceCredits: 0,
          publish: false,
          now,
        }),
        (error) => error?.code === "prompt_marketplace_owned_item_not_found" && error?.status === 404,
      );

      const catalog = await service.listCatalog({ userId: buyerId });
      const privateItem = catalog.items.find((item) => item.id === created.item.id);
      const officialItem = catalog.items.find((item) => item.title === "官方剧本提示词");
      assert.equal(privateItem?.priceCredits, 25);
      assert.equal(privateItem?.title, "高转化故事板提示词（修订）");
      assert.equal(privateItem?.ratingAverage, 5);
      assert.equal(privateItem?.contentVisible, false);
      assert.equal("content" in (privateItem ?? {}), false);
      assert.equal(officialItem?.official, true);
      assert.equal(officialItem?.priceCredits, 0);
      assert.equal(officialItem?.coverImageUrl, "/admin/assets/prompt-covers/official-script.webp");

      const adminItems = await service.listAdminItems({ category: "script", status: "published" });
      const adminOfficial = adminItems.items.find((item) => item.id === officialItem?.id);
      assert.equal(adminOfficial?.official, true);
      assert.equal(adminOfficial?.priceCredits, 0);
      const updatedAdminOfficial = await service.updateAdminItem({
        itemId: adminOfficial!.id,
        priceCredits: 12,
        status: "published",
        now,
      });
      assert.equal(updatedAdminOfficial.item.priceCredits, 12);
      assert.equal((await service.listCatalog({ userId: buyerId })).items.find((item) => item.id === adminOfficial!.id)?.priceCredits, 12);

      const adminPrivate = (await service.listAdminItems({ category: "storyboard", status: "published", source: "private" }))
        .items.find((item) => item.id === created.item.id);
      assert.equal(adminPrivate?.official, false);
      assert.equal(adminPrivate?.ownerUserId, sellerId);
      assert.equal(adminPrivate?.contentVisible, false);
      assert.equal("content" in (adminPrivate ?? {}), false);
      assert.equal((await service.listAdminItems({ source: "official" })).items.some((item) => item.id === created.item.id), false);

      const draftedPrivate = await service.updateAdminItem({
        itemId: created.item.id,
        priceCredits: 31,
        usageCount: 27,
        status: "draft",
        now,
      });
      assert.equal(draftedPrivate.item.priceCredits, 31);
      assert.equal(draftedPrivate.item.usageCount, 27);
      assert.equal(draftedPrivate.item.status, "draft");
      assert.equal((await service.listCatalog({ userId: buyerId })).items.some((item) => item.id === created.item.id), false);

      const ownerRepublishedDraft = await service.updateOwnItem({
        userId: sellerId,
        itemId: created.item.id,
        title: "高转化故事板提示词（草稿重发）",
        category: "storyboard",
        summary: "草稿允许作者重新发布。",
        content: "这是作者从草稿重新发布的故事板提示词正文，仍需保持镜头节奏和角色一致性。",
        priceCredits: 31,
        publish: true,
        now,
      });
      assert.equal(ownerRepublishedDraft.item.status, "published");

      const archivedPrivate = await service.updateAdminItem({
        itemId: created.item.id,
        status: "archived",
        now,
      });
      assert.equal(archivedPrivate.item.status, "archived");

      const ownerCannotRepublishArchived = await service.updateOwnItem({
        userId: sellerId,
        itemId: created.item.id,
        title: "高转化故事板提示词（归档后编辑）",
        category: "storyboard",
        summary: "归档提示词不能由作者重新上架。",
        content: "这是归档提示词的作者编辑正文，保留镜头节奏要求，但不能借由保存操作恢复到提示词广场。",
        priceCredits: 31,
        publish: true,
        now,
      });
      assert.equal(ownerCannotRepublishArchived.item.status, "archived");
      assert.equal(ownerCannotRepublishArchived.item.purchased, false);
      assert.equal((await service.listCatalog({ userId: buyerId })).items.some((item) => item.id === created.item.id), false);

      const republishedPrivate = await service.updateAdminItem({
        itemId: created.item.id,
        status: "published",
        now,
      });
      assert.equal(republishedPrivate.item.status, "published");
      assert.equal((await service.listCatalog({ userId: buyerId })).items.find((item) => item.id === created.item.id)?.priceCredits, 31);

      const [firstPurchase, concurrentPurchase] = await Promise.all([
        service.purchaseItem({ userId: buyerId, itemId: created.item.id, now }),
        service.purchaseItem({ userId: buyerId, itemId: created.item.id, now }),
      ]);
      assert.equal(concurrentPurchase.purchaseId, firstPurchase.purchaseId);
      assert.equal(Number(firstPurchase.alreadyOwned) + Number(concurrentPurchase.alreadyOwned), 1);
      assert.equal(firstPurchase.priceCredits, 0);
      assert.equal(firstPurchase.creditBalance, 100);
      const freeLink = await db.query<{
        price_credits_paid: number | string;
        credit_reservation_id: string | null;
      }>(
        "SELECT price_credits_paid, credit_reservation_id FROM prompt_user_links WHERE id = $1",
        [firstPurchase.purchaseId],
      );
      assert.equal(Number(freeLink.rows[0]?.price_credits_paid ?? -1), 0);
      assert.equal(freeLink.rows[0]?.credit_reservation_id, null);
      const buyerLibrary = await service.listLibrary({ userId: buyerId });
      const purchased = buyerLibrary.items.find((item) => item.id === created.item.id);
      assert.equal(purchased?.purchased, true);
      assert.equal(purchased?.contentVisible, false);
      assert.equal("content" in (purchased ?? {}), false);

      const used = await service.useItem({ userId: buyerId, itemId: created.item.id, now });
      assert.equal(used.contentVisible, false);
      assert.equal("content" in used, false);
      const rating = await service.rateItem({ userId: buyerId, itemId: created.item.id, rating: 5, now });
      assert.equal(rating.ratingAverage, 5);
      const storedRating = await db.query<{ rating_score: string; rating_count: number }>(
        "SELECT rating_score, rating_count FROM prompts WHERE id = $1",
        [created.item.id],
      );
      assert.equal(Number(storedRating.rows[0]?.rating_score), 5);
      assert.equal(Number(storedRating.rows[0]?.rating_count), 1);
      const ratingRows = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM prompt_ratings WHERE prompt_id = $1 AND user_id = $2",
        [created.item.id, buyerId],
      );
      assert.equal(ratingRows.rows[0]?.count, 1);
      await assert.rejects(
        () => service.rateItem({ userId: buyerId, itemId: created.item.id, rating: 4, now }),
        (error) => error?.code === "prompt_marketplace_rating_exists" && error?.status === 409,
      );
      await service.purchaseItem({ userId: secondBuyerId, itemId: created.item.id, now });
      const secondRating = await service.rateItem({ userId: secondBuyerId, itemId: created.item.id, rating: 3, now });
      assert.equal(secondRating.ratingAverage, 4);
      assert.equal(secondRating.ratingCount, 2);
      const aggregatedPrompt = await db.query<{ rating_score: string; rating_count: number }>(
        "SELECT rating_score, rating_count FROM prompts WHERE id = $1",
        [created.item.id],
      );
      assert.equal(Number(aggregatedPrompt.rows[0]?.rating_score), 4);
      assert.equal(Number(aggregatedPrompt.rows[0]?.rating_count), 2);
      const refreshedCatalog = await service.listCatalog({ userId: buyerId });
      assert.equal(refreshedCatalog.items.find((item) => item.id === created.item.id)?.ratingAverage, 4);

      await service.removeFromLibrary({ userId: buyerId, itemId: created.item.id, now });
      const secondPurchase = await service.purchaseItem({ userId: buyerId, itemId: created.item.id, now });
      assert.equal(secondPurchase.priceCredits, 0);
      assert.equal(secondPurchase.creditBalance, 100);
      const marketplaceReservations = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_reservations WHERE source_type = 'prompt_marketplace_purchase'",
      );
      assert.equal(marketplaceReservations.rows[0]?.count, 0);

      const sellerLibrary = await service.listLibrary({ userId: sellerId });
      const owned = sellerLibrary.items.find((item) => item.id === created.item.id);
      assert.equal(owned?.contentVisible, true);
      assert.match(owned?.content ?? "", /镜头节奏/);
    } finally {
      await (db as unknown as { close?: () => Promise<void> }).close?.();
    }
  });

  it("lets admins edit prompt metadata and official content, then soft-delete non-default prompts", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "82000000-0000-4000-8000-000000000001";
      const officialId = "82000000-0000-4000-8000-000000000010";
      const defaultOfficialId = "82000000-0000-4000-8000-000000000011";
      const now = new Date("2026-07-28T08:00:00.000Z");
      await db.query(
        "INSERT INTO users (id, phone_e164, display_name, password_hash, status) VALUES ($1, '13800138211', '提示词管理用户', 'plain:test-password', 'active')",
        [userId],
      );
      await db.query(
        `INSERT INTO prompts (
           id, prompt_category, name, summary, prompt_content, status,
           is_official, is_published, price_credits, published_at
         ) VALUES
           ($1, 'storyboard', '官方故事板提示词', '原始简介', '官方故事板原始正文', 'enabled', true, true, 0, $3),
           ($2, 'storyboard', '默认官方故事板提示词', '默认简介', '默认官方正文', 'enabled', true, true, 0, $3)`,
        [officialId, defaultOfficialId, now],
      );
      const service = createPromptMarketplaceService({ db });
      const privateItem = await service.createItem({
        userId,
        title: "用户故事板提示词",
        category: "storyboard",
        summary: "用户原始简介",
        content: "用户提示词正文不得通过后台列表暴露。",
        publish: true,
        now,
      });

      const updatedOfficial = await service.updateAdminItem({
        itemId: officialId,
        title: "编辑后的官方故事板提示词",
        summary: "编辑后的官方简介",
        content: "编辑后的官方故事板正文。",
        coverImageUrl: "https://example.com/official-storyboard-cover.png",
        priceCredits: 18,
        usageCount: 9,
        status: "published",
        now,
      });
      assert.equal(updatedOfficial.item.title, "编辑后的官方故事板提示词");
      assert.equal(updatedOfficial.item.summary, "编辑后的官方简介");
      assert.equal(updatedOfficial.item.content, "编辑后的官方故事板正文。");
      assert.equal(updatedOfficial.item.coverImageUrl, "https://example.com/official-storyboard-cover.png");

      const updatedPrivate = await service.updateAdminItem({
        itemId: privateItem.item.id,
        title: "编辑后的用户故事板提示词",
        summary: "编辑后的用户简介",
        coverImageUrl: "https://example.com/private-storyboard-cover.png",
        priceCredits: 13,
        usageCount: 4,
        status: "draft",
        now,
      });
      assert.equal(updatedPrivate.item.title, "编辑后的用户故事板提示词");
      assert.equal(updatedPrivate.item.summary, "编辑后的用户简介");
      assert.equal(updatedPrivate.item.contentVisible, false);
      assert.equal("content" in updatedPrivate.item, false);
      await assert.rejects(
        () => service.updateAdminItem({ itemId: privateItem.item.id, content: "后台不应修改用户正文", now }),
        (error) => error?.code === "prompt_marketplace_private_content_protected" && error?.status === 403,
      );

      await setOfficialPromptDefault(db, { category: "storyboard", promptId: defaultOfficialId, now });
      await assert.rejects(
        () => service.deleteAdminItem({ itemId: defaultOfficialId, now }),
        (error) => error?.code === "official_prompt_default_required" && error?.status === 409,
      );
      await setUserPromptDefault(db, { userId, category: "storyboard", promptId: privateItem.item.id, now });
      assert.deepEqual(await service.deleteAdminItem({ itemId: privateItem.item.id, now }), { deleted: true });
      assert.equal((await service.listAdminItems({ source: "private" })).items.some((item) => item.id === privateItem.item.id), false);
      const deleted = await db.query<{ deleted_at: Date | null }>("SELECT deleted_at FROM prompts WHERE id = $1", [privateItem.item.id]);
      assert.ok(deleted.rows[0]?.deleted_at);
      const privateDefaults = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM prompt_user_defaults WHERE prompt_id = $1", [privateItem.item.id]);
      assert.equal(privateDefaults.rows[0]?.count, 0);
    } finally {
      await (db as unknown as { close?: () => Promise<void> }).close?.();
    }
  });

  it("uses unified prompt, user-link, and rating tables without legacy prompt fields", async () => {
    const db = await createMigratedTestDb();
    try {
      const tables = await listTableNames(db);
      assert.ok(tables.includes("prompts"));
      assert.ok(tables.includes("prompt_user_links"));
      assert.ok(tables.includes("prompt_ratings"));

      for (const legacyTable of [
        "prompt_marketplace_items",
        "prompt_marketplace_purchases",
        "prompt_marketplace_ratings",
        "storyboard_prompt_packages",
        "storyboard_prompt_templates",
        "shot_prompt_templates",
        "scene_prompt_templates",
        "character_prompt_templates",
        "prop_prompt_templates",
        "image_prompt_styles",
      ]) {
        assert.equal(tables.includes(legacyTable), false, `${legacyTable} should be removed`);
      }

      const promptColumns = await listColumnNames(db, "prompts");
      assert.ok(promptColumns.includes("cover_image_url"));
      assert.ok(promptColumns.includes("rating_score"));
      assert.ok(promptColumns.includes("rating_count"));
      assert.equal(promptColumns.includes("rating_sum"), false);
      for (const legacyColumn of [
        "code",
        "package_type",
        "stage",
        "model_family",
        "tags",
        "variables",
        "json_schema",
        "negative_prompt",
        "key_points",
        "applicable_scenes",
        "is_default",
        "sort_order",
        "remark",
      ]) {
        assert.equal(promptColumns.includes(legacyColumn), false, `${legacyColumn} should not exist on prompts`);
      }

      const userLinkColumns = await listColumnNames(db, "prompt_user_links");
      assert.ok(userLinkColumns.includes("relation_type"));
      assert.ok(userLinkColumns.includes("price_credits_paid"));
      assert.equal(userLinkColumns.includes("rating"), false);
      const ratingColumns = await listColumnNames(db, "prompt_ratings");
      assert.ok(ratingColumns.includes("prompt_id"));
      assert.ok(ratingColumns.includes("user_id"));
      assert.ok(ratingColumns.includes("rating"));

      const userId = "83000000-0000-4000-8000-000000000099";
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800138099', '其它提示词用户', 'plain:test-password', 'active')`,
        [userId],
      );
      const service = createPromptMarketplaceService({ db });
      const created = await service.createItem({
        userId,
        title: "其它类提示词",
        category: "other",
        content: "这是用于验证其它分类可正常写入统一提示词表的完整提示词正文。",
        publish: false,
        now: new Date("2026-07-25T05:00:00.000Z"),
      });
      assert.equal(created.item.category, "other");

      const stored = await db.query<{ relation_type: string; is_official: boolean; is_published: boolean }>(
        `SELECT link.relation_type, prompt.is_official, prompt.is_published
         FROM prompts prompt
         JOIN prompt_user_links link ON link.prompt_id = prompt.id
         WHERE prompt.id = $1 AND link.user_id = $2`,
        [created.item.id, userId],
      );
      assert.deepEqual(stored.rows, [{ relation_type: "owner", is_official: false, is_published: false }]);

      const catalog = await service.listCatalog({ userId });
      assert.equal(catalog.items.some((item) => item.id === created.item.id), false);
      const library = await service.listLibrary({ userId });
      assert.equal(library.items.some((item) => item.id === created.item.id), true);
    } finally {
      await (db as unknown as { close?: () => Promise<void> }).close?.();
    }
  });

  it("paginates catalog items and returns the top twenty unfiltered category ranking with user ownership state", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "83000000-0000-4000-8000-000000000201";
      const firstId = "83000000-0000-4000-8000-000000000211";
      const secondId = "83000000-0000-4000-8000-000000000212";
      const thirdId = "83000000-0000-4000-8000-000000000213";
      await db.query(
        "INSERT INTO users (id, phone_e164, display_name, password_hash, status) VALUES ($1, '13800138201', '排行榜用户', 'plain:test-password', 'active')",
        [userId],
      );
      await db.query(
        `
          INSERT INTO prompts (
            id, prompt_category, name, summary, prompt_content, status,
            is_official, is_published, price_credits, usage_count, rating_score, rating_count, published_at
          ) VALUES
            ($1, 'script', '第一页提示词', '排行榜第一名', '第一页提示词正文，长度满足测试所需的最小提示词内容要求。', 'enabled', false, true, 0, 90, 4.2, 8, now()),
            ($2, 'script', '第二页提示词', '排行榜第二名', '第二页提示词正文，长度满足测试所需的最小提示词内容要求。', 'enabled', false, true, 0, 60, 4.8, 12, now()),
            ($3, 'script', '第三页提示词', '排行榜第三名', '第三页提示词正文，长度满足测试所需的最小提示词内容要求。', 'enabled', false, true, 0, 20, 5, 20, now())
        `,
        [firstId, secondId, thirdId],
      );
      await db.query(
        `
          INSERT INTO prompts (
            id, prompt_category, name, summary, prompt_content, status,
            is_official, is_published, price_credits, usage_count, rating_score, rating_count, published_at
          )
          SELECT
            format('83000000-0000-4000-8000-%s', lpad(entry::text, 12, '0'))::uuid,
            'script',
            '额外排行榜提示词' || entry,
            '用于验证排行榜上限的额外提示词',
            '用于验证提示词广场排行榜上限的额外提示词正文，长度满足测试所需的最小内容要求。',
            'enabled', false, true, 0, 19 - entry, 4, 1, now()
          FROM generate_series(1, 18) AS entry
        `,
      );
      await db.query(
        `
          INSERT INTO prompt_user_links (id, prompt_id, user_id, relation_type, status, added_at, created_at, updated_at)
          VALUES
            ('83000000-0000-4000-8000-000000000221', $1, $3, 'owner', 'active', now(), now(), now()),
            ('83000000-0000-4000-8000-000000000222', $2, $3, 'added', 'active', now(), now(), now())
        `,
        [firstId, secondId, userId],
      );
      const service = createPromptMarketplaceService({ db });

      const defaultPage = await service.listCatalog({ userId, category: "script" });
      assert.equal(defaultPage.pagination.pageSize, 12);

      const firstPage = await service.listCatalog({ userId, category: "script", page: 1, pageSize: 2 });
      assert.deepEqual(firstPage.items.map((item) => item.id), [firstId, secondId]);
      assert.deepEqual(firstPage.pagination, { page: 1, pageSize: 2, total: 21, totalPages: 11 });
      assert.deepEqual(firstPage.ranking.slice(0, 3).map((item) => item.id), [firstId, secondId, thirdId]);
      assert.equal(firstPage.ranking.length, 20);
      assert.equal(firstPage.ranking[0]?.owned, true);
      assert.equal(firstPage.ranking[1]?.purchased, true);

      const searched = await service.listCatalog({ userId, category: "script", query: "第二页", page: 1, pageSize: 999 });
      assert.deepEqual(searched.items.map((item) => item.id), [secondId]);
      assert.deepEqual(searched.pagination, { page: 1, pageSize: 100, total: 1, totalPages: 1 });
      assert.deepEqual(searched.ranking.slice(0, 3).map((item) => item.id), [firstId, secondId, thirdId]);
      assert.equal(searched.ranking.length, 20);

      const emptyCategory = await service.listCatalog({ userId, category: "other", query: "no-such-prompt", page: 9, pageSize: 2 });
      assert.deepEqual(emptyCategory.pagination, { page: 1, pageSize: 2, total: 0, totalPages: 0 });
      assert.deepEqual(emptyCategory.items, []);
      assert.equal(emptyCategory.ranking[0]?.category, "script");
    } finally {
      await db.close();
    }
  });
  it("paginates lightweight official and private skills without prompt content or marketplace ranking", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "83000000-0000-4000-8000-000000000401";
      await db.query(
        "INSERT INTO users (id, phone_e164, display_name, password_hash, status) VALUES ($1, '13800138401', '技能分页用户', 'plain:test-password', 'active')",
        [userId],
      );
      await db.query(
        `
          INSERT INTO prompts (
            id, prompt_category, name, summary, prompt_content, status,
            is_official, is_published, price_credits, usage_count, rating_score, rating_count, published_at
          ) VALUES
            ('83000000-0000-4000-8000-000000000411', 'script', '官方剧本技能一', '官方分页测试', '官方正文一', 'enabled', true, true, 0, 20, 5, 2, now()),
            ('83000000-0000-4000-8000-000000000412', 'script', '官方剧本技能二', '官方分页测试', '官方正文二', 'enabled', true, true, 0, 10, 5, 1, now()),
            ('83000000-0000-4000-8000-000000000413', 'shot', '官方分镜技能', '官方分页测试', '官方正文三', 'enabled', true, true, 0, 5, 5, 1, now())
        `,
      );
      const service = createPromptMarketplaceService({ db });
      const catalog = await service.listSkillCatalog({ userId, query: "官方", page: 1, pageSize: 1 });
      assert.deepEqual(catalog.pagination, { page: 1, pageSize: 1, total: 3, totalPages: 3, hasNext: true });
      assert.equal(catalog.categoryCounts.script, 2);
      assert.equal(catalog.categoryCounts.shot, 1);
      assert.equal(Object.prototype.hasOwnProperty.call(catalog.items[0]!, "content"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(catalog, "ranking"), false);

      await service.createItem({ userId, title: "私人剧本技能", category: "script", content: "私人正文一", priceCredits: 10, publish: false, now: new Date() });
      await service.createItem({ userId, title: "私人分镜技能", category: "shot", content: "私人正文二", publish: false, now: new Date() });
      const library = await service.listSkillLibrary({ userId, query: "私人", page: 99, pageSize: 1 });
      assert.deepEqual(library.pagination, { page: 2, pageSize: 1, total: 2, totalPages: 2, hasNext: false });
      assert.equal(library.categoryCounts.script, 1);
      assert.equal(library.categoryCounts.shot, 1);
      assert.equal(Object.prototype.hasOwnProperty.call(library.items[0]!, "content"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(library, "ranking"), false);
      assert.equal(library.items.every((item) => item.priceCredits === 0), true);
    } finally {
      await db.close();
    }
  });
});
