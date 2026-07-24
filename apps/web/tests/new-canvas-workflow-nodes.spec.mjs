import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canvasContentToDocument,
  canvasDocumentToContent,
} from "../new-canvas/src/loomic-core/canvas-document-adapter.js";
import { collectUpstreamCanvasInput } from "../new-canvas/src/loomic-core/canvas-generation.js";
import {
  canvasDirectorResultPatch,
  collectCanvasDirectorRecoveryCandidates,
  findLatestCanvasDirectorResult,
  parseCanvasDirectorResult,
} from "../new-canvas/src/loomic-core/canvas-director-execution.js";
import { createCanvasWorkflowConnection } from "../new-canvas/src/loomic-core/canvas-ports.js";
import {
  canvasWorkflowNodeType,
  canvasWorkflowPorts,
} from "../new-canvas/src/loomic-core/canvas-workflow-edges.js";
import {
  WORKFLOW_NODE_DEFINITIONS,
  createWorkflowNodeElement,
  deleteWorkflowNodeElement,
  updateWorkflowNodeElement,
  workflowNodeAvailabilityLabel,
} from "../new-canvas/src/loomic-core/workflow-node-elements.js";

const toolMenu = await readFile(new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../new-canvas/src/loomic-core/WorkflowNodePanel.jsx", import.meta.url), "utf8");
const overlay = await readFile(new URL("../new-canvas/src/loomic-core/CanvasPortsOverlay.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../new-canvas/src/loomic-core/loomic-core.css", import.meta.url), "utf8");

function canvasApi() {
  let elements = [];
  return {
    getSceneElements: () => elements,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) {
      if (update.elements) elements = update.elements;
    },
  };
}

test("audio node labels follow the live model catalog and persisted task state", () => {
  const audio = { customData: { type: "audio-node", status: "unavailable" } };
  assert.equal(workflowNodeAvailabilityLabel(audio), "暂不可执行");
  assert.equal(workflowNodeAvailabilityLabel(audio, { audioReady: true }), "可执行");
  assert.equal(workflowNodeAvailabilityLabel({ customData: { ...audio.customData, status: "running" } }, { audioReady: true }), "生成中");
  assert.equal(workflowNodeAvailabilityLabel({ customData: { ...audio.customData, sourceKind: "generated" } }, { audioReady: true }), "已生成");
});

test("director node labels expose executable, running, replay, and completed states", () => {
  const director = { customData: { type: "director-node", status: "ready" } };
  assert.equal(workflowNodeAvailabilityLabel(director), "可执行");
  assert.equal(workflowNodeAvailabilityLabel({ customData: { ...director.customData, status: "running" } }), "运行中");
  assert.equal(workflowNodeAvailabilityLabel({ customData: { ...director.customData, status: "running", directorReplayPending: true } }), "待恢复");
  assert.equal(workflowNodeAvailabilityLabel({ customData: { ...director.customData, status: "completed" } }), "已完成");
});

function node(id, type, data = {}) {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 240,
    height: 120,
    customData: { type, ...data },
  };
}

test("remaining LibTV workflow nodes use the existing canonical canvas types", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(WORKFLOW_NODE_DEFINITIONS).map(([key, value]) => [key, value.nodeType])),
    {
      "director-node": "director",
      "script-node": "script",
      "audio-node": "audio",
      "video-composition-node": "output",
    },
  );
  assert.equal(WORKFLOW_NODE_DEFINITIONS["script-node"].availability, "ready");
  assert.equal(WORKFLOW_NODE_DEFINITIONS["director-node"].availability, "ready");
  assert.equal(WORKFLOW_NODE_DEFINITIONS["audio-node"].availability, "unavailable");
  assert.equal(WORKFLOW_NODE_DEFINITIONS["video-composition-node"].availability, "ready");
});

test("workflow node elements create, edit, and delete without inventing run state", () => {
  const api = canvasApi();
  const ids = Object.keys(WORKFLOW_NODE_DEFINITIONS).map((type) => createWorkflowNodeElement(api, type));
  assert.equal(api.getSceneElements().length, 4);
  assert.deepEqual(api.getSceneElements().map((element) => element.customData.type), Object.keys(WORKFLOW_NODE_DEFINITIONS));
  assert.deepEqual(api.getSceneElements().map((element) => element.customData.status), ["ready", "ready", "unavailable", "ready"]);
  assert.equal(new Set(ids).size, 4);

  updateWorkflowNodeElement(api, ids[1], { title: "第一集", text: "雨夜开场" });
  assert.equal(api.getSceneElements()[1].customData.title, "第一集");
  assert.equal(api.getSceneElements()[1].customData.text, "雨夜开场");
  deleteWorkflowNodeElement(api, ids[2]);
  assert.equal(api.getSceneElements()[2].isDeleted, true);
});

test("director, script, audio, and composition ports preserve the established contracts", () => {
  assert.equal(canvasWorkflowNodeType(node("director", "director-node")), "director");
  assert.equal(canvasWorkflowNodeType(node("script", "script-node")), "script");
  assert.equal(canvasWorkflowNodeType(node("audio", "audio-node")), "audio");
  assert.equal(canvasWorkflowNodeType(node("composition", "video-composition-node")), "output");
  assert.deepEqual(canvasWorkflowPorts("script"), { inputs: [], outputs: [{ id: "out_text", kind: "text" }] });
  assert.deepEqual(canvasWorkflowPorts("audio"), {
    inputs: [{ id: "in_text", kind: "text" }],
    outputs: [{ id: "out_audio", kind: "audio" }],
  });
  assert.deepEqual(canvasWorkflowPorts("director"), {
    inputs: [{ id: "in_any", kind: "any" }],
    outputs: [{ id: "out_text", kind: "text" }],
  });
  assert.deepEqual(canvasWorkflowPorts("output"), {
    inputs: [{ id: "in_media", kind: "any", accepts: ["image", "video"] }],
    outputs: [{ id: "out_video", kind: "video" }],
  });

  const script = node("script", "script-node");
  const audio = node("audio", "audio-node");
  const director = node("director", "director-node");
  const image = node("image", "image-generator");
  const video = node("video", "video-generator");
  const composition = node("composition", "video-composition-node");
  assert.equal(createCanvasWorkflowConnection([script, audio], "script", "audio").ok, true);
  assert.equal(createCanvasWorkflowConnection([audio, video], "audio", "video").ok, true);
  assert.equal(createCanvasWorkflowConnection([director, image], "director", "image").ok, true);
  assert.equal(createCanvasWorkflowConnection([video, composition], "video", "composition").ok, true);
  const compositionToVideo = createCanvasWorkflowConnection([composition, video], "composition", "video");
  assert.equal(compositionToVideo.ok, true);
  assert.equal(compositionToVideo.edge.sourcePortId, "out_video");
  assert.equal(compositionToVideo.edge.data.kind, "video");
});

test("composition labels expose stale completed output as pending update", () => {
  assert.equal(workflowNodeAvailabilityLabel({ customData: {
    type: "video-composition-node",
    status: "completed",
    inputUpdated: true,
  } }), "待更新");
  assert.match(panel, /composition && data\?\.inputUpdated\s*\? "待更新"/);
});

test("workflow node semantics survive the cloud document adapter", () => {
  const elements = [
    node("director", "director-node", { title: "导演台 A", instructions: "低机位跟拍", directorResult: "低机位推进，保持人物居中", executionAvailability: "ready" }),
    node("script", "script-node", { title: "第一场", text: "雨夜街道", executionAvailability: "ready" }),
    node("audio", "audio-node", { title: "旁白", notes: "低沉男声", mediaKind: "audio", executionAvailability: "unavailable" }),
    node("composition", "video-composition-node", { title: "成片", mediaKind: "video", executionAvailability: "ready" }),
  ];
  const content = { elements, appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } }, files: {} };
  const document = canvasContentToDocument(content, { canvasProjectId: "canvas-id", projectId: "project-id" });
  const nodes = document.nodes.filter((item) => item.id !== "__loomic_scene_v1__");
  assert.deepEqual(nodes.map((item) => item.type), ["director", "script", "audio", "output"]);
  assert.equal(nodes[0].data.instructions, "低机位跟拍");
  assert.equal(canvasDocumentToContent(document).elements[0].customData.directorResult, "低机位推进，保持人物居中");
  assert.equal(nodes[1].data.text, "雨夜街道");
  assert.equal(nodes[2].data.mediaKind, "audio");
  assert.equal(nodes[3].data.mediaKind, "video");
  assert.equal(nodes[3].data.executionAvailability, "ready");
  assert.deepEqual(canvasDocumentToContent(document), content);
});

test("script text and director instructions feed connected image generation", () => {
  const elements = [
    node("script", "script-node", { text: "雨夜街道" }),
    node("director", "director-node", { instructions: "请设计镜头", directorResult: "低机位缓慢推进" }),
    node("image", "image-generator"),
    { id: "script-image", type: "arrow", startBinding: { elementId: "script" }, endBinding: { elementId: "image" }, customData: { workflowEdge: true } },
    { id: "director-image", type: "arrow", startBinding: { elementId: "director" }, endBinding: { elementId: "image" }, customData: { workflowEdge: true } },
  ];
  const upstream = collectUpstreamCanvasInput(elements, {}, "image");
  assert.deepEqual(upstream.upstreamNodeIds, ["script", "director"]);
  assert.deepEqual(upstream.upstreamTextFragments, ["雨夜街道", "低机位缓慢推进"]);
  elements[1].customData.inputUpdated = true;
  assert.deepEqual(
    collectUpstreamCanvasInput(elements, {}, "image").upstreamTextFragments,
    ["雨夜街道", "请设计镜头"],
  );
  elements[1].customData = { ...elements[1].customData, inputUpdated: false, directorResult: { directorInstructions: "服务端恢复的导演指令" } };
  assert.deepEqual(
    collectUpstreamCanvasInput(elements, {}, "image").upstreamTextFragments,
    ["雨夜街道", "服务端恢复的导演指令"],
  );
});

test("director results parse from synchronous responses and persisted run history", () => {
  assert.deepEqual(parseCanvasDirectorResult({
    runId: "director-run-1",
    runNo: 3,
    status: "succeeded",
    result: { text: "先建立全景，再切人物近景。", structured: { shots: 2 } },
  }), {
    text: "先建立全景，再切人物近景。",
    structured: { shots: 2 },
    runId: "director-run-1",
    runNo: 3,
    status: "succeeded",
  });
  const recovered = findLatestCanvasDirectorResult({
    runs: [
      { id: "failed", status: "failed", outputSnapshot: { text: "不能采用" } },
      { id: "director-run-2", runNo: 2, status: "succeeded", outputSnapshot: { text: "雨夜用冷色侧逆光。", structured: { lighting: "cold" } } },
    ],
  });
  assert.equal(recovered.text, "雨夜用冷色侧逆光。");
  assert.equal(recovered.runId, "director-run-2");
  assert.deepEqual(canvasDirectorResultPatch(recovered), {
    status: "completed",
    executionAvailability: "ready",
    directorResult: "雨夜用冷色侧逆光。",
    directorStructuredResult: { lighting: "cold" },
    directorRunId: "director-run-2",
    directorRunNo: 2,
    inputUpdated: false,
    directorReplayPending: false,
    error: undefined,
  });
  assert.equal(parseCanvasDirectorResult({ result: {} }), null);
});

test("director refresh recovery only inspects unresolved executable nodes", () => {
  assert.deepEqual(collectCanvasDirectorRecoveryCandidates([
    node("ready", "director-node", { status: "ready" }),
    node("running", "director-node", { status: "running", directorIdempotencyKey: "run-key" }),
    node("completed-missing", "director-node", { status: "completed" }),
    node("completed", "director-node", { status: "completed", directorResult: "已有结果" }),
    node("image", "image-generator", { status: "running" }),
    { ...node("deleted", "director-node", { status: "running" }), isDeleted: true },
  ]).map((element) => element.id), ["running", "completed-missing"]);
});

test("remaining node menus and panels expose honest capability states", () => {
  for (const label of ["视频合成", "导演台", "音频", "脚本"]) {
    assert.match(toolMenu, new RegExp(`<strong>${label}<\\/strong>`));
  }
  assert.match(toolMenu, /createWorkflowNode\("video-composition-node"\)/);
  assert.match(toolMenu, /createWorkflowNode\("director-node"\)/);
  assert.match(toolMenu, /createWorkflowNode\("audio-node"\)/);
  assert.match(toolMenu, /createWorkflowNode\("script-node"\)/);
  assert.match(panel, /生成导演指令/);
  assert.match(panel, /重新生成/);
  assert.match(panel, /listCanvasNodeRuns/);
  assert.match(panel, /directorResult/);
  assert.match(panel, /window\.location\.assign\("\/#director"\)/);
  assert.match(panel, /executeCanvasVideoComposition/);
  assert.match(panel, /空空如也，请连接视频节点后操作/);
  assert.doesNotMatch(panel, /合成将按连接顺序读取已归档片段/);
  assert.match(panel, /合成视频/);
  assert.match(panel, /生成音频/);
  assert.match(panel, /maxLength=\{audioTextLimit\}/);
  assert.match(panel, /audioNumberControl\(selectedAudioModel\.raw, "volume"/);
  assert.match(panel, /required=\{audioVoiceRequired\}/);
  assert.match(panel, /supportsAudioParameter\(selectedAudioModel\.raw, "effect"\)/);
  assert.match(panel, /后台没有已启用的音频模型/);
  assert.match(panel, /onCancelGeneration/);
  assert.match(overlay, /loomic-workflow-node-label/);
  assert.match(styles, /\.loomic-workflow-node-label/);
  assert.match(styles, /\.loomic-workflow-capability\.is-unavailable/);
  assert.match(styles, /\.loomic-audio-generator/);
});
