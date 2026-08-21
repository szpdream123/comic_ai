import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  deriveInitialNavTabForTest,
  handleWorkbenchActionForTest,
  homeAgentPromptTextForSubmissionForTest,
  initProductionWorkbench,
  refreshProductionWorkbenchForTest,
  restoreWorkbenchRouteFromLocationForTest,
  setHomeWorkflowScriptFileForTest,
  setScriptUploadFileForTest,
  syncCanvasProjectsFromApiForTest,
  syncCanvasRouteStateForTest,
  syncHomeProjectLibraryFromApiForTest,
  syncHomeRecommendationsFromApiForTest,
  syncWorkbenchHashRouteForTest,
  syncWorkbenchRouteStateForTest,
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("leaving home aborts its in-flight project request", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  let homeRequestSignal;
  globalThis.window = {
    location: { hash: "#home", pathname: "/" },
    history: { pushState() {} },
  };
  workbench.ui.activeNavTab = "home";
  workbench.api.getProjects = async (input = {}) => {
    if (input.pageSize === 8) {
      homeRequestSignal = input.signal;
      return new Promise(() => {});
    }
    return { projects: [], pagination: { page: 1, pageSize: 18, total: 0, totalPages: 1 } };
  };

  try {
    void syncHomeProjectLibraryFromApiForTest(workbench);
    await Promise.resolve();

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "project" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(homeRequestSignal?.aborted, true);
});

test("leaving the asset library aborts its in-flight asset request", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  let assetRequestSignal;
  globalThis.window = {
    location: { hash: "#library", pathname: "/assets" },
    history: { pushState() {} },
  };
  Object.assign(workbench.ui, {
    activeNavTab: "library",
    libraryTeamRoute: "assets",
    libraryTeamAssetScope: "official",
    libraryCategory: "character",
    libraryFolder: "",
  });
  workbench.api.getLibraryAssets = async (input = {}) => {
    assetRequestSignal = input.signal;
    return new Promise(() => {});
  };
  workbench.api.getProjects = async () => ({
    projects: [],
    pagination: { page: 1, pageSize: 18, total: 0, totalPages: 1 },
  });

  try {
    syncWorkbenchHashRouteForTest(workbench, "#library");
    await Promise.resolve();
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "project" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(assetRequestSignal?.aborted, true);
});

test("returning to the asset library starts a fresh request after the previous one was aborted", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  let libraryCalls = 0;
  globalThis.window = {
    location: { hash: "#home", pathname: "/" },
    history: { pushState() {} },
  };
  Object.assign(workbench.ui, {
    activeNavTab: "home",
    libraryTeamRoute: "assets",
    libraryTeamAssetScope: "official",
    libraryCategory: "character",
    libraryFolder: "",
    libraryQuery: "",
  });
  workbench.api.getLibraryAssets = (input = {}) => {
    libraryCalls += 1;
    if (libraryCalls === 1) {
      return new Promise((_resolve, reject) => {
        input.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        }, { once: true });
      });
    }
    return Promise.resolve({
      categories: [],
      folders: [],
      assets: [{ id: "fresh-asset", name: "新素材" }],
      entitlement: null,
    });
  };

  try {
    syncWorkbenchHashRouteForTest(workbench, "#library");
    await Promise.resolve();
    await Promise.resolve();
    syncWorkbenchHashRouteForTest(workbench, "#home");
    syncWorkbenchHashRouteForTest(workbench, "#library");
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(libraryCalls, 2);
  assert.deepEqual(workbench.ui.libraryAssets?.map((asset) => asset.id), ["fresh-asset"]);
  assert.equal(workbench.ui.libraryLoading, false);
});

test("an aborted asset request cannot clear the replacement request loading state", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  let libraryCalls = 0;
  let rejectFirstRequest;
  let resolveSecondRequest;
  globalThis.window = {
    location: { hash: "#home", pathname: "/" },
    history: { pushState() {} },
  };
  Object.assign(workbench.ui, {
    activeNavTab: "home",
    libraryTeamRoute: "assets",
    libraryTeamAssetScope: "official",
    libraryCategory: "character",
    libraryFolder: "",
    libraryQuery: "",
  });
  workbench.api.getLibraryAssets = (input = {}) => {
    libraryCalls += 1;
    if (libraryCalls === 1) {
      return new Promise((_resolve, reject) => {
        input.signal?.addEventListener("abort", () => {
          rejectFirstRequest = () => reject(new DOMException("The operation was aborted", "AbortError"));
        }, { once: true });
      });
    }
    return new Promise((resolve) => { resolveSecondRequest = resolve; });
  };

  try {
    syncWorkbenchHashRouteForTest(workbench, "#library");
    await Promise.resolve();
    await Promise.resolve();
    syncWorkbenchHashRouteForTest(workbench, "#home");
    syncWorkbenchHashRouteForTest(workbench, "#library");
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(libraryCalls, 2);
    assert.equal(workbench.ui.libraryLoading, true);
    rejectFirstRequest();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(workbench.ui.libraryLoading, true);

    resolveSecondRequest({
      categories: [],
      folders: [],
      assets: [{ id: "fresh-asset", name: "新素材" }],
      entitlement: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(workbench.ui.libraryLoading, false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("background video cache hit plays without a network fetch", async () => {
  const workbench = createWorkbench();
  const sourceUrl = "/api/home-recommendations/background/media?v=cached";
  const originalWindow = globalThis.window;
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  let fetchCalls = 0;
  const video = {
    dataset: { homeBackgroundVideoUrl: sourceUrl },
    isConnected: true,
    readyState: 0,
    src: "",
    load() {},
    play: async () => {},
    pause() {},
    removeAttribute(name) { if (name === "src") this.src = ""; },
  };
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeBackground = { videoUrl: sourceUrl, status: "active" };
  workbench.root.querySelector = (selector) => selector === ".home-background-video video" ? video : null;
  workbench.api.getProjects = async () => ({ projects: [], pagination: { total: 0 } });
  globalThis.window = {
    location: { hash: "#home", pathname: "/home" },
    history: { pushState() {} },
  };
  globalThis.caches = {
    async open() {
      return {
        async match() { return { async blob() { return new Blob(["cached-video"]); } }; },
        async keys() { return [{ url: sourceUrl }]; },
        async delete() { return true; },
      };
    },
  };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("cache hit must not fetch");
  };
  globalThis.URL.createObjectURL = () => "blob:cached-home-video";

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "home" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
    globalThis.URL.createObjectURL = originalCreateObjectURL;
  }

  assert.equal(fetchCalls, 0);
  assert.equal(video.src, "blob:cached-home-video");
  assert.equal(video.dataset.homeBackgroundVideoCacheState, "ready");
});

test("does not prune a newer background video cache after an older cache read", async () => {
  const workbench = createWorkbench();
  const oldSourceUrl = "/api/home-recommendations/background/media?v=old-read";
  const newSourceUrl = "/api/home-recommendations/background/media?v=new-read";
  const originalWindow = globalThis.window;
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  let releaseKeys;
  let keysStarted;
  const keysStartedPromise = new Promise((resolve) => { keysStarted = resolve; });
  const keysReleasePromise = new Promise((resolve) => { releaseKeys = resolve; });
  const deletedUrls = [];
  const video = {
    dataset: { homeBackgroundVideoUrl: oldSourceUrl },
    isConnected: true,
    readyState: 0,
    src: "",
    load() {},
    play: async () => {},
    pause() {},
    removeAttribute(name) { if (name === "src") this.src = ""; },
  };
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeBackground = { videoUrl: oldSourceUrl, status: "active" };
  workbench.root.querySelector = (selector) => selector === ".home-background-video video" ? video : null;
  workbench.api.getProjects = async () => ({ projects: [], pagination: { total: 0 } });
  globalThis.window = {
    location: { hash: "#home", pathname: "/home" },
    history: { pushState() {} },
  };
  globalThis.caches = {
    async open() {
      return {
        async match() { return { async blob() { return new Blob(["old-video"]); } }; },
        async keys() {
          keysStarted();
          await keysReleasePromise;
          return [
            { url: `https://lingxiyunai.com${oldSourceUrl}` },
            { url: `https://lingxiyunai.com${newSourceUrl}` },
          ];
        },
        async delete(request) { deletedUrls.push(request.url ?? String(request)); return true; },
      };
    },
  };
  globalThis.fetch = async () => { throw new Error("cache read must not fetch"); };
  globalThis.URL.createObjectURL = () => "blob:old-home-video";

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "home" },
    });
    await keysStartedPromise;
    workbench.homeBackgroundVideoCacheToken = Symbol("new-home-background-video-cache");
    workbench.homeBackgroundVideoSourceUrl = newSourceUrl;
    releaseKeys();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
    globalThis.URL.createObjectURL = originalCreateObjectURL;
  }

  assert.equal(deletedUrls.includes(`https://lingxiyunai.com${newSourceUrl}`), false);
});

test("leaving home pauses and reuses the buffered background video on return", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const originalCaches = globalThis.caches;
  let videoSourceRemoved = false;
  let pauseCalls = 0;
  let playCalls = 0;
  let loadCalls = 0;
  let reusedVideo = null;
  const video = {
    dataset: { homeBackgroundVideoUrl: "https://cdn.example.test/home.mp4" },
    isConnected: true,
    readyState: 0,
    src: "",
    load() { loadCalls += 1; },
    play: async () => { playCalls += 1; },
    pause() { pauseCalls += 1; },
    removeAttribute(name) {
      if (name === "src") {
        videoSourceRemoved = true;
        this.src = "";
      }
    },
  };
  const replacementVideo = {
    dataset: { homeBackgroundVideoUrl: "https://cdn.example.test/home.mp4" },
    isConnected: true,
    readyState: 0,
    src: "",
    replaceWith(nextVideo) {
      reusedVideo = nextVideo;
      renderedHomeVideo = nextVideo;
    },
    load() {},
    play: async () => {},
    pause() {},
    removeAttribute() {},
  };
  let renderedHomeVideo = video;
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeBackground = {
    status: "active",
    videoUrl: "https://cdn.example.test/home.mp4",
  };
  workbench.api.getProjects = async () => ({
    projects: [],
    pagination: { page: 1, pageSize: 18, total: 0, totalPages: 1 },
  });
  workbench.root.querySelector = (selector) =>
    selector === ".home-background-video video" && workbench.ui.activeNavTab === "home"
      ? renderedHomeVideo
      : null;
  globalThis.window = {
    location: { hash: "#home", pathname: "/" },
    history: { pushState() {} },
  };
  globalThis.caches = {
    async open() {
      return {
        async match() { return null; },
        async keys() { return []; },
        async delete() { return true; },
      };
    },
  };
  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "home" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    playCalls = 0;
    loadCalls = 0;
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "project" },
    });
    renderedHomeVideo = replacementVideo;
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "home" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }

  assert.equal(videoSourceRemoved, false);
  assert.equal(pauseCalls > 0, true);
  assert.equal(reusedVideo, video);
  assert.equal(playCalls, 1);
  assert.equal(loadCalls, 0);
  assert.equal(workbench.homeBackgroundVideoElement, video);
});

test("returning home restarts a background video whose cache lookup finished while detached", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const originalCaches = globalThis.caches;
  let resolveCacheMatch;
  const cacheMatchGate = new Promise((resolve) => {
    resolveCacheMatch = resolve;
  });
  const sourceUrl = "https://cdn.example.test/home.mp4";
  const video = {
    dataset: { homeBackgroundVideoUrl: sourceUrl },
    isConnected: true,
    readyState: 0,
    src: "",
    load() {},
    play: async () => {},
    pause() {},
    removeAttribute(name) { if (name === "src") this.src = ""; },
  };
  const replacementVideo = {
    dataset: { homeBackgroundVideoUrl: sourceUrl },
    isConnected: true,
    readyState: 0,
    src: "",
    replaceWith(nextVideo) {
      renderedHomeVideo = nextVideo;
      nextVideo.isConnected = true;
    },
    load() {},
    play: async () => {},
    pause() {},
    removeAttribute() {},
  };
  let renderedHomeVideo = video;
  workbench.ui.activeNavTab = "project";
  workbench.ui.homeBackground = { status: "active", videoUrl: sourceUrl };
  workbench.api.getProjects = async () => ({
    projects: [],
    pagination: { page: 1, pageSize: 18, total: 0, totalPages: 1 },
  });
  workbench.root.querySelector = (selector) =>
    selector === ".home-background-video video" && workbench.ui.activeNavTab === "home"
      ? renderedHomeVideo
      : null;
  globalThis.window = {
    location: { hash: "#home", pathname: "/" },
    history: { pushState() {} },
  };
  globalThis.caches = {
    async open() {
      return {
        async match() {
          await cacheMatchGate;
          return null;
        },
        async keys() { return []; },
        async delete() { return true; },
      };
    },
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "home" },
    });
    await Promise.resolve();
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "project" },
    });
    video.isConnected = false;
    renderedHomeVideo = replacementVideo;
    resolveCacheMatch(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "home" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }

  assert.equal(renderedHomeVideo, video);
  assert.equal(video.src, sourceUrl);
  assert.equal(video.dataset.homeBackgroundVideoCacheState, "fallback");
});

test("project gallery pagination does not show a success toast", async () => {
  const workbench = createWorkbench();
  workbench.ui.projectLibrary = createProjectLibrary(18);
  workbench.ui.projectLibraryPagination = { page: 1, pageSize: 18, total: 24, totalPages: 2 };
  workbench.api.getProjects = async (input) => {
    assert.deepEqual(input, { page: 2, pageSize: 18, keyword: "" });
    return {
      projects: createProjectLibrary(6).map((project, index) => ({
        ...project,
        id: `project-${index + 19}`,
        name: `项目 ${index + 19}`,
      })),
      pagination: { page: 2, pageSize: 18, total: 24, totalPages: 2 },
    };
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "change-project-page", page: "2" },
  });

  assert.equal(workbench.ui.projectLibraryPage, 2);
  assert.equal(workbench.ui.projectLibrary.length, 6);
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

test("project rename updates visible cards without waiting for a list refetch", async () => {
  const workbench = createWorkbench();
  workbench.ui.renameProjectId = "project-1";
  workbench.ui.renameProjectName = "即时新名称";
  workbench.ui.homeRecentProjects = [{ ...workbench.ui.projectLibrary[0] }];
  workbench.api.updateProject = async () => ({
    project: { id: "project-1", name: "即时新名称" },
  });
  workbench.api.getProjects = async () => new Promise(() => {});

  const outcome = await Promise.race([
    handleWorkbenchActionForTest(workbench, {
      dataset: { action: "confirm-rename-project-card" },
    }).then(() => "returned"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 30)),
  ]);

  assert.equal(outcome, "returned");
  assert.equal(workbench.ui.projectLibrary[0].name, "即时新名称");
  assert.equal(workbench.ui.homeRecentProjects[0].name, "即时新名称");
  assert.equal(workbench.ui.renameProjectId, null);
});

test("canvas gallery deletes all selected projects from the current page", async () => {
  const workbench = createWorkbench();
  const deletedIds = [];
  Object.assign(workbench.ui, {
    activeNavTab: "tools",
    canvasProjectView: "list",
    canvasProjectPage: 1,
    canvasProjectStatusFilter: "active",
    canvasProjects: [
      { id: "canvas-1", title: "画布 1", status: "active" },
      { id: "canvas-2", title: "画布 2", status: "active" },
      { id: "canvas-3", title: "画布 3", status: "active" },
    ],
    selectedCanvasProjectIds: ["canvas-1", "canvas-2"],
    selectedCanvasProjectId: "canvas-1",
    canvasDocumentsByProject: {},
  });
  workbench.api.deleteCanvasProject = async (projectId) => {
    deletedIds.push(projectId);
    return { deleted: true };
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-selected-canvas-projects" },
  });

  assert.equal(workbench.ui.deleteCanvasProjectMode, "bulk");
  assert.deepEqual(workbench.ui.deleteCanvasProjectIds, ["canvas-1", "canvas-2"]);
  assert.match(workbench.root.innerHTML, /确定删除本页选中的 2 个画布吗/);

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-canvas-project" },
  });

  assert.deepEqual(deletedIds, ["canvas-1", "canvas-2"]);
  assert.deepEqual(workbench.ui.canvasProjects.map((project) => project.id), ["canvas-3"]);
  assert.deepEqual(workbench.ui.selectedCanvasProjectIds, []);
  assert.equal(workbench.ui.deleteCanvasProjectMode, "single");
  assert.equal(workbench.ui.toast, "已删除 2 个画布。");
});

test("canvas bulk delete keeps only the failed project selected for retry", async () => {
  const workbench = createWorkbench();
  let deleteCalls = 0;
  Object.assign(workbench.ui, {
    activeNavTab: "tools",
    canvasProjectView: "list",
    canvasProjectStatusFilter: "active",
    canvasProjects: [
      { id: "canvas-1", title: "画布 1", status: "active" },
      { id: "canvas-2", title: "画布 2", status: "active" },
    ],
    selectedCanvasProjectIds: ["canvas-1", "canvas-2"],
    deleteCanvasProjectMode: "bulk",
    deleteCanvasProjectIds: ["canvas-1", "canvas-2"],
    canvasDocumentsByProject: {},
  });
  workbench.api.deleteCanvasProject = async () => {
    deleteCalls += 1;
    if (deleteCalls === 2) throw new Error("second canvas delete failed");
    return { deleted: true };
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-canvas-project" },
  });

  assert.equal(deleteCalls, 2);
  assert.deepEqual(workbench.ui.canvasProjects.map((project) => project.id), ["canvas-2"]);
  assert.deepEqual(workbench.ui.deleteCanvasProjectIds, ["canvas-2"]);
  assert.deepEqual(workbench.ui.selectedCanvasProjectIds, ["canvas-2"]);
  assert.equal(workbench.ui.deleteCanvasProjectSubmitting, false);
  assert.match(String(workbench.ui.toast), /second canvas delete failed/);
});

test("team member project delete action is blocked before the api call", async () => {
  const workbench = createWorkbench();
  let deleteCalls = 0;
  workbench.session.user.actorType = "team_member";
  workbench.api.deleteProject = async () => {
    deleteCalls += 1;
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-project-card", projectId: "project-1" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-project-card" },
  });

  assert.equal(deleteCalls, 0);
  assert.equal(workbench.ui.deleteProjectId, null);
  assert.deepEqual(workbench.ui.toast, { tone: "error", message: "子账户无法删除项目。" });
});

test("project delete modal shows a non-interactive progress state while the request is pending", async () => {
  const workbench = createWorkbench();
  const deletion = createDeferred();
  workbench.api.deleteProject = () => deletion.promise;
  workbench.api.getProjects = async () => ({
    projects: createProjectLibrary(23).map((project, index) => ({
      ...project,
      id: `project-${index + 2}`,
    })),
    pagination: { page: 1, pageSize: 18, total: 23, totalPages: 2 },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-project-card", projectId: "project-1" },
  });
  const deleting = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-project-card" },
  });
  await Promise.resolve();

  assert.equal(workbench.ui.deleteProjectSubmitting, true);
  assert.match(workbench.root.innerHTML, /aria-busy="true"/);
  assert.match(workbench.root.innerHTML, /aria-label="正在删除"/);
  assert.match(workbench.root.innerHTML, /tabindex="-1"[^>]*autofocus/);
  assert.match(workbench.root.innerHTML, /role="status" aria-live="polite"/);
  assert.match(workbench.root.innerHTML, /删除中…/);
  assert.match(workbench.root.innerHTML, /data-action="close-delete-project-modal"[^>]*disabled/);
  assert.match(workbench.root.innerHTML, /data-action="confirm-delete-project-card"[^>]*disabled/);

  deletion.resolve({ deleted: true, projectId: "project-1" });
  await deleting;
});

test("project delete closes immediately after api success without waiting for list refresh", async () => {
  const workbench = createWorkbench();
  const deletion = createDeferred();
  const refresh = createDeferred();
  let refreshStarted = false;
  let assetLibraryCalls = 0;
  workbench.ui.projectLibraryPagination = { page: 1, pageSize: 18, total: 24, totalPages: 2 };
  workbench.api.deleteProject = () => deletion.promise;
  workbench.api.getProjects = () => {
    refreshStarted = true;
    return refresh.promise;
  };
  workbench.api.getAssetLibrary = async () => {
    assetLibraryCalls += 1;
    return { assets: [] };
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-project-card", projectId: "project-1" },
  });
  const deleting = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-project-card" },
  });
  deletion.resolve({ deleted: true, projectId: "project-1" });
  await Promise.resolve();
  await Promise.resolve();

  let actionReturned = false;
  void deleting.then(() => {
    actionReturned = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(actionReturned, true);
  assert.equal(refreshStarted, true);
  assert.equal(workbench.ui.deleteProjectId, null);
  assert.equal(workbench.ui.deleteProjectSubmitting, false);
  assert.equal(workbench.ui.projectLibrary.some((project) => project.id === "project-1"), false);
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-delete-project-card"/);

  refresh.resolve({
    projects: createProjectLibrary(23).map((project, index) => ({
      ...project,
      id: `project-${index + 2}`,
    })),
    pagination: { page: 1, pageSize: 18, total: 23, totalPages: 2 },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(assetLibraryCalls, 0);
});

test("project delete refreshes recent home projects to fill the removed card", async () => {
  const workbench = createWorkbench();
  workbench.ui.homeRecentProjects = createProjectLibrary(8);
  workbench.ui.homeProjectTotal = 9;
  workbench.ui.projectLibraryPagination = { page: 1, pageSize: 18, total: 24, totalPages: 2 };
  workbench.api.deleteProject = async () => ({ deleted: true, projectId: "project-1" });
  workbench.api.getProjects = async ({ pageSize }) => {
    if (pageSize === 8) {
      return {
        projects: createProjectLibrary(8).map((project, index) => ({
          ...project,
          id: `project-${index + 2}`,
          name: `项目 ${index + 2}`,
        })),
        pagination: { page: 1, pageSize: 8, total: 8, totalPages: 1 },
      };
    }
    return {
      projects: createProjectLibrary(18).map((project, index) => ({
        ...project,
        id: `project-${index + 2}`,
      })),
      pagination: { page: 1, pageSize: 18, total: 23, totalPages: 2 },
    };
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-project-card", projectId: "project-1" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-project-card" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(
    workbench.ui.homeRecentProjects.map((project) => project.id),
    ["project-2", "project-3", "project-4", "project-5", "project-6", "project-7", "project-8", "project-9"],
  );
  assert.equal(workbench.ui.homeProjectTotal, 8);
});

test("project delete failure restores an interactive modal without removing the card", async () => {
  const workbench = createWorkbench();
  const deletion = createDeferred();
  workbench.api.deleteProject = () => deletion.promise;

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-project-card", projectId: "project-1" },
  });
  const deleting = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-project-card" },
  });
  await Promise.resolve();
  deletion.reject(new Error("network unavailable"));
  await deleting;

  assert.equal(workbench.ui.deleteProjectId, "project-1");
  assert.equal(workbench.ui.deleteProjectSubmitting, false);
  assert.equal(workbench.ui.projectLibrary.some((project) => project.id === "project-1"), true);
  assert.match(String(workbench.ui.toast), /network unavailable/);
  assert.match(workbench.root.innerHTML, /data-action="confirm-delete-project-card"/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-delete-project-card"[^>]*disabled/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="close-delete-project-modal"[^>]*disabled/);
});

test("an already missing project is treated as an idempotent delete success", async () => {
  const workbench = createWorkbench();
  workbench.api.deleteProject = async () => {
    const error = new Error("project not found");
    error.errorCode = "project_not_found";
    throw error;
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-project-card", projectId: "project-1" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-project-card" },
  });

  assert.equal(workbench.ui.deleteProjectId, null);
  assert.equal(workbench.ui.deleteProjectSubmitting, false);
  assert.equal(workbench.ui.projectLibrary.some((project) => project.id === "project-1"), false);
  assert.equal(workbench.ui.toast, "项目已删除。");
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-delete-project-card"/);
});

test("bulk project delete keeps only failed items retryable after a partial failure", async () => {
  const workbench = createWorkbench();
  let deleteCalls = 0;
  workbench.ui.deleteProjectMode = "bulk";
  workbench.ui.deleteProjectIds = ["project-1", "project-2"];
  workbench.ui.selectedProjectIds = ["project-1", "project-2"];
  workbench.api.deleteProject = async () => {
    deleteCalls += 1;
    if (deleteCalls === 2) {
      throw new Error("second delete failed");
    }
    return { deleted: true };
  };
  workbench.api.getProjects = async () => ({
    projects: createProjectLibrary(23).map((project, index) => ({
      ...project,
      id: `project-${index + 2}`,
    })),
    pagination: { page: 1, pageSize: 18, total: 23, totalPages: 2 },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-project-card" },
  });

  assert.equal(deleteCalls, 2);
  assert.equal(workbench.ui.deleteProjectSubmitting, false);
  assert.deepEqual(workbench.ui.deleteProjectIds, ["project-2"]);
  assert.deepEqual(workbench.ui.selectedProjectIds, ["project-2"]);
  assert.equal(workbench.ui.projectLibrary.some((project) => project.id === "project-1"), false);
  assert.equal(workbench.ui.projectLibrary.some((project) => project.id === "project-2"), true);
  assert.match(String(workbench.ui.toast), /second delete failed/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-delete-project-card"[^>]*disabled/);
});

test("a stale delete refresh cannot overwrite a newer project page", async () => {
  const workbench = createWorkbench();
  const deleteRefresh = createDeferred();
  const pageRefresh = createDeferred();
  let projectRequests = 0;
  workbench.ui.projectLibraryPagination = { page: 1, pageSize: 18, total: 24, totalPages: 2 };
  workbench.api.deleteProject = async () => ({ deleted: true, projectId: "project-1" });
  workbench.api.getProjects = () => {
    projectRequests += 1;
    return projectRequests === 1 ? deleteRefresh.promise : pageRefresh.promise;
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-project-card", projectId: "project-1" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-project-card" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const changingPage = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "change-project-page", page: "2" },
  });
  pageRefresh.resolve({
    projects: [{ id: "project-page-2", name: "第二页项目", status: "进行中" }],
    pagination: { page: 2, pageSize: 18, total: 24, totalPages: 2 },
  });
  await changingPage;
  assert.equal(workbench.ui.projectLibraryPage, 2);
  assert.equal(workbench.ui.projectLibrary[0]?.id, "project-page-2");

  deleteRefresh.resolve({
    projects: [{ id: "project-stale-page-1", name: "旧第一页项目", status: "进行中" }],
    pagination: { page: 1, pageSize: 18, total: 23, totalPages: 2 },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(workbench.ui.projectLibraryPage, 2);
  assert.equal(workbench.ui.projectLibrary[0]?.id, "project-page-2");
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

test("opening a project panel does not show a success toast", async () => {
  const workbench = createWorkbench();
  workbench.state.project = { id: "project-old", name: "try", phase: "draft", aspectRatio: "16:9" };
  workbench.state.projectDetail = {
    project: { id: "project-old", projectId: "project-old", name: "try", phase: "draft", aspectRatio: "16:9" },
    episodes: [],
    assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
    shots: [],
  };
  workbench.ui.projectLibrary = [
    { id: "project-1", name: "龙珠", status: "进行中", aspectRatio: "9:16", createdAt: "2026/06/03" },
  ];
  const originalWindow = globalThis.window;
  globalThis.window = { location: { hash: "" } };
  workbench.api.selectProject = async ({ projectId }) => ({
    project: {
      id: projectId,
      name: "龙珠",
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
      dataset: { action: "open-project-detail", projectId: "project-1" },
    });
    assert.equal(globalThis.window.location.hash, "#/projects/project-1");
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }

  assert.equal(workbench.ui.projectPanelMode, "detail");
  assert.equal(workbench.ui.projectInteriorSection, "overview");
  assert.equal(workbench.ui.selectedProjectCardId, "project-1");
  assert.equal(workbench.state.project.name, "龙珠");
  assert.equal(workbench.state.projectDetail.project.name, "龙珠");
  assert.equal(workbench.ui.toast, "");
  assert.doesNotMatch(workbench.root.innerHTML, /try/);
  assert.doesNotMatch(workbench.root.innerHTML, /global-workbench-toast success/);
  assert.doesNotMatch(workbench.root.innerHTML, /修改项目制作状态/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="toggle-project-interior-status-menu"/);
});

test("opening a home project workflow renders its project assets and episode storyboards", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = { location: { hash: "#/home" } };
  workbench.ui.activeNavTab = "home";
  workbench.ui.selectedProjectCardId = null;
  workbench.ui.projectLibrary = [
    { id: "project-1", name: "带数据项目", status: "进行中", createdAt: "2026/06/03" },
  ];
  workbench.api.selectProject = async ({ projectId }) => ({
    project: { id: projectId, name: "带数据项目", phase: "shot_generation", aspectRatio: "9:16" },
    episodes: [],
    assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
    shots: [],
  });
  workbench.api.getAssetLibrary = async (projectId) => {
    calls.push(["assets", projectId]);
    return {
      assets: [{
        id: "asset-character-1",
        assetType: "character_sheet",
        label: "项目角色资产-小岚",
        previewUrl: "http://127.0.0.1:4310/uploads/project-character.png",
      }],
    };
  };
  workbench.api.getProjectEpisodes = async (projectId) => {
    calls.push(["episodes", projectId]);
    return { episodes: [{ id: "episode-1", title: "第一集", sequence: 1, storyboardCount: 1 }] };
  };
  workbench.api.getEpisodeWorkbench = async (episodeId) => {
    calls.push(["workbench", episodeId]);
    return {
      data: {
        episode: { id: episodeId, projectId: "project-1", title: "第一集" },
        project: { projectId: "project-1", name: "带数据项目" },
        assetsByType: { character: [], scene: [], prop: [] },
      },
    };
  };
  workbench.api.listEpisodeAssets = async (episodeId) => {
    calls.push(["episode-assets", episodeId]);
    return {
      items: [{
        assetId: "episode-asset-1",
        assetType: "role",
        name: "小岚",
        description: "项目角色资产-小岚",
      }],
    };
  };
  workbench.api.listStoryboards = async (episodeId) => {
    calls.push(["storyboards", episodeId]);
    return {
      items: [{
        id: "storyboard-1",
        episodeId,
        indexNo: 1,
        title: "分镜 1",
        sceneAnalysis: "项目分镜-小岚推开门",
        videoPrompt: "项目分镜-小岚推开门",
      }],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      hasNext: false,
    };
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-project-detail", projectId: "project-1" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(workbench.ui.activeNavTab, "project");
  assert.equal(workbench.ui.projectPanelMode, "episode-workbench");
  assert.equal(workbench.ui.homeWorkflowOrigin, true);
  assert.equal(workbench.ui.episodeWorkbenchLayout, "workflow");
  assert.equal(workbench.ui.selectedEpisodeId, "episode-1");
  assert.equal(workbench.ui.museScopeMode, "storyboard");
  assert.equal(workbench.ui.episodeMediaMode, "video");
  assert.equal(workbench.ui.selectedStoryboardId, "storyboard-1");
  assert.equal(workbench.ui.workflowGenerationWorkbenchOpen, true);
  assert.deepEqual(calls.slice(0, 2), [
    ["assets", "project-1"],
    ["episodes", "project-1"],
  ]);
  assert.deepEqual(calls.slice(2).sort((left, right) => left[0].localeCompare(right[0])), [
    ["storyboards", "episode-1"],
    ["workbench", "episode-1"],
  ]);
  assert.match(workbench.root.innerHTML, /项目角色资产-小岚/);
  assert.match(workbench.root.innerHTML, /项目分镜-小岚推开门/);
  assert.doesNotMatch(workbench.root.innerHTML, /当前剧集还没有分镜/);
});

test("project detail hash keeps the panel on overview", () => {
  const workbench = createWorkbench();
  workbench.ui.activeNavTab = "project";
  workbench.ui.projectPanelMode = "detail";
  workbench.ui.projectInteriorSection = "overview";

  syncWorkbenchHashRouteForTest(workbench, "#/projects/project-1");

  assert.equal(workbench.ui.activeNavTab, "project");
  assert.equal(workbench.ui.projectPanelMode, "detail");
  assert.equal(workbench.ui.projectInteriorSection, "overview");
});

test("history route restoration reloads the target project and episode", async () => {
  const workbench = createWorkbench();
  const selectedProjects = [];
  workbench.session = { user: { id: "user-1", phone: "+86 13800138000" } };
  workbench.api.selectProject = async ({ projectId }) => {
    selectedProjects.push(projectId);
    return {
      project: { id: projectId, projectId, name: `项目 ${projectId}` },
      episodes: [{ id: `episode-${projectId}`, title: `剧集 ${projectId}` }],
      assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      shots: [],
    };
  };

  await restoreWorkbenchRouteFromLocationForTest(workbench, {
    hash: "#/projects/project-2",
    pathname: "/app.html",
  });
  await restoreWorkbenchRouteFromLocationForTest(workbench, {
    hash: "#/projects/project-1/episodes/episode-project-1",
    pathname: "/app.html",
  });

  assert.deepEqual(selectedProjects, ["project-2", "project-1"]);
  assert.equal(workbench.state.project.id, "project-1");
  assert.equal(workbench.ui.selectedProjectCardId, "project-1");
  assert.equal(workbench.ui.selectedEpisodeId, "episode-project-1");
  assert.equal(workbench.ui.projectPanelMode, "episode-workbench");
});

test("a slower history restore cannot replace a newer episode route", async () => {
  const workbench = createWorkbench();
  const pendingSelections = new Map();
  workbench.session = { user: { id: "user-1", phone: "+86 13800138000" } };
  workbench.api.selectProject = ({ projectId }) => new Promise((resolve) => {
    pendingSelections.set(projectId, resolve);
  });
  const projectDetail = (projectId) => ({
    project: { id: projectId, projectId, name: `项目 ${projectId}` },
    episodes: [{ id: `episode-${projectId}`, title: `剧集 ${projectId}` }],
    assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
    shots: [],
  });

  const olderRestore = restoreWorkbenchRouteFromLocationForTest(workbench, {
    hash: "#/projects/project-1/episodes/episode-project-1",
    pathname: "/app.html",
  });
  const newerRestore = restoreWorkbenchRouteFromLocationForTest(workbench, {
    hash: "#/projects/project-2/episodes/episode-project-2",
    pathname: "/app.html",
  });
  pendingSelections.get("project-2")(projectDetail("project-2"));
  await newerRestore;
  pendingSelections.get("project-1")(projectDetail("project-1"));
  await olderRestore;

  assert.equal(workbench.state.project.id, "project-2");
  assert.equal(workbench.ui.selectedProjectCardId, "project-2");
  assert.equal(workbench.ui.selectedEpisodeId, "episode-project-2");
});

test("asset and episode interior tabs do not wait for supplementary project stats", async () => {
  const workbench = createWorkbench();
  workbench.ui.activeNavTab = "project";
  workbench.ui.projectPanelMode = "detail";
  workbench.ui.projectInteriorSection = "overview";
  workbench.ui.selectedProjectCardId = "project-1";
  workbench.api.getProjectMembers = async () => {
    throw new Error("members_should_not_load_for_asset_or_episode_tabs");
  };
  workbench.api.getProjectStats = async () => {
    throw new Error("stats_should_not_load_for_asset_or_episode_tabs");
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "set-project-interior-section", section: "assets" },
  });
  assert.equal(workbench.ui.projectInteriorSection, "assets");

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "set-project-interior-section", section: "episodes" },
  });
  assert.equal(workbench.ui.projectInteriorSection, "episodes");
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
    getUserScripts: async () => {
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

test("home recent projects refresh is isolated from the project gallery state", async () => {
  const workbench = createWorkbench();
  const projectLibrary = workbench.ui.projectLibrary;
  workbench.ui.projectLibraryPagination = { page: 2, pageSize: 18, total: 24, totalPages: 2 };
  workbench.ui.projectLibraryPage = 2;
  workbench.ui.projectSearchQuery = "保留搜索";
  workbench.ui.selectedProjectCardId = "project-20";
  workbench.ui.homeRecentProjects = [];
  workbench.ui.homeProjectTotal = 0;
  workbench.ui.homeProjectsLoading = false;
  workbench.api.getProjects = async (input) => {
    assert.deepEqual(input, { page: 1, pageSize: 8, keyword: "" });
    return {
      projects: createProjectLibrary(8).map((project, index) => ({
        ...project,
        id: `recent-${index + 1}`,
      })),
      pagination: { page: 1, pageSize: 8, total: 37, totalPages: 5 },
    };
  };

  const refreshing = syncHomeProjectLibraryFromApiForTest(workbench);
  assert.equal(workbench.ui.homeProjectsLoading, true);
  assert.equal(await refreshing, true);

  assert.equal(workbench.ui.homeProjectsLoading, false);
  assert.equal(workbench.ui.homeRecentProjects.length, 8);
  assert.equal(workbench.ui.homeProjectTotal, 37);
  assert.equal(workbench.ui.projectLibrary, projectLibrary);
  assert.deepEqual(workbench.ui.projectLibraryPagination, { page: 2, pageSize: 18, total: 24, totalPages: 2 });
  assert.equal(workbench.ui.projectLibraryPage, 2);
  assert.equal(workbench.ui.projectSearchQuery, "保留搜索");
  assert.equal(workbench.ui.selectedProjectCardId, "project-20");
});

test("stale home recent projects response cannot replace the latest response", async () => {
  const workbench = createWorkbench();
  const olderRequest = createDeferred();
  const newerRequest = createDeferred();
  let requestCount = 0;
  workbench.ui.homeRecentProjects = [];
  workbench.ui.homeProjectTotal = 0;
  workbench.ui.homeProjectsLoading = false;
  workbench.api.getProjects = (input) => {
    assert.deepEqual(input, { page: 1, pageSize: 8, keyword: "" });
    requestCount += 1;
    return requestCount === 1 ? olderRequest.promise : newerRequest.promise;
  };

  const olderRefresh = syncHomeProjectLibraryFromApiForTest(workbench);
  const newerRefresh = syncHomeProjectLibraryFromApiForTest(workbench);
  newerRequest.resolve({
    projects: [{ id: "newest-project", name: "最新项目", createdAt: "2026-08-12T12:00:00.000Z" }],
    pagination: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
  });
  assert.equal(await newerRefresh, true);
  olderRequest.resolve({
    projects: [{ id: "stale-project", name: "旧项目", createdAt: "2026-08-11T12:00:00.000Z" }],
    pagination: { page: 1, pageSize: 8, total: 99, totalPages: 13 },
  });
  assert.equal(await olderRefresh, false);

  assert.deepEqual(workbench.ui.homeRecentProjects.map((project) => project.id), ["newest-project"]);
  assert.equal(workbench.ui.homeProjectTotal, 1);
  assert.equal(workbench.ui.homeProjectsLoading, false);
});

test("home recommendations still load when the recent projects request fails", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "#home", pathname: "/home" },
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
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeTvLoading = true;
  workbench.ui.homeTvCategory = "recommended";
  workbench.ui.homeTvCategories = [];
  workbench.api.getProjects = async () => {
    throw new Error("database_temporarily_unavailable");
  };
  workbench.api.getHomeRecommendations = async () => ({
    background: { videoUrl: "https://cdn.example.com/home.mp4", status: "active" },
    categories: [{ id: "category-1", code: "recommended", name: "推荐", videos: [] }],
  });

  try {
    await refreshProductionWorkbenchForTest(workbench);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  }

  assert.equal(workbench.ui.homeTvLoading, false);
  assert.equal(workbench.ui.homeBackground.videoUrl, "https://cdn.example.com/home.mp4");
  assert.deepEqual(workbench.ui.homeTvCategories.map((category) => category.code), ["recommended"]);
});

test("home recommendations render without waiting for recent projects", async () => {
  const workbench = createWorkbench();
  const projectsRequest = createDeferred();
  const recommendationsRequest = createDeferred();
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "#home", pathname: "/home" },
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
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeTvLoading = true;
  workbench.ui.homeTvCategory = "recommended";
  workbench.ui.homeTvCategories = [];
  workbench.api.getProjects = () => projectsRequest.promise;
  workbench.api.getHomeRecommendations = () => recommendationsRequest.promise;

  try {
    const refreshing = refreshProductionWorkbenchForTest(workbench);
    recommendationsRequest.resolve({
      background: { videoUrl: "https://cdn.example.com/immediate.mp4", status: "active" },
      categories: [{
        id: "category-1",
        code: "recommended",
        name: "推荐",
        videos: [{ id: "video-1", title: "推荐视频", coverUrl: "https://cdn.example.com/cover.jpg" }],
      }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.doesNotMatch(workbench.root.innerHTML, /正在加载推荐视频/);
    assert.match(workbench.root.innerHTML, /https:\/\/cdn\.example\.com\/immediate\.mp4/);
    assert.match(workbench.root.innerHTML, /https:\/\/cdn\.example\.com\/cover\.jpg/);

    projectsRequest.resolve({ projects: [], pagination: { total: 0 } });
    await refreshing;
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  }
});

test("cached home recommendations hydrate the first render before the network request", async () => {
  const cachedPayload = {
    background: { videoUrl: "/api/home-recommendations/background/media?v=cached", status: "active" },
    categories: [{ id: "cached-category", code: "recommended", name: "推荐", videos: [] }],
  };
  const root = { innerHTML: "", querySelector() { return null; }, addEventListener() {} };
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "#home", pathname: "/home" },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
    createElement() { return { innerHTML: "", querySelector() { return null; } }; },
  };
  globalThis.localStorage = {
    getItem(key) {
      return key === "comic-ai:home-recommendations:v1"
        ? JSON.stringify({ savedAt: "2026-08-21T00:00:00.000Z", payload: cachedPayload })
        : null;
    },
    setItem() {},
    removeItem() {},
  };
  globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

  try {
    const workbench = await initProductionWorkbench({
      root,
      session: null,
      api: {},
      onLogout() {},
      deferInitialRender: true,
    });

    assert.equal(workbench.ui.homeTvLoading, false);
    assert.equal(workbench.ui.homeBackground.videoUrl, cachedPayload.background.videoUrl);
    assert.deepEqual(workbench.ui.homeTvCategories, cachedPayload.categories);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  }
});

test("ignores a corrupted cached home recommendation category", async () => {
  const root = { innerHTML: "", querySelector() { return null; }, addEventListener() {} };
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "#home", pathname: "/home" },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
    createElement() { return { innerHTML: "", querySelector() { return null; } }; },
  };
  globalThis.localStorage = {
    getItem(key) {
      return key === "comic-ai:home-recommendations:v1"
        ? JSON.stringify({ payload: { background: { status: "active" }, categories: [null] } })
        : null;
    },
    setItem() {},
    removeItem() {},
  };
  globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

  try {
    const workbench = await initProductionWorkbench({
      root,
      session: null,
      api: {},
      onLogout() {},
      deferInitialRender: true,
    });

    assert.equal(workbench.ui.homeTvLoading, true);
    assert.deepEqual(workbench.ui.homeTvCategories, []);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  }
});

test("fresh home recommendations replace and persist the cached homepage payload", async () => {
  const workbench = createWorkbench();
  const stored = new Map();
  let storageWrites = 0;
  const originalLocalStorage = globalThis.localStorage;
  const freshPayload = {
    background: { videoUrl: "/api/home-recommendations/background/media?v=fresh", status: "active" },
    categories: [{ id: "fresh-category", code: "recommended", name: "推荐", videos: [] }],
  };
  workbench.ui.homeTvLoading = true;
  workbench.ui.homeTvCategory = "recommended";
  workbench.ui.homeTvCategories = [];
  workbench.ui.homeBackground = { videoUrl: "", posterUrl: "", status: "inactive" };
  workbench.api.getHomeRecommendations = async (input) => {
    assert.equal(input.fresh, true);
    return freshPayload;
  };
  globalThis.localStorage = {
    getItem(key) { return stored.get(key) ?? null; },
    setItem(key, value) { storageWrites += 1; stored.set(key, value); },
    removeItem(key) { stored.delete(key); },
  };

  try {
    assert.equal(await syncHomeRecommendationsFromApiForTest(workbench), true);
    assert.equal(await syncHomeRecommendationsFromApiForTest(workbench), false);
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }

  const persisted = JSON.parse(stored.get("comic-ai:home-recommendations:v1"));
  assert.deepEqual(persisted.payload, freshPayload);
  assert.equal(storageWrites, 1);
  assert.equal(workbench.ui.homeBackground.videoUrl, freshPayload.background.videoUrl);
});

test("visible home recommendations revalidate every fifteen seconds and stop off homepage", async () => {
  let intervalCallback = null;
  let intervalMs = 0;
  let recommendationCalls = 0;
  let pendingRecommendation = null;
  const homePayload = {
    background: null,
    categories: [{ id: "recommended", code: "recommended", name: "推荐", videos: [] }],
  };
  const pagehideListeners = [];
  let clearedIntervals = 0;
  const root = { innerHTML: "", querySelector() { return null; }, addEventListener() {} };
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "#home", pathname: "/home" },
    setTimeout,
    clearTimeout,
    setInterval(callback, delay) {
      intervalCallback = callback;
      intervalMs = delay;
      return 41;
    },
    clearInterval() { clearedIntervals += 1; },
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    addEventListener(type, listener) {
      if (type === "pagehide") pagehideListeners.push(listener);
    },
    removeEventListener() {},
  };
  globalThis.document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
    createElement() { return { innerHTML: "", querySelector() { return null; } }; },
  };
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

  try {
    const workbench = await initProductionWorkbench({
      root,
      session: null,
      api: {
        async getHomeRecommendations(input) {
          assert.equal(input.fresh, true);
          recommendationCalls += 1;
          return pendingRecommendation?.promise ?? homePayload;
        },
      },
      onLogout() {},
      deferInitialRender: true,
    });
    workbench.ui.homeBackground = { videoUrl: "", posterUrl: "", status: "inactive" };
    workbench.ui.homeTvCategories = homePayload.categories;
    workbench.ui.homeTvCategory = "recommended";
    workbench.ui.homeTvLoading = false;

    assert.equal(intervalMs, 15_000);
    intervalCallback();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(recommendationCalls, 1);

    pendingRecommendation = createDeferred();
    intervalCallback();
    await Promise.resolve();
    assert.equal(workbench.ui.homeTvLoading, false);
    pendingRecommendation.resolve(homePayload);
    await new Promise((resolve) => setTimeout(resolve, 0));
    pendingRecommendation = null;

    workbench.ui.activeNavTab = "project";
    intervalCallback();
    await Promise.resolve();
    assert.equal(recommendationCalls, 2);

    workbench.ui.activeNavTab = "home";
    globalThis.document.visibilityState = "hidden";
    intervalCallback();
    await Promise.resolve();
    assert.equal(recommendationCalls, 2);

    globalThis.document.visibilityState = "visible";
    pagehideListeners.forEach((listener) => listener({ persisted: true }));
    assert.equal(clearedIntervals, 0);
    assert.equal(workbench.homeRecommendationRefreshTimer, 41);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  }
});

test("opening home requests recommendations and ignores an older response", async () => {
  const workbench = createWorkbench();
  const olderRequest = createDeferred();
  const newerRequest = createDeferred();
  let requestCount = 0;
  workbench.ui.homeTvLoading = true;
  workbench.ui.homeTvCategory = "recommended";
  workbench.ui.homeTvCategories = [];
  workbench.ui.homeBackground = { videoUrl: "", status: "inactive" };
  workbench.api.getProjects = async () => ({ projects: [], pagination: { total: 0 } });
  workbench.api.getHomeRecommendations = () => {
    requestCount += 1;
    return requestCount === 1 ? olderRequest.promise : newerRequest.promise;
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "set-nav-tab", tab: "home" },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requestCount, 1);

  const newerRefresh = syncHomeRecommendationsFromApiForTest(workbench);
  newerRequest.resolve({
    background: { videoUrl: "https://cdn.example.com/new.mp4", status: "active" },
    categories: [{ id: "new", code: "recommended", name: "推荐", videos: [] }],
  });
  assert.equal(await newerRefresh, true);
  olderRequest.resolve({
    background: { videoUrl: "https://cdn.example.com/old.mp4", status: "active" },
    categories: [{ id: "old", code: "old", name: "旧内容", videos: [] }],
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(workbench.ui.homeTvLoading, false);
  assert.equal(workbench.ui.homeBackground.videoUrl, "https://cdn.example.com/new.mp4");
  assert.deepEqual(workbench.ui.homeTvCategories.map((category) => category.id), ["new"]);
});

test("home Agent attachment remove action deletes the matching inline file", async () => {
  const workbench = createWorkbench();
  workbench.homeAgentFiles = [{ name: "one.png" }, { name: "two.mp4" }];
  workbench.ui.homeAgentAttachments = [
    { id: "attachment-one", name: "one.png", kind: "image" },
    { id: "attachment-two", name: "two.mp4", kind: "video" },
  ];
  workbench.ui.homeAgentAttachmentCount = 2;
  workbench.ui.homeAgentComposerSegments = [
    { type: "text", text: "开头\n" },
    { type: "attachment", attachmentId: "attachment-one" },
    { type: "text", text: "中间" },
    { type: "attachment", attachmentId: "attachment-two" },
  ];

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "remove-home-agent-attachment", attachmentId: "attachment-one" },
  });

  assert.deepEqual(workbench.ui.homeAgentAttachments.map((attachment) => attachment.id), ["attachment-two"]);
  assert.deepEqual(workbench.homeAgentFiles.map((file) => file.name), ["two.mp4"]);
  assert.equal(workbench.ui.homeAgentAttachmentCount, 1);
  assert.deepEqual(workbench.ui.homeAgentComposerSegments, [
    { type: "text", text: "开头\n" },
    { type: "text", text: "中间" },
    { type: "attachment", attachmentId: "attachment-two" },
  ]);
});

test("home Agent submission text preserves inline attachment and model positions", () => {
  const workbench = createWorkbench();
  workbench.ui.homeAgentAttachments = [
    { id: "attachment-image", name: "角色图.png", kind: "image" },
    { id: "attachment-video", name: "镜头.mp4", kind: "video" },
  ];
  workbench.ui.episodeGenerationConfig = {
    models: [
      { mediaType: "image", modelCode: "image-pro", modelLabel: "图片 Pro" },
      { mediaType: "image", modelCode: "image-other", modelLabel: "其他图片模型" },
      { media_type: "i2v", model_code: "video-pro", model_label: "视频 Pro" },
    ],
  };
  workbench.ui.homeAgentSelectedModels = { image: "image-pro", video: "video-pro" };
  workbench.ui.homeAgentComposerSegments = [
    { type: "text", text: "先参考" },
    { type: "attachment", attachmentId: "attachment-image" },
    { type: "text", text: "\n生成角色，再使用" },
    { type: "model", mediaType: "image" },
    { type: "text", text: "制作，并结合" },
    { type: "attachment", attachmentId: "attachment-video" },
    { type: "text", text: "分析镜头，再用" },
    { type: "model", mediaType: "video" },
    { type: "text", text: "生成。" },
  ];

  assert.equal(
    homeAgentPromptTextForSubmissionForTest(workbench),
    "先参考【附件：角色图.png】\n生成角色，再使用【图片模型：图片 Pro】制作，并结合【附件：镜头.mp4】分析镜头，再用【视频模型：视频 Pro】生成。",
  );
});

test("home Agent Skill picker inserts a selected Skill inline without leaving the homepage", async () => {
  const workbench = createWorkbench();
  const calls = [];
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeAgentComposerSegments = [{ type: "text", text: "请按" }];
  workbench.homeAgentComposerCaret = { offset: 2 };
  workbench.api.getPromptSkills = async (input) => {
    calls.push(input);
    return {
      items: input.source === "official"
        ? [{ id: "official-style", title: "电影感画面", summary: "统一镜头语言", category: "image_style" }]
        : [{ id: "private-shot", title: "我的分镜模板", summary: "镜头拆解", category: "storyboard" }],
    };
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "open-home-agent-skill-picker" },
  });

  assert.equal(workbench.ui.activeNavTab, "home");
  assert.equal(workbench.ui.homeAgentSkillPickerOpen, true);
  assert.deepEqual(calls, [
    { source: "official", category: "all", page: 1, pageSize: 100 },
    { source: "private", category: "all", page: 1, pageSize: 100 },
  ]);

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "select-home-agent-skill", skillId: "official-style", skillCategory: "image_style" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-home-agent-skill" },
  });

  assert.equal(workbench.ui.homeAgentSkillPickerOpen, false);
  assert.deepEqual(workbench.ui.homeAgentComposerSegments, [
    { type: "text", text: "请按" },
    { type: "skill", skillId: "official-style" },
  ]);
  assert.equal(homeAgentPromptTextForSubmissionForTest(workbench), "请按【Skill：电影感画面】");

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "remove-home-agent-skill", skillId: "official-style" },
  });
  assert.deepEqual(workbench.ui.homeAgentComposerSegments, [{ type: "text", text: "请按" }]);
});

test("home Agent video model tab refreshes the video generation config", async () => {
  const workbench = createWorkbench();
  workbench.ui.episodeGenerationConfig = {
    models: [{ mediaType: "image", modelCode: "image-pro", modelLabel: "图片 Pro" }],
    defaultImageModelCode: "image-pro",
  };
  workbench.ui.homeAgentModelTab = "image";
  workbench.api.listGlobalGenerationConfig = async (input) => {
    assert.deepEqual(input, { fresh: true, mediaType: "video" });
    return {
      models: [{ media_type: "i2v", modelCode: "video-pro", modelLabel: "视频 Pro" }],
      defaultVideoModelCode: "video-pro",
    };
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "set-home-agent-model-tab", modelKind: "video" },
  });

  assert.equal(workbench.ui.homeAgentModelTab, "video");
  assert.deepEqual(
    workbench.ui.episodeGenerationConfig.models.map((model) => model.modelCode),
    ["image-pro", "video-pro"],
  );
});

test("home Agent video model can be inserted inline and removed independently", async () => {
  const workbench = createWorkbench();
  workbench.ui.episodeGenerationConfig = {
    models: [{ mediaType: "video", modelCode: "video-pro", modelLabel: "视频 Pro" }],
  };
  workbench.ui.homeAgentComposerSegments = [
    { type: "text", text: "前文后文" },
  ];
  workbench.ui.homeAgentSelectedModels = { image: "", video: "" };
  workbench.homeAgentComposerCaret = { offset: 2 };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "select-home-agent-model", modelKind: "video", modelCode: "video-pro" },
  });

  assert.deepEqual(workbench.ui.homeAgentComposerSegments, [
    { type: "text", text: "前文" },
    { type: "model", mediaType: "video" },
    { type: "text", text: "后文" },
  ]);
  assert.equal(workbench.ui.homeAgentSelectedModels.video, "video-pro");

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "remove-home-agent-model", modelKind: "video" },
  });

  assert.deepEqual(workbench.ui.homeAgentComposerSegments, [
    { type: "text", text: "前文" },
    { type: "text", text: "后文" },
  ]);
  assert.equal(workbench.ui.homeAgentSelectedModels.video, "");
});

test("home workflow submission uploads a script and opens the shared episode workflow", async () => {
  const workbench = createWorkbench();
  const calls = [];
  const originalWindow = globalThis.window;
  globalThis.window = { location: { hash: "#home" } };
  workbench.ui.homeCreationMode = "workflow";
  workbench.ui.homeWorkflowScriptFile = { name: "第一集.txt", type: "text/plain" };
  workbench.ui.homeWorkflowScriptFileName = "第一集.txt";
  workbench.ui.membershipStatus = { status: "active" };
  workbench.ui.projectStyles = [{ code: "animation" }];
  workbench.ui.isCreateModalOpen = false;
  workbench.api.uploadFile = async (file, options) => {
    calls.push(["uploadFile", file, options]);
    return {
      upload: {
        uploadSessionId: "script-upload-1",
        storageObjectId: "storage-script-1",
        mimeType: "text/plain",
      },
    };
  };
  workbench.api.createProject = async (input) => {
    calls.push(["createProject", input]);
    return { project: { id: "workflow-project" } };
  };
  workbench.api.getProjectDetail = async (projectId) => {
    calls.push(["getProjectDetail", projectId]);
    return {
      project: { id: projectId, name: "第一集" },
      script: { id: "script-1", inputText: "第一集\n任小野走进雨夜车站。" },
      episodes: [{ id: "episode-1", title: "第一集", sequence: 1 }],
      assetsByType: { character: [], scene: [], prop: [] },
      shots: [],
    };
  };
  workbench.api.createAiStoryboardPreview = async (...args) => {
    calls.push(["createAiStoryboardPreview", ...args]);
    return {};
  };
  workbench.api.createCanvasProject = async () => {
    throw new Error("workflow_must_not_create_canvas");
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "submit-home-agent-prompt" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.deepEqual(calls.map(([name]) => name), ["uploadFile", "createProject", "getProjectDetail", "createAiStoryboardPreview"]);
  assert.equal(calls[0][2].category, "script-documents");
  assert.equal(calls[1][1].scriptInput, "");
  assert.equal(calls[1][1].scriptUploadSessionId, "script-upload-1");
  assert.equal(calls[1][1].name, "第一集");
  assert.equal(calls[3][1], "workflow-project");
  assert.deepEqual(calls[3][2], {
    scriptText: "第一集\n任小野走进雨夜车站。",
    skipScriptStage: true,
    useDefaultWorkflowStages: true,
    packages: null,
  });
  assert.equal(Object.hasOwn(calls[3][2], "instruction"), false);
  assert.equal(Object.hasOwn(calls[3][2], "resolveInstructionIntent"), false);
  assert.equal(workbench.ui.isCreateModalOpen, false);
  assert.equal(workbench.ui.episodeWorkbenchLayout, "workflow");
  assert.equal(workbench.ui.workflowGenerationWorkbenchOpen, false);
  assert.equal(workbench.ui.projectPanelMode, "episode-workbench");
  assert.equal(workbench.ui.selectedProjectCardId, "workflow-project");
  assert.equal(workbench.ui.selectedEpisodeId, "episode-1");
  assert.equal(workbench.ui.museScopeMode, "assets");
});

test("home workflow rejects an oversized script when selected", () => {
  const workbench = createWorkbench();
  workbench.ui.homeWorkflowScriptFile = { name: "旧剧本.txt" };
  workbench.ui.homeWorkflowScriptFileName = "旧剧本.txt";

  const accepted = setHomeWorkflowScriptFileForTest(workbench, {
    name: "超大剧本.txt",
    size: 10 * 1024 * 1024 + 1,
    type: "text/plain",
  });

  assert.equal(accepted, false);
  assert.equal(workbench.ui.homeWorkflowScriptFile, null);
  assert.equal(workbench.ui.homeWorkflowScriptFileName, "");
  assert.equal(workbench.ui.toast, "剧本文档不能超过 10 MB，请换用更小的文件。");
});

test("script upload rejects an oversized script when selected", () => {
  const workbench = createWorkbench();
  workbench.ui.scriptUploadFile = { name: "旧剧本.docx" };
  workbench.ui.scriptUploadFileName = "旧剧本.docx";

  const accepted = setScriptUploadFileForTest(workbench, {
    name: "超大剧本.docx",
    size: 10 * 1024 * 1024 + 1,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  assert.equal(accepted, false);
  assert.equal(workbench.ui.scriptUploadFile, null);
  assert.equal(workbench.ui.scriptUploadFileName, "");
  assert.equal(workbench.ui.uploadNotice, "剧本文档不能超过 10 MB，请换用更小的文件。");
});

test("home workflow refuses to start without an uploaded script", async () => {
  const workbench = createWorkbench();
  let createCalls = 0;
  workbench.ui.homeCreationMode = "workflow";
  workbench.api.createProject = async () => {
    createCalls += 1;
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "submit-home-agent-prompt" },
  });

  assert.equal(createCalls, 0);
  assert.equal(workbench.ui.toast, "请先上传 DOCX 或 TXT 剧本文档。");
});

test("clicking the free generation tab immediately opens the conversation page", async () => {
  const workbench = createWorkbench();
  const pushedRoutes = [];
  let createCalls = 0;
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { pathname: "/app.html", search: "", hash: "#home" },
    history: {
      pushState(_state, _title, route) { pushedRoutes.push(route); },
      replaceState() {},
    },
  };
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeCreationMode = "agent";
  workbench.api.createCanvasProject = async () => {
    createCalls += 1;
    return { project: { id: "unexpected" } };
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-home-creation-mode", creationMode: "free" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(createCalls, 0);
  assert.equal(workbench.ui.activeNavTab, "free-generation");
  assert.equal(workbench.ui.canvasAgentOnly, true);
  assert.equal(workbench.ui.canvasAgentCapabilityProfile, "media_generation_only");
  assert.equal(workbench.ui.canvasSessionUiStateReady, true);
  assert.equal(workbench.ui.selectedCanvasProjectId, "canvas-project-main");
  assert.deepEqual(pushedRoutes, ["#free-generation"]);
  assert.match(workbench.root.innerHTML, /home-free-generation-dialog/);
  assert.match(workbench.root.innerHTML, /data-new-canvas-mount/);
  assert.match(workbench.root.innerHTML, /workbench-rail persistent/);
  assert.match(workbench.root.innerHTML, /global-statusbar/);
  assert.match(workbench.root.innerHTML, /new-canvas-workbench-host/);
});

test("anonymous users are prompted to log in before opening free generation", async () => {
  const workbench = createWorkbench();
  const loginReasons = [];
  workbench.session = { authenticated: false, user: { id: "", phone: "" } };
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeCreationMode = "agent";
  workbench.onRequireLogin = async (reason) => {
    loginReasons.push(reason);
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "set-home-creation-mode", creationMode: "free" },
  });

  assert.deepEqual(loginReasons, ["free-generation"]);
  assert.equal(workbench.ui.activeNavTab, "home");
  assert.equal(workbench.ui.homeCreationMode, "agent");
  assert.notEqual(workbench.ui.canvasAgentOnly, true);
});

test("home free generation opens the standalone media conversation route", async () => {
  const workbench = createWorkbench();
  const pushedRoutes = [];
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { pathname: "/app.html", search: "", hash: "#home" },
    history: {
      pushState(_state, _title, route) { pushedRoutes.push(route); },
      replaceState() {},
    },
  };
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeCreationMode = "free";
  workbench.ui.homeAgentComposerSegments = [{ type: "text", text: "生成雨夜车站的电影感画面" }];
  workbench.ui.homeAgentMode = "c";
  workbench.ui.homeAgentSelectedModels = { image: "image-pro", video: "" };
  workbench.ui.membershipStatus = { status: "active" };
  workbench.ui.episodeGenerationConfig = {
    models: [{ mediaType: "image", modelCode: "image-pro", modelLabel: "图片 Pro" }],
  };
  workbench.api.createCanvasProject = async () => ({ project: { id: "free-session", title: "自由生成" } });

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "submit-home-agent-prompt" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(workbench.ui.activeNavTab, "free-generation");
  assert.equal(workbench.ui.canvasProjectView, "detail");
  assert.equal(workbench.ui.canvasAgentOnly, true);
  assert.equal(workbench.ui.canvasAgentCapabilityProfile, "media_generation_only");
  assert.equal(workbench.pendingHomeAgentPrompt.capabilityProfile, "media_generation_only");
  assert.deepEqual(workbench.pendingHomeAgentPrompt.preferredModels, { image: "image-pro" });
  assert.deepEqual(pushedRoutes, ["#free-generation"]);
  assert.match(workbench.root.innerHTML, /home-free-generation-dialog/);
  assert.match(workbench.root.innerHTML, /data-new-canvas-mount/);
  assert.match(workbench.root.innerHTML, /workbench-rail persistent/);
  assert.match(workbench.root.innerHTML, /global-statusbar/);
});

test("home Agent creation uses the Canvas default model when none was selected", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { pathname: "/app.html", search: "", hash: "#home" },
    history: { pushState() {}, replaceState() {} },
  };
  workbench.ui.activeNavTab = "home";
  workbench.ui.homeCreationMode = "agent";
  workbench.ui.homeAgentComposerSegments = [{ type: "text", text: "帮我生成一张大树图片" }];
  workbench.ui.membershipStatus = { status: "active" };
  workbench.api.createCanvasProject = async () => ({ project: { id: "agent-default-model" } });
  workbench.api.listGlobalGenerationConfig = async () => ({
    models: [{ mediaType: "image", modelCode: "image-enabled", modelLabel: "图片模型" }],
    defaultImageModelCode: "image-enabled",
  });
  workbench.api.getCanvasSettings = async () => ({
    settings: { defaultModels: { image: "image-enabled" } },
  });

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "submit-home-agent-prompt" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.deepEqual(workbench.pendingHomeAgentPrompt.preferredModels, { image: "image-enabled" });
});

test("free generation route is independent from Canvas routing", () => {
  const workbench = createWorkbench();
  const location = {
    pathname: "/app.html",
    search: "",
    hash: "#free-generation",
  };

  assert.equal(deriveInitialNavTabForTest("free-generation", workbench.session), "free-generation");
  syncWorkbenchRouteStateForTest(workbench, "free-generation");
  syncCanvasRouteStateForTest(workbench, "free-generation", location);

  assert.equal(workbench.ui.activeNavTab, "free-generation");
  assert.equal(workbench.ui.selectedCanvasProjectId, undefined);
  assert.equal(workbench.ui.canvasAgentOnly, true);
  assert.equal(workbench.ui.canvasAgentCapabilityProfile, "media_generation_only");
  assert.equal(workbench.ui.canvasSessionUiStateReady, true);
});

test("re-entering free generation does not change the active Canvas selection", async () => {
  const workbench = createWorkbench();
  const pushedRoutes = [];
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { pathname: "/app.html", search: "", hash: "#free-generation" },
    history: {
      pushState(_state, _title, route) { pushedRoutes.push(route); },
      replaceState() {},
    },
  };
  workbench.ui.selectedCanvasProjectId = "canvas-project-main";
  workbench.ui.canvasAgent = { conversationId: "conversation-1", messages: [{ id: "message-1" }] };
  workbench.ui.canvasSessionUiState = {
    canvasAgent: { conversationId: "conversation-1", panelOpen: true },
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-home-creation-mode", creationMode: "free" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(workbench.ui.selectedCanvasProjectId, "canvas-project-main");
  assert.equal(workbench.ui.canvasAgent.conversationId, "conversation-1");
  assert.equal(workbench.ui.canvasSessionUiState.canvasAgent.conversationId, "conversation-1");
  assert.deepEqual(pushedRoutes, ["#free-generation"]);
});

test("free generation refresh restores the configured background video", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "#free-generation", pathname: "/app.html", search: "" },
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
  workbench.ui.activeNavTab = "free-generation";
  workbench.ui.canvasProjectView = "detail";
  workbench.ui.canvasAgentOnly = true;
  workbench.ui.canvasAgentCapabilityProfile = "media_generation_only";
  workbench.ui.homeBackground = { videoUrl: "", status: "inactive" };
  workbench.api.getHomeRecommendations = async () => ({
    background: { videoUrl: "https://cdn.example.com/free-generation.mp4", status: "active" },
    categories: [],
  });

  try {
    await refreshProductionWorkbenchForTest(workbench);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  }

  assert.equal(workbench.ui.homeBackground.videoUrl, "https://cdn.example.com/free-generation.mp4");
  assert.match(workbench.root.innerHTML, /free-generation\.mp4/);
});

test("free generation refresh rerenders the home shell when the background video becomes available", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const refreshSource = source.match(/async function refresh\(workbench\) \{[\s\S]*?function syncWorkbenchHashRoute/ )?.[0] ?? "";

  assert.match(refreshSource, /const previousHomeBackground = workbench\.ui\.homeBackground/);
  assert.match(refreshSource, /const homeBackgroundChanged =/);
  assert.match(refreshSource, /if \(homeBackgroundChanged\) \{\s*render\(workbench\);\s*return;/);
});

test("leaving free generation clears its standalone Agent mode", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  globalThis.window = { location: { hash: "#free-generation", pathname: "/app.html" } };
  workbench.ui.activeNavTab = "free-generation";
  workbench.ui.canvasAgentOnly = true;
  workbench.ui.canvasAgentCapabilityProfile = "media_generation_only";

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "project" },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(workbench.ui.activeNavTab, "project");
  assert.equal(workbench.ui.canvasAgentOnly, false);
  assert.equal(workbench.ui.canvasAgentCapabilityProfile, "");
});

test("returning from free generation to workflow reloads the home project list", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  globalThis.window = { location: { hash: "#free-generation", pathname: "/app.html" } };
  workbench.ui.activeNavTab = "free-generation";
  workbench.ui.homeRecentProjects = [];
  workbench.ui.homeProjectTotal = 0;
  workbench.api.getProjects = async () => ({
    projects: [{ id: "project-returned", name: "已创建项目", status: "草稿", createdAt: "2026/08/14" }],
    pagination: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
  });

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-home-creation-mode", creationMode: "workflow" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(workbench.ui.activeNavTab, "home");
  assert.equal(workbench.ui.homeProjectsLoading, false);
  assert.equal(workbench.ui.homeProjectTotal, 1);
  assert.equal(workbench.ui.homeRecentProjects[0]?.id, "project-returned");
});

test("returning from a project workflow reloads the latest home projects", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const projectRequests = [];
  globalThis.window = { location: { hash: "#project" } };
  workbench.ui.activeNavTab = "project";
  workbench.ui.projectPanelMode = "episode-workbench";
  workbench.ui.homeRecentProjects = [{ id: "stale-project", name: "旧项目" }];
  workbench.ui.homeProjectTotal = 1;
  workbench.api.getProjects = async (input) => {
    projectRequests.push(input);
    return {
      projects: [{ id: "new-project", name: "刚创建的项目", status: "草稿", createdAt: "2026-08-15T12:00:00.000Z" }],
      pagination: { page: 1, pageSize: 8, total: 2, totalPages: 1 },
    };
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "back-to-home-from-workflow" },
    });
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.equal(workbench.ui.activeNavTab, "home");
  assert.equal(workbench.ui.homeProjectsLoading, false);
  assert.deepEqual(projectRequests, [{ page: 1, pageSize: 8, keyword: "" }]);
  assert.equal(workbench.ui.homeProjectTotal, 2);
  assert.equal(workbench.ui.homeRecentProjects[0]?.id, "new-project");
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

test("direct canvas refresh starts its document request before the project list returns", async () => {
  const calls = [];
  let resolveCanvasProjects;
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: {
      pathname: "/app.html",
      search: "?canvasProjectId=canvas-route",
      hash: "#tools-canvas",
    },
    history: { replaceState() {} },
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
  workbench.ui.activeNavTab = "tools";
  workbench.ui.canvasProjectView = "detail";
  workbench.ui.selectedCanvasProjectId = "canvas-route";
  workbench.ui.canvasProjects = [];
  workbench.api = {
    async getStandaloneCanvas(canvasProjectId) {
      calls.push(`canvas:${canvasProjectId}`);
      return {
        canvas: {
          id: canvasProjectId,
          canvasProjectId,
          serverRevision: 1,
          document: { version: 2, canvasProjectId, viewport: {}, nodes: [], edges: [] },
        },
      };
    },
    async getCanvasSession(canvasProjectId) {
      calls.push(`session:${canvasProjectId}`);
      return { session: null };
    },
    getCanvasProjects() {
      calls.push("canvas-projects");
      return new Promise((resolve) => {
        resolveCanvasProjects = resolve;
      });
    },
  };

  try {
    const refreshRequest = syncCanvasProjectsFromApiForTest(workbench);
    await Promise.resolve();
    assert.deepEqual(calls, [
      "canvas:canvas-route",
      "session:canvas-route",
      "canvas-projects",
    ]);
    resolveCanvasProjects({ projects: [{ id: "canvas-route", title: "路由画布" }] });
    await refreshRequest;
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  }

  assert.equal(calls.filter((call) => call === "canvas:canvas-route").length, 1);
});

test("direct canvas refresh retries the selected document when speculative loading fails", async () => {
  const calls = [];
  let standaloneAttempts = 0;
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      pathname: "/app.html",
      search: "?canvasProjectId=canvas-route",
      hash: "#tools-canvas",
    },
    history: { replaceState() {} },
  };
  workbench.ui.activeNavTab = "tools";
  workbench.ui.canvasProjectView = "detail";
  workbench.ui.selectedCanvasProjectId = "canvas-route";
  workbench.ui.canvasProjects = [];
  workbench.api = {
    async getStandaloneCanvas(canvasProjectId) {
      standaloneAttempts += 1;
      calls.push(`canvas:${canvasProjectId}:${standaloneAttempts}`);
      if (standaloneAttempts === 1) throw new Error("temporary failure");
      return {
        canvas: {
          canvasProjectId,
          serverRevision: 1,
          document: { version: 2, canvasProjectId, viewport: {}, nodes: [], edges: [] },
        },
      };
    },
    getCanvasProjects() {
      calls.push("canvas-projects");
      return Promise.resolve({ projects: [{ id: "canvas-route", title: "路由画布" }] });
    },
  };

  try {
    await syncCanvasProjectsFromApiForTest(workbench);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert.deepEqual(calls, ["canvas:canvas-route:1", "canvas-projects", "canvas:canvas-route:2"]);
  assert.equal(workbench.ui.canvasDocument.canvasProjectId, "canvas-route");
});

test("path navigation starts lazy surface requests after pushState", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const pushedPaths = [];
  const calls = [];
  globalThis.window = {
    location: {
      pathname: "/team",
      hash: "",
      origin: "http://127.0.0.1:4173",
    },
    history: {
      pushState(_state, _title, path) {
        pushedPaths.push(path);
        globalThis.window.location.pathname = path;
        globalThis.window.location.hash = "";
      },
    },
  };
  workbench.ui.activeNavTab = "team";
  workbench.ui.libraryTeamRoute = "team";
  workbench.ui.libraryTeamAssetScope = "official";
  workbench.ui.libraryCategory = "character";
  workbench.ui.libraryFolder = "国内仿真人-现代都市";
  workbench.ui.libraryQuery = "";
  workbench.api = {
    getLibraryAssets: async (input) => {
      calls.push(input);
      return { assets: [], categories: [], folders: [], entitlement: null };
    },
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "set-nav-tab", tab: "library" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }

  assert.deepEqual(pushedPaths, ["/assets"]);
  assert.equal(workbench.ui.activeNavTab, "library");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scope, "official");
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

test("home hero pointer movement updates the cinematic cursor aura without rendering", async () => {
  const styleValues = new Map();
  let pointerMoveHandler = null;
  const TestElement = class Element {};
  const TestNode = class Node {};
  const hero = new TestElement();
  hero.style = {
    setProperty(name, value) {
      styleValues.set(name, value);
    },
  };
  hero.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 300 });
  hero.closest = (selector) => (selector === ".home-hero" ? hero : null);
  const workbench = {
    ...createWorkbench(),
    root: {
      innerHTML: "",
      querySelector(selector) {
        return selector === ".home-hero" ? hero : null;
      },
      addEventListener(type, handler) {
        if (type === "pointermove") {
          pointerMoveHandler = handler;
        }
      },
    },
  };
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalElement = globalThis.Element;
  const originalNode = globalThis.Node;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "" },
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
  globalThis.Element = TestElement;
  globalThis.Node = TestNode;
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
      root: workbench.root,
      session: { user: { phone: "+86 13800138000" } },
      onLogout() {},
      api: {
        getSession: async () => ({ user: { phone: "+86 13800138000", creditBalance: 12 } }),
        getProjects: async () => ({ projects: [] }),
        getProjectStyles: async () => ({ data: [] }),
        getStoryboardPromptPackages: async () => ({ data: [] }),
      },
    });
    pointerMoveHandler?.({
      target: hero,
      clientX: 300,
      clientY: 200,
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
    if (originalElement === undefined) {
      delete globalThis.Element;
    } else {
      globalThis.Element = originalElement;
    }
    if (originalNode === undefined) {
      delete globalThis.Node;
    } else {
      globalThis.Node = originalNode;
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

  assert.equal(styleValues.get("--home-pointer-x"), "50.00%");
  assert.equal(styleValues.get("--home-pointer-y"), "50.00%");
});

test("hash route changes re-render the active surface", async () => {
  const workbench = createWorkbench();
  workbench.ui.activeNavTab = "home";
  workbench.ui.projectPanelMode = "library";
  workbench.api = {
    getUserScripts: async () => ({ scripts: [] }),
  };

  syncWorkbenchHashRouteForTest(workbench, "#script");

  assert.equal(workbench.ui.activeNavTab, "script");
  assert.match(workbench.root.innerHTML, /data-scroll-surface="script"/);
  assert.match(workbench.root.innerHTML, /data-tab="script"[\s\S]*aria-selected="true"|aria-selected="true"[\s\S]*data-tab="script"/);
});

test("history navigation back to home immediately revalidates recommendations", async () => {
  const workbench = createWorkbench();
  let recommendationCalls = 0;
  workbench.api.getHomeRecommendations = async (input) => {
    assert.equal(input.fresh, true);
    recommendationCalls += 1;
    return { background: null, categories: [] };
  };

  await restoreWorkbenchRouteFromLocationForTest(workbench, { pathname: "/", hash: "#home" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(workbench.ui.activeNavTab, "home");
  assert.equal(recommendationCalls, 1);
});

test("community hash route renders the shared community surface instead of the project gallery", async () => {
  const workbench = createWorkbench();
  workbench.ui.activeNavTab = "home";
  workbench.ui.projectPanelMode = "library";
  workbench.api = {
    getCommunityBoard: async () => ({
      posts: [{ id: "post-1", title: "分镜生成希望有等待原因", content: "希望告诉我为什么在排队", author: "灵曦体验官" }],
      features: [{ id: "feature-1", title: "批量生成角色三视图", content: "一次性生成正侧背", votes: 18, author: "创作者共创" }],
    }),
  };

  syncWorkbenchHashRouteForTest(workbench, "#community");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(workbench.ui.activeNavTab, "community");
  assert.match(workbench.root.innerHTML, /灵曦社区/);
  assert.match(workbench.root.innerHTML, /社区发布/);
  assert.doesNotMatch(workbench.root.innerHTML, /全部项目/);
});

test("media library hash route renders the personal material surface", async () => {
  const workbench = createWorkbench();
  workbench.ui.activeNavTab = "home";
  workbench.ui.projectPanelMode = "library";
  workbench.api = {
    getPersonalMediaLibrarySummary: async () => ({
      total: 2,
      imageCount: 1,
      videoCount: 1,
      imageBytes: 1024,
      videoBytes: 2048,
    }),
    getPersonalMediaLibrary: async () => ({
      data: [
        {
          id: "media-1",
          fileName: "角色定妆图.png",
          mediaKind: "image",
          previewUrl: "/uploads/mock-image.png",
          projectName: "项目 A",
          sourceAction: "upload",
          sizeBytes: 1024,
          createdAt: "2026-06-25T08:00:00.000Z",
          downloadUrl: "/uploads/mock-image.png",
        },
      ],
      meta: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
    }),
  };

  syncWorkbenchHashRouteForTest(workbench, "#media-library");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(workbench.ui.activeNavTab, "media-library");
  assert.match(workbench.root.innerHTML, /素材库/);
  assert.match(workbench.root.innerHTML, /角色定妆图\.png/);
  assert.doesNotMatch(workbench.root.innerHTML, /全部项目/);
});

test("account community feedback action opens the community surface in a new page", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const opened = [];
  globalThis.window = {
    location: { href: "http://localhost:5173/app.html#project" },
    open: (...args) => opened.push(args),
  };
  workbench.ui.activeNavTab = "project";

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-community-page" },
    });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }

  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0], ["http://localhost:5173/app.html#community", "_blank", "noopener"]);
  assert.equal(workbench.ui.activeNavTab, "project");
});

test("account material library action opens the personal media surface in a new page", async () => {
  const workbench = createWorkbench();
  const originalWindow = globalThis.window;
  const opened = [];
  globalThis.window = {
    location: { href: "http://localhost:5173/app.html#project" },
    open: (...args) => opened.push(args),
  };
  workbench.ui.activeNavTab = "project";

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-personal-media-page" },
    });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }

  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0], ["http://localhost:5173/app.html#media-library", "_blank", "noopener"]);
  assert.equal(workbench.ui.activeNavTab, "project");
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
        getUserScripts: async () => ({ scripts: [] }),
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
