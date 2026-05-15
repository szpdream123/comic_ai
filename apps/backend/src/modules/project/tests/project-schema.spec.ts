import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("project schema assumptions", () => {
  it("adds projects and scripts tables to the foundation migration", async () => {
    const sql = await readFile(
      new URL(
        "../../../../../../packages/db/migrations/0001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(sql, /CREATE TABLE projects \(/);
    assert.match(sql, /CREATE TABLE scripts \(/);
    assert.match(sql, /phase text NOT NULL CHECK \(phase IN \('script_input', 'asset_review', 'shot_generation', 'export'\)\)/);
    assert.match(sql, /status text NOT NULL CHECK \(status IN \('draft', 'ready', 'parsed', 'failed'\)\)/);
  });
});
