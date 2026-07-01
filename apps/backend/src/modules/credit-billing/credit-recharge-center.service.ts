import { randomUUID } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import {
  resolveActorContext,
  type ActorContext,
} from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { CreditLedgerEntryRecord } from "./credit-ledger.service.ts";

interface AuthenticatedRechargeUser {
  sessionToken: string;
}

interface AccountWalletRow {
  id: string;
  display_name: string | null;
  credit_balance_cached: number;
  credit_reserved_cached: number;
}

interface SubaccountCandidateRow {
  id: string;
  compatibility_organization_id: string;
  member_name: string;
  member_credits: number;
  workspace_id: string;
  role: ActorContext["role"];
  member_count: number;
  team_entitlement_active: boolean;
}

interface TransferRow {
  id: string;
  source_organization_id: string;
  target_organization_id: string;
  operator_user_id: string;
  amount: number;
  status: "succeeded" | "failed";
  source_ledger_entry_id: string | null;
  target_ledger_entry_id: string | null;
  idempotency_key: string;
  failure_code: string | null;
  metadata_json: Record<string, unknown> | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export class CreditRechargeCenterError extends Error {
  constructor(
    readonly code:
      | "invalid_transfer_input"
      | "team_transfer_permission_missing"
      | "real_team_not_found"
      | "insufficient_personal_credits"
      | "transfer_replay_conflict",
  ) {
    super(code);
  }
}

export function createCreditRechargeCenterService(deps: {
  db: SqlDatabase;
  workspaceId: string;
}) {
  return {
    async getRechargeCenter(input: {
      user: AuthenticatedRechargeUser;
      now: Date;
    }) {
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        workspaceId: deps.workspaceId,
        now: input.now,
      });
      const summary = await buildRechargeSummary(deps.db, {
        actor,
        now: input.now,
      });

      return {
        status: 200,
        body: summary,
      };
    },

    async transferToTeamPool(input: {
      user: AuthenticatedRechargeUser;
      body: { amount?: unknown };
      idempotencyKey: string;
      now: Date;
    }) {
      const amount = normalizePositiveInteger(input.body.amount);
      const idempotencyKey = input.idempotencyKey.trim();
      if (!amount || !idempotencyKey) {
        throw new CreditRechargeCenterError("invalid_transfer_input");
      }

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        workspaceId: deps.workspaceId,
        now: input.now,
      });
      const team = await resolveRealTeamCandidate(deps.db, {
        actorId: actor.actorId,
        compatibilityOrganizationId: actor.organizationId,
        now: input.now,
      });
      if (!team) {
        throw new CreditRechargeCenterError("real_team_not_found");
      }
      if (!canTransferToTeamPool(actor, team)) {
        throw new CreditRechargeCenterError("team_transfer_permission_missing");
      }

      await deps.db.query("BEGIN");
      try {
        const existing = await findExistingTransfer(deps.db, {
          sourceOrganizationId: actor.organizationId,
          operatorUserId: actor.actorId,
          idempotencyKey,
        });
        if (existing) {
          if (
            existing.amount !== amount ||
            existing.target_organization_id !== team.compatibility_organization_id
          ) {
            throw new CreditRechargeCenterError("transfer_replay_conflict");
          }
          await deps.db.query("COMMIT");
          const summary = await buildRechargeSummary(deps.db, {
            actor,
            now: input.now,
          });
          return {
            status: 200,
            body: {
              transfer: transferViewFromRow(existing),
              transferEligibility: summary.transfer,
              wallets: summary.wallets,
            },
          };
        }

        await lockSubaccountWalletForUpdate(deps.db, {
          userId: actor.actorId,
          subaccountId: team.id,
        });
        const personalWallet = await getPersonalWalletForUpdate(deps.db, actor.actorId);
        const personalAvailable = availableCredits(personalWallet);
        if (personalAvailable < amount) {
          throw new CreditRechargeCenterError("insufficient_personal_credits");
        }

        const transferId = randomUUID();
        const transfer = await insertSucceededTransfer(deps.db, {
          transferId,
          sourceOrganizationId: actor.organizationId,
          targetOrganizationId: team.compatibility_organization_id,
          operatorUserId: actor.actorId,
          amount,
          targetSubaccountId: team.id,
          idempotencyKey,
          now: input.now,
        });
        const ledger = await transferCreditsFromAccountToSubaccount(deps.db, {
          sourceCompatibilityOrganizationId: actor.organizationId,
          targetCompatibilityOrganizationId: team.compatibility_organization_id,
          sourceUserId: actor.actorId,
          targetSubaccountId: team.id,
          amount,
          sourceId: transferId,
          reason: "个人积分转入团队积分池",
          createdByUserId: actor.actorId,
          metadata: {
            sourceAccountId: actor.actorId,
            targetSubaccountId: team.id,
            idempotencyKey,
          },
          now: input.now,
        });
        const completed = await attachTransferLedgerEntries(deps.db, {
          transferId,
          ledger,
          now: input.now,
        });

        await deps.db.query("COMMIT");
        const summary = await buildRechargeSummary(deps.db, {
          actor,
          now: input.now,
        });
        return {
          status: 200,
          body: {
            transfer: transferViewFromRow(completed),
            transferEligibility: summary.transfer,
            wallets: summary.wallets,
          },
        };
      } catch (error) {
        await deps.db.query("ROLLBACK");
        throw error;
      }
    },
  };
}

async function buildRechargeSummary(
  db: SqlDatabase,
  input: { actor: ActorContext; now: Date },
) {
  const personal = await getPersonalWallet(db, input.actor.actorId);
  const team = await resolveRealTeamCandidate(db, {
    actorId: input.actor.actorId,
    compatibilityOrganizationId: input.actor.organizationId,
    now: input.now,
  });
  const canTransfer =
    Boolean(team) &&
    canTransferToTeamPool(input.actor, team!) &&
    availableCredits(personal) > 0;

  return {
    wallets: {
      personal: walletView(personal),
      subaccount: team ? walletView(team) : null,
    },
    transfer: {
      canTransferToTeamPool: canTransfer,
      reason: canTransfer
        ? null
        : transferUnavailableReason(input.actor, team, personal),
    },
  };
}

async function getPersonalWallet(db: SqlDatabase, userId: string) {
  const wallet = await queryOne<AccountWalletRow>(
    db,
    `
      SELECT id, display_name, credit_balance_cached, credit_reserved_cached
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );
  if (!wallet) {
    throw new CreditRechargeCenterError("invalid_transfer_input");
  }
  return wallet;
}

async function getPersonalWalletForUpdate(db: SqlDatabase, userId: string) {
  const wallet = await queryOne<AccountWalletRow>(
    db,
    `
      SELECT id, display_name, credit_balance_cached, credit_reserved_cached
      FROM users
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [userId],
  );
  if (!wallet) {
    throw new CreditRechargeCenterError("invalid_transfer_input");
  }
  return wallet;
}

async function resolveRealTeamCandidate(
  db: SqlDatabase,
  input: {
    actorId: string;
    compatibilityOrganizationId: string;
    now: Date;
  },
) {
  const team = await queryOne<SubaccountCandidateRow>(
    db,
    `
      SELECT
        member.id,
        memberships.organization_id AS compatibility_organization_id,
        member.member_name,
        member.member_credits,
        workspaces.id AS workspace_id,
        memberships.role,
        (
          SELECT COUNT(*)::int
          FROM team_members member
          WHERE member.user_id = $1
            AND member.status = 'active'
        ) AS member_count,
        EXISTS (
          SELECT id
          FROM organization_entitlements entitlement
          WHERE entitlement.organization_id = memberships.organization_id
            AND entitlement.entitlement_key = 'team_member_management'
            AND entitlement.status = 'active'
            AND entitlement.source IS DISTINCT FROM 'payment'
            AND (entitlement.expires_at IS NULL OR entitlement.expires_at > $3)
          UNION ALL
          SELECT period.id
          FROM membership_periods period
          WHERE period.organization_id = memberships.organization_id
            AND period.tier = 'professional'
            AND period.status = 'active'
            AND period.period_end_at > $3
            AND (period.plan_snapshot_json -> 'entitlements') ? 'team_member_management'
          LIMIT 1
        ) AS team_entitlement_active
      FROM memberships
      JOIN workspaces
        ON workspaces.organization_id = memberships.organization_id
       AND workspaces.id = memberships.workspace_id
      JOIN team_members member
        ON member.user_id = memberships.user_id
       AND member.status = 'active'
       AND member.deleted_at IS NULL
      WHERE memberships.user_id = $1
        AND memberships.status = 'active'
        AND memberships.role IN ('owner_admin', 'producer', 'creator')
        AND workspaces.status = 'active'
        AND memberships.organization_id <> $2
      ORDER BY memberships.role = 'owner_admin' DESC, workspaces.created_at ASC
      LIMIT 1
    `,
    [input.actorId, input.compatibilityOrganizationId, input.now],
  );

  if (!team || !team.team_entitlement_active || Number(team.member_count) <= 0) {
    return null;
  }
  return team;
}

function canTransferToTeamPool(actor: ActorContext, team: SubaccountCandidateRow) {
  void team;
  if (actor.teamMember) return false;
  return team.role === "owner_admin";
}

function transferUnavailableReason(
  actor: ActorContext,
  team: SubaccountCandidateRow | null,
  personal: AccountWalletRow,
) {
  if (!team) return "no_real_team";
  if (!canTransferToTeamPool(actor, team)) return "permission_missing";
  if (availableCredits(personal) <= 0) return "no_personal_credits";
  return "unavailable";
}

function accountWalletView(row: AccountWalletRow) {
  return {
    accountId: row.id,
    name: row.display_name,
    availableCredits: availableCredits(row),
    reservedCredits: Number(row.credit_reserved_cached ?? 0),
  };
}

function subaccountWalletView(row: SubaccountCandidateRow) {
  return {
    subaccountId: row.id,
    name: row.member_name,
    availableCredits: Number(row.member_credits ?? 0),
    reservedCredits: 0,
  };
}

function walletView(row: AccountWalletRow | SubaccountCandidateRow) {
  return "member_credits" in row ? subaccountWalletView(row) : accountWalletView(row);
}

function availableCredits(row: AccountWalletRow) {
  return Math.max(
    0,
    Number(row.credit_balance_cached ?? 0) - Number(row.credit_reserved_cached ?? 0),
  );
}

function normalizePositiveInteger(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return null;
  }
  return numberValue;
}

async function lockSubaccountWalletForUpdate(
  db: SqlDatabase,
  input: { userId: string; subaccountId: string },
) {
  await db.query(
    `
      SELECT id
      FROM team_members
      WHERE user_id = $1
        AND id = $2
      FOR UPDATE
    `,
    [input.userId, input.subaccountId],
  );
}

async function findExistingTransfer(
  db: SqlDatabase,
  input: {
    sourceOrganizationId: string;
    operatorUserId: string;
    idempotencyKey: string;
  },
) {
  return queryOne<TransferRow>(
    db,
    `
      SELECT *
      FROM credit_wallet_transfers
      WHERE source_organization_id = $1
        AND operator_user_id = $2
        AND idempotency_key = $3
      LIMIT 1
      FOR UPDATE
    `,
    [
      input.sourceOrganizationId,
      input.operatorUserId,
      input.idempotencyKey,
    ],
  );
}

async function insertSucceededTransfer(
  db: SqlDatabase,
  input: {
    transferId: string;
    sourceOrganizationId: string;
    targetOrganizationId: string;
    targetSubaccountId: string;
    operatorUserId: string;
    amount: number;
    idempotencyKey: string;
    now: Date;
  },
) {
  return queryOne<TransferRow>(
    db,
    `
      INSERT INTO credit_wallet_transfers (
        id,
        source_organization_id,
        target_organization_id,
        operator_user_id,
        amount,
        status,
        idempotency_key,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'succeeded', $6, $7::jsonb, $8, $8)
      RETURNING *
    `,
    [
      input.transferId,
      input.sourceOrganizationId,
      input.targetOrganizationId,
      input.operatorUserId,
      input.amount,
      input.idempotencyKey,
      JSON.stringify({
        flow: "account_to_subaccount",
        sourceAccountId: input.operatorUserId,
        targetSubaccountId: input.targetSubaccountId,
      }),
      input.now,
    ],
  ).then((row) => row!);
}

async function transferCreditsFromAccountToSubaccount(
  db: SqlDatabase,
  input: {
    sourceCompatibilityOrganizationId: string;
    targetCompatibilityOrganizationId: string;
    sourceUserId: string;
    targetSubaccountId: string;
    amount: number;
    sourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    createdByUserId: string;
    now: Date;
  },
) {
  const sourceLedgerEntry = await insertTransferLedgerEntry(db, {
    compatibilityOrganizationId: input.sourceCompatibilityOrganizationId,
    userId: input.sourceUserId,
    entryType: "transfer_out",
    amount: input.amount,
    availableDelta: -input.amount,
    sourceId: input.sourceId,
    reason: input.reason,
    metadata: input.metadata,
    createdByUserId: input.createdByUserId,
    now: input.now,
  });
  const targetLedgerEntry = await insertTransferLedgerEntry(db, {
    compatibilityOrganizationId: input.targetCompatibilityOrganizationId,
    userId: input.sourceUserId,
    entryType: "transfer_in",
    amount: input.amount,
    availableDelta: input.amount,
    sourceId: input.sourceId,
    reason: input.reason,
    metadata: input.metadata,
    createdByUserId: input.createdByUserId,
    now: input.now,
  });

  const debited = await queryOne<{ id: string }>(
    db,
    `
      UPDATE users
      SET credit_balance_cached = credit_balance_cached - $2,
          updated_at = $3
      WHERE id = $1
        AND credit_balance_cached - credit_reserved_cached >= $2
      RETURNING id
    `,
    [input.sourceUserId, input.amount, input.now],
  );
  if (!debited) {
    throw new CreditRechargeCenterError("insufficient_personal_credits");
  }

  const credited = await queryOne<{ id: string }>(
    db,
    `
      UPDATE team_members
      SET member_credits = member_credits + $2,
          updated_at = $3
      WHERE id = $1
        AND status = 'active'
        AND deleted_at IS NULL
      RETURNING id
    `,
    [input.targetSubaccountId, input.amount, input.now],
  );
  if (!credited) {
    throw new CreditRechargeCenterError("real_team_not_found");
  }

  return { sourceLedgerEntry, targetLedgerEntry };
}

async function insertTransferLedgerEntry(
  db: SqlDatabase,
  input: {
    compatibilityOrganizationId: string;
    userId: string;
    entryType: "transfer_in" | "transfer_out";
    amount: number;
    availableDelta: number;
    sourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    createdByUserId: string;
    now: Date;
  },
): Promise<CreditLedgerEntryRecord> {
  const row = await queryOne<{
    id: string;
    organization_id: string;
    user_id: string | null;
    reservation_id: string | null;
    allocation_id: string | null;
    entry_type: "transfer_in" | "transfer_out";
    amount: number;
    available_delta: number;
    reserved_delta: number;
    consumed_delta: number;
    source_type: string;
    source_id: string;
    reason: string | null;
    metadata_json: Record<string, unknown> | string;
    created_by_user_id: string | null;
    created_at: Date | string;
  }>(
    db,
    `
      INSERT INTO credit_ledger_entries (
        id,
        organization_id,
        user_id,
        reservation_id,
        allocation_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, 0, 0, 'credit_wallet_transfer', $7, $8, $9::jsonb, $10, $11)
      RETURNING *
    `,
    [
      randomUUID(),
      input.compatibilityOrganizationId,
      input.userId,
      input.entryType,
      input.amount,
      input.availableDelta,
      input.sourceId,
      input.reason,
      JSON.stringify(input.metadata),
      input.createdByUserId,
      input.now,
    ],
  );
  if (!row) {
    throw new CreditRechargeCenterError("transfer_replay_conflict");
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    reservationId: row.reservation_id,
    allocationId: row.allocation_id,
    entryType: row.entry_type,
    amount: row.amount,
    availableDelta: row.available_delta,
    reservedDelta: row.reserved_delta,
    consumedDelta: row.consumed_delta,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    metadata: normalizeJson(row.metadata_json),
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
  };
}

async function attachTransferLedgerEntries(
  db: SqlDatabase,
  input: {
    transferId: string;
    ledger: {
      sourceLedgerEntry: CreditLedgerEntryRecord;
      targetLedgerEntry: CreditLedgerEntryRecord;
    };
    now: Date;
  },
) {
  return queryOne<TransferRow>(
    db,
    `
      UPDATE credit_wallet_transfers
      SET source_ledger_entry_id = $2,
          target_ledger_entry_id = $3,
          updated_at = $4
      WHERE id = $1
      RETURNING *
    `,
    [
      input.transferId,
      input.ledger.sourceLedgerEntry.id,
      input.ledger.targetLedgerEntry.id,
      input.now,
    ],
  ).then((row) => row!);
}

function transferViewFromRow(row: TransferRow) {
  const metadata = normalizeJson(row.metadata_json);
  return {
    id: row.id,
    sourceAccountId: String(metadata.sourceAccountId ?? row.operator_user_id),
    targetSubaccountId: String(metadata.targetSubaccountId ?? ""),
    operatorUserId: row.operator_user_id,
    amount: row.amount,
    status: row.status,
    sourceLedgerEntryId: row.source_ledger_entry_id,
    targetLedgerEntryId: row.target_ledger_entry_id,
    idempotencyKey: row.idempotency_key,
    failureCode: row.failure_code,
    metadata,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function normalizeJson(value: Record<string, unknown> | string | null) {
  if (!value) return {};
  return typeof value === "string" ? JSON.parse(value) : value;
}
