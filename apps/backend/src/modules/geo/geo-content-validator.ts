import type {
  GeoBlock,
  GeoDocument,
  GeoEvidenceSnapshot,
  GeoQualityIssue,
  GeoQualityReport,
} from "./geo-types.ts";

const LEGACY_BRAND = "灵曦剧场";
const NUMBER_CLAIM = /(?:\d+(?:\.\d+)?\s*(?:%|％|分钟|小时|天|倍|个|张|次|元|万|亿)|百分之[一二三四五六七八九十百千万零〇两\d]+)/;
const SENSITIVE_VALUE = /(?:password|passwd|secret|api[_-]?(?:key|token)|access[_-]?token|refresh[_-]?token|authorization|密码|密钥|令牌)\s*[:=：]\s*["']?[a-z0-9_\-./+=]{6,}/i;
const PHONE_NUMBER = /(?<!\d)1[3-9]\d{9}(?!\d)/;
const ABSOLUTE_CLAIM = /(?:唯一|绝对|保证|百分百|100%|行业第一|最强|永久|完全不会)/;
const PRODUCT_CLAIM = /(?:灵曦AI|本平台|该平台|平台|产品|系统|工具).{0,18}(?:支持|可以|可|提供|具备|实现|提升|降低|节省|自动|效果|成本|价格|模型)/;
const SUBJECTLESS_PRODUCT_CLAIM = /(?:^|[。！？；\n])\s*(?:支持|可(?:以)?|提供|具备|实现|自动)\s*(?:批量|统一|一键|自动|按|对|将|管理|生成|保存|复用|导入|导出)/;

export function validateGeoDraft(input: {
  document: GeoDocument;
  evidence: GeoEvidenceSnapshot[];
  existingDocuments?: GeoDocument[];
  now?: Date;
  similarityThreshold?: number;
}): GeoQualityReport {
  const blockers: GeoQualityIssue[] = [];
  const warnings: GeoQualityIssue[] = [];
  const now = input.now ?? new Date();
  const allText = collectDocumentText(input.document).join("\n");

  if (!input.document.title.trim() || !input.document.summary.trim() || !input.document.directAnswer.trim()) {
    blockers.push(issue("required_content_missing", "标题、摘要和直接回答不能为空。"));
  }
  if (input.document.blocks.length === 0) {
    blockers.push(issue("required_content_missing", "正文至少需要一个内容块。", "blocks"));
  }
  if (allText.includes(LEGACY_BRAND)) {
    blockers.push(issue("legacy_brand_forbidden", `公开内容不得出现旧品牌“${LEGACY_BRAND}”。`));
  }
  if (SENSITIVE_VALUE.test(allText) || PHONE_NUMBER.test(allText)) {
    blockers.push(issue("sensitive_information", "内容中可能包含密码、密钥、令牌或手机号。"));
  }
  if (ABSOLUTE_CLAIM.test(allText)) {
    blockers.push(issue("absolute_claim", "内容包含无法审慎验证的绝对化表述。"));
  }
  const unboundFields = [input.document.summary, input.document.directAnswer, ...input.document.faq.flatMap((item) => [item.question, item.answer]), ...Object.values(input.document.socialDrafts)];
  if (unboundFields.some(hasProductClaim)) {
    blockers.push(issue("factual_claim_without_evidence", "摘要、直接回答、FAQ和站外草稿不得承载无法绑定证据的产品声明。"));
  }

  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  input.document.blocks.forEach((block, index) => {
    const urls = blockUrls(block);
    for (const url of urls) {
      if (!isSafeUrl(url)) blockers.push(issue("unsafe_url", "链接必须是站内路径或 HTTP(S) 地址。", `blocks.${index}`));
    }

    const text = blockText(block);
    const evidenceIds = blockEvidenceIds(block);
    if (hasProductClaim(text) && evidenceIds.length === 0) {
      blockers.push(issue("factual_claim_without_evidence", "涉及灵曦AI能力或事实的正文必须绑定已审核证据。", `blocks.${index}`));
    }
    if (NUMBER_CLAIM.test(text) && evidenceIds.length === 0) {
      blockers.push(issue("numeric_claim_without_evidence", "数字、比例或时效声明必须绑定已审核证据。", `blocks.${index}`));
    }
    for (const evidenceId of evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (!isValidEvidence(evidence, now)) {
        blockers.push(issue("invalid_evidence", `证据 ${evidenceId} 未审核、不可公开或已失效。`, `blocks.${index}`));
      }
    }
  });

  if (!isSafeUrlFromOptional(input.document.seo.title) || !isSafeUrlFromOptional(input.document.seo.description)) {
    blockers.push(issue("unsafe_url", "SEO字段包含危险协议。", "seo"));
  }
  if (input.document.seo.title.length > 65) warnings.push(issue("seo_title_long", "SEO标题建议控制在65个字符以内。", "seo.title"));
  if (input.document.seo.description.length < 20) warnings.push(issue("seo_description_short", "SEO描述建议补充到20个字符以上。", "seo.description"));
  if (input.document.faq.length === 0) warnings.push(issue("faq_missing", "建议至少补充一个与目标问题对应的FAQ。", "faq"));

  const threshold = input.similarityThreshold ?? 0.86;
  const currentFingerprint = documentFingerprint(input.document);
  if ((input.existingDocuments ?? []).some((document) => diceSimilarity(currentFingerprint, documentFingerprint(document)) >= threshold)) {
    blockers.push(issue("high_similarity", "当前内容与已有内容超过相似度阈值，需调整后再送审。"));
  }

  return { blockers: dedupeIssues(blockers), warnings: dedupeIssues(warnings), checkedAt: now.toISOString() };
}

function isValidEvidence(evidence: GeoEvidenceSnapshot | undefined, now: Date) {
  return Boolean(
    evidence
      && evidence.reviewStatus === "approved"
      && evidence.publicUseAllowed
      && (!evidence.validUntil || new Date(evidence.validUntil).getTime() >= now.getTime()),
  );
}

function collectDocumentText(document: GeoDocument) {
  return [
    document.title,
    document.summary,
    document.directAnswer,
    document.seo.title,
    document.seo.description,
    ...document.blocks.map(blockText),
    ...document.faq.flatMap((item) => [item.question, item.answer]),
    ...Object.values(document.socialDrafts),
  ];
}

function blockText(block: GeoBlock) {
  switch (block.type) {
    case "paragraph": case "heading": case "note": return block.text;
    case "list": return block.items.join("\n");
    case "steps": return block.items.flatMap((item) => [item.title, item.body]).join("\n");
    case "quote": return `${block.text}\n${block.sourceLabel}`;
    case "table": return [...block.headers, ...block.rows.flat()].join("\n");
    case "image": return `${block.alt}\n${block.caption}`;
    case "cta": return `${block.title}\n${block.body}\n${block.label}`;
  }
}

function blockEvidenceIds(block: GeoBlock) {
  return "evidenceIds" in block ? block.evidenceIds : [];
}

function blockUrls(block: GeoBlock) {
  if (block.type === "quote") return [block.sourceUrl];
  if (block.type === "image") return [block.src];
  if (block.type === "cta") return [block.href];
  return [];
}

export function isSafeGeoUrl(value: string) {
  const url = value.trim();
  if (/^\/(?!\/)/.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeUrl(value: string) {
  return isSafeGeoUrl(value);
}

function isSafeUrlFromOptional(value: string) {
  const match = value.match(/(?:javascript:|data:|\/\/)/i);
  return !match;
}

function documentFingerprint(document: GeoDocument) {
  return collectDocumentText(document).join("").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
function hasProductClaim(text: string) { return PRODUCT_CLAIM.test(text) || SUBJECTLESS_PRODUCT_CLAIM.test(text); }

function diceSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      overlap += 1;
      pairs.set(pair, count - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length - 2);
}

function issue(code: string, message: string, path?: string): GeoQualityIssue {
  return path ? { code, message, path } : { code, message };
}

function dedupeIssues(items: GeoQualityIssue[]) {
  return items.filter((item, index) => items.findIndex((candidate) => candidate.code === item.code && candidate.path === item.path) === index);
}
