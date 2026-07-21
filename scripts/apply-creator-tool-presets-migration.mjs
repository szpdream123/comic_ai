import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

import pg from "pg";

const migrationName = "20260721-create-creator-tool-presets.sql";
const migrationUrl = new URL(`../packages/db/migrations/${migrationName}`, import.meta.url);
const envUrl = new URL("../.env", import.meta.url);
const mode = process.argv.includes("--check")
  ? "check"
  : process.argv.includes("--apply")
    ? "apply"
    : null;

if (!mode || (process.argv.includes("--check") && process.argv.includes("--apply"))) {
  throw new Error("usage: apply-creator-tool-presets-migration.mjs --check|--apply");
}

const env = parseEnv(await readFile(envUrl, "utf8"));
const connectionString = env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const migrationSql = await readFile(migrationUrl, "utf8");
const checksum = createHash("sha256").update(migrationSql).digest("hex");
const client = new pg.Client({ connectionString });
let transactionOpen = false;

try {
  await client.connect();
  if (mode === "check") {
    await client.query("BEGIN READ ONLY");
    transactionOpen = true;
    const state = await inspectMigrationState(client);
    assertConsistentState(state);
    await client.query("ROLLBACK");
    transactionOpen = false;
    console.log(JSON.stringify({ mode, migration: migrationName, state: summarizeState(state) }));
  } else {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '2min'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('comic_ai:creator_tool_presets_migration'))");

    const before = await inspectMigrationState(client, { lockLedgerRow: true });
    assertConsistentState(before);
    if (before.recordedChecksum === checksum) {
      await client.query("COMMIT");
      transactionOpen = false;
      console.log(JSON.stringify({ mode, migration: migrationName, state: "already-applied" }));
    } else {
      await client.query(migrationSql);
      const afterSchema = await inspectSchemaObjects(client);
      if (!afterSchema.complete) {
        throw new Error(`migration_schema_incomplete:${afterSchema.missing.join(",")}`);
      }
      await client.query(
        "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
        [migrationName, checksum],
      );
      await client.query("COMMIT");
      transactionOpen = false;
      console.log(JSON.stringify({ mode, migration: migrationName, state: "applied" }));
    }
  }
} catch (error) {
  if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}

async function inspectMigrationState(db, options = {}) {
  const ledger = await db.query(
    "SELECT to_regclass(current_schema() || '.app_schema_migrations') IS NOT NULL AS exists",
  );
  if (ledger.rows[0]?.exists !== true) throw new Error("migration_ledger_missing");

  const ledgerQuery = options.lockLedgerRow
    ? "SELECT checksum FROM app_schema_migrations WHERE migration_name = $1 FOR UPDATE"
    : "SELECT checksum FROM app_schema_migrations WHERE migration_name = $1";
  const recorded = await db.query(ledgerQuery, [migrationName]);
  const schema = await inspectSchemaObjects(db);
  return { recordedChecksum: recorded.rows[0]?.checksum ?? null, schema };
}

function assertConsistentState(state) {
  if (state.recordedChecksum && state.recordedChecksum !== checksum) {
    throw new Error(`migration_checksum_mismatch:${migrationName}`);
  }
  if (state.recordedChecksum === checksum && !state.schema.complete) {
    throw new Error(`migration_schema_incomplete:${state.schema.missing.join(",")}`);
  }
  if (!state.recordedChecksum && state.schema.present.length > 0) {
    throw new Error(`migration_partial_schema_detected:${state.schema.present.join(",")}`);
  }
}

function summarizeState(state) {
  return state.recordedChecksum === checksum ? "already-applied" : "pending";
}

async function inspectSchemaObjects(db) {
  const expectedRelations = [
    "creator_tool_presets",
    "creator_tool_preset_versions",
    "creator_tool_presets_admin_name_uidx",
    "creator_tool_presets_admin_updated_idx",
    "creator_tool_preset_versions_preset_created_idx",
  ];
  const expectedConstraints = [
    "creator_tool_presets_pkey",
    "creator_tool_presets_admin_user_id_fkey",
    "creator_tool_presets_created_by_member_id_fkey",
    "creator_tool_presets_name_check",
    "creator_tool_presets_description_check",
    "creator_tool_presets_category_check",
    "creator_tool_presets_status_check",
    "creator_tool_presets_version_check",
    "creator_tool_presets_current_version_fkey",
    "creator_tool_preset_versions_pkey",
    "creator_tool_preset_versions_preset_id_fkey",
    "creator_tool_preset_versions_created_by_member_id_fkey",
    "creator_tool_preset_versions_number_check",
    "creator_tool_preset_versions_topology_check",
    "creator_tool_preset_versions_node_count_check",
    "creator_tool_preset_versions_edge_count_check",
    "creator_tool_preset_versions_hash_check",
    "creator_tool_preset_versions_number_unique",
  ];

  const relations = await db.query(
    `SELECT requested.name, to_regclass(current_schema() || '.' || requested.name) IS NOT NULL AS present
       FROM unnest($1::text[]) AS requested(name)`,
    [expectedRelations],
  );
  const constraints = await db.query(
    `SELECT requested.name, EXISTS (
       SELECT 1
         FROM pg_constraint constraint_record
         JOIN pg_namespace namespace ON namespace.oid = constraint_record.connamespace
        WHERE namespace.nspname = current_schema()
          AND constraint_record.conname = requested.name
     ) AS present
       FROM unnest($1::text[]) AS requested(name)`,
    [expectedConstraints],
  );
  const objects = [...relations.rows, ...constraints.rows];
  const present = objects.filter((object) => object.present === true).map((object) => object.name);
  const missing = objects.filter((object) => object.present !== true).map((object) => object.name);
  return { complete: missing.length === 0, present, missing };
}
