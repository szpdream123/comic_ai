import { insertVideoOnCanvas } from "./canvas-elements.js";
import { collectCanvasWorkflowEdges } from "./canvas-workflow-edges.js";
import { updateWorkflowNodeElement } from "./workflow-node-elements.js";

export const DEFAULT_COMPOSITION_SETTINGS = {
  width: 1280,
  height: 720,
  fps: 24,
  imageDurationSeconds: 3,
};

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sourceStorageObjectId(element) {
  return String(
    element?.customData?.resultStorageObjectId
      ?? element?.customData?.storageObjectId
      ?? "",
  ).trim();
}

function sourceTitle(element, index) {
  return String(element?.customData?.title ?? element?.customData?.fileName ?? `片段 ${index + 1}`).trim();
}

export function collectCanvasVideoCompositionClips(elements, nodeId, settings = {}) {
  const scene = Array.isArray(elements) ? elements : [];
  const elementById = new Map(scene.filter((element) => !element?.isDeleted).map((element) => [element.id, element]));
  const durationOverrides = settings.clipDurations && typeof settings.clipDurations === "object"
    ? settings.clipDurations
    : {};
  const imageDurationSeconds = positiveNumber(
    settings.imageDurationSeconds,
    DEFAULT_COMPOSITION_SETTINGS.imageDurationSeconds,
  );
  return collectCanvasWorkflowEdges(scene)
    .filter((edge) => edge.targetNodeId === nodeId && ["image", "video"].includes(edge.data?.kind))
    .map((edge, index) => {
      const element = elementById.get(edge.sourceNodeId);
      const kind = edge.data.kind;
      const defaultDuration = kind === "image"
        ? imageDurationSeconds
        : positiveNumber(element?.customData?.durationSeconds, 5);
      return {
        nodeId: edge.sourceNodeId,
        title: sourceTitle(element, index),
        kind,
        storageObjectId: sourceStorageObjectId(element),
        durationSeconds: positiveNumber(durationOverrides[edge.sourceNodeId], defaultDuration),
      };
    });
}

export function buildCanvasVideoCompositionRequest({ elements, nodeId, canvasProjectId, settings = {} }) {
  const clips = collectCanvasVideoCompositionClips(elements, nodeId, settings);
  const missingArchive = clips.filter((clip) => !clip.storageObjectId);
  return {
    clips,
    missingArchive,
    payload: {
      canvasProjectId: String(canvasProjectId ?? "").trim(),
      nodeId: String(nodeId ?? "").trim(),
      width: Math.round(positiveNumber(settings.width, DEFAULT_COMPOSITION_SETTINGS.width)),
      height: Math.round(positiveNumber(settings.height, DEFAULT_COMPOSITION_SETTINGS.height)),
      fps: Math.round(positiveNumber(settings.fps, DEFAULT_COMPOSITION_SETTINGS.fps)),
      clips: clips.map((clip) => ({ nodeId: clip.nodeId, durationSeconds: clip.durationSeconds })),
    },
  };
}

function compositionError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requestId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? `canvas-video-composition:${globalThis.crypto.randomUUID()}`
    : `canvas-video-composition:${Date.now()}`;
}

function validateCompositionArtifact(value) {
  const artifact = value?.artifact && typeof value.artifact === "object" ? value.artifact : null;
  const url = String(artifact?.url ?? artifact?.storageUrl ?? "").trim();
  const storageObjectId = String(artifact?.storageObjectId ?? "").trim();
  if (!artifact || !url || !storageObjectId || String(artifact.mimeType ?? "video/mp4") !== "video/mp4") {
    throw compositionError("canvas_video_composition_result_invalid", "视频合成已返回，但产物信息不完整，请稍后重试。");
  }
  return { ...artifact, url, storageUrl: String(artifact.storageUrl ?? url).trim() || url, storageObjectId };
}

export function isIndeterminateCanvasVideoCompositionError(error) {
  const code = String(error?.errorCode ?? error?.code ?? "").trim().toLowerCase();
  const message = String(error?.message ?? "").trim().toLowerCase();
  const status = Number(error?.status ?? 0);
  if (code === "canvas_video_composition_result_invalid") return false;
  if (code === "idempotency_processing" || code.includes("idempotency_processing")) return true;
  if ([
    "canvas_video_composition_save_failed",
    "canvas_video_composition_save_conflict",
    "canvas_video_composition_save_pending",
  ].includes(code)) return true;
  if (error?.name === "AbortError" || message === "request_timeout" || message.includes("network")) return true;
  if (!status) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function executeCanvasVideoComposition({
  api,
  nodeId,
  canvasProjectId,
  onCompose,
  onPersist,
}) {
  const node = api?.getSceneElements?.().find((element) => element.id === nodeId && !element.isDeleted);
  if (!api || node?.customData?.type !== "video-composition-node" || typeof onCompose !== "function") {
    throw compositionError("canvas_video_composition_unavailable", "当前画布没有可用的视频合成服务。");
  }
  const built = buildCanvasVideoCompositionRequest({
    elements: api.getSceneElements?.() ?? [],
    nodeId,
    canvasProjectId,
    settings: node.customData,
  });
  if (!built.payload.canvasProjectId) {
    throw compositionError("canvas_video_composition_canvas_unsaved", "请先将画布保存到云端后再合成视频。");
  }
  if (!built.clips.length) {
    throw compositionError("canvas_video_composition_clips_required", "请先连接图片或视频节点。");
  }
  if (built.missingArchive.length) {
    throw compositionError(
      "canvas_video_composition_clip_not_archived",
      `以下片段尚未归档到云端：${built.missingArchive.map((clip) => clip.title).join("、")}`,
    );
  }

  const activeRequestId = node.customData.status === "running"
    ? String(node.customData.compositionRequestId ?? "").trim()
    : "";
  const compositionRequestId = activeRequestId || requestId();
  updateWorkflowNodeElement(api, nodeId, {
    status: "running",
    executionAvailability: "ready",
    compositionRequestId,
    error: "",
  });
  try {
    const saved = await onPersist?.();
    if (!saved) {
      throw compositionError("canvas_video_composition_save_failed", "画布保存失败，请保存成功后再合成。");
    }
    if (saved?.status === "conflict") {
      throw compositionError("canvas_video_composition_save_conflict", "云端版本已更新，请先处理保存冲突后再合成。");
    }
    if (saved?.cloudPending) {
      throw compositionError("canvas_video_composition_save_pending", "画布尚未同步到云端，请联网保存后再合成。");
    }
    const response = await onCompose(built.payload, { idempotencyKey: compositionRequestId });
    const artifact = validateCompositionArtifact(response);
    const resultPatch = {
      status: "completed",
      executionAvailability: "ready",
      resultUrl: artifact.url,
      resultStorageUrl: artifact.storageUrl,
      resultStorageObjectId: artifact.storageObjectId,
      resultMimeType: artifact.mimeType,
      resultWidth: Number(artifact.width) || built.payload.width,
      resultHeight: Number(artifact.height) || built.payload.height,
      resultFps: Number(artifact.fps) || built.payload.fps,
      resultDurationSeconds: Number(artifact.durationSeconds) || built.clips.reduce((total, clip) => total + clip.durationSeconds, 0),
      compositionRequestId: null,
      lastCompositionRequestId: compositionRequestId,
      completedAt: new Date().toISOString(),
      error: "",
      artifactInsertError: "",
    };
    updateWorkflowNodeElement(api, nodeId, resultPatch);
    try {
      await insertVideoOnCanvas(api, {
        ...artifact,
        title: node.customData.title || "合成视频",
        sourceAction: "new-canvas/video-composition",
      });
    } catch (error) {
      updateWorkflowNodeElement(api, nodeId, {
        artifactInsertError: error instanceof Error ? error.message : String(error),
      });
      api.setToast?.({ message: "视频合成已完成，但产物未能插入画布，可从节点预览继续使用。", closable: true });
    }
    await onPersist?.().catch(() => undefined);
    return { artifact, clips: built.clips, compositionRequestId };
  } catch (error) {
    const indeterminate = isIndeterminateCanvasVideoCompositionError(error);
    updateWorkflowNodeElement(api, nodeId, {
      status: indeterminate ? "running" : "failed",
      executionAvailability: "ready",
      compositionRequestId: indeterminate ? compositionRequestId : null,
      error: indeterminate
        ? "合成请求结果尚未确认，请点击恢复合成结果。"
        : error instanceof Error ? error.message : String(error),
    });
    await onPersist?.().catch(() => undefined);
    throw error;
  }
}
