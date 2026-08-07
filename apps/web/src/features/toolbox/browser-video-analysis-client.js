const REQUIRED_FRAME_RATE = 6;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const FRAME_MAX_EDGE = 1920;
const INSTALL_CACHE_KEY = "comic-ai-browser-video-analysis-v3";
const INSTALL_DB_NAME = "comic-ai-browser-video-analysis";
const INSTALL_DB_STORE = "resources";
const INSTALL_VERSION = "browser-3-hd";
const UNSUPPORTED_MESSAGE = "当前电脑浏览器不支持本地视频解析，请升级或更换浏览器";
const SUPPORTED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export async function checkBrowserVideoAnalysis() {
  if (!supportsBrowserVideoAnalysis()) {
    return { ready: false, installed: false, error: UNSUPPORTED_MESSAGE };
  }
  const storage = await getInstallStorage();
  if (!storage) {
    return { ready: false, installed: false, error: UNSUPPORTED_MESSAGE };
  }
  return {
    ready: true,
    installed: await isBrowserVideoAnalysisInstalled(),
    plugin: "video-analysis",
    version: INSTALL_VERSION,
    frameRate: REQUIRED_FRAME_RATE,
    device: "浏览器本地解析",
  };
}

export async function isBrowserVideoAnalysisInstalled() {
  const storage = await getInstallStorage();
  if (!storage) return false;
  try {
    const installed = await Promise.all(
      (await decoderResourceUrls()).map(async (path) => Boolean(await storage.match(path))),
    );
    return installed.every(Boolean);
  } catch {
    return false;
  }
}

export async function installBrowserVideoAnalysis({ onProgress, verifyRuntime = true } = {}) {
  const support = await checkBrowserVideoAnalysis();
  if (!support.ready) throw new Error(support.error);
  const storage = await getInstallStorage();
  if (!storage) throw new Error(UNSUPPORTED_MESSAGE);
  const resources = await decoderResourceUrls();
  onProgress?.({ progress: 0, message: "正在安装浏览器视频解析插件" });
  try {
    for (let index = 0; index < resources.length; index += 1) {
      const resource = resources[index];
      const response = await globalThis.fetch(resource, { cache: "no-store" });
      if (!response.ok) throw new Error(`视频解析插件资源加载失败（${response.status}）`);
      const buffer = await readResponseBuffer(response, (loaded, total) => {
        const resourceProgress = total ? loaded / total : 0;
        const progress = ((index + resourceProgress) / resources.length) * 92;
        onProgress?.({ progress: Math.min(92, Math.round(progress)), message: "正在安装浏览器视频解析插件" });
      });
      const headers = new Headers(response.headers);
      headers.set("content-length", String(buffer.byteLength));
      await storage.put(resource, new Response(buffer, { status: 200, headers }));
    }
    if (verifyRuntime) await verifyInstalledWasmRuntime(storage);
  } catch (error) {
    await Promise.all(resources.map((resource) => storage.delete(resource).catch(() => undefined)));
    throw error;
  }
  onProgress?.({ progress: 100, message: "视频解析插件安装完成" });
  return { installed: true, mode: "browser", device: support.device };
}

export async function uninstallBrowserVideoAnalysis() {
  await Promise.all([deleteCacheInstallMarker(), deleteIndexedDbInstallMarker()]);
  return { installed: false, mode: "browser" };
}

export async function runBrowserVideoAnalysis(file, options = {}) {
  const support = await checkBrowserVideoAnalysis();
  if (!support.ready) throw new Error(support.error);
  if (!support.installed) throw new Error("请先安装浏览器视频解析插件");
  validateVideoFile(file);

  const frameUrls = [];
  try {
    options.onProgress?.({ progress: 0, stage: "probing", message: "正在读取本机视频" });
    const jobId = createBrowserJobId();
    let decoded;
    if (supportsNativeVideoDecoder()) {
      try {
        const nativeDecoder = await loadInstalledDecoder("native");
        decoded = await decodeWithNativeDecoder(nativeDecoder, file, options, frameUrls);
      } catch (nativeError) {
        releaseFrameUrls(frameUrls);
        const wasmDecoder = await loadInstalledDecoder("wasm");
        decoded = await decodeWithWasmDecoder(wasmDecoder, file, options, frameUrls);
        if (!decoded) throw nativeError;
      }
    } else {
      const wasmDecoder = await loadInstalledDecoder("wasm");
      decoded = await decodeWithWasmDecoder(wasmDecoder, file, options, frameUrls);
    }
    const timelineFrames = Array.isArray(decoded.timelineFrames) ? decoded.timelineFrames : [];
    if (!timelineFrames.length) throw new Error("浏览器没有生成完整的 6 FPS 时间轴");
    const signatures = [];

    const output = {
      version: 1,
      source: {
        fileName: String(file.name || "video"),
        contentType: String(file.type || decoded.contentType || ""),
        sizeBytes: file.size,
        durationMs: decoded.sourceDurationMs ?? Math.round(decoded.durationSeconds * 1000),
        width: decoded.sourceWidth,
        height: decoded.sourceHeight,
        frameRate: decoded.sourceFrameRate,
        videoCodec: decoded.videoCodec,
        audioCodec: decoded.audioCodec,
        bitRate: Math.round(decoded.averageBitrate || 0),
        hasAudio: decoded.hasAudio,
      },
      sampling: { frameRate: decoded.frameRate, frameCount: timelineFrames.length },
      artifacts: { normalizedVideo: "", audio: "" },
      timelineFrames,
      segments: createBrowserSegments(timelineFrames, signatures, decoded.durationSeconds),
      notes: [
        "All decoding and timeline extraction ran in this browser.",
        "The source video was not uploaded by the browser analysis plugin.",
      ],
    };
    options.onProgress?.({ progress: 100, stage: "completed", message: "本机视频解析完成" });
    return { jobId, output };
  } catch (error) {
    frameUrls.forEach((url) => globalThis.URL.revokeObjectURL(url));
    throw error;
  }
}

async function decodeWithNativeDecoder(decoder, file, options, frameUrls) {
  const signatureCanvas = globalThis.document.createElement("canvas");
  signatureCanvas.width = 32;
  signatureCanvas.height = 18;
  const signatureContext = signatureCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!signatureContext) throw new Error(UNSUPPORTED_MESSAGE);
  const timelineFrames = [];
  const decoded = await decoder.decodeBrowserVideoTimeline(file, {
    frameRate: options.frameRate,
    maxEdge: Number(options.maxEdge) || FRAME_MAX_EDGE,
    async onFrame(frame) {
      const blob = await canvasToJpegBlob(frame.canvas);
      const url = globalThis.URL.createObjectURL(blob);
      frameUrls.push(url);
      timelineFrames.push({
        index: frame.index,
        timestampMs: frame.timestampMs,
        fileName: `browser-timeline-${String(frame.index + 1).padStart(6, "0")}.jpg`,
        url,
      });
    },
    onProgress(progress) {
      options.onProgress?.({
        progress: Math.min(99, Math.round((progress.index / progress.frameCount) * 99)),
        stage: "extracting_frames",
        message: `本机正在解析 ${progress.index}/${progress.frameCount} 帧`,
      });
    },
  });
  return { ...decoded, timelineFrames };
}

async function decodeWithWasmDecoder(decoder, file, options, frameUrls) {
  const runtime = await createCachedWasmRuntimeUrls();
  try {
    const decoded = await decoder.decodeBrowserVideoTimelineWithWasm(file, {
      ...runtime,
      maxEdge: Number(options.maxEdge) || FRAME_MAX_EDGE,
      onProgress: options.onProgress,
    });
    for (const frame of decoded.timelineFrames ?? []) frameUrls.push(frame.url);
    return decoded;
  } finally {
    runtime.revoke();
  }
}

function releaseFrameUrls(frameUrls) {
  frameUrls.splice(0).forEach((url) => globalThis.URL.revokeObjectURL(url));
}

export function disposeBrowserVideoAnalysisResult(result) {
  const frames = Array.isArray(result?.output?.timelineFrames) ? result.output.timelineFrames : [];
  for (const frame of frames) {
    const url = String(frame?.url ?? "");
    if (url.startsWith("blob:")) globalThis.URL?.revokeObjectURL?.(url);
  }
}

function validateVideoFile(file) {
  if (!(file instanceof Blob) || file.size < 1) throw new Error("未找到可处理的视频文件");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("视频大小不能超过 500 MB");
  const fileName = String(file.name || "").toLowerCase();
  if (file.type && !SUPPORTED_VIDEO_TYPES.has(String(file.type).toLowerCase())) {
    throw new Error("仅支持 MP4、WEBM 或 MOV 视频");
  }
  if (!file.type && fileName && !/\.(?:mp4|webm|mov)$/.test(fileName)) {
    throw new Error("仅支持 MP4、WEBM 或 MOV 视频");
  }
}

function supportsBrowserVideoAnalysis() {
  if (
    typeof globalThis.document?.createElement !== "function"
    || typeof globalThis.URL?.createObjectURL !== "function"
    || typeof globalThis.URL?.revokeObjectURL !== "function"
    || typeof globalThis.Blob !== "function"
    || typeof globalThis.Response !== "function"
    || typeof globalThis.Worker !== "function"
    || typeof globalThis.WebAssembly !== "object"
    || typeof globalThis.fetch !== "function"
  ) return false;
  try {
    const canvas = globalThis.document.createElement("canvas");
    return typeof canvas?.getContext === "function"
      && Boolean(canvas.getContext("2d"))
      && typeof canvas.toBlob === "function";
  } catch {
    return false;
  }
}

function supportsNativeVideoDecoder() {
  return typeof globalThis.VideoDecoder === "function"
    && typeof globalThis.VideoFrame === "function";
}

function readFrameSignature(canvas, signatureCanvas, context) {
  context.drawImage(canvas, 0, 0, signatureCanvas.width, signatureCanvas.height);
  const pixels = context.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height).data;
  const buckets = new Array(12).fill(0);
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = Math.max(0, Math.min(255, Math.round(
      pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722,
    )));
    buckets[Math.min(buckets.length - 1, Math.floor(luminance / (256 / buckets.length)))] += 1;
  }
  const total = signatureCanvas.width * signatureCanvas.height;
  return buckets.map((count) => count / total);
}

function createBrowserSegments(frames, signatures, durationSeconds) {
  if (!frames.length) return [];
  const boundaries = [0];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = signatures[index - 1] || [];
    const current = signatures[index] || [];
    const difference = current.reduce((total, value, bucket) => total + Math.abs(value - Number(previous[bucket] || 0)), 0);
    const timestampMs = frames[index].timestampMs;
    if (difference >= 0.65 && timestampMs - boundaries.at(-1) >= 500) boundaries.push(timestampMs);
  }
  boundaries.push(Math.round(durationSeconds * 1000));
  return boundaries.slice(0, -1).map((startMs, index) => {
    const endMs = boundaries[index + 1];
    const midpoint = (startMs + endMs) / 2;
    const representative = frames.reduce((best, frame) => (
      Math.abs(frame.timestampMs - midpoint) < Math.abs(best.timestampMs - midpoint) ? frame : best
    ), frames[0]);
    return {
      index: index + 1,
      startMs,
      endMs,
      representativeFrame: representative.fileName,
    };
  });
}

function canvasToJpegBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("浏览器无法保存视频画面")),
      "image/jpeg",
      0.86,
    );
  });
}

function createBrowserJobId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `browser-${uuid || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

async function getInstallStorage() {
  if (globalThis.caches?.open) {
    try {
      const cache = await globalThis.caches.open(INSTALL_CACHE_KEY);
      return {
        match: (path) => cache.match(path),
        put: (path, response) => cache.put(path, response),
        delete: (path) => cache.delete(path),
      };
    } catch {
      // IndexedDB preserves the browser plugin state when Cache Storage is unavailable.
    }
  }
  return getIndexedDbStorage();
}

async function getIndexedDbStorage() {
  if (!globalThis.indexedDB) return null;
  try {
    const database = await openInstallDatabase();
    return {
      async match(path) {
        const entry = await runIndexedDbRequest(database, "readonly", (store) => store.get(path));
        return entry ? new Response(entry.body, { status: 200, headers: entry.headers }) : undefined;
      },
      async put(path, response) {
        const entry = { body: await response.arrayBuffer(), headers: [...response.headers.entries()] };
        await runIndexedDbRequest(database, "readwrite", (store) => store.put(entry, path));
      },
      delete: (path) => runIndexedDbRequest(database, "readwrite", (store) => store.delete(path)),
    };
  } catch {
    return null;
  }
}

function openInstallDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(INSTALL_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(INSTALL_DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runIndexedDbRequest(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const store = database.transaction(INSTALL_DB_STORE, mode).objectStore(INSTALL_DB_STORE);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteCacheInstallMarker() {
  if (!globalThis.caches?.open) return;
  try {
    const cache = await globalThis.caches.open(INSTALL_CACHE_KEY);
    await Promise.all((await decoderResourceUrls()).map((resource) => cache.delete(resource)));
  } catch {
    // IndexedDB cleanup still runs when Cache Storage is unavailable.
  }
}

async function deleteIndexedDbInstallMarker() {
  const storage = await getIndexedDbStorage();
  if (storage) await Promise.all((await decoderResourceUrls()).map((resource) => storage.delete(resource)));
}

function resolveDecoderBundleUrl() {
  return resolveVersionedDecoderResourceUrl("./browser-video-analysis-decoder.bundle.js");
}

function resolveWasmDecoderBundleUrl() {
  return resolveVersionedDecoderResourceUrl("./browser-video-analysis-wasm.bundle.js");
}

function resolveWasmWorkerUrl() {
  return resolveVersionedDecoderResourceUrl("./browser-video-analysis-ffmpeg-worker.js");
}

function resolveWasmCoreUrl() {
  return resolveVersionedDecoderResourceUrl("./browser-video-analysis-ffmpeg-core.js");
}

function resolveWasmBinaryUrl() {
  return resolveVersionedDecoderResourceUrl("./browser-video-analysis-ffmpeg-core.wasm");
}

function resolveVersionedDecoderResourceUrl(path) {
  const url = new URL(path, import.meta.url);
  url.searchParams.set("v", INSTALL_VERSION);
  return url.href;
}

function decoderResourceUrls() {
  return [
    resolveDecoderBundleUrl(),
    resolveWasmDecoderBundleUrl(),
    resolveWasmWorkerUrl(),
    resolveWasmCoreUrl(),
    resolveWasmBinaryUrl(),
  ];
}

async function loadInstalledDecoder(mode = "native") {
  const storage = await getInstallStorage();
  const resource = mode === "wasm" ? resolveWasmDecoderBundleUrl() : resolveDecoderBundleUrl();
  const response = await storage?.match(resource);
  if (!response) throw new Error("请先安装浏览器视频解析插件");
  const moduleUrl = globalThis.URL.createObjectURL(await response.blob());
  try {
    return await import(moduleUrl);
  } finally {
    globalThis.URL.revokeObjectURL(moduleUrl);
  }
}

async function createCachedWasmRuntimeUrls() {
  const storage = await getInstallStorage();
  const entries = await Promise.all([
    ["workerURL", resolveWasmWorkerUrl()],
    ["coreURL", resolveWasmCoreUrl()],
    ["wasmURL", resolveWasmBinaryUrl()],
  ].map(async ([key, resource]) => {
    const response = await storage?.match(resource);
    if (!response) throw new Error("浏览器 WASM 解码器资源未安装，请重新安装插件");
    return [key, globalThis.URL.createObjectURL(await response.blob())];
  }));
  const urls = Object.fromEntries(entries);
  return {
    ...urls,
    revoke() {
      Object.values(urls).forEach((url) => globalThis.URL.revokeObjectURL(url));
    },
  };
}

async function verifyInstalledWasmRuntime(storage) {
  const response = await storage?.match(resolveWasmDecoderBundleUrl());
  if (!response) throw new Error("浏览器 WASM 解码器资源未安装");
  const moduleUrl = globalThis.URL.createObjectURL(await response.blob());
  let runtime = null;
  try {
    const decoder = await import(moduleUrl);
    runtime = await createCachedWasmRuntimeUrls();
    await decoder.probeBrowserVideoWasmRuntime(runtime);
  } finally {
    runtime?.revoke();
    globalThis.URL.revokeObjectURL(moduleUrl);
  }
}

async function readResponseBuffer(response, onProgress) {
  const total = Number(response.headers.get("content-length") ?? 0);
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    onProgress?.(buffer.byteLength, total || buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

export const __browserVideoAnalysisTestUtils = {
  createBrowserSegments,
  loadInstalledDecoder,
  resolveDecoderBundleUrl,
  supportsBrowserVideoAnalysis,
};
