import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestPersistentLoginCode } from "../persistent-auth.service.ts";

describe("ip sms limit", () => {
  it("blocks a seventh successful send from the same ip within the same day", async () => {
    const sentRows = Array.from({ length: 6 }, (_, index) => ({
      count: index < 6 ? 1 : 0,
    }));
    const recorded: Array<Record<string, unknown>> = [];
    const db = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("FROM sms_send_records") && sql.includes("ip_address_hash")) {
          return { rows: [{ count: 6 }] };
        }
        if (sql.includes("FROM sms_send_records") && sql.includes("phone_e164")) {
          return { rows: [{ count: 0 }] };
        }
        if (sql.includes("FROM sms_send_records") && sql.includes("ORDER BY created_at DESC")) {
          return { rows: [] };
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
});
