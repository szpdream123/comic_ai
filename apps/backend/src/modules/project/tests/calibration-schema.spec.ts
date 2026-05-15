import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("calibration schema assumptions", () => {
  it("adds calibration sessions and items to the foundation migration", async () => {
    const sql = await readFile(
      new URL(
        "../../../../../../packages/db/migrations/0001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(sql, /CREATE TABLE calibration_sessions \(/);
    assert.match(sql, /status text NOT NULL CHECK \(status IN \('draft', 'generating', 'ready_for_review', 'passed', 'failed', 'skipped', 'archived'\)\)/);
    assert.match(sql, /decision_type text NULL CHECK \(decision_type IN \('passed', 'skipped', 'override'\)\)/);
    assert.match(sql, /CREATE TABLE calibration_items \(/);
    assert.match(sql, /status text NOT NULL CHECK \(status IN \('pending', 'generating', 'succeeded', 'failed', 'review_required'\)\)/);
    assert.match(sql, /quality_review_result text NOT NULL CHECK \(quality_review_result IN \('not_checked', 'passed', 'failed', 'review_required'\)\)/);
    assert.match(sql, /UNIQUE \(calibration_session_id, shot_id\)/);
  });
});
