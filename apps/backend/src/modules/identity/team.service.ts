import { randomBytes, randomUUID } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import {
  createTeamTemporaryCredential,
  createUserPasswordHash,
} from "../identity/team-account-credentials.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { UserActorContext } from "./user-actor-context.service.ts";

const DEFAULT_TEAM_SUBACCOUNT_LIMIT = 50;
const TEAM_SUBACCOUNT_LIMIT_CONFIG_KEY = "team.default_subaccount_limit";

export type TeamServiceErrorCode =
  | "team_member_management_required"
  | "team_seat_limit_reached"
  | "team_permission_missing"
  | "team_account_duplicate"
  | "team_group_limit_reached"
  | "team_group_scope_violation"
  | "team_project_scope_violation"
  | "team_credit_insufficient"
  | "team_member_credit_insufficient"
  | "team_member_project_in_use"
  | "team_member_disabled"
  | "team_member_input_invalid";

export class TeamServiceError extends Error {
  constructor(readonly code: TeamServiceErrorCode) {
    super(code);
  }
}

export interface TeamMemberSummary {
  membershipId: string;
  userId: string;
  teamAccount: string;
  memberLoginAccount: string;
  displayName: string;
  memberGroupId: string | null;
  projectIds: string[];
  inheritedProjectIds: string[];
  scriptIds: string[];
  canvasIds: string[];
  status: "active" | "invited" | "disabled" | "deleted";
  creditBalance: number;
  creditUsed: number;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamMemberInput {
  actor: UserActorContext;
  teamAccount: string;
  displayName: string;
  password?: string | null;
  memberGroupId?: string | null;
  projectIds?: string[];
  scriptIds?: string[];
  canvasIds?: string[];
  initialCredits?: number;
  remark?: string | null;
  now: Date;
}

export interface UpdateTeamMemberInput {
  actor: UserActorContext;
  memberId: string;
  displayName?: string | null;
  projectIds?: string[] | null;
  scriptIds?: string[] | null;
  canvasIds?: string[] | null;
  newPassword?: string | null;
  status?: "active" | "disabled" | "deleted" | null;
  creditAdjustmentType?: "increase" | "deduct" | null;
  creditAmount?: number | null;
  remark?: string | null;
  now: Date;
}

interface TeamMemberRow {
  id: string;
  user_id: string;
  member_account: string;
  member_account_suffix: string;
  member_login_account: string;
  member_name: string;
  member_credits: number;
  status: "active" | "disabled" | "deleted";
  created_at: string | Date;
  updated_at: string | Date;
  project_ids: string[] | null;
  inherited_project_ids?: string[] | null;
  script_ids?: string[] | null;
  canvas_ids?: string[] | null;
}

interface TeamResourceAssignments {
  projectIds: string[];
  scripts: { id: string; projectId: string }[];
  canvases: { id: string; projectId: string | null }[];
}

export async function createTeamMember(
  db: SqlDatabase,
  input: CreateTeamMemberInput,
): Promise<{ member: TeamMemberSummary; temporaryPassword: string }> {
  requireTeamOwner(input.actor);
  assertCanManageMembers(input.actor);

  const memberAccount = normalizeTeamAccount(input.teamAccount);
  const memberName = normalizeRequiredText(input.displayName);
  if (!isValidTeamAccount(memberAccount) || memberName.length === 0) {
    throw new TeamServiceError("team_member_input_invalid");
  }

  const memberCredits = normalizeInitialCredits(input.initialCredits);
  const scriptIds = normalizeResourceIds(input.scriptIds ?? []);
  const canvasIds = normalizeResourceIds(input.canvasIds ?? []);
  const assignments = await resolveTeamResourceAssignments(db, {
    actor: input.actor,
    projectIds: normalizeProjectIds(input.projectIds ?? []),
    scriptIds,
    canvasIds,
  });
  const providedPassword = input.password == null ? null : normalizeOptionalPassword(input.password);
  const credential = providedPassword
    ? {
        temporaryPassword: "",
        passwordHash: await createUserPasswordHash(providedPassword),
      }
    : await createTeamTemporaryCredential();
  const memberId = randomUUID();
  const memberAccountSuffix = await ensureUserTeamAccountSuffix(db, input.actor.userId);
  const memberLoginAccount = buildTeamMemberLoginAccount(memberAccount, memberAccountSuffix);

  await runInTransaction(db, async () => {
    const ownerWallet = await lockOwnerWalletForTeamMutation(db, input.actor.userId);
    const planLimits = await resolvePlanLimits(db, {
      userId: input.actor.userId,
    });
    assertTeamSeatEnabled(planLimits.seatLimit);
    const usedSeats = await countActiveSubaccounts(db, input.actor);
    if (usedSeats >= planLimits.seatLimit) {
      throw new TeamServiceError("team_seat_limit_reached");
    }
    if (Number(ownerWallet?.credit_balance_cached ?? 0) < memberCredits) {
      throw new TeamServiceError("team_credit_insufficient");
    }

    await assertTeamAccountAvailable(db, {
      actor: input.actor,
      teamAccount: memberAccount,
      memberLoginAccount,
    });
    await assertProjectScope(db, {
      actor: input.actor,
      projectIds: assignments.projectIds,
    });

    await db.query(
      `
        INSERT INTO team_members (
          id,
          user_id,
          member_account,
          member_account_suffix,
          member_login_account,
          member_name,
          member_password_hash,
          member_credits,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $9)
      `,
      [
        memberId,
        input.actor.userId,
        memberAccount,
        memberAccountSuffix,
        memberLoginAccount,
        memberName,
        credential.passwordHash,
        memberCredits,
        input.now,
      ],
    );

    if (memberCredits > 0) {
      const adjustmentId = randomUUID();
      const deducted = await queryOne<{ credit_balance_cached: number | string }>(
        db,
        `
          UPDATE users
          SET credit_balance_cached = credit_balance_cached - $2,
              updated_at = $3
          WHERE id = $1
            AND credit_balance_cached >= $2
          RETURNING credit_balance_cached
        `,
        [input.actor.userId, memberCredits, input.now],
      );
      if (!deducted) {
        throw new TeamServiceError("team_credit_insufficient");
      }

      await db.query(
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
            source_type,
            source_id,
            reason,
            metadata_json,
            created_by_user_id,
            created_at
          )
          VALUES
            ($1, $2, NULL, NULL, NULL, 'transfer_out', $4::int, -($4::int), 0, 0, $5, $6, $7, $8::jsonb, $2, $9),
            ($10, $2, $3, NULL, NULL, 'transfer_in', $4::int, $4::int, 0, 0, $5, $6, $7, $8::jsonb, $2, $9)
        `,
        [
          adjustmentId,
          input.actor.userId,
          memberId,
          memberCredits,
          "team_member_credit_allocation",
          adjustmentId,
          "子账户分配积分",
          JSON.stringify({
            memberId,
            memberAccount,
            memberLoginAccount,
            adjustmentType: "allocate",
            amount: memberCredits,
          }),
          input.now,
          randomUUID(),
        ],
      );
    }

    await replaceTeamMemberProjects(db, {
      userId: input.actor.userId,
      memberId,
      projectIds: assignments.projectIds,
      now: input.now,
    });
    await replaceTeamMemberScripts(db, {
      userId: input.actor.userId,
      memberId,
      scripts: assignments.scripts,
      now: input.now,
    });
    await replaceTeamMemberCanvases(db, {
      userId: input.actor.userId,
      memberId,
      canvases: assignments.canvases,
      now: input.now,
    });
  });

  return {
    member: summaryFromRow({
      id: memberId,
      user_id: input.actor.userId,
      member_account: memberAccount,
      member_account_suffix: memberAccountSuffix,
      member_login_account: memberLoginAccount,
      member_name: memberName,
      member_credits: memberCredits,
      status: "active",
      created_at: input.now,
      updated_at: input.now,
      project_ids: assignments.projectIds,
      inherited_project_ids: inheritedProjectIdsFromAssignments(assignments),
      script_ids: scriptIds,
      canvas_ids: canvasIds,
    }),
    temporaryPassword: credential.temporaryPassword,
  };
}

export async function getTeamOverview(
  db: SqlDatabase,
  input: { actor: UserActorContext; now: Date },
) {
  assertCanViewTeamOverview(input.actor);

  const planLimits = await resolvePlanLimits(db, {
    userId: input.actor.userId,
  });
  const usedSeats = await countActiveSubaccounts(db, input.actor);
  const credits = await queryOne<{
    credit_balance_cached: number;
    credit_reserved_cached: number;
  }>(
    db,
    `
      SELECT credit_balance_cached, credit_reserved_cached
      FROM users
      WHERE id = $1
    `,
    [input.actor.userId],
  );

  return {
    entitlements: {
      teamMemberManagement: planLimits.seatLimit > 0,
      teamAssetLibrary: planLimits.seatLimit > 0,
      teamDashboard: false,
    },
    seats: {
      used: usedSeats,
      limit: planLimits.seatLimit,
      remaining: Math.max(0, planLimits.seatLimit - usedSeats),
    },
    team: {
      activated: usedSeats > 0,
      memberCount: usedSeats,
    },
    concurrency: {
      singleAccountLimit: planLimits.singleAccountConcurrencyLimit,
    },
    credits: {
      allocatable: Math.max(
        0,
        (credits?.credit_balance_cached ?? 0) -
          (credits?.credit_reserved_cached ?? 0),
      ),
    },
    permissions: resolveTeamOverviewPermissions(input.actor),
    teamAccountSuffix: await ensureUserTeamAccountSuffix(db, input.actor.userId),
  };
}

export async function listTeamMembers(
  db: SqlDatabase,
  input: { actor: UserActorContext },
): Promise<TeamMemberSummary[]> {
  assertCanReadMembers(input.actor);

  const result = await db.query<TeamMemberRow>(
    `
      SELECT
        member.id::text AS id,
        member.user_id::text AS user_id,
        member.member_account,
        member.member_account_suffix,
        member.member_login_account,
        member.member_name,
        member.member_credits,
        member.status,
        member.created_at,
        member.updated_at,
        COALESCE(
          ARRAY_AGG(DISTINCT project.project_id) FILTER (WHERE project.project_id IS NOT NULL),
          ARRAY[]::uuid[]
        )::text[] AS project_ids,
        COALESCE(
          ARRAY_AGG(DISTINCT COALESCE(script.project_id, canvas.project_id)) FILTER (
            WHERE COALESCE(script.project_id, canvas.project_id) IS NOT NULL
          ),
          ARRAY[]::uuid[]
        )::text[] AS inherited_project_ids,
        COALESCE(
          ARRAY_AGG(DISTINCT script.script_id) FILTER (WHERE script.script_id IS NOT NULL),
          ARRAY[]::uuid[]
        )::text[] AS script_ids,
        COALESCE(
          ARRAY_AGG(DISTINCT canvas.canvas_id) FILTER (WHERE canvas.canvas_id IS NOT NULL),
          ARRAY[]::uuid[]
        )::text[] AS canvas_ids
      FROM team_members member
      LEFT JOIN team_member_projects project
        ON project.user_id = member.user_id
       AND project.member_id = member.id
      LEFT JOIN team_member_scripts script
        ON script.user_id = member.user_id
       AND script.member_id = member.id
      LEFT JOIN team_member_canvases canvas
        ON canvas.user_id = member.user_id
       AND canvas.member_id = member.id
      WHERE member.user_id = $1
        AND member.status <> 'deleted'
      GROUP BY member.id
      ORDER BY member.created_at DESC, member.id DESC
    `,
    [input.actor.userId],
  );

  return result.rows.map(summaryFromRow);
}

export async function updateTeamMember(
  db: SqlDatabase,
  input: UpdateTeamMemberInput,
): Promise<TeamMemberSummary | null> {
  requireTeamOwner(input.actor);
  assertCanManageMembers(input.actor);

  const target = await findTeamMemberForActor(db, {
    actor: input.actor,
    memberId: input.memberId,
  });
  if (!target) {
    return null;
  }

  const memberName = input.displayName == null ? null : normalizeRequiredText(input.displayName);
  if (input.displayName != null && !memberName) {
    throw new TeamServiceError("team_member_input_invalid");
  }

  const status = input.status == null ? null : String(input.status);
  if (status != null && status !== "active" && status !== "disabled" && status !== "deleted") {
    throw new TeamServiceError("team_member_input_invalid");
  }

  const creditAdjustmentType = input.creditAdjustmentType == null ? null : String(input.creditAdjustmentType);
  if (creditAdjustmentType != null && creditAdjustmentType !== "increase" && creditAdjustmentType !== "deduct") {
    throw new TeamServiceError("team_member_input_invalid");
  }

  const creditAmount = normalizeOptionalCreditAmount(input.creditAmount);
  if (!creditAdjustmentType && creditAmount > 0) {
    throw new TeamServiceError("team_member_input_invalid");
  }
  if (creditAdjustmentType && creditAmount <= 0) {
    throw new TeamServiceError("team_member_input_invalid");
  }
  if (creditAdjustmentType === "deduct" && creditAmount > Number(target.member_credits ?? 0)) {
    throw new TeamServiceError("team_member_credit_insufficient");
  }

  const shouldRefreshProjectIds =
    input.projectIds != null ||
    input.scriptIds != null ||
    input.canvasIds != null;
  const scriptIds = input.scriptIds != null ? normalizeResourceIds(input.scriptIds) : null;
  const canvasIds = input.canvasIds != null ? normalizeResourceIds(input.canvasIds) : null;
  const assignments = shouldRefreshProjectIds
    ? await resolveTeamResourceAssignments(db, {
        actor: input.actor,
        projectIds: normalizeProjectIds(input.projectIds ?? []),
        scriptIds: scriptIds ?? [],
        canvasIds: canvasIds ?? [],
      })
    : null;
  const newPassword = input.newPassword == null ? null : normalizeOptionalPassword(input.newPassword);
  const nextPasswordHash = newPassword ? await createUserPasswordHash(newPassword) : null;

  let updated: TeamMemberRow | null = null;
  await runInTransaction(db, async () => {
    const ownerWallet = await lockOwnerWalletForTeamMutation(db, input.actor.userId);
    const planLimits = await resolvePlanLimits(db, {
      userId: input.actor.userId,
    });
    assertTeamSeatEnabled(planLimits.seatLimit);
    if (creditAdjustmentType === "increase" && Number(ownerWallet?.credit_balance_cached ?? 0) < creditAmount) {
      throw new TeamServiceError("team_credit_insufficient");
    }

    if (assignments != null) {
      await assertProjectScope(db, {
        actor: input.actor,
        projectIds: assignments.projectIds,
      });
      await replaceTeamMemberProjects(db, {
        userId: input.actor.userId,
        memberId: input.memberId,
        projectIds: assignments.projectIds,
        now: input.now,
      });
      await replaceTeamMemberScripts(db, {
        userId: input.actor.userId,
        memberId: input.memberId,
        scripts: assignments.scripts,
        now: input.now,
      });
      await replaceTeamMemberCanvases(db, {
        userId: input.actor.userId,
        memberId: input.memberId,
        canvases: assignments.canvases,
        now: input.now,
      });
    }

    if (creditAdjustmentType === "increase" && creditAmount > 0) {
      const adjustmentId = randomUUID();
      const deducted = await queryOne<{ credit_balance_cached: number | string }>(
        db,
        `
          UPDATE users
          SET credit_balance_cached = credit_balance_cached - $2,
              updated_at = $3
          WHERE id = $1
            AND credit_balance_cached >= $2
          RETURNING credit_balance_cached
        `,
        [input.actor.userId, creditAmount, input.now],
      );
      if (!deducted) {
        throw new TeamServiceError("team_credit_insufficient");
      }

      await db.query(
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
            source_type,
            source_id,
            reason,
            metadata_json,
            created_by_user_id,
            created_at
          )
          VALUES
            ($1, $2, NULL, NULL, NULL, 'transfer_out', $4::int, -($4::int), 0, 0, $5, $6, $7, $8::jsonb, $2, $9),
            ($10, $2, $3, NULL, NULL, 'transfer_in', $4::int, $4::int, 0, 0, $5, $6, $7, $8::jsonb, $2, $9)
        `,
        [
          adjustmentId,
          input.actor.userId,
          input.memberId,
          creditAmount,
          "team_member_credit_allocation",
          adjustmentId,
          "子账户分配积分",
          JSON.stringify({
            memberId: input.memberId,
            adjustmentType: "allocate",
            amount: creditAmount,
          }),
          input.now,
          randomUUID(),
        ],
      );

    }

    if (creditAdjustmentType === "deduct" && creditAmount > 0) {
      const adjustmentId = randomUUID();
      await db.query(
        `
          UPDATE users
          SET credit_balance_cached = credit_balance_cached + $2,
              updated_at = $3
          WHERE id = $1
        `,
        [input.actor.userId, creditAmount, input.now],
      );

      await db.query(
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
            source_type,
            source_id,
            reason,
            metadata_json,
            created_by_user_id,
            created_at
          )
          VALUES
            ($1, $2, $3, NULL, NULL, 'transfer_out', $4::int, -($4::int), 0, 0, $5, $6, $7, $8::jsonb, $2, $9),
            ($10, $2, NULL, NULL, NULL, 'transfer_in', $4::int, $4::int, 0, 0, $5, $6, $7, $8::jsonb, $2, $9)
        `,
        [
          adjustmentId,
          input.actor.userId,
          input.memberId,
          creditAmount,
          "team_member_credit_deduction",
          adjustmentId,
          "回收子账户积分",
          JSON.stringify({
            memberId: input.memberId,
            adjustmentType: "recover",
            amount: creditAmount,
          }),
          input.now,
          randomUUID(),
        ],
      );

    }

    updated = await queryOne<TeamMemberRow>(
      db,
      `
        UPDATE team_members
        SET
          member_name = COALESCE($3, member_name),
          member_password_hash = COALESCE($4, member_password_hash),
          member_credits = member_credits
            + CASE
              WHEN $5 = 'increase' THEN $6::int
              WHEN $5 = 'deduct' THEN -($6::int)
              ELSE 0
            END,
          status = COALESCE($7, status),
          disabled_at = CASE
            WHEN $7 = 'disabled' THEN $8
            WHEN $7 = 'active' THEN NULL
            ELSE disabled_at
          END,
          deleted_at = CASE
            WHEN $7 = 'deleted' THEN $8
            WHEN $7 = 'active' THEN NULL
            ELSE deleted_at
          END,
          updated_at = $8
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id::text,
          user_id::text,
          member_account,
          member_account_suffix,
          member_login_account,
          member_name,
          member_credits,
          status,
          created_at,
          updated_at,
          ARRAY[]::text[] AS project_ids,
          ARRAY[]::text[] AS inherited_project_ids
      `,
      [
        input.memberId,
        input.actor.userId,
        memberName,
        nextPasswordHash,
        creditAdjustmentType,
        creditAmount,
        status,
        input.now,
      ],
    );
    if (!updated) {
      throw new TeamServiceError("team_member_input_invalid");
    }

    if (status === "disabled" || status === "deleted" || nextPasswordHash) {
      await revokeTeamMemberSessions(db, {
        userId: input.actor.userId,
        memberId: input.memberId,
        now: input.now,
      });
    }
  });

  const projectAssignments = await listTeamMemberProjectIds(db, {
    userId: input.actor.userId,
    memberId: input.memberId,
  });
  const scriptAssignments = await listTeamMemberScriptIds(db, {
    userId: input.actor.userId,
    memberId: input.memberId,
  });
  const canvasAssignments = await listTeamMemberCanvasIds(db, {
    userId: input.actor.userId,
    memberId: input.memberId,
  });
  const inheritedProjectAssignments = await listTeamMemberInheritedProjectIds(db, {
    userId: input.actor.userId,
    memberId: input.memberId,
  });

  return summaryFromRow({
    ...updated!,
    project_ids: projectAssignments,
    inherited_project_ids: inheritedProjectAssignments,
    script_ids: scriptAssignments,
    canvas_ids: canvasAssignments,
  });
}

function requireTeamOwner(actor: UserActorContext): string {
  if (actor.teamMember) {
    throw new TeamServiceError("team_permission_missing");
  }
  return actor.userId;
}

function assertCanManageMembers(actor: UserActorContext) {
  if (actor.teamMember) {
    throw new TeamServiceError("team_permission_missing");
  }
  if (actor.capabilities.includes(capabilities.teamMemberManageAll)) {
    return;
  }
  throw new TeamServiceError("team_permission_missing");
}

function assertCanReadMembers(actor: UserActorContext) {
  if (actor.teamMember) {
    throw new TeamServiceError("team_permission_missing");
  }
  if (
    actor.capabilities.includes(capabilities.teamMemberManageAll) ||
    actor.capabilities.includes(capabilities.teamMemberRead)
  ) {
    return;
  }
  throw new TeamServiceError("team_permission_missing");
}

function assertCanViewTeamOverview(actor: UserActorContext) {
  if (actor.teamMember) {
    throw new TeamServiceError("team_permission_missing");
  }
  if (
    actor.capabilities.includes(capabilities.teamDashboardViewAll) ||
    actor.capabilities.includes(capabilities.teamDashboardViewGroup) ||
    actor.capabilities.includes(capabilities.teamMemberRead) ||
    actor.capabilities.includes(capabilities.teamMemberManageAll)
  ) {
    return;
  }

  throw new TeamServiceError("team_permission_missing");
}

function resolveTeamOverviewPermissions(actor: UserActorContext) {
  const canManageAll = !actor.teamMember && actor.capabilities.includes(capabilities.teamMemberManageAll);

  return {
    canReadMembers:
      canManageAll ||
      (!actor.teamMember && actor.capabilities.includes(capabilities.teamMemberRead)),
    canCreateMember: canManageAll,
    canViewDashboard:
      !actor.teamMember &&
      (actor.capabilities.includes(capabilities.teamDashboardViewAll) ||
        actor.capabilities.includes(capabilities.teamDashboardViewGroup)),
    canManageAll,
    canManageGroup: false,
  };
}

function assertTeamSeatEnabled(seatLimit: number) {
  if (seatLimit <= 0) {
    throw new TeamServiceError("team_member_management_required");
  }
}

async function resolvePlanLimits(
  db: SqlDatabase,
  input: { userId: string },
) {
  const userLimits = await queryOne<{ team_seat_limit: number }>(
    db,
    `
      SELECT team_seat_limit
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [input.userId],
  );
  const defaultSeatLimit = userLimits ? 0 : await resolveDefaultSubaccountLimit(db);
  const seatLimit = normalizeSubaccountLimit(userLimits?.team_seat_limit ?? defaultSeatLimit);

  return {
    seatLimit,
    singleAccountConcurrencyLimit: 1,
  };
}

async function resolveDefaultSubaccountLimit(db: SqlDatabase) {
  const config = await queryOne<{ value_json: unknown }>(
    db,
    `
      SELECT value_json
      FROM runtime_config_entries
      WHERE key = $1
      LIMIT 1
    `,
    [TEAM_SUBACCOUNT_LIMIT_CONFIG_KEY],
  );
  return normalizeSubaccountLimit(config?.value_json);
}

function normalizeSubaccountLimit(value: unknown) {
  const limit = value === null || value === undefined
    ? DEFAULT_TEAM_SUBACCOUNT_LIMIT
    : Number(value);
  if (!Number.isInteger(limit) || limit < 0) return DEFAULT_TEAM_SUBACCOUNT_LIMIT;
  return limit;
}

async function countActiveSubaccounts(db: SqlDatabase, actor: UserActorContext) {
  const result = await queryOne<{ count: string | number }>(
    db,
    `
      SELECT COUNT(*) AS count
      FROM team_members
      WHERE user_id = $1
        AND status = 'active'
    `,
    [actor.userId],
  );

  return Number(result?.count ?? 0);
}

async function assertTeamAccountAvailable(
  db: SqlDatabase,
  input: { actor: UserActorContext; teamAccount: string; memberLoginAccount: string },
) {
  const loginExisting = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM team_members
      WHERE lower(member_login_account) = lower($1)
      LIMIT 1
    `,
    [input.memberLoginAccount],
  );

  if (loginExisting) {
    throw new TeamServiceError("team_account_duplicate");
  }
}

async function assertProjectScope(
  db: SqlDatabase,
  input: { actor: UserActorContext; projectIds: string[] },
) {
  for (const projectId of input.projectIds) {
    const project = await queryOne<{ id: string }>(
      db,
      `
        SELECT id
        FROM projects
        WHERE id = $1
          AND owner_user_id = $2
        LIMIT 1
      `,
      [
        projectId,
        input.actor.userId,
      ],
    );

    if (!project) {
      throw new TeamServiceError("team_project_scope_violation");
    }
  }
}

async function runInTransaction(
  db: SqlDatabase,
  operation: () => Promise<void>,
) {
  await db.query("BEGIN");
  try {
    await operation();
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function lockOwnerWalletForTeamMutation(db: SqlDatabase, userId: string) {
  return queryOne<{
    credit_balance_cached: number | string;
    credit_reserved_cached: number | string;
    credit_frozen_cached: number | string;
  }>(
    db,
    `
      SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached
      FROM users
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [userId],
  );
}

function normalizeTeamAccount(teamAccount: string) {
  return normalizeRequiredText(teamAccount).toLowerCase();
}

function buildTeamMemberLoginAccount(teamAccount: string, teamAccountSuffix: string) {
  return `${teamAccount}@${teamAccountSuffix}`;
}

export async function ensureUserTeamAccountSuffix(db: SqlDatabase, userId: string) {
  const existing = await queryOne<{ team_account_suffix: string | null }>(
    db,
    `
      SELECT team_account_suffix
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );
  const currentSuffix = normalizeTeamAccountSuffix(existing?.team_account_suffix);
  if (currentSuffix) {
    return currentSuffix;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = generateTeamAccountSuffix();
    const updated = await queryOne<{ team_account_suffix: string }>(
      db,
      `
        UPDATE users
        SET team_account_suffix = $2
        WHERE id = $1
          AND team_account_suffix IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM users
            WHERE team_account_suffix = $2
          )
        RETURNING team_account_suffix
      `,
      [userId, suffix],
    );
    if (updated?.team_account_suffix) {
      return updated.team_account_suffix;
    }
  }

  throw new TeamServiceError("team_member_input_invalid");
}

function generateTeamAccountSuffix() {
  return randomBytes(4).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 6).padEnd(6, "0");
}

function normalizeTeamAccountSuffix(value: unknown) {
  const suffix = normalizeRequiredText(value).toLowerCase();
  return /^[a-z0-9]{6}$/.test(suffix) ? suffix : "";
}

function normalizeInitialCredits(value: unknown) {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue)) {
    throw new TeamServiceError("team_member_input_invalid");
  }
  const amount = Math.trunc(numberValue);
  if (amount < 0) {
    throw new TeamServiceError("team_member_input_invalid");
  }
  return amount;
}

function normalizeOptionalCreditAmount(value: unknown) {
  if (value == null || value === "") {
    return 0;
  }
  return normalizeInitialCredits(value);
}

function normalizeOptionalPassword(value: unknown) {
  const password = String(value ?? "").trim();
  if (!password) {
    return null;
  }
  if (password.length < 8) {
    throw new TeamServiceError("team_member_input_invalid");
  }
  return password;
}

function normalizeProjectIds(projectIds: unknown) {
  if (!Array.isArray(projectIds)) {
    return [];
  }

  const normalized = projectIds.map((projectId) =>
    typeof projectId === "string" ? projectId.trim() : "",
  );
  if (normalized.some((projectId) => !isUuid(projectId))) {
    throw new TeamServiceError("team_project_scope_violation");
  }
  return [...new Set(normalized)];
}

function normalizeResourceIds(resourceIds: unknown) {
  if (!Array.isArray(resourceIds)) {
    return [];
  }

  const normalized = resourceIds.map((resourceId) =>
    typeof resourceId === "string" ? resourceId.trim() : "",
  );
  if (normalized.some((resourceId) => !isUuid(resourceId))) {
    throw new TeamServiceError("team_member_input_invalid");
  }
  return [...new Set(normalized)];
}

async function resolveTeamResourceAssignments(
  db: SqlDatabase,
  input: {
    actor: UserActorContext;
    projectIds: string[];
    scriptIds: string[];
    canvasIds: string[];
  },
): Promise<TeamResourceAssignments> {
  const projectIds = new Set(input.projectIds);
  const assignedScripts: { id: string; projectId: string }[] = [];
  const assignedCanvases: { id: string; projectId: string | null }[] = [];

  if (input.scriptIds.length > 0) {
    const scripts = await db.query<{ id: string; project_id: string }>(
      `
        SELECT id::text AS id, project_id::text AS project_id
        FROM scripts
        WHERE id = ANY($1::uuid[])
          AND created_by_user_id = $2
      `,
      [input.scriptIds, input.actor.userId],
    );
    if (scripts.rows.length !== input.scriptIds.length) {
      throw new TeamServiceError("team_member_input_invalid");
    }
    for (const script of scripts.rows) {
      const projectId = String(script.project_id);
      assignedScripts.push({ id: String(script.id), projectId });
    }
  }

  if (input.canvasIds.length > 0) {
    const canvases = await db.query<{ id: string; project_id: string | null }>(
      `
        SELECT id::text AS id, project_id::text AS project_id
        FROM creator_canvas_projects
        WHERE id = ANY($1::uuid[])
          AND created_by_user_id = $2
          AND deleted_at IS NULL
      `,
      [input.canvasIds, input.actor.userId],
    );
    if (canvases.rows.length !== input.canvasIds.length) {
      throw new TeamServiceError("team_member_input_invalid");
    }
    for (const canvas of canvases.rows) {
      assignedCanvases.push({
        id: String(canvas.id),
        projectId: canvas.project_id ? String(canvas.project_id) : null,
      });
    }
  }

  return {
    projectIds: [...projectIds],
    scripts: assignedScripts,
    canvases: assignedCanvases,
  };
}

async function findTeamMemberForActor(
  db: SqlDatabase,
  input: { actor: UserActorContext; memberId: string },
) {
  return queryOne<TeamMemberRow>(
    db,
    `
      SELECT
        id::text,
        user_id::text,
        member_account,
        member_account_suffix,
        member_login_account,
        member_name,
        member_credits,
        status,
        created_at,
        updated_at,
        ARRAY[]::text[] AS project_ids
      FROM team_members
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [input.memberId, input.actor.userId],
  );
}

async function replaceTeamMemberProjects(
  db: SqlDatabase,
  input: { userId: string; memberId: string; projectIds: string[]; now: Date },
) {
  const currentAssignments = await db.query<{ project_id: string }>(
    `
      SELECT project_id::text AS project_id
      FROM team_member_projects
      WHERE user_id = $1
        AND member_id = $2
      ORDER BY created_at ASC, id ASC
    `,
    [input.userId, input.memberId],
  );
  const existingRecords = await db.query<{ project_id: string }>(
    `
      SELECT DISTINCT project_id::text AS project_id
      FROM team_member_project_records
      WHERE user_id = $1
        AND member_id = $2
    `,
    [input.userId, input.memberId],
  );
  const currentProjectIds = currentAssignments.rows.map((row) => String(row.project_id));
  const nextProjectIds = [...new Set(input.projectIds.map((projectId) => String(projectId ?? "").trim()).filter(Boolean))];
  const nextProjectIdSet = new Set(nextProjectIds);
  const blockedProjectIds = new Set(existingRecords.rows.map((row) => String(row.project_id)));
  const removedProjectIds = currentProjectIds.filter((projectId) => !nextProjectIdSet.has(projectId));
  if (removedProjectIds.length > 0) {
    const blockedRemovedProjectIds = removedProjectIds.filter((projectId) => blockedProjectIds.has(projectId));
    if (blockedRemovedProjectIds.length > 0) {
      throw new TeamServiceError("team_member_project_in_use");
    }
    await db.query(
      `
        DELETE FROM team_member_projects
        WHERE user_id = $1
          AND member_id = $2
          AND project_id = ANY($3::uuid[])
      `,
      [input.userId, input.memberId, removedProjectIds],
    );
  }

  const addedProjectIds = nextProjectIds.filter((projectId) => !currentProjectIds.includes(projectId));
  for (const projectId of addedProjectIds) {
    await db.query(
      `
        INSERT INTO team_member_projects (
          id,
          member_id,
          user_id,
          project_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), input.memberId, input.userId, projectId, input.now],
    );
  }
}

async function replaceTeamMemberScripts(
  db: SqlDatabase,
  input: { userId: string; memberId: string; scripts: { id: string; projectId: string }[]; now: Date },
) {
  await db.query(
    `
      DELETE FROM team_member_scripts
      WHERE user_id = $1
        AND member_id = $2
    `,
    [input.userId, input.memberId],
  );

  for (const script of input.scripts) {
    await db.query(
      `
        INSERT INTO team_member_scripts (
          id,
          member_id,
          user_id,
          project_id,
          script_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), input.memberId, input.userId, script.projectId, script.id, input.now],
    );
  }
}

async function replaceTeamMemberCanvases(
  db: SqlDatabase,
  input: { userId: string; memberId: string; canvases: { id: string; projectId: string | null }[]; now: Date },
) {
  await db.query(
    `
      DELETE FROM team_member_canvases
      WHERE user_id = $1
        AND member_id = $2
    `,
    [input.userId, input.memberId],
  );

  for (const canvas of input.canvases) {
    await db.query(
      `
        INSERT INTO team_member_canvases (
          id,
          member_id,
          user_id,
          project_id,
          canvas_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), input.memberId, input.userId, canvas.projectId, canvas.id, input.now],
    );
  }
}

async function listTeamMemberProjectIds(
  db: SqlDatabase,
  input: { userId: string; memberId: string },
) {
  const result = await db.query<{ project_id: string }>(
    `
      SELECT project_id::text AS project_id
      FROM team_member_projects
      WHERE user_id = $1
        AND member_id = $2
      ORDER BY created_at ASC, id ASC
    `,
    [input.userId, input.memberId],
  );

  return result.rows.map((row) => row.project_id);
}

async function listTeamMemberScriptIds(
  db: SqlDatabase,
  input: { userId: string; memberId: string },
) {
  const result = await db.query<{ script_id: string }>(
    `
      SELECT script_id::text AS script_id
      FROM team_member_scripts
      WHERE user_id = $1
        AND member_id = $2
      ORDER BY created_at ASC, id ASC
    `,
    [input.userId, input.memberId],
  );

  return result.rows.map((row) => row.script_id);
}

async function listTeamMemberCanvasIds(
  db: SqlDatabase,
  input: { userId: string; memberId: string },
) {
  const result = await db.query<{ canvas_id: string }>(
    `
      SELECT canvas_id::text AS canvas_id
      FROM team_member_canvases
      WHERE user_id = $1
        AND member_id = $2
      ORDER BY created_at ASC, id ASC
    `,
    [input.userId, input.memberId],
  );

  return result.rows.map((row) => row.canvas_id);
}

async function listTeamMemberInheritedProjectIds(
  db: SqlDatabase,
  input: { userId: string; memberId: string },
) {
  const result = await db.query<{ project_id: string }>(
    `
      SELECT DISTINCT project_id::text AS project_id
      FROM (
        SELECT project_id
        FROM team_member_scripts
        WHERE user_id = $1
          AND member_id = $2
          AND project_id IS NOT NULL
        UNION
        SELECT project_id
        FROM team_member_canvases
        WHERE user_id = $1
          AND member_id = $2
          AND project_id IS NOT NULL
      ) inherited
      ORDER BY project_id ASC
    `,
    [input.userId, input.memberId],
  );

  return result.rows.map((row) => row.project_id);
}

function inheritedProjectIdsFromAssignments(assignments: TeamResourceAssignments) {
  return [
    ...new Set([
      ...assignments.scripts.map((script) => script.projectId),
      ...assignments.canvases.map((canvas) => canvas.projectId).filter((projectId): projectId is string => Boolean(projectId)),
    ]),
  ];
}

async function revokeTeamMemberSessions(
  db: SqlDatabase,
  input: { userId: string; memberId: string; now: Date },
) {
  await db.query(
    `
      UPDATE team_member_auth_sessions
      SET status = 'revoked',
          revoked_at = $3
      WHERE user_id = $1
        AND member_id = $2
        AND status = 'active'
    `,
    [input.userId, input.memberId, input.now],
  );
}

function summaryFromRow(row: TeamMemberRow): TeamMemberSummary {
  return {
    membershipId: row.id,
    userId: row.user_id,
    teamAccount: row.member_account,
    memberLoginAccount: row.member_login_account,
    displayName: row.member_name,
    memberGroupId: null,
    projectIds: Array.isArray(row.project_ids) ? row.project_ids.map(String) : [],
    inheritedProjectIds: Array.isArray(row.inherited_project_ids) ? row.inherited_project_ids.map(String) : [],
    scriptIds: Array.isArray(row.script_ids) ? row.script_ids.map(String) : [],
    canvasIds: Array.isArray(row.canvas_ids) ? row.canvas_ids.map(String) : [],
    status: row.status,
    creditBalance: Number(row.member_credits ?? 0),
    creditUsed: 0,
    remark: null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function isValidTeamAccount(teamAccount: string) {
  return /^[a-z0-9][a-z0-9_-]{2,31}$/.test(teamAccount);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizeRequiredText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
