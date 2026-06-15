import assert from "node:assert/strict";
import { test } from "node:test";

import { renderEpisodeAssetCardForTest } from "../src/features/production-workbench/episode-workbench-rebuilt.js";

test("episode asset description editor supports 2500 characters and manual resizing", () => {
  const description = "角色描述".repeat(120);
  const html = renderEpisodeAssetCardForTest({
    id: "asset-1",
    name: "叙叔",
    description,
  }, "character");

  assert.match(html, /maxlength="2500"/);
  assert.match(html, />\s*480 \/ 2500\s*</);
  assert.doesNotMatch(html, /\/ 800/);
});
