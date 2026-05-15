import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("shot schema assumptions", () => {
  it("adds shots table with revision and current-pointer safety fields", async () => {
    const sql = await readFile(
      new URL(
        "../../../../../../packages/db/migrations/0001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(sql, /CREATE TABLE shots \(/);
    assert.match(sql, /content_revision integer NOT NULL DEFAULT 1 CHECK \(content_revision >= 1\)/);
    assert.match(sql, /content_status text NOT NULL CHECK \(content_status IN \('draft', 'ready', 'stale'\)\)/);
    assert.match(sql, /image_status text NOT NULL CHECK \(image_status IN \('draft', 'ready', 'generating', 'completed', 'failed', 'stale'\)\)/);
    assert.match(sql, /current_image_asset_version_id uuid NULL/);
    assert.match(sql, /active_image_task_id uuid NULL/);
    assert.match(sql, /active_image_revision integer NULL CHECK \(active_image_revision >= 1\)/);
    assert.match(sql, /current_video_asset_version_id uuid NULL/);
    assert.match(sql, /active_video_task_id uuid NULL/);
    assert.match(sql, /active_video_image_asset_version_id uuid NULL/);
  });
});
