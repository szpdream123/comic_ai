import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCanvasCharacterLibraryController,
  ensureCanvasCharacterLibraryState,
  normalizeCharacterAvatarCrop,
  renderCanvasCharacterLibraryShell,
} from "../src/features/new-canvas/character-library-drawer.js";

test("character library renders a canvas workspace without a global asset scope", () => {
  const ui = {
    selectedCanvasNodeId: "image-1",
    canvasDocument: {
      nodes: [{ id: "image-1", type: "image", data: { title: "主角立绘", previewUrl: "/hero.png" } }],
    },
  };
  const state = ensureCanvasCharacterLibraryState(ui);
  Object.assign(state, {
    open: true,
    characters: [{
      id: "character-1",
      name: "任小野",
      usage: "主角",
      prompt: "清瘦少年，旧布短衣",
      primaryVisualUrl: "/hero-main.png",
      avatarUrl: "/hero-avatar.png",
      revision: 1,
      referenceImages: [
        { id: "front", label: "正面", url: "/hero-front.png", sourceNodeId: "image-1", primary: true, avatar: true },
        { id: "side", label: "侧面", url: "/hero-side.png" },
      ],
    }],
    selectedCharacterId: "character-1",
  });

  const html = renderCanvasCharacterLibraryShell(ui);
  assert.match(html, /role="dialog" aria-modal="true" aria-label="角色库"/);
  assert.match(html, /本画布/);
  assert.doesNotMatch(html, /全局资产/);
  assert.match(html, /官方资产库/);
  assert.match(html, /团队资产库/);
  assert.match(html, /data-character-field="query"/);
  assert.match(html, /从图片节点捕获/);
  assert.match(html, /多参考图画廊/);
  assert.match(html, /主角/);
  assert.match(html, /清瘦少年/);
  assert.doesNotMatch(html, /复制到全局资产/);
  assert.match(html, /定位来源节点/);
});

test("avatar crop is normalized and constrained to the source image", () => {
  assert.deepEqual(normalizeCharacterAvatarCrop({ x: -1, y: 0.9, width: 0.4, height: 0.4 }), {
    x: 0,
    y: 0.6,
    width: 0.4,
    height: 0.4,
  });
  assert.deepEqual(normalizeCharacterAvatarCrop({ x: 0.2, y: 0.3, width: 3, height: 0 }), {
    x: 0,
    y: 0.3,
    width: 1,
    height: 0.05,
  });
});

test("character library loads official and team character assets inside the same workspace", async () => {
  const calls = [];
  const workbench = {
    ui: { selectedCanvasProjectId: "canvas-1" },
    api: {
      async getLibraryAssets(input) {
        calls.push(input);
        return {
          assets: Array.from({ length: 13 }, (_, index) => ({
            id: `official-character-${index + 1}`,
            category: "character",
            name: index === 0 ? "官方医生" : `官方角色${index + 1}`,
            folder: "国内仿真人-现代都市",
            previewUrl: `/character-${index + 1}.png`,
            tags: ["现代都市"],
          })),
        };
      },
    },
  };
  const controller = createCanvasCharacterLibraryController({ surface: { querySelector: () => null }, workbench });

  await controller.handleAction({ dataset: { characterAction: "scope", characterScope: "official" } });
  const state = ensureCanvasCharacterLibraryState(workbench.ui);
  const officialCharacterId = state.characters[0].id;
  assert.deepEqual(calls[0], { scope: "official", category: "character" });
  assert.equal(state.characters[0].libraryScope, "official");
  assert.equal(state.characters[0].libraryAsset.folder, "国内仿真人-现代都市");
  state.open = true;
  state.selectedCharacterId = state.characters[0].id;
  const html = renderCanvasCharacterLibraryShell(workbench.ui);
  assert.match(html, /官方资产库/);
  assert.match(html, /官方医生/);
  assert.match(html, /资产分类/);
  assert.match(html, /data-character-category="character"/);
  assert.match(html, /data-character-category="scene"/);
  assert.match(html, /data-character-category="prop"/);
  assert.match(html, /data-character-category="voice"/);
  assert.match(html, /全部/);
  assert.match(html, /资产分页/);
  assert.match(html, /1 \/ 2/);
  assert.doesNotMatch(html, /官方角色13/);
  assert.doesNotMatch(html, /资产详情来自/);

  await controller.handleAction({ dataset: { characterAction: "library-page", characterPage: "2" } });
  assert.match(renderCanvasCharacterLibraryShell(workbench.ui), /官方角色13/);

  await controller.handleAction({ dataset: { characterAction: "library-detail-open", characterId: officialCharacterId } });
  assert.match(renderCanvasCharacterLibraryShell(workbench.ui), /国内仿真人-现代都市/);
  assert.match(renderCanvasCharacterLibraryShell(workbench.ui), /TEAM ASSET|OFFICIAL ASSET/);
  assert.match(renderCanvasCharacterLibraryShell(workbench.ui), /canvas-character-library-detail-overlay/);
  await controller.handleAction({ dataset: { characterAction: "library-detail-close" } });

  state.scope = "team";
  state.characters = [{
    id: "library-character:team:team-1",
    name: "团队角色",
    libraryScope: "team",
    libraryAsset: { folder: "未分类" },
    primaryVisualUrl: "/team-character.png",
    avatarUrl: "/team-character.png",
  }];
  state.libraryFolders = [];
  state.libraryEntitlement = { hasTeamAssetLibrary: true };
  const teamHtml = renderCanvasCharacterLibraryShell(workbench.ui);
  assert.match(teamHtml, /data-character-category="all">全部/);
  assert.match(teamHtml, /data-character-action="library-folder" data-character-folder="">全部/);
  state.characters = [];
  state.libraryEntitlement = { hasTeamAssetLibrary: false };
  assert.match(renderCanvasCharacterLibraryShell(workbench.ui), /团队资产库为专业版会员权益/);
  controller.dispose();
});

test("canvas library switches team asset categories and reloads the selected category", async () => {
  const calls = [];
  const workbench = {
    ui: {},
    api: {
      async getLibraryAssets(input) {
        calls.push(input);
        const assetCategory = input.category ?? "character";
        return {
          folders: [assetCategory === "scene" ? "国内仿真人-现代都市" : "未分类"],
          assets: [{ id: `${assetCategory}-1`, category: assetCategory, name: `${assetCategory}资产`, folder: assetCategory === "scene" ? "国内仿真人-现代都市" : "未分类" }],
        };
      },
    },
  };
  const controller = createCanvasCharacterLibraryController({ surface: { querySelector: () => null }, workbench });

  await controller.handleAction({ dataset: { characterAction: "scope", characterScope: "team" } });
  await controller.handleAction({ dataset: { characterAction: "library-category", characterCategory: "scene" } });
  await controller.handleAction({ dataset: { characterAction: "library-category", characterCategory: "all" } });

  const state = ensureCanvasCharacterLibraryState(workbench.ui);
  assert.deepEqual(calls, [
    { scope: "team", category: "character" },
    { scope: "team", category: "scene" },
    { scope: "team" },
  ]);
  assert.equal(state.libraryCategory, "all");
  assert.equal(state.characters[0].libraryAsset.category, "character");
  assert.equal(state.libraryFolders[0], "未分类");
});

test("character controller uses workbench api for revisioned CRUD, scope copy, capture, delete restore, and node focus contracts", async () => {
  const calls = [];
  const characters = [{
    id: "character-1",
    name: "任小野",
    scope: "canvas",
    revision: 1,
    references: [{ id: "reference-1", position: 0, usage: "reference", prompt: "", crop: { x: 0, y: 0, width: 1, height: 1, unit: "ratio" }, primary: true, avatar: true, storageObjectId: "storage-1", assetId: null, assetVersionId: null, sourceNodeId: "image-1", sourceSnapshot: {}, previewUrl: "/hero.png" }],
  }];
  const node = { id: "image-1", type: "image", data: { title: "捕获角色", prompt: "红色披风", previewUrl: "/hero.png", storageObjectId: "storage-1" } };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      selectedCanvasNodeId: "image-1",
      canvasDocument: { nodes: [node] },
    },
    api: {
      async listCanvasCharacters(canvasId, input) {
        calls.push(["list", canvasId, input]);
        return { characters };
      },
      async createCanvasCharacter(canvasId, input) {
        calls.push(["create", canvasId, input]);
        return { character: { id: "character-created", ...input } };
      },
      async updateCanvasCharacter(canvasId, id, input) {
        calls.push(["update", canvasId, id, input]);
        return { character: { ...characters[0], id, revision: 2, ...input.patch } };
      },
      async deleteCanvasCharacter(canvasId, id, input) {
        calls.push(["delete", canvasId, id, input]);
        return { characterId: id, sourceNodeIds: ["image-1"] };
      },
      async copyCanvasCharacter(canvasId, id, input) {
        calls.push(["copy", canvasId, id, input]);
        return { character: { id: "global-copy", name: "任小野", scope: input.targetScope } };
      },
      async addCanvasCharacterReference(canvasId, id, input) {
        calls.push(["add-reference", canvasId, id, input]);
        return { character: { ...characters[0], revision: input.expectedRevision + 1 } };
      },
      async updateCanvasCharacterReference(canvasId, id, referenceId, input) {
        calls.push(["update-reference", canvasId, id, referenceId, input]);
        return { character: { ...characters[0], revision: input.expectedRevision + 1 } };
      },
      async deleteCanvasCharacterReference(canvasId, id, referenceId, input) {
        calls.push(["delete-reference", canvasId, id, referenceId, input]);
        return { revision: input.expectedRevision + 1 };
      },
    },
    async applyCharacterNodeCapture(input) { calls.push(["apply-capture", input]); },
    async restoreCharacterNodes(nodeIds) { calls.push(["restore-nodes", nodeIds]); },
    async focusCharacterNode(nodeId) { calls.push(["focus-node", nodeId]); },
  };
  const controller = createCanvasCharacterLibraryController({ surface: { querySelector: () => null }, workbench });

  await controller.handleAction({ dataset: { characterAction: "open" } });
  assert.deepEqual(calls[0], ["list", "canvas-1", { scope: "canvas", limit: 200 }]);
  assert.equal(typeof workbench.onCharacterCapture, "function");
  assert.equal(workbench.onCharacterCapture(node), true);
  await new Promise((resolve) => setImmediate(resolve));
  const state = ensureCanvasCharacterLibraryState(workbench.ui);
  assert.equal(state.draft.name, "捕获角色");
  assert.equal(state.draft.references[0]?.storageObjectId, "storage-1");
  await controller.handleAction({ dataset: { characterAction: "save" } });

  state.selectedCharacterId = "character-1";
  await controller.handleAction({ dataset: { characterAction: "edit", characterId: "character-1" } });
  state.draft.name = "任小野·新版";
  await controller.handleAction({ dataset: { characterAction: "save" } });
  await controller.handleAction({ dataset: { characterAction: "copy-scope", characterId: "character-1" } });
  await controller.handleAction({ dataset: { characterAction: "focus", characterId: "character-1" } });
  await controller.handleAction({ dataset: { characterAction: "delete", characterId: "character-1" } });
  await controller.handleAction({ dataset: { characterAction: "confirm-delete" } });

  assert.ok(calls.some((call) => call[0] === "create" && call[2].references[0].sourceNodeId === "image-1"));
  assert.ok(calls.some((call) => call[0] === "create" && !("previewUrl" in call[2].references[0])));
  assert.ok(calls.some((call) => call[0] === "apply-capture" && call[1].nodeId === "image-1" && call[1].characterId === "character-created"));
  assert.ok(calls.some((call) => call[0] === "update" && call[3].expectedRevision === 1 && call[3].patch.name === "任小野·新版"));
  assert.ok(calls.some((call) => call[0] === "copy" && call[3].expectedRevision === 1 && call[3].targetScope === "global"));
  assert.ok(calls.some((call) => call[0] === "focus-node" && call[1] === "image-1"));
  assert.ok(calls.some((call) => call[0] === "delete" && call[2] === "character-1" && call[3].expectedRevision === 1));
  assert.ok(calls.some((call) => call[0] === "restore-nodes" && call[1][0] === "image-1"));
  controller.dispose();
  assert.equal(workbench.onCharacterCapture, undefined);
});

test("character capture hydrates an AI image reference from its generation task", async () => {
  const storageObjectId = "10000000-0000-7000-8000-000000000123";
  const taskId = "20000000-0000-4000-8000-000000000456";
  const previewUrl = `https://example.test/generated-${taskId}.png`;
  const calls = [];
  const node = {
    id: "ai-image-1",
    type: "ai-image",
    data: {
      title: "AI 图片",
      prompt: "角色设定图",
      generationTaskId: taskId,
      previewUrl,
    },
  };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      selectedCanvasNodeId: node.id,
      canvasDocument: { nodes: [node] },
    },
    api: {
      async listCanvasCharacters() { return { characters: [] }; },
      async getGenerationTask(requestedTaskId) {
        calls.push(["get-generation-task", requestedTaskId]);
        return { taskId, result: { storageObjectId, imageUrl: previewUrl } };
      },
    },
  };
  const controller = createCanvasCharacterLibraryController({ surface: { querySelector: () => null }, workbench });

  assert.equal(workbench.onCharacterCapture(node), true);
  await new Promise((resolve) => setImmediate(resolve));

  const state = ensureCanvasCharacterLibraryState(workbench.ui);
  assert.deepEqual(calls, [["get-generation-task", taskId]]);
  assert.equal(state.draft.references.length, 1);
  assert.equal(state.draft.references[0]?.storageObjectId, storageObjectId);
  assert.match(renderCanvasCharacterLibraryShell(workbench.ui), /1 张参考图/);
  assert.match(renderCanvasCharacterLibraryShell(workbench.ui), new RegExp(`generated-${taskId}\\.png`));
  controller.dispose();
});

test("character library styles wrap asset cards and keep details in a bounded modal", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  assert.match(css, /\.canvas-character-library-backdrop\s*\{[\s\S]*?inset:\s*0/);
  assert.match(css, /\.canvas-character-library\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%/);
  assert.match(css, /\.canvas-character-strip\.is-library-grid\s*\{[\s\S]*?display:\s*grid[\s\S]*?repeat\(auto-fill, minmax\(210px, 1fr\)\)/);
  assert.match(css, /\.canvas-character-library-pagination\s*\{/);
  assert.match(css, /\.canvas-character-library-detail-overlay\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /\.canvas-character-library-detail-dialog\s*\{[\s\S]*?width:\s*min\(900px, 100%\)/);
  assert.doesNotMatch(css, /\.canvas-character-library-readonly/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.canvas-character-library-backdrop\s*\{[\s\S]*?position:\s*fixed/);
});

test("new canvas host mounts, dispatches, and disposes the character library controller", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  assert.match(source, /createCanvasCharacterLibraryController\(\{ surface, workbench \}\)/);
  assert.match(source, /renderCanvasCharacterLibraryShell\(workbench\.ui\)/);
  assert.match(source, /closest\?\.\("\[data-character-action\]"\)/);
  assert.match(source, /characterLibraryController\.handleInput\(event\.target\)/);
  assert.match(source, /characterLibraryController\.handleKeydown\(event, event\.target\)/);
  assert.match(source, /characterLibraryController\.dispose\(\)/);
});
