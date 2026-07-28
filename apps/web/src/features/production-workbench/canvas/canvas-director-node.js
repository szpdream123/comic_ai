const MAX_DIRECTOR_CAPTURES = 12;

function text(value) {
  return String(value ?? "").trim();
}

function firstText(...values) {
  return values.map(text).find(Boolean) ?? "";
}

export function normalizeCanvasDirectorCapture(input = {}) {
  const artifact = input.artifact && typeof input.artifact === "object" ? input.artifact : {};
  const upload = input.upload && typeof input.upload === "object" ? input.upload : {};
  const version = input.version && typeof input.version === "object" ? input.version : {};
  const storageObject = input.storageObject && typeof input.storageObject === "object" ? input.storageObject : {};
  const storageObjectId = firstText(
    input.storageObjectId,
    artifact.storageObjectId,
    upload.storageObjectId,
    storageObject.id,
  );
  const artifactId = firstText(input.artifactId, artifact.artifactId, artifact.id);
  if (!artifactId || !storageObjectId) return null;
  const artifactKind = firstText(input.artifactKind, artifact.artifactKind, artifact.kind).toLowerCase() === "video"
    ? "video"
    : "image";
  return {
    artifactId,
    artifactKind,
    storageObjectId,
    assetId: firstText(input.assetId, artifact.assetId, upload.assetId) || null,
    assetVersionId: firstText(input.assetVersionId, artifact.assetVersionId, version.id, upload.assetVersionId) || null,
    fileName: firstText(input.fileName, artifact.fileName, artifact.metadata?.fileName) || null,
    directorArtifactKind: firstText(
      input.directorArtifactKind,
      artifact.directorArtifactKind,
      artifact.metadata?.directorArtifactKind,
    ) || (artifactKind === "video" ? "video" : "screenshot"),
    createdAt: firstText(input.createdAt, artifact.createdAt) || new Date().toISOString(),
  };
}

export function canvasDirectorCaptureUrl(capture = {}) {
  const storageObjectId = text(capture.storageObjectId);
  return storageObjectId
    ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?proxy=1`
    : "";
}

export function updateCanvasDirectorCaptureDocument(document, nodeId, capture) {
  const normalizedNodeId = text(nodeId);
  const normalizedCapture = normalizeCanvasDirectorCapture(capture);
  if (!normalizedNodeId || !normalizedCapture || !Array.isArray(document?.nodes)) return document;
  let changed = false;
  const nodes = document.nodes.map((node) => {
    if (node?.id !== normalizedNodeId || node?.type !== "ai-director") return node;
    const existing = Array.isArray(node.data?.directorCaptures)
      ? node.data.directorCaptures.map(normalizeCanvasDirectorCapture).filter(Boolean)
      : [];
    const deduped = existing.filter((item) => (
      item.artifactId !== normalizedCapture.artifactId
      && item.storageObjectId !== normalizedCapture.storageObjectId
    ));
    const directorCaptures = [...deduped, normalizedCapture].slice(-MAX_DIRECTOR_CAPTURES);
    changed = true;
    return {
      ...node,
      data: {
        ...(node.data ?? {}),
        directorCaptures,
        artifactId: normalizedCapture.artifactId,
        assetId: normalizedCapture.assetId,
        assetVersionId: normalizedCapture.assetVersionId,
        storageObjectId: normalizedCapture.storageObjectId,
        mediaKind: normalizedCapture.artifactKind,
        status: "success",
        directorStatus: "ready",
        error: null,
      },
    };
  });
  return changed ? { ...document, nodes } : document;
}

export function canvasDirectorRecentCaptures(node, limit = 4) {
  const captures = Array.isArray(node?.data?.directorCaptures)
    ? node.data.directorCaptures.map(normalizeCanvasDirectorCapture).filter(Boolean)
    : [];
  return captures.slice(-Math.max(0, Number(limit) || 0));
}

export function renderCanvasDirectorNodeBody(node = {}) {
  const nodeId = text(node?.id);
  const captures = canvasDirectorRecentCaptures(node, 4);
  const total = Array.isArray(node?.data?.directorCaptures) ? node.data.directorCaptures.length : captures.length;
  const preview = captures.length
    ? `<div class="canvas-director-capture-grid">${captures.map((capture) => {
        const url = canvasDirectorCaptureUrl(capture);
        return capture.artifactKind === "video"
          ? `<video src="${escapeAttr(url)}" muted playsinline preload="metadata" aria-label="导演台参考视频"></video>`
          : `<img src="${escapeAttr(url)}" alt="导演台截图" draggable="false" loading="lazy" />`;
      }).join("")}</div>`
    : `<div class="canvas-director-empty"><span aria-hidden="true">3D</span><strong>3D 导演台</strong><small>打开导演台并同步当前帧</small></div>`;
  return `<section class="canvas-director-node-body" data-canvas-director-body data-node-id="${escapeAttr(nodeId)}">
    ${preview}
    <div class="canvas-director-actions" role="group" aria-label="导演台节点操作">
      <button type="button" data-action="open-canvas-director" data-node-id="${escapeAttr(nodeId)}">打开导演台</button>
      <button type="button" data-action="sync-canvas-director-frame" data-node-id="${escapeAttr(nodeId)}" title="打开导演台后同步当前视角">同步当前帧</button>
      <button type="button" data-action="export-canvas-director-video" data-node-id="${escapeAttr(nodeId)}" title="按当前运镜导出 720p 参考视频">导出视频</button>
    </div>
    <output class="canvas-director-capture-count" aria-label="导演台结果数量">${total ? `${total} 个结果` : "未同步结果"}</output>
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
