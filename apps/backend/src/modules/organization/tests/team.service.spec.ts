import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { ActorContext } from "../actor-context.service.ts";
import {
  createTeamMember,
  getTeamOverview,
  listTeamMembers,
  TeamServiceError,
} from "../team.service.ts";

const now = new Date("2026-05-28T10:00:00.000Z");
const ownerUserId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";

describe("team service", { concurrency: false }, () => {
  it("rejects member creation before the paid member-management entitlement is active", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);

      await assert.rejects(
        createTeamMember(db, {
          actor: ownerActor(),
          teamAccount: "director001",
          displayName: "Director One",
          businessRole: "director",
          projectIds: [],
          initialCredits: 0,
          now,
        }),
        teamError("team_member_management_required"),
      );
    } finally {
      await db.close();
    }
  });

  it("creates an entitled subaccount with only a hashed stored password", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);

      const result = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director001",
        displayName: "Director One",
        businessRole: "director",
        projectIds: [],
        initialCredits: 0,
        remark: "Core production role",
        now,
      });

      assert.equal(result.member.teamAccount, "director001");
      assert.equal(result.member.businessRole, "director");
      assert.match(result.temporaryPassword, /^[A-Za-z0-9_-]{18,}$/);

      const users = await db.query<{
        password_hash: string | null;
        phone_e164: string | null;
        email: string | null;
      }>(
        `
          SELECT users.password_hash, users.phone_e164, users.email
          FROM users
          JOIN memberships ON memberships.user_id = users.id
          WHERE memberships.id = $1
        `,
        [result.member.membershipId],
      );

      assert.match(users.rows[0]?.password_hash ?? "", /^scrypt:v1:/);
      assert.notEqual(users.rows[0]?.password_hash, result.temporaryPassword);
      assert.equal(users.rows[0]?.phone_e164, null);
      assert.equal(
        users.rows[0]?.email,
        "director001.20000000000040008000000000000001@team.local",
      );
    } finally {
      await db.close();
    }
  });

  it("lists team members without exposing stored credentials", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);

      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director001",
        displayName: "Director One",
        businessRole: "director",
        projectIds: [],
        initialCredits: 0,
        now,
      });

      const members = await listTeamMembers(db, {
        actor: ownerActor(),
      });

      assert.equal(members.length, 1);
      assert.equal(members[0]?.membershipId, created.member.membershipId);
      assert.equal(members[0]?.teamAccount, "director001");
      assert.equal("temporaryPassword" in members[0], false);
      assert.equal("passwordHash" in members[0], false);
      assert.equal("password_hash" in members[0], false);
    } finally {
      await db.close();
    }
  });

  it("rejects unsafe team account input before creating a subaccount", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);

      await assert.rejects(
        createTeamMember(db, {
          actor: ownerActor(),
          teamAccount: "  ",
          displayName: "Director One",
          businessRole: "director",
          projectIds: [],
          initialCredits: 0,
          now,
        }),
        teamError("team_member_input_invalid"),
      );
    } finally {
      await db.close();
    }
  });

  it("rejects malformed credit and project inputs at the service boundary", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);

      await assert.rejects(
        createTeamMember(db, {
          actor: ownerActor(),
          teamAccount: "director_bad_credit",
          displayName: "Bad Credit",
          businessRole: "director",
          projectIds: [],
          initialCredits: "abc" as unknown as number,
          now,
        }),
        teamError("team_member_input_invalid"),
      );
      await assert.rejects(
        createTeamMember(db, {
          actor: ownerActor(),
          teamAccount: "director_bad_project",
          displayName: "Bad Project",
          businessRole: "director",
          projectIds: ["not-a-project-id"],
          initialCredits: 0,
          now,
        }),
        teamError("team_project_scope_violation"),
      );
      await assert.rejects(
        createTeamMember(db, {
          actor: ownerActor(),
          teamAccount: "director_bad_role",
          displayName: "Bad Role",
          businessRole: "super_admin" as never,
          projectIds: [],
          initialCredits: 0,
          now,
        }),
        teamError("team_member_input_invalid"),
      );
    } finally {
      await db.close();
    }
  });

  it("rejects member creation when all paid seats are already used", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db, { seatLimit: 1 });
      await seedTeamEntitlement(db);
      await seedExistingSubaccount(db, {
        userId: "00000000-0000-4000-8000-000000000002",
        membershipId: "30000000-0000-4000-8000-000000000002",
        profileId: "32000000-0000-4000-8000-000000000002",
        teamAccount: "existing001",
      });

      await assert.rejects(
        createTeamMember(db, {
          actor: ownerActor(),
          teamAccount: "director002",
          displayName: "Director Two",
          businessRole: "director",
          projectIds: [],
          initialCredits: 0,
          now,
        }),
        teamError("team_seat_limit_reached"),
      );
    } finally {
      await db.close();
    }
  });

  it("prevents group admins from assigning members to projects outside their group", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedMemberGroup(db, {
        groupId: "35000000-0000-4000-8000-000000000001",
        name: "Group A",
      });
      await seedMemberGroup(db, {
        groupId: "35000000-0000-4000-8000-000000000002",
        name: "Group B",
      });
      await seedProjectOwnedByGroup(db, {
        projectId: "36000000-0000-4000-8000-000000000001",
        groupId: "35000000-0000-4000-8000-000000000002",
      });

      await assert.rejects(
        createTeamMember(db, {
          actor: groupAdminActor("35000000-0000-4000-8000-000000000001"),
          teamAccount: "director003",
          displayName: "Director Three",
          businessRole: "director",
          memberGroupId: "35000000-0000-4000-8000-000000000001",
          projectIds: ["36000000-0000-4000-8000-000000000001"],
          initialCredits: 0,
          now,
        }),
        teamError("team_project_scope_violation"),
      );
    } finally {
      await db.close();
    }
  });

  it("defaults group admin member creation to the actor member group", async () => {
    const db = await createMigratedTestDb();
    try {
      const groupId = "35000000-0000-4000-8000-000000000001";
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedMemberGroup(db, {
        groupId,
        name: "Group A",
      });

      const result = await createTeamMember(db, {
        actor: groupAdminActor(groupId),
        teamAccount: "director003",
        displayName: "Director Three",
        businessRole: "director",
        projectIds: [],
        initialCredits: 0,
        now,
      });

      assert.equal(result.member.memberGroupId, groupId);
      const members = await listTeamMembers(db, {
        actor: groupAdminActor(groupId),
      });
      assert.equal(members.length, 1);
      assert.equal(members[0]?.teamAccount, "director003");
      assert.equal(members[0]?.memberGroupId, groupId);
    } finally {
      await db.close();
    }
  });

  it("prevents group admins from creating global administrators", async () => {
    const db = await createMigratedTestDb();
    try {
      const groupId = "35000000-0000-4000-8000-000000000001";
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedMemberGroup(db, {
        groupId,
        name: "Group A",
      });

      await assert.rejects(
        createTeamMember(db, {
          actor: groupAdminActor(groupId),
          teamAccount: "admin001",
          displayName: "Unexpected Admin",
          businessRole: "admin",
          memberGroupId: groupId,
          projectIds: [],
          initialCredits: 0,
          now,
        }),
        teamError("team_permission_missing"),
      );
    } finally {
      await db.close();
    }
  });

  it("rejects member groups outside the actor workspace before creating a subaccount", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedExternalMemberGroup(db, {
        groupId: "35000000-0000-4000-8000-000000000099",
      });

      await assert.rejects(
        createTeamMember(db, {
          actor: ownerActor(),
          teamAccount: "director099",
          displayName: "Director Ninety Nine",
          businessRole: "director",
          memberGroupId: "35000000-0000-4000-8000-000000000099",
          projectIds: [],
          initialCredits: 0,
          now,
        }),
        teamError("team_group_scope_violation"),
      );

      const members = await listTeamMembers(db, {
        actor: ownerActor(),
      });
      assert.equal(members.length, 0);
    } finally {
      await db.close();
    }
  });

  it("rejects archived member groups before creating a subaccount", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);
      await seedTeamEntitlement(db);
      await seedMemberGroup(db, {
        groupId: "35000000-0000-4000-8000-000000000003",
        name: "Archived Group",
        status: "archived",
      });

      await assert.rejects(
        createTeamMember(db, {
          actor: ownerActor(),
          teamAccount: "director004",
          displayName: "Director Four",
          businessRole: "director",
          memberGroupId: "35000000-0000-4000-8000-000000000003",
          projectIds: [],
          initialCredits: 0,
          now,
        }),
        teamError("team_group_scope_violation"),
      );
    } finally {
      await db.close();
    }
  });

  it("reports paid entitlement, seat usage, and allocatable credits in overview", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db, { seatLimit: 5, credits: 1200 });
      await seedTeamEntitlement(db);
      await seedExistingSubaccount(db, {
        userId: "00000000-0000-4000-8000-000000000002",
        membershipId: "30000000-0000-4000-8000-000000000002",
        profileId: "32000000-0000-4000-8000-000000000002",
        teamAccount: "existing001",
      });

      const overview = await getTeamOverview(db, {
        actor: ownerActor(),
        now,
      });

      assert.deepEqual(overview.entitlements, {
        teamMemberManagement: true,
        teamAssetLibrary: false,
        teamDashboard: false,
      });
      assert.equal(overview.seats.used, 1);
      assert.equal(overview.seats.limit, 5);
      assert.equal(overview.credits.allocatable, 1200);
      assert.deepEqual(overview.permissions, {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
        canManageAll: true,
        canManageGroup: false,
      });
    } finally {
      await db.close();
    }
  });

  it("reports read-only team overview actors without create-member permission", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db, { seatLimit: 5 });
      await seedTeamEntitlement(db);

      const overview = await getTeamOverview(db, {
        actor: {
          actorId: ownerUserId,
          organizationId,
          workspaceId,
          role: "sub_account",
          capabilities: [capabilities.teamMemberRead],
        },
        now,
      });

      assert.equal(overview.entitlements.teamMemberManagement, true);
      assert.equal(overview.permissions.canReadMembers, true);
      assert.equal(overview.permissions.canCreateMember, false);
      assert.equal(overview.permissions.canManageAll, false);
      assert.equal(overview.permissions.canManageGroup, false);
    } finally {
      await db.close();
    }
  });

  it("rejects overview access without a team read or dashboard capability", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamTenant(db);

      await assert.rejects(
        getTeamOverview(db, {
          actor: {
            actorId: ownerUserId,
            organizationId,
            workspaceId,
            role: "creator",
            capabilities: [capabilities.projectView],
          },
          now,
        }),
        teamError("team_permission_missing"),
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

function groupAdminActor(groupId: string): ActorContext {
  return {
    actorId: ownerUserId,
    organizationId,
    workspaceId,
    role: "sub_account",
    capabilities: [
      capabilities.teamMemberRead,
      capabilities.teamMemberManageGroup,
      capabilities.teamCreditAllocateGroup,
      capabilities.teamDashboardViewGroup,
    ],
    teamProfile: {
      membershipId: "30000000-0000-4000-8000-000000000001",
      businessRole: "group_admin",
      memberGroupId: groupId,
      teamAccount: "group-admin",
    },
  };
}

async function seedTeamTenant(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { seatLimit?: number; credits?: number } = {},
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800138000', 'active')
    `,
    [ownerUserId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status, credit_balance_cached)
      VALUES ($1, 'Studio', 'active', $2)
    `,
    [organizationId, input.credits ?? 0],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Main Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES (
        '30000000-0000-4000-8000-000000000001',
        $1,
        $2,
        $3,
        'owner_admin',
        'active'
      )
    `,
    [organizationId, workspaceId, ownerUserId],
  );
  await db.query(
    `
      INSERT INTO team_plan_limits (
        id,
        organization_id,
        seat_limit,
        single_account_concurrency_limit
      )
      VALUES (
        '33000000-0000-4000-8000-000000000001',
        $1,
        $2,
        1
      )
    `,
    [organizationId, input.seatLimit ?? 5],
  );
}

async function seedTeamEntitlement(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
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
      VALUES (
        '34000000-0000-4000-8000-000000000001',
        $1,
        'team_member_management',
        'active',
        'dev_seed'
      )
    `,
    [organizationId],
  );
}

async function seedMemberGroup(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { groupId: string; name: string; status?: "active" | "archived" },
) {
  await db.query(
    `
      INSERT INTO team_member_groups (
        id,
        organization_id,
        workspace_id,
        name,
        status,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.groupId,
      organizationId,
      workspaceId,
      input.name,
      input.status ?? "active",
      ownerUserId,
    ],
  );
}

async function seedExternalMemberGroup(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { groupId: string },
) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ('10000000-0000-4000-8000-000000000099', 'External Studio', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        '20000000-0000-4000-8000-000000000099',
        '10000000-0000-4000-8000-000000000099',
        'External Workspace',
        'active'
      )
    `,
  );
  await db.query(
    `
      INSERT INTO team_member_groups (
        id,
        organization_id,
        workspace_id,
        name,
        status,
        created_by_user_id
      )
      VALUES (
        $1,
        '10000000-0000-4000-8000-000000000099',
        '20000000-0000-4000-8000-000000000099',
        'External Group',
        'active',
        $2
      )
    `,
    [input.groupId, ownerUserId],
  );
}

async function seedProjectOwnedByGroup(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { projectId: string; groupId: string },
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
      VALUES ($1, $2, $3, 'Scoped Project', '9:16', '1080p', 'script_input', $4)
    `,
    [input.projectId, organizationId, workspaceId, ownerUserId],
  );
  await db.query(
    `
      INSERT INTO team_project_ownerships (
        id,
        organization_id,
        workspace_id,
        project_id,
        member_group_id
      )
      VALUES (
        '37000000-0000-4000-8000-000000000001',
        $1,
        $2,
        $3,
        $4
      )
    `,
    [organizationId, workspaceId, input.projectId, input.groupId],
  );
}

async function seedExistingSubaccount(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    userId: string;
    membershipId: string;
    profileId: string;
    teamAccount: string;
  },
) {
  await db.query(
    `
      INSERT INTO users (id, display_name, password_hash, status)
      VALUES ($1, 'Existing Member', 'scrypt:v1:salt:hash', 'active')
    `,
    [input.userId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES ($1, $2, $3, $4, 'sub_account', 'active')
    `,
    [input.membershipId, organizationId, workspaceId, input.userId],
  );
  await db.query(
    `
      INSERT INTO team_member_profiles (
        id,
        organization_id,
        workspace_id,
        membership_id,
        team_account,
        display_name,
        business_role,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, 'Existing Member', 'director', $6)
    `,
    [
      input.profileId,
      organizationId,
      workspaceId,
      input.membershipId,
      input.teamAccount,
      ownerUserId,
    ],
  );
}

function teamError(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof TeamServiceError);
    assert.equal(error.code, code);
    return true;
  };
}
