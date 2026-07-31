import { disabled, escapeAttr, escapeHtml } from "./markup.js";

export function renderSelectionPickerModal({
  show = false,
  id = "selection-picker",
  title = "选择内容",
  tabs = [],
  activeTab = "",
  sourceTabs = [],
  activeSource = "",
  items = [],
  selectedId = "",
  emptyLabel = "暂无可选内容",
  closeAction = "close-selection-picker",
  tabAction = "set-selection-picker-tab",
  sourceAction = "set-selection-picker-source",
  selectAction = "select-selection-picker-item",
  confirmAction = "confirm-selection-picker",
  confirmLabel = "确认",
  secondaryConfirmAction = "",
  secondaryConfirmLabel = "",
  secondaryConfirmDisabled = false,
} = {}) {
  if (!show) {
    return "";
  }
  const safeTabs = Array.isArray(tabs) ? tabs.filter((tab) => tab?.id && tab?.label) : [];
  const safeActiveTab = safeTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : String(safeTabs[0]?.id ?? "");
  const safeSourceTabs = Array.isArray(sourceTabs) ? sourceTabs.filter((tab) => tab?.id && tab?.label) : [];
  const safeActiveSource = safeSourceTabs.some((tab) => tab.id === activeSource)
    ? activeSource
    : String(safeSourceTabs[0]?.id ?? "");
  const visibleItems = (Array.isArray(items) ? items : [])
    .filter((item) => (!safeActiveSource || item?.sourceGroup === safeActiveSource)
      && (!safeActiveTab || item?.group === safeActiveTab));
  const titleId = `${id}-title`;
  return `
    <section class="selection-picker-layer" data-selection-picker-id="${escapeAttr(id)}">
      <button class="selection-picker-scrim" type="button" data-action="${escapeAttr(closeAction)}" aria-label="关闭${escapeAttr(title)}"></button>
      <div class="selection-picker-modal ${safeSourceTabs.length ? "has-source-tabs" : ""}" role="dialog" aria-modal="true" aria-labelledby="${escapeAttr(titleId)}">
        <header class="selection-picker-header">
          <div>
            <span>SELECT</span>
            <h2 id="${escapeAttr(titleId)}">${escapeHtml(title)}</h2>
          </div>
          <button class="selection-picker-close" type="button" data-action="${escapeAttr(closeAction)}" aria-label="关闭" title="关闭">×</button>
        </header>
        ${safeSourceTabs.length ? `
          <nav class="selection-picker-source-tabs" role="tablist" aria-label="${escapeAttr(title)}来源">
            ${safeSourceTabs.map((tab) => `
              <button
                class="${tab.id === safeActiveSource ? "active" : ""}"
                type="button"
                role="tab"
                aria-selected="${tab.id === safeActiveSource ? "true" : "false"}"
                data-action="${escapeAttr(sourceAction)}"
                data-picker-source="${escapeAttr(tab.id)}"
              >${escapeHtml(tab.label)}</button>
            `).join("")}
          </nav>
        ` : ""}
        ${safeTabs.length ? `
          <nav class="selection-picker-tabs" role="tablist" aria-label="${escapeAttr(title)}分类">
            ${safeTabs.map((tab) => `
              <button
                class="${tab.id === safeActiveTab ? "active" : ""}"
                type="button"
                role="tab"
                aria-selected="${tab.id === safeActiveTab ? "true" : "false"}"
                data-action="${escapeAttr(tabAction)}"
                data-picker-tab="${escapeAttr(tab.id)}"
              >
                <span>${escapeHtml(tab.label)}</span>
                <small>${Math.max(0, Number(tab.count) || 0)}</small>
              </button>
            `).join("")}
          </nav>
        ` : ""}
        <div class="selection-picker-content" role="listbox" aria-label="${escapeAttr(title)}列表">
          ${visibleItems.length
            ? visibleItems.map((item) => renderSelectionPickerItem(item, {
                selected: String(item.id) === String(selectedId),
                selectAction,
              })).join("")
            : renderSelectionPickerEmpty(emptyLabel)}
        </div>
        <footer class="selection-picker-footer">
          <button class="selection-picker-cancel" type="button" data-action="${escapeAttr(closeAction)}">取消</button>
          ${secondaryConfirmAction && secondaryConfirmLabel ? `<button class="selection-picker-cancel selection-picker-secondary-confirm" type="button" data-action="${escapeAttr(secondaryConfirmAction)}" ${disabled(!selectedId || secondaryConfirmDisabled)}>${escapeHtml(secondaryConfirmLabel)}</button>` : ""}
          <button class="selection-picker-confirm" type="button" data-action="${escapeAttr(confirmAction)}" ${disabled(!selectedId)}>${escapeHtml(confirmLabel)}</button>
        </footer>
      </div>
    </section>
  `;
}

export function syncSelectionPickerSelection(root, {
  pickerId = "",
  selectedId = "",
  secondaryConfirmDisabled = false,
} = {}) {
  const layers = [...(root?.querySelectorAll?.("[data-selection-picker-id]") ?? [])];
  const layer = layers.find((item) => String(item?.dataset?.selectionPickerId ?? "") === String(pickerId));
  if (!layer) {
    return false;
  }
  for (const item of layer.querySelectorAll?.("[data-picker-item-id]") ?? []) {
    const selected = String(item?.dataset?.pickerItemId ?? "") === String(selectedId);
    item.classList?.toggle?.("active", selected);
    item.setAttribute?.("aria-selected", selected ? "true" : "false");
  }
  const confirm = layer.querySelector?.(".selection-picker-confirm");
  if (confirm) {
    confirm.disabled = !selectedId;
  }
  const secondaryConfirm = layer.querySelector?.(".selection-picker-secondary-confirm");
  if (secondaryConfirm) {
    secondaryConfirm.disabled = !selectedId || secondaryConfirmDisabled;
  }
  return true;
}

export function syncSelectionPickerTab(root, {
  pickerId = "",
  activeTab = "",
  items = [],
  selectedId = "",
  selectAction = "select-selection-picker-item",
  emptyLabel = "暂无可选内容",
} = {}) {
  const layers = [...(root?.querySelectorAll?.("[data-selection-picker-id]") ?? [])];
  const layer = layers.find((item) => String(item?.dataset?.selectionPickerId ?? "") === String(pickerId));
  const content = layer?.querySelector?.(".selection-picker-content");
  if (!layer || !content) return false;
  for (const tab of layer.querySelectorAll?.("[data-picker-tab]") ?? []) {
    const active = String(tab?.dataset?.pickerTab ?? "") === String(activeTab);
    tab.classList?.toggle?.("active", active);
    tab.setAttribute?.("aria-selected", active ? "true" : "false");
  }
  const visibleItems = (Array.isArray(items) ? items : [])
    .filter((item) => !activeTab || item?.group === activeTab);
  content.innerHTML = visibleItems.length
    ? visibleItems.map((item) => renderSelectionPickerItem(item, {
        selected: String(item.id) === String(selectedId),
        selectAction,
      })).join("")
    : renderSelectionPickerEmpty(emptyLabel);
  content.scrollTop = 0;
  syncSelectionPickerSelection(root, { pickerId, selectedId });
  return true;
}

function renderSelectionPickerItem(item, { selected = false, selectAction = "select-selection-picker-item" } = {}) {
  const previewUrl = String(item.previewUrl ?? "").trim();
  const previewUrls = [...new Set((Array.isArray(item.previewUrls) ? item.previewUrls : [])
    .map((url) => String(url ?? "").trim())
    .filter(Boolean))].slice(0, 4);
  return `
    <button
      class="selection-picker-item ${selected ? "active" : ""}"
      type="button"
      role="option"
      aria-selected="${selected ? "true" : "false"}"
      data-action="${escapeAttr(selectAction)}"
      data-picker-item-id="${escapeAttr(item.id)}"
    >
      ${previewUrls.length > 1
        ? `<span class="selection-picker-item-gallery" aria-hidden="true">${previewUrls.map((url) => `<img src="${escapeAttr(url)}" alt="" loading="lazy" />`).join("")}</span>`
        : previewUrl
        ? `<img src="${escapeAttr(previewUrl)}" alt="" loading="lazy" />`
        : `<span class="selection-picker-item-icon" aria-hidden="true">✦</span>`}
      <span class="selection-picker-item-copy">
        <strong>${escapeHtml(item.label ?? "未命名")}</strong>
        ${item.description ? `<small>${escapeHtml(item.description)}</small>` : ""}
      </span>
      ${item.meta ? `<em>${escapeHtml(item.meta)}</em>` : ""}
      <span class="selection-picker-item-check" aria-hidden="true">✓</span>
    </button>
  `;
}

function renderSelectionPickerEmpty(label) {
  return `
    <div class="selection-picker-empty">
      <span aria-hidden="true">✦</span>
      <strong>${escapeHtml(label)}</strong>
    </div>
  `;
}
