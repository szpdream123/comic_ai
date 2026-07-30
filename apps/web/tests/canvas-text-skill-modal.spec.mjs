import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  normalizeCanvasTextSkills,
  renderCanvasTextSkillModal,
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
      { id: 7, name: "技能", promptCategory: "storyboard", price_credits: 2.6 },
    ], "private"), [{
      id: "7",
      title: "技能",
      summary: "",
      category: "storyboard",
      priceCredits: 3,
      source: "private",
      official: false,
    }]);
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

  it("uses the existing themed controls for the new category tabs", async () => {
    const css = await readFile(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
    assert.match(css, /\.canvas-text-skill-category-tabs button\.active[\s\S]*var\(--theme-control-active-border\)/);
    assert.match(css, /\.canvas-text-skill-category-tabs[\s\S]*overflow-x:\s*auto/);
  });
});
