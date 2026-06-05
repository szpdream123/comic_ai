import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface AdminModelConfigView {
  id: string;
  modelCode: string;
  displayName: string;
  providerName: string;
  providerModel: string;
  providerProtocol: string;
  invocationMode: string;
  mediaType: string;
  taskModes: string[];
  capabilities: Record<string, unknown>;
  parameterSchema: Record<string, unknown>;
  defaultParams: Record<string, unknown>;
  providerConfig: Record<string, unknown>;
  pricing: Record<string, unknown>;
  limits: Record<string, unknown>;
  uiConfig: Record<string, unknown>;
  status: string;
  sortOrder: number;
  remark: string | null;
  dispatchPolicy: AdminModelDispatchPolicyView | null;
}

export interface AdminModelDispatchPolicyView {
  id: string;
  submitQueueName: string;
  pollQueueName: string | null;
  finalizeQueueName: string | null;
  providerRpmLimit: number;
  providerConcurrentLimit: number;
  submitConcurrencyLimit: number;
  pollingIntervalMs: number;
  pollingConcurrencyLimit: number;
  status: string;
}

interface AdminModelConfigRow {
  id: string;
  model_code: string;
  display_name: string;
  provider_name: string;
  provider_model: string;
  provider_protocol: string;
  invocation_mode: string;
  media_type: string;
  task_modes_json: unknown;
  capabilities_json: unknown;
  parameter_schema_json: unknown;
  default_params_json: unknown;
  provider_config_json: unknown;
  pricing_json: unknown;
  limits_json: unknown;
  ui_config_json: unknown;
  status: string;
  sort_order: number | string;
  remark: string | null;
  dispatch_policy_json: unknown;
}

export function createAdminModelConfigService(deps: { db: SqlDatabase }) {
  async function listModels(input: {
    keyword?: string | null;
    status?: string | null;
    mediaType?: string | null;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;
    const filters: string[] = [];
    const params: unknown[] = [];

    const keyword = input.keyword?.trim();
    if (keyword) {
      params.push(`%${keyword}%`);
      filters.push(`(
        m.model_code ILIKE $${params.length}
        OR m.display_name ILIKE $${params.length}
        OR m.provider_name ILIKE $${params.length}
      )`);
    }

    const status = input.status?.trim();
    if (status) {
      params.push(status);
      filters.push(`m.status = $${params.length}`);
    }

    const mediaType = input.mediaType?.trim();
    if (mediaType) {
      params.push(mediaType);
      filters.push(`m.media_type = $${params.length}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const total = await deps.db.query<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM ai_model_configs m
        ${whereSql}
      `,
      params,
    );
    const result = await deps.db.query<AdminModelConfigRow>(
      `
        SELECT
          m.*,
          CASE
            WHEN p.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', p.id,
              'submitQueueName', p.submit_queue_name,
              'pollQueueName', p.poll_queue_name,
              'finalizeQueueName', p.finalize_queue_name,
              'providerRpmLimit', p.provider_rpm_limit,
              'providerConcurrentLimit', p.provider_concurrent_limit,
              'submitConcurrencyLimit', p.submit_concurrency_limit,
              'pollingIntervalMs', p.polling_interval_ms,
              'pollingConcurrencyLimit', p.polling_concurrency_limit,
              'status', p.status
            )
          END AS dispatch_policy_json
        FROM ai_model_configs m
        LEFT JOIN ai_model_dispatch_policies p
          ON p.model_config_id = m.id
        ${whereSql}
        ORDER BY m.sort_order ASC, m.updated_at DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, pageSize, offset],
    );

    return {
      data: result.rows.map(modelFromRow),
      meta: {
        page,
        pageSize,
        total: Number(total.rows[0]?.count ?? 0),
      },
    };
  }

  async function getModel(id: string) {
    const row = await queryOne<AdminModelConfigRow>(
      deps.db,
      `
        SELECT
          m.*,
          CASE
            WHEN p.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', p.id,
              'submitQueueName', p.submit_queue_name,
              'pollQueueName', p.poll_queue_name,
              'finalizeQueueName', p.finalize_queue_name,
              'providerRpmLimit', p.provider_rpm_limit,
              'providerConcurrentLimit', p.provider_concurrent_limit,
              'submitConcurrencyLimit', p.submit_concurrency_limit,
              'pollingIntervalMs', p.polling_interval_ms,
              'pollingConcurrencyLimit', p.polling_concurrency_limit,
              'status', p.status
            )
          END AS dispatch_policy_json
        FROM ai_model_configs m
        LEFT JOIN ai_model_dispatch_policies p
          ON p.model_config_id = m.id
        WHERE m.id = $1
        LIMIT 1
      `,
      [id],
    );

    return row ? modelFromRow(row) : undefined;
  }

  async function createModel(input: AdminModelWriteInput & AdminModelWriteContext) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const validation = validateModelWriteInput(input, true);
    if (validation) return validation;

    const id = uuidFromIdempotencyKey(input.idempotencyKey);
    const now = input.now;
    await deps.db.query(
      `
        INSERT INTO ai_model_configs (
          id,
          model_code,
          display_name,
          provider_name,
          provider_model,
          provider_protocol,
          invocation_mode,
          media_type,
          task_modes_json,
          capabilities_json,
          parameter_schema_json,
          default_params_json,
          provider_config_json,
          pricing_json,
          limits_json,
          ui_config_json,
          status,
          sort_order,
          remark,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb,
          $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19, $20, $20
        )
      `,
      [
        id,
        input.modelCode!.trim(),
        input.displayName!.trim(),
        input.providerName!.trim(),
        input.providerModel!.trim(),
        input.providerProtocol!.trim(),
        input.invocationMode!.trim(),
        input.mediaType!.trim(),
        JSON.stringify(input.taskModes ?? []),
        JSON.stringify(input.capabilities ?? {}),
        JSON.stringify(input.parameterSchema ?? {}),
        JSON.stringify(input.defaultParams ?? {}),
        JSON.stringify(input.providerConfig ?? {}),
        JSON.stringify(input.pricing ?? {}),
        JSON.stringify(input.limits ?? {}),
        JSON.stringify(input.uiConfig ?? {}),
        input.status?.trim() || "disabled",
        Number(input.sortOrder ?? 100),
        input.remark?.trim() || null,
        now,
      ],
    );
    await upsertDispatchPolicy(id, input.dispatchPolicy, now);
    const model = (await getModel(id))!;
    await recordRevisionAndAudit({
      model,
      eventType: input.auditEventType ?? "admin.model.created",
      reason,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now,
    });
    return { status: 200, body: { data: model } };
  }

  async function updateModel(input: {
    id: string;
    patch: Partial<AdminModelWriteInput>;
  } & AdminModelWriteContext) {
    const existing = await getModel(input.id);
    if (!existing) return error(404, "admin_model_not_found", "模型不存在");
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");

    const merged: AdminModelWriteInput = {
      ...existing,
      ...input.patch,
      modelCode: input.patch.modelCode ?? existing.modelCode,
      displayName: input.patch.displayName ?? existing.displayName,
      providerName: input.patch.providerName ?? existing.providerName,
      providerModel: input.patch.providerModel ?? existing.providerModel,
      providerProtocol: input.patch.providerProtocol ?? existing.providerProtocol,
      invocationMode: input.patch.invocationMode ?? existing.invocationMode,
      mediaType: input.patch.mediaType ?? existing.mediaType,
      taskModes: input.patch.taskModes ?? existing.taskModes,
      dispatchPolicy: input.patch.dispatchPolicy ?? existing.dispatchPolicy ?? undefined,
      reason,
    };
    const validation = validateModelWriteInput(merged, true);
    if (validation) return validation;
    await deps.db.query(
      `
        UPDATE ai_model_configs
        SET display_name = $2,
            provider_name = $3,
            provider_model = $4,
            provider_protocol = $5,
            invocation_mode = $6,
            media_type = $7,
            task_modes_json = $8::jsonb,
            capabilities_json = $9::jsonb,
            parameter_schema_json = $10::jsonb,
            default_params_json = $11::jsonb,
            provider_config_json = $12::jsonb,
            pricing_json = $13::jsonb,
            limits_json = $14::jsonb,
            ui_config_json = $15::jsonb,
            sort_order = $16,
            remark = $17,
            updated_at = $18
        WHERE id = $1
      `,
      [
        input.id,
        merged.displayName,
        merged.providerName,
        merged.providerModel,
        merged.providerProtocol,
        merged.invocationMode,
        merged.mediaType,
        JSON.stringify(merged.taskModes ?? []),
        JSON.stringify(merged.capabilities ?? {}),
        JSON.stringify(merged.parameterSchema ?? {}),
        JSON.stringify(merged.defaultParams ?? {}),
        JSON.stringify(merged.providerConfig ?? {}),
        JSON.stringify(merged.pricing ?? {}),
        JSON.stringify(merged.limits ?? {}),
        JSON.stringify(merged.uiConfig ?? {}),
        Number(merged.sortOrder ?? existing.sortOrder),
        merged.remark ?? null,
        input.now,
      ],
    );
    await upsertDispatchPolicy(input.id, merged.dispatchPolicy, input.now);
    const model = (await getModel(input.id))!;
    await recordRevisionAndAudit({
      model,
      eventType: "admin.model.updated",
      reason,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
    });
    return { status: 200, body: { data: model } };
  }

  async function duplicateModel(input: {
    id: string;
    modelCode: string;
    displayName: string;
  } & AdminModelWriteContext) {
    const existing = await getModel(input.id);
    if (!existing) return error(404, "admin_model_not_found", "模型不存在");
    return createModel({
      ...existing,
      id: undefined,
      modelCode: input.modelCode,
      displayName: input.displayName,
      status: "disabled",
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
      dispatchPolicy: existing.dispatchPolicy
        ? {
            ...existing.dispatchPolicy,
            id: undefined,
            submitQueueName: `${existing.dispatchPolicy.submitQueueName}-copy`,
            pollQueueName: existing.dispatchPolicy.pollQueueName
              ? `${existing.dispatchPolicy.pollQueueName}-copy`
              : null,
          }
        : undefined,
      auditEventType: "admin.model.duplicated",
    });
  }

  async function changeStatus(input: {
    id: string;
    status: string;
  } & AdminModelWriteContext) {
    const existing = await getModel(input.id);
    if (!existing) return error(404, "admin_model_not_found", "模型不存在");
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    if (!["active", "disabled", "archived"].includes(input.status)) {
      return error(400, "invalid_model_status", "模型状态不支持");
    }
    if (input.status === "active") {
      const launchCheck = modelLaunchCheck(existing);
      if (!launchCheck.ok) {
        return {
          status: 400,
          body: {
            error: {
              code: "admin_model_launch_check_failed",
              message: "模型上线检查未通过",
              details: { failedItems: launchCheck.failedItems },
            },
          },
        };
      }
    }
    await deps.db.query(
      "UPDATE ai_model_configs SET status = $2, updated_at = $3 WHERE id = $1",
      [input.id, input.status, input.now],
    );
    const model = (await getModel(input.id))!;
    await recordRevisionAndAudit({
      model,
      eventType: "admin.model.status_changed",
      reason,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
    });
    return { status: 200, body: { data: model } };
  }

  async function listRevisions(input: { id: string; pageSize?: number }) {
    const model = await getModel(input.id);
    if (!model) return error(404, "admin_model_not_found", "模型不存在");
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
    const result = await deps.db.query<{
      id: string;
      model_config_id: string;
      snapshot_json: unknown;
      changed_by_admin_id: string | null;
      reason: string | null;
      created_at: Date | string;
    }>(
      `
        SELECT id, model_config_id, snapshot_json, changed_by_admin_id, reason, created_at
        FROM ai_model_config_revisions
        WHERE model_config_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [input.id, pageSize],
    );
    return {
      status: 200,
      body: {
        data: result.rows.map((row) => {
          const snapshot = parseJsonObject(row.snapshot_json) as Partial<AdminModelConfigView>;
          return {
            id: row.id,
            modelConfigId: row.model_config_id,
            reason: row.reason,
            changedByAdminId: row.changed_by_admin_id,
            createdAt: new Date(row.created_at).toISOString(),
            snapshot: {
              modelCode: snapshot.modelCode,
              displayName: snapshot.displayName,
              providerModel: snapshot.providerModel,
              status: snapshot.status,
              pricing: snapshot.pricing ?? {},
            },
          };
        }),
        meta: { total: result.rows.length },
      },
    };
  }

  async function rollbackModel(input: {
    id: string;
    revisionId: string;
  } & AdminModelWriteContext) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const existing = await getModel(input.id);
    if (!existing) return error(404, "admin_model_not_found", "模型不存在");
    const revision = await queryOne<{
      id: string;
      snapshot_json: unknown;
    }>(
      deps.db,
      `
        SELECT id, snapshot_json
        FROM ai_model_config_revisions
        WHERE id = $1
          AND model_config_id = $2
        LIMIT 1
      `,
      [input.revisionId, input.id],
    );
    if (!revision) return error(404, "admin_model_revision_not_found", "模型修订不存在");
    const snapshot = parseJsonObject(revision.snapshot_json) as Partial<AdminModelConfigView>;
    const validation = validateModelWriteInput(snapshot as AdminModelWriteInput, true);
    if (validation) return validation;
    await deps.db.query(
      `
        UPDATE ai_model_configs
        SET display_name = $2,
            provider_name = $3,
            provider_model = $4,
            provider_protocol = $5,
            invocation_mode = $6,
            media_type = $7,
            task_modes_json = $8::jsonb,
            capabilities_json = $9::jsonb,
            parameter_schema_json = $10::jsonb,
            default_params_json = $11::jsonb,
            provider_config_json = $12::jsonb,
            pricing_json = $13::jsonb,
            limits_json = $14::jsonb,
            ui_config_json = $15::jsonb,
            status = $16,
            sort_order = $17,
            remark = $18,
            updated_at = $19
        WHERE id = $1
      `,
      [
        input.id,
        snapshot.displayName,
        snapshot.providerName,
        snapshot.providerModel,
        snapshot.providerProtocol,
        snapshot.invocationMode,
        snapshot.mediaType,
        JSON.stringify(snapshot.taskModes ?? []),
        JSON.stringify(snapshot.capabilities ?? {}),
        JSON.stringify(snapshot.parameterSchema ?? {}),
        JSON.stringify(snapshot.defaultParams ?? {}),
        JSON.stringify(snapshot.providerConfig ?? {}),
        JSON.stringify(snapshot.pricing ?? {}),
        JSON.stringify(snapshot.limits ?? {}),
        JSON.stringify(snapshot.uiConfig ?? {}),
        snapshot.status ?? "disabled",
        Number(snapshot.sortOrder ?? existing.sortOrder),
        snapshot.remark ?? null,
        input.now,
      ],
    );
    await upsertDispatchPolicy(input.id, snapshot.dispatchPolicy ?? undefined, input.now);
    const model = (await getModel(input.id))!;
    await recordRevisionAndAudit({
      model,
      eventType: "admin.model.rolled_back",
      reason,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
    });
    return { status: 200, body: { data: model } };
  }

  return {
    listModels,
    getModel,
    createModel,
    updateModel,
    duplicateModel,
    changeStatus,
    listRevisions,
    rollbackModel,
  };

  async function upsertDispatchPolicy(
    modelConfigId: string,
    policy: AdminModelWriteInput["dispatchPolicy"],
    now: Date,
  ) {
    if (!policy) return;
    await deps.db.query(
      `
        INSERT INTO ai_model_dispatch_policies (
          id,
          model_config_id,
          submit_queue_name,
          poll_queue_name,
          finalize_queue_name,
          provider_rpm_limit,
          provider_concurrent_limit,
          submit_concurrency_limit,
          polling_interval_ms,
          polling_concurrency_limit,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $11)
        ON CONFLICT (model_config_id)
        DO UPDATE SET
          submit_queue_name = EXCLUDED.submit_queue_name,
          poll_queue_name = EXCLUDED.poll_queue_name,
          finalize_queue_name = EXCLUDED.finalize_queue_name,
          provider_rpm_limit = EXCLUDED.provider_rpm_limit,
          provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
          submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
          polling_interval_ms = EXCLUDED.polling_interval_ms,
          polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
          updated_at = EXCLUDED.updated_at
      `,
      [
        policy.id ?? randomUUID(),
        modelConfigId,
        policy.submitQueueName,
        policy.pollQueueName ?? null,
        policy.finalizeQueueName ?? null,
        Number(policy.providerRpmLimit ?? 60),
        Number(policy.providerConcurrentLimit ?? 5),
        Number(policy.submitConcurrencyLimit ?? 5),
        Number(policy.pollingIntervalMs ?? 15000),
        Number(policy.pollingConcurrencyLimit ?? 20),
        now,
      ],
    );
  }

  async function recordRevisionAndAudit(input: {
    model: AdminModelConfigView;
    eventType: string;
    reason: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    await deps.db.query(
      `
        INSERT INTO ai_model_config_revisions (
          id, model_config_id, snapshot_json, changed_by_admin_id, reason, created_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6)
      `,
      [
        randomUUID(),
        input.model.id,
        JSON.stringify(input.model),
        input.actorAdminAccountId,
        input.reason,
        input.now,
      ],
    );
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType: input.eventType,
      targetType: "ai_model_config",
      targetId: input.model.id,
      reason: input.reason,
      sensitive: true,
      metadata: {
        modelCode: input.model.modelCode,
        actorAdminAccountId: input.actorAdminAccountId,
        status: input.model.status,
      },
    });
  }
}

interface AdminModelWriteContext {
  reason: string;
  idempotencyKey: string;
  actorAdminAccountId: string;
  auditOrganizationId: string;
  auditWorkspaceId: string;
  now: Date;
  auditEventType?: string;
}

interface AdminModelWriteInput {
  id?: string;
  modelCode?: string;
  displayName?: string;
  providerName?: string;
  providerModel?: string;
  providerProtocol?: string;
  invocationMode?: string;
  mediaType?: string;
  taskModes?: string[];
  capabilities?: Record<string, unknown>;
  parameterSchema?: Record<string, unknown>;
  defaultParams?: Record<string, unknown>;
  providerConfig?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  uiConfig?: Record<string, unknown>;
  status?: string;
  sortOrder?: number;
  remark?: string | null;
  dispatchPolicy?: Partial<AdminModelDispatchPolicyView> & {
    submitQueueName?: string;
  };
}

function modelFromRow(row: AdminModelConfigRow): AdminModelConfigView {
  return {
    id: row.id,
    modelCode: row.model_code,
    displayName: row.display_name,
    providerName: row.provider_name,
    providerModel: row.provider_model,
    providerProtocol: row.provider_protocol,
    invocationMode: row.invocation_mode,
    mediaType: row.media_type,
    taskModes: parseJsonArray(row.task_modes_json),
    capabilities: parseJsonObject(row.capabilities_json),
    parameterSchema: parseJsonObject(row.parameter_schema_json),
    defaultParams: parseJsonObject(row.default_params_json),
    providerConfig: parseJsonObject(row.provider_config_json),
    pricing: parseJsonObject(row.pricing_json),
    limits: parseJsonObject(row.limits_json),
    uiConfig: parseJsonObject(row.ui_config_json),
    status: row.status,
    sortOrder: Number(row.sort_order),
    remark: row.remark,
    dispatchPolicy: dispatchPolicyFromJson(row.dispatch_policy_json),
  };
}

function dispatchPolicyFromJson(value: unknown): AdminModelDispatchPolicyView | null {
  const policy = parseJsonObject(value);
  const id = readString(policy.id);
  if (!id) {
    return null;
  }
  return {
    id,
    submitQueueName: readString(policy.submitQueueName) ?? "",
    pollQueueName: readString(policy.pollQueueName),
    finalizeQueueName: readString(policy.finalizeQueueName),
    providerRpmLimit: Number(policy.providerRpmLimit ?? 0),
    providerConcurrentLimit: Number(policy.providerConcurrentLimit ?? 0),
    submitConcurrencyLimit: Number(policy.submitConcurrencyLimit ?? 0),
    pollingIntervalMs: Number(policy.pollingIntervalMs ?? 0),
    pollingConcurrencyLimit: Number(policy.pollingConcurrencyLimit ?? 0),
    status: readString(policy.status) ?? "disabled",
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return parseJsonObject(JSON.parse(value) as unknown);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value === "string") {
    return parseJsonArray(JSON.parse(value) as unknown);
  }
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validateModelWriteInput(input: AdminModelWriteInput, requireAll: boolean) {
  const requiredFields: Array<keyof AdminModelWriteInput> = [
    "modelCode",
    "displayName",
    "providerName",
    "providerModel",
    "providerProtocol",
    "invocationMode",
    "mediaType",
  ];
  if (requireAll) {
    const missing = requiredFields.find((field) => !readString(input[field]));
    if (missing) {
      return error(400, "admin_model_required", "请填写模型基础信息");
    }
  }
  if (input.providerProtocol && !["creator_dev", "openai_images", "openai_compatible_chat", "volcengine_ark_video", "custom_http"].includes(input.providerProtocol)) {
    return error(400, "invalid_provider_protocol", "供应商协议不支持");
  }
  if (input.invocationMode && !["sync", "async_polling", "stream", "webhook"].includes(input.invocationMode)) {
    return error(400, "invalid_invocation_mode", "调用方式不支持");
  }
  if (input.mediaType && !["text", "image", "video", "audio", "multimodal"].includes(input.mediaType)) {
    return error(400, "invalid_media_type", "媒体类型不支持");
  }
  if (input.status && !["active", "disabled", "archived"].includes(input.status)) {
    return error(400, "invalid_model_status", "模型状态不支持");
  }
  if (!Array.isArray(input.taskModes) || input.taskModes.length === 0) {
    return error(400, "task_modes_required", "至少需要一个任务模式");
  }
  if (input.dispatchPolicy && !readString(input.dispatchPolicy.submitQueueName)) {
    return error(400, "dispatch_submit_queue_required", "请配置提交队列");
  }
  return null;
}

function modelLaunchCheck(model: AdminModelConfigView) {
  const failedItems: Array<{ key: string; label: string; message: string }> = [];
  if (!readString(model.providerConfig?.apiKeyEnv)) {
    failedItems.push({
      key: "apiKeyEnv",
      label: "密钥引用",
      message: "供应商配置必须填写 apiKeyEnv，且只能保存密钥引用名。",
    });
  }
  if (!hasValidProviderEndpoint(model.providerConfig)) {
    failedItems.push({
      key: "endpoint",
      label: "Endpoint",
      message: "供应商 endpoint 必须是 http/https URL，或以 / 开头的接口路径。",
    });
  }
  if (model.invocationMode === "async_polling" && !isValidOptionalProviderEndpoint(model.providerConfig?.queryTaskEndpoint)) {
    failedItems.push({
      key: "queryTaskEndpoint",
      label: "轮询 Endpoint",
      message: "异步轮询模型必须配置合法 queryTaskEndpoint，用于查询任务结果。",
    });
  }
  if (Object.keys(model.parameterSchema ?? {}).length === 0) {
    failedItems.push({
      key: "parameterSchema",
      label: "参数校验",
      message: "模型参数 schema 不能为空。",
    });
  }
  if (!Number.isFinite(Number(model.pricing?.baseCredits)) || Number(model.pricing?.baseCredits) <= 0) {
    failedItems.push({
      key: "pricing",
      label: "计费规则",
      message: "模型定价必须配置大于 0 的 baseCredits。",
    });
  }
  if (!model.dispatchPolicy || !readString(model.dispatchPolicy.submitQueueName)) {
    failedItems.push({
      key: "dispatchPolicy",
      label: "调度策略",
      message: "调度策略必须配置提交队列。",
    });
  }
  return { ok: failedItems.length === 0, failedItems };
}

function hasValidProviderEndpoint(providerConfig: Record<string, unknown>) {
  const candidates = [
    readString(providerConfig.endpoint),
    readString(providerConfig.createTaskEndpoint),
  ].filter(Boolean) as string[];
  return candidates.some(isValidProviderEndpoint);
}

function isValidProviderEndpoint(endpoint: string) {
  if (endpoint.startsWith("/")) {
    return !endpoint.startsWith("//") && !/\s/.test(endpoint);
  }
  try {
    const parsed = new URL(endpoint);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function isValidOptionalProviderEndpoint(endpoint: unknown) {
  const value = readString(endpoint);
  return value ? isValidProviderEndpoint(value) : false;
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
