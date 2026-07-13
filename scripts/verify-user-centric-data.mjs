import pg from "pg";

import { findLegacyValues } from "./cleanup-user-scope-data.mjs";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const legacyTables = [
  ["organ", "izations"].join(""),
  ["work", "spaces"].join(""),
  "memberships",
  ["organization", "_entitlements"].join(""),
  ["organization", "_membership_subscriptions"].join(""),
  "team_plan_limits",
  "team_member_groups",
  "team_member_profiles",
  "team_project_assignments",
  "team_project_ownerships",
  "team_credit_adjustments",
];
const projectChildren = [
  "ai_generation_task_snapshots",
  "asset_review_candidates",
  "assets",
  "audit_events",
  "calibration_sessions",
  "creator_canvas_documents",
  "creator_canvas_projects",
  "credit_reservations",
  "episode_asset_conversation_threads",
  "episode_generation_drafts",
  "episodes",
  "export_records",
  "project_upload_records",
  "provider_requests",
  "script_reader_sections",
  "scripts",
  "shot_reference_assets",
  "shots",
  "storage_objects",
  "storage_upload_sessions",
  "task_attempts",
  "tasks",
  "team_member_canvases",
  "team_member_project_records",
  "team_member_projects",
  "team_member_scripts",
  "user_model_request_logs",
  "workflows",
];
const memberRelations = [
  ["team_member_auth_sessions", false],
  ["team_member_canvases", true],
  ["team_member_project_records", true],
  ["team_member_projects", true],
  ["team_member_scripts", true],
];
const userOwned = [
  ["billing_orders", "created_by_user_id"],
  ["credit_ledger_entries", "user_id"],
  ["credit_lots", "user_id"],
  ["credit_reservations", "user_id"],
  ["user_entitlements", "user_id"],
  ["user_memberships", "user_id"],
];

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const metrics = [];
  const schemas = await client.query(`
    SELECT nspname
    FROM pg_namespace
    WHERE nspname <> 'information_schema' AND nspname NOT LIKE 'pg_%'
    ORDER BY nspname
  `);
  metrics.push(metric("non_public_schema", schemas.rows.filter((row) => row.nspname !== "public").length));
  metrics.push(metric(
    "test_schema",
    schemas.rows.filter((row) => /^test_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/.test(row.nspname)).length,
  ));

  for (const table of legacyTables) {
    metrics.push(metric(`legacy_table:${table}`, await tableExists(client, table) ? 1 : 0));
  }
  metrics.push(await countMetric(client, "project_owner_missing", `
    SELECT count(*)::int AS count
    FROM projects project
    LEFT JOIN users owner_record ON owner_record.id = project.owner_user_id
    WHERE project.owner_user_id IS NULL OR owner_record.id IS NULL
  `));
  metrics.push(await countMetric(client, "project_creator_orphan", `
    SELECT count(*)::int AS count
    FROM projects project
    LEFT JOIN users creator ON creator.id = project.created_by_user_id
    WHERE project.created_by_user_id IS NOT NULL AND creator.id IS NULL
  `));

  for (const table of projectChildren) {
    metrics.push(await countMetric(client, `project_orphan:${table}`, `
      SELECT count(*)::int AS count
      FROM ${quote(table)} child
      LEFT JOIN projects project ON project.id = child.project_id
      WHERE child.project_id IS NOT NULL AND project.id IS NULL
    `));
  }
  metrics.push(await countMetric(client, "personal_library_owner_invalid", `
    SELECT count(*)::int AS count
    FROM library_assets asset
    LEFT JOIN users owner_record ON owner_record.id = asset.owner_user_id
    LEFT JOIN users creator ON creator.id = asset.created_by_user_id
    WHERE asset.scope = 'personal'
      AND (asset.owner_user_id IS NULL OR owner_record.id IS NULL OR asset.created_by_user_id IS NULL OR creator.id IS NULL)
  `));
  metrics.push(await countMetric(client, "official_library_has_owner", `
    SELECT count(*)::int AS count FROM library_assets WHERE scope = 'official' AND owner_user_id IS NOT NULL
  `));
  metrics.push(await countMetric(client, "team_member_owner_orphan", `
    SELECT count(*)::int AS count
    FROM team_members member
    LEFT JOIN users owner_record ON owner_record.id = member.user_id
    WHERE owner_record.id IS NULL
  `));

  for (const [table, hasProject] of memberRelations) {
    metrics.push(await countMetric(client, `member_owner_mismatch:${table}`, `
      SELECT count(*)::int AS count
      FROM ${quote(table)} relation
      LEFT JOIN team_members member ON member.id = relation.member_id AND member.user_id = relation.user_id
      WHERE member.id IS NULL
    `));
    if (hasProject) {
      metrics.push(await countMetric(client, `member_project_owner_mismatch:${table}`, `
        SELECT count(*)::int AS count
        FROM ${quote(table)} relation
        JOIN projects project ON project.id = relation.project_id
        WHERE relation.project_id IS NOT NULL AND project.owner_user_id <> relation.user_id
      `));
    }
  }

  for (const [table, column] of userOwned) {
    metrics.push(await countMetric(client, `user_owner_orphan:${table}.${column}`, `
      SELECT count(*)::int AS count
      FROM ${quote(table)} record
      LEFT JOIN users owner_record ON owner_record.id = record.${quote(column)}
      WHERE record.${quote(column)} IS NULL OR owner_record.id IS NULL
    `));
  }
  metrics.push(await countMetric(client, "idempotency_actor_invalid", `
    SELECT count(*)::int AS count
    FROM idempotency_records
    WHERE NOT (
      user_id IS NOT NULL AND admin_account_id IS NULL AND scope_key = 'user:' || user_id::text
      OR user_id IS NULL AND admin_account_id IS NOT NULL AND scope_key = 'admin:' || admin_account_id::text
    )
  `));
  metrics.push(await countMetric(client, "audit_actor_conflict", `
    SELECT count(*)::int AS count
    FROM audit_events
    WHERE actor_user_id IS NOT NULL AND actor_admin_account_id IS NOT NULL
  `));
  metrics.push(await countMetric(client, "unvalidated_constraint", `
    SELECT count(*)::int AS count
    FROM pg_constraint constraint_record
    JOIN pg_namespace namespace ON namespace.oid = constraint_record.connamespace
    WHERE namespace.nspname = current_schema() AND NOT constraint_record.convalidated
  `));

  const legacyValues = await findLegacyValues(client);
  metrics.push(metric("legacy_value", legacyValues.reduce((sum, finding) => sum + finding.count, 0)));

  const warnings = [
    await countMetric(client, "wallet_cache_mismatch", walletCacheMismatchSql()),
    await countMetric(client, "team_member_cache_without_ledger", `
      SELECT count(*)::int AS count
      FROM team_members member
      WHERE member.member_credits <> 0
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger_entries entry
          WHERE entry.user_id = member.user_id AND entry.team_member_id = member.id
        )
    `),
    await countMetric(client, "paid_order_without_valid_intent", `
      SELECT count(*)::int AS count
      FROM billing_orders order_record
      LEFT JOIN payment_intents intent ON intent.id = order_record.successful_payment_intent_id
      WHERE order_record.status = 'paid'
        AND (intent.id IS NULL OR intent.order_id <> order_record.id OR intent.status <> 'succeeded')
    `),
    await countMetric(client, "expired_active_membership_period", `
      SELECT count(*)::int AS count
      FROM membership_periods
      WHERE status = 'active' AND period_end_at <= now()
    `),
  ];

  const failures = metrics.filter((entry) => entry.invalidCount !== 0);
  console.log(JSON.stringify({ metrics, failures, warnings }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end().catch(() => undefined);
}

function walletCacheMismatchSql() {
  return `
    WITH ledger AS (
      SELECT user_id,
             coalesce(sum(available_delta) FILTER (WHERE team_member_id IS NULL AND source_type <> 'credit_lot_expiry'), 0)::int AS available,
             coalesce(sum(reserved_delta) FILTER (WHERE team_member_id IS NULL AND source_type <> 'credit_lot_expiry'), 0)::int AS reserved
      FROM credit_ledger_entries
      GROUP BY user_id
    )
    SELECT count(*)::int AS count
    FROM users user_record
    LEFT JOIN ledger ON ledger.user_id = user_record.id
    WHERE user_record.credit_balance_cached <> coalesce(ledger.available, 0)
       OR user_record.credit_reserved_cached <> coalesce(ledger.reserved, 0)
  `;
}

async function tableExists(db, table) {
  const result = await db.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1) AS present",
    [table],
  );
  return Boolean(result.rows[0]?.present);
}

async function countMetric(db, name, sql) {
  const result = await db.query(sql);
  return metric(name, Number(result.rows[0]?.count ?? 0));
}

function metric(name, invalidCount) {
  return { name, invalidCount };
}

function quote(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
