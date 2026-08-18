import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import { findStorageObject, type StorageAdapter } from "../storage.service.ts";
import {
  abortUploadSession,
  completeUploadSession,
  createUploadSession,
  findUploadSession,
  normalizeCosStsError,
  runStorageRepairJob,
  type UploadSessionRuntime,
} from "../upload-session.service.ts";

describe("upload session service", () => {
  it("replays prepare requests by idempotency key", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");

      const first = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-videos",
        fileName: "shot-01.mp4",
        contentType: "video/mp4",
        sizeBytes: 2048,
        checksum: "checksum-1",
        multipart: true,
        idempotencyKey: "upload:storyboard-videos:shot-01.mp4",
        now: new Date("2026-05-27T02:00:00.000Z"),
        runtime,
      });
      const replay = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-videos",
        fileName: "shot-01.mp4",
        contentType: "video/mp4",
        sizeBytes: 2048,
        checksum: "checksum-1",
        multipart: true,
        idempotencyKey: "upload:storyboard-videos:shot-01.mp4",
        now: new Date("2026-05-27T02:01:00.000Z"),
        runtime,
      });

      assert.equal(replay.uploadSessionId, first.uploadSessionId);
      assert.equal(replay.storageObjectId, first.storageObjectId);
      assert.equal(
        first.objectKey,
        `AIManhuaDrama/20260527/${first.storageObjectId}-shot-01.mp4`,
      );
      assert.equal(
        replay.upload?.url,
        `/api/storage/upload-sessions/${encodeURIComponent(first.uploadSessionId)}/blob`,
      );
    } finally {
      await db.close();
    }
  });

  it("scopes Canvas Agent uploads to an authorized canvas", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const actor = createActor("00000000-0000-4000-8000-000000000001");
      const canvasId = "70000000-0000-4000-8000-000000000010";
      const foreignCanvasId = "70000000-0000-4000-8000-000000000011";
      await db.query(`
        INSERT INTO creator_canvas_projects (
          id, title, status, server_revision, created_by_user_id, updated_by_user_id
        ) VALUES
          ($1, 'Attachment canvas', 'active', 1, $3, $3),
          ($2, 'Foreign canvas', 'active', 1, $4, $4)
      `, [canvasId, foreignCanvasId, actor.userId, "00000000-0000-4000-8000-000000000002"]);

      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        canvasProjectId: canvasId,
        purpose: "canvas-agent-attachments",
        fileName: "notes.txt",
        contentType: "text/plain",
        sizeBytes: 128,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:canvas-agent:canvas-1:notes.txt",
        now: new Date("2026-05-27T02:00:00.000Z"),
        runtime: createRuntime(localObjectStore),
      });
      const object = await findStorageObject(db, prepared.storageObjectId);
      assert.equal(object?.canvasProjectId, canvasId);

      await assert.rejects(
        createUploadSession(db, {
          actor,
          sessionToken: "owner-token",
          canvasProjectId: foreignCanvasId,
          purpose: "canvas-agent-attachments",
          fileName: "foreign.txt",
          contentType: "text/plain",
          sizeBytes: 128,
          checksum: null,
          multipart: false,
          idempotencyKey: "upload:canvas-agent:foreign:notes.txt",
          now: new Date("2026-05-27T02:00:00.000Z"),
          runtime: createRuntime(localObjectStore),
        }),
        /canvas_not_found/,
      );
    } finally {
      await db.close();
    }
  });

  it("completes a local upload and marks the object available", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");
      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "shot-01.png",
        contentType: "image/png",
        sizeBytes: 1024,
        checksum: "checksum-2",
        multipart: false,
        idempotencyKey: "upload:storyboard-images:shot-01.png",
        now: new Date("2026-05-27T02:10:00.000Z"),
        runtime,
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "image/png",
        contentLength: 1024,
        checksum: "checksum-2",
        eTag: "etag-2",
      });

      const completed = await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: prepared.uploadSessionId,
        eTag: "etag-2",
        now: new Date("2026-05-27T02:11:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });

      const storedObject = await findStorageObject(db, prepared.storageObjectId);
      const storedSession = await findUploadSession(db, prepared.uploadSessionId);

      assert.equal(completed.storageObject.status, "available");
      assert.equal(completed.storageObject.etag, "etag-2");
      assert.equal(
        prepared.objectKey,
        `AIManhuaDrama/20260527/${prepared.storageObjectId}-shot-01.png`,
      );
      assert.equal(
        completed.urls.sourceUrl,
        `signed://creator-dev/${prepared.objectKey}`,
      );
      assert.equal(storedObject?.status, "available");
      assert.equal(storedSession?.status, "uploaded");
    } finally {
      await db.close();
    }
  });

  it("rejects a completed upload when the stored object size differs from the session", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");
      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "shot-oversized.png",
        contentType: "image/png",
        sizeBytes: 1024,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:shot-oversized.png",
        now: new Date("2026-05-27T02:12:00.000Z"),
        runtime,
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "image/png",
        contentLength: 1025,
      });

      await assert.rejects(
        completeUploadSession(db, {
          actor,
          sessionToken: "owner-token",
          uploadSessionId: prepared.uploadSessionId,
          now: new Date("2026-05-27T02:13:00.000Z"),
          runtime,
          signedUrlExpiresInSeconds: 900,
        }),
        /storage_object_size_mismatch/,
      );

      const storedObject = await findStorageObject(db, prepared.storageObjectId);
      const storedSession = await findUploadSession(db, prepared.uploadSessionId);
      assert.equal(storedObject?.status, "pending_upload");
      assert.equal(storedSession?.status, "created");
    } finally {
      await db.close();
    }
  });

  it("completes an upload owned by the current user", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");
      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "asset-generator",
        fileName: "reference.png",
        contentType: "image/png",
        sizeBytes: 4,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:asset-generator:reference.png",
        now: new Date("2026-05-27T02:15:00.000Z"),
        runtime,
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "image/png",
        contentLength: 4,
      });

      const completed = await completeUploadSession(db, {
        actor: {
          ...actor,
        },
        sessionToken: "owner-token",
        uploadSessionId: prepared.uploadSessionId,
        now: new Date("2026-05-27T02:16:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });

      assert.equal(completed.uploadSession.status, "uploaded");
      assert.equal(completed.storageObject.status, "available");
    } finally {
      await db.close();
    }
  });

  it("aborts an upload and tombstones the object", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");
      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "asset-import/character",
        fileName: "hero.png",
        contentType: "image/png",
        sizeBytes: 512,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:asset-import/character:hero.png",
        now: new Date("2026-05-27T02:20:00.000Z"),
        runtime,
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "image/png",
        contentLength: 512,
      });

      const aborted = await abortUploadSession(db, {
        actor,
        uploadSessionId: prepared.uploadSessionId,
        now: new Date("2026-05-27T02:21:00.000Z"),
        runtime,
      });

      const storedObject = await findStorageObject(db, prepared.storageObjectId);

      assert.equal(aborted.status, "aborted");
      assert.equal(storedObject?.status, "deleted");
      assert.equal(localObjectStore.has(prepared.objectKey), false);
    } finally {
      await db.close();
    }
  });

  it("does not abort a session that already completed upload", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");
      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "asset-import/character",
        fileName: "completed-hero.png",
        contentType: "image/png",
        sizeBytes: 512,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:asset-import/character:completed-hero.png",
        now: new Date("2026-05-27T02:22:00.000Z"),
        runtime,
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "image/png",
        contentLength: 512,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: prepared.uploadSessionId,
        now: new Date("2026-05-27T02:23:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });

      const aborted = await abortUploadSession(db, {
        actor,
        uploadSessionId: prepared.uploadSessionId,
        now: new Date("2026-05-27T02:24:00.000Z"),
        runtime,
      });

      const storedObject = await findStorageObject(db, prepared.storageObjectId);

      assert.equal(aborted.status, "uploaded");
      assert.equal(storedObject?.status, "available");
      assert.equal(localObjectStore.has(prepared.objectKey), true);
    } finally {
      await db.close();
    }
  });

  it("rejects another user trying to complete someone else's upload session", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const runtime = createRuntime(localObjectStore);
      const prepared = await createUploadSession(db, {
        actor: createActor("00000000-0000-4000-8000-000000000001"),
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "private.png",
        contentType: "image/png",
        sizeBytes: 256,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:private.png",
        now: new Date("2026-05-27T02:30:00.000Z"),
        runtime,
      });

      await assert.rejects(
        completeUploadSession(db, {
          actor: createActor("00000000-0000-4000-8000-000000000002"),
          sessionToken: "teammate-token",
          uploadSessionId: prepared.uploadSessionId,
          now: new Date("2026-05-27T02:31:00.000Z"),
          runtime,
          signedUrlExpiresInSeconds: 900,
        }),
        /upload_session_not_found/,
      );
    } finally {
      await db.close();
    }
  });

  it("normalizes Tencent COS STS credential object errors", () => {
    const error = normalizeCosStsError({
      Code: "AuthFailure.SecretIdNotFound",
      Message: "The SecretId is not found, please ensure that your SecretId is correct.",
      RequestId: "sts-request-1",
    });

    assert.equal(error.name, "StorageCredentialError");
    assert.equal(error.code, "storage_credentials_invalid");
    assert.equal(error.providerCode, "AuthFailure.SecretIdNotFound");
    assert.equal(error.providerRequestId, "sts-request-1");
  });

  it("repairs expired, dangling, and delete-failed storage records", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");

      const stale = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "stale.png",
        contentType: "image/png",
        sizeBytes: 64,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:stale.png",
        now: new Date("2026-05-27T01:00:00.000Z"),
        runtime,
      });

      const dangling = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "dangling.png",
        contentType: "image/png",
        sizeBytes: 128,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:dangling.png",
        now: new Date("2026-05-27T01:05:00.000Z"),
        runtime,
      });
      localObjectStore.put(dangling.objectKey, {
        contentType: "image/png",
        contentLength: 128,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: dangling.uploadSessionId,
        now: new Date("2026-05-27T01:06:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });

      const directorDeskReference = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: null,
        purpose: "director-panorama",
        fileName: "director-panorama.png",
        contentType: "image/png",
        sizeBytes: 136,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:director-panorama:director-panorama.png",
        now: new Date("2026-05-27T01:05:00.000Z"),
        runtime,
      });
      localObjectStore.put(directorDeskReference.objectKey, {
        contentType: "image/png",
        contentLength: 136,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: directorDeskReference.uploadSessionId,
        now: new Date("2026-05-27T01:06:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });
      await db.query(
        `
          INSERT INTO director_desks (id, user_id, desk_key, name, scene_json)
          VALUES ($1, $2, 'desk-storage-reference', 'Storage reference', $3::jsonb)
        `,
        [
          "73000000-0000-4000-8000-000000000001",
          actor.userId,
          JSON.stringify({
            project: {
              assets: [{
                kind: "panorama",
                url: `/api/storage/objects/${directorDeskReference.storageObjectId}/content`,
              }],
            },
          }),
        ],
      );

      const personalLibraryReference = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: null,
        purpose: "new-canvas/image-import",
        fileName: "personal-library.png",
        contentType: "image/png",
        sizeBytes: 144,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:new-canvas:personal-library.png",
        now: new Date("2026-05-27T01:05:00.000Z"),
        runtime,
      });
      localObjectStore.put(personalLibraryReference.objectKey, {
        contentType: "image/png",
        contentLength: 144,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: personalLibraryReference.uploadSessionId,
        now: new Date("2026-05-27T01:06:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });
      await db.query(
        `
          INSERT INTO project_upload_records (
            id, storage_object_id, upload_session_id, actor_user_id,
            page_key, source_action, file_name, status, completed_at
          )
          VALUES ($1, $2, $3, $4, 'new-canvas', 'new-canvas/image-import',
                  'personal-library.png', 'uploaded', $5)
        `,
        [
          "79000000-0000-4000-8000-000000000001",
          personalLibraryReference.storageObjectId,
          personalLibraryReference.uploadSessionId,
          actor.userId,
          new Date("2026-05-27T01:06:00.000Z"),
        ],
      );

      const taskReference = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "asset-generator",
        fileName: "task-reference.png",
        contentType: "image/png",
        sizeBytes: 192,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:asset-generator:task-reference.png",
        now: new Date("2026-05-27T01:07:00.000Z"),
        runtime,
      });
      localObjectStore.put(taskReference.objectKey, {
        contentType: "image/png",
        contentLength: 192,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: taskReference.uploadSessionId,
        now: new Date("2026-05-27T01:08:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });
      await createWorkflowWithTasks(db, {
        userId: actor.userId,
        projectId: "40000000-0000-4000-8000-000000000001",
        workflowType: "image_generation",
        inputSnapshot: {},
        tasks: [{
          taskType: "episode_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "asset",
          targetEntityId: "50000000-0000-4000-8000-000000000001",
          inputSnapshot: {
            parameters: {
              imageReference: {
                kind: "image",
                storageObjectId: taskReference.storageObjectId,
              },
            },
          },
        }],
      });

      const canvasReference = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "canvas-reference.png",
        contentType: "image/png",
        sizeBytes: 224,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:canvas-reference.png",
        now: new Date("2026-05-27T01:09:00.000Z"),
        runtime,
      });
      localObjectStore.put(canvasReference.objectKey, {
        contentType: "image/png",
        contentLength: 224,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: canvasReference.uploadSessionId,
        now: new Date("2026-05-27T01:10:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });
      const canvasArtifactReference = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "new-canvas/video-composition",
        fileName: "canvas-artifact-reference.mp4",
        contentType: "video/mp4",
        sizeBytes: 240,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:new-canvas:canvas-artifact-reference.mp4",
        now: new Date("2026-05-27T01:09:00.000Z"),
        runtime,
      });
      localObjectStore.put(canvasArtifactReference.objectKey, {
        contentType: "video/mp4",
        contentLength: 240,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: canvasArtifactReference.uploadSessionId,
        now: new Date("2026-05-27T01:10:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });
      await db.query(
        `
          INSERT INTO creator_canvas_projects (
            id,
            title,
            status,
            server_revision,
            created_by_user_id,
            updated_by_user_id,
            deleted_at
          )
          VALUES
            ('70000000-0000-4000-8000-000000000001', 'Owner canvas', 'active', 1, $1, $1, NULL),
            ('70000000-0000-4000-8000-000000000002', 'Other user canvas', 'active', 1, $2, $2, NULL),
            ('70000000-0000-4000-8000-000000000003', 'Deleted owner canvas', 'active', 1, $1, $1, '2026-05-27T01:30:00.000Z')
        `,
        [actor.userId, "00000000-0000-4000-8000-000000000002"],
      );
      await db.query(
        `
          INSERT INTO creator_canvas_nodes (
            id, canvas_project_id, node_key, node_type, status,
            created_by_user_id, updated_by_user_id
          )
          VALUES ('73000000-0000-4000-8000-000000000001',
                  '70000000-0000-4000-8000-000000000001',
                  'video-composition', 'output', 'completed', $1, $1)
        `,
        [actor.userId],
      );
      await db.query(
        `
          INSERT INTO creator_canvas_node_artifacts (
            id, canvas_project_id, node_key, artifact_kind,
            storage_object_id, selected, created_by_user_id
          )
          VALUES ('74000000-0000-4000-8000-000000000001',
                  '70000000-0000-4000-8000-000000000001',
                  'video-composition', 'video', $1, true, $2)
        `,
        [canvasArtifactReference.storageObjectId, actor.userId],
      );
      await db.query(
        `
          INSERT INTO creator_canvas_documents (
            id,
            canvas_project_id,
            server_revision,
            document_json,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES
            (
              '71000000-0000-4000-8000-000000000001',
              '70000000-0000-4000-8000-000000000001',
              1,
              $1::jsonb,
              $3,
              $3
            ),
            (
              '71000000-0000-4000-8000-000000000002',
              '70000000-0000-4000-8000-000000000002',
              1,
              $2::jsonb,
              $4,
              $4
            )
        `,
        [
          JSON.stringify({
            nodes: [{
              id: "canvas-reference",
              data: {
                upload: {
                  uploadSessionId: canvasReference.uploadSessionId,
                },
              },
            }],
          }),
          JSON.stringify({
            nodes: [{
              id: "cross-owner-reference",
              data: { storageObjectId: dangling.storageObjectId },
            }],
          }),
          actor.userId,
          "00000000-0000-4000-8000-000000000002",
        ],
      );
      await db.query(
        `
          UPDATE creator_canvas_projects
          SET latest_document_id = CASE id
            WHEN '70000000-0000-4000-8000-000000000001' THEN '71000000-0000-4000-8000-000000000001'::uuid
            WHEN '70000000-0000-4000-8000-000000000002' THEN '71000000-0000-4000-8000-000000000002'::uuid
          END
          WHERE id IN (
            '70000000-0000-4000-8000-000000000001',
            '70000000-0000-4000-8000-000000000002'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO creator_canvas_revisions (
            id,
            canvas_project_id,
            server_revision,
            operation,
            document_json,
            created_by_user_id
          )
          VALUES
            (
              '72000000-0000-4000-8000-000000000002',
              '70000000-0000-4000-8000-000000000002',
              1,
              'save',
              $1::jsonb,
              $2
            ),
            (
              '72000000-0000-4000-8000-000000000003',
              '70000000-0000-4000-8000-000000000003',
              1,
              'save',
              $1::jsonb,
              $3
            )
        `,
        [
          JSON.stringify({
            nodes: [{
              id: "invalid-history-reference",
              data: { storageObjectId: dangling.storageObjectId },
            }],
          }),
          "00000000-0000-4000-8000-000000000002",
          actor.userId,
        ],
      );

      const retryDelete = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "delete-failed.png",
        contentType: "image/png",
        sizeBytes: 256,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:delete-failed.png",
        now: new Date("2026-05-27T01:10:00.000Z"),
        runtime,
      });
      localObjectStore.put(retryDelete.objectKey, {
        contentType: "image/png",
        contentLength: 256,
      });
      await db.query(
        `
          UPDATE storage_objects
          SET status = 'delete_failed'
          WHERE id = $1
        `,
        [retryDelete.storageObjectId],
      );

      const protectedRetryDelete = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "delete-failed-canvas-reference.png",
        contentType: "image/png",
        sizeBytes: 272,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:delete-failed-canvas-reference.png",
        now: new Date("2026-05-27T01:11:00.000Z"),
        runtime,
      });
      localObjectStore.put(protectedRetryDelete.objectKey, {
        contentType: "image/png",
        contentLength: 272,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: protectedRetryDelete.uploadSessionId,
        now: new Date("2026-05-27T01:12:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });
      await db.query(
        "UPDATE storage_objects SET status = 'delete_failed' WHERE id = $1",
        [protectedRetryDelete.storageObjectId],
      );
      await db.query(
        `
          UPDATE creator_canvas_documents
          SET document_json = $2::jsonb
          WHERE id = $1
        `,
        [
          "71000000-0000-4000-8000-000000000001",
          JSON.stringify({
            nodes: [
              {
                id: "canvas-reference",
                data: { upload: { uploadSessionId: canvasReference.uploadSessionId } },
              },
              {
                id: "delete-failed-reference",
                data: { loomicElement: { customData: { resultStorageObjectId: protectedRetryDelete.storageObjectId } } },
              },
            ],
          }),
        ],
      );

      const report = await runStorageRepairJob(db, {
        now: new Date("2026-05-27T02:00:00.000Z"),
        runtime,
      });
      await db.query(
        "UPDATE storage_objects SET status = 'delete_failed' WHERE id = $1",
        [directorDeskReference.storageObjectId],
      );
      await db.query(
        `
          UPDATE creator_canvas_documents
          SET document_json = $2::jsonb
          WHERE id = $1
        `,
        [
          "71000000-0000-4000-8000-000000000001",
          JSON.stringify({
            nodes: [
              {
                id: "canvas-reference",
                data: { loomicElement: { customData: { resultStorageObjectId: canvasReference.storageObjectId } } },
              },
              {
                id: "delete-failed-reference",
                data: { loomicElement: { customData: { resultStorageObjectId: protectedRetryDelete.storageObjectId } } },
              },
            ],
          }),
        ],
      );
      const storageObjectReferenceReport = await runStorageRepairJob(db, {
        now: new Date("2026-05-27T02:01:00.000Z"),
        runtime,
      });
      await db.query(
        `
          UPDATE creator_canvas_documents
          SET document_json = '{"nodes": []}'::jsonb
          WHERE id = '71000000-0000-4000-8000-000000000001'
        `,
      );
      await db.query(
        `
          INSERT INTO creator_canvas_revisions (
            id,
            canvas_project_id,
            server_revision,
            operation,
            document_json,
            created_by_user_id
          )
          VALUES ($1, $2, 1, 'save', $3::jsonb, $4)
        `,
        [
          "72000000-0000-4000-8000-000000000001",
          "70000000-0000-4000-8000-000000000001",
          JSON.stringify({
            nodes: [
              {
                id: "historical-canvas-reference",
                data: { loomicElement: { customData: { resultStorageObjectId: canvasReference.storageObjectId } } },
              },
              {
                id: "delete-failed-reference",
                data: { loomicElement: { customData: { resultStorageObjectId: protectedRetryDelete.storageObjectId } } },
              },
            ],
          }),
          actor.userId,
        ],
      );
      const historicalReferenceReport = await runStorageRepairJob(db, {
        now: new Date("2026-05-27T02:02:00.000Z"),
        runtime,
      });

      const staleSession = await findUploadSession(db, stale.uploadSessionId);
      const staleObject = await findStorageObject(db, stale.storageObjectId);
      const danglingSession = await findUploadSession(db, dangling.uploadSessionId);
      const danglingObject = await findStorageObject(db, dangling.storageObjectId);
      const directorDeskObject = await findStorageObject(db, directorDeskReference.storageObjectId);
      const personalLibraryObject = await findStorageObject(db, personalLibraryReference.storageObjectId);
      const taskReferenceObject = await findStorageObject(db, taskReference.storageObjectId);
      const canvasReferenceObject = await findStorageObject(db, canvasReference.storageObjectId);
      const canvasArtifactObject = await findStorageObject(db, canvasArtifactReference.storageObjectId);
      const retriedObject = await findStorageObject(db, retryDelete.storageObjectId);
      const protectedRetryObject = await findStorageObject(db, protectedRetryDelete.storageObjectId);

      assert.deepEqual(
        [...report.expiredSessionIds].sort(),
        [stale.uploadSessionId, retryDelete.uploadSessionId].sort(),
      );
      assert.deepEqual(report.failedPendingObjectIds, [stale.storageObjectId]);
      assert.deepEqual(report.danglingObjectIds, [dangling.storageObjectId]);
      assert.deepEqual(report.retriedDeleteObjectIds, [retryDelete.storageObjectId]);
      assert.deepEqual(storageObjectReferenceReport.danglingObjectIds, []);
      assert.deepEqual(storageObjectReferenceReport.retriedDeleteObjectIds, []);
      assert.deepEqual(historicalReferenceReport.danglingObjectIds, []);
      assert.equal(staleSession?.status, "expired");
      assert.equal(staleObject?.status, "failed");
      assert.equal(danglingSession?.status, "failed");
      assert.equal(danglingObject?.status, "deleted");
      assert.equal(localObjectStore.has(dangling.objectKey), false);
      assert.equal(directorDeskObject?.status, "delete_failed");
      assert.equal(localObjectStore.has(directorDeskReference.objectKey), true);
      assert.equal(personalLibraryObject?.status, "available");
      assert.equal(localObjectStore.has(personalLibraryReference.objectKey), true);
      assert.equal(taskReferenceObject?.status, "available");
      assert.equal(localObjectStore.has(taskReference.objectKey), true);
      assert.equal(canvasReferenceObject?.status, "available");
      assert.equal(localObjectStore.has(canvasReference.objectKey), true);
      assert.equal(canvasArtifactObject?.status, "available");
      assert.equal(localObjectStore.has(canvasArtifactReference.objectKey), true);
      assert.equal(retriedObject?.status, "deleted");
      assert.equal(localObjectStore.has(retryDelete.objectKey), false);
      assert.equal(protectedRetryObject?.status, "delete_failed");
      assert.equal(localObjectStore.has(protectedRetryDelete.objectKey), true);
    } finally {
      await db.close();
    }
  });

  it("does not repair available objects owned by another storage provider", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadUsers(db);
      const runtime = createRuntime(localObjectStore);
      const foreignRuntime = { ...runtime, provider: "tencent_cos" };
      const actor = createActor("00000000-0000-4000-8000-000000000001");
      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "foreign-provider.png",
        contentType: "image/png",
        sizeBytes: 128,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:foreign-provider.png",
        now: new Date("2026-05-27T01:00:00.000Z"),
        runtime: foreignRuntime,
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "image/png",
        contentLength: 128,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: prepared.uploadSessionId,
        now: new Date("2026-05-27T01:01:00.000Z"),
        runtime: foreignRuntime,
        signedUrlExpiresInSeconds: 900,
      });
      await db.query(
        "UPDATE storage_upload_sessions SET completed_at = $2 WHERE id = $1",
        [prepared.uploadSessionId, new Date("2026-05-27T01:50:00.000Z")],
      );
      await localObjectStore.deleteObject({
        bucket: foreignRuntime.bucket,
        objectKey: prepared.objectKey,
      });

      const report = await runStorageRepairJob(db, {
        now: new Date("2026-05-27T02:00:00.000Z"),
        runtime,
      });
      const storedObject = await findStorageObject(db, prepared.storageObjectId);

      assert.deepEqual(report.missingObjectIds, []);
      assert.equal(storedObject?.provider, "tencent_cos");
      assert.equal(storedObject?.status, "available");
    } finally {
      await db.close();
    }
  });
});

class SignedUrlOnlyAdapter implements StorageAdapter {
  async createSignedReadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }) {
    return {
      url: `signed://${input.bucket}/${input.objectKey}`,
      expiresAt: input.expiresAt,
    };
  }
}

class LocalObjectStoreStub {
  #objects = new Map<
    string,
    {
      contentType?: string | null;
      contentLength?: number | null;
      checksum?: string | null;
      eTag?: string | null;
      versionId?: string | null;
    }
  >();

  put(
    objectKey: string,
    value: {
      contentType?: string | null;
      contentLength?: number | null;
      checksum?: string | null;
      eTag?: string | null;
      versionId?: string | null;
    },
  ) {
    this.#objects.set(objectKey, value);
  }

  has(objectKey: string) {
    return this.#objects.has(objectKey);
  }

  async headObject(input: { bucket: string; objectKey: string }) {
    const object = this.#objects.get(input.objectKey);
    if (!object) {
      return { exists: false };
    }
    return {
      exists: true,
      contentType: object.contentType ?? null,
      contentLength: object.contentLength ?? null,
      checksum: object.checksum ?? null,
      eTag: object.eTag ?? null,
      versionId: object.versionId ?? null,
    };
  }

  async deleteObject(input: { bucket: string; objectKey: string }) {
    this.#objects.delete(input.objectKey);
  }
}

function createRuntime(localObjectStore: LocalObjectStoreStub): UploadSessionRuntime {
  return {
    mode: "dev",
    provider: "dev",
    bucket: "creator-dev",
    region: "ap-shanghai",
    adapter: new SignedUrlOnlyAdapter(),
    stsDurationSeconds: 900,
    localUploadUrlPath: "/api/storage/upload-sessions",
    localObjectStore,
  };
}

function createActor(userId: string) {
  return {
    userId,
    capabilities: [],
  };
}

async function seedUploadUsers(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES
        ('00000000-0000-4000-8000-000000000001', '13800138000', 'active'),
        ('00000000-0000-4000-8000-000000000002', '13800138001', 'active')
    `,
  );


    await db.query(
    `
      INSERT INTO projects (
        id,
        name,
        aspect_ratio,
        resolution,
        phase,
        owner_user_id,
        created_by_user_id
      )
      VALUES ('40000000-0000-4000-8000-000000000001', 'Upload Project', '9:16', '1080p', 'script_input', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')
    `,
  );

  await insertSession(db, {
    userId: "00000000-0000-4000-8000-000000000001",
    token: "owner-token",
  });
  await insertSession(db, {
    userId: "00000000-0000-4000-8000-000000000002",
    token: "teammate-token",
  });
}

async function insertSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { userId: string; token: string },
) {
  const created = await createAuthSession({
    userId: input.userId,
    token: input.token,
    now: new Date("2026-05-27T01:00:00.000Z"),
  });

  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      created.session.id,
      created.session.userId,
      created.session.status,
      created.session.sessionTokenHash,
      created.session.expiresAt,
      created.session.lastSeenAt,
      created.session.revokedAt,
      new Date("2026-05-27T01:00:00.000Z"),
    ],
  );
}
