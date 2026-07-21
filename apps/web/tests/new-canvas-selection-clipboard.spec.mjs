import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { collectCanvasWorkflowEdges } from "../new-canvas/src/loomic-core/canvas-workflow-edges.js";
import {
  CANVAS_CLIPBOARD_TYPE,
  cloneCanvasSelectionClipboard,
  createCanvasSelectionClipboard,
  duplicateCanvasSelection,
  groupCanvasSelection,
  serializeCanvasSelectionClipboard,
} from "../new-canvas/src/loomic-core/canvas-selection-clipboard.js";
import { duplicateSelectedElements } from "../new-canvas/src/loomic-shell/canvasApi.js";
import { createCanvasDragDuplicate } from "../new-canvas/src/loomic-core/canvas-drag-duplicate.js";

const editor = await readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8");
const logoMenu = await readFile(new URL("../new-canvas/src/loomic-shell/CanvasLogoMenu.jsx", import.meta.url), "utf8");

function node(id, type, x) {
  return {
    id,
    type: type === "text" ? "text" : "rectangle",
    x,
    y: 20,
    width: 160,
    height: 80,
    version: 1,
    isDeleted: false,
    groupIds: [],
    boundElements: [],
    customData: type === "text" ? { type: "text-node" } : { type },
  };
}

function edge(id, source, target) {
  return {
    id,
    type: "arrow",
    x: 0,
    y: 0,
    width: 100,
    height: 0,
    points: [[0, 0], [100, 0]],
    startBinding: { elementId: source, fixedPoint: [1, 0.5] },
    endBinding: { elementId: target, fixedPoint: [0, 0.5] },
    customData: { workflowEdge: true },
    isDeleted: false,
  };
}

function workflowFixture() {
  const text = node("text", "text", 0);
  const image = node("image", "image-generator", 300);
  const video = node("video", "video-generator", 650);
  const textImage = edge("text-image", "text", "image");
  const imageVideo = edge("image-video", "image", "video");
  text.boundElements = [{ id: textImage.id, type: "arrow" }];
  image.boundElements = [{ id: textImage.id, type: "arrow" }, { id: imageVideo.id, type: "arrow" }];
  video.boundElements = [{ id: imageVideo.id, type: "arrow" }];
  return [text, image, video, textImage, imageVideo];
}

test("selection clipboard includes internal workflow edges and strips external bindings", () => {
  const clipboard = createCanvasSelectionClipboard(workflowFixture(), { text: true, image: true });
  assert.deepEqual(clipboard.elements.map((element) => element.id), ["text", "image", "text-image"]);
  assert.deepEqual(clipboard.elements.find((element) => element.id === "text").boundElements, [{ id: "text-image", type: "arrow" }]);
  assert.deepEqual(clipboard.elements.find((element) => element.id === "image").boundElements, [{ id: "text-image", type: "arrow" }]);
  assert.equal(clipboard.elements.some((element) => element.id === "image-video"), false);
});

test("pasted workflow subgraphs receive fresh ids and retain only their internal typed edge", () => {
  const clipboard = createCanvasSelectionClipboard(workflowFixture(), ["text", "image"]);
  let sequence = 0;
  const pasted = cloneCanvasSelectionClipboard(clipboard, {
    idFactory: () => `new-${++sequence}`,
    randomFactory: () => 42,
    offset: 40,
  });
  const textId = pasted.idMap.get("text");
  const imageId = pasted.idMap.get("image");
  const edgeId = pasted.idMap.get("text-image");
  const clonedEdge = pasted.elements.find((element) => element.id === edgeId);
  assert.notEqual(textId, "text");
  assert.notEqual(imageId, "image");
  assert.equal(clonedEdge.startBinding.elementId, textId);
  assert.equal(clonedEdge.endBinding.elementId, imageId);
  assert.deepEqual(pasted.elements.find((element) => element.id === textId).boundElements, [{ id: edgeId, type: "arrow" }]);
  assert.deepEqual(pasted.elements.find((element) => element.id === imageId).boundElements, [{ id: edgeId, type: "arrow" }]);
  assert.equal(collectCanvasWorkflowEdges(pasted.elements).length, 1);
  assert.deepEqual(Object.keys(pasted.selectedElementIds).sort(), [imageId, textId].sort());
});

test("group, frame, and bound-text identities are remapped without joining the originals", () => {
  const frame = { ...node("frame", "shape", 0), type: "frame", groupIds: ["group"] };
  const shape = { ...node("shape", "shape", 20), frameId: "frame", groupIds: ["group"], boundElements: [{ id: "label", type: "text" }] };
  const label = { ...node("label", "text", 30), containerId: "shape", frameId: "frame", groupIds: ["group"] };
  const clipboard = createCanvasSelectionClipboard([frame, shape, label], { frame: true });
  let sequence = 0;
  const pasted = cloneCanvasSelectionClipboard(clipboard, { idFactory: () => `clone-${++sequence}`, offset: 0 });
  const clonedFrame = pasted.elements.find((element) => element.id === pasted.idMap.get("frame"));
  const clonedShape = pasted.elements.find((element) => element.id === pasted.idMap.get("shape"));
  const clonedLabel = pasted.elements.find((element) => element.id === pasted.idMap.get("label"));
  assert.equal(clonedShape.frameId, clonedFrame.id);
  assert.equal(clonedLabel.frameId, clonedFrame.id);
  assert.equal(clonedLabel.containerId, clonedShape.id);
  assert.notEqual(clonedShape.groupIds[0], "group");
  assert.equal(clonedLabel.groupIds[0], clonedShape.groupIds[0]);
});

test("copying one frame child detaches the clone instead of copying unrelated frame content", () => {
  const frame = { ...node("frame", "shape", 0), type: "frame" };
  const selected = { ...node("selected", "shape", 20), frameId: "frame" };
  const unrelated = { ...node("unrelated", "shape", 220), frameId: "frame" };
  const clipboard = createCanvasSelectionClipboard([frame, selected, unrelated], { selected: true });
  assert.deepEqual(clipboard.elements.map((element) => element.id), ["selected"]);
  assert.equal(clipboard.elements[0].frameId, null);
});

test("clipboard serialization carries only files referenced by the copied subgraph", () => {
  const image = { ...node("image", "shape", 0), type: "image", fileId: "file-a" };
  const clipboard = createCanvasSelectionClipboard([image], { image: true });
  const serialized = JSON.parse(serializeCanvasSelectionClipboard(clipboard, {
    "file-a": { id: "file-a", dataURL: "data:image/png;base64,a" },
    "file-b": { id: "file-b", dataURL: "data:image/png;base64,b" },
  }));
  assert.equal(serialized.type, CANVAS_CLIPBOARD_TYPE);
  assert.deepEqual(Object.keys(serialized.files), ["file-a"]);
});

test("menu and keyboard duplication use the safe subgraph path and a single undo update", () => {
  const source = workflowFixture();
  let update = null;
  const api = {
    getSceneElements: () => source,
    getAppState: () => ({ selectedElementIds: { text: true, image: true } }),
    updateScene: (value) => { update = value; },
  };
  const clones = duplicateSelectedElements(api);
  assert.equal(clones.length, 3);
  assert.equal(update.elements.length, source.length + 3);
  assert.equal(update.captureUpdate, "IMMEDIATELY");
  assert.equal(collectCanvasWorkflowEdges(clones).length, 1);
  assert.match(editor, /duplicateCanvasSelection\(currentElements/);
  assert.match(editor, /navigator\.clipboard\.writeText/);
  assert.match(editor, /serializeCanvasSelectionClipboard/);
  assert.match(editor, /onCopyCapture=\{handleCopyCapture\}/);
  assert.match(editor, /matchesCanvasShortcut\(event, "duplicate"\)/);
  assert.match(editor, /matchesCanvasShortcut\(event, "group"\)/);
  assert.match(editor, /matchesCanvasShortcut\(event, "ungroup"\)/);
  assert.match(editor, /ungroupCanvasLayers/);
  for (const label of ["复制对象", "粘贴对象", "快速复制对象"]) assert.match(logoMenu, new RegExp(label));
});

test("storyboard grouping assigns one group to selected nodes and their internal edge", () => {
  const source = workflowFixture();
  const result = groupCanvasSelection(source, { text: true, image: true }, {
    idFactory: () => "storyboard-group",
    randomFactory: () => 17,
    now: 123,
  });
  assert.equal(result.groupId, "storyboard-group");
  assert.deepEqual(result.groupedIds, ["text", "image", "text-image"]);
  for (const id of result.groupedIds) {
    const grouped = result.elements.find((element) => element.id === id);
    assert.deepEqual(grouped.groupIds, ["storyboard-group"]);
    assert.equal(grouped.version, 2);
    assert.equal(grouped.versionNonce, 17);
    assert.equal(grouped.updated, 123);
  }
  assert.strictEqual(result.elements.find((element) => element.id === "video"), source.find((element) => element.id === "video"));
  assert.equal(groupCanvasSelection(source, { text: true }).groupId, "");
});

test("duplicateCanvasSelection leaves the source objects unchanged", () => {
  const source = workflowFixture();
  const before = JSON.stringify(source);
  const result = duplicateCanvasSelection(source, { text: true, image: true }, { offset: 24 });
  assert.equal(JSON.stringify(source), before);
  assert.equal(result.clones.length, 3);
  assert.strictEqual(result.elements[0], source[0]);
});

test("Alt drag duplicates nodes without edges and keeps original ids at their positions", () => {
  const before = workflowFixture();
  const moved = before.map((element) => element.id === "image" ? { ...element, x: element.x + 120, y: element.y + 45 } : element);
  let sequence = 0;
  const result = createCanvasDragDuplicate(before, moved, { image: true }, {
    idFactory: () => `alt-${++sequence}`,
    randomFactory: () => 9,
  });
  assert.equal(result.connectionPolicy, "none");
  assert.equal(result.elements.find((element) => element.id === "image").x, 300);
  assert.equal(result.clones.filter((element) => element.type === "arrow").length, 0);
  assert.equal(result.clones.find((element) => element.type !== "arrow").x, 420);
  assert.deepEqual(result.clones.find((element) => element.type !== "arrow").boundElements, null);
});

test("primary Alt drag copies every upstream edge for one node and never its downstream edge", () => {
  const before = workflowFixture();
  before.find((element) => element.id === "image").customData.title = "高清";
  const moved = before.map((element) => element.id === "image" ? { ...element, x: element.x + 80 } : element);
  let sequence = 0;
  const result = createCanvasDragDuplicate(before, moved, { image: true }, {
    copyConnections: true,
    idFactory: () => `primary-${++sequence}`,
    randomFactory: () => 11,
  });
  const clonedNodeId = result.idMap.get("image");
  const copiedEdges = collectCanvasWorkflowEdges(result.elements).filter((edge) => edge.targetNodeId === clonedNodeId);
  assert.equal(result.connectionPolicy, "upstream");
  assert.deepEqual(copiedEdges.map(({ sourceNodeId }) => sourceNodeId), ["text"]);
  assert.equal(collectCanvasWorkflowEdges(result.elements).some((edge) => edge.sourceNodeId === clonedNodeId && edge.targetNodeId === "video"), false);
  assert.equal(result.elements.find((element) => element.id === clonedNodeId).customData.title, "高清 - 副本");
});

test("primary Alt drag of multiple nodes copies only internal edges", () => {
  const before = workflowFixture();
  const moved = before.map((element) => ["text", "image"].includes(element.id) ? { ...element, x: element.x + 70, y: element.y + 20 } : element);
  let sequence = 0;
  const result = createCanvasDragDuplicate(before, moved, { text: true, image: true }, {
    copyConnections: true,
    idFactory: () => `multi-${++sequence}`,
    randomFactory: () => 13,
  });
  const cloneIds = new Set([result.idMap.get("text"), result.idMap.get("image")]);
  const copiedEdges = collectCanvasWorkflowEdges(result.clones);
  assert.equal(result.connectionPolicy, "internal");
  assert.equal(copiedEdges.length, 1);
  assert.ok(cloneIds.has(copiedEdges[0].sourceNodeId));
  assert.ok(cloneIds.has(copiedEdges[0].targetNodeId));
  assert.equal(result.clones.some((element) => element.type === "arrow" && element.endBinding?.elementId === "video"), false);
});

test("drag duplication ignores locked nodes and movement below threshold", () => {
  const source = workflowFixture();
  assert.equal(createCanvasDragDuplicate(source, source, { image: true }), null);
  const locked = source.map((element) => element.id === "image" ? { ...element, locked: true } : element);
  const moved = locked.map((element) => element.id === "image" ? { ...element, x: element.x + 20 } : element);
  assert.equal(createCanvasDragDuplicate(locked, moved, { image: true }), null);
  assert.match(editor, /onPointerDownCapture=\{captureDragDuplicateIntent\}/);
  assert.match(editor, /onPointerDown=\{beginDragDuplicate\}/);
  assert.match(editor, /onPointerUp=\{finishDragDuplicate\}/);
  assert.match(editor, /captureUpdate: "NONE"/);
});
