import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { hashAdminPassword } from "../admin-auth/admin-auth.service.ts";
import {
  buildPublicLegalDocument,
  defaultLegalDocumentValue,
  defaultLegalDocuments,
  findEnabledLegalDocument,
  legalDocumentTypeFromLegacyKey,
  legalDocumentConfigs,
  legalDocumentsConfigKey,
  legalDocumentsRevisionId,
  migrateLegacyLegalDocuments,
  normalizeLegalDocuments,
  normalizeLegalDocumentValue,
  publicLegalDocumentKeyByType,
  sanitizeLegalDocumentsForStorage,
  type LegalDocumentRecord,
  type LegalDocumentType,
} from "./legal-documents.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const DEFAULT_RUNTIME_CONFIGS: RuntimeConfigRow[] = [
  {
    key: "team.default_subaccount_limit",
    value_json: 50,
    value_type: "number",
    scope: "creator",
    description: "默认团队子账号上限",
    updated_at: null,
  },
  {
    key: legalDocumentsConfigKey,
    value_json: defaultLegalDocuments(),
    value_type: "json",
    scope: "creator",
    description: "登录页协议列表与启用版本管理",
    updated_at: null,
  },
  {
    key: legalDocumentConfigs.serviceAgreement.key,
    value_json: defaultLegalDocumentValue(legalDocumentConfigs.serviceAgreement.key),
    value_type: "json",
    scope: "creator",
    description: legalDocumentConfigs.serviceAgreement.description,
    updated_at: null,
  },
  {
    key: legalDocumentConfigs.privacyPolicy.key,
    value_json: defaultLegalDocumentValue(legalDocumentConfigs.privacyPolicy.key),
    value_type: "json",
    scope: "creator",
    description: legalDocumentConfigs.privacyPolicy.description,
    updated_at: null,
  },
];

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
        configs: withDefaultRuntimeConfigs(configs.rows).map(configFromRow),
        secretReferences: secretReferences.rows.map(secretReferenceFromRow),
      },
    };
  }

  async function getPublicLegalDocuments() {
    const documents = await readLegalDocumentsFromDb(deps.db, new Date());

    return {
      data: {
        serviceAgreement: buildPublicLegalDocument(
          "service",
          findEnabledLegalDocument(documents, "service"),
        ),
        privacyPolicy: buildPublicLegalDocument(
          "privacy",
          findEnabledLegalDocument(documents, "privacy"),
        ),
      },
    };
  }

  async function listLegalDocuments() {
    const documents = await readLegalDocumentsFromDb(deps.db, new Date());
    return {
      data: {
        documents: documents
          .filter((document) => !document.deleted)
          .map((document) => adminLegalDocumentFromRecord(document)),
      },
    };
  }

  async function createLegalDocument(input: {
    type: string;
    title: string;
    contentHtml: string;
    versionLabel?: string | null;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const type = normalizeLegalDocumentTypeInput(input.type);
    const reason = input.reason.trim();
    if (!type) {
      return error(400, "legal_document_type_invalid", "legal document type is invalid");
    }
    if (!reason) {
      return error(400, "reason_required", "reason is required");
    }
    const documents = await readLegalDocumentsFromDb(deps.db, input.now);
    const nextDocument: LegalDocumentRecord = {
      id: randomUUID(),
      type,
      title: input.title.trim() || publicLegalDocumentTitle(type),
      contentHtml: input.contentHtml.trim() || defaultLegalDocumentContent(type),
      versionLabel: input.versionLabel?.trim() || null,
      status: "disabled",
      deleted: false,
      sortOrder: nextLegalDocumentSortOrder(documents, type),
      createdAt: input.now.toISOString(),
      updatedAt: input.now.toISOString(),
    };
    const nextDocuments = [...documents, nextDocument];
    const persistResult = await persistLegalDocuments({
      db: deps.db,
      previousDocuments: documents,
      nextDocuments,
      reason,
      idempotencyKey: input.idempotencyKey,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
      auditEventType: "admin.legal_document.created",
      auditTargetId: nextDocument.id,
      auditMetadata: { document: adminLegalDocumentFromRecord(nextDocument) },
    });
    if ("status" in persistResult && persistResult.status >= 400) {
      return persistResult;
    }
    return {
      status: 200,
      body: {
        data: adminLegalDocumentFromRecord(nextDocument),
      },
    };
  }

  async function updateLegalDocument(input: {
    id: string;
    title: string;
    contentHtml: string;
    versionLabel?: string | null;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const documentId = input.id.trim();
    const reason = input.reason.trim();
    if (!documentId) {
      return error(400, "legal_document_id_required", "legal document id is required");
    }
    if (!reason) {
      return error(400, "reason_required", "reason is required");
    }
    const documents = await readLegalDocumentsFromDb(deps.db, input.now);
    const target = documents.find((document) => document.id === documentId && !document.deleted);
    if (!target) {
      return error(404, "legal_document_not_found", "legal document not found");
    }
    const nextDocuments = documents.map((document) =>
      document.id === documentId
        ? {
            ...document,
            title: input.title.trim() || document.title,
            contentHtml: input.contentHtml.trim() || document.contentHtml,
            versionLabel: input.versionLabel?.trim() || null,
            updatedAt: input.now.toISOString(),
          }
        : document,
    );
    const updated = nextDocuments.find((document) => document.id === documentId)!;
    const persistResult = await persistLegalDocuments({
      db: deps.db,
      previousDocuments: documents,
      nextDocuments,
      reason,
      idempotencyKey: input.idempotencyKey,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
      auditEventType: "admin.legal_document.updated",
      auditTargetId: updated.id,
      auditMetadata: {
        previous: adminLegalDocumentFromRecord(target),
        next: adminLegalDocumentFromRecord(updated),
      },
    });
    if ("status" in persistResult && persistResult.status >= 400) {
      return persistResult;
    }
    return {
      status: 200,
      body: {
        data: adminLegalDocumentFromRecord(updated),
      },
    };
  }

  async function enableLegalDocument(input: {
    id: string;
    enabled: boolean;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const documentId = input.id.trim();
    const reason = input.reason.trim();
    if (!documentId) {
      return error(400, "legal_document_id_required", "legal document id is required");
    }
    if (!reason) {
      return error(400, "reason_required", "reason is required");
    }
    const documents = await readLegalDocumentsFromDb(deps.db, input.now);
    const target = documents.find((document) => document.id === documentId && !document.deleted);
    if (!target) {
      return error(404, "legal_document_not_found", "legal document not found");
    }
    const nextDocuments = documents.map((document) => {
      if (document.deleted || document.type !== target.type) return document;
      if (document.id === documentId) {
        return {
          ...document,
          status: input.enabled ? "enabled" : "disabled",
          updatedAt: input.now.toISOString(),
        };
      }
      if (input.enabled && document.status === "enabled") {
        return {
          ...document,
          status: "disabled",
          updatedAt: input.now.toISOString(),
        };
      }
      return document;
    });
    const updated = nextDocuments.find((document) => document.id === documentId)!;
    const persistResult = await persistLegalDocuments({
      db: deps.db,
      previousDocuments: documents,
      nextDocuments,
      reason,
      idempotencyKey: input.idempotencyKey,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
      auditEventType: "admin.legal_document.status_updated",
      auditTargetId: updated.id,
      auditMetadata: {
        enabled: input.enabled,
        type: updated.type,
      },
    });
    if ("status" in persistResult && persistResult.status >= 400) {
      return persistResult;
    }
    return {
      status: 200,
      body: {
        data: adminLegalDocumentFromRecord(updated),
      },
    };
  }

  async function deleteLegalDocument(input: {
    id: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const documentId = input.id.trim();
    const reason = input.reason.trim();
    if (!documentId) {
      return error(400, "legal_document_id_required", "legal document id is required");
    }
    if (!reason) {
      return error(400, "reason_required", "reason is required");
    }
    const documents = await readLegalDocumentsFromDb(deps.db, input.now);
    const target = documents.find((document) => document.id === documentId && !document.deleted);
    if (!target) {
      return error(404, "legal_document_not_found", "legal document not found");
    }
    const remainingSameType = documents.filter(
      (document) => !document.deleted && document.type === target.type && document.id !== documentId,
    );
    if (remainingSameType.length === 0) {
      return error(400, "legal_document_last_of_type", "at least one legal document per type must remain");
    }
    const nextDocuments = documents.map((document) =>
      document.id === documentId
        ? {
            ...document,
            deleted: true,
            status: "disabled",
            updatedAt: input.now.toISOString(),
          }
        : document,
    );
    const persistResult = await persistLegalDocuments({
      db: deps.db,
      previousDocuments: documents,
      nextDocuments,
      reason,
      idempotencyKey: input.idempotencyKey,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
      auditEventType: "admin.legal_document.deleted",
      auditTargetId: documentId,
      auditMetadata: {
        previous: adminLegalDocumentFromRecord(target),
      },
    });
    if ("status" in persistResult && persistResult.status >= 400) {
      return persistResult;
    }
    return {
      status: 200,
      body: {
        data: { id: documentId },
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

    const normalizedInputValue =
      key === legalDocumentsConfigKey
        ? sanitizeLegalDocumentsForStorage(normalizeLegalDocuments(input.value, input.now), input.now)
        : normalizeRuntimeConfigValue(key, input.value);

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
        JSON.stringify(normalizedInputValue),
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
        JSON.stringify(normalizedInputValue),
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
          nextValue: normalizedInputValue,
          valueType: input.valueType,
          scope: input.scope,
        },
      });
    }

    if (key === legalDocumentsConfigKey) {
      await syncLegacyLegalDocumentConfigs({
        db: deps.db,
        documents: normalizeLegalDocuments(normalizedInputValue, input.now),
        actorAdminAccountId: input.actorAdminAccountId,
        now: input.now,
      });
    } else {
      const legacyType = legalDocumentTypeFromLegacyKey(key);
      if (legacyType) {
        const currentDocuments = await readLegalDocumentsFromDb(deps.db, input.now);
        const nextDocuments = currentDocuments.map((document) =>
          document.type === legacyType && document.status === "enabled"
            ? {
                ...document,
                ...normalizeLegacyDocumentPatch(legacyType, normalizedInputValue),
                updatedAt: input.now.toISOString(),
              }
            : document,
        );
        await persistLegalDocuments({
          db: deps.db,
          previousDocuments: currentDocuments,
          nextDocuments,
          reason,
          idempotencyKey: `${input.idempotencyKey}:legacy-sync`,
          actorAdminAccountId: input.actorAdminAccountId,
          auditOrganizationId: input.auditOrganizationId,
          auditWorkspaceId: input.auditWorkspaceId,
          now: input.now,
          auditEventType: "admin.legal_document.updated",
          auditTargetId: nextDocuments.find(
            (document) => document.type === legacyType && document.status === "enabled",
          )?.id ?? input.actorAdminAccountId,
          auditMetadata: {
            sourceConfigKey: key,
            syncedFromLegacyConfig: true,
          },
        });
      }
    }

    return {
      status: 200,
      body: {
        data: configFromRow({
          key,
          value_json: normalizedInputValue,
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
    providerChannel?: string | null;
    mediaTypes?: string[];
    modelCodes?: string[];
    baseUrl?: string | null;
    authHeaderName?: string | null;
    authScheme?: string | null;
    extraHeaders?: Record<string, string> | null;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const secretRef = input.secretRef.trim();
    const envName = input.envName.trim();
    const purposeText = input.purpose.trim();
    if (!secretRef || !envName || !purposeText) {
      return error(400, "secret_reference_required", "请填写密钥引用、环境变量名和用途");
    }
    const purpose = formatSecretReferencePurpose({
      purpose: input.purpose,
      providerChannel: input.providerChannel,
      mediaTypes: input.mediaTypes,
      modelCodes: input.modelCodes,
      baseUrl: input.baseUrl,
      authHeaderName: input.authHeaderName,
      authScheme: input.authScheme,
      extraHeaders: input.extraHeaders,
    });

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
    getPublicLegalDocuments,
    listLegalDocuments,
    createLegalDocument,
    updateLegalDocument,
    enableLegalDocument,
    deleteLegalDocument,
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
  updated_at: Date | string | null;
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
  const normalizedValue = normalizeRuntimeConfigValue(row.key, normalizeJson(row.value_json));
  return {
    key: row.key,
    value: normalizedValue,
    valueType: row.value_type,
    scope: row.scope,
    description: row.description,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function publicLegalDocumentFromRow(key: string, row: RuntimeConfigRow | null) {
  const document = normalizeLegalDocumentValue(
    key as (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]["key"],
    row ? normalizeJson(row.value_json) : defaultLegalDocumentValue(
      key as (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]["key"],
    ),
  );
  return {
    key,
    document,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function normalizeRuntimeConfigValue(key: string, value: unknown) {
  if (key === legalDocumentsConfigKey) {
    return normalizeLegalDocuments(value);
  }
  if (
    key === legalDocumentConfigs.serviceAgreement.key ||
    key === legalDocumentConfigs.privacyPolicy.key
  ) {
    return normalizeLegalDocumentValue(
      key as (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]["key"],
      value,
    );
  }
  return value;
}

function withDefaultRuntimeConfigs(rows: RuntimeConfigRow[]) {
  const configsByKey = new Map(rows.map((row) => [row.key, row]));
  for (const defaultConfig of DEFAULT_RUNTIME_CONFIGS) {
    if (!configsByKey.has(defaultConfig.key)) {
      configsByKey.set(defaultConfig.key, defaultConfig);
    }
  }
  return Array.from(configsByKey.values()).sort((left, right) => {
    const scopeOrder = left.scope.localeCompare(right.scope);
    return scopeOrder || left.key.localeCompare(right.key);
  });
}

function adminLegalDocumentFromRecord(document: LegalDocumentRecord) {
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    status: document.status,
    versionLabel: document.versionLabel,
    updatedAt: document.updatedAt,
    createdAt: document.createdAt,
    document: {
      title: document.title,
      contentHtml: document.contentHtml,
      versionLabel: document.versionLabel,
    },
  };
}

function publicLegalDocumentTitle(type: LegalDocumentType) {
  return type === "service"
    ? legalDocumentConfigs.serviceAgreement.title
    : legalDocumentConfigs.privacyPolicy.title;
}

function defaultLegalDocumentContent(type: LegalDocumentType) {
  return defaultLegalDocumentValue(publicLegalDocumentKeyByType(type)).contentHtml;
}

function nextLegalDocumentSortOrder(documents: LegalDocumentRecord[], type: LegalDocumentType) {
  const typeDocuments = documents.filter((document) => document.type === type);
  const maxSortOrder = typeDocuments.reduce((max, document) => Math.max(max, Number(document.sortOrder || 0)), 0);
  return maxSortOrder + 100 || (type === "service" ? 100 : 200);
}

function normalizeLegalDocumentTypeInput(type: string): LegalDocumentType | null {
  return type === "service" || type === "privacy" ? type : null;
}

async function readLegalDocumentsFromDb(db: SqlDatabase, now: Date) {
  const rows = await db.query<RuntimeConfigRow>(
    `
      SELECT key, value_json, value_type, scope, description, updated_at
      FROM runtime_config_entries
      WHERE key = ANY($1::text[])
    `,
    [[legalDocumentsConfigKey, legalDocumentConfigs.serviceAgreement.key, legalDocumentConfigs.privacyPolicy.key]],
  );
  const byKey = new Map(rows.rows.map((row) => [row.key, row]));
  const listRow = byKey.get(legalDocumentsConfigKey);
  if (listRow) {
    return normalizeLegalDocuments(normalizeJson(listRow.value_json), now);
  }
  return migrateLegacyLegalDocuments({
    serviceAgreement: byKey.get(legalDocumentConfigs.serviceAgreement.key)?.value_json,
    privacyPolicy: byKey.get(legalDocumentConfigs.privacyPolicy.key)?.value_json,
    now,
  });
}

async function persistLegalDocuments(input: {
  db: SqlDatabase;
  previousDocuments: LegalDocumentRecord[];
  nextDocuments: LegalDocumentRecord[];
  reason: string;
  idempotencyKey: string;
  actorAdminAccountId: string;
  auditOrganizationId: string;
  auditWorkspaceId: string;
  now: Date;
  auditEventType: string;
  auditTargetId: string;
  auditMetadata: Record<string, unknown>;
}) {
  const previousValue = sanitizeLegalDocumentsForStorage(input.previousDocuments, input.now);
  const nextValue = sanitizeLegalDocumentsForStorage(input.nextDocuments, input.now);
  const previousRevision = legalDocumentsRevisionId(previousValue);
  const nextRevision = legalDocumentsRevisionId(nextValue);
  if (previousRevision === nextRevision) {
    return { status: 200, body: { data: null } };
  }

  await input.db.query(
    `
      INSERT INTO runtime_config_entries (
        key, value_json, value_type, scope, description, updated_by_admin_id, updated_at
      )
      VALUES ($1, $2::jsonb, 'json', 'creator', $3, $4, $5)
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
      legalDocumentsConfigKey,
      JSON.stringify(nextValue),
      "登录页协议列表与启用版本管理",
      input.actorAdminAccountId,
      input.now,
    ],
  );

  await input.db.query(
    `
      INSERT INTO runtime_config_revisions (
        id, config_key, previous_value_json, next_value_json, changed_by_admin_id, reason, created_at
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      uuidFromIdempotencyKey(input.idempotencyKey),
      legalDocumentsConfigKey,
      JSON.stringify(previousValue),
      JSON.stringify(nextValue),
      input.actorAdminAccountId,
      input.reason,
      input.now,
    ],
  );

  const existingAudit = await queryOne<{ id: string }>(
    input.db,
    "SELECT id FROM audit_events WHERE id = $1",
    [uuidFromIdempotencyKey(`${input.idempotencyKey}:audit`)],
  );
  if (!existingAudit) {
    await appendAuditEvent(input.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType: input.auditEventType,
      targetType: "legal_document",
      targetId: input.auditTargetId,
      reason: input.reason,
      sensitive: true,
      metadata: input.auditMetadata,
    });
  }
  return { status: 200, body: { data: nextValue } };
}

async function syncLegacyLegalDocumentConfigs(input: {
  db: SqlDatabase;
  documents: LegalDocumentRecord[];
  actorAdminAccountId: string;
  now: Date;
}) {
  const enabledService = findEnabledLegalDocument(input.documents, "service");
  const enabledPrivacy = findEnabledLegalDocument(input.documents, "privacy");
  const mappings: Array<{
    key: string;
    description: string;
    value: LegalDocumentRecord | null;
  }> = [
    {
      key: legalDocumentConfigs.serviceAgreement.key,
      description: legalDocumentConfigs.serviceAgreement.description,
      value: enabledService,
    },
    {
      key: legalDocumentConfigs.privacyPolicy.key,
      description: legalDocumentConfigs.privacyPolicy.description,
      value: enabledPrivacy,
    },
  ];

  for (const item of mappings) {
    const configKey = item.key;
    const documentValue = item.value
      ? {
          title: item.value.title,
          contentHtml: item.value.contentHtml,
          versionLabel: item.value.versionLabel,
        }
      : defaultLegalDocumentValue(configKey as (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]["key"]);
    await input.db.query(
      `
        INSERT INTO runtime_config_entries (
          key, value_json, value_type, scope, description, updated_by_admin_id, updated_at
        )
        VALUES ($1, $2::jsonb, 'json', 'creator', $3, $4, $5)
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
        configKey,
        JSON.stringify(documentValue),
        item.description,
        input.actorAdminAccountId,
        input.now,
      ],
    );
  }
}

function normalizeLegacyDocumentPatch(type: LegalDocumentType, value: unknown) {
  const configKey = publicLegalDocumentKeyByType(type);
  return normalizeLegalDocumentValue(
    configKey as (typeof legalDocumentConfigs)[keyof typeof legalDocumentConfigs]["key"],
    value,
  );
}

function secretReferenceFromRow(row: SecretReferenceRow) {
  const parsedPurpose = parseSecretReferencePurpose(row.purpose);
  return {
    id: row.id,
    secretRef: row.secret_ref,
    envName: row.env_name,
    purpose: parsedPurpose.purpose,
    providerName: row.provider_name,
    providerChannel: parsedPurpose.providerChannel,
    mediaTypes: parsedPurpose.mediaTypes,
    modelCodes: parsedPurpose.modelCodes,
    baseUrl: parsedPurpose.baseUrl,
    authHeaderName: parsedPurpose.authHeaderName,
    authScheme: parsedPurpose.authScheme,
    extraHeaders: parsedPurpose.extraHeaders,
    status: row.status,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
  };
}

const secretPurposeMarker = "\n---admin-secret-meta---\n";

function formatSecretReferencePurpose(input: {
  purpose: string;
  providerChannel?: string | null;
  mediaTypes?: string[];
  modelCodes?: string[];
  baseUrl?: string | null;
  authHeaderName?: string | null;
  authScheme?: string | null;
  extraHeaders?: Record<string, string> | null;
}) {
  const purpose = String(input.purpose ?? "").trim();
  const providerChannel = ["official", "proxy"].includes(String(input.providerChannel ?? ""))
    ? String(input.providerChannel)
    : "official";
  const mediaTypes = normalizeStringList(input.mediaTypes).filter((item) => item === "image" || item === "video");
  const modelCodes = normalizeStringList(input.modelCodes);
  const baseUrl = String(input.baseUrl ?? "").trim();
  const authHeaderName = String(input.authHeaderName ?? "").trim() || "Authorization";
  const authScheme = ["bearer", "raw", "none"].includes(String(input.authScheme ?? ""))
    ? String(input.authScheme)
    : "bearer";
  const extraHeaders = normalizeHeaderMap(input.extraHeaders);
  if (!mediaTypes.length && !modelCodes.length && providerChannel === "official" && !baseUrl && authHeaderName === "Authorization" && authScheme === "bearer" && !Object.keys(extraHeaders).length) {
    return purpose;
  }
  return `${purpose}${secretPurposeMarker}${JSON.stringify({
    providerChannel,
    mediaTypes,
    modelCodes,
    baseUrl,
    authHeaderName,
    authScheme,
    extraHeaders,
  })}`;
}

function parseSecretReferencePurpose(rawPurpose: string) {
  const raw = String(rawPurpose ?? "");
  const [purposeText, metadataText] = raw.split(secretPurposeMarker);
  const fallback = {
    purpose: purposeText.trim() || raw.trim(),
    providerChannel: "official",
    mediaTypes: [] as string[],
    modelCodes: [] as string[],
  };
  if (!metadataText) return fallback;
  try {
    const metadata = JSON.parse(metadataText) as {
      providerChannel?: string;
      mediaTypes?: string[];
      modelCodes?: string[];
      baseUrl?: string;
      authHeaderName?: string;
      authScheme?: string;
      extraHeaders?: Record<string, string>;
    };
    return {
      purpose: fallback.purpose,
      providerChannel: metadata.providerChannel === "proxy" ? "proxy" : "official",
      mediaTypes: normalizeStringList(metadata.mediaTypes).filter((item) => item === "image" || item === "video"),
      modelCodes: normalizeStringList(metadata.modelCodes),
      baseUrl: String(metadata.baseUrl ?? "").trim(),
      authHeaderName: String(metadata.authHeaderName ?? "").trim() || "Authorization",
      authScheme: ["bearer", "raw", "none"].includes(String(metadata.authScheme ?? ""))
        ? String(metadata.authScheme)
        : "bearer",
      extraHeaders: normalizeHeaderMap(metadata.extraHeaders),
    };
  } catch {
    return fallback;
  }
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeHeaderMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, headerValue]) => [key.trim(), String(headerValue ?? "").trim()])
      .filter(([key, headerValue]) => key && headerValue),
  );
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
