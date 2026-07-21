const FONT_FAMILIES = {
  1: "20px Virgil, Segoe Print, Comic Sans MS, cursive",
  2: "20px Helvetica, Arial, sans-serif",
  3: "20px Cascadia, monospace",
};

function measureText(text, fontSize, fontFamily = 1) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { width: text.length * fontSize * 0.6, height: fontSize * 1.25 };
  context.font = (FONT_FAMILIES[fontFamily] ?? FONT_FAMILIES[1]).replace("20px", `${fontSize}px`);
  const lines = text.split("\n");
  return {
    width: Math.max(...lines.map((line) => context.measureText(line).width), 0),
    height: lines.length * fontSize * 1.25,
  };
}

function validateBindings(elements) {
  const activeIds = new Set(elements.filter((element) => !element.isDeleted).map((element) => element.id));
  let changed = false;
  for (const element of elements) {
    if (element.isDeleted) continue;
    if (Array.isArray(element.boundElements)) {
      const boundElements = element.boundElements.filter((binding) => binding?.id && activeIds.has(binding.id));
      if (boundElements.length !== element.boundElements.length) {
        element.boundElements = boundElements;
        changed = true;
      }
    }
    if (element.containerId && !activeIds.has(element.containerId)) {
      element.containerId = null;
      changed = true;
    }
    for (const property of ["startBinding", "endBinding"]) {
      if (element[property] && !activeIds.has(element[property].elementId)) {
        element[property] = null;
        changed = true;
      }
    }
  }
  return changed;
}

function recenterBoundText(elements) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  let changed = false;
  for (const element of elements) {
    if (element.isDeleted || element.type !== "text" || !element.containerId || !element.text) continue;
    const container = byId.get(element.containerId);
    if (!container || container.isDeleted) continue;
    const fontSize = element.fontSize || 20;
    const measured = measureText(element.text, fontSize, element.fontFamily || 1);
    if (Math.abs(measured.width - (element.width || 0)) / Math.max(element.width || 0, 1) > 0.05) {
      element.width = measured.width;
      changed = true;
    }
    if (Math.abs(measured.height - (element.height || 0)) / Math.max(element.height || 0, 1) > 0.05) {
      element.height = measured.height;
      changed = true;
    }
    const minWidth = element.width + Math.max(fontSize * 1.5, 30) * 2;
    const minHeight = element.height + Math.max(fontSize * 1.2, 24) * 2;
    if ((container.width || 0) < minWidth) { container.width = minWidth; changed = true; }
    if ((container.height || 0) < minHeight) { container.height = minHeight; changed = true; }
    const x = container.x + (container.width - element.width) / 2;
    const y = container.y + (container.height - element.height) / 2;
    if (Math.abs(x - (element.x || 0)) > 2 || Math.abs(y - (element.y || 0)) > 2) {
      element.x = x;
      element.y = y;
      changed = true;
    }
  }
  return changed;
}

export function normalizeCanvasElements(elements) {
  let changed = false;
  if (validateBindings(elements)) changed = true;
  if (recenterBoundText(elements)) changed = true;
  return { elements, changed };
}
