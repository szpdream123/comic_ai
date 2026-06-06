import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export const defaultStoryboardBasePrompt = "请将所选小说章节改编为可拍摄的短剧/漫剧分镜脚本。保留原著主线、人物关系、关键冲突和核心爽点，将大段心理描写转化为动作、对白、表情、旁白和镜头画面。每个分镜只表达一个清晰动作或情绪点，保证角色、场景、道具前后一致。";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");

type JsonValue = unknown;

interface StoryboardPromptPackageRow {
  id: string;
  name: string;
  code: string;
  package_type: string;
  audience: string | null;
  tags: JsonValue;
  cover_image_url: string | null;
  prompt_content: string;
  key_points: JsonValue;
  negative_prompt: string | null;
  applicable_genres: JsonValue;
  applicable_scene: JsonValue;
  output_type: string | null;
  scope: JsonValue;
  can_stack: boolean;
  max_select_count: number | string | null;
  is_default: boolean;
  is_global_default: boolean;
  is_recommended: boolean;
  sort_order: number | string;
  status: string;
  remark: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface StoryboardPromptTemplateRow {
  id: string;
  name: string;
  code: string;
  base_prompt: string;
  genre_package_id: string;
  emotion_package_ids: JsonValue;
  camera_package_ids: JsonValue;
  output_package_id: string;
  taboo_package_ids: JsonValue;
  is_default: boolean;
  sort_order: number | string;
  status: string;
  remark: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export function createAdminStoryboardPromptService(deps: { db: SqlDatabase }) {
  async function listPackages(input: {
    packageType?: string | null;
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
  } = {}) {
    await ensureDefaultStoryboardPromptData(deps.db);
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const rows = await deps.db.query<StoryboardPromptPackageRow>(
      `
        SELECT *
        FROM storyboard_prompt_packages
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR package_type = $1)
          AND ($2::text IS NULL OR status = $2)
          AND (
            $3::text IS NULL
            OR lower(name) LIKE $3
            OR lower(code) LIKE $3
            OR lower(tags::text) LIKE $3
          )
        ORDER BY package_type ASC, sort_order DESC, updated_at DESC, id ASC
        LIMIT $4
      `,
      [input.packageType || null, input.status || null, keyword, pageSize],
    );
    return { data: rows.rows.map(packageFromRow) };
  }

  async function listTemplates(input: { pageSize?: number } = {}) {
    await ensureDefaultStoryboardPromptData(deps.db);
    const rows = await deps.db.query<StoryboardPromptTemplateRow>(
      `
        SELECT *
        FROM storyboard_prompt_templates
        WHERE deleted_at IS NULL
        ORDER BY sort_order DESC, updated_at DESC, id ASC
        LIMIT $1
      `,
      [clamp(Number(input.pageSize || 100), 1, 500)],
    );
    return { data: rows.rows.map(templateFromRow) };
  }

  async function savePackage(input: SavePackageInput) {
    const validation = validatePackagePayload(input);
    if (validation) return validation;
    const now = input.now;
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<StoryboardPromptPackageRow>(deps.db, "SELECT * FROM storyboard_prompt_packages WHERE id = $1 AND deleted_at IS NULL", [input.id])
      : undefined;
    const duplicate = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM storyboard_prompt_packages WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) AND deleted_at IS NULL",
      [input.code.trim(), input.id || null],
    );
    if (duplicate) return error(409, "storyboard_prompt_code_duplicate", "提示词包编码已存在");

    await deps.db.query(
      `
        INSERT INTO storyboard_prompt_packages (
          id, name, code, package_type, audience, tags, cover_image_url, prompt_content, key_points,
          negative_prompt, applicable_genres, applicable_scene, output_type, scope,
          can_stack, max_select_count, is_default, is_global_default, is_recommended,
          sort_order, status, remark, created_by_admin_id, updated_by_admin_id,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb,
          $10, $11::jsonb, $12::jsonb, $13, $14::jsonb,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $23, $24, $24
        )
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          package_type = EXCLUDED.package_type,
          audience = EXCLUDED.audience,
          tags = EXCLUDED.tags,
          cover_image_url = EXCLUDED.cover_image_url,
          prompt_content = EXCLUDED.prompt_content,
          key_points = EXCLUDED.key_points,
          negative_prompt = EXCLUDED.negative_prompt,
          applicable_genres = EXCLUDED.applicable_genres,
          applicable_scene = EXCLUDED.applicable_scene,
          output_type = EXCLUDED.output_type,
          scope = EXCLUDED.scope,
          can_stack = EXCLUDED.can_stack,
          max_select_count = EXCLUDED.max_select_count,
          is_default = EXCLUDED.is_default,
          is_global_default = EXCLUDED.is_global_default,
          is_recommended = EXCLUDED.is_recommended,
          sort_order = EXCLUDED.sort_order,
          status = EXCLUDED.status,
          remark = EXCLUDED.remark,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_at = EXCLUDED.updated_at
      `,
      packageParams({
        ...input,
        id,
        now,
      }),
    );
    await recordPackageVersion({
      packageId: id,
      actorAdminAccountId: input.actorAdminAccountId,
      reason: input.reason || (existing ? "update storyboard prompt package" : "create storyboard prompt package"),
      now,
    });
    await audit(input, existing ? "admin.storyboard_prompt.package.updated" : "admin.storyboard_prompt.package.created", "storyboard_prompt_package", id);
    return packageResponse(id);
  }

  async function copyPackage(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<StoryboardPromptPackageRow>(deps.db, "SELECT * FROM storyboard_prompt_packages WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "storyboard_prompt_package_not_found", "提示词包不存在");
    const copyCode = await uniqueCopyCode(existing.code);
    return savePackage({
      ...packageFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      code: copyCode,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      reason: input.reason || "copy storyboard prompt package",
      now: input.now,
    });
  }

  async function changePackageStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_storyboard_prompt_status", "状态不支持");
    const existing = await queryOne<StoryboardPromptPackageRow>(deps.db, "SELECT * FROM storyboard_prompt_packages WHERE id = $1 AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "storyboard_prompt_package_not_found", "提示词包不存在");
    await deps.db.query(
      "UPDATE storyboard_prompt_packages SET status = $2, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await recordPackageVersion({
      packageId: input.id,
      actorAdminAccountId: input.actorAdminAccountId,
      reason: input.reason || `change status to ${input.status}`,
      now: input.now,
    });
    await audit(input, "admin.storyboard_prompt.package.status_changed", "storyboard_prompt_package", input.id, { status: input.status });
    return packageResponse(input.id);
  }

  async function saveTemplate(input: SaveTemplateInput) {
    await ensureDefaultStoryboardPromptData(deps.db);
    if (!input.name.trim() || !input.code.trim()) return error(400, "storyboard_prompt_template_required", "模板名称和编码必填");
    if (!/^[a-z0-9_]+$/.test(input.code.trim())) return error(400, "invalid_storyboard_prompt_code", "编码只能包含小写字母、数字和下划线");
    if (!input.genre_package_id || !input.output_package_id) return error(400, "storyboard_prompt_template_packages_required", "组合模板必须选择题材包和输出格式包");
    const id = input.id || randomUUID();
    await deps.db.query(
      `
        INSERT INTO storyboard_prompt_templates (
          id, name, code, base_prompt, genre_package_id, emotion_package_ids,
          camera_package_ids, output_package_id, taboo_package_ids, is_default,
          sort_order, status, remark, created_by_admin_id, updated_by_admin_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10, $11, $12, $13, $14, $14, $15, $15)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          base_prompt = EXCLUDED.base_prompt,
          genre_package_id = EXCLUDED.genre_package_id,
          emotion_package_ids = EXCLUDED.emotion_package_ids,
          camera_package_ids = EXCLUDED.camera_package_ids,
          output_package_id = EXCLUDED.output_package_id,
          taboo_package_ids = EXCLUDED.taboo_package_ids,
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
        input.base_prompt?.trim() || defaultStoryboardBasePrompt,
        input.genre_package_id,
        JSON.stringify(input.emotion_package_ids || []),
        JSON.stringify(input.camera_package_ids || []),
        input.output_package_id,
        JSON.stringify(input.taboo_package_ids || []),
        Boolean(input.is_default),
        Number(input.sort_order || 0),
        input.status || "enabled",
        input.remark?.trim() || null,
        input.actorAdminAccountId,
        input.now,
      ],
    );
    await audit(input, "admin.storyboard_prompt.template.saved", "storyboard_prompt_template", id);
    const row = await queryOne<StoryboardPromptTemplateRow>(deps.db, "SELECT * FROM storyboard_prompt_templates WHERE id = $1", [id]);
    return { status: 200, body: { data: row ? templateFromRow(row) : { id } } };
  }

  async function compose(input: ComposeInput) {
    await ensureDefaultStoryboardPromptData(deps.db);
    const sections = await composeSections(input);
    const composedPrompt = sections.map((section) => `[${section.title}]\n${section.content}`).join("\n\n");
    return {
      status: 200,
      body: {
        data: {
          composed_prompt: composedPrompt,
          sections,
        },
      },
    };
  }

  async function testGenerate(input: ComposeInput & { novel_content?: string }) {
    const composed = await compose(input);
    const prompt = composed.body.data.composed_prompt;
    return {
      status: 200,
      body: {
        data: {
          result: `测试生成接口已收到 ${Number(input.novel_content?.length || 0).toLocaleString("zh-CN")} 字原文。\n\n当前会使用以下完整提示词调用文本模型：\n${prompt.slice(0, 1200)}`,
          usage: {
            input_tokens: Math.ceil((prompt.length + (input.novel_content?.length || 0)) / 2),
            output_tokens: 0,
          },
        },
      },
    };
  }

  async function exportConfig() {
    await ensureDefaultStoryboardPromptData(deps.db);
    return {
      packages: (await listPackages({ pageSize: 500 })).data,
      templates: (await listTemplates({ pageSize: 500 })).data,
    };
  }

  async function composeSections(input: ComposeInput) {
    const sections = [{ type: "base", title: "基础改编任务", content: input.base_prompt?.trim() || defaultStoryboardBasePrompt }];
    const append = async (type: string, ids: string[] | string | undefined, titlePrefix: string) => {
      const idList = (Array.isArray(ids) ? ids : ids ? [ids] : []).filter(Boolean);
      for (const id of idList) {
        const row = await queryOne<StoryboardPromptPackageRow>(
          deps.db,
          "SELECT * FROM storyboard_prompt_packages WHERE id = $1 AND deleted_at IS NULL",
          [id],
        );
        if (row) sections.push({ type, title: `${titlePrefix}：${row.name}`, content: row.prompt_content });
      }
    };
    await append("genre", input.genre_package_id, "题材包");
    await append("emotion", input.emotion_package_ids, "情绪包");
    await append("camera", input.camera_package_ids, "镜头包");
    await append("output", input.output_package_id, "输出格式包");
    await append("taboo", input.taboo_package_ids, "通用禁忌包");
    const extraRequest = input.variables?.extra_request || input.extra_request;
    if (extraRequest) sections.push({ type: "extra", title: "用户额外要求", content: String(extraRequest) });
    return sections;
  }

  async function packageResponse(id: string) {
    const row = await queryOne<StoryboardPromptPackageRow>(deps.db, "SELECT * FROM storyboard_prompt_packages WHERE id = $1", [id]);
    return { status: 200, body: { data: row ? packageFromRow(row) : { id } } };
  }

  async function recordPackageVersion(input: { packageId: string; actorAdminAccountId: string; reason: string; now: Date }) {
    const row = await queryOne<StoryboardPromptPackageRow>(deps.db, "SELECT * FROM storyboard_prompt_packages WHERE id = $1", [input.packageId]);
    if (!row) return;
    const versionRow = await queryOne<{ next_version: number | string }>(
      deps.db,
      "SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM storyboard_prompt_package_versions WHERE package_id = $1",
      [input.packageId],
    );
    await deps.db.query(
      `
        INSERT INTO storyboard_prompt_package_versions (
          id, package_id, version_no, snapshot_json, change_reason, created_by_admin_id, created_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
      `,
      [randomUUID(), input.packageId, Number(versionRow?.next_version || 1), JSON.stringify(packageFromRow(row)), input.reason, input.actorAdminAccountId, input.now],
    );
  }

  async function audit(input: AdminMutationInput, eventType: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType,
      targetType,
      targetId,
      reason: input.reason || eventType,
      sensitive: false,
      metadata,
    });
  }

  async function uniqueCopyCode(code: string) {
    for (let i = 1; i < 100; i += 1) {
      const candidate = `${code}_copy${i === 1 ? "" : i}`;
      const existing = await queryOne<{ id: string }>(deps.db, "SELECT id FROM storyboard_prompt_packages WHERE code = $1", [candidate]);
      if (!existing) return candidate;
    }
    return `${code}_copy_${Date.now()}`;
  }

  return {
    listPackages,
    listTemplates,
    savePackage,
    copyPackage,
    changePackageStatus,
    saveTemplate,
    compose,
    testGenerate,
    exportConfig,
  };
}

export async function ensureDefaultStoryboardPromptData(db: SqlDatabase) {
  const existing = await queryOne<{ count: string | number }>(db, "SELECT COUNT(*) AS count FROM storyboard_prompt_packages WHERE deleted_at IS NULL");
  if (Number(existing?.count || 0) > 0) return;
  for (const item of defaultStoryboardPromptPackages) {
    await db.query(
      `
        INSERT INTO storyboard_prompt_packages (
          id, name, code, package_type, audience, tags, prompt_content, key_points,
          negative_prompt, applicable_scene, output_type, can_stack, max_select_count,
          is_default, is_global_default, is_recommended, sort_order, status, remark,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, 'enabled', $18, $19, $19)
        ON CONFLICT (code) DO NOTHING
      `,
      [
        item.id,
        item.name,
        item.code,
        item.package_type,
        item.audience || null,
        JSON.stringify(item.tags || []),
        item.prompt_content,
        JSON.stringify(item.key_points || []),
        item.negative_prompt || null,
        JSON.stringify(item.applicable_scene || []),
        item.output_type || null,
        item.can_stack ?? true,
        item.max_select_count ?? null,
        Boolean(item.is_default),
        Boolean(item.is_global_default),
        Boolean(item.is_recommended),
        Number(item.sort_order || 0),
        item.remark || null,
        seedUpdatedAt,
      ],
    );
  }
  for (const template of defaultStoryboardPromptTemplates) {
    await db.query(
      `
        INSERT INTO storyboard_prompt_templates (
          id, name, code, base_prompt, genre_package_id, emotion_package_ids,
          camera_package_ids, output_package_id, taboo_package_ids, is_default,
          sort_order, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10, $11, 'enabled', $12, $12)
        ON CONFLICT (code) DO NOTHING
      `,
      [
        template.id,
        template.name,
        template.code,
        defaultStoryboardBasePrompt,
        template.genre_package_id,
        JSON.stringify(template.emotion_package_ids),
        JSON.stringify(template.camera_package_ids),
        template.output_package_id,
        JSON.stringify(template.taboo_package_ids),
        Boolean(template.is_default),
        Number(template.sort_order || 0),
        seedUpdatedAt,
      ],
    );
  }
}

interface AdminMutationInput {
  actorAdminAccountId: string;
  auditOrganizationId: string;
  auditWorkspaceId: string;
  reason?: string;
  now: Date;
}

interface SavePackageInput extends AdminMutationInput {
  id?: string;
  name: string;
  code: string;
  package_type: string;
  audience?: string | null;
  tags?: string[];
  prompt_content: string;
  cover_image_url?: string | null;
  key_points?: string[];
  negative_prompt?: string | null;
  applicable_genres?: string[];
  applicable_scene?: string[];
  output_type?: string | null;
  scope?: Record<string, unknown>;
  can_stack?: boolean;
  max_select_count?: number | null;
  is_default?: boolean;
  is_global_default?: boolean;
  is_recommended?: boolean;
  sort_order?: number;
  status?: string;
  remark?: string | null;
}

interface SaveTemplateInput extends AdminMutationInput {
  id?: string;
  name: string;
  code: string;
  base_prompt?: string;
  genre_package_id: string;
  emotion_package_ids?: string[];
  camera_package_ids?: string[];
  output_package_id: string;
  taboo_package_ids?: string[];
  is_default?: boolean;
  sort_order?: number;
  status?: string;
  remark?: string | null;
}

interface ComposeInput {
  base_prompt?: string;
  genre_package_id?: string;
  emotion_package_ids?: string[];
  camera_package_ids?: string[];
  output_package_id?: string;
  taboo_package_ids?: string[];
  variables?: Record<string, unknown>;
  extra_request?: string;
}

function validatePackagePayload(input: SavePackageInput) {
  if (!input.name?.trim() || !input.code?.trim() || !input.package_type?.trim()) {
    return error(400, "storyboard_prompt_package_required", "名称、编码和类型必填");
  }
  if (!/^[a-z0-9_]+$/.test(input.code.trim())) {
    return error(400, "invalid_storyboard_prompt_code", "编码只能包含小写字母、数字和下划线");
  }
  if (!["genre", "emotion", "camera", "output", "taboo"].includes(input.package_type)) {
    return error(400, "invalid_storyboard_prompt_type", "提示词包类型不支持");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "storyboard_prompt_content_required", "提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_storyboard_prompt_status", "状态不支持");
  }
  return null;
}

function packageParams(input: SavePackageInput & { id: string; now: Date }) {
  return [
    input.id,
    input.name.trim(),
    input.code.trim(),
    input.package_type,
    input.audience?.trim() || null,
    JSON.stringify(input.tags || []),
    input.cover_image_url?.trim() || null,
    input.prompt_content.trim(),
    JSON.stringify(input.key_points || []),
    input.negative_prompt?.trim() || null,
    JSON.stringify(input.applicable_genres || []),
    JSON.stringify(input.applicable_scene || []),
    input.output_type?.trim() || null,
    JSON.stringify(input.scope || {}),
    input.can_stack ?? true,
    input.max_select_count ?? null,
    Boolean(input.is_default),
    Boolean(input.is_global_default),
    Boolean(input.is_recommended),
    Number(input.sort_order || 0),
    input.status || "enabled",
    input.remark?.trim() || null,
    input.actorAdminAccountId,
    input.now,
  ];
}

function packageFromRow(row: StoryboardPromptPackageRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    package_type: row.package_type,
    audience: row.audience || "",
    tags: arrayFromJson(row.tags),
    cover_image_url: row.cover_image_url || "",
    coverImageUrl: row.cover_image_url || "",
    prompt_content: row.prompt_content,
    key_points: arrayFromJson(row.key_points),
    negative_prompt: row.negative_prompt || "",
    applicable_genres: arrayFromJson(row.applicable_genres),
    applicable_scene: arrayFromJson(row.applicable_scene),
    output_type: row.output_type || "",
    scope: row.scope || {},
    can_stack: Boolean(row.can_stack),
    max_select_count: row.max_select_count === null ? null : Number(row.max_select_count),
    is_default: Boolean(row.is_default),
    is_global_default: Boolean(row.is_global_default),
    is_recommended: Boolean(row.is_recommended),
    sort_order: Number(row.sort_order || 0),
    status: row.status,
    remark: row.remark || "",
    created_at: dateString(row.created_at),
    updated_at: dateString(row.updated_at),
  };
}

function templateFromRow(row: StoryboardPromptTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    base_prompt: row.base_prompt,
    genre_package_id: row.genre_package_id,
    emotion_package_ids: arrayFromJson(row.emotion_package_ids),
    camera_package_ids: arrayFromJson(row.camera_package_ids),
    output_package_id: row.output_package_id,
    taboo_package_ids: arrayFromJson(row.taboo_package_ids),
    is_default: Boolean(row.is_default),
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

const defaultStoryboardPromptPackages = [
  pkg("genre", "玄幻修仙", "xuanhuan_xiuxian", "按玄幻修仙风格改编。突出修炼升级、宗门压迫、强者威压、法器功法、战斗爆发和境界反转。画面要有古风、灵气、宏大场景和力量感。避免过度解释设定，优先用冲突和画面展示世界观。", 190, ["修炼", "宗门", "战斗"], ["修炼升级", "宗门压迫", "境界反转"], { audience: "male", is_default: true }),
  pkg("genre", "末日求生", "apocalypse_survival", "按末日求生紧张生存风格改编。突出资源短缺、环境危机、怪物威胁、人性试探和生存选择。画面偏废墟、阴冷、压迫、危险逼近。每组分镜都要有风险升级。", 185, ["废墟", "怪物", "生存"], ["资源短缺", "风险升级", "生存选择"]),
  pkg("genre", "重生逆袭", "rebirth_counterattack", "按重生逆袭爽剧风格改编。突出前世惨败、重生觉醒、提前布局、命运改写和打脸反击。重点表现主角的冷静、隐忍和掌控感。", 180, ["重生", "布局", "打脸"], ["重生觉醒", "提前布局", "命运改写"]),
  pkg("genre", "系统流", "system_growth", "按系统流爽文风格改编。突出系统提示、任务奖励、能力升级、数值变化和规则利用。系统信息需要可视化为弹窗、提示音、光效或数据面板，内容要短、准、能被观众一眼看懂。", 175, ["系统", "任务", "数值"], ["系统提示", "任务奖励", "规则利用"], { audience: "male" }),
  pkg("genre", "霸总甜宠", "ceo_sweet_romance", "按都市霸总甜宠风格改编。突出身份差、暧昧拉扯、吃醋、误会、保护欲和情绪升温。画面偏都市高级感、近景、眼神特写和柔光。避免油腻台词和角色降智。", 170, ["都市", "暧昧", "甜宠"], ["暧昧拉扯", "保护欲", "情绪升温"], { audience: "female" }),
  pkg("genre", "娱乐圈", "entertainment_industry", "按娱乐圈事业逆袭风格改编。突出咖位压制、舆论风波、舞台高光、镜头前后反差、黑红逆袭和事业线爽点。需要强化公众场景、媒体镜头和社交平台舆论变化。", 165, ["舆论", "舞台", "事业线"], ["舆论风波", "舞台高光", "黑红逆袭"]),
  pkg("genre", "快穿", "quick_transmigration", "按快穿任务世界风格改编。突出任务世界、身份切换、攻略目标、剧情节点修正和系统倒计时。每个世界需要有明确视觉差异，并让观众快速理解当前任务目标。", 160, ["任务世界", "身份切换", "系统"], ["身份切换", "任务目标", "系统倒计时"], { audience: "female" }),
  pkg("genre", "团宠", "group_pet_healing", "按团宠治愈爽感风格改编。突出主角被多人保护、身份揭露、误会解除、亲情/友情宠爱和集体撑腰的高光场面。情绪基调温暖，但关键反击要有爽点。", 155, ["亲情", "撑腰", "治愈"], ["身份揭露", "集体撑腰", "温暖治愈"], { audience: "female" }),
  pkg("genre", "逆袭", "counterattack", "按逆袭爽文风格改编。突出低谷受辱、隐忍蓄力、关键反击、众人震惊和地位翻转。节奏要直接，不拖延冲突，不弱化反击瞬间。", 150, ["受辱", "反击", "翻转"], ["低谷受辱", "关键反击", "地位翻转"]),
  pkg("genre", "先婚后爱", "marriage_first_love_later", "按先婚后爱情感拉扯风格改编。突出契约关系、同居摩擦、暧昧试探、误会吃醋和感情破冰。节奏从克制到升温，重点表现两人关系变化。", 145, ["契约", "同居", "拉扯"], ["契约关系", "同居摩擦", "感情破冰"], { audience: "female" }),
  pkg("genre", "悬疑探案", "suspense_detective", "按悬疑探案风格改编。突出线索、物证、嫌疑人、推理反转和真相逼近。镜头多用特写、暗光、遮挡和细节伏笔，不能过早揭底。", 125, ["线索", "推理", "真相"], ["线索伏笔", "嫌疑人试探", "推理反转"]),
  pkg("emotion", "男频热血", "male_hotblood", "节奏强、冲突硬、反击爽。主角少解释、多行动，突出压迫后的爆发、实力证明和众人震惊。", 100, [], [], { max_select_count: 3 }),
  pkg("emotion", "女频情感", "female_emotional", "突出关系拉扯、误会、情绪递进和细腻反应。多用眼神、停顿、沉默、微表情和情绪反差推动剧情。", 95, [], [], { max_select_count: 3 }),
  pkg("emotion", "高燃爽感", "high_burn_refreshing", "每组分镜都要推动冲突升级，强化羞辱、压迫、反击、震惊、揭露身份等爽点。小高潮要密集，结尾保留强钩子。", 80, [], [], { max_select_count: 3 }),
  pkg("emotion", "悬疑压迫", "suspense_pressure", "整体情绪紧张、克制、疑点重重。重点表现异常细节、人物试探、信息遮挡和真相逼近。", 75, [], [], { max_select_count: 3 }),
  pkg("camera", "短剧快节奏", "short_drama_fast", "开头 3-5 个镜头必须有强钩子。每个镜头控制在 3-5 秒，少空镜，少解释，快速进入冲突。每 10-15 个镜头出现一次小高潮，结尾保留悬念或反转。", 100, [], [], { applicable_scene: ["短剧", "AI视频"], is_recommended: true }),
  pkg("camera", "电影感分镜", "cinematic_storyboard", "使用景别、机位、运镜、光线和构图表现情绪。重要场面可使用推镜、慢动作、低机位、环绕、特写和背光，增强画面质感和戏剧张力。", 95, [], [], { applicable_scene: ["短剧", "漫剧", "AI视频"], is_recommended: true }),
  pkg("camera", "AI视频友好", "ai_video_friendly", "每个镜头只写一个主要动作。画面提示词必须包含人物、表情、动作、服装、场景、光线、镜头角度。避免多人复杂动作堆在一个镜头里，避免抽象描述。", 90, [], [], { applicable_scene: ["AI视频"], is_recommended: true }),
  pkg("output", "标准分镜表", "storyboard_table", "请按分镜表输出，每条包含：镜号、时长、场景、人物、景别、机位/运镜、画面内容、人物动作、台词/旁白、音效/音乐、AI画面提示词、负面提示词、转场方式。", 100, [], [], { output_type: "table", is_default: true }),
  pkg("output", "结构化 JSON", "storyboard_json", "请输出 JSON 数组，每个元素包含 shot_no、duration、scene、characters、shot_size、camera_move、visual_content、character_action、dialogue、voiceover、sound_effect、image_prompt、negative_prompt、transition。不得输出 JSON 以外的解释文字。", 90, [], [], { output_type: "json" }),
  pkg("taboo", "通用质量禁忌", "common_quality_taboo", "避免魔改原著核心设定；避免角色性格崩坏；避免大段解释性旁白；避免一个镜头塞入多个复杂动作；避免前后服装、场景、道具不一致；避免无意义空镜和重复对白。", 100, [], [], { is_global_default: true }),
  pkg("taboo", "角色一致性禁忌", "character_consistency_taboo", "避免角色姓名、身份、年龄、外貌、服装、性格前后不一致。每次角色首次出场都要保持和原文设定一致，后续镜头不得随意更换称呼、关系和视觉特征。", 90, [], [], { is_global_default: true }),
  pkg("taboo", "AI画面负向约束", "ai_image_negative_taboo", "避免多手指、畸形肢体、错乱五官、文字水印、低清晰度、过曝、人物融合、背景穿帮、服装突变和道具消失。画面提示词要具体、可视化、可生成。", 80, [], []),
];

const defaultStoryboardPromptTemplates = [
  template("玄幻热血短剧", "xuanhuan_hotblood_short", "xuanhuan_xiuxian", ["male_hotblood", "high_burn_refreshing"], ["short_drama_fast", "ai_video_friendly"], "storyboard_table", ["common_quality_taboo", "character_consistency_taboo", "ai_image_negative_taboo"], 100, true),
  template("都市情感拉扯", "romance_emotion_pull", "ceo_sweet_romance", ["female_emotional"], ["cinematic_storyboard", "ai_video_friendly"], "storyboard_table", ["common_quality_taboo", "character_consistency_taboo"], 90),
  template("悬疑漫画分镜", "suspense_comic_panels", "suspense_detective", ["suspense_pressure"], ["cinematic_storyboard"], "storyboard_json", ["common_quality_taboo", "character_consistency_taboo"], 80),
];

function pkg(packageType: string, name: string, code: string, promptContent: string, sortOrder: number, tags: string[], keyPoints: string[], extra: Record<string, unknown> = {}) {
  return {
    id: stableUuid(`storyboard-prompt-package:${code}`),
    name,
    code,
    package_type: packageType,
    prompt_content: promptContent,
    sort_order: sortOrder,
    tags,
    key_points: keyPoints,
    ...extra,
  };
}

function template(name: string, code: string, genreCode: string, emotionCodes: string[], cameraCodes: string[], outputCode: string, tabooCodes: string[], sortOrder: number, isDefault = false) {
  const idFor = (packageCode: string) => stableUuid(`storyboard-prompt-package:${packageCode}`);
  return {
    id: stableUuid(`storyboard-prompt-template:${code}`),
    name,
    code,
    genre_package_id: idFor(genreCode),
    emotion_package_ids: emotionCodes.map(idFor),
    camera_package_ids: cameraCodes.map(idFor),
    output_package_id: idFor(outputCode),
    taboo_package_ids: tabooCodes.map(idFor),
    sort_order: sortOrder,
    is_default: isDefault,
  };
}
