import assert from "node:assert/strict";
import test from "node:test";

import { renderProjectDetail, renderSingleEpisodeAiPreview } from "../src/features/production-workbench/project-detail.js";
import { renderEpisodeWorkbench } from "../src/features/production-workbench/episode-workbench-rebuilt.js";
import * as productionWorkbenchModule from "../src/features/production-workbench/index.js";
import * as onboardingGuideModule from "../src/features/production-workbench/first-login-onboarding.js";
import {
  advanceFirstLoginGuide,
  consumeFirstLoginOnboarding,
  createFirstLoginGuideState,
  initializeFirstLoginGuide,
  markFirstLoginOnboarding,
  moveFirstLoginGuide,
  reduceFirstLoginGuideAction,
  renderFirstLoginGuide,
  normalizeFirstLoginOnboardingConfig,
  resolveFirstLoginGuideTargetKey,
  advanceFirstLoginTipForTargetAction,
  reduceFirstLoginTipTargetAction,
} from "../src/features/production-workbench/first-login-onboarding.js";
import {
  handleProductionWorkbenchAction,
  initProductionWorkbench,
} from "../src/features/production-workbench/index.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    values,
  };
}

function createGuideTipState({ id = "target-tip", placement, targetKey, nextStep }) {
  const config = normalizeFirstLoginOnboardingConfig({
    tips: [{
      id,
      placement,
      targetKey,
      eyebrow: "位置提示",
      title: "查看高亮区域",
      description: "这里是当前步骤需要了解的功能。",
      primaryButton: "下一步",
    }],
  });
  return {
    ...createFirstLoginGuideState(true, config),
    step: "tip",
    tipId: id,
    nextStep,
  };
}

test("only a newly registered user receives the one-time onboarding flag", () => {
  const storage = createStorage();

  markFirstLoginOnboarding({
    isNewUser: false,
    user: { id: "existing-user" },
  }, storage);
  assert.equal(storage.values.size, 0);

  markFirstLoginOnboarding({
    isNewUser: true,
    user: { id: "new-user" },
  }, storage);
  assert.equal(storage.values.size, 1);

  const session = consumeFirstLoginOnboarding({
    authenticated: true,
    user: { id: "new-user", actorType: "user", teamMember: null },
  }, storage);

  assert.equal(session.firstLoginOnboarding, true);
  assert.equal(storage.values.size, 0);
});

test("a one-time marker cannot activate onboarding for another user or a team member", () => {
  const mismatchedStorage = createStorage();
  markFirstLoginOnboarding({
    isNewUser: true,
    user: { id: "new-user" },
  }, mismatchedStorage);

  const mismatchedSession = consumeFirstLoginOnboarding({
    authenticated: true,
    user: { id: "existing-user", actorType: "user", teamMember: null },
  }, mismatchedStorage);
  assert.equal(mismatchedSession.firstLoginOnboarding, undefined);
  assert.equal(mismatchedStorage.values.size, 0);

  const teamStorage = createStorage();
  markFirstLoginOnboarding({
    isNewUser: true,
    user: { id: "new-user" },
  }, teamStorage);
  const teamSession = consumeFirstLoginOnboarding({
    authenticated: true,
    user: { id: "new-user", actorType: "team_member", teamMember: { id: "member-1" } },
  }, teamStorage);
  assert.equal(teamSession.firstLoginOnboarding, undefined);
  assert.equal(teamStorage.values.size, 0);
});

test("the guide has a short welcome and supports dismissal", () => {
  const state = createFirstLoginGuideState(true);
  const html = renderFirstLoginGuide(state);

  assert.equal(state.step, "welcome");
  assert.match(html, /2分钟完成你的第一组分镜/);
  assert.match(html, /data-action="start-first-login-guide"/);
  assert.match(html, /data-action="dismiss-first-login-guide"/);
  assert.equal(renderFirstLoginGuide(createFirstLoginGuideState(false)), "");
});

test("the compact guide explains only the basic creation path", () => {
  const createProjectState = moveFirstLoginGuide(createFirstLoginGuideState(true), "create-project");
  const projectHtml = renderFirstLoginGuide(createProjectState);
  assert.match(projectHtml, /创建一个项目/);
  assert.match(projectHtml, /1\/4/);

  const prepareScriptState = moveFirstLoginGuide(createProjectState, "prepare-script");
  const scriptHtml = renderFirstLoginGuide(prepareScriptState);
  assert.match(scriptHtml, /data-action="first-login-use-sample-script"/);
  assert.match(scriptHtml, /data-action="first-login-use-own-script"/);

  const completeState = moveFirstLoginGuide(prepareScriptState, "complete");
  const completeHtml = renderFirstLoginGuide(completeState);
  assert.match(completeHtml, /第一组分镜已完成/);
  assert.doesNotMatch(completeHtml, /生成视频|生成图片/);
});

test("workbench guide actions activate only for an eligible first-login session", () => {
  assert.equal(initializeFirstLoginGuide({ authenticated: true, user: { id: "old-user" } }), null);

  const welcome = initializeFirstLoginGuide({
    authenticated: true,
    firstLoginOnboarding: true,
    user: { id: "new-user", actorType: "user" },
  });
  assert.equal(welcome.step, "welcome");

  const started = reduceFirstLoginGuideAction(welcome, "start-first-login-guide");
  assert.equal(started.handled, true);
  assert.equal(started.state.step, "create-project");

  const dismissed = reduceFirstLoginGuideAction(started.state, "dismiss-first-login-guide");
  assert.equal(dismissed.handled, true);
  assert.equal(dismissed.state, null);
});

test("starting the guide opens the project library and highlights its create button instead of the home CTA", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const location = { hash: "#home", pathname: "/", search: "" };
  const root = {
    innerHTML: "",
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  globalThis.window = {
    location,
    history: {
      replaceState() {},
      pushState(_state, _title, path) {
        location.pathname = path;
        location.hash = "";
      },
    },
    addEventListener() {},
    requestAnimationFrame(callback) { return setTimeout(callback, 0); },
    cancelAnimationFrame(timer) { clearTimeout(timer); },
    setTimeout,
    clearTimeout,
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
  };
  globalThis.document = {
    documentElement: { dataset: {} },
    head: { appendChild() {} },
    addEventListener() {},
    createElement() {
      return { setAttribute() {} };
    },
    querySelector() { return null; },
  };

  try {
    const session = {
      authenticated: true,
      firstLoginOnboarding: true,
      user: { id: "new-user", actorType: "user", phone: "13800138000" },
    };
    const workbench = await initProductionWorkbench({
      root,
      session,
      api: {
        async getProjects() {
          return {
            projects: [],
            pagination: { page: 1, pageSize: 18, total: 0, totalPages: 1 },
          };
        },
      },
      deferInitialRender: true,
    });

    await handleProductionWorkbenchAction(workbench, {
      dataset: { action: "start-first-login-guide" },
    });

    assert.equal(workbench.ui.activeNavTab, "project");
    assert.equal(workbench.ui.projectPanelMode, "library");
    assert.equal(location.pathname, "/projects");
    assert.match(root.innerHTML, /data-scroll-surface="project"/);
    assert.match(
      root.innerHTML,
      /class="[^"]*gallery-create-button[^"]*first-login-guide-target[^"]*"[^>]*data-action="open-create-modal"/,
    );

    const homeHtml = renderProjectDetail({
      state: {},
      ui: {
        activeNavTab: "home",
        firstLoginGuide: workbench.ui.firstLoginGuide,
      },
      session,
    });
    assert.doesNotMatch(
      homeHtml,
      /class="[^"]*hero-cta[^"]*first-login-guide-target[^"]*"[^>]*data-action="open-create-modal"/,
    );
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test("sample and own-script actions enter the same basic flow with different script seeds", () => {
  const prepareScript = moveFirstLoginGuide(createFirstLoginGuideState(true), "prepare-script");
  const sample = reduceFirstLoginGuideAction(prepareScript, "first-login-use-sample-script");
  const own = reduceFirstLoginGuideAction(prepareScript, "first-login-use-own-script");

  assert.equal(sample.openSingleEpisode, true);
  assert.match(sample.script, /场景：/);
  assert.equal(sample.state.step, "generate-storyboard");
  assert.equal(own.openSingleEpisode, true);
  assert.equal(own.script, "");
  assert.equal(own.state.step, "generate-storyboard");
});

test("the guide is mounted in the workbench only while its state is active", () => {
  const session = { authenticated: true, user: { id: "new-user", phone: "13800138000" } };
  const inactiveHtml = renderProjectDetail({ state: {}, ui: { activeNavTab: "home" }, session });
  const activeHtml = renderProjectDetail({
    state: {},
    ui: {
      activeNavTab: "home",
      firstLoginGuide: moveFirstLoginGuide(createFirstLoginGuideState(true), "create-project"),
    },
    session,
  });

  assert.doesNotMatch(inactiveHtml, /data-first-login-guide/);
  assert.match(activeHtml, /data-first-login-guide/);
});

test("real workbench success events advance the guide in order and failures never skip ahead", () => {
  let state = reduceFirstLoginGuideAction(
    createFirstLoginGuideState(true),
    "start-first-login-guide",
  ).state;

  assert.equal(advanceFirstLoginGuide(state, "project-opened").step, "create-project");
  state = advanceFirstLoginGuide(state, "project-created");
  assert.equal(state.step, "enter-project");
  state = advanceFirstLoginGuide(state, "project-opened");
  assert.equal(state.step, "prepare-script");
  state = advanceFirstLoginGuide(state, "episode-flow-opened");
  assert.equal(state.step, "generate-storyboard");
  state = advanceFirstLoginGuide(state, "generation-started");
  assert.equal(state.step, "generating");
  state = advanceFirstLoginGuide(state, "generation-failed");
  assert.equal(state.step, "generate-storyboard");
  state = advanceFirstLoginGuide(state, "generation-started");
  state = advanceFirstLoginGuide(state, "generation-ready");
  assert.equal(state.step, "confirm-storyboard");
  state = advanceFirstLoginGuide(state, "storyboard-committed");
  assert.equal(state.step, "complete");
});

test("new timeline placements run before script preparation, preview confirmation, and completion", () => {
  const makeTip = (id, placement, targetKey) => ({
    id,
    placement,
    targetKey,
    eyebrow: "位置提示",
    title: id,
    description: "检查当前高亮位置。",
    primaryButton: "下一步",
  });
  const config = normalizeFirstLoginOnboardingConfig({
    tips: [
      makeTip("find-episode-entry", "before-prepare-script", "create-first-episode-button"),
      makeTip("review-preview", "before-confirm-storyboard", "storyboard-preview-surface"),
      makeTip("find-workbench", "before-complete", "storyboard-workbench"),
    ],
  });

  let state = moveFirstLoginGuide(createFirstLoginGuideState(true, config), "enter-project");
  state = advanceFirstLoginGuide(state, "project-opened");
  assert.equal(state.tipId, "find-episode-entry");
  assert.equal(state.nextStep, "prepare-script");

  state = moveFirstLoginGuide(state, "generating");
  state = advanceFirstLoginGuide(state, "generation-ready");
  assert.equal(state.tipId, "review-preview");
  assert.equal(state.nextStep, "confirm-storyboard");

  state = moveFirstLoginGuide(state, "confirm-storyboard");
  state = advanceFirstLoginGuide(state, "storyboard-committed");
  assert.equal(state.tipId, "find-workbench");
  assert.equal(state.nextStep, "complete");
});

test("new timeline placements keep configured tip order before entering the core step", () => {
  const config = normalizeFirstLoginOnboardingConfig({
    tips: ["surface", "table"].map((id) => ({
      id: `preview-${id}`,
      placement: "before-confirm-storyboard",
      targetKey: id === "surface" ? "storyboard-preview-surface" : "storyboard-preview-table",
      eyebrow: "检查结果",
      title: `查看${id}`,
      description: "按配置顺序介绍结果。",
      primaryButton: "下一步",
    })),
  });
  let state = advanceFirstLoginGuide(
    moveFirstLoginGuide(createFirstLoginGuideState(true, config), "generating"),
    "generation-ready",
  );

  assert.equal(state.tipId, "preview-surface");
  state = reduceFirstLoginGuideAction(state, "next-first-login-tip").state;
  assert.equal(state.tipId, "preview-table");
  state = reduceFirstLoginGuideAction(state, "next-first-login-tip").state;
  assert.equal(state.step, "confirm-storyboard");
});

test("unavailable guide targets are skipped without blocking the next visible tip or core step", () => {
  assert.equal(typeof onboardingGuideModule.skipUnavailableFirstLoginTips, "function");
  const config = normalizeFirstLoginOnboardingConfig({
    tips: [
      {
        id: "missing-scene-table",
        placement: "before-confirm-storyboard",
        targetKey: "scene-preview-table",
        eyebrow: "检查结果",
        title: "查看场景",
        description: "查看生成的场景。",
        primaryButton: "下一步",
      },
      {
        id: "visible-commit",
        placement: "before-confirm-storyboard",
        targetKey: "commit-storyboard-button",
        eyebrow: "完成创建",
        title: "创建章节",
        description: "确认后创建章节。",
        primaryButton: "下一步",
      },
    ],
  });
  const firstTip = advanceFirstLoginGuide(
    moveFirstLoginGuide(createFirstLoginGuideState(true, config), "generating"),
    "generation-ready",
  );

  const visibleTip = onboardingGuideModule.skipUnavailableFirstLoginTips(firstTip, new Set(["commit-storyboard-button"]));
  assert.equal(visibleTip.tipId, "visible-commit");
  assert.deepEqual(visibleTip.completedTipIds, ["missing-scene-table"]);

  const coreStep = onboardingGuideModule.skipUnavailableFirstLoginTips(firstTip, new Set());
  assert.equal(coreStep.step, "confirm-storyboard");
  assert.deepEqual(coreStep.completedTipIds, ["missing-scene-table", "visible-commit"]);
});

test("single episode creation and ready preview expose every registered guide target", () => {
  const projectState = {
    project: { id: "project-1", name: "测试项目", aspectRatio: "9:16" },
    projectDetail: {
      project: { id: "project-1", projectId: "project-1", name: "测试项目" },
      episodes: [],
      assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      shots: [],
    },
  };
  const modalHtml = renderProjectDetail({
    state: projectState,
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "detail",
      projectInteriorSection: "episodes",
      isSingleEpisodeModalOpen: true,
      singleEpisodeScript: "测试剧本",
      firstLoginGuide: createGuideTipState({
        placement: "before-generate-storyboard",
        targetKey: "script-input",
        nextStep: "generate-storyboard",
      }),
    },
  });

  for (const targetKey of ["script-input", "text-model-selector", "prompt-skill-selector", "generate-storyboard-button"]) {
    assert.match(modalHtml, new RegExp(`data-first-login-target="${targetKey}"`));
  }
  assert.match(modalHtml, /class="[^"]*single-episode-script-field[^"]*first-login-guide-target[^"]*"[^>]*data-first-login-target="script-input"/);

  const previewHtml = renderSingleEpisodeAiPreview({
    firstLoginGuide: createGuideTipState({
      placement: "before-confirm-storyboard",
      targetKey: "storyboard-preview-table",
      nextStep: "confirm-storyboard",
    }),
    singleEpisodeAiPreview: {
      status: "ready",
      data: {
        displayTables: {
          scenes: { title: "场景", rows: [{ sceneName: "天台" }] },
          characters: { title: "角色", rows: [{ characterName: "林夏" }] },
          props: { title: "道具", rows: [{ propName: "信" }] },
          storyboards: { title: "分镜", rows: [{ shotNo: 1, plot: "看向远方" }] },
        },
      },
    },
  });

  for (const targetKey of [
    "storyboard-preview-surface",
    "scene-preview-table",
    "character-preview-table",
    "prop-preview-table",
    "storyboard-preview-table",
    "commit-storyboard-button",
  ]) {
    assert.match(previewHtml, new RegExp(`data-first-login-target="${targetKey}"`));
  }
  assert.match(previewHtml, /class="[^"]*storyboards[^"]*first-login-guide-target[^"]*"[^>]*data-first-login-target="storyboard-preview-table"/);
});

test("post-render target reconciliation skips missing tips and keeps a visible target", () => {
  assert.equal(typeof productionWorkbenchModule.reconcileFirstLoginGuideTargets, "function");
  const firstLoginGuide = advanceFirstLoginGuide(
    moveFirstLoginGuide(createFirstLoginGuideState(true, normalizeFirstLoginOnboardingConfig({
      tips: [
        {
          id: "missing-preview",
          placement: "before-confirm-storyboard",
          targetKey: "scene-preview-table",
          eyebrow: "场景",
          title: "查看场景",
          description: "场景为空时应自动跳过。",
          primaryButton: "下一步",
        },
        {
          id: "visible-commit",
          placement: "before-confirm-storyboard",
          targetKey: "commit-storyboard-button",
          eyebrow: "提交",
          title: "创建章节",
          description: "这个目标当前可见。",
          primaryButton: "下一步",
        },
      ],
    })), "generating"),
    "generation-ready",
  );
  const workbench = {
    ui: { firstLoginGuide },
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, "[data-first-login-target]");
        return [{
          dataset: { firstLoginTarget: "commit-storyboard-button" },
          hidden: false,
          getClientRects() { return [{}]; },
        }];
      },
    },
  };

  const changed = productionWorkbenchModule.reconcileFirstLoginGuideTargets(workbench);

  assert.equal(changed, true);
  assert.equal(workbench.ui.firstLoginGuide.tipId, "visible-commit");
});

test("episode workbench exposes completion guide targets", () => {
  const html = renderEpisodeWorkbench({
    episodeId: "episode-1",
    episodeTitle: "第一集",
    storyboards: [{ id: "storyboard-1", index: 1, title: "开场", description: "城市天台" }],
    selectedStoryboard: { id: "storyboard-1" },
    firstLoginGuideTargetKey: "first-storyboard-card",
  });

  assert.match(html, /id="storyboard-workbench"/);
  assert.match(html, /data-first-login-target="first-storyboard-card"/);
  assert.match(html, /class="[^\"]*episode-replica-shot-shell[^\"]*first-login-guide-target[^\"]*"/);
});

test("configured copy is merged safely and escaped before rendering", () => {
  const config = normalizeFirstLoginOnboardingConfig({
    welcome: { title: "三分钟上手 <script>alert(1)</script>" },
    steps: { createProject: { description: "从这里创建 & 开始" } },
  });
  const welcome = createFirstLoginGuideState(true, config);
  const welcomeHtml = renderFirstLoginGuide(welcome);
  assert.match(welcomeHtml, /三分钟上手 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(welcomeHtml, /<script>alert/);

  const createProject = reduceFirstLoginGuideAction(welcome, "start-first-login-guide").state;
  assert.match(renderFirstLoginGuide(createProject), /从这里创建 &amp; 开始/);
});

test("ordered informational tips run before a core step and advance only with next", () => {
  const config = normalizeFirstLoginOnboardingConfig({
    tips: [
      {
        id: "create-location",
        placement: "before-create-project",
        targetKey: "create-project-button",
        eyebrow: "工具位置",
        title: "先找到创建入口",
        description: "页面下方的高亮按钮就是入口。",
        primaryButton: "下一步",
      },
      {
        id: "create-location-2",
        placement: "before-create-project",
        targetKey: "create-project-button",
        eyebrow: "再确认一下",
        title: "它会一直保持高亮",
        description: "点击下一步后再开始创建。",
        primaryButton: "继续",
      },
    ],
  });
  let state = reduceFirstLoginGuideAction(
    createFirstLoginGuideState(true, config),
    "start-first-login-guide",
  ).state;

  assert.equal(state.step, "tip");
  assert.equal(state.tipId, "create-location");
  assert.equal(resolveFirstLoginGuideTargetKey(state), "create-project-button");
  assert.match(renderFirstLoginGuide(state), /先找到创建入口/);

  state = reduceFirstLoginGuideAction(state, "next-first-login-tip").state;
  assert.equal(state.step, "tip");
  assert.equal(state.tipId, "create-location-2");

  state = reduceFirstLoginGuideAction(state, "next-first-login-tip").state;
  assert.equal(state.step, "create-project");
  assert.equal(advanceFirstLoginGuide(state, "project-opened").step, "create-project");
});

test("closing the episode editor while a pre-generation tip is open returns to script preparation", () => {
  const config = normalizeFirstLoginOnboardingConfig({
    tips: [{
      id: "find-generate",
      placement: "before-generate-storyboard",
      targetKey: "generate-storyboard-button",
      eyebrow: "工具位置",
      title: "找到生成按钮",
      description: "高亮区域就是生成分镜按钮。",
      primaryButton: "下一步",
    }],
  });
  const prepare = moveFirstLoginGuide(createFirstLoginGuideState(true, config), "prepare-script");
  const tip = reduceFirstLoginGuideAction(prepare, "first-login-use-own-script").state;

  assert.equal(tip.step, "tip");
  assert.equal(tip.nextStep, "generate-storyboard");
  assert.equal(advanceFirstLoginGuide(tip, "editor-closed").step, "prepare-script");
});

test("clicking the highlighted tool completes its informational tip before the real action runs", () => {
  const config = normalizeFirstLoginOnboardingConfig({
    tips: [{
      id: "find-create",
      placement: "before-create-project",
      targetKey: "create-project-button",
      eyebrow: "工具位置",
      title: "找到创建入口",
      description: "也可以直接点击高亮工具。",
      primaryButton: "下一步",
    }],
  });
  const tip = reduceFirstLoginGuideAction(
    createFirstLoginGuideState(true, config),
    "start-first-login-guide",
  ).state;

  assert.equal(advanceFirstLoginTipForTargetAction(tip, "toggle-project-selection"), tip);
  const advanced = advanceFirstLoginTipForTargetAction(tip, "open-create-modal");
  assert.equal(advanced.step, "create-project");
  assert.deepEqual(advanced.completedTipIds, ["find-create"]);
});

test("clickable module and skill targets advance their tips before continuing the real action", () => {
  const cases = [
    ["before-create-project", "project-module-entry", "create-project", "set-nav-tab"],
    ["before-prepare-script", "episode-module-entry", "prepare-script", "set-project-interior-section"],
    ["before-generate-storyboard", "prompt-skill-selector", "generate-storyboard", "open-episode-prompt-skill-modal"],
  ];

  for (const [placement, targetKey, nextStep, action] of cases) {
    const state = createGuideTipState({ placement, targetKey, nextStep });
    const result = reduceFirstLoginTipTargetAction(state, action, targetKey);
    assert.equal(result.handled, true);
    assert.equal(result.allowAction, true);
    assert.equal(result.state.step, nextStep);
    assert.equal(reduceFirstLoginTipTargetAction(state, action, "another-navigation-target").handled, false);
  }
});

test("the highlighted tool waits until every tip at that placement is complete", () => {
  const config = normalizeFirstLoginOnboardingConfig({
    tips: ["a", "b"].map((id) => ({
      id: `find-generate-${id}`,
      placement: "before-generate-storyboard",
      targetKey: "generate-storyboard-button",
      eyebrow: "工具位置",
      title: `生成提示 ${id}`,
      description: "先看完同一位置的提示。",
      primaryButton: "下一步",
    })),
  });
  const prepare = moveFirstLoginGuide(createFirstLoginGuideState(true, config), "prepare-script");
  const firstTip = reduceFirstLoginGuideAction(prepare, "first-login-use-own-script").state;

  const firstClick = reduceFirstLoginTipTargetAction(firstTip, "confirm-single-episode", "generate-storyboard-button");
  assert.equal(firstClick.handled, true);
  assert.equal(firstClick.allowAction, false);
  assert.equal(firstClick.state.tipId, "find-generate-b");

  const secondClick = reduceFirstLoginTipTargetAction(firstClick.state, "confirm-single-episode", "generate-storyboard-button");
  assert.equal(secondClick.handled, true);
  assert.equal(secondClick.allowAction, true);
  assert.equal(secondClick.state.step, "generate-storyboard");
});

test("workbench initialization never waits for onboarding configuration before returning", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const root = {
    innerHTML: "",
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const windowStub = {
    location: { hash: "#home", pathname: "/", search: "" },
    history: { replaceState() {}, pushState() {} },
    addEventListener() {},
    requestAnimationFrame(callback) { return setTimeout(callback, 0); },
    cancelAnimationFrame(timer) { clearTimeout(timer); },
    setTimeout,
    clearTimeout,
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
  };
  globalThis.window = windowStub;
  globalThis.document = {
    documentElement: { dataset: {} },
    addEventListener() {},
    querySelector() { return null; },
  };
  let resolveConfig;
  const pendingConfig = new Promise((resolve) => { resolveConfig = resolve; });

  try {
    const race = await Promise.race([
      initProductionWorkbench({
        root,
        session: { authenticated: true, firstLoginOnboarding: true, user: { id: "new-user", actorType: "user" } },
        api: { getFirstLoginOnboardingConfig: () => pendingConfig },
        deferInitialRender: true,
      }).then(() => "returned"),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 40)),
    ]);
    assert.equal(race, "returned");
    resolveConfig({ welcome: { title: "异步标题" } });
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
