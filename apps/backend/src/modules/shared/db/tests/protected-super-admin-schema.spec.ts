import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../test-db.ts";

describe("protected super admin schema", () => {
  it("allows only unique positive protected slots", async () => {
    const db = await createMigratedTestDb();

    try {
      const columns = await db.query<{ column_name: string }>(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'admin_accounts'
            AND column_name = 'super_admin_slot'
        `,
      );
      assert.equal(columns.rows.length, 1);

      await db.query(
        `
          INSERT INTO admin_accounts (
            id, login_name, password_hash, display_name, status, super_admin_slot
          )
          VALUES (
            '71000000-0000-4000-8000-000000000001',
            'slot_one',
            'plain:test',
            'Slot One',
            'active',
            1
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO admin_accounts (
              id, login_name, password_hash, display_name, status, super_admin_slot
            )
            VALUES (
              '71000000-0000-4000-8000-000000000002',
              'slot_duplicate',
              'plain:test',
              'Duplicate',
              'active',
              1
            )
          `,
        ),
        (error: unknown) => (error as { code?: string }).code === "23505",
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO admin_accounts (
              id, login_name, password_hash, display_name, status, super_admin_slot
            )
            VALUES (
              '71000000-0000-4000-8000-000000000003',
              'slot_zero',
              'plain:test',
              'Zero',
              'active',
              0
            )
          `,
        ),
        (error: unknown) => (error as { code?: string }).code === "23514",
      );
    } finally {
      await db.close?.();
    }
  });
});
