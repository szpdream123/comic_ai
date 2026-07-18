import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import pg from "pg";

describe("user-centric migration runner", { concurrency: false }, () => {
  it("rolls back the migration ledger and baseline during an empty-schema dry run", async () => {
    const connectionString = process.env.DATABASE_URL?.trim();
    assert.ok(connectionString, "DATABASE_URL is required");

    const schema = `test_${randomUUID().replaceAll("-", "_")}`;
    assert.match(schema, /^test_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/);
    const client = new pg.Client({ connectionString });

    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      const isolatedUrl = new URL(connectionString);
      isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
      const result = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--dry-run"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const tables = await client.query(
        "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1",
        [schema],
      );
      assert.equal(tables.rows[0]?.count, 0);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });

  it("initializes an empty schema and records all migrations", async () => {
    const connectionString = process.env.DATABASE_URL?.trim();
    assert.ok(connectionString, "DATABASE_URL is required");

    const schema = `test_${randomUUID().replaceAll("-", "_")}`;
    assert.match(schema, /^test_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/);
    const client = new pg.Client({ connectionString });

    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      const isolatedUrl = new URL(connectionString);
      isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
      const result = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const migrations = await client.query(
        `SELECT count(*)::int AS count FROM "${schema}"."app_schema_migrations"`,
      );
      const users = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'users'`,
        [schema],
      );
      assert.equal(migrations.rows[0]?.count, 3);
      assert.equal(users.rows[0]?.count, 1);

      await client.query(`DELETE FROM "${schema}"."app_schema_migrations" WHERE migration_name = '20260718-create-director-desks.sql'`);
      await client.query(`DROP TABLE "${schema}"."director_desks"`);
      const incrementalResult = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );
      assert.equal(incrementalResult.status, 0, incrementalResult.stderr || incrementalResult.stdout);
      const directorDesks = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'director_desks'`,
        [schema],
      );
      assert.equal(directorDesks.rows[0]?.count, 1);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });

});
