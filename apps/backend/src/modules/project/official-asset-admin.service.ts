import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  type LibraryAssetCategory,
  type LibraryAssetScope,
  type ListedLibraryAsset,
  withOfficialCharacterDetailViewItems,
} from "./asset-library.service.ts";

type OfficialAssetCategory = Extract<LibraryAssetCategory, "character" | "scene" | "prop">;
type OfficialAssetStatus = "active" | "archived";

interface OfficialAssetRow {
  id: string;
  scope: LibraryAssetScope;
  organization_id: string | null;
  workspace_id: string | null;
  created_by_user_id: string | null;
  asset_type: LibraryAssetCategory;
  category: LibraryAssetCategory;
  folder: string;
  name: string;
  description: string | null;
  tags_json: string[] | string;
  status: OfficialAssetStatus;
  requires_pro_entitlement: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  version_id: string;
  version_number: number | string;
  storage_object_key: string;
  preview_url: string | null;
  mime_type: string;
  width: number | string;
  height: number | string;
  metadata_json: Record<string, unknown> | string;
  version_created_at: Date | string;
}

export interface OfficialAssetDetailViewInput {
  key?: unknown;
  label?: unknown;
  imageUrl?: unknown;
  thumbnailUrl?: unknown;
  sortOrder?: unknown;
  isDefault?: unknown;
}

export interface OfficialAssetDisplayInput {
  kicker?: unknown;
  title?: unknown;
  description?: unknown;
  metaRows?: unknown;
}

export interface OfficialAssetSaveBody {
  id?: unknown;
  category?: unknown;
  folder?: unknown;
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  previewUrl?: unknown;
  storageObjectKey?: unknown;
  mimeType?: unknown;
  width?: unknown;
  height?: unknown;
  sortOrder?: unknown;
  display?: OfficialAssetDisplayInput;
  detailViewItems?: unknown;
}

export class OfficialAssetAdminValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createOfficialAssetAdminService(deps: { db: SqlDatabase }) {
  async function listAssets(input: {
    category?: unknown;
    folder?: unknown;
    status?: unknown;
    query?: unknown;
  } = {}) {
    const params: unknown[] = [];
    const conditions = ["la.scope = 'official'"];

    const status = normalizeStatusFilter(input.status);
    if (status !== "all") {
      params.push(status);
      conditions.push(`la.status = $${params.length}`);
    }

    const category = optionalOfficialCategory(input.category);
    if (category) {
      params.push(category);
      conditions.push(`la.category = $${params.length}`);
    }

    const folder = optionalTrimmedString(input.folder);
    if (folder) {
      params.push(folder);
      conditions.push(`la.folder = $${params.length}`);
    }

    const query = optionalTrimmedString(input.query);
    if (query) {
      params.push(`%${query.toLowerCase()}%`);
      conditions.push(`(
        LOWER(la.name) LIKE $${params.length}
        OR LOWER(COALESCE(la.description, '')) LIKE $${params.length}
        OR LOWER(la.tags_json::text) LIKE $${params.length}
      )`);
    }

    const rows = await deps.db.query<OfficialAssetRow>(
      `
        ${officialAssetSelectSql()}
        WHERE ${conditions.join(" AND ")}
        ORDER BY la.updated_at DESC, la.name ASC
      `,
      params,
    );

    const assets = rows.rows.map(officialAssetFromRow).sort(compareOfficialAssetAdminOrder);

    return {
      data: assets,
      meta: { total: assets.length },
    };
  }

  async function saveAsset(input: {
    assetId?: unknown;
    body: OfficialAssetSaveBody;
    now: Date;
  }) {
    const existing = input.assetId ? await findAsset(input.assetId) : null;
    const body = input.body ?? {};
    const category = normalizeOfficialCategory(body.category ?? existing?.category);
    const folder = normalizeRequiredString(body.folder ?? existing?.folder, "official_asset_folder_required");
    const name = normalizeRequiredString(body.name ?? existing?.name, "official_asset_name_required");
    const description = hasOwn(body, "description")
      ? nullableTrimmedString(body.description)
      : existing?.description ?? null;
    const previewUrl = normalizeRequiredString(
      body.previewUrl ?? existing?.latestVersion.previewUrl,
      "official_asset_preview_url_required",
    );
    const storageObjectKey = normalizeRequiredString(
      optionalTrimmedString(body.storageObjectKey) ??
        existing?.latestVersion.storageObjectKey ??
        storageKeyFromPreviewUrl(previewUrl),
      "official_asset_storage_key_required",
    );
    const width = positiveInteger(body.width, existing?.latestVersion.width ?? 1);
    const height = positiveInteger(body.height, existing?.latestVersion.height ?? 1);
    const mimeType = optionalTrimmedString(body.mimeType) ?? existing?.latestVersion.mimeType ?? mimeTypeFromUrl(previewUrl);
    const existingMetadata = existing?.latestVersion.metadata ?? {};
    const metadata = buildAdminMetadata({
      category,
      name,
      description,
      previewUrl,
      existingMetadata,
      display: body.display,
      detailViewItems: body.detailViewItems,
      sortOrder: body.sortOrder,
    });
    const assetId = existing?.id ?? optionalUuid(body.id) ?? randomUUID();
    const versionNumber = existing ? existing.latestVersion.versionNumber + 1 : 1;

    await deps.db.query("BEGIN");
    try {
      if (existing) {
        await deps.db.query(
          `
            UPDATE library_assets
            SET asset_type = $2,
                category = $3,
                folder = $4,
                name = $5,
                description = $6,
                tags_json = $7::jsonb,
                status = $8,
                requires_pro_entitlement = false,
                updated_at = $9
            WHERE id = $1
              AND scope = 'official'
          `,
          [
            assetId,
            category,
            category,
            folder,
            name,
            description,
            JSON.stringify(normalizeTags(body.tags, existing.tags)),
            existing.status,
            input.now,
          ],
        );
      } else {
        await deps.db.query(
          `
            INSERT INTO library_assets (
              id,
              scope,
              organization_id,
              workspace_id,
              created_by_user_id,
              asset_type,
              category,
              folder,
              name,
              description,
              tags_json,
              status,
              requires_pro_entitlement,
              created_at,
              updated_at
            )
            VALUES ($1, 'official', NULL, NULL, NULL, $2, $3, $4, $5, $6, $7::jsonb, 'active', false, $8, $8)
          `,
          [
            assetId,
            category,
            category,
            folder,
            name,
            description,
            JSON.stringify(normalizeTags(body.tags)),
            input.now,
          ],
        );
      }

      await deps.db.query(
        `
          INSERT INTO library_asset_versions (
            id,
            library_asset_id,
            version_number,
            storage_object_key,
            preview_url,
            mime_type,
            width,
            height,
            metadata_json,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
        `,
        [
          randomUUID(),
          assetId,
          versionNumber,
          storageObjectKey,
          previewUrl,
          mimeType,
          width,
          height,
          JSON.stringify(metadata),
          input.now,
        ],
      );
      await deps.db.query("COMMIT");
    } catch (error) {
      await deps.db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    return { data: await requireAsset(assetId) };
  }

  async function archiveAsset(input: { assetId: unknown; now: Date }) {
    return changeStatus({ assetId: input.assetId, status: "archived", now: input.now });
  }

  async function restoreAsset(input: { assetId: unknown; now: Date }) {
    return changeStatus({ assetId: input.assetId, status: "active", now: input.now });
  }

  async function changeStatus(input: { assetId: unknown; status: OfficialAssetStatus; now: Date }) {
    const assetId = normalizeRequiredString(input.assetId, "official_asset_id_required");
    await deps.db.query(
      `
        UPDATE library_assets
        SET status = $2,
            updated_at = $3
        WHERE id = $1
          AND scope = 'official'
      `,
      [assetId, input.status, input.now],
    );
    return { data: await requireAsset(assetId) };
  }

  async function requireAsset(assetId: unknown) {
    const asset = await findAsset(assetId);
    if (!asset) {
      throw new OfficialAssetAdminValidationError("official_asset_not_found", "官方资产不存在");
    }
    return asset;
  }

  async function findAsset(assetId: unknown): Promise<ListedLibraryAsset | null> {
    const id = normalizeRequiredString(assetId, "official_asset_id_required");
    const row = await queryOne<OfficialAssetRow>(
      deps.db,
      `
        ${officialAssetSelectSql()}
        WHERE la.scope = 'official'
          AND la.id = $1
        LIMIT 1
      `,
      [id],
    );

    return row ? officialAssetFromRow(row) : null;
  }

  return {
    listAssets,
    saveAsset,
    archiveAsset,
    restoreAsset,
    getAsset: requireAsset,
  };
}

function officialAssetSelectSql() {
  return `
    SELECT
      la.*,
      lav.id AS version_id,
      lav.version_number,
      lav.storage_object_key,
      lav.preview_url,
      lav.mime_type,
      lav.width,
      lav.height,
      lav.metadata_json,
      lav.created_at AS version_created_at
    FROM library_assets la
    JOIN LATERAL (
      SELECT *
      FROM library_asset_versions
      WHERE library_asset_id = la.id
      ORDER BY version_number DESC
      LIMIT 1
    ) lav ON true
  `;
}

function officialAssetFromRow(row: OfficialAssetRow): ListedLibraryAsset {
  const metadata = withOfficialCharacterDetailViewItems(
    normalizeJsonObject(row.metadata_json),
    {
      scope: row.scope,
      category: row.category,
      previewUrl: row.preview_url,
      name: row.name,
    },
  );
  const latestVersion = {
    id: row.version_id,
    libraryAssetId: row.id,
    versionNumber: Number(row.version_number),
    storageObjectKey: row.storage_object_key,
    previewUrl: row.preview_url,
    mimeType: row.mime_type,
    width: Number(row.width),
    height: Number(row.height),
    metadata,
    createdAt: new Date(row.version_created_at),
  };

  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    assetType: row.asset_type,
    category: row.category,
    folder: row.folder,
    name: row.name,
    description: row.description,
    tags: normalizeJsonArray(row.tags_json),
    status: row.status,
    requiresProEntitlement: row.requires_pro_entitlement,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    previewUrl: row.preview_url,
    latestVersion,
  };
}

function compareOfficialAssetAdminOrder(left: ListedLibraryAsset, right: ListedLibraryAsset) {
  return officialAssetSortOrder(left) - officialAssetSortOrder(right) ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id);
}

function officialAssetSortOrder(asset: ListedLibraryAsset) {
  return numberOr(asset.latestVersion.metadata.sortOrder, 100);
}

function buildAdminMetadata(input: {
  category: OfficialAssetCategory;
  name: string;
  description: string | null;
  previewUrl: string;
  existingMetadata: Record<string, unknown>;
  display?: OfficialAssetDisplayInput;
  detailViewItems?: unknown;
  sortOrder?: unknown;
}) {
  const previousDisplay =
    input.existingMetadata.display &&
    typeof input.existingMetadata.display === "object" &&
    !Array.isArray(input.existingMetadata.display)
      ? input.existingMetadata.display as Record<string, unknown>
      : {};
  const detailViewItems = normalizeDetailViewItems(
    input.detailViewItems,
    input.existingMetadata,
    input.category,
    input.previewUrl,
  );
  const displayInput = input.display && typeof input.display === "object" && !Array.isArray(input.display)
    ? input.display
    : null;
  return {
    ...input.existingMetadata,
    managedBy: "admin",
    sortOrder: numberOr(input.sortOrder, numberOr(input.existingMetadata.sortOrder, 100)),
    display: {
      kicker: hasOwn(displayInput, "kicker")
        ? trimmedString(displayInput?.kicker)
        : optionalTrimmedString(previousDisplay.kicker) ?? "万兴剧厂公共资产",
      title: hasOwn(displayInput, "title")
        ? trimmedString(displayInput?.title)
        : optionalTrimmedString(previousDisplay.title) ?? input.name,
      description:
        hasOwn(displayInput, "description")
          ? trimmedString(displayInput?.description)
          : optionalTrimmedString(previousDisplay.description) ??
            input.description ??
            `${input.name}官方参考资产`,
      metaRows: normalizeMetaRows(hasOwn(displayInput, "metaRows") ? displayInput?.metaRows : previousDisplay.metaRows),
    },
    detailViewItems,
    detailViews: Object.fromEntries(detailViewItems.map((item) => [item.key, item.imageUrl])),
  };
}

function normalizeDetailViewItems(
  raw: unknown,
  existingMetadata: Record<string, unknown>,
  category: OfficialAssetCategory,
  previewUrl: string,
) {
  const hasExplicitItems = Array.isArray(raw);
  const source = hasExplicitItems
    ? raw
    : Array.isArray(existingMetadata.detailViewItems)
      ? existingMetadata.detailViewItems
      : [];
  const items = source
    .map((item, index) => normalizeDetailViewItem(item, index))
    .filter((item): item is ReturnType<typeof normalizeDetailViewItem> & { key: string; label: string; imageUrl: string } =>
      Boolean(item?.key && item.label && item.imageUrl),
    )
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));

  if (items.length > 0) {
    return ensureOneDefault(items);
  }

  if (hasExplicitItems) {
    return [];
  }

  const existingViews =
    existingMetadata.detailViews &&
    typeof existingMetadata.detailViews === "object" &&
    !Array.isArray(existingMetadata.detailViews)
      ? existingMetadata.detailViews as Record<string, unknown>
      : {};
  const fromViews = Object.entries(existingViews)
    .map(([key, imageUrl], index) =>
      normalizeDetailViewItem({
        key,
        label: defaultViewLabel(key, category),
        imageUrl,
        sortOrder: (index + 1) * 10,
        isDefault: index === 0,
      }, index),
    )
    .filter((item): item is ReturnType<typeof normalizeDetailViewItem> & { key: string; label: string; imageUrl: string } =>
      Boolean(item?.key && item.label && item.imageUrl),
    );

  if (fromViews.length > 0) {
    return ensureOneDefault(fromViews);
  }

  return [{
    key: "main",
    label: `${categoryLabel(category)}主图`,
    imageUrl: previewUrl,
    thumbnailUrl: null,
    sortOrder: 10,
    isDefault: true,
  }];
}

function normalizeDetailViewItem(item: unknown, index: number) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const record = item as Record<string, unknown>;
  return {
    key: normalizeKey(record.key),
    label: optionalTrimmedString(record.label) ?? "",
    imageUrl: optionalTrimmedString(record.imageUrl) ?? "",
    thumbnailUrl: optionalTrimmedString(record.thumbnailUrl) ?? null,
    sortOrder: numberOr(record.sortOrder, (index + 1) * 10),
    isDefault: Boolean(record.isDefault),
  };
}

function ensureOneDefault<T extends { isDefault: boolean; sortOrder: number }>(items: T[]) {
  if (items.some((item) => item.isDefault)) {
    return items;
  }
  return items.map((item, index) => ({
    ...item,
    isDefault: index === 0,
  }));
}

function normalizeMetaRows(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const label = optionalTrimmedString(record.label);
      const value = optionalTrimmedString(record.value);
      return label && value ? { label, value } : null;
    })
    .filter(Boolean);
}

function normalizeOfficialCategory(value: unknown): OfficialAssetCategory {
  const category = optionalOfficialCategory(value);
  if (!category) {
    throw new OfficialAssetAdminValidationError("official_asset_category_required", "官方资产分类不能为空");
  }
  return category;
}

function optionalOfficialCategory(value: unknown): OfficialAssetCategory | null {
  const category = optionalTrimmedString(value);
  if (!category) {
    return null;
  }
  if (category === "character" || category === "scene" || category === "prop") {
    return category;
  }
  throw new OfficialAssetAdminValidationError("official_asset_category_invalid", "官方资产分类仅支持角色、场景、道具");
}

function normalizeStatusFilter(value: unknown): OfficialAssetStatus | "all" {
  const status = optionalTrimmedString(value) ?? "active";
  if (status === "active" || status === "archived" || status === "all") {
    return status;
  }
  throw new OfficialAssetAdminValidationError("official_asset_status_invalid", "官方资产状态不正确");
}

function normalizeTags(raw: unknown, fallback: string[] = []) {
  if (raw === undefined) {
    return fallback;
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => optionalTrimmedString(item)).filter((item): item is string => Boolean(item));
}

function normalizeJsonObject(value: Record<string, unknown> | string) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function normalizeJsonArray(value: string[] | string) {
  return Array.isArray(value) ? value : (JSON.parse(value) as string[]);
}

function normalizeRequiredString(value: unknown, code: string) {
  const normalized = optionalTrimmedString(value);
  if (!normalized) {
    throw new OfficialAssetAdminValidationError(code, "官方资产必填字段不能为空");
  }
  return normalized;
}

function optionalTrimmedString(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function trimmedString(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function nullableTrimmedString(value: unknown) {
  const normalized = trimmedString(value);
  return normalized ? normalized : null;
}

function hasOwn(record: object | null | undefined, key: string) {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, key));
}

function optionalUuid(value: unknown) {
  const id = optionalTrimmedString(value);
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function normalizeKey(value: unknown) {
  return (optionalTrimmedString(value) ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function positiveInteger(value: unknown, fallback: number) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback;
}

function numberOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function storageKeyFromPreviewUrl(previewUrl: string) {
  return previewUrl.replace(/^\/uploads\//, "");
}

function mimeTypeFromUrl(previewUrl: string) {
  if (/\.webp(?:[?#].*)?$/i.test(previewUrl)) {
    return "image/webp";
  }
  if (/\.jpe?g(?:[?#].*)?$/i.test(previewUrl)) {
    return "image/jpeg";
  }
  if (/\.svg(?:[?#].*)?$/i.test(previewUrl)) {
    return "image/svg+xml";
  }
  return "image/png";
}

function categoryLabel(category: OfficialAssetCategory) {
  return category === "scene" ? "场景" : category === "prop" ? "道具" : "角色";
}

function defaultViewLabel(key: string, category: OfficialAssetCategory) {
  const labels: Record<string, string> = {
    turnaround: "方位图",
    front: "正面",
    side: "侧面",
    back: "背面",
    fullBody: "远景全身",
    "full-body": "远景全身",
    main: `${categoryLabel(category)}主图`,
  };
  return labels[key] ?? key;
}
