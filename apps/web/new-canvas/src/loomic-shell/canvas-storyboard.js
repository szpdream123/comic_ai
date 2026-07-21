import { collectCanvasWorkflowEdges, canvasWorkflowNodeType } from "../loomic-core/canvas-workflow-edges.js";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".ogg"];

function text(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function isVideoUrl(url) {
  try {
    const pathname = new URL(String(url ?? ""), "https://placeholder.invalid").pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
}

function mediaKindFor(element) {
  const nodeType = element?.customData?.type;
  if (nodeType === "script-node" || (element?.type === "text" && !element.containerId)) return "text";
  if (nodeType === "audio-node") return "audio";
  if (nodeType === "video-generator" || nodeType === "video-composition-node") return "video";
  if (nodeType === "image-generator") return "image";
  if (element?.type === "image") return "image";
  if (element?.type === "embeddable" && (element.customData?.isVideo || isVideoUrl(element.link))) return "video";
  return null;
}

function mediaUrlFor(element, files, kind) {
  if (kind === "audio") {
    return text(element.customData?.mediaUrl, element.customData?.storageUrl);
  }
  if (kind === "video") {
    return text(element.link, element.customData?.resultUrl, element.customData?.storageUrl, element.customData?.previewUrl);
  }
  return text(
    element.customData?.resultUrl,
    element.customData?.storageUrl,
    element.fileId ? files?.[element.fileId]?.dataURL : "",
    element.customData?.previewUrl,
  );
}

function titleFor(element, kind, index) {
  return text(
    element.customData?.title,
    element.customData?.prompt,
    element.customData?.text,
    element.text,
    kind === "video" ? `视频镜头 ${index + 1}` : kind === "audio" ? `音频 ${index + 1}` : `图片镜头 ${index + 1}`,
  );
}

function generatorDetails(element, mediaKind, mediaUrl, status) {
  const data = element?.customData ?? {};
  const isGenerator = ["image-generator", "video-generator"].includes(data.type);
  if (!isGenerator) return {};
  const prompt = text(data.prompt);
  const normalizedStatus = text(status).toLowerCase();
  const canGenerate = Boolean(prompt) && (
    ["failed", "canceled", "cancelled"].includes(normalizedStatus)
    || data.inputUpdated === true
    || (!mediaUrl && ["", "idle", "pending"].includes(normalizedStatus))
  );
  return {
    isGenerator,
    prompt,
    model: text(data.model, "未配置"),
    aspectRatio: text(data.aspectRatio, mediaKind === "video" ? "16:9" : "1:1"),
    duration: mediaKind === "video" ? Number(data.duration) || 5 : undefined,
    resolution: mediaKind === "video" ? text(data.resolution, "720p") : undefined,
    quality: mediaKind === "image" ? text(data.quality, "standard") : undefined,
    referenceImageCount: Array.isArray(data.inputImages) ? data.inputImages.length : 0,
    error: text(data.error),
    inputUpdated: data.inputUpdated === true,
    authRequired: data.authRequired === true,
    pollingDetached: data.pollingDetached === true,
    canGenerate,
  };
}

export function resolveCanvasStoryboardGenerationState(item = {}, localRunning = false) {
  const status = text(item.status).toLowerCase();
  const running = Boolean(localRunning || status === "running");
  if (running) {
    if (item.authRequired) return { running, statusLabel: "等待登录恢复", action: "running", actionLabel: "等待登录…" };
    if (item.pollingDetached) return { running, statusLabel: "等待恢复结果", action: "running", actionLabel: "恢复中…" };
    return { running, statusLabel: "正在生成", action: "running", actionLabel: "生成中…" };
  }
  if (item.inputUpdated) return { running, statusLabel: "输入已更新", action: "update", actionLabel: "更新生成" };
  if (status === "failed") return { running, statusLabel: "生成失败", action: "retry", actionLabel: "重试" };
  if (["canceled", "cancelled"].includes(status)) return { running, statusLabel: "生成已取消", action: "retry", actionLabel: "重新生成" };
  if (item.mediaUrl) return { running, statusLabel: "产物可用", action: "ready", actionLabel: "" };
  return { running, statusLabel: "等待生成", action: "confirm", actionLabel: "确认生成" };
}

export function buildCanvasStoryboardItems(elements = [], files = {}) {
  const liveElements = elements.filter((element) => element && !element.isDeleted);
  const elementById = new Map(liveElements.map((element) => [element.id, element]));
  const referencesByTarget = new Map();
  for (const edge of collectCanvasWorkflowEdges(liveElements)) {
    const source = elementById.get(edge.sourceNodeId);
    if (!source || !elementById.has(edge.targetNodeId)) continue;
    const references = referencesByTarget.get(edge.targetNodeId) ?? [];
    references.push({
      id: source.id,
      title: text(source.customData?.title, source.customData?.prompt, source.text, source.type),
      type: canvasWorkflowNodeType(source),
      portKind: text(edge.data?.kind),
    });
    referencesByTarget.set(edge.targetNodeId, references);
  }
  return elements
    .flatMap((element, sceneIndex) => {
      if (!element || element.isDeleted) return [];
      const mediaKind = mediaKindFor(element);
      if (!mediaKind) return [];
      const mediaUrl = mediaUrlFor(element, files, mediaKind);
      const explicitOrder = Number(element.customData?.storyboardOrder);
      const status = text(element.customData?.status, mediaUrl ? "ready" : "pending").toLowerCase();
      return [{
        id: element.id,
        element,
        mediaKind,
        mediaUrl,
        title: titleFor(element, mediaKind, sceneIndex),
        status,
        sourceType: text(element.customData?.type, element.type),
        order: Number.isFinite(explicitOrder) ? explicitOrder : sceneIndex,
        sceneIndex,
        references: referencesByTarget.get(element.id) ?? [],
        ...generatorDetails(element, mediaKind, mediaUrl, status),
      }];
    })
    .sort((left, right) => left.order - right.order || left.sceneIndex - right.sceneIndex)
    .map((item, index) => ({ ...item, position: index + 1 }));
}

export function filterCanvasStoryboardItems(items = [], filter = "all") {
  if (["text", "image", "video", "audio"].includes(filter)) return items.filter((item) => item.mediaKind === filter);
  if (filter === "pending") return items.filter((item) => item.isGenerator && (item.canGenerate || item.status === "running"));
  return items;
}

const KEY_ELEMENT_CATEGORIES = new Set(["character", "scene", "prop"]);

export function buildCanvasStoryboardKeyElements(elements = [], files = {}) {
  return elements.flatMap((element) => {
    if (!element || element.isDeleted) return [];
    const category = text(element.customData?.resourceCategory).toLowerCase();
    if (!KEY_ELEMENT_CATEGORIES.has(category)) return [];
    return [{
      id: element.id,
      element,
      category,
      title: text(element.customData?.title, element.customData?.resourceFolder, "未命名元素"),
      description: text(element.customData?.resourcePrompt),
      mediaUrl: mediaUrlFor(element, files, "image"),
    }];
  });
}

export function updateCanvasStoryboardKeyElement(elements = [], id, updates = {}) {
  const title = String(updates.title ?? "").trim().slice(0, 200);
  const description = String(updates.description ?? "").trim().slice(0, 2000);
  let changed = false;
  const next = elements.map((element) => {
    if (element?.id !== id || element.isDeleted) return element;
    const customData = {
      ...element.customData,
      ...(title ? { title } : {}),
      resourcePrompt: description,
    };
    if (customData.title === element.customData?.title && customData.resourcePrompt === element.customData?.resourcePrompt) return element;
    changed = true;
    return touch(element, customData);
  });
  return changed ? next : elements;
}

function touch(element, customData) {
  return {
    ...element,
    customData,
    version: (Number(element.version) || 0) + 1,
    versionNonce: Math.floor(Math.random() * 2_000_000_000),
    updated: Date.now(),
  };
}

export function applyCanvasStoryboardOrder(elements = [], orderedIds = []) {
  const orderById = new Map(orderedIds.map((id, index) => [id, index]));
  let changed = false;
  const next = elements.map((element) => {
    const order = orderById.get(element?.id);
    if (order === undefined || element.isDeleted) return element;
    if (element.customData?.storyboardOrder === order) return element;
    changed = true;
    return touch(element, { ...element.customData, storyboardOrder: order });
  });
  return changed ? next : elements;
}

export function reorderCanvasStoryboardIds(items = [], activeId, targetId) {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  return ids;
}

export function moveCanvasStoryboardId(items = [], activeId, direction) {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(activeId);
  const to = direction === "backward" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}
