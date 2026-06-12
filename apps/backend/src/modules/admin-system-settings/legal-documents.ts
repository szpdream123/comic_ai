import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const legalDocumentsConfigKey = "legal.documents";

export const legalDocumentConfigs = {
  serviceAgreement: {
    id: "serviceAgreement",
    key: "legal.service_agreement",
    type: "service",
    title: "用户服务协议",
    description: "登录页用户服务协议富文本",
  },
  privacyPolicy: {
    id: "privacyPolicy",
    key: "legal.privacy_policy",
    type: "privacy",
    title: "隐私政策",
    description: "登录页隐私政策富文本",
  },
} as const;

export type LegalDocumentType =
  (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]["type"];

export interface LegalDocumentValue {
  title: string;
  contentHtml: string;
  versionLabel: string | null;
}

export interface LegalDocumentRecord extends LegalDocumentValue {
  id: string;
  type: LegalDocumentType;
  status: "enabled" | "disabled";
  deleted: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const defaultVersionLabel = "2025-11-15";

const seedTextByType: Record<LegalDocumentType, string> = {
  service: readSeedText("../../../../web/legal/service-agreement.txt"),
  privacy: readSeedText("../../../../web/legal/privacy-policy.txt"),
};

const legalConfigByType = Object.values(legalDocumentConfigs).reduce<
  Record<LegalDocumentType, (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]>
>((accumulator, config) => {
  accumulator[config.type] = config;
  return accumulator;
}, {} as Record<LegalDocumentType, (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]>);

export function defaultLegalDocumentValue(
  key: (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]["key"],
): LegalDocumentValue {
  const config = Object.values(legalDocumentConfigs).find((item) => item.key === key);
  const type = config?.type ?? "service";
  return {
    title: config?.title ?? "协议文档",
    contentHtml: textToRichHtml(seedTextByType[type] ?? config?.title ?? "协议文档"),
    versionLabel: defaultVersionLabel,
  };
}

export function emptyLegalDocumentValue(
  key: (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]["key"],
): LegalDocumentValue {
  const config = Object.values(legalDocumentConfigs).find((item) => item.key === key);
  return {
    title: config?.title ?? "协议文档",
    contentHtml: "<p>暂无协议内容。</p>",
    versionLabel: null,
  };
}

export function defaultLegalDocuments(now = new Date()): LegalDocumentRecord[] {
  const timestamp = now.toISOString();
  return Object.values(legalDocumentConfigs).map((config, index) => {
    const value = defaultLegalDocumentValue(config.key);
    return {
      id: buildDefaultDocumentId(config.type),
      type: config.type,
      title: value.title,
      contentHtml: value.contentHtml,
      versionLabel: value.versionLabel,
      status: "enabled",
      deleted: false,
      sortOrder: (index + 1) * 100,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

export function normalizeLegalDocumentValue(
  key: (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]["key"],
  value: unknown,
): LegalDocumentValue {
  const fallback = defaultLegalDocumentValue(key);
  if (typeof value === "string") {
    return {
      ...fallback,
      contentHtml: value.trim() || fallback.contentHtml,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  return {
    title: String(record.title ?? fallback.title).trim() || fallback.title,
    contentHtml: String(record.contentHtml ?? fallback.contentHtml).trim() || fallback.contentHtml,
    versionLabel: String(record.versionLabel ?? fallback.versionLabel ?? "").trim() || fallback.versionLabel,
  };
}

export function normalizeLegalDocuments(value: unknown, now = new Date()): LegalDocumentRecord[] {
  if (!Array.isArray(value)) {
    return defaultLegalDocuments(now);
  }

  const normalized = value
    .map((item, index) => normalizeLegalDocumentRecord(item, index, now))
    .filter((item): item is LegalDocumentRecord => Boolean(item));

  return ensureLegalDocumentCoverage(normalized, now);
}

export function migrateLegacyLegalDocuments(input: {
  serviceAgreement?: unknown;
  privacyPolicy?: unknown;
  now?: Date;
}): LegalDocumentRecord[] {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const serviceValue = normalizeLegalDocumentValue(
    legalDocumentConfigs.serviceAgreement.key,
    input.serviceAgreement,
  );
  const privacyValue = normalizeLegalDocumentValue(
    legalDocumentConfigs.privacyPolicy.key,
    input.privacyPolicy,
  );
  return [
    {
      id: buildDefaultDocumentId("service"),
      type: "service",
      title: serviceValue.title,
      contentHtml: serviceValue.contentHtml,
      versionLabel: serviceValue.versionLabel,
      status: "enabled",
      deleted: false,
      sortOrder: 100,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: buildDefaultDocumentId("privacy"),
      type: "privacy",
      title: privacyValue.title,
      contentHtml: privacyValue.contentHtml,
      versionLabel: privacyValue.versionLabel,
      status: "enabled",
      deleted: false,
      sortOrder: 200,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

export function legalDocumentTypeFromLegacyKey(key: string): LegalDocumentType | null {
  if (key === legalDocumentConfigs.serviceAgreement.key) return "service";
  if (key === legalDocumentConfigs.privacyPolicy.key) return "privacy";
  return null;
}

export function publicLegalDocumentKeyByType(type: LegalDocumentType) {
  return legalConfigByType[type].key;
}

export function publicLegalDocumentTitleByType(type: LegalDocumentType) {
  return legalConfigByType[type].title;
}

export function buildPublicLegalDocument(type: LegalDocumentType, document: LegalDocumentRecord | null) {
  const config = legalConfigByType[type];
  const fallback = emptyLegalDocumentValue(config.key);
  return {
    key: config.key,
    document: document
      ? {
          title: document.title,
          contentHtml: document.contentHtml,
          versionLabel: document.versionLabel,
        }
      : fallback,
    updatedAt: document?.updatedAt ?? null,
  };
}

export function findEnabledLegalDocument(
  documents: LegalDocumentRecord[],
  type: LegalDocumentType,
): LegalDocumentRecord | null {
  return (
    documents
      .filter((document) => !document.deleted && document.type === type && document.status === "enabled")
      .sort(compareLegalDocuments)[0] ?? null
  );
}

export function sanitizeLegalDocumentsForStorage(documents: LegalDocumentRecord[], now = new Date()) {
  const normalized = normalizeLegalDocuments(documents, now);
  return normalized.map((document) => ({
    id: document.id,
    type: document.type,
    title: document.title,
    contentHtml: document.contentHtml,
    versionLabel: document.versionLabel,
    status: document.status,
    deleted: document.deleted,
    sortOrder: document.sortOrder,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }));
}

function normalizeLegalDocumentRecord(item: unknown, index: number, now: Date): LegalDocumentRecord | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const record = item as Record<string, unknown>;
  const type = normalizeLegalDocumentType(record.type);
  if (!type) {
    return null;
  }
  const config = legalConfigByType[type];
  const fallback = defaultLegalDocumentValue(config.key);
  const timestamp = now.toISOString();
  return {
    id: normalizeDocumentId(record.id, type),
    type,
    title: String(record.title ?? fallback.title).trim() || fallback.title,
    contentHtml: String(record.contentHtml ?? fallback.contentHtml).trim() || fallback.contentHtml,
    versionLabel: normalizeVersionLabel(record.versionLabel, fallback.versionLabel),
    status: record.status === "enabled" ? "enabled" : "disabled",
    deleted: Boolean(record.deleted),
    sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : (index + 1) * 100,
    createdAt: normalizeTimestamp(record.createdAt, timestamp),
    updatedAt: normalizeTimestamp(record.updatedAt, timestamp),
  };
}

function normalizeLegalDocumentType(value: unknown): LegalDocumentType | null {
  if (value === "service" || value === "privacy") {
    return value;
  }
  return null;
}

function ensureLegalDocumentCoverage(documents: LegalDocumentRecord[], now: Date) {
  const timestamp = now.toISOString();
  const byType = new Map<LegalDocumentType, LegalDocumentRecord[]>();
  for (const document of documents) {
    if (document.deleted) continue;
    if (!byType.has(document.type)) byType.set(document.type, []);
    byType.get(document.type)?.push(document);
  }

  const ensured = [...documents];
  for (const config of Object.values(legalDocumentConfigs)) {
    if ((byType.get(config.type) || []).length === 0) {
      const fallback = defaultLegalDocumentValue(config.key);
      ensured.push({
        id: buildDefaultDocumentId(config.type),
        type: config.type,
        title: fallback.title,
        contentHtml: fallback.contentHtml,
        versionLabel: fallback.versionLabel,
        status: "enabled",
        deleted: false,
        sortOrder: config.type === "service" ? 100 : 200,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  const dedupedEnabled = ensured
    .sort(compareLegalDocuments)
    .map((document) => ({ ...document }));
  for (const type of ["service", "privacy"] as const) {
    let enabledFound = false;
    for (const document of dedupedEnabled) {
      if (document.deleted || document.type !== type) continue;
      if (document.status === "enabled" && !enabledFound) {
        enabledFound = true;
        continue;
      }
      if (document.status === "enabled") {
        document.status = "disabled";
      }
    }
  }

  return dedupedEnabled.sort(compareLegalDocuments);
}

function compareLegalDocuments(left: LegalDocumentRecord, right: LegalDocumentRecord) {
  const deletedOrder = Number(left.deleted) - Number(right.deleted);
  if (deletedOrder) return deletedOrder;
  const sortOrder = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
  if (sortOrder) return sortOrder;
  const updatedOrder = String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
  if (updatedOrder) return updatedOrder;
  return String(left.id).localeCompare(String(right.id));
}

function buildDefaultDocumentId(type: LegalDocumentType) {
  return type === "service"
    ? "00000000-0000-4000-8000-000000000101"
    : "00000000-0000-4000-8000-000000000102";
}

function normalizeVersionLabel(value: unknown, fallback: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeDocumentId(value: unknown, type: LegalDocumentType) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === `default-${type}`) {
    return buildDefaultDocumentId(type);
  }
  return normalized;
}

function normalizeTimestamp(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function readSeedText(relativePath: string) {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), "utf8").trim();
  } catch {
    return "";
  }
}

function textToRichHtml(text: string) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "<p>暂无协议内容。</p>";
  }
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function legalDocumentsRevisionId(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}
