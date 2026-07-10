import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required to apply the membership catalog");
}

const sql = await readFile(
  resolve(
    process.cwd(),
    "packages/db/catalogs/membership-and-credit-package-catalog.sql",
  ),
  "utf8",
);
const pool = new Pool({ connectionString });

try {
  await pool.query("BEGIN");
  await pool.query(sql);
  await pool.query("COMMIT");
  console.log("Membership and direct recharge catalogs applied.");
} catch (error) {
  await pool.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await pool.end();
}
