const IMAGE_TOOLS = Object.freeze([
  tool("crop", "裁剪", "open", "crop", "mdi:crop"),
  tool("outpaint", "扩图", "open", "outpaint", "mdi:arrow-expand-all"),
  tool("remove-background", "抠图", "open", "remove_background", "mdi:hexagon-outline"),
  tool("camera-studio", "摄影棚", "open", "camera_studio", "mdi:camera-control"),
  tool("batch-grid", "宫格", "open", "batch_grid", "mdi:grid"),
  tool("composite", "合成", "open", "composite", "mdi:layers-triple-outline"),
  tool("annotation", "标注", "open", "annotation", "mdi:draw-pen"),
]);

const VIDEO_TOOLS = Object.freeze([
  tool("capture-frame", "截帧", "capture-canvas-video-frame", null, "mdi:camera-outline"),
  tool("fullscreen", "全屏", "toggle-canvas-video-fullscreen", null, "mdi:fullscreen"),
]);

const AUDIO_TOOLS = Object.freeze([
  tool("transcription", "转录", "set-canvas-audio-generation-mode", "transcription", "mdi:text-box-search-outline"),
  tool("toggle-play", "播放", "toggle-canvas-audio-play", null, "mdi:play-pause"),
]);

export const CANVAS_NODE_TOOLBAR_MANIFEST = Object.freeze({
  image: IMAGE_TOOLS,
  video: VIDEO_TOOLS,
  audio: AUDIO_TOOLS,
});

const NODE_MEDIA_KINDS = Object.freeze({
  image: "image",
  send: "image",
  "ai-image": "image",
  "ai-animation": "image",
  "ai-panorama": "image",
  "ai-storyboard": "image",
  "source-image": "image",
  video: "video",
  "ai-video": "video",
  "source-video": "video",
  audio: "audio",
  "ai-audio": "audio",
  "source-audio": "audio",
});

export function resolveCanvasNodeToolbarMediaKind(nodeOrType = {}) {
  const node = typeof nodeOrType === "string" ? { type: nodeOrType } : nodeOrType;
  const explicitKind = normalizeMediaKind(node?.data?.mediaKind ?? node?.mediaKind);
  if (explicitKind) return explicitKind;
  return NODE_MEDIA_KINDS[normalizeText(node?.type)] ?? "";
}

export function resolveCanvasNodeToolbarTools(nodeOrType = {}) {
  const mediaKind = resolveCanvasNodeToolbarMediaKind(nodeOrType);
  return CANVAS_NODE_TOOLBAR_MANIFEST[mediaKind] ?? [];
}

function tool(id, label, action, mediaTool, icon) {
  return Object.freeze({ id, label, action, mediaTool, icon });
}

function normalizeMediaKind(value) {
  const normalized = normalizeText(value);
  return Object.hasOwn(CANVAS_NODE_TOOLBAR_MANIFEST, normalized) ? normalized : "";
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}
