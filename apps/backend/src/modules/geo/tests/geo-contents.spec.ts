import assert from "node:assert/strict";
import { it } from "node:test";
import { renderGeoArticle } from "../geo-public-renderer.ts";
import type { GeoDocument } from "../geo-types.ts";

function render(blocks: GeoDocument["blocks"]) {
  return renderGeoArticle({template:"{{GEO_HEAD}}{{GEO_CONTENT}}",canonicalUrl:"https://www.lingxiyunai.com/guides/example",brandName:"灵曦AI",contentType:"guide",authorName:"内容团队",publishedAt:"2026-09-09",updatedAt:"2026-09-09",evidence:[],related:[],document:{title:"标题",summary:"摘要",directAnswer:"直接回答",blocks,faq:[],socialDrafts:{zhihu:"",xiaohongshu:"",bilibili:"",wechat:""},seo:{title:"标题",description:"摘要"}}});
}
it("links a long article to its actual unique heading anchors and escapes heading text", () => {
  const html=render([{type:"heading",level:2,text:"准备"},{type:"paragraph",text:"正文",evidenceIds:[]},{type:"heading",level:2,text:"准备"},{type:"heading",level:3,text:"子标题"},{type:"heading",level:2,text:"<script>"}]);
  const links=[...html.matchAll(/href="#(geo-heading-[^"]+)"/g)].map(m=>m[1]);
  assert.equal(links.length,3);assert.equal(new Set(links).size,3);
  for(const id of links)assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('&lt;script&gt;'));assert.doesNotMatch(html,/<script><\/a>/);
});
it("omits the contents panel for a short article", () => {
  assert.doesNotMatch(render([{type:"heading",level:2,text:"准备"}]),/aria-label="文章目录"/);
});
