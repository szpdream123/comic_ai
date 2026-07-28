import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { assertPromptCanBeDeactivated, ensureOfficialPromptDefault } from "../prompt-marketplace/prompt-skill-default.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");

interface CharacterPromptTemplateRow {
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

interface SaveCharacterPromptTemplateInput extends AdminMutationInput {
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

export function createAdminCharacterPromptService(deps: { db: SqlDatabase }) {
  async function listTemplates(input: {
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultCharacterPromptTemplates(deps.db);
    await ensureOfficialPromptDefault(deps.db, "character_extract");
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<CharacterPromptTemplateRow>(
      `
        SELECT prompts.*, EXISTS (
          SELECT 1 FROM prompt_official_defaults prompt_default
          WHERE prompt_default.prompt_category = 'character_extract' AND prompt_default.prompt_id = prompts.id
        ) AS is_default
        FROM prompts
        WHERE prompt_category = 'character_extract' AND deleted_at IS NULL
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
      [input.status || null, keyword, clamp(Number(input.pageSize || 100), 1, 500)],
    );
    return { data: rows.rows.map(templateFromRow) };
  }

  async function saveTemplate(input: SaveCharacterPromptTemplateInput) {
    const validation = validateTemplatePayload(input);
    if (validation) return validation;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'character_extract' AND deleted_at IS NULL", [input.id])
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
          created_by_admin_id, updated_by_admin_id,
          created_at, updated_at
        )
        VALUES ($1, 'character_extract', $2, $3, $4, $5, $6, true, $7, $8, CASE WHEN $8 THEN $10::timestamptz ELSE NULL END, $9, $9, $10, $10)
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
    await audit(input, existing ? "admin.character_prompt.template.updated" : "admin.character_prompt.template.created", id);
    return templateResponse(id);
  }

  async function copyTemplate(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'character_extract' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "character_prompt_template_not_found", "人物提示词模板不存在");
    return saveTemplate({
      ...templateFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      actorAdminAccountId: input.actorAdminAccountId,
      reason: input.reason || "copy character prompt template",
      now: input.now,
    });
  }

  async function changeTemplateStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_character_prompt_status", "状态不支持");
    const existing = await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'character_extract' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "character_prompt_template_not_found", "人物提示词模板不存在");
    if (input.status === "disabled") await assertPromptCanBeDeactivated(deps.db, input.id);
    await deps.db.query(
      "UPDATE prompts SET status = $2, is_published = CASE WHEN $2 = 'disabled' THEN false ELSE is_published END, published_at = CASE WHEN $2 = 'disabled' THEN NULL ELSE published_at END, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1 AND prompt_category = 'character_extract'",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.character_prompt.template.status_changed", input.id, { status: input.status });
    return templateResponse(input.id);
  }

  async function compose(input: { template_id?: string | null; variables?: Record<string, unknown> }) {
    await ensureDefaultCharacterPromptTemplates(deps.db);
    const row = input.template_id
      ? await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'character_extract' AND deleted_at IS NULL", [input.template_id])
      : undefined;
    if (!row) return error(404, "character_prompt_template_not_found", "人物提示词模板不存在");
    const template = templateFromRow(row);
    const requiredVariables = extractTemplateVariables(template.prompt_content);
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
    const row = await queryOne<CharacterPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'character_extract'", [id]);
    return { status: 200, body: { data: row ? templateFromRow(row) : { id } } };
  }

  async function audit(input: AdminMutationInput, eventType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
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
  const existing = await queryOne<{ count: string | number }>(db, "SELECT COUNT(*) AS count FROM prompts WHERE prompt_category = 'character_extract' AND deleted_at IS NULL");
  if (Number(existing?.count || 0) > 0) {
    await ensureOfficialPromptDefault(db, "character_extract", seedUpdatedAt);
    return;
  }
  for (const item of defaultCharacterPromptTemplates) {
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, prompt_content, status,
          is_official, is_published, published_at, created_at, updated_at
        )
        VALUES ($1, 'character_extract', $2, $3, $4, 'enabled', true, true, $5, $5, $5)
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
  await ensureOfficialPromptDefault(db, "character_extract", seedUpdatedAt);
}

function validateTemplatePayload(input: SaveCharacterPromptTemplateInput) {
  if (!input.name?.trim()) {
    return error(400, "character_prompt_template_required", "名称必填");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "character_prompt_content_required", "人物提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_character_prompt_status", "状态不支持");
  }
  if (input.price_credits !== undefined && (!Number.isInteger(input.price_credits) || input.price_credits < 0 || input.price_credits > 99_999)) {
    return error(400, "invalid_character_prompt_price", "积分价格必须是 0 到 99999 的整数");
  }
  if (input.usage_count !== undefined && (!Number.isInteger(input.usage_count) || input.usage_count < 0 || input.usage_count > 2_147_483_647)) {
    return error(400, "invalid_character_prompt_usage_count", "使用次数必须是非负整数");
  }
  return null;
}

function templateFromRow(row: CharacterPromptTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    prompt_category: "character_extract",
    category: "character_extract",
    summary: row.summary || "",
    cover_image_url: row.cover_image_url || "",
    coverImageUrl: row.cover_image_url || "",
    cover_storage_object_id: row.cover_storage_object_id,
    coverStorageObjectId: row.cover_storage_object_id,
    prompt_content: row.prompt_content,
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

function renderTemplate(template: string, variables: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => variableToText(variables[key]));
}

function extractTemplateVariables(template: string) {
  return Array.from(template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((match) => match[1]);
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
    prompt_content: `你是小说人物抽取专家。请只分析当前小说片段，抽取片段中出现的主要人物、重要配角、反派、推动剧情的人物，以及对人物完整人物外观、身份、服装、武器、性格、关系、场景有用的信息。

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
    remark: "第一步只负责证据抽取。",
  },
];
