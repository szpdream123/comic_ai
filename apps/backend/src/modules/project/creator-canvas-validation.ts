export interface CanvasPortLike {
  id?: unknown;
  kind?: unknown;
  accepts?: unknown;
  direction?: "in" | "out";
}

export interface CanvasNodeLike {
  id?: unknown;
  type?: unknown;
  data?: {
    ports?: {
      inputs?: CanvasPortLike[];
      outputs?: CanvasPortLike[];
    };
  };
}

export interface CanvasEdgeLike {
  id?: unknown;
  sourceNodeId?: unknown;
  sourcePortId?: unknown;
  targetNodeId?: unknown;
  targetPortId?: unknown;
  data?: Record<string, unknown>;
}

export interface CanvasDocumentLike {
  nodes?: CanvasNodeLike[];
  edges?: CanvasEdgeLike[];
}

/**
 * The node/port contract shared by executable workflow presets and the canvas
 * runtime. Media uploads and persisted asset objects intentionally do not
 * belong to this contract: they are runtime inputs, not reusable tools.
 */
export const CANONICAL_WORKFLOW_NODE_PORTS = Object.freeze({
  script: Object.freeze({ inputs: [], outputs: [{ id: "out_text", kind: "text" }] }),
  director: Object.freeze({ inputs: [{ id: "in_any", kind: "any" }], outputs: [{ id: "out_text", kind: "text" }] }),
  image: Object.freeze({ inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image"] }], outputs: [{ id: "out_image", kind: "image" }] }),
  video: Object.freeze({ inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image", "video", "audio"] }], outputs: [{ id: "out_video", kind: "video" }] }),
  audio: Object.freeze({ inputs: [{ id: "in_text", kind: "text" }], outputs: [{ id: "out_audio", kind: "audio" }] }),
  output: Object.freeze({ inputs: [{ id: "in_media", kind: "any", accepts: ["image", "video"] }], outputs: [] }),
});

export type CanonicalWorkflowNodeType = keyof typeof CANONICAL_WORKFLOW_NODE_PORTS;

export function validateCanonicalWorkflowDocumentGraph(document: CanvasDocumentLike) {
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  for (const node of nodes) {
    const type = String(node?.type ?? "").trim() as CanonicalWorkflowNodeType;
    const ports = CANONICAL_WORKFLOW_NODE_PORTS[type];
    if (!ports) {
      throw new CanvasValidationError("canvas_workflow_node_type_invalid", "canvas workflow node type is not supported");
    }
    const actualPorts = node?.data?.ports;
    if (!actualPorts || !Array.isArray(actualPorts.inputs) || !Array.isArray(actualPorts.outputs)) {
      throw new CanvasValidationError("canvas_workflow_ports_missing", "canvas workflow node ports are required");
    }
    if (!sameCanvasPortShape(actualPorts.inputs, ports.inputs) || !sameCanvasPortShape(actualPorts.outputs, ports.outputs)) {
      throw new CanvasValidationError("canvas_workflow_ports_invalid", "canvas workflow node ports do not match the canonical contract");
    }
  }
  validateCanvasDocumentGraph(document);
  const nodeMap = new Map(nodes.map((node) => [String(node?.id ?? ""), node]).filter(([id]) => id));
  for (const edge of Array.isArray(document.edges) ? document.edges : []) {
    const sourceType = String(nodeMap.get(String(edge?.sourceNodeId ?? ""))?.type ?? "");
    const sourcePort = CANONICAL_WORKFLOW_NODE_PORTS[sourceType as CanonicalWorkflowNodeType]?.outputs.find(
      (port) => port.id === String(edge?.sourcePortId ?? ""),
    );
    const edgeKind = edge?.data && typeof edge.data === "object" ? String((edge.data as Record<string, unknown>).kind ?? "") : "";
    if (sourcePort && edgeKind && edgeKind !== sourcePort.kind) {
      throw new CanvasValidationError("canvas_workflow_edge_kind_invalid", "canvas workflow edge kind does not match its source port");
    }
  }
}

function sameCanvasPortShape(actual: CanvasPortLike[], expected: readonly CanvasPortLike[]) {
  if (actual.length !== expected.length) return false;
  return expected.every((expectedPort, index) => {
    const port = actual[index];
    if (String(port?.id ?? "") !== expectedPort.id || String(port?.kind ?? "") !== expectedPort.kind) return false;
    if (expectedPort.accepts === undefined) return port?.accepts === undefined || Array.isArray(port.accepts) && port.accepts.length === 0;
    return Array.isArray(port?.accepts) && port.accepts.map((value) => String(value)).join("\u0000") === expectedPort.accepts.join("\u0000");
  });
}

export class CanvasValidationError extends Error {
  constructor(
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "CanvasValidationError";
  }
}

export function validateCanvasDocumentGraph(document: CanvasDocumentLike) {
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const edges = Array.isArray(document.edges) ? document.edges : [];
  const nodeMap = new Map(nodes.map((node) => [String(node?.id ?? ""), node]).filter(([id]) => id));

  for (const edge of edges) {
    validateCanvasEdge(edge, nodeMap);
  }

  assertCanvasAcyclic(edges);
}

export function validateCanvasEdge(edge: CanvasEdgeLike, nodeMap: Map<string, CanvasNodeLike>) {
  const sourceNodeId = String(edge?.sourceNodeId ?? "");
  const targetNodeId = String(edge?.targetNodeId ?? "");
  const sourcePortId = String(edge?.sourcePortId ?? "");
  const targetPortId = String(edge?.targetPortId ?? "");
  if (!sourceNodeId || !targetNodeId || !sourcePortId || !targetPortId) {
    throw new CanvasValidationError("canvas_edge_invalid", "canvas edge is missing endpoint fields");
  }
  if (sourceNodeId === targetNodeId) {
    throw new CanvasValidationError("canvas_connection_self_link", "canvas edge cannot connect a node to itself");
  }
  const sourceNode = nodeMap.get(sourceNodeId);
  if (!sourceNode) {
    throw new CanvasValidationError("canvas_connection_source_missing", "canvas edge source node is missing");
  }
  const targetNode = nodeMap.get(targetNodeId);
  if (!targetNode) {
    throw new CanvasValidationError("canvas_connection_target_missing", "canvas edge target node is missing");
  }
  const sourcePort = findCanvasPort(sourceNode, sourcePortId);
  const targetPort = findCanvasPort(targetNode, targetPortId);
  if (!sourcePort || !targetPort) {
    throw new CanvasValidationError("canvas_connection_port_missing", "canvas edge port is missing");
  }
  if (sourcePort.direction !== "out" || targetPort.direction !== "in") {
    throw new CanvasValidationError("canvas_connection_direction_invalid", "canvas edge direction is invalid");
  }
  const targetAccepts = resolveCanvasTargetAcceptedKinds(targetNode, targetPort);
  const sourceKind = String(sourcePort.kind ?? "any");
  const targetKind = String(targetPort.kind ?? "any");
  if (sourceKind !== targetKind && targetKind !== "any" && !targetAccepts.includes(sourceKind)) {
    throw new CanvasValidationError("canvas_connection_kind_mismatch", "canvas edge media kind is invalid");
  }
}

function resolveCanvasTargetAcceptedKinds(node: CanvasNodeLike, port: CanvasPortLike) {
  if (Array.isArray(port.accepts)) {
    return port.accepts.map((item) => String(item));
  }
  const nodeType = String(node?.type ?? "");
  if (nodeType === "image" || nodeType === "send") {
    return ["text", "image"];
  }
  if (nodeType === "video") {
    return ["text", "image", "video", "audio"];
  }
  return [];
}

function findCanvasPort(node: CanvasNodeLike, portId: string) {
  const inputs = Array.isArray(node?.data?.ports?.inputs) ? node.data.ports.inputs : [];
  const outputs = Array.isArray(node?.data?.ports?.outputs) ? node.data.ports.outputs : [];
  const input = inputs.find((port) => String(port?.id ?? "") === portId);
  if (input) return { ...input, direction: "in" as const };
  const output = outputs.find((port) => String(port?.id ?? "") === portId);
  if (output) return { ...output, direction: "out" as const };
  return null;
}

function assertCanvasAcyclic(edges: CanvasEdgeLike[]) {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    const source = String(edge?.sourceNodeId ?? "");
    const target = String(edge?.targetNodeId ?? "");
    if (!source || !target) continue;
    if (!adjacency.has(source)) {
      adjacency.set(source, new Set());
    }
    adjacency.get(source)!.add(target);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      throw new CanvasValidationError("canvas_connection_cycle", "canvas graph cannot contain executable cycles");
    }
    if (visited.has(nodeId)) {
      return;
    }
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      visit(next);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of adjacency.keys()) {
    visit(nodeId);
  }
}
