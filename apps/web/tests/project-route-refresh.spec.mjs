import assert from "node:assert/strict";
import { test } from "node:test";

import { initProductionWorkbench } from "../src/features/production-workbench/index.js";

test("refresh keeps the deep-linked project panel instead of defaulting to another project", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let requestedProjectId = null;
  const root = {
    innerHTML: "",
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  globalThis.window = {
    location: {
      protocol: "http:",
      host: "127.0.0.1:4173",
      port: "4173",
      origin: "http://127.0.0.1:4173",
      hash: "#/projects/project-2",
      pathname: "/app.html",
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    addEventListener() {},
    setInterval() {
      return 1;
    },
  };
  globalThis.document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
    body: {
      appendChild() {},
    },
    createElement() {
      return {
        click() {},
        remove() {},
      };
    },
  };

  try {
    await initProductionWorkbench({
      root,
      session: { user: { phone: "+86 13800138000" } },
      onLogout() {},
      api: {
        async getCreatorState() {
          return {
            project: { id: "project-1", name: "默认项目", phase: "asset_review", aspectRatio: "9:16" },
            assetReview: { readyForGeneration: false },
            assetCandidates: { characters: [], scenes: [], props: [] },
            calibration: null,
            shots: [],
          };
        },
        async getProjectDetailV2(projectId) {
          requestedProjectId = projectId;
          return {
            project: { id: projectId, projectId, name: projectId === "project-2" ? "目标项目" : "其他项目" },
            episodes: [],
            assetsByType: {
              character: [],
              scene: [],
              prop: [],
              other: { image: [], video: [] },
            },
            shots: [],
          };
        },
        async getProjectMembers() {
          return { members: [] };
        },
        async getProjectStats() {
          return { stats: null };
        },
        async getProjects() {
          return {
            projects: [
              { id: "project-1", name: "默认项目", createdAt: "2026-05-30T08:00:00.000Z" },
              { id: "project-2", name: "目标项目", createdAt: "2026-05-31T08:00:00.000Z" },
            ],
          };
        },
        async getAssetLibrary() {
          return { assets: [] };
        },
        async getExportHistory() {
          return { records: [] };
        },
        async getSession() {
          return { user: { phone: "+86 13800138000", availableCredits: 0 } };
        },
        async getProjectStyles() {
          return { data: [] };
        },
        async getStoryboardPromptPackages() {
          return { data: [] };
        },
        async getUserScripts() {
          return { scripts: [] };
        },
        async getCanvasProjects() {
          return { projects: [] };
        },
      },
    });

    assert.equal(requestedProjectId, "project-2");
    assert.match(root.innerHTML, /目标项目/);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test("refresh keeps the deep-linked project episode section instead of defaulting to overview", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let requestedProjectId = null;
  const renders = [];
  const root = {
    _innerHTML: "",
    set innerHTML(value) {
      this._innerHTML = String(value ?? "");
      renders.push(this._innerHTML);
    },
    get innerHTML() {
      return this._innerHTML;
    },
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  globalThis.window = {
    location: {
      protocol: "http:",
      host: "127.0.0.1:4173",
      port: "4173",
      origin: "http://127.0.0.1:4173",
      hash: "#/projects/project-2/episodes",
      pathname: "/app.html",
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    addEventListener() {},
    setInterval() {
      return 1;
    },
  };
  globalThis.document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
    body: {
      appendChild() {},
    },
    createElement() {
      return {
        click() {},
        remove() {},
      };
    },
  };

  try {
    await initProductionWorkbench({
      root,
      session: { user: { phone: "+86 13800138000" } },
      onLogout() {},
      api: {
        async getCreatorState() {
          return {
            project: { id: "project-1", name: "默认项目", phase: "asset_review", aspectRatio: "9:16" },
            assetReview: { readyForGeneration: false },
            assetCandidates: { characters: [], scenes: [], props: [] },
            calibration: null,
            shots: [],
          };
        },
        async getProjectDetailV2(projectId) {
          requestedProjectId = projectId;
          return {
            project: { id: projectId, projectId, name: projectId === "project-2" ? "目标项目" : "其他项目" },
            episodes: [
              { id: "episode-1", title: "目标剧集", storyboardCount: 3, createdAt: "2026-06-01T08:00:00.000Z" },
            ],
            assetsByType: {
              character: [],
              scene: [],
              prop: [],
              other: { image: [], video: [] },
            },
            shots: [],
          };
        },
        async getProjectMembers() {
          return { members: [] };
        },
        async getProjectStats() {
          return { stats: null };
        },
        async getProjects() {
          return {
            projects: [
              { id: "project-1", name: "默认项目", createdAt: "2026-05-30T08:00:00.000Z" },
              { id: "project-2", name: "目标项目", createdAt: "2026-05-31T08:00:00.000Z" },
            ],
          };
        },
        async getAssetLibrary() {
          return { assets: [] };
        },
        async getExportHistory() {
          return { records: [] };
        },
        async getSession() {
          return { user: { phone: "+86 13800138000", availableCredits: 0 } };
        },
        async getProjectStyles() {
          return { data: [] };
        },
        async getStoryboardPromptPackages() {
          return { data: [] };
        },
        async getUserScripts() {
          return { scripts: [] };
        },
        async getCanvasProjects() {
          return { projects: [] };
        },
      },
    });

    assert.equal(requestedProjectId, "project-2");
    const firstOverviewTab = renders[0].match(/<button[\s\S]*?data-section="overview"[\s\S]*?<\/button>/)?.[0] ?? "";
    const firstEpisodeTab = renders[0].match(/<button[\s\S]*?data-section="episodes"[\s\S]*?<\/button>/)?.[0] ?? "";
    assert.match(firstEpisodeTab, /class="interior-nav-item active"/);
    assert.doesNotMatch(firstOverviewTab, /class="interior-nav-item active"/);
    assert.match(root.innerHTML, /目标剧集/);
    assert.doesNotMatch(root.innerHTML, /project-overview-brief__title/);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
