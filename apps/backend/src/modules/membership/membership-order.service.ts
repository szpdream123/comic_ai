import { createHash, randomUUID } from "node:crypto";

import {
  createMembershipOrderCommand,
  getMembershipStatusCommand,
} from "../../../../../packages/contracts/api/membership.commands.ts";
import type { OrderStatus } from "../../../../../packages/contracts/domain/states.ts";
import {
  resolveUserActorContext,
} from "../identity/user-actor-context.service.ts";
import { runIdempotentCommand } from "../shared/command/platform-command-runtime.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  IdempotencyConflictError,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";
import { createMembershipPlanService } from "./membership-plan.service.ts";

interface AuthenticatedMembershipUser {
  sessionToken: string;
}

interface MembershipPlanRow {
  id: string;
  code: string;
  display_name: string;
  tier: string;
  period_unit: string;
  period_count: number;
  amount_minor: number;
  currency: string;
  gift_credits: number;
  seat_limit: number;
  entitlements_json: unknown;
  priority_rules_json: unknown;
  display_metadata_json: unknown;
  status: string;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface BillingOrderRow {
  id: string;
  order_no: string;
  status: OrderStatus;
  credit_package_id: string | null;
  membership_plan_id: string | null;
  product_type: string;
  package_snapshot_json: unknown;
  product_snapshot_json: unknown;
  credits: number;
  amount_minor: number;
  currency: string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
  credit_grant_ledger_entry_id: string | null;
  expires_at: Date | string;
}

interface MembershipSubscriptionRow {
  membership_tier: "experience" | "professional" | null;
  purchase_at: Date | string | null;
  expires_at: Date | string | null;
  gift_credits: number;
}

interface ActiveMembershipPeriodRow {
  tier: "experience" | "professional";
  period_end_at: Date | string;
  gift_credits: number;
  entitlements_json: unknown;
}

const PROFESSIONAL_ONLY_ENTITLEMENT_KEYS = [
  "team_asset_library",
  "team_dashboard",
  "team_member_management",
  "full_flow_agent",
] as const;

export function createMembershipOrderService(deps: { db: SqlDatabase }) {
  return {
    async listPurchasablePlans(input: { now: Date }) {
      const plans = createMembershipPlanService({ db: deps.db });
      return plans.listPurchasablePlans(input);
    },

    async createMembershipOrder(input: {
      user: AuthenticatedMembershipUser;
      body: { membershipPlanId: string };
      idempotencyKey: string;
      now: Date;
    }) {
      return createMembershipBillingOrder({
        db: deps.db,
        ...input,
      });
    },

    async getMembershipStatus(input: {
      user: AuthenticatedMembershipUser;
      now: Date;
    }) {
      return getMembershipStatus({
        db: deps.db,
        ...input,
      });
    },
  };
}

export async function createMembershipBillingOrder(input: {
  db: SqlDatabase;
  user: AuthenticatedMembershipUser;
  body: { membershipPlanId: string };
  idempotencyKey: string;
  now: Date;
}) {
  const membershipPlanId = input.body.membershipPlanId?.trim();
  if (!membershipPlanId || !input.idempotencyKey.trim()) {
    return { status: 400, body: { error: "invalid_membership_order_input" } };
  }

  try {
    const executed = await runIdempotentCommand({
      db: input.db,
      operationName: createMembershipOrderCommand.operationName,
      capability: createMembershipOrderCommand.capability,
      idempotencyKey: input.idempotencyKey,
      requestHash: hashJson({ membershipPlanId }),
      now: input.now,
      resolveActor: (db) =>
        resolveUserActorContext(db, {
          sessionToken: input.user.sessionToken,
          capability: createMembershipOrderCommand.capability,
          now: input.now,
        }),
      replay: async ({ idempotencyRecord }) => {
        const order = await findOrderById(input.db, idempotencyRecord.responseResourceId);
        if (!order) {
          throw new Error("membership_order_replay_missing_resource");
        }
        return { order: orderViewFromRow(order) };
      },
      execute: async ({ actor, idempotencyRecord }) => {
        const plan = await findPurchasableMembershipPlan(input.db, {
          membershipPlanId,
          now: input.now,
        });
        if (!plan) {
          throw new MembershipOrderError("membership_plan_not_available");
        }

        const orderId = randomUUID();
        const planSnapshot = planSnapshotFromRow(plan);
        const order = await queryOne<BillingOrderRow>(
          input.db,
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
              idempotency_record_id,
              idempotency_key,
              expires_at,
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
              'pending_payment',
              $9,
              $10,
              $11,
              $12,
              $12
            )
            RETURNING *
          `,
          [
            orderId,
            actor.userId,
            createOrderNo(input.now),
            plan.id,
            JSON.stringify(planSnapshot),
            plan.gift_credits,
            plan.amount_minor,
            plan.currency,
            idempotencyRecord.id,
            input.idempotencyKey,
            new Date(input.now.getTime() + 15 * 60 * 1000),
            input.now,
          ],
        );
        if (!order) {
          throw new Error("membership_order_create_failed");
        }

        const result = { order: orderViewFromRow(order) };
        return {
          result,
          responseResourceType: "billing_order",
          responseResourceId: order.id,
          responseSnapshot: result,
          audit: {
            eventType: createMembershipOrderCommand.auditEvent,
            targetType: "billing_order",
            targetId: order.id,
            metadata: {
              membershipPlanId: plan.id,
              tier: plan.tier,
              periodUnit: plan.period_unit,
              periodCount: plan.period_count,
              amountMinor: plan.amount_minor,
              currency: plan.currency,
              giftCredits: plan.gift_credits,
            },
          },
        };
      },
    });

    return { status: 200, body: executed.result };
  } catch (error) {
    return mapMembershipOrderError(error);
  }
}

async function getMembershipStatus(input: {
  db: SqlDatabase;
  user: AuthenticatedMembershipUser;
  now: Date;
}) {
  try {
    const actor = await resolveUserActorContext(input.db, {
      sessionToken: input.user.sessionToken,
      capability: getMembershipStatusCommand.capability,
      now: input.now,
    });
    const activePeriod = await queryOne<ActiveMembershipPeriodRow>(
      input.db,
      `
        SELECT
          period.tier,
          period.period_end_at,
          period.gift_credits,
          plan.entitlements_json
        FROM membership_periods period
        JOIN membership_plans plan ON plan.id = period.plan_id
        WHERE period.user_id = $1
          AND period.status = 'active'
          AND period.period_end_at > $2
        ORDER BY
          CASE period.tier WHEN 'professional' THEN 2 ELSE 1 END DESC,
          period.period_end_at DESC,
          period.created_at DESC
        LIMIT 1
      `,
      [actor.userId, input.now],
    );
    const subscription = await queryOne<MembershipSubscriptionRow>(
      input.db,
      `
        SELECT membership_tier, purchase_at, expires_at, gift_credits
        FROM user_memberships
        WHERE user_id = $1
        ORDER BY
          CASE WHEN expires_at > $2 AND membership_tier IS NOT NULL THEN 0 ELSE 1 END,
          expires_at DESC NULLS LAST,
          updated_at DESC
        LIMIT 1
      `,
      [actor.userId, input.now],
    );
    const subscriptionView = activePeriod
      ? {
          status: `${activePeriod.tier}_active`,
          currentTier: activePeriod.tier,
          currentPeriodEndAt: new Date(activePeriod.period_end_at).toISOString(),
          giftCredits: Number(activePeriod.gift_credits),
        }
      : membershipSubscriptionView(subscription, input.now);
    const activeEntitlements = resolveCurrentMembershipEntitlements(
      subscriptionView.currentTier,
      activePeriod?.entitlements_json,
    );

    return {
      status: 200,
      body: {
        membership: {
          status: subscriptionView.status,
          currentTier: subscriptionView.currentTier,
          currentPeriodEndAt: subscriptionView.currentPeriodEndAt,
          giftCredits: subscriptionView.giftCredits,
          entitlements: {
            canvasAccess: activeEntitlements.has("canvas_access"),
            priorityGeneration: activeEntitlements.has("priority_generation"),
            teamAssetLibrary: activeEntitlements.has("team_asset_library"),
            teamDashboard: activeEntitlements.has("team_dashboard"),
            teamMemberManagement: activeEntitlements.has("team_member_management"),
            fullFlowAgent: activeEntitlements.has("full_flow_agent"),
          },
        },
      },
    };
  } catch (error) {
    return mapMembershipOrderError(error);
  }
}

function membershipSubscriptionView(
  subscription: MembershipSubscriptionRow | null | undefined,
  now: Date,
) {
  if (!subscription || !subscription.membership_tier) {
    return {
      status: "none",
      currentTier: null,
      currentPeriodEndAt: null,
      giftCredits: 0,
    };
  }

  const currentPeriodEndAt = subscription.expires_at
    ? new Date(subscription.expires_at)
    : null;
  const currentPeriodEndAtIso = currentPeriodEndAt
    ? currentPeriodEndAt.toISOString()
    : null;
  const periodIsActive =
    currentPeriodEndAt !== null &&
    Number.isFinite(currentPeriodEndAt.getTime()) &&
    currentPeriodEndAt.getTime() > now.getTime();

  if (periodIsActive) {
    return {
      status: `${subscription.membership_tier}_active`,
      currentTier: subscription.membership_tier,
      currentPeriodEndAt: currentPeriodEndAtIso,
      giftCredits: Number(subscription.gift_credits ?? 0),
    };
  }

  return {
    status: "expired",
    currentTier: null,
    currentPeriodEndAt: currentPeriodEndAtIso,
    giftCredits: Number(subscription.gift_credits ?? 0),
  };
}

function resolveCurrentMembershipEntitlements(
  currentTier: string | null,
  configuredEntitlements?: unknown,
) {
  const resolved = new Set<string>(
    currentTier ? normalizeStringArray(normalizeJson(configuredEntitlements)) : [],
  );
  if (currentTier === "experience") {
    for (const entitlementKey of PROFESSIONAL_ONLY_ENTITLEMENT_KEYS) {
      if (entitlementKey !== "team_asset_library") {
        resolved.delete(entitlementKey);
      }
    }
  }

  return resolved;
}

async function findPurchasableMembershipPlan(
  db: SqlDatabase,
  input: { membershipPlanId: string; now: Date },
) {
  return queryOne<MembershipPlanRow>(
    db,
    `
      SELECT *
      FROM membership_plans
      WHERE id = $1
        AND status = 'active'
        AND (valid_from IS NULL OR valid_from <= $2)
        AND (valid_until IS NULL OR valid_until > $2)
      LIMIT 1
    `,
    [input.membershipPlanId, input.now],
  );
}

async function findOrderById(db: SqlDatabase, orderId: string | undefined) {
  if (!orderId) {
    return undefined;
  }
  return queryOne<BillingOrderRow>(
    db,
    "SELECT * FROM billing_orders WHERE id = $1",
    [orderId],
  );
}

function planSnapshotFromRow(row: MembershipPlanRow) {
  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    tier: row.tier,
    periodUnit: row.period_unit,
    periodCount: row.period_count,
    amountMinor: row.amount_minor,
    currency: row.currency,
    giftCredits: row.gift_credits,
    seatLimit: row.seat_limit,
    entitlements: normalizeStringArray(normalizeJson(row.entitlements_json)),
    priorityRules: normalizeObject(normalizeJson(row.priority_rules_json)),
    displayMetadata: normalizeObject(normalizeJson(row.display_metadata_json)),
    status: row.status,
    validFrom: row.valid_from ? new Date(row.valid_from).toISOString() : null,
    validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function orderViewFromRow(row: BillingOrderRow) {
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    productType: row.product_type,
    creditPackageId: row.credit_package_id,
    membershipPlanId: row.membership_plan_id,
    packageSnapshot: normalizeObject(normalizeJson(row.package_snapshot_json)),
    productSnapshot: normalizeObject(normalizeJson(row.product_snapshot_json)),
    credits: row.credits,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    successfulPaymentIntentId: row.successful_payment_intent_id,
    creditGrantLedgerEntryId: row.credit_grant_ledger_entry_id,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

function createOrderNo(now: Date) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `ORD-${stamp}-${randomUUID().slice(0, 8)}`;
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeJson(value)))
    .digest("hex");
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeJson(item)]),
    );
  }
  return value;
}

function normalizeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeStringArray(value: unknown): string[] {
  const normalized = normalizeJson(value);
  if (!Array.isArray(normalized)) return [];
  return normalized.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeObject(value: unknown): Record<string, unknown> {
  const normalized = normalizeJson(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return {};
  }
  return normalized as Record<string, unknown>;
}

class MembershipOrderError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function mapMembershipOrderError(error: unknown) {
  if (error instanceof MembershipOrderError) {
    const status = error.code === "membership_plan_not_available" ? 404 : 409;
    return { status, body: { error: error.code } };
  }
  if (error instanceof IdempotencyConflictError) {
    return { status: 409, body: { error: error.code } };
  }
  if (error instanceof IdempotencyProcessingError) {
    return { status: 202, body: { error: error.code } };
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return { status: 403, body: { error: (error as { code: string }).code } };
  }
  throw error;
}
