import { addCanvasNode, connectCanvasNodes } from "./canvas-state.js";

const LIBTV_NODE_TYPE_MAP = {
  text: { type: "ai-text", mediaKind: "text", canvasMode: "text" },
  image: { type: "ai-image", mediaKind: "image", canvasMode: "image" },
  video: { type: "ai-video", mediaKind: "video", canvasMode: "video" },
  audio: { type: "ai-audio", mediaKind: "audio", canvasMode: "audio" },
  script: { type: "script", mediaKind: "text", canvasMode: "script" },
  storyboard: { type: "ai-storyboard", mediaKind: "image", canvasMode: "storyboard" },
  "video-clip": { type: "ai-video", mediaKind: "video", canvasMode: "smart-edit", videoGenerationMode: "edit-video" },
};

export function buildLibTvCanvasImportPreview(payload = {}) {
  const project = payload?.project && typeof payload.project === "object" ? payload.project : payload;
  const rawNodes = arrayFrom(project?.nodes, payload?.nodes);
  const rawEdges = arrayFrom(project?.edges, payload?.edges);
  const explicitProjectId = firstText(project?.projectUuid, project?.uuid, project?.id, payload?.projectUuid);
  const projectId = explicitProjectId || `anonymous-${stableToken(JSON.stringify({
    name: firstText(project?.name, project?.title, payload?.name),
    nodes: rawNodes,
    edges: rawEdges,
  }))}`;
  const warnings = [];
  const nodes = rawNodes.map((rawNode, index) => mapLibTvNode(rawNode, index, projectId, warnings));
  if (nodes.length) {
    warnings.push("LibTV project 摘要不包含完整模型配置和受保护素材，导入后请检查模型替换与媒体来源。");
  }
  const nodeIdByExternalId = new Map(nodes.map((node) => [node.externalNodeId, node.id]));
  const edges = rawEdges.flatMap((rawEdge, index) => {
    const sourceExternalId = edgeEndpointId(rawEdge?.source ?? rawEdge?.sourceNodeId ?? rawEdge?.from);
    const targetExternalId = edgeEndpointId(rawEdge?.target ?? rawEdge?.targetNodeId ?? rawEdge?.to);
    const sourceNodeId = nodeIdByExternalId.get(sourceExternalId);
    const targetNodeId = nodeIdByExternalId.get(targetExternalId);
    if (!sourceNodeId || !targetNodeId) {
      warnings.push(`连线 ${index + 1} 的端点不存在，导入时将跳过。`);
      return [];
    }
    return [{
      id: `libtv-edge-${stableToken(`${projectId}:${firstText(rawEdge?.id, `${sourceExternalId}-${targetExternalId}-${index}`)}`)}`,
      externalEdgeId: firstText(rawEdge?.id, String(index + 1)),
      sourceNodeId,
      targetNodeId,
    }];
  });
  return {
    source: "libtv",
    projectId,
    projectName: firstText(project?.name, project?.title, payload?.name, "LibTV 画布"),
    nodes,
    edges,
    warnings,
  };
}

export function applyLibTvCanvasImport(document = {}, preview = {}) {
  let nextDocument = document;
  const warnings = [...(Array.isArray(preview?.warnings) ? preview.warnings : [])];
  const existingNodeIdByExternalIdentity = new Map((Array.isArray(document?.nodes) ? document.nodes : [])
    .map((node) => [externalNodeIdentity(node?.data?.externalProjectId, node?.data?.externalNodeId), node.id])
    .filter(([identity]) => Boolean(identity)));
  const importedNodeIdMap = new Map();
  let importedNodeCount = 0;
  let skippedNodeCount = 0;
  for (const node of Array.isArray(preview?.nodes) ? preview.nodes : []) {
    const externalIdentity = externalNodeIdentity(node.data?.externalProjectId, node.externalNodeId);
    const existingNodeId = existingNodeIdByExternalIdentity.get(externalIdentity)
      ?? nextDocument.nodes?.find?.((item) => item.id === node.id)?.id;
    if (existingNodeId) {
      importedNodeIdMap.set(node.id, existingNodeId);
      skippedNodeCount += 1;
      continue;
    }
    nextDocument = addCanvasNode(nextDocument, {
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    });
    existingNodeIdByExternalIdentity.set(externalIdentity, node.id);
    importedNodeIdMap.set(node.id, node.id);
    importedNodeCount += 1;
  }

  let importedEdgeCount = 0;
  for (const edge of Array.isArray(preview?.edges) ? preview.edges : []) {
    const sourceNodeId = importedNodeIdMap.get(edge.sourceNodeId) ?? edge.sourceNodeId;
    const targetNodeId = importedNodeIdMap.get(edge.targetNodeId) ?? edge.targetNodeId;
    if (nextDocument.edges?.some?.((item) => (
      item.id === edge.id
      || (item.sourceNodeId === sourceNodeId && item.targetNodeId === targetNodeId)
    ))) continue;
    const sourceNode = nextDocument.nodes?.find?.((node) => node.id === sourceNodeId);
    const targetNode = nextDocument.nodes?.find?.((node) => node.id === targetNodeId);
    const sourcePortId = sourceNode?.data?.ports?.outputs?.[0]?.id;
    const targetPortId = targetNode?.data?.ports?.inputs?.[0]?.id;
    if (!sourcePortId || !targetPortId) {
      warnings.push(`无法连接“${sourceNode?.data?.title ?? edge.sourceNodeId}”到“${targetNode?.data?.title ?? edge.targetNodeId}”。`);
      continue;
    }
    const result = connectCanvasNodes(nextDocument, {
      id: edge.id,
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
      data: { source: "libtv", externalEdgeId: edge.externalEdgeId },
    });
    if (!result.ok) {
      warnings.push(`“${sourceNode?.data?.title ?? edge.sourceNodeId}”与“${targetNode?.data?.title ?? edge.targetNodeId}”的数据类型不兼容。`);
      continue;
    }
    nextDocument = result.document;
    importedEdgeCount += 1;
  }
  return { document: nextDocument, importedNodeCount, skippedNodeCount, importedEdgeCount, warnings };
}

function mapLibTvNode(rawNode = {}, index, projectId, warnings) {
  const externalNodeId = firstText(rawNode?.nodeKey, rawNode?.id, rawNode?.key, `node-${index + 1}`);
  const rawType = normalizeLibTvType(rawNode?.type ?? rawNode?.nodeType ?? rawNode?.kind);
  const mapped = LIBTV_NODE_TYPE_MAP[rawType] ?? { type: "ai-text", mediaKind: "text", canvasMode: "text" };
  if (!LIBTV_NODE_TYPE_MAP[rawType]) {
    warnings.push(`节点“${firstText(rawNode?.name, rawNode?.label, externalNodeId)}”类型 ${rawType || "unknown"} 将作为文本节点导入。`);
  }
  const params = rawNode?.data?.params && typeof rawNode.data.params === "object" ? rawNode.data.params : {};
  const data = rawNode?.data && typeof rawNode.data === "object" ? rawNode.data : {};
  const title = firstText(rawNode?.name, rawNode?.displayName, rawNode?.label, data?.name, data?.label, externalNodeId);
  const position = rawNode?.position && typeof rawNode.position === "object" ? rawNode.position : rawNode?.node?.position ?? {};
  const text = firstText(data?.text, data?.content, rawNode?.content);
  const prompt = firstText(params?.prompt, data?.prompt, rawNode?.prompt);
  const importedModelName = firstText(params?.model, params?.modelName, data?.modelName);
  return {
    id: `libtv-${stableToken(`${projectId}:${externalNodeId}`)}`,
    externalNodeId,
    externalType: rawType,
    type: mapped.type,
    position: {
      x: finiteCoordinate(position?.x ?? rawNode?.x, 160 + (index % 4) * 440),
      y: finiteCoordinate(position?.y ?? rawNode?.y, 140 + Math.floor(index / 4) * 390),
    },
    data: {
      title,
      status: "ready",
      mediaKind: mapped.mediaKind,
      canvasMode: mapped.canvasMode,
      source: "libtv_import",
      externalSource: "libtv",
      externalProjectId: projectId,
      externalNodeId,
      externalNodeType: rawType,
      ...(text ? { text } : {}),
      ...(prompt ? { prompt } : {}),
      ...(importedModelName ? { importedModelName } : {}),
      ...(mapped.videoGenerationMode ? { videoGenerationMode: mapped.videoGenerationMode } : {}),
    },
  };
}

function normalizeLibTvType(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function edgeEndpointId(value) {
  return typeof value === "object" && value !== null
    ? firstText(value.nodeKey, value.cell, value.id, value.nodeId)
    : firstText(value);
}

function stableToken(value) {
  const source = String(value ?? "").trim();
  const token = source.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "node";
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${token}-${(hash >>> 0).toString(36)}`;
}

function externalNodeIdentity(projectId, nodeId) {
  const normalizedNodeId = String(nodeId ?? "").trim();
  if (!normalizedNodeId) return "";
  return `${String(projectId ?? "").trim()}\u0000${normalizedNodeId}`;
}

function finiteCoordinate(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function arrayFrom(...values) {
  return values.find(Array.isArray) ?? [];
}
