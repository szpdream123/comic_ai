import { pathToFileURL } from "node:url";

import pg from "pg";

const legacyKeyNeedles = [
  ["organization", "_id"].join(""),
  ["organization", "Id"].join(""),
  ["workspace", "_id"].join(""),
  ["workspace", "Id"].join(""),
];
const targets = [
  ["credit_ledger_entries", "metadata_json"],
  ["credit_reservations", "metadata_json"],
  ["credit_reservation_allocations", "metadata_json"],
  ["audit_events", "metadata_json"],
  ["credit_lots", "metadata_json"],
  ["payment_logs", "callback_result_json"],
];

async function main() {
  const mode = process.argv.includes("--dry-run")
    ? "dry-run"
    : process.argv.includes("--apply")
      ? "apply"
      : null;
  if (!mode) throw new Error("usage: cleanup-user-scope-data.mjs --dry-run|--apply");

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = new pg.Client({ connectionString });
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock(hashtext('comic_ai:user_scope_data_cleanup'))");
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '15min'");
    await client.query("SET LOCAL lock_timeout = '15s'");

    const changes = [];
    for (const [table, column] of targets) {
      const selectTarget = table === "audit_events" ? ", target_type, target_id" : "";
      const rows = await client.query(
        `SELECT id, ${quote(column)} AS value${selectTarget} FROM ${quote(table)} WHERE ${quote(column)}::text ILIKE ANY($1)`,
        [legacyKeyNeedles.map((needle) => `%${needle}%`)],
      );
      let changed = 0;
      for (const row of rows.rows) {
        const before = row.value;
        const after = stripLegacyScopeKeys(before);
        if (table === "audit_events" && column === "metadata_json" && isUserTarget(row) && after && typeof after === "object" && !Array.isArray(after)) {
          after.targetUserId ??= row.target_id;
        }
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        const result = await client.query(
          `UPDATE ${quote(table)} SET ${quote(column)} = $2::jsonb WHERE id = $1 AND ${quote(column)} = $3::jsonb`,
          [row.id, JSON.stringify(after), JSON.stringify(before)],
        );
        if (result.rowCount !== 1) {
          throw new Error(`concurrent_json_change:${table}.${column}`);
        }
        changed += 1;
      }
      changes.push({ table, column, matched: rows.rowCount, changed });
    }

    const remaining = await findLegacyValues(client);
    if (remaining.length > 0) {
      throw new Error(`legacy_json_keys_remain:${JSON.stringify(remaining)}`);
    }

    if (mode === "apply") {
      await client.query("COMMIT");
      transactionOpen = false;
    } else {
      await client.query("ROLLBACK");
      transactionOpen = false;
    }
    console.log(JSON.stringify({ mode, changes, remaining: 0 }, null, 2));
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    await client.query("SELECT pg_advisory_unlock(hashtext('comic_ai:user_scope_data_cleanup'))").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

export function stripLegacyScopeKeys(value) {
  if (Array.isArray(value)) return value.map(stripLegacyScopeKeys);
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (isLegacyScopeKey(key)) continue;
    result[key] = stripLegacyScopeKeys(child);
  }
  return result;
}

function isLegacyScopeKey(key) {
  const normalized = key.replaceAll("_", "").toLowerCase();
  return normalized.includes("organizationid") || normalized.includes("workspaceid");
}

function isUserTarget(row) {
  return row.target_type === "user" && typeof row.target_id === "string";
}

export async function findLegacyValues(db) {
  const columns = await db.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND data_type IN ('jsonb', 'json', 'text', 'character varying', 'character')
    ORDER BY table_name, ordinal_position
  `);
  const findings = [];
  for (const { table_name: table, column_name: column } of columns.rows) {
    const result = await db.query(
      `SELECT count(*)::int AS count FROM ${quote(table)} WHERE ${quote(column)}::text ILIKE ANY($1)`,
      [legacyKeyNeedles.map((needle) => `%${needle}%`)],
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (count > 0) findings.push({ table, column, count });
  }
  return findings;
}

function quote(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
