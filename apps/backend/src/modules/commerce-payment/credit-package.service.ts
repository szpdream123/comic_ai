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

const allowedStatuses = new Set(["active", "inactive", "archived"]);
const allowedCurrencies = new Set(["CNY"]);

export function createCreditPackageService(deps: { db: SqlDatabase }) {
  async function listPackages(input: { includeArchived?: boolean; now: Date }) {
    const result = await deps.db.query<CreditPackageConfigRow>(
      `
        SELECT *
        FROM credit_packages
        WHERE ($1::boolean = true OR status <> 'archived')
        ORDER BY sort_order ASC, amount_minor ASC, code ASC
      `,
      [input.includeArchived === true],
    );
    return { data: { packages: result.rows.map(packageFromRow) } };
  }

  async function savePackage(input: SaveCreditPackageInput): Promise<CreditPackageSaveResponse> {
    const parsed = parseSaveInput(input);
    if ("error" in parsed) {
      return parsed.error;
    }
    if (parsed.value.idempotencyKey && !parsed.value.idempotencyOrganizationId) {
      return error(400, "idempotency_scope_required", "idempotency organization scope is required");
    }

    const store = new SqlIdempotencyRecordStore(deps.db);
    const requestHash = hashCreditPackageSaveRequest(parsed.value);
    try {
      await deps.db.query("BEGIN");

      let idempotencyRecord: Awaited<ReturnType<typeof beginOrReplayCommand>>["record"] | null = null;
      if (parsed.value.idempotencyKey && parsed.value.idempotencyOrganizationId) {
        const started = await beginOrReplayCommand(store, {
          organizationId: parsed.value.idempotencyOrganizationId,
          operationName: operationNames.creditPackageSave,
          idempotencyKey: parsed.value.idempotencyKey,
          requestHash,
        });
        if (started.kind === "replayed") {
          const replayedPackage = packageFromIdempotencySnapshot(started.record.responseSnapshot)
            ?? (started.record.responseResourceId ? await getPackage(started.record.responseResourceId) : undefined);
          if (!replayedPackage) {
            throw new IdempotencyProcessingError(started.record);
          }
          await deps.db.query("COMMIT");
          return { status: 200, body: { package: replayedPackage } };
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
          FROM credit_packages
          WHERE code = $1
            AND ($2::uuid IS NULL OR id <> $2)
          LIMIT 1
        `,
        [parsed.value.code, parsed.value.id],
      );
      if (conflictingCode) {
        await deps.db.query("ROLLBACK");
        return error(409, "credit_package_code_conflict", "credit package code already exists");
      }

      const packageId = parsed.value.id ?? (
        parsed.value.idempotencyKey
          ? uuidFromHash(`${parsed.value.idempotencyKey}:credit-package`)
          : randomUUID()
      );
      const row = await queryOne<CreditPackageConfigRow>(
        deps.db,
        `
          INSERT INTO credit_packages (
            id,
            code,
            display_name,
            subtitle,
            credits,
            gift_credits,
            amount_minor,
            currency,
            badge,
            sort_order,
            metadata_json,
            status,
            valid_from,
            valid_until,
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
            $12,
            $13,
            $14,
            $15,
            $15
          )
          ON CONFLICT (id)
          DO UPDATE SET
            code = EXCLUDED.code,
            display_name = EXCLUDED.display_name,
            subtitle = EXCLUDED.subtitle,
            credits = EXCLUDED.credits,
            gift_credits = EXCLUDED.gift_credits,
            amount_minor = EXCLUDED.amount_minor,
            currency = EXCLUDED.currency,
            badge = EXCLUDED.badge,
            sort_order = EXCLUDED.sort_order,
            metadata_json = EXCLUDED.metadata_json,
            status = EXCLUDED.status,
            valid_from = EXCLUDED.valid_from,
            valid_until = EXCLUDED.valid_until,
            updated_at = EXCLUDED.updated_at
          RETURNING *
        `,
        [
          packageId,
          parsed.value.code,
          parsed.value.displayName,
          parsed.value.subtitle,
          parsed.value.credits,
          parsed.value.giftCredits,
          parsed.value.amountMinor,
          parsed.value.currency,
          parsed.value.badge,
          parsed.value.sortOrder,
          JSON.stringify(parsed.value.metadata),
          parsed.value.status,
          parsed.value.validFrom,
          parsed.value.validUntil,
          parsed.value.now,
        ],
      );
      const creditPackage = packageFromRow(row!);

      if (idempotencyRecord) {
        await store.update({
          ...idempotencyRecord,
          responseResourceType: "credit_package",
          responseResourceId: creditPackage.id,
          responseSnapshot: { package: creditPackage },
          status: "succeeded",
          updatedAt: parsed.value.now,
        });
      }

      await deps.db.query("COMMIT");
      return { status: 200, body: { package: creditPackage } };
    } catch (saveError) {
      await deps.db.query("ROLLBACK").catch(() => undefined);
      if (saveError instanceof IdempotencyConflictError) {
        return error(409, saveError.code, "Idempotency-Key has already been used with a different request");
      }
      if (saveError instanceof IdempotencyProcessingError) {
        return error(202, saveError.code, "Idempotency-Key is already processing");
      }
      if (isCreditPackageCodeUniqueViolation(saveError)) {
        return error(409, "credit_package_code_conflict", "credit package code already exists");
      }
      throw saveError;
    }
  }

  async function deletePackage(input: DeleteCreditPackageInput): Promise<CreditPackageMutationResponse> {
    const parsed = parseDeleteInput(input);
    if ("error" in parsed) {
      return parsed.error;
    }
    if (parsed.value.idempotencyKey && !parsed.value.idempotencyOrganizationId) {
      return error(400, "idempotency_scope_required", "idempotency organization scope is required");
    }

    const store = new SqlIdempotencyRecordStore(deps.db);
    const requestHash = hashCreditPackageDeleteRequest(parsed.value);

    try {
      await deps.db.query("BEGIN");

      let idempotencyRecord: Awaited<ReturnType<typeof beginOrReplayCommand>>["record"] | null = null;
      if (parsed.value.idempotencyKey && parsed.value.idempotencyOrganizationId) {
        const started = await beginOrReplayCommand(store, {
          organizationId: parsed.value.idempotencyOrganizationId,
          operationName: operationNames.creditPackageDelete,
          idempotencyKey: parsed.value.idempotencyKey,
          requestHash,
        });
        if (started.kind === "replayed") {
          const replayedPackage = packageFromIdempotencySnapshot(started.record.responseSnapshot)
            ?? (started.record.responseResourceId ? await getPackage(started.record.responseResourceId) : undefined);
          if (!replayedPackage) {
            throw new IdempotencyProcessingError(started.record);
          }
          await deps.db.query("COMMIT");
          return { status: 200, body: { package: replayedPackage } };
        }
        if (started.kind === "processing") {
          throw new IdempotencyProcessingError(started.record);
        }
        idempotencyRecord = started.record;
      }

      const row = await queryOne<CreditPackageConfigRow>(
        deps.db,
        `
          UPDATE credit_packages
          SET status = 'archived',
              updated_at = $2
          WHERE id = $1
            AND ($3::text IS NULL OR metadata_json->>'kind' = $3)
          RETURNING *
        `,
        [parsed.value.id, parsed.value.now, parsed.value.metadataKind],
      );
      if (!row) {
        await deps.db.query("ROLLBACK");
        return error(404, "credit_package_not_found", "credit package not found");
      }

      const creditPackage = packageFromRow(row);
      if (idempotencyRecord) {
        await store.update({
          ...idempotencyRecord,
          responseResourceType: "credit_package",
          responseResourceId: creditPackage.id,
          responseSnapshot: { package: creditPackage },
          status: "succeeded",
          updatedAt: parsed.value.now,
        });
      }

      await deps.db.query("COMMIT");
      return { status: 200, body: { package: creditPackage } };
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

  return {
    deletePackage,
    listPackages,
    savePackage,
  };

  async function getPackage(id: string): Promise<CreditPackageConfigView | undefined> {
    const row = await queryOne<CreditPackageConfigRow>(
      deps.db,
      "SELECT * FROM credit_packages WHERE id = $1",
      [id],
    );
    return row ? packageFromRow(row) : undefined;
  }
}

export interface SaveCreditPackageInput {
  id?: string | null;
  code: string;
  displayName: string;
  subtitle?: string | null;
  credits: number;
  giftCredits: number;
  amountMinor: number;
  currency: string;
  badge?: string | null;
  sortOrder?: number | null;
  metadata?: unknown;
  status: string;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
  actorAdminAccountId?: string | null;
  idempotencyKey?: string | null;
  idempotencyOrganizationId?: string | null;
  now: Date;
}

export interface DeleteCreditPackageInput {
  id: string;
  metadataKind?: string | null;
  idempotencyKey?: string | null;
  idempotencyOrganizationId?: string | null;
  now: Date;
}

export interface CreditPackageConfigView {
  id: string;
  code: string;
  displayName: string;
  subtitle: string | null;
  baseCredits: number;
  giftCredits: number;
  credits: number;
  amountMinor: number;
  currency: string;
  badge: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

type CreditPackageSaveResponse =
  | { status: 200; body: { package: CreditPackageConfigView } }
  | { status: number; body: { error: { code: string; message: string } } };

type CreditPackageMutationResponse =
  | { status: 200; body: { package: CreditPackageConfigView } }
  | { status: number; body: { error: { code: string; message: string } } };

interface ParsedSaveInput {
  id: string | null;
  code: string;
  displayName: string;
  subtitle: string | null;
  credits: number;
  giftCredits: number;
  amountMinor: number;
  currency: string;
  badge: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
  status: string;
  validFrom: Date | null;
  validUntil: Date | null;
  actorAdminAccountId: string | null;
  idempotencyKey: string | null;
  idempotencyOrganizationId: string | null;
  now: Date;
}

interface ParsedDeleteInput {
  id: string;
  metadataKind: string | null;
  idempotencyKey: string | null;
  idempotencyOrganizationId: string | null;
  now: Date;
}

interface CreditPackageConfigRow {
  id: string;
  code: string;
  display_name: string;
  subtitle: string | null;
  credits: number;
  gift_credits: number;
  amount_minor: number;
  currency: string;
  badge: string | null;
  sort_order: number;
  metadata_json: unknown;
  status: string;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function parseSaveInput(input: SaveCreditPackageInput):
  | { value: ParsedSaveInput }
  | { error: CreditPackageSaveResponse } {
  const id = input.id?.trim() || null;
  const code = String(input.code ?? "").trim();
  const displayName = String(input.displayName ?? "").trim();
  const subtitle = normalizeNullableText(input.subtitle);
  const currency = String(input.currency ?? "").trim();
  const badge = normalizeNullableText(input.badge);
  const status = String(input.status ?? "").trim();
  const validFrom = parseOptionalDate(input.validFrom);
  const validUntil = parseOptionalDate(input.validUntil);
  const sortOrder = input.sortOrder ?? 100;
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  const idempotencyOrganizationId = input.idempotencyOrganizationId?.trim() || null;

  if (id && !isUuid(id)) return { error: error(400, "invalid_credit_package_id", "credit package id is invalid") };
  if (!code) return { error: error(400, "credit_package_code_required", "credit package code is required") };
  if (!displayName) return { error: error(400, "display_name_required", "display name is required") };
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    return { error: error(400, "invalid_credits", "credits must be a positive integer") };
  }
  if (!Number.isInteger(input.giftCredits) || input.giftCredits < 0) {
    return { error: error(400, "invalid_gift_credits", "gift credits must be a non-negative integer") };
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { error: error(400, "invalid_amount", "amount must be a positive integer") };
  }
  if (!allowedCurrencies.has(currency)) {
    return { error: error(400, "invalid_currency", "currency is invalid") };
  }
  if (!Number.isInteger(sortOrder)) {
    return { error: error(400, "invalid_sort_order", "sort order must be an integer") };
  }
  if (!allowedStatuses.has(status)) {
    return { error: error(400, "invalid_status", "credit package status is invalid") };
  }
  if (!validFrom.ok) return { error: error(400, "invalid_valid_from", "validFrom is invalid") };
  if (!validUntil.ok) return { error: error(400, "invalid_valid_until", "validUntil is invalid") };
  if (validFrom.value && validUntil.value && validUntil.value <= validFrom.value) {
    return { error: error(400, "invalid_validity_window", "validUntil must be after validFrom") };
  }

  return {
    value: {
      id,
      code,
      displayName,
      subtitle,
      credits: input.credits,
      giftCredits: input.giftCredits,
      amountMinor: input.amountMinor,
      currency,
      badge,
      sortOrder,
      metadata: normalizeObject(input.metadata),
      status,
      validFrom: validFrom.value,
      validUntil: validUntil.value,
      actorAdminAccountId: input.actorAdminAccountId?.trim() || null,
      idempotencyKey,
      idempotencyOrganizationId,
      now: input.now,
    },
  };
}

function parseDeleteInput(input: DeleteCreditPackageInput):
  | { value: ParsedDeleteInput }
  | { error: CreditPackageMutationResponse } {
  const id = String(input.id ?? "").trim();
  const metadataKind = normalizeNullableText(input.metadataKind);
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  const idempotencyOrganizationId = input.idempotencyOrganizationId?.trim() || null;

  if (!id || !isUuid(id)) {
    return { error: error(400, "invalid_credit_package_id", "credit package id is invalid") };
  }

  return {
    value: {
      id,
      metadataKind,
      idempotencyKey,
      idempotencyOrganizationId,
      now: input.now,
    },
  };
}

function packageFromIdempotencySnapshot(snapshot: Record<string, unknown> | undefined) {
  const creditPackage = snapshot?.package;
  if (!creditPackage || typeof creditPackage !== "object" || Array.isArray(creditPackage)) {
    return undefined;
  }
  return creditPackage as CreditPackageConfigView;
}

function hashCreditPackageDeleteRequest(input: ParsedDeleteInput) {
  return hashJson({
    id: input.id,
    metadataKind: input.metadataKind,
  });
}

function hashCreditPackageSaveRequest(input: ParsedSaveInput) {
  return hashJson({
    id: input.id,
    code: input.code,
    displayName: input.displayName,
    subtitle: input.subtitle,
    credits: input.credits,
    giftCredits: input.giftCredits,
    amountMinor: input.amountMinor,
    currency: input.currency,
    badge: input.badge,
    sortOrder: input.sortOrder,
    metadata: input.metadata,
    status: input.status,
    validFrom: input.validFrom?.toISOString() ?? null,
    validUntil: input.validUntil?.toISOString() ?? null,
  });
}

function packageFromRow(row: CreditPackageConfigRow): CreditPackageConfigView {
  const metadata = normalizeObject(normalizeJson(row.metadata_json));
  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    subtitle: row.subtitle,
    baseCredits: row.credits,
    giftCredits: row.gift_credits,
    credits: row.credits + row.gift_credits,
    amountMinor: row.amount_minor,
    currency: row.currency,
    badge: row.badge,
    sortOrder: row.sort_order,
    metadata,
    status: row.status,
    validFrom: row.valid_from ? new Date(row.valid_from).toISOString() : null,
    validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
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

function normalizeNullableText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
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

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeJson(value)))
    .digest("hex");
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeJson(item)]),
    );
  }
  return value;
}

function uuidFromHash(key: string) {
  const hex = createHash("sha256").update(key).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isCreditPackageCodeUniqueViolation(saveError: unknown) {
  return (
    typeof saveError === "object" &&
    saveError !== null &&
    "code" in saveError &&
    (saveError as { code?: unknown; constraint?: unknown }).code === "23505" &&
    (saveError as { constraint?: unknown }).constraint === "credit_packages_code_key"
  );
}

function error(status: number, code: string, message: string): CreditPackageSaveResponse {
  return {
    status,
    body: { error: { code, message } },
  };
}
