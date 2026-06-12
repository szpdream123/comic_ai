import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");
const defaultNegativePrompt = "避免文字、水印、logo、人物大特写、单人海报、画面主体缺失、空间混乱、透视错误、低清晰度、过曝、畸形建筑、重复门窗、无前景中景远景层次";

type JsonValue = unknown;
type ScenePromptStage = "split";

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
        input.stage || "split",
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
        stage: input.stage || "split",
        actorAdminAccountId: input.actorAdminAccountId,
        now: input.now,
      });
    }
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

  async function clearStageDefaults(input: { id: string; stage: string; actorAdminAccountId: string; now: Date }) {
    await deps.db.query(
      `
        UPDATE scene_prompt_templates
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
  if (input.stage && input.stage !== "split") {
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
    name: "长篇小说场景拆分",
    code: "scene_split_long_novel",
    stage: "split",
    model_family: "general",
    tags: ["long_novel", "scene_detail"],
    variables: ["novel_chapter"],
    json_schema: "sections: scene_name, scene_role, scene_description, image_prompt",
    prompt_content: `请将长篇小说章节拆分为适合漫画分镜制作的连续场景。

输入章节：
{{novel_chapter}}

输出要求：
1. 每个场景包含 scene_name、scene_role、scene_description、location_id。
2. 保留 continuity_notes、visual_motifs、previous_scene_link、next_scene_hook。
3. image_prompt 需要包含 foreground、midground、background 和 cinematic concept art guidance。
4. 只输出合法 JSON，不要 Markdown。`,
    negative_prompt: defaultNegativePrompt,
    sort_order: 300,
    remark: "默认长篇小说场景拆分提示词",
  }),
];
