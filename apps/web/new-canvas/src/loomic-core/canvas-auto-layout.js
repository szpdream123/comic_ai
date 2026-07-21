import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();
const DEFAULT_NODE_SPACING = 56;
const DEFAULT_LAYER_SPACING = 120;
export const CANVAS_LAYOUT_SPACING_PRESETS = Object.freeze({
  compact: Object.freeze({ nodeSpacing: 32, layerSpacing: 72, componentSpacing: 72 }),
  standard: Object.freeze({ nodeSpacing: 56, layerSpacing: 120, componentSpacing: 120 }),
  loose: Object.freeze({ nodeSpacing: 88, layerSpacing: 180, componentSpacing: 180 }),
});

export function canvasLayoutSettingsToOptions(settings = {}) {
  const spacing = CANVAS_LAYOUT_SPACING_PRESETS[settings.spacing] ?? CANVAS_LAYOUT_SPACING_PRESETS.standard;
  return {
    direction: settings.direction === "DOWN" ? "DOWN" : "RIGHT",
    ...spacing,
  };
}

function randomInteger() {
  return Math.floor(Math.random() * 2_000_000_000);
}

function liveLayoutElements(elements) {
  return elements.filter((element) => element && !element.isDeleted && element.type !== "arrow");
}

function createUnionFind(elements) {
  const parents = new Map(elements.map((element) => [element.id, element.id]));
  const find = (id) => {
    const parent = parents.get(id);
    if (!parent || parent === id) return parent;
    const root = find(parent);
    parents.set(id, root);
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (!leftRoot || !rightRoot || leftRoot === rightRoot) return;
    parents.set(rightRoot, leftRoot);
  };
  return { find, union };
}

function elementBounds(element) {
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;
  const width = Math.max(1, Math.abs(Number(element.width) || 0));
  const height = Math.max(1, Math.abs(Number(element.height) || 0));
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function collectLayoutUnits(elements) {
  const nodes = liveLayoutElements(elements);
  const nodeIds = new Set(nodes.map((element) => element.id));
  const { find, union } = createUnionFind(nodes);
  const groupedById = new Map();

  for (const element of nodes) {
    if (element.containerId && nodeIds.has(element.containerId)) union(element.id, element.containerId);
    if (element.frameId && nodeIds.has(element.frameId)) union(element.id, element.frameId);
    for (const groupId of element.groupIds ?? []) {
      const peer = groupedById.get(groupId);
      if (peer) union(element.id, peer);
      else groupedById.set(groupId, element.id);
    }
  }

  const unitByRoot = new Map();
  for (const element of nodes) {
    const root = find(element.id);
    if (!unitByRoot.has(root)) unitByRoot.set(root, { id: root, elements: [], locked: false });
    const unit = unitByRoot.get(root);
    unit.elements.push(element);
    unit.locked ||= Boolean(element.locked);
  }

  const units = [...unitByRoot.values()].map((unit) => {
    const bounds = unit.elements.map(elementBounds);
    const x = Math.min(...bounds.map((item) => item.x));
    const y = Math.min(...bounds.map((item) => item.y));
    const right = Math.max(...bounds.map((item) => item.right));
    const bottom = Math.max(...bounds.map((item) => item.bottom));
    return { ...unit, x, y, width: right - x, height: bottom - y };
  });
  const unitIdByElementId = new Map();
  for (const unit of units) {
    for (const element of unit.elements) unitIdByElementId.set(element.id, unit.id);
  }
  return { units, unitIdByElementId };
}

function boundElementId(binding) {
  return String(binding?.elementId ?? binding?.element_id ?? "").trim();
}

function createElkGraph(elements, units, unitIdByElementId, options) {
  const movableUnits = units.filter((unit) => !unit.locked);
  const movableIds = new Set(movableUnits.map((unit) => unit.id));
  const seenEdges = new Set();
  const edges = [];
  for (const element of elements) {
    if (element?.isDeleted || element?.type !== "arrow") continue;
    const source = unitIdByElementId.get(boundElementId(element.startBinding));
    const target = unitIdByElementId.get(boundElementId(element.endBinding));
    if (!source || !target || source === target || !movableIds.has(source) || !movableIds.has(target)) continue;
    const key = `${source}:${target}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({ id: `edge:${element.id}`, sources: [source], targets: [target] });
  }
  return {
    id: "loomic-canvas-layout",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": options.direction ?? "RIGHT",
      "elk.spacing.nodeNode": String(options.nodeSpacing ?? DEFAULT_NODE_SPACING),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(options.layerSpacing ?? DEFAULT_LAYER_SPACING),
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": String(options.componentSpacing ?? DEFAULT_LAYER_SPACING),
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    },
    children: movableUnits.map((unit) => ({ id: unit.id, width: unit.width, height: unit.height })),
    edges,
  };
}

function rotatePointAroundCenter(element, point) {
  const angle = Number(element.angle) || 0;
  if (!angle) return point;
  const centerX = (Number(element.x) || 0) + (Number(element.width) || 0) / 2;
  const centerY = (Number(element.y) || 0) + (Number(element.height) || 0) / 2;
  const x = point.x - centerX;
  const y = point.y - centerY;
  return {
    x: centerX + x * Math.cos(angle) - y * Math.sin(angle),
    y: centerY + x * Math.sin(angle) + y * Math.cos(angle),
  };
}

function bindingPoint(element, binding, direction) {
  const fixedPoint = Array.isArray(binding?.fixedPoint) ? binding.fixedPoint : null;
  const xRatio = Number.isFinite(Number(fixedPoint?.[0])) ? Number(fixedPoint[0]) : direction === "start" ? 1 : 0;
  const yRatio = Number.isFinite(Number(fixedPoint?.[1])) ? Number(fixedPoint[1]) : 0.5;
  return rotatePointAroundCenter(element, {
    x: (Number(element.x) || 0) + (Number(element.width) || 0) * xRatio,
    y: (Number(element.y) || 0) + (Number(element.height) || 0) * yRatio,
  });
}

function transformArrowPoints(arrow, start, end) {
  const points = Array.isArray(arrow.points) && arrow.points.length >= 2 ? arrow.points : [[0, 0], [1, 0]];
  const first = points[0];
  const last = points[points.length - 1];
  const oldX = (Number(last?.[0]) || 0) - (Number(first?.[0]) || 0);
  const oldY = (Number(last?.[1]) || 0) - (Number(first?.[1]) || 0);
  const newX = end.x - start.x;
  const newY = end.y - start.y;
  const oldLengthSquared = oldX * oldX + oldY * oldY;
  return points.map((point, index) => {
    if (index === 0) return [0, 0];
    if (index === points.length - 1) return [newX, newY];
    if (oldLengthSquared < 0.0001) {
      const progress = index / (points.length - 1);
      return [newX * progress, newY * progress];
    }
    const relativeX = (Number(point?.[0]) || 0) - (Number(first?.[0]) || 0);
    const relativeY = (Number(point?.[1]) || 0) - (Number(first?.[1]) || 0);
    const along = (relativeX * oldX + relativeY * oldY) / oldLengthSquared;
    const across = (relativeY * oldX - relativeX * oldY) / oldLengthSquared;
    return [along * newX - across * newY, along * newY + across * newX];
  });
}

function updateBoundArrowGeometry(element, nodeById, movedNodeIds) {
  if (element?.isDeleted || element?.type !== "arrow") return element;
  const sourceId = boundElementId(element.startBinding);
  const targetId = boundElementId(element.endBinding);
  if (!movedNodeIds.has(sourceId) && !movedNodeIds.has(targetId)) return element;
  const source = nodeById.get(sourceId);
  const target = nodeById.get(targetId);
  if (!source || !target) return element;
  const start = bindingPoint(source, element.startBinding, "start");
  const end = bindingPoint(target, element.endBinding, "end");
  const points = transformArrowPoints(element, start, end);
  return {
    ...element,
    x: start.x,
    y: start.y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    points,
    version: (element.version ?? 1) + 1,
    versionNonce: randomInteger(),
    updated: Date.now(),
  };
}

export async function autoLayoutCanvasElements(elements, options = {}) {
  const sourceElements = Array.isArray(elements) ? elements : [];
  const { units, unitIdByElementId } = collectLayoutUnits(sourceElements);
  const movableUnits = units.filter((unit) => !unit.locked);
  if (movableUnits.length < 2) return sourceElements;

  const graph = createElkGraph(sourceElements, units, unitIdByElementId, options);
  const result = await elk.layout(graph);
  const resultById = new Map((result.children ?? []).map((node) => [node.id, node]));
  if (!resultById.size) return sourceElements;

  const currentLeft = Math.min(...movableUnits.map((unit) => unit.x));
  const currentTop = Math.min(...movableUnits.map((unit) => unit.y));
  const currentRight = Math.max(...movableUnits.map((unit) => unit.x + unit.width));
  const currentBottom = Math.max(...movableUnits.map((unit) => unit.y + unit.height));
  const layoutLeft = Math.min(...movableUnits.map((unit) => Number(resultById.get(unit.id)?.x) || 0));
  const layoutTop = Math.min(...movableUnits.map((unit) => Number(resultById.get(unit.id)?.y) || 0));
  const layoutRight = Math.max(...movableUnits.map((unit) => (Number(resultById.get(unit.id)?.x) || 0) + unit.width));
  const layoutBottom = Math.max(...movableUnits.map((unit) => (Number(resultById.get(unit.id)?.y) || 0) + unit.height));
  const offsetX = (currentLeft + currentRight - layoutLeft - layoutRight) / 2;
  const offsetY = (currentTop + currentBottom - layoutTop - layoutBottom) / 2;
  const deltaByUnitId = new Map();
  for (const unit of movableUnits) {
    const node = resultById.get(unit.id);
    if (!node) continue;
    deltaByUnitId.set(unit.id, {
      x: (Number(node.x) || 0) + offsetX - unit.x,
      y: (Number(node.y) || 0) + offsetY - unit.y,
    });
  }

  const nextElements = sourceElements.map((element) => {
    if (!element || element.isDeleted || element.type === "arrow") return element;
    const delta = deltaByUnitId.get(unitIdByElementId.get(element.id));
    if (!delta || (!delta.x && !delta.y)) return element;
    return {
      ...element,
      x: (Number(element.x) || 0) + delta.x,
      y: (Number(element.y) || 0) + delta.y,
      version: (element.version ?? 1) + 1,
      versionNonce: randomInteger(),
      updated: Date.now(),
    };
  });
  const movedNodeIds = new Set(nextElements.filter((element, index) => element !== sourceElements[index]).map((element) => element.id));
  const nodeById = new Map(nextElements.filter((element) => element && !element.isDeleted && element.type !== "arrow").map((element) => [element.id, element]));
  return nextElements.map((element) => updateBoundArrowGeometry(element, nodeById, movedNodeIds));
}
