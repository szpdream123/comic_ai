import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { StorageAdapter } from "../../storage/storage.service.ts";
import {
  completeUploadSession,
  createUploadSession,
  type UploadSessionRuntime,
} from "../../storage/upload-session.service.ts";
import { createCreatorApplication } from "../creator-application.service.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";

describe("creator application service", { concurrency: false }, () => {
  it("runs the creator flow through formal handlers and writes calibration audit plus export records", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      const created = await creator.createProject({
        user,
        body: {
          name: "Creator application service",
          scriptInput: "Episode 1: Dawn over the mechanical city.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-create",
        now: new Date("2026-05-18T10:00:00.000Z"),
      });
      const parsed = await creator.parseScript({
        user,
        idempotencyKey: "creator-application-parse",
        now: new Date("2026-05-18T10:01:00.000Z"),
      });
      const confirmed = await creator.confirmAllAssets({ user });
      const calibration = await creator.runCalibration({
        user,
        now: new Date("2026-05-18T10:02:00.000Z"),
      });
      const images = await creator.generateImages({
        user,
        now: new Date("2026-05-18T10:03:00.000Z"),
      });
      const videos = await creator.generateVideos({
        user,
        now: new Date("2026-05-18T10:03:30.000Z"),
      });
      const exportPreview = await creator.previewExport({
        user,
        now: new Date("2026-05-18T10:04:00.000Z"),
      });
      const reloadedCreator = createCreatorApplication({
        db,
        workspaceId,
      });
      const reloadedState = await reloadedCreator.getState({ user });

      const counts = await db.query<{
        calibration_audit_count: number;
        export_record_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM audit_events WHERE event_type = 'calibration.passed') AS calibration_audit_count,
            (SELECT count(*)::int FROM export_records) AS export_record_count
        `,
      );

      assert.equal(created.status, 200);
      assert.equal(parsed.status, 202);
      assert.equal(confirmed.status, 200);
      assert.equal(calibration.status, 200);
      assert.equal(images.status, 200);
      assert.equal(videos.status, 200);
      assert.equal(exportPreview.status, 200);
      assert.equal(
        (calibration.body as { auditEvent?: { eventType: string } }).auditEvent?.eventType,
        "calibration.passed",
      );
      assert.equal(
        (exportPreview.body as { exportRecord?: { manifestStatus: string } }).exportRecord
          ?.manifestStatus,
        "ready",
      );
      assert.equal(reloadedState.status, 200);
      assert.equal(reloadedState.body.project?.phase, "export");
      assert.equal(reloadedState.body.script?.status, "parsed");
      assert.equal(reloadedState.body.shots.length, 3);
      assert.equal(reloadedState.body.calibration?.status, "passed");
      assert.equal(
        reloadedState.body.shots.every((shot) => shot.currentImageAssetVersionId),
        true,
      );
      assert.equal(
        reloadedState.body.shots.every((shot) => shot.currentVideoAssetVersionId),
        true,
      );
      assert.deepEqual(counts.rows[0], {
        calibration_audit_count: 1,
        export_record_count: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("returns project detail with asset summaries, preview urls, episodes, and shot links", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-detail-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      const created = await creator.createProject({
        user,
        body: {
          name: "Creator project detail",
          scriptInput: "Episode 7: Project detail should hydrate tabs.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-detail-create",
        now: new Date("2026-05-18T10:10:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-detail-parse",
        now: new Date("2026-05-18T10:11:00.000Z"),
      });
      await creator.importAsset({
        user,
        body: {
          kind: "scene",
          name: "Detail Scene",
          storageObjectKey: "data:image/png;base64,detail-scene",
          mimeType: "image/png",
          width: 1280,
          height: 720,
        },
        now: new Date("2026-05-18T10:12:00.000Z"),
      });

      const projectId = (created.body as { project: { id: string } }).project.id;
      const detail = await creator.getProjectDetail({
        user,
        projectId,
        now: new Date("2026-05-18T10:13:00.000Z"),
      });
      const reloadedCreator = createCreatorApplication({
        db,
        workspaceId,
      });
      const selected = await reloadedCreator.selectProject({
        user,
        projectId,
        now: new Date("2026-05-18T10:14:00.000Z"),
      });

      assert.equal(detail.status, 200);
      assert.equal((detail.body as any).project.id, projectId);
      assert.equal((detail.body as any).assetSummary.scene.count, 1);
      assert.deepEqual((detail.body as any).assetSummary.scene.previews, [
        "data:image/png;base64,detail-scene",
      ]);
      assert.equal((detail.body as any).assetsByType.scene[0].previewUrl, "data:image/png;base64,detail-scene");
      assert.equal((detail.body as any).assetsByType.scene[0].latestVersion.previewUrl, "data:image/png;base64,detail-scene");
      assert.equal((detail.body as any).episodes.length, 1);
      assert.equal((detail.body as any).episodes[0].storyboardCount, 3);
      assert.match((detail.body as any).episodes[0].id, /^[0-9a-f-]{36}$/);
      assert.equal(
        (detail.body as any).shots.every(
          (shot: { episodeId: string | null }) =>
            shot.episodeId === (detail.body as any).episodes[0].id,
        ),
        true,
      );
      assert.equal(selected.status, 200);
      assert.equal((selected.body as any).project.id, projectId);
      assert.equal((selected.body as any).episodes.length, 1);
    } finally {
      await db.close();
    }
  });

  it("lists reusable official assets as browse-only application data", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-library-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      const official = await creator.listReusableAssetLibrary({
        user,
        query: {
          scope: "official",
          category: "character",
          query: "医生",
        },
        now: new Date("2026-05-23T10:01:00.000Z"),
      });
      const libraryAsset = (
        official.body as { assets: Array<{ id: string; name: string; category: string }> }
      ).assets[0];

      assert.equal(official.status, 200);
      assert.equal(libraryAsset.name, "医生");
      assert.equal(libraryAsset.category, "character");
      assert.equal("importReusableAssetToProject" in creator, false);
    } finally {
      await db.close();
    }
  });

  it("authenticates before seeding reusable official assets", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });

      await assert.rejects(
        () =>
          creator.listReusableAssetLibrary({
            user: {
              id: userId,
              sessionToken: "invalid-session-token",
            },
            query: {
              scope: "official",
              category: "character",
            },
            now: new Date("2026-05-23T10:01:00.000Z"),
          }),
        /unauthenticated/,
      );

      const seeded = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM library_assets WHERE scope = 'official'",
      );

      assert.equal(seeded.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("stores project covers by storage object id and returns signed cover urls", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-cover-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
        storageRuntime: createStorageRuntime(localObjectStore),
        signedUrlExpiresInSeconds: 900,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      const created = await creator.createProject({
        user,
        body: {
          name: "Creator cover storage",
          scriptInput: "Episode 3: upload a cover.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-cover-create",
        now: new Date("2026-05-18T12:00:00.000Z"),
      });
      const projectId = (created.body as { project: { id: string } }).project.id;
      const actor = {
        actorId: userId,
        organizationId,
        workspaceId,
        role: "creator" as const,
        capabilities: [],
      };

      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: session.token,
        projectId,
        purpose: "project-covers",
        fileName: "cover.png",
        contentType: "image/png",
        sizeBytes: 128,
        checksum: null,
        multipart: false,
        idempotencyKey: "creator-application-cover-upload",
        now: new Date("2026-05-18T12:01:00.000Z"),
        runtime: createStorageRuntime(localObjectStore),
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "image/png",
        contentLength: 128,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: session.token,
        uploadSessionId: prepared.uploadSessionId,
        now: new Date("2026-05-18T12:02:00.000Z"),
        runtime: createStorageRuntime(localObjectStore),
        signedUrlExpiresInSeconds: 900,
      });

      const updated = await creator.updateProject({
        user,
        body: {
          projectId,
          uploadSessionId: prepared.uploadSessionId,
          storageObjectId: prepared.storageObjectId,
        },
        now: new Date("2026-05-18T12:03:00.000Z"),
      });
      const detail = await creator.getProjectDetail({
        user,
        projectId,
        now: new Date("2026-05-18T12:04:00.000Z"),
      });

      assert.equal(updated.status, 200);
      assert.equal((updated.body as any).project.coverStorageObjectId, prepared.storageObjectId);
      assert.match((updated.body as any).project.coverImageUrl ?? "", /^signed:\/\/creator-dev\//);
      assert.equal((detail.body as any).project.coverStorageObjectId, prepared.storageObjectId);
      assert.match((detail.body as any).project.coverImageUrl ?? "", /^signed:\/\/creator-dev\//);
    } finally {
      await db.close();
    }
  });

  it("rejects legacy import payloads when storage runtime is enabled", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-runtime-import-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
        storageRuntime: createStorageRuntime(new LocalObjectStoreStub()),
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Runtime Import Guard",
          scriptInput: "Episode 4: runtime imports must use upload sessions.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-runtime-import-create",
        now: new Date("2026-05-18T12:10:00.000Z"),
      });

      const importedAsset = await creator.importAsset({
        user,
        body: {
          kind: "scene",
          name: "Legacy Scene",
          storageObjectKey: "data:image/png;base64,legacy-scene",
          mimeType: "image/png",
        },
        now: new Date("2026-05-18T12:11:00.000Z"),
      });
      const createdShot = await creator.createShot({
        user,
        body: {
          title: "Shot import guard",
        },
        now: new Date("2026-05-18T12:12:00.000Z"),
      });
      const importedShotMedia = await creator.importShotMedia({
        user,
        body: {
          shotId: (createdShot.body as any).shot.id,
          kind: "image",
          name: "Legacy Shot",
          storageObjectKey: "data:image/png;base64,legacy-shot",
          mimeType: "image/png",
        },
        now: new Date("2026-05-18T12:13:00.000Z"),
      });

      assert.equal(importedAsset.status, 400);
      assert.equal((importedAsset.body as any).error, "upload_reference_required");
      assert.equal(importedShotMedia.status, 400);
      assert.equal((importedShotMedia.body as any).error, "upload_reference_required");
    } finally {
      await db.close();
    }
  });

  it("deletes storyboard media objects even when the stored version only retains object key metadata", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-shot-delete-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
        storageRuntime: createStorageRuntime(localObjectStore),
        signedUrlExpiresInSeconds: 900,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      const created = await creator.createProject({
        user,
        body: {
          name: "Storyboard delete storage cleanup",
          scriptInput: "Episode 5: deleting shot media should also delete storage objects.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-shot-delete-create",
        now: new Date("2026-05-18T12:20:00.000Z"),
      });
      const projectId = (created.body as { project: { id: string } }).project.id;
      const createShot = await creator.createShot({
        user,
        body: {
          title: "Delete me",
        },
        now: new Date("2026-05-18T12:21:00.000Z"),
      });
      const shotId = (createShot.body as any).shot.id;
      const actor = {
        actorId: userId,
        organizationId,
        workspaceId,
        role: "creator" as const,
        capabilities: [],
      };

      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: session.token,
        projectId,
        purpose: "storyboard-videos",
        fileName: "delete-video.mp4",
        contentType: "video/mp4",
        sizeBytes: 256,
        checksum: null,
        multipart: false,
        idempotencyKey: "creator-application-shot-delete-upload",
        now: new Date("2026-05-18T12:22:00.000Z"),
        runtime: createStorageRuntime(localObjectStore),
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "video/mp4",
        contentLength: 256,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: session.token,
        uploadSessionId: prepared.uploadSessionId,
        now: new Date("2026-05-18T12:23:00.000Z"),
        runtime: createStorageRuntime(localObjectStore),
        signedUrlExpiresInSeconds: 900,
      });

      const imported = await creator.importShotMedia({
        user,
        body: {
          shotId,
          kind: "video",
          name: "Delete video",
          uploadSessionId: prepared.uploadSessionId,
          storageObjectId: prepared.storageObjectId,
          mimeType: "video/mp4",
        },
        now: new Date("2026-05-18T12:24:00.000Z"),
      });
      const versionId = (imported.body as any).version.id;

      await db.query(
        `
          UPDATE asset_versions
          SET storage_object_id = NULL
          WHERE id = $1
        `,
        [versionId],
      );

      const deleted = await creator.deleteShotMedia({
        user,
        body: {
          shotId,
          kind: "video",
          assetVersionId: versionId,
        },
        now: new Date("2026-05-18T12:25:00.000Z"),
      });

      assert.equal(deleted.status, 200);
      assert.equal(localObjectStore.has(prepared.objectKey), false);
    } finally {
      await db.close();
    }
  });

  it("supports single-asset confirmation and label editing through the formal application layer", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-assets-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator asset controls",
          scriptInput: "Episode 2: The hero enters the neon forest with a lantern.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-assets-create",
        now: new Date("2026-05-18T11:00:00.000Z"),
      });
      const parsed = await creator.parseScript({
        user,
        idempotencyKey: "creator-application-assets-parse",
        now: new Date("2026-05-18T11:01:00.000Z"),
      });
      const firstCharacter = (
        parsed.body as {
          parse: { candidateAssets: Array<{ id: string; kind: string }> };
        }
      ).parse.candidateAssets.find((candidate) => candidate.kind === "character");

      assert.ok(firstCharacter);

      const confirmed = await (creator as any).confirmAsset({
        user,
        body: {
          group: "character",
          assetKey: firstCharacter.id,
        },
      });
      const renamed = await (creator as any).updateAssetLabel({
        user,
        body: {
          group: "character",
          assetKey: firstCharacter.id,
          label: "Hero Prime",
        },
      });
      const reloadedCreator = createCreatorApplication({
        db,
        workspaceId,
      });
      const reloadedState = await reloadedCreator.getState({ user });

      assert.equal(confirmed.status, 200);
      assert.equal(
        confirmed.body.assetCandidates.characters.some(
          (candidate: { assetKey: string; confirmed: boolean }) =>
            candidate.assetKey === firstCharacter.id && candidate.confirmed,
        ),
        true,
      );
      assert.equal(renamed.status, 200);
      assert.equal(
        renamed.body.assetCandidates.characters.find(
          (candidate: { assetKey: string; label: string }) =>
            candidate.assetKey === firstCharacter.id,
        )?.label,
        "Hero Prime",
      );
      assert.equal(
        reloadedState.body.assetCandidates.characters.find(
          (candidate: { assetKey: string; label: string; confirmed: boolean }) =>
            candidate.assetKey === firstCharacter.id,
        )?.label,
        "Hero Prime",
      );
      assert.equal(
        reloadedState.body.assetCandidates.characters.find(
          (candidate: { assetKey: string; label: string; confirmed: boolean }) =>
            candidate.assetKey === firstCharacter.id,
        )?.confirmed,
        true,
      );
    } finally {
      await db.close();
    }
  });

  it("supports calibration skip and override plus export history queries", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-calibration-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator calibration controls",
          scriptInput: "Episode 3: Storm clouds close over the ancient harbor.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-calibration-create",
        now: new Date("2026-05-18T12:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-calibration-parse",
        now: new Date("2026-05-18T12:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });

      const skipped = await (creator as any).skipCalibration({
        user,
        body: {
          reason: "Approved style frames already cover this sequence.",
        },
        now: new Date("2026-05-18T12:02:00.000Z"),
      });
      const overridden = await (creator as any).overrideCalibration({
        user,
        body: {
          reason: "Director approved a deliberate departure from the calibration frame.",
        },
        now: new Date("2026-05-18T12:03:00.000Z"),
      });
      await creator.generateImages({
        user,
        now: new Date("2026-05-18T12:04:00.000Z"),
      });
      await creator.previewExport({
        user,
        now: new Date("2026-05-18T12:05:00.000Z"),
      });
      const history = await (creator as any).listExportHistory({
        user,
        now: new Date("2026-05-18T12:06:00.000Z"),
      });

      assert.equal(skipped.status, 200);
      assert.equal(skipped.body.auditEvent.eventType, "calibration.skipped");
      assert.equal(overridden.status, 200);
      assert.equal(overridden.body.auditEvent.eventType, "calibration.override");
      assert.equal(history.status, 200);
      assert.equal(history.body.records.length, 1);
      assert.equal(history.body.records[0]?.manifestStatus, "ready");
    } finally {
      await db.close();
    }
  });

  it("finalizes parse workflow into durable domain facts", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-parse-finalization");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator parse finalization",
          scriptInput: "Episode 4: Parse finalization must land durable facts.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-parse-finalization-create",
        now: new Date("2026-05-18T13:00:00.000Z"),
      });
      const parsed = await creator.parseScript({
        user,
        idempotencyKey: "creator-application-parse-finalization-parse",
        now: new Date("2026-05-18T13:01:00.000Z"),
      });

      const workflow = await db.query<{
        workflow_status: string;
        task_status: string;
        project_phase: string;
        script_status: string;
        asset_candidate_count: number;
        shot_count: number;
      }>(
        `
          SELECT
            (SELECT status FROM workflows WHERE id = $1) AS workflow_status,
            (SELECT status FROM tasks WHERE id = $2) AS task_status,
            (SELECT phase FROM projects ORDER BY created_at DESC, id DESC LIMIT 1) AS project_phase,
            (SELECT status FROM scripts ORDER BY created_at DESC, id DESC LIMIT 1) AS script_status,
            (SELECT count(*)::int FROM asset_review_candidates) AS asset_candidate_count,
            (SELECT count(*)::int FROM shots) AS shot_count
        `,
        [
          (parsed.body as { workflow: { workflowId: string; taskId: string } }).workflow.workflowId,
          (parsed.body as { workflow: { workflowId: string; taskId: string } }).workflow.taskId,
        ],
      );

      assert.equal(parsed.status, 202);
      assert.deepEqual(workflow.rows[0], {
        workflow_status: "succeeded",
        task_status: "succeeded",
        project_phase: "asset_review",
        script_status: "parsed",
        asset_candidate_count: 3,
        shot_count: 3,
      });
    } finally {
      await db.close();
    }
  });

  it("advances the project to export after generation and export finalization", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-phase-progression");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator phase progression",
          scriptInput: "Episode 5: Project phases must progress through export.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-phase-progression-create",
        now: new Date("2026-05-18T14:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-phase-progression-parse",
        now: new Date("2026-05-18T14:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T14:02:00.000Z"),
      });
      await creator.generateImages({
        user,
        now: new Date("2026-05-18T14:03:00.000Z"),
      });
      await creator.generateVideos({
        user,
        now: new Date("2026-05-18T14:03:30.000Z"),
      });
      await creator.previewExport({
        user,
        now: new Date("2026-05-18T14:04:00.000Z"),
      });

      const project = await db.query<{
        phase: string;
        image_task_statuses: string[];
        video_task_statuses: string[];
        export_task_statuses: string[];
      }>(
        `
          SELECT
            (SELECT phase FROM projects ORDER BY created_at DESC, id DESC LIMIT 1) AS phase,
            ARRAY(SELECT status FROM tasks WHERE task_type = 'generate_shot_image' ORDER BY created_at ASC) AS image_task_statuses,
            ARRAY(SELECT status FROM tasks WHERE task_type = 'generate_shot_video' ORDER BY created_at ASC) AS video_task_statuses,
            ARRAY(SELECT status FROM tasks WHERE task_type = 'create_export' ORDER BY created_at ASC) AS export_task_statuses
        `,
      );

      assert.deepEqual(project.rows[0], {
        phase: "export",
        image_task_statuses: ["succeeded", "succeeded", "succeeded"],
        video_task_statuses: ["succeeded", "succeeded", "succeeded"],
        export_task_statuses: ["succeeded"],
      });
    } finally {
      await db.close();
    }
  });

  it("replays idempotent generation, calibration, and export without duplicate side effects", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-idempotent-actions");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator idempotent actions",
          scriptInput: "Episode 8: Replayed generation must not spend twice.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-idempotent-actions-create",
        now: new Date("2026-05-18T15:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-idempotent-actions-parse",
        now: new Date("2026-05-18T15:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });

      const invalidSkip = await (creator as any).skipCalibration({
        user,
        body: {
          reason: " ",
        },
        idempotencyKey: "creator-application-calibration-invalid-skip-replay",
        now: new Date("2026-05-18T15:01:30.000Z"),
      });
      const invalidSkipReplay = await (creator as any).skipCalibration({
        user,
        body: {
          reason: " ",
        },
        idempotencyKey: "creator-application-calibration-invalid-skip-replay",
        now: new Date("2026-05-18T15:01:45.000Z"),
      });

      const skipped = await (creator as any).skipCalibration({
        user,
        body: {
          reason: "Existing approved calibration covers this test.",
        },
        idempotencyKey: "creator-application-calibration-skip-replay",
        now: new Date("2026-05-18T15:02:00.000Z"),
      });
      const skippedReplay = await (creator as any).skipCalibration({
        user,
        body: {
          reason: "Existing approved calibration covers this test.",
        },
        idempotencyKey: "creator-application-calibration-skip-replay",
        now: new Date("2026-05-18T15:02:30.000Z"),
      });
      const skippedConflict = await (creator as any).skipCalibration({
        user,
        body: {
          reason: "A different reason should conflict.",
        },
        idempotencyKey: "creator-application-calibration-skip-replay",
        now: new Date("2026-05-18T15:02:45.000Z"),
      });

      const images = await (creator as any).generateImages({
        user,
        idempotencyKey: "creator-application-image-generate-replay",
        now: new Date("2026-05-18T15:03:00.000Z"),
      });
      const imagesReplay = await (creator as any).generateImages({
        user,
        idempotencyKey: "creator-application-image-generate-replay",
        now: new Date("2026-05-18T15:03:30.000Z"),
      });
      const videos = await (creator as any).generateVideos({
        user,
        idempotencyKey: "creator-application-video-generate-replay",
        now: new Date("2026-05-18T15:04:00.000Z"),
      });
      const videosReplay = await (creator as any).generateVideos({
        user,
        idempotencyKey: "creator-application-video-generate-replay",
        now: new Date("2026-05-18T15:04:30.000Z"),
      });
      const exportPreview = await (creator as any).previewExport({
        user,
        idempotencyKey: "creator-application-export-preview-replay",
        now: new Date("2026-05-18T15:05:00.000Z"),
      });
      const exportReplay = await (creator as any).previewExport({
        user,
        idempotencyKey: "creator-application-export-preview-replay",
        now: new Date("2026-05-18T15:05:30.000Z"),
      });

      const counts = await db.query<{
        provider_request_count: number;
        export_record_count: number;
        calibration_audit_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM provider_requests) AS provider_request_count,
            (SELECT count(*)::int FROM export_records) AS export_record_count,
            (SELECT count(*)::int FROM audit_events WHERE event_type = 'calibration.skipped') AS calibration_audit_count
        `,
      );

      assert.equal(skipped.status, 200);
      assert.equal(skippedReplay.status, 200);
      assert.equal(skippedConflict.status, 409);
      assert.deepEqual(skippedConflict.body, { error: "idempotency_conflict" });
      assert.equal(skipped.body.auditEvent.id, skippedReplay.body.auditEvent.id);
      assert.equal(invalidSkip.status, 400);
      assert.deepEqual(invalidSkip.body, { error: "reason_required" });
      assert.equal(invalidSkipReplay.status, 400);
      assert.deepEqual(invalidSkipReplay.body, invalidSkip.body);
      assert.equal(images.status, 200);
      assert.equal(imagesReplay.status, 200);
      assert.equal(images.body.platform.workflowId, imagesReplay.body.platform.workflowId);
      assert.equal(videos.status, 200);
      assert.equal(videosReplay.status, 200);
      assert.equal(videos.body.platform.workflowId, videosReplay.body.platform.workflowId);
      assert.equal(exportPreview.status, 200);
      assert.equal(exportReplay.status, 200);
      assert.equal(exportPreview.body.exportRecord.id, exportReplay.body.exportRecord.id);
      assert.deepEqual(counts.rows[0], {
        provider_request_count: 6,
        export_record_count: 1,
        calibration_audit_count: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("keeps replayed parse, calibration errors, and export preview idempotency stable", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-replay-stability");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator replay stability",
          scriptInput: "Episode 9: Replay should not mint phantom shots.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-replay-stability-create",
        now: new Date("2026-05-18T16:00:00.000Z"),
      });

      const invalidCalibration = await creator.runCalibration({
        user,
        idempotencyKey: "creator-application-invalid-calibration-replay",
        now: new Date("2026-05-18T16:00:30.000Z"),
      });
      const invalidCalibrationReplay = await creator.runCalibration({
        user,
        idempotencyKey: "creator-application-invalid-calibration-replay",
        now: new Date("2026-05-18T16:00:45.000Z"),
      });

      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-parse-state-replay",
        now: new Date("2026-05-18T16:01:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-parse-state-replay",
        now: new Date("2026-05-18T16:01:30.000Z"),
      });

      const sqlShots = await db.query<{ id: string }>(
        "SELECT id FROM shots ORDER BY sort_order ASC, id ASC",
      );
      const sqlShotIds = new Set(sqlShots.rows.map((shot) => shot.id));

      await creator.confirmAllAssets({ user });
      await (creator as any).skipCalibration({
        user,
        body: { reason: "Replay stability test bypass." },
        idempotencyKey: "creator-application-replay-stability-calibration",
        now: new Date("2026-05-18T16:02:00.000Z"),
      });

      const images = await (creator as any).generateImages({
        user,
        idempotencyKey: "creator-application-parse-replay-image-generation",
        now: new Date("2026-05-18T16:03:00.000Z"),
      });
      const firstExport = await (creator as any).previewExport({
        user,
        idempotencyKey: "creator-application-export-derived-state-replay",
        now: new Date("2026-05-18T16:03:30.000Z"),
      });
      await (creator as any).generateImages({
        user,
        idempotencyKey: "creator-application-export-state-change-image-generation",
        now: new Date("2026-05-18T16:04:00.000Z"),
      });
      const exportReplay = await (creator as any).previewExport({
        user,
        idempotencyKey: "creator-application-export-derived-state-replay",
        now: new Date("2026-05-18T16:04:30.000Z"),
      });

      assert.equal(invalidCalibration.status, 409);
      assert.deepEqual(invalidCalibration.body, { error: "invalid_calibration_selection" });
      assert.equal(invalidCalibrationReplay.status, 409);
      assert.deepEqual(invalidCalibrationReplay.body, invalidCalibration.body);
      assert.equal(images.status, 200);
      for (const task of images.body.platform.tasks) {
        assert.equal(sqlShotIds.has(task.shotId), true);
      }
      assert.equal(firstExport.status, 200);
      assert.equal(exportReplay.status, 200);
      assert.equal(exportReplay.body.exportRecord.id, firstExport.body.exportRecord.id);
      assert.deepEqual(exportReplay.body.export, firstExport.body.export);
    } finally {
      await db.close();
    }
  });

  it("replays create and parse from the original idempotency snapshots", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-snapshot-replay");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };
      const createBody = {
        name: "Creator snapshot replay",
        scriptInput: "Episode 10: Replay must not drift with live state.",
        aspectRatio: "9:16",
        resolution: "1080p",
      };

      const created = await creator.createProject({
        user,
        body: createBody,
        idempotencyKey: "creator-application-snapshot-create",
        now: new Date("2026-05-18T16:10:00.000Z"),
      });
      const parsed = await creator.parseScript({
        user,
        idempotencyKey: "creator-application-snapshot-parse",
        now: new Date("2026-05-18T16:11:00.000Z"),
      });
      const createReplay = await creator.createProject({
        user,
        body: createBody,
        idempotencyKey: "creator-application-snapshot-create",
        now: new Date("2026-05-18T16:12:00.000Z"),
      });
      const parseReplay = await creator.parseScript({
        user,
        idempotencyKey: "creator-application-snapshot-parse",
        now: new Date("2026-05-18T16:13:00.000Z"),
      });

      assert.equal(created.status, 200);
      assert.equal(createReplay.status, 200);
      assert.deepEqual(createReplay.body.project, created.body.project);
      assert.deepEqual(createReplay.body.script, created.body.script);
      assert.equal(parsed.status, 202);
      assert.equal(parseReplay.status, 202);
      assert.deepEqual(parseReplay.body.workflow, parsed.body.workflow);
    } finally {
      await db.close();
    }
  });

  it("continues write workflows from SQL-hydrated state after application reload", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-reload-writes");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator reload writes",
          scriptInput: "Episode 11: Reloaded app should still write.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-reload-create",
        now: new Date("2026-05-18T16:20:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-reload-parse",
        now: new Date("2026-05-18T16:21:00.000Z"),
      });
      await creator.confirmAllAssets({ user });

      const reloadedCreator = createCreatorApplication({
        db,
        workspaceId,
      });
      const reloadedState = await reloadedCreator.getState({ user });
      const calibration = await reloadedCreator.runCalibration({
        user,
        idempotencyKey: "creator-application-reload-calibration",
        now: new Date("2026-05-18T16:22:00.000Z"),
      });
      const images = await reloadedCreator.generateImages({
        user,
        idempotencyKey: "creator-application-reload-images",
        now: new Date("2026-05-18T16:23:00.000Z"),
      });

      assert.equal(reloadedState.status, 200);
      assert.equal(reloadedState.body.shots.length, 3);
      assert.equal(calibration.status, 200);
      assert.equal(calibration.body.calibration.status, "passed");
      assert.equal(images.status, 200);
      assert.equal(images.body.successes.length, 3);
    } finally {
      await db.close();
    }
  });

  it("treats reordered nested generation parameters as the same idempotent request", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-canonical-hash");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator canonical hash",
          scriptInput: "Episode 12: Request key order should not matter.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-canonical-create",
        now: new Date("2026-05-18T16:30:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-canonical-parse",
        now: new Date("2026-05-18T16:31:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        idempotencyKey: "creator-application-canonical-calibration",
        now: new Date("2026-05-18T16:32:00.000Z"),
      });

      const first = await creator.generateImages({
        user,
        body: {
          parameters: {
            size: "1024x1024",
            style: { contrast: "high", lighting: "soft" },
          },
        },
        idempotencyKey: "creator-application-canonical-images",
        now: new Date("2026-05-18T16:33:00.000Z"),
      });
      const replay = await creator.generateImages({
        user,
        body: {
          parameters: {
            style: { lighting: "soft", contrast: "high" },
            size: "1024x1024",
          },
        },
        idempotencyKey: "creator-application-canonical-images",
        now: new Date("2026-05-18T16:34:00.000Z"),
      });
      const providerRequests = await db.query<{ count: number }>(
        "SELECT count(*)::int FROM provider_requests",
      );

      assert.equal(first.status, 200);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.platform.workflowId, first.body.platform.workflowId);
      assert.equal(providerRequests.rows[0]!.count, 3);
    } finally {
      await db.close();
    }
  });

  it("retries a single failed image and video shot through creator-facing APIs", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-shot-retry");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator shot retry",
          scriptInput: "Episode 6: Failed frames need creator-side retry.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-shot-retry-create",
        now: new Date("2026-05-18T15:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-shot-retry-parse",
        now: new Date("2026-05-18T15:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T15:02:00.000Z"),
      });

      const firstShot = await db.query<{ id: string }>(
        `
          SELECT id
          FROM shots
          ORDER BY created_at ASC
          LIMIT 1
        `,
      );
      const shotId = firstShot.rows[0]!.id;

      await db.query(
        `
          UPDATE shots
          SET image_status = 'failed',
              current_image_asset_version_id = NULL,
              video_status = 'not_ready',
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-05-18T15:03:00.000Z")],
      );

      const imageRetry = await (creator as any).retryShotImage({
        user,
        body: { shotId },
        now: new Date("2026-05-18T15:04:00.000Z"),
      });
      await db.query(
        `
          UPDATE shots
          SET video_status = 'failed',
              current_video_asset_version_id = NULL,
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-05-18T15:05:00.000Z")],
      );
      const videoRetry = await (creator as any).retryShotVideo({
        user,
        body: { shotId },
        now: new Date("2026-05-18T15:06:00.000Z"),
      });

      const state = await creator.getState({ user });
      const taskCounts = await db.query<{
        image_tasks: number;
        video_tasks: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_image') AS image_tasks,
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_video') AS video_tasks
        `,
      );
      const retriedShot = state.body.shots.find((shot) => shot.id === shotId);

      assert.equal(imageRetry.status, 200);
      assert.equal(videoRetry.status, 200);
      assert.equal(imageRetry.body.shot.id, shotId);
      assert.equal(videoRetry.body.shot.id, shotId);
      assert.equal(retriedShot?.imageStatus, "completed");
      assert.equal(retriedShot?.videoStatus, "completed");
      assert.ok(retriedShot?.currentImageAssetVersionId);
      assert.ok(retriedShot?.currentVideoAssetVersionId);
      assert.deepEqual(taskCounts.rows[0], {
        image_tasks: 1,
        video_tasks: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("rejects shot retry before a shot has failed or gone stale", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-retry-guard");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator retry guard",
          scriptInput: "Episode 7: Ready shots must not be retryable.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-retry-guard-create",
        now: new Date("2026-05-18T16:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-retry-guard-parse",
        now: new Date("2026-05-18T16:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T16:02:00.000Z"),
      });

      const firstShot = await db.query<{ id: string }>(
        `
          SELECT id
          FROM shots
          ORDER BY created_at ASC
          LIMIT 1
        `,
      );
      const shotId = firstShot.rows[0]!.id;

      const imageRetry = await (creator as any).retryShotImage({
        user,
        body: { shotId },
        now: new Date("2026-05-18T16:03:00.000Z"),
      });
      const videoRetry = await (creator as any).retryShotVideo({
        user,
        body: { shotId },
        now: new Date("2026-05-18T16:04:00.000Z"),
      });

      assert.equal(imageRetry.status, 409);
      assert.deepEqual(imageRetry.body, { error: "shot_image_retry_unavailable" });
      assert.equal(videoRetry.status, 409);
      assert.deepEqual(videoRetry.body, { error: "current_image_required" });
    } finally {
      await db.close();
    }
  });

  it("claims image shot retry before provider work under concurrent requests", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-image-retry-race");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator image retry race",
          scriptInput: "Episode 8: Concurrent image retry clicks must not fork provider work.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-image-retry-race-create",
        now: new Date("2026-05-18T17:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-image-retry-race-parse",
        now: new Date("2026-05-18T17:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T17:02:00.000Z"),
      });

      const firstShot = await db.query<{ id: string }>(
        `
          SELECT id
          FROM shots
          ORDER BY created_at ASC
          LIMIT 1
        `,
      );
      const shotId = firstShot.rows[0]!.id;

      await db.query(
        `
          UPDATE shots
          SET image_status = 'failed',
              current_image_asset_version_id = NULL,
              video_status = 'not_ready',
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-05-18T17:03:00.000Z")],
      );

      const results = await Promise.all([
        (creator as any).retryShotImage({
          user,
          body: { shotId },
          now: new Date("2026-05-18T17:04:00.000Z"),
        }),
        (creator as any).retryShotImage({
          user,
          body: { shotId },
          now: new Date("2026-05-18T17:04:00.000Z"),
        }),
      ]);
      const counts = await db.query<{
        image_tasks: number;
        image_provider_requests: number;
        image_storage_objects: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_image') AS image_tasks,
            (SELECT count(*)::int FROM provider_requests WHERE provider_operation = 'shot.image.generate') AS image_provider_requests,
            (
              SELECT count(*)::int
              FROM storage_objects
              WHERE object_key ~ 'AIManhuaDrama/[0-9]{8}/[0-9a-f-]{36}-image-[0-9a-f-]{36}\\.png$'
            ) AS image_storage_objects
        `,
      );

      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 409],
      );
      assert.deepEqual(counts.rows[0], {
        image_tasks: 1,
        image_provider_requests: 1,
        image_storage_objects: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("claims video shot retry before provider work under concurrent requests", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-video-retry-race");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator video retry race",
          scriptInput: "Episode 9: Concurrent video retry clicks must not fork provider work.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-video-retry-race-create",
        now: new Date("2026-05-18T18:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-video-retry-race-parse",
        now: new Date("2026-05-18T18:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T18:02:00.000Z"),
      });
      await creator.generateImages({
        user,
        now: new Date("2026-05-18T18:03:00.000Z"),
      });

      const firstShot = await db.query<{ id: string }>(
        `
          SELECT id
          FROM shots
          ORDER BY created_at ASC
          LIMIT 1
        `,
      );
      const shotId = firstShot.rows[0]!.id;

      await db.query(
        `
          UPDATE shots
          SET video_status = 'failed',
              current_video_asset_version_id = NULL,
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-05-18T18:04:00.000Z")],
      );

      const results = await Promise.all([
        (creator as any).retryShotVideo({
          user,
          body: { shotId },
          now: new Date("2026-05-18T18:05:00.000Z"),
        }),
        (creator as any).retryShotVideo({
          user,
          body: { shotId },
          now: new Date("2026-05-18T18:05:00.000Z"),
        }),
      ]);
      const counts = await db.query<{
        video_tasks: number;
        video_provider_requests: number;
        video_storage_objects: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_video') AS video_tasks,
            (SELECT count(*)::int FROM provider_requests WHERE provider_operation = 'shot.video.generate') AS video_provider_requests,
            (
              SELECT count(*)::int
              FROM storage_objects
              WHERE object_key ~ 'AIManhuaDrama/[0-9]{8}/[0-9a-f-]{36}-video-[0-9a-f-]{36}\\.mp4$'
            ) AS video_storage_objects
        `,
      );

      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 409],
      );
      assert.deepEqual(counts.rows[0], {
        video_tasks: 1,
        video_provider_requests: 1,
        video_storage_objects: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("runs the creator flow with runtime provider and storage overrides", async () => {
    const db = await createMigratedTestDb();
    const originalEnv = {
      MODEL_PROVIDER_MODE: process.env.MODEL_PROVIDER_MODE,
      MODEL_PROVIDER_ENDPOINT: process.env.MODEL_PROVIDER_ENDPOINT,
      MODEL_PROVIDER_NAME: process.env.MODEL_PROVIDER_NAME,
      STORAGE_ADAPTER_MODE: process.env.STORAGE_ADAPTER_MODE,
      STORAGE_PUBLIC_BASE_URL: process.env.STORAGE_PUBLIC_BASE_URL,
      STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    };
    const originalFetch = globalThis.fetch;

    try {
      process.env.MODEL_PROVIDER_MODE = "http";
      process.env.MODEL_PROVIDER_ENDPOINT = "https://provider.example.test";
      process.env.MODEL_PROVIDER_NAME = "provider-http-smoke";
      process.env.STORAGE_ADAPTER_MODE = "public_base_url";
      process.env.STORAGE_PUBLIC_BASE_URL = "https://cdn.example.test/assets";
      process.env.STORAGE_BUCKET = "creator-smoke";
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            externalRequestId: "provider-request-smoke",
            status: "accepted",
            redactedResponse: { accepted: true },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )) as typeof fetch;

      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-runtime-overrides");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator runtime overrides",
          scriptInput: "Episode 6: Runtime adapters must hold through the full creator flow.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-runtime-overrides-create",
        now: new Date("2026-05-18T15:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-runtime-overrides-parse",
        now: new Date("2026-05-18T15:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T15:02:00.000Z"),
      });
      await creator.generateImages({
        user,
        now: new Date("2026-05-18T15:03:00.000Z"),
      });
      await creator.generateVideos({
        user,
        now: new Date("2026-05-18T15:03:30.000Z"),
      });
      const exportPreview = await creator.previewExport({
        user,
        now: new Date("2026-05-18T15:04:00.000Z"),
      });

      const providerRequests = await db.query<{
        provider_name: string;
      }>(
        `
          SELECT provider_name
          FROM provider_requests
          ORDER BY created_at ASC
        `,
      );
      const storageObjects = await db.query<{
        bucket: string;
      }>(
        `
          SELECT bucket
          FROM storage_objects
          ORDER BY created_at ASC
        `,
      );

      assert.equal(exportPreview.status, 200);
      assert.equal(
        exportPreview.body.exportRecord?.manifestStatus,
        "ready",
      );
      assert.match(
        exportPreview.body.platform?.signedUrl ?? "",
        /^https:\/\/cdn\.example\.test\/assets\//,
      );
      assert.equal(providerRequests.rows.length > 0, true);
      assert.equal(
        providerRequests.rows.every((row) => row.provider_name === "provider-http-smoke"),
        true,
      );
      assert.equal(storageObjects.rows.length > 0, true);
      assert.equal(
        storageObjects.rows.every((row) => row.bucket === "creator-smoke"),
        true,
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      await db.close();
    }
  });
});

async function seedTenant(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800138000', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES (
        '30000000-0000-4000-8000-000000000001',
        $1,
        $2,
        $3,
        'creator',
        'active'
      )
    `,
    [organizationId, workspaceId, userId],
  );
}

async function seedSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  seededUserId: string,
  token: string,
) {
  const seededSessionTime = new Date("2099-01-01T00:00:00.000Z");
  const session = await createAuthSession({
    userId: seededUserId,
    token,
    now: new Date("2026-05-18T09:59:00.000Z"),
    ttlMs: 365 * 24 * 60 * 60 * 1000,
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      seededSessionTime,
    ],
  );
  return session;
}

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

function createStorageRuntime(localObjectStore: LocalObjectStoreStub): UploadSessionRuntime {
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
