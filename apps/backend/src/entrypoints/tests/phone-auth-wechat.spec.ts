import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";

const wechatEnv = {
  WECHAT_LOGIN_APP_ID: "wx_test_app",
  WECHAT_LOGIN_APP_SECRET: "wechat-secret",
  WECHAT_LOGIN_REDIRECT_URI: "https://studio.example.com/api/auth/wechat/callback",
};

describe("phone auth WeChat login", () => {
  it("returns a WeChat qrconnect authorization URL with csrf state", async () => {
    const server = createPhoneAuthDevServer({
      env: wechatEnv,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/api/auth/wechat/start`);
      const payload = await response.json();
      const authUrl = new URL(payload.authorizeUrl);

      assert.equal(response.status, 200);
      assert.equal(authUrl.origin, "https://open.weixin.qq.com");
      assert.equal(authUrl.pathname, "/connect/qrconnect");
      assert.equal(authUrl.searchParams.get("appid"), "wx_test_app");
      assert.equal(authUrl.searchParams.get("redirect_uri"), wechatEnv.WECHAT_LOGIN_REDIRECT_URI);
      assert.equal(authUrl.searchParams.get("response_type"), "code");
      assert.equal(authUrl.searchParams.get("scope"), "snsapi_login");
      assert.match(authUrl.searchParams.get("state") ?? "", /^[a-f0-9]{64}$/);
      assert.equal(payload.appId, "wx_test_app");
      assert.equal(payload.redirectUri, wechatEnv.WECHAT_LOGIN_REDIRECT_URI);
      assert.equal(payload.scope, "snsapi_login");
      assert.equal(payload.state, authUrl.searchParams.get("state"));
    } finally {
      await server.close();
    }
  });

  it("keeps WeChat login disabled until all Open Platform settings are configured", async () => {
    const server = createPhoneAuthDevServer({
      env: { ...wechatEnv, WECHAT_LOGIN_APP_SECRET: "" },
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/api/auth/wechat/start`);
      const payload = await response.json();

      assert.equal(response.status, 503);
      assert.deepEqual(payload, { enabled: false, error: "wechat_login_not_configured" });
    } finally {
      await server.close();
    }
  });

  it("rejects callbacks when the returned state is unknown", async () => {
    const server = createPhoneAuthDevServer({
      env: wechatEnv,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);

      const response = await fetch(
        `${server.origin}/api/auth/wechat/callback?code=wx-code&state=unknown`,
        { redirect: "manual" },
      );
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(payload, { error: "wechat_state_invalid" });
    } finally {
      await server.close();
    }
  });

  it("exchanges callback code, stores WeChat fields on users, and creates a session", async () => {
    const db = await createMigratedTestDb();
    const requestedUrls: string[] = [];
    const server = createPhoneAuthDevServer({
      db,
      env: wechatEnv,
      repairScheduler: { enabled: false },
      fetchImpl: (async (url) => {
        requestedUrls.push(String(url));
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            expires_in: 7200,
            refresh_token: "refresh-token",
            openid: "openid-123",
            scope: "snsapi_login",
            unionid: "unionid-123",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    try {
      await server.listen(0);

      const startResponse = await fetch(`${server.origin}/api/auth/wechat/start`);
      const started = await startResponse.json();
      const state = new URL(started.authorizeUrl).searchParams.get("state");
      const callbackResponse = await fetch(
        `${server.origin}/api/auth/wechat/callback?code=wx-code&state=${state}`,
        { redirect: "manual" },
      );
      const cookie = callbackResponse.headers.get("set-cookie") ?? "";
      const users = await db.query<{
        id: string;
        wechat_openid: string;
        wechat_unionid: string;
        phone_e164: string | null;
      }>(
        "SELECT id, wechat_openid, wechat_unionid, phone_e164 FROM users WHERE wechat_app_id = $1",
        ["wx_test_app"],
      );
      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });
      const sessionPayload = await sessionResponse.json();

      assert.equal(callbackResponse.status, 302);
      assert.equal(callbackResponse.headers.get("location"), "/app.html#project");
      assert.match(cookie, /auth_session=/);
      assert.equal(users.rows[0]?.wechat_openid, "openid-123");
      assert.equal(users.rows[0]?.wechat_unionid, "unionid-123");
      assert.equal(users.rows[0]?.phone_e164, null);
      assert.match(requestedUrls[0], /sns\/oauth2\/access_token/);
      assert.match(requestedUrls[0], /appid=wx_test_app/);
      assert.match(requestedUrls[0], /secret=wechat-secret/);
      assert.match(requestedUrls[0], /code=wx-code/);
      assert.equal(sessionResponse.status, 200);
      assert.equal(sessionPayload.authenticated, true);
      assert.equal(sessionPayload.user.id, users.rows[0]?.id);
      assert.equal(sessionPayload.user.phone, null);
    } finally {
      await server.close();
    }
  });
});
