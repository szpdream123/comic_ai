import { randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";

export function createAdminRiskAuditService(deps: { db: SqlDatabase }) {
  async function listRisks(input: {
    pageSize?: number;
    riskStatus?: string | null;
  }) {
    const pageSize = clampPageSize(input.pageSize);
    const riskStatus = normalizeRiskStatus(input.riskStatus);
    const risks = await deps.db.query<PaymentRiskRow>(
      `
        SELECT
          id,
          order_id,
          payment_intent_id,
          provider_event_id,
          risk_type,
          severity,
          decision,
          status,
          metadata_json,
          created_at,
          updated_at
        FROM payment_risk_events
        WHERE ($1::text IS NULL OR status = $1)
        ORDER BY
          CASE status WHEN 'open' THEN 0 ELSE 1 END,
          created_at DESC,
          id ASC
        LIMIT $2
      `,
      [riskStatus, pageSize],
    );
    const taskExceptions = await deps.db.query<TaskExceptionRow>(
      `
        SELECT
          t.id,
          t.workflow_id,
          t.project_id,
          t.task_type,
          t.status,
          t.queue_name,
          t.failure_code,
          t.updated_at,
          pr.provider_name,
          pr.provider_operation,
          pr.status AS provider_status
        FROM tasks t
        LEFT JOIN LATERAL (
          SELECT provider_name, provider_operation, status
          FROM provider_requests pr
          WHERE pr.task_id = t.id
          ORDER BY pr.updated_at DESC, pr.id DESC
          LIMIT 1
        ) pr ON true
        WHERE t.status IN ('failed', 'result_unknown', 'manual_review_required', 'canceled')
        ORDER BY t.updated_at DESC, t.id ASC
        LIMIT $1
      `,
      [pageSize],
    );
    const paymentIssues = await deps.db.query<PaymentIssueRow>(
      `
        SELECT
          bo.id AS order_id,
          bo.order_no,
          bo.credits,
          bo.amount_minor,
          bo.currency,
          bo.paid_at,
          bo.successful_payment_intent_id,
          bo.credit_grant_ledger_entry_id
        FROM billing_orders bo
        JOIN payment_intents pi
          ON pi.id = bo.successful_payment_intent_id
         AND pi.order_id = bo.id
         AND pi.status = 'succeeded'
         AND pi.amount_minor = bo.amount_minor
         AND pi.currency = bo.currency
        LEFT JOIN credit_ledger_entries cle
          ON cle.user_id = bo.created_by_user_id
         AND cle.source_type = 'payment_order'
         AND cle.source_id = bo.id
         AND cle.entry_type = 'grant'
        WHERE bo.product_type = 'credit_package'
          AND bo.status = 'paid'
          AND bo.credit_grant_ledger_entry_id IS NULL
          AND cle.id IS NULL
          AND EXISTS (
            SELECT 1
            FROM payment_provider_events ppe
            WHERE ppe.order_id = bo.id
              AND ppe.payment_intent_id = pi.id
              AND ppe.event_type = 'payment_succeeded'
              AND ppe.processing_status = 'processed'
          )
        ORDER BY bo.paid_at DESC NULLS LAST, bo.updated_at DESC
        LIMIT $1
      `,
      [pageSize],
    );

    return {
      data: {
        risks: risks.rows.map(paymentRiskFromRow),
        taskExceptions: taskExceptions.rows.map(taskExceptionFromRow),
        paymentIssues: paymentIssues.rows.map(paymentIssueFromRow),
      },
    };
  }

  async function listAuditEvents(input: {
    pageSize?: number;
  }) {
    const pageSize = clampPageSize(input.pageSize);
    const result = await deps.db.query<AuditEventRow>(
      `
        SELECT
          id,
          actor_user_id,
          actor_admin_account_id,
          event_type,
          target_type,
          target_id,
          reason,
          metadata_json,
          created_at
        FROM audit_events
        ORDER BY created_at DESC, id ASC
        LIMIT $1
      `,
      [pageSize],
    );

    return {
      data: result.rows.map(auditEventFromRow),
    };
  }

  async function reviewPaymentRisk(input: {
    riskId: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) {
      return {
        status: 400,
        body: { error: { code: "admin_reason_required", message: "请填写复核原因" } },
      };
    }

    const existing = await queryOne<PaymentRiskDetailRow>(
      deps.db,
      `
        SELECT
          id,
          order_id,
          payment_intent_id,
          provider_event_id,
          risk_type,
          severity,
          decision,
          status,
          metadata_json,
          review_reason,
          reviewed_at,
          created_at,
          updated_at
        FROM payment_risk_events
        WHERE id = $1
      `,
      [input.riskId],
    );
    if (!existing) {
      return {
        status: 404,
        body: { error: { code: "admin_risk_not_found", message: "风险事件不存在" } },
      };
    }

    const wasAlreadyReviewed = existing.status === "reviewed";
    const row =
      wasAlreadyReviewed
        ? existing
        : await queryOne<PaymentRiskDetailRow>(
            deps.db,
            `
              UPDATE payment_risk_events
              SET status = 'reviewed',
                  reviewed_at = $2,
                  review_reason = $3,
                  reviewed_by_admin_account_id = $4,
                  updated_at = $2
              WHERE id = $1
              RETURNING
                id,
                order_id,
                payment_intent_id,
                provider_event_id,
                risk_type,
                severity,
                decision,
                status,
                metadata_json,
                review_reason,
                reviewed_at,
                created_at,
                updated_at
            `,
            [input.riskId, input.now, reason, input.actorAdminAccountId],
          );

    if (!wasAlreadyReviewed) {
      await appendAuditEvent(deps.db, {
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
        eventType: "admin.risk.reviewed",
        targetType: "payment_risk_event",
        targetId: input.riskId,
        reason,
        sensitive: true,
        metadata: {
          actorAdminAccountId: input.actorAdminAccountId,
          orderId: row?.order_id ?? existing.order_id,
          paymentIntentId: row?.payment_intent_id ?? existing.payment_intent_id,
          riskType: row?.risk_type ?? existing.risk_type,
          severity: row?.severity ?? existing.severity,
          idempotencyKey: input.idempotencyKey,
        },
      });
    }

    return {
      status: 200,
      body: {
        data: paymentRiskDetailFromRow(row ?? existing),
      },
    };
  }

  async function exportRisksCsv(input: {
    riskStatus?: string | null;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const riskStatus = normalizeRiskStatus(input.riskStatus);
    const result = await deps.db.query<PaymentRiskRow>(
      `
        SELECT
          id,
          order_id,
          payment_intent_id,
          provider_event_id,
          risk_type,
          severity,
          decision,
          status,
          metadata_json,
          created_at,
          updated_at
        FROM payment_risk_events
        WHERE ($1::text IS NULL OR status = $1)
        ORDER BY created_at DESC, id ASC
        LIMIT 1000
      `,
      [riskStatus],
    );

    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType: "admin.export.created",
      targetType: "admin_export",
      targetId: randomUUID(),
      reason: "export risks csv",
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        scope: "risks",
        format: "csv",
        riskStatus: riskStatus ?? "all",
        rowCount: result.rows.length,
      },
      occurredAt: input.now,
    });

    return {
      fileName: `admin-risks-${dateStamp(input.now)}.csv`,
      body: csv([
        ["风险ID", "风险类型", "等级", "决策", "状态", "订单ID", "支付单ID", "创建时间"],
        ...result.rows.map((row) => [
          row.id,
          row.risk_type,
          row.severity,
          row.decision,
          row.status,
          row.order_id ?? "",
          row.payment_intent_id ?? "",
          new Date(row.created_at).toISOString(),
        ]),
      ]),
    };
  }

  async function exportAuditEventsCsv(input: {
    actorAdminAccountId: string;
    now: Date;
  }) {
    const result = await deps.db.query<AuditEventRow>(
      `
        SELECT
          id,
          actor_user_id,
          actor_admin_account_id,
          event_type,
          target_type,
          target_id,
          reason,
          metadata_json,
          created_at
        FROM audit_events
        ORDER BY created_at DESC, id ASC
        LIMIT 1000
      `,
    );

    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType: "admin.export.created",
      targetType: "admin_export",
      targetId: randomUUID(),
      reason: "export audit-events csv",
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        scope: "audit-events",
        format: "csv",
        rowCount: result.rows.length,
      },
      occurredAt: input.now,
    });

    return {
      fileName: `admin-audit-events-${dateStamp(input.now)}.csv`,
      body: csv([
        ["事件ID", "动作", "对象类型", "对象ID", "原因", "时间"],
        ...result.rows.map((row) => [
          row.id,
          row.event_type,
          row.target_type,
          row.target_id,
          row.reason ?? "",
          new Date(row.created_at).toISOString(),
        ]),
      ]),
    };
  }

  return {
    listRisks,
    listAuditEvents,
    reviewPaymentRisk,
    exportRisksCsv,
    exportAuditEventsCsv,
  };
}

interface PaymentRiskRow {
  id: string;
  order_id: string | null;
  payment_intent_id: string | null;
  provider_event_id: string | null;
  risk_type: string;
  severity: string;
  decision: string;
  status: string;
  metadata_json: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PaymentRiskDetailRow extends PaymentRiskRow {
  review_reason: string | null;
  reviewed_at: Date | string | null;
}

interface TaskExceptionRow {
  id: string;
  workflow_id: string;
  project_id: string | null;
  task_type: string;
  status: string;
  queue_name: string;
  failure_code: string | null;
  updated_at: Date | string;
  provider_name: string | null;
  provider_operation: string | null;
  provider_status: string | null;
}

interface PaymentIssueRow {
  order_id: string;
  order_no: string;
  credits: number;
  amount_minor: number;
  currency: string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
  credit_grant_ledger_entry_id: string | null;
}

interface AuditEventRow {
  id: string;
  actor_user_id: string | null;
  actor_admin_account_id: string | null;
  event_type: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  metadata_json: unknown;
  created_at: Date | string;
}

function paymentRiskFromRow(row: PaymentRiskRow) {
  return {
    id: row.id,
    riskType: row.risk_type,
    severity: row.severity,
    decision: row.decision,
    status: row.status,
    orderId: row.order_id,
    paymentIntentId: row.payment_intent_id,
    providerEventId: row.provider_event_id,
    metadata: normalizeJson(row.metadata_json),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function paymentRiskDetailFromRow(row: PaymentRiskDetailRow) {
  return {
    ...paymentRiskFromRow(row),
    reviewReason: row.review_reason,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
  };
}

function taskExceptionFromRow(row: TaskExceptionRow) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    projectId: row.project_id,
    taskType: row.task_type,
    status: row.status,
    queueName: row.queue_name,
    failureCode: row.failure_code,
    providerName: row.provider_name,
    providerOperation: row.provider_operation,
    providerStatus: row.provider_status,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function paymentIssueFromRow(row: PaymentIssueRow) {
  return {
    issueType: "paid_without_credit",
    orderId: row.order_id,
    orderNo: row.order_no,
    status: row.credit_grant_ledger_entry_id ? "resolved" : "open",
    credits: row.credits,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    successfulPaymentIntentId: row.successful_payment_intent_id,
  };
}

function auditEventFromRow(row: AuditEventRow) {
  const metadata = normalizeJson(row.metadata_json);
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorAdminAccountId: row.actor_admin_account_id,
    eventType: row.event_type,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    metadata,
    ipAddress: typeof metadata.ipAddress === "string" ? metadata.ipAddress : null,
    userAgent: typeof metadata.userAgent === "string" ? metadata.userAgent : null,
    adminDisplayName: typeof metadata.loginName === "string" ? metadata.loginName : null,
    result: "success",
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function normalizeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function clampPageSize(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 50;
  return Math.min(Math.max(Math.trunc(value!), 1), 100);
}

function normalizeRiskStatus(value: string | null | undefined): string | null {
  const status = String(value ?? "").trim();
  if (!status || status === "all") return null;
  return ["open", "reviewed", "ignored_with_reason"].includes(status) ? status : null;
}

function csv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function dateStamp(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

async function queryOne<T>(
  db: SqlDatabase,
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const result = await db.query<T>(text, params);
  return result.rows[0] ?? null;
}
