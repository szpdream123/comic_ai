import assert from "node:assert/strict";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";
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
import { initProductionWorkbench } from "../src/features/production-workbench/index.js";

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

  const firstClick = reduceFirstLoginTipTargetAction(firstTip, "confirm-single-episode");
  assert.equal(firstClick.handled, true);
  assert.equal(firstClick.allowAction, false);
  assert.equal(firstClick.state.tipId, "find-generate-b");

  const secondClick = reduceFirstLoginTipTargetAction(firstClick.state, "confirm-single-episode");
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
