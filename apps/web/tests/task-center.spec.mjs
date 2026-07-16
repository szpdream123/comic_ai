import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  registerTaskCenterTaskForTest,
  resolveTaskCenterPollDelayForTest,
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
    assert.match(html, /提交时间/);
    assert.match(html, /返回时间/);
    assert.match(html, /GPT Image 2/);
    assert.doesNotMatch(html, /global-ai-opc-gpt-image-2/);
    assert.match(html, /generated\/task-image-1\.png/);
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

  it("backs off active task polling after 30 seconds and 5 minutes", () => {
    const startedAt = 1_000_000;

    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, true, startedAt), 0);
    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, false, startedAt + 29_999), 15_000);
    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, false, startedAt + 30_000), 30_000);
    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, false, startedAt + 299_999), 30_000);
    assert.equal(resolveTaskCenterPollDelayForTest(startedAt, false, startedAt + 300_000), 60_000);
  });
});
