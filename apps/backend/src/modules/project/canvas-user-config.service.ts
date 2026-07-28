import { createHash, randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export type CanvasUserConfigType = "style" | "skill" | "toolbar" | "slash_command" | "preset";

export class CanvasUserConfigError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = "CanvasUserConfigError";
  }
}

interface ConfigRow {
  id: string;
  user_id: string;
  config_type: CanvasUserConfigType;
  name: string;
  status: "active" | "archived";
  current_version_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface VersionRow {
  id: string;
  config_id: string;
  version: number | string;
  manifest_json: Record<string, unknown>;
  content_hash: string;
  created_at: Date | string;
}

export async function createCanvasUserConfig(
  db: SqlDatabase,
  input: {
    userId: string;
    actorUserId?: string | null;
    type: CanvasUserConfigType;
    name: string;
    manifest: unknown;
    now: Date;
  },
) {
  const name = normalizeName(input.name);
  const manifest = validateCanvasUserConfigManifest(input.type, input.manifest);
  const configId = randomUUID();
  const versionId = randomUUID();
  await db.query("BEGIN");
  try {
    const config = await queryOne<ConfigRow>(db, `
      INSERT INTO canvas_user_configs (
        id,user_id,config_type,name,status,created_by_user_id,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,'active',$5,$6,$6) RETURNING *
    `, [configId, input.userId, input.type, name, input.actorUserId ?? input.userId, input.now]);
    const version = await queryOne<VersionRow>(db, `
      INSERT INTO canvas_user_config_versions (
        id,config_id,version,manifest_json,content_hash,created_by_user_id,created_at
      ) VALUES ($1,$2,1,$3::jsonb,$4,$5,$6) RETURNING *
    `, [versionId, configId, JSON.stringify(manifest), hashManifest(manifest), input.actorUserId ?? input.userId, input.now]);
    await db.query(
      "UPDATE canvas_user_configs SET current_version_id=$2,updated_at=$3 WHERE id=$1",
      [configId, versionId, input.now],
    );
    await db.query("COMMIT");
    return { config: configRecord({ ...config!, current_version_id: versionId }), version: versionRecord(version!) };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw translateConfigError(error);
  }
}

export async function createCanvasUserConfigVersion(
  db: SqlDatabase,
  input: { userId: string; configId: string; actorUserId?: string | null; manifest: unknown; now: Date },
) {
  await db.query("BEGIN");
  try {
    const config = await queryOne<ConfigRow>(db, `
      SELECT * FROM canvas_user_configs
      WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE
    `, [input.configId, input.userId]);
    if (!config) throw new CanvasUserConfigError("canvas_user_config_not_found");
    const manifest = validateCanvasUserConfigManifest(config.config_type, input.manifest);
    const version = await queryOne<VersionRow>(db, `
      INSERT INTO canvas_user_config_versions (
        id,config_id,version,manifest_json,content_hash,created_by_user_id,created_at
      ) SELECT $1,$2,COALESCE(MAX(version),0)+1,$3::jsonb,$4,$5,$6
        FROM canvas_user_config_versions WHERE config_id=$2
      RETURNING *
    `, [randomUUID(), config.id, JSON.stringify(manifest), hashManifest(manifest), input.actorUserId ?? input.userId, input.now]);
    await db.query(
      "UPDATE canvas_user_configs SET current_version_id=$2,updated_at=$3 WHERE id=$1",
      [config.id, version!.id, input.now],
    );
    await db.query("COMMIT");
    return versionRecord(version!);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw translateConfigError(error);
  }
}

export async function listCanvasUserConfigs(
  db: SqlDatabase,
  input: { userId: string; type?: CanvasUserConfigType; includeArchived?: boolean; limit?: number },
) {
  const result = await db.query<ConfigRow>(`
    SELECT * FROM canvas_user_configs
    WHERE user_id=$1 AND deleted_at IS NULL
      AND ($2::text IS NULL OR config_type=$2)
      AND ($3::boolean OR status='active')
    ORDER BY updated_at DESC,id DESC LIMIT $4
  `, [input.userId, input.type ?? null, input.includeArchived === true, clampLimit(input.limit)]);
  return result.rows.map(configRecord);
}

export async function listCanvasUserConfigVersions(
  db: SqlDatabase,
  input: { userId: string; configId: string; limit?: number },
) {
  const result = await db.query<VersionRow>(`
    SELECT version.*
    FROM canvas_user_config_versions version
    JOIN canvas_user_configs config ON config.id=version.config_id
    WHERE config.id=$1 AND config.user_id=$2 AND config.deleted_at IS NULL
    ORDER BY version.version DESC,version.id DESC LIMIT $3
  `, [input.configId, input.userId, clampLimit(input.limit)]);
  return result.rows.map(versionRecord);
}

export async function archiveCanvasUserConfig(
  db: SqlDatabase,
  input: { userId: string; configId: string; now: Date },
) {
  const row = await queryOne<{ id: string }>(db, `
    UPDATE canvas_user_configs
    SET status='archived',deleted_at=$3,updated_at=$3
    WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id
  `, [input.configId, input.userId, input.now]);
  return Boolean(row);
}

export async function resolveCanvasUserConfigSnapshot(
  db: SqlDatabase,
  input: { userId: string; configId: string; versionId?: string | null; expectedType?: CanvasUserConfigType },
) {
  const row = await queryOne<VersionRow & { config_type: CanvasUserConfigType; status: string }>(db, `
    SELECT version.*,config.config_type,config.status
    FROM canvas_user_configs config
    JOIN canvas_user_config_versions version
      ON version.config_id=config.id
     AND version.id=COALESCE($3::uuid,config.current_version_id)
    WHERE config.id=$1 AND config.user_id=$2 AND config.deleted_at IS NULL
    LIMIT 1
  `, [input.configId, input.userId, input.versionId ?? null]);
  if (!row) throw new CanvasUserConfigError("canvas_user_config_version_not_found");
  if (row.status !== "active") throw new CanvasUserConfigError("canvas_user_config_archived");
  if (input.expectedType && row.config_type !== input.expectedType) {
    throw new CanvasUserConfigError("canvas_user_config_type_mismatch");
  }
  const manifest = validateCanvasUserConfigManifest(row.config_type, row.manifest_json);
  if (hashManifest(manifest) !== row.content_hash) {
    throw new CanvasUserConfigError("canvas_user_config_hash_mismatch");
  }
  return {
    configId: input.configId,
    versionId: row.id,
    version: Number(row.version),
    type: row.config_type,
    contentHash: row.content_hash,
    manifest,
  };
}

export function validateCanvasUserConfigManifest(type: CanvasUserConfigType, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CanvasUserConfigError("canvas_user_config_manifest_invalid");
  }
  const manifest = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  const serialized = JSON.stringify(manifest);
  if (Buffer.byteLength(serialized, "utf8") > 128 * 1024) {
    throw new CanvasUserConfigError("canvas_user_config_manifest_too_large");
  }
  validatePortableValue(manifest, "$", 1);
  if (type === "style") {
    validateOptionalString(manifest.prompt, 20_000, "canvas_user_config_style_prompt_invalid");
    validateOptionalString(manifest.negativePrompt, 20_000, "canvas_user_config_style_prompt_invalid");
  } else if (type === "skill") {
    validateOptionalString(manifest.instructions, 40_000, "canvas_user_config_skill_instructions_invalid");
    validateStringList(manifest.toolAllowlist, 100, "canvas_user_config_skill_tools_invalid");
    validateSkillControlBoundary(manifest, 1);
  } else if (type === "toolbar") {
    validateStringList(manifest.toolIds, 100, "canvas_user_config_toolbar_tools_invalid");
  } else if (type === "slash_command") {
    validatePromptDirectiveContent(manifest, "canvas_user_config_slash_command_content_invalid");
  } else if (type === "preset") {
    validatePromptDirectiveContent(manifest, "canvas_user_config_preset_content_invalid");
  } else {
    throw new CanvasUserConfigError("canvas_user_config_type_invalid");
  }
  return manifest;
}

function validateSkillControlBoundary(value: unknown, depth: number): void {
  if (!value || typeof value !== "object" || depth > 12) return;
  if (Array.isArray(value)) {
    value.forEach((item) => validateSkillControlBoundary(item, depth + 1));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:policy|policySettings|approval|approvalRequired|autoApprove|effect|agentMode|providerConfig|providerId|baseUrl|endpoint)$/i.test(key)) {
      throw new CanvasUserConfigError("canvas_user_config_skill_control_forbidden", key);
    }
    validateSkillControlBoundary(item, depth + 1);
  }
}

function validatePromptDirectiveContent(manifest: Record<string, unknown>, code: string) {
  const content = manifest.content ?? manifest.prompt ?? manifest.text ?? manifest.value;
  if (typeof content !== "string" || !content.trim() || content.length > 50_000) {
    throw new CanvasUserConfigError(code);
  }
}

function validatePortableValue(value: unknown, path: string, depth: number): void {
  if (depth > 12) throw new CanvasUserConfigError("canvas_user_config_manifest_too_deep");
  if (value == null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CanvasUserConfigError("canvas_user_config_manifest_invalid");
    return;
  }
  if (typeof value === "string") {
    if (/(?:[A-Za-z]:\\|file:\/\/|\/Users\/|\/home\/|https?:\/\/)/i.test(value)) {
      throw new CanvasUserConfigError("canvas_user_config_external_reference_forbidden", path);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 200) throw new CanvasUserConfigError("canvas_user_config_manifest_array_too_large");
    value.forEach((item, index) => validatePortableValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (typeof value !== "object") throw new CanvasUserConfigError("canvas_user_config_manifest_invalid");
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/(?:api.?key|authorization|cookie|password|secret|token)/i.test(key)) {
      throw new CanvasUserConfigError("canvas_user_config_secret_forbidden", `${path}.${key}`);
    }
    validatePortableValue(item, `${path}.${key}`, depth + 1);
  }
}

function validateOptionalString(value: unknown, maximum: number, code: string) {
  if (value === undefined) return;
  if (typeof value !== "string" || value.length > maximum) throw new CanvasUserConfigError(code);
}

function validateStringList(value: unknown, maximum: number, code: string) {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new CanvasUserConfigError(code);
  }
}

function hashManifest(manifest: Record<string, unknown>) {
  return createHash("sha256").update(stableJson(manifest)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeName(value: string) {
  const name = value.trim();
  if (!name || name.length > 120) throw new CanvasUserConfigError("canvas_user_config_name_invalid");
  return name;
}

function clampLimit(value: number | undefined) {
  const number = Number(value ?? 100);
  return Number.isSafeInteger(number) ? Math.min(200, Math.max(1, number)) : 100;
}

function configRecord(row: ConfigRow) {
  return {
    id: row.id, userId: row.user_id, type: row.config_type, name: row.name,
    status: row.status, currentVersionId: row.current_version_id,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function versionRecord(row: VersionRow) {
  return {
    id: row.id, configId: row.config_id, version: Number(row.version),
    manifest: row.manifest_json, contentHash: row.content_hash,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function translateConfigError(error: unknown) {
  if (error instanceof CanvasUserConfigError) return error;
  if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505") {
    return new CanvasUserConfigError("canvas_user_config_name_conflict");
  }
  return error;
}
