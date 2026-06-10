import { escapeAttr, escapeHtml, disabled } from "./markup.js";

export function renderAssetExtractModal({
  activeTab = "script-upload",
  show = false,
  uploadNotice = "",
  busy = false,
  submitAction = "import-script-document",
  submitLabel = "创建剧本",
  mode = "full",
  defaultScript = "",
  lookControlsHtml = "",
  scriptUploadFileName = "",
} = {}) {
  if (!show) {
    return "";
  }
  const manualOnly = mode === "manual";
  const uploadOnly = mode === "upload";
  const safeActiveTab = manualOnly
    ? "script-library"
    : uploadOnly
      ? "script-upload"
      : (activeTab === "script-library" ? activeTab : "script-upload");

  return `
    <section class="modal-backdrop" role="dialog" aria-modal="true" aria-label="上传剧本">
      <div class="script-modal upload-studio-modal">
        <div class="modal-tabs">
          ${uploadOnly ? "" : renderTab(safeActiveTab, "script-library", "手动创作")}
          ${manualOnly ? "" : renderTab(safeActiveTab, "script-upload", "剧本上传")}
          <button class="modal-close upload-modal-close" type="button" data-action="close-script-modal" aria-label="关闭">×</button>
        </div>
        ${renderBody(safeActiveTab, { defaultScript, lookControlsHtml, scriptUploadFileName })}
        <div class="modal-actions upload-modal-actions">
          <p class="modal-inline-status">${escapeHtml(uploadNotice)}</p>
          <button
            id="create-project-button"
            class="primary-action upload-confirm-button"
            type="button"
            data-action="${escapeHtml(submitAction)}"
            ${disabled(busy)}
          >
            ${escapeHtml(submitLabel)}
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderTab(activeTab, tab, label) {
  return `
    <button class="modal-tab ${activeTab === tab ? "active" : ""}" type="button" data-action="switch-script-tab" data-tab="${tab}">
      ${label}
    </button>
  `;
}

function renderBody(activeTab, options = {}) {
  if (activeTab === "script-library") {
    return `
      <div class="modal-panel library-empty upload-library-panel">
        ${renderManualScriptField(options.defaultScript)}
        ${options.lookControlsHtml ? `<div class="script-manual-look-controls">${options.lookControlsHtml}</div>` : ""}
      </div>
    `;
  }

  return renderScriptUploadPanel(options);
}

function renderManualScriptField(value = "") {
  return `
    <label class="script-manual-field">
      <textarea
        id="manual-script-input"
        maxlength="5000"
        placeholder="${escapeAttr("例如：深夜暴雨中，女主在便利店门口第一次遇见失忆的男主，空气里有霓虹反光和一点危险感。")}"
      >${escapeHtml(value)}</textarea>
      <span class="script-manual-count">${[...value].length}/5000</span>
    </label>
  `;
}

function renderScriptUploadPanel(options = {}) {
  return `
    <div class="modal-panel upload-panel-stack">
      <p class="upload-tip-line">
        <span class="upload-tip-icon" aria-hidden="true">✦</span>
        请将小说中的章节（如“第一章”“第二章”等）清晰分隔，有助于提升拆解的准确性。本功能支持 3,000 字至 100 万字的小说内容。
      </p>
      ${renderUploadZone({
        title: "点击上传或直接拖拽剧本文档至框体内",
        formats: "支持 docx/txt 格式",
        icon: "script",
        action: "pick-script-upload-file",
        dropzone: "script-upload",
        fileName: options.scriptUploadFileName,
      })}
    </div>
  `;
}

function renderUploadZone({ title, formats, icon, className = "", action = "", dropzone = "", fileName = "" }) {
  const classes = ["upload-dropzone", className].filter(Boolean).join(" ");
  const actionAttr = action ? ` data-action="${escapeAttr(action)}"` : "";
  const dropzoneAttr = dropzone ? ` data-dropzone="${escapeAttr(dropzone)}"` : "";
  const safeFileName = String(fileName ?? "").trim();
  return `
    <button class="${classes}" type="button"${actionAttr}${dropzoneAttr}>
      <span class="upload-dropzone-icon ${icon}" aria-hidden="true">${renderUploadGlyph()}</span>
      <strong>${escapeHtml(title)}</strong>
      <span>${safeFileName ? `已选择：${escapeHtml(safeFileName)}` : escapeHtml(formats)}</span>
      ${dropzone === "script-upload" ? `
        <input
          class="script-upload-file-input"
          type="file"
          accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          data-action="select-script-upload-file"
          hidden
        />
      ` : ""}
    </button>
  `;
}

function renderUploadGlyph() {
  return `
    <svg viewBox="0 0 48 48" focusable="false">
      <path d="M15 8h11l9 9v23a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3Z" />
      <path d="M26 8v10h10" />
      <path d="M24 35V22" />
      <path d="m19 27 5-5 5 5" />
      <path d="M17 38h14" />
    </svg>
  `;
}
