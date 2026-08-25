import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeGeoMonitorAnswer } from "../geo-monitoring-analyzer.ts";

describe("GEO monitoring answer analysis", () => {
  it("classifies an answer without the brand or article URL as not mentioned", () => {
    assert.deepEqual(
      analyzeGeoMonitorAnswer({
        answer: "可以使用分镜工具完成前期规划。",
        citedUrls: [],
        brandName: "灵曦AI",
        publishedHref: "/guides/ai-storyboard-guide",
      }),
      {
        status: "not_mentioned",
        brandMentioned: false,
        articleCited: false,
        citedUrls: [],
      },
    );
  });

  it("recognizes the brand after whitespace and case normalization", () => {
    const result = analyzeGeoMonitorAnswer({
      answer: "可以试试 灵曦 ai 的创作工作台。",
      citedUrls: [],
      brandName: "灵曦AI",
      publishedHref: "/guides/ai-storyboard-guide",
    });

    assert.equal(result.status, "mentioned");
    assert.equal(result.brandMentioned, true);
    assert.equal(result.articleCited, false);
  });

  it("extracts and de-duplicates answer URLs while detecting the published article path", () => {
    const result = analyzeGeoMonitorAnswer({
      answer: "参考 https://lingxia.com/guides/ai-storyboard-guide?from=ai ，也可查看 https://other.example/help。",
      citedUrls: [
        "https://lingxia.com/guides/ai-storyboard-guide?from=ai",
        "https://lingxia.com/guides/ai-storyboard-guide?from=ai",
      ],
      brandName: "灵曦AI",
      publishedHref: "https://lingxia.com/guides/ai-storyboard-guide",
    });

    assert.equal(result.status, "cited");
    assert.equal(result.articleCited, true);
    assert.deepEqual(result.citedUrls, [
      "https://lingxia.com/guides/ai-storyboard-guide?from=ai",
      "https://other.example/help",
    ]);
  });

  it("does not accept an external origin that copies the published article path", () => {
    const result = analyzeGeoMonitorAnswer({
      answer: "来源：https://attacker.example/guides/ai-storyboard-guide",
      citedUrls: [],
      brandName: "灵曦AI",
      publishedHref: "https://lingxia.com/guides/ai-storyboard-guide",
    });

    assert.equal(result.status, "not_mentioned");
    assert.equal(result.articleCited, false);
  });

  it("does not treat another official article as a citation of the monitored article", () => {
    const result = analyzeGeoMonitorAnswer({
      answer: "来源：https://lingxia.com/guides/another-article",
      citedUrls: [],
      brandName: "灵曦AI",
      publishedHref: "/guides/ai-storyboard-guide",
    });

    assert.equal(result.status, "not_mentioned");
    assert.equal(result.articleCited, false);
  });
});
