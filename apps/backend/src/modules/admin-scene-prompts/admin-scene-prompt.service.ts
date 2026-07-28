import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { assertPromptCanBeDeactivated, ensureOfficialPromptDefault } from "../prompt-marketplace/prompt-skill-default.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");
interface ScenePromptTemplateRow {
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

interface SaveScenePromptTemplateInput extends AdminMutationInput {
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

export function createAdminScenePromptService(deps: { db: SqlDatabase }) {
  async function listTemplates(input: {
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultScenePromptTemplates(deps.db);
    await ensureOfficialPromptDefault(deps.db, "scene_extract");
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<ScenePromptTemplateRow>(
      `
        SELECT prompts.*, EXISTS (
          SELECT 1 FROM prompt_official_defaults prompt_default
          WHERE prompt_default.prompt_category = 'scene_extract' AND prompt_default.prompt_id = prompts.id
        ) AS is_default
        FROM prompts
        WHERE prompt_category = 'scene_extract' AND deleted_at IS NULL
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

  async function saveTemplate(input: SaveScenePromptTemplateInput) {
    const validation = validateTemplatePayload(input);
    if (validation) return validation;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<ScenePromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'scene_extract' AND deleted_at IS NULL", [input.id])
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
        VALUES ($1, 'scene_extract', $2, $3, $4, $5, $6, true, $7, $8, CASE WHEN $8 THEN $10::timestamptz ELSE NULL END, $9, $9, $10, $10)
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
    await audit(input, existing ? "admin.scene_prompt.template.updated" : "admin.scene_prompt.template.created", id);
    return templateResponse(id);
  }

  async function copyTemplate(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<ScenePromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'scene_extract' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "scene_prompt_template_not_found", "场景提示词不存在");
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
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_scene_prompt_status", "状态不支持");
    const existing = await queryOne<ScenePromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'scene_extract' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "scene_prompt_template_not_found", "场景提示词不存在");
    if (input.status === "disabled") await assertPromptCanBeDeactivated(deps.db, input.id);
    await deps.db.query(
      "UPDATE prompts SET status = $2, is_published = CASE WHEN $2 = 'disabled' THEN false ELSE is_published END, published_at = CASE WHEN $2 = 'disabled' THEN NULL ELSE published_at END, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1 AND prompt_category = 'scene_extract'",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.scene_prompt.template.status_changed", input.id, { status: input.status });
    return templateResponse(input.id);
  }

  async function templateResponse(id: string) {
    const row = await queryOne<ScenePromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'scene_extract'", [id]);
    return { status: 200, body: { data: row ? templateFromRow(row) : { id } } };
  }

  async function audit(input: AdminMutationInput, eventType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType,
      targetType: "scene_prompt_template",
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

export async function ensureDefaultScenePromptTemplates(db: SqlDatabase) {
  const existing = await queryOne<{ count: string | number }>(db, "SELECT COUNT(*) AS count FROM prompts WHERE prompt_category = 'scene_extract' AND deleted_at IS NULL");
  if (Number(existing?.count || 0) > 0) {
    await ensureOfficialPromptDefault(db, "scene_extract", seedUpdatedAt);
    return;
  }
  for (const item of defaultScenePromptTemplates) {
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, prompt_content, status,
          is_official, is_published, published_at, created_at, updated_at
        )
        VALUES ($1, 'scene_extract', $2, $3, $4, 'enabled', true, true, $5, $5, $5)
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
  await ensureOfficialPromptDefault(db, "scene_extract", seedUpdatedAt);
}

function validateTemplatePayload(input: SaveScenePromptTemplateInput) {
  if (!input.name?.trim()) {
    return error(400, "scene_prompt_template_required", "名称必填");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "scene_prompt_content_required", "场景提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_scene_prompt_status", "状态不支持");
  }
  if (input.price_credits !== undefined && (!Number.isInteger(input.price_credits) || input.price_credits < 0 || input.price_credits > 99_999)) {
    return error(400, "invalid_scene_prompt_price", "积分价格必须是 0 到 99999 的整数");
  }
  if (input.usage_count !== undefined && (!Number.isInteger(input.usage_count) || input.usage_count < 0 || input.usage_count > 2_147_483_647)) {
    return error(400, "invalid_scene_prompt_usage_count", "使用次数必须是非负整数");
  }
  return null;
}

function templateFromRow(row: ScenePromptTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    prompt_category: "scene_extract",
    category: "scene_extract",
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
    id: stableUuid(`scene-prompt-template:${input.name}`),
    ...input,
  };
}

const defaultScenePromptTemplates = [
  template({
    name: "长篇小说场景拆分",
    prompt_content: `请将长篇小说章节拆分为适合漫画分镜制作的连续场景。

输入章节：
{{novel_chapter}}

输出要求：
1. 每个场景包含 scene_name、scene_role、scene_description、location_id。
2. 保留 continuity_notes、visual_motifs、previous_scene_link、next_scene_hook。
3. image_prompt 需要包含 foreground、midground、background 和 cinematic concept art guidance。
4. 只输出合法 JSON，不要 Markdown。`,
    remark: "默认长篇小说场景拆分提示词",
  }),
];
