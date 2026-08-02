import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPromptMarketplacePublishInputForTest,
  deriveInitialNavTabForTest,
  handleWorkbenchActionForTest,
  scheduleLazySurfaceLoadForTest,
  syncPromptMarketplaceForTest,
} from "../src/features/production-workbench/index.js";
import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

test("prompt marketplace combines catalog and private library without a publish tab", () => {
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaType: "all",
      promptPlazaSection: "marketplace",
      promptMarketplaceItems: [
        {
          id: "prompt-1",
          name: "玄幻修仙",
          title: "玄幻修仙",
          category: "script",
          summary: "强化修炼升级和战斗爆发节奏。",
          content: "这段购买前不可见的提示词正文不应渲染。",
          tags: ["修炼"],
          coverImageUrl: "https://example.com/prompt-cover.jpg",
          priceCredits: 30,
          official: false,
          usageCount: 128,
          ratingAverage: 4.8,
          ratingCount: 42,
          purchased: false,
          owned: false,
          isDefault: true,
        },
      ],
      promptMarketplaceRankings: [{
        id: "prompt-1",
        title: "玄幻修仙",
        category: "script",
        usageCount: 128,
        ratingAverage: 4.8,
        official: false,
      }],
      promptMarketplaceMeta: { page: 1, pageSize: 12, total: 1, totalPages: 1, hasNext: false },
    },
  });

  assert.equal(deriveInitialNavTabForTest("prompts"), "prompts");
  assert.doesNotMatch(html, /PROMPT WORKSPACE/);
  assert.doesNotMatch(html, /<h1/);
  assert.match(html, /我的提示词库/);
  assert.doesNotMatch(html, />发布提示词</);
  assert.match(html, /剧本提示词/);
  assert.match(html, /生图风格/);
  assert.match(html, /其它/);
  assert.match(html, /提示词排行榜 · 全部分类/);
  assert.match(html, /使用 30 积分/);
  assert.match(html, /128 次使用/);
  assert.match(html, /免费添加/);
  assert.doesNotMatch(html, />购买</);
  assert.match(html, /提示词排行榜/);
  assert.match(html, /推荐星级/);
  assert.match(html, /data-action="open-prompt-marketplace-ranking-item"/);
  assert.doesNotMatch(html, /data-action="set-prompt-marketplace-ranking"/);
  assert.match(html, /prompt-marketplace-pagination/);
  assert.match(html, /共 1 条/);
  assert.match(html, /12 条\/页/);
  assert.match(html, /data-action="set-prompt-marketplace-page" data-page="0" disabled aria-label="上一页"/);
  assert.match(html, /aria-current="page">1<\/button>/);
  assert.match(html, /<h2>玄幻修仙<\/h2>\s*<span class="prompt-marketplace-source private">私人发布<\/span>\s*<div class="prompt-marketplace-card-labels">/);
  assert.match(html, /https:\/\/example\.com\/prompt-cover\.jpg/);
  assert.match(html, /玄幻修仙封面/);
  assert.doesNotMatch(html, /条已发布提示词/);
  assert.doesNotMatch(html, /提示词正文受保护/);
  assert.ok(html.indexOf("玄幻修仙") < html.indexOf("https://example.com/prompt-cover.jpg"));
  assert.doesNotMatch(html, />修炼</);
  assert.doesNotMatch(html, /这段购买前不可见的提示词正文不应渲染/);
  assert.doesNotMatch(html, /prompt-marketplace-default-badge">默认/);
  assert.ok(html.indexOf('data-tab="prompts"') < html.indexOf('data-tab="library"'));
  assert.ok(html.indexOf('data-action="set-prompt-plaza-type"') < html.indexOf("data-prompt-plaza-search-input"));
  assert.match(html, /data-action="open-prompt-marketplace-guide"/);
});

test("prompt marketplace guide explains required prefixes and shows at-prefixed references", async () => {
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaSection: "marketplace",
      promptMarketplaceGuideOpen: true,
      promptMarketplaceItems: [],
      promptMarketplaceRankings: [],
      promptMarketplaceMeta: { page: 1, pageSize: 12, total: 0, totalPages: 1, hasNext: false },
    },
  });

  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="prompt-guide-title"/);
  assert.match(html, /【角色名称】角色名/);
  assert.match(html, /【道具名称】道具名/);
  assert.match(html, /【场景名称】场景名/);
  assert.match(html, /【分镜】分镜内容/);
  assert.match(html, /aria-label="镜头运行方式"/);
  assert.match(html, /大远景.*远景.*全景.*中远景.*中景.*中近景.*近景.*特写.*大特写.*头肩景.*半身景.*全身景/);
  assert.match(html, /角色名称：白纹鬼\n场景名称:黄昏尸骸战场\n道具名称：切割刀\n分镜1：一只【@白纹鬼】来到了【@黄昏尸骸战场】看到一个拿着【@切割刀】的人/);
  assert.match(html, /data-action="close-prompt-marketplace-guide"/);

  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: {},
    session: { user: { phone: "13800138000" } },
    api: {},
    ui: {
      activeNavTab: "prompts",
      promptPlazaSection: "marketplace",
      promptMarketplaceItems: [],
      promptMarketplaceRankings: [],
      promptMarketplaceMeta: { page: 1, pageSize: 12, total: 0, totalPages: 1, hasNext: false },
    },
  };
  await handleWorkbenchActionForTest(workbench, { dataset: { action: "open-prompt-marketplace-guide" } });
  assert.equal(workbench.ui.promptMarketplaceGuideOpen, true);
  await handleWorkbenchActionForTest(workbench, { dataset: { action: "close-prompt-marketplace-guide" } });
  assert.equal(workbench.ui.promptMarketplaceGuideOpen, false);
});

test("prompt marketplace ranking shows top twenty metrics and card details", () => {
  const items = Array.from({ length: 22 }, (_, index) => ({
    id: `ranked-${index}`,
    title: `排行榜提示词 ${index + 1}`,
    category: "script",
    summary: "排行榜测试简介。",
    usageCount: index === 21 ? 999 : index,
    ratingAverage: index === 21 ? 3 : 1 + (index % 3),
    ratingCount: 20 + index,
    official: index % 2 === 0,
    priceCredits: index === 21 ? 25 : 0,
    owned: index === 18,
    purchased: index === 20,
  }));
  const rankings = [...items].sort((left, right) => right.usageCount - left.usageCount);
  const usageHtml = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaType: "all",
      promptPlazaQuery: "排行榜提示词 1",
      promptPlazaSection: "marketplace",
      promptMarketplaceRankingItemId: "ranked-21",
      promptMarketplaceItems: items.slice(0, 12),
      promptMarketplaceRankings: rankings,
      promptMarketplaceMeta: { page: 1, pageSize: 12, total: 22, totalPages: 2, hasNext: true },
    },
  });
  const usageRanking = usageHtml.slice(usageHtml.indexOf('<aside class="prompt-marketplace-ranking"'));
  assert.match(usageRanking, /排行榜提示词 22/);
  assert.doesNotMatch(usageRanking, /排行榜提示词 1<\/strong>/);
  assert.doesNotMatch(usageRanking, /排行榜提示词 2<\/strong>/);
  assert.equal((usageRanking.match(/data-action="open-prompt-marketplace-ranking-item"/g) || []).length, 20);
  assert.match(usageRanking, /999 次使用/);
  assert.match(usageRanking, /prompt-marketplace-ranking-metrics/);
  assert.match(usageRanking, /prompt-marketplace-rating/);
  assert.match(usageRanking, /★<\/span><span class="active">★/);
  assert.match(usageRanking, /<small>3\.0<\/small>/);
  assert.match(usageRanking, /data-action="open-prompt-marketplace-ranking-item" data-prompt-id="ranked-21"/);
  assert.match(usageRanking, /class="prompt-marketplace-ranking-action" data-action="purchase-prompt-marketplace-item" data-prompt-id="ranked-21">免费添加<\/button>/);
  assert.match(usageRanking, /class="prompt-marketplace-ranking-action" data-action="purchase-prompt-marketplace-item" data-prompt-id="ranked-19">免费添加<\/button>/);
  assert.equal((usageRanking.match(/class="prompt-marketplace-ranking-action is-added" disabled>已添加<\/button>/g) || []).length, 2);
  assert.match(usageRanking, /<li><button[^>]*class="prompt-marketplace-ranking-main"[\s\S]*?<\/button><button[^>]*class="prompt-marketplace-ranking-action"/);
  assert.doesNotMatch(usageRanking, /prompt-marketplace-ranking-tabs/);
  assert.match(usageHtml, /共 22 条/);
  assert.match(usageHtml, /12 条\/页/);
  assert.match(usageHtml, /aria-current="page">1<\/button>/);
  assert.match(usageHtml, /data-action="set-prompt-marketplace-page" data-page="2"/);

  const detail = usageHtml.slice(usageHtml.indexOf('class="prompt-marketplace-create prompt-marketplace-ranking-detail"'));
  assert.match(detail, /排行榜提示词详情/);
  assert.match(detail, /<h2>排行榜提示词 22<\/h2>/);
  assert.match(detail, /使用 25 积分/);
  assert.match(detail, /data-action="purchase-prompt-marketplace-item" data-prompt-id="ranked-21">免费添加/);

  const ownedHtml = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaType: "all",
      promptPlazaSection: "marketplace",
      promptMarketplaceRankingItemId: "ranked-21",
      promptMarketplaceItems: items.slice(0, 12),
      promptMarketplaceRankings: rankings.map((item) => item.id === "ranked-21" ? { ...item, owned: true } : item),
    },
  });
  const ownedDetail = ownedHtml.slice(ownedHtml.indexOf('class="prompt-marketplace-create prompt-marketplace-ranking-detail"'));
  assert.match(ownedDetail, /<h2>排行榜提示词 22<\/h2>/);
  assert.doesNotMatch(ownedDetail, /data-action="purchase-prompt-marketplace-item"/);

  const freeHtml = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaType: "all",
      promptPlazaSection: "marketplace",
      promptMarketplaceRankingItemId: "ranked-21",
      promptMarketplaceItems: items.map((item) => item.id === "ranked-21" ? { ...item, priceCredits: 0 } : item),
    },
  });
  const freeDetail = freeHtml.slice(freeHtml.indexOf('class="prompt-marketplace-create prompt-marketplace-ranking-detail"'));
  assert.match(freeDetail, /data-action="purchase-prompt-marketplace-item" data-prompt-id="ranked-21">免费添加/);

  const purchasedHtml = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaType: "all",
      promptPlazaSection: "marketplace",
      promptMarketplaceRankingItemId: "ranked-21",
      promptMarketplaceItems: items.map((item) => item.id === "ranked-21" ? { ...item, purchased: true } : item),
    },
  });
  const purchasedDetail = purchasedHtml.slice(purchasedHtml.indexOf('class="prompt-marketplace-create prompt-marketplace-ranking-detail"'));
  assert.doesNotMatch(purchasedDetail, /data-action="purchase-prompt-marketplace-item"/);
});

test("prompt marketplace ranking moves above cards before the card grid becomes cramped", async () => {
  const css = await import("node:fs/promises").then(({ readFile }) => readFile(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  ));
  assert.match(css, /@media \(max-width: 72rem\)[\s\S]*?\.prompt-marketplace-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 72rem\)[\s\S]*?\.prompt-marketplace-ranking\s*\{[\s\S]*?order:\s*-1/);
  const genericCreateDialogIndex = css.indexOf(".prompt-marketplace-create > section {");
  const rankingDetailOverrideIndex = css.indexOf(".prompt-marketplace-create.prompt-marketplace-ranking-detail > section {");
  assert.ok(rankingDetailOverrideIndex > genericCreateDialogIndex);
  assert.match(css, /\.prompt-marketplace-create\.prompt-marketplace-ranking-detail\s*>\s*section\s*\{[\s\S]*?width:\s*min\(27rem, calc\(100vw - 2rem\)\)[\s\S]*?max-height:\s*none[\s\S]*?overflow:\s*visible/);
  assert.match(css, /\.prompt-marketplace-create\.prompt-marketplace-ranking-detail\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?scrollbar-width:\s*none/);
  assert.match(css, /\.prompt-marketplace-ranking-detail\s+\.prompt-marketplace-card\s*\{[\s\S]*?min-height:\s*0/);
  assert.match(css, /\.prompt-marketplace-layout\s*>\s*\.prompt-plaza-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.prompt-marketplace-workspace\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(css, /\.workbench-scroll-surface\[data-scroll-surface="prompts"\]\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.prompt-marketplace-ranking\s*\{[\s\S]*?align-self:\s*stretch[\s\S]*?grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /\.prompt-marketplace-ranking\s*\{[\s\S]*?height:\s*100%[\s\S]*?max-height:\s*100%/);
  assert.match(css, /\.prompt-marketplace-ranking ol\s*\{[\s\S]*?grid-auto-rows:\s*4\.2rem/);
  assert.match(css, /\.prompt-marketplace-ranking li\s*\{[\s\S]*?min-height:\s*4\.2rem/);
  assert.match(css, /\.prompt-marketplace-ranking ol\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?scrollbar-width:\s*none/);
  assert.match(css, /\.prompt-marketplace-ranking ol::\-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.prompt-marketplace-pagination\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /@media \(min-width: 72\.01rem\)[\s\S]*?\.prompt-marketplace-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+clamp\(22rem,\s*22vw,\s*25rem\)/);
  assert.match(css, /\.prompt-marketplace-ranking li\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(css, /\.prompt-marketplace-ranking-action\s*\{[\s\S]*?white-space:\s*nowrap/);
});

test("ranking prompts are added to the private library for free without confirmation", async () => {
  let purchaseCalls = 0;
  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: {},
    session: { user: { phone: "13800138000" } },
    api: {
      purchasePromptMarketplaceItem: async () => {
        purchaseCalls += 1;
      },
    },
    ui: {
      activeNavTab: "prompts",
      promptMarketplaceItems: [],
      promptMarketplaceRankings: [{
        id: "ranking-paid",
        title: "排行榜付费提示词",
        category: "script",
        priceCredits: 88,
      }],
    },
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "purchase-prompt-marketplace-item", promptId: "ranking-paid" },
  });

  assert.equal(purchaseCalls, 1);
  assert.equal(workbench.ui.promptMarketplacePurchaseConfirm, undefined);
  assert.equal(workbench.ui.toast, "已免费加入私人提示词库。");
});

test("prompt marketplace filters and pagination trigger debounced server loads", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  ));
  const categoryAction = source.slice(
    source.indexOf('if (action === "set-prompt-plaza-type")'),
    source.indexOf('if (action === "set-prompt-plaza-section")'),
  );
  assert.match(categoryAction, /promptMarketplacePage = 1/);
  assert.match(categoryAction, /await syncPromptMarketplace\(workbench\)/);

  const rankingAction = source.slice(
    source.indexOf('if (action === "open-prompt-marketplace-ranking-item")'),
    source.indexOf('if (action === "close-prompt-marketplace-ranking-item")'),
  );
  assert.match(rankingAction, /promptMarketplaceRankings/);
  assert.match(rankingAction, /promptMarketplaceItems/);

  const pageAction = source.slice(
    source.indexOf('if (action === "set-prompt-marketplace-page")'),
    source.indexOf('if (action === "open-prompt-marketplace-create")'),
  );
  assert.match(pageAction, /target\.dataset\.page/);
  assert.match(pageAction, /await syncPromptMarketplace\(workbench\)/);

  const searchScheduler = source.slice(
    source.indexOf("function schedulePromptMarketplaceSearch"),
    source.indexOf("function scheduleProjectSearch"),
  );
  assert.match(searchScheduler, /setTimeout\(async \(\) =>/);
  assert.match(searchScheduler, /await syncPromptMarketplace\(workbench\)/);
  assert.match(searchScheduler, /}, 280\)/);
});

test("private prompt library paginates and opens creation on demand", () => {
  const library = Array.from({ length: 11 }, (_, index) => ({
    id: `prompt-${index + 1}`,
    title: `我的提示词 ${index + 1}`,
    category: "script",
    summary: "私人提示词简介。",
    owned: true,
    contentVisible: true,
  }));
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaSection: "library",
      promptPlazaType: "all",
      promptMarketplaceLibrary: library,
    },
  });

  assert.match(html, /共 11 条/);
  assert.match(html, /1 \/ 2 页/);
  assert.match(html, /创建提示词/);
  assert.doesNotMatch(html, /id="prompt-marketplace-create-form"/);
  assert.match(html, /我的提示词 10/);
  assert.doesNotMatch(html, /我的提示词 11/);

  const createHtml = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaSection: "library",
      promptMarketplaceCreateOpen: true,
    },
  });

  assert.match(createHtml, /id="prompt-marketplace-create-form"/);
  assert.match(createHtml, /data-action="upload-prompt-marketplace-cover"/);
  assert.match(createHtml, />上传封面</);
  assert.doesNotMatch(createHtml, /name="content"[^>]*minlength=/);
  assert.match(createHtml, /name="content"[^>]*maxlength="50000"/);
  assert.match(createHtml, /name="publish" type="checkbox" checked/);
  assert.match(createHtml, /发布到提示词广场/);
  assert.match(createHtml, /取消勾选则仅保存到私人提示词库/);
  assert.match(createHtml, />保存提示词<\/button>/);
  assert.doesNotMatch(createHtml, />创建并发布<\/button>/);
  assert.doesNotMatch(createHtml, /name="tags"/);
  assert.doesNotMatch(createHtml, /搜索提示词、标签或关键词/);

  const input = buildPromptMarketplacePublishInputForTest(new Map([
    ["title", "  我的提示词  "],
    ["category", "other"],
    ["summary", "  简介  "],
    ["content", "  正文  "],
    ["coverImageUrl", "  https://example.com/cover.jpg  "],
    ["coverStorageObjectId", "  storage-object-1  "],
    ["priceCredits", "15"],
    ["tags", "不应提交"],
  ]));
  assert.deepEqual(input, {
    title: "我的提示词",
    category: "other",
    summary: "简介",
    content: "正文",
    coverImageUrl: "https://example.com/cover.jpg",
    coverStorageObjectId: "storage-object-1",
    priceCredits: 15,
    publish: false,
  });

  const publishedInput = buildPromptMarketplacePublishInputForTest(new Map([
    ["title", "我的提示词"],
    ["publish", "on"],
  ]));
  assert.equal(publishedInput.publish, true);
});

test("private prompt library only renders content owned by the current user", () => {
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaSection: "library",
      promptPlazaType: "all",
      promptMarketplaceDeleteConfirm: { itemId: "purchased-prompt", owned: false },
      promptMarketplaceLibrary: [
        {
          id: "owned-prompt",
          title: "我的故事板提示词",
          category: "storyboard",
          summary: "自己的提示词。",
          content: "只有作者能看到的完整正文。",
          contentVisible: true,
          owned: true,
          purchased: false,
          official: false,
          isDefault: true,
        },
        {
          id: "purchased-prompt",
          title: "购买的场景提示词",
          category: "scene_extract",
          summary: "购买提示词的公开简介。",
          content: "购买内容绝不能渲染。",
          contentVisible: false,
          owned: false,
          purchased: true,
          official: true,
        },
      ],
    },
  });

  assert.doesNotMatch(html, /只有作者能看到的完整正文/);
  assert.doesNotMatch(html, /购买的提示词正文不可查看/);
  assert.doesNotMatch(html, /私人库提示词/);
  assert.doesNotMatch(html, /查看我的提示词正文/);
  assert.doesNotMatch(html, /prompt-library-row/);
  assert.match(html, /prompt-marketplace-card[^]*prompt-marketplace-card-head[^]*我的故事板提示词/);
  assert.match(html, /prompt-marketplace-default-cover is-storyboard/);
  assert.match(html, /prompt-marketplace-default-cover is-scene has-image/);
  assert.match(html, /data-action="open-edit-prompt-marketplace-item" data-prompt-id="owned-prompt">编辑/);
  assert.match(html, /data-action="clear-prompt-marketplace-default"[^>]*data-prompt-id="owned-prompt"/);
  assert.match(html, /prompt-marketplace-default-badge">默认/);
  assert.match(html, /data-action="set-prompt-marketplace-default"[^>]*data-prompt-id="purchased-prompt"/);
  assert.match(html, /data-prompt-id="owned-prompt" data-owned="true">删除/);
  assert.match(html, /data-prompt-id="purchased-prompt" data-owned="false">移除私人库/);
  assert.doesNotMatch(html, /data-action="use-prompt-marketplace-item"/);
  assert.doesNotMatch(html, /data-action="open-edit-prompt-marketplace-item" data-prompt-id="purchased-prompt"/);
  assert.match(html, /免费添加/);
  assert.doesNotMatch(html, /购买内容绝不能渲染/);

  const editHtml = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaSection: "library",
      promptMarketplaceEditItem: {
        id: "owned-prompt",
        title: "我的故事板提示词",
        category: "storyboard",
        summary: "自己的提示词。",
        content: "只有作者能看到的完整正文内容，满足编辑表单长度要求。",
        coverImageUrl: "https://example.com/my-cover.png",
        priceCredits: 18,
        status: "published",
        owned: true,
      },
    },
  });
  assert.match(editHtml, /id="prompt-marketplace-edit-form"/);
  assert.match(editHtml, /value="我的故事板提示词"/);
  assert.match(editHtml, /只有作者能看到的完整正文内容/);
  assert.match(editHtml, /value="18"/);
  assert.match(editHtml, /name="publish" type="checkbox" checked/);
  assert.match(editHtml, /data-action="update-prompt-marketplace-item">保存修改/);
});

test("marketplace hides actions for added prompts and never renders a purchase confirmation", () => {
  const addedHtml = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaSection: "marketplace",
      promptMarketplaceItems: [{
        id: "added-prompt",
        title: "已添加的提示词",
        category: "image_style",
        summary: "已经在私人库中。",
        priceCredits: 0,
        official: true,
        purchased: true,
      }],
    },
  });
  assert.doesNotMatch(addedHtml, /data-action="purchase-prompt-marketplace-item" data-prompt-id="added-prompt"/);
  assert.doesNotMatch(addedHtml, />使用<\/button>/);

  const purchaseHtml = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaSection: "marketplace",
      promptMarketplacePurchaseConfirm: {
        itemId: "paid-prompt",
        title: "通用小说转剧本",
        priceCredits: 999,
      },
    },
  });
  assert.doesNotMatch(purchaseHtml, /确认购买/);
  assert.doesNotMatch(purchaseHtml, /将消耗 999 积分/);
  assert.doesNotMatch(purchaseHtml, /cancel-purchase-prompt-marketplace-item/);
  assert.doesNotMatch(purchaseHtml, /confirm-purchase-prompt-marketplace-item/);
});

test("marketplace uses category-specific covers when an item has no cover image", () => {
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "prompts",
      promptPlazaSection: "marketplace",
      promptMarketplaceItems: [
        { id: "script-cover", title: "剧本封面", category: "script", official: true },
        { id: "shot-cover", title: "分镜封面", category: "shot", official: true },
        { id: "storyboard-cover", title: "故事板封面", category: "storyboard", official: true },
        { id: "scene-cover", title: "场景封面", category: "scene_extract", official: true },
        { id: "character-cover", title: "人物封面", category: "character_extract", official: true },
        { id: "prop-cover", title: "道具封面", category: "prop_extract", official: true },
        { id: "style-cover", title: "风格封面", category: "image_style", official: true },
      ],
    },
  });

  assert.match(html, /prompt-marketplace-default-cover is-script/);
  assert.match(html, /prompt-marketplace-default-cover is-shot has-montage/);
  assert.match(html, /prompt-marketplace-default-cover is-storyboard/);
  assert.match(html, /prompt-marketplace-default-cover is-scene/);
  assert.match(html, /prompt-marketplace-default-cover is-style has-montage/);
  assert.match(html, /assets\/library\/official\/characters\/3d-city-heroine\.png/);
  assert.match(html, /assets\/library\/official\/props\/prop-ancient-sword\.png/);
  assert.doesNotMatch(html, /<img[^>]+剧本封面/);
});

test("prompt marketplace reuses an in-flight catalog and library sync", async () => {
  let resolveCatalog;
  let resolveLibrary;
  let catalogRequestCount = 0;
  let libraryRequestCount = 0;
  const catalogInputs = [];
  const catalogResponse = new Promise((resolve) => { resolveCatalog = resolve; });
  const libraryResponse = new Promise((resolve) => { resolveLibrary = resolve; });
  const workbench = {
    api: {
      getPromptMarketplace(input) {
        catalogRequestCount += 1;
        catalogInputs.push(input);
        return catalogResponse;
      },
      getPromptMarketplaceLibrary() {
        libraryRequestCount += 1;
        return libraryResponse;
      },
    },
    ui: {
      promptMarketplaceItems: [],
      promptMarketplaceLibrary: [],
      promptMarketplaceLoading: false,
      promptMarketplaceError: "",
      promptPlazaType: "script",
      promptPlazaQuery: "仙侠",
      promptMarketplacePage: 2,
      promptMarketplaceMeta: { page: 2, pageSize: 12, total: 0, totalPages: 1, hasNext: false },
    },
  };

  const firstSync = syncPromptMarketplaceForTest(workbench);
  const secondSync = syncPromptMarketplaceForTest(workbench);

  assert.equal(catalogRequestCount, 1);
  assert.equal(libraryRequestCount, 1);
  assert.deepEqual(catalogInputs, [{ category: "script", query: "仙侠", page: 2, pageSize: 12 }]);
  resolveCatalog({
    items: [{ id: "catalog-item" }],
    ranking: [{ id: "ranked-item" }],
    pagination: { page: 2, pageSize: 12, total: 37, totalPages: 4 },
  });
  resolveLibrary({ items: [{ id: "library-item" }] });
  await Promise.all([firstSync, secondSync]);
  assert.deepEqual(workbench.ui.promptMarketplaceItems, [{ id: "catalog-item" }]);
  assert.deepEqual(workbench.ui.promptMarketplaceRankings, [{ id: "ranked-item" }]);
  assert.deepEqual(workbench.ui.promptMarketplaceMeta, { page: 2, pageSize: 12, total: 37, totalPages: 4, hasNext: true });
  assert.deepEqual(workbench.ui.promptMarketplaceLibrary, [{ id: "library-item" }]);
  assert.equal(workbench.ui.promptMarketplaceLoading, false);
});

test("prompt marketplace keeps a newer page response when an older request finishes last", async () => {
  let resolveFirst;
  let resolveSecond;
  const inputs = [];
  const firstResponse = new Promise((resolve) => { resolveFirst = resolve; });
  const secondResponse = new Promise((resolve) => { resolveSecond = resolve; });
  const workbench = {
    api: {
      getPromptMarketplace(input) {
        inputs.push(input);
        return input.page === 1 ? firstResponse : secondResponse;
      },
      getPromptMarketplaceLibrary: async () => ({ items: [] }),
    },
    ui: {
      promptPlazaType: "all",
      promptPlazaQuery: "",
      promptMarketplacePage: 1,
      promptMarketplaceMeta: { page: 1, pageSize: 12 },
      promptMarketplaceItems: [],
      promptMarketplaceRankings: [],
      promptMarketplaceLibrary: [],
      promptMarketplaceLoading: false,
      promptMarketplaceError: "",
    },
  };

  const firstSync = syncPromptMarketplaceForTest(workbench);
  workbench.ui.promptMarketplacePage = 2;
  const secondSync = syncPromptMarketplaceForTest(workbench);
  resolveSecond({
    items: [{ id: "page-2" }],
    ranking: [{ id: "rank-2" }],
    pagination: { page: 2, pageSize: 12, total: 36, totalPages: 3 },
  });
  await secondSync;
  resolveFirst({
    items: [{ id: "page-1" }],
    ranking: [{ id: "rank-1" }],
    pagination: { page: 1, pageSize: 12, total: 36, totalPages: 3 },
  });
  await firstSync;

  assert.deepEqual(inputs.map((input) => input.page), [1, 2]);
  assert.deepEqual(workbench.ui.promptMarketplaceItems, [{ id: "page-2" }]);
  assert.deepEqual(workbench.ui.promptMarketplaceRankings, [{ id: "rank-2" }]);
  assert.equal(workbench.ui.promptMarketplacePage, 2);
});

test("prompt marketplace schedules its first load after a direct refresh", async () => {
  let catalogRequestCount = 0;
  let libraryRequestCount = 0;
  const workbench = {
    api: {
      getPromptMarketplace: async (input) => {
        catalogRequestCount += 1;
        assert.deepEqual(input, { category: "all", query: "", page: 1, pageSize: 12 });
        return {
          items: [{ id: "catalog-item" }],
          ranking: [{ id: "ranked-item" }],
          pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
        };
      },
      getPromptMarketplaceLibrary: async () => {
        libraryRequestCount += 1;
        return { items: [{ id: "library-item" }] };
      },
    },
    session: { user: { id: "user-1" } },
    ui: {
      activeNavTab: "prompts",
      promptMarketplaceLoading: true,
      promptMarketplaceItems: [],
      promptMarketplaceLibrary: [],
      promptMarketplaceError: "",
      promptMarketplacePage: 1,
      promptMarketplaceMeta: { page: 1, pageSize: 12 },
    },
  };

  await scheduleLazySurfaceLoadForTest(workbench);
  assert.equal(catalogRequestCount, 1);
  assert.equal(libraryRequestCount, 1);
  assert.equal(workbench.ui.promptMarketplaceLoading, false);
  assert.deepEqual(workbench.ui.promptMarketplaceItems, [{ id: "catalog-item" }]);
  assert.deepEqual(workbench.ui.promptMarketplaceRankings, [{ id: "ranked-item" }]);
  assert.deepEqual(workbench.ui.promptMarketplaceLibrary, [{ id: "library-item" }]);
});
