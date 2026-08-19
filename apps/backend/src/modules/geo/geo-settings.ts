import type { SqlDatabase } from "../shared/db/sql.ts";

export const geoRuntimeConfigKey = "geo.runtime";

export interface GeoRuntimeSettings {
  defaultModelCode: string;
  brandName: "灵曦AI";
  brandFacts: string[];
  brandTone: string;
  forbiddenPhrases: string[];
  defaultWordRange: { min: number; max: number };
  similarityThreshold: number;
  publicAuthorName: string;
}

export const defaultGeoRuntimeSettings: GeoRuntimeSettings = {
  defaultModelCode: "",
  brandName: "灵曦AI",
  brandFacts: [],
  brandTone: "专业、克制、清晰，不夸大效果",
  forbiddenPhrases: ["灵曦剧场", "行业第一", "国内唯一", "100%稳定"],
  defaultWordRange: { min: 1200, max: 2600 },
  similarityThreshold: 0.82,
  publicAuthorName: "灵曦AI内容团队",
};

export function normalizeGeoRuntimeSettings(value: unknown): GeoRuntimeSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const range = input.defaultWordRange && typeof input.defaultWordRange === "object" && !Array.isArray(input.defaultWordRange)
    ? input.defaultWordRange as Record<string, unknown>
    : {};
  const min = boundedInteger(range.min, 300, 10_000, defaultGeoRuntimeSettings.defaultWordRange.min);
  const max = boundedInteger(range.max, min, 20_000, Math.max(min, defaultGeoRuntimeSettings.defaultWordRange.max));
  return {
    defaultModelCode: stringValue(input.defaultModelCode),
    brandName: "灵曦AI",
    brandFacts: stringArray(input.brandFacts),
    brandTone: stringValue(input.brandTone) || defaultGeoRuntimeSettings.brandTone,
    forbiddenPhrases: stringArray(input.forbiddenPhrases).length ? stringArray(input.forbiddenPhrases) : [...defaultGeoRuntimeSettings.forbiddenPhrases],
    defaultWordRange: { min, max },
    similarityThreshold: boundedNumber(input.similarityThreshold, 0.5, 1, defaultGeoRuntimeSettings.similarityThreshold),
    publicAuthorName: stringValue(input.publicAuthorName) || defaultGeoRuntimeSettings.publicAuthorName,
  };
}

export async function loadGeoRuntimeSettings(db: SqlDatabase) {
  const result = await db.query<{ value_json: unknown; revision_id: string | null }>(
    `SELECT entry.value_json,
            (SELECT revision.id FROM runtime_config_revisions revision
              WHERE revision.config_key=entry.key ORDER BY revision.created_at DESC,revision.id DESC LIMIT 1) AS revision_id
       FROM runtime_config_entries entry WHERE entry.key=$1`,
    [geoRuntimeConfigKey],
  );
  return {
    settings: normalizeGeoRuntimeSettings(result.rows[0]?.value_json),
    revisionId: result.rows[0]?.revision_id ?? "geo-default-v1",
  };
}

export async function loadGeoRuntimeSettingsRevision(db: SqlDatabase, revisionId: string) {
  if (revisionId === "geo-default-v1") return defaultGeoRuntimeSettings;
  const result = await db.query<{ next_value_json: unknown }>(
    `SELECT next_value_json FROM runtime_config_revisions WHERE id=$1 AND config_key=$2`,
    [revisionId, geoRuntimeConfigKey],
  );
  return normalizeGeoRuntimeSettings(result.rows[0]?.next_value_json);
}

function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function stringArray(value: unknown) { return Array.isArray(value) ? [...new Set(value.map(stringValue).filter(Boolean))] : []; }
function boundedNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
function boundedInteger(value: unknown, min: number, max: number, fallback: number) {
  return Math.round(boundedNumber(value, min, max, fallback));
}
