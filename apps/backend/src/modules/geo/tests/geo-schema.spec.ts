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
    const leaseMigration = migrations.find((item) => item.name === "20260906-add-geo-generation-leases.sql");

    assert.ok(migration);
    assert.ok(leaseMigration);
    assert.doesNotMatch(migration.sql, /heartbeat_at|lease_expires_at|lease_token/);
    assert.match(leaseMigration.sql, /ADD COLUMN IF NOT EXISTS heartbeat_at/i);
    assert.match(leaseMigration.sql, /ADD COLUMN IF NOT EXISTS lease_expires_at/i);
    assert.match(leaseMigration.sql, /ADD COLUMN IF NOT EXISTS lease_token/i);
    assert.match(leaseMigration.sql, /UPDATE geo_generation_runs[\s\S]*status\s*=\s*'running'/i);
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

  it("enforces GEO content topic and redirect constraints in the complete schema", async () => {
    const db = await createMigratedTestDb();
    const actorAdminAccountId = "33000000-0000-4000-8000-000000000001";
    try {
      await db.query(
        `INSERT INTO admin_accounts (id,login_name,password_hash,display_name,status)
         VALUES ($1,'geo_schema_admin','plain:test-password','GEO Schema Admin','active')`,
        [actorAdminAccountId],
      );
      await assert.rejects(
        db.query(
          `INSERT INTO geo_content_items (id,content_type,topic,slug,status,created_by_admin_id,updated_by_admin_id)
           VALUES ('33000000-0000-4000-8000-000000000002','guide','   ','blank-topic','draft',$1,$1)`,
          [actorAdminAccountId],
        ),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "23514"),
      );
      await db.query(
        `INSERT INTO geo_content_items (id,content_type,topic,slug,status,created_by_admin_id,updated_by_admin_id)
         VALUES ('33000000-0000-4000-8000-000000000003','guide','有效主题','valid-topic','draft',$1,$1)`,
        [actorAdminAccountId],
      );
      await assert.rejects(
        db.query("UPDATE geo_content_items SET redirect_path='https://attacker.example/redirect' WHERE id='33000000-0000-4000-8000-000000000003'"),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "23514"),
      );
    } finally {
      await db.close();
    }
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
