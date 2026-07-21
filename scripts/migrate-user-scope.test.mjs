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
      assert.equal(migrations.rows[0]?.count, 9);
      assert.equal(users.rows[0]?.count, 1);
      const agentAssets = await client.query(
        `SELECT count(*)::int AS count FROM "${schema}"."creator_agent_assets"`,
      );
      assert.equal(agentAssets.rows[0]?.count, 0);
      const brandKits = await client.query(
        `SELECT count(*)::int AS count FROM "${schema}"."creator_brand_kits"`,
      );
      const brandKitAssets = await client.query(
        `SELECT count(*)::int AS count FROM "${schema}"."creator_brand_kit_assets"`,
      );
      const projectBrandKitColumn = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'projects' AND column_name = 'brand_kit_id'`,
        [schema],
      );
      assert.equal(brandKits.rows[0]?.count, 0);
      assert.equal(brandKitAssets.rows[0]?.count, 0);
      assert.equal(projectBrandKitColumn.rows[0]?.count, 1);
      const audioModel = await client.query(
        `SELECT media_type, provider_protocol, invocation_mode, provider_model, status FROM "${schema}"."ai_model_configs" WHERE model_code = 'cosyvoice-v2'`,
      );
      assert.deepEqual(audioModel.rows[0], {
        media_type: "audio",
        provider_protocol: "aliyun_bailian_audio",
        invocation_mode: "sync",
        provider_model: "cosyvoice-v2",
        status: "active",
      });
      const audioPolicy = await client.query(
        `SELECT poll_queue_name, polling_backoff_json, retry_policy_json FROM "${schema}"."ai_model_dispatch_policies" WHERE model_config_id = '70000000-0000-4000-8000-00000000a001'`,
      );
      assert.deepEqual(audioPolicy.rows[0], {
        poll_queue_name: null,
        polling_backoff_json: {},
        retry_policy_json: { submitAttempts: 3, finalizeAttempts: 3 },
      });

      await client.query(`
        DELETE FROM "${schema}"."app_schema_migrations"
        WHERE migration_name IN (
          '20260718-create-director-desks.sql',
          '20260718-create-team-member-director-desks.sql'
        )
      `);
      await client.query(`DROP TABLE "${schema}"."team_member_director_desks"`);
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
      const teamMemberDirectorDesks = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'team_member_director_desks'`,
        [schema],
      );
      assert.equal(teamMemberDirectorDesks.rows[0]?.count, 1);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });

});
