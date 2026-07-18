import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { normalizeCnPhone } from "../../modules/identity/phone-auth.utils.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("director desk HTTP API", () => {
  it("uses authenticated backend state for director desk CRUD and scenes", async () => {
    const db = await createMigratedTestDb();
    const phone = "18571521874";
    const normalizedPhone = normalizeCnPhone(phone);
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
      [
        randomUUID(),
        normalizedPhone,
        await createUserPasswordHash(defaultPasswordFromPhone(normalizedPhone)),
      ],
    );
    const server = createPhoneAuthDevServer({
      db,
      env: { NODE_ENV: "test", PAYMENT_MERCHANT_ID: "director-desk-test" },
    });
    try {
      await server.listen(0);
      const anonymous = await fetch(`${server.origin}/api/director-desks`);
      assert.equal(anonymous.status, 401);

      const login = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: phone,
          password: defaultPasswordFromPhone(normalizedPhone),
        }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie") ?? "";

      const created = await api(server.origin, "/api/director-desks", cookie, {
        method: "POST",
        body: JSON.stringify({}),
      });
      assert.equal(created.response.status, 200);
      assert.equal(created.body.data.desk.id, "desk_1");

      const ensured = await api(server.origin, "/api/director-desks", cookie, {
        method: "POST",
        body: JSON.stringify({ deskKey: "host-instance", name: "现场导演台" }),
      });
      assert.equal(ensured.body.data.desk.id, "host-instance");

      const scene = { version: 1, objects: [{ id: "camera-1" }] };
      const savedScene = await api(server.origin, "/api/director-desks/desk_1/scene", cookie, {
        method: "PUT",
        body: JSON.stringify({ scene }),
      });
      assert.deepEqual(savedScene.body.data.scene, scene);
      const skippedLegacyScene = await api(server.origin, "/api/director-desks/desk_1/scene", cookie, {
        method: "PUT",
        body: JSON.stringify({ scene: { legacy: true }, onlyIfEmpty: true }),
      });
      assert.equal(skippedLegacyScene.body.data.written, false);
      const migratedLegacyScene = await api(server.origin, "/api/director-desks/host-instance/scene", cookie, {
        method: "PUT",
        body: JSON.stringify({ scene: { legacy: true }, onlyIfEmpty: true }),
      });
      assert.equal(migratedLegacyScene.body.data.written, true);
      const loadedScene = await api(server.origin, "/api/director-desks/desk_1/scene", cookie);
      assert.deepEqual(loadedScene.body.data.scene, scene);

      const renamed = await api(server.origin, "/api/director-desks/desk_1", cookie, {
        method: "PATCH",
        body: JSON.stringify({ name: "主导演台" }),
      });
      assert.equal(renamed.body.data.desk.name, "主导演台");
      const opened = await api(server.origin, "/api/director-desks/desk_1/open", cookie, {
        method: "POST",
        body: JSON.stringify({}),
      });
      assert.ok(opened.body.data.desk.lastOpenedAt);

      const listed = await api(server.origin, "/api/director-desks", cookie);
      assert.deepEqual(listed.body.data.desks.map((desk: { id: string }) => desk.id), [
        "desk_1",
        "host-instance",
      ]);

      const deleted = await api(server.origin, "/api/director-desks/desk_1", cookie, {
        method: "DELETE",
      });
      assert.equal(deleted.body.data.deletedDeskKey, "desk_1");
      const missingScene = await api(server.origin, "/api/director-desks/desk_1/scene", cookie);
      assert.equal(missingScene.response.status, 404);
    } finally {
      await server.close();
    }
  });
});

async function api(
  origin: string,
  path: string,
  cookie: string,
  init: RequestInit = {},
) {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  return { response, body: await response.json() };
}
