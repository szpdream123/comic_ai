import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

function createBaseState() {
  return {
    project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
    projectDetail: {
      project: { id: "project-1", projectId: "project-1", name: "try" },
      episodes: [{ id: "episode-1", title: "第 1 集", storyboardCount: 1 }],
      assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      shots: [{ id: "shot-1", episodeId: "episode-1", plot: "镜头一" }],
    },
  };
}

function createOpenPricingUi(overrides = {}) {
  return {
    activeNavTab: "home",
    isLibraryPricingModalOpen: true,
    membershipStatus: { status: "none" },
    membershipPlans: [{
      id: "plan-pro-month",
      code: "professional_monthly",
      displayName: "专业版月卡",
      tier: "professional",
      periodUnit: "month",
      periodCount: 1,
      amountMinor: 19900,
      currency: "CNY",
      giftCredits: 1000,
    }],
    ...overrides,
  };
}

function extractStatusbarButton(html, className) {
  return html.match(new RegExp(`<button[^>]*class="[^"]*${className}[^"]*"[^>]*>[\\s\\S]*?<\\/button>`))?.[0] ?? "";
}

function extractStatusbarPopover(html, className) {
  return html.match(new RegExp(`<div[^>]*class="[^"]*${className}[^"]*"[^>]*>[\\s\\S]*?<\\/div>`))?.[0] ?? "";
}

function extractAccountPopoverCard(html) {
  return html.match(/<div class="account-popover-card">[\s\S]*?<\/div>/)?.[0] ?? "";
}

test("global statusbar account card shows phone and keeps upgrade prompt without membership", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "home",
      membershipStatus: { status: "none" },
    },
  });

  const card = extractAccountPopoverCard(html);

  assert.match(card, /\+86 13800138000/);
  assert.match(card, /当前套餐：未开通/);
});

test("home statusbar wraps quick actions instead of forcing horizontal overlap on narrow screens", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.workbench-main\.home-mode \.statusbar-actions\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.workbench-main\.home-mode \.statusbar-actions\s*\{[\s\S]*width:\s*100%/);
  assert.match(css, /\.statusbar-quick-action span:not\(\.statusbar-action-icon\),[\s\S]*text-overflow:\s*ellipsis/);
});

test("home hero renders cinematic starfield layers for the AI short drama studio", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "home",
      membershipStatus: { status: "none" },
    },
  });
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(html, /home-cinematic-sky/);
  assert.match(html, /home-meteor-field/);
  assert.match(html, /home-cursor-aura/);
  assert.match(html, /AI 漫剧 \/ 短剧生成舱/);
  assert.match(css, /\.home-meteor-field span/);
  assert.match(css, /@keyframes homeMeteorFall/);
  assert.match(css, /--home-pointer-x/);
});

test("global statusbar account card prefers nickname and shows experience membership expiry", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000", displayName: "\u65b0\u5bfc\u6f14\u6635\u79f0" } },
    ui: {
      activeNavTab: "home",
      membershipStatus: {
        status: "experience_active",
        currentTier: "experience",
        currentPeriodEndAt: "2026-06-27T08:00:00.000Z",
      },
    },
  });

  const card = extractAccountPopoverCard(html);

  assert.match(card, /\u65b0\u5bfc\u6f14\u6635\u79f0/);
  assert.doesNotMatch(card, /13800138000<\/strong>/);
  assert.match(card, /当前套餐：体验版/);
  assert.match(card, /2026\/06\/27/);
});

test("global statusbar account card shows professional membership before experience", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "home",
      membershipStatus: {
        status: "professional_active",
        currentTier: "professional",
        currentPeriodEndAt: "2026-07-08T08:00:00.000Z",
      },
    },
  });

  const card = extractAccountPopoverCard(html);

  assert.match(card, /当前套餐：专业版/);
  assert.match(card, /2026\/07\/08/);
});

test("global statusbar account card does not show stale membership tier after expiry", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "home",
      membershipStatus: {
        status: "expired",
        currentTier: "professional",
        currentPeriodEndAt: "2026-06-15T08:00:00.000Z",
      },
    },
  });

  const card = extractAccountPopoverCard(html);

  assert.doesNotMatch(card, /\u4e13\u4e1a\u7248\u4f1a\u5458/);
  assert.doesNotMatch(card, /\u4f53\u9a8c\u7248\u4f1a\u5458/);
  assert.match(card, /当前套餐：未开通/);
});

test("account settings hero shows the current membership plan label", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000", displayName: "新导演昵称" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      accountSettingsOpen: true,
      membershipStatus: {
        status: "professional_active",
        currentTier: "professional",
        currentPeriodEndAt: "2026-07-08T08:00:00.000Z",
      },
      accountSettingsForm: {
        displayName: "新导演昵称",
        phone: "+86 13800138000",
      },
    },
  });

  const drawer = html.slice(html.indexOf("account-settings-drawer"));

  assert.match(drawer, /当前套餐：专业版/);
  assert.match(drawer, /2026\/07\/08/);
});

test("account settings hero shows not opened when membership is absent", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000", displayName: "新导演昵称" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      accountSettingsOpen: true,
      membershipStatus: { status: "none" },
      accountSettingsForm: {
        displayName: "新导演昵称",
        phone: "+86 13800138000",
      },
    },
  });

  const drawer = html.slice(html.indexOf("account-settings-drawer"));

  assert.match(drawer, /当前套餐：未开通/);
});

test("global statusbar renders the compact handbook commerce and icon actions", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });

  assert.match(html, /statusbar-quick-action text-action/);
  assert.match(html, /创作手册/);
  assert.match(html, /href="https:\/\/hcn2azjrtd3x\.feishu\.cn\/wiki\/K20Awy1POixjIUk2RMEc5T1dnDp\?from=from_copylink"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /商务合作/);
  assert.match(html, /commerce-popover/);
  const purchaseButton = extractStatusbarButton(html, "credit-action");
  const walletButton = extractStatusbarButton(html, "wallet-action");

  assert.match(purchaseButton, /statusbar-quick-action credit-action/);
  assert.match(walletButton, /statusbar-quick-action wallet-action/);
  assert.match(purchaseButton, />购物车<\/span>/);
  assert.match(purchaseButton, /statusbar-action-icon cart-icon/);
  assert.doesNotMatch(purchaseButton, /statusbar-action-icon trailing/);
  assert.match(walletButton, />积分<\/span>/);
  assert.match(walletButton, /statusbar-action-icon credit-icon/);
  assert.doesNotMatch(walletButton, />钱包<\/span>/);
  assert.match(html, /aria-label="积分明细"/);
  assert.match(html, /data-action="open-credit-ledger"/);
  assert.match(html, /statusbar-quick-action icon-action/);
  assert.match(html, /user-avatar-icon/);
  assert.match(html, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test("global statusbar renders unified placeholder popovers for support and commerce", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "home",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });

  const supportPopover = extractStatusbarPopover(html, "support-popover");
  const commercePopover = extractStatusbarPopover(html, "commerce-popover");

  assert.match(supportPopover, /暂未开通，敬请期待。/);
  assert.doesNotMatch(supportPopover, /客服热线：4000-300624/);
  assert.doesNotMatch(supportPopover, /在线客服/);
  assert.match(commercePopover, /暂未开通，敬请期待。/);
  assert.match(commercePopover, /popover-menu-item featured/);
  assert.doesNotMatch(html, /data-action="show-commerce-placeholder"/);
});

test("global statusbar account menu exposes the community feedback entry", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });

  assert.match(html, /data-action="open-community-page">社区反馈<\/button>/);
  assert.doesNotMatch(html, />我的订阅<\/button>/);
  assert.doesNotMatch(html, />订单开票<\/button>/);
  assert.doesNotMatch(html, />合伙人中心<\/button>/);
  assert.doesNotMatch(html, />水印设置<\/button>/);
  assert.doesNotMatch(html, />更新日志<\/button>/);
  assert.doesNotMatch(html, />素材库<\/button>/);
  assert.doesNotMatch(html, /客服热线/);
  assert.doesNotMatch(html, /专属服务支持/);
});

test("team member statusbar keeps account settings but hides admin purchase entry", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: {
      user: {
        actorType: "team_member",
        teamMember: {
          id: "member-1",
          memberName: "分镜师一号",
          memberLoginAccount: "artist001@u123456",
        },
        displayName: "分镜师一号",
      },
    },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });

  const card = extractAccountPopoverCard(html);
  const purchaseButton = extractStatusbarButton(html, "credit-action");
  const walletButton = extractStatusbarButton(html, "wallet-action");

  assert.match(card, /分镜师一号/);
  assert.match(card, /artist001@u123456/);
  assert.equal(purchaseButton, "");
  assert.match(walletButton, />子账户积分<\/span>/);
  assert.match(html, /data-action="open-account-settings">账号设置<\/button>/);
  assert.doesNotMatch(html, /data-action="switch-nav" data-tab="team"/);
});

test("global statusbar shows the current account credit balance in wallet only", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", creditBalance: 1280 } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });

  const purchaseButton = extractStatusbarButton(html, "credit-action");
  const walletButton = extractStatusbarButton(html, "wallet-action");

  assert.match(purchaseButton, /data-action="open-pricing"/);
  assert.match(purchaseButton, />购物车<\/span>/);
  assert.doesNotMatch(purchaseButton, /1280/);
  assert.match(walletButton, /data-action="open-credit-ledger"/);
  assert.match(walletButton, />积分<\/span>/);
  assert.match(walletButton, />1280<\/b>/);
});

test("global statusbar puts the preferred current user balance in wallet", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", availableCredits: 2036 } },
    ui: {
      activeNavTab: "project",
      creditBalance: 0,
      episodeGenerationConfig: { creditBalance: 0 },
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });

  const purchaseButton = extractStatusbarButton(html, "credit-action");
  const walletButton = extractStatusbarButton(html, "wallet-action");

  assert.match(purchaseButton, /data-action="open-pricing"/);
  assert.doesNotMatch(purchaseButton, /2036/);
  assert.match(walletButton, /data-action="open-credit-ledger"/);
  assert.match(walletButton, />2036<\/b>/);
});

test("global statusbar uses refreshed ledger balance over stale session display balance", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: {
      user: {
        phone: "+86 13800138000",
        availableCredits: 0,
        displayCreditBalance: 0,
      },
    },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
      creditLedgerOpen: true,
      creditLedgerSummary: {
        displayAvailableCredits: 109466,
        totalConsumedCredits: 0,
      },
    },
  });

  const walletButton = extractStatusbarButton(html, "wallet-action");

  assert.match(walletButton, />109466<\/b>/);
  assert.match(html, /109,466/);
});

test("global statusbar and credit ledger omit deprecated wallet hold state", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: {
      user: {
        phone: "+86 13800138000",
        availableCredits: 0,
        displayCreditBalance: 18800,
        ["fro" + "zen" + "Credits"]: 18800,
      },
    },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
      creditLedgerOpen: true,
      creditLedgerSummary: {
        displayAvailableCredits: 0,
        displayCreditBalance: 18800,
        ["fro" + "zen" + "Credits"]: 18800,
        totalConsumedCredits: 120,
      },
    },
  });

  const walletButton = extractStatusbarButton(html, "wallet-action");

  assert.match(walletButton, />积分<\/span>/);
  assert.match(walletButton, />18800<\/b>/);
  assert.doesNotMatch(walletButton, new RegExp("冻" + "结"));
  assert.doesNotMatch(walletButton, new RegExp("statusbar-credit-" + "fro" + "zen"));
  assert.match(html, /可用积分/);
  assert.doesNotMatch(html, new RegExp("冻" + "结" + "积分"));
});

test("global overlays render pricing and wallet from the project workspace branch", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", availableCredits: 2036 } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
      isLibraryPricingModalOpen: true,
      creditLedgerOpen: true,
      membershipStatus: { status: "none" },
      membershipPlans: [{
        id: "plan-pro-month",
        code: "professional_monthly",
        displayName: "专业版月卡",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 19900,
        currency: "CNY",
        giftCredits: 1000,
      }],
    },
  });

  assert.match(html, /data-modal="pricing"/);
  assert.match(html, /library-team-global-pricing-scope/);
  assert.match(html, /official-library-page/);
  assert.match(html, /library-team-pricing-modal/);
  assert.match(html, /data-action="purchase-membership-plan"/);
  assert.match(html, /credit-ledger-drawer/);
  assert.match(html, /积分明细/);
});

test("membership pricing overlay renders from every workbench module", () => {
  const cases = [
    ["home", { activeNavTab: "home" }],
    ["script", { activeNavTab: "script" }],
    ["tools", { activeNavTab: "tools", membershipStatus: { status: "experience_active" } }],
    ["project gallery", { activeNavTab: "project", projectPanelMode: "library" }],
    ["project workspace", { activeNavTab: "project", projectPanelMode: "workspace", projectInteriorSection: "overview" }],
    ["episode workbench", { activeNavTab: "project", projectPanelMode: "episode-workbench", selectedEpisodeId: "episode-1" }],
    ["library", { activeNavTab: "library" }],
    ["team", { activeNavTab: "team" }],
  ];

  for (const [label, ui] of cases) {
    const html = renderProjectDetail({
      state: createBaseState(),
      session: { user: { phone: "+86 13800138000", availableCredits: 2036 } },
      ui: createOpenPricingUi(ui),
    });

    assert.match(html, /data-modal="pricing"/, label);
    assert.match(html, /library-team-global-pricing-scope/, label);
    assert.match(html, /library-team-pricing-modal/, label);
    assert.match(html, /data-action="purchase-membership-plan"/, label);
  }
});

test("team module renders from team overview instead of project member data", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "team",
      libraryTeamRoute: "team",
      projectMembers: [{
        id: "project-member",
        phone: "13900000000",
        role: "viewer",
        status: "enabled",
      }],
      teamOverview: {
        entitlements: { teamMemberManagement: true },
        team: { activated: false, memberCount: 0 },
        seats: { used: 0, limit: 50, remaining: 50 },
        credits: { allocatable: 13299 },
        permissions: {
          canReadMembers: true,
          canCreateMember: true,
          canViewDashboard: true,
        },
      },
      teamMembers: [],
    },
  });

  assert.doesNotMatch(html, /团队成员管理已开通/);
  assert.match(html, /data-action="open-team-member-create"/);
  assert.doesNotMatch(html, /开通专业版/);
  assert.doesNotMatch(html, /13900000000/);
});

test("team module unlocks from active professional membership when team overview is stale", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "team",
      libraryTeamRoute: "team",
      membershipStatus: {
        status: "professional_active",
        currentTier: "professional",
        currentPeriodEndAt: "2026-07-20T00:00:00.000Z",
        entitlements: { teamMemberManagement: true },
        team: { seatLimit: 50 },
      },
      teamOverview: {
        entitlements: { teamMemberManagement: false },
        team: { activated: false, memberCount: 0 },
        seats: { used: 0, limit: 0, remaining: 0 },
        credits: { allocatable: 13299 },
        permissions: {
          canReadMembers: true,
          canCreateMember: false,
          canViewDashboard: false,
        },
      },
      teamMembers: [],
    },
  });

  assert.doesNotMatch(html, /团队成员管理已开通/);
  assert.match(html, /data-action="open-team-member-create"/);
  assert.doesNotMatch(html, /去开通/);
  assert.doesNotMatch(html, /当前账号没有创建成员权限/);
});

test("credit ledger drawer renders simple wallet transaction rows", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", availableCredits: 2036 } },
    ui: {
      activeNavTab: "tools",
      creditLedgerOpen: true,
      creditLedgerRows: [{
        id: "ledger-recharge",
        entryType: "grant",
        amount: 3000,
        availableDelta: 3000,
        sourceType: "membership_gift",
        sourceId: "order-1",
        reason: "会员赠送积分",
        accountType: "owner",
        accountLabel: "主账户",
        metadata: { taskId: "eb76876b-3d0d-49a5-8dc8-17b8200093a9" },
        createdAt: "2026-06-12T08:00:00.000Z",
      }, {
        id: "ledger-consume",
        entryType: "consume",
        amount: 90,
        availableDelta: -90,
        sourceType: "generation_task",
        sourceId: "task-1",
        reason: "image generation",
        content: "生图扣减",
        accountType: "subaccount",
        accountLabel: "test@u521874f586a4",
        metadata: { billingEvent: "consumed", modelCode: "nano_banana_2", taskId: "67aad2f0-0000-4000-8000-000000000003" },
        createdAt: "2026-06-12T09:30:00.000Z",
      }],
      creditLedgerSummary: {
        displayAvailableCredits: 2036,
        displayReservedCredits: 0,
        totalConsumedCredits: 90,
      },
      creditLedgerAccountType: "子账户",
      creditLedgerMeta: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
    },
  });

  assert.match(html, /credit-ledger-drawer/);
  assert.doesNotMatch(html, /CREDIT LEDGER/);
  assert.doesNotMatch(html, /Credit Ledger/);
  for (const header of ["\u65f6\u95f4", "\u8d26\u6237", "\u7c7b\u578b", "\u5185\u5bb9", "\u79ef\u5206\u53d8\u5316"]) {
    assert.match(html, new RegExp(header));
  }
  for (const removedHeader of ["\u4efb\u52a1ID", "\u8bf4\u660e", "\u53ef\u7528\u53d8\u5316", "\u5931\u8d25|\u6210\u529f", "\u6765\u6e90", "\u8d26\u6237\u7c7b\u578b", "\u6761\u6700\u8fd1\u8bb0\u5f55"]) {
    assert.doesNotMatch(html, new RegExp(removedHeader));
  }
  assert.match(html, /credit-ledger-pagination/);
  assert.match(html, /共 2 条/);
  assert.match(html, /1 \/ 1/);
  assert.match(html, /credit-ledger-header-actions/);
  assert.match(html, /credit-ledger-close/);
  assert.match(html, /\u5145\u503c/);
  assert.match(html, /主账户/);
  assert.match(html, /test@u521874f586a4/);
  assert.match(html, /\u4f1a\u5458\u8d60\u9001\u79ef\u5206/);
  assert.match(html, /credit-ledger-account/);
  assert.match(html, /credit-ledger-content/);
  assert.match(html, /\+3,000/);
  assert.match(html, /\u6d88\u8017/);
  assert.match(html, /\u751f\u56fe\u6263\u51cf/);
  assert.match(html, /-90/);
  assert.doesNotMatch(html, /membership period gifted credits/);
  assert.doesNotMatch(html, /nano_banana_2/);
  assert.doesNotMatch(html, /data-full-id=/);
  assert.doesNotMatch(html, /credit-ledger-description/);
  assert.doesNotMatch(html, /credit-ledger-detail-row/);
});

test("credit ledger drawer labels team allocations and AI storyboard deductions", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000", availableCredits: 1835 } },
    ui: {
      activeNavTab: "tools",
      creditLedgerOpen: true,
      creditLedgerRows: [{
        id: "ledger-allocation",
        entryType: "transfer_out",
        amount: 200,
        availableDelta: -200,
        sourceType: "team_member_credit_allocation",
        sourceId: "member-1",
        reason: "分配成员积分",
        accountType: "subaccount",
        accountLabel: "asd",
        metadata: {
          action: "increase",
          memberId: "member-1",
          memberLoginAccount: "asd",
        },
        createdAt: "2026-06-20T08:00:00.000Z",
      }, {
        id: "ledger-ai-storyboard",
        entryType: "reservation",
        amount: 201,
        availableDelta: -201,
        sourceType: "episode_generation_task",
        sourceId: "task-ai-storyboard",
        reason: "script generation",
        content: "积分变动",
        accountType: "subaccount",
        accountLabel: "asd",
        metadata: {
          billingEvent: "consumed",
          outcome: "consumed",
          mediaType: "text",
          taskType: "ai_storyboard_preview",
        },
        createdAt: "2026-06-20T09:00:00.000Z",
      }],
      creditLedgerSummary: {
        displayAvailableCredits: 1835,
        displayReservedCredits: 0,
        totalConsumedCredits: 401,
      },
    },
  });

  assert.match(html, />分配<\/span>/);
  assert.match(html, /credit-ledger-type consume">分配/);
  assert.match(html, /主账号分配积分/);
  assert.match(html, />消耗<\/span>/);
  assert.match(html, /AI分镜积分消耗/);
  assert.doesNotMatch(html, />充值<\/span>/);
  assert.doesNotMatch(html, />预占<\/span>/);
});

test("credit ledger drawer keeps next page enabled when the first page is full", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000", availableCredits: 1835 } },
    ui: {
      activeNavTab: "tools",
      creditLedgerOpen: true,
      creditLedgerRows: Array.from({ length: 10 }, (_, index) => ({
        id: `ledger-row-${index}`,
        entryType: "grant",
        amount: 30,
        availableDelta: 30,
        sourceType: "membership_gift",
        sourceId: `gift-${index}`,
        reason: "membership period gifted credits",
        accountType: "owner",
        accountLabel: "主账户",
        createdAt: `2026-06-27T0${index % 9}:00:00.000Z`,
      })),
      creditLedgerSummary: {
        displayAvailableCredits: 1835,
        displayReservedCredits: 0,
        totalConsumedCredits: 0,
      },
      creditLedgerMeta: { total: 10, page: 1, pageSize: 10, totalPages: 1 },
    },
  });

  assert.match(html, /data-action="change-credit-ledger-page" data-page="2" >下一页<\/button>/);
});

test("credit ledger drawer uses the initial page size of 10", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000", availableCredits: 1835 } },
    ui: {
      activeNavTab: "tools",
      creditLedgerOpen: true,
      creditLedgerRows: Array.from({ length: 10 }, (_, index) => ({
        id: `ledger-row-${index}`,
        entryType: "grant",
        amount: 30,
        availableDelta: 30,
        sourceType: "membership_gift",
        sourceId: `gift-${index}`,
        reason: "会员赠送积分",
        accountType: "owner",
        accountLabel: "主账户",
        createdAt: `2026-06-27T0${index % 9}:00:00.000Z`,
      })),
      creditLedgerSummary: {
        displayAvailableCredits: 1835,
        displayReservedCredits: 0,
        totalConsumedCredits: 0,
      },
      creditLedgerMeta: { total: 10, page: 1, pageSize: 10, totalPages: 1 },
    },
  });

  assert.match(html, /共 10 条/);
  assert.match(html, /1 \/ 2/);
});

test("credit ledger drawer keeps source-written Chinese content", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { phone: "+86 13800138000", availableCredits: 1835 } },
    ui: {
      activeNavTab: "tools",
      creditLedgerOpen: true,
      creditLedgerRows: [{
        id: "ledger-gift",
        entryType: "grant",
        amount: 3000,
        availableDelta: 3000,
        sourceType: "payment_order",
        sourceId: "order-1",
        reason: "会员赠送积分",
        metadata: {},
        createdAt: "2026-06-28T09:49:00.000Z",
      }, {
        id: "ledger-freeze",
        entryType: "consume",
        amount: 10006,
        availableDelta: -10006,
        sourceType: "membership_wallet_freeze",
        sourceId: "freeze-1",
        reason: "会员到期冻结积分",
        metadata: {},
        createdAt: "2026-06-24T15:10:00.000Z",
      }, {
        id: "ledger-release",
        entryType: "restore",
        amount: 10006,
        availableDelta: 10006,
        sourceType: "membership_wallet_restore",
        sourceId: "restore-1",
        reason: "会员续费解冻积分",
        metadata: {},
        createdAt: "2026-06-25T17:04:00.000Z",
      }],
      creditLedgerSummary: {
        displayAvailableCredits: 1835,
        displayReservedCredits: 0,
        totalConsumedCredits: 10006,
      },
      creditLedgerMeta: { total: 3, page: 1, pageSize: 10, totalPages: 1 },
    },
  });

  assert.match(html, /会员赠送积分/);
  assert.match(html, /会员到期冻结积分/);
  assert.match(html, /会员续费解冻积分/);
  assert.doesNotMatch(html, /membership period gifted credits/);
  assert.doesNotMatch(html, /wallet freeze removed and credits released/);
  assert.doesNotMatch(html, /membership lapsed wallet frozen/);
});

test("credit ledger drawer uses a narrower desktop width", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );
  const drawerRule = css.match(/\.credit-ledger-drawer\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(drawerRule, /width:\s*min\(64rem,\s*calc\(100vw - 2\.4rem\)\)/);
  assert.doesNotMatch(drawerRule, /width:\s*min\(72rem/);
});
