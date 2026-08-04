import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyTaskCenterTaskProjectionForTest,
  registerTaskCenterTaskForTest,
  resolveTaskCenterPollDelayForTest,
  runTaskCenterPollingForTest,
  scheduleTaskCenterPollingForTest,
} from "../src/features/production-workbench/index.js";
import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

function createRoot() {
  return {
    innerHTML: "",
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function createTaskCenterActionRoot() {
  const attributes = new Map();
  let badge = null;
  const action = {
    ownerDocument: {
      createElement() {
        return {
          className: "",
          textContent: "",
          remove() {
            badge = null;
          },
        };
      },
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    querySelector(selector) {
      return selector === ".task-center-action-count" ? badge : null;
    },
    appendChild(element) {
      badge = element;
      return element;
    },
  };
  return {
    action,
    attributes,
    getBadge() {
      return badge;
    },
    root: {
      querySelector(selector) {
        return selector === ".task-center-action" ? action : null;
      },
    },
  };
}

describe("production workbench task center", () => {
  it("accepts a newer provider-success recovery state over a cached terminal task", () => {
    const workbench = {
      root: createRoot(),
      ui: { taskCenterTasksById: {}, taskCenterTaskOrder: [] },
    };
    registerTaskCenterTaskForTest(workbench, {
      taskId: "task-image-recovery",
      kind: "image",
      status: "manual_review_required",
      updatedAt: "2026-08-03T10:00:00.000Z",
    });
    registerTaskCenterTaskForTest(workbench, {
      taskId: "task-image-recovery",
      kind: "image",
      status: "running",
      providerSucceeded: true,
      recoveryState: "retry_pending",
      updatedAt: "2026-08-03T10:01:00.000Z",
    });

    assert.equal(workbench.ui.taskCenterTasksById["task-image-recovery"].status, "running");
    assert.equal(workbench.ui.taskCenterTasksById["task-image-recovery"].recoveryState, "retry_pending");
  });

  it("preserves recovery fields through the single-task polling fallback", async () => {
    const workbench = {
      state: {},
      session: { user: { phone: "13800138000" } },
      root: createRoot(),
      taskCenterPollInFlight: false,
      taskCenterPageLoadInFlight: false,
      taskCenterAppliedVersions: new Map(),
      ui: { taskCenterTasksById: {}, taskCenterTaskOrder: [] },
      api: {
        async getGenerationTask() {
          return {
            taskId: "task-fallback-recovery",
            kind: "image",
            status: "running",
            providerSucceeded: true,
            recoveryState: "retry_pending",
            recoveryRound: 4,
            nextRetryAt: "2026-08-03T10:30:00.000Z",
            updatedAt: "2026-08-03T10:00:00.000Z",
          };
        },
      },
    };
    registerTaskCenterTaskForTest(workbench, "task-fallback-recovery", {
      status: "queued",
      kind: "image",
    });

    await runTaskCenterPollingForTest(workbench);

    assert.equal(workbench.ui.taskCenterTasksById["task-fallback-recovery"].providerSucceeded, true);
    assert.equal(workbench.ui.taskCenterTasksById["task-fallback-recovery"].recoveryState, "retry_pending");
    assert.equal(workbench.ui.taskCenterTasksById["task-fallback-recovery"].recoveryRound, 4);
  });

  it("syncs a batched novel-to-script text result into its parent script node", async () => {
    const workbench = {
      root: createRoot(),
      taskCenterAppliedVersions: new Map(),
      ui: {
        selectedCanvasProjectId: "canvas-1",
        canvasProjects: [{ id: "canvas-1", title: "测试画布" }],
        canvasDocumentsByProject: {},
        canvasGenerationHistoryItems: [],
        canvasDocument: {
          version: 1,
          nodes: [
            { id: "script-1", type: "script", data: { sourceMode: "novel", text: "" } },
            {
              id: "text-1",
              type: "ai-text",
              data: {
                mediaKind: "text",
                status: "queued",
                lastTaskId: "task-script-1",
                workflowParentId: "script-1",
                workflowKind: "script",
                prompt: "将小说转换为剧本",
              },
            },
          ],
          edges: [],
        },
      },
    };

    await applyTaskCenterTaskProjectionForTest(workbench, {
      taskId: "task-script-1",
      kind: "text",
      mediaKind: "text",
      status: "succeeded",
      result: { text: "第一场：雨夜街道。" },
      updatedAt: "2026-07-31T08:00:00.000Z",
    });

    const parent = workbench.ui.canvasDocument.nodes.find((node) => node.id === "script-1");
    const generated = workbench.ui.canvasDocument.nodes.find((node) => node.id === "text-1");
    assert.equal(generated.data.text, "第一场：雨夜街道。");
    assert.equal(parent.data.text, "第一场：雨夜街道。");
    assert.equal(parent.data.generatedScriptNodeId, "text-1");
  });

  it("projects live task status and failures into loaded canvas history", async () => {
    const workbench = {
      taskCenterAppliedVersions: new Map(),
      ui: {
        canvasGenerationHistoryItems: [{
          id: "canvas-run-1",
          taskId: "canvas-task-1",
          status: "queued",
          updatedAt: "2026-07-29T05:00:00.000Z",
        }],
      },
    };

    await applyTaskCenterTaskProjectionForTest(workbench, {
      taskId: "canvas-task-1",
      status: "failed",
      progressPercent: 64,
      progressStage: "provider_processing",
      failureCode: "content_policy_violation",
      failure: { displayMessage: "参考图或提示词不符合内容安全策略，请调整素材或提示词后重试。" },
      updatedAt: "2026-07-29T05:02:00.000Z",
    });

    assert.deepEqual(workbench.ui.canvasGenerationHistoryItems[0], {
      id: "canvas-run-1",
      taskId: "canvas-task-1",
      status: "failed",
      progressPercent: 64,
      progressStage: "provider_processing",
      failure: { displayMessage: "参考图或提示词不符合内容安全策略，请调整素材或提示词后重试。" },
      updatedAt: "2026-07-29T05:02:00.000Z",
    });
  });

  it("shows storage retry and manual storage review states instead of generation progress", () => {
    const html = renderProjectDetail({
      state: {},
      session: { user: { phone: "13800138000" } },
      ui: {
        activeNavTab: "home",
        taskCenterOpen: true,
        taskCenterTasksById: {
          "task-storage-retry": {
            taskId: "task-storage-retry",
            status: "running",
            progressStage: "asset_transfer_retry_pending",
            kind: "image",
            prompt: "retry",
            providerSucceeded: true,
            recoveryState: "retry_pending",
            recoveryRound: 3,
            nextRetryAt: "2026-08-03T10:22:00.000Z",
            recoveryDeadlineAt: "2026-08-03T16:00:00.000Z",
          },
          "task-storage-review": {
            taskId: "task-storage-review",
            status: "manual_review_required",
            failureCode: "provider_output_storage_failed",
            kind: "video",
            prompt: "review",
          },
        },
        taskCenterTaskOrder: ["task-storage-retry", "task-storage-review"],
        taskCenterSelectedTaskId: "task-storage-retry",
        taskCenterMeta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
    });

    assert.match(html, /存储超时，正在重试/);
    assert.match(html, /存储失败，等待人工处理/);
    assert.match(html, /供应商已完成生成/);
    assert.match(html, /第 3 轮/);
    assert.match(html, /下次恢复/);
    assert.doesNotMatch(html, /task-storage-retry[^]*生成中/);
  });

  it("replaces business cooperation and renders task result details", () => {
    const html = renderProjectDetail({
      state: {},
      session: { user: { phone: "13800138000" } },
      ui: {
        activeNavTab: "home",
        taskCenterOpen: true,
        taskCenterTasksById: {
          "task-image-1": {
            taskId: "task-image-1",
            status: "completed",
            kind: "image",
            targetType: "storyboard",
            projectName: "测试项目",
            episodeTitle: "第一集",
            model: "global-ai-opc-gpt-image-2",
            modelName: "GPT Image 2",
            prompt: "雨夜街道",
            result: { imageUrl: "/generated/task-image-1.png" },
            submittedAt: "2026-07-14T08:00:00.000Z",
            startedAt: "2026-07-14T08:00:03.000Z",
            returnedAt: "2026-07-14T08:00:18.000Z",
          },
        },
        taskCenterTaskOrder: ["task-image-1"],
        taskCenterSelectedTaskId: "task-image-1",
        taskCenterMeta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    });

    assert.doesNotMatch(html, /商务合作/);
    assert.doesNotMatch(html, /data-task-center-search|search-task-center/);
    assert.match(html, /data-action="open-task-center"/);
    assert.match(html, /task-image-1/);
    assert.match(html, /生成内容/);
    assert.doesNotMatch(html, /生成请求|雨夜街道/);
    assert.match(html, /提交时间/);
    assert.match(html, /返回时间/);
    assert.match(html, /GPT Image 2/);
    assert.doesNotMatch(html, /global-ai-opc-gpt-image-2/);
    assert.match(html, /generated\/task-image-1\.png/);
  });

  it("does not show a stale task detail outside the current filter result", () => {
    const html = renderProjectDetail({
      state: {},
      session: { user: { phone: "13800138000" } },
      ui: {
        activeNavTab: "home",
        taskCenterOpen: true,
        taskCenterStatusFilter: "active",
        taskCenterTasksById: {
          "task-failed": { taskId: "task-failed", status: "failed", kind: "image", failureCode: "provider_failed" },
        },
        taskCenterTaskOrder: [],
        taskCenterSelectedTaskId: "task-failed",
        taskCenterMeta: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      },
    });

    assert.match(html, /<strong>暂无任务<\/strong>/);
    assert.doesNotMatch(html, /task-failed/);
    assert.doesNotMatch(html, /失败原因/);
  });

  it("never reveals internal model codes when the display name is missing", () => {
    const html = renderProjectDetail({
      state: {},
      session: { user: { phone: "13800138000" } },
      ui: {
        activeNavTab: "home",
        taskCenterOpen: true,
        taskCenterTasksById: {
          "task-image-without-model-name": {
            taskId: "task-image-without-model-name",
            status: "completed",
            kind: "image",
            model: "internal-provider-model-code",
          },
        },
        taskCenterTaskOrder: ["task-image-without-model-name"],
        taskCenterSelectedTaskId: "task-image-without-model-name",
        taskCenterMeta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    });

    assert.doesNotMatch(html, /internal-provider-model-code/);
    assert.match(html, /<dt>模型<\/dt><dd>-<\/dd>/);
  });

  it("updates the active task badge immediately without a full render", () => {
    const dom = createTaskCenterActionRoot();
    const workbench = {
      root: dom.root,
      ui: {
        taskCenterTasksById: {},
        taskCenterTaskOrder: [],
      },
    };

    registerTaskCenterTaskForTest(workbench, "task-video-live", { status: "running", kind: "video" });

    assert.equal(dom.attributes.get("aria-label"), "任务中心，1 个任务进行中");
    assert.equal(dom.getBadge()?.className, "task-center-action-count");
    assert.equal(dom.getBadge()?.textContent, "1");

    registerTaskCenterTaskForTest(workbench, "task-video-live", { status: "completed", kind: "video" });

    assert.equal(dom.attributes.get("aria-label"), "任务中心");
    assert.equal(dom.getBadge(), null);
  });

  it("keeps a known running task running when canvas polling registers its id again", () => {
    const workbench = {
      root: createRoot(),
      ui: {
        taskCenterTasksById: {},
        taskCenterTaskOrder: [],
      },
    };

    registerTaskCenterTaskForTest(workbench, {
      taskId: "canvas-video-running-task",
      status: "running",
      kind: "video",
      updatedAt: "2026-07-29T06:53:56.000Z",
    });
    registerTaskCenterTaskForTest(workbench, "canvas-video-running-task", {
      kind: "video",
      targetType: "canvas_node",
      targetId: "canvas-video-node",
    });

    assert.equal(workbench.ui.taskCenterTasksById["canvas-video-running-task"].status, "running");
  });

  it("reapplies a known failure when a stale project image target registers", () => {
    const taskId = "project-image-failed-task";
    const runningAsset = {
      id: "project-scene-1",
      kind: "scene",
      generationTaskId: taskId,
      generationStatus: "running",
      generationResult: { taskId, status: "running" },
    };
    const workbench = {
      state: {},
      session: { user: { phone: "13800138000" } },
      root: createRoot(),
      taskCenterAppliedVersions: new Map(),
      ui: {
        taskCenterTasksById: {},
        taskCenterTaskOrder: [],
        importedAssets: {
          character: [],
          scene: [runningAsset],
          prop: [],
          other: { image: [], video: [], audio: [] },
        },
        assetGeneratorEditingAsset: { ...runningAsset },
      },
      api: {},
    };

    registerTaskCenterTaskForTest(workbench, {
      taskId,
      status: "failed",
      workflowStatus: "failed",
      targetType: "project_asset",
      targetId: runningAsset.id,
      assetId: runningAsset.id,
      failureCode: "provider_503",
    });
    workbench.taskCenterAppliedVersions.set(taskId, "previously-applied");

    registerTaskCenterTaskForTest(workbench, {
      taskId,
      status: "running",
      targetType: "project_asset",
      targetId: runningAsset.id,
      assetId: runningAsset.id,
    });

    assert.equal(workbench.ui.taskCenterTasksById[taskId].status, "failed");
    assert.equal(workbench.ui.importedAssets.scene[0].generationStatus, "failed");
    assert.equal(workbench.ui.assetGeneratorEditingAsset.generationStatus, "failed");
  });

  it("deduplicates timers and polls through the task-center endpoint only", async () => {
    const previousWindow = globalThis.window;
    const timers = new Map();
    let nextTimerId = 0;
    let taskCenterCalls = 0;
    let batchCalls = 0;
    globalThis.window = {
      setTimeout(callback, delayMs) {
        const id = ++nextTimerId;
        timers.set(id, { callback, delayMs });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    };
    const workbench = {
      state: {},
      session: { user: { phone: "13800138000" } },
      root: createRoot(),
      ui: {
        activeNavTab: "home",
        taskCenterOpen: false,
        taskCenterTasksById: {},
        taskCenterTaskOrder: [],
      },
      api: {
        async listTaskCenterTasks(params) {
          taskCenterCalls += 1;
          assert.equal(params.status, undefined);
          assert.deepEqual(params.taskIds, ["task-deduplicated"]);
          return {
            items: [{
              taskId: "task-deduplicated",
              status: "completed",
              kind: "image",
              updatedAt: "2026-07-14T08:00:18.000Z",
            }],
            page: 1,
            pageSize: 200,
            total: 1,
            totalPages: 1,
          };
        },
        async getGenerationTasks() {
          batchCalls += 1;
          throw new Error("batch polling must not run");
        },
      },
    };

    try {
      registerTaskCenterTaskForTest(workbench, "task-deduplicated", { status: "queued", kind: "image" });
      scheduleTaskCenterPollingForTest(workbench, { immediate: true });
      scheduleTaskCenterPollingForTest(workbench, { immediate: true });

      assert.equal(timers.size, 1);
      const immediateTimer = [...timers.values()][0];
      assert.equal(immediateTimer.delayMs, 0);
      timers.clear();
      await immediateTimer.callback();

      assert.equal(taskCenterCalls, 1);
      assert.equal(batchCalls, 0);
      assert.equal(workbench.ui.taskCenterTasksById["task-deduplicated"].status, "completed");
      assert.equal(timers.size, 0);
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("does not schedule polling when there are no active tasks", () => {
    const previousWindow = globalThis.window;
    const timers = new Map();
    let taskCenterCalls = 0;
    globalThis.window = {
      setTimeout(callback, delayMs) {
        const id = timers.size + 1;
        timers.set(id, { callback, delayMs });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    };
    const workbench = {
      state: {},
      session: { user: { phone: "13800138000" } },
      root: createRoot(),
      ui: {
        activeNavTab: "home",
        taskCenterOpen: false,
        taskCenterTasksById: {},
        taskCenterTaskOrder: [],
      },
      api: {
        async listTaskCenterTasks() {
          taskCenterCalls += 1;
          return { items: [] };
        },
      },
    };

    try {
      scheduleTaskCenterPollingForTest(workbench, { immediate: true });

      assert.equal(timers.size, 0);
      assert.equal(taskCenterCalls, 0);
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("drains cursor pages and advances an overlapping incremental watermark", async () => {
    const calls = [];
    const workbench = {
      state: {},
      session: { user: { phone: "13800138000" } },
      root: createRoot(),
      taskCenterPollInFlight: false,
      taskCenterPageLoadInFlight: false,
      taskCenterAppliedVersions: new Map(),
      taskCenterUpdatedAfter: null,
      ui: {
        activeNavTab: "home",
        taskCenterOpen: false,
        taskCenterTasksById: {},
        taskCenterTaskOrder: [],
      },
      api: {
        async listTaskCenterTasks(params, options) {
          calls.push({ params, signal: options?.signal });
          if (calls.length === 1) {
            return {
              items: [{
                taskId: "task-cursor",
                status: "running",
                kind: "image",
                updatedAt: "2026-07-14T08:00:01.000Z",
              }],
              nextCursor: "cursor-2",
            };
          }
          if (calls.length === 2) {
            return { items: [], nextCursor: null };
          }
          return {
            items: [{
              taskId: "task-cursor",
              status: "completed",
              kind: "image",
              updatedAt: "2026-07-14T08:00:02.000Z",
            }],
            nextCursor: null,
          };
        },
      },
    };

    registerTaskCenterTaskForTest(workbench, "task-cursor", { status: "queued", kind: "image" });
    await runTaskCenterPollingForTest(workbench);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].params.updatedAfter, undefined);
    assert.equal(calls[1].params.cursor, "cursor-2");
    assert.equal(calls[0].signal instanceof AbortSignal, true);
    assert.equal(workbench.taskCenterUpdatedAfter, "2026-07-14T08:00:01.000Z");

    await runTaskCenterPollingForTest(workbench);

    assert.equal(calls.length, 3);
    assert.equal(calls[2].params.updatedAfter, "2026-07-14T08:00:00.000Z");
    assert.equal(workbench.ui.taskCenterTasksById["task-cursor"].status, "completed");
    assert.equal(workbench.taskCenterUpdatedAfter, "2026-07-14T08:00:02.000Z");
  });

  it("backs off active task polling after 30 seconds and 5 minutes", () => {
    const startedAt = 1_000_000;

    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, true, startedAt), 0);
    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, false, startedAt + 29_999), 15_000);
    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, false, startedAt + 30_000), 30_000);
    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, false, startedAt + 299_999), 30_000);
    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, false, startedAt + 300_000), 60_000);
  });

  it("aligns recovery polling with the durable next retry without waiting more than five minutes", () => {
    const now = Date.parse("2026-08-03T10:00:00.000Z");
    const recovery = (nextRetryAt) => [{
      status: "running",
      progressStage: "asset_transfer_retry_pending",
      recoveryState: "retry_pending",
      nextRetryAt,
    }];

    assert.equal(resolveTaskCenterPollDelayForTest(now, false, now, recovery("2026-08-03T10:02:00.000Z")), 120_000);
    assert.equal(resolveTaskCenterPollDelayForTest(now, false, now, recovery("2026-08-03T10:10:00.000Z")), 300_000);
    assert.equal(resolveTaskCenterPollDelayForTest(now, false, now, recovery("2026-08-03T09:59:00.000Z")), 15_000);
  });
});
