import assert from "node:assert/strict";
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
