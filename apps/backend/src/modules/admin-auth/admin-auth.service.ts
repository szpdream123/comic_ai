import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { beginOrReplayCommand, IdempotencyConflictError } from "../shared/idempotency/idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../shared/idempotency/persistent-idempotency.store.ts";

export interface AdminAccountView {
  id: string;
  loginName: string;
  displayName: string;
  status: string;
}

export interface AdminSessionView {
  id: string;
  expiresAt: string;
}

export const allAdminPermissions = [
  "dashboard.read",
  "model.read",
  "model.write",
  "model.publish",
  "user.read",
  "user.write",
  "credit.adjust",
  "risk.read",
  "risk.review",
  "risk.export",
  "ops.task.retry",
  "audit.read",
  "settings.read",
  "settings.write",
  "admin_account.read",
  "admin_account.write",
  "storyboard_prompt:view",
  "storyboard_prompt:create",
  "storyboard_prompt:update",
  "storyboard_prompt:delete",
  "storyboard_prompt:enable",
  "storyboard_prompt:test",
  "storyboard_prompt:export",
  "storyboard_prompt:template",
  "account.password",
] as const;

export type AdminPermission = (typeof allAdminPermissions)[number];

export interface AdminSessionPayload {
  account: AdminAccountView;
  roles: string[];
  permissions: AdminPermission[];
  session: AdminSessionView;
}

export type AdminAuthResponse<T> = {
  status: number;
  body: T;
  cookies?: string[];
};

interface AdminAccountRow {
  id: string;
  login_name: string;
  password_hash: string;
  display_name: string;
  status: string;
  failed_login_count: number | string;
  locked_until: Date | string | null;
}

interface AdminSessionRow {
  id: string;
  admin_account_id: string;
  login_name: string;
  display_name: string;
  status: string;
  expires_at: Date | string;
}

interface AdminAuthSessionListRow {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  created_at: Date | string;
}

export interface AdminAuthServiceDeps {
  db: SqlDatabase;
  organizationId: string;
  workspaceId: string;
  sessionMaxAgeSeconds?: number;
}

export function createAdminAuthService(deps: AdminAuthServiceDeps) {
  const sessionMaxAgeSeconds = deps.sessionMaxAgeSeconds ?? 60 * 60 * 8;
  const maxFailedLoginCount = 3;
  const lockDurationMs = 15 * 60 * 1000;

  async function login(input: {
    loginName: string;
    password: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    now: Date;
  }): Promise<AdminAuthResponse<{ data: AdminSessionPayload } | { error: { code: string; message: string } }>> {
    const loginName = input.loginName.trim();
    const password = input.password;
    if (!loginName || !password) {
      return adminError(400, "admin_credentials_required", "请输入后台账号和密码");
    }

    const account = await queryOne<AdminAccountRow>(
      deps.db,
      `
        SELECT id, login_name, password_hash, display_name, status, failed_login_count, locked_until
        FROM admin_accounts
        WHERE login_name = $1
        LIMIT 1
      `,
      [loginName],
    );

    if (account?.locked_until && new Date(account.locked_until) > input.now) {
      await appendAdminAudit({
        eventType: "admin.auth.login_failed",
        targetId: account.id,
        metadata: {
          loginName,
          locked: true,
          lockedUntil: new Date(account.locked_until).toISOString(),
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
      return adminError(423, "admin_account_locked", "后台账号已临时锁定，请稍后再试");
    }

    if (!account || account.status !== "active" || !verifyPassword(password, account.password_hash)) {
      if (account) {
        const failedLoginCount = Number(account.failed_login_count ?? 0) + 1;
        const lockedUntil = failedLoginCount >= maxFailedLoginCount
          ? new Date(input.now.getTime() + lockDurationMs)
          : null;
        await deps.db.query(
          `
            UPDATE admin_accounts
            SET failed_login_count = $2,
                locked_until = COALESCE($3, locked_until),
                updated_at = $4
            WHERE id = $1
          `,
          [account.id, failedLoginCount, lockedUntil, input.now],
        );
      }
      await appendAdminAudit({
        eventType: "admin.auth.login_failed",
        targetId: account?.id ?? "00000000-0000-4000-8000-000000000000",
        metadata: { loginName, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null },
      });
      return adminError(401, "admin_invalid_credentials", "后台账号或密码错误");
    }

    await deps.db.query(
      `
        UPDATE admin_accounts
        SET failed_login_count = 0,
            locked_until = NULL,
            updated_at = $2
        WHERE id = $1
      `,
      [account.id, input.now],
    );

    const token = createSessionToken();
    const expiresAt = new Date(input.now.getTime() + sessionMaxAgeSeconds * 1000);
    const sessionId = randomUUID();
    await deps.db.query(
      `
        INSERT INTO admin_auth_sessions (
          id, admin_account_id, session_token_hash, ip_address, user_agent, expires_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        sessionId,
        account.id,
        hashSessionToken(token),
        input.ipAddress ?? null,
        input.userAgent ?? null,
        expiresAt,
        input.now,
      ],
    );

    const roles = await listRoles(account.id);
    await appendAdminAudit({
      eventType: "admin.auth.login_succeeded",
      targetId: account.id,
      metadata: { loginName, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null },
    });

    return {
      status: 200,
      cookies: [adminSessionCookie(token, sessionMaxAgeSeconds)],
      body: {
        data: {
          account: accountView(account),
          roles,
          permissions: permissionsForRoles(roles),
          session: { id: sessionId, expiresAt: expiresAt.toISOString() },
        },
      },
    };
  }

  async function me(input: {
    sessionToken?: string | null;
    now: Date;
  }): Promise<AdminAuthResponse<{ data: AdminSessionPayload } | { error: { code: string; message: string } }>> {
    const resolved = await resolveSession(input.sessionToken, input.now);
    if (!resolved) {
      return adminError(401, "admin_unauthenticated", "后台登录已过期，请重新登录");
    }
    const roles = await listRoles(resolved.admin_account_id);
    return {
      status: 200,
      body: {
        data: {
          account: accountView({
            id: resolved.admin_account_id,
            login_name: resolved.login_name,
            display_name: resolved.display_name,
            status: resolved.status,
            password_hash: "",
          }),
          roles,
          permissions: permissionsForRoles(roles),
          session: {
            id: resolved.id,
            expiresAt: new Date(resolved.expires_at).toISOString(),
          },
        },
      },
    };
  }

  async function logout(input: {
    sessionToken?: string | null;
    now: Date;
  }): Promise<AdminAuthResponse<{ data: { authenticated: false } }>> {
    const resolved = await resolveSession(input.sessionToken, input.now);
    if (input.sessionToken) {
      await deps.db.query(
        `
          UPDATE admin_auth_sessions
          SET revoked_at = $2
          WHERE session_token_hash = $1
            AND revoked_at IS NULL
        `,
        [hashSessionToken(input.sessionToken), input.now],
      );
    }

    if (resolved) {
      await appendAdminAudit({
        eventType: "admin.auth.logout",
        targetId: resolved.admin_account_id,
        metadata: { sessionId: resolved.id },
      });
    }

    return {
      status: 200,
      cookies: [clearAdminSessionCookie()],
      body: { data: { authenticated: false } },
    };
  }

  async function updateProfile(input: {
    sessionToken?: string | null;
    displayName: string;
    idempotencyKey: string;
    now: Date;
  }): Promise<AdminAuthResponse<{ data: { account: AdminAccountView } } | { error: { code: string; message: string } }>> {
    const resolved = await resolveSession(input.sessionToken, input.now);
    if (!resolved) {
      return adminError(401, "admin_unauthenticated", "后台登录已过期，请重新登录");
    }
    const displayName = input.displayName.trim();
    if (!displayName) {
      return adminError(400, "admin_display_name_required", "请输入显示名称");
    }
    if (displayName.length > 80) {
      return adminError(400, "admin_display_name_too_long", "显示名称不能超过 80 个字符");
    }
    if (!input.idempotencyKey.trim()) {
      return adminError(400, "idempotency_key_required", "缺少 Idempotency-Key");
    }

    const requestHash = hashAdminAuthRequest({
      accountId: resolved.admin_account_id,
      displayName,
    });
    const store = new SqlIdempotencyRecordStore(deps.db);
    const started = await beginOrReplayCommand(store, {
      organizationId: deps.organizationId,
      operationName: operationNames.adminAuthUpdateProfile,
      idempotencyKey: input.idempotencyKey.trim(),
      requestHash,
    }).catch((error) => {
      if (error instanceof IdempotencyConflictError) {
        return "conflict" as const;
      }
      throw error;
    });
    if (started === "conflict") {
      return adminError(409, "idempotency_conflict", "Idempotency-Key 已用于不同请求");
    }
    if (started.kind === "replayed") {
      const replayed = responseFromSnapshot(started.record.responseSnapshot);
      return {
        status: replayed.status,
        body: replayed.body,
      };
    }
    if (started.kind === "processing") {
      return adminError(202, "idempotency_processing", "请求正在处理中");
    }

    const updated = await queryOne<AdminAccountRow>(
      deps.db,
      `
        UPDATE admin_accounts
        SET display_name = $2,
            updated_at = $3
        WHERE id = $1
          AND status = 'active'
        RETURNING id, login_name, password_hash, display_name, status, failed_login_count, locked_until
      `,
      [resolved.admin_account_id, displayName, input.now],
    );
    if (!updated) {
      return adminError(401, "admin_unauthenticated", "后台登录已过期，请重新登录");
    }

    await appendAdminAudit({
      eventType: "admin.auth.profile_updated",
      targetId: updated.id,
      metadata: {
        loginName: updated.login_name,
        sessionId: resolved.id,
        previousDisplayName: resolved.display_name,
        displayName,
      },
    });

    const body = { data: { account: accountView(updated) } };
    await store.update({
      ...started.record,
      responseResourceType: "admin_account",
      responseResourceId: updated.id,
      responseSnapshot: body,
      status: "succeeded",
      updatedAt: input.now,
    });

    return { status: 200, body };
  }

  async function changePassword(input: {
    sessionToken?: string | null;
    oldPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
    idempotencyKey: string;
    now: Date;
  }): Promise<AdminAuthResponse<{ data: { passwordChanged: true } } | { error: { code: string; message: string } }>> {
    const resolved = await resolveSession(input.sessionToken, input.now);
    if (!resolved) {
      return adminError(401, "admin_unauthenticated", "后台登录已过期，请重新登录");
    }
    if (!input.oldPassword || !input.newPassword) {
      return adminError(400, "admin_password_required", "请输入旧密码和新密码");
    }
    if (!input.idempotencyKey.trim()) {
      return adminError(400, "idempotency_key_required", "缺少 Idempotency-Key");
    }
    if (input.newPassword.length < 10) {
      return adminError(400, "admin_password_too_short", "新密码至少需要 10 位");
    }

    const requestHash = hashAdminAuthRequest({
      accountId: resolved.admin_account_id,
      oldPassword: input.oldPassword,
      newPassword: input.newPassword,
      revokeOtherSessions: Boolean(input.revokeOtherSessions),
    });
    const store = new SqlIdempotencyRecordStore(deps.db);
    const started = await beginOrReplayCommand(store, {
      organizationId: deps.organizationId,
      operationName: operationNames.adminAuthChangePassword,
      idempotencyKey: input.idempotencyKey.trim(),
      requestHash,
    }).catch((error) => {
      if (error instanceof IdempotencyConflictError) {
        return "conflict" as const;
      }
      throw error;
    });
    if (started === "conflict") {
      return adminError(409, "idempotency_conflict", "Idempotency-Key 已用于不同请求");
    }
    if (started.kind === "replayed") {
      const replayed = responseFromSnapshot(started.record.responseSnapshot);
      return {
        status: replayed.status,
        body: replayed.body,
      };
    }
    if (started.kind === "processing") {
      return adminError(202, "idempotency_processing", "请求正在处理中");
    }

    const account = await queryOne<AdminAccountRow>(
      deps.db,
      `
        SELECT id, login_name, password_hash, display_name, status, failed_login_count, locked_until
        FROM admin_accounts
        WHERE id = $1
        LIMIT 1
      `,
      [resolved.admin_account_id],
    );
    if (!account || account.status !== "active") {
      return adminError(401, "admin_unauthenticated", "后台登录已过期，请重新登录");
    }
    if (!verifyPassword(input.oldPassword, account.password_hash)) {
      const body = { error: { code: "admin_old_password_invalid", message: "旧密码不正确" } };
      await store.update({
        ...started.record,
        responseResourceType: "admin_account",
        responseResourceId: account.id,
        responseSnapshot: {
          ...body,
          __adminHttpStatus: 400,
        },
        status: "failed_terminal",
        updatedAt: input.now,
      });
      return adminError(400, "admin_old_password_invalid", "旧密码不正确");
    }

    await deps.db.query(
      `
        UPDATE admin_accounts
        SET password_hash = $2,
            updated_at = $3
        WHERE id = $1
      `,
      [account.id, hashAdminPassword(input.newPassword), input.now],
    );

    if (input.revokeOtherSessions) {
      await deps.db.query(
        `
          UPDATE admin_auth_sessions
          SET revoked_at = $3
          WHERE admin_account_id = $1
            AND id <> $2
            AND revoked_at IS NULL
        `,
        [account.id, resolved.id, input.now],
      );
    }

    await appendAdminAudit({
      eventType: "admin.auth.password_changed",
      targetId: account.id,
      metadata: {
        loginName: account.login_name,
        sessionId: resolved.id,
        revokeOtherSessions: Boolean(input.revokeOtherSessions),
      },
    });

    const body = { data: { passwordChanged: true as const } };
    await store.update({
      ...started.record,
      responseResourceType: "admin_account",
      responseResourceId: account.id,
      responseSnapshot: body,
      status: "succeeded",
      updatedAt: input.now,
    });

    return {
      status: 200,
      body,
    };
  }

  async function listSessions(input: {
    sessionToken?: string | null;
    now: Date;
  }): Promise<AdminAuthResponse<{ data: Array<{
    id: string;
    current: boolean;
    ipAddress: string | null;
    userAgent: string | null;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
  }> } | { error: { code: string; message: string } }>> {
    const resolved = await resolveSession(input.sessionToken, input.now);
    if (!resolved) {
      return adminError(401, "admin_unauthenticated", "后台登录已过期，请重新登录");
    }
    const result = await deps.db.query<AdminAuthSessionListRow>(
      `
        SELECT id, ip_address, user_agent, expires_at, revoked_at, created_at
        FROM admin_auth_sessions
        WHERE admin_account_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [resolved.admin_account_id],
    );
    return {
      status: 200,
      body: {
        data: result.rows.map((row) => ({
          id: row.id,
          current: row.id === resolved.id,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          expiresAt: new Date(row.expires_at).toISOString(),
          revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
          createdAt: new Date(row.created_at).toISOString(),
        })),
      },
    };
  }

  async function revokeOtherSessions(input: {
    sessionToken?: string | null;
    idempotencyKey: string;
    now: Date;
  }): Promise<AdminAuthResponse<{ data: { revokedCount: number } } | { error: { code: string; message: string } }>> {
    const resolved = await resolveSession(input.sessionToken, input.now);
    if (!resolved) {
      return adminError(401, "admin_unauthenticated", "后台登录已过期，请重新登录");
    }
    if (!input.idempotencyKey.trim()) {
      return adminError(400, "idempotency_key_required", "缺少 Idempotency-Key");
    }
    const requestHash = hashAdminAuthRequest({
      accountId: resolved.admin_account_id,
    });
    const store = new SqlIdempotencyRecordStore(deps.db);
    const started = await beginOrReplayCommand(store, {
      organizationId: deps.organizationId,
      operationName: operationNames.adminAuthRevokeOtherSessions,
      idempotencyKey: input.idempotencyKey.trim(),
      requestHash,
    }).catch((error) => {
      if (error instanceof IdempotencyConflictError) {
        return "conflict" as const;
      }
      throw error;
    });
    if (started === "conflict") {
      return adminError(409, "idempotency_conflict", "Idempotency-Key 已用于不同请求");
    }
    if (started.kind === "replayed") {
      const replayed = responseFromSnapshot(started.record.responseSnapshot);
      return {
        status: replayed.status,
        body: replayed.body,
      };
    }
    if (started.kind === "processing") {
      return adminError(202, "idempotency_processing", "请求正在处理中");
    }
    const result = await deps.db.query<{ id: string }>(
      `
        UPDATE admin_auth_sessions
        SET revoked_at = $3
        WHERE admin_account_id = $1
          AND id <> $2
          AND revoked_at IS NULL
          AND expires_at > $3
        RETURNING id
      `,
      [resolved.admin_account_id, resolved.id, input.now],
    );
    await appendAdminAudit({
      eventType: "admin.auth.sessions_revoked",
      targetId: resolved.admin_account_id,
      metadata: {
        sessionId: resolved.id,
        revokedSessionIds: result.rows.map((row) => row.id),
        revokedCount: result.rows.length,
      },
    });
    await store.update({
      ...started.record,
      responseResourceType: "admin_account",
      responseResourceId: resolved.admin_account_id,
      responseSnapshot: { data: { revokedCount: result.rows.length } },
      status: "succeeded",
      updatedAt: input.now,
    });
    return {
      status: 200,
      body: { data: { revokedCount: result.rows.length } },
    };
  }

  async function resolveSession(sessionToken: string | null | undefined, now: Date) {
    const token = sessionToken?.trim();
    if (!token) {
      return undefined;
    }

    return queryOne<AdminSessionRow>(
      deps.db,
      `
        SELECT
          s.id,
          s.admin_account_id,
          a.login_name,
          a.display_name,
          a.status,
          s.expires_at
        FROM admin_auth_sessions s
        JOIN admin_accounts a ON a.id = s.admin_account_id
        WHERE s.session_token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > $2
          AND a.status = 'active'
        LIMIT 1
      `,
      [hashSessionToken(token), now],
    );
  }

  async function listRoles(adminAccountId: string) {
    const result = await deps.db.query<{ role_code: string }>(
      `
        SELECT role_code
        FROM admin_account_roles
        WHERE admin_account_id = $1
        ORDER BY role_code ASC
      `,
      [adminAccountId],
    );
    return result.rows.map((row) => row.role_code);
  }

  async function appendAdminAudit(input: {
    eventType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }) {
    await ensureAdminAuditScope();
    await appendAuditEvent(deps.db, {
      organizationId: deps.organizationId,
      workspaceId: deps.workspaceId,
      actorUserId: null,
      eventType: input.eventType,
      targetType: "admin_account",
      targetId: input.targetId,
      metadata: input.metadata,
    });
  }

  async function ensureAdminAuditScope() {
    await deps.db.query(
      `
        INSERT INTO organizations (id, name, status)
        VALUES ($1, 'Comic AI Admin', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [deps.organizationId],
    );
    await deps.db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES ($1, $2, 'Admin Workspace', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [deps.workspaceId, deps.organizationId],
    );
  }

  return {
    login,
    me,
    logout,
    updateProfile,
    changePassword,
    listSessions,
    revokeOtherSessions,
    resolveSession,
  };
}

export function hashAdminPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${digest}`;
}

function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith("plain:")) {
    return storedHash.slice("plain:".length) === password;
  }
  if (!storedHash.startsWith("scrypt:")) {
    return false;
  }
  const [, salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) {
    return false;
  }
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashAdminAuthRequest(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function accountView(row: AdminAccountRow): AdminAccountView {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    status: row.status,
  };
}

function createSessionToken() {
  return `adm_${randomBytes(32).toString("base64url")}`;
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function adminSessionCookie(token: string, maxAgeSeconds: number) {
  return `admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearAdminSessionCookie() {
  return "admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

const rolePermissions: Record<string, AdminPermission[]> = {
  super_admin: [
    "dashboard.read",
    "model.read",
    "model.write",
    "model.publish",
    "user.read",
    "user.write",
    "credit.adjust",
    "risk.read",
    "risk.review",
    "risk.export",
    "ops.task.retry",
    "audit.read",
    "settings.read",
    "settings.write",
    "admin_account.read",
    "admin_account.write",
    "storyboard_prompt:view",
    "storyboard_prompt:create",
    "storyboard_prompt:update",
    "storyboard_prompt:delete",
    "storyboard_prompt:enable",
    "storyboard_prompt:test",
    "storyboard_prompt:export",
    "storyboard_prompt:template",
    "account.password",
  ],
  ops_admin: [
    "dashboard.read",
    "model.read",
    "user.read",
    "risk.read",
    "ops.task.retry",
    "storyboard_prompt:view",
    "storyboard_prompt:create",
    "storyboard_prompt:update",
    "storyboard_prompt:enable",
    "storyboard_prompt:test",
    "storyboard_prompt:template",
    "settings.read",
    "account.password",
  ],
  model_admin: [
    "model.read",
    "model.write",
    "model.publish",
    "account.password",
  ],
  finance_admin: [
    "user.read",
    "credit.adjust",
    "risk.read",
    "risk.review",
    "account.password",
  ],
  support_admin: [
    "user.read",
    "user.write",
    "credit.adjust",
    "account.password",
  ],
  audit_viewer: [
    "dashboard.read",
    "model.read",
    "risk.read",
    "audit.read",
    "settings.read",
    "account.password",
  ],
};

export function permissionsForRoles(roles: string[]): AdminPermission[] {
  return [
    ...new Set(
      roles.flatMap((role) => rolePermissions[role] ?? ["account.password"]),
    ),
  ].sort();
}

function adminError(status: number, code: string, message: string) {
  return {
    status,
    body: { error: { code, message } },
  };
}

function responseFromSnapshot(snapshot?: Record<string, unknown>) {
  if (!snapshot) {
    return { status: 200, body: { data: { passwordChanged: true } } };
  }

  const statusValue = snapshot.__adminHttpStatus;
  const status =
    typeof statusValue === "number" && Number.isInteger(statusValue) ? statusValue : 200;

  if (snapshot.error && typeof snapshot.error === "object") {
    return { status, body: snapshot as { error: { code: string; message: string } } };
  }

  if (snapshot.data) {
    return { status, body: snapshot };
  }

  return { status, body: { data: { passwordChanged: true } } };
}
