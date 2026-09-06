import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export const skillCategories = [
  "recommended",
  "professional-film",
  "commercial-ad",
  "short-drama",
  "animation-game",
  "music-video",
  "creator",
  "general",
] as const;

export type SkillCategory = (typeof skillCategories)[number];

export class SkillPlazaError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function normalizeCategory(value: unknown): SkillCategory | null {
  const category = String(value ?? "").trim();
  return skillCategories.includes(category as SkillCategory) ? category as SkillCategory : null;
}

function skillUrl(id: string) {
  return `/api/creator/skills/${encodeURIComponent(id)}`;
}

function mapSkill(row: Record<string, unknown>) {
  const detail = row.detail_json && typeof row.detail_json === "object" && !Array.isArray(row.detail_json)
    ? row.detail_json as Record<string, unknown>
    : {};
  const fileListPublic = detail.fileListPublic === undefined
    ? row.owner_user_id == null
    : detail.fileListPublic === true || detail.fileListPublic === "true" || detail.fileListPublic === 1 || detail.fileListPublic === "1";
  return {
    id: row.id,
    name: row.name,
    title: row.name,
    status: row.status ?? null,
    visibility: row.visibility ?? null,
    ownerUserId: row.owner_user_id ?? null,
    summary: row.summary ?? "",
    category: row.category,
    author: {
      name: row.author_name ?? "官方",
      avatarUrl: row.author_avatar_url ?? null,
    },
    authorName: row.author_name ?? "官方",
    authorAvatarUrl: row.author_avatar_url ?? null,
    coverUrl: String(detail.effectImageUrl ?? "").trim() || (row.cover_storage_object_id ? `/api/storage/objects/${row.cover_storage_object_id}/content?proxy=1` : String(detail.coverUrl ?? "").trim() || null),
    previewUrl: String(detail.effectVideoUrl ?? "").trim() || (row.preview_storage_object_id ? `/api/storage/objects/${row.preview_storage_object_id}/content?proxy=1` : String(detail.previewUrl ?? "").trim() || null),
    usageCount: Number(row.usage_count ?? 0),
    favoriteCount: Number(row.favorite_count ?? 0),
    isInLibrary: Boolean(row.is_in_library),
    isFavorite: Boolean(row.is_favorite),
    isMine: Boolean(row.is_mine),
    detail: {
      introduction: detail.introduction ?? detail.intro ?? row.summary ?? "",
      usageScene: detail.usageScene ?? detail.scenarios ?? "",
      howToUse: detail.howToUse ?? detail.usage ?? "",
      outputContent: detail.outputContent ?? detail.output ?? "",
      effectImageUrl: detail.effectImageUrl ?? "",
      effectVideoUrl: detail.effectVideoUrl ?? "",
      fileListPublic,
      workflow: Array.isArray(detail.workflow) ? detail.workflow : [],
    },
    url: skillUrl(String(row.id)),
  };
}

export function createSkillPlazaService(deps: { db: SqlDatabase }) {
  async function listCatalog(input: { userId?: string | null; category?: unknown; query?: unknown; page?: number; pageSize?: number }) {
    const category = normalizeCategory(input.category);
    const query = String(input.query ?? "").trim();
    const pageSize = Math.min(50, Math.max(1, Number(input.pageSize) || 20));
    const page = Math.max(1, Number(input.page) || 1);
    const offset = (page - 1) * pageSize;
    const userId = input.userId ?? null;
    const result = await deps.db.query<Record<string, unknown>>(
      `
        SELECT skill.*, EXISTS (
          SELECT 1 FROM skill_library library WHERE library.skill_id = skill.id AND library.user_id = $1
        ) AS is_in_library,
        EXISTS (SELECT 1 FROM skill_favorites favorite WHERE favorite.skill_id = skill.id AND favorite.user_id = $1) AS is_favorite,
        false AS is_mine
        FROM skills skill
        WHERE skill.status = 'published' AND skill.visibility = 'public'
          AND ($2::text IS NULL OR skill.category = $2)
          AND ($3::text = '' OR lower(skill.name || ' ' || skill.summary) LIKE '%' || lower($3) || '%')
        ORDER BY skill.usage_count DESC, skill.favorite_count DESC, skill.updated_at DESC
        LIMIT $4 OFFSET $5
      `,
      [userId, category, query, pageSize, offset],
    );
    const count = await queryOne<{ count: string }>(deps.db,
      `SELECT COUNT(*)::text AS count FROM skills WHERE status = 'published' AND visibility = 'public' AND ($1::text IS NULL OR category = $1) AND ($2::text = '' OR lower(name || ' ' || summary) LIKE '%' || lower($2) || '%')`,
      [category, query],
    );
    return {
      items: result.rows.map(mapSkill),
      page,
      pageSize,
      total: Number(count?.count ?? 0),
      totalPages: Math.max(1, Math.ceil(Number(count?.count ?? 0) / pageSize)),
    };
  }

  async function listLibrary(userId: string) {
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT skill.*, true AS is_in_library, EXISTS (
         SELECT 1 FROM skill_favorites favorite WHERE favorite.skill_id = skill.id AND favorite.user_id = $1
       ) AS is_favorite
       FROM skill_library library JOIN skills skill ON skill.id = library.skill_id
       WHERE library.user_id = $1 AND skill.status <> 'disabled' AND skill.owner_user_id IS DISTINCT FROM $1
       ORDER BY library.created_at DESC`,
      [userId],
    );
    return { items: result.rows.map(mapSkill) };
  }

  async function listFavorites(userId: string) {
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT skill.*, true AS is_favorite, EXISTS (
         SELECT 1 FROM skill_library library WHERE library.skill_id = skill.id AND library.user_id = $1
       ) AS is_in_library, false AS is_mine
       FROM skill_favorites favorite JOIN skills skill ON skill.id = favorite.skill_id
       WHERE favorite.user_id = $1 AND skill.status <> 'disabled'
       ORDER BY favorite.created_at DESC`,
      [userId],
    );
    return { items: result.rows.map(mapSkill) };
  }

  async function listMine(userId: string) {
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT skill.*, EXISTS (
       SELECT 1 FROM skill_library library WHERE library.skill_id = skill.id AND library.user_id = $1
       ) AS is_in_library, EXISTS (SELECT 1 FROM skill_favorites favorite WHERE favorite.skill_id = skill.id AND favorite.user_id = $1) AS is_favorite, true AS is_mine
       FROM skills skill
       WHERE skill.owner_user_id = $1
       ORDER BY skill.updated_at DESC, skill.created_at DESC`,
      [userId],
    );
    return { items: result.rows.map(mapSkill) };
  }

  async function listAdmin(input: { status?: unknown; query?: unknown }) {
    const status = ["draft", "published", "disabled"].includes(String(input.status ?? "")) ? String(input.status) : null;
    const query = String(input.query ?? "").trim();
    const result = await deps.db.query<Record<string, unknown>>(
      `SELECT skill.*, COALESCE(NULLIF(skill.author_name, ''), NULLIF(owner.display_name, ''), owner.phone_e164, '未知用户') AS owner_display_name,
          (SELECT COUNT(*) FROM skill_files file WHERE file.skill_id = skill.id) AS file_count
       FROM skills skill LEFT JOIN users owner ON owner.id = skill.owner_user_id
       WHERE ($1::text IS NULL OR skill.status = $1)
         AND ($2::text = '' OR lower(skill.name || ' ' || skill.summary || ' ' || COALESCE(skill.author_name, '')) LIKE '%' || lower($2) || '%')
       ORDER BY skill.updated_at DESC, skill.created_at DESC`,
      [status, query],
    );
    return { items: result.rows.map((row) => ({
      ...mapSkill(row),
      ownerName: row.owner_display_name ?? "未知用户",
      fileCount: Number(row.file_count ?? 0) || (Array.isArray((row.detail_json as Record<string, unknown> | null)?.files) ? ((row.detail_json as Record<string, unknown>).files as unknown[]).length : 0),
    })) };
  }

  async function updateStatus(input: { skillId: string; status: unknown }) {
    const status = String(input.status ?? "").trim();
    if (!["draft", "published", "disabled"].includes(status)) {
      throw new SkillPlazaError(400, "invalid_skill_status", "Skill 状态不支持");
    }
    const row = await queryOne<Record<string, unknown>>(
      deps.db,
      `UPDATE skills SET status = $2, visibility = CASE WHEN $2 = 'published' THEN 'public' ELSE 'private' END, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [input.skillId, status],
    );
    if (!row) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在");
    return mapSkill(row);
  }

  async function updateOfficial(input: { skillId: string; name: string; summary?: string; category?: unknown; detail?: unknown; status?: unknown; files?: unknown }) {
    const current = await queryOne<Record<string, unknown>>(deps.db, "SELECT * FROM skills WHERE id = $1 AND owner_user_id IS NULL", [input.skillId]);
    if (!current) throw new SkillPlazaError(404, "official_skill_not_found", "官方 Skill 不存在");
    const name = String(input.name ?? "").trim();
    if (!name) throw new SkillPlazaError(400, "skill_name_required", "Skill 名称不能为空");
    const category = normalizeCategory(input.category) ?? String(current.category ?? "general");
    const status = ["draft", "published", "disabled"].includes(String(input.status ?? current.status)) ? String(input.status ?? current.status) : String(current.status ?? "draft");
    const previousDetail = current.detail_json && typeof current.detail_json === "object" && !Array.isArray(current.detail_json) ? current.detail_json as Record<string, unknown> : {};
    const detail = input.detail && typeof input.detail === "object" && !Array.isArray(input.detail) ? { ...previousDetail, ...(input.detail as Record<string, unknown>) } : { ...previousDetail };
    const effectImageUrl = String(detail.effectImageUrl ?? "").trim();
    const effectVideoUrl = String(detail.effectVideoUrl ?? "").trim();
    if (effectImageUrl && effectVideoUrl) throw new SkillPlazaError(400, "skill_effect_media_conflict", "效果图和效果视频只能选择一个");
    detail.effectImageUrl = effectImageUrl;
    detail.effectVideoUrl = effectVideoUrl;
    if (Array.isArray(input.files)) {
      const files = input.files.map((file) => ({ name: String((file as Record<string, unknown>)?.name ?? "").trim(), kind: String((file as Record<string, unknown>)?.kind ?? "instruction").trim() || "instruction", content: String((file as Record<string, unknown>)?.content ?? "") })).filter((file) => file.name && file.content);
      if (files.length > 10) throw new SkillPlazaError(400, "skill_files_too_many", "Skill 文件最多上传 10 个");
      if (files.some((file) => file.content.length > 5 * 1024 * 1024)) throw new SkillPlazaError(400, "skill_file_too_large", "单个 Skill 文件不能超过 5 MB");
      detail.files = files;
    }
    const row = await queryOne<Record<string, unknown>>(deps.db, "UPDATE skills SET name = $2, summary = $3, category = $4, author_name = '官方', detail_json = $5::jsonb, status = $6, visibility = CASE WHEN $6 = 'published' THEN 'public' ELSE 'private' END, updated_at = now() WHERE id = $1 AND owner_user_id IS NULL RETURNING *", [input.skillId, name, String(input.summary ?? "").trim(), category, JSON.stringify(detail), status]);
    return mapSkill({ ...row, is_in_library: false, is_favorite: false, is_mine: false });
  }

  async function createOfficial(input: { name: string; summary?: string; category?: unknown; detail?: unknown; status?: unknown; files?: unknown }) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new SkillPlazaError(400, "skill_name_required", "Skill 名称不能为空");
    const category = normalizeCategory(input.category) ?? "general";
    const status = ["draft", "published", "disabled"].includes(String(input.status ?? "draft"))
      ? String(input.status ?? "draft")
      : "draft";
    const detail = input.detail && typeof input.detail === "object" && !Array.isArray(input.detail) ? { ...(input.detail as Record<string, unknown>) } : {};
    const effectImageUrl = String(detail.effectImageUrl ?? "").trim();
    const effectVideoUrl = String(detail.effectVideoUrl ?? "").trim();
    if (effectImageUrl && effectVideoUrl) throw new SkillPlazaError(400, "skill_effect_media_conflict", "效果图和效果视频只能选择一个");
    detail.effectImageUrl = effectImageUrl;
    detail.effectVideoUrl = effectVideoUrl;
    const files = Array.isArray(input.files) ? input.files.map((file) => ({
      name: String((file as Record<string, unknown>)?.name ?? "").trim(),
      kind: String((file as Record<string, unknown>)?.kind ?? "instruction").trim() || "instruction",
      content: String((file as Record<string, unknown>)?.content ?? ""),
    })).filter((file) => file.name && file.content) : [];
    if (files.length > 10) throw new SkillPlazaError(400, "skill_files_too_many", "Skill 文件最多上传 10 个");
    if (files.some((file) => file.content.length > 5 * 1024 * 1024)) throw new SkillPlazaError(400, "skill_file_too_large", "单个 Skill 文件不能超过 5 MB");
    detail.files = files;
    const row = await queryOne<Record<string, unknown>>(deps.db,
      `INSERT INTO skills (id, owner_user_id, name, summary, category, author_name, detail_json, status, visibility)
       VALUES ($1, NULL, $2, $3, $4, '官方', $5::jsonb, $6, CASE WHEN $6 = 'published' THEN 'public' ELSE 'private' END)
       RETURNING *`,
      [randomUUID(), name, String(input.summary ?? "").trim(), category, JSON.stringify(detail), status],
    );
    if (!row) throw new SkillPlazaError(400, "skill_create_failed", "官方 Skill 创建失败");
    return mapSkill({ ...row, is_in_library: false, is_favorite: false, is_mine: false });
  }

  async function getDetail(input: { skillId: string; userId?: string | null }) {
    const row = await queryOne<Record<string, unknown>>(
      deps.db,
      `SELECT skill.*, EXISTS (SELECT 1 FROM skill_library library WHERE library.skill_id = skill.id AND library.user_id = $2) AS is_in_library,
        EXISTS (SELECT 1 FROM skill_favorites favorite WHERE favorite.skill_id = skill.id AND favorite.user_id = $2) AS is_favorite, (skill.owner_user_id = $2) AS is_mine
       FROM skills skill WHERE skill.id = $1 AND (skill.visibility = 'public' OR skill.owner_user_id = $2)`,
      [input.skillId, input.userId ?? null],
    );
    if (!row) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在或不可见");
    const mappedSkill = mapSkill(row);
    const isOwner = Boolean(input.userId && row.owner_user_id && String(row.owner_user_id) === String(input.userId));
    const canViewFiles = isOwner || mappedSkill.detail.fileListPublic === true;
    const files = canViewFiles ? await deps.db.query<Record<string, unknown>>(
      `SELECT id, storage_object_id, file_name, file_kind, sort_order FROM skill_files WHERE skill_id = $1 ORDER BY sort_order, file_name`,
      [input.skillId],
    ) : { rows: [] };
    const persistedFiles = files.rows.length ? files.rows.map((file) => ({
      id: file.id,
      storageObjectId: file.storage_object_id,
      name: file.file_name,
      fileName: file.file_name,
      kind: file.file_kind,
      sortOrder: Number(file.sort_order ?? 0),
      contentUrl: `/api/storage/objects/${encodeURIComponent(String(file.storage_object_id))}/content?proxy=1`,
    })) : (((row.detail_json as Record<string, unknown> | null)?.files as Array<Record<string, unknown>> | undefined) ?? []).map((file, index) => ({
      id: `${String(input.skillId)}-file-${index}`,
      storageObjectId: null,
      name: file.name,
      fileName: file.name,
      kind: file.kind ?? "instruction",
      sortOrder: index,
      content: file.content,
    }));
    return { skill: mappedSkill, files: persistedFiles };
  }

  async function create(input: { userId: string; name: string; summary?: string; category?: unknown; detail?: unknown; coverStorageObjectId?: string | null; previewStorageObjectId?: string | null }) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new SkillPlazaError(400, "skill_name_required", "Skill 名称不能为空");
    const category = normalizeCategory(input.category) ?? "general";
    const detail = input.detail && typeof input.detail === "object" && !Array.isArray(input.detail) ? input.detail : {};
    const requestedFileListPublic = (detail as Record<string, unknown>).fileListPublic;
    const fileListPublic = requestedFileListPublic === true || requestedFileListPublic === "true" || requestedFileListPublic === 1 || requestedFileListPublic === "1";
    (detail as Record<string, unknown>).fileListPublic = fileListPublic;
    const effectImageUrl = String((detail as Record<string, unknown>).effectImageUrl ?? "").trim();
    const effectVideoUrl = String((detail as Record<string, unknown>).effectVideoUrl ?? "").trim();
    if (effectImageUrl && effectVideoUrl) throw new SkillPlazaError(400, "skill_effect_media_conflict", "效果图和效果视频只能选择一个");
    const row = await queryOne<Record<string, unknown>>(deps.db,
      `INSERT INTO skills (id, owner_user_id, name, summary, category, author_name, cover_storage_object_id, preview_storage_object_id, detail_json, status, visibility)
       SELECT $1, $2, $3, $4, $5, COALESCE(display_name, ''), $6, $7, $8::jsonb, 'draft', 'private' FROM users WHERE id = $2 RETURNING *`,
      [randomUUID(), input.userId, name, String(input.summary ?? "").trim(), category, input.coverStorageObjectId ?? null, input.previewStorageObjectId ?? null, JSON.stringify(detail)],
    );
    if (!row) throw new SkillPlazaError(400, "user_not_found", "用户不存在");
    return mapSkill({ ...row, is_in_library: true, is_favorite: false });
  }

  async function addToLibrary(userId: string, skillId: string) {
    const skill = await queryOne<{ id: string }>(deps.db, "SELECT id FROM skills WHERE id = $1 AND status = 'published' AND visibility = 'public' AND owner_user_id IS DISTINCT FROM $2", [skillId, userId]);
    if (!skill) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在或不可添加");
    await deps.db.query("INSERT INTO skill_library (id, skill_id, user_id) VALUES ($1, $2, $3) ON CONFLICT (skill_id, user_id) DO NOTHING", [randomUUID(), skillId, userId]);
    return { skillId, added: true };
  }

  async function addToFavorites(userId: string, skillId: string) {
    const skill = await queryOne<{ id: string }>(deps.db, "SELECT id FROM skills WHERE id = $1 AND status = 'published' AND visibility = 'public'", [skillId]);
    if (!skill) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在或不可收藏");
    await deps.db.query("INSERT INTO skill_favorites (id, skill_id, user_id) VALUES ($1, $2, $3) ON CONFLICT (skill_id, user_id) DO NOTHING", [randomUUID(), skillId, userId]);
    await deps.db.query("UPDATE skills SET favorite_count = (SELECT COUNT(*) FROM skill_favorites WHERE skill_id = $1), updated_at = now() WHERE id = $1", [skillId]);
    return { skillId, favorited: true };
  }

  async function removeFromFavorites(userId: string, skillId: string) {
    const skill = await queryOne<{ id: string }>(deps.db, "SELECT id FROM skills WHERE id = $1 AND status = 'published' AND visibility = 'public'", [skillId]);
    if (!skill) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在或不可取消收藏");
    await deps.db.query("DELETE FROM skill_favorites WHERE skill_id = $1 AND user_id = $2", [skillId, userId]);
    await deps.db.query("UPDATE skills SET favorite_count = (SELECT COUNT(*) FROM skill_favorites WHERE skill_id = $1), updated_at = now() WHERE id = $1", [skillId]);
    return { skillId, favorited: false };
  }

  async function attachFile(input: { userId: string; skillId: string; storageObjectId: string; fileName: string; fileKind?: string; sortOrder?: number }) {
    const skill = await queryOne<{ id: string }>(deps.db, "SELECT id FROM skills WHERE id = $1 AND owner_user_id = $2", [input.skillId, input.userId]);
    const object = await queryOne<{ id: string }>(deps.db, "SELECT id FROM storage_objects WHERE id = $1 AND created_by_user_id = $2 AND status = 'available'", [input.storageObjectId, input.userId]);
    if (!skill || !object) throw new SkillPlazaError(404, "skill_file_scope_invalid", "Skill 文件对象不可用");
    const fileName = String(input.fileName ?? "").trim();
    if (!fileName) throw new SkillPlazaError(400, "skill_file_name_required", "Skill 文件名不能为空");
    const fileKind = ["instruction", "template", "example", "script", "other"].includes(String(input.fileKind)) ? String(input.fileKind) : "instruction";
    await deps.db.query(
      `INSERT INTO skill_files (id, skill_id, storage_object_id, file_name, file_kind, sort_order) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (skill_id, file_name) DO UPDATE SET storage_object_id = EXCLUDED.storage_object_id, file_kind = EXCLUDED.file_kind, sort_order = EXCLUDED.sort_order`,
      [randomUUID(), input.skillId, input.storageObjectId, fileName, fileKind, Math.max(0, Number(input.sortOrder) || 0)],
    );
    return { skillId: input.skillId, storageObjectId: input.storageObjectId, fileName, fileKind };
  }

  return { listCatalog, listLibrary, listFavorites, listMine, listAdmin, updateStatus, updateOfficial, createOfficial, getDetail, create, addToLibrary, addToFavorites, removeFromFavorites, attachFile };
}
