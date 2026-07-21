import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("composes archived connected canvas media into one persisted MP4 idempotently", async () => {
  const db = await createMigratedTestDb();
  const root = await mkdtemp(join(tmpdir(), "canvas-composition-http-test-"));
  const imagePath = join(root, "source.png");
  execFileSync(ffmpegInstaller.path, [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=64x64:d=0.2",
    "-frames:v", "1", "-y", imagePath,
  ], { windowsHide: true });
  const imageBytes = await readFile(imagePath);
  const uploadedBodies: Buffer[] = [];
  const deletedObjectKeys: string[] = [];
  let sourceDownloadFails = false;
  let failNextArtifactInsert = false;
  const originalQuery = db.query.bind(db);
  const serverDb = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "query") {
        return (...args: Parameters<typeof db.query>) => {
          if (failNextArtifactInsert && String(args[0]).includes("INSERT INTO creator_canvas_node_artifacts")) {
            failNextArtifactInsert = false;
            return Promise.reject(new Error("injected_canvas_artifact_insert_failure"));
          }
          return originalQuery(...args);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const server = createPhoneAuthDevServer({
    db: serverDb,
    env: {
      NODE_ENV: "test",
      AUTH_SESSION_REDIS_CACHE_ENABLED: "false",
      STORAGE_OBJECT_ROOT_PREFIX: "test-assets",
    },
    fetchImpl: async (url) => {
      assert.equal(String(url), "https://storage.example.test/canvas/source.png");
      if (sourceDownloadFails) {
        return new Response("unavailable", { status: 503 });
      }
      return new Response(imageBytes, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(imageBytes.byteLength) },
      });
    },
    storageRuntime: {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-shanghai",
      publicBaseUrl: "https://cdn.example.test",
      adapter: {
        async createSignedReadUrl({ objectKey, expiresAt }) {
          assert.equal(objectKey, "canvas/source.png");
          return { url: "https://storage.example.test/canvas/source.png", expiresAt };
        },
        async putObject({ body }) {
          uploadedBodies.push(Buffer.from(body as Uint8Array));
          return { eTag: "composition-etag" };
        },
        async headObject() {
          return { exists: true };
        },
        async deleteObject({ objectKey }) {
          deletedObjectKeys.push(objectKey);
        },
      },
    },
    repairScheduler: { enabled: false },
  });
  const phone = "13900000039";
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sourceStorageObjectId = randomUUID();

  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
      [otherUserId, "13900000040", await createUserPasswordHash(defaultPasswordFromPhone("13900000040"))],
    );
    await db.query(
      `
        INSERT INTO storage_objects (
          id, bucket, object_key, content_type, size_bytes,
          created_by_user_id, provider, status
        )
        VALUES ($1, 'creator-test', 'canvas/source.png', 'image/png', $2, $3, 'tencent_cos', 'available')
      `,
      [sourceStorageObjectId, imageBytes.byteLength, userId],
    );
    await server.listen(0);
    const loginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const createResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "composition-canvas-create", cookie },
      body: JSON.stringify({ title: "合成测试" }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as { data: { project: { id: string } } };
    const canvasProjectId = created.data.project.id;
    const imageNodeId = "image-node";
    const compositionNodeId = "composition-node";

    const saveResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${canvasProjectId}/canvas`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        clientRevision: 1,
        document: {
          version: 2,
          canvasProjectId,
          projectId: canvasProjectId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: imageNodeId,
              type: "upload",
              position: { x: 0, y: 0 },
              size: { width: 320, height: 180 },
              data: {
                ports: { inputs: [], outputs: [{ id: "out_image", kind: "image" }] },
                loomicElementVersion: 1,
                loomicElement: { type: "image", customData: { mediaKind: "image", storageObjectId: sourceStorageObjectId } },
              },
            },
            {
              id: compositionNodeId,
              type: "output",
              position: { x: 400, y: 0 },
              size: { width: 380, height: 210 },
              data: {
                ports: { inputs: [{ id: "in_media", kind: "any", accepts: ["image", "video"] }], outputs: [] },
                loomicElementVersion: 1,
                loomicElement: { type: "rectangle", customData: { type: "video-composition-node", mediaKind: "video" } },
              },
            },
          ],
          edges: [{ id: "edge-1", sourceNodeId: imageNodeId, sourcePortId: "out_image", targetNodeId: compositionNodeId, targetPortId: "in_media", data: { kind: "image" } }],
          groups: [],
        },
        events: [],
      }),
    });
    assert.equal(saveResponse.status, 200);

    const requestBody = {
      canvasProjectId,
      nodeId: compositionNodeId,
      width: 320,
      height: 180,
      fps: 24,
      clips: [{ nodeId: imageNodeId, durationSeconds: 0.5 }],
    };
    const request = (idempotencyKey = "composition-run-1", body = requestBody) => fetch(`${server.origin}/api/new-canvas/video-compositions`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, cookie },
      body: JSON.stringify(body),
    });
    const compositionResponse = await request();
    const composed = await compositionResponse.json() as { data: { artifact: Record<string, unknown> } };
    assert.equal(compositionResponse.status, 200);
    assert.equal(composed.data.artifact.mimeType, "video/mp4");
    assert.equal(composed.data.artifact.storageObjectId ? true : false, true);
    assert.match(String(composed.data.artifact.url), /^https:\/\/cdn\.example\.test\//);
    assert.equal(uploadedBodies.length, 1);
    assert.equal(uploadedBodies[0]?.subarray(4, 8).toString("ascii"), "ftyp");
    const uploadedPath = join(root, "uploaded-composition.mp4");
    await writeFile(uploadedPath, uploadedBodies[0]!);
    const probe = JSON.parse(execFileSync(ffprobeInstaller.path, [
      "-v", "error",
      "-show_entries", "format=format_name:stream=codec_type,codec_name,width,height",
      "-of", "json",
      uploadedPath,
    ], { encoding: "utf8", windowsHide: true })) as {
      streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
      format?: { format_name?: string };
    };
    const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
    assert.equal(videoStream?.codec_name, "h264");
    assert.equal(videoStream?.width, 320);
    assert.equal(videoStream?.height, 180);
    assert.equal(probe.format?.format_name?.split(",").includes("mp4"), true);

    const replayResponse = await request();
    const replayed = await replayResponse.json();
    assert.equal(replayResponse.status, 200);
    assert.deepEqual(replayed.data.artifact, composed.data.artifact);
    assert.equal(uploadedBodies.length, 1);

    const conflictResponse = await request("composition-run-1", { ...requestBody, width: 322 });
    assert.equal(conflictResponse.status, 409);
    assert.equal((await conflictResponse.json() as { errorCode?: string }).errorCode, "idempotency_conflict");
    assert.equal(uploadedBodies.length, 1);

    await db.query("UPDATE storage_objects SET created_by_user_id = $2 WHERE id = $1", [sourceStorageObjectId, otherUserId]);
    const forbiddenSourceResponse = await request("composition-run-other-owner");
    assert.equal(forbiddenSourceResponse.status, 404);
    assert.equal(
      (await forbiddenSourceResponse.json() as { errorCode?: string }).errorCode,
      "canvas_video_composition_source_not_found",
    );
    assert.equal(uploadedBodies.length, 1);
    await db.query("UPDATE storage_objects SET created_by_user_id = $2 WHERE id = $1", [sourceStorageObjectId, userId]);

    sourceDownloadFails = true;
    const failedResponse = await request("composition-run-download-failure");
    assert.equal(failedResponse.status, 422);
    const failedBody = await failedResponse.json() as { errorCode?: string };
    assert.equal(failedBody.errorCode, "canvas_video_composition_source_download_failed");
    sourceDownloadFails = false;
    const failedReplayResponse = await request("composition-run-download-failure");
    assert.equal(failedReplayResponse.status, 422);
    assert.equal(
      (await failedReplayResponse.json() as { errorCode?: string }).errorCode,
      failedBody.errorCode,
    );
    assert.equal(uploadedBodies.length, 1);

    failNextArtifactInsert = true;
    const finalizationFailureResponse = await request("composition-run-finalization-failure");
    assert.equal(finalizationFailureResponse.status, 422);
    assert.equal(
      (await finalizationFailureResponse.json() as { errorCode?: string }).errorCode,
      "canvas_video_composition_failed",
    );
    assert.equal(uploadedBodies.length, 2);
    assert.equal(deletedObjectKeys.length, 1);
    assert.match(deletedObjectKeys[0] ?? "", /canvas-compositions\/\d{4}\/\d{2}\/\d{2}\/.+\.mp4$/);
    const finalizationReplayResponse = await request("composition-run-finalization-failure");
    assert.equal(finalizationReplayResponse.status, 422);
    assert.equal(uploadedBodies.length, 2);
    assert.equal(deletedObjectKeys.length, 1);

    const run = await db.query<{ idempotency_key: string; status: string }>(
      "SELECT idempotency_key, status FROM creator_canvas_node_runs WHERE canvas_project_id = $1 AND node_key = $2 ORDER BY idempotency_key",
      [canvasProjectId, compositionNodeId],
    );
    const artifact = await db.query<{ storage_object_id: string; artifact_kind: string }>(
      "SELECT storage_object_id, artifact_kind FROM creator_canvas_node_artifacts WHERE canvas_project_id = $1 AND node_key = $2",
      [canvasProjectId, compositionNodeId],
    );
    assert.deepEqual(run.rows, [
      { idempotency_key: "composition-run-1", status: "succeeded" },
      { idempotency_key: "composition-run-download-failure", status: "failed" },
      { idempotency_key: "composition-run-finalization-failure", status: "failed" },
      { idempotency_key: "composition-run-other-owner", status: "failed" },
    ]);
    assert.equal(artifact.rows.length, 1);
    assert.equal(artifact.rows[0]?.artifact_kind, "video");
    assert.equal(artifact.rows[0]?.storage_object_id, composed.data.artifact.storageObjectId);
    const outputObject = await db.query<{ status: string; created_by_user_id: string; content_type: string }>(
      "SELECT status, created_by_user_id, content_type FROM storage_objects WHERE id = $1",
      [composed.data.artifact.storageObjectId],
    );
    assert.equal(outputObject.rows[0]?.status, "available");
    assert.equal(outputObject.rows[0]?.created_by_user_id, userId);
    assert.equal(outputObject.rows[0]?.content_type, "video/mp4");
    const deletedObject = await db.query<{ status: string }>(
      "SELECT status FROM storage_objects WHERE object_key = $1",
      [deletedObjectKeys[0]],
    );
    assert.equal(deletedObject.rows[0]?.status, "deleted");
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
