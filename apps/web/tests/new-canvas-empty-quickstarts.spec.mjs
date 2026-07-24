import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  CANVAS_EMPTY_QUICKSTARTS,
  insertCanvasEmptyQuickstart,
} from "../new-canvas/src/loomic-shell/canvas-empty-quickstarts.js";
import { resolveCanvasQuickAddRequest } from "../new-canvas/src/loomic-core/canvas-quick-add.js";
import { createTextNodeElement } from "../new-canvas/src/loomic-core/canvas-elements.js";
import { createImageGeneratorElement } from "../new-canvas/src/loomic-core/image-generator-elements.js";
import { createVideoGeneratorElement } from "../new-canvas/src/loomic-core/video-generator-elements.js";
import { createWorkflowNodeElement } from "../new-canvas/src/loomic-core/workflow-node-elements.js";

function createCanvasApi() {
  let elements = [];
  const updates = [];
  return {
    getSceneElements: () => elements,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) {
      if (Array.isArray(update.elements)) elements = update.elements;
      updates.push(update);
    },
    read: () => ({ elements, updates }),
  };
}

test("empty canvas exposes four truthful LibTV-style quick starts", () => {
  assert.deepEqual(
    CANVAS_EMPTY_QUICKSTARTS.map(({ id, label, presetId }) => [id, label, presetId]),
    [
      ["story-script", "故事脚本生成", "script-storyboard"],
      ["character-three-view", "角色三视图", "character-three-view"],
      ["first-frame-video", "首帧图生视频", "image-to-video"],
      ["audio-video", "音频生视频", "audio-to-video"],
    ],
  );
  assert.deepEqual(CANVAS_EMPTY_QUICKSTARTS.map(({ label }) => label), ["故事脚本生成", "角色三视图", "首帧图生视频", "音频生视频"]);
});

test("each empty-canvas quick start inserts one real preset in one undo transaction", () => {
  for (const quickstart of CANVAS_EMPTY_QUICKSTARTS) {
    const api = createCanvasApi();
    const result = insertCanvasEmptyQuickstart(api, quickstart.id);
    const scene = api.read();

    assert.equal(result.ok, true, quickstart.id);
    assert.ok(scene.elements.length > 0, quickstart.id);
    assert.equal(scene.updates.length, 1, quickstart.id);
    assert.equal(scene.updates[0].captureUpdate, "IMMEDIATELY", quickstart.id);
  }
});

test("LibTV character and audio quick starts insert executable matching topologies", () => {
  const characterApi = createCanvasApi();
  insertCanvasEmptyQuickstart(characterApi, "character-three-view");
  const characterElements = characterApi.read().elements;
  assert.deepEqual(
    characterElements.filter((element) => element.customData?.type === "image-generator").map((element) => element.customData.prompt),
    ["同一角色，正面全身视图，纯色背景", "同一角色，侧面全身视图，纯色背景", "同一角色，背面全身视图，纯色背景"],
  );
  assert.equal(characterElements.filter((element) => element.customData?.workflowEdge).length, 3);

  const audioApi = createCanvasApi();
  insertCanvasEmptyQuickstart(audioApi, "audio-video");
  const audioElements = audioApi.read().elements;
  assert.ok(audioElements.some((element) => element.customData?.type === "audio-node"));
  assert.ok(audioElements.some((element) => element.customData?.type === "video-generator"));
  assert.equal(audioElements.filter((element) => element.customData?.workflowEdge).length, 2);
});

test("unknown quick starts do not mutate the canvas", () => {
  const api = createCanvasApi();
  assert.deepEqual(insertCanvasEmptyQuickstart(api, "not-found"), {
    ok: false,
    reason: "quickstart_not_found",
    elementIds: [],
  });
  assert.equal(api.read().updates.length, 0);
});

test("canvas double click opens quick add only on empty scene space", () => {
  const api = {
    getAppState: () => ({ scrollX: -120, scrollY: 40, zoom: { value: 2 } }),
    getSceneElements: () => [{ id: "node", x: 300, y: 90, width: 80, height: 50, isDeleted: false }],
  };
  const bounds = { left: 10, top: 50, right: 810, bottom: 650 };

  assert.equal(resolveCanvasQuickAddRequest(api, { clientX: 410, clientY: 350 }, bounds), null);
  assert.deepEqual(resolveCanvasQuickAddRequest(api, { clientX: 610, clientY: 350 }, bounds), {
    clientX: 610,
    clientY: 350,
    sceneX: 420,
    sceneY: 110,
  });
  assert.equal(resolveCanvasQuickAddRequest(api, { clientX: 900, clientY: 350 }, bounds), null);
});

test("canvas double click accounts for the workbench UI scale", () => {
  const api = {
    getAppState: () => ({ scrollX: -120, scrollY: 40, zoom: { value: 2 } }),
    getSceneElements: () => [],
  };
  const bounds = { left: 10, top: 50, right: 810, bottom: 650 };
  assert.deepEqual(resolveCanvasQuickAddRequest(api, { clientX: 610, clientY: 350 }, bounds, { uiScale: 0.75 }), {
    clientX: 610,
    clientY: 350,
    sceneX: 520,
    sceneY: 160,
  });
});

test("canvas double click respects rotated nodes and real linear-element strokes", () => {
  const bounds = { left: 0, top: 0, right: 800, bottom: 600 };
  const api = {
    getAppState: () => ({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    getSceneElements: () => [
      { id: "rotated", type: "rectangle", x: 100, y: 100, width: 100, height: 40, angle: Math.PI / 4 },
      { id: "diagonal", type: "arrow", x: 300, y: 100, width: 200, height: 200, points: [[0, 0], [200, 200]], strokeWidth: 2 },
    ],
  };
  assert.equal(resolveCanvasQuickAddRequest(api, { clientX: 182, clientY: 152 }, bounds), null);
  assert.notEqual(resolveCanvasQuickAddRequest(api, { clientX: 310, clientY: 280 }, bounds), null);
  assert.equal(resolveCanvasQuickAddRequest(api, { clientX: 400, clientY: 200 }, bounds), null);
});

test("quick-add node types are centered at the double-click scene point", () => {
  const anchor = { x: 420, y: 280 };
  const creators = [
    (api) => createTextNodeElement(api, { text: "提示", anchor }),
    (api) => createImageGeneratorElement(api, { anchor }),
    (api) => createVideoGeneratorElement(api, { anchor }),
    (api) => createWorkflowNodeElement(api, "script-node", { anchor }),
  ];

  for (const create of creators) {
    const api = createCanvasApi();
    const id = create(api);
    const element = api.read().elements.find((candidate) => candidate.id === id);
    assert.equal(element.x + element.width / 2, anchor.x);
    assert.equal(element.y + element.height / 2, anchor.y);
  }
});

test("LibTV alignment keeps measured desktop control and card geometry", async () => {
  const [hintSource, editorSource, toolMenuSource, coreStyles, shellStyles] = await Promise.all([
    readFile(new URL("../new-canvas/src/loomic-shell/CanvasEmptyHint.jsx", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-core/loomic-core.css", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-shell/loomic-shell.css", import.meta.url), "utf8"),
  ]);

  assert.match(hintSource, /CANVAS_EMPTY_QUICKSTARTS/);
  assert.match(hintSource, /双击画布/);
  assert.match(hintSource, /自由生成节点/);
  assert.match(editorSource, /onDoubleClickCapture=\{openNodeMenuAtDoubleClick\}/);
  assert.match(toolMenuSource, /addMenuRequest/);
  assert.match(toolMenuSource, /aria-label="添加节点"/);
  assert.match(coreStyles, /\.loomic-add-node-button\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/s);
  assert.match(coreStyles, /\.loomic-bottom-button\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
  assert.match(coreStyles, /\.loomic-zoom-readout\s*\{[^}]*min-width:\s*42px;[^}]*height:\s*28px;/s);
  assert.match(shellStyles, /\.lm-empty-hint\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(shellStyles, /\.lm-empty-quickstart\s*\{[^}]*width:\s*214px;[^}]*height:\s*56px;/s);
  assert.match(shellStyles, /\.lm-empty-quickstart\s*\{[^}]*pointer-events:\s*auto;/s);
});
