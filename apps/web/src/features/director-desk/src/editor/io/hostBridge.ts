import { applyDirectorDeskTheme } from "../theme/themeRoot";

interface HostPanoramaPayload {
  edgeId?: unknown;
  sourceNodeId?: unknown;
  imageUrl?: unknown;
  fileName?: unknown;
}

interface HostSessionPayload {
  instanceId?: unknown;
  theme?: unknown;
}

export interface HostCaptureItemPayload {
  dataUrl?: unknown;
  fileName?: unknown;
}

export interface HostCaptureBatchPayload {
  captures?: HostCaptureItemPayload[];
}

export type DirectorDeskCaptureHandler = (
  captures: Array<{ dataUrl: string; fileName: string }>,
) => void | Promise<void>;
export type DirectorDeskVideoHandler = (file: File) => void | Promise<void>;

let initialized = false;
let captureHandler: DirectorDeskCaptureHandler | null = null;
let videoHandler: DirectorDeskVideoHandler | null = null;
export const DIRECTOR_DESK_SESSION_OPENED_EVENT = "storyai:director-desk-session-opened";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const HOST_ORIGIN_QUERY_KEY = "hostOrigin";

function normalizeOrigin(value: unknown) {
  const text = normalizeString(value);
  if (!text) return null;

  try {
    return new URL(text).origin;
  } catch {
    return null;
  }
}

export function getDirectorDeskHostOrigin() {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeOrigin(params.get(HOST_ORIGIN_QUERY_KEY)) ?? window.location.origin;
  } catch {
    return window.location.origin;
  }
}

function isAllowedHostEvent(event: MessageEvent) {
  return event.origin === getDirectorDeskHostOrigin();
}

function normalizeTheme(value: unknown): "dark" | "light" | null {
  return value === "light" || value === "dark" ? value : null;
}

function getInitialHostTheme() {
  try {
    return normalizeTheme(new URLSearchParams(window.location.search).get("theme"));
  } catch {
    return null;
  }
}

function importHostPanorama(_payload: HostPanoramaPayload) {
  // 全景图功能已关闭；保留旧消息入口，避免旧宿主发送时抛错。
}

function openHostSession(payload: HostSessionPayload) {
  const instanceId = normalizeString(payload.instanceId);
  const theme = normalizeTheme(payload.theme);
  if (theme) {
    applyDirectorDeskTheme(theme);
  }
  if (instanceId) {
    window.dispatchEvent(new CustomEvent(DIRECTOR_DESK_SESSION_OPENED_EVENT, { detail: { instanceId } }));
  }
}

export function postDirectorDeskCapturesToHost(
  captures: Array<{
    dataUrl: string;
    fileName?: string;
  }>
) {
  const normalizedCaptures = captures
    .map((capture, index) => {
      const dataUrl = normalizeString(capture.dataUrl);
      if (!dataUrl) {
        return null;
      }

      return {
        dataUrl,
        fileName: normalizeString(capture.fileName) || `director-desk-capture-${index + 1}.png`,
      };
    })
    .filter((capture): capture is { dataUrl: string; fileName: string } => Boolean(capture));

  if (normalizedCaptures.length === 0) {
    return;
  }

  if (captureHandler) {
    try {
      void Promise.resolve(captureHandler(normalizedCaptures)).catch((error) => {
        console.error("[director-desk] host capture handler failed", error);
      });
    } catch (error) {
      console.error("[director-desk] host capture handler failed", error);
    }
    return;
  }

  window.parent?.postMessage(
    {
      type: "storyai:director-desk-captures-sent",
      payload: {
        captures: normalizedCaptures,
      },
    },
    getDirectorDeskHostOrigin()
  );
}

export function setDirectorDeskCaptureHandler(handler?: DirectorDeskCaptureHandler | null) {
  captureHandler = handler ?? null;
}

export function clearDirectorDeskCaptureHandler(handler?: DirectorDeskCaptureHandler | null) {
  if (!handler || captureHandler === handler) {
    captureHandler = null;
  }
}

export async function postDirectorDeskVideoToHost(blob: Blob, fileName: string) {
  const handler = videoHandler;
  if (!handler || !blob || blob.size <= 0) return false;
  const file = new File([blob], fileName || "director-desk-reference-video.webm", {
    type: blob.type || "video/webm",
  });
  try {
    await handler(file);
  } catch (error) {
    console.error("[director-desk] host video handler failed", error);
    throw error;
  }
  return true;
}

export function setDirectorDeskVideoHandler(handler?: DirectorDeskVideoHandler | null) {
  videoHandler = handler ?? null;
}

export function clearDirectorDeskVideoHandler(handler?: DirectorDeskVideoHandler | null) {
  if (!handler || videoHandler === handler) videoHandler = null;
}

function handleHostMessage(event: MessageEvent) {
  if (!isAllowedHostEvent(event)) {
    return;
  }

  if (event.data?.type === "storyai:director-desk-session") {
    openHostSession((event.data.payload || {}) as HostSessionPayload);
    return;
  }

  if (event.data?.type === "storyai:director-desk-panorama") {
    importHostPanorama((event.data.payload || {}) as HostPanoramaPayload);
  }
}

export function initDirectorDeskHostBridge(initialTheme?: "dark" | "light") {
  if (initialized) {
    return;
  }

  initialized = true;
  applyDirectorDeskTheme(initialTheme ?? getInitialHostTheme() ?? "dark");
  window.addEventListener("message", handleHostMessage);
}

export function clearDirectorDeskHostBridge() {
  if (!initialized) {
    return;
  }

  initialized = false;
  window.removeEventListener("message", handleHostMessage);
}
