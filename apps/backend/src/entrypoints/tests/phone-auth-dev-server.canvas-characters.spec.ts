import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("Canvas character library HTTP", { concurrency: false }, () => {
  it("enforces Canvas assignment, global principal isolation, revisions, and stable preview authorization", async () => {
    const db = await createMigratedTestDb();
    const ownerId = randomUUID();
    const otherUserId = randomUUID();
    const memberId = randomUUID();
    const unassignedMemberId = randomUUID();
    const canvasId = randomUUID();
    const secondCanvasId = randomUUID();
    const storageObjectIds = [randomUUID(), randomUUID()];
    const ownerPhone = uniquePhone("136");
    const otherPhone = uniquePhone("137");
    const memberAccount = `character-member-${String(Date.now()).slice(-6)}`;
    const unassignedAccount = `character-unassigned-${String(Date.now()).slice(-6)}`;
    const memberPassword = ownerPhone.slice(-6);
    const unassignedPassword = ownerPhone.slice(-6);
    const server = createPhoneAuthDevServer({
      db,
      env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
      repairScheduler: { enabled: false },
      storageRuntime: {
        mode: "cos",
        provider: "test",
        bucket: "character-library",
        region: "test-region",
        adapter: {
          async createSignedReadUrl({ objectKey, expiresAt }) {
            return { url: `https://storage.example.test/${objectKey}`, expiresAt };
          },
          async putObject() { return { eTag: "test" }; },
          async headObject() { return { exists: true }; },
        },
      },
    });
    try {
      await seedIdentity(db, {
        ownerId,
        otherUserId,
        memberId,
        unassignedMemberId,
        canvasId,
        secondCanvasId,
        ownerPhone,
        otherPhone,
        memberAccount,
        unassignedAccount,
        memberPassword,
        unassignedPassword,
        storageObjectIds,
      });
      await server.listen(0);
      const ownerCookie = await passwordLogin(server.origin, ownerPhone);
      const otherCookie = await passwordLogin(server.origin, otherPhone);
      const memberCookie = await teamMemberPasswordLogin(
        server.origin,
        `${memberAccount}@${ownerPhone.slice(-6)}`,
        memberPassword,
      );
      const unassignedCookie = await teamMemberPasswordLogin(
        server.origin,
        `${unassignedAccount}@${ownerPhone.slice(-6)}`,
        unassignedPassword,
      );

      const created = await api(server.origin, `/api/canvas/${canvasId}/characters`, ownerCookie, {
        method: "POST",
        body: {
          scope: "canvas",
          name: "林夏",
          prompt: "documentary character",
          references: [{
            storageObjectId: storageObjectIds[0],
            usage: "front",
            primary: true,
            avatar: true,
            sourceNodeId: "node-front",
            sourceSnapshot: { nodeType: "image", revision: 7 },
          }],
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const character = created.body.data.character;
      assert.equal(character.revision, 1);
      assert.equal(character.references[0].previewUrl, `/api/storage/objects/${storageObjectIds[0]}/content`);
      assert.equal("signedUrl" in character.references[0], false);

      const ownerGet = await api(server.origin, `/api/canvas/${canvasId}/characters/${character.id}`, ownerCookie);
      assert.equal(ownerGet.status, 200, JSON.stringify(ownerGet.body));
      assert.equal(ownerGet.body.data.character.references[0].previewUrl, `/api/storage/objects/${storageObjectIds[0]}/content`);
      const missingCharacter = await api(server.origin, `/api/canvas/${canvasId}/characters/${randomUUID()}`, ownerCookie);
      assert.equal(missingCharacter.status, 404, JSON.stringify(missingCharacter.body));
      assert.equal(missingCharacter.body.errorCode, "canvas_character_not_found");
      const invalidScope = await api(server.origin, `/api/canvas/${canvasId}/characters?scope=private`, ownerCookie);
      assert.equal(invalidScope.status, 400, JSON.stringify(invalidScope.body));
      assert.equal(invalidScope.body.errorCode, "canvas_character_scope_invalid");
      const memberList = await api(server.origin, `/api/canvas/${canvasId}/characters?scope=canvas`, memberCookie);
      assert.equal(memberList.status, 200, JSON.stringify(memberList.body));
      assert.deepEqual(memberList.body.data.characters.map((item: { id: string }) => item.id), [character.id]);

      for (const cookie of [unassignedCookie, otherCookie]) {
        const denied = await api(server.origin, `/api/canvas/${canvasId}/characters`, cookie);
        assert.equal(denied.status, 404, JSON.stringify(denied.body));
        assert.equal(denied.body.errorCode, "canvas_not_found");
      }

      const updated = await api(server.origin, `/api/canvas/${canvasId}/characters/${character.id}`, memberCookie, {
        method: "PATCH",
        body: { expectedRevision: 1, patch: { name: "林夏夜景" } },
      });
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal(updated.body.data.character.revision, 2);
      assert.equal(updated.body.data.character.updatedByTeamMemberId, memberId);
      const stale = await api(server.origin, `/api/canvas/${canvasId}/characters/${character.id}`, ownerCookie, {
        method: "PATCH",
        body: { expectedRevision: 1, patch: { name: "过期修改" } },
      });
      assert.equal(stale.status, 409, JSON.stringify(stale.body));
      assert.equal(stale.body.errorCode, "canvas_character_revision_conflict");

      const added = await api(server.origin, `/api/canvas/${canvasId}/characters/${character.id}/references`, memberCookie, {
        method: "POST",
        body: {
          expectedRevision: 2,
          reference: {
            storageObjectId: storageObjectIds[1],
            usage: "side",
            sourceNodeId: "node-side",
            sourceSnapshot: { nodeType: "image", revision: 8 },
          },
        },
      });
      assert.equal(added.status, 201, JSON.stringify(added.body));
      assert.equal(added.body.data.character.revision, 3);
      assert.equal(added.body.data.reference.previewUrl, `/api/storage/objects/${storageObjectIds[1]}/content`);
      const secondReferenceId = String(added.body.data.reference.id);
      const firstReferenceId = String(added.body.data.character.references.find((item: { sourceNodeId: string }) => item.sourceNodeId === "node-front").id);

      const referenceUpdated = await api(
        server.origin,
        `/api/canvas/${canvasId}/characters/${character.id}/references/${secondReferenceId}`,
        memberCookie,
        { method: "PATCH", body: { expectedRevision: 3, patch: { primary: true } } },
      );
      assert.equal(referenceUpdated.status, 200, JSON.stringify(referenceUpdated.body));
      assert.equal(referenceUpdated.body.data.character.revision, 4);
      assert.equal(referenceUpdated.body.data.character.references.filter((item: { primary: boolean }) => item.primary).length, 1);

      const referenceDeleted = await api(
        server.origin,
        `/api/canvas/${canvasId}/characters/${character.id}/references/${firstReferenceId}`,
        memberCookie,
        { method: "DELETE", body: { expectedRevision: 4 } },
      );
      assert.equal(referenceDeleted.status, 200, JSON.stringify(referenceDeleted.body));
      assert.deepEqual(referenceDeleted.body.data.sourceNodeIds, ["node-front"]);

      const copied = await api(server.origin, `/api/canvas/${canvasId}/characters/${character.id}/copy`, memberCookie, {
        method: "POST",
        body: { expectedRevision: 5, targetScope: "global", name: "成员全局副本" },
      });
      assert.equal(copied.status, 201, JSON.stringify(copied.body));
      const copiedCharacter = copied.body.data.character;
      assert.equal(copiedCharacter.scope, "global");
      assert.equal(copiedCharacter.principalKey, `member:${memberId}`);
      assert.equal(copiedCharacter.references[0].previewUrl, `/api/storage/objects/${storageObjectIds[1]}/content`);

      const deleted = await api(server.origin, `/api/canvas/${canvasId}/characters/${character.id}`, ownerCookie, {
        method: "DELETE",
        body: { expectedRevision: 5 },
      });
      assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
      assert.deepEqual(deleted.body.data.sourceNodeIds, ["node-side"]);

      await db.query("DELETE FROM team_member_canvases WHERE member_id=$1 AND canvas_id=$2", [memberId, canvasId]);
      const globalFromSecondCanvas = await api(
        server.origin,
        `/api/canvas/${secondCanvasId}/characters?scope=global`,
        memberCookie,
      );
      assert.equal(globalFromSecondCanvas.status, 200, JSON.stringify(globalFromSecondCanvas.body));
      assert.deepEqual(globalFromSecondCanvas.body.data.characters.map((item: { id: string }) => item.id), [copiedCharacter.id]);
      const ownerGlobals = await api(server.origin, `/api/canvas/${secondCanvasId}/characters?scope=global`, ownerCookie);
      assert.equal(ownerGlobals.status, 200, JSON.stringify(ownerGlobals.body));
      assert.deepEqual(ownerGlobals.body.data.characters, []);

      const memberPreview = await fetch(
        `${server.origin}${copiedCharacter.references[0].previewUrl}`,
        { headers: { cookie: memberCookie }, redirect: "manual" },
      );
      assert.equal(memberPreview.status, 307, await memberPreview.text());
      assert.equal(memberPreview.headers.get("location"), "https://storage.example.test/characters/1.png");
      const unassignedPreview = await fetch(
        `${server.origin}${copiedCharacter.references[0].previewUrl}`,
        { headers: { cookie: unassignedCookie }, redirect: "manual" },
      );
      assert.equal(unassignedPreview.status, 404, await unassignedPreview.text());
      const otherPreview = await fetch(
        `${server.origin}${copiedCharacter.references[0].previewUrl}`,
        { headers: { cookie: otherCookie }, redirect: "manual" },
      );
      assert.equal(otherPreview.status, 404, await otherPreview.text());
    } finally {
      await server.close().catch(() => undefined);
      await db.close();
    }
  });
});

async function seedIdentity(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    ownerId: string;
    otherUserId: string;
    memberId: string;
    unassignedMemberId: string;
    canvasId: string;
    secondCanvasId: string;
    ownerPhone: string;
    otherPhone: string;
    memberAccount: string;
    unassignedAccount: string;
    memberPassword: string;
    unassignedPassword: string;
    storageObjectIds: string[];
  },
) {
  await db.query(`
    INSERT INTO users (id,phone_e164,password_hash,status) VALUES
      ($1,$2,$3,'active'),($4,$5,$6,'active')
  `, [
    input.ownerId,
    input.ownerPhone,
    await createUserPasswordHash(defaultPasswordFromPhone(input.ownerPhone)),
    input.otherUserId,
    input.otherPhone,
    await createUserPasswordHash(defaultPasswordFromPhone(input.otherPhone)),
  ]);
  await db.query(`
    INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id) VALUES
      ($1,'Character Canvas','active',1,$3,$3),($2,'Second Canvas','active',1,$3,$3)
  `, [input.canvasId, input.secondCanvasId, input.ownerId]);
  for (const member of [
    { id: input.memberId, account: input.memberAccount, password: input.memberPassword },
    { id: input.unassignedMemberId, account: input.unassignedAccount, password: input.unassignedPassword },
  ]) {
    await db.query(`
      INSERT INTO team_members (
        id,user_id,member_account,member_account_suffix,member_login_account,
        member_name,member_password_hash,status
      ) VALUES ($1,$2,$3,$4,$5,$3,$6,'active')
    `, [
      member.id,
      input.ownerId,
      member.account,
      input.ownerPhone.slice(-6),
      `${member.account}@${input.ownerPhone.slice(-6)}`,
      await createUserPasswordHash(member.password),
    ]);
  }
  for (const canvasId of [input.canvasId, input.secondCanvasId]) {
    await db.query(
      "INSERT INTO team_member_canvases (id,member_id,user_id,canvas_id) VALUES ($1,$2,$3,$4)",
      [randomUUID(), input.memberId, input.ownerId, canvasId],
    );
  }
  for (let index = 0; index < input.storageObjectIds.length; index += 1) {
    await db.query(`
      INSERT INTO storage_objects (
        id,canvas_project_id,bucket,object_key,content_type,size_bytes,metadata_json,
        created_by_user_id,provider,status
      ) VALUES ($1,$2,'character-library',$3,'image/png',128,'{}'::jsonb,$4,'test','available')
    `, [input.storageObjectIds[index], input.canvasId, `characters/${index}.png`, input.ownerId]);
  }
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

async function api(
  origin: string,
  path: string,
  cookie: string,
  options: { method?: string; body?: unknown } = {},
) {
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
  return `${prefix}${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
}
