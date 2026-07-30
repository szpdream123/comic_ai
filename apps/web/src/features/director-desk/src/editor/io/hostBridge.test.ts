import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearDirectorDeskHostBridge,
  clearDirectorDeskCaptureHandler,
  clearDirectorDeskVideoHandler,
  DIRECTOR_DESK_SESSION_OPENED_EVENT,
  initDirectorDeskHostBridge,
  postDirectorDeskCapturesToHost,
  postDirectorDeskVideoToHost,
  setDirectorDeskCaptureHandler,
  setDirectorDeskVideoHandler,
} from "./hostBridge";
import { createInitialDirectorState, useDirectorStore } from "../store/directorStore";

function createMemoryStorage(): Storage {
  const storage = new Map<string, string>();

  return {
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: (key) => storage.get(key) ?? null,
    key: (index) => Array.from(storage.keys())[index] ?? null,
    removeItem: (key) => {
      storage.delete(key);
    },
    setItem: (key, value) => {
      storage.set(key, String(value));
    },
  };
}

beforeEach(async () => {
  vi.stubGlobal("localStorage", createMemoryStorage());
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.theme;
  await useDirectorStore.getState().openScopedScene(null);
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...createInitialDirectorState(),
  });
});

afterEach(async () => {
  await useDirectorStore.getState().openScopedScene(null);
  clearDirectorDeskHostBridge();
  clearDirectorDeskCaptureHandler();
  clearDirectorDeskVideoHandler();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("ignores host panorama messages because panorama import is disabled", () => {
  initDirectorDeskHostBridge();

  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "storyai:director-desk-panorama",
        payload: {
          edgeId: "edge-image-director",
          sourceNodeId: "node_image",
          imageUrl: "data:image/png;base64,panorama",
          fileName: "画布图片.png",
        },
      },
      origin: window.location.origin,
    })
  );

  const state = useDirectorStore.getState();
  expect(state.project.panoramaAssetId).toBeNull();
  expect(state.project.assets.some((asset) => asset.kind === "panorama")).toBe(false);
});

it("notifies the app when the host sends a card session without loading the scene directly", () => {
  const sessionOpened = vi.fn();
  const fetchScene = vi.fn();
  vi.stubGlobal("fetch", fetchScene);
  window.addEventListener(DIRECTOR_DESK_SESSION_OPENED_EVENT, sessionOpened);
  initDirectorDeskHostBridge();
  useDirectorStore.getState().updateScene({ backgroundColor: "#151515" });

  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "storyai:director-desk-session",
        payload: {
          instanceId: "node_director_a",
        },
      },
      origin: window.location.origin,
    })
  );

  expect(useDirectorStore.getState().project.scene.backgroundColor).toBe("#151515");
  expect(fetchScene).not.toHaveBeenCalled();
  expect(sessionOpened).toHaveBeenCalledTimes(1);
  expect((sessionOpened.mock.calls[0][0] as CustomEvent).detail).toEqual({ instanceId: "node_director_a" });
  window.removeEventListener(DIRECTOR_DESK_SESSION_OPENED_EVENT, sessionOpened);
});

it("applies the light theme sent by the host session to the director desk document", () => {
  document.documentElement.classList.add("dark");
  document.documentElement.dataset.theme = "dark";
  initDirectorDeskHostBridge();

  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "storyai:director-desk-session",
        payload: {
          instanceId: "node_director_light",
          theme: "light",
        },
      },
      origin: window.location.origin,
    })
  );

  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

it("applies the dark theme sent by the host session to the director desk document", () => {
  document.documentElement.dataset.theme = "light";
  initDirectorDeskHostBridge();

  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "storyai:director-desk-session",
        payload: {
          instanceId: "node_director_dark",
          theme: "dark",
        },
      },
      origin: window.location.origin,
    })
  );

  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

it("does not notify the host canvas when disabled panorama messages are ignored", () => {
  const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
  initDirectorDeskHostBridge();

  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "storyai:director-desk-session",
        payload: {
          instanceId: "node_director_a",
        },
      },
      origin: window.location.origin,
    })
  );
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "storyai:director-desk-panorama",
        payload: {
          edgeId: "edge-image-director-a",
          sourceNodeId: "node_image_a",
          imageUrl: "data:image/png;base64,panorama-a",
          fileName: "画布图片A.png",
        },
      },
      origin: window.location.origin,
    })
  );

  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "storyai:director-desk-session",
        payload: {
          instanceId: "node_director_b",
        },
      },
      origin: window.location.origin,
    })
  );

  expect(postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({
      type: "storyai:director-desk-panorama-removed",
    }),
    window.location.origin
  );
});

it("delivers captures to the in-process host callback without postMessage", () => {
  const captureHandler = vi.fn();
  const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
  setDirectorDeskCaptureHandler(captureHandler);

  postDirectorDeskCapturesToHost([{ dataUrl: "data:image/png;base64,YQ==", fileName: "shot.png" }]);

  expect(captureHandler).toHaveBeenCalledWith([
    { dataUrl: "data:image/png;base64,YQ==", fileName: "shot.png" },
  ]);
  expect(postMessage).not.toHaveBeenCalled();
});

it("waits for the Canvas host to finish importing a reference video", async () => {
  let finishImport: (() => void) | undefined;
  const importFinished = new Promise<void>((resolve) => {
    finishImport = resolve;
  });
  const videoHandler = vi.fn(() => importFinished);
  setDirectorDeskVideoHandler(videoHandler);

  let settled = false;
  const handoff = postDirectorDeskVideoToHost(
    new Blob(["video"], { type: "video/webm" }),
    "reference.webm",
  ).then((result) => {
    settled = true;
    return result;
  });

  await Promise.resolve();
  expect(settled).toBe(false);
  expect(videoHandler).toHaveBeenCalledWith(expect.objectContaining({
    name: "reference.webm",
    type: "video/webm",
  }));

  finishImport?.();
  await expect(handoff).resolves.toBe(true);
});

it("keeps standalone export available and propagates Canvas import failures", async () => {
  await expect(postDirectorDeskVideoToHost(
    new Blob(["video"], { type: "video/webm" }),
    "standalone.webm",
  )).resolves.toBe(false);

  const importError = new Error("canvas import failed");
  setDirectorDeskVideoHandler(() => Promise.reject(importError));
  await expect(postDirectorDeskVideoToHost(
    new Blob(["video"], { type: "video/webm" }),
    "canvas.webm",
  )).rejects.toBe(importError);
});
