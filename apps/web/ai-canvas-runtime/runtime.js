import "./assets/main-upstream-236be2f0.js";

const runtime = globalThis.__COMIC_AI_CANVAS_RUNTIME__;

if (!runtime) {
  throw new Error("ai_canvas_runtime_bridge_unavailable");
}

export function mountAiCanvasRuntime(surface, context = {}) {
  const previousBridge = globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__;
  const bridge = {
    open: context.onDirectorDeskOpen,
    syncFrame: context.onDirectorDeskSyncFrame,
    exportVideo: context.onDirectorDeskExportVideo,
  };
  globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__ = bridge;
  return Promise.resolve().then(() => runtime.mountAiCanvasRuntime(surface, context)).then((handle) => ({
    ...handle,
    async dispose() {
      if (globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__ === bridge) {
        globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__ = previousBridge;
      }
      return handle?.dispose?.();
    },
  }), (error) => {
    if (globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__ === bridge) {
      globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__ = previousBridge;
    }
    throw error;
  });
}
export const useAppStore = runtime.useAppStore;
