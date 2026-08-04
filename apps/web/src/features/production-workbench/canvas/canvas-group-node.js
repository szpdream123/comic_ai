import { resolveCanvasMediaNodeSource } from "./canvas-media-node.js";

export const CANVAS_GROUP_COLORS = Object.freeze([
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#64748b",
]);

const RUNNABLE_NODE_TYPES = new Set([
  "send",
  "ai-text",
  "ai-image",
  "ai-video",
  "ai-audio",
  "ai-animation",
  "ai-panorama",
  "ai-markdown",
  "ai-storyboard",
]);

function text(value) {
  return String(value ?? "").trim();
}

export function normalizeCanvasGroupColor(value) {
  const normalized = text(value).toLowerCase();
  return CANVAS_GROUP_COLORS.find((color) => color === normalized) ?? CANVAS_GROUP_COLORS[0];
}

export function canvasGroupChildIds(node) {
  return [...new Set((Array.isArray(node?.data?.childNodeIds) ? node.data.childNodeIds : [])
    .map(text)
    .filter(Boolean))];
}

export function canvasGroupRunnableNodeIds(document, groupNode) {
  const childIds = new Set(canvasGroupChildIds(groupNode));
  return (Array.isArray(document?.nodes) ? document.nodes : [])
    .filter((node) => childIds.has(text(node?.id)) && RUNNABLE_NODE_TYPES.has(text(node?.type)))
    .map((node) => text(node.id));
}

export function canvasSelectionContentNodeIds(document, nodeIds = []) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const nodeById = new Map(nodes.map((node) => [text(node?.id), node]));
  const selectedIds = [...new Set((Array.isArray(nodeIds) ? nodeIds : [nodeIds]).map(text).filter(Boolean))];
  return [...new Set(selectedIds.flatMap((nodeId) => {
    const node = nodeById.get(nodeId);
    return node?.type === "group" ? canvasGroupChildIds(node) : node ? [nodeId] : [];
  }))].filter((nodeId) => nodeById.get(nodeId)?.type !== "group");
}

export function canvasConnectedVideoNodeIds(document, sourceNodeId) {
  const sourceId = text(sourceNodeId);
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  if (!sourceId || !nodes.length) return [];
  const nodeById = new Map(nodes.map((node) => [text(node?.id), node]));
  const sourceNode = nodeById.get(sourceId);
  if (!sourceNode) return [];
  const targetsBySourceId = new Map();
  for (const edge of Array.isArray(document?.edges) ? document.edges : []) {
    const edgeSourceId = text(edge?.sourceNodeId);
    const edgeTargetId = text(edge?.targetNodeId);
    if (!edgeSourceId || !edgeTargetId || !nodeById.has(edgeTargetId)) continue;
    const targetIds = targetsBySourceId.get(edgeSourceId) ?? [];
    targetIds.push(edgeTargetId);
    targetsBySourceId.set(edgeSourceId, targetIds);
  }
  const reachableNodeIds = new Set([sourceId]);
  const pendingNodeIds = [sourceId];
  while (pendingNodeIds.length) {
    const currentId = pendingNodeIds.shift();
    for (const targetId of targetsBySourceId.get(currentId) ?? []) {
      if (reachableNodeIds.has(targetId)) continue;
      reachableNodeIds.add(targetId);
      pendingNodeIds.push(targetId);
    }
  }
  const workflowVideoNodeIds = new Set((Array.isArray(sourceNode.data?.workflowNodes) ? sourceNode.data.workflowNodes : [])
    .filter((item) => text(item?.kind ?? item) === "storyboard")
    .map((item) => text(item?.id))
    .filter(Boolean));
  return nodes
    .filter((node) => {
      const nodeId = text(node?.id);
      const nodeType = text(node?.type).toLowerCase();
      const isVideo = text(node?.data?.mediaKind).toLowerCase() === "video" || nodeType.includes("video");
      return isVideo && (
        reachableNodeIds.has(nodeId)
        || text(node?.data?.workflowParentId) === sourceId
        || workflowVideoNodeIds.has(nodeId)
      );
    })
    .map((node) => text(node.id));
}

export function resolveCanvasCurrentVideoDownloadItems(document, nodeIds = []) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const requestedNodeIds = new Set(canvasSelectionContentNodeIds(document, nodeIds));
  return nodes.flatMap((node) => {
    const nodeId = text(node?.id);
    if (!requestedNodeIds.has(nodeId)) return [];
    const nodeType = text(node?.type).toLowerCase();
    const mediaKind = text(node?.data?.mediaKind).toLowerCase();
    if (!nodeType.includes("video") && mediaKind !== "video") return [];
    const url = resolveCanvasMediaNodeSource(node, "video");
    if (!url) return [];
    return [{
      nodeId,
      storageObjectId: "",
      url,
      fileName: text(node?.data?.fileName ?? node?.data?.name ?? node?.data?.title) || "画布视频",
      mediaKind: "video",
    }];
  });
}

export function resolveCanvasBatchDownloadItems(document, nodeIds = [], options = {}) {
  void options;
  return resolveCanvasCurrentVideoDownloadItems(document, nodeIds);
}

export function updateCanvasGroupData(document, groupId, patch = {}) {
  const normalizedGroupId = text(groupId);
  if (!normalizedGroupId || !Array.isArray(document?.nodes)) return document;
  let changed = false;
  const nodes = document.nodes.map((node) => {
    if (node?.id !== normalizedGroupId || node?.type !== "group") return node;
    const title = text(patch.title ?? node.data?.title) || "节点分组";
    const color = normalizeCanvasGroupColor(patch.color ?? node.data?.color);
    if (title === node.data?.title && color === node.data?.color) return node;
    changed = true;
    return { ...node, data: { ...(node.data ?? {}), title, color } };
  });
  return changed ? { ...document, nodes } : document;
}

export function renderCanvasGroupNodeBody(node = {}) {
  const nodeId = text(node?.id);
  const workflowGroupKind = text(node?.data?.scriptWorkflowGroupKind);
  if (workflowGroupKind === "assets" || workflowGroupKind === "storyboards") {
    const title = text(node?.data?.title) || (workflowGroupKind === "assets" ? "资产批量生成" : "分镜批量生成");
    const count = canvasGroupChildIds(node).length;
    const detail = workflowGroupKind === "assets" ? "角色 · 场景 · 道具" : "视频分镜";
    const color = normalizeCanvasGroupColor(node?.data?.color);
    return `<section class="canvas-group-node-body is-script-workflow-group is-${workflowGroupKind}" data-canvas-group-body data-node-id="${escapeAttr(nodeId)}" style="--canvas-script-group-accent:${escapeAttr(color)}">
      <span class="canvas-script-group-kicker">批量运行</span>
      <strong class="canvas-group-node-label">${escapeHtml(title)}</strong>
      <span class="canvas-script-group-meta">${escapeHtml(detail)} · ${count} 个节点</span>
    </section>`;
  }
  return `<section class="canvas-group-node-body" data-canvas-group-body data-node-id="${escapeAttr(nodeId)}">
    <strong class="canvas-group-node-label">运行组</strong>
  </section>`;
}

function escapeAttr(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function escapeHtml(value) {
  return escapeAttr(value);
}
