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
  capabilities_json: unknown;
}

export async function resolveMembershipGenerationPriority(
  db: SqlDatabase,
  input: { userId: string; modelCode: string | null | undefined; now: Date },
): Promise<MembershipGenerationPriority> {
  const modelCode = input.modelCode?.trim();
  if (!modelCode) {
    return normalPriority();
  }

  const row = await queryOne<MembershipPriorityRow>(
    db,
    `
      SELECT
        amc.capabilities_json
      FROM ai_model_configs amc
      JOIN user_memberships membership
        ON membership.user_id = $1
      WHERE amc.model_code = $2
        AND amc.status = 'active'
        AND membership.membership_tier = 'professional'
        AND membership.status = 'active'
        AND membership.expires_at > $3
      LIMIT 1
    `,
    [input.userId, modelCode, input.now],
  );
  if (!row) {
    return normalPriority();
  }
  const modelCapabilities = normalizeObject(row.capabilities_json);
  const modelFamily = normalizeText(modelCapabilities.modelFamily).toLowerCase();

  const eligible =
    modelCapabilities.membershipPriorityEligible === true &&
    modelFamily.length > 0 &&
    modelFamily === "seedance";

  if (!eligible) {
    return normalPriority();
  }

  return {
    enabled: true,
    priority: 1,
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
