import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

function renderOverview(episodes) {
  return renderProjectDetail({
    state: {
      project: { id: "project-1", name: "测试项目", phase: "draft", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "测试项目" },
        episodes,
        shots: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      },
    },
    session: { user: { phone: "+86 13800138000" } },
    ui: { activeNavTab: "project", projectPanelMode: "detail", projectInteriorSection: "overview" },
  });
}

test("project overview shows the single-episode launch card below existing episodes", () => {
  const html = renderOverview([{ id: "episode-1", title: "第一集", sequence: 1, status: "draft" }]);

  assert.match(html, /class="episode-overview-create"/);
  assert.match(html, /class="episode-launch-card single"[^>]*data-action="open-single-episode-flow"/);
  assert.match(html, /单集创建/);
});

test("project overview does not show the extra launch card without episodes", () => {
  const html = renderOverview([]);

  assert.doesNotMatch(html, /class="episode-overview-create"/);
  assert.doesNotMatch(html, /class="episode-launch-card single"/);
});

test("single-episode studio gives leftover height to the script field instead of the toolbar", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );
  const studioBlocks = [...css.matchAll(/\.single-episode-studio\s*\{(?<body>[^}]*)\}/g)]
    .map((match) => match.groups?.body ?? "")
    .filter((body) => /grid-template-rows:/.test(body));
  const scriptFieldBlock = css.match(/\.single-episode-script-field\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
  const actionBlock = css.match(
    /\.single-episode-actions \.single-episode-ghost-action,\s*\.single-episode-actions \.single-episode-ai-action\s*\{(?<body>[^}]*)\}/,
  )?.groups?.body ?? "";

  assert.equal(studioBlocks.length, 2);
  for (const body of studioBlocks) {
    assert.match(body, /grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/);
    assert.doesNotMatch(body, /grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\)\s+auto/);
  }
  assert.match(scriptFieldBlock, /min-height:\s*0/);
  assert.match(scriptFieldBlock, /height:\s*100%/);
  assert.match(actionBlock, /min-height:\s*2\.95rem/);
  assert.match(actionBlock, /border-radius:\s*999px/);
});
