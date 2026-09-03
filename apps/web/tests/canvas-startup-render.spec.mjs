import assert from "node:assert/strict";
import test from "node:test";
import {
  handleCanvasLiveEventForTest,
  initProductionWorkbench,
  refreshProductionWorkbenchForTest,
} from "../src/features/production-workbench/index.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

async function withWorkbench(run) {
  const previous = new Map(["window", "document", "localStorage", "sessionStorage"].map((name) => [name, globalThis[name]]));
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const counts = { fullRenders: 0, removals: 0, updates: 0 };
  let markup = "";
  const chrome = { markup: "", replaceWith(next) { this.markup = next.markup; } };
  const overlays = { markup: "", replaceWith(next) { this.markup = next.markup; } };
  const root = {
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = value; counts.fullRenders += 1; },
    addEventListener() {},
    querySelector(selector) {
      if (selector === ".global-statusbar") return chrome;
      if (selector === "[data-workbench-global-overlays]") return overlays;
      return null;
    },
    querySelectorAll() { return []; },
  };
  globalThis.localStorage = globalThis.sessionStorage = storage;
  globalThis.window = {
    localStorage: storage, location: { hash: "#home", pathname: "/", protocol: "http:", host: "localhost", search: "" },
    addEventListener() {}, removeEventListener() {},
  };
  globalThis.document = {
    body: { classList: { toggle() {} }, setAttribute() {} },
    addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; },
    createElement() {
      const template = { innerHTML: "" };
      template.content = { querySelector: () => ({ markup: template.innerHTML }) };
      return template;
    },
  };
  const support = deferred();
  const announcements = deferred();
  let workbench;
  try {
    workbench = await initProductionWorkbench({
      root, session: { user: { id: "canvas-refresh-test" } },
      api: { getCustomerSupportConfig: () => support.promise, getAnnouncements: () => announcements.promise },
    });
    await settle();
    const host = { isConnected: true, dataset: { canvasProjectId: "canvas-refresh-test" }, remove() { counts.removals += 1; } };
    Object.assign(workbench.ui, { activeNavTab: "tools", canvasProjectView: "detail", selectedCanvasProjectId: "canvas-refresh-test" });
    workbench.newCanvasMount = host;
    workbench.newCanvasInstance = { async update() { counts.updates += 1; } };
    await run({ workbench, support, announcements, counts, chrome, overlays, host, root });
  } finally {
    support.resolve(null);
    announcements.resolve({ announcements: [] });
    await settle();
    workbench?.disposeCanvasLiveSubscription();
    workbench?.disposeTaskCenterPolling();
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
}

test("late support and announcement responses update chrome without detaching the active canvas", async () => {
  await withWorkbench(async ({ workbench, support, announcements, counts, chrome, host }) => {
    const renders = counts.fullRenders;
    support.resolve({ onlineServiceLabel: "updated support" });
    await settle();
    assert.equal(counts.removals, 0);
    assert.equal(counts.fullRenders, renders);
    assert.match(chrome.markup, /updated support/);
    announcements.resolve({ announcements: [{ id: "notice", title: "updated notice", body: "notice body" }], version: "2026-09-03" });
    await settle();
    assert.equal(workbench.ui.announcementUnread, true);
    assert.match(chrome.markup, /announcement-unread-dot/);
    assert.equal(workbench.newCanvasMount, host);
    assert.equal(counts.removals, 0);
    assert.equal(counts.fullRenders, renders);
  });
});

test("an announcement response refreshes an already open panel while a canvas mount is pending", async () => {
  await withWorkbench(async ({ workbench, announcements, counts, overlays, host }) => {
    workbench.newCanvasMount = null;
    workbench.newCanvasInstance = null;
    workbench.newCanvasPendingHost = host;
    workbench.ui.announcementPanelOpen = true;
    const renders = counts.fullRenders;
    announcements.resolve({ announcements: [{ title: "late announcement", body: "new announcement body" }], version: "2026-09-03" });
    await settle();
    assert.match(overlays.markup, /late announcement/);
    assert.match(overlays.markup, /new announcement body/);
    assert.equal(workbench.ui.announcementUnread, false);
    assert.equal(counts.removals, 0);
    assert.equal(counts.fullRenders, renders);
  });
});

test("failed shell requests preserve support defaults and expose the announcement error", async () => {
  await withWorkbench(async ({ workbench, support, announcements, counts }) => {
    workbench.ui.customerSupportConfig = { onlineServiceLabel: "existing support" };
    const renders = counts.fullRenders;
    support.reject(new Error("support unavailable"));
    announcements.reject(new Error("announcements unavailable"));
    await settle();
    assert.equal(workbench.ui.customerSupportConfig.onlineServiceLabel, "existing support");
    assert.ok(workbench.ui.announcementError);
    assert.equal(workbench.ui.announcementsLoading, false);
    assert.equal(counts.removals, 0);
    assert.equal(counts.fullRenders, renders);
  });
});

function setCanvasDocument(workbench, nodes = []) {
  const document = {
    version: 2, canvasProjectId: "canvas-refresh-test", viewport: { x: 10, y: 20, zoom: 0.8 },
    nodes, edges: [],
  };
  Object.assign(workbench.ui, {
    canvasProjects: [{ id: "canvas-refresh-test", title: "test canvas" }],
    activeCanvasProjectId: "canvas-refresh-test", canvasServerRevision: 1,
    canvasDocument: document, canvasDocumentsByProject: { "canvas-refresh-test": document },
    canvasSessionUiStateReady: true,
  });
  return document;
}

for (const changed of [false, true]) {
  test(`a live revision ${changed ? "with changed nodes" : "with unchanged nodes"} preserves the canvas host and updates its revision`, async () => {
    await withWorkbench(async ({ workbench, counts, host }) => {
      const document = setCanvasDocument(workbench);
      workbench.api.streamCanvasLive = async function* () {};
      workbench.api.getCanvasHead = async () => ({ head: {
        serverRevision: 2,
        document: changed ? { ...document, nodes: [{ id: "remote-node", type: "text", data: { text: "remote content" } }] } : document,
      } });
      const renders = counts.fullRenders;
      await handleCanvasLiveEventForTest(workbench, "canvas-refresh-test", { data: { type: "revision", serverRevision: 2 } });
      await settle();
      assert.equal(workbench.ui.canvasServerRevision, 2);
      assert.equal(workbench.ui.canvasSaveStatus, "saved");
      assert.equal(workbench.ui.canvasDocument.nodes.length, changed ? 1 : 0);
      assert.equal(workbench.newCanvasMount, host);
      assert.equal(counts.removals, 0);
      assert.equal(counts.fullRenders, renders);
      assert.ok(counts.updates > 0);
    });
  });
}

test("restoring a running canvas resumes task polling and applies the finished result without detaching the host", async () => {
  await withWorkbench(async ({ workbench, counts, host }) => {
    const timers = [];
    window.setTimeout = (callback) => { timers.push(callback); return timers.length; };
    window.clearTimeout = () => {};
    window.location.hash = "#tools-canvas";
    window.location.search = "?canvasProjectId=canvas-refresh-test";
    setCanvasDocument(workbench, [{ id: "image-node", type: "image", data: {
      mediaKind: "image", status: "running", taskId: "running-task", lastTaskId: "running-task",
    } }]);
    workbench.taskCenterLastDiscoveryAt = Date.now();
    workbench.api.listTaskCenterTasks = async ({ taskIds }) => ({
      items: taskIds.map((taskId) => ({ taskId, status: "completed", result: { imageUrl: "https://example.test/result.png" } })),
    });
    await refreshProductionWorkbenchForTest(workbench);
    await settle();
    assert.ok(workbench.ui.taskCenterTasksById?.["running-task"], "the restored task must be tracked without relying on a later unrelated render");
    assert.ok(timers.length > 0, "the restored task must be polled");
    await timers.shift()();
    await settle();
    assert.equal(workbench.ui.canvasDocument.nodes[0].data.status, "completed");
    assert.equal(workbench.newCanvasMount, host);
    assert.equal(counts.removals, 0);
  });
});

test("late shell responses still render the current page after leaving the canvas", async () => {
  await withWorkbench(async ({ workbench, support, announcements, counts, root }) => {
    workbench.ui.activeNavTab = "home";
    const renders = counts.fullRenders;
    support.resolve({ onlineServiceLabel: "home support" });
    await settle();
    assert.ok(counts.fullRenders > renders);
    assert.match(root.innerHTML, /home support/);
    announcements.resolve({ announcements: [{ id: "notice", title: "home notice" }], version: "2026-09-03" });
    await settle();
    assert.match(root.innerHTML, /announcement-unread-dot/);
    assert.equal(workbench.ui.activeNavTab, "home");
  });
});

test("canvas route restoration updates the mounted surface without detaching its styles", async () => {
  await withWorkbench(async ({ workbench, counts, host }) => {
    window.location.hash = "#tools-canvas";
    window.location.search = "?canvasProjectId=canvas-refresh-test";
    const renders = counts.fullRenders;
    await refreshProductionWorkbenchForTest(workbench);
    await settle();
    assert.equal(counts.removals, 0);
    assert.equal(counts.fullRenders, renders);
    assert.equal(workbench.newCanvasMount, host);
    assert.ok(counts.updates > 0);
  });
});

test("silent live synchronization updates the document without rendering or scheduling polls", async () => {
  await withWorkbench(async ({ workbench, counts }) => {
    const document = setCanvasDocument(workbench, [{ id: "image-node", type: "image", data: { status: "running", taskId: "task-one" } }]);
    let scheduled = 0;
    window.setTimeout = () => ++scheduled;
    window.clearTimeout = () => {};
    workbench.api.listTaskCenterTasks = async () => ({ items: [] });
    workbench.api.streamCanvasLive = async function* () {};
    workbench.api.getCanvasHead = async () => ({ head: { serverRevision: 2, document } });
    const previous = { ...counts };
    await handleCanvasLiveEventForTest(workbench, "canvas-refresh-test", {
      data: { type: "revision", serverRevision: 2 },
    }, { render: false });
    await settle();
    assert.equal(workbench.ui.canvasServerRevision, 2);
    assert.deepEqual(counts, previous);
    assert.equal(scheduled, 0);
  });
});

test("revoking canvas access still disposes the host and displays the project list", async () => {
  await withWorkbench(async ({ workbench, counts }) => {
    setCanvasDocument(workbench);
    const renders = counts.fullRenders;
    await handleCanvasLiveEventForTest(workbench, "canvas-refresh-test", { data: { type: "access.revoked" } });
    await settle();
    assert.equal(workbench.ui.canvasProjectView, "list");
    assert.equal(workbench.newCanvasMount, null);
    assert.ok(counts.fullRenders > renders);
    assert.match(workbench.ui.toast, /访问权限已撤销/);
  });
});

test("repeated live revisions keep one poll timer and do not overlap an in-flight request", async () => {
  await withWorkbench(async ({ workbench, counts }) => {
    const timers = new Map();
    let nextTimer = 0, calls = 0;
    window.setTimeout = (callback) => { timers.set(++nextTimer, callback); return nextTimer; };
    window.clearTimeout = (id) => timers.delete(id);
    const document = setCanvasDocument(workbench, [{ id: "image-node", type: "image", data: {
      status: "running", taskId: "task-one", lastTaskId: "task-one", mediaKind: "image",
    } }]);
    const response = deferred();
    workbench.api.listTaskCenterTasks = async () => { calls += 1; return response.promise; };
    workbench.api.streamCanvasLive = async function* () {};
    let revision = 1;
    workbench.api.getCanvasHead = async () => ({ head: { serverRevision: revision, document } });
    for (revision of [2, 3]) {
      await handleCanvasLiveEventForTest(workbench, "canvas-refresh-test", { data: { type: "revision", serverRevision: revision } });
    }
    assert.equal(timers.size, 1);
    const [timerId, callback] = [...timers][0];
    timers.delete(timerId);
    const polling = callback();
    await settle();
    assert.equal(calls, 1);
    revision = 4;
    await handleCanvasLiveEventForTest(workbench, "canvas-refresh-test", { data: { type: "revision", serverRevision: revision } });
    assert.equal(timers.size, 0);
    assert.equal(calls, 1);
    response.resolve({ items: [{ taskId: "task-one", status: "completed", result: { imageUrl: "https://example.test/result.png" } }] });
    await polling;
    await settle();
    assert.equal(workbench.ui.canvasDocument.nodes[0].data.status, "completed");
    assert.equal(timers.size, 0);
    assert.equal(counts.removals, 0);
  });
});
