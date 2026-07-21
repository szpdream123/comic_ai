import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CANVAS_WORKFLOW_TEMPLATES,
  insertCanvasWorkflowTemplate,
} from "../new-canvas/src/loomic-core/canvas-workflow-templates.js";

const toolMenu = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url),
  "utf8",
);
const workflowTemplates = await readFile(
  new URL("../new-canvas/src/loomic-core/canvas-workflow-templates.js", import.meta.url),
  "utf8",
);

function createCanvasApi() {
  let elements = [];
  let appState = {};
  const updates = [];
  return {
    getSceneElements: () => elements,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) {
      if (Array.isArray(update.elements)) elements = update.elements;
      if (update.appState) appState = { ...appState, ...update.appState };
      updates.push(update);
    },
    read: () => ({ elements, appState, updates }),
  };
}

test("workflow templates insert real canonical nodes and typed edges as one undoable action", () => {
  const api = createCanvasApi();
  const result = insertCanvasWorkflowTemplate(api, "script-to-image");
  const state = api.read();

  assert.equal(result.ok, true);
  assert.deepEqual(state.elements.map((element) => element.customData?.type ?? element.type), [
    "script-node",
    "image-generator",
    "arrow",
  ]);
  const arrow = state.elements.at(-1);
  assert.equal(arrow.customData?.workflowEdge, true);
  assert.equal(arrow.startBinding?.elementId, result.elementIds[0]);
  assert.equal(arrow.endBinding?.elementId, result.elementIds[1]);
  assert.deepEqual(Object.keys(state.appState.selectedElementIds).sort(), [...result.elementIds].sort());
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates.at(-1).captureUpdate, "IMMEDIATELY");
});

test("every exposed workflow template builds its complete executable topology", () => {
  for (const template of CANVAS_WORKFLOW_TEMPLATES) {
    const api = createCanvasApi();
    const result = insertCanvasWorkflowTemplate(api, template.id);
    const state = api.read();
    assert.equal(result.ok, true, template.id);
    assert.equal(result.elementIds.length, template.nodeCount, template.id);
    assert.equal(state.elements.filter((element) => element.type === "arrow").length, template.connections.length, template.id);
    assert.equal(state.elements.filter((element) => element.type !== "arrow").every((element) => !element.isDeleted), true, template.id);
  }
});

test("the canvas toolbar exposes the LibTV-style workflow toolbox", () => {
  assert.match(toolMenu, /aria-label="打开工具箱"/);
  assert.match(toolMenu, /aria-label="工具箱"/);
  assert.match(toolMenu, /listCanvasToolPresets/);
  assert.match(toolMenu, /toolPresetCatalogRef\.current\.insert\(excalidrawApi, preset, options\)/);
  assert.match(toolMenu, /role="tablist" aria-label="工具分类"/);
  assert.match(toolMenu, /CANVAS_TOOL_PRESET_DRAG_TYPE/);
  assert.match(toolMenu, /onDragStart/);
  assert.match(toolMenu, /event\.clientX - bounds\.left/);
  assert.match(toolMenu, />使用<\/button>/);
  assert.match(workflowTemplates, /const stagingApi = createStagingApi\(api\)/);
});
