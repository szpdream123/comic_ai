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

  it("reads and updates the Canvas Agent runtime settings through the admin contract", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    try {
      const initial = await fetch(`${server.origin}/api/admin/settings/canvas-agent`, {
        headers: { cookie },
      });
      const initialPayload = await initial.json();
      assert.equal(initial.status, 200, JSON.stringify(initialPayload));
      assert.equal(Array.isArray(initialPayload.data.mcpAllowlist), true);
      assert.equal(initialPayload.data.webSearchModelCode, null);

      const updated = await fetch(`${server.origin}/api/admin/settings/canvas-agent`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
          "idempotency-key": `canvas-agent-settings-${randomUUID()}`,
        },
        body: JSON.stringify({
          value: { defaultModelCode: "agent-default", expertModelCode: "agent-expert", webSearchModelCode: "canvas-search-tavily", maxRounds: 8, maxToolCalls: 16, mcpAllowlist: [] },
          reason: "Canvas Agent contract test",
        }),
      });
      const updatedPayload = await updated.json();
      assert.equal(updated.status, 200, JSON.stringify(updatedPayload));

      const reread = await fetch(`${server.origin}/api/admin/settings/canvas-agent`, {
        headers: { cookie },
      });
      const rereadPayload = await reread.json();
      assert.equal(reread.status, 200, JSON.stringify(rereadPayload));
      assert.equal(rereadPayload.data.defaultModelCode, "agent-default");
      assert.equal(rereadPayload.data.maxToolCalls, 16);
      assert.equal(rereadPayload.data.webSearchModelCode, "canvas-search-tavily");
    } finally {
      await server.close();
      await db.close();
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
          id, login_name, password_hash, display_name, status, super_admin_slot
        ) VALUES (
          '81000000-0000-4000-8000-000000000001',
          $1,
          'plain:' || $2,
          '总后台管理员',
          'active',
          1
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

  it("serves storage media resources to logged-in admins", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);




    await db.query(
      `
        INSERT INTO storage_objects (
          id, project_id, bucket, object_key, content_type,
          size_bytes, checksum, provider, status, etag, version_id, last_verified_at,
          deleted_at, metadata_json, created_by_user_id, created_at
        ) VALUES
          ('60000000-0000-4000-8000-000000000101', NULL, 'creator-test', 'AIManhuaDrama/20260625/test-image.png', 'image/png', 12345, NULL, 'creator-dev', 'available', NULL, NULL, now(), NULL, '{}'::jsonb, NULL, now()),
          ('60000000-0000-4000-8000-000000000102', NULL, 'creator-test', 'AIManhuaDrama/20260625/test-video.mp4', 'video/mp4', 67890, NULL, 'creator-dev', 'available', NULL, NULL, now(), NULL, '{}'::jsonb, NULL, now())
      `,
    );
    await db.query(
      `
        INSERT INTO project_upload_records (
          id, project_id, storage_object_id, upload_session_id,
          actor_user_id, actor_display_name, actor_phone_e164, project_name, page_key, page_url,
          source_action, file_name, object_key, bucket, provider, content_type, size_bytes,
          public_url, status, error_message, created_at, completed_at
        ) VALUES
          ('70000000-0000-4000-8000-000000000101', NULL, '60000000-0000-4000-8000-000000000101', NULL, NULL, '运营人员', '+8613800000001', NULL, 'project', NULL, 'upload-image', 'test-image.png', 'AIManhuaDrama/20260625/test-image.png', 'creator-test', 'creator-dev', 'image/png', 12345, '/uploads/storage/creator-test/AIManhuaDrama/20260625/test-image.png', 'uploaded', NULL, now(), now()),
          ('70000000-0000-4000-8000-000000000102', NULL, '60000000-0000-4000-8000-000000000102', NULL, NULL, '运营人员', '+8613800000001', NULL, 'project', NULL, 'upload-video', 'test-video.mp4', 'AIManhuaDrama/20260625/test-video.mp4', 'creator-test', 'creator-dev', 'video/mp4', 67890, '/uploads/storage/creator-test/AIManhuaDrama/20260625/test-video.mp4', 'uploaded', NULL, now(), now())
      `,
    );

    try {
      const [response, summaryResponse] = await Promise.all([
        fetch(`${server.origin}/api/admin/resources?page=1&pageSize=10&media=all&range=all`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/admin/resources/summary?media=all&range=all`, {
          headers: { cookie },
        }),
      ]);
      const payload = await response.json();
      const summaryPayload = await summaryResponse.json();

      assert.equal(response.status, 200);
      assert.equal(summaryResponse.status, 200);
      assert.equal(payload.data.length, 2);
      assert.equal(payload.meta.page, 1);
      assert.equal(payload.meta.pageSize, 10);
      assert.equal(payload.meta.total, 2);
      assert.equal(payload.meta.totalPages, 1);
      assert.equal(summaryPayload.total, 2);
      assert.equal(summaryPayload.imageCount, 1);
      assert.equal(summaryPayload.videoCount, 1);
      assert.equal(summaryPayload.imageBytes, 12345);
      assert.equal(summaryPayload.videoBytes, 67890);
      assert.deepEqual(payload.data.map((item: { mediaKind: string }) => item.mediaKind).sort(), ["image", "video"]);
      assert.ok(payload.data.every((item: { previewUrl: string }) => /\/uploads\/storage\/creator-test\//.test(item.previewUrl)));
    } finally {
      await server.close();
    }
  });

  it("filters resource summary independently from the paged resource list", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);



    await db.query(
      `
        INSERT INTO storage_objects (
          id, project_id, bucket, object_key, content_type,
          size_bytes, checksum, provider, status, etag, version_id, last_verified_at,
          deleted_at, metadata_json, created_by_user_id, created_at
        ) VALUES
          ('60000000-0000-4000-8000-000000000201', NULL, 'creator-test', 'summary/image-a.png', 'image/png', 100, NULL, 'creator-dev', 'available', NULL, NULL, now(), NULL, '{}'::jsonb, NULL, now()),
          ('60000000-0000-4000-8000-000000000202', NULL, 'creator-test', 'summary/video-a.mp4', 'video/mp4', 200, NULL, 'creator-dev', 'available', NULL, NULL, now(), NULL, '{}'::jsonb, NULL, now()),
          ('60000000-0000-4000-8000-000000000203', NULL, 'creator-test', 'summary/image-b.png', 'image/png', 300, NULL, 'creator-dev', 'available', NULL, NULL, now(), NULL, '{}'::jsonb, NULL, now())
      `,
    );

    try {
      const [listResponse, summaryResponse] = await Promise.all([
        fetch(`${server.origin}/api/admin/resources?page=1&pageSize=1&media=image&range=all&keyword=summary`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/admin/resources/summary?media=image&range=all&keyword=summary`, {
          headers: { cookie },
        }),
      ]);
      const listPayload = await listResponse.json();
      const summaryPayload = await summaryResponse.json();

      assert.equal(listResponse.status, 200);
      assert.equal(summaryResponse.status, 200);
      assert.equal(listPayload.data.length, 1);
      assert.equal(listPayload.meta.total, 2);
      assert.equal(summaryPayload.total, 2);
      assert.equal(summaryPayload.imageCount, 2);
      assert.equal(summaryPayload.videoCount, 0);
      assert.equal(summaryPayload.imageBytes, 400);
      assert.equal(summaryPayload.videoBytes, 0);
    } finally {
      await server.close();
    }
  });

  it("deletes storage media resources for logged-in admins", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      serverOptions: {
        storageRuntime: {
          mode: "cos",
          provider: "tencent_cos",
          bucket: "creator-test",
          adapter: {
            async createSignedReadUrl(input) {
              return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
            },
            async deleteObject() {},
          },
        },
      },
    });
    const storageObjectId = "60000000-0000-4000-8000-000000000111";



    await db.query(
      `
        INSERT INTO storage_objects (
        id,
        project_id,
        bucket,
        object_key,
        content_type,
        size_bytes,
        checksum,
        provider,
        status,
        etag,
        version_id,
        last_verified_at,
        deleted_at,
        metadata_json,
        created_by_user_id,
        created_at
      ) VALUES ($1, NULL, 'creator-test', 'AIManhuaDrama/20260625/delete-image.png', 'image/png', 24576, NULL, 'creator-dev', 'available', NULL, NULL, now(), NULL, '{}'::jsonb, NULL, now()
        )
      `,
    [storageObjectId],
    );

    try {
      const response = await fetch(`${server.origin}/api/admin/resources/${storageObjectId}`, {
        method: "DELETE",
        headers: {
          cookie,
          "content-type": "application/json",
          "idempotency-key": `test-resource-delete-${randomUUID()}`,
        },
        body: JSON.stringify({ reason: "test delete resource" }),
      });
      const payload = await response.json();
      const storageObject = await db.query<{ status: string }>(
        `
          SELECT status
          FROM storage_objects
          WHERE id = $1
        `,
        [storageObjectId],
      );
      const audit = await db.query<{ event_type: string }>(
        `
          SELECT event_type
          FROM audit_events
          WHERE target_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [storageObjectId],
      );

      assert.equal(response.status, 200);
      assert.equal(payload.data.deleted, true);
      assert.equal(storageObject.rows[0]?.status, "deleted");
      assert.equal(audit.rows[0]?.event_type, "admin.resource.deleted");
    } finally {
      await server.close();
    }
  });

  it("serves operator model templates and validates drafts through backend rules", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const templatesResponse = await fetch(`${server.origin}/api/admin/model-templates`, {
        headers: { cookie },
      });
      const templatesPayload = await templatesResponse.json();
      const templateIds = templatesPayload.data.map((template: { id: string }) => template.id);

      const mismatchResponse = await fetch(`${server.origin}/api/admin/models/validate-draft`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "ops-image-mismatch",
          displayName: "能力冲突测试",
          providerName: "google",
          providerModel: "nano-banana",
          providerProtocol: "custom_http",
          invocationMode: "sync",
          mediaType: "image",
          taskModes: ["video.image_to_video"],
          parameterSchema: { prompt: { label: "提示词", type: "string", required: true } },
          pricing: { unit: "image", baseCredits: 80 },
          providerConfig: {
            endpoint: "/api/provider-proxy/google/image",
            apiKeyEnv: "GOOGLE_IMAGE_API_KEY",
          },
        }),
      });
      const mismatchPayload = await mismatchResponse.json();

      const asyncMissingResponse = await fetch(`${server.origin}/api/admin/models/validate-draft`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "ops-video-query-missing",
          displayName: "轮询缺失测试",
          providerName: "kling",
          providerModel: "kling-3.0",
          providerProtocol: "custom_http",
          invocationMode: "async_polling",
          mediaType: "video",
          taskModes: ["video.image_to_video"],
          parameterSchema: { prompt: { label: "提示词", type: "string", required: true } },
          pricing: { unit: "video", baseCredits: 220 },
          providerConfig: {
            createTaskEndpoint: "/api/provider-proxy/kling/video/tasks",
            apiKeyEnv: "KLING_API_KEY",
          },
        }),
      });
      const asyncMissingPayload = await asyncMissingResponse.json();

      const sanBaoInvalidResponse = await fetch(`${server.origin}/api/admin/models/validate-draft`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "sanbao-invalid-config",
          displayName: "三宝错误配置测试",
          providerName: "三宝影像",
          providerModel: "gpt-image2",
          providerProtocol: "san_bao",
          invocationMode: "async_polling",
          mediaType: "image",
          taskModes: ["image.generate"],
          parameterSchema: { prompt: { label: "提示词", type: "string", required: true } },
          pricing: { unit: "image", baseCredits: 90 },
          providerConfig: {
            baseURL: "https://provider.example.test",
            requestPath: "/openapi/v1/videos",
            createTaskEndpoint: "/openapi/v1/videos",
            queryTaskEndpoint: "/openapi/v1/images/task-id",
            apiKeyEnv: "OTHER_API_KEY",
          },
          dispatchPolicy: {
            submitQueueName: "generation-submit-image",
            pollQueueName: "generation-poll-image",
          },
        }),
      });
      const sanBaoInvalidPayload = await sanBaoInvalidResponse.json();

      assert.equal(templatesResponse.status, 200);
      assert.ok(templatesPayload.data.length >= 14);
      for (const expectedId of [
        "google-nano-banana-image",
        "google-nano-banana-2-image",
        "jimeng-5-image",
        "jimeng-45-image",
        "openai-image2",
        "kling-30-video",
        "seedance-20-pro-video",
        "happy-horse-video",
      ]) {
        assert.ok(templateIds.includes(expectedId), `missing template ${expectedId}`);
      }
      assert.equal(mismatchResponse.status, 200);
      assert.equal(mismatchPayload.data.ok, false);
      assert.ok(
        mismatchPayload.data.failedItems.some((item: { message: string }) => item.message.includes("图片模型只能选择图片能力")),
      );
      assert.equal(asyncMissingResponse.status, 200);
      assert.equal(asyncMissingPayload.data.ok, false);
      assert.ok(
        asyncMissingPayload.data.failedItems.some((item: { field: string }) => item.field === "queryTaskEndpoint"),
      );
      assert.ok(
        asyncMissingPayload.data.failedItems.some((item: { field: string }) => item.field === "pollQueueName"),
      );
      assert.ok(
        asyncMissingPayload.data.failedItems
          .filter((item: { field: string }) => item.field === "queryTaskEndpoint")
          .every((item: { message: string }) => !item.message.includes("视频模型")),
      );
      assert.equal(sanBaoInvalidResponse.status, 200);
      assert.equal(sanBaoInvalidPayload.data.ok, false);
      for (const field of ["apiKeyEnv", "baseURL", "requestPath", "createTaskEndpoint", "queryTaskEndpoint"]) {
        assert.ok(
          sanBaoInvalidPayload.data.failedItems.some((item: { field: string }) => item.field === field),
          `missing SanBao validation for ${field}`,
        );
      }
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
            timeoutMs: 5000,
            requestTimeoutMs: 4000,
            pollIntervalMs: 1000,
            maxPollAttempts: 2,
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
            timeoutMs: 5000,
            requestTimeoutMs: 4000,
            pollIntervalMs: 1000,
            maxPollAttempts: 2,
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
          modelCode: "admin-video-pro-v2",
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

      const probeResponse = await fetch(`${server.origin}/api/admin/models/${modelId}/probe`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          reason: "发布前探测模型配置",
        }),
      });
      const probePayload = await probeResponse.json();

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
            'admin.model.probed',
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
      assert.equal("timeoutMs" in createPayload.data.providerConfig, false);
      assert.equal("requestTimeoutMs" in createPayload.data.providerConfig, false);
      assert.equal("pollIntervalMs" in createPayload.data.providerConfig, false);
      assert.equal("maxPollAttempts" in createPayload.data.providerConfig, false);
      assert.equal(createPayload.data.dispatchPolicy.pollingIntervalMs, 30_000);
      assert.equal(updateResponse.status, 200);
      assert.equal(updatePayload.data.modelCode, "admin-video-pro-v2");
      assert.equal(updatePayload.data.displayName, "后台视频 Pro V2");
      assert.equal(updatePayload.data.pricing.baseCredits, 150);
      assert.equal(probeResponse.status, 200);
      assert.equal(probePayload.data.ok, true);
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicatePayload.data.modelCode, "admin-video-pro-copy");
      assert.equal(duplicatePayload.data.displayName, "后台视频 Pro 副本");
      assert.equal(duplicatePayload.data.dispatchPolicy.submitQueueName, "generation-submit-admin-video");
      assert.equal(duplicatePayload.data.dispatchPolicy.pollQueueName, "generation-poll-admin-video");
      assert.equal(statusResponse.status, 200);
      assert.equal(statusPayload.data.status, "disabled");
      assert.equal(detailPayload.data.model.modelCode, "admin-video-pro-v2");
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
        { event_type: "admin.model.probed", reason: "发布前探测模型配置" },
        { event_type: "admin.model.status_changed", reason: "供应商维护暂停" },
        { event_type: "admin.model.updated", reason: "调整视频定价和比率" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("returns Canvas Agent compatibility diagnostics from the admin model probe", async () => {
    const db = await createMigratedTestDb();
    const probeCalls: string[] = [];
    let probeResult: {
      ok: boolean;
      latencyMs: number;
      failureCode: string | null;
      checks: Array<{ key: "resolution" | "stream" | "usage" | "json_schema"; status: "passed" | "failed"; message?: string }>;
    } = {
      ok: true,
      latencyMs: 24,
      failureCode: null as string | null,
      checks: [
        { key: "resolution" as const, status: "passed" as const },
        { key: "stream" as const, status: "passed" as const },
        { key: "usage" as const, status: "passed" as const },
        { key: "json_schema" as const, status: "passed" as const },
      ],
    };
    const { server, cookie } = await createLoggedInAdminServer(db, {
      serverOptions: {
        canvasAgentModelProbe: {
          async probe(modelCode) {
            probeCalls.push(modelCode);
            return probeResult;
          },
        },
      },
    });

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/models`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-canvas-agent-model-create",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "canvas-agent-compatible",
          displayName: "Canvas Agent Compatible",
          providerName: "openai-compatible",
          providerModel: "agent-model",
          providerProtocol: "openai_compatible_chat",
          invocationMode: "stream",
          mediaType: "text",
          taskModes: ["text.canvas_agent"],
          capabilities: { stream: true, toolCalling: true, jsonSchema: true, contextWindow: 32000 },
          parameterSchema: { maxTokens: { type: "number" } },
          pricing: { unit: "token", baseCredits: 1 },
          providerConfig: {
            baseURL: "https://provider.example/v1",
            endpoint: "/chat/completions",
            apiKeyEnv: "CANVAS_AGENT_PROVIDER_KEY",
          },
          uiConfig: { agentEligible: true },
          dispatchPolicy: {
            submitQueueName: "canvas-agent-text",
            providerRpmLimit: 60,
            providerConcurrentLimit: 4,
            submitConcurrencyLimit: 4,
            pollingIntervalMs: 1000,
            pollingConcurrencyLimit: 1,
          },
          reason: "创建 Canvas Agent 探测模型",
        }),
      });
      const created = await createResponse.json();
      assert.equal(createResponse.status, 200, JSON.stringify(created));

      const probeResponse = await fetch(`${server.origin}/api/admin/models/${created.data.id}/probe`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ reason: "验证 Canvas Agent 兼容性" }),
      });
      const payload = await probeResponse.json();

      assert.equal(probeResponse.status, 200, JSON.stringify(payload));
      assert.equal(payload.data.ok, true, JSON.stringify(payload));
      assert.deepEqual(probeCalls, ["canvas-agent-compatible"]);
      assert.deepEqual(
        payload.data.checks.filter((check: { key: string }) => check.key.startsWith("canvas_agent.")).map(
          (check: { key: string; status: string }) => [check.key, check.status],
        ),
        [
          ["canvas_agent.resolution", "passed"],
          ["canvas_agent.stream", "passed"],
          ["canvas_agent.usage", "passed"],
          ["canvas_agent.json_schema", "passed"],
        ],
      );
      const persisted = await db.query<{
        status: string;
        failure_code: string | null;
        latency_ms: number;
        checks_json: Array<Record<string, unknown>>;
      }>(`
        SELECT status, failure_code, latency_ms, checks_json
        FROM canvas_agent_model_compatibility_probes
        WHERE model_config_id = $1
      `, [created.data.id]);
      assert.equal(persisted.rows[0]?.status, "passed");
      assert.equal(persisted.rows[0]?.failure_code, null);
      assert.equal(Number(persisted.rows[0]?.latency_ms), 24);
      assert.equal(persisted.rows[0]?.checks_json.length, 4);

      const listResponse = await fetch(`${server.origin}/api/admin/models?page=1&pageSize=100`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();
      const listedModel = listPayload.data.find((model: { id: string }) => model.id === created.data.id);
      assert.deepEqual(listedModel.compatibilityProbe, {
        status: "passed",
        failureCode: null,
        latencyMs: 24,
        checks: [
          { key: "resolution", status: "passed" },
          { key: "stream", status: "passed" },
          { key: "usage", status: "passed" },
          { key: "json_schema", status: "passed" },
        ],
        checkedAt: payload.data.checkedAt,
      });

      probeResult = {
        ok: false,
        latencyMs: 31,
        failureCode: "canvas_agent_model_json_schema_failed",
        checks: [
          { key: "resolution", status: "passed" },
          { key: "stream", status: "passed" },
          { key: "usage", status: "passed" },
          { key: "json_schema", status: "failed", message: "schema mismatch" },
        ],
      };
      const failedProbeResponse = await fetch(`${server.origin}/api/admin/models/${created.data.id}/probe`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ reason: "复测 Canvas Agent 兼容性" }),
      });
      const failedPayload = await failedProbeResponse.json();
      assert.equal(failedProbeResponse.status, 200, JSON.stringify(failedPayload));
      assert.equal(failedPayload.data.ok, false);
      const failedPersisted = await db.query<{ status: string; failure_code: string | null }>(`
        SELECT status, failure_code
        FROM canvas_agent_model_compatibility_probes
        WHERE model_config_id = $1
      `, [created.data.id]);
      assert.deepEqual(failedPersisted.rows[0], {
        status: "failed",
        failure_code: "canvas_agent_model_json_schema_failed",
      });
    } finally {
      await server.close();
    }
  });

  it("lets admins delete model configs with audit records", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/models`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-create-delete-target",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "admin-delete-script-model",
          displayName: "后台删除测试剧本模型",
          providerName: "deepseek",
          providerModel: "deepseek-v4-pro",
          providerProtocol: "openai_compatible_chat",
          invocationMode: "stream",
          mediaType: "text",
          taskModes: ["text.script"],
          capabilities: { input: ["prompt"], output: ["text"] },
          parameterSchema: {
            scriptPrompt: { label: "剧本需求", type: "string", required: true },
          },
          pricing: { unit: "text", baseCredits: 20 },
          providerConfig: {
            baseURL: "https://api.deepseek.com",
            requestPath: "/chat/completions",
            apiKeyEnv: "DEEPSEEK_API_KEY",
          },
          dispatchPolicy: {
            submitQueueName: "generation-submit-text",
          },
          reason: "创建删除测试模型",
        }),
      });
      const createPayload = await createResponse.json();
      const modelId = createPayload.data.id;

      const deleteResponse = await fetch(`${server.origin}/api/admin/models/${modelId}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-delete-target",
          cookie,
        },
        body: JSON.stringify({
          reason: "删除测试模型",
        }),
      });
      const deletePayload = await deleteResponse.json();

      const detailResponse = await fetch(`${server.origin}/api/admin/models/${modelId}`, {
        headers: { cookie },
      });
      const deletedRows = await db.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM ai_model_configs WHERE id = $1",
        [modelId],
      );
      const auditRows = await db.query<{ event_type: string; reason: string | null }>(
        "SELECT event_type, reason FROM audit_events WHERE event_type = 'admin.model.deleted' AND target_id = $1",
        [modelId],
      );

      assert.equal(createResponse.status, 200);
      assert.equal(deleteResponse.status, 200);
      assert.equal(deletePayload.data.modelCode, "admin-delete-script-model");
      assert.equal(detailResponse.status, 404);
      assert.equal(deletedRows.rows[0]?.count, "0");
      assert.deepEqual(auditRows.rows, [
        { event_type: "admin.model.deleted", reason: "删除测试模型" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("persists editable script prompts in the unified prompts table", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, "super_admin");

    try {
      const listResponse = await fetch(`${server.origin}/api/admin/storyboard-prompt/packages`, {
        headers: { cookie },
      });
      assert.equal(listResponse.status, 200);
      const listPayload = await listResponse.json();
      assert.ok(listPayload.data.length > 0);

      const createResponse = await fetch(`${server.origin}/api/admin/storyboard-prompt/packages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Test Script Prompt",
          cover_image_url: "https://example.com/storyboard-cover.png",
          summary: "A concise script prompt summary.",
          prompt_content: "This prompt package is long enough to validate database persistence for editable storyboard prompt content.",
          status: "enabled",
        }),
      });
      assert.equal(createResponse.status, 200);
      const createPayload = await createResponse.json();

      const updateResponse = await fetch(`${server.origin}/api/admin/storyboard-prompt/packages/${createPayload.data.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Edited Script Prompt",
          cover_image_url: "https://example.com/storyboard-cover-edited.png",
          summary: "An edited script prompt summary.",
          prompt_content: "Edited storyboard prompt content is stored back into the database with enough length for validation.",
          status: "enabled",
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updatePayload = await updateResponse.json();
      assert.equal(updatePayload.data.category, "script");
      assert.equal(updatePayload.data.summary, "An edited script prompt summary.");
      assert.equal(updatePayload.data.cover_image_url, "https://example.com/storyboard-cover-edited.png");

      const disableResponse = await fetch(`${server.origin}/api/admin/storyboard-prompt/packages/${createPayload.data.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ status: "disabled" }),
      });
      assert.equal(disableResponse.status, 200);
      const disablePayload = await disableResponse.json();
      assert.equal(disablePayload.data.status, "disabled");

      const persisted = await db.query<{
        prompt_category: string;
        name: string;
        summary: string;
        prompt_content: string;
        cover_image_url: string | null;
        status: string;
        is_published: boolean;
      }>(
        `SELECT prompt_category, name, summary, prompt_content, cover_image_url, status, is_published
         FROM prompts WHERE id = $1`,
        [createPayload.data.id],
      );
      assert.deepEqual(persisted.rows[0], {
        prompt_category: "script",
        name: "Edited Script Prompt",
        summary: "An edited script prompt summary.",
        prompt_content: "Edited storyboard prompt content is stored back into the database with enough length for validation.",
        cover_image_url: "https://example.com/storyboard-cover-edited.png",
        status: "disabled",
        is_published: false,
      });
    } finally {
      await server.close();
    }
  });

  it("persists storyboard prompts with the fixed storyboard category", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, "super_admin");

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/storyboard-prompt/templates`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Storyboard Assembly Prompt",
          cover_image_url: "https://example.com/storyboard-template-cover.png",
          summary: "Creates a complete visual storyboard.",
          base_prompt: "Create a complete visual storyboard with coherent shots, character continuity, scene continuity, and clear composition.",
          status: "disabled",
        }),
      });
      assert.equal(createResponse.status, 200);
      const createPayload = await createResponse.json();
      assert.equal(createPayload.data.category, "storyboard");
      assert.equal(createPayload.data.cover_image_url, "https://example.com/storyboard-template-cover.png");
      assert.equal(createPayload.data.summary, "Creates a complete visual storyboard.");
      assert.equal(createPayload.data.status, "disabled");

      const persisted = await db.query<{
        prompt_category: string;
        name: string;
        summary: string;
        prompt_content: string;
        cover_image_url: string;
        status: string;
        is_published: boolean;
      }>(
        `SELECT prompt_category, name, summary, prompt_content, cover_image_url, status, is_published
         FROM prompts WHERE id = $1`,
        [createPayload.data.id],
      );
      assert.deepEqual(persisted.rows[0], {
        prompt_category: "storyboard",
        name: "Storyboard Assembly Prompt",
        summary: "Creates a complete visual storyboard.",
        prompt_content: "Create a complete visual storyboard with coherent shots, character continuity, scene continuity, and clear composition.",
        cover_image_url: "https://example.com/storyboard-template-cover.png",
        status: "disabled",
        is_published: false,
      });
    } finally {
      await server.close();
    }
  });

  it("persists shot prompts in the unified prompts table", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, "super_admin");

    try {
      const listResponse = await fetch(`${server.origin}/api/admin/shot-prompt/templates`, {
        headers: { cookie },
      });
      assert.equal(listResponse.status, 200);
      const listPayload = await listResponse.json();
      assert.ok(listPayload.data.every((item: { category: string }) => item.category === "shot"));

      const createResponse = await fetch(`${server.origin}/api/admin/shot-prompt/templates`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Test Shot Prompt Template",
          cover_image_url: "https://example.com/shot-cover.png",
          summary: "Breaks a story into coherent shots.",
          prompt_content: "This shot prompt template is long enough to validate database persistence for editable shot prompt content.",
          status: "enabled",
        }),
      });
      assert.equal(createResponse.status, 200);
      const createPayload = await createResponse.json();

      const updateResponse = await fetch(`${server.origin}/api/admin/shot-prompt/templates/${createPayload.data.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Edited Shot Prompt Template",
          cover_image_url: "https://example.com/shot-cover-edited.png",
          summary: "Edited shot prompt summary.",
          prompt_content: "Edited shot prompt content is stored back into the database with enough length for validation.",
          status: "enabled",
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updatePayload = await updateResponse.json();
      assert.equal(updatePayload.data.name, "Edited Shot Prompt Template");
      assert.equal(updatePayload.data.category, "shot");
      assert.equal(updatePayload.data.cover_image_url, "https://example.com/shot-cover-edited.png");
      assert.equal(updatePayload.data.summary, "Edited shot prompt summary.");

      const disableResponse = await fetch(`${server.origin}/api/admin/shot-prompt/templates/${createPayload.data.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ status: "disabled" }),
      });
      assert.equal(disableResponse.status, 200);

      const persisted = await db.query<{
        prompt_category: string;
        name: string;
        summary: string;
        cover_image_url: string;
        prompt_content: string;
        status: string;
        is_published: boolean;
      }>(
        `SELECT prompt_category, name, summary, cover_image_url, prompt_content, status, is_published
         FROM prompts WHERE id = $1`,
        [createPayload.data.id],
      );
      assert.deepEqual(persisted.rows[0], {
        prompt_category: "shot",
        name: "Edited Shot Prompt Template",
        summary: "Edited shot prompt summary.",
        cover_image_url: "https://example.com/shot-cover-edited.png",
        prompt_content: "Edited shot prompt content is stored back into the database with enough length for validation.",
        status: "disabled",
        is_published: false,
      });
    } finally {
      await server.close();
    }
  });

  it("persists image styles in the unified prompts table", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, "super_admin");

    try {
      const listResponse = await fetch(`${server.origin}/api/admin/image-prompt/styles`, {
        headers: { cookie },
      });
      assert.equal(listResponse.status, 200);
      const listPayload = await listResponse.json();
      assert.equal(Number(listPayload.meta?.total || 0) >= listPayload.data.length, true);
      assert.ok(listPayload.data.every((item: { category: string }) => item.category === "image_style"));
      const createResponse = await fetch(`${server.origin}/api/admin/image-prompt/styles`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Test Image Prompt Style",
          cover_image_url: "https://example.com/image-style-cover.png",
          summary: "Creates an editorial image style.",
          prompt_content: "豆包生图测试风格，主体清晰，画面干净，中文自然描述，适合验证后台持久化。",
          status: "enabled",
          priceCredits: 19,
          usageCount: 31,
          isPublished: true,
        }),
      });
      assert.equal(createResponse.status, 200);
      const createPayload = await createResponse.json();
      assert.equal(createPayload.data.price_credits, 19);
      assert.equal(createPayload.data.usage_count, 31);
      assert.equal(createPayload.data.usageCount, 31);
      assert.equal(createPayload.data.is_published, true);

      const updateResponse = await fetch(`${server.origin}/api/admin/image-prompt/styles/${createPayload.data.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Edited Image Prompt Style",
          cover_image_url: "https://example.com/image-style-cover-edited.png",
          summary: "Edited image style summary.",
          prompt_content: "编辑后的豆包生图风格提示词已经写回数据库，保留清晰主体、光影、构图和质量约束。",
          status: "enabled",
          price_credits: 25,
          usage_count: 64,
          is_published: true,
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updatePayload = await updateResponse.json();
      assert.equal(updatePayload.data.category, "image_style");
      assert.equal(updatePayload.data.summary, "Edited image style summary.");
      assert.equal(updatePayload.data.cover_image_url, "https://example.com/image-style-cover-edited.png");
      assert.equal(updatePayload.data.priceCredits, 25);
      assert.equal(updatePayload.data.usage_count, 64);
      assert.equal(updatePayload.data.usageCount, 64);
      assert.equal(updatePayload.data.isPublished, true);

      const disableResponse = await fetch(`${server.origin}/api/admin/image-prompt/styles/${createPayload.data.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ status: "disabled" }),
      });
      assert.equal(disableResponse.status, 200);

      const persisted = await db.query<{
        prompt_category: string;
        name: string;
        summary: string;
        prompt_content: string;
        cover_image_url: string | null;
        status: string;
        price_credits: number;
        usage_count: number;
        is_published: boolean;
      }>(
        `SELECT prompt_category, name, summary, prompt_content, cover_image_url, status, price_credits, usage_count, is_published
         FROM prompts WHERE id = $1`,
        [createPayload.data.id],
      );
      assert.deepEqual(persisted.rows[0], {
        prompt_category: "image_style",
        name: "Edited Image Prompt Style",
        summary: "Edited image style summary.",
        prompt_content: "编辑后的豆包生图风格提示词已经写回数据库，保留清晰主体、光影、构图和质量约束。",
        cover_image_url: "https://example.com/image-style-cover-edited.png",
        status: "disabled",
        price_credits: 25,
        usage_count: 64,
        is_published: false,
      });
    } finally {
      await server.close();
    }
  });

  it("persists character prompts in the unified prompts table", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, "super_admin");

    try {
      const listResponse = await fetch(`${server.origin}/api/admin/character-prompt/templates`, {
        headers: { cookie },
      });
      assert.equal(listResponse.status, 200);
      const listPayload = await listResponse.json();
      assert.ok(listPayload.data.every((item: { category: string }) => item.category === "character_extract"));

      const createResponse = await fetch(`${server.origin}/api/admin/character-prompt/templates`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Test Character Prompt",
          cover_image_url: "https://example.com/character-cover.png",
          summary: "Extracts consistent character details.",
          prompt_content: "Extract important character information from the source text with consistent visual traits, identity, relationships, and reusable continuity details.",
          status: "enabled",
        }),
      });
      assert.equal(createResponse.status, 200);
      const createPayload = await createResponse.json();

      const updateResponse = await fetch(`${server.origin}/api/admin/character-prompt/templates/${createPayload.data.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          name: "Edited Character Prompt",
          cover_image_url: "https://example.com/character-cover-edited.png",
          summary: "Edited character prompt summary.",
          prompt_content: "Edited character prompt content extracts reliable identity, visual traits, relationships, and continuity notes directly from the supplied source text.",
          status: "enabled",
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updatePayload = await updateResponse.json();
      assert.equal(updatePayload.data.category, "character_extract");
      assert.equal(updatePayload.data.summary, "Edited character prompt summary.");

      const disableResponse = await fetch(`${server.origin}/api/admin/character-prompt/templates/${createPayload.data.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ status: "disabled" }),
      });
      assert.equal(disableResponse.status, 200);

      const persisted = await db.query<{
        prompt_category: string;
        name: string;
        summary: string;
        cover_image_url: string;
        prompt_content: string;
        status: string;
        is_published: boolean;
      }>(
        `SELECT prompt_category, name, summary, cover_image_url, prompt_content, status, is_published
         FROM prompts WHERE id = $1`,
        [createPayload.data.id],
      );
      assert.deepEqual(persisted.rows[0], {
        prompt_category: "character_extract",
        name: "Edited Character Prompt",
        summary: "Edited character prompt summary.",
        cover_image_url: "https://example.com/character-cover-edited.png",
        prompt_content: "Edited character prompt content extracts reliable identity, visual traits, relationships, and continuity notes directly from the supplied source text.",
        status: "disabled",
        is_published: false,
      });
    } finally {
      await server.close();
    }
  });

  it("persists scene prompts in the unified prompts table", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, "super_admin");

    try {
      const listResponse = await fetch(`${server.origin}/api/admin/scene-prompt/templates`, {
        headers: { cookie },
      });
      assert.equal(listResponse.status, 200);
      const listPayload = await listResponse.json();
      assert.ok(listPayload.data.every((item: { category: string }) => item.category === "scene_extract"));

      const createResponse = await fetch(`${server.origin}/api/admin/scene-prompt/templates`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Test Scene Prompt",
          cover_image_url: "https://example.com/scene-cover.png",
          summary: "Extracts continuous scenes from long-form text.",
          prompt_content: "Generate a long novel scene breakdown with location_id, visual_motifs, continuity_notes, foreground, midground, background, and cinematic concept art guidance.",
          status: "enabled",
        }),
      });
      assert.equal(createResponse.status, 200);
      const createPayload = await createResponse.json();

      const updateResponse = await fetch(`${server.origin}/api/admin/scene-prompt/templates/${createPayload.data.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Edited Scene Prompt",
          cover_image_url: "https://example.com/scene-cover-edited.png",
          summary: "Edited scene prompt summary.",
          prompt_content: "Edited scene prompt content keeps location_id, continuity_notes, visual_motifs, previous_scene_link, next_scene_hook, and AI drawing prompt structure for long novels.",
          status: "enabled",
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updatePayload = await updateResponse.json();
      assert.equal(updatePayload.data.name, "Edited Scene Prompt");
      assert.equal(updatePayload.data.category, "scene_extract");
      assert.equal(updatePayload.data.cover_image_url, "https://example.com/scene-cover-edited.png");

      const disableResponse = await fetch(`${server.origin}/api/admin/scene-prompt/templates/${createPayload.data.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ status: "disabled" }),
      });
      assert.equal(disableResponse.status, 200);

      const persisted = await db.query<{
        prompt_category: string;
        name: string;
        summary: string;
        cover_image_url: string;
        prompt_content: string;
        status: string;
        is_published: boolean;
      }>(
        `SELECT prompt_category, name, summary, cover_image_url, prompt_content, status, is_published
         FROM prompts WHERE id = $1`,
        [createPayload.data.id],
      );
      assert.deepEqual(persisted.rows[0], {
        prompt_category: "scene_extract",
        name: "Edited Scene Prompt",
        summary: "Edited scene prompt summary.",
        cover_image_url: "https://example.com/scene-cover-edited.png",
        prompt_content: "Edited scene prompt content keeps location_id, continuity_notes, visual_motifs, previous_scene_link, next_scene_hook, and AI drawing prompt structure for long novels.",
        status: "disabled",
        is_published: false,
      });
    } finally {
      await server.close();
    }
  });

  it("persists prop prompts in the unified prompts table", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const propCreateResponse = await fetch(`${server.origin}/api/admin/prop-prompt/templates`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Test Prop Prompt",
          cover_image_url: "https://example.com/prop-cover.png",
          summary: "Extracts reusable visual props.",
          prompt_content: "Extract visible story props and generate detailed visual prompts for each reusable object in the source script.",
          status: "enabled",
        }),
      });
      assert.equal(propCreateResponse.status, 200);
      const propCreatePayload = await propCreateResponse.json();

      const propUpdateResponse = await fetch(`${server.origin}/api/admin/prop-prompt/templates/${propCreatePayload.data.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Edited Prop Prompt",
          cover_image_url: "https://example.com/prop-cover-edited.png",
          summary: "Edited prop prompt summary.",
          prompt_content: "Edited prop prompt content is stored back into the database and remains available for admin-managed prop extraction.",
          status: "enabled",
        }),
      });
      assert.equal(propUpdateResponse.status, 200);
      const propUpdatePayload = await propUpdateResponse.json();
      assert.equal(propUpdatePayload.data.name, "Edited Prop Prompt");
      assert.equal(propUpdatePayload.data.category, "prop_extract");
      assert.equal(propUpdatePayload.data.cover_image_url, "https://example.com/prop-cover-edited.png");

      const disableResponse = await fetch(`${server.origin}/api/admin/prop-prompt/templates/${propCreatePayload.data.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ status: "disabled" }),
      });
      assert.equal(disableResponse.status, 200);

      const persisted = await db.query<{
        prompt_category: string;
        name: string;
        summary: string;
        cover_image_url: string;
        prompt_content: string;
        status: string;
        is_published: boolean;
      }>(
        `SELECT prompt_category, name, summary, cover_image_url, prompt_content, status, is_published
         FROM prompts WHERE id = $1`,
        [propCreatePayload.data.id],
      );
      assert.deepEqual(persisted.rows[0], {
        prompt_category: "prop_extract",
        name: "Edited Prop Prompt",
        summary: "Edited prop prompt summary.",
        cover_image_url: "https://example.com/prop-cover-edited.png",
        prompt_content: "Edited prop prompt content is stored back into the database and remains available for admin-managed prop extraction.",
        status: "disabled",
        is_published: false,
      });
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
      assert.equal(publishResponse.status, 200);
      assert.equal(publishPayload.data.status, "active");
      assert.equal(detailResponse.status, 200);
      assert.equal(detailPayload.data.model.status, "active");
    } finally {
      await server.close();
    }
  });

  it("allows publishing model configs with a direct provider API key", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/models`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-direct-api-key-create",
          cookie,
        },
        body: JSON.stringify({
          modelCode: "admin-direct-api-key-image",
          displayName: "Direct API Key Image",
          providerName: "custom",
          providerModel: "direct-api-key-model",
          providerProtocol: "custom_http",
          invocationMode: "sync",
          mediaType: "image",
          taskModes: ["image.generate"],
          parameterSchema: {
            prompt: { label: "Prompt", type: "string", required: true },
          },
          pricing: { unit: "image", baseCredits: 30 },
          providerConfig: {
            baseURL: "https://provider.example.test",
            endpoint: "/v1/images/generations",
            apiKey: "direct-admin-provider-key",
          },
          dispatchPolicy: {
            submitQueueName: "generation-submit-direct-key-image",
            providerRpmLimit: 30,
            providerConcurrentLimit: 2,
          },
          reason: "Create direct API key model",
        }),
      });
      const createPayload = await createResponse.json();
      const modelId = createPayload.data.id;

      const publishResponse = await fetch(`${server.origin}/api/admin/models/${modelId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-model-direct-api-key-publish",
          cookie,
        },
        body: JSON.stringify({
          status: "active",
          reason: "Publish direct API key model",
        }),
      });
      const publishPayload = await publishResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createPayload.data.providerConfig.apiKey, "direct-admin-provider-key");
      assert.equal(createPayload.data.providerConfig.apiKeyEnv, undefined);
      assert.equal(publishResponse.status, 200);
      assert.equal(publishPayload.data.status, "active");
    } finally {
      await server.close();
    }
  });

  it("keeps status changes non-blocking while probe diagnoses incomplete async polling configs", async () => {
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
            providerRpmLimit: 30,
            providerConcurrentLimit: 2,
          },
          reason: "创建缺少轮询端点模型",
        }),
      });
      const createPayload = await createResponse.json();
      assert.equal(createResponse.status, 200, JSON.stringify(createPayload));
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
      const probeResponse = await fetch(`${server.origin}/api/admin/models/${modelId}/probe`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ reason: "诊断异步轮询配置" }),
      });
      const probePayload = await probeResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(publishResponse.status, 200);
      assert.equal(publishPayload.data.status, "active");
      assert.equal(probeResponse.status, 200, JSON.stringify(probePayload));
      assert.equal(probePayload.data.ok, false);
      assert.ok(probePayload.data.checks.some((check: { key: string }) => check.key === "queryTaskEndpoint"));
      assert.ok(probePayload.data.checks.some((check: { key: string }) => check.key === "pollQueueName"));
    } finally {
      await server.close();
    }
  });

  it("serves database-backed users, team permission accounts, and credit summaries", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    await seedAdminUserListFixture(db);

    try {

            await db.query(
        `
          UPDATE users
          SET credit_balance_cached = 0,
              credit_frozen_cached = 18800,
              credit_frozen_at = '2026-06-24T07:10:00.000Z',
              credit_frozen_until = '2027-06-24T07:10:00.000Z'
          WHERE id = '93000000-0000-4000-8000-000000000001'
        `,
      );
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
      const ownerRows = usersPayload.data.filter(
        (user: { userId: string }) => user.userId === "93000000-0000-4000-8000-000000000001",
      );
      const teamAdmin = ownerRows[0];

      const subaccountsResponse = await fetch(
        `${server.origin}/api/admin/users/${teamAdmin.userId}/subaccounts`,
        { headers: { cookie } },
      );
      const subaccountsPayload = await subaccountsResponse.json();

      assert.equal(forbidden.status, 401);
      assert.equal(forbiddenPayload.error.code, "admin_unauthenticated");
      assert.equal(usersResponse.status, 200);
      assert.equal(usersPayload.meta.page, 1);
      assert.equal(usersPayload.meta.pageSize, 20);
      assert.ok(usersPayload.data.length >= 3);
      assert.equal(ownerRows.length, 1);
      assert.equal(ownerRows[0].availableCredits, 0);
      assert.equal(ownerRows[0].frozenCredits, 18800);
      assert.equal(ownerRows[0].displayCreditBalance, 18800);
      assert.equal(teamPermissionAccountsResponse.status, 200);
      assert.deepEqual(
        teamPermissionAccountsPayload.data.map(
          (user: { displayName: string; accountType: string; subaccountCount: number }) => ({
            displayName: user.displayName,
            accountType: user.accountType,
            subaccountCount: user.subaccountCount,
          }),
        ),
        [
          { displayName: "分镜组长", accountType: "subaccount", subaccountCount: 0 },
          { displayName: "子账户 A", accountType: "subaccount", subaccountCount: 0 },
        ],
      );
      assert.equal(teamAdmin.accountType, "owner_account");
      assert.equal(teamAdmin.phone, "13800200001");
      assert.equal(teamAdmin.email, "ow***@example.test");
      assert.equal(teamAdmin.availableCredits, 0);
      assert.equal(teamAdmin.reservedCredits, 40);
      assert.equal(teamAdmin.subaccountCount, 2);
      assert.equal(subaccountsResponse.status, 200);
      assert.deepEqual(subaccountsPayload.data.map((user: { displayName: string; loginName: string; memberCredits: number }) => ({
        displayName: user.displayName,
        loginName: user.loginName,
        memberCredits: user.memberCredits,
      })), [
        { displayName: "分镜组长", loginName: "story-lead@u00001", memberCredits: 2100 },
        { displayName: "子账户 A", loginName: "story-sub-a@u00001", memberCredits: 680 },
      ]);
    } finally {
      await server.close();
    }
  });

  it("lets support admins configure a team's subaccount limit without granting finance write access", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "support_admin",
    });
    await seedAdminUserListFixture(db);

    try {
      const defaultResponse = await fetch(
        `${server.origin}/api/admin/users/93000000-0000-4000-8000-000000000001/team-plan-limit`,
        { headers: { cookie } },
      );
      const defaultPayload = await defaultResponse.json();

      const updateResponse = await fetch(
        `${server.origin}/api/admin/users/93000000-0000-4000-8000-000000000001/team-plan-limit`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "support-admin-team-limit-120",
            cookie,
          },
          body: JSON.stringify({ seatLimit: 120, reason: "enterprise support request" }),
        },
      );
      const updatePayload = await updateResponse.json();

      const restoreResponse = await fetch(
        `${server.origin}/api/admin/users/93000000-0000-4000-8000-000000000001/team-plan-limit`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "support-admin-team-limit-restore",
            cookie,
          },
          body: JSON.stringify({ seatLimit: null, reason: "restore standard plan" }),
        },
      );
      const restorePayload = await restoreResponse.json();

      const auditEvents = await db.query<{ event_type: string }>(
        `
          SELECT event_type
          FROM audit_events
          WHERE event_type IN ('admin.team_plan_limit.updated', 'admin.team_plan_limit.cleared')
          ORDER BY created_at ASC
        `,
      );

      assert.equal(defaultResponse.status, 200);
      assert.equal(defaultPayload.data.defaultSeatLimit, 50);
      assert.equal(defaultPayload.data.effectiveSeatLimit, 50);
      assert.equal(defaultPayload.data.usedSeats, 2);
      assert.equal(updateResponse.status, 200);
      assert.equal(updatePayload.data.effectiveSeatLimit, 120);
      assert.equal(updatePayload.data.limitSource, "override");
      assert.equal(restoreResponse.status, 200);
      assert.equal(restorePayload.data.effectiveSeatLimit, 50);
      assert.equal(restorePayload.data.limitSource, "default");
      assert.deepEqual(auditEvents.rows.map((row) => row.event_type), [
        "admin.team_plan_limit.updated",
        "admin.team_plan_limit.cleared",
      ]);
    } finally {
      await server.close();
    }

    const financeDb = await createMigratedTestDb();
    const { server: financeServer, cookie: financeCookie } = await createLoggedInAdminServer(financeDb, {
      role: "finance_admin",
    });
    await seedAdminUserListFixture(financeDb);

    try {
      const forbiddenResponse = await fetch(
        `${financeServer.origin}/api/admin/users/93000000-0000-4000-8000-000000000001/team-plan-limit`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "finance-admin-team-limit-write",
            cookie: financeCookie,
          },
          body: JSON.stringify({ seatLimit: 200, reason: "finance admin should not configure seats" }),
        },
      );
      const forbiddenPayload = await forbiddenResponse.json();

      assert.equal(forbiddenResponse.status, 403);
      assert.equal(forbiddenPayload.error.code, "admin_forbidden");
    } finally {
      await financeServer.close();
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
      assert.equal(owner.phone, "13800200001");
      assert.equal(owner.email, "ow***@example.test");
      assert.equal(revealResponse.status, 200);
      assert.deepEqual(revealPayload.data.contact, {
        phone: "13800200001",
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
          body: JSON.stringify({
            amount: 100,
            reason: "客服补偿",
            adjustmentScenario: "compensation",
          }),
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
          body: JSON.stringify({
            amount: 100,
            reason: "客服补偿",
            adjustmentScenario: "compensation",
          }),
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
          body: JSON.stringify({ amount: 100, reason: "客服补偿" }),
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
      const ledger = await db.query<{
        amount: number | string;
        reason: string;
        work_order_no: string | null;
        adjustment_scenario: string | null;
      }>(
        `
          SELECT
            amount,
            reason,
            metadata_json->>'workOrderNo' AS work_order_no,
            metadata_json->>'adjustmentScenario' AS adjustment_scenario
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
      assert.equal(grantPayload.data.availableCredits, 100);
      assert.equal(replayResponse.status, 200);
      assert.deepEqual(replayPayload, grantPayload);
      assert.equal(ownerAfter.availableCredits, 100);
      assert.deepEqual(ledger.rows.map((row) => Number(row.amount)), [100]);
      assert.deepEqual(ledger.rows.map((row) => row.reason), ["客服补偿"]);
      assert.deepEqual(ledger.rows.map((row) => row.work_order_no), [null]);
      assert.deepEqual(ledger.rows.map((row) => row.adjustment_scenario), ["compensation"]);
      assert.deepEqual(audit.rows, [
        {
          event_type: "admin.credit.granted",
          reason: "客服补偿",
          work_order_no: null,
        },
      ]);
    } finally {
      await server.close();
    }
  });

  it("lets admins gift a membership plan to a personal user and records membership gifted credits", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    const userId = randomUUID();
    const membershipId = randomUUID();
    const planId = randomUUID();

    await db.query(
      `
        INSERT INTO users (id, phone_e164, display_name, status)
        VALUES ($1, '13800300001', '个人用户', 'active')
      `,
    [userId],
    );


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
          visibility,
          usage_scene,
          status
        )
        VALUES (
          $1,
          'admin_gift_professional',
          '后台赠送专业版',
          'professional',
          'month',
          1,
          100,
          'CNY',
          88,
          1,
          '["canvas_access","priority_generation"]'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          'public',
          'manual_gift',
          'active'
        )
      `,
      [planId],
    );

    try {
      const giftResponse = await fetch(`${server.origin}/api/admin/users/${userId}/membership/grant`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-membership-gift-personal-user",
          cookie,
        },
        body: JSON.stringify({
          membershipPlanId: planId,
          reason: "should be normalized",
        }),
      });
      const giftPayload = await giftResponse.json();
      const replayResponse = await fetch(`${server.origin}/api/admin/users/${userId}/membership/grant`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-membership-gift-personal-user",
          cookie,
        },
        body: JSON.stringify({
          membershipPlanId: planId,
          reason: "replay",
        }),
      });
      const replayPayload = await replayResponse.json();
      const membership = await db.query<{
        membership_tier: string | null;
        gift_credits: number | string;
      }>(
        "SELECT membership_tier, gift_credits FROM user_memberships WHERE user_id = $1",
        [userId],
      );
      const ledger = await db.query<{
        amount: number | string;
        reason: string | null;
        source_type: string;
      }>(
        "SELECT amount, reason, source_type FROM credit_ledger_entries WHERE user_id = $1",
        [userId],
      );
      const audit = await db.query<{ reason: string | null }>(
        "SELECT reason FROM audit_events WHERE event_type = 'admin.membership.granted'",
      );
      const order = await db.query<{
        status: string;
        paid_at: Date | string | null;
        successful_payment_intent_id: string | null;
        amount_minor: number | string;
      }>(
        "SELECT status, paid_at, successful_payment_intent_id, amount_minor FROM billing_orders WHERE id = $1",
        [giftPayload.data.orderId],
      );
      const entitlementCount = await db.query<{ count: number | string }>(
        "SELECT COUNT(*) AS count FROM user_entitlements WHERE user_id = $1",
        [userId],
      );

      assert.equal(giftResponse.status, 200, JSON.stringify(giftPayload));
      assert.equal(giftPayload.data.membershipPlanId, planId);
      assert.equal(giftPayload.data.giftCredits, 88);
      assert.equal(replayResponse.status, 200, JSON.stringify(replayPayload));
      assert.deepEqual(replayPayload, giftPayload);
      assert.equal(membership.rows[0]?.membership_tier, "professional");
      assert.equal(Number(membership.rows[0]?.gift_credits), 88);
      assert.deepEqual(ledger.rows, [
        {
          amount: 88,
          reason: "会员赠送",
          source_type: "membership_gift",
        },
      ]);
      assert.deepEqual(audit.rows, [{ reason: "会员赠送" }]);
      assert.deepEqual(order.rows, [
        {
          status: "closed",
          paid_at: null,
          successful_payment_intent_id: null,
          amount_minor: 100,
        },
      ]);
      assert.equal(Number(entitlementCount.rows[0]?.count ?? 0), 2);
    } finally {
      await server.close();
    }
  });

  it("lets admins force restore frozen wallet credits without membership renewal", async () => {
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
      await db.query(
        `
          UPDATE users
          SET credit_balance_cached = 0,
              credit_frozen_cached = 18800,
              credit_frozen_at = '2026-06-24T07:10:00.000Z',
              credit_frozen_until = '2027-06-24T07:10:00.000Z'
          WHERE id = $1
        `,
        [owner.userId],
      );
      await db.query(
        `
          INSERT INTO credit_ledger_entries (
        id,
        user_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_at
      )
          VALUES ('98000000-0000-4000-8000-000000000099', $1, 'grant', 18800, 18800, 0, 0, 'payment_order', '97000000-0000-4000-8000-000000000099', 'seed frozen credits', '{"kind":"direct_recharge"}'::jsonb, '2026-06-24T07:00:00.000Z')
        `,
    [owner.userId],
      );
      await db.query(
        `
          INSERT INTO credit_lots (
        id,
        user_id,
        source_type,
        source_id,
        grant_ledger_entry_id,
        total_amount,
        available_amount,
        reserved_amount,
        consumed_amount,
        expired_amount,
        status,
        frozen_at,
        frozen_until,
        metadata_json
      )
          VALUES ('97000000-0000-4000-8000-000000000099', $1, 'payment_order', '97000000-0000-4000-8000-000000000099', '98000000-0000-4000-8000-000000000099', 18800, 18800, 0, 0, 0, 'frozen', '2026-06-24T07:10:00.000Z', '2027-06-24T07:10:00.000Z', '{"kind":"direct_recharge"}'::jsonb)
        `,
    [owner.userId],
      );

      const restoreResponse = await fetch(
        `${server.origin}/api/admin/users/${owner.userId}/credits/frozen/restore`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-credit-restore-frozen-owner",
            cookie,
          },
          body: JSON.stringify({ reason: "客服工单核实后解冻" }),
        },
      );
      const restorePayload = await restoreResponse.json();
      const usersAfterResponse = await fetch(`${server.origin}/api/admin/users`, {
        headers: { cookie },
      });
      const usersAfterPayload = await usersAfterResponse.json();
      const ownerAfter = usersAfterPayload.data.find(
        (user: { userId: string }) => user.userId === owner.userId,
      );
      const ledgerResponse = await fetch(`${server.origin}/api/admin/users/${owner.userId}/credits/ledger`, {
        headers: { cookie },
      });
      const ledgerPayload = await ledgerResponse.json();

      assert.equal(restoreResponse.status, 200, JSON.stringify(restorePayload));
      assert.equal(restorePayload.data.restoredAmount, 18800);
      assert.equal(restorePayload.data.availableCredits, 18800);
      assert.equal(restorePayload.data.frozenCredits, 0);
      assert.equal(ownerAfter.availableCredits, 18800);
      assert.equal(ownerAfter.frozenCredits, 0);
      assert.equal(ownerAfter.displayCreditBalance, 18800);
      assert.equal(ledgerPayload.summary.displayAvailableCredits, 18800);
      assert.equal(ledgerPayload.summary.frozenCredits, 0);
      assert.equal(ledgerPayload.data[0]?.sourceType, "admin_frozen_credit_restore");
      assert.equal(ledgerPayload.data[0]?.entryType, "restore");
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
      await db.query(
        `
          UPDATE users
          SET credit_balance_cached = 8420
          WHERE id = $1
        `,
        [owner.userId],
      );
      await db.query(
        `
          INSERT INTO credit_ledger_entries (
            id, user_id, entry_type, amount, available_delta, reserved_delta,
            consumed_delta, source_type, source_id, reason, metadata_json,
            created_by_user_id, created_at
          ) VALUES (
            '98000000-0000-4000-8000-000000000001', $1, 'grant', 8420, 8420, 0,
            0, 'admin_test', '97000000-0000-4000-8000-000000000011',
            'seed owner credits', '{}'::jsonb, $1, now()
          )
        `,
        [owner.userId],
      );
      await db.query(
        `
          INSERT INTO credit_lots (
            id, user_id, source_type, source_id, grant_ledger_entry_id,
            total_amount, available_amount, reserved_amount, consumed_amount,
            expired_amount, status, metadata_json
          ) VALUES (
            '97000000-0000-4000-8000-000000000001', $1, 'admin_test',
            '97000000-0000-4000-8000-000000000011',
            '98000000-0000-4000-8000-000000000001', 8420, 8420, 0, 0, 0,
            'active', '{}'::jsonb
          )
        `,
        [owner.userId],
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
        }),
      });
      const replayDeductPayload = await replayDeductResponse.json();

      const ledgerResponse = await fetch(`${server.origin}/api/admin/users/${owner.userId}/credits/ledger`, {
        headers: { cookie },
      });
      const ledgerPayload = await ledgerResponse.json();
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
      assert.equal(deductResponse.status, 200, JSON.stringify(deductPayload));
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
      assert.deepEqual(creditLedger.rows, [{ reason: "异常赠送扣回", work_order_no: null }]);
      assert.equal(ownerAfter.displayName, "白夜工作室 Pro");
      assert.equal(ownerAfter.status, "disabled");
      assert.equal(ownerAfter.availableCredits, 8350);
      assert.deepEqual(audit.rows, [
        { event_type: "admin.credit.deducted", reason: "异常赠送扣回", work_order_no: null },
        { event_type: "admin.user.profile_updated", reason: "客服协助修改资料", work_order_no: null },
        { event_type: "admin.user.status_changed", reason: "风险处理临时禁用", work_order_no: null },
      ]);
    } finally {
      await server.close();
    }
  });

  it("lets admins inspect model request logs for a specific user", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    await seedAdminUserListFixture(db);

    try {
      await db.query(
        `
          INSERT INTO provider_requests (
        id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        status,
        external_submission_started_at,
        response_redacted_json,
        created_by_user_id,
        created_at,
        updated_at
      )
          VALUES ('a1000000-0000-4000-8000-000000000001', 'deepseek', 'llm.chat.completions', 'admin-model-log-1', 'req-hash-1', 'text-gateway://admin-model-log-1', 'payload-hash-1', '{"model":"deepseek-chat"}'::jsonb, 'succeeded', '2026-06-05T09:00:00.000Z', '{"usageSource":"provider","redactedRequest":{"model":"deepseek-chat","max_tokens":128000}}'::jsonb, '93000000-0000-4000-8000-000000000001', '2026-06-05T09:00:00.000Z', '2026-06-05T09:00:10.000Z')
        `,
      );
      await db.query(
        `
          INSERT INTO user_model_request_logs (
        id,
        provider_request_id,
        user_id,
        provider_name,
        provider_operation,
        model_id,
        provider_model,
        request_key,
        request_hash,
        payload_hash,
        payload_summary,
        request_body_json,
        request_text,
        response_text,
        response_usage_json,
        response_finish_reasons_json,
        status,
        started_at,
        completed_at,
        created_at,
        updated_at
      )
          VALUES ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'deepseek', 'llm.chat.completions', 'deepseek-chat', 'deepseek-chat', 'admin-model-log-1', 'req-hash-1', 'payload-hash-1', 'ai storyboard preview text generation', '{"model":"deepseek-chat","max_tokens":384000}'::jsonb, '[user]\n角色模板 任小野', '{"characters":[{"name":"任小野"}]}', '{"prompt_tokens":101,"completion_tokens":55,"total_tokens":156}'::jsonb, '["stop"]'::jsonb, 'succeeded', '2026-06-05T09:00:00.000Z', '2026-06-05T09:00:10.000Z', '2026-06-05T09:00:00.000Z', '2026-06-05T09:00:10.000Z')
        `,
      );

      const response = await fetch(`${server.origin}/api/admin/users/93000000-0000-4000-8000-000000000001/model-requests?page=1&pageSize=15&modelType=text`, {
        headers: { cookie },
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.data.length, 1);
      assert.equal(payload.data[0].modelId, "deepseek-chat");
      assert.equal(payload.data[0].modelType, "text");
      assert.equal(payload.data[0].modelName, "deepseek-chat");
      assert.equal(payload.data[0].creditsCost, 0);
      assert.equal(payload.data[0].requestFormat, "openai_chat_completions");
      assert.deepEqual(payload.data[0].businessRequestBody, { model: "deepseek-chat" });
      assert.deepEqual(payload.data[0].providerRequestBody, {
        model: "deepseek-chat",
        max_tokens: 128000,
      });
      assert.equal(payload.data[0].providerRequestStatus, "succeeded");
      assert.equal(payload.data[0].externalSubmissionStartedAt, "2026-06-05T09:00:00.000Z");
      assert.match(payload.data[0].requestText, /角色模板 任小野/);
      assert.match(payload.data[0].responseText, /任小野/);
      assert.equal(payload.data[0].status, "succeeded");
      assert.equal(payload.data[0].responseUsage.total_tokens, 156);
      assert.equal(payload.meta.page, 1);
      assert.equal(payload.meta.pageSize, 15);
      assert.equal(payload.meta.total, 1);
      assert.equal(payload.meta.totalPages, 1);
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
          secretValue: "test-openai-secret-value",
          purpose: "OpenAI 图片模型",
          providerName: "openai",
          providerChannel: "proxy",
          mediaTypes: ["image"],
          modelCodes: ["gpt-image-2-cn"],
          requestDomain: "https://relay.example.test",
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
      assert.deepEqual(
        settingsPayload.data.configs.find(
          (config: { key: string }) => config.key === "team.default_subaccount_limit",
        ),
        {
          key: "team.default_subaccount_limit",
          value: 50,
          valueType: "number",
          scope: "creator",
          description: "默认团队子账号上限",
          updatedAt: null,
        },
      );
      assert.equal(secretResponse.status, 200);
      assert.equal(secretPayload.data.envName, "OPENAI_API_KEY");
      assert.equal(secretPayload.data.status, "configured");
      assert.equal(secretPayload.data.hasSecret, true);
      assert.equal(secretPayload.data.providerChannel, "proxy");
      assert.equal(secretPayload.data.requestDomain, "https://relay.example.test");
      assert.deepEqual(secretPayload.data.mediaTypes, ["image"]);
      assert.deepEqual(secretPayload.data.modelCodes, ["gpt-image-2-cn"]);
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
      assert.equal(
        settingsPayload.data.secretReferences.find((secret: { envName: string }) => secret.envName === "OPENAI_API_KEY").providerChannel,
        "proxy",
      );
      assert.equal(
        settingsPayload.data.secretReferences.find((secret: { envName: string }) => secret.envName === "OPENAI_API_KEY").requestDomain,
        "https://relay.example.test",
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

  it("lets admins manage backend-driven legal documents and exposes them to the public login page", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const publicBeforeResponse = await fetch(`${server.origin}/api/public/legal-documents`);
      const publicBeforePayload = await publicBeforeResponse.json();

      const updateServiceResponse = await fetch(
        `${server.origin}/api/admin/settings/legal.service_agreement`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-legal-service-agreement",
            cookie,
          },
          body: JSON.stringify({
            value: {
              title: "用户服务协议",
              contentHtml: "<h1>用户服务协议</h1><p><strong>欢迎使用</strong>万兴剧厂。</p>",
              versionLabel: "2025-11-15",
            },
            valueType: "json",
            scope: "creator",
            description: "登录页用户服务协议富文本",
            reason: "更新登录页协议内容",
          }),
        },
      );
      const updateServicePayload = await updateServiceResponse.json();

      const updatePrivacyResponse = await fetch(
        `${server.origin}/api/admin/settings/legal.privacy_policy`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-legal-privacy-policy",
            cookie,
          },
          body: JSON.stringify({
            value: {
              title: "隐私政策",
              contentHtml: "<h1>隐私政策</h1><p>我们会依法处理你的个人信息。</p>",
              versionLabel: "2025-11-15",
            },
            valueType: "json",
            scope: "creator",
            description: "登录页隐私政策富文本",
            reason: "更新登录页隐私政策",
          }),
        },
      );
      const updatePrivacyPayload = await updatePrivacyResponse.json();

      const settingsResponse = await fetch(`${server.origin}/api/admin/settings`, {
        headers: { cookie },
      });
      const settingsPayload = await settingsResponse.json();

      const publicAfterResponse = await fetch(`${server.origin}/api/public/legal-documents`);
      const publicAfterPayload = await publicAfterResponse.json();

      const revisions = await db.query<{ config_key: string }>(
        `
          SELECT config_key
          FROM runtime_config_revisions
          WHERE config_key IN ('legal.service_agreement', 'legal.privacy_policy')
          ORDER BY config_key ASC
        `,
      );

      assert.equal(publicBeforeResponse.status, 200);
      assert.equal(publicBeforePayload.data.serviceAgreement.key, "legal.service_agreement");
      assert.equal(publicBeforePayload.data.privacyPolicy.key, "legal.privacy_policy");

      assert.equal(updateServiceResponse.status, 200);
      assert.equal(updateServicePayload.data.key, "legal.service_agreement");
      assert.equal(updateServicePayload.data.value.title, "用户服务协议");
      assert.equal(updatePrivacyResponse.status, 200);
      assert.equal(updatePrivacyPayload.data.key, "legal.privacy_policy");
      assert.equal(updatePrivacyPayload.data.value.title, "隐私政策");

      assert.equal(settingsResponse.status, 200);
      assert.ok(
        settingsPayload.data.configs.some(
          (config: { key: string }) => config.key === "legal.service_agreement",
        ),
      );
      assert.ok(
        settingsPayload.data.configs.some(
          (config: { key: string }) => config.key === "legal.privacy_policy",
        ),
      );

      assert.equal(publicAfterResponse.status, 200);
      assert.equal(publicAfterPayload.data.serviceAgreement.document.title, "用户服务协议");
      assert.match(publicAfterPayload.data.serviceAgreement.document.contentHtml, /欢迎使用/);
      assert.equal(publicAfterPayload.data.privacyPolicy.document.title, "隐私政策");
      assert.match(publicAfterPayload.data.privacyPolicy.document.contentHtml, /个人信息/);
      assert.deepEqual(revisions.rows, [
        { config_key: "legal.privacy_policy" },
        { config_key: "legal.service_agreement" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("lets admins manage legal documents through a list workflow and exposes enabled docs to the public login page", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const listBeforeResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        headers: { cookie },
      });
      const listBeforePayload = await listBeforeResponse.json();
      const publicBeforeResponse = await fetch(`${server.origin}/api/public/legal-documents`);
      const publicBeforePayload = await publicBeforeResponse.json();

      const createResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-create-privacy-v2",
          cookie,
        },
        body: JSON.stringify({
          type: "privacy",
          title: "Privacy Policy V2",
          contentHtml: "<h1>Privacy Policy V2</h1><p>Updated processing details.</p>",
          versionLabel: "2026-06-11",
          reason: "create candidate privacy policy",
        }),
      });
      const createPayload = await createResponse.json();

      const updateResponse = await fetch(`${server.origin}/api/admin/legal-documents/${createPayload.data.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-update-privacy-v2",
          cookie,
        },
        body: JSON.stringify({
          title: "Privacy Policy V2",
          contentHtml: "<h1>Privacy Policy V2</h1><p>Updated protection details.</p>",
          versionLabel: "2026-06-12",
          reason: "update candidate privacy policy",
        }),
      });
      const updatePayload = await updateResponse.json();

      const enableResponse = await fetch(`${server.origin}/api/admin/legal-documents/${createPayload.data.id}/enable`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-enable-privacy-v2",
          cookie,
        },
        body: JSON.stringify({
          enabled: true,
          reason: "enable new privacy policy",
        }),
      });
      const enablePayload = await enableResponse.json();

      const listAfterEnableResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        headers: { cookie },
      });
      const listAfterEnablePayload = await listAfterEnableResponse.json();
      const publicAfterEnableResponse = await fetch(`${server.origin}/api/public/legal-documents`);
      const publicAfterEnablePayload = await publicAfterEnableResponse.json();

      const disableResponse = await fetch(`${server.origin}/api/admin/legal-documents/${createPayload.data.id}/enable`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-disable-privacy-v2",
          cookie,
        },
        body: JSON.stringify({
          enabled: false,
          reason: "disable privacy policy directly",
        }),
      });
      const disablePayload = await disableResponse.json();

      const listAfterDisableResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        headers: { cookie },
      });
      const listAfterDisablePayload = await listAfterDisableResponse.json();
      const publicAfterDisableResponse = await fetch(`${server.origin}/api/public/legal-documents`);
      const publicAfterDisablePayload = await publicAfterDisableResponse.json();

      const deleteResponse = await fetch(`${server.origin}/api/admin/legal-documents/${createPayload.data.id}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-delete-privacy-v2",
          cookie,
        },
        body: JSON.stringify({
          reason: "delete candidate privacy policy",
        }),
      });
      const deletePayload = await deleteResponse.json();

      const listAfterDeleteResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        headers: { cookie },
      });
      const listAfterDeletePayload = await listAfterDeleteResponse.json();
      const publicAfterDeleteResponse = await fetch(`${server.origin}/api/public/legal-documents`);
      const publicAfterDeletePayload = await publicAfterDeleteResponse.json();

      const revisions = await db.query<{ config_key: string }>(
        `
          SELECT config_key
          FROM runtime_config_revisions
          WHERE config_key = 'legal.documents'
          ORDER BY created_at ASC
        `,
      );

      assert.equal(listBeforeResponse.status, 200);
      assert.equal(listBeforePayload.data.documents.length, 2);
      assert.equal(publicBeforeResponse.status, 200);
      assert.equal(publicBeforePayload.data.serviceAgreement.key, "legal.service_agreement");
      assert.equal(publicBeforePayload.data.privacyPolicy.key, "legal.privacy_policy");

      assert.equal(createResponse.status, 200);
      assert.equal(createPayload.data.type, "privacy");
      assert.equal(createPayload.data.status, "disabled");

      assert.equal(updateResponse.status, 200);
      assert.equal(updatePayload.data.id, createPayload.data.id);
      assert.equal(updatePayload.data.document.versionLabel, "2026-06-12");

      assert.equal(enableResponse.status, 200);
      assert.equal(enablePayload.data.status, "enabled");

      assert.equal(listAfterEnableResponse.status, 200);
      assert.ok(
        listAfterEnablePayload.data.documents.some(
          (document: { id: string; type: string; status: string }) =>
            document.id !== createPayload.data.id &&
            document.type === "privacy" &&
            document.status === "enabled",
        ),
      );
      assert.ok(
        listAfterEnablePayload.data.documents.some(
          (document: { id: string; status: string }) =>
            document.id === createPayload.data.id && document.status === "enabled",
        ),
      );

      assert.equal(publicAfterEnableResponse.status, 200);
      assert.equal(publicAfterEnablePayload.data.privacyPolicy.document.title, "隐私政策");
      assert.doesNotMatch(publicAfterEnablePayload.data.privacyPolicy.document.contentHtml, /Updated protection details/);

      assert.equal(disableResponse.status, 200);
      assert.equal(disablePayload.data.status, "disabled");
      assert.equal(listAfterDisableResponse.status, 200);
      assert.ok(
        listAfterDisablePayload.data.documents.some(
          (document: { id: string; type: string; status: string }) =>
            document.id !== createPayload.data.id &&
            document.type === "privacy" &&
            document.status === "enabled",
        ),
      );
      assert.ok(
        listAfterDisablePayload.data.documents.some(
          (document: { id: string; status: string }) =>
            document.id === createPayload.data.id && document.status === "disabled",
        ),
      );
      assert.equal(publicAfterDisableResponse.status, 200);
      assert.equal(publicAfterDisablePayload.data.privacyPolicy.document.title, "隐私政策");
      assert.doesNotMatch(publicAfterDisablePayload.data.privacyPolicy.document.contentHtml, /Updated protection details/);

      assert.equal(deleteResponse.status, 200);
      assert.equal(deletePayload.data.id, createPayload.data.id);
      assert.equal(listAfterDeleteResponse.status, 200);
      assert.equal(listAfterDeletePayload.data.documents.length, 2);
      assert.equal(publicAfterDeleteResponse.status, 200);
      assert.equal(publicAfterDeletePayload.data.privacyPolicy.document.title, "隐私政策");
      assert.doesNotMatch(publicAfterDeletePayload.data.privacyPolicy.document.contentHtml, /Updated protection details/);

      assert.equal(revisions.rows.length, 5);
      assert.ok(revisions.rows.every((row) => row.config_key === "legal.documents"));
    } finally {
      await server.close();
    }
  });

  it("allows admins to rename legal documents and create custom document types", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-create-custom-type",
          cookie,
        },
        body: JSON.stringify({
          type: "subscription_terms",
          title: "订阅条款",
          contentHtml: "<h1>订阅条款</h1><p>自定义协议类型。</p>",
          versionLabel: "2026-06-26",
          reason: "create custom legal document type",
        }),
      });
      const createPayload = await createResponse.json();

      const patchResponse = await fetch(`${server.origin}/api/admin/legal-documents/${createPayload.data.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-update-custom-type",
          cookie,
        },
        body: JSON.stringify({
          type: "membership_terms",
          title: "会员条款",
          contentHtml: "<h1>会员条款</h1><p>更新后的自定义协议。</p>",
          versionLabel: "2026-06-27",
          reason: "rename custom legal document and change type",
        }),
      });
      const patchPayload = await patchResponse.json();

      const listResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createPayload.data.type, "subscription_terms");
      assert.equal(createPayload.data.title, "订阅条款");

      assert.equal(patchResponse.status, 200);
      assert.equal(patchPayload.data.type, "membership_terms");
      assert.equal(patchPayload.data.title, "会员条款");
      assert.equal(patchPayload.data.document.versionLabel, "2026-06-27");

      assert.ok(
        listPayload.data.documents.some(
          (document: { id: string; type: string; title: string }) =>
            document.id === createPayload.data.id &&
            document.type === "membership_terms" &&
            document.title === "会员条款",
        ),
      );
    } finally {
      await server.close();
    }
  });

  it("keeps login service agreement enabled when enabling a recharge agreement", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-create-recharge-terms",
          cookie,
        },
        body: JSON.stringify({
          type: "service",
          title: "用户充值协议",
          contentHtml: "<h1>用户充值协议</h1><p>充值与付费权益说明。</p>",
          versionLabel: "2026-07-06",
          reason: "create recharge agreement from legacy service type",
        }),
      });
      const createPayload = await createResponse.json();

      const enableResponse = await fetch(`${server.origin}/api/admin/legal-documents/${createPayload.data.id}/enable`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-enable-recharge-terms",
          cookie,
        },
        body: JSON.stringify({
          enabled: true,
          reason: "enable recharge agreement without disabling login service agreement",
        }),
      });
      const enablePayload = await enableResponse.json();

      const listResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();
      const publicResponse = await fetch(`${server.origin}/api/public/legal-documents`);
      const publicPayload = await publicResponse.json();

      const serviceAgreement = listPayload.data.documents.find(
        (document: { title: string }) => document.title === "用户服务协议",
      );
      const rechargeAgreement = listPayload.data.documents.find(
        (document: { id: string }) => document.id === createPayload.data.id,
      );

      assert.equal(createResponse.status, 200);
      assert.equal(createPayload.data.type, "recharge_terms");
      assert.equal(enableResponse.status, 200);
      assert.equal(enablePayload.data.type, "recharge_terms");
      assert.equal(enablePayload.data.status, "enabled");

      assert.equal(listResponse.status, 200);
      assert.equal(serviceAgreement?.status, "enabled");
      assert.equal(rechargeAgreement?.type, "recharge_terms");
      assert.equal(rechargeAgreement?.status, "enabled");

      assert.equal(publicResponse.status, 200);
      assert.equal(publicPayload.data.serviceAgreement.document.title, "用户服务协议");
      assert.doesNotMatch(
        publicPayload.data.serviceAgreement.document.contentHtml,
        /充值与付费权益说明/,
      );
      assert.equal(publicPayload.data.rechargeTerms.document.title, "用户充值协议");
      assert.match(
        publicPayload.data.rechargeTerms.document.contentHtml,
        /充值与付费权益说明/,
      );
    } finally {
      await server.close();
    }
  });

  it("normalizes legacy default legal document ids to stable uuids so updates keep working", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      await db.query(
        `
          UPDATE runtime_config_entries
          SET value_json = $1::jsonb
          WHERE key = 'legal.documents'
        `,
    [JSON.stringify([
            {
              id: "default-service",
              type: "service",
              title: "用户服务协议",
              contentHtml: "<h1>用户服务协议</h1><p>旧默认服务协议。</p>",
              versionLabel: "2025-11-15",
              status: "enabled",
              deleted: false,
              sortOrder: 100,
              createdAt: "2025-11-15T00:00:00.000Z",
              updatedAt: "2025-11-15T00:00:00.000Z",
            },
            {
              id: "default-privacy",
              type: "privacy",
              title: "隐私政策",
              contentHtml: "<h1>隐私政策</h1><p>旧默认隐私协议。</p>",
              versionLabel: "2025-11-15",
              status: "enabled",
              deleted: false,
              sortOrder: 200,
              createdAt: "2025-11-15T00:00:00.000Z",
              updatedAt: "2025-11-15T00:00:00.000Z",
            },]),
        ],
      );

      const listResponse = await fetch(`${server.origin}/api/admin/legal-documents`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();
      const privacyDocument = listPayload.data.documents.find((item: { type: string }) => item.type === "privacy");

      const updateResponse = await fetch(`${server.origin}/api/admin/legal-documents/${privacyDocument.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-legal-doc-update-legacy-default-privacy",
          cookie,
        },
        body: JSON.stringify({
          title: "隐私政策",
          contentHtml: "<h1>隐私政策</h1><p>已修复默认协议编号。</p>",
          versionLabel: "2026-06-11",
          reason: "repair legacy default legal document id",
        }),
      });
      const updatePayload = await updateResponse.json();

      assert.equal(listResponse.status, 200);
      assert.match(String(privacyDocument.id), /^[0-9a-f-]{36}$/i);
      assert.equal(updateResponse.status, 200);
      assert.equal(updatePayload.data.document.versionLabel, "2026-06-11");
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
    const originalSecret = process.env.ADMIN_TEST_SECRET_CONFIGURED;
    process.env.ADMIN_TEST_SECRET_CONFIGURED = "super-secret-value-that-must-not-leak";
    delete process.env.ADMIN_TEST_SECRET_ABSENT_FOR_SPEC;
    const { server, cookie } = await createLoggedInAdminServer(db);

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
          secretValue: "super-secret-value-that-must-not-leak",
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
          envName: "ADMIN_TEST_SECRET_ABSENT_FOR_SPEC",
          secretValue: "temporary-secret-value",
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
      const settingsResponse = await fetch(`${server.origin}/api/admin/settings`, {
        headers: { cookie },
      });
      const settingsPayload = await settingsResponse.json();
      const revealResponse = await fetch(
        `${server.origin}/api/admin/secret-references/${configuredCreatePayload.data.id}/reveal`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-secret-configured-reveal",
            cookie,
          },
          body: JSON.stringify({ reason: "管理员按需查看密钥" }),
        },
      );
      const revealPayload = await revealResponse.json();

      const rows = await db.query<{ env_name: string; status: string; last_checked_at: Date | null }>(
        `
          SELECT secret_key AS env_name, status, last_checked_at
          FROM admin_secret_values
          WHERE secret_key IN ('ADMIN_TEST_SECRET_CONFIGURED', 'ADMIN_TEST_SECRET_ABSENT_FOR_SPEC')
          ORDER BY secret_key ASC
        `,
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type IN ('admin.secret_reference.probed', 'admin.secret_reference.revealed')
          ORDER BY event_type ASC, reason ASC
        `,
      );
      const combinedPayload = JSON.stringify([configuredProbePayload, missingProbePayload, rows.rows, audit.rows]);

      assert.equal(configuredProbe.status, 200);
      assert.equal(configuredProbePayload.data.status, "configured");
      assert.equal(configuredProbePayload.data.envName, "ADMIN_TEST_SECRET_CONFIGURED");
      assert.equal(typeof configuredProbePayload.data.lastCheckedAt, "string");
      assert.equal(configuredCreatePayload.data.secretValue, "");
      assert.equal(configuredCreatePayload.data.maskedSecretValue, "supe******leak");
      assert.equal(missingProbe.status, 200);
      assert.equal(missingProbePayload.data.status, "configured");
      assert.equal(typeof missingProbePayload.data.lastCheckedAt, "string");
      assert.deepEqual(
        rows.rows.map((row) => ({ env_name: row.env_name, status: row.status, checked: Boolean(row.last_checked_at) })),
        [
          { env_name: "ADMIN_TEST_SECRET_ABSENT_FOR_SPEC", status: "configured", checked: true },
          { env_name: "ADMIN_TEST_SECRET_CONFIGURED", status: "configured", checked: true },
        ],
      );
      assert.deepEqual(audit.rows, [
        { event_type: "admin.secret_reference.probed", reason: "检查已配置密钥引用" },
        { event_type: "admin.secret_reference.probed", reason: "检查缺失密钥引用" },
        { event_type: "admin.secret_reference.revealed", reason: "管理员按需查看密钥" },
      ]);
      assert.equal(settingsResponse.status, 200);
      assert.equal(
        settingsPayload.data.secretReferences.find(
          (secret: { envName: string }) => secret.envName === "ADMIN_TEST_SECRET_CONFIGURED",
        ).maskedSecretValue,
        "supe******leak",
      );
      assert.equal(revealResponse.status, 200);
      assert.equal(revealResponse.headers.get("cache-control"), "no-store");
      assert.deepEqual(revealPayload.data, {
        id: configuredCreatePayload.data.id,
        secretValue: "super-secret-value-that-must-not-leak",
      });
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

  it("lets operations admins manage announcements through the admin routes", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "ops_admin",
    });

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/announcements`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "ops-announcement-create",
          cookie,
        },
        body: JSON.stringify({
          title: "导演台积极开发中",
          body: "敬请期待。",
          actionLabel: "查看定价",
          actionUrl: "/pricing",
          sortOrder: 10,
          status: "active",
        }),
      });
      const createPayload = await createResponse.json();
      const announcementId = createPayload.announcement?.id;

      const listResponse = await fetch(`${server.origin}/api/admin/announcements`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();

      const updateResponse = await fetch(`${server.origin}/api/admin/announcements/${announcementId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "ops-announcement-update",
          cookie,
        },
        body: JSON.stringify({
          title: "导演台积极开发中",
          body: "第二版说明。",
          actionLabel: "查看定价",
          actionUrl: "/pricing",
          sortOrder: 10,
          status: "active",
        }),
      });
      const updatePayload = await updateResponse.json();

      const publicResponse = await fetch(`${server.origin}/api/announcements`);
      const publicPayload = await publicResponse.json();

      const deleteResponse = await fetch(`${server.origin}/api/admin/announcements/${announcementId}`, {
        method: "DELETE",
        headers: {
          "idempotency-key": "ops-announcement-delete",
          cookie,
        },
      });
      const deletePayload = await deleteResponse.json();

      const activeListResponse = await fetch(`${server.origin}/api/admin/announcements`, {
        headers: { cookie },
      });
      const activeListPayload = await activeListResponse.json();
      const archivedListResponse = await fetch(`${server.origin}/api/admin/announcements?includeArchived=1`, {
        headers: { cookie },
      });
      const archivedListPayload = await archivedListResponse.json();

      assert.equal(createResponse.status, 200, JSON.stringify(createPayload));
      assert.equal(typeof announcementId, "string");
      assert.equal(listResponse.status, 200);
      assert.equal(listPayload.data.announcements[0]?.id, announcementId);
      assert.equal(updateResponse.status, 200);
      assert.equal(updatePayload.announcement.body, "第二版说明。");
      assert.equal(publicResponse.status, 200);
      assert.equal(publicPayload.data.announcements[0]?.body, "第二版说明。");
      assert.equal(deleteResponse.status, 200);
      assert.equal(deletePayload.announcement.status, "archived");
      assert.equal(activeListResponse.status, 200);
      assert.equal(activeListPayload.data.announcements.length, 0);
      assert.equal(archivedListResponse.status, 200);
      assert.equal(archivedListPayload.data.announcements[0]?.status, "archived");
    } finally {
      await server.close();
    }
  });

  it("lets finance admins create, replay, and list membership plans", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "finance_admin",
    });

    try {
      const planBody = {
        code: `professional_monthly_${randomUUID().slice(0, 8)}`,
        displayName: "Professional Monthly",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 19900,
        currency: "CNY",
        giftCredits: 100,
        seatLimit: 50,
        entitlements: ["team_member_management", "priority_generation"],
        priorityRules: { modelFamilies: ["seedance"] },
        displayMetadata: { sortOrder: 20 },
        status: "active",
        reason: "Create professional monthly membership plan",
      };
      const createResponse = await fetch(`${server.origin}/api/admin/membership/plans`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-membership-plan-professional-monthly",
          cookie,
        },
        body: JSON.stringify(planBody),
      });
      const createPayload = await createResponse.json();

      const replayResponse = await fetch(`${server.origin}/api/admin/membership/plans`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-membership-plan-professional-monthly",
          cookie,
        },
        body: JSON.stringify(planBody),
      });
      const replayPayload = await replayResponse.json();

      const conflictResponse = await fetch(`${server.origin}/api/admin/membership/plans`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-membership-plan-professional-monthly",
          cookie,
        },
        body: JSON.stringify({
          ...planBody,
          amountMinor: 29900,
        }),
      });
      const conflictPayload = await conflictResponse.json();

      const listResponse = await fetch(`${server.origin}/api/admin/membership/plans`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();
      const meResponse = await fetch(`${server.origin}/api/admin/auth/me`, {
        headers: { cookie },
      });
      const mePayload = await meResponse.json();
      const revisions = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM membership_plan_revisions WHERE plan_id = $1",
        [createPayload.plan?.id],
      );

      assert.equal(createResponse.status, 200, JSON.stringify(createPayload));
      assert.equal(createPayload.plan.displayName, "Professional Monthly");
      assert.equal(createPayload.plan.periodUnit, "month");
      assert.equal(createPayload.plan.amountMinor, 19900);
      assert.equal(createPayload.plan.giftCredits, 100);
      assert.equal(createPayload.plan.seatLimit, 50);
      assert.deepEqual(createPayload.plan.entitlements, ["team_member_management", "priority_generation"]);
      assert.deepEqual(createPayload.plan.priorityRules, { modelFamilies: ["seedance"] });
      assert.deepEqual(createPayload.plan.displayMetadata, { sortOrder: 20 });
      assert.equal(replayResponse.status, 200);
      assert.equal(replayPayload.plan.id, createPayload.plan.id);
      assert.equal(conflictResponse.status, 409);
      assert.equal(conflictPayload.error.code, "idempotency_conflict");
      assert.deepEqual(revisions.rows, [{ count: 1 }]);
      assert.equal(listResponse.status, 200);
      assert.deepEqual(
        listPayload.data.plans.map((plan: { id: string }) => plan.id),
        [createPayload.plan.id],
      );
      assert.deepEqual(listPayload.data.plans[0].priorityRules, { modelFamilies: ["seedance"] });
      assert.equal(meResponse.status, 200);
      assert.equal(mePayload.data.permissions.includes("membership.plan.write"), true);
      assert.equal(mePayload.data.permissions.includes("settings.write"), false);
    } finally {
      await server.close();
    }
  });

  it("lets finance admins delete membership plans so the admin and frontend lists stop showing them", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "finance_admin",
    });

    try {
      const userCookie = await login(db, server.origin, "13800138000");
      const planBody = {
        code: `professional_delete_${randomUUID().slice(0, 8)}`,
        displayName: "Professional Delete Test",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 19900,
        currency: "CNY",
        giftCredits: 100,
        seatLimit: 50,
        entitlements: ["team_member_management"],
        priorityRules: {},
        displayMetadata: { sortOrder: 20 },
        status: "active",
        reason: "Create plan for deletion",
      };
      const createResponse = await fetch(`${server.origin}/api/admin/membership/plans`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-membership-plan-delete-create",
          cookie,
        },
        body: JSON.stringify(planBody),
      });
      const createPayload = await createResponse.json();

      const deleteResponse = await fetch(`${server.origin}/api/admin/membership/plans/${createPayload.plan.id}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-membership-plan-delete",
          cookie,
        },
        body: JSON.stringify({ reason: "删除不再售卖的会员套餐" }),
      });
      const deletePayload = await deleteResponse.json();
      const listResponse = await fetch(`${server.origin}/api/admin/membership/plans`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();
      const archivedResponse = await fetch(`${server.origin}/api/admin/membership/plans?includeArchived=1`, {
        headers: { cookie },
      });
      const archivedPayload = await archivedResponse.json();
      const purchasableResponse = await fetch(`${server.origin}/api/membership/plans`, {
        headers: { cookie: userCookie },
      });
      const purchasablePayload = await purchasableResponse.json();

      assert.equal(createResponse.status, 200, JSON.stringify(createPayload));
      assert.equal(deleteResponse.status, 200);
      assert.equal(deletePayload.plan.status, "archived");
      assert.equal(listResponse.status, 200);
      assert.equal(listPayload.data.plans.some((plan: { id: string }) => plan.id === createPayload.plan.id), false);
      assert.equal(archivedResponse.status, 200);
      assert.equal(archivedPayload.data.plans.some((plan: { id: string }) => plan.id === createPayload.plan.id), true);
      assert.equal(purchasableResponse.status, 200);
      assert.equal(
        purchasablePayload.data.plans.some((plan: { id: string }) => plan.id === createPayload.plan.id),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("lets finance admins manage direct recharge packages through a dedicated admin route", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "finance_admin",
    });

    try {
      await db.query(
        `
          INSERT INTO credit_packages (
            id,
            code,
            display_name,
            credits,
            amount_minor,
            currency,
            metadata_json,
            status
          )
          VALUES (
            '90000000-0000-4000-8000-000000099001',
            'legacy_bonus_10',
            'Legacy Bonus',
            10,
            100,
            'CNY',
            '{}'::jsonb,
            'active'
          )
        `,
      );

      const packageBody = {
        code: `direct_recharge_${randomUUID().slice(0, 8)}`,
        displayName: "500 积分直充",
        subtitle: "仅增加积分，不延长会员有效期",
        credits: 500,
        amountMinor: 19900,
        currency: "CNY",
        badge: "推荐",
        sortOrder: 20,
        status: "active",
        reason: "Create direct recharge package",
      };
      const createResponse = await fetch(`${server.origin}/api/admin/direct-recharge/packages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-direct-recharge-500",
          cookie,
        },
        body: JSON.stringify(packageBody),
      });
      const createPayload = await createResponse.json();

      const listResponse = await fetch(`${server.origin}/api/admin/direct-recharge/packages`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();

      assert.equal(createResponse.status, 200, JSON.stringify(createPayload));
      assert.equal(createPayload.package.displayName, "500 积分直充");
      assert.equal(createPayload.package.credits, 500);
      assert.equal(createPayload.package.giftCredits, 0);
      assert.deepEqual(createPayload.package.metadata, { kind: "direct_recharge" });
      assert.equal(listResponse.status, 200);
      assert.deepEqual(
        listPayload.data.packages.map((item: { code: string }) => item.code),
        [packageBody.code],
      );
      assert.equal(
        listPayload.data.packages.some((item: { code: string }) => item.code === "legacy_bonus_10"),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("lets finance admins delete direct recharge packages so users can no longer buy them", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "finance_admin",
    });

    try {
      const userCookie = await login(db, server.origin, "13800138000");
      const packageBody = {
        code: `direct_recharge_delete_${randomUUID().slice(0, 8)}`,
        displayName: "500 积分直充删除测试",
        subtitle: "仅增加积分，不延长会员有效期",
        credits: 500,
        amountMinor: 19900,
        currency: "CNY",
        sortOrder: 20,
        status: "active",
        reason: "Create direct recharge package for deletion",
      };
      const createResponse = await fetch(`${server.origin}/api/admin/direct-recharge/packages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-direct-recharge-delete-create",
          cookie,
        },
        body: JSON.stringify(packageBody),
      });
      const createPayload = await createResponse.json();

      const deleteResponse = await fetch(`${server.origin}/api/admin/direct-recharge/packages/${createPayload.package.id}`, {
        method: "DELETE",
        headers: {
          "idempotency-key": "finance-direct-recharge-delete",
          cookie,
        },
      });
      const deletePayload = await deleteResponse.json();
      const listResponse = await fetch(`${server.origin}/api/admin/direct-recharge/packages`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();
      const archivedResponse = await fetch(`${server.origin}/api/admin/direct-recharge/packages?includeArchived=1`, {
        headers: { cookie },
      });
      const archivedPayload = await archivedResponse.json();
      const userPackagesResponse = await fetch(`${server.origin}/api/billing/packages`, {
        headers: { cookie: userCookie },
      });
      const userPackagesPayload = await userPackagesResponse.json();

      assert.equal(createResponse.status, 200, JSON.stringify(createPayload));
      assert.equal(deleteResponse.status, 200);
      assert.equal(deletePayload.package.status, "archived");
      assert.equal(listResponse.status, 200);
      assert.equal(listPayload.data.packages.some((item: { id: string }) => item.id === createPayload.package.id), false);
      assert.equal(archivedResponse.status, 200);
      assert.equal(
        archivedPayload.data.packages.some((item: { id: string }) => item.id === createPayload.package.id),
        true,
      );
      assert.equal(userPackagesResponse.status, 200);
      assert.equal(
        userPackagesPayload.packages.some((item: { id: string }) => item.id === createPayload.package.id),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("accepts direct recharge package saves with an optional validity window from the admin drawer", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "finance_admin",
    });

    try {
      const response = await fetch(`${server.origin}/api/admin/direct-recharge/packages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-direct-recharge-validity-window",
          cookie,
        },
        body: JSON.stringify({
          code: "direct_recharge_500",
          displayName: "500 积分直充",
          subtitle: "仅增加积分，不延长会员有效期",
          credits: 500,
          amountMinor: 20000,
          currency: "CNY",
          badge: null,
          sortOrder: 100,
          status: "active",
          validFrom: "2026-06-09T00:00:00.000Z",
          validUntil: null,
          metadata: { kind: "direct_recharge" },
          reason: "Create direct recharge package with validity window",
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 200, JSON.stringify(payload));
      assert.equal(payload.package.code, "direct_recharge_500");
      assert.equal(payload.package.amountMinor, 20000);
      assert.equal(payload.package.validFrom, "2026-06-09T00:00:00.000Z");
      assert.equal(payload.package.validUntil, null);
      assert.deepEqual(payload.package.metadata, { kind: "direct_recharge" });
    } finally {
      await server.close();
    }
  });

  it("reports a readable conflict when a direct recharge package code already exists", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "finance_admin",
    });

    const body = {
      code: "direct_recharge_500",
      displayName: "500 积分直充",
      credits: 500,
      amountMinor: 20000,
      currency: "CNY",
      sortOrder: 100,
      status: "active",
      metadata: { kind: "direct_recharge" },
      reason: "Create direct recharge package conflict fixture",
    };

    try {
      const firstResponse = await fetch(`${server.origin}/api/admin/direct-recharge/packages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-direct-recharge-conflict-first",
          cookie,
        },
        body: JSON.stringify(body),
      });
      const conflictResponse = await fetch(`${server.origin}/api/admin/direct-recharge/packages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "finance-direct-recharge-conflict-second",
          cookie,
        },
        body: JSON.stringify({ ...body, displayName: "重复编码档位" }),
      });
      const conflictPayload = await conflictResponse.json();

      assert.equal(firstResponse.status, 200, await firstResponse.text());
      assert.equal(conflictResponse.status, 409);
      assert.equal(conflictPayload.error.code, "credit_package_code_conflict");
      assert.equal(conflictPayload.error.message, "credit package code already exists");
    } finally {
      await server.close();
    }
  });

  it("requires idempotency keys for membership plans writes", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "finance_admin",
    });

    try {
      const response = await fetch(`${server.origin}/api/admin/membership/plans`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          code: "professional_monthly_missing_key",
          displayName: "Professional Monthly",
          tier: "professional",
          periodUnit: "month",
          periodCount: 1,
          amountMinor: 19900,
          currency: "CNY",
          giftCredits: 100,
          seatLimit: 50,
          status: "active",
          reason: "Create plan without idempotency key",
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(payload, { error: "idempotency_key_required" });
    } finally {
      await server.close();
    }
  });

  it("forbids non-finance roles from writing membership plans", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "support_admin",
    });

    try {
      const response = await fetch(`${server.origin}/api/admin/membership/plans`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "support-admin-membership-plan-write",
          cookie,
        },
        body: JSON.stringify({
          code: "professional_monthly_forbidden",
          displayName: "Professional Monthly",
          tier: "professional",
          periodUnit: "month",
          periodCount: 1,
          amountMinor: 19900,
          currency: "CNY",
          giftCredits: 100,
          seatLimit: 50,
          status: "active",
          reason: "Support admin should not write membership plans",
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 403);
      assert.equal(payload.error.code, "admin_forbidden");
    } finally {
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
        VALUES ($1, '13900000001', 'Admin Risk Payment User', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [paymentIssueUserId],
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
      ) VALUES ($1, $2, 'ORD-RISK-PAID-WITHOUT-CREDIT', $3, '{"code":"risk_issue_88","credits":88,"amountMinor":8800,"currency":"CNY"}'::jsonb, 88, 8800, 'CNY', 'paid', '2026-06-05T00:00:00.000Z', '2026-06-04T12:00:00.000Z', '83400000-0000-4000-8000-000000000001')
      `,
    [paymentIssueOrderId,
      paymentIssueUserId,
      paymentIssuePackageId],
    );
    await db.query(
      `
        INSERT INTO payment_intents (
        id,
        order_id,
        provider,
        product_mode,
        status,
        amount_minor,
        currency,
        merchant_order_no,
        provider_trade_id,
        provider_payload_hash,
        provider_safe_metadata_json,
        submitted_at,
        succeeded_at,
        expires_at
      ) VALUES ('83400000-0000-4000-8000-000000000001', $1, 'wechat_pay', 'native_qr', 'succeeded', 8800, 'CNY', 'ORD-RISK-PAID-WITHOUT-CREDIT', 'wx-risk-paid-without-credit', 'payload-hash', '{}'::jsonb, '2026-06-04T11:59:00.000Z', '2026-06-04T12:00:00.000Z', '2026-06-05T00:00:00.000Z')
      `,
    [paymentIssueOrderId],
    );
    await db.query(
      `
        INSERT INTO payment_provider_events (
        id,
        order_id,
        payment_intent_id,
        provider,
        provider_event_dedup_key,
        merchant_order_no,
        provider_trade_id,
        event_type,
        signature_status,
        processing_status,
        raw_payload_hash,
        normalized_payload_json,
        ack_status,
        failure_code,
        received_at,
        processed_at,
        created_at,
        updated_at
      ) VALUES ('83400000-0000-4000-8000-000000000002', $1, '83400000-0000-4000-8000-000000000001', 'wechat_pay', 'wechat-risk-paid-event-1', 'ORD-RISK-PAID-WITHOUT-CREDIT', 'wx-risk-paid-without-credit', 'payment_succeeded', 'verified', 'processed', 'payload-hash', '{}'::jsonb, 'sent_success', NULL, '2026-06-04T12:00:00.000Z', '2026-06-04T12:00:00.000Z', '2026-06-04T12:00:00.000Z', '2026-06-04T12:00:00.000Z')
      `,
    [paymentIssueOrderId],
    );
    await db.query(
      `
        INSERT INTO payment_risk_events (
          id,
          user_id,
          risk_type,
          severity,
          decision,
          status,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (
          '83000000-0000-4000-8000-000000000001',
          $1,
          'amount_mismatch',
          'critical',
          'manual_review',
          'open',
          '{"provider":"paylab","orderNo":"PAY-1001"}'::jsonb,
          '2026-06-04T09:00:00.000Z',
          '2026-06-04T09:00:00.000Z'
        ), (
          '83000000-0000-4000-8000-000000000002',
          $1,
          'duplicate_trade',
          'warning',
          'allow',
          'reviewed',
          '{"provider":"paylab","orderNo":"PAY-1002"}'::jsonb,
          '2026-06-04T10:00:00.000Z',
          '2026-06-04T10:00:00.000Z'
        )
      `,
      [paymentIssueUserId],
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
        INSERT INTO payment_risk_events (
        id,
        risk_type,
        severity,
        decision,
        status,
        metadata_json,
        created_at,
        updated_at
      ) VALUES ('83000000-0000-4000-8000-000000000301', 'signature_invalid', 'critical', 'manual_review', 'open', '{"provider":"paylab","token":"secret-token","orderNo":"PAY-CSV-1"}'::jsonb, '2026-06-04T09:00:00.000Z', '2026-06-04T09:00:00.000Z')
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
        risk_type,
        severity,
        decision,
        status,
        metadata_json,
        created_at,
        updated_at
      ) VALUES ('83000000-0000-4000-8000-000000000101', 'amount_mismatch', 'critical', 'manual_review', 'open', '{"provider":"paylab","orderNo":"PAY-2001"}'::jsonb, '2026-06-04T10:00:00.000Z', '2026-06-04T10:00:00.000Z')
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
        VALUES ($1, '13999999001', '后台运营目标用户', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [adminOpsUserId],
    );


    await db.query(
      `
        INSERT INTO workflows (
        id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id
      ) VALUES ($1, 'shot.image.generate', 'failed', '{}'::jsonb, $2)
      `,
    [workflowId,
      adminOpsUserId],
    );
    await db.query(
      `
        INSERT INTO tasks (
        id,
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
      ) VALUES ($1, $2, 'generate_shot_image', 'failed', 'generation-submit-image', '{}'::jsonb, 'shot', $1, 2, 1, 'provider_timeout')
      `,
    [failedTaskId,
      workflowId],
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
      ) VALUES ($1, $2, 'ORD-ADMIN-OPS-PAID-1', $3, '{"code":"admin_ops_120","credits":120,"amountMinor":9900,"currency":"CNY"}'::jsonb, 120, 9900, 'CNY', 'paid', '2026-06-05T00:00:00.000Z', '2026-06-04T11:00:00.000Z', '89000000-0000-4000-8000-000000000001')
      `,
    [paidOrderId,
      adminOpsUserId,
      packageId],
    );
    await db.query(
      `
        INSERT INTO payment_intents (
        id,
        order_id,
        provider,
        product_mode,
        status,
        amount_minor,
        currency,
        merchant_order_no,
        provider_trade_id,
        provider_payload_hash,
        provider_safe_metadata_json,
        submitted_at,
        succeeded_at,
        expires_at
      ) VALUES ('89000000-0000-4000-8000-000000000001', $1, 'wechat_pay', 'native_qr', 'succeeded', 9900, 'CNY', 'ORD-ADMIN-OPS-PAID-1', 'wx-admin-ops-paid-1', 'payload-hash', '{}'::jsonb, '2026-06-04T10:59:00.000Z', '2026-06-04T11:00:00.000Z', '2026-06-05T00:00:00.000Z')
      `,
    [paidOrderId],
    );
    await db.query(
      `
        INSERT INTO payment_provider_events (
        id,
        order_id,
        payment_intent_id,
        provider,
        provider_event_dedup_key,
        merchant_order_no,
        provider_trade_id,
        event_type,
        signature_status,
        processing_status,
        raw_payload_hash,
        normalized_payload_json,
        ack_status,
        failure_code,
        received_at,
        processed_at,
        created_at,
        updated_at
      ) VALUES ('89000000-0000-4000-8000-000000000002', $1, '89000000-0000-4000-8000-000000000001', 'wechat_pay', 'wechat-admin-ops-paid-event-1', 'ORD-ADMIN-OPS-PAID-1', 'wx-admin-ops-paid-1', 'payment_succeeded', 'verified', 'processed', 'payload-hash', '{}'::jsonb, 'sent_success', NULL, '2026-06-04T11:00:00.000Z', '2026-06-04T11:00:00.000Z', '2026-06-04T11:00:00.000Z', '2026-06-04T11:00:00.000Z')
      `,
    [paidOrderId],
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
      const user = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [adminOpsUserId],
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type IN ('ops.task_retry_requested', 'ops.payment_paid_without_credit_repaired')
          ORDER BY event_type ASC
        `,
      );

      assert.equal(missingRetryIdempotency.status, 400);
      assert.deepEqual(missingRetryIdempotencyPayload, { error: "idempotency_key_required" });
      assert.equal(retryResponse.status, 200, JSON.stringify(retryPayload));
      assert.equal(retryPayload.data.task.id, failedTaskId);
      assert.equal(retryPayload.data.task.status, "queued");
      assert.deepEqual(task.rows, [{ status: "queued", failure_code: null }]);
      assert.equal(repairResponse.status, 200);
      assert.equal(repairPayload.data.creditGrant.amount, 120);
      assert.ok(order.rows[0]?.credit_grant_ledger_entry_id);
      assert.equal(user.rows[0]?.credit_balance_cached, 120);
      assert.deepEqual(audit.rows, [
        { event_type: "ops.payment_paid_without_credit_repaired", reason: "支付成功但积分消费者未执行" },
        { event_type: "ops.task_retry_requested", reason: "供应商超时已恢复" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("does not repair membership orders through documented legacy credit repair route", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    const adminOpsUserId = "84000000-0000-4000-8000-000000000101";
    const membershipPlanId = "87000000-0000-4000-8000-000000000101";
    const membershipOrderId = "88000000-0000-4000-8000-000000000101";

    await db.query(
      `
        INSERT INTO users (id, phone_e164, display_name, status)
        VALUES ($1, '13999999101', '后台会员订单用户', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [adminOpsUserId],
    );

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
          gift_credits,
          seat_limit,
          status
        ) VALUES (
          $1,
          'admin_ops_membership',
          'Admin Ops Membership',
          'professional',
          'month',
          1,
          19900,
          10,
          5,
          'active'
        )
      `,
      [membershipPlanId],
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
      ) VALUES ($1, $2, 'ORD-ADMIN-OPS-MEMBERSHIP-1', 'membership_plan', $3, '{}'::jsonb, '{"code":"admin_ops_membership","giftCredits":10,"amountMinor":19900,"currency":"CNY"}'::jsonb, 10, 19900, 'CNY', 'paid', '2026-06-05T00:00:00.000Z', '2026-06-04T11:00:00.000Z', '89000000-0000-4000-8000-000000000101')
      `,
    [membershipOrderId,
      adminOpsUserId,
      membershipPlanId],
    );

    try {
      const repairResponse = await fetch(
        `${server.origin}/api/admin/ops/payments/${membershipOrderId}/repair-credit`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-platform-membership-payment-repair",
            cookie,
          },
          body: JSON.stringify({ reason: "会员订单不能走旧积分补发" }),
        },
      );
      const repairPayload = await repairResponse.json();

      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [membershipOrderId],
      );
      const user = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [adminOpsUserId],
      );
      const ledgerCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order' AND source_id = $1",
        [membershipOrderId],
      );

      assert.equal(repairResponse.status, 404);
      assert.equal(repairPayload.error, "payment_issue_not_found");
      assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, null);
      assert.equal(user.rows[0]?.credit_balance_cached, 0);
      assert.equal(ledgerCount.rows[0]?.count, 0);
    } finally {
      await server.close();
    }
  });

  it("does not repair failed payments through documented credit repair route", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);
    const adminOpsUserId = "84000000-0000-4000-8000-000000000201";
    const packageId = "87000000-0000-4000-8000-000000000201";
    const failedOrderId = "88000000-0000-4000-8000-000000000201";
    const failedIntentId = "89000000-0000-4000-8000-000000000201";
    const failedProviderEventId = "89000000-0000-4000-8000-000000000202";

    await db.query(
      `
        INSERT INTO users (id, phone_e164, display_name, status)
        VALUES ($1, '13999999201', '后台失败支付用户', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [adminOpsUserId],
    );

    await db.query(
      `
        INSERT INTO credit_packages (
          id, code, display_name, credits, amount_minor, currency, status
        ) VALUES ($1, 'admin_ops_failed_120', 'Admin Ops Failed 120', 120, 9900, 'CNY', 'active')
      `,
      [packageId],
    );
    await db.query(
      `
        INSERT INTO billing_orders (
        id,
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
      ) VALUES ($1, $2, 'ORD-ADMIN-OPS-FAILED-MARKED-PAID-1', $3, '{"code":"admin_ops_failed_120","credits":120,"amountMinor":9900,"currency":"CNY"}'::jsonb, 120, 9900, 'CNY', 'paid', '2026-06-05T00:00:00.000Z', '2026-06-04T11:00:00.000Z', $4)
      `,
    [failedOrderId,
      adminOpsUserId,
      packageId,
      failedIntentId],
    );
    await db.query(
      `
        INSERT INTO payment_intents (
        id,
        order_id,
        provider,
        product_mode,
        status,
        amount_minor,
        currency,
        merchant_order_no,
        provider_trade_id,
        provider_payload_hash,
        provider_safe_metadata_json,
        submitted_at,
        expires_at
      ) VALUES ($1, $2, 'wechat_pay', 'native_qr', 'failed', 9900, 'CNY', 'ORD-ADMIN-OPS-FAILED-MARKED-PAID-1', 'wx-admin-ops-failed-1', 'payload-hash', '{}'::jsonb, '2026-06-04T10:59:00.000Z', '2026-06-05T00:00:00.000Z')
      `,
    [failedIntentId,
      failedOrderId],
    );
    await db.query(
      `
        INSERT INTO payment_provider_events (
        id,
        order_id,
        payment_intent_id,
        provider,
        provider_event_dedup_key,
        merchant_order_no,
        provider_trade_id,
        event_type,
        signature_status,
        processing_status,
        raw_payload_hash,
        normalized_payload_json,
        ack_status,
        failure_code,
        received_at,
        processed_at,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, 'wechat_pay', 'wechat-admin-ops-failed-event-1', 'ORD-ADMIN-OPS-FAILED-MARKED-PAID-1', 'wx-admin-ops-failed-1', 'payment_failed', 'verified', 'processed', 'payload-hash', '{}'::jsonb, 'sent_success', NULL, '2026-06-04T11:00:00.000Z', '2026-06-04T11:00:00.000Z', '2026-06-04T11:00:00.000Z', '2026-06-04T11:00:00.000Z')
      `,
    [failedProviderEventId,
      failedOrderId,
      failedIntentId],
    );

    try {
      const repairResponse = await fetch(
        `${server.origin}/api/admin/ops/payments/${failedOrderId}/repair-credit`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-platform-failed-payment-repair",
            cookie,
          },
          body: JSON.stringify({ reason: "失败支付不能补发积分" }),
        },
      );
      const repairPayload = await repairResponse.json();

      const ledgerCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order' AND source_id = $1",
        [failedOrderId],
      );
      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [failedOrderId],
      );

      assert.equal(repairResponse.status, 409);
      assert.equal(repairPayload.error, "payment_issue_not_repairable");
      assert.equal(ledgerCount.rows[0]?.count, 0);
      assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, null);
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
      assert.equal(typeof overviewPayload.data.metrics.generationSucceededToday, "number");
      assert.equal(typeof overviewPayload.data.metrics.generationFailedToday, "number");
      assert.equal(typeof overviewPayload.data.metrics.generationInProgressToday, "number");
      assert.equal(typeof overviewPayload.data.metrics.userCount, "number");
      assert.equal(typeof overviewPayload.data.metrics.activeUserCountToday, "number");
      assert.equal(typeof overviewPayload.data.metrics.creditsConsumedToday, "number");
      assert.equal(typeof overviewPayload.data.metrics.paidOrdersToday, "number");
      assert.equal(typeof overviewPayload.data.metrics.paidOrderAmountTotalMinor, "number");
      assert.equal(typeof overviewPayload.data.metrics.paidOrderAmountMonthMinor, "number");
      assert.equal(typeof overviewPayload.data.metrics.paidOrderAmountTodayMinor, "number");
      assert.equal(typeof overviewPayload.data.metrics.riskPendingCount, "number");
      assert.equal(typeof overviewPayload.data.metrics.failedTaskCount, "number");
      assert.equal(typeof overviewPayload.data.metrics.activeMembershipCount, "number");
      assert.equal(typeof overviewPayload.data.metrics.projectCount, "number");
      assert.equal(typeof overviewPayload.data.metrics.projectsCreatedToday, "number");
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

  it("serves sms records to admins with audit permission", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db);

    try {
      await db.query(
        `
          INSERT INTO sms_send_records (
            id,
            phone_e164,
            verification_code,
          sms_content,
          provider,
          status,
          ip_address,
          user_agent_hash,
          created_at
        ) VALUES (
            $1,
            '13800138000',
            '123456',
            '【登录验证】验证码 123456，5 分钟内有效。',
            'dev',
            'sent',
            '203.0.113.10',
            'hash-ua',
            now() - interval '2 seconds'
          )
        `,
        [randomUUID()],
      );
      await db.query(
        `
          INSERT INTO sms_send_records (
            id,
            phone_e164,
            verification_code,
            sms_content,
            provider,
            status,
            ip_address,
            user_agent_hash,
            created_at
          ) VALUES (
            $1,
            '18612345678',
            '654321',
            '【登录验证】验证码 654321，5 分钟内有效。',
            'tencent',
            'sent',
            '198.51.100.42',
            'hash-ua-real',
            now() - interval '1 second'
          )
        `,
        [randomUUID()],
      );
      await db.query(
        `
          INSERT INTO sms_send_records (
            id,
            phone_e164,
            verification_code,
            sms_content,
            provider,
            status,
            ip_address,
            user_agent_hash,
            error_code,
            created_at
          ) VALUES
          (
            $1,
            '18575211874',
            '111111',
            '【登录验证】验证码 111111，5 分钟内有效。',
            'dev',
            'failed',
            '127.0.0.1',
            'hash-ua-local-dev',
            'dev_sms_failed',
            now()
          ),
          (
            $2,
            '18575211874',
            '222222',
            '【登录验证】验证码 222222，5 分钟内有效。',
            'tencent',
            'failed',
            '127.0.0.1',
            'hash-ua-local-tencent',
            'FailedOperation.SignatureIncorrectOrUnapproved',
            now()
          )
        `,
        [randomUUID(), randomUUID()],
      );

      const forbidden = await fetch(`${server.origin}/api/admin/sms-records`);
      const allowed = await fetch(`${server.origin}/api/admin/sms-records?range=all`, {
        headers: { cookie },
      });
      const payload = await allowed.json();

      assert.equal(forbidden.status, 401);
      assert.equal(allowed.status, 200);
      assert.equal(Array.isArray(payload.data), true);
      assert.equal(payload.meta.page, 1);
      assert.equal(payload.meta.pageSize, 20);
      assert.equal(payload.meta.total, 3);
      assert.equal(payload.data.length, 3);
      const visibleRecords = payload.data.map((item: { phone: string; verificationCode: string; smsContent: string }) => ({
        phone: item.phone,
        verificationCode: item.verificationCode,
        smsContent: item.smsContent,
      }));
      assert.equal(visibleRecords.every((item) => item.verificationCode.length > 0), true);
      assert.equal(visibleRecords.every((item) => item.smsContent.length > 0), true);
      const localDevRecord = payload.data.find((item: { provider: string }) => item.provider === "dev");
      const localTencentRecord = payload.data.find((item: { errorCode: string }) => (
        item.errorCode === "FailedOperation.SignatureIncorrectOrUnapproved"
      ));
      const sentTencentRecord = payload.data.find((item: { phone: string }) => (
        item.phone === "18612345678"
      ));
      assert.equal(localDevRecord?.ipAddress, "127.0.0.1");
      assert.equal(localDevRecord?.status, "failed");
      assert.equal(localTencentRecord?.ipAddress, "127.0.0.1");
      assert.equal(sentTencentRecord?.verificationCode, "654321");
      assert.equal(sentTencentRecord?.smsContent, "【登录验证】验证码 654321，5 分钟内有效。");
      assert.equal(sentTencentRecord?.ipAddress, "198.51.100.42");
    } finally {
      await server.close();
    }
  });

  it("lets admins use test SMS records when Tencent SMS is disabled", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, {
      serverOptions: {
        env: {
          NODE_ENV: "test",
          TENCENT_SMS_ENABLED: "false",
        },
      },
    });

    try {
      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ phone: "18575211874" }),
      });
      const requested = await requestResponse.json();
      const challengeResponse = await fetch(
        `${server.origin}/api/auth/dev/challenges/${encodeURIComponent(requested.challengeId)}`,
      );
      const challenge = await challengeResponse.json();
      const recordsResponse = await fetch(`${server.origin}/api/admin/sms-records?range=all`, {
        headers: { cookie },
      });
      const records = await recordsResponse.json();
      const testRecord = records.data.find((item: { phone: string }) => item.phone === "18575211874");

      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "18575211874",
          code: challenge.code,
        }),
      });
      const storedRecord = await db.query<{
        verification_code: string | null;
        sms_content: string | null;
      }>(
        `SELECT verification_code, sms_content
         FROM sms_send_records
         WHERE challenge_id = $1`,
        [requested.challengeId],
      );
      const createdUser = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM users WHERE phone_e164 = $1",
        ["18575211874"],
      );

      assert.equal(requestResponse.status, 200);
      assert.equal(challengeResponse.status, 200);
      assert.equal(recordsResponse.status, 200);
      assert.match(challenge.code ?? "", /^\d{6}$/);
      assert.equal(testRecord?.verificationCode, challenge.code);
      assert.equal(testRecord?.smsContent, `【登录验证】验证码 ${challenge.code}，5 分钟内有效。`);
      assert.equal(testRecord?.status, "test");
      assert.equal(storedRecord.rows[0]?.verification_code, challenge.code);
      assert.equal(storedRecord.rows[0]?.sms_content, `【登录验证】验证码 ${challenge.code}，5 分钟内有效。`);
      assert.equal(verifyResponse.status, 200);
      assert.equal(createdUser.rows[0]?.count, 1);
    } finally {
      await server.close();
    }
  });

  it("lets super admins manage official library assets through admin HTTP routes", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, { role: "super_admin" });

    try {
      const createResponse = await fetch(`${server.origin}/api/admin/official-assets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-official-asset-create-http-spec",
          cookie,
        },
        body: JSON.stringify({
          category: "prop",
          folder: "后台道具",
          name: "测试令牌",
          previewUrl: "/uploads/official-assets/token-card.png",
          storageObjectKey: "official-assets/token-card.png",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          display: {
            title: "测试令牌",
            description: "后台 HTTP 管理的详情文案",
          },
          detailViewItems: [
            {
              key: "main",
              label: "主图",
              imageUrl: "/uploads/official-assets/token-main.png",
              isDefault: true,
            },
          ],
        }),
      });
      const createPayload = await createResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createPayload.data.category, "prop");
      assert.equal(createPayload.data.latestVersion.versionNumber, 1);

      const updateResponse = await fetch(
        `${server.origin}/api/admin/official-assets/${createPayload.data.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-official-asset-update-http-spec",
            cookie,
          },
          body: JSON.stringify({
            name: "测试令牌已更新",
            previewUrl: "/uploads/official-assets/token-card-v2.png",
            storageObjectKey: "official-assets/token-card-v2.png",
            display: {
              title: "测试令牌已更新",
              description: "管理员更新后的详情文案",
            },
            detailViewItems: [
              {
                key: "main",
                label: "新版主图",
                imageUrl: "/uploads/official-assets/token-main-v2.png",
                isDefault: true,
              },
            ],
          }),
        },
      );
      const updatePayload = await updateResponse.json();

      assert.equal(updateResponse.status, 200);
      assert.equal(updatePayload.data.name, "测试令牌已更新");
      assert.equal(updatePayload.data.latestVersion.versionNumber, 2);
      assert.equal(updatePayload.data.latestVersion.metadata.display.description, "管理员更新后的详情文案");
      assert.equal(
        updatePayload.data.latestVersion.metadata.detailViews.main,
        "/uploads/official-assets/token-main-v2.png",
      );

      const clearResponse = await fetch(
        `${server.origin}/api/admin/official-assets/${createPayload.data.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "admin-official-asset-clear-http-spec",
            cookie,
          },
          body: JSON.stringify({
            name: "测试令牌已更新",
            description: "",
            previewUrl: "/uploads/official-assets/token-card-v2.png",
            storageObjectKey: "official-assets/token-card-v2.png",
            display: {
              kicker: "",
              title: "",
              description: "",
              metaRows: [],
            },
            detailViewItems: [],
          }),
        },
      );
      const clearPayload = await clearResponse.json();

      assert.equal(clearResponse.status, 200);
      assert.equal(clearPayload.data.description, null);
      assert.equal(clearPayload.data.latestVersion.versionNumber, 3);
      assert.equal(clearPayload.data.latestVersion.metadata.display.kicker, "");
      assert.equal(clearPayload.data.latestVersion.metadata.display.title, "");
      assert.equal(clearPayload.data.latestVersion.metadata.display.description, "");
      assert.deepEqual(clearPayload.data.latestVersion.metadata.display.metaRows, []);
      assert.deepEqual(clearPayload.data.latestVersion.metadata.detailViewItems, []);
      assert.deepEqual(clearPayload.data.latestVersion.metadata.detailViews, {});

      const listResponse = await fetch(`${server.origin}/api/admin/official-assets?category=prop`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();

      assert.equal(listResponse.status, 200);
      assert.ok(listPayload.data.some((asset: { id: string }) => asset.id === createPayload.data.id));
    } finally {
      await server.close();
    }
  });

  it("uploads official asset images through the admin cloud storage route", async () => {
    const db = await createMigratedTestDb();
    const uploadedObjects: Array<{
      bucket: string;
      objectKey: string;
      body: Uint8Array;
      contentType?: string | null;
      contentLength?: number | null;
    }> = [];
    const { server, cookie } = await createLoggedInAdminServer(db, {
      role: "super_admin",
      serverOptions: {
        env: {
          STORAGE_OFFICIAL_ASSET_ROOT_PREFIX: "officialAssets",
        },
        storageRuntime: {
          mode: "cos",
          provider: "tencent_cos",
          bucket: "official-assets-bucket",
          region: "ap-guangzhou",
          publicBaseUrl: "https://cdn.example.test",
          adapter: {
            async createSignedReadUrl(input: { bucket: string; objectKey: string; expiresAt: Date }) {
              return {
                url: `https://signed.example.test/${input.bucket}/${input.objectKey}`,
                expiresAt: input.expiresAt,
              };
            },
            async putObject(input: {
              bucket: string;
              objectKey: string;
              body: Uint8Array;
              contentType?: string | null;
              contentLength?: number | null;
            }) {
              uploadedObjects.push(input);
              return { eTag: "official-etag" };
            },
          },
          stsDurationSeconds: 900,
          localUploadUrlPath: "/api/storage/upload-sessions",
        },
      },
    });

    try {
      const uploadResponse = await fetch(
        `${server.origin}/api/admin/official-assets/uploads?fileName=alchemist.png`,
        {
          method: "POST",
          headers: {
            "content-type": "image/png",
            cookie,
          },
          body: Buffer.from([1, 2, 3, 4]),
        },
      );
      const uploadPayload = await uploadResponse.json();

      assert.equal(uploadResponse.status, 200);
      assert.equal(uploadPayload.data.bucket, "official-assets-bucket");
      assert.match(uploadPayload.data.storageObjectKey, /^officialAssets\/\d{8}\/[0-9a-f-]+-alchemist\.png$/);
      assert.equal(uploadPayload.data.previewUrl, `https://cdn.example.test/${uploadPayload.data.storageObjectKey}`);
      assert.equal(uploadedObjects.length, 1);
      assert.equal(uploadedObjects[0].bucket, "official-assets-bucket");
      assert.equal(uploadedObjects[0].objectKey, uploadPayload.data.storageObjectKey);
      assert.equal(uploadedObjects[0].contentType, "image/png");
      assert.equal(uploadedObjects[0].contentLength, 4);

      const promptCoverResponse = await fetch(
        `${server.origin}/api/admin/prompt-covers/uploads?fileName=cinematic.png`,
        {
          method: "POST",
          headers: { "content-type": "image/png", cookie },
          body: Buffer.from([5, 6, 7]),
        },
      );
      const promptCoverPayload = await promptCoverResponse.json();
      const settingsAssetResponse = await fetch(
        `${server.origin}/api/admin/settings/assets/uploads?fileName=support-qr.png`,
        {
          method: "POST",
          headers: { "content-type": "image/png", cookie },
          body: Buffer.from([8, 9]),
        },
      );
      const settingsAssetPayload = await settingsAssetResponse.json();
      const trackedUploads = await db.query<{
        source_action: string;
        status: string;
        object_key: string;
        admin_upload_kind: string | null;
      }>(
        `
          SELECT
            pur.source_action,
            pur.status,
            pur.object_key,
            so.metadata_json->>'adminUploadKind' AS admin_upload_kind
          FROM project_upload_records pur
          JOIN storage_objects so ON so.id = pur.storage_object_id
          WHERE pur.source_action LIKE 'admin_%_upload'
          ORDER BY pur.source_action ASC
        `,
      );

      assert.equal(promptCoverResponse.status, 200, JSON.stringify(promptCoverPayload));
      assert.match(promptCoverPayload.data.storageObjectKey, /^officialAssets\/promptCovers\/\d{8}\/[0-9a-f-]+-cinematic\.png$/);
      assert.equal(settingsAssetResponse.status, 200, JSON.stringify(settingsAssetPayload));
      assert.match(settingsAssetPayload.data.storageObjectKey, /^officialAssets\/settingsAssets\/\d{8}\/[0-9a-f-]+-support-qr\.png$/);
      assert.equal(uploadedObjects.length, 3);
      assert.deepEqual(
        trackedUploads.rows.map((row) => ({
          sourceAction: row.source_action,
          status: row.status,
          objectKey: row.object_key.split("/")[0],
          kind: row.admin_upload_kind,
        })),
        [
          { sourceAction: "admin_official_asset_upload", status: "uploaded", objectKey: "officialAssets", kind: "official_asset" },
          { sourceAction: "admin_prompt_cover_upload", status: "uploaded", objectKey: "officialAssets", kind: "prompt_cover" },
          { sourceAction: "admin_settings_asset_upload", status: "uploaded", objectKey: "officialAssets", kind: "settings_asset" },
        ],
      );

      const createResponse = await fetch(`${server.origin}/api/admin/official-assets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-official-asset-upload-create-http-spec",
          cookie,
        },
        body: JSON.stringify({
          category: "character",
          folder: "后台上传",
          name: "云端炼金师",
          previewUrl: uploadPayload.data.previewUrl,
          storageObjectKey: uploadPayload.data.storageObjectKey,
          mimeType: uploadPayload.data.mimeType,
          width: 1024,
          height: 1024,
          detailViewItems: [
            {
              key: "main",
              label: "主图",
              imageUrl: uploadPayload.data.previewUrl,
              isDefault: true,
            },
          ],
        }),
      });
      const createPayload = await createResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createPayload.data.latestVersion.storageObjectKey, uploadPayload.data.storageObjectKey);
      assert.equal(createPayload.data.latestVersion.previewUrl, uploadPayload.data.previewUrl);
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

      const secretRevealResponse = await fetch(
        `${server.origin}/api/admin/secret-references/${randomUUID()}/reveal`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "audit-viewer-secret-reveal",
            cookie,
          },
          body: JSON.stringify({ reason: "audit viewer should not reveal secrets" }),
        },
      );
      const secretRevealPayload = await secretRevealResponse.json();

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
      assert.equal(secretRevealResponse.status, 403);
      assert.equal(secretRevealPayload.error.code, "admin_forbidden");
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

  it("lets admins manage official and private prompt marketplace cards without exposing private content", async () => {
    const db = await createMigratedTestDb();
    const { server, cookie } = await createLoggedInAdminServer(db, "super_admin");
    const packageId = randomUUID();
    const privatePromptId = randomUUID();
    const privateOwnerId = randomUUID();
    try {
      await db.query(
        `INSERT INTO prompts (
           id, prompt_category, name, summary, prompt_content, cover_image_url,
           status, is_official, is_published, price_credits, published_at
         ) VALUES (
           $1, 'script', '官方广场剧本提示词', '官方剧本提示词',
           '这是用于官方提示词广场卡片验证的完整提示词正文。',
           '/admin/assets/prompt-covers/official-script.webp', 'enabled', true, true, 0, now()
         )`,
        [packageId],
      );
      await db.query(
        "INSERT INTO users (id, phone_e164, display_name, password_hash, status, credit_balance_cached) VALUES ($1, '13800139001', '私人提示词作者', 'plain:test-password', 'active', 0)",
        [privateOwnerId],
      );
      await db.query(
        `INSERT INTO prompts (
           id, prompt_category, name, summary, prompt_content,
           status, is_official, is_published, price_credits, usage_count, published_at
         ) VALUES (
           $1, 'script', '私人广场剧本提示词', '用户发布的剧本提示词', '这是用户私有的完整提示词正文，后台可以管理状态但不应读取或返回该正文。',
           'enabled', false, true, 6, 3, now()
         )`,
        [privatePromptId],
      );
      await db.query(
        "INSERT INTO prompt_user_links (id, prompt_id, user_id, relation_type, status, added_at, created_at, updated_at) VALUES ($1, $2, $3, 'owner', 'active', now(), now(), now())",
        [randomUUID(), privatePromptId, privateOwnerId],
      );
      const listResponse = await fetch(`${server.origin}/api/admin/prompt-marketplace?category=script&status=published`, {
        headers: { cookie },
      });
      const listPayload = await listResponse.json();
      assert.equal(listResponse.status, 200, JSON.stringify(listPayload));
      const listedItems = listPayload.data?.items ?? listPayload.items ?? listPayload.body?.items ?? [];
      const item = listedItems.find((entry: { title: string }) => entry.title === "官方广场剧本提示词");
      assert.ok(item);
      assert.equal(item.official, true);
      assert.equal(item.priceCredits, 0);
      assert.equal(item.coverImageUrl, "/admin/assets/prompt-covers/official-script.webp");
      const privateItem = listedItems.find((entry: { id: string }) => entry.id === privatePromptId);
      assert.ok(privateItem);
      assert.equal(privateItem.official, false);
      assert.equal(privateItem.ownerUserId, privateOwnerId);
      assert.equal(privateItem.contentVisible, false);
      assert.equal(Object.prototype.hasOwnProperty.call(privateItem, "content"), false);

      const createOfficialResponse = await fetch(`${server.origin}/api/admin/prompt-marketplace/items`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          title: "后台新增人物提示词",
          category: "character_extract",
          summary: "由后台手动新增的人物抽取提示词",
          content: "这是可由后台手动新增并发布的人物抽取提示词完整正文。",
          priceCredits: 8,
          usageCount: 0,
          status: "published",
        }),
      });
      const createOfficialPayload = await createOfficialResponse.json();
      const createdOfficial = createOfficialPayload.data?.item ?? createOfficialPayload.item ?? createOfficialPayload.body?.item;
      assert.equal(createOfficialResponse.status, 201, JSON.stringify(createOfficialPayload));
      assert.equal(createdOfficial?.official, true);
      assert.equal(createdOfficial?.category, "character_extract");
      assert.equal(createdOfficial?.status, "published");

      const updateResponse = await fetch(`${server.origin}/api/admin/prompt-marketplace/items/${item.id}`, {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          title: "编辑后的官方剧本提示词",
          summary: "编辑后的官方剧本提示词简介",
          content: "这是后台编辑后的官方提示词正文。",
          coverImageUrl: "https://example.com/edited-official-cover.png",
          cover_storage_object_id: null,
          priceCredits: 15,
          status: "published",
        }),
      });
      const updatePayload = await updateResponse.json();
      assert.equal(updateResponse.status, 200);
      assert.equal((updatePayload.data?.item ?? updatePayload.item ?? updatePayload.body?.item)?.priceCredits, 15, JSON.stringify(updatePayload));
      assert.equal((updatePayload.data?.item ?? updatePayload.item ?? updatePayload.body?.item)?.title, "编辑后的官方剧本提示词");
      assert.equal((updatePayload.data?.item ?? updatePayload.item ?? updatePayload.body?.item)?.content, "这是后台编辑后的官方提示词正文。");

      const updatePrivateResponse = await fetch(`${server.origin}/api/admin/prompt-marketplace/items/${privatePromptId}`, {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ price_credits: 17, usage_count: 29, is_published: false }),
      });
      const updatePrivatePayload = await updatePrivateResponse.json();
      const updatedPrivate = updatePrivatePayload.data?.item ?? updatePrivatePayload.item ?? updatePrivatePayload.body?.item;
      assert.equal(updatePrivateResponse.status, 200, JSON.stringify(updatePrivatePayload));
      assert.equal(updatedPrivate.priceCredits, 17);
      assert.equal(updatedPrivate.usageCount, 29);
      assert.equal(updatedPrivate.status, "draft");
      assert.equal(updatedPrivate.contentVisible, false);
      assert.equal(Object.prototype.hasOwnProperty.call(updatedPrivate, "content"), false);

      const republishPrivateResponse = await fetch(`${server.origin}/api/admin/prompt-marketplace/items/${privatePromptId}`, {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ isPublished: true }),
      });
      const republishPrivatePayload = await republishPrivateResponse.json();
      assert.equal(republishPrivateResponse.status, 200, JSON.stringify(republishPrivatePayload));
      assert.equal((republishPrivatePayload.data?.item ?? republishPrivatePayload.item ?? republishPrivatePayload.body?.item)?.status, "published");

      const privateOnlyResponse = await fetch(`${server.origin}/api/admin/prompt-marketplace?source=private`, {
        headers: { cookie },
      });
      const privateOnlyPayload = await privateOnlyResponse.json();
      const privateOnlyItems = privateOnlyPayload.data?.items ?? privateOnlyPayload.items ?? privateOnlyPayload.body?.items ?? [];
      assert.equal(privateOnlyResponse.status, 200, JSON.stringify(privateOnlyPayload));
      assert.equal(privateOnlyItems.some((entry: { id: string }) => entry.id === privatePromptId), true);
      assert.equal(privateOnlyItems.every((entry: { official: boolean }) => entry.official === false), true);

      const deletePrivateResponse = await fetch(`${server.origin}/api/admin/prompt-marketplace/items/${privatePromptId}`, {
        method: "DELETE",
        headers: { cookie },
      });
      const deletePrivatePayload = await deletePrivateResponse.json();
      assert.equal(deletePrivateResponse.status, 200, JSON.stringify(deletePrivatePayload));
      assert.equal(deletePrivatePayload.data?.deleted ?? deletePrivatePayload.deleted, true);
      const privateAfterDelete = await fetch(`${server.origin}/api/admin/prompt-marketplace?source=private`, {
        headers: { cookie },
      });
      const privateAfterDeletePayload = await privateAfterDelete.json();
      const remainingPrivateItems = privateAfterDeletePayload.data?.items ?? privateAfterDeletePayload.items ?? [];
      assert.equal(remainingPrivateItems.some((entry: { id: string }) => entry.id === privatePromptId), false);
    } finally {
      await server.close();
    }
  });

async function createLoggedInAdminServer(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  options: string | {
    role?: string;
    serverOptions?: Omit<NonNullable<Parameters<typeof createPhoneAuthDevServer>[0]>, "db">;
  } = {},
) {
  const normalizedOptions = typeof options === "string" ? { role: options } : options;
  const loginName = `admin_${randomUUID().slice(0, 8)}`;
  const password = `Admin-${randomUUID()}-Pwd`;
  const role = normalizedOptions.role ?? "super_admin";
  const server = createPhoneAuthDevServer({ db, ...(normalizedOptions.serverOptions ?? {}) });

  await db.query(
    `
      INSERT INTO admin_accounts (
        id, login_name, password_hash, display_name, status, super_admin_slot
      ) VALUES (
        $1,
        $2,
        'plain:' || $3,
        'Model Admin',
        'active',
        CASE WHEN $4 = 'super_admin' THEN 1 ELSE NULL END
      )
    `,
    [randomUUID(), loginName, password, role],
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

async function login(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  origin: string,
  phone: string,
) {
  const phoneE164 = phone;
  await db.query(
    `
      INSERT INTO users (id, phone_e164, display_name, status)
      VALUES ($1, $2, 'Frontend Buyer', 'active')
      ON CONFLICT (phone_e164)
      DO UPDATE SET status = 'active'
    `,
    [randomUUID(), phoneE164],
  );
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: phone, password: phone.slice(-6) }),
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get("set-cookie") ?? "";
}

async function seedAdminUserListFixture(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const ownerUserId = "93000000-0000-4000-8000-000000000001";
  const groupAdminUserId = "93000000-0000-4000-8000-000000000002";
  const subaccountUserId = "93000000-0000-4000-8000-000000000003";

  await db.query(
    `
      INSERT INTO users (id, email, phone_e164, display_name, status)
      VALUES
        ($1, 'owner@example.test', '13800200001', '白夜工作室', 'active'),
        ($2, 'group@example.test', '13800200002', '分镜组长', 'active'),
        ($3, 'sub@example.test', '13800200003', '子账户 A', 'disabled')
    `,
    [ownerUserId, groupAdminUserId, subaccountUserId],
  );
  await db.query(
    `
      INSERT INTO team_members (
        id,
        user_id,
        member_account,
        member_account_suffix,
        member_login_account,
        member_name,
        member_password_hash,
        member_credits,
        status
      )
      VALUES
        ('96000000-0000-4000-8000-000000000001', $1, 'story-lead', 'u00001', 'story-lead@u00001', '分镜组长', 'hashed-password', 2100, 'active'),
        ('96000000-0000-4000-8000-000000000002', $1, 'story-sub-a', 'u00001', 'story-sub-a@u00001', '子账户 A', 'hashed-password', 680, 'active')
    `,
    [ownerUserId],
  );
  await db.query(
    `
      INSERT INTO credit_reservations (
        id,
        user_id,
        amount_total,
        amount_reserved,
        amount_consumed,
        amount_released,
        status,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id
      )
      VALUES ('97000000-0000-4000-8000-000000000001', $1, 40, 40, 0, 0, 'active', 'admin_test', '97000000-0000-4000-8000-000000000002', '子账户任务冻结', '{"targetTeamMemberId":"96000000-0000-4000-8000-000000000001"}'::jsonb, $1)
    `,
    [ownerUserId],
  );
}
