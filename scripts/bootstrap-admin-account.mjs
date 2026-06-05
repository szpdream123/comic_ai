import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { appendAuditEvent } from "../apps/backend/src/modules/audit/audit.service.ts";
import { hashAdminPassword } from "../apps/backend/src/modules/admin-auth/admin-auth.service.ts";
import { createDevDb } from "../apps/backend/src/modules/shared/db/dev-db.ts";

const defaultOrganizationId = "10000000-0000-4000-8000-000000000001";
const defaultWorkspaceId = "20000000-0000-4000-8000-000000000001";

export async function bootstrapAdminAccount(input) {
  const loginName = String(input.loginName ?? "admin").trim();
  const password = String(input.password ?? "admin123");
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

function normalizeRoles(value) {
  const rawRoles = Array.isArray(value)
    ? value
    : String(value ?? "super_admin").split(",");
  return [...new Set(rawRoles.map((role) => String(role).trim()).filter(Boolean))].sort();
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
    const result = await bootstrapAdminAccount({
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
        {
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
