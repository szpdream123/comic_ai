import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { verifyTeamCredential } from "../team-account-credentials.service.ts";
import { runWithDatabaseContext } from "../../shared/db/dev-db.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { UserActorContext as ActorContext } from "../user-actor-context.service.ts";
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

describe("simple team member service", { concurrency: false }, () => {
  it("creates a subaccount only in team_members and deducts owner credits", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
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
        team_member_id: string | null;
        entry_type: string;
        source_type: string;
        amount: number;
        balance_after: number;
      }>(
        "SELECT team_member_id::text, entry_type, source_type, amount, balance_after FROM credit_ledger_entries WHERE user_id = $1 ORDER BY created_at ASC",
        [ownerUserId],
      );
      const legacyTables = await db.query<{ profiles: string | null; member_links: string | null }>(
        "SELECT to_regclass('team_member_profiles')::text AS profiles, to_regclass('memberships')::text AS member_links",
      );

      assert.equal(afterUsers, beforeUsers);
      assert.equal(member.rows[0]?.user_id, ownerUserId);
      assert.equal(member.rows[0]?.member_account, "director001");
      assert.match(member.rows[0]?.member_login_account ?? "", /^director001@[a-z0-9]{6}$/);
      assert.equal(member.rows[0]?.member_credits, 12);
      assert.equal(ownerWallet.rows[0]?.credit_balance_cached, 88);
      assert.equal(ledgerRows.rows.length, 2);
      const ownerDebit = ledgerRows.rows.find((entry) => entry.entry_type === "transfer_out");
      assert.equal(ownerDebit?.source_type, "team_member_credit_allocation");
      assert.equal(ownerDebit?.amount, 12);
      assert.equal(ownerDebit?.balance_after, 88);
      assert.equal(ledgerRows.rows.find((entry) => entry.team_member_id === created.member.membershipId)?.balance_after, 12);
      assert.notEqual(member.rows[0]?.member_password_hash, "member-secret-001");
      assert.equal(
        await verifyTeamCredential({
          password: "member-secret-001",
          passwordHash: member.rows[0]?.member_password_hash ?? "",
        }),
        true,
      );
      assert.deepEqual(legacyTables.rows[0], { profiles: null, member_links: null });
      assert.equal("member_password_hash" in created.member, false);
      assert.equal("passwordHash" in created.member, false);
    } finally {
      await db.close();
    }
  });

  it("lists only the current administrator's team_members", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
      await seedOtherTeamUser(db);
      await seedTeamEntitlement(db);
      await seedTeamEntitlement(db, {
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

  it("allows the same member name because the login account is the unique account identity", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
      await seedTeamEntitlement(db);

      const first = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-name-1",
        displayName: "Director Same",
        password: "member-secret-001",
        now,
      });
      const second = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-name-2",
        displayName: "Director Same",
        password: "member-secret-002",
        now,
      });

      assert.equal(first.member.displayName, "Director Same");
      assert.equal(second.member.displayName, "Director Same");
      assert.notEqual(first.member.memberLoginAccount, second.member.memberLoginAccount);
    } finally {
      await db.close();
    }
  });

  it("allows the same member account prefix when the complete login account is unique", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
      await seedOtherTeamUser(db);
      await seedTeamEntitlement(db);
      await seedTeamEntitlement(db, {
        entitlementId: "34000000-0000-4000-8000-000000000002",
      });

      const first = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-shared",
        displayName: "Owner Member",
        password: "member-secret-001",
        now,
      });
      const second = await createTeamMember(db, {
        actor: otherOwnerActor(),
        teamAccount: "director-shared",
        displayName: "Other Owner Member",
        password: "member-secret-002",
        now,
      });

      assert.equal(first.member.teamAccount, "director-shared");
      assert.equal(second.member.teamAccount, "director-shared");
      assert.notEqual(first.member.memberLoginAccount, second.member.memberLoginAccount);
    } finally {
      await db.close();
    }
  });

  it("stores project assignment in team_member_projects", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
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
      await seedTeamUser(db);
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
      assert.deepEqual(created.member.inheritedProjectIds, ["36000000-0000-4000-8000-000000000003"]);
      assert.deepEqual(created.member.scriptIds, ["37000000-0000-4000-8000-000000000001"]);
      assert.deepEqual(created.member.canvasIds, ["38000000-0000-4000-8000-000000000001"]);
      assert.deepEqual(listedAfterCreate[0]?.inheritedProjectIds, ["36000000-0000-4000-8000-000000000003"]);
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
      assert.deepEqual(listedAfterUpdate[0]?.inheritedProjectIds, []);
      assert.deepEqual(listedAfterUpdate[0]?.scriptIds, []);
      assert.deepEqual(listedAfterUpdate[0]?.canvasIds, []);
      assert.equal(scriptRowsAfterUpdate.rows.length, 0);
      assert.equal(canvasRowsAfterUpdate.rows.length, 0);
    } finally {
      await db.close();
    }
  });

  it("keeps existing project, script, and canvas assignments when editing profile fields only", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
      await seedTeamEntitlement(db);
      await seedProject(db, {
        projectId: "36000000-0000-4000-8000-000000000010",
      });
      await seedScript(db, {
        scriptId: "37000000-0000-4000-8000-000000000010",
        projectId: "36000000-0000-4000-8000-000000000010",
      });
      await seedCanvas(db, {
        canvasId: "38000000-0000-4000-8000-000000000010",
        projectId: "36000000-0000-4000-8000-000000000010",
      });

      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-edit",
        displayName: "Director Edit",
        password: "member-secret-edit",
        projectIds: ["36000000-0000-4000-8000-000000000010"],
        scriptIds: ["37000000-0000-4000-8000-000000000010"],
        canvasIds: ["38000000-0000-4000-8000-000000000010"],
        now,
      });

      const updated = await updateTeamMember(db, {
        actor: ownerActor(),
        memberId: created.member.membershipId,
        displayName: "Director Edit v2",
        remark: "profile only",
        now: new Date("2026-06-27T11:40:00.000Z"),
      });
      const listed = await listTeamMembers(db, { actor: ownerActor() });

      assert.equal(updated?.displayName, "Director Edit v2");
      assert.equal(updated?.remark, null);
      assert.deepEqual(updated?.projectIds, ["36000000-0000-4000-8000-000000000010"]);
      assert.deepEqual(updated?.scriptIds, ["37000000-0000-4000-8000-000000000010"]);
      assert.deepEqual(updated?.canvasIds, ["38000000-0000-4000-8000-000000000010"]);
      assert.deepEqual(listed[0]?.projectIds, ["36000000-0000-4000-8000-000000000010"]);
      assert.deepEqual(listed[0]?.scriptIds, ["37000000-0000-4000-8000-000000000010"]);
      assert.deepEqual(listed[0]?.canvasIds, ["38000000-0000-4000-8000-000000000010"]);
    } finally {
      await db.close();
    }
  });

  it("rejects removing project access when project records already exist", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
      await seedTeamEntitlement(db);
      await seedProject(db, {
        projectId: "36000000-0000-4000-8000-000000000020",
      });

      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-record",
        displayName: "Director Record",
        password: "member-secret-record",
        projectIds: ["36000000-0000-4000-8000-000000000020"],
        now,
      });

      await db.query(
        `
          INSERT INTO team_member_project_records (
            id,
            user_id,
            member_id,
            project_id,
            record_type,
            record_status,
            record_title
          )
          VALUES (
            '62000000-0000-4000-8000-000000000020',
            '00000000-0000-4000-8000-000000000001',
            $1,
            '36000000-0000-4000-8000-000000000020',
            'project_view',
            'recorded',
            'Viewed assigned project'
          )
        `,
        [created.member.membershipId],
      );

      await assert.rejects(
        updateTeamMember(db, {
          actor: ownerActor(),
          memberId: created.member.membershipId,
          projectIds: [],
          now: new Date("2026-06-27T11:00:00.000Z"),
        }),
        teamError("team_member_project_in_use"),
      );
    } finally {
      await db.close();
    }
  });

  it("allows removing unrecorded project access while keeping recorded projects intact", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
      await seedTeamEntitlement(db);
      await seedProject(db, {
        projectId: "36000000-0000-4000-8000-000000000021",
      });
      await seedProject(db, {
        projectId: "36000000-0000-4000-8000-000000000022",
      });

      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-record-keep",
        displayName: "Director Record Keep",
        password: "member-secret-record-keep",
        projectIds: [
          "36000000-0000-4000-8000-000000000021",
          "36000000-0000-4000-8000-000000000022",
        ],
        now,
      });

      await db.query(
        `
          INSERT INTO team_member_project_records (
            id,
            user_id,
            member_id,
            project_id,
            record_type,
            record_status,
            record_title
          )
          VALUES (
            '62000000-0000-4000-8000-000000000021',
            '00000000-0000-4000-8000-000000000001',
            $1,
            '36000000-0000-4000-8000-000000000021',
            'project_view',
            'recorded',
            'Viewed recorded project'
          )
        `,
        [created.member.membershipId],
      );

      const updated = await updateTeamMember(db, {
        actor: ownerActor(),
        memberId: created.member.membershipId,
        projectIds: ["36000000-0000-4000-8000-000000000021"],
        now: new Date("2026-06-27T11:00:00.000Z"),
      });
      const remainingProjects = await db.query<{ project_id: string }>(
        "SELECT project_id::text AS project_id FROM team_member_projects WHERE member_id = $1 ORDER BY project_id ASC",
        [created.member.membershipId],
      );

      assert.deepEqual(updated?.projectIds, ["36000000-0000-4000-8000-000000000021"]);
      assert.deepEqual(remainingProjects.rows.map((row) => row.project_id), [
        "36000000-0000-4000-8000-000000000021",
      ]);
    } finally {
      await db.close();
    }
  });

  it("stores standalone canvas visibility without forcing a project binding", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
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
      await seedTeamUser(db);
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
      await seedTeamUser(db);
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
      const afterIncreaseLedger = await db.query<{
        user_id: string;
        team_member_id: string | null;
        entry_type: string;
        source_type: string;
        amount: number;
        balance_after: number;
      }>(
        `
          SELECT user_id::text AS user_id, team_member_id::text, entry_type, source_type, amount, balance_after
          FROM credit_ledger_entries
          WHERE user_id = $1
            AND metadata_json->>'memberId' = $2
          ORDER BY created_at ASC, id ASC
        `,
        [ownerUserId, created.member.membershipId],
      );

      assert.equal(increased?.creditBalance, 25);
      assert.equal(afterIncreaseOwner.rows[0]?.credit_balance_cached, 75);
      assert.equal(afterIncreaseMember.rows[0]?.member_credits, 25);
      assert.equal(afterIncreaseLedger.rows.length, 4);
      const increaseOwnerLedger = afterIncreaseLedger.rows.find((entry) =>
        entry.source_type === "team_member_credit_allocation" && entry.entry_type === "transfer_out" && entry.amount === 15
      );
      const increaseMemberLedger = afterIncreaseLedger.rows.find((entry) =>
        entry.source_type === "team_member_credit_allocation" && entry.entry_type === "transfer_in" && entry.amount === 15
      );
      assert.equal(increaseOwnerLedger?.balance_after, 75);
      assert.equal(increaseMemberLedger?.balance_after, 25);

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
      const afterDeductLedger = await db.query<{
        user_id: string;
        team_member_id: string | null;
        entry_type: string;
        source_type: string;
        amount: number;
        balance_after: number;
      }>(
        `
          SELECT user_id::text AS user_id, team_member_id::text, entry_type, source_type, amount, balance_after
          FROM credit_ledger_entries
          WHERE user_id = $1
            AND metadata_json->>'memberId' = $2
          ORDER BY created_at ASC, id ASC
        `,
        [ownerUserId, created.member.membershipId],
      );

      assert.equal(deducted?.creditBalance, 20);
      assert.equal(afterDeductOwner.rows[0]?.credit_balance_cached, 80);
      assert.equal(afterDeductMember.rows[0]?.member_credits, 20);
      const deductOwnerLedger = afterDeductLedger.rows.find((entry) =>
        entry.source_type === "team_member_credit_deduction" && entry.entry_type === "transfer_in"
      );
      const deductMemberLedger = afterDeductLedger.rows.find((entry) =>
        entry.source_type === "team_member_credit_deduction" && entry.entry_type === "transfer_out"
      );
      assert.equal(deductOwnerLedger?.balance_after, 80);
      assert.equal(deductMemberLedger?.balance_after, 20);
    } finally {
      await db.close();
    }
  });

  it("keeps member credits updated when credit adjustment is submitted", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
      await seedTeamEntitlement(db);
      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-credit-submit",
        displayName: "Director Credit Submit",
        password: "member-secret-submit",
        initialCredits: 8,
        now,
      });

      const updated = await updateTeamMember(db, {
        actor: ownerActor(),
        memberId: created.member.membershipId,
        creditAdjustmentType: "increase",
        creditAmount: 7,
        now: new Date("2026-06-27T11:00:00.000Z"),
      });

      assert.equal(updated?.creditBalance, 15);
      assert.equal(updated?.status, "active");
    } finally {
      await db.close();
    }
  });

  it("rejects credit increases when owner balance is insufficient and rejects member deductions past balance", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db, { ownerCredits: 5 });
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
        teamError("team_member_credit_insufficient"),
      );
    } finally {
      await db.close();
    }
  });

  it("serializes concurrent member credit deductions against the locked balance", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
      await seedTeamEntitlement(db);
      const created = await createTeamMember(db, {
        actor: ownerActor(),
        teamAccount: "director-concurrent-deduct",
        displayName: "Director Concurrent Deduct",
        password: "member-secret-concurrent",
        initialCredits: 10,
        now,
      });

      const results = await Promise.allSettled([
        runWithDatabaseContext(() => updateTeamMember(db, {
          actor: ownerActor(),
          memberId: created.member.membershipId,
          creditAdjustmentType: "deduct",
          creditAmount: 7,
          now: new Date("2026-06-27T11:40:00.000Z"),
        })),
        runWithDatabaseContext(() => updateTeamMember(db, {
          actor: ownerActor(),
          memberId: created.member.membershipId,
          creditAdjustmentType: "deduct",
          creditAmount: 7,
          now: new Date("2026-06-27T11:40:01.000Z"),
        })),
      ]);

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected");
      assert.ok(rejected?.status === "rejected");
      assert.ok(rejected.reason instanceof TeamServiceError);
      assert.equal(rejected.reason.code, "team_member_credit_insufficient");

      const member = await db.query<{ member_credits: number }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [created.member.membershipId],
      );
      const ledger = await db.query<{ balance_after: number }>(
        `
          SELECT balance_after
          FROM credit_ledger_entries
          WHERE user_id = $1
            AND team_member_id = $2
            AND source_type = 'team_member_credit_deduction'
        `,
        [ownerUserId, created.member.membershipId],
      );
      assert.equal(member.rows[0]?.member_credits, 3);
      assert.deepEqual(ledger.rows.map((entry) => entry.balance_after), [3]);
    } finally {
      await db.close();
    }
  });

  it("soft deletes members without deleting assignments and hides deleted members from default list", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db);
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
      await seedTeamUser(db);
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

  it("uses user team seats over active plan defaults in the overview", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db, { seatLimit: 36 });
      await seedTeamEntitlement(db);
      await seedActiveProfessionalPeriod(db, { planSeatLimit: 0 });

      const overview = await getTeamOverview(db, {
        actor: ownerActor(),
        now,
      });

      assert.equal(overview.seats.limit, 36);
      assert.equal(overview.seats.remaining, 36);
    } finally {
      await db.close();
    }
  });

  it("does not use package seats for user team limits", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db, { seatLimit: 0 });
      await seedTeamEntitlement(db);
      await seedActiveProfessionalPeriod(db, { planSeatLimit: 36 });

      const overview = await getTeamOverview(db, {
        actor: ownerActor(),
        now,
      });

      assert.equal(overview.seats.limit, 0);
      assert.equal(overview.seats.remaining, 0);
    } finally {
      await db.close();
    }
  });

  it("rejects creating members without the paid entitlement", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTeamUser(db, { seatLimit: 0 });

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
    userId: ownerUserId,
    capabilities: Object.values(capabilities),
  };
}

function otherOwnerActor(): ActorContext {
  return {
    userId: otherOwnerUserId,
    capabilities: Object.values(capabilities),
  };
}

async function seedTeamUser(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { userId?: string; seatLimit?: number; ownerCredits?: number } = {},
) {
  const seededUserId = input.userId ?? ownerUserId;
  const ownerCredits = input.ownerCredits ?? 100;

  await db.query(
    `
      INSERT INTO users (id, phone_e164, status, credit_balance_cached, team_seat_limit)
      VALUES ($1, $2, 'active', $3, $4)
    `,
    [
      seededUserId,
      seededUserId === ownerUserId ? "13800138000" : "13800138001",
      ownerCredits,
      input.seatLimit ?? 50,
    ],
  );


    }

async function seedOtherTeamUser(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await seedTeamUser(db, {
    userId: otherOwnerUserId,
  });
}

async function seedTeamEntitlement(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { userId?: string; entitlementId?: string } = {},
) {
  await db.query(
    `
      INSERT INTO user_entitlements (id, user_id, entitlement_key, status, source)
      VALUES ($1, $2, 'team_member_management', 'active', 'payment')
      ON CONFLICT (user_id, entitlement_key) DO UPDATE SET status = 'active'
    `,
    [input.entitlementId ?? "99000000-0000-4000-8000-000000000001", input.userId ?? ownerUserId],
  );
  }

async function seedActiveProfessionalPeriod(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { planSeatLimit: number },
) {
  await db.query(
    `
      INSERT INTO membership_plans (
        id,
        code,
        display_name,
        tier,
        period_unit,
        period_count,
        amount_minor,
        currency,
        gift_credits,
        seat_limit,
        entitlements_json,
        priority_rules_json,
        display_metadata_json,
        status
      )
      VALUES (
        '95000000-0000-4000-8000-000000050001',
        'professional_monthly_zero_seat',
        'Professional Monthly',
        'professional',
        'month',
        1,
        500000,
        'CNY',
        51000,
        $1,
        '["team_member_management"]'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        'active'
      )
    `,
    [input.planSeatLimit],
  );
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        created_by_user_id,
        order_no,
        product_type,
        membership_plan_id,
        package_snapshot_json,
        product_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
      VALUES ('96000000-0000-4000-8000-000000050001', $1, 'TEAM-PLAN-ZERO-SEAT', 'membership_plan', '95000000-0000-4000-8000-000000050001', '{}'::jsonb, '{}'::jsonb, 0, 500000, 'CNY', 'paid', $2, $3, '97000000-0000-4000-8000-000000050001')
    `,
    [ownerUserId,
      new Date("2026-06-27T10:30:00.000Z"),
      new Date("2026-06-27T10:00:00.000Z"),
      ],
  );
  await db.query(
    `
      INSERT INTO membership_periods (
        id,
        user_id,
        order_id,
        plan_id,
        tier,
        period_start_at,
        period_end_at,
        gift_credits,
        plan_snapshot_json,
        status
      )
      VALUES ('98000000-0000-4000-8000-000000050001', $1, '96000000-0000-4000-8000-000000050001', '95000000-0000-4000-8000-000000050001', 'professional', $2, $3, 51000, $4::jsonb, 'active')
    `,
    [ownerUserId,
      new Date("2026-06-27T10:00:00.000Z"),
      new Date("2026-07-27T10:00:00.000Z"),
      JSON.stringify({
        id: "95000000-0000-4000-8000-000000050001",
        code: "professional_monthly_zero_seat",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        giftCredits: 51000,
        seatLimit: input.planSeatLimit,
        entitlements: ["team_member_management"],
      }),
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
        name,
        aspect_ratio,
        resolution,
        phase,
        owner_user_id,
        created_by_user_id
      )
      VALUES ($1, 'Assigned Project', '9:16', '1080p', 'script_input', $2, $2)
    `,
    [input.projectId,
      ownerUserId],
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
        project_id,
        input_text,
        status,
        created_by_user_id
      )
      VALUES ($1, $2, 'Assigned Script', 'draft', $3)
    `,
    [input.scriptId,
      input.projectId,
      ownerUserId],
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
        project_id,
        title,
        status,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES ($1, $2, 'Assigned Canvas', 'draft', $3, $3)
    `,
    [input.canvasId,
      input.projectId,
      ownerUserId],
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
