import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("episode workbench hardening migration", () => {
  it("adds explicit storyboard draft fields, draft table, and episode export binding", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "packages/db/migrations/0004_episode_workbench_hardening.sql"),
      "utf8",
    );

    assert.match(sql, /ADD COLUMN IF NOT EXISTS scene_analysis text NOT NULL DEFAULT ''/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS plot_preview text NOT NULL DEFAULT ''/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS prompt_draft text NOT NULL DEFAULT ''/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS episode_generation_drafts/);
    assert.match(sql, /UNIQUE \(organization_id, episode_id, target_type, target_id\)/);
    assert.match(sql, /ALTER TABLE export_records\s+ADD COLUMN IF NOT EXISTS episode_id uuid NULL;/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS shots_episode_sort_idx/);
  });
});
