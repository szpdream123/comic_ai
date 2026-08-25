import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { loadCurrentSchemaSql, loadSqlMigrations } from "../../shared/db/migrations.ts";
import { createEmptyTestDb, createMigratedTestDb } from "../../shared/db/test-db.ts";

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

const geoMonitoringTables = [
  "geo_monitor_runs",
  "geo_monitor_results",
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

  it("registers and applies the GEO monitoring migration", async () => {
    const migrations = await loadSqlMigrations();
    const migration = migrations.find((item) => item.name === "20261020-create-geo-monitoring.sql");
    const hardening = migrations.find((item) => item.name === "20261021-harden-geo-monitoring.sql");
    const runFence = migrations.find((item) => item.name === "20261022-fence-geo-monitor-runs.sql");

    assert.ok(migration);
    assert.ok(hardening);
    assert.ok(runFence);
    assert.match(migration.sql, /CHECK \(source_type IN \('official_api', 'manual_import'\)\)/i);
    assert.match(migration.sql, /UNIQUE \(run_id, question_id\)/i);
    assert.match(migration.sql, /geo_monitor_results_raw_evidence_immutable/i);
    assert.match(hardening.sql, /content_version_id/i);
    assert.match(hardening.sql, /BEFORE UPDATE OR DELETE/i);
    assert.doesNotMatch(hardening.sql, /CREATE UNIQUE INDEX[^;]*geo_monitor_runs_one_running_platform_idx/i);
    assert.match(runFence.sql, /geo_monitor_runs_one_running_platform_idx/i);
    assert.match(runFence.sql, /geo_monitor_runs_audit_immutable/i);
    assert.match(runFence.sql, /row_number\(\)[\s\S]*geo_monitor_duplicate_running_reconciled/i);
    assert.match(runFence.sql, /BEFORE INSERT OR UPDATE OR DELETE ON geo_monitor_results/i);
    assert.match(runFence.sql, /NEW\.id IS DISTINCT FROM OLD\.id/i);
    assert.match(runFence.sql, /NEW\.created_at IS DISTINCT FROM OLD\.created_at/i);
    const productionRunner = await readFile("scripts/migrate-user-scope.mjs", "utf8");
    assert.match(productionRunner, /20261020-create-geo-monitoring\.sql/);
    assert.match(
      productionRunner,
      /runtimeSafeMigrationNames[\s\S]*20261020-create-geo-monitoring\.sql/,
    );
    assert.match(
      productionRunner,
      /runtimeSafeMigrationNames[\s\S]*20261021-harden-geo-monitoring\.sql/,
    );
    assert.match(
      productionRunner,
      /runtimeSafeMigrationNames[\s\S]*20261022-fence-geo-monitor-runs\.sql/,
    );

    const db = await createMigratedTestDb();
    try {
      const result = await db.query<{ table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = ANY($1::text[])
          ORDER BY table_name ASC`,
        [[...geoMonitoringTables]],
      );
      assert.deepEqual(result.rows.map((row) => row.table_name), [...geoMonitoringTables].sort());
    } finally {
      await db.close();
    }
  });

  it("reconciles duplicate running rows before creating the official-run fence", async () => {
    const migrations = await loadSqlMigrations();
    const hardening = migrations.find((item) => item.name === "20261021-harden-geo-monitoring.sql");
    const runFence = migrations.find((item) => item.name === "20261022-fence-geo-monitor-runs.sql");
    assert.ok(hardening);
    assert.ok(runFence);
    assert.ok(runFence.sql.indexOf("geo_monitor_duplicate_running_reconciled")
      < runFence.sql.indexOf("CREATE UNIQUE INDEX geo_monitor_runs_one_running_platform_idx"));

    const db = await createEmptyTestDb();
    try {
      for (const migration of migrations) {
        await db.query(migration.sql);
        if (migration.name === "20261020-create-geo-monitoring.sql") break;
      }
      const actorId = "34500000-0000-4000-8000-000000000001";
      const questionId = "34500000-0000-4000-8000-000000000002";
      const contentId = "34500000-0000-4000-8000-000000000003";
      const versionId = "34500000-0000-4000-8000-000000000004";
      await db.query(
        `INSERT INTO admin_accounts (id,login_name,password_hash,display_name,status)
         VALUES ($1,'geo_monitor_fence_admin','plain:test-password','GEO Monitor Fence Admin','active')`,
        [actorId],
      );
      await db.query(
        `INSERT INTO geo_questions (id,raw_question,normalized_question,topic,intent,created_by_admin_id,created_at,updated_at)
         VALUES ($1,'重复任务问题','重复任务问题','AI分镜','tutorial',$2,NOW(),NOW())`,
        [questionId, actorId],
      );
      await db.query(
        `INSERT INTO geo_content_items (id,content_type,topic,slug,status,created_by_admin_id,updated_by_admin_id)
         VALUES ($1,'guide','AI分镜','duplicate-run-guide','draft',$2,$2)`,
        [contentId, actorId],
      );
      await db.query(
        `INSERT INTO geo_content_versions (id,content_item_id,version_number,title,summary,document_json,config_revision_id,created_by_admin_id,published_at)
         VALUES ($1,$2,1,'重复任务指南','摘要','{}'::jsonb,'geo-default-v1',$3,NOW())`,
        [versionId, contentId, actorId],
      );
      await db.query(
        "UPDATE geo_content_items SET status='published',current_published_version_id=$2 WHERE id=$1",
        [contentId, versionId],
      );
      await db.query(
        "INSERT INTO geo_content_question_links (content_version_id,question_id) VALUES ($1,$2)",
        [versionId, questionId],
      );
      await db.query(
        `INSERT INTO geo_monitor_runs (
           id,content_item_id,platform_id,source_type,status,model_code,created_by_admin_id,started_at,created_at,updated_at
         ) VALUES
           ('34500000-0000-4000-8000-000000000005',$1,'deepseek','official_api','running','deepseek-chat',$2,NOW() - interval '2 minutes',NOW() - interval '2 minutes',NOW() - interval '2 minutes'),
           ('34500000-0000-4000-8000-000000000006',$1,'deepseek','official_api','running','deepseek-chat',$2,NOW() - interval '1 minute',NOW() - interval '1 minute',NOW() - interval '1 minute')`,
        [contentId, actorId],
      );

      await db.query(hardening.sql);
      await db.query(runFence.sql);

      const runs = await db.query<{ status: string; error_code: string | null }>(
        "SELECT status,error_code FROM geo_monitor_runs ORDER BY started_at",
      );
      assert.deepEqual(runs.rows, [
        { status: "running", error_code: null },
        { status: "failed", error_code: "geo_monitor_duplicate_running_reconciled" },
      ]);
      const indexes = await db.query<{ indexdef: string }>(
        "SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND indexname='geo_monitor_runs_one_running_platform_idx'",
      );
      assert.equal(indexes.rows.length, 1);
      assert.match(indexes.rows[0]!.indexdef, /source_type = 'official_api'/i);
    } finally {
      await db.close();
    }
  });

  it("keeps raw GEO monitoring evidence immutable while allowing analysis updates", async () => {
    const db = await createMigratedTestDb();
    const adminId = "34000000-0000-4000-8000-000000000001";
    const questionId = "34000000-0000-4000-8000-000000000002";
    const contentId = "34000000-0000-4000-8000-000000000003";
    const runId = "34000000-0000-4000-8000-000000000004";
    const resultId = "34000000-0000-4000-8000-000000000005";
    const versionId = "34000000-0000-4000-8000-000000000006";
    const secondQuestionId = "34000000-0000-4000-8000-000000000007";
    const otherContentId = "34000000-0000-4000-8000-000000000008";
    const otherVersionId = "34000000-0000-4000-8000-000000000009";
    try {
      await db.query(
        `INSERT INTO admin_accounts (id,login_name,password_hash,display_name,status)
         VALUES ($1,'geo_monitor_schema_admin','plain:test-password','GEO Monitor Schema Admin','active')`,
        [adminId],
      );
      await db.query(
        `INSERT INTO geo_questions (id,raw_question,normalized_question,topic,intent,created_by_admin_id,created_at,updated_at)
         VALUES ($1,'AI分镜工具有哪些？','AI分镜工具有哪些','AI分镜','comparison',$2,NOW(),NOW())`,
        [questionId, adminId],
      );
      await db.query(
        `INSERT INTO geo_questions (id,raw_question,normalized_question,topic,intent,created_by_admin_id,created_at,updated_at)
         VALUES ($1,'AI分镜怎么保持角色一致？','AI分镜怎么保持角色一致','AI分镜','tutorial',$2,NOW(),NOW())`,
        [secondQuestionId, adminId],
      );
      await db.query(
        `INSERT INTO geo_content_items (id,content_type,topic,slug,status,created_by_admin_id,updated_by_admin_id)
         VALUES ($1,'guide','AI分镜','ai-storyboard-guide','draft',$2,$2)`,
        [contentId, adminId],
      );
      await db.query(
        `INSERT INTO geo_content_versions (id,content_item_id,version_number,title,summary,document_json,config_revision_id,created_by_admin_id,published_at)
         VALUES ($1,$2,1,'AI分镜指南','摘要','{}'::jsonb,'geo-default-v1',$3,NOW())`,
        [versionId, contentId, adminId],
      );
      await db.query(
        "UPDATE geo_content_items SET status='published',current_published_version_id=$2 WHERE id=$1",
        [contentId, versionId],
      );
      await db.query(
        "INSERT INTO geo_content_question_links (content_version_id,question_id) VALUES ($1,$2),($1,$3)",
        [versionId, questionId, secondQuestionId],
      );
      await db.query(
        `INSERT INTO geo_content_items (id,content_type,topic,slug,status,created_by_admin_id,updated_by_admin_id)
         VALUES ($1,'guide','其他内容','other-guide','draft',$2,$2)`,
        [otherContentId, adminId],
      );
      await db.query(
        `INSERT INTO geo_content_versions (id,content_item_id,version_number,title,summary,document_json,config_revision_id,created_by_admin_id,published_at)
         VALUES ($1,$2,1,'其他指南','摘要','{}'::jsonb,'geo-default-v1',$3,NOW())`,
        [otherVersionId, otherContentId, adminId],
      );
      await db.query(
        `INSERT INTO geo_monitor_runs (id,content_item_id,content_version_id,platform_id,source_type,status,created_by_admin_id,started_at)
         VALUES ($1,$2,$3,'deepseek','manual_import','running',$4,NOW())`,
        [runId, contentId, versionId, adminId],
      );
      await db.query(
        `INSERT INTO geo_monitor_results (
           id,run_id,question_id,raw_question,raw_answer,cited_urls_json,
           brand_mentioned,article_cited,result_status,analysis_version
         ) VALUES ($1,$2,$3,'AI分镜工具有哪些？','原始回答','[]'::jsonb,false,false,'not_mentioned','geo-citation-v1')`,
        [resultId, runId, questionId],
      );
      await db.query(
        "UPDATE geo_monitor_runs SET status='succeeded',completed_at=NOW(),updated_at=NOW() WHERE id=$1",
        [runId],
      );

      await assert.rejects(
        db.query("UPDATE geo_monitor_results SET raw_answer='被篡改' WHERE id=$1", [resultId]),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P0001"),
      );
      await assert.rejects(
        db.query("DELETE FROM geo_monitor_results WHERE id=$1", [resultId]),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P0001"),
      );
      await assert.rejects(
        db.query("UPDATE geo_monitor_results SET id='34000000-0000-4000-8000-000000000011' WHERE id=$1", [resultId]),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P0001"),
      );
      await assert.rejects(
        db.query("UPDATE geo_monitor_results SET created_at=created_at + interval '1 second' WHERE id=$1", [resultId]),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P0001"),
      );
      await assert.rejects(
        db.query(
          `INSERT INTO geo_monitor_results (
             id,run_id,question_id,raw_question,raw_answer,cited_urls_json,
             brand_mentioned,article_cited,result_status,analysis_version
           ) VALUES ('34000000-0000-4000-8000-000000000012',$1,$2,'AI分镜怎么保持角色一致？','伪造回答','[]'::jsonb,false,false,'not_mentioned','geo-citation-v1')`,
          [runId, secondQuestionId],
        ),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P0001"),
      );
      await assert.rejects(
        db.query("UPDATE geo_monitor_runs SET platform_id='kimi' WHERE id=$1", [runId]),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P0001"),
      );
      await assert.rejects(
        db.query("DELETE FROM geo_monitor_runs WHERE id=$1", [runId]),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P0001"),
      );
      await assert.rejects(
        db.query(
          `INSERT INTO geo_monitor_runs (id,content_item_id,content_version_id,platform_id,source_type,status,created_by_admin_id,started_at,completed_at)
           VALUES ('34000000-0000-4000-8000-000000000010',$1,$2,'kimi','manual_import','succeeded',$3,NOW(),NOW())`,
          [contentId, otherVersionId, adminId],
        ),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P0001"),
      );
      await assert.rejects(
        db.query(
          `INSERT INTO geo_monitor_runs (id,content_item_id,content_version_id,platform_id,source_type,status,created_by_admin_id,started_at)
           VALUES ('34000000-0000-4000-8000-000000000007',$1,$2,'kimi','manual_import','succeeded',$3,NOW())`,
          [contentId, versionId, adminId],
        ),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "23514"),
      );
      await db.query(
        "UPDATE geo_monitor_results SET brand_mentioned=true,result_status='mentioned' WHERE id=$1",
        [resultId],
      );
      const updated = await db.query<{ raw_answer: string; result_status: string }>(
        "SELECT raw_answer,result_status FROM geo_monitor_results WHERE id=$1",
        [resultId],
      );
      assert.deepEqual(updated.rows[0], { raw_answer: "原始回答", result_status: "mentioned" });
    } finally {
      await db.close();
    }
  });
});
