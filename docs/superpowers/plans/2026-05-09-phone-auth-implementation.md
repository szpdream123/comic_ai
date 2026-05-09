# 手机号认证实现计划

> **面向智能代理工作者：** 必须使用子技能：推荐使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 逐任务实现本计划。步骤采用复选框（`- [ ]`）语法进行任务跟踪。

**目标：** 构建一个可与前端对接的手机号验证码登录模块，包含开发环境专用的代码调试功能、服务端会话管理、最小化的认证 API，以及一个简洁的登录页面。

**架构设计：** 在现有 monorepo 架构中保持模块化实现，在 `apps/backend` 下新增 `identity` 模块，在 `apps/web` 下新增最小化的静态 Web 外壳。使用支持持久化的 TypeScript 服务和轻量级 HTTP 处理器，以便登录核心功能后续可以无缝接入更完整的模块化单体后端，无需重写。

**技术栈：** TypeScript、Node 测试运行器、SQL 迁移草稿更新、内置 Node crypto/HTTP 原语、用于首个登录页面的静态 HTML/CSS/JS。

---

## 文件结构

- 修改：`packages/db/migrations/0001_foundation.sql`
- 修改：`package.json`
- 新建：`apps/backend/src/modules/identity/phone-auth.types.ts`
- 新建：`apps/backend/src/modules/identity/phone-auth.utils.ts`
- 新建：`apps/backend/src/modules/identity/login-challenge.service.ts`
- 新建：`apps/backend/src/modules/identity/session.service.ts`
- 新建：`apps/backend/src/modules/identity/auth-http.handlers.ts`
- 新建：`apps/backend/src/modules/identity/tests/login-challenge.spec.ts`
- 新建：`apps/backend/src/modules/identity/tests/session.spec.ts`
- 新建：`apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts`
- 新建：`apps/web/login.html`
- 新建：`apps/web/login.css`
- 新建：`apps/web/login.js`
- 新建：`apps/web/tests/login-page.spec.ts`
- 修改：`scripts/run-tests.mjs`

## Task 1: 新增身份认证数据库表结构

**涉及文件：**
- 修改：`packages/db/migrations/0001_foundation.sql`
- 测试：`apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

- [ ] **步骤 1：编写预期失败的测试**

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

- [ ] **步骤 2：运行测试验证其失败**

运行命令：`npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

预期结果：失败，因为 identity 相关文件和验证挑战表结构尚不存在。

- [ ] **步骤 3：编写最小化的数据库表结构更新**

更新 `packages/db/migrations/0001_foundation.sql`，内容如下：

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

- [ ] **步骤 4：运行测试验证其仍然失败（且失败原因正确）**

运行命令：`npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

预期结果：失败，原因是服务实现尚未完成，而非语法或导入错误。

- [ ] **步骤 5：提交代码**

```bash
git add packages/db/migrations/0001_foundation.sql
git commit -m "feat: add phone auth schema surface"
```

## Task 2: 实现手机号标准化与登录挑战服务

**涉及文件：**
- 新建：`apps/backend/src/modules/identity/phone-auth.types.ts`
- 新建：`apps/backend/src/modules/identity/phone-auth.utils.ts`
- 新建：`apps/backend/src/modules/identity/login-challenge.service.ts`
- 测试：`apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

- [ ] **步骤 1：编写预期失败的测试**

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

- [ ] **步骤 2：运行测试验证其失败**

运行命令：`npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

预期结果：失败，因为类型定义、工具函数和服务实现文件尚不存在。

- [ ] **步骤 3：编写最小化的服务实现**

新建 `apps/backend/src/modules/identity/phone-auth.types.ts`：

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

新建 `apps/backend/src/modules/identity/phone-auth.utils.ts`，包含以下内容：

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

新建 `apps/backend/src/modules/identity/login-challenge.service.ts`，包含以下内容：

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

- [ ] **步骤 4：运行测试验证其通过**

运行命令：`npm test -- apps/backend/src/modules/identity/tests/login-challenge.spec.ts`

预期结果：通过。

- [ ] **步骤 5：提交代码**

```bash
git add apps/backend/src/modules/identity
git commit -m "feat: add phone normalization and challenge service"
```

## Task 3: 实现会话管理语义

**涉及文件：**
- 新建：`apps/backend/src/modules/identity/session.service.ts`
- 测试：`apps/backend/src/modules/identity/tests/session.spec.ts`

- [ ] **步骤 1：编写预期失败的测试**

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

- [ ] **步骤 2：运行测试验证其失败**

运行命令：`npm test -- apps/backend/src/modules/identity/tests/session.spec.ts`

预期结果：失败，因为会话服务尚不存在。

- [ ] **步骤 3：编写最小化的服务实现**

新建 `apps/backend/src/modules/identity/session.service.ts`：

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

- [ ] **步骤 4：运行测试验证其通过**

运行命令：`npm test -- apps/backend/src/modules/identity/tests/session.spec.ts`

预期结果：通过。

- [ ] **步骤 5：提交代码**

```bash
git add apps/backend/src/modules/identity/session.service.ts apps/backend/src/modules/identity/tests/session.spec.ts
git commit -m "feat: add auth session semantics"
```

## Task 4: 新增最小化的认证 HTTP 处理器

**涉及文件：**
- 新建：`apps/backend/src/modules/identity/auth-http.handlers.ts`
- 测试：`apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts`

- [ ] **步骤 1：编写预期失败的测试**

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

- [ ] **步骤 2：运行测试验证其失败**

运行命令：`npm test -- apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts`

预期结果：失败，因为处理器模块尚不存在。

- [ ] **步骤 3：编写最小化的实现**

新建 `apps/backend/src/modules/identity/auth-http.handlers.ts`，包含以下组件：
- 内存中的挑战存储
- 内存中的用户存储
- 内存中的会话存储
- 处理以下请求的处理器：
  - `requestCode` — 请求验证码
  - `verifyCode` — 验证验证码
  - `getSession` — 获取会话
  - `logout` — 退出登录
  - `getDevChallenge` — 获取开发调试用挑战信息

核心响应结构：

```ts
export interface AuthHttpResponse<T> {
  status: number;
  body: T;
  cookies?: string[];
}
```

Cookie 格式：

```ts
`auth_session=${token}; Path=/; HttpOnly; SameSite=Lax`
```

- [ ] **步骤 4：运行测试验证其通过**

运行命令：`npm test -- apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts`

预期结果：通过。

- [ ] **步骤 5：提交代码**

```bash
git add apps/backend/src/modules/identity/auth-http.handlers.ts apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts
git commit -m "feat: add minimal auth HTTP handlers"
```

## Task 5: 新增登录页面外壳

**涉及文件：**
- 新建：`apps/web/login.html`
- 新建：`apps/web/login.css`
- 新建：`apps/web/login.js`
- 新建：`apps/web/tests/login-page.spec.ts`

- [ ] **步骤 1：编写预期失败的测试**

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

- [ ] **步骤 2：运行测试验证其失败**

运行命令：`npm test -- apps/web/tests/login-page.spec.ts`

预期结果：失败，因为页面文件尚不存在。

- [ ] **步骤 3：编写最小化的实现**

新建 `apps/web/login.html`：

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

- [ ] **步骤 4：运行测试验证其通过**

运行命令：`npm test -- apps/web/tests/login-page.spec.ts`

预期结果：通过。

- [ ] **步骤 5：提交代码**

```bash
git add apps/web/login.html apps/web/login.css apps/web/login.js apps/web/tests/login-page.spec.ts
git commit -m "feat: add login page shell"
```

## Task 6: 接通前端请求与开发调试流程

**涉及文件：**
- 修改：`apps/web/login.js`
- 修改：`apps/web/login.css`
- 测试：`apps/web/tests/login-page.spec.ts`

- [ ] **步骤 1：编写预期失败的测试**

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

- [ ] **步骤 2：运行测试验证其失败**

运行命令：`npm test -- apps/web/tests/login-page.spec.ts`

预期结果：失败，因为客户端脚本中尚未包含完整的请求流程。

- [ ] **步骤 3：编写最小化的实现**

在 `apps/web/login.js` 中添加以下功能：
- 请求验证码流程（request-code flow）
- 验证验证码流程（verify flow）
- 开发调试请求流程（dev debug fetch flow）
- 页面加载时检查会话状态

核心请求代码片段：

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

- [ ] **步骤 4：运行测试验证其通过**

运行命令：`npm test -- apps/web/tests/login-page.spec.ts`

预期结果：通过。

- [ ] **步骤 5：提交代码**

```bash
git add apps/web/login.js apps/web/login.css apps/web/tests/login-page.spec.ts
git commit -m "feat: wire login page to auth APIs"
```

## Task 7: 保持根测试运行器正常

**涉及文件：**
- 修改：`scripts/run-tests.mjs`
- 根据需要修改：`package.json`

- [ ] **步骤 1：编写预期失败的集成测试预期**

本任务的失败信号为：完整测试套件无法发现新增的 `apps/backend/src/modules/identity/tests` 和 `apps/web/tests` 测试文件。

- [ ] **步骤 2：运行测试验证当前行为**

运行命令：`npm test`

预期结果：失败或遗漏新增的认证测试覆盖，直到测试运行器包含新路径。

- [ ] **步骤 3：编写最小化的实现**

更新 `scripts/run-tests.mjs`，使递归发现机制包含新增的测试目录，同时继续跳过隐藏目录、`node_modules` 和 `dist`。

- [ ] **步骤 4：运行测试验证其通过**

运行命令：`npm test`

预期结果：通过，且包含 identity 和 login page 相关测试。

- [ ] **步骤 5：提交代码**

```bash
git add scripts/run-tests.mjs package.json
git commit -m "test: include phone auth and login page coverage"
```

## 自我审查

- 需求覆盖情况：
  - 手机号认证 API：由 Task 4 覆盖
  - 会话模型：由 Task 3 覆盖
  - 开发调试验证流程：由 Task 4 和 Task 6 覆盖
  - 登录页面：由 Task 5 和 Task 6 覆盖
  - 数据库表结构变更：由 Task 1 覆盖
- 占位符扫描：
  - 无 `TODO` / `TBD` 标记
  - 每个任务均包含明确的文件、命令和代码片段
- 类型一致性：
  - `phoneE164`、`challengeId`、`auth_session`、`sessionTokenHash` 和 `AuthHttpResponse` 命名在各任务间保持一致

## 执行交接

计划已完成并保存至 `docs/superpowers/plans/2026-05-09-phone-auth-implementation.md`。由于您明确要求立即进入开发阶段，本会话将直接进行**内联执行**。
