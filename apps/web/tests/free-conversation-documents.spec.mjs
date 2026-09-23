import assert from "node:assert/strict";
import { test } from "node:test";
import { findCreativeDocument, renderCreativeDocumentCard, renderCreativeDocumentBody, creativeDocumentFilename, renderCreativeStage } from "../src/features/new-canvas/free-conversation-documents.js";
import { createCanvasAgentController } from "../src/features/new-canvas/canvas-agent-panel.js";

const doc = { type: "document", documentId: "story", title: "书店故事板", version: 2, content: "## 场景一\n\n| 镜号 | 画面 | 时长 |\n| --- | --- | --- |\n| 1-1 | 女孩翻书 | 4s |" };
test("document card keeps long content out of the conversation while exact version opens in reader", () => {
  const card = renderCreativeDocumentCard(doc, false);
  assert.match(card, /data-document-version="2"/);
  assert.match(card, /书店故事板.md/);
  assert.doesNotMatch(card, /女孩翻书|<table>/);
  const old = { ...doc, version: 1, content: "旧版本" };
  const messages = [{ creative: old }, { creative: doc }];
  assert.equal(findCreativeDocument(messages, "story", 1), old);
  assert.equal(findCreativeDocument(messages, "story"), doc);
  assert.equal(findCreativeDocument(messages, "missing", 1), null);
  const body = renderCreativeDocumentBody(doc);
  assert.match(body, /canvas-agent-storyboard-shot/);
  assert.match(body, /女孩翻书/);
});
test("reader safely renders markdown and download filename cannot inject a path", () => {
  const unsafe = { ...doc, title: '../<img onerror="bad">.md', content: '<script>bad()</script>\n\n**正文**' };
  assert.doesNotMatch(renderCreativeDocumentCard(unsafe, true), /<img/);
  assert.doesNotMatch(renderCreativeDocumentBody(unsafe), /<script>/);
  assert.match(renderCreativeDocumentBody(unsafe), /<strong>正文<\/strong>/);
  assert.doesNotMatch(creativeDocumentFilename(unsafe), /[<>:"/\\|?*]/);
});
test("stage bar uses the latest saved plan and never invents completed steps", () => {
  assert.equal(renderCreativeStage([]), "");
  const old = { creative: { type: "plan", steps: [{ title: "故事", status: "completed" }] } };
  const current = { creative: { type: "plan", steps: [{ title: "故事", status: "completed" }, { title: "生成参考图", status: "running" }, { title: "分镜", status: "pending" }] } };
  const html = renderCreativeStage([old, current]);
  assert.match(html, /1\/3/);
  assert.match(html, /生成参考图/);
  assert.doesNotMatch(html, /创作计划已完成/);
});
test("document next step only fills a draft and editing retains the chosen version", async () => {
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { messages: [{ creative: doc }], promptDraft: "保留对白。" } };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui, api: {} }, capabilityProfile: "media_generation_only" });
  try {
    await controller.handleAction({ dataset: { agentAction: "next-creative-document", documentId: "story", documentVersion: "2" } });
    assert.match(ui.canvasAgent.promptDraft, /^保留对白。\n/);
    assert.match(ui.canvasAgent.promptDraft, /第 2 版/);
    assert.match(ui.canvasAgent.promptDraft, /先不生成视频/);
    assert.equal(ui.canvasAgent.taskId, "");
    ui.canvasAgent.promptDraft = "";
    await controller.handleAction({ dataset: { agentAction: "continue-creative-document", documentId: "story", documentTitle: doc.title, documentVersion: "2" } });
    assert.match(ui.canvasAgent.promptDraft, /第 2 版继续编辑/);
    assert.equal(ui.canvasAgent.promptCreativeDocumentId, "story");
  } finally { controller.dispose(); }
});
