import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import { createUserPasswordHash, defaultPasswordFromPhone } from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("shares agent assets with authenticated subaccounts and isolates other main accounts", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
    repairScheduler: { enabled: false },
  });
  const mainUserId = randomUUID();
  const otherUserId = randomUUID();
  const memberId = randomUUID();
  const mainPhone = "13900000881";
  const otherPhone = "13900000882";
  const memberPassword = "agent-member-secret";
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active'), ($4, $5, $6, 'active')",
      [
        mainUserId,
        mainPhone,
        await createUserPasswordHash(defaultPasswordFromPhone(mainPhone)),
        otherUserId,
        otherPhone,
        await createUserPasswordHash(defaultPasswordFromPhone(otherPhone)),
      ],
    );
    await db.query(
      `
        INSERT INTO team_members
          (id, user_id, member_account, member_account_suffix, member_login_account, member_name, member_password_hash, status)
        VALUES ($1, $2, 'agentmember', 'u900881', 'agentmember@u900881', 'Agent 成员', $3, 'active')
      `,
      [memberId, mainUserId, await createUserPasswordHash(memberPassword)],
    );
    await server.listen(0);
    const mainCookie = await passwordLogin(server.origin, mainPhone);
    const otherCookie = await passwordLogin(server.origin, otherPhone);
    const memberCookie = await memberLogin(server.origin, "agentmember@u900881", memberPassword);

    const anonymous = await api(server.origin, "/api/creator/agent-assets", "");
    assert.equal(anonymous.status, 401);

    const created = await api(server.origin, "/api/creator/agent-assets", mainCookie, {
      method: "POST",
      body: { name: "分镜导演", description: "输出镜头计划", instructions: "镜头保持连续" },
    });
    assert.equal(created.status, 201);
    const assetId = String(created.body.data.asset.id);

    const memberList = await api(server.origin, "/api/creator/agent-assets", memberCookie);
    assert.equal(memberList.status, 200);
    assert.deepEqual(memberList.body.data.items.map((asset: { id: string }) => asset.id), [assetId]);
    assert.equal(memberList.body.data.items[0].createdByMemberId, null);

    const memberUpdated = await api(server.origin, `/api/creator/agent-assets/${assetId}`, memberCookie, {
      method: "PATCH",
      body: { name: "分镜导演 V2", instructions: "低机位推进" },
    });
    assert.equal(memberUpdated.status, 200);
    assert.equal(memberUpdated.body.data.asset.name, "分镜导演 V2");

    const memberCreated = await api(server.origin, "/api/creator/agent-assets", memberCookie, {
      method: "POST",
      body: { name: "成员导演", instructions: "保持角色服装连续" },
    });
    assert.equal(memberCreated.status, 201);
    assert.equal(memberCreated.body.data.asset.adminUserId, mainUserId);
    assert.equal(memberCreated.body.data.asset.createdByMemberId, memberId);
    const memberAssetId = String(memberCreated.body.data.asset.id);

    const otherList = await api(server.origin, "/api/creator/agent-assets", otherCookie);
    assert.deepEqual(otherList.body.data.items, []);
    const otherDelete = await api(server.origin, `/api/creator/agent-assets/${assetId}`, otherCookie, { method: "DELETE", body: {} });
    assert.equal(otherDelete.status, 404);

    const memberDelete = await api(server.origin, `/api/creator/agent-assets/${assetId}`, memberCookie, { method: "DELETE", body: {} });
    assert.equal(memberDelete.status, 200);
    assert.equal(memberDelete.body.data.deleted, true);
    assert.equal((await api(server.origin, "/api/creator/agent-assets", mainCookie)).body.data.items[0].id, memberAssetId);
    assert.equal((await api(server.origin, `/api/creator/agent-assets/${memberAssetId}`, mainCookie, { method: "DELETE", body: {} })).status, 200);
    assert.deepEqual((await api(server.origin, "/api/creator/agent-assets", mainCookie)).body.data.items, []);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

async function passwordLogin(origin: string, phone: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie") ?? "";
}

async function memberLogin(origin: string, account: string, password: string) {
  const response = await fetch(`${origin}/api/auth/team-member/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie") ?? "";
}

async function api(origin: string, path: string, cookie: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}
