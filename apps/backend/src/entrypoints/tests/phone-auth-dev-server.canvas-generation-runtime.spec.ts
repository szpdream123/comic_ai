import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import { grantCredits } from "../../modules/credit-billing/credit-ledger.service.ts";
import { createUserPasswordHash, defaultPasswordFromPhone } from "../../modules/identity/team-account-credentials.service.ts";
import { appendCanvasNodeArtifact } from "../../modules/project/creator-canvas-record.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createScopedStorageObject } from "../../modules/storage/storage.service.ts";
import { createPhoneAuthDevServer, isNewCanvasEnabledForActor } from "../phone-auth-dev-server.ts";

it("supports owner and team-member scoped new Canvas rollout", () => {
  const ownerUserId = randomUUID();
  const memberId = randomUUID();
  assert.equal(isNewCanvasEnabledForActor({ NEW_CANVAS_ENABLED: "true" }, { ownerUserId }), true);
  assert.equal(isNewCanvasEnabledForActor({ NEW_CANVAS_ENABLED: "false" }, { ownerUserId }), false);
  assert.equal(isNewCanvasEnabledForActor({
    NEW_CANVAS_ENABLED: "false",
    NEW_CANVAS_ROLLOUT_OWNER_USER_IDS: `other, ${ownerUserId}`,
  }, { ownerUserId }), true);
  assert.equal(isNewCanvasEnabledForActor({
    NEW_CANVAS_ENABLED: "false",
    NEW_CANVAS_ROLLOUT_TEAM_MEMBER_IDS: memberId,
  }, { ownerUserId, actorTeamMemberId: memberId }), true);
});

it("materializes an uploaded style reference as a Canvas-local stable asset", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const phone = `135${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const created = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Style Upload Canvas" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const canvasId = String(created.body.data.project.id);
    const now = new Date();
    const storage = await createScopedStorageObject(db, {
      userId,
      bucket: "canvas-style-reference-test",
      objectName: "style-reference.png",
      contentType: "image/png",
      sizeBytes: 128,
      provider: "creator-dev",
      status: "available",
      metadata: { purpose: "new-canvas/style-reference" },
      createdByUserId: userId,
      now,
    });
    const uploadSessionId = randomUUID();
    await db.query(`
      INSERT INTO storage_upload_sessions (
        id,project_id,storage_object_id,purpose,status,content_type,expected_size_bytes,
        original_file_name,checksum,idempotency_key,expires_at,completed_at,created_by_user_id,created_at
      ) VALUES ($1,NULL,$2,'new-canvas/style-reference','uploaded','image/png',128,
        'style-reference.png',NULL,$3,$4,$5,$6,$7)
    `, [
      uploadSessionId,
      storage.id,
      `canvas-style-reference-test:${randomUUID()}`,
      new Date(now.getTime() + 60_000),
      now,
      userId,
      now,
    ]);
    const materialized = await api(server.origin, `/api/canvas/${canvasId}/style-reference-assets`, cookie, {
      method: "POST",
      body: { uploadSessionId, storageObjectId: storage.id, label: "上传风格图" },
    });
    assert.equal(materialized.status, 201, JSON.stringify(materialized.body));
    const asset = materialized.body.data.asset;
    assert.equal(asset.storageObjectId, storage.id);
    assert.equal(asset.kind, "image");
    assert.match(asset.previewUrl, new RegExp(`/api/storage/objects/${storage.id}/content\\?proxy=1$`));
    const persisted = await db.query<{
      canvas_project_id: string;
      project_id: string | null;
      asset_version_id: string;
      artifact_kind: string;
    }>(`
      SELECT storage.canvas_project_id,storage.project_id,artifact.asset_version_id,artifact.artifact_kind
      FROM storage_objects storage
      JOIN asset_versions version ON version.storage_object_id=storage.id
      JOIN creator_canvas_node_artifacts artifact
        ON artifact.asset_version_id=version.id AND artifact.storage_object_id=storage.id
      WHERE storage.id=$1
    `, [storage.id]);
    assert.deepEqual(persisted.rows, [{
      canvas_project_id: canvasId,
      project_id: null,
      asset_version_id: asset.assetVersionId,
      artifact_kind: "image",
    }]);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("copies an authorized project image into a Canvas style reference without moving its source object", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const phone = `137${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const canvas = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Project Style Import Canvas" },
    });
    assert.equal(canvas.status, 201, JSON.stringify(canvas.body));
    const canvasId = String(canvas.body.data.project.id);
    const project = await api(server.origin, "/api/creator/project/create", cookie, {
      method: "POST",
      headers: { "idempotency-key": `project-style-import:${randomUUID()}` },
      body: { name: "Project Style Source", scriptInput: "第一集", aspectRatio: "9:16", resolution: "1080p" },
    });
    assert.equal(project.status, 200, JSON.stringify(project.body));
    const projectId = String(project.body.project.id);
    const prepared = await api(server.origin, "/api/storage/upload-sessions", cookie, {
      method: "POST",
      headers: { "idempotency-key": `project-style-upload:${randomUUID()}` },
      body: {
        projectId,
        purpose: "asset-import/scene",
        fileName: "style.png",
        contentType: "image/png",
        sizeBytes: 12,
      },
    });
    assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
    const sourceStorageObjectId = String(prepared.body.storageObjectId);
    const uploaded = await fetch(`${server.origin}/api/storage/upload-sessions/${prepared.body.uploadSessionId}/blob`, {
      method: "PUT",
      headers: { "content-type": "image/png", cookie },
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    });
    assert.equal(uploaded.status, 200, await uploaded.text());
    const completed = await api(server.origin, `/api/storage/upload-sessions/${prepared.body.uploadSessionId}/complete`, cookie, {
      method: "POST",
      body: {},
    });
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    const importedProjectAsset = await api(server.origin, "/api/creator/assets/import", cookie, {
      method: "POST",
      body: {
        kind: "scene",
        name: "项目风格图",
        uploadSessionId: prepared.body.uploadSessionId,
        storageObjectId: sourceStorageObjectId,
        mimeType: "image/png",
        width: 100,
        height: 100,
      },
    });
    assert.equal(importedProjectAsset.status, 200, JSON.stringify(importedProjectAsset.body));
    const sourceAssetVersion = await db.query<{ id: string }>(`
      SELECT version.id
      FROM asset_versions version
      JOIN assets asset ON asset.id=version.asset_id
      WHERE asset.project_id=$1 AND version.storage_object_id=$2
      ORDER BY version.created_at DESC
      LIMIT 1
    `, [projectId, sourceStorageObjectId]);
    const sourceAssetVersionId = String(sourceAssetVersion.rows[0]?.id ?? "");
    assert.ok(sourceAssetVersionId);
    const materialized = await api(server.origin, `/api/canvas/${canvasId}/style-reference-assets/import`, cookie, {
      method: "POST",
      body: {
        source: { kind: "project_asset_version", sourceId: sourceAssetVersionId },
        label: "项目风格图",
      },
    });
    assert.equal(materialized.status, 201, JSON.stringify(materialized.body));
    const copiedStorageObjectId = String(materialized.body.data.asset.storageObjectId);
    assert.notEqual(copiedStorageObjectId, sourceStorageObjectId);
    const scopes = await db.query<{ id: string; project_id: string | null; canvas_project_id: string | null }>(
      "SELECT id,project_id,canvas_project_id FROM storage_objects WHERE id=ANY($1::uuid[]) ORDER BY id",
      [[sourceStorageObjectId, copiedStorageObjectId]],
    );
    assert.deepEqual(scopes.rows.sort((left, right) => left.id.localeCompare(right.id)), [
      { id: copiedStorageObjectId, project_id: null, canvas_project_id: canvasId },
      { id: sourceStorageObjectId, project_id: projectId, canvas_project_id: null },
    ].sort((left, right) => left.id.localeCompare(right.id)));
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("copies an authorized project asset version into the team global library without moving its source object", async () => {
  const db = await createMigratedTestDb();
  const sourceBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const copiedBodies: Uint8Array[] = [];
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true", STORAGE_PUBLIC_BASE_URL: "https://team-assets.example.test" },
    repairScheduler: { enabled: false },
    storageRuntime: {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "team-assets-test",
      publicBaseUrl: "https://team-assets.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return { url: `https://project-assets.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
        },
        async putObject(input) {
          copiedBodies.push(new Uint8Array(input.body));
          return { eTag: "copied-project-global-asset" };
        },
      },
    },
    fetchImpl: async () => new Response(sourceBytes, { headers: { "content-type": "image/png" } }),
  });
  const userId = randomUUID();
  const phone = `136${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const project = await api(server.origin, "/api/creator/project/create", cookie, {
      method: "POST",
      headers: { "idempotency-key": `project-global-import:${randomUUID()}` },
      body: { name: "Project Global Source", scriptInput: "第一集", aspectRatio: "9:16", resolution: "1080p" },
    });
    assert.equal(project.status, 200, JSON.stringify(project.body));
    const projectId = String(project.body.project.id);
    const now = new Date();
    const sourceStorage = await createScopedStorageObject(db, {
      userId,
      projectId,
      bucket: "team-assets-test",
      objectName: "project-global-source.png",
      contentType: "image/png",
      sizeBytes: sourceBytes.byteLength,
      provider: "tencent_cos",
      status: "available",
      metadata: {},
      createdByUserId: userId,
      now,
    });
    const sourceAssetId = randomUUID();
    const sourceAssetVersionId = randomUUID();
    await db.query(`
      INSERT INTO assets (id,project_id,asset_type,asset_key,created_by_user_id,created_at,updated_at)
      VALUES ($1,$2,'scene_reference','project-global-scene',$3,$4,$4)
    `, [sourceAssetId, projectId, userId, now]);
    await db.query(`
      INSERT INTO asset_versions (
        id,asset_id,version_number,storage_object_key,storage_object_id,metadata_json,created_by_user_id,created_at
      ) VALUES ($1,$2,1,$3,$4,'{"description":"项目场景","tags":["场景","夜景"]}'::jsonb,$5,$6)
    `, [sourceAssetVersionId, sourceAssetId, sourceStorage.objectKey, sourceStorage.id, userId, now]);
    const imported = await api(server.origin, "/api/creator/team-assets/import-project-asset", cookie, {
      method: "POST",
      body: { assetVersionId: sourceAssetVersionId, name: "全局夜景" },
    });
    assert.equal(imported.status, 201, JSON.stringify(imported.body));
    assert.deepEqual(imported.body.data.asset.tags, ["场景", "夜景"]);
    assert.deepEqual(copiedBodies, [sourceBytes]);
    const targetStorageId = String(imported.body.data.asset.storageObjectId);
    const copied = await db.query<{
      source_project_id: string | null;
      copied_project_id: string | null;
      copied_canvas_project_id: string | null;
      team_storage_object_id: string | null;
    }>(`
      SELECT source.project_id AS source_project_id,
             copied.project_id AS copied_project_id,
             copied.canvas_project_id AS copied_canvas_project_id,
             team.storage_object_id AS team_storage_object_id
      FROM storage_objects source
      JOIN team_assets team ON team.id=$2
      JOIN storage_objects copied ON copied.id=team.storage_object_id
      WHERE source.id=$1
    `, [sourceStorage.id, imported.body.data.asset.id]);
    assert.deepEqual(copied.rows, [{
      source_project_id: projectId,
      copied_project_id: null,
      copied_canvas_project_id: null,
      team_storage_object_id: targetStorageId,
    }]);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("rejects a viewer team member importing a project asset into the team global library", async () => {
  const db = await createMigratedTestDb();
  const sourceBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let copiedObjectCount = 0;
  const server = createPhoneAuthDevServer({
    db,
    seedTeamEntitlements: true,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true", STORAGE_PUBLIC_BASE_URL: "https://team-assets.example.test" },
    repairScheduler: { enabled: false },
    storageRuntime: {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "team-assets-test",
      publicBaseUrl: "https://team-assets.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return { url: `https://project-assets.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
        },
        async putObject() {
          copiedObjectCount += 1;
          return { eTag: "viewer-must-not-copy-project-global-asset" };
        },
      },
    },
    fetchImpl: async () => new Response(sourceBytes, { headers: { "content-type": "image/png" } }),
  });
  const userId = randomUUID();
  const phone = `137${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await db.query(`
      INSERT INTO user_entitlements (id,user_id,entitlement_key,status,source,expires_at,created_at,updated_at)
      VALUES ($1,$2,'team_member_management','active','dev_seed',$3,$4,$4)
    `, [randomUUID(), userId, new Date("2099-01-01T00:00:00.000Z"), new Date()]);
    await db.query("UPDATE users SET team_seat_limit = 2 WHERE id = $1", [userId]);
    await server.listen(0);
    const ownerCookie = await passwordLogin(server.origin, phone);
    const project = await api(server.origin, "/api/creator/project/create", ownerCookie, {
      method: "POST",
      headers: { "idempotency-key": `viewer-project-global-import:${randomUUID()}` },
      body: { name: "Viewer Project Global Source", scriptInput: "第一集", aspectRatio: "9:16", resolution: "1080p" },
    });
    assert.equal(project.status, 200, JSON.stringify(project.body));
    const projectId = String(project.body.project.id);
    const now = new Date();
    const sourceStorage = await createScopedStorageObject(db, {
      userId,
      projectId,
      bucket: "team-assets-test",
      objectName: "viewer-project-global-source.png",
      contentType: "image/png",
      sizeBytes: sourceBytes.byteLength,
      provider: "tencent_cos",
      status: "available",
      metadata: {},
      createdByUserId: userId,
      now,
    });
    const sourceAssetId = randomUUID();
    const sourceAssetVersionId = randomUUID();
    await db.query(`
      INSERT INTO assets (id,project_id,asset_type,asset_key,created_by_user_id,created_at,updated_at)
      VALUES ($1,$2,'scene_reference','viewer-project-global-scene',$3,$4,$4)
    `, [sourceAssetId, projectId, userId, now]);
    await db.query(`
      INSERT INTO asset_versions (
        id,asset_id,version_number,storage_object_key,storage_object_id,metadata_json,created_by_user_id,created_at
      ) VALUES ($1,$2,1,$3,$4,'{}'::jsonb,$5,$6)
    `, [sourceAssetVersionId, sourceAssetId, sourceStorage.objectKey, sourceStorage.id, userId, now]);
    const createdViewer = await api(server.origin, "/api/creator/team/members", ownerCookie, {
      method: "POST",
      body: {
        teamAccount: `viewer_${randomUUID().slice(0, 8)}`,
        displayName: "Viewer",
        projectIds: [projectId],
        initialCredits: 0,
      },
    });
    assert.equal(createdViewer.status, 200, JSON.stringify(createdViewer.body));
    await db.query(
      "UPDATE team_member_projects SET role = 'viewer' WHERE member_id = $1 AND project_id = $2",
      [createdViewer.body.member.membershipId, projectId],
    );
    const memberLogin = await fetch(`${server.origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: createdViewer.body.member.memberLoginAccount,
        password: createdViewer.body.temporaryPassword,
        actorType: "team_member",
      }),
    });
    assert.equal(memberLogin.status, 200, await memberLogin.text());
    const viewerCookie = memberLogin.headers.get("set-cookie") ?? "";
    const imported = await api(server.origin, "/api/creator/team-assets/import-project-asset", viewerCookie, {
      method: "POST",
      body: { assetVersionId: sourceAssetVersionId, name: "Viewer Must Not Import" },
    });
    assert.equal(imported.status, 403, JSON.stringify(imported.body));
    assert.equal(imported.body.errorCode, "permission_denied");
    assert.equal(imported.body.details?.reason, "capability_missing");
    assert.equal(copiedObjectCount, 0);
    const createdTargetRows = await db.query<{ team_assets: string; storage_objects: string }>(`
      SELECT
        (SELECT COUNT(*)::text FROM team_assets WHERE asset_name='Viewer Must Not Import') AS team_assets,
        (SELECT COUNT(*)::text FROM storage_objects WHERE project_id IS NULL AND canvas_project_id IS NULL) AS storage_objects
    `);
    assert.deepEqual(createdTargetRows.rows, [{ team_assets: "0", storage_objects: "0" }]);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("merges authorized project and Canvas artifact tags without changing their asset scope", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const phone = `138${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await db.query(`
      INSERT INTO user_entitlements (id,user_id,entitlement_key,status,source,expires_at,created_at,updated_at)
      VALUES ($1,$2,'team_member_management','active','dev_seed',$3,$4,$4)
    `, [randomUUID(), userId, new Date("2099-01-01T00:00:00.000Z"), new Date()]);
    await db.query("UPDATE users SET team_seat_limit = 2 WHERE id = $1", [userId]);
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const canvas = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Asset Tag Canvas" },
    });
    assert.equal(canvas.status, 201, JSON.stringify(canvas.body));
    const canvasId = String(canvas.body.data.project.id);
    const project = await api(server.origin, "/api/creator/project/create", cookie, {
      method: "POST",
      headers: { "idempotency-key": `asset-tag-project:${randomUUID()}` },
      body: { name: "Asset Tag Project", scriptInput: "第一集", aspectRatio: "9:16", resolution: "1080p" },
    });
    assert.equal(project.status, 200, JSON.stringify(project.body));
    const projectId = String(project.body.project.id);
    const projectAssetId = randomUUID();
    const projectVersionId = randomUUID();
    const now = new Date();
    await db.query(`
      INSERT INTO assets (id,project_id,asset_type,asset_key,created_by_user_id,created_at,updated_at)
      VALUES ($1,$2,'scene_reference','asset-tag-project-scene',$3,$4,$4)
    `, [projectAssetId, projectId, userId, now]);
    await db.query(`
      INSERT INTO asset_versions (id,asset_id,version_number,storage_object_key,metadata_json,created_by_user_id,created_at)
      VALUES ($1,$2,1,'asset-tag-project-scene.png','{"description":"preserved"}'::jsonb,$3,$4)
    `, [projectVersionId, projectAssetId, userId, now]);
    const createdViewer = await api(server.origin, "/api/creator/team/members", cookie, {
      method: "POST",
      body: {
        teamAccount: `asset_tag_viewer_${randomUUID().slice(0, 8)}`,
        displayName: "Asset Tag Viewer",
        projectIds: [projectId],
        initialCredits: 0,
      },
    });
    assert.equal(createdViewer.status, 200, JSON.stringify(createdViewer.body));
    await db.query(
      "UPDATE team_member_projects SET role = 'viewer' WHERE member_id = $1 AND project_id = $2",
      [createdViewer.body.member.membershipId, projectId],
    );
    const memberLogin = await fetch(`${server.origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: createdViewer.body.member.memberLoginAccount,
        password: createdViewer.body.temporaryPassword,
        actorType: "team_member",
      }),
    });
    assert.equal(memberLogin.status, 200, await memberLogin.text());
    const viewerTags = await api(
      server.origin,
      `/api/creator/assets/${projectAssetId}`,
      memberLogin.headers.get("set-cookie") ?? "",
      { method: "PATCH", body: { tags: ["viewer"] } },
    );
    assert.equal(viewerTags.status, 403, JSON.stringify(viewerTags.body));
    assert.equal(viewerTags.body.errorCode, "permission_denied");
    assert.equal(viewerTags.body.details?.reason, "capability_missing");
    const viewerImport = await api(
      server.origin,
      "/api/creator/assets/import",
      memberLogin.headers.get("set-cookie") ?? "",
      {
        method: "POST",
        body: { projectId, kind: "image", name: "Viewer Must Not Import" },
      },
    );
    assert.equal(viewerImport.status, 403, JSON.stringify(viewerImport.body));
    assert.equal(viewerImport.body.errorCode, "permission_denied");
    assert.equal(viewerImport.body.details?.reason, "capability_missing");
    const ownerEpisode = await api(server.origin, `/api/projects/${projectId}/episodes`, cookie, {
      method: "POST",
      body: { title: "Asset Tag Episode" },
    });
    assert.equal(ownerEpisode.status, 200, JSON.stringify(ownerEpisode.body));
    const episodeId = String(ownerEpisode.body.data.episode.id);
    const ownerEpisodeAsset = await api(server.origin, `/api/episodes/${episodeId}/assets`, cookie, {
      method: "POST",
      body: { assetType: "role", name: "Owner Fixed Asset" },
    });
    assert.equal(ownerEpisodeAsset.status, 200, JSON.stringify(ownerEpisodeAsset.body));
    const ownerEpisodeAssetId = String(ownerEpisodeAsset.body.data.asset.assetId);
    await db.query(
      `UPDATE asset_versions
         SET metadata_json = metadata_json || $2::jsonb
       WHERE asset_id = $1`,
      [ownerEpisodeAssetId, JSON.stringify({
        fixedImageFileId: randomUUID(),
        fixedImageStorageObjectId: randomUUID(),
        fixedImageUrl: "https://assets.example.test/fixed.png",
        previewUrl: "https://assets.example.test/fixed.png",
      })],
    );
    const viewerEpisodeCreate = await api(
      server.origin,
      `/api/projects/${projectId}/episodes`,
      memberLogin.headers.get("set-cookie") ?? "",
      { method: "POST", body: { title: "Viewer Must Not Create" } },
    );
    assert.equal(viewerEpisodeCreate.status, 403, JSON.stringify(viewerEpisodeCreate.body));
    assert.equal(viewerEpisodeCreate.body.errorCode, "permission_denied");
    const viewerEpisodeUpdate = await api(
      server.origin,
      `/api/projects/${projectId}/episodes/${episodeId}`,
      memberLogin.headers.get("set-cookie") ?? "",
      { method: "PATCH", body: { title: "Viewer Must Not Rename" } },
    );
    assert.equal(viewerEpisodeUpdate.status, 403, JSON.stringify(viewerEpisodeUpdate.body));
    assert.equal(viewerEpisodeUpdate.body.errorCode, "permission_denied");
    const viewerEpisodeAssetCreate = await api(
      server.origin,
      `/api/episodes/${episodeId}/assets`,
      memberLogin.headers.get("set-cookie") ?? "",
      { method: "POST", body: { assetType: "role", name: "Viewer Must Not Create Asset" } },
    );
    assert.equal(viewerEpisodeAssetCreate.status, 403, JSON.stringify(viewerEpisodeAssetCreate.body));
    assert.equal(viewerEpisodeAssetCreate.body.errorCode, "permission_denied");
    assert.equal(viewerEpisodeAssetCreate.body.details?.reason, "capability_missing");
    const viewerFixedImageClear = await api(
      server.origin,
      `/api/episodes/${episodeId}/assets/${ownerEpisodeAssetId}/fixed-image`,
      memberLogin.headers.get("set-cookie") ?? "",
      { method: "DELETE" },
    );
    assert.equal(viewerFixedImageClear.status, 403, JSON.stringify(viewerFixedImageClear.body));
    assert.equal(viewerFixedImageClear.body.errorCode, "team_member_delete_forbidden");
    const ownerFixedImageClear = await api(
      server.origin,
      `/api/episodes/${episodeId}/assets/${ownerEpisodeAssetId}/fixed-image`,
      cookie,
      { method: "DELETE" },
    );
    assert.equal(ownerFixedImageClear.status, 200, JSON.stringify(ownerFixedImageClear.body));
    assert.equal(ownerFixedImageClear.body.data.asset.fixedImageFileId, null);
    const ownerEpisodeAssets = await api(server.origin, `/api/episodes/${episodeId}/assets?assetType=role`, cookie);
    assert.equal(ownerEpisodeAssets.status, 200, JSON.stringify(ownerEpisodeAssets.body));
    const clearedEpisodeAsset = ownerEpisodeAssets.body.data.items.find((item: { assetId: string }) => item.assetId === ownerEpisodeAssetId);
    assert.equal(clearedEpisodeAsset?.fixedImageFileId, null);
    assert.equal(clearedEpisodeAsset?.fixedImageStorageObjectId, null);
    assert.equal(clearedEpisodeAsset?.fixedImageUrl, null);
    const viewerCategoryClear = await api(
      server.origin,
      `/api/episodes/${episodeId}/assets?assetType=role`,
      memberLogin.headers.get("set-cookie") ?? "",
      { method: "DELETE" },
    );
    assert.equal(viewerCategoryClear.status, 403, JSON.stringify(viewerCategoryClear.body));
    assert.equal(viewerCategoryClear.body.errorCode, "team_member_delete_forbidden");
    const ownerCategoryClear = await api(
      server.origin,
      `/api/episodes/${episodeId}/assets?assetType=role`,
      cookie,
      { method: "DELETE" },
    );
    assert.equal(ownerCategoryClear.status, 200, JSON.stringify(ownerCategoryClear.body));
    assert.equal(ownerCategoryClear.body.data.deletedCount, 1);
    const projectTags = await api(server.origin, `/api/creator/assets/${projectAssetId}`, cookie, {
      method: "PATCH",
      body: { tags: ["场景", "夜景", "场景"] },
    });
    assert.equal(projectTags.status, 200, JSON.stringify(projectTags.body));
    const projectMetadata = await db.query<{ metadata_json: Record<string, unknown> }>(
      "SELECT metadata_json FROM asset_versions WHERE id=$1",
      [projectVersionId],
    );
    assert.deepEqual(projectMetadata.rows[0]?.metadata_json, { description: "preserved", tags: ["场景", "夜景"] });

    await db.query(`
      INSERT INTO creator_canvas_nodes (
        id,canvas_project_id,node_key,node_type,title,status,media_kind,source_kind,
        created_by_user_id,updated_by_user_id,created_at,updated_at
      ) VALUES ($1,$2,'asset-tag-output','ai-image','标签输出','succeeded','image','generation',$3,$3,$4,$4)
    `, [randomUUID(), canvasId, userId, now]);
    const stableCanvas = await seedStableCanvasArtifactVersion(db, {
      userId,
      canvasId,
      nodeKey: "asset-tag-output",
      objectName: "asset-tag-output.png",
    });
    await db.query(
      "UPDATE asset_versions SET metadata_json = '{\"mimeType\":\"image/png\",\"title\":\"preserved\"}'::jsonb WHERE id=$1",
      [stableCanvas.assetVersionId],
    );
    const artifact = await db.query<{ id: string; storage_object_id: string }>(
      "SELECT id,storage_object_id FROM creator_canvas_node_artifacts WHERE canvas_project_id=$1 AND asset_version_id=$2",
      [canvasId, stableCanvas.assetVersionId],
    );
    const artifactTags = await api(server.origin, `/api/canvas/${canvasId}/artifacts/${artifact.rows[0]?.id}/tags`, cookie, {
      method: "PATCH",
      body: { tags: ["输出", "夜景"] },
    });
    assert.equal(artifactTags.status, 200, JSON.stringify(artifactTags.body));
    assert.deepEqual(artifactTags.body.data.tags, ["输出", "夜景"]);
    const canvasMetadata = await db.query<{
      metadata_json: Record<string, unknown>;
      artifact_id: string;
      storage_object_id: string;
      canvas_project_id: string;
    }>(`
      SELECT version.metadata_json,artifact.id AS artifact_id,artifact.storage_object_id,asset.canvas_project_id
      FROM asset_versions version
      JOIN assets asset ON asset.id=version.asset_id
      JOIN creator_canvas_node_artifacts artifact ON artifact.asset_version_id=version.id
      WHERE version.id=$1
    `, [stableCanvas.assetVersionId]);
    assert.deepEqual(canvasMetadata.rows, [{
      metadata_json: { mimeType: "image/png", title: "preserved", tags: ["输出", "夜景"] },
      artifact_id: artifact.rows[0]!.id,
      storage_object_id: artifact.rows[0]!.storage_object_id,
      canvas_project_id: canvasId,
    }]);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("copies an authorized team image into a Canvas style reference without moving its source object", async () => {
  const db = await createMigratedTestDb();
  const sourceBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const copiedBodies: Uint8Array[] = [];
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
    repairScheduler: { enabled: false },
    storageRuntime: {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "canvas-style-reference-test",
      adapter: {
        async createSignedReadUrl(input) {
          return { url: `https://team-assets.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
        },
        async putObject(input) {
          copiedBodies.push(new Uint8Array(input.body));
          return { eTag: "copied-team-style-reference" };
        },
      },
    },
    fetchImpl: async () => new Response(sourceBytes, { headers: { "content-type": "image/png" } }),
  });
  const userId = randomUUID();
  const phone = `139${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const canvas = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Team Style Import Canvas" },
    });
    assert.equal(canvas.status, 201, JSON.stringify(canvas.body));
    const canvasId = String(canvas.body.data.project.id);
    const now = new Date();
    const sourceStorage = await createScopedStorageObject(db, {
      userId,
      bucket: "canvas-style-reference-test",
      objectName: "team-style-reference.png",
      contentType: "image/png",
      sizeBytes: 256,
      provider: "creator-dev",
      status: "available",
      metadata: { purpose: "team-assets/scene" },
      createdByUserId: userId,
      now,
    });
    const teamAssetId = randomUUID();
    await db.query(`
      INSERT INTO team_assets (
        id,admin_user_id,asset_name,asset_prompt,asset_category,asset_status,
        asset_url,resource_type,resource_size,created_at,updated_at,
        created_by_name,updated_by_name,is_admin_created,created_user_id,storage_object_id
      ) VALUES ($1,$2,'团队风格图',NULL,'scene','active',$3,'image',256,$4,$4,'Owner','Owner',true,$2,$5)
    `, [
      teamAssetId,
      userId,
      `https://team-assets.example.test/${sourceStorage.objectKey}`,
      now,
      sourceStorage.id,
    ]);
    const materialized = await api(server.origin, `/api/canvas/${canvasId}/style-reference-assets/import`, cookie, {
      method: "POST",
      body: {
        source: { kind: "team_asset", sourceId: teamAssetId },
        label: "团队风格图",
      },
    });
    assert.equal(materialized.status, 201, JSON.stringify(materialized.body));
    const copiedStorageObjectId = String(materialized.body.data.asset.storageObjectId);
    assert.notEqual(copiedStorageObjectId, sourceStorage.id);
    assert.deepEqual(copiedBodies, [sourceBytes]);
    const source = await db.query<{
      project_id: string | null;
      canvas_project_id: string | null;
      storage_object_id: string | null;
    }>(`
      SELECT storage.project_id,storage.canvas_project_id,asset.storage_object_id
      FROM team_assets asset
      JOIN storage_objects storage ON storage.id=asset.storage_object_id
      WHERE asset.id=$1
    `, [teamAssetId]);
    assert.deepEqual(source.rows, [{
      project_id: null,
      canvas_project_id: null,
      storage_object_id: sourceStorage.id,
    }]);
    const copied = await db.query<{ project_id: string | null; canvas_project_id: string | null }>(
      "SELECT project_id,canvas_project_id FROM storage_objects WHERE id=$1",
      [copiedStorageObjectId],
    );
    assert.deepEqual(copied.rows, [{ project_id: null, canvas_project_id: canvasId }]);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("copies an authorized drama asset version into a Canvas style reference without moving its source object", async () => {
  const db = await createMigratedTestDb();
  const sourceBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const copiedBodies: Uint8Array[] = [];
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
    repairScheduler: { enabled: false },
    storageRuntime: {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "canvas-style-reference-test",
      adapter: {
        async createSignedReadUrl(input) {
          return { url: `https://drama-assets.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
        },
        async putObject(input) {
          copiedBodies.push(new Uint8Array(input.body));
          return { eTag: "copied-drama-style-reference" };
        },
      },
    },
    fetchImpl: async () => new Response(sourceBytes, { headers: { "content-type": "image/png" } }),
  });
  const userId = randomUUID();
  const phone = `138${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const canvas = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Drama Style Import Canvas" },
    });
    assert.equal(canvas.status, 201, JSON.stringify(canvas.body));
    const canvasId = String(canvas.body.data.project.id);
    const project = await api(server.origin, "/api/creator/project/create", cookie, {
      method: "POST",
      headers: { "idempotency-key": `drama-style-project:${randomUUID()}` },
      body: { name: "Drama Style Source", scriptInput: "第一集", aspectRatio: "9:16", resolution: "1080p" },
    });
    assert.equal(project.status, 200, JSON.stringify(project.body));
    const projectId = String(project.body.project.id);
    const now = new Date();
    const sourceStorage = await createScopedStorageObject(db, {
      userId,
      projectId,
      bucket: "canvas-style-reference-test",
      objectName: "drama-style-reference.png",
      contentType: "image/png",
      sizeBytes: sourceBytes.byteLength,
      provider: "tencent_cos",
      status: "available",
      metadata: { source: "episode" },
      createdByUserId: userId,
      now,
    });
    const sourceAssetId = randomUUID();
    const sourceAssetVersionId = randomUUID();
    await db.query(`
      INSERT INTO assets (id,project_id,asset_type,asset_key,created_by_user_id,created_at,updated_at)
      VALUES ($1,$2,'character_sheet',$3,$4,$5,$5)
    `, [sourceAssetId, projectId, `episode-style-${sourceAssetId}`, userId, now]);
    await db.query(`
      INSERT INTO asset_versions (
        id,asset_id,version_number,storage_object_key,storage_object_id,metadata_json,created_by_user_id,created_at
      ) VALUES ($1,$2,1,$3,$4,'{"mimeType":"image/png","source":"episode"}'::jsonb,$5,$6)
    `, [sourceAssetVersionId, sourceAssetId, sourceStorage.objectKey, sourceStorage.id, userId, now]);
    const materialized = await api(server.origin, `/api/canvas/${canvasId}/style-reference-assets/import`, cookie, {
      method: "POST",
      body: {
        source: { kind: "drama_asset_version", sourceId: sourceAssetVersionId },
        label: "短剧角色风格图",
      },
    });
    assert.equal(materialized.status, 201, JSON.stringify(materialized.body));
    const copiedStorageObjectId = String(materialized.body.data.asset.storageObjectId);
    assert.notEqual(copiedStorageObjectId, sourceStorage.id);
    assert.deepEqual(copiedBodies, [sourceBytes]);
    const scopes = await db.query<{ id: string; project_id: string | null; canvas_project_id: string | null }>(
      "SELECT id,project_id,canvas_project_id FROM storage_objects WHERE id=ANY($1::uuid[]) ORDER BY id",
      [[sourceStorage.id, copiedStorageObjectId]],
    );
    assert.deepEqual(scopes.rows.sort((left, right) => left.id.localeCompare(right.id)), [
      { id: copiedStorageObjectId, project_id: null, canvas_project_id: canvasId },
      { id: sourceStorage.id, project_id: projectId, canvas_project_id: null },
    ].sort((left, right) => left.id.localeCompare(right.id)));
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("exposes Canvas batch DAG and cursor history HTTP contracts", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
    repairScheduler: { enabled: false },
    textChatGateway: {
      async completeJson() {
        return "生成后的角色设定";
      },
    },
  });
  const userId = randomUUID();
  const phone = `136${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const createdCanvas = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Batch HTTP Canvas" },
    });
    assert.equal(createdCanvas.status, 201, JSON.stringify(createdCanvas.body));
    const canvasId = String(createdCanvas.body.data.project.id);
    const settings = await api(server.origin, `/api/canvas/${canvasId}/settings`, cookie);
    assert.equal(settings.status, 200, JSON.stringify(settings.body));
    assert.equal(settings.body.data.revision, 1);
    const updatedSettings = await api(server.origin, `/api/canvas/${canvasId}/settings`, cookie, {
      method: "PATCH",
      body: {
        expectedRevision: 1,
        patch: {
          promptSuffixes: { image: "high detail" },
          generation: { imageFollowNode: true, videoDuration: 8, videoFollowNode: true },
        },
      },
    });
    assert.equal(updatedSettings.status, 200, JSON.stringify(updatedSettings.body));
    assert.equal(updatedSettings.body.data.revision, 2);
    assert.equal(updatedSettings.body.data.settings.promptSuffixes.image, "high detail");
    assert.equal(updatedSettings.body.data.settings.generation.imageFollowNode, true);
    assert.equal(updatedSettings.body.data.settings.generation.videoFollowNode, true);
    const missingPatch = await api(server.origin, `/api/canvas/${canvasId}/settings`, cookie, {
      method: "PATCH",
      body: { expectedRevision: 2 },
    });
    assert.equal(missingPatch.status, 400, JSON.stringify(missingPatch.body));
    assert.equal(missingPatch.body.errorCode, "canvas_settings_patch_required");
    const saved = await api(server.origin, `/api/creator/canvas-projects/${canvasId}/canvas`, cookie, {
      method: "PUT",
      body: {
        clientRevision: 1,
        document: {
          version: 2,
          canvasProjectId: canvasId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            imageNode("root", "root prompt"),
            imageNode("library-source", "library source prompt"),
            imageNode("dependent"),
            {
              id: "text-root",
              type: "ai-text",
              position: { x: 0, y: 320 },
              data: { mediaKind: "text", prompt: "编写角色设定", modelCode: "deepseek-chat", ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] } },
            },
            {
              id: "text-dependent-image",
              type: "ai-image",
              position: { x: 420, y: 320 },
              data: { mediaKind: "image", prompt: "绘制角色", modelCode: "nano_banana_2", ports: { inputs: [{ id: "in_text", kind: "text" }], outputs: [] } },
            },
          ],
          edges: [{
            id: "edge-text-image",
            sourceNodeId: "text-root",
            sourcePortId: "out_text",
            targetNodeId: "text-dependent-image",
            targetPortId: "in_text",
            data: { kind: "text" },
          }],
        },
        events: [],
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const savedNodes = await db.query<{ node_key: string; deleted_at: Date | null }>(
      "SELECT node_key, deleted_at FROM creator_canvas_nodes WHERE canvas_project_id=$1 ORDER BY node_key",
      [canvasId],
    );
    assert.deepEqual(savedNodes.rows.map((row) => [row.node_key, row.deleted_at]), [
      ["dependent", null], ["library-source", null], ["root", null], ["text-dependent-image", null], ["text-root", null],
    ]);
    const librarySource = await seedStableCanvasArtifactVersion(db, {
      userId,
      canvasId,
      nodeKey: "library-source",
      objectName: "batch/library-source.png",
    });
    const styleSettings = await api(server.origin, `/api/canvas/${canvasId}/settings`, cookie, {
      method: "PATCH",
      body: {
        expectedRevision: 2,
        patch: {
          visualStyle: {
            styleReferenceAssetId: librarySource.assetId,
            styleReferenceEnabled: true,
          },
        },
      },
    });
    assert.equal(styleSettings.status, 200, JSON.stringify(styleSettings.body));

    const createdBatch = await api(server.origin, `/api/canvas/${canvasId}/generation-batches`, cookie, {
      method: "POST",
      headers: { "idempotency-key": `batch-http-${randomUUID()}` },
      body: {
        nodes: [
          { nodeKey: "root", mediaKind: "image", payload: { model: "nano_banana_2", prompt: "root image" } },
          {
            nodeKey: "dependent",
            mediaKind: "image",
            payload: { model: "nano_banana_2", prompt: "@node:root | @node:library-source | dependent image" },
          },
        ],
      },
    });
    assert.equal(createdBatch.status, 201, JSON.stringify(createdBatch.body));
    const batch = createdBatch.body.data.batch;
    const reservationRows = await db.query<{ count: number; amount_total: number }>(`
      SELECT count(*)::int AS count, max(amount_total)::int AS amount_total
      FROM credit_reservations
      WHERE source_type='canvas_generation_batch' AND source_id=$1
    `, [batch.id]);
    assert.equal(Number(reservationRows.rows[0]?.count), 1);
    assert.equal(Number(reservationRows.rows[0]?.amount_total), 180);
    assert.deepEqual(batch.items.map((item: { nodeKey: string; status: string }) => [item.nodeKey, item.status]), [
      ["root", "queued"], ["dependent", "pending"],
    ], JSON.stringify(batch));
    assert.deepEqual(batch.items[1].dependsOn, ["root"]);
    assert.deepEqual(batch.items[1].payload.referenceAssetVersionIds, [librarySource.assetVersionId]);
    assert.equal(JSON.stringify(batch.items[1].payload).includes("must-not-enter-payload"), false);
    assert.equal(JSON.stringify(batch.items[1].payload).includes("base64"), false);
    const rootTaskId = String(batch.items[0].taskId);
    const rootTaskReference = await db.query<{ reference_asset_version_ids: string[] }>(`
      SELECT input_snapshot_json->'referenceAssetVersionIds' AS reference_asset_version_ids
      FROM tasks WHERE id=$1
    `, [rootTaskId]);
    assert.deepEqual(rootTaskReference.rows[0]?.reference_asset_version_ids, [librarySource.assetVersionId]);
    const disabledStyleSettings = await api(server.origin, `/api/canvas/${canvasId}/settings`, cookie, {
      method: "PATCH",
      body: {
        expectedRevision: 3,
        patch: { visualStyle: { styleReferenceEnabled: false } },
      },
    });
    assert.equal(disabledStyleSettings.status, 200, JSON.stringify(disabledStyleSettings.body));
    assert.equal(disabledStyleSettings.body.data.settings.visualStyle.styleReferenceAssetId, librarySource.assetId);
    const disabledStyleBatch = await api(server.origin, `/api/canvas/${canvasId}/generation-batches`, cookie, {
      method: "POST",
      headers: { "idempotency-key": `batch-style-disabled-${randomUUID()}` },
      body: {
        nodes: [{ nodeKey: "root", mediaKind: "image", payload: { model: "nano_banana_2", prompt: "style disabled" } }],
      },
    });
    assert.equal(disabledStyleBatch.status, 201, JSON.stringify(disabledStyleBatch.body));
    const disabledStyleTaskReference = await db.query<{ reference_asset_version_ids: string[] }>(`
      SELECT input_snapshot_json->'referenceAssetVersionIds' AS reference_asset_version_ids
      FROM tasks WHERE id=$1
    `, [disabledStyleBatch.body.data.batch.items[0].taskId]);
    assert.deepEqual(disabledStyleTaskReference.rows[0]?.reference_asset_version_ids, []);
    await db.query("UPDATE tasks SET status='succeeded', updated_at=NOW() WHERE id=$1", [rootTaskId]);
    const rootRun = await db.query<{ id: string }>(
      "UPDATE creator_canvas_node_runs SET status='succeeded',updated_at=NOW() WHERE task_id=$1 RETURNING id",
      [rootTaskId],
    );
    assert.ok(rootRun.rows[0]?.id);
    const rootArtifact = await seedStableCanvasArtifactVersion(db, {
      userId,
      canvasId,
      nodeKey: "root",
      runId: rootRun.rows[0]!.id,
      objectName: "batch/root.png",
    });

    const reconciled = await api(
      server.origin,
      `/api/canvas/${canvasId}/generation-batches/${batch.id}/reconcile`,
      cookie,
      { method: "POST", body: {} },
    );
    assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
    assert.equal(reconciled.body.data.batch.items[1].status, "queued");
    const dependentTaskId = String(reconciled.body.data.batch.items[1].taskId);
    const dependentSnapshots = await db.query<{
      task_snapshot: Record<string, unknown>;
      run_snapshot: Record<string, unknown>;
    }>(`
      SELECT task.input_snapshot_json AS task_snapshot,run.input_snapshot_json AS run_snapshot
      FROM tasks task
      JOIN creator_canvas_node_runs run ON run.task_id=task.id
      WHERE task.id=$1
    `, [dependentTaskId]);
    const expectedReferenceVersions = [librarySource.assetVersionId, rootArtifact.assetVersionId].sort();
    assert.deepEqual(
      (dependentSnapshots.rows[0]?.task_snapshot.referenceAssetVersionIds as string[]).slice().sort(),
      expectedReferenceVersions,
    );
    assert.deepEqual(
      (dependentSnapshots.rows[0]?.run_snapshot.referenceAssetVersionIds as string[]).slice().sort(),
      expectedReferenceVersions,
    );

    const textBatchResponse = await api(server.origin, `/api/canvas/${canvasId}/generation-batches`, cookie, {
      method: "POST",
      headers: { "idempotency-key": `batch-text-http-${randomUUID()}` },
      body: {
        nodes: [
          { nodeKey: "text-root", mediaKind: "text", payload: { model: "deepseek-chat", prompt: "编写角色设定" } },
          {
            nodeKey: "text-dependent-image",
            mediaKind: "image",
            dependsOn: ["text-root"],
            payload: { model: "nano_banana_2", prompt: "绘制角色" },
          },
        ],
      },
    });
    assert.equal(textBatchResponse.status, 201, JSON.stringify(textBatchResponse.body));
    const textBatch = textBatchResponse.body.data.batch;
    assert.deepEqual(textBatch.items.map((item: { nodeKey: string; status: string }) => [item.nodeKey, item.status]), [
      ["text-root", "succeeded"], ["text-dependent-image", "queued"],
    ]);
    const textArtifact = await db.query<{ text: string }>(`
      SELECT metadata_json->>'text' AS text
      FROM creator_canvas_node_artifacts
      WHERE canvas_project_id=$1 AND node_key='text-root' AND artifact_kind='text'
      ORDER BY created_at DESC LIMIT 1
    `, [canvasId]);
    assert.equal(textArtifact.rows[0]?.text, "生成后的角色设定");
    const textDependentTask = await db.query<{ prompt: string; fragments: string[] }>(`
      SELECT input_snapshot_json->>'prompt' AS prompt,
             input_snapshot_json->'canvasContext'->'upstreamTextFragments' AS fragments
      FROM tasks WHERE id=$1
    `, [textBatch.items[1].taskId]);
    assert.match(textDependentTask.rows[0]?.prompt ?? "", /生成后的角色设定/);
    assert.deepEqual(textDependentTask.rows[0]?.fragments, ["生成后的角色设定"]);

    const foreignCanvas = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Foreign reference Canvas" },
    });
    assert.equal(foreignCanvas.status, 201, JSON.stringify(foreignCanvas.body));
    const foreignCanvasId = String(foreignCanvas.body.data.project.id);
    const foreignSaved = await api(server.origin, `/api/creator/canvas-projects/${foreignCanvasId}/canvas`, cookie, {
      method: "PUT",
      body: {
        clientRevision: 1,
        document: {
          version: 2,
          canvasProjectId: foreignCanvasId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [imageNode("foreign-source", "foreign source")],
          edges: [],
        },
        events: [],
      },
    });
    assert.equal(foreignSaved.status, 200, JSON.stringify(foreignSaved.body));
    const foreignReference = await seedStableCanvasArtifactVersion(db, {
      userId,
      canvasId: foreignCanvasId,
      nodeKey: "foreign-source",
      objectName: "batch/foreign-source.png",
    });
    const rejectedForeignReference = await api(server.origin, `/api/canvas/${canvasId}/generation-batches`, cookie, {
      method: "POST",
      headers: { "idempotency-key": `batch-foreign-reference-${randomUUID()}` },
      body: {
        nodes: [{
          nodeKey: "dependent",
          mediaKind: "image",
          payload: {
            model: "nano_banana_2",
            prompt: "must reject foreign Canvas reference",
            referenceAssetVersionIds: [foreignReference.assetVersionId],
          },
        }],
      },
    });
    assert.equal(rejectedForeignReference.status, 201, JSON.stringify(rejectedForeignReference.body));
    assert.equal(rejectedForeignReference.body.data.batch.items[0].status, "failed");
    assert.equal(rejectedForeignReference.body.data.batch.items[0].failure.failureCode, "model_reference_not_found");

    const history = await api(server.origin, `/api/canvas/${canvasId}/generation-history?limit=1`, cookie);
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.equal(history.body.data.items.length, 1);
    assert.ok(history.body.data.nextCursor);
    const next = await api(
      server.origin,
      `/api/canvas/${canvasId}/generation-history?limit=1&cursor=${encodeURIComponent(history.body.data.nextCursor)}`,
      cookie,
    );
    assert.equal(next.status, 200, JSON.stringify(next.body));
    assert.equal(next.body.data.items.length, 1);

    const runId = String(history.body.data.items[0].id);
    const deleted = await api(server.origin, `/api/canvas/${canvasId}/generation-history/${runId}`, cookie, {
      method: "DELETE",
    });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    const exported = await api(server.origin, `/api/canvas/${canvasId}/generation-history?format=json`, cookie);
    assert.equal(exported.status, 200, JSON.stringify(exported.body));
    assert.equal(exported.body.data.version, 1);
    assert.equal(exported.body.data.items.length, 5);
    const bulkDeleted = await api(server.origin, `/api/canvas/${canvasId}/generation-history`, cookie, {
      method: "DELETE",
      body: { scope: "all" },
    });
    assert.equal(bulkDeleted.status, 200, JSON.stringify(bulkDeleted.body));
    assert.equal(bulkDeleted.body.data.scope, "all");
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("blocks direct Canvas image intake when the new Canvas feature is disabled", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "false" },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const phone = `135${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const result = await api(server.origin, "/api/generation/image-tasks", cookie, {
      method: "POST",
      headers: { "idempotency-key": `disabled-${randomUUID()}` },
      body: {
        target: { kind: "canvas", canvasProjectId: randomUUID(), nodeId: "image" },
        model: "nano_banana_2",
        prompt: "must be blocked",
      },
    });
    assert.equal(result.status, 503, JSON.stringify(result.body));
    assert.equal(result.body.errorCode, "new_canvas_disabled");
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("rejects unresolved Canvas prompt references before creating a generation task", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const phone = `137${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const created = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Prompt validation HTTP Canvas" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const canvasId = String(created.body.data.project.id);
    const saved = await api(server.origin, `/api/creator/canvas-projects/${canvasId}/canvas`, cookie, {
      method: "PUT",
      body: {
        clientRevision: 1,
        document: {
          version: 1,
          canvasProjectId: canvasId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [imageNode("image")],
          edges: [],
        },
        events: [],
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const rejected = await api(server.origin, "/api/generation/image-tasks", cookie, {
      method: "POST",
      headers: { "idempotency-key": `prompt-reference-${randomUUID()}` },
      body: {
        target: { kind: "canvas", canvasProjectId: canvasId, nodeId: "image" },
        model: "nano_banana_2",
        prompt: `Create image with @style:${randomUUID()}`,
      },
    });
    assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
    assert.equal(rejected.body.errorCode, "canvas_prompt_reference_unavailable");
    const sideEffects = await db.query<{ runs: number; tasks: number }>(
      "SELECT (SELECT count(*)::int FROM creator_canvas_node_runs) AS runs, (SELECT count(*)::int FROM tasks) AS tasks",
    );
    assert.deepEqual(sideEffects.rows[0], { runs: 0, tasks: 0 });
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("converts Canvas plain-text transcription locally without provider or billing side effects", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const phone = `134${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const created = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Plain Text Transcription Canvas" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const canvasId = String(created.body.data.project.id);
    const saved = await api(server.origin, `/api/creator/canvas-projects/${canvasId}/canvas`, cookie, {
      method: "PUT",
      body: {
        clientRevision: 1,
        document: {
          version: 2,
          canvasProjectId: canvasId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "source-text",
              type: "source-text",
              position: { x: 0, y: 0 },
              data: {
                mediaKind: "text",
                text: "无需音频文件的文本内容。",
                ports: { inputs: [], outputs: [{ id: "out-text", kind: "text" }] },
              },
            },
            {
              id: "audio-transcription",
              type: "ai-audio",
              position: { x: 480, y: 0 },
              data: {
                mediaKind: "audio",
                audioGenerationMode: "transcription",
                prompt: "",
                ports: { inputs: [{ id: "in-text", kind: "text" }], outputs: [{ id: "out-audio", kind: "audio" }] },
              },
            },
          ],
          edges: [{
            id: "text-transcription-edge",
            sourceNodeId: "source-text",
            sourcePortId: "out-text",
            targetNodeId: "audio-transcription",
            targetPortId: "in-text",
            data: { kind: "text" },
          }],
        },
        events: [],
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const run = await api(server.origin, `/api/canvas/${canvasId}/nodes/audio-transcription/run`, cookie, {
      method: "POST",
      headers: { "idempotency-key": `plain-text-${randomUUID()}` },
      body: {
        kind: "audio",
        mode: "transcription",
        transcriptionInputKind: "text",
        textInput: "",
        parameters: { mode: "transcription", transcriptionInputKind: "text" },
        canvasContext: {
          upstreamTextFragments: [{ nodeId: "source-text", text: "无需音频文件的文本内容。" }],
        },
      },
    });
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.equal(run.body.data.status, "succeeded");
    assert.equal(run.body.data.localConversion, true);
    assert.equal(run.body.data.taskId, null);
    assert.equal(run.body.data.creditCost, 0);
    assert.equal(run.body.data.artifact.artifactKind, "text");
    const transcriptNode = run.body.data.canvas.document.nodes.find(
      (node: Record<string, any>) => node.data?.transcriptionRunId === run.body.data.runId,
    );
    assert.equal(transcriptNode?.data?.text, "无需音频文件的文本内容。");
    assert.equal(transcriptNode?.data?.sourceArtifactId, run.body.data.artifact.id);
    const sideEffects = await db.query<{ tasks: number; providers: number; audio_artifacts: number }>(`
      SELECT
        (SELECT count(*)::int FROM tasks WHERE canvas_project_id=$1) AS tasks,
        (SELECT count(*)::int FROM provider_requests WHERE canvas_project_id=$1) AS providers,
        (SELECT count(*)::int FROM creator_canvas_node_artifacts WHERE canvas_project_id=$1 AND artifact_kind='audio') AS audio_artifacts
    `, [canvasId]);
    assert.deepEqual(sideEffects.rows[0], { tasks: 0, providers: 0, audio_artifacts: 0 });
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

function imageNode(id: string, prompt = "") {
  return {
    id,
    type: "image",
    position: { x: 0, y: 0 },
    data: { mediaKind: "image", prompt, ports: { inputs: [], outputs: [] } },
  };
}

async function seedStableCanvasArtifactVersion(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: { userId: string; canvasId: string; nodeKey: string; runId?: string | null; objectName: string },
) {
  const now = new Date();
  const storage = await createScopedStorageObject(db, {
    userId: input.userId,
    canvasProjectId: input.canvasId,
    bucket: "canvas-batch-test",
    objectName: input.objectName,
    contentType: "image/png",
    sizeBytes: 4,
    provider: "creator-dev",
    status: "available",
    metadata: {},
    createdByUserId: input.userId,
    now,
  });
  const assetId = randomUUID();
  const assetVersionId = randomUUID();
  await db.query(`
    INSERT INTO assets (id,canvas_project_id,asset_type,asset_key,created_by_user_id,created_at,updated_at)
    VALUES ($1,$2,'character_sheet',$3,$4,$5,$5)
  `, [assetId, input.canvasId, `batch-reference-${assetId}`, input.userId, now]);
  await db.query(`
    INSERT INTO asset_versions (
      id,asset_id,version_number,storage_object_key,storage_object_id,metadata_json,created_by_user_id,created_at
    ) VALUES ($1,$2,1,$3,$4,'{"mimeType":"image/png"}'::jsonb,$5,$6)
  `, [assetVersionId, assetId, storage.objectKey, storage.id, input.userId, now]);
  await appendCanvasNodeArtifact(db, {
    canvasProjectId: input.canvasId,
    nodeKey: input.nodeKey,
    runId: input.runId ?? null,
    artifactKind: "image",
    assetId,
    assetVersionId,
    storageObjectId: storage.id,
    url: "https://must-not-enter-payload.example/reference.png",
    selected: true,
    userId: input.userId,
    now,
  });
  return { assetId, assetVersionId };
}

async function seedGenerationAccess(db: Awaited<ReturnType<typeof createMigratedTestDb>>, userId: string) {
  const now = new Date();
  await db.query(`
    INSERT INTO user_memberships
      (id,user_id,membership_tier,purchase_at,expires_at,gift_credits,status,created_at,updated_at)
    VALUES ($1,$2,'professional',$3,$4,0,'active',$3,$3)
  `, [randomUUID(), userId, now, new Date(now.getTime() + 86_400_000)]);
  await grantCredits(db, {
    userId, amount: 500, sourceType: "test_credit_seed", sourceId: randomUUID(),
    reason: "Canvas batch HTTP integration", createdByUserId: userId, now,
  });
}

async function passwordLogin(origin: string, phone: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get("set-cookie") ?? "";
}

async function api(
  origin: string,
  path: string,
  cookie: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
      cookie,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}
