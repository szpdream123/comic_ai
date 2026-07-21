import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { creatorApi } from "../src/shared/creator-api.js";
import {
  buildProjectCanvasHref,
  persistBeforeProjectCanvasNavigation,
  projectCanvasListFromPayload,
  projectCanvasScopeSuffix,
  resolveProjectCanvas,
} from "../new-canvas/src/loomic-shell/project-canvases.js";

const entry = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");
const shell = await readFile(
  new URL("../new-canvas/src/loomic-shell/LoomicCanvasShell.jsx", import.meta.url),
  "utf8",
);
const logoMenu = await readFile(
  new URL("../new-canvas/src/loomic-shell/CanvasLogoMenu.jsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../new-canvas/src/loomic-shell/loomic-shell.css", import.meta.url),
  "utf8",
);
const sharedLogin = await readFile(
  new URL("../new-canvas/src/shared-login.js", import.meta.url),
  "utf8",
);
const projectCanvasSwitcher = await readFile(
  new URL("../new-canvas/src/loomic-shell/ProjectCanvasSwitcher.jsx", import.meta.url),
  "utf8",
);

test("standalone canvas loads and exposes the server canvas project list", () => {
  assert.match(entry, /projectCanvas[\s\S]+creatorApi\.listProjectCanvases\(canvasContext\.projectId\)[\s\S]+creatorApi\.getCanvasProjects\(\)/);
  assert.match(entry, /setCanvasProjectsStatus\("loading"\)/);
  assert.match(entry, /setCanvasProjectsStatus\("ready"\)/);
  assert.match(entry, /setCanvasProjectsStatus\("error"\)/);
  assert.match(entry, /canvasProjects=\{projectCanvas \? \[\] : canvasProjects\}/);
  assert.match(shell, /canvasProjects=\{canvasProjects\}/);
});

test("the logo menu renders loading, error, empty, current and switchable states", () => {
  assert.match(logoMenu, /\{standaloneMode \? \(/);
  assert.match(logoMenu, /正在加载画布/);
  assert.match(logoMenu, /画布列表加载失败/);
  assert.match(logoMenu, /暂无画布/);
  assert.match(logoMenu, /aria-current=\{current \? "page" : undefined\}/);
  assert.match(logoMenu, /onSelectProject\?\.\(project\.id\)/);
  assert.match(styles, /\.lm-menu-project\.is-current/);
  assert.match(styles, /\.lm-menu-project-state\.is-error/);
});

test("the logo menu imports multiple image, video, and audio files through the shared archive path", () => {
  assert.match(logoMenu, />导入素材</);
  assert.match(logoMenu, /accept="image\/\*,video\/\*,audio\/\*" multiple/);
  assert.match(logoMenu, /for \(const file of files\)/);
  assert.match(logoMenu, /await onImportImage\(file, api\)/);
});

test("canvas switching keeps standalone URLs isolated from business canvas context", () => {
  assert.match(entry, /if \(projectCanvas\) return;[\s\S]+query\.set\("projectId", normalized\)/);
  assert.match(entry, /query\.delete\("episodeId"\)/);
  assert.match(entry, /onSelectProject=\{projectCanvas \? undefined : selectCanvasProject\}/);
  assert.match(entry, /onNewProject=\{projectCanvas \? undefined : createNewProject\}/);
  assert.match(entry, /onDeleteProject=\{projectCanvas \? undefined : deleteProject\}/);
  assert.match(entry, /if \(!projectCanvas\) \{[\s\S]+if \(isCloudCanvasProjectId\(canvasContext\.projectId\)\)/);
});

test("the existing canvas project collection owns each editor document, history and chat", () => {
  assert.match(entry, /const suffix = `\$\{projectId\}:\$\{episodeId\}`/);
  assert.match(entry, /projectCanvasScopeSuffix\(projectId, episodeId, businessCanvasId \|\| "default"\)/);
  assert.match(entry, /storageKey: `comic-ai:loomic-canvas:v1:\$\{scopedSuffix\}`/);
  assert.match(entry, /historyStorageKey: `comic-ai:loomic-canvas:history:v1:\$\{scopedSuffix\}`/);
  assert.match(entry, /chatStorageKey: `comic-ai:loomic-canvas:chat:v1:\$\{scopedSuffix\}`/);
  assert.match(entry, /projectNameKey: `comic-ai:loomic-canvas:name:\$\{scopedSuffix\}`/);
  assert.match(entry, /creatorApi\.getCanvasProjects\(\)/);
  assert.doesNotMatch(entry, /LOCAL_CANVAS_PROJECTS_KEY/);
  assert.doesNotMatch(entry, /id: `local-\$\{localId\}`/);
});

test("business canvas selector exposes the complete project canvas command set", () => {
  assert.match(shell, /<ProjectCanvasSwitcher/);
  assert.match(projectCanvasSwitcher, /切换画布/);
  assert.match(projectCanvasSwitcher, /新建画布/);
  assert.match(projectCanvasSwitcher, /新窗口打开/);
  assert.match(projectCanvasSwitcher, /重命名/);
  assert.match(projectCanvasSwitcher, /复制画布/);
  assert.match(projectCanvasSwitcher, /删除画布/);
  assert.match(projectCanvasSwitcher, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(styles, /\.lm-project-canvas-popover/);
  assert.match(styles, /\.lm-project-canvas-actions/);
});

test("business canvas routes choose the requested or default canvas and isolate key spaces", () => {
  const canvases = projectCanvasListFromPayload({ canvases: [
    { canvasProjectId: "canvas-a", title: "镜头构思" },
    { id: "canvas-b", name: "成片编排", isDefault: true },
  ] });
  assert.deepEqual(canvases.map(({ id, title, isDefault }) => ({ id, title, isDefault })), [
    { id: "canvas-a", title: "镜头构思", isDefault: false },
    { id: "canvas-b", title: "成片编排", isDefault: true },
  ]);
  assert.equal(resolveProjectCanvas(canvases, "canvas-a").id, "canvas-a");
  assert.equal(resolveProjectCanvas(canvases, "missing").id, "canvas-b");
  assert.equal(
    buildProjectCanvasHref("canvas-b", "https://example.test/new-canvas/?projectId=p&episodeId=e&embedded=1#node"),
    "/new-canvas/?projectId=p&episodeId=e&embedded=1&canvasId=canvas-b#node",
  );
  assert.notEqual(
    projectCanvasScopeSuffix("project", "episode", "canvas-a"),
    projectCanvasScopeSuffix("project", "episode", "canvas-b"),
  );
});

test("business canvas navigation awaits persistence and rejects conflicts or pending cloud sync", async () => {
  const calls = [];
  assert.deepEqual(await persistBeforeProjectCanvasNavigation({
    storage: { async save(canvasId, content) { calls.push([canvasId, content]); return { status: "saved", source: "cloud", serverRevision: 4 }; } },
    canvasId: "canvas-a",
    content: { elements: [{ id: "node-a" }] },
  }), { status: "saved", source: "cloud", serverRevision: 4 });
  assert.deepEqual(calls, [["canvas-a", { elements: [{ id: "node-a" }] }]]);

  await assert.rejects(
    persistBeforeProjectCanvasNavigation({ storage: { async save() { return { status: "conflict" }; } }, canvasId: "a", content: {} }),
    (error) => error.code === "canvas_navigation_conflict",
  );
  await assert.rejects(
    persistBeforeProjectCanvasNavigation({ storage: { async save() { return { status: "saved", source: "local", cloudPending: true }; } }, canvasId: "a", content: {} }),
    (error) => error.code === "canvas_navigation_cloud_pending",
  );
});

test("creator api maps project canvas CRUD and copy to the concrete canvas contract", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push([String(url), options.method ?? "GET"]);
    return new Response(JSON.stringify({ data: { canvases: [], canvas: { id: "canvas-id" } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await creatorApi.listProjectCanvases("project/id");
    await creatorApi.createProjectCanvas("project/id", { title: "新画布" });
    await creatorApi.getProjectCanvasById("project/id", "canvas/id");
    await creatorApi.saveProjectCanvasById("project/id", "canvas/id", { clientRevision: 1 });
    await creatorApi.updateProjectCanvasById("project/id", "canvas/id", { title: "已重命名" });
    await creatorApi.deleteProjectCanvasById("project/id", "canvas/id");
    await creatorApi.copyProjectCanvas("project/id", "canvas/id", { title: "副本" });
    assert.deepEqual(calls, [
      ["/api/creator/projects/project%2Fid/canvases", "GET"],
      ["/api/creator/projects/project%2Fid/canvases", "POST"],
      ["/api/creator/projects/project%2Fid/canvases/canvas%2Fid", "GET"],
      ["/api/creator/projects/project%2Fid/canvases/canvas%2Fid", "PUT"],
      ["/api/creator/projects/project%2Fid/canvases/canvas%2Fid", "PATCH"],
      ["/api/creator/projects/project%2Fid/canvases/canvas%2Fid", "DELETE"],
      ["/api/creator/projects/project%2Fid/canvases/canvas%2Fid/copy", "POST"],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("canvas creation opens the existing login modal when unauthenticated", () => {
  assert.match(entry, /if \(!hasActiveSessionUser\(session\)\) \{[\s\S]+await openSharedLoginModal\(\)/);
  assert.match(entry, /const createNewProject = useCallback[\s\S]+creatorApi\.getSession\(\{ fresh: true \}\)[\s\S]+if \(!hasActiveSessionUser\(activeSession\)\)[\s\S]+creatorApi\.createCanvasProject/);
  assert.match(entry, /if \(isUnauthenticatedError\(error\)\) \{[\s\S]+await openSharedLoginModal\(\)/);
  assert.match(sharedLogin, /const sharedAppModule = "\/app\.js"/);
  assert.match(sharedLogin, /import\(sharedAppModule\)/);
  assert.match(sharedLogin, /openLoginModal\(\)/);
  assert.doesNotMatch(entry, /id: `local-/);
});

test("standalone create, rename and delete remain connected to canvas project CRUD", () => {
  assert.match(entry, /creatorApi\.createCanvasProject/);
  assert.match(entry, /creatorApi\.updateCanvasProject/);
  assert.match(entry, /creatorApi\.deleteCanvasProject/);
  assert.doesNotMatch(entry, /deleteCanvasProject\([^)]*\)\.catch\(\(\) => undefined\)/);
  assert.match(entry, /setCanvasProjects\(\(projects\) => \{[\s\S]+return projects\.map/);
  assert.match(entry, /const projects = canvasProjects\.filter/);
  assert.match(entry, /const nextProject = projects\[0\]/);
  assert.match(logoMenu, />新建画布</);
  assert.match(logoMenu, /删除当前画布/);
});
