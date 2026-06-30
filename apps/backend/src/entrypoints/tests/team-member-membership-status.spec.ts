import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultPasswordFromPhone, createUserPasswordHash } from "../../modules/identity/team-account-credentials.service.ts";
import { createPhoneAuthDevServer as createPhoneAuthDevServerBase } from "../phone-auth-dev-server.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";

function createPhoneAuthDevServer(
  options?: Parameters<typeof createPhoneAuthDevServerBase>[0],
) {
  return createPhoneAuthDevServerBase(options);
}

describe("team member membership status", { concurrency: false }, () => {
  it("returns the shared membership state for team member sessions", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await seedPasswordLoginUser(db, "13800138000");
      await seedTeamEntitlement(db);
      await seedProfessionalMembership(db);
      await server.listen(0);

      const ownerCookie = await login(server.origin, "13800138000");
      const createResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          teamAccount: "status_test_001",
          displayName: "Status Test",
          projectIds: [],
          scriptIds: [],
          canvasIds: [],
          initialCredits: 0,
        }),
      });
      const created = await createResponse.json();
      const memberCookie = await loginByAccount(server.origin, created.member.memberLoginAccount, created.temporaryPassword);

      const ownerStatusResponse = await fetch(`${server.origin}/api/membership/status`, {
        headers: { cookie: ownerCookie },
      });
      const ownerStatus = await ownerStatusResponse.json();
      const memberStatusResponse = await fetch(`${server.origin}/api/membership/status`, {
        headers: { cookie: memberCookie },
      });
      const memberStatus = await memberStatusResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(ownerStatusResponse.status, 200);
      assert.equal(memberStatusResponse.status, 200);
      assert.equal(ownerStatus.membership.status, "professional_active");
      assert.equal(memberStatus.membership.status, ownerStatus.membership.status);
    } finally {
      await server.close();
    }
  });
});

async function seedPasswordLoginUser(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  phone: string,
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status, password_hash)
      VALUES ('00000000-0000-4000-8000-000000000001', $1, 'active', $2)
      ON CONFLICT (phone_e164) DO UPDATE
      SET status = EXCLUDED.status,
          password_hash = EXCLUDED.password_hash
    `,
    [phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ('10000000-0000-4000-8000-000000000001', 'Org', 'active')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Workspace', 'active')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
    `,
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status, membership_tier, expires_at)
      VALUES (
        '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
        'creator',
        'active',
        'professional',
        '2099-01-01T00:00:00.000Z'
      )
      ON CONFLICT (organization_id, workspace_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          status = EXCLUDED.status,
          membership_tier = EXCLUDED.membership_tier,
          expires_at = EXCLUDED.expires_at
    `,
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
        '31000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'team_member_management',
        'active',
        'dev_seed'
      )
      ON CONFLICT (organization_id, entitlement_key)
      DO UPDATE SET status = 'active', source = EXCLUDED.source
    `,
  );
}

async function seedProfessionalMembership(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO memberships (
        id,
        organization_id,
        workspace_id,
        user_id,
        role,
        status,
        membership_tier,
        expires_at
      )
      VALUES (
        '32000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
        'creator',
        'active',
        'professional',
        '2099-01-01T00:00:00.000Z'
      )
      ON CONFLICT (organization_id, workspace_id, user_id)
      DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        membership_tier = EXCLUDED.membership_tier,
        expires_at = EXCLUDED.expires_at
    `,
  );
}

async function login(origin: string, account: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password: defaultPasswordFromPhone(account), remember: true }),
  });
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.equal(response.status, 200);
  assert.ok(cookie.length > 0);
  assert.ok(payload.user?.id);
  return cookie;
}

async function loginByAccount(origin: string, account: string, password: string) {
  const response = await fetch(`${origin}/api/auth/team-member/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password, remember: true }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie") ?? "";
}
