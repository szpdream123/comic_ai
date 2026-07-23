import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type {
  AuthSessionCache,
  CachedAuthIdentity,
} from "./auth-session-cache.service.ts";
import { findPersistentAuthSessionByToken } from "./persistent-auth.service.ts";
import type { AuthSession } from "./session.service.ts";

export interface AuthenticatedUser {
  id: string;
  phone: string | null;
  displayName?: string | null;
  actorType?: "user" | "team_member";
  teamMember?: {
    id: string;
    memberAccount: string;
    memberLoginAccount: string;
    memberName: string;
    memberCredits: number;
  } | null;
  creditBalance: number;
  displayCreditBalance: number;
  availableCredits: number;
  reservedCredits: number;
  frozenCredits: number;
  creditFrozenAt: string | null;
  creditFrozenUntil: string | null;
}

export interface AuthenticatedUserSession {
  sessionToken: string;
  session: AuthSession;
  user: AuthenticatedUser;
  [userAuthCacheWrite]?: Promise<void>;
}

export const userAuthCacheWrite = Symbol("userAuthCacheWrite");

export interface ResolveUserAuthOptions {
  now?: Date;
  includeCredit?: boolean;
}

export interface UserAuthService {
  resolveSessionToken(
    sessionToken: string | undefined,
    options?: ResolveUserAuthOptions,
  ): Promise<AuthenticatedUserSession | undefined>;
  resolveCookieHeader(
    cookieHeader: string | undefined,
    options?: ResolveUserAuthOptions,
  ): Promise<AuthenticatedUserSession | undefined>;
}

export function createUserAuthService(deps: {
  db: SqlDatabase;
  authSessionCache?: AuthSessionCache;
}): UserAuthService {
  async function resolveSessionToken(
    sessionToken: string | undefined,
    options: ResolveUserAuthOptions = {},
  ): Promise<AuthenticatedUserSession | undefined> {
    if (!sessionToken) {
      return undefined;
    }

    const now = options.now ?? new Date();
    const cached = await deps.authSessionCache?.get(sessionToken, now);
    if (cached === null) {
      return undefined;
    }

    const session = cached?.session ?? await findPersistentAuthSessionByToken(deps.db, {
      token: sessionToken,
      now,
    });
    if (!session) {
      return undefined;
    }

    const user = cached
      ? {
          id: cached.user.id,
          phone_e164: cached.user.phone,
          display_name: cached.user.displayName ?? null,
          status: "active" as const,
        }
      : await queryOne<{
          id: string;
          phone_e164: string | null;
          display_name: string | null;
          status: "active" | "disabled";
        }>(
          deps.db,
          "SELECT id, phone_e164, display_name, status FROM users WHERE id = $1",
          [session.userId],
        );
    if (!user || user.id !== session.userId || user.status !== "active") {
      return undefined;
    }

    const cachedTeamMember = cached?.user.teamMember;
    const teamMemberSession = cached && !cachedTeamMember
      ? undefined
      : cachedTeamMember
        ? await findCachedTeamMember(deps.db, {
            userId: user.id,
            memberId: cachedTeamMember.id,
            identity: cachedTeamMember,
            session,
          })
        : await findTeamMemberSession(deps.db, {
            userId: user.id,
            authSessionId: session.id,
          });
    if (cachedTeamMember && !teamMemberSession) {
      return undefined;
    }
    if (
      teamMemberSession &&
      (
        teamMemberSession.member_session_status !== "active" ||
        new Date(teamMemberSession.member_session_expires_at).getTime() <= now.getTime() ||
        teamMemberSession.member_status !== "active"
      )
    ) {
      return undefined;
    }

    const credit = options.includeCredit === false
      ? emptyCreditBalance()
      : teamMemberSession
        ? teamMemberCreditBalance(teamMemberSession.member_credits)
        : await getUserCreditBalance(deps.db, user.id);
    const effectiveCredits = credit.availableCredits;

    const cacheWrite = !cached
      ? deps.authSessionCache?.set(sessionToken, {
          session,
          user: {
            id: user.id,
            phone: user.phone_e164,
            displayName: user.display_name,
            actorType: teamMemberSession ? "team_member" : "user",
            teamMember: teamMemberSession
              ? {
                  id: teamMemberSession.member_id,
                  memberAccount: teamMemberSession.member_account,
                  memberLoginAccount: teamMemberSession.member_login_account,
                  memberName: teamMemberSession.member_name,
                }
              : null,
          },
        },
        now,
      )
      : undefined;
    void cacheWrite;

    return {
      sessionToken,
      session,
      ...(cacheWrite ? { [userAuthCacheWrite]: cacheWrite } : {}),
      user: {
        id: user.id,
        phone: user.phone_e164,
        displayName: user.display_name,
        actorType: teamMemberSession ? "team_member" : "user",
        teamMember: teamMemberSession
          ? {
              id: teamMemberSession.member_id,
              memberAccount: teamMemberSession.member_account,
              memberLoginAccount: teamMemberSession.member_login_account,
              memberName: teamMemberSession.member_name,
              memberCredits: Number(teamMemberSession.member_credits ?? 0),
            }
          : null,
        creditBalance: effectiveCredits,
        displayCreditBalance: effectiveCredits,
        availableCredits: effectiveCredits,
        reservedCredits: credit.reservedCredits,
        frozenCredits: credit.frozenCredits,
        creditFrozenAt: credit.creditFrozenAt,
        creditFrozenUntil: credit.creditFrozenUntil,
      },
    };
  }

  return {
    resolveSessionToken,
    resolveCookieHeader(cookieHeader, options) {
      return resolveSessionToken(readAuthSessionToken(cookieHeader), options);
    },
  };
}

export function readAuthSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === "auth_session") {
      return value.join("=") || undefined;
    }
  }
  return undefined;
}

interface TeamMemberSessionIdentity {
  member_id: string;
  member_account: string;
  member_login_account: string;
  member_name: string;
  member_credits: number | string;
  member_session_status: "active" | "revoked" | "expired";
  member_session_expires_at: Date | string;
  member_status: "active" | "disabled" | "deleted";
}

async function findTeamMemberSession(
  db: SqlDatabase,
  input: { userId: string; authSessionId: string },
): Promise<TeamMemberSessionIdentity | undefined> {
  return queryOne<TeamMemberSessionIdentity>(
    db,
    `
      SELECT
        member_session.member_id,
        member.member_account,
        member.member_login_account,
        member.member_name,
        member.member_credits,
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
}

async function findCachedTeamMember(
  db: SqlDatabase,
  input: {
    userId: string;
    memberId: string;
    identity: NonNullable<CachedAuthIdentity["user"]["teamMember"]>;
    session: AuthSession;
  },
): Promise<TeamMemberSessionIdentity | undefined> {
  const row = await queryOne<{
    member_credits: number | string;
    status: "active" | "disabled" | "deleted";
  }>(
    db,
    `
      SELECT member_credits, status
      FROM team_members
      WHERE id = $1
        AND user_id = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.memberId, input.userId],
  );
  if (!row) {
    return undefined;
  }
  return {
    member_id: input.memberId,
    member_account: input.identity.memberAccount,
    member_login_account: input.identity.memberLoginAccount,
    member_name: input.identity.memberName,
    member_credits: row.member_credits,
    member_session_status: "active",
    member_session_expires_at: input.session.expiresAt,
    member_status: row.status,
  };
}

function emptyCreditBalance() {
  return {
    availableCredits: 0,
    creditBalance: 0,
    displayCreditBalance: 0,
    reservedCredits: 0,
    frozenCredits: 0,
    creditFrozenAt: null,
    creditFrozenUntil: null,
  };
}

async function getUserCreditBalance(db: SqlDatabase, userId: string) {
  const row = await queryOne<{
    credit_balance_cached: number | string | null;
    credit_reserved_cached: number | string | null;
    credit_frozen_cached: number | string | null;
    credit_frozen_at: Date | string | null;
    credit_frozen_until: Date | string | null;
  }>(
    db,
    `
      SELECT
        credit_balance_cached,
        credit_reserved_cached,
        credit_frozen_cached,
        credit_frozen_at,
        credit_frozen_until
      FROM users u
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId],
  );
  const availableCredits = Number(row?.credit_balance_cached ?? 0);
  const frozenCredits = Number(row?.credit_frozen_cached ?? 0);
  return {
    availableCredits,
    creditBalance: availableCredits,
    displayCreditBalance: availableCredits + frozenCredits,
    reservedCredits: Number(row?.credit_reserved_cached ?? 0),
    frozenCredits,
    creditFrozenAt: row?.credit_frozen_at ? new Date(row.credit_frozen_at).toISOString() : null,
    creditFrozenUntil: row?.credit_frozen_until ? new Date(row.credit_frozen_until).toISOString() : null,
  };
}

function teamMemberCreditBalance(memberCredits: number | string) {
  const availableCredits = Number(memberCredits ?? 0);
  return {
    availableCredits,
    creditBalance: availableCredits,
    displayCreditBalance: availableCredits,
    reservedCredits: 0,
    frozenCredits: 0,
    creditFrozenAt: null,
    creditFrozenUntil: null,
  };
}
