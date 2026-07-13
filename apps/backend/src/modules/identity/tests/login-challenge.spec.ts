import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createLoginChallenge,
  verifyLoginChallengeCode,
} from "../login-challenge.service.ts";
import { loadCurrentSchemaSql } from "../../shared/db/migrations.ts";
import {
  createMigratedTestDb,
  listColumnNames,
  listIndexNames,
  listTableNames,
} from "../../shared/db/test-db.ts";

describe("login challenge schema assumptions", () => {
  it("keeps phone auth tables and relaxed user email requirements in the current schema", async () => {
    const sql = await loadCurrentSchemaSql();

    assert.match(sql, /CREATE TABLE IF NOT EXISTS "login_challenges" \(/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "auth_sessions" \(/);
    assert.match(sql, /users_phone_e164_format_check[^\n]+\^1\[0-9\]\{10\}\$/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "users" \([\s\S]+?"email" text,/);
    assert.doesNotMatch(sql, /"email" text NOT NULL/);
  });

  it("adds SMS send records for provider delivery auditing", async () => {
    const db = await createMigratedTestDb();
    try {
      const tables = await listTableNames(db);
      const columns = await listColumnNames(db, "sms_send_records");
      const indexes = await listIndexNames(db, "sms_send_records");

      assert.ok(tables.includes("sms_send_records"));
      assert.deepEqual([...columns].sort(), [
        "id",
        "phone_e164",
        "challenge_id",
        "verification_code",
        "sms_content",
        "provider",
        "status",
        "ip_address",
        "ip_address_hash",
        "user_agent_hash",
        "provider_request_id",
        "error_code",
        "created_at",
      ].sort());
      assert.ok(indexes.includes("sms_send_records_phone_created_idx"));
      assert.ok(indexes.includes("sms_send_records_phone_status_created_idx"));
      assert.ok(indexes.includes("sms_send_records_ip_created_idx"));
    } finally {
      await db.close();
    }
  });
});

describe("login challenges", () => {
  it("normalizes mainland phones to 11-digit storage format", async () => {
    const challenge = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    assert.equal(challenge.phoneE164, "13800138000");
    assert.equal(challenge.status, "issued");
  });

  it("stores only a hash and verifies a valid code", async () => {
    const challenge = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
      code: "123456",
    });

    assert.notEqual(challenge.codeHash, "123456");
    assert.equal(
      verifyLoginChallengeCode({
        challenge,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      }).kind,
      "verified",
    );
  });

  it("binds code hashes to the challenge id and records the hash version", async () => {
    const first = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
      code: "123456",
    });
    const second = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
      code: "123456",
    });

    assert.equal(first.codeHashVersion, 1);
    assert.equal(second.codeHashVersion, 1);
    assert.notEqual(first.codeHash, second.codeHash);
  });

  it("locks the challenge after too many invalid attempts", async () => {
    const challenge = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
      code: "123456",
      maxAttempts: 2,
    });

    const firstFailure = verifyLoginChallengeCode({
      challenge,
      phone: "13800138000",
      code: "000000",
      now: new Date("2026-05-09T10:01:00.000Z"),
    });
    const secondFailure = verifyLoginChallengeCode({
      challenge: firstFailure.challenge,
      phone: "13800138000",
      code: "000000",
      now: new Date("2026-05-09T10:02:00.000Z"),
    });

    assert.equal(firstFailure.kind, "invalid_code");
    assert.equal(secondFailure.kind, "locked");
    assert.equal(secondFailure.challenge.status, "locked");
  });
});
