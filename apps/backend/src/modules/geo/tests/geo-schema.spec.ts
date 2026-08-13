import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadCurrentSchemaSql, loadSqlMigrations } from "../../shared/db/migrations.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";

const geoTables = [
  "geo_questions",
  "geo_evidence_items",
  "geo_content_items",
  "geo_content_versions",
  "geo_content_question_links",
  "geo_content_evidence_links",
  "geo_generation_runs",
  "geo_audit_events",
] as const;

describe("GEO operations schema", () => {
  it("registers the GEO migration and current schema tables", async () => {
    const [schemaSql, migrations] = await Promise.all([
      loadCurrentSchemaSql(),
      loadSqlMigrations(),
    ]);
    const migration = migrations.find((item) => item.name === "20260905-create-geo-operations.sql");

    assert.ok(migration);
    for (const table of geoTables) {
      assert.match(migration.sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
      assert.match(schemaSql, new RegExp(`CREATE TABLE IF NOT EXISTS [\" ]*${table}`));
    }
  });

  it("keeps project, team, subaccount, and legacy ownership out of GEO tables", async () => {
    const migrations = await loadSqlMigrations();
    const migration = migrations.find((item) => item.name === "20260905-create-geo-operations.sql");

    assert.ok(migration);
    assert.doesNotMatch(migration.sql, /\b(team_id|project_id|subaccount_id|legacy_owner)\b/i);
  });

  it("applies the complete schema and exposes every GEO table", async () => {
    const db = await createMigratedTestDb();
    try {
      const result = await db.query<{ table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = ANY($1::text[])
          ORDER BY table_name ASC`,
        [[...geoTables]],
      );

      assert.deepEqual(
        result.rows.map((row) => row.table_name),
        [...geoTables].sort(),
      );
    } finally {
      await db.close();
    }
  });
});
