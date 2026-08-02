import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasDocumentFromX6Data,
  canvasDocumentToX6Data,
} from "../src/features/production-workbench/canvas/canvas-x6-document.js";
import { reconcileCanvasWorkflowGraph } from "../src/features/production-workbench/canvas/canvas-x6-graph.js";

const NODE_COUNT = 500;
const HIGH_FAN_OUT_EDGE_COUNT = NODE_COUNT - 1;
const EDGE_COUNT = HIGH_FAN_OUT_EDGE_COUNT * 2;
const TRANSFORM_BUDGET_MS = 1_500;
const RECONCILE_BUDGET_MS = 2_000;

test("500-node Canvas document converts and round-trips without losing workflow data", (context) => {
  const document = createLargeCanvasDocument();

  const convertStartedAt = performance.now();
  const x6Data = canvasDocumentToX6Data(document);
  const convertElapsedMs = performance.now() - convertStartedAt;

  assert.equal(x6Data.nodes.length, NODE_COUNT);
  assert.equal(x6Data.edges.length, EDGE_COUNT);
  assert.equal(
    x6Data.edges.filter((edge) => edge.id.startsWith("fan-edge-") && edge.source.cell === "node-0").length,
    HIGH_FAN_OUT_EDGE_COUNT,
  );
  assert.deepEqual(x6Data.nodes[250].data.canvasNode.data.payload, {
    sceneIndex: 250,
    prompt: "500-node benchmark scene 250",
  });
  assert.deepEqual(x6Data.edges.at(-1).target, { cell: "node-499", port: "in_text" });

  const roundTripStartedAt = performance.now();
  const roundTripped = canvasDocumentFromX6Data(x6Data, document);
  const roundTripElapsedMs = performance.now() - roundTripStartedAt;

  assert.equal(roundTripped.nodes.length, NODE_COUNT);
  assert.equal(roundTripped.edges.length, EDGE_COUNT);
  assert.deepEqual(roundTripped.nodes[250].data.payload, document.nodes[250].data.payload);
  assert.deepEqual(roundTripped.edges[498], document.edges[498]);
  assert.deepEqual(roundTripped.edges.at(-1), document.edges.at(-1));
  assert.equal(document.nodes[250].data.status, "idle", "conversion must not mutate the source document");
  assert.ok(
    convertElapsedMs < TRANSFORM_BUDGET_MS,
    `500-node X6 conversion took ${convertElapsedMs.toFixed(1)}ms (budget ${TRANSFORM_BUDGET_MS}ms)`,
  );
  assert.ok(
    roundTripElapsedMs < TRANSFORM_BUDGET_MS,
    `500-node X6 round-trip took ${roundTripElapsedMs.toFixed(1)}ms (budget ${TRANSFORM_BUDGET_MS}ms)`,
  );

  context.diagnostic(
    `500 nodes / ${EDGE_COUNT} edges: toX6=${convertElapsedMs.toFixed(1)}ms, fromX6=${roundTripElapsedMs.toFixed(1)}ms`,
  );
});

test("500-node Canvas graph reconciles a focused update without replacing cells", (context) => {
  const document = createLargeCanvasDocument();
  const initialData = canvasDocumentToX6Data(document);
  const graph = createMockGraph(initialData);
  const retainedNode = graph.getCellById("node-499");
  const retainedEdge = graph.getCellById("chain-edge-499");
  const nextDocument = structuredClone(document);
  nextDocument.nodes[250] = {
    ...nextDocument.nodes[250],
    position: { x: 9_000, y: 4_000 },
    data: {
      ...nextDocument.nodes[250].data,
      status: "completed",
      resultText: "updated without rebuilding the graph",
    },
  };
  nextDocument.edges[250] = {
    ...nextDocument.edges[250],
    data: { status: "running", progress: 0.5 },
  };
  const nextData = canvasDocumentToX6Data(nextDocument);

  const reconcileStartedAt = performance.now();
  const stats = reconcileCanvasWorkflowGraph(graph, nextData);
  const reconcileElapsedMs = performance.now() - reconcileStartedAt;

  assert.equal(stats.added, 0);
  assert.equal(stats.removed, 0);
  assert.ok(stats.updated >= 2 && stats.updated <= NODE_COUNT + EDGE_COUNT);
  assert.equal(graph.getNodes().length, NODE_COUNT);
  assert.equal(graph.getEdges().length, EDGE_COUNT);
  assert.equal(graph.getCellById("node-499"), retainedNode, "unaffected node identity must be retained");
  assert.equal(graph.getCellById("chain-edge-499"), retainedEdge, "unaffected edge identity must be retained");
  assert.deepEqual(graph.getCellById("node-250").getPosition(), { x: 9_000, y: 4_000 });
  assert.equal(graph.getCellById("node-250").getData().canvasNode.data.status, "completed");
  assert.equal(
    graph.getCellById("node-250").getData().canvasNode.data.resultText,
    "updated without rebuilding the graph",
  );
  assert.deepEqual(graph.getCellById("fan-edge-251").getData().canvasEdge.data, {
    status: "running",
    progress: 0.5,
  });
  assert.equal(
    graph.getEdges().filter((edge) => edge.id.startsWith("fan-edge-") && edge.getSource().cell === "node-0").length,
    HIGH_FAN_OUT_EDGE_COUNT,
  );
  assert.ok(
    reconcileElapsedMs < RECONCILE_BUDGET_MS,
    `500-node graph reconciliation took ${reconcileElapsedMs.toFixed(1)}ms (budget ${RECONCILE_BUDGET_MS}ms)`,
  );

  context.diagnostic(
    `500 nodes / ${EDGE_COUNT} edges: reconcile=${reconcileElapsedMs.toFixed(1)}ms (budget ${RECONCILE_BUDGET_MS}ms)`,
  );
});

function createLargeCanvasDocument() {
  const nodes = Array.from({ length: NODE_COUNT }, (_, index) => ({
    id: `node-${index}`,
    type: "script",
    position: {
      x: (index % 25) * 420,
      y: Math.floor(index / 25) * 300,
    },
    size: { width: 360, height: 240 },
    data: {
      title: index === 0 ? "High fan-out script hub" : `Scene ${index}`,
      status: "idle",
      text: `Scene ${index} source text`,
      payload: {
        sceneIndex: index,
        prompt: `500-node benchmark scene ${index}`,
      },
      ports: {
        inputs: [{ id: "in_text", kind: "text", label: "Input" }],
        outputs: [{ id: "out_text", kind: "text", label: "Output" }],
      },
    },
  }));
  const fanOutEdges = Array.from({ length: HIGH_FAN_OUT_EDGE_COUNT }, (_, index) => ({
    id: `fan-edge-${index + 1}`,
    sourceNodeId: "node-0",
    sourcePortId: "out_text",
    targetNodeId: `node-${index + 1}`,
    targetPortId: "in_text",
    data: { status: "idle", route: "fan-out" },
  }));
  const chainEdges = Array.from({ length: HIGH_FAN_OUT_EDGE_COUNT }, (_, index) => ({
    id: `chain-edge-${index + 1}`,
    sourceNodeId: `node-${index}`,
    sourcePortId: "out_text",
    targetNodeId: `node-${index + 1}`,
    targetPortId: "in_text",
    data: { status: "idle", route: "chain" },
  }));

  return {
    version: 1,
    canvasProjectId: "canvas-500-node-performance",
    nodes,
    edges: [...fanOutEdges, ...chainEdges],
    viewport: { x: 0, y: 0, zoom: 1, interactionMode: "classic" },
  };
}

function createMockGraph(x6Data) {
  const nodes = new Map(x6Data.nodes.map((config) => [config.id, createMockNode(config)]));
  const edges = new Map(x6Data.edges.map((config) => [config.id, createMockEdge(config)]));
  return {
    batchUpdate(_name, execute) { execute(); },
    getCellById(id) { return nodes.get(id) ?? edges.get(id) ?? null; },
    getNodes() { return [...nodes.values()]; },
    getEdges() { return [...edges.values()]; },
    addNode(config) { nodes.set(config.id, createMockNode(config)); },
    addEdge(config) { edges.set(config.id, createMockEdge(config)); },
    removeCell(cell) {
      if (cell?.isNode?.()) nodes.delete(cell.id);
      if (cell?.isEdge?.()) edges.delete(cell.id);
    },
  };
}

function createMockNode(config) {
  return {
    id: config.id,
    position: { x: config.x, y: config.y },
    size: { width: config.width, height: config.height },
    data: structuredClone(config.data),
    attrs: structuredClone(config.attrs),
    ports: structuredClone(config.ports),
    zIndex: config.zIndex,
    isNode: () => true,
    isEdge: () => false,
    getPosition() { return { ...this.position }; },
    setPosition(x, y) { this.position = { x, y }; },
    getSize() { return { ...this.size }; },
    setSize(width, height) { this.size = { width, height }; },
    getData() { return this.data; },
    setData(data) { this.data = structuredClone(data); },
    getAttrs() { return this.attrs; },
    setAttrs(attrs) { this.attrs = structuredClone(attrs); },
    getProp(name) { return name === "ports" ? this.ports : undefined; },
    setProp(name, value) { if (name === "ports") this.ports = structuredClone(value); },
    getZIndex() { return this.zIndex; },
    setZIndex(value) { this.zIndex = value; },
    getChildren: () => [],
    unembed() {},
  };
}

function createMockEdge(config) {
  return {
    id: config.id,
    source: structuredClone(config.source),
    target: structuredClone(config.target),
    data: structuredClone(config.data),
    attrs: structuredClone(config.attrs),
    zIndex: config.zIndex,
    isNode: () => false,
    isEdge: () => true,
    getSource() { return this.source; },
    setSource(source) { this.source = structuredClone(source); },
    getTarget() { return this.target; },
    setTarget(target) { this.target = structuredClone(target); },
    getData() { return this.data; },
    setData(data) { this.data = structuredClone(data); },
    getAttrs() { return this.attrs; },
    setAttrs(attrs) { this.attrs = structuredClone(attrs); },
    getZIndex() { return this.zIndex; },
    setZIndex(value) { this.zIndex = value; },
  };
}
