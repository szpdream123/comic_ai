import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");
const defaultNegativePrompt = "避免文字、水印、logo、人物大特写、单人海报、画面主体缺失、空间混乱、透视错误、低清晰度、过曝、畸形建筑、重复门窗、无前景中景远景层次";

type JsonValue = unknown;
type ScenePromptStage = "split" | "extract" | "merge" | "detail" | "image";

interface ScenePromptTemplateRow {
  id: string;
  name: string;
  code: string;
  stage: ScenePromptStage;
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

interface SaveScenePromptTemplateInput extends AdminMutationInput {
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

export function createAdminScenePromptService(deps: { db: SqlDatabase }) {
  async function listTemplates(input: {
    stage?: string | null;
    modelFamily?: string | null;
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultScenePromptTemplates(deps.db);
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<ScenePromptTemplateRow>(
      `
        SELECT *
        FROM scene_prompt_templates
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
          )
        ORDER BY sort_order DESC, updated_at DESC, id ASC
        LIMIT $5
      `,
      [input.stage || null, input.modelFamily || null, input.status || null, keyword, pageSize],
    );
    return { data: rows.rows.map(templateFromRow) };
  }

  async function saveTemplate(input: SaveScenePromptTemplateInput) {
    const validation = validateTemplatePayload(input);
    if (validation) return validation;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<ScenePromptTemplateRow>(deps.db, "SELECT * FROM scene_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id])
      : undefined;
    const duplicate = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM scene_prompt_templates WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) AND deleted_at IS NULL",
      [input.code.trim(), input.id || null],
    );
    if (duplicate) return error(409, "scene_prompt_template_code_duplicate", "场景提示词编码已存在");

    await deps.db.query(
      `
        INSERT INTO scene_prompt_templates (
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
        input.stage || "detail",
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
    await audit(input, existing ? "admin.scene_prompt.template.updated" : "admin.scene_prompt.template.created", id);
    return templateResponse(id);
  }

  async function copyTemplate(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<ScenePromptTemplateRow>(deps.db, "SELECT * FROM scene_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "scene_prompt_template_not_found", "场景提示词不存在");
    return saveTemplate({
      ...templateFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      code: await uniqueCopyCode(existing.code),
      is_default: false,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      reason: input.reason || "copy scene prompt template",
      now: input.now,
    });
  }

  async function changeTemplateStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_scene_prompt_status", "状态不支持");
    const existing = await queryOne<ScenePromptTemplateRow>(deps.db, "SELECT * FROM scene_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "scene_prompt_template_not_found", "场景提示词不存在");
    await deps.db.query(
      "UPDATE scene_prompt_templates SET status = $2, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.scene_prompt.template.status_changed", input.id, { status: input.status });
    return templateResponse(input.id);
  }

  async function templateResponse(id: string) {
    const row = await queryOne<ScenePromptTemplateRow>(deps.db, "SELECT * FROM scene_prompt_templates WHERE id = $1", [id]);
    return { status: 200, body: { data: row ? templateFromRow(row) : { id } } };
  }

  async function audit(input: AdminMutationInput, eventType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType,
      targetType: "scene_prompt_template",
      targetId,
      reason: input.reason || eventType,
      sensitive: false,
      metadata,
    });
  }

  async function uniqueCopyCode(code: string) {
    for (let index = 1; index < 100; index += 1) {
      const candidate = `${code}_copy${index === 1 ? "" : index}`;
      const existing = await queryOne<{ id: string }>(deps.db, "SELECT id FROM scene_prompt_templates WHERE code = $1", [candidate]);
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

export async function ensureDefaultScenePromptTemplates(db: SqlDatabase) {
  const existing = await queryOne<{ count: string | number }>(db, "SELECT COUNT(*) AS count FROM scene_prompt_templates WHERE deleted_at IS NULL");
  if (Number(existing?.count || 0) > 0) {
    return;
  }
  for (const item of defaultScenePromptTemplates) {
    await db.query(
      `
        INSERT INTO scene_prompt_templates (
          id, name, code, stage, model_family, tags, variables, json_schema,
          prompt_content, negative_prompt, sort_order, status, is_default, remark, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, 'enabled', true, $12, $13, $13)
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
        item.remark || null,
        seedUpdatedAt,
      ],
    );
  }
}

function validateTemplatePayload(input: SaveScenePromptTemplateInput) {
  if (!input.name?.trim() || !input.code?.trim()) {
    return error(400, "scene_prompt_template_required", "名称和编码必填");
  }
  if (!/^[a-z0-9_]+$/.test(input.code.trim())) {
    return error(400, "invalid_scene_prompt_code", "编码只能包含小写字母、数字和下划线");
  }
  if (input.stage && !["split", "extract", "merge", "detail", "image"].includes(input.stage)) {
    return error(400, "invalid_scene_prompt_stage", "场景提示词阶段不支持");
  }
  if (input.model_family && !["general", "doubao", "seedream"].includes(input.model_family)) {
    return error(400, "invalid_scene_prompt_model_family", "模型族不支持");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "scene_prompt_content_required", "场景提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_scene_prompt_status", "状态不支持");
  }
  return null;
}

function templateFromRow(row: ScenePromptTemplateRow) {
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
  stage: ScenePromptStage;
  model_family?: string;
  tags: string[];
  variables: string[];
  json_schema: string;
  prompt_content: string;
  negative_prompt?: string;
  sort_order: number;
  remark: string;
}) {
  return {
    id: stableUuid(`scene-prompt-template:${input.code}`),
    model_family: "general",
    ...input,
  };
}

const defaultScenePromptTemplates = [
  template({
    name: "长篇小说分场景拆分",
    code: "scene_split_long_novel",
    stage: "split",
    tags: ["长篇分场景", "章节拆分", "JSON"],
    variables: ["{{volume}}", "{{chapter}}", "{{novel_chapter}}", "{{previous_scene_summary}}"],
    json_schema: "scenes[].scene_id, scene_name, volume, chapter, sequence, location_id, location_name, environment_type, time, scene_role, characters, plot_function, previous_scene_link, next_scene_hook, continuity_notes, visual_motifs, summary",
    prompt_content: `你是长篇小说分场景策划。请根据输入的小说章节，将文本拆分为多个可独立拍摄、绘制、改编的场景。

拆分原则：
1. 地点变化必须拆分。
2. 时间明显变化必须拆分。
3. 人物目标、冲突状态或情绪重心变化明显时，可以拆分。
4. 回忆、梦境、幻觉、插叙必须单独标记。
5. 同一地点连续发生的小动作不要过度拆分，除非剧情功能发生变化。
6. 必须为长篇连续性保留 location_id、visual_motifs、continuity_notes。

请输出 JSON 数组。每个场景必须包含 scene_id、scene_name、volume、chapter、sequence、location_id、location_name、environment_type、time、scene_role、characters、plot_function、previous_scene_link、next_scene_hook、continuity_notes、visual_motifs、summary。

章节信息：{{volume}} / {{chapter}}
前一场景摘要：{{previous_scene_summary}}
小说章节：{{novel_chapter}}`,
    sort_order: 500,
    remark: "第一步：把长篇章节稳定拆成可追踪 scene_id 和 location_id。",
  }),
  template({
    name: "场景要素抽取",
    code: "scene_extract_elements",
    stage: "extract",
    tags: ["场景要素抽取", "空间结构", "伏笔"],
    variables: ["{{scene_json}}", "{{novel_scene_text}}"],
    json_schema: "environment, spatial_layers, visual_details, sounds, smells, tactile_details, props, foreshadowing, continuity_notes",
    prompt_content: `你是小说场景资料整理师。请只分析当前 scene_json 和对应原文，抽取可用于写作、分镜和生图的场景要素。

要求：
1. 不要改写剧情，不要新增原文没有依据的重大设定。
2. 把空间分为前景、中景、远景或入口、主体、深处。
3. 记录具体物件、声音、气味、触感、光线、材质。
4. 标出 location_id、visual_motifs、continuity_notes 中必须延续的内容。
5. 输出合法 JSON，不要 Markdown。

scene_json：{{scene_json}}
原文场景片段：{{novel_scene_text}}`,
    sort_order: 400,
    remark: "第二步：从单场景原文抽取空间、五感、道具和伏笔证据。",
  }),
  template({
    name: "长篇场景库合并",
    code: "scene_merge_library",
    stage: "merge",
    tags: ["场景库合并", "地点去重", "连续性"],
    variables: ["{{all_scene_extract_json}}", "{{existing_scene_library_json}}"],
    json_schema: "scene_library[].location_id, location_name, fixed_features, variable_states, appearances, visual_motifs, continuity_rules, unresolved_hooks",
    prompt_content: `你是长篇小说场景库管理员。请根据多个场景抽取结果和已有场景库，合并重复地点，形成可长期复用的场景圣经。

规则：
1. 同一地点必须复用同一个 location_id。
2. 固定空间结构写入 fixed_features。
3. 随章节变化的损毁、天气、血迹、灯光、封锁状态写入 variable_states。
4. 人物留下的痕迹、未回收道具、伏笔写入 continuity_rules 或 unresolved_hooks。
5. 冲突信息不要强行覆盖，写入 conflict_notes。
6. 输出合法 JSON，不要 Markdown。

已有场景库：{{existing_scene_library_json}}
本轮抽取结果：{{all_scene_extract_json}}`,
    sort_order: 300,
    remark: "第三步：维护长篇场景圣经，避免同一地点前后不一致。",
  }),
  template({
    name: "小说场景设定拆解表",
    code: "scene_detail_breakdown",
    stage: "detail",
    tags: ["场景设定拆解", "影视概念设定", "短视频场景稿"],
    variables: ["{{scene_json}}", "{{scene_extract_json}}", "{{scene_library_json}}"],
    json_schema: "sections: 场景名称, 所属篇章, 场景定位, 环境类型, 时间设定, 整体氛围, 场景主体, 场景描述, 细节元素拆解, 人物与场景关系, 剧情功能, 长篇连续性记录, 视觉母题, 光影版本, 声音氛围, 气味与触感, AI绘图提示词, 写作建议, 下一场景衔接建议",
    prompt_content: `你是影视概念设定师和小说场景美术指导。请根据输入的 scene 对象、场景要素抽取结果和场景库资料，生成完整的小说场景设定拆解表。

必须包含：
【场景名称】【所属篇章 / 长篇位置】【场景定位】【环境类型】【时间设定】【整体氛围】【场景主体】【场景描述】【细节元素拆解】【人物与场景关系】【剧情功能】【长篇连续性记录】【视觉母题】【光影版本】【声音氛围】【气味与触感】【可用于 AI 绘图的场景提示词】【小说写作使用建议】【下一场景衔接建议】。

要求：
1. 保持 location_id 对应地点的一致性。
2. 不要改变已存在的伏笔、道具、空间结构。
3. 如果本场景是旧地点再次出现，需要写出“本次变化”。
4. 场景描述 150-300 字，有空间层次、视觉细节、声音、气味或触感。
5. AI 绘图提示词必须包含主体、环境、时间、光影、氛围、细节元素、镜头视角、画面风格。

scene：{{scene_json}}
场景抽取：{{scene_extract_json}}
场景库：{{scene_library_json}}`,
    sort_order: 200,
    remark: "第四步：生成用户要看的完整场景拆解表。",
  }),
  template({
    name: "场景概念图提示词",
    code: "scene_image_concept_art",
    stage: "image",
    model_family: "doubao",
    tags: ["场景生图提示词", "影视概念设定图", "前景中景远景"],
    variables: ["{{scene_detail_json}}", "{{style_prompt}}"],
    json_schema: "positive_prompt, negative_prompt, aspect_ratio, camera, style_notes",
    prompt_content: `你是 AI 场景概念图提示词设计师。请根据场景设定拆解结果，生成适合生图模型的中文场景提示词。

格式：
主体空间 + 环境类型 + 时间 + 光影 + 氛围 + 前景细节 + 中景主体 + 远景背景 + 镜头视角 + 画面风格 + 长篇视觉母题。

要求：
1. 优先生成场景概念图，不做人物海报。
2. 人物只能作为小比例叙事点出现。
3. 必须体现前景、中景、远景。
4. 必须保留 visual_motifs 和 continuity_notes 中的重要元素。
5. 画面风格参考影视概念设定图、剧集美术设定稿、短视频场景设定稿。
6. 输出正向提示词和负向提示词。

场景拆解：{{scene_detail_json}}
风格补充：{{style_prompt}}`,
    negative_prompt: defaultNegativePrompt,
    sort_order: 100,
    remark: "第五步：把场景拆解转成可直接生图的概念图提示词。",
  }),
];
