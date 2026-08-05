const CHANNEL = "comic-ai-video-depth";
const PAGE_SOURCE = "comic-ai-video-depth-page";
const EXTENSION_SOURCE = "comic-ai-video-depth-extension";
const REQUEST_TYPE = "comic-ai-video-depth-request";
const RESPONSE_TYPE = "comic-ai-video-depth-response";
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

export function getVideoDepthExtensionStoreUrl() {
  return typeof globalThis.__COMIC_AI_VIDEO_DEPTH_EXTENSION_STORE_URL__ === "string"
    ? globalThis.__COMIC_AI_VIDEO_DEPTH_EXTENSION_STORE_URL__.trim()
    : "";
}

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requestExtension(type, payload = {}, options = {}) {
  if (typeof globalThis.window?.postMessage !== "function") {
    return Promise.reject(new Error("当前环境不支持浏览器插件通信。"));
  }
  const requestId = createRequestId();
  const timeoutMs = Number(options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      globalThis.window.removeEventListener("message", onMessage);
    };
    const onMessage = (event) => {
      if (event.source !== globalThis.window) return;
      const message = event.data;
      if (message?.source !== EXTENSION_SOURCE || message?.requestId !== requestId || message?.type !== RESPONSE_TYPE) {
        return;
      }
      cleanup();
      const responsePayload = message.payload ?? {};
      if (responsePayload.ok) {
        resolve(responsePayload.result ?? {});
        return;
      }
      reject(new Error(String(responsePayload.error?.message ?? "浏览器插件处理失败。")));
    };
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error("未检测到视频转深度浏览器插件。"));
    }, timeoutMs);
    globalThis.window.addEventListener("message", onMessage);
    globalThis.window.postMessage({
      channel: CHANNEL,
      source: PAGE_SOURCE,
      requestId,
      type: REQUEST_TYPE,
      payload: {
        protocol: "comic-ai-video-depth/v1",
        requestId,
        action: type,
        ...(payload ? { input: payload } : {}),
      },
    }, globalThis.location?.origin || "*");
  });
}

export async function checkVideoDepthExtension() {
  const response = await requestExtension("ping", {}, { timeoutMs: 1500 });
  return {
    ready: Boolean(response.ready),
    version: String(response.version ?? ""),
    webgpu: response.webgpu !== false,
  };
}

export async function runVideoDepthExtension(file) {
  if (!(file instanceof Blob)) throw new Error("请选择有效的视频文件。");
  if (file.size > MAX_INPUT_BYTES) throw new Error("浏览器扩展当前仅支持 25 MB 以内的视频。");
  const response = await requestExtension("process", {
    dataUrl: await readAsDataUrl(file),
    fileName: typeof file.name === "string" ? file.name : "video.mp4",
  }, { timeoutMs: 20 * 60 * 1000 });
  return {
    file: await dataUrlToBlob(response.dataUrl),
    fileName: String(response.fileName || "depth.webm"),
  };
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(new Error("无法读取视频文件。")), { once: true });
    reader.readAsDataURL(file);
  });
}

async function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("扩展未返回视频文件。");
  }
  return (await fetch(dataUrl)).blob();
}
