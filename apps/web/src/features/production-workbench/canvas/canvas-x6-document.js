import { findCanvasPort } from "./canvas-default-document.js";

export function canvasDocumentToX6Data(document) {
  const nodes = (Array.isArray(document?.nodes) ? document.nodes : []).map((node) => ({
    id: node.id,
    shape: "comic-ai-canvas-node",
    x: Number(node.position?.x ?? 0),
    y: Number(node.position?.y ?? 0),
    width: Number(node.size?.width ?? 360),
    height: Number(node.size?.height ?? 240),
    zIndex: 2,
    data: {
      canvasNode: structuredCloneSafe(node),
    },
    attrs: buildX6NodeAttrs(node),
    ports: buildX6Ports(node),
  }));

  const edges = (Array.isArray(document?.edges) ? document.edges : []).map((edge) => ({
    id: edge.id,
    shape: "edge",
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

function buildX6EdgeAttrs(edge) {
  const active = edge?.data?.status === "running";
  return {
    line: {
      stroke: active ? "#5ec7ff" : "rgba(156,168,174,0.82)",
      strokeWidth: active ? 3 : 2.2,
      targetMarker: {
        name: "block",
        width: 8,
        height: 6,
      },
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
  const inputCount = Array.isArray(node?.data?.ports?.inputs) ? node.data.ports.inputs.length : 0;
  const outputCount = Array.isArray(node?.data?.ports?.outputs) ? node.data.ports.outputs.length : 0;
  const active = status === "running" || node?.type === "send";
  return {
    body: {
      stroke: status === "running" ? "#5ec7ff" : "rgba(255,255,255,0.18)",
      strokeWidth: status === "running" ? 2 : 1,
      fill: node?.type === "send" ? "#181f22" : "#161717",
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
  if (node?.type === "script") return "剧本源";
  if (node?.type === "image") return "图片结果";
  if (node?.type === "video") return "视频结果";
  if (node?.type === "upload") return "上传资源";
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
  const nodes = (Array.isArray(x6Data?.nodes) ? x6Data.nodes : []).map((node) => {
    const previous = previousNodes.get(node.id) ?? node.data?.canvasNode ?? {};
    return {
      ...structuredCloneSafe(previous),
      id: node.id,
      position: { x: Number(node.x ?? previous.position?.x ?? 0), y: Number(node.y ?? previous.position?.y ?? 0) },
      size: {
        width: Number(node.width ?? previous.size?.width ?? 360),
        height: Number(node.height ?? previous.size?.height ?? 240),
      },
    };
  });

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
  });

  return {
    ...structuredCloneSafe(previousDocument),
    nodes,
    edges,
    updatedAt: new Date(0).toISOString(),
  };
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
  const inputs = Array.isArray(node?.data?.ports?.inputs) ? node.data.ports.inputs : [];
  const outputs = Array.isArray(node?.data?.ports?.outputs) ? node.data.ports.outputs : [];
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

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
