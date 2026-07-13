import pg from "pg";

const connectionString = process.env.TARGET_DATABASE_URL?.trim();
if (!connectionString) throw new Error("TARGET_DATABASE_URL is required");

const allowedTemporarySchema = /^(?:test_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}|dbg_[0-9]+|debug_schema_[0-9]+|tmp_admin_users_[0-9a-f]+|trace_[0-9]+|z_[0-9a-f]+)$/;
const workerCount = 4;

const coordinator = new pg.Client({ connectionString });
await coordinator.connect();
try {
  const target = await coordinator.query("SELECT current_database() AS database_name, current_schema() AS schema_name");
  if (target.rows[0]?.database_name !== "comic_ai" || target.rows[0]?.schema_name !== "public") {
    throw new Error(`unexpected_target:${target.rows[0]?.database_name}/${target.rows[0]?.schema_name}`);
  }
  const result = await coordinator.query("SELECT nspname FROM pg_namespace ORDER BY nspname");
  const schemas = result.rows
    .map((row) => row.nspname)
    .filter((name) => name !== "public" && name !== "information_schema" && !name.startsWith("pg_"));
  const unexpected = schemas.filter((name) => !allowedTemporarySchema.test(name));
  if (unexpected.length > 0) throw new Error(`unexpected_nonpublic_schemas:${JSON.stringify(unexpected)}`);

  const groups = Array.from({ length: workerCount }, () => []);
  schemas.forEach((schema, index) => groups[index % workerCount].push(schema));
  await Promise.all(groups.map((group, index) => cleanGroup(group, index)));
  console.log(JSON.stringify({ cleanedSchemas: schemas.length, workers: workerCount }));
} finally {
  await coordinator.end().catch(() => undefined);
}

async function cleanGroup(group, workerIndex) {
  if (group.length === 0) return;
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const schema of group) {
      const objects = await client.query(
        "SELECT relname, relkind FROM pg_class WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1) AND relkind IN ('r','p','v','m','S') ORDER BY relkind, relname",
        [schema],
      );
      for (const object of objects.rows) {
        await runDdl(client, `DROP ${dropKind(object.relkind)} ${quote(schema)}.${quote(object.relname)} CASCADE`);
      }
      await runDdl(client, `DROP SCHEMA ${quote(schema)} CASCADE`);
    }
    console.log(JSON.stringify({ worker: workerIndex, cleanedSchemas: group.length }));
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function runDdl(client, sql) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === "42P01") return;
    throw error;
  }
}

function dropKind(relkind) {
  if (relkind === "v") return "VIEW";
  if (relkind === "m") return "MATERIALIZED VIEW";
  if (relkind === "S") return "SEQUENCE";
  return "TABLE";
}

function quote(value) {
  return `${String.fromCharCode(34)}${String(value).replaceAll(String.fromCharCode(34), String.fromCharCode(34, 34))}${String.fromCharCode(34)}`;
}
