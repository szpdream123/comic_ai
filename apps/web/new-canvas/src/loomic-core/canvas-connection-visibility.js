const connectionVisibilityByApi = new WeakMap();

function stateFor(api) {
  if (!api || (typeof api !== "object" && typeof api !== "function")) return null;
  let state = connectionVisibilityByApi.get(api);
  if (!state) {
    state = { hidden: false, opacityById: new Map() };
    connectionVisibilityByApi.set(api, state);
  }
  return state;
}

function isLiveConnection(element) {
  return element?.type === "arrow" && !element.isDeleted;
}

export function areCanvasConnectionsVisible(api) {
  return stateFor(api)?.hidden !== true;
}

export function projectCanvasConnectionsForView(api, elements, options = {}) {
  const state = stateFor(api);
  const source = Array.isArray(elements) ? elements : [];
  if (!state?.hidden) return source;
  const rebase = options?.rebase === true;

  const liveIds = new Set();
  let changed = false;
  const projected = source.map((element) => {
    if (!isLiveConnection(element)) return element;
    liveIds.add(element.id);
    if (rebase || element.opacity !== 0 || !state.opacityById.has(element.id)) {
      state.opacityById.set(element.id, element.opacity ?? 100);
    }
    if (element.opacity === 0) return element;
    changed = true;
    return { ...element, opacity: 0 };
  });
  for (const id of state.opacityById.keys()) {
    if (!liveIds.has(id)) state.opacityById.delete(id);
  }
  return changed ? projected : source;
}

export function restoreCanvasConnectionsForPersistence(api, elements) {
  const state = stateFor(api);
  const source = Array.isArray(elements) ? elements : [];
  if (!state?.hidden) return source;
  let changed = false;
  const restored = source.map((element) => {
    if (
      !isLiveConnection(element)
      || element.customData?.loomicHidden === true
      || !state.opacityById.has(element.id)
    ) return element;
    const opacity = state.opacityById.get(element.id);
    if (element.opacity === opacity) return element;
    changed = true;
    return { ...element, opacity };
  });
  return changed ? restored : source;
}

export function syncCanvasConnectionVisibility(api, elements = api?.getSceneElements?.() ?? []) {
  const projected = projectCanvasConnectionsForView(api, elements);
  if (projected !== elements) api?.updateScene?.({ elements: projected, captureUpdate: "NONE" });
  return projected;
}

export function setCanvasConnectionsVisible(api, visible) {
  const state = stateFor(api);
  if (!state) return [];
  const nextVisible = Boolean(visible);
  const elements = api?.getSceneElements?.() ?? [];
  if (nextVisible) {
    if (!state.hidden) return elements;
    state.hidden = false;
    const restored = elements.map((element) => {
      if (
        !isLiveConnection(element)
        || element.customData?.loomicHidden === true
        || !state.opacityById.has(element.id)
      ) return element;
      const opacity = state.opacityById.get(element.id);
      return element.opacity === opacity ? element : { ...element, opacity };
    });
    state.opacityById.clear();
    if (restored.some((element, index) => element !== elements[index])) {
      api?.updateScene?.({ elements: restored, captureUpdate: "NONE" });
    }
    return restored;
  }

  if (state.hidden) return syncCanvasConnectionVisibility(api, elements);
  state.hidden = true;
  state.opacityById.clear();
  return syncCanvasConnectionVisibility(api, elements);
}
