import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createAuthSession } from "../session.service.ts";
import {
  authorizeCanvasActor,
  CanvasAuthorizationError,
  restoreCanvasActorScope,
} from "../canvas-actor-scope.service.ts";

const now = new Date("2026-07-25T08:00:00.000Z");
const ownerUserId = "91000000-0000-4000-8000-000000000001";
const memberId = "92000000-0000-4000-8000-000000000001";
const canvasId = "93000000-0000-4000-8000-000000000001";
const unassignedCanvasId = "93000000-0000-4000-8000-000000000002";

describe("canvas actor scope", { concurrency: false }, () => {
  it("derives owner and assigned-member capabilities without changing ownership", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedIdentityAndCanvases(db);
      const ownerToken = await seedSession(db, "canvas-owner-token");
      const memberToken = await seedSession(db, "canvas-member-token", memberId);

      const owner = await authorizeCanvasActor(db, {
        sessionToken: ownerToken,
        canvasId,
        action: "manage",
        now,
      });
      assert.deepEqual(owner, {
        canvasId,
        ownerUserId,
        principal: "owner",
        actorTeamMemberId: null,
        principalKey: `owner:${ownerUserId}`,
        capabilities: [
          capabilities.canvasView,
          capabilities.canvasEdit,
          capabilities.canvasRun,
          capabilities.canvasManage,
        ],
      });

      const member = await authorizeCanvasActor(db, {
        sessionToken: memberToken,
        canvasId,
        action: "run",
        now,
      });
      assert.equal(member.ownerUserId, ownerUserId);
      assert.equal(member.actorTeamMemberId, memberId);
      assert.equal(member.principalKey, `member:${memberId}`);
      assert.deepEqual(member.capabilities, [
        capabilities.canvasView,
        capabilities.canvasEdit,
        capabilities.canvasRun,
      ]);
      const restoredMember = await restoreCanvasActorScope(db, {
        canvasId,
        ownerUserId,
        actorTeamMemberId: memberId,
      });
      assert.equal(restoredMember.principalKey, `member:${memberId}`);
      assert.ok(restoredMember.capabilities.includes(capabilities.canvasRun));

      await assert.rejects(
        authorizeCanvasActor(db, {
          sessionToken: memberToken,
          canvasId,
          action: "manage",
          now,
        }),
        (error: unknown) => error instanceof CanvasAuthorizationError && error.code === "capability_missing",
      );
      await assert.rejects(
        authorizeCanvasActor(db, {
          sessionToken: memberToken,
          canvasId: unassignedCanvasId,
          action: "view",
          now,
        }),
        (error: unknown) => error instanceof CanvasAuthorizationError && error.code === "canvas_not_found",
      );
      await assert.rejects(
        authorizeCanvasActor(db, {
          sessionToken: ownerToken,
          canvasId: "canvas-project-main",
          action: "view",
          now,
        }),
        (error: unknown) => error instanceof CanvasAuthorizationError && error.code === "canvas_not_found",
      );
      await db.query(
        "DELETE FROM team_member_canvases WHERE member_id = $1 AND canvas_id = $2",
        [memberId, canvasId],
      );
      await assert.rejects(
        authorizeCanvasActor(db, {
          sessionToken: memberToken,
          canvasId,
          action: "edit",
          now,
        }),
        (error: unknown) => error instanceof CanvasAuthorizationError && error.code === "canvas_not_found",
      );
      await assert.rejects(
        restoreCanvasActorScope(db, {
          canvasId,
          ownerUserId,
          actorTeamMemberId: memberId,
        }),
        (error: unknown) => error instanceof CanvasAuthorizationError && error.code === "canvas_not_found",
      );
    } finally {
      await db.close();
    }
  });
});

async function seedIdentityAndCanvases(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800910001', 'active')",
    [ownerUserId],
  );
  await db.query(
    `
      INSERT INTO team_members (
        id, user_id, member_account, member_account_suffix, member_login_account,
        member_name, member_password_hash, member_credits, status
      )
      VALUES ($1, $2, 'canvas-member', 'u91001', 'canvas-member@u91001', 'Canvas Member', 'hash', 0, 'active')
    `,
    [memberId, ownerUserId],
  );
  await db.query(
    `
      INSERT INTO creator_canvas_projects (id, title, status, server_revision, created_by_user_id, updated_by_user_id)
      VALUES
        ($1, 'Assigned Canvas', 'draft', 1, $3, $3),
        ($2, 'Unassigned Canvas', 'draft', 1, $3, $3)
    `,
    [canvasId, unassignedCanvasId, ownerUserId],
  );
  await db.query(
    "INSERT INTO team_member_canvases (id, member_id, user_id, canvas_id) VALUES ($1, $2, $3, $4)",
    ["94000000-0000-4000-8000-000000000001", memberId, ownerUserId, canvasId],
  );
}

async function seedSession(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  token: string,
  teamMemberId?: string,
) {
  const created = await createAuthSession({ userId: ownerUserId, token, now });
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
      ["95000000-0000-4000-8000-000000000001", created.session.id, ownerUserId, teamMemberId, created.session.expiresAt, now],
    );
  }
  return created.token;
}
