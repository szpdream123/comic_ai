import { generateCanvasId } from "./canvas-elements.js";
import { createCanvasWorkflowConnection } from "./canvas-ports.js";

export const CANVAS_CLIPBOARD_TYPE = "excalidraw/clipboard";

function selectedSet(selectedIds) {
  if (selectedIds instanceof Set) return new Set(selectedIds);
  if (Array.isArray(selectedIds)) return new Set(selectedIds);
  return new Set(Object.entries(selectedIds ?? {}).filter(([, selected]) => selected).map(([id]) => id));
}

function boundElementId(binding) {
  return String(binding?.elementId ?? binding?.element_id ?? "").trim();
}

function remapBinding(binding, idMap) {
  if (!binding) return binding;
  const oldId = boundElementId(binding);
  const nextId = idMap.get(oldId);
  if (!nextId) return null;
  return Object.prototype.hasOwnProperty.call(binding, "element_id")
    ? { ...binding, element_id: nextId }
    : { ...binding, elementId: nextId };
}

function expandSelectedNodes(elements, initialIds) {
  const liveNodes = elements.filter((element) => element && !element.isDeleted && element.type !== "arrow");
  const nodeById = new Map(liveNodes.map((element) => [element.id, element]));
  const selected = new Set([...initialIds].filter((id) => nodeById.has(id)));
  let changed = true;
  while (changed) {
    changed = false;
    const selectedGroupIds = new Set();
    for (const id of selected) {
      for (const groupId of nodeById.get(id)?.groupIds ?? []) selectedGroupIds.add(groupId);
    }
    for (const element of liveNodes) {
      const sharesSelectedGroup = (element.groupIds ?? []).some((groupId) => selectedGroupIds.has(groupId));
      const selectedElement = selected.has(element.id);
      const selectedParent = (element.containerId && selected.has(element.containerId)) || (element.frameId && selected.has(element.frameId));
      const parentOfSelected = [...selected].some((id) => {
        const child = nodeById.get(id);
        return child?.containerId === element.id;
      });
      if (!selectedElement && (sharesSelectedGroup || selectedParent || parentOfSelected)) {
        selected.add(element.id);
        changed = true;
      }
    }
  }
  return selected;
}

function sanitizeSelectionElements(elements, nodeIds, includeInternalEdges = true) {
  const internalArrows = includeInternalEdges ? elements.filter((element) => {
    if (!element || element.isDeleted || element.type !== "arrow") return false;
    return nodeIds.has(boundElementId(element.startBinding)) && nodeIds.has(boundElementId(element.endBinding));
  }) : [];
  const includedIds = new Set([...nodeIds, ...internalArrows.map((arrow) => arrow.id)]);
  const internalArrowIdsByNode = new Map();
  for (const arrow of internalArrows) {
    for (const nodeId of [boundElementId(arrow.startBinding), boundElementId(arrow.endBinding)]) {
      if (!internalArrowIdsByNode.has(nodeId)) internalArrowIdsByNode.set(nodeId, []);
      internalArrowIdsByNode.get(nodeId).push(arrow.id);
    }
  }
  return elements.filter((element) => includedIds.has(element?.id)).map((element) => {
    if (element.type === "arrow") return { ...element };
    const boundElements = (element.boundElements ?? []).filter((binding) => includedIds.has(binding?.id)).map((binding) => ({ ...binding }));
    for (const arrowId of internalArrowIdsByNode.get(element.id) ?? []) {
      if (!boundElements.some((binding) => binding.id === arrowId)) boundElements.push({ id: arrowId, type: "arrow" });
    }
    return {
      ...element,
      boundElements: boundElements.length ? boundElements : null,
      containerId: element.containerId && includedIds.has(element.containerId) ? element.containerId : null,
      frameId: element.frameId && includedIds.has(element.frameId) ? element.frameId : null,
    };
  });
}

export function createCanvasSelectionClipboard(elements, selectedIds, options = {}) {
  const sourceElements = Array.isArray(elements) ? elements : [];
  const nodeIds = expandSelectedNodes(sourceElements, selectedSet(selectedIds));
  return {
    type: CANVAS_CLIPBOARD_TYPE,
    elements: sanitizeSelectionElements(sourceElements, nodeIds, options.connectionPolicy !== "none"),
  };
}

export function cloneCanvasSelectionClipboard(clipboard, options = {}) {
  const sourceElements = Array.isArray(clipboard?.elements) ? clipboard.elements : [];
  if (!sourceElements.some((element) => element && !element.isDeleted && element.type !== "arrow")) {
    return { elements: [], selectedElementIds: {}, idMap: new Map() };
  }
  const idFactory = options.idFactory ?? generateCanvasId;
  const randomFactory = options.randomFactory ?? (() => Math.floor(Math.random() * 2_000_000_000));
  const offsetX = Number(options.offsetX ?? options.offset ?? 32) || 0;
  const offsetY = Number(options.offsetY ?? options.offset ?? 32) || 0;
  const idMap = new Map(sourceElements.map((element) => [element.id, idFactory()]));
  const groupIdMap = new Map();
  for (const element of sourceElements) {
    for (const groupId of element.groupIds ?? []) {
      if (!groupIdMap.has(groupId)) groupIdMap.set(groupId, idFactory());
    }
  }
  const selectedElementIds = {};
  const clones = sourceElements.map((element) => {
    const id = idMap.get(element.id);
    if (element.type !== "arrow" && !element.containerId) selectedElementIds[id] = true;
    const arrowBindings = element.type === "arrow" ? {
      startBinding: remapBinding(element.startBinding, idMap),
      endBinding: remapBinding(element.endBinding, idMap),
    } : {};
    const customData = element.type !== "arrow" && options.titleSuffix && element.customData?.title
      ? { ...element.customData, title: `${element.customData.title}${options.titleSuffix}`.slice(0, 200) }
      : element.customData;
    return {
      ...element,
      id,
      x: (Number(element.x) || 0) + offsetX,
      y: (Number(element.y) || 0) + offsetY,
      groupIds: (element.groupIds ?? []).map((groupId) => groupIdMap.get(groupId)),
      boundElements: element.boundElements?.map((binding) => ({ ...binding, id: idMap.get(binding.id) })).filter((binding) => binding.id) ?? null,
      containerId: element.containerId ? idMap.get(element.containerId) ?? null : null,
      frameId: element.frameId ? idMap.get(element.frameId) ?? null : null,
      customData,
      ...arrowBindings,
      index: null,
      version: 1,
      versionNonce: randomFactory(),
      seed: randomFactory(),
      updated: Date.now(),
    };
  });
  return { elements: clones, selectedElementIds, idMap };
}

export function duplicateCanvasSelection(elements, selectedIds, options = {}) {
  const connectionPolicy = options.connectionPolicy ?? "internal";
  const clipboard = createCanvasSelectionClipboard(elements, selectedIds, {
    connectionPolicy: connectionPolicy === "internal" ? "internal" : "none",
  });
  const cloned = cloneCanvasSelectionClipboard(clipboard, options);
  if (!cloned.elements.length) return { elements, clones: [], selectedElementIds: {}, idMap: cloned.idMap };
  let nextElements = [...elements, ...cloned.elements];
  if (connectionPolicy === "upstream") {
    const selectedNodeIds = new Set(clipboard.elements.filter((element) => element.type !== "arrow").map((element) => element.id));
    const incoming = elements.filter((element) => (
      element?.type === "arrow"
      && !element.isDeleted
      && selectedNodeIds.has(boundElementId(element.endBinding))
      && !selectedNodeIds.has(boundElementId(element.startBinding))
    ));
    for (const connection of incoming) {
      const targetId = cloned.idMap.get(boundElementId(connection.endBinding));
      const sourceId = boundElementId(connection.startBinding);
      if (!targetId || !sourceId) continue;
      const result = createCanvasWorkflowConnection(nextElements, sourceId, targetId, {
        arrowId: (options.idFactory ?? generateCanvasId)(),
        strokeColor: connection.strokeColor,
      });
      if (!result.ok) continue;
      const copiedArrow = {
        ...result.arrow,
        strokeWidth: connection.strokeWidth ?? result.arrow.strokeWidth,
        strokeStyle: connection.strokeStyle ?? result.arrow.strokeStyle,
        roughness: connection.roughness ?? result.arrow.roughness,
        opacity: connection.opacity ?? result.arrow.opacity,
        customData: { ...connection.customData, workflowEdge: true },
      };
      nextElements = result.elements.map((element) => element.id === copiedArrow.id ? copiedArrow : element);
    }
  }
  const originalIds = new Set(elements.map((element) => element?.id));
  return {
    elements: nextElements,
    clones: nextElements.filter((element) => !originalIds.has(element?.id)),
    selectedElementIds: cloned.selectedElementIds,
    idMap: cloned.idMap,
  };
}

export function groupCanvasSelection(elements, selectedIds, options = {}) {
  const sourceElements = Array.isArray(elements) ? elements : [];
  const nodeIds = expandSelectedNodes(sourceElements, selectedSet(selectedIds));
  if (nodeIds.size < 2) return { elements: sourceElements, groupId: "", groupedIds: [] };

  const groupedIds = new Set(nodeIds);
  for (const element of sourceElements) {
    if (!element || element.isDeleted || element.type !== "arrow") continue;
    if (nodeIds.has(boundElementId(element.startBinding)) && nodeIds.has(boundElementId(element.endBinding))) {
      groupedIds.add(element.id);
    }
  }

  const groupId = (options.idFactory ?? generateCanvasId)();
  const randomFactory = options.randomFactory ?? (() => Math.floor(Math.random() * 2_000_000_000));
  const now = options.now ?? Date.now();
  return {
    elements: sourceElements.map((element) => groupedIds.has(element?.id) ? {
      ...element,
      groupIds: [...(element.groupIds ?? []), groupId],
      version: (element.version ?? 1) + 1,
      versionNonce: randomFactory(),
      updated: now,
    } : element),
    groupId,
    groupedIds: [...groupedIds],
  };
}

export function serializeCanvasSelectionClipboard(clipboard, files = {}) {
  const selectedFiles = {};
  for (const element of clipboard?.elements ?? []) {
    if (element.fileId && files[element.fileId]) selectedFiles[element.fileId] = files[element.fileId];
  }
  return JSON.stringify({
    type: CANVAS_CLIPBOARD_TYPE,
    elements: clipboard?.elements ?? [],
    files: selectedFiles,
  });
}
