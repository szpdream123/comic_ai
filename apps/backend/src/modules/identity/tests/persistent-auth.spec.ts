import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createPersistentLoginChallenge,
  findPersistentAuthSessionByToken,
  requestPersistentLoginCode,
  revokePersistentAuthSession,
  verifyPersistentPasswordLogin,
  verifyPersistentLoginChallenge,
} from "../persistent-auth.service.ts";

describe("persistent phone auth", { concurrency: false }, () => {
  it("stores only challenge and session hashes while returning plaintext only to the caller", async () => {
    const db = await createMigratedTestDb();
    try {
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });

      const storedChallenge = await db.query<{
        code_hash: string;
        code_hash_version: number;
        phone_e164: string;
      }>(
        `
          SELECT code_hash, code_hash_version, phone_e164
          FROM login_challenges
          WHERE id = $1
        `,
        [challenge.challengeId],
      );

      assert.equal(challenge.plainCode, "123456");
      assert.equal(storedChallenge.rows[0]?.phone_e164, "+8613800138000");
      assert.equal(storedChallenge.rows[0]?.code_hash_version, 1);
      assert.notEqual(storedChallenge.rows[0]?.code_hash, "123456");

      const verified = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      assert.equal(verified.kind, "verified");
      assert.ok(verified.token);
      assert.ok(verified.session);

      const storedSession = await db.query<{
        session_token_hash: string;
        session_token_hash_version: number;
      }>(
        `
          SELECT session_token_hash, session_token_hash_version
          FROM auth_sessions
          WHERE id = $1
        `,
        [verified.session?.id],
      );

      assert.equal(storedSession.rows[0]?.session_token_hash_version, 1);
      assert.notEqual(storedSession.rows[0]?.session_token_hash, verified.token);
      assert.ok(
        await findPersistentAuthSessionByToken(db, {
          token: verified.token ?? "",
          now: new Date("2026-05-09T10:02:00.000Z"),
        }),
      );
    } finally {
      await db.close();
    }
  });

  it("consumes each challenge at most once", async () => {
    const db = await createMigratedTestDb();
    try {
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });

      const first = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });
      const second = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:02:00.000Z"),
      });

      assert.equal(first.kind, "verified");
      assert.equal(second.kind, "consumed");
    } finally {
      await db.close();
    }
  });

  it("creates only one session when the same challenge is verified concurrently", async () => {
    const db = await createMigratedTestDb();
    try {
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });

      const results = await Promise.all([
        verifyPersistentLoginChallenge(db, {
          challengeId: challenge.challengeId,
          phone: "13800138000",
          code: "123456",
          now: new Date("2026-05-09T10:01:00.000Z"),
        }),
        verifyPersistentLoginChallenge(db, {
          challengeId: challenge.challengeId,
          phone: "13800138000",
          code: "123456",
          now: new Date("2026-05-09T10:01:00.000Z"),
        }),
      ]);
      const sessions = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM auth_sessions",
      );

      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["consumed", "verified"],
      );
      assert.equal(sessions.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("rejects disabled users before creating a session", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES ('00000000-0000-4000-8000-000000000001', '+8613800138000', 'disabled')
        `,
      );
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });

      const result = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });
      const sessions = await db.query("SELECT id FROM auth_sessions");

      assert.equal(result.kind, "user_disabled");
      assert.equal(sessions.rows.length, 0);
    } finally {
      await db.close();
    }
  });

  it("backfills default passwords for existing phone users without a password hash", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES ('00000000-0000-4000-8000-000000000002', '+8618571521874', 'active')
        `,
      );

      const verified = await verifyPersistentPasswordLogin(db, {
        account: "18571521874",
        password: "521874",
        now: new Date("2026-06-11T10:00:00.000Z"),
      });
      const user = await db.query<{ password_hash: string | null }>(
        "SELECT password_hash FROM users WHERE phone_e164 = '+8618571521874'",
      );
      const sessions = await db.query("SELECT id FROM auth_sessions");

      assert.equal(verified.kind, "verified");
      assert.match(user.rows[0]?.password_hash ?? "", /^scrypt:v1:/);
      assert.notEqual(user.rows[0]?.password_hash, "521874");
      assert.equal(sessions.rows.length, 1);
    } finally {
      await db.close();
    }
  });

  it("uses a one-day session when password login is not remembered", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `
          INSERT INTO users (id, phone_e164, status, password_hash)
          VALUES (
            '00000000-0000-4000-8000-000000000003',
            '+8618571521874',
            'active',
            'scrypt:v1:invalid:hash'
          )
        `,
      );

      await db.query(
        "UPDATE users SET password_hash = NULL WHERE phone_e164 = '+8618571521874'",
      );

      const verified = await verifyPersistentPasswordLogin(db, {
        account: "18571521874",
        password: "521874",
        now: new Date("2026-06-11T10:00:00.000Z"),
        remember: false,
      });

      assert.equal(verified.kind, "verified");
      assert.equal(
        verified.kind === "verified" ? verified.session.expiresAt.toISOString() : "",
        "2026-06-12T10:00:00.000Z",
      );
    } finally {
      await db.close();
    }
  });

  it("revokes server-side sessions", async () => {
    const db = await createMigratedTestDb();
    try {
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });
      const verified = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      await revokePersistentAuthSession(db, {
        token: verified.token ?? "",
        now: new Date("2026-05-09T10:02:00.000Z"),
      });

      assert.equal(
        await findPersistentAuthSessionByToken(db, {
          token: verified.token ?? "",
          now: new Date("2026-05-09T10:03:00.000Z"),
        }),
        undefined,
      );
    } finally {
      await db.close();
    }
  });

  it("records successful SMS sends with hashed request metadata", async () => {
    const db = await createMigratedTestDb();
    try {
      const challenge = await requestPersistentLoginCode(db, {
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
      const records = await db.query<{
        status: string;
        phone_e164: string;
        ip_address_hash: string;
        user_agent_hash: string;
        provider_request_id: string;
      }>("SELECT * FROM sms_send_records");

      assert.equal(challenge.kind, "sent");
      assert.equal(records.rows.length, 1);
      assert.equal(records.rows[0]?.status, "sent");
      assert.equal(records.rows[0]?.phone_e164, "+8613800138000");
      assert.notEqual(records.rows[0]?.ip_address_hash, "203.0.113.10");
      assert.notEqual(records.rows[0]?.user_agent_hash, "UnitTest/1.0");
      assert.equal(records.rows[0]?.provider_request_id, "dev-request-1");
    } finally {
      await db.close();
    }
  });

  it("does not count provider failures toward the daily SMS limit", async () => {
    const db = await createMigratedTestDb();
    let attempts = 0;
    try {
      const smsProvider = {
        providerName: "tencent" as const,
        async sendVerificationCode() {
          attempts += 1;
          if (attempts === 1) {
            return { kind: "failed" as const, errorCode: "provider_down" };
          }
          return { kind: "sent" as const, providerRequestId: `sent-${attempts}` };
        },
      };

      const failed = await requestPersistentLoginCode(db, {
        phone: "13800138000",
        now: new Date("2026-06-04T10:00:00.000+08:00"),
        ipAddress: "203.0.113.10",
        smsProvider,
      });
      const firstSent = await requestPersistentLoginCode(db, {
        phone: "13800138000",
        now: new Date("2026-06-04T10:01:01.000+08:00"),
        ipAddress: "203.0.113.10",
        smsProvider,
      });
      const secondSent = await requestPersistentLoginCode(db, {
        phone: "13800138000",
        now: new Date("2026-06-04T10:02:02.000+08:00"),
        ipAddress: "203.0.113.10",
        smsProvider,
      });
      const thirdSent = await requestPersistentLoginCode(db, {
        phone: "13800138000",
        now: new Date("2026-06-04T10:03:03.000+08:00"),
        ipAddress: "203.0.113.10",
        smsProvider,
      });

      assert.equal(failed.kind, "sms_send_failed");
      assert.equal(firstSent.kind, "sent");
      assert.equal(secondSent.kind, "sent");
      assert.equal(thirdSent.kind, "sent");
    } finally {
      await db.close();
    }
  });

  it("limits each phone to three successful SMS sends per Shanghai day", async () => {
    const db = await createMigratedTestDb();
    try {
      const smsProvider = {
        providerName: "dev" as const,
        async sendVerificationCode() {
          return { kind: "sent" as const, providerRequestId: "dev" };
        },
      };

      for (const now of [
        "2026-06-04T10:00:00.000+08:00",
        "2026-06-04T10:01:01.000+08:00",
        "2026-06-04T10:02:02.000+08:00",
      ]) {
        const result = await requestPersistentLoginCode(db, {
          phone: "13800138000",
          now: new Date(now),
          ipAddress: "203.0.113.10",
          smsProvider,
        });
        assert.equal(result.kind, "sent");
      }

      const limited = await requestPersistentLoginCode(db, {
        phone: "13800138000",
        now: new Date("2026-06-04T10:03:03.000+08:00"),
        ipAddress: "203.0.113.10",
        smsProvider,
      });

      assert.deepEqual(limited, {
        kind: "daily_sms_limit_exceeded",
        retryAfterSeconds: 0,
      });
    } finally {
      await db.close();
    }
  });

  it("rejects another SMS request within 60 seconds after a successful send", async () => {
    const db = await createMigratedTestDb();
    try {
      const smsProvider = {
        providerName: "dev" as const,
        async sendVerificationCode() {
          return { kind: "sent" as const, providerRequestId: "dev" };
        },
      };

      await requestPersistentLoginCode(db, {
        phone: "13800138000",
        now: new Date("2026-06-04T10:00:00.000+08:00"),
        ipAddress: "203.0.113.10",
        smsProvider,
      });
      const limited = await requestPersistentLoginCode(db, {
        phone: "13800138000",
        now: new Date("2026-06-04T10:00:30.000+08:00"),
        ipAddress: "203.0.113.10",
        smsProvider,
      });

      assert.deepEqual(limited, {
        kind: "sms_cooldown_active",
        retryAfterSeconds: 30,
      });
    } finally {
      await db.close();
    }
  });
});
