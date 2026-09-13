import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  clampSeriesReadOffset,
  collapseStaleSeriesReadToolResults,
  seriesReadChunkSummary,
  seriesReadResumeCursor,
  seriesReadResumeHint,
} from "../src/features/new-canvas/series-read-progress.js";

const runtimeDir = join(dirname(fileURLToPath(import.meta.url)), "../ai-canvas-runtime/assets");

test("series_read summaries keep the nextOffset cursor", () => {
  assert.equal(
    seriesReadChunkSummary("原著", 66000, 72000, 159680, true),
    "已读取原著 66001-72000 字（共 159680 字，nextOffset=72000）",
  );
});

test("continue after a failed analysis resumes from the latest read cursor, not offset 0", () => {
  const steps = [
    { outputSummary: "已读取原著 1-6000 字（共 159680 字）" },
    { outputSummary: "已读取原著 66001-72000 字（共 159680 字，nextOffset=72000）" },
  ];
  const cursor = seriesReadResumeCursor(steps, "原著");
  assert.deepEqual(cursor, { part: "原著", end: 72000, total: 159680, done: false });
  assert.equal(clampSeriesReadOffset(0, cursor), 72000);
  assert.equal(clampSeriesReadOffset(72000, cursor), 72000);
  assert.match(seriesReadResumeHint(cursor), /offset:72000/);
});

test("stale series_read bodies are folded so later rounds keep only the latest chunk", () => {
  const messages = [
    {
      role: "tool",
      content: JSON.stringify({
        status: "success",
        summary: "已读取原著 1-6000 字（共 159680 字，nextOffset=6000）",
        result: `--- 正文开始 ---\n${"A".repeat(6000)}\n--- 正文结束 ---`,
      }),
    },
    {
      role: "tool",
      content: JSON.stringify({
        status: "success",
        summary: "已读取原著 66001-72000 字（共 159680 字，nextOffset=72000）",
        result: `--- 正文开始 ---\n${"B".repeat(6000)}\n--- 正文结束 ---`,
      }),
    },
  ];
  collapseStaleSeriesReadToolResults(messages);
  const first = JSON.parse(messages[0].content);
  const last = JSON.parse(messages[1].content);
  assert.equal(first.result, "（已折叠）已读取原著 1-6000 字（共 159680 字，nextOffset=6000）");
  assert.match(last.result, /B{6000}/);
  assert.ok(messages[0].content.length < 400);
});

test("runtime patches clamp reread and fold old series_read bodies before the next model call", () => {
  const controller = readFileSync(join(runtimeDir, "conversationExecutionController-CGzzIkBM.js"), "utf8");
  const executor = readFileSync(join(runtimeDir, "agentRoundExecutor-D3Qh0nGj.js"), "utf8");
  assert.match(controller, /r<u&&\(r=u\)/);
  assert.match(controller, /不要再调用 series_read/);
  assert.match(executor, /r=foldSeriesReadTools\(r\),a=r\.reduce/);
  assert.match(executor, /正文开始 ---/);
});
