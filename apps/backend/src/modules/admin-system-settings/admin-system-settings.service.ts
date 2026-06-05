import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { hashAdminPassword } from "../admin-auth/admin-auth.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export function createAdminSystemSettingsService(deps: { db: SqlDatabase }) {
  async function listSettings() {
    const configs = await deps.db.query<RuntimeConfigRow>(
      `
        SELECT key, value_json, value_type, scope, description, updated_at
        FROM runtime_config_entries
        ORDER BY scope ASC, key ASC
      `,
    );
    const secretReferences = await deps.db.query<SecretReferenceRow>(
      `
        SELECT id, secret_ref, env_name, purpose, provider_name, status, last_checked_at
        FROM admin_secret_references
        ORDER BY provider_name ASC NULLS LAST, env_name ASC
      `,
    );

    return {
      data: {
        configs: configs.rows.map(configFromRow),
        secretReferences: secretReferences.rows.map(secretReferenceFromRow),
      },
    };
  }

  async function updateRuntimeConfig(input: {
    key: string;
    value: unknown;
    valueType: string;
    scope: string;
    description?: string | null;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const key = input.key.trim();
    const reason = input.reason.trim();
    if (!key) {
      return error(400, "config_key_required", "配置键不能为空");
    }
    if (!reason) {
      return error(400, "reason_required", "请填写操作原因");
    }
    if (!["string", "number", "boolean", "json", "string_array"].includes(input.valueType)) {
      return error(400, "invalid_value_type", "配置值类型不支持");
    }
    if (!isRuntimeConfigValueValid(input.value, input.valueType)) {
      return error(400, "invalid_config_value", "runtime config value does not match declared type");
    }
    if (!["global", "admin", "creator", "model", "billing", "risk"].includes(input.scope)) {
      return error(400, "invalid_config_scope", "配置作用域不支持");
    }

    const previous = await queryOne<RuntimeConfigRow>(
      deps.db,
      `
        SELECT key, value_json, value_type, scope, description, updated_at
        FROM runtime_config_entries
        WHERE key = $1
      `,
      [key],
    );

    await deps.db.query(
      `
        INSERT INTO runtime_config_entries (
          key, value_json, value_type, scope, description, updated_by_admin_id, updated_at
        )
        VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7)
        ON CONFLICT (key)
        DO UPDATE SET
          value_json = EXCLUDED.value_json,
          value_type = EXCLUDED.value_type,
          scope = EXCLUDED.scope,
          description = EXCLUDED.description,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        key,
        JSON.stringify(input.value),
        input.valueType,
        input.scope,
        input.description?.trim() || null,
        input.actorAdminAccountId,
        input.now,
      ],
    );

    await deps.db.query(
      `
        INSERT INTO runtime_config_revisions (
          id, config_key, previous_value_json, next_value_json, changed_by_admin_id, reason, created_at
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        uuidFromIdempotencyKey(input.idempotencyKey),
        key,
        previous ? JSON.stringify(previous.value_json) : null,
        JSON.stringify(input.value),
        input.actorAdminAccountId,
        reason,
        input.now,
      ],
    );

    const auditId = uuidFromIdempotencyKey(`${input.idempotencyKey}:audit`);
    const existingAudit = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM audit_events WHERE id = $1",
      [auditId],
    );
    if (!existingAudit) {
      await appendAuditEvent(deps.db, {
        organizationId: input.auditOrganizationId,
        workspaceId: input.auditWorkspaceId,
        actorUserId: null,
        eventType: "admin.settings.updated",
        targetType: "admin_account",
        targetId: input.actorAdminAccountId,
        reason,
        sensitive: true,
        metadata: {
          key,
          previousValue: previous?.value_json ?? null,
          nextValue: input.value,
          valueType: input.valueType,
          scope: input.scope,
        },
      });
    }

    return {
      status: 200,
      body: {
        data: configFromRow({
          key,
          value_json: input.value,
          value_type: input.valueType,
          scope: input.scope,
          description: input.description?.trim() || null,
          updated_at: input.now,
        }),
      },
    };
  }

  async function listRuntimeConfigRevisions(input: {
    key?: string | null;
    pageSize?: number;
  }) {
    const pageSize = clampPageSize(input.pageSize);
    const rows = await deps.db.query<RuntimeConfigRevisionRow>(
      `
        SELECT
          id,
          config_key,
          previous_value_json,
          next_value_json,
          changed_by_admin_id,
          reason,
          created_at
        FROM runtime_config_revisions
        WHERE ($1::text IS NULL OR config_key = $1)
        ORDER BY created_at DESC, id ASC
        LIMIT $2
      `,
      [input.key?.trim() || null, pageSize],
    );
    return { data: rows.rows.map(runtimeConfigRevisionFromRow) };
  }

  async function rollbackRuntimeConfig(input: {
    key: string;
    revisionId: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const key = input.key.trim();
    const revisionId = input.revisionId.trim();
    const reason = input.reason.trim();
    if (!key || !revisionId) {
      return error(400, "config_revision_required", "config key and revision id are required");
    }
    if (!reason) {
      return error(400, "reason_required", "reason is required");
    }

    const revision = await queryOne<RuntimeConfigRevisionRow>(
      deps.db,
      `
        SELECT
          id,
          config_key,
          previous_value_json,
          next_value_json,
          changed_by_admin_id,
          reason,
          created_at
        FROM runtime_config_revisions
        WHERE id = $1
          AND config_key = $2
      `,
      [revisionId, key],
    );
    if (!revision) {
      return error(404, "config_revision_not_found", "config revision not found");
    }
    if (revision.previous_value_json === null || revision.previous_value_json === undefined) {
      return error(400, "config_revision_not_rollbackable", "selected revision has no previous value");
    }

    const current = await queryOne<RuntimeConfigRow>(
      deps.db,
      `
        SELECT key, value_json, value_type, scope, description, updated_at
        FROM runtime_config_entries
        WHERE key = $1
      `,
      [key],
    );
    if (!current) {
      return error(404, "config_not_found", "config not found");
    }

    const nextValue = normalizeJson(revision.previous_value_json);
    await deps.db.query(
      `
        UPDATE runtime_config_entries
        SET value_json = $2::jsonb,
            updated_by_admin_id = $3,
            updated_at = $4
        WHERE key = $1
      `,
      [key, JSON.stringify(nextValue), input.actorAdminAccountId, input.now],
    );

    await deps.db.query(
      `
        INSERT INTO runtime_config_revisions (
          id, config_key, previous_value_json, next_value_json, changed_by_admin_id, reason, created_at
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        uuidFromIdempotencyKey(input.idempotencyKey),
        key,
        JSON.stringify(current.value_json),
        JSON.stringify(nextValue),
        input.actorAdminAccountId,
        reason,
        input.now,
      ],
    );

    const existingAudit = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM audit_events WHERE id = $1",
      [uuidFromIdempotencyKey(`${input.idempotencyKey}:rollback-audit`)],
    );
    if (!existingAudit) {
      await appendAuditEvent(deps.db, {
        organizationId: input.auditOrganizationId,
        workspaceId: input.auditWorkspaceId,
        actorUserId: null,
        eventType: "admin.settings.rolled_back",
        targetType: "runtime_config",
        targetId: input.actorAdminAccountId,
        reason,
        sensitive: true,
        metadata: {
          key,
          revisionId,
          previousValue: current.value_json,
          nextValue,
        },
      });
    }

    return {
      status: 200,
      body: {
        data: configFromRow({
          key,
          value_json: nextValue,
          value_type: current.value_type,
          scope: current.scope,
          description: current.description,
          updated_at: input.now,
        }),
      },
    };
  }

  async function createSecretReference(input: {
    secretRef: string;
    envName: string;
    purpose: string;
    providerName?: string | null;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const secretRef = input.secretRef.trim();
    const envName = input.envName.trim();
    const purpose = input.purpose.trim();
    if (!secretRef || !envName || !purpose) {
      return error(400, "secret_reference_required", "请填写密钥引用、环境变量名和用途");
    }

    const row = await queryOne<SecretReferenceRow>(
      deps.db,
      `
        INSERT INTO admin_secret_references (
          id, secret_ref, env_name, purpose, provider_name, status, created_by_admin_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'unknown', $6, $7, $7)
        ON CONFLICT (env_name)
        DO UPDATE SET
          secret_ref = EXCLUDED.secret_ref,
          purpose = EXCLUDED.purpose,
          provider_name = EXCLUDED.provider_name,
          updated_at = EXCLUDED.updated_at
        RETURNING id, secret_ref, env_name, purpose, provider_name, status, last_checked_at
      `,
      [
        randomUUID(),
        secretRef,
        envName,
        purpose,
        input.providerName?.trim() || null,
        input.actorAdminAccountId,
        input.now,
      ],
    );

    return {
      status: 200,
      body: { data: secretReferenceFromRow(row!) },
    };
  }

  async function probeSecretReference(input: {
    id: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const id = input.id.trim();
    const reason = input.reason.trim();
    if (!id) {
      return error(400, "secret_reference_id_required", "secret reference id is required");
    }
    if (!reason) {
      return error(400, "reason_required", "reason is required");
    }

    const existing = await queryOne<SecretReferenceRow>(
      deps.db,
      `
        SELECT id, secret_ref, env_name, purpose, provider_name, status, last_checked_at
        FROM admin_secret_references
        WHERE id = $1
      `,
      [id],
    );
    if (!existing) {
      return error(404, "secret_reference_not_found", "secret reference not found");
    }

    const envValue = process.env[existing.env_name];
    const status = typeof envValue === "string" && envValue.trim().length > 0 ? "configured" : "missing";
    const row = await queryOne<SecretReferenceRow>(
      deps.db,
      `
        UPDATE admin_secret_references
        SET status = $2,
            last_checked_at = $3,
            updated_at = $3
        WHERE id = $1
        RETURNING id, secret_ref, env_name, purpose, provider_name, status, last_checked_at
      `,
      [id, status, input.now],
    );

    const existingAudit = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM audit_events WHERE id = $1",
      [uuidFromIdempotencyKey(`${input.idempotencyKey}:secret-probe-audit`)],
    );
    if (!existingAudit) {
      await appendAuditEvent(deps.db, {
        organizationId: input.auditOrganizationId,
        workspaceId: input.auditWorkspaceId,
        actorUserId: null,
        eventType: "admin.secret_reference.probed",
        targetType: "admin_secret_reference",
        targetId: id,
        reason,
        sensitive: true,
        metadata: {
          referenceId: id,
          envName: existing.env_name,
          providerName: existing.provider_name,
          status,
          checkedAt: input.now.toISOString(),
        },
        occurredAt: input.now,
      });
    }

    return {
      status: 200,
      body: { data: secretReferenceFromRow(row!) },
    };
  }

  async function listAdminAccounts() {
    const rows = await deps.db.query<AdminAccountRow>(
      `
        SELECT
          a.id,
          a.login_name,
          a.display_name,
          a.status,
          a.remark,
          a.created_at,
          COALESCE(jsonb_agg(r.role_code ORDER BY r.role_code) FILTER (WHERE r.role_code IS NOT NULL), '[]'::jsonb) AS roles_json
        FROM admin_accounts a
        LEFT JOIN admin_account_roles r ON r.admin_account_id = a.id
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `,
    );
    return { data: rows.rows.map(adminAccountFromRow) };
  }

  async function createAdminAccount(input: {
    loginName: string;
    password: string;
    displayName: string;
    roles: string[];
    remark?: string | null;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const loginName = input.loginName.trim();
    const password = input.password;
    const displayName = input.displayName.trim();
    const roles = [...new Set(input.roles.map((role) => role.trim()).filter(Boolean))];
    const remark = input.remark?.trim() || null;
    if (!loginName || !password || !displayName || roles.length === 0) {
      return error(400, "admin_account_required", "请填写账号、密码、显示名和角色");
    }

    const accountId = uuidFromIdempotencyKey(input.idempotencyKey);
    await deps.db.query(
      `
        INSERT INTO admin_accounts (
          id, login_name, password_hash, display_name, status, remark, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'active', $5, $6, $6)
        ON CONFLICT (login_name)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          remark = EXCLUDED.remark,
          updated_at = EXCLUDED.updated_at
      `,
      [
        accountId,
        loginName,
        hashAdminPassword(password),
        displayName,
        remark,
        input.now,
      ],
    );

    const account = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM admin_accounts WHERE login_name = $1",
      [loginName],
    );
    const resolvedAccountId = account?.id ?? accountId;
    await deps.db.query("DELETE FROM admin_account_roles WHERE admin_account_id = $1", [
      resolvedAccountId,
    ]);
    for (const role of roles) {
      await deps.db.query(
        `
          INSERT INTO admin_account_roles (id, admin_account_id, role_code, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (admin_account_id, role_code) DO NOTHING
        `,
        [uuidFromIdempotencyKey(`${resolvedAccountId}:${role}`), resolvedAccountId, role, input.now],
      );
    }

    const existingAudit = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM audit_events WHERE id = $1",
      [uuidFromIdempotencyKey(`${input.idempotencyKey}:account-audit`)],
    );
    if (!existingAudit) {
      await appendAuditEvent(deps.db, {
        organizationId: input.auditOrganizationId,
        workspaceId: input.auditWorkspaceId,
        actorUserId: null,
        eventType: "admin.account.created",
        targetType: "admin_account",
        targetId: resolvedAccountId,
        reason: remark,
        metadata: { loginName, displayName, roles },
      });
    }

    return {
      status: 200,
      body: {
        data: {
          id: resolvedAccountId,
          loginName,
          displayName,
          status: "active",
          remark,
          roles,
        },
      },
    };
  }

  async function updateAdminAccount(input: {
    accountId: string;
    displayName: string;
    roles: string[];
    status: string;
    remark?: string | null;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const accountId = input.accountId.trim();
    const displayName = input.displayName.trim();
    const roles = [...new Set(input.roles.map((role) => role.trim()).filter(Boolean))].sort();
    const status = input.status.trim();
    const remark = input.remark?.trim() || null;
    const reason = input.reason.trim();
    if (!displayName || roles.length === 0) {
      return error(400, "admin_account_required", "display name and roles are required");
    }
    if (!["active", "disabled", "archived"].includes(status)) {
      return error(400, "invalid_admin_account_status", "admin account status is invalid");
    }
    if (!reason) {
      return error(400, "reason_required", "reason is required");
    }

    const existing = await queryOne<AdminAccountBaseRow>(
      deps.db,
      `
        SELECT id, login_name, display_name, status, remark, created_at
        FROM admin_accounts
        WHERE id = $1
      `,
      [accountId],
    );
    if (!existing) {
      return error(404, "admin_account_not_found", "admin account not found");
    }

    await deps.db.query(
      `
        UPDATE admin_accounts
        SET display_name = $2,
            status = $3,
            remark = $4,
            updated_at = $5
        WHERE id = $1
      `,
      [accountId, displayName, status, remark, input.now],
    );

    await deps.db.query("DELETE FROM admin_account_roles WHERE admin_account_id = $1", [accountId]);
    for (const role of roles) {
      await deps.db.query(
        `
          INSERT INTO admin_account_roles (id, admin_account_id, role_code, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (admin_account_id, role_code) DO NOTHING
        `,
        [uuidFromIdempotencyKey(`${accountId}:${role}`), accountId, role, input.now],
      );
    }

    const existingAudit = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM audit_events WHERE id = $1",
      [uuidFromIdempotencyKey(`${input.idempotencyKey}:account-update-audit`)],
    );
    if (!existingAudit) {
      await appendAuditEvent(deps.db, {
        organizationId: input.auditOrganizationId,
        workspaceId: input.auditWorkspaceId,
        actorUserId: null,
        eventType: "admin.account.updated",
        targetType: "admin_account",
        targetId: accountId,
        reason,
        sensitive: true,
        metadata: {
          previous: {
            displayName: existing.display_name,
            status: existing.status,
            remark: existing.remark,
          },
          next: { displayName, status, remark, roles },
        },
      });
    }

    return {
      status: 200,
      body: {
        data: {
          id: accountId,
          loginName: existing.login_name,
          displayName,
          status,
          remark,
          roles,
          createdAt: new Date(existing.created_at).toISOString(),
        },
      },
    };
  }

  async function resetAdminAccountPassword(input: {
    accountId: string;
    newPassword: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const accountId = input.accountId.trim();
    const newPassword = input.newPassword;
    const reason = input.reason.trim();
    if (!accountId) {
      return error(400, "admin_account_required", "admin account id is required");
    }
    if (!newPassword) {
      return error(400, "admin_password_required", "new password is required");
    }
    if (newPassword.length < 10) {
      return error(400, "admin_password_too_short", "new password must be at least 10 characters");
    }
    if (!reason) {
      return error(400, "reason_required", "reason is required");
    }

    const existing = await queryOne<AdminAccountBaseRow>(
      deps.db,
      `
        SELECT id, login_name, display_name, status, remark, created_at
        FROM admin_accounts
        WHERE id = $1
      `,
      [accountId],
    );
    if (!existing) {
      return error(404, "admin_account_not_found", "admin account not found");
    }

    await deps.db.query(
      `
        UPDATE admin_accounts
        SET password_hash = $2,
            updated_at = $3
        WHERE id = $1
      `,
      [accountId, hashAdminPassword(newPassword), input.now],
    );
    await deps.db.query(
      `
        UPDATE admin_auth_sessions
        SET revoked_at = $2
        WHERE admin_account_id = $1
          AND revoked_at IS NULL
      `,
      [accountId, input.now],
    );

    const existingAudit = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM audit_events WHERE id = $1",
      [uuidFromIdempotencyKey(`${input.idempotencyKey}:account-password-reset-audit`)],
    );
    if (!existingAudit) {
      await appendAuditEvent(deps.db, {
        organizationId: input.auditOrganizationId,
        workspaceId: input.auditWorkspaceId,
        actorUserId: null,
        eventType: "admin.account.password_reset",
        targetType: "admin_account",
        targetId: accountId,
        reason,
        sensitive: true,
        metadata: {
          loginName: existing.login_name,
          displayName: existing.display_name,
          actorAdminAccountId: input.actorAdminAccountId,
          revokedExistingSessions: true,
        },
      });
    }

    return {
      status: 200,
      body: {
        data: {
          accountId,
          passwordReset: true,
        },
      },
    };
  }

  return {
    listSettings,
    updateRuntimeConfig,
    listRuntimeConfigRevisions,
    rollbackRuntimeConfig,
    createSecretReference,
    probeSecretReference,
    listAdminAccounts,
    createAdminAccount,
    updateAdminAccount,
    resetAdminAccountPassword,
  };
}

interface RuntimeConfigRow {
  key: string;
  value_json: unknown;
  value_type: string;
  scope: string;
  description: string | null;
  updated_at: Date | string;
}

interface RuntimeConfigRevisionRow {
  id: string;
  config_key: string;
  previous_value_json: unknown;
  next_value_json: unknown;
  changed_by_admin_id: string | null;
  reason: string | null;
  created_at: Date | string;
}

interface SecretReferenceRow {
  id: string;
  secret_ref: string;
  env_name: string;
  purpose: string;
  provider_name: string | null;
  status: string;
  last_checked_at: Date | string | null;
}

interface AdminAccountRow {
  id: string;
  login_name: string;
  display_name: string;
  status: string;
  remark: string | null;
  created_at: Date | string;
  roles_json: unknown;
}

interface AdminAccountBaseRow {
  id: string;
  login_name: string;
  display_name: string;
  status: string;
  remark: string | null;
  created_at: Date | string;
}

function configFromRow(row: RuntimeConfigRow) {
  return {
    key: row.key,
    value: normalizeJson(row.value_json),
    valueType: row.value_type,
    scope: row.scope,
    description: row.description,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function secretReferenceFromRow(row: SecretReferenceRow) {
  return {
    id: row.id,
    secretRef: row.secret_ref,
    envName: row.env_name,
    purpose: row.purpose,
    providerName: row.provider_name,
    status: row.status,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
  };
}

function runtimeConfigRevisionFromRow(row: RuntimeConfigRevisionRow) {
  return {
    id: row.id,
    configKey: row.config_key,
    previousValue: normalizeJson(row.previous_value_json),
    nextValue: normalizeJson(row.next_value_json),
    changedByAdminId: row.changed_by_admin_id,
    reason: row.reason,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function adminAccountFromRow(row: AdminAccountRow) {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    status: row.status,
    remark: row.remark,
    roles: parseJsonArray(row.roles_json),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function normalizeJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value === "string") {
    return parseJsonArray(JSON.parse(value) as unknown);
  }
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function isRuntimeConfigValueValid(value: unknown, valueType: string): boolean {
  if (valueType === "string") return typeof value === "string";
  if (valueType === "number") return typeof value === "number" && Number.isFinite(value);
  if (valueType === "boolean") return typeof value === "boolean";
  if (valueType === "string_array") {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }
  if (valueType === "json") {
    return value !== undefined && typeof value !== "function" && typeof value !== "symbol";
  }
  return false;
}

function clampPageSize(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 50;
  return Math.min(Math.max(Math.trunc(value!), 1), 100);
}

function uuidFromIdempotencyKey(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function error(status: number, code: string, message: string) {
  return {
    status,
    body: { error: { code, message } },
  };
}
