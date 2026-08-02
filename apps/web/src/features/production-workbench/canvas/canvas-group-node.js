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

export function resolveCanvasBatchDownloadItems(document, nodeIds = [], options = {}) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const contentNodeIds = new Set(canvasSelectionContentNodeIds(document, nodeIds));
  const nodeById = new Map(nodes.map((node) => [text(node?.id), node]));
  const assets = Array.isArray(options.assets) ? options.assets : [];
  const historyItems = Array.isArray(options.historyItems) ? options.historyItems : [];
  const items = [];
  const seen = new Set();
  const addItem = (input = {}) => {
    const storageObjectId = text(input.storageObjectId);
    const url = text(input.url);
    const key = storageObjectId ? `storage:${storageObjectId}` : url ? `url:${url}` : "";
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push({
      nodeId: text(input.nodeId),
      storageObjectId,
      url,
      fileName: text(input.fileName) || "画布产物",
      mediaKind: text(input.mediaKind) || "file",
    });
  };

  for (const run of historyItems) {
    const nodeId = text(run?.nodeKey ?? run?.node_id);
    if (!contentNodeIds.has(nodeId)) continue;
    const nodeTitle = text(nodeById.get(nodeId)?.data?.title) || "画布产物";
    const artifacts = Array.isArray(run?.artifacts) ? run.artifacts : [];
    artifacts.forEach((artifact, artifactIndex) => {
      const metadata = artifact?.metadata && typeof artifact.metadata === "object"
        ? artifact.metadata
        : artifact?.metadata_json && typeof artifact.metadata_json === "object" ? artifact.metadata_json : {};
      addItem({
        nodeId,
        storageObjectId: artifact?.storageObjectId ?? artifact?.storage_object_id,
        url: artifact?.downloadUrl ?? artifact?.download_url ?? artifact?.url ?? metadata.downloadUrl ?? metadata.url,
        fileName: metadata.fileName ?? metadata.name ?? metadata.title ?? artifact?.fileName ?? `${nodeTitle}-${artifactIndex + 1}`,
        mediaKind: artifact?.artifactKind ?? artifact?.artifact_kind ?? run?.mediaKind,
      });
    });
  }

  for (const asset of assets) {
    const nodeId = text(asset?.nodeKey ?? asset?.nodeId);
    if (!contentNodeIds.has(nodeId)) continue;
    addItem({
      nodeId,
      storageObjectId: asset?.storageObjectId,
      url: asset?.downloadUrl ?? asset?.url ?? asset?.previewUrl,
      fileName: asset?.fileName ?? asset?.title ?? asset?.name,
      mediaKind: asset?.kind ?? asset?.mediaKind,
    });
  }

  for (const nodeId of contentNodeIds) {
    const node = nodeById.get(nodeId);
    const data = node?.data && typeof node.data === "object" ? node.data : {};
    const assetId = text(data.assetId ?? data.sourceAssetId);
    const assetVersionId = text(data.assetVersionId ?? data.sourceAssetVersionId);
    const asset = assets.find((candidate) => (
      (assetId && text(candidate?.assetId ?? candidate?.id) === assetId)
      || (assetVersionId && text(candidate?.assetVersionId) === assetVersionId)
    ));
    addItem({
      nodeId,
      storageObjectId: data.storageObjectId
        ?? data.sourceStorageObjectId
        ?? data.resultStorageObjectId
        ?? data.mediaStorageObjectId
        ?? asset?.storageObjectId,
      url: data.downloadUrl
        ?? data.resultUrl
        ?? data.url
        ?? data.assetUrl
        ?? data.sourceUrl
        ?? data.previewUrl
        ?? asset?.downloadUrl
        ?? asset?.url
        ?? asset?.previewUrl,
      fileName: data.fileName ?? data.name ?? data.title ?? asset?.fileName ?? asset?.title ?? node?.type,
      mediaKind: data.mediaKind ?? asset?.kind ?? node?.type,
    });
  }

  return items;
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
