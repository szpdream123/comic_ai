import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("Canvas director artifact ownership and assignment", { concurrency: false }, () => {
  it("writes screenshot, panorama screenshot, and video artifacts for owner and assigned member only", async () => {
    const db = await createMigratedTestDb();
    const ownerPhone = uniquePhone("136");
    const memberPhone = uniquePhone("137");
    const unassignedPhone = uniquePhone("138");
    const ownerId = randomUUID();
    const memberId = randomUUID();
    const unassignedMemberId = randomUUID();
    const canvasId = randomUUID();
    const deskId = randomUUID();
    const storageObjectId = randomUUID();
    const server = createPhoneAuthDevServer({
      db,
      env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
      repairScheduler: { enabled: false },
    });

    try {
      await seedUser(db, ownerId, ownerPhone);
      await seedUser(db, randomUUID(), unassignedPhone);
      await seedMember(db, memberId, ownerId, "director-assigned", memberPhone, "director-member-password");
      await seedMember(db, unassignedMemberId, ownerId, "director-unassigned", unassignedPhone, "director-member-password");
      await db.query(
        `
          INSERT INTO creator_canvas_projects
            (id, title, status, server_revision, created_by_user_id, updated_by_user_id)
          VALUES ($1, 'Director artifact canvas', 'active', 1, $2, $2)
        `,
        [canvasId, ownerId],
      );
      await db.query(
        `
          INSERT INTO director_desks
            (id, user_id, desk_key, name, scene_json, status, sort_order)
          VALUES ($1, $2, 'desk-artifact', 'Artifact desk', '{}'::jsonb, 'active', 1)
        `,
        [deskId, ownerId],
      );
      await db.query(
        `
          INSERT INTO team_member_director_desks (id, member_id, user_id, director_desk_id)
          VALUES ($1, $2, $3, $4)
        `,
        [randomUUID(), memberId, ownerId, deskId],
      );
      await db.query(
        `
          INSERT INTO team_member_canvases (id, member_id, user_id, canvas_id)
          VALUES ($1, $2, $3, $4)
        `,
        [randomUUID(), memberId, ownerId, canvasId],
      );
      await db.query(
        `
          INSERT INTO storage_objects (
            id, canvas_project_id, bucket, object_key, content_type, size_bytes,
            created_by_user_id, provider, status, metadata_json
          ) VALUES ($1, $2, 'director-artifact-test', 'captures/result.png', 'image/png', 32,
            $3, 'creator-dev', 'available', '{}'::jsonb)
        `,
        [storageObjectId, canvasId, ownerId],
      );
      await server.listen(0);

      const ownerCookie = await passwordLogin(server.origin, ownerPhone);
      const memberCookie = await teamMemberPasswordLogin(server.origin, `director-assigned@${memberPhone.slice(-6)}`, "director-member-password");
      const unassignedCookie = await teamMemberPasswordLogin(server.origin, `director-unassigned@${unassignedPhone.slice(-6)}`, "director-member-password");
      const nodeDocument = {
        version: 2,
        canvasProjectId: canvasId,
        projectId: canvasId,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [{
          id: "director-1",
          type: "ai-director",
          position: { x: 0, y: 0 },
          size: { width: 360, height: 220 },
          data: {
            directorDeskKey: "desk-artifact",
            loomicElement: { customData: { type: "director-node" } },
          },
        }],
        edges: [],
        groups: [],
      };
      const save = await api(server.origin, `/api/creator/canvas-projects/${canvasId}/canvas`, ownerCookie, {
        method: "PUT",
        body: { clientRevision: 1, document: nodeDocument },
      });
      assert.equal(save.status, 200, JSON.stringify(save.body));

      const base = {
        directorDeskKey: "desk-artifact",
        storageObjectId,
        expectedRevision: 2,
      };
      const ownerScreenshot = await api(server.origin, `/api/canvas/${canvasId}/nodes/director-1/director-artifacts`, ownerCookie, {
        method: "POST",
        body: { ...base, artifactKind: "image", metadata: { directorArtifactKind: "screenshot", fileName: "shot.png" } },
      });
      assert.equal(ownerScreenshot.status, 201, JSON.stringify(ownerScreenshot.body));

      const memberPanorama = await api(server.origin, `/api/canvas/${canvasId}/nodes/director-1/director-artifacts`, memberCookie, {
        method: "POST",
        body: { ...base, artifactKind: "image", metadata: { directorArtifactKind: "panorama", fileName: "panorama.jpg" } },
      });
      assert.equal(memberPanorama.status, 201, JSON.stringify(memberPanorama.body));

      const memberVideo = await api(server.origin, `/api/canvas/${canvasId}/nodes/director-1/director-artifacts`, memberCookie, {
        method: "POST",
        body: { ...base, artifactKind: "video", metadata: { directorArtifactKind: "video", fileName: "reference.webm" } },
      });
      assert.equal(memberVideo.status, 201, JSON.stringify(memberVideo.body));

      const rows = await db.query<{ artifact_kind: string; metadata_json: Record<string, unknown> }>(
        `SELECT artifact_kind, metadata_json FROM creator_canvas_node_artifacts WHERE canvas_project_id = $1 ORDER BY created_at`,
        [canvasId],
      );
      assert.deepEqual(rows.rows.map((row) => ({ kind: row.artifact_kind, directorKind: row.metadata_json.directorArtifactKind })), [
        { kind: "image", directorKind: "screenshot" },
        { kind: "image", directorKind: "panorama" },
        { kind: "video", directorKind: "video" },
      ]);

      const unassigned = await api(server.origin, `/api/canvas/${canvasId}/nodes/director-1/director-artifacts`, unassignedCookie, {
        method: "POST",
        body: { ...base, artifactKind: "image", metadata: { directorArtifactKind: "screenshot" } },
      });
      assert.equal(unassigned.status, 404);

      await db.query("DELETE FROM team_member_canvases WHERE member_id = $1 AND canvas_id = $2", [memberId, canvasId]);
      const revoked = await api(server.origin, `/api/canvas/${canvasId}/nodes/director-1/director-artifacts`, memberCookie, {
        method: "POST",
        body: { ...base, artifactKind: "image", metadata: { directorArtifactKind: "screenshot" } },
      });
      assert.equal(revoked.status, 404);
      assert.equal((await db.query("SELECT count(*)::int AS count FROM creator_canvas_node_artifacts WHERE canvas_project_id = $1", [canvasId])).rows[0].count, 3);
    } finally {
      await server.close().catch(() => undefined);
      await db.close();
    }
  });
});

async function seedUser(db: Awaited<ReturnType<typeof createMigratedTestDb>>, userId: string, phone: string) {
  await db.query(
    "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
    [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
  );
}

async function seedMember(db: Awaited<ReturnType<typeof createMigratedTestDb>>, memberId: string, ownerId: string, account: string, phone: string, password: string) {
  await db.query(
    `
      INSERT INTO team_members (
        id, user_id, member_account, member_account_suffix, member_login_account,
        member_name, member_password_hash, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
    `,
    [memberId, ownerId, account, phone.slice(-6), `${account}@${phone.slice(-6)}`, account, await createUserPasswordHash(password)],
  );
}

async function passwordLogin(origin: string, phone: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get("set-cookie") ?? "";
}

async function teamMemberPasswordLogin(origin: string, account: string, password: string) {
  const response = await fetch(`${origin}/api/auth/team-member/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password }),
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get("set-cookie") ?? "";
}

async function api(origin: string, path: string, cookie: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      cookie,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

function uniquePhone(prefix: string) {
  return `${prefix}${String(Math.floor(Math.random() * 1_000_00000)).padStart(8, "0")}`;
}
