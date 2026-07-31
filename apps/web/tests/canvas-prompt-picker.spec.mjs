import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyCanvasPromptMentionSelectionForTest,
  applyCanvasPromptReferenceSelection,
  canvasPromptStorageValueForTest,
  handleWorkbenchActionForTest,
  loadCanvasPromptEditorSuggestionsForTest,
  loadCanvasPromptReferenceItems,
  persistCanvasPromptEditorChangeForTest,
  registerCanvasPromptEditorMentionForTest,
  resolveCanvasPromptMentionQueryForTest,
  updateCanvasPromptMentionStateForTest,
} from "../src/features/production-workbench/index.js";
import { renderCanvasPromptDisplayValue, renderCanvasPromptReferenceThumbnails, renderCanvasSurfaceForHost } from "../src/features/production-workbench/project-detail.js";
import { createDefaultCanvasDocument } from "../src/features/production-workbench/canvas/canvas-default-document.js";
import { addCanvasNode, updateCanvasNodeData } from "../src/features/production-workbench/canvas/canvas-state.js";
import { resolveCanvasPromptReferences } from "../src/features/production-workbench/canvas/canvas-prompt-reference.js";

test("Prompt Picker expands Canvas characters into stable single-reference and merge-all choices", async () => {
  const calls = [];
  const workbench = createWorkbench({
    async getLibraryAssets(input) {
      calls.push(["library", input]);
      return input.category === "character"
        ? { assets: [{ id: "shared-character", name: `${input.scope}角色`, description: `${input.scope}素材` }] }
        : { assets: [] };
    },
    async listCanvasCharacters(canvasId, input) {
      calls.push(["characters", canvasId, input]);
      return {
        characters: [{
          id: "character-1",
          name: "任小野",
          scope: "canvas",
          prompt: "清瘦少年，旧布短衣",
          references: [
            { id: "reference-front", usage: "正面", prompt: "正面全身", previewUrl: "https://signed.test/front?token=secret", primary: true },
            { id: "reference-side", usage: "侧面", prompt: "侧面半身", previewUrl: "https://signed.test/side?token=secret" },
          ],
        }],
      };
    },
  });

  const items = await loadCanvasPromptReferenceItems(workbench);
  const merged = items.find((item) => item.id === "canvas-character:character-1@all");
  const single = items.find((item) => item.id === "canvas-character:character-1@reference-side");
  assert.deepEqual(calls.find((call) => call[0] === "characters"), ["characters", "canvas-1", { limit: 200 }]);
  assert.equal(calls.filter((call) => call[0] === "library").length, 6);
  assert.ok(items.some((item) => item.id === "official:character:shared-character" && item.sourceGroup === "official"));
  assert.ok(items.some((item) => item.id === "team:character:shared-character" && item.sourceGroup === "team"));
  assert.equal(merged.referenceId, "character-1");
  assert.equal(merged.referenceVersion, "all");
  assert.equal(merged.referenceMode, "merge_all");
  assert.deepEqual(merged.referenceIds, ["reference-front", "reference-side"]);
  assert.deepEqual(merged.previewUrls, [
    "https://signed.test/front?token=secret",
    "https://signed.test/side?token=secret",
  ]);
  assert.match(merged.label, /合并全部参考图/);
  assert.equal(single.referenceVersion, "reference-side");
  assert.equal(single.referenceMode, "single");
  assert.equal(single.previewUrl, "https://signed.test/side?token=secret");
});

test("Prompt Picker persists stable character IDs, resolves all semantics, and creates a configured ai-image node without URLs", async () => {
  const workbench = createWorkbench();
  const mergedItem = {
    id: "canvas-character:character-1@all",
    group: "character",
    referenceType: "drama",
    referenceId: "character-1",
    referenceVersion: "all",
    referenceSource: "canvas_character",
    referenceMode: "merge_all",
    referenceIds: ["reference-front", "reference-side"],
    label: "任小野 · 合并全部参考图",
    prompt: "清瘦少年，正面全身，侧面半身",
    previewUrl: "https://signed.test/front?token=secret",
  };
  workbench.ui.canvasPromptReferencePicker = {
    open: true,
    nodeId: "source-node",
    selectedId: mergedItem.id,
    items: [mergedItem],
  };

  assert.equal(applyCanvasPromptReferenceSelection(workbench, { createNode: true }), true);
  const document = workbench.ui.canvasDocument;
  const sourceNode = document.nodes.find((node) => node.id === "source-node");
  const createdNode = document.nodes.find((node) => node.id !== "source-node");
  assert.equal(sourceNode.data.prompt, "原始描述 @drama:character-1@all");
  assert.equal(createdNode.type, "ai-image");
  assert.equal(createdNode.data.prompt, "@drama:character-1@all");
  assert.equal(createdNode.data.dramaCharacterId, "character-1");
  assert.equal(createdNode.data.dramaReferenceSelector, "all");
  assert.equal(createdNode.data.dramaReferenceMode, "merge_all");
  assert.deepEqual(createdNode.data.dramaReferenceIds, ["reference-front", "reference-side"]);
  assert.equal(workbench.ui.selectedCanvasNodeId, createdNode.id);
  assert.equal(workbench.ui.canvasPromptReferencePicker, null);
  assert.equal(
    resolveCanvasPromptReferences("@drama:character-1@all", document.promptReferenceCatalog, { strict: true }).expandedPrompt,
    "清瘦少年，正面全身，侧面半身",
  );
  const singleItem = {
    ...mergedItem,
    id: "canvas-character:character-1@reference-side",
    referenceVersion: "reference-side",
    referenceMode: "single",
    referenceIds: ["reference-side"],
    label: "任小野 · 侧面",
    prompt: "清瘦少年，侧面半身",
    previewUrl: "https://signed.test/side?token=second-secret",
  };
  workbench.ui.canvasPromptReferencePicker = {
    open: true,
    nodeId: "source-node",
    selectedId: singleItem.id,
    items: [singleItem],
  };
  assert.equal(applyCanvasPromptReferenceSelection(workbench), true);
  assert.deepEqual(
    Object.keys(workbench.ui.canvasDocument.promptReferenceCatalog.drama["character-1"].versions).sort(),
    ["all", "reference-side"],
  );
  const persisted = JSON.stringify(workbench.ui.canvasDocument);
  assert.doesNotMatch(persisted, /signed\.test|previewUrl|token=secret/);
  assert.doesNotMatch(persisted, /second-secret/);
});

test("Prompt Picker auto-connects an existing image node to a legacy AI Markdown input", () => {
  const workbench = createWorkbench();
  const imageNode = {
    id: "existing-image",
    type: "source-image",
    data: {
      title: "参考图片",
      mediaKind: "image",
      previewUrl: "/uploads/reference.png",
      ports: { inputs: [], outputs: [{ id: "out_image", kind: "image", label: "图片" }] },
    },
  };
  workbench.ui.canvasDocument = {
    ...workbench.ui.canvasDocument,
    nodes: workbench.ui.canvasDocument.nodes.map((node) => node.id === "source-node" ? {
      ...node,
      type: "ai-markdown",
      data: {
        ...node.data,
        mediaKind: "text",
        ports: {
          inputs: [{ id: "in_text", kind: "text", label: "文本" }],
          outputs: [{ id: "out_text", kind: "text", label: "Markdown" }],
        },
      },
    } : node).concat(imageNode),
    edges: [],
  };
  workbench.ui.canvasDocumentsByProject["canvas-1"] = workbench.ui.canvasDocument;
  workbench.ui.canvasPromptReferencePicker = {
    open: true,
    nodeId: "source-node",
    selectedId: "node:existing-image",
    items: [{
      id: "node:existing-image",
      group: "node",
      sourceGroup: "canvas",
      referenceType: "node",
      referenceId: "existing-image",
      label: "参考图片",
      previewUrl: "/uploads/reference.png",
    }],
  };

  assert.equal(applyCanvasPromptReferenceSelection(workbench), true);

  const document = workbench.ui.canvasDocument;
  const edge = document.edges.find((item) => item.sourceNodeId === "existing-image" && item.targetNodeId === "source-node");
  const target = document.nodes.find((node) => node.id === "source-node");
  assert.equal(edge.sourcePortId, "out_image");
  assert.equal(edge.targetPortId, "in_text");
  assert.equal(edge.data.kind, "image");
  assert.deepEqual(target.data.ports.inputs[0].accepts, ["text", "image"]);
  assert.equal(target.data.prompt, "原始描述 @node:existing-image");
  assert.equal(workbench.ui.toast, "已插入素材引用并自动连接节点。");
});

test("Prompt Picker selection updates the mounted Shadow DOM picker", async () => {
  const workbench = createWorkbench();
  const item = {
    id: "canvas-character:character-1@all",
    group: "character",
  };
  const option = {
    dataset: { pickerItemId: item.id },
    selected: false,
    classList: { toggle(_name, value) { option.selected = value; } },
    setAttribute(_name, value) { option.selected = value === "true"; },
  };
  const confirm = { disabled: true };
  const layer = {
    dataset: { selectionPickerId: "canvas-prompt-reference-picker" },
    querySelectorAll() { return [option]; },
    querySelector(selector) {
      return selector === ".selection-picker-confirm" ? confirm : null;
    },
  };
  workbench.ui.canvasPromptReferencePicker = {
    open: true,
    selectedId: "",
    items: [item],
  };
  workbench.newCanvasMount = { shadowRoot: { querySelectorAll() { return [layer]; } } };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "select-canvas-prompt-reference", pickerItemId: item.id },
  });

  assert.equal(workbench.ui.canvasPromptReferencePicker.selectedId, item.id);
  assert.equal(option.selected, true);
  assert.equal(confirm.disabled, false);
});

test("Prompt Picker ignores duplicate open actions while already visible", async () => {
  const workbench = createWorkbench();
  const picker = {
    open: true,
    nodeId: "source-node",
    activeTab: "scene",
    selectedId: "scene-1",
    items: [{ id: "scene-1", group: "scene" }],
  };
  workbench.ui.canvasPromptReferencePicker = picker;

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "open-canvas-prompt-reference-picker", nodeId: "source-node" },
  });

  assert.equal(workbench.ui.canvasPromptReferencePicker, picker);
  assert.equal(workbench.ui.canvasPromptReferencePicker.activeTab, "scene");
  assert.equal(workbench.ui.canvasPromptReferencePicker.selectedId, "scene-1");
});

test("Prompt Picker moves to the first available type when a source has no active-tab items", async () => {
  const workbench = createWorkbench();
  workbench.ui.canvasPromptReferencePicker = {
    open: true,
    activeSource: "team",
    activeTab: "scene",
    selectedId: "team:scene:scene-1",
    items: [
      { id: "team:scene:scene-1", sourceGroup: "team", group: "scene" },
      { id: "canvas:node:node-1", sourceGroup: "canvas", group: "node" },
    ],
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "set-canvas-prompt-reference-source", pickerSource: "canvas" },
  });

  assert.equal(workbench.ui.canvasPromptReferencePicker.activeSource, "canvas");
  assert.equal(workbench.ui.canvasPromptReferencePicker.activeTab, "node");
  assert.equal(workbench.ui.canvasPromptReferencePicker.selectedId, "");
});

test("Prompt Picker presents official and team material libraries as independent sources", () => {
  const workbench = createWorkbench();
  const html = renderCanvasSurfaceForHost({
    ui: {
      ...workbench.ui,
      canvasPromptReferencePicker: {
        open: true,
        activeSource: "team",
        activeTab: "character",
        selectedId: "team:character:shared-character",
        items: [
          {
            id: "official:character:shared-character",
            sourceGroup: "official",
            group: "character",
            label: "官方角色",
            referenceType: "drama",
            referenceId: "shared-character",
          },
          {
            id: "team:character:shared-character",
            sourceGroup: "team",
            group: "character",
            label: "团队角色",
            referenceType: "drama",
            referenceId: "shared-character",
          },
        ],
      },
    },
  });

  assert.match(html, /选择素材引用/);
  assert.match(html, /官方素材库/);
  assert.match(html, /团队素材库/);
  assert.match(html, /当前画布/);
  assert.match(html, /data-action="set-canvas-prompt-reference-source"/);
  assert.match(html, /团队角色/);
  assert.doesNotMatch(html, /官方角色/);
});

test("Canvas renders generation errors inside the mounted surface", () => {
  const workbench = createWorkbench();
  const html = renderCanvasSurfaceForHost({
    ui: {
      ...workbench.ui,
      toast: "引用素材不可用，请重新选择。",
    },
  });

  assert.match(html, /canvas-inline-toast/);
  assert.match(html, /引用素材不可用，请重新选择。/);
});

test("Canvas prompt mention recognizes a bare @ query and loads suggestions only once", async () => {
  const calls = [];
  const workbench = createWorkbench({
    async getLibraryAssets(input) {
      calls.push(["library", input.category]);
      return { assets: [] };
    },
    async listCanvasCharacters() {
      calls.push(["characters"]);
      return { characters: [] };
    },
  });
  const editor = { querySelector() { return null; } };
  const target = {
    value: "镜头 @任小",
    selectionStart: 6,
    dataset: { nodeId: "source-node" },
    closest(selector) { return selector === ".canvas-node-editor" ? editor : null; },
    insertAdjacentHTML() {},
  };

  assert.deepEqual(resolveCanvasPromptMentionQueryForTest(target.value, target.selectionStart), {
    start: 3,
    end: 6,
    query: "任小",
  });
  assert.equal(resolveCanvasPromptMentionQueryForTest("@drama:character-1@all", 22), null);
  assert.equal(updateCanvasPromptMentionStateForTest(workbench, target), true);
  assert.equal(updateCanvasPromptMentionStateForTest(workbench, target), true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.filter(([kind]) => kind === "library").length, 6);
  assert.equal(calls.filter(([kind]) => kind === "characters").length, 1);
  assert.equal(workbench.ui.canvasPromptMention.open, true);
  assert.equal(workbench.ui.canvasPromptMention.query, "任小");
});

test("Canvas prompt mention only suggests references already added to the current node", async () => {
  const workbench = createWorkbench();
  workbench.ui.canvasDocument = updateCanvasNodeData({
    ...workbench.ui.canvasDocument,
    promptReferenceCatalog: {
      ...workbench.ui.canvasDocument.promptReferenceCatalog,
      drama: {
        matron: { id: "matron", label: "保姆", source: "team", status: "active" },
      },
    },
  }, "source-node", {
    prompt: "@drama:matron 背景 @",
  });
  workbench.ui.canvasDocumentsByProject["canvas-1"] = workbench.ui.canvasDocument;
  workbench.canvasPromptReferenceItemsCache = [
    { id: "official:character:matron", referenceType: "drama", referenceId: "matron", referenceSource: "official", label: "官方保姆" },
    { id: "team:character:matron", referenceType: "drama", referenceId: "matron", referenceSource: "team", label: "保姆" },
    { id: "character:doctor", referenceType: "drama", referenceId: "doctor", label: "医生" },
    { id: "character:chef", referenceType: "drama", referenceId: "chef", label: "厨师" },
  ];
  workbench.canvasPromptReferenceItemsCacheCanvasId = "canvas-1";
  const structuredSuggestions = await loadCanvasPromptEditorSuggestionsForTest(workbench, "source-node");
  assert.equal(structuredSuggestions[0].mentionDisplayToken, "【@保姆】");
  const editor = { querySelector() { return null; } };
  const target = {
    value: "@保姆 背景 @",
    selectionStart: 8,
    dataset: { nodeId: "source-node" },
    closest(selector) { return selector === ".canvas-node-editor" ? editor : null; },
    insertAdjacentHTML() {},
  };

  assert.equal(updateCanvasPromptMentionStateForTest(workbench, target), true);
  assert.deepEqual(
    workbench.ui.canvasPromptMention.items.map((item) => item.label),
    ["保姆"],
  );
});

test("Canvas prompt mention only shows connected image, video, and audio media", async () => {
  const workbench = createWorkbench();
  const sourceNodeA = {
    id: "image-source",
    type: "source-image",
    data: { title: "参考图片", mediaKind: "image", previewUrl: "/uploads/reference.png" },
  };
  const sourceNodeB = {
    id: "image-source-2",
    type: "source-image",
    data: { title: "场景图片", mediaKind: "image", previewUrl: "/uploads/scene.png" },
  };
  const directorVideoNode = {
    id: "director-video",
    type: "ai-video",
    data: {
      title: "导演台视频",
      mediaKind: "video",
      resultVideoUrl: "/uploads/director.mp4",
      thumbnailUrl: "/uploads/director.jpg",
    },
  };
  const directorTextNode = {
    id: "director-instructions",
    type: "ai-director",
    data: { title: "AI 导演", mediaKind: "text", text: "镜头向前推进" },
  };
  const unconnectedVideoNode = {
    id: "unconnected-video",
    type: "ai-video",
    data: { title: "未引入视频", mediaKind: "video", resultVideoUrl: "/uploads/unused.mp4" },
  };
  workbench.ui.canvasDocument = {
    ...workbench.ui.canvasDocument,
    nodes: workbench.ui.canvasDocument.nodes
      .map((node) => node.id === "source-node" ? { ...node, data: { ...node.data, prompt: "背景改为蓝色@" } } : node)
      .concat(sourceNodeA, sourceNodeB, directorVideoNode, directorTextNode, unconnectedVideoNode),
    edges: [
      { sourceNodeId: "image-source", targetNodeId: "source-node", data: { kind: "image" } },
      { sourceNodeId: "image-source-2", targetNodeId: "source-node", data: { kind: "image" } },
      { sourceNodeId: "director-video", targetNodeId: "source-node", data: { kind: "video" } },
    ],
  };
  workbench.ui.canvasDocumentsByProject["canvas-1"] = workbench.ui.canvasDocument;
  const loadedDirectorVideo = (await loadCanvasPromptReferenceItems(workbench)).find(
    (item) => item.referenceId === "director-video",
  );
  assert.equal(loadedDirectorVideo.mediaKind, "video");
  assert.equal(loadedDirectorVideo.source, "/uploads/director.mp4");
  assert.equal((await loadCanvasPromptReferenceItems(workbench)).some(
    (item) => item.referenceId === "director-instructions",
  ), false);
  workbench.canvasPromptReferenceItemsCache = [
    {
      id: "node:image-source",
      group: "node",
      sourceGroup: "canvas",
      referenceType: "node",
      referenceId: "image-source",
      label: "参考图片",
      previewUrl: "/uploads/reference.png",
    },
    {
      id: "node:image-source-2",
      group: "node",
      sourceGroup: "canvas",
      referenceType: "node",
      referenceId: "image-source-2",
      label: "场景图片",
      previewUrl: "/uploads/scene.png",
    },
    {
      id: "node:director-video",
      group: "node",
      sourceGroup: "canvas",
      referenceType: "node",
      referenceId: "director-video",
      label: "导演台视频",
      previewUrl: "/uploads/director.jpg",
    },
    {
      id: "node:director-instructions",
      group: "node",
      sourceGroup: "canvas",
      referenceType: "node",
      referenceId: "director-instructions",
      label: "AI 导演",
    },
    {
      id: "node:unconnected-video",
      group: "video",
      sourceGroup: "canvas",
      referenceType: "node",
      referenceId: "unconnected-video",
      label: "未引入视频",
    },
  ];
  workbench.canvasPromptReferenceItemsCacheCanvasId = "canvas-1";
  const structuredSuggestions = await loadCanvasPromptEditorSuggestionsForTest(workbench, "source-node");
  assert.deepEqual(structuredSuggestions.map((item) => item.label), ["图1", "图2", "视频1"]);
  const directorVideoSuggestion = structuredSuggestions.find((item) => item.referenceId === "director-video");
  assert.equal(directorVideoSuggestion.assetKind, "video");
  assert.equal(directorVideoSuggestion.source, "/uploads/director.mp4");
  const target = {
    value: "背景改为蓝色@",
    selectionStart: "背景改为蓝色@".length,
    dataset: { nodeId: "source-node" },
    closest() { return { querySelector() { return null; } }; },
    insertAdjacentHTML() {},
    focus() {},
    setSelectionRange(start, end) { this.selection = [start, end]; },
  };
  workbench.newCanvasMount = {
    shadowRoot: {
      querySelector(selector) { return selector.startsWith("[data-canvas-prompt-input]") ? target : null; },
      querySelectorAll() { return []; },
    },
  };

  assert.equal(updateCanvasPromptMentionStateForTest(workbench, target), true);
  assert.deepEqual(workbench.ui.canvasPromptMention.items.map((item) => item.label), ["图1", "图2", "视频1"]);
  assert.equal(workbench.ui.canvasPromptMention.items[0].mentionDisplayToken, "【@图1】");
  assert.equal(workbench.ui.canvasPromptMention.items[0].previewUrl, "/uploads/reference.png");
  assert.equal(workbench.ui.canvasPromptMention.items[1].previewUrl, "/uploads/scene.png");
  assert.equal(applyCanvasPromptMentionSelectionForTest(workbench, "node:image-source"), true);
  const node = workbench.ui.canvasDocument.nodes.find((item) => item.id === "source-node");
  assert.equal(node.data.prompt, "背景改为蓝色@node:image-source ");
  assert.equal(target.value, "背景改为蓝色【@图1】 ");
  target.value += "@";
  target.selectionStart = target.value.length;
  assert.equal(updateCanvasPromptMentionStateForTest(workbench, target), true);
  assert.equal(applyCanvasPromptMentionSelectionForTest(workbench, "node:image-source-2"), true);
  const nodeWithTwoMentions = workbench.ui.canvasDocument.nodes.find((item) => item.id === "source-node");
  assert.equal(nodeWithTwoMentions.data.prompt, "背景改为蓝色@node:image-source @node:image-source-2 ");
  assert.equal(target.value, "背景改为蓝色【@图1】 【@图2】 ");
  assert.equal(
    renderCanvasPromptDisplayValue("@node:image-source @node:image-source-2", workbench.ui.canvasDocument, {}, "source-node"),
    "【@图1】 【@图2】",
  );
  workbench.ui.canvasEditorOpen = true;
  const editorHtml = renderCanvasSurfaceForHost({ ui: workbench.ui });
  assert.match(editorHtml, /class="canvas-prompt-editor-host" data-canvas-prompt-editor/);
  assert.match(editorHtml, /id="canvas-prompt-input-source-node"/);
  assert.match(editorHtml, /<textarea[\s\S]*?data-canvas-prompt-input/);
  assert.match(editorHtml, /canvas-generation-reference-label">图1</);
  assert.match(editorHtml, /canvas-generation-reference-label">图2</);
  assert.match(editorHtml, /aria-label="图1：参考图片"/);
  workbench.ui.canvasPromptReferencePreviews = {};
  assert.equal(
    canvasPromptStorageValueForTest(workbench, "背景改为蓝色【@图1】", workbench.ui.canvasDocument, "source-node"),
    "背景改为蓝色@node:image-source",
  );
  const connectedOnlyDocument = {
    ...workbench.ui.canvasDocument,
    promptReferenceCatalog: {},
  };
  assert.equal(
    canvasPromptStorageValueForTest(workbench, "背景改为蓝色【@图1】", connectedOnlyDocument, "source-node"),
    "背景改为蓝色@node:image-source",
  );
  assert.equal(persistCanvasPromptEditorChangeForTest(workbench, "source-node", {
    initial: false,
    prompt: "连续【@图1】 【@图2】",
  }), true);
  assert.equal(
    workbench.ui.canvasDocument.nodes.find((item) => item.id === "source-node").data.prompt,
    "连续@node:image-source @node:image-source-2",
  );
  assert.equal(registerCanvasPromptEditorMentionForTest(workbench, "source-node", directorVideoSuggestion), true);
  assert.ok(workbench.ui.canvasDocument.edges.some((edge) => (
    edge.sourceNodeId === "director-video" && edge.targetNodeId === "source-node"
  )));
  assert.doesNotMatch(
    renderCanvasPromptReferenceThumbnails(node, workbench.ui.canvasDocument, workbench.ui.canvasPromptReferencePreviews),
    /canvas-generation-reference-thumb canvas-prompt-reference-thumb/,
  );
});

test("Canvas prompt mention replaces the active query and keeps signed previews out of the document", () => {
  const workbench = createWorkbench();
  const textarea = {
    value: "镜头 @任小 后景",
    focus() {},
    setSelectionRange(start, end) { this.selection = [start, end]; },
  };
  workbench.newCanvasMount = {
    shadowRoot: {
      querySelector(selector) {
        return selector.startsWith("[data-canvas-prompt-input]") ? textarea : null;
      },
      querySelectorAll() { return []; },
    },
  };
  workbench.ui.canvasDocument = updateCanvasNodeData(workbench.ui.canvasDocument, "source-node", {
    prompt: "镜头 @任小 后景",
  });
  workbench.ui.canvasDocumentsByProject["canvas-1"] = workbench.ui.canvasDocument;
  const item = {
    id: "canvas-character:character-1@reference-front",
    group: "character",
    referenceType: "drama",
    referenceId: "character-1",
    referenceVersion: "reference-front",
    referenceSource: "canvas_character",
    referenceMode: "single",
    referenceIds: ["reference-front"],
    label: "任小野 · 正面",
    prompt: "清瘦少年，正面全身",
    previewUrl: "https://signed.test/front?token=secret",
  };
  workbench.ui.canvasPromptMention = {
    open: true,
    nodeId: "source-node",
    start: 3,
    end: 6,
    items: [item],
  };

  assert.equal(applyCanvasPromptMentionSelectionForTest(workbench, item.id), true);
  const document = workbench.ui.canvasDocument;
  const node = document.nodes.find((candidate) => candidate.id === "source-node");
  assert.equal(node.data.prompt, "镜头 @drama:character-1@reference-front 后景");
  assert.equal(textarea.value, "镜头 @任小野 · 正面 后景");
  assert.equal(
    renderCanvasPromptDisplayValue(node.data.prompt, document, workbench.ui.canvasPromptReferencePreviews),
    textarea.value,
  );
  assert.equal(
    canvasPromptStorageValueForTest(workbench, `${textarea.value}，黄昏`, document, "source-node"),
    "镜头 @drama:character-1@reference-front 后景，黄昏",
  );
  assert.equal(
    resolveCanvasPromptReferences(node.data.prompt, document.promptReferenceCatalog, { strict: true }).expandedPrompt,
    "镜头 清瘦少年，正面全身 后景",
  );
  assert.doesNotMatch(JSON.stringify(document), /signed\.test|token=secret|previewUrl/);
  assert.equal(workbench.ui.canvasPromptReferencePreviews["@drama:character-1@reference-front"].previewUrl, item.previewUrl);
});

test("Canvas prompt mention preserves the selected stable id when resources share a name", () => {
  const workbench = createWorkbench();
  const textarea = {
    value: "@同名角色",
    focus() {},
    setSelectionRange() {},
  };
  workbench.newCanvasMount = {
    shadowRoot: {
      querySelector(selector) {
        return selector.startsWith("[data-canvas-prompt-input]") ? textarea : null;
      },
      querySelectorAll() { return []; },
    },
  };
  workbench.ui.canvasDocument = updateCanvasNodeData(workbench.ui.canvasDocument, "source-node", {
    prompt: "@同名角色",
  });
  workbench.ui.canvasDocumentsByProject["canvas-1"] = workbench.ui.canvasDocument;
  workbench.ui.canvasPromptReferencePreviews = {
    "@drama:first-character": { label: "同名角色" },
  };
  const item = {
    id: "character:second-character",
    group: "character",
    referenceType: "drama",
    referenceId: "second-character",
    label: "同名角色",
    prompt: "本次选中的角色",
  };
  workbench.ui.canvasPromptMention = {
    open: true,
    nodeId: "source-node",
    start: 0,
    end: textarea.value.length,
    items: [item],
  };

  assert.equal(applyCanvasPromptMentionSelectionForTest(workbench, item.id), true);
  const node = workbench.ui.canvasDocument.nodes.find((candidate) => candidate.id === "source-node");
  assert.equal(node.data.prompt, "@drama:second-character ");
  assert.equal(textarea.value, "@同名角色 ");
});

test("Canvas prompt reference thumbnails render previews once per stable token", () => {
  const workbench = createWorkbench();
  let document = upsertPromptReferenceForRender(workbench.ui.canvasDocument);
  document = updateCanvasNodeData(document, "source-node", {
    prompt: "@drama:character-1@reference-front 再次 @drama:character-1@reference-front",
  });
  const node = document.nodes.find((candidate) => candidate.id === "source-node");
  const html = renderCanvasPromptReferenceThumbnails(node, document, {
    "@drama:character-1@reference-front": {
      label: "任小野 · 正面",
      previewUrl: "https://signed.test/front?token=secret",
    },
  });

  assert.equal((html.match(/class="canvas-generation-reference-thumb canvas-prompt-reference-thumb"/g) ?? []).length, 1);
  assert.match(html, /https:\/\/signed\.test\/front\?token=secret/);
  assert.match(html, /任小野 · 正面/);
});

test("Canvas generation expands a named prompt reference and submits after clicking generate", async () => {
  const calls = [];
  const workbench = createWorkbench({
    async createImageGenerationTask(payload) {
      calls.push(payload);
      return { taskId: "prompt-reference-task", status: "completed", generatedOutputItems: [] };
    },
  });
  workbench.root = { innerHTML: "", querySelector() { return null; } };
  workbench.ui.creditBalance = 500;
  workbench.ui.episodeGenerationConfig = {
    creditBalance: 500,
    models: [{
      modelCode: "image-live",
      modelLabel: "图片模型",
      mediaType: "image",
      supportedModes: ["single-image"],
      displayBaseCost: 80,
    }],
  };
  workbench.ui.canvasDocument = updateCanvasNodeData(workbench.ui.canvasDocument, "source-node", {
    modelCode: "image-live",
  });
  workbench.ui.canvasDocumentsByProject["canvas-1"] = workbench.ui.canvasDocument;
  const item = {
    id: "character:character-1",
    group: "character",
    referenceType: "drama",
    referenceId: "character-1",
    label: "任小野",
    prompt: "清瘦少年，正面全身",
  };
  workbench.ui.canvasPromptReferencePicker = {
    open: true,
    nodeId: "source-node",
    selectedId: item.id,
    items: [item],
  };
  assert.equal(applyCanvasPromptReferenceSelection(workbench), true);

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "run-canvas-node", nodeId: "source-node" },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, "原始描述 清瘦少年，正面全身");
  assert.equal(calls[0].canvasContext.sourcePrompt, "原始描述 @drama:character-1");
});

test("AI Markdown generation resolves the configured text model before submitting", async () => {
  const calls = [];
  let workbench;
  workbench = createWorkbench({
    async *runCanvasTextNodeStream(canvasProjectId, nodeId, payload, options) {
      const submittedNode = workbench.ui.canvasDocument.nodes.find((node) => node.id === nodeId);
      calls.push({
        canvasProjectId,
        nodeId,
        payload,
        options,
        generationProgress: submittedNode?.data?.generationProgress,
        generationStage: submittedNode?.data?.generationStage,
      });
      yield { event: "delta", data: { type: "delta", delta: "# 生成", text: "# 生成" } };
      calls.push({ liveText: workbench.ui.canvasDocument.nodes.find((node) => node.id === nodeId)?.data?.text });
      yield { event: "delta", data: { type: "delta", delta: "结果", text: "# 生成结果" } };
      yield {
        event: "complete",
        data: {
          type: "complete",
          run: { taskId: "markdown-task", status: "completed", result: { text: "# 生成结果" } },
        },
      };
    },
  });
  workbench.root = { innerHTML: "", querySelector() { return null; } };
  workbench.ui.creditBalance = 500;
  workbench.ui.toast = "操作失败：request_timeout";
  workbench.ui.toastQueue = [
    { id: "old-timeout-1", tone: "error", message: "操作失败：request_timeout" },
    { id: "old-timeout-2", tone: "error", message: "操作失败：request_timeout" },
  ];
  let document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-1" }), {
    type: "ai-markdown",
    id: "source-node",
    position: { x: 120, y: 180 },
  });
  document = updateCanvasNodeData(document, "source-node", {
    prompt: "生成表格",
    modelCode: "text-live",
  });
  workbench.ui.canvasDocument = document;
  workbench.ui.canvasDocumentsByProject["canvas-1"] = document;
  workbench.ui.episodeGenerationConfig = {
    creditBalance: 500,
    models: [{
      modelCode: "text-live",
      modelLabel: "文本模型",
      mediaType: "text",
      enabled: true,
      displayBaseCost: 20,
    }],
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "run-canvas-node", nodeId: "source-node" },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].canvasProjectId, "canvas-1");
  assert.equal(calls[0].nodeId, "source-node");
  assert.equal(calls[0].payload.kind, "text");
  assert.equal(calls[0].payload.model, "text-live");
  assert.equal(calls[0].payload.text, "生成表格");
  assert.equal(calls[0].generationProgress, 50);
  assert.equal(calls[0].generationStage, "text_generating");
  assert.equal(calls[1].liveText, "# 生成");
  const generatedNode = workbench.ui.canvasDocument.nodes.find((node) => node.id === "source-node");
  assert.equal(generatedNode.data.text, "# 生成结果");
  assert.equal(generatedNode.data.summary, "# 生成结果");
  assert.deepEqual(workbench.ui.toastQueue, []);
  assert.equal(workbench.ui.toast, "");
});

test("Canvas text stream client uses the SSE node run route without a fixed timeout", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"type":"complete","run":{"status":"succeeded"}}\n\n'));
      controller.close();
    },
  });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, body: stream };
  };
  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    const events = [];
    for await (const event of creatorApi.runCanvasTextNodeStream("canvas/1", "node/1", { text: "生成" })) {
      events.push(event);
    }
    assert.equal(events[0]?.event, "complete");
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(calls[0].url, "/api/canvas/canvas%2F1/nodes/node%2F1/run?stream=1");
  assert.equal(calls[0].options.headers.accept, "text/event-stream");
});

test("Canvas generation submits connected image aliases without raw node reference tokens", async () => {
  const calls = [];
  const workbench = createWorkbench({
    async createImageGenerationTask(payload) {
      calls.push(payload);
      return { taskId: "connected-images-task", status: "completed", generatedOutputItems: [] };
    },
  });
  workbench.root = { innerHTML: "", querySelector() { return null; } };
  workbench.ui.creditBalance = 500;
  workbench.ui.episodeGenerationConfig = {
    creditBalance: 500,
    models: [{
      modelCode: "image-live",
      modelLabel: "图片模型",
      mediaType: "image",
      supportedModes: ["single-image"],
      displayBaseCost: 80,
    }],
  };
  const sourceNodes = [
    { id: "image-source", type: "source-image", data: { title: "参考图片", mediaKind: "image", previewUrl: "/uploads/reference.png" } },
    { id: "image-source-2", type: "source-image", data: { title: "场景图片", mediaKind: "image", previewUrl: "/uploads/scene.png" } },
  ];
  const configuredDocument = updateCanvasNodeData(workbench.ui.canvasDocument, "source-node", {
    prompt: "背景改为蓝色 @node:image-source @node:image-source-2",
    modelCode: "image-live",
    mediaKind: "image",
  });
  workbench.ui.canvasDocument = {
    ...configuredDocument,
    nodes: configuredDocument.nodes.concat(sourceNodes),
    edges: [
      { sourceNodeId: "image-source", targetNodeId: "source-node", data: { kind: "image" } },
      { sourceNodeId: "image-source-2", targetNodeId: "source-node", data: { kind: "image" } },
    ],
  };
  workbench.ui.canvasDocumentsByProject["canvas-1"] = workbench.ui.canvasDocument;

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "run-canvas-node", nodeId: "source-node" },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, "背景改为蓝色 【@图1】 【@图2】");
  assert.doesNotMatch(JSON.stringify(calls[0]), /@node:image-source/);
  assert.deepEqual(calls[0].referenceImages, [
    { url: "/uploads/reference.png" },
    { url: "/uploads/scene.png" },
  ]);
});

function upsertPromptReferenceForRender(document) {
  return {
    ...document,
    promptReferenceCatalog: {
      ...(document.promptReferenceCatalog ?? {}),
      drama: {
        "character-1": {
          id: "character-1",
          label: "任小野",
          versions: {
            "reference-front": {
              id: "character-1",
              version: "reference-front",
              label: "任小野 · 正面",
              value: "清瘦少年，正面全身",
              status: "active",
            },
          },
        },
      },
    },
  };
}

function createWorkbench(api = {}) {
  let document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-1" }), {
    type: "ai-image",
    id: "source-node",
    position: { x: 120, y: 180 },
  });
  document = updateCanvasNodeData(document, "source-node", { prompt: "原始描述" });
  return {
    api,
    root: null,
    ui: {
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      selectedCanvasProjectId: "canvas-1",
      selectedCanvasNodeId: "source-node",
      canvasDocument: document,
      canvasDocumentsByProject: { "canvas-1": document },
      canvasAssets: [],
      episodeGenerationConfig: { models: [] },
    },
  };
}
