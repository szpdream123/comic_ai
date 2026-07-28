import { CANVAS_NODE_SIZES, findCanvasPort } from "./canvas-default-document.js";
import { validateCanvasConnection } from "./canvas-edge-rules.js";
import { resolveCanvasPromptReferences } from "./canvas-prompt-reference.js";
import {
  buildCanvasAnimationSpritePrompt,
  normalizeCanvasAnimationState,
  resolveCanvasAnimationArtifactPatch,
  resolveCanvasAnimationSheetAspectRatio,
} from "./canvas-animation-node.js";
import { resolveCanvasMediaArtifactPatch } from "./canvas-media-node.js";

const MODEL_MODE_BY_MEDIA_KIND = {
  image: new Set([
    "image",
    "single-image",
    "single_image",
    "multi-image",
    "multi_image",
    "text-image",
    "text-to-image",
    "text_to_image",
    "image-image",
    "image-to-image",
    "image_to_image",
    "multi-reference",
    "multi_reference",
    "image-generation",
    "image_generation",
    "image-generate",
    "image_generate",
    "image-edit",
    "image_edit",
    "image-reference",
    "image-reference-generate",
    "image_reference_generate",
  ]),
  video: new Set([
    "video",
    "first-frame",
    "first_frame",
    "first-last-frame",
    "first_last_frame",
    "reference-video",
    "reference_video",
    "edit-video",
    "edit_video",
    "image-to-video",
    "image_to_video",
    "video-image",
    "video-first-frame",
    "video-reference",
    "video-image-to-video",
    "video_image_to_video",
    "video-reference-image-to-video",
    "video_reference_image_to_video",
    "video-first-last-frame",
    "video_first_last_frame",
    "video-edit",
    "video_edit",
  ]),
  audio: new Set(["audio", "voice", "lip-sync", "tts", "text-to-speech", "text_to_speech", "music", "music-generation", "music_generation", "transcription", "speech-to-text", "speech_to_text"]),
  text: new Set(["text", "script", "storyboard", "text-generation"]),
};

const NODE_PORTS = {
  script: {
    inputs: [],
    outputs: [{ id: "out_text", kind: "text", label: "文本" }],
  },
  send: {
    inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image"], label: "文本/图片" }],
    outputs: [{ id: "out_image", kind: "image", label: "图片" }],
  },
  image: {
    inputs: [{ id: "in_image", kind: "image", accepts: ["text", "image"], label: "文本/图片" }],
    outputs: [{ id: "out_image", kind: "image", label: "图片" }],
  },
  video: {
    inputs: [{ id: "in_image", kind: "image", accepts: ["text", "image", "video", "audio"], label: "文本/图片/视频/音频" }],
    outputs: [{ id: "out_video", kind: "video", label: "视频" }],
  },
  audio: {
    inputs: [{ id: "in_text", kind: "text", label: "文本" }],
    outputs: [{ id: "out_audio", kind: "audio", label: "音频" }],
  },
  upload: {
    inputs: [],
    outputs: [{ id: "out_image", kind: "image", label: "图片" }],
  },
  director: {
    inputs: [{ id: "in_any", kind: "any", label: "资源" }],
    outputs: [{ id: "out_text", kind: "text", label: "指令" }],
  },
  output: {
    inputs: [{ id: "in_any", kind: "any", label: "资源" }],
    outputs: [],
  },
  markdown: {
    inputs: [],
    outputs: [{ id: "out_text", kind: "text", label: "Markdown" }],
  },
  comment: { inputs: [], outputs: [] },
  group: {
    inputs: [{ id: "in_any", kind: "any", label: "输入" }],
    outputs: [{ id: "out_any", kind: "any", label: "输出" }],
  },
  "ai-text": {
    inputs: [{ id: "in_text", kind: "text", label: "文本" }],
    outputs: [{ id: "out_text", kind: "text", label: "文本" }],
  },
  "ai-image": {
    inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image"], label: "文本/图片" }],
    outputs: [{ id: "out_image", kind: "image", label: "图片" }],
  },
  "ai-video": {
    inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image", "video", "audio"], label: "素材" }],
    outputs: [{ id: "out_video", kind: "video", label: "视频" }],
  },
  "ai-audio": {
    inputs: [{ id: "in_text", kind: "text", label: "文本" }],
    outputs: [{ id: "out_audio", kind: "audio", label: "音频" }],
  },
  "ai-animation": {
    inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image"], label: "文本/图片" }],
    outputs: [{ id: "out_image", kind: "image", label: "Sprite Sheet" }],
  },
  "ai-panorama": {
    inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image"], label: "文本/图片" }],
    outputs: [{ id: "out_image", kind: "image", label: "全景图" }],
  },
  "ai-markdown": {
    inputs: [{ id: "in_text", kind: "text", label: "文本" }],
    outputs: [{ id: "out_text", kind: "text", label: "Markdown" }],
  },
  "ai-storyboard": {
    inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image"], label: "文本/图片" }],
    outputs: [{ id: "out_text", kind: "text", label: "分镜" }],
  },
  "ai-director": {
    inputs: [{ id: "in_any", kind: "any", label: "资源" }],
    outputs: [{ id: "out_text", kind: "text", label: "导演指令" }],
  },
  "source-text": { inputs: [], outputs: [{ id: "out_text", kind: "text", label: "文本" }] },
  "source-image": { inputs: [], outputs: [{ id: "out_image", kind: "image", label: "图片" }] },
  "source-video": { inputs: [], outputs: [{ id: "out_video", kind: "video", label: "视频" }] },
  "source-audio": { inputs: [], outputs: [{ id: "out_audio", kind: "audio", label: "音频" }] },
};

const NODE_TITLES = {
  script: "剧本源",
  send: "图片生成",
  image: "图片结果",
  video: "视频生成",
  audio: "音频结果",
  upload: "上传",
  director: "文本源",
  output: "输出",
  markdown: "Markdown",
  comment: "评论",
  group: "分组",
  "ai-text": "AI 文本",
  "ai-image": "AI 图片",
  "ai-video": "AI 视频",
  "ai-audio": "AI 音频",
  "ai-animation": "AI 动画",
  "ai-panorama": "AI 全景",
  "ai-markdown": "AI Markdown",
  "ai-storyboard": "AI 分镜",
  "ai-director": "AI 导演",
  "source-text": "文本源",
  "source-image": "图片源",
  "source-video": "视频源",
  "source-audio": "音频源",
};

const CANVAS_NODE_TEMPLATES = [
  {
    id: "template-ai-text", group: "AI", type: "ai-text", title: "AI 文本", description: "生成或改写文本",
    defaultData: { title: "AI 文本", status: "ready", mediaKind: "text", prompt: "" },
  },
  {
    id: "template-ai-image", group: "AI", type: "ai-image", title: "AI 图片", description: "生成或编辑图片",
    mediaKind: "image", defaultData: { title: "AI 图片", status: "ready", mediaKind: "image", prompt: "" },
  },
  {
    id: "template-ai-video", group: "AI", type: "ai-video", title: "AI 视频", description: "生成或编辑视频",
    mediaKind: "video", defaultData: { title: "AI 视频", status: "ready", mediaKind: "video", prompt: "" },
  },
  {
    id: "template-ai-audio", group: "AI", type: "ai-audio", title: "AI 音频", description: "生成语音或音效",
    mediaKind: "audio", defaultData: { title: "AI 音频", status: "ready", mediaKind: "audio", prompt: "" },
  },
  {
    id: "template-ai-animation", group: "AI", type: "ai-animation", title: "AI 动画", description: "生成逐帧 Sprite Sheet",
    mediaKind: "image", defaultData: {
      title: "AI 动画", status: "ready", mediaKind: "image", prompt: "",
      animationAction: "idle", animationFrames: 8, animationPreviewMode: "playing",
    },
  },
  {
    id: "template-ai-panorama", group: "AI", type: "ai-panorama", title: "AI 全景", description: "生成全景画面",
    mediaKind: "image", defaultData: { title: "AI 全景", status: "ready", mediaKind: "image", prompt: "" },
  },
  {
    id: "template-ai-markdown", group: "AI", type: "ai-markdown", title: "AI Markdown", description: "生成结构化文档",
    defaultData: { title: "AI Markdown", status: "ready", mediaKind: "text", text: "", prompt: "" },
  },
  {
    id: "template-ai-storyboard", group: "AI", type: "ai-storyboard", title: "AI 分镜", description: "规划镜头与场次",
    mediaKind: "image", defaultData: { title: "AI 分镜", status: "ready", mediaKind: "image", text: "", prompt: "" },
  },
  {
    id: "template-ai-director", group: "AI", type: "ai-director", title: "AI 导演", description: "分析并编排画布",
    defaultData: { title: "AI 导演", status: "ready", mediaKind: "text", text: "", prompt: "" },
  },
  {
    id: "template-source-text", group: "来源", type: "source-text", title: "文本源", description: "添加文本来源",
    defaultData: { title: "文本源", status: "ready", mediaKind: "text", text: "", source: "manual" },
  },
  {
    id: "template-source-image", group: "来源", type: "source-image", title: "图片源", description: "上传或引用图片",
    defaultData: { title: "图片源", status: "empty", mediaKind: "image", source: "upload" },
  },
  {
    id: "template-source-video", group: "来源", type: "source-video", title: "视频源", description: "上传或引用视频",
    defaultData: { title: "视频源", status: "empty", mediaKind: "video", source: "upload" },
  },
  {
    id: "template-source-audio", group: "来源", type: "source-audio", title: "音频源", description: "上传或引用音频",
    defaultData: { title: "音频源", status: "empty", mediaKind: "audio", source: "upload" },
  },
  {
    id: "template-script",
    group: "节点",
    type: "script",
    title: "文本",
    description: "添加文本输入节点",
    defaultData: {
      title: "文本",
      text: "",
      source: "manual",
    },
  },
  {
    id: "template-send-image",
    group: "节点",
    type: "send",
    title: "图片",
    description: "添加图片生成节点",
    mediaKind: "image",
    defaultData: {
      title: "图片",
      status: "ready",
      mediaKind: "image",
      prompt: "",
    },
  },
  {
    id: "template-video-result",
    group: "节点",
    type: "video",
    title: "视频",
    description: "添加视频生成节点",
    defaultData: {
      title: "视频",
      status: "empty",
      mediaKind: "video",
    },
  },
  {
    id: "template-upload",
    group: "节点",
    type: "upload",
    title: "上传",
    description: "添加上传资源节点",
    defaultData: {
      title: "上传",
      status: "empty",
      source: "upload",
    },
  },
  {
    id: "template-audio",
    group: "节点",
    type: "audio",
    title: "音频",
    description: "添加音频结果节点",
    defaultData: { title: "音频", status: "empty", mediaKind: "audio" },
  },
  {
    id: "template-markdown",
    group: "文档",
    type: "markdown",
    title: "Markdown",
    description: "添加结构化说明节点",
    defaultData: { title: "Markdown", text: "", textHtml: "", source: "manual" },
  },
  {
    id: "template-comment",
    group: "文档",
    type: "comment",
    title: "评论",
    description: "添加画布批注",
    defaultData: { title: "评论", text: "", source: "manual" },
  },
  {
    id: "template-group",
    group: "编排",
    type: "group",
    title: "分组",
    description: "组织一组相关节点",
    defaultData: { title: "分组", color: "#22c55e", childNodeIds: [], source: "manual" },
  },
];

export function resolveCanvasNodeTemplates(generationConfig = {}) {
  const imageModel = resolveCanvasModelOptions(generationConfig, "image")[0]?.modelCode ?? "";
  const videoModel = resolveCanvasModelOptions(generationConfig, "video")[0]?.modelCode ?? "";
  return CANVAS_NODE_TEMPLATES.map((template) => {
    const defaultData = clone(template.defaultData ?? {});
    if (["send", "ai-image", "ai-animation", "ai-panorama"].includes(template.type) && imageModel) {
      defaultData.modelCode = imageModel;
    }
    if (["video", "ai-video"].includes(template.type) && videoModel) {
      defaultData.modelCode = videoModel;
    }
    return {
      ...clone(template),
      defaultData,
    };
  });
}

export function resolveCompatibleCanvasNodeTemplates(document, connection = {}, generationConfig = {}) {
  const sourceNode = safeArray(document?.nodes).find((node) => node.id === connection.sourceNodeId);
  const sourcePort = findCanvasPort(sourceNode, connection.sourcePortId);
  if (!sourcePort || sourcePort.direction !== "out") return [];
  return resolveCanvasNodeTemplates(generationConfig).filter((template) => {
    const candidate = createCanvasNodeFromTemplate(document, template);
    return safeArray(candidate.data?.ports?.inputs).some((port) => (
      validateCanvasConnection(sourcePort, { ...port, direction: "in" }).ok
    ));
  });
}

export function addConnectedCanvasNode(document, input = {}) {
  const sourceNode = safeArray(document?.nodes).find((node) => node.id === input.sourceNodeId);
  const sourcePort = findCanvasPort(sourceNode, input.sourcePortId);
  if (!sourcePort || sourcePort.direction !== "out") {
    return { ok: false, reason: "canvas_connection_port_missing", document: clone(document) };
  }
  const nextDocument = addCanvasNode(document, input);
  const node = nextDocument.nodes.at(-1);
  const targetPort = safeArray(node?.data?.ports?.inputs).find((port) => (
    validateCanvasConnection(sourcePort, { ...port, direction: "in" }).ok
  ));
  if (!node || !targetPort) {
    return { ok: false, reason: "canvas_connection_kind_mismatch", document: clone(document) };
  }
  return connectCanvasNodes(nextDocument, {
    sourceNodeId: input.sourceNodeId,
    sourcePortId: input.sourcePortId,
    targetNodeId: node.id,
    targetPortId: targetPort.id,
  });
}

export function applyCanvasSettingsToTemplate(template = {}, settingsRecord = null) {
  const settings = settingsRecord?.settings ?? settingsRecord ?? {};
  const generation = settings?.generation ?? {};
  const defaultModels = settings?.defaultModels ?? {};
  const defaultData = clone(template.defaultData ?? {});
  const type = normalizeNodeType(template.type);
  const mediaKind = String(
    defaultData.mediaKind ?? (
      ["send", "image", "ai-image", "ai-animation", "ai-panorama"].includes(type) ? "image"
        : ["video", "ai-video"].includes(type) ? "video"
          : ["audio", "ai-audio"].includes(type) ? "audio"
            : ["ai-text", "ai-markdown", "ai-storyboard", "ai-director"].includes(type) ? "text"
              : ""
    ),
  );
  if (!mediaKind || type.startsWith("source-") || type === "upload") {
    return { ...clone(template), defaultData };
  }
  const modelCode = String(defaultModels?.[mediaKind] ?? "").trim();
  const parameterValues = {
    ...(defaultData.parameterValues && typeof defaultData.parameterValues === "object"
      ? clone(defaultData.parameterValues)
      : {}),
  };
  if (mediaKind === "image") {
    if (generation.imageFollowNode === true) {
      return {
        ...clone(template),
        defaultData: {
          ...defaultData,
          ...(modelCode ? { modelCode } : {}),
        },
      };
    }
    const aspectRatio = String(generation.imageAspectRatio ?? "").trim();
    const imageSize = String(generation.imageSize ?? "").trim();
    if (aspectRatio) {
      defaultData.imageAspectRatio = aspectRatio;
      parameterValues.aspectRatio = aspectRatio;
      parameterValues.imageAspectRatio = aspectRatio;
    }
    if (imageSize) {
      defaultData.imageResolution = imageSize;
      parameterValues.quality = imageSize;
      parameterValues.imageResolution = imageSize;
      parameterValues.imageSize = imageSize;
    }
  } else if (mediaKind === "video") {
    if (generation.videoFollowNode === true) {
      return {
        ...clone(template),
        defaultData: {
          ...defaultData,
          ...(modelCode ? { modelCode } : {}),
        },
      };
    }
    const resolution = String(generation.videoResolution ?? "").trim();
    const duration = Number(generation.videoDuration);
    if (resolution) {
      defaultData.videoResolution = resolution;
      parameterValues.resolution = resolution;
      parameterValues.videoResolution = resolution;
    }
    if (Number.isFinite(duration) && duration > 0) {
      defaultData.videoDurationSec = duration;
      parameterValues.durationSec = duration;
      parameterValues.videoDurationSec = duration;
    }
  }
  return {
    ...clone(template),
    defaultData: {
      ...defaultData,
      ...(modelCode ? { modelCode } : {}),
      ...(Object.keys(parameterValues).length ? { parameterValues } : {}),
    },
  };
}

export function createCanvasNodeFromTemplate(document, template = {}) {
  const node = createCanvasNode(template.type, {
    id: template.nodeId,
    position: template.position,
    modelCode: template.defaultData?.modelCode,
  });
  return {
    ...node,
    data: {
      ...node.data,
      ...clone(template.defaultData ?? {}),
      ports: clone(node.data?.ports ?? NODE_PORTS[node.type] ?? NODE_PORTS.output),
    },
  };
}

export function addCanvasNode(document, input = {}) {
  const type = normalizeNodeType(input.type ?? input.kind);
  const node = input.template
    ? createCanvasNodeFromTemplate(document, {
        ...input.template,
        type,
        nodeId: input.id ?? nextCanvasNodeId(document, type),
        position: input.position ?? input.template.position,
      })
    : createCanvasNode(type, {
        id: input.id ?? nextCanvasNodeId(document, type),
        position: input.position,
        modelCode: input.modelCode,
      });
  return touchCanvasDocument({
    ...clone(document),
    nodes: [...safeArray(document?.nodes), node],
  });
}

export function resolveCanvasNodePlacement(document, input = {}) {
  const numberOr = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const type = normalizeNodeType(input.type ?? input.kind);
  const size = CANVAS_NODE_SIZES[type] ?? CANVAS_NODE_SIZES.output;
  const preferred = {
    x: numberOr(input.position?.x, 220),
    y: numberOr(input.position?.y, 180),
  };
  const gap = Math.max(0, numberOr(input.gap, 24));
  const step = Math.max(24, numberOr(input.step, 48));
  const nodes = safeArray(document?.nodes).filter((node) => !node?.data?.hiddenByCharacterId);
  const isFree = (position) => nodes.every((node) => {
    const nodeSize = node?.size ?? CANVAS_NODE_SIZES[normalizeNodeType(node?.type)] ?? CANVAS_NODE_SIZES.output;
    const left = numberOr(node?.position?.x, 0);
    const top = numberOr(node?.position?.y, 0);
    const right = left + Math.max(1, numberOr(nodeSize?.width, CANVAS_NODE_SIZES.output.width));
    const bottom = top + Math.max(1, numberOr(nodeSize?.height, CANVAS_NODE_SIZES.output.height));
    return (
      position.x + size.width + gap <= left ||
      position.x >= right + gap ||
      position.y + size.height + gap <= top ||
      position.y >= bottom + gap
    );
  });

  if (isFree(preferred)) return preferred;
  for (let ring = 1; ring <= 32; ring += 1) {
    for (let row = -ring; row <= ring; row += 1) {
      for (let column = -ring; column <= ring; column += 1) {
        if (Math.abs(row) !== ring && Math.abs(column) !== ring) continue;
        const candidate = {
          x: preferred.x + (column * step),
          y: preferred.y + (row * step),
        };
        if (isFree(candidate)) return candidate;
      }
    }
  }
  return preferred;
}

export function buildCanvasSidebarItems(document, options = {}) {
  if (options.mode === "assets") {
    return safeArray(options.assets).map((asset) => {
      const url = asset.url ?? asset.previewUrl ?? asset.thumbnailUrl ?? "";
      return {
        id: String(asset.id ?? asset.assetId ?? asset.key ?? ""),
        ...(asset.runId ? { runId: String(asset.runId) } : {}),
        ...(asset.artifactId ? { artifactId: String(asset.artifactId) } : {}),
        ...(asset.storageObjectId ? { storageObjectId: String(asset.storageObjectId) } : {}),
        ...(asset.assetVersionId ? { assetVersionId: String(asset.assetVersionId) } : {}),
        ...(Array.isArray(asset.tags) ? { tags: asset.tags } : {}),
        type: "asset",
        kind: String(asset.kind ?? asset.category ?? asset.type ?? "asset"),
        title: String(asset.title ?? asset.name ?? asset.label ?? "未命名素材"),
        meta: String(asset.meta ?? asset.groupLabel ?? "素材"),
        status: String(asset.status ?? "ready"),
        ...(url ? { url } : {}),
        ...(options.assetTransfers?.[String(asset.id ?? asset.assetId ?? asset.key ?? "")]
          ? { transfer: options.assetTransfers[String(asset.id ?? asset.assetId ?? asset.key ?? "")] }
          : {}),
      };
    }).filter((asset) => asset.id);
  }

  return safeArray(document?.nodes).map((node) => {
    const kind = node?.type ?? "output";
    const title = node?.data?.title ?? node?.id ?? "节点";
    const status = node?.data?.status ?? "idle";
    const modelCode = node?.data?.modelCode;
    const nodeSource = String(node?.data?.source ?? "");
    const displayTitle = kind === "script" || nodeSource === "project_script" || nodeSource === "project_script_episode"
      ? "剧本源"
      : (node?.data?.mediaKind === "text" || kind === "director")
        ? "文本源"
        : title;
    return {
      id: String(node?.id ?? ""),
      type: "node",
      kind,
      title: displayTitle,
      meta: modelCode
        ? `${modelCode} 路 ${node?.data?.mediaKind ?? kind}`
        : node?.data?.source === "project_script"
          ? "椤圭洰鍓ф湰鐗囨"
          : status,
      status,
    };
  }).filter((node) => node.id);
}

export function updateCanvasViewport(document, patch = {}) {
  const previousViewport = document?.viewport ?? {};
  return touchCanvasDocument({
    ...clone(document),
    viewport: {
      x: Number(patch.x ?? previousViewport.x ?? 0),
      y: Number(patch.y ?? previousViewport.y ?? 0),
      zoom: clampNumber(patch.zoom ?? previousViewport.zoom ?? 1, 0.1, 8),
      gridVisible: patch.gridVisible ?? previousViewport.gridVisible ?? true,
      snapEnabled: patch.snapEnabled ?? previousViewport.snapEnabled ?? true,
      interactionMode: patch.interactionMode ?? previousViewport.interactionMode ?? "default",
    },
  });
}

export function updateCanvasNodeData(document, nodeId, patch = {}) {
  return touchCanvasDocument({
    ...clone(document),
    nodes: safeArray(document?.nodes).map((node) =>
      node.id === nodeId
        ? {
            ...clone(node),
            data: {
              ...clone(node.data ?? {}),
              ...clone(patch),
              ports: clone(patch.ports ?? node.data?.ports ?? NODE_PORTS[node.type] ?? NODE_PORTS.output),
            },
          }
          : clone(node),
    ),
  });
}

export function canvasUploadNodeAcceptsMedia(nodeType, mediaKind) {
  const normalizedType = String(nodeType ?? "");
  const normalizedMediaKind = String(mediaKind ?? "");
  if (normalizedType === "upload") {
    return ["image", "video", "audio"].includes(normalizedMediaKind);
  }
  if (["ai-animation", "ai-panorama", "ai-storyboard", "source-image"].includes(normalizedType)) {
    return normalizedMediaKind === "image";
  }
  if (normalizedType === "source-video") {
    return normalizedMediaKind === "video";
  }
  if (normalizedType === "source-audio") {
    return normalizedMediaKind === "audio";
  }
  return false;
}

export function arrangeCanvasDocumentOnGrid(document, options = {}) {
  const nodes = safeArray(document?.nodes);
  const visibleNodes = nodes.filter((node) => !node?.data?.hiddenByCharacterId);
  if (!visibleNodes.length) return document;
  const gridSize = Math.max(8, Number(options.gridSize ?? 40) || 40);
  const columnGap = Math.max(gridSize, Number(options.columnGap ?? 120) || 120);
  const rowGap = Math.max(gridSize, Number(options.rowGap ?? 80) || 80);
  const membership = resolveCanvasGroupMembership(nodes);
  const topLevelNodes = visibleNodes.filter((node) => !membership.childParent.has(String(node?.id ?? "")));
  if (!topLevelNodes.length) return document;
  const itemById = new Map(topLevelNodes.map((node) => [String(node.id), {
    id: String(node.id),
    x: Number(node.position?.x ?? 0) || 0,
    y: Number(node.position?.y ?? 0) || 0,
    width: Math.max(1, Number(node.size?.width ?? 360) || 360),
    height: Math.max(1, Number(node.size?.height ?? 220) || 220),
  }]));
  const rootId = (nodeId) => membership.childParent.get(String(nodeId ?? "")) ?? String(nodeId ?? "");
  const adjacency = new Map([...itemById.keys()].map((id) => [id, new Set()]));
  const indegree = new Map([...itemById.keys()].map((id) => [id, 0]));
  const connectedIds = new Set();
  for (const edge of safeArray(document?.edges)) {
    const sourceId = rootId(edge?.sourceNodeId);
    const targetId = rootId(edge?.targetNodeId);
    if (!itemById.has(sourceId) || !itemById.has(targetId) || sourceId === targetId) continue;
    connectedIds.add(sourceId);
    connectedIds.add(targetId);
    if (adjacency.get(sourceId).has(targetId)) continue;
    adjacency.get(sourceId).add(targetId);
    indegree.set(targetId, indegree.get(targetId) + 1);
  }
  const byOriginalPosition = (leftId, rightId) => {
    const left = itemById.get(leftId);
    const right = itemById.get(rightId);
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id);
  };
  const queue = [...itemById.keys()]
    .filter((id) => connectedIds.has(id) && indegree.get(id) === 0)
    .sort(byOriginalPosition);
  const layerById = new Map(queue.map((id) => [id, 0]));
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    visited.add(id);
    for (const targetId of adjacency.get(id)) {
      layerById.set(targetId, Math.max(layerById.get(targetId) ?? 0, (layerById.get(id) ?? 0) + 1));
      indegree.set(targetId, indegree.get(targetId) - 1);
      if (indegree.get(targetId) === 0) {
        queue.push(targetId);
        queue.sort(byOriginalPosition);
      }
    }
  }
  const minX = Math.min(...topLevelNodes.map((node) => Number(node.position?.x ?? 0) || 0));
  const estimatedColumnWidth = Math.max(...[...itemById.values()].map((item) => item.width)) + columnGap;
  for (const id of itemById.keys()) {
    if (visited.has(id)) continue;
    const item = itemById.get(id);
    layerById.set(id, Math.max(0, Math.round((item.x - minX) / Math.max(gridSize, estimatedColumnWidth))));
  }
  const columns = new Map();
  for (const id of itemById.keys()) {
    const layer = layerById.get(id) ?? 0;
    const items = columns.get(layer) ?? [];
    items.push(itemById.get(id));
    columns.set(layer, items);
  }
  const snap = (value) => Math.round(value / gridSize) * gridSize;
  const positions = new Map();
  let columnX = snap(minX);
  const startY = snap(Math.min(...topLevelNodes.map((node) => Number(node.position?.y ?? 0) || 0)));
  for (const layer of [...columns.keys()].sort((left, right) => left - right)) {
    const items = columns.get(layer).sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
    const columnWidth = Math.max(...items.map((item) => item.width));
    let rowY = startY;
    for (const item of items) {
      positions.set(item.id, { x: columnX, y: snap(rowY) });
      rowY = snap(rowY + item.height + rowGap);
    }
    columnX = snap(columnX + columnWidth + columnGap);
  }
  const groupDeltas = new Map([...positions].map(([id, position]) => {
    const item = itemById.get(id);
    return [id, { x: position.x - item.x, y: position.y - item.y }];
  }));
  return touchCanvasDocument({
    ...clone(document),
    nodes: nodes.map((node) => {
      const nodeId = String(node?.id ?? "");
      const position = positions.get(nodeId);
      if (position) return { ...clone(node), position };
      const parentId = membership.childParent.get(nodeId);
      const delta = parentId ? groupDeltas.get(parentId) : null;
      if (!delta) return clone(node);
      return {
        ...clone(node),
        position: {
          x: Number(node.position?.x ?? 0) + delta.x,
          y: Number(node.position?.y ?? 0) + delta.y,
        },
      };
    }),
  });
}

export function updateCanvasNodePosition(document, nodeId, position = {}) {
  const normalizedNodeId = String(nodeId ?? "");
  const nodes = safeArray(document?.nodes);
  const currentNode = nodes.find((node) => String(node?.id ?? "") === normalizedNodeId);
  const nextPosition = {
    x: Number(position.x ?? currentNode?.position?.x ?? 0),
    y: Number(position.y ?? currentNode?.position?.y ?? 0),
  };
  const childIds = currentNode?.type === "group"
    ? new Set(resolveCanvasGroupMembership(nodes).groupChildren.get(normalizedNodeId) ?? [])
    : new Set();
  const delta = {
    x: nextPosition.x - Number(currentNode?.position?.x ?? 0),
    y: nextPosition.y - Number(currentNode?.position?.y ?? 0),
  };
  return touchCanvasDocument({
    ...clone(document),
    nodes: nodes.map((node) =>
      node.id === normalizedNodeId
        ? {
            ...clone(node),
            position: nextPosition,
          }
        : childIds.has(String(node?.id ?? ""))
          ? {
              ...clone(node),
              position: {
                x: Number(node.position?.x ?? 0) + delta.x,
                y: Number(node.position?.y ?? 0) + delta.y,
              },
            }
          : clone(node),
    ),
  });
}

export function updateCanvasNodeSize(document, nodeId, size = {}) {
  const normalizedNodeId = String(nodeId ?? "");
  return touchCanvasDocument({
    ...clone(document),
    nodes: safeArray(document?.nodes).map((node) =>
      node.id === normalizedNodeId
        ? {
            ...clone(node),
            size: {
              width: Number(size.width ?? node.size?.width ?? 360),
              height: Number(size.height ?? node.size?.height ?? 260),
            },
          }
        : clone(node),
    ),
  });
}

export function connectCanvasNodes(document, connection = {}) {
  const nodes = safeArray(document?.nodes);
  const sourceNodeId = String(connection.sourceNodeId ?? "");
  const targetNodeId = String(connection.targetNodeId ?? "");
  const sourcePortId = String(connection.sourcePortId ?? "");
  const targetPortId = String(connection.targetPortId ?? "");
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  const targetNode = nodes.find((node) => node.id === targetNodeId);
  const sourcePort = normalizeCanvasSourcePortForConnection(sourceNode, findCanvasPort(sourceNode, sourcePortId));
  const targetPort = normalizeCanvasTargetPortForConnection(targetNode, findCanvasPort(targetNode, targetPortId), sourcePort);
  const validation = validateCanvasConnection(sourcePort, targetPort);
  if (!validation.ok || !sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
    return {
      ok: false,
      reason: sourceNodeId === targetNodeId ? "canvas_connection_self_link" : validation.reason,
      document: touchCanvasDocument(clone(document)),
    };
  }

  const edgeId = String(connection.id ?? `edge-${sourceNodeId}-${sourcePortId}-${targetNodeId}-${targetPortId}`);
  const nextEdge = {
    id: edgeId,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    data: {
      kind: sourcePort.kind,
      status: "idle",
      ...(connection.data ?? {}),
    },
  };
  const nextEdges = safeArray(document?.edges)
    .filter((edge) => edge.id !== edgeId)
    .filter((edge) => !(edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId))
    .concat(nextEdge);

  return {
    ok: true,
    edge: nextEdge,
    document: touchCanvasDocument({
      ...clone(document),
      edges: nextEdges.map((edge) => clone(edge)),
    }),
  };
}

export function disconnectCanvasNodes(document, connection = {}) {
  const sourceNodeId = String(connection.sourceNodeId ?? "");
  const targetNodeId = String(connection.targetNodeId ?? "");
  const sourcePortId = String(connection.sourcePortId ?? "");
  const targetPortId = String(connection.targetPortId ?? "");
  const previousEdges = safeArray(document?.edges);
  const nextEdges = previousEdges.filter((edge) => !(
    edge.sourceNodeId === sourceNodeId &&
    edge.targetNodeId === targetNodeId &&
    edge.sourcePortId === sourcePortId &&
    edge.targetPortId === targetPortId
  ));
  return {
    ok: nextEdges.length < previousEdges.length,
    document: touchCanvasDocument({
      ...clone(document),
      edges: nextEdges.map((edge) => clone(edge)),
    }),
  };
}

function normalizeCanvasTargetPortForConnection(targetNode, targetPort, sourcePort) {
  if (!targetPort || !sourcePort) {
    return targetPort;
  }
  if (
    targetPort.direction === "in" &&
    (["image", "video"].includes(targetNode?.type) || (targetNode?.type === "send" && targetNode?.data?.mediaKind === "image")) &&
    ["text", "image", "any"].includes(sourcePort.kind)
  ) {
    return {
      ...targetPort,
      kind: sourcePort.kind,
    };
  }
  return targetPort;
}

function normalizeCanvasSourcePortForConnection(sourceNode, sourcePort) {
  if (!sourcePort || sourcePort.direction !== "out" || sourceNode?.type !== "upload") {
    return sourcePort;
  }
  const mediaKind = sourceNode?.data?.mediaKind === "video" ? "video" : "image";
  return {
    ...sourcePort,
    kind: mediaKind,
  };
}

export function removeCanvasNode(document, nodeId) {
  const normalizedNodeId = String(nodeId ?? "");
  const sourceNodes = safeArray(document?.nodes);
  const remainingNodes = sourceNodes.filter((node) => String(node?.id ?? "") !== normalizedNodeId);
  const remainingIds = new Set(remainingNodes.map((node) => String(node?.id ?? "")));
  const grouping = resolveCanvasGroupMembership(sourceNodes);
  return touchCanvasDocument({
    ...clone(document),
    nodes: remainingNodes.map((node) => normalizeCanvasGroupNode(
      node,
      grouping.childParent.get(String(node?.id ?? "")) === normalizedNodeId
        ? null
        : grouping.childParent.get(String(node?.id ?? "")),
      safeArray(grouping.groupChildren.get(String(node?.id ?? "")))
        .filter((childId) => childId !== normalizedNodeId && remainingIds.has(childId)),
      remainingIds,
    )),
    edges: safeArray(document?.edges)
      .filter((edge) => edge.sourceNodeId !== normalizedNodeId && edge.targetNodeId !== normalizedNodeId)
      .map((edge) => clone(edge)),
  });
}

export function resolveCanvasModelOptions(generationConfig, mediaKind = "image") {
  const modes = MODEL_MODE_BY_MEDIA_KIND[mediaKind] ?? MODEL_MODE_BY_MEDIA_KIND.image;
  return safeArray(generationConfig?.models)
    .filter((model) => model && model.enabled !== false && model.disabled !== true)
    .filter((model) => {
      const configuredMediaKind = normalizeCanvasModelMediaKind(model);
      if (configuredMediaKind) {
        return configuredMediaKind === mediaKind;
      }
      const supportedModes = safeArray(model.supportedModes ?? model.modes ?? model.capabilities);
      if (!supportedModes.length) {
        const modelType = String(model.modelType ?? model.type ?? model.category ?? "").toLowerCase();
        return !modelType || modes.has(modelType);
      }
      return supportedModes.some((mode) => modes.has(normalizeModeToken(mode)));
    })
    .map((model) => ({
      modelCode: String(model.modelCode ?? model.id ?? "").trim(),
      modelLabel: String(model.modelLabel ?? model.name ?? model.label ?? model.modelCode ?? model.id ?? "").trim(),
      raw: model,
    }))
    .filter((model) => model.modelCode);
}

function normalizeCanvasModelMediaKind(model) {
  const value = String(model?.mediaType ?? model?.media_type ?? model?.mediaKind ?? model?.media_kind ?? "").trim().toLowerCase();
  if (value === "text" || value === "image" || value === "video" || value === "audio") {
    return value;
  }
  return "";
}

function normalizeModeToken(mode) {
  return String(mode ?? "").trim().toLowerCase().replace(/[._]/g, "-");
}

export function buildCanvasRunPreview(document, nodeId) {
  const node = safeArray(document?.nodes).find((item) => item.id === nodeId);
  if (!node) {
    return { ok: false, reason: "canvas_run_node_missing" };
  }
  if (!["send", "image", "video", "audio", "ai-text", "ai-image", "ai-video", "ai-audio", "ai-animation", "ai-panorama", "ai-markdown", "ai-storyboard"].includes(node.type)) {
    return { ok: false, reason: "canvas_run_send_node_required" };
  }
  const prompt = String(node.data?.prompt ?? "").trim();
  const modelCode = String(node.data?.modelCode ?? "").trim();
  const upstreamNodeIdList = upstreamNodeIds(document, nodeId);
  const upstreamTextFragmentList = upstreamTextFragments(document, nodeId);
  const audioGenerationMode = String(node.data?.audioGenerationMode ?? node.data?.audioMode ?? "text-to-speech");
  const plainTextTranscription = String(node.data?.mediaKind ?? "") === "audio"
    && audioGenerationMode === "transcription"
    && !hasUpstreamAudioNode(document, nodeId);
  if (!modelCode && !plainTextTranscription) {
    return { ok: false, reason: "canvas_run_model_required" };
  }
  const combinedPrompt = combineCanvasPrompt(prompt, upstreamTextFragmentList);
  if (!combinedPrompt && !upstreamNodeIdList.length) {
    return { ok: false, reason: "canvas_run_input_required" };
  }
  const promptReferences = resolveCanvasPromptReferences(
    combinedPrompt,
    document?.promptReferenceCatalog ?? document?.references ?? {},
    { strict: document?.promptReferenceStrict === true },
  );
  if (document?.promptReferenceStrict === true && !promptReferences.ok) {
    return {
      ok: false,
      reason: "canvas_prompt_reference_invalid",
      promptReferences,
    };
  }
  const animation = node.type === "ai-animation" ? normalizeCanvasAnimationState(node.data) : null;
  const mediaKind = node.type === "ai-storyboard" || animation ? "image" : String(node.data?.mediaKind ?? "image");
  const animationAspectRatio = animation ? resolveCanvasAnimationSheetAspectRatio(animation.frames) : "";
  const generationPrompt = animation
    ? buildCanvasAnimationSpritePrompt(promptReferences.expandedPrompt, {
        ...animation,
        sheetAspectRatio: animationAspectRatio,
      })
    : promptReferences.expandedPrompt;
  return {
    ok: true,
    nodeId,
    mediaKind,
    modelCode,
    prompt: generationPrompt,
    ...(promptReferences.references.length || animation
      ? { sourcePrompt: combinedPrompt, promptReferences }
      : {}),
    nodePrompt: prompt,
    videoGenerationMode: String(node.data?.videoGenerationMode ?? node.data?.videoMode ?? ""),
    ...(animation
      ? {
          animationAction: animation.action,
          animationFrames: animation.frames,
          animationGrid: clone(animation.grid),
          animationPreviewMode: animation.previewMode,
          animationSheetAspectRatio: animationAspectRatio,
        }
      : {}),
    ...(mediaKind === "audio"
      ? {
          audioGenerationMode,
          plainTextTranscription,
          lyrics: String(node.data?.lyrics ?? ""),
          lyricsMode: String(node.data?.lyricsMode ?? (node.data?.lyrics ? "custom" : "generate")),
        }
      : {}),
    upstreamNodeIds: upstreamNodeIdList,
    upstreamTextFragments: upstreamTextFragmentList,
  };
}

export function applyCanvasRunResult(document, preview, task = null) {
  if (!preview?.ok) {
    return touchCanvasDocument(clone(document));
  }
  const taskId = resolveCanvasTaskId(task);
  const resultKind = preview.mediaKind === "text" ? "text" : preview.mediaKind === "video" ? "video" : preview.mediaKind === "audio" ? "audio" : "image";
  const taskStatus = resolveCanvasTaskStatus(task);
  const taskProgress = resolveCanvasTaskProgress(task, taskStatus);
  const taskStage = resolveCanvasTaskStage(task, taskStatus);
  const mediaUrl = resolveCanvasTaskMediaUrl(task, resultKind);
  const generatedText = resultKind === "text" ? resolveCanvasTaskText(task) : "";
  const failureCode = resolveCanvasTaskFailureCode(task);
  const failureMessage = resolveCanvasTaskFailureMessage(task);
  const failure = task?.failure && typeof task.failure === "object" ? clone(task.failure) : null;
  const lyrics = resolveCanvasTaskLyrics(task);
  const lyricsArtifactId = String(
    task?.result?.lyricsArtifactId
      ?? task?.artifact?.id
      ?? task?.resultAssets?.[0]?.lyricsArtifactId
      ?? "",
  ).trim();
  const resultStatus = task ? taskStatus : "preview";
  const animationArtifactPatch = resolveCanvasAnimationArtifactPatch(task, mediaUrl);
  const mediaArtifactPatch = resultKind === "video" || resultKind === "audio"
    ? resolveCanvasMediaArtifactPatch(task)
    : {};
  return touchCanvasDocument({
    ...clone(document),
    nodes: safeArray(document?.nodes).map((node) => {
      if (node.id === preview.nodeId) {
        return {
          ...clone(node),
          data: {
            ...clone(node.data ?? {}),
            status: task ? taskStatus : "ready",
            lastRunAt: new Date(0).toISOString(),
            lastTaskId: taskId,
            taskId,
            generationProgress: taskProgress,
            generationStage: taskStage,
            failureCode,
            failureMessage,
            failure,
            ...(generatedText ? { text: generatedText, resultText: generatedText } : {}),
            ...(lyrics ? {
              lyrics,
              lyricsMode: String(task?.result?.lyricsMode ?? task?.resultAssets?.[0]?.lyricsMode ?? node.data?.lyricsMode ?? "generate"),
              ...(taskId ? { lyricsTaskId: taskId } : {}),
              ...(lyricsArtifactId ? { lyricsArtifactId } : {}),
            } : {}),
            ...(mediaUrl
              ? {
                  previewUrl: mediaUrl,
                  resultUrl: mediaUrl,
                  url: mediaUrl,
                }
              : {}),
            ...mediaArtifactPatch,
            ...(node.type === "ai-animation" ? animationArtifactPatch : {}),
          },
        };
      }
      if (isConnectedResultNode(document, preview.nodeId, node.id, resultKind)) {
        return {
          ...clone(node),
          data: {
            ...clone(node.data ?? {}),
            status: resultStatus,
            sourceNodeId: preview.nodeId,
            taskId,
            modelCode: preview.modelCode,
            prompt: preview.prompt,
            mediaKind: resultKind,
            generationProgress: taskProgress,
            generationStage: taskStage,
            failureCode,
            failureMessage,
            failure,
            ...(generatedText ? { text: generatedText, resultText: generatedText } : {}),
            ...(mediaUrl
              ? {
                  previewUrl: mediaUrl,
                  resultUrl: mediaUrl,
                  url: mediaUrl,
                }
              : {}),
            ...mediaArtifactPatch,
          },
        };
      }
      return clone(node);
    }),
    edges: safeArray(document?.edges).map((edge) =>
      edge.sourceNodeId === preview.nodeId
        ? {
            ...clone(edge),
            data: {
              ...clone(edge.data ?? {}),
              status: task ? "queued" : "preview",
              taskId,
            },
          }
        : clone(edge),
    ),
  });
}

function resolveCanvasTaskLyrics(task) {
  const candidates = [
    task?.lyrics,
    task?.result?.lyrics,
    task?.outputSnapshot?.lyrics,
    task?.resultAssets?.[0]?.lyrics,
    task?.assets?.[0]?.lyrics,
    task?.platform?.tasks?.[0]?.resultAssets?.[0]?.lyrics,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

function resolveCanvasTaskFailureCode(task) {
  return String(task?.failureCode ?? task?.failure?.failureCode ?? task?.result?.failureCode ?? "").trim() || null;
}

function resolveCanvasTaskFailureMessage(task) {
  return String(
    task?.failure?.displayMessage ??
      task?.failure?.providerMessage ??
      task?.failure?.errorMessage ??
      task?.displayMessage ??
      "",
  ).trim() || null;
}

function resolveCanvasTaskStatus(task) {
  const raw = String(task?.status ?? task?.workflowStatus ?? task?.platform?.workflowStatus ?? "").trim().toLowerCase();
  if (!task) {
    return "ready";
  }
  if (raw === "succeeded" || raw === "completed") {
    return "completed";
  }
  if (raw === "failed" || raw === "canceled" || raw === "manual_review_required" || raw === "result_unknown") {
    return raw;
  }
  if (raw === "running" || raw === "processing") {
    return "running";
  }
  return "queued";
}

function resolveCanvasTaskProgress(task, status) {
  const stageProgress = resolveCanvasTaskStageProgress(resolveCanvasTaskStage(task, status));
  if (stageProgress !== null) {
    return stageProgress;
  }
  const candidates = [
    task?.progress,
    task?.progressPercent,
    task?.progress_percent,
    task?.percent,
    task?.snapshot?.progress,
    task?.snapshot?.progressPercent,
    task?.snapshot?.progress_percent,
    task?.platform?.progress,
    task?.platform?.progressPercent,
    task?.platform?.progress_percent,
    task?.result?.progress,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) {
      return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
    }
  }
  if (status === "completed") return 100;
  if (status === "running") return 50;
  if (status === "queued") return 25;
  if (status === "failed" || status === "canceled" || status === "manual_review_required" || status === "result_unknown") return 100;
  return 0;
}

function resolveCanvasTaskStage(task, status) {
  const stage = String(
    task?.progressStage ??
    task?.progress_stage ??
    task?.stage ??
    task?.snapshot?.progressStage ??
    task?.snapshot?.progress_stage ??
    task?.platform?.progressStage ??
    task?.platform?.progress_stage ??
    "",
  ).trim();
  if (stage) {
    return stage;
  }
  if (status === "completed") return "completed";
  if (status === "running") return "provider_rendering";
  if (status === "queued") {
    return hasCanvasTaskDispatchSignal(task) ? "submitted" : "queue_unavailable";
  }
  return status || "";
}

function hasCanvasTaskDispatchSignal(task) {
  return Boolean(
    task?.providerRequestId ??
      task?.provider_request_id ??
      task?.attemptId ??
      task?.attempt_id ??
      task?.platform?.providerRequestId ??
      task?.platform?.provider_request_id ??
      task?.platform?.tasks?.[0]?.attemptId,
  );
}

function resolveCanvasTaskStageProgress(stage) {
  const normalized = String(stage ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["queued", "submitted", "created", "task_created", "queue_unavailable", "queue_stalled", "queued_unprocessed"].includes(normalized)) return 25;
  if (["provider_submitted", "provider_accepted", "accepted", "provider_rendering", "provider_running", "rendering", "running", "processing"].includes(normalized)) return 50;
  if (["provider_succeeded", "provider_completed", "artifact_persisting", "saving_asset", "persisting_asset", "uploading_asset"].includes(normalized)) return 75;
  if (["completed", "succeeded"].includes(normalized)) return 100;
  if (["failed", "asset_persist_failed", "manual_review_required", "result_unknown", "canceled"].includes(normalized)) return 100;
  return null;
}

function resolveCanvasTaskMediaUrl(task, mediaKind) {
  const result = task?.result ?? {};
  const generatedItems = [
    ...safeArray(task?.generatedOutputItems),
    ...safeArray(result.generatedOutputItems),
    ...safeArray(task?.fixedImages),
    ...safeArray(result.fixedImages),
    ...safeArray(task?.fixedVideos),
    ...safeArray(result.fixedVideos),
  ];
  const generatedImageUrls = generatedItems.flatMap((item) => [
    item?.url,
    item?.imageUrl,
    item?.previewUrl,
    item?.sourceUrl,
    item?.downloadUrl,
    item?.thumbnailUrl,
  ]);
  const generatedVideoUrls = generatedItems.flatMap((item) => [
    item?.videoUrl,
    item?.url,
    item?.previewUrl,
    item?.sourceUrl,
    item?.downloadUrl,
  ]);
  const generatedAudioUrls = generatedItems.flatMap((item) => [
    item?.audioUrl,
    item?.url,
    item?.sourceUrl,
    item?.downloadUrl,
  ]);
  const candidates = mediaKind === "audio"
    ? [result.audioUrl, result.url, result.sourceUrl, task?.audioUrl, task?.url, ...generatedAudioUrls]
    : mediaKind === "video"
    ? [
        result.videoUrl,
        result.url,
        result.previewUrl,
        result.sourceUrl,
        task?.videoUrl,
        task?.url,
        ...generatedVideoUrls,
      ]
    : [
        result.imageUrl,
        result.url,
        result.previewUrl,
        result.sourceUrl,
        result.thumbnailUrl,
        task?.imageUrl,
        task?.url,
        ...generatedImageUrls,
      ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function resolveCanvasTaskText(task) {
  const candidates = [
    task?.result?.text,
    task?.result?.content,
    task?.outputSnapshot?.text,
    task?.outputSnapshot?.content,
    task?.artifact?.metadata?.text,
    task?.artifact?.metadata?.content,
    task?.generatedText,
    task?.text,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function createCanvasNode(type, input = {}) {
  const normalizedType = normalizeNodeType(type);
  const size = CANVAS_NODE_SIZES[normalizedType] ?? CANVAS_NODE_SIZES.output;
  const position = input.position ?? { x: 160, y: 160 };
  const data = {
    title: NODE_TITLES[normalizedType] ?? NODE_TITLES.output,
    status: "idle",
    ports: clone(NODE_PORTS[normalizedType] ?? NODE_PORTS.output),
  };
  if (normalizedType === "send") {
    data.status = "ready";
    data.mediaKind = "image";
    data.modelCode = String(input.modelCode ?? "");
    data.prompt = "";
  }
  if (normalizedType.startsWith("ai-")) {
    data.status = "ready";
    data.prompt = "";
    data.mediaKind = normalizedType === "ai-image" || normalizedType === "ai-animation" || normalizedType === "ai-panorama"
      ? "image"
      : normalizedType === "ai-video"
        ? "video"
        : normalizedType === "ai-audio"
          ? "audio"
          : "text";
    if (normalizedType === "ai-animation") {
      data.animationAction = "idle";
      data.animationFrames = 8;
      data.animationPreviewMode = "playing";
    }
  }
  if (normalizedType.startsWith("source-")) {
    data.status = normalizedType === "source-text" ? "ready" : "empty";
    data.source = normalizedType === "source-text" ? "manual" : "upload";
    data.mediaKind = normalizedType.slice("source-".length);
  }
  if (["image", "video", "audio", "output"].includes(normalizedType)) {
    data.status = "empty";
  }
  if (input.modelCode && normalizedType !== "send") {
    data.modelCode = String(input.modelCode);
  }
  return {
    id: String(input.id ?? `canvas-${normalizedType}-${Date.now()}`),
    type: normalizedType,
    position: { x: Number(position.x ?? 160), y: Number(position.y ?? 160) },
    size,
    data,
  };
}

export function duplicateCanvasNodes(document, nodeIds = [], options = {}) {
  const selectedIds = new Set(nodeIds.map(String).filter(Boolean));
  const offset = Number(options.offset ?? 32);
  const sourceNodes = safeArray(document?.nodes).filter((node) => selectedIds.has(String(node?.id ?? "")));
  if (!sourceNodes.length) return { document: clone(document), nodeIds: [] };
  const idMap = new Map();
  const occupied = new Set(safeArray(document?.nodes).map((node) => String(node?.id ?? "")));
  for (const node of sourceNodes) {
    let index = 1;
    let id = `${node.id}-copy`;
    while (occupied.has(id)) id = `${node.id}-copy-${++index}`;
    occupied.add(id);
    idMap.set(node.id, id);
  }
  const copiedNodes = sourceNodes.map((node) => ({
    ...clone(node),
    id: idMap.get(node.id),
    position: {
      x: Number(node.position?.x ?? 0) + offset,
      y: Number(node.position?.y ?? 0) + offset,
    },
    data: {
      ...clone(node.data ?? {}),
      title: `${String(node.data?.title ?? node.type ?? "节点")} 副本`,
    },
  }));
  const copiedEdges = safeArray(document?.edges)
    .filter((edge) => selectedIds.has(String(edge.sourceNodeId)) && selectedIds.has(String(edge.targetNodeId)))
    .map((edge, index) => ({
      ...clone(edge),
      id: `${edge.id}-copy-${index + 1}`,
      sourceNodeId: idMap.get(edge.sourceNodeId),
      targetNodeId: idMap.get(edge.targetNodeId),
    }));
  return {
    nodeIds: copiedNodes.map((node) => node.id),
    document: touchCanvasDocument({
      ...clone(document),
      nodes: [...safeArray(document?.nodes).map(clone), ...copiedNodes],
      edges: [...safeArray(document?.edges).map(clone), ...copiedEdges],
    }),
  };
}

export function createCanvasClipboardSnapshot(document, nodeIds = []) {
  const requestedIds = new Set(safeArray(nodeIds).map(String).filter(Boolean));
  for (const node of safeArray(document?.nodes)) {
    if (node?.type !== "group" || !requestedIds.has(String(node.id))) continue;
    for (const childId of safeArray(node?.data?.childNodeIds).map(String)) requestedIds.add(childId);
  }
  const nodes = safeArray(document?.nodes).filter((node) => requestedIds.has(String(node?.id ?? ""))).map(clone);
  const copiedIds = new Set(nodes.map((node) => String(node.id)));
  const edges = safeArray(document?.edges)
    .filter((edge) => copiedIds.has(String(edge.sourceNodeId)) && copiedIds.has(String(edge.targetNodeId)))
    .map(clone);
  return { nodes, edges };
}

export function pasteCanvasClipboardSnapshot(document, snapshot = {}, options = {}) {
  const sourceNodes = safeArray(snapshot?.nodes);
  if (!sourceNodes.length) return { document: clone(document), nodeIds: [] };
  const offset = Number(options.offset ?? 32);
  const occupiedNodeIds = new Set(safeArray(document?.nodes).map((node) => String(node?.id ?? "")));
  const occupiedEdgeIds = new Set(safeArray(document?.edges).map((edge) => String(edge?.id ?? "")));
  const idMap = new Map();
  for (const node of sourceNodes) {
    const base = `${String(node.id ?? "canvas-node")}-copy`;
    let id = base;
    let index = 1;
    while (occupiedNodeIds.has(id)) id = `${base}-${++index}`;
    occupiedNodeIds.add(id);
    idMap.set(String(node.id), id);
  }
  const copiedNodes = sourceNodes.map((node) => {
    const copied = clone(node);
    copied.id = idMap.get(String(node.id));
    copied.position = {
      x: Number(node.position?.x ?? 0) + offset,
      y: Number(node.position?.y ?? 0) + offset,
    };
    copied.data = {
      ...clone(node.data ?? {}),
      title: `${String(node.data?.title ?? node.type ?? "节点")} 副本`,
    };
    const parentGroupId = idMap.get(String(node.parentGroupId ?? ""));
    if (parentGroupId) copied.parentGroupId = parentGroupId;
    else delete copied.parentGroupId;
    if (copied.type === "group") {
      copied.data.childNodeIds = safeArray(node.data?.childNodeIds).map((childId) => idMap.get(String(childId))).filter(Boolean);
    }
    return copied;
  });
  const copiedEdges = safeArray(snapshot?.edges).flatMap((edge) => {
    const sourceNodeId = idMap.get(String(edge.sourceNodeId));
    const targetNodeId = idMap.get(String(edge.targetNodeId));
    if (!sourceNodeId || !targetNodeId) return [];
    const base = `${String(edge.id ?? "canvas-edge")}-copy`;
    let id = base;
    let index = 1;
    while (occupiedEdgeIds.has(id)) id = `${base}-${++index}`;
    occupiedEdgeIds.add(id);
    return [{ ...clone(edge), id, sourceNodeId, targetNodeId }];
  });
  return {
    nodeIds: copiedNodes.map((node) => node.id),
    document: touchCanvasDocument({
      ...clone(document),
      nodes: [...safeArray(document?.nodes).map(clone), ...copiedNodes],
      edges: [...safeArray(document?.edges).map(clone), ...copiedEdges],
    }),
  };
}

export function groupCanvasNodes(document, nodeIds = []) {
  const nodes = safeArray(document?.nodes);
  const requestedIds = new Set(safeArray(nodeIds).map(String).filter(Boolean));
  const selectedNodes = nodes.filter((node) => requestedIds.has(String(node?.id ?? "")));
  if (selectedNodes.length < 2) return { document: clone(document), groupId: null };
  const grouping = resolveCanvasGroupMembership(nodes);
  if (selectedNodes.some((node) => (
    node?.type === "group" || grouping.childParent.has(String(node?.id ?? ""))
  ))) {
    return { document: clone(document), groupId: null };
  }
  const selectedIds = selectedNodes.map((node) => String(node.id));
  const left = Math.min(...selectedNodes.map((node) => Number(node.position?.x ?? 0)));
  const top = Math.min(...selectedNodes.map((node) => Number(node.position?.y ?? 0)));
  const right = Math.max(...selectedNodes.map((node) => Number(node.position?.x ?? 0) + Number(node.size?.width ?? 320)));
  const bottom = Math.max(...selectedNodes.map((node) => Number(node.position?.y ?? 0) + Number(node.size?.height ?? 180)));
  const group = createCanvasNode("group", {
    id: nextCanvasNodeId(document, "group"),
    position: { x: left - 28, y: top - 52 },
  });
  group.size = { width: Math.max(360, right - left + 56), height: Math.max(240, bottom - top + 80) };
  group.data = { ...group.data, title: "节点分组", color: "#22c55e", childNodeIds: selectedIds };
  return {
    groupId: group.id,
    document: touchCanvasDocument({
      ...clone(document),
      nodes: [
        group,
        ...nodes.map((node) => selectedIds.includes(String(node?.id ?? ""))
          ? { ...clone(node), parentGroupId: group.id }
          : clone(node)),
      ],
    }),
  };
}

export function ungroupCanvasNodes(document, nodeIds = []) {
  const nodes = safeArray(document?.nodes);
  const selectedIds = new Set((Array.isArray(nodeIds) ? nodeIds : [nodeIds]).map(String).filter(Boolean));
  const grouping = resolveCanvasGroupMembership(nodes);
  const groupIds = new Set();
  for (const node of nodes) {
    const nodeId = String(node?.id ?? "");
    if (node?.type === "group" && selectedIds.has(nodeId)) groupIds.add(nodeId);
    const parentGroupId = grouping.childParent.get(nodeId);
    if (selectedIds.has(nodeId) && parentGroupId) groupIds.add(parentGroupId);
  }
  if (!groupIds.size) {
    return { document: clone(document), groupIds: [], nodeIds: [] };
  }
  const childIds = new Set([...groupIds].flatMap((groupId) => grouping.groupChildren.get(groupId) ?? []));
  return {
    groupIds: [...groupIds],
    nodeIds: [...childIds],
    document: touchCanvasDocument({
      ...clone(document),
      nodes: nodes
        .filter((node) => !(node?.type === "group" && groupIds.has(String(node?.id ?? ""))))
        .map((node) => {
          if (!childIds.has(String(node?.id ?? ""))) return clone(node);
          const nextNode = clone(node);
          delete nextNode.parentGroupId;
          return nextNode;
        }),
    }),
  };
}

function resolveCanvasGroupMembership(nodes) {
  const groupIds = new Set(nodes
    .filter((node) => node?.type === "group")
    .map((node) => String(node?.id ?? ""))
    .filter(Boolean));
  const childParent = new Map();
  for (const node of nodes) {
    const nodeId = String(node?.id ?? "");
    const parentGroupId = String(node?.parentGroupId ?? "");
    if (nodeId && node?.type !== "group" && groupIds.has(parentGroupId)) {
      childParent.set(nodeId, parentGroupId);
    }
  }
  for (const group of nodes) {
    const groupId = String(group?.id ?? "");
    if (group?.type !== "group" || !groupIds.has(groupId)) continue;
    for (const childId of safeArray(group?.data?.childNodeIds).map(String)) {
      const child = nodes.find((node) => String(node?.id ?? "") === childId);
      if (child && child.type !== "group" && !childParent.has(childId)) {
        childParent.set(childId, groupId);
      }
    }
  }
  const groupChildren = new Map([...groupIds].map((groupId) => [groupId, []]));
  for (const node of nodes) {
    const nodeId = String(node?.id ?? "");
    const parentGroupId = childParent.get(nodeId);
    if (parentGroupId) groupChildren.get(parentGroupId)?.push(nodeId);
  }
  return { childParent, groupChildren };
}

function normalizeCanvasGroupNode(node, parentGroupId, childNodeIds, existingIds) {
  const nextNode = clone(node);
  if (nextNode?.type === "group") {
    nextNode.data = {
      ...clone(nextNode.data ?? {}),
      childNodeIds: childNodeIds.filter((childId) => existingIds.has(childId)),
    };
    delete nextNode.parentGroupId;
    return nextNode;
  }
  if (parentGroupId && existingIds.has(parentGroupId)) nextNode.parentGroupId = parentGroupId;
  else delete nextNode.parentGroupId;
  return nextNode;
}

function isConnectedResultNode(document, sourceNodeId, targetNodeId, resultKind) {
  const hasEdge = safeArray(document?.edges).some(
    (edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId,
  );
  if (!hasEdge) {
    return false;
  }
  const node = safeArray(document?.nodes).find((item) => item.id === targetNodeId);
  return node?.type === resultKind;
}

export function resolveCanvasTaskId(task) {
  return task?.platform?.tasks?.[0]?.taskId ?? task?.taskId ?? task?.id ?? task?.data?.taskId ?? null;
}

function upstreamNodeIds(document, nodeId) {
  return safeArray(document?.edges)
    .filter((edge) => edge.targetNodeId === nodeId)
    .map((edge) => edge.sourceNodeId)
    .filter(Boolean);
}

function upstreamTextFragments(document, nodeId) {
  const nodes = safeArray(document?.nodes);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return safeArray(document?.edges)
    .filter((edge) => edge.targetNodeId === nodeId)
    .map((edge) => nodeMap.get(edge.sourceNodeId))
    .filter((node) => node && (
      ["script", "director", "markdown", "source-text", "ai-text", "ai-markdown", "ai-storyboard", "ai-director"].includes(node.type)
      || node.data?.mediaKind === "text"
    ))
    .map((node) => ({
      nodeId: String(node.id ?? ""),
      title: String(node.data?.title ?? "鏂囨湰鐗囨"),
      text: normalizeUpstreamText(node.data?.text || stripUpstreamHtml(node.data?.textHtml)),
    }))
    .filter((fragment) => fragment.text);
}

function hasUpstreamAudioNode(document, nodeId) {
  const nodes = safeArray(document?.nodes);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return safeArray(document?.edges)
    .filter((edge) => edge.targetNodeId === nodeId)
    .map((edge) => nodeMap.get(edge.sourceNodeId))
    .some((node) => node && (
      node.type === "source-audio"
      || node.type === "audio"
      || node.type === "ai-audio"
      || node.data?.mediaKind === "audio"
    ));
}

function combineCanvasPrompt(prompt, textFragments = []) {
  return [
    ...safeArray(textFragments).map((fragment) => fragment?.text),
    prompt,
  ]
    .map((text) => normalizeUpstreamText(text))
    .filter(Boolean)
    .join("\n\n");
}

function normalizeUpstreamText(text) {
  return String(text ?? "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripUpstreamHtml(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function nextCanvasNodeId(document, type) {
  const prefix = `canvas-${type}`;
  const ids = new Set(safeArray(document?.nodes).map((node) => node.id));
  let index = ids.size + 1;
  while (ids.has(`${prefix}-${index}`)) {
    index += 1;
  }
  return `${prefix}-${index}`;
}

function normalizeNodeType(type) {
  const normalized = String(type ?? "output").trim();
  if (normalized === "text") return "script";
  if (normalized === "image-to-image" || normalized === "image-upscale") return "image";
  return NODE_PORTS[normalized] ? normalized : "output";
}

function touchCanvasDocument(document) {
  return {
    ...document,
    updatedAt: new Date(0).toISOString(),
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
