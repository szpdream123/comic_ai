import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../../identity/canvas-actor-scope.service.ts";
import { createPromptMarketplaceService } from "../../prompt-marketplace/prompt-marketplace.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  applyCanvasPromptDramaBindings,
  CANVAS_PROMPT_EXPANSION_ORDER,
  CanvasPromptReferenceError,
  expandCanvasPromptDirectives,
  loadCanvasPromptDirectiveCatalog,
  resolveCanvasPromptReferences,
  resolveCanvasPromptWithDirectives,
  validateCanvasPromptExpansionDirectiveContract,
} from "../canvas-prompt-reference.service.ts";
import { createCanvasUserConfig, createCanvasUserConfigVersion } from "../canvas-user-config.service.ts";

describe("Canvas server prompt references", { concurrency: false }, () => {
  it("loads slash command and preset directive bodies from owner-scoped immutable configs", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const now = new Date("2026-07-25T08:00:00.000Z");
    try {
      const slash = await createCanvasUserConfig(db, {
        userId: fixture.userId,
        type: "slash_command",
        name: "compose",
        manifest: { content: "compose one clear frame" },
        now,
      });
      const preset = await createCanvasUserConfig(db, {
        userId: fixture.userId,
        type: "preset",
        name: "portrait",
        manifest: { prompt: "portrait lighting @style:missing" },
        now,
      });
      const catalog = await loadCanvasPromptDirectiveCatalog(db, { actorScope: fixture.scope });
      assert.deepEqual(catalog.slashCommands?.map((item) => [item.id, item.version, item.content]), [
        [slash.config.id, "1", "compose one clear frame"],
      ]);
      assert.deepEqual(catalog.presets?.map((item) => [item.id, item.version, item.content]), [
        [preset.config.id, "1", "portrait lighting @style:missing"],
      ]);
    } finally {
      await db.close();
    }
  });

  it("resolves owner-scoped asset, config, and prompt versions into a stable snapshot", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const now = new Date("2026-07-25T08:00:00.000Z");
    try {
      const style = await createCanvasUserConfig(db, {
        userId: fixture.userId,
        type: "style",
        name: "Ink",
        manifest: { prompt: "black ink line art" },
        now,
      });
      const skill = await createCanvasUserConfig(db, {
        userId: fixture.userId,
        type: "skill",
        name: "Storyboard",
        manifest: { instructions: "compose a readable storyboard", toolAllowlist: [] },
        now,
      });
      const prompt = await createPromptMarketplaceService({ db }).createItem({
        userId: fixture.userId,
        title: "Lighting prompt",
        category: "image_style",
        content: "soft cinematic rim lighting",
        publish: true,
        now,
      });
      const assetId = randomUUID();
      const assetVersionId = randomUUID();
      await db.query(`
        INSERT INTO assets (id,canvas_project_id,asset_type,asset_key,created_by_user_id,created_at,updated_at)
        VALUES ($1,$2,'shot_image','hero',$3,$4,$4)
      `, [assetId, fixture.canvasId, fixture.userId, now]);
      await db.query(`
        INSERT INTO asset_versions (
          id,asset_id,version_number,storage_object_key,metadata_json,created_by_user_id,created_at
        ) VALUES ($1,$2,1,'canvas/hero.png',$3::jsonb,$4,$5)
      `, [assetVersionId, assetId, JSON.stringify({ prompt: "red-coated heroine" }), fixture.userId, now]);

      const sourcePrompt = [
        `@asset:${assetId}@1`,
        `@style:${style.config.id}@${style.version.version}`,
        `@skill:${skill.config.id}@${skill.version.id}`,
        `@prompt:${prompt.item.id}`,
      ].join(" | ");
      const result = await resolveCanvasPromptReferences(db, { actorScope: fixture.scope, sourcePrompt });

      assert.equal(result.sourcePrompt, sourcePrompt);
      assert.match(result.expandedPrompt, /red-coated heroine/);
      assert.match(result.expandedPrompt, /black ink line art/);
      assert.match(result.expandedPrompt, /compose a readable storyboard/);
      assert.match(result.expandedPrompt, /soft cinematic rim lighting/);
      assert.deepEqual(result.references.map((item) => item.type), ["asset", "style", "skill", "prompt"]);
      assert.equal(result.references.every((item) => /^[a-f0-9]{64}$/.test(item.contentHash)), true);
      assert.equal(result.references[0].resolvedVersionId, assetVersionId);
      assert.equal(result.references[1].resolvedVersionId, style.version.id);
      assert.equal(result.references[2].resolvedVersionId, skill.version.id);
    } finally {
      await db.close();
    }
  });

  it("uses the Canvas owner data domain for assigned members and rejects unavailable references", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const now = new Date("2026-07-25T08:30:00.000Z");
    try {
      const style = await createCanvasUserConfig(db, {
        userId: fixture.userId,
        type: "style",
        name: "Owner style",
        manifest: { prompt: "owner approved style" },
        now,
      });
      const memberScope: CanvasActorScope = {
        ...fixture.scope,
        principal: "team_member",
        actorTeamMemberId: randomUUID(),
        principalKey: `member:${randomUUID()}`,
        capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun],
      };
      const allowed = await resolveCanvasPromptReferences(db, {
        actorScope: memberScope,
        sourcePrompt: `Use @style:${style.config.id}`,
      });
      assert.equal(allowed.expandedPrompt, "Use owner approved style");

      await assert.rejects(
        resolveCanvasPromptReferences(db, {
          actorScope: memberScope,
          sourcePrompt: `Use @style:${randomUUID()}`,
        }),
        (error: unknown) => error instanceof CanvasPromptReferenceError
          && error.code === "canvas_prompt_reference_unavailable",
      );
      await assert.rejects(
        resolveCanvasPromptReferences(db, {
          actorScope: memberScope,
          sourcePrompt: "Use @model:gpt-image-by-display-name",
        }),
        (error: unknown) => error instanceof CanvasPromptReferenceError
          && error.code === "canvas_prompt_reference_unavailable"
          && error.reference?.id === "gpt-image-by-display-name",
      );
    } finally {
      await db.close();
    }
  });

  it("resolves node, model, voice, and independent drama assets by stable id and version", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const now = new Date("2026-07-25T09:00:00.000Z");
    try {
      const nodeKey = "story-source";
      const documentId = randomUUID();
      const revisionId = randomUUID();
      const modelId = randomUUID();
      const modelRevisionId = randomUUID();
      const voiceId = randomUUID();
      const dramaId = randomUUID();
      const document = {
        version: 2,
        canvasProjectId: fixture.canvasId,
        nodes: [{ id: nodeKey, type: "text", title: "Source", data: { text: "rainy rooftop confrontation" } }],
        edges: [],
      };
      await db.query(`
        INSERT INTO creator_canvas_nodes
          (id,canvas_project_id,node_key,node_type,title,data_json,created_by_user_id,updated_by_user_id,created_at,updated_at)
        VALUES ($1,$2,$3,'text','Source',$4::jsonb,$5,$5,$6,$6)
      `, [randomUUID(), fixture.canvasId, nodeKey, JSON.stringify({ text: "rainy rooftop confrontation" }), fixture.userId, now]);
      await db.query(`
        INSERT INTO creator_canvas_documents
          (id,canvas_project_id,schema_version,server_revision,document_json,node_count,edge_count,created_by_user_id,updated_by_user_id,created_at,updated_at)
        VALUES ($1,$2,2,3,$3::jsonb,1,0,$4,$4,$5,$5)
      `, [documentId, fixture.canvasId, JSON.stringify(document), fixture.userId, now]);
      await db.query(`
        INSERT INTO creator_canvas_revisions
          (id,canvas_project_id,server_revision,operation,document_json,created_by_user_id,created_at)
        VALUES ($1,$2,3,'update',$3::jsonb,$4,$5)
      `, [revisionId, fixture.canvasId, JSON.stringify(document), fixture.userId, now]);
      await db.query(
        "UPDATE creator_canvas_projects SET latest_document_id=$2,server_revision=3,updated_at=$3 WHERE id=$1",
        [fixture.canvasId, documentId, now],
      );
      await db.query(`
        INSERT INTO ai_model_configs (
          id,model_code,display_name,provider_name,provider_model,provider_protocol,invocation_mode,media_type,
          task_modes_json,capabilities_json,parameter_schema_json,default_params_json,provider_config_json,
          pricing_json,limits_json,ui_config_json,status,sort_order,created_at,updated_at
        ) VALUES ($1,'canvas-prompt-image','Canvas Prompt Image','test','image-v1','custom_http','sync','image',
          '[]'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
          'active',0,$2,$2)
      `, [modelId, now]);
      await db.query(`
        INSERT INTO ai_model_config_revisions (id,model_config_id,snapshot_json,reason,created_at)
        VALUES ($1,$2,$3::jsonb,'prompt reference test',$4)
      `, [modelRevisionId, modelId, JSON.stringify({ modelCode: "canvas-prompt-image", mediaType: "image" }), now]);
      await db.query(`
        INSERT INTO team_assets (
          id,admin_user_id,asset_name,asset_prompt,asset_category,asset_status,asset_url,resource_type,resource_size,
          created_at,updated_at,created_by_name,updated_by_name,is_admin_created,created_user_id
        ) VALUES
          ($1,$3,'Narrator','calm low narrator voice','voice','active','https://cdn.test/voice.mp3','audio',10,$4,$4,'owner','owner',false,$3),
          ($2,$3,'Heroine','red-coated heroine, silver hair','character','active','https://cdn.test/hero.png','image',20,$4,$4,'owner','owner',false,$3)
      `, [voiceId, dramaId, fixture.userId, now]);

      const sourcePrompt = [
        `@node:${nodeKey}@${revisionId}`,
        `@model:${modelId}@${modelRevisionId}`,
        `@voice:${voiceId}`,
        `@drama:${dramaId}`,
      ].join(" | ");
      const result = await resolveCanvasPromptReferences(db, { actorScope: fixture.scope, sourcePrompt });

      assert.match(result.expandedPrompt, /rainy rooftop confrontation/);
      assert.match(result.expandedPrompt, /\[model:canvas-prompt-image\]/);
      assert.match(result.expandedPrompt, /calm low narrator voice/);
      assert.match(result.expandedPrompt, /red-coated heroine, silver hair/);
      assert.deepEqual(result.references.map((item) => item.type), ["node", "model", "voice", "drama"]);
      assert.equal(result.references[0].resolvedVersionId, revisionId);
      assert.equal(result.references[1].resolvedVersionId, modelRevisionId);
      assert.deepEqual(result.expansionOrder, CANVAS_PROMPT_EXPANSION_ORDER);
      assert.deepEqual(result.executionBindings.model, {
        kind: "model",
        modelConfigId: modelId,
        modelCode: "canvas-prompt-image",
        modelConfigRevisionId: modelRevisionId,
        contentHash: result.references[1].contentHash,
      });
      assert.deepEqual(result.executionBindings.voice, {
        kind: "voice",
        voiceAssetId: voiceId,
        versionHash: result.references[2].contentHash,
        contentHash: result.references[2].contentHash,
      });
      assert.deepEqual(result.readDependencies, [{
        kind: "canvas_node_read",
        nodeKey,
        documentVersionId: revisionId,
        serverRevision: 3,
        contentHash: result.references[0].contentHash,
        mode: "snapshot",
      }]);
    } finally {
      await db.close();
    }
  });

  it("resolves Canvas character single and merge-all references into stable generation bindings", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const now = new Date("2026-07-25T09:30:00.000Z");
    const characterId = randomUUID();
    const frontReferenceId = randomUUID();
    const sideReferenceId = randomUUID();
    const frontAssetId = randomUUID();
    const sideAssetId = randomUUID();
    const frontVersionId = randomUUID();
    const sideVersionId = randomUUID();
    try {
      await db.query(`
        INSERT INTO assets (id,canvas_project_id,asset_type,asset_key,created_by_user_id,created_at,updated_at)
        VALUES
          ($1,$3,'shot_image','character-front',$4,$5,$5),
          ($2,$3,'shot_image','character-side',$4,$5,$5)
      `, [frontAssetId, sideAssetId, fixture.canvasId, fixture.userId, now]);
      await db.query(`
        INSERT INTO asset_versions (
          id,asset_id,version_number,storage_object_key,metadata_json,created_by_user_id,created_at
        ) VALUES
          ($1,$3,1,'canvas/character-front.png','{}'::jsonb,$5,$6),
          ($2,$4,1,'canvas/character-side.png','{}'::jsonb,$5,$6)
      `, [frontVersionId, sideVersionId, frontAssetId, sideAssetId, fixture.userId, now]);
      await db.query(`
        INSERT INTO canvas_character_assets (
          id,owner_user_id,scope,canvas_id,principal_key,name,prompt_text,
          created_by_principal_key,updated_by_principal_key,created_at,updated_at
        ) VALUES ($1,$2,'canvas',$3,NULL,'任小野','清瘦少年，旧布短衣',$4,$4,$5,$5)
      `, [characterId, fixture.userId, fixture.canvasId, fixture.scope.principalKey, now]);
      await db.query(`
        INSERT INTO canvas_character_asset_references (
          id,character_id,position,usage,prompt_text,is_primary,is_avatar,asset_version_id,
          created_by_principal_key,updated_by_principal_key,created_at,updated_at
        ) VALUES
          ($1,$3,0,'正面','正面全身',true,true,$4,$6,$6,$7,$7),
          ($2,$3,1,'侧面','侧面半身',false,false,$5,$6,$6,$7,$7)
      `, [
        frontReferenceId,
        sideReferenceId,
        characterId,
        frontVersionId,
        sideVersionId,
        fixture.scope.principalKey,
        now,
      ]);

      const single = await resolveCanvasPromptReferences(db, {
        actorScope: fixture.scope,
        sourcePrompt: `@drama:${characterId}@${sideReferenceId}`,
      });
      assert.match(single.expandedPrompt, /清瘦少年，旧布短衣/);
      assert.match(single.expandedPrompt, /侧面半身/);
      assert.doesNotMatch(single.expandedPrompt, /正面全身/);
      assert.deepEqual(single.executionBindings.drama[0]?.references, [{
        referenceId: sideReferenceId,
        storageObjectId: null,
        assetVersionId: sideVersionId,
      }]);

      const merged = await resolveCanvasPromptReferences(db, {
        actorScope: fixture.scope,
        sourcePrompt: `@drama:${characterId}@all`,
      });
      assert.match(merged.expandedPrompt, /正面全身/);
      assert.match(merged.expandedPrompt, /侧面半身/);
      assert.equal(merged.references[0]?.requestedVersion, "all");
      assert.deepEqual(merged.executionBindings.drama[0]?.references, [
        { referenceId: frontReferenceId, storageObjectId: null, assetVersionId: frontVersionId },
        { referenceId: sideReferenceId, storageObjectId: null, assetVersionId: sideVersionId },
      ]);
      const memberScope: CanvasActorScope = {
        ...fixture.scope,
        principal: "team_member",
        actorTeamMemberId: randomUUID(),
        principalKey: `member:${randomUUID()}`,
        capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun],
      };
      const memberResolved = await resolveCanvasPromptReferences(db, {
        actorScope: memberScope,
        sourcePrompt: `@drama:${characterId}@all`,
      });
      assert.deepEqual(memberResolved.executionBindings.drama[0]?.references, merged.executionBindings.drama[0]?.references);
      const existingVersionId = randomUUID();
      const storageObjectId = randomUUID();
      assert.deepEqual(applyCanvasPromptDramaBindings(
        { referenceAssetVersionIds: [existingVersionId], referenceImages: ["existing-reference"] },
        [
          merged.executionBindings.drama[0]!,
          {
            kind: "drama",
            characterId: randomUUID(),
            selector: "all",
            contentHash: "storage-only",
            references: [
              { referenceId: randomUUID(), storageObjectId, assetVersionId: null },
              { referenceId: randomUUID(), storageObjectId, assetVersionId: null },
            ],
          },
        ],
      ), {
        referenceAssetVersionIds: [existingVersionId, frontVersionId, sideVersionId],
        referenceImages: [
          "existing-reference",
          {
            storageObjectId,
            url: `/api/storage/objects/${storageObjectId}/content`,
          },
        ],
      });
    } finally {
      await db.close();
    }
  });

  it("expands nested references deterministically and reports the complete cycle chain", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const now = new Date("2026-07-25T09:30:00.000Z");
    try {
      const style = await createCanvasUserConfig(db, {
        userId: fixture.userId,
        type: "style",
        name: "Cycle",
        manifest: { prompt: "initial" },
        now,
      });
      const second = await createCanvasUserConfigVersion(db, {
        userId: fixture.userId,
        configId: style.config.id,
        manifest: { prompt: `@style:${style.config.id}@2` },
        now: new Date(now.getTime() + 1000),
      });
      await assert.rejects(
        resolveCanvasPromptReferences(db, {
          actorScope: fixture.scope,
          sourcePrompt: `@style:${style.config.id}@${second.version}`,
        }),
        (error: unknown) => error instanceof CanvasPromptReferenceError
          && error.code === "canvas_prompt_reference_cycle"
          && error.reference?.path?.join(" -> ") === `style:${style.config.id}@2 -> style:${style.config.id}@2`,
      );
    } finally {
      await db.close();
    }
  });

  it("expands authoritative slash, preset, and suffix directives around server-resolved references", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    const now = new Date("2026-07-25T09:45:00.000Z");
    try {
      const style = await createCanvasUserConfig(db, {
        userId: fixture.userId,
        type: "style",
        name: "Directive Ink",
        manifest: { prompt: "black ink linework" },
        now,
      });
      const catalog = {
        slashCommands: [directive("compose", "1", "compose one clear frame")],
        presets: [directive("preset-a", "3", `portrait @style:${style.config.id}@${style.version.id}`)],
        suffixes: [directive(fixture.canvasId, "7", "no watermark")],
      };
      const contract = {
        schemaVersion: 1,
        slashCommands: [{ id: "compose", version: "1" }],
        presets: [{ id: "preset-a", version: "3" }],
        suffixes: [{ id: fixture.canvasId, version: "7" }],
      };
      const expandedDirectives = expandCanvasPromptDirectives({
        sourcePrompt: "hero on a rooftop",
        directives: contract,
        catalog,
      });
      assert.equal(
        expandedDirectives.promptWithPrefixes,
        `compose one clear frame\nportrait @style:${style.config.id}@${style.version.id}\nhero on a rooftop`,
      );
      assert.equal(expandedDirectives.suffixText, "no watermark");

      const result = await resolveCanvasPromptWithDirectives(db, {
        actorScope: fixture.scope,
        sourcePrompt: "hero on a rooftop",
        directives: contract,
        directiveCatalog: catalog,
      });
      assert.equal(
        result.expandedPrompt,
        "compose one clear frame\nportrait black ink linework\nhero on a rooftop\nno watermark",
      );
      assert.equal(result.sourcePrompt, "hero on a rooftop");
      assert.deepEqual(result.directives.map((item) => item.stage), ["slash_command", "preset", "suffix"]);
      assert.equal(result.references[0].resolvedVersionId, style.version.id);

      assert.throws(
        () => expandCanvasPromptDirectives({
          sourcePrompt: "test",
          directives: contract,
          catalog: { ...catalog, suffixes: [{ ...catalog.suffixes[0], contentHash: "0".repeat(64) }] },
        }),
        (error: unknown) => error instanceof CanvasPromptReferenceError
          && error.code === "canvas_prompt_directive_hash_mismatch",
      );
    } finally {
      await db.close();
    }
  });
});

it("defines stable-id-only slash command, preset, and suffix expansion contracts", () => {
  assert.deepEqual(CANVAS_PROMPT_EXPANSION_ORDER, [
    "slash_command", "preset", "skill", "style", "reference", "suffix",
  ]);
  assert.deepEqual(validateCanvasPromptExpansionDirectiveContract({
    schemaVersion: 1,
    slashCommands: [{ id: "command-1", version: "2" }],
    presets: [{ id: "preset-1", version: "5" }],
    suffixes: [{ id: "suffix-1", version: "3" }],
  }), {
    schemaVersion: 1,
    slashCommands: [{ id: "command-1", version: "2" }],
    presets: [{ id: "preset-1", version: "5" }],
    suffixes: [{ id: "suffix-1", version: "3" }],
  });
  assert.throws(
    () => validateCanvasPromptExpansionDirectiveContract({
      schemaVersion: 1,
      slashCommands: [{ id: "command-1", version: "2", content: "untrusted text" }],
      presets: [],
      suffixes: [],
    }),
    (error: unknown) => error instanceof CanvasPromptReferenceError
      && error.code === "canvas_prompt_expansion_contract_invalid",
  );
});

async function seedCanvas(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const userId = randomUUID();
  const canvasId = randomUUID();
  await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [userId]);
  await db.query(`
    INSERT INTO creator_canvas_projects
      (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
    VALUES ($1,'Prompt references','active',1,$2,$2)
  `, [canvasId, userId]);
  const scope: CanvasActorScope = {
    canvasId,
    ownerUserId: userId,
    principal: "owner",
    actorTeamMemberId: null,
    principalKey: `owner:${userId}`,
    capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
  };
  return { userId, canvasId, scope };
}

function directive(id: string, version: string, content: string) {
  return {
    id,
    version,
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
    status: "active" as const,
  };
}
