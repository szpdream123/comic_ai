import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import { createUserPasswordHash, defaultPasswordFromPhone } from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("exposes Loomic brand kit CRUD to a shared main account and protects project selection by role", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
    repairScheduler: { enabled: false },
    storageRuntime: {
      mode: "s3_compatible",
      provider: "brand-test",
      bucket: "creator-test",
      region: "test-region",
      adapter: {
        async createSignedReadUrl({ objectKey, expiresAt }) {
          return { url: `https://brand.test/${objectKey}`, expiresAt };
        },
      },
    },
  });
  const mainUserId = randomUUID();
  const otherUserId = randomUUID();
  const memberId = randomUUID();
  const projectId = randomUUID();
  const sourceProjectId = randomUUID();
  const logoObjectId = randomUUID();
  const mainPhone = "13900000981";
  const otherPhone = "13900000982";
  const memberPassword = "brand-member-secret";
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
        VALUES ($1, $2, 'brandmember', 'u900981', 'brandmember@u900981', 'Brand 成员', $3, 'active')
      `,
      [memberId, mainUserId, await createUserPasswordHash(memberPassword)],
    );
    await db.query(
      `
        INSERT INTO projects (id, name, aspect_ratio, resolution, phase, owner_user_id, created_by_user_id)
        VALUES
          ($1, 'Brand project', '9:16', '1080p', 'script_input', $2, $2),
          ($3, 'Brand source project', '9:16', '1080p', 'script_input', $2, $2)
      `,
      [projectId, mainUserId, sourceProjectId],
    );
    await db.query(
      "INSERT INTO team_member_projects (id, member_id, user_id, project_id, role) VALUES ($1, $2, $3, $4, 'viewer')",
      [randomUUID(), memberId, mainUserId, projectId],
    );
    await db.query(
      `
        INSERT INTO storage_objects
          (id, project_id, bucket, object_key, content_type, size_bytes, created_by_user_id, provider, status)
        VALUES ($1, $2, 'creator-test', 'brand/logo.png', 'image/png', 2048, $3, 'creator-dev', 'available')
      `,
      [logoObjectId, sourceProjectId, mainUserId],
    );

    await server.listen(0);
    const mainCookie = await passwordLogin(server.origin, mainPhone);
    const otherCookie = await passwordLogin(server.origin, otherPhone);
    const memberCookie = await memberLogin(server.origin, "brandmember@u900981", memberPassword);

    assert.equal((await api(server.origin, "/api/creator/brand-kits", "")).status, 401);
    const fontUpload = await api(server.origin, "/api/storage/upload-sessions", mainCookie, {
      method: "POST",
      headers: { "idempotency-key": "brand-font-upload" },
      body: {
        purpose: "new-canvas/brand-font",
        fileName: "Brand.woff2",
        contentType: "font/woff2",
        sizeBytes: 1024,
      },
    });
    assert.equal(fontUpload.status, 200);
    const oversizedFont = await api(server.origin, "/api/storage/upload-sessions", mainCookie, {
      method: "POST",
      headers: { "idempotency-key": "brand-font-too-large" },
      body: {
        purpose: "new-canvas/brand-font",
        fileName: "Huge.woff2",
        contentType: "font/woff2",
        sizeBytes: 10 * 1024 * 1024 + 1,
      },
    });
    assert.equal(oversizedFont.status, 413);
    const created = await api(server.origin, "/api/creator/brand-kits", memberCookie, {
      method: "POST",
      body: { name: "共享品牌" },
    });
    assert.equal(created.status, 201);
    const kitId = String(created.body.data.brandKit.id);

    const mainList = await api(server.origin, "/api/creator/brand-kits", mainCookie);
    assert.equal(mainList.status, 200);
    assert.deepEqual(mainList.body.data.brandKits.map((kit: { id: string }) => kit.id), [kitId]);
    assert.deepEqual((await api(server.origin, "/api/creator/brand-kits", otherCookie)).body.data.brandKits, []);

    const color = await api(server.origin, `/api/creator/brand-kits/${kitId}/assets`, mainCookie, {
      method: "POST",
      body: { asset_type: "color", display_name: "主色", text_content: "#2f80ed" },
    });
    assert.equal(color.status, 201);
    assert.equal(color.body.data.asset.text_content, "#2F80ED");

    const logo = await api(server.origin, `/api/creator/brand-kits/${kitId}/assets`, mainCookie, {
      method: "POST",
      body: { asset_type: "logo", display_name: "主标志", storage_object_id: logoObjectId },
    });
    assert.equal(logo.status, 201);
    assert.equal(logo.body.data.asset.storage_object_id, logoObjectId);
    assert.match(String(logo.body.data.asset.file_url), /.+/);

    const detail = await api(server.origin, `/api/creator/brand-kits/${kitId}`, memberCookie);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.brandKit.assets.length, 2);
    assert.match(String(detail.body.data.brandKit.assets.find((asset: { asset_type: string }) => asset.asset_type === "logo")?.file_url), /^https:\/\/brand\.test\//);
    const foreignDetail = await api(server.origin, `/api/creator/brand-kits/${kitId}`, otherCookie);
    assert.equal(foreignDetail.status, 404);

    const selected = await api(server.origin, `/api/creator/projects/${projectId}/brand-kit`, mainCookie, {
      method: "PATCH",
      body: { brandKitId: kitId },
    });
    assert.equal(selected.status, 200);
    assert.equal(selected.body.data.brandKitId, kitId);

    const viewerRead = await api(server.origin, `/api/creator/projects/${projectId}/brand-kit`, memberCookie);
    assert.equal(viewerRead.status, 200);
    assert.equal(viewerRead.body.data.brandKit.id, kitId);
    const viewerWrite = await api(server.origin, `/api/creator/projects/${projectId}/brand-kit`, memberCookie, {
      method: "PATCH",
      body: { brandKitId: null },
    });
    assert.equal(viewerWrite.status, 403);

    const viewerUpload = await api(server.origin, "/api/storage/upload-sessions", memberCookie, {
      method: "POST",
      headers: { "idempotency-key": "brand-viewer-project-upload" },
      body: {
        projectId,
        purpose: "creator/assets",
        fileName: "viewer-upload.png",
        contentType: "image/png",
        sizeBytes: 1024,
      },
    });
    assert.equal(viewerUpload.status, 403);

    await db.query("UPDATE team_member_projects SET role = 'creator' WHERE member_id = $1 AND project_id = $2", [memberId, projectId]);
    const creatorWrite = await api(server.origin, `/api/creator/projects/${projectId}/brand-kit`, memberCookie, {
      method: "PATCH",
      body: { brandKitId: null },
    });
    assert.equal(creatorWrite.status, 200);
    assert.equal(creatorWrite.body.data.brandKitId, null);

    const duplicated = await api(server.origin, `/api/creator/brand-kits/${kitId}/duplicate`, memberCookie, { method: "POST" });
    assert.equal(duplicated.status, 201);
    assert.equal(duplicated.body.data.brandKit.assets.length, 2);
    assert.equal((await api(server.origin, `/api/creator/brand-kits/${kitId}`, mainCookie, { method: "DELETE" })).status, 200);
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

async function api(
  origin: string,
  path: string,
  cookie: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}
