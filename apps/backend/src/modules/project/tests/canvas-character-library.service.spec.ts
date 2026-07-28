import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../../identity/canvas-actor-scope.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  addCanvasCharacterReference,
  CanvasCharacterLibraryError,
  copyCanvasCharacter,
  createCanvasCharacter,
  deleteCanvasCharacter,
  getCanvasCharacter,
  listCanvasCharacters,
  updateCanvasCharacter,
  updateCanvasCharacterReference,
} from "../canvas-character-library.service.ts";

const now = new Date("2026-07-26T12:00:00.000Z");
const ownerUserId = "a1000000-0000-4000-8000-000000000001";
const canvasId = "a2000000-0000-4000-8000-000000000001";
const memberId = "a3000000-0000-4000-8000-000000000001";
const otherMemberId = "a3000000-0000-4000-8000-000000000002";
const storageIds = [
  "a4000000-0000-4000-8000-000000000001",
  "a4000000-0000-4000-8000-000000000002",
  "a4000000-0000-4000-8000-000000000003",
];
const assetIds = [
  "a5000000-0000-4000-8000-000000000001",
  "a5000000-0000-4000-8000-000000000002",
  "a5000000-0000-4000-8000-000000000003",
];
const versionIds = [
  "a6000000-0000-4000-8000-000000000001",
  "a6000000-0000-4000-8000-000000000002",
  "a6000000-0000-4000-8000-000000000003",
];

describe("Canvas character library", { concurrency: false }, () => {
  it("shares Canvas characters with assigned actors and isolates global characters by principal", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedCharacterLibrary(db);
      const canvasCharacter = await createCanvasCharacter(db, {
        actorScope: ownerScope,
        scope: "canvas",
        name: "林夏",
        description: "调查记者",
        prompt: "short black hair, documentary wardrobe",
        references: [
          reference(0, { primary: true, avatar: true, sourceNodeId: "node-character-front", crop: { x: 0.1, y: 0.1, width: 0.6, height: 0.6, unit: "ratio" } }),
          reference(1, { sourceNodeId: "node-character-side", usage: "turnaround" }),
        ],
        now,
      });
      assert.equal(canvasCharacter.revision, 1);
      assert.equal(canvasCharacter.references.length, 2);
      assert.equal(canvasCharacter.references[0]?.storageObjectId, storageIds[0]);
      assert.equal("url" in canvasCharacter.references[0], false);

      const memberVisible = await listCanvasCharacters(db, { actorScope: memberScope, scope: "canvas" });
      assert.deepEqual(memberVisible.map((item) => item.id), [canvasCharacter.id]);
      const memberUpdated = await updateCanvasCharacter(db, {
        actorScope: memberScope,
        characterId: canvasCharacter.id,
        expectedRevision: 1,
        patch: { name: "林夏（夜景）" },
        now: new Date(now.getTime() + 1_000),
      });
      assert.equal(memberUpdated.revision, 2);
      assert.equal(memberUpdated.updatedByTeamMemberId, memberId);

      const memberGlobal = await createCanvasCharacter(db, {
        actorScope: memberScope,
        scope: "global",
        name: "成员私有角色",
        references: [reference(0)],
        now,
      });
      const ownerGlobal = await createCanvasCharacter(db, {
        actorScope: ownerScope,
        scope: "global",
        name: "主用户全局角色",
        references: [reference(0)],
        now,
      });
      assert.deepEqual((await listCanvasCharacters(db, { actorScope: memberScope, scope: "global" })).map((item) => item.id), [memberGlobal.id]);
      assert.deepEqual((await listCanvasCharacters(db, { actorScope: ownerScope, scope: "global" })).map((item) => item.id), [ownerGlobal.id]);
      assert.deepEqual(await listCanvasCharacters(db, { actorScope: otherMemberScope, scope: "global" }), []);
      await assert.rejects(
        getCanvasCharacter(db, { actorScope: ownerScope, characterId: memberGlobal.id }),
        isError("canvas_character_not_found"),
      );

      const copied = await copyCanvasCharacter(db, {
        actorScope: memberScope,
        sourceCharacterId: canvasCharacter.id,
        expectedRevision: 2,
        targetScope: "global",
        name: "林夏全局副本",
        now: new Date(now.getTime() + 2_000),
      });
      assert.notEqual(copied.id, canvasCharacter.id);
      assert.equal(copied.scope, "global");
      assert.equal(copied.references.length, 2);
      assert.ok(copied.references.every((item, index) => item.id !== canvasCharacter.references[index]?.id));
      const renamedCopy = await updateCanvasCharacter(db, {
        actorScope: memberScope,
        characterId: copied.id,
        expectedRevision: 1,
        patch: { name: "独立副本" },
        now: new Date(now.getTime() + 3_000),
      });
      assert.equal(renamedCopy.name, "独立副本");
      assert.equal((await getCanvasCharacter(db, { actorScope: ownerScope, characterId: canvasCharacter.id })).name, "林夏（夜景）");

      const deleted = await deleteCanvasCharacter(db, {
        actorScope: memberScope,
        characterId: canvasCharacter.id,
        expectedRevision: 2,
        now: new Date(now.getTime() + 4_000),
      });
      assert.deepEqual(deleted.sourceNodeIds, ["node-character-front", "node-character-side"]);
      await assert.rejects(
        getCanvasCharacter(db, { actorScope: ownerScope, characterId: canvasCharacter.id }),
        isError("canvas_character_not_found"),
      );
    } finally {
      await db.close();
    }
  });

  it("uses optimistic revisions and keeps primary/avatar unique while preserving reference audit", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedCharacterLibrary(db);
      const created = await createCanvasCharacter(db, {
        actorScope: ownerScope,
        scope: "canvas",
        name: "周野",
        references: [reference(0, { primary: true, avatar: true, sourceNodeId: "node-one" })],
        now,
      });
      await assert.rejects(
        updateCanvasCharacter(db, {
          actorScope: memberScope,
          characterId: created.id,
          expectedRevision: 9,
          patch: { name: "stale" },
          now,
        }),
        isError("canvas_character_revision_conflict"),
      );

      const added = await addCanvasCharacterReference(db, {
        actorScope: memberScope,
        characterId: created.id,
        expectedRevision: 1,
        reference: reference(1, { primary: true, avatar: true, sourceNodeId: "node-two" }, 1),
        now: new Date(now.getTime() + 1_000),
      });
      assert.equal(added.character.revision, 2);
      assert.equal(added.reference.createdByTeamMemberId, memberId);
      assert.equal(added.character.references.filter((item) => item.primary).length, 1);
      assert.equal(added.character.references.filter((item) => item.avatar).length, 1);
      assert.equal(added.reference.primary, true);

      const original = added.character.references.find((item) => item.sourceNodeId === "node-one")!;
      const updated = await updateCanvasCharacterReference(db, {
        actorScope: ownerScope,
        characterId: created.id,
        referenceId: original.id,
        expectedRevision: 2,
        patch: { primary: true, crop: { x: 10, y: 20, width: 100, height: 120, unit: "pixel" } },
        now: new Date(now.getTime() + 2_000),
      });
      assert.equal(updated.revision, 3);
      assert.equal(updated.references.filter((item) => item.primary).length, 1);
      assert.equal(updated.references.find((item) => item.id === original.id)?.primary, true);
      assert.deepEqual(updated.references.find((item) => item.id === original.id)?.crop, {
        x: 10, y: 20, width: 100, height: 120, unit: "pixel",
      });

      const row = await db.query<{
        created_by_team_member_id: string | null;
        updated_by_team_member_id: string | null;
        source_snapshot_json: Record<string, unknown>;
      }>(`
        SELECT created_by_team_member_id,updated_by_team_member_id,source_snapshot_json
        FROM canvas_character_asset_references WHERE id=$1
      `, [added.reference.id]);
      assert.equal(row.rows[0]?.created_by_team_member_id, memberId);
      assert.equal(row.rows[0]?.updated_by_team_member_id, null);
      assert.deepEqual(row.rows[0]?.source_snapshot_json, { nodeType: "image", capturedRevision: 7 });
    } finally {
      await db.close();
    }
  });

  it("rejects embedded URLs, Base64, and conflicting initial primary references", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedCharacterLibrary(db);
      await assert.rejects(
        createCanvasCharacter(db, {
          actorScope: ownerScope,
          scope: "canvas",
          name: "带 URL",
          references: [reference(0, { sourceSnapshot: { signedUrl: "https://example.test/signed?token=secret" } })],
          now,
        }),
        isError("canvas_character_embedded_media_forbidden"),
      );
      await assert.rejects(
        createCanvasCharacter(db, {
          actorScope: ownerScope,
          scope: "canvas",
          name: "冲突主图",
          references: [reference(0, { primary: true }), reference(1, { primary: true }, 1)],
          now,
        }),
        isError("canvas_character_primary_conflict"),
      );
      const foreignUserId = "b1000000-0000-4000-8000-000000000001";
      const foreignStorageId = "b4000000-0000-4000-8000-000000000001";
      await db.query("INSERT INTO users (id,phone_e164,status) VALUES ($1,'13900139000','active')", [foreignUserId]);
      await db.query(`
        INSERT INTO storage_objects (
          id,bucket,object_key,content_type,size_bytes,metadata_json,
          created_by_user_id,provider,status
        ) VALUES ($1,'foreign-bucket','foreign.png','image/png',128,'{}'::jsonb,$2,'test','available')
      `, [foreignStorageId, foreignUserId]);
      await assert.rejects(
        createCanvasCharacter(db, {
          actorScope: ownerScope,
          scope: "canvas",
          name: "越权素材",
          references: [{ storageObjectId: foreignStorageId }],
          now,
        }),
        isError("canvas_character_storage_object_not_found"),
      );
    } finally {
      await db.close();
    }
  });
});

const ownerScope: CanvasActorScope = {
  canvasId,
  ownerUserId,
  principal: "owner",
  actorTeamMemberId: null,
  principalKey: `owner:${ownerUserId}`,
  capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
};
const memberScope: CanvasActorScope = {
  canvasId,
  ownerUserId,
  principal: "team_member",
  actorTeamMemberId: memberId,
  principalKey: `member:${memberId}`,
  capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun],
};
const otherMemberScope: CanvasActorScope = {
  ...memberScope,
  actorTeamMemberId: otherMemberId,
  principalKey: `member:${otherMemberId}`,
};

function reference(
  position: number,
  patch: Record<string, unknown> = {},
  mediaIndex = position,
) {
  return {
    position,
    usage: "reference",
    prompt: "角色参考图",
    storageObjectId: storageIds[mediaIndex],
    assetId: assetIds[mediaIndex],
    assetVersionId: versionIds[mediaIndex],
    sourceSnapshot: { nodeType: "image", capturedRevision: 7 },
    ...patch,
  };
}

function isError(code: string) {
  return (error: unknown) => error instanceof CanvasCharacterLibraryError && error.code === code;
}

async function seedCharacterLibrary(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query("INSERT INTO users (id,phone_e164,status) VALUES ($1,'13800138000','active')", [ownerUserId]);
  await db.query(`
    INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
    VALUES ($1,'Character Canvas','active',1,$2,$2)
  `, [canvasId, ownerUserId]);
  for (const [id, account] of [[memberId, "character-member"], [otherMemberId, "other-character-member"]]) {
    await db.query(`
      INSERT INTO team_members (
        id,user_id,member_account,member_account_suffix,member_login_account,
        member_name,member_password_hash,member_credits,status
      ) VALUES ($1,$2,$3,'u38000',$3 || '@u38000',$3,'hash',0,'active')
    `, [id, ownerUserId, account]);
  }
  for (let index = 0; index < storageIds.length; index += 1) {
    await db.query(`
      INSERT INTO storage_objects (
        id,canvas_project_id,bucket,object_key,content_type,size_bytes,metadata_json,
        created_by_user_id,provider,status
      ) VALUES ($1,$2,'test-bucket',$3,'image/png',128,'{}'::jsonb,$4,'test','available')
    `, [storageIds[index], canvasId, `characters/${index}.png`, ownerUserId]);
    await db.query(`
      INSERT INTO assets (id,canvas_project_id,asset_type,asset_key,created_by_user_id)
      VALUES ($1,$2,'character_sheet',$3,$4)
    `, [assetIds[index], canvasId, `character-${index}`, ownerUserId]);
    await db.query(`
      INSERT INTO asset_versions (
        id,asset_id,version_number,storage_object_key,metadata_json,created_by_user_id,storage_object_id
      ) VALUES ($1,$2,1,$3,'{}'::jsonb,$4,$5)
    `, [versionIds[index], assetIds[index], `characters/${index}.png`, ownerUserId, storageIds[index]]);
  }
}
