import { CANVAS_NODE_SIZES, findCanvasPort } from "./canvas-default-document.js";
import { validateCanvasConnection } from "./canvas-edge-rules.js";

const MODEL_MODE_BY_MEDIA_KIND = {
  image: new Set(["image", "single-image", "multi-image", "text-to-image", "image-to-image", "multi-reference", "image-generation"]),
  video: new Set(["video", "first-frame", "first-last-frame", "reference-video", "edit-video", "image-to-video"]),
  audio: new Set(["audio", "voice", "lip-sync"]),
  text: new Set(["text", "script", "storyboard", "text-generation"]),
};

const NODE_PORTS = {
  script: {
    inputs: [],
    outputs: [{ id: "out_text", kind: "text", label: "文本" }],
  },
  send: {
    inputs: [{ id: "in_text", kind: "text", label: "文本" }],
    outputs: [{ id: "out_image", kind: "image", label: "图片" }],
  },
  image: {
    inputs: [{ id: "in_image", kind: "image", label: "图片" }],
    outputs: [{ id: "out_image", kind: "image", label: "图片" }],
  },
  video: {
    inputs: [{ id: "in_image", kind: "image", label: "图片" }],
    outputs: [{ id: "out_video", kind: "video", label: "视频" }],
  },
  audio: {
    inputs: [{ id: "in_text", kind: "text", label: "文本" }],
    outputs: [{ id: "out_audio", kind: "audio", label: "音频" }],
  },
  upload: {
    inputs: [],
    outputs: [{ id: "out_any", kind: "any", label: "资源" }],
  },
  director: {
    inputs: [{ id: "in_any", kind: "any", label: "资源" }],
    outputs: [{ id: "out_text", kind: "text", label: "指令" }],
  },
  output: {
    inputs: [{ id: "in_any", kind: "any", label: "资源" }],
    outputs: [],
  },
};

const NODE_TITLES = {
  script: "剧本源",
  send: "发送流",
  image: "图片结果",
  video: "视频结果",
  audio: "音频结果",
  upload: "上传资源",
  director: "导演台",
  output: "输出",
};

const CANVAS_NODE_TEMPLATES = [
  {
    id: "template-script",
    group: "基础",
    type: "script",
    title: "剧本源",
    description: "把剧本文本、分镜要求或导演备注接入画布",
    defaultData: {
      title: "剧本源",
      text: "输入剧本片段、分镜要求或导演备注。",
      source: "manual",
    },
  },
  {
    id: "template-upload",
    group: "基础",
    type: "upload",
    title: "上传资源",
    description: "把角色、场景、道具或参考图拖入画布",
    defaultData: {
      title: "上传资源",
      status: "empty",
      source: "upload",
    },
  },
  {
    id: "template-send-image",
    group: "生成",
    type: "send",
    title: "文生图发送",
    description: "组合上游文本与参考素材，提交图片生成",
    mediaKind: "image",
    defaultData: {
      title: "文生图发送",
      status: "ready",
      mediaKind: "image",
      prompt: "根据上游内容生成电影感分镜画面。",
    },
  },
  {
    id: "template-image-result",
    group: "生成",
    type: "image",
    title: "图片结果",
    description: "承接图片任务结果，并继续派生图生图或视频",
    defaultData: {
      title: "图片结果",
      status: "empty",
    },
  },
  {
    id: "template-video-result",
    group: "生成",
    type: "video",
    title: "视频结果",
    description: "承接图生视频任务结果",
    defaultData: {
      title: "视频结果",
      status: "empty",
      mediaKind: "video",
    },
  },
  {
    id: "template-director",
    group: "编排",
    type: "director",
    title: "导演台",
    description: "汇总多路素材，记录镜头、动作和风格约束",
    defaultData: {
      title: "导演台",
      text: "镜头调度、动作节奏、角色关系和风格要求。",
    },
  },
  {
    id: "template-output",
    group: "编排",
    type: "output",
    title: "交付输出",
    description: "汇总最终图片、视频或导出目标",
    defaultData: {
      title: "交付输出",
      status: "empty",
    },
  },
];

export function resolveCanvasNodeTemplates(generationConfig = {}) {
  const imageModel = resolveCanvasModelOptions(generationConfig, "image")[0]?.modelCode ?? "";
  const videoModel = resolveCanvasModelOptions(generationConfig, "video")[0]?.modelCode ?? "";
  return CANVAS_NODE_TEMPLATES.map((template) => {
    const defaultData = clone(template.defaultData ?? {});
    if (template.type === "send" && imageModel) {
      defaultData.modelCode = imageModel;
    }
    if (template.type === "video" && videoModel) {
      defaultData.modelCode = videoModel;
    }
    return {
      ...clone(template),
      defaultData,
    };
  });
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

export function buildCanvasSidebarItems(document, options = {}) {
  if (options.mode === "assets") {
    return safeArray(options.assets).map((asset) => {
      const url = asset.url ?? asset.previewUrl ?? asset.thumbnailUrl ?? "";
      return {
        id: String(asset.id ?? asset.assetId ?? asset.key ?? ""),
        type: "asset",
        kind: String(asset.kind ?? asset.category ?? asset.type ?? "asset"),
        title: String(asset.title ?? asset.name ?? asset.label ?? "未命名素材"),
        meta: String(asset.meta ?? asset.groupLabel ?? "素材"),
        status: String(asset.status ?? "ready"),
        ...(url ? { url } : {}),
      };
    }).filter((asset) => asset.id);
  }

  return safeArray(document?.nodes).map((node) => {
    const kind = node?.type ?? "output";
    const title = node?.data?.title ?? node?.id ?? "节点";
    const status = node?.data?.status ?? "idle";
    const modelCode = node?.data?.modelCode;
    return {
      id: String(node?.id ?? ""),
      type: "node",
      kind,
      title,
      meta: modelCode
        ? `${modelCode} · ${node?.data?.mediaKind ?? kind}`
        : node?.data?.source === "project_script"
          ? "项目剧本片段"
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
      zoom: clampNumber(patch.zoom ?? previousViewport.zoom ?? 1, 0.35, 2.2),
      gridVisible: patch.gridVisible ?? previousViewport.gridVisible ?? true,
      snapEnabled: patch.snapEnabled ?? previousViewport.snapEnabled ?? true,
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
              ports: clone(node.data?.ports ?? NODE_PORTS[node.type] ?? NODE_PORTS.output),
            },
          }
        : clone(node),
    ),
  });
}

export function updateCanvasNodePosition(document, nodeId, position = {}) {
  const normalizedNodeId = String(nodeId ?? "");
  return touchCanvasDocument({
    ...clone(document),
    nodes: safeArray(document?.nodes).map((node) =>
      node.id === normalizedNodeId
        ? {
            ...clone(node),
            position: {
              x: Number(position.x ?? node.position?.x ?? 0),
              y: Number(position.y ?? node.position?.y ?? 0),
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
  const sourcePort = findCanvasPort(sourceNode, sourcePortId);
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
    ["image", "video"].includes(targetNode?.type) &&
    ["text", "image", "any"].includes(sourcePort.kind)
  ) {
    return {
      ...targetPort,
      kind: sourcePort.kind,
    };
  }
  return targetPort;
}

export function removeCanvasNode(document, nodeId) {
  const normalizedNodeId = String(nodeId ?? "");
  return touchCanvasDocument({
    ...clone(document),
    nodes: safeArray(document?.nodes).filter((node) => node.id !== normalizedNodeId).map((node) => clone(node)),
    edges: safeArray(document?.edges)
      .filter((edge) => edge.sourceNodeId !== normalizedNodeId && edge.targetNodeId !== normalizedNodeId)
      .map((edge) => clone(edge)),
  });
}

export function resolveCanvasModelOptions(generationConfig, mediaKind = "image") {
  const modes = MODEL_MODE_BY_MEDIA_KIND[mediaKind] ?? MODEL_MODE_BY_MEDIA_KIND.image;
  return safeArray(generationConfig?.models)
    .filter((model) => model && model.enabled !== false)
    .filter((model) => {
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

function normalizeModeToken(mode) {
  return String(mode ?? "").trim().toLowerCase().replace(/_/g, "-");
}

export function buildCanvasRunPreview(document, nodeId) {
  const node = safeArray(document?.nodes).find((item) => item.id === nodeId);
  if (!node) {
    return { ok: false, reason: "canvas_run_node_missing" };
  }
  if (node.type !== "send") {
    return { ok: false, reason: "canvas_run_send_node_required" };
  }
  const prompt = String(node.data?.prompt ?? "").trim();
  if (!prompt) {
    return { ok: false, reason: "canvas_run_prompt_required" };
  }
  const modelCode = String(node.data?.modelCode ?? "").trim();
  if (!modelCode) {
    return { ok: false, reason: "canvas_run_model_required" };
  }
  return {
    ok: true,
    nodeId,
    mediaKind: String(node.data?.mediaKind ?? "image"),
    modelCode,
    prompt,
    upstreamNodeIds: upstreamNodeIds(document, nodeId),
  };
}

export function applyCanvasRunResult(document, preview, task = null) {
  if (!preview?.ok) {
    return touchCanvasDocument(clone(document));
  }
  const taskId = resolveCanvasTaskId(task);
  const resultKind = preview.mediaKind === "video" ? "video" : "image";
  const resultStatus = task ? "queued" : "preview";
  return touchCanvasDocument({
    ...clone(document),
    nodes: safeArray(document?.nodes).map((node) => {
      if (node.id === preview.nodeId) {
        return {
          ...clone(node),
          data: {
            ...clone(node.data ?? {}),
            status: task ? "queued" : "ready",
            lastRunAt: new Date(0).toISOString(),
            lastTaskId: taskId,
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
