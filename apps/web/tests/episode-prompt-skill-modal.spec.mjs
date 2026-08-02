import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  renderEpisodePromptSkillModal,
  sumEpisodePromptSkillCredits,
} from "../src/features/production-workbench/episode-prompt-skill-modal.js";

describe("episode prompt skill modal", () => {
  it("renders independent source tabs and all five workflow categories", () => {
    const html = renderEpisodePromptSkillModal({
      show: true,
      sourceTab: "private",
      activeCategory: "script",
      officialSkills: [
        { id: "official-shot", title: "官方分镜", category: "shot", priceCredits: 6 },
      ],
      privateSkills: [
        { id: "private-script", title: "私人转剧本", category: "script", priceCredits: 12 },
      ],
      draftSelections: { script: "private-script", shot: "official-shot" },
    });

    assert.match(html, /episode-skill-picker-modal/);
    assert.match(html, /官方技能/);
    assert.match(html, /私人技能库/);
    assert.match(html, /转剧本提示词/);
    assert.match(html, /分镜提示词/);
    assert.match(html, /道具抽取提示词/);
    assert.match(html, /人物抽取提示词/);
    assert.match(html, /场景抽取提示词/);
    assert.match(html, /私人转剧本/);
    assert.match(html, /episode-selected-skills/);
    assert.match(html, /已选技能/);
    assert.match(html, /官方分镜/);
    assert.match(html, /data-episode-selected-category="scene_extract"/);
    assert.doesNotMatch(html, /selection-picker-modal/);
  });

  it("sums only skills used by the selected generation path", () => {
    const skills = [
      { id: "script", category: "script", priceCredits: 12 },
      { id: "shot", category: "shot", priceCredits: 6 },
      { id: "scene", category: "scene_extract", priceCredits: 4 },
    ];
    const selected = { script: "script", shot: "shot", scene_extract: "scene" };

    assert.equal(sumEpisodePromptSkillCredits(skills, selected), 22);
    assert.equal(sumEpisodePromptSkillCredits(skills, selected, ["script"]), 10);
  });

  it("counts each selected category once and supports the script node's four shared categories", () => {
    const categories = [
      { id: "shot", label: "分镜提示词", shortLabel: "分镜" },
      { id: "prop_extract", label: "道具抽取提示词", shortLabel: "道具" },
      { id: "character_extract", label: "人物抽取提示词", shortLabel: "人物" },
      { id: "scene_extract", label: "场景抽取提示词", shortLabel: "场景" },
    ];
    const selected = { shot: "shared-shot", prop_extract: "prop", character_extract: "character", scene_extract: "scene" };
    const html = renderEpisodePromptSkillModal({
      show: true,
      activeCategory: "shot",
      categories,
      officialSkills: [
        { id: "shared-shot", title: "官方分镜", category: "shot", priceCredits: 1 },
        { id: "prop", title: "官方道具", category: "prop_extract", priceCredits: 2 },
        { id: "character", title: "官方人物", category: "character_extract", priceCredits: 3 },
        { id: "scene", title: "官方场景", category: "scene_extract", priceCredits: 4 },
      ],
      privateSkills: [{ id: "shared-shot", title: "同 ID 私人分镜", category: "shot", priceCredits: 9 }],
      draftSelections: selected,
    });

    assert.match(html, /已选 4 项/);
    assert.match(html, />4\/4</);
    assert.doesNotMatch(html, /转剧本提示词/);
  });
  it("uses the available category totals and paginates the current category", () => {
    const html = renderEpisodePromptSkillModal({
      show: true,
      activeCategory: "shot",
      categories: [{ id: "shot", label: "分镜提示词", shortLabel: "分镜" }],
      officialSkills: [{ id: "shot-1", title: "分镜一", category: "shot" }],
      privateSkills: [{ id: "shot-private", title: "私人分镜", category: "shot" }],
      officialPagination: { page: 2, total: 12, totalPages: 2, categoryCounts: { script: 30, shot: 12 } },
      privatePagination: { page: 1, total: 3, totalPages: 1, categoryCounts: { script: 8, shot: 3 } },
      actions: { page: "set-canvas-text-skill-page" },
    });

    assert.match(html, /官方技能<\/span><small>12<\/small>/);
    assert.match(html, /私人技能库<\/span><small>3<\/small>/);
    assert.match(html, /第 2 \/ 2 页/);
    assert.match(html, /data-action="set-canvas-text-skill-page" data-skill-page="1"/);
    assert.doesNotMatch(html, /官方技能<\/span><small>42<\/small>/);
  });
  it("uses workbench theme variables for active and selected states", async () => {
    const css = await readFile(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");

    assert.match(css, /\.episode-skill-item\.active[\s\S]*var\(--theme-control-active-border\)/);
    assert.match(css, /\.episode-skill-picker-confirm[\s\S]*var\(--theme-accent-gradient\)/);
    assert.match(css, /\.episode-selected-skill-mark[\s\S]*var\(--theme-accent-soft\)/);
    assert.match(css, /\.episode-selected-skill-price[\s\S]*var\(--theme-accent-icon\)/);
  });
});
