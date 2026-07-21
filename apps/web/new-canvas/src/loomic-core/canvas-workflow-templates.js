import { createCanvasWorkflowConnection } from "./canvas-ports.js";
import { createImageGeneratorElement } from "./image-generator-elements.js";
import { createVideoGeneratorElement } from "./video-generator-elements.js";
import { createWorkflowNodeElement } from "./workflow-node-elements.js";

export const CANVAS_TOOL_CATEGORIES = Object.freeze([
  Object.freeze({ id: "all", label: "全部" }),
  Object.freeze({ id: "image", label: "图像" }),
  Object.freeze({ id: "video", label: "视频" }),
  Object.freeze({ id: "storyboard", label: "分镜" }),
  Object.freeze({ id: "director", label: "导演" }),
  Object.freeze({ id: "audio", label: "音频" }),
]);

export const CANVAS_TOOL_PRESETS = Object.freeze([
  Object.freeze({
    id: "script-to-image",
    title: "脚本生图",
    category: "image",
    categoryLabel: "图像生成",
    description: "把脚本文本连接到图片生成节点。",
    tags: Object.freeze(["脚本", "图片", "文生图"]),
    nodeCount: 2,
    nodes: Object.freeze([
      Object.freeze({ kind: "workflow", type: "script-node", offsetX: 0, offsetY: 20 }),
      Object.freeze({ kind: "image", offsetX: 420, offsetY: 0 }),
    ]),
    connections: Object.freeze([[0, 1]]),
  }),
  Object.freeze({
    id: "script-to-video",
    title: "脚本生视频",
    category: "video",
    categoryLabel: "视频生成",
    description: "把脚本文本连接到视频生成节点。",
    tags: Object.freeze(["脚本", "视频", "文生视频"]),
    nodeCount: 2,
    nodes: Object.freeze([
      Object.freeze({ kind: "workflow", type: "script-node", offsetX: 0, offsetY: 45 }),
      Object.freeze({ kind: "video", offsetX: 420, offsetY: 0 }),
    ]),
    connections: Object.freeze([[0, 1]]),
  }),
  Object.freeze({
    id: "image-to-video",
    title: "图片转视频",
    category: "video",
    categoryLabel: "视频生成",
    description: "先生成关键帧，再以图片驱动视频。",
    tags: Object.freeze(["图片", "视频", "图生视频"]),
    nodeCount: 2,
    nodes: Object.freeze([
      Object.freeze({ kind: "image", offsetX: 0, offsetY: 0 }),
      Object.freeze({ kind: "video", offsetX: 500, offsetY: 65 }),
    ]),
    connections: Object.freeze([[0, 1]]),
  }),
  Object.freeze({
    id: "script-storyboard",
    title: "双镜头分镜",
    category: "storyboard",
    categoryLabel: "分镜创作",
    description: "用同一段脚本并行生成两个分镜画面。",
    tags: Object.freeze(["脚本", "分镜", "双镜头"]),
    nodeCount: 3,
    nodes: Object.freeze([
      Object.freeze({ kind: "workflow", type: "script-node", offsetX: 0, offsetY: 110 }),
      Object.freeze({ kind: "image", offsetX: 420, offsetY: 0 }),
      Object.freeze({ kind: "image", offsetX: 420, offsetY: 440 }),
    ]),
    connections: Object.freeze([[0, 1], [0, 2]]),
  }),
  Object.freeze({
    id: "director-to-image",
    title: "导演构图",
    category: "director",
    categoryLabel: "导演工作流",
    description: "由导演台整理脚本，再输出单镜头画面。",
    tags: Object.freeze(["导演", "构图", "图片"]),
    nodeCount: 3,
    nodes: Object.freeze([
      Object.freeze({ kind: "workflow", type: "script-node", offsetX: 0, offsetY: 20 }),
      Object.freeze({ kind: "workflow", type: "director-node", offsetX: 390, offsetY: 0 }),
      Object.freeze({ kind: "image", offsetX: 830, offsetY: 0 }),
    ]),
    connections: Object.freeze([[0, 1], [1, 2]]),
  }),
  Object.freeze({
    id: "director-storyboard",
    title: "导演双镜头",
    category: "storyboard",
    categoryLabel: "分镜创作",
    description: "导演台拆解脚本，并行生成两个连续镜头。",
    tags: Object.freeze(["导演", "分镜", "双镜头"]),
    nodeCount: 4,
    nodes: Object.freeze([
      Object.freeze({ kind: "workflow", type: "script-node", offsetX: 0, offsetY: 130 }),
      Object.freeze({ kind: "workflow", type: "director-node", offsetX: 380, offsetY: 110 }),
      Object.freeze({ kind: "image", offsetX: 830, offsetY: 0 }),
      Object.freeze({ kind: "image", offsetX: 830, offsetY: 440 }),
    ]),
    connections: Object.freeze([[0, 1], [1, 2], [1, 3]]),
  }),
  Object.freeze({
    id: "shot-to-composition",
    title: "单镜头成片",
    category: "video",
    categoryLabel: "视频成片",
    description: "从脚本、关键帧、视频生成到视频合成完整串联。",
    tags: Object.freeze(["关键帧", "视频", "合成"]),
    nodeCount: 4,
    nodes: Object.freeze([
      Object.freeze({ kind: "workflow", type: "script-node", offsetX: 0, offsetY: 70 }),
      Object.freeze({ kind: "image", offsetX: 390, offsetY: 0 }),
      Object.freeze({ kind: "video", offsetX: 870, offsetY: 65 }),
      Object.freeze({ kind: "workflow", type: "video-composition-node", offsetX: 1360, offsetY: 75 }),
    ]),
    connections: Object.freeze([[0, 1], [1, 2], [2, 3]]),
  }),
  Object.freeze({
    id: "dual-shot-composition",
    title: "双镜头成片",
    category: "storyboard",
    categoryLabel: "分镜成片",
    description: "并行生成两组分镜视频，再汇入视频合成节点。",
    tags: Object.freeze(["双镜头", "视频", "合成"]),
    nodeCount: 6,
    nodes: Object.freeze([
      Object.freeze({ kind: "workflow", type: "script-node", offsetX: 0, offsetY: 270 }),
      Object.freeze({ kind: "image", offsetX: 380, offsetY: 0 }),
      Object.freeze({ kind: "image", offsetX: 380, offsetY: 520 }),
      Object.freeze({ kind: "video", offsetX: 870, offsetY: 45 }),
      Object.freeze({ kind: "video", offsetX: 870, offsetY: 565 }),
      Object.freeze({ kind: "workflow", type: "video-composition-node", offsetX: 1370, offsetY: 285 }),
    ]),
    connections: Object.freeze([[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5]]),
  }),
  Object.freeze({
    id: "script-narration",
    title: "脚本配音",
    category: "audio",
    categoryLabel: "音频生成",
    description: "把脚本文本连接到可配置的语音生成节点。",
    tags: Object.freeze(["脚本", "配音", "音频"]),
    nodeCount: 2,
    nodes: Object.freeze([
      Object.freeze({ kind: "workflow", type: "script-node", offsetX: 0, offsetY: 25 }),
      Object.freeze({ kind: "workflow", type: "audio-node", offsetX: 410, offsetY: 0 }),
    ]),
    connections: Object.freeze([[0, 1]]),
  }),
  Object.freeze({
    id: "director-promo-video",
    title: "导演宣传片",
    category: "director",
    categoryLabel: "导演工作流",
    description: "导演台整理脚本后，完成关键帧、视频和成片链路。",
    tags: Object.freeze(["导演", "宣传片", "合成"]),
    nodeCount: 5,
    nodes: Object.freeze([
      Object.freeze({ kind: "workflow", type: "script-node", offsetX: 0, offsetY: 70 }),
      Object.freeze({ kind: "workflow", type: "director-node", offsetX: 380, offsetY: 50 }),
      Object.freeze({ kind: "image", offsetX: 820, offsetY: 0 }),
      Object.freeze({ kind: "video", offsetX: 1300, offsetY: 65 }),
      Object.freeze({ kind: "workflow", type: "video-composition-node", offsetX: 1790, offsetY: 75 }),
    ]),
    connections: Object.freeze([[0, 1], [1, 2], [2, 3], [3, 4]]),
  }),
]);

export const CANVAS_WORKFLOW_TEMPLATES = CANVAS_TOOL_PRESETS;

export function filterCanvasToolPresets(presets, { query = "", category = "all" } = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  return (Array.isArray(presets) ? presets : []).filter((preset) => {
    if (category !== "all" && preset.category !== category) return false;
    if (!normalizedQuery) return true;
    return [preset.title, preset.description, preset.categoryLabel, ...(preset.tags ?? [])]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function insertCanvasWorkflowTemplate(api, templateId, options = {}) {
  const template = CANVAS_TOOL_PRESETS.find((item) => item.id === templateId);
  if (!api || !template) return { ok: false, reason: "template_not_found", elementIds: [] };

  return insertCanvasWorkflowTopology(api, template, options);
}

export function insertCanvasWorkflowTopology(api, preset, options = {}) {
  const topology = preset?.topology ?? preset;
  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : [];
  const connections = Array.isArray(topology?.connections) ? topology.connections : [];
  if (!api || !nodes.length) return { ok: false, reason: "template_not_found", elementIds: [] };
  if (!connections.every((connection) => (
    Array.isArray(connection)
    && connection.length === 2
    && Number.isInteger(connection[0])
    && Number.isInteger(connection[1])
    && connection[0] >= 0
    && connection[0] < nodes.length
    && connection[1] >= 0
    && connection[1] < nodes.length
  ))) {
    return { ok: false, reason: "template_connection_invalid", elementIds: [] };
  }

  const origin = topologyOrigin(api, nodes, options.anchor);
  const stagingApi = createStagingApi(api);
  const elementIds = nodes.map((node) => createTemplateNode(stagingApi, node, origin)).filter(Boolean);
  if (elementIds.length !== nodes.length) {
    return { ok: false, reason: "template_node_creation_failed", elementIds };
  }

  let elements = stagingApi.getSceneElements();
  for (const [sourceIndex, targetIndex] of connections) {
    const connection = createCanvasWorkflowConnection(elements, elementIds[sourceIndex], elementIds[targetIndex]);
    if (!connection.ok) return { ok: false, reason: connection.reason, elementIds };
    elements = connection.elements;
  }

  api.updateScene({
    elements,
    appState: { selectedElementIds: Object.fromEntries(elementIds.map((id) => [id, true])) },
    captureUpdate: "IMMEDIATELY",
  });
  return { ok: true, template: preset, topology, elementIds, elements };
}

function createStagingApi(api) {
  let elements = [...(api.getSceneElements?.() ?? [])];
  return {
    getSceneElements: () => elements,
    getAppState: () => api.getAppState?.() ?? {},
    updateScene(update = {}) {
      if (Array.isArray(update.elements)) elements = update.elements;
    },
  };
}

function createTemplateNode(api, node, origin) {
  const placement = { x: origin.x + node.offsetX, y: origin.y + node.offsetY };
  let elementId = null;
  if (node.kind === "workflow") {
    const definitionHeight = node.type === "script-node" ? 180 : 200;
    const definitionWidth = node.type === "script-node" ? 320 : 360;
    elementId = createWorkflowNodeElement(api, node.type, {
      anchor: { x: placement.x + definitionWidth / 2, y: placement.y + definitionHeight / 2 },
      captureUpdate: "NEVER",
    });
  } else if (node.kind === "image") {
    elementId = createImageGeneratorElement(api, { placement, captureUpdate: "NEVER" });
  } else if (node.kind === "video") {
    elementId = createVideoGeneratorElement(api, { placement, captureUpdate: "NEVER" });
  }
  if (!elementId) return null;
  const data = node?.data && typeof node.data === "object" && !Array.isArray(node.data) ? node.data : {};
  if (Object.keys(data).length) {
    api.updateScene({
      elements: api.getSceneElements().map((element) => element.id === elementId ? {
        ...element,
        customData: { ...element.customData, ...data },
      } : element),
    });
  }
  return elementId;
}

function topologyNodeSize(node) {
  if (node.kind === "image") return { width: 400, height: 400 };
  if (node.kind === "video") return { width: 480, height: 270 };
  if (node.type === "script-node") return { width: 320, height: 180 };
  if (node.type === "director-node") return { width: 360, height: 220 };
  if (node.type === "audio-node") return { width: 340, height: 190 };
  if (node.type === "video-composition-node") return { width: 380, height: 210 };
  return { width: 360, height: 200 };
}

function topologyBounds(nodes) {
  const placements = nodes.map((node) => ({
    x: Number(node.offsetX) || 0,
    y: Number(node.offsetY) || 0,
    ...topologyNodeSize(node),
  }));
  const minX = Math.min(...placements.map((node) => node.x));
  const minY = Math.min(...placements.map((node) => node.y));
  const maxX = Math.max(...placements.map((node) => node.x + node.width));
  const maxY = Math.max(...placements.map((node) => node.y + node.height));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function topologyOrigin(api, nodes, anchor) {
  const bounds = topologyBounds(nodes);
  if (Number.isFinite(anchor?.x) && Number.isFinite(anchor?.y)) {
    return {
      x: anchor.x - bounds.width / 2 - bounds.minX,
      y: anchor.y - bounds.height / 2 - bounds.minY,
    };
  }
  const appState = api.getAppState?.() ?? {};
  const zoom = Math.max(0.01, Number(appState.zoom?.value ?? appState.zoom) || 1);
  const width = Number(appState.width) || 1200;
  const height = Number(appState.height) || 800;
  const centerY = height / 2 / zoom - (Number(appState.scrollY) || 0);
  const liveNodes = (api.getSceneElements?.() ?? []).filter((element) => element && !element.isDeleted && element.type !== "arrow");
  if (liveNodes.length) {
    const rightEdge = Math.max(...liveNodes.map((element) => (Number(element.x) || 0) + (Number(element.width) || 0)));
    return { x: rightEdge + 80 - bounds.minX, y: centerY - bounds.height / 2 - bounds.minY };
  }
  const centerX = width / 2 / zoom - (Number(appState.scrollX) || 0);
  return { x: centerX - bounds.width / 2 - bounds.minX, y: centerY - bounds.height / 2 - bounds.minY };
}
