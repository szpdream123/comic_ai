# Tencent SMS Phone Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing phone verification login flow to Tencent Cloud SMS, enforce 3 successful sends per phone per day plus a 60-second resend cooldown, record request IP metadata, and issue 30-day sessions.

**Architecture:** Keep the existing `identity` module and add a focused SMS delivery boundary plus persisted send records. `persistent-auth.service.ts` remains the orchestration point for challenge creation and verification, while `phone-auth-dev-server.ts` remains the HTTP entrypoint that extracts request metadata and sets cookies.

**Tech Stack:** TypeScript, Node test runner, PostgreSQL-backed SQL migrations, Tencent Cloud SMS SDK package `tencentcloud-sdk-nodejs-sms`, static HTML/CSS/JS login page.

---

## File Structure

- Modify: `packages/db/migrations/0001_foundation.sql`
  Adds `sms_send_records` and indexes.
- Modify: `apps/backend/src/modules/identity/phone-auth.utils.ts`
  Adds metadata hashing helper and Shanghai day-window helper.
- Create: `apps/backend/src/modules/identity/sms-provider.ts`
  Defines `SmsProvider`, `DevSmsProvider`, and `TencentSmsProvider`.
- Modify: `apps/backend/src/modules/identity/persistent-auth.service.ts`
  Adds send-limit checks, SMS send record persistence, provider invocation, and challenge revocation on failed delivery.
- Modify: `apps/backend/src/modules/identity/session.service.ts`
  Changes default session TTL to 30 days.
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
  Wires request-code route to SMS orchestration, extracts IP/user agent, sets 30-day cookie max age, and builds provider from environment.
- Modify: `.env.example`
  Adds Tencent SMS settings with Chinese comments and empty secret placeholders.
- Modify: `.env`
  Adds the same Tencent SMS comment block for local configuration, without real credential values.
- Modify: `package.json` and `package-lock.json`
  Adds `tencentcloud-sdk-nodejs-sms`.
- Modify: `apps/web/login.js`
  Maps new backend errors to Chinese UI copy and reflects cooldown.
- Test: `apps/backend/src/modules/identity/tests/persistent-auth.spec.ts`
  Covers SMS send records, daily limit, cooldown, provider failure, metadata hashing, and 30-day session expiry.
- Test: `apps/backend/src/modules/identity/tests/session.spec.ts`
  Covers default session TTL.
- Test: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
  Covers route response, cookie max age, and dev provider behavior.
- Test: `apps/web/tests/login-page.spec.ts`
  Covers frontend error-copy mappings.

## Task 1: Add SMS Send Record Schema

**Files:**
- Modify: `packages/db/migrations/0001_foundation.sql`
- Test: `apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

- [ ] **Step 1: Write the failing schema test**

Add imports and a schema assertion to `apps/backend/src/modules/identity/tests/login-challenge.spec.ts`:

```ts
import {
  createMigratedTestDb,
  listColumnNames,
  listIndexNames,
  listTableNames,
} from "../../shared/db/test-db.ts";
```

Add this test inside `describe("login challenge schema assumptions", () => { ... })`:

```ts
  it("adds SMS send records for provider delivery auditing", async () => {
    const db = await createMigratedTestDb();
    try {
      const tables = await listTableNames(db);
      const columns = await listColumnNames(db, "sms_send_records");
      const indexes = await listIndexNames(db, "sms_send_records");

      assert.ok(tables.includes("sms_send_records"));
      assert.deepEqual(columns, [
        "id",
        "phone_e164",
        "challenge_id",
        "provider",
        "status",
        "ip_address_hash",
        "user_agent_hash",
        "provider_request_id",
        "error_code",
        "created_at",
      ]);
      assert.ok(indexes.includes("sms_send_records_phone_created_idx"));
      assert.ok(indexes.includes("sms_send_records_phone_status_created_idx"));
    } finally {
      await db.close();
    }
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts
```

Expected: FAIL because `sms_send_records` does not exist.

- [ ] **Step 3: Add the schema**

Insert this SQL after the existing `auth_sessions` table in `packages/db/migrations/0001_foundation.sql`:

```sql
CREATE TABLE sms_send_records (
  id uuid PRIMARY KEY,
  phone_e164 text NOT NULL,
  challenge_id uuid NULL REFERENCES login_challenges(id),
  provider text NOT NULL CHECK (provider IN ('tencent', 'dev')),
  status text NOT NULL CHECK (
    status IN ('requested', 'sent', 'failed', 'rate_limited')
  ),
  ip_address_hash text NULL,
  user_agent_hash text NULL,
  provider_request_id text NULL,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sms_send_records_phone_created_idx
  ON sms_send_records (phone_e164, created_at DESC);

CREATE INDEX sms_send_records_phone_status_created_idx
  ON sms_send_records (phone_e164, status, created_at DESC);
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0001_foundation.sql apps/backend/src/modules/identity/tests/login-challenge.spec.ts
git commit -m "feat: add sms send records schema"
```

## Task 2: Add SMS Provider Boundary

**Files:**
- Create: `apps/backend/src/modules/identity/sms-provider.ts`
- Test: `apps/backend/src/modules/identity/tests/sms-provider.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install Tencent SMS SDK**

Run:

```bash
npm install tencentcloud-sdk-nodejs-sms
```

Expected: `package.json` and `package-lock.json` include `tencentcloud-sdk-nodejs-sms`.

- [ ] **Step 2: Write provider tests**

Create `apps/backend/src/modules/identity/tests/sms-provider.spec.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSmsProviderFromEnv,
  DevSmsProvider,
  type TencentSmsClientLike,
  TencentSmsProvider,
} from "../sms-provider.ts";

describe("SMS providers", () => {
  it("uses the dev provider when Tencent SMS is disabled", async () => {
    const provider = createSmsProviderFromEnv({
      TENCENT_SMS_ENABLED: "false",
    });

    assert.ok(provider instanceof DevSmsProvider);
    assert.deepEqual(
      await provider.sendVerificationCode({
        phoneE164: "+8613800138000",
        code: "123456",
        expiresInMinutes: 5,
      }),
      { kind: "sent", providerRequestId: "dev" },
    );
  });

  it("maps Tencent success responses to sent", async () => {
    const calls: unknown[] = [];
    const client: TencentSmsClientLike = {
      async SendSms(input) {
        calls.push(input);
        return {
          SendStatusSet: [{ Code: "Ok", SerialNo: "serial-1" }],
          RequestId: "request-1",
        };
      },
    };
    const provider = new TencentSmsProvider({
      client,
      sdkAppId: "1400000000",
      signName: "漫剧AI",
      templateId: "123456",
    });

    const result = await provider.sendVerificationCode({
      phoneE164: "+8613800138000",
      code: "654321",
      expiresInMinutes: 5,
    });

    assert.deepEqual(result, {
      kind: "sent",
      providerRequestId: "serial-1",
    });
    assert.deepEqual(calls, [
      {
        PhoneNumberSet: ["+8613800138000"],
        SmsSdkAppId: "1400000000",
        SignName: "漫剧AI",
        TemplateId: "123456",
        TemplateParamSet: ["654321", "5"],
      },
    ]);
  });

  it("maps Tencent non-Ok responses to failed", async () => {
    const client: TencentSmsClientLike = {
      async SendSms() {
        return {
          SendStatusSet: [{ Code: "FailedOperation.SignatureIncorrectOrUnapproved" }],
          RequestId: "request-2",
        };
      },
    };
    const provider = new TencentSmsProvider({
      client,
      sdkAppId: "1400000000",
      signName: "漫剧AI",
      templateId: "123456",
    });

    assert.deepEqual(
      await provider.sendVerificationCode({
        phoneE164: "+8613800138000",
        code: "654321",
        expiresInMinutes: 5,
      }),
      {
        kind: "failed",
        errorCode: "FailedOperation.SignatureIncorrectOrUnapproved",
        message: "request-2",
      },
    );
  });
});
```

- [ ] **Step 3: Run provider tests and verify they fail**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/sms-provider.spec.ts
```

Expected: FAIL because `sms-provider.ts` does not exist.

- [ ] **Step 4: Implement provider boundary**

Create `apps/backend/src/modules/identity/sms-provider.ts`:

```ts
export interface SmsProvider {
  providerName: "tencent" | "dev";
  sendVerificationCode(input: {
    phoneE164: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<
    | { kind: "sent"; providerRequestId?: string }
    | { kind: "failed"; errorCode: string; message?: string }
  >;
}

export class DevSmsProvider implements SmsProvider {
  providerName = "dev" as const;

  async sendVerificationCode() {
    return { kind: "sent" as const, providerRequestId: "dev" };
  }
}

export interface TencentSmsClientLike {
  SendSms(input: {
    PhoneNumberSet: string[];
    SmsSdkAppId: string;
    SignName: string;
    TemplateId: string;
    TemplateParamSet: string[];
  }): Promise<{
    SendStatusSet?: Array<{ Code?: string; Message?: string; SerialNo?: string }>;
    RequestId?: string;
  }>;
}

export class TencentSmsProvider implements SmsProvider {
  providerName = "tencent" as const;

  constructor(
    private readonly options: {
      client: TencentSmsClientLike;
      sdkAppId: string;
      signName: string;
      templateId: string;
    },
  ) {}

  async sendVerificationCode(input: {
    phoneE164: string;
    code: string;
    expiresInMinutes: number;
  }) {
    try {
      const response = await this.options.client.SendSms({
        PhoneNumberSet: [input.phoneE164],
        SmsSdkAppId: this.options.sdkAppId,
        SignName: this.options.signName,
        TemplateId: this.options.templateId,
        TemplateParamSet: [input.code, String(input.expiresInMinutes)],
      });
      const status = response.SendStatusSet?.[0];
      if (status?.Code === "Ok") {
        return {
          kind: "sent" as const,
          providerRequestId: status.SerialNo ?? response.RequestId,
        };
      }
      return {
        kind: "failed" as const,
        errorCode: status?.Code ?? "tencent_sms_unknown",
        message: status?.Message ?? response.RequestId,
      };
    } catch (error) {
      return {
        kind: "failed" as const,
        errorCode: "tencent_sms_exception",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function createSmsProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SmsProvider {
  if (env.TENCENT_SMS_ENABLED !== "true") {
    return new DevSmsProvider();
  }

  const required = [
    "TENCENT_SMS_SECRET_ID",
    "TENCENT_SMS_SECRET_KEY",
    "TENCENT_SMS_SDK_APP_ID",
    "TENCENT_SMS_SIGN_NAME",
    "TENCENT_SMS_TEMPLATE_ID",
  ] as const;
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`missing_env:${key}`);
    }
  }

  const sms = requireTencentSmsSdk();
  const client = new sms.v20210111.Client({
    credential: {
      secretId: env.TENCENT_SMS_SECRET_ID,
      secretKey: env.TENCENT_SMS_SECRET_KEY,
    },
    region: env.TENCENT_SMS_REGION ?? "ap-guangzhou",
    profile: {
      httpProfile: {
        endpoint: "sms.tencentcloudapi.com",
      },
    },
  }) as TencentSmsClientLike;

  return new TencentSmsProvider({
    client,
    sdkAppId: env.TENCENT_SMS_SDK_APP_ID!,
    signName: env.TENCENT_SMS_SIGN_NAME!,
    templateId: env.TENCENT_SMS_TEMPLATE_ID!,
  });
}

function requireTencentSmsSdk() {
  return require("tencentcloud-sdk-nodejs-sms");
}
```

- [ ] **Step 5: Run provider tests and verify they pass**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/sms-provider.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json apps/backend/src/modules/identity/sms-provider.ts apps/backend/src/modules/identity/tests/sms-provider.spec.ts
git commit -m "feat: add tencent sms provider"
```

## Task 3: Persist SMS Request Limits and Delivery Outcomes

**Files:**
- Modify: `apps/backend/src/modules/identity/phone-auth.utils.ts`
- Modify: `apps/backend/src/modules/identity/persistent-auth.service.ts`
- Test: `apps/backend/src/modules/identity/tests/persistent-auth.spec.ts`

- [ ] **Step 1: Write failing persistent auth tests**

Append to `apps/backend/src/modules/identity/tests/persistent-auth.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run persistent auth tests and verify they fail**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/persistent-auth.spec.ts
```

Expected: FAIL because `requestPersistentLoginCode` does not exist.

- [ ] **Step 3: Add utility helpers**

Add to `apps/backend/src/modules/identity/phone-auth.utils.ts`:

```ts
export function hashRequestMetadata(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? hmacSha256(`request-metadata:${trimmed}`) : null;
}

export function shanghaiDayWindow(now: Date): { start: Date; end: Date } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const date = formatter.format(now);
  const start = new Date(`${date}T00:00:00.000+08:00`);
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}
```

- [ ] **Step 4: Implement request orchestration**

In `apps/backend/src/modules/identity/persistent-auth.service.ts`, import:

```ts
import type { SmsProvider } from "./sms-provider.ts";
import { hashRequestMetadata, shanghaiDayWindow } from "./phone-auth.utils.ts";
```

Add result type and function:

```ts
export type PersistentLoginCodeRequestResult =
  | {
      kind: "sent";
      challengeId: string;
      phoneE164: string;
      plainCode: string;
      expiresAt: Date;
      retryAfterSeconds: number;
      remainingToday: number;
    }
  | { kind: "sms_cooldown_active"; retryAfterSeconds: number }
  | { kind: "daily_sms_limit_exceeded"; retryAfterSeconds: 0 }
  | { kind: "sms_send_failed"; errorCode: string };

export async function requestPersistentLoginCode(
  db: SqlDatabase,
  input: {
    phone: string;
    now: Date;
    ipAddress?: string;
    userAgent?: string;
    code?: string;
    smsProvider: SmsProvider;
  },
): Promise<PersistentLoginCodeRequestResult> {
  const phoneE164 = normalizeCnPhone(input.phone);
  const day = shanghaiDayWindow(input.now);
  const sentToday = await queryOne<{ count: number }>(
    db,
    `
      SELECT count(*)::int AS count
      FROM sms_send_records
      WHERE phone_e164 = $1
        AND status = 'sent'
        AND created_at >= $2
        AND created_at < $3
    `,
    [phoneE164, day.start, day.end],
  );

  if ((sentToday?.count ?? 0) >= 3) {
    await recordSmsSend(db, {
      phoneE164,
      provider: input.smsProvider.providerName,
      status: "rate_limited",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      errorCode: "daily_sms_limit_exceeded",
      now: input.now,
    });
    return { kind: "daily_sms_limit_exceeded", retryAfterSeconds: 0 };
  }

  const latestSent = await queryOne<{ created_at: Date }>(
    db,
    `
      SELECT created_at
      FROM sms_send_records
      WHERE phone_e164 = $1
        AND status = 'sent'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [phoneE164],
  );
  if (latestSent) {
    const elapsedSeconds = Math.floor(
      (input.now.getTime() - latestSent.created_at.getTime()) / 1000,
    );
    if (elapsedSeconds < 60) {
      const retryAfterSeconds = 60 - elapsedSeconds;
      await recordSmsSend(db, {
        phoneE164,
        provider: input.smsProvider.providerName,
        status: "rate_limited",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        errorCode: "sms_cooldown_active",
        now: input.now,
      });
      return { kind: "sms_cooldown_active", retryAfterSeconds };
    }
  }

  const challenge = await createPersistentLoginChallenge(db, {
    phone: input.phone,
    now: input.now,
    code: input.code,
  });
  const sent = await input.smsProvider.sendVerificationCode({
    phoneE164: challenge.phoneE164,
    code: challenge.plainCode,
    expiresInMinutes: 5,
  });

  if (sent.kind === "failed") {
    await db.query(
      `
        UPDATE login_challenges
        SET status = 'revoked',
            revoked_at = $2,
            updated_at = $2
        WHERE id = $1
      `,
      [challenge.challengeId, input.now],
    );
    await recordSmsSend(db, {
      phoneE164,
      challengeId: challenge.challengeId,
      provider: input.smsProvider.providerName,
      status: "failed",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      errorCode: sent.errorCode,
      now: input.now,
    });
    return { kind: "sms_send_failed", errorCode: sent.errorCode };
  }

  await recordSmsSend(db, {
    phoneE164,
    challengeId: challenge.challengeId,
    provider: input.smsProvider.providerName,
    status: "sent",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    providerRequestId: sent.providerRequestId,
    now: input.now,
  });

  return {
    kind: "sent",
    challengeId: challenge.challengeId,
    phoneE164: challenge.phoneE164,
    plainCode: challenge.plainCode,
    expiresAt: challenge.expiresAt,
    retryAfterSeconds: 60,
    remainingToday: Math.max(0, 3 - ((sentToday?.count ?? 0) + 1)),
  };
}
```

Add helper:

```ts
async function recordSmsSend(
  db: SqlDatabase,
  input: {
    phoneE164: string;
    challengeId?: string;
    provider: "tencent" | "dev";
    status: "sent" | "failed" | "rate_limited";
    ipAddress?: string;
    userAgent?: string;
    providerRequestId?: string;
    errorCode?: string;
    now: Date;
  },
): Promise<void> {
  await db.query(
    `
      INSERT INTO sms_send_records (
        id,
        phone_e164,
        challenge_id,
        provider,
        status,
        ip_address_hash,
        user_agent_hash,
        provider_request_id,
        error_code,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      randomUUID(),
      input.phoneE164,
      input.challengeId ?? null,
      input.provider,
      input.status,
      hashRequestMetadata(input.ipAddress),
      hashRequestMetadata(input.userAgent),
      input.providerRequestId ?? null,
      input.errorCode ?? null,
      input.now,
    ],
  );
}
```

- [ ] **Step 5: Run persistent auth tests and verify they pass**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/persistent-auth.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/identity/phone-auth.utils.ts apps/backend/src/modules/identity/persistent-auth.service.ts apps/backend/src/modules/identity/tests/persistent-auth.spec.ts
git commit -m "feat: enforce sms send limits"
```

## Task 4: Wire SMS Requests Through the Dev Server

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Test: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] **Step 1: Write failing HTTP tests**

Add this test near the existing auth flow tests:

```ts
  it("returns SMS send metadata and records cooldown through the auth request route", async () => {
    const server = createPhoneAuthDevServer();
    try {
      await server.listen(0);

      const firstResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "UnitTest/1.0",
          "x-forwarded-for": "203.0.113.20",
        },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const first = await firstResponse.json();
      const secondResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "UnitTest/1.0",
          "x-forwarded-for": "203.0.113.20",
        },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const second = await secondResponse.json();

      assert.equal(firstResponse.status, 200);
      assert.equal(first.remainingToday, 2);
      assert.equal(secondResponse.status, 429);
      assert.equal(second.error, "sms_cooldown_active");
      assert.equal(typeof second.retryAfterSeconds, "number");
    } finally {
      await server.close();
    }
  });
```

- [ ] **Step 2: Run HTTP tests and verify they fail**

Run:

```bash
npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: FAIL because the route still calls `createPersistentLoginChallenge` directly.

- [ ] **Step 3: Update imports and provider construction**

In `apps/backend/src/entrypoints/phone-auth-dev-server.ts`, replace the `createPersistentLoginChallenge` import with `requestPersistentLoginCode`, and add:

```ts
import { createSmsProviderFromEnv } from "../modules/identity/sms-provider.ts";
```

Near `const debugChallengeCodes = new Map<string, string>();`, add:

```ts
  const smsProvider = createSmsProviderFromEnv();
```

Add helper near cookie helpers:

```ts
function requestIpAddress(request: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(",")[0]?.trim() || request.socket?.remoteAddress;
}
```

- [ ] **Step 4: Replace request-code route implementation**

Replace the `/api/auth/code/request` block with:

```ts
      if (request.method === "POST" && pathname === "/api/auth/code/request") {
        const body = (await readJsonBody(request)) as { phone: string };
        const result = await requestPersistentLoginCode(db, {
          phone: body.phone,
          now: new Date(),
          ipAddress: requestIpAddress(request),
          userAgent: String(request.headers["user-agent"] ?? ""),
          smsProvider,
        });

        if (result.kind !== "sent") {
          return writeJson(response, {
            status:
              result.kind === "sms_send_failed"
                ? 502
                : 429,
            body: {
              error: result.kind,
              retryAfterSeconds:
                "retryAfterSeconds" in result ? result.retryAfterSeconds : 60,
            },
          });
        }

        debugChallengeCodes.set(result.challengeId, result.plainCode);
        return writeJson(response, {
          status: 200,
          body: {
            challengeId: result.challengeId,
            maskedPhone: maskCnPhone(result.phoneE164),
            expiresAt: result.expiresAt.toISOString(),
            retryAfterSeconds: result.retryAfterSeconds,
            remainingToday: result.remainingToday,
          },
        });
      }
```

- [ ] **Step 5: Run HTTP tests and verify they pass**

Run:

```bash
npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/entrypoints/phone-auth-dev-server.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
git commit -m "feat: route phone codes through sms provider"
```

## Task 5: Extend Sessions and Cookies to 30 Days

**Files:**
- Modify: `apps/backend/src/modules/identity/session.service.ts`
- Modify: `apps/backend/src/modules/identity/tests/session.spec.ts`
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] **Step 1: Write failing session TTL test**

Add to `apps/backend/src/modules/identity/tests/session.spec.ts`:

```ts
  it("uses a 30-day default session TTL", async () => {
    const now = new Date("2026-06-04T10:00:00.000Z");
    const created = await createAuthSession({
      userId: "user_1",
      now,
      token: "plain-token",
    });

    assert.equal(
      created.session.expiresAt.toISOString(),
      "2026-07-04T10:00:00.000Z",
    );
    assert.equal(
      verifySessionToken(
        created.session,
        "plain-token",
        new Date("2026-07-04T09:59:59.000Z"),
      ),
      true,
    );
    assert.equal(
      verifySessionToken(
        created.session,
        "plain-token",
        new Date("2026-07-04T10:00:00.000Z"),
      ),
      false,
    );
  });
```

- [ ] **Step 2: Write failing cookie max-age assertion**

In the existing `supports the full request -> debug -> verify -> session flow` test, add:

```ts
      assert.match(cookie, /Max-Age=2592000/);
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/session.spec.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: FAIL because default TTL and cookie max age are still 7 days/no max age.

- [ ] **Step 4: Update session TTL**

In `apps/backend/src/modules/identity/session.service.ts`, replace:

```ts
  const ttlMs = input.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
```

with:

```ts
  const ttlMs = input.ttlMs ?? 30 * 24 * 60 * 60 * 1000;
```

- [ ] **Step 5: Update session cookie**

In `apps/backend/src/entrypoints/phone-auth-dev-server.ts`, replace:

```ts
function sessionCookie(token: string): string {
  return `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax`;
}
```

with:

```ts
const sessionCookieMaxAgeSeconds = 30 * 24 * 60 * 60;

function sessionCookie(token: string): string {
  return `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionCookieMaxAgeSeconds}`;
}
```

- [ ] **Step 6: Run focused tests and verify they pass**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/session.spec.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/identity/session.service.ts apps/backend/src/modules/identity/tests/session.spec.ts apps/backend/src/entrypoints/phone-auth-dev-server.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
git commit -m "feat: extend phone auth sessions to 30 days"
```

## Task 6: Add Tencent SMS Environment Configuration

**Files:**
- Modify: `.env.example`
- Modify: `.env`
- Test: `apps/backend/src/modules/identity/tests/sms-provider.spec.ts`

- [ ] **Step 1: Add env documentation assertions**

Add to `apps/backend/src/modules/identity/tests/sms-provider.spec.ts`:

```ts
import { readFile } from "node:fs/promises";
```

Add this test:

```ts
  it("documents Tencent SMS environment variables with Chinese comments", async () => {
    const example = await readFile(
      new URL("../../../../../../.env.example", import.meta.url),
      "utf8",
    );

    assert.match(example, /腾讯云短信：是否启用真实短信发送/);
    assert.match(example, /TENCENT_SMS_ENABLED=false/);
    assert.match(example, /TENCENT_SMS_SECRET_ID=/);
    assert.match(example, /TENCENT_SMS_SECRET_KEY=/);
    assert.match(example, /TENCENT_SMS_SDK_APP_ID=/);
    assert.match(example, /TENCENT_SMS_SIGN_NAME=/);
    assert.match(example, /TENCENT_SMS_TEMPLATE_ID=/);
    assert.match(example, /TENCENT_SMS_REGION=ap-guangzhou/);
  });
```

- [ ] **Step 2: Run provider tests and verify they fail**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/sms-provider.spec.ts
```

Expected: FAIL because `.env.example` does not document Tencent SMS yet.

- [ ] **Step 3: Add Chinese-commented env block**

Append this block to `.env.example`, and also append it to local `.env` with empty secret values:

```env
# 腾讯云短信：是否启用真实短信发送。false 时使用本地开发调试验证码
TENCENT_SMS_ENABLED=false

# 腾讯云短信：SecretId，请在腾讯云访问管理 CAM 中创建
TENCENT_SMS_SECRET_ID=

# 腾讯云短信：SecretKey，只能写入本地 .env，禁止提交到仓库
TENCENT_SMS_SECRET_KEY=

# 腾讯云短信：短信应用 SDK AppID
TENCENT_SMS_SDK_APP_ID=

# 腾讯云短信：短信签名名称，例如「漫剧AI」
TENCENT_SMS_SIGN_NAME=

# 腾讯云短信：验证码模板 ID，模板变量建议为 {1}=验证码，{2}=有效分钟数
TENCENT_SMS_TEMPLATE_ID=

# 腾讯云短信：发送区域，中国大陆默认 ap-guangzhou
TENCENT_SMS_REGION=ap-guangzhou
```

- [ ] **Step 4: Run provider tests and verify they pass**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/sms-provider.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit tracked env example**

Do not commit `.env`.

```bash
git add .env.example apps/backend/src/modules/identity/tests/sms-provider.spec.ts
git commit -m "docs: add tencent sms env configuration"
```

## Task 7: Update Login Page Error Copy and Cooldown Feedback

**Files:**
- Modify: `apps/web/login.js`
- Test: `apps/web/tests/login-page.spec.ts`

- [ ] **Step 1: Write failing login page tests**

Add to `apps/web/tests/login-page.spec.ts`:

```ts
  it("maps SMS delivery and limit errors to Chinese copy", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");

    assert.match(js, /sms_cooldown_active/);
    assert.match(js, /验证码已发送，请稍后再试/);
    assert.match(js, /daily_sms_limit_exceeded/);
    assert.match(js, /今日验证码发送次数已达上限，请明天再试/);
    assert.match(js, /sms_send_failed/);
    assert.match(js, /短信发送失败，请稍后再试/);
  });
```

- [ ] **Step 2: Run login page tests and verify they fail**

Run:

```bash
npm test -- apps/web/tests/login-page.spec.ts
```

Expected: FAIL because the current JS displays raw error codes for the new SMS errors.

- [ ] **Step 3: Add error-copy mapping and cooldown status**

In `apps/web/login.js`, add near `setStatus`:

```js
const errorCopy = {
  invalid_phone: "请输入正确的中国大陆手机号",
  sms_cooldown_active: "验证码已发送，请稍后再试",
  daily_sms_limit_exceeded: "今日验证码发送次数已达上限，请明天再试",
  sms_send_failed: "短信发送失败，请稍后再试",
  code_invalid: "验证码不正确",
  challenge_expired: "验证码已过期，请重新获取",
  verify_locked: "尝试次数过多，请重新获取验证码",
};

function authErrorMessage(payload, fallback) {
  return errorCopy[payload?.error] ?? fallback;
}
```

In the request-code error branch, replace raw error display with:

```js
    setStatus(authErrorMessage(requestPayload, "验证码请求失败"));
```

In the verify error branch, replace raw error display with:

```js
    setStatus(authErrorMessage(verifyPayload, "登录失败"));
```

After successful request, include daily remaining if present:

```js
  const remainingText =
    typeof requestPayload.remainingToday === "number"
      ? `，今日还可发送 ${requestPayload.remainingToday} 次`
      : "";
  setStatus(`验证码已发送至 ${requestPayload.maskedPhone}${remainingText}`);
```

- [ ] **Step 4: Run login page tests and verify they pass**

Run:

```bash
npm test -- apps/web/tests/login-page.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/login.js apps/web/tests/login-page.spec.ts
git commit -m "feat: show sms auth errors in login page"
```

## Task 8: Full Verification

**Files:**
- No new code files.

- [ ] **Step 1: Run identity and login tests**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests apps/web/tests/login-page.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run dev server auth test**

Run:

```bash
npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run full test suite if runtime permits**

Run:

```bash
npm test
```

Expected: PASS, or record any unrelated pre-existing failures with file and assertion details.

- [ ] **Step 4: Manual local smoke**

Run:

```bash
npm run dev:phone-auth
```

Open `http://127.0.0.1:4310/login.html`, request a code for `13800138000`, use the dev challenge endpoint code, verify login, and confirm the app opens. Stop the server after smoke testing.

- [ ] **Step 5: Commit final fixes if needed**

If verification required no fixes, skip this step. If verification exposed a bug, commit the exact files changed by that fix, for example:

```bash
git status --short
git add apps/backend/src/modules/identity/persistent-auth.service.ts apps/backend/src/modules/identity/tests/persistent-auth.spec.ts
git commit -m "test: verify tencent sms phone auth"
```

## Self-Review

Spec coverage:
- Tencent SMS provider is covered by Task 2.
- Daily 3 successful sends and failed-send exclusion are covered by Task 3.
- 60-second cooldown is covered by Task 3 and Task 4.
- IP/user-agent hashing is covered by Task 3.
- 5-minute challenge expiry remains in the existing challenge service and is exercised by existing tests.
- 30-day login is covered by Task 5.
- Chinese env comments are covered by Task 6.
- Frontend copy is covered by Task 7.

Placeholder scan:
- No placeholder markers are used.

Type consistency:
- `SmsProvider.providerName` is `"tencent" | "dev"` throughout.
- Request-code orchestration returns `kind` values that match HTTP and frontend error mappings.
- Session duration uses 30 days in both service TTL and cookie `Max-Age`.
