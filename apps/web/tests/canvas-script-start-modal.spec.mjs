import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { renderCanvasScriptStartModal } from "../src/features/production-workbench/canvas-script-start-modal.js";

test("script start modal offers official and private skills plus custom instructions", () => {
  const html = renderCanvasScriptStartModal({
    show: true,
    sourceTab: "private",
    activeCategory: "shot",
    officialSkills: [{ id: "official-shot", title: "官方分镜", category: "shot", official: true }],
    privateSkills: [{ id: "private-shot", title: "私人分镜", category: "shot" }],
    draftSkillId: "private-shot",
    customInstruction: "节奏紧凑，突出雨夜悬疑感",
  });

  assert.match(html, /开始生成分镜/);
  assert.match(html, /官方技能/);
  assert.match(html, /私人技能库/);
  assert.match(html, /data-skill-id="private-shot"/);
  assert.match(html, /data-canvas-script-start-instruction/);
  assert.match(html, /节奏紧凑，突出雨夜悬疑感/);
  assert.match(html, /data-action="confirm-canvas-text-skill"/);
});
test("script start action persists the selected skill and custom instruction before parsing", async () => {
  const source = await readFile(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");

  assert.match(source, /action === "open-canvas-script-start-modal"/);
  assert.match(source, /canvasTextSkillModalMode = "script-start"/);
  assert.match(source, /workflowStartInstruction: String\(workbench\.ui\.canvasTextSkillCustomInstruction/);
  assert.match(source, /const generationText = customInstruction/);
  assert.match(source, /result = await parseCanvasScriptWorkflow\(workbench, scriptNodeId\)/);
});
test("script skill picker accepts the shared episode skill card id and preserves cleared categories", async () => {
  const source = await readFile(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");

  assert.match(source, /target\.dataset\.skillId \?\? target\.dataset\.episodeSkillId/);
  assert.match(source, /\[category\]: ""/);
  assert.match(source, /hasExplicitSelection/);
  assert.match(source, /skill\.source === "private" && skill\.isDefault/);
});
