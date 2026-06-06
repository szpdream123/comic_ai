import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");

type JsonValue = unknown;

interface CharacterPromptTemplateRow {
  id: string;
  name: string;
  code: string;
  stage: string;
  model_family: string;
  tags: JsonValue;
  variables: JsonValue;
  chunk_min_chars: number | string;
  chunk_max_chars: number | string;
  overlap_chars: number | string;
  json_schema: string | null;
  prompt_content: string;
  is_default: boolean;
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

interface SaveCharacterPromptTemplateInput extends AdminMutationInput {
  id?: string;
  name: string;
  code: string;
  stage: string;
  model_family?: string;
  tags?: string[];
  variables?: string[];
  chunk_min_chars?: number;
  chunk_max_chars?: number;
  overlap_chars?: number;
  json_schema?: string | null;
  prompt_content: string;
  is_default?: boolean;
  sort_order?: number;
  status?: string;
  remark?: string | null;
}

export function createAdminCharacterPromptService(deps: { db: SqlDatabase }) {
  async function listTemplates(input: {
    stage?: string | null;
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultCharacterPromptTemplates(deps.db);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<CharacterPromptTemplateRow>(
      `
        SELECT *
        FROM character_prompt_templates
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR stage = $1)
          AND ($2::text IS NULL OR status = $2)
          AND (
            $3::text IS NULL
            OR lower(name) LIKE $3
            OR lower(code) LIKE $3
            OR lower(tags::text) LIKE $3
          )
        ORDER BY stage ASC, sort_order DESC, updated_at DESC, id ASC
        LIMIT $4
      `,
      [input.stage || null, input.status || null, keyword, clamp(Number(input.pageSize || 100), 1, 500)],
    );
    return { data: rows.rows.map(templateFromRow) };
  }

  async function saveTemplate(input: SaveCharacterPromptTemplateInput) {
    const validation = validateTemplatePayload(input);
    if (validation) return validation;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM character_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id])
      : undefined;
    const duplicate = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM character_prompt_templates WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) AND deleted_at IS NULL",
      [input.code.trim(), input.id || null],
    );
    if (duplicate) return error(409, "character_prompt_code_duplicate", "人物提示词编码已存在");

    await deps.db.query(
      `
        INSERT INTO character_prompt_templates (
          id, name, code, stage, model_family, tags, variables, chunk_min_chars,
          chunk_max_chars, overlap_chars, json_schema, prompt_content, is_default,
          sort_order, status, remark, created_by_admin_id, updated_by_admin_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17, $18, $18)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          stage = EXCLUDED.stage,
          model_family = EXCLUDED.model_family,
          tags = EXCLUDED.tags,
          variables = EXCLUDED.variables,
          chunk_min_chars = EXCLUDED.chunk_min_chars,
          chunk_max_chars = EXCLUDED.chunk_max_chars,
          overlap_chars = EXCLUDED.overlap_chars,
          json_schema = EXCLUDED.json_schema,
          prompt_content = EXCLUDED.prompt_content,
          is_default = EXCLUDED.is_default,
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
        input.stage,
        input.model_family || "general",
        JSON.stringify(input.tags || []),
        JSON.stringify(normalizeVariables(input.variables || extractTemplateVariables(input.prompt_content))),
        Number(input.chunk_min_chars || 0),
        Number(input.chunk_max_chars || 0),
        Number(input.overlap_chars || 0),
        input.json_schema?.trim() || null,
        input.prompt_content.trim(),
        Boolean(input.is_default),
        Number(input.sort_order || 0),
        input.status || "enabled",
        input.remark?.trim() || null,
        input.actorAdminAccountId,
        input.now,
      ],
    );
    await audit(input, existing ? "admin.character_prompt.template.updated" : "admin.character_prompt.template.created", id);
    return templateResponse(id);
  }

  async function copyTemplate(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM character_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "character_prompt_template_not_found", "人物提示词模板不存在");
    return saveTemplate({
      ...templateFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      code: await uniqueCopyCode(existing.code),
      is_default: false,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      reason: input.reason || "copy character prompt template",
      now: input.now,
    });
  }

  async function changeTemplateStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_character_prompt_status", "状态不支持");
    const existing = await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM character_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "character_prompt_template_not_found", "人物提示词模板不存在");
    await deps.db.query(
      "UPDATE character_prompt_templates SET status = $2, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.character_prompt.template.status_changed", input.id, { status: input.status });
    return templateResponse(input.id);
  }

  async function compose(input: { template_id?: string | null; template_code?: string | null; variables?: Record<string, unknown> }) {
    await ensureDefaultCharacterPromptTemplates(deps.db);
    const row = input.template_id
      ? await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM character_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.template_id])
      : await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM character_prompt_templates WHERE code = $1 AND deleted_at IS NULL", [input.template_code || ""]);
    if (!row) return error(404, "character_prompt_template_not_found", "人物提示词模板不存在");
    const template = templateFromRow(row);
    const requiredVariables = normalizeVariables(template.variables.length ? template.variables : extractTemplateVariables(template.prompt_content));
    const missingVariables = requiredVariables.filter((name) => !hasVariable(input.variables || {}, name));
    if (missingVariables.length > 0) {
      return {
        status: 400,
        body: {
          error: {
            code: "character_prompt_missing_variables",
            message: "人物提示词变量缺失",
            details: { missingVariables },
          },
        },
      };
    }
    const composedPrompt = renderTemplate(template.prompt_content, input.variables || {});
    return {
      status: 200,
      body: {
        data: {
          template,
          composed_prompt: composedPrompt,
          variables: requiredVariables,
          missing_variables: [],
        },
      },
    };
  }

  async function templateResponse(id: string) {
    const row = await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM character_prompt_templates WHERE id = $1", [id]);
    return { status: 200, body: { data: row ? templateFromRow(row) : { id } } };
  }

  async function uniqueCopyCode(code: string) {
    for (let index = 1; index < 100; index += 1) {
      const candidate = `${code}_copy${index === 1 ? "" : index}`;
      const existing = await queryOne<{ id: string }>(deps.db, "SELECT id FROM character_prompt_templates WHERE code = $1", [candidate]);
      if (!existing) return candidate;
    }
    return `${code}_copy_${Date.now()}`;
  }

  async function audit(input: AdminMutationInput, eventType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType,
      targetType: "character_prompt_template",
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
    compose,
  };
}

export async function ensureDefaultCharacterPromptTemplates(db: SqlDatabase) {
  const existing = await queryOne<{ count: string | number }>(db, "SELECT COUNT(*) AS count FROM character_prompt_templates WHERE deleted_at IS NULL");
  if (Number(existing?.count || 0) > 0) return;
  for (const item of defaultCharacterPromptTemplates) {
    await db.query(
      `
        INSERT INTO character_prompt_templates (
          id, name, code, stage, model_family, tags, variables, chunk_min_chars,
          chunk_max_chars, overlap_chars, json_schema, prompt_content, is_default,
          sort_order, status, remark, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, 'enabled', $15, $16, $16)
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
        item.chunk_min_chars,
        item.chunk_max_chars,
        item.overlap_chars,
        item.json_schema,
        item.prompt_content,
        item.is_default,
        item.sort_order,
        item.remark,
        seedUpdatedAt,
      ],
    );
  }
}

function validateTemplatePayload(input: SaveCharacterPromptTemplateInput) {
  if (!input.name?.trim() || !input.code?.trim() || !input.stage?.trim()) {
    return error(400, "character_prompt_template_required", "名称、编码和阶段必填");
  }
  if (!/^[a-z0-9_]+$/.test(input.code.trim())) {
    return error(400, "invalid_character_prompt_code", "编码只能包含小写字母、数字和下划线");
  }
  if (!["extract", "merge", "grid"].includes(input.stage)) {
    return error(400, "invalid_character_prompt_stage", "人物提示词阶段不支持");
  }
  if (input.model_family && !["general", "doubao", "seedream"].includes(input.model_family)) {
    return error(400, "invalid_character_prompt_model_family", "模型族不支持");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "character_prompt_content_required", "人物提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_character_prompt_status", "状态不支持");
  }
  return null;
}

function templateFromRow(row: CharacterPromptTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    stage: row.stage,
    model_family: row.model_family,
    tags: arrayFromJson(row.tags),
    variables: arrayFromJson(row.variables),
    chunk_min_chars: Number(row.chunk_min_chars || 0),
    chunk_max_chars: Number(row.chunk_max_chars || 0),
    overlap_chars: Number(row.overlap_chars || 0),
    json_schema: row.json_schema || "",
    prompt_content: row.prompt_content,
    is_default: Boolean(row.is_default),
    sort_order: Number(row.sort_order || 0),
    status: row.status,
    remark: row.remark || "",
    created_at: dateString(row.created_at),
    updated_at: dateString(row.updated_at),
  };
}

function renderTemplate(template: string, variables: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => variableToText(variables[key]));
}

function extractTemplateVariables(template: string) {
  return Array.from(template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((match) => match[1]);
}

function normalizeVariables(values: string[]) {
  return Array.from(new Set(values.map((value) => value.replace(/[{}]/g, "").trim()).filter(Boolean)));
}

function hasVariable(variables: Record<string, unknown>, name: string) {
  const value = variables[name];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function variableToText(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
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

const defaultCharacterPromptTemplates = [
  {
    id: stableUuid("character-prompt-template:novel_character_extract"),
    name: "长篇小说人物线索抽取",
    code: "novel_character_extract",
    stage: "extract",
    model_family: "general",
    tags: ["分块抽取", "证据", "JSON"],
    variables: ["chunk_id", "novel_chunk"],
    chunk_min_chars: 3000,
    chunk_max_chars: 8000,
    overlap_chars: 500,
    json_schema: "characters[].name, aliases, gender, age_text, identity, faction, importance, evidence arrays, confidence",
    prompt_content: `你是小说人物抽取专家。请只分析当前小说片段，抽取片段中出现的主要人物、重要配角、反派、推动剧情的人物，以及对人物外貌、身份、服装、武器、性格、关系、场景有用的信息。

重要规则：
1. 只根据当前片段抽取，不要臆造后文剧情。
2. 可以合理推断性别、年龄段、身份，但必须标注 confidence。
3. 路人、无名士兵、普通百姓、只出现一次且不推动剧情的人物不要输出。
4. 同一人物的别称、称号、代称要记录到 aliases。
5. 如果信息不确定，填 null 或 unknown。
6. 输出必须是合法 JSON，不要 Markdown，不要解释。

chunk_id：
{{chunk_id}}

小说片段：
{{novel_chunk}}`,
    is_default: true,
    sort_order: 300,
    remark: "第一步只负责证据抽取。",
  },
  {
    id: stableUuid("character-prompt-template:novel_character_merge"),
    name: "人物档案合并去重",
    code: "novel_character_merge",
    stage: "merge",
    model_family: "general",
    tags: ["合并去重", "冲突处理", "人物档案"],
    variables: ["all_chunk_character_json"],
    chunk_min_chars: 0,
    chunk_max_chars: 0,
    overlap_chars: 0,
    json_schema: "final_characters[].id, name, aliases, appearance, costume, weapons, conflicts",
    prompt_content: `你是小说人物档案合并专家。请根据多个分块抽取结果，合并同一人物，去重别名，修正冲突，并生成最终人物档案。

重要规则：
1. 判断同一人物时，综合 name、aliases、身份、阵营、关系、场景。
2. 同名不同人必须拆开，并在 name 后加区分称谓。
3. 不确定冲突不要强行合并，写入 conflicts。
4. 最终只保留主角、重要配角、反派、关键阵营人物。
5. 不要编造小说没有支撑的重大设定。
6. 可以补全视觉设定，但必须符合原文身份、年龄、气质和时代背景。
7. 输出必须是合法 JSON，不要 Markdown，不要解释。

分块抽取结果：
{{all_chunk_character_json}}`,
    is_default: true,
    sort_order: 200,
    remark: "第二步负责合并成人物档案。",
  },
  {
    id: stableUuid("character-prompt-template:character_grid_sheet"),
    name: "九宫格角色设定图生成",
    code: "character_grid_sheet",
    stage: "grid",
    model_family: "doubao",
    tags: ["九宫格", "角色设定", "一致性"],
    variables: ["character_profile_json"],
    chunk_min_chars: 0,
    chunk_max_chars: 0,
    overlap_chars: 0,
    json_schema: "中文提示词 sections: 人物, 九宫格角色设定图提示词, 负面提示词",
    prompt_content: `你是 AI 生图提示词专家。请根据输入的最终人物档案，生成一条“小说人物九宫格角色设定图提示词”。

要求：
1. 生成的是 3x3 九宫格角色设定图，不是单人海报。
2. 九个格子必须内容明确、互不重复。
3. 同一人物在九宫格中必须保持同一张脸、同一发型、同一服装、同一武器、同一色彩方案。
4. 默认中国人/东亚人面孔，除非人物档案明确不是。
5. 年龄感、身份、阵营、气质必须准确。
6. 输出中文提示词，适合直接给生图模型使用。

【九宫格角色设定图提示词】
生成一张3x3九宫格角色设定图，专业影视美术角色参考板，游戏角色原画设定九宫格，电影级写实质感，超高清，九个格子边框清晰，人物身份统一，画面整洁，细节丰富。

第1格：高清面部特写，展示脸型、五官、眼神、妆容或胡须，面部清晰，有辨识度。
第2格：半身定妆照，展示发型、发饰、肩颈、衣领、上身服装、配饰。
第3格：全身正面图，单人正面站姿，服装完整可见，身体比例准确。
第4格：全身侧面图，展示侧面轮廓、发型长度、服装层次、武器挂载方式。
第5格：全身背面图，展示背面发型、披风、衣摆、背部纹样、武器背负方式。
第6格：服装细节拆解，展示衣领、袖口、腰封、护腕、鞋履、披风、纹样、材质细节。
第7格：武器与配饰细节，展示主武器、副武器、发饰、玉佩、腰牌、戒指、护腕、挂坠或法器。
第8格：表情参考，展示冷漠、审视、微怒、沉思四种表情，保持同一张脸。
第9格：动作与场景参考，展示代表动作和适配背景，背景与小说场景一致。

完整人物外观：
{完整外观描述}

完整服装设计：
{完整服装描述}

完整武器配饰：
{完整武器与配饰描述}

整体风格：
cinematic realistic character design sheet, professional game character concept art, 3x3 grid layout, ultra detailed, sharp focus, consistent character identity, realistic fabric texture, realistic metal texture, realistic skin texture, high detail, clean panel borders.

负面提示词：
不要一次性塞进九宫格提示词，不要单人海报，不要普通写真，不要九宫格缺失，不要格子混乱，不要人物换脸，不要服装变化，不要发型变化，不要武器变化，不要三视图不一致，不要多人，不要西方面孔，不要欧美五官，不要网红脸，不要肢体畸形，不要多手，不要多脚，不要多手指，不要手指畸形，不要身体扭曲，不要比例失衡，不要头身比异常，不要低清晰度，不要模糊，不要水印，不要logo，不要乱码文字，不要廉价网游风，不要卡通Q版。

人物档案：
{{character_profile_json}}`,
    is_default: true,
    sort_order: 100,
    remark: "第三步才生成九宫格角色设定图。",
  },
];
