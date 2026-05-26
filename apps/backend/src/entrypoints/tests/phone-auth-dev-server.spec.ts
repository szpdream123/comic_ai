import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("phone auth dev server", () => {
  it("serves the login page and static assets", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/login.html`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /id="login-form"/);
    } finally {
      await server.close();
    }
  });

  it("supports the full request -> debug -> verify -> session flow", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const requested = await requestResponse.json();

      const debugResponse = await fetch(
        `${server.origin}/api/auth/dev/challenges/${requested.challengeId}`,
      );
      const debug = await debugResponse.json();

      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "13800138000",
          code: debug.code,
        }),
      });
      const verifyPayload = await verifyResponse.json();
      const cookie = verifyResponse.headers.get("set-cookie") ?? "";

      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });
      const sessionPayload = await sessionResponse.json();

      assert.equal(requestResponse.status, 200);
      assert.equal(debugResponse.status, 200);
      assert.equal(verifyResponse.status, 200);
      assert.equal(sessionResponse.status, 200);
      assert.equal(verifyPayload.user.phone, "+8613800138000");
      assert.equal(sessionPayload.authenticated, true);
    } finally {
      await server.close();
    }
  });

  it("allows local file pages to call the development API with credentials", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const preflightResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "OPTIONS",
        headers: {
          origin: "null",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { origin: "null" },
      });

      assert.equal(preflightResponse.status, 204);
      assert.equal(preflightResponse.headers.get("access-control-allow-origin"), "null");
      assert.equal(preflightResponse.headers.get("access-control-allow-credentials"), "true");
      assert.match(
        preflightResponse.headers.get("access-control-allow-headers") ?? "",
        /content-type/,
      );
      assert.equal(sessionResponse.status, 401);
      assert.equal(sessionResponse.headers.get("access-control-allow-origin"), "null");
      assert.equal(sessionResponse.headers.get("access-control-allow-credentials"), "true");
    } finally {
      await server.close();
    }
  });

  it("exposes a creator workflow API that can create, parse, and export a mock project", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const requested = await requestResponse.json();
      const debugResponse = await fetch(
        `${server.origin}/api/auth/dev/challenges/${requested.challengeId}`,
      );
      const debug = await debugResponse.json();
      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "13800138000",
          code: debug.code,
        }),
      });
      const cookie = verifyResponse.headers.get("set-cookie") ?? "";

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "workflow-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator flow smoke test",
          scriptInput: "Episode 1: Dawn over the mechanical city.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const parseResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "workflow-parse-key",
          cookie,
        },
      });
      const parsed = await parseResponse.json();

      const confirmResponse = await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });
      const confirmed = await confirmResponse.json();

      const calibrationResponse = await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: {
          "idempotency-key": "workflow-calibration-key",
          cookie,
        },
      });
      const calibration = await calibrationResponse.json();

      const imageResponse = await fetch(`${server.origin}/api/creator/images/generate`, {
        method: "POST",
        headers: {
          "idempotency-key": "workflow-image-key",
          cookie,
        },
      });
      const imageBatch = await imageResponse.json();

      const exportResponse = await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: {
          "idempotency-key": "workflow-export-key",
          cookie,
        },
      });
      const exportPreview = await exportResponse.json();

      assert.equal(requestResponse.status, 200);
      assert.equal(debugResponse.status, 200);
      assert.equal(verifyResponse.status, 200);
      assert.equal(createResponse.status, 200);
      assert.equal(parseResponse.status, 202);
      assert.equal(confirmResponse.status, 200);
      assert.equal(calibrationResponse.status, 200);
      assert.equal(imageResponse.status, 200);
      assert.equal(exportResponse.status, 200);
      assert.equal(created.project.phase, "script_input");
      assert.ok(parsed.workflow);
      assert.ok(parsed.assetReview);
      assert.equal(confirmed.assetReview.readyForGeneration, true);
      assert.equal(calibration.calibration.status, "passed");
      assert.equal(calibration.auditEvent.eventType, "calibration.passed");
      assert.ok(imageBatch.successes.length > 0);
      assert.equal(exportPreview.export.status, "ready");
      assert.equal(exportPreview.exportRecord.manifestStatus, "ready");
    } finally {
      await server.close();
    }
  });

  it("requires and replays Idempotency-Key for creator project creation", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const body = {
        name: "Creator idempotency contract",
        scriptInput: "Episode 1: A creator double-clicks the create action.",
        aspectRatio: "9:16",
        resolution: "1080p",
      };

      const missingKeyResponse = await fetch(
        `${server.origin}/api/creator/project/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify(body),
        },
      );
      const missingKey = await missingKeyResponse.json();

      const firstResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-create-replay-key",
          cookie,
        },
        body: JSON.stringify(body),
      });
      const first = await firstResponse.json();
      const replayResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-create-replay-key",
          cookie,
        },
        body: JSON.stringify(body),
      });
      const replay = await replayResponse.json();
      const conflictResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-create-replay-key",
          cookie,
        },
        body: JSON.stringify({
          ...body,
          name: "Creator idempotency conflict",
        }),
      });
      const conflict = await conflictResponse.json();
      const projectsResponse = await fetch(`${server.origin}/api/creator/projects`, {
        headers: { cookie },
      });
      const projects = await projectsResponse.json();

      assert.equal(missingKeyResponse.status, 400);
      assert.deepEqual(missingKey, { error: "idempotency_key_required" });
      assert.equal(firstResponse.status, 200);
      assert.equal(replayResponse.status, 200);
      assert.equal(conflictResponse.status, 409);
      assert.equal(first.project.id, replay.project.id);
      assert.equal(first.script.id, replay.script.id);
      assert.deepEqual(conflict, { error: "idempotency_conflict" });
      assert.equal(projects.projects.length, 1);
    } finally {
      await server.close();
    }
  });

  it("requires and replays Idempotency-Key for creator script parsing", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-parse-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator parse idempotency contract",
          scriptInput: "Episode 1: A creator retries script parsing.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });

      const missingKeyResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: { cookie },
      });
      const missingKey = await missingKeyResponse.json();

      const firstResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-parse-replay-key",
          cookie,
        },
      });
      const first = await firstResponse.json();
      const replayResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-parse-replay-key",
          cookie,
        },
      });
      const replay = await replayResponse.json();

      assert.equal(missingKeyResponse.status, 400);
      assert.deepEqual(missingKey, { error: "idempotency_key_required" });
      assert.equal(firstResponse.status, 202);
      assert.equal(replayResponse.status, 202);
      assert.equal(first.workflow.workflowId, replay.workflow.workflowId);
    } finally {
      await server.close();
    }
  });

  it("supports single-asset editing plus calibration skip/override and export history routes", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const requested = await requestResponse.json();
      const debugResponse = await fetch(
        `${server.origin}/api/auth/dev/challenges/${requested.challengeId}`,
      );
      const debug = await debugResponse.json();
      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "13800138000",
          code: debug.code,
        }),
      });
      const cookie = verifyResponse.headers.get("set-cookie") ?? "";

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-controls-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator controls smoke test",
          scriptInput: "Episode 2: The hero enters the neon forest with a lantern.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });

      const parseResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "asset-controls-parse-key",
          cookie,
        },
      });
      const parsed = await parseResponse.json();
      const firstCharacter = parsed.parse.candidateAssets.find(
        (candidate: { kind: string }) => candidate.kind === "character",
      );

      const confirmResponse = await fetch(`${server.origin}/api/creator/assets/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-controls-skip-key",
          cookie,
        },
        body: JSON.stringify({
          group: "character",
          assetKey: firstCharacter.id,
        }),
      });
      const confirmed = await confirmResponse.json();

      const renameResponse = await fetch(`${server.origin}/api/creator/assets/update-label`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          group: "character",
          assetKey: firstCharacter.id,
          label: "Hero Prime",
        }),
      });
      const renamed = await renameResponse.json();

      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });

      const skipWithoutReasonResponse = await fetch(
        `${server.origin}/api/creator/calibration/skip`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-controls-skip-invalid-key",
            cookie,
          },
          body: JSON.stringify({
            reason: " ",
          }),
        },
      );
      const skipWithoutReason = await skipWithoutReasonResponse.json();

      const skipResponse = await fetch(`${server.origin}/api/creator/calibration/skip`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-controls-skip-key",
          cookie,
        },
        body: JSON.stringify({
          reason: "Approved style frames already cover this sequence.",
        }),
      });
      const skipped = await skipResponse.json();

      const overrideResponse = await fetch(
        `${server.origin}/api/creator/calibration/override`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-controls-override-key",
            cookie,
          },
          body: JSON.stringify({
            reason: "Director approved a deliberate departure from the calibration frame.",
          }),
        },
      );
      const overridden = await overrideResponse.json();

      await fetch(`${server.origin}/api/creator/images/generate`, {
        method: "POST",
        headers: {
          "idempotency-key": "asset-controls-image-key",
          cookie,
        },
      });
      await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: {
          "idempotency-key": "asset-controls-export-key",
          cookie,
        },
      });

      const historyResponse = await fetch(`${server.origin}/api/creator/export/history`, {
        method: "GET",
        headers: { cookie },
      });
      const history = await historyResponse.json();

      assert.equal(confirmResponse.status, 200);
      assert.equal(
        confirmed.assetCandidates.characters.some(
          (candidate: { assetKey: string; confirmed: boolean }) =>
            candidate.assetKey === firstCharacter.id && candidate.confirmed,
        ),
        true,
      );
      assert.equal(renameResponse.status, 200);
      assert.equal(
        renamed.assetCandidates.characters.find(
          (candidate: { assetKey: string; label: string }) =>
            candidate.assetKey === firstCharacter.id,
        )?.label,
        "Hero Prime",
      );
      assert.equal(skipWithoutReasonResponse.status, 400);
      assert.equal(skipWithoutReason.error, "reason_required");
      assert.equal(skipResponse.status, 200);
      assert.equal(skipped.auditEvent.eventType, "calibration.skipped");
      assert.equal(overrideResponse.status, 200);
      assert.equal(overridden.auditEvent.eventType, "calibration.override");
      assert.equal(historyResponse.status, 200);
      assert.equal(history.records.length, 1);
      assert.equal(history.records[0]?.manifestStatus, "ready");
    } finally {
      await server.close();
    }
  });

  it("requires and replays Idempotency-Key for creator generation, calibration, and export routes", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-expensive-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator expensive route idempotency",
          scriptInput: "Episode 4: Expensive routes must not replay side effects.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-expensive-parse-key",
          cookie,
        },
      });
      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });

      for (const [path, body] of [
        ["/api/creator/calibration/run", undefined],
        ["/api/creator/calibration/skip", { reason: "Already approved." }],
        ["/api/creator/calibration/override", { reason: "Director approved." }],
        ["/api/creator/images/generate", undefined],
        ["/api/creator/videos/generate", undefined],
        ["/api/creator/export/preview", undefined],
      ] as const) {
        const response = await fetch(`${server.origin}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const payload = await response.json();

        assert.equal(response.status, 400, path);
        assert.deepEqual(payload, { error: "idempotency_key_required" }, path);
      }

      const calibrationResponse = await fetch(
        `${server.origin}/api/creator/calibration/run`,
        {
          method: "POST",
          headers: {
            "idempotency-key": "http-calibration-run-replay-key",
            cookie,
          },
        },
      );
      const calibration = await calibrationResponse.json();
      const calibrationReplayResponse = await fetch(
        `${server.origin}/api/creator/calibration/run`,
        {
          method: "POST",
          headers: {
            "idempotency-key": "http-calibration-run-replay-key",
            cookie,
          },
        },
      );
      const calibrationReplay = await calibrationReplayResponse.json();

      const imageResponse = await fetch(`${server.origin}/api/creator/images/generate`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-image-generate-replay-key",
          cookie,
        },
      });
      const image = await imageResponse.json();
      const imageReplayResponse = await fetch(`${server.origin}/api/creator/images/generate`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-image-generate-replay-key",
          cookie,
        },
      });
      const imageReplay = await imageReplayResponse.json();

      const videoResponse = await fetch(`${server.origin}/api/creator/videos/generate`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-video-generate-replay-key",
          cookie,
        },
      });
      const video = await videoResponse.json();
      const videoReplayResponse = await fetch(`${server.origin}/api/creator/videos/generate`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-video-generate-replay-key",
          cookie,
        },
      });
      const videoReplay = await videoReplayResponse.json();

      const exportResponse = await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-export-preview-replay-key",
          cookie,
        },
      });
      const exportPreview = await exportResponse.json();
      const exportReplayResponse = await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: {
          "idempotency-key": "http-export-preview-replay-key",
          cookie,
        },
      });
      const exportReplay = await exportReplayResponse.json();
      const historyResponse = await fetch(`${server.origin}/api/creator/export/history`, {
        headers: { cookie },
      });
      const history = await historyResponse.json();

      assert.equal(calibrationResponse.status, 200);
      assert.equal(calibrationReplayResponse.status, 200);
      assert.equal(calibration.auditEvent.id, calibrationReplay.auditEvent.id);
      assert.equal(imageResponse.status, 200);
      assert.equal(imageReplayResponse.status, 200);
      assert.equal(image.platform.workflowId, imageReplay.platform.workflowId);
      assert.equal(videoResponse.status, 200);
      assert.equal(videoReplayResponse.status, 200);
      assert.equal(video.platform.workflowId, videoReplay.platform.workflowId);
      assert.equal(exportResponse.status, 200);
      assert.equal(exportReplayResponse.status, 200);
      assert.equal(exportPreview.exportRecord.id, exportReplay.exportRecord.id);
      assert.equal(history.records.length, 1);
    } finally {
      await server.close();
    }
  });

  it("maps creator route validation and state errors to stable responses", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const unauthenticatedResponse = await fetch(
        `${server.origin}/api/creator/project/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "unauthenticated-create-key",
          },
          body: JSON.stringify({
            name: "Unauthorized",
            scriptInput: "Episode 1: No session.",
            aspectRatio: "9:16",
            resolution: "1080p",
          }),
        },
      );
      const unauthenticated = await unauthenticatedResponse.json();

      const cookie = await login(server.origin, "13800138000");
      const invalidJsonResponse = await fetch(
        `${server.origin}/api/creator/project/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "invalid-json-create-key",
            cookie,
          },
          body: "{",
        },
      );
      const invalidJson = await invalidJsonResponse.json();

      const invalidCreateResponse = await fetch(
        `${server.origin}/api/creator/project/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "invalid-create-key",
            cookie,
          },
          body: JSON.stringify({
            name: " ",
            scriptInput: " ",
            aspectRatio: "1:1",
            resolution: "4k",
          }),
        },
      );
      const invalidCreate = await invalidCreateResponse.json();

      const parseWithoutProjectResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "parse-without-project-key",
          cookie,
        },
      });
      const parseWithoutProject = await parseWithoutProjectResponse.json();
      const exportWithoutProjectResponse = await fetch(
        `${server.origin}/api/creator/export/preview`,
        {
          method: "POST",
          headers: {
            "idempotency-key": "export-without-project-key",
            cookie,
          },
        },
      );
      const exportWithoutProject = await exportWithoutProjectResponse.json();

      assert.equal(unauthenticatedResponse.status, 401);
      assert.deepEqual(unauthenticated, { error: "unauthenticated" });
      assert.equal(invalidJsonResponse.status, 400);
      assert.deepEqual(invalidJson, { error: "invalid_json" });
      assert.equal(invalidCreateResponse.status, 400);
      assert.equal(invalidCreate.error, "invalid_project_input");
      assert.equal(typeof invalidCreate.fieldErrors.name, "string");
      assert.equal(parseWithoutProjectResponse.status, 409);
      assert.deepEqual(parseWithoutProject, { error: "creator_project_missing" });
      assert.equal(exportWithoutProjectResponse.status, 409);
      assert.deepEqual(exportWithoutProject, { error: "creator_project_missing" });
    } finally {
      await server.close();
    }
  });

  it("exposes project management, asset library, shot editing, and parameterized generation routes", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "management-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator backend gap coverage",
          scriptInput: "Episode 6: Backend gap coverage needs editable shots.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const projectsResponse = await fetch(`${server.origin}/api/creator/projects`, {
        headers: { cookie },
      });
      const projects = await projectsResponse.json();

      const patchResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          name: "Creator backend gap coverage renamed",
        }),
      });
      const patched = await patchResponse.json();

      const coverResponse = await fetch(`${server.origin}/api/creator/project/cover`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          coverImageUrl: "data:image/png;base64,cover",
        }),
      });
      const covered = await coverResponse.json();

      const generatedAssetResponse = await fetch(
        `${server.origin}/api/creator/assets/generate`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            kind: "character",
            name: "Hero Library Asset",
            prompt: "hero with blue coat",
            model: "jimeng-4",
          }),
        },
      );
      const generatedAsset = await generatedAssetResponse.json();

      const importedAssetResponse = await fetch(`${server.origin}/api/creator/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          kind: "scene",
          name: "Imported Alley",
          storageObjectKey: "data:image/png;base64,imported-alley",
          mimeType: "image/png",
          width: 1280,
          height: 720,
        }),
      });
      const importedAsset = await importedAssetResponse.json();

      const deletableAssetResponse = await fetch(`${server.origin}/api/creator/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          kind: "prop",
          name: "Disposable Prop",
          storageObjectKey: "data:image/png;base64,disposable-prop",
          mimeType: "image/png",
          width: 512,
          height: 512,
        }),
      });
      const deletableAsset = await deletableAssetResponse.json();

      const libraryResponse = await fetch(`${server.origin}/api/creator/assets/library`, {
        headers: { cookie },
      });
      const library = await libraryResponse.json();

      const versionsResponse = await fetch(
        `${server.origin}/api/creator/assets/versions/${generatedAsset.asset.id}`,
        {
          headers: { cookie },
        },
      );
      const versions = await versionsResponse.json();

      await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "management-parse-key",
          cookie,
        },
      });

      const detailResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detail = await detailResponse.json();

      const membersResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/members`,
        {
          headers: { cookie },
        },
      );
      const members = await membersResponse.json();

      const statsResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/stats`,
        {
          headers: { cookie },
        },
      );
      const stats = await statsResponse.json();

      const updateAssetResponse = await fetch(
        `${server.origin}/api/creator/assets/${importedAsset.asset.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            name: "Imported Alley Revised",
            description: "Updated imported alley description",
            isMain: true,
          }),
        },
      );
      const updatedAsset = await updateAssetResponse.json();

      const detailAfterAssetUpdateResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detailAfterAssetUpdate = await detailAfterAssetUpdateResponse.json();
      const updatedSceneAsset = detailAfterAssetUpdate.assetsByType.scene.find(
        (asset: { id: string }) => asset.id === importedAsset.asset.id,
      );

      const deleteAssetResponse = await fetch(
        `${server.origin}/api/creator/assets/${deletableAsset.asset.id}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
        },
      );
      const deletedAsset = await deleteAssetResponse.json();

      const statsAfterDeleteResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/stats`,
        {
          headers: { cookie },
        },
      );
      const statsAfterDelete = await statsAfterDeleteResponse.json();

      const episodesResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/episodes`,
        {
          headers: { cookie },
        },
      );
      const episodes = await episodesResponse.json();

      const selectResponse = await fetch(`${server.origin}/api/creator/project/select`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId: created.project.id }),
      });
      const selected = await selectResponse.json();

      const createEpisodeResponse = await fetch(`${server.origin}/api/creator/episodes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          title: "Manual Episode",
        }),
      });
      const createdEpisode = await createEpisodeResponse.json();

      const updateEpisodeResponse = await fetch(`${server.origin}/api/creator/episodes`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          episodeId: createdEpisode.episode.id,
          title: "Manual Episode Updated",
          status: "ready",
        }),
      });
      const updatedEpisode = await updateEpisodeResponse.json();

      const deleteEpisodeResponse = await fetch(`${server.origin}/api/creator/episodes`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          episodeId: createdEpisode.episode.id,
        }),
      });
      const deletedEpisode = await deleteEpisodeResponse.json();

      const createShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ title: "Inserted manual shot" }),
      });
      const createdShot = await createShotResponse.json();

      const updateShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          shotId: createdShot.shot.id,
          title: "Updated manual shot",
          description: "Updated manual shot description",
        }),
      });
      const updatedShot = await updateShotResponse.json();

      const importedShotImageResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/import`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            kind: "image",
            name: "Manual storyboard image",
            storageObjectKey: "data:image/png;base64,manual-storyboard-image",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const importedShotImage = await importedShotImageResponse.json();

      const importedSecondShotImageResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/import`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            kind: "image",
            name: "Manual storyboard image duplicate source",
            storageObjectKey: "data:image/png;base64,manual-storyboard-image",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const importedSecondShotImage = await importedSecondShotImageResponse.json();

      const importedShotVideoResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/import`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            kind: "video",
            name: "Manual storyboard video",
            storageObjectKey: "data:video/mp4;base64,manual-storyboard-video",
            mimeType: "video/mp4",
            width: 1024,
            height: 1024,
            durationMs: 10_000,
          }),
        },
      );
      const importedShotVideo = await importedShotVideoResponse.json();

      const referencesResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/references`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            items: [
              {
                role: "character",
                assetId: generatedAsset.asset.id,
                assetVersionId: generatedAsset.version.id,
              },
              {
                role: "scene",
                assetId: importedAsset.asset.id,
                assetVersionId: importedAsset.version.id,
              },
            ],
          }),
        },
      );
      const references = await referencesResponse.json();

      const detailAfterShotMediaResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detailAfterShotMedia = await detailAfterShotMediaResponse.json();
      const hydratedManualShot = detailAfterShotMedia.shots.find(
        (shot: { id: string }) => shot.id === createdShot.shot.id,
      );

      const deleteSingleShotImageResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/${importedShotImage.version.id}?kind=image`,
        {
          method: "DELETE",
          headers: {
            cookie,
          },
        },
      );
      const deletedSingleShotImage = await deleteSingleShotImageResponse.json();

      const detailAfterSingleShotImageDeleteResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detailAfterSingleShotImageDelete = await detailAfterSingleShotImageDeleteResponse.json();
      const hydratedManualShotAfterSingleImageDelete = detailAfterSingleShotImageDelete.shots.find(
        (shot: { id: string }) => shot.id === createdShot.shot.id,
      );

      const deleteShotVideoMediaResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/${importedShotVideo.version.id}?kind=video`,
        {
          method: "DELETE",
          headers: {
            cookie,
          },
        },
      );
      const deletedShotVideoMedia = await deleteShotVideoMediaResponse.json();

      const staleShotImageMediaId = "11111111-1111-4111-8111-111111111111";
      const deleteShotImageMediaByStaleIdResponse = await fetch(
        `${server.origin}/api/creator/shots/${createdShot.shot.id}/media/${staleShotImageMediaId}?kind=image`,
        {
          method: "DELETE",
          headers: {
            cookie,
          },
        },
      );
      const deletedShotImageMediaByStaleId = await deleteShotImageMediaByStaleIdResponse.json();

      const detailAfterShotVideoDeleteResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/detail`,
        {
          headers: { cookie },
        },
      );
      const detailAfterShotVideoDelete = await detailAfterShotVideoDeleteResponse.json();
      const hydratedManualShotAfterVideoDelete = detailAfterShotVideoDelete.shots.find(
        (shot: { id: string }) => shot.id === createdShot.shot.id,
      );

      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const state = await stateResponse.json();
      const reorderedIds = [...state.shots].reverse().map((shot: { id: string }) => shot.id);
      const reorderResponse = await fetch(`${server.origin}/api/creator/shots/reorder`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ shotIds: reorderedIds }),
      });
      const reordered = await reorderResponse.json();

      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });
      await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: {
          "idempotency-key": "management-calibration-key",
          cookie,
        },
      });
      const latestStateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const latestState = await latestStateResponse.json();
      const firstShotId = latestState.shots[0]?.id;
      const imageResponse = await fetch(`${server.origin}/api/creator/images/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "management-image-key",
          cookie,
        },
        body: JSON.stringify({
          shotId: firstShotId,
          promptOverride: "single shot prompt",
          model: "image-model-test",
          parameters: { seed: 42 },
        }),
      });
      const imageResult = await imageResponse.json();

      const deleteShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ shotId: createdShot.shot.id }),
      });
      const deletedShot = await deleteShotResponse.json();

      const deleteProjectResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId: created.project.id }),
      });
      const deletedProject = await deleteProjectResponse.json();

      assert.equal(projectsResponse.status, 200);
      assert.equal(projects.projects.length, 1);
      assert.equal(patchResponse.status, 200);
      assert.equal(patched.project.name, "Creator backend gap coverage renamed");
      assert.equal(coverResponse.status, 200);
      assert.equal(covered.project.coverImageUrl, "data:image/png;base64,cover");
      assert.equal(generatedAssetResponse.status, 200);
      assert.equal(generatedAsset.asset.assetType, "character_sheet");
      assert.equal(importedAssetResponse.status, 200);
      assert.equal(importedAsset.asset.assetType, "scene_reference");
      assert.equal(deletableAssetResponse.status, 200);
      assert.equal(deletableAsset.asset.assetType, "prop_reference");
      assert.equal(libraryResponse.status, 200);
      assert.equal(library.assets.length, 3);
      assert.equal(
        library.assets.find((asset: { assetType: string }) => asset.assetType === "scene_reference")
          ?.previewUrl,
        "data:image/png;base64,imported-alley",
      );
      assert.equal(versionsResponse.status, 200);
      assert.equal(versions.versions.length, 1);
      assert.equal(detailResponse.status, 200);
      assert.equal(detail.project.id, created.project.id);
      assert.equal(detail.assetSummary.character.count, 1);
      assert.equal(detail.assetSummary.scene.count, 1);
      assert.equal(detail.assetSummary.prop.count, 1);
      assert.deepEqual(detail.assetSummary.scene.previews, [
        "data:image/png;base64,imported-alley",
      ]);
      assert.equal(membersResponse.status, 200);
      assert.ok(members.members.length >= 1);
      assert.equal(statsResponse.status, 200);
      assert.ok(stats.stats.memberCount >= 1);
      assert.equal(stats.stats.assetCount, 3);
      assert.equal(updateAssetResponse.status, 200);
      assert.equal(typeof updatedAsset.asset, "string");
      assert.equal(detailAfterAssetUpdateResponse.status, 200);
      assert.equal(updatedSceneAsset.label, "Imported Alley Revised");
      assert.equal(updatedSceneAsset.latestVersion.metadata.description, "Updated imported alley description");
      assert.equal(updatedSceneAsset.latestVersion.metadata.isMain, true);
      assert.equal(deleteAssetResponse.status, 200);
      assert.equal(deletedAsset.deleted, true);
      assert.equal(statsAfterDeleteResponse.status, 200);
      assert.equal(statsAfterDelete.stats.assetCount, 2);
      assert.equal(detail.episodes.length, 1);
      assert.equal(detail.episodes[0].storyboardCount, 3);
      assert.equal(
        detail.shots.every(
          (shot: { episodeId: string | null }) => shot.episodeId === detail.episodes[0].id,
        ),
        true,
      );
      assert.equal(episodesResponse.status, 200);
      assert.equal(episodes.episodes.length, 1);
      assert.equal(selectResponse.status, 200);
      assert.equal(selected.project.id, created.project.id);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createdEpisode.episode.sequence, 2);
      assert.equal(updateEpisodeResponse.status, 200);
      assert.equal(updatedEpisode.episode.title, "Manual Episode Updated");
      assert.equal(updatedEpisode.episode.status, "ready");
      assert.equal(deleteEpisodeResponse.status, 200);
      assert.equal(deletedEpisode.deleted, true);
      assert.equal(createShotResponse.status, 200);
      assert.equal(createdShot.shot.title, "Inserted manual shot");
      assert.equal(updateShotResponse.status, 200);
      assert.equal(updatedShot.shot.title, "Updated manual shot");
      assert.equal(updatedShot.shot.description, "Updated manual shot description");
      assert.equal(importedShotImageResponse.status, 200);
      assert.equal(importedShotImage.asset.assetType, "shot_image");
      assert.equal(importedShotImage.shot.currentImageAssetVersionId, importedShotImage.version.id);
      assert.equal(importedSecondShotImageResponse.status, 200);
      assert.equal(importedSecondShotImage.asset.id, importedShotImage.asset.id);
      assert.equal(importedSecondShotImage.asset.assetType, "shot_image");
      assert.equal(importedSecondShotImage.shot.currentImageAssetVersionId, importedSecondShotImage.version.id);
      assert.equal(importedShotVideoResponse.status, 200);
      assert.equal(importedShotVideo.asset.assetType, "shot_video");
      assert.equal(importedShotVideo.shot.currentVideoAssetVersionId, importedShotVideo.version.id);
      assert.equal(referencesResponse.status, 200);
      assert.deepEqual(
        references.references.map((reference: { role: string }) => reference.role),
        ["character", "scene"],
      );
      assert.equal(detailAfterShotMediaResponse.status, 200);
      assert.equal(hydratedManualShot.description, "Updated manual shot description");
      assert.equal(hydratedManualShot.previewImageUrl, "data:image/png;base64,manual-storyboard-image");
      assert.equal(hydratedManualShot.previewVideoUrl, "data:video/mp4;base64,manual-storyboard-video");
      assert.equal(hydratedManualShot.imageVersions.length, 2);
      assert.equal(hydratedManualShot.videoVersions.length, 1);
      assert.equal(hydratedManualShot.references.length, 2);
      assert.equal(deleteSingleShotImageResponse.status, 200);
      assert.equal(deletedSingleShotImage.deletedAssetVersionId, importedShotImage.version.id);
      assert.equal(detailAfterSingleShotImageDeleteResponse.status, 200);
      assert.equal(hydratedManualShotAfterSingleImageDelete.imageVersions.length, 1);
      assert.deepEqual(
        hydratedManualShotAfterSingleImageDelete.imageVersions.map((version: { id: string }) => version.id),
        [importedSecondShotImage.version.id],
      );
      assert.equal(
        hydratedManualShotAfterSingleImageDelete.currentImageAssetVersionId,
        importedSecondShotImage.version.id,
      );
      assert.equal(deleteShotVideoMediaResponse.status, 200);
      assert.equal(deletedShotVideoMedia.deletedAssetVersionId, importedShotVideo.version.id);
      assert.equal(deleteShotImageMediaByStaleIdResponse.status, 200);
      assert.equal(deletedShotImageMediaByStaleId.deletedAssetVersionId, staleShotImageMediaId);
      assert.equal(detailAfterShotVideoDeleteResponse.status, 200);
      assert.equal(hydratedManualShotAfterVideoDelete.currentImageAssetVersionId, null);
      assert.equal(hydratedManualShotAfterVideoDelete.previewImageUrl, null);
      assert.equal(hydratedManualShotAfterVideoDelete.imageVersions.length, 0);
      assert.equal(hydratedManualShotAfterVideoDelete.currentVideoAssetVersionId, null);
      assert.equal(hydratedManualShotAfterVideoDelete.previewVideoUrl, null);
      assert.equal(hydratedManualShotAfterVideoDelete.videoVersions.length, 0);
      assert.equal(reorderResponse.status, 200, JSON.stringify(reordered));
      assert.deepEqual(
        reordered.shots.map((shot: { id: string }) => shot.id),
        reorderedIds,
      );
      assert.equal(deleteShotResponse.status, 200);
      assert.equal(
        deletedShot.shots.some((shot: { id: string }) => shot.id === createdShot.shot.id),
        false,
      );
      assert.equal(imageResponse.status, 200);
      assert.equal(imageResult.platform.tasks.length, 1);
      assert.equal(imageResult.request.promptOverride, "single shot prompt");
      assert.equal(deleteProjectResponse.status, 200);
      assert.equal(deletedProject.deleted, true);
    } finally {
      await server.close();
    }
  });

  it("rejects creator-side single shot retry routes before a shot has failed", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const cookie = await login(server.origin, "13800138000");

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "retry-route-create-key",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator retry route smoke test",
          scriptInput: "Episode 3: A creator retries one failed frame.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: {
          "idempotency-key": "retry-route-parse-key",
          cookie,
        },
      });
      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });
      await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: {
          "idempotency-key": "retry-route-calibration-key",
          cookie,
        },
      });

      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const state = await stateResponse.json();
      const shotId = state.shots[0].id;

      const imageRetryResponse = await fetch(
        `${server.origin}/api/creator/shots/${shotId}/image/retry`,
        {
          method: "POST",
          headers: { cookie },
        },
      );
      const imageRetry = await imageRetryResponse.json();
      const videoRetryResponse = await fetch(
        `${server.origin}/api/creator/shots/${shotId}/video/retry`,
        {
          method: "POST",
          headers: { cookie },
        },
      );
      const videoRetry = await videoRetryResponse.json();

      assert.equal(imageRetryResponse.status, 409);
      assert.equal(videoRetryResponse.status, 409);
      assert.deepEqual(imageRetry, { error: "shot_image_retry_unavailable" });
      assert.deepEqual(videoRetry, { error: "current_image_required" });
    } finally {
      await server.close();
    }
  });

  it("exposes a package script for starting the dev server", async () => {
    const packageJson = await readFile(
      new URL("../../../../../package.json", import.meta.url),
      "utf8",
    );
    const launcherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-dev-server.mjs", import.meta.url),
      "utf8",
    );

    assert.match(packageJson, /"dev:phone-auth"/);
    assert.match(packageJson, /--import tsx/);
    assert.match(packageJson, /run-phone-auth-dev-server\.mjs/);
    assert.match(launcherScript, /phone-auth-dev-server\.ts/);
  });

  it("uses an import-based launcher that starts the dev server explicitly", async () => {
    const launcherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-dev-server.mjs", import.meta.url),
      "utf8",
    );
    const packageJson = await readFile(
      new URL("../../../../../package.json", import.meta.url),
      "utf8",
    );

    assert.match(launcherScript, /createPhoneAuthDevServer/);
    assert.match(launcherScript, /server\.listen\(port\)/);
    assert.match(launcherScript, /process\.env\.PORT/);
    assert.match(packageJson, /--import tsx/);
    assert.match(launcherScript, /--import|--loader/);
    assert.match(launcherScript, /resolveTsxRuntimeArgs\(runtime\)/);
    assert.doesNotMatch(launcherScript, /shell:\s*process\.platform/);
    assert.doesNotMatch(launcherScript, /shell:\s*true/);
    assert.match(launcherScript, /process\.platform === "win32"\s*\?\s*"where\.exe"\s*:\s*"which"/);
    assert.match(launcherScript, /loadDotEnvFile/);
    assert.match(launcherScript, /\.env/);
  });
});

async function login(origin: string, phone: string) {
  const requestResponse = await fetch(`${origin}/api/auth/code/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const requested = await requestResponse.json();
  const debugResponse = await fetch(
    `${origin}/api/auth/dev/challenges/${requested.challengeId}`,
  );
  const debug = await debugResponse.json();
  const verifyResponse = await fetch(`${origin}/api/auth/code/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: requested.challengeId,
      phone,
      code: debug.code,
    }),
  });

  assert.equal(verifyResponse.status, 200);
  return verifyResponse.headers.get("set-cookie") ?? "";
}
