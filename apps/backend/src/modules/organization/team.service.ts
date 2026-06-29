import { randomBytes, randomUUID } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import {
  createTeamTemporaryCredential,
  createUserPasswordHash,
} from "../identity/team-account-credentials.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { ActorContext } from "./actor-context.service.ts";

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
  status: "active" | "invited" | "disabled";
  creditBalance: number;
  creditUsed: number;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamMemberInput {
  actor: ActorContext;
  teamAccount: string;
  displayName: string;
  memberGroupId?: string | null;
  projectIds?: string[];
  initialCredits?: number;
  remark?: string | null;
  now: Date;
}

export interface UpdateTeamMemberInput {
  actor: ActorContext;
  memberId: string;
  displayName?: string | null;
  projectIds?: string[] | null;
  newPassword?: string | null;
  status?: "active" | "disabled" | null;
  creditAdjustmentType?: "increase" | "deduct" | null;
  creditAmount?: number | null;
  remark?: string | null;
  now: Date;
}

export async function createTeamMember(
  db: SqlDatabase,
  input: CreateTeamMemberInput,
): Promise<{ member: TeamMemberSummary; temporaryPassword: string }> {
  const workspaceId = requireTeamWorkspace(input.actor);
  const memberGroupId = resolveTargetMemberGroupId(
    input.actor,
    normalizeNullableText(input.memberGroupId),
  );

  assertCanCreateMember(input.actor, memberGroupId);

  const normalizedTeamAccount = normalizeTeamAccount(input.teamAccount);
  const displayName = normalizeRequiredText(input.displayName);
  if (!isValidTeamAccount(normalizedTeamAccount) || displayName.length === 0) {
    throw new TeamServiceError("team_member_input_invalid");
  }

  const initialCredits = normalizeInitialCredits(input.initialCredits);
  const projectIds = normalizeProjectIds(input.projectIds ?? []);

  const credential = await createTeamTemporaryCredential();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const profileId = randomUUID();
  const teamMemberId = randomUUID();
  const teamAccountSuffix = await ensureUserTeamAccountSuffix(db, input.actor.actorId);
  const virtualEmail = buildTeamAccountEmail(normalizedTeamAccount, teamAccountSuffix);
  const memberLoginAccount = buildTeamMemberLoginAccount(normalizedTeamAccount, teamAccountSuffix);

  await runInTransaction(db, async () => {
    await lockOrganizationForTeamMutation(db, input.actor.organizationId);
    await assertActiveEntitlement(db, {
      organizationId: input.actor.organizationId,
      entitlementKey: "team_member_management",
      now: input.now,
    });

    const planLimits = await resolvePlanLimits(db, {
      organizationId: input.actor.organizationId,
      now: input.now,
    });
    const usedSeats = await countActiveSubaccounts(db, input.actor);
    if (usedSeats >= planLimits.seatLimit) {
      throw new TeamServiceError("team_seat_limit_reached");
    }

    await assertMemberGroupScope(db, {
      actor: input.actor,
      workspaceId,
      memberGroupId,
    });

    await assertTeamAccountAvailable(db, {
      actor: input.actor,
      teamAccount: normalizedTeamAccount,
      memberLoginAccount,
    });

    await assertProjectScope(db, {
      actor: input.actor,
      projectIds,
    });

    if (initialCredits > 0) {
      await assertAllocatableCredits(db, {
        organizationId: input.actor.organizationId,
        amount: initialCredits,
      });
    }

    await db.query(
      `
        INSERT INTO users (id, email, phone_e164, display_name, password_hash, status)
        VALUES ($1, $2, NULL, $3, $4, 'active')
      `,
      [userId, virtualEmail, displayName, credential.passwordHash],
    );
    await db.query(
      `
        INSERT INTO memberships (
          id,
          organization_id,
          workspace_id,
          user_id,
          role,
          status
        )
        VALUES ($1, $2, $3, $4, 'sub_account', 'active')
      `,
      [membershipId, input.actor.organizationId, workspaceId, userId],
    );
    await db.query(
      `
        INSERT INTO team_member_profiles (
          id,
          organization_id,
          workspace_id,
          membership_id,
          team_account,
          display_name,
          member_group_id,
          credit_balance_cached,
          remark,
          created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        profileId,
        input.actor.organizationId,
        workspaceId,
        membershipId,
        normalizedTeamAccount,
        displayName,
        memberGroupId,
        initialCredits,
        normalizeNullableText(input.remark),
        input.actor.actorId,
      ],
    );
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
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
      `,
      [
        teamMemberId,
        userId,
        normalizedTeamAccount,
        teamAccountSuffix,
        memberLoginAccount,
        displayName,
        credential.passwordHash,
        initialCredits,
      ],
    );

    for (const projectId of projectIds) {
      await db.query(
        `
          INSERT INTO team_project_assignments (
            id,
            organization_id,
            workspace_id,
            membership_id,
            project_id,
            assigned_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          randomUUID(),
          input.actor.organizationId,
          workspaceId,
          membershipId,
          projectId,
          input.actor.actorId,
        ],
      );
    }

    if (initialCredits > 0) {
      await db.query(
        `
          UPDATE organizations
          SET credit_balance_cached = credit_balance_cached - $2,
              updated_at = $3
          WHERE id = $1
        `,
        [input.actor.organizationId, initialCredits, input.now],
      );
      await db.query(
        `
          INSERT INTO team_credit_adjustments (
            id,
            organization_id,
            workspace_id,
            operator_user_id,
            target_membership_id,
            adjustment_type,
            amount,
            reason,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, 'allocate', $6, $7, $8)
        `,
        [
          randomUUID(),
          input.actor.organizationId,
          workspaceId,
          input.actor.actorId,
          membershipId,
          initialCredits,
          "initial_member_credit_allocation",
          input.now,
        ],
      );
    }
  });

  return {
    member: {
      membershipId,
      userId,
      teamAccount: normalizedTeamAccount,
      memberLoginAccount,
      displayName,
      memberGroupId,
      projectIds,
      status: "active",
      creditBalance: initialCredits,
      creditUsed: 0,
      remark: normalizeNullableText(input.remark),
    },
    temporaryPassword: credential.temporaryPassword,
  };
}

export async function getTeamOverview(
  db: SqlDatabase,
  input: { actor: ActorContext; now: Date },
) {
  assertCanViewTeamOverview(input.actor);

  const planLimits = await resolvePlanLimits(db, {
    organizationId: input.actor.organizationId,
    now: input.now,
  });
  const usedSeats = await countActiveSubaccounts(db, input.actor);
  const credits = await queryOne<{
    credit_balance_cached: number;
    credit_reserved_cached: number;
  }>(
    db,
    `
      SELECT credit_balance_cached, credit_reserved_cached
      FROM organizations
      WHERE id = $1
    `,
    [input.actor.organizationId],
  );

  return {
    entitlements: {
      teamMemberManagement: await hasActiveEntitlement(db, {
        organizationId: input.actor.organizationId,
        entitlementKey: "team_member_management",
        now: input.now,
      }),
      teamAssetLibrary: await hasActiveEntitlement(db, {
        organizationId: input.actor.organizationId,
        entitlementKey: "team_asset_library",
        now: input.now,
      }),
      teamDashboard: await hasActiveEntitlement(db, {
        organizationId: input.actor.organizationId,
        entitlementKey: "team_dashboard",
        now: input.now,
      }),
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
    teamAccountSuffix: await ensureUserTeamAccountSuffix(db, input.actor.actorId),
  };
}

export async function listTeamMembers(
  db: SqlDatabase,
  input: { actor: ActorContext },
): Promise<TeamMemberSummary[]> {
  const groupId = resolveReadableMemberGroup(input.actor);
  const params: unknown[] = [
    input.actor.organizationId,
    input.actor.workspaceId,
  ];
  let groupScopeSql = "";

  if (groupId) {
    params.push(groupId);
    groupScopeSql = "AND profile.member_group_id = $3";
  }

  const result = await db.query<{
    membership_id: string;
    user_id: string;
    team_account: string;
    member_login_account: string;
    display_name: string;
    member_group_id: string | null;
    status: "active" | "invited" | "disabled";
    credit_balance_cached: number;
    credit_used_cached: number;
    remark: string | null;
    project_ids: string[] | null;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT
        membership.id AS membership_id,
        membership.user_id,
        profile.team_account,
        COALESCE(
          member.member_login_account,
          CASE
            WHEN owner.team_account_suffix IS NOT NULL
              THEN profile.team_account || '@' || owner.team_account_suffix
            ELSE profile.team_account
          END
        ) AS member_login_account,
        profile.display_name,
        profile.member_group_id,
        membership.status,
        profile.credit_balance_cached,
        profile.credit_used_cached,
        profile.remark,
        COALESCE(
          ARRAY_AGG(DISTINCT assignment.project_id) FILTER (WHERE assignment.project_id IS NOT NULL),
          ARRAY[]::uuid[]
        )::text[] AS project_ids,
        profile.created_at,
        profile.updated_at
      FROM team_member_profiles profile
      JOIN memberships membership
        ON membership.organization_id = profile.organization_id
       AND membership.id = profile.membership_id
      JOIN users
        ON users.id = membership.user_id
      LEFT JOIN users owner
        ON owner.id = profile.created_by_user_id
      LEFT JOIN team_members member
        ON member.user_id = membership.user_id
       AND lower(member.member_account) = lower(profile.team_account)
      LEFT JOIN team_project_assignments assignment
        ON assignment.organization_id = profile.organization_id
       AND assignment.workspace_id = profile.workspace_id
       AND assignment.membership_id = profile.membership_id
      WHERE profile.organization_id = $1
        AND profile.workspace_id = $2
        ${groupScopeSql}
      GROUP BY
        membership.id,
        membership.user_id,
        profile.team_account,
        member.member_login_account,
        owner.team_account_suffix,
        profile.display_name,
        profile.member_group_id,
        membership.status,
        profile.credit_balance_cached,
        profile.credit_used_cached,
        profile.remark,
        profile.created_at,
        profile.updated_at,
        profile.id
      ORDER BY profile.created_at DESC, profile.id DESC
    `,
    params,
  );

  return result.rows.map((row) => ({
    membershipId: row.membership_id,
    userId: row.user_id,
    teamAccount: row.team_account,
    memberLoginAccount: row.member_login_account,
    displayName: row.display_name,
    memberGroupId: row.member_group_id,
    projectIds: Array.isArray(row.project_ids) ? row.project_ids : [],
    status: row.status,
    creditBalance: row.credit_balance_cached,
    creditUsed: row.credit_used_cached,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateTeamMember(
  db: SqlDatabase,
  input: UpdateTeamMemberInput,
): Promise<TeamMemberSummary | null> {
  const workspaceId = requireTeamWorkspace(input.actor);
  assertCanUpdateMember(input.actor);
  const scopedGroupId = resolveReadableMemberGroup(input.actor);
  const target = await queryOne<{
    membership_id: string;
    user_id: string;
    member_group_id: string | null;
    credit_balance_cached: number;
  }>(
    db,
    `
      SELECT
        profile.membership_id,
        membership.user_id,
        profile.member_group_id,
        profile.credit_balance_cached
      FROM team_member_profiles profile
      JOIN memberships membership
        ON membership.organization_id = profile.organization_id
       AND membership.id = profile.membership_id
      WHERE profile.organization_id = $1
        AND profile.workspace_id = $2
        AND profile.membership_id = $3
      LIMIT 1
    `,
    [input.actor.organizationId, workspaceId, input.memberId],
  );
  if (!target) {
    return null;
  }

  if (scopedGroupId && target.member_group_id !== scopedGroupId) {
    throw new TeamServiceError("team_group_scope_violation");
  }

  const displayName = input.displayName == null ? null : normalizeRequiredText(input.displayName);

  const status = input.status == null ? null : String(input.status);
  if (status != null && status !== "active" && status !== "disabled") {
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

  const remark = input.remark == null ? null : normalizeNullableText(input.remark);
  const projectIds = input.projectIds == null ? null : normalizeProjectIds(input.projectIds);
  const newPassword = input.newPassword == null ? null : normalizeOptionalPassword(input.newPassword);

  await runInTransaction(db, async () => {
    await lockOrganizationForTeamMutation(db, input.actor.organizationId);
    await assertActiveEntitlement(db, {
      organizationId: input.actor.organizationId,
      entitlementKey: "team_member_management",
      now: input.now,
    });

    if (creditAdjustmentType === "increase" && creditAmount > 0) {
      await assertAllocatableCredits(db, {
        organizationId: input.actor.organizationId,
        amount: creditAmount,
      });
    }
    if (creditAdjustmentType === "deduct" && creditAmount > Number(target.credit_balance_cached ?? 0)) {
      throw new TeamServiceError("team_member_input_invalid");
    }
    if (projectIds != null) {
      await assertProjectScope(db, {
        actor: input.actor,
        projectIds,
      });
    }

    const updatedMembership = await db.query(
      `
        UPDATE memberships
        SET
          status = COALESCE($4, status),
          updated_at = $5
        WHERE organization_id = $1
          AND workspace_id = $2
          AND id = $3
      `,
      [input.actor.organizationId, workspaceId, input.memberId, status, input.now],
    );
    if ((updatedMembership.rowCount ?? 0) === 0) {
      throw new TeamServiceError("team_member_input_invalid");
    }

    await db.query(
      `
        UPDATE team_member_profiles
        SET
          display_name = COALESCE($4, display_name),
          remark = CASE
            WHEN $5::text IS NULL THEN remark
            ELSE $5
          END,
          credit_balance_cached = credit_balance_cached
            + CASE
              WHEN $6 = 'increase' THEN $7::int
              WHEN $6 = 'deduct' THEN -($7::int)
              ELSE 0
            END,
          updated_at = $8
        WHERE organization_id = $1
          AND workspace_id = $2
          AND membership_id = $3
      `,
      [
        input.actor.organizationId,
        workspaceId,
        input.memberId,
        displayName,
        remark,
        creditAdjustmentType,
        creditAmount,
        input.now,
      ],
    );

    if (projectIds != null) {
      await db.query(
        `
          DELETE FROM team_project_assignments
          WHERE organization_id = $1
            AND workspace_id = $2
            AND membership_id = $3
        `,
        [input.actor.organizationId, workspaceId, input.memberId],
      );

      for (const projectId of projectIds) {
        await db.query(
          `
            INSERT INTO team_project_assignments (
              id,
              organization_id,
              workspace_id,
              membership_id,
              project_id,
              assigned_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            randomUUID(),
            input.actor.organizationId,
            workspaceId,
            input.memberId,
            projectId,
            input.actor.actorId,
          ],
        );
      }
    }

    if (newPassword) {
      const nextPasswordHash = await createUserPasswordHash(newPassword);
      await db.query(
        `
          UPDATE users
          SET password_hash = $2,
              updated_at = $3
          WHERE id = $1
        `,
        [target.user_id, nextPasswordHash.passwordHash, input.now],
      );
      await db.query(
        `
          UPDATE team_members
          SET member_password_hash = $2,
              updated_at = $3
          WHERE user_id = $1
            AND member_account = (
              SELECT profile.team_account
              FROM team_member_profiles profile
              WHERE profile.organization_id = $4
                AND profile.workspace_id = $5
                AND profile.membership_id = $6
              LIMIT 1
            )
        `,
        [
          target.user_id,
          nextPasswordHash.passwordHash,
          input.now,
          input.actor.organizationId,
          workspaceId,
          input.memberId,
        ],
      );
    }

    await db.query(
      `
        UPDATE team_members
        SET
          member_name = COALESCE($2, member_name),
          member_credits = member_credits
            + CASE
              WHEN $3 = 'increase' THEN $4::int
              WHEN $3 = 'deduct' THEN -($4::int)
              ELSE 0
            END,
          status = COALESCE($5, status),
          updated_at = $6
        WHERE user_id = $1
          AND member_account = (
            SELECT profile.team_account
            FROM team_member_profiles profile
            WHERE profile.organization_id = $7
              AND profile.workspace_id = $8
              AND profile.membership_id = $9
            LIMIT 1
          )
      `,
      [
        target.user_id,
        displayName,
        creditAdjustmentType,
        creditAmount,
        status,
        input.now,
        input.actor.organizationId,
        workspaceId,
        input.memberId,
      ],
    );

    if (creditAdjustmentType && creditAmount > 0) {
      await db.query(
        `
          UPDATE organizations
          SET
            credit_balance_cached = credit_balance_cached
              + CASE WHEN $2 = 'increase' THEN -$3 ELSE $3 END,
            updated_at = $4
          WHERE id = $1
        `,
        [input.actor.organizationId, creditAdjustmentType, creditAmount, input.now],
      );
      await db.query(
        `
          INSERT INTO team_credit_adjustments (
            id,
            organization_id,
            workspace_id,
            operator_user_id,
            target_membership_id,
            adjustment_type,
            amount,
            reason,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          randomUUID(),
          input.actor.organizationId,
          workspaceId,
          input.actor.actorId,
          input.memberId,
          creditAdjustmentType,
          creditAmount,
          creditAdjustmentType === "increase" ? "manual_member_credit_increase" : "manual_member_credit_deduction",
          input.now,
        ],
      );
    }
  });

  const [member] = await listTeamMembers(db, { actor: input.actor }).then((members) =>
    members.filter((item) => item.membershipId === input.memberId),
  );
  return member ?? null;
}

function requireTeamWorkspace(actor: ActorContext): string {
  if (!actor.workspaceId) {
    throw new TeamServiceError("team_permission_missing");
  }
  return actor.workspaceId;
}

function resolveTargetMemberGroupId(
  actor: ActorContext,
  requestedMemberGroupId: string | null,
) {
  if (requestedMemberGroupId) {
    return requestedMemberGroupId;
  }

  if (
    actor.capabilities.includes(capabilities.teamMemberManageGroup) &&
    !actor.capabilities.includes(capabilities.teamMemberManageAll)
  ) {
    return actor.teamProfile?.memberGroupId ?? null;
  }

  return null;
}

function assertCanCreateMember(actor: ActorContext, memberGroupId: string | null) {
  if (actor.capabilities.includes(capabilities.teamMemberManageAll)) {
    return;
  }

  if (actor.capabilities.includes(capabilities.teamMemberManageGroup)) {
    if (actor.teamProfile?.memberGroupId && actor.teamProfile.memberGroupId === memberGroupId) {
      return;
    }
    throw new TeamServiceError("team_group_scope_violation");
  }

  throw new TeamServiceError("team_permission_missing");
}

function assertCanUpdateMember(actor: ActorContext) {
  if (actor.capabilities.includes(capabilities.teamMemberManageAll)) {
    return;
  }
  if (actor.capabilities.includes(capabilities.teamMemberManageGroup)) {
    return;
  }
  throw new TeamServiceError("team_permission_missing");
}

async function assertMemberGroupScope(
  db: SqlDatabase,
  input: {
    actor: ActorContext;
    workspaceId: string;
    memberGroupId: string | null;
  },
) {
  if (!input.memberGroupId) {
    return;
  }

  if (!isUuid(input.memberGroupId)) {
    throw new TeamServiceError("team_group_scope_violation");
  }

  const group = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM team_member_groups
      WHERE organization_id = $1
        AND workspace_id = $2
        AND id = $3
        AND status = 'active'
      LIMIT 1
    `,
    [
      input.actor.organizationId,
      input.workspaceId,
      input.memberGroupId,
    ],
  );

  if (!group) {
    throw new TeamServiceError("team_group_scope_violation");
  }
}

function assertCanViewTeamOverview(actor: ActorContext) {
  if (
    actor.capabilities.includes(capabilities.teamDashboardViewAll) ||
    actor.capabilities.includes(capabilities.teamDashboardViewGroup) ||
    actor.capabilities.includes(capabilities.teamMemberRead) ||
    actor.capabilities.includes(capabilities.teamMemberManageAll) ||
    actor.capabilities.includes(capabilities.teamMemberManageGroup)
  ) {
    return;
  }

  throw new TeamServiceError("team_permission_missing");
}

function resolveTeamOverviewPermissions(actor: ActorContext) {
  const canManageAll = actor.capabilities.includes(capabilities.teamMemberManageAll);
  const canManageGroup =
    actor.capabilities.includes(capabilities.teamMemberManageGroup) &&
    Boolean(actor.teamProfile?.memberGroupId);

  return {
    canReadMembers:
      canManageAll ||
      canManageGroup ||
      actor.capabilities.includes(capabilities.teamMemberRead),
    canCreateMember: canManageAll || canManageGroup,
    canViewDashboard:
      actor.capabilities.includes(capabilities.teamDashboardViewAll) ||
      actor.capabilities.includes(capabilities.teamDashboardViewGroup),
    canManageAll,
    canManageGroup,
  };
}

function resolveReadableMemberGroup(actor: ActorContext) {
  if (actor.capabilities.includes(capabilities.teamMemberManageAll)) {
    return null;
  }

  if (
    actor.capabilities.includes(capabilities.teamMemberManageGroup) ||
    actor.capabilities.includes(capabilities.teamMemberRead)
  ) {
    if (actor.teamProfile?.memberGroupId) {
      return actor.teamProfile.memberGroupId;
    }
  }

  throw new TeamServiceError("team_permission_missing");
}

async function assertActiveEntitlement(
  db: SqlDatabase,
  input: {
    organizationId: string;
    entitlementKey: string;
    now: Date;
  },
) {
  if (!(await hasActiveEntitlement(db, input))) {
    throw new TeamServiceError("team_member_management_required");
  }
}

async function hasActiveEntitlement(
  db: SqlDatabase,
  input: {
    organizationId: string;
    entitlementKey: string;
    now: Date;
  },
): Promise<boolean> {
  const entitlement = await queryOne<{ id: string }>(
    db,
    `
      SELECT id::text AS id
      FROM organization_entitlements
      WHERE organization_id = $1
        AND entitlement_key = $2
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > $3)
      UNION ALL
      SELECT period.id::text AS id
      FROM membership_periods period
      WHERE period.organization_id = $1
        AND period.tier = 'professional'
        AND period.status = 'active'
        AND period.period_end_at > $3
        AND (period.plan_snapshot_json -> 'entitlements') ? $2
      UNION ALL
      SELECT period.id::text AS id
      FROM membership_periods period
      JOIN membership_plans plan
        ON plan.id = period.plan_id
      WHERE period.organization_id = $1
        AND period.tier = 'professional'
        AND period.status = 'active'
        AND period.period_end_at > $3
        AND plan.tier = 'professional'
        AND plan.status = 'active'
        AND (plan.valid_from IS NULL OR plan.valid_from <= $3)
        AND (plan.valid_until IS NULL OR plan.valid_until > $3)
        AND plan.entitlements_json ? $2
      LIMIT 1
    `,
    [input.organizationId, input.entitlementKey, input.now],
  );

  return Boolean(entitlement);
}

async function resolvePlanLimits(
  db: SqlDatabase,
  input: { organizationId: string; now: Date },
) {
  const activeProfessionalPlan = await queryOne<{
    seat_limit: number;
  }>(
    db,
    `
      SELECT plan.seat_limit
      FROM membership_periods period
      JOIN membership_plans plan
        ON plan.id = period.plan_id
      WHERE period.organization_id = $1
        AND period.tier = 'professional'
        AND period.status = 'active'
        AND period.period_end_at > $2
        AND plan.tier = 'professional'
        AND plan.status = 'active'
        AND (plan.valid_from IS NULL OR plan.valid_from <= $2)
        AND (plan.valid_until IS NULL OR plan.valid_until > $2)
        AND plan.entitlements_json ? 'team_member_management'
      ORDER BY period.period_end_at DESC, period.created_at DESC
      LIMIT 1
    `,
    [input.organizationId, input.now],
  );
  const limits = await queryOne<{
    seat_limit: number;
    single_account_concurrency_limit: number;
  }>(
    db,
    `
      SELECT seat_limit, single_account_concurrency_limit
      FROM team_plan_limits
      WHERE organization_id = $1
      LIMIT 1
    `,
    [input.organizationId],
  );
  const defaultSeatLimit = await resolveDefaultSubaccountLimit(db);
  const seatLimit =
    activeProfessionalPlan
      ? Number(activeProfessionalPlan.seat_limit ?? 0)
      : limits
        ? Number(limits.seat_limit ?? 0)
        : defaultSeatLimit;

  return {
    seatLimit,
    singleAccountConcurrencyLimit: limits?.single_account_concurrency_limit ?? 1,
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

async function countActiveSubaccounts(db: SqlDatabase, actor: ActorContext) {
  const result = await queryOne<{ count: string | number }>(
    db,
    `
      SELECT COUNT(*) AS count
      FROM memberships
      WHERE organization_id = $1
        AND workspace_id = $2
        AND role = 'sub_account'
        AND status = 'active'
    `,
    [actor.organizationId, actor.workspaceId],
  );

  return Number(result?.count ?? 0);
}

async function assertTeamAccountAvailable(
  db: SqlDatabase,
  input: { actor: ActorContext; teamAccount: string; memberLoginAccount: string },
) {
  const existing = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM team_member_profiles
      WHERE organization_id = $1
        AND workspace_id = $2
        AND lower(team_account) = lower($3)
      LIMIT 1
    `,
    [input.actor.organizationId, input.actor.workspaceId, input.teamAccount],
  );

  const legacyExisting = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM team_members
      WHERE lower(member_login_account) = lower($1)
      LIMIT 1
    `,
    [input.memberLoginAccount],
  );

  if (existing || legacyExisting) {
    throw new TeamServiceError("team_account_duplicate");
  }
}

async function assertProjectScope(
  db: SqlDatabase,
  input: { actor: ActorContext; projectIds: string[] },
) {
  const groupScope =
    input.actor.capabilities.includes(capabilities.teamMemberManageAll)
      ? null
      : input.actor.teamProfile?.memberGroupId ?? null;

  for (const projectId of input.projectIds) {
    const project = await queryOne<{ id: string }>(
      db,
      `
        SELECT id
        FROM projects
        WHERE organization_id = $1
          AND workspace_id = $2
          AND id = $3
        LIMIT 1
      `,
      [input.actor.organizationId, input.actor.workspaceId, projectId],
    );

    if (!project) {
      throw new TeamServiceError("team_project_scope_violation");
    }

    if (groupScope) {
      const ownership = await queryOne<{ id: string }>(
        db,
        `
          SELECT id
          FROM team_project_ownerships
          WHERE organization_id = $1
            AND workspace_id = $2
            AND project_id = $3
            AND member_group_id = $4
          LIMIT 1
        `,
        [input.actor.organizationId, input.actor.workspaceId, projectId, groupScope],
      );

      if (!ownership) {
        throw new TeamServiceError("team_project_scope_violation");
      }
    }
  }
}

async function assertAllocatableCredits(
  db: SqlDatabase,
  input: { organizationId: string; amount: number },
) {
  const organization = await queryOne<{
    credit_balance_cached: number;
    credit_reserved_cached: number;
  }>(
    db,
    `
      SELECT credit_balance_cached, credit_reserved_cached
      FROM organizations
      WHERE id = $1
    `,
    [input.organizationId],
  );

  const available =
    (organization?.credit_balance_cached ?? 0) -
    (organization?.credit_reserved_cached ?? 0);
  if (available < input.amount) {
    throw new TeamServiceError("team_credit_insufficient");
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

async function lockOrganizationForTeamMutation(
  db: SqlDatabase,
  organizationId: string,
) {
  await db.query(
    `
      SELECT id
      FROM organizations
      WHERE id = $1
      FOR UPDATE
    `,
    [organizationId],
  );
}

function normalizeTeamAccount(teamAccount: string) {
  return normalizeRequiredText(teamAccount).toLowerCase();
}

function buildTeamAccountEmail(teamAccount: string, teamAccountSuffix: string) {
  return `${teamAccount}@${teamAccountSuffix}.team.local`;
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

function isValidTeamAccount(teamAccount: string) {
  return /^[a-z0-9][a-z0-9_-]{2,31}$/.test(teamAccount);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeRequiredText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableText(value: unknown) {
  const text = normalizeRequiredText(value);
  return text.length > 0 ? text : null;
}
