import { CANVAS_NODE_SIZES, findCanvasPort } from "./canvas-default-document.js";

export function canvasDocumentToX6Data(document) {
  const normalizedNodes = normalizeCanvasGrouping(Array.isArray(document?.nodes) ? document.nodes : []);
  const visibleNodes = normalizedNodes
    .filter((node) => !node?.data?.hiddenByCharacterId);
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const connectedScriptNodeIds = new Set(
    (Array.isArray(document?.edges) ? document.edges : [])
      .filter((edge) => String(edge?.targetPortId ?? "") === "in_text")
      .map((edge) => String(edge?.targetNodeId ?? ""))
      .filter(Boolean),
  );
  const nodes = visibleNodes.map((node) => {
    const nodeData = { ...(node.data ?? {}) };
    delete nodeData.__canvasHasTextInput;
    const canvasNode = normalizeCanvasX6NodePorts(
      node?.type === "script"
        ? {
            ...node,
            data: {
              ...nodeData,
              ...(connectedScriptNodeIds.has(String(node.id)) ? { __canvasHasTextInput: true } : {}),
            },
          }
        : node,
    );
    const size = normalizeCanvasX6NodeSize(canvasNode);
    const childNodeIds = canvasNode?.type === "group"
      ? (canvasNode.data?.childNodeIds ?? []).filter((childId) => visibleNodeIds.has(childId))
      : [];
    return {
      id: canvasNode.id,
      shape: "comic-ai-canvas-special-media-node",
      x: Number(canvasNode.position?.x ?? 0),
      y: Number(canvasNode.position?.y ?? 0),
      width: size.width,
      height: size.height,
      zIndex: canvasNode?.type === "group" ? -1 : 2,
      ...(canvasNode.parentGroupId && visibleNodeIds.has(canvasNode.parentGroupId)
        ? { parent: canvasNode.parentGroupId }
        : {}),
      ...(canvasNode?.type === "group" ? { children: childNodeIds } : {}),
      data: {
        canvasNode: structuredCloneSafe(canvasNode),
      },
      attrs: buildX6NodeAttrs(canvasNode),
      ports: buildX6Ports(canvasNode),
    };
  });

  const edges = (Array.isArray(document?.edges) ? document.edges : [])
    .filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId))
    .map((edge) => ({
    id: edge.id,
    shape: "comic-ai-canvas-edge",
    source: {
      cell: edge.sourceNodeId,
      port: edge.sourcePortId,
    },
    target: {
      cell: edge.targetNodeId,
      port: edge.targetPortId,
    },
    zIndex: 0,
    attrs: buildX6EdgeAttrs(edge),
    data: {
      canvasEdge: structuredCloneSafe(edge),
    },
  }));

  return { nodes, edges };
}

function normalizeCanvasX6NodeSize(node = {}) {
  const defaults = CANVAS_NODE_SIZES[node?.type] ?? { width: 300, height: 180 };
  if (["script", "upload", "source-text", "source-image", "source-video", "source-audio"].includes(node?.type)) {
    return { width: defaults.width, height: defaults.height };
  }
  const requestedWidth = Number(node?.size?.width);
  const requestedHeight = Number(node?.size?.height);
  if (node?.type === "group") {
    return {
      width: Math.max(1, Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : Number(defaults.width ?? 300)),
      height: Math.max(1, Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : Number(defaults.height ?? 180)),
    };
  }
  const minimumWidth = Math.max(240, Math.round(Number(defaults.width ?? 300) * 0.7));
  const minimumHeight = Math.max(140, Math.round(Number(defaults.height ?? 180) * 0.65));
  return {
    width: Math.max(minimumWidth, Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : Number(defaults.width ?? 300)),
    height: Math.max(minimumHeight, Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : Number(defaults.height ?? 180)),
  };
}

function normalizeCanvasX6NodePorts(node = {}) {
  const inputs = Array.isArray(node?.data?.ports?.inputs) ? node.data.ports.inputs : [];
  if (node?.type !== "script" || inputs.length) return node;
  return {
    ...node,
    data: {
      ...(node.data ?? {}),
      ports: {
        ...(node.data?.ports ?? {}),
        inputs: [{ id: "in_text", kind: "text", label: "剧本/小说" }],
        outputs: Array.isArray(node.data?.ports?.outputs) && node.data.ports.outputs.length
          ? node.data.ports.outputs
          : [{ id: "out_text", kind: "text", label: "分镜" }],
      },
    },
  };
}

function buildX6EdgeAttrs(edge) {
  const active = edge?.data?.status === "running";
  return {
    lines: {
      connection: true,
    },
    line: {
      stroke: active ? "#5ec7ff" : "rgba(156,168,174,0.82)",
      strokeWidth: active ? 3 : 2.2,
      targetMarker: {
        name: "block",
        width: 8,
        height: 6,
      },
    },
    flow: {
      stroke: active ? "#8edcff" : "#5ec7ff",
      strokeWidth: active ? 2.4 : 2,
      opacity: active ? 0.96 : 0.78,
    },
  };
}

function buildX6NodeAttrs(node) {
  const status = node?.data?.status ?? "idle";
  const title = node?.data?.title ?? node?.type ?? node?.id ?? "Node";
  const nodeWidth = Number(node?.size?.width ?? 360);
  const modelCode = node?.data?.modelCode ?? "";
  const kindLabel = canvasNodeKindLabel(node);
  const meta = node?.type === "send" ? modelCode || "未选模型" : kindLabel;
  const content = shortCanvasNodeSummary(node);
  const { inputs, outputs } = resolveCanvasX6NodePorts(node);
  const inputCount = inputs.length;
  const outputCount = outputs.length;
  const active = status === "running" || node?.type === "send";
  return {
    body: {
      stroke: status === "running" ? "#5ec7ff" : "rgba(255,255,255,0.18)",
      strokeWidth: status === "running" ? 2 : 1,
      fill: node?.type === "group"
        ? "transparent"
        : node?.type === "send" ? "#181f22" : "#161717",
      rx: 8,
      ry: 8,
    },
    accent: {
      fill: active ? "#5ec7ff" : "rgba(255,255,255,0.22)",
      width: 4,
    },
    title: {
      text: title,
    },
    status: {
      text: status,
      fill: status === "running" ? "#5ec7ff" : "rgba(255,255,255,0.56)",
    },
    meta: {
      text: meta,
      opacity: meta ? 1 : 0,
    },
    summary: {
      text: content,
      textWrap: {
        width: Math.max(180, nodeWidth - 36),
        height: 20,
        ellipsis: true,
      },
    },
    io: {
      text: `${inputCount} in  /  ${outputCount} out`,
    },
  };
}

function canvasNodeKindLabel(node) {
  const canonicalLabels = {
    "ai-text": "AI 文本",
    "ai-image": "AI 图片",
    "ai-video": "AI 视频",
    "ai-audio": "AI 音频",
    "ai-animation": "AI 动画",
    "ai-panorama": "全景预览",
    "ai-markdown": "AI Markdown",
    "ai-storyboard": "图片切分",
    "ai-director": "导演台",
    "source-text": "文本源",
    "source-image": "图片源",
    "source-video": "视频源",
    "source-audio": "音频源",
    comment: "评论",
    group: "节点分组",
  };
  if (canonicalLabels[node?.type]) return canonicalLabels[node.type];
  if (node?.type === "script") return "脚本节点";
  if (node?.type === "image") return "图片结果";
  if (node?.type === "video") return "视频结果";
  if (node?.type === "upload") return "上传资源";
  if (node?.type === "markdown") return "Markdown";
  return node?.type ?? "节点";
}

function shortCanvasNodeSummary(node) {
  if (node?.type === "script") {
    return "向下游提供剧本文本";
  }
  if (node?.type === "image") {
    return node?.data?.taskId ? `任务 ${node.data.taskId}` : "等待生成结果";
  }
  if (node?.type === "send") {
    return node?.data?.modelCode ? "已配置模型与提示词" : "选择模型并填写提示词";
  }
  return truncateCanvasText(String(node?.data?.text ?? node?.data?.prompt ?? "选择后配置节点").trim(), 32);
}

function truncateCanvasText(value, maxLength) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function canvasDocumentFromX6Data(x6Data, previousDocument = {}) {
  const previousNodes = new Map((previousDocument.nodes ?? []).map((node) => [node.id, node]));
  const previousEdges = new Map((previousDocument.edges ?? []).map((edge) => [edge.id, edge]));
  const x6Nodes = Array.isArray(x6Data?.nodes) ? x6Data.nodes : [];
  const visibleNodeIds = new Set(x6Nodes.map((node) => node.id));
  const nodes = x6Nodes.map((node) => {
    const stored = node.data?.canvasNode;
    const previousNode = previousNodes.get(node.id);
    const previous = previousNode?.data?.hiddenByCharacterId && !stored?.data?.hiddenByCharacterId
      ? stored
      : previousNode ?? stored ?? {};
    return normalizeCanvasX6NodePorts({
      ...structuredCloneSafe(previous),
      id: node.id,
      position: { x: Number(node.x ?? previous.position?.x ?? 0), y: Number(node.y ?? previous.position?.y ?? 0) },
      size: {
        width: Number(node.width ?? previous.size?.width ?? 360),
        height: Number(node.height ?? previous.size?.height ?? 240),
      },
    });
  }).concat(
    [...previousNodes.values()]
      .filter((node) => node?.data?.hiddenByCharacterId && !visibleNodeIds.has(node.id))
      .map(structuredCloneSafe),
  );
  const hasX6GroupingMetadata = x6Nodes.some((node) => (
    Object.prototype.hasOwnProperty.call(node, "parent") || Object.prototype.hasOwnProperty.call(node, "children")
  ));
  const preferredParents = new Map();
  if (hasX6GroupingMetadata) {
    const nodeTypes = new Map(nodes.map((node) => [String(node?.id ?? ""), node?.type]));
    for (const node of x6Nodes) {
      if (nodeTypes.get(String(node?.id ?? "")) !== "group") {
        preferredParents.set(String(node?.id ?? ""), null);
      }
    }
    for (const group of x6Nodes) {
      if (nodeTypes.get(String(group?.id ?? "")) !== "group") continue;
      for (const childId of Array.isArray(group?.children) ? group.children.map(String) : []) {
        if (nodeTypes.get(childId) && nodeTypes.get(childId) !== "group") {
          preferredParents.set(childId, String(group.id));
        }
      }
    }
    for (const node of x6Nodes) {
      if (!Object.prototype.hasOwnProperty.call(node, "parent")) continue;
      const nodeId = String(node?.id ?? "");
      const parentId = String(node?.parent ?? "");
      preferredParents.set(nodeId, nodeTypes.get(parentId) === "group" ? parentId : null);
    }
  }
  const normalizedNodes = normalizeCanvasGrouping(nodes, preferredParents);

  const visibleEdgeIds = new Set((Array.isArray(x6Data?.edges) ? x6Data.edges : []).map((edge) => edge.id));
  const hiddenNodeIds = new Set(nodes.filter((node) => node?.data?.hiddenByCharacterId).map((node) => node.id));
  const edges = (Array.isArray(x6Data?.edges) ? x6Data.edges : []).map((edge) => {
    const previous = previousEdges.get(edge.id) ?? edge.data?.canvasEdge ?? {};
    return {
      ...structuredCloneSafe(previous),
      id: edge.id,
      sourceNodeId: edge.source?.cell ?? previous.sourceNodeId ?? "",
      sourcePortId: edge.source?.port ?? previous.sourcePortId ?? "",
      targetNodeId: edge.target?.cell ?? previous.targetNodeId ?? "",
      targetPortId: edge.target?.port ?? previous.targetPortId ?? "",
    };
  }).concat(
    [...previousEdges.values()]
      .filter((edge) => !visibleEdgeIds.has(edge.id) && (
        hiddenNodeIds.has(edge.sourceNodeId) || hiddenNodeIds.has(edge.targetNodeId)
      ))
      .map(structuredCloneSafe),
  );

  return {
    ...structuredCloneSafe(previousDocument),
    nodes: normalizedNodes,
    edges,
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeCanvasGrouping(nodes, preferredParents = new Map()) {
  const clonedNodes = nodes.map(structuredCloneSafe);
  const nodeById = new Map(clonedNodes.map((node) => [String(node?.id ?? ""), node]));
  const groupIds = new Set(clonedNodes
    .filter((node) => node?.type === "group")
    .map((node) => String(node?.id ?? ""))
    .filter(Boolean));
  const childParent = new Map();

  for (const node of clonedNodes) {
    const nodeId = String(node?.id ?? "");
    if (!nodeId || node?.type === "group") continue;
    if (preferredParents.has(nodeId)) {
      const preferredParentId = String(preferredParents.get(nodeId) ?? "");
      if (groupIds.has(preferredParentId)) childParent.set(nodeId, preferredParentId);
      continue;
    }
    const parentGroupId = String(node?.parentGroupId ?? "");
    if (groupIds.has(parentGroupId)) childParent.set(nodeId, parentGroupId);
  }

  for (const group of clonedNodes) {
    const groupId = String(group?.id ?? "");
    if (group?.type !== "group" || !groupIds.has(groupId)) continue;
    for (const childId of Array.isArray(group?.data?.childNodeIds) ? group.data.childNodeIds.map(String) : []) {
      const child = nodeById.get(childId);
      if (child?.type !== "group" && !preferredParents.has(childId) && !childParent.has(childId)) {
        childParent.set(childId, groupId);
      }
    }
  }

  const groupChildren = new Map([...groupIds].map((groupId) => [groupId, []]));
  for (const node of clonedNodes) {
    const nodeId = String(node?.id ?? "");
    const parentGroupId = childParent.get(nodeId);
    if (parentGroupId) groupChildren.get(parentGroupId)?.push(nodeId);
  }

  const normalizedNodes = clonedNodes.map((node) => {
    const nodeId = String(node?.id ?? "");
    if (node?.type === "group") {
      node.data = {
        ...structuredCloneSafe(node.data ?? {}),
        childNodeIds: groupChildren.get(nodeId) ?? [],
      };
      delete node.parentGroupId;
      return node;
    }
    const parentGroupId = childParent.get(nodeId);
    if (parentGroupId) node.parentGroupId = parentGroupId;
    else delete node.parentGroupId;
    return node;
  });
  return constrainCanvasGroupNodePositions(normalizedNodes);
}

export function constrainCanvasGroupNodePositions(nodes = []) {
  const nextNodes = nodes.map(structuredCloneSafe);
  const groupById = new Map(nextNodes
    .filter((node) => node?.type === "group")
    .map((node) => [String(node?.id ?? ""), node]));
  return nextNodes.map((node) => {
    const group = groupById.get(String(node?.parentGroupId ?? ""));
    if (!group || node?.type === "group") return node;
    const groupSize = normalizeCanvasX6NodeSize(group);
    const nodeSize = normalizeCanvasX6NodeSize(node);
    const minX = Number(group.position?.x ?? 0);
    const minY = Number(group.position?.y ?? 0);
    const maxX = Math.max(minX, minX + groupSize.width - nodeSize.width);
    const maxY = Math.max(minY, minY + groupSize.height - nodeSize.height);
    const requestedX = Number(node.position?.x ?? minX);
    const requestedY = Number(node.position?.y ?? minY);
    return {
      ...node,
      position: {
        x: Math.min(maxX, Math.max(minX, Number.isFinite(requestedX) ? requestedX : minX)),
        y: Math.min(maxY, Math.max(minY, Number.isFinite(requestedY) ? requestedY : minY)),
      },
    };
  });
}

export function resolveCanvasConnectionPorts(document, connection) {
  const nodes = new Map((document.nodes ?? []).map((node) => [node.id, node]));
  const sourceNode = nodes.get(connection?.sourceNodeId);
  const targetNode = nodes.get(connection?.targetNodeId);
  return {
    sourcePort: findCanvasPort(sourceNode, connection?.sourcePortId),
    targetPort: findCanvasPort(targetNode, connection?.targetPortId),
  };
}

function buildX6Ports(node) {
  const { inputs, outputs } = resolveCanvasX6NodePorts(node);
  return {
    groups: {
      in: {
        position: "left",
        attrs: {
          circle: {
            r: 7,
            magnet: true,
            stroke: "#7c8a8d",
            strokeWidth: 2,
            fill: "#101211",
          },
        },
      },
      out: {
        position: "right",
        attrs: {
          circle: {
            r: 7,
            magnet: true,
            stroke: "#5ec7ff",
            strokeWidth: 2,
            fill: "#101211",
          },
        },
      },
    },
    items: [
      ...inputs.map((port) => ({ id: port.id, group: "in", data: { kind: port.kind } })),
      ...outputs.map((port) => ({ id: port.id, group: "out", data: { kind: port.kind } })),
    ],
  };
}

function resolveCanvasX6NodePorts(node) {
  return {
    inputs: node?.type === "ai-director"
      ? []
      : Array.isArray(node?.data?.ports?.inputs) ? node.data.ports.inputs : [],
    outputs: Array.isArray(node?.data?.ports?.outputs) ? node.data.ports.outputs : [],
  };
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
