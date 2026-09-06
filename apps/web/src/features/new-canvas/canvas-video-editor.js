import { resolveCanvasMediaNodeSource } from "../production-workbench/canvas/canvas-media-node.js";
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeVideo,
} from "../../../vendor/mediabunny.mjs";

const MAX_CLIPS = 32;

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeAttr(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtml(value) {
  return escapeAttr(value);
}

function mediaKind(node) {
  const type = text(node?.type).toLowerCase();
  const kind = text(node?.data?.mediaKind).toLowerCase();
  return kind || (type.includes("audio") ? "audio" : type.includes("image") ? "image" : "video");
}

function sourceDuration(node) {
  const data = node?.data ?? {};
  return Math.max(0, number(data.durationSec ?? data.videoDuration ?? data.duration, 0));
}

function resolveStorageObjectId(value) {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object") return "";
  return text(value.storageObjectId ?? value.storage_object_id ?? value.storageObject?.id
    ?? value.storage?.storageObjectId ?? value.storage?.id
    ?? value.asset?.storageObjectId ?? value.asset?.latestVersion?.storageObjectId
    ?? value.asset?.latestVersion?.storageObject?.id ?? value.latestVersion?.storageObjectId
    ?? value.latestVersion?.storageObject?.id);
}

const TRANSITION_KINDS = Object.freeze(["none", "dissolve", "fade"]);
const VIDEO_EDITOR_ENCODINGS = Object.freeze([
  { codec: "vp9", format: "webm" },
  { codec: "vp8", format: "webm" },
  { codec: "avc", format: "mp4" },
]);

export function normalizeCanvasVideoEditorTransition(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const kind = TRANSITION_KINDS.includes(text(source.kind)) ? text(source.kind) : "none";
  const duration = Math.max(0, Math.min(10, number(source.duration, 0)));
  return { kind, duration };
}

function resolveEditorClips(document, nodeId) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const edges = Array.isArray(document?.edges) ? document.edges : [];
  const target = nodes.find((node) => text(node?.id) === text(nodeId));
  const storedRows = Array.isArray(target?.data?.shotlistRows) ? target.data.shotlistRows : [];
  if (target?.type === "ai-shotlist" && storedRows.length) {
    return storedRows.filter((row) => row?.frame?.url || row?.frame?.previewUrl).slice(0, MAX_CLIPS).map((row, index) => {
      const frame = row.frame;
      const duration = Math.max(0, number(row.duration, 3));
      return {
        id: `shot-${text(row.id) || index + 1}`,
        nodeId: text(frame.nodeId),
        label: `镜头 ${text(row.shotNo) || index + 1}`,
        kind: text(frame.kind) === "video" ? "video" : "image",
        source: text(frame.url || frame.previewUrl || frame.thumbnailUrl),
        storageObjectId: resolveStorageObjectId(frame),
        sourceIn: 0,
        sourceOut: duration,
        duration,
      };
    });
  }
  const connectedIds = new Set(edges
    .filter((edge) => text(edge?.targetNodeId) === text(nodeId))
    .map((edge) => text(edge?.sourceNodeId))
    .filter(Boolean));
  const candidates = nodes.filter((node) => {
    const id = text(node?.id);
    if (!id || id === text(nodeId)) return false;
    if (!connectedIds.size) return ["video", "source-video", "ai-video"].includes(text(node?.type));
    return connectedIds.has(id);
  });
  const fallback = target && ["video", "source-video", "ai-video"].includes(text(target?.type)) ? [target] : [];
  return [...(candidates.length ? candidates : fallback)]
    .filter((node) => ["video", "image"].includes(mediaKind(node)))
    .slice(0, MAX_CLIPS)
    .map((node, index) => {
      const source = resolveCanvasMediaNodeSource(node, mediaKind(node));
      const duration = mediaKind(node) === "image" ? Math.max(3, sourceDuration(node)) : sourceDuration(node);
      return {
        id: `clip-${text(node.id) || index + 1}`,
        nodeId: text(node.id),
        label: text(node?.data?.title || node?.data?.fileName) || `片段 ${index + 1}`,
        kind: mediaKind(node),
        source,
        storageObjectId: resolveStorageObjectId(node?.data),
        sourceIn: 0,
        sourceOut: duration,
        duration,
      };
    });
}

function resolveEditorAudioTracks(document, nodeId) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const edges = Array.isArray(document?.edges) ? document.edges : [];
  const targetId = text(nodeId);
  const connectedIds = new Set(edges
    .filter((edge) => text(edge?.targetNodeId) === targetId)
    .map((edge) => text(edge?.sourceNodeId))
    .filter(Boolean));
  return nodes.filter((node) => {
    const id = text(node?.id);
    if (!id || !connectedIds.has(id)) return false;
    return mediaKind(node) === "audio";
  }).slice(0, 8).map((node, index) => {
    const data = node?.data ?? {};
    const source = resolveCanvasMediaNodeSource(node, "audio");
    const duration = Math.max(0, sourceDuration(node));
    return {
      id: `audio-${text(node?.id) || index + 1}`,
      nodeId: text(node?.id),
      label: text(data.title || data.fileName) || `音频 ${index + 1}`,
      source,
      storageObjectId: resolveStorageObjectId(data),
      sourceIn: 0,
      sourceOut: duration,
      volume: 1,
      timelineIn: 0,
      fadeIn: 0,
      fadeOut: 0,
    };
  });
}

export function normalizeCanvasVideoEditorAudioTrack(track = {}) {
  const sourceIn = Math.max(0, number(track.sourceIn, 0));
  const sourceOut = track.sourceOut === undefined ? undefined : Math.max(sourceIn, number(track.sourceOut, sourceIn));
  const sourceDuration = Math.max(0, (sourceOut ?? sourceIn) - sourceIn);
  return {
    id: text(track.id),
    nodeId: text(track.nodeId),
    label: text(track.label) || "音频轨",
    source: text(track.source),
    storageObjectId: resolveStorageObjectId(track),
    sourceIn,
    ...(sourceOut === undefined ? {} : { sourceOut }),
    volume: Math.max(0, Math.min(4, number(track.volume, 1))),
    timelineIn: Math.max(0, number(track.timelineIn, 0)),
    fadeIn: Math.max(0, Math.min(sourceDuration || 10, number(track.fadeIn, 0))),
    fadeOut: Math.max(0, Math.min(sourceDuration || 10, number(track.fadeOut, 0))),
  };
}

export function normalizeCanvasVideoEditorClip(clip = {}) {
  const duration = Math.max(0, number(clip.duration, 0));
  const sourceIn = Math.max(0, number(clip.sourceIn, 0));
  const sourceOut = Math.max(sourceIn, number(clip.sourceOut, duration || sourceIn));
  return {
    id: text(clip.id),
    nodeId: text(clip.nodeId),
    label: text(clip.label) || "片段",
    kind: text(clip.kind) === "image" ? "image" : "video",
    source: text(clip.source),
    storageObjectId: resolveStorageObjectId(clip),
    sourceIn,
    sourceOut,
    duration,
    transitionIn: normalizeCanvasVideoEditorTransition(clip.transitionIn),
  };
}

export function computeCanvasVideoEditorDuration(clips = []) {
  return clips.reduce((total, clip, index) => {
    const duration = Math.max(0, number(clip?.sourceOut, 0) - number(clip?.sourceIn, 0));
    const overlap = index > 0 ? Math.min(duration, Math.max(0, number(clip?.transitionIn?.duration, 0))) : 0;
    return total + duration - overlap;
  }, 0);
}

export function createCanvasVideoEditorFramePlan(clips = [], fps = 30) {
  const frameRate = Math.max(1, Math.min(60, Math.round(number(fps, 30))));
  const normalized = clips.map(normalizeCanvasVideoEditorClip).filter((clip) => clip.sourceOut > clip.sourceIn);
  const totalDuration = computeCanvasVideoEditorDuration(normalized);
  const frameCount = Math.max(1, Math.ceil(totalDuration * frameRate));
  const frames = [];
  let cursor = 0;
  const segments = normalized.map((clip, index) => {
    const clipDuration = clip.sourceOut - clip.sourceIn;
    const overlap = index > 0 ? Math.min(clipDuration, Math.max(0, clip.transitionIn.duration)) : 0;
    const start = Math.max(0, cursor - overlap);
    cursor = start + clipDuration;
    return { clip, start, end: cursor };
  });
  for (let index = 0; index < frameCount; index += 1) {
    const timestamp = Math.min(totalDuration, index / frameRate);
    const segment = segments.find((item) => timestamp < item.end) || segments.at(-1);
    if (!segment) continue;
    const segmentIndex = segments.indexOf(segment);
    const transition = segmentIndex > 0 ? normalizeCanvasVideoEditorTransition(segment.clip.transitionIn) : { kind: "none", duration: 0 };
    const transitionProgress = transition.duration > 0 && timestamp < segment.start + transition.duration
      ? Math.max(0, Math.min(1, (timestamp - segment.start) / transition.duration))
      : 1;
    frames.push({
      index,
      frameCount,
      timestamp,
      duration: Math.min(1 / frameRate, Math.max(0, totalDuration - timestamp)),
      clip: segment.clip,
      clipTime: segment.clip.sourceIn + Math.max(0, timestamp - segment.start),
      transition: transitionProgress < 1 ? {
        kind: transition.kind,
        duration: transition.duration,
        progress: transitionProgress,
        previousClip: segments[segmentIndex - 1]?.clip ?? null,
        previousClipTime: segments[segmentIndex - 1]
          ? segments[segmentIndex - 1].clip.sourceOut - transition.duration + Math.max(0, timestamp - segment.start)
          : 0,
      } : null,
    });
  }
  return { frameRate, duration: totalDuration, frames };
}

export async function selectCanvasVideoEditorEncoding({ width, height, format = "auto", bitrate = 4_000_000 } = {}, probe = canEncodeVideo) {
  const requested = resolveCanvasVideoEditorExportFormat(format);
  const candidates = VIDEO_EDITOR_ENCODINGS.filter((item) => requested === "auto" || requested === item.format);
  for (const candidate of candidates) {
    try {
      const supported = await probe(candidate.codec, {
        bitrate: Math.max(250_000, number(bitrate, 4_000_000)),
        hardwareAcceleration: "no-preference",
        height: Math.max(2, Math.round(number(height, 720))),
        latencyMode: "quality",
        width: Math.max(2, Math.round(number(width, 1280))),
      });
      if (supported) return { ...candidate, bitrate: Math.max(250_000, number(bitrate, 4_000_000)) };
    } catch {
      // Continue to the next codec; browser capability probing is best effort.
    }
  }
  return null;
}

export async function encodeCanvasVideoEditorTimeline({
  canvas,
  clips = [],
  fps = 30,
  format = "auto",
  bitrate = 4_000_000,
  renderFrame,
  signal,
  onProgress,
} = {}) {
  if (!canvas || typeof canvas.getContext !== "function") throw new Error("video_editor_canvas_unavailable");
  if (typeof renderFrame !== "function") throw new Error("video_editor_frame_renderer_required");
  if (signal?.aborted) throw Object.assign(new Error("导出已取消"), { name: "AbortError" });
  const plan = createCanvasVideoEditorFramePlan(clips, fps);
  if (!plan.frames.length || plan.duration <= 0) throw new Error("没有可导出的片段");
  const encoding = await selectCanvasVideoEditorEncoding({ width: canvas.width, height: canvas.height, format, bitrate });
  if (!encoding) throw new Error("当前浏览器不支持本地视频编码，请改用 JSON 导出或更换浏览器");
  const target = new BufferTarget();
  const outputFormat = encoding.format === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat();
  const output = new Output({ format: outputFormat, target });
  const source = new CanvasSource(canvas, {
    bitrate: encoding.bitrate,
    codec: encoding.codec,
    hardwareAcceleration: "no-preference",
    keyFrameInterval: 2,
    latencyMode: "quality",
  });
  output.addVideoTrack(source, { frameRate: plan.frameRate, maximumPacketCount: plan.frames.length });
  try {
    await output.start();
    for (const frame of plan.frames) {
      if (signal?.aborted) throw Object.assign(new Error("导出已取消"), { name: "AbortError" });
      await renderFrame({ canvas, ...frame });
      await source.add(frame.timestamp, frame.duration);
      onProgress?.({ completed: frame.index + 1, total: plan.frames.length, progress: (frame.index + 1) / plan.frames.length });
    }
    await output.finalize();
  } catch (error) {
    if (output.state === "started") await output.cancel();
    throw error;
  }
  if (!target.buffer) throw new Error("视频编码没有生成可下载文件");
  return {
    file: new Blob([target.buffer], { type: outputFormat.mimeType }),
    fileExtension: outputFormat.fileExtension,
    mimeType: outputFormat.mimeType,
    duration: plan.duration,
    frameCount: plan.frames.length,
    format: encoding.format,
  };
}

export function resolveCanvasVideoEditorExportFormat(value = "auto") {
  const format = text(value).toLowerCase();
  return ["auto", "webm", "mp4"].includes(format) ? format : "auto";
}

export function buildCanvasVideoEditorExportPayload(editor, workbench) {
  const clips = (editor?.clips ?? []).map(normalizeCanvasVideoEditorClip).filter((clip) => clip.sourceOut > clip.sourceIn);
  const audioTracks = (editor?.audioTracks ?? []).map(normalizeCanvasVideoEditorAudioTrack).filter((track) => track.sourceOut === undefined || track.sourceOut > track.sourceIn);
  return {
    schemaVersion: 1,
    format: "comic-ai.canvas-video-timeline",
    canvasProjectId: text(workbench?.ui?.selectedCanvasProjectId),
    nodeId: text(editor?.nodeId),
    title: text(editor?.title) || "当前剪辑",
    generatedAt: new Date().toISOString(),
    clips: clips.map((clip, index) => ({ ...clip, order: index + 1 })),
    ...(audioTracks.length ? { audioTracks } : {}),
    totalDuration: computeCanvasVideoEditorDuration(clips),
  };
}

export function buildCanvasVideoEditorServerExportPayload(editor, options = {}) {
  const clips = (editor?.clips ?? [])
    .map(normalizeCanvasVideoEditorClip)
    .filter((clip) => clip.sourceOut > clip.sourceIn)
    .map((clip) => ({
      storageObjectId: clip.storageObjectId,
      durationSeconds: clip.sourceOut - clip.sourceIn,
      sourceIn: clip.sourceIn,
      sourceOut: clip.sourceOut,
      transitionIn: clip.transitionIn,
    }));
  const audio = (editor?.audioTracks ?? []).map(normalizeCanvasVideoEditorAudioTrack).map((track) => ({
    storageObjectId: track.storageObjectId,
    sourceIn: track.sourceIn,
    ...(track.sourceOut === undefined ? {} : { sourceOut: track.sourceOut }),
    volume: track.volume,
    ...(track.timelineIn > 0 ? { timelineIn: track.timelineIn } : {}),
    ...(track.fadeIn > 0 ? { fadeIn: track.fadeIn } : {}),
    ...(track.fadeOut > 0 ? { fadeOut: track.fadeOut } : {}),
  })).filter((track) => track.storageObjectId);
  return {
    nodeKey: text(editor?.nodeId) || "video-composition",
    width: Math.max(2, Math.round(number(options.width, 1280))),
    height: Math.max(2, Math.round(number(options.height, 720))),
    fps: Math.max(1, Math.min(60, Math.round(number(options.fps, 30)))),
    clips,
    ...(audio.length === 1 ? { audio: audio[0] } : {}),
    ...(audio.length > 1 ? { audioTracks: audio } : {}),
  };
}

export function canCanvasVideoEditorUseServerExport(editor) {
  const clips = (editor?.clips ?? []).map(normalizeCanvasVideoEditorClip).filter((clip) => clip.sourceOut > clip.sourceIn);
  return clips.length > 0 && clips.every((clip) => Boolean(clip.storageObjectId));
}

export function buildCanvasVideoEditorAiTransitionPayload(editor, node, firstStorageObjectId, lastStorageObjectId) {
  const duration = Math.max(1, Math.min(10, number(editor?.aiTransitionDuration, 3)));
  const model = text(editor?.aiTransitionModel || node?.data?.modelCode || node?.data?.model || "");
  return {
    kind: "video",
    mediaKind: "video",
    ...(model ? { model, modelCode: model } : {}),
    motionPrompt: text(editor?.aiTransitionPrompt) || "自然衔接前后镜头",
    canvasContext: { videoGenerationMode: "first-last-frame" },
    firstFrame: { storageObjectId: text(firstStorageObjectId), role: "first_frame" },
    lastFrame: { storageObjectId: text(lastStorageObjectId), role: "last_frame" },
    parameters: {
      videoDuration: duration,
      mode: "first-last-frame",
      firstFrame: { storageObjectId: text(firstStorageObjectId), role: "first_frame" },
      lastFrame: { storageObjectId: text(lastStorageObjectId), role: "last_frame" },
      firstFrameStorageObjectId: text(firstStorageObjectId),
      lastFrameStorageObjectId: text(lastStorageObjectId),
      referenceImages: [
        { storageObjectId: text(firstStorageObjectId), role: "first_frame" },
        { storageObjectId: text(lastStorageObjectId), role: "last_frame" },
      ].filter((item) => item.storageObjectId),
    },
  };
}

export function downloadCanvasVideoEditorRemoteArtifact(artifact, options = {}) {
  const url = text(artifact?.url || artifact?.sourceUrl || artifact?.previewUrl);
  if (!url) throw new Error("video_editor_remote_artifact_missing");
  const documentRef = options.documentRef ?? globalThis.document;
  if (typeof documentRef?.createElement !== "function") throw new Error("video_editor_export_unavailable");
  const title = text(options.title) || "canvas-video";
  const filename = options.filename || `${title.replace(/[^\w\u4e00-\u9fff.-]+/gu, "-")}.mp4`;
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  if (typeof anchor.click !== "function") throw new Error("video_editor_download_unavailable");
  anchor.click();
  return { filename, url };
}

export function downloadCanvasVideoEditorTimeline(payload, options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const urlApi = options.urlApi ?? globalThis.URL;
  if (typeof globalThis.Blob !== "function" || typeof documentRef?.createElement !== "function" || typeof urlApi?.createObjectURL !== "function") {
    throw new Error("video_editor_export_unavailable");
  }
  const title = text(options.title || payload?.title) || "canvas-video-timeline";
  const filename = options.filename || `${title.replace(/[^\w\u4e00-\u9fff.-]+/gu, "-")}.json`;
  const blob = new globalThis.Blob([JSON.stringify(payload ?? {}, null, 2)], { type: "application/json;charset=utf-8" });
  const href = urlApi.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    if (typeof anchor.click !== "function") throw new Error("video_editor_download_unavailable");
    anchor.click();
  } finally {
    if (typeof urlApi.revokeObjectURL === "function") {
      setTimeout(() => urlApi.revokeObjectURL(href), 0);
    }
  }
  return { filename, size: blob.size };
}

export function downloadCanvasVideoEditorMedia(result, options = {}) {
  const file = result?.file;
  if (!(file instanceof Blob)) throw new Error("video_editor_media_result_missing");
  const documentRef = options.documentRef ?? globalThis.document;
  const urlApi = options.urlApi ?? globalThis.URL;
  if (typeof documentRef?.createElement !== "function" || typeof urlApi?.createObjectURL !== "function") {
    throw new Error("video_editor_export_unavailable");
  }
  const title = text(options.title) || "canvas-video";
  const extension = text(options.extension || result.fileExtension) || (result.mimeType === "video/mp4" ? "mp4" : "webm");
  const filename = options.filename || `${title.replace(/[^\w\u4e00-\u9fff.-]+/gu, "-")}.${extension.replace(/^\./, "")}`;
  const href = urlApi.createObjectURL(file);
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    if (typeof anchor.click !== "function") throw new Error("video_editor_download_unavailable");
    anchor.click();
  } finally {
    if (typeof urlApi.revokeObjectURL === "function") setTimeout(() => urlApi.revokeObjectURL(href), 0);
  }
  return { filename, size: file.size, mimeType: result.mimeType || file.type };
}

function waitForMediaReady(media) {
  if (!media) return Promise.reject(new Error("video_editor_media_unavailable"));
  if (media.tagName === "IMG") {
    if (media.complete && media.naturalWidth > 0) return Promise.resolve(media);
    return new Promise((resolve, reject) => {
      media.addEventListener("load", () => resolve(media), { once: true });
      media.addEventListener("error", () => reject(new Error("video_editor_media_load_failed")), { once: true });
    });
  }
  if (media.readyState >= 1 && Number.isFinite(media.duration)) return Promise.resolve(media);
  return new Promise((resolve, reject) => {
    media.addEventListener("loadedmetadata", () => resolve(media), { once: true });
    media.addEventListener("error", () => reject(new Error("video_editor_media_load_failed")), { once: true });
  });
}

async function loadEditorMedia(clip, documentRef) {
  const source = text(clip?.source);
  if (!source) return null;
  const media = documentRef.createElement(clip.kind === "image" ? "img" : "video");
  media.crossOrigin = "anonymous";
  media.muted = true;
  media.playsInline = true;
  media.preload = "auto";
  media.src = source;
  await waitForMediaReady(media);
  return media;
}

function drawEditorMedia(ctx, media, width, height, alpha = 1) {
  if (!media) return;
  const mediaWidth = Number(media.videoWidth || media.naturalWidth || media.width || width) || width;
  const mediaHeight = Number(media.videoHeight || media.naturalHeight || media.height || height) || height;
  const scale = Math.max(width / mediaWidth, height / mediaHeight);
  const drawWidth = mediaWidth * scale;
  const drawHeight = mediaHeight * scale;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(media, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

async function captureEditorFrame(clip, time, documentRef) {
  const media = await loadEditorMedia(clip, documentRef);
  if (!media) throw new Error("video_editor_transition_frame_missing");
  await seekEditorVideo(media, time);
  const canvas = documentRef.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.toBlob !== "function") throw new Error("video_editor_transition_frame_unavailable");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawEditorMedia(context, media, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("video_editor_transition_frame_unavailable")), "image/jpeg", 0.9);
  });
  const FileCtor = globalThis.File;
  return FileCtor
    ? new FileCtor([blob], `canvas-transition-${Date.now().toString(36)}.jpg`, { type: "image/jpeg" })
    : Object.assign(blob, { name: `canvas-transition-${Date.now().toString(36)}.jpg` });
}

function unwrapGenerationTask(value) {
  if (value?.task && typeof value.task === "object") return value.task;
  if (value?.data?.task && typeof value.data.task === "object") return value.data.task;
  if (value?.data && typeof value.data === "object" && !Array.isArray(value.data)) return value.data;
  return value ?? {};
}

function generationTaskMedia(task) {
  const source = unwrapGenerationTask(task);
  const candidates = [
    ...(Array.isArray(source.resultAssets) ? source.resultAssets : []),
    ...(Array.isArray(source.result?.resultAssets) ? source.result.resultAssets : []),
    source.result,
    source.artifact,
    source,
  ].filter((item) => item && typeof item === "object");
  for (const item of candidates) {
    const storageObjectId = resolveStorageObjectId(item);
    const url = text(item.url || item.sourceUrl || item.previewUrl || item.videoUrl || item.resultUrl);
    if (storageObjectId || url) return { storageObjectId, url };
  }
  return null;
}

async function waitForCanvasVideoGeneration(api, taskId, signal, timeoutMs = 8 * 60 * 1000) {
  if (typeof api?.getGenerationTask !== "function") throw new Error("video_editor_generation_poll_unavailable");
  const startedAt = Date.now();
  let delay = 1200;
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw Object.assign(new Error("导出已取消"), { name: "AbortError" });
    const task = unwrapGenerationTask(await api.getGenerationTask(taskId, { signal }));
    const status = text(task.status || task.workflowStatus).toLowerCase();
    if (["completed", "succeeded", "success"].includes(status)) return task;
    if (["failed", "canceled", "cancelled", "result_unknown", "manual_review_required"].includes(status)) {
      throw new Error(text(task.displayMessage || task.failure?.displayMessage || task.failureCode) || "AI 转场生成失败");
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(5000, Math.round(delay * 1.35));
  }
  throw new Error("AI 转场生成超时，请到任务中心查看状态");
}

async function seekEditorVideo(media, time) {
  if (media?.tagName !== "VIDEO") return;
  const duration = Number.isFinite(media.duration) ? media.duration : time;
  const nextTime = Math.max(0, Math.min(Math.max(0, duration - 0.001), time));
  if (Math.abs(Number(media.currentTime || 0) - nextTime) < 0.001) return;
  await new Promise((resolve) => {
    const done = () => { media.removeEventListener("seeked", done); resolve(); };
    media.addEventListener("seeked", done, { once: true });
    media.currentTime = nextTime;
  });
}

function renderClip(clip, index) {
  const normalized = normalizeCanvasVideoEditorClip(clip);
  const max = Math.max(normalized.duration, normalized.sourceOut, normalized.sourceIn, 0.1);
  const preview = normalized.source
    ? normalized.kind === "image"
      ? `<img src="${escapeAttr(normalized.source)}" alt="" loading="lazy" />`
      : `<video src="${escapeAttr(normalized.source)}" preload="metadata" muted playsinline></video>`
    : `<span class="canvas-video-editor-empty">暂无预览</span>`;
  return `<article class="canvas-video-editor-clip" data-video-editor-clip-id="${escapeAttr(normalized.id)}">
    <div class="canvas-video-editor-clip-preview">${preview}<span class="canvas-video-editor-clip-index">${index + 1}</span></div>
    <div class="canvas-video-editor-clip-main">
      <strong>${escapeHtml(normalized.label)}</strong>
      <small>${normalized.kind === "image" ? "图片" : "视频"}${normalized.nodeId ? ` · ${escapeHtml(normalized.nodeId)}` : ""}</small>
      <div class="canvas-video-editor-range-row">
        <label>入点 <input type="number" min="0" max="${max}" step="0.01" value="${normalized.sourceIn}" data-video-editor-field="sourceIn" data-clip-id="${escapeAttr(normalized.id)}" /></label>
        <label>出点 <input type="number" min="0" max="${max}" step="0.01" value="${normalized.sourceOut}" data-video-editor-field="sourceOut" data-clip-id="${escapeAttr(normalized.id)}" /></label>
        <label>转场 <select data-video-editor-field="transitionKind" data-clip-id="${escapeAttr(normalized.id)}">${TRANSITION_KINDS.map((kind) => `<option value="${kind}" ${normalized.transitionIn.kind === kind ? "selected" : ""}>${kind === "none" ? "硬切" : kind === "dissolve" ? "叠化" : "淡入"}</option>`).join("")}</select></label>
        <label>转场时长 <input type="number" min="0" max="10" step="0.1" value="${normalized.transitionIn.duration}" data-video-editor-field="transitionDuration" data-clip-id="${escapeAttr(normalized.id)}" /></label>
        <button type="button" data-video-editor-action="move-clip" data-direction="up" data-clip-id="${escapeAttr(normalized.id)}" aria-label="片段上移" title="片段上移">↑</button>
        <button type="button" data-video-editor-action="move-clip" data-direction="down" data-clip-id="${escapeAttr(normalized.id)}" aria-label="片段下移" title="片段下移">↓</button>
        ${index > 0 ? `<button type="button" data-video-editor-action="generate-ai-transition" data-clip-id="${escapeAttr(normalized.id)}" aria-label="生成 AI 转场" title="使用前后片段生成 AI 转场">✦ AI 转场</button>` : ""}
        <button type="button" data-video-editor-action="remove-clip" data-clip-id="${escapeAttr(normalized.id)}" aria-label="移除片段" title="移除片段">×</button>
      </div>
    </div>
  </article>`;
}

export function renderCanvasVideoEditorShell(ui = {}) {
  const editor = ui.canvasVideoEditor;
  if (!editor?.open) return "";
  const clips = Array.isArray(editor.clips) ? editor.clips : [];
  const total = computeCanvasVideoEditorDuration(clips);
  return `<section class="canvas-video-editor-overlay" data-canvas-video-editor role="dialog" aria-modal="true" aria-label="视频剪辑器">
    <div class="canvas-video-editor-backdrop" data-video-editor-action="close" aria-hidden="true"></div>
    <div class="canvas-video-editor-window">
      <header class="canvas-video-editor-header"><div><strong>视频剪辑器</strong><small>${escapeHtml(editor.title || "当前剪辑")}</small></div><button type="button" data-video-editor-action="close" aria-label="关闭视频剪辑器" title="关闭">×</button></header>
      <div class="canvas-video-editor-body">
        <div class="canvas-video-editor-preview" data-video-editor-preview>
          ${clips[0]?.source
            ? clips[0].kind === "image"
              ? `<img src="${escapeAttr(clips[0].source)}" alt="" />`
              : `<video src="${escapeAttr(clips[0].source)}" controls playsinline preload="metadata"></video>`
            : `<div class="canvas-video-editor-empty">连接视频节点后可预览</div>`}
        </div>
        <div class="canvas-video-editor-timeline" data-video-editor-timeline>
          ${clips.length ? clips.map(renderClip).join("") : `<div class="canvas-video-editor-empty">没有可编辑的视频或图片素材</div>`}
          ${(editor.audioTracks ?? []).map((track, index) => {
            const normalized = normalizeCanvasVideoEditorAudioTrack(track);
            const max = Math.max(0.1, number(normalized.sourceOut, 10));
            return `<article class="canvas-video-editor-audio-track" data-audio-track-id="${escapeAttr(normalized.id)}"><strong>${escapeHtml(normalized.label)}</strong><small>音频轨 ${index + 1}</small><div class="canvas-video-editor-range-row"><label>入点 <input type="number" min="0" max="${max}" step="0.01" value="${normalized.sourceIn}" data-video-editor-field="audioSourceIn" data-audio-track-id="${escapeAttr(normalized.id)}" /></label><label>出点 <input type="number" min="0" max="${max}" step="0.01" value="${normalized.sourceOut ?? max}" data-video-editor-field="audioSourceOut" data-audio-track-id="${escapeAttr(normalized.id)}" /></label><label>起始 <input type="number" min="0" max="${Math.max(0, total)}" step="0.01" value="${normalized.timelineIn}" data-video-editor-field="audioTimelineIn" data-audio-track-id="${escapeAttr(normalized.id)}" /></label><label>音量 <input type="number" min="0" max="4" step="0.1" value="${normalized.volume}" data-video-editor-field="audioVolume" data-audio-track-id="${escapeAttr(normalized.id)}" /></label><label>淡入 <input type="number" min="0" max="${max}" step="0.1" value="${normalized.fadeIn}" data-video-editor-field="audioFadeIn" data-audio-track-id="${escapeAttr(normalized.id)}" /></label><label>淡出 <input type="number" min="0" max="${max}" step="0.1" value="${normalized.fadeOut}" data-video-editor-field="audioFadeOut" data-audio-track-id="${escapeAttr(normalized.id)}" /></label><button type="button" data-video-editor-action="move-audio-track" data-direction="up" data-audio-track-id="${escapeAttr(normalized.id)}" aria-label="音频轨上移" title="音频轨上移">↑</button><button type="button" data-video-editor-action="move-audio-track" data-direction="down" data-audio-track-id="${escapeAttr(normalized.id)}" aria-label="音频轨下移" title="音频轨下移">↓</button><button type="button" data-video-editor-action="remove-audio-track" data-audio-track-id="${escapeAttr(normalized.id)}" aria-label="移除音频轨" title="移除音频轨">×</button></div></article>`;
          }).join("")}
        </div>
      </div>
      <footer class="canvas-video-editor-footer"><span>总时长 ${total.toFixed(2)} 秒</span><span class="canvas-video-editor-hint">${editor.aiTransitionStatus || (editor.exportStatus === "running" ? "正在准备导出..." : editor.exportStatus === "encoding" ? "正在合成视频..." : editor.exportStatus === "succeeded" ? "导出完成。" : editor.exportStatus === "canceled" ? "已取消导出。" : editor.exportStatus === "failed" ? escapeHtml(editor.exportError || "导出失败") : "剪辑参数会保存到当前画布节点")}</span><label class="canvas-video-editor-ai-prompt">AI 转场描述 <input type="text" maxlength="500" value="${escapeAttr(editor.aiTransitionPrompt || "自然衔接前后镜头")}" data-video-editor-field="aiTransitionPrompt" /></label><label>模型 <input type="text" maxlength="120" value="${escapeAttr(editor.aiTransitionModel || "")}" placeholder="沿用节点模型" data-video-editor-field="aiTransitionModel" /></label><label>时长 <input type="number" min="1" max="10" step="1" value="${Math.max(1, Math.min(10, number(editor.aiTransitionDuration, 3)))}" data-video-editor-field="aiTransitionDuration" /></label><button type="button" data-video-editor-action="save" ${clips.length && !["running", "encoding"].includes(editor.exportStatus) && !editor.aiTransitionBusy ? "" : "disabled"}>保存剪辑</button>${["running", "encoding"].includes(editor.exportStatus) || editor.aiTransitionBusy ? `<button type="button" data-video-editor-action="cancel-export">取消导出</button>` : `<select data-video-editor-field="exportFormat" aria-label="视频导出格式"><option value="webm" ${editor.exportFormat !== "mp4" ? "selected" : ""}>WebM</option><option value="mp4" ${editor.exportFormat === "mp4" ? "selected" : ""}>MP4</option></select><button type="button" data-video-editor-action="export-media" ${clips.length ? "" : "disabled"}>导出视频</button><button type="button" data-video-editor-action="export" ${clips.length ? "" : "disabled"}>导出时间线</button>`}</footer>
    </div>
  </section>`;
}

export function createCanvasVideoEditorController({ surface, workbench, render } = {}) {
  const updateDocument = (nextDocument) => {
    workbench.ui.canvasDocument = nextDocument;
    workbench.updateCanvasDocument?.(nextDocument);
    if (workbench.sourceWorkbench?.ui && workbench.sourceWorkbench.ui !== workbench.ui) {
      workbench.sourceWorkbench.ui.canvasDocument = nextDocument;
    }
  };
  const open = (nodeId) => {
    const document = workbench.ui?.canvasDocument;
    const node = document?.nodes?.find?.((item) => text(item?.id) === text(nodeId));
    if (!node) return false;
    const stored = Array.isArray(node.data?.videoEditorTimeline) ? node.data.videoEditorTimeline : [];
    const clips = stored.length ? stored.map(normalizeCanvasVideoEditorClip) : resolveEditorClips(document, nodeId);
    const storedAudioTracks = Array.isArray(node.data?.videoEditorAudioTracks) ? node.data.videoEditorAudioTracks : [];
    workbench.ui.canvasVideoEditor = { open: true, nodeId: text(nodeId), title: text(node.data?.title) || "当前剪辑", clips, audioTracks: storedAudioTracks.length ? storedAudioTracks : resolveEditorAudioTracks(document, nodeId), exportFormat: "webm", exportStatus: "idle", aiTransitionPrompt: "自然衔接前后镜头", aiTransitionModel: text(node.data?.modelCode || node.data?.model || ""), aiTransitionDuration: 3, aiTransitionBusy: false, aiTransitionStatus: "" };
    void render?.();
    return true;
  };
  const close = () => {
    if (!workbench.ui.canvasVideoEditor?.open) return false;
    workbench.ui.canvasVideoEditor = null;
    void render?.();
    return true;
  };
  const save = () => {
    const editor = workbench.ui.canvasVideoEditor;
    const nodeId = text(editor?.nodeId);
    const document = workbench.ui?.canvasDocument;
    if (!editor?.open || !nodeId || !document) return false;
    const clips = (editor.clips ?? []).map(normalizeCanvasVideoEditorClip).filter((clip) => clip.sourceOut > clip.sourceIn);
    const node = document.nodes?.find?.((item) => text(item?.id) === nodeId);
    if (!node) return false;
    const nextDocument = {
      ...document,
      nodes: document.nodes.map((item) => text(item?.id) === nodeId
        ? { ...item, data: { ...(item.data ?? {}), videoEditorTimeline: clips, videoEditorAudioTracks: editor.audioTracks ?? [], videoEditorDuration: computeCanvasVideoEditorDuration(clips), videoEditorStatus: "configured" } }
        : item),
    };
    updateDocument(nextDocument);
    workbench.ui.toast = "已保存视频剪辑参数。";
    workbench.ui.canvasVideoEditor = null;
    void render?.();
    return true;
  };
  const cancelExport = () => {
    const editor = workbench.ui.canvasVideoEditor;
    if (!editor || (!["running", "encoding"].includes(editor.exportStatus) && !editor.aiTransitionBusy)) return false;
    editor.exportAbortController?.abort?.();
    if (editor.aiTransitionBusy) {
      editor.aiTransitionStatus = "已取消 AI 转场。";
    } else {
      editor.exportStatus = "canceled";
    }
    editor.exportError = "";
    void render?.();
    return true;
  };
  const generateAiTransition = async (clipId) => {
    const editor = workbench.ui.canvasVideoEditor;
    if (!editor?.open || editor.aiTransitionBusy) return false;
    const targetIndex = editor.clips.findIndex((clip) => text(clip.id) === text(clipId));
    if (targetIndex <= 0) {
      editor.aiTransitionStatus = "请先选择第二段及之后的片段。";
      void render?.();
      return false;
    }
    const previous = normalizeCanvasVideoEditorClip(editor.clips[targetIndex - 1]);
    const target = normalizeCanvasVideoEditorClip(editor.clips[targetIndex]);
    const canvasProjectId = text(workbench.ui?.selectedCanvasProjectId);
    const runCanvasNode = workbench.api?.runCanvasNode;
    const uploadFile = workbench.api?.uploadFile;
    if (!canvasProjectId || typeof runCanvasNode !== "function" || typeof uploadFile !== "function") {
      editor.aiTransitionStatus = "当前项目不支持 AI 转场提交。";
      void render?.();
      return false;
    }
    const controller = new AbortController();
    editor.exportAbortController = controller;
    editor.aiTransitionBusy = true;
    editor.aiTransitionStatus = "正在提取首尾帧...";
    editor.aiTransitionError = "";
    void render?.();
    try {
      const documentRef = globalThis.document;
      const firstFrame = await captureEditorFrame(previous, Math.max(previous.sourceIn, previous.sourceOut - 0.05), documentRef);
      const lastFrame = await captureEditorFrame(target, target.sourceIn, documentRef);
      if (controller.signal.aborted) throw Object.assign(new Error("导出已取消"), { name: "AbortError" });
      editor.aiTransitionStatus = "正在上传首尾帧...";
      void render?.();
      const uploadOptions = { canvasProjectId, purpose: "canvas-ai-transition", signal: controller.signal };
      const [firstUpload, lastUpload] = await Promise.all([
        uploadFile(firstFrame, uploadOptions),
        uploadFile(lastFrame, uploadOptions),
      ]);
      const firstStorageObjectId = resolveStorageObjectId(firstUpload?.upload || firstUpload);
      const lastStorageObjectId = resolveStorageObjectId(lastUpload?.upload || lastUpload);
      if (!firstStorageObjectId || !lastStorageObjectId) throw new Error("首尾帧上传失败");
      editor.aiTransitionStatus = "已提交，正在生成 AI 转场...";
      void render?.();
      const node = workbench.ui.canvasDocument?.nodes?.find?.((item) => text(item.id) === text(editor.nodeId));
      const duration = Math.max(1, Math.min(10, number(editor.aiTransitionDuration, 3)));
      const result = await runCanvasNode(
        canvasProjectId,
        editor.nodeId,
        buildCanvasVideoEditorAiTransitionPayload(editor, node, firstStorageObjectId, lastStorageObjectId),
        { idempotencyKey: `canvas.video.ai-transition:${canvasProjectId}:${editor.nodeId}:${Date.now()}`, signal: controller.signal },
      );
      const taskId = text(result?.taskId || result?.generationTaskId || result?.task?.id || result?.data?.taskId);
      if (!taskId) throw new Error("服务端未返回转场任务");
      const task = await waitForCanvasVideoGeneration(workbench.api, taskId, controller.signal);
      const media = generationTaskMedia(task);
      if (!media) throw new Error("AI 转场生成完成但未返回视频素材");
      const sourceUrl = media.url || (media.storageObjectId ? `/api/storage/objects/${encodeURIComponent(media.storageObjectId)}/content?proxy=1` : "");
      if (!sourceUrl) throw new Error("AI 转场视频地址无效");
      const generatedDuration = Math.max(0.1, number(task.result?.durationSeconds ?? task.durationSeconds, duration));
      const generatedClip = normalizeCanvasVideoEditorClip({
        id: `ai-transition-${Date.now().toString(36)}`,
        nodeId: "",
        label: "AI 转场",
        kind: "video",
        source: sourceUrl,
        storageObjectId: media.storageObjectId,
        sourceIn: 0,
        sourceOut: generatedDuration,
        duration: generatedDuration,
      });
      editor.clips.splice(targetIndex, 0, generatedClip);
      editor.clips[targetIndex + 1].transitionIn = { kind: "none", duration: 0 };
      editor.aiTransitionStatus = "AI 转场已插入时间线。";
      editor.aiTransitionError = "";
    } catch (error) {
      editor.aiTransitionStatus = error?.name === "AbortError" ? "已取消 AI 转场。" : "AI 转场生成失败。";
      editor.aiTransitionError = error?.name === "AbortError" ? "" : (error?.message || "AI 转场生成失败");
    } finally {
      editor.aiTransitionBusy = false;
      delete editor.exportAbortController;
      void render?.();
    }
    return true;
  };
  const exportTimeline = async () => {
    const editor = workbench.ui.canvasVideoEditor;
    if (!editor?.open || editor.exportStatus === "running") return false;
    const clips = (editor.clips ?? []).map(normalizeCanvasVideoEditorClip).filter((clip) => clip.sourceOut > clip.sourceIn);
    if (!clips.length) {
      editor.exportStatus = "failed";
      editor.exportError = "没有可导出的片段";
      void render?.();
      return false;
    }
    const controller = new AbortController();
    editor.exportAbortController = controller;
    editor.exportStatus = "running";
    editor.exportError = "";
    void render?.();
    try {
      for (let index = 0; index < clips.length; index += 1) {
        if (controller.signal.aborted) throw new DOMException("导出已取消", "AbortError");
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const payload = buildCanvasVideoEditorExportPayload(editor, workbench);
      downloadCanvasVideoEditorTimeline(payload, { title: editor.title });
      editor.exportStatus = "succeeded";
    } catch (error) {
      editor.exportStatus = error?.name === "AbortError" ? "canceled" : "failed";
      editor.exportError = error?.name === "AbortError" ? "" : (error?.message || "导出失败");
    } finally {
      delete editor.exportAbortController;
      void render?.();
    }
    return true;
  };
  const exportMedia = async () => {
    const editor = workbench.ui.canvasVideoEditor;
    if (!editor?.open || ["running", "encoding"].includes(editor.exportStatus)) return false;
    const format = resolveCanvasVideoEditorExportFormat(editor.exportFormat || "webm");
    const controller = new AbortController();
    editor.exportAbortController = controller;
    editor.exportStatus = "encoding";
    editor.exportError = "";
    void render?.();
    try {
      const canvasProjectId = text(workbench.ui?.selectedCanvasProjectId);
      const serverExport = workbench.api?.exportCanvasVideo;
      if (format === "mp4" && canvasProjectId && typeof serverExport === "function" && canCanvasVideoEditorUseServerExport(editor)) {
        const payload = buildCanvasVideoEditorServerExportPayload(editor);
        try {
          const result = await serverExport(canvasProjectId, payload, {
            idempotencyKey: `canvas.video.export:${canvasProjectId}:${editor.nodeId}:${Date.now()}`,
            signal: controller.signal,
          });
          const artifact = result?.artifact ?? result?.data?.artifact;
          const storageObjectId = text(artifact?.storageObjectId);
          const url = text(artifact?.url || artifact?.sourceUrl || artifact?.previewUrl)
            || (storageObjectId ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?proxy=1` : "");
          if (!url) throw new Error("服务端未返回视频文件");
          downloadCanvasVideoEditorRemoteArtifact({ ...artifact, url }, { title: editor.title });
          editor.exportStatus = "succeeded";
          return true;
        } catch (error) {
          if (Number(error?.status) === 501 || error?.errorCode === "canvas_video_export_storage_unavailable") throw error;
          if (controller.signal.aborted) throw error;
          // Keep the browser encoder as a best-effort fallback for transient API failures.
        }
      }
      const canvas = globalThis.document?.createElement?.("canvas");
      if (!canvas) throw new Error("video_editor_canvas_unavailable");
      canvas.width = 1280;
      canvas.height = 720;
      const mediaCache = new Map();
      const result = await encodeCanvasVideoEditorTimeline({
        canvas,
        clips: editor.clips,
        format,
        signal: controller.signal,
        renderFrame: async ({ canvas: targetCanvas, clip, clipTime, transition }) => {
          const loadClip = async (item) => {
            let media = mediaCache.get(item.id);
            if (media) return media;
            media = globalThis.document.createElement(item.kind === "image" ? "img" : "video");
            media.crossOrigin = "anonymous";
            media.muted = true;
            media.playsInline = true;
            media.src = item.source;
            await waitForMediaReady(media);
            mediaCache.set(item.id, media);
            return media;
          };
          let media = mediaCache.get(clip.id);
          if (!media) media = await loadClip(clip);
          await seekEditorVideo(media, clipTime);
          const context = targetCanvas.getContext("2d");
          context.fillStyle = "#000";
          context.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
          if (transition?.previousClip && transition.progress < 1) {
            const previousMedia = await loadClip(transition.previousClip);
            await seekEditorVideo(previousMedia, transition.previousClipTime);
            drawEditorMedia(context, previousMedia, targetCanvas.width, targetCanvas.height, 1 - transition.progress);
            if (transition.kind === "fade") {
              context.fillStyle = `rgba(0,0,0,${1 - transition.progress})`;
              context.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
            }
            drawEditorMedia(context, media, targetCanvas.width, targetCanvas.height, transition.progress);
          } else drawEditorMedia(context, media, targetCanvas.width, targetCanvas.height);
        },
      });
      downloadCanvasVideoEditorMedia(result, { title: editor.title });
      editor.exportStatus = "succeeded";
    } catch (error) {
      editor.exportStatus = error?.name === "AbortError" ? "canceled" : "failed";
      editor.exportError = error?.name === "AbortError"
        ? ""
        : Number(error?.status) === 501 || error?.errorCode === "canvas_video_export_storage_unavailable"
          ? "当前存储后端暂不支持服务端视频合成，请改用浏览器导出或 JSON 时间线。"
          : (error?.message || "视频导出失败");
    } finally {
      delete editor.exportAbortController;
      void render?.();
    }
    return true;
  };
  const handleAction = (target) => {
    const action = text(target?.dataset?.videoEditorAction);
    if (action === "close") return close();
    if (action === "save") return save();
    if (action === "cancel-export") return cancelExport();
    if (action === "generate-ai-transition") {
      void generateAiTransition(target?.dataset?.clipId);
      return true;
    }
    if (action === "export") {
      void exportTimeline();
      return true;
    }
    if (action === "export-media") {
      void exportMedia();
      return true;
    }
    if (action === "remove-clip") {
      const clipId = text(target?.dataset?.clipId);
      const editor = workbench.ui.canvasVideoEditor;
      if (!editor || !clipId) return false;
      editor.clips = editor.clips.filter((clip) => text(clip.id) !== clipId);
      void render?.();
      return true;
    }
    if (action === "remove-audio-track") {
      const trackId = text(target?.dataset?.audioTrackId);
      const editor = workbench.ui.canvasVideoEditor;
      if (!editor || !trackId) return false;
      editor.audioTracks = (editor.audioTracks ?? []).filter((track) => text(track.id) !== trackId);
      void render?.();
      return true;
    }
    if (action === "move-audio-track") {
      const trackId = text(target?.dataset?.audioTrackId);
      const direction = target?.dataset?.direction === "up" ? -1 : 1;
      const editor = workbench.ui.canvasVideoEditor;
      const index = editor?.audioTracks?.findIndex?.((track) => text(track.id) === trackId) ?? -1;
      const nextIndex = index + direction;
      if (!editor || index < 0 || nextIndex < 0 || nextIndex >= editor.audioTracks.length) return false;
      const next = [...editor.audioTracks];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      editor.audioTracks = next;
      void render?.();
      return true;
    }
    if (action === "move-clip") {
      const clipId = text(target?.dataset?.clipId);
      const direction = target?.dataset?.direction === "up" ? -1 : 1;
      const editor = workbench.ui.canvasVideoEditor;
      const index = editor?.clips?.findIndex?.((clip) => text(clip.id) === clipId) ?? -1;
      const nextIndex = index + direction;
      if (!editor || index < 0 || nextIndex < 0 || nextIndex >= editor.clips.length) return false;
      const next = [...editor.clips];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      editor.clips = next;
      void render?.();
      return true;
    }
    return false;
  };
  const handleChange = (target) => {
    const field = text(target?.dataset?.videoEditorField);
    const clipId = text(target?.dataset?.clipId);
    const editor = workbench.ui.canvasVideoEditor;
    if (!field || !editor) return false;
    if (field === "exportFormat") {
      editor.exportFormat = resolveCanvasVideoEditorExportFormat(target.value);
      return true;
    }
    if (field === "aiTransitionPrompt") {
      editor.aiTransitionPrompt = String(target.value ?? "").slice(0, 500);
      return true;
    }
    if (field === "aiTransitionDuration") {
      editor.aiTransitionDuration = Math.max(1, Math.min(10, number(target.value, 3)));
      return true;
    }
    if (field === "aiTransitionModel") {
      editor.aiTransitionModel = String(target.value ?? "").slice(0, 120);
      return true;
    }
    const audioTrackId = text(target?.dataset?.audioTrackId);
    if (["audioVolume", "audioSourceIn", "audioSourceOut", "audioTimelineIn", "audioFadeIn", "audioFadeOut"].includes(field) && audioTrackId) {
      const track = editor.audioTracks?.find((item) => text(item.id) === audioTrackId);
      if (!track) return false;
      if (field === "audioVolume") track.volume = Math.max(0, Math.min(4, number(target.value, 1)));
      if (field === "audioSourceIn") track.sourceIn = Math.max(0, number(target.value, 0));
      if (field === "audioSourceOut") track.sourceOut = Math.max(number(track.sourceIn, 0), number(target.value, 0));
      if (field === "audioTimelineIn") track.timelineIn = Math.max(0, number(target.value, 0));
      if (field === "audioFadeIn") track.fadeIn = Math.max(0, number(target.value, 0));
      if (field === "audioFadeOut") track.fadeOut = Math.max(0, number(target.value, 0));
      return true;
    }
    if (!clipId) return false;
    const clip = editor.clips.find((item) => text(item.id) === clipId);
    if (!clip) return false;
    const value = Math.max(0, number(target.value, 0));
    if (field === "transitionKind") {
      clip.transitionIn = normalizeCanvasVideoEditorTransition({ ...(clip.transitionIn ?? {}), kind: target.value });
      return true;
    }
    if (field === "transitionDuration") {
      clip.transitionIn = normalizeCanvasVideoEditorTransition({ ...(clip.transitionIn ?? {}), duration: value });
      return true;
    }
    clip[field] = field === "sourceOut" ? Math.max(value, number(clip.sourceIn, 0)) : Math.min(value, number(clip.sourceOut, value));
    return true;
  };
  return { open, close, save, exportTimeline, exportMedia, cancelExport, generateAiTransition, handleAction, handleChange };
}
