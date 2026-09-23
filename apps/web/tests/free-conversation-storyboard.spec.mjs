import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeAgentMessage, renderCanvasAgentPanel } from "../src/features/new-canvas/canvas-agent-panel.js";
import { renderFreeConversationStoryboard } from "../src/features/new-canvas/free-conversation-storyboard.js";
import { renderCreativeDocumentBody } from "../src/features/new-canvas/free-conversation-documents.js";

function renderDocument(content, title = "全剧分镜", profile = "media_generation_only") {
  if (profile === "media_generation_only") return renderCreativeDocumentBody({ content, title });
  return renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: profile,
    canvasAgent: { messages: [normalizeAgentMessage({
      id: "storyboard", role: "tool", content: { output: { creative: {
        type: "document", documentId: "shots", title, version: 2, content,
      } } },
    })] },
  });
}

test("storyboard tables become ordered shot cards with every field and surrounding text preserved", () => {
  const html = renderDocument("## 第一场\n\n保留冷色调。\n\n| 镜号 | 时长 | 景别/运镜 | 画面 | 台词 | 提示词 | 备注 |\n| --- | --- | --- | --- | --- | --- | --- |\n| 5-5 | 4s | 中近景/平视 | 墨九幽冷笑 | 别急。 | **电影质感**，逆光。 | 情绪克制 |\n| 5-6 | 6s | 近景/缓推 | 手下抱拳 | 属下明白。 | 雨夜大殿。 | 留出停顿 |\n\n结尾保留悬念。");
  assert.equal((html.match(/class="canvas-agent-storyboard-shot"/g) || []).length, 2);
  assert.doesNotMatch(html, /<table>/);
  for (const text of ["5-5", "5-6", "4s", "6s", "中近景/平视", "墨九幽冷笑", "别急。", "<strong>电影质感</strong>", "情绪克制", "第一场", "保留冷色调。", "结尾保留悬念。"]) assert.ok(html.includes(text), text);
});

test("ordinary document tables and fenced examples keep the original preview", () => {
  for (const content of ["| 人物 | 设定 |\n| --- | --- |\n| 主角 | 分镜师 |", "```\n| 镜号 | 画面 |\n| --- | --- |\n| 1 | 雨夜 |\n```", "# 分镜 1\n\n未使用表格的原文。"] ) {
    assert.doesNotMatch(renderDocument(content), /class="canvas-agent-storyboard-shot"/);
  }
});

test("shot cards preserve safe formatting without executing model output", () => {
  const html = renderDocument('| **镜头编号** | 画面描述 |\n| --- | --- |\n| 1 | <img src=x onerror=alert(1)> **雨夜** |');
  assert.match(html, /class="canvas-agent-storyboard-shot"/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<strong>雨夜<\/strong>/);
});

test("silent shots with an empty final dialogue cell still render as cards", () => {
  const html = renderDocument("| 镜号 | 画面 | 台词 |\n| --- | --- | --- |\n| 1 | 夜雨空镜 | |\n| 2 | 主角走入 | 你来了。 |");
  assert.equal((html.match(/class="canvas-agent-storyboard-shot"/g) || []).length, 2);
  assert.match(html, /<dt>台词<\/dt><dd>—<\/dd>/);
  assert.match(html, /你来了。/);
});

test("canvas mode remains hidden and its document markup is never transformed", () => {
  const html = renderDocument("| 镜号 | 画面 |\n| --- | --- |\n| 1 | 雨夜 |", "分镜", "canvas");
  assert.equal(html, "");
  const table = '<div class="canvas-markdown-table-wrap"><table><thead><tr><th>镜号</th><th>画面</th></tr></thead><tbody><tr><td>1</td><td>雨夜</td></tr></tbody></table></div>';
  assert.equal(renderFreeConversationStoryboard(table, false), table);
});
