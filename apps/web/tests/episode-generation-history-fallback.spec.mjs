import assert from "node:assert/strict";
import { test } from "node:test";
import { renderStoryboardStageForPartialUpdate } from "../src/features/production-workbench/episode-workbench-rebuilt.js";

const lastSubmission = {
  taskId: "saved-video-task",
  mediaKind: "video",
  selectedModelId: "seedance-2-0-vip",
  modelLabel: "SeeDance 2.0 VIP",
  createdAt: "2026-09-25T02:00:00.000Z",
  status: "failed",
  promptPreview: "保存的视频提示词",
  failure: { displayMessage: "参考视频时长超出模型限制" },
};
const storyboard = {
  id: "shot-history",
  title: "分镜 3",
  generationState: { lastSubmission },
};

test("restores saved submission metadata and failure when the current result is absent", () => {
  const html = renderStoryboardStageForPartialUpdate(storyboard, "video", null);
  assert.match(html, /SeeDance 2\.0 VIP/);
  assert.match(html, /saved-video-task/);
  assert.match(html, /参考视频时长超出模型限制/);
  assert.doesNotMatch(html, /未指定|待提交|待创建|任务进度：排队/);
});

test("keeps the current result authoritative over a different saved submission", () => {
  const html = renderStoryboardStageForPartialUpdate(storyboard, "video", {
    ...lastSubmission,
    taskId: "current-video-task",
    selectedModelId: "vidu-q3-pro",
    modelLabel: "Vidu Q3 Pro",
    failure: { displayMessage: "当前任务的错误说明" },
  });
  assert.match(html, /current-video-task/);
  assert.match(html, /Vidu Q3 Pro/);
  assert.match(html, /当前任务的错误说明/);
  assert.doesNotMatch(html, /saved-video-task|SeeDance 2\.0 VIP|参考视频时长超出模型限制/);
});

test("does not invent a generation record for an untouched storyboard", () => {
  const html = renderStoryboardStageForPartialUpdate({ id: "new-shot", title: "新分镜" }, "video", null);
  assert.doesNotMatch(html, /data-generation-summary|待提交|待创建/);
});
