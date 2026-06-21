import assert from "node:assert/strict";
import { test } from "node:test";

import {
  handleWorkbenchActionForTest,
  initProductionWorkbench,
  refreshProductionWorkbenchForTest,
  syncWorkbenchHashRouteForTest,
} from "../src/features/production-workbench/index.js";

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

test("project gallery refresh does not block on non-gallery startup requests", async () => {
  const calls = [];
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "#project" },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
  globalThis.sessionStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
  workbench.api = {
    getSession: async () => {
      calls.push("session");
      return { user: { phone: "+86 13800138000", creditBalance: 12 } };
    },
    getProjects: async () => {
      calls.push("projects");
      return {
        projects: workbench.ui.projectLibrary.map((project) => ({
          id: project.id,
          name: project.name,
          phase: "asset_review",
          createdAt: project.createdAt,
        })),
      };
    },
    getCreatorState: async () => {
      calls.push("state");
      return {};
    },
    getProjectDetail: async () => {
      calls.push("detail");
      return {};
    },
    getProjectMembers: async () => {
      calls.push("members");
      return { members: [] };
    },
    getProjectStats: async () => {
      calls.push("stats");
      return { stats: null };
    },
    getProjectStyles: async () => {
      calls.push("project-styles");
      return { data: [] };
    },
    getStoryboardPromptPackages: async () => {
      calls.push("packages");
      return { data: [] };
    },
    getWorkspaceScripts: async () => {
      calls.push("scripts");
      return { scripts: [] };
    },
    getCanvasProjects: async () => {
      calls.push("canvas-projects");
      return { projects: [] };
    },
    getExportHistory: async () => {
      calls.push("history");
      return { records: [] };
    },
    getAssetLibrary: async () => {
      calls.push("library");
      return { assets: [] };
    },
  };

  try {
    await refreshProductionWorkbenchForTest(workbench);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
    if (originalSessionStorage === undefined) {
      delete globalThis.sessionStorage;
    } else {
      globalThis.sessionStorage = originalSessionStorage;
    }
  }

  assert.equal(calls.filter((call) => call === "projects").length, 1);
  assert.deepEqual(
    calls.filter((call) => !["session", "projects", "project-styles", "packages"].includes(call)),
    [],
  );
});

test("navigation tabs render before lazy surface requests finish", async () => {
  const calls = [];
  const pending = [];
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  globalThis.window = { location: { hash: "" } };
  workbench.api = {
    getCanvasProjects: () => new Promise((resolve) => {
      calls.push("canvas-projects");
      pending.push(() => resolve({ projects: [] }));
    }),
    listGlobalGenerationConfig: () => new Promise((resolve) => {
      calls.push("generation-config");
      pending.push(() => resolve({ models: [] }));
    }),
    getLibraryAssets: () => new Promise((resolve) => {
      calls.push("library");
      pending.push(() => resolve({ assets: [], categories: [], folders: [] }));
    }),
    getTeamOverview: () => new Promise((resolve) => {
      calls.push("team-overview");
      pending.push(() => resolve({ overview: {} }));
    }),
    getTeamMembers: () => new Promise((resolve) => {
      calls.push("team-members");
      pending.push(() => resolve({ members: [] }));
    }),
  };

  try {
    const navigation = handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "tools" },
    });
    const navigationResult = await Promise.race([
      navigation.then(() => "returned"),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 20)),
    ]);

    assert.equal(navigationResult, "returned");
    assert.equal(workbench.ui.activeNavTab, "tools");
    assert.deepEqual(calls, []);

    while (pending.length) {
      pending.shift()();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("core navigation remains available while background work is busy", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  globalThis.window = { location: { hash: "" } };
  workbench.ui.activeNavTab = "home";
  workbench.ui.busy = true;
  workbench.api = {
    getProjects: async () => ({ projects: [] }),
    getProjectStyles: async () => ({ data: [] }),
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "project" },
    });
    assert.equal(workbench.ui.activeNavTab, "project");

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-create-modal" },
    });
    assert.equal(workbench.ui.isCreateModalOpen, true);
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("hash route changes re-render the active surface", async () => {
  const workbench = createWorkbench();
  workbench.ui.activeNavTab = "home";
  workbench.ui.projectPanelMode = "library";
  workbench.api = {
    getWorkspaceScripts: async () => ({ scripts: [] }),
  };

  syncWorkbenchHashRouteForTest(workbench, "#script");

  assert.equal(workbench.ui.activeNavTab, "script");
  assert.match(workbench.root.innerHTML, /data-scroll-surface="script"/);
  assert.match(workbench.root.innerHTML, /data-tab="script"[\s\S]*aria-selected="true"|aria-selected="true"[\s\S]*data-tab="script"/);
});

test("asset library route reuse avoids duplicate identical requests", async () => {
  const workbench = createWorkbench();
  let libraryCalls = 0;
  workbench.ui.activeNavTab = "home";
  workbench.ui.libraryTeamAssetScope = "official";
  workbench.ui.libraryCategory = "character";
  workbench.ui.libraryFolder = "国内仿真人-现代都市";
  workbench.ui.libraryQuery = "";
  workbench.api = {
    getLibraryAssets: async () => {
      libraryCalls += 1;
      return {
        categories: [],
        folders: ["国内仿真人-现代都市"],
        assets: [],
        entitlement: null,
      };
    },
  };

  syncWorkbenchHashRouteForTest(workbench, "#library");
  await new Promise((resolve) => setTimeout(resolve, 0));
  syncWorkbenchHashRouteForTest(workbench, "#library");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(libraryCalls, 1);
});

test("startup renders the script surface when the initial hash is script", async () => {
  const root = { innerHTML: "", querySelector() { return null; }, addEventListener() {} };
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "#script" },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = {
    addEventListener() {},
    removeEventListener() {},
    createElement() {
      return { innerHTML: "", querySelector() { return null; } };
    },
  };
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
  globalThis.sessionStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };

  try {
    await initProductionWorkbench({
      root,
      session: { user: { phone: "+86 13800138000" } },
      onLogout() {},
      api: {
        getSession: async () => ({ user: { phone: "+86 13800138000", creditBalance: 12 } }),
        getWorkspaceScripts: async () => ({ scripts: [] }),
      },
    });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
    if (originalSessionStorage === undefined) {
      delete globalThis.sessionStorage;
    } else {
      globalThis.sessionStorage = originalSessionStorage;
    }
  }

  assert.match(root.innerHTML, /data-scroll-surface="script"/);
  assert.doesNotMatch(root.innerHTML, /home-hero/);
});

test("pricing modal opens before billing and membership requests finish", async () => {
  const calls = [];
  const pending = [];
  const workbench = createWorkbench();
  workbench.api = {
    getBillingPackages: () => new Promise((resolve) => {
      calls.push("billing");
      pending.push(() => resolve({ packages: [] }));
    }),
    getMembershipPlans: () => new Promise((resolve) => {
      calls.push("plans");
      pending.push(() => resolve({ data: { plans: [] } }));
    }),
    getMembershipStatus: () => new Promise((resolve) => {
      calls.push("status");
      pending.push(() => resolve({ data: null }));
    }),
  };

  const opening = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "open-pricing" },
  });
  const openingResult = await Promise.race([
    opening.then(() => "returned"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 20)),
  ]);

  assert.equal(openingResult, "returned");
  assert.equal(workbench.ui.isLibraryPricingModalOpen, true);
  assert.deepEqual(calls.sort(), ["billing", "plans", "status"]);

  while (pending.length) {
    pending.shift()();
  }
});
