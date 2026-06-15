import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export type MembershipGenerationPriority =
  | {
      enabled: true;
      priority: number;
      reason: "professional_membership_model_family_priority";
    }
  | {
      enabled: false;
      priority: 5;
      reason: "not_membership_priority_eligible";
    };

interface MembershipPriorityRow {
  subscription_status: string | null;
  current_tier: string | null;
  current_period_end_at: Date | string | null;
  entitlement_status: string | null;
  entitlement_expires_at: Date | string | null;
  plan_snapshot_json: unknown;
  capabilities_json: unknown;
}

export async function resolveMembershipGenerationPriority(
  db: SqlDatabase,
  input: { organizationId: string; modelCode: string | null | undefined; now: Date },
): Promise<MembershipGenerationPriority> {
  const modelCode = input.modelCode?.trim();
  if (!modelCode) {
    return normalPriority();
  }

  const row = await queryOne<MembershipPriorityRow>(
    db,
    `
      SELECT
        oms.status AS subscription_status,
        oms.current_tier,
        oms.current_period_end_at,
        oe.status AS entitlement_status,
        oe.expires_at AS entitlement_expires_at,
        active_period.plan_snapshot_json,
        amc.capabilities_json
      FROM ai_model_configs amc
      LEFT JOIN organization_membership_subscriptions oms
        ON oms.organization_id = $1
      LEFT JOIN organization_entitlements oe
        ON oe.organization_id = $1
       AND oe.entitlement_key = 'priority_generation'
      LEFT JOIN LATERAL (
        SELECT plan_snapshot_json
        FROM membership_periods
        WHERE organization_id = $1
          AND tier = 'professional'
          AND status = 'active'
          AND period_end_at > $3
        ORDER BY period_end_at DESC, created_at DESC
        LIMIT 1
      ) active_period ON true
      WHERE amc.model_code = $2
        AND amc.status = 'active'
      LIMIT 1
    `,
    [input.organizationId, modelCode, input.now],
  );
  if (!row) {
    return normalPriority();
  }

  const modelCapabilities = normalizeObject(row.capabilities_json);
  const planSnapshot = normalizeObject(row.plan_snapshot_json);
  const priorityRules = normalizeObject(planSnapshot.priorityRules);
  const modelFamily = normalizeText(modelCapabilities.modelFamily).toLowerCase();
  const allowedFamilies = normalizeStringArray(priorityRules.modelFamilies)
    .map((family) => family.toLowerCase());

  const eligible =
    row.subscription_status === "professional_active" &&
    row.current_tier === "professional" &&
    isFuture(row.current_period_end_at, input.now) &&
    row.entitlement_status === "active" &&
    isFutureOrOpen(row.entitlement_expires_at, input.now) &&
    modelCapabilities.membershipPriorityEligible === true &&
    modelFamily.length > 0 &&
    allowedFamilies.includes(modelFamily);

  if (!eligible) {
    return normalPriority();
  }

  return {
    enabled: true,
    priority: normalizePriority(priorityRules.queuePriority),
    reason: "professional_membership_model_family_priority",
  };
}

function normalPriority(): MembershipGenerationPriority {
  return {
    enabled: false,
    priority: 5,
    reason: "not_membership_priority_eligible",
  };
}

function normalizePriority(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value ?? 1);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return 1;
  }
  return numberValue;
}

function isFuture(value: Date | string | null, now: Date) {
  return Boolean(value && new Date(value).getTime() > now.getTime());
}

function isFutureOrOpen(value: Date | string | null, now: Date) {
  return value === null || isFuture(value, now);
}

function normalizeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeObject(value: unknown): Record<string, unknown> {
  const normalized = normalizeJson(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return {};
  }
  return normalized as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  const normalized = normalizeJson(value);
  if (!Array.isArray(normalized)) return [];
  return normalized.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
