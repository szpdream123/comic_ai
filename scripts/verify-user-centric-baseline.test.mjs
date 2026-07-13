import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertSchemaOnlySql,
  findFirstDifference,
  fingerprintSnapshot,
} from "./verify-user-centric-baseline.mjs";

describe("user-centric baseline verifier", () => {
  it("accepts schema DDL including foreign-key delete actions", () => {
    assert.doesNotThrow(() => {
      assertSchemaOnlySql(`
        CREATE TABLE users (id uuid PRIMARY KEY);
        CREATE TABLE projects (
          id uuid PRIMARY KEY,
          owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT
        );
        CREATE FUNCTION generate_code() RETURNS text LANGUAGE plpgsql AS $function$
        BEGIN
          INSERT INTO audit_log (event_type) VALUES ('generated');
          RETURN 'CODE';
        END;
        $function$;
      `);
    });
  });

  it("rejects data, environment, transaction, and legacy-scope statements", () => {
    for (const sql of [
      "INSERT INTO users (id) VALUES ('00000000-0000-0000-0000-000000000000');",
      "COPY users FROM STDIN;",
      "BEGIN; CREATE TABLE users (id uuid); COMMIT;",
      "CREATE SCHEMA private;",
      "ALTER TABLE users OWNER TO app_owner;",
      "CREATE TABLE legacy_items (organization" + "_id uuid);",
      "CREATE TABLE legacy_items (workspace" + "Id uuid);",
    ]) {
      assert.throws(() => assertSchemaOnlySql(sql));
    }
  });

  it("produces stable fingerprints and identifies the first changed section", () => {
    const source = {
      tables: [{ table_name: "users" }],
      columns: [{ table_name: "users", column_name: "id", data_type: "uuid" }],
    };
    const same = structuredClone(source);
    const changed = structuredClone(source);
    changed.columns[0].data_type = "text";

    assert.equal(fingerprintSnapshot(source), fingerprintSnapshot(same));
    assert.notEqual(fingerprintSnapshot(source), fingerprintSnapshot(changed));
    assert.equal(findFirstDifference(source, same), null);
    assert.deepEqual(findFirstDifference(source, changed), {
      section: "columns[0]",
      source: '{"table_name":"users","column_name":"id","data_type":"uuid"}',
      target: '{"table_name":"users","column_name":"id","data_type":"text"}',
    });
  });
});
