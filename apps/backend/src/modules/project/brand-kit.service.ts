import { extname } from "node:path";
import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export type BrandKitAssetType = "color" | "font" | "logo" | "image";

export interface BrandKitAssetRecord {
  id: string;
  asset_type: BrandKitAssetType;
  display_name: string;
  role: string | null;
  sort_order: number;
  text_content: string | null;
  storage_object_id: string | null;
  file_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BrandKitSummaryRecord {
  id: string;
  name: string;
  is_default: boolean;
  cover_storage_object_id: string | null;
  cover_url: string | null;
  asset_counts: Record<BrandKitAssetType, number>;
  created_at: string;
  updated_at: string;
}

export interface BrandKitDetailRecord {
  id: string;
  name: string;
  is_default: boolean;
  guidance_text: string | null;
  cover_storage_object_id: string | null;
  cover_url: string | null;
  assets: BrandKitAssetRecord[];
  created_at: string;
  updated_at: string;
}

export class BrandKitError extends Error {
  constructor(
    readonly code:
      | "invalid_brand_kit_id"
      | "invalid_brand_kit_asset_id"
      | "invalid_brand_kit_name"
      | "invalid_brand_kit_guidance"
      | "invalid_brand_kit_default"
      | "invalid_brand_kit_asset_type"
      | "invalid_brand_kit_asset_name"
      | "invalid_brand_kit_asset_role"
      | "invalid_brand_kit_asset_text"
      | "invalid_brand_kit_asset_metadata"
      | "invalid_brand_kit_asset_sort_order"
      | "invalid_brand_kit_storage_object_id"
      | "invalid_brand_kit_color"
      | "brand_kit_not_found"
      | "brand_kit_asset_not_found"
      | "brand_kit_storage_object_not_found"
      | "brand_kit_storage_object_type_invalid"
      | "brand_kit_project_not_found",
    message = code,
  ) {
    super(message);
    this.name = "BrandKitError";
  }
}

interface BrandKitRow {
  id: string;
  admin_user_id: string;
  created_by_member_id: string | null;
  name: string;
  is_default: boolean;
  guidance_text: string | null;
  cover_storage_object_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface BrandKitAssetRow {
  id: string;
  kit_id: string;
  asset_type: BrandKitAssetType;
  display_name: string;
  role: string | null;
  sort_order: number | string;
  text_content: string | null;
  storage_object_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface StorageObjectRow {
  id: string;
  content_type: string;
  object_key: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hexColorPattern = /^#[0-9A-F]{6}$/;
const assetTypes = new Set<BrandKitAssetType>(["color", "font", "logo", "image"]);
const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const fontContentTypes = new Set([
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  "application/font-sfnt",
  "application/vnd.ms-fontobject",
  "application/octet-stream",
]);
const fontExtensions = new Set([".ttf", ".otf", ".woff", ".woff2"]);

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeUuid(value: unknown, code: "invalid_brand_kit_id" | "invalid_brand_kit_asset_id" | "invalid_brand_kit_storage_object_id") {
  const id = String(value ?? "").trim();
  if (!uuidPattern.test(id)) throw new BrandKitError(code);
  return id;
}

function normalizeName(value: unknown, code: "invalid_brand_kit_name" | "invalid_brand_kit_asset_name") {
  const name = String(value ?? "").trim();
  if (!name || name.length > 100) throw new BrandKitError(code);
  return name;
}

function normalizeGuidance(value: unknown) {
  if (value === null) return null;
  const guidance = String(value ?? "").trim();
  if (guidance.length > 5_000) throw new BrandKitError("invalid_brand_kit_guidance");
  return guidance || null;
}

function normalizeRole(value: unknown) {
  if (value === null || value === undefined) return null;
  const role = String(value).trim();
  if (role.length > 100) throw new BrandKitError("invalid_brand_kit_asset_role");
  return role || null;
}

function normalizeTextContent(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text.length > 1_000) throw new BrandKitError("invalid_brand_kit_asset_text");
  return text || null;
}

function normalizeMetadata(value: unknown) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BrandKitError("invalid_brand_kit_asset_metadata");
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 20_000) throw new BrandKitError("invalid_brand_kit_asset_metadata");
  return JSON.parse(serialized) as Record<string, unknown>;
}

function normalizeAssetType(value: unknown): BrandKitAssetType {
  const type = String(value ?? "").trim() as BrandKitAssetType;
  if (!assetTypes.has(type)) throw new BrandKitError("invalid_brand_kit_asset_type");
  return type;
}

function normalizeSortOrder(value: unknown) {
  const sortOrder = Number(value);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
    throw new BrandKitError("invalid_brand_kit_asset_sort_order");
  }
  return sortOrder;
}

function assetRecord(row: BrandKitAssetRow): BrandKitAssetRecord {
  return {
    id: row.id,
    asset_type: row.asset_type,
    display_name: row.display_name,
    role: row.role,
    sort_order: Number(row.sort_order),
    text_content: row.text_content,
    storage_object_id: row.storage_object_id,
    file_url: null,
    metadata: row.metadata_json ?? {},
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

async function requireOwnedKit(db: SqlDatabase, kitId: string, adminUserId: string) {
  const row = await queryOne<BrandKitRow>(
    db,
    "SELECT * FROM creator_brand_kits WHERE id = $1 AND admin_user_id = $2",
    [kitId, adminUserId],
  );
  if (!row) throw new BrandKitError("brand_kit_not_found");
  return row;
}

async function requireOwnedStorageObject(
  db: SqlDatabase,
  input: { storageObjectId: string; adminUserId: string; assetType: BrandKitAssetType },
) {
  const object = await queryOne<StorageObjectRow>(
    db,
    `
      SELECT id, content_type, object_key
      FROM storage_objects
      WHERE id = $1
        AND created_by_user_id = $2
        AND status = 'available'
        AND deleted_at IS NULL
    `,
    [input.storageObjectId, input.adminUserId],
  );
  if (!object) throw new BrandKitError("brand_kit_storage_object_not_found");
  const contentType = object.content_type.split(";")[0]!.trim().toLowerCase();
  if ((input.assetType === "logo" || input.assetType === "image") && !imageContentTypes.has(contentType)) {
    throw new BrandKitError("brand_kit_storage_object_type_invalid");
  }
  if (
    input.assetType === "font" &&
    (!fontContentTypes.has(contentType) || !fontExtensions.has(extname(object.object_key).toLowerCase()))
  ) {
    throw new BrandKitError("brand_kit_storage_object_type_invalid");
  }
  return object;
}

async function listAssetRows(db: SqlDatabase, kitId: string) {
  const result = await db.query<BrandKitAssetRow>(
    `
      SELECT * FROM creator_brand_kit_assets
      WHERE kit_id = $1
      ORDER BY asset_type, sort_order, created_at, id
    `,
    [kitId],
  );
  return result.rows;
}

export async function listBrandKits(db: SqlDatabase, input: { adminUserId: string }) {
  const kits = await db.query<BrandKitRow>(
    `
      SELECT * FROM creator_brand_kits
      WHERE admin_user_id = $1
      ORDER BY created_at, id
    `,
    [input.adminUserId],
  );
  if (!kits.rows.length) return [];
  const assets = await db.query<{ kit_id: string; asset_type: BrandKitAssetType }>(
    `
      SELECT asset.kit_id, asset.asset_type
      FROM creator_brand_kit_assets asset
      JOIN creator_brand_kits kit ON kit.id = asset.kit_id
      WHERE kit.admin_user_id = $1
    `,
    [input.adminUserId],
  );
  const counts = new Map<string, Record<BrandKitAssetType, number>>();
  for (const asset of assets.rows) {
    const count = counts.get(asset.kit_id) ?? { color: 0, font: 0, logo: 0, image: 0 };
    count[asset.asset_type] += 1;
    counts.set(asset.kit_id, count);
  }
  return kits.rows.map((kit): BrandKitSummaryRecord => ({
    id: kit.id,
    name: kit.name,
    is_default: kit.is_default,
    cover_storage_object_id: kit.cover_storage_object_id,
    cover_url: null,
    asset_counts: counts.get(kit.id) ?? { color: 0, font: 0, logo: 0, image: 0 },
    created_at: iso(kit.created_at),
    updated_at: iso(kit.updated_at),
  }));
}

export async function getBrandKitDetail(
  db: SqlDatabase,
  input: { adminUserId: string; kitId: unknown },
): Promise<BrandKitDetailRecord> {
  const kitId = normalizeUuid(input.kitId, "invalid_brand_kit_id");
  const kit = await requireOwnedKit(db, kitId, input.adminUserId);
  const assets = await listAssetRows(db, kitId);
  return {
    id: kit.id,
    name: kit.name,
    is_default: kit.is_default,
    guidance_text: kit.guidance_text,
    cover_storage_object_id: kit.cover_storage_object_id,
    cover_url: null,
    assets: assets.map(assetRecord),
    created_at: iso(kit.created_at),
    updated_at: iso(kit.updated_at),
  };
}

export async function createBrandKit(
  db: SqlDatabase,
  input: { adminUserId: string; createdByMemberId?: string | null; name?: unknown },
) {
  const name = input.name === undefined ? "未命名" : normalizeName(input.name, "invalid_brand_kit_name");
  const id = randomUUID();
  await db.query(
    `
      INSERT INTO creator_brand_kits (id, admin_user_id, created_by_member_id, name)
      VALUES ($1, $2, $3, $4)
    `,
    [id, input.adminUserId, input.createdByMemberId ?? null, name],
  );
  return getBrandKitDetail(db, { adminUserId: input.adminUserId, kitId: id });
}

export async function updateBrandKit(
  db: SqlDatabase,
  input: {
    adminUserId: string;
    kitId: unknown;
    name?: unknown;
    guidanceText?: unknown;
    isDefault?: unknown;
  },
) {
  const kitId = normalizeUuid(input.kitId, "invalid_brand_kit_id");
  await requireOwnedKit(db, kitId, input.adminUserId);
  const name = input.name === undefined ? null : normalizeName(input.name, "invalid_brand_kit_name");
  const guidanceText = input.guidanceText === undefined ? undefined : normalizeGuidance(input.guidanceText);
  if (input.isDefault !== undefined && typeof input.isDefault !== "boolean") {
    throw new BrandKitError("invalid_brand_kit_default");
  }
  const isDefault = input.isDefault === undefined ? null : input.isDefault;
  if (name === null && guidanceText === undefined && isDefault === null) {
    return getBrandKitDetail(db, { adminUserId: input.adminUserId, kitId });
  }
  await db.query("BEGIN");
  try {
    if (isDefault === true) {
      await db.query("UPDATE creator_brand_kits SET is_default = false, updated_at = now() WHERE admin_user_id = $1 AND is_default = true", [input.adminUserId]);
    }
    await db.query(
      `
        UPDATE creator_brand_kits
        SET name = COALESCE($3, name),
            guidance_text = CASE WHEN $4::boolean THEN $5 ELSE guidance_text END,
            is_default = COALESCE($6, is_default),
            updated_at = now()
        WHERE id = $1 AND admin_user_id = $2
      `,
      [kitId, input.adminUserId, name, guidanceText !== undefined, guidanceText ?? null, isDefault],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
  return getBrandKitDetail(db, { adminUserId: input.adminUserId, kitId });
}

export async function deleteBrandKit(db: SqlDatabase, input: { adminUserId: string; kitId: unknown }) {
  const kitId = normalizeUuid(input.kitId, "invalid_brand_kit_id");
  const row = await queryOne<{ id: string }>(
    db,
    "DELETE FROM creator_brand_kits WHERE id = $1 AND admin_user_id = $2 RETURNING id",
    [kitId, input.adminUserId],
  );
  if (!row) throw new BrandKitError("brand_kit_not_found");
}

export async function duplicateBrandKit(db: SqlDatabase, input: { adminUserId: string; createdByMemberId?: string | null; kitId: unknown }) {
  const kitId = normalizeUuid(input.kitId, "invalid_brand_kit_id");
  const source = await requireOwnedKit(db, kitId, input.adminUserId);
  const sourceAssets = await listAssetRows(db, kitId);
  const newKitId = randomUUID();
  await db.query("BEGIN");
  try {
    await db.query(
      `
        INSERT INTO creator_brand_kits
          (id, admin_user_id, created_by_member_id, name, is_default, guidance_text, cover_storage_object_id)
        VALUES ($1, $2, $3, $4, false, $5, $6)
      `,
      [
        newKitId,
        input.adminUserId,
        input.createdByMemberId ?? null,
        `${source.name.slice(0, 100 - " (副本)".length)} (副本)`,
        source.guidance_text,
        source.cover_storage_object_id,
      ],
    );
    for (const asset of sourceAssets) {
      await db.query(
        `
          INSERT INTO creator_brand_kit_assets
            (id, kit_id, asset_type, display_name, role, sort_order, text_content, storage_object_id, metadata_json)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        `,
        [randomUUID(), newKitId, asset.asset_type, asset.display_name, asset.role, Number(asset.sort_order), asset.text_content, asset.storage_object_id, JSON.stringify(asset.metadata_json ?? {})],
      );
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
  return getBrandKitDetail(db, { adminUserId: input.adminUserId, kitId: newKitId });
}

export async function createBrandKitAsset(
  db: SqlDatabase,
  input: {
    adminUserId: string;
    kitId: unknown;
    assetType: unknown;
    displayName: unknown;
    role?: unknown;
    textContent?: unknown;
    storageObjectId?: unknown;
    metadata?: unknown;
  },
) {
  const kitId = normalizeUuid(input.kitId, "invalid_brand_kit_id");
  await requireOwnedKit(db, kitId, input.adminUserId);
  const assetType = normalizeAssetType(input.assetType);
  const displayName = normalizeName(input.displayName, "invalid_brand_kit_asset_name");
  const role = normalizeRole(input.role);
  const textContent = normalizeTextContent(input.textContent);
  const metadata = normalizeMetadata(input.metadata);
  const storageObjectId = input.storageObjectId === null || input.storageObjectId === undefined || String(input.storageObjectId).trim() === ""
    ? null
    : normalizeUuid(input.storageObjectId, "invalid_brand_kit_storage_object_id");
  if (assetType === "color" && (!textContent || !hexColorPattern.test(textContent.toUpperCase()))) {
    throw new BrandKitError("invalid_brand_kit_color");
  }
  if (assetType === "font" && !textContent && !storageObjectId) {
    throw new BrandKitError("invalid_brand_kit_asset_text");
  }
  if ((assetType === "logo" || assetType === "image") && !storageObjectId) {
    throw new BrandKitError("invalid_brand_kit_storage_object_id");
  }
  if (storageObjectId) {
    if (assetType === "color") throw new BrandKitError("brand_kit_storage_object_type_invalid");
    await requireOwnedStorageObject(db, { storageObjectId, adminUserId: input.adminUserId, assetType });
  }
  const max = await queryOne<{ sort_order: number | string }>(
    db,
    "SELECT sort_order FROM creator_brand_kit_assets WHERE kit_id = $1 AND asset_type = $2 ORDER BY sort_order DESC LIMIT 1",
    [kitId, assetType],
  );
  const id = randomUUID();
  const row = await queryOne<BrandKitAssetRow>(
    db,
    `
      INSERT INTO creator_brand_kit_assets
        (id, kit_id, asset_type, display_name, role, sort_order, text_content, storage_object_id, metadata_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING *
    `,
    [id, kitId, assetType, displayName, role, Number(max?.sort_order ?? -1) + 1, assetType === "color" ? textContent!.toUpperCase() : textContent, storageObjectId, JSON.stringify(metadata)],
  );
  return assetRecord(row!);
}

export async function updateBrandKitAsset(
  db: SqlDatabase,
  input: {
    adminUserId: string;
    kitId: unknown;
    assetId: unknown;
    displayName?: unknown;
    role?: unknown;
    sortOrder?: unknown;
    textContent?: unknown;
    metadata?: unknown;
  },
) {
  const kitId = normalizeUuid(input.kitId, "invalid_brand_kit_id");
  const assetId = normalizeUuid(input.assetId, "invalid_brand_kit_asset_id");
  await requireOwnedKit(db, kitId, input.adminUserId);
  const current = await queryOne<BrandKitAssetRow>(db, "SELECT * FROM creator_brand_kit_assets WHERE id = $1 AND kit_id = $2", [assetId, kitId]);
  if (!current) throw new BrandKitError("brand_kit_asset_not_found");
  const displayName = input.displayName === undefined ? current.display_name : normalizeName(input.displayName, "invalid_brand_kit_asset_name");
  const role = input.role === undefined ? current.role : normalizeRole(input.role);
  const sortOrder = input.sortOrder === undefined ? Number(current.sort_order) : normalizeSortOrder(input.sortOrder);
  const textContent = input.textContent === undefined ? current.text_content : normalizeTextContent(input.textContent);
  const metadata = input.metadata === undefined ? current.metadata_json : normalizeMetadata(input.metadata);
  if (current.asset_type === "color" && (!textContent || !hexColorPattern.test(textContent.toUpperCase()))) {
    throw new BrandKitError("invalid_brand_kit_color");
  }
  if (current.asset_type === "font" && !textContent && !current.storage_object_id) {
    throw new BrandKitError("invalid_brand_kit_asset_text");
  }
  const row = await queryOne<BrandKitAssetRow>(
    db,
    `
      UPDATE creator_brand_kit_assets
      SET display_name = $3, role = $4, sort_order = $5, text_content = $6,
          metadata_json = $7::jsonb, updated_at = now()
      WHERE id = $1 AND kit_id = $2
      RETURNING *
    `,
    [assetId, kitId, displayName, role, sortOrder, current.asset_type === "color" ? textContent!.toUpperCase() : textContent, JSON.stringify(metadata)],
  );
  return assetRecord(row!);
}

export async function deleteBrandKitAsset(db: SqlDatabase, input: { adminUserId: string; kitId: unknown; assetId: unknown }) {
  const kitId = normalizeUuid(input.kitId, "invalid_brand_kit_id");
  const assetId = normalizeUuid(input.assetId, "invalid_brand_kit_asset_id");
  await requireOwnedKit(db, kitId, input.adminUserId);
  const row = await queryOne<{ id: string }>(
    db,
    "DELETE FROM creator_brand_kit_assets WHERE id = $1 AND kit_id = $2 RETURNING id",
    [assetId, kitId],
  );
  if (!row) throw new BrandKitError("brand_kit_asset_not_found");
}

export async function getProjectBrandKitSelection(db: SqlDatabase, input: { adminUserId: string; projectId: string }) {
  const project = await queryOne<{ brand_kit_id: string | null }>(
    db,
    "SELECT brand_kit_id FROM projects WHERE id = $1 AND owner_user_id = $2",
    [input.projectId, input.adminUserId],
  );
  if (!project) throw new BrandKitError("brand_kit_project_not_found");
  return project.brand_kit_id;
}

export async function setProjectBrandKitSelection(
  db: SqlDatabase,
  input: { adminUserId: string; projectId: string; brandKitId: unknown },
) {
  const brandKitId = input.brandKitId === null || input.brandKitId === undefined || String(input.brandKitId).trim() === ""
    ? null
    : normalizeUuid(input.brandKitId, "invalid_brand_kit_id");
  const project = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM projects WHERE id = $1 AND owner_user_id = $2",
    [input.projectId, input.adminUserId],
  );
  if (!project) throw new BrandKitError("brand_kit_project_not_found");
  if (brandKitId) await requireOwnedKit(db, brandKitId, input.adminUserId);
  await db.query("UPDATE projects SET brand_kit_id = $3, updated_at = now() WHERE id = $1 AND owner_user_id = $2", [input.projectId, input.adminUserId, brandKitId]);
  return brandKitId;
}
