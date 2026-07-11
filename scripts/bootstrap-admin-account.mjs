import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { appendAuditEvent } from "../apps/backend/src/modules/audit/audit.service.ts";
import { hashAdminPassword } from "../apps/backend/src/modules/admin-auth/admin-auth.service.ts";
import { createDevDb } from "../apps/backend/src/modules/shared/db/dev-db.ts";

const defaultOrganizationId = "10000000-0000-4000-8000-000000000001";
const defaultWorkspaceId = "20000000-0000-4000-8000-000000000001";
const approvedCleanupLoginNames = new Set(["accept_admin_0624120228"]);

export async function bootstrapAdminAccount(input) {
  const loginName = String(input.loginName ?? "admin").trim();
  const password = String(input.password ?? "");
  const displayName = String(input.displayName ?? "后台管理员").trim();
  const roles = normalizeRoles(input.roles);
  const status = String(input.status ?? "active").trim();
  const remark = String(input.remark ?? "bootstrap admin account").trim();
  const now = input.now ?? new Date();
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const workspaceId = input.workspaceId ?? defaultWorkspaceId;

  if (!loginName || !password || !displayName || roles.length === 0) {
    throw new Error("ADMIN_LOGIN_NAME, ADMIN_PASSWORD, ADMIN_DISPLAY_NAME, and ADMIN_ROLES are required");
  }
  if (password.length < 6) {
    throw new Error("ADMIN_PASSWORD must be at least 6 characters");
  }
  if (!["active", "disabled", "archived"].includes(status)) {
    throw new Error("ADMIN_STATUS must be active, disabled, or archived");
  }

  await ensureAdminScope(input.db, { organizationId, workspaceId });

  const existing = await queryOne(
    input.db,
    `
      SELECT id
      FROM admin_accounts
      WHERE login_name = $1
      LIMIT 1
    `,
    [loginName],
  );
  const accountId = existing?.id ?? uuidFromStableKey(`admin-bootstrap:${loginName}`);
  const created = !existing;

  await input.db.query(
    `
      INSERT INTO admin_accounts (
        id, login_name, password_hash, display_name, status, remark, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      ON CONFLICT (login_name)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status,
        failed_login_count = 0,
        locked_until = NULL,
        remark = EXCLUDED.remark,
        updated_at = EXCLUDED.updated_at
    `,
    [
      accountId,
      loginName,
      hashAdminPassword(password),
      displayName,
      status,
      remark || null,
      now,
    ],
  );

  await input.db.query("DELETE FROM admin_account_roles WHERE admin_account_id = $1", [accountId]);
  for (const role of roles) {
    await input.db.query(
      `
        INSERT INTO admin_account_roles (id, admin_account_id, role_code, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (admin_account_id, role_code) DO NOTHING
      `,
      [uuidFromStableKey(`admin-bootstrap-role:${accountId}:${role}`), accountId, role, now],
    );
  }

  await appendAuditEvent(input.db, {
    organizationId,
    workspaceId,
    actorUserId: null,
    eventType: created ? "admin.account.bootstrapped" : "admin.account.bootstrap_updated",
    targetType: "admin_account",
    targetId: accountId,
    reason: remark || null,
    sensitive: true,
    metadata: {
      loginName,
      displayName,
      roles,
      status,
      passwordProvided: true,
    },
  });

  return {
    accountId,
    loginName,
    displayName,
    roles,
    status,
    created,
  };
}

export async function bootstrapProtectedSuperAdmins(input) {
  const accounts = normalizeProtectedAccounts(input.accounts);
  const cleanupLoginNames = [...new Set(
    (input.cleanupLoginNames ?? []).map((loginName) => String(loginName).trim()).filter(Boolean),
  )];
  if (cleanupLoginNames.some((loginName) => !approvedCleanupLoginNames.has(loginName))) {
    throw new Error("cleanup is only approved for accept_admin_0624120228");
  }
  const now = input.now ?? new Date();
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const workspaceId = input.workspaceId ?? defaultWorkspaceId;

  await input.db.query("BEGIN");
  try {
    await ensureAdminScope(input.db, { organizationId, workspaceId });
    const results = [];
    for (const account of accounts) {
      results.push(await reconcileProtectedAccount(input.db, {
        ...account,
        now,
        organizationId,
        workspaceId,
      }));
    }
    for (const loginName of cleanupLoginNames) {
      await deleteUnusedBootstrapAccount(input.db, loginName);
    }
    await input.db.query("COMMIT");
    return { accounts: results };
  } catch (error) {
    await input.db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function normalizeProtectedAccounts(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("ADMIN_SUPER_ACCOUNT_COUNT must be a positive integer");
  }
  const accounts = value.map((account) => {
    const slot = Number(account?.slot);
    const loginName = String(account?.loginName ?? "").trim();
    const displayName = String(account?.displayName ?? "").trim();
    const password = String(account?.password ?? "");
    if (!Number.isInteger(slot) || slot <= 0) {
      throw new Error("protected super admin slots must be positive integers");
    }
    if (!loginName || !displayName) {
      throw new Error(`ADMIN_SUPER_${slot}_LOGIN_NAME and ADMIN_SUPER_${slot}_DISPLAY_NAME are required`);
    }
    if (password && password.length < 10) {
      throw new Error(`ADMIN_SUPER_${slot}_PASSWORD must be at least 10 characters`);
    }
    return { slot, loginName, displayName, password };
  });
  if (new Set(accounts.map((account) => account.slot)).size !== accounts.length) {
    throw new Error("protected super admin slots must be unique");
  }
  if (new Set(accounts.map((account) => account.loginName)).size !== accounts.length) {
    throw new Error("protected super admin login names must be unique");
  }
  return accounts.sort((left, right) => left.slot - right.slot);
}

async function reconcileProtectedAccount(db, input) {
  let existing = await queryOne(
    db,
    `
      SELECT id, login_name, display_name, status, super_admin_slot
      FROM admin_accounts
      WHERE super_admin_slot = $1
      LIMIT 1
      FOR UPDATE
    `,
    [input.slot],
  );
  const alreadySlotted = Boolean(existing);
  if (!existing) {
    existing = await queryOne(
      db,
      `
        SELECT id, login_name, display_name, status, super_admin_slot
        FROM admin_accounts
        WHERE login_name = $1
        LIMIT 1
        FOR UPDATE
      `,
      [input.loginName],
    );
  }
  if (existing?.super_admin_slot && Number(existing.super_admin_slot) !== input.slot) {
    throw new Error(`ADMIN_SUPER_${input.slot}_LOGIN_NAME is already assigned to another protected slot`);
  }

  const accountId = existing?.id ?? uuidFromStableKey(`admin-bootstrap-protected-slot:${input.slot}`);
  if (!existing && !input.password) {
    throw new Error(`ADMIN_SUPER_${input.slot}_PASSWORD is required for a new protected account`);
  }
  if (existing) {
    const updated = await db.query(
      `
        UPDATE admin_accounts
        SET super_admin_slot = $2,
            status = 'active',
            failed_login_count = 0,
            locked_until = NULL,
            updated_at = $3
        WHERE id = $1
          AND (super_admin_slot IS NULL OR super_admin_slot = $2)
        RETURNING id
      `,
      [accountId, input.slot, input.now],
    );
    if (updated.rows.length !== 1) {
      throw new Error(`ADMIN_SUPER_${input.slot}_LOGIN_NAME is already assigned to another protected slot`);
    }
  } else {
    await db.query(
      `
        INSERT INTO admin_accounts (
          id, login_name, password_hash, display_name, status, super_admin_slot,
          remark, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $7)
      `,
      [
        accountId,
        input.loginName,
        hashAdminPassword(input.password),
        input.displayName,
        input.slot,
        `protected super admin slot ${input.slot}`,
        input.now,
      ],
    );
  }

  await db.query("DELETE FROM admin_account_roles WHERE admin_account_id = $1", [accountId]);
  await db.query(
    `
      INSERT INTO admin_account_roles (id, admin_account_id, role_code, created_at)
      VALUES ($1, $2, 'super_admin', $3)
    `,
    [uuidFromStableKey(`admin-bootstrap-role:${accountId}:super_admin`), accountId, input.now],
  );

  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    actorUserId: null,
    eventType: alreadySlotted ? "admin.account.protected_reconciled" : "admin.account.protected_bound",
    targetType: "admin_account",
    targetId: accountId,
    reason: `bootstrap protected super admin slot ${input.slot}`,
    sensitive: true,
    metadata: {
      slot: input.slot,
      loginName: existing?.login_name ?? input.loginName,
      passwordProvided: Boolean(input.password),
    },
  });

  const resolved = await queryOne(
    db,
    `
      SELECT id, login_name, display_name, status, super_admin_slot
      FROM admin_accounts
      WHERE id = $1
    `,
    [accountId],
  );
  return {
    accountId,
    slot: Number(resolved.super_admin_slot),
    loginName: resolved.login_name,
    displayName: resolved.display_name,
    status: resolved.status,
    created: !existing,
  };
}

async function deleteUnusedBootstrapAccount(db, loginName) {
  const existing = await queryOne(
    db,
    "SELECT id, super_admin_slot FROM admin_accounts WHERE login_name = $1 FOR UPDATE",
    [loginName],
  );
  if (!existing) return;
  if (existing.super_admin_slot !== null) {
    throw new Error(`refusing to delete protected super admin ${loginName}`);
  }
  await db.query("DELETE FROM admin_auth_sessions WHERE admin_account_id = $1", [existing.id]);
  await db.query("DELETE FROM admin_account_roles WHERE admin_account_id = $1", [existing.id]);
  const deleted = await db.query(
    "DELETE FROM admin_accounts WHERE id = $1 AND super_admin_slot IS NULL RETURNING id",
    [existing.id],
  );
  if (deleted.rows.length !== 1) {
    throw new Error(`refusing to delete protected super admin ${loginName}`);
  }
}

function normalizeRoles(value) {
  const rawRoles = Array.isArray(value)
    ? value
    : String(value ?? "super_admin").split(",");
  return [...new Set(rawRoles.map((role) => String(role).trim()).filter(Boolean))].sort();
}

export function assertLegacyBootstrapRolesAllowed(value) {
  if (normalizeRoles(value).includes("super_admin")) {
    throw new Error("ADMIN_SUPER_ACCOUNT_COUNT is required to bootstrap super_admin accounts");
  }
}

async function ensureAdminScope(db, input) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Comic AI Admin', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [input.organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Admin Workspace', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [input.workspaceId, input.organizationId],
  );
}

async function queryOne(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

function uuidFromStableKey(key) {
  const hex = createHash("sha256").update(key).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function loadDotEnvFile(envFilePath = ".env") {
  if (!existsSync(envFilePath)) return;
  const content = readFileSync(envFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadDotEnvFile();
  const db = await createDevDb();
  try {
    const protectedAccountCount = String(process.env.ADMIN_SUPER_ACCOUNT_COUNT ?? "").trim();
    if (!protectedAccountCount) {
      assertLegacyBootstrapRolesAllowed(process.env.ADMIN_ROLES);
    }
    const result = protectedAccountCount
      ? await bootstrapProtectedSuperAdmins({
          db,
          accounts: protectedAccountsFromEnv(protectedAccountCount),
          cleanupLoginNames: String(process.env.ADMIN_SUPER_CLEANUP_LOGIN_NAMES ?? "")
            .split(",")
            .map((loginName) => loginName.trim())
            .filter(Boolean),
          organizationId: process.env.ADMIN_ORGANIZATION_ID || defaultOrganizationId,
          workspaceId: process.env.ADMIN_WORKSPACE_ID || defaultWorkspaceId,
          now: new Date(),
        })
      : await bootstrapAdminAccount({
          db,
          loginName: process.env.ADMIN_LOGIN_NAME,
          password: process.env.ADMIN_PASSWORD,
          displayName: process.env.ADMIN_DISPLAY_NAME,
          roles: process.env.ADMIN_ROLES,
          status: process.env.ADMIN_STATUS || "active",
          remark: process.env.ADMIN_BOOTSTRAP_REASON || "bootstrap admin account",
          organizationId: process.env.ADMIN_ORGANIZATION_ID || defaultOrganizationId,
          workspaceId: process.env.ADMIN_WORKSPACE_ID || defaultWorkspaceId,
          now: new Date(),
        });
    console.log(
      JSON.stringify(
        "accounts" in result
          ? { accounts: result.accounts }
          : {
              accountId: result.accountId,
              loginName: result.loginName,
              displayName: result.displayName,
              roles: result.roles,
              status: result.status,
              created: result.created,
            },
        null,
        2,
      ),
    );
  } finally {
    await db.close?.();
  }
}

function protectedAccountsFromEnv(rawCount) {
  const count = Number(rawCount);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("ADMIN_SUPER_ACCOUNT_COUNT must be a positive integer");
  }
  return Array.from({ length: count }, (_, index) => {
    const slot = index + 1;
    return {
      slot,
      loginName: process.env[`ADMIN_SUPER_${slot}_LOGIN_NAME`],
      displayName: process.env[`ADMIN_SUPER_${slot}_DISPLAY_NAME`],
      password: process.env[`ADMIN_SUPER_${slot}_PASSWORD`],
    };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
