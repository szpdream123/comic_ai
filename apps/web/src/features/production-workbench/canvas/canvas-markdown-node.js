export const CANVAS_MARKDOWN_VIEW_MODES = Object.freeze(["edit", "preview"]);

export function normalizeCanvasMarkdownViewMode(value, fallback = "edit") {
  if (CANVAS_MARKDOWN_VIEW_MODES.includes(value)) return value;
  return CANVAS_MARKDOWN_VIEW_MODES.includes(fallback) ? fallback : "edit";
}

export function resolveCanvasMarkdownText(nodeOrData = {}) {
  const data = nodeOrData?.data && typeof nodeOrData.data === "object"
    ? nodeOrData.data
    : nodeOrData;
  if (typeof data?.text === "string") return normalizeLineEndings(data.text);
  if (data?.text !== undefined && data?.text !== null) {
    return normalizeLineEndings(String(data.text));
  }
  return canvasMarkdownHtmlToText(data?.textHtml ?? "");
}

export function countCanvasMarkdownText(nodeOrText = "") {
  const text = typeof nodeOrText === "string"
    ? normalizeLineEndings(nodeOrText)
    : resolveCanvasMarkdownText(nodeOrText);
  const characters = Array.from(text);
  const nonWhitespaceCharacterCount = characters.filter((character) => !/\s/u.test(character)).length;
  const words = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu) ?? [];
  return {
    wordCount: words.length,
    characterCount: characters.length,
    nonWhitespaceCharacterCount,
    lineCount: text ? text.split("\n").length : 0,
  };
}

export function formatCanvasMarkdownTextStats(nodeOrText = "", locale = "zh-CN") {
  const stats = countCanvasMarkdownText(nodeOrText);
  return `${stats.wordCount.toLocaleString(locale)} 字词 · ${stats.characterCount.toLocaleString(locale)} 字符`;
}

export function buildCanvasMarkdownTextPatch(value) {
  const text = normalizeLineEndings(String(value ?? ""));
  return {
    text,
    textHtml: canvasMarkdownTextToHtml(text),
  };
}

export function normalizeCanvasMarkdownEditorState(node = {}, options = {}) {
  const data = node?.data && typeof node.data === "object" ? node.data : {};
  const text = options.draftText === undefined
    ? resolveCanvasMarkdownText(data)
    : normalizeLineEndings(String(options.draftText ?? ""));
  const viewMode = normalizeCanvasMarkdownViewMode(data.markdownViewMode);
  const fullscreenViewMode = normalizeCanvasMarkdownViewMode(
    options.fullscreenViewMode,
    options.open === true ? "preview" : viewMode,
  );
  return {
    nodeId: String(node?.id ?? options.nodeId ?? ""),
    title: firstText(data.title, data.label, options.title) || "Markdown 文档",
    text,
    viewMode,
    fullscreen: {
      open: options.open === true,
      viewMode: fullscreenViewMode,
    },
    stats: countCanvasMarkdownText(text),
  };
}

export async function copyCanvasMarkdownText(nodeOrText = "", options = {}) {
  const text = typeof nodeOrText === "string"
    ? normalizeLineEndings(nodeOrText)
    : resolveCanvasMarkdownText(nodeOrText);
  if (!text) return { ok: false, reason: "empty", text };
  const clipboard = Object.hasOwn(options, "clipboard")
    ? options.clipboard
    : globalThis.navigator?.clipboard;
  if (!clipboard || typeof clipboard.writeText !== "function") {
    return { ok: false, reason: "unavailable", text };
  }
  try {
    await clipboard.writeText(text);
    return { ok: true, reason: null, text };
  } catch (error) {
    return { ok: false, reason: "failed", text, error };
  }
}

export function renderCanvasMarkdownNodeTools(node = {}, options = {}) {
  const state = normalizeCanvasMarkdownEditorState(node, options);
  const nodeId = escapeAttr(state.nodeId);
  const copied = options.copied === true;
  return `<div class="canvas-markdown-parity-tools" role="toolbar" aria-label="Markdown 文档操作">
    <span class="canvas-markdown-mode" role="group" aria-label="Markdown 视图">
      ${renderModeButton("set-canvas-markdown-mode", nodeId, "edit", state.viewMode, "编辑")}
      ${renderModeButton("set-canvas-markdown-mode", nodeId, "preview", state.viewMode, "预览")}
    </span>
    <button type="button" data-action="copy-canvas-markdown-text" data-node-id="${nodeId}" aria-label="${copied ? "已复制" : "复制文本"}" title="${copied ? "已复制" : "复制文本"}">${copied ? "已复制" : "复制"}</button>
    <button type="button" data-action="toggle-canvas-markdown-fullscreen" data-node-id="${nodeId}" aria-label="全屏编辑" title="全屏编辑">全屏</button>
    <output class="canvas-markdown-text-stats" data-canvas-markdown-text-stats aria-label="Markdown 字数统计">${escapeHtml(formatCanvasMarkdownTextStats(state.text))}</output>
  </div>`;
}

export function renderCanvasMarkdownFullscreen(node = {}, options = {}) {
  const state = normalizeCanvasMarkdownEditorState(node, options);
  if (!state.fullscreen.open) return "";
  const nodeId = escapeAttr(state.nodeId);
  const titleId = `canvas-markdown-fullscreen-title-${domIdFragment(state.nodeId)}`;
  const mode = state.fullscreen.viewMode;
  const copied = options.copied === true;
  const preview = typeof options.renderPreview === "function"
    ? String(options.renderPreview(state.text) ?? "")
    : `<div class="canvas-markdown-fullscreen-plaintext">${escapeHtml(state.text).replace(/\n/g, "<br />")}</div>`;
  const body = mode === "edit"
    ? `<textarea class="canvas-markdown-fullscreen-textarea" data-canvas-markdown-fullscreen-input data-node-id="${nodeId}" aria-label="Markdown 全屏编辑器" spellcheck="false">${escapeHtml(state.text)}</textarea>`
    : `<div class="canvas-markdown-fullscreen-preview" data-canvas-markdown-fullscreen-preview aria-label="Markdown 全屏预览">${preview || '<div class="canvas-markdown-fullscreen-empty">暂无内容</div>'}</div>`;
  return `<div class="canvas-markdown-fullscreen" data-canvas-markdown-fullscreen data-node-id="${nodeId}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
    <button class="canvas-markdown-fullscreen-backdrop" type="button" data-action="toggle-canvas-markdown-fullscreen" data-node-id="${nodeId}" aria-label="关闭全屏编辑"></button>
    <section class="canvas-markdown-fullscreen-panel">
      <header>
        <strong id="${titleId}">${escapeHtml(state.title)}</strong>
        <div class="canvas-markdown-fullscreen-actions" role="toolbar" aria-label="Markdown 全屏操作">
          ${renderModeButton("set-canvas-markdown-fullscreen-mode", nodeId, "edit", mode, "编辑")}
          ${renderModeButton("set-canvas-markdown-fullscreen-mode", nodeId, "preview", mode, "预览")}
          <button type="button" data-action="copy-canvas-markdown-text" data-node-id="${nodeId}" aria-label="${copied ? "已复制" : "复制文本"}" title="${copied ? "已复制" : "复制文本"}">${copied ? "已复制" : "复制"}</button>
          <button type="button" data-action="toggle-canvas-markdown-fullscreen" data-node-id="${nodeId}" aria-label="关闭全屏编辑" title="关闭全屏编辑">关闭</button>
        </div>
      </header>
      <div class="canvas-markdown-fullscreen-body">${body}</div>
      <footer><output data-canvas-markdown-text-stats>${escapeHtml(formatCanvasMarkdownTextStats(state.text))}</output></footer>
    </section>
  </div>`;
}

function renderModeButton(action, nodeId, mode, activeMode, label) {
  const active = mode === activeMode;
  return `<button type="button" class="${active ? "active" : ""}" data-action="${action}" data-node-id="${nodeId}" data-mode="${mode}" aria-pressed="${active}">${label}</button>`;
}

function canvasMarkdownTextToHtml(text) {
  return normalizeLineEndings(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function canvasMarkdownHtmlToText(html) {
  return decodeHtmlEntities(String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n"))
    .trim();
}

function decodeHtmlEntities(value) {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hexadecimal, named) => {
    if (decimal || hexadecimal) {
      const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[named.toLowerCase()] ?? entity;
  });
}

function normalizeLineEndings(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

function firstText(...values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) ?? "";
}

function domIdFragment(value) {
  const token = encodeURIComponent(String(value ?? "")).replace(/%/g, "-");
  return token || "node";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
  })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/["']/g, (character) => (character === '"' ? "&quot;" : "&#39;"));
}
