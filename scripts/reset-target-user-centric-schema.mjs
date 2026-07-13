import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import pg from "pg";

import {
  fingerprintSnapshot,
  readSchemaSnapshot,
} from "./verify-user-centric-baseline.mjs";

const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : null;
if (!mode) throw new Error("usage: reset-target-user-centric-schema.mjs --dry-run|--apply");

const connectionString = process.env.TARGET_DATABASE_URL?.trim();
if (!connectionString) throw new Error("TARGET_DATABASE_URL is required");

const expectedOldFingerprint = "061f125ece0800cfd85f072287e281d49769d58989e22fbd998c48c68cc354fe";
const expectedNewFingerprint = "b30b8b3f4c5030d2f2c1b62b8ac9ead6cdad38d4529dd417c45e0e15ae59e7a5";
const migrations = [
  ["user-centric-schema.sql", new URL("../packages/db/baseline/user-centric-schema.sql", import.meta.url)],
  ["model-reference-seed.sql", new URL("../packages/db/baseline/model-reference-seed.sql", import.meta.url)],
];

const client = new pg.Client({ connectionString });
let transactionOpen = false;
try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('comic_ai:target_schema_reset'))");
  await client.query("SET search_path TO public");
  const target = await client.query("SELECT current_database() AS database_name, current_schema() AS schema_name");
  if (target.rows[0]?.database_name !== "comic_ai" || target.rows[0]?.schema_name !== "public") {
    throw new Error(`unexpected_target:${target.rows[0]?.database_name}/${target.rows[0]?.schema_name}`);
  }

  const before = await readSchemaSnapshot(client, "public");
  const beforeFingerprint = fingerprintSnapshot(before);
  if (beforeFingerprint !== expectedOldFingerprint) {
    throw new Error(`target_fingerprint_changed:${beforeFingerprint}`);
  }
  if (mode === "dry-run") {
    console.log(JSON.stringify({ mode, target: "comic_ai/public", beforeFingerprint, plannedFingerprint: expectedNewFingerprint }));
  } else {
    const loaded = await Promise.all(migrations.map(async ([name, url]) => {
      const sql = await readFile(url, "utf8");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    }));

    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '15min'");
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("SET LOCAL search_path TO public");
    await client.query(loaded[0].sql);
    await client.query(loaded[1].sql);
    for (const migration of loaded) {
      await client.query(
        "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
    }

    const after = await readSchemaSnapshot(client, "public");
    const afterFingerprint = fingerprintSnapshot(after);
    if (afterFingerprint !== expectedNewFingerprint) {
      throw new Error(`target_fingerprint_after_reset_mismatch:${afterFingerprint}`);
    }
    await client.query("COMMIT");
    transactionOpen = false;
    console.log(JSON.stringify({
      mode,
      target: "comic_ai/public",
      beforeFingerprint,
      afterFingerprint,
      counts: {
        tables: after.tables.length,
        columns: after.columns.length,
        constraints: after.constraints.length,
        indexes: after.indexes.length,
        sequences: after.sequences.length,
        routines: after.routines.length,
      },
    }, null, 2));
  }
} finally {
  if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
  await client.query("SELECT pg_advisory_unlock(hashtext('comic_ai:target_schema_reset'))").catch(() => undefined);
  await client.end().catch(() => undefined);
}
