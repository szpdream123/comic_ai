import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import qcloudCosSts from "qcloud-cos-sts";

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

async function createPhoneAuthDevServerWithTestDb(
  options: Omit<NonNullable<Parameters<typeof createPhoneAuthDevServerBase>[0]>, "db"> = {},
) {
  const db = await createMigratedTestDb();
  return createPhoneAuthDevServer({ ...options, db });
}

describe("phone auth dev server storage uploads", () => {
  it("returns a storage credential error when COS STS preparation fails", async () => {
    const server = await createPhoneAuthDevServerWithTestDb({
      storageRuntime: {
        mode: "cos",
        provider: "tencent_cos",
        bucket: "test-bucket",
        region: "ap-guangzhou",
        stsSecretId: "test-secret-id",
        stsSecretKey: "test-secret-key",
      },
    });
    const originalGetCredential = qcloudCosSts.getCredential;
    qcloudCosSts.getCredential = async () => {
      throw {
        Code: "AuthFailure.SecretIdNotFound",
        Message: "The SecretId is not found.",
        RequestId: "sts-route-request-1",
      };
    };

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const prepareResponse = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "storage-upload-sts-error",
          cookie,
        },
        body: JSON.stringify({
          purpose: "storyboard-image",
          fileName: "frame.png",
          contentType: "image/png",
          sizeBytes: 4,
        }),
      });
      const prepared = await prepareResponse.json();

      assert.equal(prepareResponse.status, 503);
      assert.equal(prepared.errorCode, "storage_credentials_invalid");
      assert.equal(prepared.details.providerCode, "AuthFailure.SecretIdNotFound");
      assert.equal(prepared.details.providerRequestId, "sts-route-request-1");
    } finally {
      qcloudCosSts.getCredential = originalGetCredential;
      await server.close();
    }
  });

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
      const persistedCover = await loginDbByOrigin.get(server.origin)!.query<{
        cover_image_url: string | null;
        cover_storage_object_id: string | null;
      }>(
        "SELECT cover_image_url, cover_storage_object_id FROM projects WHERE id = $1",
        [created.project.id],
      );

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
      assert.match(String(completed.urls?.sourceUrl ?? ""), /^(?:https:\/\/|\/uploads\/storage\/)/);
      assert.equal(coverUpdated.project?.coverStorageObjectId, prepared.storageObjectId);
      assert.equal(persistedCover.rows[0]?.cover_image_url, completed.urls?.sourceUrl);
      assert.equal(persistedCover.rows[0]?.cover_storage_object_id, prepared.storageObjectId);
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
      assert.match(String(detail.project?.coverImageUrl ?? ""), /^(?:https:\/\/|\/uploads\/storage\/)/);
    } finally {
      await server.close();
    }
  });

  it("returns uploaded session status for completion recovery", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const prepareResponse = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "storage-upload-status-prepare",
          cookie,
        },
        body: JSON.stringify({
          purpose: "asset-import/character",
          fileName: "team-hero.png",
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

      const statusResponse = await fetch(
        `${server.origin}/api/storage/upload-sessions/${prepared.uploadSessionId}`,
        {
          headers: { cookie },
        },
      );
      const status = await statusResponse.json();

      assert.equal(prepareResponse.status, 200);
      assert.equal(statusResponse.status, 200);
      assert.equal(status.uploadSession.status, "uploaded");
      assert.equal(status.storageObject.id, prepared.storageObjectId);
      assert.equal(status.storageObject.status, "available");
      assert.ok(String(status.urls?.sourceUrl ?? "").length > 0);
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
      const createAssetResponse = await fetch(`${server.origin}/api/episodes/${episodeId}/assets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          assetType: "role",
          name: "Upload Hero",
          description: "Role reference upload target",
        }),
      });
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

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
            targetId: assetId,
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
            targetId: assetId,
            mediaKind: "image",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const bound = await bindResponse.json();

      const setFixedResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/set-fixed-image`,
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
      assert.equal(createAssetResponse.status, 200);
      assert.equal(prepareResponse.status, 200);
      assert.equal(earlyBindResponse.status, 400);
      assert.equal(earlyBind.errorCode, "storage_upload_not_ready");
      assert.equal(completeResponse.status, 200);
      assert.equal(completed.storageObject.status, "available");
      assert.equal(bindResponse.status, 200);
      assert.equal(bound.data.fileResource.storageObjectId, prepared.storageObjectId);
      assert.equal(bound.data.fileResource.fileKind, "image");
      assert.match(bound.data.file.previewUrl, /^(?:https:\/\/|\/uploads\/storage\/)/);
      assert.equal(setFixedResponse.status, 200, JSON.stringify(fixed));
      assert.equal(fixed.data.asset.fixedImageStorageObjectId, prepared.storageObjectId);
      assert.equal(fixed.data.asset.fixedImageFileId, bound.data.fileResource.assetVersionId);
      assert.match(fixed.data.asset.fixedImageUrl, /^(?:https:\/\/|\/uploads\/storage\/)/);
    } finally {
      await server.close();
    }
  });

  it("binds completed direct video uploads to episode attachments", async () => {
    const server = await createPhoneAuthDevServerWithTestDb();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-bind-video-upload-create-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode Video Upload Bind",
          scriptInput: "Episode 1: bind uploaded video attachment.",
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
          body: JSON.stringify({ title: "Episode Video Upload" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const prepareResponse = await fetch(`${server.origin}/api/storage/upload-sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-bind-video-upload-prepare",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          purpose: "episode-attachments/video",
          fileName: "clip.mp4",
          contentType: "video/mp4",
          sizeBytes: 4,
        }),
      });
      const prepared = await prepareResponse.json();

      await fetch(`${server.origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/blob`, {
        method: "PUT",
        headers: {
          "content-type": "video/mp4",
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
            targetType: "episode",
            targetId: episodeId,
            mediaKind: "video",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const bound = await bindResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(prepareResponse.status, 200);
      assert.equal(completeResponse.status, 200);
      assert.equal(bindResponse.status, 200);
      assert.equal(bound.data.fileResource.fileKind, "video");
      assert.equal(bound.data.fileResource.ownerType, "episode");
      assert.equal(bound.data.fileResource.ownerId, episodeId);
      assert.equal(bound.data.fileResource.storageObjectId, prepared.storageObjectId);
      assert.match(bound.data.file.previewUrl, /^(?:https:\/\/|\/uploads\/storage\/)/);
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
      const canvasCurrent = await uploadAndBind("canvas-current");
      const canvasHistorical = await uploadAndBind("canvas-historical");
      const canvasArtifact = await uploadAndBind("canvas-artifact");
      const db = loginDbByOrigin.get(server.origin)!;
      const userId = (
        await db.query<{ id: string }>("SELECT id FROM users WHERE phone_e164 = $1", [normalizeCnPhone("13800138000")])
      ).rows[0]!.id;
      const canvasProjectId = randomUUID();
      const canvasDocumentId = randomUUID();
      await db.query(
        `
          INSERT INTO creator_canvas_projects (
            id, title, status, server_revision,
            created_by_user_id, updated_by_user_id
          )
          VALUES ($1, 'File retention canvas', 'active', 2, $2, $2)
        `,
        [canvasProjectId, userId],
      );
      await db.query(
        `
          INSERT INTO creator_canvas_documents (
            id, canvas_project_id, server_revision,
            document_json, created_by_user_id, updated_by_user_id
          )
          VALUES ($1, $2, 2, $3::jsonb, $4, $4)
        `,
        [
          canvasDocumentId,
          canvasProjectId,
          JSON.stringify({ nodes: [
            { id: "current", data: { loomicElement: { customData: { resultStorageObjectId: canvasCurrent.fileResource.storageObjectId } } } },
            { id: "artifact-reference", data: {} },
          ] }),
          userId,
        ],
      );
      await db.query(
        "UPDATE creator_canvas_projects SET latest_document_id = $2 WHERE id = $1",
        [canvasProjectId, canvasDocumentId],
      );
      await db.query(
        `
          INSERT INTO creator_canvas_nodes (
            id, canvas_project_id, node_key, node_type, status,
            created_by_user_id, updated_by_user_id
          )
          VALUES ($1, $2, 'artifact-reference', 'output', 'completed', $3, $3)
        `,
        [randomUUID(), canvasProjectId, userId],
      );
      await db.query(
        `
          INSERT INTO creator_canvas_node_artifacts (
            id, canvas_project_id, node_key, artifact_kind,
            asset_id, asset_version_id, storage_object_id,
            selected, created_by_user_id
          )
          VALUES
            ($1, $2, 'artifact-reference', 'video', $3, $4, NULL, true, $5),
            ($6, $2, 'artifact-reference', 'video', $3, NULL, NULL, false, $5)
        `,
        [
          randomUUID(),
          canvasProjectId,
          canvasArtifact.fileResource.assetId,
          canvasArtifact.fileResource.assetVersionId,
          userId,
          randomUUID(),
        ],
      );
      await db.query(
        `
          INSERT INTO creator_canvas_revisions (
            id, canvas_project_id, server_revision, operation,
            document_json, created_by_user_id
          )
          VALUES ($1, $2, 1, 'save', $3::jsonb, $4)
        `,
        [
          randomUUID(),
          canvasProjectId,
          JSON.stringify({ nodes: [{ id: "historical", data: { loomicElement: { customData: { resultStorageObjectId: canvasHistorical.fileResource.storageObjectId } } } }] }),
          userId,
        ],
      );

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

      const deleteCanvasCurrentResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/file-resources/${canvasCurrent.fileResource.storageObjectId}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: canvasCurrent.fileResource.assetVersionId,
            storageObjectId: canvasCurrent.fileResource.storageObjectId,
          }),
        },
      );
      const deleteCanvasCurrent = await deleteCanvasCurrentResponse.json();
      const deleteCanvasHistoricalResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/file-resources/${canvasHistorical.fileResource.storageObjectId}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: canvasHistorical.fileResource.assetVersionId,
            storageObjectId: canvasHistorical.fileResource.storageObjectId,
          }),
        },
      );
      const deleteCanvasHistorical = await deleteCanvasHistoricalResponse.json();
      const deleteCanvasArtifactResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/file-resources/${canvasArtifact.fileResource.storageObjectId}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: canvasArtifact.fileResource.assetVersionId,
            storageObjectId: canvasArtifact.fileResource.storageObjectId,
          }),
        },
      );
      const deleteCanvasArtifact = await deleteCanvasArtifactResponse.json();
      const retainedObjects = await db.query<{ id: string; status: string }>(
        "SELECT id, status FROM storage_objects WHERE id = ANY($1::uuid[]) ORDER BY id",
        [[
          canvasCurrent.fileResource.storageObjectId,
          canvasHistorical.fileResource.storageObjectId,
          canvasArtifact.fileResource.storageObjectId,
        ]],
      );
      const removedVersions = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM asset_versions WHERE id = ANY($1::uuid[])",
        [[
          unused.fileResource.assetVersionId,
          canvasCurrent.fileResource.assetVersionId,
          canvasHistorical.fileResource.assetVersionId,
          canvasArtifact.fileResource.assetVersionId,
        ]],
      );
      const detachedArtifacts = await db.query<{
        asset_id: string | null;
        asset_version_id: string | null;
        storage_object_id: string | null;
      }>(
        `
          SELECT asset_id, asset_version_id, storage_object_id
          FROM creator_canvas_node_artifacts
          WHERE canvas_project_id = $1
            AND node_key = 'artifact-reference'
          ORDER BY storage_object_id NULLS LAST
        `,
        [canvasProjectId],
      );

      assert.equal(deleteUnusedResponse.status, 200);
      assert.equal(deletedUnused.data.deleted, true);
      assert.equal(deletedUnused.data.status, "deleted");
      assert.equal(deleteUsedResponse.status, 409);
      assert.equal(deleteUsed.errorCode, "file_in_use");
      assert.equal(deleteCanvasCurrentResponse.status, 200);
      assert.equal(deleteCanvasCurrent.data.deleted, true);
      assert.equal(deleteCanvasCurrent.data.storageRetained, true);
      assert.equal(deleteCanvasCurrent.data.status, "available");
      assert.equal(deleteCanvasHistoricalResponse.status, 200);
      assert.equal(deleteCanvasHistorical.data.deleted, true);
      assert.equal(deleteCanvasHistorical.data.storageRetained, true);
      assert.equal(deleteCanvasHistorical.data.status, "available");
      assert.equal(deleteCanvasArtifactResponse.status, 200);
      assert.equal(deleteCanvasArtifact.data.deleted, true);
      assert.equal(deleteCanvasArtifact.data.storageRetained, true);
      assert.equal(deleteCanvasArtifact.data.status, "available");
      assert.deepEqual(retainedObjects.rows, [
        { id: canvasCurrent.fileResource.storageObjectId, status: "available" },
        { id: canvasHistorical.fileResource.storageObjectId, status: "available" },
        { id: canvasArtifact.fileResource.storageObjectId, status: "available" },
      ].sort((left, right) => left.id.localeCompare(right.id)));
      assert.equal(removedVersions.rows[0]?.count, 0);
      assert.deepEqual(detachedArtifacts.rows, [
        {
          asset_id: null,
          asset_version_id: null,
          storage_object_id: canvasArtifact.fileResource.storageObjectId,
        },
        {
          asset_id: null,
          asset_version_id: null,
          storage_object_id: canvasArtifact.fileResource.storageObjectId,
        },
      ]);
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
