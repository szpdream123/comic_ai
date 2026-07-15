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
  normalizeLegalDocumentTypeValue,
  normalizeLegalDocumentValue,
  publicLegalDocumentKeyByType,
  rechargeTermsLegalDocumentType,
  sanitizeLegalDocumentsForStorage,
  type LegalDocumentRecord,
  type LegalDocumentType,
} from "./legal-documents.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export const batchImagePromptPresetCategoriesConfigKey = "creator.batch_image_prompt_preset_categories";
export const customerSupportConfigKey = "creator.customer_support";

export interface CustomerSupportConfig {
  onlineServiceLabel: string;
  communityTitle: string;
  communitySubtitle: string;
  communityImageUrl: string;
}

const legacyCustomerSupportCommunitySubtitle = "专属服务支持 · 最新产品动态 · 官方活动直达";

export const defaultCustomerSupportConfig: CustomerSupportConfig = {
  onlineServiceLabel: "在线客服",
  communityTitle: "加入万兴剧厂官方社群",
  communitySubtitle: "最新产品动态 · 官方活动直达",
  communityImageUrl: "",
};

export interface BatchImagePromptPresetOption {
  id: string;
  label: string;
  prompt_content?: string;
  promptContent?: string;
}

export interface BatchImagePromptPresetCategories {
  scene: BatchImagePromptPresetOption[];
  character: BatchImagePromptPresetOption[];
  prop: BatchImagePromptPresetOption[];
}

export const defaultBatchImagePromptPresetCategories: BatchImagePromptPresetCategories = {
  scene: [
    { id: "scene-vr", label: "[系统]VR场景图" },
    { id: "scene-overlook", label: "[系统]场景-俯视图" },
    { id: "scene-wide", label: "[系统]场景-广角图" },
  ],
  character: [
    { id: "character-triple", label: "[系统]角色-三视图" },
  ],
  prop: [
    { id: "prop-triple", label: "[系统]道具-三视图" },
  ],
};

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
    key: customerSupportConfigKey,
    value_json: defaultCustomerSupportConfig,
    value_type: "json",
    scope: "creator",
    description: "前台顶部在线客服弹层文案与二维码配置",
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

const adminSecretValueStoreReady = new WeakSet<SqlDatabase>();

async function ensureAdminSecretValueStore(db: SqlDatabase) {
  if (adminSecretValueStoreReady.has(db)) return;
  await db.query(`
    ALTER TABLE admin_secret_references
      ADD COLUMN IF NOT EXISTS secret_value text NULL
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_secret_values (
      id uuid PRIMARY KEY,
      secret_ref text NOT NULL UNIQUE,
      secret_key text NOT NULL UNIQUE,
      secret_value text NOT NULL,
      purpose text NOT NULL DEFAULT '',
      provider_name text NULL,
      status text NOT NULL DEFAULT 'configured',
      last_checked_at timestamptz NULL,
      created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (status IN ('configured', 'missing', 'unknown')),
      CHECK (btrim(secret_value) <> '')
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS admin_secret_values_status_key_idx
      ON admin_secret_values (status, secret_key)
  `);
  await db.query(`
    ALTER TABLE admin_secret_values
      ADD COLUMN IF NOT EXISTS request_domain text NULL
  `);
  await db.query(`
    UPDATE admin_secret_values AS secret
    SET request_domain = model_domains.request_domain
    FROM (
      SELECT
        provider_config_json->>'apiKeyEnv' AS secret_key,
        MIN(
          COALESCE(
            NULLIF(provider_config_json->>'baseURL', ''),
            NULLIF(provider_config_json->>'endpoint', ''),
            NULLIF(provider_config_json->>'requestPath', ''),
            NULLIF(provider_config_json->>'createTaskEndpoint', '')
          )
        ) AS request_domain
      FROM ai_model_configs
      WHERE provider_config_json ? 'apiKeyEnv'
      GROUP BY provider_config_json->>'apiKeyEnv'
    ) AS model_domains
    WHERE secret.secret_key = model_domains.secret_key
      AND COALESCE(NULLIF(secret.request_domain, ''), '') = ''
      AND COALESCE(NULLIF(model_domains.request_domain, ''), '') <> ''
  `);
  await db.query(`
    INSERT INTO admin_secret_values (
      id, secret_ref, secret_key, secret_value, purpose, provider_name, status,
      last_checked_at, created_by_admin_id, created_at, updated_at
    )
    SELECT
      id,
      secret_ref,
      env_name,
      secret_value,
      purpose,
      provider_name,
      CASE
        WHEN secret_value IS NOT NULL AND btrim(secret_value) <> '' THEN 'configured'
        ELSE 'missing'
      END,
      last_checked_at,
      created_by_admin_id,
      created_at,
      updated_at
    FROM admin_secret_references
    WHERE secret_value IS NOT NULL
      AND btrim(secret_value) <> ''
    ON CONFLICT (secret_key)
    DO UPDATE SET
      secret_ref = EXCLUDED.secret_ref,
      secret_value = EXCLUDED.secret_value,
      purpose = EXCLUDED.purpose,
      provider_name = EXCLUDED.provider_name,
      status = EXCLUDED.status,
      last_checked_at = EXCLUDED.last_checked_at,
      updated_at = EXCLUDED.updated_at
  `);
  adminSecretValueStoreReady.add(db);
}

export function createAdminSystemSettingsService(deps: { db: SqlDatabase }) {
  async function getBatchImagePromptPresetCategories() {
    return {
      data: await readBatchImagePromptPresetCategoriesFromDb(deps.db),
    };
  }

  async function updateBatchImagePromptPresetCategories(input: {
    value: unknown;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    now: Date;
  }) {
    return updateRuntimeConfig({
      key: batchImagePromptPresetCategoriesConfigKey,
      value: input.value,
      valueType: "json",
      scope: "creator",
      description: "批量生图弹框中的场景、角色、道具预设分类",
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      actorAdminAccountId: input.actorAdminAccountId,
      now: input.now,
    });
  }

  async function listSettings() {
    await ensureAdminSecretValueStore(deps.db);
    const configs = await deps.db.query<RuntimeConfigRow>(
      `
        SELECT key, value_json, value_type, scope, description, updated_at
        FROM runtime_config_entries
        ORDER BY scope ASC, key ASC
      `,
    );
    const secretReferences = await deps.db.query<SecretReferenceRow>(
      `
        SELECT id, secret_ref, env_name, purpose, provider_name, request_domain, status, last_checked_at,
               secret_value, true AS has_secret
        FROM (
          SELECT
            id,
            secret_ref,
            secret_key AS env_name,
            purpose,
            provider_name,
            request_domain,
            status,
            last_checked_at,
            secret_value
          FROM admin_secret_values
          WHERE btrim(secret_value) <> ''
        ) secrets
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
        rechargeTerms: buildPublicRechargeTermsDocument(
          findEnabledLegalDocument(documents, rechargeTermsLegalDocumentType),
        ),
      },
    };
  }

  async function getPublicCustomerSupportConfig() {
    return {
      data: await readPublicCustomerSupportConfigFromDb(deps.db),
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
    now: Date;
  }) {
    const type = normalizeLegalDocumentTypeInput(input.type, input.title);
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
      title: input.title.trim() || publicLegalDocumentTitle(type) || "协议文档",
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
    type?: string;
    title: string;
    contentHtml: string;
    versionLabel?: string | null;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
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
    const nextTitle = input.title.trim() || target.title;
    const nextType =
      input.type == null
        ? normalizeLegalDocumentTypeInput(target.type, nextTitle)
        : normalizeLegalDocumentTypeInput(input.type, nextTitle);
    if (!nextType) {
      return error(400, "legal_document_type_invalid", "legal document type is invalid");
    }
    const nextDocuments = documents.map((document) =>
      document.id === documentId
        ? {
            ...document,
            type: nextType,
            title: nextTitle,
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
      if (document.deleted || document.id !== documentId) return document;
      return {
        ...document,
        status: input.enabled ? "enabled" : "disabled",
        updatedAt: input.now.toISOString(),
      };
    });
    const updated = nextDocuments.find((document) => document.id === documentId)!;
    const persistResult = await persistLegalDocuments({
      db: deps.db,
      previousDocuments: documents,
      nextDocuments,
      reason,
      idempotencyKey: input.idempotencyKey,
      actorAdminAccountId: input.actorAdminAccountId,
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
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
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
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
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
    secretValue?: string | null;
    purpose: string;
    providerName?: string | null;
    providerChannel?: string | null;
    mediaTypes?: string[];
    modelCodes?: string[];
    baseUrl?: string | null;
    requestDomain?: string | null;
    authHeaderName?: string | null;
    authScheme?: string | null;
    extraHeaders?: Record<string, string> | null;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const secretRef = input.secretRef.trim();
    const envName = input.envName.trim();
    const secretValue = String(input.secretValue ?? "").trim();
    const purposeText = input.purpose.trim();
    const requestDomain = String(input.requestDomain ?? input.baseUrl ?? "").trim();
    if (!secretRef || !envName || !purposeText) {
      return error(400, "secret_reference_required", "请填写密钥引用、环境变量名和用途");
    }
    if (!secretValue) {
      return error(400, "secret_value_required", "请填写密钥值");
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

    await ensureAdminSecretValueStore(deps.db);
    const row = await queryOne<SecretReferenceRow>(
      deps.db,
      `
        INSERT INTO admin_secret_values (
          id, secret_ref, secret_key, secret_value, purpose, provider_name, request_domain, status, last_checked_at, created_by_admin_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $9, 'configured', $8, $7, $8, $8)
        ON CONFLICT (secret_key)
        DO UPDATE SET
          secret_ref = EXCLUDED.secret_ref,
          secret_value = EXCLUDED.secret_value,
          purpose = EXCLUDED.purpose,
          provider_name = EXCLUDED.provider_name,
          request_domain = EXCLUDED.request_domain,
          status = EXCLUDED.status,
          last_checked_at = EXCLUDED.last_checked_at,
          updated_at = EXCLUDED.updated_at
        RETURNING id, secret_ref, secret_key AS env_name, purpose, provider_name, request_domain, status, last_checked_at,
                  secret_value, true AS has_secret
      `,
      [
        randomUUID(),
        secretRef,
        envName,
        secretValue,
        purpose,
        input.providerName?.trim() || null,
        input.actorAdminAccountId,
        input.now,
        requestDomain || null,
      ],
    );

    return {
      status: 200,
      body: { data: secretReferenceFromRow(row!) },
    };
  }

  async function updateSecretReference(input: {
    id: string;
    secretRef: string;
    envName: string;
    secretValue?: string | null;
    purpose: string;
    providerName?: string | null;
    providerChannel?: string | null;
    mediaTypes?: string[];
    modelCodes?: string[];
    baseUrl?: string | null;
    requestDomain?: string | null;
    authHeaderName?: string | null;
    authScheme?: string | null;
    extraHeaders?: Record<string, string> | null;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const id = input.id.trim();
    const secretRef = input.secretRef.trim();
    const envName = input.envName.trim();
    const secretValue = String(input.secretValue ?? "").trim();
    const purposeText = input.purpose.trim();
    const requestDomain = String(input.requestDomain ?? input.baseUrl ?? "").trim();
    if (!id) return error(400, "secret_reference_id_required", "secret reference id is required");
    if (!secretRef || !envName || !purposeText) {
      return error(400, "secret_reference_required", "请填写密钥引用、引用键和用途");
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
    await ensureAdminSecretValueStore(deps.db);
    const row = await queryOne<SecretReferenceRow>(
      deps.db,
      `
        UPDATE admin_secret_values
        SET secret_ref = $2,
            secret_key = $3,
            secret_value = CASE WHEN $4 <> '' THEN $4 ELSE secret_value END,
            purpose = $5,
            provider_name = $6,
            request_domain = $8,
            status = CASE
              WHEN $4 <> '' THEN 'configured'
              WHEN secret_value IS NOT NULL AND btrim(secret_value) <> '' THEN 'configured'
              ELSE 'missing'
            END,
            last_checked_at = $7,
            updated_at = $7
        WHERE id = $1
        RETURNING id, secret_ref, secret_key AS env_name, purpose, provider_name, request_domain, status, last_checked_at,
                  secret_value, true AS has_secret
      `,
      [id, secretRef, envName, secretValue, purpose, input.providerName?.trim() || null, input.now, requestDomain || null],
    );
    if (!row) return error(404, "secret_reference_not_found", "secret reference not found");
    return { status: 200, body: { data: secretReferenceFromRow(row) } };
  }

  async function deleteSecretReference(input: { id: string }) {
    const id = input.id.trim();
    if (!id) return error(400, "secret_reference_id_required", "secret reference id is required");
    await ensureAdminSecretValueStore(deps.db);
    const row = await queryOne<SecretReferenceRow>(
      deps.db,
      `
        DELETE FROM admin_secret_values
        WHERE id = $1
        RETURNING id, secret_ref, secret_key AS env_name, purpose, provider_name, request_domain, status, last_checked_at,
                  secret_value, false AS has_secret
      `,
      [id],
    );
    if (!row) return error(404, "secret_reference_not_found", "secret reference not found");
    return { status: 200, body: { data: secretReferenceFromRow(row) } };
  }

  async function probeSecretReference(input: {
    id: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
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

    await ensureAdminSecretValueStore(deps.db);
    const existing = await queryOne<SecretReferenceRow>(
      deps.db,
      `
        SELECT id, secret_ref, secret_key AS env_name, purpose, provider_name, request_domain, status, last_checked_at,
               secret_value, true AS has_secret
        FROM admin_secret_values
        WHERE id = $1
      `,
      [id],
    );
    if (!existing) {
      return error(404, "secret_reference_not_found", "secret reference not found");
    }

    const status = existing.has_secret ? "configured" : "missing";
    const row = await queryOne<SecretReferenceRow>(
      deps.db,
      `
        UPDATE admin_secret_values
        SET status = $2,
            last_checked_at = $3,
            updated_at = $3
        WHERE id = $1
        RETURNING id, secret_ref, secret_key AS env_name, purpose, provider_name, request_domain, status, last_checked_at,
                  secret_value, true AS has_secret
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
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
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

  async function revealSecretReference(input: {
    id: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
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

    await ensureAdminSecretValueStore(deps.db);
    const existing = await queryOne<SecretReferenceRow>(
      deps.db,
      `
        SELECT id, secret_ref, secret_key AS env_name, purpose, provider_name, request_domain, status, last_checked_at,
               secret_value, true AS has_secret
        FROM admin_secret_values
        WHERE id = $1
      `,
      [id],
    );
    if (!existing) {
      return error(404, "secret_reference_not_found", "secret reference not found");
    }
    const secretValue = String(existing.secret_value ?? "");
    if (!secretValue) {
      return error(409, "secret_reference_value_missing", "密钥值不存在，请重新保存");
    }

    const existingAudit = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM audit_events WHERE id = $1",
      [uuidFromIdempotencyKey(`${input.idempotencyKey}:secret-reveal-audit`)],
    );
    if (!existingAudit) {
      await appendAuditEvent(deps.db, {
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
        eventType: "admin.secret_reference.revealed",
        targetType: "admin_secret_reference",
        targetId: id,
        reason,
        sensitive: true,
        metadata: {
          referenceId: id,
          envName: existing.env_name,
          providerName: existing.provider_name,
          revealedAt: input.now.toISOString(),
        },
        occurredAt: input.now,
      });
    }

    return {
      status: 200,
      body: { data: { id, secretValue } },
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
          a.super_admin_slot,
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
    if (roles.includes("super_admin")) {
      return error(409, "protected_super_admin_creation_forbidden", "不能通过后台创建超级管理员");
    }

    return withDatabaseTransaction(deps.db, async () => {
    const accountId = uuidFromIdempotencyKey(input.idempotencyKey);
    const savedAccount = await deps.db.query<{ id: string }>(
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
        WHERE admin_accounts.super_admin_slot IS NULL
        RETURNING id
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
    const resolvedAccountId = savedAccount.rows[0]?.id;
    if (!resolvedAccountId) {
      return error(409, "protected_super_admin_immutable", "受保护超级管理员不能通过新增账户入口修改");
    }
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
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
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
    });
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

    return withDatabaseTransaction(deps.db, async () => {
    const existing = await queryOne<AdminAccountBaseRow>(
      deps.db,
      `
        SELECT id, login_name, display_name, status, remark, created_at, super_admin_slot
        FROM admin_accounts
        WHERE id = $1
        FOR UPDATE
      `,
      [accountId],
    );
    if (!existing) {
      return error(404, "admin_account_not_found", "admin account not found");
    }
    if (existing.super_admin_slot !== null) {
      if (input.actorAdminAccountId !== accountId) {
        return error(403, "protected_super_admin_self_only", "超级管理员只能修改自己的账号");
      }
      if (status !== "active" || roles.length !== 1 || roles[0] !== "super_admin") {
        return error(409, "protected_super_admin_immutable", "超级管理员身份、角色和启用状态不可修改");
      }
    } else if (roles.includes("super_admin")) {
      return error(409, "protected_super_admin_promotion_forbidden", "普通管理员不能晋升为超级管理员");
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
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
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
          superAdminSlot: existing.super_admin_slot === null ? null : Number(existing.super_admin_slot),
          isProtectedSuperAdmin: existing.super_admin_slot !== null,
          createdAt: new Date(existing.created_at).toISOString(),
        },
      },
    };
    });
  }

  async function resetAdminAccountPassword(input: {
    accountId: string;
    newPassword: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
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

    return withDatabaseTransaction(deps.db, async () => {
    const existing = await queryOne<AdminAccountBaseRow>(
      deps.db,
      `
        SELECT id, login_name, display_name, status, remark, created_at, super_admin_slot
        FROM admin_accounts
        WHERE id = $1
        FOR UPDATE
      `,
      [accountId],
    );
    if (!existing) {
      return error(404, "admin_account_not_found", "admin account not found");
    }
    if (existing.super_admin_slot !== null) {
      if (input.actorAdminAccountId !== accountId) {
        return error(403, "protected_super_admin_self_only", "超级管理员只能修改自己的密码");
      }
      return error(409, "protected_super_admin_password_self_service_required", "请在当前账户页面使用旧密码修改密码");
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
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
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
    });
  }

  return {
    listSettings,
    getBatchImagePromptPresetCategories,
    getPublicLegalDocuments,
    getPublicCustomerSupportConfig,
    listLegalDocuments,
    createLegalDocument,
    updateLegalDocument,
    enableLegalDocument,
    deleteLegalDocument,
    updateBatchImagePromptPresetCategories,
    updateRuntimeConfig,
    listRuntimeConfigRevisions,
    rollbackRuntimeConfig,
    createSecretReference,
    updateSecretReference,
    deleteSecretReference,
    probeSecretReference,
    revealSecretReference,
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
  secret_value: string | null;
  purpose: string;
  provider_name: string | null;
  request_domain: string | null;
  status: string;
  last_checked_at: Date | string | null;
  has_secret?: boolean | null;
}

interface AdminAccountRow {
  id: string;
  login_name: string;
  display_name: string;
  status: string;
  remark: string | null;
  created_at: Date | string;
  super_admin_slot: number | string | null;
  roles_json: unknown;
}

interface AdminAccountBaseRow {
  id: string;
  login_name: string;
  display_name: string;
  status: string;
  remark: string | null;
  created_at: Date | string;
  super_admin_slot: number | string | null;
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
  if (key === batchImagePromptPresetCategoriesConfigKey) {
    return normalizeBatchImagePromptPresetCategories(value);
  }
  if (key === customerSupportConfigKey) {
    return normalizeCustomerSupportConfig(value);
  }
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

export function normalizeCustomerSupportConfig(value: unknown): CustomerSupportConfig {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const communitySubtitle = nonEmptyString(record.communitySubtitle, defaultCustomerSupportConfig.communitySubtitle);
  return {
    onlineServiceLabel: nonEmptyString(record.onlineServiceLabel, defaultCustomerSupportConfig.onlineServiceLabel),
    communityTitle: nonEmptyString(record.communityTitle, defaultCustomerSupportConfig.communityTitle),
    communitySubtitle: communitySubtitle === legacyCustomerSupportCommunitySubtitle
      ? defaultCustomerSupportConfig.communitySubtitle
      : communitySubtitle,
    communityImageUrl: String(record.communityImageUrl ?? "").trim(),
  };
}

function nonEmptyString(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
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

export function normalizeBatchImagePromptPresetCategories(value: unknown): BatchImagePromptPresetCategories {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    scene: normalizeBatchImagePromptPresetOptionList(record.scene, defaultBatchImagePromptPresetCategories.scene),
    character: normalizeBatchImagePromptPresetOptionList(record.character, defaultBatchImagePromptPresetCategories.character),
    prop: normalizeBatchImagePromptPresetOptionList(record.prop, defaultBatchImagePromptPresetCategories.prop),
  };
}

function normalizeBatchImagePromptPresetOptionList(
  value: unknown,
  fallback: BatchImagePromptPresetOption[],
): BatchImagePromptPresetOption[] {
  if (!Array.isArray(value)) {
    return fallback.map((item) => ({ ...item }));
  }
  const seen = new Set<string>();
  const options = value
    .map((item) => normalizeBatchImagePromptPresetOption(item))
    .filter((item): item is BatchImagePromptPresetOption => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  if (!options.length) {
    return fallback.map((item) => ({ ...item }));
  }
  return options;
}

function normalizeBatchImagePromptPresetOption(value: unknown): BatchImagePromptPresetOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const id = String((value as Record<string, unknown>).id ?? "").trim();
  const label = String((value as Record<string, unknown>).label ?? "").trim();
  const promptContent = String(
    (value as Record<string, unknown>).prompt_content
      ?? (value as Record<string, unknown>).promptContent
      ?? "",
  ).trim();
  if (!id || !label || id === "none") {
    return null;
  }
  return promptContent ? { id, label, prompt_content: promptContent, promptContent } : { id, label };
}

export async function readBatchImagePromptPresetCategoriesFromDb(
  db: SqlDatabase,
): Promise<BatchImagePromptPresetCategories> {
  const row = await queryOne<RuntimeConfigRow>(
    db,
    `
      SELECT key, value_json, value_type, scope, description, updated_at
      FROM runtime_config_entries
      WHERE key = $1
      LIMIT 1
    `,
    [batchImagePromptPresetCategoriesConfigKey],
  );
  if (!row) {
    return normalizeBatchImagePromptPresetCategories(defaultBatchImagePromptPresetCategories);
  }
  return normalizeBatchImagePromptPresetCategories(normalizeJson(row.value_json));
}

export async function readCustomerSupportConfigFromDb(
  db: SqlDatabase,
): Promise<CustomerSupportConfig> {
  const row = await queryOne<RuntimeConfigRow>(
    db,
    `
      SELECT key, value_json, value_type, scope, description, updated_at
      FROM runtime_config_entries
      WHERE key = $1
      LIMIT 1
    `,
    [customerSupportConfigKey],
  );
  if (!row) {
    return normalizeCustomerSupportConfig(defaultCustomerSupportConfig);
  }
  return normalizeCustomerSupportConfig(normalizeJson(row.value_json));
}

export async function readPublicCustomerSupportConfigFromDb(
  db: SqlDatabase,
): Promise<CustomerSupportConfig> {
  const row = await queryOne<RuntimeConfigRow>(
    db,
    `
      SELECT key, value_json, value_type, scope, description, updated_at
      FROM runtime_config_entries
      WHERE key = $1
      LIMIT 1
    `,
    [customerSupportConfigKey],
  );
  if (!row) {
    return {
      onlineServiceLabel: "",
      communityTitle: "",
      communitySubtitle: "",
      communityImageUrl: "",
    };
  }
  const record = normalizeJson(row.value_json);
  const source = record && typeof record === "object" && !Array.isArray(record)
    ? record as Record<string, unknown>
    : {};
  return {
    onlineServiceLabel: String(source.onlineServiceLabel ?? "").trim(),
    communityTitle: String(source.communityTitle ?? "").trim(),
    communitySubtitle: String(source.communitySubtitle ?? "").trim(),
    communityImageUrl: String(source.communityImageUrl ?? "").trim(),
  };
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

function buildPublicRechargeTermsDocument(document: LegalDocumentRecord | null) {
  const fallback = {
    title: "付费会员服务协议",
    contentHtml: "<p>暂无协议内容。</p>",
    versionLabel: null,
  };
  return {
    key: "legal.recharge_terms",
    document: document
      ? {
          title: document.title,
          contentHtml: document.contentHtml,
          versionLabel: document.versionLabel,
        }
      : fallback,
    updatedAt: document?.updatedAt ?? null,
  };
}

function publicLegalDocumentTitle(type: LegalDocumentType) {
  if (type === "service") return legalDocumentConfigs.serviceAgreement.title;
  if (type === "privacy") return legalDocumentConfigs.privacyPolicy.title;
  if (type === rechargeTermsLegalDocumentType) return "付费会员服务协议";
  return "协议文档";
}

function defaultLegalDocumentContent(type: LegalDocumentType) {
  if (type === "service" || type === "privacy") {
    return defaultLegalDocumentValue(publicLegalDocumentKeyByType(type)).contentHtml;
  }
  return "<p>暂无协议内容。</p>";
}

function nextLegalDocumentSortOrder(documents: LegalDocumentRecord[], type: LegalDocumentType) {
  const typeDocuments = documents.filter((document) => document.type === type);
  const maxSortOrder = typeDocuments.reduce((max, document) => Math.max(max, Number(document.sortOrder || 0)), 0);
  return maxSortOrder + 100 || (type === "service" ? 100 : type === "privacy" ? 200 : 300);
}

function normalizeLegalDocumentTypeInput(type: string, title?: string): LegalDocumentType | null {
  return normalizeLegalDocumentTypeValue(type, title);
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
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
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
    requestDomain: row.request_domain || parsedPurpose.baseUrl || "",
    providerChannel: parsedPurpose.providerChannel,
    mediaTypes: parsedPurpose.mediaTypes,
    modelCodes: parsedPurpose.modelCodes,
    baseUrl: parsedPurpose.baseUrl,
    authHeaderName: parsedPurpose.authHeaderName,
    authScheme: parsedPurpose.authScheme,
    extraHeaders: parsedPurpose.extraHeaders,
    status: row.status,
    hasSecret: Boolean(row.has_secret),
    maskedSecretValue: maskSecretValue(row.secret_value),
    secretValue: "",
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
  };
}

function maskSecretValue(value: string | null) {
  const normalized = String(value ?? "");
  if (!normalized) return "";
  if (normalized.length <= 8) return "******";
  return `${normalized.slice(0, 4)}******${normalized.slice(-4)}`;
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
    superAdminSlot: row.super_admin_slot === null ? null : Number(row.super_admin_slot),
    isProtectedSuperAdmin: row.super_admin_slot !== null,
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

async function withDatabaseTransaction<T>(db: SqlDatabase, run: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    const result = await run();
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function error(status: number, code: string, message: string) {
  return {
    status,
    body: { error: { code, message } },
  };
}
