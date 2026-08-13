import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateGeoDraft } from "../geo-content-validator.ts";
import { renderGeoArticle } from "../geo-public-renderer.ts";
import type { GeoDocument, GeoEvidenceSnapshot } from "../geo-types.ts";

const evidence: GeoEvidenceSnapshot = {
  id: "e-1",
  name: "角色素材管理功能",
  factText: "灵曦AI支持统一管理角色参考素材。",
  sourceUrl: "https://example.com/product",
  reviewStatus: "approved",
  publicUseAllowed: true,
  validUntil: "2027-08-13T00:00:00.000Z",
};

const validDocument: GeoDocument = {
  title: "AI短剧如何保持角色一致性",
  summary: "从角色资料、参考图和分镜约束三个环节减少角色漂移。",
  directAnswer: "先固定角色资料，再让每个分镜引用同一组已确认素材。",
  blocks: [
    { type: "paragraph", text: "灵曦AI可统一管理角色参考素材。", evidenceIds: ["e-1"] },
  ],
  faq: [{ question: "需要几张参考图？", answer: "按角色和镜头需要准备，并以实测结果为准。" }],
  socialDrafts: { zhihu: "", xiaohongshu: "", bilibili: "", wechat: "" },
  seo: { title: "AI短剧角色一致性方法 | 灵曦AI", description: "角色一致性操作方法" },
};

describe("GEO controlled content", () => {
  it("accepts a supported 灵曦AI document", () => {
    const report = validateGeoDraft({ document: validDocument, evidence: [evidence], now: new Date("2026-08-13T00:00:00.000Z") });
    assert.deepEqual(report.blockers, []);
  });

  it("blocks legacy branding, unsupported numbers, unsafe URLs, and invalid evidence", () => {
    const legacy = validateGeoDraft({
      document: { ...validDocument, title: "灵曦剧场教程" },
      evidence: [evidence],
    });
    assert.ok(legacy.blockers.some((item) => item.code === "legacy_brand_forbidden"));

    const numeric = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "paragraph", text: "效率提升80%且仅需10分钟。", evidenceIds: [] }],
      },
      evidence: [],
    });
    assert.ok(numeric.blockers.some((item) => item.code === "numeric_claim_without_evidence"));

    const unsafe = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "cta", title: "试用", body: "立即体验", href: "javascript:alert(1)", label: "打开" }],
      },
      evidence: [evidence],
    });
    assert.ok(unsafe.blockers.some((item) => item.code === "unsafe_url"));

    const expired = validateGeoDraft({
      document: validDocument,
      evidence: [{ ...evidence, validUntil: "2025-01-01T00:00:00.000Z" }],
      now: new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.ok(expired.blockers.some((item) => item.code === "invalid_evidence"));
  });

  it("warns about duplicate content and blocks sensitive values", () => {
    const report = validateGeoDraft({
      document: {
        ...validDocument,
        directAnswer: "API_TOKEN=secret-1234567890",
      },
      evidence: [evidence],
      existingDocuments: [validDocument],
      similarityThreshold: 0.7,
    });
    assert.ok(report.blockers.some((item) => item.code === "sensitive_information"));
    assert.ok(report.warnings.some((item) => item.code === "high_similarity"));
  });

  it("escapes rendered values and emits FAQ JSON-LD from the same document", () => {
    const html = renderGeoArticle({
      template: "<!doctype html><html><head>{{GEO_HEAD}}</head><body>{{GEO_CONTENT}}</body></html>",
      canonicalUrl: "https://lingxi.example/guides/character-consistency",
      brandName: "灵曦AI",
      contentType: "guide",
      document: {
        ...validDocument,
        blocks: [{ type: "paragraph", text: "<script>alert(1)</script>", evidenceIds: [] }],
      },
      publishedAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      authorName: "灵曦AI团队",
      related: [],
    });

    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /"@type":"FAQPage"/);
    assert.match(html, /灵曦AI/);
  });
});
