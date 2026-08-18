import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const allowedStatuses = new Set(["active", "inactive"]);
const publicRecommendationCache = new WeakMap<SqlDatabase, {
  expiresAtMs: number;
  pending: Promise<ReturnType<typeof recommendationPayload>>;
}>();
const publicRecommendationCacheTtlMs = 30_000;

export function createHomeRecommendationService(deps: { db: SqlDatabase }) {
  async function listPublicRecommendations() {
    const cached = publicRecommendationCache.get(deps.db);
    if (cached && cached.expiresAtMs > Date.now()) return await cached.pending;
    const pending = Promise.all([
      loadBackground(),
      deps.db.query<CategoryRow>(`
        SELECT * FROM home_recommendation_categories
        WHERE status = 'active'
        ORDER BY sort_order ASC, created_at ASC
      `),
      deps.db.query<VideoRow>(`
        SELECT video.*
        FROM home_recommendation_videos video
        JOIN home_recommendation_categories category ON category.id = video.category_id
        WHERE video.status = 'active' AND category.status = 'active'
        ORDER BY category.sort_order ASC, video.sort_order ASC, video.created_at ASC
      `),
    ]).then(([background, categories, videos]) => (
      recommendationPayload(categories.rows, videos.rows, background?.status === "active" ? background : null)
    ));
    publicRecommendationCache.set(deps.db, { expiresAtMs: Date.now() + publicRecommendationCacheTtlMs, pending });
    pending.catch(() => {
      if (publicRecommendationCache.get(deps.db)?.pending === pending) publicRecommendationCache.delete(deps.db);
    });
    return await pending;
  }

  async function listAdminRecommendations() {
    const background = await loadBackground();
    const categories = await deps.db.query<CategoryRow>(`
      SELECT * FROM home_recommendation_categories
      ORDER BY sort_order ASC, created_at ASC
    `);
    const videos = await deps.db.query<VideoRow>(`
      SELECT * FROM home_recommendation_videos
      ORDER BY sort_order ASC, created_at ASC
    `);
    return recommendationPayload(categories.rows, videos.rows, background);
  }

  async function loadBackground() {
    return queryOne<BackgroundRow>(deps.db, "SELECT * FROM home_background_settings WHERE id = 'homepage'");
  }

  async function saveBackground(input: SaveBackgroundInput): Promise<MutationResponse> {
    const videoUrl = String(input.videoUrl ?? "").trim();
    const posterUrl = String(input.posterUrl ?? "").trim();
    if (videoUrl && !isSafeMediaUrl(videoUrl)) return error(400, "home_background_video_url_invalid", "背景视频地址必须是站内路径或 HTTP(S) 地址");
    if (posterUrl && !isSafeMediaUrl(posterUrl)) return error(400, "home_background_poster_url_invalid", "背景封面地址必须是站内路径或 HTTP(S) 地址");
    const status = normalizeStatus(input.status);
    if (!status) return error(400, "home_recommendation_status_invalid", "背景视频状态无效");
    if (status === "active" && !videoUrl) return error(400, "home_background_video_url_required", "启用背景视频时必须填写视频地址");
    const row = await queryOne<BackgroundRow>(deps.db, `
      INSERT INTO home_background_settings (
        id, video_url, poster_url, status, updated_by_admin_id, created_at, updated_at
      ) VALUES ('homepage', $1, $2, $3, $4, $5, $5)
      ON CONFLICT (id) DO UPDATE SET
        video_url = EXCLUDED.video_url,
        poster_url = EXCLUDED.poster_url,
        status = EXCLUDED.status,
        updated_by_admin_id = EXCLUDED.updated_by_admin_id,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [videoUrl, posterUrl, status, normalizeId(input.actorAdminAccountId), validNow(input.now)]);
    publicRecommendationCache.delete(deps.db);
    return { status: 200, body: { background: backgroundFromRow(row!) } };
  }

  async function saveCategory(input: SaveCategoryInput): Promise<MutationResponse> {
    const name = String(input.name ?? "").trim();
    if (!name || name.length > 40) return error(400, "home_recommendation_category_name_invalid", "分类名称不能为空且不能超过 40 个字符");
    const code = String(input.code ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(code)) return error(400, "home_recommendation_category_code_invalid", "分类编码仅支持小写字母、数字、下划线和连字符");
    const status = normalizeStatus(input.status);
    if (!status) return error(400, "home_recommendation_status_invalid", "分类状态无效");
    try {
      const row = await queryOne<CategoryRow>(deps.db, `
        INSERT INTO home_recommendation_categories (
          id, code, name, status, sort_order, created_by_admin_id, updated_by_admin_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $7)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          sort_order = EXCLUDED.sort_order,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `, [normalizeId(input.id) ?? randomUUID(), code, name, status, normalizeSortOrder(input.sortOrder), normalizeId(input.actorAdminAccountId), validNow(input.now)]);
      publicRecommendationCache.delete(deps.db);
      return { status: 200, body: { category: categoryFromRow(row!) } };
    } catch (caught) {
      if (isUniqueViolation(caught)) return error(409, "home_recommendation_category_code_conflict", "分类编码已存在");
      throw caught;
    }
  }

  async function deleteCategory(input: DeleteInput): Promise<MutationResponse> {
    const categoryId = normalizeId(input.id);
    if (!categoryId) return error(400, "home_recommendation_category_id_required", "分类 ID 不能为空");
    const count = await deps.db.query<{ count: string }>("SELECT count(*)::text AS count FROM home_recommendation_videos WHERE category_id = $1", [categoryId]);
    if (Number(count.rows[0]?.count ?? 0) > 0) return error(409, "home_recommendation_category_in_use", "该分类下仍有视频，请先移动或删除视频");
    const row = await queryOne<CategoryRow>(deps.db, "DELETE FROM home_recommendation_categories WHERE id = $1 RETURNING *", [categoryId]);
    if (!row) return error(404, "home_recommendation_category_not_found", "分类不存在");
    publicRecommendationCache.delete(deps.db);
    return { status: 200, body: { category: categoryFromRow(row) } };
  }

  async function saveVideo(input: SaveVideoInput): Promise<MutationResponse> {
    const title = String(input.title ?? "").trim();
    if (!title || title.length > 120) return error(400, "home_recommendation_video_title_invalid", "视频标题不能为空且不能超过 120 个字符");
    const categoryId = normalizeId(input.categoryId);
    if (!categoryId) return error(400, "home_recommendation_video_category_required", "请选择视频分类");
    const category = await queryOne<{ id: string }>(deps.db, "SELECT id FROM home_recommendation_categories WHERE id = $1", [categoryId]);
    if (!category) return error(400, "home_recommendation_video_category_invalid", "视频分类不存在");
    const coverUrl = String(input.coverUrl ?? "").trim();
    const videoUrl = String(input.videoUrl ?? "").trim();
    if (!isSafeMediaUrl(coverUrl)) return error(400, "home_recommendation_cover_url_invalid", "封面地址必须是站内路径或 HTTP(S) 地址");
    if (videoUrl && !isSafeMediaUrl(videoUrl)) return error(400, "home_recommendation_video_url_invalid", "视频地址必须是站内路径或 HTTP(S) 地址");
    const status = normalizeStatus(input.status);
    if (!status) return error(400, "home_recommendation_status_invalid", "视频状态无效");
    const durationLabel = String(input.durationLabel ?? "").trim();
    if (durationLabel.length > 20) return error(400, "home_recommendation_duration_invalid", "视频时长不能超过 20 个字符");
    const row = await queryOne<VideoRow>(deps.db, `
      INSERT INTO home_recommendation_videos (
        id, category_id, title, subtitle, cover_url, video_url, duration_label, cover_alt,
        status, sort_order, created_by_admin_id, updated_by_admin_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $12)
      ON CONFLICT (id) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        cover_url = EXCLUDED.cover_url,
        video_url = EXCLUDED.video_url,
        duration_label = EXCLUDED.duration_label,
        cover_alt = EXCLUDED.cover_alt,
        status = EXCLUDED.status,
        sort_order = EXCLUDED.sort_order,
        updated_by_admin_id = EXCLUDED.updated_by_admin_id,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [normalizeId(input.id) ?? randomUUID(), categoryId, title, String(input.subtitle ?? "").trim().slice(0, 160), coverUrl, videoUrl, durationLabel, String(input.coverAlt ?? "").trim().slice(0, 160), status, normalizeSortOrder(input.sortOrder), normalizeId(input.actorAdminAccountId), validNow(input.now)]);
    publicRecommendationCache.delete(deps.db);
    return { status: 200, body: { video: videoFromRow(row!) } };
  }

  async function deleteVideo(input: DeleteInput): Promise<MutationResponse> {
    const row = await queryOne<VideoRow>(deps.db, "DELETE FROM home_recommendation_videos WHERE id = $1 RETURNING *", [normalizeId(input.id)]);
    if (!row) return error(404, "home_recommendation_video_not_found", "视频不存在");
    publicRecommendationCache.delete(deps.db);
    return { status: 200, body: { video: videoFromRow(row) } };
  }

  return { listPublicRecommendations, listAdminRecommendations, saveBackground, saveCategory, deleteCategory, saveVideo, deleteVideo };
}

function recommendationPayload(categoryRows: CategoryRow[], videoRows: VideoRow[], backgroundRow: BackgroundRow | null) {
  const videosByCategory = new Map<string, HomeVideo[]>();
  for (const row of videoRows) {
    const list = videosByCategory.get(row.category_id) ?? [];
    list.push(videoFromRow(row));
    videosByCategory.set(row.category_id, list);
  }
  return { data: { background: backgroundRow ? backgroundFromRow(backgroundRow) : { videoUrl: "", posterUrl: "", status: "inactive" }, categories: categoryRows.map((row) => ({ ...categoryFromRow(row), videos: videosByCategory.get(row.id) ?? [] })) } };
}

function backgroundFromRow(row: BackgroundRow) {
  return { videoUrl: row.video_url, posterUrl: row.poster_url, status: row.status, updatedAt: iso(row.updated_at) };
}

function categoryFromRow(row: CategoryRow) {
  return { id: row.id, code: row.code, name: row.name, status: row.status, sortOrder: Number(row.sort_order), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

function videoFromRow(row: VideoRow): HomeVideo {
  return { id: row.id, categoryId: row.category_id, title: row.title, subtitle: row.subtitle, coverUrl: row.cover_url, videoUrl: row.video_url, durationLabel: row.duration_label, coverAlt: row.cover_alt, status: row.status, sortOrder: Number(row.sort_order), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

function normalizeId(value: unknown) { return String(value ?? "").trim() || null; }
function normalizeSortOrder(value: unknown) { const number = Number(value ?? 100); return Number.isFinite(number) ? Math.max(-100000, Math.min(100000, Math.round(number))) : 100; }
function normalizeStatus(value: unknown): HomeStatus | null { const status = String(value ?? "active").trim().toLowerCase(); return allowedStatuses.has(status) ? status as HomeStatus : null; }
function validNow(value: unknown) { return value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date(); }
function iso(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function isSafeMediaUrl(value: string) { return (value.startsWith("/") && !value.startsWith("//")) || /^https?:\/\//i.test(value); }
function isUniqueViolation(value: unknown) { return typeof value === "object" && value !== null && "code" in value && value.code === "23505"; }
function error(status: number, code: string, message: string): MutationResponse { return { status, body: { error: { code, message } } }; }

type HomeStatus = "active" | "inactive";
interface CategoryRow { id: string; code: string; name: string; status: HomeStatus; sort_order: number; created_at: Date | string; updated_at: Date | string; }
interface BackgroundRow { video_url: string; poster_url: string; status: HomeStatus; updated_at: Date | string; }
interface VideoRow { id: string; category_id: string; title: string; subtitle: string; cover_url: string; video_url: string; duration_label: string; cover_alt: string; status: HomeStatus; sort_order: number; created_at: Date | string; updated_at: Date | string; }
interface HomeVideo { id: string; categoryId: string; title: string; subtitle: string; coverUrl: string; videoUrl: string; durationLabel: string; coverAlt: string; status: HomeStatus; sortOrder: number; createdAt: string; updatedAt: string; }
interface SaveCategoryInput { id?: unknown; code?: unknown; name?: unknown; status?: unknown; sortOrder?: unknown; actorAdminAccountId?: unknown; now?: Date; }
interface SaveVideoInput { id?: unknown; categoryId?: unknown; title?: unknown; subtitle?: unknown; coverUrl?: unknown; videoUrl?: unknown; durationLabel?: unknown; coverAlt?: unknown; status?: unknown; sortOrder?: unknown; actorAdminAccountId?: unknown; now?: Date; }
interface SaveBackgroundInput { videoUrl?: unknown; posterUrl?: unknown; status?: unknown; actorAdminAccountId?: unknown; now?: Date; }
interface DeleteInput { id?: unknown; actorAdminAccountId?: unknown; now?: Date; }
type MutationResponse = { status: number; body: Record<string, unknown> };
