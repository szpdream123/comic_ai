import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  renderCanvasScriptBatchModal,
  resolveCanvasScriptBatchInitialState,
  resolveCanvasScriptBatchItems,
} from "../src/features/production-workbench/canvas-script-batch-modal.js";
import {
  resolveCanvasNodeMountBounds,
  resolveCanvasSelectionActionState,
} from "../src/features/production-workbench/canvas/canvas-x6-graph.js";
import { applyCanvasGenerationBatchSubmission } from "../src/features/production-workbench/index.js";

const canvasDocument = {
  nodes: [
    {
      id: "script-1",
      type: "script",
      data: {
        workflowNodes: [
          { id: "scene-1", kind: "scene" },
          { id: "role-1", kind: "character" },
          { id: "shot-1", kind: "storyboard" },
          { id: "prop-1", kind: "prop" },
        ],
      },
    },
    { id: "role-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "character", title: "主角", prompt: "主角设定", modelCode: "image-1" } },
    { id: "scene-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "scene", title: "街道", prompt: "雨夜街道" } },
    { id: "prop-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "prop", title: "旧伞", prompt: "黑色旧伞" } },
    { id: "shot-1", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard", title: "分镜 1", prompt: "主角走入街道", mediaKind: "video" } },
    { id: "other-image", type: "ai-image", data: { workflowParentId: "script-2", workflowKind: "character", title: "其他脚本资产" } },
  ],
  edges: [],
};

const generationConfig = {
  defaultImageModelCode: "image-2",
  defaultVideoModelCode: "video-1",
  models: [
    { modelCode: "image-1", modelLabel: "Image One", mediaType: "image" },
    { modelCode: "image-2", modelLabel: "Image Two", mediaType: "image" },
    { modelCode: "video-1", modelLabel: "Video One", mediaType: "video" },
  ],
};

test("script batch items stay inside the selected script and media group", () => {
  assert.deepEqual(resolveCanvasScriptBatchItems(canvasDocument, "script-1", "image").map((item) => item.id), [
    "scene-1", "role-1", "prop-1",
  ]);
  assert.deepEqual(resolveCanvasScriptBatchItems(canvasDocument, "script-1", "video").map((item) => item.id), ["shot-1"]);
});

test("script selection toolbar exposes separate image and video counts", () => {
  const state = resolveCanvasSelectionActionState(canvasDocument, ["script-1"]);
  assert.equal(state.visible, true);
  assert.equal(state.mode, "script");
  assert.equal(state.scriptNodeId, "script-1");
  assert.equal(state.imageNodeCount, 3);
  assert.equal(state.videoNodeCount, 1);
});

test("script toolbar anchors to the rendered script node instead of a stale multi-selection box", () => {
  const script = {
    id: "script-1",
    isNode: () => true,
    getData: () => ({ canvasNode: { type: "script" } }),
  };
  const mount = {
    clientWidth: 1000,
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 300 }),
  };
  const graph = {
    getCellById: (nodeId) => nodeId === script.id ? script : null,
    findViewByCell: () => ({
      container: {
        getBoundingClientRect: () => ({ left: 175, top: 125, width: 250, height: 180 }),
      },
    }),
  };

  assert.deepEqual(resolveCanvasNodeMountBounds(graph, mount, script.id, "script"), {
    left: 150,
    top: 150,
    width: 500,
    height: 360,
  });
  assert.equal(resolveCanvasNodeMountBounds(graph, mount, script.id, "group"), null);
});

test("script batch defaults to every group member and a matching media model", () => {
  const imageState = resolveCanvasScriptBatchInitialState({
    canvasDocument,
    scriptNodeId: "script-1",
    batchKind: "image",
    generationConfig,
  });
  const videoState = resolveCanvasScriptBatchInitialState({
    canvasDocument,
    scriptNodeId: "script-1",
    batchKind: "video",
    generationConfig,
  });
  assert.deepEqual(imageState.selectedNodeIds, ["scene-1", "role-1", "prop-1"]);
  assert.equal(imageState.modelCode, "image-1");
  assert.equal(videoState.modelCode, "video-1");
});

test("image batch drops a legacy skill outside the image generation categories", () => {
  const document = structuredClone(canvasDocument);
  Object.assign(document.nodes.find((node) => node.id === "role-1").data, {
    promptSkillId: "legacy-script-skill",
    promptSkillCategory: "script",
    promptSkillSource: "private",
    promptSkillTitle: "旧转剧本技能",
    promptSkillPriceCredits: 10,
  });

  const modal = resolveCanvasScriptBatchInitialState({
    canvasDocument: document,
    scriptNodeId: "script-1",
    batchKind: "image",
    generationConfig,
  });

  assert.equal(modal.skillId, "");
  assert.equal(modal.skillCategory, "image_style");
  assert.equal(modal.selectedSkillCategory, "");
  assert.equal(modal.skillTitle, "");
  assert.equal(modal.skillPriceCredits, 0);
});

test("script batch modal keeps model selection and one skill picker entry", () => {
  const modal = resolveCanvasScriptBatchInitialState({
    canvasDocument,
    scriptNodeId: "script-1",
    batchKind: "image",
    generationConfig,
  });
  const html = renderCanvasScriptBatchModal({
    modal: { ...modal, skillId: "skill-1", skillTitle: "电影质感" },
    canvasDocument,
    generationConfig,
    officialSkills: [
      { id: "skill-1", title: "电影质感", category: "image_style", official: true },
    ],
    officialPagination: { page: 1, totalPages: 2, category: "image_style" },
  });
  assert.match(html, /资产批量生成图片/);
  assert.match(html, /主角/);
  assert.match(html, /街道/);
  assert.match(html, /旧伞/);
  assert.doesNotMatch(html, /其他脚本资产/);
  assert.match(html, /Image One/);
  assert.doesNotMatch(html, /Video One/);
  assert.match(html, /电影质感/);
  assert.match(html, /非必填/);
  assert.match(html, /批量生成图片（3）/);
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /episode-replica-control/);
  assert.equal((html.match(/data-action="toggle-canvas-script-batch-control-menu"/g) ?? []).length, 1);
  assert.equal((html.match(/data-action="open-canvas-script-batch-skill-modal"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-action="set-canvas-script-batch-skill(?:-source|-category|-page)?"/);
  assert.doesNotMatch(html, /技能来源|技能分类|aria-label="技能分页"/);
});

test("script batch skill picker reuses the existing modal and confirms back into batch state", () => {
  const indexSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const projectDetailSource = readFileSync(new URL("../src/features/production-workbench/project-detail.js", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");

  assert.match(indexSource, /action === "open-canvas-script-batch-skill-modal"/);
  assert.match(indexSource, /canvasTextSkillModalMode = "batch-generation"/);
  assert.match(indexSource, /const page = Math\.max\(1, Number\(modal\.skillPage\) \|\| 1\)[\s\S]*syncCanvasTextSkills\(workbench, \{ source, category, page \}\)/);
  assert.match(indexSource, /canvasTextSkillModalMode === "batch-generation"[\s\S]*canvasScriptBatchModal = \{[\s\S]*skillId: selected\?\.id/);
  assert.match(indexSource, /modal\.batchKind !== "image"[\s\S]*CANVAS_IMAGE_GENERATION_SKILL_CATEGORIES\.includes\(selected\?\.category\)/);
  assert.match(projectDetailSource, /\["generation", "batch-generation"\]\.includes\(ui\.canvasTextSkillModalMode\)/);
  assert.match(cssSource, /\.canvas-text-skill-layer:has\(~ \.canvas-script-batch-layer\)[\s\S]*z-index: 270/);
  assert.match(cssSource, /\.canvas-script-batch-header > button::before,[\s\S]*top: 50%;[\s\S]*left: 50%;[\s\S]*translate\(-50%, -50%\)/);
});

test("script batch only reports generating when an active task is attached", () => {
  const modal = resolveCanvasScriptBatchInitialState({
    canvasDocument,
    scriptNodeId: "script-1",
    batchKind: "image",
    generationConfig,
  });
  const pendingWithoutTask = structuredClone(canvasDocument);
  pendingWithoutTask.nodes.find((node) => node.id === "role-1").data.status = "pending";
  const idleHtml = renderCanvasScriptBatchModal({
    modal,
    canvasDocument: pendingWithoutTask,
    generationConfig,
  });
  assert.doesNotMatch(idleHtml, /canvas-script-batch-status is-running[^>]*><i><\/i>生成中/);

  const pendingWithTask = structuredClone(pendingWithoutTask);
  pendingWithTask.nodes.find((node) => node.id === "role-1").data.taskId = "task-role-1";
  const runningHtml = renderCanvasScriptBatchModal({
    modal,
    canvasDocument: pendingWithTask,
    generationConfig,
  });
  assert.match(runningHtml, /canvas-script-batch-status is-running[^>]*><i><\/i>生成中/);
});

test("batch submission cannot reuse a historical task when the response omits a current task id", () => {
  const document = {
    version: 1,
    nodes: [{
      id: "role-1",
      type: "ai-image",
      data: {
        status: "completed",
        taskId: "old-task",
        lastTaskId: "old-task",
        generationTaskId: "old-task",
      },
    }],
    edges: [],
  };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasProjects: [{ id: "canvas-1", document }],
      canvasDocument: document,
      canvasDocumentsByProject: { "canvas-1": document },
      taskCenterTasksById: {},
      taskCenterTaskOrder: [],
    },
  };

  const result = applyCanvasGenerationBatchSubmission(workbench, {
    batch: { id: "batch-2", items: [{ nodeKey: "role-1", status: "queued" }] },
  }, [{ nodeKey: "role-1", mediaKind: "image" }]);
  const node = result.document.nodes[0];

  assert.equal(node.data.status, "queued");
  assert.equal(node.data.taskId, null);
  assert.equal(node.data.lastTaskId, null);
  assert.equal(node.data.generationTaskId, null);
  assert.equal(result.trackedTaskCount, 0);
});
