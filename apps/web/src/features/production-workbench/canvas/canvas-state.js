import { CANVAS_NODE_SIZES, findCanvasPort } from "./canvas-default-document.js";
import { validateCanvasConnection } from "./canvas-edge-rules.js";

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
  audio: new Set(["audio", "voice", "lip-sync"]),
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
};

const CANVAS_NODE_TEMPLATES = [
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
  if (value === "image" || value === "video") {
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
  if (node.type !== "send" && node.type !== "image" && node.type !== "video") {
    return { ok: false, reason: "canvas_run_send_node_required" };
  }
  const prompt = String(node.data?.prompt ?? "").trim();
  const modelCode = String(node.data?.modelCode ?? "").trim();
  if (!modelCode) {
    return { ok: false, reason: "canvas_run_model_required" };
  }
  const upstreamNodeIdList = upstreamNodeIds(document, nodeId);
  const upstreamTextFragmentList = upstreamTextFragments(document, nodeId);
  const combinedPrompt = combineCanvasPrompt(prompt, upstreamTextFragmentList);
  if (!combinedPrompt && !upstreamNodeIdList.length) {
    return { ok: false, reason: "canvas_run_input_required" };
  }
  return {
    ok: true,
    nodeId,
    mediaKind: String(node.data?.mediaKind ?? "image"),
    modelCode,
    prompt: combinedPrompt,
    nodePrompt: prompt,
    videoGenerationMode: String(node.data?.videoGenerationMode ?? node.data?.videoMode ?? ""),
    upstreamNodeIds: upstreamNodeIdList,
    upstreamTextFragments: upstreamTextFragmentList,
  };
}

export function applyCanvasRunResult(document, preview, task = null) {
  if (!preview?.ok) {
    return touchCanvasDocument(clone(document));
  }
  const taskId = resolveCanvasTaskId(task);
  const resultKind = preview.mediaKind === "video" ? "video" : "image";
  const taskStatus = resolveCanvasTaskStatus(task);
  const taskProgress = resolveCanvasTaskProgress(task, taskStatus);
  const taskStage = resolveCanvasTaskStage(task, taskStatus);
  const mediaUrl = resolveCanvasTaskMediaUrl(task, resultKind);
  const resultStatus = task ? taskStatus : "preview";
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
            ...(mediaUrl
              ? {
                  previewUrl: mediaUrl,
                  resultUrl: mediaUrl,
                  url: mediaUrl,
                }
              : {}),
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
            ...(mediaUrl
              ? {
                  previewUrl: mediaUrl,
                  resultUrl: mediaUrl,
                  url: mediaUrl,
                }
              : {}),
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
  const stageProgress = resolveCanvasTaskStageProgress(resolveCanvasTaskStage(task, status));
  if (stageProgress !== null) {
    return stageProgress;
  }
  if (status === "completed") return 100;
  if (status === "running") return 55;
  if (status === "queued") return 12;
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
  if (["queued", "submitted", "created"].includes(normalized)) return 12;
  if (["provider_submitted", "provider_accepted", "accepted"].includes(normalized)) return 24;
  if (["provider_rendering", "provider_running", "rendering", "running", "processing"].includes(normalized)) return 58;
  if (["provider_succeeded", "provider_completed"].includes(normalized)) return 78;
  if (["saving_asset", "persisting_asset", "uploading_asset"].includes(normalized)) return 88;
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
  const candidates = mediaKind === "video"
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

function upstreamTextFragments(document, nodeId) {
  const nodes = safeArray(document?.nodes);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return safeArray(document?.edges)
    .filter((edge) => edge.targetNodeId === nodeId)
    .map((edge) => nodeMap.get(edge.sourceNodeId))
    .filter((node) => node && (node.type === "script" || node.type === "director" || node.data?.mediaKind === "text"))
    .map((node) => ({
      nodeId: String(node.id ?? ""),
      title: String(node.data?.title ?? "鏂囨湰鐗囨"),
      text: normalizeUpstreamText(node.data?.text || stripUpstreamHtml(node.data?.textHtml)),
    }))
    .filter((fragment) => fragment.text);
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
