import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadCurrentSchemaSql } from "../../shared/db/migrations.ts";

describe("asset schema assumptions", () => {
  it("keeps assets and asset_versions tables in the current schema", async () => {
    const sql = await loadCurrentSchemaSql();

    assert.match(sql, /CREATE TABLE IF NOT EXISTS "assets" \(/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "asset_review_candidates" \(/);
    assert.match(sql, /asset_review_candidates_candidate_group_check[^\n]+'character'[^\n]+'scene'[^\n]+'prop'/);
    assert.match(sql, /assets_asset_type_check[^\n]+'character_sheet'[^\n]+'scene_reference'[^\n]+'prop_reference'[^\n]+'shot_image'[^\n]+'shot_video'/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "asset_versions" \(/);
    assert.match(sql, /asset_versions_version_number_check[^\n]+version_number >= 1/);
    assert.match(sql, /asset_versions_asset_id_version_number_key[^\n]+UNIQUE \(asset_id, version_number\)/);
  });
});
