# Phone Auth Design

**Goal:** Add a frontend-connectable authentication slice for the P0 platform using mainland China phone-number verification codes, server-side sessions, and a development-only debug path instead of a real SMS provider.

**Scope:** This design covers the minimum login flow needed to unblock frontend work and future M1 tenant/auth work:
- phone code request
- phone code verify
- current session
- logout
- login page

Out of scope for this slice:
- real SMS delivery
- organization/workspace/membership resolution
- capability enforcement beyond session presence
- OAuth, password login, WeChat login
- production anti-abuse completeness

## 1. Decisions

### 1.1 Authentication shape

Use `HttpOnly` server-side sessions, not bearer tokens.

Reason:
- the product is currently desktop web first
- the architecture already centers on `auth_sessions` and later `ActorContext`
- server-side revocation is important for the admin/ops-heavy platform direction

### 1.2 Login identifier

Only support mainland China mobile numbers in this slice.

Rules:
- frontend accepts an 11-digit mainland mobile number
- backend normalizes to `+86XXXXXXXXXXX`
- all stored phone values use normalized E.164-style `+86...` format

This avoids storing multiple equivalent forms such as `13800138000`, `+8613800138000`, and `86 13800138000`.

### 1.3 Verification delivery mode

Use development placeholder mode.

Rules:
- backend generates a 6-digit verification code
- backend stores only the code hash, never the plaintext code
- no real SMS provider is called
- development mode exposes a debug-only way to retrieve the active code for a challenge
- production mode must not expose the debug path at all

### 1.4 Challenge model

Use a dedicated `login_challenges` record, not a loose "send code then verify by phone only" flow.

Reason:
- matches the intended frontend flow cleanly
- gives a stable `challengeId` for resend, expiry, lockout, and dev debugging
- is a better long-term fit than a phone-only verification lookup

### 1.5 Frontend page shape

Use one `/login` page with two inline steps:
- step 1: enter phone number and request code
- step 2: enter code and verify login

Do not split this into multiple routes for the first version. A single page reduces session/bootstrap complexity and is faster to wire up.

## 2. Module Boundary

Add a minimal `identity` slice responsible for:
- issuing login challenges
- verifying codes
- creating sessions
- reading current session
- revoking sessions

This slice does not own:
- tenant resolution
- memberships
- capabilities
- real SMS sending

The first version should be usable by the frontend before `organization` and `ActorContext` are fully implemented. Later M1 work will consume the created session model rather than replacing it.

## 3. API Contract

All routes use the `/api/auth` prefix.

### 3.1 `POST /api/auth/code/request`

Request:

```json
{
  "phone": "13800138000"
}
```

Success response:

```json
{
  "challengeId": "uuid",
  "maskedPhone": "138****8000",
  "expiresAt": "2026-05-09T10:15:00.000Z",
  "retryAfterSeconds": 60
}
```

Behavior:
- validates phone format
- normalizes phone
- creates a new challenge or replaces the prior active challenge for that phone
- generates a new plaintext code, stores only its hash
- sets short expiry, for example 5 minutes

Errors:
- `invalid_phone`
- `rate_limited`

### 3.2 `POST /api/auth/code/verify`

Request:

```json
{
  "challengeId": "uuid",
  "phone": "13800138000",
  "code": "123456"
}
```

Success response:

```json
{
  "user": {
    "id": "uuid",
    "phone": "+8613800138000"
  },
  "session": {
    "id": "uuid",
    "expiresAt": "2026-05-16T10:10:00.000Z"
  }
}
```

Additionally:
- response sets a session cookie via `Set-Cookie`

Behavior:
- validates phone and normalizes it
- finds the challenge by `challengeId`
- confirms the challenge belongs to the same normalized phone
- rejects expired, consumed, revoked, or locked challenges
- verifies the code hash
- creates a user if one does not exist
- creates an `auth_session`
- marks the challenge consumed

Errors:
- `invalid_phone`
- `challenge_not_found`
- `challenge_expired`
- `challenge_consumed`
- `code_invalid`
- `verify_locked`
- `user_disabled`

### 3.3 `GET /api/auth/session`

Success response:

```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "phone": "+8613800138000"
  },
  "session": {
    "id": "uuid",
    "expiresAt": "2026-05-16T10:10:00.000Z"
  }
}
```

Unauthenticated response:
- `401 unauthenticated`

Behavior:
- reads session cookie
- hashes the presented token
- resolves the active session
- returns minimal bootstrap-safe identity data

Do not include organization, membership, or capability data in this slice.

### 3.4 `POST /api/auth/logout`

Success response:
- `204 No Content`

Behavior:
- resolves current session from cookie
- marks it revoked
- clears the session cookie

This endpoint should be idempotent. Logging out twice is still a success.

### 3.5 `GET /api/auth/dev/challenges/:challengeId`

Development-only endpoint.

Success response:

```json
{
  "challengeId": "uuid",
  "phone": "+8613800138000",
  "code": "123456",
  "expiresAt": "2026-05-09T10:15:00.000Z",
  "status": "issued"
}
```

Rules:
- only available when an explicit dev flag is enabled
- must not exist in production mode
- must never be linked from non-development UI

This endpoint is intentionally separate from the main request response so the production shape stays clean.

## 4. Data Model

## 4.1 `users`

Extend `users` to support phone-based login.

Required additions:
- `phone_e164 text UNIQUE NULL`

Rules:
- a user may exist with only phone identity in this slice
- `email` should no longer be the only required login identifier for the platform direction

This is an intentional divergence from the earlier email-code M1 plan and should be recorded as a contract-change during implementation.

## 4.2 `login_challenges`

Create a dedicated challenge table.

Recommended columns:
- `id uuid primary key`
- `phone_e164 text not null`
- `code_hash text not null`
- `status text not null`
- `attempt_count integer not null default 0`
- `max_attempts integer not null default 5`
- `expires_at timestamptz not null`
- `last_sent_at timestamptz not null`
- `consumed_at timestamptz null`
- `revoked_at timestamptz null`
- `created_ip_hash text null`
- `created_user_agent_hash text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Statuses:
- `issued`
- `consumed`
- `expired`
- `revoked`
- `locked`

Rules:
- plaintext code is never stored
- only one active challenge per phone is needed for the first slice
- replacing an old active challenge should revoke the previous one

## 4.3 `auth_sessions`

Keep `auth_sessions` as server-side session truth.

Required columns:
- `id uuid primary key`
- `user_id uuid not null`
- `status text not null`
- `session_token_hash text not null`
- `expires_at timestamptz not null`
- `last_seen_at timestamptz null`
- `revoked_at timestamptz null`
- `created_at timestamptz not null default now()`

Statuses:
- `active`
- `revoked`
- `expired`

Rules:
- plaintext token is never stored
- session verification is hash-based
- revocation is server-side only

## 5. Security and Development Guardrails

### 5.1 Cookie policy

Use:
- `HttpOnly`
- `SameSite=Lax`
- `Path=/`

Use `Secure=true` whenever running over HTTPS. For local HTTP development, allow a development-only downgrade if needed.

### 5.2 Code generation and hashing

Use:
- 6-digit numeric verification code
- cryptographically secure random generation
- one-way hash at rest

Do not log plaintext verification codes or session tokens.

### 5.3 Basic abuse controls

For this slice, implement only the minimum safe controls:
- resend cooldown per phone, for example 60 seconds
- verification attempt cap per challenge, for example 5 attempts
- challenge expiry, for example 5 minutes

Do not block this slice on full SMS anti-abuse infrastructure.

### 5.4 Debug endpoint gating

The dev challenge endpoint must require both:
- `NODE_ENV !== "production"`
- explicit feature flag such as `AUTH_DEBUG_MODE=true`

That prevents accidental exposure in a staging or production-like environment.

## 6. Frontend Login Page

Use one route: `/login`

### 6.1 Page behavior

If `GET /api/auth/session` succeeds on page load:
- redirect away from `/login` to the authenticated app entry

If no session exists:
- render phone request step

### 6.2 Step 1: request code

Fields:
- phone number input

Actions:
- submit calls `POST /api/auth/code/request`
- on success, page advances to code input step

UI behavior:
- show masked phone
- show resend countdown
- disable submit while request is in flight

Validation:
- client-side only checks basic mainland phone shape
- server validation remains authoritative

### 6.3 Step 2: verify code

Fields:
- 6-digit code input

Actions:
- submit calls `POST /api/auth/code/verify`
- success redirects into the app
- failure shows stable error copy

### 6.4 Development helper UI

When `AUTH_DEBUG_MODE=true` in the frontend runtime:
- the page may call the dev challenge endpoint after code request
- the returned code may be displayed in a small dev-only helper panel

This panel must be:
- visually marked as development only
- omitted entirely outside dev mode

### 6.5 Error copy

Stable user-facing messages should map from backend errors:
- `invalid_phone` -> "请输入正确的中国大陆手机号"
- `rate_limited` -> "请求过于频繁，请稍后再试"
- `code_invalid` -> "验证码不正确"
- `challenge_expired` -> "验证码已过期，请重新获取"
- `verify_locked` -> "尝试次数过多，请重新获取验证码"
- `unauthenticated` -> redirect or remain on login page

## 7. Implementation Notes

### 7.1 Backend shape

The first slice should include:
- identity service layer
- minimal HTTP handlers
- persistence-backed tests for challenge and session semantics

Do not wait for the full organization module before shipping this auth slice.

### 7.2 Frontend shape

Because no web app surface exists yet in the repository, the first frontend work should include the minimum application shell needed to host:
- `/login`
- session bootstrap
- authenticated placeholder landing page

Do not design a full dashboard yet. The authenticated page can be a minimal placeholder that proves the login loop.

### 7.3 Contract drift handling

The current architecture package assumes email-code auth. This implementation intentionally changes the login identifier to phone.

Implementation must therefore add a contract-change record that:
- replaces email-code assumptions with phone-code assumptions for this phase
- documents the `login_challenges` naming decision
- states that later multi-identifier login can generalize from this shape

## 8. Test Expectations

The slice is not done unless it proves all of the following:
- code hashes are stored, plaintext codes are not
- session token hashes are stored, plaintext tokens are not
- expired and consumed challenges cannot be reused
- verify attempts lock after the configured cap
- `GET /api/auth/session` works from session cookie only
- logout revokes the server-side session
- dev debug endpoint is unavailable outside development mode
- login page can complete the full request -> debug read -> verify -> session bootstrap flow

## 9. Recommended Build Order

1. migration updates for `users`, `login_challenges`, and `auth_sessions`
2. challenge domain tests and service
3. session domain tests and service
4. auth HTTP handlers
5. minimal web app shell and `/login`
6. authenticated placeholder page plus session bootstrap
7. end-to-end happy-path test in development mode

## 10. Final Recommendation

Proceed with:
- phone-number login
- `HttpOnly` server-side cookie sessions
- dedicated `login_challenges`
- development-only debug endpoint
- one-page login UI

This is the smallest version that is frontend-usable now, aligns with the existing architecture direction, and can later evolve into the fuller M1 identity/tenant foundation without discarding the core login flow.
