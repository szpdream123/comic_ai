import type {
  AdminPermission,
  AdminSessionPayload,
  AdminResolvedSession,
  createAdminAuthService,
} from "./admin-auth.service.ts";
import { getUserAuthRequestContext } from "../identity/user-auth-request-context.service.ts";

export interface AdminPrincipal {
  adminAccountId: string;
  sessionId: string;
  loginName: string;
  displayName: string;
  status: string;
  expiresAt: string;
  roles: string[];
  permissions: AdminPermission[];
}

export interface AdminHttpAuthInput {
  cookieHeader?: string;
  now?: Date;
  requestContext?: object;
}

export interface AdminHttpAuthPolicy {
  requiredRoles?: string[];
  requiredPermissions?: AdminPermission[];
}

export type AdminHttpAuthFailure = {
  ok: false;
  response: {
    status: 401 | 403;
    body: { error: { code: "admin_unauthenticated" | "admin_forbidden"; message: string } };
  };
};

export type AdminHttpAuthSuccess = {
  ok: true;
  principal: AdminPrincipal;
  session: AdminResolvedSession;
  roles: string[];
  permissions: AdminPermission[];
};

export type AdminHttpAuthResult = AdminHttpAuthSuccess | AdminHttpAuthFailure;

type AdminPrincipalResolver = Pick<ReturnType<typeof createAdminAuthService>, "resolvePrincipal">;

export function createAdminHttpAuth(deps: { adminAuth: AdminPrincipalResolver }) {
  const requestPrincipals = new WeakMap<object, Promise<AdminPrincipal | undefined>>();

  async function resolve(input: AdminHttpAuthInput): Promise<AdminPrincipal | undefined> {
    const requestContext = input.requestContext ?? getUserAuthRequestContext();
    if (!requestContext) {
      return resolveUncached(input);
    }
    const existing = requestPrincipals.get(requestContext);
    if (existing) {
      return existing;
    }
    const pending = resolveUncached(input);
    requestPrincipals.set(requestContext, pending);
    return pending;
  }

  async function resolveUncached(input: AdminHttpAuthInput): Promise<AdminPrincipal | undefined> {
    const payload = await deps.adminAuth.resolvePrincipal(
      parseCookie(input.cookieHeader, "admin_session"),
      input.now ?? new Date(),
    );
    return payload ? principalFromPayload(payload) : undefined;
  }

  async function requireAdmin(
    input: AdminHttpAuthInput,
    policy: AdminHttpAuthPolicy = {},
  ): Promise<AdminHttpAuthResult> {
    const principal = await resolve(input);
    if (!principal) {
      return unauthenticated();
    }
    if (
      policy.requiredRoles?.length
      && !policy.requiredRoles.some((role) => principal.roles.includes(role))
    ) {
      return forbidden();
    }
    if (
      policy.requiredPermissions?.length
      && !policy.requiredPermissions.every((permission) => principal.permissions.includes(permission))
    ) {
      return forbidden();
    }
    return {
      ok: true,
      principal,
      session: legacySessionFromPrincipal(principal),
      roles: principal.roles,
      permissions: principal.permissions,
    };
  }

  function requirePermissions(input: AdminHttpAuthInput, permissions: AdminPermission[]) {
    return requireAdmin(input, { requiredPermissions: permissions });
  }

  function requireAnyRole(input: AdminHttpAuthInput, roles: string[]) {
    return requireAdmin(input, { requiredRoles: roles });
  }

  return {
    resolve,
    requireAdmin,
    requirePermissions,
    requireAnyRole,
  };
}

function principalFromPayload(payload: AdminSessionPayload): AdminPrincipal {
  return {
    adminAccountId: payload.account.id,
    sessionId: payload.session.id,
    loginName: payload.account.loginName,
    displayName: payload.account.displayName,
    status: payload.account.status,
    expiresAt: payload.session.expiresAt,
    roles: payload.roles,
    permissions: payload.permissions,
  };
}

function legacySessionFromPrincipal(principal: AdminPrincipal): AdminResolvedSession {
  return {
    id: principal.sessionId,
    admin_account_id: principal.adminAccountId,
    login_name: principal.loginName,
    display_name: principal.displayName,
    status: principal.status,
    expires_at: principal.expiresAt,
  };
}

function parseCookie(header: string | undefined, cookieName: string) {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === cookieName) {
      return value.join("=");
    }
  }
  return undefined;
}

function unauthenticated(): AdminHttpAuthFailure {
  return {
    ok: false,
    response: {
      status: 401,
      body: { error: { code: "admin_unauthenticated", message: "管理员登录已过期，请重新登录。" } },
    },
  };
}

function forbidden(): AdminHttpAuthFailure {
  return {
    ok: false,
    response: {
      status: 403,
      body: { error: { code: "admin_forbidden", message: "当前管理员账号没有操作权限。" } },
    },
  };
}
