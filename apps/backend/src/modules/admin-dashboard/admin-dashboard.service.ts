import type { SqlDatabase } from "../shared/db/sql.ts";

export function createAdminDashboardService(deps: { db: SqlDatabase }) {
  async function overview(input: {
    organizationId: string;
    workspaceId: string;
    now: Date;
  }) {
    const dayStart = new Date(input.now);
    dayStart.setHours(0, 0, 0, 0);

    const [metrics, modelHealth, recentEvents] = await Promise.all([
      loadMetrics(deps.db, { ...input, dayStart }),
      loadModelHealth(deps.db, input),
      loadRecentEvents(deps.db, input),
    ]);

    return {
      data: {
        metrics,
        modelHealth,
        recentEvents,
      },
    };
  }

  async function modelHealth(input: {
    organizationId: string;
    workspaceId: string;
  }) {
    return {
      data: await loadModelHealth(deps.db, input),
    };
  }

  async function recentEvents(input: {
    organizationId: string;
    workspaceId: string;
  }) {
    return {
      data: await loadRecentEvents(deps.db, input),
    };
  }

  return { overview, modelHealth, recentEvents };
}

async function loadMetrics(
  db: SqlDatabase,
  input: { organizationId: string; workspaceId: string; dayStart: Date },
) {
  const [tasks, credits, orders, risks] = await Promise.all([
    db.query<{
      total: number | string;
      succeeded: number | string;
      failed: number | string;
    }>(
      `
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
          count(*) FILTER (WHERE status IN ('failed', 'result_unknown', 'manual_review_required'))::int AS failed
        FROM tasks
        WHERE organization_id = $1
          AND workspace_id = $2
          AND created_at >= $3
      `,
      [input.organizationId, input.workspaceId, input.dayStart],
    ),
    db.query<{ consumed: number | string }>(
      `
        SELECT COALESCE(sum(consumed_delta), 0)::int AS consumed
        FROM credit_ledger_entries
        WHERE organization_id = $1
          AND created_at >= $2
      `,
      [input.organizationId, input.dayStart],
    ),
    db.query<{ paid: number | string }>(
      `
        SELECT count(*)::int AS paid
        FROM billing_orders
        WHERE organization_id = $1
          AND status = 'paid'
          AND paid_at >= $2
      `,
      [input.organizationId, input.dayStart],
    ),
    db.query<{ pending: number | string }>(
      `
        SELECT count(*)::int AS pending
        FROM payment_risk_events
        WHERE organization_id = $1
          AND status = 'open'
      `,
      [input.organizationId],
    ),
  ]);

  const total = Number(tasks.rows[0]?.total ?? 0);
  const succeeded = Number(tasks.rows[0]?.succeeded ?? 0);
  const failed = Number(tasks.rows[0]?.failed ?? 0);
  return {
    generationCountToday: total,
    generationSuccessRate: total ? Number((succeeded / total).toFixed(4)) : 0,
    creditsConsumedToday: Number(credits.rows[0]?.consumed ?? 0),
    paidOrdersToday: Number(orders.rows[0]?.paid ?? 0),
    riskPendingCount: Number(risks.rows[0]?.pending ?? 0),
    failedTaskCount: failed,
  };
}

async function loadModelHealth(
  db: SqlDatabase,
  input: { organizationId: string; workspaceId: string },
) {
  const result = await db.query<ModelHealthRow>(
    `
      SELECT
        m.model_code,
        m.display_name,
        m.status,
        COALESCE(p.submit_queue_name, '-') AS submit_queue_name,
        COALESCE(t.queue_depth, 0)::int AS queue_depth,
        COALESCE(t.failed_count, 0)::int AS failed_count
      FROM ai_model_configs m
      LEFT JOIN ai_model_dispatch_policies p ON p.model_config_id = m.id
      LEFT JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE status IN ('queued', 'running'))::int AS queue_depth,
          count(*) FILTER (WHERE status IN ('failed', 'result_unknown', 'manual_review_required'))::int AS failed_count
        FROM tasks
        WHERE organization_id = $1
          AND workspace_id = $2
          AND queue_name = p.submit_queue_name
      ) t ON true
      ORDER BY m.sort_order ASC, m.updated_at DESC
      LIMIT 20
    `,
    [input.organizationId, input.workspaceId],
  );

  return result.rows.map((row) => ({
    modelCode: row.model_code,
    displayName: row.display_name,
    status: row.status,
    queueName: row.submit_queue_name,
    queueDepth: Number(row.queue_depth),
    failedCount: Number(row.failed_count),
  }));
}

async function loadRecentEvents(
  db: SqlDatabase,
  input: { organizationId: string; workspaceId: string },
) {
  const result = await db.query<RecentEventRow>(
    `
      SELECT id, event_type, target_type, target_id, reason, metadata_json, created_at
      FROM audit_events
      WHERE organization_id = $1
        AND workspace_id = $2
      ORDER BY created_at DESC, id ASC
      LIMIT 10
    `,
    [input.organizationId, input.workspaceId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    type: row.event_type,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    metadata: parseJsonObject(row.metadata_json),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

interface ModelHealthRow {
  model_code: string;
  display_name: string;
  status: string;
  submit_queue_name: string;
  queue_depth: number | string;
  failed_count: number | string;
}

interface RecentEventRow {
  id: string;
  event_type: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  metadata_json: unknown;
  created_at: Date | string;
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
