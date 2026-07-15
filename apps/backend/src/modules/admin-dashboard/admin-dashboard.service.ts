import type { SqlDatabase } from "../shared/db/sql.ts";

export function createAdminDashboardService(deps: { db: SqlDatabase }) {
  async function overview(input: {
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
  }) {
    return {
      data: await loadModelHealth(deps.db, input),
    };
  }

  async function recentEvents(input: {
  }) {
    return {
      data: await loadRecentEvents(deps.db, input),
    };
  }

  return { overview, modelHealth, recentEvents };
}

async function loadMetrics(
  db: SqlDatabase,
  input: { dayStart: Date; now: Date },
) {
  const monthStart = new Date(input.now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [tasks, users, activeUsers, credits, orders, risks, storageFailures, memberships, projects] = await Promise.all([
    db.query<{
      total: number | string;
      succeeded: number | string;
      failed: number | string;
      in_progress: number | string;
    }>(
      `
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
          count(*) FILTER (WHERE status IN ('failed', 'result_unknown', 'manual_review_required'))::int AS failed,
          count(*) FILTER (WHERE status IN ('queued', 'running'))::int AS in_progress
        FROM tasks
        WHERE created_at >= $1
      `,
      [input.dayStart],
    ),
    db.query<{ total: number | string }>(
      `
        SELECT count(*)::int AS total
        FROM users
      `,
    ),
    db.query<{ active: number | string }>(
      `
        SELECT count(DISTINCT user_id)::int AS active
        FROM auth_sessions
        WHERE status = 'active'
          AND last_seen_at >= $1
      `,
      [input.dayStart],
    ),
    db.query<{ consumed: number | string }>(
      `
        SELECT COALESCE(sum(consumed_delta), 0)::int AS consumed
        FROM credit_ledger_entries
        WHERE created_at >= $1
      `,
      [input.dayStart],
    ),
    db.query<{
      paid: number | string;
      amount_total_minor: number | string;
      amount_month_minor: number | string;
      amount_today_minor: number | string;
    }>(
      `
        SELECT
          count(*) FILTER (WHERE paid_at >= $1)::int AS paid,
          COALESCE(sum(amount_minor), 0)::bigint AS amount_total_minor,
          COALESCE(sum(amount_minor) FILTER (WHERE paid_at >= $2), 0)::bigint AS amount_month_minor,
          COALESCE(sum(amount_minor) FILTER (WHERE paid_at >= $1), 0)::bigint AS amount_today_minor
        FROM billing_orders
        WHERE status = 'paid'
          AND paid_at IS NOT NULL
      `,
      [input.dayStart, monthStart],
    ),
    db.query<{ pending: number | string }>(
      `
        SELECT count(*)::int AS pending
        FROM payment_risk_events
        WHERE status = 'open'
      `,
    ),
    db.query<{ pending: number | string }>(
      `
        SELECT count(*)::int AS pending
        FROM tasks
        WHERE status IN ('failed', 'manual_review_required')
          AND failure_code = 'provider_output_storage_failed'
      `,
    ),
    db.query<{ active: number | string }>(
      `
        SELECT count(*)::int AS active
        FROM membership_periods
        WHERE status = 'active'
          AND period_start_at <= $1
          AND period_end_at > $1
      `,
      [input.now],
    ),
    db.query<{ total: number | string; created_today: number | string }>(
      `
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE created_at >= $1)::int AS created_today
        FROM projects
      `,
      [input.dayStart],
    ),
  ]);

  const total = Number(tasks.rows[0]?.total ?? 0);
  const succeeded = Number(tasks.rows[0]?.succeeded ?? 0);
  const failed = Number(tasks.rows[0]?.failed ?? 0);
  const inProgress = Number(tasks.rows[0]?.in_progress ?? 0);
  return {
    generationCountToday: total,
    generationSuccessRate: total ? Number((succeeded / total).toFixed(4)) : 0,
    generationSucceededToday: succeeded,
    generationFailedToday: failed,
    generationInProgressToday: inProgress,
    userCount: Number(users.rows[0]?.total ?? 0),
    activeUserCountToday: Number(activeUsers.rows[0]?.active ?? 0),
    creditsConsumedToday: Number(credits.rows[0]?.consumed ?? 0),
    paidOrdersToday: Number(orders.rows[0]?.paid ?? 0),
    paidOrderAmountTotalMinor: Number(orders.rows[0]?.amount_total_minor ?? 0),
    paidOrderAmountMonthMinor: Number(orders.rows[0]?.amount_month_minor ?? 0),
    paidOrderAmountTodayMinor: Number(orders.rows[0]?.amount_today_minor ?? 0),
    riskPendingCount: Number(risks.rows[0]?.pending ?? 0),
    storageFailureCount: Number(storageFailures.rows[0]?.pending ?? 0),
    failedTaskCount: failed,
    activeMembershipCount: Number(memberships.rows[0]?.active ?? 0),
    projectCount: Number(projects.rows[0]?.total ?? 0),
    projectsCreatedToday: Number(projects.rows[0]?.created_today ?? 0),
  };
}

async function loadModelHealth(
  db: SqlDatabase,
  _input: Record<string, unknown>,
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
        WHERE queue_name = p.submit_queue_name
      ) t ON true
      ORDER BY m.sort_order ASC, m.updated_at DESC
      LIMIT 20
    `,
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
  _input: Record<string, unknown>,
) {
  const result = await db.query<RecentEventRow>(
    `
      SELECT id, event_type, target_type, target_id, reason, metadata_json, created_at
      FROM audit_events
      ORDER BY created_at DESC, id ASC
      LIMIT 10
    `,
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
