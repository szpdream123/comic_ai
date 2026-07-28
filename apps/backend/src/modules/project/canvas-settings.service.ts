import { createHash } from "node:crypto";

import {
  assertCanvasActorAction,
  type CanvasActorScope,
} from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { CANVAS_PRODUCT_LIMITS, type CanvasProductLimits } from "./canvas-product-limits.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_REFERENCE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,158}[A-Za-z0-9_-])?$/;
const MEDIA_KINDS = ["text", "image", "video", "audio"] as const;
const CANVAS_BACKGROUNDS = ["default", "solar-system", "nebula", "off-white", "frosted-glass", "custom"] as const;

export type CanvasSettingsMediaKind = typeof MEDIA_KINDS[number];

export interface CanvasSettings {
  schemaVersion: 1;
  appearance: {
    mascotEnabled: boolean;
    mascotPosition: { x: number; y: number } | null;
    canvasBackground: typeof CANVAS_BACKGROUNDS[number];
    customBackgroundStorageObjectId: string | null;
    customBackgroundOpacity: number;
    customBackgroundIsDark: boolean | null;
  };
  visualStyle: {
    styleId: string | null;
    prompt: string;
    locked: boolean;
    styleReferenceAssetId: string | null;
    styleReferenceEnabled: boolean;
  };
  promptSuffixes: Record<CanvasSettingsMediaKind, string>;
  defaultModels: Record<CanvasSettingsMediaKind, string | null>;
  generation: {
    imageAspectRatio: string;
    imageSize: string;
    imageFollowNode: boolean;
    videoResolution: string;
    videoDuration: number;
    videoFollowNode: boolean;
  };
}

export interface CanvasSettingsRecord {
  canvasId: string;
  revision: number;
  settings: CanvasSettings;
  limits: CanvasProductLimits;
  updatedByPrincipalKey: string | null;
  updatedByTeamMemberId: string | null;
  updatedAt: string;
}

export type CanvasSettingsPatch = Partial<{
  appearance: Partial<CanvasSettings["appearance"]>;
  visualStyle: Partial<CanvasSettings["visualStyle"]>;
  promptSuffixes: Partial<CanvasSettings["promptSuffixes"]>;
  defaultModels: Partial<CanvasSettings["defaultModels"]>;
  generation: Partial<CanvasSettings["generation"]>;
}>;

export class CanvasSettingsError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CanvasSettingsError";
  }
}

interface SettingsRow {
  id: string;
  settings_json: unknown;
  settings_revision: number | string;
  settings_updated_by_principal_key: string | null;
  settings_updated_by_team_member_id: string | null;
  updated_at: Date | string;
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = Object.freeze({
  schemaVersion: 1,
  appearance: Object.freeze({
    mascotEnabled: true,
    mascotPosition: null,
    canvasBackground: "default",
    customBackgroundStorageObjectId: null,
    customBackgroundOpacity: 0.3,
    customBackgroundIsDark: null,
  }),
  visualStyle: Object.freeze({
    styleId: null,
    prompt: "",
    locked: false,
    styleReferenceAssetId: null,
    styleReferenceEnabled: true,
  }),
  promptSuffixes: Object.freeze({ text: "", image: "", video: "", audio: "" }),
  defaultModels: Object.freeze({ text: null, image: null, video: null, audio: null }),
  generation: Object.freeze({
    imageAspectRatio: "1:1",
    imageSize: "1K",
    imageFollowNode: false,
    videoResolution: "720p",
    videoDuration: 5,
    videoFollowNode: false,
  }),
});

export async function getCanvasSettings(
  db: SqlDatabase,
  input: { actorScope: CanvasActorScope },
): Promise<CanvasSettingsRecord> {
  assertCanvasActorAction(input.actorScope, "view");
  const row = await queryOne<SettingsRow>(db, `
    SELECT id,settings_json,settings_revision,settings_updated_by_principal_key,
           settings_updated_by_team_member_id,updated_at
    FROM creator_canvas_projects
    WHERE id=$1 AND deleted_at IS NULL
    LIMIT 1
  `, [input.actorScope.canvasId]);
  if (!row) throw new CanvasSettingsError("canvas_settings_not_found");
  return settingsRecord(row);
}

export async function updateCanvasSettings(
  db: SqlDatabase,
  input: {
    actorScope: CanvasActorScope;
    expectedRevision: number;
    patch: CanvasSettingsPatch;
    now: Date;
  },
): Promise<CanvasSettingsRecord> {
  assertCanvasActorAction(input.actorScope, "edit");
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new CanvasSettingsError("canvas_settings_revision_invalid");
  }
  const current = await queryOne<SettingsRow>(db, `
    SELECT id,settings_json,settings_revision,settings_updated_by_principal_key,
           settings_updated_by_team_member_id,updated_at
    FROM creator_canvas_projects
    WHERE id=$1 AND deleted_at IS NULL
    LIMIT 1
  `, [input.actorScope.canvasId]);
  if (!current) throw new CanvasSettingsError("canvas_settings_not_found");
  if (Number(current.settings_revision) !== expectedRevision) {
    throw new CanvasSettingsError("canvas_settings_revision_conflict");
  }
  const settings = mergeCanvasSettings(current.settings_json, input.patch);
  const updated = await queryOne<SettingsRow>(db, `
    UPDATE creator_canvas_projects
    SET settings_json=$3::jsonb,
        settings_revision=settings_revision+1,
        settings_updated_by_principal_key=$4,
        settings_updated_by_team_member_id=$5,
        updated_at=$6
    WHERE id=$1 AND settings_revision=$2 AND deleted_at IS NULL
    RETURNING id,settings_json,settings_revision,settings_updated_by_principal_key,
              settings_updated_by_team_member_id,updated_at
  `, [
    input.actorScope.canvasId,
    expectedRevision,
    JSON.stringify(settings),
    input.actorScope.principalKey,
    input.actorScope.actorTeamMemberId,
    input.now,
  ]);
  if (!updated) throw new CanvasSettingsError("canvas_settings_revision_conflict");
  return settingsRecord(updated);
}

export function normalizeCanvasSettings(value: unknown): CanvasSettings {
  const record = readRecord(value);
  assertKnownKeys(record, ["schemaVersion", "appearance", "visualStyle", "promptSuffixes", "defaultModels", "generation"]);
  if (record.schemaVersion !== undefined && record.schemaVersion !== 1) {
    throw new CanvasSettingsError("canvas_settings_schema_invalid");
  }
  const appearance = readRecord(record.appearance);
  const visualStyle = readRecord(record.visualStyle);
  const promptSuffixes = readRecord(record.promptSuffixes);
  const defaultModels = readRecord(record.defaultModels);
  const generation = readRecord(record.generation);
  assertKnownKeys(appearance, [
    "mascotEnabled",
    "mascotPosition",
    "canvasBackground",
    "customBackgroundStorageObjectId",
    "customBackgroundOpacity",
    "customBackgroundIsDark",
  ]);
  assertKnownKeys(visualStyle, ["styleId", "prompt", "locked", "styleReferenceAssetId", "styleReferenceEnabled"]);
  assertKnownKeys(promptSuffixes, MEDIA_KINDS);
  assertKnownKeys(defaultModels, MEDIA_KINDS);
  assertKnownKeys(generation, [
    "imageAspectRatio",
    "imageSize",
    "imageFollowNode",
    "videoResolution",
    "videoDuration",
    "videoFollowNode",
  ]);

  const mascotEnabled = appearance.mascotEnabled === undefined ? true : appearance.mascotEnabled;
  if (typeof mascotEnabled !== "boolean") throw new CanvasSettingsError("canvas_settings_mascot_enabled_invalid");
  const mascotPosition = normalizeMascotPosition(appearance.mascotPosition);
  const canvasBackground = appearance.canvasBackground === undefined ? "default" : appearance.canvasBackground;
  if (!CANVAS_BACKGROUNDS.includes(canvasBackground as typeof CANVAS_BACKGROUNDS[number])) {
    throw new CanvasSettingsError("canvas_settings_background_invalid");
  }
  const customBackgroundStorageObjectId = optionalUuid(
    appearance.customBackgroundStorageObjectId,
    "canvas_settings_background_storage_object_invalid",
  );
  const customBackgroundOpacity = appearance.customBackgroundOpacity === undefined
    ? 0.3
    : Number(appearance.customBackgroundOpacity);
  if (!Number.isFinite(customBackgroundOpacity) || customBackgroundOpacity < 0.05 || customBackgroundOpacity > 1) {
    throw new CanvasSettingsError("canvas_settings_background_opacity_invalid");
  }
  const customBackgroundIsDark = appearance.customBackgroundIsDark === undefined
    || appearance.customBackgroundIsDark === null
    ? null
    : appearance.customBackgroundIsDark;
  if (customBackgroundIsDark !== null && typeof customBackgroundIsDark !== "boolean") {
    throw new CanvasSettingsError("canvas_settings_background_tone_invalid");
  }
  const styleId = optionalStableReference(visualStyle.styleId, "canvas_settings_style_id_invalid");
  const styleReferenceAssetId = optionalUuid(visualStyle.styleReferenceAssetId, "canvas_settings_style_asset_invalid");
  const prompt = boundedString(visualStyle.prompt, 20_000, "canvas_settings_style_prompt_invalid", "");
  const locked = visualStyle.locked === undefined ? false : visualStyle.locked;
  if (typeof locked !== "boolean") throw new CanvasSettingsError("canvas_settings_style_locked_invalid");
  const styleReferenceEnabled = visualStyle.styleReferenceEnabled === undefined ? true : visualStyle.styleReferenceEnabled;
  if (typeof styleReferenceEnabled !== "boolean") {
    throw new CanvasSettingsError("canvas_settings_style_reference_enabled_invalid");
  }
  const suffixes = Object.fromEntries(MEDIA_KINDS.map((kind) => [
    kind,
    boundedString(promptSuffixes[kind], 20_000, "canvas_settings_suffix_invalid", ""),
  ])) as CanvasSettings["promptSuffixes"];
  const models = Object.fromEntries(MEDIA_KINDS.map((kind) => [
    kind,
    optionalStableReference(defaultModels[kind], "canvas_settings_model_invalid"),
  ])) as CanvasSettings["defaultModels"];
  const videoDuration = generation.videoDuration === undefined ? 5 : Number(generation.videoDuration);
  if (!Number.isSafeInteger(videoDuration) || videoDuration < 1 || videoDuration > 3600) {
    throw new CanvasSettingsError("canvas_settings_video_duration_invalid");
  }
  const imageFollowNode = generation.imageFollowNode === undefined ? false : generation.imageFollowNode;
  const videoFollowNode = generation.videoFollowNode === undefined ? false : generation.videoFollowNode;
  if (typeof imageFollowNode !== "boolean" || typeof videoFollowNode !== "boolean") {
    throw new CanvasSettingsError("canvas_settings_generation_follow_node_invalid");
  }
  return {
    schemaVersion: 1,
    appearance: {
      mascotEnabled,
      mascotPosition,
      canvasBackground: canvasBackground as CanvasSettings["appearance"]["canvasBackground"],
      customBackgroundStorageObjectId,
      customBackgroundOpacity,
      customBackgroundIsDark,
    },
    visualStyle: { styleId, prompt, locked, styleReferenceAssetId, styleReferenceEnabled },
    promptSuffixes: suffixes,
    defaultModels: models,
    generation: {
      imageAspectRatio: boundedString(generation.imageAspectRatio, 40, "canvas_settings_generation_invalid", "1:1"),
      imageSize: boundedString(generation.imageSize, 40, "canvas_settings_generation_invalid", "1K"),
      imageFollowNode,
      videoResolution: boundedString(generation.videoResolution, 40, "canvas_settings_generation_invalid", "720p"),
      videoDuration,
      videoFollowNode,
    },
  };
}

export function mergeCanvasSettings(current: unknown, patch: CanvasSettingsPatch): CanvasSettings {
  const normalizedCurrent = normalizeCanvasSettings(current);
  const patchRecord = readRecord(patch);
  assertKnownKeys(patchRecord, ["appearance", "visualStyle", "promptSuffixes", "defaultModels", "generation"]);
  return normalizeCanvasSettings({
    ...normalizedCurrent,
    appearance: { ...normalizedCurrent.appearance, ...readRecord(patchRecord.appearance) },
    visualStyle: { ...normalizedCurrent.visualStyle, ...readRecord(patchRecord.visualStyle) },
    promptSuffixes: { ...normalizedCurrent.promptSuffixes, ...readRecord(patchRecord.promptSuffixes) },
    defaultModels: { ...normalizedCurrent.defaultModels, ...readRecord(patchRecord.defaultModels) },
    generation: { ...normalizedCurrent.generation, ...readRecord(patchRecord.generation) },
  });
}

function normalizeMascotPosition(value: unknown): CanvasSettings["appearance"]["mascotPosition"] {
  if (value === undefined || value === null) return null;
  const position = readRecord(value);
  assertKnownKeys(position, ["x", "y"]);
  const x = Number(position.x);
  const y = Number(position.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new CanvasSettingsError("canvas_settings_mascot_position_invalid");
  }
  return { x, y };
}

export function createCanvasPromptSuffixDirective(
  record: CanvasSettingsRecord,
  mediaKind: CanvasSettingsMediaKind,
) {
  if (!MEDIA_KINDS.includes(mediaKind)) throw new CanvasSettingsError("canvas_settings_media_kind_invalid");
  const content = record.settings.promptSuffixes[mediaKind].trim();
  return content
    ? {
        id: record.canvasId,
        version: String(record.revision),
        content,
        contentHash: createHash("sha256").update(content).digest("hex"),
      }
    : null;
}

function settingsRecord(row: SettingsRow): CanvasSettingsRecord {
  return {
    canvasId: row.id,
    revision: Number(row.settings_revision),
    settings: normalizeCanvasSettings(row.settings_json),
    limits: CANVAS_PRODUCT_LIMITS,
    updatedByPrincipalKey: row.settings_updated_by_principal_key,
    updatedByTeamMemberId: row.settings_updated_by_team_member_id,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function assertKnownKeys(record: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new CanvasSettingsError("canvas_settings_field_invalid");
  }
}

function boundedString(value: unknown, maximum: number, code: string, fallback: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > maximum) throw new CanvasSettingsError(code);
  return value.trim();
}

function optionalStableReference(value: unknown, code: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !STABLE_REFERENCE_PATTERN.test(value)) throw new CanvasSettingsError(code);
  return value;
}

function optionalUuid(value: unknown, code: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new CanvasSettingsError(code);
  return value;
}
