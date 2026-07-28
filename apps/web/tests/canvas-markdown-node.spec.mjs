import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasMarkdownTextPatch,
  copyCanvasMarkdownText,
  countCanvasMarkdownText,
  formatCanvasMarkdownTextStats,
  normalizeCanvasMarkdownEditorState,
  renderCanvasMarkdownFullscreen,
  renderCanvasMarkdownNodeTools,
  resolveCanvasMarkdownText,
} from "../src/features/production-workbench/canvas/canvas-markdown-node.js";

test("Markdown text resolution prefers text and safely falls back from textHtml", () => {
  assert.equal(resolveCanvasMarkdownText({ data: { text: "# 标题\r\n正文", textHtml: "<p>stale</p>" } }), "# 标题\n正文");
  assert.equal(
    resolveCanvasMarkdownText({ textHtml: "<h1>标题 &amp; 介绍</h1><p>第一行<br>第二行 &#x1f600;</p>" }),
    "标题 & 介绍\n第一行\n第二行 😀",
  );
});

test("Markdown statistics count Unicode characters, CJK words, Latin words, and lines", () => {
  assert.deepEqual(countCanvasMarkdownText("你好 world 😀\n第二行"), {
    wordCount: 6,
    characterCount: 14,
    nonWhitespaceCharacterCount: 11,
    lineCount: 2,
  });
  assert.equal(formatCanvasMarkdownTextStats("你好 world 😀\n第二行"), "6 字词 · 14 字符");
  assert.deepEqual(countCanvasMarkdownText(""), {
    wordCount: 0,
    characterCount: 0,
    nonWhitespaceCharacterCount: 0,
    lineCount: 0,
  });
});

test("Markdown edits update the existing text and textHtml fields only", () => {
  assert.deepEqual(buildCanvasMarkdownTextPatch("# 标题\r\n\r\n<script>alert(1)</script>"), {
    text: "# 标题\n\n<script>alert(1)</script>",
    textHtml: "<p># 标题</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  });
});

test("Markdown copy writes plain source text and reports empty, unavailable, and failed states", async () => {
  const writes = [];
  assert.deepEqual(
    await copyCanvasMarkdownText({ data: { text: "**正文**", textHtml: "<strong>正文</strong>" } }, {
      clipboard: { writeText: async (text) => writes.push(text) },
    }),
    { ok: true, reason: null, text: "**正文**" },
  );
  assert.deepEqual(writes, ["**正文**"]);
  assert.deepEqual(await copyCanvasMarkdownText("", { clipboard: null }), { ok: false, reason: "empty", text: "" });
  assert.deepEqual(await copyCanvasMarkdownText("正文", { clipboard: {} }), { ok: false, reason: "unavailable", text: "正文" });
  const failed = await copyCanvasMarkdownText("正文", { clipboard: { writeText: async () => { throw new Error("denied"); } } });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "failed");
  assert.equal(failed.text, "正文");
  assert.match(failed.error.message, /denied/);
});

test("Markdown fullscreen state is transient and defaults to preview when opened", () => {
  const node = {
    id: "markdown-1",
    data: { title: "方案", text: "# 方案", textHtml: "<p># 方案</p>", markdownViewMode: "edit" },
  };
  assert.deepEqual(normalizeCanvasMarkdownEditorState(node, { open: true }), {
    nodeId: "markdown-1",
    title: "方案",
    text: "# 方案",
    viewMode: "edit",
    fullscreen: { open: true, viewMode: "preview" },
    stats: { wordCount: 2, characterCount: 4, nonWhitespaceCharacterCount: 3, lineCount: 1 },
  });
  assert.equal(normalizeCanvasMarkdownEditorState(node, { open: true, fullscreenViewMode: "invalid" }).fullscreen.viewMode, "preview");
  assert.equal(normalizeCanvasMarkdownEditorState(node, { open: false }).fullscreen.viewMode, "edit");
});

test("Markdown tools expose host actions and statistics without changing node data", () => {
  const node = { id: "markdown-2", data: { text: "你好 Markdown", markdownViewMode: "preview" } };
  const before = structuredClone(node);
  const html = renderCanvasMarkdownNodeTools(node, { copied: true });
  assert.match(html, /data-action="set-canvas-markdown-mode"/);
  assert.match(html, /data-action="copy-canvas-markdown-text"/);
  assert.match(html, /data-action="toggle-canvas-markdown-fullscreen"/);
  assert.match(html, /aria-pressed="true" data-mode="preview"|data-mode="preview" aria-pressed="true"/);
  assert.match(html, /3 字词 · 11 字符/);
  assert.deepEqual(node, before);
});

test("Markdown fullscreen renders an escaped editor and a safe preview fallback", () => {
  const node = {
    id: 'markdown-<unsafe>"',
    data: { title: '<img src=x onerror="bad">', text: '<script>alert("x")</script>', markdownViewMode: "edit" },
  };
  assert.equal(renderCanvasMarkdownFullscreen(node), "");

  const editor = renderCanvasMarkdownFullscreen(node, { open: true, fullscreenViewMode: "edit" });
  assert.match(editor, /role="dialog"/);
  assert.match(editor, /data-canvas-markdown-fullscreen-input/);
  assert.match(editor, /&lt;script&gt;alert\("x"\)&lt;\/script&gt;/);
  assert.doesNotMatch(editor, /<script>/);
  assert.doesNotMatch(editor, /<img src=x/);
  assert.match(editor, /data-node-id="markdown-&lt;unsafe&gt;&quot;"/);

  const preview = renderCanvasMarkdownFullscreen(node, { open: true });
  assert.match(preview, /data-canvas-markdown-fullscreen-preview/);
  assert.match(preview, /&lt;script&gt;alert\("x"\)&lt;\/script&gt;/);
  assert.doesNotMatch(preview, /<script>/);
});

test("Markdown fullscreen accepts the host's existing safe Markdown renderer", () => {
  const html = renderCanvasMarkdownFullscreen(
    { id: "markdown-3", data: { text: "# 标题" } },
    { open: true, renderPreview: (text) => `<h1>${text.slice(2)}</h1>` },
  );
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /data-action="set-canvas-markdown-fullscreen-mode"/);
  assert.match(html, /data-action="copy-canvas-markdown-text"/);
  assert.match(html, /data-action="toggle-canvas-markdown-fullscreen"/);
});
