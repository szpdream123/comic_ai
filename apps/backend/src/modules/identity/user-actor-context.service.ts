import {
  capabilities,
  p0Capabilities,
  type Capability,
} from "../../../../../packages/contracts/domain/capabilities.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { findPersistentAuthSessionByToken } from "./persistent-auth.service.ts";
import {
  getRequestAuthenticatedUser,
  getRequestUserActor,
  rememberRequestUserActor,
} from "./user-auth-request-context.service.ts";

export interface UserActorContext {
  userId: string;
  capabilities: Capability[];
  teamMember?: {
    id: string;
    memberAccount: string;
    memberLoginAccount: string;
    memberName: string;
  };
}

export class UserAuthorizationError extends Error {
  constructor(
    readonly code:
      | "unauthenticated"
      | "user_disabled"
      | "project_not_found"
      | "capability_missing",
  ) {
    super(code);
  }
}

export async function resolveUserActorContext(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    projectId?: string;
    capability?: Capability;
    now: Date;
  },
): Promise<UserActorContext> {
  const requestActor = getRequestUserActor(input.sessionToken, input.projectId);
  if (requestActor) {
    if (input.capability) {
      assertUserCapability(requestActor, input.capability);
    }
    return requestActor;
  }
  const requestAuthenticated = getRequestAuthenticatedUser(input.sessionToken, input.now);
  if (requestAuthenticated) {
    return authorizeUserActor(db, input, {
      userId: requestAuthenticated.user.id,
      teamMember: requestAuthenticated.user.teamMember
        ? {
            id: requestAuthenticated.user.teamMember.id,
            memberAccount: requestAuthenticated.user.teamMember.memberAccount,
            memberLoginAccount: requestAuthenticated.user.teamMember.memberLoginAccount,
            memberName: requestAuthenticated.user.teamMember.memberName,
          }
        : undefined,
    });
  }

  const session = await findPersistentAuthSessionByToken(db, {
    token: input.sessionToken,
    now: input.now,
  });
  if (!session) {
    throw new UserAuthorizationError("unauthenticated");
  }

  const [user, memberSession] = await Promise.all([
    queryOne<{ id: string; status: "active" | "disabled" }>(
      db,
      "SELECT id, status FROM users WHERE id = $1",
      [session.userId],
    ),
    queryOne<{
      session_status: "active" | "revoked" | "expired";
      session_expires_at: Date;
      id: string | null;
      member_account: string | null;
      member_login_account: string | null;
      member_name: string | null;
      member_status: "active" | "disabled" | null;
      deleted_at: Date | null;
    }>(
      db,
      `
        SELECT
          member_session.status AS session_status,
          member_session.expires_at AS session_expires_at,
          member.id,
          member.member_account,
          member.member_login_account,
          member.member_name,
          member.status AS member_status,
          member.deleted_at
        FROM team_member_auth_sessions member_session
        LEFT JOIN team_members member
          ON member.id = member_session.member_id
         AND member.user_id = member_session.user_id
        WHERE member_session.auth_session_id = $1
          AND member_session.user_id = $2
        LIMIT 1
      `,
      [session.id, session.userId],
    ),
  ]);
  if (!user || user.status !== "active") {
    throw new UserAuthorizationError("user_disabled");
  }
  if (
    memberSession && (
      memberSession.session_status !== "active"
      || memberSession.session_expires_at <= input.now
      || !memberSession.id
      || memberSession.member_status !== "active"
      || memberSession.deleted_at !== null
    )
  ) {
    throw new UserAuthorizationError("unauthenticated");
  }
  const member = memberSession?.id
    ? {
        id: memberSession.id,
        memberAccount: memberSession.member_account!,
        memberLoginAccount: memberSession.member_login_account!,
        memberName: memberSession.member_name!,
      }
    : undefined;

  return authorizeUserActor(db, input, {
    userId: user.id,
    teamMember: member,
  });
}

async function authorizeUserActor(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    projectId?: string;
    capability?: Capability;
  },
  identity: {
    userId: string;
    teamMember?: UserActorContext["teamMember"];
  },
): Promise<UserActorContext> {
  const member = identity.teamMember;
  let projectRole: "producer" | "creator" | "viewer" | null = null;
  if (input.projectId) {
    if (member) {
      const assignment = await queryOne<{
        id: string;
        role: "producer" | "creator" | "viewer";
      }>(
        db,
        `
          SELECT assignment.id, assignment.role
          FROM team_member_projects assignment
          JOIN projects project
            ON project.id = assignment.project_id
           AND project.owner_user_id = assignment.user_id
          WHERE assignment.user_id = $1
            AND assignment.member_id = $2
            AND assignment.project_id = $3
          LIMIT 1
        `,
        [identity.userId, member.id, input.projectId],
      );
      if (!assignment) {
        throw new UserAuthorizationError("project_not_found");
      }
      projectRole = assignment.role;
    } else {
      const project = await queryOne<{ id: string }>(
        db,
        "SELECT id FROM projects WHERE id = $1 AND owner_user_id = $2",
        [input.projectId, identity.userId],
      );
      if (!project) {
        throw new UserAuthorizationError("project_not_found");
      }
    }
  }

  const actor: UserActorContext = {
    userId: identity.userId,
    capabilities: member
      ? input.projectId
        ? projectRole === "viewer"
          ? [capabilities.accountRead, capabilities.projectView]
          : [
              capabilities.accountRead,
              capabilities.projectView,
              capabilities.projectEdit,
              capabilities.generationStart,
              capabilities.exportCreate,
            ]
        : [capabilities.accountRead]
      : [...p0Capabilities],
    teamMember: member,
  };
  if (input.capability) {
    assertUserCapability(actor, input.capability);
  }
  rememberRequestUserActor(input.sessionToken, input.projectId, actor);
  return actor;
}

export function assertUserCapability(actor: UserActorContext, capability: Capability) {
  if (!actor.capabilities.includes(capability)) {
    throw new UserAuthorizationError("capability_missing");
  }
}
