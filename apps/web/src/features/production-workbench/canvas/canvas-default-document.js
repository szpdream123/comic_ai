export const CANVAS_NODE_SIZES = {
  script: { width: 330, height: 160 },
  send: { width: 360, height: 170 },
  image: { width: 330, height: 160 },
  video: { width: 360, height: 170 },
  audio: { width: 390, height: 220 },
  upload: { width: 360, height: 220 },
  director: { width: 500, height: 340 },
  output: { width: 460, height: 280 },
};

export function createDefaultCanvasDocument(input = {}) {
  const now = new Date(0).toISOString();
  return {
    version: 1,
    projectId: String(input.projectId ?? ""),
    episodeId: String(input.episodeId ?? ""),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createLegacyStarterCanvasDocument(input = {}) {
  const document = createDefaultCanvasDocument(input);
  return {
    ...document,
    nodes: [
      {
        id: "script-source",
        type: "script",
        position: { x: 120, y: 120 },
        size: CANVAS_NODE_SIZES.script,
        data: {
          title: "剧本源",
          status: "ready",
          source: "project_script",
          text: "",
          ports: {
            outputs: [{ id: "out_text", kind: "text", label: "文本" }],
            inputs: [],
          },
        },
      },
      {
        id: "send-flow",
        type: "send",
        position: { x: 520, y: 116 },
        size: CANVAS_NODE_SIZES.send,
        data: {
          title: "发送流",
          status: "running",
          mediaKind: "image",
          modelCode: "gpt-image-2-cn",
          prompt: "",
          ports: {
            inputs: [{ id: "in_text", kind: "text", label: "文本" }],
            outputs: [{ id: "out_image", kind: "image", label: "图片" }],
          },
        },
      },
      {
        id: "image-result",
        type: "image",
        position: { x: 920, y: 120 },
        size: CANVAS_NODE_SIZES.image,
        data: {
          title: "图片结果",
          status: "empty",
          assetId: "",
          ports: {
            inputs: [{ id: "in_image", kind: "image", label: "图片" }],
            outputs: [{ id: "out_image", kind: "image", label: "图片" }],
          },
        },
      },
    ],
    edges: [
      {
        id: "edge-script-send",
        sourceNodeId: "script-source",
        sourcePortId: "out_text",
        targetNodeId: "send-flow",
        targetPortId: "in_text",
        data: { kind: "text", status: "idle" },
      },
      {
        id: "edge-send-image",
        sourceNodeId: "send-flow",
        sourcePortId: "out_image",
        targetNodeId: "image-result",
        targetPortId: "in_image",
        data: { kind: "image", status: "running" },
      },
    ],
  };
}

export function isLegacyStarterCanvasDocument(document) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const edges = Array.isArray(document?.edges) ? document.edges : [];
  if (nodes.length !== 3 || edges.length !== 2) {
    return false;
  }
  const nodeIds = nodes.map((node) => String(node?.id ?? "")).sort();
  const edgeIds = edges.map((edge) => String(edge?.id ?? "")).sort();
  if (nodeIds.join("|") !== "image-result|script-source|send-flow") {
    return false;
  }
  if (edgeIds.join("|") !== "edge-script-send|edge-send-image") {
    return false;
  }
  const scriptNode = nodes.find((node) => node?.id === "script-source");
  const sendNode = nodes.find((node) => node?.id === "send-flow");
  const imageNode = nodes.find((node) => node?.id === "image-result");
  return String(scriptNode?.data?.text ?? "") === "" &&
    String(sendNode?.data?.prompt ?? "") === "" &&
    String(imageNode?.data?.assetId ?? "") === "" &&
    !scriptNode?.data?.textHtml &&
    !sendNode?.data?.resultUrl &&
    !sendNode?.data?.previewUrl &&
    !imageNode?.data?.url &&
    !imageNode?.data?.previewUrl;
}

export function findCanvasPort(node, portId) {
  const inputs = Array.isArray(node?.data?.ports?.inputs) ? node.data.ports.inputs : [];
  const outputs = Array.isArray(node?.data?.ports?.outputs) ? node.data.ports.outputs : [];
  const input = inputs.find((port) => port.id === portId);
  if (input) return { ...input, direction: "in" };
  const output = outputs.find((port) => port.id === portId);
  if (output) return { ...output, direction: "out" };
  return null;
}
