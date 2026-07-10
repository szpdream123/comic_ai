import {
  capabilities,
  p0Capabilities,
  type Capability,
} from "../../../../../packages/contracts/domain/capabilities.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { findPersistentAuthSessionByToken } from "../identity/persistent-auth.service.ts";

export type MembershipRole =
  | "owner_admin"
  | "producer"
  | "creator"
  | "viewer"
  | "sub_account";

export interface ActorContext {
  actorId: string;
  organizationId: string;
  workspaceId: string | null;
  role: MembershipRole;
  capabilities: Capability[];
  teamMember?: {
    id: string;
    memberAccount: string;
    memberLoginAccount: string;
    memberName: string;
  };
  teamProfile?: {
    membershipId: string;
    memberGroupId: string | null;
    teamAccount: string;
  };
}

interface UserRow {
  id: string;
  status: "active" | "disabled";
}

interface WorkspaceScopeRow {
  workspace_id: string;
  workspace_status: "active" | "archived";
  organization_id: string;
  organization_status: "active" | "suspended" | "archived";
}

interface ProjectScopeRow extends WorkspaceScopeRow {
  project_id: string;
}

interface OrganizationRow {
  id: string;
  status: "active" | "suspended" | "archived";
}

interface MembershipRow {
  id: string;
  role: MembershipRole;
  status: "active" | "invited" | "disabled";
  workspace_id: string | null;
}

interface WorkspaceActorRow {
  user_id: string;
  user_status: "active" | "disabled";
  workspace_id: string | null;
  workspace_status: "active" | "archived" | null;
  organization_id: string | null;
  organization_status: "active" | "suspended" | "archived" | null;
  membership_id: string | null;
  membership_role: MembershipRole | null;
  membership_status: "active" | "invited" | "disabled" | null;
  member_id: string | null;
  member_account: string | null;
  member_login_account: string | null;
  member_name: string | null;
  member_session_status: "active" | "revoked" | "expired" | null;
  member_session_expires_at: Date | string | null;
  member_status: "active" | "disabled" | "deleted" | null;
}

interface SimpleTeamMemberSessionRow {
  member_id: string;
  member_account: string;
  member_login_account: string;
  member_name: string;
  member_session_status: "active" | "revoked" | "expired";
  member_session_expires_at: Date | string;
  member_status: "active" | "disabled" | "deleted";
}

export class AuthorizationError extends Error {
  constructor(
    readonly code:
      | "unauthenticated"
      | "user_disabled"
      | "tenant_scope_required"
      | "workspace_not_found"
      | "workspace_not_active"
      | "project_not_found"
      | "organization_not_found"
      | "organization_not_active"
      | "membership_missing"
      | "membership_disabled"
      | "capability_missing",
  ) {
    super(code);
  }
}

const roleCapabilities: Record<MembershipRole, Capability[]> = {
  owner_admin: [...p0Capabilities],
  producer: [
    capabilities.workspaceRead,
    capabilities.projectView,
    capabilities.projectCreate,
    capabilities.projectEdit,
    capabilities.generationStart,
    capabilities.exportCreate,
    capabilities.billingPurchase,
  ],
  creator: [
    capabilities.workspaceRead,
    capabilities.projectView,
    capabilities.projectCreate,
    capabilities.projectEdit,
    capabilities.generationStart,
    capabilities.exportCreate,
    capabilities.billingPurchase,
  ],
  viewer: [
    capabilities.workspaceRead,
    capabilities.projectView,
    capabilities.billingPurchase,
  ],
  sub_account: [],
};

export async function resolveActorContext(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    workspaceId?: string;
    organizationId?: string;
    projectId?: string;
    capability?: Capability;
    now: Date;
  },
): Promise<ActorContext> {
  const session = await findPersistentAuthSessionByToken(db, {
    token: input.sessionToken,
    now: input.now,
  });

  if (!session) {
    throw new AuthorizationError("unauthenticated");
  }

  if (input.workspaceId && !input.projectId && !input.organizationId) {
    return resolveWorkspaceActorContext(db, {
      authSessionId: session.id,
      userId: session.userId,
      workspaceId: input.workspaceId,
      capability: input.capability,
      now: input.now,
    });
  }

  const user = await queryOne<UserRow>(
    db,
    "SELECT id, status FROM users WHERE id = $1",
    [session.userId],
  );

  if (!user || user.status !== "active") {
    throw new AuthorizationError("user_disabled");
  }

  const simpleTeamMember = await resolveSimpleTeamMemberSession(db, {
    authSessionId: session.id,
    userId: user.id,
    now: input.now,
  });
  const scope = await resolveTenantScope(db, input);
  const membership = await findMembership(db, {
    userId: user.id,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
  });

  if (!membership) {
    throw new AuthorizationError("membership_missing");
  }

  if (membership.status !== "active") {
    throw new AuthorizationError("membership_disabled");
  }

  if (simpleTeamMember && input.projectId) {
    await assertSimpleTeamMemberProjectAccess(db, {
      userId: user.id,
      memberId: simpleTeamMember.id,
      projectId: input.projectId,
    });
  }

  const actor: ActorContext = {
    actorId: user.id,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    role: membership.role,
    capabilities: simpleTeamMember
      ? input.projectId
        ? [
            capabilities.workspaceRead,
            capabilities.projectView,
            capabilities.projectEdit,
            capabilities.generationStart,
            capabilities.exportCreate,
          ]
        : [capabilities.workspaceRead]
      : roleCapabilities[membership.role],
    teamMember: simpleTeamMember,
  };

  if (input.capability) {
    assertCapability(actor, input.capability);
  }

  return actor;
}

async function resolveWorkspaceActorContext(
  db: SqlDatabase,
  input: {
    authSessionId: string;
    userId: string;
    workspaceId: string;
    capability?: Capability;
    now: Date;
  },
): Promise<ActorContext> {
  const row = await queryOne<WorkspaceActorRow>(
    db,
    `
      SELECT
        users.id AS user_id,
        users.status AS user_status,
        workspaces.id AS workspace_id,
        workspaces.status AS workspace_status,
        organizations.id AS organization_id,
        organizations.status AS organization_status,
        memberships.id AS membership_id,
        memberships.role AS membership_role,
        memberships.status AS membership_status,
        team_member.member_id,
        team_member.member_account,
        team_member.member_login_account,
        team_member.member_name,
        team_member.member_session_status,
        team_member.member_session_expires_at,
        team_member.member_status
      FROM users
      LEFT JOIN workspaces ON workspaces.id = $2
      LEFT JOIN organizations ON organizations.id = workspaces.organization_id
      LEFT JOIN LATERAL (
        SELECT id, role, status
        FROM memberships
        WHERE organization_id = organizations.id
          AND user_id = users.id
          AND (workspace_id = workspaces.id OR workspace_id IS NULL)
        ORDER BY workspace_id NULLS LAST
        LIMIT 1
      ) memberships ON true
      LEFT JOIN LATERAL (
        SELECT
          member_session.member_id,
          member.member_account,
          member.member_login_account,
          member.member_name,
          member_session.status AS member_session_status,
          member_session.expires_at AS member_session_expires_at,
          member.status AS member_status
        FROM team_member_auth_sessions member_session
        JOIN team_members member
          ON member.id = member_session.member_id
         AND member.user_id = member_session.user_id
        WHERE member_session.auth_session_id = $3
          AND member_session.user_id = users.id
        LIMIT 1
      ) team_member ON true
      WHERE users.id = $1
      LIMIT 1
    `,
    [input.userId, input.workspaceId, input.authSessionId],
  );

  if (!row || row.user_status !== "active") {
    throw new AuthorizationError("user_disabled");
  }
  if (!row.workspace_id) {
    throw new AuthorizationError("workspace_not_found");
  }
  if (row.organization_status !== "active") {
    throw new AuthorizationError("organization_not_active");
  }
  if (row.workspace_status !== "active") {
    throw new AuthorizationError("workspace_not_active");
  }
  if (!row.membership_id || !row.membership_role) {
    throw new AuthorizationError("membership_missing");
  }
  if (row.membership_status !== "active") {
    throw new AuthorizationError("membership_disabled");
  }
  if (
    row.member_id &&
    (
      row.member_session_status !== "active" ||
      !row.member_session_expires_at ||
      new Date(row.member_session_expires_at).getTime() <= input.now.getTime() ||
      row.member_status !== "active"
    )
  ) {
    throw new AuthorizationError("unauthenticated");
  }

  const actor: ActorContext = {
    actorId: row.user_id,
    organizationId: row.organization_id!,
    workspaceId: row.workspace_id,
    role: row.membership_role,
    capabilities: row.member_id ? [capabilities.workspaceRead] : roleCapabilities[row.membership_role],
    teamMember: row.member_id
      ? {
          id: row.member_id,
          memberAccount: row.member_account!,
          memberLoginAccount: row.member_login_account!,
          memberName: row.member_name!,
        }
      : undefined,
  };
  if (input.capability) {
    assertCapability(actor, input.capability);
  }
  return actor;
}

export function assertCapability(actor: ActorContext, capability: Capability) {
  if (!actor.capabilities.includes(capability)) {
    throw new AuthorizationError("capability_missing");
  }
}

async function resolveSimpleTeamMemberSession(
  db: SqlDatabase,
  input: { authSessionId: string; userId: string; now: Date },
): Promise<ActorContext["teamMember"] | undefined> {
  const row = await queryOne<SimpleTeamMemberSessionRow>(
    db,
    `
      SELECT
        member_session.member_id,
        member.member_account,
        member.member_login_account,
        member.member_name,
        member_session.status AS member_session_status,
        member_session.expires_at AS member_session_expires_at,
        member.status AS member_status
      FROM team_member_auth_sessions member_session
      JOIN team_members member
        ON member.id = member_session.member_id
       AND member.user_id = member_session.user_id
      WHERE member_session.auth_session_id = $1
        AND member_session.user_id = $2
      LIMIT 1
    `,
    [input.authSessionId, input.userId],
  );

  if (!row) {
    return undefined;
  }

  if (
    row.member_session_status !== "active" ||
    new Date(row.member_session_expires_at).getTime() <= input.now.getTime() ||
    row.member_status !== "active"
  ) {
    throw new AuthorizationError("unauthenticated");
  }

  return {
    id: row.member_id,
    memberAccount: row.member_account,
    memberLoginAccount: row.member_login_account,
    memberName: row.member_name,
  };
}

async function assertSimpleTeamMemberProjectAccess(
  db: SqlDatabase,
  input: { userId: string; memberId: string; projectId: string },
) {
  const assignment = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM team_member_projects
      WHERE user_id = $1
        AND member_id = $2
        AND project_id = $3
      LIMIT 1
    `,
    [input.userId, input.memberId, input.projectId],
  );

  if (!assignment) {
    throw new AuthorizationError("project_not_found");
  }
}

async function resolveTenantScope(
  db: SqlDatabase,
  input: {
    workspaceId?: string;
    organizationId?: string;
    projectId?: string;
  },
): Promise<{ organizationId: string; workspaceId: string | null }> {
  if (input.projectId) {
    const scope = await queryOne<ProjectScopeRow>(
      db,
      `
        SELECT
          projects.id AS project_id,
          workspaces.id AS workspace_id,
          workspaces.status AS workspace_status,
          organizations.id AS organization_id,
          organizations.status AS organization_status
        FROM projects
        JOIN workspaces
          ON workspaces.organization_id = projects.organization_id
         AND workspaces.id = projects.workspace_id
        JOIN organizations ON organizations.id = projects.organization_id
        WHERE projects.id = $1
      `,
      [input.projectId],
    );

    if (!scope) {
      throw new AuthorizationError("project_not_found");
    }

    if (scope.organization_status !== "active") {
      throw new AuthorizationError("organization_not_active");
    }

    if (scope.workspace_status !== "active") {
      throw new AuthorizationError("workspace_not_active");
    }

    return {
      organizationId: scope.organization_id,
      workspaceId: scope.workspace_id,
    };
  }

  if (input.workspaceId) {
    const scope = await queryOne<WorkspaceScopeRow>(
      db,
      `
        SELECT
          workspaces.id AS workspace_id,
          workspaces.status AS workspace_status,
          organizations.id AS organization_id,
          organizations.status AS organization_status
        FROM workspaces
        JOIN organizations ON organizations.id = workspaces.organization_id
        WHERE workspaces.id = $1
      `,
      [input.workspaceId],
    );

    if (!scope) {
      throw new AuthorizationError("workspace_not_found");
    }

    if (scope.organization_status !== "active") {
      throw new AuthorizationError("organization_not_active");
    }

    if (scope.workspace_status !== "active") {
      throw new AuthorizationError("workspace_not_active");
    }

    return {
      organizationId: scope.organization_id,
      workspaceId: scope.workspace_id,
    };
  }

  if (input.organizationId) {
    const organization = await queryOne<OrganizationRow>(
      db,
      "SELECT id, status FROM organizations WHERE id = $1",
      [input.organizationId],
    );

    if (!organization) {
      throw new AuthorizationError("organization_not_found");
    }

    if (organization.status !== "active") {
      throw new AuthorizationError("organization_not_active");
    }

    return {
      organizationId: organization.id,
      workspaceId: null,
    };
  }

  throw new AuthorizationError("tenant_scope_required");
}

async function findMembership(
  db: SqlDatabase,
  input: {
    userId: string;
    organizationId: string;
    workspaceId: string | null;
  },
) {
  return queryOne<MembershipRow>(
    db,
    `
      SELECT id, role, status, workspace_id
      FROM memberships
      WHERE organization_id = $1
        AND user_id = $2
        AND (
          workspace_id = $3
          OR workspace_id IS NULL
        )
      ORDER BY workspace_id NULLS LAST
      LIMIT 1
    `,
    [input.organizationId, input.userId, input.workspaceId],
  );
}
