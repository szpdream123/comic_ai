import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../new-canvas/index.html", import.meta.url), "utf8");
const entry = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");
const editor = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url),
  "utf8",
);
const coreExports = await readFile(
  new URL("../new-canvas/src/loomic-core/index.js", import.meta.url),
  "utf8",
);
const shellExports = await readFile(
  new URL("../new-canvas/src/loomic-shell/index.js", import.meta.url),
  "utf8",
);
const generatorPanels = await readFile(
  new URL("../new-canvas/src/loomic-core/GeneratorPanels.jsx", import.meta.url),
  "utf8",
);
const toolMenu = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url),
  "utf8",
);
const shortcuts = await readFile(
  new URL("../new-canvas/src/loomic-core/canvas-shortcuts.js", import.meta.url),
  "utf8",
);
const generationExecution = await readFile(
  new URL("../new-canvas/src/loomic-core/canvas-generation-execution.js", import.meta.url),
  "utf8",
);
const coreStyles = await readFile(
  new URL("../new-canvas/src/loomic-core/loomic-core.css", import.meta.url),
  "utf8",
);
const workbenchChrome = await readFile(
  new URL("../new-canvas/src/WorkbenchChrome.jsx", import.meta.url),
  "utf8",
);
const sharedLogin = await readFile(
  new URL("../new-canvas/src/shared-login.js", import.meta.url),
  "utf8",
);
const appStyles = await readFile(
  new URL("../new-canvas/src/app.css", import.meta.url),
  "utf8",
);
const shellStyles = await readFile(
  new URL("../new-canvas/src/loomic-shell/loomic-shell.css", import.meta.url),
  "utf8",
);
const shell = await readFile(
  new URL("../new-canvas/src/loomic-shell/LoomicCanvasShell.jsx", import.meta.url),
  "utf8",
);
const projectDetail = await readFile(
  new URL("../src/features/production-workbench/project-detail.js", import.meta.url),
  "utf8",
);
const productionStyles = await readFile(
  new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
  "utf8",
);
const productionWorkbench = await readFile(
  new URL("../src/features/production-workbench/index.js", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
);
const { createTextNodeElement } = await import(
  new URL("../new-canvas/src/loomic-core/canvas-elements.js", import.meta.url)
);

async function readSourceTree(relativeDirectory) {
  const directory = new URL(relativeDirectory, import.meta.url);
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(entries.map(async (item) => {
    if (item.isDirectory()) return readSourceTree(`${relativeDirectory}${item.name}/`);
    if (!/\.(?:js|jsx)$/.test(item.name)) return "";
    return readFile(new URL(`${relativeDirectory}${item.name}`, import.meta.url), "utf8");
  }));
  return sources.flat().join("\n");
}

const newCanvasSource = await readSourceTree("../new-canvas/src/");

test("new canvas boots the React and Excalidraw implementation", () => {
  assert.match(html, /id="new-canvas-root"/);
  assert.match(html, /src="\/new-canvas\/app\.js"/);
  assert.match(entry, /export function mountNewCanvas\(container, options = \{\}\)/);
  assert.match(entry, /const standaloneRoot = document\.querySelector\("#new-canvas-root"\)/);
  assert.match(entry, /if \(standaloneRoot\) mountNewCanvas\(standaloneRoot\)/);
  assert.match(entry, /<LoomicCanvasShell/);
  assert.match(entry, /<CanvasEditor/);
  assert.match(sharedLogin, /const sharedAppModule = "\/app\.js"/);
  assert.match(sharedLogin, /import\(sharedAppModule\)/);
  assert.match(editor, /from "@excalidraw\/excalidraw"/);
  assert.match(editor, /<Excalidraw/);
  assert.match(editor, /langCode="zh-CN"/);
  assert.equal(packageJson.dependencies.react, "19.0.0");
  assert.equal(packageJson.dependencies["react-dom"], "19.0.0");
  assert.equal(packageJson.dependencies["@excalidraw/excalidraw"], "0.18.0");
});

test("standalone new canvas opens a shared project gallery before the editor", () => {
  assert.match(entry, /renderCanvasProjectGallery/);
  assert.match(entry, /function NewCanvasProjectGallery\(\)/);
  assert.match(entry, /catch \(error\) \{[\s\S]*?if \(isUnauthenticatedError\(error\)\) \{[\s\S]*?setStatus\("ready"\);[\s\S]*?return;/);
  assert.match(entry, /if \(projectId \|\| episodeId\) return <NewCanvasPage embedded=\{embedded\}/);
  assert.match(entry, /creatorApi\.createCanvasProject/);
  assert.match(entry, /openCanvasProject\(projectId\)/);
  assert.match(entry, /window\.location\.href = `\/new-canvas\/\?projectId=\$\{encodeURIComponent\(normalized\)\}`/);
  assert.match(appStyles, /\.lm-canvas-project-list \.canvas-project-gallery/);
  assert.doesNotMatch(appStyles, /^\.lm-canvas-project-list \.canvas-project-card\s*\{/m);
});

test("Loomic core and shell expose the complete canvas surface", () => {
  for (const exportName of [
    "CanvasEditor",
    "CanvasToolMenu",
    "CanvasLayersPanel",
    "CanvasBottomBar",
    "ImageGeneratorPanel",
    "VideoGeneratorPanel",
    "VideoPlayerPanel",
  ]) {
    assert.match(coreExports, new RegExp(`\\b${exportName}\\b`));
  }

  for (const exportName of [
    "LoomicCanvasShell",
    "ChatSidebar",
    "CanvasFilesPanel",
    "CanvasLogoMenu",
    "CanvasEmptyHint",
    "EditableProjectName",
  ]) {
    assert.match(shellExports, new RegExp(`\\b${exportName}\\b`));
  }

  assert.match(editor, /window\.localStorage\.setItem/);
  assert.match(editor, /storage\.load/);
  assert.match(entry, /indexedDB/);
  assert.match(editor, /renderEmbeddable=/);
  assert.match(editor, /<CanvasLayersPanel/);
  assert.match(editor, /<CanvasBottomBar/);
});

test("new canvas persistence waits for storage and retains the viewport", () => {
  assert.doesNotMatch(editor, /Promise\.race\(/);
  assert.match(editor, /Promise\.resolve\(storage\.load\(canvasId\)\)/);
  assert.match(editor, /scrollX: appState\.scrollX/);
  assert.match(editor, /scrollY: appState\.scrollY/);
  assert.match(editor, /zoom: appState\.zoom/);
  assert.match(entry, /objectStore\(storeName\)\.put\(content, storageKey\)[\s\S]*?removeStorage\(storageKey\)/);
  assert.match(entry, /objectStore\(storeName\)\.delete\(storageKey\)[\s\S]*?removeStorage\(storageKey\)/);
});

test("new canvas flushes pending saves across lifecycle changes and keeps selection snapshots fresh", () => {
  assert.match(editor, /window\.addEventListener\("pagehide"/);
  assert.match(editor, /document\.addEventListener\("visibilitychange"/);
  assert.match(editor, /const flushPending = useCallback/);
  assert.match(editor, /const saveChainRef = useRef\(Promise\.resolve\(\)\)/);
  assert.match(editor, /const lastScheduledContentRef = useRef\(""\)/);
  assert.match(editor, /serializedContent === lastScheduledContentRef\.current/);
  assert.match(editor, /window\.addEventListener\("online", flushWhenOnline\)/);
  assert.match(editor, /result\?\.cloudPending/);
  assert.match(editor, /element\?\.version/);
  assert.match(editor, /onClose=\{toggleLayers\}/);
  assert.match(editor, /<MemoToolMenu[^>]+onGenerate=\{onGenerate\}/);
  assert.doesNotMatch(editor, /onClose=\{\(\) => setLayersOpen\(/);
});

test("new canvas exposes a LibTV-style add menu, secondary drawing tools, and shortcut reference", () => {
  assert.match(toolMenu, /className=\{`loomic-add-node-button/);
  assert.match(toolMenu, /<span>添加节点<\/span>/);
  for (const label of ["文本", "图片生成", "视频生成", "上传素材"]) {
    assert.match(toolMenu, new RegExp(`<strong>${label}<\\/strong>`));
  }
  assert.match(toolMenu, /const DRAWING_TOOLS = \[/);
  assert.match(toolMenu, /aria-label="绘图工具"/);
  assert.match(toolMenu, /loomic-shortcuts-panel/);
  for (const title of ["创作", "缩放", "移动画布", "其他"]) {
    assert.match(shortcuts, new RegExp(`title: "${title}"`));
  }
  for (const label of ["撤销", "重做", "删除", "复制节点和连线", "成组", "解组", "节点复制", "节点创建副本", "合并分镜组", "新建节点", "连线", "生成", "放大", "缩小", "适应画布", "移动", "抓手工具", "整理画布"]) {
    assert.match(shortcuts, new RegExp(`label: "${label}"`));
  }
  assert.match(toolMenu, /event\.key === "Escape"/);
  assert.match(toolMenu, /matchesCanvasShortcut\(event, "new-node"\) && canvasFocused && workflowVisible/);
  assert.match(toolMenu, /const workflowVisible = canvasRoot\?\.closest\("\.lm-canvas-shell"\)\?\.dataset\.viewMode !== "storyboard"/);
  assert.match(toolMenu, /const toggleAddMenu = useCallback\([\s\S]*?setAddMenuOpen\(\(open\) => !open\)/);
  assert.match(toolMenu, /matchesCanvasShortcut\(event, "new-node"\)[\s\S]*?toggleAddMenu\(\)/);
  assert.match(toolMenu, /onClick=\{toggleAddMenu\}/);
  assert.doesNotMatch(toolMenu, /matchesCanvasShortcut\(event, "new-node"\)[\s\S]{0,300}?setAddMenuOpen\(true\)/);
  assert.doesNotMatch(toolMenu, /event\.key\.toLowerCase\(\) === "n"/);
  assert.match(toolMenu, /onGenerate=\{handleGenerate\}/);
  assert.match(toolMenu, /generationState\.running/);
  assert.match(toolMenu, /executeCanvasNodeGeneration/);
  assert.match(editor, /matchesCanvasShortcut\(event, "generate"\)/);
  assert.match(editor, /buildCanvasNodeGenerationRequest\(selected\[0\]\)/);
  assert.match(editor, /keyboardGenerationRunningRef\.current/);
  assert.match(editor, /executeCanvasNodeGeneration\(\{ api, request, onGenerate, generationConfig: generationConfigRef\.current \}\)/);
  assert.match(editor, /groupCanvasSelection\(currentElements, api\.getAppState\?\.\(\)\.selectedElementIds/);
  assert.match(generationExecution, /insertImageOnCanvas/);
  assert.match(generationExecution, /insertVideoOnCanvas/);
  assert.match(toolMenu, /createTextNodeElement/);
  assert.match(coreStyles, /\.loomic-add-node-menu/);
  assert.match(coreStyles, /\.loomic-drawing-menu/);
  assert.match(coreStyles, /\.loomic-shortcut-row kbd/);
});

test("LibTV movement entry switches the real selection and hand tools", () => {
  assert.match(toolMenu, /const MOVEMENT_TOOLS = \[/);
  assert.match(toolMenu, /type: "selection"[^\n]+label: "移动"[^\n]+shortcut: "V"/);
  assert.match(toolMenu, /type: "hand"[^\n]+label: "抓手工具"[^\n]+shortcut: "H"/);
  assert.match(toolMenu, /aria-label="移动"/);
  assert.match(toolMenu, /aria-label="移动工具"/);
  assert.match(toolMenu, /role="menuitemradio" aria-checked=\{activeTool === tool\.type\} aria-keyshortcuts=\{tool\.shortcut\}/);
  assert.match(toolMenu, /onClick=\{\(\) => setTool\(tool\.type\)\}/);
  assert.match(toolMenu, /activeTool === "hand" \? <Hand/);
  assert.doesNotMatch(toolMenu, /PRIMARY_TOOLS\.map/);
  assert.match(coreStyles, /\.loomic-movement-menu/);
});

test("the text add-menu action immediately creates a selected workflow node", () => {
  let sceneUpdate = null;
  const api = {
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    getSceneElements: () => [],
    updateScene: (update) => { sceneUpdate = update; },
  };
  const id = createTextNodeElement(api, { text: "雨夜街头" });
  assert.equal(sceneUpdate.elements.length, 1);
  assert.equal(sceneUpdate.elements[0].id, id);
  assert.equal(sceneUpdate.elements[0].type, "text");
  assert.equal(sceneUpdate.elements[0].text, "雨夜街头");
  assert.equal(sceneUpdate.elements[0].customData.type, "text-node");
  assert.equal(sceneUpdate.captureUpdate, "IMMEDIATELY");
});

test("new workflow nodes are placed beside existing content", () => {
  let sceneUpdate = null;
  const api = {
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    getSceneElements: () => [{ id: "existing", x: 100, y: 200, width: 300, height: 180 }],
    updateScene: (update) => { sceneUpdate = update; },
  };
  createTextNodeElement(api, { text: "下一节点" });
  assert.equal(sceneUpdate.elements[1].x, 440);
  assert.equal(sceneUpdate.elements[1].y, 275);
});

test("new canvas stays isolated from the legacy X6 canvas", () => {
  assert.doesNotMatch(newCanvasSource, /@antv\/x6/);
  assert.doesNotMatch(newCanvasSource, /canvas-x6/);
  assert.doesNotMatch(newCanvasSource, /production-workbench\/canvas/);
});

test("model generation submits real tasks and carries node identity", () => {
  assert.doesNotMatch(generatorPanels, /className="loomic-generate-button" type="button" disabled>/);
  assert.match(generatorPanels, /type: "image-generator",\s*elementId/);
  assert.match(generatorPanels, /type: "video-generator",\s*elementId/);
  assert.match(generatorPanels, /"生成图片"/);
  assert.match(generatorPanels, /"生成视频"/);
  assert.match(generatorPanels, /onGenerate\?\./);
  assert.match(newCanvasSource, /runCanvasGeneration/);
  assert.match(newCanvasSource, /createImageGenerationTask/);
  assert.match(newCanvasSource, /createStandaloneCanvasGenerationTask/);
  assert.match(newCanvasSource, /getGenerationTask/);
});

test("the main canvas navigation exposes the standalone canvas entry", () => {
  assert.match(projectDetail, /const SHOW_NEW_CANVAS_RAIL_ENTRY = true/);
  assert.match(projectDetail, /tab\.id !== "tools" \|\| !SHOW_NEW_CANVAS_RAIL_ENTRY/);
  assert.match(projectDetail, /data-action="set-nav-tab" data-tab="new-canvas"/);
  assert.match(projectDetail, /data-new-canvas-href="\$\{escapeAttr\(href\)\}"/);
  assert.match(projectDetail, /ui\.newCanvasLabel \?\? "新画布"/);
  assert.match(projectDetail, /class="rail-label">\$\{escapeHtml\(newCanvasLabel\)\}/);
  assert.match(projectDetail, /renderRailIcon\("sparkles"\)/);
  assert.doesNotMatch(projectDetail, /renderRailIcon\("plus"\)/);
  assert.match(projectDetail, /projectId/);
  assert.match(projectDetail, /episodeId/);
  assert.match(entry, /URLSearchParams\(window\.location\.search\)/);
  assert.match(projectDetail, /: "\/new-canvas\/"/);
});

test("the standalone canvas keeps the outer workbench navigation visible", () => {
  assert.match(workbenchChrome, /renderWorkbenchRail\("new-canvas", session, \{/);
  assert.match(workbenchChrome, /view === "list" \? "新画布" : "画布编辑"/);
  assert.match(workbenchChrome, /director:\s*"\/#director"/);
  assert.match(projectDetail, /activeNavTab === "new-canvas" \? "active" : ""/);
  assert.match(workbenchChrome, /production-workbench\/project-detail\.js/);
  assert.match(workbenchChrome, /className="production-workbench lm-workbench-shell"/);
  assert.match(workbenchChrome, /workbench-main tools-mode tools-canvas-/);
  assert.match(appStyles, /\.lm-shared-statusbar,[\s\S]*?\.lm-shared-rail \{[\s\S]*?display: contents/);
  assert.match(projectDetail, /export function renderWorkbenchRail/);
  assert.match(entry, /<WorkbenchChrome view="detail" embedded=\{embedded\}>/);
  assert.match(entry, /<WorkbenchChrome view="list" embedded=\{embedded\}>/);
});

test("main navigation mounts the new canvas natively without an iframe", () => {
  assert.match(projectDetail, /data-new-canvas-mount/);
  assert.doesNotMatch(projectDetail, /<iframe[\s\S]*?new-canvas/);
  assert.match(productionWorkbench, /import\(NEW_CANVAS_MODULE_URL\)/);
  assert.match(productionWorkbench, /module\.mountNewCanvas\(mount, \{/);
  assert.match(productionWorkbench, /workbench\.newCanvasUnmount\?\.\(\)/);
  assert.match(workbenchChrome, /if \(embedded\) \{[\s\S]*?className="lm-embedded-canvas"/);
  assert.match(entry, /onNavigate\(tab\)/);
  assert.match(appStyles, /\.lm-embedded-canvas/);
  assert.match(productionStyles, /\.new-canvas-embedded-surface\s*\{[\s\S]*?grid-row:\s*2;/);
  assert.match(productionStyles, /\.new-canvas-embedded-mount\s*\{/);
});

test("the standalone canvas keeps the outer workbench status menu visible", () => {
  assert.match(workbenchChrome, /renderGlobalStatusbar\(session/);
  assert.match(projectDetail, /export function renderGlobalStatusbar/);
  assert.match(html, /href="\/login\.css"/);
  assert.match(html, /production-workbench\/production-workbench\.css/);
  assert.match(html, /href="\/app-scale\.css"/);
  assert.ok(html.indexOf('href="/login.css"') < html.indexOf("production-workbench/production-workbench.css"));
});

test("new canvas surfaces follow the selected workbench theme", () => {
  assert.match(workbenchChrome, /comic-ai:production-workbench-theme/);
  assert.match(workbenchChrome, /useState\(readWorkbenchThemePreference\)/);
  assert.match(workbenchChrome, /WorkbenchThemeContext\.Provider value=\{value\}/);
  assert.match(workbenchChrome, /window\.addEventListener\("storage", handleStorage\)/);
  assert.match(entry, /<WorkbenchThemeProvider>[\s\S]*?<NewCanvasApp route=\{options\} \/>/);
  assert.match(entry, /const selectedWorkbenchTheme = useWorkbenchTheme\(\)/);
  assert.match(entry, /selectedWorkbenchTheme === "daylight" \? "light" : "dark"/);
  assert.doesNotMatch(entry, /theme="light"/);
  assert.match(appStyles, /\.lm-canvas-shell\[data-theme="dark"\][\s\S]*?--lm-accent: var\(--theme-accent-icon\)/);
  assert.match(appStyles, /\.loomic-canvas-root\[data-theme="dark"\][\s\S]*?--lc-accent: var\(--theme-accent-icon\)/);
  assert.match(appStyles, /\.lm-canvas-project-list \.canvas-project-gallery[\s\S]*?var\(--theme-app-background\)/);
});

test("the standalone canvas leaves shared workbench chrome sizing to the project styles", () => {
  assert.match(appStyles, /@media \(max-width: 768px\)/);
  assert.doesNotMatch(appStyles, /\.lm-workbench-frame/);
  assert.doesNotMatch(appStyles, /\.lm-shared-rail > \.workbench-rail\.persistent/);
  assert.doesNotMatch(appStyles, /\.lm-shared-rail \.rail-nav/);
  assert.doesNotMatch(appStyles, /(^|\n)\.global-statusbar\s*\{/);
  assert.doesNotMatch(appStyles, /(^|\n)\.workbench-rail\.persistent\s*\{/);
});

test("mobile canvas navigation reserves room for chat and keeps long labels bounded", () => {
  assert.match(shellStyles, /@media \(max-width: 520px\)/);
  assert.match(shellStyles, /\.lm-canvas-topbar \{ right: 78px;[\s\S]*?max-width: calc\(100% - 90px\)/);
  assert.match(shellStyles, /\.lm-project-name, \.lm-project-name-input \{ min-width: 0; max-width: calc\(100vw - 280px\)/);
  assert.match(shellStyles, /\.lm-menu-popover \{ width: min\(230px, calc\(100vw - 24px\)\)/);
});

test("new canvas user-facing copy is localized to Simplified Chinese", () => {
  assert.match(editor, /\["Toggle grid", "切换网格"\]/);
  assert.match(editor, /\["Canvas & Shape properties", "画布与图形属性"\]/);
  assert.match(editor, /\["Wrap selection in frame", "将选区置于画框中"\]/);
  assert.match(editor, /\["Copy link to object", "复制对象链接"\]/);
  assert.doesNotMatch(newCanvasSource, />Loomic Agent</);
  assert.doesNotMatch(newCanvasSource, /Created By Deerflow/);
  assert.doesNotMatch(newCanvasSource, />\s*由 Deerflow 创建\s*</);
  assert.doesNotMatch(newCanvasSource, />N\/A</);
  assert.doesNotMatch(newCanvasSource, /`Image \$\{index\}`/);
});

test("new canvas imports dropped and pasted media through the shared archive path", () => {
  assert.match(shell, /onDragOver=\{handleDragOver\}/);
  assert.match(shell, /onDrop=\{handleDrop\}/);
  assert.match(shell, /document\.addEventListener\("paste", handlePaste, true\)/);
  assert.match(shell, /void importFiles\(event\.dataTransfer\?\.files, anchor\)/);
  assert.match(shell, /event\.clientX - bounds\.left/);
  assert.match(shell, /anchor\.x \+ index \* 32/);
  assert.match(shell, /仅支持图片、视频或音频文件/);
  assert.match(shell, /catch \(error\)/);
  assert.match(shell, /lm-canvas-drop-overlay/);
  assert.match(shellStyles, /\.lm-canvas-drop-overlay/);
});

test("save state stays visible in the canvas header while chat is open", () => {
  assert.match(entry, /saveState=\{mergeCanvasSaveStates\(saveState, projectNameSaveState\)\}/);
  assert.match(shell, /lm-canvas-save-state/);
  assert.match(shell, /role="status" aria-live="polite"/);
  assert.match(shell, /未同步，正在重试/);
  assert.match(shell, /存在保存冲突/);
  assert.match(shellStyles, /\.lm-canvas-save-state/);
  assert.match(entry, /window\.addEventListener\("loomic-canvas:save-request", flushRequestedSave\)/);
  assert.match(entry, /void retryProjectNameSave\(\)/);
});
