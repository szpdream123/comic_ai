import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { renderLibraryTeam } from "../src/features/library-team/index.js";
import { renderProductionWorkbench } from "../src/features/production-workbench/index.js";
import { renderPricingModal } from "../src/features/library-team/pricing-modal.js";
import { renderMemberRulesModal } from "../src/features/library-team/member-rules-modal.js";
import { pricingPlans } from "../src/shared/commerce-fixtures.js";
import { permissionRows, teamRoles } from "../src/shared/permissions-fixtures.js";

function assertHasAction(html, action) {
  assert.match(html, new RegExp(`data-action="${escapeRegExp(action)}"`));
}

function assertIncludesText(html, text) {
  assert.match(html, new RegExp(escapeRegExp(text)));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWorkbenchTab(activeNavTab, ui = {}) {
  return renderProductionWorkbench({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab,
      busy: false,
      toast: "ready",
      exportHistory: [],
      storyboards: [],
      ...ui,
    },
  });
}

describe("asset library surfaces", () => {
  it("renders the personal asset library empty state and controls", () => {
    const html = renderLibraryTeam({ route: "assets" });

    assert.match(html, /asset-library-page/);
    assertHasAction(html, "open-library-upload");
    assertHasAction(html, "open-library-generate");
    assertHasAction(html, "set-library-asset-type-filter");
    assertHasAction(html, "search-library-assets");
    assertIncludesText(html, "Agent");
  });

  it("renders official and team asset library categories with the membership gate", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      libraryCategory: "角色",
      libraryFolder: "国内仿真人·现代都市",
      selectedLibraryAssetId: "doctor",
      selectedLibraryImportIds: ["doctor"],
    });

    assert.match(html, /official-library-page/);
    assertHasAction(html, "open-pricing");
    assertHasAction(html, "set-library-asset-scope");
    assertHasAction(html, "set-library-category");
    assertHasAction(html, "set-library-folder");
    assertHasAction(html, "select-library-asset");
    assertHasAction(html, "toggle-library-import-selection");
    assertHasAction(html, "import-selected-library-assets");
    assert.match(html, /library-team-badge/);
    assertIncludesText(html, "医生");
  });
});

describe("production workbench integration", () => {
  it("renders the asset library inside the production workbench library tab", () => {
    const html = renderWorkbenchTab("library");

    assert.match(html, /library-team-page/);
    assertHasAction(html, "open-library-upload");
    assertHasAction(html, "open-library-generate");

    const teamScopeHtml = renderWorkbenchTab("library", { libraryTeamAssetScope: "team" });
    assertHasAction(teamScopeHtml, "open-pricing");
  });

  it("renders real project assets inside the production workbench library tab when available", () => {
    const html = renderWorkbenchTab("library", {
      importedAssets: {
        character: [{ id: "asset-1", name: "Hero", kind: "character", preview: "/uploads/hero.png" }],
        scene: [{ id: "asset-2", name: "Street", kind: "scene", preview: "/uploads/street.png" }],
        prop: [{ id: "asset-3", name: "Radio", kind: "prop", preview: "/uploads/radio.png" }],
        other: { image: [], video: [] },
      },
    });

    assertIncludesText(html, "Hero");
    assertIncludesText(html, "Street");
    assertIncludesText(html, "Radio");
  });

  it("prefers backend library assets over episode workbench imports inside the library tab", () => {
    const html = renderWorkbenchTab("library", {
      importedAssets: {
        character: [{ id: "episode-asset-1", name: "episode-imported-character", kind: "character", preview: "/uploads/episode-hero.png" }],
        scene: [],
        prop: [],
        other: { image: [], video: [] },
      },
      projectLibraryAssetsByType: {
        character: [{ id: "library-asset-1", label: "backend-library-character", previewUrl: "/uploads/library-hero.png" }],
        scene: [],
        prop: [],
        other: { image: [], video: [] },
      },
    });

    assertIncludesText(html, "backend-library-character");
    assert.doesNotMatch(html, /episode-imported-character/);
  });

  it("filters backend library assets by type and search query inside the library tab", () => {
    const html = renderWorkbenchTab("library", {
      projectLibraryAssetsByType: {
        character: [{ id: "library-asset-1", label: "Hero", previewUrl: "/uploads/library-hero.png" }],
        scene: [{ id: "library-asset-2", label: "Street", previewUrl: "/uploads/library-scene.png" }],
        prop: [{ id: "library-asset-3", label: "Radio", previewUrl: "/uploads/library-prop.png" }],
        other: { image: [], video: [] },
      },
      libraryAssetTypeFilter: "scene",
      libraryAssetSearchQuery: "street",
    });

    assertIncludesText(html, "Street");
    assert.doesNotMatch(html, /Hero/);
    assert.doesNotMatch(html, /Radio/);
  });

  it("renders the team page and dashboard route inside the production workbench team tab", () => {
    const teamHtml = renderWorkbenchTab("team");
    assert.match(teamHtml, /library-team-page/);
    assertHasAction(teamHtml, "open-team-dashboard");
    assertHasAction(teamHtml, "open-create-member");

    const dashboardHtml = renderWorkbenchTab("team", { libraryTeamRoute: "team-dashboard" });
    assertHasAction(dashboardHtml, "back-to-team-page");
    assertHasAction(dashboardHtml, "set-team-dashboard-tab");
    assertHasAction(dashboardHtml, "set-team-dashboard-date-shortcut");
    assertHasAction(dashboardHtml, "export-team-dashboard");
  });

  it("passes real billing packages into the workbench pricing modal", () => {
    const html = renderWorkbenchTab("team", {
      pricingOpen: true,
      isLibraryPricingModalOpen: true,
      billingPackages: [
        {
          id: "pkg-1",
          code: "starter_120",
          displayName: "Starter",
          credits: 120,
          amountMinor: 9900,
          currency: "CNY",
          status: "active",
        },
      ],
    });

    assertIncludesText(html, "Starter");
    assertIncludesText(html, "120");
    assertHasAction(html, "purchase-billing-package");
  });

  it("passes the latest payment intent into the workbench pricing modal", () => {
    const html = renderWorkbenchTab("team", {
      pricingOpen: true,
      isLibraryPricingModalOpen: true,
      lastPaymentIntent: {
        id: "intent-1",
        orderId: "order-1",
        provider: "wechat_pay",
        productMode: "native_qr",
        status: "submitted",
        amountMinor: 9900,
        currency: "CNY",
        merchantOrderNo: "MOCK20260529001",
        expiresAt: "2026-05-29T18:30:00.000Z",
      },
      lastPaymentAction: {
        kind: "mock_qr",
        provider: "wechat_pay",
        merchantOrderNo: "MOCK20260529001",
        amountMinor: 9900,
        currency: "CNY",
      },
    });

    assertIncludesText(html, "MOCK20260529001");
    assertIncludesText(html, "submitted");
    assertHasAction(html, "refresh-payment-intent");
  });

  it("keeps project pagination labels readable when the team module is mounted", () => {
    const projectLibrary = Array.from({ length: 9 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `Project ${index + 1}`,
      status: "draft",
      createdAt: `2026/05/${String(index + 1).padStart(2, "0")}`,
    }));
    const html = renderWorkbenchTab("project", {
      projectPanelMode: "library",
      projectLibrary,
      projectLibraryPage: 1,
    });

    assertIncludesText(html, "1 / 2");
  });
});

describe("team management surfaces", () => {
  it("renders team metrics, filters, member table, and empty member CTA", () => {
    const html = renderLibraryTeam({ route: "team" });

    assert.match(html, /team-page/);
    assertHasAction(html, "refresh-team");
    assertHasAction(html, "open-team-dashboard");
    assertHasAction(html, "open-member-rules");
    assertHasAction(html, "open-create-member");
    assertHasAction(html, "search-team-members");
    assertHasAction(html, "set-team-member-role-filter");
    assertHasAction(html, "set-team-member-status-filter");
    assertHasAction(html, "reset-team-member-filters");
  });

  it("renders real members and stats when supplied by the workbench context", () => {
    const html = renderLibraryTeam({
      route: "team",
      projectName: "Wasteland Project",
      stats: {
        episodeCount: 3,
        memberCount: 1,
        generatedVideoCount: 4,
        generatedImageCount: 1280,
        assetCount: 720,
        exportCount: 300,
      },
      members: [
        {
          id: "member-1",
          phone: "13800138000",
          userId: "user-1",
          role: "producer",
          status: "enabled",
          note: "team-owner",
          projectScope: "workspace-a",
          memberGroup: "alpha",
          creditQuota: 512,
        },
      ],
    });

    assertIncludesText(html, "Wasteland Project");
    assertIncludesText(html, "13800138000");
    assertIncludesText(html, "制片");
    assertIncludesText(html, "workspace-a");
    assertIncludesText(html, "alpha");
    assertIncludesText(html, "512");
    assertHasAction(html, "open-edit-member");
  });

  it("filters real members by search, role, and status when supplied by the workbench context", () => {
    const html = renderLibraryTeam({
      route: "team",
      members: [
        {
          id: "member-1",
          phone: "13800138000",
          userId: "user-1",
          role: "producer",
          status: "enabled",
          note: "allowed",
        },
        {
          id: "member-2",
          phone: "13900139000",
          userId: "user-2",
          role: "viewer",
          status: "disabled",
          note: "blocked",
        },
      ],
      memberSearchQuery: "1380",
      memberRoleFilter: "producer",
      memberStatusFilter: "enabled",
    });

    assertIncludesText(html, "13800138000");
    assert.doesNotMatch(html, /13900139000/);
  });

  it("renders the create member modal from the team page context", () => {
    const html = renderLibraryTeam({
      route: "team",
      createMemberModal: {
        open: true,
        phone: "13800138002",
        role: "creator",
        note: "storyboard-collab",
        notice: "member-create-notice",
      },
    });

    assert.match(html, /data-modal="create-member"/);
    assertHasAction(html, "close-create-member");
    assertHasAction(html, "change-create-member-phone");
    assertHasAction(html, "change-create-member-role");
    assertHasAction(html, "change-create-member-note");
    assertHasAction(html, "submit-create-member");
    assertIncludesText(html, "13800138002");
    assertIncludesText(html, "storyboard-collab");
  });

  it("renders the edit member modal from the team page context", () => {
    const html = renderLibraryTeam({
      route: "team",
      editMemberModal: {
        open: true,
        id: "member-1",
        phone: "13800138002",
        role: "viewer",
        note: "readonly-review",
        status: "disabled",
        notice: "member-disabled",
      },
    });

    assert.match(html, /data-modal="edit-member"/);
    assertHasAction(html, "close-edit-member");
    assertHasAction(html, "change-edit-member-role");
    assertHasAction(html, "change-edit-member-note");
    assertHasAction(html, "toggle-member-status");
    assertHasAction(html, "submit-edit-member");
    assertIncludesText(html, "13800138002");
    assertIncludesText(html, "readonly-review");
    assertIncludesText(html, "已停用");
  });

  it("renders the team dashboard route without requiring shell DOM", () => {
    const html = renderLibraryTeam({
      route: "team-dashboard",
      members: [
        {
          id: "member-1",
          phone: "13800138000",
          userId: "user-1",
          role: "producer",
          status: "enabled",
          note: "dashboard-owner",
          creditQuota: 512,
          projectScope: "workspace-a",
          memberGroup: "alpha",
          scriptCount: 8,
          projectCount: 3,
          projectAverageCredits: 171,
        },
      ],
      selectedDashboardMemberId: "member-1",
    });

    assert.match(html, /team-dashboard-page/);
    assertHasAction(html, "back-to-team-page");
    assertHasAction(html, "set-team-dashboard-tab");
    assertHasAction(html, "set-team-dashboard-date-shortcut");
    assertHasAction(html, "set-team-dashboard-role-filter");
    assertHasAction(html, "set-team-dashboard-status-filter");
    assertHasAction(html, "view-team-dashboard-member");
    assertHasAction(html, "export-team-dashboard");
    assertIncludesText(html, "dashboard-owner");
  });
});

describe("commercial and permission gates", () => {
  it("exports pricing fixtures and renders the pricing modal", () => {
    assert.deepEqual(pricingPlans.map((plan) => [plan.id, plan.price, plan.credits]), [
      ["trial", "¥100", "1000积分"],
      ["pro", "¥5000", "51000积分"],
      ["enterprise", "联系商务", "定制"],
    ]);

    const html = renderPricingModal({ open: true });
    assert.match(html, /data-modal="pricing"/);
    assertHasAction(html, "close-pricing");
    assertHasAction(html, "purchase-billing-package");
    assertHasAction(html, "request-enterprise-contact");
    assert.match(html, /disabled/);
    assert.match(html, /disabled/);
  });

  it("exports data-driven permissions and renders the rules modal", () => {
    assert.ok(Array.isArray(teamRoles));
    assert.ok(teamRoles.length >= 6);
    assert.ok(Array.isArray(permissionRows));
    assert.ok(permissionRows.length >= 6);

    const html = renderMemberRulesModal({ open: true });
    assert.match(html, /data-modal="member-rules"/);
    assertHasAction(html, "close-member-rules");
    assert.match(html, /<table>/);
  });

  it("renders billing packages from backend-shaped data when provided", () => {
    const html = renderPricingModal({
      open: true,
      packages: [
        {
          id: "pkg-1",
          code: "starter_120",
          displayName: "Starter",
          credits: 120,
          amountMinor: 9900,
          currency: "CNY",
          status: "active",
        },
        {
          id: "pkg-2",
          code: "studio_600",
          displayName: "Studio",
          credits: 600,
          amountMinor: 39900,
          currency: "CNY",
          status: "active",
        },
      ],
    });

    assertIncludesText(html, "Starter");
    assertIncludesText(html, "Studio");
    assertIncludesText(html, "pkg-1");
    assertHasAction(html, "purchase-billing-package");
  });

  it("renders the latest payment intent details inside the pricing modal", () => {
    const html = renderPricingModal({
      open: true,
      billingOrder: {
        id: "order-1",
      },
      paymentIntent: {
        id: "intent-1",
        orderId: "order-1",
        provider: "wechat_pay",
        productMode: "native_qr",
        status: "submitted",
        amountMinor: 9900,
        currency: "CNY",
        merchantOrderNo: "MOCK20260529001",
        expiresAt: "2026-05-29T18:30:00.000Z",
      },
      paymentAction: {
        kind: "mock_qr",
        provider: "wechat_pay",
        merchantOrderNo: "MOCK20260529001",
        amountMinor: 9900,
        currency: "CNY",
      },
    });

    assertIncludesText(html, "intent-1");
    assertIncludesText(html, "order-1");
    assertIncludesText(html, "MOCK20260529001");
    assertHasAction(html, "refresh-payment-intent");
  });
});

describe("design-system mapping", () => {
  it("keeps the library-team stylesheet tied to the canonical Web UI Kit tokens", () => {
    const css = readFileSync(new URL("../src/features/library-team/library-team.css", import.meta.url), "utf8");

    assert.match(css, /--color-canvas/);
    assert.match(css, /--color-hairline/);
    assert.match(css, /--radius-sm/);
    assert.match(css, /--radius-pill/);
    assert.match(css, /--library-team-accent/);
    assert.match(css, /\.library-team-shell/);
    assert.match(css, /\.library-team-page-head/);
    assert.match(css, /\.library-team-empty-actions/);
    assert.match(css, /\.library-team-plan-note/);
    assert.match(css, /focus-visible/);
    assert.match(css, /@media \(max-width: 768px\)/);
    assert.match(css, /\.library-team-table-wrap/);
    assert.match(css, /\.library-team-modal[^{]*\{[^}]*overflow: auto/s);
    assert.match(css, /button:disabled/);
  });
});
