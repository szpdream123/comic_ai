import assert from "node:assert/strict";
import { test } from "node:test";

import { handleWorkbenchActionForTest } from "../src/features/production-workbench/index.js";

function createProjectLibrary(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `project-${index + 1}`,
    name: `项目 ${index + 1}`,
    status: index % 2 ? "草稿" : "进行中",
    createdAt: "2026/06/10",
  }));
}

function createWorkbench() {
  return {
    root: { innerHTML: "", querySelector() { return null; } },
    state: {},
    session: { user: { phone: "+86 13800138000" } },
    api: {},
    ui: {
      activeNavTab: "project",
      projectPanelMode: "library",
      projectLibrary: createProjectLibrary(24),
      projectLibraryPage: 1,
      projectCardMenuId: null,
      assetCardMenuId: "asset-1",
      storyboards: [],
      toast: "操作已完成。",
    },
  };
}

test("project gallery pagination does not show a success toast", async () => {
  const workbench = createWorkbench();

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "change-project-page", page: "2" },
  });

  assert.equal(workbench.ui.projectLibraryPage, 2);
  assert.equal(workbench.ui.toast, "");
  assert.doesNotMatch(workbench.root.innerHTML, /global-workbench-toast/);
});

test("project card edit menu toggle does not show a success toast", async () => {
  const workbench = createWorkbench();

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "toggle-project-card-menu", projectId: "project-1" },
  });

  assert.equal(workbench.ui.projectCardMenuId, "project-1");
  assert.equal(workbench.ui.assetCardMenuId, null);
  assert.equal(workbench.ui.toast, "");
  assert.doesNotMatch(workbench.root.innerHTML, /global-workbench-toast/);
});

test("project status filter controls do not show a success toast", async () => {
  const workbench = createWorkbench();

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "toggle-project-status-menu" },
  });

  assert.equal(workbench.ui.projectStatusMenuOpen, true);
  assert.equal(workbench.ui.toast, "");
  assert.doesNotMatch(workbench.root.innerHTML, /global-workbench-toast/);
});

test("opening a project workspace does not show a success toast", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  globalThis.window = { location: { hash: "" } };
  workbench.api.selectProject = async ({ projectId }) => ({
    project: {
      id: projectId,
      name: "项目 1",
      phase: "asset_review",
      aspectRatio: "9:16",
      resolution: "1080p",
    },
    script: null,
    episodes: [],
    assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
    shots: [],
  });
  workbench.api.getProjects = async () => ({
    projects: workbench.ui.projectLibrary.map((project) => ({
      id: project.id,
      name: project.name,
      phase: "asset_review",
      createdAt: project.createdAt,
    })),
  });
  workbench.api.getAssetLibrary = async () => ({ assets: [] });

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-project-workspace", projectId: "project-1" },
    });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }

  assert.equal(workbench.ui.projectPanelMode, "workspace");
  assert.equal(workbench.ui.selectedProjectCardId, "project-1");
  assert.equal(workbench.ui.toast, "");
  assert.doesNotMatch(workbench.root.innerHTML, /global-workbench-toast success/);
});
