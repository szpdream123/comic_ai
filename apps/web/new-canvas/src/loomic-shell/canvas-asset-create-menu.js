import { createTextNodeElement } from "../loomic-core/canvas-elements.js";
import { createImageGeneratorElement } from "../loomic-core/image-generator-elements.js";
import { createVideoGeneratorElement } from "../loomic-core/video-generator-elements.js";
import { createWorkflowNodeElement } from "../loomic-core/workflow-node-elements.js";

const NODE_ACTION_TYPES = {
  text: "text-node",
  image: "image-generator",
  video: "video-generator",
  "video-composition": "video-composition-node",
  director: "director-node",
  audio: "audio-node",
  script: "script-node",
};

export function resolveCanvasAssetCreateMenuIndex(key, currentIndex, itemCount) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowDown") return currentIndex < 0 ? 0 : (currentIndex + 1) % itemCount;
  if (key === "ArrowUp") return currentIndex < 0 ? itemCount - 1 : (currentIndex - 1 + itemCount) % itemCount;
  return null;
}

export function resolveCanvasAssetCreateMenuKeyAction({ key, shiftKey = false, currentIndex = -1, itemCount = 0 } = {}) {
  if (key === "Escape") return { handled: true, close: true, focus: "trigger" };
  if (key === "Tab") return { handled: true, close: true, focus: shiftKey ? "batch" : "search" };
  const nextIndex = resolveCanvasAssetCreateMenuIndex(key, currentIndex, itemCount);
  return nextIndex === null
    ? { handled: false }
    : { handled: true, close: false, nextIndex };
}

export function canvasAssetCreateMenuSections() {
  return [
    {
      label: "添加节点",
      items: [
        { id: "text", label: "文本", nodeType: "text-node" },
        { id: "image", label: "图片", nodeType: "image-generator" },
        { id: "video", label: "视频", nodeType: "video-generator" },
        { id: "video-composition", label: "视频合成", nodeType: "video-composition-node" },
        { id: "director", label: "导演台", nodeType: "director-node" },
        { id: "audio", label: "音频", nodeType: "audio-node" },
        { id: "script", label: "脚本", nodeType: "script-node" },
        { id: "library", label: "素材库", view: "assets" },
      ],
    },
    {
      label: "添加资源",
      items: [
        { id: "upload", label: "上传", action: "upload" },
        { id: "history", label: "从生成历史选择", view: "history" },
      ],
    },
  ];
}

export function insertCanvasAssetCreateNode(api, actionId) {
  const nodeType = NODE_ACTION_TYPES[actionId];
  if (!nodeType) return { ok: false, reason: "unsupported_action" };
  if (typeof api?.getSceneElements !== "function" || typeof api?.updateScene !== "function") {
    return { ok: false, reason: "canvas_unavailable" };
  }

  let elementId = null;
  if (actionId === "text") elementId = createTextNodeElement(api);
  else if (actionId === "image") elementId = createImageGeneratorElement(api);
  else if (actionId === "video") elementId = createVideoGeneratorElement(api, { aspectRatio: "16:9" });
  else elementId = createWorkflowNodeElement(api, nodeType);
  if (!elementId) return { ok: false, reason: "node_creation_failed" };

  api.updateScene({ appState: { selectedElementIds: { [elementId]: true } } });
  return { ok: true, elementId, nodeType };
}
