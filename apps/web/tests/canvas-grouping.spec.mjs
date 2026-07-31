import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDefaultCanvasDocument } from "../src/features/production-workbench/canvas/canvas-default-document.js";
import {
  addCanvasNode,
  groupCanvasNodes,
  removeCanvasNode,
  ungroupCanvasNodes,
  updateCanvasNodePosition,
} from "../src/features/production-workbench/canvas/canvas-state.js";
import {
  canvasDocumentFromX6Data,
  canvasDocumentToX6Data,
  constrainCanvasGroupNodePositions,
} from "../src/features/production-workbench/canvas/canvas-x6-document.js";
import {
  applyCanvasGraphGrouping,
  canvasGraphCellAndDescendantIds,
  clearCanvasGraphSelection,
  detachCanvasGroupChildrenForRemoval,
  readCanvasWorkflowGraphData,
  resolveCanvasGraphNodeSelectionZIndex,
  resolveCanvasGraphTranslationRestriction,
  resolveCanvasGroupMountBounds,
  resolveCanvasSelectionAnchorCells,
  resolveCanvasSelectionActionState,
  resolveCanvasSelectionMountBounds,
  resolveCanvasSelectionToolbarTop,
  selectCanvasGraphNodeExclusively,
  selectedCanvasWorkflowNodeIds,
} from "../src/features/production-workbench/canvas/canvas-x6-graph.js";

describe("canvas grouping", () => {
  it("persists both sides of membership and recovers legacy child lists through X6", () => {
    const source = createGroupingDocument();
    const grouped = groupCanvasNodes(source, ["node-a", "node-b"]);
    const group = grouped.document.nodes.find((node) => node.id === grouped.groupId);

    assert.equal(source.nodes.some((node) => node.parentGroupId), false);
    assert.deepEqual(group.data.childNodeIds, ["node-a", "node-b"]);
    assert.deepEqual(
      grouped.document.nodes.filter((node) => node.type !== "group").map((node) => node.parentGroupId),
      [grouped.groupId, grouped.groupId],
    );

    const legacyDocument = structuredClone(grouped.document);
    legacyDocument.nodes.forEach((node) => delete node.parentGroupId);
    const x6Data = canvasDocumentToX6Data(legacyDocument);
    assert.equal(x6Data.nodes.find((node) => node.id === "node-a").parent, grouped.groupId);
    assert.deepEqual(x6Data.nodes.find((node) => node.id === grouped.groupId).children, ["node-a", "node-b"]);
    assert.deepEqual(
      x6Data.nodes.find((node) => node.id === grouped.groupId).ports.items.map((port) => [port.id, port.group]),
      [["in_any", "in"], ["out_any", "out"]],
    );

    const roundTrip = canvasDocumentFromX6Data(x6Data, legacyDocument);
    assert.equal(roundTrip.nodes.find((node) => node.id === "node-a").parentGroupId, grouped.groupId);
    assert.deepEqual(roundTrip.nodes.find((node) => node.id === grouped.groupId).data.childNodeIds, ["node-a", "node-b"]);
    assert.deepEqual(
      roundTrip.nodes.map((node) => node.position),
      grouped.document.nodes.map((node) => node.position),
    );
  });

  it("embeds X6 children, moves a group once, and serializes absolute positions stably", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]).document;
    const graph = createMockGraph(canvasDocumentToX6Data(grouped));
    assert.equal(applyCanvasGraphGrouping(graph, grouped), true);

    const group = graph.getNodes().find((cell) => cell.getData().canvasNode.type === "group");
    assert.deepEqual(group.getChildren().map((cell) => cell.id), ["node-a", "node-b"]);
    group.translate(45, -30);

    const graphData = readCanvasWorkflowGraphData(graph);
    const nextDocument = canvasDocumentFromX6Data(graphData, grouped);
    assert.deepEqual(nextDocument.nodes.find((node) => node.id === "node-a").position, { x: 145, y: 90 });
    assert.deepEqual(nextDocument.nodes.find((node) => node.id === "node-b").position, { x: 565, y: 150 });
    assert.deepEqual(nextDocument.nodes.find((node) => node.type === "group").position, { x: 117, y: 38 });

    const secondRoundTrip = canvasDocumentFromX6Data(canvasDocumentToX6Data(nextDocument), nextDocument);
    assert.deepEqual(
      secondRoundTrip.nodes.map((node) => node.position),
      nextDocument.nodes.map((node) => node.position),
    );

    const movedByState = updateCanvasNodePosition(grouped, group.id, { x: 117, y: 38 });
    assert.deepEqual(movedByState.nodes.find((node) => node.id === "node-a").position, { x: 145, y: 90 });
    assert.deepEqual(movedByState.nodes.find((node) => node.id === "node-b").position, { x: 565, y: 150 });
  });

  it("keeps grouped nodes inside the parent for restored and patched coordinates", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]).document;
    const group = grouped.nodes.find((node) => node.type === "group");
    const escaped = grouped.nodes.map((node) => {
      if (node.id === "node-a") return { ...node, position: { x: group.position.x - 500, y: group.position.y - 500 } };
      if (node.id === "node-b") return { ...node, position: { x: group.position.x + group.size.width + 500, y: group.position.y + group.size.height + 500 } };
      return node;
    });

    const constrained = constrainCanvasGroupNodePositions(escaped);
    const constrainedGroup = constrained.find((node) => node.id === group.id);
    for (const child of constrained.filter((node) => node.parentGroupId === group.id)) {
      assert.ok(child.position.x >= constrainedGroup.position.x);
      assert.ok(child.position.y >= constrainedGroup.position.y);
      assert.ok(child.position.x + child.size.width <= constrainedGroup.position.x + constrainedGroup.size.width);
      assert.ok(child.position.y + child.size.height <= constrainedGroup.position.y + constrainedGroup.size.height);
    }

    const x6Data = canvasDocumentToX6Data({ ...grouped, nodes: escaped });
    const roundTrip = canvasDocumentFromX6Data(x6Data, { ...grouped, nodes: escaped });
    assert.deepEqual(
      roundTrip.nodes.map((node) => node.position),
      constrained.map((node) => node.position),
    );
  });

  it("ungroups by either a child or group selection without changing absolute positions", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]);
    const positions = new Map(grouped.document.nodes.map((node) => [node.id, node.position]));
    const result = ungroupCanvasNodes(grouped.document, ["node-a"]);

    assert.deepEqual(result.groupIds, [grouped.groupId]);
    assert.deepEqual(result.nodeIds, ["node-a", "node-b"]);
    assert.equal(result.document.nodes.some((node) => node.type === "group"), false);
    for (const node of result.document.nodes) {
      assert.equal("parentGroupId" in node, false);
      assert.deepEqual(node.position, positions.get(node.id));
    }
    assert.equal(canvasDocumentToX6Data(result.document).nodes.some((node) => node.parent), false);
  });

  it("rejects nested groups and tolerates stale membership during node or group deletion", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]);
    const withThird = addCanvasNode(grouped.document, {
      id: "node-c",
      type: "comment",
      position: { x: 900, y: 240 },
    });

    assert.equal(groupCanvasNodes(withThird, [grouped.groupId, "node-c"]).groupId, null);
    assert.equal(groupCanvasNodes(withThird, ["node-a", "node-c"]).groupId, null);
    assert.equal(groupCanvasNodes(withThird, ["node-c"]).groupId, null);

    const withoutChild = removeCanvasNode(withThird, "node-a");
    assert.deepEqual(
      withoutChild.nodes.find((node) => node.id === grouped.groupId).data.childNodeIds,
      ["node-b"],
    );
    assert.equal(withoutChild.nodes.find((node) => node.id === "node-b").parentGroupId, grouped.groupId);

    const withoutGroup = removeCanvasNode(withThird, grouped.groupId);
    assert.deepEqual(withoutGroup.nodes.map((node) => node.id), ["node-a", "node-b", "node-c"]);
    assert.equal(withoutGroup.nodes.some((node) => node.parentGroupId), false);

    const malformed = structuredClone(grouped.document);
    const group = malformed.nodes.find((node) => node.id === grouped.groupId);
    group.data.childNodeIds.push("missing-node", grouped.groupId);
    malformed.nodes.find((node) => node.id === "node-a").parentGroupId = "missing-group";
    const normalized = canvasDocumentFromX6Data(canvasDocumentToX6Data(malformed), malformed);
    assert.deepEqual(normalized.nodes.find((node) => node.id === grouped.groupId).data.childNodeIds, ["node-a", "node-b"]);
    assert.equal(normalized.nodes.find((node) => node.id === "node-a").parentGroupId, grouped.groupId);
  });

  it("detaches group children before X6 removes the group cell", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]).document;
    const graph = createMockGraph(canvasDocumentToX6Data(grouped));
    applyCanvasGraphGrouping(graph, grouped);
    const group = graph.getNodes().find((cell) => cell.getData().canvasNode.type === "group");

    detachCanvasGroupChildrenForRemoval([group]);

    assert.deepEqual(group.getChildren(), []);
    assert.equal(graph.getCellById("node-a").getParent(), null);
    assert.equal(graph.getCellById("node-b").getParent(), null);
  });

  it("shows group packaging for a multi-selection and group actions for a selected group", () => {
    const source = createGroupingDocument();
    assert.deepEqual(resolveCanvasSelectionActionState(source, ["node-a", "node-b"]), {
      visible: true,
      mode: "selection",
      selectedIds: ["node-a", "node-b"],
      groupId: "",
      nodeCount: 2,
      canGroup: true,
    });

    const grouped = groupCanvasNodes(source, ["node-a", "node-b"]);
    assert.deepEqual(resolveCanvasSelectionActionState(grouped.document, [grouped.groupId]), {
      visible: true,
      mode: "group",
      selectedIds: [grouped.groupId],
      groupId: grouped.groupId,
      nodeCount: 2,
      canGroup: false,
    });
  });

  it("reads X6 DOM selection markers when the graph selection API is stale", () => {
    const cells = new Map(["node-a", "node-b"].map((nodeId) => [nodeId, {
      id: nodeId,
      isNode: () => true,
      getData: () => ({ canvasNode: { id: nodeId } }),
    }]));
    const graph = {
      getSelectedCells: () => [{
        id: "stale-node",
        isNode: () => true,
        getData: () => ({ canvasNode: { id: "stale-node" } }),
      }],
      getCellById: (nodeId) => cells.get(nodeId),
      __comicAiCanvasMount: {
        querySelectorAll: () => ["node-a", "node-b"].map((nodeId) => ({
          getAttribute: (name) => name === "data-cell-id" ? nodeId : null,
        })),
      },
    };
    assert.deepEqual(selectedCanvasWorkflowNodeIds({ canvasGraph: graph }), ["node-a", "node-b"]);
  });

  it("clears the old multi-selection and selects a packaged group exclusively", () => {
    const group = {
      id: "group-1",
      isNode: () => true,
      getData: () => ({ canvasNode: { type: "group" } }),
    };
    let selectedCells = [
      { id: "node-a", isNode: () => true },
      { id: "node-b", isNode: () => true },
    ];
    let domSelectedIds = ["node-a", "node-b"];
    const calls = [];
    const selection = {
      clean() {
        calls.push("clean");
        selectedCells = [];
        domSelectedIds = [];
      },
      reset(cells) {
        calls.push(["reset", cells.map((cell) => cell.id)]);
        selectedCells = [...cells];
        domSelectedIds = cells.map((cell) => cell.id);
      },
    };
    const graph = {
      getPlugin: (name) => name === "selection" ? selection : null,
      getSelectedCells: () => selectedCells,
      getCellById: (nodeId) => nodeId === group.id ? group : null,
      __comicAiCanvasMount: {
        querySelectorAll: () => domSelectedIds.map((nodeId) => ({
          getAttribute: (name) => name === "data-cell-id" ? nodeId : null,
        })),
      },
    };

    assert.equal(clearCanvasGraphSelection(graph), true);
    assert.equal(selectCanvasGraphNodeExclusively(graph, group.id), true);
    assert.deepEqual(calls, ["clean", ["reset", ["group-1"]]]);
    assert.deepEqual(selectedCells.map((cell) => cell.id), ["group-1"]);
  });

  it("keeps the selection toolbar above the frame and group children inside their parent", () => {
    assert.equal(resolveCanvasSelectionToolbarTop(100, 85, 34), 8);
    assert.equal(resolveCanvasSelectionToolbarTop(240, 85, 34), 109);

    const groupBounds = { x: 72, y: 68, width: 524, height: 332 };
    const group = {
      getData: () => ({ canvasNode: { type: "group" } }),
      getBBox: () => groupBounds,
    };
    assert.equal(resolveCanvasGraphTranslationRestriction({
      cell: { getParent: () => null },
    }), null);
    assert.equal(resolveCanvasGraphTranslationRestriction({
      cell: { getParent: () => group },
    }), groupBounds);
    assert.equal(resolveCanvasGraphNodeSelectionZIndex({
      getData: () => ({ canvasNode: { type: "group" } }),
    }), -1);
    assert.equal(resolveCanvasGraphNodeSelectionZIndex({
      getData: () => ({ canvasNode: { type: "ai-image" } }),
    }), 1001);
  });

  it("anchors group actions to the group frame instead of stale selected children", () => {
    const group = {
      id: "group-1",
      isNode: () => true,
      getData: () => ({ canvasNode: { type: "group" } }),
    };
    const selectedChildren = [
      { id: "child-1", isNode: () => true },
      { id: "child-2", isNode: () => true },
    ];
    const graph = {
      getCellById: (nodeId) => nodeId === group.id ? group : null,
    };

    assert.deepEqual(resolveCanvasSelectionAnchorCells(graph, group.id, selectedChildren), [group]);
    assert.deepEqual(resolveCanvasSelectionAnchorCells(graph, "", selectedChildren), selectedChildren);
    assert.deepEqual(resolveCanvasSelectionAnchorCells(graph, "missing-group", selectedChildren), selectedChildren);
  });

  it("positions group actions from the rendered group frame after pan and zoom", () => {
    const group = {
      id: "group-1",
      isNode: () => true,
      getData: () => ({ canvasNode: { type: "group" } }),
    };
    const mount = {
      clientWidth: 1000,
      clientHeight: 600,
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 300 }),
    };
    const graph = {
      getCellById: (nodeId) => nodeId === group.id ? group : null,
      findViewByCell: () => ({
        container: {
          getBoundingClientRect: () => ({ left: 200, top: 150, width: 300, height: 200 }),
        },
      }),
    };

    assert.deepEqual(resolveCanvasGroupMountBounds(graph, mount, group.id), {
      left: 200,
      top: 200,
      width: 600,
      height: 400,
    });
    assert.equal(resolveCanvasGroupMountBounds(graph, mount, "missing-group"), null);
  });

  it("uses live cell geometry for the selection background and expands group descendants", () => {
    const child = { id: "child", isNode: () => true };
    const group = {
      id: "group",
      isNode: () => true,
      getDescendants: () => [child, { id: "edge", isNode: () => false }],
    };
    assert.deepEqual(canvasGraphCellAndDescendantIds([group, child]), ["group", "child"]);

    const mount = {
      clientWidth: 1000,
      clientHeight: 600,
      getBoundingClientRect: () => ({ left: 50, top: 50, width: 500, height: 300 }),
      querySelector: () => ({ offsetLeft: 10, offsetTop: 20, offsetWidth: 30, offsetHeight: 40 }),
    };
    let convertedBounds = null;
    const graph = {
      localToClient: (bounds) => {
        convertedBounds = bounds;
        return { left: 150, top: 100, width: 200, height: 100 };
      },
    };
    const cells = [{ getBBox: () => ({ x: 400, y: 500, width: 120, height: 80 }) }];
    assert.deepEqual(resolveCanvasSelectionMountBounds(graph, mount, cells), {
      left: 200,
      top: 100,
      width: 400,
      height: 200,
    });
    assert.deepEqual(convertedBounds, { x: 392, y: 492, width: 136, height: 96 });
  });
});

function createGroupingDocument() {
  const first = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-group" }), {
    id: "node-a",
    type: "markdown",
    position: { x: 100, y: 120 },
  });
  return addCanvasNode(first, {
    id: "node-b",
    type: "comment",
    position: { x: 520, y: 180 },
  });
}

function createMockGraph(x6Data) {
  const cells = new Map(x6Data.nodes.map((node) => [node.id, createMockCell(node)]));
  return {
    getCellById: (id) => cells.get(id) ?? null,
    getNodes: () => [...cells.values()],
    getEdges: () => [],
  };
}

function createMockCell(node) {
  return {
    id: node.id,
    shape: node.shape,
    position: { x: node.x, y: node.y },
    size: { width: node.width, height: node.height },
    data: node.data,
    parent: null,
    children: [],
    getPosition() { return { ...this.position }; },
    getSize() { return { ...this.size }; },
    getData() { return this.data; },
    getParent() { return this.parent; },
    getParentId() { return this.parent?.id ?? null; },
    getChildren() { return [...this.children]; },
    setParent(parent) { this.parent = parent; },
    addChild(child) {
      child.parent?.unembed(child);
      if (!this.children.includes(child)) this.children.push(child);
      child.parent = this;
    },
    unembed(child) {
      this.children = this.children.filter((item) => item !== child);
      if (child.parent === this) child.parent = null;
    },
    translate(x, y) {
      this.position = { x: this.position.x + x, y: this.position.y + y };
      for (const child of this.children) child.translate(x, y);
    },
  };
}
