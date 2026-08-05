import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { assertPromptCanBeDeactivated, ensureOfficialPromptDefault } from "../prompt-marketplace/prompt-skill-default.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export const defaultStoryboardBasePrompt = "请将所选小说章节改编为可拍摄的短剧/漫剧分镜脚本。保留原著主线、人物关系、关键冲突和核心爽点，将大段心理描写转化为动作、对白、表情、旁白和镜头画面。每个分镜只表达一个清晰动作或情绪点，保证角色、场景、道具前后一致。";

const seedUpdatedAt = new Date("2026-06-06T08:00:00.000Z");

interface StoryboardPromptPackageRow {
  id: string;
  name: string;
  summary: string;
  cover_image_url: string | null;
  cover_storage_object_id: string | null;
  prompt_content?: string;
  status: string;
  price_credits: number;
  usage_count: number;
  is_published: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  is_default?: boolean;
}

const seededStoryboardPromptDatabases = new WeakSet<object>();

interface StoryboardPromptTemplateRow {
  id: string;
  name: string;
  summary: string;
  prompt_content: string;
  cover_image_url: string | null;
  cover_storage_object_id: string | null;
  status: string;
  price_credits: number;
  usage_count: number;
  is_published: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export function createAdminStoryboardPromptService(deps: { db: SqlDatabase }) {
  async function listPackages(input: {
    packageType?: string | null;
    keyword?: string | null;
    status?: string | null;
    pageSize?: number;
    includeContent?: boolean;
  } = {}) {
    await ensureStoryboardPromptDataOnce(deps.db);
    const pageSize = clamp(Number(input.pageSize || 100), 1, 500);
    const keyword = input.keyword?.trim() ? `%${input.keyword.trim().toLowerCase()}%` : null;
    const includeContent = input.includeContent !== false;
    const rows = await deps.db.query<StoryboardPromptPackageRow>(
      `
        SELECT ${includeContent
          ? "prompts.*"
          : "prompts.id, prompts.name, prompts.summary, prompts.cover_image_url, prompts.cover_storage_object_id, prompts.status, prompts.price_credits, prompts.usage_count, prompts.is_published, prompts.created_at, prompts.updated_at"}, EXISTS (
          SELECT 1 FROM prompt_official_defaults prompt_default
          WHERE prompt_default.prompt_category = 'script' AND prompt_default.prompt_id = prompts.id
        ) AS is_default
        FROM prompts
        WHERE prompt_category = 'script' AND deleted_at IS NULL
          AND ($1::text IS NULL OR status = $1)
          AND (
            $2::text IS NULL
            OR lower(name) LIKE $2
            ${includeContent ? "OR lower(prompt_content) LIKE $2" : ""}
            OR lower(summary) LIKE $2
          )
        ORDER BY updated_at DESC, id ASC
        LIMIT $3
      `,
      [input.status || null, keyword, pageSize],
    );
    return { data: rows.rows.map(packageFromRow) };
  }

  async function listTemplates(input: { pageSize?: number } = {}) {
    await ensureDefaultStoryboardPromptData(deps.db);
    const rows = await deps.db.query<StoryboardPromptTemplateRow>(
      `
        SELECT *
        FROM prompts
        WHERE prompt_category = 'storyboard' AND deleted_at IS NULL
        ORDER BY updated_at DESC, id ASC
        LIMIT $1
      `,
      [clamp(Number(input.pageSize || 100), 1, 500)],
    );
    return { data: rows.rows.map(templateFromRow) };
  }

  async function savePackage(input: SavePackageInput) {
    const existing = input.id
      ? await queryOne<StoryboardPromptPackageRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'script' AND deleted_at IS NULL", [input.id])
      : undefined;
    const validation = validatePackagePayload(input);
    if (validation) return validation;
    const now = input.now;
    const id = input.id || randomUUID();
    const status = input.status || "enabled";
    const priceCredits = input.price_credits ?? existing?.price_credits ?? 0;
    const isPublished = status === "disabled" ? false : input.is_published ?? existing?.is_published ?? false;
    if (existing && (status === "disabled" || !isPublished)) await assertPromptCanBeDeactivated(deps.db, existing.id);
    await deps.db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, cover_image_url, prompt_content,
          status, is_official, price_credits, is_published, published_at,
          created_by_admin_id, updated_by_admin_id,
          created_at, updated_at
        )
        VALUES (
          $1, 'script', $2, $3, $4, $5, $6, true, $7, $8, CASE WHEN $8 THEN $10::timestamptz ELSE NULL END,
          $9, $9, $10, $10
        )
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
        now,
      ],
    );
    if (input.usage_count !== undefined) {
      await deps.db.query("UPDATE prompts SET usage_count = $2 WHERE id = $1", [id, input.usage_count]);
    }
    await audit(input, existing ? "admin.storyboard_prompt.package.updated" : "admin.storyboard_prompt.package.created", "storyboard_prompt_package", id);
    return packageResponse(id);
  }

  async function copyPackage(input: AdminMutationInput & { id: string }) {
    const existing = await queryOne<StoryboardPromptPackageRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'script' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "storyboard_prompt_package_not_found", "提示词包不存在");
    return savePackage({
      ...packageFromRow(existing),
      id: undefined,
      name: `${existing.name} 副本`,
      actorAdminAccountId: input.actorAdminAccountId,
      reason: input.reason || "copy storyboard prompt package",
      now: input.now,
    });
  }

  async function changePackageStatus(input: AdminMutationInput & { id: string; status: string }) {
    if (!["enabled", "disabled"].includes(input.status)) return error(400, "invalid_storyboard_prompt_status", "状态不支持");
    const existing = await queryOne<StoryboardPromptPackageRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'script' AND deleted_at IS NULL", [input.id]);
    if (!existing) return error(404, "storyboard_prompt_package_not_found", "提示词包不存在");
    if (input.status === "disabled") await assertPromptCanBeDeactivated(deps.db, input.id);
    await deps.db.query(
      "UPDATE prompts SET status = $2, is_published = CASE WHEN $2 = 'disabled' THEN false ELSE is_published END, published_at = CASE WHEN $2 = 'disabled' THEN NULL ELSE published_at END, updated_by_admin_id = $3, updated_at = $4 WHERE id = $1 AND prompt_category = 'script'",
      [input.id, input.status, input.actorAdminAccountId, input.now],
    );
    await audit(input, "admin.storyboard_prompt.package.status_changed", "storyboard_prompt_package", input.id, { status: input.status });
    return packageResponse(input.id);
  }

  async function saveTemplate(input: SaveTemplateInput) {
    await ensureDefaultStoryboardPromptData(deps.db);
    if (!input.name.trim()) return error(400, "storyboard_prompt_template_required", "模板名称必填");
    if (input.status && !["enabled", "disabled"].includes(input.status)) {
      return error(400, "invalid_storyboard_prompt_status", "状态不支持");
    }
    if (input.price_credits !== undefined && (!Number.isInteger(input.price_credits) || input.price_credits < 0 || input.price_credits > 99_999)) {
      return error(400, "invalid_storyboard_prompt_price", "积分价格必须是 0 到 99999 的整数");
    }
    if (input.usage_count !== undefined && (!Number.isInteger(input.usage_count) || input.usage_count < 0 || input.usage_count > 2_147_483_647)) {
      return error(400, "invalid_storyboard_prompt_usage_count", "使用次数必须是非负整数");
    }
    const id = input.id || randomUUID();
    const existing = input.id
      ? await queryOne<StoryboardPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'storyboard' AND deleted_at IS NULL", [input.id])
      : undefined;
    const status = input.status || "enabled";
    const priceCredits = input.price_credits ?? existing?.price_credits ?? 0;
    const isPublished = status === "disabled" ? false : input.is_published ?? existing?.is_published ?? false;
    await deps.db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, cover_image_url, prompt_content, status,
          is_official, price_credits, is_published, published_at,
          created_by_admin_id, updated_by_admin_id,
          created_at, updated_at
        )
        VALUES ($1, 'storyboard', $2, $3, $4, $5, $6, true, $7, $8, CASE WHEN $8 THEN $10::timestamptz ELSE NULL END, $9, $9, $10, $10)
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
        input.base_prompt?.trim() || defaultStoryboardBasePrompt,
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
    await audit(input, "admin.storyboard_prompt.template.saved", "storyboard_prompt_template", id);
    const row = await queryOne<StoryboardPromptTemplateRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'storyboard'", [id]);
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
          "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'script' AND deleted_at IS NULL",
          [id],
        );
        if (row) sections.push({ type, title: `${titlePrefix}：${row.name}`, content: row.prompt_content });
      }
    };
    await append("genre", input.genre_package_id, "题材包");
    await append("emotion", input.emotion_package_ids, "情绪包");
    await append("taboo", input.taboo_package_ids, "通用禁忌包");
    const extraRequest = input.extra_request;
    if (extraRequest) sections.push({ type: "extra", title: "用户额外要求", content: String(extraRequest) });
    return sections;
  }

  async function packageResponse(id: string) {
    const row = await queryOne<StoryboardPromptPackageRow>(deps.db, "SELECT * FROM prompts WHERE id = $1 AND prompt_category = 'script'", [id]);
    return { status: 200, body: { data: row ? packageFromRow(row) : { id } } };
  }

  async function audit(input: AdminMutationInput, eventType: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType,
      targetType,
      targetId,
      reason: input.reason || eventType,
      sensitive: false,
      metadata,
    });
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
  for (const item of defaultStoryboardPromptPackages) {
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, cover_image_url, prompt_content,
          status, is_official, is_published, published_at, created_at, updated_at
        )
        VALUES ($1, 'script', $2, $3, $4, $5, 'enabled', true, true, $6, $6, $6)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        item.id,
        item.name,
        item.remark || "",
        item.cover_image_url || null,
        item.prompt_content,
        seedUpdatedAt,
      ],
    );
  }
  for (const template of defaultStoryboardPromptTemplates) {
    await db.query(
      `
        INSERT INTO prompts (
          id, prompt_category, name, summary, prompt_content, status,
          is_official, is_published, published_at, created_at, updated_at
        )
        VALUES ($1, 'storyboard', $2, $3, $4, 'enabled', true, true, $5, $5, $5)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        template.id,
        template.name,
        template.summary,
        defaultStoryboardBasePrompt,
        seedUpdatedAt,
      ],
    );
  }
  await ensureOfficialPromptDefault(db, "script", seedUpdatedAt);
  await ensureOfficialPromptDefault(db, "storyboard", seedUpdatedAt);
}

async function ensureStoryboardPromptDataOnce(db: SqlDatabase) {
  if (seededStoryboardPromptDatabases.has(db as object)) {
    return;
  }
  await ensureDefaultStoryboardPromptData(db);
  seededStoryboardPromptDatabases.add(db as object);
}

interface AdminMutationInput {
  actorAdminAccountId: string;
  reason?: string;
  now: Date;
}

interface SavePackageInput extends AdminMutationInput {
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

interface SaveTemplateInput extends AdminMutationInput {
  id?: string;
  name: string;
  base_prompt?: string;
  cover_image_url?: string | null;
  status?: string;
  price_credits?: number;
  usage_count?: number;
  is_published?: boolean;
  remark?: string | null;
}

interface ComposeInput {
  base_prompt?: string;
  genre_package_id?: string;
  emotion_package_ids?: string[];
  camera_package_ids?: string[];
  output_package_id?: string;
  taboo_package_ids?: string[];
  extra_request?: string;
}

function validatePackagePayload(input: SavePackageInput) {
  if (!input.name?.trim()) {
    return error(400, "storyboard_prompt_package_required", "名称必填");
  }
  if (!input.prompt_content?.trim() || input.prompt_content.trim().length < 20) {
    return error(400, "storyboard_prompt_content_required", "提示词正文不得为空，建议不少于 20 字");
  }
  if (input.status && !["enabled", "disabled"].includes(input.status)) {
    return error(400, "invalid_storyboard_prompt_status", "状态不支持");
  }
  if (input.price_credits !== undefined && (!Number.isInteger(input.price_credits) || input.price_credits < 0 || input.price_credits > 99_999)) {
    return error(400, "invalid_storyboard_prompt_price", "积分价格必须是 0 到 99999 的整数");
  }
  if (input.usage_count !== undefined && (!Number.isInteger(input.usage_count) || input.usage_count < 0 || input.usage_count > 2_147_483_647)) {
    return error(400, "invalid_storyboard_prompt_usage_count", "使用次数必须是非负整数");
  }
  return null;
}

function packageFromRow(row: StoryboardPromptPackageRow) {
  return {
    id: row.id,
    name: row.name,
    prompt_category: "script",
    category: "script",
    summary: row.summary || "",
    cover_image_url: row.cover_image_url || "",
    coverImageUrl: row.cover_image_url || "",
    cover_storage_object_id: row.cover_storage_object_id,
    coverStorageObjectId: row.cover_storage_object_id,
    ...(row.prompt_content === undefined ? {} : { prompt_content: row.prompt_content }),
    status: row.status,
    price_credits: row.price_credits,
    priceCredits: row.price_credits,
    usage_count: row.usage_count,
    usageCount: row.usage_count,
    is_published: row.is_published,
    isPublished: row.is_published,
    isDefault: Boolean(row.is_default),
    remark: (row as StoryboardPromptPackageRow & { summary?: string }).summary || "",
    created_at: dateString(row.created_at),
    updated_at: dateString(row.updated_at),
  };
}

function templateFromRow(row: StoryboardPromptTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    prompt_category: "storyboard",
    category: "storyboard",
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

const defaultStoryboardPromptPackages = [
  pkg("genre", "玄幻修仙", "xuanhuan_xiuxian", "按玄幻修仙风格改编。突出修炼升级、宗门压迫、强者威压、法器功法、战斗爆发和境界反转。画面要有古风、灵气、宏大场景和力量感。避免过度解释设定，优先用冲突和画面展示世界观。", 190, ["修炼", "宗门", "战斗"], ["修炼升级", "宗门压迫", "境界反转"]),
  pkg("genre", "末日求生", "apocalypse_survival", "按末日求生紧张生存风格改编。突出资源短缺、环境危机、怪物威胁、人性试探和生存选择。画面偏废墟、阴冷、压迫、危险逼近。每组分镜都要有风险升级。", 185, ["废墟", "怪物", "生存"], ["资源短缺", "风险升级", "生存选择"]),
  pkg("genre", "重生逆袭", "rebirth_counterattack", "按重生逆袭爽剧风格改编。突出前世惨败、重生觉醒、提前布局、命运改写和打脸反击。重点表现主角的冷静、隐忍和掌控感。", 180, ["重生", "布局", "打脸"], ["重生觉醒", "提前布局", "命运改写"]),
  pkg("genre", "系统流", "system_growth", "按系统流爽文风格改编。突出系统提示、任务奖励、能力升级、数值变化和规则利用。系统信息需要可视化为弹窗、提示音、光效或数据面板，内容要短、准、能被观众一眼看懂。", 175, ["系统", "任务", "数值"], ["系统提示", "任务奖励", "规则利用"]),
  pkg("genre", "霸总甜宠", "ceo_sweet_romance", "按都市霸总甜宠风格改编。突出身份差、暧昧拉扯、吃醋、误会、保护欲和情绪升温。画面偏都市高级感、近景、眼神特写和柔光。避免油腻台词和角色降智。", 170, ["都市", "暧昧", "甜宠"], ["暧昧拉扯", "保护欲", "情绪升温"]),
  pkg("genre", "娱乐圈", "entertainment_industry", "按娱乐圈事业逆袭风格改编。突出咖位压制、舆论风波、舞台高光、镜头前后反差、黑红逆袭和事业线爽点。需要强化公众场景、媒体镜头和社交平台舆论变化。", 165, ["舆论", "舞台", "事业线"], ["舆论风波", "舞台高光", "黑红逆袭"]),
  pkg("genre", "快穿", "quick_transmigration", "按快穿任务世界风格改编。突出任务世界、身份切换、攻略目标、剧情节点修正和系统倒计时。每个世界需要有明确视觉差异，并让观众快速理解当前任务目标。", 160, ["任务世界", "身份切换", "系统"], ["身份切换", "任务目标", "系统倒计时"]),
  pkg("genre", "团宠", "group_pet_healing", "按团宠治愈爽感风格改编。突出主角被多人保护、身份揭露、误会解除、亲情/友情宠爱和集体撑腰的高光场面。情绪基调温暖，但关键反击要有爽点。", 155, ["亲情", "撑腰", "治愈"], ["身份揭露", "集体撑腰", "温暖治愈"]),
  pkg("genre", "逆袭", "counterattack", "按逆袭爽文风格改编。突出低谷受辱、隐忍蓄力、关键反击、众人震惊和地位翻转。节奏要直接，不拖延冲突，不弱化反击瞬间。", 150, ["受辱", "反击", "翻转"], ["低谷受辱", "关键反击", "地位翻转"]),
  pkg("genre", "先婚后爱", "marriage_first_love_later", "按先婚后爱情感拉扯。突出契约关系、同居摩擦、暧昧试探、误会吃醋和感情破冰。节奏从克制到升温，重点表现两人关系变化。", 145, ["契约", "同居", "拉扯"], ["契约关系", "同居摩擦", "感情破冰"]),
  pkg("genre", "悬疑探案", "suspense_detective", "按悬疑探案风格改编。突出线索、物证、嫌疑人、推理反转和真相逼近。镜头多用特写、暗光、遮挡和细节伏笔，不能过早揭底。", 125, ["线索", "推理", "真相"], ["线索伏笔", "嫌疑人试探", "推理反转"]),
  pkg("emotion", "男频热血", "male_hotblood", "节奏强、冲突硬、反击爽。主角少解释、多行动，突出压迫后的爆发、实力证明和众人震惊。"),
  pkg("emotion", "女频情感", "female_emotional", "突出关系拉扯、误会、情绪递进和细腻反应。多用眼神、停顿、沉默、微表情和情绪反差推动剧情。"),
  pkg("emotion", "高燃爽感", "high_burn_refreshing", "每组分镜都要推动冲突升级，强化羞辱、压迫、反击、震惊、揭露身份等爽点。小高潮要密集，结尾保留强钩子。"),
  pkg("emotion", "悬疑压迫", "suspense_pressure", "整体情绪紧张、克制、疑点重重。重点表现异常细节、人物试探、信息遮挡和真相逼近。"),
  pkg("taboo", "通用质量禁忌", "common_quality_taboo", "避免魔改原著核心设定；避免角色性格崩坏；避免大段解释性旁白；避免一个镜头塞入多个复杂动作；避免前后服装、场景、道具不一致；避免无意义空镜和重复对白。"),
  pkg("taboo", "角色一致性禁忌", "character_consistency_taboo", "避免角色姓名、身份、年龄、外貌、服装、性格前后不一致。每次角色首次出场都要保持和原文设定一致，后续镜头不得随意更换称呼、关系和视觉特征。"),
  pkg("taboo", "AI画面负向约束", "ai_image_negative_taboo", "避免多手指、畸形肢体、错乱五官、文字水印、低清晰度、过曝、人物融合、背景穿帮、服装突变和道具消失。画面提示词要具体、可视化、可生成。", 80, [], []),
];

const defaultStoryboardPromptTemplates = [
  template("??????", "xuanhuan_hotblood_short", "xuanhuan_xiuxian", ["male_hotblood", "high_burn_refreshing"], ["common_quality_taboo", "character_consistency_taboo", "ai_image_negative_taboo"], 100, true),
  template("??????", "romance_emotion_pull", "ceo_sweet_romance", ["female_emotional"], ["common_quality_taboo", "character_consistency_taboo"], 90),
  template("??????", "suspense_comic_panels", "suspense_detective", ["suspense_pressure"], ["common_quality_taboo", "character_consistency_taboo"], 80),
];

function pkg(_legacyType: string, name: string, _legacyIdentifier: string, promptContent: string, ..._legacyMetadata: unknown[]) {
  return {
    id: stableUuid(`storyboard-prompt-package:${name}`),
    name,
    prompt_content: promptContent,
    remark: scriptPromptSummary(name),
  };
}

function template(name: string, legacyIdentifier: string, ..._legacyMetadata: unknown[]) {
  return {
    id: stableUuid(`storyboard-prompt-template:${name}`),
    name,
    summary: storyboardTemplateSummary(legacyIdentifier, name),
  };
}

function scriptPromptSummary(name: string) {
  if (name.includes("负向约束")) return "汇总画面生成中的负向限制，减少文字水印、结构畸变、主体缺失与低质量画面。";
  if (name.includes("一致性禁忌")) return "约束角色身份、外貌、服装与关系连续性，避免跨场景设定漂移。";
  if (name.includes("质量禁忌")) return "统一过滤剧情和画面中的常见质量问题，提升后续分镜与生成结果的稳定性。";
  return `围绕「${name}」题材设计冲突、情绪钩子与剧情节奏，辅助将小说改编为短剧剧本。`;
}

function storyboardTemplateSummary(legacyIdentifier: string, name: string) {
  const summaries: Record<string, string> = {
    xuanhuan_hotblood_short: "将玄幻修仙剧情编排为节奏紧凑、战斗递进、高潮明确的连续故事板。",
    romance_emotion_pull: "将情感剧情编排为突出眼神、动作、关系拉扯与情绪递进的连续故事板。",
    suspense_comic_panels: "将悬疑剧情编排为线索清晰、信息克制、压迫感递进的漫画故事板。",
  };
  return summaries[legacyIdentifier] || `用于「${name}」故事板生成，组织连续画面、角色动作、台词与场景衔接。`;
}
