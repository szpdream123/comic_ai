const MODEL_ID = "onnx-community/depth-anything-v2-small";
const MODEL_LOCAL_PATH = "/models/";
const MODEL_CACHE_KEY = "transformers-cache";
const MODEL_FILES = [
  { path: `${MODEL_LOCAL_PATH}${MODEL_ID}/config.json`, size: 38 },
  { path: `${MODEL_LOCAL_PATH}${MODEL_ID}/preprocessor_config.json`, size: 461 },
  { path: `${MODEL_LOCAL_PATH}${MODEL_ID}/onnx/model_quantized.onnx`, size: 27_258_801 },
];
const MODEL_TOTAL_BYTES = MODEL_FILES.reduce((total, file) => total + file.size, 0);
const RESOLUTION_MAX_EDGE = {
  "480p": 854,
  "720p": 1280,
  "1080p": 1920,
  "2k": 2560,
};
const FRAME_RATES = new Set([6, 8, 12, 24]);
const DEPTH_COLORS = new Set(["grayscale", "inverse", "spectral", "heatmap"]);
const MODEL_PROGRESS_MAX = 18;
const UNSUPPORTED_MESSAGE = "当前电脑浏览器不支持本地处理，请升级或更换浏览器";
const MODEL_INDEXED_DB_NAME = "comic-ai-depth-model";
const MODEL_INDEXED_DB_STORE = "resources";

const estimatorPromises = new Map();

export async function checkBrowserWebGpuDepth() {
  const backend = await resolveInferenceBackend();
  const storage = await getModelStorage();
  if (!backend || !storage || !supportsLocalVideoEncoding()) {
    return {
      ready: false,
      error: UNSUPPORTED_MESSAGE,
    };
  }
  return {
    ready: true,
    installed: await isBrowserWebGpuDepthInstalled(),
    backend,
    device: backend === "webgpu" ? "浏览器 WebGPU" : "浏览器 WASM",
  };
}

export async function isBrowserWebGpuDepthInstalled() {
  const storage = await getModelStorage();
  if (!storage) return false;
  try {
    const resources = await Promise.all(MODEL_FILES.map((file) => storage.match(file.path)));
    return resources.every(Boolean);
  } catch {
    return false;
  }
}

export async function installBrowserWebGpuDepth({ onProgress } = {}) {
  const support = await checkBrowserWebGpuDepth();
  if (!support.ready) throw new Error(support.error);
  const storage = await getModelStorage();
  if (!storage) throw new Error(UNSUPPORTED_MESSAGE);
  let completedBytes = 0;
  try {
    for (const file of MODEL_FILES) {
      const response = await globalThis.fetch(file.path, { cache: "no-store" });
      if (!response.ok) throw new Error(`深度插件资源加载失败（${response.status}）。`);
      const buffer = await readResponseBuffer(response, (loaded) => {
        onProgress?.({
          progress: Math.round(((completedBytes + Math.min(loaded, file.size)) / MODEL_TOTAL_BYTES) * 100),
          message: "正在安装深度插件",
        });
      });
      const headers = new Headers(response.headers);
      headers.set("content-length", String(buffer.byteLength));
      await storage.put(file.path, new Response(buffer, { status: 200, headers }));
      completedBytes += buffer.byteLength;
    }
  } catch (error) {
    await Promise.all(MODEL_FILES.map((file) => storage.delete(file.path)));
    throw error;
  }
  onProgress?.({ progress: 100, message: "深度插件安装完成" });
  return { installed: true, device: support.device };
}

export async function uninstallBrowserWebGpuDepth() {
  const pendingEstimators = [...estimatorPromises.values()];
  estimatorPromises.clear();
  await Promise.all(pendingEstimators.map(async (pendingEstimator) => {
    try {
      const estimator = await pendingEstimator;
      await estimator?.dispose?.();
    } catch {
      // A failed model initialization has no resources left to dispose.
    }
  }));
  await Promise.all([deleteCacheStorageResources(), deleteIndexedDbResources()]);
  return { installed: false };
}

export async function runBrowserWebGpuDepth(file, options = {}) {
  const {
    resolution,
    frameRate,
    encoding,
    depthColor,
    onProgress,
  } = options;
  const support = await checkBrowserWebGpuDepth();
  if (!support.ready) throw new Error(support.error);
  if (!support.installed) throw new Error("请先安装本地深度插件。");
  if (!(file instanceof Blob)) throw new Error("未找到可处理的视频文件。");
  onProgress?.({ progress: 0, message: "正在准备本机处理" });
  const sourceUrl = globalThis.URL.createObjectURL(file);
  const video = globalThis.document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;
  try {
    await waitForEvent(video, "loadeddata", "无法读取所选视频。");
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error("所选视频没有可读取的画面。");
    }
    const backend = await resolveRuntimeInferenceBackend(support.backend, onProgress);
    const settings = resolveProcessingSettings({ resolution, frameRate, encoding, depthColor, backend });
    if (settings.isDegraded) {
      onProgress?.({ progress: 0, message: "当前设备将使用 480p / 6 FPS 处理" });
    }
    const { width, height } = constrainVideoSize(video.videoWidth, video.videoHeight, settings.maxEdge);
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法创建视频处理画布。");

    const { encodeVideoDepthFrames } = await import("./browser-video-depth-encoder.bundle.js");
    const output = await encodeVideoDepthFrames({
      canvas,
      durationSeconds: video.duration,
      fps: settings.frameRate,
      encoding: settings.encoding,
      renderFrame: (frame) => drawDepthFrame(video, canvas, context, frame, settings.depthColor, backend, onProgress),
    });
    return {
      file: output.file,
      fileName: `${baseName(file.name || "video")}-depth${output.fileExtension || ".webm"}`,
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    globalThis.URL.revokeObjectURL(sourceUrl);
  }
}

async function drawDepthFrame(video, canvas, context, frame, depthColor, backend, onProgress) {
  const estimator = await getEstimator(backend, onProgress);
  await seekVideo(video, Math.min(Math.max(0, video.duration - 0.001), frame.timestamp));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const output = await estimator(canvas);
  const depth = output?.depth;
  if (!depth?.data || !depth.width || !depth.height) throw new Error("深度模型未返回有效画面。");
  const image = context.createImageData(depth.width, depth.height);
  for (let pixel = 0; pixel < depth.width * depth.height; pixel += 1) {
    const [red, green, blue] = mapDepthColor(depth.data[pixel * (depth.channels || 1)], depthColor);
    const offset = pixel * 4;
    image.data[offset] = red;
    image.data[offset + 1] = green;
    image.data[offset + 2] = blue;
    image.data[offset + 3] = 255;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.putImageData(image, 0, 0);
  onProgress?.({
    progress: Math.min(99, MODEL_PROGRESS_MAX + Math.round(((frame.index + 1) / frame.frameCount) * (99 - MODEL_PROGRESS_MAX))),
    message: `本机正在处理 ${frame.index + 1}/${frame.frameCount} 帧`,
  });
}

async function getEstimator(backend, onProgress) {
  if (!estimatorPromises.has(backend)) {
    onProgress?.({ progress: 1, message: "正在加载本机深度模型" });
    const estimatorPromise = import("/vendor/transformers.webgpu.bundle.js")
      .then(({ env, pipeline }) => {
        env.allowLocalModels = true;
        env.allowRemoteModels = false;
        env.useBrowserCache = true;
        env.localModelPath = MODEL_LOCAL_PATH;
        env.backends.onnx.wasm.wasmPaths = "/vendor/";
        return pipeline("depth-estimation", MODEL_ID, {
          device: backend,
          dtype: "q8",
        });
      })
      .then((estimator) => {
        onProgress?.({ progress: MODEL_PROGRESS_MAX, message: "本机深度模型已加载" });
        return estimator;
      })
      .catch((error) => {
        estimatorPromises.delete(backend);
        if (String(error?.message ?? error).includes("Failed to fetch")) {
          throw new Error("深度模型加载失败，请刷新页面后重试。");
        }
        throw error;
      });
    estimatorPromises.set(backend, estimatorPromise);
  }
  return estimatorPromises.get(backend);
}

async function resolveRuntimeInferenceBackend(preferredBackend, onProgress) {
  try {
    await getEstimator(preferredBackend, onProgress);
    return preferredBackend;
  } catch (error) {
    if (preferredBackend !== "webgpu") throw error;
    try {
      onProgress?.({ progress: 1, message: "正在切换至本机兼容处理" });
      await getEstimator("wasm", onProgress);
      return "wasm";
    } catch {
      throw error;
    }
  }
}

async function readResponseBuffer(response, onProgress) {
  if (!response.body?.getReader) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded);
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

function constrainVideoSize(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}

export function resolveProcessingSettings({ resolution, frameRate, encoding, depthColor, backend } = {}) {
  const selectedResolution = Object.hasOwn(RESOLUTION_MAX_EDGE, resolution) ? resolution : "720p";
  const isDegraded = shouldUseConservativeSettings(backend);
  return {
    maxEdge: isDegraded ? RESOLUTION_MAX_EDGE["480p"] : RESOLUTION_MAX_EDGE[selectedResolution],
    frameRate: isDegraded ? 6 : FRAME_RATES.has(Number(frameRate)) ? Number(frameRate) : 8,
    encoding: ["auto", "vp9", "av1", "vp8"].includes(encoding) ? encoding : "auto",
    depthColor: DEPTH_COLORS.has(depthColor) ? depthColor : "grayscale",
    isDegraded,
  };
}

async function resolveInferenceBackend() {
  if (globalThis.isSecureContext !== false && globalThis.navigator?.gpu) {
    try {
      if (await globalThis.navigator.gpu.requestAdapter()) return "webgpu";
    } catch {
      // Continue with the WASM fallback when GPU initialization is unavailable.
    }
  }
  return globalThis.WebAssembly && typeof globalThis.fetch === "function" ? "wasm" : null;
}

function supportsLocalVideoEncoding() {
  return typeof globalThis.VideoEncoder === "function" && typeof globalThis.VideoFrame === "function";
}

function shouldUseConservativeSettings(backend) {
  const navigator = globalThis.navigator ?? {};
  return backend === "wasm"
    || navigator.userAgentData?.mobile === true
    || Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4
    || Number(navigator.hardwareConcurrency) > 0 && Number(navigator.hardwareConcurrency) <= 4;
}

async function getModelStorage() {
  if (globalThis.caches?.open) {
    try {
      const cache = await globalThis.caches.open(MODEL_CACHE_KEY);
      return { match: (path) => cache.match(path), put: (path, response) => cache.put(path, response), delete: (path) => cache.delete(path) };
    } catch {
      // IndexedDB keeps the model available when Cache Storage is disabled by the browser.
    }
  }
  return getIndexedDbStorage();
}

async function getIndexedDbStorage() {
  if (!globalThis.indexedDB) return null;
  try {
    const database = await openModelDatabase();
    return {
      async match(path) {
        const entry = await readIndexedDbValue(database, path);
        return entry ? new Response(entry.body, { status: 200, headers: entry.headers }) : undefined;
      },
      async put(path, response) {
        await writeIndexedDbValue(database, path, { body: await response.arrayBuffer(), headers: [...response.headers.entries()] });
      },
      delete: (path) => deleteIndexedDbValue(database, path),
    };
  } catch {
    return null;
  }
}

function openModelDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(MODEL_INDEXED_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(MODEL_INDEXED_DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readIndexedDbValue(database, key) {
  return runIndexedDbRequest(database, "readonly", (store) => store.get(key));
}

function writeIndexedDbValue(database, key, value) {
  return runIndexedDbRequest(database, "readwrite", (store) => store.put(value, key));
}

function deleteIndexedDbValue(database, key) {
  return runIndexedDbRequest(database, "readwrite", (store) => store.delete(key));
}

function runIndexedDbRequest(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const request = operation(database.transaction(MODEL_INDEXED_DB_STORE, mode).objectStore(MODEL_INDEXED_DB_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteCacheStorageResources() {
  if (!globalThis.caches?.open) return;
  try {
    const cache = await globalThis.caches.open(MODEL_CACHE_KEY);
    await Promise.all(MODEL_FILES.map((file) => cache.delete(file.path)));
  } catch {
    // The IndexedDB cleanup still runs when Cache Storage is unavailable.
  }
}

async function deleteIndexedDbResources() {
  const storage = await getIndexedDbStorage();
  if (!storage) return;
  await Promise.all(MODEL_FILES.map((file) => storage.delete(file.path)));
}

export function mapDepthColor(intensity, color = "grayscale") {
  const value = Math.max(0, Math.min(255, Math.round(Number(intensity) || 0)));
  if (color === "inverse") return [255 - value, 255 - value, 255 - value];
  if (color === "spectral") return interpolateDepthColor(value, [[0, 23, 28, 70], [64, 0, 118, 190], [128, 0, 205, 172], [192, 244, 214, 36], [255, 247, 73, 64]]);
  if (color === "heatmap") return interpolateDepthColor(value, [[0, 14, 23, 87], [64, 14, 100, 181], [128, 0, 191, 136], [192, 255, 207, 63], [255, 220, 54, 47]]);
  return [value, value, value];
}

function interpolateDepthColor(value, stops) {
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const next = stops[index];
    if (value <= next[0]) {
      const amount = (value - previous[0]) / (next[0] - previous[0]);
      return [1, 2, 3].map((channel) => Math.round(previous[channel] + ((next[channel] - previous[channel]) * amount)));
    }
  }
  return stops.at(-1).slice(1);
}

function waitForEvent(target, type, errorMessage) {
  return new Promise((resolve, reject) => {
    target.addEventListener(type, resolve, { once: true });
    target.addEventListener("error", () => reject(new Error(errorMessage)), { once: true });
  });
}

function seekVideo(video, time) {
  if (video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.001) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const handleSeeked = () => {
      video.removeEventListener("error", handleError);
      resolve();
    };
    const handleError = () => {
      video.removeEventListener("seeked", handleSeeked);
      reject(new Error("视频帧读取失败。"));
    };
    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = time;
  });
}

function baseName(fileName) {
  return String(fileName).replace(/\.[^.]+$/, "") || "video";
}
