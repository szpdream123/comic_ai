import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// This suite spins up many dev servers and local DB instances; keep subtests serial to
// avoid cross-test interference from runtime-level resources in the Node test runner.
describe.configure?.({ concurrency: 1 });

import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";
import { createDevDb } from "../../modules/shared/db/dev-db.ts";

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

  it("serves official library PNG previews as binary static assets", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const response = await fetch(
        `${server.origin}/assets/library/official/characters/nanny.png`,
      );
      const bytes = new Uint8Array(await response.arrayBuffer());

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.deepEqual(Array.from(bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
    } finally {
      await server.close();
    }
  });

  it("serves the local Three module files used by the LiquidEther homepage background", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const moduleResponse = await fetch(`${server.origin}/vendor/three.module.js`);
      const moduleText = await moduleResponse.text();
      const coreResponse = await fetch(`${server.origin}/vendor/three.core.js`);
      const coreText = await coreResponse.text();

      assert.equal(moduleResponse.status, 200);
      assert.match(moduleResponse.headers.get("content-type") ?? "", /text\/javascript/);
      assert.match(moduleText, /three\.core\.js/);
      assert.equal(coreResponse.status, 200);
      assert.match(coreResponse.headers.get("content-type") ?? "", /text\/javascript/);
      assert.match(coreText, /class Vector2/);
    } finally {
      await server.close();
    }
  });

  it("serves app shell for episode deep links", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/projects/project-1/episodes/episode-1`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /id="creator-app"/);
      assert.match(html, /src="\/app\.js"/);
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

  it("exposes the provider callback boundary and rejects unknown payment providers", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const response = await fetch(
        `${server.origin}/api/payment-provider-callbacks/stripe`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(payload, { error: "invalid_payment_provider" });
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

      const importedAlleyUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "asset-import/scene",
        fileName: "imported-alley.png",
        contentType: "image/png",
        body: Buffer.from([1, 2, 3, 4]),
      });
      const importedAssetResponse = await fetch(`${server.origin}/api/creator/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          kind: "scene",
          name: "Imported Alley",
          description: "imported-scene-description",
          uploadSessionId: importedAlleyUpload.uploadSessionId,
          storageObjectId: importedAlleyUpload.storageObjectId,
          mimeType: "image/png",
          width: 1280,
          height: 720,
        }),
      });
      const importedAsset = await importedAssetResponse.json();
      assert.equal(importedAsset.version.metadata.description, "imported-scene-description");

      const deletablePropUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "asset-import/prop",
        fileName: "disposable-prop.png",
        contentType: "image/png",
        body: Buffer.from([5, 6, 7, 8]),
      });
      const deletableAssetResponse = await fetch(`${server.origin}/api/creator/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          kind: "prop",
          name: "Disposable Prop",
          uploadSessionId: deletablePropUpload.uploadSessionId,
          storageObjectId: deletablePropUpload.storageObjectId,
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

      const dashboardExportResponse = await fetch(
        `${server.origin}/api/creator/projects/${created.project.id}/team-dashboard/export?tab=member-consumption&dateShortcut=%E4%BB%8A%E5%A4%A9&role=all&status=all`,
        {
          headers: { cookie },
        },
      );
      const dashboardExportCsv = await dashboardExportResponse.text();

      const enterpriseContactResponse = await fetch(
        `${server.origin}/api/billing/enterprise-contact-requests`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "enterprise-contact-request-key",
            cookie,
          },
          body: JSON.stringify({
            source: "pricing_modal",
            note: "enterprise_plan_interest",
          }),
        },
      );
      const enterpriseContact = await enterpriseContactResponse.json();

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

      const importedShotImageUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "storyboard-image",
        fileName: "manual-storyboard-image.png",
        contentType: "image/png",
        body: Buffer.from([9, 10, 11, 12]),
      });
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
            uploadSessionId: importedShotImageUpload.uploadSessionId,
            storageObjectId: importedShotImageUpload.storageObjectId,
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const importedShotImage = await importedShotImageResponse.json();

      const importedSecondShotImageUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "storyboard-image",
        fileName: "manual-storyboard-image-dup.png",
        contentType: "image/png",
        body: Buffer.from([13, 14, 15, 16]),
      });
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
            uploadSessionId: importedSecondShotImageUpload.uploadSessionId,
            storageObjectId: importedSecondShotImageUpload.storageObjectId,
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const importedSecondShotImage = await importedSecondShotImageResponse.json();

      const importedShotVideoUpload = await prepareDirectUpload(server.origin, cookie, created.project.id, {
        purpose: "storyboard-video",
        fileName: "manual-storyboard-video.mp4",
        contentType: "video/mp4",
        body: Buffer.from([17, 18, 19, 20]),
      });
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
            uploadSessionId: importedShotVideoUpload.uploadSessionId,
            storageObjectId: importedShotVideoUpload.storageObjectId,
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
      assert.match(
        library.assets.find((asset: { assetType: string }) => asset.assetType === "scene_reference")
          ?.previewUrl ?? "",
        /^\/uploads\/storage\//,
      );
      assert.equal(versionsResponse.status, 200);
      assert.equal(versions.versions.length, 1);
      assert.equal(detailResponse.status, 200);
      assert.equal(detail.project.id, created.project.id);
      assert.equal(detail.assetSummary.character.count, 1);
      assert.equal(detail.assetSummary.scene.count, 1);
      assert.equal(detail.assetSummary.prop.count, 1);
      assert.equal(detail.assetSummary.scene.previews.length, 1);
      assert.match(detail.assetSummary.scene.previews[0], /^\/uploads\/storage\//);
      assert.equal(membersResponse.status, 200);
      assert.ok(members.members.length >= 1);
      assert.equal(statsResponse.status, 200);
      assert.ok(stats.stats.memberCount >= 1);
      assert.equal(stats.stats.assetCount, 3);
      assert.equal(dashboardExportResponse.status, 200);
      assert.match(dashboardExportResponse.headers.get("content-type") ?? "", /text\/csv/);
      assert.match(dashboardExportResponse.headers.get("content-disposition") ?? "", /team-dashboard-/);
      assert.match(dashboardExportCsv, /member-consumption/);
      assert.match(dashboardExportCsv, /\+8613800138000/);
      assert.equal(enterpriseContactResponse.status, 200);
      assert.equal(enterpriseContact.request.status, "submitted");
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
      assert.match(hydratedManualShot.previewImageUrl, /^\/uploads\/storage\//);
      assert.match(hydratedManualShot.previewVideoUrl, /^\/uploads\/storage\//);
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

  it("exposes reusable official asset library routes without project import", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const cookie = await login(server.origin, "13800138000");

      const officialResponse = await fetch(
        `${server.origin}/api/creator/library/assets?scope=official&category=character&q=${encodeURIComponent("医生")}`,
        { headers: { cookie } },
      );
      const official = await officialResponse.json();
      const libraryAsset = official.assets[0];

      const removedImportResponse = await fetch(
        `${server.origin}/api/creator/library/assets/import-to-project`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            projectId: "40000000-0000-4000-8000-000000000001",
            libraryAssetId: libraryAsset.id,
          }),
        },
      );

      assert.equal(officialResponse.status, 200);
      assert.equal(libraryAsset.name, "医生");
      assert.match(
        libraryAsset.previewUrl,
        /^\/assets\/library\/official\/characters\/doctor\.png$/,
      );
      assert.equal(removedImportResponse.status, 404);
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

  it("exposes enveloped project-to-episode workbench routes for the new page contract", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-workbench-contract-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode workbench contract",
          scriptInput: "Episode 1: The project opens an episode workbench.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-workbench-contract-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode 1" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const detailResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/detail`,
        { headers: { cookie } },
      );
      const detailEnvelope = await detailResponse.json();

      const workbenchResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/workbench`,
        { headers: { cookie } },
      );
      const workbenchEnvelope = await workbenchResponse.json();

      const assetsResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets?page=1&pageSize=5`,
        { headers: { cookie } },
      );
      const assetsEnvelope = await assetsResponse.json();

      const storyboardsResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/storyboards?page=1&pageSize=5`,
        { headers: { cookie } },
      );
      const storyboardsEnvelope = await storyboardsResponse.json();

      const tasksResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation-tasks?page=1&pageSize=5`,
        { headers: { cookie } },
      );
      const tasksEnvelope = await tasksResponse.json();
        const generationConfigResponse = await fetch(
          `${server.origin}/api/episodes/${episodeId}/generation-config`,
          { headers: { cookie } },
        );
        const generationConfigEnvelope = await generationConfigResponse.json();
        const createStoryboardResponse = await fetch(`${server.origin}/api/creator/shots`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            title: "Storyboard 1",
            description: "generation draft storyboard",
            episodeId,
          }),
        });
        const createStoryboardEnvelope = await createStoryboardResponse.json();
        const storyboardId = createStoryboardEnvelope.shot.id;
        const saveDraftResponse = await fetch(
          `${server.origin}/api/episodes/${episodeId}/generation-drafts/storyboard/${storyboardId}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie,
            },
            body: JSON.stringify({
              prompt: "storyboard draft prompt",
              mode: "image",
              payload: {
                modelCode: "nano_banana_2",
                aspectRatio: "16:9",
              },
            }),
          },
        );
        const saveDraftEnvelope = await saveDraftResponse.json();

      assert.equal(createEpisodeResponse.status, 200);
      assert.match(createdEpisodeEnvelope.requestId, /.+/);
      assert.equal(detailResponse.status, 200);
      assert.equal(detailEnvelope.data.project.projectId, created.project.id);
      assert.ok(
        detailEnvelope.data.episodes.some(
          (episode: { episodeId: string; title: string }) =>
            episode.episodeId === episodeId && episode.title === "Episode 1",
        ),
      );
      assert.equal(workbenchResponse.status, 200);
      assert.equal(workbenchEnvelope.data.episode.episodeId, episodeId);
      assert.equal(workbenchEnvelope.data.episode.projectId, created.project.id);
      assert.equal(workbenchEnvelope.data.project.projectId, created.project.id);
      assert.equal(workbenchEnvelope.data.navigation.backTarget, "project_episodes");
      assert.equal(typeof workbenchEnvelope.data.permissions.canEdit, "boolean");
      assert.equal(Object.prototype.hasOwnProperty.call(workbenchEnvelope.data, "storyboards"), false);
      assert.deepEqual(workbenchEnvelope.data.assetsByType.role, []);
      assert.deepEqual(workbenchEnvelope.data.assetsByType.character, []);
      assert.deepEqual(workbenchEnvelope.data.assetsByType.scene, []);
      assert.deepEqual(workbenchEnvelope.data.assetsByType.prop, []);
      assert.equal(assetsResponse.status, 200);
      assert.deepEqual(Object.keys(assetsEnvelope.data).sort(), [
        "hasNext",
        "items",
        "page",
        "pageSize",
        "total",
      ]);
      assert.equal(storyboardsResponse.status, 200);
      assert.equal(storyboardsEnvelope.data.items.every(
        (storyboard: { episodeId?: string }) => !storyboard.episodeId || storyboard.episodeId === episodeId,
      ), true);
        assert.equal(tasksResponse.status, 200);
        assert.deepEqual(tasksEnvelope.data.items, []);
        assert.equal(generationConfigResponse.status, 200);
        assert.equal(generationConfigEnvelope.data.defaultImageModelCode, "nano_banana_2");
        assert.equal(generationConfigEnvelope.data.defaultVideoModelCode, "video_mock_1");
        assert.equal(generationConfigEnvelope.data.creditBalance, 10000);
        assert.equal(generationConfigEnvelope.data.uploadLimits.image.maxBytes, 20 * 1024 * 1024);
        assert.equal(generationConfigEnvelope.data.uploadLimits.video.maxBytes, 500 * 1024 * 1024);
        assert.equal(generationConfigEnvelope.data.uploadLimits.image.maxReferencesPerTask, 30);
        assert.ok(generationConfigEnvelope.data.uploadLimits.blockedExtensions.includes(".exe"));
        assert.equal(createStoryboardResponse.status, 200);
        assert.equal(saveDraftResponse.status, 200);
        assert.equal(saveDraftEnvelope.data.draft.episodeId, episodeId);
        assert.equal(saveDraftEnvelope.data.draft.targetType, "storyboard");
        assert.equal(saveDraftEnvelope.data.draft.targetId, storyboardId);
        assert.equal(saveDraftEnvelope.data.draft.prompt, "storyboard draft prompt");
        assert.equal(saveDraftEnvelope.data.draft.payload.modelCode, "nano_banana_2");
      } finally {
        await server.close();
      }
  });

  it("creates and updates project members through the project-scoped team API", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138001");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "team-member-project-create",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "Team member create",
          scriptInput: "Episode 1: create project member.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "team-member-create-1",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            phone: "13800138002",
            role: "creator",
            note: "storyboard-collab",
          }),
        },
      );
      const createdMember = await createMemberResponse.json();

      const updateMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "team-member-create-2",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            phone: "13800138002",
            role: "viewer",
            note: "readonly-review",
          }),
        },
      );
      const updatedMember = await updateMemberResponse.json();

      const listMembersResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members`,
        {
          headers: {
            cookie: ownerCookie,
          },
        },
      );
      const listedMembers = await listMembersResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createMemberResponse.status, 200);
      assert.equal(createdMember.member.phone, "+8613800138002");
      assert.equal(createdMember.member.role, "creator");
      assert.equal(createdMember.member.note, "storyboard-collab");

      assert.equal(updateMemberResponse.status, 200);
      assert.equal(updatedMember.member.phone, "+8613800138002");
      assert.equal(updatedMember.member.role, "viewer");
      assert.equal(updatedMember.member.note, "readonly-review");

      assert.equal(listMembersResponse.status, 200);
      assert.equal(
        listedMembers.members.some(
          (member: { phone?: string; role?: string; note?: string }) =>
            member.phone === "+8613800138002" &&
            member.role === "viewer" &&
            member.note === "readonly-review",
        ),
        true,
      );
    } finally {
      await server.close();
    }
  });

  it("patches member role, note, and status through the member-scoped team API", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138001");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "team-member-patch-project-create",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "Team member patch",
          scriptInput: "Episode 1: patch team member.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "team-member-patch-create",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            phone: "13800138004",
            role: "creator",
            note: "new-member",
          }),
        },
      );
      const createdMember = await createMemberResponse.json();
      const memberId = createdMember.member.id;

      const patchMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            role: "producer",
            note: "producer-updated",
            status: "disabled",
          }),
        },
      );
      const patchedMember = await patchMemberResponse.json();

      const restoreMemberResponse = await fetch(
        `${server.origin}/api/creator/projects/${projectId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            status: "active",
          }),
        },
      );
      const restoredMember = await restoreMemberResponse.json();

      assert.equal(patchMemberResponse.status, 200);
      assert.equal(patchedMember.member.role, "producer");
      assert.equal(patchedMember.member.note, "producer-updated");
      assert.equal(patchedMember.member.status, "disabled");

      assert.equal(restoreMemberResponse.status, 200);
      assert.equal(restoredMember.member.status, "enabled");
    } finally {
      await server.close();
    }
  });

  it("persists and reloads asset conversation history by selected asset id", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138006");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-conversation-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Asset conversation persistence",
          scriptInput: "Episode 1: persist selected asset history.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-conversation-episode-create",
            cookie,
          },
          body: JSON.stringify({ title: "Episode 1" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "role",
            name: "废土主角",
            description: "疲惫，警惕，穿破旧夹克。",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const appendConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [
              {
                turnId: "asset-image-turn-1",
                messageKey: "asset-image-turn-1:user_request",
                messageType: "user_request",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "瘦削，警惕，穿破旧夹克，肩背磨损背包。",
                  quickReferenceItems: [],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-image-turn-1",
                messageKey: "asset-image-turn-1:result",
                messageType: "result",
                taskId: "asset-image-task-1",
                status: "completed",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "瘦削，警惕，穿破旧夹克，肩背磨损背包。",
                  status: "completed",
                  taskId: "asset-image-task-1",
                  fixedImages: [
                    {
                      id: "asset-image-result-1",
                      label: "角色图片",
                      url: "https://example.com/asset-image-result-1.png",
                    },
                  ],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
            ],
          }),
        },
      );
      const appendConversationEnvelope = await appendConversationResponse.json();

      const getConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation?mediaMode=image`,
        {
          headers: { cookie },
        },
      );
      const getConversationEnvelope = await getConversationResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(appendConversationResponse.status, 200);
      assert.equal(getConversationResponse.status, 200);
      assert.equal(appendConversationEnvelope.data.entries.length, 1);
      assert.equal(getConversationEnvelope.data.entries.length, 1);
      assert.equal(getConversationEnvelope.data.entries[0].taskId, "asset-image-task-1");
      assert.equal(getConversationEnvelope.data.entries[0].status, "completed");
      assert.equal(
        getConversationEnvelope.data.entries[0].promptPreview,
        "瘦削，警惕，穿破旧夹克，肩背磨损背包。",
      );
      assert.equal(
        getConversationEnvelope.data.entries[0].fixedImages[0].url,
        "https://example.com/asset-image-result-1.png",
      );
    } finally {
      await server.close();
    }
  });

  it("deletes only the requested asset conversation turn and keeps the remaining history", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138007");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-conversation-delete-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Asset conversation delete",
          scriptInput: "Episode 1: delete only one persisted asset result.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-conversation-delete-episode-create",
            cookie,
          },
          body: JSON.stringify({ title: "Episode 1" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "role",
            name: "废土主角",
            description: "疲惫，警惕，穿破旧夹克。",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const appendConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [
              {
                turnId: "asset-image-task-1",
                messageKey: "asset-image-task-1:user_request",
                messageType: "user_request",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "第一条：补强破旧夹克和肩背磨损。",
                  quickReferenceItems: [],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-image-task-1",
                messageKey: "asset-image-task-1:result",
                messageType: "result",
                taskId: "asset-image-task-1",
                status: "completed",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "第一条：补强破旧夹克和肩背磨损。",
                  fixedImages: [
                    {
                      id: "asset-image-result-1",
                      label: "角色图片",
                      url: "https://example.com/asset-image-result-1.png",
                    },
                  ],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-image-task-2",
                messageKey: "asset-image-task-2:user_request",
                messageType: "user_request",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "第二条：补强眼神和面部风尘细节。",
                  quickReferenceItems: [],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
              {
                turnId: "asset-image-task-2",
                messageKey: "asset-image-task-2:result",
                messageType: "result",
                taskId: "asset-image-task-2",
                status: "completed",
                payload: {
                  assetId,
                  mediaKind: "image",
                  promptPreview: "第二条：补强眼神和面部风尘细节。",
                  fixedImages: [
                    {
                      id: "asset-image-result-2",
                      label: "角色图片",
                      url: "https://example.com/asset-image-result-2.png",
                    },
                  ],
                  selectionContext: {
                    assetTab: "character",
                    selectedAssetId: assetId,
                    selectedAssetName: "废土主角",
                  },
                },
              },
            ],
          }),
        },
      );
      await appendConversationResponse.json();

      const deleteConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages/asset-image-task-1?mediaMode=image`,
        {
          method: "DELETE",
          headers: {
            cookie,
          },
        },
      );
      const deleteConversationEnvelope = await deleteConversationResponse.json();

      const getConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation?mediaMode=image`,
        {
          headers: { cookie },
        },
      );
      const getConversationEnvelope = await getConversationResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(appendConversationResponse.status, 200);
      assert.equal(deleteConversationResponse.status, 200);
      assert.equal(getConversationResponse.status, 200);
      assert.equal(deleteConversationEnvelope.data.deleted, true);
      assert.equal(deleteConversationEnvelope.data.deletedCount, 2);
      assert.equal(deleteConversationEnvelope.data.entries.length, 1);
      assert.equal(deleteConversationEnvelope.data.entries[0].taskId, "asset-image-task-2");
      assert.equal(getConversationEnvelope.data.entries.length, 1);
      assert.equal(getConversationEnvelope.data.entries[0].taskId, "asset-image-task-2");
      assert.equal(
        getConversationEnvelope.data.entries[0].promptPreview,
        "第二条：补强眼神和面部风尘细节。",
      );
    } finally {
      await server.close();
    }
  });

  it("deletes a project that has persisted asset conversation history", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138016");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "asset-conversation-delete-project-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Delete project with persisted asset conversation",
          scriptInput: "Episode 1: Delete a project after asset conversation persistence.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "asset-conversation-delete-project-episode-create",
            cookie,
          },
          body: JSON.stringify({ title: "Episode delete project" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "role",
            name: "删除测试角色",
            description: "用于项目删除回归测试。",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const appendConversationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/conversation/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            mediaMode: "image",
            messages: [
              {
                turnId: "delete-project-turn-1",
                messageKey: "delete-project-turn-1:user_request",
                messageType: "user_request",
                payload: {
                  promptPreview: "删除项目回归测试提示词",
                },
              },
            ],
          }),
        },
      );

      const deleteProjectResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId }),
      });
      const deletedProject = await deleteProjectResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(appendConversationResponse.status, 200);
      assert.equal(deleteProjectResponse.status, 200);
      assert.equal(deletedProject.deleted, true);
      assert.equal(deletedProject.projectId, projectId);
    } finally {
      await server.close();
    }
  });

  it("deletes a project that has episode generation credit reservations", async () => {
    const db = await createDevDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138017");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "delete-project-with-credit-reservations-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Delete project with credit reservations",
          scriptInput: "Episode 1: create generation task then delete project.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();
      const projectId = createdProject.project.id;

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${projectId}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode with reservation" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const generationResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "delete-project-with-credit-reservations-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "generate before deleting project",
            model: "nano_banana_2",
          }),
        },
      );
      const generationEnvelope = await generationResponse.json();
      const taskId = generationEnvelope.data.taskId;

      const reservationRows = await db.query<{ count: number | string }>(
        `
          SELECT count(*)::int AS count
          FROM credit_reservations
          WHERE organization_id = $1
            AND project_id = $2
            AND task_id = $3
        `,
        ["10000000-0000-4000-8000-000000000001", projectId, taskId],
      );

      const deleteProjectResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId }),
      });
      const deletedProject = await deleteProjectResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(generationResponse.status, 200);
      assert.equal(Number(reservationRows.rows[0]?.count ?? 0) > 0, true);
      assert.equal(deleteProjectResponse.status, 200);
      assert.equal(deletedProject.deleted, true);
      assert.equal(deletedProject.projectId, projectId);
    } finally {
      await server.close();
    }
  });

  it("persists episode asset create, update, list, and delete through the episode workbench APIs", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-asset-crud-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode asset CRUD",
          scriptInput: "Episode 1: Persist episode assets and voices.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-asset-crud-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Asset CRUD" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "role",
            name: "废土主角",
            description: "初始角色设定",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const listAfterCreateResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets?assetType=role&page=1&pageSize=20`,
        { headers: { cookie } },
      );
      const listAfterCreateEnvelope = await listAfterCreateResponse.json();
      const workbenchAfterCreateResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/workbench`,
        { headers: { cookie } },
      );
      const workbenchAfterCreateEnvelope = await workbenchAfterCreateResponse.json();

      const updateAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            description: "更新后的角色设定",
            voiceId: "voice-wasteland-01",
            voiceName: "冷峻低音",
            dubbingConfig: {
              style: "calm",
            },
          }),
        },
      );
      const updateAssetEnvelope = await updateAssetResponse.json();

      const deleteAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const deleteAssetEnvelope = await deleteAssetResponse.json();

      const listAfterDeleteResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets?assetType=role&page=1&pageSize=20`,
        { headers: { cookie } },
      );
      const listAfterDeleteEnvelope = await listAfterDeleteResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(createAssetEnvelope.data.asset.assetType, "role");
      assert.equal(createAssetEnvelope.data.asset.name, "废土主角");
      assert.equal(createAssetEnvelope.data.asset.description, "初始角色设定");
      assert.equal(listAfterCreateResponse.status, 200);
      assert.equal(listAfterCreateEnvelope.data.items.length, 1);
      assert.equal(listAfterCreateEnvelope.data.items[0].assetId, assetId);
      assert.equal(workbenchAfterCreateResponse.status, 200);
      assert.equal(workbenchAfterCreateEnvelope.data.assetsByType.role.length, 1);
      assert.equal(workbenchAfterCreateEnvelope.data.assetsByType.role[0].assetId, assetId);
      assert.equal(workbenchAfterCreateEnvelope.data.assetsByType.character[0].name, "废土主角");
      assert.equal(updateAssetResponse.status, 200);
      assert.equal(updateAssetEnvelope.data.asset.assetId, assetId);
      assert.equal(updateAssetEnvelope.data.asset.description, "更新后的角色设定");
      assert.equal(updateAssetEnvelope.data.asset.voiceId, "voice-wasteland-01");
      assert.equal(updateAssetEnvelope.data.asset.voiceName, "冷峻低音");
      assert.deepEqual(updateAssetEnvelope.data.asset.dubbingConfig, { style: "calm" });
      assert.equal(deleteAssetResponse.status, 200);
      assert.equal(deleteAssetEnvelope.data.deleted, true);
      assert.equal(listAfterDeleteResponse.status, 200);
      assert.deepEqual(listAfterDeleteEnvelope.data.items, []);
    } finally {
      await server.close();
    }
  });

  it("imports assets into the current episode workbench instead of the project asset library", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-asset-import-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode asset import",
          scriptInput: "Episode 1: Import an asset into the current episode workbench.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-asset-import-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Asset Import" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-asset-import-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "asset",
            targetId: "scene-import-seed",
            assetId: "scene-import-seed",
            assetType: "scene",
            prompt: "A wasteland camp entrance at dusk",
            model: "nano_banana_2",
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();

      const importResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/import`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "scene",
            name: "钀ュ湴鍏ュ彛",
            description: "钖勯浘涓殑钀ュ湴鍏ュ彛鍦烘櫙",
            storageObjectId: imageTaskEnvelope.data.result.storageObjectId,
            mimeType: "image/avif",
            width: 1024,
            height: 1024,
          }),
        },
      );
      const importEnvelope = await importResponse.json();

      const listResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets?assetType=scene&page=1&pageSize=20`,
        { headers: { cookie } },
      );
      const listEnvelope = await listResponse.json();

      const detailResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/detail`,
        { headers: { cookie } },
      );
      const detailEnvelope = await detailResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200);
      assert.equal(
        imageTaskEnvelope.data.result.imageUrl,
        "https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/AIManhuaDrama/20260527/1ee6f1a1-8bb8-4424-9ce3-e1361075b234-d256255d69a702a1f2095159c5aa1b1.png",
      );
      assert.equal(importResponse.status, 200);
      assert.equal(importEnvelope.data.asset.name, "钀ュ湴鍏ュ彛");
      assert.equal(importEnvelope.data.asset.assetType, "scene");
      assert.ok(importEnvelope.data.asset.fixedImageUrl);
      assert.equal(listResponse.status, 200);
      assert.equal(listEnvelope.data.items.length, 1);
      assert.equal(listEnvelope.data.items[0].name, "钀ュ湴鍏ュ彛");
      assert.equal(detailResponse.status, 200);
      assert.equal(
        detailEnvelope.data.assetsByType.scene.some(
          (asset: { label?: string }) => asset.label === "钀ュ湴鍏ュ彛",
        ),
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("saves an episode asset into the project asset library with real persisted media", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-asset-library-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode asset library bridge",
          scriptInput: "Episode 1: Save an episode asset into the project asset library.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-asset-library-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Library Save" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createAssetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "scene",
            name: "搴熷湡琛楄",
            description: "闆ㄥ闇撹櫣搴熷琛楄",
          }),
        },
      );
      const createAssetEnvelope = await createAssetResponse.json();
      const assetId = createAssetEnvelope.data.asset.assetId;

      const saveWithoutImageResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/save-to-library`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const saveWithoutImageEnvelope = await saveWithoutImageResponse.json();

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-asset-library-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "asset",
            targetId: assetId,
            assetId,
            assetType: "scene",
            prompt: "A neon-lit wasteland street corner in the rain",
            model: "nano_banana_2",
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const fixedImageVersionId = imageTaskEnvelope.data.result.assetVersionId;
      const visibleGeneratedSceneUrl = "https://example.com/generated-visible-scene.png";

      const setFixedImageResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/set-fixed-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: fixedImageVersionId,
            storageObjectId: imageTaskEnvelope.data.result.storageObjectId,
            sourceUrl: visibleGeneratedSceneUrl,
            previewUrl: visibleGeneratedSceneUrl,
          }),
        },
      );
      const setFixedImageEnvelope = await setFixedImageResponse.json();

      const workbenchResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/workbench`,
        { headers: { cookie } },
      );
      const workbenchEnvelope = await workbenchResponse.json();

      const episodeAssetsResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets?assetType=scene`,
        { headers: { cookie } },
      );
      const episodeAssetsEnvelope = await episodeAssetsResponse.json();

      const saveResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/assets/${assetId}/save-to-library`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const saveEnvelope = await saveResponse.json();

      const detailResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/detail`,
        { headers: { cookie } },
      );
      const detailEnvelope = await detailResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(createAssetResponse.status, 200);
      assert.equal(saveWithoutImageResponse.status, 400);
      assert.equal(saveWithoutImageEnvelope.errorCode, "asset_preview_required");
      assert.equal(imageTaskResponse.status, 200);
      assert.equal(setFixedImageResponse.status, 200);
      assert.equal(workbenchResponse.status, 200);
      assert.equal(episodeAssetsResponse.status, 200);
      const savedFixedImagePath = String(setFixedImageEnvelope.data.asset.fixedImageUrl).split("?")[0];
      assert.equal(savedFixedImagePath, visibleGeneratedSceneUrl);
      const workbenchFixedAsset = workbenchEnvelope.data.assetsByType.scene.find(
        (asset: { assetId: string }) => asset.assetId === assetId,
      );
      const listedFixedAsset = episodeAssetsEnvelope.data.items.find(
        (asset: { assetId: string }) => asset.assetId === assetId,
      );
      assert.equal(workbenchFixedAsset?.fixedImageFileId, fixedImageVersionId);
      assert.equal(listedFixedAsset?.fixedImageFileId, fixedImageVersionId);
      assert.equal(String(workbenchFixedAsset?.fixedImageUrl).split("?")[0], savedFixedImagePath);
      assert.equal(String(listedFixedAsset?.fixedImageUrl).split("?")[0], savedFixedImagePath);
      assert.equal(saveResponse.status, 200);
      assert.equal(saveEnvelope.data.asset.label, "搴熷湡琛楄");
      assert.equal(saveEnvelope.data.asset.assetType, "scene_reference");
      assert.ok(saveEnvelope.data.asset.previewUrl);
      assert.equal(detailResponse.status, 200);
      assert.ok(
        detailEnvelope.data.assetsByType.scene.some(
          (asset: { id: string; label: string; latestVersion?: { metadata?: { description?: string } } }) =>
            asset.id === saveEnvelope.data.asset.id &&
            asset.label === "搴熷湡琛楄" &&
            asset.latestVersion?.metadata?.description === "闆ㄥ闇撹櫣搴熷琛楄",
        ),
      );
    } finally {
      await server.close();
    }
  });

  it("keeps a newly created blank episode workbench empty when the project library already has assets", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createProjectResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "blank-episode-assets-project",
          cookie,
        },
        body: JSON.stringify({
          name: "Blank episode assets",
          scriptInput: "Episode 1: keep a new blank episode asset workspace empty.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const createdProject = await createProjectResponse.json();

      const createFirstEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "blank-episode-assets-first-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode One" }),
        },
      );
      const firstEpisodeId = (await createFirstEpisodeResponse.json()).data.episode.id;

      const createSceneResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/assets`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetType: "scene",
            name: "Library Seed Scene",
            description: "Source scene for the project library",
          }),
        },
      );
      const sceneAssetId = (await createSceneResponse.json()).data.asset.assetId;

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "blank-episode-assets-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "asset",
            targetId: sceneAssetId,
            assetId: sceneAssetId,
            assetType: "scene",
            prompt: "A project library seed scene",
            model: "nano_banana_2",
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();

      const setFixedImageResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/assets/${sceneAssetId}/set-fixed-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: imageTaskEnvelope.data.result.assetVersionId,
            storageObjectId: imageTaskEnvelope.data.result.storageObjectId,
          }),
        },
      );
      await setFixedImageResponse.json();

      const saveToLibraryResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/assets/${sceneAssetId}/save-to-library`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({}),
        },
      );
      const saveToLibraryEnvelope = await saveToLibraryResponse.json();

      const createSecondEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${createdProject.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "blank-episode-assets-second-episode",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Two" }),
        },
      );
      const secondEpisodeId = (await createSecondEpisodeResponse.json()).data.episode.id;

      const [firstEpisodeSceneAssetsResponse, secondEpisodeRoleAssetsResponse, secondEpisodeSceneAssetsResponse, secondEpisodePropAssetsResponse, detailResponse] = await Promise.all([
        fetch(`${server.origin}/api/episodes/${firstEpisodeId}/assets?assetType=scene&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/episodes/${secondEpisodeId}/assets?assetType=role&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/episodes/${secondEpisodeId}/assets?assetType=scene&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/episodes/${secondEpisodeId}/assets?assetType=prop&page=1&pageSize=20`, {
          headers: { cookie },
        }),
        fetch(`${server.origin}/api/projects/${createdProject.project.id}/detail`, {
          headers: { cookie },
        }),
      ]);

      const firstEpisodeSceneAssetsEnvelope = await firstEpisodeSceneAssetsResponse.json();
      const secondEpisodeRoleAssetsEnvelope = await secondEpisodeRoleAssetsResponse.json();
      const secondEpisodeSceneAssetsEnvelope = await secondEpisodeSceneAssetsResponse.json();
      const secondEpisodePropAssetsEnvelope = await secondEpisodePropAssetsResponse.json();
      const detailEnvelope = await detailResponse.json();

      assert.equal(createProjectResponse.status, 200);
      assert.equal(createFirstEpisodeResponse.status, 200);
      assert.equal(createSceneResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200);
      assert.equal(setFixedImageResponse.status, 200);
      assert.equal(saveToLibraryResponse.status, 200);
      assert.equal(createSecondEpisodeResponse.status, 200);
      assert.equal(firstEpisodeSceneAssetsResponse.status, 200);
      assert.equal(secondEpisodeRoleAssetsResponse.status, 200);
      assert.equal(secondEpisodeSceneAssetsResponse.status, 200);
      assert.equal(secondEpisodePropAssetsResponse.status, 200);
      assert.equal(detailResponse.status, 200);
      assert.equal(firstEpisodeSceneAssetsEnvelope.data.items.length, 1);
      assert.equal(firstEpisodeSceneAssetsEnvelope.data.items[0].assetId, sceneAssetId);
      assert.deepEqual(secondEpisodeRoleAssetsEnvelope.data.items, []);
      assert.deepEqual(secondEpisodeSceneAssetsEnvelope.data.items, []);
      assert.deepEqual(secondEpisodePropAssetsEnvelope.data.items, []);
      assert.ok(
        detailEnvelope.data.assetsByType.scene.some(
          (asset: { id: string }) => asset.id === saveToLibraryEnvelope.data.asset.id,
        ),
      );
    } finally {
      await server.close();
    }
  });

  it("persists episode generation tasks with fixed mock media results", async () => {
    const db = await createDevDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-generation-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode generation persistence",
          scriptInput: "Episode 1: A fixed mock result is returned through task APIs.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Task" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const createShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          episodeId,
          title: "Episode Task Shot",
          description: "Shot used by episode generation task APIs.",
        }),
      });
      const createdShot = await createShotResponse.json();
      const storyboardId = createdShot.shot.id;

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-image-task-key",
            cookie,
          },
          body: JSON.stringify({
            targetType: "storyboard",
            targetId: storyboardId,
            prompt: "fixed wasteland image",
            model: "nano_banana_2",
            parameters: { aspectRatio: "16:9" },
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const imageTask = imageTaskEnvelope.data;

      const imageTaskLookupResponse = await fetch(
        `${server.origin}/api/generation-tasks/${imageTask.taskId}`,
        { headers: { cookie } },
      );
      const imageTaskLookupEnvelope = await imageTaskLookupResponse.json();

      const listTasksResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation-tasks?page=1&pageSize=10`,
        { headers: { cookie } },
      );
      const listTasksEnvelope = await listTasksResponse.json();

      const imageReplayResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-image-task-key",
            cookie,
          },
          body: JSON.stringify({
            targetType: "storyboard",
            targetId: storyboardId,
            prompt: "fixed wasteland image",
            model: "nano_banana_2",
            parameters: { aspectRatio: "16:9" },
          }),
        },
      );
      const imageReplayEnvelope = await imageReplayResponse.json();

      const videoTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-video-task-key",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            motionPrompt: "fixed episode video",
            model: "video_mock_1",
            parameters: { durationSec: 5 },
          }),
        },
      );
      const videoTaskEnvelope = await videoTaskResponse.json();
      const videoTask = videoTaskEnvelope.data;

      const lipSyncTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-lip-sync-task-key",
            cookie,
          },
          body: JSON.stringify({
            targetType: "storyboard",
            targetId: storyboardId,
            motionPrompt: "lip sync mock video",
            model: "video_mock_1",
            parameters: {
              mode: "lip-sync",
              durationSec: 5,
              lipSyncConfig: {
                text: "对口型文本示例",
                textLength: 7,
                voiceId: "system-1",
                voiceName: "女/稚嫩",
                voiceSource: "system",
                estimatedCreditCost: 2,
              },
            },
            audioEnabled: true,
            lipSyncEnabled: true,
          }),
        },
      );
      const lipSyncTaskEnvelope = await lipSyncTaskResponse.json();
      const lipSyncTask = lipSyncTaskEnvelope.data;
      const lipSyncTaskLookupResponse = await fetch(
        `${server.origin}/api/generation-tasks/${lipSyncTask.taskId}`,
        { headers: { cookie } },
      );
      const lipSyncTaskLookupEnvelope = await lipSyncTaskLookupResponse.json();

      const persistedLipSyncTask = await db.query<{
        input_snapshot_json: Record<string, unknown> | string;
      }>(
        `
          SELECT input_snapshot_json
          FROM tasks
          WHERE id = $1
        `,
        [lipSyncTask.taskId],
      );
      const lipSyncSnapshot =
        typeof persistedLipSyncTask.rows[0]?.input_snapshot_json === "string"
          ? JSON.parse(persistedLipSyncTask.rows[0]?.input_snapshot_json as string)
          : persistedLipSyncTask.rows[0]?.input_snapshot_json ?? {};

      const setImageResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/storyboards/${storyboardId}/set-current-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-set-image-key",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: imageTask.result.assetVersionId,
            storageObjectId: imageTask.result.storageObjectId,
          }),
        },
      );
      const setImageEnvelope = await setImageResponse.json();

      const setVideoResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/storyboards/${storyboardId}/set-current-video`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-set-video-key",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: videoTask.result.assetVersionId,
            storageObjectId: videoTask.result.storageObjectId,
          }),
        },
      );
      const setVideoEnvelope = await setVideoResponse.json();

      const storyboardsAfterSetResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/storyboards?page=1&pageSize=10`,
        { headers: { cookie } },
      );
      const storyboardsAfterSetEnvelope = await storyboardsAfterSetResponse.json();

      const exportOriginalResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/export-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-export-original-key",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: videoTask.result.assetVersionId,
            storageObjectId: videoTask.result.storageObjectId,
          }),
        },
      );
      const exportOriginalEnvelope = await exportOriginalResponse.json();

      assert.equal(createShotResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200);
      assert.equal(imageTask.kind, "image");
      assert.equal(imageTask.status, "succeeded");
      assert.equal(imageTask.episodeId, episodeId);
      assert.equal(imageTask.result.mediaKind, "image");
      assert.match(imageTask.result.imageUrl, /\/uploads\/storage\//);
      assert.doesNotMatch(imageTask.result.imageUrl, /C:\\Users\\/);
      assert.match(imageTask.result.storageObjectId, /.+/);
      assert.equal(imageTaskLookupResponse.status, 200);
      assert.equal(imageTaskLookupEnvelope.data.taskId, imageTask.taskId);
      assert.equal(listTasksResponse.status, 200);
      assert.equal(
        listTasksEnvelope.data.items.some((task: { taskId: string }) => task.taskId === imageTask.taskId),
        true,
      );
      assert.equal(imageReplayResponse.status, 200);
      assert.equal(imageReplayEnvelope.data.taskId, imageTask.taskId);
      assert.equal(videoTaskResponse.status, 200);
      assert.equal(videoTask.kind, "video");
      assert.equal(videoTask.status, "succeeded");
      assert.equal(videoTask.result.mediaKind, "video");
      assert.match(videoTask.result.videoUrl, /\/uploads\/storage\//);
      assert.doesNotMatch(videoTask.result.videoUrl, /C:\\Users\\/);
      assert.ok(videoTask.creditBalance < 10000);
      assert.equal(lipSyncTaskResponse.status, 200);
      assert.equal(lipSyncTask.kind, "video");
      assert.equal(lipSyncTask.status, "succeeded");
      assert.equal(lipSyncTaskLookupResponse.status, 200);
      assert.equal(lipSyncTaskLookupEnvelope.data.generatedAudioItems.length, 1);
      assert.equal(lipSyncTaskLookupEnvelope.data.generatedAudioItems[0].voiceName, "女/稚嫩");
      assert.match(lipSyncTaskLookupEnvelope.data.generatedAudioItems[0].audioUrl, /^data:audio\/wav;base64,/);
      assert.equal(lipSyncSnapshot.parameters?.mode, "lip-sync");
      assert.equal(lipSyncSnapshot.parameters?.lipSyncConfig?.voiceName, "女/稚嫩");
      assert.equal(lipSyncSnapshot.parameters?.lipSyncConfig?.estimatedCreditCost, 2);
      assert.equal(lipSyncSnapshot.audioEnabled, true);
      assert.equal(lipSyncSnapshot.lipSyncEnabled, true);
      assert.equal(setImageResponse.status, 200);
      assert.equal(setImageEnvelope.data.storyboard.currentImageFileId, imageTask.result.assetVersionId);
      assert.equal(setImageEnvelope.data.file.storageObjectId, imageTask.result.storageObjectId);
      assert.equal(setVideoResponse.status, 200);
      assert.equal(setVideoEnvelope.data.storyboard.currentVideoFileId, videoTask.result.assetVersionId);
      assert.equal(setVideoEnvelope.data.file.storageObjectId, videoTask.result.storageObjectId);
      assert.equal(storyboardsAfterSetResponse.status, 200);
      const updatedStoryboard = storyboardsAfterSetEnvelope.data.items.find(
        (storyboard: { storyboardId: string }) => storyboard.storyboardId === storyboardId,
      );
      assert.equal(updatedStoryboard.currentImageFileId, imageTask.result.assetVersionId);
      assert.equal(updatedStoryboard.currentVideoFileId, videoTask.result.assetVersionId);
      assert.equal(exportOriginalResponse.status, 200);
      assert.equal(exportOriginalEnvelope.data.exportTask.status, "succeeded");
      assert.equal(exportOriginalEnvelope.data.exportTask.storageObjectId, videoTask.result.storageObjectId);
      assert.match(exportOriginalEnvelope.data.exportTask.downloadUrl, /\/uploads\/storage\//);
    } finally {
      await server.close();
    }
  });

  it("rejects media from another episode when setting storyboard media, deleting files, or exporting original video", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-cross-media-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode media isolation",
          scriptInput: "Episode 1: Media cannot cross episode boundaries.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      async function createEpisode(title: string) {
        const response = await fetch(`${server.origin}/api/projects/${created.project.id}/episodes`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title }),
        });
        const envelope = await response.json();
        assert.equal(response.status, 200);
        return envelope.data.episode.id as string;
      }

      async function createShot(episodeId: string, title: string) {
        const response = await fetch(`${server.origin}/api/creator/shots`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            projectId: created.project.id,
            episodeId,
            title,
            description: `${title} description.`,
          }),
        });
        const payload = await response.json();
        assert.equal(response.status, 200);
        return payload.shot.id as string;
      }

      const firstEpisodeId = await createEpisode("Episode One");
      const secondEpisodeId = await createEpisode("Episode Two");
      const secondStoryboardId = await createShot(secondEpisodeId, "Episode Two Shot");

      const firstVideoResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/generation/video-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-cross-media-video",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: firstEpisodeId,
            motionPrompt: "video belongs to episode one",
            model: "video_mock_1",
          }),
        },
      );
      const firstVideo = (await firstVideoResponse.json()).data;
      const firstImageResponse = await fetch(
        `${server.origin}/api/episodes/${firstEpisodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-cross-media-image",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: firstEpisodeId,
            prompt: "image belongs to episode one",
            model: "nano_banana_2",
          }),
        },
      );
      const firstImage = (await firstImageResponse.json()).data;

      const crossSetImageResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/storyboards/${secondStoryboardId}/set-current-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: firstImage.result.assetVersionId,
            storageObjectId: firstImage.result.storageObjectId,
          }),
        },
      );
      const crossSetImage = await crossSetImageResponse.json();

      const crossSetResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/storyboards/${secondStoryboardId}/set-current-video`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: firstVideo.result.assetVersionId,
            storageObjectId: firstVideo.result.storageObjectId,
          }),
        },
      );
      const crossSet = await crossSetResponse.json();

      const crossDeleteResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/file-resources/${firstImage.result.storageObjectId}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: firstImage.result.assetVersionId,
            storageObjectId: firstImage.result.storageObjectId,
          }),
        },
      );
      const crossDelete = await crossDeleteResponse.json();

      const crossExportResponse = await fetch(
        `${server.origin}/api/episodes/${secondEpisodeId}/export-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            assetVersionId: firstVideo.result.assetVersionId,
            storageObjectId: firstVideo.result.storageObjectId,
          }),
        },
      );
      const crossExport = await crossExportResponse.json();

      assert.equal(firstVideoResponse.status, 200);
      assert.equal(firstImageResponse.status, 200);
      assert.equal(firstVideo.episodeId, firstEpisodeId);
      assert.equal(firstImage.episodeId, firstEpisodeId);
      assert.equal(crossSetImageResponse.status, 404);
      assert.equal(crossSetImage.errorCode, "resource_not_found");
      assert.equal(crossSetResponse.status, 404);
      assert.equal(crossSet.errorCode, "resource_not_found");
      assert.equal(crossDeleteResponse.status, 404);
      assert.equal(crossDelete.errorCode, "resource_not_found");
      assert.equal(crossExportResponse.status, 404);
      assert.equal(crossExport.errorCode, "resource_not_found");
    } finally {
      await server.close();
    }
  });

  it("marks stale episode generation tasks as task_timeout and releases reserved credits", async () => {
    const db = await createDevDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-timeout-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode generation timeout",
          scriptInput: "Episode 1: timeout stale generation.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Timeout" }),
        },
      );
      const createdEpisodeEnvelope = await createEpisodeResponse.json();
      const episodeId = createdEpisodeEnvelope.data.episode.id;

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-timeout-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "stale image task",
            model: "nano_banana_2",
          }),
        },
      );
      const imageTaskEnvelope = await imageTaskResponse.json();
      const taskId = imageTaskEnvelope.data.taskId;

      const past = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      await db.query(
        `
          UPDATE credit_reservations
          SET amount_reserved = amount_total,
              amount_consumed = 0,
              amount_released = 0,
              status = 'active',
              updated_at = $2
          WHERE task_id = $1
        `,
        [taskId, past],
      );
      await db.query(
        `
          UPDATE tasks
          SET status = 'running',
              failure_code = NULL,
              input_snapshot_json = jsonb_set(
                jsonb_set(input_snapshot_json, '{requestedAt}', to_jsonb($2::text), true),
                '{timeoutAt}',
                to_jsonb($2::text),
                true
              ),
              updated_at = $2::timestamptz
          WHERE id = $1
        `,
        [taskId, past],
      );

      const timeoutLookupResponse = await fetch(
        `${server.origin}/api/generation-tasks/${taskId}`,
        { headers: { cookie } },
      );
      const timeoutLookupEnvelope = await timeoutLookupResponse.json();

      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        amount_released: number | string;
        status: string;
      }>(
        `
          SELECT amount_reserved, amount_consumed, amount_released, status
          FROM credit_reservations
          WHERE task_id = $1
        `,
        [taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.equal(timeoutLookupResponse.status, 200);
      assert.equal(timeoutLookupEnvelope.data.status, "failed");
      assert.equal(timeoutLookupEnvelope.data.failureCode, "task_timeout");
      assert.equal(timeoutLookupEnvelope.data.credit.released, 90);
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 90);
      assert.equal(reservation.rows[0]?.status, "released");
    } finally {
      await server.close();
    }
  });

  it("repairs stale episode generation tasks from the storage repair endpoint", async () => {
    const db = await createDevDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-timeout-repair-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode generation timeout repair",
          scriptInput: "Episode 1: repair stale generation.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Timeout Repair" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-timeout-repair-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "repair stale image task",
            model: "nano_banana_2",
          }),
        },
      );
      const taskId = (await imageTaskResponse.json()).data.taskId;

      const past = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      await db.query(
        `
          UPDATE credit_reservations
          SET amount_reserved = amount_total,
              amount_consumed = 0,
              amount_released = 0,
              status = 'active',
              updated_at = $2::timestamptz
          WHERE task_id = $1
        `,
        [taskId, past],
      );
      await db.query(
        `
          UPDATE tasks
          SET status = 'queued',
              failure_code = NULL,
              input_snapshot_json = jsonb_set(
                jsonb_set(input_snapshot_json, '{requestedAt}', to_jsonb($2::text), true),
                '{timeoutAt}',
                to_jsonb($2::text),
                true
              ),
              updated_at = $2::timestamptz
          WHERE id = $1
        `,
        [taskId, past],
      );

      const repairResponse = await fetch(`${server.origin}/api/storage/repair`, {
        method: "POST",
        headers: { cookie },
      });
      const repair = await repairResponse.json();
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE task_id = $1",
        [taskId],
      );

      assert.equal(repairResponse.status, 200);
      assert.deepEqual(repair.episodeGeneration.timedOutTaskIds, [taskId]);
      assert.equal(task.rows[0]?.status, "failed");
      assert.equal(task.rows[0]?.failure_code, "task_timeout");
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 90);
      assert.equal(reservation.rows[0]?.status, "released");
    } finally {
      await server.close();
    }
  });

  it("repairs stale episode generation tasks from the background scheduler", async () => {
    const db = await createDevDb();
    const server = createPhoneAuthDevServer({
      db,
      repairScheduler: {
        enabled: true,
        intervalMs: 250,
        limit: 10,
      },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "episode-scheduler-repair-create",
          cookie,
        },
        body: JSON.stringify({
          name: "Episode scheduler timeout repair",
          scriptInput: "Episode 1: scheduler repairs stale generation.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({ title: "Episode Scheduler Repair" }),
        },
      );
      const episodeId = (await createEpisodeResponse.json()).data.episode.id;

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "episode-scheduler-repair-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "scheduler stale image task",
            model: "nano_banana_2",
          }),
        },
      );
      const taskId = (await imageTaskResponse.json()).data.taskId;

      const past = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      await db.query(
        `
          UPDATE credit_reservations
          SET amount_reserved = amount_total,
              amount_consumed = 0,
              amount_released = 0,
              status = 'active',
              updated_at = $2::timestamptz
          WHERE task_id = $1
        `,
        [taskId, past],
      );
      await db.query(
        `
          UPDATE tasks
          SET status = 'queued',
              failure_code = NULL,
              input_snapshot_json = jsonb_set(
                jsonb_set(input_snapshot_json, '{requestedAt}', to_jsonb($2::text), true),
                '{timeoutAt}',
                to_jsonb($2::text),
                true
              ),
              updated_at = $2::timestamptz
          WHERE id = $1
        `,
        [taskId, past],
      );

      const repaired = await waitFor(async () => {
        const row = await db.query<{
          task_status: string;
          failure_code: string | null;
          amount_reserved: number | string;
          amount_released: number | string;
          reservation_status: string;
        }>(
          `
            SELECT
              t.status AS task_status,
              t.failure_code,
              r.amount_reserved,
              r.amount_released,
              r.status AS reservation_status
            FROM tasks t
            JOIN credit_reservations r ON r.task_id = t.id
            WHERE t.id = $1
          `,
          [taskId],
        );
        const current = row.rows[0];
        if (
          current?.task_status === "failed" &&
          current.failure_code === "task_timeout" &&
          Number(current.amount_reserved) === 0 &&
          Number(current.amount_released) === 90 &&
          current.reservation_status === "released"
        ) {
          return current;
        }
        return null;
      }, 5_000);

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(imageTaskResponse.status, 200);
      assert.equal(repaired.task_status, "failed");
      assert.equal(repaired.failure_code, "task_timeout");
      assert.equal(Number(repaired.amount_reserved), 0);
      assert.equal(Number(repaired.amount_released), 90);
      assert.equal(repaired.reservation_status, "released");
    } finally {
      await server.close();
    }
  });

  it("rejects non-whitelisted CORS origins with an enveloped 403", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/api/auth/session`, {
        headers: {
          origin: "https://evil.example",
        },
      });
      const payload = await response.json();

      assert.equal(response.status, 403);
      assert.equal(payload.errorCode, "origin_forbidden");
      assert.match(payload.requestId, /.+/);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    } finally {
      await server.close();
    }
  });

  it("rejects viewer episode write operations with an enveloped 403", async () => {
    const db = await createDevDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "viewer-episode-permission-project",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "Viewer episode permission",
          scriptInput: "Episode 1: A viewer may inspect but cannot mutate episode workbench data.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "viewer-episode-permission-episode",
            cookie: ownerCookie,
          },
          body: JSON.stringify({ title: "Viewer Locked Episode" }),
        },
      );
      const createdEpisode = await createEpisodeResponse.json();
      const episodeId = createdEpisode.data.episode.id;

      const viewerCookie = await login(server.origin, "13800138002");
      const viewerSession = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie: viewerCookie },
      });
      const viewer = await viewerSession.json();
      await db.query(
        `
          UPDATE memberships
          SET role = 'viewer'
          WHERE organization_id = $1
            AND workspace_id = $2
            AND user_id = $3
        `,
        [
          "10000000-0000-4000-8000-000000000001",
          "20000000-0000-4000-8000-000000000001",
          viewer.user.id,
        ],
      );

      const readResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/workbench`,
        { headers: { cookie: viewerCookie } },
      );
      const writeResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "viewer-episode-permission-image",
            cookie: viewerCookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "viewer should be rejected",
            model: "nano_banana_2",
          }),
        },
      );
      const write = await writeResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(viewerSession.status, 200);
      assert.equal(readResponse.status, 200);
      assert.equal(writeResponse.status, 403);
      assert.equal(write.errorCode, "permission_denied");
      assert.equal(write.details.reason, "capability_missing");
      assert.match(write.requestId, /.+/);
    } finally {
      await server.close();
    }
  });

  it("hides episode routes from users outside the owning organization", async () => {
    const db = await createDevDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const ownerCookie = await login(server.origin, "13800138000");

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "cross-org-episode-project",
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: "Cross org episode isolation",
          scriptInput: "Episode 1: Another tenant must not see this episode.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();
      const createEpisodeResponse = await fetch(
        `${server.origin}/api/projects/${created.project.id}/episodes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "cross-org-episode-create",
            cookie: ownerCookie,
          },
          body: JSON.stringify({ title: "Tenant A Episode" }),
        },
      );
      const createdEpisode = await createEpisodeResponse.json();
      const episodeId = createdEpisode.data.episode.id;

      const outsiderCookie = await login(server.origin, "13800138003");
      const outsiderSession = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie: outsiderCookie },
      });
      const outsider = await outsiderSession.json();
      await db.query(
        "DELETE FROM memberships WHERE organization_id = $1 AND user_id = $2",
        ["10000000-0000-4000-8000-000000000001", outsider.user.id],
      );
      await db.query(
        `
          INSERT INTO organizations (id, name, status, credit_balance_cached)
          VALUES ($1, 'Other Org', 'active', 10000)
        `,
        ["10000000-0000-4000-8000-000000000099"],
      );
      await db.query(
        `
          INSERT INTO workspaces (id, organization_id, name, status)
          VALUES ($1, $2, 'Other Workspace', 'active')
        `,
        [
          "20000000-0000-4000-8000-000000000099",
          "10000000-0000-4000-8000-000000000099",
        ],
      );
      await db.query(
        `
          INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
          VALUES ($1, $2, $3, $4, 'creator', 'active')
        `,
        [
          "30000000-0000-4000-8000-000000000099",
          "10000000-0000-4000-8000-000000000099",
          "20000000-0000-4000-8000-000000000099",
          outsider.user.id,
        ],
      );

      const readResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/workbench`,
        { headers: { cookie: outsiderCookie } },
      );
      const read = await readResponse.json();
      const writeResponse = await fetch(
        `${server.origin}/api/episodes/${episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "cross-org-episode-write",
            cookie: outsiderCookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: episodeId,
            prompt: "outsider should not see this",
            model: "nano_banana_2",
          }),
        },
      );
      const write = await writeResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createEpisodeResponse.status, 200);
      assert.equal(outsiderSession.status, 200);
      assert.equal(readResponse.status, 404);
      assert.equal(read.errorCode, "resource_not_found");
      assert.equal(read.details.reason, "membership_missing");
      assert.equal(writeResponse.status, 404);
      assert.equal(write.errorCode, "resource_not_found");
      assert.equal(write.details.reason, "membership_missing");
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

  it("gates team member creation behind the paid team entitlement", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138001");

      const overviewResponse = await fetch(`${server.origin}/api/creator/team/overview`, {
        headers: { cookie },
      });
      const overview = await overviewResponse.json();

      const createResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          teamAccount: "api_director_001",
          displayName: "API Director",
          businessRole: "director",
          projectIds: [],
          initialCredits: 0,
        }),
      });
      const created = await createResponse.json();

      assert.equal(overviewResponse.status, 200);
      assert.equal(overview.entitlements.teamMemberManagement, false);
      assert.equal(createResponse.status, 402);
      assert.deepEqual(created, { error: "team_member_management_required" });
    } finally {
      await server.close();
    }
  });

  it("creates a team subaccount through the API when paid team entitlement is active", async () => {
    const server = createPhoneAuthDevServer({ seedTeamEntitlements: true });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138001");

      const createResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          teamAccount: "api_director_001",
          displayName: "API Director",
          businessRole: "director",
          projectIds: [],
          initialCredits: 0,
        }),
      });
      const created = await createResponse.json();

      const overviewResponse = await fetch(`${server.origin}/api/creator/team/overview`, {
        headers: { cookie },
      });
      const overview = await overviewResponse.json();
      const membersResponse = await fetch(`${server.origin}/api/creator/team/members`, {
        headers: { cookie },
      });
      const members = await membersResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(created.member.teamAccount, "api_director_001");
      assert.match(created.temporaryPassword, /^[A-Za-z0-9_-]{18,}$/);
      assert.equal("passwordHash" in created, false);
      assert.equal("password_hash" in created, false);
      assert.equal(overviewResponse.status, 200);
      assert.equal(overview.entitlements.teamMemberManagement, true);
      assert.equal(overview.seats.used, 1);
      assert.equal(membersResponse.status, 200);
      assert.equal(members.members.length, 1);
      assert.equal(members.members[0].teamAccount, "api_director_001");
      assert.equal("passwordHash" in members.members[0], false);
      assert.equal("temporaryPassword" in members.members[0], false);
    } finally {
      await server.close();
    }
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

async function prepareDirectUpload(
  origin: string,
  cookie: string,
  projectId: string,
  input: {
    purpose: string;
    fileName: string;
    contentType: string;
    body: Buffer;
  },
) {
  const prepareResponse = await fetch(`${origin}/api/storage/upload-sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `phone-auth-dev-server-${input.purpose}-${input.fileName}`,
      cookie,
    },
    body: JSON.stringify({
      projectId,
      purpose: input.purpose,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
    }),
  });
  const prepared = await prepareResponse.json();

  const blobResponse = await fetch(
    `${origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/blob`,
    {
      method: "PUT",
      headers: {
        "content-type": input.contentType,
        cookie,
      },
      body: input.body,
    },
  );
  const completeResponse = await fetch(
    `${origin}/api/storage/upload-sessions/${prepared.uploadSessionId}/complete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({}),
    },
  );

  assert.equal(prepareResponse.status, 200);
  assert.equal(blobResponse.status, 200);
  assert.equal(completeResponse.status, 200);

  return prepared as {
    uploadSessionId: string;
    storageObjectId: string;
  };
}

async function waitFor<T>(
  probe: () => Promise<T | null | undefined>,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | null | undefined;
  while (Date.now() < deadline) {
    lastValue = await probe();
    if (lastValue) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`wait_for_timeout:${JSON.stringify(lastValue ?? null)}`);
}
