import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { CanvasAgentContextService } from "../canvas-agent-context.service.ts";
import { CanvasAgentPromptPreferenceService } from "../canvas-agent-prompt-preference.service.ts";
import { createCanvasAgentStep, createCanvasAgentTask } from "../canvas-agent-task.service.ts";

const now = new Date("2026-07-26T12:00:00.000Z");

test("confirmed media prompt preferences cross Canvases but remain isolated by owner/member principal", async () => {
  const db = await createMigratedTestDb();
  const ownerUserId = randomUUID();
  const memberId = randomUUID();
  const firstCanvasId = randomUUID();
  const secondCanvasId = randomUUID();
  const ownerConversationId = randomUUID();
  const secondOwnerConversationId = randomUUID();
  const memberConversationId = randomUUID();
  const ownerActor = {
    ownerUserId,
    actorTeamMemberId: null,
    capabilities: new Set([
      capabilities.canvasView,
      capabilities.canvasEdit,
      capabilities.canvasRun,
      capabilities.canvasManage,
    ]),
  };
  const memberActor = {
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
      ) VALUES ($1,$2,'preference-member','pref001','preference-member@pref001','Preference Member','hash',0,'active')
    `, [memberId, ownerUserId]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES
        ($1,'Preference Canvas A','active',1,$3,$3),
        ($2,'Preference Canvas B','active',1,$3,$3)
    `, [firstCanvasId, secondCanvasId, ownerUserId]);
    await db.query(`
      INSERT INTO team_member_canvases (id,member_id,user_id,canvas_id)
      VALUES ($1,$2,$3,$4),($5,$2,$3,$6)
    `, [randomUUID(), memberId, ownerUserId, firstCanvasId, randomUUID(), secondCanvasId]);
    await db.query(`
      INSERT INTO canvas_agent_conversations (
        id,canvas_id,owner_user_id,actor_team_member_id,title,created_at,updated_at
      ) VALUES
        ($1,$4,$6,NULL,'Owner A',$7,$7),
        ($2,$5,$6,NULL,'Owner B',$7,$7),
        ($3,$4,$6,$8,'Member A',$7,$7)
    `, [
      ownerConversationId, secondOwnerConversationId, memberConversationId,
      firstCanvasId, secondCanvasId, ownerUserId, now, memberId,
    ]);
    const ownerTask = await createCanvasAgentTask(db, {
      canvasId: firstCanvasId, conversationId: ownerConversationId, actor: ownerActor,
      mode: "b", modelCode: "agent-test", modelConfigSnapshot: {}, baseRevision: 1,
      userMessage: { text: "remember owner image preference" }, now,
    });
    const ownerStep = await createCanvasAgentStep(db, {
      taskId: ownerTask.id, kind: "tool", toolId: "preference.learn_media_prompt",
      callId: "owner-preference", effect: "memory_write",
      input: { mediaKind: "image", instruction: "Use clean rim light", confirmed: true }, now,
    });
    const memberTask = await createCanvasAgentTask(db, {
      canvasId: firstCanvasId, conversationId: memberConversationId, actor: memberActor,
      mode: "b", modelCode: "agent-test", modelConfigSnapshot: {}, baseRevision: 1,
      userMessage: { text: "remember member video preference" }, now,
    });
    const memberStep = await createCanvasAgentStep(db, {
      taskId: memberTask.id, kind: "tool", toolId: "preference.learn_media_prompt",
      callId: "member-preference", effect: "memory_write",
      input: { mediaKind: "video", instruction: "Prefer slow camera moves", confirmed: true }, now,
    });
    const service = new CanvasAgentPromptPreferenceService(db);
    await assert.rejects(() => service.learn({
      canvasId: firstCanvasId, conversationId: ownerConversationId,
      taskId: ownerTask.id, stepId: ownerStep.id, actor: ownerActor,
      mediaKind: "image", instruction: "Do not persist", confirmed: false, now,
    }), /canvas_agent_prompt_preference_confirmation_required/);
    const ownerPreference = await service.learn({
      canvasId: firstCanvasId, conversationId: ownerConversationId,
      taskId: ownerTask.id, stepId: ownerStep.id, actor: ownerActor,
      mediaKind: "image", preferenceKey: "image.lighting",
      instruction: "Use clean rim light", tags: ["lighting", "cinematic", "lighting"],
      confirmed: true, now,
    });
    const memberPreference = await service.learn({
      canvasId: firstCanvasId, conversationId: memberConversationId,
      taskId: memberTask.id, stepId: memberStep.id, actor: memberActor,
      mediaKind: "video", preferenceKey: "video.camera",
      instruction: "Prefer slow camera moves", tags: ["camera"], confirmed: true, now,
    });
    assert.deepEqual(ownerPreference.tags, ["lighting", "cinematic"]);
    assert.equal(memberPreference.mediaKind, "video");

    const ownerFromSecondCanvas = await service.list({ canvasId: secondCanvasId, actor: ownerActor });
    const memberFromSecondCanvas = await service.list({ canvasId: secondCanvasId, actor: memberActor });
    assert.deepEqual(ownerFromSecondCanvas.map((item) => item.preferenceKey), ["image.lighting"]);
    assert.deepEqual(memberFromSecondCanvas.map((item) => item.preferenceKey), ["video.camera"]);

    const context = new CanvasAgentContextService({
      db,
      loadCanvasContext: async () => ({ canvasId: secondCanvasId, nodes: [], edges: [] }),
      promptPreferences: service,
      now: () => now,
    });
    const built = await context.build({
      canvasId: secondCanvasId,
      conversationId: secondOwnerConversationId,
      actor: ownerActor,
    });
    assert.deepEqual(built.mediaPromptPreferences.map((item) => item.preferenceKey), ["image.lighting"]);

    await assert.rejects(() => service.revoke({
      canvasId: secondCanvasId,
      actor: ownerActor,
      preferenceId: memberPreference.id,
      now,
    }), /canvas_agent_prompt_preference_not_found/);
    await service.revoke({
      canvasId: secondCanvasId,
      actor: ownerActor,
      preferenceId: ownerPreference.id,
      now,
    });
    assert.deepEqual(await service.list({ canvasId: firstCanvasId, actor: ownerActor }), []);
    assert.equal((await service.list({ canvasId: firstCanvasId, actor: memberActor })).length, 1);
  } finally {
    await db.close();
  }
});
