import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.doesNotMatch(html, /episode-replica-asset-full-popover/);
  assert.doesNotMatch(html, /\/ 800/);
});

test("episode asset description editor does not define a hover popover", () => {
  const css = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /episode-replica-asset-full-popover/);
});

test("episode asset description remains vertically scrollable in fixed-height desktop cards", () => {
  const css = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
  const fixedHeightBlock = css.match(
    /\.episode-replica-asset-desc-input\s*\{\s*min-height:\s*6\.85rem;(?<body>[^}]*)\}/,
  )?.groups?.body ?? "";

  assert.match(fixedHeightBlock, /max-height:\s*6\.85rem/);
  assert.match(fixedHeightBlock, /overflow-x:\s*hidden/);
  assert.match(fixedHeightBlock, /overflow-y:\s*auto/);
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

test("manual episode asset creation refreshes the current asset list", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const actionStart = source.indexOf('if (action === "save-episode-asset-create")');
  const actionEnd = source.indexOf('if (action === "open-delete-sidebar-storyboard-modal")', actionStart);
  const actionSource = source.slice(actionStart, actionEnd);

  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  assert.match(actionSource, /await ensureEpisodeWorkbenchAssetsHydrated\(workbench, \{ force: true \}\);/);
});
