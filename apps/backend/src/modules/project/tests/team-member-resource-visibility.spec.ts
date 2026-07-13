import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createAuthSession } from "../../identity/session.service.ts";
import { createTeamMember } from "../../identity/team.service.ts";
import { createCreatorApplication } from "../creator-application.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";

const userId = "00000000-0000-4000-8000-000000000001";

describe("team member resource visibility", { concurrency: false }, () => {
  it("filters projects and scripts by team_member resource assignments", async () => {
      const db = await createMigratedTestDb();
      try {
        await seedUser(db);
                    const session = await seedSession(db, userId, "team-member-resource-visibility-session");
      const creator = createCreatorApplication({ db });
      const user = { id: userId, sessionToken: session.token };

      const visibleProject = await creator.createProject({
        user,
        body: {
          name: "可见项目",
          scriptInput: "Episode 1: visible project.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "team-member-resource-visibility-project-1",
        now: new Date("2026-06-20T08:00:00.000Z"),
      });
      await creator.createProject({
        user,
        body: {
          name: "隐藏项目",
          scriptInput: "Episode 1: hidden project.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "team-member-resource-visibility-project-2",
        now: new Date("2026-06-20T08:01:00.000Z"),
      });
      const visibleScript = await creator.importScriptDocument({
        user,
        body: { title: "可见剧本", scriptInput: "第 1 集\n可见剧本正文。" },
        now: new Date("2026-06-20T08:02:00.000Z"),
      });
      await creator.importScriptDocument({
        user,
        body: { title: "隐藏剧本", scriptInput: "第 1 集\n隐藏剧本正文。" },
        now: new Date("2026-06-20T08:03:00.000Z"),
      });

      const visibleProjectId = String((visibleProject.body as any).project.id);
      const visibleScriptId = String((visibleScript.body as any).script.id);
      const member = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director003",
        displayName: "Director Three",
        password: "member-secret-003",
        projectIds: [visibleProjectId],
        scriptIds: [visibleScriptId],
        canvasIds: [],
        now: new Date("2026-06-20T08:04:00.000Z"),
      });
      const memberSession = await seedMemberSession(db, member.member.membershipId, "team-member-resource-visibility-member-session");
      const memberCreator = createCreatorApplication({ db });
      const memberUser = { id: userId, sessionToken: memberSession.token };

      const projects = await memberCreator.listProjects({ user: memberUser, now: new Date("2026-06-20T08:05:00.000Z") });
      const scripts = await memberCreator.listUserScripts({ user: memberUser, now: new Date("2026-06-20T08:06:00.000Z") });

      assert.deepEqual((projects.body as any).projects.map((item: any) => item.id), [visibleProjectId]);
      assert.deepEqual((scripts.body as any).scripts.map((item: any) => item.id), [visibleScriptId]);
    } finally {
      await db.close();
    }
  });
});

async function seedUser(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status, team_seat_limit)
      VALUES ($1, '13800138000', 'active', 1)
    `,
    [userId],
  );


  }

async function seedSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  seededUserId: string,
  token: string,
) {
  const session = await createAuthSession({
    userId: seededUserId,
    token,
    now: new Date("2026-06-20T08:00:00.000Z"),
    ttlMs: 365 * 24 * 60 * 60 * 1000,
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      new Date("2026-06-20T08:00:00.000Z"),
    ],
  );
  return session;
}

async function seedMemberSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  memberId: string,
  token: string,
) {
  const session = await createAuthSession({
    userId,
    token,
    now: new Date("2026-06-20T08:04:30.000Z"),
    ttlMs: 365 * 24 * 60 * 60 * 1000,
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      new Date("2026-06-20T08:04:30.000Z"),
    ],
  );
  await db.query(
    `
      INSERT INTO team_member_auth_sessions (
        id,
        auth_session_id,
        user_id,
        member_id,
        status,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, 'active', $5, $6, NULL, $6)
    `,
    [
      "33000000-0000-4000-8000-000000000001",
      session.session.id,
      userId,
      memberId,
      session.session.expiresAt,
      new Date("2026-06-20T08:04:30.000Z"),
    ],
  );
  return session;
}

function ownerActor() {
  return {
    userId,
    capabilities: [capabilities.teamMemberManageAll],
  };
}
