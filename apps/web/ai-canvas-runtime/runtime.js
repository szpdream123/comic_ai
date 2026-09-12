import "./assets/main-upstream-236be2f0.js";

const runtime = globalThis.__COMIC_AI_CANVAS_RUNTIME__;

if (!runtime) {
  throw new Error("ai_canvas_runtime_bridge_unavailable");
}

export function mountAiCanvasRuntime(surface, context = {}) {
  const previousBridge = globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__;
  const previousHostApi = globalThis.__COMIC_AI_CANVAS_HOST_API__;
  const previousCanvasProjectId = globalThis.__COMIC_AI_CANVAS_PROJECT_ID__;
  const bridge = {
    open: context.onDirectorDeskOpen,
    syncFrame: context.onDirectorDeskSyncFrame,
    exportVideo: context.onDirectorDeskExportVideo,
  };
  globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__ = bridge;
  globalThis.__COMIC_AI_CANVAS_HOST_API__ = context.api ?? context.creatorApi ?? previousHostApi;
  globalThis.__COMIC_AI_CANVAS_PROJECT_ID__ = context.canvasProjectId ?? context.projectId ?? previousCanvasProjectId;
  const restoreHostBridge = () => {
    if (globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__ === bridge) {
      globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__ = previousBridge;
    }
    if (globalThis.__COMIC_AI_CANVAS_HOST_API__ === (context.api ?? context.creatorApi)) {
      globalThis.__COMIC_AI_CANVAS_HOST_API__ = previousHostApi;
    }
    if (globalThis.__COMIC_AI_CANVAS_PROJECT_ID__ === (context.canvasProjectId ?? context.projectId)) {
      globalThis.__COMIC_AI_CANVAS_PROJECT_ID__ = previousCanvasProjectId;
    }
  };
  return Promise.resolve().then(() => runtime.mountAiCanvasRuntime(surface, context)).then((handle) => ({
    ...handle,
    async dispose() {
      restoreHostBridge();
      return handle?.dispose?.();
    },
  }), (error) => {
    restoreHostBridge();
    throw error;
  });
}
export const useAppStore = runtime.useAppStore;
