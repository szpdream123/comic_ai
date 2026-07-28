import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../../modules/identity/canvas-actor-scope.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { __phoneAuthDevServerTestUtils } from "../phone-auth-dev-server.ts";

it("injects Canvas character @drama references into top-level and model generation parameters", async () => {
  const db = await createMigratedTestDb();
  const userId = randomUUID();
  const canvasId = randomUUID();
  const characterId = randomUUID();
  const referenceId = randomUUID();
  const assetId = randomUUID();
  const assetVersionId = randomUUID();
  const now = new Date("2026-07-25T10:00:00.000Z");
  const principalKey = `owner:${userId}`;
  const scope: CanvasActorScope = {
    canvasId,
    ownerUserId: userId,
    principal: "owner",
    actorTeamMemberId: null,
    principalKey,
    capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
  };
  try {
    await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [userId]);
    await db.query(`
      INSERT INTO creator_canvas_projects
        (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Character prompt generation','active',1,$2,$2)
    `, [canvasId, userId]);
    await db.query(`
      INSERT INTO assets (id,canvas_project_id,asset_type,asset_key,created_by_user_id,created_at,updated_at)
      VALUES ($1,$2,'shot_image','character-reference',$3,$4,$4)
    `, [assetId, canvasId, userId, now]);
    await db.query(`
      INSERT INTO asset_versions (
        id,asset_id,version_number,storage_object_key,metadata_json,created_by_user_id,created_at
      ) VALUES ($1,$2,1,'canvas/character-reference.png','{}'::jsonb,$3,$4)
    `, [assetVersionId, assetId, userId, now]);
    await db.query(`
      INSERT INTO canvas_character_assets (
        id,owner_user_id,scope,canvas_id,principal_key,name,prompt_text,
        created_by_principal_key,updated_by_principal_key,created_at,updated_at
      ) VALUES ($1,$2,'canvas',$3,NULL,'任小野','清瘦少年',$4,$4,$5,$5)
    `, [characterId, userId, canvasId, principalKey, now]);
    await db.query(`
      INSERT INTO canvas_character_asset_references (
        id,character_id,position,usage,prompt_text,is_primary,is_avatar,asset_version_id,
        created_by_principal_key,updated_by_principal_key,created_at,updated_at
      ) VALUES ($1,$2,0,'正面','正面全身',true,true,$3,$4,$4,$5,$5)
    `, [referenceId, characterId, assetVersionId, principalKey, now]);

    const resolved = await __phoneAuthDevServerTestUtils.resolveCanvasGenerationPromptBody(
      db,
      scope,
      {
        model: "nano_banana_2",
        prompt: `portrait @drama:${characterId}@${referenceId}`,
        parameters: {},
      },
      "image",
    );
    assert.match(String(resolved.prompt), /portrait 清瘦少年/);
    assert.match(String(resolved.prompt), /正面全身/);
    assert.deepEqual(resolved.referenceAssetVersionIds, [assetVersionId]);
    assert.deepEqual(
      (resolved.parameters as Record<string, unknown>).referenceAssetVersionIds,
      [assetVersionId],
    );
    assert.equal(JSON.stringify(resolved.canvasContext).includes("previewUrl"), false);
    assert.equal(JSON.stringify(resolved.canvasContext).includes("signed"), false);
  } finally {
    await db.close();
  }
});
