import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadCurrentSchemaSql } from "../../shared/db/migrations.ts";

describe("project schema assumptions", () => {
  it("keeps projects and scripts tables in the current schema", async () => {
    const sql = await loadCurrentSchemaSql();

    assert.match(sql, /CREATE TABLE IF NOT EXISTS "projects" \(/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "scripts" \(/);
    assert.match(sql, /projects_phase_check[^\n]+'script_input'[^\n]+'asset_review'[^\n]+'shot_generation'[^\n]+'export'/);
    assert.match(sql, /scripts_status_check[^\n]+'draft'[^\n]+'ready'[^\n]+'parsed'[^\n]+'failed'/);
  });
});
