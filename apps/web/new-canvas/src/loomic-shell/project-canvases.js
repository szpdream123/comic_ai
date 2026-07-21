export function normalizeProjectCanvas(canvas, fallbackIndex = 0) {
  const id = String(canvas?.id ?? canvas?.canvasProjectId ?? canvas?.canvasId ?? "").trim();
  if (!id) return null;
  const title = String(canvas?.title ?? canvas?.name ?? `画布 ${fallbackIndex + 1}`).trim();
  return {
    ...canvas,
    id,
    title: title || `画布 ${fallbackIndex + 1}`,
    isDefault: canvas?.isDefault === true || canvas?.is_default === true || canvas?.default === true || canvas?.role === "default",
  };
}

export function projectCanvasListFromPayload(payload) {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.canvases)
    ? payload.canvases
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.canvasProjects)
        ? payload.canvasProjects
        : [];
  return candidates.map(normalizeProjectCanvas).filter(Boolean);
}

export function resolveProjectCanvas(canvases, requestedCanvasId) {
  const requested = String(requestedCanvasId ?? "").trim();
  if (requested) {
    const direct = canvases.find((canvas) => canvas.id === requested);
    if (direct) return direct;
  }
  return canvases.find((canvas) => canvas.isDefault) ?? canvases[0] ?? null;
}

export function projectCanvasScopeSuffix(projectId, episodeId, canvasId) {
  return `${String(projectId)}:${String(episodeId)}:${String(canvasId)}`
    .replace(/[^a-zA-Z0-9:_-]+/g, "-");
}

export function buildProjectCanvasHref(canvasId, sourceHref) {
  const base = sourceHref ?? (typeof window !== "undefined" ? window.location.href : "http://localhost/new-canvas/");
  const url = new URL(base, "http://localhost");
  url.searchParams.set("canvasId", String(canvasId));
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}

export async function persistBeforeProjectCanvasNavigation({ storage, canvasId, content }) {
  if (!storage?.save) throw new Error("画布存储尚未准备完成。");
  const result = await storage.save(canvasId, content);
  if (result?.status === "conflict") {
    const error = new Error("当前画布存在保存冲突，请先处理冲突后再切换。");
    error.code = "canvas_navigation_conflict";
    throw error;
  }
  if (result?.source === "local" && result?.cloudPending) {
    const error = new Error("当前画布尚未同步到云端，请恢复网络后再切换。");
    error.code = "canvas_navigation_cloud_pending";
    throw error;
  }
  return result;
}
