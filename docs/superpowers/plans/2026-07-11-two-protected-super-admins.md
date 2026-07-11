# Two Protected Super Admins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect exactly two current super-admin accounts, let each edit only its own login profile and password, and prevent all ordinary administrator flows from creating another super admin.

**Architecture:** Add an immutable positive `super_admin_slot` identity to `admin_accounts`, seed slots 1 and 2 through the existing bootstrap script, and enforce protection in existing auth and admin-settings services. Reuse the existing self-profile and self-password endpoints and keep ordinary administrator management behavior unchanged.

**Tech Stack:** PostgreSQL migrations, Node.js/TypeScript, `node:test`, existing admin HTML/JavaScript shell.

---

### Task 1: Add the protected-slot schema

**Files:**
- Create: `packages/db/migrations/0074_protected_super_admin_slots.sql`
- Test: `apps/backend/src/modules/shared/db/tests/protected-super-admin-schema.spec.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMigratedTestDb } from "../test-db.ts";

describe("protected super admin schema", () => {
  it("allows only unique positive protected slots", async () => {
    const db = await createMigratedTestDb();
    try {
      const columns = await db.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'admin_accounts'
          AND column_name = 'super_admin_slot'
      `);
      assert.equal(columns.rows.length, 1);

      await db.query(`INSERT INTO admin_accounts
        (id, login_name, password_hash, display_name, status, super_admin_slot)
        VALUES ('71000000-0000-4000-8000-000000000001', 'slot_one', 'plain:test', 'Slot One', 'active', 1)`);

      await assert.rejects(
        db.query(`INSERT INTO admin_accounts
          (id, login_name, password_hash, display_name, status, super_admin_slot)
          VALUES ('71000000-0000-4000-8000-000000000002', 'slot_duplicate', 'plain:test', 'Duplicate', 'active', 1)`),
        (error: unknown) => (error as { code?: string }).code === "23505",
      );
      await assert.rejects(
        db.query(`INSERT INTO admin_accounts
          (id, login_name, password_hash, display_name, status, super_admin_slot)
          VALUES ('71000000-0000-4000-8000-000000000003', 'slot_zero', 'plain:test', 'Zero', 'active', 0)`),
        (error: unknown) => (error as { code?: string }).code === "23514",
      );
    } finally {
      await db.close?.();
    }
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node scripts/run-tests.mjs apps/backend/src/modules/shared/db/tests/protected-super-admin-schema.spec.ts`

Expected: FAIL because `super_admin_slot` does not exist.

- [ ] **Step 3: Add the migration**

```sql
ALTER TABLE admin_accounts
  ADD COLUMN IF NOT EXISTS super_admin_slot integer NULL;

ALTER TABLE admin_accounts
  DROP CONSTRAINT IF EXISTS admin_accounts_super_admin_slot_check,
  ADD CONSTRAINT admin_accounts_super_admin_slot_check
    CHECK (super_admin_slot IS NULL OR super_admin_slot > 0);

CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_super_admin_slot_unique
  ON admin_accounts (super_admin_slot)
  WHERE super_admin_slot IS NOT NULL;
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node scripts/run-tests.mjs apps/backend/src/modules/shared/db/tests/protected-super-admin-schema.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the schema unit**

```bash
git add packages/db/migrations/0074_protected_super_admin_slots.sql apps/backend/src/modules/shared/db/tests/protected-super-admin-schema.spec.ts
git commit -m "feat: add protected super admin slots"
```

### Task 2: Reconcile two protected accounts with the bootstrap script

**Files:**
- Modify: `scripts/bootstrap-admin-account.mjs`
- Modify: `scripts/bootstrap-admin-account.test.mjs`

- [ ] **Step 1: Add failing bootstrap tests**

Add tests that call a new exported `bootstrapProtectedSuperAdmins` with two entries:

```js
const result = await bootstrapProtectedSuperAdmins({
  db,
  accounts: [
    { slot: 1, loginName: "codex_admin", displayName: "Codex 管理员", password: "First-Admin-12345" },
    { slot: 2, loginName: "admin", displayName: "后台管理员", password: "Second-Admin-12345" },
  ],
  cleanupLoginNames: ["accept_admin_0624120228"],
  now: new Date("2026-07-11T00:00:00.000Z"),
});

assert.deepEqual(result.accounts.map((account) => account.slot), [1, 2]);
assert.equal((await db.query("SELECT count(*)::int AS count FROM admin_accounts WHERE super_admin_slot IS NOT NULL")).rows[0].count, 2);
assert.equal((await db.query("SELECT count(*)::int AS count FROM admin_accounts WHERE login_name = 'accept_admin_0624120228'")).rows[0].count, 0);
```

Also verify a second run without passwords preserves login names, password hashes, and display names already changed after the first run; verify a new slot without a password rejects with `ADMIN_SUPER_<N>_PASSWORD is required for a new protected account`.

- [ ] **Step 2: Run the bootstrap test and verify RED**

Run: `node scripts/run-tests.mjs scripts/bootstrap-admin-account.test.mjs`

Expected: FAIL because `bootstrapProtectedSuperAdmins` is not exported and the slot column is not written.

- [ ] **Step 3: Implement minimal protected reconciliation**

Add `bootstrapProtectedSuperAdmins(input)` without changing the existing `bootstrapAdminAccount(input)` behavior:

```js
export async function bootstrapProtectedSuperAdmins(input) {
  const accounts = normalizeProtectedAccounts(input.accounts);
  await input.db.query("BEGIN");
  try {
    const results = [];
    for (const account of accounts) {
      results.push(await reconcileProtectedAccount(input.db, account, input.now ?? new Date()));
    }
    for (const loginName of input.cleanupLoginNames ?? []) {
      await deleteUnusedBootstrapAccount(input.db, loginName);
    }
    await input.db.query("COMMIT");
    return { accounts: results };
  } catch (error) {
    await input.db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
```

`reconcileProtectedAccount` must locate by slot first, then by initial login name. Existing slot rows retain mutable account fields; newly bound rows are set to `active`, assigned the slot, and receive only the `super_admin` role. `deleteUnusedBootstrapAccount` deletes sessions and roles before the exact approved login name, allowing any remaining business foreign key to abort and roll back.

Update `main()` so `ADMIN_SUPER_ACCOUNT_COUNT` selects indexed configuration while the legacy `ADMIN_LOGIN_NAME` path remains supported. Parse exactly `ADMIN_SUPER_1_*` through `ADMIN_SUPER_<count>_*`; do not print passwords.

- [ ] **Step 4: Run bootstrap tests and verify GREEN**

Run: `node scripts/run-tests.mjs scripts/bootstrap-admin-account.test.mjs`

Expected: all bootstrap tests PASS.

- [ ] **Step 5: Commit the bootstrap unit**

```bash
git add scripts/bootstrap-admin-account.mjs scripts/bootstrap-admin-account.test.mjs
git commit -m "feat: bootstrap protected super admins"
```

### Task 3: Enforce protected identities in admin account management

**Files:**
- Modify: `apps/backend/src/modules/admin-system-settings/admin-system-settings.service.ts`
- Modify: `apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`

- [ ] **Step 1: Write failing HTTP protection tests**

Add focused cases using `createMigratedTestDb()` and the existing logged-in admin server helpers:

```ts
assert.equal(createThirdSuperAdminResponse.status, 409);
assert.equal((await createThirdSuperAdminResponse.json()).error.code, "protected_super_admin_creation_forbidden");

assert.equal(promoteOrdinaryAdminResponse.status, 409);
assert.equal((await promoteOrdinaryAdminResponse.json()).error.code, "protected_super_admin_promotion_forbidden");

assert.equal(editOtherProtectedAdminResponse.status, 403);
assert.equal((await editOtherProtectedAdminResponse.json()).error.code, "protected_super_admin_self_only");

assert.equal(disableSelfProtectedAdminResponse.status, 409);
assert.equal((await disableSelfProtectedAdminResponse.json()).error.code, "protected_super_admin_immutable");
```

Verify the list response includes `superAdminSlot` and `isProtectedSuperAdmin`, and verify ordinary admin creation with `ops_admin` still succeeds.

- [ ] **Step 2: Run the focused HTTP tests and verify RED**

Run: `node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts -- --test-name-pattern "protected super admin"`

Expected: FAIL because current services permit arbitrary `super_admin` role changes.

- [ ] **Step 3: Add minimal service guards**

In `listAdminAccounts`, select `a.super_admin_slot`; expose:

```ts
superAdminSlot: row.super_admin_slot,
isProtectedSuperAdmin: row.super_admin_slot !== null,
```

In `createAdminAccount`, reject `roles.includes("super_admin")`. In `updateAdminAccount`, load `super_admin_slot` and current roles before mutation. Reject another actor editing a protected account; for the same actor require `status === "active"` and `roles` exactly equal to `["super_admin"]`. Reject adding `super_admin` to an unprotected account. In `resetAdminAccountPassword`, reject protected targets so they must use the existing self-password endpoint with their old password.

Keep all ordinary administrator role, disable, archive, and password-reset paths unchanged.

- [ ] **Step 4: Run focused and full admin HTTP tests**

Run: `node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the protection unit**

```bash
git add apps/backend/src/modules/admin-system-settings/admin-system-settings.service.ts apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts
git commit -m "feat: protect fixed super admin identities"
```

### Task 4: Let the current administrator change its own login name

**Files:**
- Modify: `apps/backend/src/modules/admin-auth/admin-auth.service.ts`
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`

- [ ] **Step 1: Extend the existing profile test and verify RED**

Send `loginName: "renamed_admin"` to `/api/admin/auth/profile`. Assert the response and `/api/admin/auth/me` return the new login name, the old login name no longer authenticates, and a duplicate login name returns `409 admin_login_name_conflict`.

- [ ] **Step 2: Run the profile test and verify RED**

Run: `node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts -- --test-name-pattern "own profile"`

Expected: FAIL because the route and service currently ignore `loginName`.

- [ ] **Step 3: Extend the existing self-profile flow**

Change `updateProfile` input to include `loginName: string`. Trim and validate it, include it in the idempotency request hash, reject an existing different account with `409 admin_login_name_conflict`, and update both `login_name` and `display_name` in the current account row. Extend the route body without changing its path:

```ts
const body = (await readJsonBody(request)) as { loginName?: string; displayName?: string };
await adminAuth.updateProfile({
  sessionToken: parseCookies(request.headers.cookie).admin_session,
  loginName: String(body.loginName ?? ""),
  displayName: String(body.displayName ?? ""),
  idempotencyKey,
  now: new Date(),
});
```

Do not change the existing self-password endpoint beyond retaining its tested old-password and optional other-session revocation behavior.

- [ ] **Step 4: Run profile and password tests**

Run: `node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts -- --test-name-pattern "own profile|own password"`

Expected: PASS.

- [ ] **Step 5: Commit the self-account unit**

```bash
git add apps/backend/src/modules/admin-auth/admin-auth.service.ts apps/backend/src/entrypoints/phone-auth-dev-server.ts apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts
git commit -m "feat: let admins change their own login name"
```

### Task 5: Update the admin UI without removing future ordinary-admin controls

**Files:**
- Modify: `apps/admin/index.html`
- Modify: `apps/admin/index.test.mjs`

- [ ] **Step 1: Write failing UI source tests**

Assert that the profile drawer contains an enabled `name="loginName"`, sends it to `/api/admin/auth/profile`, the create-role options omit `super_admin`, protected rows show `受保护超级管理员`, and protected management buttons are not rendered while ordinary rows keep edit/password/status actions.

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npm run test:admin:ui`

Expected: FAIL because login name is disabled and `super_admin` is still offered in the creation form.

- [ ] **Step 3: Apply minimal UI changes**

- Enable `loginName` in `openAdminProfileDrawer` and include it in the profile request.
- Remove only `super_admin` from `openAdminAccountDrawer` role options.
- Escape account values in the account table while touching the row renderer.
- For `isProtectedSuperAdmin`, show a protected tag and direct the current user to the account page; do not show edit, reset, disable, or archive buttons.
- Leave ordinary administrator controls and API calls intact.

- [ ] **Step 4: Run the UI test and verify GREEN**

Run: `npm run test:admin:ui`

Expected: PASS.

- [ ] **Step 5: Commit the UI unit**

```bash
git add apps/admin/index.html apps/admin/index.test.mjs
git commit -m "feat: expose protected admin self service"
```

### Task 6: Apply current account reconciliation and verify the whole change

**Files:**
- Modify locally: `.env` (not committed; no password values added)
- Verify: project PostgreSQL selected by `.env` `DATABASE_URL`

- [ ] **Step 1: Add non-secret reconciliation settings to `.env`**

```dotenv
ADMIN_SUPER_ACCOUNT_COUNT=2
ADMIN_SUPER_1_LOGIN_NAME=codex_admin
ADMIN_SUPER_1_DISPLAY_NAME=Codex 管理员
ADMIN_SUPER_2_LOGIN_NAME=admin
ADMIN_SUPER_2_DISPLAY_NAME=后台管理员
ADMIN_SUPER_CLEANUP_LOGIN_NAMES=accept_admin_0624120228
```

Do not invent or print `ADMIN_SUPER_1_PASSWORD` or `ADMIN_SUPER_2_PASSWORD`; the two accounts already exist, so their hashes are preserved.

- [ ] **Step 2: Run focused verification before touching current data**

Run:

```bash
node scripts/run-tests.mjs scripts/bootstrap-admin-account.test.mjs
node scripts/run-tests.mjs apps/backend/src/modules/shared/db/tests/protected-super-admin-schema.spec.ts
node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts
npm run test:admin:ui
```

Expected: all commands PASS.

- [ ] **Step 3: Apply migrations and reconcile current admin data**

Run: `npm run admin:bootstrap`

Expected: JSON reports slots 1 and 2 without outputting password data; the approved acceptance account is removed in the same transaction.

- [ ] **Step 4: Verify current database state without exposing credentials**

Run a read-only query through `DATABASE_URL` and assert:

```sql
SELECT count(*) = 2 AS exactly_two
FROM admin_accounts
WHERE super_admin_slot IS NOT NULL;

SELECT count(*) = 0 AS no_unprotected_super_admin
FROM admin_account_roles r
JOIN admin_accounts a ON a.id = r.admin_account_id
WHERE r.role_code = 'super_admin'
  AND a.super_admin_slot IS NULL;
```

Also verify slots 1 and 2 are active and each has exactly the `super_admin` role.

- [ ] **Step 5: Run full regression verification**

Run: `npm test`

Expected: all project tests PASS with zero failures.

- [ ] **Step 6: Run the requested pre-landing code review**

Invoke `gstack-review` against `origin/main`, address confirmed findings within this feature scope, and re-run affected tests. Do not change unrelated files.

