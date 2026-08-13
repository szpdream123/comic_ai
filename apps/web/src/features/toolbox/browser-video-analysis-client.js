const REQUIRED_FRAME_RATE = 6;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const FRAME_MAX_EDGE = 1920;
const INSTALL_CACHE_KEY = "comic-ai-browser-video-analysis-v3";
const INSTALL_DB_NAME = "comic-ai-browser-video-analysis";
const INSTALL_DB_STORE = "resources";
const INSTALL_VERSION = "browser-6-stable-tracks";
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

export async function installBrowserVideoAnalysis({ onProgress, verifyRuntime = true, signal } = {}) {
  throwIfAborted(signal);
  const support = await checkBrowserVideoAnalysis();
  throwIfAborted(signal);
  if (!support.ready) throw new Error(support.error);
  const storage = await getInstallStorage();
  if (!storage) throw new Error(UNSUPPORTED_MESSAGE);
  const resources = await decoderResourceUrls();
  onProgress?.({ progress: 0, message: "正在安装浏览器视频解析插件" });
  try {
    for (let index = 0; index < resources.length; index += 1) {
      const resource = resources[index];
      throwIfAborted(signal);
      const response = await globalThis.fetch(resource, { cache: "no-store", signal });
      if (!response.ok) throw new Error(`视频解析插件资源加载失败（${response.status}）`);
      const buffer = await readResponseBuffer(response, (loaded, total) => {
        const resourceProgress = total ? loaded / total : 0;
        const progress = ((index + resourceProgress) / resources.length) * 92;
        onProgress?.({ progress: Math.min(92, Math.round(progress)), message: "正在安装浏览器视频解析插件" });
      }, signal);
      throwIfAborted(signal);
      const headers = new Headers(response.headers);
      headers.set("content-length", String(buffer.byteLength));
      await storage.put(resource, new Response(buffer, { status: 200, headers }));
    }
    if (verifyRuntime) await verifyInstalledWasmRuntime(storage, signal);
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
  throwIfAborted(options.signal);
  const support = await checkBrowserVideoAnalysis();
  throwIfAborted(options.signal);
  if (!support.ready) throw new Error(support.error);
  if (!support.installed) throw new Error("请先安装浏览器视频解析插件");
  validateVideoFile(file);

  const frameUrls = [];
  try {
    options.onProgress?.({ progress: 0, stage: "probing", message: "正在读取本机视频" });
    throwIfAborted(options.signal);
    const jobId = createBrowserJobId();
    let decoded;
    if (supportsNativeVideoDecoder()) {
      try {
        const nativeDecoder = await loadInstalledDecoder("native", options.signal);
        decoded = await decodeWithNativeDecoder(nativeDecoder, file, options, frameUrls);
      } catch (nativeError) {
        throwIfAborted(options.signal);
        releaseFrameUrls(frameUrls);
        const wasmDecoder = await loadInstalledDecoder("wasm", options.signal);
        decoded = await decodeWithWasmDecoder(wasmDecoder, file, options, frameUrls);
        if (!decoded) throw nativeError;
      }
    } else {
      const wasmDecoder = await loadInstalledDecoder("wasm", options.signal);
      decoded = await decodeWithWasmDecoder(wasmDecoder, file, options, frameUrls);
    }
    throwIfAborted(options.signal);
    const timelineFrames = Array.isArray(decoded.timelineFrames) ? decoded.timelineFrames : [];
    if (!timelineFrames.length) throw new Error("浏览器没有生成完整的 6 FPS 时间轴");
    const poseAnalysis = await analyzeDecodedPoseTimeline(timelineFrames, {
      durationMs: decoded.sourceDurationMs ?? Math.round(decoded.durationSeconds * 1000),
      signal: options.signal,
      onProgress(progress) {
        options.onProgress?.({
          progress: 70 + Math.round((Number(progress?.progress ?? 0) / 100) * 29),
          stage: "tracking_people",
          message: "本机正在识别人物站位和动作",
        });
      },
    });
    throwIfAborted(options.signal);
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
      poseAnalysis,
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
  throwIfAborted(options.signal);
  const signatureCanvas = globalThis.document.createElement("canvas");
  signatureCanvas.width = 32;
  signatureCanvas.height = 18;
  const signatureContext = signatureCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!signatureContext) throw new Error(UNSUPPORTED_MESSAGE);
  const timelineFrames = [];
  const decoded = await decoder.decodeBrowserVideoTimeline(file, {
    frameRate: options.frameRate,
    maxEdge: Number(options.maxEdge) || FRAME_MAX_EDGE,
    signal: options.signal,
    async onFrame(frame) {
      throwIfAborted(options.signal);
      const blob = await canvasToJpegBlob(frame.canvas);
      throwIfAborted(options.signal);
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
      throwIfAborted(options.signal);
      options.onProgress?.({
        progress: Math.min(70, Math.round((progress.index / progress.frameCount) * 70)),
        stage: "extracting_frames",
        message: `本机正在解析 ${progress.index}/${progress.frameCount} 帧`,
      });
    },
  });
  throwIfAborted(options.signal);
  return { ...decoded, timelineFrames };
}

async function decodeWithWasmDecoder(decoder, file, options, frameUrls) {
  throwIfAborted(options.signal);
  const runtime = await createCachedWasmRuntimeUrls(options.signal);
  try {
    const decoded = await decoder.decodeBrowserVideoTimelineWithWasm(file, {
      ...runtime,
      maxEdge: Number(options.maxEdge) || FRAME_MAX_EDGE,
      signal: options.signal,
      onProgress(progress) {
        throwIfAborted(options.signal);
        options.onProgress?.({
          ...progress,
          progress: Math.min(70, Math.round((Number(progress?.progress ?? 0) / 100) * 70)),
        });
      },
    });
    throwIfAborted(options.signal);
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
    || typeof globalThis.createImageBitmap !== "function"
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

function resolvePoseRuntimeBundleUrl() {
  return resolveVersionedDecoderResourceUrl("./browser-video-pose-runtime.bundle.js");
}

function resolvePoseWasmLoaderUrl() {
  return resolveVersionedWebResourceUrl("../../../vendor/pose-landmarker/vision_wasm_nosimd_internal.js");
}

function resolvePoseWasmBinaryUrl() {
  return resolveVersionedWebResourceUrl("../../../vendor/pose-landmarker/vision_wasm_nosimd_internal.wasm");
}

function resolvePoseModelUrl() {
  return resolveVersionedWebResourceUrl("../../../vendor/pose-landmarker/pose_landmarker_lite.task");
}

function resolveVersionedDecoderResourceUrl(path) {
  const url = new URL(path, import.meta.url);
  url.searchParams.set("v", INSTALL_VERSION);
  return url.href;
}

function resolveVersionedWebResourceUrl(path) {
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
    resolvePoseRuntimeBundleUrl(),
    resolvePoseWasmLoaderUrl(),
    resolvePoseWasmBinaryUrl(),
    resolvePoseModelUrl(),
  ];
}

async function loadInstalledDecoder(mode = "native", signal) {
  throwIfAborted(signal);
  const storage = await getInstallStorage();
  const resource = mode === "wasm"
    ? resolveWasmDecoderBundleUrl()
    : mode === "pose"
      ? resolvePoseRuntimeBundleUrl()
      : resolveDecoderBundleUrl();
  const response = await storage?.match(resource);
  if (!response) throw new Error("请先安装浏览器视频解析插件");
  const blob = await response.blob();
  throwIfAborted(signal);
  const moduleUrl = globalThis.URL.createObjectURL(blob);
  try {
    const decoder = await import(moduleUrl);
    throwIfAborted(signal);
    return decoder;
  } finally {
    globalThis.URL.revokeObjectURL(moduleUrl);
  }
}

async function analyzeDecodedPoseTimeline(timelineFrames, options) {
  throwIfAborted(options.signal);
  const storage = await getInstallStorage();
  const poseRuntime = await loadInstalledDecoder("pose", options.signal);
  const [loaderResponse, binaryResponse, modelResponse] = await Promise.all([
    storage?.match(resolvePoseWasmLoaderUrl()),
    storage?.match(resolvePoseWasmBinaryUrl()),
    storage?.match(resolvePoseModelUrl()),
  ]);
  if (!loaderResponse || !binaryResponse || !modelResponse) {
    throw new Error("本机人物姿态模型未安装，请重新加载解析器");
  }
  const wasmLoaderPath = globalThis.URL.createObjectURL(await loaderResponse.blob());
  const wasmBinaryPath = globalThis.URL.createObjectURL(await binaryResponse.blob());
  try {
    return await poseRuntime.analyzeBrowserPoseTimeline(timelineFrames, {
      ...options,
      wasmLoaderPath,
      wasmBinaryPath,
      modelAssetBuffer: new Uint8Array(await modelResponse.arrayBuffer()),
    });
  } finally {
    globalThis.URL.revokeObjectURL(wasmLoaderPath);
    globalThis.URL.revokeObjectURL(wasmBinaryPath);
  }
}

async function createCachedWasmRuntimeUrls(signal) {
  throwIfAborted(signal);
  const storage = await getInstallStorage();
  const entries = await Promise.all([
    ["workerURL", resolveWasmWorkerUrl()],
    ["coreURL", resolveWasmCoreUrl()],
    ["wasmURL", resolveWasmBinaryUrl()],
  ].map(async ([key, resource]) => {
    throwIfAborted(signal);
    const response = await storage?.match(resource);
    if (!response) throw new Error("浏览器 WASM 解码器资源未安装，请重新安装插件");
    const blob = await response.blob();
    throwIfAborted(signal);
    return [key, globalThis.URL.createObjectURL(blob)];
  }));
  const urls = Object.fromEntries(entries);
  return {
    ...urls,
    revoke() {
      Object.values(urls).forEach((url) => globalThis.URL.revokeObjectURL(url));
    },
  };
}

async function verifyInstalledWasmRuntime(storage, signal) {
  throwIfAborted(signal);
  const response = await storage?.match(resolveWasmDecoderBundleUrl());
  if (!response) throw new Error("浏览器 WASM 解码器资源未安装");
  const blob = await response.blob();
  throwIfAborted(signal);
  const moduleUrl = globalThis.URL.createObjectURL(blob);
  let runtime = null;
  try {
    const decoder = await import(moduleUrl);
    throwIfAborted(signal);
    runtime = await createCachedWasmRuntimeUrls(signal);
    await decoder.probeBrowserVideoWasmRuntime({ ...runtime, signal });
    throwIfAborted(signal);
  } finally {
    runtime?.revoke();
    globalThis.URL.revokeObjectURL(moduleUrl);
  }
}

async function readResponseBuffer(response, onProgress, signal) {
  throwIfAborted(signal);
  const total = Number(response.headers.get("content-length") ?? 0);
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    throwIfAborted(signal);
    onProgress?.(buffer.byteLength, total || buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    throwIfAborted(signal);
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

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  const error = new Error("视频分析已取消");
  error.name = "AbortError";
  throw error;
}

export const __browserVideoAnalysisTestUtils = {
  createBrowserSegments,
  loadInstalledDecoder,
  resolveDecoderBundleUrl,
  resolvePoseModelUrl,
  resolvePoseRuntimeBundleUrl,
  supportsBrowserVideoAnalysis,
};
