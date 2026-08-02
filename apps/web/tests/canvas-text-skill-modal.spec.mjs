import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  normalizeCanvasTextSkills,
  renderCanvasTextSkillModal,
  resolveCanvasGenerationSkillCategories,
} from "../src/features/production-workbench/canvas-text-skill-modal.js";
import { renderCanvasGenerationSkillTrigger } from "../src/features/production-workbench/project-detail.js";

describe("canvas generation skill picker", () => {
  const officialSkills = [
    { id: "script-official", title: "官方转剧本", category: "script", priceCredits: 3, official: true },
    { id: "shot-official", title: "官方分镜", category: "shot", priceCredits: 5, official: true },
  ];
  const privateSkills = [
    { id: "script-private", title: "私人转剧本", category: "script", priceCredits: 0 },
    { id: "image-private", title: "私人画面风格", category: "image_style", priceCredits: 8 },
  ];

  it("renders independent source and category tabs while filtering the visible list", () => {
    const html = renderCanvasTextSkillModal({
      show: true,
      sourceTab: "official",
      activeCategory: "shot",
      officialSkills,
      privateSkills,
      draftSkillId: "shot-official",
    });

    assert.match(html, /data-action="set-canvas-text-skill-source" data-skill-source="official"/);
    assert.match(html, /data-action="set-canvas-text-skill-source" data-skill-source="private"/);
    assert.match(html, /data-action="set-canvas-text-skill-category" data-skill-category="script"/);
    assert.match(html, /data-action="set-canvas-text-skill-category" data-skill-category="shot"/);
    assert.match(html, /data-action="set-canvas-text-skill-category" data-skill-category="image_style"/);
    assert.match(html, /官方分镜/);
    assert.doesNotMatch(html, /官方转剧本/);
    assert.doesNotMatch(html, /私人画面风格/);
  });

  it("keeps one selected skill globally across all sources and categories", () => {
    const html = renderCanvasTextSkillModal({
      show: true,
      sourceTab: "private",
      activeCategory: "script",
      officialSkills,
      privateSkills,
      draftSkillId: "script-private",
    });

    assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
    assert.match(html, /data-skill-id="script-private"/);
    assert.match(html, /当前选择/);
    assert.match(html, /私人转剧本/);
    assert.match(html, /data-action="confirm-canvas-text-skill"/);
  });

  it("normalizes marketplace records without introducing category selections", () => {
    assert.deepEqual(normalizeCanvasTextSkills([
      { id: 7, name: "技能", promptCategory: "storyboard", price_credits: 2.6, coverImageUrl: "https://example.test/cover.png" },
    ], "private"), [{
      id: "7",
      title: "技能",
      summary: "",
      category: "storyboard",
      coverImageUrl: "https://example.test/cover.png",
      priceCredits: 3,
      source: "private",
      official: false,
    }]);
  });

  it("shows skill cover thumbnails and restricts image nodes to image categories", () => {
    const html = renderCanvasTextSkillModal({
      show: true,
      sourceTab: "official",
      activeCategory: "image_style",
      allowedCategories: resolveCanvasGenerationSkillCategories({ type: "ai-image", data: { mediaKind: "image" } }),
      officialSkills: [
        { id: "script", title: "转剧本", category: "script", official: true },
        { id: "style", title: "电影风格", category: "image_style", coverImageUrl: "https://example.test/style.jpg", official: true },
        { id: "board", title: "故事板", category: "storyboard", official: true },
        { id: "other", title: "其他", category: "other", official: true },
      ],
      officialPagination: { categoryCounts: { script: 9, image_style: 1, storyboard: 1, other: 1 } },
    });

    assert.match(html, /data-skill-category="image_style"/);
    assert.match(html, /data-skill-category="storyboard"/);
    assert.match(html, /data-skill-category="other"/);
    assert.doesNotMatch(html, /data-skill-category="script"/);
    assert.match(html, /<img src="https:\/\/example\.test\/style\.jpg" alt="" loading="lazy"/);
    assert.match(html, /官方技能<\/span><small>3<\/small>/);
  });
});

describe("canvas generation skill trigger", () => {
  it("renders for every node that owns a generation editor", () => {
    for (const type of ["ai-text", "ai-markdown", "ai-image", "ai-video", "ai-audio", "ai-animation", "ai-panorama", "ai-storyboard"]) {
      const html = renderCanvasGenerationSkillTrigger({ id: `${type}-1`, type, data: {} });
      assert.match(html, /data-action="open-canvas-text-skill-modal"/);
      assert.match(html, new RegExp(`data-node-id="${type}-1"`));
      assert.match(html, /选择生成技能/);
    }
  });

  it("shows exactly one selected marker and escapes the selected title", () => {
    const html = renderCanvasGenerationSkillTrigger({
      id: "image-1",
      type: "ai-image",
      data: { promptSkillId: "skill-1", promptSkillTitle: '光影<增强>"' },
    });

    assert.match(html, /canvas-editor-skill-trigger active/);
    assert.equal((html.match(/<small>1<\/small>/g) ?? []).length, 1);
    assert.match(html, /光影&lt;增强&gt;&quot;/);
  });

  it("shows the actual number of selected script workflow skills", () => {
    const html = renderCanvasGenerationSkillTrigger({
      id: "script-1",
      type: "script",
      data: { workflowSkillIds: { shot: "shot", prop_extract: "prop", character_extract: "character" } },
    });

    assert.match(html, /当前技能：已选择 3 项技能/);
    assert.match(html, /<small>3<\/small>/);
  });
  it("does not mark a script node active after all optional skills are cleared", () => {
    const html = renderCanvasGenerationSkillTrigger({
      id: "script-empty",
      type: "script",
      data: { workflowSkillIds: { shot: "", prop_extract: "", character_extract: "", scene_extract: "" } },
    });

    assert.doesNotMatch(html, /canvas-editor-skill-trigger active/);
    assert.doesNotMatch(html, /<small>/);
  });
  it("uses the existing themed controls for the new category tabs", async () => {
    const css = await readFile(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
    assert.match(css, /\.canvas-text-skill-category-tabs button\.active[\s\S]*var\(--theme-control-active-border\)/);
    assert.match(css, /\.canvas-text-skill-category-tabs[\s\S]*overflow-x:\s*auto/);
  });

  it("keeps the skill list on a fixed grid track with or without pagination", async () => {
    const css = await readFile(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
    const singlePageHtml = renderCanvasTextSkillModal({
      show: true,
      officialSkills: [{ id: "style-1", title: "电影风格", category: "image_style", official: true }],
      officialPagination: { page: 1, totalPages: 1 },
    });
    const pagedHtml = renderCanvasTextSkillModal({
      show: true,
      officialSkills: [{ id: "style-1", title: "电影风格", category: "image_style", official: true }],
      officialPagination: { page: 1, totalPages: 2 },
    });

    assert.doesNotMatch(singlePageHtml, /aria-label="技能分页"/);
    assert.match(pagedHtml, /aria-label="技能分页"/);
    assert.match(css, /\.canvas-text-skill-modal\s*\{[\s\S]*?grid-template-rows:\s*auto auto auto minmax\(0, 1fr\) 2\.8rem auto/);
    assert.match(css, /\.canvas-text-skill-list\s*\{[\s\S]*?grid-row:\s*4/);
    assert.match(css, /\.canvas-text-skill-pagination\s*\{[\s\S]*?grid-row:\s*5/);
    assert.match(css, /\.canvas-text-skill-footer\s*\{[\s\S]*?grid-row:\s*6/);
  });
});
