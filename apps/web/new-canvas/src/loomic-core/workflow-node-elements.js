import { findCanvasPlacement, generateCanvasId } from "./canvas-elements.js";
import { deleteCanvasLayers } from "./canvas-layer-operations.js";

export const WORKFLOW_NODE_DEFINITIONS = {
  "director-node": {
    nodeType: "director",
    title: "导演台",
    description: "组织资源并输出导演指令",
    availability: "ready",
    availabilityLabel: "可执行",
    unavailableReason: "输入导演要求或连接上游素材后可生成导演指令。",
    editorLabel: "导演指令",
    textField: "instructions",
    width: 360,
    height: 220,
    strokeColor: "#647a70",
    backgroundColor: "#edf2ef",
  },
  "script-node": {
    nodeType: "script",
    title: "脚本",
    description: "编写可连接到生成节点的脚本文本",
    availability: "ready",
    availabilityLabel: "可连接",
    unavailableReason: "脚本节点是文本输入源，无需单独运行。",
    editorLabel: "脚本内容",
    textField: "text",
    width: 320,
    height: 180,
    strokeColor: "#7a6f5f",
    backgroundColor: "#f2f0eb",
  },
  "audio-node": {
    nodeType: "audio",
    title: "音频",
    description: "接收文本并输出音频",
    availability: "unavailable",
    availabilityLabel: "暂不可执行",
    unavailableReason: "后台配置音频模型后可执行真实语音生成。",
    editorLabel: "文本",
    textField: "prompt",
    width: 340,
    height: 190,
    strokeColor: "#856b72",
    backgroundColor: "#f3edef",
    mediaKind: "audio",
  },
  "video-composition-node": {
    nodeType: "output",
    title: "视频合成",
    description: "按连接顺序合成已归档图片和视频",
    availability: "ready",
    availabilityLabel: "可执行",
    unavailableReason: "连接图片或视频节点后可执行合成。",
    width: 380,
    height: 210,
    strokeColor: "#6d7480",
    backgroundColor: "#eef0f3",
    mediaKind: "video",
  },
};

export const WORKFLOW_NODE_MENU_TYPES = [
  "video-composition-node",
  "director-node",
  "audio-node",
  "script-node",
];

export function getWorkflowNodeDefinition(value) {
  const type = typeof value === "string" ? value : value?.customData?.type;
  return WORKFLOW_NODE_DEFINITIONS[type] ?? null;
}

export function workflowNodeAvailabilityLabel(value, options = {}) {
  const definition = getWorkflowNodeDefinition(value);
  if (!definition) return "";
  const data = value?.customData && typeof value.customData === "object" ? value.customData : value ?? {};
  if (data.type === "director-node") {
    if (data.directorReplayPending) return "待恢复";
    if (data.inputUpdated) return "待更新";
    return {
      running: "运行中",
      failed: "失败",
      completed: "已完成",
    }[data.status] ?? definition.availabilityLabel;
  }
  if (data.type === "video-composition-node") {
    if (data.inputUpdated) return "待更新";
    return {
      running: "合成中",
      failed: "失败",
      completed: "已完成",
    }[data.status] ?? definition.availabilityLabel;
  }
  if (data.type !== "audio-node") return definition.availabilityLabel;
  if (data.sourceKind === "generated") return "已生成";
  if (data.sourceKind === "upload") return "已上传";
  const statusLabels = {
    running: "生成中",
    failed: "失败",
    completed: "已完成",
    canceled: "已取消",
  };
  return statusLabels[data.status] ?? (options.audioReady ? "可执行" : definition.availabilityLabel);
}

export function isWorkflowNodeElement(element) {
  return Boolean(getWorkflowNodeDefinition(element));
}

export function getWorkflowNodeData(element) {
  if (!isWorkflowNodeElement(element)) return null;
  return element.customData;
}

export function createWorkflowNodeElement(api, type, options = {}) {
  const definition = getWorkflowNodeDefinition(type);
  if (!api || !definition) return null;
  const id = generateCanvasId();
  const placement = Number.isFinite(options.anchor?.x) && Number.isFinite(options.anchor?.y)
    ? { x: options.anchor.x - definition.width / 2, y: options.anchor.y - definition.height / 2 }
    : findCanvasPlacement(api, definition.width, definition.height);
  const textField = definition.textField;
  const element = {
    type: "rectangle",
    id,
    ...placement,
    width: definition.width,
    height: definition.height,
    angle: 0,
    strokeColor: definition.strokeColor,
    backgroundColor: definition.backgroundColor,
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: { type: 3 },
    boundElements: null,
    frameId: null,
    index: null,
    seed: randomInteger(),
    version: 1,
    versionNonce: randomInteger(),
    isDeleted: false,
    updated: Date.now(),
    link: null,
    locked: false,
    customData: {
      type,
      workflowNodeType: definition.nodeType,
      title: String(options.title ?? definition.title),
      status: definition.availability === "ready" ? "ready" : "unavailable",
      executionAvailability: definition.availability,
      ...(definition.mediaKind ? { mediaKind: definition.mediaKind } : {}),
      ...(type === "video-composition-node" ? {
        width: 1280,
        height: 720,
        fps: 24,
        imageDurationSeconds: 3,
        clipDurations: {},
      } : {}),
      ...(type === "audio-node" ? {
        parameters: {
          voice: "longxiaochun_v2",
          format: "mp3",
          sampleRate: 22050,
          rate: 1,
          pitch: 1,
          volume: 50,
        },
      } : {}),
      ...(textField ? { [textField]: String(options[textField] ?? "") } : {}),
    },
  };
  api.updateScene({
    elements: [...(api.getSceneElements?.() ?? []), element],
    captureUpdate: options.captureUpdate ?? "IMMEDIATELY",
  });
  return id;
}

export function updateWorkflowNodeElement(api, elementId, updates = {}) {
  if (!api || !elementId) return;
  const elements = (api.getSceneElements?.() ?? []).map((element) => {
    if (element.id !== elementId || !isWorkflowNodeElement(element)) return element;
    return {
      ...element,
      customData: { ...element.customData, ...updates },
      version: (element.version ?? 1) + 1,
      versionNonce: randomInteger(),
      updated: Date.now(),
    };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

export function createUploadedAudioNodeElement(api, options = {}) {
  const id = createWorkflowNodeElement(api, "audio-node", {
    title: options.title,
    prompt: options.prompt ?? options.notes ?? "",
    ...(options.anchor ? { anchor: options.anchor } : {}),
  });
  if (!id) return null;
  updateWorkflowNodeElement(api, id, {
    status: "completed",
    executionAvailability: "ready",
    sourceKind: options.sourceKind ?? "upload",
    source: options.source ?? "uploaded",
    title: String(options.title ?? "上传音频"),
    fileName: String(options.fileName ?? options.title ?? "上传音频"),
    mediaKind: "audio",
    mediaUrl: String(options.mediaUrl ?? ""),
    mimeType: String(options.mimeType ?? "audio/mpeg"),
    durationSeconds: Number(options.durationSeconds) || undefined,
    cloudArchiveStatus: options.cloudArchiveStatus ?? "local-only",
    ...(options.storageUrl ? { storageUrl: options.storageUrl } : {}),
    ...(options.storageObjectId ? { storageObjectId: options.storageObjectId } : {}),
    ...(options.uploadSessionId ? { uploadSessionId: options.uploadSessionId } : {}),
    ...(options.sourceAction ? { sourceAction: options.sourceAction } : {}),
    ...(options.notes ? { notes: String(options.notes) } : {}),
  });
  return id;
}

export function deleteWorkflowNodeElement(api, elementId) {
  if (!api || !elementId) return;
  const elements = deleteCanvasLayers(api.getSceneElements?.() ?? [], [elementId]);
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

function randomInteger() {
  return Math.floor(Math.random() * 2_000_000_000);
}
