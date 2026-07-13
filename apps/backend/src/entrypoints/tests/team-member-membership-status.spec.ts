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
    const server = createPhoneAuthDevServer({ db, seedTeamEntitlements: true });

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
      assert.equal(createResponse.status, 200, JSON.stringify(created));
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


  }

async function seedTeamEntitlement(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  }

async function seedProfessionalMembership(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO user_memberships (
        id, user_id, membership_tier, purchase_at, expires_at,
        gift_credits, status, created_at, updated_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000001',
        'professional', now(), now() + interval '1 year', 0, 'active', now(), now()
      )
      ON CONFLICT (user_id) DO UPDATE
      SET membership_tier = EXCLUDED.membership_tier,
          expires_at = EXCLUDED.expires_at,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
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
