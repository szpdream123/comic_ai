import type { GeoBlock, GeoContentType, GeoDocument, GeoPublicSummary } from "./geo-types.ts";

export function renderGeoArticle(input: {
  template: string;
  canonicalUrl: string;
  brandName: "灵曦AI";
  contentType: GeoContentType;
  document: GeoDocument;
  publishedAt: string;
  updatedAt: string;
  authorName: string;
  evidence: Array<{ id: string; name: string; factText: string; sourceUrl: string | null }>;
  related: GeoPublicSummary[];
}) {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": input.contentType === "case" ? "Article" : "TechArticle",
    headline: input.document.title,
    description: input.document.summary,
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    mainEntityOfPage: input.canonicalUrl,
    author: { "@type": "Organization", name: input.authorName },
    publisher: { "@type": "Organization", name: input.brandName },
  };
  const faqJsonLd = input.document.faq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: input.document.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  } : null;
  const head = [
    `<title>${escapeHtml(input.document.seo.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(input.document.seo.description)}" />`,
    `<link rel="canonical" href="${escapeAttribute(input.canonicalUrl)}" />`,
    `<script type="application/ld+json">${safeJsonLd(articleJsonLd)}</script>`,
    faqJsonLd ? `<script type="application/ld+json">${safeJsonLd(faqJsonLd)}</script>` : "",
  ].join("");
  const related = input.related.length > 0
    ? `<aside class="geo-related"><h2>相关阅读</h2><ul>${input.related.map((item) => `<li><a href="${escapeAttribute(item.href)}">${escapeHtml(item.title)}</a><p>${escapeHtml(item.summary)}</p></li>`).join("")}</ul></aside>`
    : "";
  const citationIndex = new Map(input.evidence.map((item, index) => [item.id, index + 1]));
  const updated = input.updatedAt !== input.publishedAt
    ? ` · 更新：<time datetime="${escapeAttribute(input.updatedAt)}">${escapeHtml(displayDate(input.updatedAt))}</time>`
    : "";
  const evidence = renderEvidence(input.evidence);
  const content = `<main class="geo-article"><article><header><p class="geo-brand">${escapeHtml(input.brandName)}</p><h1>${escapeHtml(input.document.title)}</h1><p class="geo-summary">${escapeHtml(input.document.summary)}</p><p class="geo-byline">作者：${escapeHtml(input.authorName)} · 发布：<time datetime="${escapeAttribute(input.publishedAt)}">${escapeHtml(displayDate(input.publishedAt))}</time>${updated}</p></header><section class="geo-direct-answer"><h2>直接回答</h2><p>${escapeHtml(input.document.directAnswer)}</p></section>${input.document.blocks.map((block) => renderBlock(block, citationIndex)).join("")}${renderFaq(input.document)}${evidence}</article>${related}</main>`;

  return input.template
    .replace("{{GEO_HEAD}}", head)
    .replace("{{GEO_CONTENT}}", content);
}

export function renderGeoListing(input: {
  template: string;
  canonicalUrl: string;
  brandName: "灵曦AI";
  title: string;
  description: string;
  items: GeoPublicSummary[];
}) {
  const head = `<title>${escapeHtml(input.title)}</title><meta name="description" content="${escapeAttribute(input.description)}" /><link rel="canonical" href="${escapeAttribute(input.canonicalUrl)}" />`;
  const cards = input.items.map((item) => `<article class="geo-card"><a href="${escapeAttribute(item.href)}"><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p></a></article>`).join("");
  const content = `<main class="geo-listing"><header><p>${escapeHtml(input.brandName)}</p><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.description)}</p></header><section>${cards || "<p>内容正在准备中。</p>"}</section></main>`;
  return input.template.replace("{{GEO_HEAD}}", head).replace("{{GEO_CONTENT}}", content);
}

function renderBlock(block: GeoBlock, citationIndex: Map<string, number>) {
  let html: string;
  const citations = renderCitations("evidenceIds" in block ? block.evidenceIds : [], citationIndex);
  switch (block.type) {
    case "paragraph": return `<p>${escapeHtml(block.text)}${citations}</p>`;
    case "heading": html = `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`; break;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      html = `<${tag}>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
      break;
    }
    case "steps": html = `<ol class="geo-steps">${block.items.map((item) => `<li><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></li>`).join("")}</ol>`; break;
    case "quote": html = `<blockquote><p>${escapeHtml(block.text)}</p><cite><a href="${escapeAttribute(block.sourceUrl)}" rel="nofollow noopener">${escapeHtml(block.sourceLabel)}</a></cite></blockquote>`; break;
    case "table": html = `<div class="geo-table"><table><thead><tr>${block.headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((item) => `<td>${escapeHtml(item)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; break;
    case "image": html = `<figure><img src="${escapeAttribute(block.src)}" alt="${escapeAttribute(block.alt)}" loading="lazy" /><figcaption>${escapeHtml(block.caption)}</figcaption></figure>`; break;
    case "note": html = `<aside class="geo-note geo-note-${block.tone}">${escapeHtml(block.text)}</aside>`; break;
    case "cta": html = `<aside class="geo-cta"><h2>${escapeHtml(block.title)}</h2><p>${escapeHtml(block.body)}</p><a href="${escapeAttribute(block.href)}">${escapeHtml(block.label)}</a></aside>`; break;
  }
  return html + citations;
}

function renderCitations(evidenceIds: string[], citationIndex: Map<string, number>) {
  const indices = [...new Set(evidenceIds.map((id) => citationIndex.get(id)).filter((value): value is number => value !== undefined))];
  if (indices.length === 0) return "";
  return `<sup class="geo-citations">${indices.map((index) => `<a href="#geo-evidence-${index}" aria-label="证据 ${index}">[${index}]</a>`).join(" ")}</sup>`;
}

function renderEvidence(evidence: Array<{ id: string; name: string; factText: string; sourceUrl: string | null }>) {
  if (evidence.length === 0) return "";
  return `<section class="geo-evidence"><h2>证据来源</h2><ol>${evidence.map((item, index) => {
    const href = safePublicHref(item.sourceUrl);
    const source = href ? ` <a href="${escapeAttribute(href)}" rel="nofollow noopener">查看公开来源</a>` : "";
    return `<li id="geo-evidence-${index + 1}"><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.factText)}${source}</p></li>`;
  }).join("")}</ol></section>`;
}

function safePublicHref(value: string | null) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (/^\/(?!\/)[^\s]*$/.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function displayDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? value;
}

function renderFaq(document: GeoDocument) {
  if (document.faq.length === 0) return "";
  return `<section class="geo-faq"><h2>常见问题</h2>${document.faq.map((item) => `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`).join("")}</section>`;
}

function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
