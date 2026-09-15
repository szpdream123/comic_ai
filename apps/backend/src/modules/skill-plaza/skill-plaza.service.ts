import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export const skillCategories = [
  "professional-film",
  "commercial-ad",
  "short-drama",
  "animation-game",
  "music-video",
  "creator",
  "general",
  "project-workflow",
] as const;

export type SkillCategory = (typeof skillCategories)[number];

const fallbackSkillCategoryMeta: Record<string, { name: string; shortName: string }> = {
  recommended: { name: "推荐", shortName: "推荐" },
  "professional-film": { name: "专业影视", shortName: "影视" },
  "commercial-ad": { name: "商业广告", shortName: "广告" },
  "short-drama": { name: "短剧漫剧", shortName: "短剧" },
  "animation-game": { name: "动漫游戏", shortName: "动漫" },
  "music-video": { name: "音乐MV", shortName: "MV" },
  creator: { name: "自媒体创作", shortName: "自媒体" },
  general: { name: "通用技能", shortName: "通用" },
  "project-workflow": { name: "项目工作流", shortName: "工作流" },
};

export const plazaWorkflowStages = ["script", "scene", "character", "prop", "shot"] as const;
export type PlazaWorkflowStage = (typeof plazaWorkflowStages)[number];

const PLAZA_WORKFLOW_STAGE_ALIASES: Record<string, PlazaWorkflowStage> = {
  script: "script",
  剧本: "script",
  转剧本: "script",
  screenplay: "script",
  scene: "scene",
  scenes: "scene",
  scene_extract: "scene",
  "scene-extract": "scene",
  场景: "scene",
  character: "character",
  characters: "character",
  character_extract: "character",
  "character-extract": "character",
  角色: "character",
  人物: "character",
  prop: "prop",
  props: "prop",
  prop_extract: "prop",
  "prop-extract": "prop",
  道具: "prop",
  shot: "shot",
  shots: "shot",
  storyboard: "shot",
  storyboards: "shot",
  分镜: "shot",
  拆镜: "shot",
};

function normalizePlazaWorkflowStageToken(value: unknown): PlazaWorkflowStage | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const direct = PLAZA_WORKFLOW_STAGE_ALIASES[raw] ?? PLAZA_WORKFLOW_STAGE_ALIASES[raw.toLowerCase()];
  if (direct) return direct;
  const compact = raw.toLowerCase().replace(/[\s_/]+/g, "-");
  return PLAZA_WORKFLOW_STAGE_ALIASES[compact] ?? null;
}

function collectPlazaWorkflowStagesFromText(text: string, collected: Set<PlazaWorkflowStage>) {
  const source = String(text ?? "");
  if (!source.trim()) return;
  if (/转剧本|小说转剧本|screenplay|\bscript\b/i.test(source)) collected.add("script");
  if (/场景|scene(?!board)/i.test(source)) collected.add("scene");
  if (/角色|人物|character/i.test(source)) collected.add("character");
  if (/道具|\bprops?\b/i.test(source)) collected.add("prop");
  if (/分镜|拆镜|storyboard|\bshots?\b/i.test(source)) collected.add("shot");
}

function collectPlazaWorkflowStagesFromFileName(fileName: string, collected: Set<PlazaWorkflowStage>) {
  const name = String(fileName ?? "").replace(/\\/g, "/").toLowerCase();
  if (!name) return;
  if (/(?:^|\/)(?:script|screenplay|转剧本)/.test(name)) collected.add("script");
  if (/(?:^|\/)(?:scene[-_]?extract|scenes?)(?:[-_.]|$)/.test(name) || name.includes("场景")) collected.add("scene");
  if (/(?:^|\/)(?:character[-_]?extract|characters?)(?:[-_.]|$)/.test(name) || name.includes("角色") || name.includes("人物")) collected.add("character");
  if (/(?:^|\/)(?:prop[-_]?extract|props?)(?:[-_.]|$)/.test(name) || name.includes("道具")) collected.add("prop");
  if (/(?:^|\/)(?:shot|storyboard)s?(?:[-_.]|$)/.test(name) || name.includes("分镜") || name.includes("拆镜")) collected.add("shot");
}

export function resolvePlazaSkillWorkflowStages(
  skills: Array<{
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    outputContent?: string | null;
    workflow?: unknown;
    files?: Array<{ name?: string | null; fileName?: string | null } | string> | null;
  }>,
  options: { skipScriptStage?: boolean } = {},
) {
  const collected = new Set<PlazaWorkflowStage>();
  for (const skill of Array.isArray(skills) ? skills : []) {
    const workflow = Array.isArray(skill?.workflow) ? skill.workflow : [];
    const explicitStages = workflow
      .map((item) => {
        const token = item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>).stage
            ?? (item as Record<string, unknown>).id
            ?? (item as Record<string, unknown>).key
            ?? (item as Record<string, unknown>).label
            ?? (item as Record<string, unknown>).name
          : item;
        return normalizePlazaWorkflowStageToken(token);
      })
      .filter((stage): stage is PlazaWorkflowStage => Boolean(stage));
    if (explicitStages.length) {
      for (const stage of explicitStages) collected.add(stage);
      continue;
    }
    for (const file of Array.isArray(skill?.files) ? skill.files : []) {
      const fileName = typeof file === "string"
        ? file
        : String(file?.name ?? file?.fileName ?? "");
      collectPlazaWorkflowStagesFromFileName(fileName, collected);
    }
    collectPlazaWorkflowStagesFromText([
      skill?.title,
      skill?.summary,
      skill?.outputContent,
      skill?.content,
    ].filter(Boolean).join("\n"), collected);
  }
  if (options.skipScriptStage === true) collected.delete("script");
  return plazaWorkflowStages.filter((stage) => collected.has(stage));
}

export class SkillPlazaError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function fallbackCategoryRows() {
  return [
    { id: "recommended", code: "recommended", name: fallbackSkillCategoryMeta.recommended.name, short_name: fallbackSkillCategoryMeta.recommended.shortName, sort_order: 10, is_visible: true, is_system: true, is_skill_category: false, created_at: null, updated_at: null },
    ...skillCategories.map((code, index) => ({
      id: code,
      code,
      name: fallbackSkillCategoryMeta[code]?.name ?? code,
      short_name: fallbackSkillCategoryMeta[code]?.shortName ?? code,
      sort_order: (index + 2) * 10,
      is_visible: true,
      is_system: false,
      is_skill_category: true,
      created_at: null,
      updated_at: null,
    })),
  ];
}

function mapCategory(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    shortName: String(row.short_name ?? row.name ?? ""),
    sortOrder: Number(row.sort_order ?? 100),
    isVisible: row.is_visible !== false,
    isSystem: row.is_system === true,
    isSkillCategory: row.is_skill_category !== false,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function isUniqueViolation(value: unknown) {
  return typeof value === "object" && value !== null && "code" in value && (value as { code?: unknown }).code === "23505";
}

function normalizeCategoryCode(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeBooleanFlag(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === 1 || value === "1" || value === "on";
}

function normalizeSortOrder(value: unknown) {
  const number = Number(value ?? 100);
  return Number.isFinite(number) ? Math.max(-100000, Math.min(100000, Math.round(number))) : 100;
}

async function loadCategoryRows(db: SqlDatabase) {
  try {
    const result = await db.query<Record<string, unknown>>(
      `SELECT id, code, name, short_name, sort_order, is_visible, is_system, is_skill_category, created_at, updated_at
       FROM skill_categories
       ORDER BY sort_order ASC, created_at ASC`,
    );
    return result.rows.length ? result.rows : fallbackCategoryRows();
  } catch {
    return fallbackCategoryRows();
  }
}

async function normalizeCategory(db: SqlDatabase, value: unknown): Promise<string | null> {
  const category = normalizeCategoryCode(value);
  if (!category || category === "recommended") return null;
  const rows = await loadCategoryRows(db);
  const match = rows.find((row) => String(row.code) === category && row.is_skill_category !== false);
  return match ? String(match.code) : null;
}

function normalizeRecommended(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1" || value === "on";
}

function skillUrl(id: string) {
  return `/api/creator/skills/${encodeURIComponent(id)}`;
}

function skillStorageProxyUrl(storageObjectId: unknown) {
  const id = String(storageObjectId ?? "").trim();
  return id ? `/api/storage/objects/${encodeURIComponent(id)}/content?proxy=1` : "";
}

function skillMediaUrl(value: unknown, storageObjectId: unknown) {
  const raw = String(value ?? "").trim();
  const proxy = skillStorageProxyUrl(storageObjectId);
  if (!raw) return proxy;
  if (raw.includes("/api/storage/objects/")) return raw;
  return proxy || raw;
}

function normalizeSkillFileName(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return normalized.slice(0, 240);
}

const SKILL_LIST_SELECT = `skill.id, skill.owner_user_id, skill.name, skill.summary, skill.category, skill.author_name, skill.author_avatar_url, skill.cover_storage_object_id, skill.preview_storage_object_id, skill.status, skill.visibility, skill.usage_count, skill.favorite_count, skill.created_at, skill.updated_at, skill.review_comment, skill.reviewed_at, skill.is_recommended, (skill.detail_json - 'files') AS detail_json`;

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
    isRecommended: Boolean(row.is_recommended),
    coverUrl: skillMediaUrl(detail.effectImageUrl ?? detail.coverUrl, row.cover_storage_object_id) || null,
    previewUrl: skillMediaUrl(detail.effectVideoUrl ?? detail.previewUrl, row.preview_storage_object_id) || null,
    usageCount: Number(row.usage_count ?? 0),
    favoriteCount: Number(row.favorite_count ?? 0),
    reviewComment: String(row.review_comment ?? "").trim(),
    reviewedAt: row.reviewed_at ?? null,
    isInLibrary: Boolean(row.is_in_library),
    isFavorite: Boolean(row.is_favorite),
    isMine: Boolean(row.is_mine),
    detail: {
      introduction: detail.introduction ?? detail.intro ?? row.summary ?? "",
      usageScene: detail.usageScene ?? detail.scenarios ?? "",
      howToUse: detail.howToUse ?? detail.usage ?? "",
      outputContent: detail.outputContent ?? detail.output ?? "",
      effectImageUrl: skillMediaUrl(detail.effectImageUrl, row.cover_storage_object_id),
      effectVideoUrl: skillMediaUrl(detail.effectVideoUrl, row.preview_storage_object_id),
      fileListPublic,
      workflow: Array.isArray(detail.workflow) ? detail.workflow : [],
    },
    url: skillUrl(String(row.id)),
  };
}

export function createSkillPlazaService(deps: {
  db: SqlDatabase;
  readSkillFileContent?: (storageObjectId: string) => Promise<string | null>;
}) {
  async function listCatalog(input: { userId?: string | null; category?: unknown; query?: unknown; page?: number; pageSize?: number }) {
    const requestedCategory = String(input.category ?? "").trim();
    const recommendedOnly = requestedCategory === "recommended";
    const category = recommendedOnly ? null : await normalizeCategory(deps.db, input.category);
    const query = String(input.query ?? "").trim();
    const pageSize = Math.min(50, Math.max(1, Number(input.pageSize) || 20));
    const page = Math.max(1, Number(input.page) || 1);
    const offset = (page - 1) * pageSize;
    const userId = input.userId ?? null;
    const result = await deps.db.query<Record<string, unknown>>(
      `
        SELECT ${SKILL_LIST_SELECT}, EXISTS (
          SELECT 1 FROM skill_library library WHERE library.skill_id = skill.id AND library.user_id = $1
        ) AS is_in_library,
        EXISTS (SELECT 1 FROM skill_favorites favorite WHERE favorite.skill_id = skill.id AND favorite.user_id = $1) AS is_favorite,
        false AS is_mine
        FROM skills skill
        WHERE skill.status = 'published' AND skill.visibility = 'public'
          AND ($2::boolean IS NOT TRUE OR skill.is_recommended = true)
          AND ($3::text IS NULL OR skill.category = $3)
          AND ($4::text = '' OR lower(skill.name || ' ' || skill.summary) LIKE '%' || lower($4) || '%')
        ORDER BY skill.usage_count DESC, skill.favorite_count DESC, skill.updated_at DESC
        LIMIT $5 OFFSET $6
      `,
      [userId, recommendedOnly, category, query, pageSize, offset],
    );
    const count = await queryOne<{ count: string }>(deps.db,
      `SELECT COUNT(*)::text AS count FROM skills WHERE status = 'published' AND visibility = 'public' AND ($1::boolean IS NOT TRUE OR is_recommended = true) AND ($2::text IS NULL OR category = $2) AND ($3::text = '' OR lower(name || ' ' || summary) LIKE '%' || lower($3) || '%')`,
      [recommendedOnly, category, query],
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
      `SELECT ${SKILL_LIST_SELECT}, true AS is_in_library, EXISTS (
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
      `SELECT ${SKILL_LIST_SELECT}, true AS is_favorite, EXISTS (
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
      `SELECT ${SKILL_LIST_SELECT}, EXISTS (
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
    const status = ["draft", "published", "disabled", "rejected"].includes(String(input.status ?? "")) ? String(input.status) : null;
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
      fileCount: Math.max(
        Number(row.file_count ?? 0),
        Array.isArray((row.detail_json as Record<string, unknown> | null)?.files)
          ? ((row.detail_json as Record<string, unknown>).files as unknown[]).length
          : 0,
      ),
    })) };
  }

  async function updateStatus(input: { skillId: string; status: unknown; reviewComment?: unknown }) {
    const status = String(input.status ?? "").trim();
    if (!["draft", "published", "disabled", "rejected"].includes(status)) {
      throw new SkillPlazaError(400, "invalid_skill_status", "Skill 状态不支持");
    }
    const reviewComment = String(input.reviewComment ?? "").trim();
    if ((status === "published" || status === "rejected") && !reviewComment) {
      throw new SkillPlazaError(400, "skill_review_comment_required", "审核意见不能为空");
    }
    const row = await queryOne<Record<string, unknown>>(
      deps.db,
      `UPDATE skills SET status = $2,
          visibility = CASE WHEN $2 = 'published' THEN 'public' ELSE 'private' END,
          review_comment = CASE WHEN $3 <> '' THEN $3 ELSE review_comment END,
          reviewed_at = CASE WHEN $2 IN ('published', 'rejected') OR $3 <> '' THEN now() ELSE reviewed_at END,
          updated_at = now()
       WHERE id = $1 RETURNING *`,
      [input.skillId, status, reviewComment],
    );
    if (!row) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在");
    return mapSkill(row);
  }

  async function updateRecommendation(input: { skillId: string; isRecommended: unknown }) {
    const isRecommended = normalizeRecommended(input.isRecommended);
    const row = await queryOne<Record<string, unknown>>(
      deps.db,
      `UPDATE skills SET is_recommended = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [input.skillId, isRecommended],
    );
    if (!row) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在");
    return mapSkill(row);
  }

  async function updateOfficial(input: { skillId: string; name: string; summary?: string; category?: unknown; detail?: unknown; status?: unknown; files?: unknown; isRecommended?: unknown }) {
    const current = await queryOne<Record<string, unknown>>(deps.db, "SELECT * FROM skills WHERE id = $1 AND owner_user_id IS NULL", [input.skillId]);
    if (!current) throw new SkillPlazaError(404, "official_skill_not_found", "官方 Skill 不存在");
    const name = String(input.name ?? "").trim();
    if (!name) throw new SkillPlazaError(400, "skill_name_required", "Skill 名称不能为空");
    const category = await normalizeCategory(deps.db, input.category) ?? (String(current.category ?? "general") === "recommended" ? "general" : String(current.category ?? "general"));
    const isRecommended = input.isRecommended === undefined ? Boolean(current.is_recommended) : normalizeRecommended(input.isRecommended);
    const status = ["draft", "published", "disabled", "rejected"].includes(String(input.status ?? current.status)) ? String(input.status ?? current.status) : String(current.status ?? "draft");
    const previousDetail = current.detail_json && typeof current.detail_json === "object" && !Array.isArray(current.detail_json) ? current.detail_json as Record<string, unknown> : {};
    const detail = input.detail && typeof input.detail === "object" && !Array.isArray(input.detail) ? { ...previousDetail, ...(input.detail as Record<string, unknown>) } : { ...previousDetail };
    const requestedFileListPublic = detail.fileListPublic;
    detail.fileListPublic = requestedFileListPublic === undefined
      ? (previousDetail.fileListPublic === undefined ? true : previousDetail.fileListPublic === true || previousDetail.fileListPublic === "true" || previousDetail.fileListPublic === 1 || previousDetail.fileListPublic === "1")
      : requestedFileListPublic === true || requestedFileListPublic === "true" || requestedFileListPublic === 1 || requestedFileListPublic === "1";
    const effectImageUrl = String(detail.effectImageUrl ?? "").trim();
    const effectVideoUrl = String(detail.effectVideoUrl ?? "").trim();
    if (effectImageUrl && effectVideoUrl) throw new SkillPlazaError(400, "skill_effect_media_conflict", "效果图和效果视频只能选择一个");
    detail.effectImageUrl = effectImageUrl;
    detail.effectVideoUrl = effectVideoUrl;
    if (Array.isArray(input.files)) {
      const files = input.files.map((file) => ({ name: String((file as Record<string, unknown>)?.name ?? "").trim(), kind: String((file as Record<string, unknown>)?.kind ?? "instruction").trim() || "instruction", content: String((file as Record<string, unknown>)?.content ?? "") })).filter((file) => file.name && file.content);
      if (files.length > 50) throw new SkillPlazaError(400, "skill_files_too_many", "Skill 文件最多上传 50 个");
      if (files.some((file) => file.content.length > 5 * 1024 * 1024)) throw new SkillPlazaError(400, "skill_file_too_large", "单个 Skill 文件不能超过 5 MB");
      detail.files = files;
    }
    const row = await queryOne<Record<string, unknown>>(deps.db, "UPDATE skills SET name = $2, summary = $3, category = $4, author_name = '官方', detail_json = $5::jsonb, status = $6, visibility = CASE WHEN $6 = 'published' THEN 'public' ELSE 'private' END, is_recommended = $7, updated_at = now() WHERE id = $1 AND owner_user_id IS NULL RETURNING *", [input.skillId, name, String(input.summary ?? "").trim(), category, JSON.stringify(detail), status, isRecommended]);
    return mapSkill({ ...row, is_in_library: false, is_favorite: false, is_mine: false });
  }

  async function createOfficial(input: { name: string; summary?: string; category?: unknown; detail?: unknown; status?: unknown; files?: unknown; isRecommended?: unknown }) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new SkillPlazaError(400, "skill_name_required", "Skill 名称不能为空");
    const category = await normalizeCategory(deps.db, input.category) ?? "general";
    const isRecommended = normalizeRecommended(input.isRecommended);
    const status = ["draft", "published", "disabled", "rejected"].includes(String(input.status ?? "draft"))
      ? String(input.status ?? "draft")
      : "draft";
    const detail = input.detail && typeof input.detail === "object" && !Array.isArray(input.detail) ? { ...(input.detail as Record<string, unknown>) } : {};
    const requestedFileListPublic = detail.fileListPublic;
    detail.fileListPublic = requestedFileListPublic === undefined
      ? true
      : requestedFileListPublic === true || requestedFileListPublic === "true" || requestedFileListPublic === 1 || requestedFileListPublic === "1";
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
    if (files.length > 50) throw new SkillPlazaError(400, "skill_files_too_many", "Skill 文件最多上传 50 个");
    if (files.some((file) => file.content.length > 5 * 1024 * 1024)) throw new SkillPlazaError(400, "skill_file_too_large", "单个 Skill 文件不能超过 5 MB");
    detail.files = files;
    const row = await queryOne<Record<string, unknown>>(deps.db,
      `INSERT INTO skills (id, owner_user_id, name, summary, category, author_name, detail_json, status, visibility, is_recommended)
       VALUES ($1, NULL, $2, $3, $4, '官方', $5::jsonb, $6, CASE WHEN $6 = 'published' THEN 'public' ELSE 'private' END, $7)
       RETURNING *`,
      [randomUUID(), name, String(input.summary ?? "").trim(), category, JSON.stringify(detail), status, isRecommended],
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
    return hydrateSkillDetail(row, input.userId);
  }

  async function resolveWorkflowSkill(input: { userId: string; skillId: string; now?: Date }) {
    const row = await queryOne<Record<string, unknown>>(
      deps.db,
      `SELECT skill.*, EXISTS (SELECT 1 FROM skill_library library WHERE library.skill_id = skill.id AND library.user_id = $2) AS is_in_library,
        EXISTS (SELECT 1 FROM skill_favorites favorite WHERE favorite.skill_id = skill.id AND favorite.user_id = $2) AS is_favorite, (skill.owner_user_id = $2) AS is_mine
       FROM skills skill
       WHERE skill.id = $1
         AND skill.status <> 'disabled'
         AND (
           (skill.status = 'published' AND skill.visibility = 'public')
           OR skill.owner_user_id = $2
           OR EXISTS (SELECT 1 FROM skill_library library WHERE library.skill_id = skill.id AND library.user_id = $2)
         )`,
      [input.skillId, input.userId],
    );
    if (!row) throw new SkillPlazaError(403, "workflow_plaza_skill_forbidden", "技能skill不存在或不可用");
    const hydrated = await hydrateSkillDetail(row, input.userId, { forceFiles: true });
    const files = Array.isArray(hydrated.files) ? hydrated.files : [];
    const skillMd = files.find((file) => String(file.name ?? file.fileName ?? "").replace(/\\/g, "/").split("/").pop()?.toLowerCase() === "skill.md");
    const instructionFiles = files
      .filter((file) => file !== skillMd && (file.kind === "instruction" || String(file.name ?? "").toLowerCase().endsWith(".md")))
      .map((file) => {
        const name = String(file.name ?? file.fileName ?? "").trim();
        const body = String(file.content ?? "").trim();
        return body ? (name ? `【${name}】\n${body}` : body) : "";
      })
      .filter(Boolean);
    const content = [
      String(skillMd?.content ?? hydrated.skill.detail?.introduction ?? "").trim(),
      ...instructionFiles,
    ].filter(Boolean).join("\n\n");
    await deps.db.query("UPDATE skills SET usage_count = usage_count + 1, updated_at = $2 WHERE id = $1", [row.id, input.now ?? new Date()]);
    await deps.db.query("UPDATE skill_library SET last_used_at = $3 WHERE skill_id = $1 AND user_id = $2", [row.id, input.userId, input.now ?? new Date()]);
    return {
      id: String(row.id),
      title: String(hydrated.skill.title ?? hydrated.skill.name ?? ""),
      category: String(hydrated.skill.category ?? "general"),
      summary: String(hydrated.skill.summary ?? ""),
      outputContent: String(hydrated.skill.detail?.outputContent ?? ""),
      workflow: Array.isArray(hydrated.skill.detail?.workflow) ? hydrated.skill.detail.workflow : [],
      files: files.map((file) => ({
        name: String(file.name ?? file.fileName ?? ""),
        kind: String(file.kind ?? "instruction"),
      })),
      content,
      official: row.owner_user_id == null,
      ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
      priceCredits: 0,
    };
  }

  async function findAccessibleSkillIdByName(input: { userId: string; name: string }) {
    const name = String(input.name ?? "").trim();
    if (!name) return null;
    const row = await queryOne<{ id: string }>(
      deps.db,
      `SELECT skill.id
       FROM skills skill
       WHERE lower(skill.name) = lower($1)
         AND skill.status <> 'disabled'
         AND (
           (skill.status = 'published' AND skill.visibility = 'public')
           OR skill.owner_user_id = $2
           OR EXISTS (SELECT 1 FROM skill_library library WHERE library.skill_id = skill.id AND library.user_id = $2)
         )
       ORDER BY CASE WHEN skill.owner_user_id = $2 THEN 0 ELSE 1 END, skill.usage_count DESC, skill.updated_at DESC
       LIMIT 1`,
      [name, input.userId],
    );
    return row?.id ? String(row.id) : null;
  }

  async function getAdminDetail(skillId: string) {
    const row = await queryOne<Record<string, unknown>>(
      deps.db,
      `SELECT skill.*, COALESCE(NULLIF(skill.author_name, ''), NULLIF(owner.display_name, ''), owner.phone_e164, '未知用户') AS owner_display_name,
         false AS is_in_library, false AS is_favorite, false AS is_mine
       FROM skills skill LEFT JOIN users owner ON owner.id = skill.owner_user_id
       WHERE skill.id = $1`,
      [skillId],
    );
    if (!row) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在");
    const hydrated = await hydrateSkillDetail(row, null, { forceFiles: true });
    return {
      ...hydrated,
      skill: {
        ...hydrated.skill,
        ownerName: row.owner_display_name ?? hydrated.skill.authorName,
        ownerUserId: row.owner_user_id ?? null,
        fileCount: hydrated.files.length,
      },
    };
  }

  async function hydrateSkillDetail(row: Record<string, unknown>, userId?: string | null, options: { forceFiles?: boolean } = {}) {
    const mappedSkill = mapSkill(row);
    const skillId = String(row.id);
    const isOwner = Boolean(userId && row.owner_user_id && String(row.owner_user_id) === String(userId));
    const canViewFiles = options.forceFiles === true || isOwner || mappedSkill.detail.fileListPublic === true;
    const files = canViewFiles ? await deps.db.query<Record<string, unknown>>(
      `SELECT id, storage_object_id, file_name, file_kind, sort_order FROM skill_files WHERE skill_id = $1 ORDER BY sort_order, file_name`,
      [skillId],
    ) : { rows: [] };
    const detailFiles = canViewFiles ? (((row.detail_json as Record<string, unknown> | null)?.files as Array<Record<string, unknown>> | undefined) ?? []).map((file, index) => ({
      id: `${skillId}-file-${index}`,
      storageObjectId: null as string | null,
      name: String(file.name ?? ""),
      fileName: String(file.name ?? ""),
      kind: file.kind ?? "instruction",
      sortOrder: index,
      content: String(file.content ?? ""),
    })).filter((file) => file.name) : [];
    const persistedFiles = files.rows.length ? files.rows.map((file) => {
      const matched = detailFiles.find((item) => item.name === file.file_name);
      const fallbackContent = file.file_name === "SKILL.md" ? String(mappedSkill.detail.introduction ?? "") : "";
      return {
        id: file.id,
        storageObjectId: file.storage_object_id,
        name: file.file_name,
        fileName: file.file_name,
        kind: file.file_kind,
        sortOrder: Number(file.sort_order ?? 0),
        contentUrl: `/api/storage/objects/${encodeURIComponent(String(file.storage_object_id))}/content?proxy=1`,
        content: String(matched?.content ?? fallbackContent),
      };
    }) : detailFiles;
    const seenNames = new Set(persistedFiles.map((file) => String(file.name)));
    for (const file of detailFiles) {
      if (!seenNames.has(file.name)) {
        seenNames.add(file.name);
        persistedFiles.push(file);
      }
    }
    if (canViewFiles && !seenNames.has("SKILL.md") && String(mappedSkill.detail.introduction ?? "").trim()) {
      persistedFiles.unshift({
        id: `${skillId}-file-skill-md`,
        storageObjectId: null,
        name: "SKILL.md",
        fileName: "SKILL.md",
        kind: "instruction",
        sortOrder: -1,
        content: String(mappedSkill.detail.introduction),
      });
    }
    if (typeof deps.readSkillFileContent === "function") {
      for (const file of persistedFiles) {
        if (String(file.content ?? "").trim() || !file.storageObjectId) continue;
        file.content = String(await deps.readSkillFileContent(String(file.storageObjectId)) ?? "");
      }
    }
    return { skill: mappedSkill, files: persistedFiles };
  }

  async function create(input: { userId: string; name: string; summary?: string; category?: unknown; detail?: unknown; coverStorageObjectId?: string | null; previewStorageObjectId?: string | null }) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new SkillPlazaError(400, "skill_name_required", "Skill 名称不能为空");
    const category = await normalizeCategory(deps.db, input.category) ?? "general";
    const detail = input.detail && typeof input.detail === "object" && !Array.isArray(input.detail) ? input.detail : {};
    const requestedFileListPublic = (detail as Record<string, unknown>).fileListPublic;
    const fileListPublic = requestedFileListPublic === true || requestedFileListPublic === "true" || requestedFileListPublic === 1 || requestedFileListPublic === "1";
    (detail as Record<string, unknown>).fileListPublic = fileListPublic;
    const effectImageUrl = String((detail as Record<string, unknown>).effectImageUrl ?? "").trim();
    const effectVideoUrl = String((detail as Record<string, unknown>).effectVideoUrl ?? "").trim();
    if (effectImageUrl && effectVideoUrl) throw new SkillPlazaError(400, "skill_effect_media_conflict", "效果图和效果视频只能选择一个");
    const files = Array.isArray((detail as Record<string, unknown>).files) ? ((detail as Record<string, unknown>).files as unknown[]).map((file) => {
      const record = file && typeof file === "object" && !Array.isArray(file) ? file as Record<string, unknown> : {};
      return {
        name: normalizeSkillFileName(record.name ?? record.fileName),
        kind: ["instruction", "template", "example", "script", "other"].includes(String(record.kind ?? "")) ? String(record.kind) : "instruction",
        content: String(record.content ?? ""),
      };
    }).filter((file) => file.name && file.content.trim()) : [];
    if (files.length > 50) throw new SkillPlazaError(400, "skill_files_too_many", "Skill 文件最多上传 50 个");
    if (files.some((file) => file.content.length > 5 * 1024 * 1024)) throw new SkillPlazaError(400, "skill_file_too_large", "单个 Skill 文件不能超过 5 MB");
    (detail as Record<string, unknown>).files = files;
    const row = await queryOne<Record<string, unknown>>(deps.db,
      `INSERT INTO skills (id, owner_user_id, name, summary, category, author_name, cover_storage_object_id, preview_storage_object_id, detail_json, status, visibility)
       SELECT $1, $2, $3, $4, $5, COALESCE(display_name, ''), $6, $7, $8::jsonb, 'draft', 'private' FROM users WHERE id = $2 RETURNING *`,
      [randomUUID(), input.userId, name, String(input.summary ?? "").trim(), category, input.coverStorageObjectId ?? null, input.previewStorageObjectId ?? null, JSON.stringify(detail)],
    );
    if (!row) throw new SkillPlazaError(400, "user_not_found", "用户不存在");
    return mapSkill({ ...row, is_in_library: true, is_favorite: false });
  }

  async function updateMine(input: { userId: string; skillId: string; name: string; summary?: string; category?: unknown; detail?: unknown; coverStorageObjectId?: string | null; previewStorageObjectId?: string | null }) {
    const current = await queryOne<Record<string, unknown>>(deps.db, "SELECT * FROM skills WHERE id = $1 AND owner_user_id = $2", [input.skillId, input.userId]);
    if (!current) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在或不可编辑");
    const name = String(input.name ?? "").trim();
    if (!name) throw new SkillPlazaError(400, "skill_name_required", "Skill 名称不能为空");
    const category = await normalizeCategory(deps.db, input.category) ?? (String(current.category ?? "general") === "recommended" ? "general" : String(current.category ?? "general"));
    const previousDetail = current.detail_json && typeof current.detail_json === "object" && !Array.isArray(current.detail_json) ? current.detail_json as Record<string, unknown> : {};
    const detail = input.detail && typeof input.detail === "object" && !Array.isArray(input.detail) ? { ...previousDetail, ...(input.detail as Record<string, unknown>) } : { ...previousDetail };
    const requestedFileListPublic = detail.fileListPublic;
    detail.fileListPublic = requestedFileListPublic === true || requestedFileListPublic === "true" || requestedFileListPublic === 1 || requestedFileListPublic === "1";
    const effectImageUrl = String(detail.effectImageUrl ?? "").trim();
    const effectVideoUrl = String(detail.effectVideoUrl ?? "").trim();
    if (effectImageUrl && effectVideoUrl) throw new SkillPlazaError(400, "skill_effect_media_conflict", "效果图和效果视频只能选择一个");
    detail.effectImageUrl = effectImageUrl;
    detail.effectVideoUrl = effectVideoUrl;
    const files = Array.isArray(detail.files) ? detail.files.map((file) => {
      const record = file && typeof file === "object" && !Array.isArray(file) ? file as Record<string, unknown> : {};
      return {
        name: normalizeSkillFileName(record.name ?? record.fileName),
        kind: ["instruction", "template", "example", "script", "other"].includes(String(record.kind ?? "")) ? String(record.kind) : "instruction",
        content: String(record.content ?? ""),
      };
    }).filter((file) => file.name && file.content.trim()) : [];
    if (files.length > 50) throw new SkillPlazaError(400, "skill_files_too_many", "Skill 文件最多上传 50 个");
    if (files.some((file) => file.content.length > 5 * 1024 * 1024)) throw new SkillPlazaError(400, "skill_file_too_large", "单个 Skill 文件不能超过 5 MB");
    detail.files = files;
    const row = await queryOne<Record<string, unknown>>(deps.db,
      `UPDATE skills SET name = $3, summary = $4, category = $5, cover_storage_object_id = COALESCE($6, cover_storage_object_id), preview_storage_object_id = COALESCE($7, preview_storage_object_id), detail_json = $8::jsonb, status = 'draft', visibility = 'private', updated_at = now()
       WHERE id = $1 AND owner_user_id = $2 RETURNING *`,
      [input.skillId, input.userId, name, String(input.summary ?? "").trim(), category, input.coverStorageObjectId ?? null, input.previewStorageObjectId ?? null, JSON.stringify(detail)],
    );
    if (!row) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在或不可编辑");
    return mapSkill({ ...row, is_in_library: true, is_favorite: false, is_mine: true });
  }

  async function deleteMine(input: { userId: string; skillId: string }) {
    const deleted = await queryOne<{ id: string }>(
      deps.db,
      "DELETE FROM skills WHERE id = $1 AND owner_user_id = $2 RETURNING id",
      [input.skillId, input.userId],
    );
    if (!deleted) throw new SkillPlazaError(404, "skill_not_found", "Skill 不存在或不可删除");
    return { deleted: true, skillId: deleted.id };
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
    const fileName = normalizeSkillFileName(input.fileName);
    if (!fileName) throw new SkillPlazaError(400, "skill_file_name_required", "Skill 文件名不能为空");
    const fileKind = ["instruction", "template", "example", "script", "other"].includes(String(input.fileKind)) ? String(input.fileKind) : "instruction";
    await deps.db.query(
      `INSERT INTO skill_files (id, skill_id, storage_object_id, file_name, file_kind, sort_order) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (skill_id, file_name) DO UPDATE SET storage_object_id = EXCLUDED.storage_object_id, file_kind = EXCLUDED.file_kind, sort_order = EXCLUDED.sort_order`,
      [randomUUID(), input.skillId, input.storageObjectId, fileName, fileKind, Math.max(0, Number(input.sortOrder) || 0)],
    );
    return { skillId: input.skillId, storageObjectId: input.storageObjectId, fileName, fileKind };
  }

  async function listCategories(input: { includeHidden?: boolean } = {}) {
    const rows = await loadCategoryRows(deps.db);
    return {
      items: rows
        .filter((row) => input.includeHidden === true || row.is_visible !== false)
        .map(mapCategory),
    };
  }

  async function createCategory(input: { code?: unknown; name?: unknown; shortName?: unknown; sortOrder?: unknown; isVisible?: unknown }) {
    const code = normalizeCategoryCode(input.code);
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(code)) throw new SkillPlazaError(400, "skill_category_code_invalid", "分类编码仅支持小写字母、数字、下划线和连字符");
    if (code === "recommended") throw new SkillPlazaError(400, "skill_category_not_assignable", "推荐不是可创建的 Skill 分类");
    const name = String(input.name ?? "").trim();
    if (!name || name.length > 40) throw new SkillPlazaError(400, "skill_category_name_invalid", "分类名称不能为空且不能超过 40 个字符");
    const shortName = String(input.shortName ?? "").trim() || name;
    if (shortName.length > 40) throw new SkillPlazaError(400, "skill_category_short_name_invalid", "分类简称不能超过 40 个字符");
    try {
      const row = await queryOne<Record<string, unknown>>(deps.db,
        `INSERT INTO skill_categories (id, code, name, short_name, sort_order, is_visible, is_system, is_skill_category)
         VALUES ($1, $2, $3, $4, $5, $6, false, true)
         RETURNING id, code, name, short_name, sort_order, is_visible, is_system, is_skill_category, created_at, updated_at`,
        [randomUUID(), code, name, shortName, normalizeSortOrder(input.sortOrder), normalizeBooleanFlag(input.isVisible, true)],
      );
      if (!row) throw new SkillPlazaError(500, "skill_category_create_failed", "Skill 分类创建失败");
      return mapCategory(row);
    } catch (error) {
      if (error instanceof SkillPlazaError) throw error;
      if (isUniqueViolation(error)) throw new SkillPlazaError(409, "skill_category_code_conflict", "分类编码已存在");
      throw error;
    }
  }

  async function updateCategory(input: { categoryId: string; code?: unknown; name?: unknown; shortName?: unknown; sortOrder?: unknown; isVisible?: unknown }) {
    const current = await queryOne<Record<string, unknown>>(deps.db,
      `SELECT id, code, name, short_name, sort_order, is_visible, is_system, is_skill_category, created_at, updated_at
       FROM skill_categories WHERE id::text = $1 OR code = $1`,
      [input.categoryId],
    );
    if (!current) throw new SkillPlazaError(404, "skill_category_not_found", "Skill 分类不存在");
    const nextCode = input.code === undefined ? String(current.code) : normalizeCategoryCode(input.code);
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(nextCode)) throw new SkillPlazaError(400, "skill_category_code_invalid", "分类编码仅支持小写字母、数字、下划线和连字符");
    if (current.is_system === true && nextCode !== String(current.code)) throw new SkillPlazaError(409, "skill_category_system", "系统分类不能修改编码");
    if (nextCode === "recommended" && current.is_skill_category !== false) throw new SkillPlazaError(400, "skill_category_not_assignable", "推荐不是可分配的 Skill 分类");
    const name = input.name === undefined ? String(current.name ?? "") : String(input.name ?? "").trim();
    if (!name || name.length > 40) throw new SkillPlazaError(400, "skill_category_name_invalid", "分类名称不能为空且不能超过 40 个字符");
    const shortName = input.shortName === undefined ? String(current.short_name ?? name) : (String(input.shortName ?? "").trim() || name);
    if (shortName.length > 40) throw new SkillPlazaError(400, "skill_category_short_name_invalid", "分类简称不能超过 40 个字符");
    if (nextCode !== String(current.code)) {
      const usage = await queryOne<{ count: string }>(deps.db, "SELECT COUNT(*)::text AS count FROM skills WHERE category = $1", [current.code]);
      if (Number(usage?.count ?? 0) > 0) throw new SkillPlazaError(409, "skill_category_in_use", "该分类仍有 Skill 使用，不能修改编码");
    }
    try {
      const row = await queryOne<Record<string, unknown>>(deps.db,
        `UPDATE skill_categories
         SET code = $2, name = $3, short_name = $4, sort_order = $5, is_visible = $6, updated_at = now()
         WHERE id = $1
         RETURNING id, code, name, short_name, sort_order, is_visible, is_system, is_skill_category, created_at, updated_at`,
        [
          current.id,
          nextCode,
          name,
          shortName,
          input.sortOrder === undefined ? Number(current.sort_order ?? 100) : normalizeSortOrder(input.sortOrder),
          input.isVisible === undefined ? current.is_visible !== false : normalizeBooleanFlag(input.isVisible, true),
        ],
      );
      if (!row) throw new SkillPlazaError(404, "skill_category_not_found", "Skill 分类不存在");
      return mapCategory(row);
    } catch (error) {
      if (error instanceof SkillPlazaError) throw error;
      if (isUniqueViolation(error)) throw new SkillPlazaError(409, "skill_category_code_conflict", "分类编码已存在");
      throw error;
    }
  }

  async function deleteCategory(categoryId: string) {
    const current = await queryOne<Record<string, unknown>>(deps.db,
      `SELECT id, code, is_system FROM skill_categories WHERE id::text = $1 OR code = $1`,
      [categoryId],
    );
    if (!current) throw new SkillPlazaError(404, "skill_category_not_found", "Skill 分类不存在");
    if (current.is_system === true) throw new SkillPlazaError(409, "skill_category_system", "系统分类不能删除");
    const usage = await queryOne<{ count: string }>(deps.db, "SELECT COUNT(*)::text AS count FROM skills WHERE category = $1", [current.code]);
    if (Number(usage?.count ?? 0) > 0) throw new SkillPlazaError(409, "skill_category_in_use", "该分类仍有 Skill 使用，不能删除");
    const row = await queryOne<Record<string, unknown>>(deps.db,
      `DELETE FROM skill_categories WHERE id = $1
       RETURNING id, code, name, short_name, sort_order, is_visible, is_system, is_skill_category, created_at, updated_at`,
      [current.id],
    );
    if (!row) throw new SkillPlazaError(404, "skill_category_not_found", "Skill 分类不存在");
    return mapCategory(row);
  }

  return { listCatalog, listLibrary, listFavorites, listMine, listAdmin, listCategories, createCategory, updateCategory, deleteCategory, updateStatus, updateRecommendation, updateOfficial, createOfficial, getDetail, getAdminDetail, resolveWorkflowSkill, findAccessibleSkillIdByName, create, updateMine, deleteMine, addToLibrary, addToFavorites, removeFromFavorites, attachFile };
}
