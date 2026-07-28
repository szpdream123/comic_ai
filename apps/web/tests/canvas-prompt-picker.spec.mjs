import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyCanvasPromptReferenceSelection,
  loadCanvasPromptReferenceItems,
} from "../src/features/production-workbench/index.js";
import { createDefaultCanvasDocument } from "../src/features/production-workbench/canvas/canvas-default-document.js";
import { addCanvasNode, updateCanvasNodeData } from "../src/features/production-workbench/canvas/canvas-state.js";
import { resolveCanvasPromptReferences } from "../src/features/production-workbench/canvas/canvas-prompt-reference.js";

test("Prompt Picker expands Canvas characters into stable single-reference and merge-all choices", async () => {
  const calls = [];
  const workbench = createWorkbench({
    async getLibraryAssets(input) {
      calls.push(["library", input]);
      return { assets: [] };
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
