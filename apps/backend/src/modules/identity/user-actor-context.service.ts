import {
  capabilities,
  p0Capabilities,
  type Capability,
} from "../../../../../packages/contracts/domain/capabilities.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { findPersistentAuthSessionByToken } from "./persistent-auth.service.ts";

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
  const session = await findPersistentAuthSessionByToken(db, {
    token: input.sessionToken,
    now: input.now,
  });
  if (!session) {
    throw new UserAuthorizationError("unauthenticated");
  }

  const user = await queryOne<{ id: string; status: "active" | "disabled" }>(
    db,
    "SELECT id, status FROM users WHERE id = $1",
    [session.userId],
  );
  if (!user || user.status !== "active") {
    throw new UserAuthorizationError("user_disabled");
  }

  const memberSession = await queryOne<{
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
    [session.id, user.id],
  );
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
        member_account: memberSession.member_account!,
        member_login_account: memberSession.member_login_account!,
        member_name: memberSession.member_name!,
      }
    : null;

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
        [user.id, member.id, input.projectId],
      );
      if (!assignment) {
        throw new UserAuthorizationError("project_not_found");
      }
      projectRole = assignment.role;
    } else {
      const project = await queryOne<{ id: string }>(
        db,
        "SELECT id FROM projects WHERE id = $1 AND owner_user_id = $2",
        [input.projectId, user.id],
      );
      if (!project) {
        throw new UserAuthorizationError("project_not_found");
      }
    }
  }

  const actor: UserActorContext = {
    userId: user.id,
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
    teamMember: member
      ? {
          id: member.id,
          memberAccount: member.member_account,
          memberLoginAccount: member.member_login_account,
          memberName: member.member_name,
        }
      : undefined,
  };
  if (input.capability) {
    assertUserCapability(actor, input.capability);
  }
  return actor;
}

export function assertUserCapability(actor: UserActorContext, capability: Capability) {
  if (!actor.capabilities.includes(capability)) {
    throw new UserAuthorizationError("capability_missing");
  }
}
