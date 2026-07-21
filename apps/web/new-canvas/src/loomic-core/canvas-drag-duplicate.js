import { createCanvasSelectionClipboard, duplicateCanvasSelection } from "./canvas-selection-clipboard.js";

function selectedObject(selectedIds, fallbackId = "") {
  const selected = selectedIds && Object.entries(selectedIds).some(([, value]) => value)
    ? selectedIds
    : fallbackId ? { [fallbackId]: true } : {};
  return Object.fromEntries(Object.entries(selected).filter(([, value]) => value));
}

export function createCanvasDragDuplicate(beforeElements, movedElements, selectedIds, {
  copyConnections = false,
  fallbackId = "",
  threshold = 4,
  ...duplicateOptions
} = {}) {
  const before = Array.isArray(beforeElements) ? beforeElements : [];
  const moved = Array.isArray(movedElements) ? movedElements : [];
  const selection = selectedObject(selectedIds, fallbackId);
  const clipboard = createCanvasSelectionClipboard(before, selection, { connectionPolicy: "none" });
  const nodes = clipboard.elements.filter((element) => element && !element.isDeleted && element.type !== "arrow");
  const anchor = nodes[0];
  const movedAnchor = moved.find((element) => element?.id === anchor?.id);
  if (!anchor || !movedAnchor || nodes.some((element) => element.locked)) return null;
  const offsetX = (Number(movedAnchor.x) || 0) - (Number(anchor.x) || 0);
  const offsetY = (Number(movedAnchor.y) || 0) - (Number(anchor.y) || 0);
  if (Math.hypot(offsetX, offsetY) < threshold) return null;
  const connectionPolicy = copyConnections ? (nodes.length === 1 ? "upstream" : "internal") : "none";
  return {
    ...duplicateCanvasSelection(before, selection, {
      ...duplicateOptions,
      offsetX,
      offsetY,
      connectionPolicy,
      titleSuffix: " - 副本",
    }),
    connectionPolicy,
    offsetX,
    offsetY,
  };
}
