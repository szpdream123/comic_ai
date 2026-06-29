import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPhoneAuthDevServer as createPhoneAuthDevServerBase } from "../phone-auth-dev-server.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";

function createPhoneAuthDevServer(
  options?: Parameters<typeof createPhoneAuthDevServerBase>[0],
) {
  return createPhoneAuthDevServerBase(options);
}

describe("team member membership status", { concurrency: false }, () => {
  it("returns the shared membership state for team member sessions", async () => {
    const server = createPhoneAuthDevServer({ seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138001");
      const memberCookie = await loginByAccount(server.origin, "director001@u185715", "member-secret-001");

      const ownerStatusResponse = await fetch(`${server.origin}/api/membership/status`, {
        headers: { cookie },
      });
      const ownerStatus = await ownerStatusResponse.json();
      const memberStatusResponse = await fetch(`${server.origin}/api/membership/status`, {
        headers: { cookie: memberCookie },
      });
      const memberStatus = await memberStatusResponse.json();

      assert.equal(ownerStatusResponse.status, 200);
      assert.equal(memberStatusResponse.status, 200);
      assert.equal(ownerStatus.membership.status, memberStatus.membership.status);
      assert.notEqual(memberStatus.membership.status, "none");
    } finally {
      await server.close();
    }
  });
});

async function login(origin: string, account: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password: "138001", remember: true }),
  });
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.equal(response.status, 200);
  assert.equal(payload.authenticated, true);
  return cookie;
}

async function loginByAccount(origin: string, account: string, password: string) {
  const response = await fetch(`${origin}/api/auth/team-member/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password, remember: true }),
  });
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.equal(response.status, 200);
  return cookie;
}
