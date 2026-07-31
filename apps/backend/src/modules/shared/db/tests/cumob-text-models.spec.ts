import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadCurrentSchemaSql, loadReferenceSeedSql, loadSqlMigrations } from "../migrations.ts";

describe("Cumob text model seed", () => {
  it("registers the three dedicated Cumob text models with the shared secret reference", async () => {
    const [schemaSql, seedSql, migrations] = await Promise.all([
      loadCurrentSchemaSql(),
      loadReferenceSeedSql(),
      loadSqlMigrations(),
    ]);
    const migration = migrations.find((item) => item.name === "20260820-add-cumob-text-models.sql");

    assert.ok(migration);
    for (const sql of [migration.sql, seedSql]) {
      assert.match(sql, /cumob-gpt-5-6-sol/);
      assert.match(sql, /cumob-deepseek-v4-pro/);
      assert.match(sql, /cumob-claude-opus-4-8/);
      assert.match(sql, /'cumob_chat'/);
      assert.match(sql, /'CUMOB_API_KEY'/);
      assert.match(sql, /'酷模智多星'/);
      assert.match(sql, /\/v1\/chat\/completions/);
    }
    assert.match(schemaSql, /'cumob_chat'::text/);
  });
});
