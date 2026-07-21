const DEFAULT_WIDTH = 184;
const DEFAULT_HEIGHT = 116;
const DEFAULT_PADDING = 8;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function visibleCanvasBounds(appState = {}) {
  const zoom = Math.max(0.01, finite(appState.zoom?.value ?? appState.zoom, 1));
  const left = -finite(appState.scrollX);
  const top = -finite(appState.scrollY);
  return {
    x: left,
    y: top,
    width: Math.max(1, finite(appState.width, 1) / zoom),
    height: Math.max(1, finite(appState.height, 1) / zoom),
  };
}

export function createCanvasMinimapModel(elements, appState = {}, options = {}) {
  const width = Math.max(1, finite(options.width, DEFAULT_WIDTH));
  const height = Math.max(1, finite(options.height, DEFAULT_HEIGHT));
  const padding = Math.max(0, finite(options.padding, DEFAULT_PADDING));
  const nodes = (Array.isArray(elements) ? elements : []).filter((element) => element && !element.isDeleted && element.type !== "arrow").map((element) => ({
    id: element.id,
    type: element.customData?.type ?? element.type,
    x: finite(element.x),
    y: finite(element.y),
    width: Math.max(1, Math.abs(finite(element.width, 1))),
    height: Math.max(1, Math.abs(finite(element.height, 1))),
  }));
  const viewport = visibleCanvasBounds(appState);
  const regions = [...nodes, viewport];
  const left = Math.min(...regions.map((item) => item.x));
  const top = Math.min(...regions.map((item) => item.y));
  const right = Math.max(...regions.map((item) => item.x + item.width));
  const bottom = Math.max(...regions.map((item) => item.y + item.height));
  const sceneWidth = Math.max(1, right - left);
  const sceneHeight = Math.max(1, bottom - top);
  const scale = Math.max(0.000001, Math.min((width - padding * 2) / sceneWidth, (height - padding * 2) / sceneHeight));
  const drawWidth = sceneWidth * scale;
  const drawHeight = sceneHeight * scale;
  const offsetX = (width - drawWidth) / 2 - left * scale;
  const offsetY = (height - drawHeight) / 2 - top * scale;
  const project = (region, minimumSize = 0) => ({
    x: region.x * scale + offsetX,
    y: region.y * scale + offsetY,
    width: Math.max(minimumSize, region.width * scale),
    height: Math.max(minimumSize, region.height * scale),
  });
  return {
    width,
    height,
    scale,
    offsetX,
    offsetY,
    nodes: nodes.map((node) => ({ ...node, rect: project(node, 2) })),
    viewport: project(viewport, 4),
  };
}

export function minimapPointToScene(model, x, y) {
  return {
    x: (finite(x) - model.offsetX) / model.scale,
    y: (finite(y) - model.offsetY) / model.scale,
  };
}

export function canvasScrollForSceneCenter(appState = {}, point = {}) {
  const zoom = Math.max(0.01, finite(appState.zoom?.value ?? appState.zoom, 1));
  return {
    scrollX: -finite(point.x) + finite(appState.width) / (2 * zoom),
    scrollY: -finite(point.y) + finite(appState.height) / (2 * zoom),
  };
}

export function canvasScrollForZoom(appState = {}, nextZoom = 1) {
  const currentZoom = Math.max(0.01, finite(appState.zoom?.value ?? appState.zoom, 1));
  const zoom = Math.max(0.01, finite(nextZoom, currentZoom));
  const center = {
    x: -finite(appState.scrollX) + finite(appState.width) / (2 * currentZoom),
    y: -finite(appState.scrollY) + finite(appState.height) / (2 * currentZoom),
  };
  return canvasScrollForSceneCenter({ ...appState, zoom: { value: zoom } }, center);
}
