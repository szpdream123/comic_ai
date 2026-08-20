import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyCanvasGenerationBatchSubmission,
  applyCanvasScriptWorkflowLiveEventForTest,
  appendCanvasScriptWorkflowConfigurationsForTest,
  buildCanvasGenerationBatchNodes,
  buildCanvasScriptWorkflowStagePreviewInputForTest,
  buildCanvasScriptWorkflowConfigurations,
  createCanvasScriptWorkflowNodesForTest,
  deleteCanvasScriptWorkflowShotsForTest,
  finalizeCanvasScriptWorkflowPreviewForTest,
  handleNewCanvasHostChangeForTest,
  mergeCanvasScriptWorkflowLiveResultsForTest,
  replaceCanvasScriptWorkflowStageConfigurationsForTest,
  restoreCanvasScriptWorkflowConfigurationsFromPreviewForTest,
  persistCanvasScriptWorkflowLivePreviewForTest,
  recoverCanvasScriptWorkflowStageFromLiveResultForTest,
  recoverStoredCanvasScriptWorkflowStageResultsForTest,
  repairCanvasScriptWorkflowReferencesForTest,
  synchronizeCanvasScriptWorkflowGroupsForTest,
  resolveCanvasNodeVisiblePositionForTest,
  resolveCanvasScriptNodeVisiblePositionForTest,
  synchronizeCanvasScriptWorkflowDeletion,
  updateCanvasScriptWorkflowGenerationStateForTest,
  updateCanvasScriptWorkflowLiveRegionForTest,
} from "../src/features/production-workbench/index.js";

test("batch submission binds every returned task to its canvas node", () => {
  const canvasDocument = {
    version: 1,
    nodes: [
      { id: "image-1", type: "ai-image", data: { mediaKind: "image", status: "ready" } },
      { id: "image-2", type: "ai-image", data: { mediaKind: "image", status: "ready" } },
    ],
    edges: [],
  };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", document: canvasDocument }],
      canvasDocument,
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      taskCenterTasksById: {},
      taskCenterTaskOrder: [],
    },
  };

  const result = applyCanvasGenerationBatchSubmission(workbench, {
    batch: {
      id: "batch-1",
      items: [
        { nodeKey: "image-1", mediaKind: "image", status: "queued", taskId: "task-1" },
        { nodeKey: "image-2", mediaKind: "image", status: "running", taskId: "task-2" },
      ],
    },
  }, [
    { nodeKey: "image-1", mediaKind: "image" },
    { nodeKey: "image-2", mediaKind: "image" },
  ]);

  assert.equal(result.trackedTaskCount, 2);
  assert.deepEqual(workbench.ui.canvasDocument.nodes.map((node) => ({
    id: node.id,
    status: node.data.status,
    taskId: node.data.taskId,
    lastTaskId: node.data.lastTaskId,
  })), [
    { id: "image-1", status: "queued", taskId: "task-1", lastTaskId: "task-1" },
    { id: "image-2", status: "running", taskId: "task-2", lastTaskId: "task-2" },
  ]);
  assert.deepEqual(Object.keys(workbench.ui.taskCenterTasksById).sort(), ["task-1", "task-2"]);
});

test("script workspace shot selection stays local and supports select all state", async () => {
  const canvasDocument = {
    nodes: [
      { id: "script-1", type: "script", data: {} },
      { id: "shot-1", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
      { id: "shot-2", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
    ],
    edges: [],
  };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "shots", selectedShotNodeIds: [] },
      canvasDocument,
    },
  };
  const target = {
    checked: true,
    dataset: { nodeId: "shot-1" },
    matches(selector) {
      if (selector === "[data-canvas-script-shot-selection], [data-canvas-script-shot-select-all]") return true;
      return selector === "[data-canvas-script-shot-selection]";
    },
    closest() { return null; },
  };

  assert.equal(await handleNewCanvasHostChangeForTest(workbench, target), true);
  assert.deepEqual(workbench.ui.canvasScriptWorkspace.selectedShotNodeIds, ["shot-1"]);
});

test("batch deletion removes only selected storyboard children and parent references", () => {
  const document = {
    nodes: [
      { id: "script-1", type: "script", data: { workflowNodes: [{ id: "shot-1", kind: "storyboard" }, { id: "shot-2", kind: "storyboard" }, { id: "role-1", kind: "character" }] } },
      { id: "shot-1", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
      { id: "shot-2", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
      { id: "role-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "character" } },
    ],
    edges: [
      { id: "edge-shot-1", sourceNodeId: "role-1", targetNodeId: "shot-1" },
      { id: "edge-shot-2", sourceNodeId: "role-1", targetNodeId: "shot-2" },
    ],
  };

  const result = deleteCanvasScriptWorkflowShotsForTest(document, "script-1", ["shot-1", "role-1"]);

  assert.deepEqual(result.nodes.map((node) => node.id), ["script-1", "shot-2", "role-1"]);
  assert.deepEqual(result.edges.map((edge) => edge.id), ["edge-shot-2"]);
  assert.deepEqual(result.nodes[0].data.workflowNodes, [
    { id: "shot-2", kind: "storyboard" },
    { id: "role-1", kind: "character" },
  ]);
});

test("script workflow collects sent prompts and model deltas while generation is running", () => {
  const workbench = { ui: {} };

  applyCanvasScriptWorkflowLiveEventForTest(workbench, "script-1", {
    event: "asset_prompt",
    data: { stage: "scene", text: "提取剧本中的全部场景" },
  });
  applyCanvasScriptWorkflowLiveEventForTest(workbench, "script-1", {
    event: "asset_delta",
    data: { stage: "scene", text: '{"scenes":[' },
  });
  applyCanvasScriptWorkflowLiveEventForTest(workbench, "script-1", {
    event: "asset_delta",
    data: { stage: "scene", text: '{"sceneName":"城门口"}]}' },
  });
  applyCanvasScriptWorkflowLiveEventForTest(workbench, "script-1", {
    event: "asset_done",
    data: { stage: "scene", text: '{"scenes":[{"sceneName":"城门口"}]}' },
  });

  const preview = workbench.ui.canvasScriptLivePreviewByNodeId["script-1"];
  assert.equal(preview.status, "running");
  assert.equal(preview.stages.scene.promptText, "提取剧本中的全部场景");
  assert.equal(preview.stages.scene.responseText, '{"scenes":[{"sceneName":"城门口"}]}');
  assert.equal(preview.stages.scene.status, "completed");
});

test("script workflow updates only its live result region and keeps the newest output visible", () => {
  const count = { textContent: "" };
  const overall = { dataset: {} };
  const overallLabel = { textContent: "" };
  const statusLabel = { textContent: "" };
  const regenerate = { disabled: true, textContent: "生成中" };
  const response = { textContent: "旧内容", scrollTop: 0, scrollHeight: 360 };
  const sceneCard = {
    dataset: {},
    querySelector(selector) {
      if (selector === "[data-script-live-status-label]") return statusLabel;
      if (selector === '[data-action="open-canvas-script-stage-regenerate"]') return regenerate;
      if (selector === "[data-script-live-response]") return response;
      return null;
    },
  };
  const layer = {
    querySelector(selector) {
      if (selector === "[data-script-live-completed-count]") return count;
      if (selector === ".script-workspace-live-overall") return overall;
      if (selector === "[data-script-live-overall-label]") return overallLabel;
      if (selector === '[data-live-prompt-stage="scene"]') return sceneCard;
      return null;
    },
  };
  const workbench = {
    root: { querySelector: () => layer },
    ui: {
      canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "live" },
      canvasScriptLivePreviewByNodeId: {
        "script-1": {
          status: "running",
          activeStage: "scene",
          stages: {
            shot: { status: "pending", responseText: "" },
            character: { status: "pending", responseText: "" },
            scene: { status: "running", responseText: "最新模型返回" },
            prop: { status: "pending", responseText: "" },
          },
        },
      },
    },
  };

  assert.equal(updateCanvasScriptWorkflowLiveRegionForTest(workbench, "script-1"), true);
  assert.equal(response.textContent, "最新模型返回");
  assert.equal(response.scrollTop, 360);
  assert.equal(statusLabel.textContent, "生成中");
  assert.equal(regenerate.disabled, true);
  assert.equal(regenerate.textContent, "生成中");
  assert.equal(overallLabel.textContent, "正在生成");
  assert.equal(count.textContent, "0/4 已返回");
});

test("script workflow persists only returned results on its script node", () => {
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocument: {
        version: 1,
        nodes: [{ id: "script-1", type: "script", data: {} }],
        edges: [],
      },
      canvasScriptLivePreviewByNodeId: {
        "script-1": {
          status: "completed",
          activeStage: "completed",
          stages: {
            shot: { status: "completed", promptText: "不要保存发送内容", responseText: "分镜返回结果" },
            character: { status: "completed", promptText: "不要保存发送内容", responseText: "角色返回结果" },
            scene: { status: "completed", promptText: "不要保存发送内容", responseText: "场景返回结果" },
            prop: { status: "completed", promptText: "不要保存发送内容", responseText: "道具返回结果" },
          },
        },
      },
    },
  };

  assert.equal(persistCanvasScriptWorkflowLivePreviewForTest(workbench, "script-1"), true);
  const stored = workbench.ui.canvasDocument.nodes[0].data.workflowLivePreview;
  assert.equal(stored.status, "completed");
  assert.equal(stored.stages.shot.responseText, "分镜返回结果");
  assert.equal("promptText" in stored.stages.shot, false);
});

test("script workflow parses streamed stage results when the complete preview is empty", () => {
  const workbench = { ui: {} };
  const stageResults = {
    character: '{"characters":[{"characterName":"任小野","characterImagePrompt":"少年角色设定"}]}',
    scene: '{"scenes":[{"sceneName":"铁木城门","sceneImagePrompt":"黄昏城门全景"}]}',
    prop: "### 道具 1\n**名称**：切割刀\n**外观/材质**：黑色金属\n**生图提示词**：黑色短刀设定\n\n### 道具 2\n**名称**：灰晶\n**外观/材质**：灰色晶体\n**生图提示词**：灰色晶体设定",
    shot: '{"storyboards":[{"shotNo":1,"plot":"任小野走进铁木城门","videoPrompt":"镜头缓慢推进"}]}',
  };
  for (const [stage, result] of Object.entries(stageResults)) {
    applyCanvasScriptWorkflowLiveEventForTest(workbench, "script-1", {
      event: "asset_done",
      data: { stage, text: result },
    });
  }
  applyCanvasScriptWorkflowLiveEventForTest(workbench, "script-1", {
    event: "complete",
    data: { preview: { commitPayload: { characters: [], scenes: [], props: [], storyboards: [] }, rawMarkdown: {} } },
  });

  const merged = mergeCanvasScriptWorkflowLiveResultsForTest(workbench, "script-1", {
    commitPayload: { characters: [], scenes: [], props: [], storyboards: [] },
    rawMarkdown: {},
  });
  const finalized = finalizeCanvasScriptWorkflowPreviewForTest(merged, {
    scriptText: "任小野在黄昏走进铁木城门。",
    scriptRawText: "任小野在黄昏走进铁木城门。",
    data: {},
    assetPromptSteps: [],
  });
  const configurations = buildCanvasScriptWorkflowConfigurations(finalized);

  assert.deepEqual(configurations.map((item) => item.kind), ["character", "scene", "prop", "prop", "storyboard"]);
  assert.deepEqual(configurations.map((item) => item.title), ["任小野", "铁木城门", "切割刀", "灰晶", "分镜 1"]);
});

test("script workflow status refresh cannot replace newly appended nodes with the stale X6 graph", () => {
  const canvasDocument = {
    version: 1,
    nodes: [
      { id: "script-1", type: "script", position: { x: 100, y: 100 }, data: { workflowStatus: "running" } },
      { id: "role-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "character" } },
    ],
    edges: [],
  };
  let refreshOptions = null;
  const cell = {
    id: "script-1",
    getData: () => ({ canvasNode: canvasDocument.nodes[0] }),
    setData(_next, options) { refreshOptions = options; },
    getPosition: () => ({ x: 100, y: 100 }),
    getSize: () => ({ width: 500, height: 240 }),
    getAttrs: () => ({}),
    setAttrs() {},
    getProp: () => undefined,
    setProp() {},
    getZIndex: () => 1,
    getParent: () => null,
  };
  const workbench = {
    canvasGraph: { getCellById: () => cell },
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      canvasScriptWorkspace: { open: true, scriptNodeId: "script-1" },
      canvasDocument,
    },
  };

  assert.equal(updateCanvasScriptWorkflowGenerationStateForTest(workbench, "script-1", { workflowStatus: "completed" }), true);
  assert.deepEqual(refreshOptions, { canvasNodeRefresh: true });
  assert.deepEqual(workbench.ui.canvasDocument.nodes.map((node) => node.id), ["script-1", "role-1"]);
});

test("script workflow restores dangling saved results without another model request", () => {
  const stageResults = {
    character: '{"characters":[{"characterName":"任小野","characterImagePrompt":"少年角色设定"}]}',
    scene: '{"scenes":[{"sceneName":"铁木城门","sceneImagePrompt":"黄昏城门全景"}]}',
    prop: '{"props":[{"propName":"切割刀","propImagePrompt":"黑色短刀设定"}]}',
    shot: '{"storyboards":[{"shotNo":1,"plot":"任小野走进铁木城门","videoPrompt":"镜头缓慢推进"}]}',
  };
  const canvasDocument = {
    version: 1,
    nodes: [{
      id: "script-1",
      type: "script",
      position: { x: 100, y: 100 },
      data: {
        workflowNodes: [{ id: "missing-role", kind: "character" }, { id: "missing-shot", kind: "storyboard" }],
        workflowLivePreview: {
          status: "completed",
          stages: Object.fromEntries(Object.entries(stageResults).map(([stage, responseText]) => [stage, {
            status: "completed",
            responseText,
          }])),
        },
      },
    }],
    edges: [],
  };
  const workbench = {
    state: { project: { aspectRatio: "16:9" } },
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      episodeGenerationConfig: { models: [] },
      canvasDocument,
    },
  };

  const result = restoreCanvasScriptWorkflowConfigurationsFromPreviewForTest(workbench, "script-1");
  const children = workbench.ui.canvasDocument.nodes.filter((node) => node.data?.workflowParentId === "script-1");
  const parent = workbench.ui.canvasDocument.nodes.find((node) => node.id === "script-1");

  assert.equal(result.ok, true);
  assert.equal(result.restored, true);
  assert.deepEqual(children.map((node) => node.data.workflowKind), ["character", "scene", "prop", "storyboard"]);
  assert.equal(parent.data.workflowNodes.some((item) => item.id === "missing-role" || item.id === "missing-shot"), false);
  assert.equal(parent.data.workflowNodes.every((item) => workbench.ui.canvasDocument.nodes.some((node) => node.id === item.id)), true);
});

test("script workflow removes duplicate parent references when a dangling id is recreated", () => {
  const canvasDocument = {
    version: 1,
    nodes: [{
      id: "script-1",
      type: "script",
      position: { x: 100, y: 100 },
      data: { ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] } },
    }],
    edges: [],
  };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      episodeGenerationConfig: { models: [] },
      canvasDocument,
    },
  };
  const configuration = [{ kind: "character", type: "ai-image", title: "主角", prompt: "角色提示词" }];
  const first = appendCanvasScriptWorkflowConfigurationsForTest(workbench, "script-1", configuration);
  const recreatedId = first.nodeIds[0];
  const corrupted = {
    ...workbench.ui.canvasDocument,
    nodes: workbench.ui.canvasDocument.nodes.filter((node) => node.id !== recreatedId),
    edges: [],
  };
  workbench.ui.canvasDocument = corrupted;
  workbench.ui.canvasDocumentsByProject = { "canvas-1": corrupted };

  const restored = appendCanvasScriptWorkflowConfigurationsForTest(workbench, "script-1", configuration);
  const references = workbench.ui.canvasDocument.nodes.find((node) => node.id === "script-1").data.workflowNodes;

  assert.equal(restored.nodeIds[0], recreatedId);
  assert.deepEqual(references, [{ id: recreatedId, kind: "character" }]);
});

test("script workflow creates and binds one image asset node for every distinct typed @ reference", () => {
  const canvasDocument = {
    version: 1,
    nodes: [{
      id: "script-1",
      type: "script",
      position: { x: 100, y: 100 },
      data: { ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] } },
    }],
    edges: [],
  };
  const workbench = {
    state: { project: { aspectRatio: "16:9" } },
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      episodeGenerationConfig: { models: [] },
      canvasDocument,
    },
  };

  const result = appendCanvasScriptWorkflowConfigurationsForTest(workbench, "script-1", [
    { kind: "character", type: "ai-image", title: "任小野", prompt: "任小野角色参考图" },
    { kind: "scene", type: "ai-image", title: "城门主景", prompt: "城门主景参考图" },
    { kind: "prop", type: "ai-image", title: "城墙警钟", prompt: "城墙警钟参考图" },
    {
      kind: "storyboard",
      type: "ai-video",
      title: "分镜 1",
      prompt: [
        "视频场景对照表: 城门外=@城门外",
        "视频角色对照表: 任小野=@任小野；城防士兵=@城防士兵",
        "视频道具对照表: 警笛=@警笛",
      ].join("\n"),
      data: { videoGenerationMode: "reference-video" },
    },
  ]);

  assert.equal(result.ok, true);
  const document = workbench.ui.canvasDocument;
  const shot = document.nodes.find((node) => node.data?.workflowKind === "storyboard");
  const titleById = new Map(document.nodes.map((node) => [String(node.id), node.data?.title]));
  assert.deepEqual(shot.data.scriptWorkflowReferenceBindings.map((binding) => binding.mention), [
    "@城门外",
    "@任小野",
    "@城防士兵",
    "@警笛",
  ]);
  assert.deepEqual(shot.data.scriptWorkflowReferenceBindings.map((binding) => titleById.get(String(binding.nodeId))), [
    "城门外",
    "任小野",
    "城防士兵",
    "警笛",
  ]);
  assert.equal(new Set(shot.data.scriptWorkflowReferenceNodeIds).size, 4);
  const groups = document.nodes.filter((node) => node.type === "group" && node.data?.scriptWorkflowParentId === "script-1");
  const assetGroup = groups.find((node) => node.data?.scriptWorkflowGroupKind === "assets");
  const storyboardGroup = groups.find((node) => node.data?.scriptWorkflowGroupKind === "storyboards");
  assert.equal(groups.length, 2);
  assert.deepEqual(assetGroup.data.childNodeIds.map((nodeId) => titleById.get(String(nodeId))), [
    "任小野",
    "城门主景",
    "城墙警钟",
    "城门外",
    "城防士兵",
    "警笛",
  ]);
  assert.deepEqual(storyboardGroup.data.childNodeIds, [shot.id]);
  assert.ok(assetGroup.data.childNodeIds.every((nodeId) => document.nodes.find((node) => node.id === nodeId)?.parentGroupId === assetGroup.id));
  assert.equal(shot.parentGroupId, storyboardGroup.id);
});

test("script workflow creates two stable executable groups for saved asset and storyboard nodes", () => {
  const document = {
    version: 1,
    nodes: [
      { id: "script-1", type: "script", data: {} },
      { id: "role-1", type: "ai-image", position: { x: 100, y: 200 }, size: { width: 320, height: 180 }, data: { workflowParentId: "script-1", workflowKind: "character" } },
      { id: "scene-1", type: "ai-image", position: { x: 100, y: 420 }, size: { width: 320, height: 180 }, data: { workflowParentId: "script-1", workflowKind: "scene" } },
      { id: "shot-1", type: "ai-video", position: { x: 520, y: 200 }, size: { width: 320, height: 180 }, data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
      { id: "shot-2", type: "ai-video", position: { x: 520, y: 420 }, size: { width: 320, height: 180 }, data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
    ],
    edges: [],
  };

  const first = synchronizeCanvasScriptWorkflowGroupsForTest(document, "script-1");
  const second = synchronizeCanvasScriptWorkflowGroupsForTest(first.document, "script-1");
  const groups = first.document.nodes.filter((node) => node.type === "group");

  assert.equal(first.changed, true);
  assert.equal(first.createdGroupIds.length, 2);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.find((node) => node.data.scriptWorkflowGroupKind === "assets").data.childNodeIds, ["role-1", "scene-1"]);
  assert.deepEqual(groups.find((node) => node.data.scriptWorkflowGroupKind === "storyboards").data.childNodeIds, ["shot-1", "shot-2"]);
  assert.equal(second.changed, false);
  assert.deepEqual(second.createdGroupIds, []);
  assert.equal(second.document.nodes.filter((node) => node.type === "group").length, 2);
});

test("script workflow rewrites legacy @ aliases to the actual asset node title", () => {
  const canvasDocument = {
    version: 1,
    nodes: [{
      id: "script-1",
      type: "script",
      position: { x: 100, y: 100 },
      data: { ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] } },
    }],
    edges: [],
  };
  const workbench = {
    state: { project: { aspectRatio: "16:9" } },
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      episodeGenerationConfig: { models: [] },
      canvasDocument,
    },
  };

  appendCanvasScriptWorkflowConfigurationsForTest(workbench, "script-1", [
    { kind: "prop", type: "ai-image", title: "切割刀（任小野的短刀）", prompt: "黑色短刀" },
    {
      kind: "storyboard",
      type: "ai-video",
      title: "分镜 1",
      prompt: "视频道具对照表: 切割刀=@切割刀",
    },
  ]);

  const document = workbench.ui.canvasDocument;
  const props = document.nodes.filter((node) => node.data?.workflowKind === "prop");
  const shot = document.nodes.find((node) => node.data?.workflowKind === "storyboard");
  assert.equal(props.length, 1);
  assert.match(shot.data.prompt, /切割刀=@切割刀（任小野的短刀）/);
  assert.deepEqual(shot.data.scriptWorkflowReferenceBindings, [{
    mention: "@切割刀（任小野的短刀）",
    nodeId: props[0].id,
  }]);
});

test("script workflow repairs saved shots with missing @ asset bindings without a model request", () => {
  const prompt = [
    "视频场景对照表: 城门外=@城门外",
    "视频角色对照表: 任小野=@任小野；城防士兵=@城防士兵",
    "视频道具对照表: 警笛=@警笛",
  ].join("\n");
  const canvasDocument = {
    version: 1,
    nodes: [
      { id: "script-1", type: "script", position: { x: 100, y: 100 }, data: { workflowNodes: [], ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] } } },
      { id: "role-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "character", title: "任小野", prompt: "角色参考图", ports: { inputs: [], outputs: [{ id: "out_image", kind: "image" }] } } },
      { id: "shot-1", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard", title: "分镜 1", prompt, ports: { inputs: [{ id: "in_any", kind: "any" }], outputs: [] }, scriptWorkflowReferenceNodeIds: ["role-1"], scriptWorkflowReferenceBindings: [{ mention: "@任小野", nodeId: "role-1" }] } },
    ],
    edges: [],
  };
  const workbench = {
    state: { project: { aspectRatio: "16:9" } },
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      episodeGenerationConfig: { models: [] },
      canvasDocument,
    },
  };

  const repaired = repairCanvasScriptWorkflowReferencesForTest(workbench, "script-1");
  const shot = workbench.ui.canvasDocument.nodes.find((node) => node.id === "shot-1");

  assert.equal(repaired.changed, true);
  assert.equal(repaired.createdNodeIds.length, 3);
  assert.deepEqual(shot.data.scriptWorkflowReferenceBindings.map((binding) => binding.mention), [
    "@城门外",
    "@任小野",
    "@城防士兵",
    "@警笛",
  ]);
  assert.equal(new Set(shot.data.scriptWorkflowReferenceNodeIds).size, 4);
});

test("single script stage request sends only its selected skill and disables default stages", () => {
  assert.deepEqual(
    buildCanvasScriptWorkflowStagePreviewInputForTest("第一场：雨夜。", "scene_extract", "scene-skill-1", "text-model"),
    {
      scriptText: "第一场：雨夜。",
      skipScriptStage: true,
      useDefaultWorkflowStages: false,
      skills: { scene_extract: "scene-skill-1" },
      modelCode: "text-model",
    },
  );
});

test("single script stage regeneration updates only that asset category", () => {
  const canvasDocument = {
    version: 1,
    nodes: [
      { id: "script-1", type: "script", data: { workflowNodes: [{ id: "role-1", kind: "character" }, { id: "scene-1", kind: "scene" }] } },
      { id: "role-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "character", title: "旧角色", prompt: "旧角色提示词" } },
      { id: "scene-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "scene", title: "保留场景", prompt: "保留场景提示词" } },
    ],
    edges: [],
  };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      canvasDocument,
    },
  };

  const result = replaceCanvasScriptWorkflowStageConfigurationsForTest(workbench, "script-1", "character", [{
    kind: "character",
    type: "ai-image",
    title: "新角色",
    prompt: "新角色提示词",
  }]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.nodeIds, ["role-1"]);
  assert.equal(workbench.ui.canvasDocument.nodes.find((node) => node.id === "role-1").data.title, "新角色");
  assert.equal(workbench.ui.canvasDocument.nodes.find((node) => node.id === "scene-1").data.title, "保留场景");
});

test("single script stage keeps a parseable streamed result successful when the stream ends with an error", () => {
  const canvasDocument = {
    version: 1,
    nodes: [
      { id: "script-1", type: "script", data: { workflowNodes: [{ id: "prop-1", kind: "prop" }] } },
      { id: "prop-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "prop", title: "旧道具", prompt: "旧提示词" } },
    ],
    edges: [],
  };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      canvasDocument,
      canvasScriptLivePreviewByNodeId: {
        "script-1": {
          status: "running",
          activeStage: "prop",
          stages: {
            shot: { status: "completed", responseText: "分镜结果" },
            character: { status: "completed", responseText: "角色结果" },
            scene: { status: "completed", responseText: "场景结果" },
            prop: {
              status: "completed",
              responseText: '{"props":[{"propName":"切割刀","propImagePrompt":"黑色短刀设定"}]}',
            },
          },
        },
      },
    },
  };

  const result = recoverCanvasScriptWorkflowStageFromLiveResultForTest(
    workbench,
    "script-1",
    "prop",
    "第一场：任小野拿出切割刀。",
    "prop",
  );

  assert.equal(result.ok, true);
  assert.equal(workbench.ui.canvasDocument.nodes.find((node) => node.id === "prop-1").data.title, "切割刀");
  assert.equal(workbench.ui.canvasScriptLivePreviewByNodeId["script-1"].status, "completed");
  assert.equal(workbench.ui.canvasScriptLivePreviewByNodeId["script-1"].activeStage, "completed");
  assert.equal(workbench.ui.canvasScriptLivePreviewByNodeId["script-1"].stages.prop.status, "completed");
});

test("single script stage does not accept a parseable partial delta as a completed result", () => {
  const canvasDocument = {
    version: 1,
    nodes: [
      { id: "script-1", type: "script", data: { workflowNodes: [{ id: "prop-1", kind: "prop" }] } },
      { id: "prop-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "prop", title: "保留道具", prompt: "保留提示词" } },
    ],
    edges: [],
  };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      canvasDocument,
      canvasScriptLivePreviewByNodeId: {
        "script-1": {
          status: "running",
          activeStage: "prop",
          stages: {
            prop: {
              status: "running",
              responseText: '{"props":[{"propName":"半截道具","propImagePrompt":"未完成内容"}]}',
            },
          },
        },
      },
    },
  };

  const result = recoverCanvasScriptWorkflowStageFromLiveResultForTest(
    workbench,
    "script-1",
    "prop",
    "第一场。",
    "prop",
  );

  assert.equal(result, null);
  assert.equal(workbench.ui.canvasDocument.nodes.find((node) => node.id === "prop-1").data.title, "保留道具");
});

test("stored failed stage status is recovered only when its parsed result already matches saved nodes", () => {
  const responseText = '{"props":[{"propName":"切割刀","propImagePrompt":"黑色短刀设定"}]}';
  const canvasDocument = {
    version: 1,
    nodes: [
      {
        id: "script-1",
        type: "script",
        data: {
          text: "第一场：任小野拿出切割刀。",
          workflowNodes: [{ id: "prop-1", kind: "prop" }],
          workflowLivePreview: {
            status: "failed",
            activeStage: "prop",
            stages: {
              shot: { status: "completed", responseText: "分镜结果" },
              character: { status: "completed", responseText: "角色结果" },
              scene: { status: "completed", responseText: "场景结果" },
              prop: { status: "failed", responseText },
            },
          },
        },
      },
      { id: "prop-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "prop", title: "切割刀", prompt: "黑色短刀设定" } },
    ],
    edges: [],
  };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: { "canvas-1": canvasDocument },
      canvasDocument,
    },
  };

  assert.deepEqual(recoverStoredCanvasScriptWorkflowStageResultsForTest(workbench, "script-1"), ["道具"]);
  assert.equal(workbench.ui.canvasScriptLivePreviewByNodeId["script-1"].status, "completed");
  assert.equal(workbench.ui.canvasDocument.nodes.length, 2);
  assert.deepEqual(recoverStoredCanvasScriptWorkflowStageResultsForTest(workbench, "script-1"), []);
  assert.equal(workbench.ui.canvasDocument.nodes.length, 2);
});

test("generating a script connects the script node to its AI text node", () => {
  const workbench = {
    state: { project: { aspectRatio: "16:9" } },
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: {},
      episodeGenerationConfig: { models: [] },
      canvasDocument: {
        version: 1,
        nodes: [{
          id: "script-1",
          type: "script",
          position: { x: 100, y: 100 },
          data: {
            sourceMode: "novel",
            novelText: "少女在雨夜进入旧城区。",
            ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] },
          },
        }],
        edges: [],
      },
    },
  };

  const result = createCanvasScriptWorkflowNodesForTest(workbench, "script-1", "script");

  assert.equal(result.ok, true);
  assert.equal(result.nodeIds.length, 1);
  const generatedNodeId = result.nodeIds[0];
  assert.equal(workbench.ui.canvasDocument.edges.some((edge) => (
    edge.sourceNodeId === "script-1" &&
    edge.sourcePortId === "out_text" &&
    edge.targetNodeId === generatedNodeId &&
    edge.targetPortId === "in_text"
  )), true);
});

test("script workflow keeps pending asset references in the batch before its video", () => {
  const workbench = {
    state: { project: { aspectRatio: "16:9" } },
    ui: {
      canvasDocument: {
        version: 1,
        nodes: [
          { id: "role", type: "ai-image", data: { mediaKind: "image", prompt: "角色参考图", modelCode: "image-model", workflowParentId: "script", workflowKind: "character" } },
          { id: "scene", type: "ai-image", data: { mediaKind: "image", prompt: "场景参考图", modelCode: "image-model", workflowParentId: "script", workflowKind: "scene" } },
          {
            id: "shot",
            type: "ai-video",
            data: {
              mediaKind: "video",
              prompt: "@主角走入@街道。",
              modelCode: "video-model",
              workflowParentId: "script",
              workflowKind: "storyboard",
              scriptWorkflowReferenceBindings: [
                { mention: "@主角", nodeId: "role" },
                { mention: "@街道", nodeId: "scene" },
              ],
            },
          },
        ],
        edges: [
          { id: "role-shot", sourceNodeId: "role", targetNodeId: "shot" },
          { id: "scene-shot", sourceNodeId: "scene", targetNodeId: "shot" },
        ],
      },
      episodeGenerationConfig: { models: [] },
    },
  };

  const nodes = buildCanvasGenerationBatchNodes(workbench, ["role", "scene", "shot"]);
  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes[2].dependsOn, ["role", "scene"]);
  assert.equal(nodes[2].payload.prompt, "图1中的主角走入图2中的街道。");
  assert.deepEqual(nodes[2].payload.canvasContext.promptReadDependencies, [
    { kind: "canvas_node_read", nodeKey: "role" },
    { kind: "canvas_node_read", nodeKey: "scene" },
  ]);
  assert.deepEqual(nodes[2].payload.canvasContext.scriptWorkflowReferences, [
    { mention: "@主角", nodeId: "role", referenceIndex: 1, referenceAssetVersionId: "" },
    { mention: "@街道", nodeId: "scene", referenceIndex: 2, referenceAssetVersionId: "" },
  ]);
  assert.deepEqual(nodes[2].payload.referenceAssetVersionIds, []);
});

test("Canvas keeps thumbnail references for the surface but sends original storage objects to models", () => {
  const storageObjectId = "10000000-0000-4000-8000-000000000321";
  const workbench = {
    state: { project: { aspectRatio: "16:9" } },
    ui: {
      canvasDocument: {
        version: 1,
        nodes: [
          {
            id: "source",
            type: "source-image",
            data: {
              mediaKind: "image",
              storageObjectId,
              previewUrl: `/api/storage/objects/${storageObjectId}/content?proxy=1`,
            },
          },
          {
            id: "target",
            type: "ai-image",
            data: { mediaKind: "image", prompt: "使用参考图生成新图", modelCode: "image-model" },
          },
        ],
        edges: [{ id: "source-target", sourceNodeId: "source", targetNodeId: "target" }],
      },
      episodeGenerationConfig: { models: [] },
    },
  };

  const [batchNode] = buildCanvasGenerationBatchNodes(workbench, ["target"]);
  const originalUrl = `/api/storage/objects/${storageObjectId}/content`;
  assert.equal(batchNode.payload.canvasContext.referenceImages[0].url, `/api/storage/objects/${storageObjectId}/content?proxy=1`);
  assert.equal(batchNode.payload.referenceImages[0].url, originalUrl);
  assert.equal(batchNode.payload.referenceImages[0].storageObjectId, storageObjectId);
  assert.equal(batchNode.payload.parameters.quickReferences[0].url, originalUrl);
  assert.equal(batchNode.payload.parameters.quickReferences[0].storageObjectId, storageObjectId);
});

test("deleting a workflow asset removes its node binding and semantic mention from dependent shots", () => {
  const deletingNode = { id: "role", type: "ai-image", data: { workflowParentId: "script", workflowKind: "character" } };
  const document = {
    nodes: [{
      id: "shot",
      type: "ai-video",
      data: {
        workflowParentId: "script",
        workflowKind: "storyboard",
        prompt: "@主角走入@街道。",
        scriptWorkflowReferenceNodeIds: ["role", "scene"],
        scriptWorkflowReferenceBindings: [
          { mention: "@主角", nodeId: "role" },
          { mention: "@街道", nodeId: "scene" },
        ],
      },
    }],
    edges: [],
  };

  const next = synchronizeCanvasScriptWorkflowDeletion(document, deletingNode);
  assert.equal(next.nodes[0].data.prompt, "走入@街道。");
  assert.deepEqual(next.nodes[0].data.scriptWorkflowReferenceNodeIds, ["scene"]);
  assert.deepEqual(next.nodes[0].data.scriptWorkflowReferenceBindings, [{ mention: "@街道", nodeId: "scene" }]);
});

test("deleting a script node detaches children without deleting them", () => {
  const next = synchronizeCanvasScriptWorkflowDeletion({
    nodes: [{
      id: "shot",
      type: "ai-video",
      data: {
        workflowParentId: "script",
        workflowKind: "storyboard",
        prompt: "@主角转身。",
        scriptWorkflowReferenceNodeIds: ["role"],
        scriptWorkflowReferenceBindings: [{ mention: "@主角", nodeId: "role" }],
      },
    }],
    edges: [],
  }, { id: "script", type: "script", data: {} });

  assert.equal(next.nodes.length, 1);
  assert.equal(next.nodes[0].data.workflowParentId, undefined);
  assert.equal(next.nodes[0].data.workflowKind, undefined);
  assert.equal(next.nodes[0].data.prompt, "图1中的主角转身。");
  assert.deepEqual(next.nodes[0].data.scriptWorkflowReferenceNodeIds, []);
});

test("script analysis expands every returned asset and storyboard into one canvas node configuration", () => {
  const configurations = buildCanvasScriptWorkflowConfigurations({
    commitPayload: {
      characters: [
        { characterName: "林芽", characterDescription: "短发少女", characterImagePrompt: "白色风衣" },
        { characterName: "顾沉", characterDescription: "黑衣青年", characterImagePrompt: "冷峻神情" },
      ],
      scenes: [{ sceneName: "旧城区", sceneDescription: "雨夜街道", sceneImagePrompt: "霓虹反光" }],
      props: [{ propName: "钥匙", propDescription: "铜制旧钥匙", propImagePrompt: "磨损纹理" }],
      storyboards: [
        { shotNo: "1", plot: "@林芽走入@旧城区", videoPrompt: "镜头缓慢推进" },
        { shotNo: "2", plot: "@顾沉举起@钥匙", videoPrompt: "近景切换" },
      ],
    },
  });

  assert.deepEqual(configurations.map((item) => item.kind), [
    "character", "character", "scene", "prop", "storyboard", "storyboard",
  ]);
  assert.equal(configurations[0].title, "林芽");
  assert.match(configurations[0].prompt, /短发少女\n白色风衣/);
  assert.equal(configurations[4].type, "ai-video");
  assert.match(configurations[4].prompt, /@林芽走入@旧城区/);
});

test("script analysis reuses preview tables when the normalized commit payload is empty", () => {
  const configurations = buildCanvasScriptWorkflowConfigurations({
    commitPayload: { characters: [], scenes: [], props: [], storyboards: [] },
    displayTables: {
      characters: { rows: [{ characterName: "任小野", characterDescription: "旧布短衣", characterImagePrompt: "少年全身角色设定图" }] },
      scenes: { rows: [{ sceneName: "城门口", sceneDescription: "黄昏人流", sceneImagePrompt: "古城门全景" }] },
      props: { rows: [{ propName: "切割刀", propDescription: "黑色短刀", propImagePrompt: "短刀道具设定图" }] },
      storyboards: { rows: [{ shotNo: 1, plot: "任小野走进城门", imagePrompt: "黄昏城门静帧", videoPrompt: "镜头缓慢推进" }] },
    },
  });

  assert.deepEqual(configurations.map((item) => item.kind), ["character", "scene", "prop", "storyboard"]);
  assert.match(configurations[0].prompt, /旧布短衣\n少年全身角色设定图/);
  assert.match(configurations[3].prompt, /黄昏城门静帧/);
  assert.match(configurations[3].prompt, /镜头缓慢推进/);
});

test("script analysis parses raw generated stage text when preview rows are empty", () => {
  const configurations = buildCanvasScriptWorkflowConfigurations({
    commitPayload: { characters: [], scenes: [], props: [], storyboards: [] },
    rawMarkdown: {
      character: '{"characters":[{"characterName":"任小野","characterDescription":"旧布短衣","characterImagePrompt":"少年角色提示词"}]}',
      scene: '{"scenes":[{"sceneName":"城门口","sceneDescription":"黄昏人流","sceneImagePrompt":"城门场景提示词"}]}',
      prop: '{"props":[{"propName":"切割刀","propDescription":"黑色短刀","propImagePrompt":"短刀道具提示词"}]}',
      shot: '{"storyboards":[{"shotNo":1,"plot":"任小野走进城门","imagePrompt":"城门分镜图片提示词","videoPrompt":"推进镜头分镜词"}]}',
    },
  });

  assert.deepEqual(configurations.map((item) => item.kind), ["character", "scene", "prop", "storyboard"]);
  assert.match(configurations[0].prompt, /少年角色提示词/);
  assert.match(configurations[1].prompt, /城门场景提示词/);
  assert.match(configurations[2].prompt, /短刀道具提示词/);
  assert.match(configurations[3].prompt, /城门分镜图片提示词\n推进镜头分镜词/);
});

test("script analysis splits every labeled asset and complete storyboard block from raw markdown", () => {
  const configurations = buildCanvasScriptWorkflowConfigurations({
    commitPayload: { characters: [], scenes: [], props: [], storyboards: [] },
    rawMarkdown: {
      scene: [
        "-**场景名称**: 城外尸堆",
        "-**画面构图**: 尸骸铺满前景",
        "-**场景名称**: 铁木城门",
        "-**画面构图**: 绞盘位于中央",
      ].join("\n"),
      character: [
        "**角色名称**：任小野",
        "**外貌**：黑发少年",
        "**角色名称**：叙言",
        "**外貌**：瘦削青年",
      ].join("\n"),
      prop: [
        "**1. 切割刀**",
        "* **道具名称**: 切割刀",
        "* **外观**: 黑色短刀",
        "**2. 普通灰晶**",
        "* **道具名称**: 普通灰晶",
        "* **外观**: 灰白晶体",
      ].join("\n"),
      shot: [
        "### 分镜1：尸堆异动",
        "【镜头1】手掌特写",
        "【镜头2】任小野抬头",
        "### 分镜2：拔刀反击",
        "【镜头1】刀光掠过",
        "【镜头2】灰血飞溅",
      ].join("\n"),
    },
  });

  assert.deepEqual(configurations.map((item) => item.kind), [
    "character", "character", "scene", "scene", "prop", "prop", "storyboard", "storyboard",
  ]);
  assert.deepEqual(configurations.slice(0, 6).map((item) => item.title), [
    "任小野", "叙言", "城外尸堆", "铁木城门", "切割刀", "普通灰晶",
  ]);
  assert.match(configurations[2].prompt, /画面构图: 尸骸铺满前景/);
  assert.doesNotMatch(configurations[2].prompt, /铁木城门/);
  assert.match(configurations[4].prompt, /外观: 黑色短刀/);
  assert.doesNotMatch(configurations[4].prompt, /普通灰晶/);
  assert.match(configurations[6].prompt, /分镜1：尸堆异动[\s\S]*【镜头2】任小野抬头/);
  assert.doesNotMatch(configurations[6].prompt, /分镜2：拔刀反击/);
  assert.match(configurations[7].prompt, /分镜2：拔刀反击[\s\S]*【镜头2】灰血飞溅/);
});

test("script analysis binds an explicit duplicate mention only to its exact asset node", () => {
  const workbench = {
    state: { project: { aspectRatio: "16:9" } },
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
      canvasDocumentsByProject: {},
      episodeGenerationConfig: { models: [] },
      canvasDocument: {
        version: 1,
        nodes: [{
          id: "script-1",
          type: "script",
          position: { x: 100, y: 100 },
          data: {
            sourceMode: "manual",
            ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] },
          },
        }],
        edges: [],
      },
    },
  };

  const result = appendCanvasScriptWorkflowConfigurationsForTest(workbench, "script-1", [
    { kind: "character", type: "ai-image", title: "主角", prompt: "第一版主角" },
    { kind: "character", type: "ai-image", title: "主角", prompt: "第二版主角" },
    {
      kind: "storyboard",
      type: "ai-video",
      title: "分镜 1",
      prompt: "@主角#2 转身。",
      data: { scriptWorkflowReferenceNodeIds: [], scriptWorkflowReferenceBindings: [] },
    },
  ]);

  assert.equal(result.ok, true);
  const [firstRoleId, secondRoleId, shotId] = result.nodeIds;
  const shot = workbench.ui.canvasDocument.nodes.find((node) => node.id === shotId);
  assert.deepEqual(shot.data.scriptWorkflowReferenceNodeIds, [secondRoleId]);
  assert.deepEqual(shot.data.scriptWorkflowReferenceBindings, [
    { mention: "@主角#2", nodeId: secondRoleId },
  ]);
  assert.equal(workbench.ui.canvasDocument.edges.some((edge) =>
    edge.sourceNodeId === firstRoleId && edge.targetNodeId === shotId), false);
  assert.equal(workbench.ui.canvasDocument.edges.some((edge) =>
    edge.sourceNodeId === secondRoleId && edge.targetNodeId === shotId), true);
});

test("a toolbar-created script node is positioned in the current visible graph center", () => {
  const position = resolveCanvasScriptNodeVisiblePositionForTest({
    newCanvasMount: {
      shadowRoot: {
        querySelector() {
          return {
            getBoundingClientRect() {
              return { left: 100, top: 50, width: 1200, height: 800 };
            },
          };
        },
      },
    },
    canvasGraph: {
      clientToLocal(clientX, clientY) {
        assert.equal(clientX, 700);
        assert.equal(clientY, 450);
        return { x: 1400, y: 900 };
      },
    },
  });

  assert.deepEqual(position, { x: 1150, y: 690 });
});

test("keyboard-created nodes are positioned in the current visible graph center", () => {
  const position = resolveCanvasNodeVisiblePositionForTest({
    newCanvasMount: {
      shadowRoot: {
        querySelector() {
          return {
            getBoundingClientRect() {
              return { left: 100, top: 50, width: 1200, height: 800 };
            },
          };
        },
      },
    },
    canvasGraph: {
      clientToLocal() {
        return { x: 1400, y: 900 };
      },
    },
  }, "ai-image");

  assert.deepEqual(position, { x: 1190, y: 711 });
});
