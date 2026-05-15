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

  it("exposes a creator workflow API that can create, parse, and export a mock project", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      });
      const parsed = await parseResponse.json();

      const confirmResponse = await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
      });
      const confirmed = await confirmResponse.json();

      const calibrationResponse = await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
      });
      const calibration = await calibrationResponse.json();

      const imageResponse = await fetch(`${server.origin}/api/creator/images/generate`, {
        method: "POST",
      });
      const imageBatch = await imageResponse.json();

      const exportResponse = await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
      });
      const exportPreview = await exportResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(parseResponse.status, 200);
      assert.equal(confirmResponse.status, 200);
      assert.equal(calibrationResponse.status, 200);
      assert.equal(imageResponse.status, 200);
      assert.equal(exportResponse.status, 200);
      assert.equal(created.project.phase, "script_input");
      assert.ok(parsed.assetReview);
      assert.equal(confirmed.assetReview.readyForGeneration, true);
      assert.equal(calibration.calibration.status, "passed");
      assert.ok(imageBatch.successes.length > 0);
      assert.equal(exportPreview.export.status, "ready");
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
    assert.match(packageJson, /run-phone-auth-dev-server\.mjs/);
    assert.match(launcherScript, /phone-auth-dev-server\.ts/);
    assert.match(launcherScript, /tsx/);
  });

  it("uses a loader-based launcher that starts the dev server explicitly", async () => {
    const launcherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-dev-server.mjs", import.meta.url),
      "utf8",
    );

    assert.match(launcherScript, /createPhoneAuthDevServer/);
    assert.match(launcherScript, /server\.listen\(port\)/);
    assert.match(launcherScript, /process\.env\.PORT/);
    assert.match(launcherScript, /--loader/);
  });
});
