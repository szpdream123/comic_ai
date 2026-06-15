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
}

export interface CanvasDocumentLike {
  nodes?: CanvasNodeLike[];
  edges?: CanvasEdgeLike[];
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
  const targetAccepts = Array.isArray(targetPort.accepts) ? targetPort.accepts.map((item) => String(item)) : [];
  const sourceKind = String(sourcePort.kind ?? "any");
  const targetKind = String(targetPort.kind ?? "any");
  if (sourceKind !== targetKind && targetKind !== "any" && !targetAccepts.includes(sourceKind)) {
    throw new CanvasValidationError("canvas_connection_kind_mismatch", "canvas edge media kind is invalid");
  }
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
