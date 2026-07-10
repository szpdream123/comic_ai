import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required to apply the membership catalog");
}
const schemaName = process.env.DATABASE_SCHEMA?.trim() || null;

const sql = await readFile(
  resolve(
    process.cwd(),
    "packages/db/catalogs/membership-and-credit-package-catalog.sql",
  ),
  "utf8",
);
const pool = new Pool({ connectionString });
const client = await pool.connect();

try {
  if (schemaName) {
    const quotedSchema = `"${schemaName.replaceAll('"', '""')}"`;
    await client.query("SELECT set_config('search_path', $1, false)", [quotedSchema]);
  }
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Membership and direct recharge catalogs applied.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
