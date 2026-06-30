import { randomUUID } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import {
  resolveActorContext,
  type ActorContext,
} from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  transferCreditsBetweenOrganizationsInTransaction,
  type CreditLedgerEntryRecord,
} from "./credit-ledger.service.ts";

interface AuthenticatedRechargeUser {
  sessionToken: string;
}

interface OrganizationWalletRow {
  id: string;
  name: string;
  credit_balance_cached: number;
  credit_reserved_cached: number;
}

interface TeamCandidateRow extends OrganizationWalletRow {
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
        personalOrganizationId: actor.organizationId,
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
            existing.target_organization_id !== team.id
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

        await lockOrganizationsInStableOrder(deps.db, [
          actor.organizationId,
          team.id,
        ]);
        const personalWallet = await getOrganizationWalletForUpdate(deps.db, actor.organizationId);
        const personalAvailable = availableCredits(personalWallet);
        if (personalAvailable < amount) {
          throw new CreditRechargeCenterError("insufficient_personal_credits");
        }

        const transferId = randomUUID();
        const transfer = await insertSucceededTransfer(deps.db, {
          transferId,
          sourceOrganizationId: actor.organizationId,
          targetOrganizationId: team.id,
          operatorUserId: actor.actorId,
          amount,
          idempotencyKey,
          now: input.now,
        });
        const ledger = await transferCreditsBetweenOrganizationsInTransaction(deps.db, {
          sourceOrganizationId: actor.organizationId,
          targetOrganizationId: team.id,
          amount,
          sourceId: transferId,
          reason: "个人积分转入团队积分池",
          createdByUserId: actor.actorId,
          metadata: {
            sourceOrganizationId: actor.organizationId,
            targetOrganizationId: team.id,
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
  const personal = await getOrganizationWallet(db, input.actor.organizationId);
  const team = await resolveRealTeamCandidate(db, {
    actorId: input.actor.actorId,
    personalOrganizationId: input.actor.organizationId,
    now: input.now,
  });
  const canTransfer =
    Boolean(team) &&
    canTransferToTeamPool(input.actor, team!) &&
    availableCredits(personal) > 0;

  return {
    wallets: {
      personal: walletView(personal),
      team: team ? walletView(team) : null,
    },
    transfer: {
      canTransferToTeamPool: canTransfer,
      reason: canTransfer
        ? null
        : transferUnavailableReason(input.actor, team, personal),
    },
  };
}

async function getOrganizationWallet(db: SqlDatabase, organizationId: string) {
  const wallet = await queryOne<OrganizationWalletRow>(
    db,
    `
      SELECT id, name, credit_balance_cached, credit_reserved_cached
      FROM organizations
      WHERE id = $1
      LIMIT 1
    `,
    [organizationId],
  );
  if (!wallet) {
    throw new CreditRechargeCenterError("invalid_transfer_input");
  }
  return wallet;
}

async function getOrganizationWalletForUpdate(db: SqlDatabase, organizationId: string) {
  const wallet = await queryOne<OrganizationWalletRow>(
    db,
    `
      SELECT id, name, credit_balance_cached, credit_reserved_cached
      FROM organizations
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [organizationId],
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
    personalOrganizationId: string;
    now: Date;
  },
) {
  const team = await queryOne<TeamCandidateRow>(
    db,
    `
      SELECT
        organizations.id,
        organizations.name,
        organizations.credit_balance_cached,
        organizations.credit_reserved_cached,
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
          WHERE entitlement.organization_id = organizations.id
            AND entitlement.entitlement_key = 'team_member_management'
            AND entitlement.status = 'active'
            AND entitlement.source IS DISTINCT FROM 'payment'
            AND (entitlement.expires_at IS NULL OR entitlement.expires_at > $3)
          UNION ALL
          SELECT period.id
          FROM membership_periods period
          WHERE period.organization_id = organizations.id
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
      JOIN organizations
        ON organizations.id = memberships.organization_id
      WHERE memberships.user_id = $1
        AND memberships.status = 'active'
        AND memberships.role IN ('owner_admin', 'producer', 'creator')
        AND organizations.status = 'active'
        AND workspaces.status = 'active'
        AND organizations.id <> $2
      ORDER BY memberships.role = 'owner_admin' DESC, workspaces.created_at ASC
      LIMIT 1
    `,
    [input.actorId, input.personalOrganizationId, input.now],
  );

  if (!team || !team.team_entitlement_active || Number(team.member_count) <= 0) {
    return null;
  }
  return team;
}

function canTransferToTeamPool(actor: ActorContext, team: TeamCandidateRow) {
  void actor;
  return team.role === "owner_admin";
}

function transferUnavailableReason(
  actor: ActorContext,
  team: TeamCandidateRow | null,
  personal: OrganizationWalletRow,
) {
  if (!team) return "no_real_team";
  if (!canTransferToTeamPool(actor, team)) return "permission_missing";
  if (availableCredits(personal) <= 0) return "no_personal_credits";
  return "unavailable";
}

function walletView(row: OrganizationWalletRow) {
  return {
    organizationId: row.id,
    name: row.name,
    availableCredits: availableCredits(row),
    reservedCredits: Number(row.credit_reserved_cached ?? 0),
  };
}

function availableCredits(row: OrganizationWalletRow) {
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

async function lockOrganizationsInStableOrder(db: SqlDatabase, organizationIds: string[]) {
  const sortedIds = [...new Set(organizationIds)].sort();
  await db.query(
    `
      SELECT id
      FROM organizations
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE
    `,
    [sortedIds],
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
      JSON.stringify({ flow: "personal_to_team_pool" }),
      input.now,
    ],
  ).then((row) => row!);
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
  return {
    id: row.id,
    sourceOrganizationId: row.source_organization_id,
    targetOrganizationId: row.target_organization_id,
    operatorUserId: row.operator_user_id,
    amount: row.amount,
    status: row.status,
    sourceLedgerEntryId: row.source_ledger_entry_id,
    targetLedgerEntryId: row.target_ledger_entry_id,
    idempotencyKey: row.idempotency_key,
    failureCode: row.failure_code,
    metadata: normalizeJson(row.metadata_json),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function normalizeJson(value: Record<string, unknown> | string | null) {
  if (!value) return {};
  return typeof value === "string" ? JSON.parse(value) : value;
}
