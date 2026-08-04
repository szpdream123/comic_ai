import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as productionWorkbench from "../src/features/production-workbench/index.js";
import { renderEpisodeAssetCardForTest } from "../src/features/production-workbench/episode-workbench-rebuilt.js";
import { renderAssetConversationEntryForPolling } from "../src/features/production-workbench/episode-workbench-rebuilt.js";

test("episode asset title is rendered as an enabled text editor", () => {
  const html = renderEpisodeAssetCardForTest({
    id: "asset-1",
    name: "玄衣修士",
    description: "角色描述",
  }, "character");
  const input = html.match(/<input class="[^"]*episode-replica-asset-name-input[^"]*"[^>]*>/)?.[0] ?? "";

  assert.match(input, /data-asset-id="asset-1"/);
  assert.match(input, /data-asset-kind="character"/);
  assert.match(input, /value="玄衣修士"/);
  assert.match(input, /maxlength="20"/);
  assert.doesNotMatch(input, /\b(?:disabled|readonly)\b/);
});

test("episode asset title only commits locally after the existing update API succeeds", async () => {
  assert.equal(typeof productionWorkbench.saveEpisodeAssetNameForTest, "function");

  const assetId = "a71c2367-d9fd-42ec-a2df-78b30c72f753";
  const calls = [];
  const workbench = {
    state: {
      project: { id: "project-1", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [{ id: "10000000-0000-4000-8000-000000000001", title: "真实剧集" }],
        assetsByType: { character: [], scene: [], prop: [] },
        shots: [],
      },
    },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "episode-workbench",
      projectInteriorSection: "episodes",
      selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
      museScopeMode: "assets",
      projectAssetTab: "character",
      selectedEpisodeAssetId: assetId,
      selectedEpisodeCardId: assetId,
      importedAssets: {
        character: [{ id: assetId, assetId, name: "玄衣修士", description: "角色描述" }],
        scene: [],
        prop: [],
        other: { image: [], video: [], audio: [] },
      },
    },
    api: {
      async updateEpisodeAsset(episodeId, targetAssetId, payload) {
        calls.push({ episodeId, targetAssetId, payload });
        return { asset: { assetId: targetAssetId, ...payload } };
      },
    },
    root: {
      innerHTML: "",
      querySelector() {
        return null;
      },
    },
    session: { user: { phone: "+86 13800138000" } },
  };

  await productionWorkbench.saveEpisodeAssetNameForTest(workbench, "character", assetId, "玄衣剑客");

  assert.deepEqual(calls, [{
    episodeId: "10000000-0000-4000-8000-000000000001",
    targetAssetId: assetId,
    payload: { name: "玄衣剑客" },
  }]);
  assert.equal(workbench.ui.importedAssets.character[0]?.name, "玄衣剑客");
  assert.equal(workbench.ui.toast, "修改成功");

  workbench.api.updateEpisodeAsset = async () => {
    throw new Error("save failed");
  };
  await productionWorkbench.saveEpisodeAssetNameForTest(workbench, "character", assetId, "未保存标题");

  assert.equal(workbench.ui.importedAssets.character[0]?.name, "玄衣剑客");
  assert.equal(workbench.ui.toast, "资产名称保存失败。");
});

test("episode asset title rejects an empty value without overwriting the asset", async () => {
  const assetId = "asset-1";
  const workbench = {
    state: {},
    ui: {
      importedAssets: {
        character: [{ id: assetId, assetId, name: "玄衣修士", description: "角色描述" }],
        scene: [],
        prop: [],
        other: { image: [], video: [], audio: [] },
      },
    },
    root: {
      innerHTML: "",
      querySelector() {
        return null;
      },
    },
  };

  await productionWorkbench.saveEpisodeAssetNameForTest(workbench, "character", assetId, "   ");

  assert.equal(workbench.ui.importedAssets.character[0]?.name, "玄衣修士");
  assert.equal(workbench.ui.toast, "资产名称不能为空。");
});

test("episode asset title saves when the editor loses focus", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  const previousElement = globalThis.Element;
  const previousNode = globalThis.Node;
  const listeners = new Map();
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  class FakeElement {}
  class FakeNode {}

  try {
    globalThis.Element = FakeElement;
    globalThis.Node = FakeNode;
    globalThis.localStorage = storage;
    globalThis.window = {
      location: { hash: "#project", pathname: "/project", protocol: "http:", host: "127.0.0.1:4310" },
      localStorage: storage,
      addEventListener() {},
    };
    globalThis.document = {
      addEventListener() {},
      removeEventListener() {},
      body: { classList: { toggle() {} }, setAttribute() {} },
    };
    const root = {
      innerHTML: "",
      addEventListener(type, listener) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
    const calls = [];
    const workbench = await productionWorkbench.initProductionWorkbench({
      root,
      session: { authenticated: false, user: null },
      api: {},
      onLogout() {},
      deferInitialRender: true,
    });
    const assetId = "a71c2367-d9fd-42ec-a2df-78b30c72f753";
    workbench.state = {
      project: { id: "project-1", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [{ id: "10000000-0000-4000-8000-000000000001", title: "真实剧集" }],
        assetsByType: { character: [], scene: [], prop: [] },
        shots: [],
      },
    };
    Object.assign(workbench.ui, {
      activeNavTab: "project",
      projectPanelMode: "episode-workbench",
      projectInteriorSection: "episodes",
      selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
      importedAssets: {
        character: [{ id: assetId, assetId, name: "玄衣修士", description: "角色描述" }],
        scene: [],
        prop: [],
        other: { image: [], video: [], audio: [] },
      },
    });
    workbench.api.updateEpisodeAsset = async (episodeId, targetAssetId, payload) => {
      calls.push({ episodeId, targetAssetId, payload });
    };
    const target = Object.assign(new FakeElement(), {
      dataset: { assetId, assetKind: "character" },
      value: "玄衣剑客",
      matches(selector) { return selector === ".episode-replica-asset-name-input"; },
    });

    for (const listener of listeners.get("focusout") ?? []) {
      await listener({ target, relatedTarget: null, composedPath: () => [target] });
    }

    assert.deepEqual(calls, [{
      episodeId: "10000000-0000-4000-8000-000000000001",
      targetAssetId: assetId,
      payload: { name: "玄衣剑客" },
    }]);
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("document", previousDocument);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("Element", previousElement);
    restoreGlobal("Node", previousNode);
  }
});

test("episode asset title focus styles follow the active workbench theme", () => {
  const css = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
  const focusBlock = css.match(/\.episode-replica-asset-name-input:focus\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

  assert.match(focusBlock, /var\(--theme-control-active-border/);
  assert.match(focusBlock, /var\(--theme-control-active-background/);
  assert.match(focusBlock, /box-shadow:/);
});

test("episode asset description editor supports 2500 characters and manual resizing", () => {
  const description = "角色描述".repeat(120);
  const html = renderEpisodeAssetCardForTest({
    id: "asset-1",
    name: "叙叔",
    description,
  }, "character");

  assert.match(html, /maxlength="2500"/);
  assert.match(html, />\s*480 \/ 2500\s*</);
  assert.doesNotMatch(html, /episode-replica-asset-full-popover/);
  assert.doesNotMatch(html, /\/ 800/);
});

test("episode asset description editor does not define a hover popover", () => {
  const css = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /episode-replica-asset-full-popover/);
});

test("episode asset description remains vertically scrollable in fixed-height desktop cards", () => {
  const css = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
  const fixedHeightBlock = css.match(
    /\.episode-replica-asset-desc-input\s*\{\s*min-height:\s*6\.85rem;(?<body>[^}]*)\}/,
  )?.groups?.body ?? "";

  assert.match(fixedHeightBlock, /max-height:\s*6\.85rem/);
  assert.match(fixedHeightBlock, /overflow-x:\s*hidden/);
  assert.match(fixedHeightBlock, /overflow-y:\s*auto/);
});

test("episode generation task meta only shows task id", () => {
  const html = renderAssetConversationEntryForPolling({
    taskId: "task-123",
    selectedModelId: "secret-provider-model",
    promptPreview: "测试提示词",
  });

  assert.match(html, /任务ID：task-123/);
  assert.doesNotMatch(html, /task-123\/|secret-provider-model|默认模型|GPT Image|Vidu|nano banana|海螺|Happy Horse/);
});

test("manual episode asset creation refreshes the current asset list", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const actionStart = source.indexOf('if (action === "save-episode-asset-create")');
  const actionEnd = source.indexOf('if (action === "open-delete-sidebar-storyboard-modal")', actionStart);
  const actionSource = source.slice(actionStart, actionEnd);

  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  assert.match(actionSource, /await ensureEpisodeWorkbenchAssetsHydrated\(workbench, \{ force: true \}\);/);
});

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
  } else {
    globalThis[name] = value;
  }
}
