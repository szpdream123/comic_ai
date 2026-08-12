import assert from "node:assert/strict";
import { test } from "node:test";

import { handleWorkbenchActionForTest } from "../src/features/production-workbench/index.js";

function createScript(id = "script-1", title = "测试剧本") {
  return {
    id,
    title,
    status: "draft",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
}

function createWorkbench() {
  const script = createScript();
  return {
    root: { innerHTML: "", querySelector() { return null; } },
    state: {
      projectDetail: {
        script,
        scripts: [script],
        episodes: [],
      },
    },
    session: { user: { phone: "+86 13800138000" } },
    api: {},
    ui: {
      activeNavTab: "script",
      projectPanelMode: "library",
      scriptLibraryLoaded: true,
      scriptLibraryRecords: [script],
      singleEpisodeScriptLibrary: [script],
      singleEpisodeScriptLibraryPagination: {
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        mode: "server",
      },
      selectedScriptIds: [],
      scriptCardMenuId: null,
      renameScriptId: null,
      renameScriptTitle: "",
      renameScriptNotice: "",
      deleteScriptId: null,
      deleteScriptMode: "single",
      deleteScriptIds: [],
      storyboards: [],
      toast: "",
    },
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("script delete modal shows progress while the api request is pending", async () => {
  const workbench = createWorkbench();
  const deletion = createDeferred();
  workbench.api.deleteScriptCard = () => deletion.promise;

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-script-card", scriptId: "script-1" },
  });
  const deleting = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-script-card" },
  });
  await Promise.resolve();

  assert.equal(workbench.ui.deleteScriptSubmitting, true);
  assert.match(workbench.root.innerHTML, /aria-label="正在删除"[^>]*tabindex="-1"[^>]*autofocus/);
  assert.match(workbench.root.innerHTML, /删除中…/);
  assert.match(workbench.root.innerHTML, /data-action="close-delete-script-modal"[^>]*disabled/);
  assert.match(workbench.root.innerHTML, /data-action="confirm-delete-script-card"[^>]*disabled/);

  deletion.resolve({ deleted: true, script: createScript() });
  await deleting;
});

test("script delete closes immediately after api success without waiting for list refresh", async () => {
  const workbench = createWorkbench();
  const deletion = createDeferred();
  const refresh = createDeferred();
  let refreshStarted = false;
  workbench.api.deleteScriptCard = () => deletion.promise;
  workbench.api.getUserScripts = () => {
    refreshStarted = true;
    return refresh.promise;
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-script-card", scriptId: "script-1" },
  });
  const deleting = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-script-card" },
  });
  deletion.resolve({ deleted: true, script: createScript() });
  await Promise.resolve();
  await Promise.resolve();

  let actionReturned = false;
  void deleting.then(() => {
    actionReturned = true;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(actionReturned, true);
  assert.equal(refreshStarted, true);
  assert.equal(workbench.ui.deleteScriptId, null);
  assert.equal(workbench.ui.scriptLibraryRecords.length, 0);
  assert.equal(workbench.ui.singleEpisodeScriptLibraryPagination.total, 0);
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-delete-script-card"/);

  refresh.resolve({
    scripts: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  });
});

test("script delete succeeds from the standalone library without project state", async () => {
  const workbench = createWorkbench();
  delete workbench.state;
  workbench.api.deleteScriptCard = async () => ({ deleted: true, script: createScript() });

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-script-card", scriptId: "script-1" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-script-card" },
  });

  assert.equal(workbench.ui.deleteScriptId, null);
  assert.equal(workbench.ui.scriptLibraryRecords.length, 0);
  assert.equal(workbench.ui.toast, "剧本已删除。");
});

test("a stale delete refresh cannot overwrite a newer script page", async () => {
  const workbench = createWorkbench();
  const deleteRefresh = createDeferred();
  const pageRefresh = createDeferred();
  let scriptRequests = 0;
  workbench.ui.singleEpisodeScriptLibraryPagination = {
    page: 1,
    pageSize: 10,
    total: 20,
    totalPages: 2,
    mode: "server",
  };
  workbench.api.deleteScriptCard = async () => ({ deleted: true, script: createScript() });
  workbench.api.getUserScripts = () => {
    scriptRequests += 1;
    return scriptRequests === 1 ? deleteRefresh.promise : pageRefresh.promise;
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-script-card", scriptId: "script-1" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-script-card" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const changingPage = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "change-script-page", page: "2" },
  });
  pageRefresh.resolve({
    scripts: [createScript("script-page-2", "第二页剧本")],
    pagination: { page: 2, pageSize: 10, total: 20, totalPages: 2 },
  });
  await changingPage;
  assert.equal(workbench.ui.singleEpisodeScriptLibraryPagination.page, 2);
  assert.equal(workbench.ui.scriptLibraryRecords[0]?.id, "script-page-2");

  deleteRefresh.resolve({
    scripts: [createScript("script-stale-page-1", "旧第一页剧本")],
    pagination: { page: 1, pageSize: 10, total: 19, totalPages: 2 },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(workbench.ui.singleEpisodeScriptLibraryPagination.page, 2);
  assert.equal(workbench.ui.scriptLibraryRecords[0]?.id, "script-page-2");
});

test("a stale script page failure cannot roll back a newer successful page", async () => {
  const workbench = createWorkbench();
  const staleRequest = createDeferred();
  const newerRequest = createDeferred();
  let requestCount = 0;
  workbench.ui.singleEpisodeScriptLibraryPagination = {
    page: 1,
    pageSize: 10,
    total: 20,
    totalPages: 2,
    mode: "server",
  };
  workbench.api.getUserScripts = () => {
    requestCount += 1;
    return requestCount === 1 ? staleRequest.promise : newerRequest.promise;
  };

  const staleChange = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "change-script-page", page: "2" },
  });
  await Promise.resolve();
  const newerChange = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "change-script-page", page: "2" },
  });
  newerRequest.resolve({
    scripts: [createScript("script-page-2", "第二页剧本")],
    pagination: { page: 2, pageSize: 10, total: 20, totalPages: 2 },
  });
  await newerChange;

  staleRequest.reject(new Error("stale request failed"));
  await staleChange;

  assert.equal(workbench.ui.singleEpisodeScriptLibraryPagination.page, 2);
  assert.equal(workbench.ui.scriptLibraryRecords[0]?.id, "script-page-2");
  assert.equal(workbench.ui.toast, "");
});

test("a stale script page success cannot clear a newer page error", async () => {
  const workbench = createWorkbench();
  const staleRequest = createDeferred();
  const newerRequest = createDeferred();
  let requestCount = 0;
  workbench.ui.singleEpisodeScriptLibraryPagination = {
    page: 1,
    pageSize: 10,
    total: 20,
    totalPages: 2,
    mode: "server",
  };
  workbench.api.getUserScripts = () => {
    requestCount += 1;
    return requestCount === 1 ? staleRequest.promise : newerRequest.promise;
  };

  const staleChange = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "change-script-page", page: "2" },
  });
  await Promise.resolve();
  const newerChange = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "change-script-page", page: "2" },
  });
  newerRequest.reject(new Error("newer request failed"));
  await newerChange;
  assert.match(workbench.ui.toast, /newer request failed/);

  staleRequest.resolve({
    scripts: [createScript("script-stale-page-2", "过期第二页剧本")],
    pagination: { page: 2, pageSize: 10, total: 20, totalPages: 2 },
  });
  await staleChange;

  assert.match(workbench.ui.toast, /newer request failed/);
  assert.equal(workbench.ui.scriptLibraryRecords[0]?.id, "script-1");
});

test("an already missing script is treated as an idempotent delete success", async () => {
  const workbench = createWorkbench();
  workbench.api.deleteScriptCard = async () => {
    const error = new Error("script not found");
    error.errorCode = "script_not_found";
    throw error;
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-script-card", scriptId: "script-1" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-script-card" },
  });

  assert.equal(workbench.ui.deleteScriptId, null);
  assert.equal(workbench.ui.scriptLibraryRecords.length, 0);
  assert.equal(workbench.ui.singleEpisodeScriptLibraryPagination.total, 0);
  assert.equal(workbench.ui.toast, "剧本已删除。");
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-delete-script-card"/);
});

test("script delete failure restores the interactive modal", async () => {
  const workbench = createWorkbench();
  workbench.api.deleteScriptCard = async () => {
    throw new Error("network unavailable");
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-script-card", scriptId: "script-1" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-script-card" },
  });

  assert.equal(workbench.ui.deleteScriptId, "script-1");
  assert.equal(workbench.ui.deleteScriptSubmitting, false);
  assert.equal(workbench.ui.scriptLibraryRecords.length, 1);
  assert.match(workbench.root.innerHTML, /data-action="confirm-delete-script-card"/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-delete-script-card"[^>]*disabled/);
});

test("bulk script delete keeps only failed scripts retryable after a partial failure", async () => {
  const workbench = createWorkbench();
  const secondScript = createScript("script-2", "第二个剧本");
  workbench.state.projectDetail.scripts.push(secondScript);
  workbench.ui.scriptLibraryRecords.push(secondScript);
  workbench.ui.singleEpisodeScriptLibrary.push(secondScript);
  workbench.ui.singleEpisodeScriptLibraryPagination.total = 2;
  workbench.ui.selectedScriptIds = ["script-1", "script-2"];
  let deleteCalls = 0;
  workbench.api.deleteScriptCard = async () => {
    deleteCalls += 1;
    if (deleteCalls === 2) {
      throw new Error("second delete failed");
    }
    return { deleted: true };
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-selected-scripts" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-delete-script-card" },
  });

  assert.equal(deleteCalls, 2);
  assert.equal(workbench.ui.deleteScriptSubmitting, false);
  assert.equal(workbench.ui.deleteScriptId, "script-2");
  assert.deepEqual(workbench.ui.deleteScriptIds, ["script-2"]);
  assert.deepEqual(workbench.ui.selectedScriptIds, ["script-2"]);
  assert.equal(workbench.ui.scriptLibraryRecords.some((script) => script.id === "script-1"), false);
  assert.equal(workbench.ui.scriptLibraryRecords.some((script) => script.id === "script-2"), true);
  assert.match(workbench.root.innerHTML, /所选 1 个剧本将被删除/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-delete-script-card"[^>]*disabled/);
});

test("script rename closes the modal and updates the local card after api success", async () => {
  const workbench = createWorkbench();
  workbench.ui.renameScriptId = "script-1";
  workbench.ui.renameScriptTitle = "重命名后的剧本";
  workbench.api.updateScriptCard = async () => ({
    script: createScript("script-1", "重命名后的剧本"),
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-rename-script-card" },
  });

  assert.equal(workbench.ui.renameScriptId, null);
  assert.equal(workbench.ui.scriptLibraryRecords[0].title, "重命名后的剧本");
  assert.equal(workbench.ui.singleEpisodeScriptLibrary[0].title, "重命名后的剧本");
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-rename-script-card"/);
});

test("script rename succeeds from the standalone library without project state", async () => {
  const workbench = createWorkbench();
  delete workbench.state;
  workbench.ui.renameScriptId = "script-1";
  workbench.ui.renameScriptTitle = "重命名后的剧本";
  workbench.api.updateScriptCard = async () => ({
    script: createScript("script-1", "重命名后的剧本"),
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-rename-script-card" },
  });

  assert.equal(workbench.ui.renameScriptId, null);
  assert.equal(workbench.ui.scriptLibraryRecords[0].title, "重命名后的剧本");
  assert.equal(workbench.ui.toast, "剧本已重命名。");
});

test("script rename modal shows progress while the api request is pending", async () => {
  const workbench = createWorkbench();
  const update = createDeferred();
  workbench.ui.renameScriptId = "script-1";
  workbench.ui.renameScriptTitle = "重命名后的剧本";
  workbench.api.updateScriptCard = () => update.promise;

  const renaming = handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-rename-script-card" },
  });
  await Promise.resolve();

  assert.equal(workbench.ui.renameScriptSubmitting, true);
  assert.match(workbench.root.innerHTML, /aria-label="重命名剧本"[^>]*tabindex="-1"[^>]*autofocus/);
  assert.match(workbench.root.innerHTML, /保存中…/);
  assert.match(workbench.root.innerHTML, /data-action="close-rename-script-modal"[^>]*disabled/);
  assert.match(workbench.root.innerHTML, /data-action="confirm-rename-script-card"[^>]*disabled/);

  update.resolve({ script: createScript("script-1", "重命名后的剧本") });
  await renaming;
});

test("script rename failure restores the interactive modal", async () => {
  const workbench = createWorkbench();
  workbench.ui.renameScriptId = "script-1";
  workbench.ui.renameScriptTitle = "重命名后的剧本";
  workbench.api.updateScriptCard = async () => {
    throw new Error("network unavailable");
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-rename-script-card" },
  });

  assert.equal(workbench.ui.renameScriptId, "script-1");
  assert.equal(workbench.ui.renameScriptSubmitting, false);
  assert.match(workbench.root.innerHTML, /data-action="confirm-rename-script-card"/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-action="confirm-rename-script-card"[^>]*disabled/);
});
