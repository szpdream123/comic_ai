import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadCurrentSchemaSql } from "../../shared/db/migrations.ts";

describe("calibration schema assumptions", () => {
  it("keeps calibration sessions and items in the current schema", async () => {
    const sql = await loadCurrentSchemaSql();

    assert.match(sql, /CREATE TABLE IF NOT EXISTS "calibration_sessions" \(/);
    assert.match(sql, /calibration_sessions_status_check[^\n]+'draft'[^\n]+'generating'[^\n]+'ready_for_review'[^\n]+'passed'[^\n]+'failed'[^\n]+'skipped'[^\n]+'archived'/);
    assert.match(sql, /calibration_sessions_decision_type_check[^\n]+'passed'[^\n]+'skipped'[^\n]+'override'/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "calibration_items" \(/);
    assert.match(sql, /calibration_items_status_check[^\n]+'pending'[^\n]+'generating'[^\n]+'succeeded'[^\n]+'failed'[^\n]+'review_required'/);
    assert.match(sql, /calibration_items_quality_review_result_check[^\n]+'not_checked'[^\n]+'passed'[^\n]+'failed'[^\n]+'review_required'/);
    assert.match(sql, /calibration_items_calibration_session_id_shot_id_key[^\n]+UNIQUE \(calibration_session_id, shot_id\)/);
  });
});
