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
} from "../src/features/production-workbench/canvas/canvas-x6-document.js";
import {
  applyCanvasGraphGrouping,
  detachCanvasGroupChildrenForRemoval,
  readCanvasWorkflowGraphData,
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
