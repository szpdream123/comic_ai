import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { renderGeoArticle, renderGeoListing } from "../geo-public-renderer.ts";
import { validateGeoDraft } from "../geo-content-validator.ts";
import type { GeoDocument } from "../geo-types.ts";

const template = readFileSync(new URL("../../../../../web/geo-public.html", import.meta.url), "utf8");
const document: GeoDocument = {
  title: "人物参考资料整理", summary: "整理人物与分镜的参考资料。", directAnswer: "先核对人物设定，再检查分镜记录。",
  blocks: [{ type: "paragraph", text: "按镜头核对角色服装。", evidenceIds: [] }],
  faq: [], socialDrafts: { zhihu: "", xiaohongshu: "", bilibili: "", wechat: "" },
  seo: { title: "人物参考资料整理 | 灵曦AI", description: "整理人物与分镜的参考资料。" },
};
function article(path: string, robots?: string) {
  return renderGeoArticle({ template, document, canonicalUrl: `https://www.lingxiyunai.com${path}`,
    brandName: "灵曦AI", contentType: path.startsWith("/cases/") ? "case" : "guide",
    publishedAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z",
    authorName: "灵曦AI内容团队", evidence: [], related: [], robots });
}

it("emits one robots directive with the real template for public, preview and empty listing pages", () => {
  const pages = [
    [article("/guides/example"), "index,follow,max-image-preview:large"],
    [article("/guides/example", "noindex,nofollow"), "noindex,nofollow"],
    [renderGeoListing({ template, canonicalUrl: "https://www.lingxiyunai.com/reports", brandName: "灵曦AI",
      title: "观察报告", description: "报告列表", items: [] }), "noindex,follow"],
  ];
  for (const [html, value] of pages) {
    assert.equal((html!.match(/<meta name="robots"/g) ?? []).length, 1);
    assert.ok(html!.includes(`name="robots" content="${value}"`));
  }
});

it("connects relevant guides and the case to actual downloadable templates without unrelated downloads", () => {
  const paths = ["/guides/ai-character-consistency", "/guides/ai-short-drama-dialogue-storyboard/",
    "/guides/ai-short-drama-asset-management", "/cases/cafe-dialogue-reference-workflow"];
  for (const [index, path] of paths.entries()) {
    const html = article(path);
    const downloads = [...html.matchAll(/href="(\/geo-resources\/[^"]+\.csv)" download/g)];
    assert.equal(downloads.length, index === 3 ? 3 : 1);
    for (const [, href] of downloads) {
      const file = readFileSync(new URL(`../../../../../web${href}`, import.meta.url));
      assert.deepEqual([...file.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    }
    assert.match(html, /href="\/geo-resources\/index.html"/);
  }
  assert.doesNotMatch(article("/guides/unrelated"), / download>/);
});

it("warns for generic image labels while preserving missing-alt blockers and meaningful labels", () => {
  for (const alt of ["image", "IMG_001.png", "截图", "角色侧面参考图", ""]) {
    const report = validateGeoDraft({ document: { ...document, blocks: [
      { type: "image", src: "/geo-assets/32000000-0000-4000-8000-000000000001", alt, caption: "人物参考图。", evidenceIds: [] },
    ] }, evidence: [] });
    assert.equal(report.warnings.some((issue) => issue.code === "image_alt_generic"), ["image", "IMG_001.png", "截图"].includes(alt));
    assert.equal(report.blockers.some((issue) => issue.code === "image_alt_missing"), alt === "");
  }
});
