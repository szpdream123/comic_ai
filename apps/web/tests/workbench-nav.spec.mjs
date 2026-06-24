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

test("project workspace omits the members interior tab", () => {
  const baseContext = {
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
  };

  const html = renderProjectDetail({
    ...baseContext,
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });
  assert.doesNotMatch(html, /data-section="members"/);
  assert.doesNotMatch(html, /<strong>成员<\/strong>/);

  const legacyStateHtml = renderProjectDetail({
    ...baseContext,
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "members",
      projectMembers: [{ phone: "18571521874", role: "owner_admin", status: "active" }],
    },
  });
  assert.doesNotMatch(legacyStateHtml, /当前项目所在协作空间的真实成员列表/);
  assert.match(legacyStateHtml, /data-section="overview"[\s\S]*class="interior-nav-item active"|class="interior-nav-item active"[\s\S]*data-section="overview"/);
});
