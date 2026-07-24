import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bottomBar = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasBottomBar.jsx", import.meta.url),
  "utf8",
);
const toolMenu = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url),
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
const { applyCanvasLayoutGeometry, autoLayoutCanvasElements, canvasLayoutSettingsToOptions, hasCanvasLayoutRestoreConflict, restoreCanvasLayoutElements } = await import("../new-canvas/src/loomic-core/canvas-auto-layout.js");
const { CANVAS_SHORTCUT_GROUPS, isCanvasShortcutInteractiveTarget, matchesCanvasShortcut } = await import("../new-canvas/src/loomic-core/canvas-shortcuts.js");
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
  visibleCanvasFitElements,
} = await import("../new-canvas/src/loomic-core/canvas-minimap.js");

test("bottom navigation supports bounded zoom input, presets, and fit-to-canvas", () => {
  assert.match(bottomBar, /const MIN_ZOOM = 0\.1/);
  assert.match(bottomBar, /const MAX_ZOOM = 8/);
  assert.match(bottomBar, /const ZOOM_PRESETS = \[0\.5, 1, 8\]/);
  assert.match(bottomBar, /aria-label="输入画布缩放比例"/);
  assert.match(bottomBar, /min="10" max="800"/);
  assert.match(bottomBar, /Math\.max\(MIN_ZOOM, Math\.min\(MAX_ZOOM, value\)\)/);
  assert.match(bottomBar, /canvasScrollForZoom\(appState, boundedValue\)/);
  assert.match(bottomBar, /visibleCanvasFitElements\(excalidrawApi\?\.getSceneElements\?\.\(\)\)/);
  assert.match(bottomBar, /excalidrawApi\?\.scrollToContent\?\.\(fitElements\)/);
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
  const fitShortcut = CANVAS_SHORTCUT_GROUPS.flatMap((group) => group.items)
    .find((item) => item.keys.join("+") === "Ctrl / ⌘+0");
  assert.equal(fitShortcut?.label, "适合屏幕");
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
  assert.match(bottomBar, /title=\{connectionsVisible \? "隐藏节点连线" : "显示节点连线"\}/);
  assert.match(bottomBar, /aria-label="节点连线" aria-pressed=\{!connectionsVisible\}/);
  assert.match(bottomBar, /const \[connectionNoticeOpen, setConnectionNoticeOpen\] = useState\(false\)/);
  assert.match(bottomBar, /setConnectionNoticeOpen\(true\)/);
  assert.match(bottomBar, /closePopovers = useCallback\(\(\) => \{[^}]*setConnectionNoticeOpen\(false\)/);
  assert.match(bottomBar, /className="loomic-connection-notice"/);
  assert.match(bottomBar, /key=\{connectionsVisible \? "visible" : "hidden"\} role="status" aria-live="polite"/);
  assert.match(bottomBar, /点击可显示\/隐藏画布上的连线/);
  assert.match(bottomBar, /aria-label="关闭连线显隐提示"/);
  assert.doesNotMatch(bottomBar, /className="loomic-connection-notice"[^>]*dismissible=\{false\}/);
  assert.match(styles, /\.loomic-popover\.loomic-connection-notice/);
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

test("bottom navigation controls expose complete names and the LibTV asset entry stays visible", () => {
  for (const label of ["画布背景色", "打开图层", "缩小画布", "放大画布", "适合屏幕", "整理画布"]) {
    assert.match(bottomBar, new RegExp(`aria-label=(?:"${label}"|\\{[^}]*"${label}"[^}]*\\})`));
  }
  assert.match(bottomBar, /const filesActionLabel = filesOpen \? "关闭资产管理" : "打开资产管理";/);
  assert.match(bottomBar, /title=\{filesActionLabel\} aria-label=\{filesActionLabel\} aria-pressed=\{filesOpen\}/);
  assert.doesNotMatch(bottomBar, /title="资产管理" aria-label="打开资产管理"/);
  assert.match(bottomBar, /loomic-asset-manager-button/);
  assert.match(bottomBar, /<span>资产管理<\/span>/);
  assert.match(styles, /\.loomic-bottom-button \{[^}]*width: 28px;[^}]*height: 28px;[^}]*padding: 0;[^}]*\}/);
  assert.match(styles, /\.loomic-bottom-button\.loomic-asset-manager-button \{[^}]*width: auto;[^}]*flex: 0 0 auto;/);
  assert.match(styles, /@media \(min-width: 761px\) \{[\s\S]*?\.loomic-bottom-button\.loomic-asset-manager-button\.is-active \{[^}]*width: 28px;[^}]*flex: 0 0 28px;[^}]*gap: 0;[^}]*padding: 0;[^}]*\}/);
  assert.match(styles, /@media \(min-width: 761px\) \{[\s\S]*?\.loomic-bottom-button\.loomic-asset-manager-button\.is-active span \{ display: none; \}/);
  assert.doesNotMatch(bottomBar, /生成文件/);
  assert.ok(bottomBar.indexOf("loomic-asset-manager-button") < bottomBar.indexOf("ref={backgroundRef}"));
});

test("bottom navigation preserves the LibTV core tool order", () => {
  const order = [
    bottomBar.indexOf("loomic-asset-manager-button"),
    bottomBar.indexOf('aria-label="整理画布"'),
    bottomBar.indexOf("onToggleMinimap &&"),
    bottomBar.indexOf('aria-label="节点连线"'),
    bottomBar.indexOf('aria-label="网格吸附"'),
    bottomBar.indexOf("loomic-zoom-readout"),
  ];
  assert.ok(order.every((value) => value >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const zoomIndex = order.at(-1);
  for (const extensionMarker of ["ref={backgroundRef}", 'aria-label="打开图层"', "ref={layoutRef}", "loomic-workflow-run"]) {
    const extensionIndex = bottomBar.indexOf(extensionMarker);
    if (extensionIndex >= 0) assert.ok(extensionIndex > zoomIndex, `${extensionMarker} must follow the continuous LibTV core group`);
  }
});

test("the new-node shortcut preserves Tab navigation from interactive canvas controls", () => {
  const target = (matchedSelector) => ({
    isContentEditable: false,
    matches: (selector) => selector.includes(matchedSelector),
  });
  assert.equal(isCanvasShortcutInteractiveTarget(target("button")), true);
  assert.equal(isCanvasShortcutInteractiveTarget(target("a[href]")), true);
  assert.equal(isCanvasShortcutInteractiveTarget(target("[tabindex]")), true);
  assert.equal(isCanvasShortcutInteractiveTarget(target(".excalidraw-container")), false);
  assert.equal(isCanvasShortcutInteractiveTarget({ isContentEditable: true, matches: () => false }), true);
  assert.equal(isCanvasShortcutInteractiveTarget({ isContentEditable: false, matches: () => false, closest: () => ({ tabIndex: 0 }) }), false);
  assert.match(toolMenu, /if \(event\.isComposing \|\| isCanvasShortcutInteractiveTarget\(event\.target\)\) return;/);
  assert.match(toolMenu, /menuLeft: \(globalLeft - anchorBounds\.left\) \/ uiScale/);
});

test("minimap includes visible live nodes and maps pointer navigation to the scene", () => {
  const appState = { scrollX: -100, scrollY: -40, width: 800, height: 600, zoom: { value: 2 } };
  assert.deepEqual(visibleCanvasBounds(appState), { x: 100, y: 40, width: 400, height: 300 });
  const visibleElements = [
    { id: "text", type: "text", x: -200, y: 0, width: 120, height: 40 },
    { id: "image", type: "image", x: 900, y: 500, width: 300, height: 200 },
    { id: "edge", type: "arrow", x: 0, y: 0, width: 10, height: 10 },
    { id: "deleted", type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: true },
  ];
  const visibleModel = createCanvasMinimapModel(visibleElements, appState);
  const model = createCanvasMinimapModel([
    ...visibleElements,
    { id: "hidden", type: "rectangle", x: 10000, y: 10000, width: 400, height: 300, customData: { loomicHidden: true } },
  ], appState);
  assert.deepEqual(model.nodes.map((node) => node.id), ["text", "image"]);
  assert.equal(model.scale, visibleModel.scale);
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

test("minimap projects the axis-aligned visual bounds of rotated nodes", () => {
  const model = createCanvasMinimapModel([
    { id: "rotated", type: "rectangle", x: 100, y: 200, width: 300, height: 50, angle: Math.PI / 2 },
  ], { scrollX: 0, scrollY: 0, width: 1, height: 1, zoom: { value: 1 } });
  const node = model.nodes.find((candidate) => candidate.id === "rotated");
  assert.ok(node);
  assert.ok(Math.abs(node.x - 225) < 0.0001);
  assert.ok(Math.abs(node.y - 75) < 0.0001);
  assert.ok(Math.abs(node.width - 50) < 0.0001);
  assert.ok(Math.abs(node.height - 300) < 0.0001);
});

test("rotated bounds preserve the Excalidraw center when dimensions are negative", () => {
  const model = createCanvasMinimapModel([
    { id: "flipped", type: "rectangle", x: 400, y: 200, width: -300, height: 50, angle: Math.PI / 2 },
  ], { scrollX: 0, scrollY: 0, width: 1, height: 1, zoom: { value: 1 } });
  const node = model.nodes.find((candidate) => candidate.id === "flipped");
  assert.ok(node);
  assert.ok(Math.abs(node.x - 225) < 0.0001);
  assert.ok(Math.abs(node.y - 75) < 0.0001);
  assert.ok(Math.abs(node.width - 50) < 0.0001);
  assert.ok(Math.abs(node.height - 300) < 0.0001);
});

test("LibTV minimap opens directly above its selected bottom-bar trigger", () => {
  assert.match(bottomBar, /import \{ CanvasMinimap \} from "\.\/CanvasMinimap\.jsx"/);
  assert.match(bottomBar, /const minimapRef = useRef\(null\)/);
  assert.match(bottomBar, /className="loomic-minimap-anchor"/);
  assert.match(bottomBar, /<Popover open=\{minimapOpen\} triggerRef=\{minimapRef\}[^>]*className="loomic-minimap-popover" placement="auto" dismissible=\{false\}>/);
  assert.match(bottomBar, /<CanvasMinimap excalidrawApi=\{excalidrawApi\} \/>/);
  assert.doesNotMatch(editor, /minimapOpen && <CanvasMinimap/);
  assert.match(styles, /\.loomic-minimap-anchor\s*\{[^}]*position:\s*relative;/s);
  assert.match(styles, /\.loomic-popover\.loomic-minimap-popover\s*\{[^}]*width:\s*184px;[^}]*height:\s*116px;[^}]*box-sizing:\s*border-box;[^}]*padding:\s*0;/s);
  assert.match(styles, /\.loomic-minimap-popover\s+\.loomic-minimap\s*\{[^}]*position:\s*static;/s);
  assert.match(bottomBar, /placement === "auto" && bounds\.top - panelHeight - 8 < 8/);
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

test("auto layout separates rotated nodes by their visual bounds", async () => {
  const elements = [
    {
      id: "source", type: "rectangle", x: 0, y: 0, width: 300, height: 50, angle: Math.PI / 2,
      boundElements: [{ id: "edge", type: "arrow" }], isDeleted: false,
    },
    {
      id: "target", type: "rectangle", x: 0, y: 20, width: 300, height: 50, angle: Math.PI / 2,
      boundElements: [{ id: "edge", type: "arrow" }], isDeleted: false,
    },
    {
      id: "edge", type: "arrow", x: 300, y: 25, width: 0, height: 20, points: [[0, 0], [0, 20]],
      startBinding: { elementId: "source", fixedPoint: [1, 0.5] },
      endBinding: { elementId: "target", fixedPoint: [0, 0.5] },
      isDeleted: false,
    },
  ];
  const arranged = await autoLayoutCanvasElements(elements, { direction: "DOWN", layerSpacing: 120 });
  const source = arranged.find((element) => element.id === "source");
  const target = arranged.find((element) => element.id === "target");
  const sourceVisualBottom = source.y + 175;
  const targetVisualTop = target.y - 125;
  assert.ok(targetVisualTop >= sourceVisualBottom + 119.999, `expected visual gap >= 120, got ${targetVisualTop - sourceVisualBottom}`);
});

test("fit-to-screen excludes hidden and deleted layers without falling back to the full scene", () => {
  const elements = [
    { id: "left", type: "rectangle", x: 0, y: 0, width: 100, height: 80, isDeleted: false },
    { id: "hidden", type: "rectangle", x: 5000, y: 5000, width: 100, height: 80, isDeleted: false, customData: { loomicHidden: true } },
    { id: "deleted", type: "rectangle", x: 9000, y: 9000, width: 100, height: 80, isDeleted: true },
    { id: "edge", type: "arrow", x: 100, y: 40, width: 40, height: 0, isDeleted: false },
  ];
  assert.equal(typeof visibleCanvasFitElements, "function");
  assert.deepEqual(visibleCanvasFitElements(elements).map((element) => element.id), ["left", "edge"]);
  assert.deepEqual(visibleCanvasFitElements(null), []);
  assert.match(bottomBar, /const fitElements = visibleCanvasFitElements\(excalidrawApi\?\.getSceneElements\?\.\(\)\);\s*if \(fitElements\.length\) excalidrawApi\?\.scrollToContent\?\.\(fitElements\);/);
  assert.match(editor, /const fitElements = visibleCanvasFitElements\(api\.getSceneElements\?\.\(\)\);\s*if \(fitElements\.length\) api\.scrollToContent\?\.\(fitElements\);/);
  assert.match(editor, /const nodes = visibleCanvasFitElements\(layoutResult\.elements\)\.filter\(\(element\) => element\.type !== "arrow"\);/);
  assert.doesNotMatch(bottomBar, /aria-label="适合屏幕"[^>]*onClick=\{\(\) => \{ excalidrawApi\?\.scrollToContent\(\)/);
});

test("auto layout restore reverts layout geometry without discarding later node edits", () => {
  assert.equal(typeof restoreCanvasLayoutElements, "function");
  const before = [
    { id: "node", type: "rectangle", x: 10, y: 20, width: 100, height: 80, version: 1, versionNonce: 10, label: "before" },
    { id: "edge", type: "arrow", x: 110, y: 60, width: 90, height: 20, points: [[0, 0], [90, 20]], version: 1, versionNonce: 11 },
  ];
  const current = [
    { ...before[0], x: 300, y: 400, version: 2, label: "edited after layout" },
    { ...before[1], x: 400, y: 440, width: 150, height: 40, points: [[0, 0], [150, 40]], version: 2 },
    { id: "later", type: "text", x: 700, y: 800, width: 90, height: 30, version: 1 },
  ];
  const restored = restoreCanvasLayoutElements(current, before);
  assert.deepEqual({ x: restored[0].x, y: restored[0].y, label: restored[0].label }, { x: 10, y: 20, label: "edited after layout" });
  assert.deepEqual({ x: restored[1].x, y: restored[1].y, width: restored[1].width, height: restored[1].height, points: restored[1].points }, {
    x: 110, y: 60, width: 90, height: 20, points: [[0, 0], [90, 20]],
  });
  assert.equal(restored[2], current[2]);
  assert.ok(restored[0].version > current[0].version);
});

test("auto layout applies geometry to the latest scene without overwriting concurrent content edits", () => {
  const original = [
    { id: "node", type: "rectangle", x: 10, y: 20, width: 100, height: 80, version: 1, label: "before" },
    { id: "edge", type: "arrow", x: 110, y: 60, width: 90, height: 20, points: [[0, 0], [90, 20]], version: 1 },
  ];
  const arranged = [
    { ...original[0], x: 300, y: 400, version: 2 },
    { ...original[1], x: 400, y: 440, width: 150, height: 40, points: [[0, 0], [150, 40]], version: 2 },
  ];
  const latest = [
    { ...original[0], label: "edited while arranging", strokeColor: "#ff0000" },
    original[1],
    { id: "later", type: "text", x: 700, y: 800, width: 90, height: 30, version: 1 },
  ];
  const result = applyCanvasLayoutGeometry(latest, original, arranged);
  assert.equal(result.conflicted, false);
  assert.equal(result.changed, true);
  assert.deepEqual({ x: result.elements[0].x, y: result.elements[0].y, label: result.elements[0].label, strokeColor: result.elements[0].strokeColor }, {
    x: 300, y: 400, label: "edited while arranging", strokeColor: "#ff0000",
  });
  assert.deepEqual(result.elements[1].points, [[0, 0], [150, 40]]);
  assert.equal(result.elements[2], latest[2]);
  assert.deepEqual(result.originalElements.map((element) => element.id), ["node", "edge"]);
});

test("auto layout aborts instead of overwriting geometry changed while ELK is running", () => {
  const original = [
    { id: "left", type: "rectangle", x: 0, y: 0, width: 100, height: 80, version: 1 },
    { id: "right", type: "rectangle", x: 20, y: 0, width: 100, height: 80, version: 1 },
  ];
  const arranged = [
    { ...original[0], x: -100, version: 2 },
    { ...original[1], x: 140, version: 2 },
  ];
  const latest = [{ ...original[0], x: 55, version: 2 }, original[1]];
  const result = applyCanvasLayoutGeometry(latest, original, arranged);
  assert.equal(result.conflicted, true);
  assert.equal(result.changed, false);
  assert.equal(result.elements, latest);
  assert.deepEqual(result.originalElements, []);
});

test("auto layout aborts when a moved node is locked or regrouped while ELK is running", () => {
  const original = [
    { id: "left", type: "rectangle", x: 0, y: 0, width: 100, height: 80, version: 1, groupIds: [] },
    { id: "right", type: "rectangle", x: 20, y: 0, width: 100, height: 80, version: 1, groupIds: [] },
  ];
  const arranged = [
    { ...original[0], x: -100, version: 2 },
    { ...original[1], x: 140, version: 2 },
  ];
  for (const latest of [
    [{ ...original[0], locked: true }, original[1]],
    [{ ...original[0], groupIds: ["new-group"] }, original[1]],
    [{ ...original[0], customData: { loomicHidden: true } }, original[1]],
  ]) {
    const result = applyCanvasLayoutGeometry(latest, original, arranged);
    assert.equal(result.conflicted, true);
    assert.equal(result.elements, latest);
  }
});

test("auto layout aborts when a new arrow binds to a moved node while ELK is running", () => {
  const original = [
    { id: "left", type: "rectangle", x: 0, y: 0, width: 100, height: 80, version: 1 },
    { id: "right", type: "rectangle", x: 20, y: 0, width: 100, height: 80, version: 1 },
  ];
  const arranged = [
    { ...original[0], x: -100, version: 2 },
    { ...original[1], x: 140, version: 2 },
  ];
  const latest = [
    ...original,
    { id: "new-edge", type: "arrow", x: 100, y: 40, width: 100, height: 0, points: [[0, 0], [100, 0]], startBinding: { elementId: "left" }, endBinding: { elementId: "right" } },
  ];
  const result = applyCanvasLayoutGeometry(latest, original, arranged);
  assert.equal(result.conflicted, true);
  assert.equal(result.elements, latest);
});

test("auto layout aborts when an existing visual arrow is rebound while ELK is running", () => {
  const visualArrow = { id: "visual-edge", type: "arrow", x: 0, y: 120, width: 100, height: 0, points: [[0, 0], [100, 0]] };
  const original = [
    { id: "left", type: "rectangle", x: 0, y: 0, width: 100, height: 80, version: 1 },
    { id: "right", type: "rectangle", x: 20, y: 0, width: 100, height: 80, version: 1 },
    visualArrow,
  ];
  const arranged = [
    { ...original[0], x: -100, version: 2 },
    { ...original[1], x: 140, version: 2 },
    visualArrow,
  ];
  const latest = [
    original[0],
    original[1],
    { ...visualArrow, startBinding: { elementId: "left" }, endBinding: { elementId: "right" } },
  ];
  const result = applyCanvasLayoutGeometry(latest, original, arranged);
  assert.equal(result.conflicted, true);
  assert.equal(result.elements, latest);
});

test("auto layout restore rejects geometry or structure changes made during confirmation", () => {
  const original = [
    { id: "left", type: "rectangle", x: 0, y: 0, width: 100, height: 80, version: 1, groupIds: [] },
    { id: "right", type: "rectangle", x: 20, y: 0, width: 100, height: 80, version: 1, groupIds: [] },
  ];
  const arranged = [
    { ...original[0], x: -100, version: 2 },
    { ...original[1], x: 140, version: 2 },
  ];
  assert.equal(hasCanvasLayoutRestoreConflict([
    { ...arranged[0], label: "content edit is safe" },
    arranged[1],
  ], original, arranged), false);
  assert.equal(hasCanvasLayoutRestoreConflict([
    { ...arranged[0], groupIds: ["new-group"] },
    arranged[1],
  ], original, arranged), true);
  assert.equal(hasCanvasLayoutRestoreConflict([
    ...arranged,
    { id: "new-edge", type: "arrow", x: 0, y: 0, width: 10, height: 0, points: [[0, 0], [10, 0]], startBinding: { elementId: "left" } },
  ], original, arranged), true);
});

test("auto layout is available from the bottom bar and Option or Alt shortcut", () => {
  assert.match(bottomBar, /aria-keyshortcuts="Alt\+Shift\+F"/);
  assert.match(editor, /matchesCanvasShortcut\(event, "arrange"\)/);
  assert.match(editor, /autoLayoutCanvasElements\(currentElements, canvasLayoutSettingsToOptions\(layoutSettings\)\)/);
  assert.match(editor, /captureUpdate: "IMMEDIATELY"/);
});

test("auto layout asks whether to restore or keep the arranged result", () => {
  assert.match(editor, /const \[autoLayoutReview, setAutoLayoutReview\] = useState\(null\)/);
  assert.match(editor, /if \(autoLayoutReview\) return/);
  assert.match(editor, /applyCanvasLayoutGeometry\(latestElements, currentElements, arrangedElements\)/);
  assert.match(editor, /canvasScopeRef\.current\.api !== api \|\| canvasScopeRef\.current\.canvasId !== canvasId/);
  assert.match(editor, /\} catch \(error\) \{\s*if \(canvasScopeRef\.current\.api !== api \|\| canvasScopeRef\.current\.canvasId !== canvasId\) return;/);
  assert.match(editor, /\}, \[api, autoLayoutReview, canvasId, layoutSettings\]\);/);
  const layoutAwaitIndex = editor.indexOf("const arrangedElements = await autoLayoutCanvasElements");
  const viewportSnapshotIndex = editor.indexOf("const currentAppState = api.getAppState();", layoutAwaitIndex);
  const layoutApplyIndex = editor.indexOf("api.updateScene({ elements: layoutResult.elements", layoutAwaitIndex);
  assert.ok(layoutAwaitIndex >= 0 && viewportSnapshotIndex > layoutAwaitIndex && layoutApplyIndex > viewportSnapshotIndex);
  assert.match(editor, /setMinimapOpen\(false\)/);
  assert.match(editor, /arrangedElements: layoutResult\.elements/);
  assert.match(bottomBar, /ref=\{minimapRef\}[^>]*disabled=\{autoLayoutReviewOpen\}/);
  assert.match(editor, /appState: \{ scrollX: currentAppState\.scrollX, scrollY: currentAppState\.scrollY, zoom: currentAppState\.zoom \}/);
  assert.match(editor, /restoreCanvasLayoutElements\(currentElements, autoLayoutReview\.elements\)/);
  assert.match(editor, /hasCanvasLayoutRestoreConflict\(currentElements, autoLayoutReview\.elements, autoLayoutReview\.arrangedElements\)/);
  assert.match(editor, /animate: false/);
  assert.match(bottomBar, /是否保留此次整理结果？/);
  assert.match(bottomBar, />还原<\/button>/);
  assert.match(bottomBar, />保留<\/button>/);
  assert.match(styles, /\.loomic-layout-review/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.loomic-layout-review\s*\{[^}]*position:\s*fixed;/);
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
  assert.match(editor, /visibleCanvasFitElements\(api\.getSceneElements\?\.\(\)\)/);
  assert.match(editor, /api\.scrollToContent\?\.\(fitElements\)/);
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

test("the primary tool menu stays centered on the viewport when side panels open", () => {
  assert.match(styles, /\.loomic-tool-menu \{[^}]*position: fixed;[^}]*left: 50vw;/);
  assert.match(styles, /@media \(min-width: 769px\) \{[\s\S]*?\.loomic-tool-menu \{ left: calc\(50vw \/ var\(--app-ui-scale, 1\)\); \}/);
  assert.doesNotMatch(toolMenu, /className="loomic-tool-menu"\s+style=/);
  assert.match(bottomBar, /className=\{`loomic-bottom-bar \$\{leftPanelOpen \? "is-panel-shifted" : ""\}`\}/);
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1600px\) \{[^}]*\.loomic-bottom-bar\.is-panel-shifted \{ bottom: 58px; \}/);
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1470px\) \{[\s\S]*?\.loomic-bottom-bar \{ position: fixed; bottom: 72px; max-width: calc\(100vw - 32px\); overflow-x: auto; scrollbar-width: none; \}/);
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1470px\) \{[\s\S]*?\.loomic-bottom-bar\.is-panel-shifted \{ margin-left: calc\(var\(--workbench-rail-width, 5\.4rem\) \+ 0\.45rem\); bottom: 72px; max-width: calc\(100vw - var\(--workbench-rail-width, 5\.4rem\) - 0\.45rem - 308px\); \}/);
  assert.doesNotMatch(styles, /\.loomic-bottom-bar\.is-panel-shifted \{[^}]*!important/);
});

test("the primary tool menu uses the neutral LibTV capsule presentation", () => {
  const menuRule = styles.match(/\.loomic-tool-menu \{[^}]*\}/)?.[0] ?? "";
  const addNodeRule = styles.match(/\.loomic-add-node-button \{[^}]*\}/)?.[0] ?? "";

  assert.match(menuRule, /padding: 6px;/);
  assert.match(menuRule, /border: 1px solid var\(--lc-border\);/);
  assert.match(menuRule, /border-radius: 10px;/);
  assert.match(menuRule, /background: var\(--lc-panel-solid\);/);
  assert.match(menuRule, /box-shadow: 0 8px 24px rgba\(0, 0, 0, \.24\);/);
  assert.doesNotMatch(menuRule, /background: transparent;/);
  assert.match(addNodeRule, /color: var\(--lc-bg\);/);
  assert.match(addNodeRule, /background: var\(--lc-text\);/);
  assert.doesNotMatch(addNodeRule, /--lc-accent/);
});
