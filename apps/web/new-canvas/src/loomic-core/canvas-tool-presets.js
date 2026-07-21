import {
  CANVAS_TOOL_CATEGORIES,
  CANVAS_WORKFLOW_TEMPLATES,
  filterCanvasToolPresets,
  insertCanvasWorkflowTopology,
} from "./canvas-workflow-templates.js";
import { canvasWorkflowNode, validateCanvasWorkflowArrow } from "./canvas-workflow-edges.js";

export const CANVAS_TOOL_PRESET_CATEGORIES = CANVAS_TOOL_CATEGORIES;

export const CANVAS_TOOL_PRESETS = Object.freeze(CANVAS_WORKFLOW_TEMPLATES.map((template) => {
  return Object.freeze({
    ...template,
    preview: Object.freeze({
      kind: "workflow-topology",
      nodes: template.nodes,
      connections: template.connections,
    }),
  });
}));

export function listCanvasToolPresets({ query = "", category = "all" } = {}) {
  return filterCanvasToolPresets(CANVAS_TOOL_PRESETS, { query, category });
}

const PRESET_DATA_KEYS = ["title", "text", "instructions", "prompt", "model", "parameters"];
const ALLOWED_NODE_TYPES = new Set([
  "image-generator",
  "video-generator",
  "script-node",
  "director-node",
  "audio-node",
  "video-composition-node",
]);

function text(value) {
  return String(value ?? "").trim();
}

function cleanValue(value, key = "") {
  const normalizedKey = String(key).replace(/[-_]/g, "").toLocaleLowerCase();
  if (
    normalizedKey === "status"
    || normalizedKey.includes("task")
    || normalizedKey.includes("run")
    || normalizedKey.includes("result")
    || normalizedKey.includes("storage")
    || normalizedKey.includes("signature")
    || normalizedKey.includes("signed")
    || normalizedKey.endsWith("id")
    || normalizedKey.endsWith("url")
    || normalizedKey.endsWith("uri")
  ) return undefined;
  if (typeof value === "string") {
    if (/^(?:https?:|blob:|data:)/i.test(value.trim())) return undefined;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cleanValue(item, key)).filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const cleaned = cleanValue(childValue, childKey);
      if (cleaned !== undefined) result[childKey] = cleaned;
    }
    return result;
  }
  return value;
}

function nodeKind(element) {
  const type = text(element?.customData?.type);
  if (type === "image-generator") return "image";
  if (type === "video-generator") return "video";
  if (ALLOWED_NODE_TYPES.has(type)) return "workflow";
  return "";
}

function nodeData(element) {
  const source = element?.customData && typeof element.customData === "object" ? element.customData : {};
  const data = {};
  for (const key of PRESET_DATA_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const cleaned = cleanValue(source[key], key);
    if (cleaned !== undefined) data[key] = cleaned;
  }
  return data;
}

function presetCategory(nodes) {
  if (nodes.some((node) => node.type === "director-node")) return "director";
  if (nodes.some((node) => node.type === "audio-node")) return "audio";
  if (nodes.some((node) => node.kind === "video" || node.type === "video-composition-node")) return "video";
  if (nodes.some((node) => node.kind === "image")) return "image";
  return "all";
}

function connectionEndpointId(binding) {
  return text(binding?.elementId ?? binding?.element_id);
}

/**
 * Extracts the selected canonical workflow graph into the backend topology contract.
 * Runtime results, task IDs, storage references and signed URLs are deliberately omitted.
 */
export function extractCanvasToolPresetTopology(elements, selectedIds) {
  const source = Array.isArray(elements) ? elements : [];
  const selected = selectedIds instanceof Set
    ? new Set(selectedIds)
    : new Set(Object.entries(selectedIds ?? {}).filter(([, value]) => value).map(([id]) => id));
  const live = source.filter((element) => element && !element.isDeleted);
  const selectedNodes = live.filter((element) => selected.has(element.id) && element.type !== "arrow");
  if (!selectedNodes.length) return { ok: false, reason: "no_nodes", topology: null };
  if (selectedNodes.some((element) => !nodeKind(element))) {
    return { ok: false, reason: "unsupported_node", topology: null };
  }

  const selectedNodeIds = new Set(selectedNodes.map((element) => element.id));
  const workflowArrows = live.filter((element) => element.type === "arrow" && element.customData?.workflowEdge === true);
  for (const arrow of workflowArrows) {
    const sourceId = connectionEndpointId(arrow.startBinding);
    const targetId = connectionEndpointId(arrow.endBinding);
    const sourceSelected = selectedNodeIds.has(sourceId);
    const targetSelected = selectedNodeIds.has(targetId);
    if (sourceSelected !== targetSelected) {
      return { ok: false, reason: "cross_selection_edge", topology: null };
    }
  }
  const selectedArrows = live.filter((element) => selected.has(element.id) && element.type === "arrow");
  if (selectedArrows.some((arrow) => !workflowArrows.includes(arrow))) {
    return { ok: false, reason: "unsupported_edge", topology: null };
  }

  const nodeById = new Map(selectedNodes.map((element) => [element.id, canvasWorkflowNode(element)]));
  const internalArrows = workflowArrows.filter((arrow) => (
    selectedNodeIds.has(connectionEndpointId(arrow.startBinding))
    && selectedNodeIds.has(connectionEndpointId(arrow.endBinding))
  ));
  const acceptedEdges = [];
  const edgePairs = [];
  for (const arrow of internalArrows) {
    const result = validateCanvasWorkflowArrow(arrow, nodeById, acceptedEdges);
    if (!result.ok) return { ok: false, reason: result.reason, topology: null };
    acceptedEdges.push(result.edge);
    edgePairs.push([
      selectedNodes.findIndex((element) => element.id === result.edge.sourceNodeId),
      selectedNodes.findIndex((element) => element.id === result.edge.targetNodeId),
    ]);
  }
  const minX = Math.min(...selectedNodes.map((element) => Number(element.x) || 0));
  const minY = Math.min(...selectedNodes.map((element) => Number(element.y) || 0));
  const nodes = selectedNodes.map((element) => ({
    kind: nodeKind(element),
    ...(nodeKind(element) === "workflow" ? { type: element.customData.type } : {}),
    offsetX: Math.round((Number(element.x) || 0) - minX),
    offsetY: Math.round((Number(element.y) || 0) - minY),
    ...(Object.keys(nodeData(element)).length ? { data: nodeData(element) } : {}),
  }));
  return {
    ok: true,
    reason: "",
    category: presetCategory(nodes),
    topology: { schemaVersion: 1, nodes, connections: edgePairs },
  };
}

export function canvasToolPresetReasonMessage(reason) {
  return {
    no_nodes: "请选择至少一个工作流节点。",
    unsupported_node: "所选内容包含不支持保存的画布对象。",
    cross_selection_edge: "请同时选择连接两端，不能保存跨选区连线。",
    unsupported_edge: "所选内容包含不支持的连线。",
    canvas_workflow_edge_binding_required: "连线端口信息不完整。",
    canvas_workflow_edge_endpoint_missing: "连线端点已不存在。",
    canvas_workflow_edge_direction_invalid: "连线方向无效。",
    canvas_workflow_edge_kind_mismatch: "连线端口类型不兼容。",
    canvas_workflow_edge_cycle: "工作流不能包含循环。",
  }[reason] ?? "无法保存该工具预设。";
}

export function normalizeCanvasUserToolPreset(raw, version = null) {
  const source = raw?.preset ?? raw ?? {};
  const currentVersion = version ?? source.currentVersion ?? source.version ?? null;
  const topology = currentVersion?.topology ?? source.topology ?? null;
  const hasTopology = Array.isArray(topology?.nodes) && topology.nodes.length > 0 && Array.isArray(topology?.connections);
  const nodes = hasTopology ? topology.nodes : [];
  const connections = hasTopology ? topology.connections : [];
  const id = text(source.id);
  if (!id) return null;
  const currentVersionNumber = Number(source.currentVersionNumber ?? source.currentVersion?.versionNumber) || 1;
  const nodeCount = Number(source.nodeCount ?? currentVersion?.nodeCount);
  const edgeCount = Number(source.edgeCount ?? currentVersion?.edgeCount);
  return {
    ...source,
    id,
    title: text(source.name ?? source.title) || "未命名工具",
    category: text(source.category) || "all",
    categoryLabel: text(source.categoryLabel ?? source.category) || "我的工具",
    description: text(source.description),
    tags: Array.isArray(source.tags) ? source.tags : [],
    source: "user",
    currentVersionNumber,
    selectedVersionNumber: Number(currentVersion?.versionNumber) || currentVersionNumber,
    nodeCount: Number.isInteger(nodeCount) && nodeCount >= 0 ? nodeCount : nodes.length,
    edgeCount: Number.isInteger(edgeCount) && edgeCount >= 0 ? edgeCount : connections.length,
    topology: hasTopology ? { schemaVersion: Number(topology.schemaVersion) || 1, nodes, connections } : null,
    preview: hasTopology
      ? { kind: "workflow-topology", nodes, connections }
      : { kind: "workflow-summary", nodes: [], connections: [] },
  };
}

export function mergeCanvasUserToolPresetMetadata(preset, metadata) {
  const selectedVersionNumber = Number(preset?.selectedVersionNumber);
  const currentVersionNumber = Number(preset?.currentVersionNumber);
  const selectedVersion = (
    preset?.topology?.nodes?.length
    && Number.isFinite(selectedVersionNumber)
    && selectedVersionNumber !== currentVersionNumber
  ) ? {
      versionNumber: selectedVersionNumber,
      topology: preset.topology,
      nodeCount: preset.nodeCount,
      edgeCount: preset.edgeCount,
    } : null;
  return normalizeCanvasUserToolPreset({ ...preset, ...metadata }, selectedVersion);
}

export function useCanvasToolPreset(api, preset, options = {}) {
  if (typeof preset === "string") {
    const builtin = CANVAS_TOOL_PRESETS.find((item) => item.id === preset);
    if (!builtin) return { ok: false, reason: "template_not_found", elementIds: [] };
    return insertCanvasWorkflowTopology(api, builtin, options);
  }
  return insertCanvasWorkflowTopology(api, preset, options);
}
