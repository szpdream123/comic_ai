function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const CHROME_ICON_PATHS = {
  plus: '<path d="M12 5v14M5 12h14" />',
  cursor: '<path d="m5 3 13 7-6 2-2 7L5 3Z" />',
  hand: '<path d="M8 11V6a1.5 1.5 0 0 1 3 0v4-5a1.5 1.5 0 0 1 3 0v5-4a1.5 1.5 0 0 1 3 0v6.5c0 4.1-2.2 6.5-6 6.5-2.7 0-4.6-1.2-6.2-3.2L4.2 13a1.5 1.5 0 0 1 2.2-2.1L8 12.5" />',
  home: '<path d="m4 11 8-7 8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" />',
  layers: '<path d="m12 4 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4" /><path d="m4 16 8 4 8-4" />',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" />',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /><path d="m4.9 4.9 1.4 1.4M17.7 17.7l1.4 1.4M4 12H2M22 12h-2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M12 4V2M12 22v-2" />',
  character: '<circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" />',
  media: '<rect x="4" y="5" width="16" height="14" rx="2" /><path d="m8 15 3-3 2 2 2-2 3 3" />',
  sparkle: '<path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z" /><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" />',
};

function renderChromeIcon(name, options = {}) {
  const path = CHROME_ICON_PATHS[name] ?? CHROME_ICON_PATHS.sparkle;
  const label = options.label ? ` aria-label="${escapeHtml(options.label)}"` : "";
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="${label ? "false" : "true"}"${label}>${path}</svg>`;
}

export function renderNewCanvasChromeRail(ui = {}) {
  const actions = [
    ["toggle-canvas-add-menu", "plus", "添加节点"],
    ["set-canvas-sidebar-mode", "layers", "资产", "assets"],
    ["set-canvas-sidebar-mode", "history", "输出历史", "history"],
  ];
  const interactionMode = ui.canvasDocument?.viewport?.interactionMode === "hand" ? "hand" : "default";
  const interactionIcon = interactionMode === "hand" ? "hand" : "cursor";
  const interactionLabel = interactionMode === "hand" ? "抓手工具" : "移动";
  return `<nav class="new-canvas-chrome-rail" aria-label="画布功能">
      ${actions.map(([action, icon, label, sidebarMode], index) => action === "set-canvas-sidebar-mode"
        ? `<button type="button" class="new-canvas-chrome-tool" data-action="${action}" data-canvas-sidebar-mode="${escapeHtml(sidebarMode)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${renderChromeIcon(icon)}</button>`
        : `<button type="button" class="new-canvas-chrome-tool ${index === 0 ? "is-primary" : ""}" data-action="${action}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${renderChromeIcon(icon)}</button>`).join("")}
      <details class="new-canvas-chrome-tool-menu">
        <summary class="new-canvas-chrome-tool new-canvas-interaction-tool is-active" data-interaction-mode="${interactionMode}" aria-label="${escapeHtml(interactionLabel)}" title="${escapeHtml(interactionLabel)}">${renderChromeIcon(interactionIcon)}<span>${escapeHtml(interactionLabel)}</span></summary>
        <div class="new-canvas-tool-menu-popover" role="menu" aria-label="画布交互工具">
          <button type="button" class="new-canvas-tool-menu-item ${interactionMode === "default" ? "is-active" : ""}" data-action="set-canvas-interaction-mode" data-interaction-mode="default" role="menuitemradio" aria-checked="${interactionMode === "default"}" title="移动">
            ${renderChromeIcon("cursor")}<span>移动</span><kbd>V</kbd>
          </button>
          <button type="button" class="new-canvas-tool-menu-item ${interactionMode === "hand" ? "is-active" : ""}" data-action="set-canvas-interaction-mode" data-interaction-mode="hand" role="menuitemradio" aria-checked="${interactionMode === "hand"}" title="抓手工具">
            ${renderChromeIcon("hand")}<span>抓手工具</span><kbd>H</kbd>
          </button>
        </div>
      </details>
      <span class="new-canvas-chrome-separator" aria-hidden="true"></span>
      <button type="button" class="new-canvas-chrome-tool" data-character-action="open" aria-label="角色库" title="角色库">${renderChromeIcon("character")}</button>
    </nav>`;
}

export function renderNewCanvasChrome(ui = {}) {
  const savedState = ui.canvasSaving === true
    ? "保存中"
    : ui.canvasSaveError
      ? "保存失败"
      : "已同步";
  return `
    <header class="new-canvas-chrome" data-new-canvas-chrome aria-label="AI Canvas 工具栏">
      <div class="new-canvas-chrome-brand">
        <button type="button" class="new-canvas-chrome-library" data-action="back-to-canvas-projects" aria-label="画布库" title="画布库">
          ${renderChromeIcon("home")}
          <span>画布库</span>
        </button>
      </div>
      <div class="new-canvas-chrome-status" role="status" aria-live="polite">
        <i aria-hidden="true"></i>${escapeHtml(savedState)}
      </div>
    </header>
  `;
}
