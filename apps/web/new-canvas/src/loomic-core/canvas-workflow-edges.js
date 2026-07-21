function text(value) {
  return String(value ?? "").trim();
}

function boundElementId(binding) {
  return text(binding?.elementId ?? binding?.element_id);
}

export function canvasWorkflowNodeType(element) {
  const customData = element?.customData && typeof element.customData === "object"
    ? element.customData
    : {};
  if (customData.type === "image-generator") return "image";
  if (customData.type === "video-generator") return "video";
  if (customData.type === "director-node") return "director";
  if (customData.type === "script-node") return "script";
  if (customData.type === "audio-node") return ["upload", "generated"].includes(customData.sourceKind) ? "audio-upload" : "audio";
  if (customData.type === "video-composition-node") return "output";
  if (element?.type === "text") return "script";
  if (element?.type === "image") return "upload";
  if (element?.type === "embeddable" && customData.isVideo) return "video-upload";
  return "shape";
}

export function canvasWorkflowPorts(nodeType) {
  if (nodeType === "image") {
    return {
      inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image"] }],
      outputs: [{ id: "out_image", kind: "image" }],
    };
  }
  if (nodeType === "video") {
    return {
      inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image", "video", "audio"] }],
      outputs: [{ id: "out_video", kind: "video" }],
    };
  }
  if (nodeType === "script") {
    return { inputs: [], outputs: [{ id: "out_text", kind: "text" }] };
  }
  if (nodeType === "upload") {
    return { inputs: [], outputs: [{ id: "out_image", kind: "image" }] };
  }
  if (nodeType === "video-upload") {
    return { inputs: [], outputs: [{ id: "out_video", kind: "video" }] };
  }
  if (nodeType === "audio-upload") {
    return { inputs: [], outputs: [{ id: "out_audio", kind: "audio" }] };
  }
  if (nodeType === "audio") {
    return {
      inputs: [{ id: "in_text", kind: "text" }],
      outputs: [{ id: "out_audio", kind: "audio" }],
    };
  }
  if (nodeType === "director") {
    return {
      inputs: [{ id: "in_any", kind: "any" }],
      outputs: [{ id: "out_text", kind: "text" }],
    };
  }
  if (nodeType === "output") {
    return { inputs: [{ id: "in_media", kind: "any", accepts: ["image", "video"] }], outputs: [] };
  }
  return { inputs: [], outputs: [] };
}

export function canvasWorkflowNode(element) {
  const id = text(element?.id);
  if (!id || element?.isDeleted) return null;
  const type = canvasWorkflowNodeType(element);
  return { id, type, ports: canvasWorkflowPorts(type) };
}

export function wouldCreateCanvasWorkflowCycle(edges, sourceNodeId, targetNodeId) {
  const sourceId = text(sourceNodeId);
  const targetId = text(targetNodeId);
  if (!sourceId || !targetId) return false;
  if (sourceId === targetId) return true;
  const adjacency = new Map();
  for (const edge of Array.isArray(edges) ? edges : []) {
    const source = text(edge?.sourceNodeId);
    const target = text(edge?.targetNodeId);
    if (!source || !target) continue;
    if (!adjacency.has(source)) adjacency.set(source, []);
    adjacency.get(source).push(target);
  }
  const pending = [targetId];
  const visited = new Set();
  while (pending.length) {
    const nodeId = pending.pop();
    if (nodeId === sourceId) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    pending.push(...(adjacency.get(nodeId) ?? []));
  }
  return false;
}

function compatibleInputPort(inputs, sourceKind) {
  return inputs.find((port) => {
    const accepts = Array.isArray(port?.accepts) ? port.accepts.map(text) : [];
    return accepts.length ? accepts.includes(sourceKind) : ["any", sourceKind].includes(text(port?.kind));
  });
}

function validateCanvasWorkflowArrowCandidate(arrow, nodeById, acceptedEdges, allowLegacy) {
  if (!arrow || arrow.type !== "arrow" || arrow.isDeleted) {
    return { ok: false, reason: "canvas_workflow_edge_not_arrow" };
  }
  const customData = arrow.customData && typeof arrow.customData === "object" ? arrow.customData : {};
  if (customData.workflowEdge !== true && !(allowLegacy && !Object.prototype.hasOwnProperty.call(customData, "workflowEdge"))) {
    return { ok: false, reason: "canvas_workflow_edge_disabled" };
  }

  const arrowId = text(arrow.id);
  if (!arrowId) {
    return { ok: false, reason: "canvas_workflow_edge_id_required" };
  }
  const sourceNodeId = boundElementId(arrow.startBinding);
  const targetNodeId = boundElementId(arrow.endBinding);
  if (!sourceNodeId || !targetNodeId) {
    return { ok: false, reason: "canvas_workflow_edge_binding_required" };
  }
  if (sourceNodeId === targetNodeId) {
    return { ok: false, reason: "canvas_workflow_edge_self_connection" };
  }
  const source = nodeById.get(sourceNodeId);
  const target = nodeById.get(targetNodeId);
  if (!source || !target) {
    return { ok: false, reason: "canvas_workflow_edge_endpoint_missing" };
  }
  const sourcePort = source.ports.outputs[0];
  if (!sourcePort || !target.ports.inputs.length) {
    return { ok: false, reason: "canvas_workflow_edge_direction_invalid" };
  }
  const targetPort = compatibleInputPort(target.ports.inputs, text(sourcePort.kind));
  if (!targetPort) {
    return { ok: false, reason: "canvas_workflow_edge_kind_mismatch" };
  }
  if (acceptedEdges.some((edge) => (
    edge.sourceNodeId === sourceNodeId
    && edge.sourcePortId === sourcePort.id
    && edge.targetNodeId === targetNodeId
    && edge.targetPortId === targetPort.id
  ))) {
    return { ok: false, reason: "canvas_workflow_edge_duplicate" };
  }
  if (wouldCreateCanvasWorkflowCycle(acceptedEdges, sourceNodeId, targetNodeId)) {
    return { ok: false, reason: "canvas_workflow_edge_cycle" };
  }
  return {
    ok: true,
    edge: {
      id: `${arrowId}:workflow-edge`,
      sourceNodeId,
      sourcePortId: sourcePort.id,
      targetNodeId,
      targetPortId: targetPort.id,
      data: { kind: sourcePort.kind },
    },
  };
}

export function validateCanvasWorkflowArrow(arrow, nodeById, acceptedEdges = []) {
  return validateCanvasWorkflowArrowCandidate(arrow, nodeById, acceptedEdges, false);
}

export function migrateLegacyCanvasWorkflowEdges(elements) {
  const source = Array.isArray(elements) ? elements : [];
  const liveElements = source.filter((element) => !element?.isDeleted);
  const nodeById = new Map();
  for (const element of liveElements) {
    if (element?.type === "arrow") continue;
    const node = canvasWorkflowNode(element);
    if (node && !nodeById.has(node.id)) nodeById.set(node.id, node);
  }

  let changed = false;
  const acceptedEdges = [];
  const migratedById = new Map();
  for (const arrow of liveElements) {
    if (arrow?.type !== "arrow") continue;
    const customData = arrow.customData && typeof arrow.customData === "object" ? arrow.customData : {};
    if (customData.workflowEdge === false) continue;
    const legacy = !Object.prototype.hasOwnProperty.call(customData, "workflowEdge");
    const result = validateCanvasWorkflowArrowCandidate(arrow, nodeById, acceptedEdges, legacy);
    if (!result.ok) continue;
    acceptedEdges.push(result.edge);
    if (!legacy) continue;
    changed = true;
    migratedById.set(arrow.id, { ...arrow, customData: { ...customData, workflowEdge: true } });
  }
  if (!changed) return source;
  return source.map((element) => migratedById.get(element?.id) ?? element);
}

export function markCanvasDrawingArrowsNonWorkflow(elements) {
  const source = Array.isArray(elements) ? elements : [];
  let changed = false;
  const marked = source.map((element) => {
    if (element?.type !== "arrow" || element.isDeleted) return element;
    const customData = element.customData && typeof element.customData === "object" ? element.customData : {};
    if (Object.prototype.hasOwnProperty.call(customData, "workflowEdge")) return element;
    changed = true;
    return {
      ...element,
      customData: { ...customData, workflowEdge: false },
      version: (element.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  return changed ? marked : source;
}

export function collectCanvasWorkflowEdges(elements) {
  const liveElements = (Array.isArray(elements) ? elements : []).filter((element) => !element?.isDeleted);
  const nodeById = new Map();
  for (const element of liveElements) {
    if (element?.type === "arrow") continue;
    const node = canvasWorkflowNode(element);
    if (node && !nodeById.has(node.id)) nodeById.set(node.id, node);
  }
  const edges = [];
  for (const arrow of liveElements) {
    if (arrow?.type !== "arrow") continue;
    const result = validateCanvasWorkflowArrow(arrow, nodeById, edges);
    if (result.ok) edges.push(result.edge);
  }
  return edges;
}

export function findCanvasWorkflowDependencyCycle(elements) {
  const liveElements = (Array.isArray(elements) ? elements : []).filter((element) => !element?.isDeleted);
  const nodeById = new Map();
  for (const element of liveElements) {
    if (element?.type === "arrow") continue;
    const node = canvasWorkflowNode(element);
    if (node && !nodeById.has(node.id)) nodeById.set(node.id, node);
  }
  const candidates = [];
  for (const arrow of liveElements) {
    if (arrow?.type !== "arrow") continue;
    const result = validateCanvasWorkflowArrow(arrow, nodeById, []);
    if (result.ok) candidates.push(result.edge);
  }
  const outgoing = new Map();
  for (const edge of candidates) {
    const edges = outgoing.get(edge.sourceNodeId) ?? [];
    edges.push(edge);
    outgoing.set(edge.sourceNodeId, edges);
  }
  const visiting = new Set();
  const visited = new Set();
  const nodeStack = [];
  const edgeStack = [];
  const visit = (nodeId) => {
    if (visited.has(nodeId)) return null;
    visiting.add(nodeId);
    nodeStack.push(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (visiting.has(edge.targetNodeId)) {
        const start = nodeStack.indexOf(edge.targetNodeId);
        return {
          nodeIds: [...nodeStack.slice(start), edge.targetNodeId],
          edgeIds: [...edgeStack.slice(start).map((item) => item.id), edge.id],
        };
      }
      edgeStack.push(edge);
      const cycle = visit(edge.targetNodeId);
      edgeStack.pop();
      if (cycle) return cycle;
    }
    nodeStack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  };
  for (const nodeId of nodeById.keys()) {
    const cycle = visit(nodeId);
    if (cycle) return cycle;
  }
  return null;
}
