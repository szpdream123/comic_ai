import type { SqlDatabase } from "../shared/db/sql.ts";

const reminderWindows = [
  { key: "membership_expires_in_7d", daysBeforeEnd: 7 },
  { key: "membership_expires_in_3d", daysBeforeEnd: 3 },
  { key: "membership_expires_in_1d", daysBeforeEnd: 1 },
  { key: "membership_expires_today", daysBeforeEnd: 0 },
] as const;

export interface MembershipMaintenanceResult {
  createdReminderCount: number;
  deliveredReminderCount: number;
  expiredMembershipCount: number;
  expiredCreditAmount: number;
}

interface CountRow {
  count: number | string;
}

export async function runMembershipMaintenance(
  db: SqlDatabase,
  input: { now: Date; limit: number },
): Promise<MembershipMaintenanceResult> {
  await db.query("BEGIN");
  try {
    const createdReminderCount = await createDueMembershipReminders(db, input);
    const deliveredReminderCount = await deliverDueMembershipReminders(db, input);
    const expiredMembershipCount = await expireMembershipPeriods(db, input);
    await expireEndedMembershipSubscriptions(db, input);
    await expireMembershipEntitlements(db, input);
    await db.query("COMMIT");
    return {
      createdReminderCount,
      deliveredReminderCount,
      expiredMembershipCount,
      expiredCreditAmount: 0,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function createDueMembershipReminders(
  db: SqlDatabase,
  input: { now: Date; limit: number },
) {
  let createdCount = 0;
  for (const window of reminderWindows) {
    const result = await db.query<CountRow>(
      `
        WITH due_periods AS (
          SELECT period.id, period.organization_id, period.period_end_at
          FROM membership_periods period
          JOIN billing_orders bo
            ON bo.organization_id = period.organization_id
           AND bo.id = period.order_id
          JOIN memberships m
            ON m.user_id = bo.created_by_user_id
           AND m.membership_tier = period.tier
           AND m.expires_at = period.period_end_at
          WHERE period.status = 'active'
            AND m.membership_tier IN ('experience', 'professional')
            AND m.expires_at >= $2::timestamptz
            AND period.period_end_at >= $2::timestamptz
            AND period.period_end_at < ($2::timestamptz + interval '1 day')
          ORDER BY period.period_end_at ASC, period.created_at ASC
          LIMIT $4
        ),
        inserted AS (
          INSERT INTO membership_reminders (
            id,
            organization_id,
            membership_period_id,
            reminder_key,
            remind_at,
            delivered_at,
            read_at,
            created_at
          )
          SELECT
            gen_random_uuid(),
            organization_id,
            id,
            $3,
            $1::timestamptz,
            NULL,
            NULL,
            $1::timestamptz
          FROM due_periods
          ON CONFLICT (organization_id, membership_period_id, reminder_key) DO NOTHING
          RETURNING id
        )
        SELECT count(*)::int AS count FROM inserted
      `,
      [input.now, addDays(input.now, window.daysBeforeEnd), window.key, input.limit],
    );
    createdCount += Number(result.rows[0]?.count ?? 0);
  }
  return createdCount;
}

async function deliverDueMembershipReminders(
  db: SqlDatabase,
  input: { now: Date; limit: number },
) {
  const result = await db.query<CountRow>(
    `
      WITH due_reminders AS (
        SELECT id
        FROM membership_reminders
        WHERE delivered_at IS NULL
          AND remind_at <= $1
        ORDER BY remind_at ASC, created_at ASC
        LIMIT $2
      ),
      updated AS (
        UPDATE membership_reminders reminder
        SET delivered_at = $1
        FROM due_reminders
        WHERE reminder.id = due_reminders.id
        RETURNING reminder.id
      )
      SELECT count(*)::int AS count FROM updated
    `,
    [input.now, input.limit],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function expireMembershipPeriods(
  db: SqlDatabase,
  input: { now: Date; limit: number },
) {
  const result = await db.query<CountRow>(
    `
      WITH expired_periods AS (
        SELECT id
        FROM membership_periods
        WHERE status = 'active'
          AND period_end_at <= $1
        ORDER BY period_end_at ASC, created_at ASC
        LIMIT $2
      ),
      updated AS (
        UPDATE membership_periods period
        SET status = 'expired',
            updated_at = $1
        FROM expired_periods
        WHERE period.id = expired_periods.id
        RETURNING period.id
      )
      SELECT count(*)::int AS count FROM updated
    `,
    [input.now, input.limit],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function expireEndedMembershipSubscriptions(
  db: SqlDatabase,
  input: { now: Date; limit: number },
) {
  await db.query(
    `
      WITH expired_subscriptions AS (
        SELECT m.user_id
        FROM memberships m
        WHERE m.membership_tier IN ('experience', 'professional')
          AND m.expires_at <= $1
        ORDER BY m.expires_at ASC, m.updated_at ASC
        LIMIT $2
      )
      UPDATE memberships m
      SET membership_tier = 'none',
          purchase_at = NULL,
          expires_at = NULL,
          updated_at = $1
      FROM expired_subscriptions
      WHERE m.user_id = expired_subscriptions.user_id
    `,
    [input.now, input.limit],
  );
}

async function expireMembershipEntitlements(
  db: SqlDatabase,
  input: { now: Date; limit: number },
) {
  await db.query(
    `
      WITH expired_entitlements AS (
        SELECT id
        FROM organization_entitlements
        WHERE status = 'active'
          AND source IN ('payment', 'trial')
          AND expires_at IS NOT NULL
          AND expires_at <= $1
        ORDER BY expires_at ASC, created_at ASC
        LIMIT $2
      )
      UPDATE organization_entitlements entitlement
      SET status = 'expired',
          updated_at = $1
      FROM expired_entitlements
      WHERE entitlement.id = expired_entitlements.id
    `,
    [input.now, input.limit],
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
