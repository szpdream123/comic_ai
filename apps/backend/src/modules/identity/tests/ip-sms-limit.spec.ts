import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestPersistentLoginCode } from "../persistent-auth.service.ts";

describe("ip sms limit", () => {
  it("blocks an eleventh successful send from the same ip within the same day", async () => {
    const sentRows = Array.from({ length: 10 }, (_, index) => ({
      count: index < 10 ? 1 : 0,
    }));
    const recorded: Array<Record<string, unknown>> = [];
    const db = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("FROM sms_send_records") && sql.includes("ip_address_hash")) {
          return { rows: [{ count: 10 }] };
        }
        if (sql.includes("FROM sms_send_records") && sql.includes("ORDER BY created_at DESC")) {
          return { rows: [] };
        }
        if (sql.includes("FROM sms_send_records") && sql.includes("phone_e164")) {
          return { rows: [{ count: 0 }] };
        }
        if (sql.includes("INSERT INTO sms_send_records")) {
          recorded.push({ sql, params });
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO login_challenges")) {
          return { rows: [] };
        }
        throw new Error(`unexpected sql: ${sql}`);
      },
    };

    const result = await requestPersistentLoginCode(db as never, {
      phone: "13800138000",
      now: new Date("2026-06-04T10:00:00.000+08:00"),
      ipAddress: "203.0.113.10",
      smsProvider: {
        providerName: "dev",
        async sendVerificationCode() {
          throw new Error("should not send");
        },
      },
    });

    assert.deepEqual(result, {
      kind: "ip_sms_limit_exceeded",
      retryAfterSeconds: 0,
    });
    assert.equal(recorded.length, 1);
    assert.match(String(recorded[0]?.sql ?? ""), /INSERT INTO sms_send_records/);
  });

  it("records SMS send rows with one placeholder per parameter", async () => {
    const recorded: Array<Record<string, unknown>> = [];
    const db = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("FROM sms_send_records") && sql.includes("ip_address_hash")) {
          return { rows: [{ count: 0 }] };
        }
        if (sql.includes("FROM sms_send_records") && sql.includes("ORDER BY created_at DESC")) {
          return { rows: [] };
        }
        if (sql.includes("FROM sms_send_records") && sql.includes("phone_e164")) {
          return { rows: [{ count: 0 }] };
        }
        if (sql.includes("INSERT INTO login_challenges")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO sms_send_records")) {
          recorded.push({ sql, params });
          return { rows: [] };
        }
        throw new Error(`unexpected sql: ${sql}`);
      },
    };

    const result = await requestPersistentLoginCode(db as never, {
      phone: "13800138000",
      now: new Date("2026-06-04T10:00:00.000+08:00"),
      ipAddress: "203.0.113.10",
      userAgent: "UnitTest/1.0",
      smsProvider: {
        providerName: "dev",
        async sendVerificationCode() {
          return { kind: "sent", providerRequestId: "dev-request-1" };
        },
      },
    });

    assert.equal(result.kind, "sent");
    assert.equal(recorded.length, 1);
    const sql = String(recorded[0]?.sql ?? "");
    const params = recorded[0]?.params as unknown[];
    assert.equal(params.length, 13);
    assert.equal(new Set(sql.match(/\$\d+/g) ?? []).size, params.length);
  });
});
