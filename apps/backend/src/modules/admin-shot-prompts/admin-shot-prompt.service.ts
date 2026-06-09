import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");

type JsonValue = unknown;
type ShotPromptStage = "outline";

interface ShotPromptTemplateRow {
  id: string;
  name: string;
  code: string;
  stage: ShotPromptStage;
  model_family: string;
  tags: JsonValue;
  variables: JsonValue;
  json_schema: string;
  prompt_content: string;
  negative_prompt: string | null;
  sort_order: number | string;
  status: string;
  is_default: boolean;
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

interface SaveShotPromptTemplateInput extends AdminMutationInput {
  id?: string;
  name: string;
  code: string;
  stage?: string;
  model_family?: string;
  tags?: string[];
  variables?: string[];
  json_schema?: string;
  prompt_content: string;
  negative_prompt?: string | null;
  sort_order?: number;
  status?: string;
  is_default?: boolean;
  remark?: string | null;
}

export function createAdminShotPromptService(deps: { db: SqlDatabase }) {
  async function listTemplates(input: {
    stage?: string | null;
    modelFamily?: string | null;
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultShotPromptTemplates(deps.db);
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<ShotPromptTemplateRow>(
      `
        SELECT *
        FROM shot_prompt_templates
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR stage = $1)
          AND ($2::text IS NULL OR model_family = $2)
          AND ($3::text IS NULL OR status = $3)
          AND (
            $4::text IS NULL
            OR lower(name) LIKE $4
            OR lower(code) LIKE $4
            OR lower(tags::text) LIKE $4
            OR lower(prompt_content) LIKE $4
            OR lower(remark) LIKE $4
          )
        ORDER BY sort_order DESC, updated_at DESC, id ASC
        LIMIT $5
      `,
      [input.stage || null, input.modelFamily || null, input.status || null, keyword, pageSize],
    );
    return { data: rows.rows.map(templateFromRow) };
  }

  async function saveTemplate(input: SaveShotPromptTemplateInput) {
    const validation = validateTemplatePayload(input);
    if (validation) return validation;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<ShotPromptTemplateRow>(deps.db, "SELECT * FROM shot_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id])
      : undefined;
    const duplicate = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM shot_prompt_templates WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) AND deleted_at IS NULL",
      [input.code.trim(), input.id || null],
    );
    if (duplicate) return error(409, "shot_prompt_template_code_duplicate", "分镜提示词编码已存在");

    await deps.db.query(
      `
        INSERT INTO shot_prompt_templates (
          id, name, code, stage, model_family, tags, variables, json_schema,
          prompt_content, negative_prompt, sort_order, status, is_default, remark,
          created_by_admin_id, updated_by_admin_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16, $16)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          stage = EXCLUDED.stage,
          model_family = EXCLUDED.model_family,
          tags = EXCLUDED.tags,
          variables = EXCLUDED.variables,
          json_schema = EXCLUDED.json_schema,
          prompt_content = EXCLUDED.prompt_content,
          negative_prompt = EXCLUDED.negative_prompt,
          sort_order = EXCLUDED.sort_order,
          status = EXCLUDED.status,
          is_default = EXCLUDED.is_default,
          remark = EXCLUDED.remark,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        id,
        input.name.trim(),
        input.code.trim(),
        input.stage || "outline",
        input.model_family || "general",
        JSON.stringify(input.tags || []),
        JSON.stringify(input.variables || []),
        input.json_schema?.trim() || "",
        input.prompt_content.trim(),
        input.negative_prompt?.trim() || null,
        Number(input.sort_order || 0),
        input.status || "enabled",
        Boolean(input.is_default),
        input.remark?.trim() || null,
        input.actorAdminAccountId,
        input.now,
      ],
    );
    if (input.is_default) {
      await clearStageDefaults({
        id,
        stage: input.stage || "outline",
        actorAdminAccountId: input.actorAdminAccountId,
        now: input.now,
      });
    }
    await audit(input, existing ? "admin.shot_prompt.template.updated" : "admin.shot_prompt.template.created", id);
    return templateResponse(id);
  }

  async function copyTemplate(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<ShotPromptTemplateRow>(deps.db, "SELECT * FROM shot_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "shot_prompt_template_not_found", "分镜提示词不存在");
    return saveTemplate({
      ...templateFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      code: await uniqueCopyCode(existing.code),
      is_default: false,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      reason: input.reason || "copy shot prompt template",
      now: input.now,
    });
  }

  async function changeTemplateStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_shot_prompt_status", "状态不支持");
    const existing = await queryOne<ShotPromptTemplateRow>(deps.db, "SELECT * FROM shot_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "shot_prompt_template_not_found", "分镜提示词不存在");
    await deps.db.query(
      "UPDATE shot_prompt_templates SET status = $2, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.shot_prompt.template.status_changed", input.id, { status: input.status });
    return templateResponse(input.id);
  }

  async function templateResponse(id: string) {
    const row = await queryOne<ShotPromptTemplateRow>(deps.db, "SELECT * FROM shot_prompt_templates WHERE id = $1", [id]);
    return { status: 200, body: { data: row ? templateFromRow(row) : { id } } };
  }

  async function clearStageDefaults(input: { id: string; stage: string; actorAdminAccountId: string; now: Date }) {
    await deps.db.query(
      `
        UPDATE shot_prompt_templates
        SET is_default = false, updated_by_admin_id = $3, updated_at = $4
        WHERE deleted_at IS NULL
          AND stage = $2
          AND id <> $1
          AND is_default = true
      `,
      [input.id, input.stage, input.actorAdminAccountId, input.now],
    );
  }

  async function audit(input: AdminMutationInput, eventType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType,
      targetType: "shot_prompt_template",
      targetId,
      reason: input.reason || eventType,
      sensitive: false,
      metadata,
    });
  }

  async function uniqueCopyCode(code: string) {
    for (let index = 1; index < 100; index += 1) {
      const candidate = `${code}_copy${index === 1 ? "" : index}`;
      const existing = await queryOne<{ id: string }>(deps.db, "SELECT id FROM shot_prompt_templates WHERE code = $1", [candidate]);
      if (!existing) return candidate;
    }
    return `${code}_copy_${Date.now()}`;
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
        INSERT INTO shot_prompt_templates (
          id, name, code, stage, model_family, tags, variables, json_schema,
          prompt_content, negative_prompt, sort_order, status, is_default, remark, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, 'enabled', $12, $13, $14, $14)
        ON CONFLICT (code) DO NOTHING
      `,
      [
        item.id,
        item.name,
        item.code,
        item.stage,
        item.model_family,
        JSON.stringify(item.tags),
        JSON.stringify(item.variables),
        item.json_schema,
        item.prompt_content,
        item.negative_prompt || null,
        item.sort_order,
        item.is_default,
        item.remark,
        seedUpdatedAt,
      ],
    );
  }
}

function validateTemplatePayload(input: SaveShotPromptTemplateInput) {
  if (!input.name?.trim() || !input.code?.trim()) {
    return error(400, "shot_prompt_template_required", "名称和编码必填");
  }
  if (!/^[a-z0-9_]+$/.test(input.code.trim())) {
    return error(400, "invalid_shot_prompt_code", "编码只能包含小写字母、数字和下划线");
  }
  if (input.stage && input.stage !== "outline") {
    return error(400, "invalid_shot_prompt_stage", "分镜提示词阶段不支持");
  }
  if (input.model_family && !["general", "doubao", "seedream"].includes(input.model_family)) {
    return error(400, "invalid_shot_prompt_model_family", "模型族不支持");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "shot_prompt_content_required", "分镜提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_shot_prompt_status", "状态不支持");
  }
  return null;
}

function templateFromRow(row: ShotPromptTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    stage: row.stage,
    model_family: row.model_family,
    modelFamily: row.model_family,
    tags: arrayFromJson(row.tags),
    variables: arrayFromJson(row.variables),
    json_schema: row.json_schema || "",
    jsonSchema: row.json_schema || "",
    prompt_content: row.prompt_content,
    promptContent: row.prompt_content,
    negative_prompt: row.negative_prompt || "",
    negativePrompt: row.negative_prompt || "",
    sort_order: Number(row.sort_order || 0),
    sortOrder: Number(row.sort_order || 0),
    status: row.status,
    is_default: Boolean(row.is_default),
    isDefault: Boolean(row.is_default),
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

function template(input: {
  name: string;
  code: string;
  stage: ShotPromptStage;
  model_family?: string;
  tags: string[];
  variables: string[];
  json_schema: string;
  prompt_content: string;
  negative_prompt?: string;
  sort_order: number;
  is_default?: boolean;
  remark: string;
}) {
  return {
    id: stableUuid(`shot-prompt-template:${input.code}`),
    model_family: "general",
    is_default: false,
    ...input,
  };
}

const defaultNegativePrompt = "避免文字水印、logo、乱码字幕、人物换脸、服装突变、发型突变、肢体畸形、多手多脚、多人关系错位、道具消失、画面主体不清、构图混乱、低清晰度、过曝、模糊、镜头动作过多。";

const defaultShotPromptTemplates = [
  template({
    name: "抖音爆款短剧分镜",
    code: "douyin_viral_short_drama",
    stage: "outline",
    tags: ["抖音短剧", "强钩子", "反转", "4-15秒"],
    variables: ["{{story_text}}"],
    json_schema: "shots[].shot_no, duration_seconds, plot_function, visual_content, shot_size, camera_move, action_expression, dialogue_voiceover, subtitle, sound_bgm, transition, hook_note",
    prompt_content: `你是一位资深抖音短剧导演和爆款短视频编剧，擅长把剧情文本改造成适合抖音传播的竖屏分镜脚本。你的目标不是机械拆分剧情，而是根据剧情节奏、人物冲突、情绪递进和反转节点，把故事拆成一组具有完播吸引力的短视频分镜。

请将我提供的剧情改写为抖音短剧分镜脚本。每个分镜时长控制在 4-15 秒之间，根据剧情自然划分，不要平均切分。首镜必须在 4-6 秒内制造悬念、冲突、反差或强烈情绪，让观众愿意继续看。中段要持续推进矛盾，每 2-4 个镜头出现一次新的信息、阻碍、误会、情绪变化或关系转折。结尾必须有反转、悬念、情绪爆点或下一集钩子。

分镜要求适配 9:16 竖屏短视频。每个镜头只表达一个主要剧情动作或情绪重点。遇到场景变化、人物视角变化、情绪转折、重要动作开始或结束、关键道具出现、对白主体切换时，可以新建分镜。同一场景内连续的小动作可以合并，不要拆得太碎。

请用 JSON 数组输出，每个对象包含：shot_no、duration_seconds、plot_function、visual_content、shot_size、camera_move、action_expression、dialogue_voiceover、subtitle、sound_bgm、transition、hook_note。

plot_function 从“钩子、铺垫、冲突、升级、误会、反转、高潮、收尾、悬念”中选择。shot_size 从“远景、全景、中景、近景、特写、大特写”中选择。camera_move 可以使用“固定镜头、缓慢推进、跟拍、平移、拉远、俯拍、仰拍、快速推近、手持晃动、环绕”等，但每个镜头只使用一种主要运镜。

台词要短，有冲突感，符合抖音短剧节奏。字幕要比台词更凝练，适合观众快速扫读。音效和 BGM 要服务情绪，例如心跳声、低频悬疑音、转场鼓点、玻璃碎裂声、电话震动声、突然静音等。

最后补充 rhythm_analysis，说明哪些镜头负责吸引观众，哪些镜头负责推进冲突，哪些镜头负责反转或留悬念。

剧情如下：
{{story_text}}`,
    sort_order: 900,
    is_default: true,
    remark: "擅长强钩子、强冲突、强反转，适合 30 秒到 3 分钟抖音竖屏短剧。",
  }),

];
