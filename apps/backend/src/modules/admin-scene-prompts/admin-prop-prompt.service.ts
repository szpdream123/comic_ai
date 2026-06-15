import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");
const defaultNegativePrompt = "\u907f\u514d\u9053\u5177\u540d\u79f0\u524d\u540e\u4e0d\u4e00\u81f4\u3001\u51ed\u7a7a\u65b0\u589e\u5173\u952e\u9053\u5177\u3001\u9053\u5177\u6750\u8d28\u548c\u65f6\u4ee3\u80cc\u666f\u51b2\u7a81\u3001\u5c3a\u5bf8\u6bd4\u4f8b\u9519\u8bef\u3001\u4f4e\u6e05\u6670\u5ea6\u3001\u6587\u5b57\u6c34\u5370\u3001\u54c1\u724c logo\u3001\u5f62\u53d8\u7834\u635f\u548c\u7528\u9014\u4e0d\u660e\u3002";

type JsonValue = unknown;
type PropPromptStage = "extract";

interface PropPromptTemplateRow {
  id: string;
  name: string;
  code: string;
  stage: PropPromptStage;
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

interface SavePropPromptTemplateInput extends AdminMutationInput {
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

export function createAdminPropPromptService(deps: { db: SqlDatabase }) {
  async function listTemplates(input: {
    stage?: string | null;
    modelFamily?: string | null;
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultPropPromptTemplates(deps.db);
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<PropPromptTemplateRow>(
      `
        SELECT *
        FROM prop_prompt_templates
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

  async function saveTemplate(input: SavePropPromptTemplateInput) {
    const validation = validateTemplatePayload(input);
    if (validation) return validation;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<PropPromptTemplateRow>(deps.db, "SELECT * FROM prop_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id])
      : undefined;
    const duplicate = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM prop_prompt_templates WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) AND deleted_at IS NULL",
      [input.code.trim(), input.id || null],
    );
    if (duplicate) return error(409, "prop_prompt_template_code_duplicate", "场景提示词编码已存在");

    await deps.db.query(
      `
        INSERT INTO prop_prompt_templates (
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
        input.stage || "extract",
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
        stage: input.stage || "extract",
        actorAdminAccountId: input.actorAdminAccountId,
        now: input.now,
      });
    }
    await audit(input, existing ? "admin.prop_prompt.template.updated" : "admin.prop_prompt.template.created", id);
    return templateResponse(id);
  }

  async function copyTemplate(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<PropPromptTemplateRow>(deps.db, "SELECT * FROM prop_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "prop_prompt_template_not_found", "场景提示词不存在");
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
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_prop_prompt_status", "状态不支持");
    const existing = await queryOne<PropPromptTemplateRow>(deps.db, "SELECT * FROM prop_prompt_templates WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "prop_prompt_template_not_found", "场景提示词不存在");
    await deps.db.query(
      "UPDATE prop_prompt_templates SET status = $2, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.prop_prompt.template.status_changed", input.id, { status: input.status });
    return templateResponse(input.id);
  }

  async function templateResponse(id: string) {
    const row = await queryOne<PropPromptTemplateRow>(deps.db, "SELECT * FROM prop_prompt_templates WHERE id = $1", [id]);
    return { status: 200, body: { data: row ? templateFromRow(row) : { id } } };
  }

  async function clearStageDefaults(input: { id: string; stage: string; actorAdminAccountId: string; now: Date }) {
    await deps.db.query(
      `
        UPDATE prop_prompt_templates
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
      targetType: "prop_prompt_template",
      targetId,
      reason: input.reason || eventType,
      sensitive: false,
      metadata,
    });
  }

  async function uniqueCopyCode(code: string) {
    for (let index = 1; index < 100; index += 1) {
      const candidate = `${code}_copy${index === 1 ? "" : index}`;
      const existing = await queryOne<{ id: string }>(deps.db, "SELECT id FROM prop_prompt_templates WHERE code = $1", [candidate]);
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

export async function ensureDefaultPropPromptTemplates(db: SqlDatabase) {
  const existing = await queryOne<{ count: string | number }>(db, "SELECT COUNT(*) AS count FROM prop_prompt_templates WHERE deleted_at IS NULL");
  if (Number(existing?.count || 0) > 0) {
    return;
  }
  for (const item of defaultPropPromptTemplates) {
    await db.query(
      `
        INSERT INTO prop_prompt_templates (
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

function validateTemplatePayload(input: SavePropPromptTemplateInput) {
  if (!input.name?.trim() || !input.code?.trim()) {
    return error(400, "prop_prompt_template_required", "名称和编码必填");
  }
  if (!/^[a-z0-9_]+$/.test(input.code.trim())) {
    return error(400, "invalid_prop_prompt_code", "编码只能包含小写字母、数字和下划线");
  }
  if (input.stage && input.stage !== "extract") {
    return error(400, "invalid_prop_prompt_stage", "场景提示词阶段不支持");
  }
  if (input.model_family && !["general", "doubao", "seedream"].includes(input.model_family)) {
    return error(400, "invalid_prop_prompt_model_family", "模型族不支持");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "prop_prompt_content_required", "场景提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_prop_prompt_status", "状态不支持");
  }
  return null;
}

function templateFromRow(row: PropPromptTemplateRow) {
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
  stage: PropPromptStage;
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
    id: stableUuid(`prop-prompt-template:${input.code}`),
    model_family: "general",
    ...input,
  };
}

const defaultPropPromptTemplates = [
  template({
    name: "\u9ed8\u8ba4\u9053\u5177\u63d0\u793a\u8bcd",
    code: "default_prop_extract",
    stage: "extract",
    tags: ["\u9053\u5177", "\u5267\u672c", "\u751f\u56fe\u63d0\u793a\u8bcd"],
    variables: ["\u5267\u672c"],
    json_schema: "props[].propName, props[].propDescription, props[].propImagePrompt, props[].firstAppearance, props[].ownerOrUser",
    prompt_content: "\u8bf7\u9605\u8bfb\u4ee5\u4e0b\u3010\u5267\u672c\u3011\uff0c\u63d0\u53d6\u5176\u4e2d\u5bf9\u5267\u60c5\u63a8\u8fdb\u3001\u89d2\u8272\u884c\u52a8\u3001\u573a\u666f\u8bc6\u522b\u6709\u4f5c\u7528\u7684\u9053\u5177\uff0c\u5e76\u4e3a\u6bcf\u4e2a\u9053\u5177\u751f\u6210\u53ef\u7528\u4e8e\u751f\u56fe\u6a21\u578b\u7684\u9053\u5177\u63d0\u793a\u8bcd\u3002\n\n\u3010\u5267\u672c\u3011\n{{\u5267\u672c}}\n\n\u8981\u6c42\uff1a\n1. \u53ea\u63d0\u53d6\u5267\u672c\u4e2d\u771f\u5b9e\u51fa\u73b0\u6216\u5f3a\u6697\u793a\u7684\u9053\u5177\uff0c\u4e0d\u8981\u51ed\u7a7a\u6dfb\u52a0\u3002\n2. \u4fdd\u7559\u9053\u5177\u540d\u79f0\u3001\u5916\u89c2\u3001\u6750\u8d28\u3001\u5c3a\u5bf8\u3001\u72b6\u6001\u3001\u6240\u5c5e\u89d2\u8272\u6216\u4f7f\u7528\u8005\u3001\u9996\u6b21\u51fa\u73b0\u4f4d\u7f6e\u3002\n3. \u9053\u5177\u751f\u56fe\u63d0\u793a\u8bcd\u8981\u5177\u4f53\u3001\u53ef\u89c6\u5316\u3001\u4fbf\u4e8e\u751f\u6210\uff0c\u5e76\u4fdd\u6301\u65f6\u4ee3\u80cc\u666f\u548c\u9898\u6750\u4e00\u81f4\u3002\n4. \u5982\u9053\u5177\u4f1a\u53cd\u590d\u51fa\u73b0\uff0c\u8bf4\u660e\u4e00\u81f4\u6027\u7ea6\u675f\u3002",
    negative_prompt: defaultNegativePrompt,
    sort_order: 100,
    remark: "\u9ed8\u8ba4\u7528\u4e8e\u5267\u672c\u8f6c\u9053\u5177\u63d0\u793a\u8bcd\u3002",
  }),
];
