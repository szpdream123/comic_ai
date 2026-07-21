import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import { createUserPasswordHash, defaultPasswordFromPhone } from "../../modules/identity/team-account-credentials.service.ts";
import { createToolPreset } from "../../modules/project/tool-preset.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

const topology = {
  schemaVersion: 1,
  nodes: [
    { kind: "workflow", type: "script-node", offsetX: 0, offsetY: 20, data: { title: "脚本", text: "开场" } },
    { kind: "image", offsetX: 420, offsetY: 0, data: { title: "图片" } },
  ],
  connections: [[0, 1]],
};

it("exposes versioned team-shared tool presets while isolating main accounts", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
    repairScheduler: { enabled: false },
  });
  const mainUserId = randomUUID();
  const otherUserId = randomUUID();
  const memberId = randomUUID();
  const mainPhone = "13900000891";
  const otherPhone = "13900000892";
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active'), ($4, $5, $6, 'active')",
      [
        mainUserId,
        mainPhone,
        await createUserPasswordHash(defaultPasswordFromPhone(mainPhone)),
        otherUserId,
        otherPhone,
        await createUserPasswordHash(defaultPasswordFromPhone(otherPhone)),
      ],
    );
    await db.query(
      `
        INSERT INTO team_members
          (id, user_id, member_account, member_account_suffix, member_login_account, member_name, member_password_hash, status)
        VALUES ($1, $2, 'toolmember', 'u900891', 'toolmember@u900891', 'Tool 成员', $3, 'active')
      `,
      [memberId, mainUserId, await createUserPasswordHash(defaultPasswordFromPhone(mainPhone))],
    );
    await server.listen(0);

    const mainLogin = await passwordLogin(server.origin, mainPhone);
    const memberLogin = await passwordLogin(server.origin, mainPhone);
    const otherLogin = await passwordLogin(server.origin, otherPhone);
    await db.query(
      `
        INSERT INTO team_member_auth_sessions
          (id, auth_session_id, user_id, member_id, status, expires_at, last_seen_at, created_at)
        VALUES ($1, $2, $3, $4, 'active', $5, now(), now())
      `,
      [randomUUID(), memberLogin.sessionId, mainUserId, memberId, memberLogin.expiresAt],
    );

    assert.equal((await api(server.origin, "/api/creator/tool-presets", "")).status, 401);
    assert.equal((await api(server.origin, "/api/creator/tool-presets", memberLogin.cookie, {
      method: "POST",
      body: { name: "缺少幂等键", topology },
      idempotencyKey: null,
    })).status, 400);
    const createBody = { name: "团队脚本生图", description: "成员创建", category: "image", topology };
    const created = await api(server.origin, "/api/creator/tool-presets", memberLogin.cookie, {
      method: "POST",
      body: createBody,
      idempotencyKey: "tool-preset-create-replay",
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.preset.currentVersionNumber, 1);
    assert.equal(created.body.data.preset.createdByMemberId, memberId);
    const presetId = String(created.body.data.preset.id);

    const replayedCreate = await api(server.origin, "/api/creator/tool-presets", memberLogin.cookie, {
      method: "POST",
      body: createBody,
      idempotencyKey: "tool-preset-create-replay",
    });
    assert.equal(replayedCreate.status, 201);
    assert.equal(replayedCreate.body.data.preset.id, presetId);
    const conflictingCreate = await api(server.origin, "/api/creator/tool-presets", memberLogin.cookie, {
      method: "POST",
      body: { ...createBody, name: "同键不同请求" },
      idempotencyKey: "tool-preset-create-replay",
    });
    assert.equal(conflictingCreate.status, 409);
    assert.equal(conflictingCreate.body.errorCode, "idempotency_conflict");

    const mainList = await api(server.origin, "/api/creator/tool-presets", mainLogin.cookie);
    assert.deepEqual(mainList.body.data.items.map((item: { id: string }) => item.id), [presetId]);
    assert.deepEqual((await api(server.origin, "/api/creator/tool-presets", otherLogin.cookie)).body.data.items, []);
    assert.equal((await api(server.origin, `/api/creator/tool-presets/${presetId}`, otherLogin.cookie)).status, 404);

    const updated = await api(server.origin, `/api/creator/tool-presets/${presetId}`, mainLogin.cookie, {
      method: "PATCH",
      body: { name: "团队脚本生图 V2" },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.preset.currentVersionNumber, 1);
    assert.deepEqual(
      (await api(server.origin, `/api/creator/tool-presets/${presetId}/versions`, memberLogin.cookie))
        .body.data.versions.map((item: { versionNumber: number }) => item.versionNumber),
      [1],
    );

    const topologyV2 = {
      ...topology,
      nodes: topology.nodes.map((node, index) => index === 0 ? { ...node, data: { ...node.data, text: "第二版" } } : node),
    };
    const missingExpectedVersion = await api(server.origin, `/api/creator/tool-presets/${presetId}`, mainLogin.cookie, {
      method: "PATCH",
      body: { topology: topologyV2 },
    });
    assert.equal(missingExpectedVersion.status, 400);
    assert.equal(missingExpectedVersion.body.errorCode, "invalid_tool_preset_version");
    assert.equal(missingExpectedVersion.body.details.reason, "expected_version_required");

    const topologyUpdated = await api(server.origin, `/api/creator/tool-presets/${presetId}`, mainLogin.cookie, {
      method: "PATCH",
      body: { topology: topologyV2, expectedVersionNumber: 1 },
    });
    assert.equal(topologyUpdated.status, 200);
    assert.equal(topologyUpdated.body.data.preset.currentVersionNumber, 2);

    const staleUpdate = await api(server.origin, `/api/creator/tool-presets/${presetId}`, memberLogin.cookie, {
      method: "PATCH",
      body: { topology, expectedVersionNumber: 1 },
    });
    assert.equal(staleUpdate.status, 409);
    assert.equal(staleUpdate.body.errorCode, "tool_preset_version_conflict");
    assert.equal(staleUpdate.body.details.reason, "expected_version_mismatch");
    assert.equal(staleUpdate.body.details.currentVersionNumber, 2);

    const concurrentUpdates = await Promise.all([
      api(server.origin, `/api/creator/tool-presets/${presetId}`, mainLogin.cookie, {
        method: "PATCH",
        body: { topology, expectedVersionNumber: 2 },
      }),
      api(server.origin, `/api/creator/tool-presets/${presetId}`, memberLogin.cookie, {
        method: "PATCH",
        body: { topology: topologyV2, expectedVersionNumber: 2 },
      }),
    ]);
    assert.deepEqual(concurrentUpdates.map((response) => response.status).sort(), [200, 409]);
    assert.equal(concurrentUpdates.find((response) => response.status === 200)?.body.data.preset.currentVersionNumber, 3);
    assert.equal(concurrentUpdates.find((response) => response.status === 409)?.body.details.currentVersionNumber, 3);
    const versions = await api(server.origin, `/api/creator/tool-presets/${presetId}/versions`, memberLogin.cookie);
    assert.deepEqual(versions.body.data.versions.map((item: { versionNumber: number }) => item.versionNumber), [3, 2, 1]);
    const firstVersion = await api(server.origin, `/api/creator/tool-presets/${presetId}/versions/1`, mainLogin.cookie);
    assert.equal(firstVersion.status, 200);
    assert.deepEqual(firstVersion.body.data.version.topology, topology);
    assert.equal((await api(server.origin, `/api/creator/tool-presets/${presetId}/versions/1`, otherLogin.cookie)).status, 404);

    const duplicated = await api(server.origin, `/api/creator/tool-presets/${presetId}/duplicate`, memberLogin.cookie, {
      method: "POST",
      body: { name: "团队脚本生图副本" },
      idempotencyKey: "tool-preset-duplicate-replay",
    });
    assert.equal(duplicated.status, 201);
    assert.equal(duplicated.body.data.preset.currentVersionNumber, 1);
    const duplicateId = String(duplicated.body.data.preset.id);
    const replayedDuplicate = await api(server.origin, `/api/creator/tool-presets/${presetId}/duplicate`, mainLogin.cookie, {
      method: "POST",
      body: { name: "团队脚本生图副本" },
      idempotencyKey: "tool-preset-duplicate-replay",
    });
    assert.equal(replayedDuplicate.status, 201);
    assert.equal(replayedDuplicate.body.data.preset.id, duplicateId);

    const invalid = await api(server.origin, "/api/creator/tool-presets", mainLogin.cookie, {
      method: "POST",
      idempotencyKey: "tool-preset-invalid-terminal",
      body: {
        name: "非法媒体预设",
        topology: {
          schemaVersion: 1,
          nodes: [{ kind: "image", offsetX: 0, offsetY: 0, data: { mediaUrl: "https://example.invalid/file.png" } }],
          connections: [],
        },
      },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.errorCode, "invalid_tool_preset_topology");
    assert.equal(invalid.body.details.reason, "node_0_data_field_invalid");
    const failedIdempotency = await db.query<{
      status: string;
      response_resource_id: string | null;
      response_snapshot_json: unknown;
    }>(
      `
        SELECT status, response_resource_id, response_snapshot_json
        FROM idempotency_records
        WHERE scope_key = $1
          AND operation_name = $2
          AND idempotency_key = $3
      `,
      [`user:${mainUserId}`, "canvas.tool_preset.create", "tool-preset-invalid-terminal"],
    );
    assert.deepEqual(failedIdempotency.rows, [{
      status: "failed_terminal",
      response_resource_id: null,
      response_snapshot_json: null,
    }]);

    for (const forbiddenKey of ["customUrl", "cacheStorageKey", "generationTaskId", "previousRunId"]) {
      const nestedInvalid = await api(server.origin, "/api/creator/tool-presets", mainLogin.cookie, {
        method: "POST",
        body: {
          name: `非法嵌套字段-${forbiddenKey}`,
          topology: {
            schemaVersion: 1,
            nodes: [{
              kind: "workflow",
              type: "script-node",
              offsetX: 0,
              offsetY: 0,
              data: { parameters: { portable: { [forbiddenKey]: "runtime-reference" } } },
            }],
            connections: [],
          },
        },
      });
      assert.equal(nestedInvalid.status, 400, forbiddenKey);
      assert.equal(nestedInvalid.body.errorCode, "invalid_tool_preset_topology", forbiddenKey);
      assert.equal(nestedInvalid.body.details.reason, "node_0_parameters_portable_field_invalid", forbiddenKey);
    }

    const nestedUrlValue = await api(server.origin, "/api/creator/tool-presets", mainLogin.cookie, {
      method: "POST",
      body: {
        name: "非法嵌套 URL 值",
        topology: {
          schemaVersion: 1,
          nodes: [{
            kind: "workflow",
            type: "script-node",
            offsetX: 0,
            offsetY: 0,
            data: { parameters: { portableReference: "https://example.invalid/runtime.png" } },
          }],
          connections: [],
        },
      },
    });
    assert.equal(nestedUrlValue.status, 400);
    assert.equal(nestedUrlValue.body.errorCode, "invalid_tool_preset_topology");
    assert.equal(nestedUrlValue.body.details.reason, "node_0_parameters_portableReference_value_invalid");

    const invalidGraphs = [
      {
        expectedReason: "connection_0_endpoint_invalid",
        topology: { ...topology, connections: [[0, 2]] },
      },
      {
        expectedReason: "canvas_connection_cycle",
        topology: {
          schemaVersion: 1,
          nodes: [
            { kind: "workflow", type: "director-node", offsetX: 0, offsetY: 0 },
            { kind: "workflow", type: "director-node", offsetX: 300, offsetY: 0 },
          ],
          connections: [[0, 1], [1, 0]],
        },
      },
      {
        expectedReason: "connection_0_kind_mismatch",
        topology: {
          schemaVersion: 1,
          nodes: [
            { kind: "workflow", type: "audio-node", offsetX: 0, offsetY: 0 },
            { kind: "image", offsetX: 300, offsetY: 0 },
          ],
          connections: [[0, 1]],
        },
      },
    ];
    for (const [index, invalidGraph] of invalidGraphs.entries()) {
      const graphResponse = await api(server.origin, "/api/creator/tool-presets", mainLogin.cookie, {
        method: "POST",
        body: { name: `非法图-${index}`, topology: invalidGraph.topology },
      });
      assert.equal(graphResponse.status, 400);
      assert.equal(graphResponse.body.errorCode, "invalid_tool_preset_topology");
      assert.equal(graphResponse.body.details.reason, invalidGraph.expectedReason);
    }

    await assert.rejects(
      createToolPreset(db, {
        adminUserId: otherUserId,
        createdByMemberId: memberId,
        name: "错误归属",
        topology,
      }),
      (error: unknown) => (
        error instanceof Error
        && "code" in error
        && (error as { code?: unknown }).code === "invalid_tool_preset_member"
      ),
    );

    assert.equal((await api(server.origin, `/api/creator/tool-presets/${presetId}`, otherLogin.cookie, {
      method: "DELETE",
    })).status, 404);
    const deleted = await api(server.origin, `/api/creator/tool-presets/${presetId}`, memberLogin.cookie, {
      method: "DELETE",
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data.deleted, true);
    assert.deepEqual(
      (await api(server.origin, "/api/creator/tool-presets", mainLogin.cookie)).body.data.items.map((item: { id: string }) => item.id),
      [duplicateId],
    );
    const withArchived = await api(server.origin, "/api/creator/tool-presets?includeArchived=true", mainLogin.cookie);
    assert.equal(withArchived.body.data.items.find((item: { id: string }) => item.id === presetId)?.status, "archived");
    assert.equal((await api(server.origin, `/api/creator/tool-presets/${presetId}`, mainLogin.cookie)).status, 404);
    assert.equal((await api(server.origin, `/api/creator/tool-presets/${presetId}/versions`, memberLogin.cookie)).status, 404);
    assert.equal((await api(server.origin, `/api/creator/tool-presets/${presetId}/duplicate`, mainLogin.cookie, {
      method: "POST",
      body: { name: "归档副本" },
    })).status, 404);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

async function passwordLogin(origin: string, phone: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  return {
    cookie: response.headers.get("set-cookie") ?? "",
    sessionId: String(body.session.id),
    expiresAt: String(body.session.expiresAt),
  };
}

async function api(
  origin: string,
  path: string,
  cookie: string,
  options: { method?: string; body?: unknown; idempotencyKey?: string | null } = {},
) {
  const method = options.method ?? "GET";
  const isToolPresetPost = method === "POST" && path.startsWith("/api/creator/tool-presets");
  const idempotencyKey = options.idempotencyKey === null
    ? null
    : options.idempotencyKey ?? (isToolPresetPost ? `tool-preset-test:${randomUUID()}` : null);
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}
