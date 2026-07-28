import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { getCanvasSettings, updateCanvasSettings } from "../../project/canvas-settings.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { CanvasAgentProviderConfigService } from "../canvas-agent-provider-config.service.ts";
import { createCanvasAgentStep, createCanvasAgentTask } from "../canvas-agent-task.service.ts";

test("provider config drafts apply only active models to Canvas-local settings with revision checks", async () => {
  const db = await createMigratedTestDb();
  const userId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const modelId = randomUUID();
  const actor = {
    ownerUserId: userId,
    actorTeamMemberId: null,
    capabilities: new Set([capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun]),
  };
  const scope = {
    canvasId,
    ownerUserId: userId,
    principal: "owner" as const,
    actorTeamMemberId: null,
    principalKey: `owner:${userId}`,
    capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
  };
  try {
    await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [userId]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Config Canvas','active',1,$2,$2)
    `, [canvasId, userId]);
    await db.query(`
      INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title,created_at,updated_at)
      VALUES ($1,$2,$3,'Config',now(),now())
    `, [conversationId, canvasId, userId]);
    await db.query(`
      INSERT INTO ai_model_configs (
        id,model_code,display_name,provider_name,provider_model,provider_protocol,
        invocation_mode,media_type,task_modes_json,capabilities_json,parameter_schema_json,
        default_params_json,provider_config_json,pricing_json,limits_json,ui_config_json,status
      ) VALUES ($1,'image-safe-model','Image Safe','test','image-safe','openai_images',
        'sync','image','["image.generate"]'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'active')
    `, [modelId]);
    const task = await createCanvasAgentTask(db, {
      canvasId, conversationId, actor, mode: "b", modelCode: "agent-model",
      modelConfigSnapshot: {}, baseRevision: 1, userMessage: { text: "change defaults" }, now: new Date(),
    });
    const step = await createCanvasAgentStep(db, {
      taskId: task.id, kind: "tool", toolId: "provider.config_draft", callId: "config-draft-1",
      effect: "config_write", input: { modelCode: "image-safe-model" }, now: new Date(),
    });
    const service = new CanvasAgentProviderConfigService(db);
    const draft = await service.createDraft({
      canvasId, conversationId, actor, taskId: task.id, stepId: step.id,
      modelCode: "image-safe-model", mediaKind: "image", generation: { imageAspectRatio: "16:9", imageSize: "2K" }, now: new Date(),
    });
    assert.equal(draft.status, "draft");
    assert.deepEqual(draft.settingsPatch, {
      defaultModels: { image: "image-safe-model" },
      generation: { imageAspectRatio: "16:9", imageSize: "2K" },
    });
    const applied = await service.applyDraft({ draftId: draft.id, canvasId, conversationId, actor, now: new Date() });
    assert.equal(applied.status, "applied");
    assert.equal(applied.appliedSettingsRevision, 2);
    const settings = await getCanvasSettings(db, { actorScope: scope });
    assert.equal(settings.settings.defaultModels.image, "image-safe-model");
    assert.equal(settings.settings.generation.imageAspectRatio, "16:9");
    assert.equal((await service.applyDraft({ draftId: draft.id, canvasId, conversationId, actor, now: new Date() })).status, "applied");

    const repeated = await service.createDraft({
      canvasId, conversationId, actor, taskId: task.id, stepId: step.id,
      modelCode: "image-safe-model", mediaKind: "image", generation: { imageAspectRatio: "16:9", imageSize: "2K" }, now: new Date(),
    });
    assert.equal(repeated.id, draft.id);
    await assert.rejects(() => service.createDraft({
      canvasId, conversationId, actor, taskId: task.id, stepId: step.id,
      modelCode: "image-safe-model", mediaKind: "image", generation: { imageAspectRatio: "1:1", imageSize: "1K" }, now: new Date(),
    }), /canvas_agent_provider_config_idempotency_conflict/);

    const invalidStep = await createCanvasAgentStep(db, {
      taskId: task.id, kind: "tool", toolId: "provider.config_draft", callId: "config-draft-invalid",
      effect: "config_write", input: {
        modelCode: "image-safe-model", mediaKind: "image", generation: { apiKey: "forbidden" },
      }, now: new Date(),
    });
    await assert.rejects(() => service.createDraft({
      canvasId, conversationId, actor, taskId: task.id, stepId: invalidStep.id,
      modelCode: "image-safe-model", mediaKind: "image", generation: { apiKey: "forbidden" }, now: new Date(),
    }), /canvas_agent_provider_config_field_not_allowed/);

    const conflictStep = await createCanvasAgentStep(db, {
      taskId: task.id, kind: "tool", toolId: "provider.config_draft", callId: "config-draft-conflict",
      effect: "config_write", input: {
        modelCode: "image-safe-model", mediaKind: "image", generation: { imageSize: "4K" },
      }, now: new Date(),
    });
    const conflictDraft = await service.createDraft({
      canvasId, conversationId, actor, taskId: task.id, stepId: conflictStep.id,
      modelCode: "image-safe-model", mediaKind: "image", generation: { imageSize: "4K" }, now: new Date(),
    });
    await updateCanvasSettings(db, {
      actorScope: scope,
      expectedRevision: 2,
      patch: { generation: { imageSize: "3K" } },
      now: new Date(),
    });
    await assert.rejects(
      () => service.applyDraft({ draftId: conflictDraft.id, canvasId, conversationId, actor, now: new Date() }),
      /canvas_agent_provider_config_revision_conflict/,
    );

    const disabledStep = await createCanvasAgentStep(db, {
      taskId: task.id, kind: "tool", toolId: "provider.config_draft", callId: "config-draft-disabled",
      effect: "config_write", input: { modelCode: "image-safe-model", mediaKind: "image" }, now: new Date(),
    });
    const disabledDraft = await service.createDraft({
      canvasId, conversationId, actor, taskId: task.id, stepId: disabledStep.id,
      modelCode: "image-safe-model", mediaKind: "image", generation: {}, now: new Date(),
    });
    await db.query("UPDATE ai_model_configs SET status='disabled' WHERE id=$1", [modelId]);
    await assert.rejects(
      () => service.applyDraft({ draftId: disabledDraft.id, canvasId, conversationId, actor, now: new Date() }),
      /canvas_agent_provider_config_model_not_found/,
    );
  } finally {
    await db.close();
  }
});

test("provider config drafts reject a member after the Canvas assignment is revoked", async () => {
  const db = await createMigratedTestDb();
  const ownerUserId = randomUUID();
  const memberId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const modelId = randomUUID();
  const actor = {
    ownerUserId,
    actorTeamMemberId: memberId,
    capabilities: new Set([capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun]),
  };
  try {
    await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [ownerUserId]);
    await db.query(`
      INSERT INTO team_members (
        id,user_id,member_account,member_account_suffix,member_login_account,
        member_name,member_password_hash,member_credits,status
      ) VALUES ($1,$2,'canvas-config-member','cfg001','canvas-config-member@cfg001','Canvas Config Member','hash',0,'active')
    `, [memberId, ownerUserId]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Assigned Config Canvas','active',1,$2,$2)
    `, [canvasId, ownerUserId]);
    await db.query(
      "INSERT INTO team_member_canvases (id,member_id,user_id,canvas_id) VALUES ($1,$2,$3,$4)",
      [randomUUID(), memberId, ownerUserId, canvasId],
    );
    await db.query(`
      INSERT INTO canvas_agent_conversations (
        id,canvas_id,owner_user_id,actor_team_member_id,title,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,'Member Config',now(),now())
    `, [conversationId, canvasId, ownerUserId, memberId]);
    await db.query(`
      INSERT INTO ai_model_configs (
        id,model_code,display_name,provider_name,provider_model,provider_protocol,
        invocation_mode,media_type,task_modes_json,capabilities_json,parameter_schema_json,
        default_params_json,provider_config_json,pricing_json,limits_json,ui_config_json,status
      ) VALUES ($1,'member-image-model','Member Image','test','member-image','openai_images',
        'sync','image','["image.generate"]'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'active')
    `, [modelId]);
    const task = await createCanvasAgentTask(db, {
      canvasId, conversationId, actor, mode: "b", modelCode: "agent-model",
      modelConfigSnapshot: {}, baseRevision: 1, userMessage: { text: "change member defaults" }, now: new Date(),
    });
    const step = await createCanvasAgentStep(db, {
      taskId: task.id, kind: "tool", toolId: "provider.config_draft", callId: "member-config-draft",
      effect: "config_write", input: { modelCode: "member-image-model" }, now: new Date(),
    });
    const service = new CanvasAgentProviderConfigService(db);
    const draft = await service.createDraft({
      canvasId, conversationId, actor, taskId: task.id, stepId: step.id,
      modelCode: "member-image-model", mediaKind: "image", generation: {}, now: new Date(),
    });

    await db.query("DELETE FROM team_member_canvases WHERE member_id=$1 AND canvas_id=$2", [memberId, canvasId]);
    await assert.rejects(
      () => service.applyDraft({ draftId: draft.id, canvasId, conversationId, actor, now: new Date() }),
      /canvas_not_found/,
    );
  } finally {
    await db.close();
  }
});
