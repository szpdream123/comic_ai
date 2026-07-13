import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import pg from "pg";

const forbiddenScopePattern = new RegExp(
  String.raw`\b(?:organization|workspace)(?:_id|Id)?\b`,
  "i",
);
const forbiddenStatementPattern = /^\s*(?:insert|update|delete|merge|copy|truncate)\b/im;
const forbiddenControlPattern = /^\s*(?:begin|commit|rollback|savepoint|release|drop)\b/im;
const forbiddenEnvironmentPattern = /^\s*(?:create\s+schema|create\s+extension|alter\b.*\bowner\s+to\b|grant\b|revoke\b|set\s+(?:session\s+authorization|role|search_path)\b)/im;

export function assertSchemaOnlySql(sql) {
  if (!sql.trim()) throw new Error("baseline_sql_empty");
  if (forbiddenScopePattern.test(sql)) throw new Error("baseline_contains_legacy_scope");
  const topLevelSql = maskDollarQuotedBodies(sql);
  if (forbiddenStatementPattern.test(topLevelSql)) throw new Error("baseline_contains_data_statement");
  if (forbiddenControlPattern.test(topLevelSql)) throw new Error("baseline_contains_transaction_or_drop");
  if (forbiddenEnvironmentPattern.test(topLevelSql)) throw new Error("baseline_contains_environment_statement");
}

export function fingerprintSnapshot(snapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function findFirstDifference(source, target) {
  for (const key of Object.keys(source)) {
    if (Array.isArray(source[key]) && Array.isArray(target[key])) {
      const length = Math.max(source[key].length, target[key].length);
      for (let index = 0; index < length; index += 1) {
        if (JSON.stringify(source[key][index]) !== JSON.stringify(target[key][index])) {
          return {
            section: `${key}[${index}]`,
            source: JSON.stringify(source[key][index] ?? "<missing>"),
            target: JSON.stringify(target[key][index] ?? "<missing>"),
          };
        }
      }
      continue;
    }
    const sourceValue = JSON.stringify(source[key]);
    const targetValue = JSON.stringify(target[key]);
    if (sourceValue !== targetValue) {
      return {
        section: key,
        source: sourceValue.slice(0, 1_000),
        target: targetValue.slice(0, 1_000),
      };
    }
  }
  for (const key of Object.keys(target)) {
    if (!(key in source)) return { section: key, source: "<missing>", target: "<present>" };
  }
  return null;
}

export async function readSchemaSnapshot(database, schemaName) {
  await database.query(
    "SELECT set_config('search_path', format('%I, pg_catalog', $1::text), true)",
    [schemaName],
  );

  const sectionQueries = [
    () => database.query(
      `
        SELECT
          relation.relname AS table_name,
          relation.relkind,
          relation.relpersistence,
          relation.relrowsecurity,
          relation.relforcerowsecurity,
          access_method.amname AS access_method
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        LEFT JOIN pg_am access_method ON access_method.oid = relation.relam
        WHERE namespace.nspname = $1
          AND relation.relkind IN ('r', 'p')
        ORDER BY relation.relname
      `,
      [schemaName],
    ),
    () => database.query(
      `
        SELECT
          relation.relname AS table_name,
          (row_number() OVER (
            PARTITION BY relation.oid
            ORDER BY attribute.attnum
          ))::int AS ordinal_position,
          attribute.attname AS column_name,
          format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
          attribute.attnotnull AS not_null,
          pg_get_expr(default_value.adbin, default_value.adrelid, true) AS default_expression,
          attribute.attidentity AS identity_kind,
          attribute.attgenerated AS generated_kind,
          attribute.attstorage AS storage_kind,
          attribute.attcompression AS compression_kind,
          CASE
            WHEN attribute.attcollation = type_record.typcollation THEN NULL
            ELSE collation_namespace.nspname || '.' || collation_record.collname
          END AS explicit_collation
        FROM pg_attribute attribute
        JOIN pg_class relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        JOIN pg_type type_record ON type_record.oid = attribute.atttypid
        LEFT JOIN pg_attrdef default_value
          ON default_value.adrelid = attribute.attrelid
         AND default_value.adnum = attribute.attnum
        LEFT JOIN pg_collation collation_record ON collation_record.oid = attribute.attcollation
        LEFT JOIN pg_namespace collation_namespace ON collation_namespace.oid = collation_record.collnamespace
        WHERE namespace.nspname = $1
          AND relation.relkind IN ('r', 'p')
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
        ORDER BY relation.relname, attribute.attnum
      `,
      [schemaName],
    ),
    () => database.query(
      `
        SELECT
          relation.relname AS table_name,
          constraint_record.conname AS constraint_name,
          constraint_record.contype AS constraint_type,
          constraint_record.condeferrable AS is_deferrable,
          constraint_record.condeferred AS is_initially_deferred,
          constraint_record.convalidated AS is_validated,
          pg_get_constraintdef(constraint_record.oid, true) AS definition
        FROM pg_constraint constraint_record
        JOIN pg_class relation ON relation.oid = constraint_record.conrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = $1
        ORDER BY relation.relname, constraint_record.conname
      `,
      [schemaName],
    ),
    () => database.query(
      `
        SELECT
          table_relation.relname AS table_name,
          index_relation.relname AS index_name,
          index_metadata.indisunique AS is_unique,
          index_metadata.indisprimary AS is_primary,
          index_metadata.indisvalid AS is_valid,
          pg_get_indexdef(index_relation.oid) AS definition
        FROM pg_index index_metadata
        JOIN pg_class index_relation ON index_relation.oid = index_metadata.indexrelid
        JOIN pg_class table_relation ON table_relation.oid = index_metadata.indrelid
        JOIN pg_namespace namespace ON namespace.oid = table_relation.relnamespace
        WHERE namespace.nspname = $1
        ORDER BY table_relation.relname, index_relation.relname
      `,
      [schemaName],
    ),
    () => database.query(
      `
        SELECT
          sequence_relation.relname AS sequence_name,
          format_type(sequence_metadata.seqtypid, NULL) AS data_type,
          sequence_metadata.seqstart AS start_value,
          sequence_metadata.seqincrement AS increment_by,
          sequence_metadata.seqmin AS min_value,
          sequence_metadata.seqmax AS max_value,
          sequence_metadata.seqcache AS cache_size,
          sequence_metadata.seqcycle AS cycles
        FROM pg_sequence sequence_metadata
        JOIN pg_class sequence_relation ON sequence_relation.oid = sequence_metadata.seqrelid
        JOIN pg_namespace namespace ON namespace.oid = sequence_relation.relnamespace
        WHERE namespace.nspname = $1
        ORDER BY sequence_relation.relname
      `,
      [schemaName],
    ),
    () => database.query(
      `
        SELECT
          procedure.proname AS routine_name,
          procedure.prokind AS routine_kind,
          pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
          language.lanname AS language_name,
          pg_get_functiondef(procedure.oid) AS definition
        FROM pg_proc procedure
        JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
        JOIN pg_language language ON language.oid = procedure.prolang
        WHERE namespace.nspname = $1
          AND procedure.prokind IN ('f', 'p')
        ORDER BY procedure.proname, pg_get_function_identity_arguments(procedure.oid)
      `,
      [schemaName],
    ),
    () => database.query(
      `
        SELECT
          relation.relname AS table_name,
          trigger_record.tgname AS trigger_name,
          pg_get_triggerdef(trigger_record.oid, true) AS definition
        FROM pg_trigger trigger_record
        JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = $1
          AND NOT trigger_record.tgisinternal
        ORDER BY relation.relname, trigger_record.tgname
      `,
      [schemaName],
    ),
    () => database.query(
      `
        SELECT
          policy.tablename AS table_name,
          policy.policyname AS policy_name,
          policy.permissive,
          policy.roles,
          policy.cmd,
          policy.qual,
          policy.with_check
        FROM pg_policies policy
        WHERE policy.schemaname = $1
        ORDER BY policy.tablename, policy.policyname
      `,
      [schemaName],
    ),
    () => database.query(
      `
        SELECT viewname AS view_name, definition
        FROM pg_views
        WHERE schemaname = $1
        ORDER BY viewname
      `,
      [schemaName],
    ),
    () => database.query(
      `
        SELECT matviewname AS view_name, definition, ispopulated
        FROM pg_matviews
        WHERE schemaname = $1
        ORDER BY matviewname
      `,
      [schemaName],
    ),
  ];
  const sections = [];
  for (const query of sectionQueries) sections.push(await query());

  const normalizeRows = (rows) => rows.map((row) => normalizeRow(row, schemaName));
  return {
    tables: normalizeRows(sections[0].rows),
    columns: normalizeRows(sections[1].rows),
    constraints: normalizeRows(sections[2].rows),
    indexes: normalizeRows(sections[3].rows),
    sequences: normalizeRows(sections[4].rows),
    routines: normalizeRows(sections[5].rows),
    triggers: normalizeRows(sections[6].rows),
    policies: normalizeRows(sections[7].rows),
    views: normalizeRows(sections[8].rows),
    materializedViews: normalizeRows(sections[9].rows),
  };
}

export async function verifyBaseline(database, sql, sourceSchema) {
  assertSchemaOnlySql(sql);
  const verificationSchema = `baseline_verify_${randomUUID().replaceAll("-", "_")}`;
  await database.query("BEGIN");
  try {
    await database.query("SET LOCAL lock_timeout = '5s'");
    await database.query("SET LOCAL statement_timeout = '2min'");
    const sourceSnapshot = await readSchemaSnapshot(database, sourceSchema);
    await database.query(`CREATE SCHEMA ${quoteIdentifier(verificationSchema)}`);
    await database.query(
      "SELECT set_config('search_path', format('%I, pg_catalog', $1::text), true)",
      [verificationSchema],
    );
    await database.query(sql);
    const targetSnapshot = await readSchemaSnapshot(database, verificationSchema);
    const difference = findFirstDifference(sourceSnapshot, targetSnapshot);
    assert.equal(difference, null, `baseline_catalog_mismatch:${JSON.stringify(difference)}`);
    return {
      fingerprint: fingerprintSnapshot(sourceSnapshot),
      counts: Object.fromEntries(
        Object.entries(sourceSnapshot).map(([key, rows]) => [key, rows.length]),
      ),
    };
  } finally {
    await database.query("ROLLBACK").catch(() => undefined);
  }
}

function normalizeRow(row, schemaName) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeValue(value, schemaName)]),
  );
}

function maskDollarQuotedBodies(sql) {
  return sql.replace(
    /\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g,
    (body) => body.replace(/[^\r\n]/g, " "),
  );
}

function normalizeValue(value, schemaName) {
  if (typeof value === "string") return stripSchemaQualification(value, schemaName);
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry, schemaName));
  return value;
}

function stripSchemaQualification(value, schemaName) {
  const quoted = `"${schemaName.replaceAll('"', '""')}".`;
  return value
    .replaceAll(quoted, "")
    .replace(new RegExp(`\\b${escapeRegExp(schemaName)}\\.`, "g"), "");
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const baselinePath = process.argv[2];
  if (!baselinePath || process.argv.length !== 3) {
    throw new Error("usage: verify-user-centric-baseline.mjs <baseline.sql>");
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const sql = await readFile(baselinePath, "utf8");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const target = await client.query("SELECT current_schema() AS schema_name");
    const result = await verifyBaseline(client, sql, target.rows[0].schema_name);
    console.log(JSON.stringify({ baselinePath, ...result }, null, 2));
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
