import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyCanvasStoryboardOrder,
  buildCanvasStoryboardKeyElements,
  buildCanvasStoryboardItems,
  filterCanvasStoryboardItems,
  moveCanvasStoryboardId,
  reorderCanvasStoryboardIds,
  resolveCanvasStoryboardGenerationState,
  updateCanvasStoryboardKeyElement,
} from "../new-canvas/src/loomic-shell/canvas-storyboard.js";

const elements = [
  { id: "text", type: "text", text: "ignore" },
  { id: "image-node", type: "rectangle", version: 1, customData: { type: "image-generator", title: "开场", resultUrl: "/opening.png", storyboardOrder: 2 } },
  { id: "video", type: "embeddable", link: "/shot.mp4", customData: { isVideo: true, title: "推进", storyboardOrder: 1 } },
  { id: "upload", type: "image", fileId: "file-1", customData: { title: "人物" } },
];

test("storyboard projects existing canvas media without copying unrelated shapes", () => {
  const items = buildCanvasStoryboardItems(elements, { "file-1": { dataURL: "data:image/png;base64,AA" } });
  assert.deepEqual(items.map(({ id, mediaKind }) => [id, mediaKind]), [
    ["text", "text"],
    ["video", "video"],
    ["image-node", "image"],
    ["upload", "image"],
  ]);
  assert.equal(items[2].mediaUrl, "/opening.png");
  assert.equal(items[3].mediaUrl, "data:image/png;base64,AA");
});

test("storyboard includes script text cards and editable character, scene, and prop key elements", () => {
  const source = [
    { id: "script", type: "text", text: "人物走入雨夜", version: 1 },
    { id: "character", type: "image", fileId: "role-file", version: 1, customData: { title: "林默", resourceCategory: "character", resourcePrompt: "黑色风衣" } },
    { id: "shape", type: "rectangle", version: 1 },
  ];
  const items = buildCanvasStoryboardItems(source, {});
  assert.deepEqual(items.map(({ id, mediaKind }) => [id, mediaKind]), [["script", "text"], ["character", "image"]]);
  const keyElements = buildCanvasStoryboardKeyElements(source, { "role-file": { dataURL: "data:image/png;base64,AA" } });
  assert.deepEqual(keyElements.map(({ id, category, title }) => [id, category, title]), [["character", "character", "林默"]]);
  assert.equal(keyElements[0].mediaUrl, "data:image/png;base64,AA");
  const updated = updateCanvasStoryboardKeyElement(source, "character", { title: "林默（雨夜）", description: "湿发，黑色风衣" });
  assert.equal(updated[1].customData.title, "林默（雨夜）");
  assert.equal(updated[1].customData.resourcePrompt, "湿发，黑色风衣");
  assert.equal(updated[1].version, 2);
});

test("storyboard exposes generator metadata and actionable pending or failed nodes", () => {
  const items = buildCanvasStoryboardItems([{
    id: "pending-image",
    type: "rectangle",
    customData: {
      type: "image-generator",
      prompt: "雨夜街道",
      status: "idle",
      model: "image-model",
      aspectRatio: "16:9",
      quality: "hd",
      inputImages: [{ id: "reference-1" }],
    },
  }, {
    id: "failed-video",
    type: "rectangle",
    customData: {
      type: "video-generator",
      prompt: "缓慢推进",
      status: "failed",
      model: "video-model",
      aspectRatio: "9:16",
      duration: 8,
      resolution: "1080p",
      inputImages: [{ id: "first" }, { id: "last" }],
      resultUrl: "/previous.mp4",
      error: "生成超时",
    },
  }]);

  assert.deepEqual(items.map(({ id, isGenerator, canGenerate }) => [id, isGenerator, canGenerate]), [
    ["pending-image", true, true],
    ["failed-video", true, true],
  ]);
  assert.equal(items[0].model, "image-model");
  assert.equal(items[0].referenceImageCount, 1);
  assert.equal(items[1].duration, 8);
  assert.equal(items[1].resolution, "1080p");
  assert.equal(items[1].error, "生成超时");
  assert.deepEqual(filterCanvasStoryboardItems(items, "image").map(({ id }) => id), ["pending-image"]);
  assert.deepEqual(filterCanvasStoryboardItems(items, "video").map(({ id }) => id), ["failed-video"]);
  assert.deepEqual(filterCanvasStoryboardItems(items, "pending").map(({ id }) => id), ["pending-image", "failed-video"]);
});

test("storyboard generation state keeps running and recovery truth above an older result", () => {
  const items = buildCanvasStoryboardItems([{
    id: "running-with-result",
    type: "rectangle",
    customData: { type: "image-generator", prompt: "新画面", status: "running", resultUrl: "/previous.png", pollingDetached: true },
  }, {
    id: "failed-with-result",
    type: "rectangle",
    customData: { type: "video-generator", prompt: "新镜头", status: "failed", resultUrl: "/previous.mp4", error: "生成失败" },
  }, {
    id: "updated-with-result",
    type: "rectangle",
    customData: { type: "image-generator", prompt: "新提示词", status: "completed", resultUrl: "/old.png", inputUpdated: true },
  }, {
    id: "canceled-with-result",
    type: "rectangle",
    customData: { type: "video-generator", prompt: "再次推进", status: "canceled", resultUrl: "/old.mp4" },
  }]);

  assert.deepEqual(items.map((item) => [item.id, item.canGenerate]), [
    ["running-with-result", false],
    ["failed-with-result", true],
    ["updated-with-result", true],
    ["canceled-with-result", true],
  ]);
  assert.deepEqual(items.map((item) => resolveCanvasStoryboardGenerationState(item)), [
    { running: true, statusLabel: "等待恢复结果", action: "running", actionLabel: "恢复中…" },
    { running: false, statusLabel: "生成失败", action: "retry", actionLabel: "重试" },
    { running: false, statusLabel: "输入已更新", action: "update", actionLabel: "更新生成" },
    { running: false, statusLabel: "生成已取消", action: "retry", actionLabel: "重新生成" },
  ]);
  assert.deepEqual(filterCanvasStoryboardItems(items, "pending").map(({ id }) => id), [
    "running-with-result",
    "failed-with-result",
    "updated-with-result",
    "canceled-with-result",
  ]);
});

test("storyboard preserves upstream workflow references for each media shot", () => {
  const items = buildCanvasStoryboardItems([
    { id: "script", type: "text", text: "人物走入雨夜" },
    { id: "image", type: "rectangle", customData: { type: "image-generator", title: "雨夜镜头", prompt: "雨夜" } },
    { id: "edge", type: "arrow", startBinding: { elementId: "script" }, endBinding: { elementId: "image" }, customData: { workflowEdge: true } },
  ]);
  assert.deepEqual(items.find((item) => item.id === "image").references, [{ id: "script", title: "人物走入雨夜", type: "script", portKind: "text" }]);
});

test("storyboard ordering supports drag targets and one-step movement", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(reorderCanvasStoryboardIds(items, "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(moveCanvasStoryboardId(items, "b", "backward"), ["b", "a", "c"]);
  assert.deepEqual(moveCanvasStoryboardId(items, "c", "forward"), ["a", "b", "c"]);
});

test("storyboard order persists through element metadata and advances versions", () => {
  const next = applyCanvasStoryboardOrder(elements, ["image-node", "video", "upload"]);
  assert.equal(next.find((element) => element.id === "image-node").customData.storyboardOrder, 0);
  assert.equal(next.find((element) => element.id === "image-node").version, 2);
  assert.equal(next.find((element) => element.id === "video").customData.storyboardOrder, 1);
  assert.equal(next.find((element) => element.id === "text"), elements[0]);
});

test("storyboard panel exposes reordering, locating, and refresh controls", async () => {
  const [source, storyboardStateSource, toolMenu] = await Promise.all([
    readFile(new URL("../new-canvas/src/loomic-shell/CanvasStoryboardPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-shell/canvas-storyboard.js", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(source, /aria-label="故事板"/);
  assert.match(source, /draggable/);
  assert.match(source, /上移/);
  assert.match(source, /下移/);
  assert.match(source, /定位/);
  assert.match(source, /刷新故事板/);
  for (const label of ["关键元素", "全部", "文本", "图片", "视频", "待生成", "确认生成", "重试", "保存"]) {
    assert.match(`${source}\n${storyboardStateSource}`, new RegExp(label));
  }
  assert.match(source, /executeCanvasNodeGeneration/);
  assert.match(source, /buildCanvasNodeGenerationRequest/);
  assert.match(source, /referenceImageCount/);
  assert.match(source, /item\.references/);
  assert.match(source, /lm-storyboard-reference-meta/);
  assert.match(source, /item\.error/);
  assert.match(source, /resolveCanvasStoryboardGenerationState/);
  assert.match(source, /presentation\.statusLabel/);
  assert.match(source, /presentation\.actionLabel/);
  assert.match(toolMenu, /executeCanvasNodeGeneration/);
  assert.doesNotMatch(toolMenu, /status: "completed"/);
});

test("new canvas switches between the mounted workflow and storyboard views", async () => {
  const [main, shell, editor] = await Promise.all([
    readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-shell/LoomicCanvasShell.jsx", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(main, /const \[viewMode, setViewMode\] = useState\("workflow"\)/);
  assert.match(main, /onViewModeChange=\{changeViewMode\}/);
  assert.match(main, /onGenerate=\{generateOnCanvas\}/);
  assert.match(main, /normalizedMode === "storyboard"[\s\S]*?selectedElementIds: \{\}[\s\S]*?setSelectedElements\(\[\]\)/);
  assert.match(main, /<CanvasEditor[\s\S]*?viewMode=\{viewMode\}/);
  assert.match(main, /viewMode=\{viewMode\}[\s\S]*?onApiReady=\{handleApiReady\}/);
  assert.match(editor, /matchesCanvasShortcut\(event, "save"\)[\s\S]*?if \(!workflowVisible\) return;[\s\S]*?if \(isTypingTarget\(target\)\) return;/);
  assert.match(editor, /window\.addEventListener\("pagehide", flushOnLifecycleChange\)/);
  assert.match(editor, /document\.addEventListener\("visibilitychange", flushWhenHidden\)/);
  assert.match(editor, /window\.removeEventListener\("pagehide", flushOnLifecycleChange\)[\s\S]*?flushPending\(\);/);
  assert.match(editor, /setConnectionModeActive\(false\)/);
  assert.match(editor, /api\?\.setActiveTool\?\.\(\{ type: "selection" \}\)/);
  for (const surface of ["CanvasPortsOverlay", "showToolMenu", "CanvasLayersPanel", "CanvasMinimap", "showBottomBar"]) {
    assert.match(editor, new RegExp(`workflowVisible && api &&[^\\n]*${surface}`));
  }
  assert.match(shell, /role="tablist" aria-label="画布视图"/);
  assert.match(shell, />工作流<\/button>/);
  assert.match(shell, />故事板<\/button>/);
  assert.match(shell, /<CanvasStoryboardPanel api=\{api\}/);
  assert.match(shell, /onGenerate=\{onGenerate\}/);
});
