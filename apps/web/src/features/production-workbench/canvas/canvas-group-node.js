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
  const title = text(node?.data?.title) || "节点分组";
  const color = normalizeCanvasGroupColor(node?.data?.color);
  const childCount = canvasGroupChildIds(node).length;
  return `<section class="canvas-group-node-body" data-canvas-group-body data-node-id="${escapeAttr(nodeId)}" style="--canvas-group-color:${escapeAttr(color)}">
    <header class="canvas-group-node-header">
      <input type="text" value="${escapeAttr(title)}" maxlength="80" data-canvas-group-title-input data-node-id="${escapeAttr(nodeId)}" aria-label="分组名称" />
      <output aria-label="分组节点数量">${childCount} 节点</output>
      <button type="button" data-action="run-canvas-group" data-node-id="${escapeAttr(nodeId)}"${childCount ? "" : " disabled"} aria-label="批量运行组内节点" title="批量运行组内节点">运行</button>
    </header>
    <div class="canvas-group-color-swatches" role="group" aria-label="分组颜色">
      ${CANVAS_GROUP_COLORS.map((candidate) => `<button type="button" data-action="set-canvas-group-color" data-node-id="${escapeAttr(nodeId)}" data-group-color="${candidate}" aria-label="设置分组颜色 ${candidate}" aria-pressed="${candidate === color}" style="--canvas-group-swatch:${candidate}"></button>`).join("")}
    </div>
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
