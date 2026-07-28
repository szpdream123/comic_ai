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

  it("uses workbench theme variables for active and selected states", async () => {
    const css = await readFile(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");

    assert.match(css, /\.episode-skill-item\.active[\s\S]*var\(--theme-control-active-border\)/);
    assert.match(css, /\.episode-skill-picker-confirm[\s\S]*var\(--theme-accent-gradient\)/);
    assert.match(css, /\.episode-selected-skill-mark[\s\S]*var\(--theme-accent-soft\)/);
    assert.match(css, /\.episode-selected-skill-price[\s\S]*var\(--theme-accent-icon\)/);
  });
});
