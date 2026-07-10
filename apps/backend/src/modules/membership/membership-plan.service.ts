import { createHash, randomUUID } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  beginOrReplayCommand,
  IdempotencyConflictError,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../shared/idempotency/persistent-idempotency.store.ts";

const allowedTiers = new Set(["experience", "professional"]);
const allowedPeriodUnits = new Set(["day", "month", "quarter", "year"]);
const allowedStatuses = new Set(["active", "inactive", "archived"]);
const allowedCurrencies = new Set(["CNY"]);
const allowedVisibilities = new Set(["public", "internal"]);
const allowedUsageScenes = new Set(["purchase", "invite_new_user", "invite_inviter", "manual_gift", "test"]);
const publicRecommendationLockKey = "membership_plan:public_recommendation";

export function createMembershipPlanService(deps: { db: SqlDatabase }) {
  async function listPlans(input: { includeArchived?: boolean; now: Date }) {
    const result = await deps.db.query<MembershipPlanRow>(
      `
        SELECT *
        FROM membership_plans
        WHERE ($1::boolean = true OR status <> 'archived')
      `,
      [input.includeArchived === true],
    );

    return { data: { plans: sortPlans(result.rows.map(planFromRow)) } };
  }

  async function listPurchasablePlans(input: { now: Date }) {
    const result = await deps.db.query<MembershipPlanRow>(
      `
        SELECT *
        FROM membership_plans
        WHERE status = 'active'
          AND visibility = 'public'
          AND (valid_from IS NULL OR valid_from <= $1)
          AND (valid_until IS NULL OR valid_until > $1)
      `,
      [input.now],
    );

    return { data: { plans: sortPlans(result.rows.map(planFromRow)) } };
  }

  async function listGrantablePlans(input: { now: Date }) {
    const result = await deps.db.query<MembershipPlanRow>(
      `
        SELECT *
        FROM membership_plans
        WHERE status = 'active'
          AND visibility = 'public'
          AND usage_scene IN ('purchase', 'manual_gift', 'test')
          AND (valid_from IS NULL OR valid_from <= $1)
          AND (valid_until IS NULL OR valid_until > $1)
      `,
      [input.now],
    );

    return { data: { plans: sortPlans(result.rows.map(planFromRow)) } };
  }

  async function savePlan(input: SaveMembershipPlanInput): Promise<MembershipPlanSaveResponse> {
    const parsed = parseSaveInput(input);
    if ("error" in parsed) {
      return parsed.error;
    }
    if (parsed.value.idempotencyKey && !parsed.value.idempotencyOrganizationId) {
      return error(400, "idempotency_scope_required", "idempotency organization scope is required");
    }

    const store = new SqlIdempotencyRecordStore(deps.db);
    const requestHash = hashMembershipPlanSaveRequest(parsed.value);

    try {
      await deps.db.query("BEGIN");

      let idempotencyRecord: Awaited<ReturnType<typeof beginOrReplayCommand>>["record"] | null = null;
      if (parsed.value.idempotencyKey && parsed.value.idempotencyOrganizationId) {
        const started = await beginOrReplayCommand(store, {
          organizationId: parsed.value.idempotencyOrganizationId,
          operationName: operationNames.membershipPlanSave,
          idempotencyKey: parsed.value.idempotencyKey,
          requestHash,
        });
        if (started.kind === "replayed") {
          const replayedPlan = planFromIdempotencySnapshot(started.record.responseSnapshot)
            ?? (started.record.responseResourceId ? await getPlan(started.record.responseResourceId) : undefined);
          if (!replayedPlan) {
            throw new IdempotencyProcessingError(started.record);
          }
          await deps.db.query("COMMIT");
          return { status: 200, body: { plan: replayedPlan } };
        }
        if (started.kind === "processing") {
          throw new IdempotencyProcessingError(started.record);
        }
        idempotencyRecord = started.record;
      }

      const conflictingCode = await queryOne<{ id: string }>(
        deps.db,
        `
          SELECT id
          FROM membership_plans
          WHERE code = $1
            AND ($2::uuid IS NULL OR id <> $2)
          LIMIT 1
        `,
        [parsed.value.code, parsed.value.id],
      );
      if (conflictingCode) {
        await deps.db.query("ROLLBACK");
        return error(409, "membership_plan_code_conflict", "membership plan code already exists");
      }

      const planId = parsed.value.id ?? (
        parsed.value.idempotencyKey
          ? uuidFromIdempotencyKey(`${parsed.value.idempotencyKey}:plan`)
          : randomUUID()
      );
      if (
        parsed.value.visibility === "public"
        && parsed.value.displayMetadata.isRecommended === true
      ) {
        await deps.db.query(
          "SELECT pg_advisory_xact_lock(hashtext($1))",
          [publicRecommendationLockKey],
        );
        await clearOtherRecommendedPlans({
          db: deps.db,
          planId,
          actorAdminAccountId: parsed.value.actorAdminAccountId,
          reason: parsed.value.reason,
          idempotencyKey: parsed.value.idempotencyKey,
          now: parsed.value.now,
        });
      }
      const row = await queryOne<MembershipPlanRow>(
        deps.db,
        `
          INSERT INTO membership_plans (
            id,
            code,
            display_name,
            tier,
            period_unit,
            period_count,
            amount_minor,
            currency,
            gift_credits,
            seat_limit,
            entitlements_json,
            priority_rules_json,
            display_metadata_json,
            visibility,
            usage_scene,
            status,
            valid_from,
            valid_until,
            created_by_admin_id,
            updated_by_admin_id,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11::jsonb,
            $12::jsonb,
            $13::jsonb,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            $19,
            $20,
            $20
          )
          ON CONFLICT (id)
          DO UPDATE SET
            code = EXCLUDED.code,
            display_name = EXCLUDED.display_name,
            tier = EXCLUDED.tier,
            period_unit = EXCLUDED.period_unit,
            period_count = EXCLUDED.period_count,
            amount_minor = EXCLUDED.amount_minor,
            currency = EXCLUDED.currency,
            gift_credits = EXCLUDED.gift_credits,
            seat_limit = EXCLUDED.seat_limit,
            entitlements_json = EXCLUDED.entitlements_json,
            priority_rules_json = EXCLUDED.priority_rules_json,
            display_metadata_json = EXCLUDED.display_metadata_json,
            visibility = EXCLUDED.visibility,
            usage_scene = EXCLUDED.usage_scene,
            status = EXCLUDED.status,
            valid_from = EXCLUDED.valid_from,
            valid_until = EXCLUDED.valid_until,
            updated_by_admin_id = EXCLUDED.updated_by_admin_id,
            updated_at = EXCLUDED.updated_at
          RETURNING *
        `,
        [
          planId,
          parsed.value.code,
          parsed.value.displayName,
          parsed.value.tier,
          parsed.value.periodUnit,
          parsed.value.periodCount,
          parsed.value.amountMinor,
          parsed.value.currency,
          parsed.value.giftCredits,
          parsed.value.seatLimit,
          JSON.stringify(parsed.value.entitlements),
          JSON.stringify(parsed.value.priorityRules),
          JSON.stringify(parsed.value.displayMetadata),
          parsed.value.visibility,
          parsed.value.usageScene,
          parsed.value.status,
          parsed.value.validFrom,
          parsed.value.validUntil,
          parsed.value.actorAdminAccountId,
          parsed.value.now,
        ],
      );
      const plan = planFromRow(row!);

      await deps.db.query(
        `
          INSERT INTO membership_plan_revisions (
            id,
            plan_id,
            snapshot_json,
            changed_by_admin_id,
            reason,
            created_at
          )
          VALUES ($1, $2, $3::jsonb, $4, $5, $6)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          parsed.value.idempotencyKey
            ? uuidFromIdempotencyKey(`${parsed.value.idempotencyKey}:revision`)
            : randomUUID(),
          plan.id,
          JSON.stringify(plan),
          parsed.value.actorAdminAccountId,
          parsed.value.reason,
          parsed.value.now,
        ],
      );

      if (idempotencyRecord) {
        await store.update({
          ...idempotencyRecord,
          responseResourceType: "membership_plan",
          responseResourceId: plan.id,
          responseSnapshot: { plan },
          status: "succeeded",
          updatedAt: parsed.value.now,
        });
      }

      await deps.db.query("COMMIT");
      return { status: 200, body: { plan } };
    } catch (saveError) {
      await deps.db.query("ROLLBACK").catch(() => undefined);
      if (saveError instanceof IdempotencyConflictError) {
        return error(409, saveError.code, "Idempotency-Key has already been used with a different request");
      }
      if (saveError instanceof IdempotencyProcessingError) {
        return error(202, saveError.code, "Idempotency-Key is already processing");
      }
      if (isMembershipPlanCodeUniqueViolation(saveError)) {
        return error(409, "membership_plan_code_conflict", "membership plan code already exists");
      }
      throw saveError;
    }
  }

  async function deletePlan(input: DeleteMembershipPlanInput): Promise<MembershipPlanMutationResponse> {
    const parsed = parseDeleteInput(input);
    if ("error" in parsed) {
      return parsed.error;
    }
    if (parsed.value.idempotencyKey && !parsed.value.idempotencyOrganizationId) {
      return error(400, "idempotency_scope_required", "idempotency organization scope is required");
    }

    const store = new SqlIdempotencyRecordStore(deps.db);
    const requestHash = hashMembershipPlanDeleteRequest(parsed.value);

    try {
      await deps.db.query("BEGIN");

      let idempotencyRecord: Awaited<ReturnType<typeof beginOrReplayCommand>>["record"] | null = null;
      if (parsed.value.idempotencyKey && parsed.value.idempotencyOrganizationId) {
        const started = await beginOrReplayCommand(store, {
          organizationId: parsed.value.idempotencyOrganizationId,
          operationName: operationNames.membershipPlanDelete,
          idempotencyKey: parsed.value.idempotencyKey,
          requestHash,
        });
        if (started.kind === "replayed") {
          const replayedPlan = planFromIdempotencySnapshot(started.record.responseSnapshot)
            ?? (started.record.responseResourceId ? await getPlan(started.record.responseResourceId) : undefined);
          if (!replayedPlan) {
            throw new IdempotencyProcessingError(started.record);
          }
          await deps.db.query("COMMIT");
          return { status: 200, body: { plan: replayedPlan } };
        }
        if (started.kind === "processing") {
          throw new IdempotencyProcessingError(started.record);
        }
        idempotencyRecord = started.record;
      }

      const row = await queryOne<MembershipPlanRow>(
        deps.db,
        `
          UPDATE membership_plans
          SET status = 'archived',
              updated_by_admin_id = $2,
              updated_at = $3
          WHERE id = $1
          RETURNING *
        `,
        [parsed.value.id, parsed.value.actorAdminAccountId, parsed.value.now],
      );
      if (!row) {
        await deps.db.query("ROLLBACK");
        return error(404, "plan_not_found", "membership plan not found");
      }

      const plan = planFromRow(row);
      await deps.db.query(
        `
          INSERT INTO membership_plan_revisions (
            id,
            plan_id,
            snapshot_json,
            changed_by_admin_id,
            reason,
            created_at
          )
          VALUES ($1, $2, $3::jsonb, $4, $5, $6)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          parsed.value.idempotencyKey
            ? uuidFromIdempotencyKey(`${parsed.value.idempotencyKey}:revision`)
            : randomUUID(),
          plan.id,
          JSON.stringify(plan),
          parsed.value.actorAdminAccountId,
          parsed.value.reason,
          parsed.value.now,
        ],
      );

      if (idempotencyRecord) {
        await store.update({
          ...idempotencyRecord,
          responseResourceType: "membership_plan",
          responseResourceId: plan.id,
          responseSnapshot: { plan },
          status: "succeeded",
          updatedAt: parsed.value.now,
        });
      }

      await deps.db.query("COMMIT");
      return { status: 200, body: { plan } };
    } catch (deleteError) {
      await deps.db.query("ROLLBACK").catch(() => undefined);
      if (deleteError instanceof IdempotencyConflictError) {
        return error(409, deleteError.code, "Idempotency-Key has already been used with a different request");
      }
      if (deleteError instanceof IdempotencyProcessingError) {
        return error(202, deleteError.code, "Idempotency-Key is already processing");
      }
      throw deleteError;
    }
  }

  async function reorderPlans(input: ReorderMembershipPlansInput): Promise<MembershipPlanReorderResponse> {
    const parsed = parseReorderInput(input);
    if ("error" in parsed) {
      return parsed.error;
    }

    try {
      await deps.db.query("BEGIN");
      const updated = await deps.db.query<MembershipPlanRow>(
        `
          UPDATE membership_plans AS plan
          SET display_metadata_json = jsonb_set(
                COALESCE(plan.display_metadata_json, '{}'::jsonb),
                '{sortOrder}',
                to_jsonb(requested."sortOrder"),
                true
              ),
              updated_by_admin_id = $2,
              updated_at = $3
          FROM jsonb_to_recordset($1::jsonb) AS requested(id uuid, "sortOrder" integer)
          WHERE plan.id = requested.id
            AND plan.visibility = 'public'
          RETURNING plan.*
        `,
        [JSON.stringify(parsed.value.items), parsed.value.actorAdminAccountId, parsed.value.now],
      );
      if (updated.rows.length !== parsed.value.items.length) {
        await deps.db.query("ROLLBACK");
        return error(409, "membership_plan_reorder_conflict", "membership plan list changed; reload and try again");
      }

      for (const row of updated.rows) {
        const plan = planFromRow(row);
        await deps.db.query(
          `
            INSERT INTO membership_plan_revisions (
              id,
              plan_id,
              snapshot_json,
              changed_by_admin_id,
              reason,
              created_at
            )
            VALUES ($1, $2, $3::jsonb, $4, $5, $6)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            parsed.value.idempotencyKey
              ? uuidFromIdempotencyKey(`${parsed.value.idempotencyKey}:reorder:${plan.id}`)
              : randomUUID(),
            plan.id,
            JSON.stringify(plan),
            parsed.value.actorAdminAccountId,
            parsed.value.reason,
            parsed.value.now,
          ],
        );
      }

      await deps.db.query("COMMIT");
      return { status: 200, body: { plans: sortPlans(updated.rows.map(planFromRow)) } };
    } catch (reorderError) {
      await deps.db.query("ROLLBACK").catch(() => undefined);
      throw reorderError;
    }
  }

  return {
    deletePlan,
    listGrantablePlans,
    listPlans,
    listPurchasablePlans,
    reorderPlans,
    savePlan,
  };

  async function getPlan(id: string): Promise<MembershipPlanView | undefined> {
    const row = await queryOne<MembershipPlanRow>(
      deps.db,
      "SELECT * FROM membership_plans WHERE id = $1",
      [id],
    );
    return row ? planFromRow(row) : undefined;
  }
}

export interface SaveMembershipPlanInput {
  id?: string | null;
  code: string;
  displayName: string;
  tier: string;
  periodUnit: string;
  periodCount: number;
  amountMinor: number;
  currency: string;
  giftCredits: number;
  seatLimit?: number | null;
  entitlements?: unknown;
  priorityRules?: unknown;
  displayMetadata?: unknown;
  visibility?: string | null;
  usageScene?: string | null;
  status: string;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
  actorAdminAccountId?: string | null;
  reason: string;
  idempotencyKey?: string | null;
  idempotencyOrganizationId?: string | null;
  now: Date;
}

export interface DeleteMembershipPlanInput {
  id: string;
  actorAdminAccountId?: string | null;
  reason: string;
  idempotencyKey?: string | null;
  idempotencyOrganizationId?: string | null;
  now: Date;
}

export interface ReorderMembershipPlansInput {
  items: Array<{ id: string; sortOrder: number }>;
  actorAdminAccountId?: string | null;
  reason: string;
  idempotencyKey?: string | null;
  now: Date;
}

export interface MembershipPlanView {
  id: string;
  code: string;
  displayName: string;
  tier: string;
  periodUnit: string;
  periodCount: number;
  amountMinor: number;
  currency: string;
  giftCredits: number;
  seatLimit: number;
  entitlements: string[];
  priorityRules: Record<string, unknown>;
  displayMetadata: Record<string, unknown>;
  visibility: string;
  usageScene: string;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

type MembershipPlanSaveResponse =
  | { status: 200; body: { plan: MembershipPlanView } }
  | { status: number; body: { error: { code: string; message: string } } };

type MembershipPlanMutationResponse =
  | { status: 200; body: { plan: MembershipPlanView } }
  | { status: number; body: { error: { code: string; message: string } } };

type MembershipPlanReorderResponse =
  | { status: 200; body: { plans: MembershipPlanView[] } }
  | { status: number; body: { error: { code: string; message: string } } };

interface ParsedSaveInput {
  id: string | null;
  code: string;
  displayName: string;
  tier: string;
  periodUnit: string;
  periodCount: number;
  amountMinor: number;
  currency: string;
  giftCredits: number;
  seatLimit: number;
  entitlements: string[];
  priorityRules: Record<string, unknown>;
  displayMetadata: Record<string, unknown>;
  visibility: string;
  usageScene: string;
  status: string;
  validFrom: Date | null;
  validUntil: Date | null;
  actorAdminAccountId: string | null;
  reason: string;
  idempotencyKey: string | null;
  idempotencyOrganizationId: string | null;
  now: Date;
}

interface ParsedDeleteInput {
  id: string;
  actorAdminAccountId: string | null;
  reason: string;
  idempotencyKey: string | null;
  idempotencyOrganizationId: string | null;
  now: Date;
}

interface ParsedReorderInput {
  items: Array<{ id: string; sortOrder: number }>;
  actorAdminAccountId: string | null;
  reason: string;
  idempotencyKey: string | null;
  now: Date;
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
  visibility: string;
  usage_scene: string;
  status: string;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function parseSaveInput(input: SaveMembershipPlanInput):
  | { value: ParsedSaveInput }
  | { error: MembershipPlanSaveResponse } {
  const id = input.id?.trim() || null;
  const code = String(input.code ?? "").trim();
  const displayName = String(input.displayName ?? "").trim();
  const tier = String(input.tier ?? "").trim();
  const periodUnit = String(input.periodUnit ?? "").trim();
  const currency = String(input.currency ?? "").trim();
  const visibility = String(input.visibility ?? "public").trim();
  const usageScene = String(input.usageScene ?? "purchase").trim();
  const status = String(input.status ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  const idempotencyOrganizationId = input.idempotencyOrganizationId?.trim() || null;
  const seatLimit = input.seatLimit ?? 0;
  const validFrom = parseOptionalDate(input.validFrom);
  const validUntil = parseOptionalDate(input.validUntil);

  if (id && !isUuid(id)) return { error: error(400, "invalid_plan_id", "membership plan id is invalid") };
  if (!code) return { error: error(400, "plan_code_required", "plan code is required") };
  if (!displayName) return { error: error(400, "display_name_required", "display name is required") };
  if (!allowedTiers.has(tier)) return { error: error(400, "invalid_tier", "membership tier is invalid") };
  if (!allowedPeriodUnits.has(periodUnit)) {
    return { error: error(400, "invalid_period", "membership period is invalid") };
  }
  if (!Number.isInteger(input.periodCount) || input.periodCount <= 0) {
    return { error: error(400, "invalid_period", "membership period is invalid") };
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { error: error(400, "invalid_amount", "membership amount is invalid") };
  }
  if (!allowedCurrencies.has(currency)) {
    return { error: error(400, "invalid_currency", "membership currency is invalid") };
  }
  if (!allowedVisibilities.has(visibility)) {
    return { error: error(400, "invalid_visibility", "membership plan visibility is invalid") };
  }
  if (!allowedUsageScenes.has(usageScene)) {
    return { error: error(400, "invalid_usage_scene", "membership plan usage scene is invalid") };
  }
  if (!Number.isInteger(input.giftCredits) || input.giftCredits < 0) {
    return { error: error(400, "invalid_gift_credits", "gift credits must be a non-negative integer") };
  }
  if (!Number.isInteger(seatLimit) || seatLimit < 0) {
    return { error: error(400, "invalid_seat_limit", "seat limit must be a non-negative integer") };
  }
  if (!allowedStatuses.has(status)) {
    return { error: error(400, "invalid_status", "membership plan status is invalid") };
  }
  if (!validFrom.ok) return { error: error(400, "invalid_valid_from", "validFrom is invalid") };
  if (!validUntil.ok) return { error: error(400, "invalid_valid_until", "validUntil is invalid") };
  if (validFrom.value && validUntil.value && validUntil.value <= validFrom.value) {
    return { error: error(400, "invalid_validity_window", "validUntil must be after validFrom") };
  }
  if (!reason) return { error: error(400, "reason_required", "reason is required") };

  return {
    value: {
      id,
      code,
      displayName,
      tier,
      periodUnit,
      periodCount: input.periodCount,
      amountMinor: input.amountMinor,
      currency,
      giftCredits: input.giftCredits,
      seatLimit,
      entitlements: normalizeStringArray(input.entitlements),
      priorityRules: normalizeObject(input.priorityRules),
      displayMetadata: normalizeObject(input.displayMetadata),
      visibility,
      usageScene,
      status,
      validFrom: validFrom.value,
      validUntil: validUntil.value,
      actorAdminAccountId: input.actorAdminAccountId?.trim() || null,
      reason,
      idempotencyKey,
      idempotencyOrganizationId,
      now: input.now,
    },
  };
}

function parseDeleteInput(input: DeleteMembershipPlanInput):
  | { value: ParsedDeleteInput }
  | { error: MembershipPlanMutationResponse } {
  const id = String(input.id ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  const idempotencyOrganizationId = input.idempotencyOrganizationId?.trim() || null;

  if (!id || !isUuid(id)) return { error: error(400, "invalid_plan_id", "membership plan id is invalid") };
  if (!reason) return { error: error(400, "reason_required", "reason is required") };

  return {
    value: {
      id,
      actorAdminAccountId: input.actorAdminAccountId?.trim() || null,
      reason,
      idempotencyKey,
      idempotencyOrganizationId,
      now: input.now,
    },
  };
}

function parseReorderInput(input: ReorderMembershipPlansInput):
  | { value: ParsedReorderInput }
  | { error: MembershipPlanReorderResponse } {
  const items = Array.isArray(input.items) ? input.items : [];
  const reason = String(input.reason ?? "").trim();
  if (!items.length || items.length > 100) {
    return { error: error(400, "invalid_reorder_items", "membership reorder items are invalid") };
  }
  const normalized = items.map((item) => ({
    id: String(item?.id ?? "").trim(),
    sortOrder: Number(item?.sortOrder),
  }));
  if (normalized.some((item) => !isUuid(item.id) || !Number.isInteger(item.sortOrder) || item.sortOrder < 0)) {
    return { error: error(400, "invalid_reorder_items", "membership reorder items are invalid") };
  }
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) {
    return { error: error(400, "duplicate_reorder_items", "membership reorder items contain duplicate ids") };
  }
  if (!reason) {
    return { error: error(400, "reason_required", "reason is required") };
  }
  return {
    value: {
      items: normalized,
      actorAdminAccountId: input.actorAdminAccountId?.trim() || null,
      reason,
      idempotencyKey: input.idempotencyKey?.trim() || null,
      now: input.now,
    },
  };
}

function planFromIdempotencySnapshot(snapshot: Record<string, unknown> | undefined) {
  const plan = snapshot?.plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return undefined;
  }
  return plan as MembershipPlanView;
}

function hashMembershipPlanDeleteRequest(input: ParsedDeleteInput) {
  return hashJson({
    id: input.id,
    reason: input.reason,
  });
}

function hashMembershipPlanSaveRequest(input: ParsedSaveInput) {
  return hashJson({
    id: input.id,
    code: input.code,
    displayName: input.displayName,
    tier: input.tier,
    periodUnit: input.periodUnit,
    periodCount: input.periodCount,
    amountMinor: input.amountMinor,
    currency: input.currency,
    giftCredits: input.giftCredits,
    seatLimit: input.seatLimit,
    entitlements: input.entitlements,
    priorityRules: input.priorityRules,
    displayMetadata: input.displayMetadata,
    visibility: input.visibility,
    usageScene: input.usageScene,
    status: input.status,
    validFrom: input.validFrom?.toISOString() ?? null,
    validUntil: input.validUntil?.toISOString() ?? null,
    reason: input.reason,
  });
}

function planFromRow(row: MembershipPlanRow): MembershipPlanView {
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
    visibility: row.visibility ?? "public",
    usageScene: row.usage_scene ?? "purchase",
    status: row.status,
    validFrom: row.valid_from ? new Date(row.valid_from).toISOString() : null,
    validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function clearOtherRecommendedPlans(input: {
  db: SqlDatabase;
  planId: string;
  actorAdminAccountId: string | null;
  reason: string;
  idempotencyKey: string | null;
  now: Date;
}) {
  const cleared = await input.db.query<MembershipPlanRow>(
    `
      UPDATE membership_plans
      SET display_metadata_json = COALESCE(display_metadata_json, '{}'::jsonb) - 'isRecommended',
          updated_by_admin_id = $2,
          updated_at = $3
      WHERE id <> $1
        AND visibility = 'public'
        AND display_metadata_json ->> 'isRecommended' = 'true'
      RETURNING *
    `,
    [input.planId, input.actorAdminAccountId, input.now],
  );

  for (const row of cleared.rows) {
    const plan = planFromRow(row);
    await input.db.query(
      `
        INSERT INTO membership_plan_revisions (
          id,
          plan_id,
          snapshot_json,
          changed_by_admin_id,
          reason,
          created_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        input.idempotencyKey
          ? uuidFromIdempotencyKey(`${input.idempotencyKey}:recommendation-cleared:${plan.id}`)
          : randomUUID(),
        plan.id,
        JSON.stringify(plan),
        input.actorAdminAccountId,
        `${input.reason}（自动取消默认推荐）`,
        input.now,
      ],
    );
  }
}

function sortPlans(plans: MembershipPlanView[]) {
  return [...plans].sort((left, right) => {
    const sortOrder = numericSortOrder(left.displayMetadata) - numericSortOrder(right.displayMetadata);
    if (sortOrder !== 0) return sortOrder;
    if (left.amountMinor !== right.amountMinor) return left.amountMinor - right.amountMinor;
    return left.code.localeCompare(right.code);
  });
}

function numericSortOrder(displayMetadata: Record<string, unknown>) {
  const value = displayMetadata.sortOrder;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return Number.MAX_SAFE_INTEGER;
}

function parseOptionalDate(value: Date | string | null | undefined):
  | { ok: true; value: Date | null }
  | { ok: false } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false };
  }
  return { ok: true, value: date };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

function isMembershipPlanCodeUniqueViolation(saveError: unknown) {
  return (
    typeof saveError === "object" &&
    saveError !== null &&
    "code" in saveError &&
    (saveError as { code?: unknown; constraint?: unknown }).code === "23505" &&
    (saveError as { constraint?: unknown }).constraint === "membership_plans_code_key"
  );
}

function error(status: number, code: string, message: string): MembershipPlanSaveResponse {
  return {
    status,
    body: { error: { code, message } },
  };
}
