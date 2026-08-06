import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import {
  ensureToolboxPromptReverseConfigEntry,
} from "./admin-system-settings.service.ts";
import {
  defaultToolboxPromptReverseConfig,
  toolboxPromptReverseConfigKey,
} from "../toolbox/prompt-reverse-prompt-config.ts";

describe("toolbox prompt reverse runtime config initialization", () => {
  const databases: Array<{ close?: () => Promise<void> }> = [];

  after(async () => {
    for (const db of databases) await db.close?.();
  });

  it("persists the built-in image and video instructions when the row is missing", async () => {
    const db = await createMigratedTestDb();
    databases.push(db);

    const config = await ensureToolboxPromptReverseConfigEntry(db);
    const row = await db.query<{ value_json: unknown }>(
      "SELECT value_json FROM runtime_config_entries WHERE key = $1",
      [toolboxPromptReverseConfigKey],
    );

    assert.deepEqual(config, defaultToolboxPromptReverseConfig);
    assert.deepEqual(row.rows[0]?.value_json, defaultToolboxPromptReverseConfig);
  });

  it("preserves custom fields while filling missing instructions", async () => {
    const db = await createMigratedTestDb();
    databases.push(db);
    await db.query(
      `INSERT INTO runtime_config_entries (key, value_json, value_type, scope, description, updated_at)
       VALUES ($1, $2::jsonb, 'json', 'creator', 'test', NOW())`,
      [toolboxPromptReverseConfigKey, JSON.stringify({ imageInstruction: "自定义图片", videoInstruction: "" })],
    );

    const config = await ensureToolboxPromptReverseConfigEntry(db);
    assert.equal(config.imageInstruction, "自定义图片");
    assert.equal(config.videoInstruction, defaultToolboxPromptReverseConfig.videoInstruction);
    const row = await db.query<{ value_json: { imageInstruction: string; videoInstruction: string } }>(
      "SELECT value_json FROM runtime_config_entries WHERE key = $1",
      [toolboxPromptReverseConfigKey],
    );
    assert.equal(row.rows[0]?.value_json.imageInstruction, "自定义图片");
    assert.equal(row.rows[0]?.value_json.videoInstruction, defaultToolboxPromptReverseConfig.videoInstruction);
  });
});
