import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleWorkbenchActionForTest } from "../src/features/production-workbench/index.js";

describe("storyboard prompt skill picker", () => {
  it("loads the storyboard category only and saves one storyboard selection", async () => {
    const workbench = createWorkbench();

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-storyboard-prompt-skill-modal" },
    });

    assert.equal(workbench.ui.storyboardPromptSkillModalOpen, true);
    assert.equal(workbench.ui.episodePromptSkillModalOpen, false);
    assert.deepEqual(workbench.marketplaceRequests, [{ category: "storyboard", page: 1, pageSize: 100 }]);
    const start = workbench.root.innerHTML.indexOf('data-selection-picker-id="storyboard-prompt-skill-picker"');
    assert.ok(start >= 0);
    const modal = workbench.root.innerHTML.slice(start, start + 12000);
    assert.match(modal, /选择故事板提示词/);
    assert.match(modal, /玄幻热血短剧/);
    assert.match(modal, /api\/storage\/objects\/storyboard-cover-storage\/content/);
    assert.match(modal, /<img src="\/api\/storage\/objects\/storyboard-cover-storage\/content\?proxy=1"/);
    assert.doesNotMatch(modal, /selection-picker-item-icon/);
    assert.doesNotMatch(modal, /不应出现的剧本提示词/);
    assert.doesNotMatch(modal, /不应出现的分镜提示词/);
    assert.doesNotMatch(modal, /episode-skill-picker/);

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "select-storyboard-prompt-skill-draft", pickerItemId: "storyboard-2" },
    });
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "confirm-storyboard-prompt-skill" },
    });

    assert.equal(workbench.ui.selectedStoryboardPromptSkillId, "storyboard-2");
    assert.equal(workbench.ui.storyboardPromptSkillModalOpen, false);
  });
});

function createWorkbench() {
  const marketplaceRequests = [];
  return {
    marketplaceRequests,
    state: { project: { id: "project-1", name: "测试项目", aspectRatio: "9:16" }, episodes: [], storyboards: [] },
    session: { user: { phone: "+8613800138000" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "episode-workbench",
      assetGeneratorTarget: "storyboard",
      assetGeneratorModal: "storyboard",
      assetGeneratorMode: "generate",
      assetGeneratorName: "分镜 1",
      assetGeneratorPrompt: "故事板内容",
      selectedEpisodePromptSkillIds: {},
      storyboardPromptOfficialSkills: [],
      storyboardPromptPrivateSkills: [],
      selectedStoryboardPromptSkillId: "storyboard-1",
      episodePromptSkillModalOpen: false,
      episodePromptSkillDraftIds: {},
      storyboardPromptSkillModalOpen: false,
      storyboardPromptSkillDraftId: "",
      projectStyles: [],
    },
    api: {
      async getPromptMarketplace(input) {
        marketplaceRequests.push(input);
        return {
          items: [
            { id: "storyboard-1", title: "玄幻热血短剧", summary: "仅用于故事板", category: "storyboard", priceCredits: 11, official: true, cover_storage_object_id: "storyboard-cover-storage" },
            { id: "script-1", title: "不应出现的剧本提示词", category: "script", priceCredits: 9, official: true },
            { id: "shot-1", title: "不应出现的分镜提示词", category: "shot", priceCredits: 9, official: true },
          ],
        };
      },
      async getPromptMarketplaceLibrary() {
        return {
          items: [{ id: "storyboard-2", title: "私人故事板提示词", summary: "私人", category: "storyboard", priceCredits: 12 }],
        };
      },
    },
    root: {
      innerHTML: "",
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
  };
}
