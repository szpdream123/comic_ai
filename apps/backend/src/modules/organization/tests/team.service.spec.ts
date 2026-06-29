import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { verifyTeamCredential } from "../../identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { ActorContext } from "../actor-context.service.ts";
import {
  createTeamMember,
  getTeamOverview,
  listTeamMembers,
  TeamServiceError,
  updateTeamMember,
} from "../team.service.ts";

const now = new Date("2026-06-27T10:00:00.000Z");
const ownerUserId = "00000000-0000-4000-8000-000000000001";
const otherOwnerUserId = "00000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "10000000-0000-4000-8000-000000000002";
const otherWorkspaceId = "20000000-0000-4000-8000-000000000002";

describe("simple team member service", { concurrency: false }, () => {
  it("creates a subaccount only in team_members and deducts owner credits", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);

      const beforeUsers = await countRows(db, "users");
      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director001",
        displayName: "Director One",
        password: "member-secret-001",
        initialCredits: 12,
        now,
      });
      const afterUsers = await countRows(db, "users");
      const member = await db.query<{
        user_id: string;
        member_account: string;
        member_login_account: string;
        member_password_hash: string;
        member_credits: number;
      }>("SELECT * FROM team_members WHERE id = $1", [created.member.membershipId]);
      const ownerWallet = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [ownerUserId],
      );
      const ledgerRows = await db.query<{
        entry_type: string;
        source_type: string;
        amount: number;
      }>(
        "SELECT entry_type, source_type, amount FROM credit_ledger_entries WHERE user_id = $1 ORDER BY created_at ASC",
        [ownerUserId],
      );
      const legacyProfiles = await countRows(db, "team_member_profiles");
      const subaccountMemberships = await db.query("SELECT id FROM memberships WHERE role = 'sub_account'");

      assert.equal(afterUsers, beforeUsers);
      assert.equal(member.rows[0]?.user_id, ownerUserId);
      assert.equal(member.rows[0]?.member_account, "director001");
      assert.match(member.rows[0]?.member_login_account ?? "", /^director001@[a-z0-9]{6}$/);
      assert.equal(member.rows[0]?.member_credits, 12);
      assert.equal(ownerWallet.rows[0]?.credit_balance_cached, 88);
      assert.equal(ledgerRows.rows.length, 1);
      assert.equal(ledgerRows.rows[0]?.entry_type, "transfer_out");
      assert.equal(ledgerRows.rows[0]?.source_type, "team_member_credit_allocation");
      assert.equal(ledgerRows.rows[0]?.amount, 12);
      assert.notEqual(member.rows[0]?.member_password_hash, "member-secret-001");
      assert.equal(
        await verifyTeamCredential({
          password: "member-secret-001",
          passwordHash: member.rows[0]?.member_password_hash ?? "",
        }),
        true,
      );
      assert.equal(legacyProfiles, 0);
      assert.equal(subaccountMemberships.rows.length, 0);
      assert.equal("member_password_hash" in created.member, false);
      assert.equal("passwordHash" in created.member, false);
    } finally {
      await db.close();
    }
  });

  it("lists only the current administrator's team_members", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedOtherTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedTeamEntitlement(db, {
        organizationId: otherOrganizationId,
        entitlementId: "34000000-0000-4000-8000-000000000002",
      });

      await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "sameaccount",
        displayName: "Owner Member",
        password: "member-secret-001",
        now,
      });
      await createTeamMember(db, {
        actor: otherOwnerActor(),
        teamAccount: "sameaccount",
        displayName: "Other Owner Member",
        password: "member-secret-002",
        now,
      });

      const ownerMembers = await listTeamMembers(db, { actor: ownerActor() });
      const otherMembers = await listTeamMembers(db, { actor: otherOwnerActor() });

      assert.deepEqual(ownerMembers.map((member) => member.displayName), ["Owner Member"]);
      assert.deepEqual(otherMembers.map((member) => member.displayName), ["Other Owner Member"]);
      assert.notEqual(ownerMembers[0]?.memberLoginAccount, otherMembers[0]?.memberLoginAccount);
    } finally {
      await db.close();
    }
  });

  it("stores project assignment in team_member_projects", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedProject(db, {
        projectId: "36000000-0000-4000-8000-000000000001",
      });

      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director002",
        displayName: "Director Two",
        password: "member-secret-002",
        projectIds: ["36000000-0000-4000-8000-000000000001"],
        now,
      });
      const assignments = await db.query<{ user_id: string; member_id: string; project_id: string }>(
        "SELECT user_id, member_id, project_id FROM team_member_projects",
      );

      assert.deepEqual(created.member.projectIds, ["36000000-0000-4000-8000-000000000001"]);
      assert.equal(assignments.rows.length, 1);
      assert.equal(assignments.rows[0]?.user_id, ownerUserId);
      assert.equal(assignments.rows[0]?.member_id, created.member.membershipId);
      assert.equal(assignments.rows[0]?.project_id, "36000000-0000-4000-8000-000000000001");
    } finally {
      await db.close();
    }
  });

  it("persists selected script and canvas visibility for later edits", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedProject(db, {
        projectId: "36000000-0000-4000-8000-000000000003",
      });
      await seedScript(db, {
        scriptId: "37000000-0000-4000-8000-000000000001",
        projectId: "36000000-0000-4000-8000-000000000003",
      });
      await seedCanvas(db, {
        canvasId: "38000000-0000-4000-8000-000000000001",
        projectId: "36000000-0000-4000-8000-000000000003",
      });

      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director010",
        displayName: "Director Ten",
        password: "member-secret-010",
        scriptIds: ["37000000-0000-4000-8000-000000000001"],
        canvasIds: ["38000000-0000-4000-8000-000000000001"],
        now,
      });
      const listedAfterCreate = await listTeamMembers(db, { actor: ownerActor() });
      const projectRowsAfterCreate = await db.query("SELECT id FROM team_member_projects WHERE member_id = $1", [
        created.member.membershipId,
      ]);
      const scriptRowsAfterCreate = await db.query("SELECT id FROM team_member_scripts WHERE member_id = $1", [
        created.member.membershipId,
      ]);
      const canvasRowsAfterCreate = await db.query("SELECT id FROM team_member_canvases WHERE member_id = $1", [
        created.member.membershipId,
      ]);

      assert.deepEqual(created.member.projectIds, []);
      assert.deepEqual(created.member.scriptIds, ["37000000-0000-4000-8000-000000000001"]);
      assert.deepEqual(created.member.canvasIds, ["38000000-0000-4000-8000-000000000001"]);
      assert.deepEqual(listedAfterCreate[0]?.scriptIds, ["37000000-0000-4000-8000-000000000001"]);
      assert.deepEqual(listedAfterCreate[0]?.canvasIds, ["38000000-0000-4000-8000-000000000001"]);
      assert.equal(projectRowsAfterCreate.rows.length, 0);
      assert.equal(scriptRowsAfterCreate.rows.length, 1);
      assert.equal(canvasRowsAfterCreate.rows.length, 1);

      const updated = await updateTeamMember(db, {
        actor: ownerActor(),
        memberId: created.member.membershipId,
        displayName: "Director Ten",
        projectIds: [],
        scriptIds: [],
        canvasIds: [],
        now: new Date("2026-06-27T11:30:00.000Z"),
      });
      const listedAfterUpdate = await listTeamMembers(db, { actor: ownerActor() });
      const scriptRowsAfterUpdate = await db.query("SELECT id FROM team_member_scripts WHERE member_id = $1", [
        created.member.membershipId,
      ]);
      const canvasRowsAfterUpdate = await db.query("SELECT id FROM team_member_canvases WHERE member_id = $1", [
        created.member.membershipId,
      ]);

      assert.deepEqual(updated?.scriptIds, []);
      assert.deepEqual(updated?.canvasIds, []);
      assert.deepEqual(listedAfterUpdate[0]?.scriptIds, []);
      assert.deepEqual(listedAfterUpdate[0]?.canvasIds, []);
      assert.equal(scriptRowsAfterUpdate.rows.length, 0);
      assert.equal(canvasRowsAfterUpdate.rows.length, 0);
    } finally {
      await db.close();
    }
  });

  it("stores standalone canvas visibility without forcing a project binding", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedCanvas(db, {
        canvasId: "38000000-0000-4000-8000-000000000002",
        projectId: null,
      });

      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director011",
        displayName: "Director Eleven",
        password: "member-secret-011",
        canvasIds: ["38000000-0000-4000-8000-000000000002"],
        now,
      });
      const assignment = await db.query<{ project_id: string | null; canvas_id: string }>(
        "SELECT project_id::text AS project_id, canvas_id::text AS canvas_id FROM team_member_canvases WHERE member_id = $1",
        [created.member.membershipId],
      );
      const canvas = await db.query<{ project_id: string | null }>(
        "SELECT project_id::text AS project_id FROM creator_canvas_projects WHERE id = $1",
        ["38000000-0000-4000-8000-000000000002"],
      );

      assert.equal(created.member.canvasIds[0], "38000000-0000-4000-8000-000000000002");
      assert.equal(assignment.rows[0]?.canvas_id, "38000000-0000-4000-8000-000000000002");
      assert.equal(assignment.rows[0]?.project_id, null);
      assert.equal(canvas.rows[0]?.project_id, null);
      assert.deepEqual(created.member.projectIds, []);
    } finally {
      await db.close();
    }
  });

  it("updates member profile fields and revokes sessions after password reset or disable", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director003",
        displayName: "Director Three",
        password: "member-secret-003",
        initialCredits: 20,
        now,
      });
      await seedMemberSession(db, {
        authSessionId: "62000000-0000-4000-8000-000000000001",
        memberId: created.member.membershipId,
      });

      const reset = await updateTeamMember(db, {
        actor: ownerActor(),
        memberId: created.member.membershipId,
        displayName: "Director Reset",
        creditAdjustmentType: "increase",
        creditAmount: 5,
        newPassword: "new-member-secret",
        now: new Date("2026-06-27T11:00:00.000Z"),
      });
      const memberAfterReset = await db.query<{ member_password_hash: string }>(
        "SELECT member_password_hash FROM team_members WHERE id = $1",
        [created.member.membershipId],
      );
      const sessionAfterReset = await db.query<{ status: string }>(
        "SELECT status FROM team_member_auth_sessions WHERE member_id = $1",
        [created.member.membershipId],
      );

      assert.equal(reset?.displayName, "Director Reset");
      assert.equal(reset?.creditBalance, 25);
      assert.equal(sessionAfterReset.rows[0]?.status, "revoked");
      assert.equal(
        await verifyTeamCredential({
          password: "new-member-secret",
          passwordHash: memberAfterReset.rows[0]?.member_password_hash ?? "",
        }),
        true,
      );

      await db.query(
        "UPDATE team_member_auth_sessions SET status = 'active', revoked_at = NULL WHERE member_id = $1",
        [created.member.membershipId],
      );
      const disabled = await updateTeamMember(db, {
        actor: ownerActor(),
        memberId: created.member.membershipId,
        status: "disabled",
        now: new Date("2026-06-27T12:00:00.000Z"),
      });
      const sessionAfterDisable = await db.query<{ status: string }>(
        "SELECT status FROM team_member_auth_sessions WHERE member_id = $1",
        [created.member.membershipId],
      );

      assert.equal(disabled?.status, "disabled");
      assert.equal(sessionAfterDisable.rows[0]?.status, "revoked");
    } finally {
      await db.close();
    }
  });

  it("moves credits between owner and subaccount on increase and deduct", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-credit",
        displayName: "Director Credit",
        password: "member-secret-cred",
        initialCredits: 10,
        now,
      });

      const increased = await updateTeamMember(db, {
        actor: ownerActor(),
        memberId: created.member.membershipId,
        creditAdjustmentType: "increase",
        creditAmount: 15,
        now: new Date("2026-06-27T11:00:00.000Z"),
      });
      const afterIncreaseOwner = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [ownerUserId],
      );
      const afterIncreaseMember = await db.query<{ member_credits: number }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [created.member.membershipId],
      );

      assert.equal(increased?.creditBalance, 25);
      assert.equal(afterIncreaseOwner.rows[0]?.credit_balance_cached, 75);
      assert.equal(afterIncreaseMember.rows[0]?.member_credits, 25);

      const deducted = await updateTeamMember(db, {
        actor: ownerActor(),
        memberId: created.member.membershipId,
        creditAdjustmentType: "deduct",
        creditAmount: 5,
        now: new Date("2026-06-27T12:00:00.000Z"),
      });
      const afterDeductOwner = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [ownerUserId],
      );
      const afterDeductMember = await db.query<{ member_credits: number }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [created.member.membershipId],
      );

      assert.equal(deducted?.creditBalance, 20);
      assert.equal(afterDeductOwner.rows[0]?.credit_balance_cached, 80);
      assert.equal(afterDeductMember.rows[0]?.member_credits, 20);
    } finally {
      await db.close();
    }
  });

  it("rejects credit increases when owner balance is insufficient and rejects member deductions past balance", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db, { ownerCredits: 5 });
      await seedTeamEntitlement(db);
      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-low",
        displayName: "Director Low",
        password: "member-secret-low",
        initialCredits: 5,
        now,
      });

      await assert.rejects(
        updateTeamMember(db, {
          actor: ownerActor(),
          memberId: created.member.membershipId,
          creditAdjustmentType: "increase",
          creditAmount: 1,
          now: new Date("2026-06-27T11:00:00.000Z"),
        }),
        teamError("team_credit_insufficient"),
      );
      await assert.rejects(
        updateTeamMember(db, {
          actor: ownerActor(),
          memberId: created.member.membershipId,
          creditAdjustmentType: "deduct",
          creditAmount: 6,
          now: new Date("2026-06-27T11:30:00.000Z"),
        }),
        teamError("team_member_input_invalid"),
      );
    } finally {
      await db.close();
    }
  });

  it("soft deletes members without deleting assignments and hides deleted members from default list", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedProject(db, {
        projectId: "36000000-0000-4000-8000-000000000002",
      });
      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director004",
        displayName: "Director Four",
        password: "member-secret-004",
        projectIds: ["36000000-0000-4000-8000-000000000002"],
        now,
      });

      const deleted = await updateTeamMember(db, {
        actor: ownerActor(),
        memberId: created.member.membershipId,
        status: "deleted",
        now: new Date("2026-06-27T12:00:00.000Z"),
      });
      const listed = await listTeamMembers(db, { actor: ownerActor() });
      const assignments = await db.query("SELECT id FROM team_member_projects WHERE member_id = $1", [
        created.member.membershipId,
      ]);

      assert.equal(deleted?.status, "deleted");
      assert.equal(listed.length, 0);
      assert.equal(assignments.rows.length, 1);
    } finally {
      await db.close();
    }
  });

  it("counts active seats from team_members in the overview", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director005",
        displayName: "Director Five",
        password: "member-secret-005",
        now,
      });

      const overview = await getTeamOverview(db, {
        actor: ownerActor(),
        now,
      });

      assert.equal(overview.seats.used, 1);
      assert.equal(overview.team.memberCount, 1);
      assert.equal(overview.permissions.canCreateMember, true);
    } finally {
      await db.close();
    }
  });

  it("rejects creating members without the paid entitlement", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);

      await assert.rejects(
        createTeamMember(db, {
          actor: ownerActor(),
          teamAccount: "director006",
          displayName: "Director Six",
          password: "member-secret-006",
          now,
        }),
        teamError("team_member_management_required"),
      );
    } finally {
      await db.close();
    }
  });
});

function ownerActor(): ActorContext {
  return {
    actorId: ownerUserId,
    organizationId,
    workspaceId,
    role: "owner_admin",
    capabilities: Object.values(capabilities),
  };
}

function otherOwnerActor(): ActorContext {
  return {
    actorId: otherOwnerUserId,
    organizationId: otherOrganizationId,
    workspaceId: otherWorkspaceId,
    role: "owner_admin",
    capabilities: Object.values(capabilities),
  };
}

async function seedTeamTenant(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { userId?: string; organizationId?: string; workspaceId?: string; seatLimit?: number; ownerCredits?: number } = {},
) {
  const seededUserId = input.userId ?? ownerUserId;
  const seededOrganizationId = input.organizationId ?? organizationId;
  const seededWorkspaceId = input.workspaceId ?? workspaceId;
  const ownerCredits = input.ownerCredits ?? 100;

  await db.query(
    `
      INSERT INTO users (id, phone_e164, status, credit_balance_cached)
      VALUES ($1, $2, 'active', $3)
    `,
    [seededUserId, seededUserId === ownerUserId ? "13800138000" : "13800138001", ownerCredits],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status, credit_balance_cached)
      VALUES ($1, 'Studio', 'active', 0)
    `,
    [seededOrganizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Main Workspace', 'active')
    `,
    [seededWorkspaceId, seededOrganizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES ($1, $2, $3, $4, 'owner_admin', 'active')
    `,
    [
      seededUserId === ownerUserId
        ? "30000000-0000-4000-8000-000000000001"
        : "30000000-0000-4000-8000-000000000002",
      seededOrganizationId,
      seededWorkspaceId,
      seededUserId,
    ],
  );
  await db.query(
    `
      INSERT INTO team_plan_limits (
        id,
        organization_id,
        seat_limit,
        single_account_concurrency_limit
      )
      VALUES ($1, $2, $3, 1)
    `,
    [
      seededUserId === ownerUserId
        ? "33000000-0000-4000-8000-000000000001"
        : "33000000-0000-4000-8000-000000000002",
      seededOrganizationId,
      input.seatLimit ?? 50,
    ],
  );
}

async function seedOtherTeamTenant(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await seedTeamTenant(db, {
    userId: otherOwnerUserId,
    organizationId: otherOrganizationId,
    workspaceId: otherWorkspaceId,
  });
}

async function seedTeamEntitlement(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { organizationId?: string; entitlementId?: string } = {},
) {
  await db.query(
    `
      INSERT INTO organization_entitlements (
        id,
        organization_id,
        entitlement_key,
        status,
        source
      )
      VALUES ($1, $2, 'team_member_management', 'active', 'dev_seed')
    `,
    [
      input.entitlementId ?? "34000000-0000-4000-8000-000000000001",
      input.organizationId ?? organizationId,
    ],
  );
}

async function seedProject(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { projectId: string },
) {
  await db.query(
    `
      INSERT INTO projects (
        id,
        organization_id,
        workspace_id,
        name,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id
      )
      VALUES ($1, $2, $3, 'Assigned Project', '9:16', '1080p', 'script_input', $4)
    `,
    [input.projectId, organizationId, workspaceId, ownerUserId],
  );
}

async function seedScript(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { scriptId: string; projectId: string },
) {
  await db.query(
    `
      INSERT INTO scripts (
        id,
        organization_id,
        project_id,
        input_text,
        status
      )
      VALUES ($1, $2, $3, 'Assigned Script', 'draft')
    `,
    [input.scriptId, organizationId, input.projectId],
  );
}

async function seedCanvas(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { canvasId: string; projectId: string | null },
) {
  await db.query(
    `
      INSERT INTO creator_canvas_projects (
        id,
        organization_id,
        workspace_id,
        project_id,
        title,
        status,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES ($1, $2, $3, $4, 'Assigned Canvas', 'draft', $5, $5)
    `,
    [input.canvasId, organizationId, workspaceId, input.projectId, ownerUserId],
  );
}

async function seedMemberSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { authSessionId: string; memberId: string },
) {
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        expires_at,
        created_at
      )
      VALUES ($1, $2, 'active', 'hashed-token', '2026-06-28T10:00:00.000Z', $3)
    `,
    [input.authSessionId, ownerUserId, now],
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
        created_at
      )
      VALUES (
        '63000000-0000-4000-8000-000000000001',
        $1,
        $2,
        $3,
        'active',
        '2026-06-28T10:00:00.000Z',
        $4
      )
    `,
    [input.authSessionId, ownerUserId, input.memberId, now],
  );
}

async function countRows(
  db: { query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  tableName: string,
) {
  const result = await db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

function teamError(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof TeamServiceError);
    assert.equal(error.code, code);
    return true;
  };
}
