import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");
const defaultNegativePrompt = "避免文字、水印、logo、畸形手指、多手多脚、五官错位、肢体扭曲、人物融合、低清晰度、过曝、画面脏乱、主体不完整";

type JsonValue = unknown;

interface ImagePromptStyleRow {
  id: string;
  name: string;
  code: string;
  category: string;
  model_family: string;
  tags: JsonValue;
  cover_image_url: string | null;
  prompt_content: string;
  negative_prompt: string | null;
  sort_order: number | string;
  status: string;
  remark: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AdminMutationInput {
  actorAdminAccountId: string;
  auditOrganizationId: string;
  auditWorkspaceId: string;
  reason?: string;
  now: Date;
}

interface SaveImagePromptStyleInput extends AdminMutationInput {
  id?: string;
  name: string;
  code: string;
  category?: string;
  model_family?: string;
  tags?: string[];
  cover_image_url?: string | null;
  prompt_content: string;
  negative_prompt?: string | null;
  sort_order?: number;
  status?: string;
  remark?: string | null;
}

export function createAdminImagePromptService(deps: { db: SqlDatabase }) {
  async function listStyles(input: {
    category?: string | null;
    modelFamily?: string | null;
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultImagePromptStyles(deps.db);
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<ImagePromptStyleRow>(
      `
        SELECT *
        FROM image_prompt_styles
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR category = $1)
          AND ($2::text IS NULL OR model_family = $2)
          AND ($3::text IS NULL OR status = $3)
          AND (
            $4::text IS NULL
            OR lower(name) LIKE $4
            OR lower(code) LIKE $4
            OR lower(tags::text) LIKE $4
          )
        ORDER BY sort_order DESC, updated_at DESC, id ASC
        LIMIT $5
      `,
      [input.category || null, input.modelFamily || null, input.status || null, keyword, pageSize],
    );
    return { data: rows.rows.map(styleFromRow) };
  }

  async function saveStyle(input: SaveImagePromptStyleInput) {
    const validation = validateStylePayload(input);
    if (validation) return validation;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<ImagePromptStyleRow>(deps.db, "SELECT * FROM image_prompt_styles WHERE id = $1 AND deleted_at IS NULL", [input.id])
      : undefined;
    const duplicate = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM image_prompt_styles WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) AND deleted_at IS NULL",
      [input.code.trim(), input.id || null],
    );
    if (duplicate) return error(409, "image_prompt_style_code_duplicate", "生图题词编码已存在");

    await deps.db.query(
      `
        INSERT INTO image_prompt_styles (
          id, name, code, category, model_family, tags, cover_image_url, prompt_content,
          negative_prompt, sort_order, status, remark, created_by_admin_id,
          updated_by_admin_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $13, $14, $14)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          category = EXCLUDED.category,
          model_family = EXCLUDED.model_family,
          tags = EXCLUDED.tags,
          cover_image_url = EXCLUDED.cover_image_url,
          prompt_content = EXCLUDED.prompt_content,
          negative_prompt = EXCLUDED.negative_prompt,
          sort_order = EXCLUDED.sort_order,
          status = EXCLUDED.status,
          remark = EXCLUDED.remark,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        id,
        input.name.trim(),
        input.code.trim(),
        input.category || "official",
        input.model_family || "doubao",
        JSON.stringify(input.tags || []),
        input.cover_image_url?.trim() || null,
        input.prompt_content.trim(),
        input.negative_prompt?.trim() || defaultNegativePrompt,
        Number(input.sort_order || 0),
        input.status || "enabled",
        input.remark?.trim() || null,
        input.actorAdminAccountId,
        input.now,
      ],
    );
    await audit(input, existing ? "admin.image_prompt.style.updated" : "admin.image_prompt.style.created", id);
    return styleResponse(id);
  }

  async function copyStyle(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<ImagePromptStyleRow>(deps.db, "SELECT * FROM image_prompt_styles WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "image_prompt_style_not_found", "生图题词不存在");
    return saveStyle({
      ...styleFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      code: await uniqueCopyCode(existing.code),
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      reason: input.reason || "copy image prompt style",
      now: input.now,
    });
  }

  async function changeStyleStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_image_prompt_status", "状态不支持");
    const existing = await queryOne<ImagePromptStyleRow>(deps.db, "SELECT * FROM image_prompt_styles WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "image_prompt_style_not_found", "生图题词不存在");
    await deps.db.query(
      "UPDATE image_prompt_styles SET status = $2, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.image_prompt.style.status_changed", input.id, { status: input.status });
    return styleResponse(input.id);
  }

  async function styleResponse(id: string) {
    const row = await queryOne<ImagePromptStyleRow>(deps.db, "SELECT * FROM image_prompt_styles WHERE id = $1", [id]);
    return { status: 200, body: { data: row ? styleFromRow(row) : { id } } };
  }

  async function audit(input: AdminMutationInput, eventType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType,
      targetType: "image_prompt_style",
      targetId,
      reason: input.reason || eventType,
      sensitive: false,
      metadata,
    });
  }

  async function uniqueCopyCode(code: string) {
    for (let index = 1; index < 100; index += 1) {
      const candidate = `${code}_copy${index === 1 ? "" : index}`;
      const existing = await queryOne<{ id: string }>(deps.db, "SELECT id FROM image_prompt_styles WHERE code = $1", [candidate]);
      if (!existing) return candidate;
    }
    return `${code}_copy_${Date.now()}`;
  }

  return {
    listStyles,
    saveStyle,
    copyStyle,
    changeStyleStatus,
  };
}

export async function ensureDefaultImagePromptStyles(db: SqlDatabase) {
  const existing = await queryOne<{ count: string | number }>(db, "SELECT COUNT(*) AS count FROM image_prompt_styles WHERE deleted_at IS NULL");
  if (Number(existing?.count || 0) > 0) {
    for (const item of defaultImagePromptStyles) {
      await db.query(
        "UPDATE image_prompt_styles SET cover_image_url = $2 WHERE code = $1 AND deleted_at IS NULL AND (cover_image_url IS NULL OR cover_image_url = '' OR cover_image_url LIKE 'data:image/svg+xml%')",
        [item.code, item.cover_image_url || null],
      );
    }
    return;
  }
  for (const item of defaultImagePromptStyles) {
    await db.query(
      `
        INSERT INTO image_prompt_styles (
          id, name, code, category, model_family, tags, cover_image_url, prompt_content,
          negative_prompt, sort_order, status, remark, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'official', 'doubao', $4::jsonb, $5, $6, $7, $8, 'enabled', $9, $10, $10)
        ON CONFLICT (code) DO NOTHING
      `,
      [
        item.id,
        item.name,
        item.code,
        JSON.stringify(item.tags),
        item.cover_image_url || null,
        item.prompt_content,
        defaultNegativePrompt,
        item.sort_order,
        item.remark || null,
        seedUpdatedAt,
      ],
    );
  }
}

function validateStylePayload(input: SaveImagePromptStyleInput) {
  if (!input.name?.trim() || !input.code?.trim()) {
    return error(400, "image_prompt_style_required", "名称和编码必填");
  }
  if (!/^[a-z0-9_]+$/.test(input.code.trim())) {
    return error(400, "invalid_image_prompt_code", "编码只能包含小写字母、数字和下划线");
  }
  if (input.category && !["official", "custom"].includes(input.category)) {
    return error(400, "invalid_image_prompt_category", "分类不支持");
  }
  if (input.model_family && !["doubao", "seedream", "general"].includes(input.model_family)) {
    return error(400, "invalid_image_prompt_model_family", "模型族不支持");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "image_prompt_content_required", "生图题词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_image_prompt_status", "状态不支持");
  }
  return null;
}

function styleFromRow(row: ImagePromptStyleRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    category: row.category,
    model_family: row.model_family,
    tags: arrayFromJson(row.tags),
    cover_image_url: row.cover_image_url || "",
    coverImageUrl: row.cover_image_url || "",
    prompt_content: row.prompt_content,
    negative_prompt: row.negative_prompt || "",
    sort_order: Number(row.sort_order || 0),
    status: row.status,
    remark: row.remark || "",
    created_at: dateString(row.created_at),
    updated_at: dateString(row.updated_at),
  };
}

function arrayFromJson(value: JsonValue): string[] {
  return Array.isArray(value) ? value.map(String) : [];
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

function style(name: string, code: string, promptContent: string, sortOrder: number, tags: string[] = []) {
  return {
    id: stableUuid(`image-prompt-style:${code}`),
    name,
    code,
    cover_image_url: styleCoverDataUrl(code, name),
    prompt_content: promptContent,
    sort_order: sortOrder,
    tags,
    remark: "豆包生图风格预设",
  };
}

function styleCoverDataUrl(code: string, name: string) {
  void name;
  return `/admin/assets/prompt-covers/${code}.webp`;
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
