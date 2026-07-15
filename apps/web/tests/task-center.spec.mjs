import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  registerTaskCenterTaskForTest,
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

describe("production workbench task center", () => {
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
    assert.match(html, /提交时间/);
    assert.match(html, /返回时间/);
    assert.match(html, /generated\/task-image-1\.png/);
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
          assert.equal(params.status, "poll");
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
      assert.equal(timers.size, 1);
      assert.equal([...timers.values()][0].delayMs, 60_000);
    } finally {
      globalThis.window = previousWindow;
    }
  });
});
