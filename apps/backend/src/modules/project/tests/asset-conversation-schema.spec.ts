import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("asset conversation schema", () => {
  it("declares thread and message tables for persisted asset conversations", () => {
    const sql = readFileSync(
      new URL("../../../../../../packages/db/migrations/0005_episode_asset_conversations.sql", import.meta.url),
      "utf8",
    );

    assert.match(sql, /CREATE TABLE IF NOT EXISTS episode_asset_conversation_threads/);
    assert.match(sql, /media_mode text NOT NULL CHECK \(media_mode IN \('image', 'video'\)\)/);
    assert.match(sql, /UNIQUE \(organization_id, project_id, episode_id, asset_id, media_mode\)/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS episode_asset_conversation_messages/);
    assert.match(sql, /message_type text NOT NULL CHECK \(message_type IN \('user_request', 'task_status', 'result'\)\)/);
    assert.match(sql, /message_key text NOT NULL/);
    assert.match(sql, /payload_json jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  });
});
