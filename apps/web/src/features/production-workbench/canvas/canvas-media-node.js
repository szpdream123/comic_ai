export const CANVAS_AUDIO_WAVEFORM_COLUMNS = 220;

const MAX_WAVEFORM_COLUMNS = 4096;
const DEFAULT_WAVEFORM_HEIGHT = 80;
const MEDIA_READY_STATE_CURRENT_DATA = 2;

export function extractCanvasAudioWaveform(audioBuffer, options = {}) {
  const columns = boundedInteger(options.columns, CANVAS_AUDIO_WAVEFORM_COLUMNS, 1, MAX_WAVEFORM_COLUMNS);
  const channelData = resolveAudioChannelData(audioBuffer, options.channel ?? 0);
  const sampleCount = channelData?.length ?? 0;
  const peaks = Array.from({ length: columns }, (_, index) => {
    if (!sampleCount) return 0;
    const start = Math.floor(index * sampleCount / columns);
    const end = Math.min(sampleCount, Math.max(start + 1, Math.floor((index + 1) * sampleCount / columns)));
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(finiteNumber(channelData[sampleIndex], 0)));
    }
    return roundWaveformValue(clamp(peak, 0, 1));
  });
  return {
    peaks,
    duration: Math.max(0, finiteNumber(options.duration ?? audioBuffer?.duration, 0)),
    columns,
  };
}

export async function decodeCanvasAudioWaveform(audioUrl, options = {}) {
  const url = resolveCanvasMediaUrl(audioUrl, "audio");
  if (!url) throw new Error("音频地址无效");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("当前环境不支持加载音频");
  const response = await fetchImpl(url, { signal: options.signal });
  if (!response || (response.ok === false && response.status !== 0)) {
    throw new Error(`音频加载失败${Number.isFinite(response?.status) ? `：${response.status}` : ""}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const context = options.audioContext ?? createWaveformDecodeContext(options.globalObject ?? globalThis);
  if (!context || typeof context.decodeAudioData !== "function") {
    throw new Error("当前环境不支持音频解码");
  }
  const decoded = await context.decodeAudioData(arrayBuffer);
  return extractCanvasAudioWaveform(decoded, options);
}

export function calculateCanvasAudioSeekPosition(pointerX, bounds = {}, duration = 0) {
  const rect = typeof bounds?.getBoundingClientRect === "function" ? bounds.getBoundingClientRect() : bounds;
  const left = finiteNumber(rect?.left ?? rect?.x, 0);
  const width = finiteNumber(rect?.width, 0);
  const coordinate = finiteNumber(
    typeof pointerX === "object" ? pointerX?.clientX ?? pointerX?.x : pointerX,
    left,
  );
  const ratio = width > 0 ? clamp((coordinate - left) / width, 0, 1) : 0;
  const normalizedDuration = Math.max(0, finiteNumber(duration, 0));
  return {
    ratio: roundWaveformValue(ratio),
    time: roundMediaTime(ratio * normalizedDuration),
  };
}

export function calculateCanvasAudioSeekTime(pointerX, bounds = {}, duration = 0) {
  return calculateCanvasAudioSeekPosition(pointerX, bounds, duration).time;
}

export function formatCanvasMediaTime(seconds) {
  const value = Math.max(0, Math.floor(finiteNumber(seconds, 0)));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainingSeconds = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function drawCanvasAudioWaveform(canvas, waveform, options = {}) {
  const context = canvas?.getContext?.("2d");
  if (!context) return false;
  const peaks = Array.isArray(waveform?.peaks) || ArrayBuffer.isView(waveform?.peaks)
    ? Array.from(waveform.peaks)
    : [];
  const width = positiveNumber(canvas.width) ? Number(canvas.width) : Math.max(1, peaks.length);
  const height = positiveNumber(canvas.height) ? Number(canvas.height) : DEFAULT_WAVEFORM_HEIGHT;
  context.clearRect(0, 0, width, height);

  if (!peaks.length) {
    context.strokeStyle = options.emptyColor ?? "rgba(249, 115, 22, 0.25)";
    context.lineWidth = 0.5;
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    return true;
  }

  context.fillStyle = options.waveformColor ?? "#f97316";
  const columnWidth = width / peaks.length;
  const barWidth = Math.max(1, Math.min(columnWidth, finiteNumber(options.barWidth, 1)));
  for (let index = 0; index < peaks.length; index += 1) {
    const barHeight = Math.max(clamp(finiteNumber(peaks[index], 0), 0, 1) * height * 0.8, 0.5);
    context.fillRect(index * columnWidth, (height - barHeight) / 2, barWidth, barHeight);
  }

  const progress = Number(options.progress);
  if (Number.isFinite(progress) && progress >= 0) {
    const x = Math.round(clamp(progress, 0, 1) * width);
    context.strokeStyle = options.progressColor ?? "#e8e8ed";
    context.lineWidth = finiteNumber(options.progressWidth, 1.5);
    context.beginPath();
    context.moveTo(x, 4);
    context.lineTo(x, Math.max(4, height - 4));
    context.stroke();
  }
  return true;
}

export async function captureCanvasVideoFrame(video, options = {}) {
  if (!video || typeof video !== "object") throw new Error("没有可截取的视频");
  const width = Math.floor(finiteNumber(options.width ?? video.videoWidth, 0));
  const height = Math.floor(finiteNumber(options.height ?? video.videoHeight, 0));
  const readyState = finiteNumber(video.readyState, MEDIA_READY_STATE_CURRENT_DATA);
  if (readyState < MEDIA_READY_STATE_CURRENT_DATA || width <= 0 || height <= 0) {
    throw new Error("视频尚未加载到可截取的帧");
  }
  const canvasFactory = options.canvasFactory ?? defaultCanvasFactory;
  const canvas = canvasFactory();
  if (!canvas) throw new Error("无法创建截帧画布");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext?.("2d");
  if (!context) throw new Error("无法创建截帧画布");
  context.drawImage(video, 0, 0, width, height);
  const mimeType = String(options.mimeType ?? "image/png");
  const quality = Number(options.quality);
  const blob = await exportCanvasFrameBlob(canvas, mimeType, Number.isFinite(quality) ? clamp(quality, 0, 1) : undefined);
  return {
    blob,
    width,
    height,
    currentTime: roundMediaTime(Math.max(0, finiteNumber(video.currentTime, 0))),
  };
}

export function isCanvasVideoFrameSecurityError(error) {
  const name = String(error?.name ?? "").toLowerCase();
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return name === "securityerror"
    || message.includes("tainted canvas")
    || message.includes("tainted canvases")
    || message.includes("may not be exported")
    || message.includes("cross-origin");
}

export function normalizeCanvasVideoFullscreenState(node = {}, options = {}) {
  const data = nodeData(node);
  const url = resolveCanvasMediaNodeSource(node, "video", options);
  const poster = resolveCanvasMediaUrl(firstText(options.poster, data.thumbnailUrl, data.posterUrl), "image");
  const open = options.open === true || data.videoFullscreen === true || data.mediaFullscreen === true;
  return {
    open: open && Boolean(url),
    canOpen: Boolean(url),
    url,
    poster,
    label: firstText(options.label, data.title, data.label, data.fileName, "视频预览"),
  };
}

export function renderCanvasAudioNodeBody(node = {}, options = {}) {
  const data = nodeData(node);
  const nodeId = firstText(options.nodeId, node?.id, data.id);
  const audioUrl = resolveCanvasMediaNodeSource(node, "audio", options);
  const label = firstText(options.label, data.title, data.label, data.fileName, "音频");
  const duration = Math.max(0, finiteNumber(options.duration ?? data.duration ?? data.audioDuration, 0));
  const currentTime = clamp(finiteNumber(options.currentTime ?? data.currentTime, 0), 0, duration || Number.MAX_SAFE_INTEGER);
  const progress = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
  const playing = options.playing === true || data.audioPlaying === true;
  const status = String(options.status ?? data.status ?? (audioUrl ? "ready" : "empty")).toLowerCase();
  const loading = ["queued", "running", "processing", "loading", "uploading"].includes(status);
  const body = audioUrl
    ? `<div class="canvas-audio-waveform" data-action="seek-canvas-audio" data-node-id="${escapeAttr(nodeId)}" role="slider" tabindex="0" aria-label="${escapeAttr(`${label}播放位置`)}" aria-valuemin="0" aria-valuemax="${escapeAttr(duration)}" aria-valuenow="${escapeAttr(currentTime)}" style="--canvas-audio-progress:${roundWaveformValue(progress)}">
        <canvas data-canvas-audio-waveform width="${CANVAS_AUDIO_WAVEFORM_COLUMNS}" height="${DEFAULT_WAVEFORM_HEIGHT}" aria-hidden="true"></canvas>
        <audio data-canvas-audio-player src="${escapeAttr(audioUrl)}" preload="metadata"></audio>
        <button type="button" data-action="toggle-canvas-audio-play" data-node-id="${escapeAttr(nodeId)}" aria-label="${playing ? "暂停音频" : "播放音频"}" aria-pressed="${playing}"><span aria-hidden="true">${playing ? "Ⅱ" : "▶"}</span></button>
        <output data-canvas-audio-time aria-label="音频播放时间">${formatCanvasMediaTime(currentTime)} / ${duration > 0 ? formatCanvasMediaTime(duration) : "--:--"}</output>
      </div>`
    : `<div class="canvas-audio-empty${loading ? " is-loading" : ""}" role="status"><strong>${loading ? "正在准备音频" : "暂无音频"}</strong></div>`;
  return `<section class="canvas-audio-node-body${playing ? " is-playing" : ""}" data-canvas-audio-body data-node-id="${escapeAttr(nodeId)}" aria-label="${escapeAttr(label)}">${body}</section>`;
}

export function renderCanvasVideoNodeBody(node = {}, options = {}) {
  const data = nodeData(node);
  const nodeId = firstText(options.nodeId, node?.id, data.id);
  const fullscreen = normalizeCanvasVideoFullscreenState(node, options);
  const directUrl = resolveCanvasMediaUrl(resolveCanvasMediaDirectUrl(node, "video", options), "video");
  const playing = options.playing === true || data.videoPlaying === true;
  const status = String(options.status ?? data.status ?? (fullscreen.url ? "ready" : "empty")).toLowerCase();
  const loading = ["queued", "running", "processing", "loading", "uploading"].includes(status);
  const preview = fullscreen.url
    ? `<div class="canvas-video-preview" data-canvas-video-preview>
        <video data-canvas-video-player draggable="false" src="${escapeAttr(fullscreen.url)}"${directUrl && directUrl !== fullscreen.url ? ` data-canvas-video-fallback-src="${escapeAttr(directUrl)}"` : ""}${fullscreen.poster ? ` poster="${escapeAttr(fullscreen.poster)}"` : ""} playsinline preload="metadata" tabindex="-1" aria-label="${escapeAttr(fullscreen.label)}"></video>
        <div class="canvas-video-actions" role="toolbar" aria-label="视频工具">
          <button type="button" data-action="toggle-canvas-video-play" data-node-id="${escapeAttr(nodeId)}" aria-label="${playing ? "暂停视频" : "播放视频"}" title="${playing ? "暂停视频" : "播放视频"}" aria-pressed="${playing}"><span aria-hidden="true">${playing ? "Ⅱ" : "▶"}</span></button>
          <button type="button" data-action="capture-canvas-video-frame" data-node-id="${escapeAttr(nodeId)}" aria-label="截取当前帧" title="截取当前帧"><span aria-hidden="true">▣</span></button>
          <button type="button" data-action="toggle-canvas-video-fullscreen" data-node-id="${escapeAttr(nodeId)}" aria-label="全屏查看" title="全屏查看" aria-pressed="${fullscreen.open}"><span aria-hidden="true">↗</span></button>
        </div>
      </div>`
    : `<div class="canvas-video-empty${loading ? " is-loading" : ""}" role="status"><strong>${loading ? "正在准备视频" : "暂无视频"}</strong></div>`;
  return `<section class="canvas-video-node-body" data-canvas-video-body data-node-id="${escapeAttr(nodeId)}" aria-label="${escapeAttr(fullscreen.label)}">${preview}</section>`;
}

export function renderCanvasVideoFullscreen(node = {}, options = {}) {
  const state = normalizeCanvasVideoFullscreenState(node, options);
  if (!state.open) return "";
  const nodeId = firstText(options.nodeId, node?.id, nodeData(node).id);
  return `<div class="canvas-video-fullscreen" data-canvas-video-fullscreen data-node-id="${escapeAttr(nodeId)}" role="dialog" aria-modal="true" aria-label="${escapeAttr(state.label)}">
    <button class="canvas-video-fullscreen-backdrop" type="button" data-action="close-canvas-video-fullscreen" data-node-id="${escapeAttr(nodeId)}" aria-label="关闭全屏预览"></button>
    <div class="canvas-video-fullscreen-content">
      <video data-canvas-video-fullscreen-player src="${escapeAttr(state.url)}"${state.poster ? ` poster="${escapeAttr(state.poster)}"` : ""} controls playsinline autoplay preload="metadata" aria-label="${escapeAttr(state.label)}"></video>
      <div class="canvas-video-fullscreen-tools" role="toolbar" aria-label="视频全屏工具">
        <button type="button" data-action="request-canvas-video-native-fullscreen" data-node-id="${escapeAttr(nodeId)}" aria-label="进入系统全屏" title="进入系统全屏">⛶</button>
        <button class="canvas-video-fullscreen-close" type="button" data-action="close-canvas-video-fullscreen" data-node-id="${escapeAttr(nodeId)}" aria-label="关闭全屏预览" title="关闭全屏预览">×</button>
      </div>
    </div>
  </div>`;
}

export function renderCanvasMediaNodeBody(node = {}, options = {}) {
  const type = String(node?.type ?? nodeData(node).type ?? "").toLowerCase();
  const mediaKind = String(nodeData(node).mediaKind ?? "").toLowerCase();
  return type.includes("audio") || mediaKind === "audio"
    ? renderCanvasAudioNodeBody(node, options)
    : type.includes("video") || mediaKind === "video"
      ? renderCanvasVideoNodeBody(node, options)
      : "";
}

export function resolveCanvasMediaUrl(value, mediaKind = "") {
  const url = String(value ?? "").trim();
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return "";
  if (/^data:/i.test(url)) {
    return "";
  }
  try {
    const parsed = new URL(url, "https://canvas.local/");
    return ["http:", "https:", "blob:"].includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

export function resolveCanvasMediaNodeSource(node = {}, mediaKind = "", options = {}) {
  const data = nodeData(node);
  const assets = Array.isArray(options.assets) ? options.assets : [];
  const identity = resolveCanvasMediaStableIdentity(data, assets);
  if (identity.storageObjectId) {
    return `/api/storage/objects/${encodeURIComponent(identity.storageObjectId)}/content?proxy=1`;
  }
  const directUrl = resolveCanvasMediaDirectUrl(node, mediaKind, options);
  return resolveCanvasMediaUrl(directUrl, mediaKind);
}

export function resolveCanvasMediaDirectUrl(node = {}, mediaKind = "", options = {}) {
  const data = nodeData(node);
  return mediaKind === "audio"
    ? firstText(options.url, data.audioUrl, data.resultAudioUrl, data.resultUrl, data.url, data.assetUrl, data.downloadUrl, data.sourceUrl, data.previewUrl)
    : mediaKind === "video"
      ? firstText(options.url, data.videoUrl, data.resultVideoUrl, data.resultUrl, data.url, data.assetUrl, data.downloadUrl, data.sourceUrl, data.previewUrl)
      : firstText(options.url, data.imageUrl, data.resultUrl, data.url, data.assetUrl, data.thumbnailUrl, data.previewUrl);
}

export function resolveCanvasMediaStableIdentity(data = {}, assets = []) {
  const assetVersionId = firstText(
    data.assetVersionId,
    data.asset_version_id,
    data.versionId,
    data.asset?.assetVersionId,
    data.asset?.latestVersion?.assetVersionId,
    data.asset?.latestVersion?.id,
    data.latestVersion?.assetVersionId,
    data.latestVersion?.id,
  );
  const directStorageObjectId = firstText(
    data.storageObjectId,
    data.storage_object_id,
    data.asset?.storageObjectId,
    data.asset?.latestVersion?.storageObjectId,
    data.latestVersion?.storageObjectId,
  );
  const matchingAsset = assetVersionId
    ? assets.find((asset) => [
        asset?.assetVersionId,
        asset?.asset_version_id,
        asset?.versionId,
        asset?.latestVersion?.assetVersionId,
        asset?.latestVersion?.id,
        asset?.id,
      ].some((value) => String(value ?? "").trim() === assetVersionId))
    : null;
  return {
    assetVersionId,
    storageObjectId: directStorageObjectId || firstText(
      matchingAsset?.storageObjectId,
      matchingAsset?.storage_object_id,
      matchingAsset?.latestVersion?.storageObjectId,
    ),
  };
}

export function resolveCanvasMediaArtifactPatch(task = null) {
  const result = task?.result ?? {};
  const candidates = [
    ...(Array.isArray(task?.resultAssets) ? task.resultAssets : []),
    ...(Array.isArray(task?.generatedOutputItems) ? task.generatedOutputItems : []),
    ...(Array.isArray(result?.generatedOutputItems) ? result.generatedOutputItems : []),
    ...(Array.isArray(task?.assets) ? task.assets : []),
  ];
  const primary = candidates[0] ?? {};
  const assetVersionId = firstText(result.assetVersionId, primary.assetVersionId, primary.versionId);
  const storageObjectId = firstText(result.storageObjectId, primary.storageObjectId);
  return {
    ...(assetVersionId ? { assetVersionId } : {}),
    ...(storageObjectId ? { storageObjectId } : {}),
  };
}

export function reconcileCanvasMediaDocumentSources(document = {}, assets = []) {
  let changed = false;
  const nodes = (Array.isArray(document?.nodes) ? document.nodes : []).map((node) => {
    const kind = canvasNodeMediaKind(node);
    if (kind !== "audio" && kind !== "video") return node;
    const identity = resolveCanvasMediaStableIdentity(nodeData(node), assets);
    if (!identity.storageObjectId || String(node?.data?.storageObjectId ?? "").trim() === identity.storageObjectId) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...(node.data ?? {}),
        storageObjectId: identity.storageObjectId,
        ...(identity.assetVersionId ? { assetVersionId: identity.assetVersionId } : {}),
      },
    };
  });
  return { changed, document: changed ? { ...document, nodes } : document };
}

export function resolveCanvasMediaActionBody(target, options = {}) {
  const mediaKind = options.mediaKind === "audio" ? "audio" : "video";
  const selector = mediaKind === "audio" ? "[data-canvas-audio-body]" : "[data-canvas-video-body]";
  const nodeId = firstText(options.nodeId, target?.dataset?.nodeId);
  const direct = target?.closest?.(selector);
  if (direct && (!nodeId || String(direct.dataset?.nodeId ?? "") === nodeId)) return direct;
  const roots = [target?.getRootNode?.(), options.root, options.root?.shadowRoot]
    .filter((root, index, list) => root?.querySelectorAll && list.indexOf(root) === index);
  for (const root of roots) {
    const bodies = [...root.querySelectorAll(selector)];
    const match = bodies.find((body) => !nodeId || String(body.dataset?.nodeId ?? "") === nodeId);
    if (match) return match;
  }
  return null;
}

export function bindCanvasMediaControlPointerGuards(root) {
  const controls = [...(root?.querySelectorAll?.(
    "[data-canvas-audio-body] button, [data-canvas-audio-body] audio, [data-canvas-audio-body] [role='slider'], [data-canvas-video-body] button, [data-canvas-video-fullscreen] button, [data-canvas-video-fullscreen] video",
  ) ?? [])];
  controls.forEach((control) => {
    if (control.dataset.canvasMediaPointerGuard === "true") return;
    control.dataset.canvasMediaPointerGuard = "true";
    control.addEventListener?.("pointerdown", stopCanvasMediaControlPropagation);
    control.addEventListener?.("mousedown", stopCanvasMediaControlPropagation);
  });
  return controls.length;
}

function canvasNodeMediaKind(node) {
  const type = String(node?.type ?? "").toLowerCase();
  const explicit = String(nodeData(node).mediaKind ?? "").toLowerCase();
  if (type.includes("audio") || explicit === "audio") return "audio";
  if (type.includes("video") || explicit === "video") return "video";
  return "";
}

function stopCanvasMediaControlPropagation(event) {
  event.stopPropagation?.();
}

function exportCanvasFrameBlob(canvas, mimeType, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: mimeType, ...(quality === undefined ? {} : { quality }) });
  }
  if (typeof canvas.toBlob !== "function") throw new Error("当前环境不支持导出视频帧");
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("视频帧导出失败"));
      }, mimeType, quality);
    } catch (error) {
      reject(error);
    }
  });
}

function createWaveformDecodeContext(globalObject) {
  const OfflineAudioContext = globalObject?.OfflineAudioContext ?? globalObject?.webkitOfflineAudioContext;
  return typeof OfflineAudioContext === "function" ? new OfflineAudioContext(1, 1, 44_100) : null;
}

function resolveAudioChannelData(audioBuffer, channel) {
  if (ArrayBuffer.isView(audioBuffer) || Array.isArray(audioBuffer)) return audioBuffer;
  if (!audioBuffer || typeof audioBuffer.getChannelData !== "function") return [];
  const channelCount = Math.max(1, boundedInteger(audioBuffer.numberOfChannels, 1, 1, 1024));
  const channelIndex = boundedInteger(channel, 0, 0, channelCount - 1);
  try {
    return audioBuffer.getChannelData(channelIndex) ?? [];
  } catch {
    return [];
  }
}

function defaultCanvasFactory() {
  if (!globalThis.document?.createElement) return null;
  return globalThis.document.createElement("canvas");
}

function nodeData(node) {
  return node?.data && typeof node.data === "object" ? node.data : node ?? {};
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Math.floor(finiteNumber(value, fallback))));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundWaveformValue(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundMediaTime(value) {
  return Math.round(value * 1000) / 1000;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/["']/g, (character) => (character === '"' ? "&quot;" : "&#39;"));
}
