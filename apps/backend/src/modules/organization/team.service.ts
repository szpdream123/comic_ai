import { randomUUID } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import {
  createTeamTemporaryCredential,
} from "../identity/team-account-credentials.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { ActorContext } from "./actor-context.service.ts";
import {
  isTeamBusinessRole,
  type TeamBusinessRole,
} from "./team-roles.ts";

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
  displayName: string;
  businessRole: TeamBusinessRole;
  memberGroupId: string | null;
  status: "active" | "invited" | "disabled";
  creditBalance: number;
  creditUsed: number;
  remark: string | null;
}

export interface CreateTeamMemberInput {
  actor: ActorContext;
  teamAccount: string;
  displayName: string;
  businessRole: TeamBusinessRole;
  memberGroupId?: string | null;
  projectIds?: string[];
  initialCredits?: number;
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
  assertBusinessRole(input.businessRole);
  assertCanAssignBusinessRole(input.actor, input.businessRole);

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
  const virtualEmail = buildTeamAccountEmail(normalizedTeamAccount, workspaceId);

  await runInTransaction(db, async () => {
    await lockOrganizationForTeamMutation(db, input.actor.organizationId);
    await assertActiveEntitlement(db, {
      organizationId: input.actor.organizationId,
      entitlementKey: "team_member_management",
      now: input.now,
    });

    const planLimits = await resolvePlanLimits(db, input.actor.organizationId);
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
          business_role,
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
        input.businessRole,
        memberGroupId,
        initialCredits,
        normalizeNullableText(input.remark),
        input.actor.actorId,
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
      displayName,
      businessRole: input.businessRole,
      memberGroupId,
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

  const planLimits = await resolvePlanLimits(db, input.actor.organizationId);
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
    display_name: string;
    business_role: TeamBusinessRole;
    member_group_id: string | null;
    status: "active" | "invited" | "disabled";
    credit_balance_cached: number;
    credit_used_cached: number;
    remark: string | null;
  }>(
    `
      SELECT
        membership.id AS membership_id,
        membership.user_id,
        profile.team_account,
        profile.display_name,
        profile.business_role,
        profile.member_group_id,
        membership.status,
        profile.credit_balance_cached,
        profile.credit_used_cached,
        profile.remark
      FROM team_member_profiles profile
      JOIN memberships membership
        ON membership.organization_id = profile.organization_id
       AND membership.id = profile.membership_id
      WHERE profile.organization_id = $1
        AND profile.workspace_id = $2
        ${groupScopeSql}
      ORDER BY profile.created_at DESC, profile.id DESC
    `,
    params,
  );

  return result.rows.map((row) => ({
    membershipId: row.membership_id,
    userId: row.user_id,
    teamAccount: row.team_account,
    displayName: row.display_name,
    businessRole: row.business_role,
    memberGroupId: row.member_group_id,
    status: row.status,
    creditBalance: row.credit_balance_cached,
    creditUsed: row.credit_used_cached,
    remark: row.remark,
  }));
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

function assertBusinessRole(role: string): asserts role is TeamBusinessRole {
  if (!isTeamBusinessRole(role)) {
    throw new TeamServiceError("team_member_input_invalid");
  }
}

function assertCanAssignBusinessRole(actor: ActorContext, role: TeamBusinessRole) {
  if (actor.capabilities.includes(capabilities.teamMemberManageAll)) {
    return;
  }

  if (role === "admin") {
    throw new TeamServiceError("team_permission_missing");
  }
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
      SELECT id
      FROM organization_entitlements
      WHERE organization_id = $1
        AND entitlement_key = $2
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > $3)
      LIMIT 1
    `,
    [input.organizationId, input.entitlementKey, input.now],
  );

  return Boolean(entitlement);
}

async function resolvePlanLimits(db: SqlDatabase, organizationId: string) {
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
    [organizationId],
  );

  return {
    seatLimit: limits?.seat_limit ?? 5,
    singleAccountConcurrencyLimit: limits?.single_account_concurrency_limit ?? 1,
  };
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
  input: { actor: ActorContext; teamAccount: string },
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

  if (existing) {
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

function buildTeamAccountEmail(teamAccount: string, workspaceId: string) {
  return `${teamAccount}.${workspaceId.replaceAll("-", "")}@team.local`;
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
