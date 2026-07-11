import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createAuthSession } from "../../identity/session.service.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";
import {
  AuthorizationError,
  resolveActorContext,
} from "../actor-context.service.ts";

process.env.AUTH_SECRET_PEPPER ??= "actor-context-user-ownership-test-pepper";

const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-2000-8000-000000000001";
const foreignWorkspaceId = "00000000-0000-2000-8000-000000000002";
const legacyWorkspaceId = "b0000000-0000-4000-8000-000000000001";
const projectId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-10T10:00:00.000Z");

describe("actor context user ownership", () => {
  it("authorizes an active main user without using organization status or membership", async () => {
    const fixture = await createActorFixture({ projectOwnerUserId: userId });

    const actor = await resolveActorContext(fixture.db, {
      sessionToken: fixture.token,
      workspaceId,
      capability: capabilities.projectCreate,
      now,
    });

    assert.equal(actor.actorId, userId);
    assert.equal(actor.organizationId, organizationId);
    assert.equal(actor.workspaceId, workspaceId);
    assert.equal(actor.role, "owner_admin");
    assert.ok(actor.capabilities.includes(capabilities.projectCreate));
    assert.equal(
      fixture.queries.some((sql) => /\bmemberships\b/i.test(sql)),
      false,
      "organization memberships must not participate in main-user authorization",
    );
  });

  it("rejects a workspace that has no ownership relationship to the authenticated user", async () => {
    const foreignWorkspace = await createActorFixture({ projectOwnerUserId: otherUserId });

    await assert.rejects(
      resolveActorContext(foreignWorkspace.db, {
        sessionToken: foreignWorkspace.token,
        workspaceId: foreignWorkspaceId,
        capability: capabilities.projectCreate,
        now,
      }),
      errorWithCode("workspace_not_found"),
    );
    await assert.rejects(
      resolveActorContext(foreignWorkspace.db, {
        sessionToken: foreignWorkspace.token,
        workspaceId: foreignWorkspaceId,
        organizationId,
        capability: capabilities.projectCreate,
        now,
      }),
      errorWithCode("workspace_not_found"),
    );
  });

  it("keeps platform operations outside a main user's self-service capabilities", async () => {
    const fixture = await createActorFixture({ projectOwnerUserId: userId });

    const actor = await resolveActorContext(fixture.db, {
      sessionToken: fixture.token,
      workspaceId,
      now,
    });

    assert.ok(actor.capabilities.includes(capabilities.projectCreate));
    assert.ok(actor.capabilities.includes(capabilities.teamMemberManageAll));
    assert.equal(actor.capabilities.includes(capabilities.billingRefund), false);
    assert.equal(actor.capabilities.includes(capabilities.adminBillingConfig), false);
    assert.equal(actor.capabilities.includes(capabilities.adminAuthManage), false);
    assert.equal(actor.capabilities.includes(capabilities.opsSettle), false);
  });

  it("accepts a legacy workspace only when the compatibility adapter links it to the user", async () => {
    const linked = await createActorFixture({
      projectOwnerUserId: userId,
      legacyMembership: true,
    });
    const actor = await resolveActorContext(linked.db, {
      sessionToken: linked.token,
      workspaceId: legacyWorkspaceId,
      now,
    });
    assert.equal(actor.actorId, userId);

    const unlinked = await createActorFixture({ projectOwnerUserId: userId });
    await assert.rejects(
      resolveActorContext(unlinked.db, {
        sessionToken: unlinked.token,
        workspaceId: legacyWorkspaceId,
        now,
      }),
      errorWithCode("workspace_not_found"),
    );
  });

  it("rejects an ambiguous legacy workspace linked to multiple main users", async () => {
    const ambiguous = await createActorFixture({
      projectOwnerUserId: userId,
      legacyOwners: [userId, otherUserId],
    });

    await assert.rejects(
      resolveActorContext(ambiguous.db, {
        sessionToken: ambiguous.token,
        workspaceId: legacyWorkspaceId,
        now,
      }),
      errorWithCode("workspace_not_found"),
    );
  });

  it("rejects an organization-only resource owned by another user", async () => {
    const foreignResource = await createActorFixture({ projectOwnerUserId: userId });

    await assert.rejects(
      resolveActorContext(foreignResource.db, {
        sessionToken: foreignResource.token,
        organizationId,
        resourceOwnerUserId: otherUserId,
        now,
      }),
      errorWithCode("organization_not_found"),
    );
  });

  it("authorizes an owned project by created_by_user_id and rejects another user's project", async () => {
    const owned = await createActorFixture({ projectOwnerUserId: userId });
    const actor = await resolveActorContext(owned.db, {
      sessionToken: owned.token,
      projectId,
      capability: capabilities.projectEdit,
      now,
    });

    assert.equal(actor.actorId, userId);
    assert.equal(actor.workspaceId, workspaceId);

    const foreign = await createActorFixture({ projectOwnerUserId: otherUserId });
    await assert.rejects(
      resolveActorContext(foreign.db, {
        sessionToken: foreign.token,
        projectId,
        capability: capabilities.projectEdit,
        now,
      }),
      errorWithCode("project_not_found"),
    );
  });

  it("keeps sub-user project access limited to explicit user-owned assignments", async () => {
    const assigned = await createActorFixture({
      projectOwnerUserId: userId,
      teamMember: true,
      assigned: true,
    });
    const actor = await resolveActorContext(assigned.db, {
      sessionToken: assigned.token,
      projectId,
      capability: capabilities.projectEdit,
      now,
    });

    assert.ok(actor.teamMember);
    assert.ok(actor.capabilities.includes(capabilities.projectEdit));
    assert.equal(actor.capabilities.includes(capabilities.teamMemberManageAll), false);

    const unassigned = await createActorFixture({
      projectOwnerUserId: userId,
      teamMember: true,
      assigned: false,
    });
    await assert.rejects(
      resolveActorContext(unassigned.db, {
        sessionToken: unassigned.token,
        projectId,
        capability: capabilities.projectEdit,
        now,
      }),
      errorWithCode("project_not_found"),
    );

    const foreignAssigned = await createActorFixture({
      projectOwnerUserId: otherUserId,
      teamMember: true,
      assigned: true,
    });
    await assert.rejects(
      resolveActorContext(foreignAssigned.db, {
        sessionToken: foreignAssigned.token,
        projectId,
        capability: capabilities.projectEdit,
        now,
      }),
      errorWithCode("project_not_found"),
    );
  });
});

async function createActorFixture(input: {
  projectOwnerUserId: string;
  teamMember?: boolean;
  assigned?: boolean;
  legacyMembership?: boolean;
  legacyOwners?: string[];
}) {
  const token = "user-owned-session-token";
  const session = await createAuthSession({ userId, token, now });
  const queries: string[] = [];
  const db: SqlDatabase = {
    async query<T>(sql: string) {
      queries.push(sql);
      const normalized = sql.replace(/\s+/g, " ").trim();
      let rows: unknown[] = [];

      if (normalized.includes("FROM auth_sessions")) {
        rows = [{
          id: session.session.id,
          user_id: session.session.userId,
          status: session.session.status,
          session_token_hash: session.session.sessionTokenHash,
          session_token_hash_version: session.session.sessionTokenHashVersion,
          expires_at: session.session.expiresAt,
          last_seen_at: session.session.lastSeenAt,
          revoked_at: session.session.revokedAt,
        }];
      } else if (normalized.includes("WITH legacy_owners")) {
        const owners = input.legacyOwners ?? (input.legacyMembership ? [userId] : []);
        rows = [{
          owner_count: owners.length,
          current_user_owned: owners.includes(userId),
        }];
      } else if (normalized.includes("FROM team_member_projects")) {
        rows = input.assigned && input.projectOwnerUserId === userId
          ? [{ id: "41000000-0000-4000-8000-000000000001" }]
          : [];
      } else if (normalized.includes("LEFT JOIN workspaces")) {
        rows = [{
          user_id: userId,
          user_status: "active",
          workspace_id: workspaceId,
          workspace_status: "archived",
          organization_id: organizationId,
          organization_status: "suspended",
          member_id: null,
          member_account: null,
          member_login_account: null,
          member_name: null,
          member_session_status: null,
          member_session_expires_at: null,
          member_status: null,
        }];
      } else if (normalized.includes("FROM projects")) {
        rows = [{
          project_id: projectId,
          workspace_id: workspaceId,
          workspace_status: "archived",
          organization_id: organizationId,
          organization_status: "suspended",
          created_by_user_id: input.projectOwnerUserId,
        }];
      } else if (normalized.includes("FROM users")) {
        rows = [{ id: userId, status: "active", user_id: userId, user_status: "active" }];
      } else if (normalized.includes("FROM team_member_auth_sessions")) {
        rows = input.teamMember ? [{
          member_id: "40000000-0000-4000-8000-000000000001",
          member_account: "artist001",
          member_login_account: "artist001@user",
          member_name: "Artist",
          member_session_status: "active",
          member_session_expires_at: new Date("2026-07-11T10:00:00.000Z"),
          member_status: "active",
        }] : [];
      } else if (normalized.includes("FROM workspaces")) {
        rows = [{
          workspace_id: workspaceId,
          workspace_status: "archived",
          organization_id: organizationId,
          organization_status: "suspended",
        }];
      } else if (normalized.includes("FROM organizations")) {
        rows = [{ id: organizationId }];
      }

      return { rows: rows as T[] };
    },
  };

  return { db, token, queries };
}

function errorWithCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof AuthorizationError);
    assert.equal(error.code, code);
    return true;
  };
}
