export type GeoContentType = "guide" | "case" | "report" | "answer";

export type GeoBlock =
  | { type: "paragraph"; text: string; evidenceIds: string[] }
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "list"; ordered: boolean; items: string[]; evidenceIds: string[] }
  | { type: "steps"; items: Array<{ title: string; body: string }>; evidenceIds: string[] }
  | { type: "quote"; text: string; sourceLabel: string; sourceUrl: string; evidenceIds: string[] }
  | { type: "table"; headers: string[]; rows: string[][]; evidenceIds: string[] }
  | { type: "image"; src: string; alt: string; caption: string; evidenceIds: string[] }
  | { type: "note"; tone: "info" | "warning"; text: string }
  | { type: "cta"; title: string; body: string; href: string; label: string };

export interface GeoDocument {
  title: string;
  summary: string;
  directAnswer: string;
  blocks: GeoBlock[];
  faq: Array<{ question: string; answer: string }>;
  socialDrafts: Record<"zhihu" | "xiaohongshu" | "bilibili" | "wechat", string>;
  seo: { title: string; description: string };
}

export interface GeoEvidenceSnapshot {
  id: string;
  name: string;
  factText: string;
  sourceUrl: string | null;
  reviewStatus: "pending" | "approved" | "rejected";
  publicUseAllowed: boolean;
  validUntil: string | null;
}

export interface GeoQualityIssue {
  code: string;
  message: string;
  path?: string;
}

export interface GeoQualityReport {
  blockers: GeoQualityIssue[];
  warnings: GeoQualityIssue[];
  checkedAt: string;
}

export interface GeoPublicSummary {
  href: string;
  title: string;
  summary: string;
  contentType?: GeoContentType;
  publishedAt?: string;
}
