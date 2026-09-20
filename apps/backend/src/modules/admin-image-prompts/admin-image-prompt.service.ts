import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { assertPromptCanBeDeactivated, ensureOfficialPromptDefault } from "../prompt-marketplace/prompt-skill-default.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");
interface ImagePromptStyleRow {
  id: string;
  name: string;
  summary: string;
  cover_image_url: string | null;
  cover_storage_object_id: string | null;
  prompt_content: string;
  status: string;
  price_credits: number;
  usage_count: number;
  is_published: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  is_default?: boolean;
}

interface AdminMutationInput {
  actorAdminAccountId: string;
  reason?: string;
  now: Date;
}

interface SaveImagePromptStyleInput extends AdminMutationInput {
  id?: string;
  name: string;
  cover_image_url?: string | null;
  prompt_content: string;
  status?: string;
  price_credits?: number;
  usage_count?: number;
  is_published?: boolean;
  remark?: string | null;
}

export function createAdminImagePromptService(deps: { db: SqlDatabase }) {
  async function listStyles(input: {
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultImagePromptStyles(deps.db);
    await ensureOfficialPromptDefault(deps.db, "image_style");
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const filters = [input.status || null, keyword] as const;
    const total = await queryOne<{ count: string | number }>(
      deps.db,
      `
        SELECT COUNT(*) AS count
        FROM prompts
        WHERE prompt_category = 'image_style' AND deleted_at IS NULL
          AND ($1::text IS NULL OR status = $1)
          AND (
            $2::text IS NULL
            OR lower(name) LIKE $2
            OR lower(summary) LIKE $2
            OR lower(prompt_content) LIKE $2
          )
      `,
      filters,
    );
    const rows = await deps.db.query<ImagePromptStyleRow>(
      `
        SELECT prompts.*, EXISTS (
          SELECT 1 FROM prompt_official_defaults prompt_default
          WHERE prompt_default.prompt_category = 'image_style' AND prompt_default.prompt_id = prompts.id
        ) AS is_default
        FROM prompts
        WHERE prompt_category = 'image_style' AND deleted_at IS NULL
          AND ($1::text IS NULL OR status = $1)
          AND (
            $2::text IS NULL
            OR lower(name) LIKE $2
            OR lower(summary) LIKE $2
            OR lower(prompt_content) LIKE $2
          )
        ORDER BY updated_at DESC, id ASC
        LIMIT $3
      `,
      [...filters, pageSize],
    );
    return {
      data: rows.rows.map(styleFromRow),
      meta: {
        total: Number(total?.count || 0),
        pageSize,
      },
    };
  }

  async function saveStyle(input: SaveImagePromptStyleInput) {
    const validation = validateStylePayload(input);
    if (validation) return validation;
    const existing = await findStyleByIdentifier(input.id);
    const existingId = existing?.id ?? (isUuid(input.id) ? input.id : null);
    const id = existingId || randomUUID();
    const status = input.status || "enabled";
    const priceCredits = input.price_credits ?? existing?.price_credits ?? 0;
    const isPublished = status === "disabled" ? false : input.is_published ?? existing?.is_published ?? false;
    if (existing && (status === "disabled" || !isPublished)) await assertPromptCanBeDeactivated(deps.db, existing.id);

    await deps.db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, cover_image_url, prompt_content,
          status, created_by_admin_id, updated_by_admin_id,
          is_official, price_credits, is_published, published_at, created_at, updated_at
        )
        VALUES ($1, 'image_style', $2, $3, $4, $5, $6, $9, $9, true, $7, $8, CASE WHEN $8 THEN $10::timestamptz ELSE NULL END, $10, $10)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          summary = EXCLUDED.summary,
          cover_image_url = EXCLUDED.cover_image_url,
          prompt_content = EXCLUDED.prompt_content,
          status = EXCLUDED.status,
          price_credits = EXCLUDED.price_credits,
          is_published = EXCLUDED.is_published,
          published_at = EXCLUDED.published_at,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        id,
        input.name.trim(),
        input.remark?.trim() || "",
        input.cover_image_url?.trim() || null,
        input.prompt_content.trim(),
        status,
        priceCredits,
        isPublished,
        input.actorAdminAccountId,
        input.now,
      ],
    );
    if (input.usage_count !== undefined) {
      await deps.db.query("UPDATE prompts SET usage_count = $2 WHERE id = $1", [id, input.usage_count]);
    }
    await audit(input, existing ? "admin.image_prompt.style.updated" : "admin.image_prompt.style.created", id);
    return styleResponse(id);
  }

  async function copyStyle(input: AdminMutationInput & { id: string }) {
    const existing = await findStyleByIdentifier(input.id);
    if (!existing) return error(404, "image_prompt_style_not_found", "生图题词不存在");
    return saveStyle({
      ...styleFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      actorAdminAccountId: input.actorAdminAccountId,
      reason: input.reason || "copy image prompt style",
      now: input.now,
    });
  }

  async function changeStyleStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_image_prompt_status", "状态不支持");
    const existing = await findStyleByIdentifier(input.id);
    if (!existing) return error(404, "image_prompt_style_not_found", "生图题词不存在");
    if (input.status === "disabled") await assertPromptCanBeDeactivated(deps.db, existing.id);
    await deps.db.query(
      "UPDATE prompts SET status = $2, is_published = CASE WHEN $2 = 'disabled' THEN false ELSE is_published END, published_at = CASE WHEN $2 = 'disabled' THEN NULL ELSE published_at END, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1 AND prompt_category = 'image_style'",
      [existing.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.image_prompt.style.status_changed", existing.id, { status: input.status });
    return styleResponse(existing.id);
  }

  async function styleResponse(id: string) {
    const row = await queryOne<ImagePromptStyleRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'image_style'", [id]);
    return { status: 200, body: { data: row ? styleFromRow(row) : { id } } };
  }

  async function audit(input: AdminMutationInput, eventType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType,
      targetType: "image_prompt_style",
      targetId,
      reason: input.reason || eventType,
      sensitive: false,
      metadata,
    });
  }

  async function findStyleByIdentifier(identifier?: string | null) {
    if (isUuid(identifier)) {
      const row = await queryOne<ImagePromptStyleRow>(
        deps.db,
        "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'image_style' AND deleted_at IS NULL",
        [identifier],
      );
      if (row) return row;
    }
    return undefined;
  }

  return {
    listStyles,
    saveStyle,
    copyStyle,
    changeStyleStatus,
  };
}

export async function ensureDefaultImagePromptStyles(db: SqlDatabase) {
  const existing = await queryOne<{ count: string | number }>(db, "SELECT COUNT(*) AS count FROM prompts WHERE prompt_category = 'image_style' AND deleted_at IS NULL");
  if (Number(existing?.count || 0) > 0) {
    await ensureOfficialPromptDefault(db, "image_style", seedUpdatedAt);
    return;
  }
  for (const item of defaultImagePromptStyles) {
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, cover_image_url, prompt_content,
          status, is_official, is_published, published_at, created_at, updated_at
        )
        VALUES ($1, 'image_style', $2, $3, $4, $5, 'enabled', true, true, $6, $6, $6)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        item.id,
        item.name,
        item.remark || "",
        item.cover_image_url || null,
        item.prompt_content,
        seedUpdatedAt,
      ],
    );
  }
  await ensureOfficialPromptDefault(db, "image_style", seedUpdatedAt);
}

function validateStylePayload(input: SaveImagePromptStyleInput) {
  if (!input.name?.trim()) {
    return error(400, "image_prompt_style_required", "名称必填");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "image_prompt_content_required", "生图题词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_image_prompt_status", "状态不支持");
  }
  if (input.price_credits !== undefined && (!Number.isInteger(input.price_credits) || input.price_credits < 0 || input.price_credits > 99_999)) {
    return error(400, "invalid_image_prompt_price", "积分价格必须是 0 到 99999 的整数");
  }
  if (input.usage_count !== undefined && (!Number.isInteger(input.usage_count) || input.usage_count < 0 || input.usage_count > 2_147_483_647)) {
    return error(400, "invalid_image_prompt_usage_count", "使用次数必须是非负整数");
  }
  return null;
}

function styleFromRow(row: ImagePromptStyleRow) {
  return {
    id: row.id,
    code: defaultImagePromptStyles.find((style) => style.id === row.id)?.code ?? row.id,
    name: row.name,
    prompt_category: "image_style",
    category: "image_style",
    summary: row.summary || "",
    cover_image_url: imagePromptCoverUrl(row),
    coverImageUrl: imagePromptCoverUrl(row),
    cover_storage_object_id: row.cover_storage_object_id,
    coverStorageObjectId: row.cover_storage_object_id,
    prompt_content: row.prompt_content,
    promptContent: row.prompt_content,
    status: row.status,
    price_credits: row.price_credits,
    priceCredits: row.price_credits,
    usage_count: row.usage_count,
    usageCount: row.usage_count,
    is_published: row.is_published,
    isPublished: row.is_published,
    isDefault: Boolean(row.is_default),
    remark: row.summary || "",
    created_at: dateString(row.created_at),
    updated_at: dateString(row.updated_at),
  };
}

function imagePromptCoverUrl(row: Pick<ImagePromptStyleRow, "cover_image_url" | "cover_storage_object_id">) {
  const coverImageUrl = String(row.cover_image_url || "").trim();
  if (/^https?:\/\//i.test(coverImageUrl)) return coverImageUrl;
  return row.cover_storage_object_id
    ? `/api/storage/objects/${encodeURIComponent(row.cover_storage_object_id)}/content?proxy=1`
    : coverImageUrl;
}

function dateString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function error(status: number, code: string, message: string) {
  return { status, body: { error: { code, message } } };
}

function stableUuid(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function style(name: string, legacyIdentifier: string, promptContent: string, remark?: string) {
  return {
    id: stableUuid(`image-prompt-style:${legacyIdentifier}`),
    code: legacyIdentifier,
    name,
    cover_image_url: styleCoverDataUrl(legacyIdentifier),
    prompt_content: promptContent,
    remark: remark || `将画面转换为「${name}」视觉风格，统一构图、色彩、光影、材质与细节表现。`,
  };
}
function styleCoverDataUrl(name: string) {
  return `/api/public/style-covers/${encodeURIComponent(name)}`;
}

export const defaultImagePromptStyles = [
  style("写实摄影", "realistic", "写实摄影风格，真实材质，自然光影，细节清晰，皮肤质感自然，画面干净高级", "真实质感，光影自然"),
  style("动漫风格", "anime", "日系动漫风格，干净线稿，统一角色设计，细腻上色，二次元造型明确", "日系二次元绘画"),
  style("水彩画", "watercolor", "水彩画风格，柔和通透的晕染，自然纸张纹理，边缘柔和，色彩清新", "柔和通透的晕染"),
  style("油画", "oil-painting", "油画风格，厚重颜料肌理，清晰笔触，层次丰富，画面具有艺术馆质感", "厚重肌理与笔触"),
  style("妖冶阴柔风", "bewitching", "妖冶阴柔风格，破碎魅惑气质，瓷白冷白皮，通透柔光，细腻皮肤纹理与绒毛质感", "破碎魅惑瓷白质感"),
  style("素描", "sketch", "素描风格，黑白线条，细腻排线，结构准确，光影层次清楚", "黑白线条速写"),
  style("赛博朋克", "cyberpunk", "赛博朋克风格，霓虹光影，未来都市，高对比氛围，机械科技细节丰富", "霓虹都市科技感"),
  style("水墨画", "ink-wash", "中国水墨画风格，墨色层次，留白构图，写意笔触，宣纸肌理明显", "水墨留白与写意笔触"),
  style("像素艺术", "pixel-art", "像素艺术风格，清晰像素边缘，统一色板，复古游戏质感，轮廓规整", "统一色板与像素质感"),
  style("CG游戏风", "cg-game", "次世代CG游戏风格，UE5路径追踪，皮肤次表面散射，锐利干净，织物材质真实", "次世代写实渲染"),
  style("3D 渲染", "3d-render", "高品质 3D 渲染风格，立体材质，精细灯光，空间层次清晰，细节丰富", "立体材质与精细灯光"),
  style("扁平插画", "flat-illustration", "扁平插画风格，简洁几何造型，统一配色，干净轮廓，少阴影", "简洁干净的矢量风"),
  style("电影质感", "cinematic", "电影级画面风格，叙事构图，电影调色，富有层次的光影，镜头感明显", "电影级调色与光影"),
  style("复古胶片", "vintage", "复古胶片风格，自然颗粒，柔和色偏，怀旧影调，轻微漏光质感", "胶片颗粒与怀旧影调"),
  style("3D国漫风", "3d-guoman", "3D国漫风格，新中式东方气韵，柔和通透光影，雅致配色，国风织物质感", "东方气韵柔和质感"),
];
