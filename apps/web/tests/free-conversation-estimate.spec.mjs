import assert from "node:assert/strict";
import test from "node:test";
import { describeGenerationProgress } from "../src/features/new-canvas/free-conversation-progress.js";

const submittedAt = "2026-09-05T00:00:00Z";
const now = Date.parse(submittedAt) + 90_000;
const current = { taskId: "current", kind: "video", model: "pro", status: "polling", submittedAt, progressStage: "provider_rendering" };
const history = [120, 180, 240].map((seconds, index) => ({ taskId: `past-${index}`, kind: "video", model: "pro", status: "succeeded", submittedAt, returnedAt: new Date(Date.parse(submittedAt) + seconds * 1000).toISOString() }));
test("estimates use distinct completed same-model tasks and qualify their source", () => {
  const state = describeGenerationProgress(current, [...history, history[0]], now);
  assert.equal(state.title, "视频生成中");
  assert.equal(state.elapsed, "已用时 1 分 30 秒");
  assert.equal(state.sampleCount, 3);
  assert.match(state.estimate, /本会话同模型 3 次/);
  assert.match(state.estimate, /约/);
  assert.equal(describeGenerationProgress(current, history.slice(0, 2), now).sampleCount, 0);
  assert.match(describeGenerationProgress(current, history.map(t => ({ ...t, model: "other" })), now).estimate, /暂无可靠预估/);
});
test("overdue work stays running and success without an asset is saving, never failed", () => {
  assert.match(describeGenerationProgress(current, history, now + 600_000).estimate, /超过近期参考时长/);
  assert.equal(describeGenerationProgress({ ...current, status: "succeeded" }, [], now).title, "正在保存结果");
  assert.equal(describeGenerationProgress({ ...current, status: "failed", error: "参考素材不可用" }, [], now).title, "视频生成失败");
  assert.equal(describeGenerationProgress({ ...current, status: "result_unknown" }, [], now).title, "正在核实生成结果");
  assert.equal(describeGenerationProgress({ ...current, status: "failed", progressStage: "asset_persist_failed" }, [], now).active, false);
});
test("invalid or future timestamps never fabricate elapsed time or progress percentages", () => {
  assert.equal(describeGenerationProgress({ ...current, submittedAt: "invalid" }, [], now).elapsed, "用时同步中");
  assert.equal(describeGenerationProgress({ ...current, submittedAt: new Date(now + 60000).toISOString() }, [], now).elapsed, "用时同步中");
  assert.doesNotMatch(JSON.stringify(describeGenerationProgress({ ...current, progressPercent: 60 }, [], now)), /60%/);
});
