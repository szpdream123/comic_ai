import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export const promptMarketplaceCategories = [
  "script",
  "shot",
  "scene_extract",
  "character_extract",
  "prop_extract",
  "image_style",
  "storyboard",
  "other",
] as const;

type PromptMarketplaceCategory = (typeof promptMarketplaceCategories)[number];

interface PromptMarketplaceRow {
  id: string;
  owner_user_id: string | null;
  prompt_category: PromptMarketplaceCategory;
  name: string;
  summary: string;
  prompt_content: string | null;
  cover_image_url: string | null;
  cover_storage_object_id: string | null;
  price_credits: number | string;
  status: string;
  is_published: boolean;
  is_official: boolean;
  usage_count: number | string;
  rating_score: number | string;
  rating_count: number | string;
  published_at: Date | string | null;
  updated_at: Date | string;
  publisher_name?: string | null;
  purchase_id?: string | null;
  purchase_status?: string | null;
  user_relation_type?: string | null;
  user_rating?: number | string | null;
  is_default?: boolean;
}

interface PromptSkillListRow {
  id: string;
  prompt_category: PromptMarketplaceCategory;
  name: string;
  summary: string;
  cover_image_url: string | null;
  cover_storage_object_id: string | null;
  price_credits: number | string;
  is_official: boolean;
  usage_count: number | string;
  rating_score: number | string;
  rating_count: number | string;
  published_at: Date | string | null;
  updated_at: Date | string;
  user_relation_type?: string | null;
  is_default?: boolean;
}

interface PromptSkillCategoryCountRow {
  prompt_category: PromptMarketplaceCategory;
  count: number | string;
}

export class PromptMarketplaceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createPromptMarketplaceService(deps: { db: SqlDatabase }) {
  async function listCatalog(input: {
    userId: string | null;
    category?: string | null;
    query?: string | null;
    page?: number;
    pageSize?: number;
  }) {
    const category = normalizeCategoryFilter(input.category);
    const keyword = input.query?.trim() ? `%${input.query.trim().toLowerCase()}%` : null;
    const requestedPage = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const total = await queryOne<{ count: string | number }>(
      deps.db,
      `
        SELECT COUNT(*) AS count
        FROM prompts item
        WHERE item.deleted_at IS NULL
          AND item.status = 'enabled'
          AND item.is_published = true
          AND ($1::text IS NULL OR item.prompt_category = $1)
          AND (
            $2::text IS NULL
            OR lower(item.name) LIKE $2
            OR lower(item.summary) LIKE $2
          )
      `,
      [category, keyword],
    );
    const count = Number(total?.count || 0);
    const totalPages = Math.ceil(count / pageSize);
    const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const rows = await deps.db.query<PromptMarketplaceRow>(
      `
        SELECT
          item.id,
          item.prompt_category,
          item.name,
          item.summary,
          CASE
            WHEN $1::uuid IS NOT NULL AND owner_link.user_id = $1 THEN item.prompt_content
            ELSE NULL
          END AS prompt_content,
          item.cover_image_url,
          item.cover_storage_object_id,
          item.price_credits,
          item.status,
          item.is_published,
          item.is_official,
          item.usage_count,
          item.rating_score,
          item.rating_count,
          item.published_at,
          item.updated_at,
          EXISTS (
            SELECT 1 FROM prompt_official_defaults prompt_default
            WHERE prompt_default.prompt_category = item.prompt_category
              AND prompt_default.prompt_id = item.id
          ) AS is_default,
          owner.display_name AS publisher_name,
          owner_link.user_id AS owner_user_id,
          user_link.id AS purchase_id,
          user_link.status AS purchase_status,
          user_link.relation_type AS user_relation_type,
          user_rating.rating AS user_rating
        FROM prompts item
        LEFT JOIN prompt_user_links owner_link
          ON owner_link.prompt_id = item.id
          AND owner_link.relation_type = 'owner'
          AND owner_link.status = 'active'
        LEFT JOIN users owner ON owner.id = owner_link.user_id
        LEFT JOIN LATERAL (
          SELECT id, status, relation_type
          FROM prompt_user_links
          WHERE prompt_id = item.id
            AND user_id = $1
            AND status = 'active'
          ORDER BY added_at DESC
          LIMIT 1
        ) user_link ON true
        LEFT JOIN prompt_ratings user_rating
          ON user_rating.prompt_id = item.id
          AND user_rating.user_id = $1
        WHERE item.deleted_at IS NULL
          AND item.status = 'enabled'
          AND item.is_published = true
          AND ($2::text IS NULL OR item.prompt_category = $2)
          AND (
            $3::text IS NULL
            OR lower(item.name) LIKE $3
            OR lower(item.summary) LIKE $3
          )
        ORDER BY item.is_official DESC, item.usage_count DESC, item.rating_count DESC, item.published_at DESC, item.id ASC
        LIMIT $4
        OFFSET $5
      `,
      [input.userId, category, keyword, pageSize, offset],
    );
    const rankingRows = await deps.db.query<PromptMarketplaceRow>(
      `
        SELECT
          item.id,
          item.prompt_category,
          item.name,
          item.summary,
          CASE
            WHEN $1::uuid IS NOT NULL AND owner_link.user_id = $1 THEN item.prompt_content
            ELSE NULL
          END AS prompt_content,
          item.cover_image_url,
          item.cover_storage_object_id,
          item.price_credits,
          item.status,
          item.is_published,
          item.is_official,
          item.usage_count,
          item.rating_score,
          item.rating_count,
          item.published_at,
          item.updated_at,
          EXISTS (
            SELECT 1 FROM prompt_official_defaults prompt_default
            WHERE prompt_default.prompt_category = item.prompt_category
              AND prompt_default.prompt_id = item.id
          ) AS is_default,
          owner.display_name AS publisher_name,
          owner_link.user_id AS owner_user_id,
          user_link.id AS purchase_id,
          user_link.status AS purchase_status,
          user_link.relation_type AS user_relation_type,
          user_rating.rating AS user_rating
        FROM prompts item
        LEFT JOIN prompt_user_links owner_link
          ON owner_link.prompt_id = item.id
          AND owner_link.relation_type = 'owner'
          AND owner_link.status = 'active'
        LEFT JOIN users owner ON owner.id = owner_link.user_id
        LEFT JOIN LATERAL (
          SELECT id, status, relation_type
          FROM prompt_user_links
          WHERE prompt_id = item.id
            AND user_id = $1
            AND status = 'active'
          ORDER BY added_at DESC
          LIMIT 1
        ) user_link ON true
        LEFT JOIN prompt_ratings user_rating
          ON user_rating.prompt_id = item.id
          AND user_rating.user_id = $1
        WHERE item.deleted_at IS NULL
          AND item.status = 'enabled'
          AND item.is_published = true
        ORDER BY item.usage_count DESC, item.rating_score DESC, item.rating_count DESC, item.id ASC
        LIMIT 20
      `,
      [input.userId],
    );
    return {
      items: rows.rows.map((row) => marketplaceItemFromRow(row, input.userId)),
      pagination: {
        page,
        pageSize,
        total: count,
        totalPages,
      },
      ranking: rankingRows.rows.map((row) => marketplaceItemFromRow(row, input.userId)),
    };
  }

  async function listLibrary(input: { userId: string }) {
    const rows = await deps.db.query<PromptMarketplaceRow>(
      `
        SELECT
          item.id,
          item.prompt_category,
          item.name,
          item.summary,
          CASE WHEN user_link.relation_type = 'owner' THEN item.prompt_content ELSE NULL END AS prompt_content,
          item.cover_image_url,
          item.cover_storage_object_id,
          item.price_credits,
          item.status,
          item.is_published,
          item.is_official,
          item.usage_count,
          item.rating_score,
          item.rating_count,
          item.published_at,
          item.updated_at,
          EXISTS (
            SELECT 1 FROM prompt_user_defaults prompt_default
            WHERE prompt_default.user_id = $1
              AND prompt_default.prompt_category = item.prompt_category
              AND prompt_default.prompt_id = item.id
          ) AS is_default,
          owner.display_name AS publisher_name,
          owner_link.user_id AS owner_user_id,
          user_link.id AS purchase_id,
          user_link.status AS purchase_status,
          user_link.relation_type AS user_relation_type,
          user_rating.rating AS user_rating
        FROM prompts item
        JOIN prompt_user_links user_link
          ON user_link.prompt_id = item.id
          AND user_link.user_id = $1
          AND user_link.status = 'active'
        LEFT JOIN prompt_user_links owner_link
          ON owner_link.prompt_id = item.id
          AND owner_link.relation_type = 'owner'
          AND owner_link.status = 'active'
        LEFT JOIN users owner ON owner.id = owner_link.user_id
        LEFT JOIN prompt_ratings user_rating
          ON user_rating.prompt_id = item.id
          AND user_rating.user_id = $1
        WHERE item.deleted_at IS NULL
        ORDER BY (user_link.relation_type = 'owner') DESC, item.updated_at DESC, item.id ASC
      `,
      [input.userId],
    );
    return { items: rows.rows.map((row) => marketplaceItemFromRow(row, input.userId)) };
  }

  async function listSkillCatalog(input: {
    userId: string;
    category?: string | null;
    query?: string | null;
    page?: number;
    pageSize?: number;
  }) {
    const category = normalizeCategoryFilter(input.category);
    const keyword = promptSkillKeyword(input.query);
    const requestedPage = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const [totalRow, categoryCountRows] = await Promise.all([
      queryOne<{ count: string | number }>(
        deps.db,
        `
          SELECT COUNT(*) AS count
          FROM prompts item
          WHERE item.deleted_at IS NULL
            AND item.status = 'enabled'
            AND item.is_published = true
            AND item.is_official = true
            AND ($1::text IS NULL OR item.prompt_category = $1)
            AND ($2::text IS NULL OR lower(item.name) LIKE $2 OR lower(item.summary) LIKE $2)
        `,
        [category, keyword],
      ),
      deps.db.query<PromptSkillCategoryCountRow>(
        `
          SELECT item.prompt_category, COUNT(*) AS count
          FROM prompts item
          WHERE item.deleted_at IS NULL
            AND item.status = 'enabled'
            AND item.is_published = true
            AND item.is_official = true
            AND ($1::text IS NULL OR lower(item.name) LIKE $1 OR lower(item.summary) LIKE $1)
          GROUP BY item.prompt_category
        `,
        [keyword],
      ),
    ]);
    const total = Number(totalRow?.count || 0);
    const totalPages = Math.ceil(total / pageSize);
    const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
    const rows = await deps.db.query<PromptSkillListRow>(
      `
        SELECT
          item.id,
          item.prompt_category,
          item.name,
          item.summary,
          item.cover_image_url,
          item.cover_storage_object_id,
          item.price_credits,
          item.is_official,
          item.usage_count,
          item.rating_score,
          item.rating_count,
          item.published_at,
          item.updated_at,
          EXISTS (
            SELECT 1 FROM prompt_official_defaults prompt_default
            WHERE prompt_default.prompt_category = item.prompt_category
              AND prompt_default.prompt_id = item.id
          ) AS is_default,
          user_link.relation_type AS user_relation_type
        FROM prompts item
        LEFT JOIN prompt_user_links user_link
          ON user_link.prompt_id = item.id
          AND user_link.user_id = $1
          AND user_link.status = 'active'
        WHERE item.deleted_at IS NULL
          AND item.status = 'enabled'
          AND item.is_published = true
          AND item.is_official = true
          AND ($2::text IS NULL OR item.prompt_category = $2)
          AND ($3::text IS NULL OR lower(item.name) LIKE $3 OR lower(item.summary) LIKE $3)
        ORDER BY item.usage_count DESC, item.rating_count DESC, item.published_at DESC, item.id ASC
        LIMIT $4
        OFFSET $5
      `,
      [input.userId, category, keyword, pageSize, (page - 1) * pageSize],
    );
    return promptSkillListResponse({
      rows: rows.rows,
      categoryCountRows: categoryCountRows.rows,
      page,
      pageSize,
      total,
      totalPages,
    });
  }

  async function listSkillLibrary(input: {
    userId: string;
    category?: string | null;
    query?: string | null;
    page?: number;
    pageSize?: number;
  }) {
    const category = normalizeCategoryFilter(input.category);
    const keyword = promptSkillKeyword(input.query);
    const requestedPage = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const [totalRow, categoryCountRows] = await Promise.all([
      queryOne<{ count: string | number }>(
        deps.db,
        `
          SELECT COUNT(*) AS count
          FROM prompts item
          JOIN prompt_user_links user_link
            ON user_link.prompt_id = item.id
            AND user_link.user_id = $1
            AND user_link.status = 'active'
          WHERE item.deleted_at IS NULL
            AND item.status = 'enabled'
            AND (user_link.relation_type = 'owner' OR item.is_published = true)
            AND ($2::text IS NULL OR item.prompt_category = $2)
            AND ($3::text IS NULL OR lower(item.name) LIKE $3 OR lower(item.summary) LIKE $3)
        `,
        [input.userId, category, keyword],
      ),
      deps.db.query<PromptSkillCategoryCountRow>(
        `
          SELECT item.prompt_category, COUNT(*) AS count
          FROM prompts item
          JOIN prompt_user_links user_link
            ON user_link.prompt_id = item.id
            AND user_link.user_id = $1
            AND user_link.status = 'active'
          WHERE item.deleted_at IS NULL
            AND item.status = 'enabled'
            AND (user_link.relation_type = 'owner' OR item.is_published = true)
            AND ($2::text IS NULL OR lower(item.name) LIKE $2 OR lower(item.summary) LIKE $2)
          GROUP BY item.prompt_category
        `,
        [input.userId, keyword],
      ),
    ]);
    const total = Number(totalRow?.count || 0);
    const totalPages = Math.ceil(total / pageSize);
    const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
    const rows = await deps.db.query<PromptSkillListRow>(
      `
        SELECT
          item.id,
          item.prompt_category,
          item.name,
          item.summary,
          item.cover_image_url,
          item.cover_storage_object_id,
          item.price_credits,
          item.is_official,
          item.usage_count,
          item.rating_score,
          item.rating_count,
          item.published_at,
          item.updated_at,
          EXISTS (
            SELECT 1 FROM prompt_user_defaults prompt_default
            WHERE prompt_default.user_id = $1
              AND prompt_default.prompt_category = item.prompt_category
              AND prompt_default.prompt_id = item.id
          ) AS is_default,
          user_link.relation_type AS user_relation_type
        FROM prompts item
        JOIN prompt_user_links user_link
          ON user_link.prompt_id = item.id
          AND user_link.user_id = $1
          AND user_link.status = 'active'
        WHERE item.deleted_at IS NULL
          AND item.status = 'enabled'
          AND (user_link.relation_type = 'owner' OR item.is_published = true)
          AND ($2::text IS NULL OR item.prompt_category = $2)
          AND ($3::text IS NULL OR lower(item.name) LIKE $3 OR lower(item.summary) LIKE $3)
        ORDER BY (user_link.relation_type = 'owner') DESC, item.updated_at DESC, item.id ASC
        LIMIT $4
        OFFSET $5
      `,
      [input.userId, category, keyword, pageSize, (page - 1) * pageSize],
    );
    return promptSkillListResponse({
      rows: rows.rows,
      categoryCountRows: categoryCountRows.rows,
      page,
      pageSize,
      total,
      totalPages,
    });
  }

  async function listAdminItems(input: { category?: string | null; status?: string | null; source?: string | null; query?: string | null }) {
    const category = normalizeCategoryFilter(input.category);
    const status = normalizeMarketplaceStatusFilter(input.status);
    const source = normalizeMarketplaceSourceFilter(input.source);
    const keyword = input.query?.trim() ? `%${input.query.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<PromptMarketplaceRow>(
      `
        SELECT
          item.*,
          EXISTS (
            SELECT 1 FROM prompt_official_defaults prompt_default
            WHERE prompt_default.prompt_category = item.prompt_category
              AND prompt_default.prompt_id = item.id
          ) AS is_default,
          owner_link.user_id AS owner_user_id,
          owner.display_name AS publisher_name
        FROM prompts item
        LEFT JOIN prompt_user_links owner_link
          ON owner_link.prompt_id = item.id
          AND owner_link.relation_type = 'owner'
          AND owner_link.status = 'active'
        LEFT JOIN users owner ON owner.id = owner_link.user_id
        WHERE item.deleted_at IS NULL
          AND ($1::text IS NULL OR item.prompt_category = $1)
          AND (
            $2::text IS NULL
            OR ($2 = 'published' AND item.status = 'enabled' AND item.is_published = true)
            OR ($2 = 'draft' AND item.status <> 'archived' AND item.is_published = false)
            OR ($2 = 'archived' AND item.status = 'archived')
          )
          AND (
            $3::text IS NULL
            OR lower(item.name) LIKE $3
            OR lower(item.summary) LIKE $3
          )
          AND ($4::text IS NULL OR ($4 = 'official' AND item.is_official = true) OR ($4 = 'private' AND item.is_official = false))
        ORDER BY item.is_official DESC, item.updated_at DESC, item.id ASC
        LIMIT 1000
      `,
      [category, status, keyword, source],
    );
    return { items: rows.rows.map(adminMarketplaceItemFromRow) };
  }

  async function updateAdminItem(input: {
    itemId: string;
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    coverImageUrl?: string | null;
    priceCredits?: number;
    usageCount?: number;
    status?: string;
    now: Date;
  }) {
    const existing = await queryOne<Pick<PromptMarketplaceRow, "id" | "is_official">>(
      deps.db,
      "SELECT id, is_official FROM prompts WHERE id = $1 AND deleted_at IS NULL",
      [input.itemId],
    );
    if (!existing) throw new PromptMarketplaceError(404, "prompt_marketplace_item_not_found", "提示词不存在");
    const title = input.title === undefined || input.title === null ? null : String(input.title).trim();
    if (title !== null && (title.length < 2 || title.length > 80)) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_title_invalid", "提示词名称需为 2-80 个字符");
    }
    const summary = input.summary === undefined || input.summary === null ? null : String(input.summary).trim().slice(0, 240);
    const content = input.content === undefined || input.content === null ? null : String(input.content).trim();
    if (content !== null && (!content || content.length > 50_000)) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_content_invalid", content ? "提示词正文不能超过 50000 个字符" : "提示词正文不能为空");
    }
    if (content !== null && !existing.is_official) {
      throw new PromptMarketplaceError(403, "prompt_marketplace_private_content_protected", "用户提示词正文不可通过后台修改");
    }
    const coverImageUrl = input.coverImageUrl === undefined || input.coverImageUrl === null
      ? null
      : String(input.coverImageUrl).trim() || null;
    const priceCredits = input.priceCredits == null ? null : Number(input.priceCredits);
    if (priceCredits != null && (!Number.isInteger(priceCredits) || priceCredits < 0 || priceCredits > 99_999)) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_price_invalid", "积分价格需为 0-99999 的整数");
    }
    const usageCount = input.usageCount == null ? null : Number(input.usageCount);
    if (usageCount != null && (!Number.isInteger(usageCount) || usageCount < 0 || usageCount > 2_147_483_647)) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_usage_count_invalid", "使用次数需为非负整数");
    }
    const status = input.status == null ? null : normalizeMarketplaceStatus(input.status);
    if (status === "draft" || status === "archived") {
      const currentDefault = await queryOne<{ prompt_id: string }>(
        deps.db,
        "SELECT prompt_id FROM prompt_official_defaults WHERE prompt_id = $1",
        [input.itemId],
      );
      if (currentDefault) {
        throw new PromptMarketplaceError(409, "official_prompt_default_required", "当前提示词是该分类默认技能，请先将其他提示词设为默认");
      }
    }
    const row = await queryOne<PromptMarketplaceRow>(
      deps.db,
      `
        UPDATE prompts
        SET name = COALESCE($2, name),
            summary = COALESCE($3, summary),
            prompt_content = COALESCE($4, prompt_content),
            cover_image_url = COALESCE($5, cover_image_url),
            price_credits = COALESCE($6, price_credits),
            usage_count = COALESCE($7, usage_count),
            status = CASE
              WHEN $8 = 'archived' THEN 'archived'
              WHEN $8 IN ('published', 'draft') THEN 'enabled'
              ELSE status
            END,
            is_published = CASE
              WHEN $8 = 'published' THEN true
              WHEN $8 IN ('draft', 'archived') THEN false
              ELSE is_published
            END,
            published_at = CASE
              WHEN $8 = 'published' AND published_at IS NULL THEN $9
              WHEN $8 IN ('draft', 'archived') THEN NULL
              ELSE published_at
            END,
            updated_at = $9
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *
      `,
      [input.itemId, title, summary, content, coverImageUrl, priceCredits, usageCount, status, input.now],
    );
    if (!row) throw new PromptMarketplaceError(404, "prompt_marketplace_item_not_found", "提示词不存在");
    return { item: adminMarketplaceItemFromRow(row) };
  }

  async function deleteAdminItem(input: { itemId: string; now: Date }) {
    const currentDefault = await queryOne<{ prompt_id: string }>(
      deps.db,
      "SELECT prompt_id FROM prompt_official_defaults WHERE prompt_id = $1",
      [input.itemId],
    );
    if (currentDefault) {
      throw new PromptMarketplaceError(409, "official_prompt_default_required", "当前提示词是该分类默认技能，请先将其他提示词设为默认");
    }
    const deleted = await queryOne<{ id: string }>(
      deps.db,
      `
        UPDATE prompts
        SET status = 'archived', is_published = false, published_at = NULL, deleted_at = $2, updated_at = $2
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
      [input.itemId, input.now],
    );
    if (!deleted) throw new PromptMarketplaceError(404, "prompt_marketplace_item_not_found", "提示词不存在");
    await deps.db.query("DELETE FROM prompt_user_defaults WHERE prompt_id = $1", [input.itemId]);
    return { deleted: true };
  }

  async function createAdminOfficialItem(input: {
    title: string;
    category: string;
    summary?: string | null;
    content: string;
    coverImageUrl?: string | null;
    priceCredits?: number;
    usageCount?: number;
    status?: string;
    now: Date;
  }) {
    const category = requireCategory(input.category);
    const title = input.title.trim();
    const content = input.content.trim();
    const priceCredits = Number(input.priceCredits ?? 0);
    const usageCount = Number(input.usageCount ?? 0);
    const status = normalizeMarketplaceStatus(input.status ?? "draft");
    if (title.length < 2 || title.length > 80) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_title_invalid", "提示词名称需为 2-80 个字符");
    }
    if (!content || content.length > 50_000) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_content_invalid", content ? "提示词正文不能超过 50000 个字符" : "提示词正文不能为空");
    }
    if (!Number.isInteger(priceCredits) || priceCredits < 0 || priceCredits > 99_999) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_price_invalid", "积分价格需为 0-99999 的整数");
    }
    if (!Number.isInteger(usageCount) || usageCount < 0 || usageCount > 2_147_483_647) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_usage_count_invalid", "使用次数需为非负整数");
    }
    const summary = String(input.summary ?? "").trim().slice(0, 240)
      || `${categoryLabel(category)}，由后台创建。`;
    const published = status === "published";
    const row = await queryOne<PromptMarketplaceRow>(
      deps.db,
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, prompt_content, cover_image_url,
          price_credits, usage_count, status, is_official, is_published,
          published_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, true, $10, $11, $12, $12
        )
        RETURNING *
      `,
      [
        randomUUID(), category, title, summary, content, input.coverImageUrl?.trim() || null,
        priceCredits, usageCount, status === "archived" ? "archived" : "enabled", published,
        published ? input.now : null, input.now,
      ],
    );
    return { item: adminMarketplaceItemFromRow(row!) };
  }

  async function createItem(input: {
    userId: string;
    title: string;
    category: string;
    summary?: string | null;
    content: string;
    coverImageUrl?: string | null;
    coverStorageObjectId?: string | null;
    priceCredits?: number;
    publish?: boolean;
    now: Date;
  }) {
    const category = requireCategory(input.category);
    const title = input.title.trim();
    const content = input.content.trim();
    const priceCredits = Number(input.priceCredits ?? 0);
    if (title.length < 2 || title.length > 80) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_title_invalid", "提示词名称需为 2-80 个字符");
    }
    if (!content || content.length > 50_000) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_content_invalid", content ? "提示词正文不能超过 50000 个字符" : "提示词正文不能为空");
    }
    if (!Number.isInteger(priceCredits) || priceCredits < 0 || priceCredits > 99_999) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_price_invalid", "积分价格需为 0-99999 的整数");
    }
    const summary = String(input.summary ?? "").trim().slice(0, 240)
      || `${categoryLabel(category)}，由创作者发布。`;
    const id = randomUUID();
    const publish = input.publish !== false;
    await deps.db.query("BEGIN");
    try {
      const row = await queryOne<PromptMarketplaceRow>(
        deps.db,
        `
          INSERT INTO prompts (
            id, prompt_category, name, summary, prompt_content, cover_image_url, cover_storage_object_id,
            price_credits, status, is_official, is_published,
            published_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            'enabled', false, $9, $10, $11, $11
          )
          RETURNING *
        `,
        [id, category, title, summary, content, input.coverImageUrl?.trim() || null, input.coverStorageObjectId ?? null, priceCredits, publish, publish ? input.now : null, input.now],
      );
      await deps.db.query(
        `
          INSERT INTO prompt_user_links (
            id, prompt_id, user_id, relation_type, status, added_at, created_at, updated_at
          ) VALUES ($1, $1, $2, 'owner', 'active', $3, $3, $3)
        `,
        [id, input.userId, input.now],
      );
      await deps.db.query("COMMIT");
      return {
        item: marketplaceItemFromRow({
          ...row!,
          owner_user_id: input.userId,
          user_relation_type: "owner",
          purchase_status: "active",
        }, input.userId),
      };
    } catch (error) {
      await deps.db.query("ROLLBACK");
      throw error;
    }
  }

  async function purchaseItem(input: { userId: string; itemId: string; now: Date }) {
    const item = await findPublishedItem(input.itemId);
    if (!item) throw new PromptMarketplaceError(404, "prompt_marketplace_item_not_found", "提示词不存在或未发布");
    const activeLink = await queryOne<{ id: string; relation_type: string }>(
      deps.db,
      "SELECT id, relation_type FROM prompt_user_links WHERE prompt_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1",
      [item.id, input.userId],
    );
    if (activeLink?.relation_type === "owner") {
      throw new PromptMarketplaceError(409, "prompt_marketplace_owner_purchase", "自己的提示词无需重复添加");
    }
    if (activeLink) return { purchaseId: activeLink.id, alreadyOwned: true };

    const purchaseId = randomUUID();
    try {
      const link = await queryOne<{ id: string; relation_type: string }>(
        deps.db,
        `
          INSERT INTO prompt_user_links (
            id, prompt_id, user_id, relation_type, status,
            price_credits_paid, added_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $6, $6)
          ON CONFLICT (prompt_id, user_id) WHERE status = 'active'
          DO UPDATE SET updated_at = prompt_user_links.updated_at
          RETURNING id, relation_type
        `,
        [purchaseId, item.id, input.userId, "added", 0, input.now],
      );
      if (link?.relation_type === "owner") {
        throw new PromptMarketplaceError(409, "prompt_marketplace_owner_purchase", "自己的提示词无需重复添加");
      }
      const wallet = await queryOne<{ credit_balance_cached: number | string }>(
        deps.db,
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [input.userId],
      );
      return {
        purchaseId: link?.id ?? purchaseId,
        alreadyOwned: link?.id !== purchaseId,
        priceCredits: 0,
        creditBalance: Number(wallet?.credit_balance_cached ?? 0),
      };
    } catch (error) {
      throw error;
    }
  }

  async function updateOwnItem(input: {
    userId: string;
    itemId: string;
    title: string;
    category: string;
    summary?: string | null;
    content: string;
    coverImageUrl?: string | null;
    coverStorageObjectId?: string | null;
    priceCredits?: number;
    publish?: boolean;
    now: Date;
  }) {
    const category = requireCategory(input.category);
    const title = input.title.trim();
    const content = input.content.trim();
    const priceCredits = Number(input.priceCredits ?? 0);
    if (title.length < 2 || title.length > 80) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_title_invalid", "提示词名称需为 2-80 个字符");
    }
    if (!content || content.length > 50_000) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_content_invalid", content ? "提示词正文不能超过 50000 个字符" : "提示词正文不能为空");
    }
    if (!Number.isInteger(priceCredits) || priceCredits < 0 || priceCredits > 99_999) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_price_invalid", "积分价格需为 0-99999 的整数");
    }
    const summary = String(input.summary ?? "").trim().slice(0, 240)
      || `${categoryLabel(category)}，由创作者发布。`;
    const publish = input.publish === true;
    const row = await queryOne<PromptMarketplaceRow>(
      deps.db,
      `
        UPDATE prompts item
        SET prompt_category = $3,
            name = $4,
            summary = $5,
            prompt_content = $6,
            cover_image_url = $7,
            cover_storage_object_id = $8,
            price_credits = $9,
            status = CASE WHEN item.status = 'archived' THEN 'archived' ELSE 'enabled' END,
            is_published = CASE WHEN item.status = 'archived' THEN false ELSE $10 END,
            published_at = CASE
              WHEN item.status = 'archived' THEN NULL
              WHEN $10 THEN COALESCE(item.published_at, $11)
              ELSE NULL
            END,
            updated_at = $11
        WHERE item.id = $1
          AND item.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM prompt_user_links link
            WHERE link.prompt_id = item.id
              AND link.user_id = $2
              AND link.relation_type = 'owner'
              AND link.status = 'active'
          )
        RETURNING item.*
      `,
      [input.itemId, input.userId, category, title, summary, content, input.coverImageUrl?.trim() || null, input.coverStorageObjectId ?? null, priceCredits, publish, input.now],
    );
    if (!row) throw new PromptMarketplaceError(404, "prompt_marketplace_owned_item_not_found", "未找到自己的提示词");
    await deps.db.query(
      "DELETE FROM prompt_user_defaults WHERE user_id = $1 AND prompt_id = $2 AND prompt_category <> $3",
      [input.userId, input.itemId, category],
    );
    return {
      item: marketplaceItemFromRow({
        ...row,
        owner_user_id: input.userId,
        user_relation_type: "owner",
        purchase_status: "active",
      }, input.userId),
    };
  }

  async function removeFromLibrary(input: { userId: string; itemId: string; now: Date }) {
    const purchase = await queryOne<{ id: string }>(
      deps.db,
      `
        UPDATE prompt_user_links
        SET status = 'removed', removed_at = $3, updated_at = $3
        WHERE id = (
          SELECT id
          FROM prompt_user_links
          WHERE prompt_id = $1 AND user_id = $2 AND relation_type = 'added' AND status = 'active'
          ORDER BY added_at DESC
          LIMIT 1
        )
        RETURNING id
      `,
      [input.itemId, input.userId, input.now],
    );
    if (!purchase) throw new PromptMarketplaceError(404, "prompt_marketplace_purchase_not_found", "私人提示词库中不存在该提示词");
    await deps.db.query(
      "DELETE FROM prompt_user_defaults WHERE user_id = $1 AND prompt_id = $2",
      [input.userId, input.itemId],
    );
    return { removed: true, repurchaseRequired: true };
  }

  async function deleteOwnItem(input: { userId: string; itemId: string; now: Date }) {
    const deleted = await queryOne<{ id: string }>(
      deps.db,
      `
        UPDATE prompts prompt
        SET status = 'archived', is_published = false, deleted_at = $3, updated_at = $3
        WHERE prompt.id = $1
          AND prompt.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM prompt_user_links link
            WHERE link.prompt_id = prompt.id
              AND link.user_id = $2
              AND link.relation_type = 'owner'
              AND link.status = 'active'
          )
        RETURNING prompt.id
      `,
      [input.itemId, input.userId, input.now],
    );
    if (!deleted) throw new PromptMarketplaceError(404, "prompt_marketplace_owned_item_not_found", "未找到自己的提示词");
    await deps.db.query(
      "DELETE FROM prompt_user_defaults WHERE user_id = $1 AND prompt_id = $2",
      [input.userId, input.itemId],
    );
    return { deleted: true };
  }

  async function useItem(input: { userId: string; itemId: string; now: Date }) {
    const row = await queryOne<PromptMarketplaceRow>(
      deps.db,
      `
        SELECT
          item.*,
          link.id AS purchase_id,
          link.status AS purchase_status,
          link.relation_type AS user_relation_type,
          CASE WHEN link.relation_type = 'owner' THEN link.user_id ELSE NULL END AS owner_user_id
        FROM prompts item
        LEFT JOIN prompt_user_links link
          ON link.prompt_id = item.id
          AND link.user_id = $2
          AND link.status = 'active'
        WHERE item.id = $1
          AND item.deleted_at IS NULL
          AND item.status = 'enabled'
          AND item.is_published = true
      `,
      [input.itemId, input.userId],
    );
    const isOwner = row?.user_relation_type === "owner";
    if (!row || (!isOwner && !row.purchase_id)) {
      throw new PromptMarketplaceError(403, "prompt_marketplace_use_forbidden", "请先购买并添加到私人提示词库");
    }
    await deps.db.query(
      "UPDATE prompts SET usage_count = usage_count + 1, updated_at = $2 WHERE id = $1",
      [row.id, input.now],
    );
    if (row.purchase_id) {
      await deps.db.query(
        "UPDATE prompt_user_links SET last_used_at = $2, updated_at = $2 WHERE id = $1",
        [row.purchase_id, input.now],
      );
    }
    return {
      itemId: row.id,
      title: row.name,
      category: row.prompt_category,
      usageReference: { promptMarketplaceItemId: row.id },
      contentVisible: isOwner,
      ...(isOwner ? { content: row.prompt_content } : {}),
    };
  }

  async function resolveScriptConversionSkill(input: { userId: string; itemId: string; now: Date }) {
    const row = await queryOne<PromptMarketplaceRow & { user_link_id?: string | null }>(
      deps.db,
      `
        SELECT item.*, user_link.id AS user_link_id, owner_link.user_id AS owner_user_id
        FROM prompts item
        LEFT JOIN prompt_user_links owner_link
          ON owner_link.prompt_id = item.id
          AND owner_link.relation_type = 'owner'
          AND owner_link.status = 'active'
        LEFT JOIN prompt_user_links user_link
          ON user_link.prompt_id = item.id
          AND user_link.user_id = $2
          AND user_link.status = 'active'
        WHERE item.id = $1
          AND item.prompt_category = 'script'
          AND item.deleted_at IS NULL
          AND item.status = 'enabled'
          AND (
            (item.is_official = true AND item.is_published = true)
            OR user_link.id IS NOT NULL
          )
      `,
      [input.itemId, input.userId],
    );
    if (!row) {
      throw new PromptMarketplaceError(403, "script_conversion_skill_forbidden", "小说转剧本技能不存在或不可用");
    }
    await deps.db.query(
      "UPDATE prompts SET usage_count = usage_count + 1, updated_at = $2 WHERE id = $1",
      [row.id, input.now],
    );
    if (row.user_link_id) {
      await deps.db.query(
        "UPDATE prompt_user_links SET last_used_at = $2, updated_at = $2 WHERE id = $1",
        [row.user_link_id, input.now],
      );
    }
    return {
      id: row.id,
      title: row.name,
      content: row.prompt_content,
      priceCredits: row.owner_user_id === input.userId ? 0 : Number(row.price_credits || 0),
      official: Boolean(row.is_official),
      ownerUserId: row.owner_user_id ?? null,
    };
  }

  async function resolveWorkflowPromptSkill(input: {
    userId: string;
    itemId: string;
    category: "script" | "shot" | "prop_extract" | "character_extract" | "scene_extract" | "image_style" | "storyboard" | "other";
    now: Date;
  }) {
    const row = await queryOne<PromptMarketplaceRow & { user_link_id?: string | null }>(
      deps.db,
      `
        SELECT item.*, user_link.id AS user_link_id, owner_link.user_id AS owner_user_id
        FROM prompts item
        LEFT JOIN prompt_user_links owner_link
          ON owner_link.prompt_id = item.id
          AND owner_link.relation_type = 'owner'
          AND owner_link.status = 'active'
        LEFT JOIN prompt_user_links user_link
          ON user_link.prompt_id = item.id
          AND user_link.user_id = $2
          AND user_link.status = 'active'
        WHERE item.id = $1
          AND item.prompt_category = $3
          AND item.deleted_at IS NULL
          AND item.status = 'enabled'
          AND (
            (item.is_official = true AND item.is_published = true)
            OR user_link.id IS NOT NULL
          )
      `,
      [input.itemId, input.userId, input.category],
    );
    if (!row) {
      throw new PromptMarketplaceError(403, "workflow_prompt_skill_forbidden", "创作技能不存在、分类不匹配或不可用");
    }
    await deps.db.query(
      "UPDATE prompts SET usage_count = usage_count + 1, updated_at = $2 WHERE id = $1",
      [row.id, input.now],
    );
    if (row.user_link_id) {
      await deps.db.query(
        "UPDATE prompt_user_links SET last_used_at = $2, updated_at = $2 WHERE id = $1",
        [row.user_link_id, input.now],
      );
    }
    return {
      id: row.id,
      category: row.prompt_category,
      title: row.name,
      content: row.prompt_content,
      coverImageUrl: row.cover_image_url || (row.cover_storage_object_id
        ? `/api/storage/objects/${encodeURIComponent(row.cover_storage_object_id)}/content?proxy=1`
        : ""),
      coverStorageObjectId: row.cover_storage_object_id,
      priceCredits: row.owner_user_id === input.userId ? 0 : Number(row.price_credits || 0),
      official: Boolean(row.is_official),
      ownerUserId: row.owner_user_id ?? null,
    };
  }

  async function rateItem(input: { userId: string; itemId: string; rating: number; now: Date }) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new PromptMarketplaceError(400, "prompt_marketplace_rating_invalid", "推荐星级必须为 1-5 星");
    }
    const purchase = await queryOne<{ id: string }>(
      deps.db,
      `
        SELECT id
        FROM prompt_user_links
        WHERE prompt_id = $1 AND user_id = $2 AND relation_type = 'added' AND status = 'active'
        ORDER BY added_at DESC
        LIMIT 1
      `,
      [input.itemId, input.userId],
    );
    if (!purchase) throw new PromptMarketplaceError(403, "prompt_marketplace_rating_forbidden", "购买后才能评价提示词");
    await deps.db.query("BEGIN");
    try {
      const insertedRating = await queryOne<{ id: string }>(
        deps.db,
        `INSERT INTO prompt_ratings (id, prompt_id, user_id, rating, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (prompt_id, user_id) DO NOTHING
         RETURNING id`,
        [randomUUID(), input.itemId, input.userId, input.rating, input.now],
      );
      if (!insertedRating) {
        throw new PromptMarketplaceError(409, "prompt_marketplace_rating_exists", "每个用户只能为同一提示词评分一次");
      }
      const totals = await queryOne<{ rating_score: number | string; rating_count: number | string }>(
        deps.db,
        `
          UPDATE prompts item
          SET rating_score = totals.rating_score, rating_count = totals.rating_count, updated_at = $2
          FROM (
            SELECT round(avg(rating)::numeric, 2) AS rating_score, count(*)::int AS rating_count
            FROM prompt_ratings
            WHERE prompt_id = $1
          ) totals
          WHERE item.id = $1
          RETURNING item.rating_score, item.rating_count
        `,
        [input.itemId, input.now],
      );
      await deps.db.query("COMMIT");
      return {
        rating: input.rating,
        ratingAverage: Number(totals?.rating_count || 0) > 0
          ? Number(totals?.rating_score || 5)
          : 5,
        ratingCount: Number(totals?.rating_count || 0),
      };
    } catch (error) {
      await deps.db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  async function findPublishedItem(itemId: string) {
    return queryOne<PromptMarketplaceRow>(
      deps.db,
      "SELECT * FROM prompts WHERE id = $1 AND deleted_at IS NULL AND status = 'enabled' AND is_published = true",
      [itemId],
    );
  }

  return {
    listCatalog,
    listLibrary,
    listSkillCatalog,
    listSkillLibrary,
    listAdminItems,
    createAdminOfficialItem,
    updateAdminItem,
    deleteAdminItem,
    createItem,
    updateOwnItem,
    purchaseItem,
    removeFromLibrary,
    deleteOwnItem,
    useItem,
    resolveScriptConversionSkill,
    resolveWorkflowPromptSkill,
    rateItem,
  };
}

function promptSkillListResponse(input: {
  rows: PromptSkillListRow[];
  categoryCountRows: PromptSkillCategoryCountRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  const categoryCounts = Object.fromEntries(promptMarketplaceCategories.map((category) => [category, 0])) as Record<PromptMarketplaceCategory, number>;
  for (const row of input.categoryCountRows) categoryCounts[row.prompt_category] = Number(row.count || 0);
  return {
    items: input.rows.map(promptSkillListItemFromRow),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: input.total,
      totalPages: input.totalPages,
      hasNext: input.totalPages > 0 && input.page < input.totalPages,
    },
    categoryCounts,
  };
}

function promptSkillListItemFromRow(row: PromptSkillListRow) {
  const owned = row.user_relation_type === "owner";
  const purchased = row.user_relation_type === "added";
  return {
    id: row.id,
    title: row.name,
    category: row.prompt_category,
    summary: row.summary,
    coverImageUrl: row.cover_image_url || (row.cover_storage_object_id
      ? `/api/storage/objects/${encodeURIComponent(row.cover_storage_object_id)}/content?proxy=1`
      : ""),
    coverStorageObjectId: row.cover_storage_object_id,
    priceCredits: owned ? 0 : Number(row.price_credits || 0),
    official: Boolean(row.is_official),
    isDefault: Boolean(row.is_default),
    usageCount: Number(row.usage_count || 0),
    ratingAverage: Number(row.rating_score || 5),
    ratingCount: Number(row.rating_count || 0),
    owned,
    purchased,
    canUse: owned || purchased || Boolean(row.is_official),
    publishedAt: dateString(row.published_at),
    updatedAt: dateString(row.updated_at),
  };
}

function promptSkillKeyword(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized ? `%${normalized}%` : null;
}

function marketplaceItemFromRow(row: PromptMarketplaceRow, userId: string | null) {
  const isOwner = Boolean(userId) && (row.user_relation_type === "owner" || row.owner_user_id === userId);
  const purchased = row.user_relation_type === "added" && row.purchase_status === "active";
  const ratingCount = Number(row.rating_count || 0);
  return {
    id: row.id,
    title: row.name,
    category: row.prompt_category,
    summary: row.summary,
    coverImageUrl: row.cover_image_url || (row.cover_storage_object_id
      ? `/api/storage/objects/${encodeURIComponent(row.cover_storage_object_id)}/content?proxy=1`
      : ""),
    coverStorageObjectId: row.cover_storage_object_id,
    priceCredits: Number(row.price_credits || 0),
    status: marketplaceStatus(row),
    official: Boolean(row.is_official),
    isDefault: Boolean(row.is_default),
    publisherName: row.is_official ? "官方" : row.publisher_name || "创作者",
    usageCount: Number(row.usage_count || 0),
    usage_count: Number(row.usage_count || 0),
    ratingAverage: Number(row.rating_score || 5),
    ratingCount,
    userRating: row.user_rating == null ? null : Number(row.user_rating),
    owned: isOwner,
    purchased,
    canUse: isOwner || purchased,
    contentVisible: isOwner,
    ...(isOwner ? { content: row.prompt_content } : {}),
    publishedAt: dateString(row.published_at),
    updatedAt: dateString(row.updated_at),
  };
}

function adminMarketplaceItemFromRow(row: PromptMarketplaceRow) {
  const ratingCount = Number(row.rating_count || 0);
  const isOfficial = Boolean(row.is_official);
  return {
    id: row.id,
    title: row.name,
    category: row.prompt_category,
    summary: row.summary,
    coverImageUrl: row.cover_image_url || (row.cover_storage_object_id
      ? `/api/storage/objects/${encodeURIComponent(row.cover_storage_object_id)}/content?proxy=1`
      : ""),
    coverStorageObjectId: row.cover_storage_object_id,
    priceCredits: Number(row.price_credits || 0),
    status: marketplaceStatus(row),
    official: isOfficial,
    isDefault: Boolean(row.is_default),
    ownerUserId: isOfficial ? null : row.owner_user_id,
    publisherName: isOfficial ? "官方" : row.publisher_name || "创作者",
    usageCount: Number(row.usage_count || 0),
    ratingAverage: Number(row.rating_score || 5),
    ratingCount,
    is_published: Boolean(row.is_published),
    isPublished: Boolean(row.is_published),
    contentVisible: isOfficial,
    ...(isOfficial ? { content: row.prompt_content } : {}),
    publishedAt: dateString(row.published_at),
    updatedAt: dateString(row.updated_at),
  };
}

function normalizeCategoryFilter(value: unknown): PromptMarketplaceCategory | null {
  const normalized = String(value ?? "").trim();
  return promptMarketplaceCategories.includes(normalized as PromptMarketplaceCategory)
    ? normalized as PromptMarketplaceCategory
    : null;
}

function normalizeMarketplaceStatus(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (normalized === "draft" || normalized === "published" || normalized === "archived") return normalized;
  throw new PromptMarketplaceError(400, "prompt_marketplace_status_invalid", "提示词发布状态不支持");
}

function normalizeMarketplaceStatusFilter(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized === "draft" || normalized === "published" || normalized === "archived" ? normalized : null;
}

function normalizeMarketplaceSourceFilter(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized === "official" || normalized === "private" ? normalized : null;
}

function normalizePage(value: unknown) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizePageSize(value: unknown) {
  const pageSize = Number(value);
  if (!Number.isInteger(pageSize) || pageSize <= 0) return 12;
  return Math.min(pageSize, 100);
}

function marketplaceStatus(row: PromptMarketplaceRow) {
  if (row.status === "archived") return "archived";
  return row.is_published ? "published" : "draft";
}

function requireCategory(value: unknown): PromptMarketplaceCategory {
  const category = normalizeCategoryFilter(value);
  if (!category) throw new PromptMarketplaceError(400, "prompt_marketplace_category_invalid", "提示词分类不支持");
  return category;
}

function categoryLabel(category: PromptMarketplaceCategory) {
  return ({
    script: "剧本提示词",
    shot: "分镜提示词",
    scene_extract: "场景抽取提示词",
    character_extract: "人物抽取提示词",
    prop_extract: "道具抽取提示词",
    image_style: "生图风格提示词",
    storyboard: "故事板提示词",
    other: "其它提示词",
  })[category];
}

function dateString(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}
