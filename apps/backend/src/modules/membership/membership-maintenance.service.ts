import { expireAvailableCreditLotsInTransaction } from "../credit-billing/credit-lot.service.ts";
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
    const expiredLots = await expireAvailableCreditLotsInTransaction(db, {
      now: input.now,
      limit: input.limit,
    });

    await db.query("COMMIT");
    return {
      createdReminderCount,
      deliveredReminderCount,
      expiredMembershipCount,
      expiredCreditAmount: expiredLots.expiredAmount,
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
          JOIN organization_membership_subscriptions subscription
            ON subscription.organization_id = period.organization_id
           AND subscription.current_tier = period.tier
           AND subscription.current_period_end_at = period.period_end_at
          WHERE period.status = 'active'
            AND subscription.status IN ('experience_active', 'professional_active')
            AND subscription.current_period_end_at >= $2::timestamptz
            AND subscription.current_period_end_at < ($2::timestamptz + interval '1 day')
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
        SELECT subscription.organization_id
        FROM organization_membership_subscriptions subscription
        WHERE subscription.status IN ('experience_active', 'professional_active')
          AND subscription.current_period_end_at <= $1
          AND NOT EXISTS (
            SELECT 1
            FROM membership_periods period
            WHERE period.organization_id = subscription.organization_id
              AND period.status = 'active'
              AND period.period_end_at > $1
          )
        ORDER BY subscription.current_period_end_at ASC, subscription.updated_at ASC
        LIMIT $2
      )
      UPDATE organization_membership_subscriptions subscription
      SET status = 'expired',
          current_tier = NULL,
          updated_at = $1
      FROM expired_subscriptions
      WHERE subscription.organization_id = expired_subscriptions.organization_id
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
          AND source = 'payment'
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
