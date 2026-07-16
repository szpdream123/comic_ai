import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { restoreUserWalletCreditsInTransaction } from "../credit-billing/credit-lot.service.ts";
import {
  grantCredits,
  grantCreditsInTransaction,
  reserveCredits,
  settleReservationAllocation,
} from "../credit-billing/credit-ledger.service.ts";
import { maskCnPhone, normalizeCnPhone } from "../identity/phone-auth.utils.ts";
import { calculateMembershipWindow } from "../membership/membership-period.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const TEAM_SUBACCOUNT_LIMIT_CONFIG_KEY = "team.default_subaccount_limit";
const DEFAULT_TEAM_SUBACCOUNT_LIMIT = 50;

export interface AdminUserListItem {
  userId: string;
  inviteCode: string | null;
  displayName: string;
  phone: string | null;
  email: string | null;
  lastLoginAt: string | null;
  status: string;
  accountName: string | null;
  membershipId: string | null;
  membershipRole: string | null;
  membershipTier: string | null;
  membershipExpiresAt: string | null;
  accountType: "owner_account" | "team_permission_account" | "subaccount" | "user";
  teamRole: string | null;
  teamGroupId: string | null;
  teamGroupName: string | null;
  availableCredits: number;
  reservedCredits: number;
  frozenCredits: number;
  displayCreditBalance: number;
  usedCredits: number;
  subaccountCount: number;
  loginName?: string | null;
  memberAccount?: string | null;
  memberLoginAccount?: string | null;
  memberCredits?: number;
  creditBalance?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AdminTeamPlanLimitSummary {
  userName: string;
  defaultSeatLimit: number;
  effectiveSeatLimit: number;
  overrideSeatLimit: number | null;
  limitSource: "default" | "override";
  usedSeats: number;
  remainingSeats: number;
}

export interface AdminUserModelRequestLogItem {
  id: string;
  providerRequestId: string;
  modelType: "text" | "image" | "video";
  modelName: string;
  creditsCost: number;
  providerName: string;
  providerOperation: string;
  modelId: string;
  providerModel: string;
  requestKey: string;
  requestHash: string;
  payloadHash: string;
  payloadSummary: string | null;
  requestFormat: string | null;
  requestBody: Record<string, unknown>;
  businessRequestBody: Record<string, unknown>;
  providerRequestBody: Record<string, unknown> | null;
  providerRequestUrl: string | null;
  providerResponseBody: unknown;
  providerRequestStatus: string | null;
  providerFailureCode: string | null;
  externalSubmissionStartedAt: string | null;
  externalRequestId: string | null;
  taskStatus: string | null;
  taskFailureCode: string | null;
  requestText: string | null;
  responseText: string | null;
  responseUsage: Record<string, unknown> | null;
  responseFinishReasons: string[];
  status: string;
  failureCode: string | null;
  projectId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

interface AdminUserRow {
  user_id: string;
  invite_code: string | null;
  display_name: string | null;
  phone_e164: string | null;
  email: string | null;
  last_login_at: Date | string | null;
  user_status: string;
  membership_id: string | null;
  membership_role: string | null;
  membership_tier: string | null;
  membership_expires_at: Date | string | null;
  team_role: string | null;
  team_group_id: string | null;
  team_group_name: string | null;
  user_credit_balance: number | string | null;
  user_reserved_balance: number | string | null;
  user_frozen_balance: number | string | null;
  member_credit_balance: number | string | null;
  member_credit_used: number | string | null;
  active_reserved_credits: number | string | null;
  subaccount_count: number | string | null;
  member_account?: string | null;
  member_login_account?: string | null;
  member_created_at?: Date | string | null;
  member_updated_at?: Date | string | null;
}

interface AdminUserModelRequestLogRow {
  id: string;
  provider_request_id: string;
  media_type: string | null;
  display_name: string | null;
  credits_cost: number | string | null;
  provider_name: string;
  provider_operation: string;
  model_id: string;
  provider_model: string;
  request_key: string;
  request_hash: string;
  payload_hash: string;
  payload_summary: string | null;
  request_format: string | null;
  request_body_json: Record<string, unknown> | null;
  business_request_body_json: Record<string, unknown> | null;
  provider_request_body_json: Record<string, unknown> | null;
  provider_request_url_config_json: Record<string, unknown> | null;
  provider_response_redacted_json: Record<string, unknown> | null;
  provider_request_status: string | null;
  provider_failure_code: string | null;
  external_submission_started_at: Date | string | null;
  external_request_id: string | null;
  task_status: string | null;
  task_failure_code: string | null;
  request_text: string | null;
  response_text: string | null;
  response_usage_json: Record<string, unknown> | null;
  response_finish_reasons_json: unknown;
  status: string;
  failure_code: string | null;
  project_id: string | null;
  started_at: Date | string;
  completed_at: Date | string | null;
  created_at: Date | string;
}

export function createAdminUserService(deps: { db: SqlDatabase }) {
  async function listUsers(input: {
    keyword?: string | null;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
    const offset = (page - 1) * pageSize;
    const params: unknown[] = [];
    const keyword = input.keyword?.trim();
    const whereSql = keyword
      ? (() => {
          params.push(`%${keyword}%`);
          return `WHERE (
            user_account.id::text ILIKE $1
            OR COALESCE(user_account.display_name, '') ILIKE $1
            OR COALESCE(user_account.phone_e164, '') ILIKE $1
            OR COALESCE(user_account.email, '') ILIKE $1
          )`;
        })()
      : "";
    const total = await deps.db.query<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM users user_account ${whereSql}`,
      params,
    );
    const result = await deps.db.query<AdminUserRow>(
      `SELECT
         user_account.id AS user_id,
         user_account.invite_code,
         user_account.display_name,
         user_account.phone_e164,
         user_account.email,
         user_account.last_login_at,
         user_account.status AS user_status,
         user_account.id AS membership_id,
         'owner'::text AS membership_role,
         membership.membership_tier,
         membership.expires_at AS membership_expires_at,
         NULL::text AS team_role,
         NULL::uuid AS team_group_id,
         NULL::text AS team_group_name,
         user_account.credit_balance_cached AS user_credit_balance,
         user_account.credit_reserved_cached AS user_reserved_balance,
         user_account.credit_frozen_cached AS user_frozen_balance,
         NULL::integer AS member_credit_balance,
         NULL::integer AS member_credit_used,
         COALESCE((
           SELECT SUM(reservation.amount_reserved)
           FROM credit_reservations reservation
           WHERE reservation.user_id = user_account.id
             AND reservation.status = 'active'
         ), 0) AS active_reserved_credits,
         COALESCE((
           SELECT COUNT(*) FROM team_members member
           WHERE member.user_id = user_account.id AND member.status = 'active'
         ), 0) AS subaccount_count
       FROM users user_account
       LEFT JOIN user_memberships membership ON membership.user_id = user_account.id
       ${whereSql}
       ORDER BY user_account.created_at DESC, user_account.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    return {
      data: result.rows.map(userFromRow),
      meta: { page, pageSize, total: Number(total.rows[0]?.count ?? 0) },
    };
  }

  async function listSubaccounts(input: { userId: string }) {
    const rows = await listAdminTeamMembers(deps.db, { ownerUserId: input.userId });
    return { data: rows.map(userFromRow), meta: { total: rows.length } };
  }

  async function listTeamPermissionAccounts(input: {
    keyword?: string | null;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
    const allRows = await listAdminTeamMembers(deps.db, {
      keyword: input.keyword?.trim() || null,
    });
    const offset = (page - 1) * pageSize;
    return {
      data: allRows.slice(offset, offset + pageSize).map(userFromRow),
      meta: { page, pageSize, total: allRows.length },
    };
  }

  async function grantUserCredits(input: {
    userId: string;
    amount: number;
    reason: string;
    workOrderNo?: string;
    adjustmentScenario?: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return {
        status: 400,
        body: { error: { code: "invalid_credit_amount", message: "积分数量必须是正整数" } },
      };
    }

    const reason = input.reason.trim();
    if (!reason) {
      return {
        status: 400,
        body: { error: { code: "reason_required", message: "请填写操作原因" } },
      };
    }
    const rawWorkOrderNo = String(input.workOrderNo ?? "").trim();
    const workOrderNo = rawWorkOrderNo ? normalizeWorkOrderNo(rawWorkOrderNo) : undefined;
    if (rawWorkOrderNo && !workOrderNo) {
      return {
        status: 400,
        body: { error: { code: "invalid_work_order_no", message: "请填写有效工单号，例如 CS-20260605-001" } },
      };
    }

    let target = await findUserCreditTarget(deps.db, { userId: input.userId });
    if (!target) {
      return {
        status: 404,
        body: { error: { code: "admin_user_not_found", message: "用户不存在" } },
      };
    }
    if (!isWritableCreditTarget(target)) {
      return error(409, "credit_account_not_found", "该用户没有可用的积分账户");
    }

    if (!isActiveUserStatus(target.status)) {
      return inactiveUserOperationError(target.status);
    }
    const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
    const existingLedger = await queryOne<{ id: string }>(
      deps.db,
      `
        SELECT id
        FROM credit_ledger_entries
        WHERE user_id = $1
          AND source_type = 'admin_manual_grant'
          AND source_id = $2
          AND entry_type = 'grant'
          AND team_member_id IS NOT DISTINCT FROM $3::uuid
        LIMIT 1
      `,
      [target.userId, sourceId, target.teamProfileId],
    );

    const ledger = existingLedger ?? (target.teamProfileId
      ? await grantTeamMemberCredits(deps.db, {
          ownerUserId: target.userId,
          teamMemberId: target.teamProfileId,
          amount,
          sourceId,
          reason,
          metadata: {
            targetUserId: input.userId,
            targetMembershipId: target.membershipId,
            actorAdminAccountId: input.actorAdminAccountId,
            workOrderNo,
            adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
          },
          now: input.now,
        })
      : await grantCredits(deps.db, {
          userId: target.userId,
          amount,
          sourceType: "admin_manual_grant",
          sourceId,
          reason,
          metadata: {
            targetUserId: input.userId,
            targetMembershipId: target.membershipId,
            actorAdminAccountId: input.actorAdminAccountId,
            workOrderNo,
            adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
          },
          createdByUserId: null,
          now: input.now,
        }));

    if (!existingLedger) {
      await appendAuditEvent(deps.db, {
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
        eventType: "admin.credit.granted",
        targetType: "user",
        targetId: input.userId,
        reason,
        sensitive: true,
        metadata: {
          amount,
          ledgerEntryId: ledger.id,
          workOrderNo,
          adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
          targetUserId: target.userId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
        },
      });
    }

    const wallet = await queryOne<{
      credit_balance_cached: number | string;
      credit_reserved_cached: number | string;
      credit_frozen_cached: number | string;
    }>(
      deps.db,
      `
        SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached
        FROM users
        WHERE id = $1
      `,
      [input.userId],
    );

    return {
      status: 200,
      body: {
        data: {
          ledgerEntryId: ledger.id,
          amount,
          availableCredits: Number(wallet?.credit_balance_cached ?? 0),
          reservedCredits: Number(wallet?.credit_reserved_cached ?? 0),
          frozenCredits: Number(wallet?.credit_frozen_cached ?? 0),
        },
      },
    };
  }

  async function grantUserMembership(input: {
    userId: string;
    membershipPlanId: string;
    reason: string;
    workOrderNo?: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const membershipPlanId = String(input.membershipPlanId ?? "").trim();
    if (!membershipPlanId) {
      return error(400, "membership_plan_required", "请选择要赠送的会员套餐");
    }
    const reason = "会员赠送";
    const rawWorkOrderNo = String(input.workOrderNo ?? "").trim();
    const workOrderNo = rawWorkOrderNo ? normalizeWorkOrderNo(rawWorkOrderNo) : undefined;
    if (rawWorkOrderNo && !workOrderNo) {
      return error(400, "invalid_work_order_no", "请填写有效工单号，例如 CS-20260605-001");
    }

    let target = await findUserCreditTarget(deps.db, { userId: input.userId });
    if (!target) return error(404, "admin_user_not_found", "用户不存在");
    if (!isPersonalCreditOwnerTarget(target)) {
      return error(409, "personal_user_required", "仅支持给个人用户赠送会员");
    }
    if (!isActiveUserStatus(target.status)) return inactiveUserOperationError(target.status);

    const plan = await findGrantableMembershipPlan(deps.db, {
      membershipPlanId,
      now: input.now,
    });
    if (!plan) {
      return error(404, "membership_plan_not_available", "会员套餐不存在或未启用");
    }

    const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
    const orderId = uuidFromIdempotencyKey(`${input.idempotencyKey}:membership-order`);
    const periodId = uuidFromIdempotencyKey(`${input.idempotencyKey}:membership-period`);
    const planSnapshot = membershipPlanSnapshotFromRow(plan);
    let giftLedgerEntryId: string | null = null;
    let periodStartAt = input.now;
    let periodEndAt = input.now;

    await deps.db.query("BEGIN");
    try {
      const existingOrder = await queryOne<AdminMembershipGrantOrderRow>(
        deps.db,
        `
          SELECT id, membership_plan_id, credit_grant_ledger_entry_id
          FROM billing_orders
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [orderId],
      );
      if (existingOrder?.membership_plan_id && existingOrder.membership_plan_id !== plan.id) {
        await deps.db.query("ROLLBACK");
        return error(409, "idempotency_key_conflict", "同一个幂等键不能用于不同会员套餐");
      }
      const currentSameTier = await queryOne<{ expires_at: Date | string | null }>(
        deps.db,
        `
          SELECT expires_at
          FROM user_memberships
          WHERE user_id = $1
            AND membership_tier = $2
          ORDER BY expires_at DESC NULLS LAST, updated_at DESC
          LIMIT 1
        `,
        [input.userId, plan.tier],
      );
      const currentActiveMembership = await findAdminActiveMembership(deps.db, {
        userId: input.userId,
        now: input.now,
      });
      const currentPeriodEndAt = currentSameTier?.expires_at
        ? new Date(currentSameTier.expires_at)
        : null;
      const window = calculateMembershipWindow({
        paidAt: input.now,
        currentPeriodEndAt,
        periodUnit: plan.period_unit,
        periodCount: Number(plan.period_count),
      });
      periodStartAt = window.periodStartAt;
      periodEndAt = window.periodEndAt;
      const higherMembershipToKeep = currentActiveMembership
        && membershipTierRank(currentActiveMembership.membership_tier) > membershipTierRank(plan.tier)
        ? currentActiveMembership
        : null;
      const membershipTierToApply = higherMembershipToKeep
        ? higherMembershipToKeep.membership_tier
        : plan.tier;
      const membershipPurchaseAtToApply = higherMembershipToKeep
        ? higherMembershipToKeep.purchase_at
        : periodStartAt;
      const membershipExpiresAtToApply = higherMembershipToKeep
        ? higherMembershipToKeep.expires_at
        : periodEndAt;
      const membershipGiftCreditsToApply = higherMembershipToKeep
        ? Number(higherMembershipToKeep.gift_credits ?? 0)
        : Number(plan.gift_credits);

      if (!existingOrder) {
        await deps.db.query(
          `
            INSERT INTO billing_orders (
              id,
              created_by_user_id,
              order_no,
              product_type,
              credit_package_id,
              membership_plan_id,
              package_snapshot_json,
              product_snapshot_json,
              credits,
              amount_minor,
              currency,
              status,
              idempotency_key,
              expires_at,
              paid_at,
              successful_payment_intent_id,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2,
              $3,
              'membership_plan',
              NULL,
              $4,
              $5::jsonb,
              $5::jsonb,
              $6,
              $7,
              $8,
              'closed',
              $9,
              $10,
              NULL,
              NULL,
              $10,
              $10
            )
          `,
          [
            orderId,
            input.userId,
            createAdminMembershipGiftOrderNo(input.now, sourceId),
            plan.id,
            JSON.stringify({
              ...planSnapshot,
              adminGift: {
                actorAdminAccountId: input.actorAdminAccountId,
                reason,
                workOrderNo,
              },
            }),
            Number(plan.gift_credits),
            Number(plan.amount_minor),
            plan.currency,
            input.idempotencyKey,
            input.now,
          ],
        );
      }

      const insertedPeriod = await queryOne<{ id: string }>(
        deps.db,
        `
          INSERT INTO membership_periods (
            id,
            user_id,
            order_id,
            plan_id,
            tier,
            period_start_at,
            period_end_at,
            gift_credits,
            plan_snapshot_json,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'active', $10, $10)
          ON CONFLICT (user_id, order_id) DO NOTHING
          RETURNING id
        `,
        [
          periodId,
          input.userId,
          orderId,
          plan.id,
          plan.tier,
          periodStartAt,
          periodEndAt,
          Number(plan.gift_credits),
          JSON.stringify(planSnapshot),
          input.now,
        ],
      );

      if (insertedPeriod) {
        await deps.db.query(
          `
            INSERT INTO user_memberships (
              id, user_id, membership_tier, purchase_at, expires_at,
              gift_credits, status, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7)
            ON CONFLICT (user_id) DO UPDATE SET
              membership_tier = EXCLUDED.membership_tier,
              purchase_at = EXCLUDED.purchase_at,
              expires_at = EXCLUDED.expires_at,
              gift_credits = EXCLUDED.gift_credits,
              status = 'active',
              updated_at = EXCLUDED.updated_at
          `,
            [
              randomUUID(),
              input.userId,
              membershipTierToApply,
              membershipPurchaseAtToApply,
              membershipExpiresAtToApply,
              membershipGiftCreditsToApply,
              input.now,
            ],
          );
        if (!higherMembershipToKeep) {
          await updateAdminGiftTeamSeatLimit(deps.db, {
            userId: input.userId,
            seatLimit: planSnapshot.seatLimit,
            now: input.now,
          });
        }
        for (const entitlementKey of planSnapshot.entitlements) {
          await deps.db.query(
            `
              INSERT INTO user_entitlements (
                id, user_id, entitlement_key, status, source, expires_at, created_at, updated_at
              )
              VALUES ($1, $2, $3, 'active', 'manual', $4, $5, $5)
              ON CONFLICT (user_id, entitlement_key) DO UPDATE SET
                status = 'active',
                source = 'manual',
                expires_at = EXCLUDED.expires_at,
                updated_at = EXCLUDED.updated_at
            `,
            [randomUUID(), input.userId, entitlementKey, periodEndAt, input.now],
          );
        }
        if (Number(plan.gift_credits) > 0) {
          const grant = await grantCreditsInTransaction(deps.db, {
            userId: input.userId,
            amount: Number(plan.gift_credits),
            sourceType: "membership_gift",
            sourceId: periodId,
            reason,
            metadata: {
              orderId,
              planId: plan.id,
              planCode: plan.code,
              tier: plan.tier,
              adminGift: true,
              actorAdminAccountId: input.actorAdminAccountId,
              workOrderNo,
            },
            lot: {
              sourceType: "membership_gift",
              sourceId: periodId,
              expiresAt: periodEndAt,
              metadata: {
                tier: plan.tier,
                orderId,
                planId: plan.id,
                adminGift: true,
              },
            },
            createdByUserId: input.userId,
            now: input.now,
          });
          giftLedgerEntryId = grant.id;
          await deps.db.query(
            `
              UPDATE billing_orders
              SET credit_grant_ledger_entry_id = $2,
                  updated_at = $3
              WHERE id = $1
                AND credit_grant_ledger_entry_id IS NULL
            `,
            [orderId, grant.id, input.now],
          );
        }
        await appendAuditEvent(deps.db, {
          actorUserId: null,
          actorAdminAccountId: input.actorAdminAccountId,
          eventType: "admin.membership.granted",
          targetType: "user",
          targetId: input.userId,
          reason,
          sensitive: true,
          metadata: {
            membershipPlanId: plan.id,
            planCode: plan.code,
            tier: plan.tier,
            periodId,
            orderId,
            giftCredits: Number(plan.gift_credits),
            giftLedgerEntryId,
            workOrderNo,
            targetUserId: target.userId,
            targetMembershipId: target.membershipId,
            actorAdminAccountId: input.actorAdminAccountId,
          },
        });
      } else {
        giftLedgerEntryId = existingOrder?.credit_grant_ledger_entry_id ?? null;
        const existingPeriod = await queryOne<{
          period_start_at: Date | string;
          period_end_at: Date | string;
        }>(
          deps.db,
          `
            SELECT period_start_at, period_end_at
            FROM membership_periods
            WHERE order_id = $1
            LIMIT 1
          `,
          [orderId],
        );
        if (existingPeriod) {
          periodStartAt = new Date(existingPeriod.period_start_at);
          periodEndAt = new Date(existingPeriod.period_end_at);
        }
      }

      await deps.db.query("COMMIT");
    } catch (grantError) {
      await deps.db.query("ROLLBACK").catch(() => undefined);
      throw grantError;
    }

    const wallet = await queryOne<{
      credit_balance_cached: number | string;
      credit_reserved_cached: number | string;
      credit_frozen_cached: number | string;
    }>(
      deps.db,
      "SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached FROM users WHERE id = $1",
      [input.userId],
    );

    return {
      status: 200,
      body: {
        data: {
          orderId,
          membershipPeriodId: periodId,
          membershipPlanId: plan.id,
          planName: plan.display_name,
          tier: plan.tier,
          periodStartAt: periodStartAt.toISOString(),
          periodEndAt: periodEndAt.toISOString(),
          giftCredits: Number(plan.gift_credits),
          giftLedgerEntryId,
          availableCredits: Number(wallet?.credit_balance_cached ?? 0),
          reservedCredits: Number(wallet?.credit_reserved_cached ?? 0),
          frozenCredits: Number(wallet?.credit_frozen_cached ?? 0),
        },
      },
    };
  }

  async function updateUserProfile(input: {
    userId: string;
    displayName?: string;
    email?: string | null;
    reason: string;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const existing = await queryOne<{ id: string; display_name: string | null; email: string | null; status: string }>(
      deps.db,
      "SELECT id, display_name, email, status FROM users WHERE id = $1",
      [input.userId],
    );
    if (!existing) return error(404, "admin_user_not_found", "用户不存在");
    if (!isActiveUserStatus(existing.status)) return inactiveUserOperationError(existing.status);
    const displayName = input.displayName?.trim() || existing.display_name || null;
    const email = input.email === undefined ? existing.email : input.email?.trim() || null;
    const row = await queryOne<{ id: string; display_name: string | null; email: string | null; status: string }>(
      deps.db,
      `
        UPDATE users
        SET display_name = $2,
            email = $3,
            updated_at = $4
        WHERE id = $1
        RETURNING id, display_name, email, status
      `,
      [input.userId, displayName, email, input.now],
    );
    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType: "admin.user.profile_updated",
      targetType: "user",
      targetId: input.userId,
      reason,
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        before: { displayName: existing.display_name, email: maskEmail(existing.email) },
        after: { displayName, email: maskEmail(email) },
      },
    });
    return {
      status: 200,
      body: {
        data: {
          userId: row!.id,
          displayName: row!.display_name ?? "未命名用户",
          email: maskEmail(row!.email),
          status: row!.status,
        },
      },
    };
  }

  async function revealUserContact(input: {
    userId: string;
    reason: string;
    actorAdminAccountId: string;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "璇峰～鍐欐搷浣滃師鍥?");
    const user = await queryOne<{
      id: string;
      phone_e164: string | null;
      email: string | null;
      status: string;
    }>(
      deps.db,
      "SELECT id, phone_e164, email, status FROM users WHERE id = $1",
      [input.userId],
    );
    if (user && !isActiveUserStatus(user.status)) return inactiveUserOperationError(user.status);
    if (!user) return error(404, "admin_user_not_found", "鐢ㄦ埛涓嶅瓨鍦?");

    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType: "admin.user.contact_revealed",
      targetType: "user",
      targetId: input.userId,
      reason,
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        maskedContact: {
          phone: user.phone_e164 ? maskCnPhone(user.phone_e164) : null,
          email: maskEmail(user.email),
        },
      },
    });

    return {
      status: 200,
      body: {
        data: {
          userId: user.id,
          contact: {
            phone: user.phone_e164 ? normalizeCnPhone(user.phone_e164) : null,
            email: user.email,
          },
        },
      },
    };
  }

  async function updateUserStatus(input: {
    userId: string;
    status: string;
    reason: string;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    if (!["active", "disabled", "archived"].includes(input.status)) {
      return error(400, "invalid_user_status", "用户状态不支持");
    }
    const existing = await queryOne<{ id: string; status: string }>(
      deps.db,
      "SELECT id, status FROM users WHERE id = $1",
      [input.userId],
    );
    if (!existing) return error(404, "admin_user_not_found", "用户不存在");
    if (!canTransitionUserStatus(existing.status, input.status)) return inactiveUserOperationError(existing.status);
    const row = await queryOne<{ id: string; status: string }>(
      deps.db,
      "UPDATE users SET status = $2, updated_at = $3 WHERE id = $1 RETURNING id, status",
      [input.userId, input.status, input.now],
    );
    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType: "admin.user.status_changed",
      targetType: "user",
      targetId: input.userId,
      reason,
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        before: { status: existing.status },
        after: { status: input.status },
      },
    });
    return { status: 200, body: { data: { userId: row!.id, status: row!.status } } };
  }

  async function deductUserCredits(input: {
    userId: string;
    amount: number;
    reason: string;
    workOrderNo?: string;
    adjustmentScenario?: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return error(400, "invalid_credit_amount", "积分数量必须是正整数");
    }
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const rawWorkOrderNo = String(input.workOrderNo ?? "").trim();
    const workOrderNo = rawWorkOrderNo ? normalizeWorkOrderNo(rawWorkOrderNo) : undefined;
    if (rawWorkOrderNo && !workOrderNo) return error(400, "invalid_work_order_no", "请填写有效工单号，例如 CS-20260605-001");
    let target = await findUserCreditTarget(deps.db, { userId: input.userId });
    if (!target) return error(404, "admin_user_not_found", "用户不存在");
    if (!isWritableCreditTarget(target)) return error(409, "credit_account_not_found", "该用户没有可用的积分账户");
    const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
    if (!isActiveUserStatus(target.status)) return inactiveUserOperationError(target.status);
    const existingLedger = await queryOne<LedgerRow>(
      deps.db,
      `
        SELECT *
        FROM credit_ledger_entries
        WHERE user_id = $1
          AND source_type = 'admin_manual_deduct'
          AND source_id = $2
          AND entry_type = 'reservation'
        LIMIT 1
      `,
      [target.userId, sourceId],
    );

    let ledger = existingLedger;
    if (!existingLedger) {
      const reservation = await reserveCredits(deps.db, {
        userId: input.userId,
        amount,
        sourceType: "admin_manual_deduct",
        sourceId,
        reason,
        metadata: {
          targetUserId: input.userId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
          workOrderNo,
          adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
        },
        createdByUserId: null,
        now: input.now,
      });
      const settlement = await settleReservationAllocation(deps.db, {
        reservationId: reservation.reservation.id,
        allocationKey: "admin_manual_deduct",
        amount,
        outcome: "consumed",
        metadata: {
          targetUserId: input.userId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
          workOrderNo,
          adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
        },
        now: input.now,
      });
      ledger = await queryOne<LedgerRow>(
        deps.db,
        "SELECT * FROM credit_ledger_entries WHERE id = $1",
        [reservation.ledgerEntry.id],
      );
      await appendAuditEvent(deps.db, {
        actorUserId: null,
        actorAdminAccountId: input.actorAdminAccountId,
        eventType: "admin.credit.deducted",
        targetType: "user",
        targetId: input.userId,
        reason,
        sensitive: true,
        metadata: {
          amount,
          ledgerEntryId: settlement.ledgerEntry?.id ?? ledger!.id,
          workOrderNo,
          adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
          targetUserId: target.userId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
        },
      });
    }

    const wallet = await queryOne<{ credit_balance_cached: number | string; credit_reserved_cached: number | string; credit_frozen_cached: number | string }>(
      deps.db,
      "SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached FROM users WHERE id = $1",
      [input.userId],
    );
    return {
      status: 200,
      body: {
        data: {
          ledgerEntryId: ledger!.id,
          amount,
          availableCredits: Number(wallet?.credit_balance_cached ?? 0),
          reservedCredits: Number(wallet?.credit_reserved_cached ?? 0),
          frozenCredits: Number(wallet?.credit_frozen_cached ?? 0),
        },
      },
    };
  }

  async function restoreFrozenUserCredits(input: {
    userId: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    let target = await findUserCreditTarget(deps.db, {
      userId: input.userId,
    });
    if (!target) return error(404, "admin_user_not_found", "用户不存在");
    if (!isWritableCreditTarget(target)) return error(409, "credit_account_not_found", "该用户没有可用的积分账户");
    if (!isActiveUserStatus(target.status)) return inactiveUserOperationError(target.status);

    const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
    const existingLedger = await queryOne<LedgerRow>(
      deps.db,
      `
        SELECT *
        FROM credit_ledger_entries
        WHERE user_id = $1
          AND source_type = 'admin_frozen_credit_restore'
          AND source_id = $2
          AND entry_type = 'restore'
        LIMIT 1
      `,
      [target.userId, sourceId],
    );

    let restoredAmount = Number(existingLedger?.amount ?? 0);
    if (!existingLedger) {
      await deps.db.query("BEGIN");
      try {
        const wallet = await queryOne<{
          credit_balance_cached: number | string;
          credit_reserved_cached: number | string;
          credit_frozen_cached: number | string;
        }>(
          deps.db,
          `
            SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached
            FROM users
            WHERE id = $1
            FOR UPDATE
          `,
          [input.userId],
        );
        const frozenAmount = Number(wallet?.credit_frozen_cached ?? 0);
        if (!wallet || frozenAmount <= 0) {
          const replayedLedger = await queryOne<LedgerRow>(
            deps.db,
            `
              SELECT *
              FROM credit_ledger_entries
              WHERE user_id = $1
                AND source_type = 'admin_frozen_credit_restore'
                AND source_id = $2
                AND entry_type = 'restore'
              LIMIT 1
            `,
            [target.userId, sourceId],
          );
          if (replayedLedger) {
            restoredAmount = Number(replayedLedger.amount ?? 0);
            await deps.db.query("ROLLBACK");
            return {
              status: 200,
              body: {
                data: {
                  restoredAmount,
                  availableCredits: Number(wallet?.credit_balance_cached ?? 0),
                  reservedCredits: Number(wallet?.credit_reserved_cached ?? 0),
                  frozenCredits: Number(wallet?.credit_frozen_cached ?? 0),
                },
              },
            };
          }
          await deps.db.query("ROLLBACK");
          return error(409, "no_frozen_credits", "该用户当前没有可解冻积分");
        }

        const restoreResult = await restoreUserWalletCreditsInTransaction(deps.db, {
          userId: input.userId,
          sourceType: "admin_frozen_credit_restore",
          sourceId,
          reason,
          metadata: {
            adminForced: true,
            targetUserId: input.userId,
            targetMembershipId: target.membershipId,
            actorAdminAccountId: input.actorAdminAccountId,
          },
          now: input.now,
        });
        restoredAmount = restoreResult.restoredAmount;
        if (restoredAmount <= 0) {
          await deps.db.query("ROLLBACK");
          return error(409, "frozen_credits_not_restorable", "冻结积分已超过保留期，无法解冻");
        }

        await appendAuditEvent(deps.db, {
          actorUserId: null,
          actorAdminAccountId: input.actorAdminAccountId,
          eventType: "admin.credit.frozen_restored",
          targetType: "user",
          targetId: input.userId,
          reason,
          sensitive: true,
          metadata: {
            restoredAmount,
            targetUserId: target.userId,
            targetMembershipId: target.membershipId,
            actorAdminAccountId: input.actorAdminAccountId,
          },
        });

        await deps.db.query("COMMIT");
      } catch (error_) {
        await deps.db.query("ROLLBACK");
        throw error_;
      }
    }

    const wallet = await queryOne<{
      credit_balance_cached: number | string;
      credit_reserved_cached: number | string;
      credit_frozen_cached: number | string;
    }>(
      deps.db,
      `
        SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached
        FROM users
        WHERE id = $1
      `,
      [input.userId],
    );
    return {
      status: 200,
      body: {
        data: {
          restoredAmount,
          availableCredits: Number(wallet?.credit_balance_cached ?? 0),
          reservedCredits: Number(wallet?.credit_reserved_cached ?? 0),
          frozenCredits: Number(wallet?.credit_frozen_cached ?? 0),
        },
      },
    };
  }

  type UserCreditLedgerPageInput = {
    userId: string;
    page?: number;
    pageSize?: number;
  };

  async function listUserCreditLedger(input: UserCreditLedgerPageInput) {
    return listUserCreditLedgerPage(input, { excludeInternalAllocationEntries: false });
  }

  async function listCreatorUserCreditLedger(input: UserCreditLedgerPageInput) {
    return listUserCreditLedgerPage(input, { excludeInternalAllocationEntries: true });
  }

  async function listUserCreditLedgerPage(
    input: UserCreditLedgerPageInput,
    options: { excludeInternalAllocationEntries: boolean },
  ) {
    const target = await findUserCreditTarget(deps.db, { userId: input.userId });
    if (!target) return error(404, "admin_user_not_found", "用户不存在");
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
    const page = Math.max(1, Number(input.page ?? 1));
    const ledgerScope = ledgerScopeForTarget(target);
    const offset = (page - 1) * pageSize;
    const internalEntryFilter = options.excludeInternalAllocationEntries
      ? `AND NOT (
          ledger.source_type = 'credit_reservation_allocation'
          AND ledger.entry_type <> 'release'
        )`
      : "";
    const coalescedLedgerSql = `
      WITH scoped_ledger AS (
        SELECT
          credit_ledger_entries.*,
          CASE
            WHEN reservation_id IS NOT NULL THEN 'reservation:' || reservation_id::text
            WHEN COALESCE(metadata_json->>'taskId', metadata_json->>'task_id', '') <> ''
              THEN 'task:' || COALESCE(metadata_json->>'taskId', metadata_json->>'task_id')
            ELSE NULL
          END AS deduction_key
        FROM credit_ledger_entries
        WHERE ${ledgerScope.sql}
      ),
      reservation_keys AS (
        SELECT DISTINCT deduction_key
        FROM scoped_ledger
        WHERE entry_type = 'reservation'
          AND deduction_key IS NOT NULL
      ),
      coalesced_ledger AS (
        SELECT ledger.*
        FROM scoped_ledger ledger
        LEFT JOIN reservation_keys reservation
          ON reservation.deduction_key = ledger.deduction_key
        WHERE NOT (
          ledger.entry_type = 'consume'
          AND reservation.deduction_key IS NOT NULL
        )
        ${internalEntryFilter}
      )
    `;
    const result = await deps.db.query<LedgerRow & { total_count: number | string }>(
      `${coalescedLedgerSql}
        SELECT ledger.*, COUNT(*) OVER() AS total_count
        FROM coalesced_ledger ledger
        ORDER BY ledger.created_at DESC, ledger.id ASC
        LIMIT $${ledgerScope.limitParamIndex}
        OFFSET $${ledgerScope.limitParamIndex + 1}
      `,
      [...ledgerScope.params, pageSize, offset],
    );
    let total = Number(result.rows[0]?.total_count ?? 0);
    if (result.rows.length === 0 && page > 1) {
      const totalResult = await deps.db.query<{ count: number | string }>(
        `${coalescedLedgerSql}
         SELECT COUNT(*)::int AS count
         FROM coalesced_ledger`,
        ledgerScope.params,
      );
      total = Number(totalResult.rows[0]?.count ?? 0);
    }
    const summary = options.excludeInternalAllocationEntries
      ? await buildCreatorCreditBalanceSummary(deps.db, target)
      : await buildUserCreditSummary(deps.db, target, ledgerScope);
    return {
      data: result.rows.map(ledgerFromRow),
      accountType: resolveCreditAccountType(target),
      summary,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async function listUserModelRequestLogs(input: {
    userId: string;
    page?: number;
    pageSize?: number;
    modelType?: "text" | "image" | "video" | "all";
  }) {
    const user = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM users WHERE id = $1",
      [input.userId],
    );
    if (!user) return error(404, "admin_user_not_found", "用户不存在");

    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 15)));
    const offset = (page - 1) * pageSize;
    const modelType = normalizeAdminModelTypeFilter(input.modelType);
    const inferredMediaTypeSql = `CASE
      WHEN lower(concat_ws(' ', logs.provider_operation, logs.model_id, logs.provider_model)) LIKE '%video%' THEN 'video'
      WHEN lower(concat_ws(' ', logs.provider_operation, logs.model_id, logs.provider_model)) LIKE '%image%'
        OR lower(concat_ws(' ', logs.provider_operation, logs.model_id, logs.provider_model)) LIKE '%img%'
        OR lower(concat_ws(' ', logs.provider_operation, logs.model_id, logs.provider_model)) LIKE '%gpt-image%' THEN 'image'
      ELSE 'text'
    END`;
    const filterParams: unknown[] = [input.userId];
    const filters = ["logs.user_id = $1"];
    if (modelType !== "all") {
      filterParams.push(modelType);
      filters.push(`COALESCE(model.media_type, ${inferredMediaTypeSql}) = $${filterParams.length}`);
    }
    const whereSql = filters.join(" AND ");
    const totalResult = await deps.db.query<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM user_model_request_logs logs
        LEFT JOIN ai_model_configs model
          ON model.model_code = logs.model_id
        WHERE ${whereSql}
      `,
      filterParams,
    );
    const result = await deps.db.query<AdminUserModelRequestLogRow>(
      `
        SELECT
          logs.id,
          logs.provider_request_id,
          COALESCE(model.media_type, ${inferredMediaTypeSql}) AS media_type,
          model.display_name,
          COALESCE(allocation.credits_cost, 0) AS credits_cost,
          logs.provider_name,
          logs.provider_operation,
          logs.model_id,
          logs.provider_model,
          logs.request_key,
          logs.request_hash,
          logs.payload_hash,
          logs.payload_summary,
          logs.request_format,
          logs.request_body_json,
          requests.payload_redacted_json AS business_request_body_json,
          CASE
            WHEN requests.external_submission_started_at IS NULL THEN NULL
            ELSE COALESCE(
              requests.response_redacted_json->'redactedRequest',
              CASE
                WHEN COALESCE(logs.request_format, '') <> 'generation_task'
                  THEN logs.request_body_json
                ELSE NULL
              END
            )
          END AS provider_request_body_json,
          model.provider_config_json AS provider_request_url_config_json,
          requests.response_redacted_json AS provider_response_redacted_json,
          requests.status AS provider_request_status,
          requests.failure_code AS provider_failure_code,
          requests.external_submission_started_at,
          requests.external_request_id,
          task.status AS task_status,
          task.failure_code AS task_failure_code,
          logs.request_text,
          logs.response_text,
          logs.response_usage_json,
          logs.response_finish_reasons_json,
          logs.status,
          logs.failure_code,
          logs.project_id,
          logs.started_at,
          logs.completed_at,
          logs.created_at
        FROM user_model_request_logs logs
        LEFT JOIN projects project
          ON project.id = logs.project_id
        LEFT JOIN ai_model_configs model
          ON model.model_code = logs.model_id
        LEFT JOIN provider_requests requests
          ON requests.id = logs.provider_request_id
        LEFT JOIN tasks task
          ON task.id = logs.task_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            (
              SELECT SUM(amount)
              FROM credit_reservation_allocations
              WHERE provider_request_id = logs.provider_request_id
                AND status = 'consumed'
            ),
            (
              SELECT reservation.amount_consumed
              FROM credit_reservations reservation
              WHERE reservation.user_id = logs.user_id
                AND reservation.source_type = 'team_asset_generation_task'
                AND reservation.metadata_json->>'targetId' = logs.request_body_json->>'assetId'
                AND reservation.status = 'settled'
              ORDER BY ABS(EXTRACT(EPOCH FROM (reservation.created_at - logs.created_at))) ASC
              LIMIT 1
            ),
            0
          ) AS credits_cost
        ) allocation ON true
        WHERE ${whereSql}
        ORDER BY logs.created_at DESC, logs.id DESC
        LIMIT $${filterParams.length + 1}
        OFFSET $${filterParams.length + 2}
      `,
      [...filterParams, pageSize, offset],
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);

    return {
      data: result.rows.map(modelRequestLogFromRow),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async function getTeamPlanLimit(input: { userId: string }) {
    const summary = await buildTeamPlanLimitSummary(deps.db, input.userId);
    if (!summary) {
      return error(404, "admin_user_not_found", "用户不存在");
    }
    return { status: 200, body: { data: summary } };
  }

  async function updateTeamPlanLimit(input: {
    userId: string;
    seatLimit: number | null;
    reason: string;
    actorAdminAccountId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");

    const before = await buildTeamPlanLimitSummary(deps.db, input.userId);
    if (!before) {
      return error(404, "admin_user_not_found", "用户不存在");
    }

    const isClearingOverride = input.seatLimit === null;
    if (isClearingOverride) {
      await deps.db.query("UPDATE users SET team_seat_limit = 0, updated_at = $2 WHERE id = $1", [input.userId, input.now]);
    } else {
      const seatLimit = Number(input.seatLimit);
      if (!Number.isInteger(seatLimit) || seatLimit < 0) {
        return error(400, "invalid_team_seat_limit", "子账号上限必须是大于等于 0 的整数");
      }
      await deps.db.query(
        `
          UPDATE users
          SET team_seat_limit = $2,
              updated_at = $3
          WHERE id = $1
        `,
        [
          input.userId,
          seatLimit,
          input.now,
        ],
      );
    }

    const after = (await buildTeamPlanLimitSummary(deps.db, input.userId))!;
    await appendAuditEvent(deps.db, {
      actorUserId: null,
      actorAdminAccountId: input.actorAdminAccountId,
      eventType: isClearingOverride ? "admin.team_plan_limit.cleared" : "admin.team_plan_limit.updated",
      targetType: "user",
      targetId: input.userId,
      reason,
      sensitive: false,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        before,
        after,
      },
    });

    return { status: 200, body: { data: after } };
  }

  return {
    listUsers,
    listSubaccounts,
    listTeamPermissionAccounts,
    grantUserCredits,
    grantUserMembership,
    revealUserContact,
    updateUserProfile,
    updateUserStatus,
    deductUserCredits,
    restoreFrozenUserCredits,
    listUserCreditLedger,
    listCreatorUserCreditLedger,
    listUserModelRequestLogs,
    getTeamPlanLimit,
    updateTeamPlanLimit,
  };
}

async function grantTeamMemberCredits(
  db: SqlDatabase,
  input: {
    ownerUserId: string;
    teamMemberId: string;
    amount: number;
    sourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const member = await queryOne<{ id: string; member_credits: number | string }>(
      db,
      `
        UPDATE team_members
        SET member_credits = member_credits + $3,
            updated_at = $4
        WHERE id = $1
          AND user_id = $2
          AND status = 'active'
          AND deleted_at IS NULL
        RETURNING id, member_credits
      `,
      [input.teamMemberId, input.ownerUserId, input.amount, input.now],
    );
    if (!member) {
      throw new Error("team_member_credit_target_not_found");
    }
    const ledger = await queryOne<{ id: string }>(
      db,
      `
        INSERT INTO credit_ledger_entries (
          id,
          user_id,
          team_member_id,
          entry_type,
          amount,
          available_delta,
          reserved_delta,
          consumed_delta,
          balance_after,
          source_type,
          source_id,
          reason,
          metadata_json,
          created_by_user_id,
          created_at
        )
        VALUES ($1, $2, $3, 'grant', $4, $4, 0, 0, $9, 'admin_manual_grant', $5, $6, $7::jsonb, NULL, $8)
        RETURNING id
      `,
      [
        randomUUID(),
        input.ownerUserId,
        input.teamMemberId,
        input.amount,
        input.sourceId,
        input.reason,
        JSON.stringify(input.metadata),
        input.now,
        Number(member.member_credits),
      ],
    );
    if (!ledger) {
      throw new Error("team_member_credit_ledger_not_created");
    }
    await db.query("COMMIT");
    return ledger;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

interface UserCreditTarget {
  userId: string;
  status: string;
  accountName: string | null;
  membershipId: string;
  hasMembership: boolean;
  membershipRole: string | null;
  membershipTier: string | null;
  membershipExpiresAt: Date | string | null;
  teamProfileId: string | null;
  teamRole: string | null;
  teamGroupId: string | null;
  createdByUserId: string | null;
}

interface LedgerScope {
  sql: string;
  params: string[];
  limitParamIndex: number;
}

interface LedgerRow {
  id: string;
  reservation_id: string | null;
  allocation_id: string | null;
  entry_type: string;
  amount: number | string;
  available_delta: number | string;
  reserved_delta: number | string;
  consumed_delta: number | string;
  balance_after: number | string | null;
  source_type: string;
  source_id: string;
  reason: string;
  metadata_json: unknown;
  user_id: string | null;
  created_at: Date | string;
}

interface AdminMembershipPlanRow {
  id: string;
  code: string;
  display_name: string;
  tier: string;
  period_unit: string;
  period_count: number | string;
  amount_minor: number | string;
  currency: string;
  gift_credits: number | string;
  seat_limit: number | string;
  entitlements_json: unknown;
  priority_rules_json: unknown;
  display_metadata_json: unknown;
  status: string;
  visibility: string;
  usage_scene: string;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AdminMembershipGrantOrderRow {
  id: string;
  membership_plan_id: string | null;
  credit_grant_ledger_entry_id: string | null;
}

async function buildTeamPlanLimitSummary(
  db: SqlDatabase,
  userId: string,
): Promise<AdminTeamPlanLimitSummary | null> {
  const user = await queryOne<{
    id: string;
    display_name: string | null;
    phone_e164: string;
    team_seat_limit: number | string;
  }>(
    db,
    `SELECT id, display_name, phone_e164, team_seat_limit
     FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  if (!user) return null;
  const defaultSeatLimit = await resolveAdminDefaultSubaccountLimit(db);
  const configuredLimit = Number(user.team_seat_limit ?? 0);
  const usedSeats = await countUserActiveSubaccounts(db, userId);
  const hasConfiguredLimit = configuredLimit > 0;
  const effectiveSeatLimit = hasConfiguredLimit ? configuredLimit : defaultSeatLimit;
  return {
    userName: user.display_name?.trim() || user.phone_e164,
    defaultSeatLimit,
    effectiveSeatLimit,
    overrideSeatLimit: hasConfiguredLimit ? configuredLimit : null,
    limitSource: hasConfiguredLimit ? "override" : "default",
    usedSeats,
    remainingSeats: Math.max(0, effectiveSeatLimit - usedSeats),
  };
}

async function resolveAdminDefaultSubaccountLimit(db: SqlDatabase) {
  const config = await queryOne<{ value_json: unknown }>(
    db,
    "SELECT value_json FROM runtime_config_entries WHERE key = $1 LIMIT 1",
    [TEAM_SUBACCOUNT_LIMIT_CONFIG_KEY],
  );
  return normalizeAdminSubaccountLimit(config?.value_json);
}

function normalizeAdminSubaccountLimit(value: unknown) {
  const limit = value === null || value === undefined ? DEFAULT_TEAM_SUBACCOUNT_LIMIT : Number(value);
  if (!Number.isInteger(limit) || limit < 0) return DEFAULT_TEAM_SUBACCOUNT_LIMIT;
  return limit;
}

async function countUserActiveSubaccounts(db: SqlDatabase, userId: string) {
  const result = await queryOne<{ count: string | number }>(
    db,
    "SELECT COUNT(*) AS count FROM team_members WHERE user_id = $1 AND status = 'active'",
    [userId],
  );
  return Number(result?.count ?? 0);
}

async function listAdminTeamMembers(
  db: SqlDatabase,
  input: { ownerUserId?: string; keyword?: string | null },
): Promise<AdminUserRow[]> {
  const params: unknown[] = [];
  const filters = ["member.status <> 'deleted'"];
  if (input.ownerUserId) {
    params.push(input.ownerUserId);
    filters.push(`member.user_id = $${params.length}`);
  }
  if (input.keyword) {
    params.push(`%${input.keyword}%`);
    filters.push(`(
      member.id::text ILIKE $${params.length}
      OR member.member_name ILIKE $${params.length}
      OR member.member_account ILIKE $${params.length}
      OR member.member_login_account ILIKE $${params.length}
      OR COALESCE(owner.display_name, '') ILIKE $${params.length}
    )`);
  }
  const result = await db.query<AdminUserRow>(
    `SELECT
       member.id AS user_id,
       NULL::text AS invite_code,
       member.member_name AS display_name,
       NULL::text AS phone_e164,
       NULL::text AS email,
       NULL::timestamptz AS last_login_at,
       member.status AS user_status,
       member.id AS membership_id,
       'team_member'::text AS membership_role,
       NULL::text AS membership_tier,
       NULL::timestamptz AS membership_expires_at,
       'member'::text AS team_role,
       NULL::uuid AS team_group_id,
       NULL::text AS team_group_name,
       member.member_credits AS user_credit_balance,
       0::integer AS user_reserved_balance,
       0::integer AS user_frozen_balance,
       member.member_credits AS member_credit_balance,
       0::integer AS member_credit_used,
       COALESCE((
         SELECT SUM(reservation.amount_reserved)
         FROM credit_reservations reservation
         WHERE reservation.user_id = member.user_id
           AND reservation.status = 'active'
           AND reservation.metadata_json->>'targetTeamMemberId' = member.id::text
       ), 0) AS active_reserved_credits,
       0::integer AS subaccount_count,
       member.member_account,
       member.member_login_account,
       member.created_at AS member_created_at,
       member.updated_at AS member_updated_at
     FROM team_members member
     JOIN users owner ON owner.id = member.user_id
     WHERE ${filters.join(" AND ")}
     ORDER BY member.created_at DESC, member.id ASC`,
    params,
  );
  return result.rows;
}

async function findUserCreditTarget(
  db: SqlDatabase,
  input: { userId: string },
): Promise<UserCreditTarget | undefined> {
  const user = await queryOne<{
    id: string;
    status: string;
    display_name: string | null;
    membership_tier: string | null;
    membership_expires_at: Date | string | null;
  }>(
    db,
    `SELECT user_account.id, user_account.status, user_account.display_name,
            membership.membership_tier,
            membership.expires_at AS membership_expires_at
     FROM users user_account
     LEFT JOIN user_memberships membership ON membership.user_id = user_account.id
     WHERE user_account.id = $1 LIMIT 1`,
    [input.userId],
  );
  if (user) {
    return {
      userId: user.id,
      status: user.status,
      accountName: user.display_name,
      membershipId: user.id,
      hasMembership: Boolean(user.membership_tier),
      membershipRole: "owner",
      membershipTier: user.membership_tier,
      membershipExpiresAt: user.membership_expires_at,
      teamProfileId: null,
      teamRole: null,
      teamGroupId: null,
      createdByUserId: user.id,
    };
  }
  const member = await queryOne<{
    id: string;
    user_id: string;
    status: string;
    member_name: string;
  }>(
    db,
    "SELECT id, user_id, status, member_name FROM team_members WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
    [input.userId],
  );
  if (!member) return undefined;
  return {
    userId: member.user_id,
    status: member.status,
    accountName: member.member_name,
    membershipId: member.id,
    hasMembership: false,
    membershipRole: "team_member",
    membershipTier: null,
    membershipExpiresAt: null,
    teamProfileId: member.id,
    teamRole: "member",
    teamGroupId: null,
    createdByUserId: member.user_id,
  };
}

async function findGrantableMembershipPlan(
  db: SqlDatabase,
  input: { membershipPlanId: string; now: Date },
) {
  return queryOne<AdminMembershipPlanRow>(
    db,
    `
      SELECT *
      FROM membership_plans
      WHERE id = $1
        AND status = 'active'
        AND visibility = 'public'
        AND usage_scene IN ('purchase', 'manual_gift', 'test')
        AND (valid_from IS NULL OR valid_from <= $2)
        AND (valid_until IS NULL OR valid_until > $2)
      LIMIT 1
    `,
    [input.membershipPlanId, input.now],
  );
}

async function findAdminActiveMembership(
  db: SqlDatabase,
  input: { userId: string; now: Date },
) {
  return queryOne<{
    membership_tier: string;
    purchase_at: Date | string | null;
    expires_at: Date | string;
    gift_credits: number | string;
  }>(
    db,
    `
      SELECT membership_tier, purchase_at, expires_at, gift_credits
      FROM user_memberships
      WHERE user_id = $1
        AND membership_tier IN ('experience', 'professional')
        AND expires_at > $2
      ORDER BY
        CASE WHEN membership_tier = 'professional' THEN 2 ELSE 1 END DESC,
        expires_at DESC NULLS LAST,
        updated_at DESC
      LIMIT 1
    `,
    [input.userId, input.now],
  );
}

function membershipTierRank(tier: string | null | undefined) {
  if (tier === "professional") return 2;
  if (tier === "experience") return 1;
  return 0;
}

async function updateAdminGiftTeamSeatLimit(
  db: SqlDatabase,
  input: { userId: string; seatLimit: number; now: Date },
) {
  await db.query(
    `
      UPDATE users
      SET team_seat_limit = $2,
          updated_at = $3
      WHERE id = $1
    `,
    [input.userId, input.seatLimit, input.now],
  );
}

function membershipPlanSnapshotFromRow(row: AdminMembershipPlanRow) {
  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    tier: row.tier,
    periodUnit: row.period_unit,
    periodCount: Number(row.period_count),
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    giftCredits: Number(row.gift_credits),
    seatLimit: Number(row.seat_limit),
    entitlements: normalizeStringArray(row.entitlements_json),
    priorityRules: normalizeJson(row.priority_rules_json),
    displayMetadata: normalizeJson(row.display_metadata_json),
    visibility: row.visibility,
    usageScene: row.usage_scene,
    status: row.status,
    validFrom: row.valid_from ? new Date(row.valid_from).toISOString() : null,
    validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function ledgerScopeForTarget(target: UserCreditTarget): LedgerScope {
  if (target.membershipRole === "owner" || target.membershipRole === "owner_admin" || target.teamRole === "admin" || target.teamRole === "group_admin") {
    return {
      sql: "user_id = $1::uuid",
      params: [target.userId],
      limitParamIndex: 2,
    };
  }
  if (target.teamProfileId) {
    return {
      sql: "user_id = $1::uuid AND team_member_id = $2::uuid",
      params: [target.userId, target.teamProfileId],
      limitParamIndex: 3,
    };
  }
  return {
    sql: "user_id = $1::uuid AND team_member_id IS NULL",
    params: [target.userId],
    limitParamIndex: 2,
  };
}

function isMemberWalletTarget(target: UserCreditTarget) {
  return Boolean(target.teamProfileId);
}

function isPersonalCreditOwnerTarget(target: UserCreditTarget) {
  return !target.teamProfileId;
}

function resolveCreditAccountType(target: UserCreditTarget): "管理员账户" | "子账户" | "普通账户" {
  if (target.teamProfileId) {
    return "子账户";
  }
  if (target.membershipRole === "owner_admin" || target.teamRole === "admin" || target.teamRole === "group_admin") {
    return "管理员账户";
  }
  return "普通账户";
}

function isWritableCreditTarget(target: UserCreditTarget) {
  return isMemberWalletTarget(target) || isPersonalCreditOwnerTarget(target);
}

async function buildCreatorCreditBalanceSummary(
  db: SqlDatabase,
  target: UserCreditTarget,
) {
  if (target.teamProfileId) {
    const memberWallet = await queryOne<{ member_credits: number | string }>(
      db,
      "SELECT member_credits FROM team_members WHERE id = $1 AND user_id = $2",
      [target.teamProfileId, target.userId],
    );
    return {
      displayAvailableCredits: Number(memberWallet?.member_credits ?? 0),
    };
  }

  const wallet = await queryOne<{ credit_balance_cached: number | string }>(
    db,
    "SELECT credit_balance_cached FROM users WHERE id = $1",
    [target.userId],
  );
  return {
    displayAvailableCredits: Number(wallet?.credit_balance_cached ?? 0),
  };
}

async function buildUserCreditSummary(
  db: SqlDatabase,
  target: UserCreditTarget,
  ledgerScope: LedgerScope,
) {
  const wallet = await queryOne<{
    credit_balance_cached: number | string;
    credit_reserved_cached: number | string;
    credit_frozen_cached: number | string;
    credit_frozen_at: Date | string | null;
    credit_frozen_until: Date | string | null;
  }>(
    db,
    `
      SELECT
        credit_balance_cached,
        credit_reserved_cached,
        credit_frozen_cached,
        credit_frozen_at,
        credit_frozen_until
      FROM users
      WHERE id = $1
    `,
    [target.userId],
  );
  const totals = await queryOne<{
    total_granted: number | string;
    total_released: number | string;
  }>(
    db,
    `
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE entry_type = 'grant'), 0) AS total_granted,
        COALESCE(SUM(amount) FILTER (WHERE entry_type = 'release'), 0) AS total_released
      FROM credit_ledger_entries
      WHERE ${ledgerScope.sql}
    `,
    ledgerScope.params,
  );
  const reservationConsumed = await queryOne<{ total_consumed: number | string }>(
    db,
    `
      SELECT COALESCE(SUM(r.amount_consumed), 0) AS total_consumed
      FROM credit_reservations r
      WHERE r.user_id = $1::uuid
    `,
    [target.userId],
  );
  const standaloneConsumed = await queryOne<{ total_consumed: number | string }>(
    db,
    `
      SELECT COALESCE(SUM(amount), 0) AS total_consumed
      FROM credit_ledger_entries
      WHERE entry_type = 'consume'
        AND reservation_id IS NULL
        AND allocation_id IS NULL
        AND ${ledgerScope.sql}
    `,
    ledgerScope.params,
  );
  const reservations = await queryOne<{
    active_count: number | string;
    manual_review_count: number | string;
    active_reserved: number | string;
  }>(
    db,
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active_count,
        COUNT(*) FILTER (WHERE status = 'manual_review_required') AS manual_review_count,
        COALESCE(SUM(amount_reserved) FILTER (WHERE status = 'active'), 0) AS active_reserved
      FROM credit_reservations
      WHERE user_id = $1::uuid
    `,
    [target.userId],
  );

  const userAvailable = Number(wallet?.credit_balance_cached ?? 0);
  const userReserved = Number(wallet?.credit_reserved_cached ?? 0);
  const userFrozen = Number(wallet?.credit_frozen_cached ?? 0);
  const memberWallet = target.teamProfileId
    ? await queryOne<{ member_credits: number | string }>(
        db,
        "SELECT member_credits FROM team_members WHERE id = $1 AND user_id = $2",
        [target.teamProfileId, target.userId],
      )
    : null;
  const memberAvailable = memberWallet ? Number(memberWallet.member_credits) : null;
  const memberUsed = null;
  const displayAvailableCredits = memberAvailable ?? userAvailable;
  const targetReserved = Number(reservations?.active_reserved ?? 0);
  const totalConsumed = Number(reservationConsumed?.total_consumed ?? 0) + Number(standaloneConsumed?.total_consumed ?? 0);
  return {
    balanceScope: target.teamProfileId ? "member" : "user",
    userAvailableCredits: userAvailable,
    userReservedCredits: userReserved,
    userFrozenCredits: userFrozen,
    userFrozenAt: userFrozen > 0 && wallet?.credit_frozen_at
      ? new Date(wallet.credit_frozen_at).toISOString()
      : null,
    userFrozenUntil: userFrozen > 0 && wallet?.credit_frozen_until
      ? new Date(wallet.credit_frozen_until).toISOString()
      : null,
    memberAvailableCredits: memberAvailable,
    memberUsedCredits: memberUsed,
    displayAvailableCredits,
    displayCreditBalance: displayAvailableCredits + userFrozen,
    frozenCredits: userFrozen,
    displayReservedCredits: targetReserved || userReserved,
    totalGrantedCredits: Number(totals?.total_granted ?? 0),
    totalConsumedCredits: totalConsumed,
    totalReleasedCredits: Number(totals?.total_released ?? 0),
    activeReservationCount: Number(reservations?.active_count ?? 0),
    manualReviewReservationCount: Number(reservations?.manual_review_count ?? 0),
  };
}

function userFromRow(row: AdminUserRow): AdminUserListItem {
  const accountType = resolveAccountType(row);
  const availableCredits = Number(row.user_credit_balance ?? 0);
  const frozenCredits = Number(row.user_frozen_balance ?? 0);
  const activeReservedCredits = Number(row.active_reserved_credits ?? 0);
  const reservedCredits = activeReservedCredits > 0
    ? activeReservedCredits
    : Number(row.user_reserved_balance ?? 0);
  return {
    userId: row.user_id,
    inviteCode: row.invite_code,
    displayName: row.display_name ?? "未命名用户",
    phone: row.phone_e164 ? normalizeAdminUserPhone(row.phone_e164) : null,
    email: maskEmail(row.email),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    status: row.user_status,
    accountName: row.display_name,
    membershipId: row.membership_id,
    membershipRole: row.membership_role,
    membershipTier: normalizeMembershipTier(row.membership_tier, row.membership_expires_at),
    membershipExpiresAt: row.membership_expires_at ? new Date(row.membership_expires_at).toISOString() : null,
    accountType,
    teamRole: row.team_role,
    teamGroupId: row.team_group_id,
    teamGroupName: row.team_group_name,
    availableCredits,
    reservedCredits,
    frozenCredits,
    displayCreditBalance: availableCredits + frozenCredits,
    usedCredits: Number(row.member_credit_used ?? 0),
    subaccountCount: Number(row.subaccount_count ?? 0),
    ...(accountType === "subaccount"
      ? {
          loginName: row.member_login_account ?? null,
          memberAccount: row.member_account ?? null,
          memberLoginAccount: row.member_login_account ?? null,
          memberCredits: availableCredits,
          creditBalance: availableCredits,
        }
      : {}),
    ...(row.member_created_at ? { createdAt: new Date(row.member_created_at).toISOString() } : {}),
    ...(row.member_updated_at ? { updatedAt: new Date(row.member_updated_at).toISOString() } : {}),
  };
}

function resolveAccountType(row: AdminUserRow): AdminUserListItem["accountType"] {
  if (row.membership_role === "team_member") {
    return "subaccount";
  }
  if (row.membership_role === "owner") {
    return "owner_account";
  }
  return "user";
}

function normalizeMembershipTier(tier: string | null, expiresAt: Date | string | null): string | null {
  const normalized = String(tier ?? "").trim();
  if (normalized !== "experience" && normalized !== "professional") return null;
  if (!expiresAt) return null;
  const expiresTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresTime) || expiresTime <= Date.now()) return null;
  return normalized;
}

function normalizeAdminUserPhone(phone: string): string {
  try {
    return normalizeCnPhone(phone);
  } catch {
    return phone;
  }
}

function maskEmail(email: string | null): string | null {
  if (!email) {
    return null;
  }
  const [name, domain] = email.split("@");
  if (!name || !domain) {
    return email;
  }
  return `${name.slice(0, 2)}***@${domain}`;
}

function ledgerFromRow(row: LedgerRow) {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    allocationId: row.allocation_id,
    entryType: row.entry_type,
    amount: Number(row.amount),
    availableDelta: Number(row.available_delta),
    reservedDelta: Number(row.reserved_delta),
    consumedDelta: Number(row.consumed_delta),
    balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    metadata: normalizeJson(row.metadata_json),
    content: creditLedgerContentLabel(row),
    userId: row.user_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function creditLedgerContentLabel(row: LedgerRow) {
  const metadata = normalizeJson(row.metadata_json);
  const reason = String(row.reason ?? "").trim();
  const sourceType = String(row.source_type ?? "").trim().toLowerCase();
  const mediaType = String(metadata.mediaType ?? metadata.kind ?? "").trim().toLowerCase();
  const taskType = String(metadata.taskType ?? metadata.task_type ?? metadata.operation ?? "").trim().toLowerCase();
  const scenario = String(metadata.adjustmentScenario ?? "").trim();
  const packageName = String(metadata.packageName ?? metadata.package_name ?? metadata.planName ?? metadata.plan_name ?? "").trim();
  const credits = Number(row.amount ?? 0);
  const text = [sourceType, reason, mediaType, taskType, metadata.modelCode, metadata.providerOperation]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (sourceType === "payment_order") {
    return packageName ? `充值${packageName}套餐增加积分` : `充值${Number.isFinite(credits) ? `${credits}积分套餐` : "套餐"}增加积分`;
  }
  if (sourceType === "membership_gift") {
    return metadata.adminGift === true ? "会员赠送" : "会员赠送积分";
  }
  if (sourceType.includes("admin")) {
    if (scenario === "promotion" || scenario === "recharge_bonus") return "活动增加积分";
    return row.entry_type === "consume" ? "手动扣减积分" : "手动增加积分";
  }
  if (text.includes("storyboard")) {
    return row.entry_type === "release" ? "AI分镜生成返还积分" : "生AI分镜扣减";
  }
  if (text.includes("script") || mediaType === "text") {
    return row.entry_type === "release" ? "生成剧本返还积分" : "生成剧本扣减";
  }
  if (text.includes("video") || mediaType === "video") {
    return row.entry_type === "release" ? "生视频返还积分" : "生视频扣减";
  }
  if (text.includes("image") || mediaType === "image") {
    return row.entry_type === "release" ? "生图返还积分" : "生图扣减";
  }
  if (row.entry_type === "grant") return "增加积分";
  if (row.entry_type === "release") return "任务返还积分";
  return row.entry_type === "consume" || row.entry_type === "reservation" ? "任务扣减积分" : "积分变动";
}

function modelRequestLogFromRow(
  row: AdminUserModelRequestLogRow,
): AdminUserModelRequestLogItem {
  const modelType = normalizeAdminModelType(row.media_type);
  return {
    id: row.id,
    providerRequestId: row.provider_request_id,
    modelType,
    modelName: row.display_name?.trim() || row.model_id || row.provider_model,
    creditsCost: Number(row.credits_cost ?? 0),
    providerName: row.provider_name,
    providerOperation: row.provider_operation,
    modelId: row.model_id,
    providerModel: row.provider_model,
    requestKey: row.request_key,
    requestHash: row.request_hash,
    payloadHash: row.payload_hash,
    payloadSummary: row.payload_summary,
    requestFormat: row.request_format,
    requestBody: row.request_body_json ?? {},
    businessRequestBody: row.business_request_body_json ?? (
      row.request_format === "generation_task" ? row.request_body_json ?? {} : {}
    ),
    providerRequestBody: row.provider_request_body_json ?? null,
    providerRequestUrl: resolveProviderRequestUrl(row.provider_request_url_config_json),
    providerResponseBody: readProviderResponseBody(
      row.provider_response_redacted_json,
      row.request_format,
    ),
    providerRequestStatus: row.provider_request_status,
    providerFailureCode: row.provider_failure_code,
    externalSubmissionStartedAt: row.external_submission_started_at
      ? new Date(row.external_submission_started_at).toISOString()
      : null,
    externalRequestId: row.external_request_id,
    taskStatus: row.task_status,
    taskFailureCode: row.task_failure_code,
    requestText: row.request_text,
    responseText: row.response_text,
    responseUsage: row.response_usage_json ?? null,
    responseFinishReasons: Array.isArray(row.response_finish_reasons_json)
      ? row.response_finish_reasons_json
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [],
    status: row.status,
    failureCode: row.failure_code,
    projectId: row.project_id,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function resolveProviderRequestUrl(value: unknown): string | null {
  const config = normalizeJson(value);
  const baseUrl = readNonEmptyString(config.baseURL);
  const endpoint = readNonEmptyString(config.requestPath)
    ?? readNonEmptyString(config.createTaskEndpoint)
    ?? readNonEmptyString(config.endpoint);
  if (endpoint && /^https?:\/\//i.test(endpoint)) return endpoint;
  if (baseUrl && endpoint) {
    return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  }
  return endpoint ?? baseUrl ?? null;
}

function readProviderResponseBody(value: unknown, requestFormat: string | null): unknown {
  const response = normalizeJson(value);
  const diagnostics = normalizeJson(response.diagnostics);
  const preview = readNonEmptyString(diagnostics.responseBodyPreview);
  if (preview) {
    try {
      return JSON.parse(preview) as unknown;
    } catch {
      return preview;
    }
  }
  if (response.providerResponse !== undefined) return response.providerResponse;
  if (response.providerRawResponse !== undefined) return response.providerRawResponse;
  if (requestFormat !== "generation_task") return null;
  const { redactedRequest: _redactedRequest, diagnostics: _diagnostics, ...summary } = response;
  return Object.keys(summary).length > 0 ? summary : null;
}

function readNonEmptyString(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  let normalized = value;
  if (typeof normalized === "string") {
    try {
      normalized = JSON.parse(normalized) as unknown;
    } catch {
      normalized = [];
    }
  }
  if (!Array.isArray(normalized)) return [];
  return normalized.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizeAdminModelTypeFilter(value: unknown): "all" | "text" | "image" | "video" {
  const normalized = String(value ?? "all").trim().toLowerCase();
  if (normalized === "text" || normalized === "image" || normalized === "video") {
    return normalized;
  }
  return "all";
}

function normalizeAdminModelType(value: unknown): "text" | "image" | "video" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "image" || normalized === "video") {
    return normalized;
  }
  return "text";
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

function createAdminMembershipGiftOrderNo(now: Date, sourceId: string) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `GIFT-${stamp}-${sourceId.slice(0, 8)}`;
}

function normalizeWorkOrderNo(value: string | undefined): string {
  const workOrderNo = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,8}-\d{8}-\d{3,8}$/.test(workOrderNo)) return "";
  return workOrderNo;
}

function normalizeAdjustmentScenario(value: string | undefined): string {
  const scenario = String(value ?? "").trim();
  if (
    [
      "manual_adjustment",
      "compensation",
      "recharge_bonus",
      "default_grant",
      "correction",
      "promotion",
    ].includes(scenario)
  ) {
    return scenario;
  }
  return "manual_adjustment";
}

function isActiveUserStatus(status: string | null | undefined): boolean {
  return status === "active";
}

function canTransitionUserStatus(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === "active") {
    return nextStatus === "disabled" || nextStatus === "archived";
  }
  if (currentStatus === "disabled") {
    return nextStatus === "active";
  }
  return false;
}

function inactiveUserOperationError(status: string | null | undefined) {
  const message = status === "archived"
    ? "账户已归档，仅允许查看历史记录"
    : "账户未启用，仅允许查看或启用后再操作";
  return error(409, "inactive_user_operation_blocked", message);
}

function error(status: number, code: string, message: string) {
  return { status, body: { error: { code, message } } };
}
