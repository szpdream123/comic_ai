import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { ensureFoundationSchema } from "./dev-db.ts";

test("ensureFoundationSchema applies admin management migration to existing foundation databases", async () => {
  const dbPath = resolve(process.cwd(), ".local", "test-db", randomUUID());
  await mkdir(dbPath, { recursive: true });
  const db = new PGlite(dbPath);

  await applyMigrationsBefore("0010_admin_management_platform.sql", db);

  await ensureFoundationSchema(db);

  const tables = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('admin_accounts', 'admin_auth_sessions', 'runtime_config_entries')
    ORDER BY table_name
  `);

  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    ["admin_accounts", "admin_auth_sessions", "runtime_config_entries"],
  );

  await db.close();
});

test("ensureFoundationSchema repairs legacy admin account tables missing lock columns", async () => {
  const dbPath = resolve(process.cwd(), ".local", "test-db", randomUUID());
  await mkdir(dbPath, { recursive: true });
  const db = new PGlite(dbPath);

  await applyMigrationsBefore("0010_admin_management_platform.sql", db);
  await db.exec(`
    CREATE TABLE admin_accounts (
      id uuid PRIMARY KEY,
      login_name text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      display_name text NOT NULL,
      status text NOT NULL DEFAULT 'active'
    );
  `);

  await ensureFoundationSchema(db);

  const columns = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_accounts'
      AND column_name IN ('failed_login_count', 'locked_until')
    ORDER BY column_name
  `);

  assert.deepEqual(
    columns.rows.map((row) => row.column_name),
    ["failed_login_count", "locked_until"],
  );

  await db.close();
});

test("ensureFoundationSchema repairs legacy foundation databases missing team member tables", async () => {
  const dbPath = resolve(process.cwd(), ".local", "test-db", randomUUID());
  await mkdir(dbPath, { recursive: true });
  const db = new PGlite(dbPath);

  await db.exec(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      phone_e164 text UNIQUE,
      display_name text,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE organizations (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      credit_balance_cached integer NOT NULL DEFAULT 0,
      credit_reserved_cached integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE workspaces (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id),
      name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE memberships (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id),
      workspace_id uuid REFERENCES workspaces(id),
      user_id uuid NOT NULL REFERENCES users(id),
      role text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE sms_send_records (id uuid PRIMARY KEY);
    CREATE TABLE storage_upload_sessions (id uuid PRIMARY KEY);
    CREATE TABLE episode_generation_drafts (id uuid PRIMARY KEY);
    CREATE TABLE episode_asset_conversation_threads (id uuid PRIMARY KEY);
    CREATE TABLE project_upload_records (id uuid PRIMARY KEY);
    CREATE TABLE ai_generation_task_snapshots (id uuid PRIMARY KEY);
    CREATE TABLE admin_accounts (
      id uuid PRIMARY KEY,
      login_name text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      display_name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      failed_login_count integer NOT NULL DEFAULT 0,
      locked_until timestamptz NULL
    );
  `);

  await ensureFoundationSchema(db);

  const tables = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('team_member_groups', 'team_member_profiles')
    ORDER BY table_name
  `);

  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    ["team_member_groups", "team_member_profiles"],
  );

  await db.close();
});

async function applyMigrationsBefore(stopName, db) {
  const migrationDir = resolve(process.cwd(), "packages", "db", "migrations");
  const files = (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql") && file.localeCompare(stopName) < 0)
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    await db.exec(await readFile(join(migrationDir, file), "utf8"));
  }
}
