import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb, listColumnNames, listTableNames } from "../test-db.ts";

describe("ensureFoundationSchema", () => {
  it("rejects existing schemas that are missing sms_send_records", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query("DROP TABLE sms_send_records");

      const beforeTables = await listTableNames(db);
      assert.equal(beforeTables.includes("sms_send_records"), false);

      const devDbModule = await import("../dev-db.ts");
      assert.equal(typeof devDbModule.ensureFoundationSchema, "function");

      await assert.rejects(
        devDbModule.ensureFoundationSchema(db),
        /current_schema_baseline_incomplete:sms_send_records\.verification_code/,
      );

      const afterTables = await listTableNames(db);
      assert.equal(afterTables.includes("sms_send_records"), false);
    } finally {
      await (db as { close?: () => Promise<void> }).close?.();
    }
  });

  it("rejects existing schemas that are missing user invite codes", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query("ALTER TABLE users ALTER COLUMN invite_code DROP DEFAULT");
      await db.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_invite_code_format_check");
      await db.query("DROP INDEX IF EXISTS users_invite_code_key");
      await db.query("ALTER TABLE users DROP COLUMN invite_code");

      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES
            ('00000000-0000-4000-8000-000000000011', '13800138011', 'active'),
            ('00000000-0000-4000-8000-000000000012', '13800138012', 'active')
        `,
      );

      const beforeColumns = await listColumnNames(db, "users");
      assert.equal(beforeColumns.includes("invite_code"), false);

      const devDbModule = await import("../dev-db.ts");
      await assert.rejects(
        devDbModule.ensureFoundationSchema(db),
        /current_schema_baseline_incomplete:users\.invite_code/,
      );

      const afterColumns = await listColumnNames(db, "users");
      assert.equal(afterColumns.includes("invite_code"), false);
    } finally {
      await (db as { close?: () => Promise<void> }).close?.();
    }
  });

  it("does not rewrite an existing invite generator during clean-baseline startup", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        CREATE SEQUENCE IF NOT EXISTS user_invite_code_seq
          AS bigint
          START WITH 1
          INCREMENT BY 1
          MINVALUE 1
          NO MAXVALUE;

        CREATE OR REPLACE FUNCTION generate_user_invite_code()
        RETURNS text
        LANGUAGE plpgsql
        AS $$
        DECLARE
          alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          sequence_value bigint;
          working_value bigint;
          encoded text := '';
          remainder_index integer;
        BEGIN
          sequence_value := nextval('user_invite_code_seq');
          working_value := sequence_value;

          WHILE working_value > 0 LOOP
            remainder_index := (working_value % 36)::integer;
            encoded := substr(alphabet, remainder_index + 1, 1) || encoded;
            working_value := working_value / 36;
          END LOOP;

          IF encoded = '' THEN
            encoded := '0';
          END IF;

          RETURN lpad(encoded, 10, '0');
        END;
        $$;

        ALTER TABLE users
          ALTER COLUMN invite_code SET DEFAULT generate_user_invite_code();
      `);

      const devDbModule = await import("../dev-db.ts");
      await devDbModule.ensureFoundationSchema(db);

      const generator = await db.query<{ definition: string }>(
        `
          SELECT pg_get_functiondef(proc.oid) AS definition
          FROM pg_proc proc
          JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
          WHERE namespace.nspname = current_schema()
            AND proc.proname = 'generate_user_invite_code'
          LIMIT 1
        `,
      );

      assert.equal(generator.rows[0]?.definition.includes("nextval('user_invite_code_seq'"), true);
    } finally {
      await (db as { close?: () => Promise<void> }).close?.();
    }
  });
});
