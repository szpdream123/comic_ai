import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canvasPortScenePosition,
  canvasPortScreenPosition,
  createCanvasWorkflowConnection,
  disconnectCanvasWorkflowConnection,
  findCanvasWorkflowIncomingConnection,
  isCanvasConnectionShortcut,
  reconnectCanvasWorkflowConnection,
} from "../new-canvas/src/loomic-core/canvas-ports.js";
import { collectUpstreamCanvasInput } from "../new-canvas/src/loomic-core/canvas-generation.js";
import { hydrateCanvasElementsForDisplay } from "../new-canvas/src/loomic-core/canvas-file-persistence.js";

const overlaySource = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasPortsOverlay.jsx", import.meta.url),
  "utf8",
);
const editorSource = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url),
  "utf8",
);
const toolMenuSource = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url),
  "utf8",
);
const coreStyles = await readFile(
  new URL("../new-canvas/src/loomic-core/loomic-core.css", import.meta.url),
  "utf8",
);

test("connection shortcut requires the LibTV primary modifier", () => {
  assert.equal(isCanvasConnectionShortcut({ key: "l", ctrlKey: true }), true);
  assert.equal(isCanvasConnectionShortcut({ key: "L", metaKey: true }), true);
  assert.equal(isCanvasConnectionShortcut({ key: "l" }), false);
  assert.equal(isCanvasConnectionShortcut({ key: "l", altKey: true }), false);
  assert.equal(isCanvasConnectionShortcut({ key: "l", shiftKey: true }), false);
  assert.equal(isCanvasConnectionShortcut({ key: "k", ctrlKey: true }), false);
});

function imageNode(id, x = 0) {
  return {
    id,
    type: "rectangle",
    x,
    y: 20,
    width: 200,
    height: 100,
    angle: 0,
    version: 1,
    customData: { type: "image-generator" },
  };
}

function videoNode(id, x = 0) {
  return {
    ...imageNode(id, x),
    customData: { type: "video-generator" },
  };
}

test("typed canvas ports follow element geometry, pan, zoom, and rotation", () => {
  const element = { x: 100, y: 50, width: 200, height: 80, angle: 0 };
  assert.deepEqual(canvasPortScenePosition(element, "input"), { x: 100, y: 90 });
  assert.deepEqual(canvasPortScenePosition(element, "output"), { x: 300, y: 90 });
  assert.deepEqual(
    canvasPortScreenPosition(element, "output", {
      scrollX: -20,
      scrollY: 10,
      zoom: { value: 2 },
      offsetLeft: 240,
      offsetTop: 60,
    }),
    { x: 560, y: 200 },
  );

  const rotated = canvasPortScenePosition({ ...element, angle: Math.PI / 2 }, "output");
  assert.ok(Math.abs(rotated.x - 200) < 0.000001);
  assert.ok(Math.abs(rotated.y - 190) < 0.000001);
});

test("typed canvas connection creates a bound workflow arrow and updates both endpoints", () => {
  const source = { id: "script", type: "text", x: 10, y: 20, width: 120, height: 30, version: 1 };
  const target = imageNode("image", 260);
  const result = createCanvasWorkflowConnection([source, target], "script", "image", { arrowId: "edge" });

  assert.equal(result.ok, true);
  assert.equal(result.arrow.customData.workflowEdge, true);
  assert.equal(result.arrow.startBinding.elementId, "script");
  assert.equal(result.arrow.endBinding.elementId, "image");
  assert.deepEqual(result.edge, {
    id: "edge:workflow-edge",
    sourceNodeId: "script",
    sourcePortId: "out_text",
    targetNodeId: "image",
    targetPortId: "in_asset",
    data: { kind: "text" },
  });
  assert.deepEqual(result.elements[0].boundElements, [{ id: "edge", type: "arrow" }]);
  assert.deepEqual(result.elements[1].boundElements, [{ id: "edge", type: "arrow" }]);
  assert.equal(result.elements.at(-1).id, "edge");
});

test("typed canvas connection rejects self, type mismatch, and cycles without changing elements", () => {
  const first = imageNode("first", 0);
  const second = imageNode("second", 300);
  const video = videoNode("video", 600);

  const self = createCanvasWorkflowConnection([first], "first", "first", { arrowId: "self" });
  assert.equal(self.ok, false);
  assert.equal(self.reason, "canvas_workflow_edge_self_connection");
  assert.strictEqual(self.elements[0], first);

  const mismatch = createCanvasWorkflowConnection([video, first], "video", "first", { arrowId: "mismatch" });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "canvas_workflow_edge_kind_mismatch");

  const forward = createCanvasWorkflowConnection([first, second], "first", "second", { arrowId: "forward" });
  const cycle = createCanvasWorkflowConnection(forward.elements, "second", "first", { arrowId: "cycle" });
  assert.equal(cycle.ok, false);
  assert.equal(cycle.reason, "canvas_workflow_edge_cycle");
  assert.strictEqual(cycle.elements, forward.elements);

  const duplicate = createCanvasWorkflowConnection(forward.elements, "first", "second", { arrowId: "duplicate" });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, "canvas_workflow_edge_duplicate");
  assert.strictEqual(duplicate.elements, forward.elements);
});

test("typed canvas connection reconnects an existing arrow without leaving stale bindings", () => {
  const first = imageNode("first", 0);
  const second = imageNode("second", 300);
  const third = imageNode("third", 600);
  const connected = createCanvasWorkflowConnection([first, second, third], "first", "second", { arrowId: "edge" });
  const reconnected = reconnectCanvasWorkflowConnection(connected.elements, "edge", "third");

  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.arrow.id, "edge");
  assert.equal(reconnected.arrow.startBinding.elementId, "first");
  assert.equal(reconnected.arrow.endBinding.elementId, "third");
  assert.equal(reconnected.elements.filter((element) => element.id === "edge").length, 1);
  assert.deepEqual(reconnected.elements.find((element) => element.id === "second").boundElements, []);
  assert.deepEqual(reconnected.elements.find((element) => element.id === "third").boundElements, [{ id: "edge", type: "arrow" }]);
  assert.deepEqual(reconnected.elements.find((element) => element.id === "first").boundElements, [{ id: "edge", type: "arrow" }]);
});

test("legacy typed arrows can be found, disconnected, and reconnected without stale generation input", () => {
  const script = {
    id: "script",
    type: "text",
    text: "雨夜旧输入",
    boundElements: [{ id: "legacy-edge", type: "arrow" }],
  };
  const first = {
    ...imageNode("first", 300),
    boundElements: [{ id: "legacy-edge", type: "arrow" }],
  };
  const second = imageNode("second", 600);
  const legacyArrow = {
    id: "legacy-edge",
    type: "arrow",
    startBinding: { elementId: "script" },
    endBinding: { elementId: "first" },
  };
  const elements = hydrateCanvasElementsForDisplay([script, first, second, legacyArrow]);
  assert.equal(elements.find((element) => element.id === "legacy-edge").customData.workflowEdge, true);

  assert.equal(findCanvasWorkflowIncomingConnection(elements, "first")?.id, "legacy-edge");
  assert.deepEqual(collectUpstreamCanvasInput(elements, {}, "first").upstreamTextFragments, ["雨夜旧输入"]);

  const reconnected = reconnectCanvasWorkflowConnection(elements, "legacy-edge", "second");
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.arrow.customData.workflowEdge, true);
  assert.deepEqual(reconnected.elements.find((element) => element.id === "first").boundElements, []);
  assert.deepEqual(collectUpstreamCanvasInput(reconnected.elements, {}, "first").upstreamTextFragments, []);
  assert.deepEqual(collectUpstreamCanvasInput(reconnected.elements, {}, "second").upstreamTextFragments, ["雨夜旧输入"]);

  const disconnected = disconnectCanvasWorkflowConnection(elements, "legacy-edge");
  assert.equal(disconnected.ok, true);
  assert.equal(disconnected.elements.find((element) => element.id === "legacy-edge").isDeleted, true);
  assert.deepEqual(collectUpstreamCanvasInput(disconnected.elements, {}, "first").upstreamTextFragments, []);
});

test("disconnect and reconnect collapse imported duplicate typed arrows as one connection", () => {
  const script = {
    id: "script",
    type: "text",
    text: "雨夜",
    boundElements: [{ id: "edge-a", type: "arrow" }, { id: "edge-b", type: "arrow" }],
  };
  const first = {
    ...imageNode("first", 300),
    boundElements: [{ id: "edge-a", type: "arrow" }, { id: "edge-b", type: "arrow" }],
  };
  const second = imageNode("second", 600);
  const duplicateEdges = [
    { id: "edge-a", type: "arrow", startBinding: { elementId: "script" }, endBinding: { elementId: "first" }, customData: { workflowEdge: true } },
    { id: "edge-b", type: "arrow", startBinding: { elementId: "script" }, endBinding: { elementId: "first" }, customData: { workflowEdge: true } },
  ];
  const elements = [script, first, second, ...duplicateEdges];

  const disconnected = disconnectCanvasWorkflowConnection(elements, "edge-a");
  assert.deepEqual(disconnected.disconnectedArrowIds, ["edge-a", "edge-b"]);
  assert.equal(disconnected.elements.find((element) => element.id === "edge-a").isDeleted, true);
  assert.equal(disconnected.elements.find((element) => element.id === "edge-b").isDeleted, true);
  assert.deepEqual(disconnected.elements.find((element) => element.id === "script").boundElements, []);
  assert.deepEqual(collectUpstreamCanvasInput(disconnected.elements, {}, "first").upstreamTextFragments, []);

  const reconnected = reconnectCanvasWorkflowConnection(elements, "edge-a", "second");
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.elements.filter((element) => ["edge-a", "edge-b"].includes(element.id)).length, 1);
  assert.equal(reconnected.elements.find((element) => element.id === "edge-a").endBinding.elementId, "second");
  assert.deepEqual(collectUpstreamCanvasInput(reconnected.elements, {}, "first").upstreamTextFragments, []);
  assert.deepEqual(collectUpstreamCanvasInput(reconnected.elements, {}, "second").upstreamTextFragments, ["雨夜"]);
});

test("invalid reconnect keeps the original connection and disconnect removes endpoint bindings", () => {
  const image = imageNode("image", 0);
  const target = imageNode("target", 300);
  const video = videoNode("video", 600);
  const connected = createCanvasWorkflowConnection([video, image, target], "image", "target", { arrowId: "edge" });
  const invalid = reconnectCanvasWorkflowConnection(connected.elements, "edge", "image");

  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "canvas_workflow_edge_self_connection");
  assert.strictEqual(invalid.elements, connected.elements);

  const disconnected = disconnectCanvasWorkflowConnection(connected.elements, "edge");
  assert.equal(disconnected.ok, true);
  assert.equal(disconnected.elements.find((element) => element.id === "edge").isDeleted, true);
  assert.deepEqual(disconnected.elements.find((element) => element.id === "image").boundElements, []);
  assert.deepEqual(disconnected.elements.find((element) => element.id === "target").boundElements, []);
});

test("canvas editor mounts accessible typed port controls and connection feedback", () => {
  assert.match(editorSource, /<CanvasPortsOverlay excalidrawApi=\{api\} connectionModeActive=\{connectionModeActive\} onConnectionModeChange=\{setConnectionModeActive\}/);
  assert.match(overlaySource, /canvasWorkflowNode\(element\)/);
  assert.match(overlaySource, /createCanvasWorkflowConnection/);
  assert.match(overlaySource, /reconnectCanvasWorkflowConnection/);
  assert.match(overlaySource, /disconnectCanvasWorkflowConnection/);
  assert.match(overlaySource, /document\.addEventListener\("pointermove"/);
  assert.match(overlaySource, /document\.elementFromPoint/);
  assert.match(overlaySource, /className="loomic-port-drag-preview"/);
  assert.match(overlaySource, /event\.key === "Escape" && \(selectedOutput \|\| dragRef\.current\)/);
  assert.match(overlaySource, /isCanvasConnectionShortcut\(event\)/);
  assert.match(overlaySource, /已进入连线模式，请点击目标输入端口/);
  assert.match(overlaySource, /role=\{notice\.kind === "error" \? "alert" : "status"\}/);
  assert.match(overlaySource, /aria-pressed=\{selected\}/);
  assert.match(overlaySource, /\|\| NODE_LABELS\[node\.type\]/);
  assert.match(coreStyles, /\.loomic-canvas-port\.is-compatible/);
  assert.match(coreStyles, /\.loomic-canvas-port\.is-incompatible/);
  assert.match(coreStyles, /\.loomic-port-drag-preview path/);
});

test("LibTV connection tool controls the real typed-port mode", () => {
  assert.match(toolMenuSource, /aria-label="连接节点"/);
  assert.match(toolMenuSource, /aria-keyshortcuts="Control\+L Meta\+L"/);
  assert.match(toolMenuSource, /aria-pressed=\{connectionModeActive\}/);
  assert.match(toolMenuSource, /onConnectionModeChange\?\.\(!connectionModeActive\)/);
  assert.doesNotMatch(toolMenuSource, /连接节点[\s\S]{0,300}setActiveTool\(\{ type: "arrow" \}\)/);
  assert.match(overlaySource, /activateSelectedOutput\(\)/);
  assert.match(overlaySource, /onConnectionModeChange\?\.\(true\)/);
  assert.match(overlaySource, /onConnectionModeChange\?\.\(false\)/);
});
