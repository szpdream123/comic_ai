import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createAuthSession } from "../session.service.ts";
import {
  rememberRequestAuthenticatedUser,
  runWithUserAuthRequestContext,
} from "../user-auth-request-context.service.ts";
import {
  resolveUserActorContext,
  UserAuthorizationError,
} from "../user-actor-context.service.ts";

const now = new Date("2026-07-12T08:00:00.000Z");
const ownerUserId = "81000000-0000-4000-8000-000000000001";
const otherUserId = "81000000-0000-4000-8000-000000000002";
const ownedProjectId = "82000000-0000-4000-8000-000000000001";
const otherProjectId = "82000000-0000-4000-8000-000000000002";
const memberId = "83000000-0000-4000-8000-000000000001";

describe("user actor context", { concurrency: false }, () => {
  it("authorizes owners and only explicitly assigned team members", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsersAndProjects(db);
      const ownerToken = await seedSession(db, ownerUserId, "owner-user-actor-token");
      const otherToken = await seedSession(db, otherUserId, "other-user-actor-token");
      const memberToken = await seedSession(db, ownerUserId, "member-user-actor-token", memberId);

      const owner = await resolveUserActorContext(db, {
        sessionToken: ownerToken,
        projectId: ownedProjectId,
        capability: capabilities.projectEdit,
        now,
      });
      assert.equal(owner.userId, ownerUserId);
      assert.equal(owner.teamMember, undefined);

      await assert.rejects(
        resolveUserActorContext(db, {
          sessionToken: otherToken,
          projectId: ownedProjectId,
          now,
        }),
        (error: unknown) => error instanceof UserAuthorizationError && error.code === "project_not_found",
      );

      const member = await resolveUserActorContext(db, {
        sessionToken: memberToken,
        projectId: ownedProjectId,
        capability: capabilities.generationStart,
        now,
      });
      assert.equal(member.userId, ownerUserId);
      assert.equal(member.teamMember?.id, memberId);

      await assert.rejects(
        resolveUserActorContext(db, {
          sessionToken: memberToken,
          projectId: otherProjectId,
          now,
        }),
        (error: unknown) => error instanceof UserAuthorizationError && error.code === "project_not_found",
      );

      await assert.rejects(
        resolveUserActorContext(db, {
          sessionToken: memberToken,
          capability: capabilities.projectCreate,
          now,
        }),
        (error: unknown) => error instanceof UserAuthorizationError && error.code === "capability_missing",
      );

      await db.query(
        "UPDATE team_member_auth_sessions SET status = 'revoked', revoked_at = $2 WHERE member_id = $1",
        [memberId, now],
      );
      await assert.rejects(
        resolveUserActorContext(db, {
          sessionToken: memberToken,
          capability: capabilities.projectCreate,
          now,
        }),
        (error: unknown) => error instanceof UserAuthorizationError && error.code === "unauthenticated",
      );
    } finally {
      await db.close();
    }
  });

  it("checks the user and team member session concurrently after validating the session", async () => {
    const token = "parallel-user-actor-token";
    const created = await createAuthSession({ userId: ownerUserId, token, now });
    const started = new Set<string>();
    let releaseUser!: () => void;
    let releaseMemberSession!: () => void;
    const userGate = new Promise<void>((resolve) => {
      releaseUser = resolve;
    });
    const memberSessionGate = new Promise<void>((resolve) => {
      releaseMemberSession = resolve;
    });
    const db: SqlDatabase = {
      async query<T = Record<string, unknown>>(sql: string) {
        if (sql.includes("FROM auth_sessions")) {
          return {
            rows: [{
              id: created.session.id,
              user_id: created.session.userId,
              status: created.session.status,
              session_token_hash: created.session.sessionTokenHash,
              session_token_hash_version: created.session.sessionTokenHashVersion,
              expires_at: created.session.expiresAt,
              last_seen_at: created.session.lastSeenAt,
              revoked_at: created.session.revokedAt,
            }] as T[],
          };
        }
        if (sql.includes("SELECT id, status FROM users")) {
          started.add("user");
          await userGate;
          return { rows: [{ id: ownerUserId, status: "active" }] as T[] };
        }
        if (sql.includes("FROM team_member_auth_sessions")) {
          started.add("member_session");
          await memberSessionGate;
          return { rows: [] };
        }
        if (sql.includes("SELECT id FROM projects")) {
          return { rows: [{ id: ownedProjectId }] as T[] };
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    };

    const pendingActor = resolveUserActorContext(db, {
      sessionToken: token,
      projectId: ownedProjectId,
      capability: capabilities.projectView,
      now,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const queriesStartedBeforeEitherCompleted = [...started].sort();
    releaseUser();
    releaseMemberSession();

    const actor = await pendingActor;
    assert.deepEqual(queriesStartedBeforeEitherCompleted, ["member_session", "user"]);
    assert.equal(actor.userId, ownerUserId);
  });

  it("reuses the HTTP-authenticated identity and only queries project authorization", async () => {
    const token = "request-scoped-user-actor-token";
    const created = await createAuthSession({ userId: ownerUserId, token, now });
    const queries: string[] = [];
    const db: SqlDatabase = {
      async query<T = Record<string, unknown>>(sql: string) {
        queries.push(sql);
        assert.match(sql, /SELECT id FROM projects/);
        return { rows: [{ id: ownedProjectId }] as T[] };
      },
    };

    const actor = await runWithUserAuthRequestContext(async () => {
      rememberRequestAuthenticatedUser({
        sessionToken: token,
        session: created.session,
        user: {
          id: ownerUserId,
          phone: "13800800001",
          actorType: "user",
          teamMember: null,
          creditBalance: 0,
          displayCreditBalance: 0,
          availableCredits: 0,
          reservedCredits: 0,
          frozenCredits: 0,
          creditFrozenAt: null,
          creditFrozenUntil: null,
        },
      });
      await resolveUserActorContext(db, {
        sessionToken: token,
        projectId: ownedProjectId,
        capability: capabilities.projectView,
        now,
      });
      return resolveUserActorContext(db, {
        sessionToken: token,
        projectId: ownedProjectId,
        capability: capabilities.projectEdit,
        now,
      });
    });

    assert.equal(actor.userId, ownerUserId);
    assert.equal(queries.length, 1);
  });

  it("rechecks capabilities when a cached project actor is reused", async () => {
    const token = "request-scoped-viewer-token";
    const created = await createAuthSession({ userId: ownerUserId, token, now });
    let queryCount = 0;
    const db: SqlDatabase = {
      async query<T = Record<string, unknown>>(sql: string) {
        queryCount += 1;
        assert.match(sql, /FROM team_member_projects/);
        return { rows: [{ id: "assignment-1", role: "viewer" }] as T[] };
      },
    };

    await runWithUserAuthRequestContext(async () => {
      rememberRequestAuthenticatedUser({
        sessionToken: token,
        session: created.session,
        user: {
          id: ownerUserId,
          phone: "13800800001",
          actorType: "team_member",
          teamMember: {
            id: memberId,
            memberAccount: "assigned-member",
            memberLoginAccount: "assigned-member@u00001",
            memberName: "Assigned Member",
            memberCredits: 0,
          },
          creditBalance: 0,
          displayCreditBalance: 0,
          availableCredits: 0,
          reservedCredits: 0,
          frozenCredits: 0,
          creditFrozenAt: null,
          creditFrozenUntil: null,
        },
      });
      await resolveUserActorContext(db, {
        sessionToken: token,
        projectId: ownedProjectId,
        capability: capabilities.projectView,
        now,
      });
      await assert.rejects(
        resolveUserActorContext(db, {
          sessionToken: token,
          projectId: ownedProjectId,
          capability: capabilities.projectEdit,
          now,
        }),
        (error: unknown) =>
          error instanceof UserAuthorizationError && error.code === "capability_missing",
      );
    });

    assert.equal(queryCount, 1);
  });
});

async function seedUsersAndProjects(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '13800800001', 'active'), ($2, '13800800002', 'active')
    `,
    [ownerUserId, otherUserId],
  );
  await db.query(
    `
      INSERT INTO projects (id, name, aspect_ratio, resolution, phase, owner_user_id, created_by_user_id)
      VALUES
        ($1, 'Owned project', '16:9', '1080p', 'script_input', $2, $2),
        ($3, 'Other project', '16:9', '1080p', 'script_input', $4, $4)
    `,
    [ownedProjectId, ownerUserId, otherProjectId, otherUserId],
  );
  await db.query(
    `
      INSERT INTO team_members (
        id, user_id, member_account, member_account_suffix, member_login_account,
        member_name, member_password_hash, member_credits, status
      )
      VALUES ($1, $2, 'assigned-member', 'u00001', 'assigned-member@u00001', 'Assigned Member', 'hash', 0, 'active')
    `,
    [memberId, ownerUserId],
  );
  await db.query(
    "INSERT INTO team_member_projects (id, member_id, user_id, project_id) VALUES ($1, $2, $3, $4)",
    ["84000000-0000-4000-8000-000000000001", memberId, ownerUserId, ownedProjectId],
  );
}

async function seedSession(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  userId: string,
  token: string,
  teamMemberId?: string,
) {
  const created = await createAuthSession({ userId, token, now });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id, user_id, status, session_token_hash, session_token_hash_version,
        expires_at, last_seen_at, revoked_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
    `,
    [
      created.session.id,
      created.session.userId,
      created.session.status,
      created.session.sessionTokenHash,
      created.session.sessionTokenHashVersion,
      created.session.expiresAt,
      now,
      created.session.revokedAt,
    ],
  );
  if (teamMemberId) {
    await db.query(
      `
        INSERT INTO team_member_auth_sessions (
          id, auth_session_id, user_id, member_id, status, expires_at, last_seen_at, created_at
        )
        VALUES ($1, $2, $3, $4, 'active', $5, $6, $6)
      `,
      ["85000000-0000-4000-8000-000000000001", created.session.id, userId, teamMemberId, created.session.expiresAt, now],
    );
  }
  return created.token;
}
