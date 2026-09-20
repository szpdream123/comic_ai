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
  layout = "list",
  hideFooter = false,
  headerAction = "",
  headerActionLabel = "",
  clearAction = "",
  clearActionLabel = "",
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
  const isCardLayout = layout === "card";
  return `
    <section class="selection-picker-layer" data-selection-picker-id="${escapeAttr(id)}">
      <button class="selection-picker-scrim" type="button" data-action="${escapeAttr(closeAction)}" aria-label="关闭${escapeAttr(title)}"></button>
      <div class="selection-picker-modal${safeSourceTabs.length ? " has-source-tabs" : ""}${isCardLayout ? " is-card-layout" : ""}${hideFooter ? " is-footerless" : ""}" role="dialog" aria-modal="true" aria-labelledby="${escapeAttr(titleId)}">
        <header class="selection-picker-header">
          <div class="selection-picker-header-copy">
            ${isCardLayout ? "" : "<span>SELECT</span>"}
            <h2 id="${escapeAttr(titleId)}">${escapeHtml(title)}</h2>
          </div>
          <div class="selection-picker-header-actions">
            ${clearAction ? `<button class="selection-picker-header-clear" type="button" data-action="${escapeAttr(clearAction)}" aria-label="${escapeAttr(clearActionLabel || "清除画风")}" title="${escapeAttr(clearActionLabel || "清除画风")}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21H3v-4z"/><path d="M14 6l4 4"/></svg></button>` : ""}
            ${headerAction && headerActionLabel ? `<button class="selection-picker-header-action" type="button" data-action="${escapeAttr(headerAction)}" aria-label="${escapeAttr(headerActionLabel)}" title="${escapeAttr(headerActionLabel)}">${isCardLayout ? "+" : escapeHtml(headerActionLabel)}</button>` : ""}
            <button class="selection-picker-close" type="button" data-action="${escapeAttr(closeAction)}" aria-label="关闭" title="关闭">×</button>
          </div>
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
        <div class="selection-picker-content ${isCardLayout ? "is-card-grid" : ""}" role="listbox" aria-label="${escapeAttr(title)}列表">
          ${visibleItems.length
            ? visibleItems.map((item) => renderSelectionPickerItem(item, {
                selected: String(item.id) === String(selectedId),
                selectAction,
                layout,
              })).join("")
            : renderSelectionPickerEmpty(emptyLabel)}
        </div>
        ${hideFooter ? "" : `<footer class="selection-picker-footer">
          <button class="selection-picker-cancel" type="button" data-action="${escapeAttr(closeAction)}">取消</button>
          ${secondaryConfirmAction && secondaryConfirmLabel ? `<button class="selection-picker-cancel selection-picker-secondary-confirm" type="button" data-action="${escapeAttr(secondaryConfirmAction)}" ${disabled(!selectedId || secondaryConfirmDisabled)}>${escapeHtml(secondaryConfirmLabel)}</button>` : ""}
          <button class="selection-picker-confirm" type="button" data-action="${escapeAttr(confirmAction)}" ${disabled(!selectedId)}>${escapeHtml(confirmLabel)}</button>
        </footer>`}
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
  layout = "list",
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
        layout,
      })).join("")
    : renderSelectionPickerEmpty(emptyLabel);
  content.scrollTop = 0;
  syncSelectionPickerSelection(root, { pickerId, selectedId });
  return true;
}

function renderSelectionPickerItem(item, { selected = false, selectAction = "select-selection-picker-item", layout = "list" } = {}) {
  const previewUrl = String(item.previewUrl ?? "").trim();
  const previewUrls = [...new Set((Array.isArray(item.previewUrls) ? item.previewUrls : [])
    .map((url) => String(url ?? "").trim())
    .filter(Boolean))].slice(0, 4);
  if (layout === "card") {
    return `
      <button
        class="selection-picker-item selection-picker-card ${selected ? "active" : ""} ${previewUrl || previewUrls.length ? "has-preview" : "no-preview"}"
        type="button"
        role="option"
        aria-selected="${selected ? "true" : "false"}"
        data-action="${escapeAttr(selectAction)}"
        data-picker-item-id="${escapeAttr(item.id)}"
      >
        <span class="selection-picker-card-media" aria-hidden="true">
          ${previewUrl
            ? `<img src="${escapeAttr(previewUrl)}" alt="" loading="lazy" />`
            : previewUrls[0]
            ? `<img src="${escapeAttr(previewUrls[0])}" alt="" loading="lazy" />`
            : `<span class="selection-picker-card-placeholder"></span>`}
          <strong class="selection-picker-card-name">${escapeHtml(item.label ?? "未命名")}</strong>
        </span>
        ${item.description ? `<small class="selection-picker-card-desc">${escapeHtml(item.description)}</small>` : ""}
      </button>
    `;
  }
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

export function renderImageStyleCreateModal(source = {}, scope = "asset") {
  const open = source.imageStyleCreateOpen === true || source.assetImageStyleCreateOpen === true;
  if (!open) {
    return "";
  }
  const draft = (source.imageStyleCreateDraft && typeof source.imageStyleCreateDraft === "object"
    ? source.imageStyleCreateDraft
    : source.assetImageStyleCreateDraft && typeof source.assetImageStyleCreateDraft === "object"
      ? source.assetImageStyleCreateDraft
      : {});
  const name = String(draft.name ?? "");
  const prompt = String(draft.prompt ?? "");
  const previewUrl = String(draft.previewUrl ?? draft.coverImageUrl ?? "").trim();
  const closeAction = scope === "batch" ? "close-episode-batch-style-create-modal" : "close-asset-image-style-create-modal";
  const saveAction = scope === "batch" ? "save-episode-batch-style-create" : "save-asset-image-style-create";
  const uploadAction = scope === "batch" ? "upload-episode-batch-style-cover" : "upload-asset-image-style-cover";
  return `
    <section class="selection-picker-layer image-style-create-layer" data-image-style-create-scope="${escapeAttr(scope)}">
      <button class="selection-picker-scrim" type="button" data-action="${escapeAttr(closeAction)}" aria-label="关闭添加自定义画风"></button>
      <div class="image-style-create-modal" role="dialog" aria-modal="true" aria-labelledby="image-style-create-title">
        <header class="image-style-create-header">
          <h2 id="image-style-create-title">添加自定义画风</h2>
          <button class="selection-picker-close" type="button" data-action="${escapeAttr(closeAction)}" aria-label="关闭" title="关闭">×</button>
        </header>
        <div class="image-style-create-body">
          <label class="image-style-create-thumb ${previewUrl ? "has-preview" : ""}">
            ${previewUrl
              ? `<img src="${escapeAttr(previewUrl)}" alt="" />`
              : `<span class="image-style-create-thumb-placeholder"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg><span>点击上传缩略图</span></span>`}
            <input type="file" accept="image/*" hidden data-action="${escapeAttr(uploadAction)}" />
          </label>
          <label class="image-style-create-label">画风名称</label>
          <input class="image-style-create-input" type="text" maxlength="80" placeholder="例如：赛博朋克" value="${escapeAttr(name)}" data-image-style-create-field="name" />
          <label class="image-style-create-label">提示词</label>
          <textarea class="image-style-create-textarea" rows="3" maxlength="50000" placeholder="输入该画风对应的提示词，生成时会自动附加到主提示词中" data-image-style-create-field="prompt">${escapeHtml(prompt)}</textarea>
          <div class="image-style-create-actions">
            <button class="image-style-create-cancel" type="button" data-action="${escapeAttr(closeAction)}">取消</button>
            <button class="image-style-create-save" type="button" data-action="${escapeAttr(saveAction)}" ${disabled(!name.trim())}>保存</button>
          </div>
        </div>
      </div>
    </section>
  `;
}
