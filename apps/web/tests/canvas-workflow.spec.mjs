import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDefaultCanvasDocument } from "../src/features/production-workbench/canvas/canvas-default-document.js";
import { validateCanvasConnection } from "../src/features/production-workbench/canvas/canvas-edge-rules.js";
import {
  canvasDocumentFromX6Data,
  canvasDocumentToX6Data,
} from "../src/features/production-workbench/canvas/canvas-x6-document.js";
import {
  addCanvasNode,
  applyCanvasRunResult,
  buildCanvasRunPreview,
  buildCanvasSidebarItems,
  connectCanvasNodes,
  createCanvasNodeFromTemplate,
  disconnectCanvasNodes,
  resolveCanvasNodeTemplates,
  updateCanvasViewport,
  removeCanvasNode,
  resolveCanvasModelOptions,
  updateCanvasNodeData,
} from "../src/features/production-workbench/canvas/canvas-state.js";

describe("canvas workflow document", () => {
  it("creates the first functional canvas workflow document", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });

    assert.equal(document.version, 1);
    assert.equal(document.nodes.length, 3);
    assert.equal(document.edges.length, 2);
    assert.deepEqual(document.nodes.map((node) => node.type), ["script", "send", "image"]);
    assert.deepEqual(document.edges.map((edge) => `${edge.sourceNodeId}:${edge.sourcePortId}->${edge.targetNodeId}:${edge.targetPortId}`), [
      "script-source:out_text->send-flow:in_text",
      "send-flow:out_image->image-result:in_image",
    ]);
  });

  it("allows compatible canvas ports and rejects mismatched links", () => {
    assert.deepEqual(
      validateCanvasConnection({ kind: "text", direction: "out" }, { kind: "text", direction: "in" }),
      { ok: true },
    );
    assert.deepEqual(
      validateCanvasConnection({ kind: "image", direction: "out" }, { kind: "text", direction: "in" }),
      { ok: false, reason: "canvas_connection_kind_mismatch" },
    );
    assert.deepEqual(
      validateCanvasConnection({ kind: "text", direction: "in" }, { kind: "text", direction: "in" }),
      { ok: false, reason: "canvas_connection_direction_invalid" },
    );
  });

  it("round trips the canvas document through X6 graph data", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const x6Data = canvasDocumentToX6Data(document);
    const nextDocument = canvasDocumentFromX6Data(x6Data, document);

    assert.equal(x6Data.nodes.length, 3);
    assert.equal(x6Data.edges.length, 2);
    assert.equal(x6Data.nodes[0].shape, "comic-ai-canvas-node");
    assert.equal(x6Data.nodes[0].attrs.title.text, "剧本源");
    assert.equal(x6Data.nodes[0].attrs.status.text, "ready");
    assert.equal(typeof x6Data.nodes[0].attrs.summary.text, "string");
    assert.equal(nextDocument.nodes.length, document.nodes.length);
    assert.equal(nextDocument.edges.length, document.edges.length);
    assert.deepEqual(nextDocument.nodes.map((node) => node.position), document.nodes.map((node) => node.position));
  });

  it("adds editable canvas nodes without touching global workbench model selection", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const workbenchUi = { selectedModelId: "global-video-model" };
    const nextDocument = addCanvasNode(document, {
      type: "video",
      position: { x: 480, y: 360 },
      modelCode: "seedance-video-2",
    });
    const videoNode = nextDocument.nodes.at(-1);

    assert.equal(videoNode.type, "video");
    assert.equal(videoNode.data.modelCode, "seedance-video-2");
    assert.equal(videoNode.data.ports.inputs[0].kind, "image");
    assert.equal(workbenchUi.selectedModelId, "global-video-model");
  });

  it("connects compatible nodes as executable workflow edges", () => {
    const document = addCanvasNode(createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), {
      type: "image",
      id: "image-second",
      position: { x: 1280, y: 240 },
    });

    const result = connectCanvasNodes(document, {
      sourceNodeId: "image-result",
      sourcePortId: "out_image",
      targetNodeId: "image-second",
      targetPortId: "in_image",
    });

    assert.equal(result.ok, true);
    assert.equal(result.edge.sourceNodeId, "image-result");
    assert.equal(result.edge.targetNodeId, "image-second");
    assert.equal(result.edge.data.kind, "image");
    assert.equal(
      result.document.edges.some((edge) => edge.sourceNodeId === "image-result" && edge.targetNodeId === "image-second"),
      true,
    );

    const textToImage = connectCanvasNodes(result.document, {
      sourceNodeId: "script-source",
      sourcePortId: "out_text",
      targetNodeId: "image-second",
      targetPortId: "in_image",
    });

    assert.equal(textToImage.ok, true);
    assert.equal(textToImage.edge.data.kind, "text");

    const invalid = connectCanvasNodes(textToImage.document, {
      sourceNodeId: "image-second",
      sourcePortId: "in_image",
      targetNodeId: "script-source",
      targetPortId: "out_text",
    });

    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, "canvas_connection_direction_invalid");
  });

  it("disconnects workflow edges when dragged back from input to output", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });

    const result = disconnectCanvasNodes(document, {
      sourceNodeId: "send-flow",
      sourcePortId: "out_image",
      targetNodeId: "image-result",
      targetPortId: "in_image",
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.document.edges.some((edge) => edge.sourceNodeId === "send-flow" && edge.targetNodeId === "image-result"),
      false,
    );

    const missing = disconnectCanvasNodes(result.document, {
      sourceNodeId: "send-flow",
      sourcePortId: "out_image",
      targetNodeId: "image-result",
      targetPortId: "in_image",
    });

    assert.equal(missing.ok, false);
  });

  it("exposes Liblib-like template groups for adding common workflow nodes", () => {
    const templates = resolveCanvasNodeTemplates({
      models: [
        { modelCode: "image-live", modelLabel: "Image Live", supportedModes: ["single-image"] },
        { modelCode: "video-live", modelLabel: "Video Live", supportedModes: ["first-frame"] },
      ],
    });

    assert.deepEqual(
      templates.map((template) => `${template.group}:${template.type}`),
      [
        "基础:script",
        "基础:upload",
        "生成:send",
        "生成:image",
        "生成:video",
        "编排:director",
        "编排:output",
      ],
    );
    assert.equal(templates.find((template) => template.type === "send").defaultData.modelCode, "image-live");
    assert.equal(templates.find((template) => template.type === "video").defaultData.modelCode, "video-live");
  });

  it("creates nodes from templates with default labels, prompts, and media kind", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const node = createCanvasNodeFromTemplate(document, {
      type: "send",
      position: { x: 640, y: 260 },
      defaultData: {
        title: "文生图发送",
        modelCode: "image-live",
        prompt: "生成电影感分镜",
        mediaKind: "image",
      },
    });

    assert.equal(node.type, "send");
    assert.equal(node.position.x, 640);
    assert.equal(node.data.title, "文生图发送");
    assert.equal(node.data.modelCode, "image-live");
    assert.equal(node.data.prompt, "生成电影感分镜");
    assert.equal(node.data.mediaKind, "image");
  });

  it("builds sidebar items for node and asset modes", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const nodeItems = buildCanvasSidebarItems(document, {
      mode: "nodes",
      assets: [{ id: "asset-1", title: "角色立绘", kind: "character" }],
    });
    const assetItems = buildCanvasSidebarItems(document, {
      mode: "assets",
      assets: [{ id: "asset-1", title: "角色立绘", kind: "character" }],
    });

    assert.equal(nodeItems.length, 3);
    assert.deepEqual(assetItems, [
      {
        id: "asset-1",
        type: "asset",
        kind: "character",
        title: "角色立绘",
        meta: "素材",
        status: "ready",
      },
    ]);
  });

  it("updates canvas viewport preferences without mutating nodes", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const nextDocument = updateCanvasViewport(document, {
      zoom: 1.25,
      x: -120,
      y: 80,
      gridVisible: false,
      snapEnabled: false,
    });

    assert.deepEqual(nextDocument.viewport, {
      x: -120,
      y: 80,
      zoom: 1.25,
      gridVisible: false,
      snapEnabled: false,
    });
    assert.deepEqual(nextDocument.nodes, document.nodes);
  });

  it("updates send node prompt and model from existing generation config options", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const options = resolveCanvasModelOptions(
      {
        models: [
          { modelCode: "image-live", modelLabel: "Image Live", supportedModes: ["single-image"] },
          { modelCode: "video-live", modelLabel: "Video Live", supportedModes: ["first-frame"] },
        ],
      },
      "image",
    );
    const nextDocument = updateCanvasNodeData(document, "send-flow", {
      prompt: "Generate first interior storyboard",
      modelCode: options[0].modelCode,
      mediaKind: "image",
    });
    const sendNode = nextDocument.nodes.find((node) => node.id === "send-flow");

    assert.deepEqual(options.map((model) => model.modelCode), ["image-live"]);
    assert.equal(sendNode.data.prompt, "Generate first interior storyboard");
    assert.equal(sendNode.data.modelCode, "image-live");
  });

  it("builds a run preview only when a send node has a prompt and model", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const emptyPromptDocument = updateCanvasNodeData(document, "send-flow", { prompt: "   " });
    const readyDocument = updateCanvasNodeData(document, "send-flow", {
      prompt: "Generate first interior storyboard",
      modelCode: "image-live",
      mediaKind: "image",
    });

    assert.deepEqual(buildCanvasRunPreview(emptyPromptDocument, "send-flow"), {
      ok: false,
      reason: "canvas_run_prompt_required",
    });
    assert.deepEqual(buildCanvasRunPreview(readyDocument, "send-flow"), {
      ok: true,
      nodeId: "send-flow",
      mediaKind: "image",
      modelCode: "image-live",
      prompt: "Generate first interior storyboard",
      upstreamNodeIds: ["script-source"],
    });
  });

  it("applies submitted canvas run tasks to connected result nodes", () => {
    const document = updateCanvasNodeData(createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), "send-flow", {
      prompt: "Generate first interior storyboard",
      modelCode: "image-live",
      mediaKind: "image",
    });
    const preview = buildCanvasRunPreview(document, "send-flow");
    const nextDocument = applyCanvasRunResult(document, preview, {
      platform: { tasks: [{ taskId: "task-canvas-1" }] },
    });
    const sendNode = nextDocument.nodes.find((node) => node.id === "send-flow");
    const resultNode = nextDocument.nodes.find((node) => node.id === "image-result");
    const resultEdge = nextDocument.edges.find((edge) => edge.id === "edge-send-image");

    assert.equal(sendNode.data.status, "queued");
    assert.equal(sendNode.data.lastTaskId, "task-canvas-1");
    assert.equal(resultNode.data.status, "queued");
    assert.equal(resultNode.data.taskId, "task-canvas-1");
    assert.equal(resultNode.data.modelCode, "image-live");
    assert.equal(resultNode.data.prompt, "Generate first interior storyboard");
    assert.equal(resultEdge.data.status, "queued");
  });

  it("uses generation task snapshot progress fields for canvas nodes", () => {
    const document = updateCanvasNodeData(createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), "send-flow", {
      prompt: "Generate first interior storyboard",
      modelCode: "image-live",
      mediaKind: "image",
    });
    const preview = buildCanvasRunPreview(document, "send-flow");
    const nextDocument = applyCanvasRunResult(document, preview, {
      taskId: "task-canvas-progress-1",
      status: "running",
      progress_stage: "saving_asset",
      progress_percent: 87,
    });
    const sendNode = nextDocument.nodes.find((node) => node.id === "send-flow");
    const resultNode = nextDocument.nodes.find((node) => node.id === "image-result");

    assert.equal(sendNode.data.status, "running");
    assert.equal(sendNode.data.generationProgress, 87);
    assert.equal(sendNode.data.generationStage, "saving_asset");
    assert.equal(resultNode.data.generationProgress, 87);
    assert.equal(resultNode.data.generationStage, "saving_asset");
  });

  it("removes a canvas node and its attached edges", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const nextDocument = removeCanvasNode(document, "send-flow");

    assert.deepEqual(nextDocument.nodes.map((node) => node.id), ["script-source", "image-result"]);
    assert.deepEqual(nextDocument.edges, []);
  });

  it("renders X6-native node attrs so X6 owns selection dragging and ports", () => {
    const document = addCanvasNode(createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), {
      type: "image",
      position: { x: 440, y: 320 },
    });
    const x6Data = canvasDocumentToX6Data(document);
    const imageNode = x6Data.nodes.at(-1);

    assert.equal(imageNode.shape, "comic-ai-canvas-node");
    assert.equal(imageNode.attrs.title.text, "图片结果");
    assert.equal(imageNode.attrs.summary.text, "等待生成结果");
    assert.equal(imageNode.ports.items.some((port) => port.group === "in"), true);
    assert.equal(imageNode.ports.items.some((port) => port.group === "out"), true);
  });
});
