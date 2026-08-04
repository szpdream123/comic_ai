import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDefaultCanvasDocument } from "../src/features/production-workbench/canvas/canvas-default-document.js";
import {
  addCanvasNode,
  arrangeCanvasGroupNodes,
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
  constrainCanvasGraphSelectionToGroups,
  detachCanvasGroupChildrenForRemoval,
  readCanvasWorkflowGraphData,
  resolveCanvasGraphNodeSelectionZIndex,
  resolveCanvasGraphTranslationRestriction,
  resolveCanvasGroupMountBounds,
  resolveCanvasSelectionAnchorCells,
  resolveCanvasSelectionActionState,
  resolveCanvasSelectionMountBounds,
  resolveCanvasSelectionToolbarTop,
  preserveCanvasGroupChildOffsets,
  selectCanvasGraphNodeExclusively,
  selectedCanvasWorkflowNodeIds,
  synchronizeCanvasGraphGroupGeometry,
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

  it("preserves child offsets when an embedded group moves", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]).document;
    const graphData = canvasDocumentToX6Data(grouped);
    const group = graphData.nodes.find((node) => node.data.canvasNode.type === "group");
    group.x += 240;
    group.y += 180;

    const positioned = preserveCanvasGroupChildOffsets(graphData, grouped);
    assert.deepEqual(
      positioned.nodes.find((node) => node.id === "node-a").x,
      grouped.nodes.find((node) => node.id === "node-a").position.x + 240,
    );
    assert.deepEqual(
      positioned.nodes.find((node) => node.id === "node-b").y,
      grouped.nodes.find((node) => node.id === "node-b").position.y + 180,
    );
  });

  it("restores a grouped child parent when X6 temporarily clears it", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]).document;
    const group = grouped.nodes.find((node) => node.type === "group");
    const graphData = canvasDocumentToX6Data(grouped);
    const child = graphData.nodes.find((node) => node.id === "node-a");
    child.parent = null;

    const positioned = preserveCanvasGroupChildOffsets(graphData, grouped);

    assert.equal(positioned.nodes.find((node) => node.id === "node-a").parent, group.id);
  });

  it("repairs X6 child parent links without duplicating listed group children", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]).document;
    const graph = createMockGraph(canvasDocumentToX6Data(grouped));
    const group = graph.getNodes().find((cell) => cell.getData().canvasNode.type === "group");
    const children = [graph.getCellById("node-a"), graph.getCellById("node-b")];
    group.children = [...children, ...children];
    children.forEach((child) => { child.parent = null; });

    applyCanvasGraphGrouping(graph, grouped);

    assert.deepEqual(group.getChildren().map((child) => child.id), ["node-a", "node-b"]);
    assert.ok(children.every((child) => child.getParent() === group));
  });

  it("moves live X6 children with a group before expanding the group bounds", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]).document;
    const graph = createMockGraph(canvasDocumentToX6Data(grouped));
    applyCanvasGraphGrouping(graph, grouped);
    const group = graph.getNodes().find((cell) => cell.getData().canvasNode.type === "group");
    const originalChildren = new Map(group.getChildren().map((child) => [child.id, child.getPosition()]));
    for (const child of group.getChildren()) group.unembed(child);
    group.setPosition(group.getPosition().x + 240, group.getPosition().y + 180);

    synchronizeCanvasGraphGroupGeometry(graph, grouped);

    assert.deepEqual(group.getChildren().map((child) => child.id), ["node-a", "node-b"]);
    const groupBox = { ...group.getPosition(), ...group.getSize() };
    for (const child of group.getChildren()) {
      const original = originalChildren.get(child.id);
      const childBox = { ...child.getPosition(), ...child.getSize() };
      assert.deepEqual(child.getPosition(), { x: original.x + 240, y: original.y + 180 });
      assert.ok(childBox.x >= groupBox.x);
      assert.ok(childBox.y >= groupBox.y);
      assert.ok(childBox.x + childBox.width <= groupBox.x + groupBox.width);
      assert.ok(childBox.y + childBox.height <= groupBox.y + groupBox.height);
    }
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

    const graph = createMockGraph(canvasDocumentToX6Data(grouped));
    const child = graph.getCellById("node-a");
    child.setPosition(group.position.x - 500, group.position.y - 500);
    applyCanvasGraphGrouping(graph, { ...grouped, nodes: escaped });
    const constrainedChild = child.getPosition();
    assert.ok(constrainedChild.x >= group.position.x);
    assert.ok(constrainedChild.y >= group.position.y);
  });

  it("expands an undersized X6 group around its live children", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]).document;
    const group = grouped.nodes.find((node) => node.type === "group");
    const graph = createMockGraph(canvasDocumentToX6Data(grouped));
    graph.getCellById(group.id).setSize(360, 240);
    graph.getCellById("node-b").setPosition(group.position.x + 900, group.position.y + 700);

    applyCanvasGraphGrouping(graph, grouped);

    const groupCell = graph.getNodes().find((cell) => cell.getData()?.canvasNode?.type === "group");
    const childCell = graph.getNodes().find((cell) => cell.id === "node-b");
    const groupBox = { ...groupCell.getPosition(), ...groupCell.getSize() };
    const childBox = { ...childCell.getPosition(), ...childCell.getSize() };
    assert.ok(groupBox.x <= childBox.x - 28);
    assert.ok(groupBox.y <= childBox.y - 52);
    assert.ok(groupBox.x + groupBox.width >= childBox.x + childBox.width + 28);
    assert.ok(groupBox.y + groupBox.height >= childBox.y + childBox.height + 28);
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

  it("rearranges group members without changing their content, membership, or edges", () => {
    const withThird = addCanvasNode(createGroupingDocument(), {
      id: "node-c",
      type: "output",
      position: { x: 900, y: 260 },
    });
    const grouped = groupCanvasNodes({
      ...withThird,
      edges: [{ id: "edge-a-b", sourceNodeId: "node-a", sourcePortId: "out", targetNodeId: "node-b", targetPortId: "in" }],
    }, ["node-a", "node-b", "node-c"]);
    const source = grouped.document;
    const group = source.nodes.find((node) => node.id === grouped.groupId);
    const sourceEdges = structuredClone(source.edges);
    const sourceMembership = source.nodes
      .filter((node) => node.type !== "group")
      .map((node) => [node.id, node.parentGroupId]);

    const grid = arrangeCanvasGroupNodes(source, grouped.groupId, "grid");
    const gridNodes = new Map(grid.document.nodes.map((node) => [node.id, node]));
    assert.equal(grid.layout, "grid");
    assert.equal(gridNodes.get("node-a").position.y, gridNodes.get("node-b").position.y);
    assert.equal(gridNodes.get("node-b").position.y, gridNodes.get("node-c").position.y);
    assert.deepEqual(gridNodes.get(grouped.groupId).size, { width: 1224, height: 360 });
    const graph = createMockGraph(canvasDocumentToX6Data(source));
    applyCanvasGraphGrouping(graph, grid.document);
    assert.deepEqual(graph.getCellById(grouped.groupId).getSize(), { width: 1224, height: 360 });
    assert.deepEqual(grid.document.edges, sourceEdges);
    assert.deepEqual(
      grid.document.nodes.filter((node) => node.type !== "group").map((node) => [node.id, node.parentGroupId]),
      sourceMembership,
    );
    assert.deepEqual(gridNodes.get(grouped.groupId).data, group.data);

    const horizontal = arrangeCanvasGroupNodes(source, grouped.groupId, "horizontal").document;
    const horizontalNodes = new Map(horizontal.nodes.map((node) => [node.id, node]));
    assert.equal(horizontalNodes.get("node-a").position.y, horizontalNodes.get("node-b").position.y);
    assert.ok(horizontalNodes.get("node-b").position.x > horizontalNodes.get("node-a").position.x);
    assert.deepEqual(horizontalNodes.get(grouped.groupId).size, { width: 1224, height: 360 });

    const vertical = arrangeCanvasGroupNodes(source, grouped.groupId, "vertical").document;
    const verticalNodes = new Map(vertical.nodes.map((node) => [node.id, node]));
    assert.equal(verticalNodes.get("node-a").position.x, verticalNodes.get("node-b").position.x);
    assert.ok(verticalNodes.get("node-b").position.y > verticalNodes.get("node-a").position.y);
    assert.deepEqual(verticalNodes.get(grouped.groupId).size, { width: 516, height: 808 });
    const x6Group = canvasDocumentToX6Data(vertical).nodes.find((node) => node.id === grouped.groupId);
    assert.equal(x6Group.width, 516);
    assert.equal(x6Group.height, 808);
  });

  it("places grid group members three per row and sizes the group to the arranged bounds", () => {
    let document = createGroupingDocument();
    document = addCanvasNode(document, {
      id: "node-c",
      type: "output",
      position: { x: 900, y: 260 },
    });
    document = addCanvasNode(document, {
      id: "node-d",
      type: "output",
      position: { x: 1260, y: 260 },
    });
    const grouped = groupCanvasNodes(document, ["node-a", "node-b", "node-c", "node-d"]);
    const arranged = arrangeCanvasGroupNodes(grouped.document, grouped.groupId, "grid").document;
    const nodes = new Map(arranged.nodes.map((node) => [node.id, node]));

    assert.equal(nodes.get("node-a").position.y, nodes.get("node-b").position.y);
    assert.equal(nodes.get("node-b").position.y, nodes.get("node-c").position.y);
    assert.ok(nodes.get("node-d").position.y > nodes.get("node-a").position.y);
    assert.deepEqual(nodes.get(grouped.groupId).size, { width: 1324, height: 664 });
  });

  it("preserves HTML shape size bindings across X6 attr refreshes", () => {
    const grouped = groupCanvasNodes(createGroupingDocument(), ["node-a", "node-b"]);
    const groupNode = canvasDocumentToX6Data(grouped.document).nodes.find((node) => node.id === grouped.groupId);

    assert.equal(groupNode.attrs.body.refWidth, "100%");
    assert.equal(groupNode.attrs.body.refHeight, "100%");
    assert.equal(groupNode.attrs.fo.refWidth, "100%");
    assert.equal(groupNode.attrs.fo.refHeight, "100%");
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

  it("keeps a moving multi-selection inside its parent group without changing relative spacing", () => {
    const groupBounds = { x: 100, y: 100, width: 500, height: 400 };
    const group = {
      id: "group",
      getData: () => ({ canvasNode: { type: "group" } }),
      getBBox: () => groupBounds,
    };
    const child = (id, x, y, width, height) => ({
      id,
      position: { x, y },
      isNode: () => true,
      getParent: () => group,
      getBBox() { return { ...this.position, width, height }; },
      translate(dx, dy) {
        this.position = { x: this.position.x + dx, y: this.position.y + dy };
      },
    });
    const first = child("first", 560, 180, 100, 100);
    const second = child("second", 430, 440, 120, 80);
    const initialOffset = {
      x: second.position.x - first.position.x,
      y: second.position.y - first.position.y,
    };

    assert.equal(constrainCanvasGraphSelectionToGroups([first, second]), true);
    assert.deepEqual(first.position, { x: 500, y: 160 });
    assert.deepEqual(second.position, { x: 370, y: 420 });
    assert.deepEqual({
      x: second.position.x - first.position.x,
      y: second.position.y - first.position.y,
    }, initialOffset);
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
      querySelector: () => null,
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

    assert.deepEqual(resolveCanvasSelectionMountBounds({}, {
      querySelector: () => ({ offsetLeft: 10, offsetTop: 20, offsetWidth: 30, offsetHeight: 40 }),
    }), {
      left: 10,
      top: 20,
      width: 30,
      height: 40,
    });
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
    setPosition(x, y) { this.position = { x, y }; },
    setSize(width, height) { this.size = { width, height }; },
    getData() { return this.data; },
    getParent() { return this.parent; },
    getParentId() { return this.parent?.id ?? null; },
    getChildren() { return [...this.children]; },
    setParent(parent) { this.parent = parent; },
    setChildren(children) { this.children = [...children]; },
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
