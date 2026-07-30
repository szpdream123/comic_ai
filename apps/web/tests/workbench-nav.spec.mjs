import assert from "node:assert/strict";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";
import {
  deriveInitialNavTabForTest,
  handleWorkbenchActionForTest,
  handleNewCanvasHostInputForTest,
  readWorkbenchRouteTokenForTest,
  syncWorkbenchRouteStateForTest,
} from "../src/features/production-workbench/index.js";

test("workbench rail omits the community tab", () => {
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
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "team",
      projectPanelMode: "detail",
    },
  });

  assert.doesNotMatch(html, /data-tab="community"/);
  assert.doesNotMatch(html, /data-action="open-community"/);
});

test("workbench exposes a single Canvas rail entry", () => {
  const html = renderProjectDetail({
    state: { project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" } },
    session: { authenticated: true, features: { newCanvas: true }, user: { id: "user-1", phone: "13800138000" } },
    ui: { activeNavTab: "home", canvasProjectView: "list" },
  });
  assert.match(html, /data-action="set-nav-tab"\s+data-tab="tools"/);
  assert.doesNotMatch(html, /data-action="set-nav-tab"\s+data-tab="new-canvas"/);
});

test("opening new Canvas shows the project list without auto-creating or opening a project", async () => {
  let listCalls = 0;
  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: {},
    session: { authenticated: true, features: { newCanvas: true }, user: { id: "user-1", phone: "13800138000" } },
    api: {
      async getCanvasProjects() {
        listCalls += 1;
        return { projects: [{ id: "canvas-1", title: "分镜草稿" }] };
      },
    },
    ui: { activeNavTab: "home", canvasProjectView: "detail", selectedCanvasProjectId: "" },
  };
  await handleWorkbenchActionForTest(workbench, { dataset: { action: "open-new-canvas" } });
  assert.equal(listCalls, 1);
  assert.equal(workbench.ui.activeNavTab, "new-canvas");
  assert.equal(workbench.ui.canvasEntryPoint, "new");
  assert.equal(workbench.ui.canvasProjectView, "list");
  assert.equal(workbench.ui.selectedCanvasProjectId, "canvas-1");
});

test("team member sessions omit the team tab from the workbench rail", () => {
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
    session: { user: { actorType: "team_member", teamMember: { id: "member-1", memberName: "子账户" } } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
    },
  });

  assert.doesNotMatch(html, /data-tab="team"/);
  assert.doesNotMatch(html, /团队/);
});

test("team member hash routes fall back to the project panel", () => {
  const workbench = {
    session: { user: { actorType: "team_member", teamMember: { id: "member-1", memberName: "子账户" } } },
    ui: {
      activeNavTab: "team",
      projectPanelMode: "library",
      projectInteriorSection: "assets",
      libraryTeamRoute: "team",
    },
    root: { innerHTML: "" },
  };

  syncWorkbenchRouteStateForTest(workbench, "#team-dashboard");

  assert.equal(workbench.ui.activeNavTab, "project");
  assert.equal(workbench.ui.projectPanelMode, "detail");
  assert.equal(workbench.ui.projectInteriorSection, "overview");
  assert.equal(workbench.ui.libraryTeamRoute, "assets");
});

test("team member initial route falls back to the project panel", () => {
  const nextTab = deriveInitialNavTabForTest("#team-dashboard", {
    user: { actorType: "team_member", teamMember: { id: "member-1", memberName: "子账户" } },
  });

  assert.equal(nextTab, "project");
});

test("disabled new Canvas feature hides only the new route and keeps legacy Canvas available", () => {
  const session = {
    authenticated: true,
    features: { newCanvas: false },
    user: { id: "user-1", phone: "13800000000" },
  };
  const html = renderProjectDetail({
    state: {},
    session,
    ui: { activeNavTab: "home", canvasProjectView: "list" },
  });
  assert.match(html, /data-tab="tools"/);
  assert.doesNotMatch(html, /data-tab="new-canvas"/);
  assert.equal(deriveInitialNavTabForTest("#tools-canvas", session), "tools");
  assert.equal(deriveInitialNavTabForTest("#new-canvas-canvas", session), "home");

  const workbench = {
    session,
    ui: { activeNavTab: "tools", canvasProjectView: "detail" },
  };
  syncWorkbenchRouteStateForTest(workbench, "#tools-canvas");
  assert.equal(workbench.ui.activeNavTab, "tools");
  assert.equal(workbench.ui.canvasProjectView, "detail");

  syncWorkbenchRouteStateForTest(workbench, "#new-canvas-canvas");
  assert.equal(workbench.ui.activeNavTab, "home");
  assert.equal(workbench.ui.canvasProjectView, "list");
  assert.equal(workbench.ui.toast, "新画布当前未启用。");
});

test("new Canvas path and detail token restore an independent navigation state", () => {
  const session = {
    authenticated: true,
    features: { newCanvas: true },
    user: { id: "user-1", phone: "13800000000" },
  };
  assert.equal(readWorkbenchRouteTokenForTest({ pathname: "/new-canvas/", hash: "" }), "new-canvas");
  assert.equal(readWorkbenchRouteTokenForTest({ pathname: "/canvas", hash: "" }), "tools");
  assert.equal(deriveInitialNavTabForTest("#new-canvas-canvas", session), "new-canvas");

  const workbench = {
    session,
    ui: { activeNavTab: "tools", canvasProjectView: "list", selectedCanvasNodeId: "node-1" },
  };
  syncWorkbenchRouteStateForTest(workbench, "#new-canvas-canvas");
  assert.equal(workbench.ui.activeNavTab, "new-canvas");
  assert.equal(workbench.ui.canvasProjectView, "detail");

  syncWorkbenchRouteStateForTest(workbench, "#tools");
  assert.equal(workbench.ui.activeNavTab, "tools");
  assert.equal(workbench.ui.canvasProjectView, "list");
});

test("Canvas sidebar filter, search, and collapse controls expose working state", async () => {
  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: {},
    session: { authenticated: true, features: { newCanvas: true }, user: { id: "user-1" } },
    api: {},
    ui: {
      activeNavTab: "new-canvas",
      canvasProjectView: "detail",
      canvasSidebarCollapsed: false,
      canvasDocument: {
        nodes: [
          { id: "text-1", type: "ai-text", data: { title: "旁白节点" } },
          { id: "image-1", type: "ai-image", data: { title: "主视觉" } },
        ],
        edges: [],
        viewport: {},
      },
    },
  };

  await handleWorkbenchActionForTest(workbench, { dataset: { action: "toggle-canvas-node-search" } });
  await handleWorkbenchActionForTest(workbench, { dataset: { action: "toggle-canvas-sidebar" } });
  handleNewCanvasHostInputForTest(workbench, {
    value: "image",
    matches(selector) { return selector === "[data-canvas-node-filter]"; },
  });
  handleNewCanvasHostInputForTest(workbench, {
    value: "主视觉",
    matches(selector) { return selector === "[data-canvas-node-search]"; },
    closest() { return null; },
  });

  assert.equal(workbench.ui.canvasNodeSearchOpen, true);
  assert.equal(workbench.ui.canvasSidebarCollapsed, true);
  assert.equal(workbench.ui.canvasNodeFilter, "image");
  assert.equal(workbench.ui.canvasNodeSearch, "主视觉");

  const html = renderProjectDetail({ state: {}, session: workbench.session, ui: { ...workbench.ui, canvasHostMount: false } });
  assert.doesNotMatch(html, /canvas-help-panel|toggle-canvas-help|画布说明/);
  assert.match(html, /data-canvas-node-filter aria-label="筛选画布节点"/);
  assert.match(html, /data-action="toggle-canvas-sidebar"[^>]+aria-label="展开资产管理"/);
  assert.match(html, /主视觉/);
  assert.doesNotMatch(html, /旁白节点/);
});

test("Canvas storyboard grid controls persist axis counts and custom divider positions", async () => {
  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: {},
    session: { authenticated: true, features: { newCanvas: true }, user: { id: "user-1" } },
    api: {},
    ui: {
      activeNavTab: "new-canvas",
      canvasProjectView: "detail",
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "分镜测试" }],
      canvasDocumentsByProject: {},
      canvasDocument: {
        version: 1,
        nodes: [{
          id: "story-1",
          type: "ai-storyboard",
          position: { x: 0, y: 0 },
          size: { width: 420, height: 356 },
          data: {
            storyboardGridMode: "custom",
            storyboardRows: 2,
            storyboardCols: 2,
            storyboardRowPositions: [50],
            storyboardColPositions: [50],
            storyboardExtracted: [true, false, false, false],
          },
        }],
        edges: [],
        viewport: {},
      },
    },
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "adjust-canvas-storyboard-grid-axis",
      nodeId: "story-1",
      storyboardAxis: "columns",
      storyboardDelta: "1",
    },
  });
  let node = workbench.ui.canvasDocument.nodes.find((item) => item.id === "story-1");
  assert.equal(node.data.storyboardCols, 3);
  assert.deepEqual(node.data.storyboardColPositions, [25, 50]);
  assert.deepEqual(node.data.storyboardExtracted, [true, false, false, false, false, false]);

  const target = {
    value: "62.5",
    dataset: { nodeId: "story-1", storyboardAxis: "columns", storyboardPositionIndex: "1" },
    matches(selector) { return selector === "[data-canvas-storyboard-position-input]"; },
  };
  assert.equal(handleNewCanvasHostInputForTest(workbench, target), true);
  node = workbench.ui.canvasDocument.nodes.find((item) => item.id === "story-1");
  assert.deepEqual(node.data.storyboardColPositions, [25, 62.5]);
});

test("project panel omits the members interior tab", () => {
  const baseContext = {
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
  };

  const html = renderProjectDetail({
    ...baseContext,
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "assets",
    },
  });
  assert.doesNotMatch(html, /data-section="members"/);
  assert.doesNotMatch(html, /<strong>成员<\/strong>/);

  const legacyStateHtml = renderProjectDetail({
    ...baseContext,
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "members",
      projectMembers: [{ phone: "18571521874", role: "owner_admin", status: "active" }],
    },
  });
  assert.doesNotMatch(legacyStateHtml, /当前项目所在协作空间的真实成员列表/);
  assert.match(legacyStateHtml, /data-section="overview"[\s\S]*class="interior-nav-item active"|class="interior-nav-item active"[\s\S]*data-section="overview"/);
});

test("project panel removes the extra top headers while keeping interior navigation", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "龙珠", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "龙珠", phase: "asset_review", statusLabel: "资产审核中", type: "2D/3D 动漫", aspectRatio: "9:16" },
        episodes: [{ id: "episode-1", title: "第 1 集", storyboardCount: 3 }],
        shots: [{ id: "shot-1" }, { id: "shot-2" }],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "overview",
    },
  });

  assert.match(html, /project-workbench-nav/);
  assert.match(html, /project-overview-brief/);
  assert.match(html, /aria-label="项目总览信息"/);
  assert.match(html, /project-overview-brief__title[\s\S]*<strong>工作台<\/strong>/);
  assert.match(html, /<span>当前项目<\/span>\s*<strong>龙珠<\/strong>/);
  assert.match(html, /<span>状态<\/span>\s*<strong>资产准备<\/strong>/);
  assert.match(html, /<span>画幅<\/span>\s*<strong>9:16<\/strong>/);
  assert.doesNotMatch(html, /<span>项目<\/span>/);
  assert.doesNotMatch(html, /龙珠<\/strong>\s*<span>工作台<\/span>/);
  assert.doesNotMatch(html, /project-workbench-nav-meta/);
  assert.doesNotMatch(html, /project-workbench-nav-title/);
  assert.doesNotMatch(html, /创作工作台/);
  assert.doesNotMatch(html, /项目摘要/);
  assert.doesNotMatch(html, /工作台概览/);
  assert.doesNotMatch(html, /素材整理/);
  assert.doesNotMatch(html, /分集推进/);
  assert.doesNotMatch(html, /产能回看/);
  assert.doesNotMatch(html, /项目总控/);
  assert.doesNotMatch(html, /角色 场景 道具/);
  assert.doesNotMatch(html, /分集与分镜/);
  assert.doesNotMatch(html, /settings-header/);
  assert.doesNotMatch(html, /资产准备<\/h2>/);
  assert.doesNotMatch(html, /AI 智能提取资产/);
  assert.doesNotMatch(html, /project-workbench-metrics/);
  assert.doesNotMatch(html, /project-side-rail/);
});

test("project panel keeps the global brand visible in the top status bar", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "龙珠", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "龙珠", phase: "asset_review", aspectRatio: "9:16" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "overview",
    },
  });

  assert.match(html, /global-statusbar/);
  assert.match(html, /statusbar-brand/);
  assert.match(html, /<strong>灵曦剧场<\/strong>/);
  assert.match(html, /global-statusbar/);
});

test("asset episode and stats sections omit redundant page titles", () => {
  const baseContext = {
    state: {
      project: { id: "project-1", name: "龙珠", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "龙珠" },
        episodes: [{ id: "episode-1", title: "第 1 集", storyboardCount: 3 }],
        assetSummary: {
          character: { count: 3, previews: [] },
          scene: { count: 2, previews: [] },
          prop: { count: 1, previews: [] },
          other: { count: 1, previews: [] },
        },
        shots: [
          { id: "shot-1", currentImageAssetVersionId: "image-version-1", currentVideoAssetVersionId: "video-version-1" },
          { id: "shot-2", imageStatus: "ready", videoStatus: "draft" },
          { id: "shot-3", imageStatus: "draft", videoStatus: "completed" },
        ],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
    },
  };

  const assetHtml = renderProjectDetail({
    ...baseContext,
    ui: {
      ...baseContext.ui,
      projectInteriorSection: "assets",
    },
  });
  assert.doesNotMatch(assetHtml, /<h1>资产<\/h1>/);

  const episodesHtml = renderProjectDetail({
    ...baseContext,
    ui: {
      ...baseContext.ui,
      projectInteriorSection: "episodes",
    },
  });
  assert.doesNotMatch(episodesHtml, /剧集 \(\d+\)/);
  assert.doesNotMatch(episodesHtml, /导出历史/);

  const statsHtml = renderProjectDetail({
    ...baseContext,
    ui: {
      ...baseContext.ui,
      projectInteriorSection: "stats",
      projectStats: {
        memberCount: 1,
        episodeCount: 6,
        shotCount: 24,
        assetCount: 7,
        exportCount: 3,
        generatedImageCount: 2,
        generatedVideoCount: 2,
        lastActivityAt: "2026-06-24T08:30:00.000Z",
      },
      exportHistory: [{ id: "export-1", manifestStatus: "ready", createdAt: "2026-06-24T00:00:00.000Z" }],
    },
  });
  assert.match(statsHtml, /产能统计/);
  assert.match(statsHtml, /成片覆盖率/);
  assert.match(statsHtml, /生产链路/);
  assert.match(statsHtml, /项目信号/);
  assert.match(statsHtml, /协作成员/);
  assert.match(statsHtml, /角色 场景 道具/);
  assert.match(statsHtml, /画面就绪/);
  assert.match(statsHtml, /成片就绪/);
  assert.match(statsHtml, /累计导出/);
  assert.match(statsHtml, /最近活动/);
  assert.match(statsHtml, /<strong>3<\/strong>\s*<p>累计导出<\/p>/);
  assert.match(statsHtml, /<span>资产储备<\/span>\s*<strong>7<\/strong>/);
  assert.match(statsHtml, /<span>图片生成<\/span>\s*<strong>2<\/strong>/);
  assert.match(statsHtml, /<span>视频生成<\/span>\s*<strong>2<\/strong>/);
  assert.doesNotMatch(statsHtml, /<h1>统计<\/h1>/);
  assert.doesNotMatch(statsHtml, /聚合当前项目的剧集、分镜、资产与导出记录/);
  assert.doesNotMatch(statsHtml, /<span>导出<\/span>/);
  assert.doesNotMatch(statsHtml, /deerflow/i);
  assert.doesNotMatch(statsHtml, /export-1/);
});

test("project stats render backend stats without deriving from project detail", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "真实统计项目", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "真实统计项目" },
        episodes: [{ id: "episode-1", title: "第 1 集" }, { id: "episode-2", title: "第 2 集" }],
        shots: [
          { id: "shot-1", currentImageAssetVersionId: "image-version-1", currentVideoAssetVersionId: "video-version-1" },
          { id: "shot-2", imageStatus: "completed", videoStatus: "completed" },
          { id: "shot-3", imageStatus: "ready", videoStatus: "ready" },
        ],
        assetSummary: {
          character: { count: 20, previews: [] },
          scene: { count: 30, previews: [] },
          prop: { count: 40, previews: [] },
          other: { count: 50, previews: [] },
        },
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "stats",
      projectStats: {
        memberCount: 3,
        episodeCount: 6,
        shotCount: 12,
        assetCount: 7,
        generatedImageCount: 4,
        generatedVideoCount: 5,
      },
    },
  });

  assert.match(html, /<span>协作成员<\/span>\s*<strong>3<small>人<\/small><\/strong>/);
  assert.match(html, /<span>剧集<\/span>\s*<strong>6<\/strong>/);
  assert.match(html, /<span>分镜<\/span>\s*<strong>12<\/strong>/);
  assert.match(html, /<span>资产储备<\/span>\s*<strong>7<\/strong>/);
  assert.match(html, /<span>图片生成<\/span>\s*<strong>4<\/strong>/);
  assert.match(html, /<span>视频生成<\/span>\s*<strong>5<\/strong>/);
  assert.doesNotMatch(html, /<strong>140<\/strong>/);
});

test("project overview episode creation shows only the latest 12 episodes from project detail", () => {
  const episodes = Array.from({ length: 14 }, (_, index) => {
    const episodeNumber = index + 1;
    const createdAt = new Date(Date.UTC(2026, 5, episodeNumber, 0, 0, 0)).toISOString();
    return {
      id: `episode-${episodeNumber}`,
      title: `第 ${episodeNumber} 集`,
      storyboardCount: episodeNumber,
      sequence: episodeNumber,
      createdAt,
    };
  });

  const html = renderProjectDetail({
    state: {
      project: { id: "project-episodes", name: "龙珠", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-episodes", projectId: "project-episodes", name: "龙珠", statusLabel: "分镜生成", aspectRatio: "9:16" },
        episodes,
        assetSummary: {
          character: { count: 3, previews: [] },
          scene: { count: 2, previews: [] },
          prop: { count: 1, previews: [] },
          other: { count: 1, previews: [] },
        },
        shots: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "overview",
    },
  });

  const overviewCards = [...html.matchAll(/data-action="open-episode-workbench"/g)];
  assert.equal(overviewCards.length, 12);
  assert.match(html, /<span>剧集<\/span>\s*<strong>14 集<\/strong>/);
  assert.match(html, /第 14 集/);
  assert.match(html, /第 3 集/);
  assert.doesNotMatch(html, /第 2 集/);
  assert.doesNotMatch(html, /第 1 集/);
});

test("project overview uses the default panel title, leaves placeholder names blank, and audio cards fall back to placeholders", () => {
  const assetHtml = renderProjectDetail({
    state: {
      project: { id: "project-try", name: "try", phase: "draft", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-try", projectId: "project-try", name: "try", statusLabel: "未开始", aspectRatio: "9:16" },
        episodes: [],
        assetSummary: {
          character: { count: 0, previews: [] },
          scene: { count: 0, previews: [] },
          prop: { count: 0, previews: [] },
          other: { count: 1, previews: ["/uploads/voice.mp3"] },
        },
        assetsByType: {
          character: [],
          scene: [],
          prop: [],
          other: {
            audio: [
              {
                id: "audio-1",
                name: "旁白",
                mimeType: "audio/mpeg",
                previewUrl: "/uploads/voice.mp3",
                sourceUrl: "/uploads/voice.mp3",
              },
            ],
            image: [],
            video: [],
          },
        },
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "assets",
      projectAssetTab: "other",
      projectOtherAssetMediaType: "audio",
    },
  });

  const overviewHtml = renderProjectDetail({
    state: {
      project: { id: "project-try", name: "try", phase: "draft", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-try", projectId: "project-try", name: "try", statusLabel: "未开始", aspectRatio: "9:16" },
        episodes: [],
        assetSummary: {
          character: { count: 0, previews: [] },
          scene: { count: 0, previews: [] },
          prop: { count: 0, previews: [] },
          other: { count: 1, previews: ["/uploads/voice.mp3"] },
        },
        assetsByType: {
          character: [],
          scene: [],
          prop: [],
          other: {
            audio: [
              {
                id: "audio-1",
                name: "旁白",
                mimeType: "audio/mpeg",
                previewUrl: "/uploads/voice.mp3",
                sourceUrl: "/uploads/voice.mp3",
              },
            ],
            image: [],
            video: [],
          },
        },
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "overview",
      projectOtherAssetMediaType: "audio",
    },
  });

  assert.match(overviewHtml, /project-overview-brief__title[\s\S]*<strong>工作台<\/strong>/);
  assert.match(overviewHtml, /<span>当前项目<\/span>\s*<strong><\/strong>/);
  assert.doesNotMatch(overviewHtml, /<span>项目<\/span>/);
  assert.doesNotMatch(overviewHtml, /<strong>try<\/strong>/);
  assert.doesNotMatch(overviewHtml, /try工作台/);
  assert.doesNotMatch(assetHtml, /try工作台/);
  assert.match(assetHtml, /project-audio-avatar/);
  assert.doesNotMatch(assetHtml, /<img[^>]+voice\.mp3/);
  assert.match(overviewHtml, /comic-art other/);
  assert.doesNotMatch(overviewHtml, /<img[^>]+voice\.mp3/);
});

test("project overview audio card prefers the audio cover image instead of the audio file url", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-audio-cover", name: "配音项目", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: {
          id: "project-audio-cover",
          projectId: "project-audio-cover",
          name: "配音项目",
          statusLabel: "资产准备",
          aspectRatio: "9:16",
        },
        episodes: [],
        assetSummary: {
          character: { count: 0, previews: [] },
          scene: { count: 0, previews: [] },
          prop: { count: 0, previews: [] },
          other: { count: 1, previews: ["/uploads/fallback-audio-preview.png"] },
        },
        assetsByType: {
          character: [],
          scene: [],
          prop: [],
          other: {
            audio: [
              {
                id: "audio-cover-1",
                name: "片头旁白",
                mimeType: "audio/mpeg",
                previewUrl: "/uploads/narration.mp3",
                sourceUrl: "/uploads/narration.mp3",
                latestVersion: {
                  metadata: {
                    mimeType: "audio/mpeg",
                    fixedImageUrl: "/uploads/narration-cover.png",
                  },
                },
              },
            ],
            image: [],
            video: [],
          },
        },
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "overview",
      projectOtherAssetMediaType: "audio",
    },
  });

  assert.match(html, /<img[^>]+narration-cover\.png/);
  assert.doesNotMatch(html, /<img[^>]+narration\.mp3/);
});

test("project overview leaves current project blank when no project name is available", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-empty", name: "", phase: "draft", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-empty", projectId: "project-empty", name: "", statusLabel: "未开始", aspectRatio: "9:16" },
        episodes: [],
        assetSummary: {
          character: { count: 0, previews: [] },
          scene: { count: 0, previews: [] },
          prop: { count: 0, previews: [] },
          other: { count: 0, previews: [] },
        },
        assetsByType: {
          character: [],
          scene: [],
          prop: [],
          other: { audio: [], image: [], video: [] },
        },
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "overview",
    },
  });

  assert.match(html, /<span>当前项目<\/span>\s*<strong><\/strong>/);
});
