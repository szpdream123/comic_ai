import { canvasVersionFingerprint } from "./canvas-version-history.js";

function hasLocalCanvasWork(state = {}) {
  return Boolean(state.pending || state.saveTimer || state.saveRetryTimer || state.saveInFlight);
}

export function canCheckCanvasRemoteUpdate(state = {}) {
  return state.active !== false
    && state.checking !== true
    && state.online !== false
    && state.visibilityState !== "hidden"
    && !hasLocalCanvasWork(state);
}

export function canAdoptCanvasRemoteUpdate(state = {}, update = null) {
  return state.active !== false
    && Boolean(update?.content)
    && state.visibilityState !== "hidden"
    && !hasLocalCanvasWork(state);
}

export function mergeCanvasRemoteAppState(current = {}, remote = {}) {
  return {
    ...current,
    viewBackgroundColor: remote.viewBackgroundColor ?? current.viewBackgroundColor,
    gridModeEnabled: remote.gridModeEnabled ?? current.gridModeEnabled,
    theme: remote.theme ?? current.theme,
  };
}

export function isCanvasRemoteEcho(content, expectedFingerprint) {
  return Boolean(expectedFingerprint && canvasVersionFingerprint(content) === expectedFingerprint);
}

export function classifyCanvasRemoteChange(content, expectedFingerprint, applyInProgress = false) {
  const echo = isCanvasRemoteEcho(content, expectedFingerprint);
  return { echo, suppress: applyInProgress || echo };
}
