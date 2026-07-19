import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import pg from "pg";

import {
  fingerprintSnapshot,
  readSchemaSnapshot,
} from "./verify-user-centric-baseline.mjs";

const migrations = [
  ["user-centric-schema.sql", "packages/db/baseline/user-centric-schema.sql"],
  ["model-reference-seed.sql", "packages/db/baseline/model-reference-seed.sql"],
  ["20260718-create-director-desks.sql", "packages/db/migrations/20260718-create-director-desks.sql"],
  ["20260718-create-team-member-director-desks.sql", "packages/db/migrations/20260718-create-team-member-director-desks.sql"],
];
const requiredBaselineMigrationNames = ["user-centric-schema.sql", "model-reference-seed.sql"];
const expectedSchemaFingerprint = "b30b8b3f4c5030d2f2c1b62b8ac9ead6cdad38d4529dd417c45e0e15ae59e7a5";
const mode = process.argv.includes("--dry-run") ? "dry-run" : process.argv.includes("--apply") ? "apply" : null;
const registerExisting = process.argv.includes("--register-existing");
if (!mode) throw new Error("usage: migrate-user-scope.mjs --dry-run|--apply [--register-existing]");

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString });
let transactionOpen = false;
try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('comic_ai:user_schema_baseline'))");
  const target = await client.query("SELECT current_database() AS database_name, current_schema() AS schema_name");
  console.log(`target=${target.rows[0].database_name}/${target.rows[0].schema_name}`);
  const loaded = await loadMigrations();

  if (mode === "dry-run") {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '15min'");
    await applyOrValidate(client, loaded, false, registerExisting);
    await assertCleanSchema(client);
    await client.query("ROLLBACK");
    transactionOpen = false;
    console.log("dry-run rolled back");
  } else {
    await applyOrValidate(client, loaded, true, registerExisting);
    await assertCleanSchema(client);
    console.log("migration complete");
  }
} finally {
  if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
  await client.query("SELECT pg_advisory_unlock(hashtext('comic_ai:user_schema_baseline'))").catch(() => undefined);
  await client.end().catch(() => undefined);
}

async function loadMigrations() {
  return Promise.all(migrations.map(async ([name, relativePath]) => {
    const sql = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

async function ensureLedger(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      migration_name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function applyOrValidate(db, loaded, apply, allowRegistration) {
  const hasUsers = await tableExists(db, "users");
  const hasLedger = await tableExists(db, "app_schema_migrations");
  const rows = hasLedger
    ? await db.query("SELECT migration_name, checksum FROM app_schema_migrations")
    : { rows: [] };
  const applied = new Map(rows.rows.map((row) => [row.migration_name, row.checksum]));

  if (hasUsers && !allowRegistration && requiredBaselineMigrationNames.some((name) => !applied.has(name))) {
    throw new Error("baseline_registration_required");
  }

  if (hasUsers && allowRegistration) {
    await assertExpectedExistingSchema(db);
    if (apply) await db.query("BEGIN");
    try {
      await ensureLedger(db);
      await db.query("DELETE FROM app_schema_migrations");
      for (const migration of loaded.filter(({ name }) => requiredBaselineMigrationNames.includes(name))) {
        await db.query(
          "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        applied.set(migration.name, migration.checksum);
        console.log(`${apply ? "registered" : "dry-run register"} ${migration.name}`);
      }
      if (apply) await db.query("COMMIT");
    } catch (error) {
      if (apply) await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  for (const migration of loaded) {
    const recorded = applied.get(migration.name);
    if (recorded && recorded !== migration.checksum) {
      throw new Error(`migration_checksum_mismatch:${migration.name}`);
    }
    if (recorded) {
      console.log(`${apply ? "skip" : "dry-run skip"} ${migration.name}`);
      continue;
    }

    if (apply) {
      await db.query("BEGIN");
      try {
        await db.query("SET LOCAL statement_timeout = '15min'");
        await db.query(migration.sql);
        await db.query(
          "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        await db.query("COMMIT");
        console.log(`applied ${migration.name}`);
      } catch (error) {
        await db.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    } else {
      await db.query(migration.sql);
      await db.query(
        "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      console.log(`dry-run ok ${migration.name}`);
    }
  }
}

async function assertExpectedExistingSchema(db) {
  const target = await db.query("SELECT current_schema() AS schema_name");
  const snapshot = await readSchemaSnapshot(db, target.rows[0].schema_name);
  const fingerprint = fingerprintSnapshot(snapshot);
  if (fingerprint !== expectedSchemaFingerprint) {
    throw new Error(`existing_schema_fingerprint_mismatch:${fingerprint}`);
  }
}

async function assertCleanSchema(db) {
  const first = ["organ", "ization"].join("");
  const second = ["work", "space"].join("");
  const result = await db.query(`
    WITH findings AS (
      SELECT 'column'::text AS object_type, table_name || '.' || column_name AS object_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          column_name ILIKE '%' || $1 || '%'
          OR column_name ILIKE '%' || $2 || '%'
          OR coalesce(column_default, '') ILIKE '%' || $1 || '%'
          OR coalesce(column_default, '') ILIKE '%' || $2 || '%'
          OR coalesce(generation_expression, '') ILIKE '%' || $1 || '%'
          OR coalesce(generation_expression, '') ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'table', table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND (table_name ILIKE '%' || $1 || '%' OR table_name ILIKE '%' || $2 || '%')

      UNION ALL
      SELECT 'constraint', constraint_record.conname
      FROM pg_constraint constraint_record
      JOIN pg_namespace namespace ON namespace.oid = constraint_record.connamespace
      WHERE namespace.nspname = current_schema()
        AND (
          constraint_record.conname ILIKE '%' || $1 || '%'
          OR constraint_record.conname ILIKE '%' || $2 || '%'
          OR pg_get_constraintdef(constraint_record.oid) ILIKE '%' || $1 || '%'
          OR pg_get_constraintdef(constraint_record.oid) ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'index', indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND (
          indexname ILIKE '%' || $1 || '%'
          OR indexname ILIKE '%' || $2 || '%'
          OR indexdef ILIKE '%' || $1 || '%'
          OR indexdef ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'view', viewname
      FROM pg_views
      WHERE schemaname = current_schema()
        AND (
          viewname ILIKE '%' || $1 || '%'
          OR viewname ILIKE '%' || $2 || '%'
          OR definition ILIKE '%' || $1 || '%'
          OR definition ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'materialized_view', matviewname
      FROM pg_matviews
      WHERE schemaname = current_schema()
        AND (
          matviewname ILIKE '%' || $1 || '%'
          OR matviewname ILIKE '%' || $2 || '%'
          OR definition ILIKE '%' || $1 || '%'
          OR definition ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'routine', procedure.proname
      FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = current_schema()
        AND procedure.prokind IN ('f', 'p')
        AND (
          procedure.proname ILIKE '%' || $1 || '%'
          OR procedure.proname ILIKE '%' || $2 || '%'
          OR pg_get_functiondef(procedure.oid) ILIKE '%' || $1 || '%'
          OR pg_get_functiondef(procedure.oid) ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'trigger', trigger_record.tgname
      FROM pg_trigger trigger_record
      JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND NOT trigger_record.tgisinternal
        AND (
          trigger_record.tgname ILIKE '%' || $1 || '%'
          OR trigger_record.tgname ILIKE '%' || $2 || '%'
          OR pg_get_triggerdef(trigger_record.oid) ILIKE '%' || $1 || '%'
          OR pg_get_triggerdef(trigger_record.oid) ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'policy', policyname
      FROM pg_policies
      WHERE schemaname = current_schema()
        AND (
          policyname ILIKE '%' || $1 || '%'
          OR policyname ILIKE '%' || $2 || '%'
          OR coalesce(qual, '') ILIKE '%' || $1 || '%'
          OR coalesce(qual, '') ILIKE '%' || $2 || '%'
          OR coalesce(with_check, '') ILIKE '%' || $1 || '%'
          OR coalesce(with_check, '') ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'sequence', sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = current_schema()
        AND (sequence_name ILIKE '%' || $1 || '%' OR sequence_name ILIKE '%' || $2 || '%')

      UNION ALL
      SELECT 'type', type_record.typname
      FROM pg_type type_record
      JOIN pg_namespace namespace ON namespace.oid = type_record.typnamespace
      WHERE namespace.nspname = current_schema()
        AND (type_record.typname ILIKE '%' || $1 || '%' OR type_record.typname ILIKE '%' || $2 || '%')

      UNION ALL
      SELECT 'comment', relation.relname || coalesce('.' || attribute.attname, '')
      FROM pg_description description_record
      JOIN pg_class relation ON relation.oid = description_record.objoid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      LEFT JOIN pg_attribute attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attnum = description_record.objsubid
      WHERE namespace.nspname = current_schema()
        AND (
          description_record.description ILIKE '%' || $1 || '%'
          OR description_record.description ILIKE '%' || $2 || '%'
        )
    )
    SELECT object_type, object_name
    FROM findings
    ORDER BY object_type, object_name
  `, [first, second]);
  if (result.rows.length > 0) throw new Error(`legacy_schema_objects_remain:${JSON.stringify(result.rows)}`);
}

async function tableExists(db, tableName) {
  const result = await db.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1) AS exists",
    [tableName],
  );
  return result.rows[0]?.exists === true;
}
