import assert from "node:assert/strict";
import { test } from "node:test";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { runWithUserAuthRequestContext } from "../identity/user-auth-request-context.service.ts";
import {
  createAdminAuthService,
  permissionsForRoles,
  type AdminSessionPayload,
} from "./admin-auth.service.ts";
import { createAdminHttpAuth } from "./admin-http-auth.ts";

const principal: AdminSessionPayload = {
  account: {
    id: "81000000-0000-4000-8000-000000000001",
    loginName: "ops",
    displayName: "Ops Admin",
    status: "active",
  },
  roles: ["ops_admin"],
  permissions: permissionsForRoles(["ops_admin"]),
  session: {
    id: "82000000-0000-4000-8000-000000000001",
    expiresAt: "2026-07-22T08:00:00.000Z",
  },
};

test("admin HTTP auth parses only admin_session and reuses one resolution per request", async () => {
  const tokens: Array<string | null | undefined> = [];
  const auth = createAdminHttpAuth({
    adminAuth: {
      async resolvePrincipal(token) {
        tokens.push(token);
        return token === "adm_token=part" ? principal : undefined;
      },
    },
  });
  const requestContext = {};
  const input = {
    cookieHeader: "auth_session=user_token; admin_session=adm_token=part",
    now: new Date("2026-07-22T00:00:00.000Z"),
    requestContext,
  };

  const permissionResult = await auth.requirePermissions(input, ["ops.task.retry"]);
  const roleResult = await auth.requireAnyRole(input, ["super_admin", "ops_admin"]);

  assert.equal(permissionResult.ok, true);
  assert.equal(roleResult.ok, true);
  assert.deepEqual(tokens, ["adm_token=part"]);
  if (permissionResult.ok) {
    assert.equal(permissionResult.principal.adminAccountId, principal.account.id);
    assert.equal(permissionResult.session.admin_account_id, principal.account.id);
  }
});

test("admin HTTP auth preserves unauthenticated and forbidden response contracts", async () => {
  const auth = createAdminHttpAuth({
    adminAuth: {
      async resolvePrincipal(token) {
        return token === "valid" ? principal : undefined;
      },
    },
  });

  const unauthenticated = await auth.requireAdmin({ cookieHeader: "auth_session=user-only" });
  assert.deepEqual(unauthenticated, {
    ok: false,
    response: {
      status: 401,
      body: { error: { code: "admin_unauthenticated", message: "管理员登录已过期，请重新登录。" } },
    },
  });

  const missingAnyRole = await auth.requireAnyRole(
    { cookieHeader: "admin_session=valid" },
    ["super_admin", "finance_admin"],
  );
  const missingOnePermission = await auth.requirePermissions(
    { cookieHeader: "admin_session=valid" },
    ["dashboard.read", "risk.export"],
  );
  for (const result of [missingAnyRole, missingOnePermission]) {
    assert.deepEqual(result, {
      ok: false,
      response: {
        status: 403,
        body: { error: { code: "admin_forbidden", message: "当前管理员账号没有操作权限。" } },
      },
    });
  }
});

test("admin HTTP auth uses the ambient HTTP request context when no context is passed", async () => {
  const tokens: string[] = [];
  const auth = createAdminHttpAuth({
    adminAuth: {
      async resolvePrincipal(token) {
        tokens.push(token ?? "");
        return principal;
      },
    },
  });

  await runWithUserAuthRequestContext(async () => {
    const input = { cookieHeader: "admin_session=ambient-token" };
    await auth.requireAdmin(input);
    await auth.requireAdmin(input);
  }, {});

  assert.deepEqual(tokens, ["ambient-token"]);
});

test("admin auth service returns me with the session, roles, and permissions in one query", async () => {
  const queries: string[] = [];
  const db: SqlDatabase = {
    async query<T>(sql) {
      queries.push(sql);
      return {
        rows: [{
          id: principal.session.id,
          admin_account_id: principal.account.id,
          login_name: principal.account.loginName,
          display_name: principal.account.displayName,
          status: principal.account.status,
          expires_at: principal.session.expiresAt,
          roles: ["ops_admin"],
        } as unknown as T],
      };
    },
  };
  const service = createAdminAuthService({ db });

  const resolved = await service.me({
    sessionToken: "adm_token",
    now: new Date("2026-07-22T00:00:00.000Z"),
  });

  assert.equal(queries.length, 1);
  assert.deepEqual(resolved, { status: 200, body: { data: principal } });
});
