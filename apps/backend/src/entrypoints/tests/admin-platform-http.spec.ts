import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("admin management platform HTTP routes", { concurrency: false }, () => {
  it("serves the standalone admin shell without using the creator app shell", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/admin/login`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /id="admin-app"/);
      assert.match(html, /后台管理/);
      assert.doesNotMatch(html, /id="creator-app"/);
    } finally {
      await server.close();
    }
  });

  it("serves the admin shell for authenticated admins who open the login route", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const response = await fetch(`${server.origin}/admin/login`, {
        headers: { cookie },
      });
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /id="admin-app"/);
      assert.match(html, /\/admin\/dashboard/);
      assert.doesNotMatch(html, /id="creator-app"/);
    } finally {
      await server.close();
    }
  });

  it("lets a bootstrapped admin login, inspect the session, and logout", async () => {
    const db = await createMigratedTestDb();
    const loginName = `admin_${randomUUID().slice(0, 8)}`;
    const password = `Admin-${randomUUID()}-Pwd`;
    const server = createPhoneAuthDevServer({ db });

    await db.query(
      `
        INSERT INTO admin_accounts (
          id, login_name, password_hash, display_name, status
        ) VALUES (
          '81000000-0000-4000-8000-000000000001',
          $1,
          'plain:' || $2,
          '总后台管理员',
          'active'
        )
      `,
      [loginName, password],
    );
    await db.query(
      `
        INSERT INTO admin_account_roles (
          id, admin_account_id, role_code
        ) VALUES (
          '82000000-0000-4000-8000-000000000001',
          '81000000-0000-4000-8000-000000000001',
          'super_admin'
        )
      `,
    );

    try {
      await server.listen(0);

      const loginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "AdminPlatformSpec/1.0",
        },
        body: JSON.stringify({ loginName, password }),
      });
      const loginPayload = await loginResponse.json();
      const adminCookie = loginResponse.headers.get("set-cookie") ?? "";

      const meResponse = await fetch(`${server.origin}/api/admin/auth/me`, {
        headers: { cookie: adminCookie },
      });
      const mePayload = await meResponse.json();

      const logoutResponse = await fetch(`${server.origin}/api/admin/auth/logout`, {
        method: "POST",
        headers: { cookie: adminCookie },
      });
      const logoutPayload = await logoutResponse.json();

      const afterLogoutResponse = await fetch(`${server.origin}/api/admin/auth/me`, {
        headers: { cookie: adminCookie },
      });
      const afterLogoutPayload = await afterLogoutResponse.json();

      const audit = await db.query<{ event_type: string }>(
        `
          SELECT event_type
          FROM audit_events
          WHERE event_type IN ('admin.auth.login_succeeded', 'admin.auth.logout')
          ORDER BY created_at ASC, event_type ASC
        `,
      );

      assert.equal(loginResponse.status, 200);
      assert.equal(loginPayload.data.account.loginName, loginName);
      assert.deepEqual(loginPayload.data.roles, ["super_admin"]);
      assert.ok(loginPayload.data.permissions.includes("settings.write"));
      assert.ok(loginPayload.data.permissions.includes("admin_account.write"));
      assert.match(adminCookie, /admin_session=/);
      assert.doesNotMatch(adminCookie, /auth_session=/);

      assert.equal(meResponse.status, 200);
      assert.equal(mePayload.data.account.displayName, "总后台管理员");
      assert.deepEqual(mePayload.data.roles, ["super_admin"]);
      assert.ok(mePayload.data.permissions.includes("settings.write"));
      assert.ok(mePayload.data.permissions.includes("admin_account.write"));

      assert.equal(logoutResponse.status, 200);
      assert.deepEqual(logoutPayload.data, { authenticated: false });

      assert.equal(afterLogoutResponse.status, 401);
      assert.equal(afterLogoutPayload.error.code, "admin_unauthenticated");
      assert.deepEqual(audit.rows.map((row) => row.event_type), [
        "admin.auth.login_succeeded",
        "admin.auth.logout",
      ]);
    } finally {
      await server.close();
    }
  });

  it("locks admin login after repeated password failures", async () => {
    const db = await createMigratedTestDb();
    const loginName = `admin_${randomUUID().slice(0, 8)}`;
    const password = `Admin-${randomUUID()}-Pwd`;
    const server = createPhoneAuthDevServer({ db });

    await db.query(
      `
        INSERT INTO admin_accounts (
          id, login_name, password_hash, display_name, status
        ) VALUES (
          '81000000-0000-4000-8000-000000000002',
          $1,
          'plain:' || $2,
          '锁定测试管理员',
          'active'
        )
      `,
      [loginName, password],
    );

    try {
      await server.listen(0);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`${server.origin}/api/admin/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ loginName, password: "wrong-password" }),
        });
        assert.equal(response.status, 401);
      }

      const lockedResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginName, password }),
      });
      const lockedPayload = await lockedResponse.json();
      const account = await db.query<{ failed_login_count: number; locked_until: Date | string | null }>(
        `
          SELECT failed_login_count, locked_until
          FROM admin_accounts
          WHERE login_name = $1
        `,
        [loginName],
      );
      const audit = await db.query<{ event_type: string }>(
        `
          SELECT event_type
          FROM audit_events
          WHERE event_type = 'admin.auth.login_failed'
        `,
      );

      assert.equal(lockedResponse.status, 423);
      assert.equal(lockedPayload.error.code, "admin_account_locked");
      assert.equal(account.rows[0].failed_login_count, 3);
      assert.ok(account.rows[0].locked_until);
      assert.equal(audit.rows.length, 4);
    } finally {
      await server.close();
    }
  });

  it("lets admins inspect sessions and revoke other active sessions", async () => {
    const db = await createMigratedTestDb();
    const loginName = `admin_${randomUUID().slice(0, 8)}`;
    const password = `Admin-${randomUUID()}-Pwd`;
    const server = createPhoneAuthDevServer({ db });

    await db.query(
      `
        INSERT INTO admin_accounts (
          id, login_name, password_hash, display_name, status
        ) VALUES (
          '81000000-0000-4000-8000-000000000003',
          $1,
          'plain:' || $2,
          '会话测试管理员',
          'active'
        )
      `,
      [loginName, password],
    );
    await db.query(
      `
        INSERT INTO admin_account_roles (
          id, admin_account_id, role_code
        ) VALUES (
          '82000000-0000-4000-8000-000000000003',
          '81000000-0000-4000-8000-000000000003',
          'super_admin'
        )
      `,
    );

    try {
      await server.listen(0);

      const firstLoginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "AdminSessionSpec/first" },
        body: JSON.stringify({ loginName, password }),
      });
      const firstCookie = firstLoginResponse.headers.get("set-cookie") ?? "";
      const secondLoginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "AdminSessionSpec/second" },
        body: JSON.stringify({ loginName, password }),
      });
      const secondCookie = secondLoginResponse.headers.get("set-cookie") ?? "";

      const sessionsResponse = await fetch(`${server.origin}/api/admin/auth/sessions`, {
        headers: { cookie: secondCookie },
      });
      const sessionsPayload = await sessionsResponse.json();
      const revokeResponse = await fetch(`${server.origin}/api/admin/auth/sessions/revoke-other`, {
        method: "POST",
        headers: { cookie: secondCookie, "idempotency-key": "admin-revoke-other-sessions" },
      });
      const revokePayload = await revokeResponse.json();
      const replayRevokeResponse = await fetch(`${server.origin}/api/admin/auth/sessions/revoke-other`, {
        method: "POST",
        headers: { cookie: secondCookie, "idempotency-key": "admin-revoke-other-sessions" },
      });
      const replayRevokePayload = await replayRevokeResponse.json();
      const missingIdempotencyResponse = await fetch(`${server.origin}/api/admin/auth/sessions/revoke-other`, {
        method: "POST",
        headers: { cookie: secondCookie },
      });
      const missingIdempotencyPayload = await missingIdempotencyResponse.json();
      const firstMeResponse = await fetch(`${server.origin}/api/admin/auth/me`, {
        headers: { cookie: firstCookie },
      });
      const firstMePayload = await firstMeResponse.json();
      const secondMeResponse = await fetch(`${server.origin}/api/admin/auth/me`, {
        headers: { cookie: secondCookie },
      });
      const audit = await db.query<{ event_type: string }>(
        `
          SELECT event_type
          FROM audit_events
          WHERE event_type = 'admin.auth.sessions_revoked'
        `,
      );

      assert.equal(firstLoginResponse.status, 200);
      assert.equal(secondLoginResponse.status, 200);
      assert.equal(sessionsResponse.status, 200);
      assert.equal(sessionsPayload.data.length, 2);
      assert.equal(sessionsPayload.data.filter((session: { current: boolean }) => session.current).length, 1);
      assert.equal(revokeResponse.status, 200);
      assert.equal(revokePayload.data.revokedCount, 1);
      assert.equal(replayRevokeResponse.status, 200);
      assert.equal(replayRevokePayload.data.revokedCount, 1);
      assert.equal(missingIdempotencyResponse.status, 400);
      assert.equal(missingIdempotencyPayload.error, "idempotency_key_required");
      assert.equal(firstMeResponse.status, 401);
      assert.equal(firstMePayload.error.code, "admin_unauthenticated");
      assert.equal(secondMeResponse.status, 200);
      assert.deepEqual(audit.rows.map((row) => row.event_type), ["admin.auth.sessions_revoked"]);
    } finally {
      await server.close();
    }
  });

  it("lets admins update their own profile with idempotency and audit it once", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const missingIdempotencyResponse = await fetch(`${server.origin}/api/admin/auth/profile`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          displayName: "后台主理人",
        }),
      });
      const missingIdempotencyPayload = await missingIdempotencyResponse.json();

      const profileResponse = await fetch(`${server.origin}/api/admin/auth/profile`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
          "idempotency-key": "admin-profile-update",
        },
        body: JSON.stringify({
          displayName: "后台主理人",
        }),
      });
      const profilePayload = await profileResponse.json();

      const replayProfileResponse = await fetch(`${server.origin}/api/admin/auth/profile`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
          "idempotency-key": "admin-profile-update",
        },
        body: JSON.stringify({
          displayName: "后台主理人",
        }),
      });
      const replayProfilePayload = await replayProfileResponse.json();

      const meResponse = await fetch(`${server.origin}/api/admin/auth/me`, { headers: { cookie } });
      const mePayload = await meResponse.json();

      const audit = await db.query<{ event_type: string }>(
        `
          SELECT event_type
          FROM audit_events
          WHERE event_type = 'admin.auth.profile_updated'
        `,
      );

      assert.equal(missingIdempotencyResponse.status, 400);
      assert.equal(missingIdempotencyPayload.error, "idempotency_key_required");
      assert.equal(profileResponse.status, 200);
      assert.equal(profilePayload.data.account.displayName, "后台主理人");
      assert.equal(replayProfileResponse.status, 200);
      assert.equal(replayProfilePayload.data.account.displayName, "后台主理人");
      assert.equal(meResponse.status, 200);
      assert.equal(mePayload.data.account.displayName, "后台主理人");
      assert.deepEqual(audit.rows.map((row) => row.event_type), ["admin.auth.profile_updated"]);
    } finally {
      await server.close();
    }
  });

  it("returns role-derived permission points for admin sessions", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, { role: "model_admin" });

    try {
      const meResponse = await fetch(`${server.origin}/api/admin/auth/me`, {
        headers: { cookie },
      });
      const mePayload = await meResponse.json();

      assert.equal(meResponse.status, 200);
      assert.deepEqual(mePayload.data.roles, ["model_admin"]);
      assert.ok(mePayload.data.permissions.includes("model.read"));
      assert.ok(mePayload.data.permissions.includes("model.write"));
      assert.ok(mePayload.data.permissions.includes("model.publish"));
      assert.equal(mePayload.data.permissions.includes("settings.write"), false);
      assert.equal(mePayload.data.permissions.includes("credit.adjust"), false);
    } finally {
      await server.close();
    }
  });

  it("lets admins change their own password and records an audit event", async () => {
    const db = await createMigratedTestDb();
    const loginName = `admin_${randomUUID().slice(0, 8)}`;
    const oldPassword = `Admin-${randomUUID()}-Old`;
    const newPassword = `Admin-${randomUUID()}-New`;
    const server = createPhoneAuthDevServer({ db });

    await db.query(
      `
        INSERT INTO admin_accounts (
          id, login_name, password_hash, display_name, status
        ) VALUES (
          '81000000-0000-4000-8000-000000000011',
          $1,
          'plain:' || $2,
          '总后台管理员',
          'active'
        )
      `,
      [loginName, oldPassword],
    );
    await db.query(
      `
        INSERT INTO admin_account_roles (
          id, admin_account_id, role_code
        ) VALUES (
          '82000000-0000-4000-8000-000000000011',
          '81000000-0000-4000-8000-000000000011',
          'super_admin'
        )
      `,
    );

    try {
      await server.listen(0);

      const loginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginName, password: oldPassword }),
      });
      const adminCookie = loginResponse.headers.get("set-cookie") ?? "";

      const wrongOldPasswordResponse = await fetch(`${server.origin}/api/admin/auth/password`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
          "idempotency-key": "admin-password-wrong-old",
        },
        body: JSON.stringify({
          oldPassword: "not-the-current-password",
          newPassword,
          revokeOtherSessions: true,
        }),
      });
      const wrongOldPasswordPayload = await wrongOldPasswordResponse.json();

      const replayWrongOldPasswordResponse = await fetch(`${server.origin}/api/admin/auth/password`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
          "idempotency-key": "admin-password-wrong-old",
        },
        body: JSON.stringify({
          oldPassword: "not-the-current-password",
          newPassword,
          revokeOtherSessions: true,
        }),
      });
      const replayWrongOldPasswordPayload = await replayWrongOldPasswordResponse.json();

      const missingIdempotencyResponse = await fetch(`${server.origin}/api/admin/auth/password`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          oldPassword,
          newPassword,
          revokeOtherSessions: true,
        }),
      });
      const missingIdempotencyPayload = await missingIdempotencyResponse.json();

      const changeResponse = await fetch(`${server.origin}/api/admin/auth/password`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
          "idempotency-key": "admin-password-change",
        },
        body: JSON.stringify({
          oldPassword,
          newPassword,
          revokeOtherSessions: true,
        }),
      });
      const changePayload = await changeResponse.json();

      const replayChangeResponse = await fetch(`${server.origin}/api/admin/auth/password`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
          "idempotency-key": "admin-password-change",
        },
        body: JSON.stringify({
          oldPassword,
          newPassword,
          revokeOtherSessions: true,
        }),
      });
      const replayChangePayload = await replayChangeResponse.json();

      const oldLoginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginName, password: oldPassword }),
      });
      const oldLoginPayload = await oldLoginResponse.json();

      const newLoginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginName, password: newPassword }),
      });
      const newLoginPayload = await newLoginResponse.json();

      const audit = await db.query<{ event_type: string; target_id: string }>(
        `
          SELECT event_type, target_id
          FROM audit_events
          WHERE event_type = 'admin.auth.password_changed'
        `,
      );

      assert.equal(loginResponse.status, 200);
      assert.equal(wrongOldPasswordResponse.status, 400);
      assert.equal(wrongOldPasswordPayload.error.code, "admin_old_password_invalid");
      assert.equal(replayWrongOldPasswordResponse.status, 400);
      assert.equal(replayWrongOldPasswordPayload.error.code, "admin_old_password_invalid");
      assert.equal(missingIdempotencyResponse.status, 400);
      assert.equal(missingIdempotencyPayload.error, "idempotency_key_required");
      assert.equal(changeResponse.status, 200);
      assert.deepEqual(changePayload.data, { passwordChanged: true });
      assert.equal(replayChangeResponse.status, 200);
      assert.deepEqual(replayChangePayload.data, { passwordChanged: true });
      assert.equal(oldLoginResponse.status, 401);
      assert.equal(oldLoginPayload.error.code, "admin_invalid_credentials");
      assert.equal(newLoginResponse.status, 200);
      assert.equal(newLoginPayload.data.account.loginName, loginName);
      assert.deepEqual(audit.rows, [
        {
          event_type: "admin.auth.password_changed",
          target_id: "81000000-0000-4000-8000-000000000011",
        },
      ]);
    } finally {
      await server.close();
    }
  });

  it("serves database-backed model list and detail to logged-in admins", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const forbidden = await fetch(`${server.origin}/api/admin/models`);
      const forbiddenPayload = await forbidden.json();

      const listResponse = await fetch(`${server.origin}/api/admin/models`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();
      const imageModel = listPayload.data.find(
        (model: { modelCode: string }) => model.modelCode === "gpt-image-2-cn",
      );

      const detailResponse = await fetch(`${server.origin}/api/admin/models/${imageModel.id}`, {
        headers: { cookie },
      });
      const detailPayload = await detailResponse.json();

      assert.equal(forbidden.status, 401);
      assert.equal(forbiddenPayload.error.code, "admin_unauthenticated");
      assert.equal(listResponse.status, 200);
      assert.ok(listPayload.data.length >= 2);
      assert.equal(imageModel.displayName, "GPT Image 2");
      assert.equal(imageModel.providerName, "openai");
      assert.equal(imageModel.dispatchPolicy.submitQueueName, "generation-submit-image");
      assert.equal(detailResponse.status, 200);
      assert.equal(detailPayload.data.model.modelCode, "gpt-image-2-cn");
      assert.equal(detailPayload.data.model.parameterSchema.prompt.type, "string");
      assert.equal(detailPayload.data.model.pricing.unit, "image");
      assert.equal(detailPayload.data.model.providerConfig.apiKeyEnv, "GPT_IMAGE2_API_KEY");
      assert.equal(detailPayload.data.model.dispatchPolicy.submitQueueName, "generation-submit-image");
    } finally {
      await server.close();
    }
  });

  it("lets admins create, update, duplicate, and change status for model configs", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const missingIdempotency = await fetch(`${server.origin}/api/admin/models`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "admin-video-pro",
          displayName: "后台视频 Pro",
          providerName: "volcengine",
          providerModel: "admin-video-provider-model",
          providerProtocol: "volcengine_ark_video",
          invocationMode: "async_polling",
          mediaType: "video",
          taskModes: ["video.text_to_video", "video.image_to_video"],
          parameterSchema: {
            aspectRatio: { label: "视频比率", type: "enum", options: ["16:9", "9:16"] },
          },
          pricing: { unit: "video", baseCredits: 120 },
          providerConfig: {
            baseURL: "https://ark.example.test",
            createTaskEndpoint: "/v1/tasks",
            queryTaskEndpoint: "/v1/tasks/{taskId}",
            apiKeyEnv: "VOLCENGINE_ARK_API_KEY",
          },
          dispatchPolicy: {
            submitQueueName: "generation-submit-admin-video",
            pollQueueName: "generation-poll-admin-video",
            providerRpmLimit: 30,
            providerConcurrentLimit: 2,
            submitConcurrencyLimit: 2,
            pollingIntervalMs: 5000,
            pollingConcurrencyLimit: 4,
          },
          reason: "接入后台测试视频模型",
        }),
      });
      const missingIdempotencyPayload = await missingIdempotency.json();

      const createResponse = await fetch(`${server.origin}/api/admin/models`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-create-video-pro",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "admin-video-pro",
          displayName: "后台视频 Pro",
          providerName: "volcengine",
          providerModel: "admin-video-provider-model",
          providerProtocol: "volcengine_ark_video",
          invocationMode: "async_polling",
          mediaType: "video",
          taskModes: ["video.text_to_video", "video.image_to_video"],
          capabilities: { firstFrame: true },
          parameterSchema: {
            aspectRatio: {
              label: "视频比率",
              type: "enum",
              options: ["16:9", "9:16"],
              adminEditableOptions: true,
            },
          },
          defaultParams: { aspectRatio: "16:9" },
          pricing: { unit: "video", baseCredits: 120 },
          providerConfig: {
            baseURL: "https://ark.example.test",
            createTaskEndpoint: "/v1/tasks",
            queryTaskEndpoint: "/v1/tasks/{taskId}",
            apiKeyEnv: "VOLCENGINE_ARK_API_KEY",
          },
          limits: { referenceImages: { max: 4 } },
          uiConfig: { badge: "测试" },
          dispatchPolicy: {
            submitQueueName: "generation-submit-admin-video",
            pollQueueName: "generation-poll-admin-video",
            providerRpmLimit: 30,
            providerConcurrentLimit: 2,
            submitConcurrencyLimit: 2,
            pollingIntervalMs: 5000,
            pollingConcurrencyLimit: 4,
          },
          reason: "接入后台测试视频模型",
        }),
      });
      const createPayload = await createResponse.json();
      const modelId = createPayload.data.id;

      const updateResponse = await fetch(`${server.origin}/api/admin/models/${modelId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-update-video-pro",
          cookie,
        },
        body: JSON.stringify({
          displayName: "后台视频 Pro V2",
          pricing: { unit: "video", baseCredits: 150 },
          parameterSchema: {
            aspectRatio: {
              label: "视频比率",
              type: "enum",
              options: ["1:1", "16:9", "9:16"],
              adminEditableOptions: true,
            },
          },
          reason: "调整视频定价和比率",
        }),
      });
      const updatePayload = await updateResponse.json();

      const duplicateResponse = await fetch(`${server.origin}/api/admin/models/${modelId}/duplicate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-duplicate-video-pro",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "admin-video-pro-copy",
          displayName: "后台视频 Pro 副本",
          reason: "复制为测试副本",
        }),
      });
      const duplicatePayload = await duplicateResponse.json();

      const statusResponse = await fetch(`${server.origin}/api/admin/models/${modelId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-disable-video-pro",
          cookie,
        },
        body: JSON.stringify({
          status: "disabled",
          reason: "供应商维护暂停",
        }),
      });
      const statusPayload = await statusResponse.json();

      const detailResponse = await fetch(`${server.origin}/api/admin/models/${modelId}`, {
        headers: { cookie },
      });
      const detailPayload = await detailResponse.json();

      const revisions = await db.query<{ reason: string | null }>(
        "SELECT reason FROM ai_model_config_revisions WHERE model_config_id = $1 ORDER BY created_at ASC",
        [modelId],
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type IN (
            'admin.model.created',
            'admin.model.updated',
            'admin.model.duplicated',
            'admin.model.status_changed'
          )
          ORDER BY event_type ASC
        `,
      );

      assert.equal(missingIdempotency.status, 400);
      assert.deepEqual(missingIdempotencyPayload, { error: "idempotency_key_required" });
      assert.equal(createResponse.status, 200);
      assert.equal(createPayload.data.modelCode, "admin-video-pro");
      assert.equal(createPayload.data.dispatchPolicy.submitQueueName, "generation-submit-admin-video");
      assert.equal(updateResponse.status, 200);
      assert.equal(updatePayload.data.displayName, "后台视频 Pro V2");
      assert.equal(updatePayload.data.pricing.baseCredits, 150);
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicatePayload.data.modelCode, "admin-video-pro-copy");
      assert.equal(duplicatePayload.data.displayName, "后台视频 Pro 副本");
      assert.equal(statusResponse.status, 200);
      assert.equal(statusPayload.data.status, "disabled");
      assert.equal(detailPayload.data.model.status, "disabled");
      assert.equal(detailPayload.data.model.parameterSchema.aspectRatio.options.length, 3);
      assert.deepEqual(revisions.rows.map((row) => row.reason), [
        "接入后台测试视频模型",
        "调整视频定价和比率",
        "供应商维护暂停",
      ]);
      assert.deepEqual(audit.rows, [
        { event_type: "admin.model.created", reason: "接入后台测试视频模型" },
        { event_type: "admin.model.duplicated", reason: "复制为测试副本" },
        { event_type: "admin.model.status_changed", reason: "供应商维护暂停" },
        { event_type: "admin.model.updated", reason: "调整视频定价和比率" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("lets admins inspect model revisions and rollback a model snapshot", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/models`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-rollback-create",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "admin-image-rollback",
          displayName: "回滚测试图像模型",
          providerName: "openai",
          providerModel: "image-rollback-v1",
          providerProtocol: "openai_images",
          invocationMode: "sync",
          mediaType: "image",
          taskModes: ["image.text_to_image"],
          parameterSchema: {
            aspectRatio: { label: "图片比例", type: "enum", options: ["1:1"] },
          },
          pricing: { unit: "image", baseCredits: 40 },
          providerConfig: { apiKeyEnv: "OPENAI_API_KEY" },
          dispatchPolicy: {
            submitQueueName: "generation-submit-rollback-v1",
            providerRpmLimit: 30,
            providerConcurrentLimit: 2,
          },
          reason: "创建回滚基线",
        }),
      });
      const createPayload = await createResponse.json();
      const modelId = createPayload.data.id;

      const updateResponse = await fetch(`${server.origin}/api/admin/models/${modelId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-rollback-update",
          cookie,
        },
        body: JSON.stringify({
          displayName: "回滚测试图像模型 V2",
          providerModel: "image-rollback-v2",
          pricing: { unit: "image", baseCredits: 80 },
          dispatchPolicy: {
            submitQueueName: "generation-submit-rollback-v2",
            providerRpmLimit: 60,
            providerConcurrentLimit: 4,
          },
          reason: "升级到第二版配置",
        }),
      });
      const updatePayload = await updateResponse.json();

      const revisionsResponse = await fetch(`${server.origin}/api/admin/models/${modelId}/revisions`, {
        headers: { cookie },
      });
      const revisionsPayload = await revisionsResponse.json();
      const baselineRevision = revisionsPayload.data.find(
        (revision: { reason: string }) => revision.reason === "创建回滚基线",
      );

      const rollbackResponse = await fetch(`${server.origin}/api/admin/models/${modelId}/rollback`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-rollback-to-baseline",
          cookie,
        },
        body: JSON.stringify({
          revisionId: baselineRevision.id,
          reason: "回滚到稳定基线",
        }),
      });
      const rollbackPayload = await rollbackResponse.json();

      const detailResponse = await fetch(`${server.origin}/api/admin/models/${modelId}`, {
        headers: { cookie },
      });
      const detailPayload = await detailResponse.json();
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type = 'admin.model.rolled_back'
        `,
      );

      assert.equal(createResponse.status, 200);
      assert.equal(updateResponse.status, 200);
      assert.equal(updatePayload.data.displayName, "回滚测试图像模型 V2");
      assert.equal(revisionsResponse.status, 200);
      assert.equal(revisionsPayload.data.length, 2);
      assert.equal(revisionsPayload.data[0].reason, "升级到第二版配置");
      assert.equal(revisionsPayload.data[1].reason, "创建回滚基线");
      assert.equal(rollbackResponse.status, 200);
      assert.equal(rollbackPayload.data.displayName, "回滚测试图像模型");
      assert.equal(rollbackPayload.data.pricing.baseCredits, 40);
      assert.equal(rollbackPayload.data.dispatchPolicy.submitQueueName, "generation-submit-rollback-v1");
      assert.equal(detailResponse.status, 200);
      assert.equal(detailPayload.data.model.providerModel, "image-rollback-v1");
      assert.deepEqual(audit.rows, [
        { event_type: "admin.model.rolled_back", reason: "回滚到稳定基线" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("blocks publishing model configs that fail launch checks", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/models`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-incomplete-create",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "admin-incomplete-publish",
          displayName: "发布检查缺项模型",
          providerName: "custom",
          providerModel: "incomplete-model",
          providerProtocol: "custom_http",
          invocationMode: "async_polling",
          mediaType: "video",
          taskModes: ["video.text_to_video"],
          parameterSchema: {},
          pricing: {},
          providerConfig: {
            apiKeyEnv: "CUSTOM_PROVIDER_API_KEY",
            baseURL: "https://provider.example.test",
            endpoint: "javascript:alert(1)",
          },
          reason: "创建发布检查缺项模型",
        }),
      });
      const createPayload = await createResponse.json();
      const modelId = createPayload.data.id;

      const publishResponse = await fetch(`${server.origin}/api/admin/models/${modelId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-incomplete-publish",
          cookie,
        },
        body: JSON.stringify({
          status: "active",
          reason: "尝试发布缺项模型",
        }),
      });
      const publishPayload = await publishResponse.json();
      const detailResponse = await fetch(`${server.origin}/api/admin/models/${modelId}`, {
        headers: { cookie },
      });
      const detailPayload = await detailResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(publishResponse.status, 400);
      assert.equal(publishPayload.error.code, "admin_model_launch_check_failed");
      assert.deepEqual(
        publishPayload.error.details.failedItems.map((item: { key: string }) => item.key),
        ["endpoint", "queryTaskEndpoint", "parameterSchema", "pricing", "dispatchPolicy"],
      );
      assert.equal(detailResponse.status, 200);
      assert.equal(detailPayload.data.model.status, "disabled");
    } finally {
      await server.close();
    }
  });

  it("blocks publishing async polling model configs without a valid query endpoint", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/models`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-async-query-endpoint-create",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "admin-async-query-missing",
          displayName: "缺少轮询端点模型",
          providerName: "custom",
          providerModel: "async-video-model",
          providerProtocol: "custom_http",
          invocationMode: "async_polling",
          mediaType: "video",
          taskModes: ["video.text_to_video"],
          parameterSchema: {
            prompt: { label: "提示词", type: "string", required: true },
          },
          pricing: { unit: "video", baseCredits: 120 },
          providerConfig: {
            apiKeyEnv: "CUSTOM_PROVIDER_API_KEY",
            baseURL: "https://provider.example.test",
            createTaskEndpoint: "/v1/tasks",
          },
          dispatchPolicy: {
            submitQueueName: "generation-submit-async-query-missing",
            pollQueueName: "generation-poll-async-query-missing",
            providerRpmLimit: 30,
            providerConcurrentLimit: 2,
          },
          reason: "创建缺少轮询端点模型",
        }),
      });
      const createPayload = await createResponse.json();
      const modelId = createPayload.data.id;

      const publishResponse = await fetch(`${server.origin}/api/admin/models/${modelId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-async-query-endpoint-publish",
          cookie,
        },
        body: JSON.stringify({
          status: "active",
          reason: "尝试发布缺少轮询端点模型",
        }),
      });
      const publishPayload = await publishResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(publishResponse.status, 400);
      assert.equal(publishPayload.error.code, "admin_model_launch_check_failed");
      assert.deepEqual(
        publishPayload.error.details.failedItems.map((item: { key: string }) => item.key),
        ["queryTaskEndpoint"],
      );
    } finally {
      await server.close();
    }
  });

  it("serves database-backed users, team permission accounts, and credit summaries", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    await seedAdminUserListFixture(db);

    try {
      const forbidden = await fetch(`${server.origin}/api/admin/users`);
      const forbiddenPayload = await forbidden.json();
      const usersResponse = await fetch(`${server.origin}/api/admin/users`, {
        headers: { cookie },
      });
      const usersPayload = await usersResponse.json();
      const teamPermissionAccountsResponse = await fetch(
        `${server.origin}/api/admin/team-permission-accounts`,
        { headers: { cookie } },
      );
      const teamPermissionAccountsPayload = await teamPermissionAccountsResponse.json();
      const teamAdmin = usersPayload.data.find(
        (user: { displayName: string }) => user.displayName === "分镜组长",
      );

      const subaccountsResponse = await fetch(
        `${server.origin}/api/admin/users/${teamAdmin.userId}/subaccounts`,
        { headers: { cookie } },
      );
      const subaccountsPayload = await subaccountsResponse.json();

      assert.equal(forbidden.status, 401);
      assert.equal(forbiddenPayload.error.code, "admin_unauthenticated");
      assert.equal(usersResponse.status, 200);
      assert.ok(usersPayload.data.length >= 3);
      assert.equal(teamPermissionAccountsResponse.status, 200);
      assert.deepEqual(
        teamPermissionAccountsPayload.data.map(
          (user: { displayName: string; accountType: string; subaccountCount: number }) => ({
            displayName: user.displayName,
            accountType: user.accountType,
            subaccountCount: user.subaccountCount,
          }),
        ),
        [{ displayName: "分镜组长", accountType: "team_permission_account", subaccountCount: 1 }],
      );
      assert.equal(teamAdmin.accountType, "team_permission_account");
      assert.equal(teamAdmin.phone, "+86138****0002");
      assert.equal(teamAdmin.email, "gr***@example.test");
      assert.equal(teamAdmin.teamRole, "group_admin");
      assert.equal(teamAdmin.availableCredits, 2100);
      assert.equal(teamAdmin.reservedCredits, 40);
      assert.equal(teamAdmin.subaccountCount, 1);
      assert.equal(subaccountsResponse.status, 200);
      assert.deepEqual(subaccountsPayload.data.map((user: { displayName: string }) => user.displayName), [
        "子账户 A",
      ]);
    } finally {
      await server.close();
    }
  });

  it("reveals full user contact only to authorized admins and writes audit records", async () => {
    const db = await createMigratedTestDb();
    const { server: supportServer, cookie: supportCookie } = await createLoggedInAdminServer(db, {
      role: "support_admin",
    });
    await seedAdminUserListFixture(db);

    try {
      const usersResponse = await fetch(`${supportServer.origin}/api/admin/users`, {
        headers: { cookie: supportCookie },
      });
      const usersPayload = await usersResponse.json();
      const owner = usersPayload.data.find(
        (user: { accountType: string }) => user.accountType === "owner_account",
      );

      const revealResponse = await fetch(
        `${supportServer.origin}/api/admin/users/${owner.userId}/contact/reveal`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "support-reveal-owner-contact",
            cookie: supportCookie,
          },
          body: JSON.stringify({ reason: "核对用户工单联系方式" }),
        },
      );
      const revealPayload = await revealResponse.json();
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type = 'admin.user.contact_revealed'
        `,
      );

      assert.equal(usersResponse.status, 200);
      assert.equal(owner.phone, "+86138****0001");
      assert.equal(owner.email, "ow***@example.test");
      assert.equal(revealResponse.status, 200);
      assert.deepEqual(revealPayload.data.contact, {
        phone: "+8613800200001",
        email: "owner@example.test",
      });
      assert.deepEqual(audit.rows, [
        {
          event_type: "admin.user.contact_revealed",
          reason: "核对用户工单联系方式",
        },
      ]);
    } finally {
      await supportServer.close();
    }

    const unauthorizedDb = await createMigratedTestDb();
    const { server: auditServer, cookie: auditCookie } = await createLoggedInAdminServer(unauthorizedDb, {
      role: "audit_viewer",
    });
    await seedAdminUserListFixture(unauthorizedDb);

    try {
      const revealResponse = await fetch(
        `${auditServer.origin}/api/admin/users/93000000-0000-4000-8000-000000000001/contact/reveal`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "audit-viewer-reveal-owner-contact",
            cookie: auditCookie,
          },
          body: JSON.stringify({ reason: "audit viewer should not reveal contact" }),
        },
      );
      const revealPayload = await revealResponse.json();

      assert.equal(revealResponse.status, 403);
      assert.equal(revealPayload.error.code, "admin_forbidden");
    } finally {
      await auditServer.close();
    }
  });

  it("lets admins manually grant credits to an account with ledger and audit records", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    await seedAdminUserListFixture(db);

    try {
      const usersBeforeResponse = await fetch(`${server.origin}/api/admin/users`, {
        headers: { cookie },
      });
      const usersBeforePayload = await usersBeforeResponse.json();
      const owner = usersBeforePayload.data.find(
        (user: { accountType: string }) => user.accountType === "owner_account",
      );

      const missingIdempotency = await fetch(
        `${server.origin}/api/admin/users/${owner.userId}/credits/grant`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ amount: 100, reason: "客服补偿", workOrderNo: "CS-20260605-001" }),
        },
      );
      const missingIdempotencyPayload = await missingIdempotency.json();

      const grantResponse = await fetch(
        `${server.origin}/api/admin/users/${owner.userId}/credits/grant`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-credit-grant-owner-100",
            cookie,
          },
          body: JSON.stringify({ amount: 100, reason: "客服补偿", workOrderNo: "CS-20260605-001" }),
        },
      );
      const grantPayload = await grantResponse.json();
      const replayResponse = await fetch(
        `${server.origin}/api/admin/users/${owner.userId}/credits/grant`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-credit-grant-owner-100",
            cookie,
          },
          body: JSON.stringify({ amount: 100, reason: "客服补偿", workOrderNo: "CS-20260605-001" }),
        },
      );
      const replayPayload = await replayResponse.json();
      const usersAfterResponse = await fetch(`${server.origin}/api/admin/users`, {
        headers: { cookie },
      });
      const usersAfterPayload = await usersAfterResponse.json();
      const ownerAfter = usersAfterPayload.data.find(
        (user: { userId: string }) => user.userId === owner.userId,
      );
      const ledger = await db.query<{ amount: number | string; reason: string; work_order_no: string | null }>(
        `
          SELECT amount, reason, metadata_json->>'workOrderNo' AS work_order_no
          FROM credit_ledger_entries
          WHERE source_type = 'admin_manual_grant'
        `,
      );
      const audit = await db.query<{ event_type: string; reason: string | null; work_order_no: string | null }>(
        `
          SELECT event_type, reason, metadata_json->>'workOrderNo' AS work_order_no
          FROM audit_events
          WHERE event_type = 'admin.credit.granted'
        `,
      );

      assert.equal(missingIdempotency.status, 400);
      assert.deepEqual(missingIdempotencyPayload, { error: "idempotency_key_required" });
      assert.equal(grantResponse.status, 200, JSON.stringify(grantPayload));
      assert.equal(grantPayload.data.amount, 100);
      assert.equal(grantPayload.data.availableCredits, 8520);
      assert.equal(replayResponse.status, 200);
      assert.deepEqual(replayPayload, grantPayload);
      assert.equal(ownerAfter.availableCredits, 8520);
      assert.deepEqual(ledger.rows.map((row) => Number(row.amount)), [100]);
      assert.deepEqual(ledger.rows.map((row) => row.reason), ["客服补偿"]);
      assert.deepEqual(ledger.rows.map((row) => row.work_order_no), ["CS-20260605-001"]);
      assert.deepEqual(audit.rows, [
        {
          event_type: "admin.credit.granted",
          reason: "客服补偿",
          work_order_no: "CS-20260605-001",
        },
      ]);
    } finally {
      await server.close();
    }
  });

  it("lets admins update user profile, status, deduct credits, and inspect ledger", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    await seedAdminUserListFixture(db);

    try {
      const usersBeforeResponse = await fetch(`${server.origin}/api/admin/users`, {
        headers: { cookie },
      });
      const usersBeforePayload = await usersBeforeResponse.json();
      const owner = usersBeforePayload.data.find(
        (user: { accountType: string }) => user.accountType === "owner_account",
      );

      const profileResponse = await fetch(`${server.origin}/api/admin/users/${owner.userId}/profile`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-user-profile-owner",
          cookie,
        },
        body: JSON.stringify({
          displayName: "白夜工作室 Pro",
          email: "owner-pro@example.test",
          reason: "客服协助修改资料",
        }),
      });
      const profilePayload = await profileResponse.json();

      const statusResponse = await fetch(`${server.origin}/api/admin/users/${owner.userId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-user-disable-owner",
          cookie,
        },
        body: JSON.stringify({
          status: "disabled",
          reason: "风险处理临时禁用",
        }),
      });
      const statusPayload = await statusResponse.json();

      const deductResponse = await fetch(`${server.origin}/api/admin/users/${owner.userId}/credits/deduct`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-credit-deduct-owner-70",
          cookie,
        },
        body: JSON.stringify({
          amount: 70,
          reason: "异常赠送扣回",
          workOrderNo: "FIN-20260605-088",
        }),
      });
      const deductPayload = await deductResponse.json();
      const replayDeductResponse = await fetch(`${server.origin}/api/admin/users/${owner.userId}/credits/deduct`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-credit-deduct-owner-70",
          cookie,
        },
        body: JSON.stringify({
          amount: 70,
          reason: "异常赠送扣回",
          workOrderNo: "FIN-20260605-088",
        }),
      });
      const replayDeductPayload = await replayDeductResponse.json();

      const ledgerResponse = await fetch(`${server.origin}/api/admin/users/${owner.userId}/credits/ledger`, {
        headers: { cookie },
      });
      const ledgerPayload = await ledgerResponse.json();
      const usersAfterResponse = await fetch(`${server.origin}/api/admin/users`, {
        headers: { cookie },
      });
      const usersAfterPayload = await usersAfterResponse.json();
      const ownerAfter = usersAfterPayload.data.find(
        (user: { userId: string }) => user.userId === owner.userId,
      );
      const creditLedger = await db.query<{ reason: string; work_order_no: string | null }>(
        `
          SELECT reason, metadata_json->>'workOrderNo' AS work_order_no
          FROM credit_ledger_entries
          WHERE source_type = 'admin_manual_deduct'
            AND entry_type = 'reservation'
        `,
      );
      const audit = await db.query<{ event_type: string; reason: string | null; work_order_no: string | null }>(
        `
          SELECT event_type, reason, metadata_json->>'workOrderNo' AS work_order_no
          FROM audit_events
          WHERE event_type IN (
            'admin.user.profile_updated',
            'admin.user.status_changed',
            'admin.credit.deducted'
          )
          ORDER BY event_type ASC
        `,
      );

      assert.equal(profileResponse.status, 200);
      assert.equal(profilePayload.data.displayName, "白夜工作室 Pro");
      assert.equal(profilePayload.data.email, "ow***@example.test");
      assert.equal(statusResponse.status, 200);
      assert.equal(statusPayload.data.status, "disabled");
      assert.equal(deductResponse.status, 200);
      assert.equal(deductPayload.data.amount, 70);
      assert.equal(deductPayload.data.availableCredits, 8350);
      assert.deepEqual(replayDeductPayload, deductPayload);
      assert.equal(replayDeductResponse.status, 200);
      assert.equal(ledgerResponse.status, 200);
      assert.ok(
        ledgerPayload.data.some(
          (entry: { sourceType: string; amount: number }) =>
            entry.sourceType === "admin_manual_deduct" && entry.amount === 70,
        ),
      );
      assert.deepEqual(creditLedger.rows, [{ reason: "异常赠送扣回", work_order_no: "FIN-20260605-088" }]);
      assert.equal(ownerAfter.displayName, "白夜工作室 Pro");
      assert.equal(ownerAfter.status, "disabled");
      assert.equal(ownerAfter.availableCredits, 8350);
      assert.deepEqual(audit.rows, [
        { event_type: "admin.credit.deducted", reason: "异常赠送扣回", work_order_no: "FIN-20260605-088" },
        { event_type: "admin.user.profile_updated", reason: "客服协助修改资料", work_order_no: null },
        { event_type: "admin.user.status_changed", reason: "风险处理临时禁用", work_order_no: null },
      ]);
    } finally {
      await server.close();
    }
  });

  it("lets admins archive users as a soft-delete status with audit records", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    await seedAdminUserListFixture(db);

    try {
      const usersBeforeResponse = await fetch(`${server.origin}/api/admin/users`, {
        headers: { cookie },
      });
      const usersBeforePayload = await usersBeforeResponse.json();
      const owner = usersBeforePayload.data.find(
        (user: { accountType: string }) => user.accountType === "owner_account",
      );

      const archiveResponse = await fetch(`${server.origin}/api/admin/users/${owner.userId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-user-archive-owner",
          cookie,
        },
        body: JSON.stringify({
          status: "archived",
          reason: "用户请求关闭账户并保留审计记录",
        }),
      });
      const archivePayload = await archiveResponse.json();
      const membership = await db.query<{ status: string }>(
        "SELECT status FROM memberships WHERE user_id = $1",
        [owner.userId],
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type = 'admin.user.status_changed'
        `,
      );

      const usersAfterResponse = await fetch(`${server.origin}/api/admin/users`, {
        headers: { cookie },
      });
      const usersAfterPayload = await usersAfterResponse.json();
      const ownerAfter = usersAfterPayload.data.find(
        (user: { userId: string }) => user.userId === owner.userId,
      );

      assert.equal(archiveResponse.status, 200);
      assert.equal(archivePayload.data.status, "archived");
      assert.equal(ownerAfter.status, "archived");
      assert.ok(membership.rows.every((row) => row.status === "archived"));
      assert.deepEqual(audit.rows, [
        {
          event_type: "admin.user.status_changed",
          reason: "用户请求关闭账户并保留审计记录",
        },
      ]);
    } finally {
      await server.close();
    }
  });

  it("lets admins manage runtime settings, secret references, and admin accounts", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const forbidden = await fetch(`${server.origin}/api/admin/settings`);
      const forbiddenPayload = await forbidden.json();

      const missingIdempotency = await fetch(`${server.origin}/api/admin/settings/site.registration_enabled`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          value: true,
          valueType: "boolean",
          scope: "creator",
          reason: "上线开放注册",
        }),
      });
      const missingIdempotencyPayload = await missingIdempotency.json();

      const updateSettingResponse = await fetch(`${server.origin}/api/admin/settings/site.registration_enabled`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-setting-registration-enabled",
          cookie,
        },
        body: JSON.stringify({
          value: true,
          valueType: "boolean",
          scope: "creator",
          description: "是否允许新用户注册",
          reason: "上线开放注册",
        }),
      });
      const updateSettingPayload = await updateSettingResponse.json();

      const secretResponse = await fetch(`${server.origin}/api/admin/secret-references`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-secret-openai-ref",
          cookie,
        },
        body: JSON.stringify({
          secretRef: "openai-images",
          envName: "OPENAI_API_KEY",
          purpose: "OpenAI 图片模型",
          providerName: "openai",
        }),
      });
      const secretPayload = await secretResponse.json();

      const accountResponse = await fetch(`${server.origin}/api/admin/admin-accounts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-account-support-user",
          cookie,
        },
        body: JSON.stringify({
          loginName: "support_admin",
          password: "Support-Admin-12345",
          displayName: "客服管理员",
          roles: ["support_admin"],
          remark: "客服处理用户资料和积分问题",
        }),
      });
      const accountPayload = await accountResponse.json();

      const settingsResponse = await fetch(`${server.origin}/api/admin/settings`, {
        headers: { cookie },
      });
      const settingsPayload = await settingsResponse.json();
      const accountsResponse = await fetch(`${server.origin}/api/admin/admin-accounts`, {
        headers: { cookie },
      });
      const accountsPayload = await accountsResponse.json();

      const newLoginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          loginName: "support_admin",
          password: "Support-Admin-12345",
        }),
      });
      const newLoginPayload = await newLoginResponse.json();

      const revisions = await db.query<{ config_key: string; reason: string | null }>(
        "SELECT config_key, reason FROM runtime_config_revisions WHERE config_key = 'site.registration_enabled'",
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type IN ('admin.settings.updated', 'admin.account.created')
          ORDER BY event_type ASC
        `,
      );

      assert.equal(forbidden.status, 401);
      assert.equal(forbiddenPayload.error.code, "admin_unauthenticated");
      assert.equal(missingIdempotency.status, 400);
      assert.deepEqual(missingIdempotencyPayload, { error: "idempotency_key_required" });
      assert.equal(updateSettingResponse.status, 200);
      assert.equal(updateSettingPayload.data.key, "site.registration_enabled");
      assert.equal(updateSettingPayload.data.value, true);
      assert.equal(secretResponse.status, 200);
      assert.equal(secretPayload.data.envName, "OPENAI_API_KEY");
      assert.equal(secretPayload.data.status, "unknown");
      assert.equal(accountResponse.status, 200);
      assert.equal(accountPayload.data.loginName, "support_admin");
      assert.deepEqual(accountPayload.data.roles, ["support_admin"]);
      assert.equal(settingsResponse.status, 200);
      assert.equal(
        settingsPayload.data.configs.find((config: { key: string }) => config.key === "site.registration_enabled").value,
        true,
      );
      assert.equal(
        settingsPayload.data.secretReferences.find((secret: { envName: string }) => secret.envName === "OPENAI_API_KEY").secretRef,
        "openai-images",
      );
      assert.equal(accountsResponse.status, 200);
      assert.ok(accountsPayload.data.some((account: { loginName: string }) => account.loginName === "support_admin"));
      assert.equal(newLoginResponse.status, 200);
      assert.deepEqual(newLoginPayload.data.roles, ["support_admin"]);
      assert.deepEqual(revisions.rows, [
        {
          config_key: "site.registration_enabled",
          reason: "上线开放注册",
        },
      ]);
      assert.deepEqual(audit.rows, [
        {
          event_type: "admin.account.created",
          reason: "客服处理用户资料和积分问题",
        },
        {
          event_type: "admin.settings.updated",
          reason: "上线开放注册",
        },
      ]);
    } finally {
      await server.close();
    }
  });

  it("rejects runtime config values that do not match their declared schema type", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const invalidBooleanResponse = await fetch(`${server.origin}/api/admin/settings/site.registration_enabled`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-setting-invalid-boolean-schema",
          cookie,
        },
        body: JSON.stringify({
          value: "true",
          valueType: "boolean",
          scope: "creator",
          reason: "验证运行配置 schema 校验",
        }),
      });
      const invalidBooleanPayload = await invalidBooleanResponse.json();

      const configs = await db.query<{ key: string }>(
        "SELECT key FROM runtime_config_entries WHERE key = 'site.registration_enabled'",
      );
      const revisions = await db.query<{ config_key: string }>(
        "SELECT config_key FROM runtime_config_revisions WHERE config_key = 'site.registration_enabled'",
      );
      const audit = await db.query<{ event_type: string }>(
        "SELECT event_type FROM audit_events WHERE event_type = 'admin.settings.updated'",
      );

      assert.equal(invalidBooleanResponse.status, 400);
      assert.equal(invalidBooleanPayload.error.code, "invalid_config_value");
      assert.deepEqual(configs.rows, []);
      assert.deepEqual(revisions.rows, []);
      assert.deepEqual(audit.rows, []);
    } finally {
      await server.close();
    }
  });

  it("lets admins probe secret reference availability without exposing secret values", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    const originalSecret = process.env.ADMIN_TEST_SECRET_CONFIGURED;
    process.env.ADMIN_TEST_SECRET_CONFIGURED = "super-secret-value-that-must-not-leak";
    delete process.env.ADMIN_TEST_SECRET_MISSING;

    try {
      const configuredCreate = await fetch(`${server.origin}/api/admin/secret-references`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-secret-configured-create",
          cookie,
        },
        body: JSON.stringify({
          secretRef: "configured-secret",
          envName: "ADMIN_TEST_SECRET_CONFIGURED",
          purpose: "密钥探测已配置测试",
          providerName: "test",
        }),
      });
      const configuredCreatePayload = await configuredCreate.json();
      const missingCreate = await fetch(`${server.origin}/api/admin/secret-references`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-secret-missing-create",
          cookie,
        },
        body: JSON.stringify({
          secretRef: "missing-secret",
          envName: "ADMIN_TEST_SECRET_MISSING",
          purpose: "密钥探测缺失测试",
          providerName: "test",
        }),
      });
      const missingCreatePayload = await missingCreate.json();

      const configuredProbe = await fetch(
        `${server.origin}/api/admin/secret-references/${configuredCreatePayload.data.id}/probe`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-secret-configured-probe",
            cookie,
          },
          body: JSON.stringify({ reason: "检查已配置密钥引用" }),
        },
      );
      const configuredProbePayload = await configuredProbe.json();
      const missingProbe = await fetch(
        `${server.origin}/api/admin/secret-references/${missingCreatePayload.data.id}/probe`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-secret-missing-probe",
            cookie,
          },
          body: JSON.stringify({ reason: "检查缺失密钥引用" }),
        },
      );
      const missingProbePayload = await missingProbe.json();

      const rows = await db.query<{ env_name: string; status: string; last_checked_at: Date | null }>(
        `
          SELECT env_name, status, last_checked_at
          FROM admin_secret_references
          WHERE env_name IN ('ADMIN_TEST_SECRET_CONFIGURED', 'ADMIN_TEST_SECRET_MISSING')
          ORDER BY env_name ASC
        `,
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type = 'admin.secret_reference.probed'
          ORDER BY reason ASC
        `,
      );
      const combinedPayload = JSON.stringify([configuredProbePayload, missingProbePayload, rows.rows, audit.rows]);

      assert.equal(configuredProbe.status, 200);
      assert.equal(configuredProbePayload.data.status, "configured");
      assert.equal(configuredProbePayload.data.envName, "ADMIN_TEST_SECRET_CONFIGURED");
      assert.equal(typeof configuredProbePayload.data.lastCheckedAt, "string");
      assert.equal(missingProbe.status, 200);
      assert.equal(missingProbePayload.data.status, "missing");
      assert.equal(typeof missingProbePayload.data.lastCheckedAt, "string");
      assert.deepEqual(
        rows.rows.map((row) => ({ env_name: row.env_name, status: row.status, checked: Boolean(row.last_checked_at) })),
        [
          { env_name: "ADMIN_TEST_SECRET_CONFIGURED", status: "configured", checked: true },
          { env_name: "ADMIN_TEST_SECRET_MISSING", status: "missing", checked: true },
        ],
      );
      assert.deepEqual(audit.rows, [
        { event_type: "admin.secret_reference.probed", reason: "检查已配置密钥引用" },
        { event_type: "admin.secret_reference.probed", reason: "检查缺失密钥引用" },
      ]);
      assert.doesNotMatch(combinedPayload, /super-secret-value-that-must-not-leak/);
    } finally {
      if (originalSecret === undefined) {
        delete process.env.ADMIN_TEST_SECRET_CONFIGURED;
      } else {
        process.env.ADMIN_TEST_SECRET_CONFIGURED = originalSecret;
      }
      await server.close();
    }
  });

  it("lets admins inspect setting revisions, rollback settings, and update admin accounts", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const firstUpdate = await fetch(`${server.origin}/api/admin/settings/site.registration_enabled`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-setting-registration-first",
          cookie,
        },
        body: JSON.stringify({
          value: true,
          valueType: "boolean",
          scope: "creator",
          description: "是否允许新用户注册",
          reason: "首次开放注册",
        }),
      });
      const secondUpdate = await fetch(`${server.origin}/api/admin/settings/site.registration_enabled`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-setting-registration-second",
          cookie,
        },
        body: JSON.stringify({
          value: false,
          valueType: "boolean",
          scope: "creator",
          description: "是否允许新用户注册",
          reason: "临时关闭注册",
        }),
      });

      const revisionsResponse = await fetch(
        `${server.origin}/api/admin/settings/revisions?key=site.registration_enabled`,
        { headers: { cookie } },
      );
      const revisionsPayload = await revisionsResponse.json();

      const rollbackResponse = await fetch(
        `${server.origin}/api/admin/settings/site.registration_enabled/rollback`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-setting-registration-rollback",
            cookie,
          },
          body: JSON.stringify({
            revisionId: revisionsPayload.data[0].id,
            reason: "回滚到上一个注册策略",
          }),
        },
      );
      const rollbackPayload = await rollbackResponse.json();

      const accountCreateResponse = await fetch(`${server.origin}/api/admin/admin-accounts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-account-ops-user",
          cookie,
        },
        body: JSON.stringify({
          loginName: "ops_admin",
          password: "Ops-Admin-12345",
          displayName: "运营管理员",
          roles: ["ops_admin"],
          remark: "运营处理任务异常",
        }),
      });
      const accountCreatePayload = await accountCreateResponse.json();

      const missingAccountIdempotency = await fetch(
        `${server.origin}/api/admin/admin-accounts/${accountCreatePayload.data.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            displayName: "运营主管",
            roles: ["ops_admin", "audit_viewer"],
            status: "disabled",
            remark: "轮岗暂停使用",
            reason: "轮岗暂停使用",
          }),
        },
      );
      const missingAccountIdempotencyPayload = await missingAccountIdempotency.json();

      const accountUpdateResponse = await fetch(
        `${server.origin}/api/admin/admin-accounts/${accountCreatePayload.data.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-account-ops-user-update",
            cookie,
          },
          body: JSON.stringify({
            displayName: "运营主管",
            roles: ["ops_admin", "audit_viewer"],
            status: "disabled",
            remark: "轮岗暂停使用",
            reason: "轮岗暂停使用",
          }),
        },
      );
      const accountUpdatePayload = await accountUpdateResponse.json();

      const missingPasswordResetIdempotency = await fetch(
        `${server.origin}/api/admin/admin-accounts/${accountCreatePayload.data.id}/password`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            newPassword: "Ops-Admin-Reset-67890",
            reason: "运营管理员忘记密码",
          }),
        },
      );
      const missingPasswordResetIdempotencyPayload = await missingPasswordResetIdempotency.json();

      const passwordResetResponse = await fetch(
        `${server.origin}/api/admin/admin-accounts/${accountCreatePayload.data.id}/password`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-account-ops-user-password-reset",
            cookie,
          },
          body: JSON.stringify({
            newPassword: "Ops-Admin-Reset-67890",
            reason: "运营管理员忘记密码",
          }),
        },
      );
      const passwordResetPayload = await passwordResetResponse.json();

      await fetch(
        `${server.origin}/api/admin/admin-accounts/${accountCreatePayload.data.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-account-ops-user-reactivate",
            cookie,
          },
          body: JSON.stringify({
            displayName: "运营主管",
            roles: ["ops_admin", "audit_viewer"],
            status: "active",
            remark: "重置密码后恢复使用",
            reason: "重置密码后恢复使用",
          }),
        },
      );

      const oldPasswordLoginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginName: "ops_admin", password: "Ops-Admin-12345" }),
      });
      const oldPasswordLoginPayload = await oldPasswordLoginResponse.json();
      const newPasswordLoginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginName: "ops_admin", password: "Ops-Admin-Reset-67890" }),
      });
      const newPasswordLoginPayload = await newPasswordLoginResponse.json();

      const settingsResponse = await fetch(`${server.origin}/api/admin/settings`, {
        headers: { cookie },
      });
      const settingsPayload = await settingsResponse.json();
      const accountsResponse = await fetch(`${server.origin}/api/admin/admin-accounts`, {
        headers: { cookie },
      });
      const accountsPayload = await accountsResponse.json();

      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type IN ('admin.settings.rolled_back', 'admin.account.updated', 'admin.account.password_reset')
          ORDER BY event_type ASC
        `,
      );

      assert.equal(firstUpdate.status, 200);
      assert.equal(secondUpdate.status, 200);
      assert.equal(revisionsResponse.status, 200);
      assert.equal(revisionsPayload.data.length, 2);
      assert.equal(revisionsPayload.data[0].reason, "临时关闭注册");
      assert.equal(revisionsPayload.data[0].previousValue, true);
      assert.equal(revisionsPayload.data[0].nextValue, false);
      assert.equal(rollbackResponse.status, 200);
      assert.equal(rollbackPayload.data.value, true);
      assert.equal(
        settingsPayload.data.configs.find((config: { key: string }) => config.key === "site.registration_enabled").value,
        true,
      );
      assert.equal(missingAccountIdempotency.status, 400);
      assert.deepEqual(missingAccountIdempotencyPayload, { error: "idempotency_key_required" });
      assert.equal(accountUpdateResponse.status, 200);
      assert.equal(accountUpdatePayload.data.displayName, "运营主管");
      assert.equal(accountUpdatePayload.data.status, "disabled");
      assert.deepEqual(accountUpdatePayload.data.roles, ["audit_viewer", "ops_admin"]);
      assert.equal(missingPasswordResetIdempotency.status, 400);
      assert.deepEqual(missingPasswordResetIdempotencyPayload, { error: "idempotency_key_required" });
      assert.equal(passwordResetResponse.status, 200);
      assert.deepEqual(passwordResetPayload.data, {
        accountId: accountCreatePayload.data.id,
        passwordReset: true,
      });
      assert.equal(oldPasswordLoginResponse.status, 401);
      assert.equal(oldPasswordLoginPayload.error.code, "admin_invalid_credentials");
      assert.equal(newPasswordLoginResponse.status, 200);
      assert.equal(newPasswordLoginPayload.data.account.loginName, "ops_admin");
      assert.ok(
        accountsPayload.data.some(
          (account: { id: string; status: string; roles: string[] }) =>
            account.id === accountCreatePayload.data.id &&
            account.status === "active" &&
            account.roles.includes("audit_viewer"),
        ),
      );
      assert.deepEqual(audit.rows, [
        { event_type: "admin.account.password_reset", reason: "运营管理员忘记密码" },
        { event_type: "admin.account.updated", reason: "轮岗暂停使用" },
        { event_type: "admin.account.updated", reason: "重置密码后恢复使用" },
        { event_type: "admin.settings.rolled_back", reason: "回滚到上一个注册策略" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("serves risk events and audit events to logged-in admins", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    const paymentIssueUserId = "83100000-0000-4000-8000-000000000001";
    const paymentIssuePackageId = "83200000-0000-4000-8000-000000000001";
    const paymentIssueOrderId = "83300000-0000-4000-8000-000000000001";

    await db.query(
      `
        INSERT INTO users (id, phone_e164, display_name, status)
        VALUES ($1, '+8613900000001', 'Admin Risk Payment User', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [paymentIssueUserId],
    );
    await db.query(
      `
        INSERT INTO organizations (id, name, status)
        VALUES ('10000000-0000-4000-8000-000000000001', 'Admin Risk Org', 'active')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
      `,
    );
    await db.query(
      `
        INSERT INTO credit_packages (
          id, code, display_name, credits, amount_minor, currency, status
        ) VALUES ($1, 'risk_issue_88', 'Risk Issue 88', 88, 8800, 'CNY', 'active')
      `,
      [paymentIssuePackageId],
    );
    await db.query(
      `
        INSERT INTO billing_orders (
          id,
          organization_id,
          created_by_user_id,
          order_no,
          credit_package_id,
          package_snapshot_json,
          credits,
          amount_minor,
          currency,
          status,
          expires_at,
          paid_at,
          successful_payment_intent_id
        ) VALUES (
          $1,
          '10000000-0000-4000-8000-000000000001',
          $2,
          'ORD-RISK-PAID-WITHOUT-CREDIT',
          $3,
          '{"code":"risk_issue_88","credits":88,"amountMinor":8800,"currency":"CNY"}'::jsonb,
          88,
          8800,
          'CNY',
          'paid',
          '2026-06-05T00:00:00.000Z',
          '2026-06-04T12:00:00.000Z',
          '83400000-0000-4000-8000-000000000001'
        )
      `,
      [paymentIssueOrderId, paymentIssueUserId, paymentIssuePackageId],
    );
    await db.query(
      `
        INSERT INTO payment_risk_events (
          id,
          organization_id,
          risk_type,
          severity,
          decision,
          status,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (
          '83000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'amount_mismatch',
          'critical',
          'manual_review',
          'open',
          '{"provider":"paylab","orderNo":"PAY-1001"}'::jsonb,
          '2026-06-04T09:00:00.000Z',
          '2026-06-04T09:00:00.000Z'
        ), (
          '83000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000001',
          'duplicate_payment',
          'warning',
          'approve',
          'reviewed',
          '{"provider":"paylab","orderNo":"PAY-1002"}'::jsonb,
          '2026-06-04T10:00:00.000Z',
          '2026-06-04T10:00:00.000Z'
        )
      `,
    );

    try {
      const forbidden = await fetch(`${server.origin}/api/admin/risks`);
      const forbiddenPayload = await forbidden.json();
      const risksResponse = await fetch(`${server.origin}/api/admin/risks`, {
        headers: { cookie },
      });
      const risksPayload = await risksResponse.json();
      const auditResponse = await fetch(`${server.origin}/api/admin/audit-events`, {
        headers: { cookie },
      });
      const auditPayload = await auditResponse.json();
      const reviewedRisksResponse = await fetch(`${server.origin}/api/admin/risks?riskStatus=reviewed`, {
        headers: { cookie },
      });
      const reviewedRisksPayload = await reviewedRisksResponse.json();

      assert.equal(forbidden.status, 401);
      assert.equal(forbiddenPayload.error.code, "admin_unauthenticated");
      assert.equal(risksResponse.status, 200);
      assert.deepEqual(
        risksPayload.data.risks.map((risk: { id: string; status: string }) => ({ id: risk.id, status: risk.status })),
        [
          { id: "83000000-0000-4000-8000-000000000001", status: "open" },
          { id: "83000000-0000-4000-8000-000000000002", status: "reviewed" },
        ],
      );
      assert.equal(reviewedRisksResponse.status, 200);
      assert.deepEqual(
        reviewedRisksPayload.data.risks.map((risk: { id: string; status: string }) => ({ id: risk.id, status: risk.status })),
        [{ id: "83000000-0000-4000-8000-000000000002", status: "reviewed" }],
      );
      assert.deepEqual(risksPayload.data.taskExceptions, []);
      assert.deepEqual(risksPayload.data.paymentIssues, [
        {
          issueType: "paid_without_credit",
          orderId: paymentIssueOrderId,
          orderNo: "ORD-RISK-PAID-WITHOUT-CREDIT",
          status: "open",
          credits: 88,
          amountMinor: 8800,
          currency: "CNY",
          paidAt: "2026-06-04T12:00:00.000Z",
          successfulPaymentIntentId: "83400000-0000-4000-8000-000000000001",
        },
      ]);
      assert.equal(auditResponse.status, 200);
      const loginAudit = auditPayload.data.find(
        (event: { eventType: string }) => event.eventType === "admin.auth.login_succeeded",
      );
      assert.ok(loginAudit);
      assert.equal(loginAudit.ipAddress, "127.0.0.1");
      assert.match(loginAudit.userAgent, /node/);
    } finally {
      await server.close();
    }
  });

  it("exports risk and audit CSVs only for risk export admins and records audit", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    await db.query(
      `
        INSERT INTO organizations (id, name, status)
        VALUES ('10000000-0000-4000-8000-000000000001', 'Admin Export Org', 'active')
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            status = EXCLUDED.status
      `,
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES (
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'Admin Export Workspace',
          'active'
        )
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            status = EXCLUDED.status
      `,
    );
    await db.query(
      `
        INSERT INTO payment_risk_events (
          id,
          organization_id,
          risk_type,
          severity,
          decision,
          status,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (
          '83000000-0000-4000-8000-000000000301',
          '10000000-0000-4000-8000-000000000001',
          'signature_invalid',
          'critical',
          'manual_review',
          'open',
          '{"provider":"paylab","token":"secret-token","orderNo":"PAY-CSV-1"}'::jsonb,
          '2026-06-04T09:00:00.000Z',
          '2026-06-04T09:00:00.000Z'
        )
      `,
    );

    try {
      const exportResponse = await fetch(`${server.origin}/api/admin/exports/risks.csv?riskStatus=open`, {
        headers: { cookie },
      });
      const riskCsv = await exportResponse.text();

      const auditExportResponse = await fetch(`${server.origin}/api/admin/exports/audit-events.csv`, {
        headers: { cookie },
      });
      const auditCsv = await auditExportResponse.text();

      const auditRows = await db.query<{ event_type: string; target_type: string; reason: string | null }>(
        `
          SELECT event_type, target_type, reason
          FROM audit_events
          WHERE event_type = 'admin.export.created'
          ORDER BY created_at ASC
        `,
      );

      assert.equal(exportResponse.status, 200);
      assert.equal(exportResponse.headers.get("content-type"), "text/csv; charset=utf-8");
      assert.match(exportResponse.headers.get("content-disposition") ?? "", /admin-risks-/);
      assert.match(riskCsv, /^风险ID,风险类型,等级,决策,状态,订单ID,支付单ID,创建时间\n/);
      assert.match(riskCsv, /83000000-0000-4000-8000-000000000301,signature_invalid,critical,manual_review,open/);
      assert.doesNotMatch(riskCsv, /secret-token/);

      assert.equal(auditExportResponse.status, 200);
      assert.match(auditCsv, /^事件ID,动作,对象类型,对象ID,原因,时间\n/);
      assert.match(auditCsv, /admin\.export\.created,admin_export/);
      assert.doesNotMatch(auditCsv, /secret-token/);

      assert.deepEqual(
        auditRows.rows.map((row) => ({
          event_type: row.event_type,
          target_type: row.target_type,
          reason: row.reason,
        })),
        [
          { event_type: "admin.export.created", target_type: "admin_export", reason: "export risks csv" },
          { event_type: "admin.export.created", target_type: "admin_export", reason: "export audit-events csv" },
        ],
      );
    } finally {
      await server.close();
    }

    const auditDb = await createMigratedTestDb();
    const { server: auditServer, cookie: auditCookie } = await createLoggedInAdminServer(auditDb, {
      role: "audit_viewer",
    });
    try {
      const forbidden = await fetch(`${auditServer.origin}/api/admin/exports/audit-events.csv`, {
        headers: { cookie: auditCookie },
      });
      const forbiddenPayload = await forbidden.json();

      assert.equal(forbidden.status, 403);
      assert.equal(forbiddenPayload.error.code, "admin_forbidden");
    } finally {
      await auditServer.close();
    }
  });

  it("lets admins review payment risk events with audit records", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    await db.query(
      `
        INSERT INTO payment_risk_events (
          id,
          organization_id,
          risk_type,
          severity,
          decision,
          status,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (
          '83000000-0000-4000-8000-000000000101',
          '10000000-0000-4000-8000-000000000001',
          'amount_mismatch',
          'critical',
          'manual_review',
          'open',
          '{"provider":"paylab","orderNo":"PAY-2001"}'::jsonb,
          '2026-06-04T10:00:00.000Z',
          '2026-06-04T10:00:00.000Z'
        )
      `,
    );

    try {
      const missingIdempotency = await fetch(
        `${server.origin}/api/admin/risks/83000000-0000-4000-8000-000000000101/review`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ reason: "核对回调后放行" }),
        },
      );
      const missingIdempotencyPayload = await missingIdempotency.json();

      const reviewResponse = await fetch(
        `${server.origin}/api/admin/risks/83000000-0000-4000-8000-000000000101/review`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-risk-review-pay-2001",
            cookie,
          },
          body: JSON.stringify({ reason: "核对回调后放行" }),
        },
      );
      const reviewPayload = await reviewResponse.json();

      const replayResponse = await fetch(
        `${server.origin}/api/admin/risks/83000000-0000-4000-8000-000000000101/review`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-risk-review-pay-2001",
            cookie,
          },
          body: JSON.stringify({ reason: "核对回调后放行" }),
        },
      );
      const replayPayload = await replayResponse.json();

      const risk = await db.query<{ status: string; review_reason: string | null }>(
        "SELECT status, review_reason FROM payment_risk_events WHERE id = '83000000-0000-4000-8000-000000000101'",
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        "SELECT event_type, reason FROM audit_events WHERE event_type = 'admin.risk.reviewed'",
      );

      assert.equal(missingIdempotency.status, 400);
      assert.deepEqual(missingIdempotencyPayload, { error: "idempotency_key_required" });
      assert.equal(reviewResponse.status, 200);
      assert.equal(reviewPayload.data.status, "reviewed");
      assert.equal(reviewPayload.data.reviewReason, "核对回调后放行");
      assert.equal(replayResponse.status, 200);
      assert.deepEqual(replayPayload, reviewPayload);
      assert.deepEqual(risk.rows, [{ status: "reviewed", review_reason: "核对回调后放行" }]);
      assert.deepEqual(audit.rows, [{ event_type: "admin.risk.reviewed", reason: "核对回调后放行" }]);
    } finally {
      await server.close();
    }
  });

  it("lets logged-in backend admins retry failed tasks and repair paid orders through documented ops routes", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    const adminOpsUserId = "84000000-0000-4000-8000-000000000001";
    const workflowId = "85000000-0000-4000-8000-000000000001";
    const failedTaskId = "86000000-0000-4000-8000-000000000001";
    const packageId = "87000000-0000-4000-8000-000000000001";
    const paidOrderId = "88000000-0000-4000-8000-000000000001";

    await db.query(
      `
        INSERT INTO users (id, phone_e164, display_name, status)
        VALUES ($1, '+8613999999001', '后台运营目标用户', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [adminOpsUserId],
    );
    await db.query(
      `
        INSERT INTO organizations (id, name, status)
        VALUES ('10000000-0000-4000-8000-000000000001', 'Admin Ops Org', 'active')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
      `,
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES (
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'Admin Ops Workspace',
          'active'
        )
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
      `,
    );
    await db.query(
      `
        INSERT INTO workflows (
          id, organization_id, workspace_id, workflow_type, status, input_snapshot_json, created_by_user_id
        ) VALUES (
          $1,
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          'shot.image.generate',
          'failed',
          '{}'::jsonb,
          $2
        )
      `,
      [workflowId, adminOpsUserId],
    );
    await db.query(
      `
        INSERT INTO tasks (
          id,
          organization_id,
          workspace_id,
          workflow_id,
          task_type,
          status,
          queue_name,
          input_snapshot_json,
          target_entity_type,
          target_entity_id,
          max_attempts,
          attempt_count,
          failure_code
        ) VALUES (
          $1,
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          $2,
          'generate_shot_image',
          'failed',
          'generation-submit-image',
          '{}'::jsonb,
          'shot',
          $1,
          2,
          1,
          'provider_timeout'
        )
      `,
      [failedTaskId, workflowId],
    );
    await db.query(
      `
        INSERT INTO credit_packages (
          id, code, display_name, credits, amount_minor, currency, status
        ) VALUES ($1, 'admin_ops_120', 'Admin Ops 120', 120, 9900, 'CNY', 'active')
      `,
      [packageId],
    );
    await db.query(
      `
        INSERT INTO billing_orders (
          id,
          organization_id,
          created_by_user_id,
          order_no,
          credit_package_id,
          package_snapshot_json,
          credits,
          amount_minor,
          currency,
          status,
          expires_at,
          paid_at,
          successful_payment_intent_id
        ) VALUES (
          $1,
          '10000000-0000-4000-8000-000000000001',
          $2,
          'ORD-ADMIN-OPS-PAID-1',
          $3,
          '{"code":"admin_ops_120","credits":120,"amountMinor":9900,"currency":"CNY"}'::jsonb,
          120,
          9900,
          'CNY',
          'paid',
          '2026-06-05T00:00:00.000Z',
          '2026-06-04T11:00:00.000Z',
          '89000000-0000-4000-8000-000000000001'
        )
      `,
      [paidOrderId, adminOpsUserId, packageId],
    );

    try {
      const missingRetryIdempotency = await fetch(
        `${server.origin}/api/admin/ops/tasks/${failedTaskId}/retry`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ reason: "供应商超时已恢复" }),
        },
      );
      const missingRetryIdempotencyPayload = await missingRetryIdempotency.json();

      const retryResponse = await fetch(
        `${server.origin}/api/admin/ops/tasks/${failedTaskId}/retry`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-platform-task-retry",
            cookie,
          },
          body: JSON.stringify({ reason: "供应商超时已恢复" }),
        },
      );
      const retryPayload = await retryResponse.json();

      const repairResponse = await fetch(
        `${server.origin}/api/admin/ops/payments/${paidOrderId}/repair-credit`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-platform-payment-repair",
            cookie,
          },
          body: JSON.stringify({ reason: "支付成功但积分消费者未执行" }),
        },
      );
      const repairPayload = await repairResponse.json();

      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [failedTaskId],
      );
      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [paidOrderId],
      );
      const organization = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM organizations WHERE id = '10000000-0000-4000-8000-000000000001'",
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type IN ('admin.ops.task_retried', 'admin.ops.payment_credit_repaired')
          ORDER BY event_type ASC
        `,
      );

      assert.equal(missingRetryIdempotency.status, 400);
      assert.deepEqual(missingRetryIdempotencyPayload, { error: "idempotency_key_required" });
      assert.equal(retryResponse.status, 200);
      assert.equal(retryPayload.data.task.id, failedTaskId);
      assert.equal(retryPayload.data.task.status, "queued");
      assert.deepEqual(task.rows, [{ status: "queued", failure_code: null }]);
      assert.equal(repairResponse.status, 200);
      assert.equal(repairPayload.data.creditGrant.amount, 120);
      assert.ok(order.rows[0]?.credit_grant_ledger_entry_id);
      assert.equal(organization.rows[0]?.credit_balance_cached, 120);
      assert.deepEqual(audit.rows, [
        { event_type: "admin.ops.payment_credit_repaired", reason: "支付成功但积分消费者未执行" },
        { event_type: "admin.ops.task_retried", reason: "供应商超时已恢复" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("serves dashboard overview metrics to logged-in admins", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const forbidden = await fetch(`${server.origin}/api/admin/dashboard/overview`);
      const forbiddenPayload = await forbidden.json();

      const overviewResponse = await fetch(`${server.origin}/api/admin/dashboard/overview`, {
        headers: { cookie },
      });
      const overviewPayload = await overviewResponse.json();
      const modelHealthResponse = await fetch(`${server.origin}/api/admin/dashboard/model-health`, {
        headers: { cookie },
      });
      const modelHealthPayload = await modelHealthResponse.json();
      const recentEventsResponse = await fetch(`${server.origin}/api/admin/dashboard/recent-events`, {
        headers: { cookie },
      });
      const recentEventsPayload = await recentEventsResponse.json();

      assert.equal(forbidden.status, 401);
      assert.equal(forbiddenPayload.error.code, "admin_unauthenticated");
      assert.equal(overviewResponse.status, 200);
      assert.equal(typeof overviewPayload.data.metrics.generationCountToday, "number");
      assert.equal(typeof overviewPayload.data.metrics.generationSuccessRate, "number");
      assert.equal(typeof overviewPayload.data.metrics.creditsConsumedToday, "number");
      assert.equal(typeof overviewPayload.data.metrics.paidOrdersToday, "number");
      assert.equal(typeof overviewPayload.data.metrics.riskPendingCount, "number");
      assert.equal(typeof overviewPayload.data.metrics.failedTaskCount, "number");
      assert.ok(overviewPayload.data.modelHealth.length >= 2);
      assert.equal(modelHealthResponse.status, 200);
      assert.deepEqual(modelHealthPayload.data, overviewPayload.data.modelHealth);
      assert.equal(recentEventsResponse.status, 200);
      assert.deepEqual(recentEventsPayload.data, overviewPayload.data.recentEvents);
      const loginEvent = overviewPayload.data.recentEvents.find(
        (event: { type: string }) => event.type === "admin.auth.login_succeeded",
      );
      assert.ok(loginEvent);
      assert.equal(typeof loginEvent.metadata, "object");
      assert.ok("ipAddress" in loginEvent.metadata);
    } finally {
      await server.close();
    }
  });

  it("enforces documented permission points on read-only admin APIs", async () => {
    const db = await createMigratedTestDb();
    const { server: modelServer, cookie: modelCookie } = await createLoggedInAdminServer(db, {
      role: "model_admin",
    });

    try {
      const dashboardResponse = await fetch(`${modelServer.origin}/api/admin/dashboard/overview`, {
        headers: { cookie: modelCookie },
      });
      const dashboardPayload = await dashboardResponse.json();

      const modelsResponse = await fetch(`${modelServer.origin}/api/admin/models`, {
        headers: { cookie: modelCookie },
      });

      assert.equal(dashboardResponse.status, 403);
      assert.equal(dashboardPayload.error.code, "admin_forbidden");
      assert.equal(modelsResponse.status, 200);
    } finally {
      await modelServer.close();
    }

    const financeDb = await createMigratedTestDb();
    const { server: financeServer, cookie: financeCookie } = await createLoggedInAdminServer(financeDb, {
      role: "finance_admin",
    });

    try {
      const auditResponse = await fetch(`${financeServer.origin}/api/admin/audit-events`, {
        headers: { cookie: financeCookie },
      });
      const auditPayload = await auditResponse.json();

      const usersResponse = await fetch(`${financeServer.origin}/api/admin/users`, {
        headers: { cookie: financeCookie },
      });

      assert.equal(auditResponse.status, 403);
      assert.equal(auditPayload.error.code, "admin_forbidden");
      assert.equal(usersResponse.status, 200);
    } finally {
      await financeServer.close();
    }
  });

  it("forbids non-super admins from system settings and admin account write actions", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, { role: "audit_viewer" });

    try {
      const settingsWriteResponse = await fetch(`${server.origin}/api/admin/settings/site.registration_enabled`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "audit-viewer-settings-write",
          cookie,
        },
        body: JSON.stringify({
          value: true,
          valueType: "boolean",
          scope: "creator",
          reason: "audit viewer should not write settings",
        }),
      });
      const settingsWritePayload = await settingsWriteResponse.json();

      const accountCreateResponse = await fetch(`${server.origin}/api/admin/admin-accounts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "audit-viewer-account-create",
          cookie,
        },
        body: JSON.stringify({
          loginName: "blocked_admin",
          password: "Blocked-Admin-12345",
          displayName: "Blocked Admin",
          roles: ["ops_admin"],
          remark: "audit viewer should not create admins",
        }),
      });
      const accountCreatePayload = await accountCreateResponse.json();

      assert.equal(settingsWriteResponse.status, 403);
      assert.equal(settingsWritePayload.error.code, "admin_forbidden");
      assert.equal(accountCreateResponse.status, 403);
      assert.equal(accountCreatePayload.error.code, "admin_forbidden");
    } finally {
      await server.close();
    }
  });

  it("forbids roles without the documented permission points from sensitive admin writes", async () => {
    const db = await createMigratedTestDb();
    const { server: auditServer, cookie: auditCookie } = await createLoggedInAdminServer(db, {
      role: "audit_viewer",
    });

    try {
      const modelCreateResponse = await fetch(`${auditServer.origin}/api/admin/models`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "audit-viewer-model-create",
          cookie: auditCookie,
        },
        body: JSON.stringify({
          modelCode: "blocked-model-create",
          displayName: "Blocked Model Create",
          providerName: "openai",
          providerModel: "blocked-provider-model",
          providerProtocol: "openai_image",
          invocationMode: "sync_http",
          mediaType: "image",
          taskModes: ["image.text_to_image"],
          parameterSchema: {
            prompt: { label: "Prompt", type: "string", required: true },
          },
          pricing: { unit: "image", unitCredits: 1 },
          providerConfig: { apiKeyEnv: "BLOCKED_PROVIDER_API_KEY" },
          dispatchPolicy: { submitQueueName: "generation-submit-image" },
          reason: "audit viewer should not create models",
        }),
      });
      const modelCreatePayload = await modelCreateResponse.json();

      const creditGrantResponse = await fetch(
        `${auditServer.origin}/api/admin/users/${randomUUID()}/credits/grant`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "audit-viewer-credit-grant",
            cookie: auditCookie,
          },
          body: JSON.stringify({ amount: 100, reason: "audit viewer should not grant credits" }),
        },
      );
      const creditGrantPayload = await creditGrantResponse.json();

      const riskReviewResponse = await fetch(
        `${auditServer.origin}/api/admin/risks/${randomUUID()}/review`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "audit-viewer-risk-review",
            cookie: auditCookie,
          },
          body: JSON.stringify({ reason: "audit viewer should not review risks" }),
        },
      );
      const riskReviewPayload = await riskReviewResponse.json();

      assert.equal(modelCreateResponse.status, 403);
      assert.equal(modelCreatePayload.error.code, "admin_forbidden");
      assert.equal(creditGrantResponse.status, 403);
      assert.equal(creditGrantPayload.error.code, "admin_forbidden");
      assert.equal(riskReviewResponse.status, 403);
      assert.equal(riskReviewPayload.error.code, "admin_forbidden");
    } finally {
      await auditServer.close();
    }

    const financeDb = await createMigratedTestDb();
    const { server: financeServer, cookie: financeCookie } = await createLoggedInAdminServer(financeDb, {
      role: "finance_admin",
    });

    try {
      const taskRetryResponse = await fetch(
        `${financeServer.origin}/api/admin/ops/tasks/${randomUUID()}/retry`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "finance-admin-task-retry",
            cookie: financeCookie,
          },
          body: JSON.stringify({ reason: "finance admin should not retry tasks" }),
        },
      );
      const taskRetryPayload = await taskRetryResponse.json();

      assert.equal(taskRetryResponse.status, 403);
      assert.equal(taskRetryPayload.error.code, "admin_forbidden");
    } finally {
      await financeServer.close();
    }
  });
});

async function createLoggedInAdminServer(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  options: { role?: string } = {},
) {
  const loginName = `admin_${randomUUID().slice(0, 8)}`;
  const password = `Admin-${randomUUID()}-Pwd`;
  const role = options.role ?? "super_admin";
  const server = createPhoneAuthDevServer({ db });

  await db.query(
    `
      INSERT INTO admin_accounts (
        id, login_name, password_hash, display_name, status
      ) VALUES (
        $1,
        $2,
        'plain:' || $3,
        'Model Admin',
        'active'
      )
    `,
    [randomUUID(), loginName, password],
  );
  await db.query(
    `
      INSERT INTO admin_account_roles (
        id, admin_account_id, role_code
      )
      SELECT $1, id, $3
      FROM admin_accounts
      WHERE login_name = $2
    `,
    [randomUUID(), loginName, role],
  );

  await server.listen(0);
  const loginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginName, password }),
  });
  assert.equal(loginResponse.status, 200);

  return {
    server,
    cookie: loginResponse.headers.get("set-cookie") ?? "",
  };
}

async function seedAdminUserListFixture(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const organizationId = "91000000-0000-4000-8000-000000000001";
  const workspaceId = "92000000-0000-4000-8000-000000000001";
  const ownerUserId = "93000000-0000-4000-8000-000000000001";
  const groupAdminUserId = "93000000-0000-4000-8000-000000000002";
  const subaccountUserId = "93000000-0000-4000-8000-000000000003";
  const ownerMembershipId = "94000000-0000-4000-8000-000000000001";
  const groupAdminMembershipId = "94000000-0000-4000-8000-000000000002";
  const subaccountMembershipId = "94000000-0000-4000-8000-000000000003";
  const groupId = "95000000-0000-4000-8000-000000000001";

  await db.query(
    `
      INSERT INTO users (id, email, phone_e164, display_name, status)
      VALUES
        ($1, 'owner@example.test', '+8613800200001', '白夜工作室', 'active'),
        ($2, 'group@example.test', '+8613800200002', '分镜组长', 'active'),
        ($3, 'sub@example.test', '+8613800200003', '子账户 A', 'disabled')
    `,
    [ownerUserId, groupAdminUserId, subaccountUserId],
  );
  await db.query(
    `
      INSERT INTO organizations (
        id, name, status, credit_balance_cached, credit_reserved_cached
      ) VALUES (
        $1, '白夜组织', 'active', 8420, 120
      )
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, '创作空间', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (
        id, organization_id, workspace_id, user_id, role, status
      )
      VALUES
        ($1, $4, $5, $6, 'owner_admin', 'active'),
        ($2, $4, $5, $7, 'sub_account', 'active'),
        ($3, $4, $5, $8, 'sub_account', 'disabled')
    `,
    [
      ownerMembershipId,
      groupAdminMembershipId,
      subaccountMembershipId,
      organizationId,
      workspaceId,
      ownerUserId,
      groupAdminUserId,
      subaccountUserId,
    ],
  );
  await db.query(
    `
      INSERT INTO team_member_groups (
        id, organization_id, workspace_id, name, status, created_by_user_id
      )
      VALUES ($1, $2, $3, '分镜组', 'active', $4)
    `,
    [groupId, organizationId, workspaceId, ownerUserId],
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
        member_group_id,
        credit_balance_cached,
        credit_used_cached,
        created_by_user_id
      )
      VALUES
        ('96000000-0000-4000-8000-000000000001', $1, $2, $3, 'story-lead', '分镜组长', 'group_admin', $5, 2100, 300, $6),
        ('96000000-0000-4000-8000-000000000002', $1, $2, $4, 'story-sub-a', '子账户 A', 'animator', $5, 680, 90, $6)
    `,
    [
      organizationId,
      workspaceId,
      groupAdminMembershipId,
      subaccountMembershipId,
      groupId,
      ownerUserId,
    ],
  );
  await db.query(
    `
      INSERT INTO credit_reservations (
        id,
        organization_id,
        workspace_id,
        amount_total,
        amount_reserved,
        amount_consumed,
        amount_released,
        status,
        source_type,
        source_id,
        reason
      )
      VALUES (
        '97000000-0000-4000-8000-000000000001',
        $1,
        $2,
        40,
        40,
        0,
        0,
        'active',
        'admin_test',
        '97000000-0000-4000-8000-000000000002',
        '子账户任务冻结'
      )
    `,
    [organizationId, workspaceId],
  );
}
