import assert from "node:assert/strict";
import { test } from "node:test";

import { renderEpisodeAssetCardForTest } from "../src/features/production-workbench/episode-workbench-rebuilt.js";
import { renderAssetConversationEntryForPolling } from "../src/features/production-workbench/episode-workbench-rebuilt.js";

test("episode asset description editor supports 2500 characters and manual resizing", () => {
  const description = "角色描述".repeat(120);
  const html = renderEpisodeAssetCardForTest({
    id: "asset-1",
    name: "叙叔",
    description,
  }, "character");

  assert.match(html, /maxlength="2500"/);
  assert.match(html, />\s*480 \/ 2500\s*</);
  assert.match(html, /episode-replica-asset-full-popover/);
  assert.match(html, /<p>角色描述角色描述/);
  assert.doesNotMatch(html, /\/ 800/);
});

test("episode generation task meta only shows task id", () => {
  const html = renderAssetConversationEntryForPolling({
    taskId: "task-123",
    selectedModelId: "secret-provider-model",
    promptPreview: "测试提示词",
  });

  assert.match(html, /任务ID：task-123/);
  assert.doesNotMatch(html, /task-123\/|secret-provider-model|默认模型|GPT Image|Vidu|nano banana|海螺|Happy Horse/);
});
