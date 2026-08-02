import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectScriptWorkflowVideoReferenceMentions,
  compileScriptWorkflowVideoReferences,
} from "../src/features/production-workbench/canvas/canvas-script-workflow-reference.js";

test("script workflow treats every asset-table @ token as an image asset reference", () => {
  const mentions = collectScriptWorkflowVideoReferenceMentions(`
视频场景对照表: 城门外=@城门外
视频角色对照表: 任小野=@任小野；城防士兵=【@城防士兵】的角色形象
视频道具对照表: 警笛=@警笛
  `);

  assert.deepEqual(mentions, [
    { mention: "@城门外", name: "城门外", kind: "scene" },
    { mention: "@任小野", name: "任小野", kind: "character" },
    { mention: "@城防士兵", name: "城防士兵", kind: "character" },
    { mention: "@警笛", name: "警笛", kind: "prop" },
  ]);
});

test("script workflow compiles references by first appearance instead of binding order", () => {
  const result = compileScriptWorkflowVideoReferences({
    prompt: "@街道 中，@主角 拿起 @武器。",
    workflowReferenceBindings: {
      主角: { nodeId: "role-node" },
      武器: { nodeId: "prop-node" },
      街道: { nodeId: "scene-node" },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.compiledPrompt, "图1中的街道 中，图2中的主角 拿起 图3中的武器。");
  assert.deepEqual(result.orderedNodeIds, ["scene-node", "role-node", "prop-node"]);
  assert.deepEqual(result.orderedBindings.map((binding) => binding.referenceIndex), [1, 2, 3]);
});

test("script workflow reuses the same numbered image when an asset is mentioned repeatedly", () => {
  const result = compileScriptWorkflowVideoReferences({
    prompt: "@主角 看向 @街道，@主角 走入 @街道。",
    workflowReferenceBindings: [
      { mention: "@主角", assetNodeId: "role-node" },
      { mention: "@街道", assetNodeId: "scene-node" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.compiledPrompt, "图1中的主角 看向 图2中的街道，图1中的主角 走入 图2中的街道。");
  assert.deepEqual(result.orderedNodeIds, ["role-node", "scene-node"]);
});

test("script workflow reports a missing binding without inventing a reference image", () => {
  const result = compileScriptWorkflowVideoReferences({
    prompt: "@主角 在 @废墟中前进。",
    workflowReferenceBindings: {
      主角: { nodeId: "role-node" },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.compiledPrompt, "图1中的主角 在 @废墟中前进。");
  assert.deepEqual(result.orderedNodeIds, ["role-node"]);
  assert.deepEqual(result.diagnostics, [{
    code: "script_workflow_reference_binding_missing",
    token: "@废墟中前进",
    name: "废墟中前进",
    offset: 6,
  }]);
});

test("script workflow matches persisted Chinese binding names before adjacent action text", () => {
  const result = compileScriptWorkflowVideoReferences({
    prompt: "@林芽走入@旧城区，拿起@武器。",
    workflowReferenceBindings: [
      { mention: "@林芽", nodeId: "role-node" },
      { mention: "@旧城区", nodeId: "scene-node" },
      { mention: "@武器", nodeId: "prop-node" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.compiledPrompt, "图1中的林芽走入图2中的旧城区，拿起图3中的武器。");
  assert.deepEqual(result.orderedNodeIds, ["role-node", "scene-node", "prop-node"]);
});

test("script workflow keeps explicit same-title bindings distinct with stable mentions", () => {
  const result = compileScriptWorkflowVideoReferences({
    prompt: "@主角 与 @主角#2 对视。",
    workflowReferenceBindings: [
      { mention: "@主角", nodeId: "role-a" },
      { mention: "@主角#2", nodeId: "role-b" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.compiledPrompt, "图1中的主角 与 图2中的主角#2 对视。");
  assert.deepEqual(result.orderedNodeIds, ["role-a", "role-b"]);
});
