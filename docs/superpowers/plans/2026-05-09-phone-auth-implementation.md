# Phone Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frontend-connectable phone verification login slice with development-only code debugging, server-side sessions, minimal auth APIs, and a simple login page.

**Architecture:** Keep the implementation modular inside the existing monorepo by adding an `identity` slice under `apps/backend` and a minimal static web shell under `apps/web`. Use persistence-friendly TypeScript services and thin HTTP handlers so the login core can later plug into a fuller modular-monolith backend without being rewritten.

**Tech Stack:** TypeScript, Node test runner, SQL migration draft updates, built-in Node crypto/HTTP primitives, static HTML/CSS/JS for the first login page.

---

## File Structure

- Modify: `packages/db/migrations/0001_foundation.sql`
- Modify: `package.json`
- Create: `apps/backend/src/modules/identity/phone-auth.types.ts`
- Create: `apps/backend/src/modules/identity/phone-auth.utils.ts`
- Create: `apps/backend/src/modules/identity/login-challenge.service.ts`
- Create: `apps/backend/src/modules/identity/session.service.ts`
- Create: `apps/backend/src/modules/identity/auth-http.handlers.ts`
- Create: `apps/backend/src/modules/identity/tests/login-challenge.spec.ts`
- Create: `apps/backend/src/modules/identity/tests/session.spec.ts`
- Create: `apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts`
- Create: `apps/web/login.html`
- Create: `apps/web/login.css`
- Create: `apps/web/login.js`
- Create: `apps/web/tests/login-page.spec.ts`
- Modify: `scripts/run-tests.mjs`

## Task 1: Add Identity Schema Surface

**Files:**
- Modify: `packages/db/migrations/0001_foundation.sql`
- Test: `apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLoginChallenge } from "../login-challenge.service.ts";

describe("login challenge schema assumptions", () => {
  it("creates issued challenges for normalized +86 phones", async () => {
    const challenge = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    assert.equal(challenge.phoneE164, "+8613800138000");
    assert.equal(challenge.status, "issued");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

Expected: FAIL because the identity files and challenge surface do not exist yet.

- [ ] **Step 3: Write minimal schema updates**

Update `packages/db/migrations/0001_foundation.sql` to:

```sql
ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN phone_e164 text UNIQUE NULL;

CREATE TABLE login_challenges (
  id uuid PRIMARY KEY,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('issued', 'consumed', 'expired', 'revoked', 'locked')
  ),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_ip_hash text NULL,
  created_user_agent_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_challenges_phone_status_idx
  ON login_challenges (phone_e164, status, created_at DESC);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  session_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Run test to verify it still fails for the right reason**

Run: `npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

Expected: FAIL because the service implementation is still missing, not because of a syntax or import problem.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0001_foundation.sql
git commit -m "feat: add phone auth schema surface"
```

## Task 2: Implement Phone Normalization and Login Challenges

**Files:**
- Create: `apps/backend/src/modules/identity/phone-auth.types.ts`
- Create: `apps/backend/src/modules/identity/phone-auth.utils.ts`
- Create: `apps/backend/src/modules/identity/login-challenge.service.ts`
- Test: `apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createLoginChallenge,
  verifyLoginChallengeCode,
} from "../login-challenge.service.ts";

describe("login challenges", () => {
  it("normalizes mainland phones to +86", async () => {
    const challenge = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    assert.equal(challenge.phoneE164, "+8613800138000");
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

Expected: FAIL because the types, utils, and service do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/backend/src/modules/identity/phone-auth.types.ts`:

```ts
export type LoginChallengeStatus =
  | "issued"
  | "consumed"
  | "expired"
  | "revoked"
  | "locked";

export interface LoginChallenge {
  id: string;
  phoneE164: string;
  codeHash: string;
  status: LoginChallengeStatus;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
  lastSentAt: Date;
  plainCode?: string;
}
```

Create `apps/backend/src/modules/identity/phone-auth.utils.ts` with:

```ts
import { createHash, randomInt, randomUUID } from "node:crypto";

export function normalizeCnPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const mainland = digits.startsWith("86") ? digits.slice(2) : digits;
  if (!/^1\d{10}$/.test(mainland)) {
    throw new Error("invalid_phone");
  }
  return `+86${mainland}`;
}

export function maskCnPhone(phoneE164: string): string {
  const mainland = phoneE164.slice(3);
  return `${mainland.slice(0, 3)}****${mainland.slice(-4)}`;
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function generateId(): string {
  return randomUUID();
}
```

Create `apps/backend/src/modules/identity/login-challenge.service.ts` with:

```ts
import type { LoginChallenge } from "./phone-auth.types.ts";
import { generateCode, generateId, hashSecret, normalizeCnPhone } from "./phone-auth.utils.ts";

export async function createLoginChallenge(input: {
  phone: string;
  now: Date;
  code?: string;
  maxAttempts?: number;
}): Promise<LoginChallenge> {
  const plainCode = input.code ?? generateCode();
  return {
    id: generateId(),
    phoneE164: normalizeCnPhone(input.phone),
    codeHash: hashSecret(plainCode),
    status: "issued",
    attemptCount: 0,
    maxAttempts: input.maxAttempts ?? 5,
    expiresAt: new Date(input.now.getTime() + 5 * 60 * 1000),
    lastSentAt: input.now,
    plainCode,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/identity
git commit -m "feat: add phone normalization and challenge service"
```

## Task 3: Implement Session Semantics

**Files:**
- Create: `apps/backend/src/modules/identity/session.service.ts`
- Test: `apps/backend/src/modules/identity/tests/session.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAuthSession,
  revokeAuthSession,
  verifySessionToken,
} from "../session.service.ts";

describe("auth sessions", () => {
  it("stores only a hash for the issued token", async () => {
    const created = await createAuthSession({
      userId: "user_1",
      now: new Date("2026-05-09T10:00:00.000Z"),
      token: "plain-token",
    });

    assert.notEqual(created.session.sessionTokenHash, "plain-token");
    assert.equal(verifySessionToken(created.session, "plain-token"), true);
  });

  it("rejects revoked sessions", async () => {
    const created = await createAuthSession({
      userId: "user_1",
      now: new Date("2026-05-09T10:00:00.000Z"),
      token: "plain-token",
    });

    const revoked = revokeAuthSession(created.session, new Date("2026-05-09T10:05:00.000Z"));
    assert.equal(verifySessionToken(revoked, "plain-token"), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/backend/src/modules/identity/tests/session.spec.ts`

Expected: FAIL because the session service does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/backend/src/modules/identity/session.service.ts`:

```ts
import { randomUUID } from "node:crypto";

import { hashSecret } from "./phone-auth.utils.ts";

export interface AuthSession {
  id: string;
  userId: string;
  status: "active" | "revoked" | "expired";
  sessionTokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}

export async function createAuthSession(input: {
  userId: string;
  now: Date;
  token?: string;
}) {
  const plainToken = input.token ?? randomUUID();
  return {
    token: plainToken,
    session: {
      id: randomUUID(),
      userId: input.userId,
      status: "active" as const,
      sessionTokenHash: hashSecret(plainToken),
      expiresAt: new Date(input.now.getTime() + 7 * 24 * 60 * 60 * 1000),
      lastSeenAt: input.now,
      revokedAt: null,
    },
  };
}

export function verifySessionToken(session: AuthSession, token: string): boolean {
  return session.status === "active" && session.sessionTokenHash === hashSecret(token);
}

export function revokeAuthSession(session: AuthSession, now: Date): AuthSession {
  return {
    ...session,
    status: "revoked",
    revokedAt: now,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apps/backend/src/modules/identity/tests/session.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/identity/session.service.ts apps/backend/src/modules/identity/tests/session.spec.ts
git commit -m "feat: add auth session semantics"
```

## Task 4: Add Minimal Auth HTTP Handlers

**Files:**
- Create: `apps/backend/src/modules/identity/auth-http.handlers.ts`
- Test: `apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAuthHandlers,
  type AuthHandlerContext,
} from "../auth-http.handlers.ts";

describe("auth HTTP handlers", () => {
  it("returns challenge metadata for code request", async () => {
    const handlers = createAuthHandlers(createInMemoryContext());
    const response = await handlers.requestCode({
      body: { phone: "13800138000" },
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    assert.equal(response.status, 200);
    assert.equal(typeof response.body.challengeId, "string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts`

Expected: FAIL because the handler module does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/backend/src/modules/identity/auth-http.handlers.ts` with:
- an in-memory challenge store
- an in-memory user store
- an in-memory session store
- handlers for:
  - `requestCode`
  - `verifyCode`
  - `getSession`
  - `logout`
  - `getDevChallenge`

Core response shape:

```ts
export interface AuthHttpResponse<T> {
  status: number;
  body: T;
  cookies?: string[];
}
```

Cookie format:

```ts
`auth_session=${token}; Path=/; HttpOnly; SameSite=Lax`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/identity/auth-http.handlers.ts apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts
git commit -m "feat: add minimal auth HTTP handlers"
```

## Task 5: Add the Login Page Shell

**Files:**
- Create: `apps/web/login.html`
- Create: `apps/web/login.css`
- Create: `apps/web/login.js`
- Create: `apps/web/tests/login-page.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

describe("login page shell", () => {
  it("contains phone and code steps", async () => {
    const html = await readFile(new URL("../login.html", import.meta.url), "utf8");
    assert.match(html, /手机号/);
    assert.match(html, /验证码/);
    assert.match(html, /id="login-form"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/web/tests/login-page.spec.ts`

Expected: FAIL because the page files do not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/login.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>登录</title>
    <link rel="stylesheet" href="./login.css" />
  </head>
  <body>
    <main class="login-shell">
      <section class="card">
        <h1>手机号登录</h1>
        <p class="subtitle">使用中国大陆手机号验证码登录</p>
        <form id="login-form">
          <label>
            手机号
            <input id="phone-input" name="phone" inputmode="numeric" maxlength="11" />
          </label>
          <button id="request-code-button" type="button">获取验证码</button>
          <label>
            验证码
            <input id="code-input" name="code" inputmode="numeric" maxlength="6" />
          </label>
          <button id="verify-button" type="submit">登录</button>
        </form>
        <pre id="debug-panel" hidden></pre>
        <p id="status-message" aria-live="polite"></p>
      </section>
    </main>
    <script type="module" src="./login.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apps/web/tests/login-page.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/login.html apps/web/login.css apps/web/login.js apps/web/tests/login-page.spec.ts
git commit -m "feat: add login page shell"
```

## Task 6: Wire Frontend Requests and Development Debug Flow

**Files:**
- Modify: `apps/web/login.js`
- Modify: `apps/web/login.css`
- Test: `apps/web/tests/login-page.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

describe("login page client flow", () => {
  it("calls the auth endpoints and includes a development debug panel", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");
    assert.match(js, /\/api\/auth\/code\/request/);
    assert.match(js, /\/api\/auth\/code\/verify/);
    assert.match(js, /\/api\/auth\/dev\/challenges\//);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/web/tests/login-page.spec.ts`

Expected: FAIL because the client script does not yet contain the flow.

- [ ] **Step 3: Write the minimal implementation**

Add to `apps/web/login.js`:
- request-code flow
- verify flow
- dev debug fetch flow
- session check on load

Core request snippets:

```js
const requestResponse = await fetch("/api/auth/code/request", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ phone }),
});
```

```js
const verifyResponse = await fetch("/api/auth/code/verify", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ challengeId, phone, code }),
  credentials: "include",
});
```

```js
const sessionResponse = await fetch("/api/auth/session", {
  credentials: "include",
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apps/web/tests/login-page.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/login.js apps/web/login.css apps/web/tests/login-page.spec.ts
git commit -m "feat: wire login page to auth APIs"
```

## Task 7: Keep the Root Test Runner Green

**Files:**
- Modify: `scripts/run-tests.mjs`
- Modify if needed: `package.json`

- [ ] **Step 1: Write the failing integration expectation**

The failing signal for this task is the full suite not discovering the new `apps/backend/src/modules/identity/tests` and `apps/web/tests` files.

- [ ] **Step 2: Run test to verify current behavior**

Run: `npm test`

Expected: FAIL or miss new auth test coverage until the runner includes the new paths.

- [ ] **Step 3: Write the minimal implementation**

Update `scripts/run-tests.mjs` so recursive discovery includes the new test directories and continues skipping hidden directories, `node_modules`, and `dist`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS with the identity and login page tests included.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-tests.mjs package.json
git commit -m "test: include phone auth and login page coverage"
```

## Self-Review

- Spec coverage:
  - phone auth API: covered by Task 4
  - session model: covered by Task 3
  - debug challenge flow: covered by Tasks 4 and 6
  - login page: covered by Tasks 5 and 6
  - schema changes: covered by Task 1
- Placeholder scan:
  - no `TODO` / `TBD`
  - each task includes explicit files, commands, and code snippets
- Type consistency:
  - `phoneE164`, `challengeId`, `auth_session`, `sessionTokenHash`, and `AuthHttpResponse` names are consistent across tasks

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-phone-auth-implementation.md`. I am proceeding with **Inline Execution** in this session because you explicitly asked to enter development now.
