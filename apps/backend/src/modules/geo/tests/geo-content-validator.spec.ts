import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateGeoDraft } from "../geo-content-validator.ts";
import { renderGeoArticle, renderGeoListing } from "../geo-public-renderer.ts";
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

    const unsupportedBrandFact = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "paragraph", text: "灵曦AI支持自动发布所有第三方平台。", evidenceIds: [] }],
      },
      evidence: [],
    });
    assert.ok(unsupportedBrandFact.blockers.some((item) => item.code === "factual_claim_without_evidence"));
    const implicitProductFact = validateGeoDraft({
      document: { ...validDocument, directAnswer: "平台支持自动发布所有第三方渠道。", blocks: [{ type: "paragraph", text: "平台支持按角色保存参考素材。", evidenceIds: [] }] },
      evidence: [],
    });
    assert.ok(implicitProductFact.blockers.some((item) => item.code === "factual_claim_without_evidence"));

    const unsafe = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "cta", title: "试用", body: "立即体验", href: "javascript:alert(1)", label: "打开" }],
      },
      evidence: [evidence],
    });
    assert.ok(unsafe.blockers.some((item) => item.code === "unsafe_url"));

    const credentialUrl = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "cta", title: "试用", body: "立即体验", href: "https://user:password123@example.com/start", label: "打开" }],
      },
      evidence: [evidence],
    });
    assert.ok(credentialUrl.blockers.some((item) => item.code === "unsafe_url"));

    const sensitiveUrl = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "cta", title: "试用", body: "立即体验", href: "https://example.com/start?api_key=secret123456", label: "打开" }],
      },
      evidence: [evidence],
    });
    assert.ok(sensitiveUrl.blockers.some((item) => item.code === "sensitive_information"));

    const expired = validateGeoDraft({
      document: validDocument,
      evidence: [{ ...evidence, validUntil: "2025-01-01T00:00:00.000Z" }],
      now: new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.ok(expired.blockers.some((item) => item.code === "invalid_evidence"));
  });

  it("blocks subjectless product capability claims without evidence", () => {
    for (const text of ["支持批量生成分镜。", "可统一管理角色素材。", "提供一键导出能力。"]) {
      const result = validateGeoDraft({
        document: { ...validDocument, blocks: [{ type: "paragraph", text, evidenceIds: [] }] },
        evidence: [],
      });
      assert.ok(result.blockers.some((item) => item.code === "factual_claim_without_evidence"), text);
    }
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
    assert.ok(report.blockers.some((item) => item.code === "high_similarity"));
  });

  it("requires accessible public images and warns about externally hosted image evidence", () => {
    const missingAlt = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "image", src: "/geo-assets/32000000-0000-4000-8000-000000000001", alt: "", caption: "角色设定示例", evidenceIds: [] }],
      },
      evidence: [evidence],
    });
    assert.ok(missingAlt.blockers.some((item) => item.code === "image_alt_missing"));

    const privateImage = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "image", src: "/api/storage/objects/32000000-0000-4000-8000-000000000001/content?proxy=1", alt: "角色设定示例", caption: "角色设定示例", evidenceIds: [] }],
      },
      evidence: [evidence],
    });
    assert.ok(privateImage.blockers.some((item) => item.code === "private_image_url"));

    const absolutePrivateImage = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "image", src: "https://www.lingxiyunai.com/api/storage/objects/32000000-0000-4000-8000-000000000001/content?proxy=1", alt: "角色设定示例", caption: "角色设定示例", evidenceIds: [] }],
      },
      evidence: [evidence],
    });
    assert.ok(absolutePrivateImage.blockers.some((item) => item.code === "private_image_url"));
    assert.equal(absolutePrivateImage.warnings.some((item) => item.code === "external_image_url"), false);

    const externalImage = validateGeoDraft({
      document: {
        ...validDocument,
        blocks: [{ type: "image", src: "https://images.example.com/character.png", alt: "角色设定示例", caption: "", evidenceIds: [] }],
      },
      evidence: [evidence],
    });
    assert.ok(externalImage.warnings.some((item) => item.code === "external_image_url"));
    assert.ok(externalImage.warnings.some((item) => item.code === "image_caption_missing"));
  });

  it("escapes rendered values and emits FAQ JSON-LD from the same document", () => {
    const html = renderGeoArticle({
      template: "<!doctype html><html><head>{{GEO_HEAD}}</head><body>{{GEO_CONTENT}}</body></html>",
      canonicalUrl: "https://lingxi.example/guides/character-consistency",
      brandName: "灵曦AI",
      contentType: "guide",
      document: {
        ...validDocument,
        blocks: [{ type: "paragraph", text: "<script>alert(1)</script>", evidenceIds: ["e-1"] }],
      },
      publishedAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      authorName: "灵曦AI团队",
      evidence: [{ id: "e-1", name: "公开产品页", factText: "灵曦AI支持复用角色参考素材。", sourceUrl: "https://www.lingxiyunai.com/assets" }],
      related: [],
    });

    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /"@type":"FAQPage"/);
    assert.match(html, /灵曦AI/);
    assert.match(html, /作者：灵曦AI团队/);
    assert.match(html, /证据来源/);
    assert.match(html, /href="https:\/\/www\.lingxiyunai\.com\/assets"/);
    assert.match(html, /href="#geo-evidence-1"/);
  });

  it("renders image discovery metadata, stable heading anchors, breadcrumbs, and preview robots", () => {
    const html = renderGeoArticle({
      template: "<!doctype html><html><head>{{GEO_HEAD}}</head><body>{{GEO_CONTENT}}</body></html>",
      canonicalUrl: "https://www.lingxiyunai.com/guides/character-consistency",
      brandName: "灵曦AI",
      contentType: "guide",
      document: {
        ...validDocument,
        blocks: [
          { type: "heading", level: 2, text: "人物一致性准备" },
          { type: "image", src: "/geo-assets/32000000-0000-4000-8000-000000000001", alt: "人物角色设定表", caption: "人物角色设定表与参考图", evidenceIds: [] },
        ],
      },
      publishedAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      authorName: "灵曦AI团队",
      evidence: [],
      related: [],
      robots: "noindex,nofollow",
    });

    assert.match(html, /<meta name="robots" content="noindex,nofollow"/);
    assert.match(html, /<meta property="og:image" content="https:\/\/www\.lingxiyunai\.com\/geo-assets\/32000000-0000-4000-8000-000000000001"/);
    assert.match(html, /"image":"https:\/\/www\.lingxiyunai\.com\/geo-assets\/32000000-0000-4000-8000-000000000001"/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.match(html, /<h2 id="geo-heading-1-人物一致性准备">人物一致性准备<\/h2>/);
  });

  it("marks empty GEO listings noindex while keeping populated listings indexable", () => {
    const input = {
      template: "<!doctype html><html><head>{{GEO_HEAD}}</head><body>{{GEO_CONTENT}}</body></html>",
      canonicalUrl: "https://www.lingxiyunai.com/cases",
      brandName: "灵曦AI" as const,
      title: "AI短剧实践案例 | 灵曦AI",
      description: "AI短剧实践案例。",
    };
    const empty = renderGeoListing({ ...input, items: [] });
    const populated = renderGeoListing({ ...input, items: [{ href: "/cases/example", title: "示例", summary: "案例摘要" }] });
    assert.match(empty, /<meta name="robots" content="noindex,follow"/);
    assert.match(populated, /<meta name="robots" content="index,follow,max-image-preview:large"/);
  });
});
