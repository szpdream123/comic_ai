import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { creatorApi } from "../src/shared/creator-api.js";
import {
  persistBeforeCanvasNavigation,
} from "../new-canvas/src/loomic-shell/canvas-navigation.js";

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
test("standalone canvas loads and exposes the server canvas project list", () => {
  assert.match(entry, /const payload = await creatorApi\.getCanvasProjects\(\)/);
  assert.doesNotMatch(entry, /listProjectCanvases|getProjectCanvas|saveProjectCanvas/);
  assert.match(entry, /setCanvasProjectsStatus\("loading"\)/);
  assert.match(entry, /setCanvasProjectsStatus\("ready"\)/);
  assert.match(entry, /setCanvasProjectsStatus\("error"\)/);
  assert.match(entry, /canvasProjects=\{canvasProjects\}/);
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

test("canvas switching uses only the independent canvas identifier", () => {
  assert.match(entry, /query\.set\("canvasProjectId", normalized\)/);
  assert.match(entry, /query\.delete\("projectId"\)/);
  assert.match(entry, /query\.delete\("episodeId"\)/);
  assert.match(entry, /onSelectProject=\{selectCanvasProject\}/);
  assert.match(entry, /onNewProject=\{createNewProject\}/);
  assert.match(entry, /onDeleteProject=\{deleteProject\}/);
  assert.match(entry, /isCloudCanvasProjectId\(canvasContext\.canvasProjectId\)/);
});

test("each independent canvas owns its editor document, history and chat", () => {
  assert.match(entry, /const scopedSuffix = id\.replace/);
  assert.match(entry, /storageKey: `comic-ai:loomic-canvas:v1:\$\{scopedSuffix\}`/);
  assert.match(entry, /historyStorageKey: `comic-ai:loomic-canvas:history:v1:\$\{scopedSuffix\}`/);
  assert.match(entry, /chatStorageKey: `comic-ai:loomic-canvas:chat:v1:\$\{scopedSuffix\}`/);
  assert.match(entry, /projectNameKey: `comic-ai:loomic-canvas:name:\$\{scopedSuffix\}`/);
  assert.match(entry, /creatorApi\.getCanvasProjects\(\)/);
  assert.doesNotMatch(entry, /LOCAL_CANVAS_PROJECTS_KEY/);
  assert.doesNotMatch(entry, /id: `local-\$\{localId\}`/);
});

test("business canvas routing and CRUD are absent from the new canvas entry", () => {
  assert.doesNotMatch(entry, /BusinessCanvasRoute|businessCanvasId|projectCanvasMode/);
  assert.doesNotMatch(entry, /createProjectCanvas|copyProjectCanvas|updateProjectCanvasById|deleteProjectCanvasById/);
  assert.doesNotMatch(shell, /projectCanvasMode=\{true\}/);
});

test("independent canvas navigation awaits persistence and rejects conflicts or pending cloud sync", async () => {
  const calls = [];
  assert.deepEqual(await persistBeforeCanvasNavigation({
    storage: { async save(canvasId, content) { calls.push([canvasId, content]); return { status: "saved", source: "cloud", serverRevision: 4 }; } },
    canvasId: "canvas-a",
    content: { elements: [{ id: "node-a" }] },
  }), { status: "saved", source: "cloud", serverRevision: 4 });
  assert.deepEqual(calls, [["canvas-a", { elements: [{ id: "node-a" }] }]]);

  await assert.rejects(
    persistBeforeCanvasNavigation({ storage: { async save() { return { status: "conflict" }; } }, canvasId: "a", content: {} }),
    (error) => error.code === "canvas_navigation_conflict",
  );
  await assert.rejects(
    persistBeforeCanvasNavigation({ storage: { async save() { return { status: "saved", source: "local", cloudPending: true }; } }, canvasId: "a", content: {} }),
    (error) => error.code === "canvas_navigation_cloud_pending",
  );
});

test("creator api maps independent canvas CRUD to the standalone canvas contract", async () => {
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
    await creatorApi.getCanvasProjects();
    await creatorApi.createCanvasProject({ title: "新画布" });
    await creatorApi.updateCanvasProject("canvas/id", { title: "已重命名" });
    await creatorApi.getStandaloneCanvas("canvas/id");
    await creatorApi.saveStandaloneCanvas("canvas/id", { clientRevision: 1 });
    await creatorApi.deleteCanvasProject("canvas/id");
    assert.deepEqual(calls, [
      ["/api/creator/canvas-projects", "GET"],
      ["/api/creator/canvas-projects", "POST"],
      ["/api/creator/canvas-projects/canvas%2Fid", "PATCH"],
      ["/api/creator/canvas-projects/canvas%2Fid/canvas", "GET"],
      ["/api/creator/canvas-projects/canvas%2Fid/canvas", "PUT"],
      ["/api/creator/canvas-projects/canvas%2Fid", "DELETE"],
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
