import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";
import {
  appendCanvasDirectorCapture,
  ensureDirectorDeskNodeBinding,
  uploadCanvasDirectorPanorama,
} from "../src/features/new-canvas/director-desk-overlay.js";
import {
  createDirectorPanoramaUploadId,
  deriveInitialNavTabForTest,
  prepareDirectorDeskMountForRender,
  ensureDirectorDeskCreationAllowed,
  resolveDirectorPanoramaUploadUrl,
  restoreDirectorDeskMountAfterRender,
  syncDirectorDeskMountTheme,
  syncWorkbenchRouteStateForTest,
} from "../src/features/production-workbench/index.js";

test("director panorama uploads use fresh sessions and persist stable object content URLs", () => {
  const firstUploadId = createDirectorPanoramaUploadId();
  const secondUploadId = createDirectorPanoramaUploadId();

  assert.match(firstUploadId, /^director-panorama:/);
  assert.notEqual(firstUploadId, secondUploadId);
  assert.equal(
    resolveDirectorPanoramaUploadUrl({
      upload: {
        storageObjectId: "object/id",
        uploadSessionId: "expired/session",
        publicUrl: "https://signed.example.test/expired",
      },
    }),
    "/api/storage/objects/object%2Fid/content?proxy=1",
  );
  assert.equal(
    resolveDirectorPanoramaUploadUrl({ upload: { uploadSessionId: "session/id" } }),
    "/api/storage/upload-sessions/session%2Fid/content",
  );
});

test("new Canvas director panorama uploads use the shared authenticated storage flow", async () => {
  const calls = [];
  const file = { name: "stage-panorama.png", type: "image/png" };
  const workbench = {
    api: {
      async uploadFile(uploadedFile, options) {
        calls.push([uploadedFile, options]);
        return { upload: { storageObjectId: "director/panorama object" } };
      },
    },
  };

  const result = await uploadCanvasDirectorPanorama(workbench, file);

  assert.equal(result.url, "/api/storage/objects/director%2Fpanorama%20object/content?proxy=1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], file);
  assert.equal(calls[0][1].category, "director-panorama");
  assert.equal(calls[0][1].purpose, "director-panorama");
  assert.equal(calls[0][1].projectId, null);
  assert.match(calls[0][1].idempotencyKey, /^director-panorama:/);
});

test("Director host writeback chains upload, Artifact append, stable node patch, and save", async () => {
  const calls = [];
  const originalDocument = {
    version: 2,
    canvasProjectId: "canvas-director",
    nodes: [{ id: "director-node", type: "ai-director", data: { directorDeskKey: "desk-1" } }],
    edges: [],
  };
  const file = { name: "reference.webm", type: "video/webm", size: 128 };
  const workbench = {
    api: {
      async uploadFile(uploadedFile, options) {
        calls.push(["upload", uploadedFile, options]);
        return { upload: { storageObjectId: "storage-video-1" } };
      },
      async appendCanvasDirectorArtifact(canvasProjectId, nodeKey, input) {
        calls.push(["append", canvasProjectId, nodeKey, input]);
        return { artifact: { id: "artifact-video-1" } };
      },
    },
    ui: {
      selectedCanvasProjectId: "canvas-director",
      canvasServerRevision: 7,
      canvasDocument: originalDocument,
      canvasDocumentsByProject: { "canvas-director": originalDocument },
    },
    updateCanvasDocument(nextDocument) {
      calls.push(["update", nextDocument]);
    },
    async saveCanvasNow() {
      calls.push(["save", this.ui.canvasDocument]);
      return { canvasProjectId: "canvas-director", serverRevision: 8 };
    },
  };

  const result = await appendCanvasDirectorCapture(workbench, originalDocument.nodes[0], file, {
    directorArtifactKind: "video",
    media: "reference-video",
  });

  assert.deepEqual(calls.map(([name]) => name), ["upload", "append", "update", "save"]);
  assert.equal(calls[0][2].category, "canvas-director-capture");
  assert.equal(calls[1][3].directorDeskKey, "desk-1");
  assert.equal(calls[1][3].storageObjectId, "storage-video-1");
  assert.equal(calls[1][3].artifactKind, "video");
  assert.equal(calls[1][3].expectedRevision, 7);
  assert.equal(calls[1][3].metadata.source, "director-desk");
  assert.equal(calls[1][3].metadata.media, "reference-video");
  assert.equal(result.capture.artifactId, "artifact-video-1");
  assert.equal(result.capture.storageObjectId, "storage-video-1");
  assert.equal(result.capture.artifactKind, "video");
  assert.equal(result.node.data.artifactId, "artifact-video-1");
  assert.equal(result.node.data.storageObjectId, "storage-video-1");
  assert.equal(result.node.data.assetVersionId, null);
  assert.equal(workbench.ui.canvasDocumentsByProject["canvas-director"], result.document);
  assert.equal(originalDocument.nodes[0].data.artifactId, undefined);
});

test("director desk creation requires an active professional membership", async () => {
  const professionalWorkbench = {
    api: {
      getMembershipStatus: async () => ({
        data: { membership: { status: "professional_active", currentTier: "professional" } },
      }),
    },
    ui: { membershipStatus: null },
  };
  const basicWorkbench = {
    api: {
      getMembershipStatus: async () => ({
        data: { membership: { status: "experience_active", currentTier: "experience" } },
      }),
    },
    ui: { membershipStatus: null },
  };

  assert.equal(
    await ensureDirectorDeskCreationAllowed(professionalWorkbench, { interactive: false }),
    true,
  );
  assert.equal(
    await ensureDirectorDeskCreationAllowed(basicWorkbench, { interactive: false }),
    false,
  );
});

test("workbench rail exposes the director desk menu without adding a home hero action", () => {
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "+86 13800138000" } },
    ui: { activeNavTab: "home" },
  });

  assert.match(html, /data-action="set-nav-tab"[\s\S]*data-tab="director"/);
  assert.match(html, /导演台/);
  assert.doesNotMatch(html, /hero-director-cta/);
});

test("director route keeps the workbench shell and renders a direct module mount", () => {
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "director",
      toast: { tone: "error", message: "至少需要 2 个镜头移动点位才能导出" },
    },
  });

  assert.match(html, /class="production-workbench"/);
  assert.match(html, /class="workbench-main\s+director-mode"/);
  assert.match(html, /class="rail-item active"[\s\S]*data-tab="director"/);
  assert.match(html, /data-director-desk-mount/);
  assert.match(html, /global-workbench-toast error/);
  assert.match(html, /至少需要 2 个镜头移动点位才能导出/);
  assert.doesNotMatch(html, /director-desk-page-header/);
  assert.doesNotMatch(html, /<iframe/i);
});

test("director desk ships only as the Lingxi Theater integrated module", () => {
  const appSource = readFileSync("apps/web/src/features/director-desk/src/App.tsx", "utf8");
  const viteSource = readFileSync("apps/web/src/features/director-desk/vite.config.ts", "utf8");
  const workbenchSource = readFileSync("apps/web/src/features/production-workbench/index.js", "utf8");

  assert.equal(existsSync("apps/web/src/features/director-desk/index.html"), false);
  assert.equal(existsSync("apps/web/src/features/director-desk/src/main.tsx"), false);
  assert.match(appSource, /director-home-shell|screen === "home"/);
  assert.doesNotMatch(viteSource, /standaloneIndex|director-desk-standalone-index/);
  assert.match(workbenchSource, /directorDeskModulePromise = import\(DIRECTOR_DESK_MODULE_URL\)/);
  assert.doesNotMatch(workbenchSource, /DIRECTOR_DESK_MODULE_URL[\s\S]*?\?v=\$\{Date\.now\(\)\}/);

  const disposeSource = workbenchSource.slice(
    workbenchSource.indexOf("function disposeDirectorDeskModule"),
    workbenchSource.indexOf("export function syncDirectorDeskMountTheme"),
  );
  assert.doesNotMatch(disposeSource, /directorDeskModulePromise\s*=\s*null/);
});

test("director Canvas writeback preserves screenshot, panorama, and video artifact metadata without opening a window", () => {
  const overlaySource = readFileSync("apps/web/src/features/new-canvas/director-desk-overlay.js", "utf8");
  const capturePanelSource = readFileSync("apps/web/src/features/director-desk/src/editor/panels/CapturePanel.tsx", "utf8");
  const artifactRequestSource = overlaySource.slice(
    overlaySource.indexOf("await api.appendCanvasDirectorArtifact"),
    overlaySource.indexOf("const appendCapture"),
  );

  assert.match(overlaySource, /directorArtifactKind/);
  assert.match(overlaySource, /panorama\|全景/);
  assert.match(overlaySource, /reference-video/);
  assert.match(overlaySource, /artifactKind: file\.type\.startsWith\("video\/"\) \? "video" : "image"/);
  assert.match(artifactRequestSource, /storageObjectId/);
  assert.doesNotMatch(artifactRequestSource, /\b(?:url|dataUrl|previewUrl)\s*:/);
  assert.match(overlaySource, /instanceId: binding\.directorDeskKey/);
  assert.match(overlaySource, /onUploadPanorama: \(file\) => uploadCanvasDirectorPanorama\(workbench, file\)/);
  assert.doesNotMatch(overlaySource, /directorDesks(?:\?\.)?\[0\]/);
  assert.doesNotMatch(overlaySource, /window\.open/);
  assert.doesNotMatch(overlaySource, /<iframe/i);
  assert.doesNotMatch(capturePanelSource, /window\.open/);
  assert.match(capturePanelSource, /anchor\.download = "director-desk-project\.json"/);
  assert.match(capturePanelSource, /URL\.revokeObjectURL\(url\)/);
});

test("unbound director nodes create a real desk and persist its stable key before opening", async () => {
  const calls = [];
  const node = { id: "director-node-1", type: "ai-director", data: { title: "场景调度" } };
  const document = {
    version: 2,
    canvasProjectId: "canvas-1",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [node],
    edges: [],
  };
  const workbench = {
    api: {
      async listDirectorDesks() {
        calls.push(["list"]);
        return { desks: [] };
      },
      async createDirectorDesk(input) {
        calls.push(["create", input]);
        return { desk: { id: "desk-stable-1", name: input.name } };
      },
    },
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasDocument: document,
      canvasDocumentsByProject: { "canvas-1": document },
    },
    updateCanvasDocument(nextDocument) {
      calls.push(["bind", nextDocument.nodes[0].data.directorDeskKey]);
    },
    async saveCanvasNow() {
      calls.push(["save", this.ui.canvasDocument.nodes[0].data.directorDeskKey]);
      return { canvasProjectId: "canvas-1", serverRevision: 2 };
    },
  };

  const binding = await ensureDirectorDeskNodeBinding(workbench, node);

  assert.deepEqual(calls, [
    ["list"],
    ["create", { name: "画布导演台 · director-node-1" }],
    ["bind", "desk-stable-1"],
    ["save", "desk-stable-1"],
  ]);
  assert.equal(binding.directorDeskKey, "desk-stable-1");
  assert.equal(binding.node.data.directorDeskKey, "desk-stable-1");
  assert.doesNotMatch(JSON.stringify(workbench.ui.canvasDocument), /https?:|blob:|data:image/);
});

test("primary users create a dedicated desk instead of reusing an existing desk", async () => {
  const calls = [];
  const node = { id: "director-node-1", type: "ai-director", data: { title: "场景调度" } };
  const document = { version: 2, canvasProjectId: "canvas-1", nodes: [node], edges: [] };
  const workbench = {
    api: {
      async listDirectorDesks() {
        calls.push("list");
        return { desks: [{ id: "desk-z" }, { id: "desk-a" }, { id: "desk-m" }] };
      },
      async createDirectorDesk(input) {
        calls.push(["create", input]);
        return { desk: { id: "desk-canvas", name: input.name } };
      },
    },
    ui: { selectedCanvasProjectId: "canvas-1", canvasDocument: document },
    updateCanvasDocument() { calls.push("bind"); },
    async saveCanvasNow() { calls.push("save"); return { serverRevision: 2 }; },
  };

  const binding = await ensureDirectorDeskNodeBinding(workbench, node);

  assert.deepEqual(calls, ["list", ["create", { name: "画布导演台 · director-node-1" }], "bind", "save"]);
  assert.equal(binding.created, true);
  assert.equal(binding.directorDeskKey, "desk-canvas");
  assert.equal(workbench.ui.canvasDocument.nodes[0].data.directorDeskKey, "desk-canvas");
});

test("each director node binds the lowest unoccupied assigned desk", async () => {
  const firstNode = { id: "director-node-1", type: "ai-director", data: { directorDeskKey: "desk-a" } };
  const secondNode = { id: "director-node-2", type: "ai-director", data: { title: "第二导演" } };
  const document = { version: 2, canvasProjectId: "canvas-1", nodes: [firstNode, secondNode], edges: [] };
  const workbench = {
    session: { user: { actorType: "team_member" } },
    api: {
      async listDirectorDesks() { return { desks: [{ id: "desk-b" }, { id: "desk-a" }] }; },
      createDirectorDesk() { throw new Error("must not create"); },
    },
    ui: { selectedCanvasProjectId: "canvas-1", canvasDocument: document },
    updateCanvasDocument() {},
    async saveCanvasNow() { return { serverRevision: 2 }; },
  };

  const binding = await ensureDirectorDeskNodeBinding(workbench, secondNode);

  assert.equal(binding.directorDeskKey, "desk-b");
  assert.equal(workbench.ui.canvasDocument.nodes[0].data.directorDeskKey, "desk-a");
  assert.equal(workbench.ui.canvasDocument.nodes[1].data.directorDeskKey, "desk-b");
});

test("director binding restores the previous local document when saving fails", async () => {
  const node = { id: "director-node-1", type: "ai-director", data: { title: "场景调度" } };
  const document = { version: 2, canvasProjectId: "canvas-1", nodes: [node], edges: [] };
  const documentsByProject = { "canvas-1": document };
  const updates = [];
  const workbench = {
    session: { user: { actorType: "team_member" } },
    api: {
      async listDirectorDesks() { return { desks: [{ id: "desk-a" }] }; },
    },
    ui: { selectedCanvasProjectId: "canvas-1", canvasDocument: document, canvasDocumentsByProject: documentsByProject },
    updateCanvasDocument(nextDocument) {
      updates.push(nextDocument);
      this.ui.canvasDocument = nextDocument;
      this.ui.canvasDocumentsByProject = { "canvas-1": nextDocument };
    },
    async saveCanvasNow() { throw new Error("save failed"); },
  };

  await assert.rejects(ensureDirectorDeskNodeBinding(workbench, node), /save failed/);

  assert.equal(updates.length, 2);
  assert.equal(updates[0].nodes[0].data.directorDeskKey, "desk-a");
  assert.equal(updates[1], document);
  assert.equal(workbench.ui.canvasDocument, document);
  assert.equal(workbench.ui.canvasDocumentsByProject, documentsByProject);
  assert.equal(workbench.ui.canvasDocument.nodes[0].data.directorDeskKey, undefined);
});

test("unbound member director nodes fail clearly when no desk is assigned", async () => {
  const node = { id: "director-node-1", type: "ai-director", data: {} };
  const document = { version: 2, canvasProjectId: "canvas-1", nodes: [node], edges: [] };
  let createCalls = 0;
  const workbench = {
    session: { user: { actorType: "team_member", teamMember: { id: "member-1" } } },
    api: {
      async listDirectorDesks() { return { desks: [] }; },
      async createDirectorDesk() { createCalls += 1; return { desk: { id: "forbidden" } }; },
    },
    ui: { selectedCanvasProjectId: "canvas-1", canvasDocument: document },
    updateCanvasDocument() {},
    async saveCanvasNow() { return { serverRevision: 2 }; },
  };

  await assert.rejects(
    ensureDirectorDeskNodeBinding(workbench, node),
    /canvas_director_assignment_required/,
  );
  assert.equal(createCalls, 0);
  assert.equal(workbench.ui.canvasDocument.nodes[0].data.directorDeskKey, undefined);
  assert.match(
    readFileSync("apps/web/src/features/new-canvas/director-desk-overlay.js", "utf8"),
    /当前子账户未分配可用导演台，请联系管理员分配/,
  );
});

test("bound director nodes reuse their saved key without creating another desk", async () => {
  const node = { id: "director-node-1", type: "ai-director", data: { directorDeskKey: "desk-stable-1" } };
  const document = { version: 2, canvasProjectId: "canvas-1", nodes: [node], edges: [] };
  const binding = await ensureDirectorDeskNodeBinding({
    api: {
      async listDirectorDesks() {
        return { desks: [{ id: "desk-stable-1", name: "画布导演台 · director-node-1" }] };
      },
      createDirectorDesk() { throw new Error("must not create"); },
    },
    ui: { selectedCanvasProjectId: "canvas-1", canvasDocument: document },
    updateCanvasDocument() {},
    async saveCanvasNow() { return { serverRevision: 3 }; },
  }, node);
  assert.equal(binding.created, false);
  assert.equal(binding.directorDeskKey, "desk-stable-1");
});

test("primary users migrate a legacy shared binding to a dedicated Canvas desk", async () => {
  const node = { id: "director-node-1", type: "ai-director", data: { directorDeskKey: "desk-legacy" } };
  const document = { version: 2, canvasProjectId: "canvas-1", nodes: [node], edges: [] };
  const workbench = {
    api: {
      async listDirectorDesks() {
        return { desks: [{ id: "desk-legacy", name: "导演台 1 号" }] };
      },
      async createDirectorDesk(input) {
        return { desk: { id: "desk-dedicated", name: input.name } };
      },
    },
    ui: { selectedCanvasProjectId: "canvas-1", canvasDocument: document },
    updateCanvasDocument() {},
    async saveCanvasNow() { return { serverRevision: 3 }; },
  };

  const binding = await ensureDirectorDeskNodeBinding(workbench, node);

  assert.equal(binding.created, true);
  assert.equal(binding.directorDeskKey, "desk-dedicated");
  assert.equal(workbench.ui.canvasDocument.nodes[0].data.directorDeskKey, "desk-dedicated");
});

test("director node export reuses the embedded reference video bridge", () => {
  const embedSource = readFileSync("apps/web/src/features/director-desk/src/embed.tsx", "utf8");
  const overlaySource = readFileSync("apps/web/src/features/new-canvas/director-desk-overlay.js", "utf8");
  const hostSource = readFileSync("apps/web/src/features/new-canvas/index.js", "utf8");

  assert.match(embedSource, /export async function exportDirectorDeskReferenceVideo/);
  assert.match(embedSource, /requestReferenceVideoExport/);
  assert.match(overlaySource, /exportDirectorDeskReferenceVideo/);
  assert.match(overlaySource, /entryMode: "canvas"/);
  const videoWritebackSource = overlaySource.slice(
    overlaySource.indexOf("const appendVideoCapture"),
    overlaySource.indexOf("const open"),
  );
  assert.match(videoWritebackSource, /await appendFile[\s\S]*?notify\("已回写导演台参考视频", "success"\);/);
  assert.doesNotMatch(videoWritebackSource, /close\(\)/);
  assert.match(videoWritebackSource, /catch \(error\)[\s\S]*?导演台参考视频回写失败，请稍后重试/);
  assert.doesNotMatch(overlaySource, /event\.key === "Escape" && host\) close\(\)/);
  assert.match(hostSource, /onDirectorDeskExportVideo/);
  assert.doesNotMatch(hostSource, /context\.onAction\?\.\(null/);
  assert.match(hostSource, /context\.onDirectorDeskNotify/);
});

test("director hash is preserved as a workbench menu route", () => {
  const workbench = {
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "home",
      projectPanelMode: "library",
      selectedEpisodeId: null,
      episodeWorkbenchContext: null,
    },
  };

  syncWorkbenchRouteStateForTest(workbench, "#director");

  assert.equal(workbench.ui.activeNavTab, "director");
  assert.equal(deriveInitialNavTabForTest("#director"), "director");
});

test("workbench rerenders preserve the live director desk mount and editor state", () => {
  const classNames = new Set(["dark"]);
  const mount = {
    isConnected: true,
    dataset: { theme: "dark", authenticated: "false" },
    classList: {
      toggle(name, active) {
        if (active) classNames.add(name);
        else classNames.delete(name);
      },
    },
    remove() {
      this.isConnected = false;
    },
  };
  let replacement = null;
  const placeholder = {
    replaceWith(node) {
      replacement = node;
      node.isConnected = true;
    },
  };
  const workbench = {
    directorDeskMount: mount,
    root: {
      querySelector(selector) {
        return selector === "[data-director-desk-mount]" ? placeholder : null;
      },
    },
    ui: { selectedWorkbenchTheme: "daylight" },
  };

  const preserved = prepareDirectorDeskMountForRender(workbench, true);
  assert.equal(preserved, mount);
  assert.equal(mount.isConnected, false);
  assert.equal(restoreDirectorDeskMountAfterRender(workbench, preserved), true);
  assert.equal(replacement, mount);
  assert.equal(workbench.directorDeskMount, mount);
  assert.equal(mount.dataset.theme, "light");
  assert.equal(classNames.has("dark"), false);

  workbench.ui.selectedWorkbenchTheme = "turquoise";
  syncDirectorDeskMountTheme(workbench);
  assert.equal(mount.dataset.theme, "dark");
  assert.equal(classNames.has("dark"), true);
});

test("generated video previews open the newly created director desk instance", () => {
  const workbenchSource = readFileSync("apps/web/src/features/production-workbench/index.js", "utf8");

  assert.match(workbenchSource, /const initialInstanceId = String\(workbench\.ui\?\.directorDeskInitialInstanceId \?\? ""\)\.trim\(\);/);
  assert.match(workbenchSource, /initialScreen: initialInstanceId \? "editor" : "home",[\s\S]*?instanceId: initialInstanceId \|\| undefined,/);
  assert.match(workbenchSource, /workbench\.ui\.directorDeskInitialInstanceId = deskKey;[\s\S]*?workbench\.ui\.activeNavTab = "director";/);
});
