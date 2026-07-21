function randomInteger() {
  return Math.floor(Math.random() * 2_000_000_000);
}

function touch(element, updates) {
  return {
    ...element,
    ...updates,
    version: (element.version ?? 1) + 1,
    versionNonce: randomInteger(),
    updated: Date.now(),
  };
}

function selectedSet(ids) {
  return ids instanceof Set ? ids : new Set(Array.isArray(ids) ? ids : []);
}

export function renameCanvasLayer(elements, id, title) {
  const normalized = String(title ?? "").trim().slice(0, 200);
  if (!normalized) return elements;
  return elements.map((element) => element.id === id
    ? touch(element, { customData: { ...element.customData, title: normalized } })
    : element);
}

export function renameCanvasLayerGroup(elements, groupId, title) {
  const normalizedId = String(groupId ?? "").trim();
  const normalized = String(title ?? "").trim().slice(0, 200);
  if (!normalizedId || !normalized) return elements;
  return elements.map((element) => {
    if (!element.groupIds?.includes(normalizedId)) return element;
    return touch(element, {
      customData: {
        ...element.customData,
        loomicGroupNames: {
          ...(element.customData?.loomicGroupNames ?? {}),
          [normalizedId]: normalized,
        },
      },
    });
  });
}

export function moveCanvasLayer(elements, id, direction) {
  const next = [...elements];
  const index = next.findIndex((element) => element.id === id);
  if (index < 0) return elements;
  const target = direction === "forward" ? index + 1 : index - 1;
  if (target < 0 || target >= next.length) return elements;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function moveCanvasLayers(elements, ids, direction) {
  const selected = selectedSet(ids);
  if (!selected.size) return elements;
  const next = [...elements];
  if (direction === "forward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selected.has(next[index]?.id) && !selected.has(next[index + 1]?.id)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      if (selected.has(next[index]?.id) && !selected.has(next[index - 1]?.id)) {
        [next[index], next[index - 1]] = [next[index - 1], next[index]];
      }
    }
  }
  return next;
}

function startsWithGroupPath(groupIds, prefix) {
  return prefix.every((groupId, index) => groupIds[index] === groupId);
}

/**
 * Moves a layer or a whole group as one z-order block and reparents it in the
 * Excalidraw group tree. `forward` means visually above the target.
 */
export function dropCanvasLayers(elements, ids, {
  sourceParentGroupIds = [],
  targetIds = [],
  targetParentGroupIds = [],
  position = "forward",
} = {}) {
  const movingIds = selectedSet(ids);
  const targets = selectedSet(targetIds);
  const sourcePath = Array.isArray(sourceParentGroupIds) ? sourceParentGroupIds.filter(Boolean) : [];
  const targetPath = Array.isArray(targetParentGroupIds) ? targetParentGroupIds.filter(Boolean) : [];
  if (!movingIds.size || [...targets].some((id) => movingIds.has(id))) return elements;

  const moving = elements.filter((element) => movingIds.has(element.id));
  if (!moving.length) return elements;
  const relativePaths = moving.map((element) => {
    const groupIds = Array.isArray(element.groupIds) ? element.groupIds.filter(Boolean) : [];
    return startsWithGroupPath(groupIds, sourcePath) ? groupIds.slice(sourcePath.length) : [];
  });
  const movedGroupIds = new Set(relativePaths.flat());
  if (targetPath.some((groupId) => movedGroupIds.has(groupId))) return elements;

  const knownGroupNames = new Map();
  for (const element of elements) {
    for (const [groupId, name] of Object.entries(element.customData?.loomicGroupNames ?? {})) {
      if (!knownGroupNames.has(groupId) && String(name ?? "").trim()) knownGroupNames.set(groupId, String(name).trim());
    }
  }

  const reparented = new Map(moving.map((element, index) => {
    const groupIds = [...targetPath, ...relativePaths[index]];
    const current = Array.isArray(element.groupIds) ? element.groupIds.filter(Boolean) : [];
    const unchanged = current.length === groupIds.length && current.every((groupId, pathIndex) => groupId === groupIds[pathIndex]);
    if (unchanged) return [element.id, element];
    const currentNames = element.customData?.loomicGroupNames ?? {};
    const loomicGroupNames = Object.fromEntries(groupIds.flatMap((groupId) => {
      const name = currentNames[groupId] ?? knownGroupNames.get(groupId);
      return String(name ?? "").trim() ? [[groupId, String(name).trim()]] : [];
    }));
    return [element.id, touch(element, {
      groupIds,
      customData: {
        ...element.customData,
        loomicGroupNames: Object.keys(loomicGroupNames).length ? loomicGroupNames : undefined,
      },
    })];
  }));
  const block = elements.filter((element) => movingIds.has(element.id)).map((element) => reparented.get(element.id));
  const remaining = elements.filter((element) => !movingIds.has(element.id));
  const targetIndexes = remaining.flatMap((element, index) => targets.has(element.id) ? [index] : []);
  let insertionIndex;
  if (!targetIndexes.length) insertionIndex = position === "backward" ? 0 : remaining.length;
  else insertionIndex = position === "backward" ? Math.min(...targetIndexes) : Math.max(...targetIndexes) + 1;
  return [...remaining.slice(0, insertionIndex), ...block, ...remaining.slice(insertionIndex)];
}

export function setCanvasLayersLocked(elements, ids, locked) {
  const selected = selectedSet(ids);
  return elements.map((element) => selected.has(element.id)
    ? touch(element, { locked: Boolean(locked) })
    : element);
}

export function setCanvasLayersVisible(elements, ids, visible) {
  const selected = selectedSet(ids);
  const hiddenNodeIds = new Set(elements.flatMap((element) => {
    if (!element || element.isDeleted || element.type === "arrow") return [];
    const hidden = selected.has(element.id) ? !visible : element.customData?.loomicHidden === true;
    return hidden ? [element.id] : [];
  }));
  return elements.map((element) => {
    const sourceId = element?.startBinding?.elementId;
    const targetId = element?.endBinding?.elementId;
    const hiddenByNode = element?.type === "arrow" && (hiddenNodeIds.has(sourceId) || hiddenNodeIds.has(targetId));
    const restoringNodeArrow = element?.type === "arrow" && element.customData?.loomicHiddenByNode === true && !hiddenByNode;
    const directlySelected = selected.has(element.id);
    if (!directlySelected && !hiddenByNode && !restoringNodeArrow) return element;
    const nextVisible = hiddenByNode ? false : visible;
    const hidden = element.customData?.loomicHidden === true;
    if (nextVisible && !hidden) return element;
    if (!nextVisible && hidden) return element;
    return touch(element, {
      opacity: nextVisible ? (element.customData?.loomicOpacity ?? 100) : 0,
      customData: {
        ...element.customData,
        loomicHidden: !nextVisible,
        loomicOpacity: nextVisible ? undefined : element.customData?.loomicOpacity ?? element.opacity,
        ...(element.type === "arrow" ? { loomicHiddenByNode: hiddenByNode || undefined } : {}),
      },
    });
  });
}

export function deleteCanvasLayers(elements, ids) {
  const selected = selectedSet(ids);
  const deletedArrowIds = new Set(elements.flatMap((element) => {
    if (!element || element.isDeleted || element.type !== "arrow") return [];
    const sourceId = element.startBinding?.elementId;
    const targetId = element.endBinding?.elementId;
    return selected.has(element.id) || selected.has(sourceId) || selected.has(targetId) ? [element.id] : [];
  }));
  return elements.map((element) => {
    if (selected.has(element.id) || deletedArrowIds.has(element.id)) return touch(element, { isDeleted: true });
    const boundElements = Array.isArray(element.boundElements) ? element.boundElements : null;
    if (!boundElements?.some((binding) => deletedArrowIds.has(binding?.id))) return element;
    return touch(element, { boundElements: boundElements.filter((binding) => !deletedArrowIds.has(binding?.id)) });
  });
}

export function groupCanvasLayers(elements, ids, groupId) {
  const selected = selectedSet(ids);
  if (selected.size < 2 || !groupId) return elements;
  return elements.map((element) => {
    if (!selected.has(element.id)) return element;
    const groupIds = Array.isArray(element.groupIds) ? element.groupIds : [];
    if (groupIds.includes(groupId)) return element;
    return touch(element, { groupIds: [...groupIds, groupId] });
  });
}

export function ungroupCanvasLayers(elements, ids) {
  const selected = selectedSet(ids);
  return elements.map((element) => {
    if (!selected.has(element.id) || !element.groupIds?.length) return element;
    const groupIds = element.groupIds.slice(0, -1);
    const loomicGroupNames = Object.fromEntries(groupIds.flatMap((groupId) => {
      const name = element.customData?.loomicGroupNames?.[groupId];
      return String(name ?? "").trim() ? [[groupId, name]] : [];
    }));
    return touch(element, {
      groupIds,
      customData: {
        ...element.customData,
        loomicGroupNames: Object.keys(loomicGroupNames).length ? loomicGroupNames : undefined,
      },
    });
  });
}
