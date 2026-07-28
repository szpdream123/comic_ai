import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { assertPromptCanBeDeactivated, ensureOfficialPromptDefault } from "../prompt-marketplace/prompt-skill-default.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");

interface ShotPromptTemplateRow {
  id: string;
  name: string;
  summary: string;
  prompt_content: string;
  cover_image_url?: string | null;
  cover_storage_object_id: string | null;
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

interface SaveShotPromptTemplateInput extends AdminMutationInput {
  id?: string;
  name: string;
  prompt_content: string;
  cover_image_url?: string | null;
  status?: string;
  price_credits?: number;
  usage_count?: number;
  is_published?: boolean;
  remark?: string | null;
}

export function createAdminShotPromptService(deps: { db: SqlDatabase }) {
  async function listTemplates(input: {
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultShotPromptTemplates(deps.db);
    await ensureOfficialPromptDefault(deps.db, "shot");
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<ShotPromptTemplateRow>(
      `
        SELECT prompts.*, EXISTS (
          SELECT 1 FROM prompt_official_defaults prompt_default
          WHERE prompt_default.prompt_category = 'shot' AND prompt_default.prompt_id = prompts.id
        ) AS is_default
        FROM prompts
        WHERE prompt_category = 'shot' AND deleted_at IS NULL
          AND ($1::text IS NULL OR status = $1)
          AND (
            $2::text IS NULL
            OR lower(name) LIKE $2
            OR lower(prompt_content) LIKE $2
            OR lower(summary) LIKE $2
          )
        ORDER BY updated_at DESC, id ASC
        LIMIT $3
      `,
      [input.status || null, keyword, pageSize],
    );
    return { data: rows.rows.map(templateFromRow) };
  }

  async function saveTemplate(input: SaveShotPromptTemplateInput) {
    const validation = validateTemplatePayload(input);
    if (validation) return validation;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<ShotPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'shot' AND deleted_at IS NULL", [input.id])
      : undefined;
    const status = input.status || "enabled";
    const priceCredits = input.price_credits ?? existing?.price_credits ?? 0;
    const isPublished = status === "disabled" ? false : input.is_published ?? existing?.is_published ?? false;
    if (existing && (status === "disabled" || !isPublished)) await assertPromptCanBeDeactivated(deps.db, existing.id);
    await deps.db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, cover_image_url, prompt_content, status,
          is_official, price_credits, is_published, published_at,
          created_by_admin_id, updated_by_admin_id, created_at, updated_at
        )
        VALUES ($1, 'shot', $2, $3, $4, $5, $6, true, $7, $8, CASE WHEN $8 THEN $10::timestamptz ELSE NULL END, $9, $9, $10, $10)
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
    await audit(input, existing ? "admin.shot_prompt.template.updated" : "admin.shot_prompt.template.created", id);
    return templateResponse(id);
  }

  async function copyTemplate(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<ShotPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'shot' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "shot_prompt_template_not_found", "分镜提示词不存在");
    return saveTemplate({
      ...templateFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      actorAdminAccountId: input.actorAdminAccountId,
      reason: input.reason || "copy shot prompt template",
      now: input.now,
    });
  }

  async function changeTemplateStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_shot_prompt_status", "状态不支持");
    const existing = await queryOne<ShotPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'shot' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "shot_prompt_template_not_found", "分镜提示词不存在");
    if (input.status === "disabled") await assertPromptCanBeDeactivated(deps.db, input.id);
    await deps.db.query(
      "UPDATE prompts SET status = $2, is_published = CASE WHEN $2 = 'disabled' THEN false ELSE is_published END, published_at = CASE WHEN $2 = 'disabled' THEN NULL ELSE published_at END, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1 AND prompt_category = 'shot'",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.shot_prompt.template.status_changed", input.id, { status: input.status });
    return templateResponse(input.id);
  }

  async function templateResponse(id: string) {
    const row = await queryOne<ShotPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'shot'", [id]);
    return { status: 200, body: { data: row ? templateFromRow(row) : { id } } };
  }

  async function audit(input: AdminMutationInput, eventType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType,
      targetType: "shot_prompt_template",
      targetId,
      reason: input.reason || eventType,
      sensitive: false,
      metadata,
    });
  }

  return {
    listTemplates,
    saveTemplate,
    copyTemplate,
    changeTemplateStatus,
  };
}

export async function ensureDefaultShotPromptTemplates(db: SqlDatabase) {
  for (const item of defaultShotPromptTemplates) {
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, prompt_content, status,
          is_official, is_published, published_at, created_at, updated_at
        )
        VALUES ($1, 'shot', $2, $3, $4, 'enabled', true, true, $5, $5, $5)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        item.id,
        item.name,
        item.remark,
        item.prompt_content,
        seedUpdatedAt,
      ],
    );
  }
  await ensureOfficialPromptDefault(db, "shot", seedUpdatedAt);
}

function validateTemplatePayload(input: SaveShotPromptTemplateInput) {
  if (!input.name?.trim()) {
    return error(400, "shot_prompt_template_required", "名称必填");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "shot_prompt_content_required", "分镜提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_shot_prompt_status", "状态不支持");
  }
  if (input.price_credits !== undefined && (!Number.isInteger(input.price_credits) || input.price_credits < 0 || input.price_credits > 99_999)) {
    return error(400, "invalid_shot_prompt_price", "积分价格必须是 0 到 99999 的整数");
  }
  if (input.usage_count !== undefined && (!Number.isInteger(input.usage_count) || input.usage_count < 0 || input.usage_count > 2_147_483_647)) {
    return error(400, "invalid_shot_prompt_usage_count", "使用次数必须是非负整数");
  }
  return null;
}

function templateFromRow(row: ShotPromptTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    prompt_category: "shot",
    category: "shot",
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

function template(input: { name: string; prompt_content: string; remark: string }) {
  return {
    id: stableUuid(`shot-prompt-template:${input.name}`),
    ...input,
  };
}

const defaultShotPromptTemplates = [
  template({
    name: "抖音爆款短剧分镜",
    prompt_content: `你是一位资深抖音短剧导演和爆款短视频编剧，擅长把剧情文本改造成适合抖音传播的竖屏分镜脚本。你的目标不是机械拆分剧情，而是根据剧情节奏、人物冲突、情绪递进和反转节点，把故事拆成一组具有完播吸引力的短视频分镜。

请将我提供的剧情改写为抖音短剧分镜脚本。每个分镜时长控制在 4-15 秒之间，根据剧情自然划分，不要平均切分。首镜必须在 4-6 秒内制造悬念、冲突、反差或强烈情绪，让观众愿意继续看。中段要持续推进矛盾，每 2-4 个镜头出现一次新的信息、阻碍、误会、情绪变化或关系转折。结尾必须有反转、悬念、情绪爆点或下一集钩子。

分镜要求适配 9:16 竖屏短视频。每个镜头只表达一个主要剧情动作或情绪重点。遇到场景变化、人物视角变化、情绪转折、重要动作开始或结束、关键道具出现、对白主体切换时，可以新建分镜。同一场景内连续的小动作可以合并，不要拆得太碎。

请用 JSON 数组输出，每个对象包含：shot_no、duration_seconds、plot_function、visual_content、shot_size、camera_move、action_expression、dialogue_voiceover、subtitle、sound_bgm、transition、hook_note。

plot_function 从“钩子、铺垫、冲突、升级、误会、反转、高潮、收尾、悬念”中选择。shot_size 从“远景、全景、中景、近景、特写、大特写”中选择。camera_move 可以使用“固定镜头、缓慢推进、跟拍、平移、拉远、俯拍、仰拍、快速推近、手持晃动、环绕”等，但每个镜头只使用一种主要运镜。

台词要短，有冲突感，符合抖音短剧节奏。字幕要比台词更凝练，适合观众快速扫读。音效和 BGM 要服务情绪，例如心跳声、低频悬疑音、转场鼓点、玻璃碎裂声、电话震动声、突然静音等。

最后补充 rhythm_analysis，说明哪些镜头负责吸引观众，哪些镜头负责推进冲突，哪些镜头负责反转或留悬念。

剧情如下：
{{story_text}}`,
    remark: "擅长强钩子、强冲突、强反转，适合 30 秒到 3 分钟抖音竖屏短剧。",
  }),

];
