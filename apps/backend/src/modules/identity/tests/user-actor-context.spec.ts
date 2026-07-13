import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createAuthSession } from "../session.service.ts";
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
