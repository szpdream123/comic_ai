import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { PromptMarketplaceError } from "./prompt-marketplace.service.ts";

export const workflowPromptCategories = [
  "script",
  "shot",
  "scene_extract",
  "character_extract",
  "prop_extract",
  "image_style",
  "storyboard",
  "other",
] as const;

export type WorkflowPromptCategory = (typeof workflowPromptCategories)[number];

export function requireWorkflowPromptCategory(value: unknown): WorkflowPromptCategory {
  const category = String(value ?? "").trim();
  if (!workflowPromptCategories.includes(category as WorkflowPromptCategory)) {
    throw new PromptMarketplaceError(400, "prompt_default_category_invalid", "提示词分类不支持设置默认技能");
  }
  return category as WorkflowPromptCategory;
}

export async function ensureOfficialPromptDefault(db: SqlDatabase, categoryValue: unknown, now = new Date()) {
  const category = requireWorkflowPromptCategory(categoryValue);
  await db.query(
    `
      INSERT INTO prompt_official_defaults (prompt_category, prompt_id, created_at, updated_at)
      SELECT $1, prompt.id, $2, $2
      FROM prompts prompt
      WHERE prompt.prompt_category = $1
        AND prompt.is_official = true
        AND prompt.status = 'enabled'
        AND prompt.is_published = true
        AND prompt.deleted_at IS NULL
      ORDER BY prompt.updated_at DESC, prompt.id ASC
      LIMIT 1
      ON CONFLICT (prompt_category) DO NOTHING
    `,
    [category, now],
  );
}

export async function setOfficialPromptDefault(db: SqlDatabase, input: {
  category: unknown;
  promptId: string;
  now: Date;
}) {
  const category = requireWorkflowPromptCategory(input.category);
  const prompt = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM prompts
      WHERE id = $1
        AND prompt_category = $2
        AND is_official = true
        AND status = 'enabled'
        AND is_published = true
        AND deleted_at IS NULL
    `,
    [input.promptId, category],
  );
  if (!prompt) {
    throw new PromptMarketplaceError(400, "official_prompt_default_invalid", "只能将已启用并发布的官方提示词设为默认");
  }
  await db.query(
    `
      INSERT INTO prompt_official_defaults (prompt_category, prompt_id, created_at, updated_at)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (prompt_category)
      DO UPDATE SET prompt_id = EXCLUDED.prompt_id, updated_at = EXCLUDED.updated_at
    `,
    [category, prompt.id, input.now],
  );
  return { category, promptId: prompt.id, isDefault: true };
}

export async function assertPromptCanBeDeactivated(db: SqlDatabase, promptId: string) {
  const current = await queryOne<{ prompt_category: string }>(
    db,
    "SELECT prompt_category FROM prompt_official_defaults WHERE prompt_id = $1",
    [promptId],
  );
  if (current) {
    throw new PromptMarketplaceError(409, "official_prompt_default_required", "当前提示词是该分类默认技能，请先将其他提示词设为默认");
  }
}

export async function setUserPromptDefault(db: SqlDatabase, input: {
  userId: string;
  category: unknown;
  promptId: string;
  now: Date;
}) {
  const category = requireWorkflowPromptCategory(input.category);
  const prompt = await queryOne<{ id: string }>(
    db,
    `
      SELECT prompt.id
      FROM prompts prompt
      WHERE prompt.id = $1
        AND prompt.prompt_category = $2
        AND prompt.status = 'enabled'
        AND prompt.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM prompt_user_links link
          WHERE link.prompt_id = prompt.id
            AND link.user_id = $3
            AND link.status = 'active'
        )
    `,
    [input.promptId, category, input.userId],
  );
  if (!prompt) {
    throw new PromptMarketplaceError(400, "private_prompt_default_invalid", "只能将私人技能库中可用的提示词设为默认");
  }
  await db.query(
    `
      INSERT INTO prompt_user_defaults (user_id, prompt_category, prompt_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (user_id, prompt_category)
      DO UPDATE SET prompt_id = EXCLUDED.prompt_id, updated_at = EXCLUDED.updated_at
    `,
    [input.userId, category, prompt.id, input.now],
  );
  return { category, promptId: prompt.id, isDefault: true };
}

export async function clearUserPromptDefault(db: SqlDatabase, input: {
  userId: string;
  category: unknown;
}) {
  const category = requireWorkflowPromptCategory(input.category);
  await db.query(
    "DELETE FROM prompt_user_defaults WHERE user_id = $1 AND prompt_category = $2",
    [input.userId, category],
  );
  return { category, promptId: null, isDefault: false };
}
