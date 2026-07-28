import assert from "node:assert/strict";
import test from "node:test";

import type { SqlDatabase } from "../../shared/db/sql.ts";
import type { AttemptRecord, TaskRecord } from "../../workflow-task/workflow-task.service.ts";
import type { CanvasAgentTaskRecord } from "../canvas-agent.types.ts";
import { CanvasAgentWorker } from "../canvas-agent.worker.ts";

const now = new Date("2026-07-25T08:00:00.000Z");
const agentTaskId = "10000000-0000-4000-8000-000000000001";
const workflowTaskId = "20000000-0000-4000-8000-000000000001";
const attempt: AttemptRecord = {
  id: "30000000-0000-4000-8000-000000000001",
  taskId: workflowTaskId,
  attemptNumber: 1,
  status: "running",
};
const workflowTask: TaskRecord = {
  id: workflowTaskId,
  userId: "40000000-0000-4000-8000-000000000001",
  projectId: null,
  canvasProjectId: "50000000-0000-4000-8000-000000000001",
  workflowId: "60000000-0000-4000-8000-000000000001",
  taskType: "canvas_agent.execute",
  status: "running",
  queueName: "canvas-agent",
  attemptCount: 1,
};

test("worker finalizes a succeeded Canvas Agent attempt", async () => {
  const finalized: string[] = [];
  let observedAttemptId: string | null | undefined;
  const worker = createWorker({
    execute: async (_taskId, input) => {
      observedAttemptId = input?.attemptId;
      return agentTask("succeeded");
    },
    finalizeAttempt: async (_db, input) => {
      finalized.push(input.status);
    },
  });

  const result = await worker.processTask(agentTaskId);

  assert.equal(result.status, "succeeded");
  assert.equal(observedAttemptId, attempt.id);
  assert.deepEqual(finalized, ["succeeded"]);
});

test("worker closes the attempt without finalizing while waiting for external generation", async () => {
  const released: string[] = [];
  const finalized: string[] = [];
  const worker = createWorker({
    execute: async () => agentTask("waiting_external"),
    releaseAttempt: async (_db, input) => {
      released.push(input.reason ?? "");
    },
    finalizeAttempt: async (_db, input) => {
      finalized.push(input.status);
    },
  });

  const result = await worker.processTask(agentTaskId);

  assert.equal(result.status, "waiting_external");
  assert.deepEqual(released, ["canvas_agent_waiting_external"]);
  assert.deepEqual(finalized, []);
});

test("worker preserves an uncertain externally-started run as result_unknown", async () => {
  const finalized: string[] = [];
  const transitions: string[] = [];
  const worker = createWorker({
    execute: async () => {
      throw new Error("connection_closed");
    },
    findTask: async () => agentTask("running"),
    hasExternalSubmission: async () => true,
    transitionTask: async (_db, input) => {
      transitions.push(input.to);
      return agentTask("result_unknown", "canvas_agent_worker_result_unknown");
    },
    finalizeAttempt: async (_db, input) => {
      finalized.push(input.status);
    },
  });

  const result = await worker.processTask(agentTaskId);

  assert.equal(result.status, "result_unknown");
  assert.deepEqual(transitions, ["result_unknown"]);
  assert.deepEqual(finalized, ["result_unknown"]);
});

test("worker cycle repairs expired leases before processing queued tasks", async () => {
  const calls: string[] = [];
  const worker = createWorker({
    repairExpiredLeases: async () => {
      calls.push("repair");
      return { inspected: 1, repaired: 1 };
    },
    resumeCompletedGenerations: async () => {
      calls.push("resume-generation");
      return { inspected: 1, resumed: 1 };
    },
    listQueuedTaskIds: async () => {
      calls.push("list");
      return [];
    },
  });

  const result = await worker.runOnce(5);

  assert.deepEqual(calls, ["repair", "resume-generation", "list"]);
  assert.deepEqual(result, { inspected: 1, repaired: 2, processed: [] });
});

test("worker skips a task while another worker owns the conversation lock", async () => {
  let executed = false;
  const worker = createWorker({
    execute: async () => {
      executed = true;
      return agentTask("succeeded");
    },
    claimConversationLock: async () => false,
  });
  assert.equal((await worker.processTask(agentTaskId)).status, "skipped");
  assert.equal(executed, false);
});

function createWorker(overrides: {
  execute?: (taskId: string, input?: { attemptId?: string | null }) => Promise<CanvasAgentTaskRecord>;
  finalizeAttempt?: (...args: any[]) => Promise<void>;
  releaseAttempt?: (...args: any[]) => Promise<void>;
  findTask?: (...args: any[]) => Promise<CanvasAgentTaskRecord | undefined>;
  transitionTask?: (...args: any[]) => Promise<CanvasAgentTaskRecord>;
  hasExternalSubmission?: (taskId: string) => Promise<boolean>;
  repairExpiredLeases?: (limit?: number) => Promise<{ inspected: number; repaired: number }>;
  resumeCompletedGenerations?: (limit?: number) => Promise<{ inspected: number; resumed: number }>;
  listQueuedTaskIds?: (limit: number) => Promise<string[]>;
  claimConversationLock?: (...args: any[]) => Promise<boolean>;
} = {}) {
  return new CanvasAgentWorker({
    db: unusedDb,
    workerId: "canvas-agent-worker-test",
    executor: { execute: overrides.execute ?? (async () => agentTask("succeeded")) },
    claimTask: async () => ({ task: workflowTask, attempt }),
    claimConversationLock: overrides.claimConversationLock ?? (async () => true),
    heartbeatTask: async () => true,
    heartbeatConversationLock: async () => true,
    releaseConversationLock: async () => undefined,
    finalizeAttempt: overrides.finalizeAttempt ?? (async () => undefined),
    releaseAttempt: overrides.releaseAttempt ?? (async () => undefined),
    findTask: overrides.findTask ?? (async () => agentTask("running")),
    transitionTask: overrides.transitionTask ?? (async (_db, input) => agentTask(input.to)),
    aggregateWorkflow: async () => "succeeded",
    hasExternalSubmission: overrides.hasExternalSubmission ?? (async () => false),
    repair: {
      repairExpiredLeases: overrides.repairExpiredLeases ?? (async () => ({ inspected: 0, repaired: 0 })),
      ...(overrides.resumeCompletedGenerations
        ? { resumeCompletedGenerations: overrides.resumeCompletedGenerations }
        : {}),
    },
    listQueuedTaskIds: overrides.listQueuedTaskIds ?? (async () => []),
    now: () => now,
  });
}

function agentTask(
  status: CanvasAgentTaskRecord["status"],
  failureCode: string | null = null,
): CanvasAgentTaskRecord {
  return {
    id: agentTaskId,
    canvasId: "50000000-0000-4000-8000-000000000001",
    conversationId: "70000000-0000-4000-8000-000000000001",
    workflowId: workflowTask.workflowId,
    workflowTaskId,
    ownerUserId: workflowTask.userId,
    actorTeamMemberId: null,
    mode: "b",
    status,
    modelCode: "canvas-agent-model",
    modelConfigSnapshot: {},
    budget: {},
    metrics: {},
    currentStepId: null,
    baseRevision: 1,
    eventSequence: 1,
    failureCode,
    createdAt: now,
    updatedAt: now,
  };
}

const unusedDb: SqlDatabase = {
  async query<T>() {
    return { rows: [] as T[] };
  },
};
