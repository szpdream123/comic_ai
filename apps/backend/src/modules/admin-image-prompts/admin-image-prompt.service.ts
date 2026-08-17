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
    cover_image_url: row.cover_image_url || "",
    coverImageUrl: row.cover_image_url || "",
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

function style(name: string, legacyIdentifier: string, promptContent: string, _legacyOrder?: number, _legacyMetadata?: string[]) {
  return {
    id: stableUuid(`image-prompt-style:${legacyIdentifier}`),
    code: legacyIdentifier,
    name,
    cover_image_url: styleCoverDataUrl(legacyIdentifier),
    prompt_content: promptContent,
    remark: `将画面转换为「${name}」视觉风格，统一构图、色彩、光影、材质与细节表现。`,
  };
}
function styleCoverDataUrl(name: string) {
  return `/api/public/style-covers/${encodeURIComponent(name)}`;
}

const defaultImagePromptStyles = [
  style("人像摄影", "portrait_photography", "真实人像摄影风格，皮肤质感自然，表情细腻，浅景深背景虚化，柔和棚拍光，画面清晰高级", 320, ["摄影", "人像"]),
  style("电影写真", "cinematic_portrait", "电影剧照写真风格，强叙事氛围，胶片色调，侧逆光，光影层次丰富，镜头感明显", 310, ["电影", "写真"]),
  style("中国风", "chinese_style", "中国传统美学风格，东方构图，古典纹样，雅致配色，含蓄留白，画面有国风意境", 300, ["国风", "东方"]),
  style("动画", "animation", "高质量动画电影风格，角色造型生动，色彩明快，线条干净，表情动作夸张但自然", 290, ["动画"]),
  style("3D渲染", "three_d_render", "精致 3D 渲染风格，真实材质，立体光影，细节丰富，电影级质感，画面干净清晰", 280, ["3D", "渲染"]),
  style("赛博朋克", "cyberpunk", "赛博朋克风格，未来城市，霓虹灯光，机械科技元素，高对比冷暖色，夜景氛围强", 270, ["科幻", "霓虹"]),
  style("CG 动画", "cg_animation", "CG 动画电影质感，角色建模精致，材质柔和，光照自然，画面有梦幻商业动画感", 260, ["CG", "动画"]),
  style("水墨画", "ink_wash", "中国水墨画风格，墨色晕染，宣纸质感，写意笔触，留白构图，整体淡雅有诗意", 250, ["水墨", "国风"]),
  style("油画", "oil_painting", "古典油画风格，厚重笔触，布面纹理，色彩层次丰富，明暗柔和，画面具有艺术馆质感", 240, ["油画"]),
  style("古典", "classic_art", "古典艺术风格，庄重优雅，复古色调，精致服饰与装饰，柔和光影，构图稳定", 230, ["古典"]),
  style("水彩画", "watercolor", "水彩插画风格，透明颜料晕染，纸张纹理明显，边缘柔和，色彩清新明亮", 220, ["水彩"]),
  style("卡通", "cartoon", "卡通插画风格，造型圆润可爱，色彩鲜明，线条简洁，表情活泼，画面轻松有趣", 210, ["卡通"]),
  style("平面插画", "flat_illustration", "扁平插画风格，简洁几何造型，干净色块，现代配色，少阴影，整体设计感强", 200, ["插画", "扁平"]),
  style("风景", "landscape", "高质量风景画面，自然光线，空间纵深明显，环境细节丰富，构图开阔，氛围真实", 190, ["风景"]),
  style("港风动漫", "hong_kong_anime", "港风复古动漫风格，怀旧胶片色调，霓虹街景，90 年代城市氛围，线条有漫画感", 180, ["港风", "动漫"]),
  style("像素风格", "pixel_art", "像素艺术风格，复古游戏画面，低分辨率像素块，轮廓清楚，有限色板，画面规整", 170, ["像素"]),
  style("荧光绘画", "fluorescent_painting", "荧光绘画风格，深色背景，高饱和霓虹色，发光边缘，电光效果，视觉冲击强", 160, ["荧光"]),
  style("彩铅画", "colored_pencil", "彩色铅笔手绘风格，细腻排线，纸张纹理，柔和渐变，色彩温暖自然", 150, ["彩铅", "手绘"]),
  style("手办", "figurine", "精品手办摄影风格，PVC 材质，精致雕刻，上色细腻，棚拍灯光，收藏级质感", 140, ["手办"]),
  style("儿童绘画", "children_drawing", "儿童绘画风格，天真线条，明亮色彩，简单形状，童趣构图，画面温暖可爱", 130, ["儿童", "手绘"]),
  style("抽象", "abstract_art", "抽象艺术风格，用形状、色块和线条表达情绪，非写实构图，视觉节奏强", 120, ["抽象"]),
  style("锐笔插画", "sharp_pen_illustration", "针管笔锐利插画风格，线条清晰有力，细节密集，黑白对比强，边缘利落", 110, ["插画", "线稿"]),
  style("二次元", "anime_2d", "二次元动漫风格，精致线稿，大眼角色，干净上色，柔和高光，日系动画质感", 100, ["二次元", "动漫"]),
  style("油墨印刷", "ink_print", "复古油墨印刷风格，网点纹理，套色偏移，纸张颗粒感，海报印刷质感", 90, ["印刷", "复古"]),
  style("版画", "printmaking", "木刻版画风格，粗犷刻线，强烈黑白关系，有限色彩，图形感突出", 80, ["版画"]),
  style("莫奈", "monet_impressionism", "印象派莫奈风格，柔和光色，松散笔触，自然景致，空气感强，色彩朦胧", 70, ["印象派"]),
  style("毕加索", "picasso_cubism", "立体主义风格，几何分解，多视角构图，夸张形体，艺术实验感强", 60, ["立体主义"]),
  style("伦勃朗", "rembrandt_lighting", "伦勃朗式古典光影，深色背景，强明暗对比，戏剧性侧光，肖像质感厚重", 50, ["古典", "光影"]),
  style("马蒂斯", "matisse_fauvism", "马蒂斯风格，鲜艳纯色，装饰性平面构图，流畅线条，色彩大胆明快", 40, ["野兽派"]),
  style("巴洛克", "baroque", "巴洛克艺术风格，华丽装饰，戏剧光影，动态构图，金色细节，宏大气势", 30, ["巴洛克"]),
  style("复古动漫", "retro_anime", "复古赛璐璐动漫风格，怀旧配色，胶片颗粒，手绘线条，旧动画质感", 20, ["复古", "动漫"]),
  style("绘本", "picture_book", "绘本插画风格，温暖色调，柔和手绘线条，童话叙事感，纸张纹理清晰", 10, ["绘本", "插画"]),
];
