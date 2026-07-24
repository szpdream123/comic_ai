import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCanvasLayerTree,
  filterCanvasLayers,
  getCanvasLayerGroupElementIds,
  getLayerType,
  LAYER_TYPE_OPTIONS,
} from "../new-canvas/src/loomic-core/canvas-layer-utils.js";
import {
  deleteCanvasLayers,
  dropCanvasLayers,
  groupCanvasLayers,
  moveCanvasLayer,
  moveCanvasLayers,
  renameCanvasLayer,
  renameCanvasLayerGroup,
  setCanvasLayersLocked,
  setCanvasLayersVisible,
  ungroupCanvasLayers,
} from "../new-canvas/src/loomic-core/canvas-layer-operations.js";

const panel = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasLayersPanel.jsx", import.meta.url),
  "utf8",
);
const operationsSource = await readFile(
  new URL("../new-canvas/src/loomic-core/canvas-layer-operations.js", import.meta.url),
  "utf8",
);
const portsOverlay = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasPortsOverlay.jsx", import.meta.url),
  "utf8",
);

const elements = [
  { id: "copy", type: "text", text: "城市夜景" },
  { id: "image", type: "image" },
  { id: "image-generator", type: "rectangle", customData: { type: "image-generator", prompt: "霓虹街道" } },
  { id: "video-generator", type: "rectangle", customData: { type: "video-generator", prompt: "镜头推进" } },
  { id: "edge", type: "arrow" },
];

const labels = new Map([
  ["copy", "城市夜景"],
  ["image", "图片"],
  ["image-generator", "霓虹街道"],
  ["video-generator", "镜头推进"],
  ["edge", "箭头"],
]);

test("layer type filters preserve generator semantics", () => {
  assert.equal(getLayerType(elements[0]), "text");
  assert.equal(getLayerType(elements[1]), "image");
  assert.equal(getLayerType(elements[2]), "image");
  assert.equal(getLayerType(elements[3]), "video");
  assert.equal(getLayerType(elements[4]), "connection");
  assert.deepEqual(LAYER_TYPE_OPTIONS.map(({ value }) => value), ["all", "text", "image", "video", "shape", "connection"]);
});

test("layer search and type filters can be combined", () => {
  const getLabel = (element) => labels.get(element.id);
  assert.deepEqual(filterCanvasLayers(elements, { query: "霓虹", getLabel }).map(({ id }) => id), ["image-generator"]);
  assert.deepEqual(filterCanvasLayers(elements, { type: "image", getLabel }).map(({ id }) => id), ["image", "image-generator"]);
  assert.deepEqual(filterCanvasLayers(elements, { query: "generator", type: "video", getLabel }).map(({ id }) => id), ["video-generator"]);
});

test("layers panel locates selected objects and keeps visibility reversible", () => {
  assert.match(panel, /aria-label="搜索图层"/);
  assert.match(panel, /aria-label="按类型筛选图层"/);
  assert.match(panel, /filterCanvasLayers\(elements/);
  assert.match(panel, /scrollToContent\(element, \{ fitToContent: false, animate: true, duration: 250 \}\)/);
  assert.match(operationsSource, /loomicHidden: !nextVisible/);
  assert.match(operationsSource, /loomicOpacity: nextVisible \? undefined/);
});

test("layer operations rename and reorder without changing element identity", () => {
  const source = [
    { id: "back", type: "rectangle", version: 1 },
    { id: "front", type: "text", text: "原名", version: 1 },
  ];
  const renamed = renameCanvasLayer(source, "front", "镜头说明");
  assert.equal(renamed[1].customData.title, "镜头说明");
  assert.equal(renamed[1].id, "front");
  assert.deepEqual(moveCanvasLayer(renamed, "back", "forward").map(({ id }) => id), ["front", "back"]);
  assert.deepEqual(moveCanvasLayers([
    { id: "back" }, { id: "group-a" }, { id: "group-b" }, { id: "front" },
  ], ["group-a", "group-b"], "forward").map(({ id }) => id), ["back", "front", "group-a", "group-b"]);
});

test("layer tree preserves nested Excalidraw groups and their z-order", () => {
  const tree = buildCanvasLayerTree([
    { id: "front", groupIds: ["outer", "inner"] },
    { id: "middle", groupIds: ["outer", "inner"] },
    { id: "back", groupIds: ["outer"] },
    { id: "loose", groupIds: [] },
  ]);
  assert.deepEqual(tree.map(({ kind, id }) => [kind, id]), [["group", "outer"], ["element", "loose"]]);
  assert.deepEqual(tree[0].elementIds, ["front", "middle", "back"]);
  assert.deepEqual(tree[0].children[0].elementIds, ["front", "middle"]);
  assert.deepEqual(tree[0].children[0].children.map(({ id }) => id), ["front", "middle"]);
  assert.deepEqual(tree[0].groupIds, ["outer"]);
  assert.deepEqual(tree[0].children[0].parentGroupIds, ["outer"]);
});

test("filtered group rows still resolve every member from the complete scene", () => {
  const source = [
    { id: "matching", type: "text", text: "命中", groupIds: ["outer", "inner"] },
    { id: "hidden-by-filter", type: "image", groupIds: ["outer", "inner"] },
    { id: "outer-only", type: "rectangle", groupIds: ["outer"] },
    { id: "other", type: "text", text: "命中", groupIds: ["other"] },
  ];
  const filtered = filterCanvasLayers(source, { query: "命中", getLabel: (element) => element.text ?? "" });
  const tree = buildCanvasLayerTree(filtered);
  assert.deepEqual(tree[0].children[0].elementIds, ["matching"]);
  assert.deepEqual(getCanvasLayerGroupElementIds(source, tree[0].groupIds), ["matching", "hidden-by-filter", "outer-only"]);
  assert.deepEqual(getCanvasLayerGroupElementIds(source, tree[0].children[0].groupIds), ["matching", "hidden-by-filter"]);
  assert.match(panel, /const memberIds = getCanvasLayerGroupElementIds\(elements, node\.groupIds\)/);
  assert.match(panel, /deleteCanvasLayers\(items, memberIds\)/);
});

test("nested layer group names persist on members and resolve in the tree", () => {
  const source = [
    { id: "front", groupIds: ["outer", "inner"], customData: { title: "A" }, version: 1 },
    { id: "back", groupIds: ["outer", "inner"], customData: { title: "B" }, version: 1 },
    { id: "loose", groupIds: [], customData: {}, version: 1 },
  ];
  const outerNamed = renameCanvasLayerGroup(source, "outer", "  第一幕  ");
  const named = renameCanvasLayerGroup(outerNamed, "inner", "镜头组");
  assert.equal(named[0].customData.title, "A");
  assert.equal(named[0].customData.loomicGroupNames.outer, "第一幕");
  assert.equal(named[1].customData.loomicGroupNames.inner, "镜头组");
  assert.equal(named[2], source[2]);
  const tree = buildCanvasLayerTree(JSON.parse(JSON.stringify(named)));
  assert.equal(tree[0].name, "第一幕");
  assert.equal(tree[0].children[0].name, "镜头组");
  assert.deepEqual(filterCanvasLayers(named, { query: "镜头组" }).map(({ id }) => id), ["front", "back"]);
});

test("layer reparenting inherits persisted target names and removes stale names", () => {
  const source = [
    { id: "member", groupIds: ["shots"], customData: { loomicGroupNames: { shots: "镜头组" } }, version: 1 },
    { id: "loose", groupIds: [], customData: {}, version: 1 },
  ];
  const entered = dropCanvasLayers(source, ["loose"], {
    targetIds: ["member"],
    targetParentGroupIds: ["shots"],
  });
  assert.equal(entered.find(({ id }) => id === "loose").customData.loomicGroupNames.shots, "镜头组");
  const rooted = dropCanvasLayers(entered, ["loose"], {
    sourceParentGroupIds: ["shots"],
    targetParentGroupIds: [],
  });
  assert.equal(rooted.find(({ id }) => id === "loose").customData.loomicGroupNames, undefined);
});

test("layer drag/drop reorders blocks and reparents elements without flattening nested groups", () => {
  const source = [
    { id: "back", groupIds: [], version: 1 },
    { id: "outer-a", groupIds: ["outer"], version: 1 },
    { id: "inner-a", groupIds: ["outer", "inner"], version: 1 },
    { id: "inner-b", groupIds: ["outer", "inner"], version: 1 },
    { id: "front", groupIds: [], version: 1 },
  ];
  const entered = dropCanvasLayers(source, ["back"], {
    sourceParentGroupIds: [],
    targetIds: ["inner-a", "inner-b"],
    targetParentGroupIds: ["outer", "inner"],
    position: "forward",
  });
  assert.deepEqual(entered.map(({ id }) => id), ["outer-a", "inner-a", "inner-b", "back", "front"]);
  assert.deepEqual(entered.find(({ id }) => id === "back").groupIds, ["outer", "inner"]);

  const movedGroup = dropCanvasLayers(source, ["inner-a", "inner-b"], {
    sourceParentGroupIds: ["outer"],
    targetIds: ["front"],
    targetParentGroupIds: [],
    position: "forward",
  });
  assert.deepEqual(movedGroup.map(({ id }) => id), ["back", "outer-a", "front", "inner-a", "inner-b"]);
  assert.deepEqual(movedGroup.filter(({ id }) => id.startsWith("inner")).map(({ groupIds }) => groupIds), [["inner"], ["inner"]]);
});

test("layer drag/drop prevents recursive groups and supports moving an element to root", () => {
  const source = [
    { id: "outer-a", groupIds: ["outer"], version: 1 },
    { id: "inner-a", groupIds: ["outer", "inner"], version: 1 },
    { id: "inner-b", groupIds: ["outer", "inner"], version: 1 },
  ];
  assert.equal(dropCanvasLayers(source, source.map(({ id }) => id), {
    sourceParentGroupIds: [],
    targetParentGroupIds: ["outer", "inner"],
  }), source);
  const rooted = dropCanvasLayers(source, ["inner-a"], {
    sourceParentGroupIds: ["outer", "inner"],
    targetParentGroupIds: [],
    position: "forward",
  });
  assert.equal(rooted.at(-1).id, "inner-a");
  assert.deepEqual(rooted.at(-1).groupIds, []);
});

test("layer batch operations preserve reversible visibility and grouping", () => {
  const source = [
    { id: "a", opacity: 72, locked: false, groupIds: [], version: 1 },
    { id: "b", opacity: 100, locked: false, groupIds: [], version: 1 },
  ];
  const locked = setCanvasLayersLocked(source, ["a", "b"], true);
  assert.ok(locked.every((element) => element.locked));
  const hidden = setCanvasLayersVisible(locked, ["a", "b"], false);
  assert.deepEqual(hidden.map(({ opacity }) => opacity), [0, 0]);
  assert.deepEqual(setCanvasLayersVisible(hidden, ["a", "b"], true).map(({ opacity }) => opacity), [72, 100]);
  const grouped = groupCanvasLayers(source, ["a", "b"], "group-1");
  assert.ok(grouped.every((element) => element.groupIds.includes("group-1")));
  assert.ok(ungroupCanvasLayers(grouped, ["a", "b"]).every((element) => !element.groupIds.length));
  assert.ok(deleteCanvasLayers(source, ["b"]).find((element) => element.id === "b").isDeleted);
});

test("hiding and deleting workflow nodes also updates ports and bound connections", () => {
  const source = { id: "source", type: "text", opacity: 80, boundElements: [{ id: "edge", type: "arrow" }], customData: {} };
  const target = { id: "target", type: "rectangle", opacity: 100, boundElements: [{ id: "edge", type: "arrow" }], customData: { type: "image-generator" } };
  const edge = { id: "edge", type: "arrow", opacity: 100, startBinding: { elementId: "source" }, endBinding: { elementId: "target" }, customData: { workflowEdge: true } };
  const hidden = setCanvasLayersVisible([source, target, edge], ["source"], false);
  assert.equal(hidden[0].customData.loomicHidden, true);
  assert.equal(hidden[2].customData.loomicHidden, true);
  assert.equal(hidden[2].customData.loomicHiddenByNode, true);
  const restored = setCanvasLayersVisible(hidden, ["source"], true);
  assert.equal(restored[2].opacity, 100);
  assert.equal(restored[2].customData.loomicHidden, false);
  const deleted = deleteCanvasLayers([source, target, edge], ["source"]);
  assert.equal(deleted[0].isDeleted, true);
  assert.equal(deleted[2].isDeleted, true);
  assert.deepEqual(deleted[1].boundElements, []);
  assert.match(portsOverlay, /loomicHidden === true/);
});

test("endpoint visibility does not clear an independently hidden connection", () => {
  const node = { id: "source", type: "rectangle", opacity: 100, customData: {} };
  const edge = { id: "edge", type: "arrow", opacity: 100, startBinding: { elementId: "source" }, customData: { workflowEdge: true } };
  const edgeHidden = setCanvasLayersVisible([node, edge], ["edge"], false);
  const nodeHidden = setCanvasLayersVisible(edgeHidden, ["source"], false);
  const nodeShown = setCanvasLayersVisible(nodeHidden, ["source"], true);
  assert.equal(nodeShown[1].opacity, 0);
  assert.equal(nodeShown[1].customData.loomicHidden, true);
  assert.equal(nodeShown[1].customData.loomicHiddenByNode, undefined);
});

test("layers panel transforms the persistent connection baseline before view projection", () => {
  assert.match(panel, /restoreCanvasConnectionsForPersistence\(excalidrawApi, excalidrawApi\.getSceneElements\(\)\)/);
  assert.match(panel, /projectCanvasConnectionsForView\(excalidrawApi, next, \{ rebase: true \}\)/);
});

test("layers panel exposes multi-select, rename, ordering, grouping, and batch actions", () => {
  assert.match(panel, /type="checkbox"/);
  assert.match(panel, /aria-label="重命名图层"/);
  assert.match(panel, /aria-label="上移图层"/);
  assert.match(panel, /aria-label="下移图层"/);
  assert.match(panel, /aria-label="组合图层"/);
  assert.match(panel, /aria-label="删除所选图层"/);
  assert.match(panel, /collapsed \? "展开组" : "折叠组"/);
  assert.match(panel, /allGroupsCollapsed \? "展开全部分组" : "收起全部分组"/);
  assert.match(panel, /selectGroup\(memberIds\)/);
  assert.match(panel, /deleteCanvasLayers\(items, memberIds\)/);
  assert.match(panel, /aria-label="拖动图层组"/);
  assert.match(panel, /aria-label="重命名图层组"/);
  assert.match(panel, /renameCanvasLayerGroup\(items, groupId, groupRenameValue\)/);
  assert.match(panel, /aria-label="移到顶层"/);
  assert.match(panel, /dropCanvasLayers\(items, dragPayload\.ids/);
  assert.match(panel, /getCanvasLayerGroupElementIds\(elements, node\.groupIds\)/);
});

test("Escape cancels an active layer rename without closing the layers panel", () => {
  assert.match(panel, /event\.target\.closest\?\.\("\.loomic-layer-rename"\)/);
  assert.equal(panel.match(/if \(event\.key === "Escape"\) onCancelRename\(\)/g)?.length, 2);
});
