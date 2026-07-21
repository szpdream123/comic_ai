import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bottomBar = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasBottomBar.jsx", import.meta.url),
  "utf8",
);
const editor = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url),
  "utf8",
);
const minimapComponent = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasMinimap.jsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../new-canvas/src/loomic-core/loomic-core.css", import.meta.url),
  "utf8",
);
const { autoLayoutCanvasElements, canvasLayoutSettingsToOptions } = await import("../new-canvas/src/loomic-core/canvas-auto-layout.js");
const { matchesCanvasShortcut } = await import("../new-canvas/src/loomic-core/canvas-shortcuts.js");
const {
  areCanvasConnectionsVisible,
  projectCanvasConnectionsForView,
  restoreCanvasConnectionsForPersistence,
  setCanvasConnectionsVisible,
} = await import("../new-canvas/src/loomic-core/canvas-connection-visibility.js");
const { setCanvasLayersVisible } = await import("../new-canvas/src/loomic-core/canvas-layer-operations.js");
const {
  canvasScrollForSceneCenter,
  canvasScrollForZoom,
  createCanvasMinimapModel,
  minimapPointToScene,
  visibleCanvasBounds,
} = await import("../new-canvas/src/loomic-core/canvas-minimap.js");

test("bottom navigation supports bounded zoom input, presets, and fit-to-canvas", () => {
  assert.match(bottomBar, /const MIN_ZOOM = 0\.1/);
  assert.match(bottomBar, /const MAX_ZOOM = 8/);
  assert.match(bottomBar, /const ZOOM_PRESETS = \[0\.5, 1, 8\]/);
  assert.match(bottomBar, /aria-label="输入画布缩放比例"/);
  assert.match(bottomBar, /min="10" max="800"/);
  assert.match(bottomBar, /Math\.max\(MIN_ZOOM, Math\.min\(MAX_ZOOM, value\)\)/);
  assert.match(bottomBar, /canvasScrollForZoom\(appState, boundedValue\)/);
  assert.match(bottomBar, /excalidrawApi\?\.scrollToContent\(\)/);
  assert.match(bottomBar, /aria-label="缩放选项"/);
  assert.match(bottomBar, /aria-keyshortcuts="Control\+Plus Meta\+Plus"/);
  assert.match(bottomBar, /aria-keyshortcuts="Control\+Minus Meta\+Minus"/);
  assert.match(bottomBar, /aria-keyshortcuts="Control\+0 Meta\+0"/);
  assert.match(bottomBar, /aria-label="适合屏幕"/);
  assert.match(styles, /\.loomic-zoom-input/);
  assert.match(styles, /\.loomic-zoom-presets/);
  assert.match(styles, /\.loomic-menu-list \.loomic-zoom-command/);
});

test("zoom buttons preserve the scene point at the viewport center", () => {
  const appState = { scrollX: -300, scrollY: 80, width: 1200, height: 800, zoom: { value: 2 } };
  const next = canvasScrollForZoom(appState, 4);
  const oldCenter = {
    x: -appState.scrollX + appState.width / (2 * appState.zoom.value),
    y: -appState.scrollY + appState.height / (2 * appState.zoom.value),
  };
  const newCenter = {
    x: -next.scrollX + appState.width / 8,
    y: -next.scrollY + appState.height / 8,
  };
  assert.deepEqual(newCenter, oldCenter);
});

test("displayed zoom shortcuts use the same bounded center-preserving canvas path", () => {
  for (const event of [
    { code: "Equal", key: "+", ctrlKey: true, shiftKey: true },
    { code: "Equal", key: "=", metaKey: true },
    { code: "NumpadAdd", key: "+", ctrlKey: true },
  ]) assert.equal(matchesCanvasShortcut(event, "zoom-in"), true);
  for (const event of [
    { code: "Minus", key: "-", ctrlKey: true },
    { code: "NumpadSubtract", key: "-", metaKey: true },
  ]) assert.equal(matchesCanvasShortcut(event, "zoom-out"), true);
  assert.equal(matchesCanvasShortcut({ code: "Equal", key: "+" }, "zoom-in"), false);
  assert.equal(matchesCanvasShortcut({ code: "Minus", key: "-" }, "zoom-out"), false);
  assert.match(editor, /matchesCanvasShortcut\(event, "zoom-in"\)/);
  assert.match(editor, /matchesCanvasShortcut\(event, "zoom-out"\)/);
  assert.match(editor, /canvasScrollForZoom\(appState, nextZoom\)/);
  assert.match(editor, /Math\.min\(8, currentZoom \* 1\.1\)/);
  assert.match(editor, /Math\.max\(0\.1, currentZoom \/ 1\.1\)/);
});

test("grid snap uses Excalidraw grid mode so snapping participates in canvas persistence", () => {
  assert.match(bottomBar, /gridModeEnabled: next/);
  assert.match(bottomBar, /const \[gridSnapEnabled, setGridSnapEnabled\] = useState\(false\)/);
  assert.match(bottomBar, /title=\{gridSnapEnabled \? "关闭网格吸附" : "开启网格吸附"\}/);
  assert.match(bottomBar, /aria-label="网格吸附"/);
  assert.match(bottomBar, /aria-pressed=\{gridSnapEnabled\}/);
  assert.doesNotMatch(bottomBar, /隐藏网格|显示网格/);
  assert.match(editor, /gridModeEnabled: appState\.gridModeEnabled/);
});

test("connection visibility is a reversible view projection and never mutates document metadata", () => {
  assert.match(bottomBar, /setCanvasConnectionsVisible\(excalidrawApi, nextVisible\)/);
  assert.match(bottomBar, /aria-label=\{connectionsVisible \? "隐藏连接线" : "显示连接线"\}/);
  assert.doesNotMatch(bottomBar, /loomicConnectionsHidden|loomicConnectionOpacity/);
  assert.match(editor, /syncCanvasConnectionVisibility\(api, elements\)/);
  assert.match(editor, /restoreCanvasConnectionsForPersistence\(api, elements\)/);
});

test("connection view projection preserves persistence, versions, layer visibility, and new arrows", () => {
  const original = [
    { id: "edge", type: "arrow", opacity: 64, version: 7, versionNonce: 91, updated: 123, customData: { workflowEdge: true } },
    { id: "layer-hidden", type: "arrow", opacity: 0, version: 3, customData: { loomicHidden: true, loomicOpacity: 80 } },
    { id: "node", type: "rectangle", opacity: 100, version: 2 },
  ];
  let scene = original;
  const updates = [];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { updates.push(update); scene = update.elements; },
  };

  setCanvasConnectionsVisible(api, false);
  assert.equal(areCanvasConnectionsVisible(api), false);
  assert.deepEqual(scene.map(({ opacity }) => opacity), [0, 0, 100]);
  assert.equal(updates.at(-1).captureUpdate, "NONE");
  assert.deepEqual(restoreCanvasConnectionsForPersistence(api, scene), original);
  assert.equal(scene[0].version, 7);
  assert.equal(scene[0].versionNonce, 91);
  assert.deepEqual(scene[0].customData, { workflowEdge: true });

  const layerShown = scene.map((element) => element.id === "layer-hidden"
    ? { ...element, opacity: 80, customData: { ...element.customData, loomicHidden: false } }
    : element);
  scene = projectCanvasConnectionsForView(api, layerShown);
  assert.equal(scene[1].opacity, 0);
  assert.equal(restoreCanvasConnectionsForPersistence(api, scene)[1].opacity, 80);

  const newArrow = { id: "new-edge", type: "arrow", opacity: 100, version: 1, customData: { workflowEdge: true } };
  scene = projectCanvasConnectionsForView(api, [...scene, newArrow]);
  assert.equal(scene.at(-1).opacity, 0);
  assert.deepEqual(restoreCanvasConnectionsForPersistence(api, scene).at(-1), newArrow);

  setCanvasConnectionsVisible(api, true);
  assert.equal(areCanvasConnectionsVisible(api), true);
  assert.deepEqual(scene.map(({ opacity }) => opacity), [64, 80, 100, 100]);
});

test("connection view projection composes with persistent layer visibility", () => {
  let scene = [
    { id: "node", type: "rectangle", opacity: 100, customData: {} },
    { id: "edge", type: "arrow", opacity: 100, startBinding: { elementId: "node" }, customData: { workflowEdge: true } },
  ];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { scene = update.elements; },
  };
  const updateLayers = (transform) => {
    const persistent = restoreCanvasConnectionsForPersistence(api, scene);
    scene = projectCanvasConnectionsForView(api, transform(persistent), { rebase: true });
  };

  setCanvasConnectionsVisible(api, false);
  updateLayers((elements) => setCanvasLayersVisible(elements, ["node"], false));
  const hiddenPersistence = restoreCanvasConnectionsForPersistence(api, scene);
  assert.equal(hiddenPersistence[1].opacity, 0);
  assert.equal(hiddenPersistence[1].customData.loomicOpacity, 100);

  setCanvasConnectionsVisible(api, true);
  assert.equal(scene[1].opacity, 0);
  updateLayers((elements) => setCanvasLayersVisible(elements, ["node"], true));
  assert.equal(scene[1].opacity, 100);
});

test("persistent connection rebases replace stale view opacity", () => {
  let scene = [{ id: "edge", type: "arrow", opacity: 100, customData: {} }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { scene = update.elements; },
  };
  setCanvasConnectionsVisible(api, false);
  scene = projectCanvasConnectionsForView(api, [
    { id: "edge", type: "arrow", opacity: 0, customData: { loomicHidden: true, loomicOpacity: 100 } },
  ], { rebase: true });
  assert.equal(restoreCanvasConnectionsForPersistence(api, scene)[0].opacity, 0);
  setCanvasConnectionsVisible(api, true);
  assert.equal(scene[0].opacity, 0);
});

test("hydration seeds the persisted content baseline before pure view changes", () => {
  const hydrationIndex = editor.indexOf("const result = normalizeCanvasElements(elements);");
  const contentIndex = editor.indexOf("const content = toSerializableContent(", hydrationIndex);
  const baselineIndex = editor.indexOf("lastScheduledContentRef.current = JSON.stringify(content);", contentIndex);
  const changeHandlerIndex = editor.indexOf("const handleChange = useCallback", hydrationIndex);
  assert.ok(hydrationIndex >= 0 && contentIndex > hydrationIndex && baselineIndex > contentIndex && baselineIndex < changeHandlerIndex);
  assert.match(editor, /if \(result\.changed\) \{[\s\S]*?api\.updateScene[\s\S]*?\} else \{[\s\S]*?lastScheduledContentRef\.current/);
});

test("all icon-only bottom navigation controls expose complete accessible names", () => {
  for (const label of ["画布背景色", "打开图层", "打开生成文件", "缩小画布", "放大画布", "适合屏幕", "自动整理节点"]) {
    assert.match(bottomBar, new RegExp(`aria-label=(?:"${label}"|\\{[^}]*"${label}"[^}]*\\})`));
  }
});

test("minimap includes every live node and maps pointer navigation to the scene", () => {
  const appState = { scrollX: -100, scrollY: -40, width: 800, height: 600, zoom: { value: 2 } };
  assert.deepEqual(visibleCanvasBounds(appState), { x: 100, y: 40, width: 400, height: 300 });
  const model = createCanvasMinimapModel([
    { id: "text", type: "text", x: -200, y: 0, width: 120, height: 40 },
    { id: "image", type: "image", x: 900, y: 500, width: 300, height: 200 },
    { id: "edge", type: "arrow", x: 0, y: 0, width: 10, height: 10 },
    { id: "deleted", type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: true },
  ], appState);
  assert.deepEqual(model.nodes.map((node) => node.id), ["text", "image"]);
  const scenePoint = minimapPointToScene(model, model.offsetX + 250 * model.scale, model.offsetY + 170 * model.scale);
  assert.ok(Math.abs(scenePoint.x - 250) < 0.0001);
  assert.ok(Math.abs(scenePoint.y - 170) < 0.0001);
  assert.deepEqual(canvasScrollForSceneCenter(appState, scenePoint), { scrollX: -50, scrollY: -20 });
  assert.match(minimapComponent, /onPointerMove=\{handlePointerMove\}/);
  assert.match(minimapComponent, /setPointerCapture/);
  assert.match(minimapComponent, /navigationModelRef\.current = model/);
  assert.match(minimapComponent, /navigationModelRef\.current \?\? model/);
  assert.match(minimapComponent, /onLostPointerCapture=\{handlePointerEnd\}/);
  assert.match(minimapComponent, /aria-label="画布小地图，点击或拖动以导航"/);
  assert.match(styles, /\.loomic-minimap\s*\{[^}]*width:\s*184px;[^}]*height:\s*116px;/s);
});

test("ELK auto layout separates workflow nodes while preserving semantic bindings", async () => {
  const sourceBinding = { elementId: "source", focus: 0, gap: 1, fixedPoint: [1, 0.5] };
  const targetBinding = { elementId: "target", focus: 0, gap: 1, fixedPoint: [0, 0.5] };
  const boundElements = [{ id: "workflow-arrow", type: "arrow" }];
  const edgeData = { workflowEdge: true, sourcePortId: "out_text", targetPortId: "in_asset" };
  const elements = [
    { id: "source", type: "text", x: 100, y: 100, width: 160, height: 50, version: 1, isDeleted: false, boundElements },
    { id: "target", type: "rectangle", x: 120, y: 110, width: 300, height: 200, version: 1, isDeleted: false, boundElements },
    {
      id: "workflow-arrow", type: "arrow", x: 260, y: 125, width: 140, height: 85,
      version: 1, isDeleted: false, points: [[0, 0], [-140, 85]],
      startBinding: sourceBinding, endBinding: targetBinding, customData: edgeData,
    },
  ];
  const arranged = await autoLayoutCanvasElements(elements);
  const source = arranged.find((element) => element.id === "source");
  const target = arranged.find((element) => element.id === "target");
  const arrow = arranged.find((element) => element.id === "workflow-arrow");
  assert.ok(target.x >= source.x + source.width + 100);
  assert.deepEqual(source.boundElements, boundElements);
  assert.deepEqual(target.boundElements, boundElements);
  assert.deepEqual(arrow.startBinding, sourceBinding);
  assert.deepEqual(arrow.endBinding, targetBinding);
  assert.deepEqual(arrow.customData, edgeData);
  assert.equal(arrow.id, "workflow-arrow");
  assert.equal(arrow.x, source.x + source.width);
  assert.equal(arrow.y, source.y + source.height / 2);
  const arrowEnd = arrow.points.at(-1);
  assert.equal(arrow.x + arrowEnd[0], target.x);
  assert.equal(arrow.y + arrowEnd[1], target.y + target.height / 2);
});

test("auto layout keeps grouped content together and never moves locked nodes", async () => {
  const elements = [
    { id: "group-a", type: "rectangle", x: 0, y: 0, width: 80, height: 60, groupIds: ["group"], isDeleted: false },
    { id: "group-b", type: "text", x: 10, y: 15, width: 40, height: 20, groupIds: ["group"], isDeleted: false },
    { id: "free", type: "rectangle", x: 5, y: 5, width: 90, height: 70, isDeleted: false },
    { id: "locked", type: "rectangle", x: 800, y: 900, width: 90, height: 70, locked: true, isDeleted: false },
  ];
  const arranged = await autoLayoutCanvasElements(elements);
  const byId = new Map(arranged.map((element) => [element.id, element]));
  assert.equal(byId.get("group-b").x - byId.get("group-a").x, 10);
  assert.equal(byId.get("group-b").y - byId.get("group-a").y, 15);
  assert.equal(byId.get("locked").x, 800);
  assert.equal(byId.get("locked").y, 900);
});

test("auto layout is available from the bottom bar and Option or Alt shortcut", () => {
  assert.match(bottomBar, /aria-keyshortcuts="Alt\+Shift\+F"/);
  assert.match(editor, /matchesCanvasShortcut\(event, "arrange"\)/);
  assert.match(editor, /autoLayoutCanvasElements\(currentElements, canvasLayoutSettingsToOptions\(layoutSettings\)\)/);
  assert.match(editor, /captureUpdate: "IMMEDIATELY"/);
});

test("auto layout exposes horizontal or vertical direction and three spacing presets", async () => {
  assert.deepEqual(canvasLayoutSettingsToOptions({ direction: "DOWN", spacing: "compact" }), {
    direction: "DOWN",
    nodeSpacing: 32,
    layerSpacing: 72,
    componentSpacing: 72,
  });
  assert.deepEqual(canvasLayoutSettingsToOptions({ direction: "unknown", spacing: "unknown" }), {
    direction: "RIGHT",
    nodeSpacing: 56,
    layerSpacing: 120,
    componentSpacing: 120,
  });
  const elements = [
    { id: "source", type: "text", x: 0, y: 0, width: 100, height: 40, isDeleted: false },
    { id: "target", type: "rectangle", x: 10, y: 10, width: 120, height: 80, isDeleted: false },
    {
      id: "edge", type: "arrow", x: 100, y: 20, width: 90, height: 30, points: [[0, 0], [-90, 30]], isDeleted: false,
      startBinding: { elementId: "source", fixedPoint: [1, 0.5] },
      endBinding: { elementId: "target", fixedPoint: [0, 0.5] },
    },
  ];
  const vertical = await autoLayoutCanvasElements(elements, canvasLayoutSettingsToOptions({ direction: "DOWN", spacing: "loose" }));
  const source = vertical.find((element) => element.id === "source");
  const target = vertical.find((element) => element.id === "target");
  assert.ok(target.y >= source.y + source.height + 170);
  assert.match(bottomBar, /aria-label="自动整理设置"/);
  assert.match(bottomBar, /布局方向/);
  assert.match(bottomBar, /节点间距/);
  for (const label of ["横向", "纵向", "紧凑", "标准", "宽松", "应用并整理"]) {
    assert.match(bottomBar, new RegExp(label));
  }
  assert.match(styles, /\.loomic-layout-segments/);
});

test("LibTV creation and fit shortcuts require the displayed primary modifier", () => {
  for (const [shortcut, event] of [
    ["group", { code: "KeyG", key: "g" }],
    ["ungroup", { code: "KeyG", key: "G", shiftKey: true }],
    ["merge-group", { code: "KeyG", key: "g", altKey: true }],
    ["duplicate", { code: "KeyD", key: "d" }],
    ["generate", { key: "Enter" }],
    ["fit", { code: "Digit0", key: "0" }],
  ]) {
    assert.equal(matchesCanvasShortcut(event, shortcut), false, `${shortcut} must reject its bare form`);
    assert.equal(matchesCanvasShortcut({ ...event, ctrlKey: true }, shortcut), true, `${shortcut} accepts Ctrl`);
    assert.equal(matchesCanvasShortcut({ ...event, metaKey: true }, shortcut), true, `${shortcut} accepts Meta`);
  }
  assert.equal(matchesCanvasShortcut({ key: "Tab" }, "new-node"), true);
  assert.equal(matchesCanvasShortcut({ key: "n", code: "KeyN" }, "new-node"), false);
  assert.equal(matchesCanvasShortcut({ key: "f", code: "KeyF", altKey: true, shiftKey: true }, "arrange"), true);
  assert.match(editor, /matchesCanvasShortcut\(event, "fit"\)/);
  assert.match(editor, /api\.scrollToContent\?\.\(\)/);
});

test("Ctrl or Meta S saves from anywhere on the canvas page before typing guards", () => {
  assert.equal(matchesCanvasShortcut({ key: "s", code: "KeyS", ctrlKey: true }, "save"), true);
  assert.equal(matchesCanvasShortcut({ key: "s", code: "KeyS", metaKey: true }, "save"), true);
  assert.equal(matchesCanvasShortcut({ key: "s", code: "KeyS" }, "save"), false);
  assert.match(editor, /const handleCanvasShortcut = \(event\) => \{[\s\S]*?matchesCanvasShortcut\(event, "save"\)[\s\S]*?if \(isTypingTarget\(target\)\) return;/);
  assert.match(editor, /window\.dispatchEvent\(new CustomEvent\("loomic-canvas:save-request"\)\)/);
});

test("the minimap defaults closed like the LibTV canvas", () => {
  assert.match(editor, /const \[minimapOpen, setMinimapOpen\] = useState\(false\)/);
});
