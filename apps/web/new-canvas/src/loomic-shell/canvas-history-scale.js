export const CANVAS_HISTORY_SCALE_DEFAULT = 100;
export const CANVAS_HISTORY_SCALE_MIN = 50;
export const CANVAS_HISTORY_SCALE_MAX = 200;
export const CANVAS_HISTORY_SCALE_STEP = 10;

export function normalizeCanvasHistoryScale(value = CANVAS_HISTORY_SCALE_DEFAULT) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return CANVAS_HISTORY_SCALE_DEFAULT;
  const stepped = Math.round(numeric / CANVAS_HISTORY_SCALE_STEP) * CANVAS_HISTORY_SCALE_STEP;
  return Math.min(CANVAS_HISTORY_SCALE_MAX, Math.max(CANVAS_HISTORY_SCALE_MIN, stepped));
}

export function stepCanvasHistoryScale(current, direction) {
  const delta = direction < 0 ? -CANVAS_HISTORY_SCALE_STEP : CANVAS_HISTORY_SCALE_STEP;
  return normalizeCanvasHistoryScale(normalizeCanvasHistoryScale(current) + delta);
}

function scaledPixels(base, scale, min, max) {
  return Math.round(Math.min(max, Math.max(min, base * scale / 100)));
}

export function canvasHistoryScaleStyle(value) {
  const scale = normalizeCanvasHistoryScale(value);
  const previewWidth = scaledPixels(48, scale, 36, 96);
  const previewHeight = scaledPixels(44, scale, 34, 88);
  return {
    "--lm-history-card-min-width": `${scaledPixels(250, scale, 190, 380)}px`,
    "--lm-history-preview-width": `${previewWidth}px`,
    "--lm-history-preview-height": `${previewHeight}px`,
    "--lm-history-row-min-height": `${Math.max(52, previewHeight + 8)}px`,
  };
}
