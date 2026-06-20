import assert from "node:assert/strict";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

test("workbench rail omits the community tab", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "team",
      projectPanelMode: "workspace",
    },
  });

  assert.doesNotMatch(html, /data-tab="community"/);
  assert.doesNotMatch(html, /data-action="open-community"/);
});
