import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

// This suite spins up many dev servers and local DB instances; keep subtests serial to
// avoid cross-test interference from runtime-level resources in the Node test runner.
describe.configure?.({ concurrency: 1 });

import { normalizeCnPhone } from "../../modules/identity/phone-auth.utils.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createDevDb } from "../../modules/shared/db/dev-db.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer as createPhoneAuthDevServerBase } from "../phone-auth-dev-server.ts";

const loginDbByOrigin = new Map<string, Awaited<ReturnType<typeof createDevDb>>>();

function createPhoneAuthDevServer(
  options?: Parameters<typeof createPhoneAuthDevServerBase>[0],
) {
  const server = createPhoneAuthDevServerBase(options);
  const originalListen = server.listen.bind(server);
  server.listen = async (...args) => {
    await originalListen(...args);
    if (options?.db) {
      loginDbByOrigin.set(server.origin, options.db);
    }
  };
  const originalClose = server.close.bind(server);
  server.close = async () => {
    loginDbByOrigin.delete(server.origin);
    await originalClose();
  };
  return server;
}

async function createPhoneAuthDevServerWithTestDb() {
  const db = await createMigratedTestDb();
  return createPhoneAuthDevServer({ db });
}

describe("phone auth dev server storage uploads", () => {
  it("supports prepare -> blob upload -> complete -> import -> query for local direct uploads", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "storage-upload-create-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Storage Upload Smoke Test",
          scriptInput: "Episode 1: direct upload smoke.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createProjectResponse.json();

      const prepareResponse = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "storage-upload-prepare-1",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          purpose: "asset-import/scene",
          fileName: "alley.png",
          contentType: "image/png",
          sizeBytes: 4,
        }),
      });
      const prepared = await prepareResponse.json();

      const blobResponse = await fetch(
        `${server.origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/blob`,
        {
          method: "PUT",
          headers: {
            "content-type": "image/png",
            cookie,
          },
          body: Buffer.from([1, 2, 3, 4]),
        },
      );
      const blobBody = await blobResponse.text();

      const completeResponse = await fetch(
        `${server.origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/complete`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const completed = await completeResponse.json();

      const importResponse = await fetch(`${server.origin}/api/creator/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          kind: "scene",
          name: "Imported Alley",
          uploadSessionId: prepared.uploadSessionId,
          storageObjectId: prepared.storageObjectId,
          mimeType: "image/png",
          width: 1024,
          height: 1024,
        }),
      });
      const imported = await importResponse.json();
      const coverResponse = await fetch(`${server.origin}/api/creator/project/cover`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          uploadSessionId: prepared.uploadSessionId,
          storageObjectId: prepared.storageObjectId,
        }),
      });
      const coverUpdated = await coverResponse.json();

      const detailResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detail = await detailResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(prepareResponse.status, 200);
      assert.equal(blobResponse.status, 200, blobBody);
      assert.equal(completeResponse.status, 200);
      assert.equal(importResponse.status, 200);
      assert.equal(coverResponse.status, 200);
      assert.equal(completed.storageObject.status, "available");
      assert.match(String(completed.urls?.sourceUrl ?? ""), /^\/uploads\/storage\//);
      assert.equal(coverUpdated.project?.coverStorageObjectId, prepared.storageObjectId);
      assert.equal(imported.asset?.assetType ?? imported.assetType ?? "scene_reference", "scene_reference");
      assert.ok(
        detail.assetsByType.scene.some(
          (asset: {
            label?: string;
            latestVersion?: { storageObjectId?: string | null } | null;
          }) =>
            asset.label === "Imported Alley" &&
            asset.latestVersion?.storageObjectId === prepared.storageObjectId,
        ),
      );
      assert.equal(detail.project?.coverStorageObjectId, prepared.storageObjectId);
      assert.match(String(detail.project?.coverImageUrl ?? ""), /^\/uploads\/storage\//);
    } finally {
      await server.close();
    }
  });

  it("binds completed direct uploads to an episode asset fixed image", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-bind-upload-create-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode Upload Bind",
          scriptInput: "Episode 1: bind uploaded role reference.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createProjectResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Upload" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const prepareResponse = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-bind-upload-prepare",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          purpose: "episode-role-reference",
          fileName: "hero.png",
          contentType: "image/png",
          sizeBytes: 4,
        }),
      });
      const prepared = await prepareResponse.json();

      const earlyBindResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/file-resources/bind`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            uploadSessionId: prepared.uploadSessionId,
            storageObjectId: prepared.storageObjectId,
            targetType: "asset",
            targetId: "role-local-1",
            mediaKind: "image",
          }),
        },
      );
      const earlyBind = await earlyBindResponse.json();

      await fetch(`${server.origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/blob`, {
        method: "PUT",
        headers: {
          "content-type": "image/png",
          cookie,
        },
        body: Buffer.from([1, 2, 3, 4]),
      });
      const completeResponse = await fetch(
        `${server.origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/complete`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const completed = await completeResponse.json();

      const bindResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/file-resources/bind`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            uploadSessionId: prepared.uploadSessionId,
            storageObjectId: prepared.storageObjectId,
            targetType: "asset",
            targetId: "role-local-1",
            mediaKind: "image",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const bound = await bindResponse.json();

      const setFixedResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/role-local-1/set-fixed-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-bind-upload-set-fixed",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: bound.data.fileResource.assetVersionId,
            storageObjectId: prepared.storageObjectId,
          }),
        },
      );
      const fixed = await setFixedResponse.json();

      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(prepareResponse.status, 200);
      assert.equal(earlyBindResponse.status, 400);
      assert.equal(earlyBind.errorCode, "storage_upload_not_ready");
      assert.equal(completeResponse.status, 200);
      assert.equal(completed.storageObject.status, "available");
      assert.equal(bindResponse.status, 200);
      assert.equal(bound.data.fileResource.storageObjectId, prepared.storageObjectId);
      assert.equal(bound.data.fileResource.fileKind, "image");
      assert.match(bound.data.file.previewUrl, /^\/uploads\/storage\//);
      assert.equal(setFixedResponse.status, 200);
      assert.equal(fixed.data.asset.fixedImageStorageObjectId, prepared.storageObjectId);
      assert.equal(fixed.data.asset.fixedImageFileId, bound.data.fileResource.assetVersionId);
      assert.match(fixed.data.asset.fixedImageUrl, /^\/uploads\/storage\//);
    } finally {
      await server.close();
    }
  });

  it("deletes unreferenced episode file resources and blocks in-use files", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-delete-file-create-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode Delete File",
          scriptInput: "Episode 1: delete unused uploads.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createProjectResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Delete" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;
      const createShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          episodeId,
          title: "Delete File Shot",
          description: "Shot for delete resource checks.",
        }),
      });
      const storyboardId = (await createShotResponse.json()).shot.id;

      async function uploadAndBind(name: string) {
        const prepareResponse = await fetch(`${server.origin}/api/storage/upload-sessions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `episode-delete-file-prepare-${name}`,
            cookie,
          },
          body: JSON.stringify({
            projectId: created.project.id,
            purpose: "storyboard-image",
            fileName: `${name}.png`,
            contentType: "image/png",
            sizeBytes: 4,
          }),
        });
        const prepared = await prepareResponse.json();
        await fetch(`${server.origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/blob`, {
          method: "PUT",
          headers: {
            "content-type": "image/png",
            cookie,
          },
          body: Buffer.from([1, 2, 3, 4]),
        });
        await fetch(`${server.origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/complete`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        });
        const bindResponse = await fetch(
          `${server.origin}/api/episodes/${episodeId}/file-resources/bind`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie,
            },
            body: JSON.stringify({
              uploadSessionId: prepared.uploadSessionId,
              storageObjectId: prepared.storageObjectId,
              targetType: "storyboard",
              targetId: storyboardId,
              mediaKind: "image",
            }),
          },
        );
        return (await bindResponse.json()).data;
      }

      const unused = await uploadAndBind("unused");
      const used = await uploadAndBind("used");

      const deleteUnusedResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/file-resources/${unused.fileResource.storageObjectId}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: unused.fileResource.assetVersionId,
            storageObjectId: unused.fileResource.storageObjectId,
          }),
        },
      );
      const deletedUnused = await deleteUnusedResponse.json();

      await fetch(
        `${server.origin}/api/episodes/${episodeId}/storyboards/${storyboardId}/set-current-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: used.fileResource.assetVersionId,
            storageObjectId: used.fileResource.storageObjectId,
          }),
        },
      );
      const deleteUsedResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/file-resources/${used.fileResource.storageObjectId}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: used.fileResource.assetVersionId,
            storageObjectId: used.fileResource.storageObjectId,
          }),
        },
      );
      const deleteUsed = await deleteUsedResponse.json();

      assert.equal(deleteUnusedResponse.status, 200);
      assert.equal(deletedUnused.data.deleted, true);
      assert.equal(deletedUnused.data.status, "deleted");
      assert.equal(deleteUsedResponse.status, 409);
      assert.equal(deleteUsed.errorCode, "file_in_use");
    } finally {
      await server.close();
    }
  });

  it("rejects episode file binding when the upload reference is missing", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "storage-upload-create-project-bind-guard",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode Bind Guard",
          scriptInput: "Episode 1: reject missing direct upload references.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createProjectResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Bind Guard" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const bindResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/file-resources/bind`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            uploadSessionId: "not-a-uuid",
            storageObjectId: "also-not-a-uuid",
            targetType: "asset",
            targetId: "role-local-1",
            mediaKind: "image",
          }),
        },
      );
      const bound = await bindResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(bindResponse.status, 400);
      assert.equal(bound.errorCode, "invalid_upload_reference");
    } finally {
      await server.close();
    }
  });

  it("enforces market upload limits during direct upload preparation", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "storage-upload-limits-create-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Storage Upload Limits",
          scriptInput: "Episode 1: enforce upload limits.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createProjectResponse.json();

      const oversizedVideoResponse = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "storage-upload-limit-video",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          purpose: "storyboard-video",
          fileName: "too-large.mp4",
          contentType: "video/mp4",
          sizeBytes: 500 * 1024 * 1024 + 1,
        }),
      });
      const oversizedVideo = await oversizedVideoResponse.json();

      const blockedExecutableResponse = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "storage-upload-limit-exe",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          purpose: "storyboard-image",
          fileName: "sneaky.exe",
          contentType: "image/png",
          sizeBytes: 4,
        }),
      });
      const blockedExecutable = await blockedExecutableResponse.json();

      const mismatchedMimeResponse = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "storage-upload-limit-mime",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          purpose: "storyboard-image",
          fileName: "frame.png",
          contentType: "application/octet-stream",
          sizeBytes: 4,
        }),
      });
      const mismatchedMime = await mismatchedMimeResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(oversizedVideoResponse.status, 413);
      assert.equal(oversizedVideo.errorCode, "upload_file_too_large");
      assert.equal(oversizedVideo.details.maxBytes, 500 * 1024 * 1024);
      assert.equal(blockedExecutableResponse.status, 400);
      assert.equal(blockedExecutable.errorCode, "upload_type_not_allowed");
      assert.equal(mismatchedMimeResponse.status, 400);
      assert.equal(mismatchedMime.errorCode, "upload_mime_not_allowed");
    } finally {
      await server.close();
    }
  });
});

async function login(origin: string, phone: string) {
  const fallbackDb = loginDbByOrigin.get(origin) ? null : await createDevDb();
  const db = loginDbByOrigin.get(origin) ?? fallbackDb!;
  try {
    const normalizedPhone = normalizeCnPhone(phone);
    await ensurePasswordLoginUser(db, normalizedPhone);
    const password = defaultPasswordFromPhone(normalizedPhone);
    const passwordResponse = await fetch(`${origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: normalizedPhone,
        password,
      }),
    });

    assert.equal(passwordResponse.status, 200);
    return passwordResponse.headers.get("set-cookie") ?? "";
  } finally {
    await fallbackDb?.close();
  }
}

async function ensurePasswordLoginUser(
  db: Awaited<ReturnType<typeof createDevDb>>,
  phone: string,
) {
  const passwordHash = await createUserPasswordHash(defaultPasswordFromPhone(phone));
  await db.query(
    `
      INSERT INTO users (id, phone_e164, password_hash, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (phone_e164)
      DO UPDATE SET
        password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
        status = 'active'
    `,
    [randomUUID(), phone, passwordHash],
  );
}
