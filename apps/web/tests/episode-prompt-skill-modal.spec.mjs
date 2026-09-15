import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  renderEpisodePromptSkillControl,
  renderEpisodePromptSkillModal,
  resolvePlazaSkillWorkflowStages,
  sumEpisodePromptSkillCredits,
} from "../src/features/production-workbench/episode-prompt-skill-modal.js";

describe("episode prompt skill modal", () => {
  it("renders plaza skill picker labels and catalog for the episode create modal", () => {
    const html = renderEpisodePromptSkillModal({
      show: true,
      variant: "plaza",
      sourceTab: "official",
      officialSkills: [
        { id: "plaza-official", title: "官方短剧 Skill", category: "short-drama", summary: "一键转分镜", slug: "short-drama-skill" },
      ],
      mineSkills: [
        { id: "plaza-mine", title: "我的短剧 Skill", category: "short-drama" },
      ],
      draftPlazaSkillIds: ["plaza-official"],
    });
    const control = renderEpisodePromptSkillControl({
      variant: "plaza",
      skills: [{ id: "plaza-official", title: "官方短剧 Skill", category: "short-drama" }],
      selectedPlazaSkillIds: ["plaza-official"],
    });

    assert.match(control, />Skill</);
    assert.match(control, /plaza-skill-chip/);
    assert.match(control, /官方短剧 Skill/);
    assert.match(control, /data-action="remove-episode-plaza-skill"/);
    assert.match(html, /plaza-skill-picker-modal/);
    assert.match(html, />Skill</);
    assert.match(html, />通用</);
    assert.match(html, />收藏</);
    assert.match(html, />我的</);
    assert.match(html, /搜索 Skill/);
    assert.match(html, /官方短剧 Skill/);
    assert.match(html, /\/short-drama-skill/);
    assert.match(html, /查看全部 Skill/);
    assert.match(html, /data-episode-skill-variant="plaza"/);
    assert.doesNotMatch(html, /转剧本提示词/);
  });

  it("hides non-workflow plaza skills when the picker is filtered to project-workflow", () => {
    const html = renderEpisodePromptSkillModal({
      show: true,
      variant: "plaza",
      sourceTab: "official",
      categoryFilter: "project-workflow",
      officialSkills: [
        { id: "plaza-workflow", title: "项目工作流 Skill", category: "project-workflow", summary: "一键转分镜", slug: "project-workflow-skill" },
        { id: "plaza-short-drama", title: "官方短剧 Skill", category: "short-drama", summary: "短剧改编" },
      ],
      mineSkills: [
        { id: "plaza-mine-workflow", title: "我的工作流 Skill", category: "project-workflow" },
        { id: "plaza-mine-general", title: "我的通用 Skill", category: "general" },
      ],
      draftPlazaSkillIds: ["plaza-workflow", "plaza-short-drama"],
    });

    assert.match(html, /项目工作流 Skill/);
    assert.match(html, /\/project-workflow-skill/);
    assert.doesNotMatch(html, /官方短剧 Skill/);
    assert.doesNotMatch(html, /我的通用 Skill/);
    assert.match(html, /已选 1 项/);
  });

  it("keeps the plaza skill picker on the same chrome layer as the text model control", async () => {
    const empty = renderEpisodePromptSkillControl({
      variant: "plaza",
      skills: [],
      selectedPlazaSkillIds: [],
    });
    const css = await readFile(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
    const emptyAddBlock = css.match(
      /\.single-episode-skill-controls \.plaza-skill-chip-row\.is-empty \.plaza-skill-chip-add\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body ?? "";
    const skillControlsBlock = css.match(
      /\.single-episode-skill-controls\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body ?? "";

    assert.match(empty, /<div class="single-episode-look-label"><span>Skill<\/span><\/div>/);
    assert.match(empty, /plaza-skill-chip-row is-empty/);
    assert.match(empty, />请选择 Skill</);
    assert.match(skillControlsBlock, /grid-template-columns:\s*minmax\(10\.5rem,\s*11\.5rem\)\s+minmax\(10\.5rem,\s*11\.5rem\)/);
    assert.match(skillControlsBlock, /width:\s*auto/);
    assert.match(emptyAddBlock, /width:\s*100%/);
    assert.match(emptyAddBlock, /min-height:\s*2\.25rem/);
    assert.match(emptyAddBlock, /border-radius:\s*0\.5rem/);
  });

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
  it("resolves plaza skill stages from the selected skill instead of the comic pipeline", () => {
    assert.deepEqual(resolvePlazaSkillWorkflowStages([{
      title: "漫画角色一致性",
      summary: "保持角色三视图一致",
      outputContent: "角色提示词",
    }], { skipScriptStage: true }), ["character"]);
    assert.deepEqual(resolvePlazaSkillWorkflowStages([{
      title: "通用小说一键转分镜提取",
      summary: "一键生成工作流",
      outputContent: "场景、角色、道具和分镜表",
    }], { skipScriptStage: true }), ["scene", "character", "prop", "shot"]);
  });

  it("uses workbench theme variables for active and selected states", async () => {
    const css = await readFile(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");

    assert.match(css, /\.episode-skill-item\.active[\s\S]*var\(--theme-control-active-border\)/);
    assert.match(css, /\.episode-skill-picker-confirm[\s\S]*var\(--theme-accent-gradient\)/);
    assert.match(css, /\.episode-selected-skill-mark[\s\S]*var\(--theme-accent-soft\)/);
    assert.match(css, /\.episode-selected-skill-price[\s\S]*var\(--theme-accent-icon\)/);
  });
});
