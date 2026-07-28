import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { assertPromptCanBeDeactivated, ensureOfficialPromptDefault } from "../prompt-marketplace/prompt-skill-default.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");
interface PropPromptTemplateRow {
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

interface SavePropPromptTemplateInput extends AdminMutationInput {
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

export function createAdminPropPromptService(deps: { db: SqlDatabase }) {
  async function listTemplates(input: {
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultPropPromptTemplates(deps.db);
    await ensureOfficialPromptDefault(deps.db, "prop_extract");
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<PropPromptTemplateRow>(
      `
        SELECT prompts.*, EXISTS (
          SELECT 1 FROM prompt_official_defaults prompt_default
          WHERE prompt_default.prompt_category = 'prop_extract' AND prompt_default.prompt_id = prompts.id
        ) AS is_default
        FROM prompts
        WHERE prompt_category = 'prop_extract' AND deleted_at IS NULL
          AND ($1::text IS NULL OR status = $1)
          AND (
            $2::text IS NULL
            OR lower(name) LIKE $2
            OR lower(prompt_content) LIKE $2
          )
        ORDER BY updated_at DESC, id ASC
        LIMIT $3
      `,
      [input.status || null, keyword, pageSize],
    );
    return { data: rows.rows.map(templateFromRow) };
  }

  async function saveTemplate(input: SavePropPromptTemplateInput) {
    const validation = validateTemplatePayload(input);
    if (validation) return validation;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<PropPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'prop_extract' AND deleted_at IS NULL", [input.id])
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
        VALUES ($1, 'prop_extract', $2, $3, $4, $5, $6, true, $7, $8, CASE WHEN $8 THEN $10::timestamptz ELSE NULL END, $9, $9, $10, $10)
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
    await audit(input, existing ? "admin.prop_prompt.template.updated" : "admin.prop_prompt.template.created", id);
    return templateResponse(id);
  }

  async function copyTemplate(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<PropPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'prop_extract' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "prop_prompt_template_not_found", "场景提示词不存在");
    return saveTemplate({
      ...templateFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      actorAdminAccountId: input.actorAdminAccountId,
      reason: input.reason || "copy scene prompt template",
      now: input.now,
    });
  }

  async function changeTemplateStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_prop_prompt_status", "状态不支持");
    const existing = await queryOne<PropPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'prop_extract' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "prop_prompt_template_not_found", "场景提示词不存在");
    if (input.status === "disabled") await assertPromptCanBeDeactivated(deps.db, input.id);
    await deps.db.query(
      "UPDATE prompts SET status = $2, is_published = CASE WHEN $2 = 'disabled' THEN false ELSE is_published END, published_at = CASE WHEN $2 = 'disabled' THEN NULL ELSE published_at END, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1 AND prompt_category = 'prop_extract'",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.prop_prompt.template.status_changed", input.id, { status: input.status });
    return templateResponse(input.id);
  }

  async function templateResponse(id: string) {
    const row = await queryOne<PropPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'prop_extract'", [id]);
    return { status: 200, body: { data: row ? templateFromRow(row) : { id } } };
  }

  async function audit(input: AdminMutationInput, eventType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType,
      targetType: "prop_prompt_template",
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

export async function ensureDefaultPropPromptTemplates(db: SqlDatabase) {
  const existing = await queryOne<{ count: string | number }>(db, "SELECT COUNT(*) AS count FROM prompts WHERE prompt_category = 'prop_extract' AND deleted_at IS NULL");
  if (Number(existing?.count || 0) > 0) {
    await ensureOfficialPromptDefault(db, "prop_extract", seedUpdatedAt);
    return;
  }
  for (const item of defaultPropPromptTemplates) {
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, prompt_content, status,
          is_official, is_published, published_at, created_at, updated_at
        )
        VALUES ($1, 'prop_extract', $2, $3, $4, 'enabled', true, true, $5, $5, $5)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        item.id,
        item.name,
        item.remark || "",
        item.prompt_content,
        seedUpdatedAt,
      ],
    );
  }
  await ensureOfficialPromptDefault(db, "prop_extract", seedUpdatedAt);
}

function validateTemplatePayload(input: SavePropPromptTemplateInput) {
  if (!input.name?.trim()) {
    return error(400, "prop_prompt_template_required", "名称必填");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "prop_prompt_content_required", "场景提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_prop_prompt_status", "状态不支持");
  }
  if (input.price_credits !== undefined && (!Number.isInteger(input.price_credits) || input.price_credits < 0 || input.price_credits > 99_999)) {
    return error(400, "invalid_prop_prompt_price", "积分价格必须是 0 到 99999 的整数");
  }
  if (input.usage_count !== undefined && (!Number.isInteger(input.usage_count) || input.usage_count < 0 || input.usage_count > 2_147_483_647)) {
    return error(400, "invalid_prop_prompt_usage_count", "使用次数必须是非负整数");
  }
  return null;
}

function templateFromRow(row: PropPromptTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    prompt_category: "prop_extract",
    category: "prop_extract",
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
    id: stableUuid(`prop-prompt-template:${input.name}`),
    ...input,
  };
}

const defaultPropPromptTemplates = [
  template({
    name: "\u9ed8\u8ba4\u9053\u5177\u63d0\u793a\u8bcd",
    prompt_content: "\u8bf7\u9605\u8bfb\u4ee5\u4e0b\u3010\u5267\u672c\u3011\uff0c\u63d0\u53d6\u5176\u4e2d\u5bf9\u5267\u60c5\u63a8\u8fdb\u3001\u89d2\u8272\u884c\u52a8\u3001\u573a\u666f\u8bc6\u522b\u6709\u4f5c\u7528\u7684\u9053\u5177\uff0c\u5e76\u4e3a\u6bcf\u4e2a\u9053\u5177\u751f\u6210\u53ef\u7528\u4e8e\u751f\u56fe\u6a21\u578b\u7684\u9053\u5177\u63d0\u793a\u8bcd\u3002\n\n\u3010\u5267\u672c\u3011\n{{\u5267\u672c}}\n\n\u8981\u6c42\uff1a\n1. \u53ea\u63d0\u53d6\u5267\u672c\u4e2d\u771f\u5b9e\u51fa\u73b0\u6216\u5f3a\u6697\u793a\u7684\u9053\u5177\uff0c\u4e0d\u8981\u51ed\u7a7a\u6dfb\u52a0\u3002\n2. \u4fdd\u7559\u9053\u5177\u540d\u79f0\u3001\u5916\u89c2\u3001\u6750\u8d28\u3001\u5c3a\u5bf8\u3001\u72b6\u6001\u3001\u6240\u5c5e\u89d2\u8272\u6216\u4f7f\u7528\u8005\u3001\u9996\u6b21\u51fa\u73b0\u4f4d\u7f6e\u3002\n3. \u9053\u5177\u751f\u56fe\u63d0\u793a\u8bcd\u8981\u5177\u4f53\u3001\u53ef\u89c6\u5316\u3001\u4fbf\u4e8e\u751f\u6210\uff0c\u5e76\u4fdd\u6301\u65f6\u4ee3\u80cc\u666f\u548c\u9898\u6750\u4e00\u81f4\u3002\n4. \u5982\u9053\u5177\u4f1a\u53cd\u590d\u51fa\u73b0\uff0c\u8bf4\u660e\u4e00\u81f4\u6027\u7ea6\u675f\u3002",
    remark: "\u9ed8\u8ba4\u7528\u4e8e\u5267\u672c\u8f6c\u9053\u5177\u63d0\u793a\u8bcd\u3002",
  }),
];
