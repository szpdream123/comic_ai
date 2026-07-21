import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canvasContentToDocument,
  canvasDocumentToContent,
  createCloudCanvasStorage,
  sanitizeCanvasContentForCloud,
} from "../new-canvas/src/loomic-core/canvas-document-adapter.js";
import { creatorApi } from "../src/shared/creator-api.js";
import {
  canAdoptCanvasRemoteUpdate,
  canCheckCanvasRemoteUpdate,
  classifyCanvasRemoteChange,
  isCanvasRemoteEcho,
  mergeCanvasRemoteAppState,
} from "../new-canvas/src/loomic-core/canvas-remote-sync.js";
import { canvasVersionFingerprint } from "../new-canvas/src/loomic-core/canvas-version-history.js";

const canvasProjectId = "11111111-1111-4111-8111-111111111111";
const businessProjectId = "22222222-2222-4222-8222-222222222222";
const newCanvasPage = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");
const canvasEditorSource = await readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8");

function localStore(initial = null) {
  let value = initial;
  return {
    async load() { return value; },
    async save(next) { value = next; },
    async remove() { value = null; },
    get value() { return value; },
  };
}

function content(text = "hello") {
  return {
    elements: [{
      id: "text-1",
      type: "text",
      x: 10,
      y: 20,
      width: 120,
      height: 40,
      text,
      customData: { title: "文本" },
    }],
    appState: {
      viewBackgroundColor: "#ffffff",
      gridModeEnabled: true,
      scrollX: -32,
      scrollY: 18,
      zoom: { value: 1.2 },
    },
    files: {
      file: { id: "file", dataURL: "https://cdn.example/file.png", mimeType: "image/png", created: 1 },
    },
  };
}

test("canvas document adapter round-trips Excalidraw content into legal nodes", () => {
  const source = content();
  const document = canvasContentToDocument(source, {
    canvasProjectId,
    projectId: canvasProjectId,
    now: () => "2026-07-19T00:00:00.000Z",
  });

  assert.equal(document.nodes.length, 2);
  assert.deepEqual(document.edges, []);
  assert.deepEqual(canvasDocumentToContent(document), source);
});

test("cloud documents never include local image data URLs while local drafts remain intact", () => {
  const source = {
    elements: [
      { id: "image", type: "image", fileId: "local", customData: { title: "待上传图片" } },
      { id: "generator", type: "rectangle", customData: { type: "image-generator", inputImages: ["data:image/png;base64,ref", "https://cdn.example/reference.png"] } },
    ],
    appState: {},
    files: { local: { id: "local", dataURL: "data:image/png;base64,abc", mimeType: "image/png" } },
  };
  const sanitized = sanitizeCanvasContentForCloud(source);
  assert.deepEqual(sanitized.files, {});
  assert.equal(sanitized.elements[0].customData.cloudArchiveStatus, "pending");
  assert.deepEqual(sanitized.elements[1].customData.inputImages, ["https://cdn.example/reference.png"]);
  assert.equal(source.files.local.dataURL, "data:image/png;base64,abc");
  const serialized = JSON.stringify(canvasContentToDocument(source, { canvasProjectId, projectId: canvasProjectId }));
  assert.doesNotMatch(serialized, /data:image|blob:/);

  const archived = {
    ...source,
    elements: [{ ...source.elements[0], customData: { storageUrl: "https://cdn.example/archived.png", cloudArchiveStatus: "archived" } }],
  };
  assert.equal(sanitizeCanvasContentForCloud(archived).files.local.dataURL, "https://cdn.example/archived.png");
});

test("canvas document adapter persists bound arrows as typed workflow edges", () => {
  const source = content();
  source.elements.push(
    {
      id: "image-node",
      type: "rectangle",
      x: 260,
      y: 20,
      width: 320,
      height: 180,
      customData: { type: "image-generator", prompt: "cinematic" },
    },
    {
      id: "arrow-1",
      type: "arrow",
      x: 130,
      y: 40,
      width: 130,
      height: 0,
      startBinding: { elementId: "text-1" },
      endBinding: { elementId: "image-node" },
      customData: { workflowEdge: true },
    },
  );
  const document = canvasContentToDocument(source, { canvasProjectId, projectId: canvasProjectId });
  assert.deepEqual(document.edges, [{
    id: "arrow-1:workflow-edge",
    sourceNodeId: "text-1",
    sourcePortId: "out_text",
    targetNodeId: "image-node",
    targetPortId: "in_asset",
    data: { kind: "text" },
  }]);
  assert.deepEqual(canvasDocumentToContent(document), source);
});

test("canvas document adapter excludes non-executable arrows from workflow edges", () => {
  const source = content();
  source.elements.push(
    {
      id: "image-node",
      type: "rectangle",
      customData: { type: "image-generator" },
    },
    {
      id: "video-node",
      type: "rectangle",
      customData: { type: "video-generator" },
    },
    {
      id: "visual-arrow",
      type: "arrow",
      startBinding: { elementId: "text-1" },
      endBinding: { elementId: "image-node" },
      customData: { workflowEdge: false },
    },
    {
      id: "mismatched-arrow",
      type: "arrow",
      startBinding: { elementId: "video-node" },
      endBinding: { elementId: "image-node" },
      customData: { workflowEdge: true },
    },
  );

  const document = canvasContentToDocument(source, { canvasProjectId, projectId: canvasProjectId });
  assert.deepEqual(document.edges, []);
  assert.deepEqual(canvasDocumentToContent(document), source);
});

test("cloud storage loads, saves with revision, and keeps a local fallback", async () => {
  const local = localStore(content("local"));
  const initialDocument = canvasContentToDocument(content("server"), {
    canvasProjectId,
    projectId: canvasProjectId,
    now: () => "2026-07-19T00:00:00.000Z",
  });
  const calls = [];
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 3, document: initialDocument } };
    },
    async saveStandaloneCanvas(id, input) {
      calls.push({ id, input });
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 4, document: input.document } };
    },
  };
  const storage = createCloudCanvasStorage({ localStore: local, creatorApi: api, projectId: canvasProjectId });
  assert.deepEqual(await storage.load(), content("server"));
  await storage.save("ignored", content("saved"));
  assert.equal(calls[0].input.clientRevision, 3);
  assert.equal(local.value.elements[0].text, "saved");
});

test("project canvas storage uses business project canvas APIs", async () => {
  const local = localStore(content("local"));
  const initialDocument = canvasContentToDocument(content("server"), {
    canvasProjectId,
    projectId: businessProjectId,
  });
  const calls = [];
  const api = {
    async getProjectCanvas(id) {
      calls.push(["getProjectCanvas", id]);
      return { canvas: { canvasProjectId, projectId: id, serverRevision: 2, document: initialDocument } };
    },
    async saveProjectCanvas(id, input) {
      calls.push([
        "saveProjectCanvas",
        id,
        input.clientRevision,
        input.document.canvasProjectId,
        input.document.projectId,
      ]);
      return { canvas: { canvasProjectId, projectId: id, serverRevision: 3, document: input.document } };
    },
    async getStandaloneCanvas() {
      assert.fail("business project canvas must not use the standalone load API");
    },
    async saveStandaloneCanvas() {
      assert.fail("business project canvas must not use the standalone save API");
    },
  };
  const storage = createCloudCanvasStorage({
    localStore: local,
    creatorApi: api,
    projectId: businessProjectId,
    projectCanvas: true,
  });

  assert.deepEqual(await storage.load(), content("server"));
  assert.equal(storage.getCloudCanvas().canvasProjectId, canvasProjectId);
  assert.notEqual(storage.getCloudCanvas().canvasProjectId, businessProjectId);
  await storage.save("ignored", content("saved"));
  assert.deepEqual(calls, [
    ["getProjectCanvas", businessProjectId],
    ["saveProjectCanvas", businessProjectId, 2, canvasProjectId, businessProjectId],
  ]);
});

test("cloud storage detects and adopts the current head when sampled revision history is stale", async () => {
  const local = localStore(content("local"));
  const initialDocument = canvasContentToDocument(content("revision-2"), {
    canvasProjectId,
    projectId: canvasProjectId,
  });
  const remoteDocument = canvasContentToDocument(content("revision-3"), {
    canvasProjectId,
    projectId: canvasProjectId,
  });
  const calls = [];
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 2, document: initialDocument } };
    },
    async getCanvasHead(id) {
      calls.push(["head", id]);
      return { head: { canvasProjectId: id, serverRevision: 3, document: remoteDocument } };
    },
    async listCanvasRevisions() { throw new Error("sampled history must not be used for remote checks"); },
    async getCanvasRevision() { throw new Error("sampled history must not be used for remote checks"); },
  };
  const storage = createCloudCanvasStorage({ localStore: local, creatorApi: api, projectId: canvasProjectId });
  await storage.load();
  const update = await storage.checkForRemoteUpdate();
  assert.equal(update.serverRevision, 3);
  assert.equal(update.content.elements[0].text, "revision-3");
  await storage.adoptRemoteUpdate(update);
  assert.equal(storage.getCloudCanvas().serverRevision, 3);
  assert.equal(local.value.elements[0].text, "revision-3");
  assert.equal(await storage.checkForRemoteUpdate(), null);
  assert.deepEqual(calls, [
    ["head", canvasProjectId],
    ["head", canvasProjectId],
  ]);
});

test("canvas editor only applies remote revisions while local content is clean and suppresses echo saves", () => {
  assert.match(canvasEditorSource, /canCheckCanvasRemoteUpdate\(\{/);
  assert.match(canvasEditorSource, /canAdoptCanvasRemoteUpdate\(\{/);
  assert.match(canvasEditorSource, /storage\.checkForRemoteUpdate\(\)/);
  assert.match(canvasEditorSource, /storage\.adoptRemoteUpdate\(update\)/);
  assert.match(canvasEditorSource, /remoteApplyFingerprintRef\.current = canvasVersionFingerprint\(\{[\s\S]*?elements: remoteElements,[\s\S]*?files: remoteFiles,[\s\S]*?\}\)/);
  assert.match(canvasEditorSource, /const remoteElements = hydrateCanvasElementsForDisplay\([\s\S]*?remoteContent\.elements/);
  assert.match(canvasEditorSource, /projectCanvasConnectionsForView\(api, remoteElements, \{ rebase: true \}\)/);
  const adoptionIndex = canvasEditorSource.indexOf("const adoption = storage.adoptRemoteUpdate(update)");
  const adoptionCommitIndex = canvasEditorSource.indexOf("if (!await adoption) return;", adoptionIndex);
  const projectionIndex = canvasEditorSource.indexOf("remoteApplyFingerprintRef.current = canvasVersionFingerprint({", adoptionCommitIndex);
  assert.ok(adoptionIndex >= 0 && adoptionCommitIndex > adoptionIndex && projectionIndex > adoptionCommitIndex);
  assert.match(canvasEditorSource, /if \(applyingRemote\) \{[\s\S]*remoteApplyFingerprintRef\.current = "";[\s\S]*return;/);
  assert.doesNotMatch(canvasEditorSource, /onlineMembers|remoteCursor|presenceCount/);
});

test("server conflict and version projections rebase transient connection visibility", () => {
  const projectedApplications = newCanvasPage.match(/projectCanvasConnectionsForView\(api, hydratedContent\.elements \?\? \[\], \{ rebase: true \}\)/g) ?? [];
  assert.equal(projectedApplications.length, 2);
});

test("remote sync gates hidden, dirty, retrying, and in-flight saves before and after a request", async () => {
  const clean = {
    active: true,
    checking: false,
    online: true,
    visibilityState: "visible",
    pending: null,
    saveTimer: null,
    saveRetryTimer: null,
    saveInFlight: false,
  };
  assert.equal(canCheckCanvasRemoteUpdate(clean), true);
  assert.equal(canCheckCanvasRemoteUpdate({ ...clean, visibilityState: "hidden" }), false);
  assert.equal(canCheckCanvasRemoteUpdate({ ...clean, pending: content("dirty") }), false);
  assert.equal(canCheckCanvasRemoteUpdate({ ...clean, saveTimer: 1 }), false);
  assert.equal(canCheckCanvasRemoteUpdate({ ...clean, saveRetryTimer: 2 }), false);
  assert.equal(canCheckCanvasRemoteUpdate({ ...clean, saveInFlight: true }), false);

  let releaseRequest;
  const request = new Promise((resolve) => { releaseRequest = resolve; });
  const liveState = { ...clean };
  const check = (async () => {
    assert.equal(canCheckCanvasRemoteUpdate(liveState), true);
    const update = await request;
    return canAdoptCanvasRemoteUpdate(liveState, update);
  })();
  liveState.saveInFlight = true;
  releaseRequest({ content: content("remote") });
  assert.equal(await check, false);
  assert.equal(canAdoptCanvasRemoteUpdate({ ...clean, visibilityState: "hidden" }, { content: content("remote") }), false);
});

test("remote display state adopts cloud settings while preserving local viewport and selection", () => {
  const current = {
    viewBackgroundColor: "#111111",
    gridModeEnabled: true,
    theme: "dark",
    scrollX: 45,
    scrollY: -18,
    zoom: { value: 1.4 },
    selectedElementIds: { local: true },
  };
  assert.deepEqual(mergeCanvasRemoteAppState(current, {
    viewBackgroundColor: "#fafafa",
    gridModeEnabled: false,
    theme: "light",
  }), {
    ...current,
    viewBackgroundColor: "#fafafa",
    gridModeEnabled: false,
    theme: "light",
  });
});

test("remote echo detection ignores transient Excalidraw revisions but retains content changes", () => {
  const remote = content("remote");
  const fingerprint = canvasVersionFingerprint(remote);
  const echoed = {
    ...remote,
    elements: remote.elements.map((element) => ({ ...element, version: 9, versionNonce: 10, updated: 11 })),
  };
  assert.equal(isCanvasRemoteEcho(echoed, fingerprint), true);
  assert.equal(isCanvasRemoteEcho(content("local-change"), fingerprint), false);
  assert.equal(isCanvasRemoteEcho(remote, ""), false);
  assert.deepEqual(classifyCanvasRemoteChange(content("intermediate-old-scene"), fingerprint, true), { echo: false, suppress: true });
  assert.deepEqual(classifyCanvasRemoteChange(content("intermediate-old-scene"), fingerprint, false), { echo: false, suppress: false });
});

test("remote adoption serializes its fallback write before an immediately queued local save", async () => {
  const writes = [];
  let releaseRemoteWrite;
  const local = {
    async load() { return content("revision-2"); },
    async save(value) {
      writes.push(`start:${value.elements[0].text}`);
      if (value.elements[0].text === "revision-3") {
        await new Promise((resolve) => { releaseRemoteWrite = resolve; });
      }
      writes.push(`end:${value.elements[0].text}`);
    },
    async remove() {},
  };
  const initialDocument = canvasContentToDocument(content("revision-2"), { canvasProjectId, projectId: canvasProjectId });
  const remoteDocument = canvasContentToDocument(content("revision-3"), { canvasProjectId, projectId: canvasProjectId });
  const cloudSaves = [];
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 2, document: initialDocument } };
    },
    async saveStandaloneCanvas(_id, input) {
      cloudSaves.push(input.clientRevision);
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 4, document: input.document } };
    },
  };
  const storage = createCloudCanvasStorage({ localStore: local, creatorApi: api, projectId: canvasProjectId });
  await storage.load();
  writes.length = 0;
  const adoption = storage.adoptRemoteUpdate({
    serverRevision: 3,
    document: remoteDocument,
    content: content("revision-3"),
  });
  const localSave = storage.save("ignored", content("local-after-remote"));
  while (!releaseRemoteWrite) await Promise.resolve();
  assert.deepEqual(writes, ["start:revision-3"]);
  releaseRemoteWrite();
  await Promise.all([adoption, localSave]);
  assert.deepEqual(writes, [
    "start:revision-3",
    "end:revision-3",
    "start:local-after-remote",
    "end:local-after-remote",
  ]);
  assert.deepEqual(cloudSaves, [3]);
});

test("a queued remote adoption cannot overwrite a local draft after the preceding save conflicts", async () => {
  const local = localStore();
  const syncState = localStore();
  const initialDocument = canvasContentToDocument(content("revision-1"), { canvasProjectId, projectId: canvasProjectId });
  const remoteDocument = canvasContentToDocument(content("revision-2-remote"), { canvasProjectId, projectId: canvasProjectId });
  let rejectSave;
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 1, document: initialDocument } };
    },
    async saveStandaloneCanvas() {
      return new Promise((_resolve, reject) => { rejectSave = reject; });
    },
  };
  const storage = createCloudCanvasStorage({
    localStore: local,
    syncStateStore: syncState,
    creatorApi: api,
    projectId: canvasProjectId,
    retryDelays: [],
  });
  await storage.load();

  const localSave = storage.save("ignored", content("local-draft"));
  while (!rejectSave) await Promise.resolve();
  const adoption = storage.adoptRemoteUpdate({
    serverRevision: 2,
    document: remoteDocument,
    content: content("revision-2-remote"),
  });
  const conflict = new Error("conflict");
  conflict.errorCode = "canvas_revision_conflict";
  conflict.details = { serverRevision: 2, serverDocument: remoteDocument };
  rejectSave(conflict);

  assert.deepEqual(await localSave, { status: "conflict", serverRevision: 2 });
  assert.equal(await adoption, false);
  assert.equal(local.value.elements[0].text, "local-draft");
  assert.equal(syncState.value.cloudPending, true);
});

test("revision conflicts retain the local draft until the server version is explicitly accepted", async () => {
  const local = localStore();
  const recorded = [];
  const serverDocument = canvasContentToDocument(content("server-wins"), {
    canvasProjectId,
    projectId: canvasProjectId,
    now: () => "2026-07-19T00:00:00.000Z",
  });
  let conflicted;
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 1, document: serverDocument } };
    },
    async saveStandaloneCanvas() {
      const error = new Error("conflict");
      error.errorCode = "canvas_revision_conflict";
      error.details = { serverRevision: 2, serverDocument };
      throw error;
    },
  };
  const storage = createCloudCanvasStorage({
    localStore: local,
    creatorApi: api,
    projectId: canvasProjectId,
    onConflict: (next) => { conflicted = next; },
    historyStore: { async record(value, metadata) { recorded.push([value, metadata]); } },
  });
  await storage.load();
  await storage.save("ignored", content("client-loses"));
  assert.equal(conflicted.elements[0].text, "server-wins");
  assert.equal(local.value.elements[0].text, "client-loses");
  assert.equal(recorded[0][0].elements[0].text, "client-loses");
  assert.equal(recorded[0][1].source, "conflict");
  const resolved = await storage.resolveConflict("server");
  assert.equal(resolved.status, "saved");
  assert.equal(resolved.source, "cloud");
  assert.equal(resolved.serverRevision, 2);
  assert.equal(resolved.content.elements[0].text, "server-wins");
  assert.equal(local.value.elements[0].text, "server-wins");
});

test("a failed server projection keeps the local draft and pending conflict", async () => {
  const local = localStore();
  const serverDocument = canvasContentToDocument(content("server-wins"), { canvasProjectId, projectId: canvasProjectId });
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 1, document: serverDocument } };
    },
    async saveStandaloneCanvas() {
      const error = new Error("conflict");
      error.errorCode = "canvas_revision_conflict";
      error.details = { serverRevision: 2, serverDocument };
      throw error;
    },
  };
  const storage = createCloudCanvasStorage({ localStore: local, creatorApi: api, projectId: canvasProjectId });
  await storage.load();
  await storage.save("ignored", content("local-draft"));

  await assert.rejects(
    storage.resolveConflict("server", { beforeCommit() { throw new Error("projection failed"); } }),
    /projection failed/,
  );
  assert.equal(local.value.elements[0].text, "local-draft");
  assert.equal((await storage.save("ignored", content("newer-local"))).status, "conflict");

  const resolved = await storage.resolveConflict("server", { beforeCommit() {} });
  assert.equal(resolved.content.elements[0].text, "server-wins");
  assert.equal(local.value.elements[0].text, "server-wins");
});

test("accepting the server after a conflict reloads the latest remote revision", async () => {
  const local = localStore();
  const firstDocument = canvasContentToDocument(content("server-v1"), { canvasProjectId, projectId: canvasProjectId });
  const conflictDocument = canvasContentToDocument(content("server-v2"), { canvasProjectId, projectId: canvasProjectId });
  const latestDocument = canvasContentToDocument(content("server-v3"), { canvasProjectId, projectId: canvasProjectId });
  let phase = "initial";
  const api = {
    async getStandaloneCanvas() {
      return phase === "conflict"
        ? { canvas: { canvasProjectId, projectId: null, serverRevision: 3, document: latestDocument } }
        : { canvas: { canvasProjectId, projectId: null, serverRevision: 1, document: firstDocument } };
    },
    async saveStandaloneCanvas() {
      phase = "conflict";
      const error = new Error("conflict");
      error.errorCode = "canvas_revision_conflict";
      error.details = { serverRevision: 2, serverDocument: conflictDocument };
      throw error;
    },
  };
  const storage = createCloudCanvasStorage({ localStore: local, creatorApi: api, projectId: canvasProjectId });
  await storage.load();
  await storage.save("ignored", content("local-draft"));
  const resolved = await storage.resolveConflict("server");
  assert.equal(resolved.serverRevision, 3);
  assert.equal(resolved.content.elements[0].text, "server-v3");
  assert.equal(local.value.elements[0].text, "server-v3");
});

test("cloud saves retry transient failures with bounded backoff", async () => {
  const initialDocument = canvasContentToDocument(content("server"), { canvasProjectId, projectId: canvasProjectId });
  const delays = [];
  let attempts = 0;
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 3, document: initialDocument } };
    },
    async saveStandaloneCanvas(_id, input) {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("temporarily unavailable");
        error.status = 503;
        throw error;
      }
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 4, document: input.document } };
    },
  };
  const storage = createCloudCanvasStorage({
    localStore: localStore(),
    creatorApi: api,
    projectId: canvasProjectId,
    retryDelays: [25, 75],
    sleep: async (delay) => { delays.push(delay); },
  });

  assert.deepEqual(await storage.save("ignored", content("saved-after-retry")), { status: "saved", source: "cloud", serverRevision: 4 });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [25, 75]);
});

test("a pending conflict freezes automatic cloud writes until local overwrite is explicitly chosen", async () => {
  const local = localStore();
  const serverDocument = canvasContentToDocument(content("server"), { canvasProjectId, projectId: canvasProjectId });
  const cloudCalls = [];
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 1, document: serverDocument } };
    },
    async saveStandaloneCanvas(_id, input) {
      cloudCalls.push(input);
      if (cloudCalls.length === 1) {
        const error = new Error("conflict");
        error.errorCode = "canvas_revision_conflict";
        error.details = { serverRevision: 2, serverDocument };
        throw error;
      }
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 3, document: input.document } };
    },
  };
  const storage = createCloudCanvasStorage({ localStore: local, creatorApi: api, projectId: canvasProjectId });

  assert.deepEqual(await storage.save("ignored", content("first-local")), { status: "conflict", serverRevision: 2 });
  assert.deepEqual(await storage.save("ignored", content("latest-local")), { status: "conflict", serverRevision: 2 });
  assert.equal(cloudCalls.length, 1);
  assert.equal(local.value.elements[0].text, "latest-local");

  assert.deepEqual(await storage.resolveConflict("local", content("latest-local")), { status: "saved", source: "cloud", serverRevision: 3 });
  assert.equal(cloudCalls.length, 2);
  assert.equal(cloudCalls[1].clientRevision, 2);
  assert.equal(canvasDocumentToContent(cloudCalls[1].document).elements[0].text, "latest-local");
});

test("a pending conflict survives reload without replacing the local draft", async () => {
  const local = localStore();
  const conflicts = localStore();
  const serverDocument = canvasContentToDocument(content("server"), { canvasProjectId, projectId: canvasProjectId });
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 2, document: serverDocument } };
    },
    async saveStandaloneCanvas() {
      const error = new Error("conflict");
      error.errorCode = "canvas_revision_conflict";
      error.details = { serverRevision: 2, serverDocument };
      throw error;
    },
  };
  const first = createCloudCanvasStorage({ localStore: local, conflictStore: conflicts, creatorApi: api, projectId: canvasProjectId });
  await first.load();
  await first.save("ignored", content("local-draft"));

  let reloadedConflict = null;
  const reloaded = createCloudCanvasStorage({
    localStore: local,
    conflictStore: conflicts,
    creatorApi: api,
    projectId: canvasProjectId,
    onConflict: (serverContent) => { reloadedConflict = serverContent; },
  });
  assert.equal((await reloaded.load()).elements[0].text, "local-draft");
  assert.equal(reloaded.getInitialSaveState(), "conflict");
  assert.equal(reloadedConflict.elements[0].text, "server");
});

test("a cloud-pending draft restores a local-only save state while the server remains unavailable", async () => {
  const storage = createCloudCanvasStorage({
    localStore: localStore(content("offline-draft")),
    syncStateStore: localStore({ cloudPending: true }),
    creatorApi: { async getStandaloneCanvas() { throw new Error("offline"); } },
    projectId: canvasProjectId,
  });

  assert.equal((await storage.load()).elements[0].text, "offline-draft");
  assert.equal(storage.getInitialSaveState(), "local");
});

test("the page applies the restored document save state before mounting the ready canvas", () => {
  assert.match(newCanvasPage, /\[saveState, setSaveState\] = useState\("loading"\)/);
  assert.match(newCanvasPage, /setSaveState\(canvasStorage\.getInitialSaveState\?\.\(\) \?\? "saved"\)/);
  assert.match(newCanvasPage, /\.catch\(\(\) => \{ if \(active\) setSaveState\("error"\); \}\)/);
});

test("a restored local-only draft is requeued so online recovery does not require another edit", () => {
  assert.match(canvasEditorSource, /storage\?\.getInitialSaveState\?\.\(\) === "local"/);
  assert.match(canvasEditorSource, /storage\?\.getInitialSaveState\?\.\(\) === "local"\) \{[\s\S]*?pendingRef\.current = content;[\s\S]*?void persist\(content\);/);
  assert.match(canvasEditorSource, /window\.addEventListener\("online", flushWhenOnline\)/);
});

test("the canvas renders explicit conflict choices instead of silently projecting the server document", () => {
  assert.match(newCanvasPage, /conflictStore: createLocalCanvasStore/);
  assert.match(newCanvasPage, /syncStateStore: createLocalCanvasStore/);
  assert.match(newCanvasPage, /setSaveConflict\(\{ serverContent \}\)/);
  assert.match(newCanvasPage, /使用云端版本/);
  assert.match(newCanvasPage, /保留本地并覆盖云端/);
  assert.match(newCanvasPage, /canvasStorage\.resolveConflict\?\.\("server", \{/);
  assert.match(newCanvasPage, /beforeCommit: \(content\) => applyContentToCanvasApi\(canvasApi, content\)/);
  assert.match(newCanvasPage, /canvasStorage\.resolveConflict\?\.\("local", snapshotCanvasContent\(canvasApi\)\)/);
  assert.doesNotMatch(newCanvasPage, /onConflict: \(content\) => applyContentToCanvasApi/);
});

test("cloud storage detects a conservative conflict when reconnecting an offline draft", async () => {
  const local = localStore(content("local"));
  const initialDocument = canvasContentToDocument(content("server"), { canvasProjectId, projectId: canvasProjectId });
  let online = false;
  let saved = null;
  const api = {
    async getStandaloneCanvas() {
      if (!online) throw new Error("offline");
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 4, document: initialDocument } };
    },
    async saveStandaloneCanvas(_id, input) {
      saved = input.document;
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 5, document: input.document } };
    },
  };
  const storage = createCloudCanvasStorage({ localStore: local, creatorApi: api, projectId: canvasProjectId });
  assert.equal((await storage.load()).elements[0].text, "local");
  online = true;
  assert.deepEqual(await storage.save("ignored", content("reconnected")), { status: "conflict", serverRevision: 4 });
  assert.equal(saved, null);
  assert.deepEqual(await storage.resolveConflict("local", content("reconnected")), { status: "saved", source: "cloud", serverRevision: 5 });
  assert.equal(canvasDocumentToContent(saved).elements[0].text, "reconnected");
});

test("an offline cloud canvas reports pending synchronization instead of a final local save", async () => {
  const local = localStore(content("local"));
  const api = {
    async getStandaloneCanvas() { throw new Error("offline"); },
  };
  const storage = createCloudCanvasStorage({ localStore: local, creatorApi: api, projectId: canvasProjectId });
  await storage.load();
  assert.deepEqual(await storage.save("ignored", content("offline-draft")), {
    status: "saved",
    source: "local",
    cloudPending: true,
  });
  assert.equal(local.value.elements[0].text, "offline-draft");
});

test("an offline draft survives reload and requires conflict resolution after cloud recovery", async () => {
  const local = localStore(content("server-before-offline"));
  const syncState = localStore();
  const conflicts = localStore();
  const serverDocument = canvasContentToDocument(content("server-before-offline"), {
    canvasProjectId,
    projectId: canvasProjectId,
  });
  const offlineApi = {
    async getStandaloneCanvas() { throw new Error("offline"); },
  };
  const offlineStorage = createCloudCanvasStorage({
    localStore: local,
    syncStateStore: syncState,
    conflictStore: conflicts,
    creatorApi: offlineApi,
    projectId: canvasProjectId,
  });
  await offlineStorage.load();
  await offlineStorage.save("ignored", content("offline-draft"));
  assert.equal(syncState.value.cloudPending, true);

  let conflicted = null;
  let uploaded = null;
  const recoveredStorage = createCloudCanvasStorage({
    localStore: local,
    syncStateStore: syncState,
    conflictStore: conflicts,
    creatorApi: {
      async getStandaloneCanvas() {
        return { canvas: { canvasProjectId, projectId: null, serverRevision: 7, document: serverDocument } };
      },
      async saveStandaloneCanvas(_id, input) {
        uploaded = input;
        return { canvas: { canvasProjectId, projectId: null, serverRevision: 8, document: input.document } };
      },
    },
    projectId: canvasProjectId,
    onConflict(serverContent) { conflicted = serverContent; },
  });

  assert.equal((await recoveredStorage.load()).elements[0].text, "offline-draft");
  assert.equal(conflicted.elements[0].text, "server-before-offline");
  assert.equal(conflicts.value.serverRevision, 7);
  assert.deepEqual(await recoveredStorage.resolveConflict("local", content("offline-draft")), {
    status: "saved",
    source: "cloud",
    serverRevision: 8,
  });
  assert.equal(canvasDocumentToContent(uploaded.document).elements[0].text, "offline-draft");
  assert.equal(syncState.value.cloudPending, false);
  assert.equal(syncState.value.contentFingerprint, canvasVersionFingerprint(content("offline-draft")));
});

test("a local draft survives reload when the cloud pending marker could not be persisted", async () => {
  const local = localStore();
  const conflicts = localStore();
  const unavailableSyncState = {
    async load() { return null; },
    async save() { throw new Error("sync state unavailable"); },
    async remove() {},
  };
  const offlineStorage = createCloudCanvasStorage({
    localStore: local,
    syncStateStore: unavailableSyncState,
    conflictStore: conflicts,
    creatorApi: { async getStandaloneCanvas() { throw new Error("offline"); } },
    projectId: canvasProjectId,
  });
  await offlineStorage.load();
  await offlineStorage.save("ignored", content("offline-draft"));

  let conflicted = null;
  const serverDocument = canvasContentToDocument(content("server-before-offline"), {
    canvasProjectId,
    projectId: canvasProjectId,
  });
  const recoveredStorage = createCloudCanvasStorage({
    localStore: local,
    syncStateStore: unavailableSyncState,
    conflictStore: conflicts,
    creatorApi: {
      async getStandaloneCanvas() {
        return { canvas: { canvasProjectId, projectId: null, serverRevision: 7, document: serverDocument } };
      },
    },
    projectId: canvasProjectId,
    onConflict(serverContent) { conflicted = serverContent; },
  });

  assert.equal((await recoveredStorage.load()).elements[0].text, "offline-draft");
  assert.equal(conflicted.elements[0].text, "server-before-offline");
  assert.equal(conflicts.value.serverRevision, 7);
});

test("a first cloud load without a local record does not report a draft conflict", async () => {
  const local = localStore();
  const conflicts = localStore();
  const serverDocument = canvasContentToDocument(content("server"), {
    canvasProjectId,
    projectId: canvasProjectId,
  });
  let conflicted = null;
  const storage = createCloudCanvasStorage({
    localStore: local,
    syncStateStore: {
      async load() { return null; },
      async save() { throw new Error("sync state unavailable"); },
      async remove() {},
    },
    conflictStore: conflicts,
    creatorApi: {
      async getStandaloneCanvas() {
        return { canvas: { canvasProjectId, projectId: null, serverRevision: 1, document: serverDocument } };
      },
    },
    projectId: canvasProjectId,
    onConflict(serverContent) { conflicted = serverContent; },
  });

  assert.equal((await storage.load()).elements[0].text, "server");
  assert.equal(conflicted, null);
  assert.equal(conflicts.value, null);
});

test("a clean synced local baseline adopts a newer cloud document without a false conflict", async () => {
  const localContent = content("synced-local");
  const local = localStore(localContent);
  const syncState = localStore({
    cloudPending: false,
    contentFingerprint: canvasVersionFingerprint(localContent),
  });
  const conflicts = localStore();
  const serverDocument = canvasContentToDocument(content("newer-cloud"), {
    canvasProjectId,
    projectId: canvasProjectId,
  });
  let conflicted = null;
  const storage = createCloudCanvasStorage({
    localStore: local,
    syncStateStore: syncState,
    conflictStore: conflicts,
    creatorApi: {
      async getStandaloneCanvas() {
        return { canvas: { canvasProjectId, projectId: null, serverRevision: 8, document: serverDocument } };
      },
    },
    projectId: canvasProjectId,
    onConflict(serverContent) { conflicted = serverContent; },
  });

  assert.equal((await storage.load()).elements[0].text, "newer-cloud");
  assert.equal(conflicted, null);
  assert.equal(conflicts.value, null);
  assert.equal(syncState.value.cloudPending, false);
  assert.equal(syncState.value.contentFingerprint, canvasVersionFingerprint(content("newer-cloud")));
});

test("cloud save failures retain the local fallback and surface the error", async () => {
  const local = localStore();
  const initialDocument = canvasContentToDocument(content("server"), {
    canvasProjectId,
    projectId: canvasProjectId,
  });
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 1, document: initialDocument } };
    },
    async saveStandaloneCanvas() {
      throw new Error("cloud unavailable");
    },
  };
  const storage = createCloudCanvasStorage({
    localStore: local,
    creatorApi: api,
    projectId: canvasProjectId,
  });
  await storage.load();
  await assert.rejects(storage.save("ignored", content("local-copy")), /cloud unavailable/);
  assert.equal(local.value.elements[0].text, "local-copy");
});

test("an invalid conflict response surfaces an error instead of reporting a false save", async () => {
  const local = localStore();
  const initialDocument = canvasContentToDocument(content("server"), { canvasProjectId, projectId: canvasProjectId });
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 1, document: initialDocument } };
    },
    async saveStandaloneCanvas() {
      const error = new Error("invalid conflict");
      error.errorCode = "canvas_revision_conflict";
      error.details = { serverRevision: 2, serverDocument: { nodes: [{ id: "unknown" }] } };
      throw error;
    },
  };
  const storage = createCloudCanvasStorage({ localStore: local, creatorApi: api, projectId: canvasProjectId });

  await assert.rejects(storage.save("ignored", content("local-copy")), /invalid conflict/);
  assert.equal(local.value.elements[0].text, "local-copy");
});

test("successful cloud saves and conflict drafts record version snapshots", async () => {
  const recorded = [];
  const historyStore = {
    async record(value, metadata) { recorded.push([value.elements[0].text, metadata]); },
    async list() { return recorded.map(([text], index) => ({ id: `v${index}`, text })); },
    async get(id) { return { id, content: content("restored") }; },
    subscribe(listener) { this.listener = listener; return () => { this.listener = null; }; },
  };
  const initialDocument = canvasContentToDocument(content("server"), { canvasProjectId, projectId: canvasProjectId });
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 7, document: initialDocument } };
    },
    async saveStandaloneCanvas(id, input) {
      return { canvas: { canvasProjectId: id, projectId: null, serverRevision: 8, document: input.document } };
    },
  };
  const storage = createCloudCanvasStorage({ localStore: localStore(), creatorApi: api, projectId: canvasProjectId, historyStore });
  await storage.load();
  assert.deepEqual(await storage.save("ignored", content("saved-cloud")), { status: "saved", source: "cloud", serverRevision: 8 });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0][0], "saved-cloud");
  assert.equal(recorded[0][1].serverRevision, 8);
  assert.deepEqual(await storage.listHistory(), [{ id: "v0", text: "saved-cloud" }]);
  assert.equal((await storage.getHistoryEntry("v0")).content.elements[0].text, "restored");
  assert.equal(typeof storage.subscribeHistory(() => undefined), "function");

  api.saveStandaloneCanvas = async () => { throw new Error("offline"); };
  await assert.rejects(storage.save("ignored", content("failed-cloud")), /offline/);
  assert.equal(recorded.length, 1);

  api.saveStandaloneCanvas = async () => {
    const error = new Error("conflict");
    error.errorCode = "canvas_revision_conflict";
    error.details = { serverRevision: 9, serverDocument: initialDocument };
    throw error;
  };
  assert.deepEqual(await storage.save("ignored", content("conflicted-cloud")), { status: "conflict", serverRevision: 9 });
  assert.equal(recorded.length, 2);
  assert.equal(recorded[1][0], "conflicted-cloud");
  assert.equal(recorded[1][1].source, "conflict");
});

test("cloud history merges local conflict snapshots and converts server documents for restore", async () => {
  const localCalls = [];
  const historyStore = {
    async list() { localCalls.push("list"); return [{ id: "local-version", source: "conflict", savedAt: "2026-07-19T07:00:00.000Z" }]; },
    async get(id) { localCalls.push(["get", id]); return { id, content: content("local-version") }; },
  };
  const revisionDocument = canvasContentToDocument(content("server-version"), {
    canvasProjectId,
    projectId: businessProjectId,
  });
  const apiCalls = [];
  const api = {
    async getProjectCanvas() {
      return { canvas: { canvasProjectId, projectId: businessProjectId, serverRevision: 8, document: revisionDocument } };
    },
    async listCanvasRevisions(id, input) {
      apiCalls.push(["list", id, input.limit]);
      return { revisions: [{
        id: "revision-id",
        canvasProjectId: id,
        serverRevision: 7,
        operation: "save",
        summary: { nodeCount: 1, edgeCount: 0, mediaCount: 0 },
        createdAt: "2026-07-19T08:00:00.000Z",
      }] };
    },
    async getCanvasRevision(id, revisionId) {
      apiCalls.push(["get", id, revisionId]);
      return { revision: {
        id: revisionId,
        canvasProjectId: id,
        serverRevision: 7,
        operation: "save",
        summary: { nodeCount: 1, edgeCount: 0, mediaCount: 0 },
        createdAt: "2026-07-19T08:00:00.000Z",
        document: revisionDocument,
      } };
    },
  };
  const storage = createCloudCanvasStorage({
    localStore: localStore(),
    creatorApi: api,
    projectId: businessProjectId,
    projectCanvas: true,
    historyStore,
  });

  assert.deepEqual(await storage.listHistory(), [
    {
      id: "revision-id",
      savedAt: "2026-07-19T08:00:00.000Z",
      source: "cloud",
      serverRevision: 7,
      operation: "save",
      summary: { nodeCount: 1, edgeCount: 0, mediaCount: 0 },
    },
    { id: "local-version", source: "conflict", savedAt: "2026-07-19T07:00:00.000Z" },
  ]);
  assert.equal((await storage.getHistoryEntry("revision-id")).content.elements[0].text, "server-version");
  assert.deepEqual(apiCalls, [
    ["list", canvasProjectId, 50],
    ["get", canvasProjectId, "revision-id"],
  ]);
  assert.deepEqual(localCalls, ["list"]);
});

test("cloud history includes local snapshots and falls back when server revision reads fail", async () => {
  const localCalls = [];
  const historyStore = {
    async list() { localCalls.push("list"); return [{ id: "local-version" }]; },
    async get(id) { localCalls.push(["get", id]); return { id, content: content("local-version") }; },
  };
  const initialDocument = canvasContentToDocument(content("server"), { canvasProjectId, projectId: canvasProjectId });
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 1, document: initialDocument } };
    },
    async listCanvasRevisions() { return { revisions: [] }; },
    async getCanvasRevision() { throw new Error("offline"); },
  };
  const storage = createCloudCanvasStorage({ localStore: localStore(), creatorApi: api, projectId: canvasProjectId, historyStore });

  assert.deepEqual(await storage.listHistory(), [{ id: "local-version" }]);
  assert.deepEqual(localCalls, ["list"]);
  assert.equal((await storage.getHistoryEntry("local-version")).content.elements[0].text, "local-version");
  assert.deepEqual(localCalls, ["list", ["get", "local-version"]]);

  api.listCanvasRevisions = async () => { throw new Error("offline"); };
  assert.deepEqual(await storage.listHistory(), [{ id: "local-version" }]);
  assert.deepEqual(localCalls, ["list", ["get", "local-version"], "list"]);
});

test("cloud history pages older revisions without repeating local conflict snapshots", async () => {
  const historyStore = {
    async list() { return [{ id: "local-conflict", source: "conflict", savedAt: "2026-07-19T09:30:00.000Z" }]; },
  };
  const initialDocument = canvasContentToDocument(content("server"), { canvasProjectId, projectId: canvasProjectId });
  const calls = [];
  const revision = (serverRevision) => ({
    id: `revision-${serverRevision}`,
    serverRevision,
    operation: "save",
    summary: { nodeCount: 1, edgeCount: 0, mediaCount: 0 },
    createdAt: `2026-07-19T0${serverRevision}:00:00.000Z`,
  });
  const api = {
    async getStandaloneCanvas() {
      return { canvas: { canvasProjectId, projectId: null, serverRevision: 7, document: initialDocument } };
    },
    async listCanvasRevisions(id, input) {
      calls.push([id, input]);
      return input.beforeRevision
        ? { revisions: [revision(6)], hasMore: false, nextCursor: null }
        : { revisions: [revision(7)], hasMore: true, nextCursor: 7 };
    },
  };
  const storage = createCloudCanvasStorage({ localStore: localStore(), creatorApi: api, projectId: canvasProjectId, historyStore });

  assert.deepEqual(await storage.listHistory({ limit: 1 }), {
    entries: [
      { id: "revision-7", savedAt: "2026-07-19T07:00:00.000Z", source: "cloud", serverRevision: 7, operation: "save", summary: { nodeCount: 1, edgeCount: 0, mediaCount: 0 } },
      { id: "local-conflict", source: "conflict", savedAt: "2026-07-19T09:30:00.000Z" },
    ].sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt)),
    nextCursor: 7,
    hasMore: true,
  });
  assert.deepEqual(await storage.listHistory({ cursor: 7, limit: 1 }), {
    entries: [
      { id: "revision-6", savedAt: "2026-07-19T06:00:00.000Z", source: "cloud", serverRevision: 6, operation: "save", summary: { nodeCount: 1, edgeCount: 0, mediaCount: 0 } },
    ],
    nextCursor: null,
    hasMore: false,
  });
  assert.deepEqual(calls, [
    [canvasProjectId, { limit: 1 }],
    [canvasProjectId, { limit: 1, beforeRevision: 7 }],
  ]);
});

test("creator api reads current canvas head and bounded revision endpoints without caching", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options.cache]);
    const data = String(url).endsWith("/head")
      ? { head: { canvasProjectId: "canvas/id", serverRevision: 3 } }
      : String(url).endsWith("/revisions/revision%2Fid")
        ? { revision: { id: "revision/id" } }
        : { revisions: [] };
    return new Response(JSON.stringify({ data, requestId: "request-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    assert.deepEqual(await creatorApi.getCanvasHead("canvas/id"), { head: { canvasProjectId: "canvas/id", serverRevision: 3 } });
    assert.deepEqual(await creatorApi.listCanvasRevisions("canvas/id", { limit: 500 }), { revisions: [] });
    assert.deepEqual(await creatorApi.listCanvasRevisions("canvas/id", { limit: 25, beforeRevision: 17 }), { revisions: [] });
    assert.deepEqual(await creatorApi.getCanvasRevision("canvas/id", "revision/id"), { revision: { id: "revision/id" } });
    assert.deepEqual(calls, [
      ["/api/canvas/canvas%2Fid/head", "no-store"],
      ["/api/creator/canvas-projects/canvas%2Fid/revisions?limit=100", "no-store"],
      ["/api/creator/canvas-projects/canvas%2Fid/revisions?limit=25&beforeRevision=17", "no-store"],
      ["/api/creator/canvas-projects/canvas%2Fid/revisions/revision%2Fid", "no-store"],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("local-only saves record bounded-history candidates and canvas removal clears history", async () => {
  const calls = [];
  const historyStore = {
    async record(value, metadata) { calls.push(["record", value.elements[0].text, metadata.source]); },
    async clear() { calls.push(["clear"]); },
  };
  const storage = createCloudCanvasStorage({ localStore: localStore(), creatorApi: {}, projectId: "local-canvas", historyStore });
  assert.deepEqual(await storage.save("ignored", content("local-save")), { status: "saved", source: "local" });
  await storage.remove();
  assert.deepEqual(calls, [["record", "local-save", "local"], ["clear"]]);
});

test("lifecycle drafts recover edits when a page-close save did not finish", async () => {
  const local = localStore(content("older-local"));
  let lifecycleValue = { content: content("close-draft"), savedAt: "2026-07-19T09:00:00.000Z" };
  const lifecycleStore = {
    load() { return lifecycleValue; },
    save(value) { lifecycleValue = value; },
    remove() { lifecycleValue = null; },
  };
  const storage = createCloudCanvasStorage({ localStore: local, lifecycleStore, creatorApi: {}, projectId: "local-canvas" });
  assert.equal((await storage.load()).elements[0].text, "close-draft");
  assert.equal(local.value.elements[0].text, "close-draft");
  assert.equal(lifecycleValue, null);
  storage.stage(content("next-close-draft"));
  assert.equal(lifecycleValue.content.elements[0].text, "next-close-draft");
});

test("a lifecycle draft conflicts when the cloud advanced beyond its last synced baseline", async () => {
  const baseline = content("synced-baseline");
  const lifecycleStore = localStore({ content: content("close-draft"), savedAt: "2026-07-19T09:00:00.000Z" });
  const conflicts = localStore();
  let conflicted = null;
  const storage = createCloudCanvasStorage({
    localStore: localStore(baseline),
    lifecycleStore,
    syncStateStore: localStore({
      cloudPending: false,
      contentFingerprint: canvasVersionFingerprint(baseline),
    }),
    conflictStore: conflicts,
    creatorApi: {
      async getStandaloneCanvas() {
        return {
          canvas: {
            canvasProjectId,
            serverRevision: 2,
            document: canvasContentToDocument(content("newer-cloud"), { canvasProjectId }),
          },
        };
      },
    },
    projectId: canvasProjectId,
    onConflict(serverContent) { conflicted = serverContent; },
  });

  assert.equal((await storage.load()).elements[0].text, "close-draft");
  assert.equal(storage.getInitialSaveState(), "conflict");
  assert.equal(conflicted.elements[0].text, "newer-cloud");
  assert.equal(conflicts.value.serverRevision, 2);
});

test("an older in-flight save cannot remove a newer page-close draft", async () => {
  let releaseSave;
  let lifecycleValue = null;
  const local = {
    value: content("initial"),
    async load() { return this.value; },
    async save(value) {
      if (value.elements[0].text === "older-in-flight") {
        await new Promise((resolve) => { releaseSave = resolve; });
      }
      this.value = value;
    },
  };
  const lifecycleStore = {
    load() { return lifecycleValue; },
    save(value) { lifecycleValue = value; return true; },
    remove() { lifecycleValue = null; },
  };
  const storage = createCloudCanvasStorage({ localStore: local, lifecycleStore, creatorApi: {}, projectId: "local-canvas" });
  await storage.load();
  const olderSave = storage.save("ignored", content("older-in-flight"));
  while (!releaseSave) await Promise.resolve();
  storage.stage(content("newer-close-draft"));
  releaseSave();
  await olderSave;
  assert.equal(lifecycleValue.content.elements[0].text, "newer-close-draft");
  await storage.save("ignored", content("newer-close-draft"));
  assert.equal(lifecycleValue, null);
});
