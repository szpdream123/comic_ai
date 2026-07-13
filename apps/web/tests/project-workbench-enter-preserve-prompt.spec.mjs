import assert from "node:assert/strict";
import { test } from "node:test";

import {
  handleWorkbenchActionForTest,
  mapEpisodeStoryboardContractForTest,
} from "../src/features/production-workbench/index.js";
import { createStoryboardList } from "../src/features/production-workbench/storyboard-state.js";

function buildProjectState() {
  return {
    project: {
      id: "project-1",
      name: "try",
      phase: "asset_review",
      aspectRatio: "9:16",
      resolution: "1080p",
    },
    projectDetail: {
      project: { id: "project-1", projectId: "project-1", name: "try" },
      episodes: [{ id: "episode-1", episodeId: "episode-1", title: "第 1 集", sequence: 1, status: "draft" }],
      assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      shots: [],
    },
    assetReview: { readyForGeneration: false },
    assetCandidates: {
      characters: [],
      scenes: [],
      props: [],
    },
    calibration: null,
    shots: [],
    exportPreview: null,
  };
}

function buildProjectUi(overrides = {}) {
  const state = buildProjectState();
  const storyboards = createStoryboardList(state);
  return {
    activeNavTab: "project",
    storyboards,
    selectedStoryboard: storyboards[0] ?? null,
    selectedModelId: "vidu-q3-pro",
    prompt: "",
    busy: false,
    projectPanelMode: "detail",
    projectInteriorSection: "episodes",
    projectLibrary: [],
    validationMessage: "",
    toast: "",
    selectedProjectCardId: "project-1",
    episodeStoryboardMap: {},
    importedAssets: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
    ...overrides,
  };
}

test("entering episode workbench keeps the fuller locally hydrated video prompt when storyboard reload only returns backend summary text", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hash: "#project" } };
  const fullVideoPrompt = "【分镜1】\n【镜头列表】\n【镜头1】0-3秒 中景固定镜头，任小野递出饭食。";
  const localStoryboard = mapEpisodeStoryboardContractForTest({
    id: "shot-1",
    linkedShotId: "shot-1",
    episodeId: "episode-1",
    indexNo: 1,
    title: "分镜 1",
    description: fullVideoPrompt,
    sceneAnalysis: "任小野递出饭食",
    plotPreview: "麻烦您了",
    chapterImagePrompt: "静态图片提示词",
    imagePrompt: "静态图片提示词",
    chapterVideoPrompt: fullVideoPrompt,
    videoPrompt: fullVideoPrompt,
    generationDrafts: [
      {
        mode: "video",
        prompt: fullVideoPrompt,
        payload: { source: "commit_hydrate" },
        updatedAt: null,
      },
    ],
  });
  const workbench = {
    state: buildProjectState(),
    session: { user: { phone: "+86 13800138000" } },
    api: {
      async getEpisodeWorkbench() {
        return {
          data: {
            episode: { id: "episode-1", episodeId: "episode-1", projectId: "project-1", title: "第 1 集" },
            project: { id: "project-1", projectId: "project-1" },
            assetsByType: { character: [], scene: [], prop: [] },
          },
        };
      },
      async listGenerationConfig() {
        return { uploadLimits: {}, models: [] };
      },
      async listStoryboards() {
        return {
          items: [
            {
              id: "shot-1",
              shotId: "shot-1",
              episodeId: "episode-1",
              sortOrder: 1,
              title: "分镜 1",
              description: "后端摘要",
            },
          ],
        };
      },
      async getStoryboardConversationHistory() {
        return { entries: [] };
      },
      async listGenerationTasks() {
        return { items: [] };
      },
    },
    ui: buildProjectUi({
      selectedEpisodeId: "episode-1",
      episodeStoryboardMap: {
        "episode-1": [localStoryboard],
      },
      episodeWorkbenchContextLoadedEpisodeId: "episode-1",
      episodeWorkbenchContext: {
        data: {
          episode: { id: "episode-1", episodeId: "episode-1", projectId: "project-1", title: "第 1 集" },
          project: { id: "project-1", projectId: "project-1" },
          assetsByType: { character: [], scene: [], prop: [] },
        },
      },
    }),
    root: {
      innerHTML: "",
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-episode-workbench", episodeId: "episode-1" },
    });
  } finally {
    globalThis.window = previousWindow;
  }

  const storyboard = workbench.ui.episodeStoryboardMap["episode-1"]?.[0];
  assert.equal(storyboard?.description, fullVideoPrompt);
  assert.equal(storyboard?.generationState?.videoPrompt, fullVideoPrompt);
  assert.equal(storyboard?.videoPromptDraft?.prompt, fullVideoPrompt);
});
