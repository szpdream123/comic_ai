import { randomUUID } from "node:crypto";

import {
  resolveUserActorContext,
  type UserActorContext,
} from "../identity/user-actor-context.service.ts";
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
  member_name: string;
  member_credits: number;
}

interface TransferRow {
  id: string;
  source_user_id: string;
  target_team_member_id: string;
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
}) {
  return {
    async getRechargeCenter(input: {
      user: AuthenticatedRechargeUser;
      now: Date;
    }) {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
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

      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        now: input.now,
      });
      const team = await resolveRealTeamCandidate(deps.db, {
        actorId: actor.userId,
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
          sourceUserId: actor.userId,
          operatorUserId: actor.userId,
          idempotencyKey,
        });
        if (existing) {
          if (
            existing.amount !== amount ||
            existing.target_team_member_id !== team.id
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
          userId: actor.userId,
          subaccountId: team.id,
        });
        const personalWallet = await getPersonalWalletForUpdate(deps.db, actor.userId);
        const personalAvailable = availableCredits(personalWallet);
        if (personalAvailable < amount) {
          throw new CreditRechargeCenterError("insufficient_personal_credits");
        }

        const transferId = randomUUID();
        const transfer = await insertSucceededTransfer(deps.db, {
          transferId,
          sourceUserId: actor.userId,
          operatorUserId: actor.userId,
          amount,
          targetSubaccountId: team.id,
          idempotencyKey,
          now: input.now,
        });
        const ledger = await transferCreditsFromAccountToSubaccount(deps.db, {
          sourceUserId: actor.userId,
          targetSubaccountId: team.id,
          amount,
          sourceId: transferId,
          reason: "个人积分转入团队积分池",
          createdByUserId: actor.userId,
          metadata: {
            sourceAccountId: actor.userId,
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
  input: { actor: UserActorContext; now: Date },
) {
  const personal = await getPersonalWallet(db, input.actor.userId);
  const team = await resolveRealTeamCandidate(db, {
    actorId: input.actor.userId,
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
    now: Date;
  },
) {
  const team = await queryOne<SubaccountCandidateRow>(
    db,
    `
      SELECT
        member.id,
        member.member_name,
        member.member_credits
      FROM team_members member
      WHERE member.user_id = $1
        AND member.status = 'active'
        AND member.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM membership_periods period
          JOIN billing_orders billing_order ON billing_order.id = period.order_id
          WHERE billing_order.created_by_user_id = $1
            AND period.tier = 'professional'
            AND period.status = 'active'
            AND period.period_end_at > $2
            AND (period.plan_snapshot_json -> 'entitlements') ? 'team_member_management'
        )
      ORDER BY member.created_at ASC
      LIMIT 1
    `,
    [input.actorId, input.now],
  );

  return team ?? null;
}

function canTransferToTeamPool(actor: UserActorContext, team: SubaccountCandidateRow) {
  void team;
  return !actor.teamMember;
}

function transferUnavailableReason(
  actor: UserActorContext,
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
    sourceUserId: string;
    operatorUserId: string;
    idempotencyKey: string;
  },
) {
  return queryOne<TransferRow>(
    db,
    `
      SELECT *
      FROM credit_wallet_transfers
      WHERE source_user_id = $1
        AND operator_user_id = $2
        AND idempotency_key = $3
      LIMIT 1
      FOR UPDATE
    `,
    [
      input.sourceUserId,
      input.operatorUserId,
      input.idempotencyKey,
    ],
  );
}

async function insertSucceededTransfer(
  db: SqlDatabase,
  input: {
    transferId: string;
    sourceUserId: string;
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
        source_user_id,
        target_team_member_id,
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
      input.sourceUserId,
      input.targetSubaccountId,
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
  const sourceWallet = await queryOne<{ credit_balance_cached: number | string }>(
    db,
    "SELECT credit_balance_cached FROM users WHERE id = $1 FOR UPDATE",
    [input.sourceUserId],
  );
  const targetWallet = await queryOne<{ member_credits: number | string }>(
    db,
    "SELECT member_credits FROM team_members WHERE id = $1 AND user_id = $2 FOR UPDATE",
    [input.targetSubaccountId, input.sourceUserId],
  );
  if (!sourceWallet || !targetWallet) {
    throw new CreditRechargeCenterError("real_team_not_found");
  }
  const sourceLedgerEntry = await insertTransferLedgerEntry(db, {
    userId: input.sourceUserId,
    teamMemberId: null,
    entryType: "transfer_out",
    amount: input.amount,
    availableDelta: -input.amount,
    balanceAfter: Number(sourceWallet.credit_balance_cached) - input.amount,
    sourceId: input.sourceId,
    reason: input.reason,
    metadata: input.metadata,
    createdByUserId: input.createdByUserId,
    now: input.now,
  });
  const targetLedgerEntry = await insertTransferLedgerEntry(db, {
    userId: input.sourceUserId,
    teamMemberId: input.targetSubaccountId,
    entryType: "transfer_in",
    amount: input.amount,
    availableDelta: input.amount,
    balanceAfter: Number(targetWallet.member_credits) + input.amount,
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
    userId: string;
    teamMemberId: string | null;
    entryType: "transfer_in" | "transfer_out";
    amount: number;
    availableDelta: number;
    balanceAfter: number;
    sourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    createdByUserId: string;
    now: Date;
  },
): Promise<CreditLedgerEntryRecord> {
  const row = await queryOne<{
    id: string;
    user_id: string;
    team_member_id: string | null;
    reservation_id: string | null;
    allocation_id: string | null;
    entry_type: "transfer_in" | "transfer_out";
    amount: number;
    available_delta: number;
    reserved_delta: number;
    consumed_delta: number;
    balance_after: number;
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
        user_id,
        team_member_id,
        reservation_id,
        allocation_id,
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
      VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, 0, 0, $12, 'credit_wallet_transfer', $7, $8, $9::jsonb, $10, $11)
      RETURNING *
    `,
    [
      randomUUID(),
      input.userId,
      input.teamMemberId,
      input.entryType,
      input.amount,
      input.availableDelta,
      input.sourceId,
      input.reason,
      JSON.stringify(input.metadata),
      input.createdByUserId,
      input.now,
      input.balanceAfter,
    ],
  );
  if (!row) {
    throw new CreditRechargeCenterError("transfer_replay_conflict");
  }
  return {
    id: row.id,
    userId: row.user_id,
    teamMemberId: row.team_member_id,
    reservationId: row.reservation_id,
    allocationId: row.allocation_id,
    entryType: row.entry_type,
    amount: row.amount,
    availableDelta: row.available_delta,
    reservedDelta: row.reserved_delta,
    consumedDelta: row.consumed_delta,
    balanceAfter: row.balance_after,
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
