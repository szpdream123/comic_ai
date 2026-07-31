import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { grantCredits } from "../../credit-billing/credit-ledger.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { CanvasAgentBillingService } from "../canvas-agent-billing.service.ts";
import { CanvasAgentRepairService } from "../canvas-agent-repair.service.ts";
import {
  createCanvasAgentStep,
  createCanvasAgentTask,
  updateCanvasAgentStep,
} from "../canvas-agent-task.service.ts";
import type { CanvasAgentActor } from "../canvas-agent.types.ts";

const startedAt = new Date("2026-07-26T09:00:00.000Z");
const repairedAt = new Date("2026-07-26T09:05:00.000Z");

test("owner round settles the reservation from actual token usage", async () => {
  const db = await createMigratedTestDb();
  try {
    const fixture = await createRunningModelRound(db, null);
    await grantCredits(db, {
      userId: fixture.ownerUserId,
      amount: 100,
      sourceType: "test_credit_seed",
      sourceId: randomUUID(),
      reason: "Canvas Agent actual usage test",
      now: startedAt,
    });
    const billing = new CanvasAgentBillingService(db);
    const pricing = { canvasAgentTokenCreditsPerMillion: 1_000_000 };
    assert.equal(billing.estimateRound({ pricing, maxTokens: 2, contextWindow: 100 }), 100);
    assert.equal(billing.estimateRound({ pricing, maxTokens: 2, maxPromptTokens: 100 }), 102);
    assert.equal(billing.estimateRound({ pricing: { ...pricing, baseCredits: 999 }, contextWindow: 100 }), 100);
    assert.throws(
      () => billing.estimateRound({ pricing: { baseCredits: 999 }, contextWindow: 100 }),
      /canvas_agent_token_price_missing/,
    );
    assert.throws(
      () => billing.estimateRound({ pricing: { ...pricing, canvasAgentBillingMode: "fixed" }, contextWindow: 100 }),
      /canvas_agent_token_billing_mode_invalid/,
    );
    const reservation = await billing.reserveRound({
      ownerUserId: fixture.ownerUserId,
      canvasId: fixture.canvasId,
      agentTaskId: fixture.task.id,
      workflowId: fixture.task.workflowId,
      workflowTaskId: fixture.task.workflowTaskId,
      stepId: fixture.stepId,
      amount: 10,
      now: startedAt,
    });

    const settled = await billing.settleRound({
      ownerUserId: fixture.ownerUserId,
      canvasId: fixture.canvasId,
      agentTaskId: fixture.task.id,
      workflowTaskId: fixture.task.workflowTaskId,
      stepId: fixture.stepId,
      reservationId: reservation.reservationId,
      reservedAmount: 10,
      usage: { promptTokens: 2, completionTokens: 3, cachedTokens: 4, totalTokens: 5 },
      pricing,
      now: repairedAt,
    });

    const user = await db.query<{ credit_balance_cached: number | string }>(
      "SELECT credit_balance_cached FROM users WHERE id=$1",
      [fixture.ownerUserId],
    );
    const ledger = await db.query<{ reason: string }>(`
      SELECT reason FROM credit_ledger_entries
      WHERE user_id=$1 AND source_type='canvas_agent_text_round'
      LIMIT 1
    `, [fixture.ownerUserId]);
    assert.deepEqual(settled, { consumed: 9, released: 1 });
    assert.equal(Number(user.rows[0]?.credit_balance_cached), 91);
    assert.equal(ledger.rows[0]?.reason, "画布协作Agent操作消耗");
  } finally {
    await db.close();
  }
});

test("member round refunds the difference between reserved and actual token usage", async () => {
  const db = await createMigratedTestDb();
  const memberId = randomUUID();
  try {
    const fixture = await createRunningModelRound(db, memberId);
    const billing = new CanvasAgentBillingService(db);
    const pricing = { canvasAgentTokenCreditsPerMillion: 1_000_000 };
    const reservation = await billing.reserveRound({
      ownerUserId: fixture.ownerUserId,
      actorTeamMemberId: memberId,
      canvasId: fixture.canvasId,
      agentTaskId: fixture.task.id,
      workflowId: fixture.task.workflowId,
      workflowTaskId: fixture.task.workflowTaskId,
      stepId: fixture.stepId,
      amount: 10,
      now: startedAt,
    });

    const settled = await billing.settleRound({
      ownerUserId: fixture.ownerUserId,
      actorTeamMemberId: memberId,
      canvasId: fixture.canvasId,
      agentTaskId: fixture.task.id,
      workflowTaskId: fixture.task.workflowTaskId,
      stepId: fixture.stepId,
      reservationId: reservation.reservationId,
      reservedAmount: 10,
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      pricing,
      now: repairedAt,
    });

    const member = await db.query<{ member_credits: number | string }>(
      "SELECT member_credits FROM team_members WHERE id=$1",
      [memberId],
    );
    assert.deepEqual(settled, { consumed: 5, released: 5 });
    assert.equal(Number(member.rows[0]?.member_credits), 95);
  } finally {
    await db.close();
  }
});

test("member round reservation is idempotent after a crash before step writeback", async () => {
  const db = await createMigratedTestDb();
  const ownerUserId = randomUUID();
  const memberId = randomUUID();
  const stepId = randomUUID();
  try {
    await seedUserAndMember(db, ownerUserId, memberId, 100);
    const billing = new CanvasAgentBillingService(db);
    const input = {
      ownerUserId,
      actorTeamMemberId: memberId,
      canvasId: randomUUID(),
      agentTaskId: randomUUID(),
      stepId,
      amount: 7,
      now: startedAt,
    };

    const first = await billing.reserveRound(input);
    const replay = await billing.reserveRound(input);

    assert.equal(first.sourceId, replay.sourceId);
    const member = await db.query<{ member_credits: number | string }>(
      "SELECT member_credits FROM team_members WHERE id=$1",
      [memberId],
    );
    const ledger = await db.query<{ count: number | string }>(`
      SELECT count(*) AS count FROM credit_ledger_entries
      WHERE team_member_id=$1 AND source_type='canvas_agent_text_round'
        AND entry_type='transfer_out'
    `, [memberId]);
    assert.equal(Number(member.rows[0]?.member_credits), 93);
    assert.equal(Number(ledger.rows[0]?.count), 1);
  } finally {
    await db.close();
  }
});

test("lease repair releases an owner reservation even before its id is written to the step", async () => {
  const db = await createMigratedTestDb();
  try {
    const fixture = await createRunningModelRound(db, null);
    await grantCredits(db, {
      userId: fixture.ownerUserId,
      amount: 100,
      sourceType: "test_credit_seed",
      sourceId: randomUUID(),
      reason: "Canvas Agent repair test",
      now: startedAt,
    });
    const billing = new CanvasAgentBillingService(db);
    const reserved = await billing.reserveRound({
      ownerUserId: fixture.ownerUserId,
      actorTeamMemberId: null,
      canvasId: fixture.canvasId,
      agentTaskId: fixture.task.id,
      workflowId: fixture.task.workflowId,
      workflowTaskId: fixture.task.workflowTaskId,
      stepId: fixture.stepId,
      amount: 7,
      now: startedAt,
    });
    assert.ok(reserved.reservationId);

    const result = await new CanvasAgentRepairService({ db, now: () => repairedAt }).repairExpiredLeases();

    assert.deepEqual(result, { inspected: 1, repaired: 1 });
    const reservation = await db.query<{
      status: string;
      amount_released: number | string;
    }>("SELECT status,amount_released FROM credit_reservations WHERE id=$1", [reserved.reservationId]);
    const user = await db.query<{ credit_balance_cached: number | string }>(
      "SELECT credit_balance_cached FROM users WHERE id=$1",
      [fixture.ownerUserId],
    );
    await assertRoundRepaired(db, fixture.task.id, fixture.stepId);
    assert.equal(reservation.rows[0]?.status, "released");
    assert.equal(Number(reservation.rows[0]?.amount_released), 7);
    assert.equal(Number(user.rows[0]?.credit_balance_cached), 100);
  } finally {
    await db.close();
  }
});

test("lease repair refunds a member debit before requeueing the model round", async () => {
  const db = await createMigratedTestDb();
  const memberId = randomUUID();
  try {
    const fixture = await createRunningModelRound(db, memberId);
    const billing = new CanvasAgentBillingService(db);
    await billing.reserveRound({
      ownerUserId: fixture.ownerUserId,
      actorTeamMemberId: memberId,
      canvasId: fixture.canvasId,
      agentTaskId: fixture.task.id,
      workflowId: fixture.task.workflowId,
      workflowTaskId: fixture.task.workflowTaskId,
      stepId: fixture.stepId,
      amount: 7,
      now: startedAt,
    });

    const repair = new CanvasAgentRepairService({ db, now: () => repairedAt });
    assert.deepEqual(await repair.repairExpiredLeases(), { inspected: 1, repaired: 1 });
    assert.deepEqual(await repair.repairExpiredLeases(), { inspected: 0, repaired: 0 });

    const member = await db.query<{ member_credits: number | string }>(
      "SELECT member_credits FROM team_members WHERE id=$1",
      [memberId],
    );
    const refunds = await db.query<{ count: number | string }>(`
      SELECT count(*) AS count FROM credit_ledger_entries
      WHERE team_member_id=$1 AND source_type='team_member_generation_refund'
        AND entry_type='grant'
    `, [memberId]);
    await assertRoundRepaired(db, fixture.task.id, fixture.stepId);
    assert.equal(Number(member.rows[0]?.member_credits), 100);
    assert.equal(Number(refunds.rows[0]?.count), 1);
  } finally {
    await db.close();
  }
});

async function createRunningModelRound(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  memberId: string | null,
) {
  const ownerUserId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  if (memberId) {
    await seedUserAndMember(db, ownerUserId, memberId, 100);
  } else {
    await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [ownerUserId]);
  }
  await db.query(`
    INSERT INTO creator_canvas_projects
      (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
    VALUES ($1,'Agent billing repair','active',1,$2,$2)
  `, [canvasId, ownerUserId]);
  await db.query(`
    INSERT INTO canvas_agent_conversations
      (id,canvas_id,owner_user_id,actor_team_member_id,title,created_at,updated_at)
    VALUES ($1,$2,$3,$4,'Billing repair',$5,$5)
  `, [conversationId, canvasId, ownerUserId, memberId, startedAt]);
  const actor: CanvasAgentActor = {
    ownerUserId,
    actorTeamMemberId: memberId,
    capabilities: new Set(),
  };
  const task = await createCanvasAgentTask(db, {
    canvasId,
    conversationId,
    actor,
    mode: "b",
    modelCode: "agent-billing-test",
    modelConfigSnapshot: { pricing: { baseCredits: 7 } },
    baseRevision: 1,
    userMessage: { text: "billing repair" },
    now: startedAt,
  });
  const step = await createCanvasAgentStep(db, {
    taskId: task.id,
    kind: "model",
    effect: "read",
    input: { round: 1 },
    now: startedAt,
  });
  await updateCanvasAgentStep(db, { stepId: step.id, status: "running", now: startedAt });
  await db.query(`
    UPDATE canvas_agent_tasks
    SET status='running', lease_owner='crashed-worker', lease_expires_at=$2, updated_at=$2
    WHERE id=$1
  `, [task.id, new Date(startedAt.getTime() - 1_000)]);
  await db.query("UPDATE tasks SET status='running',updated_at=$2 WHERE id=$1", [task.workflowTaskId, startedAt]);
  await db.query("UPDATE workflows SET status='running',updated_at=$2 WHERE id=$1", [task.workflowId, startedAt]);
  return { ownerUserId, canvasId, task, stepId: step.id };
}

async function seedUserAndMember(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  ownerUserId: string,
  memberId: string,
  credits: number,
) {
  const account = `agent-${memberId.slice(0, 8)}`;
  const suffix = memberId.replace(/-/g, "").slice(0, 8);
  await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [ownerUserId]);
  await db.query(`
    INSERT INTO team_members (
      id,user_id,member_account,member_account_suffix,member_login_account,
      member_name,member_password_hash,member_credits,status
    ) VALUES ($1,$2,$3,$4,$5,'Agent Member','test-password-hash',$6,'active')
  `, [memberId, ownerUserId, account, suffix, `${account}@${suffix}`, credits]);
}

async function assertRoundRepaired(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  taskId: string,
  stepId: string,
) {
  const task = await db.query<{ status: string }>("SELECT status FROM canvas_agent_tasks WHERE id=$1", [taskId]);
  const step = await db.query<{ status: string; error_code: string | null }>(
    "SELECT status,error_code FROM canvas_agent_steps WHERE id=$1",
    [stepId],
  );
  assert.equal(task.rows[0]?.status, "queued");
  assert.deepEqual(step.rows[0], {
    status: "failed",
    error_code: "agent_lease_expired_before_provider_start",
  });
}
