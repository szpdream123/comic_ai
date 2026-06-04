import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listIndexNames, listTableNames, createMigratedTestDb } from "../test-db.ts";

describe("ensureFoundationSchema", () => {
  it("repairs legacy databases that are missing sms_send_records", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query("DROP TABLE sms_send_records");

      const beforeTables = await listTableNames(db);
      assert.equal(beforeTables.includes("sms_send_records"), false);

      const devDbModule = await import("../dev-db.ts");
      assert.equal(typeof devDbModule.ensureFoundationSchema, "function");

      await devDbModule.ensureFoundationSchema(db);

      const afterTables = await listTableNames(db);
      const indexes = await listIndexNames(db, "sms_send_records");

      assert.equal(afterTables.includes("sms_send_records"), true);
      assert.ok(indexes.includes("sms_send_records_phone_created_idx"));
      assert.ok(indexes.includes("sms_send_records_phone_status_created_idx"));
    } finally {
      await (db as { close?: () => Promise<void> }).close?.();
    }
  });
});
