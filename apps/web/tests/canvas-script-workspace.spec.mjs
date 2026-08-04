import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { renderCanvasScriptWorkspace } from "../src/features/production-workbench/canvas/canvas-script-workspace.js";

test("script workspace renders real workflow child nodes instead of copied entries", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "assets" },
    canvasDocument: {
      nodes: [
        { id: "script-1", type: "script", data: { title: "第一集" } },
        { id: "role-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "character", title: "林芽", prompt: "角色设定" } },
        { id: "scene-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "scene", title: "旧城区", previewUrl: "https://example.test/scene.png" } },
        { id: "foreign-role", type: "ai-image", data: { workflowParentId: "script-2", workflowKind: "character", title: "不应出现" } },
      ],
    },
  });

  assert.match(html, /data-script-workspace-child="role-1"/);
  assert.match(html, /data-script-workspace-child="scene-1"/);
  assert.match(html, /林芽/);
  assert.match(html, /旧城区/);
  assert.doesNotMatch(html, /不应出现/);
  assert.match(html, /data-canvas-script-child-input data-node-id="role-1" data-script-child-field="prompt"/);
  assert.match(html, /data-action="add-canvas-script-workflow-child" data-node-id="script-1" data-script-child-kind="character"/);
});

test("script workspace shows one storyboard row per real video child and its bound references", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "shots" },
    canvasDocument: {
      nodes: [
        { id: "script-1", type: "script", data: {} },
        { id: "shot-1", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard", prompt: "@林芽走入旧城区", scriptWorkflowReferenceNodeIds: ["role-1", "scene-1"], videoUrl: "https://example.test/shot-1.mp4", thumbnailUrl: "https://example.test/shot-1.jpg" } },
        { id: "shot-2", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard", prompt: "尚未生成的视频" } },
      ],
    },
  });

  assert.match(html, /data-script-workspace-child="shot-1"/);
  assert.match(html, /<th class="script-workspace-shot-video-cell">视频<\/th>/);
  assert.match(html, /data-action="toggle-canvas-video-fullscreen" data-node-id="shot-1"/);
  assert.match(html, /src="https:\/\/example\.test\/shot-1\.mp4"/);
  assert.match(html, /poster="https:\/\/example\.test\/shot-1\.jpg"/);
  assert.match(html, /data-script-workspace-child="shot-2"[\s\S]*?data-script-shot-video-placeholder="true"[\s\S]*?未生成/);
  assert.match(html, /<th>最终提示词<\/th>/);
  assert.doesNotMatch(html, /<th>时长<\/th>|<th>景别<\/th>|<th>运镜<\/th>|画面描述 \/ 提示词/);
  assert.doesNotMatch(html, /data-script-child-field="videoDurationSec"|data-script-child-field="shotSize"|data-script-child-field="cameraMove"/);
  assert.match(html, /@ 引用 2/);
  assert.doesNotMatch(html, /data-action="run-canvas-script-workflow"|data-action="run-canvas-node"[^>]*>生成视频/);
  assert.match(html, /data-action="delete-canvas-node" data-node-id="shot-1"/);
  assert.match(html, /data-node-ids="\[&quot;shot-1&quot;,&quot;shot-2&quot;\]"/);
});

test("script workspace downloads every video reachable from its script node", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "shots" },
    canvasDocument: {
      nodes: [
        { id: "script-1", type: "script", data: {} },
        { id: "image-1", type: "ai-image", data: {} },
        { id: "video-1", type: "ai-video", data: {} },
        { id: "video-2", type: "ai-video", data: {} },
        { id: "other-video", type: "ai-video", data: {} },
      ],
      edges: [
        { sourceNodeId: "script-1", targetNodeId: "image-1" },
        { sourceNodeId: "image-1", targetNodeId: "video-1" },
        { sourceNodeId: "video-1", targetNodeId: "video-2" },
      ],
    },
  });

  assert.match(html, /data-action="download-canvas-selection" data-node-id="script-1" data-node-ids="\[&quot;video-1&quot;,&quot;video-2&quot;\]"/);
  assert.doesNotMatch(html, /data-node-ids="[^\"]*other-video/);
});

test("script workspace keeps the empty shot table aligned with the video column", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "shots" },
    canvasDocument: { nodes: [{ id: "script-1", type: "script", data: {} }] },
  });

  assert.match(html, /<th class="script-workspace-shot-video-cell">视频<\/th>/);
  assert.match(html, /<td colspan="6" class="script-workspace-empty">/);
});

test("script workspace supports selecting shots for one batch deletion", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: {
      open: true,
      scriptNodeId: "script-1",
      activeStep: "shots",
      selectedShotNodeIds: ["shot-2"],
    },
    canvasDocument: {
      nodes: [
        { id: "script-1", type: "script", data: {} },
        { id: "shot-1", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
        { id: "shot-2", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
      ],
    },
  });

  assert.match(html, /data-canvas-script-shot-select-all/);
  assert.match(html, /data-canvas-script-shot-selection data-node-id="shot-2" checked/);
  assert.match(html, /data-script-shot-selection-count>已选 1 项/);
  assert.match(html, /data-action="delete-selected-canvas-script-shots" data-node-id="script-1"/);
});

test("script workspace uses compact episode-style asset cards", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "assets" },
    canvasDocument: {
      nodes: [
        { id: "script-1", type: "script", data: {} },
        { id: "role-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "character", title: "任小野", prompt: "角色描述" } },
      ],
    },
  });

  assert.match(html, /script-workspace-asset-section-header/);
  assert.match(html, /角色<small>1 项<\/small>/);
  assert.match(html, /script-workspace-asset-body/);
  assert.match(html, /角色描述/);
});

test("script workspace exposes batch image and video actions on the matching steps", () => {
  const document = {
    nodes: [
      { id: "script-1", type: "script", data: {} },
      { id: "asset-1", type: "ai-image", data: { workflowParentId: "script-1", workflowKind: "character" } },
      { id: "shot-1", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
    ],
  };
  const assets = renderCanvasScriptWorkspace({ canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "assets" }, canvasDocument: document });
  const shots = renderCanvasScriptWorkspace({ canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "shots" }, canvasDocument: document });
  assert.match(assets, /data-action="open-canvas-script-batch-modal"[^>]*data-batch-kind="image"[^>]*>批量生成图片<\/button>/);
  assert.match(shots, /data-action="open-canvas-script-batch-modal"[^>]*data-batch-kind="video"[^>]*>批量生成视频<\/button>/);
});

test("editing a script workspace child does not rebuild the entire workspace", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const canvasHostSource = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const childInputBranch = source.slice(
    source.indexOf('if (target?.matches?.("[data-canvas-script-child-input]"))'),
    source.indexOf('if (target?.matches?.("[data-canvas-script-workflow-skill]"))'),
  );

  assert.doesNotMatch(childInputBranch, /refreshCanvasScriptWorkspace\(workbench, nodeId\)/);
  assert.match(canvasHostSource, /event\.target\?\.closest\?\.\("\.script-workspace-layer"\)[\s\S]*?event\.stopPropagation\(\);[\s\S]*?return;/);
});

test("script workspace does not render the script parsing section", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "shots" },
    canvasTextOfficialSkills: [
      { id: "skill-character", title: "角色技能", category: "character_extract" },
      { id: "skill-scene", title: "场景技能", category: "scene_extract" },
      { id: "skill-prop", title: "道具技能", category: "prop_extract" },
      { id: "skill-shot", title: "分镜技能", category: "shot" },
    ],
    canvasDocument: {
      nodes: [{ id: "script-1", type: "script", data: { text: "第一场：雨夜。" } }],
    },
  });

  assert.doesNotMatch(html, /剧本拆分/);
  assert.doesNotMatch(html, /data-script-skill-category=/);
  assert.doesNotMatch(html, /data-action="parse-canvas-script-workflow"/);
});

test("script workspace shows assets before shots and removes prompt composition", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "assets" },
    canvasDocument: {
      nodes: [{ id: "script-1", type: "script", data: {} }],
    },
  });

  assert.match(html, /data-script-workspace-step="live" aria-current="false"><b>1<\/b><span>提示词/);
  assert.match(html, /data-script-workspace-step="assets" aria-current="step"><b>2<\/b><span>准备资产/);
  assert.match(html, /data-script-workspace-step="shots" aria-current="false"><b>3<\/b><span>确认镜头/);
  assert.ok(html.indexOf("准备资产") < html.indexOf("确认镜头"));
  assert.doesNotMatch(html, /data-script-workspace-step="prompts"|合成提示词/);
});

test("script workspace renders live model prompts and streamed responses before assets", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "live" },
    canvasScriptParsingNodeId: "script-1",
    canvasScriptLivePreviewByNodeId: {
      "script-1": {
        status: "running",
        stages: {
          shot: { status: "pending", promptText: "", responseText: "" },
          character: { status: "running", promptText: "提取全部人物", responseText: '{"characters":[{"characterName":"任小野"}]}' },
          scene: { status: "completed", promptText: "提取全部场景", responseText: '{"scenes":[{"sceneName":"城门口"}]}' },
          prop: { status: "pending", promptText: "", responseText: "" },
        },
      },
    },
    canvasDocument: { nodes: [{ id: "script-1", type: "script", data: {} }] },
  });

  assert.match(html, /实时提示词/);
  assert.match(html, /模型实时返回/);
  assert.doesNotMatch(html, /发送给模型|提取全部人物|提取全部场景/);
  assert.match(html, /任小野/);
  assert.match(html, /城门口/);
  assert.match(html, /data-live-prompt-stage="character" data-live-prompt-status="running"/);
  assert.match(html, /data-action="open-canvas-script-stage-regenerate" data-node-id="script-1" data-script-stage="scene"[^>]*>重新生成</);
  assert.match(html, /data-script-stage="character" disabled>生成中</);
});

test("script workspace restores saved model results from the script node after refresh", () => {
  const html = renderCanvasScriptWorkspace({
    canvasScriptWorkspace: { open: true, scriptNodeId: "script-1", activeStep: "live" },
    canvasDocument: {
      nodes: [{
        id: "script-1",
        type: "script",
        data: {
          workflowLivePreview: {
            status: "completed",
            activeStage: "completed",
            stages: {
              shot: { status: "completed", responseText: "已保存的完整分镜结果" },
              character: { status: "completed", responseText: "已保存的角色结果" },
              scene: { status: "completed", responseText: "已保存的场景结果" },
              prop: { status: "completed", responseText: "已保存的道具结果" },
            },
          },
        },
      }],
    },
  });

  assert.match(html, /4\/4 已返回/);
  assert.match(html, /生成完成/);
  assert.match(html, /已保存的完整分镜结果/);
  assert.match(html, /已保存的角色结果/);
  assert.match(html, /已保存的场景结果/);
  assert.match(html, /已保存的道具结果/);
});
