export function canvasUiScale(ownerDocument = globalThis.document) {
  const body = ownerDocument?.body;
  const view = ownerDocument?.defaultView ?? globalThis.window;
  const scale = Number.parseFloat(view?.getComputedStyle?.(body)?.zoom);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function rotatePoint(point, center, angle) {
  if (!angle) return point;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function containsLinearElementPoint(element, point) {
  const points = Array.isArray(element.points) ? element.points : [];
  if (points.length < 2) return false;
  const localPoint = { x: point.x - Number(element.x), y: point.y - Number(element.y) };
  const threshold = Math.max(8, (Number(element.strokeWidth) || 1) * 4);
  return points.some((entry, index) => {
    if (!index) return false;
    const previous = points[index - 1];
    return distanceToSegment(
      localPoint,
      { x: Number(previous?.[0]) || 0, y: Number(previous?.[1]) || 0 },
      { x: Number(entry?.[0]) || 0, y: Number(entry?.[1]) || 0 },
    ) <= threshold;
  });
}

function containsScenePoint(element, point) {
  if (!element || element.isDeleted) return false;
  const x = Number(element.x);
  const y = Number(element.y);
  const width = Number(element.width);
  const height = Number(element.height);
  if (![x, y, width, height].every(Number.isFinite)) return false;
  const left = Math.min(x, x + width);
  const right = Math.max(x, x + width);
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const unrotatedPoint = rotatePoint(point, center, -(Number(element.angle) || 0));
  if (["arrow", "line", "freedraw"].includes(element.type)) {
    return containsLinearElementPoint(element, unrotatedPoint);
  }
  return unrotatedPoint.x >= left && unrotatedPoint.x <= right
    && unrotatedPoint.y >= top && unrotatedPoint.y <= bottom;
}

export function resolveCanvasQuickAddRequest(api, pointer, bounds, options = {}) {
  if (!api || !bounds) return null;
  const clientX = Number(pointer?.clientX);
  const clientY = Number(pointer?.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;

  const appState = api.getAppState?.() ?? {};
  if (appState.editingElement || appState.editingTextElement || appState.newElement || appState.resizingElement) return null;
  const zoom = Number(appState.zoom?.value ?? appState.zoom) || 1;
  const uiScale = Number(options.uiScale) > 0 ? Number(options.uiScale) : canvasUiScale();
  const point = {
    x: (clientX - bounds.left) / uiScale / zoom - (Number(appState.scrollX) || 0),
    y: (clientY - bounds.top) / uiScale / zoom - (Number(appState.scrollY) || 0),
  };
  if ((api.getSceneElements?.() ?? []).some((element) => containsScenePoint(element, point))) return null;
  return { clientX, clientY, sceneX: point.x, sceneY: point.y };
}
